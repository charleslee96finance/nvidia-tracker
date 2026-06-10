/* Solar System 3D — real-time interactive simulation (three.js r128).
   Distances and sizes are compressed so everything fits in one view;
   orbital speeds follow Kepler's third law (w ~ r^-1.5). */
(function () {
  'use strict';

  var SUN_INFO = {
    name: 'Sun',
    facts: 'G-type main-sequence star · Diameter 1.39 million km · Surface ~5,500°C',
    fun: 'The Sun holds 99.86% of all the mass in the solar system.'
  };

  var PLANETS = [
    { name: 'Mercury', dist: 14, size: 0.9, tilt: 0.03, spin: 0.5, inc: 7,
      type: 'rocky', colors: ['#9c9890', '#b1adad', '#7d7873', '#c4c0b8'],
      facts: 'Diameter 4,879 km · Day: 59 Earth days · Year: 88 Earth days',
      fun: 'Smallest planet — scorching by day, freezing by night.' },
    { name: 'Venus', dist: 19, size: 1.6, tilt: 177, spin: -0.25, inc: 3.4,
      type: 'rocky', colors: ['#e0c075', '#e6c87d', '#cfae62', '#efd89a'],
      facts: 'Diameter 12,104 km · Day: 243 Earth days · Year: 225 Earth days',
      fun: 'Hottest planet: a runaway greenhouse near 460°C, spinning backwards.' },
    { name: 'Earth', dist: 25, size: 1.7, tilt: 23.4, spin: 1.2, inc: 0,
      type: 'earth', colors: ['#2a66c8'],
      facts: 'Diameter 12,742 km · Day: 24 hours · Year: 365.25 days',
      fun: 'The only world known to harbor life. Hello from here!' },
    { name: 'Mars', dist: 31, size: 1.25, tilt: 25.2, spin: 1.1, inc: 1.9,
      type: 'rocky', colors: ['#c1542f', '#d1603d', '#a84a2a', '#e07b50'],
      facts: 'Diameter 6,779 km · Day: 24.6 hours · Year: 687 Earth days',
      fun: 'Home to Olympus Mons, the tallest volcano in the solar system.' },
    { name: 'Jupiter', dist: 42, size: 4.2, tilt: 3.1, spin: 2.2, inc: 1.3,
      type: 'banded', colors: ['#d8a05c', '#c9905a', '#e8c596', '#b07a4a', '#e3b67e'],
      facts: 'Diameter 139,820 km · Day: 9.9 hours · Year: 11.9 Earth years',
      fun: 'Over 1,300 Earths could fit inside the largest planet.' },
    { name: 'Saturn', dist: 53, size: 3.6, tilt: 26.7, spin: 2.0, inc: 2.5,
      type: 'banded', colors: ['#e3cf9e', '#d9c28a', '#efe0b6', '#c9b078'],
      facts: 'Diameter 116,460 km · Day: 10.7 hours · Year: 29.5 Earth years',
      fun: 'Its rings are mostly water ice — and the planet is less dense than water.' },
    { name: 'Uranus', dist: 63, size: 2.6, tilt: 97.8, spin: 1.4, inc: 0.8,
      type: 'banded', colors: ['#9bd4d4', '#8ccaca', '#b3e0e0', '#7fbfc4'],
      facts: 'Diameter 50,724 km · Day: 17.2 hours · Year: 84 Earth years',
      fun: 'An ice giant tipped on its side — it rolls around the Sun.' },
    { name: 'Neptune', dist: 71, size: 2.5, tilt: 28.3, spin: 1.5, inc: 1.8,
      type: 'banded', colors: ['#4969e1', '#3d59c4', '#5d7df0', '#3450b4'],
      facts: 'Diameter 49,244 km · Day: 16.1 hours · Year: 165 Earth years',
      fun: 'The windiest world: gusts can top 2,000 km/h.' }
  ];

  // Earth completes one orbit in 60 s of real time at 1x speed.
  var KEPLER_K = (2 * Math.PI / 60) * Math.pow(25, 1.5);

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x04040f);
  var camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 3000);
  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  document.body.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.28));
  var sunLight = new THREE.PointLight(0xfff2cc, 1.6, 0, 2);
  scene.add(sunLight);

  // ---------- procedural textures ----------
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
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
      for (i = 0; i < 300; i++) {
        ctx.fillRect(Math.random() * 256, Math.random() * 128, 20 + Math.random() * 50, 1);
      }
    } else if (p.type === 'earth') {
      ctx.fillStyle = '#2a66c8';
      ctx.fillRect(0, 0, 256, 128);
      ctx.fillStyle = '#3f8f4f';
      for (i = 0; i < 24; i++) blob(ctx, Math.random() * 256, 16 + Math.random() * 96, 7 + Math.random() * 15);
      ctx.fillStyle = '#caa55a';
      for (i = 0; i < 8; i++) blob(ctx, Math.random() * 256, 30 + Math.random() * 68, 4 + Math.random() * 7);
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
      ctx.fillRect(0, 0, 256, 7);
      ctx.fillRect(0, 121, 256, 7);
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      for (i = 0; i < 16; i++) blob(ctx, Math.random() * 256, Math.random() * 128, 5 + Math.random() * 9);
    } else { // rocky speckle
      ctx.fillStyle = p.colors[0];
      ctx.fillRect(0, 0, 256, 128);
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

  function makeLabel(text) {
    var c = document.createElement('canvas');
    c.width = 256; c.height = 64;
    var ctx = c.getContext('2d');
    ctx.font = 'bold 30px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 32);
    var mat = new THREE.SpriteMaterial({
      map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false
    });
    var sprite = new THREE.Sprite(mat);
    sprite.scale.set(11, 2.75, 1);
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
    new THREE.MeshBasicMaterial({ color: 0xffe9a0 })
  );
  sunMesh.userData.info = SUN_INFO;
  scene.add(sunMesh);
  (function () { // glow sprite
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

    var mesh = new THREE.Mesh(
      new THREE.SphereGeometry(p.size, 40, 24),
      new THREE.MeshStandardMaterial({ map: makeTexture(p), roughness: 0.95, metalness: 0 })
    );
    mesh.userData.info = p;
    tiltGroup.add(mesh);
    clickable.push(mesh);

    var moonPivot = null;
    if (p.name === 'Saturn') {
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(p.size * 1.35, p.size * 2.1, 80),
        new THREE.MeshBasicMaterial({
          color: 0xcbb88a, side: THREE.DoubleSide, transparent: true, opacity: 0.65
        })
      );
      ring.rotation.x = Math.PI / 2;
      tiltGroup.add(ring);
    }
    if (p.name === 'Earth') {
      moonPivot = new THREE.Group();
      posGroup.add(moonPivot);
      var moon = new THREE.Mesh(
        new THREE.SphereGeometry(0.45, 20, 14),
        new THREE.MeshStandardMaterial({ color: 0xbbbbbb, roughness: 1 })
      );
      moon.position.set(3.1, 0, 0);
      moonPivot.add(moon);
    }

    var label = makeLabel(p.name);
    scene.add(label);

    return {
      p: p, posGroup: posGroup, mesh: mesh, label: label, moonPivot: moonPivot,
      angle0: Math.random() * Math.PI * 2,
      omega: KEPLER_K / Math.pow(p.dist, 1.5)
    };
  });

  // ---------- camera controls (drag-rotate / wheel-pinch zoom) ----------
  var theta = 1.25, phi = 1.05, radius = 130;
  var camTarget = new THREE.Vector3();
  var followObj = null;
  var tmpV = new THREE.Vector3();

  function updateCamera() {
    if (followObj) {
      followObj.posGroup.getWorldPosition(tmpV);
      camTarget.lerp(tmpV, 0.12);
    } else {
      camTarget.lerp(new THREE.Vector3(0, 0, 0), 0.08);
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
    radius = Math.min(600, Math.max(10, radius * (1 + e.deltaY * 0.001)));
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
      if (touchDist > 0) radius = Math.min(600, Math.max(10, radius * touchDist / d));
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

  // ---------- picking ----------
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

  function handleClick(x, y) {
    var hit = pick(x, y);
    if (!hit) {
      followObj = null;
      infoEl.classList.add('hidden');
      return;
    }
    var info = hit.userData.info;
    infoName.textContent = info.name;
    infoFacts.textContent = info.facts;
    infoFun.textContent = info.fun;
    infoEl.classList.remove('hidden');
    if (hit === sunMesh) {
      followObj = null;
      radius = Math.max(radius, 40);
    } else {
      for (var i = 0; i < planetObjs.length; i++) {
        if (planetObjs[i].mesh === hit) { followObj = planetObjs[i]; break; }
      }
      radius = Math.max(followObj.p.size * 7, 14);
    }
  }

  window.addEventListener('mousemove', function (e) {
    if (!dragging) canvas.style.cursor = pick(e.clientX, e.clientY) ? 'pointer' : 'grab';
  });

  // ---------- UI ----------
  var paused = false, speed = 1;
  var pauseBtn = document.getElementById('pauseBtn');
  pauseBtn.addEventListener('click', function () {
    paused = !paused;
    pauseBtn.textContent = paused ? '▶ Play' : '❚❚ Pause';
  });
  var speedSlider = document.getElementById('speed');
  var speedVal = document.getElementById('speedVal');
  speedSlider.addEventListener('input', function () {
    speed = parseFloat(speedSlider.value);
    speedVal.textContent = speed.toFixed(1) + '×';
  });
  document.getElementById('resetBtn').addEventListener('click', function () {
    followObj = null;
    infoEl.classList.add('hidden');
    theta = 1.25; phi = 1.05; radius = 130;
  });

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- main loop ----------
  var clock = new THREE.Clock();
  var simTime = 0;

  function animate() {
    requestAnimationFrame(animate);
    var dt = clock.getDelta();
    if (!paused) simTime += dt * speed;
    for (var i = 0; i < planetObjs.length; i++) {
      var o = planetObjs[i];
      var a = o.angle0 + o.omega * simTime;
      o.posGroup.position.set(Math.cos(a) * o.p.dist, 0, Math.sin(a) * o.p.dist);
      if (!paused) {
        o.mesh.rotation.y += o.p.spin * dt * speed;
        if (o.moonPivot) o.moonPivot.rotation.y += 1.3 * dt * speed;
      }
      o.posGroup.getWorldPosition(tmpV);
      o.label.position.set(tmpV.x, tmpV.y + o.p.size + 1.7, tmpV.z);
    }
    updateCamera();
    renderer.render(scene, camera);
  }
  animate();
})();
