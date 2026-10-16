/* ============================================================================
   F1 暗夜车库实景 3D —— 法拉利 F1-75（蒙扎涂装）× 红牛 RB21
   场景与涂装对照实拍照片还原：链条吊灯车库 / 高反水泥地 / 1:1 实车比例
   纯程序化建模，three.js r128（全局版），零外部资源，可直接 file:// 打开
   功能：360° 环绕 / 驾驶舱第一视角（动态仪表）/ X 光透视 / 引擎拆解分层
   ========================================================================== */
(function () {
'use strict';

/* ---------------------------------------------------------------- 基础 ---- */
var canvas = document.getElementById('stage');
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
var MAX_ANISO = renderer.capabilities.getMaxAnisotropy();

var scene = new THREE.Scene();
scene.background = new THREE.Color(0x07080c);
scene.fog = new THREE.Fog(0x07080c, 15, 46);

var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.02, 400);
camera.position.set(16, 8.5, 21);

/* 环境反射贴图（PMREM）：车库 / 赛道正午·黄昏·夜战 */
var envGarage, envTrack, envSunset, envNight;
(function buildEnvMaps() {
  var pm = new THREE.PMREMGenerator(renderer);
  /* 车库：黑场 + 头顶灯管条 */
  var g = new THREE.Scene();
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x030405, side: THREE.BackSide })));
  function strip(x, y, z, ry) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.14, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xc9d4e4 }));
    m.position.set(x, y, z); m.rotation.y = ry;
    g.add(m);
  }
  strip(-3.5, 5.0, 1.5, 0.4); strip(0.5, 5.6, -1.0, -0.2);
  strip(3.4, 5.2, 1.2, 0.7);  strip(-1.0, 4.6, -3.0, 1.2);
  strip(2.0, 4.8, 3.0, -0.8);
  var bounce = new THREE.Mesh(new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ color: 0x16140f }));
  bounce.rotation.x = Math.PI / 2; bounce.position.y = -0.01;
  g.add(bounce);
  envGarage = pm.fromScene(g, 0.035).texture;
  /* 赛道通用构建：天空色 / 太阳色+位置 / 地面色 */
  function trackEnv(sky, sunCol, sunPos, ground, blur) {
    var t = new THREE.Scene();
    t.add(new THREE.Mesh(new THREE.SphereGeometry(12, 16, 12),
      new THREE.MeshBasicMaterial({ color: sky, side: THREE.BackSide })));
    var sunBall = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10),
      new THREE.MeshBasicMaterial({ color: sunCol }));
    sunBall.position.set(sunPos[0], sunPos[1], sunPos[2]);
    t.add(sunBall);
    var sand = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
      new THREE.MeshBasicMaterial({ color: ground }));
    sand.rotation.x = -Math.PI / 2; sand.position.y = -0.5;
    t.add(sand);
    return pm.fromScene(t, blur || 0.045).texture;
  }
  envTrack = trackEnv(0x86add4, 0xfff2cf, [6, 8, -3], 0x8a6e46);
  envSunset = trackEnv(0x5a3a52, 0xff9a4e, [7, 2.2, -3], 0x5a4330, 0.05);
  envNight = trackEnv(0x0a0e1c, 0x3a4a6e, [-6, 6, 4], 0x14110c, 0.05);
  pm.dispose();
})();
scene.environment = envTrack;

/* 灯光（参数随场景切换）：主灯（投影）+ 轮廓光 + 补光 + 半球光 */
var hemi = new THREE.HemisphereLight(0xaabdda, 0x0c0a08, 0.17);
scene.add(hemi);
var key = new THREE.DirectionalLight(0xeef1f6, 0.9);
key.position.set(4.5, 7.5, 8.5);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.left = -8.5; key.shadow.camera.right = 8.5;    // 三车并排，阴影范围加宽
key.shadow.camera.top = 8.5;  key.shadow.camera.bottom = -8.5;
key.shadow.camera.near = 1; key.shadow.camera.far = 30;
key.shadow.bias = -0.0003; key.shadow.normalBias = 0.02;
scene.add(key);
var rim = new THREE.DirectionalLight(0x6f8cff, 0.34); rim.position.set(-6, 4.5, -8); scene.add(rim);
var fill = new THREE.DirectionalLight(0xffd9b8, 0.10); fill.position.set(-7, 3, 8); scene.add(fill);

/* ---------------------------------------------------------- 通用工具 ---- */
var V_X = new THREE.Vector3(1, 0, 0);
var V_Y = new THREE.Vector3(0, 1, 0);

function stdMat(color, rough, metal, opt) {
  var m = new THREE.MeshStandardMaterial({ color: color, roughness: rough, metalness: metal });
  if (opt) Object.keys(opt).forEach(function (k) { m[k] = opt[k]; });
  return m;
}
function phyMat(color, rough, metal, cc, ccr, opt) {
  var m = new THREE.MeshPhysicalMaterial({
    color: color, roughness: rough, metalness: metal,
    clearcoat: cc, clearcoatRoughness: ccr });
  if (opt) Object.keys(opt).forEach(function (k) { m[k] = opt[k]; });
  return m;
}
function mesh(geo, mat, x, y, z) {
  var m = new THREE.Mesh(geo, mat);
  if (x !== undefined) m.position.set(x, y, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function box(w, h, d, mat, x, y, z) { return mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z); }
/* 连接两点的圆杆（悬挂、支柱） */
function rod(ax, ay, az, bx, by, bz, r, mat, blade) {
  var a = new THREE.Vector3(ax, ay, az), b = new THREE.Vector3(bx, by, bz);
  var d = new THREE.Vector3().subVectors(b, a), len = d.length();
  var m = mesh(new THREE.CylinderGeometry(r, r, len, 10), mat);
  m.position.copy(a).addScaledVector(d, 0.5);
  m.quaternion.setFromUnitVectors(V_Y, d.clone().normalize());
  if (blade) m.scale.z = 0.45;
  return m;
}
/* 沿控制点的弯管（排气、油路） */
function pipe(points, r, mat, seg) {
  var pts = points.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); });
  var curve = new THREE.CatmullRomCurve3(pts);
  return mesh(new THREE.TubeGeometry(curve, seg || 32, r, 10, false), mat);
}
function canvasTex(w, h, draw) {
  var c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  var t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding; t.anisotropy = MAX_ANISO;
  return t;
}
/* 透明文字贴花平面 */
function decal(text, wWorld, hWorld, opt) {
  opt = opt || {};
  var tex = canvasTex(opt.cw || 512, opt.ch || 128, function (x, w, h) {
    x.clearRect(0, 0, w, h);
    x.font = (opt.italic ? 'italic ' : '') + (opt.weight || 900) + ' ' +
             (opt.size || 86) + 'px ' + (opt.font || '"Arial Black", Arial, "PingFang SC", sans-serif');
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (opt.stroke) { x.lineWidth = (opt.size || 86) / 8; x.strokeStyle = opt.stroke; x.strokeText(text, w / 2, h / 2); }
    x.fillStyle = opt.color || '#ffffff';
    x.fillText(text, w / 2, h / 2);
  });
  var m = new THREE.Mesh(
    new THREE.PlaneGeometry(wWorld, hWorld),
    new THREE.MeshBasicMaterial({
      map: tex, transparent: true, side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, depthWrite: false }));
  m.castShadow = false; m.receiveShadow = false;
  m.userData.isDecal = true;
  return m;
}
/* 部件标注贴图（中英双语切换共用） */
function labelTex(text, accentCss) {
  return canvasTex(384, 96, function (x, w, h) {
    function rr(a, b, ww, hh, r) {
      x.beginPath();
      x.moveTo(a + r, b); x.arcTo(a + ww, b, a + ww, b + hh, r); x.arcTo(a + ww, b + hh, a, b + hh, r);
      x.arcTo(a, b + hh, a, b, r); x.arcTo(a, b, a + ww, b, r); x.closePath();
    }
    rr(4, 10, w - 8, h - 20, 18);
    x.fillStyle = 'rgba(8,10,18,0.85)'; x.fill();
    x.lineWidth = 3; x.strokeStyle = accentCss || 'rgba(255,255,255,0.45)'; x.stroke();
    var size = text.length > 16 ? 30 : 36;
    x.font = '600 ' + size + 'px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#f5f7ff'; x.fillText(text, w / 2, h / 2 + 1);
  });
}
/* 始终面向相机的悬浮标签（内置中英两套贴图） */
function partLabel(textZh, textEn, accentCss) {
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: labelTex(textZh, accentCss), transparent: true, depthTest: false, toneMapped: false }));
  sp.userData.texZh = sp.material.map;
  sp.userData.texEn = labelTex(textEn, accentCss);
  sp.scale.set(0.95, 0.2375, 1);
  sp.renderOrder = 999;
  sp.userData.noRay = true;
  return sp;
}

/* 超椭圆截面放样曲面：F1 流线车身的核心（鼻锥/座舱/侧箱/引擎盖） */
function superPt(t, e) {
  var c = Math.cos(t), s = Math.sin(t);
  return [Math.sign(c) * Math.pow(Math.abs(c), e), Math.sign(s) * Math.pow(Math.abs(s), e)];
}
/* uv=true 时额外生成 UV（u 绕截面一圈，v 沿放样方向），供双色涂装贴图使用 */
function loft(secs, segs, flip, uv) {
  segs = segs || 28;
  var ring = uv ? segs + 1 : segs;          // UV 版多一列接缝顶点
  var pos = [], idx = [], uvs = [], i, j;
  for (i = 0; i < secs.length; i++) {
    var s = secs[i], e = s.e || 1;
    for (j = 0; j < ring; j++) {
      var p = superPt(j / segs * Math.PI * 2, e);
      pos.push((s.cx || 0) + p[0] * s.rx, s.cy + p[1] * s.ry, s.z);
      if (uv) uvs.push(j / segs, i / (secs.length - 1));
    }
  }
  for (i = 0; i < secs.length - 1; i++) {
    for (j = 0; j < segs; j++) {
      var jn = uv ? j + 1 : (j + 1) % segs;
      var a = i * ring + j, b = i * ring + jn,
          c2 = (i + 1) * ring + j, d = (i + 1) * ring + jn;
      if (flip) idx.push(a, c2, b, b, c2, d);
      else idx.push(a, b, c2, b, d, c2);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  if (uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (uv) {   /* 接缝两列顶点法线取平均，避免出现明暗缝 */
    var n = g.attributes.normal;
    for (i = 0; i < secs.length; i++) {
      var k0 = i * ring, k1 = k0 + segs;
      var nx = n.getX(k0) + n.getX(k1), ny = n.getY(k0) + n.getY(k1), nz = n.getZ(k0) + n.getZ(k1);
      var nl = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
      n.setXYZ(k0, nx / nl, ny / nl, nz / nl);
      n.setXYZ(k1, nx / nl, ny / nl, nz / nl);
    }
  }
  return g;
}
/* 弧形翼片：沿展向弯曲 + 弦长/迎角渐变（照片中前翼的连续曲面） */
function wingEl3D(halfSpan, chord, thick, zC, yBase, aoa, dip, tipRise, mat) {
  var nx = 13, nt = 18;
  var pos = [], idx = [], ix, it;
  for (ix = 0; ix <= nx; ix++) {
    var u = ix / nx * 2 - 1;
    var x = u * halfSpan;
    var yC = yBase - dip + (dip + tipRise) * u * u;
    var ch = chord * (1 - 0.18 * u * u) / 2;
    var th = thick / 2;
    var a = aoa * (1 - 0.25 * u * u);
    for (it = 0; it < nt; it++) {
      var t = it / nt * Math.PI * 2;
      var dzp = Math.cos(t) * ch, dyp = Math.sin(t) * th;
      var dy = dyp * Math.cos(a) + dzp * Math.sin(a);
      var dz = -dyp * Math.sin(a) + dzp * Math.cos(a);
      pos.push(x, yC + dy, zC + dz);
    }
  }
  for (ix = 0; ix < nx; ix++) {
    for (it = 0; it < nt; it++) {
      var p0 = ix * nt + it, p1 = ix * nt + (it + 1) % nt,
          p2 = (ix + 1) * nt + it, p3 = (ix + 1) * nt + (it + 1) % nt;
      idx.push(p0, p2, p1, p1, p2, p3);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return mesh(g, mat);
}

/* ------------------------------------------- 暗夜车库（参考实拍搭建） ---- */
var garageG = new THREE.Group();
scene.add(garageG);
/* 深色高反水泥地：斑驳 + 裂纹 */
var floorTex = canvasTex(1024, 1024, function (x, w, h) {
  x.fillStyle = '#131418'; x.fillRect(0, 0, w, h);
  for (var i = 0; i < 260; i++) {
    var r = 18 + Math.random() * 110;
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '34,36,42' : '10,11,14') + ',0.05)';
    x.fill();
  }
  x.strokeStyle = 'rgba(6,7,9,0.5)'; x.lineWidth = 1.4;
  for (var c = 0; c < 7; c++) {
    x.beginPath();
    var px = Math.random() * w, py = Math.random() * h;
    x.moveTo(px, py);
    for (var s = 0; s < 6; s++) { px += (Math.random() - 0.5) * 260; py += (Math.random() - 0.5) * 260; x.lineTo(px, py); }
    x.stroke();
  }
});
floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
floorTex.repeat.set(3, 3);
var floorMat = phyMat(0x2b2d33, 0.5, 0.08, 0.18, 0.55, { envMapIntensity: 0.22 });
floorMat.map = floorTex;
var ground = mesh(new THREE.PlaneGeometry(34, 28), floorMat, 0, 0, 0);
ground.rotation.x = -Math.PI / 2;
ground.castShadow = false;
garageG.add(ground);

/* 斑驳水泥墙 + 黑顶 */
var wallTex = canvasTex(1024, 512, function (x, w, h) {
  x.fillStyle = '#2c2d2f'; x.fillRect(0, 0, w, h);
  for (var i = 0; i < 420; i++) {
    var r = 10 + Math.random() * 80;
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    var tone = ['62,57,49', '26,27,30', '74,71,66', '16,16,19'][Math.floor(Math.random() * 4)];
    x.fillStyle = 'rgba(' + tone + ',0.09)';
    x.fill();
  }
  x.fillStyle = 'rgba(0,0,0,0.3)';
  x.fillRect(0, h - 60, w, 60);
});
wallTex.wrapS = THREE.RepeatWrapping; wallTex.repeat.set(2.5, 1);
var wallMat = stdMat(0xffffff, 0.95, 0.0, { envMapIntensity: 0.22 });
wallMat.map = wallTex;
function wall(w, h, x, y, z, ry) {
  var m = mesh(new THREE.PlaneGeometry(w, h), wallMat, x, y, z);
  m.rotation.y = ry;
  m.castShadow = false;
  garageG.add(m);
}
wall(26, 7, 0, 3.5, -11, 0);
wall(26, 7, 0, 3.5, 12.5, Math.PI);
wall(24, 7, -12.5, 3.5, 0, Math.PI / 2);
wall(24, 7, 12.5, 3.5, 0, -Math.PI / 2);
var ceil = mesh(new THREE.PlaneGeometry(26, 24), stdMat(0x0a0a0c, 1, 0), 0, 7, 0);
ceil.rotation.x = Math.PI / 2;
ceil.castShadow = false;
garageG.add(ceil);

/* 远处亮门洞（照片右后方） */
var doorway = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.4),
  new THREE.MeshBasicMaterial({ color: 0x8d97a4 }));
doorway.position.set(6.8, 2.2, -10.96);
garageG.add(doorway);
var doorFrame = box(2.7, 4.7, 0.08, stdMat(0x0c0d10, 0.9, 0), 6.8, 2.3, -10.99);
doorFrame.castShadow = false;
garageG.add(doorFrame);

/* 地面光晕 */
var glowTex = canvasTex(256, 256, function (x, w, h) {
  var g = x.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(190,205,255,0.5)');
  g.addColorStop(1, 'rgba(190,205,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
function addGlow(x, z, s, op) {
  var g = new THREE.Mesh(new THREE.PlaneGeometry(s, s),
    new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: op,
      blending: THREE.AdditiveBlending, depthWrite: false }));
  g.rotation.x = -Math.PI / 2; g.position.set(x, 0.012, z);
  g.castShadow = false; g.receiveShadow = false;
  garageG.add(g);
}
/* 灯组正下方的地面光池（照片中地面亮斑跟随吊灯；三车各一盏） */
addGlow(-4.4, 1.0, 6, 0.09); addGlow(0.2, -0.8, 5, 0.07); addGlow(4.2, 0.9, 6, 0.09);
addGlow(-3.8, 0, 8, 0.04); addGlow(0, 0, 8, 0.035); addGlow(3.8, 0, 8, 0.04); addGlow(0, -1, 20, 0.025);

/* 门洞体积光：渐隐光锥 + 地面光带 + 低强度聚光 */
var shaftTex = canvasTex(64, 256, function (x, w, h) {
  var g = x.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(150,168,192,0)');      // 屋内端隐没
  g.addColorStop(0.45, 'rgba(150,168,192,0.16)');
  g.addColorStop(1, 'rgba(150,168,192,0.55)');   // 门口端最亮
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
var shaftMat = new THREE.MeshBasicMaterial({
  map: shaftTex, transparent: true, opacity: 0.4,
  blending: THREE.AdditiveBlending, depthWrite: false,
  side: THREE.DoubleSide, fog: false, toneMapped: false });
var shaft = new THREE.Mesh(new THREE.CylinderGeometry(1.55, 1.05, 5.6, 14, 1, true), shaftMat);
shaft.quaternion.setFromUnitVectors(V_Y, new THREE.Vector3(0.25, -1.9, 4.9).normalize());
shaft.position.set(6.95, 1.3, -8.5);
shaft.castShadow = false; shaft.receiveShadow = false;
shaft.userData.noRay = true;
garageG.add(shaft);
var spill = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 6.8),
  new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.12,
    blending: THREE.AdditiveBlending, depthWrite: false }));
spill.rotation.x = -Math.PI / 2;
spill.position.set(7.0, 0.015, -8.0);
spill.castShadow = false; spill.receiveShadow = false;
garageG.add(spill);
var doorSpot = new THREE.SpotLight(0x9fb2c8, 0.5, 22, 0.5, 0.65);
doorSpot.position.set(6.8, 2.8, -10.8);
doorSpot.target.position.set(7.4, 0, -5.0);
garageG.add(doorSpot); garageG.add(doorSpot.target);

/* 链条吊挂的灯管组（照片同款）+ 对应聚光灯 */
var tubeOnMat = new THREE.MeshBasicMaterial({ color: 0xe6edf8 });
var tubeBodyMat = stdMat(0x1a1d20, 0.6, 0.6);
var chainMat = stdMat(0x232428, 0.7, 0.5);
function lightCluster(cx, cy, cz, tubes, aimX) {
  var g = new THREE.Group();
  tubes.forEach(function (t) {
    var tg = new THREE.Group();
    var body = box(1.25, 0.10, 0.22, tubeBodyMat, 0, 0.05, 0);
    var lamp = mesh(new THREE.BoxGeometry(1.18, 0.05, 0.17), tubeOnMat, 0, -0.015, 0);
    lamp.castShadow = false;
    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0.55,
      blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(2.6, 0.9, 1);
    glow.userData.noRay = true;
    tg.add(body, lamp, glow);
    tg.position.set(t[0], t[1], t[2]);
    tg.rotation.set(t[3] || 0, t[4] || 0, t[5] || 0);
    /* 吊链两根 */
    [-0.5, 0.5].forEach(function (off) {
      var top = new THREE.Vector3(t[0] + off * 0.8, 7 - cy, t[2]);
      var bot = new THREE.Vector3(t[0] + off * Math.cos(t[5] || 0), t[1] + off * Math.sin(t[5] || 0) * 0.5, t[2]);
      var d = new THREE.Vector3().subVectors(top, bot);
      var ch = mesh(new THREE.CylinderGeometry(0.012, 0.012, d.length(), 6), chainMat);
      ch.position.copy(bot).addScaledVector(d, 0.5);
      ch.quaternion.setFromUnitVectors(V_Y, d.clone().normalize());
      ch.castShadow = false;
      g.add(ch);
    });
    g.add(tg);
  });
  g.position.set(cx, cy, cz);
  garageG.add(g);
  var spot = new THREE.SpotLight(0xdfe8f5, 1.0, 0, 0.52, 0.55);
  spot.position.set(cx, cy, cz);
  spot.target.position.set(aimX, 0, 0);
  garageG.add(spot); garageG.add(spot.target);
}
lightCluster(-4.6, 3.5, 1.6, [
  [-0.6, 0.1, 0, 0, 0.3, 0.35], [0.4, -0.2, 0.3, 0, -0.2, -0.25], [1.1, 0.25, -0.2, 0, 0.5, 0.15]
], -4.0);
lightCluster(0.2, 4.1, -1.2, [
  [-0.4, 0, 0, 0, 0.8, -0.3], [0.6, 0.2, 0.2, 0, -0.4, 0.2]
], 0);
lightCluster(4.4, 3.6, 1.4, [
  [-0.5, 0.15, 0.1, 0, -0.6, -0.2], [0.5, -0.1, -0.15, 0, 0.25, 0.3], [1.2, 0.2, 0.15, 0, 0.9, -0.12]
], 4.0);

/* 地面车名指示牌（起跑 / 进站时隐藏，免得赛车穿过） */
var signG = new THREE.Group();
scene.add(signG);
function buildSign(x, z, line1, accent) {
  var tex = canvasTex(512, 150, function (c, w, h) {
    c.fillStyle = 'rgba(10,11,15,0.92)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = accent; c.lineWidth = 5; c.strokeRect(7, 7, w - 14, h - 14);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f2f3f7';
    var fs = 52;                              // 长车队名自动缩小字号，避免被牌子裁掉
    do { c.font = '700 ' + fs + 'px Georgia, "PingFang SC", serif'; fs -= 2; }
    while (c.measureText(line1).width > w - 44 && fs > 24);
    c.fillText(line1, w / 2, h / 2 + 2);
  });
  var g = new THREE.Group();
  var p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.293),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  p.position.y = 0.42; p.rotation.x = -0.12;
  var post = box(0.045, 0.30, 0.045, stdMat(0x101216, 0.4, 0.8), 0, 0.14, -0.02);
  var foot = box(0.30, 0.025, 0.18, stdMat(0x101216, 0.4, 0.8), 0, 0.012, -0.02);
  g.add(p, post, foot);
  g.position.set(x, 0, z);
  signG.add(g);
}

