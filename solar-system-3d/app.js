/* Solar System 3D — real-time interactive simulation (three.js r128).
   NASA-derived textures, asteroid belt, comets, simulated date, bilingual UI,
   flowing starfield (drifting layers, Milky Way, nebulae, meteors),
   surface views (Earth / Mars / Moon) with per-body skies, an auto tour mode,
   and a quick-jump navigation rail.
   Distances and sizes are compressed; orbital speeds follow Kepler's law. */
(function () {
  'use strict';

  var TEX = (typeof TEXTURES !== 'undefined') ? TEXTURES : {};

  // ---------- i18n ----------
  var LANG = 'zh';
  var UI = {
    zh: {
      title: '太阳系 3D 实时模拟',
      hints: '拖动旋转 · 滚轮/双指缩放<br>点击行星或彗星可跟随 · 点击空白处取消<br>左侧圆点可快速跳转 · 大小与距离未按真实比例',
      pause: '❚❚ 暂停', play: '▶ 播放', speed: '速度', reset: '重置视角',
      lang: 'EN', date: '模拟日期', years: '年后',
      tour: '🎬 自动导览', tourStop: '⏹ 停止导览',
      exitSurface: '🚀 返回太空',
      constellation: '⭐ 星座', sandbox: '🎮 引力沙盒', sound: '🔊 音效',
      sandboxHint: '拖动并松手发射新天体 · 试试让它绕太阳转！',
      clear: '🧹 清空',
      realpos: '🌐 真实位置', today: '📍 此刻', gyro: '🧭 陀螺仪',
      realOn: '行星位于真实天文位置', realOff: '行星位置为示意（非真实）',
      gyroNeed: '需要在手机上授权动作权限'
    },
    en: {
      title: 'Solar System 3D',
      hints: 'Drag to rotate · Scroll / pinch to zoom<br>Click a planet or comet to follow · Click empty space to release<br>Use the dots on the left to jump · Sizes &amp; distances not to scale',
      pause: '❚❚ Pause', play: '▶ Play', speed: 'Speed', reset: 'Reset view',
      lang: '中文', date: 'Sim date', years: 'yr later',
      tour: '🎬 Auto tour', tourStop: '⏹ Stop tour',
      exitSurface: '🚀 Back to space',
      constellation: '⭐ Constellations', sandbox: '🎮 Gravity sandbox', sound: '🔊 Sound',
      sandboxHint: 'Drag & release to launch a body · try to make it orbit!',
      clear: '🧹 Clear',
      realpos: '🌐 Real positions', today: '📍 Now', gyro: '🧭 Gyroscope',
      realOn: 'Planets shown at their true positions', realOff: 'Planet positions are illustrative',
      gyroNeed: 'Needs motion permission on your phone'
    }
  };

  var SUN_INFO = {
    zh: { name: '太阳 Sun', facts: 'G型主序星 · 直径139万 km · 表面约5,500°C',
          fun: '太阳占据了太阳系总质量的 99.86%。' },
    en: { name: 'Sun', facts: 'G-type main-sequence star · Diameter 1.39 million km · Surface ~5,500°C',
          fun: 'The Sun holds 99.86% of all the mass in the solar system.' }
  };

  var MOON_INFO = {
    zh: { name: '月球 Moon', facts: '直径 3,474 km · 距地球约38万 km · 被潮汐锁定',
          fun: '月球永远以同一面朝向地球。' },
    en: { name: 'The Moon', facts: 'Diameter 3,474 km · ~384,000 km from Earth · Tidally locked',
          fun: 'The Moon always shows the same face to Earth.' }
  };

  var PLANETS = [
    { name: 'Mercury', zh: '水星', short: '水', shortEn: 'Me', dist: 14, size: 0.9, tilt: 0.03, spin: 0.5, inc: 7,
      texKey: 'mercury', type: 'rocky', colors: ['#9c9890', '#b1adad', '#7d7873', '#c4c0b8'],
      factsEn: 'Diameter 4,879 km · Day: 59 Earth days · Year: 88 Earth days',
      funEn: 'Smallest planet — scorching by day, freezing by night.',
      factsZh: '直径 4,879 km · 一天 = 59 个地球日 · 一年 = 88 个地球日',
      funZh: '最小的行星——白天灼热，夜晚冰冻。' },
    { name: 'Venus', zh: '金星', short: '金', shortEn: 'Ve', dist: 19, size: 1.6, tilt: 177, spin: -0.25, inc: 3.4,
      texKey: 'venus', type: 'rocky', colors: ['#e0c075', '#e6c87d', '#cfae62', '#efd89a'],
      factsEn: 'Diameter 12,104 km · Day: 243 Earth days · Year: 225 Earth days',
      funEn: 'Hottest planet: a runaway greenhouse near 460°C, spinning backwards.',
      factsZh: '直径 12,104 km · 一天 = 243 个地球日 · 一年 = 225 个地球日',
      funZh: '最热的行星：约 460°C 的失控温室效应，而且逆向自转。' },
    { name: 'Earth', zh: '地球', short: '地', shortEn: 'Ea', dist: 25, size: 1.7, tilt: 23.4, spin: 1.2, inc: 0,
      texKey: 'earth', type: 'earth', colors: ['#2a66c8'],
      factsEn: 'Diameter 12,742 km · Day: 24 hours · Year: 365.25 days',
      funEn: 'The only world known to harbor life. Hello from here!',
      factsZh: '直径 12,742 km · 一天 = 24 小时 · 一年 = 365.25 天',
      funZh: '已知唯一存在生命的星球。我们的家园！' },
    { name: 'Mars', zh: '火星', short: '火', shortEn: 'Ma', dist: 31, size: 1.25, tilt: 25.2, spin: 1.1, inc: 1.9,
      texKey: 'mars', type: 'rocky', colors: ['#c1542f', '#d1603d', '#a84a2a', '#e07b50'],
      factsEn: 'Diameter 6,779 km · Day: 24.6 hours · Year: 687 Earth days',
      funEn: 'Home to Olympus Mons, the tallest volcano in the solar system.',
      factsZh: '直径 6,779 km · 一天 = 24.6 小时 · 一年 = 687 个地球日',
      funZh: '拥有太阳系最高的火山——奥林帕斯山。' },
    { name: 'Jupiter', zh: '木星', short: '木', shortEn: 'Ju', dist: 42, size: 4.2, tilt: 3.1, spin: 2.2, inc: 1.3,
      texKey: 'jupiter', type: 'banded', colors: ['#d8a05c', '#c9905a', '#e8c596', '#b07a4a', '#e3b67e'],
      factsEn: 'Diameter 139,820 km · Day: 9.9 hours · Year: 11.9 Earth years',
      funEn: 'Over 1,300 Earths could fit inside the largest planet.',
      factsZh: '直径 139,820 km · 一天 = 9.9 小时 · 一年 = 11.9 个地球年',
      funZh: '最大的行星，能装下 1,300 多个地球。' },
    { name: 'Saturn', zh: '土星', short: '土', shortEn: 'Sa', dist: 53, size: 3.6, tilt: 26.7, spin: 2.0, inc: 2.5,
      texKey: 'saturn', type: 'banded', colors: ['#e3cf9e', '#d9c28a', '#efe0b6', '#c9b078'],
      factsEn: 'Diameter 116,460 km · Day: 10.7 hours · Year: 29.5 Earth years',
      funEn: 'Its rings are mostly water ice — and the planet is less dense than water.',
      factsZh: '直径 116,460 km · 一天 = 10.7 小时 · 一年 = 29.5 个地球年',
      funZh: '光环主要由水冰构成；土星本身密度比水还低。' },
    { name: 'Uranus', zh: '天王星', short: '天', shortEn: 'Ur', dist: 63, size: 2.6, tilt: 97.8, spin: 1.4, inc: 0.8,
      texKey: 'uranus', type: 'banded', colors: ['#9bd4d4', '#8ccaca', '#b3e0e0', '#7fbfc4'],
      factsEn: 'Diameter 50,724 km · Day: 17.2 hours · Year: 84 Earth years',
      funEn: 'An ice giant tipped on its side — it rolls around the Sun.',
      factsZh: '直径 50,724 km · 一天 = 17.2 小时 · 一年 = 84 个地球年',
      funZh: '“躺着”公转的冰巨星，自转轴倾斜约 98°。' },
    { name: 'Neptune', zh: '海王星', short: '海', shortEn: 'Ne', dist: 71, size: 2.5, tilt: 28.3, spin: 1.5, inc: 1.8,
      texKey: 'neptune', type: 'banded', colors: ['#4969e1', '#3d59c4', '#5d7df0', '#3450b4'],
      factsEn: 'Diameter 49,244 km · Day: 16.1 hours · Year: 165 Earth years',
      funEn: 'The windiest world: gusts can top 2,000 km/h.',
      factsZh: '直径 49,244 km · 一天 = 16.1 小时 · 一年 = 165 个地球年',
      funZh: '风速最快的行星，阵风可超过 2,000 km/h。' },
    { name: 'Pluto', zh: '冥王星', short: '冥', shortEn: 'Pl', dist: 78, size: 0.35, tilt: 57, spin: 0.3, inc: 11,
      texKey: 'pluto', type: 'rocky', colors: ['#c6b59b', '#b5a288', '#d9c8ad', '#8f8070'],
      factsEn: 'Dwarf planet · Diameter 2,377 km · Year: 248 Earth years',
      funEn: 'Reclassified as a dwarf planet in 2006 — famous for its heart-shaped glacier.',
      factsZh: '矮行星 · 直径 2,377 km · 一年 = 248 个地球年',
      funZh: '2006 年起被重新归类为矮行星，心形冰原是它的标志。' }
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

  // ---------- real positions: JPL/Standish approximate Keplerian elements ----------
  // [a(AU), e, I(deg), L(deg), longPeri(deg), longNode(deg)] at J2000 + rates/century.
  // We use the heliocentric ecliptic longitude only and keep the compressed radii,
  // so planetary configurations (conjunctions, alignments) are astronomically real.
  var ELEMENTS = {
    Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
              [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
    Venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
              [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
    Earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
              [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
    Mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
              [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
    Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
              [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
    Saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
              [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
    Uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
              [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
    Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
              [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
    Pluto:   [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
              [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]]
  };
  var DEG = Math.PI / 180;

  function helioLongitude(elem, T) {
    var a = elem[0][0] + elem[1][0] * T;
    var e = elem[0][1] + elem[1][1] * T;
    var I = (elem[0][2] + elem[1][2] * T) * DEG;
    var L = elem[0][3] + elem[1][3] * T;
    var peri = elem[0][4] + elem[1][4] * T;
    var node = elem[0][5] + elem[1][5] * T;
    var M = (((L - peri) % 360) + 540) % 360 - 180; // mean anomaly in [-180,180]
    M *= DEG;
    var E = M + e * Math.sin(M); // solve Kepler's equation (radians)
    for (var k = 0; k < 6; k++) {
      E += (M - (E - e * Math.sin(E))) / (1 - e * Math.cos(E));
    }
    var xp = a * (Math.cos(E) - e);
    var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var w = (peri - node) * DEG, N = node * DEG;
    var cw = Math.cos(w), sw = Math.sin(w), cN = Math.cos(N), sN = Math.sin(N), cI = Math.cos(I);
    var xe = (cw * cN - sw * sN * cI) * xp + (-sw * cN - cw * sN * cI) * yp;
    var ye = (cw * sN + sw * cN * cI) * xp + (-sw * sN + cw * cN * cI) * yp;
    return Math.atan2(ye, xe); // heliocentric ecliptic longitude (radians)
  }

  function julianCenturies(date) {
    return (date.getTime() / 86400000 + 2440587.5 - 2451545.0) / 36525.0;
  }

  var realPositions = true; // headline feature: planets at their true positions

  // ---------- renderer / scene ----------
  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04040f);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 4000);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2.5));
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.30));
  scene.add(new THREE.PointLight(0xfff2cc, 1.5, 0, 2));

  var texLoader = new THREE.TextureLoader();
  var maxAniso = renderer.capabilities.getMaxAnisotropy();
  function tex(key) {
    if (!TEX[key]) return null;
    var t = texLoader.load(TEX[key]);
    t.anisotropy = maxAniso;
    t.encoding = THREE.sRGBEncoding;
    return t;
  }

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

  function makeLabel(text, small, keepOnSurface) {
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
    if (!keepOnSurface) hideOnSurface.push(sprite);
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

  // ---------- constellations (approximate real RA/Dec of the bright stars) ----------
  var constellationGroup = new THREE.Group();
  var constMats = [];
  var constellationsOn = true;
  (function () {
    var R = 1000;
    function skyPoint(raH, decD) {
      var ra = raH / 24 * Math.PI * 2, de = decD * Math.PI / 180;
      return new THREE.Vector3(Math.cos(de) * Math.cos(ra) * R, Math.sin(de) * R,
                               Math.cos(de) * Math.sin(ra) * R);
    }
    var starMap = glowTexture('rgba(255,255,255,1)', 'rgba(200,220,255,0)');
    var DEFS = [
      { zh: '北斗七星', en: 'Big Dipper',
        stars: [[11.06, 61.8], [11.03, 56.4], [11.9, 53.7], [12.26, 57.0],
                [12.9, 56.0], [13.4, 54.9], [13.79, 49.3]],
        lines: [[6, 5], [5, 4], [4, 3], [3, 0], [0, 1], [1, 2], [2, 3]] },
      { zh: '猎户座', en: 'Orion',
        stars: [[5.92, 7.4], [5.42, 6.35], [5.68, -1.94], [5.6, -1.2],
                [5.53, -0.3], [5.8, -9.67], [5.24, -8.2]],
        lines: [[0, 1], [0, 2], [1, 4], [2, 3], [3, 4], [2, 5], [4, 6], [5, 6]] },
      { zh: '仙后座', en: 'Cassiopeia',
        stars: [[0.15, 59.15], [0.68, 56.5], [0.95, 60.7], [1.43, 60.2], [1.91, 63.7]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4]] },
      { zh: '天蝎座', en: 'Scorpius',
        stars: [[16.0, -22.6], [16.49, -26.4], [16.6, -28.2], [16.84, -34.3],
                [17.56, -37.1], [17.62, -43.0]],
        lines: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5]] }
    ];
    DEFS.forEach(function (cdef) {
      var pts = cdef.stars.map(function (s) { return skyPoint(s[0], s[1]); });
      var pos = new Float32Array(pts.length * 3);
      var cen = new THREE.Vector3();
      pts.forEach(function (p, i) {
        pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
        cen.add(p);
      });
      cen.multiplyScalar(1 / pts.length);
      var sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      var starMat = new THREE.PointsMaterial({
        color: 0xffffff, size: 7, sizeAttenuation: false, transparent: true,
        opacity: 0.95, map: starMap, depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      constellationGroup.add(new THREE.Points(sg, starMat));
      constMats.push({ mat: starMat, base: 0.95 });

      var linePts = [];
      cdef.lines.forEach(function (ln) {
        linePts.push(pts[ln[0]], pts[ln[1]]);
      });
      var lineMat = new THREE.LineBasicMaterial({
        color: 0x7f96e8, transparent: true, opacity: 0.45
      });
      constellationGroup.add(new THREE.LineSegments(
        new THREE.BufferGeometry().setFromPoints(linePts), lineMat));
      constMats.push({ mat: lineMat, base: 0.45 });

      var label = makeLabel(cdef.zh + ' ' + cdef.en, false, true);
      label.scale.multiplyScalar(4.5);
      label.position.copy(cen).multiplyScalar(1.04);
      constellationGroup.add(label);
      constMats.push({ mat: label.material, base: 0.85 });
    });
    scene.add(constellationGroup);
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
      new THREE.SphereGeometry(p.size, 64, 40),
      new THREE.MeshStandardMaterial({ map: map, roughness: 0.95, metalness: 0,
                                       transparent: true })
    );
    mesh.userData.info = {
      zh: { name: p.zh + ' ' + p.name, facts: p.factsZh, fun: p.funZh },
      en: { name: p.name, facts: p.factsEn, fun: p.funEn }
    };
    mesh.userData.followTarget = posGroup;
    mesh.userData.viewRadius = Math.max(p.size * 7, 14);
    if (p.name === 'Earth') mesh.userData.surfaceKey = 'Earth';
    if (p.name === 'Mars') mesh.userData.surfaceKey = 'Mars';
    tiltGroup.add(mesh);
    clickable.push(mesh);

    var clouds = null, moonPivot = null, moonMesh = null;
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
      moonMesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 32, 20),
        new THREE.MeshStandardMaterial(
          TEX.moon ? { map: tex('moon'), roughness: 1 } : { color: 0xbbbbbb, roughness: 1 }
        )
      );
      moonMesh.position.set(3.1, 0, 0);
      moonMesh.userData.info = MOON_INFO;
      moonMesh.userData.followTarget = moonMesh;
      moonMesh.userData.viewRadius = 6;
      moonMesh.userData.surfaceKey = 'Moon';
      moonPivot.add(moonMesh);
      clickable.push(moonMesh);
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
      clouds: clouds, moonPivot: moonPivot, moonMesh: moonMesh,
      ringMat: ringMat, baseRingOp: baseRingOp,
      angle0: Math.random() * Math.PI * 2,
      omega: KEPLER_K / Math.pow(p.dist, 1.5),
      elem: ELEMENTS[p.name]
    };
  });
  var earthObj = planetObjs[2];
  var marsObj = planetObjs[3];
  var jupiterObj = planetObjs[4];
  var saturnObj = planetObjs[5];

  // ---------- major moons (Galilean moons + Titan) ----------
  var minorMoons = [];
  function addMinorMoon(parent, def) {
    var pivot = new THREE.Group();
    pivot.rotation.y = Math.random() * Math.PI * 2;
    parent.posGroup.add(pivot);
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(def.size, 24, 16),
      new THREE.MeshStandardMaterial({ color: def.color, roughness: 1 })
    );
    mesh.position.set(def.dist, 0, 0);
    mesh.userData.info = {
      zh: { name: def.zhName, facts: def.factsZh, fun: def.funZh },
      en: { name: def.enName, facts: def.factsEn, fun: def.funEn }
    };
    mesh.userData.followTarget = mesh;
    mesh.userData.viewRadius = 5;
    pivot.add(mesh);
    clickable.push(mesh);
    minorMoons.push({ pivot: pivot, omega: 8 / Math.pow(def.dist, 1.5) });
  }
  [
    { dist: 5.3, size: 0.28, color: 0xd8c356,
      zhName: '木卫一 Io', enName: 'Io',
      factsZh: '木星的卫星 · 直径 3,643 km', factsEn: "Jupiter's moon · Diameter 3,643 km",
      funZh: '太阳系中火山活动最剧烈的天体。',
      funEn: 'The most volcanically active world in the solar system.' },
    { dist: 6.3, size: 0.24, color: 0xcfc8b8,
      zhName: '木卫二 Europa', enName: 'Europa',
      factsZh: '木星的卫星 · 直径 3,122 km', factsEn: "Jupiter's moon · Diameter 3,122 km",
      funZh: '冰壳之下藏着液态海洋，是寻找生命的热门地点。',
      funEn: 'An ocean hides beneath its icy shell — a top spot to look for life.' },
    { dist: 7.4, size: 0.34, color: 0x9a8d7c,
      zhName: '木卫三 Ganymede', enName: 'Ganymede',
      factsZh: '木星的卫星 · 直径 5,268 km', factsEn: "Jupiter's moon · Diameter 5,268 km",
      funZh: '太阳系最大的卫星，比水星还大。',
      funEn: 'The largest moon in the solar system — bigger than Mercury.' },
    { dist: 8.6, size: 0.30, color: 0x70665c,
      zhName: '木卫四 Callisto', enName: 'Callisto',
      factsZh: '木星的卫星 · 直径 4,821 km', factsEn: "Jupiter's moon · Diameter 4,821 km",
      funZh: '表面布满陨石坑，是太阳系中最古老的地貌之一。',
      funEn: 'One of the most heavily cratered, ancient surfaces in the solar system.' }
  ].forEach(function (d) { addMinorMoon(jupiterObj, d); });
  addMinorMoon(saturnObj, {
    dist: 9.2, size: 0.34, color: 0xc9923e,
    zhName: '土卫六 Titan', enName: 'Titan',
    factsZh: '土星的卫星 · 直径 5,150 km', factsEn: "Saturn's moon · Diameter 5,150 km",
    funZh: '拥有浓厚大气和液态甲烷湖泊。',
    funEn: 'Has a thick atmosphere and lakes of liquid methane.'
  });

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
  var theta = 1.25, phi = 1.05, radius = 130, targetRadius = 130;
  var camTarget = new THREE.Vector3();
  var followObj = null;
  var tmpV = new THREE.Vector3();
  var zeroV = new THREE.Vector3(0, 0, 0);

  function updateCamera(dt) {
    radius += (targetRadius - radius) * Math.min(1, dt * 4);
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

  // ---------- surface views: Earth / Mars / Moon ----------
  var surfaceMode = false;
  var lookYaw = 0, lookPitch = 0.12;
  var prevSpeed = 1;
  var activeSurface = null;
  var surfaceAnchor = new THREE.Object3D();

  var SURFACE_CONFIGS = {
    Earth: {
      mesh: earthObj.mesh, center: earthObj.posGroup, radius: 1.7, height: 0.12,
      anchor: [1.7085, 0, 0], skyType: 'earth', face: 'sun',
      followAfterExit: earthObj.posGroup, exitRadius: earthObj.mesh.userData.viewRadius,
      btnZh: '🌅 站上地表看日出日落', btnEn: '🌅 Watch sunrise & sunset from the surface',
      hintZh: '拖动环顾四周 · 太阳从东方升起', hintEn: 'Drag to look around · The Sun rises in the east'
    },
    Mars: {
      mesh: marsObj.mesh, center: marsObj.posGroup, radius: 1.25, height: 0.12,
      anchor: [1.2563, 0, 0], skyType: 'mars', face: 'sun',
      followAfterExit: marsObj.posGroup, exitRadius: marsObj.mesh.userData.viewRadius,
      btnZh: '🔴 站上火星地表', btnEn: '🔴 Stand on the Martian surface',
      hintZh: '拖动环顾四周 · 火星的日落是蓝色的', hintEn: 'Drag to look around · Martian sunsets are blue'
    },
    Moon: {
      mesh: earthObj.moonMesh, center: earthObj.moonMesh, radius: 0.45, height: 0.09,
      anchor: [-0.3198, 0, 0.3198], skyType: 'none', face: 'earth',
      followAfterExit: earthObj.moonMesh, exitRadius: 6,
      btnZh: '🌍 站上月面回望地球', btnEn: '🌍 Stand on the Moon & see Earth',
      hintZh: '拖动环顾四周 · 月球没有大气，白天也能看到星星',
      hintEn: 'Drag to look around · No atmosphere: stars shine even in daytime'
    }
  };

  var aPos = new THREE.Vector3(), ePos = new THREE.Vector3();
  var upV = new THREE.Vector3(), eastV = new THREE.Vector3();
  var axisV = new THREE.Vector3(), lookV = new THREE.Vector3();
  var faceFlat = new THREE.Vector3(), crossT = new THREE.Vector3();
  var qTmp = new THREE.Quaternion();

  var skyEl = document.getElementById('sky');
  var surfacePanel = document.getElementById('surfacePanel');
  var surfaceBtn = document.getElementById('surfaceBtn');
  var navPanel = document.getElementById('navPanel');

  function mix(a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)];
  }
  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  var dayFade = 0; // 0 = night sky fully visible, 1 = daylight washes it out

  function updateSky(sunElev, skyType) {
    if (skyType === 'none') {
      dayFade = 0;
      skyEl.style.opacity = '0';
      return;
    }
    var day = Math.min(1, Math.max(0, (sunElev - 0.04) / 0.30));
    var glow = Math.exp(-Math.pow((sunElev - 0.02) / 0.11, 2));
    var zen, hor, op;
    if (skyType === 'mars') {
      zen = mix([6, 5, 10], [42, 32, 40], glow * 0.5);
      zen = mix(zen, [196, 148, 110], day);
      hor = mix([12, 9, 14], [120, 160, 235], glow); // Martian sunsets glow blue
      hor = mix(hor, [226, 176, 138], day * 0.9);
      op = Math.max(day * 0.62, glow * 0.5);
    } else {
      zen = mix([4, 6, 18], [18, 32, 80], glow * 0.6);
      zen = mix(zen, [62, 130, 215], day);
      hor = mix([8, 10, 26], [255, 122, 40], glow);
      hor = mix(hor, [168, 216, 252], day * 0.88);
      op = Math.max(day * 0.72, glow * 0.62);
    }
    dayFade = day;
    skyEl.style.opacity = op.toFixed(3);
    skyEl.style.background = 'linear-gradient(to top, ' + rgb(hor) + ' 0%, ' + rgb(zen) + ' 65%)';
  }

  // ---------- gyroscope look-around (surface mode) ----------
  var gyroActive = false, gyroHaveData = false;
  var gyroAlpha = 0, gyroBeta = 0, gyroGamma = 0, gyroOrient = 0;
  var deviceQuat = new THREE.Quaternion();
  var basisQuat = new THREE.Quaternion();
  var basisMat = new THREE.Matrix4();
  var southV = new THREE.Vector3();
  var zeeV = new THREE.Vector3(0, 0, 1);
  var gyroEuler = new THREE.Euler();
  var qBack = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5)); // -90° about X
  var qScreen = new THREE.Quaternion();

  function onDeviceOrientation(e) {
    if (e.alpha === null || e.alpha === undefined) return;
    gyroAlpha = e.alpha * DEG;
    gyroBeta = (e.beta || 0) * DEG;
    gyroGamma = (e.gamma || 0) * DEG;
    var o = (window.screen && window.screen.orientation && window.screen.orientation.angle) ||
            window.orientation || 0;
    gyroOrient = o * DEG;
    gyroHaveData = true;
  }

  function deviceQuaternion(q) {
    gyroEuler.set(gyroBeta, gyroAlpha, -gyroGamma, 'YXZ'); // device frame
    q.setFromEuler(gyroEuler);
    q.multiply(qBack); // camera looks out the back of the phone
    q.multiply(qScreen.setFromAxisAngle(zeeV, -gyroOrient)); // account for screen rotation
  }

  function setGyro(on) {
    gyroActive = on;
    var b = document.getElementById('gyroBtn');
    if (on) {
      gyroHaveData = false;
      window.addEventListener('deviceorientation', onDeviceOrientation, true);
      if (b) b.classList.add('active');
    } else {
      window.removeEventListener('deviceorientation', onDeviceOrientation, true);
      if (b) b.classList.remove('active');
    }
  }

  function toggleGyro() {
    if (gyroActive) { setGyro(false); return; }
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission()
        .then(function (resp) { if (resp === 'granted') setGyro(true); })
        .catch(function () {});
    } else {
      setGyro(true);
    }
  }

  function setRealPos(on) {
    realPositions = on;
    var b = document.getElementById('realposBtn');
    if (on) b.classList.add('active'); else b.classList.remove('active');
  }

  function updateSurfaceCamera() {
    var cfg = activeSurface;
    surfaceAnchor.getWorldPosition(aPos);
    cfg.center.getWorldPosition(ePos);
    upV.copy(aPos).sub(ePos).normalize();
    cfg.mesh.getWorldQuaternion(qTmp);
    axisV.set(0, 1, 0).applyQuaternion(qTmp).normalize();
    eastV.crossVectors(axisV, upV).normalize();

    camera.position.copy(aPos).addScaledVector(upV, cfg.height);
    if (gyroActive && gyroHaveData) {
      // orient the camera from the phone's pose, re-based onto the local
      // tangent frame (east, up, south) so "up" is the surface normal
      southV.crossVectors(eastV, upV).normalize();
      basisMat.makeBasis(eastV, upV, southV);
      basisQuat.setFromRotationMatrix(basisMat);
      deviceQuaternion(deviceQuat);
      camera.quaternion.copy(basisQuat).multiply(deviceQuat);
    } else {
      lookV.copy(eastV).applyAxisAngle(upV, lookYaw);
      lookV.multiplyScalar(Math.cos(lookPitch)).addScaledVector(upV, Math.sin(lookPitch)).normalize();
      camera.up.copy(upV);
      tmpV.copy(camera.position).addScaledVector(lookV, 10);
      camera.lookAt(tmpV);
    }

    // sun elevation above the local horizon (sun is at the origin)
    var sunElev = upV.dot(tmpV.copy(aPos).negate().normalize());
    updateSky(sunElev, cfg.skyType);
  }

  function enterSurfaceMode(key) {
    var cfg = SURFACE_CONFIGS[key];
    if (!cfg || !cfg.mesh) return;
    stopTour();
    if (sandboxMode) setSandbox(false);
    surfaceMode = true;
    activeSurface = cfg;
    followObj = null;
    infoEl.classList.add('hidden');
    currentInfo = null;
    surfacePanel.classList.remove('hidden');
    navPanel.classList.add('hidden');
    gyroHaveData = false; // fall back to drag until the phone reports a pose
    document.getElementById('surfaceHint').textContent = LANG === 'zh' ? cfg.hintZh : cfg.hintEn;
    hideOnSurface.forEach(function (o) { o.visible = false; });
    cfg.mesh.add(surfaceAnchor);
    surfaceAnchor.position.set(cfg.anchor[0], cfg.anchor[1], cfg.anchor[2]);
    // tame the compressed scale: shrink sun/moon/planets to believable sky sizes
    sunMesh.scale.setScalar(0.3);
    sunGlow.scale.set(11, 11, 1);
    if (key === 'Earth' && earthObj.clouds) earthObj.clouds.visible = false;
    if (key === 'Moon' && earthObj.clouds) earthObj.clouds.material.opacity = 0.45;
    if (earthObj.moonMesh) earthObj.moonMesh.scale.setScalar(key === 'Earth' ? 0.38 : 1);
    planetObjs.forEach(function (o) {
      if (o.mesh !== cfg.mesh) o.tiltGroup.scale.setScalar(0.45);
    });
    prevSpeed = speed;
    setSpeed(0.25);
    // start facing the sun (or Earth, from the Moon)
    surfaceAnchor.getWorldPosition(aPos);
    cfg.center.getWorldPosition(ePos);
    upV.copy(aPos).sub(ePos).normalize();
    cfg.mesh.getWorldQuaternion(qTmp);
    axisV.set(0, 1, 0).applyQuaternion(qTmp).normalize();
    eastV.crossVectors(axisV, upV).normalize();
    if (cfg.face === 'earth') {
      earthObj.posGroup.getWorldPosition(faceFlat);
      faceFlat.sub(aPos);
    } else {
      faceFlat.copy(aPos).negate();
    }
    var elev = Math.asin(Math.max(-1, Math.min(1, faceFlat.clone().normalize().dot(upV))));
    faceFlat.addScaledVector(upV, -faceFlat.dot(upV)).normalize();
    crossT.crossVectors(eastV, faceFlat);
    lookYaw = Math.atan2(crossT.dot(upV), eastV.dot(faceFlat));
    lookPitch = Math.max(-0.3, Math.min(1.2, cfg.face === 'earth' ? elev : 0.12));
  }

  function exitSurfaceMode() {
    if (!surfaceMode) return;
    if (gyroActive) setGyro(false);
    var cfg = activeSurface;
    surfaceMode = false;
    activeSurface = null;
    surfacePanel.classList.add('hidden');
    navPanel.classList.remove('hidden');
    hideOnSurface.forEach(function (o) { o.visible = true; });
    sunMesh.scale.setScalar(1);
    sunGlow.scale.set(42, 42, 1);
    if (earthObj.clouds) {
      earthObj.clouds.visible = true;
      earthObj.clouds.material.opacity = 0.9;
    }
    if (earthObj.moonMesh) earthObj.moonMesh.scale.setScalar(1);
    planetObjs.forEach(function (o) { o.tiltGroup.scale.setScalar(1); });
    dayFade = 0;
    skyEl.style.opacity = '0';
    camera.up.set(0, 1, 0);
    setSpeed(prevSpeed);
    followObj = cfg.followAfterExit;
    targetRadius = cfg.exitRadius;
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
    if (sandboxMode && !surfaceMode && planePoint(e.clientX, e.clientY, aimStart)) {
      aiming = true;
      aimEnd.copy(aimStart);
      updateAimLine();
      return;
    }
    dragging = true; moved = 0; lastX = e.clientX; lastY = e.clientY;
  });
  window.addEventListener('mousemove', function (e) {
    if (aiming) {
      planePoint(e.clientX, e.clientY, aimEnd);
      updateAimLine();
      return;
    }
    if (!dragging) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    moved += Math.abs(dx) + Math.abs(dy);
    lastX = e.clientX; lastY = e.clientY;
    applyDrag(dx, dy, 0.005);
  });
  window.addEventListener('mouseup', function (e) {
    if (aiming) {
      aiming = false;
      aimLine.visible = false;
      launchFromAim();
      return;
    }
    if (dragging && moved < 6) handleClick(e.clientX, e.clientY);
    dragging = false;
  });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (surfaceMode) return;
    targetRadius = Math.min(700, Math.max(10, targetRadius * (1 + e.deltaY * 0.001)));
  }, { passive: false });

  var touchDist = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 1) {
      if (sandboxMode && !surfaceMode &&
          planePoint(e.touches[0].clientX, e.touches[0].clientY, aimStart)) {
        aiming = true;
        aimEnd.copy(aimStart);
        updateAimLine();
        return;
      }
      dragging = true; moved = 0;
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
    } else if (e.touches.length === 2) {
      dragging = false;
      touchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                             e.touches[0].clientY - e.touches[1].clientY);
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (aiming && e.touches.length === 1) {
      planePoint(e.touches[0].clientX, e.touches[0].clientY, aimEnd);
      updateAimLine();
      e.preventDefault();
      return;
    }
    if (e.touches.length === 1 && dragging) {
      var dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
      moved += Math.abs(dx) + Math.abs(dy);
      lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      applyDrag(dx, dy, 0.006);
    } else if (e.touches.length === 2 && !surfaceMode) {
      var d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                         e.touches[0].clientY - e.touches[1].clientY);
      if (touchDist > 0) {
        targetRadius = Math.min(700, Math.max(10, targetRadius * touchDist / d));
      }
      touchDist = d;
    }
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchend', function (e) {
    if (aiming) {
      aiming = false;
      aimLine.visible = false;
      launchFromAim();
      dragging = false; touchDist = 0;
      return;
    }
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
  var currentSurfaceKey = null;

  function showCard(info, surfaceKey) {
    currentInfo = info;
    currentSurfaceKey = surfaceKey || null;
    var d = info[LANG];
    infoName.textContent = d.name;
    infoFacts.textContent = d.facts;
    infoFun.textContent = d.fun;
    if (currentSurfaceKey) {
      var cfg = SURFACE_CONFIGS[currentSurfaceKey];
      surfaceBtn.textContent = LANG === 'zh' ? cfg.btnZh : cfg.btnEn;
      surfaceBtn.style.display = 'inline-block';
    } else {
      surfaceBtn.style.display = 'none';
    }
    infoEl.classList.remove('hidden');
  }

  function focusObject(hit) {
    blip();
    showCard(hit.userData.info, hit.userData.surfaceKey);
    if (hit === sunMesh) {
      followObj = null;
      targetRadius = Math.max(targetRadius, 40);
    } else {
      followObj = hit.userData.followTarget;
      targetRadius = hit.userData.viewRadius;
    }
  }

  function handleClick(x, y) {
    if (surfaceMode) return;
    stopTour();
    var hit = pick(x, y);
    if (!hit) {
      followObj = null;
      currentInfo = null;
      currentSurfaceKey = null;
      infoEl.classList.add('hidden');
      return;
    }
    focusObject(hit);
  }

  window.addEventListener('mousemove', function (e) {
    if (!dragging && !surfaceMode) {
      canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
    }
  });

  // ---------- gravity sandbox ----------
  var sandboxMode = false;
  var sandboxBodies = [];
  var MU = KEPLER_K * KEPLER_K; // so circular speed matches the planets
  var aiming = false;
  var aimStart = new THREE.Vector3(), aimEnd = new THREE.Vector3();
  var sandboxPanel = document.getElementById('sandboxPanel');
  var aimLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 })
  );
  aimLine.visible = false;
  aimLine.frustumCulled = false;
  scene.add(aimLine);

  function planePoint(x, y, out) {
    pointer.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    var dy = raycaster.ray.direction.y;
    if (Math.abs(dy) < 1e-4) return null;
    var t = -raycaster.ray.origin.y / dy;
    if (t < 0) return null;
    out.copy(raycaster.ray.direction).multiplyScalar(t).add(raycaster.ray.origin);
    return out;
  }

  function updateAimLine() {
    var arr = aimLine.geometry.attributes.position.array;
    arr[0] = aimStart.x; arr[1] = aimStart.y; arr[2] = aimStart.z;
    arr[3] = aimEnd.x; arr[4] = aimEnd.y; arr[5] = aimEnd.z;
    aimLine.geometry.attributes.position.needsUpdate = true;
    aimLine.visible = true;
  }

  function launchFromAim() {
    var v = new THREE.Vector3().subVectors(aimEnd, aimStart).multiplyScalar(0.25);
    v.y = 0;
    if (v.length() < 0.4) {
      // tiny drag: give it a near-circular orbit
      var r = Math.max(aimStart.length(), 8);
      v.set(-aimStart.z, 0, aimStart.x).normalize()
       .multiplyScalar(KEPLER_K / Math.sqrt(r) * 0.95);
    } else if (v.length() > 7) {
      v.setLength(7);
    }
    spawnBody(aimStart.clone(), v);
  }

  function spawnBody(p0, v0) {
    if (sandboxBodies.length >= 10) removeBody(sandboxBodies[0]);
    var col = new THREE.Color().setHSL(Math.random(), 0.85, 0.62);
    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.45, 20, 14),
      new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.45 })
    );
    mesh.position.copy(p0);
    scene.add(mesh);
    var maxTrail = 260;
    var arr = new Float32Array(maxTrail * 3);
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
    geo.setDrawRange(0, 0);
    var trail = new THREE.Line(geo, new THREE.LineBasicMaterial({
      color: col, transparent: true, opacity: 0.55
    }));
    trail.frustumCulled = false;
    scene.add(trail);
    sandboxBodies.push({ mesh: mesh, trail: trail, arr: arr, n: 0, maxTrail: maxTrail,
                         pos: p0.clone(), vel: v0.clone() });
    blip();
  }

  function removeBody(b) {
    scene.remove(b.mesh);
    scene.remove(b.trail);
    sandboxBodies.splice(sandboxBodies.indexOf(b), 1);
  }

  function clearBodies() {
    while (sandboxBodies.length) removeBody(sandboxBodies[0]);
  }

  function updateSandbox(dtSim) {
    if (dtSim <= 0 || !sandboxBodies.length) return;
    var steps = Math.min(80, Math.max(1, Math.ceil(dtSim / 0.02)));
    var h = dtSim / steps;
    for (var bi = sandboxBodies.length - 1; bi >= 0; bi--) {
      var b = sandboxBodies[bi];
      for (var s = 0; s < steps; s++) {
        var r2 = b.pos.lengthSq();
        var acc = -MU / (r2 * Math.sqrt(r2));
        b.vel.addScaledVector(b.pos, acc * h);
        b.pos.addScaledVector(b.vel, h);
      }
      var rr = b.pos.length();
      if (rr < 6.6 || rr > 450) { // burned up in the sun, or escaped
        removeBody(b);
        continue;
      }
      b.mesh.position.copy(b.pos);
      if (b.n < b.maxTrail) {
        b.arr[b.n * 3] = b.pos.x; b.arr[b.n * 3 + 1] = b.pos.y; b.arr[b.n * 3 + 2] = b.pos.z;
        b.n++;
      } else {
        b.arr.copyWithin(0, 3);
        b.arr[(b.maxTrail - 1) * 3] = b.pos.x;
        b.arr[(b.maxTrail - 1) * 3 + 1] = b.pos.y;
        b.arr[(b.maxTrail - 1) * 3 + 2] = b.pos.z;
      }
      b.trail.geometry.setDrawRange(0, b.n);
      b.trail.geometry.attributes.position.needsUpdate = true;
    }
  }

  function setSandbox(on) {
    sandboxMode = on;
    var sb = document.getElementById('sandboxBtn');
    if (on) {
      stopTour();
      if (surfaceMode) exitSurfaceMode();
      currentInfo = null;
      infoEl.classList.add('hidden');
      sandboxPanel.classList.remove('hidden');
      sb.classList.add('active');
    } else {
      aiming = false;
      aimLine.visible = false;
      sandboxPanel.classList.add('hidden');
      sb.classList.remove('active');
    }
  }

  // ---------- auto tour ----------
  var tourMode = false, tourIdx = -1, tourTimer = 0;
  var tourBtn = document.getElementById('tourBtn');

  function startTour() {
    if (surfaceMode) exitSurfaceMode();
    if (sandboxMode) setSandbox(false);
    tourMode = true;
    tourIdx = -1;
    tourTimer = 0;
    tourBtn.textContent = UI[LANG].tourStop;
  }

  function stopTour() {
    if (!tourMode) return;
    tourMode = false;
    tourBtn.textContent = UI[LANG].tour;
  }

  function updateTour(dt) {
    theta += 0.12 * dt; // slow cinematic pan while holding on each planet
    tourTimer -= dt;
    if (tourTimer > 0) return;
    tourIdx++;
    if (tourIdx >= planetObjs.length) {
      stopTour();
      followObj = null;
      currentInfo = null;
      currentSurfaceKey = null;
      infoEl.classList.add('hidden');
      targetRadius = 130;
      return;
    }
    focusObject(planetObjs[tourIdx].mesh);
    tourTimer = 7;
  }

  // ---------- quick-jump navigation rail ----------
  var navEntries = [];
  (function () {
    var items = [{ zh: '日', en: 'Su', color: '#e8b84a', titleZh: '太阳', titleEn: 'Sun',
                   target: sunMesh }];
    planetObjs.forEach(function (o) {
      items.push({ zh: o.p.short, en: o.p.shortEn, color: o.p.colors[0],
                   titleZh: o.p.zh, titleEn: o.p.name, target: o.mesh });
    });
    items.push({ zh: '月', en: 'Mo', color: '#9a9a9a', titleZh: '月球', titleEn: 'Moon',
                 target: earthObj.moonMesh });
    items.forEach(function (it) {
      var btn = document.createElement('button');
      btn.className = 'nav-dot';
      btn.style.background = it.color;
      btn.textContent = it.zh;
      btn.title = it.titleZh;
      btn.addEventListener('click', function () {
        if (surfaceMode) exitSurfaceMode();
        stopTour();
        focusObject(it.target);
      });
      navPanel.appendChild(btn);
      navEntries.push({ btn: btn, it: it });
    });
  })();

  // ---------- ambient audio (generated with WebAudio, no files needed) ----------
  var audio = { ctx: null, master: null, on: false };

  function initAudio() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    var ctx = new Ctx();
    var master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    [[55, 'triangle', 0.05, 0.05], [110.4, 'sine', 0.035, 0.08],
     [164.8, 'sine', 0.02, 0.11]].forEach(function (d) {
      var osc = ctx.createOscillator();
      osc.type = d[1];
      osc.frequency.value = d[0];
      var g = ctx.createGain();
      g.gain.value = d[2];
      var lfo = ctx.createOscillator();
      lfo.frequency.value = d[3];
      var lg = ctx.createGain();
      lg.gain.value = d[2] * 0.5;
      lfo.connect(lg);
      lg.connect(g.gain);
      osc.connect(g);
      g.connect(master);
      osc.start();
      lfo.start();
    });
    audio.ctx = ctx;
    audio.master = master;
  }

  function setSound(on) {
    if (on && !audio.ctx) initAudio();
    if (!audio.ctx) return;
    audio.on = on;
    audio.ctx.resume();
    audio.master.gain.linearRampToValueAtTime(on ? 0.7 : 0, audio.ctx.currentTime + 0.8);
    var sb = document.getElementById('soundBtn');
    if (on) sb.classList.add('active'); else sb.classList.remove('active');
  }

  function blip() {
    if (!audio.on || !audio.ctx) return;
    var ctx = audio.ctx;
    var o = ctx.createOscillator();
    o.frequency.setValueAtTime(720, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(280, ctx.currentTime + 0.22);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.12, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    o.connect(g);
    g.connect(audio.master);
    o.start();
    o.stop(ctx.currentTime + 0.32);
  }

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
    document.getElementById('exitSurfaceBtn').textContent = u.exitSurface;
    document.getElementById('surfaceHint').textContent = activeSurface
      ? (l === 'zh' ? activeSurface.hintZh : activeSurface.hintEn)
      : '';
    tourBtn.textContent = tourMode ? u.tourStop : u.tour;
    pauseBtn.textContent = paused ? u.play : u.pause;
    document.getElementById('constBtn').textContent = u.constellation;
    document.getElementById('sandboxBtn').textContent = u.sandbox;
    document.getElementById('soundBtn').textContent = u.sound;
    document.getElementById('sandboxHintText').textContent = u.sandboxHint;
    document.getElementById('clearBtn').textContent = u.clear;
    document.getElementById('realposBtn').textContent = u.realpos;
    document.getElementById('todayBtn').textContent = u.today;
    document.getElementById('gyroBtn').textContent = u.gyro;
    navEntries.forEach(function (en) {
      en.btn.textContent = l === 'zh' ? en.it.zh : en.it.en;
      en.btn.title = l === 'zh' ? en.it.titleZh : en.it.titleEn;
    });
    if (currentInfo) showCard(currentInfo, currentSurfaceKey);
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
    stopTour();
    followObj = null;
    currentInfo = null;
    currentSurfaceKey = null;
    infoEl.classList.add('hidden');
    theta = 1.25; phi = 1.05; targetRadius = 130;
  });
  document.getElementById('langBtn').addEventListener('click', function () {
    setLang(LANG === 'zh' ? 'en' : 'zh');
  });
  surfaceBtn.addEventListener('click', function () {
    if (currentSurfaceKey) enterSurfaceMode(currentSurfaceKey);
  });
  document.getElementById('exitSurfaceBtn').addEventListener('click', exitSurfaceMode);
  tourBtn.addEventListener('click', function () {
    if (tourMode) {
      stopTour();
    } else {
      startTour();
    }
  });
  document.getElementById('constBtn').addEventListener('click', function () {
    constellationsOn = !constellationsOn;
    var b = document.getElementById('constBtn');
    if (constellationsOn) b.classList.add('active'); else b.classList.remove('active');
  });
  document.getElementById('sandboxBtn').addEventListener('click', function () {
    setSandbox(!sandboxMode);
  });
  document.getElementById('clearBtn').addEventListener('click', clearBodies);
  document.getElementById('soundBtn').addEventListener('click', function () {
    setSound(!audio.on);
  });
  document.getElementById('realposBtn').addEventListener('click', function () {
    setRealPos(!realPositions);
  });
  document.getElementById('todayBtn').addEventListener('click', function () {
    if (!realPositions) setRealPos(true);
    simTime = (Date.now() - START_DATE.getTime()) / 86400000 / DAYS_PER_SIM_SECOND;
  });
  document.getElementById('gyroBtn').addEventListener('click', toggleGyro);
  var datePicker = document.getElementById('datePicker');
  document.getElementById('datePanel').addEventListener('click', function () {
    var d = new Date(START_DATE.getTime() + simTime * DAYS_PER_SIM_SECOND * 86400000);
    datePicker.value = d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    if (datePicker.showPicker) {
      try { datePicker.showPicker(); } catch (err) { datePicker.focus(); }
    } else {
      datePicker.focus();
    }
  });
  datePicker.addEventListener('change', function () {
    var t = Date.parse(datePicker.value + 'T00:00:00');
    if (!isNaN(t)) simTime = (t - START_DATE.getTime()) / 86400000 / DAYS_PER_SIM_SECOND;
  });
  setLang('zh');
  document.getElementById('constBtn').classList.add('active');
  setRealPos(true);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  function pad2(n) { return n < 10 ? '0' + n : '' + n; }

  // test hooks (used by automated verification; harmless in production)
  window.__sim = { enterSurfaceMode: enterSurfaceMode, exitSurfaceMode: exitSurfaceMode,
                   setSpeed: setSpeed, startTour: startTour, stopTour: stopTour,
                   setSandbox: setSandbox, setRealPos: setRealPos,
                   setGyro: setGyro,
                   feedGyro: function (a, b, g) { onDeviceOrientation({ alpha: a, beta: b, gamma: g }); },
                   jumpToDate: function (iso) {
                     var t = Date.parse(iso + 'T00:00:00Z');
                     if (!isNaN(t)) simTime = (t - START_DATE.getTime()) / 86400000 / DAYS_PER_SIM_SECOND;
                   },
                   planetLongitudes: function () {
                     var out = {};
                     var jc = julianCenturies(new Date(START_DATE.getTime() +
                       simTime * DAYS_PER_SIM_SECOND * 86400000));
                     planetObjs.forEach(function (o) {
                       if (o.elem) out[o.p.name] = helioLongitude(o.elem, jc) / DEG;
                     });
                     return out;
                   },
                   spawn: function (x, z, vx, vz) {
                     spawnBody(new THREE.Vector3(x, 0, z), new THREE.Vector3(vx, 0, vz));
                   } };

  // ---------- main loop ----------
  var clock = new THREE.Clock();
  var simTime = 0, elapsed = 0;
  var tailDir = new THREE.Vector3();

  function animate() {
    requestAnimationFrame(animate);
    var dt = Math.min(clock.getDelta(), 0.1);
    elapsed += dt;
    if (!paused) simTime += dt * speed;

    var simDate = new Date(START_DATE.getTime() + simTime * DAYS_PER_SIM_SECOND * 86400000);
    var jc = realPositions ? julianCenturies(simDate) : 0;

    for (var i = 0; i < planetObjs.length; i++) {
      var o = planetObjs[i];
      var a = (realPositions && o.elem)
        ? helioLongitude(o.elem, jc)
        : o.angle0 + o.omega * simTime;
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
      po.mesh.material.opacity = (activeSurface && po.mesh === activeSurface.mesh) ? 1 : pf;
      if (po.ringMat) po.ringMat.opacity = po.baseRingOp * pf;
    }

    constellationGroup.visible = constellationsOn;
    if (constellationsOn) {
      for (i = 0; i < constMats.length; i++) {
        constMats[i].mat.opacity = constMats[i].base * df;
      }
    }
    for (i = 0; i < minorMoons.length; i++) {
      if (!paused) minorMoons[i].pivot.rotation.y += minorMoons[i].omega * dt * speed;
    }
    updateSandbox(paused ? 0 : dt * speed);

    dateValue.textContent = simDate.getFullYear() + '-' + pad2(simDate.getMonth() + 1) +
                            '-' + pad2(simDate.getDate());
    var yrs = simTime * DAYS_PER_SIM_SECOND / 365.25;
    dateElapsed.textContent = '(+' + yrs.toFixed(1) + ' ' + UI[LANG].years + ')';

    if (tourMode) updateTour(dt);

    if (surfaceMode) {
      updateSurfaceCamera();
    } else {
      updateCamera(dt);
    }
    renderer.render(scene, camera);
  }
  animate();
})();
