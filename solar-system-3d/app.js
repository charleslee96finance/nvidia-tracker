/* Solar System 3D — real-time interactive simulation (three.js r128).
   Real NASA-derived planet textures (inlined as data URIs by build.py),
   asteroid belt, comets with solar-wind tails, simulated calendar date,
   bilingual UI (中文/English).
   Distances and sizes are compressed so everything fits in one view;
   orbital speeds follow Kepler's third law (w ~ r^-1.5). */
(function () {
  'use strict';

  var TEX = (typeof TEXTURES !== 'undefined') ? TEXTURES : {};

  // ---------- i18n ----------
  var LANG = 'zh';
  var UI = {
    zh: {
      title: '太阳系 3D 实时模拟',
      hints: '拖动旋转 · 滚轮/双指缩放<br>点击行星或彗星可跟随 · 点击空白处取消<br>大小与距离未按真实比例',
      pause: '❚❚ 暂停', play: '▶ 播放', speed: '速度', reset: '重置视角',
      lang: 'EN', date: '模拟日期', years: '年后'
    },
    en: {
      title: 'Solar System 3D',
      hints: 'Drag to rotate · Scroll / pinch to zoom<br>Click a planet or comet to follow · Click empty space to release<br>Sizes &amp; distances not to scale',
      pause: '❚❚ Pause', play: '▶ Play', speed: 'Speed', reset: 'Reset view',
      lang: '中文', date: 'Sim date', years: 'yr later'
    }
  };

  var SUN_INFO = {
    zh: { name: '太阳 Sun', facts: 'G型主序星 · 直径139万 km · 表面约5,500°C',
          fun: '太阳占据了太阳系总质量的 99.86%。' },
    en: { name: 'Sun', facts: 'G-type main-sequence star · Diameter 1.39 million km · Surface ~5,500°C',
          fun: 'The Sun holds 99.86% of all the mass in the solar system.' }
  };

  var PLANETS = [
    { name: 'Mercury', zh: '水星', dist: 14, size: 0.9, tilt: 0.03, spin: 0.5, inc: 7,
      texKey: 'mercury', type: 'rocky', colors: ['#9c9890', '#b1adad', '#7d7873', '#c4c0b8'],
      factsEn: 'Diameter 4,879 km · Day: 59 Earth days · Year: 88 Earth days',
      funEn: 'Smallest planet — scorching by day, freezing by night.',
      factsZh: '直径 4,879 km · 一天 = 59 个地球日 · 一年 = 88 个地球日',
      funZh: '最小的行星——白天灼热，夜晚冰冻。' },
    { name: 'Venus', zh: '金星', dist: 19, size: 1.6, tilt: 177, spin: -0.25, inc: 3.4,
      texKey: 'venus', type: 'rocky', colors: ['#e0c075', '#e6c87d', '#cfae62', '#efd89a'],
      factsEn: 'Diameter 12,104 km · Day: 243 Earth days · Year: 225 Earth days',
      funEn: 'Hottest planet: a runaway greenhouse near 460°C, spinning backwards.',
      factsZh: '直径 12,104 km · 一天 = 243 个地球日 · 一年 = 225 个地球日',
      funZh: '最热的行星：约 460°C 的失控温室效应，而且逆向自转。' },
    { name: 'Earth', zh: '地球', dist: 25, size: 1.7, tilt: 23.4, spin: 1.2, inc: 0,
      texKey: 'earth', type: 'earth', colors: ['#2a66c8'],
      factsEn: 'Diameter 12,742 km · Day: 24 hours · Year: 365.25 days',
      funEn: 'The only world known to harbor life. Hello from here!',
      factsZh: '直径 12,742 km · 一天 = 24 小时 · 一年 = 365.25 天',
      funZh: '已知唯一存在生命的星球。我们的家园！' },
    { name: 'Mars', zh: '火星', dist: 31, size: 1.25, tilt: 25.2, spin: 1.1, inc: 1.9,
      texKey: 'mars', type: 'rocky', colors: ['#c1542f', '#d1603d', '#a84a2a', '#e07b50'],
      factsEn: 'Diameter 6,779 km · Day: 24.6 hours · Year: 687 Earth days',
      funEn: 'Home to Olympus Mons, the tallest volcano in the solar system.',
      factsZh: '直径 6,779 km · 一天 = 24.6 小时 · 一年 = 687 个地球日',
      funZh: '拥有太阳系最高的火山——奥林帕斯山。' },
    { name: 'Jupiter', zh: '木星', dist: 42, size: 4.2, tilt: 3.1, spin: 2.2, inc: 1.3,
      texKey: 'jupiter', type: 'banded', colors: ['#d8a05c', '#c9905a', '#e8c596', '#b07a4a', '#e3b67e'],
      factsEn: 'Diameter 139,820 km · Day: 9.9 hours · Year: 11.9 Earth years',
      funEn: 'Over 1,300 Earths could fit inside the largest planet.',
      factsZh: '直径 139,820 km · 一天 = 9.9 小时 · 一年 = 11.9 个地球年',
      funZh: '最大的行星，能装下 1,300 多个地球。' },
    { name: 'Saturn', zh: '土星', dist: 53, size: 3.6, tilt: 26.7, spin: 2.0, inc: 2.5,
      texKey: 'saturn', type: 'banded', colors: ['#e3cf9e', '#d9c28a', '#efe0b6', '#c9b078'],
      factsEn: 'Diameter 116,460 km · Day: 10.7 hours · Year: 29.5 Earth years',
      funEn: 'Its rings are mostly water ice — and the planet is less dense than water.',
      factsZh: '直径 116,460 km · 一天 = 10.7 小时 · 一年 = 29.5 个地球年',
      funZh: '光环主要由水冰构成；土星本身密度比水还低。' },
    { name: 'Uranus', zh: '天王星', dist: 63, size: 2.6, tilt: 97.8, spin: 1.4, inc: 0.8,
      texKey: 'uranus', type: 'banded', colors: ['#9bd4d4', '#8ccaca', '#b3e0e0', '#7fbfc4'],
      factsEn: 'Diameter 50,724 km · Day: 17.2 hours · Year: 84 Earth years',
      funEn: 'An ice giant tipped on its side — it rolls around the Sun.',
      factsZh: '直径 50,724 km · 一天 = 17.2 小时 · 一年 = 84 个地球年',
      funZh: '“躺着”公转的冰巨星，自转轴倾斜约 98°。' },
    { name: 'Neptune', zh: '海王星', dist: 71, size: 2.5, tilt: 28.3, spin: 1.5, inc: 1.8,
      texKey: 'neptune', type: 'banded', colors: ['#4969e1', '#3d59c4', '#5d7df0', '#3450b4'],
      factsEn: 'Diameter 49,244 km · Day: 16.1 hours · Year: 165 Earth years',
      funEn: 'The windiest world: gusts can top 2,000 km/h.',
      factsZh: '直径 49,244 km · 一天 = 16.1 小时 · 一年 = 165 个地球年',
      funZh: '风速最快的行星，阵风可超过 2,000 km/h。' }
  ];

  var COMETS = [
    { nameZh: '哈雷型彗星', nameEn: 'Halley-type Comet',
      a: 46, e: 0.84, incX: 0.38, rotY: 1.1, theta0: 2.4, color: 0x9fd8ff,
      factsZh: '高偏心率椭圆轨道 · 越接近太阳，彗尾越长',
      funZh: '彗尾由太阳风吹出，永远背向太阳。',
      factsEn: 'Highly eccentric orbit · The tail grows as it nears the Sun',
      funEn: 'The tail is blown by the solar wind — it always points away from the Sun.' },
    { nameZh: '长周期彗星', nameEn: 'Long-period Comet',
      a: 60, e: 0.88, incX: -0.55, rotY: 3.9, theta0: 5.2, color: 0xcfe8ff,
      factsZh: '来自太阳系边缘的访客 · 轨道周期极长',
      funZh: '这类彗星可能来自遥远的奥尔特云。',
      factsEn: 'A visitor from the edge of the solar system · Very long period',
      funEn: 'Comets like this may come from the distant Oort Cloud.' }
  ];

  // Earth completes one orbit in 60 s of real time at 1x speed.
  var KEPLER_K = (2 * Math.PI / 60) * Math.pow(25, 1.5);
  var DAYS_PER_SIM_SECOND = 365.25 / 60;
  var START_DATE = new Date(2026, 5, 10);

  // ---------- renderer / scene ----------
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04040f);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.30));
  scene.add(new THREE.PointLight(0xfff2cc, 1.5, 0, 2));

  var texLoader = new THREE.TextureLoader();
  function tex(key) { return TEX[key] ? texLoader.load(TEX[key]) : null; }

  // ---------- procedural fallback textures ----------
  function blob(ctx, x, y, r) {
    for (var i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(x + (Math.random() - 0.5) * r * 1.6, y + (Math.random() - 0.5) * r * 0.9,
              r * (0.4 + Math.random() * 0.6), 0, 7);
      ctx.fill();
    }
  }

  function makeTexture(p) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 128;
    var ctx = c.getContext('2d'), i, y;
    if (p.type === 'banded') {
      for (y = 0; y < 128; y++) {
        var wob = Math.sin(y * 0.32) * 5 + Math.sin(y * 0.11) * 8;
        var idx = Math.abs(Math.floor((y + wob) / 13)) % p.colors.length;
        ctx.fillStyle = p.colors[idx];
        ctx.fillRect(0, y, 256, 1);
      }
    } else if (p.type === 'earth') {
      ctx.fillStyle = '#2a66c8'; ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#3f8f4f';
      for (i = 0; i < 24; i++) blob(ctx, Math.random() * 256, 16 + Math.random() * 96, 7 + Math.random() * 15);
    } else {
      ctx.fillStyle = p.colors[0]; ctx.fillRect(0, 0, 256, 128);
      for (i = 0; i < 900; i++) {
        ctx.fillStyle = p.colors[1 + Math.floor(Math.random() * (p.colors.length - 1))];
        ctx.globalAlpha = 0.2 + Math.random() * 0.5;
        ctx.beginPath();
        ctx.arc(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 5, 0, 7);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    return new THREE.CanvasTexture(c);
  }

  function makeLabel(text, small) {
    var c = document.createElement('canvas');
    c.width = 512; c.height = 96;
    var ctx = c.getContext('2d');
    var fs = 38;
    ctx.font = 'bold ' + fs + 'px "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
    while (ctx.measureText(text).width > 480 && fs > 20) {
      fs -= 2;
      ctx.font = 'bold ' + fs + 'px "WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
    }
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 256, 48);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false
    }));
    var s = small ? 9 : 13;
    sprite.scale.set(s, s * 96 / 512, 1);
    return sprite;
  }

  // ---------- starfield ----------
  (function () {
    var n = 2500, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var u = Math.random() * 2 - 1;
      var t = Math.random() * Math.PI * 2;
      var s = Math.sqrt(1 - u * u);
      var r = 700 + Math.random() * 600;
      pos[i * 3] = s * Math.cos(t) * r;
      pos[i * 3 + 1] = u * r;
      pos[i * 3 + 2] = s * Math.sin(t) * r;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({
      color: 0xffffff, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.8
    })));
  })();

  // ---------- sun ----------
  var sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(6, 48, 32),
    new THREE.MeshBasicMaterial(TEX.sun ? { map: tex('sun') } : { color: 0xffe9a0 })
  );
  sunMesh.userData.info = SUN_INFO;
  scene.add(sunMesh);
  (function () {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    var ctx = c.getContext('2d');
    var grad = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,220,120,0.9)');
    grad.addColorStop(0.35, 'rgba(255,180,70,0.35)');
    grad.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false
    }));
    sprite.scale.set(42, 42, 1);
    scene.add(sprite);
  })();

  // ---------- planets ----------
  var clickable = [sunMesh];
  var planetObjs = PLANETS.map(function (p) {
    var orbitGroup = new THREE.Group();
    orbitGroup.rotation.x = THREE.MathUtils.degToRad(p.inc * 1.5);
    scene.add(orbitGroup);

    var pts = [];
    for (var i = 0; i <= 160; i++) {
      var a = (i / 160) * Math.PI * 2;
      pts.push(new THREE.Vector3(Math.cos(a) * p.dist, 0, Math.sin(a) * p.dist));
    }
    orbitGroup.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6670b8, transparent: true, opacity: 0.35 })
    ));

    var posGroup = new THREE.Group();
    orbitGroup.add(posGroup);
    var tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.tilt);
    posGroup.add(tiltGroup);

    var map = tex(p.texKey) || makeTexture(p);
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 48, 32),
      new THREE.MeshStandardMaterial({ map: map, roughness: 0.95, metalness: 0 })
    );
    mesh.userData.info = {
      zh: { name: p.zh + ' ' + p.name, facts: p.factsZh, fun: p.funZh },
      en: { name: p.name, facts: p.factsEn, fun: p.funEn }
    };
    mesh.userData.followTarget = posGroup;
    mesh.userData.viewRadius = Math.max(p.size * 7, 14);
    tiltGroup.add(mesh);
    clickable.push(mesh);

    var clouds = null, moonPivot = null;
    if (p.name === 'Earth' && TEX.earthclouds) {
      clouds = new THREE.Mesh(
        new THREE.SphereGeometry(p.size * 1.03, 48, 32),
        new THREE.MeshStandardMaterial({
          map: tex('earthclouds'), transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false, roughness: 1
        })
      );
      tiltGroup.add(clouds);
    }
    if (p.name === 'Earth') {
      moonPivot = new THREE.Group();
      posGroup.add(moonPivot);
      var moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 24, 16),
        new THREE.MeshStandardMaterial(
          TEX.moon ? { map: tex('moon'), roughness: 1 } : { color: 0xbbbbbb, roughness: 1 }
        )
      );
      moon.position.set(3.1, 0, 0);
      moonPivot.add(moon);
    }
    if (p.name === 'Saturn') {
      var inner = p.size * 1.35, outer = p.size * 2.1;
      var ringGeo = new THREE.RingGeometry(inner, outer, 96, 1);
      var rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
      for (var k = 0; k < rp.count; k++) {
        var rr = Math.hypot(rp.getX(k), rp.getY(k));
        ruv.setXY(k, (rr - inner) / (outer - inner), 0.5);
      }
      var ringMat = TEX.saturnring
        ? new THREE.MeshBasicMaterial({ map: tex('saturnring'), side: THREE.DoubleSide,
                                        transparent: true, depthWrite: false })
        : new THREE.MeshBasicMaterial({ color: 0xcbb88a, side: THREE.DoubleSide,
                                        transparent: true, opacity: 0.65 });
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      tiltGroup.add(ring);
    }

    var label = makeLabel(p.zh + ' ' + p.name);
    scene.add(label);

    return {
      p: p, posGroup: posGroup, mesh: mesh, label: label,
      clouds: clouds, moonPivot: moonPivot,
      angle0: Math.random() * Math.PI * 2,
      omega: KEPLER_K / Math.pow(p.dist, 1.5)
    };
  });

  // ---------- asteroid belt (between Mars and Jupiter) ----------
  var beltRings = [];
  (function () {
    var beltGroup = new THREE.Group();
    scene.add(beltGroup);
    for (var b = 0; b < 4; b++) {
      var rMin = 34 + b * 1.1, rMax = 35.1 + b * 1.1;
      var n = 550, pos = new Float32Array(n * 3);
      for (var i = 0; i < n; i++) {
        var r = rMin + Math.random() * (rMax - rMin);
        var a = Math.random() * Math.PI * 2;
        pos[i * 3] = Math.cos(a) * r;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 1.1;
        pos[i * 3 + 2] = Math.sin(a) * r;
      }
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var ring = new THREE.Points(g, new THREE.PointsMaterial({
        color: b % 2 ? 0x9a8a78 : 0x8a7a66, size: 0.32, sizeAttenuation: true,
        transparent: true, opacity: 0.9
      }));
      ring.rotation.x = THREE.MathUtils.degToRad((Math.random() - 0.5) * 3);
      beltGroup.add(ring);
      beltRings.push({ obj: ring, omega: KEPLER_K / Math.pow((rMin + rMax) / 2, 1.5) });
    }
    var beltLabel = makeLabel('小行星带 Asteroid Belt', true);
    beltLabel.position.set(0, 2.6, -36.6);
    scene.add(beltLabel);
  })();

  // ---------- comets ----------
  var cometObjs = COMETS.map(function (cd) {
    var group = new THREE.Group();
    group.rotation.set(cd.incX, cd.rotY, 0);
    scene.add(group);

    var p = cd.a * (1 - cd.e * cd.e);
    var pts = [];
    for (var i = 0; i <= 240; i++) {
      var th = (i / 240) * Math.PI * 2;
      var r = p / (1 + cd.e * Math.cos(th));
      pts.push(new THREE.Vector3(Math.cos(th) * r, 0, Math.sin(th) * r));
    }
    group.add(new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: cd.color, transparent: true, opacity: 0.18 })
    ));

    var nucleus = new THREE.Mesh(
      new THREE.SphereGeometry(0.38, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0xd8ecff, roughness: 0.6,
                                       emissive: cd.color, emissiveIntensity: 0.5 })
    );
    nucleus.userData.info = {
      zh: { name: cd.nameZh, facts: cd.factsZh, fun: cd.funZh },
      en: { name: cd.nameEn, facts: cd.factsEn, fun: cd.funEn }
    };
    nucleus.userData.followTarget = nucleus;
    nucleus.userData.viewRadius = 13;
    group.add(nucleus);
    clickable.push(nucleus);

    var glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: (function () {
        var c = document.createElement('canvas');
        c.width = 64; c.height = 64;
        var ctx = c.getContext('2d');
        var gr = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
        gr.addColorStop(0, 'rgba(220,240,255,0.95)');
        gr.addColorStop(1, 'rgba(150,200,255,0)');
        ctx.fillStyle = gr;
        ctx.fillRect(0, 0, 64, 64);
        return new THREE.CanvasTexture(c);
      })(),
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    glow.scale.set(3.2, 3.2, 1);
    scene.add(glow);

    var nTail = 80;
    var tailPos = new Float32Array(nTail * 3);
    var tailGeo = new THREE.BufferGeometry();
    tailGeo.setAttribute('position', new THREE.BufferAttribute(tailPos, 3));
    var tail = new THREE.Points(tailGeo, new THREE.PointsMaterial({
      color: cd.color, size: 0.85, sizeAttenuation: true, transparent: true,
      opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false
    }));
    scene.add(tail);
    var jitter = [];
    for (var j = 0; j < nTail; j++) {
      jitter.push(new THREE.Vector3((Math.random() - 0.5), (Math.random() - 0.5),
                                    (Math.random() - 0.5)).multiplyScalar(0.5));
    }

    var label = makeLabel(cd.nameZh + ' ' + cd.nameEn.split(' ')[0] + ' Comet', true);
    scene.add(label);

    return { cd: cd, group: group, nucleus: nucleus, glow: glow, label: label,
             tail: tail, tailPos: tailPos, jitter: jitter, nTail: nTail,
             theta: cd.theta0, semiLatus: p };
  });

  // ---------- camera controls ----------
  var theta = 1.25, phi = 1.05, radius = 130;
  var camTarget = new THREE.Vector3();
  var followObj = null;
  var tmpV = new THREE.Vector3();
  var zeroV = new THREE.Vector3(0, 0, 0);

  function updateCamera() {
    if (followObj) {
      followObj.getWorldPosition(tmpV);
      camTarget.lerp(tmpV, 0.12);
    } else {
      camTarget.lerp(zeroV, 0.08);
    }
    camera.position.set(
      camTarget.x + radius * Math.sin(phi) * Math.cos(theta),
      camTarget.y + radius * Math.cos(phi),
      camTarget.z + radius * Math.sin(phi) * Math.sin(theta)
    );
    camera.lookAt(camTarget);
  }

  var dragging = false, moved = 0, lastX = 0, lastY = 0;
  var canvas = renderer.domElement;

  canvas.addEventListener('mousedown', function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    theta += dx * 0.005;
    phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi - dy * 0.005));
  });
  window.addEventListener('mouseup', function (e) {
    if (dragging && moved < 6) handleClick(e.clientX, e.clientY);
    dragging = false;
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    radius = Math.min(700, Math.max(10, radius * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  var touchDist = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      dragging = true; moved = 0;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      dragging = false;
      touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 1 && dragging) {
      var dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      theta += dx * 0.006;
      phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi - dy * 0.006));
    } else if (e.touches.length === 2) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
      if (touchDist > 0) radius = Math.min(700, Math.max(10, radius * touchDist / d));
      touchDist = d;
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (dragging && moved < 8 && e.changedTouches.length === 1) {
      handleClick(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
    }
    dragging = false; touchDist = 0;
  });

  // ---------- picking & info card ----------
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2();

  function pick(x, y) {
    pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    var hits = raycaster.intersectObjects(clickable);
    return hits.length ? hits[0].object : null;
  }

  var infoEl = document.getElementById('info');
  var infoName = document.getElementById('infoName');
  var infoFacts = document.getElementById('infoFacts');
  var infoFun = document.getElementById('infoFun');
  var currentInfo = null;

  function showCard(info) {
    currentInfo = info;
    var d = info[LANG];
    infoName.textContent = d.name;
    infoFacts.textContent = d.facts;
    infoFun.textContent = d.fun;
    infoEl.classList.remove('hidden');
  }

  function handleClick(x, y) {
    var hit = pick(x, y);
    if (!hit) {
      followObj = null;
      currentInfo = null;
      infoEl.classList.add('hidden');
      return;
    }
    showCard(hit.userData.info);
    if (hit === sunMesh) {
      followObj = null;
      radius = Math.max(radius, 40);
    } else {
      followObj = hit.userData.followTarget;
      radius = hit.userData.viewRadius;
    }
  }

  window.addEventListener('mousemove', function (e) {
    if (!dragging) canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
  });

  // ---------- UI ----------
  var paused = false, speed = 1;
  var pauseBtn = document.getElementById('pauseBtn');
  var speedSlider = document.getElementById('speed');
  var speedVal = document.getElementById('speedVal');
  var dateValue = document.getElementById('dateValue');
  var dateElapsed = document.getElementById('dateElapsed');

  function setLang(l) {
    LANG = l;
    var u = UI[l];
    document.getElementById('hudTitle').textContent = u.title;
    document.getElementById('hudHints').innerHTML = u.hints;
    document.getElementById('speedLabel').textContent = u.speed;
    document.getElementById('resetBtn').textContent = u.reset;
    document.getElementById('langBtn').textContent = u.lang;
    document.getElementById('dateLabel').textContent = u.date;
    pauseBtn.textContent = paused ? u.play : u.pause;
    if (currentInfo) showCard(currentInfo);
  }

  pauseBtn.addEventListener('click', function () {
    paused = !paused;
    pauseBtn.textContent = paused ? UI[LANG].play : UI[LANG].pause;
  });
  speedSlider.addEventListener('input', function () {
    speed = parseFloat(speedSlider.value);
    speedVal.textContent = speed.toFixed(1) + '×';
  });
  document.getElementById('resetBtn').addEventListener('click', function () {
    followObj = null;
    currentInfo = null;
    infoEl.classList.add('hidden');
    theta = 1.25; phi = 1.05; radius = 130;
  });
  document.getElementById('langBtn').addEventListener('click', function () {
    setLang(LANG === 'zh' ? 'en' : 'zh');
  });
  setLang('zh');

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // ---------- main loop ----------
  var clock = new THREE.Clock();
  var simTime = 0;
  var tailDir = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.1);
    if (!paused) simTime += dt * speed;

    for (var i = 0; i < planetObjs.length; i++) {
      var o = planetObjs[i];
      var a = o.angle0 + o.omega * simTime;
      o.posGroup.position.set(Math.cos(a) * o.p.dist, 0, Math.sin(a) * o.p.dist);
      if (!paused) {
        o.mesh.rotation.y += o.p.spin * dt * speed;
        if (o.clouds) o.clouds.rotation.y += o.p.spin * 1.25 * dt * speed;
        if (o.moonPivot) o.moonPivot.rotation.y += 1.3 * dt * speed;
      }
      o.posGroup.getWorldPosition(tmpV);
      o.label.position.set(tmpV.x, tmpV.y + o.p.size + 1.7, tmpV.z);
    }

    for (i = 0; i < beltRings.length; i++) {
      beltRings[i].obj.rotation.y = -beltRings[i].omega * simTime;
    }

    for (i = 0; i < cometObjs.length; i++) {
      var co = cometObjs[i];
      var r = co.semiLatus / (1 + co.cd.e * Math.cos(co.theta));
      if (!paused) {
        co.theta += (KEPLER_K * Math.sqrt(co.semiLatus) / (r * r)) * dt * speed;
      }
      co.nucleus.position.set(Math.cos(co.theta) * r, 0, Math.sin(co.theta) * r);
      co.nucleus.getWorldPosition(tmpV);
      co.glow.position.copy(tmpV);
      co.label.position.set(tmpV.x, tmpV.y + 2.0, tmpV.z);

      tailDir.copy(tmpV).normalize();
      var tailLen = Math.min(16, Math.max(1.5, 150 / r));
      for (var j = 0; j < co.nTail; j++) {
        var f = j / co.nTail;
        var d2 = Math.pow(f, 1.35) * tailLen;
        co.tailPos[j * 3] = tmpV.x + tailDir.x * d2 + co.jitter[j].x * f * tailLen * 0.18;
        co.tailPos[j * 3 + 1] = tmpV.y + tailDir.y * d2 + co.jitter[j].y * f * tailLen * 0.18;
        co.tailPos[j * 3 + 2] = tmpV.z + tailDir.z * d2 + co.jitter[j].z * f * tailLen * 0.18;
      }
      co.tail.geometry.attributes.position.needsUpdate = true;
    }

    var simDate = new Date(START_DATE.getTime() + simTime * DAYS_PER_SIM_SECOND * 86400000);
    dateValue.textContent = simDate.getFullYear() + '-' + pad2(simDate.getMonth() + 1) +
                            '-' + pad2(simDate.getDate());
    var yrs = simTime * DAYS_PER_SIM_SECOND / 365.25;
    dateElapsed.textContent = '(+' + yrs.toFixed(1) + ' ' + UI[LANG].years + ')';

    updateCamera();
    renderer.render(scene, camera);
  }
  animate();
})();