/* --------------------------------- 摩洛哥赛道（马拉喀什街道赛风格） ---- */
var trackG = new THREE.Group();
scene.add(trackG);
var startLamps = [];                 // [列][上灯,下灯]，起跑灯序点亮
var trackSun, nightRig, starField;   // 太阳精灵 / 夜战泛光架 / 星空（随时段切换）
var floodLights = [];                // 夜战聚光灯
function setLampsLit(n) {            // 前 n 列亮红，其余熄灭
  for (var c = 0; c < startLamps.length; c++) {
    var on = c < n;
    startLamps[c].forEach(function (lamp) {
      lamp.material.emissive.setHex(on ? 0xff1408 : 0x7a1212);
      lamp.material.emissiveIntensity = on ? 2.6 : 0.55;
      lamp.material.color.setHex(on ? 0xff5040 : 0x3a0d0d);
    });
  }
}
(function buildTrack() {
  function tAdd(m) { trackG.add(m); return m; }
  /* 沙漠地面 */
  var sandTex = canvasTex(512, 512, function (x, w, h) {
    x.fillStyle = '#c49a5e'; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 900; i++) {
      x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '170,128,72' : '224,186,128') + ',0.10)';
      x.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 2 + Math.random() * 3);
    }
  });
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping; sandTex.repeat.set(14, 14);
  var sandMat = stdMat(0xffffff, 0.95, 0, { envMapIntensity: 0.25 });
  sandMat.map = sandTex;
  var sand = mesh(new THREE.PlaneGeometry(170, 170), sandMat, 0, -0.005, 0);
  sand.rotation.x = -Math.PI / 2; sand.castShadow = false;
  tAdd(sand);
  /* 柏油赛道（含两道磨损带） */
  var aspTex = canvasTex(512, 512, function (x, w, h) {
    x.fillStyle = '#303136'; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 1600; i++) {
      x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '18,18,22' : '70,72,78') + ',0.16)';
      x.fillRect(Math.random() * w, Math.random() * h, 1.6, 1.6);
    }
    [0.36, 0.64].forEach(function (u) {
      var g = x.createLinearGradient((u - 0.07) * w, 0, (u + 0.07) * w, 0);
      g.addColorStop(0, 'rgba(12,12,15,0)');
      g.addColorStop(0.5, 'rgba(12,12,15,0.35)');
      g.addColorStop(1, 'rgba(12,12,15,0)');
      x.fillStyle = g; x.fillRect((u - 0.07) * w, 0, 0.14 * w, h);
    });
  });
  aspTex.wrapS = THREE.RepeatWrapping; aspTex.wrapT = THREE.RepeatWrapping; aspTex.repeat.set(1, 9);
  var aspMat = phyMat(0xffffff, 0.62, 0.05, 0.12, 0.6, { envMapIntensity: 0.35 });
  aspMat.map = aspTex;
  var asphalt = mesh(new THREE.PlaneGeometry(12.4, 92), aspMat, 0, 0.004, 0);
  asphalt.rotation.x = -Math.PI / 2; asphalt.castShadow = false;
  tAdd(asphalt);
  /* 边线 + 红白路肩 */
  var kerbTex = canvasTex(64, 256, function (x, w, h) {
    for (var i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#d8d8d4' : '#c33524'; x.fillRect(0, i * h / 8, w, h / 8); }
  });
  kerbTex.wrapS = THREE.RepeatWrapping; kerbTex.wrapT = THREE.RepeatWrapping; kerbTex.repeat.set(1, 26);
  [-1, 1].forEach(function (sx) {
    var line = box(0.14, 0.006, 92, stdMat(0xe8e8e2, 0.7, 0), sx * 5.85, 0.006, 0);
    line.castShadow = false; tAdd(line);
    var kerbMat = stdMat(0xffffff, 0.75, 0);
    kerbMat.map = kerbTex;
    var kerb = mesh(new THREE.PlaneGeometry(0.55, 92), kerbMat, sx * 6.25, 0.009, 0);
    kerb.rotation.x = -Math.PI / 2; kerb.castShadow = false;
    tAdd(kerb);
  });
  /* 起步线（黑白格）+ 三个发车格 */
  var chkTex = canvasTex(256, 64, function (x, w, h) {
    for (var i = 0; i < 8; i++) for (var j = 0; j < 2; j++) {
      x.fillStyle = (i + j) % 2 ? '#0d0d0f' : '#e8e8e4';
      x.fillRect(i * w / 8, j * h / 2, w / 8, h / 2);
    }
  });
  var chk = mesh(new THREE.PlaneGeometry(11.6, 1.0), new THREE.MeshBasicMaterial({ map: chkTex }), 0, 0.007, 9.5);
  chk.rotation.x = -Math.PI / 2; chk.castShadow = false;
  tAdd(chk);
  var gridMat = stdMat(0xd8d8d2, 0.7, 0);
  [-4.0, 0, 4.0].forEach(function (gx) {
    [-1, 1].forEach(function (s) {
      var l = box(0.08, 0.004, 4.4, gridMat, gx + s * 1.05, 0.0065, 0.2);
      l.castShadow = false; tAdd(l);
    });
    var f = box(2.18, 0.004, 0.08, gridMat, gx, 0.0065, 2.4);
    f.castShadow = false; tAdd(f);
  });
  /* 起步灯架（5 列 × 2 灯，列引用存入 startLamps 供起跑灯序使用） */
  var pillarMat = stdMat(0x2a2d33, 0.5, 0.6);
  tAdd(box(0.28, 4.4, 0.28, pillarMat, -6.9, 2.2, 13));
  tAdd(box(0.28, 4.4, 0.28, pillarMat, 6.9, 2.2, 13));
  tAdd(box(14.1, 0.34, 0.3, pillarMat, 0, 4.35, 13));
  for (var li = 0; li < 5; li++) {
    tAdd(box(0.34, 0.62, 0.18, stdMat(0x101114, 0.6, 0.3), -1.7 + li * 0.85, 3.85, 13));
    var col = [];
    for (var lj = 0; lj < 2; lj++) {
      var lamp = mesh(new THREE.SphereGeometry(0.085, 10, 8),
        stdMat(0x3a0d0d, 0.4, 0.2, { emissive: new THREE.Color(0x7a1212), emissiveIntensity: 0.7 }),
        -1.7 + li * 0.85, 3.7 + lj * 0.3, 12.88);
      lamp.castShadow = false; tAdd(lamp);
      col.push(lamp);
    }
    startLamps.push(col);
  }
  /* 赭红城墙（马拉喀什红墙 + 垛口 + 马蹄拱门） */
  var wallTexM = canvasTex(512, 256, function (x, w, h) {
    x.fillStyle = '#b06b40'; x.fillRect(0, 0, w, h);
    for (var i = 0; i < 320; i++) {
      x.fillStyle = 'rgba(' + (Math.random() < 0.5 ? '140,78,44' : '202,140,92') + ',0.10)';
      var r = 6 + Math.random() * 40;
      x.beginPath(); x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2); x.fill();
    }
    x.fillStyle = 'rgba(70,38,22,0.85)';
    [0.18, 0.5, 0.82].forEach(function (u) {
      x.beginPath();
      x.arc(u * w, h * 0.78, w * 0.055, Math.PI, 0);
      x.rect(u * w - w * 0.055, h * 0.78, w * 0.11, h * 0.22);
      x.fill();
    });
  });
  wallTexM.wrapS = THREE.RepeatWrapping; wallTexM.repeat.set(7, 1);
  var wallMatM = stdMat(0xffffff, 0.9, 0, { envMapIntensity: 0.25 });
  wallMatM.map = wallTexM;
  var toothMat = stdMat(0xa3603a, 0.9, 0);
  [-1, 1].forEach(function (sx) {
    tAdd(box(0.55, 2.0, 92, wallMatM, sx * 11.5, 1.0, 0));
    for (var tz = -45; tz <= 45; tz += 1.6) {
      var tooth = box(0.55, 0.30, 0.62, toothMat, sx * 11.5, 2.15, tz);
      tooth.castShadow = false;
      tAdd(tooth);
    }
  });
  tAdd(box(23.5, 2.4, 0.55, wallMatM, 0, 1.2, -46));
  /* 棕榈树 */
  var trunkMat = stdMat(0x7a5a38, 0.9, 0);
  var frondMat = stdMat(0x2f6e35, 0.85, 0, { side: THREE.DoubleSide });
  var frondGeos = [0.5, 0.85, 1.2].map(function (droop) {
    var g2 = new THREE.BoxGeometry(0.16, 0.02, 1.5);
    g2.translate(0, 0, 0.72);
    g2.rotateX(droop);
    return g2;
  });
  function palm(x, z, h) {
    var p = new THREE.Group();
    for (var i2 = 0; i2 < 3; i2++) {
      var segH = h / 3;
      p.add(mesh(new THREE.CylinderGeometry(0.085 - i2 * 0.02, 0.105 - i2 * 0.02, segH + 0.06, 8),
        trunkMat, 0, segH * (i2 + 0.5), 0));
    }
    for (var f2 = 0; f2 < 9; f2++) {
      var fr = mesh(frondGeos[f2 % 3], frondMat, 0, h + 0.04, 0);
      fr.rotation.y = f2 / 9 * Math.PI * 2 + (x + z) * 0.7;
      p.add(fr);
    }
    p.add(mesh(new THREE.SphereGeometry(0.14, 8, 6), trunkMat, 0, h, 0));
    p.position.set(x, 0, z);
    p.rotation.z = Math.sin(x * 12.9898 + z) * 0.05;
    tAdd(p);
  }
  palm(-8.9, -18, 4.2); palm(8.7, 6, 3.8); palm(-8.6, 24, 4.5); palm(9.0, -30, 4.0);
  for (var pz = -40; pz <= 40; pz += 9) {
    palm(-13.6, pz + 2, 3.6 + Math.abs(pz * 7 % 5) * 0.3);
    palm(13.8, pz - 3, 3.4 + Math.abs(pz * 11 % 5) * 0.32);
  }
  /* 摩洛哥国旗 ×2 */
  var flagTex = canvasTex(256, 168, function (x, w, h) {
    x.fillStyle = '#c1272d'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#006233'; x.lineWidth = 9; x.lineJoin = 'round';
    var cx = w / 2, cy = h / 2, R = 52;
    x.beginPath();
    for (var i3 = 0; i3 < 5; i3++) {
      var a2 = -Math.PI / 2 + i3 * 4 * Math.PI / 5;
      var px2 = cx + R * Math.cos(a2), py2 = cy + R * Math.sin(a2);
      if (i3 === 0) x.moveTo(px2, py2); else x.lineTo(px2, py2);
    }
    x.closePath(); x.stroke();
  });
  var poleMat = stdMat(0x787e88, 0.4, 0.9);
  [[-8.6, -7], [8.6, 18]].forEach(function (fp) {
    tAdd(mesh(new THREE.CylinderGeometry(0.035, 0.05, 5.2, 8), poleMat, fp[0], 2.6, fp[1]));
    var fl = mesh(new THREE.PlaneGeometry(1.35, 0.9),
      new THREE.MeshBasicMaterial({ map: flagTex, side: THREE.DoubleSide }), fp[0] + 0.71, 4.6, fp[1]);
    fl.castShadow = false;
    tAdd(fl);
  });
  /* 阿特拉斯山脉（雪顶）+ 太阳 */
  var mtnMat = stdMat(0x9b8775, 1, 0, { envMapIntensity: 0.1 });
  var snowMat = stdMat(0xe9ecef, 0.9, 0);
  [[-52, -78, 30, 13], [-18, -85, 38, 17], [25, -80, 33, 14], [60, -70, 26, 10],
   [-70, -40, 24, 9], [72, -30, 28, 11], [-75, 15, 22, 8], [78, 25, 24, 9]].forEach(function (mm) {
    var mt = mesh(new THREE.ConeGeometry(mm[2], mm[3], 7), mtnMat, mm[0], mm[3] / 2 - 0.5, mm[1]);
    mt.scale.z = 0.55; mt.castShadow = false; mt.receiveShadow = false;
    tAdd(mt);
    var sn = mesh(new THREE.ConeGeometry(mm[2] * 0.32, mm[3] * 0.30, 7), snowMat, mm[0], mm[3] * 0.85, mm[1]);
    sn.scale.z = 0.55; sn.castShadow = false; sn.receiveShadow = false;
    tAdd(sn);
  });
  trackSun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  trackSun.scale.set(26, 26, 1);
  trackSun.position.set(52, 34, -26);
  trackSun.userData.noRay = true;
  tAdd(trackSun);

  /* ---- 观众看台（主直道两侧，起跑跟拍可见） ---- */
  var crowdTex = canvasTex(256, 128, function (x, w, h) {
    x.fillStyle = '#181a20'; x.fillRect(0, 0, w, h);
    var cols = ['#d23', '#2a6', '#39c', '#fb2', '#eee', '#e63', '#8c3', '#c5c', '#26d'];
    for (var i = 0; i < 2400; i++) {
      x.fillStyle = cols[(Math.random() * cols.length) | 0];
      x.globalAlpha = 0.5 + Math.random() * 0.5;
      x.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    x.globalAlpha = 1;
    x.fillStyle = 'rgba(10,11,14,0.5)';      // 排间横档
    for (var r = 0; r < h; r += 9) x.fillRect(0, r, w, 1.5);
  });
  var crowdMat = stdMat(0xffffff, 0.92, 0, { envMapIntensity: 0.2 });
  crowdMat.map = crowdTex; crowdMat.map.wrapS = THREE.RepeatWrapping; crowdMat.map.repeat.set(6, 1);
  var standStruct = stdMat(0x6c7079, 0.7, 0.3);
  var standRoof = stdMat(0x20242c, 0.6, 0.4);
  function grandstand(sx, z0, len) {
    var g = new THREE.Group();
    var seat = mesh(new THREE.PlaneGeometry(len, 5.4), crowdMat, 0, 2.5, 0);
    seat.rotation.y = -sx * Math.PI / 2;        // 朝向赛道
    seat.rotation.x = sx * 0.62;                // 看台倾角
    seat.castShadow = false; seat.receiveShadow = false;
    g.add(seat);
    g.add(box(0.5, 5.2, len, standStruct, sx * 1.55, 2.5, 0));   // 后挡墙
    var roof = box(3.4, 0.18, len + 0.6, standRoof, sx * 0.2, 5.25, 0);
    roof.rotation.z = sx * 0.12; g.add(roof);
    for (var pz = -len / 2 + 1; pz < len / 2; pz += 3.2) {       // 顶棚立柱
      g.add(box(0.16, 5.3, 0.16, standStruct, sx * 1.4, 2.6, pz));
      g.add(box(0.16, 5.3, 0.16, standStruct, -sx * 1.2, 2.6, pz));
    }
    g.position.set(sx * 9.0, 0, z0);
    tAdd(g);
  }
  grandstand(1, 6, 26); grandstand(-1, 2, 26);
  grandstand(1, -30, 18); grandstand(-1, -32, 18);

  /* ---- 夜战泛光灯架（4 座，含真实聚光灯，仅夜间开） ---- */
  nightRig = new THREE.Group();
  var rigPole = stdMat(0x2a2d33, 0.5, 0.6);
  var rigPanel = stdMat(0x0e0f12, 0.6, 0.3, { emissive: new THREE.Color(0xeaf0ff), emissiveIntensity: 0.0 });
  nightRig.userData.panels = [];
  [[-10.5, -8], [10.5, -8], [-10.5, 22], [10.5, 22]].forEach(function (p) {
    var head = new THREE.Group();
    head.add(mesh(new THREE.CylinderGeometry(0.18, 0.26, 9, 8), rigPole, 0, 4.5, 0));
    var panel = box(3.0, 1.4, 0.3, rigPanel.clone(), 0, 9, p[0] > 0 ? -0.4 : 0.4);
    panel.rotation.x = (p[1] > 7 ? 0.5 : -0.5);
    panel.castShadow = false;
    head.add(panel); nightRig.userData.panels.push(panel.material);
    head.position.set(p[0], 0, p[1]);
    nightRig.add(head);
    var fl = new THREE.SpotLight(0xdce6ff, 0, 60, 0.6, 0.5);
    fl.position.set(p[0], 9, p[1]);
    fl.target.position.set(p[0] * 0.15, 0, 4);
    nightRig.add(fl); nightRig.add(fl.target);
    floodLights.push(fl);
  });
  nightRig.visible = false;
  tAdd(nightRig);

  /* ---- 星空（夜间） ---- */
  var starGeo = new THREE.BufferGeometry();
  var sp = [];
  for (var si = 0; si < 420; si++) {
    var th = Math.random() * Math.PI * 2, ph = Math.random() * 0.95 + 0.12;
    var rr = 88;
    sp.push(Math.cos(th) * Math.sin(ph) * rr, Math.cos(ph) * rr + 6, Math.sin(th) * Math.sin(ph) * rr);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  starField = new THREE.Points(starGeo, new THREE.PointsMaterial({
    color: 0xdde6ff, size: 0.6, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false, fog: false }));
  starField.userData.noRay = true; starField.visible = false;
  tAdd(starField);
})();

/* ------------------------------------------------------ 共用材质 ---- */
var M = {
  carbon:   phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),
  carbonM:  stdMat(0x101114, 0.8, 0.3),
  innerDark: stdMat(0x07080a, 0.95, 0.0),
  tyre:     stdMat(0x141518, 0.95, 0.05, { envMapIntensity: 0.35 }),
  rim:      stdMat(0x202329, 0.3, 0.9),
  steel:    stdMat(0x787e88, 0.4, 0.9),
  silver:   stdMat(0xb9c0c8, 0.28, 1.0),
  gold:     stdMat(0xcf9c3c, 0.3, 1.0, { envMapIntensity: 1.4 }),   // 排气隔热金
  titan:    stdMat(0x8f949c, 0.5, 0.85),
  engine:   stdMat(0x3a3d44, 0.55, 0.85),
  gearbox:  stdMat(0x9aa0a8, 0.42, 0.95),
  rainGlow: stdMat(0x550808, 0.4, 0.1, { emissive: new THREE.Color(0xff2222), emissiveIntensity: 1.8 })
};
M.radiator = stdMat(0xa75e2e, 0.7, 0.5);
M.radiator.map = canvasTex(128, 128, function (x, w, h) {
  x.fillStyle = '#9a5226'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#6e3a1a';
  for (var i = 0; i < w; i += 5) x.fillRect(i, 0, 2, h);
});
M.ers = stdMat(0xe07818, 0.55, 0.2);
M.ers.map = canvasTex(128, 128, function (x, w, h) {
  x.fillStyle = '#e07818'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#141414';
  x.save(); x.translate(w / 2, h / 2); x.rotate(-Math.PI / 4); x.translate(-w, -h);
  for (var i = 0; i < w * 3; i += 26) x.fillRect(i, 0, 11, h * 3);
  x.restore();
});

/* ============================================================ 造车 ====
   坐标系：+Z 为车头方向，Y 向上，单位＝米（真实尺寸），整车后续缩 1/16
   轴距 3.6m：前轴 z=+1.8，后轴 z=-1.8；轮胎直径 0.72m
   ===================================================================== */
