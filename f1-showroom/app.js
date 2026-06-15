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
var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
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

var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.02, 120);
camera.position.set(16, 8.5, 21);

/* 环境反射贴图 ×2（PMREM）：暗夜车库灯管条 / 摩洛哥晴空沙漠 */
var envGarage, envTrack;
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
  /* 赛道：蓝天穹顶 + 暖阳 + 沙漠地面反弹 */
  var t = new THREE.Scene();
  t.add(new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x86add4, side: THREE.BackSide })));
  var sunBall = new THREE.Mesh(new THREE.SphereGeometry(1.4, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xfff2cf }));
  sunBall.position.set(6, 8, -3);
  t.add(sunBall);
  var sand = new THREE.Mesh(new THREE.PlaneGeometry(24, 24),
    new THREE.MeshBasicMaterial({ color: 0x8a6e46 }));
  sand.rotation.x = -Math.PI / 2; sand.position.y = -0.5;
  t.add(sand);
  envTrack = pm.fromScene(t, 0.045).texture;
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
key.shadow.camera.left = -6.5; key.shadow.camera.right = 6.5;
key.shadow.camera.top = 6.5;  key.shadow.camera.bottom = -6.5;
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
function loft(secs, segs, flip) {
  segs = segs || 28;
  var pos = [], idx = [], i, j;
  for (i = 0; i < secs.length; i++) {
    var s = secs[i], e = s.e || 1;
    for (j = 0; j < segs; j++) {
      var p = superPt(j / segs * Math.PI * 2, e);
      pos.push((s.cx || 0) + p[0] * s.rx, s.cy + p[1] * s.ry, s.z);
    }
  }
  for (i = 0; i < secs.length - 1; i++) {
    for (j = 0; j < segs; j++) {
      var a = i * segs + j, b = i * segs + (j + 1) % segs,
          c2 = (i + 1) * segs + j, d = (i + 1) * segs + (j + 1) % segs;
      if (flip) idx.push(a, c2, b, b, c2, d);
      else idx.push(a, b, c2, b, d, c2);
    }
  }
  var g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
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
/* 灯组正下方的地面光池（照片中地面亮斑跟随吊灯） */
addGlow(-3.4, 1.2, 6, 0.09); addGlow(0.3, -0.8, 5, 0.07); addGlow(3.2, 1.0, 6, 0.09);
addGlow(-1.8, 0, 8, 0.04); addGlow(1.8, 0, 8, 0.04); addGlow(0, -1, 18, 0.025);

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
lightCluster(-3.6, 3.5, 1.8, [
  [-0.6, 0.1, 0, 0, 0.3, 0.35], [0.4, -0.2, 0.3, 0, -0.2, -0.25], [1.1, 0.25, -0.2, 0, 0.5, 0.15]
], -1.8);
lightCluster(0.3, 4.1, -1.2, [
  [-0.4, 0, 0, 0, 0.8, -0.3], [0.6, 0.2, 0.2, 0, -0.4, 0.2]
], 0);
lightCluster(3.4, 3.6, 1.4, [
  [-0.5, 0.15, 0.1, 0, -0.6, -0.2], [0.5, -0.1, -0.15, 0, 0.25, 0.3], [1.2, 0.2, 0.15, 0, 0.9, -0.12]
], 1.8);

/* 地面车名指示牌 */
function buildSign(x, line1, accent) {
  var tex = canvasTex(512, 150, function (c, w, h) {
    c.fillStyle = 'rgba(10,11,15,0.92)'; c.fillRect(0, 0, w, h);
    c.strokeStyle = accent; c.lineWidth = 5; c.strokeRect(7, 7, w - 14, h - 14);
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = '#f2f3f7'; c.font = '700 52px Georgia, "PingFang SC", serif';
    c.fillText(line1, w / 2, h / 2 + 2);
  });
  var g = new THREE.Group();
  var p = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.293),
    new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
  p.position.y = 0.42; p.rotation.x = -0.12;
  var post = box(0.045, 0.30, 0.045, stdMat(0x101216, 0.4, 0.8), 0, 0.14, -0.02);
  var foot = box(0.30, 0.025, 0.18, stdMat(0x101216, 0.4, 0.8), 0, 0.012, -0.02);
  g.add(p, post, foot);
  g.position.set(x, 0, 3.6);
  scene.add(g);
}

