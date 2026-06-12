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

/* 暗夜车库环境反射（PMREM：黑场 + 头顶灯管条，参考实拍） */
(function buildEnvMap() {
  var env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(12, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0x030405, side: THREE.BackSide })));
  function strip(x, y, z, ry) {
    var m = new THREE.Mesh(
      new THREE.BoxGeometry(3.6, 0.14, 0.5),
      new THREE.MeshBasicMaterial({ color: 0xc9d4e4 }));
    m.position.set(x, y, z); m.rotation.y = ry;
    env.add(m);
  }
  strip(-3.5, 5.0, 1.5, 0.4); strip(0.5, 5.6, -1.0, -0.2);
  strip(3.4, 5.2, 1.2, 0.7);  strip(-1.0, 4.6, -3.0, 1.2);
  strip(2.0, 4.8, 3.0, -0.8);
  var bounce = new THREE.Mesh(new THREE.PlaneGeometry(16, 16),
    new THREE.MeshBasicMaterial({ color: 0x16140f }));
  bounce.rotation.x = Math.PI / 2; bounce.position.y = -0.01;
  env.add(bounce);
  var pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.035).texture;
  pm.dispose();
})();

/* 灯光：冷白主灯（投影）+ 蓝色轮廓光 + 微弱环境光，按实拍影调 */
scene.add(new THREE.HemisphereLight(0xaabdda, 0x0c0a08, 0.22));
var key = new THREE.DirectionalLight(0xeef1f6, 1.05);
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
/* 部件标注（始终面向相机的悬浮标签） */
function partLabel(text, accentCss) {
  var tex = canvasTex(384, 96, function (x, w, h) {
    function rr(a, b, ww, hh, r) {
      x.beginPath();
      x.moveTo(a + r, b); x.arcTo(a + ww, b, a + ww, b + hh, r); x.arcTo(a + ww, b + hh, a, b + hh, r);
      x.arcTo(a, b + hh, a, b, r); x.arcTo(a, b, a + ww, b, r); x.closePath();
    }
    rr(4, 10, w - 8, h - 20, 18);
    x.fillStyle = 'rgba(8,10,18,0.85)'; x.fill();
    x.lineWidth = 3; x.strokeStyle = accentCss || 'rgba(255,255,255,0.45)'; x.stroke();
    x.font = '600 36px "PingFang SC", "Microsoft YaHei", sans-serif';
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillStyle = '#f5f7ff'; x.fillText(text, w / 2, h / 2 + 1);
  });
  var sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, toneMapped: false }));
  sp.scale.set(0.95, 0.2375, 1);   // 父级整体缩 1/16，故此处用"真实尺度"标定
  sp.renderOrder = 999;
  sp.userData.noRay = true;
  return sp;
}

/* ------------------------------------------- 暗夜车库（参考实拍搭建） ---- */
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
var floorMat = phyMat(0x393c42, 0.5, 0.08, 0.18, 0.55, { envMapIntensity: 0.26 });
floorMat.map = floorTex;
var ground = mesh(new THREE.PlaneGeometry(34, 28), floorMat, 0, 0, 0);
ground.rotation.x = -Math.PI / 2;
ground.castShadow = false;
scene.add(ground);

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
  scene.add(m);
}
wall(26, 7, 0, 3.5, -11, 0);
wall(26, 7, 0, 3.5, 12.5, Math.PI);
wall(24, 7, -12.5, 3.5, 0, Math.PI / 2);
wall(24, 7, 12.5, 3.5, 0, -Math.PI / 2);
var ceil = mesh(new THREE.PlaneGeometry(26, 24), stdMat(0x0a0a0c, 1, 0), 0, 7, 0);
ceil.rotation.x = Math.PI / 2;
ceil.castShadow = false;
scene.add(ceil);

/* 远处亮门洞（照片右后方） */
var doorway = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.4),
  new THREE.MeshBasicMaterial({ color: 0x8d97a4 }));