function buildF1Car(spec) {
  var car = { spec: spec };
  var root = new THREE.Group();           // 整车（真实尺度）
  var chassis = new THREE.Group();        // 常驻结构
  var cover = new THREE.Group();          // 引擎盖 + 进气箱 + 鳍（可拆）
  var podL = new THREE.Group();           // 左侧箱（可拆）
  var podR = new THREE.Group();           // 右侧箱（可拆）
  var noseG = new THREE.Group();          // 鼻锥 + 前翼（可前移）
  var internals = new THREE.Group();      // 引擎舱内部
  var labels = new THREE.Group();         // 部件标注
  root.add(chassis, cover, podL, podR, noseG, internals, labels);

  var paint = spec.paintMat;
  var paint2 = spec.paint2Mat;
  var accent = stdMat(spec.accent, 0.4, 0.3);
  var white = phyMat(0xeef0f2, 0.35, 0.2, 0.8, 0.1);
  var tyreBandMat = stdMat(spec.tyreBand, 0.85, 0.05);
  car.tyreBandMat = tyreBandMat;          // 进站换胎时切换胎色（软/中/硬）

  /* ---- 底板 / 扩散器（常驻） ---- */
  var floor = box(1.58, 0.035, 2.65, M.carbonM, 0, 0.075, -0.35);
  var floorFront = box(1.00, 0.03, 0.62, M.carbonM, 0, 0.075, 1.26);
  var diff = box(1.06, 0.03, 0.58, M.carbon, 0, 0.155, -1.93);
  diff.rotation.x = 0.24;
  var edgeL = box(0.05, 0.018, 1.5, paint2, -0.805, 0.105, 0.05);
  var edgeR = box(0.05, 0.018, 1.5, paint2, 0.805, 0.105, 0.05);
  chassis.add(floor, floorFront, diff, edgeL, edgeR);

  /* ---- 座舱单体壳 + 上盖板（带真实开口） ---- */
  var tub = mesh(loft([
    { z: -0.06, cy: 0.32, rx: 0.295, ry: 0.255, e: 0.62 },
    { z: 0.45,  cy: 0.325, rx: 0.305, ry: 0.265, e: 0.62 },
    { z: 0.95,  cy: 0.33, rx: 0.295, ry: 0.255, e: 0.66 },
    { z: 1.36,  cy: 0.345, rx: 0.245, ry: 0.205, e: 0.72 }
  ], 28, false, !!spec.tubMat), spec.tubMat || paint);
  chassis.add(tub);

  var deckShape = new THREE.Shape();
  deckShape.moveTo(-0.355, 0.06);
  deckShape.lineTo(0.355, 0.06);
  deckShape.lineTo(0.285, -1.38);
  deckShape.lineTo(-0.285, -1.38);
  deckShape.closePath();
  var hole = new THREE.Path();
  hole.absellipse(0, -0.60, 0.195, 0.395, 0, Math.PI * 2, true, 0);
  deckShape.holes.push(hole);
  var deckGeo = new THREE.ExtrudeGeometry(deckShape, { depth: 0.055, bevelEnabled: false });
  deckGeo.rotateX(-Math.PI / 2);
  var deck = mesh(deckGeo, paint, 0, 0.545, 0);
  chassis.add(deck);

  /* 座舱内部：浴盆 + 座椅 + 安全带 + 头枕 */
  var bath = box(0.40, 0.30, 0.92, M.innerDark, 0, 0.32, 0.58);
  var seat = box(0.34, 0.025, 0.55, stdMat(0x101216, 0.85, 0.1), 0, 0.40, 0.46);
  seat.rotation.x = -0.62;
  var beltMat = stdMat(spec.beltColor, 0.7, 0.1);
  var beltL = box(0.045, 0.004, 0.30, beltMat, -0.07, 0.50, 0.42); beltL.rotation.x = -0.62;
  var beltR = box(0.045, 0.004, 0.30, beltMat, 0.07, 0.50, 0.42); beltR.rotation.x = -0.62;
  var padRear = box(0.27, 0.075, 0.10, M.innerDark, 0, 0.585, 0.265);
  var padL = box(0.06, 0.06, 0.34, M.innerDark, -0.175, 0.585, 0.40);
  var padR = box(0.06, 0.06, 0.34, M.innerDark, 0.175, 0.585, 0.40);
  chassis.add(bath, seat, beltL, beltR, padRear, padL, padR);

  /* ---- 方向盘 + 仪表屏（座舱视角的"仪表盘"） ---- */
  var wheelG = new THREE.Group();
  wheelG.position.set(0, 0.665, 0.90);
  wheelG.rotation.x = -0.42;
  var wPlate = box(0.265, 0.13, 0.022, M.carbon, 0, 0, 0);
  var gripL = mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.13, 12), stdMat(0x222226, 0.9, 0), -0.145, 0, 0);
  var gripR = gripL.clone(); gripR.position.x = 0.145;
  var dashCanvas = document.createElement('canvas');
  dashCanvas.width = 256; dashCanvas.height = 144;
  var dashTex = new THREE.CanvasTexture(dashCanvas);
  dashTex.encoding = THREE.sRGBEncoding;
  var dashScreen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.125, 0.070),
    new THREE.MeshBasicMaterial({ map: dashTex, toneMapped: false }));
  dashScreen.rotation.y = Math.PI;            // 面向车手
  dashScreen.position.set(0, 0.012, -0.0125);
  dashScreen.castShadow = false;
  var bezel = box(0.145, 0.085, 0.006, M.carbonM, 0, 0.012, -0.009);
  /* 拨杆与按钮 */
  for (var bi = 0; bi < 6; bi++) {
    var btn = mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.008, 10),
      stdMat([0xd62b2b, 0x2bd65e, 0x2b6ed6, 0xd6c22b, 0xd62bb6, 0xffffff][bi], 0.5, 0.2));
    btn.geometry.rotateX(Math.PI / 2);
    btn.position.set(-0.10 + (bi % 3) * 0.10, (bi < 3 ? -0.042 : -0.058), -0.013);
    wheelG.add(btn);
  }
  wheelG.add(wPlate, gripL, gripR, bezel, dashScreen);
  chassis.add(wheelG);
  car.dash = { canvas: dashCanvas, ctx: dashCanvas.getContext('2d'), tex: dashTex };

  /* ---- HALO 保护圈（座舱视角抬头即见） ---- */
  var haloMat = spec.haloMat || phyMat(spec.haloColor, 0.45, 0.4, 0.6, 0.2);
  var haloRing = mesh(new THREE.TorusGeometry(0.29, 0.024, 10, 36), haloMat, 0, 0.91, 0.52);
  haloRing.geometry.rotateX(Math.PI / 2);
  haloRing.scale.set(1, 1, 1.45);     // 更纤细贴身的 halo
  var haloPost = rod(0, 0.60, 0.92, 0, 0.91, 0.94, 0.020, haloMat);
  var haloL = rod(-0.285, 0.60, 0.12, -0.278, 0.902, 0.30, 0.020, haloMat);
  var haloR = rod(0.285, 0.60, 0.12, 0.278, 0.902, 0.30, 0.020, haloMat);
  chassis.add(haloRing, haloPost, haloL, haloR);

  /* 后视镜（座舱视角左右可见） */
  function mirror(sx) {
    var g = new THREE.Group();
    g.add(rod(sx * 0.30, 0.60, 0.86, sx * 0.46, 0.645, 0.84, 0.010, M.carbon));
    var mb = box(0.105, 0.052, 0.035, paint, sx * 0.475, 0.65, 0.835);
    var mg = box(0.085, 0.038, 0.004, stdMat(0xbfd6ee, 0.05, 1.0), sx * 0.475, 0.65, 0.854);
    mg.castShadow = false;
    g.add(mb, mg);
    chassis.add(g);
  }
  mirror(1); mirror(-1);

  /* 鼻梁天线 */
  chassis.add(rod(0, 0.60, 1.30, 0, 0.72, 1.26, 0.004, M.carbonM));
  chassis.add(rod(-0.06, 0.60, 1.42, -0.06, 0.70, 1.40, 0.004, M.carbonM));

  /* ---- 鼻锥 + 前翼（noseG，可整体前移演示拆装） ---- */
  var nrx = spec.noseRx || 1;       // 鼻锥宽窄系数（法拉利圆润 / 红牛纤细）
  var nose = mesh(loft([
    { z: 1.34, cy: 0.345, rx: 0.245 * nrx, ry: 0.205, e: 0.72 },
    { z: 1.90, cy: 0.350, rx: 0.165 * nrx, ry: 0.125, e: 0.82 },
    { z: 2.35, cy: 0.340, rx: 0.114 * nrx, ry: 0.085, e: 0.92 },
    { z: 2.70, cy: 0.326, rx: 0.072 * nrx, ry: 0.052, e: 1 },
    { z: 2.92, cy: 0.318, rx: 0.013, ry: 0.011, e: 1 }
  ], 28, false, !!spec.noseMat), spec.noseMat || paint);
  noseG.add(nose);
  var noseTip = mesh(new THREE.SphereGeometry(0.052, 14, 10), spec.noseTipMat, 0, 0.319, 2.86);
  noseTip.scale.set(1.05 * nrx, 0.78, 1.7);
  noseG.add(noseTip);
  /* 鼻锥号码色带（红牛：红底白字，参考实拍） */
  if (spec.noseBand) {
    var nb = mesh(new THREE.CylinderGeometry(0.146, 0.165, 0.30, 20), stdMat(spec.noseBand, 0.45, 0.3), 0, 0.352, 1.95);
    nb.geometry.rotateX(Math.PI / 2);
    nb.scale.set(1.02 * nrx, 0.82, 1);
    noseG.add(nb);
  }
  var noseNum = decal(spec.number, 0.28, 0.28, { italic: true, cw: 256, ch: 256, size: spec.numSize || 168, color: spec.numColor, stroke: spec.numStroke });
  noseNum.rotation.x = -1.42;
  noseNum.position.set(spec.numPos[0], spec.numPos[1], spec.numPos[2]);
  noseG.add(noseNum);

  /* 前翼：四层弧形翼片（中段下沉、翼尖上扬，照片同款连续曲面）+ 端板 */
  [
    { y: 0.092, z: 2.82, a: 0.05, c: M.carbon, ch: 0.18 },
    { y: 0.128, z: 2.73, a: 0.17, c: M.carbon, ch: 0.165 },
    { y: 0.162, z: 2.645, a: 0.30, c: spec.wing3Mat, ch: 0.15 },
    { y: 0.196, z: 2.565, a: 0.44, c: spec.wing4Mat, ch: 0.14 }
  ].forEach(function (e) {
    noseG.add(wingEl3D(0.91, e.ch, 0.013, e.z, e.y, e.a, 0.018, 0.05, e.c));
  });
  [-1, 1].forEach(function (sx) {
    var ep = box(0.013, 0.17, 0.36, spec.endplateMat, sx * 0.915, 0.165, 2.68);
    ep.rotation.y = sx * 0.10;
    var tip = box(0.013, 0.045, 0.30, spec.epTipMat || paint, sx * 0.945, 0.262, 2.66);
    tip.rotation.z = sx * 0.7; tip.rotation.y = sx * 0.10;
    noseG.add(ep, tip);
  });
  /* 前翼大字（红牛：横贯翼面的红色 Red Bull，参考实拍） */
  if (spec.wingScript) {
    var ws = decal(spec.wingScript, 1.55, 0.34, { cw: 1024, ch: 224, size: 148, weight: 900, italic: true, color: spec.wingScriptColor });
    ws.rotation.x = -Math.PI / 2 + 0.30;
    ws.position.set(0, 0.175, 2.66);
    noseG.add(ws);
  }
  noseG.add(rod(-0.07, 0.30, 2.56, -0.07, 0.13, 2.70, 0.012, M.carbon));
  noseG.add(rod(0.07, 0.30, 2.56, 0.07, 0.13, 2.70, 0.012, M.carbon));

  /* ---- 侧箱（podL / podR，可侧滑拆开） ---- */
  function buildPod(sx, podGroup) {
    /* 宽体贴地侧箱：照片比例的放样曲面（车身最宽 ≈ ±0.79m） */
    var secs = spec.podSecs.map(function (s) {
      return { z: s.z, cx: sx * s.cx, cy: s.cy, rx: s.rx, ry: s.ry, e: s.e };
    });
    /* 截面由前往后（z 递减）排列，需 flip 让法线朝外，否则看到的是箱体内壁 */
    var body = mesh(loft(secs, 28, true, !!spec.podMat), spec.podMat || paint);
    /* 进气口：开放截面内衬深色椭圆 */
    var s0 = spec.podSecs[0];
    var inlet = mesh(new THREE.CircleGeometry(1, 22), M.innerDark, sx * s0.cx, s0.cy, s0.z - 0.03);
    inlet.scale.set(s0.rx * 0.92, s0.ry * 0.92, 1);
    inlet.castShadow = false;
    var teamTxt = decal(spec.podText, 0.55, 0.085, { cw: 1024, ch: 160, size: 88, weight: 900, italic: spec.podItalic, color: spec.podTextColor });
    teamTxt.rotation.y = sx * Math.PI / 2;
    teamTxt.position.set(sx * (spec.podMaxX + 0.006), 0.31, -0.05);
    podGroup.add(body, inlet, teamTxt);
    if (spec.podFlash) {
      var flash = box(0.015, 0.04, 0.80, stdMat(spec.podFlash, 0.45, 0.4), sx * (spec.podMaxX - 0.015), 0.245, -0.06);
      podGroup.add(flash);
    }
  }
  buildPod(-1, podL); buildPod(1, podR);

  /* ---- 引擎罩（cover，可上掀） ---- */
  var spine = mesh(loft([
    { z: 0.10,  cy: 0.795, rx: 0.100, ry: 0.112, e: 0.80 },   // 进气箱口（开放）
    { z: -0.20, cy: 0.725, rx: 0.120, ry: 0.150, e: 0.85 },
    { z: -0.70, cy: 0.635, rx: 0.115, ry: 0.150, e: 0.90 },
    { z: -1.20, cy: 0.545, rx: 0.085, ry: 0.120, e: 1 },
    { z: -1.60, cy: 0.480, rx: 0.050, ry: 0.075, e: 1 },
    { z: -1.95, cy: 0.435, rx: 0.012, ry: 0.020, e: 1 }
  ], 28, true), paint);                      // z 递减排列 → flip 保证法线朝外
  cover.add(spine);
  /* 进气口内衬 */
  var airIn = mesh(new THREE.CircleGeometry(1, 20), M.innerDark, 0, 0.795, 0.085);
  airIn.scale.set(0.092, 0.104, 1);
  airIn.castShadow = false;
  cover.add(airIn);
  /* 蒙扎风格黄色斜纹（法拉利，参考实拍引擎盖肩部） */
  if (spec.hatchColor) {
    var hatchTex = canvasTex(256, 128, function (x, w, h) {
      x.fillStyle = spec.hatchColor;
      for (var i = 0; i < 8; i++) {
        x.save();
        x.transform(1, 0, -0.5, 1, i * 36 + 26, 0);
        x.fillRect(0, 0, 13, h);
        x.restore();
      }
    });
    [-1, 1].forEach(function (sx) {
      var hp = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.13),
        new THREE.MeshBasicMaterial({ map: hatchTex, transparent: true, side: THREE.DoubleSide,
          polygonOffset: true, polygonOffsetFactor: -2, toneMapped: false, depthWrite: false }));
      hp.castShadow = false; hp.receiveShadow = false;
      hp.userData.isDecal = true;
      hp.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1),
        new THREE.Vector3(sx * 0.84, 0.54, 0).normalize());   // 贴合盖肩外法线（外倾上仰）
      hp.position.set(sx * 0.094, 0.768, -0.18);
      cover.add(hp);
    });
  }
  /* 进气箱口缘（车手头顶，参考实拍为黄色点缀） */
  var airboxRing = mesh(new THREE.TorusGeometry(0.085, 0.020, 10, 24), spec.airboxMat || paint, 0, 0.795, 0.10);
  airboxRing.scale.set(1.18, 1.32, 1);
  cover.add(airboxRing);
  /* 车顶摄像 T 杆（随盖整体拆装） */
  var tcamPod = box(0.13, 0.035, 0.045, stdMat(0x111111, 0.6, 0.2), 0, 0.928, 0.10);
  cover.add(tcamPod);
  /* 鲨鱼鳍 + 车号 */
  var fin = box(0.012, 0.26, 0.85, spec.finMat, 0, 0.595, -1.32);
  fin.rotation.x = -0.10;
  cover.add(fin);
  var finNumL = decal(spec.number, 0.26, 0.20, { italic: true, cw: 256, ch: 192, size: 132, color: spec.numColor, stroke: spec.numStroke });
  finNumL.rotation.y = Math.PI / 2;
  finNumL.position.set(0.011, 0.625, -1.30); finNumL.rotation.z = -0.10;
  var finNumR = finNumL.clone(); finNumR.position.x = -0.011;
  cover.add(finNumL, finNumR);
  /* 散热鳃缝 */
  var gillL = box(0.02, 0.05, 0.55, M.innerDark, -0.098, 0.645, -0.62); gillL.rotation.z = 0.5;
  var gillR = box(0.02, 0.05, 0.55, M.innerDark, 0.098, 0.645, -0.62); gillR.rotation.z = -0.5;
  cover.add(gillL, gillR);

  /* ---- 尾部常驻：变速箱 / 防撞结构 / 尾灯 / 扩散器小翼 ---- */
  var gbox = mesh(new THREE.CylinderGeometry(0.155, 0.095, 0.80, 14), M.gearbox, 0, 0.375, -1.42);
  gbox.geometry.rotateX(Math.PI / 2);
  gbox.scale.set(1, 1.2, 1);
  var crash = mesh(new THREE.CylinderGeometry(0.085, 0.038, 0.42, 12), M.carbon, 0, 0.345, -2.16);
  crash.geometry.rotateX(Math.PI / 2);
  var rainLight = box(0.045, 0.10, 0.02, M.rainGlow, 0, 0.36, -2.34);
  chassis.add(gbox, crash, rainLight);
  /* 排气尾口（常驻可见） */
  var tailTip = mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.28, 14), M.titan, 0, 0.535, -1.95);
  tailTip.geometry.rotateX(Math.PI / 2);
  tailTip.rotation.x = -0.18;
  chassis.add(tailTip);
  /* 排气热浪（半透明扰动精灵，loop 中闪烁/拉伸） */
  var haze = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xffd9b0, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  haze.scale.set(0.34, 0.34, 1);
  haze.position.set(0, 0.55, -2.18);
  haze.userData.noRay = true;
  chassis.add(haze);
  car.haze = haze;

  /* ---- 尾翼 ---- */
  var rwMain = box(1.00, 0.018, 0.345, spec.rwMainMat, 0, 0.875, -2.28); rwMain.rotation.x = -0.22;
  var rwFlap = box(1.00, 0.014, 0.22, spec.flapMat, 0, 0.97, -2.40); rwFlap.rotation.x = -0.58;
  rwFlap.geometry.translate(0, 0, 0.11);        // 旋转轴移到襟翼前缘（DRS 沿前缘开合）
  rwFlap.position.z = -2.51; rwFlap.position.y = 0.945;
  var drsPod = box(0.05, 0.035, 0.09, M.carbon, 0, 1.015, -2.33);
  chassis.add(rwMain, rwFlap, drsPod);
  car.rwFlap = rwFlap;                            // DRS 动画引用
  /* 尾翼字样（参考实拍：迎风面大字） */
  if (spec.rwText) {
    var rwTxt = decal(spec.rwText, 0.92, 0.16, { cw: 1024, ch: 192, size: 116, weight: 900, italic: true, color: spec.rwTextColor });
    rwTxt.rotation.x = -0.99;
    rwTxt.position.set(0, 0.980, -2.393);
    chassis.add(rwTxt);
  }
  chassis.add(rod(0, 0.46, -1.60, 0, 0.875, -2.26, 0.024, M.carbon, true));   // 单中央天鹅颈支柱
  [-1, 1].forEach(function (sx) {
    var ep = box(0.014, 0.40, 0.55, spec.rwEndMat, sx * 0.505, 0.78, -2.32);
    chassis.add(ep);
    /* 2022 规则卷边：主翼端与端板顶的圆弧过渡 */
    var rollGeo = new THREE.TorusGeometry(0.048, 0.009, 8, 12, Math.PI / 2);
    if (sx < 0) rollGeo.rotateZ(Math.PI / 2);
    var roll = mesh(rollGeo, spec.rwMainMat, sx * 0.457, 0.928, -2.30);
    roll.scale.z = 13;
    chassis.add(roll);
    if (spec.rwEndStripe) {
      var st = box(0.015, 0.085, 0.55, stdMat(spec.rwEndStripe, 0.4, 0.3), sx * 0.5055, 0.70, -2.32);
      chassis.add(st);
    }
  });
  var beam1 = box(0.88, 0.012, 0.13, M.carbon, 0, 0.50, -2.12); beam1.rotation.x = -0.38;
  var beam2 = box(0.88, 0.012, 0.11, M.carbon, 0, 0.565, -2.18); beam2.rotation.x = -0.52;
  chassis.add(beam1, beam2);

  /* ---- 车轮 ---- */
  car.wheels = [];
  function buildWheel(x, z, width) {
    var g = new THREE.Group();
    var tyreGeo = new THREE.CylinderGeometry(0.36, 0.36, width, 28);
    tyreGeo.rotateZ(Math.PI / 2);
    g.add(mesh(tyreGeo, M.tyre, 0, 0, 0));
    [-1, 1].forEach(function (s) {
      var lipGeo = new THREE.TorusGeometry(0.335, 0.030, 10, 28);
      lipGeo.rotateY(Math.PI / 2);
      g.add(mesh(lipGeo, M.tyre, s * (width / 2 - 0.018), 0, 0));
      var discGeo = new THREE.CylinderGeometry(0.215, 0.215, 0.012, 24);
      discGeo.rotateZ(Math.PI / 2);
      g.add(mesh(discGeo, M.rim, s * (width / 2 - 0.004), 0, 0));
      var ringGeo = new THREE.TorusGeometry(0.13, 0.0095, 8, 24);
      ringGeo.rotateY(Math.PI / 2);
      g.add(mesh(ringGeo, spec.rimRingMat, s * (width / 2 + 0.004), 0, 0));
      var bandGeo = new THREE.TorusGeometry(0.30, 0.006, 6, 36);
      bandGeo.rotateY(Math.PI / 2);
      var band = mesh(bandGeo, tyreBandMat, s * (width / 2 + 0.001), 0, 0);
      band.castShadow = false;
      g.add(band);
    });
    var hub = mesh(new THREE.CylinderGeometry(0.05, 0.05, width + 0.02, 12), M.steel, 0, 0, 0);
    hub.geometry.rotateZ(Math.PI / 2);
    g.add(hub);
    g.position.set(x, 0.36, z);
    chassis.add(g);
    /* spinner：仅旋转轮组绕 X，转向 yaw 套在外层组上互不干扰 */
    var spinner = new THREE.Group();
    while (g.children.length) spinner.add(g.children[0]);
    g.add(spinner);
    var rec = { yawGrp: g, spin: spinner, front: z > 0 };
    car.wheels.push(rec);
    return rec;
  }
  buildWheel(-0.78, 1.80, 0.31); buildWheel(0.78, 1.80, 0.31);
  buildWheel(-0.76, -1.80, 0.40); buildWheel(0.76, -1.80, 0.40);

  /* ---- 悬挂 ---- */
  [-1, 1].forEach(function (sx) {
    /* 前 */
    chassis.add(rod(sx * 0.30, 0.50, 1.96, sx * 0.70, 0.45, 1.82, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.30, 0.50, 1.62, sx * 0.70, 0.45, 1.80, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.30, 0.26, 1.96, sx * 0.70, 0.27, 1.82, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.30, 0.26, 1.62, sx * 0.70, 0.27, 1.80, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.38, 0.56, 1.74, sx * 0.68, 0.30, 1.80, 0.011, M.carbon));
    /* 后 */
    chassis.add(rod(sx * 0.14, 0.45, -1.62, sx * 0.68, 0.43, -1.80, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.14, 0.45, -1.95, sx * 0.68, 0.43, -1.82, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.14, 0.26, -1.62, sx * 0.68, 0.28, -1.80, 0.012, M.carbon, true));
    chassis.add(rod(sx * 0.16, 0.52, -1.72, sx * 0.66, 0.30, -1.80, 0.011, M.carbon));
    /* 传动半轴 */
    chassis.add(rod(sx * 0.10, 0.36, -1.74, sx * 0.68, 0.36, -1.80, 0.020, M.steel));
  });

  /* 车手名牌（贴在座舱侧壁） */
  var nameTag = decal(spec.driverTag, 0.42, 0.05, { cw: 768, ch: 96, size: 56, weight: 700, color: '#ffffff' });
  nameTag.rotation.y = Math.PI / 2;
  nameTag.position.set(0.300, 0.38, 0.62);
  var nameTag2 = nameTag.clone(); nameTag2.position.x = -0.300; nameTag2.rotation.y = -Math.PI / 2;
  chassis.add(nameTag, nameTag2);

  /* ================= 引擎舱内部（internals） ================= */
  /* V6 缸体 + 缸盖 */
  var block = box(0.46, 0.36, 0.58, M.engine, 0, 0.40, -0.52);
  var headL = box(0.16, 0.10, 0.54, spec.camCoverMat, -0.135, 0.565, -0.52); headL.rotation.z = 0.5;
  var headR = box(0.16, 0.10, 0.54, spec.camCoverMat, 0.135, 0.565, -0.52); headR.rotation.z = -0.5;
  internals.add(block, headL, headR);
  /* 进气总管 + 歧管 */
  var plenum = mesh(new THREE.SphereGeometry(1, 18, 14), M.carbon, 0, 0.70, -0.46);
  plenum.scale.set(0.155, 0.115, 0.30);
  internals.add(plenum);
  var snorkel = mesh(new THREE.CylinderGeometry(0.065, 0.10, 0.42, 14), M.carbon, 0, 0.80, -0.13);
  snorkel.geometry.rotateX(Math.PI / 2);
  snorkel.rotation.x = 0.62;
  internals.add(snorkel);
  for (var ri = 0; ri < 3; ri++) {
    var rz = -0.34 - ri * 0.16;
    internals.add(rod(-0.05, 0.66, rz, -0.135, 0.60, rz, 0.020, M.silver));
    internals.add(rod(0.05, 0.66, rz, 0.135, 0.60, rz, 0.020, M.silver));
  }
  /* 涡轮增压器（引擎后端） */
  var turboSpiral = mesh(new THREE.TorusGeometry(0.065, 0.040, 12, 22), M.silver, 0, 0.46, -0.90);
  var turboCore = mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.17, 12), M.steel, 0, 0.46, -0.90);
  turboCore.geometry.rotateX(Math.PI / 2);
  var waste = pipe([[0.05, 0.40, -0.88], [0.10, 0.46, -1.05], [0.06, 0.50, -1.25]], 0.016, M.titan);
  internals.add(turboSpiral, turboCore, waste);
  /* 排气歧管（隔热金）×6 → 集合管 → 尾管 */
  [-1, 1].forEach(function (sx) {
    for (var ei = 0; ei < 3; ei++) {
      var ez = -0.34 - ei * 0.16;
      internals.add(pipe([
        [sx * 0.20, 0.50, ez],
        [sx * 0.27, 0.42, ez - 0.06],
        [sx * 0.20, 0.36, -0.80],
        [sx * 0.09, 0.38, -0.95]
      ], 0.019, M.gold));
    }
  });
  internals.add(pipe([[0, 0.40, -0.98], [0, 0.44, -1.35], [0, 0.52, -1.80]], 0.038, M.gold, 20));
  /* MGU-K / MGU-H / ERS 电池 + 高压线 */
  var mguk = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.20, 14), M.ers, -0.235, 0.275, -0.42);
  mguk.geometry.rotateX(Math.PI / 2);
  var mguh = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.16, 12), M.ers, 0, 0.585, -0.80);
  mguh.geometry.rotateX(Math.PI / 2);
  var battery = box(0.34, 0.125, 0.30, M.ers, 0, 0.155, -0.16);
  var hvCable = pipe([[-0.17, 0.16, -0.16], [-0.27, 0.21, -0.28], [-0.235, 0.27, -0.40]], 0.012, stdMat(0xff7a00, 0.5, 0.1));
  internals.add(mguk, mguh, battery, hvCable);
  /* 油箱（防爆油囊）位于座舱与引擎之间 */
  var fuel = box(0.36, 0.28, 0.16, stdMat(0x2c2f36, 0.8, 0.2), 0, 0.40, -0.14);
  internals.add(fuel);
  /* 左右散热器（侧箱内） */
  [-1, 1].forEach(function (sx) {
    var rad = box(0.055, 0.30, 0.56, M.radiator, sx * 0.345, 0.385, 0.06);
    rad.rotation.y = sx * -0.42;
    rad.rotation.z = sx * 0.18;
    internals.add(rad);
    internals.add(pipe([
      [sx * 0.30, 0.50, 0.10],
      [sx * 0.22, 0.56, -0.18],
      [sx * 0.12, 0.52, -0.38]
    ], 0.014, stdMat(0x4a6f8a, 0.5, 0.6)));
  });
  /* 机油壶 */
  var oil = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.18, 12), M.gold, 0.16, 0.32, -0.16);
  internals.add(oil);

  /* ---- 部件标注（中英双语） ---- */
  var lbAccent = spec.labelAccent;
  function lab(zh, en, x, y, z) {
    var s = partLabel(zh, en, lbAccent);
    s.position.set(x, y, z);
    labels.add(s);
  }
  lab('1.6L V6 涡轮混动引擎', '1.6L V6 Turbo-Hybrid Engine', 0, 1.10, -0.50);
  lab('涡轮增压器', 'Turbocharger', 0.42, 0.78, -1.00);
  lab('8速序列式变速箱', '8-Speed Sequential Gearbox', 0, 0.88, -1.50);
  lab('排气系统（隔热包覆）', 'Exhaust · Heat-Wrapped', -0.45, 0.55, -1.35);
  lab('散热器 / 中冷器', 'Radiators / Intercooler', -0.72, 0.78, 0.10);
  lab('ERS 混动电池组', 'ERS Battery Pack', 0.55, 0.28, -0.12);
  lab('MGU-K 动能回收电机', 'MGU-K Recovery Motor', -0.62, 0.14, -0.58);

  /* ---- 可拆部件基准位 & 幽灵（X 光）材质 ---- */
  car.group = root;
  car.chassis = chassis;
  car.cover = cover; car.podL = podL; car.podR = podR; car.noseG = noseG;
  car.internals = internals; car.labels = labels;
  car.coverBase = cover.position.clone();
  car.podLBase = podL.position.clone();
  car.podRBase = podR.position.clone();
  car.noseBase = noseG.position.clone();
  car.openT = 0; car.openGoal = 0;
  internals.visible = false;
  labels.visible = false;

  var ghostCache = new Map();
  function ghostOf(m) {
    if (!ghostCache.has(m)) {
      var g = new THREE.MeshPhysicalMaterial({   // 贴图双色材质取主漆色
        color: m.map ? paint.color.clone() : (m.color ? m.color.clone() : new THREE.Color(0x888888)),
        roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.16,
        depthWrite: false, clearcoat: 0.5 });
      ghostCache.set(m, g);
    }
    return ghostCache.get(m);
  }
  car.shellMeshes = [];
  [cover, podL, podR, noseG].forEach(function (grp) {
    grp.traverse(function (o) {
      if (o.isMesh) {
        o.userData.solidMat = o.material;
        o.userData.ghostMat = o.userData.isDecal ? o.material : ghostOf(o.material);
        car.shellMeshes.push(o);
      }
    });
  });

  /* 座舱第一视角锚点（车手眼位，面向车头 +Z） */
  car.eye = new THREE.Object3D();
  car.eye.position.set(0, 0.825, 0.40);
  car.eye.rotation.y = Math.PI;
  root.add(car.eye);
  /* 车载 T-cam 锚点：进气箱顶的经典转播机位，朝车头略俯视 */
  car.tcam = new THREE.Object3D();
  car.tcam.position.set(0, 0.985, 0.06);
  car.tcam.quaternion.setFromAxisAngle(V_Y, Math.PI)
    .multiply(new THREE.Quaternion().setFromAxisAngle(V_X, -0.085));
  root.add(car.tcam);

  return car;
}