/* --------------------------------- 摩洛哥赛道（马拉喀什街道赛风格） ---- */
var trackG = new THREE.Group();
scene.add(trackG);
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
  /* 起步线（黑白格）+ 两个发车格 */
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
  [-1.85, 1.85].forEach(function (gx) {
    [-1, 1].forEach(function (s) {
      var l = box(0.08, 0.004, 4.4, gridMat, gx + s * 1.05, 0.0065, 0.2);
      l.castShadow = false; tAdd(l);
    });
    var f = box(2.18, 0.004, 0.08, gridMat, gx, 0.0065, 2.4);
    f.castShadow = false; tAdd(f);
  });
  /* 起步灯架 */
  var pillarMat = stdMat(0x2a2d33, 0.5, 0.6);
  tAdd(box(0.28, 4.4, 0.28, pillarMat, -6.9, 2.2, 13));
  tAdd(box(0.28, 4.4, 0.28, pillarMat, 6.9, 2.2, 13));
  tAdd(box(14.1, 0.34, 0.3, pillarMat, 0, 4.35, 13));
  for (var li = 0; li < 5; li++) {
    tAdd(box(0.34, 0.62, 0.18, stdMat(0x101114, 0.6, 0.3), -1.7 + li * 0.85, 3.85, 13));
    for (var lj = 0; lj < 2; lj++) {
      var lamp = mesh(new THREE.SphereGeometry(0.085, 10, 8),
        stdMat(0x3a0d0d, 0.4, 0.2, { emissive: new THREE.Color(0x7a1212), emissiveIntensity: 0.7 }),
        -1.7 + li * 0.85, 3.7 + lj * 0.3, 12.88);
      lamp.castShadow = false; tAdd(lamp);
    }
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
  var sun = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTex, color: 0xfff0c8, transparent: true, opacity: 0.95,
    blending: THREE.AdditiveBlending, depthWrite: false }));
  sun.scale.set(26, 26, 1);
  sun.position.set(52, 34, -26);
  sun.userData.noRay = true;
  tAdd(sun);
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
  ]), paint);
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
  var haloMat = phyMat(spec.haloColor, 0.45, 0.4, 0.6, 0.2);
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
  ]), paint);
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
    var body = mesh(loft(secs), paint);
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
  ]), paint);
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

  /* ---- 尾翼 ---- */
  var rwMain = box(1.00, 0.018, 0.345, spec.rwMainMat, 0, 0.875, -2.28); rwMain.rotation.x = -0.22;
  var rwFlap = box(1.00, 0.014, 0.22, spec.flapMat, 0, 0.97, -2.40); rwFlap.rotation.x = -0.58;
  var drsPod = box(0.05, 0.035, 0.09, M.carbon, 0, 1.015, -2.33);
  chassis.add(rwMain, rwFlap, drsPod);
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
    return g;
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
      var g = new THREE.MeshPhysicalMaterial({
        color: m.color ? m.color.clone() : new THREE.Color(0x888888),
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

/* ------------------------------------------------------ 组装到展台 ---- */
var cars = [];
function placeCar(spec, x, ry) {
  buildSign(x * 1.35, spec.plaque1, spec.plaqueAccent);
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
  cars.push(car);
  return car;
}
var ferrari = placeCar(SPEC_FERRARI, -1.85, 0.30);
var redbull = placeCar(SPEC_REDBULL, 1.85, -0.30);
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
  return { speed: Math.round(speed), gear: gear, rpm: rpmFrac, ers: 0.35 + 0.6 * Math.abs(Math.sin(t * 0.35)), drs: speed > 290, t: t };
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
  /* 圈速增量 */
  x.font = '700 17px Arial'; x.fillStyle = '#2ecc40';
  x.fillText('-0.18', 204, 58);
  x.font = '600 11px Arial'; x.fillStyle = '#5a6075';
  x.fillText('DELTA', 204, 76);
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
    docTitle: 'F1 暗夜车库实景 3D · 法拉利 F1-75 vs 红牛 RB21',
    title: 'F1 暗夜车库 3D 实景', badge: '实拍还原',
    sub: '法拉利 F1-75 × 红牛 RB21 — 360° 自由旋转 · 驾驶舱第一视角 · 分层拆解引擎',
    lblScene: '场 景', sceneTrack: '🏜️ 摩洛哥赛道', sceneGarage: '🌃 暗夜车库',
    lblCar: '车 辆', lblView: '视 角', lblLayer: '结构层',
    carF: '🟥 法拉利 F1-75', carR: '🟦 红牛 RB21',
    viewOrbit: '360° 环绕展示', viewCockpit: '驾驶舱第一视角',
    layerFull: '完整车身', layerXray: '透视外壳（X 光）', layerOpen: '拆解 · 引擎细节',
    spinOn: '⟳ 自动旋转：开', spinOff: '⟳ 自动旋转：关',
    langBtn: '🌐 English',
    hint: '拖动旋转 · 滚轮 / 双指缩放<br>右键拖动平移 · 点击赛车聚焦',
    tip: '拖动环顾四周 · 方向盘中央即仪表屏（转速灯 / 档位 / 车速 / ERS）· 滚轮调整视野'
  },
  en: {
    docTitle: 'F1 Night Garage 3D · Ferrari F1-75 vs Red Bull RB21',
    title: 'F1 Night Garage in 3D', badge: 'PHOTO-MATCHED',
    sub: 'Ferrari F1-75 × Red Bull RB21 — free 360° orbit · cockpit POV · layered engine teardown',
    lblScene: 'SCENE', sceneTrack: '🏜️ Marrakesh Track', sceneGarage: '🌃 Night Garage',
    lblCar: 'CAR', lblView: 'VIEW', lblLayer: 'LAYERS',
    carF: '🟥 Ferrari F1-75', carR: '🟦 Red Bull RB21',
    viewOrbit: '360° Orbit', viewCockpit: 'Cockpit POV',
    layerFull: 'Full Body', layerXray: 'X-Ray Shell', layerOpen: 'Teardown · Engine',
    spinOn: '⟳ Auto-rotate: ON', spinOff: '⟳ Auto-rotate: OFF',
    langBtn: '🌐 中文',
    hint: 'Drag to orbit · scroll / pinch to zoom<br>right-drag to pan · click a car to focus',
    tip: 'Drag to look around · the wheel screen is your dash (RPM LEDs / gear / speed / ERS) · scroll adjusts FOV'
  }
};
var lang = 'zh';
function specHTMLFor(car) {
  return lang === 'zh' ? car.spec.specHTML : car.spec.specHTMLen;
}