doorway.position.set(6.8, 2.2, -10.96);
scene.add(doorway);
var doorFrame = box(2.7, 4.7, 0.08, stdMat(0x0c0d10, 0.9, 0), 6.8, 2.3, -10.99);
doorFrame.castShadow = false;
scene.add(doorFrame);

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
  scene.add(g);
}
addGlow(-1.8, 0, 8, 0.06); addGlow(1.8, 0, 8, 0.06); addGlow(0, -1, 18, 0.035);

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
  scene.add(g);
  var spot = new THREE.SpotLight(0xdfe8f5, 0.6, 0, 0.85, 0.7);
  spot.position.set(cx, cy, cz);
  spot.target.position.set(aimX, 0, 0);
  scene.add(spot); scene.add(spot.target);
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
  var floor = box(1.40, 0.035, 2.65, M.carbonM, 0, 0.075, -0.35);
  var floorFront = box(0.95, 0.03, 0.62, M.carbonM, 0, 0.075, 1.26);
  var diff = box(0.98, 0.03, 0.58, M.carbon, 0, 0.155, -1.93);
  diff.rotation.x = 0.24;
  var edgeL = box(0.05, 0.018, 1.5, paint2, -0.715, 0.105, 0.05);
  var edgeR = box(0.05, 0.018, 1.5, paint2, 0.715, 0.105, 0.05);
  chassis.add(floor, floorFront, diff, edgeL, edgeR);

  /* ---- 座舱单体壳 + 上盖板（带真实开口） ---- */
  var tub = mesh(new THREE.CylinderGeometry(0.5, 0.5, 1, 24, 1, false), paint, 0, 0.33, 0.66);
  tub.geometry.rotateX(Math.PI / 2);
  tub.scale.set(0.72, 0.56, 1.42);
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
  var haloRing = mesh(new THREE.TorusGeometry(0.31, 0.030, 10, 36), haloMat, 0, 0.925, 0.52);
  haloRing.geometry.rotateX(Math.PI / 2);
  haloRing.scale.set(1, 1, 1.38);
  var haloPost = rod(0, 0.60, 0.93, 0, 0.925, 0.945, 0.024, haloMat);
  var haloL = rod(-0.30, 0.60, 0.12, -0.295, 0.918, 0.30, 0.024, haloMat);
  var haloR = rod(0.30, 0.60, 0.12, 0.295, 0.918, 0.30, 0.024, haloMat);
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

  /* T 型摄像机座 */
  var tcam = box(0.13, 0.035, 0.045, stdMat(0x111111, 0.6, 0.2), 0, 1.005, 0.10);
  chassis.add(tcam);
  /* 鼻梁天线 */
  chassis.add(rod(0, 0.60, 1.30, 0, 0.72, 1.26, 0.004, M.carbonM));
  chassis.add(rod(-0.06, 0.60, 1.42, -0.06, 0.70, 1.40, 0.004, M.carbonM));

  /* ---- 鼻锥 + 前翼（noseG，可整体前移演示拆装） ---- */
  var nose = mesh(new THREE.CylinderGeometry(0.075, 0.23, 1.45, 20), paint, 0, 0.385, 2.075);
  nose.geometry.rotateX(Math.PI / 2);
  nose.scale.set(1, 0.62, 1);
  nose.rotation.x = 0.103;
  noseG.add(nose);
  var noseTip = mesh(new THREE.SphereGeometry(0.075, 14, 10), spec.noseTipMat, 0, 0.312, 2.795);
  noseTip.scale.set(1, 0.6, 1.3);
  noseG.add(noseTip);
  /* 鼻锥号码色带（红牛：红底白字，参考实拍） */
  if (spec.noseBand) {
    var nb = mesh(new THREE.CylinderGeometry(0.150, 0.176, 0.30, 20), stdMat(spec.noseBand, 0.45, 0.3), 0, 0.398, 1.95);
    nb.geometry.rotateX(Math.PI / 2);
    nb.scale.set(1.03, 0.64, 1);
    nb.rotation.x = 0.103;
    noseG.add(nb);
  }
  var noseNum = decal(spec.number, 0.28, 0.28, { italic: true, cw: 256, ch: 256, size: 168, color: spec.numColor, stroke: spec.numStroke });
  noseNum.rotation.x = -1.42;
  noseNum.position.set(spec.numPos[0], spec.numPos[1], spec.numPos[2]);
  noseG.add(noseNum);

  /* 前翼：四层翼片 + 端板 */
  var wingEl = [
    { y: 0.095, z: 2.82, r: -0.05, c: M.carbon, ch: 0.17 },
    { y: 0.130, z: 2.73, r: -0.17, c: M.carbon, ch: 0.16 },
    { y: 0.163, z: 2.645, r: -0.30, c: spec.wing3Mat, ch: 0.15 },
    { y: 0.196, z: 2.565, r: -0.44, c: spec.wing4Mat, ch: 0.14 }
  ];
  wingEl.forEach(function (e) {
    var w = box(1.82, 0.013, e.ch, e.c, 0, e.y, e.z);
    w.rotation.x = e.r;
    noseG.add(w);
  });
  [-1, 1].forEach(function (sx) {
    var ep = box(0.013, 0.17, 0.36, spec.endplateMat, sx * 0.915, 0.165, 2.68);
    ep.rotation.y = sx * 0.10;
    var tip = box(0.013, 0.045, 0.30, paint, sx * 0.945, 0.262, 2.66);
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
    var body = mesh(new THREE.SphereGeometry(1, 22, 16), paint, sx * 0.40, 0.335, 0.0);
    body.scale.set(0.27, 0.185, 0.62);
    var ramp = box(0.42, 0.13, 0.75, paint2, sx * 0.40, 0.20, -0.55);
    ramp.rotation.x = 0.18;
    var inlet = box(0.26, 0.135, 0.05, M.innerDark, sx * 0.405, 0.475, 0.575);
    var lip = box(0.30, 0.022, 0.06, paint, sx * 0.405, 0.553, 0.575);
    /* 平整侧板：承载车队字样，避免贴花悬空 */
    var sidePanel = box(0.014, 0.17, 0.80, paint, sx * 0.664, 0.33, -0.06);
    var teamTxt = decal(spec.podText, 0.55, 0.085, { cw: 1024, ch: 160, size: 88, weight: 900, italic: spec.podItalic, color: spec.podTextColor });
    teamTxt.rotation.y = sx * Math.PI / 2;
    teamTxt.position.set(sx * 0.6725, 0.345, -0.06);
    podGroup.add(body, ramp, inlet, lip, sidePanel, teamTxt);
    if (spec.podFlash) {
      var flash = box(0.015, 0.045, 0.78, stdMat(spec.podFlash, 0.45, 0.4), sx * 0.665, 0.262, -0.06);
      podGroup.add(flash);
    }
  }
  buildPod(-1, podL); buildPod(1, podR);

  /* ---- 引擎罩（cover，可上掀） ---- */
  var spine = mesh(new THREE.CylinderGeometry(0.165, 0.045, 2.05, 18), paint, 0, 0.615, -0.875);
  spine.geometry.rotateX(Math.PI / 2);
  spine.scale.set(0.85, 1.22, 1);
  spine.rotation.x = -0.045;
  cover.add(spine);
  /* 进气箱口（车手头顶，参考实拍为黄色点缀） */
  var airboxRing = mesh(new THREE.TorusGeometry(0.085, 0.028, 10, 24), spec.airboxMat || paint, 0, 0.895, 0.235);
  airboxRing.scale.set(1.25, 0.85, 1);
  var airDuct = mesh(new THREE.CylinderGeometry(0.085, 0.13, 0.45, 16), paint, 0, 0.825, 0.01);
  airDuct.geometry.rotateX(Math.PI / 2);
  airDuct.scale.set(1.25, 0.85, 1);
  airDuct.rotation.x = 0.32;
  cover.add(airboxRing, airDuct);
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
  var gillL = box(0.02, 0.05, 0.55, M.innerDark, -0.125, 0.70, -0.62); gillL.rotation.z = 0.5;
  var gillR = box(0.02, 0.05, 0.55, M.innerDark, 0.125, 0.70, -0.62); gillR.rotation.z = -0.5;
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
  chassis.add(rod(-0.045, 0.46, -1.62, -0.045, 0.875, -2.24, 0.016, M.carbon));
  chassis.add(rod(0.045, 0.46, -1.62, 0.045, 0.875, -2.24, 0.016, M.carbon));
  [-1, 1].forEach(function (sx) {
    var ep = box(0.014, 0.43, 0.55, spec.rwEndMat, sx * 0.505, 0.80, -2.32);
    chassis.add(ep);
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
  nameTag.position.set(0.352, 0.40, 0.62);
  var nameTag2 = nameTag.clone(); nameTag2.position.x = -0.352; nameTag2.rotation.y = -Math.PI / 2;
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

  /* ---- 部件标注 ---- */
  var lbAccent = spec.labelAccent;
  function lab(text, x, y, z) {
    var s = partLabel(text, lbAccent);
    s.position.set(x, y, z);
    labels.add(s);
  }
  lab('1.6L V6 涡轮混动引擎', 0, 1.10, -0.50);
  lab('涡轮增压器', 0.42, 0.78, -1.00);
  lab('8速序列式变速箱', 0, 0.88, -1.50);
  lab('排气系统（隔热包覆）', -0.45, 0.55, -1.35);
  lab('散热器 / 中冷器', -0.72, 0.78, 0.10);
  lab('ERS 混动电池组', 0.55, 0.28, -0.12);
  lab('MGU-K 动能回收电机', -0.62, 0.14, -0.58);

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

var SPEC_FERRARI = {
  id: 'ferrari', cnName: '法拉利 F1-75',
  paintMat: ferrariPaint, paint2Mat: ferrariDark,
  accent: 0xf2cc0d,
  haloColor: 0xa60d15,
  beltColor: 0xc41420,
  number: '16', numColor: '#ffffff', numStroke: 'rgba(20,20,20,0.55)',
  numPos: [0, 0.538, 1.78],
  noseTipMat: blackGloss,                                  // 实拍：黑色鼻尖
  wing3Mat: phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),       // 实拍：黑色前翼
  wing4Mat: phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),
  endplateMat: phyMat(0x16181d, 0.42, 0.42, 0.6, 0.22),
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
    '<div class="row"><b>整车尺寸</b><i>长 ≈ 5.6 m · 轴距 3.6 m</i></div>'
};
var SPEC_REDBULL = {
  id: 'redbull', cnName: '红牛 RB21',
  paintMat: rbPaint, paint2Mat: rbDark,
  accent: 0xffcd0a,
  haloColor: 0x0e1736,
  beltColor: 0x20356e,
  number: '1', numColor: '#ffffff', numStroke: null,
  numPos: [0, 0.514, 1.95],
  noseBand: 0xd0202e,                                      // 实拍：鼻锥红色号码带
  noseTipMat: rbYellowGloss,                               // 实拍：黄色鼻尖
  wing3Mat: rbDark, wing4Mat: rbDark, endplateMat: rbPaint,
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
  driverTag: 'M. VERSTAPPEN  ·  1',
  labelAccent: 'rgba(120,160,255,0.95)',
  dashAccent: '#5e8cff', dashTag: 'RB21',
  plaque1: 'Oracle Red Bull Racing RB21', plaqueAccent: '#5e8cff',
  specHTML:
    '<h3>红牛 RB21<span>Oracle Red Bull Racing</span></h3>' +
    '<div class="row"><b>动力单元</b><i>Honda RBPT · 1.6L V6 涡轮增压混动</i></div>' +
    '<div class="row"><b>综合功率</b><i>≈ 1,000 hp（内燃机 + ERS）</i></div>' +
    '<div class="row"><b>变速箱</b><i>8 速序列式半自动</i></div>' +
    '<div class="row"><b>车手</b><i>#1 维斯塔潘 · #30 劳森</i></div>' +
    '<div class="row"><b>整车尺寸</b><i>长 ≈ 5.6 m · 轴距 3.6 m</i></div>'
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
  spinBtn.textContent = v ? '⟳ 自动旋转：开' : '⟳ 自动旋转：关';
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
  document.getElementById('spec').innerHTML = car.spec.specHTML;
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

/* UI 事件 */
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
document.getElementById('spec').innerHTML = SPEC_FERRARI.specHTML;

window.addEventListener('resize', function () {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

/* ---------------------------------------------------------- 主循环 ---- */
var clock = new THREE.Clock();
var elapsed = 0;
var qTmp = new THREE.Quaternion();

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
    car.podL.position.x = car.podLBase.x - 0.62 * e;
    car.podR.position.x = car.podRBase.x + 0.62 * e;
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