/* ------------------------------------ 两辆车的涂装规格（对照实拍照片） ---- */
var ferrariPaint = phyMat(0xa60d15, 0.34, 0.25, 1.0, 0.07, { envMapIntensity: 0.95 });   // F1-75 深酒红
var ferrariDark = phyMat(0x550a0e, 0.45, 0.3, 0.8, 0.15);
var ferrariYellowGloss = phyMat(0xf2cc0d, 0.38, 0.2, 0.9, 0.1);                          // 蒙扎黄
var rbPaint = phyMat(0x0e1736, 0.55, 0.5, 0.5, 0.25, { envMapIntensity: 1.05 });         // 哑光深海军蓝
var rbDark = phyMat(0x0a102a, 0.6, 0.45, 0.4, 0.3);
var blackGloss = phyMat(0x0c0d10, 0.3, 0.4, 0.9, 0.1);
var rbRed = stdMat(0xd6273a, 0.42, 0.35);
var rbYellowGloss = phyMat(0xffcd0a, 0.4, 0.2, 0.8, 0.12);
var ferrariYellow = stdMat(0xf2cc0d, 0.45, 0.3);

/* 侧箱放样截面（cx 由 buildPod 按左右镜像） */
var PODS_FERRARI = [
  { z: 0.58,  cx: 0.500, cy: 0.405, rx: 0.125, ry: 0.115, e: 0.65 },  // F1-75 高位方口进气
  { z: 0.30,  cx: 0.555, cy: 0.345, rx: 0.195, ry: 0.150, e: 0.80 },
  { z: 0.00,  cx: 0.565, cy: 0.305, rx: 0.220, ry: 0.135, e: 0.90 },
  { z: -0.50, cx: 0.525, cy: 0.265, rx: 0.185, ry: 0.105, e: 1 },
  { z: -1.00, cx: 0.430, cy: 0.215, rx: 0.125, ry: 0.070, e: 1 },
  { z: -1.35, cx: 0.300, cy: 0.120, rx: 0.020, ry: 0.012, e: 1 }
];
var PODS_RB = [
  { z: 0.58,  cx: 0.520, cy: 0.375, rx: 0.115, ry: 0.095, e: 0.70 }, // RB 低位扁口进气
  { z: 0.30,  cx: 0.565, cy: 0.330, rx: 0.190, ry: 0.135, e: 0.85 },
  { z: 0.00,  cx: 0.575, cy: 0.295, rx: 0.210, ry: 0.125, e: 0.95 },
  { z: -0.55, cx: 0.530, cy: 0.250, rx: 0.175, ry: 0.090, e: 1 },
  { z: -1.05, cx: 0.420, cy: 0.200, rx: 0.110, ry: 0.055, e: 1 },
  { z: -1.38, cx: 0.290, cy: 0.115, rx: 0.018, ry: 0.010, e: 1 }
];
var PODS_MCL = [
  { z: 0.60,  cx: 0.505, cy: 0.392, rx: 0.118, ry: 0.108, e: 0.62 }, // MCL39 高窄进气口
  { z: 0.32,  cx: 0.560, cy: 0.345, rx: 0.192, ry: 0.142, e: 0.82 },
  { z: 0.00,  cx: 0.572, cy: 0.300, rx: 0.214, ry: 0.130, e: 0.92 },
  { z: -0.45, cx: 0.522, cy: 0.248, rx: 0.172, ry: 0.092, e: 1 },   // 大幅下洗斜坡
  { z: -0.95, cx: 0.412, cy: 0.188, rx: 0.108, ry: 0.054, e: 1 },
  { z: -1.36, cx: 0.288, cy: 0.112, rx: 0.018, ry: 0.010, e: 1 }
];

/* ---- 迈凯伦 MCL39：木瓜橙 × 炭黑 ----
   双色分界用 UV 贴图画出硬边：t∈[-δ, π+δ] 段（截面上半圈）涂木瓜橙，其余炭黑；
   δ 随放样方向 v 变化，就能画出侧箱上那道向后扬起的斜分界 */
var PAPAYA_CSS = '#ff7700', ANTHRACITE_CSS = '#16171b';     // 比 #ff8000 略深，抵消正午高光泛白
function srgbCol(hex) { return new THREE.Color(hex).convertSRGBToLinear(); }
function twoToneTex(deltaFn) {
  return canvasTex(512, 256, function (x, w, h) {
    x.fillStyle = ANTHRACITE_CSS; x.fillRect(0, 0, w, h);
    x.fillStyle = PAPAYA_CSS;
    var N = 48;
    [-1, 0, 1].forEach(function (off) {         // 平移三份处理 u 方向绕接
      x.beginPath();
      for (var k = 0; k <= N; k++) {
        var v = k / N, d = deltaFn(v) / (Math.PI * 2);
        var px = (-d + off) * w, py = (1 - v) * h;
        if (k === 0) x.moveTo(px, py); else x.lineTo(px, py);
      }
      for (var k2 = N; k2 >= 0; k2--) {
        var v2 = k2 / N, d2 = deltaFn(v2) / (Math.PI * 2);
        x.lineTo((0.5 + d2 + off) * w, (1 - v2) * h);
      }
      x.closePath(); x.fill();
    });
  });
}
function mclTwoTone(deltaFn) {
  var m = phyMat(0xffffff, 0.36, 0.2, 1.0, 0.08, { envMapIntensity: 0.75 });
  m.map = twoToneTex(deltaFn);
  return m;
}
var mclPaint = phyMat(0xffffff, 0.36, 0.2, 1.0, 0.08, { envMapIntensity: 0.75 });
mclPaint.color.copy(srgbCol(0xff7700));                                   // 木瓜橙
var mclBlack = phyMat(0x0c0d10, 0.32, 0.35, 0.9, 0.1);                    // 炭黑亮面
var mclPapayaStd = stdMat(0xffffff, 0.42, 0.3);
mclPapayaStd.color.copy(srgbCol(0xff7700));

var SPEC_FERRARI = {
  id: 'ferrari', cnName: '法拉利 F1-75',
  paintMat: ferrariPaint, paint2Mat: ferrariDark,
  accent: 0xf2cc0d,
  haloColor: 0xa60d15,
  beltColor: 0xc41420,
  number: '16', numColor: '#ffffff', numStroke: 'rgba(20,20,20,0.55)',
  numPos: [0, 0.502, 1.78],
  noseRx: 1.08, podSecs: PODS_FERRARI, podMaxX: 0.785,
  noseTipMat: blackGloss,                                  // 实拍：黑色鼻尖
  wing3Mat: phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),       // 实拍：黑色前翼
  wing4Mat: phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),
  endplateMat: phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),
  epTipMat: blackGloss,                                    // 实拍：端板翼尖同为黑色
  hatchColor: '#f2cc0d',                                   // 实拍：引擎盖肩部蒙扎黄斜纹
  finMat: ferrariPaint,
  rwMainMat: ferrariYellowGloss,                           // 实拍：蒙扎黄尾翼
  flapMat: ferrariYellowGloss,
  rwEndMat: ferrariYellowGloss, rwEndStripe: null,
  rwText: 'Ferrari', rwTextColor: '#16181d',
  airboxMat: ferrariYellowGloss,
  tyreBand: 0xf2cc0d,                                      // 实拍：黄圈轮胎
  camCoverMat: stdMat(0xb02020, 0.62, 0.35),
  rimRingMat: ferrariYellow,
  podText: 'F E R R A R I', podTextColor: '#ffffff', podItalic: false, podFlash: 0xf2cc0d,
  driverTag: 'C. LECLERC  ·  16',
  labelAccent: 'rgba(255,90,90,0.9)',
  dashAccent: '#ffe14a', dashTag: 'F1-75',
  plaque1: 'Scuderia Ferrari F1-75', plaqueAccent: '#e8b34b',
  specHTML:
    '<h3>法拉利 F1-75<span>Scuderia Ferrari · 蒙扎特别涂装</span></h3>' +
    '<div class="row"><b>动力单元</b><i>Ferrari 066/7 · 1.6L V6 涡轮增压混动</i></div>' +
    '<div class="row"><b>综合功率</b><i>≈ 1,000 hp（内燃机 + ERS）</i></div>' +
    '<div class="row"><b>变速箱</b><i>8 速序列式半自动</i></div>' +
    '<div class="row"><b>车手</b><i>#16 勒克莱尔 · #55 塞恩斯</i></div>' +
    '<div class="row"><b>整车尺寸</b><i>长 ≈ 5.6 m · 轴距 3.6 m</i></div>',
  specHTMLen:
    '<h3>Ferrari F1-75<span>Scuderia Ferrari · Monza special livery</span></h3>' +
    '<div class="row"><b>Power unit</b><i>Ferrari 066/7 · 1.6L V6 turbo-hybrid</i></div>' +
    '<div class="row"><b>Output</b><i>≈ 1,000 hp (ICE + ERS)</i></div>' +
    '<div class="row"><b>Gearbox</b><i>8-speed sequential</i></div>' +
    '<div class="row"><b>Drivers</b><i>#16 Leclerc · #55 Sainz</i></div>' +
    '<div class="row"><b>Dimensions</b><i>length ≈ 5.6 m · wheelbase 3.6 m</i></div>'
};
var SPEC_REDBULL = {
  id: 'redbull', cnName: '红牛 RB21',
  paintMat: rbPaint, paint2Mat: rbDark,
  accent: 0xffcd0a,
  haloColor: 0x0e1736,
  beltColor: 0x20356e,
  number: '30', numColor: '#ffffff', numStroke: null, numSize: 138,
  numPos: [0, 0.492, 1.95],
  noseRx: 0.93, podSecs: PODS_RB, podMaxX: 0.785,
  noseBand: 0xd0202e,                                      // 实拍：鼻锥红色号码带
  noseTipMat: rbYellowGloss,                               // 实拍：黄色鼻尖
  wing3Mat: rbDark, wing4Mat: rbDark, endplateMat: rbPaint,
  epTipMat: rbYellowGloss,                                 // 实拍：前翼端板黄色翼尖
  wingScript: 'Red Bull', wingScriptColor: '#d0202e',      // 实拍：前翼红色大字
  finMat: rbPaint,
  rwMainMat: rbPaint, flapMat: rbPaint,
  rwEndMat: rbPaint, rwEndStripe: 0xd6273a,
  rwText: 'RED BULL', rwTextColor: '#eef1f6',
  airboxMat: rbYellowGloss,                                // 实拍：黄色进气口
  tyreBand: 0x1d1f24,
  camCoverMat: stdMat(0x33363e, 0.6, 0.6),
  rimRingMat: rbRed,
  podText: 'RED BULL', podTextColor: '#e8eaf0', podItalic: true, podFlash: 0xd6273a,
  driverTag: 'L. LAWSON  ·  30',
  labelAccent: 'rgba(120,160,255,0.95)',
  dashAccent: '#5e8cff', dashTag: 'RB21',
  plaque1: 'Oracle Red Bull Racing RB21', plaqueAccent: '#5e8cff',
  specHTML:
    '<h3>红牛 RB21<span>Oracle Red Bull Racing</span></h3>' +
    '<div class="row"><b>动力单元</b><i>Honda RBPT · 1.6L V6 涡轮增压混动</i></div>' +
    '<div class="row"><b>综合功率</b><i>≈ 1,000 hp（内燃机 + ERS）</i></div>' +
    '<div class="row"><b>变速箱</b><i>8 速序列式半自动</i></div>' +
    '<div class="row"><b>车手</b><i>#1 维斯塔潘 · #30 劳森</i></div>' +
    '<div class="row"><b>整车尺寸</b><i>长 ≈ 5.6 m · 轴距 3.6 m</i></div>',
  specHTMLen:
    '<h3>Red Bull RB21<span>Oracle Red Bull Racing</span></h3>' +
    '<div class="row"><b>Power unit</b><i>Honda RBPT · 1.6L V6 turbo-hybrid</i></div>' +
    '<div class="row"><b>Output</b><i>≈ 1,000 hp (ICE + ERS)</i></div>' +
    '<div class="row"><b>Gearbox</b><i>8-speed sequential</i></div>' +
    '<div class="row"><b>Drivers</b><i>#1 Verstappen · #30 Lawson</i></div>' +
    '<div class="row"><b>Dimensions</b><i>length ≈ 5.6 m · wheelbase 3.6 m</i></div>'
};
var SPEC_MCLAREN = {
  id: 'mclaren', cnName: '迈凯伦 MCL39',
  paintMat: mclPaint, paint2Mat: mclBlack,
  tubMat: mclTwoTone(function () { return -0.10; }),          // 座舱：上橙下黑
  noseMat: mclTwoTone(function () { return -0.30; }),         // 鼻锥：顶面橙、两侧与底面黑
  podMat: mclTwoTone(function (v) {                           // 侧箱：前段橙为主，向后黑色斜扬
    var k = THREE.MathUtils.smoothstep(v, 0.42, 1.0);
    return 0.32 - 0.95 * k;
  }),
  accent: 0xff8000,
  haloMat: mclPaint,
  beltColor: 0xff4a00,
  number: '4', numColor: '#16171b', numStroke: null, numSize: 176,
  numPos: [0, 0.502, 1.80],
  noseRx: 0.95, podSecs: PODS_MCL, podMaxX: 0.787,
  noseTipMat: mclBlack,                                       // 黑色鼻尖
  wing3Mat: mclBlack, wing4Mat: mclPaint,                     // 前翼：黑主翼 + 橙色上襟翼
  endplateMat: mclBlack, epTipMat: mclPaint,
  finMat: mclPaint,
  rwMainMat: mclBlack, flapMat: mclPaint,                     // 尾翼：黑主翼 + 橙襟翼
  rwEndMat: mclBlack, rwEndStripe: 0xff3a00,
  rwText: 'McLaren', rwTextColor: '#16171b',
  airboxMat: mclBlack,
  tyreBand: 0xe9e9e6,                                         // 白圈硬胎
  camCoverMat: stdMat(0xc6cad1, 0.4, 0.85),                   // 梅赛德斯动力单元银色缸盖
  rimRingMat: mclPapayaStd,
  podText: 'McLaren', podTextColor: '#16171b', podItalic: false, podFlash: null,
  driverTag: 'L. NORRIS  ·  4',
  labelAccent: 'rgba(255,140,40,0.95)',
  dashAccent: '#ff8a1c', dashTag: 'MCL39',
  plaque1: 'McLaren Formula 1 MCL39', plaqueAccent: '#ff8000',
  specHTML:
    '<h3>迈凯伦 MCL39<span>McLaren Formula 1 Team · 2025 车队 & 车手双冠</span></h3>' +
    '<div class="row"><b>动力单元</b><i>Mercedes-AMG M16 · 1.6L V6 涡轮增压混动</i></div>' +
    '<div class="row"><b>综合功率</b><i>≈ 1,000 hp（内燃机 + ERS）</i></div>' +
    '<div class="row"><b>变速箱</b><i>8 速序列式半自动</i></div>' +
    '<div class="row"><b>车手</b><i>#4 诺里斯 · #81 皮亚斯特里</i></div>' +
    '<div class="row"><b>整车尺寸</b><i>长 ≈ 5.6 m · 轴距 3.6 m</i></div>',
  specHTMLen:
    '<h3>McLaren MCL39<span>McLaren Formula 1 Team · 2025 double champions</span></h3>' +
    '<div class="row"><b>Power unit</b><i>Mercedes-AMG M16 · 1.6L V6 turbo-hybrid</i></div>' +
    '<div class="row"><b>Output</b><i>≈ 1,000 hp (ICE + ERS)</i></div>' +
    '<div class="row"><b>Gearbox</b><i>8-speed sequential</i></div>' +
    '<div class="row"><b>Drivers</b><i>#4 Norris · #81 Piastri</i></div>' +
    '<div class="row"><b>Dimensions</b><i>length ≈ 5.6 m · wheelbase 3.6 m</i></div>'
};
SPEC_FERRARI.simOffset = 0; SPEC_REDBULL.simOffset = 5.2; SPEC_MCLAREN.simOffset = 9.6;   // 仪表模拟错相

/* ------------------------------------------------------ 组装到展台 ---- */
var cars = [];
function placeCar(spec, x, ry) {
  buildSign(x * 1.08, 3.75, spec.plaque1, spec.plaqueAccent);
  var car = buildF1Car(spec);
  var wrap = new THREE.Group();
  wrap.position.set(x, 0.012, 0);
  wrap.rotation.y = ry;
  wrap.add(car.group);
  scene.add(wrap);
  car.wrap = wrap;
  car.center = new THREE.Vector3(x, 0.55, 0);
  car.rayMeshes = [];
  car.group.traverse(function (o) {
    if (o.isMesh && !o.userData.noRay) { o.userData.carRef = car; car.rayMeshes.push(o); }
  });
  car.baseRotY = ry;
  car.homeX = x;
  car.runZ = 0; car.runV = 0; car.runSteer = 0;
  cars.push(car);
  return car;
}
/* 三车并排：法拉利（左）· 迈凯伦（中）· 红牛（右），两侧车头微向内收 */
var ferrari = placeCar(SPEC_FERRARI, -4.0, 0.20);
var mclaren = placeCar(SPEC_MCLAREN, 0, 0);
var redbull = placeCar(SPEC_REDBULL, 4.0, -0.20);
var CAR_BY_ID = { ferrari: ferrari, mclaren: mclaren, redbull: redbull };
var focusCar = ferrari;