/* ------------------------------------------------------ 相机控制 ---- */
var ctrl = {
  mode: 'orbit',                       // orbit | cockpit | anim
  view: 'orbit',
  target: new THREE.Vector3(0, 0.55, 0),
  targetGoal: new THREE.Vector3(0, 0.55, 0),
  sph: new THREE.Spherical(15, 1.13, 0.50),
  sphGoal: new THREE.Spherical(10.5, 1.16, 0.46),
  yaw: 0, pitch: 0, yawGoal: 0, pitchGoal: 0,
  fovOrbit: 40, fovCockpit: 66, fovCockpitGoal: 66,
  auto: true
};
var R_MIN = 1.1, R_MAX = 16;
var camAnim = null;
function easeIO(k) { return k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2; }
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
    pinchR0 = ctrl.sphGoal.radius;
  }
});
canvas.addEventListener('pointermove', function (e) {
  var pt = pointers.get(e.pointerId);
  if (!pt) return;
  var dx = e.clientX - pt.x, dy = e.clientY - pt.y;
  pt.x = e.clientX; pt.y = e.clientY;
  movedPx += Math.abs(dx) + Math.abs(dy);
  if (pointers.size === 1) {
    if (ctrl.mode === 'cockpit') {
      ctrl.yawGoal = THREE.MathUtils.clamp(ctrl.yawGoal - dx * 0.0042, -2.6, 2.6);
      ctrl.pitchGoal = THREE.MathUtils.clamp(ctrl.pitchGoal - dy * 0.0035, -0.8, 0.55);
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
    if (movedPx < 7 && performance.now() - downTime < 350 && ctrl.mode === 'orbit' && e.button !== 2) {
      clickFocus(e);
    }
  }
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', function (e) {
  e.preventDefault();
  if (ctrl.mode === 'cockpit') {
    ctrl.fovCockpitGoal = THREE.MathUtils.clamp(ctrl.fovCockpitGoal + e.deltaY * 0.02, 35, 80);
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
  var all = ferrari.rayMeshes.concat(redbull.rayMeshes);
  var hits = raycaster.intersectObjects(all, false);
  if (hits.length) setFocus(hits[0].object.userData.carRef, true);
}

/* ---------------------------------------------------------- 状态机 ---- */
var layerMode = 'full';
function setLayer(mode) {
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
function setView(mode) {
  if (ctrl.view === mode) return;
  ctrl.view = mode;
  if (mode === 'cockpit') {
    ctrl.yaw = ctrl.yawGoal = 0;
    ctrl.pitch = ctrl.pitchGoal = 0;
    ctrl.fovCockpitGoal = 66;
    flyTo(cockpitPose(focusCar), 66, 1.25, 'cockpit');
  } else {
    flyTo(orbitPose(), ctrl.fovOrbit, 1.05, 'orbit');
  }
  document.querySelectorAll('[data-view]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-view') === mode);
  });
  document.getElementById('cockpitTip').classList.toggle('hidden', mode !== 'cockpit');
}
function setFocus(car, fromClick) {
  if (focusCar === car && fromClick) return;
  focusCar = car;
  document.body.setAttribute('data-focus', car.spec.id);
  document.getElementById('spec').innerHTML = specHTMLFor(car);
  document.querySelectorAll('[data-car]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-car') === car.spec.id);
  });
  if (ctrl.view === 'cockpit') {
    ctrl.yaw = ctrl.yawGoal = 0; ctrl.pitch = ctrl.pitchGoal = 0;
    flyTo(cockpitPose(car), ctrl.fovCockpitGoal, 1.1, 'cockpit');
  } else {
    ctrl.targetGoal.copy(car.center);
    ctrl.sphGoal.radius = 7.2;
  }
}
/* 场景切换：摩洛哥赛道（正午烈日）/ 暗夜车库（聚光氛围） */
var sceneMode = 'track';
function applyScene(s) {
  sceneMode = s;
  try { localStorage.setItem('f1scene', s); } catch (e) {}
  garageG.visible = (s === 'garage');
  trackG.visible = (s === 'track');
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
    scene.background.set(0x8fb9de);
    scene.fog.color.set(0xddc8a2); scene.fog.near = 34; scene.fog.far = 115;
    scene.environment = envTrack;
    hemi.color.set(0xbfd9f5); hemi.groundColor.set(0x9a7445); hemi.intensity = 0.44;
    key.color.set(0xffe9c2); key.intensity = 1.32; key.position.set(9, 13, -4);
    rim.color.set(0x9db8e0); rim.intensity = 0.18;
    fill.color.set(0xffe2bb); fill.intensity = 0.24;
    renderer.toneMappingExposure = 1.0;
  }
  document.querySelectorAll('[data-scene]').forEach(function (b) {
    b.classList.toggle('active', b.getAttribute('data-scene') === s);
  });
}

