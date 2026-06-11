/* Solar System 3D — real-time interactive simulation (three.js r128).
   NASA-derived textures, asteroid belt, comets, simulated date, bilingual UI,
   flowing starfield (drifting star layers, Milky Way band, nebulae, meteors),
   and an Earth-surface sunrise/sunset mode with a dynamic atmosphere sky.
   Distances and sizes are compressed; orbital speeds follow Kepler's law. */
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
      lang: 'EN', date: '模拟日期', years: '年后',
      surface: '🌅 站上地表看日出日落',
      exitSurface: '🚀 离开地球表面',
      surfaceHint: '拖动环顾四周 · 太阳从东方升起'
    },
    en: {
      title: 'Solar System 3D',
      hints: 'Drag to rotate · Scroll / pinch to zoom<br>Click a planet or comet to follow · Click empty space to release<br>Sizes &amp; distances not to scale',
      pause: '❚❚ Pause', play: '▶ Play', speed: 'Speed', reset: 'Reset view',
      lang: '中文', date: 'Sim date', years: 'yr later',
      surface: '🌅 Watch sunrise & sunset from the surface',
      exitSurface: '🚀 Leave Earth\'s surface',
      surfaceHint: 'Drag to look around · The Sun rises in the east'
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

  var hideOnSurface = []; // orbit lines & labels hidden in surface mode

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
    var fam = '"WenQuanYi Zen Hei", "PingFang SC", "Microsoft YaHei", Arial, sans-serif';
    ctx.font = 'bold ' + fs + 'px ' + fam;
    while (ctx.measureText(text).width > 480 && fs > 20) {
      fs -= 2;
      ctx.font = 'bold ' + fs + 'px ' + fam;
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
    hideOnSurface.push(sprite);
    return sprite;
  }

  function glowTexture(inner, outer) {
    var c = document.createElement('canvas');
    c.width = 128; c.height = 128;
    var ctx = c.getContext('2d');
    var gr = ctx.createRadialGradient(64, 64, 4, 64, 64, 64);
    gr.addColorStop(0, inner);
    gr.addColorStop(1, outer);
    ctx.fillStyle = gr;
    ctx.fillRect(0, 0, 128, 128);
    return new THREE.CanvasTexture(c);
  }

  // ---------- flowing starfield: 3 drifting/twinkling layers ----------
  var starLayers = [];
  (function () {
    var specs = [
      { n: 1100, size: 1.3, baseOp: 0.75, rate: 0.010, freq: 1.6 },
      { n: 900, size: 1.8, baseOp: 0.6, rate: -0.016, freq: 2.3 },
      { n: 700, size: 2.4, baseOp: 0.45, rate: 0.024, freq: 3.1 }
    ];
    specs.forEach(function (sp, li) {
      var pos = new Float32Array(sp.n * 3);
      for (var i = 0; i < sp.n; i++) {
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
      var mat = new THREE.PointsMaterial({
        color: 0xffffff, size: sp.size, sizeAttenuation: false,
        transparent: true, opacity: sp.baseOp
      });
      var pts = new THREE.Points(g, mat);
      pts.rotation.z = li * 0.4;
      scene.add(pts);
      starLayers.push({ obj: pts, mat: mat, baseOp: sp.baseOp, rate: sp.rate,
                        freq: sp.freq, phase: li * 2.1 });
    });
  })();

  // ---------- Milky Way band (slowly rotating) ----------
  var milkyWay = new THREE.Group();
  var milkyMat;
  (function () {
    var n = 4200, pos = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var r = 750 + Math.random() * 500;
      var spread = Math.pow(Math.random(), 2) * 130 * (Math.random() < 0.5 ? -1 : 1);
      pos[i * 3] = Math.cos(a) * r;
      pos[i * 3 + 1] = spread;
      pos[i * 3 + 2] = Math.sin(a) * r;
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    milkyMat = new THREE.PointsMaterial({
      color: 0xcdd8ff, size: 1.4, sizeAttenuation: false,
      transparent: true, opacity: 0.32
    });
    milkyWay.add(new THREE.Points(g, milkyMat));
    milkyWay.rotation.set(1.05, 0, 0.35);
    scene.add(milkyWay);
  })();

  // ---------- nebulae (drifting, pulsing) ----------
  var nebulae = [];
  (function () {
    var defs = [
      { inner: 'rgba(160,110,255,0.30)', outer: 'rgba(120,60,220,0)', pos: [-650, 240, -780], s: 420 },
      { inner: 'rgba(80,200,230,0.25)', outer: 'rgba(40,140,200,0)', pos: [820, -160, -520], s: 360 },
      { inner: 'rgba(255,120,170,0.22)', outer: 'rgba(220,70,130,0)', pos: [240, 420, 880], s: 480 }
    ];
    defs.forEach(function (d, i) {
      var sp = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture(d.inner, d.outer), transparent: true,
        blending: THREE.AdditiveBlending, depthWrite: false
      }));
      sp.position.set(d.pos[0], d.pos[1], d.pos[2]);
      sp.scale.set(d.s, d.s, 1);
      scene.add(sp);
      nebulae.push({ obj: sp, s: d.s, phase: i * 2.2, drift: 0.5 + i * 0.3 });
    });
  })();

  // ---------- meteors (shooting stars) ----------
  var meteors = [];
  var meteorTimer = 1.5;
  (function () {
    for (var i = 0; i < 3; i++) {
      var g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
      var mat = new THREE.LineBasicMaterial({
        color: 0xddeeff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending
      });
      var line = new THREE.Line(g, mat);
      scene.add(line);
      var head = new THREE.Sprite(new THREE.SpriteMaterial({
        map: glowTexture('rgba(255,255,255,0.95)', 'rgba(180,220,255,0)'),
        transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0
      }));
      head.scale.set(7, 7, 1);
      scene.add(head);
      meteors.push({ line: line, head: head, active: false,
                     pos: new THREE.Vector3(), vel: new THREE.Vector3(), life: 0, maxLife: 1 });
    }
  })();

  function spawnMeteor() {
    for (var i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      if (m.active) continue;
      var u = Math.random() * 1.6 - 0.6;
      var t = Math.random() * Math.PI * 2;
      var s = Math.sqrt(Math.max(0, 1 - u * u));
      var r = 380 + Math.random() * 280;
      m.pos.set(s * Math.cos(t) * r, u * r, s * Math.sin(t) * r);
      m.vel.set(Math.random() - 0.5, -(0.3 + Math.random() * 0.5), Math.random() - 0.5)
           .normalize().multiplyScalar(280 + Math.random() * 220);
      m.maxLife = 0.9 + Math.random() * 0.8;
      m.life = m.maxLife;
      m.active = true;
      return;
    }
  }

  function updateMeteors(dt, df) {
    meteorTimer -= dt;
    if (meteorTimer <= 0) {
      spawnMeteor();
      meteorTimer = 2 + Math.random() * 5;
    }
    for (var i = 0; i < meteors.length; i++) {
      var m = meteors[i];
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) {
        m.active = false;
        m.line.material.opacity = 0;
        m.head.material.opacity = 0;
        continue;
      }
      m.pos.addScaledVector(m.vel, dt);
      var fade = Math.sin(Math.PI * (1 - m.life / m.maxLife));
      var arr = m.line.geometry.attributes.position.array;
      arr[0] = m.pos.x; arr[1] = m.pos.y; arr[2] = m.pos.z;
      var tailScale = 0.13;
      arr[3] = m.pos.x - m.vel.x * tailScale;
      arr[4] = m.pos.y - m.vel.y * tailScale;
      arr[5] = m.pos.z - m.vel.z * tailScale;
      m.line.geometry.attributes.position.needsUpdate = true;
      m.line.material.opacity = 0.85 * fade * df;
      m.head.position.copy(m.pos);
      m.head.material.opacity = 0.9 * fade * df;
    }
  }

  // ---------- sun ----------
  var sunMesh = new THREE.Mesh(
    new THREE.SphereGeometry(6, 48, 32),
    new THREE.MeshBasicMaterial(TEX.sun ? { map: tex('sun') } : { color: 0xffe9a0 })
  );
  sunMesh.userData.info = SUN_INFO;
  scene.add(sunMesh);
  var sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture('rgba(255,220,120,0.9)', 'rgba(255,150,40,0)'),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false
  }));
  sunGlow.scale.set(42, 42, 1);
  scene.add(sunGlow);

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
    var orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: 0x6670b8, transparent: true, opacity: 0.35 })
    );
    orbitGroup.add(orbitLine);
    hideOnSurface.push(orbitLine);

    var posGroup = new THREE.Group();
    orbitGroup.add(posGroup);
    var tiltGroup = new THREE.Group();
    tiltGroup.rotation.z = THREE.MathUtils.degToRad(p.tilt);
    posGroup.add(tiltGroup);

    var map = tex(p.texKey) || makeTexture(p);
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 48, 32),
      new THREE.MeshStandardMaterial({ map: map, roughness: 0.95, metalness: 0,
                                       transparent: true })
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
    var ringMat = null, baseRingOp = 1;
    if (p.name === 'Saturn') {
      var inner = p.size * 1.35, outer = p.size * 2.1;
      var ringGeo = new THREE.RingGeometry(inner, outer, 96, 1);
      var rp = ringGeo.attributes.position, ruv = ringGeo.attributes.uv;
      for (var k = 0; k < rp.count; k++) {
        var rr = Math.hypot(rp.getX(k), rp.getY(k));
        ruv.setXY(k, (rr - inner) / (outer - inner), 0.5);
      }
      ringMat = TEX.saturnring
        ? new THREE.MeshBasicMaterial({ map: tex('saturnring'), side: THREE.DoubleSide,
                                        transparent: true, depthWrite: false })
        : new THREE.MeshBasicMaterial({ color: 0xcbb88a, side: THREE.DoubleSide,
                                        transparent: true, opacity: 0.65 });
      baseRingOp = ringMat.opacity;
      var ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = Math.PI / 2;
      tiltGroup.add(ring);
    }

    var label = makeLabel(p.zh + ' ' + p.name);
    scene.add(label);

    return {
      p: p, posGroup: posGroup, tiltGroup: tiltGroup, mesh: mesh, label: label,
      clouds: clouds, moonPivot: moonPivot,
      moonMesh: moonPivot ? moonPivot.children[0] : null,
      ringMat: ringMat, baseRingOp: baseRingOp,
      angle0: Math.random() * Math.PI * 2,
      omega: KEPLER_K / Math.pow(p.dist, 1.5)
    };
  });
  var earthObj = planetObjs[2];

  // ---------- asteroid belt ----------
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
        transparent: true, opacity: 0.9, depthWrite: false,
        map: glowTexture('rgba(255,240,220,1)', 'rgba(255,240,220,0)')
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
    var orbitLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: cd.color, transparent: true, opacity: 0.18 })
    );
    group.add(orbitLine);
    hideOnSurface.push(orbitLine);

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
      map: glowTexture('rgba(220,240,255,0.95)', 'rgba(150,200,255,0)'),
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

  // ---------- Earth-surface sunrise/sunset mode ----------
  var surfaceMode = false;
  var lookYaw = 0, lookPitch = 0.12;
  var prevSpeed = 1;
  var surfaceAnchor = new THREE.Object3D();
  surfaceAnchor.position.set(earthObj.p.size * 1.005, 0, 0);
  earthObj.mesh.add(surfaceAnchor);

  var aPos = new THREE.Vector3(), ePos = new THREE.Vector3();
  var upV = new THREE.Vector3(), eastV = new THREE.Vector3();
  var axisV = new THREE.Vector3(), lookV = new THREE.Vector3();
  var sunFlat = new THREE.Vector3(), crossT = new THREE.Vector3();
  var qTmp = new THREE.Quaternion();

  var skyEl = document.getElementById('sky');
  var surfacePanel = document.getElementById('surfacePanel');
  var surfaceBtn = document.getElementById('surfaceBtn');

  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  var dayFade = 0; // 0 = night sky fully visible, 1 = daylight washes it out

  function updateSky(sunElev) {
    var day = Math.min(1, Math.max(0, (sunElev - 0.04) / 0.30));
    dayFade = day;
    var glow = Math.exp(-Math.pow((sunElev - 0.02) / 0.11, 2));
    var zen = mix([4, 6, 18], [18, 32, 80], glow * 0.6);
    zen = mix(zen, [62, 130, 215], day);
    var hor = mix([8, 10, 26], [255, 122, 40], glow);
    hor = mix(hor, [168, 216, 252], day * 0.88);
    var op = Math.max(day * 0.72, glow * 0.62);
    skyEl.style.opacity = op.toFixed(3);
    skyEl.style.background = 'linear-gradient(to top, ' + rgb(hor) + ' 0%, ' + rgb(zen) + ' 65%)';
  }

  function updateSurfaceCamera() {
    surfaceAnchor.getWorldPosition(aPos);
    earthObj.posGroup.getWorldPosition(ePos);
    upV.copy(aPos).sub(ePos).normalize();
    earthObj.mesh.getWorldQuaternion(qTmp);
    axisV.set(0, 1, 0).applyQuaternion(qTmp).normalize();
    eastV.crossVectors(axisV, upV).normalize();

    lookV.copy(eastV).applyAxisAngle(upV, lookYaw);
    lookV.multiplyScalar(Math.cos(lookPitch)).addScaledVector(upV, Math.sin(lookPitch)).normalize();

    camera.position.copy(aPos).addScaledVector(upV, 0.12);
    camera.up.copy(upV);
    tmpV.copy(camera.position).addScaledVector(lookV, 10);
    camera.lookAt(tmpV);

    // sun elevation above the local horizon (sun is at the origin)
    var sunElev = upV.dot(tmpV.copy(aPos).negate().normalize());
    updateSky(sunElev);
  }

  function enterSurfaceMode() {
    surfaceMode = true;
    followObj = null;
    infoEl.classList.add('hidden');
    currentInfo = null;
    surfacePanel.classList.remove('hidden');
    hideOnSurface.forEach(function (o) { o.visible = false; });
    // tame the compressed scale: shrink sun/moon/planets to believable sky sizes
    sunMesh.scale.setScalar(0.3);
    sunGlow.scale.set(11, 11, 1);
    if (earthObj.clouds) earthObj.clouds.visible = false;
    if (earthObj.moonMesh) earthObj.moonMesh.scale.setScalar(0.38);
    planetObjs.forEach(function (o) {
      if (o !== earthObj) o.tiltGroup.scale.setScalar(0.45);
    });
    prevSpeed = speed;
    setSpeed(0.25);
    // start facing the sun's azimuth so the sunrise is in view
    surfaceAnchor.getWorldPosition(aPos);
    earthObj.posGroup.getWorldPosition(ePos);
    upV.copy(aPos).sub(ePos).normalize();
    earthObj.mesh.getWorldQuaternion(qTmp);
    axisV.set(0, 1, 0).applyQuaternion(qTmp).normalize();
    eastV.crossVectors(axisV, upV).normalize();
    sunFlat.copy(aPos).negate();
    sunFlat.addScaledVector(upV, -sunFlat.dot(upV)).normalize();
    crossT.crossVectors(eastV, sunFlat);
    lookYaw = Math.atan2(crossT.dot(upV), eastV.dot(sunFlat));
    lookPitch = 0.12;
  }

  function exitSurfaceMode() {
    surfaceMode = false;
    surfacePanel.classList.add('hidden');
    hideOnSurface.forEach(function (o) { o.visible = true; });
    sunMesh.scale.setScalar(1);
    sunGlow.scale.set(42, 42, 1);
    if (earthObj.clouds) earthObj.clouds.visible = true;
    if (earthObj.moonMesh) earthObj.moonMesh.scale.setScalar(1);
    planetObjs.forEach(function (o) { o.tiltGroup.scale.setScalar(1); });
    dayFade = 0;
    skyEl.style.opacity = '0';
    camera.up.set(0, 1, 0);
    setSpeed(prevSpeed);
    followObj = earthObj.posGroup;
    radius = earthObj.mesh.userData.viewRadius;
    camTarget.copy(aPos);
  }

  // ---------- input ----------
  var dragging = false, moved = 0, lastX = 0, lastY = 0;
  var canvas = renderer.domElement;

  function applyDrag(dx, dy, k) {
    if (surfaceMode) {
      lookYaw += dx * 0.0035;
      lookPitch = Math.min(1.35, Math.max(-0.45, lookPitch - dy * 0.0035));
    } else {
      theta += dx * k;
      phi = Math.min(Math.PI - 0.05, Math.max(0.05, phi - dy * k));
    }
  }

  canvas.addEventListener('mousedown', function (e) {
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mousemove', function (e) {
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    applyDrag(dx, dy, 0.005);
  });
  window.addEventListener('mouseup', function (e) {
    if (dragging && moved < 6) handleClick(e.clientX, e.clientY);
    dragging = false;
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (surfaceMode) return;
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
      applyDrag(dx, dy, 0.006);
    } else if (e.touches.length === 2 && !surfaceMode) {
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
    surfaceBtn.style.display = (info === earthObj.mesh.userData.info) ? 'inline-block' : 'none';
    infoEl.classList.remove('hidden');
  }

  function handleClick(x, y) {
    if (surfaceMode) return;
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
    if (!dragging && !surfaceMode) {
      canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
    }
  });

  // ---------- UI ----------
  var paused = false, speed = 1;
  var pauseBtn = document.getElementById('pauseBtn');
  var speedSlider = document.getElementById('speed');
  var speedVal = document.getElementById('speedVal');
  var dateValue = document.getElementById('dateValue');
  var dateElapsed = document.getElementById('dateElapsed');

  function setSpeed(v) {
    speed = v;
    speedSlider.value = v;
    speedVal.textContent = v.toFixed(1) + '×';
  }

  function setLang(l) {
    LANG = l;
    var u = UI[l];
    document.getElementById('hudTitle').textContent = u.title;
    document.getElementById('hudHints').innerHTML = u.hints;
    document.getElementById('speedLabel').textContent = u.speed;
    document.getElementById('resetBtn').textContent = u.reset;
    document.getElementById('langBtn').textContent = u.lang;
    document.getElementById('dateLabel').textContent = u.date;
    document.getElementById('surfaceHint').textContent = u.surfaceHint;
    document.getElementById('exitSurfaceBtn').textContent = u.exitSurface;
    surfaceBtn.textContent = u.surface;
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
    if (surfaceMode) exitSurfaceMode();
    followObj = null;
    currentInfo = null;
    infoEl.classList.add('hidden');
    theta = 1.25; phi = 1.05; radius = 130;
  });
  document.getElementById('langBtn').addEventListener('click', function () {
    setLang(LANG === 'zh' ? 'en' : 'zh');
  });
  surfaceBtn.addEventListener('click', enterSurfaceMode);
  document.getElementById('exitSurfaceBtn').addEventListener('click', exitSurfaceMode);
  setLang('zh');

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // test hooks (used by automated verification; harmless in production)
  window.__sim = { enterSurfaceMode: enterSurfaceMode, exitSurfaceMode: exitSurfaceMode,
                   setSpeed: setSpeed };

  // ---------- main loop ----------
  var clock = new THREE.Clock();
  var simTime = 0, elapsed = 0;
  var tailDir = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
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

    // flowing sky: star drift + twinkle, Milky Way rotation, nebula pulse, meteors.
    // df fades the night sky out under daylight in surface mode.
    var df = surfaceMode ? Math.max(0, 1 - dayFade * 0.94) : 1;
    for (i = 0; i < starLayers.length; i++) {
      var sl = starLayers[i];
      sl.obj.rotation.y += sl.rate * dt;
      sl.mat.opacity = (sl.baseOp + 0.18 * Math.sin(elapsed * sl.freq + sl.phase)) * df;
    }
    milkyWay.rotation.y += 0.0045 * dt;
    milkyMat.opacity = 0.32 * df;
    for (i = 0; i < nebulae.length; i++) {
      var nb = nebulae[i];
      var pulse = 1 + 0.10 * Math.sin(elapsed * 0.35 + nb.phase);
      nb.obj.scale.set(nb.s * pulse, nb.s * pulse, 1);
      nb.obj.material.opacity = (0.75 + 0.25 * Math.sin(elapsed * 0.22 + nb.phase * 1.7)) * df;
      nb.obj.position.y += Math.sin(elapsed * 0.1 + nb.phase) * nb.drift * dt;
    }
    updateMeteors(dt, df);

    // daylight also washes out belt, comets, and distant planets
    var pf = surfaceMode ? 0.25 + 0.75 * df : 1;
    for (i = 0; i < beltRings.length; i++) {
      beltRings[i].obj.material.opacity = 0.9 * df;
    }
    for (i = 0; i < cometObjs.length; i++) {
      cometObjs[i].tail.material.opacity = 0.55 * df;
      cometObjs[i].glow.material.opacity = df;
    }
    for (i = 0; i < planetObjs.length; i++) {
      var po = planetObjs[i];
      po.mesh.material.opacity = (po === earthObj) ? 1 : pf;
      if (po.ringMat) po.ringMat.opacity = po.baseRingOp * pf;
    }

    var simDate = new Date(START_DATE.getTime() + simTime * DAYS_PER_SIM_SECOND * 86400000);
    dateValue.textContent = simDate.getFullYear() + '-' + pad2(simDate.getMonth() + 1) +
                            '-' + pad2(simDate.getDate());
    var yrs = simTime * DAYS_PER_SIM_SECOND / 365.25;
    dateElapsed.textContent = '(+' + yrs.toFixed(1) + ' ' + UI[LANG].years + ')';

    if (surfaceMode) {
      updateSurfaceCamera();
    } else {
      updateCamera();
    }
    renderer.render(scene, camera);
  }
  animate();
})();