/* ------------------------------------------------ 方向盘仪表屏模拟 ---- */
function driveSim(t) {
  var cycle = 14, k = (t % cycle) / cycle;
  var speed;
  if (k < 0.58)      speed = 92 + (334 - 92) * (1 - Math.pow(1 - k / 0.58, 2.2));
  else if (k < 0.70) speed = 334 - (334 - 128) * ((k - 0.58) / 0.12);
  else if (k < 0.82) speed = 128 + 18 * Math.sin((k - 0.70) / 0.12 * Math.PI);
  else if (k < 0.94) speed = 128 + (240 - 128) * ((k - 0.82) / 0.12);
  else               speed = 240 - (240 - 92) * ((k - 0.94) / 0.06);
  var gearF = speed / 46;
  var gear = Math.max(1, Math.min(8, Math.floor(gearF) + 1));
  var frac = gearF - Math.floor(gearF);
  var braking = (k >= 0.58 && k < 0.70);
  var rpmFrac = braking ? 0.42 + 0.2 * frac : 0.48 + 0.52 * frac;
  return { speed: Math.round(speed), gear: gear, rpm: rpmFrac, ers: 0.35 + 0.6 * Math.abs(Math.sin(t * 0.35)), drs: speed > 290, braking: braking, t: t };
}
function drawDash(car, sim) {
  var x = car.dash.ctx, w = 256, h = 144;
  var ac = car.spec.dashAccent;
  x.fillStyle = '#04050a'; x.fillRect(0, 0, w, h);
  /* 转速灯条 */
  var lit = Math.round(sim.rpm * 15);
  var flash = sim.rpm > 0.965 && (Math.floor(sim.t * 14) % 2 === 0);
  for (var i = 0; i < 15; i++) {
    var cx = 16 + i * 16;
    x.beginPath(); x.arc(cx, 14, 5.6, 0, Math.PI * 2);
    if (flash) { x.fillStyle = '#c46bff'; }
    else if (i < lit) { x.fillStyle = i < 5 ? '#2ecc40' : (i < 10 ? '#ff3b30' : '#4a6cff'); }
    else { x.fillStyle = '#1a1d26'; }
    x.fill();
  }
  /* 档位 */
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '900 66px Arial';
  x.fillStyle = ac;
  x.fillText(String(sim.gear), w / 2, 74);
  x.font = '600 11px Arial'; x.fillStyle = '#5a6075';
  x.fillText('GEAR', w / 2, 110);
  /* 车速 */
  x.font = '800 34px Arial'; x.fillStyle = '#ffffff';
  x.fillText(String(sim.speed), 52, 66);
  x.font = '600 12px Arial'; x.fillStyle = '#5a6075';
  x.fillText('km/h', 52, 88);
  /* 圈速增量（进站时换成闪烁的限速器提示） */
  if (sim.pit) {
    x.font = '800 18px Arial'; x.fillStyle = (Math.floor(sim.t * 5) % 2) ? '#4aa3ff' : '#1c4c86';
    x.fillText('PIT', 204, 58);
    x.font = '600 11px Arial'; x.fillStyle = '#5a6075';
    x.fillText('LIMITER', 204, 76);
  } else {
    x.font = '700 17px Arial'; x.fillStyle = '#2ecc40';
    x.fillText('-0.18', 204, 58);
    x.font = '600 11px Arial'; x.fillStyle = '#5a6075';
    x.fillText('DELTA', 204, 76);
  }
  /* ERS 条 */
  x.fillStyle = '#15181f'; x.fillRect(150, 96, 92, 9);
  x.fillStyle = '#2ecc40'; x.fillRect(150, 96, 92 * sim.ers, 9);
  x.font = '600 10px Arial'; x.fillStyle = '#5a6075'; x.textAlign = 'left';
  x.fillText('ERS', 150, 90);
  /* DRS */
  x.textAlign = 'center';
  x.font = '800 15px Arial';
  if (sim.drs) { x.fillStyle = '#2ecc40'; x.fillText('DRS', 30, 124); }
  else { x.strokeStyle = '#2a2e3c'; x.strokeRect(12, 112, 36, 18); x.fillStyle = '#3a4054'; x.fillText('DRS', 30, 122); }
  /* 圈数 + 车型 */
  x.fillStyle = '#8a92ad'; x.font = '700 13px Arial';
  x.fillText('LAP 23 / 57', w / 2, 130);
  x.textAlign = 'right'; x.fillStyle = ac; x.font = '800 13px Arial';
  x.fillText(car.spec.dashTag, w - 10, 130);
  car.dash.tex.needsUpdate = true;
}

/* ---------------------------------------------------- 中 / 英 语言包 ---- */
var I18N = {
  zh: {
    docTitle: 'F1 暗夜车库实景 3D · 法拉利 × 迈凯伦 × 红牛',
    title: 'F1 暗夜车库 3D 实景', badge: '实拍还原',
    sub: '法拉利 F1-75 × 迈凯伦 MCL39 × 红牛 RB21 — 360° 环绕 · 驾驶舱 / T-cam / 航拍机位 · 进站换胎 · 分层拆解',
    lblScene: '场 景', sceneTrack: '🏜️ 摩洛哥赛道', sceneGarage: '🌃 暗夜车库',
    lblTime: '时 段', timeNoon: '☀️ 正午', timeSunset: '🌅 黄昏', timeNight: '🌙 夜战',
    photo: '📷 拍照模式', photoSave: '📸 保存壁纸', photoExit: '✕ 退出拍照',
    lblCar: '车 辆', lblView: '视 角', lblLayer: '结构层', lblDrive: '演 示',
    carF: '🟥 法拉利 F1-75', carM: '🟧 迈凯伦 MCL39', carR: '🟦 红牛 RB21',
    viewOrbit: '360° 环绕', viewCockpit: '驾驶舱', viewTcam: '📹 T-cam', viewAerial: '🚁 航拍',
    layerFull: '完整车身', layerXray: 'X 光透视', layerOpen: '拆解引擎',
    spinOn: '⟳ 旋转：开', spinOff: '⟳ 旋转：关',
    launch: '🚦 起跑', launchStop: '■ 结束起跑',
    pit: '🔧 进站换胎', pitStop: '■ 结束进站',
    soundOn: '🔊 声浪：开', soundOff: '🔇 声浪：关',
    langBtn: '🌐 English',
    hint: '拖动旋转 · 滚轮 / 双指缩放<br>右键拖动平移 · 点击赛车聚焦',
    tip: '拖动环顾四周 · 方向盘中央即仪表屏（转速灯 / 档位 / 车速 / ERS）· 滚轮调整视野',
    tipTcam: '车载 T-cam：车手头顶的经典转播机位 · 拖动环顾 · 滚轮调整视野 · 试试起跑！',
    tipAerial: '航拍：左右拖动绕场盘旋 · 上下拖动调高度 · 滚轮推拉 · 点击赛车切换参数卡',
    pitTag: 'PIT STOP · 进站', pitReplay: 'REPLAY · 0.4× 慢放', pitLbl: '停车时间',
    pitWait: '赛车进站中…', pitNew: '新胎',
    tyreSoft: '软胎', tyreMedium: '中性胎', tyreHard: '硬胎',
    rateTop: '🔥 世界级', rateGood: '✅ 优秀', rateOk: '👍 稳健'
  },
  en: {
    docTitle: 'F1 Night Garage 3D · Ferrari × McLaren × Red Bull',
    title: 'F1 Night Garage in 3D', badge: 'PHOTO-MATCHED',
    sub: 'Ferrari F1-75 × McLaren MCL39 × Red Bull RB21 — 360° orbit · cockpit / T-cam / aerial · pit stop · engine teardown',
    lblScene: 'SCENE', sceneTrack: '🏜️ Marrakesh Track', sceneGarage: '🌃 Night Garage',
    lblTime: 'TIME', timeNoon: '☀️ Noon', timeSunset: '🌅 Sunset', timeNight: '🌙 Night',
    photo: '📷 Photo', photoSave: '📸 Save Wallpaper', photoExit: '✕ Exit Photo',
    lblCar: 'CAR', lblView: 'VIEW', lblLayer: 'LAYERS', lblDrive: 'DEMOS',
    carF: '🟥 Ferrari F1-75', carM: '🟧 McLaren MCL39', carR: '🟦 Red Bull RB21',
    viewOrbit: '360° Orbit', viewCockpit: 'Cockpit', viewTcam: '📹 T-Cam', viewAerial: '🚁 Aerial',
    layerFull: 'Full', layerXray: 'X-Ray', layerOpen: 'Teardown',
    spinOn: '⟳ Spin: ON', spinOff: '⟳ Spin: OFF',
    launch: '🚦 Launch', launchStop: '■ Stop',
    pit: '🔧 Pit Stop', pitStop: '■ Stop',
    soundOn: '🔊 Sound', soundOff: '🔇 Sound',
    langBtn: '🌐 中文',
    hint: 'Drag to orbit · scroll / pinch to zoom<br>right-drag to pan · click a car to focus',
    tip: 'Drag to look around · the wheel screen is your dash (RPM LEDs / gear / speed / ERS) · scroll adjusts FOV',
    tipTcam: 'Onboard T-cam: the classic TV shot above the driver · drag to look around · scroll adjusts FOV · try a launch!',
    tipAerial: 'Aerial: drag sideways to circle · drag up/down for altitude · scroll to zoom · click a car for its spec card',
    pitTag: 'PIT STOP', pitReplay: 'REPLAY · 0.4×', pitLbl: 'Stationary',
    pitWait: 'Car entering pits…', pitNew: 'New',
    tyreSoft: 'Soft', tyreMedium: 'Medium', tyreHard: 'Hard',
    rateTop: '🔥 World-class', rateGood: '✅ Great', rateOk: '👍 Solid'
  }
};
var lang = 'zh';
function specHTMLFor(car) {
  return lang === 'zh' ? car.spec.specHTML : car.spec.specHTMLen;
}

/* ------------------------------------------------------ 相机控制 ---- */
var ctrl = {
  mode: 'orbit',                       // orbit | cockpit | tcam | aerial | anim | launch | pit
  view: 'orbit',                       // orbit | cockpit | tcam | aerial（用户选择的视角）
  target: new THREE.Vector3(0, 0.55, 0),
  targetGoal: new THREE.Vector3(0, 0.55, 0),
  sph: new THREE.Spherical(17, 1.13, 0.50),
  sphGoal: new THREE.Spherical(12.5, 1.16, 0.46),
  yaw: 0, pitch: 0, yawGoal: 0, pitchGoal: 0,
  fovOrbit: 40, fovCockpit: 66, fovCockpitGoal: 66, fovTcam: 60, fovAerial: 34,
  /* 航拍机位：绕场方位 / 水平半径 / 高度。俯角 ≈43°，盘旋一圈都能越过看台顶棚 */
  aer: { theta: 0.25, r: 26, h: 24 },
  aerGoal: { theta: 0.25, r: 26, h: 24 },
  auto: true
};
var R_MIN = 1.1, R_MAX = 20;
var camAnim = null;
function easeIO(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
function isOnboard(v) { return v === 'cockpit' || v === 'tcam'; }
function orbitPose() {
  var p = new THREE.Vector3().setFromSpherical(ctrl.sphGoal).add(ctrl.targetGoal);
  var m = new THREE.Matrix4().lookAt(p, ctrl.targetGoal, V_Y);
  return { p: p, q: new THREE.Quaternion().setFromRotationMatrix(m) };
}
function cockpitPose(car) {
  return {
    p: car.eye.getWorldPosition(new THREE.Vector3()),
    q: car.eye.getWorldQuaternion(new THREE.Quaternion())
  };
}
function tcamPose(car) {
  return {
    p: car.tcam.getWorldPosition(new THREE.Vector3()),
    q: car.tcam.getWorldQuaternion(new THREE.Quaternion())
  };
}
function onboardPose(car, v) { return v === 'tcam' ? tcamPose(car) : cockpitPose(car); }
/* 航拍机位：赛道上是直升机高空盘旋，车库里是顶棚吊臂机位（不穿出屋顶） */
function aerialCenter() {
  return sceneMode === 'garage' ? new THREE.Vector3(0, 0.3, 0) : new THREE.Vector3(0, 0.3, 3);
}
function aerialLimits() {
  return sceneMode === 'garage'
    ? { rMin: 2.5, rMax: 8.5, hMin: 3.6, hMax: 6.2 }
    : { rMin: 7, rMax: 50, hMin: 5, hMax: 42 };
}
function clampAerial(a) {
  var L = aerialLimits();
  a.r = THREE.MathUtils.clamp(a.r, L.rMin, L.rMax);
  a.h = THREE.MathUtils.clamp(a.h, L.hMin, L.hMax);
}
function aerialPose(a, bob) {
  var c = aerialCenter();
  var p = new THREE.Vector3(c.x + Math.sin(a.theta) * a.r, a.h + (bob || 0), c.z + Math.cos(a.theta) * a.r);
  var m = new THREE.Matrix4().lookAt(p, c, V_Y);
  return { p: p, q: new THREE.Quaternion().setFromRotationMatrix(m) };
}
/* 近裁剪面随机位切换：贴脸机位要小，高空航拍放大以免远处路肩深度闪烁 */
function setNear(n) {
  if (Math.abs(camera.near - n) > 1e-6) { camera.near = n; camera.updateProjectionMatrix(); }
}
function flyTo(pose, fovEnd, dur, endMode) {
  camAnim = {
    start: performance.now(), dur: dur,
    p0: camera.position.clone(), q0: camera.quaternion.clone(), f0: camera.fov,
    p1: pose.p, q1: pose.q, f1: fovEnd,
    lift: camera.position.distanceTo(pose.p) * 0.10,
    endMode: endMode
  };
  ctrl.mode = 'anim';
}

/* ------------------------------------------------------ 指针交互 ---- */
var pointers = new Map();
var pinchD0 = 0, pinchR0 = 0, movedPx = 0, downTime = 0;
var spinBtn = document.getElementById('btnSpin');
function setAuto(v) {
  ctrl.auto = v;
  spinBtn.textContent = v ? I18N[lang].spinOn : I18N[lang].spinOff;
  spinBtn.classList.toggle('active', v);
}
canvas.addEventListener('pointerdown', function (e) {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, b: e.button });
  movedPx = 0; downTime = performance.now();
  if (pointers.size === 2) {
    var pts = Array.from(pointers.values());
    pinchD0 = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    pinchR0 = ctrl.mode === 'aerial' ? ctrl.aerGoal.r : ctrl.sphGoal.radius;
    pinchH0 = ctrl.aerGoal.h;
  }
});
var pinchH0 = 0;
/* 航拍推拉：半径与高度同比缩放（沿视线推近 / 拉远） */
function aerialZoom(f) {
  var L = aerialLimits();
  f = THREE.MathUtils.clamp(f, L.rMin / ctrl.aerGoal.r, L.rMax / ctrl.aerGoal.r);
  f = THREE.MathUtils.clamp(f, L.hMin / ctrl.aerGoal.h, L.hMax / ctrl.aerGoal.h);
  ctrl.aerGoal.r *= f; ctrl.aerGoal.h *= f;
}
canvas.addEventListener('pointermove', function (e) {
  var pt = pointers.get(e.pointerId);
  if (!pt) return;
  var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
  pt.x = e.clientX; pt.y = e.clientY;
  movedPx += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 1) {
    if (ctrl.mode === 'cockpit' || ctrl.mode === 'tcam') {
      ctrl.yawGoal = THREE.MathUtils.clamp(ctrl.yawGoal - dx * 0.0042, -2.6, 2.6);
      ctrl.pitchGoal = THREE.MathUtils.clamp(ctrl.pitchGoal - dy * 0.0035, -0.8, 0.55);
    } else if (ctrl.mode === 'aerial') {
      ctrl.aerGoal.theta -= dx * 0.0045;
      ctrl.aerGoal.h += dy * ctrl.aerGoal.h * 0.004;      // 上下拖动调飞行高度
      clampAerial(ctrl.aerGoal);
      if (ctrl.auto) setAuto(false);
    } else if (ctrl.mode === 'orbit') {
      if (pt.b === 2) {
        panBy(dx, dy);
      } else {
        ctrl.sphGoal.theta -= dx * 0.0052;
        ctrl.sphGoal.phi = THREE.MathUtils.clamp(ctrl.sphGoal.phi - dy * 0.0042, 0.10, 1.52);
        if (ctrl.auto) setAuto(false);
      }
    }
  } else if (pointers.size === 2 && ctrl.mode === 'orbit') {
    var pts = Array.from(pointers.values());
    var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
    ctrl.sphGoal.radius = THREE.MathUtils.clamp(pinchR0 * pinchD0 / d, R_MIN, R_MAX);
    panBy(dx * 0.5, dy * 0.5);
  } else if (pointers.size === 2 && ctrl.mode === 'aerial') {
    var pts2 = Array.from(pointers.values());
    var d2 = Math.hypot(pts2[0].x - pts2[1].x, pts2[0].y - pts2[1].y) || 1;
    ctrl.aerGoal.r = pinchR0; ctrl.aerGoal.h = pinchH0;
    aerialZoom(pinchD0 / d2);
  }
});
function panBy(dx, dy) {
  var s = ctrl.sphGoal.radius * 0.0011;
  var right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
  ctrl.targetGoal.addScaledVector(right, -dx * s);
  ctrl.targetGoal.y = THREE.MathUtils.clamp(ctrl.targetGoal.y + dy * s, 0.15, 4.5);
  ctrl.targetGoal.x = THREE.MathUtils.clamp(ctrl.targetGoal.x, -9, 9);
  ctrl.targetGoal.z = THREE.MathUtils.clamp(ctrl.targetGoal.z, -7, 8);
}
function endPointer(e) {
  if (pointers.has(e.pointerId)) {
    pointers.delete(e.pointerId);
    if (movedPx < 7 && performance.now() - downTime < 350 &&
        (ctrl.mode === 'orbit' || ctrl.mode === 'aerial') && e.button !== 2) {
      clickFocus(e);
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  if (ctrl.mode === 'cockpit' || ctrl.mode === 'tcam') {
    ctrl.fovCockpitGoal = THREE.MathUtils.clamp(ctrl.fovCockpitGoal + e.deltaY * 0.02, 35, 80);
  } else if (ctrl.mode === 'aerial') {
    aerialZoom(Math.exp(e.deltaY * 0.0011));
  } else {
    ctrl.sphGoal.radius = THREE.MathUtils.clamp(
      ctrl.sphGoal.radius * Math.exp(e.deltaY * 0.0011), R_MIN, R_MAX);
  }
}, { passive: false });
canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

var raycaster = new THREE.Raycaster();
function clickFocus(e) {
  var ndc = new THREE.Vector2(
    (e.clientX / window.innerWidth) * 2 - 1,
    -(e.clientY / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  var all = [];
  cars.forEach(function (c) { all = all.concat(c.rayMeshes); });
  var hits = raycaster.intersectObjects(all, false);
  if (hits.length) setFocus(hits[0].object.userData.carRef, true);
}

/* ---------------------------------------------------------- 状态机 ---- */
var layerMode = 'full';
function stopDemos() {                 // 起跑 / 进站演示互斥，任何手动操作都先结束演示
  if (launchActive) stopLaunch(true);
  if (pitActive) stopPit(true);
}
function setLayer(mode) {
  stopDemos();
  layerMode = mode;
  cars.forEach(function (car) {
    car.openGoal = (mode === 'open') ? 1 : 0;
    var ghost = (mode === 'xray');
    car.shellMeshes.forEach(function (m) {
      m.material = ghost ? m.userData.ghostMat : m.userData.solidMat;
      if (m.userData.isDecal) m.visible = !ghost;
      m.castShadow = !ghost && !m.userData.isDecal;
    });
    car.internals.visible = (mode !== 'full');
    car.labels.visible = (mode !== 'full');
  });
  document.querySelectorAll('[data-layer]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-layer') === mode);
  });
}
/* 视角提示条：驾驶舱 / T-cam / 航拍各有操作说明；演示进行时隐藏 */
function updateViewTip() {
  var tip = document.getElementById('cockpitTip');
  var v = ctrl.view, t = I18N[lang];
  tip.textContent = v === 'tcam' ? t.tipTcam : (v === 'aerial' ? t.tipAerial : t.tip);
  tip.classList.toggle('hidden', v === 'orbit' || launchActive || pitActive);
}
function setView(mode) {
  stopDemos();
  if (ctrl.view === mode) return;
  ctrl.view = mode;
  if (isOnboard(mode)) {
    ctrl.yaw = ctrl.yawGoal = 0;
    ctrl.pitch = ctrl.pitchGoal = 0;
    ctrl.fovCockpitGoal = mode === 'tcam' ? ctrl.fovTcam : ctrl.fovCockpit;
    flyTo(onboardPose(focusCar, mode), ctrl.fovCockpitGoal, 1.25, mode);
  } else if (mode === 'aerial') {
    clampAerial(ctrl.aerGoal);
    ctrl.aer.theta = ctrl.aerGoal.theta; ctrl.aer.r = ctrl.aerGoal.r; ctrl.aer.h = ctrl.aerGoal.h;
    flyTo(aerialPose(ctrl.aer), ctrl.fovAerial, 1.9, 'aerial');
  } else {
    flyTo(orbitPose(), ctrl.fovOrbit, 1.05, 'orbit');
  }
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-view') === mode);
  });
  updateViewTip();
}
function setFocus(car, fromClick) {
  stopDemos();
  if (focusCar === car && fromClick) return;
  focusCar = car;
  document.body.setAttribute('data-focus', car.spec.id);
  document.getElementById('spec').innerHTML = specHTMLFor(car);
  document.querySelectorAll('[data-car]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-car') === car.spec.id);
  });
  if (isOnboard(ctrl.view)) {
    ctrl.yaw = ctrl.yawGoal = 0; ctrl.pitch = ctrl.pitchGoal = 0;
    flyTo(onboardPose(car, ctrl.view), ctrl.fovCockpitGoal, 1.1, ctrl.view);
  } else if (ctrl.view === 'orbit') {
    ctrl.targetGoal.copy(car.center);
    ctrl.sphGoal.radius = 7.2;
  }                                    // 航拍视角保持全景，只切换参数卡
}
/* 赛道时段配置：正午 / 黄昏 / 夜战 */
var TRACK_TIME = {
  noon:   { env: function () { return envTrack; }, bg: 0x8fb9de, fog: 0xddc8a2, fogN: 34, fogF: 115,
            hemiSky: 0xbfd9f5, hemiGnd: 0x9a7445, hemiI: 0.44,
            keyCol: 0xffe9c2, keyI: 1.32, keyPos: [9, 13, -4], rimCol: 0x9db8e0, rimI: 0.18,
            fillCol: 0xffe2bb, fillI: 0.24, exp: 1.0,
            sunCol: 0xfff0c8, sunPos: [52, 34, -26], sunOp: 0.95, sunScale: 26, flood: 0 },
  sunset: { env: function () { return envSunset; }, bg: 0xe89a5a, fog: 0xd98b54, fogN: 26, fogF: 100,
            hemiSky: 0xf0b070, hemiGnd: 0x6a4a30, hemiI: 0.38,
            keyCol: 0xff9036, keyI: 1.45, keyPos: [22, 5.5, -8], rimCol: 0xff6a3a, rimI: 0.42,
            fillCol: 0xff8a4a, fillI: 0.30, exp: 1.04,
            sunCol: 0xff7e3a, sunPos: [40, 8, -30], sunOp: 1.0, sunScale: 34, flood: 0 },
  night:  { env: function () { return envNight; }, bg: 0x070a16, fog: 0x0a0e1c, fogN: 26, fogF: 95,
            hemiSky: 0x33415e, hemiGnd: 0x0a0c12, hemiI: 0.22,
            keyCol: 0x6f86b8, keyI: 0.45, keyPos: [-6, 12, 5], rimCol: 0x4a6cff, rimI: 0.30,
            fillCol: 0x8aa0d0, fillI: 0.16, exp: 1.02,
            sunCol: 0xbfd0ff, sunPos: [-46, 30, 24], sunOp: 0.5, sunScale: 9, flood: 2.4 }
};
var trackTime = 'noon';
function applyTrackTime(tt) {
  trackTime = tt;
  try { localStorage.setItem('f1time', tt); } catch (e) {}
  var c = TRACK_TIME[tt];
  if (sceneMode === 'track') {
    scene.background.set(c.bg);
    scene.fog.color.set(c.fog); scene.fog.near = c.fogN; scene.fog.far = c.fogF;
    scene.environment = c.env();
    hemi.color.set(c.hemiSky); hemi.groundColor.set(c.hemiGnd); hemi.intensity = c.hemiI;
    key.color.set(c.keyCol); key.intensity = c.keyI; key.position.set(c.keyPos[0], c.keyPos[1], c.keyPos[2]);
    rim.color.set(c.rimCol); rim.intensity = c.rimI;
    fill.color.set(c.fillCol); fill.intensity = c.fillI;
    renderer.toneMappingExposure = c.exp;
  }
  if (trackSun) {
    trackSun.material.color.set(c.sunCol); trackSun.material.opacity = c.sunOp;
    trackSun.scale.set(c.sunScale, c.sunScale, 1);
    trackSun.position.set(c.sunPos[0], c.sunPos[1], c.sunPos[2]);
  }
  if (nightRig) {
    nightRig.visible = (tt === 'night');
    nightRig.userData.panels.forEach(function (m) { m.emissiveIntensity = (tt === 'night') ? 1.6 : 0; });
    floodLights.forEach(function (fl) { fl.intensity = c.flood; });
  }
  if (starField) starField.visible = (tt === 'night');
  document.querySelectorAll('[data-time]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-time') === tt);
  });
}