/* UI 事件 */
document.querySelectorAll('[data-scene]').forEach(function (b) {
  b.addEventListener('click', function () { applyScene(b.getAttribute('data-scene')); });
});
document.querySelectorAll('[data-car]').forEach(function (b) {
  b.addEventListener('click', function () {
    setFocus(b.getAttribute('data-car') === 'ferrari' ? ferrari : redbull, false);
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
  document.getElementById('tTitle').textContent = t.title;
  document.getElementById('tBadge').textContent = t.badge;
  document.getElementById('tSub').textContent = t.sub;
  document.getElementById('lblCar').textContent = t.lblCar;
  document.getElementById('lblView').textContent = t.lblView;
  document.getElementById('lblLayer').textContent = t.lblLayer;
  document.querySelector('[data-car="ferrari"]').textContent = t.carF;
  document.querySelector('[data-car="redbull"]').textContent = t.carR;
  document.querySelector('[data-view="orbit"]').textContent = t.viewOrbit;
  document.querySelector('[data-view="cockpit"]').textContent = t.viewCockpit;
  document.querySelector('[data-layer="full"]').textContent = t.layerFull;
  document.querySelector('[data-layer="xray"]').textContent = t.layerXray;
  document.querySelector('[data-layer="open"]').textContent = t.layerOpen;
  document.getElementById('btnLang').textContent = t.langBtn;
  document.getElementById('hint').innerHTML = t.hint;
  document.getElementById('cockpitTip').textContent = t.tip;
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
var savedScene = 'track';
try { savedScene = localStorage.getItem('f1scene') || 'track'; } catch (e) {}
var sceneM = location.hash.match(/scene=(track|garage)/);
if (sceneM) savedScene = sceneM[1];
applyScene(savedScene);

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------------------------------------------------- 主循环 ---- */
var clock = new THREE.Clock();
var elapsed = 0;
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

/* 开场镜头 */
flyTo(orbitPose(), 40, 2.0, 'orbit');

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

  /* 仪表屏 */
  var sim = driveSim(elapsed);
  drawDash(ferrari, sim);
  drawDash(redbull, driveSim(elapsed + 5.2));

  /* 相机 */
  if (ctrl.mode === 'anim' && camAnim) {
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
  } else if (ctrl.mode === 'cockpit') {
    ctrl.yaw = THREE.MathUtils.damp(ctrl.yaw, ctrl.yawGoal, 10, dt);
    ctrl.pitch = THREE.MathUtils.damp(ctrl.pitch, ctrl.pitchGoal, 10, dt);
    var pose = cockpitPose(focusCar);
    pose.p.y += Math.sin(elapsed * 1.6) * 0.0035;    // 轻微呼吸感
    camera.position.copy(pose.p);
    camera.quaternion.copy(pose.q);
    qTmp.setFromAxisAngle(V_Y, ctrl.yaw); camera.quaternion.multiply(qTmp);
    qTmp.setFromAxisAngle(V_X, ctrl.pitch); camera.quaternion.multiply(qTmp);
    var f = THREE.MathUtils.damp(camera.fov, ctrl.fovCockpitGoal, 8, dt);
    if (Math.abs(f - camera.fov) > 0.001) { camera.fov = f; camera.updateProjectionMatrix(); }
  }

  renderer.render(scene, camera);
}
animate();
})();