/* 场景切换：摩洛哥赛道（含时段）/ 暗夜车库 */
var sceneMode = 'track';
function applyScene(s) {
  if (s !== sceneMode) stopDemos();
  sceneMode = s;
  try { localStorage.setItem('f1scene', s); } catch (e) {}
  garageG.visible = (s === 'garage');
  trackG.visible = (s === 'track');
  /* 航拍机位换场景：车库里降到顶棚下，赛道上升回高空 */
  if (ctrl.view === 'aerial') {
    if (s === 'garage') { ctrl.aerGoal.r = 6.4; ctrl.aerGoal.h = 5.6; }
    else if (ctrl.aerGoal.h < 9) { ctrl.aerGoal.r = 26; ctrl.aerGoal.h = 24; }
    clampAerial(ctrl.aerGoal);
    ctrl.aer.r = ctrl.aerGoal.r; ctrl.aer.h = ctrl.aerGoal.h;
  }
  var grp = document.getElementById('grpTime');
  if (grp) grp.style.display = (s === 'track') ? '' : 'none';
  if (s === 'garage') {
    scene.background.set(0x07080c);
    scene.fog.color.set(0x07080c); scene.fog.near = 15; scene.fog.far = 46;
    scene.environment = envGarage;
    hemi.color.set(0xaabdda); hemi.groundColor.set(0x0c0a08); hemi.intensity = 0.17;
    key.color.set(0xeef1f6); key.intensity = 0.9; key.position.set(4.5, 7.5, 8.5);
    rim.color.set(0x6f8cff); rim.intensity = 0.34;
    fill.color.set(0xffd9b8); fill.intensity = 0.10;
    renderer.toneMappingExposure = 1.0;
  } else {
    applyTrackTime(trackTime);
  }
  document.querySelectorAll('[data-scene]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-scene') === s);
  });
}

/* UI 事件 */
document.querySelectorAll('[data-scene]').forEach(function (b) {
  b.addEventListener('click', function () { applyScene(b.getAttribute('data-scene')); });
});
document.querySelectorAll('[data-time]').forEach(function (b) {
  b.addEventListener('click', function () {
    if (sceneMode !== 'track') applyScene('track');
    applyTrackTime(b.getAttribute('data-time'));
  });
});

/* 拍照模式：隐藏 UI + 保存壁纸 */
function setPhoto(on) {
  document.body.classList.toggle('photo', on);
  document.getElementById('btnPhoto').classList.toggle('active', on);
}
document.getElementById('btnPhoto').addEventListener('click', function () { setPhoto(true); });
document.getElementById('btnPhotoExit').addEventListener('click', function () { setPhoto(false); });
document.getElementById('btnSnap').addEventListener('click', function () {
  renderer.render(scene, camera);                  // 确保缓冲为当前帧
  var url = canvas.toDataURL('image/png');
  var a = document.createElement('a');
  a.href = url;
  a.download = 'F1_' + focusCar.spec.id + '_' + sceneMode + '_' + trackTime + '.png';
  a.click();
});
window.addEventListener('keydown', function (e) {
  if (e.key === 'Escape' && document.body.classList.contains('photo')) setPhoto(false);
});
document.querySelectorAll('[data-car]').forEach(function (b) {
  b.addEventListener('click', function () {
    setFocus(CAR_BY_ID[b.getAttribute('data-car')] || ferrari, false);
  });
});
document.querySelectorAll('[data-view]').forEach(function (b) {
  b.addEventListener('click', function () { setView(b.getAttribute('data-view')); });
});
document.querySelectorAll('[data-layer]').forEach(function (b) {
  b.addEventListener('click', function () { setLayer(b.getAttribute('data-layer')); });
});
spinBtn.addEventListener('click', function () { setAuto(!ctrl.auto); });

/* 语言切换：界面 / 参数卡 / 部件标注同步翻译 */
function applyLang(l) {
  lang = l;
  try { localStorage.setItem('f1lang', l); } catch (e) {}
  var t = I18N[l];
  document.documentElement.lang = (l === 'zh') ? 'zh-CN' : 'en';
  document.title = t.docTitle;
  document.getElementById('lblScene').textContent = t.lblScene;
  document.querySelector('[data-scene="track"]').textContent = t.sceneTrack;
  document.querySelector('[data-scene="garage"]').textContent = t.sceneGarage;
  document.getElementById('lblTime').textContent = t.lblTime;
  document.querySelector('[data-time="noon"]').textContent = t.timeNoon;
  document.querySelector('[data-time="sunset"]').textContent = t.timeSunset;
  document.querySelector('[data-time="night"]').textContent = t.timeNight;
  document.getElementById('btnPhoto').textContent = t.photo;
  document.getElementById('btnSnap').textContent = t.photoSave;
  document.getElementById('btnPhotoExit').textContent = t.photoExit;
  document.getElementById('tTitle').textContent = t.title;
  document.getElementById('tBadge').textContent = t.badge;
  document.getElementById('tSub').textContent = t.sub;
  document.getElementById('lblCar').textContent = t.lblCar;
  document.getElementById('lblView').textContent = t.lblView;
  document.getElementById('lblLayer').textContent = t.lblLayer;
  document.querySelector('[data-car="ferrari"]').textContent = t.carF;
  document.querySelector('[data-car="mclaren"]').textContent = t.carM;
  document.querySelector('[data-car="redbull"]').textContent = t.carR;
  document.querySelector('[data-view="orbit"]').textContent = t.viewOrbit;
  document.querySelector('[data-view="cockpit"]').textContent = t.viewCockpit;
  document.querySelector('[data-view="tcam"]').textContent = t.viewTcam;
  document.querySelector('[data-view="aerial"]').textContent = t.viewAerial;
  document.querySelector('[data-layer="full"]').textContent = t.layerFull;
  document.querySelector('[data-layer="xray"]').textContent = t.layerXray;
  document.querySelector('[data-layer="open"]').textContent = t.layerOpen;
  document.getElementById('btnLaunch').textContent = launchActive ? t.launchStop : t.launch;
  document.getElementById('btnPit').textContent = pitActive ? t.pitStop : t.pit;
  document.getElementById('btnSound').textContent = soundOn ? t.soundOn : t.soundOff;
  document.getElementById('btnLang').textContent = t.langBtn;
  document.getElementById('hint').innerHTML = t.hint;
  document.getElementById('lblDrive').textContent = t.lblDrive;
  document.getElementById('phTag').textContent = t.pitTag;
  document.getElementById('phLbl').textContent = t.pitLbl;
  document.getElementById('phRep').textContent = t.pitReplay;
  if (pitActive) pitHudTyres();
  updateViewTip();
  setAuto(ctrl.auto);
  document.getElementById('spec').innerHTML = specHTMLFor(focusCar);
  cars.forEach(function (car) {
    car.labels.children.forEach(function (s) {
      s.material.map = (l === 'zh') ? s.userData.texZh : s.userData.texEn;
    });
  });
}
document.getElementById('btnLang').addEventListener('click', function () {
  applyLang(lang === 'zh' ? 'en' : 'zh');
});
var savedLang = 'zh';
try { savedLang = localStorage.getItem('f1lang') || 'zh'; } catch (e) {}
if (/[#&?]lang=en/.test(location.href)) savedLang = 'en';
applyLang(savedLang);
try { trackTime = localStorage.getItem('f1time') || 'noon'; } catch (e) {}
var timeM = location.hash.match(/time=(noon|sunset|night)/);
if (timeM) trackTime = timeM[1];
if (!TRACK_TIME[trackTime]) trackTime = 'noon';
var savedScene = 'track';
try { savedScene = localStorage.getItem('f1scene') || 'track'; } catch (e) {}
var sceneM = location.hash.match(/scene=(track|garage)/);
if (sceneM) savedScene = sceneM[1];
applyScene(savedScene);
applyTrackTime(trackTime);

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ================= 扬沙尾流粒子池（起跑时后轮喷出） ================= */
var dustTex = canvasTex(64, 64, function (x, w, h) {
  var g = x.createRadialGradient(w / 2, h / 2, 2, w / 2, h / 2, w / 2);
  g.addColorStop(0, 'rgba(212,190,150,0.9)');
  g.addColorStop(0.5, 'rgba(196,168,120,0.5)');
  g.addColorStop(1, 'rgba(196,168,120,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
});
var DUST_N = 90, dustPool = [], dustIdx = 0, wpTmp = new THREE.Vector3();
for (var di = 0; di < DUST_N; di++) {
  var ds = new THREE.Sprite(new THREE.SpriteMaterial({
    map: dustTex, color: 0xcdb488, transparent: true, opacity: 0, depthWrite: false }));
  ds.visible = false; ds.userData = { life: 0, max: 1, vel: new THREE.Vector3() };
  ds.userData.noRay = true;
  trackG.add(ds); dustPool.push(ds);
}
function emitDust(x, y, z, push) {
  var s = dustPool[dustIdx]; dustIdx = (dustIdx + 1) % DUST_N;
  s.visible = true; s.userData.life = 0; s.userData.max = 0.9 + Math.random() * 0.7;
  s.position.set(x + (Math.random() - 0.5) * 0.3, y, z + (Math.random() - 0.5) * 0.3);
  s.userData.vel.set((Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 1.0, -push - Math.random() * 2.0);
  s.scale.setScalar(0.25);
}
function updateDust(dt) {
  for (var i = 0; i < DUST_N; i++) {
    var s = dustPool[i];
    if (!s.visible) continue;
    var u = s.userData; u.life += dt;
    if (u.life >= u.max) { s.visible = false; continue; }
    var k = u.life / u.max;
    s.position.addScaledVector(u.vel, dt);
    u.vel.multiplyScalar(1 - 1.6 * dt);
    u.vel.y -= 0.4 * dt;
    s.material.opacity = (sceneMode === 'track' ? 0.5 : 0) * (1 - k) * Math.min(1, k * 5);
    s.scale.setScalar(0.25 + k * 1.7);
  }
}
function clearDust() { for (var i = 0; i < DUST_N; i++) dustPool[i].visible = false; }

/* ================= 起跑灯序 + 起跑动画 + 引擎声浪 + 细节动画 ========= */
var elapsed = 0;
var launchActive = false, launchPhase = 'idle', launchT = 0, launchGoT = 0;
var launchCam = { p: new THREE.Vector3(), look: new THREE.Vector3(), init: false };
var btnLaunch = document.getElementById('btnLaunch');

function startLaunch() {
  if (pitActive) stopPit(true);
  if (sceneMode !== 'track') applyScene('track');
  setLayer('full');
  launchActive = true; launchPhase = 'lights'; launchT = 0;
  launchGoT = 3.0 + 0.7 + Math.random() * 1.1;     // 五灯亮完后随机熄灯（反应时间）
  cars.forEach(function (c) {
    c.runZ = 0; c.runV = 0; c.runSteer = 0; c.wrap.position.z = 0;
    c.grip = 0.96 + Math.random() * 0.1;          // 每次起跑抓地随机，谁领先看临场发挥
  });
  setAuto(false);
  ctrl.mode = 'launch'; launchCam.init = false;
  if (!isOnboard(ctrl.view)) { camera.fov = 40; camera.updateProjectionMatrix(); }
  btnLaunch.classList.add('active');
  btnLaunch.textContent = I18N[lang].launchStop;
  signG.visible = false;
  updateViewTip();
}
function stopLaunch(keepCam) {
  if (!launchActive) return;
  launchActive = false; launchPhase = 'idle';
  setLampsLit(0); clearDust();
  cars.forEach(function (c) {
    c.runZ = 0; c.runV = 0; c.runSteer = 0;
    c.wrap.position.z = 0; c.wrap.rotation.y = c.baseRotY;
    c.wheels.forEach(function (wr) { if (wr.front) wr.yawGrp.rotation.y = 0; });
  });
  btnLaunch.classList.remove('active');
  btnLaunch.textContent = I18N[lang].launch;
  signG.visible = true;
  restoreViewAfterDemo(keepCam);
}
/* 演示（起跑 / 进站）结束后回到用户所选视角；传入 car 时环绕视角落回这辆车 */
function restoreViewAfterDemo(keepCam, car) {
  var v = ctrl.view;
  var tgt = car ? car.center : new THREE.Vector3(0, 0.55, 0);
  if (isOnboard(v)) {
    ctrl.yaw = ctrl.yawGoal = 0; ctrl.pitch = ctrl.pitchGoal = 0;
    ctrl.mode = v;                                  // 车载机位随赛车一起复位
  } else if (v === 'aerial') {
    flyTo(aerialPose(ctrl.aer), ctrl.fovAerial, keepCam ? 0.8 : 1.5, 'aerial');
  } else if (keepCam) {
    /* 把当前相机平滑接回环绕状态，交给调用方再决定去向 */
    ctrl.target.copy(tgt); ctrl.targetGoal.copy(tgt);
    var off = camera.position.clone().sub(ctrl.target);
    ctrl.sph.setFromVector3(off);
    ctrl.sph.radius = THREE.MathUtils.clamp(ctrl.sph.radius, R_MIN, R_MAX);
    ctrl.sph.phi = THREE.MathUtils.clamp(ctrl.sph.phi, 0.10, 1.52);
    ctrl.sphGoal.set(THREE.MathUtils.clamp(ctrl.sph.radius, 7, 14), ctrl.sph.phi, ctrl.sph.theta);
    camera.fov = ctrl.fovOrbit; camera.updateProjectionMatrix();
    ctrl.mode = 'orbit';
  } else {
    ctrl.targetGoal.copy(tgt); ctrl.sphGoal.radius = car ? 7.6 : 12.5;
    ctrl.sphGoal.phi = THREE.MathUtils.clamp(ctrl.sphGoal.phi, 0.10, 1.52);
    flyTo(orbitPose(), ctrl.fovOrbit, 1.1, 'orbit');
  }
  updateViewTip();
}
btnLaunch.addEventListener('click', function () { launchActive ? stopLaunch() : startLaunch(); });

function leadZ() {
  var z = 0;
  cars.forEach(function (c) { z = Math.max(z, c.runZ); });
  return z;
}
function updateLaunch(dt) {
  launchT += dt;
  cars.forEach(function (c) { c.wrap.rotation.y = THREE.MathUtils.damp(c.wrap.rotation.y, 0, 6, dt); }); // 拉直朝向
  if (launchPhase === 'lights') {
    setLampsLit(Math.min(5, Math.floor(launchT / 0.6)));
    if (launchT >= launchGoT) { launchPhase = 'go'; setLampsLit(0); }
  } else if (launchPhase === 'go') {
    cars.forEach(function (c, i) {
      var grip = c.grip || 1;                                                     // 轻微差速制造对决
      c.runV = Math.min(c.runV + 9.0 * grip * dt, 47);
      c.runZ += c.runV * dt;
      c.wrap.position.z = c.runZ;
      c.runSteer = Math.sin(launchT * 9 + i * 2) * 0.05 * Math.max(0, 1 - c.runV / 14);  // 起步扭动
      /* 后轮扬沙：起步轮滑时最浓，提速后渐弱 */
      var amt = Math.max(0, 1 - c.runV / 34);
      if (c.runV > 0.5 && amt > 0.02) {
        c.wheels.forEach(function (wr) {
          if (!wr.front && Math.random() < 0.5 + amt) {
            wr.yawGrp.getWorldPosition(wpTmp);
            emitDust(wpTmp.x, 0.18, wpTmp.z - 0.3, 3 + c.runV * 0.25);
          }
        });
      }
    });
    if (leadZ() > 41 || launchT > launchGoT + 8) stopLaunch();
  }
}
function launchCamTick(dt) {
  /* 车载机位（驾驶舱 / T-cam）：随所选赛车一起起跑，带路面震动 + 速度感视野 */
  if (isOnboard(ctrl.view)) {
    var pose = onboardPose(focusCar, ctrl.view);
    camera.position.copy(pose.p); camera.quaternion.copy(pose.q);
    var go = launchPhase === 'go';
    var sh = go ? 0.0018 + Math.min(1, focusCar.runV / 30) * 0.0035 : 0.0012;
    camera.position.x += (Math.random() - 0.5) * sh;
    camera.position.y += (Math.random() - 0.5) * sh;
    var fGoal = ctrl.fovCockpitGoal + (go ? Math.min(9, focusCar.runV * 0.22) : 0);
    camera.fov = THREE.MathUtils.damp(camera.fov, fGoal, 3, dt); camera.updateProjectionMatrix();
    setNear(0.02);
    return;
  }
  var tp = new THREE.Vector3(), tl = new THREE.Vector3();
  var zb = leadZ();
  if (ctrl.view === 'aerial') {                              // 直升机跟拍
    if (launchPhase === 'go') { tp.set(-10.5, 14.5, zb - 8); tl.set(0, 0.4, zb + 5); }
    else { tp.set(-13, 16, -14); tl.set(0, 0.5, 3); }
    setNear(0.3);
  } else if (launchPhase === 'go') {
    tp.set(1.6, 1.85, zb - 9.6); tl.set(0, 0.7, zb + 4);    // 后方跟拍（三车同框）
    setNear(0.03);
  } else {
    tp.set(0.0, 1.55, -8.6); tl.set(0, 1.5, 9);              // 灯亮阶段：望向车与灯架
    setNear(0.03);
  }
  if (!launchCam.init) { launchCam.p.copy(tp); launchCam.look.copy(tl); launchCam.init = true; }
  var L = launchPhase === 'go' ? 4.5 : 3;
  ['x', 'y', 'z'].forEach(function (a) {
    launchCam.p[a] = THREE.MathUtils.damp(launchCam.p[a], tp[a], L, dt);
    launchCam.look[a] = THREE.MathUtils.damp(launchCam.look[a], tl[a], L, dt);
  });
  camera.position.copy(launchCam.p);
  camera.lookAt(launchCam.look);
}

/* ---- 引擎声浪（Web Audio 合成 V6 涡轮，跟随转速/油门） ---- */
var soundOn = false, audioCtx = null, eng = null;
var btnSound = document.getElementById('btnSound');
function initAudio() {
  var AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  audioCtx = new AC();
  var master = audioCtx.createGain(); master.gain.value = 0; master.connect(audioCtx.destination);
  var lp = audioCtx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 7; lp.connect(master);
  var oscs = [];
  [{ m: 1, t: 'sawtooth', g: 0.5 }, { m: 2, t: 'sawtooth', g: 0.28 },
   { m: 3, t: 'square', g: 0.16 }, { m: 0.5, t: 'sine', g: 0.6 }].forEach(function (d) {
    var o = audioCtx.createOscillator(); o.type = d.t;
    var g = audioCtx.createGain(); g.gain.value = d.g;
    o.connect(g); g.connect(lp); o.start();
    oscs.push({ o: o, m: d.m });
  });
  var turbo = audioCtx.createOscillator(); turbo.type = 'triangle';
  var turboG = audioCtx.createGain(); turboG.gain.value = 0;
  turbo.connect(turboG); turboG.connect(master); turbo.start();
  eng = { master: master, lp: lp, oscs: oscs, turbo: turbo, turboG: turboG };
}
function toggleSound() {
  if (!audioCtx) initAudio();
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') audioCtx.resume();
  soundOn = !soundOn;
  btnSound.classList.toggle('active', soundOn);
  btnSound.textContent = soundOn ? I18N[lang].soundOn : I18N[lang].soundOff;
}
btnSound.addEventListener('click', toggleSound);

function engineState() {
  if (pitActive) return pitEngine();
  if (launchActive && launchPhase === 'go') {
    var v = focusCar.runV, gf = v / 6.5;
    return { rpm: Math.min(1, 0.4 + (gf - Math.floor(gf)) * 0.6), throttle: 1 };
  }
  if (launchActive) {       // 灯亮阶段：原地轰油
    var b = Math.abs(Math.sin(launchT * 6.5));
    return { rpm: 0.3 + 0.45 * b, throttle: 0.35 + 0.35 * b };
  }
  var s = driveSim(elapsed + focusCar.spec.simOffset);
  return { rpm: s.rpm, throttle: s.braking ? 0.12 : 0.4 + 0.6 * s.rpm };
}
/* 风炮“哒哒哒”：带通噪声 + 方波调幅（仅声浪开启时） */
var noiseBuf = null;
function gunBurst(dur) {
  if (!soundOn || !audioCtx) return;
  if (!noiseBuf) {
    noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
    var ch = noiseBuf.getChannelData(0);
    for (var i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  }
  var t0 = audioCtx.currentTime;
  var src = audioCtx.createBufferSource(); src.buffer = noiseBuf;
  var bp = audioCtx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1900; bp.Q.value = 0.8;
  var g = audioCtx.createGain();
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(0.16, t0 + 0.012);
  g.gain.setValueAtTime(0.16, t0 + Math.max(0.03, dur - 0.03));
  g.gain.linearRampToValueAtTime(0, t0 + dur);
  var lfo = audioCtx.createOscillator(); lfo.type = 'square'; lfo.frequency.value = 52;
  var lfoG = audioCtx.createGain(); lfoG.gain.value = 0.09;
  lfo.connect(lfoG); lfoG.connect(g.gain);
  src.connect(bp); bp.connect(g); g.connect(audioCtx.destination);
  src.start(t0); src.stop(t0 + dur + 0.05);
  lfo.start(t0); lfo.stop(t0 + dur + 0.05);
}

/* ================= 维修区进站：16 人换胎机组 + 千斤顶 + 风炮 + 放行灯 =========
   整段进站是时间 t 的纯函数（evalPit）：先实时播放一遍并计停车时间，
   再换机位 0.4× 慢放回放。赛车以 80 km/h 限速驶入 → 急刹停进维修位 →
   前后千斤顶抬车 → 四轮同时拆装 → 放车 → 绿灯放行 */
var pitActive = false;
var pitG = new THREE.Group();          // 维修位全部道具（局部坐标 = 赛车停稳时的车身坐标）
pitG.visible = false;
scene.add(pitG);
var PIT_TYRES = {
  soft:   { hex: 0xd8262e, css: '#e8333b', key: 'tyreSoft' },
  medium: { hex: 0xf2cc0d, css: '#f2cc0d', key: 'tyreMedium' },
  hard:   { hex: 0xe9e9e6, css: '#f1f1ec', key: 'tyreHard' }
};
function tyreKeyOf(hex) {
  for (var k in PIT_TYRES) if (PIT_TYRES[k].hex === hex) return k;
  return null;                                     // 红牛实拍为无标识暗色胎
}
var CREW_KIT = {                                   // 各队机组服 / 头盔 / 点缀色
  ferrari: { suit: new THREE.Color(0xa50c14), helmet: new THREE.Color(0xe6e6e8), trim: new THREE.Color(0xf2cc0d) },
  mclaren: { suit: srgbCol(0xff8000), helmet: new THREE.Color(0x16171b), trim: new THREE.Color(0x16171b) },
  redbull: { suit: new THREE.Color(0x0e1736), helmet: new THREE.Color(0x0e1736), trim: new THREE.Color(0xd6273a) }
};
var crewSuitMat = stdMat(0xa50c14, 0.78, 0.05);
var crewTrimMat = stdMat(0xf2cc0d, 0.6, 0.1);
var crewDarkMat = stdMat(0x121317, 0.85, 0.05);   // 手套 / 鞋
var crewHelmetMat = phyMat(0xe6e6e8, 0.3, 0.2, 0.9, 0.08);
var crewVisorMat = phyMat(0x0a0c12, 0.06, 0.7, 1.0, 0.04, { envMapIntensity: 1.4 });
var gunBodyMat = stdMat(0x2a2d33, 0.45, 0.7);
var hoseMat = stdMat(0x111215, 0.7, 0.1);
var jackMat = stdMat(0xf2cc0d, 0.5, 0.4);

/* ---- 机组人员：关节层级（胯 → 脊柱 → 头 / 肩 → 肘；髋 → 膝 → 踝），面朝 +Z ---- */
function tGeo(g, x, y, z) { g.translate(x, y, z); return g; }
var CG = {
  pelvis: tGeo(new THREE.SphereGeometry(0.15, 10, 8), 0, 0, 0),
  torso: tGeo(new THREE.CylinderGeometry(0.175, 0.145, 0.52, 12), 0, 0.27, 0),
  belt: tGeo(new THREE.CylinderGeometry(0.152, 0.152, 0.07, 12), 0, 0.04, 0),
  shoulder: new THREE.SphereGeometry(0.075, 10, 8),
  neck: tGeo(new THREE.CylinderGeometry(0.05, 0.062, 0.1, 8), 0, 0.56, 0),
  helmet: new THREE.SphereGeometry(0.135, 16, 12),
  visor: new THREE.SphereGeometry(0.139, 16, 6, Math.PI / 2 - 0.85, 1.7, 1.2, 0.55),
  upper: tGeo(new THREE.CylinderGeometry(0.056, 0.047, 0.30, 8), 0, -0.15, 0),
  fore: tGeo(new THREE.CylinderGeometry(0.047, 0.04, 0.27, 8), 0, -0.135, 0),
  hand: tGeo(new THREE.SphereGeometry(0.05, 8, 6), 0, -0.30, 0),
  thigh: tGeo(new THREE.CylinderGeometry(0.08, 0.065, 0.45, 8), 0, -0.225, 0),
  shin: tGeo(new THREE.CylinderGeometry(0.063, 0.05, 0.43, 8), 0, -0.215, 0),
  shoe: tGeo(new THREE.BoxGeometry(0.11, 0.075, 0.25), 0, -0.035, 0.045)
};
function buildCrewman() {
  var root = new THREE.Group();
  var hips = new THREE.Group(); root.add(hips);
  var pel = mesh(CG.pelvis, crewSuitMat); pel.scale.set(1.05, 0.7, 0.8); hips.add(pel);
  var spine = new THREE.Group(); hips.add(spine);
  spine.add(mesh(CG.torso, crewSuitMat), mesh(CG.belt, crewTrimMat), mesh(CG.neck, crewSuitMat));
  var head = new THREE.Group(); head.position.y = 0.67; spine.add(head);
  head.add(mesh(CG.helmet, crewHelmetMat), mesh(CG.visor, crewVisorMat));
  function arm(sx) {
    var cap = mesh(CG.shoulder, crewTrimMat, sx * 0.205, 0.50, 0); spine.add(cap);
    var sh = new THREE.Group(); sh.position.set(sx * 0.215, 0.49, 0); spine.add(sh);
    sh.add(mesh(CG.upper, crewSuitMat));
    var el = new THREE.Group(); el.position.y = -0.30; sh.add(el);
    el.add(mesh(CG.fore, crewSuitMat), mesh(CG.hand, crewDarkMat));
    return { sh: sh, el: el };
  }
  function leg(sx) {
    var hp = new THREE.Group(); hp.position.set(sx * 0.095, -0.02, 0); hips.add(hp);
    hp.add(mesh(CG.thigh, crewSuitMat));
    var kn = new THREE.Group(); kn.position.y = -0.45; hp.add(kn);
    kn.add(mesh(CG.shin, crewSuitMat));
    var an = new THREE.Group(); an.position.y = -0.43; kn.add(an);
    an.add(mesh(CG.shoe, crewDarkMat));
    return { hp: hp, kn: kn, an: an };
  }
  var c = { root: root, hips: hips, spine: spine, head: head,
            aL: arm(1), aR: arm(-1), lL: leg(1), lR: leg(-1) };
  /* 小部件不投影：16 人机组约 320 个网格，省下阴影通道的绘制调用 */
  var small = [CG.pelvis, CG.belt, CG.shoulder, CG.neck, CG.visor, CG.hand, CG.shoe];
  root.traverse(function (o) { if (o.isMesh && small.indexOf(o.geometry) >= 0) o.castShadow = false; });
  return c;
}
/* 姿势库（弧度）：sh=[前后摆, 外展]，负值向前；hp 同理；kn 正值向后屈膝 */
var POSES = {
  stand: { y: 0.93, lean: 0.03, shL: [0.06, 0.10], shR: [0.06, -0.10], elL: -0.18, elR: -0.18,
           hpL: [0, 0.04], hpR: [0, -0.04], knL: 0.02, knR: 0.02 },
  ready: { y: 0.74, lean: 0.50, shL: [-0.85, 0.16], shR: [-0.85, -0.16], elL: -0.55, elR: -0.55,
           hpL: [-0.85, 0.14], hpR: [-0.85, -0.14], knL: 1.45, knR: 1.45 },
  kneel: { y: 0.52, lean: 0.62, shL: [-0.95, 0.10], shR: [-0.95, -0.10], elL: -0.45, elR: -0.45,
           hpL: [-1.45, 0.16], hpR: [0.20, -0.10], knL: 1.5, knR: 1.37 },
  carry: { y: 0.66, lean: 0.45, shL: [-0.75, 0.34], shR: [-0.75, -0.34], elL: -0.6, elR: -0.6,
           hpL: [-1.0, 0.16], hpR: [-0.75, -0.16], knL: 1.65, knR: 1.3 },
  jack:  { y: 0.88, lean: 0.20, shL: [-1.05, 0.12], shR: [-1.05, -0.12], elL: -0.25, elR: -0.25,
           hpL: [-0.30, 0.05], hpR: [0.22, -0.05], knL: 0.32, knR: 0.12 },
  push:  { y: 0.80, lean: 0.62, shL: [-1.35, 0.10], shR: [-1.35, -0.10], elL: -0.05, elR: -0.05,
           hpL: [-0.60, 0.05], hpR: [0.35, -0.05], knL: 0.75, knR: 0.40 },
  hold:  { y: 0.84, lean: 0.38, shL: [-1.0, 0.24], shR: [-1.0, -0.24], elL: -0.35, elR: -0.35,
           hpL: [-0.32, 0.12], hpR: [-0.32, -0.12], knL: 0.55, knR: 0.55 }
};
function mixPose(a, b, k, out) {
  out = out || {};
  for (var key in a) {
    var va = a[key], vb = b[key];
    if (Array.isArray(va)) out[key] = [va[0] + (vb[0] - va[0]) * k, va[1] + (vb[1] - va[1]) * k];
    else out[key] = va + (vb - va) * k;
  }
  return out;
}
function applyPose(c, P) {
  c.hips.position.y = P.y;
  c.spine.rotation.x = P.lean;
  c.head.rotation.x = -P.lean * 0.7;               // 头部回正看向工作点
  c.aL.sh.rotation.set(P.shL[0], 0, P.shL[1]); c.aL.el.rotation.x = P.elL;
  c.aR.sh.rotation.set(P.shR[0], 0, P.shR[1]); c.aR.el.rotation.x = P.elR;
  c.lL.hp.rotation.set(P.hpL[0], 0, P.hpL[1]); c.lL.kn.rotation.x = P.knL;
  c.lR.hp.rotation.set(P.hpR[0], 0, P.hpR[1]); c.lR.kn.rotation.x = P.knR;
  c.lL.an.rotation.x = -(P.hpL[0] + P.knL);       // 脚掌保持贴地
  c.lR.an.rotation.x = -(P.hpR[0] + P.knR);
}

/* ---- 器材：风炮 / 千斤顶 / 放行灯架 / 维修位地标 ---- */
function buildGun() {                              // 原点 = 套筒尖端，枪身沿 -Z 向后
  var g = new THREE.Group();
  var body = mesh(new THREE.CylinderGeometry(0.052, 0.058, 0.22, 12), gunBodyMat, 0, 0, -0.22);
  body.geometry.rotateX(Math.PI / 2);
  var band = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 12), jackMat, 0, 0, -0.16);
  band.geometry.rotateX(Math.PI / 2);
  var nose = mesh(new THREE.CylinderGeometry(0.033, 0.04, 0.10, 12), M.silver, 0, 0, -0.06);
  nose.geometry.rotateX(Math.PI / 2);
  var socket = mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.03, 6), crewDarkMat, 0, 0, -0.01);
  socket.geometry.rotateX(Math.PI / 2);
  var grip = box(0.04, 0.13, 0.05, crewDarkMat, 0, -0.085, -0.27); grip.rotation.x = 0.25;
  var hose = pipe([[0, -0.03, -0.33], [0, -0.16, -0.48], [0, -0.40, -0.52]], 0.014, hoseMat, 10);
  g.add(body, band, nose, socket, grip, hose);
  g.userData.socket = socket;
  return g;
}
function buildJack(tall) {                         // 原点 = 托架下方地面，+Z 指向操作员
  var g = new THREE.Group();
  g.add(rod(-0.22, 0.06, 0.32, 0.22, 0.06, 0.32, 0.016, M.steel));
  [-0.24, 0.24].forEach(function (x) {
    var w = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.04, 14), crewDarkMat, x, 0.06, 0.32);
    w.geometry.rotateZ(Math.PI / 2);
    g.add(w);
  });
  var lever = new THREE.Group();                   // 杠杆：绕轮轴上方枢轴转动，托架端抬起
  lever.position.set(0, 0.12, 0.32);
  var cy = tall ? 0.16 : -0.07;                    // 托架相对枢轴高度（后千斤顶要顶尾部防撞梁）
  lever.add(rod(0, 0, 0, 0, cy, -0.32, 0.024, jackMat));
  lever.add(box(0.32, 0.035, 0.09, crewDarkMat, 0, cy, -0.32));
  lever.add(rod(0, 0, 0, 0, 0.83, 0.78, 0.022, jackMat));
  lever.add(rod(-0.17, 0.83, 0.78, 0.17, 0.83, 0.78, 0.018, crewDarkMat));
  g.add(lever);
  g.userData.lever = lever;
  return g;
}
var lampRedMat = stdMat(0x3a0d0d, 0.4, 0.2, { emissive: new THREE.Color(0xff1408), emissiveIntensity: 0 });
var lampGreenMat = stdMat(0x0d3a16, 0.4, 0.2, { emissive: new THREE.Color(0x18ff52), emissiveIntensity: 0 });
var gantry = (function () {                        // 立柱在原点，横臂沿 +X 伸向赛车上方
  var g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.05, 0.07, 2.75, 10), M.steel, 0, 1.375, 0));
  g.add(box(1.6, 0.08, 0.08, M.carbonM, 0.78, 2.70, 0));
  g.add(box(0.26, 0.48, 0.14, crewDarkMat, 1.48, 2.42, 0));
  var red = mesh(new THREE.CircleGeometry(0.08, 20), lampRedMat, 1.48, 2.54, -0.072);
  var green = mesh(new THREE.CircleGeometry(0.08, 20), lampGreenMat, 1.48, 2.30, -0.072);
  red.rotation.y = green.rotation.y = Math.PI;    // 灯面朝向车手（-Z）
  red.castShadow = green.castShadow = false;
  g.add(red, green);
  return g;
})();
pitG.add(gantry);
var pitBox = new THREE.Mesh(new THREE.PlaneGeometry(3.0, 6.6),
  new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -3, toneMapped: false }));
pitBox.rotation.x = -Math.PI / 2;
pitBox.position.set(0, 0.0085, 0.2);
pitBox.userData.noRay = true;
pitG.add(pitBox);
var pitBoxTex = {};
function pitBoxTexFor(car) {                       // 车队色维修位地标（含四轮停车标记 + 队名）
  var id = car.spec.id;
  if (pitBoxTex[id]) return pitBoxTex[id];
  var hex = car.spec.plaqueAccent;
  var r = parseInt(hex.substr(1, 2), 16), gg = parseInt(hex.substr(3, 2), 16), b = parseInt(hex.substr(5, 2), 16);
  pitBoxTex[id] = canvasTex(256, 560, function (x, w, h) {
    x.clearRect(0, 0, w, h);
    x.fillStyle = 'rgba(' + r + ',' + gg + ',' + b + ',0.26)'; x.fillRect(0, 0, w, h);
    x.strokeStyle = 'rgba(244,244,240,0.95)'; x.lineWidth = 8; x.strokeRect(6, 6, w - 12, h - 12);
    x.fillStyle = 'rgba(242,210,27,0.95)';         // 车轮停车标记（局部 x=±0.78, z=±1.8）
    [-1, 1].forEach(function (sx) {
      [-1, 1].forEach(function (sz) {
        var px = (sx * 0.78 + 1.5) / 3.0 * w, py = (sz * 1.8 - 0.2 + 3.3) / 6.6 * h;
        x.fillRect(px - 20, py - 3, 40, 6);
      });
    });
    x.fillStyle = 'rgba(244,244,240,0.92)';
    x.font = '900 30px "Arial Black", Arial, sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(car.spec.rwText.toUpperCase(), w / 2, h - 34);   // 车头一端写队名
  });
  return pitBoxTex[id];
}

/* ---- 机组编排：四角各 3 人（风炮手 / 拆胎手 / 装胎手）+ 前后千斤顶 + 2 名扶车手 ---- */
var crew = [];
function addCrew(role, i, extra) {
  var c = buildCrewman();
  c.role = role; c.i = i; c.pose = {};
  pitG.add(c.root);
  if (extra) { c.root.add(extra); c.tool = extra; }
  crew.push(c);
  return c;
}
for (var ci = 0; ci < 4; ci++) {
  var gun = buildGun(); gun.position.set(0, 0.40, 0.80);
  addCrew('gun', ci, gun);
  addCrew('off', ci); addCrew('on', ci);
}
var jackF = buildJack(false), jackR = buildJack(true);
jackF.position.set(0, 0, 1.30); jackF.rotation.y = Math.PI;   // 挂在操作员前方 1.3 m
jackR.position.set(0, 0, 1.30); jackR.rotation.y = Math.PI;
addCrew('jackF', 0, jackF); addCrew('jackR', 0, jackR);
addCrew('stab', 1); addCrew('stab', -1);

/* ---- 时间轴 ---- */
var PIT_V = 22.2, PIT_D = 18, PIT_DB = 9;          // 80 km/h 限速 / 起始距离 / 刹停距离
var PIT_TB = (PIT_D - PIT_DB) / PIT_V;             // 开始刹车
var PIT_TS = PIT_TB + 2 * PIT_DB / PIT_V;          // 停稳（≈1.22 s）
var PIT_AB = PIT_V * PIT_V / (2 * PIT_DB);         // 刹车减速度
var PIT_AGO = 11;                                  // 出站加速度
var PIT_REPLAY = 0.4;
var pit = {
  car: null, phase: 'live', t: 0, S: 1, jit: [0, 0, 0, 0], Tgo: 0,
  home: new THREE.Vector3(), side: 1, js: 1,
  oldKey: null, newKey: 'soft', liveCam: 'tv', replayCam: 'top',
  camP: new THREE.Vector3(), camL: new THREE.Vector3(), camInit: false, fired: {}, clones: null
};
function seg(t, a, b) { return t <= a ? 0 : (t >= b ? 1 : (t - a) / (b - a)); }
function sseg(t, a, b) { var k = seg(t, a, b); return k * k * (3 - 2 * k); }
function tk(a) { return PIT_TS + a * pit.S; }     // 以停稳时刻为零点的工序时间（随机速度系数 S）
function pitCarZ(t) {                              // → [位置 z, 速度]
  if (t < PIT_TB) return [-PIT_D + PIT_V * t, PIT_V];
  if (t < PIT_TS) { var u = t - PIT_TB; return [-PIT_DB + PIT_V * u - 0.5 * PIT_AB * u * u, PIT_V - PIT_AB * u]; }
  if (t < pit.Tgo) return [0, 0];
  var w = t - pit.Tgo;
  return [0.5 * PIT_AGO * w * w, PIT_AGO * w];
}
function pitLifts(t) {                             // 前 / 后千斤顶抬升量（m）
  return [0.075 * (sseg(t, tk(0.06), tk(0.22)) - sseg(t, tk(1.44), tk(1.54))),
          0.075 * (sseg(t, tk(0.22), tk(0.38)) - sseg(t, tk(1.48), tk(1.58)))];
}
var JACK_ZF = 2.62, JACK_ZR = -2.32;
function corner(i) {
  var wr = pit.car.wheels[i];
  var sx = wr.yawGrp.position.x > 0 ? 1 : -1;
  return { sx: sx, hx: wr.yawGrp.position.x, hz: wr.yawGrp.position.z,
           face: wr.yawGrp.position.x + sx * (wr.front ? 0.165 : 0.21) };
}
/* 车轮克隆：旧胎（拆下后被拿走）/ 新胎（装胎手捧着等候），放在 pitG 里不随车开走 */
function ensurePitClones(car) {
  if (car.pitClones) return car.pitClones;
  car.pitClones = car.wheels.map(function (wr) {
    function cl() {
      /* clone() 会 JSON 深拷贝 userData，carRef 是环形引用，克隆前先摘下 */
      var saved = [];
      wr.spin.traverse(function (o) {
        if (o.userData.carRef) { saved.push([o, o.userData.carRef]); delete o.userData.carRef; }
      });
      var c = wr.spin.clone(true);
      saved.forEach(function (s) { s[0].userData.carRef = s[1]; });
      var bm = car.tyreBandMat.clone();
      c.traverse(function (o) { if (o.isMesh && o.material === car.tyreBandMat) o.material = bm; });
      c.userData.band = bm;
      c.rotation.set(0, 0, 0); c.visible = false;
      pitG.add(c);
      return c;
    }
    return { old: cl(), neu: cl() };
  });
  return car.pitClones;
}

function evalPit(t, dts) {
  var car = pit.car, i;
  var zv = pitCarZ(t), L = pitLifts(t), hf = L[0], hr = L[1];
  var span = JACK_ZF - JACK_ZR;
  car.wrap.position.set(car.homeX, 0.012, zv[0]);
  car.wrap.rotation.y = 0;
  car.group.position.y = hr + (hf - hr) * (-JACK_ZR / span);
  car.group.rotation.x = -Math.atan2(hf - hr, span);
  car.wheels.forEach(function (wr) { wr.spin.rotation.x -= zv[1] / 0.36 * dts; });
  function liftAt(z) { return hr + (hf - hr) * (z - JACK_ZR) / span; }

  /* 四个车轮：旧胎拆下 → 新胎装上（新胎色在首个车轮装好时切换，此时四角原车轮均已隐藏） */
  var firstOn = Infinity;
  for (i = 0; i < 4; i++) firstOn = Math.min(firstOn, tk(1.06 + pit.jit[i]));
  car.tyreBandMat.color.setHex(t >= firstOn ? PIT_TYRES[pit.newKey].hex : car.spec.tyreBand);
  for (i = 0; i < 4; i++) {
    var cn = corner(i), j = pit.jit[i], wr = car.wheels[i], cl = pit.clones[i];
    var offA = tk(0.46 + j), offB = tk(0.74 + j), onA = tk(0.74 + j), onB = tk(1.06 + j);
    var y0 = 0.36 + liftAt(cn.hz);
    /* 旧胎：先沿轮轴滑出，再向后撤，最后被拿离车边 */
    var ko = seg(t, offA, offB), kAway = sseg(t, offB, offB + 0.5);
    var ox = ko < 0.4 ? 0.34 * sseg(ko, 0, 0.4) : 0.34 + 0.02 * sseg(ko, 0.4, 1);
    var oz = -0.5 * sseg(ko, 0.4, 1);
    cl.old.visible = t >= offA;
    cl.old.position.set(cn.hx + cn.sx * (ox + 0.55 * kAway), y0 + 0.04 * kAway, cn.hz + oz - 0.35 * kAway);
    /* 新胎：从前侧斜向对准轮轴，再推入 */
    var kn2 = seg(t, onA, onB);
    var nx = kn2 < 0.55 ? 0.45 - 0.11 * sseg(kn2, 0, 0.55) : 0.34 * (1 - sseg(kn2, 0.55, 1));
    var nz = 0.55 * (1 - sseg(kn2, 0, 0.55));
    cl.neu.visible = t < onB;
    cl.neu.position.set(cn.hx + cn.sx * nx, y0, cn.hz + nz);
    wr.spin.visible = t < offA || t >= onB;
    /* 风炮声：松螺母 / 紧螺母（仅实时播放时） */
    if (pit.phase === 'live') {
      if (!pit.fired['l' + i] && t >= tk(0.30 + j)) { pit.fired['l' + i] = 1; gunBurst(0.16 * pit.S); }
      if (!pit.fired['t' + i] && t >= tk(1.06 + j)) { pit.fired['t' + i] = 1; gunBurst(0.2 * pit.S); }
    }
  }

  /* 机组 */
  var out = sseg(t, pit.Tgo - 0.05, pit.Tgo + 0.4);           // 放行后撤离
  var tmp = {}, tmp2 = {};
  crew.forEach(function (c) {
    var P, x = 0, z = 0, ry = 0;
    if (c.role === 'gun' || c.role === 'off' || c.role === 'on') {
      var cn2 = corner(c.i), sx = cn2.sx, j2 = pit.jit[c.i];
      var offA2 = tk(0.46 + j2), offB2 = tk(0.74 + j2), onA2 = tk(0.74 + j2), onB2 = tk(1.06 + j2);
      if (c.role === 'gun') {
        var dash = sseg(t, PIT_TS - 0.16, PIT_TS + 0.05);      // 车未停稳就扑上去
        var back = sseg(t, offA2 - 0.02, offA2 + 0.08) - sseg(t, onB2 - 0.08, onB2);
        x = cn2.face + sx * (0.80 + 0.32 * (1 - dash) + 0.22 * back + 0.75 * out);
        z = cn2.hz; ry = Math.atan2(-sx, 0);
        P = mixPose(POSES.kneel, POSES.stand, out, tmp);
        var up = sseg(t, tk(1.28 + j2), tk(1.36 + j2)) * (1 - out);   // 举手示意完工
        P.shR = [P.shR[0] + (-2.85 - P.shR[0]) * up, P.shR[1]];
        P.elR = P.elR + (-0.1 - P.elR) * up;
        var spinning = (t > tk(0.30 + j2) && t < tk(0.46 + j2)) || (t > tk(1.06 + j2) && t < tk(1.26 + j2));
        if (spinning) c.tool.userData.socket.rotation.z += 70 * dts;
        c.tool.position.set(0, 0.40 + 0.42 * out, 0.80 - 0.42 * out);    // 起身撤离时把风炮提在手里
      } else if (c.role === 'off') {
        /* 拆胎手在风炮手身后（-z 侧）等候，旧胎滑出后递到他手上，再一起撤开 */
        var kA2 = sseg(t, offB2, offB2 + 0.5);
        x = cn2.hx + sx * (0.88 + 0.55 * kA2);
        z = cn2.hz - 0.55 - 0.35 * kA2;
        ry = Math.atan2(-sx, 0.3);
        P = mixPose(POSES.ready, POSES.carry, sseg(t, offA2 - 0.1, offA2 + 0.05), tmp);
      } else {
        /* 装胎手在前侧（+z）捧新胎等候，推胎入轴时斜向贴近，始终不挤占风炮手位置 */
        var kn3 = seg(t, onA2, onB2), kBack = sseg(t, onB2, onB2 + 0.35);
        var wx2 = kn3 < 0.55 ? 0.45 - 0.11 * sseg(kn3, 0, 0.55) : 0.34 * (1 - sseg(kn3, 0.55, 1));
        x = cn2.hx + sx * (wx2 + 0.46 + 0.45 * kBack);
        z = cn2.hz + 0.55 - 0.17 * sseg(kn3, 0, 1) + 0.25 * kBack;
        ry = Math.atan2(-sx, -0.5 * sseg(kn3, 0.3, 1));
        P = mixPose(POSES.carry, POSES.ready, kBack, tmp);
      }
    } else if (c.role === 'jackF') {
      var kf = hf / 0.075, side = sseg(t, tk(1.56), tk(1.56) + 0.3);
      x = pit.js * 1.8 * side; z = JACK_ZF + 1.30 + 0.25 * side; ry = Math.PI;
      P = mixPose(POSES.jack, POSES.push, kf, tmp);
      if (side > 0) P = mixPose(P, POSES.stand, side, tmp2);
      c.tool.userData.lever.rotation.x = hf / 0.32;
    } else if (c.role === 'jackR') {
      var kin = sseg(t, tk(0.0), tk(0.2));                    // 车停稳后从侧面横移到车尾
      x = pit.js * 1.55 * (1 - kin); z = JACK_ZR - 1.30; ry = 0;
      P = mixPose(POSES.jack, POSES.push, hr / 0.075, tmp);
      c.tool.userData.lever.rotation.x = hr / 0.32;
    } else {                                                  // 扶车手（左右各一）
      var sxs = c.i, kin2 = sseg(t, PIT_TS - 0.05, PIT_TS + 0.15);
      x = sxs * (1.62 - 0.38 * kin2 + 0.45 * out); z = 0.45; ry = Math.atan2(-sxs, 0);
      P = mixPose(POSES.ready, POSES.hold, kin2 * (1 - out), tmp);
    }
    c.root.position.set(x, 0, z);
    c.root.rotation.y = ry;
    applyPose(c, P);
  });

  /* 放行灯：停车期间红灯，放行瞬间转绿 */
  var green = t >= pit.Tgo;
  lampRedMat.emissiveIntensity = (!green && t > PIT_TS - 0.3) ? 2.6 : 0.2;
  lampGreenMat.emissiveIntensity = green ? 3.0 : 0.2;
}

/* ---- HUD：停车计时 + 换胎信息 + 评级 ---- */
var pitHud = document.getElementById('pitHud');
function pitHudTyres() {
  var t = I18N[lang];
  function dot(k) { return '<i class="tdot" style="background:' + PIT_TYRES[k].css + '"></i>'; }
  document.getElementById('phTyre').innerHTML = pit.oldKey
    ? dot(pit.oldKey) + t[PIT_TYRES[pit.oldKey].key] + ' → ' + dot(pit.newKey) + '<b>' + t[PIT_TYRES[pit.newKey].key] + '</b>'
    : t.pitNew + ' ' + dot(pit.newKey) + '<b>' + t[PIT_TYRES[pit.newKey].key] + '</b>';
}
function updatePitHud() {
  var t = pit.t, el = document.getElementById('phTime'), st = pitHud.classList;
  var stat = Math.max(0, Math.min(t, pit.Tgo) - PIT_TS);
  el.textContent = stat.toFixed(2);
  st.toggle('waiting', t < PIT_TS);
  st.toggle('done', t >= pit.Tgo);
  var rate = document.getElementById('phRate'), tx = I18N[lang];
  if (t >= pit.Tgo) {
    var s = pit.Tgo - PIT_TS;
    rate.textContent = s < 2.05 ? tx.rateTop : (s < 2.3 ? tx.rateGood : tx.rateOk);
  } else {
    rate.textContent = t < PIT_TS ? tx.pitWait : '';
  }
}
function pitFlash() {
  var f = document.getElementById('pitFlash');
  f.classList.add('on');
  setTimeout(function () { f.classList.remove('on'); }, 90);
}

var btnPit = document.getElementById('btnPit');
function startPit() {
  if (launchActive) stopLaunch(true);
  if (sceneMode !== 'track') applyScene('track');
  setLayer('full');
  var car = focusCar;
  pit.car = car; pit.phase = 'live'; pit.t = 0; pit.camInit = false; pit.fired = {};
  pit.S = 1.08 + Math.random() * 0.34;            // 本次机组发挥：停车约 1.9–2.5 s
  pit.jit = [0, 1, 2, 3].map(function () { return (Math.random() - 0.5) * 0.1; });
  pit.Tgo = tk(1.74);
  pit.home.set(car.homeX, 0, 0);
  pit.side = car.homeX > 0.1 ? -1 : 1;            // 转播机位放在靠场地中央一侧
  pit.js = pit.side;                              // 前千斤顶朝机位侧撤离；放行灯架在另一侧，不挡镜头
  pit.oldKey = tyreKeyOf(car.spec.tyreBand);
  var pool = ['soft', 'medium', 'hard'].filter(function (k) { return k !== pit.oldKey; });
  pit.newKey = pool[(Math.random() * pool.length) | 0];
  pit.liveCam = isOnboard(ctrl.view) ? 'onboard' : (ctrl.view === 'aerial' ? 'top' : 'tv');
  pit.replayCam = pit.liveCam === 'top' ? 'high' : 'top';
  /* 道具摆放 + 换成本队配色 */
  pitG.position.copy(pit.home);
  var kit = CREW_KIT[car.spec.id];
  crewSuitMat.color.copy(kit.suit); crewHelmetMat.color.copy(kit.helmet); crewTrimMat.color.copy(kit.trim);
  jackMat.color.copy(car.spec.id === 'mclaren' ? srgbCol(0xff8000) : kit.trim);
  pitBox.material.map = pitBoxTexFor(car); pitBox.material.needsUpdate = true;
  gantry.position.set(-pit.side * 1.95, 0, 3.3);
  gantry.scale.x = pit.side;                       // 横臂始终伸向赛车上方
  cars.forEach(function (c) { if (c.pitClones) c.pitClones.forEach(function (p) { p.old.visible = p.neu.visible = false; }); });
  pit.clones = ensurePitClones(car);
  pit.clones.forEach(function (p) {
    p.old.userData.band.color.setHex(car.spec.tyreBand);
    p.neu.userData.band.color.setHex(PIT_TYRES[pit.newKey].hex);
  });
  pitActive = true;
  pitG.visible = true; signG.visible = false;
  document.body.classList.add('pitting');          // 进站时收起参数卡，给画面让位
  setAuto(false);
  ctrl.mode = 'pit';
  btnPit.classList.add('active');
  btnPit.textContent = I18N[lang].pitStop;
  pitHud.classList.remove('hidden');
  document.getElementById('phRep').classList.add('hidden');
  pitHudTyres();
  evalPit(0, 0);
  updatePitHud();
  updateViewTip();
}
function stopPit(keepCam) {
  if (!pitActive) return;
  pitActive = false;
  var car = pit.car;
  car.wrap.position.set(car.homeX, 0.012, 0);
  car.wrap.rotation.y = car.baseRotY;
  car.group.position.y = 0; car.group.rotation.x = 0;
  car.tyreBandMat.color.setHex(car.spec.tyreBand);           // 复位为实拍胎色
  car.wheels.forEach(function (wr) { wr.spin.visible = true; });
  pitG.visible = false; signG.visible = true;
  document.body.classList.remove('pitting');
  btnPit.classList.remove('active');
  btnPit.textContent = I18N[lang].pit;
  pitHud.classList.add('hidden');
  restoreViewAfterDemo(keepCam, car);
}
btnPit.addEventListener('click', function () { pitActive ? stopPit() : startPit(); });

function updatePit(dt) {
  var dts = dt * (pit.phase === 'replay' ? PIT_REPLAY : 1);
  pit.t += dts;
  evalPit(pit.t, dts);
  updatePitHud();
  if (pit.phase === 'live' && pit.t >= pit.Tgo + 1.7) {        // 实时播完 → 换机位慢放回放
    pit.phase = 'replay'; pit.t = PIT_TS - 0.55; pit.camInit = false;
    document.getElementById('phRep').classList.remove('hidden');
    pitFlash();
    evalPit(pit.t, 0);
  } else if (pit.phase === 'replay' && pit.t >= pit.Tgo + 1.05) {
    stopPit(false);
  }
}
function pitEngine() {
  var t = pit.t;
  if (t < PIT_TS) return { rpm: 0.5 + 0.03 * Math.sin(elapsed * 40), throttle: 0.3 };   // 限速器嗡鸣
  if (t < pit.Tgo) return { rpm: 0.22, throttle: 0.08 };
  var v = pitCarZ(t)[1], gf = v / 6.5;
  return { rpm: Math.min(1, 0.4 + (gf - Math.floor(gf)) * 0.6), throttle: 1 };
}
function pitCamTick(dt) {
  var car = pit.car, H = pit.home;
  var kind = pit.phase === 'replay' ? pit.replayCam : pit.liveCam;
  if (kind === 'onboard') {
    var pose = onboardPose(car, ctrl.view);
    camera.position.copy(pose.p); camera.quaternion.copy(pose.q);
    camera.fov = THREE.MathUtils.damp(camera.fov, ctrl.fovCockpitGoal, 4, dt); camera.updateProjectionMatrix();
    setNear(0.02);
    return;
  }
  var cz = car.wrap.position.z, s = pit.side;
  var tp = new THREE.Vector3(), tl = new THREE.Vector3();
  if (kind === 'tv') {                              // 转播机位：车头斜前方，出站时甩镜头跟车
    tp.set(H.x + s * 2.7, 2.75, 7.2);
    tl.set(H.x, 0.35, THREE.MathUtils.clamp(cz, -7, 12) * 0.6 + 0.3);
  } else if (kind === 'top') {                      // 顶视：正上方俯拍四角同步作业
    var fz = THREE.MathUtils.clamp(cz, -5, 5) * 0.55;
    tp.set(H.x - s * 1.2, 9.6, fz); tl.set(H.x, 0, fz);
  } else {                                          // 高位斜前方（航拍现场后的回放机位）
    tp.set(H.x + s * 2.3, 4.7, 5.6);
    tl.set(H.x, 0.25, THREE.MathUtils.clamp(cz, -6, 8) * 0.5 + 0.1);
  }
  if (!pit.camInit) {
    pit.camP.copy(tp); pit.camL.copy(tl); pit.camInit = true;
    camera.fov = 40; camera.updateProjectionMatrix();
  }
  ['x', 'y', 'z'].forEach(function (a) {
    pit.camP[a] = THREE.MathUtils.damp(pit.camP[a], tp[a], 5, dt);
    pit.camL[a] = THREE.MathUtils.damp(pit.camL[a], tl[a], 7, dt);
  });
  camera.position.copy(pit.camP);
  camera.lookAt(pit.camL);
  setNear(kind === 'top' ? 0.1 : 0.03);
}
function pitDashSim(base) {
  var t = pit.t, v = pitCarZ(t)[1];
  var stopped = t >= PIT_TS && t < pit.Tgo;
  var gf = v / 6.5;
  return { speed: Math.round(v * 3.6), gear: stopped ? 'N' : Math.max(1, Math.min(8, Math.floor(gf) + 1)),
           rpm: stopped ? 0.22 : (t < PIT_TS ? 0.5 : Math.min(1, 0.4 + (gf - Math.floor(gf)) * 0.6)),
           ers: base.ers, drs: false, braking: false, t: elapsed, pit: t < pit.Tgo };
}
/* 仪表屏数据源：进站 / 起跑时跟随演示，平时走循环模拟 */
function demoSim(car) {
  var base = driveSim(elapsed + car.spec.simOffset);
  if (pitActive && car === pit.car) return pitDashSim(base);
  if (launchActive) {
    if (launchPhase === 'go') {
      var v = car.runV, gf = v / 6.5;
      return { speed: Math.round(v * 3.6), gear: Math.min(8, Math.floor(gf) + 1),
               rpm: Math.min(1, 0.4 + (gf - Math.floor(gf)) * 0.6), ers: base.ers,
               drs: v > 22, braking: false, t: elapsed };
    }
    var b = Math.abs(Math.sin(launchT * 6.5));
    return { speed: 0, gear: 1, rpm: 0.3 + 0.45 * b, ers: 1, drs: false, braking: false, t: elapsed };
  }
  return base;
}
function updateAudio() {
  if (!eng) return;
  var st = engineState(), now = audioCtx.currentTime;
  eng.master.gain.setTargetAtTime(soundOn ? 0.045 + 0.16 * st.throttle : 0, now, 0.05);
  var f0 = 40 + st.rpm * 300;
  eng.oscs.forEach(function (os) { os.o.frequency.setTargetAtTime(f0 * os.m, now, 0.03); });
  eng.lp.frequency.setTargetAtTime(320 + st.rpm * 4400, now, 0.04);
  eng.turbo.frequency.setTargetAtTime(1500 + st.rpm * 2800, now, 0.05);
  eng.turboG.gain.setTargetAtTime(soundOn ? 0.012 * st.throttle * st.rpm : 0, now, 0.06);
}

/* ---- 细节动画：DRS 襟翼 / 排气热浪 / 车轮转动 + 前轮转向 ---- */
function updateDetails(dt) {
  cars.forEach(function (car) {
    var s = driveSim(elapsed + car.spec.simOffset);
    var inPit = pitActive && car === pit.car;
    if (car.rwFlap) {
      var open = inPit ? false : (launchActive ? (launchPhase === 'go' && car.runV > 22) : s.drs);
      car.rwFlap.rotation.x = THREE.MathUtils.damp(car.rwFlap.rotation.x, open ? -0.16 : -0.58, 6, dt);
    }
    if (car.haze) {
      var thr = inPit ? pitEngine().throttle
        : (launchActive ? (launchPhase === 'go' ? 1 : 0.45) : (s.braking ? 0.12 : 0.45 + 0.5 * s.rpm));
      var fl = 0.5 + 0.5 * Math.sin(elapsed * 23 + car.spec.simOffset * 3.7);
      car.haze.material.opacity = (sceneMode === 'track' ? 0.20 : 0.15) * thr * (0.55 + 0.45 * fl);
      car.haze.scale.set(0.28 + 0.05 * fl, 0.32 + 0.18 * thr + 0.05 * fl, 1);
    }
    var spinInc = (launchActive && launchPhase === 'go') ? (car.runV / 0.36) * dt : 0;
    car.wheels.forEach(function (wr) {
      if (spinInc) wr.spin.rotation.x -= spinInc;
      if (wr.front) wr.yawGrp.rotation.y = launchActive ? car.runSteer : 0;
    });
  });
}

/* ---------------------------------------------------------- 主循环 ---- */
var clock = new THREE.Clock();
var qTmp = new THREE.Quaternion();

/* 可分享的固定机位：index.html#th=-0.55&phi=1.35&r=9 */
(function () {
  var m = location.hash.match(/th=(-?[\d.]+).*?phi=([\d.]+).*?r=([\d.]+)/);
  if (m) {
    ctrl.sphGoal.theta = parseFloat(m[1]);
    ctrl.sphGoal.phi = parseFloat(m[2]);
    ctrl.sphGoal.radius = parseFloat(m[3]);
    setAuto(false);
  }
})();

/* 开场镜头；也支持分享链接直达：#car=mclaren&view=tcam（view 可为 orbit / cockpit / tcam / aerial） */
(function () {
  var carM = location.hash.match(/car=(ferrari|mclaren|redbull)/);
  var viewM = location.hash.match(/view=(orbit|cockpit|tcam|aerial)/);
  if (carM) {
    focusCar = CAR_BY_ID[carM[1]];
    document.body.setAttribute('data-focus', focusCar.spec.id);
    document.getElementById('spec').innerHTML = specHTMLFor(focusCar);
    document.querySelectorAll('[data-car]').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-car') === focusCar.spec.id);
    });
    ctrl.targetGoal.copy(focusCar.center);
    if (!/[#&]r=/.test(location.hash)) ctrl.sphGoal.radius = 7.6;
  }
  if (viewM && viewM[1] !== 'orbit') {
    camera.position.set(16, 8.5, 21); camera.lookAt(0, 0.5, 0);
    setView(viewM[1]);
  } else {
    flyTo(orbitPose(), 40, 2.0, 'orbit');
  }
})();

function animate() {
  requestAnimationFrame(animate);
  var dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  /* 拆解动画 */
  cars.forEach(function (car) {
    car.openT = THREE.MathUtils.damp(car.openT, car.openGoal, 4.5, dt);
    var e = easeIO(THREE.MathUtils.clamp(car.openT, 0, 1));
    car.cover.position.y = car.coverBase.y + 0.92 * e;
    car.cover.position.z = car.coverBase.z - 0.28 * e;
    car.cover.rotation.x = -0.13 * e;
    car.podL.position.x = car.podLBase.x - 0.85 * e;
    car.podR.position.x = car.podRBase.x + 0.85 * e;
    car.podL.position.y = car.podLBase.y + 0.10 * e;
    car.podR.position.y = car.podRBase.y + 0.10 * e;
    car.noseG.position.z = car.noseBase.z + 0.55 * e;
  });

  /* 仪表屏（起跑 / 进站时显示演示车速与档位） */
  cars.forEach(function (c) { drawDash(c, demoSim(c)); });

  /* 起跑 + 进站 + 细节 + 声浪 + 扬沙 */
  if (launchActive) updateLaunch(dt);
  if (pitActive) updatePit(dt);
  updateDetails(dt);
  updateDust(dt);
  updateAudio();

  /* 相机 */
  if (ctrl.mode === 'launch') {
    launchCamTick(dt);
  } else if (ctrl.mode === 'pit') {
    pitCamTick(dt);
  } else if (ctrl.mode === 'anim' && camAnim) {
    setNear(isOnboard(camAnim.endMode) ? 0.02 : 0.05);
    var tt = (performance.now() - camAnim.start) / 1000;
    var k = easeIO(Math.min(1, tt / camAnim.dur));
    camera.position.lerpVectors(camAnim.p0, camAnim.p1, k);
    camera.position.y += Math.sin(k * Math.PI) * camAnim.lift;
    qTmp.copy(camAnim.q0).slerp(camAnim.q1, k);
    camera.quaternion.copy(qTmp);
    camera.fov = camAnim.f0 + (camAnim.f1 - camAnim.f0) * k;
    camera.updateProjectionMatrix();
    if (tt >= camAnim.dur) {
      ctrl.mode = camAnim.endMode;
      if (ctrl.mode === 'orbit') {
        ctrl.sph.radius = ctrl.sphGoal.radius;
        ctrl.sph.phi = ctrl.sphGoal.phi;
        ctrl.sph.theta = ctrl.sphGoal.theta;
        ctrl.target.copy(ctrl.targetGoal);
      }
      camAnim = null;
    }
  } else if (ctrl.mode === 'orbit') {
    if (ctrl.auto) ctrl.sphGoal.theta += dt * 0.18;
    ctrl.sph.radius = THREE.MathUtils.damp(ctrl.sph.radius, ctrl.sphGoal.radius, 8, dt);
    ctrl.sph.phi = THREE.MathUtils.damp(ctrl.sph.phi, ctrl.sphGoal.phi, 8, dt);
    ctrl.sph.theta = THREE.MathUtils.damp(ctrl.sph.theta, ctrl.sphGoal.theta, 8, dt);
    ctrl.target.x = THREE.MathUtils.damp(ctrl.target.x, ctrl.targetGoal.x, 8, dt);
    ctrl.target.y = THREE.MathUtils.damp(ctrl.target.y, ctrl.targetGoal.y, 8, dt);
    ctrl.target.z = THREE.MathUtils.damp(ctrl.target.z, ctrl.targetGoal.z, 8, dt);
    camera.position.setFromSpherical(ctrl.sph).add(ctrl.target);
    camera.lookAt(ctrl.target);
    setNear(0.03);
  } else if (ctrl.mode === 'cockpit' || ctrl.mode === 'tcam') {
    ctrl.yaw = THREE.MathUtils.damp(ctrl.yaw, ctrl.yawGoal, 10, dt);
    ctrl.pitch = THREE.MathUtils.damp(ctrl.pitch, ctrl.pitchGoal, 10, dt);
    var pose = onboardPose(focusCar, ctrl.mode);
    pose.p.y += Math.sin(elapsed * 1.6) * 0.0035;    // 轻微呼吸感
    camera.position.copy(pose.p);
    camera.quaternion.copy(pose.q);
    qTmp.setFromAxisAngle(V_Y, ctrl.yaw); camera.quaternion.multiply(qTmp);
    qTmp.setFromAxisAngle(V_X, ctrl.pitch); camera.quaternion.multiply(qTmp);
    var f = THREE.MathUtils.damp(camera.fov, ctrl.fovCockpitGoal, 8, dt);
    if (Math.abs(f - camera.fov) > 0.001) { camera.fov = f; camera.updateProjectionMatrix(); }
    setNear(0.02);
  } else if (ctrl.mode === 'aerial') {
    /* 航拍：缓慢盘旋（自动旋转开启时）+ 直升机式轻微起伏 */
    if (ctrl.auto) ctrl.aerGoal.theta += dt * 0.07;
    ctrl.aer.theta = THREE.MathUtils.damp(ctrl.aer.theta, ctrl.aerGoal.theta, 3, dt);
    ctrl.aer.r = THREE.MathUtils.damp(ctrl.aer.r, ctrl.aerGoal.r, 3, dt);
    ctrl.aer.h = THREE.MathUtils.damp(ctrl.aer.h, ctrl.aerGoal.h, 3, dt);
    var ap = aerialPose(ctrl.aer, Math.sin(elapsed * 0.6) * (sceneMode === 'garage' ? 0.04 : 0.18));
    camera.position.copy(ap.p);
    camera.quaternion.copy(ap.q);
    var fa = THREE.MathUtils.damp(camera.fov, ctrl.fovAerial, 6, dt);
    if (Math.abs(fa - camera.fov) > 0.001) { camera.fov = fa; camera.updateProjectionMatrix(); }
    setNear(sceneMode === 'garage' ? 0.1 : 0.4);
  }

  renderer.render(scene, camera);
}
animate();
})();
