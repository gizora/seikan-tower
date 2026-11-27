/* 星喚の塔 — 立体の世界の共通部分（three.js の準備・光・カメラ・ドット絵の板・ドットの質感） */
(function (root) {
  'use strict';
  const THREE = root.THREE;

  // ---------- ドットの質感（コードで描く） ----------
  const texCache = {};
  function pixelTexture(key, w, h, draw, repeat) {
    if (texCache[key]) return texCache[key];
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    draw(g, w, h);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    texCache[key] = t;
    return t;
  }
  function noiseFill(g, w, h, cols, seed) {
    let s = seed || 7;
    const r = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648; };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { g.fillStyle = cols[Math.floor(r() * cols.length)]; g.fillRect(x, y, 1, 1); }
  }
  const TEX = {
    grass: () => pixelTexture('grass', 16, 16, (g, w, h) => { noiseFill(g, w, h, ['#4a6a34', '#527a3a', '#466430', '#5a823e', '#3e5a2c'], 3); }),
    dirt: () => pixelTexture('dirt', 16, 16, (g, w, h) => { noiseFill(g, w, h, ['#7a6244', '#6e583c', '#846a4a', '#665036'], 5); }),
    sand: () => pixelTexture('sand', 16, 16, (g, w, h) => { noiseFill(g, w, h, ['#b89a64', '#a88c5a', '#c4a670', '#9c8250'], 9); }),
    stone: () => pixelTexture('stone', 16, 16, (g) => {
      noiseFill(g, 16, 16, ['#7a7686', '#726e7e', '#827e8e', '#6a6676'], 11);
      g.fillStyle = '#4e4a5a';
      for (let y = 0; y < 16; y += 4) { g.fillRect(0, y, 16, 1); for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) g.fillRect(x, y, 1, 4); }
    }),
    brick: () => pixelTexture('brick', 16, 16, (g) => {
      noiseFill(g, 16, 16, ['#8a5a44', '#7e523e', '#94624a', '#744a38'], 13);
      g.fillStyle = '#4a3028';
      for (let y = 0; y < 16; y += 4) { g.fillRect(0, y, 16, 1); for (let x = (y / 4) % 2 ? 4 : 0; x < 16; x += 8) g.fillRect(x, y, 1, 4); }
    }),
    wood: () => pixelTexture('wood', 16, 16, (g) => {
      noiseFill(g, 16, 16, ['#7a5236', '#704a30', '#84593a', '#6a442c'], 17);
      g.fillStyle = '#4a2e1c'; for (let x = 0; x < 16; x += 4) g.fillRect(x, 0, 1, 16);
    }),
    plaster: () => pixelTexture('plaster', 16, 16, (g) => { noiseFill(g, 16, 16, ['#d8ccb4', '#d0c4aa', '#ded2bc', '#c8bca4'], 19); g.fillStyle = '#6a4a30'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 15, 16, 1); g.fillRect(0, 0, 1, 16); g.fillRect(15, 0, 1, 16); }),
    roofRed: () => pixelTexture('roofRed', 16, 16, (g) => { noiseFill(g, 16, 16, ['#8a3a32', '#7e342c', '#96423a', '#722e28'], 23); g.fillStyle = '#4a1e1a'; for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 16, 1); }),
    roofBlue: () => pixelTexture('roofBlue', 16, 16, (g) => { noiseFill(g, 16, 16, ['#3a4a6a', '#34445e', '#405474', '#2e3c56'], 29); g.fillStyle = '#1e2638'; for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 16, 1); }),
    roofSlate: () => pixelTexture('roofSlate', 16, 16, (g) => { noiseFill(g, 16, 16, ['#4a4a52', '#42424a', '#52525a', '#3a3a42'], 31); g.fillStyle = '#26262c'; for (let y = 0; y < 16; y += 3) g.fillRect(0, y, 16, 1); }),
    marble: () => pixelTexture('marble', 16, 16, (g) => { noiseFill(g, 16, 16, ['#e4e0ec', '#dcd8e4', '#ece8f4', '#d4d0dc'], 37); }),
    rock: (tone) => pixelTexture('rock' + tone, 16, 16, (g) => { noiseFill(g, 16, 16, tone, 41); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let i = 0; i < 6; i++) g.fillRect((i * 5) % 16, (i * 7) % 16, 3, 1); }),
    floor: (tone) => pixelTexture('floor' + tone.join(), 16, 16, (g) => { noiseFill(g, 16, 16, tone, 43); g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 16, 1); g.fillRect(0, 0, 1, 16); }),
    water: () => pixelTexture('water', 16, 16, (g) => { noiseFill(g, 16, 16, ['#2a6a9a', '#2e72a4', '#26628e', '#3a82b4'], 47); g.fillStyle = '#7ac0e8'; g.fillRect(3, 5, 4, 1); g.fillRect(10, 11, 3, 1); }),
  };

  function mat(tex, opts) { return new THREE.MeshLambertMaterial(Object.assign({ map: tex }, opts || {})); }

  // ---------- ドット絵の板（いつもカメラの方を向く） ----------
  const spriteTex = new WeakMap();
  function canvasTexture(canvas) {
    let t = spriteTex.get(canvas);
    if (t) return t;
    t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    if ('colorSpace' in t) t.colorSpace = THREE.SRGBColorSpace; else t.encoding = THREE.sRGBEncoding;
    spriteTex.set(canvas, t);
    return t;
  }
  /** 足もとを原点にした板。w, h は世界の大きさ */
  function makeBillboard(canvas, w, h) {
    const geo = new THREE.PlaneGeometry(w, h);
    geo.translate(0, h / 2, 0);
    const material = new THREE.MeshLambertMaterial({ map: canvasTexture(canvas), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide });
    const m = new THREE.Mesh(geo, material);
    m.castShadow = true;
    m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: material.map, alphaTest: 0.5 });
    m.userData.billboard = true;
    return m;
  }
  function setBillboardCanvas(mesh, canvas, flip) {
    const t = canvasTexture(canvas);
    if (mesh.material.map !== t) { mesh.material.map = t; mesh.material.needsUpdate = true; mesh.customDepthMaterial.map = t; mesh.customDepthMaterial.needsUpdate = true; }
    mesh.scale.x = flip ? -Math.abs(mesh.scale.x) : Math.abs(mesh.scale.x);
  }
  /** 小さなアイコン（頭の上に出す） */
  function iconSprite(text, color, size) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(10,8,20,0.8)'; g.beginPath(); g.arc(16, 16, 14, 0, Math.PI * 2); g.fill();
    g.strokeStyle = color || '#ffd040'; g.lineWidth = 2; g.stroke();
    g.fillStyle = color || '#ffd040'; g.font = 'bold 20px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 16, 17);
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter; t.generateMipmaps = false;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true }));
    s.scale.set(size || 0.6, size || 0.6, 1);
    s.renderOrder = 10;
    return s;
  }
  function blobShadow(r) {
    const c = document.createElement('canvas');
    c.width = 32; c.height = 32;
    const g = c.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 2, 16, 16, 15);
    grd.addColorStop(0, 'rgba(0,0,0,0.55)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.02;
    return m;
  }

  // ---------- 世界（描く道具一式） ----------
  /**
   * container の中にキャンバスを作り、three.js の描画を準備する
   * opts: { fov, bloom, tilt, onTap(hitInfo), onDrag }
   */
  function createWorld(container, opts) {
    opts = opts || {};
    const canvas = document.createElement('canvas');
    canvas.className = 'w3d';
    container.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(2, root.devicePixelRatio || 1));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace; else renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(opts.fov || 32, 1, 0.5, 400);
    const cam = { target: new THREE.Vector3(0, 0, 0), dist: opts.dist || 26, az: opts.az || 0.6, pol: opts.pol || 0.95, minDist: opts.minDist || 10, maxDist: opts.maxDist || 48, bounds: opts.bounds || 30, follow: null };
    // 光
    const hemi = new THREE.HemisphereLight(0xbcc8ff, 0x3a2a24, 0.55);
    scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe2b0, 1.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = opts.shadowSize || 26;
    Object.assign(sun.shadow.camera, { left: -sc, right: sc, top: sc, bottom: -sc, near: 1, far: 120 });
    sun.shadow.bias = -0.0008;
    scene.add(sun); scene.add(sun.target);
    // 後から加える効果（光のにじみ・ミニチュア風のぼかし・周辺の暗さ）
    let composer = null, bloom = null, hTilt = null, vTilt = null;
    if (opts.post !== false && THREE.EffectComposer) {
      composer = new THREE.EffectComposer(renderer);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(256, 256), opts.bloom || 0.55, 0.45, 0.72);
      composer.addPass(bloom);
      if (opts.tilt !== false) {
        hTilt = new THREE.ShaderPass(THREE.HorizontalTiltShiftShader);
        vTilt = new THREE.ShaderPass(THREE.VerticalTiltShiftShader);
        hTilt.uniforms.r.value = vTilt.uniforms.r.value = 0.5;
        composer.addPass(hTilt); composer.addPass(vTilt);
      }
      const vig = new THREE.ShaderPass(THREE.VignetteShader);
      vig.uniforms.offset.value = 0.95; vig.uniforms.darkness.value = 1.15;
      composer.addPass(vig);
    }

    function updateCamera() {
      if (cam.follow) cam.target.lerp(cam.follow(), 0.12);
      const r = cam.dist * (cam.aspectK || 1);
      camera.position.set(cam.target.x + Math.sin(cam.az) * Math.sin(cam.pol) * r, cam.target.y + Math.cos(cam.pol) * r, cam.target.z + Math.cos(cam.az) * Math.sin(cam.pol) * r);
      camera.lookAt(cam.target);
      sun.target.position.copy(cam.target);
      sun.position.set(cam.target.x + sunDir.x * 40, cam.target.y + sunDir.y * 40, cam.target.z + sunDir.z * 40);
    }
    const sunDir = new THREE.Vector3(-0.5, 0.8, 0.35).normalize();

    // 時間帯（現実の時計に合わせる）: 昼・夕方・夜
    function setTimeOfDay(hour, extra) {
      const h = hour == null ? new Date().getHours() + new Date().getMinutes() / 60 : hour;
      let k;                 // 0 夜 〜 1 昼
      if (h >= 7 && h < 17) k = 1; else if (h >= 5 && h < 7) k = (h - 5) / 2; else if (h >= 17 && h < 19) k = 1 - (h - 17) / 2; else k = 0;
      const dusk = (h >= 16 && h < 19) || (h >= 5 && h < 7);
      const day = new THREE.Color(0xfff0d8), duskC = new THREE.Color(0xffa060), night = new THREE.Color(0x8a9ae8);
      const c = night.clone().lerp(dusk ? duskC : day, k);
      sun.color.copy(c);
      sun.intensity = 0.8 + 0.6 * k;
      hemi.intensity = 0.75 + 0.15 * k;
      hemi.color.set(k > 0.5 ? 0xbcc8ff : 0x8a96d8);
      const sky = new THREE.Color(0x0c0a1e).lerp(new THREE.Color(dusk ? 0x5a3a5a : 0x3a4a7a), k);
      scene.background = sky;
      scene.fog = new THREE.Fog(sky, cam.dist * 1.6, cam.dist * 4);
      sunDir.set(-0.5, 0.45 + 0.4 * k, 0.35).normalize();
      if (bloom) bloom.strength = (opts.bloom || 0.55) + (1 - k) * 0.35;
      world.night = 1 - k;
      if (extra) extra(world.night);
    }

    function resize() {
      const w = container.clientWidth || 360, h = container.clientHeight || 640;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      // 縦長の画面では引いて、広く見えるようにする
      cam.aspectK = w / h < 1 ? Math.min(1.9, 1 / Math.max(0.45, w / h) * 0.95) : 1;
      camera.updateProjectionMatrix();
      if (composer) { composer.setSize(w, h); if (hTilt) { hTilt.uniforms.h.value = 0.9 / w; vTilt.uniforms.v.value = 0.9 / h; } }
    }

    // 操作: ドラッグで移動・ピンチ/ホイールで拡大・2本指でひねって回転。動かさずに離したらタップ
    const pointers = new Map();
    let downAt = null, moved = false, lastPinch = 0, lastAngle = 0;
    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    function groundAt(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const t = -raycaster.ray.origin.y / raycaster.ray.direction.y;
      if (!(t > 0)) return null;
      return raycaster.ray.origin.clone().addScaledVector(raycaster.ray.direction, t);
    }
    function pick(clientX, clientY, objects) {
      const r = canvas.getBoundingClientRect();
      ndc.set((clientX - r.left) / r.width * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      return raycaster.intersectObjects(objects, true);
    }
    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* つかめない指（テストの合成イベントなど）は無視 */ }
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now(), button: e.button, shift: e.shiftKey }; moved = false; }
      if (pointers.size === 2) { const [a, b] = [...pointers.values()]; lastPinch = Math.hypot(a.x - b.x, a.y - b.y); lastAngle = Math.atan2(b.y - a.y, b.x - a.x); moved = true; }
    });
    canvas.addEventListener('pointermove', (e) => {
      const p = pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (pointers.size === 1) {
        if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) moved = true;
        if (!moved) return;
        if (downAt.button === 2 || downAt.shift) { cam.az -= dx * 0.008; cam.pol = Math.max(0.55, Math.min(1.25, cam.pol - dy * 0.005)); }
        else {
          cam.follow = null;
          const s = cam.dist / 520;
          const ca = Math.cos(cam.az), sa = Math.sin(cam.az);
          // 横に動かすと右方向へ、縦に動かすと奥行き方向へ（カメラの向きに合わせる）
          cam.target.x += -ca * dx * s - sa * dy * s;
          cam.target.z += sa * dx * s - ca * dy * s;
          if (opts.clamp) opts.clamp(cam.target);
          else { const len = Math.hypot(cam.target.x, cam.target.z); if (len > cam.bounds) { cam.target.x *= cam.bounds / len; cam.target.z *= cam.bounds / len; } }
        }
      } else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        if (lastPinch) cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, cam.dist * lastPinch / d));
        cam.az -= (ang - lastAngle);
        lastPinch = d; lastAngle = ang;
      }
    });
    const up = (e) => {
      const wasSingle = pointers.size === 1;
      pointers.delete(e.pointerId);
      if (wasSingle && downAt && !moved && opts.onTap) opts.onTap({ x: e.clientX, y: e.clientY, pick: (objs) => pick(e.clientX, e.clientY, objs), ground: () => groundAt(e.clientX, e.clientY) });
      if (!pointers.size) { downAt = null; lastPinch = 0; }
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', (e) => { pointers.delete(e.pointerId); downAt = null; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, cam.dist * (e.deltaY > 0 ? 1.1 : 0.9))); }, { passive: false });

    let raf = 0, running = false, last = 0;
    const world = {
      THREE, canvas, renderer, scene, camera, cam, sun, hemi, night: 0, onFrame: null,
      resize, setTimeOfDay, groundAt, pick, updateCamera,
      start() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
      stop() { running = false; cancelAnimationFrame(raf); },
      render() { updateCamera(); if (composer) composer.render(); else renderer.render(scene, camera); },
      /** 3D の位置 → 画面の位置（CSS ピクセル） */
      toScreen(v) {
        const p = v.clone().project(camera);
        const r = canvas.getBoundingClientRect();
        return { x: r.left + (p.x + 1) / 2 * r.width, y: r.top + (1 - p.y) / 2 * r.height, visible: p.z < 1 };
      },
      rotate(d) { cam.az += d; },
      zoom(f) { cam.dist = Math.max(cam.minDist, Math.min(cam.maxDist, cam.dist * f)); },
      dispose() { this.stop(); renderer.dispose(); canvas.remove(); },
    };
    function loop(now) {
      if (!running) return;
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (world.onFrame) world.onFrame(dt);
      world.render();
      raf = requestAnimationFrame(loop);
    }
    resize();
    setTimeOfDay();
    updateCamera();
    root.addEventListener('resize', resize);
    return world;
  }

  // ---------- pixelfx のエフェクトを板にする ----------
  function fxBillboard(name, o) {
    o = o || {};
    const P = root.PixelFX;
    if (!P || !P.list.includes(name)) return null;
    const mod = P.fx[name];
    const meta = mod.meta || {};
    const size = meta.size || [64, 64];
    const origin = meta.origin || [size[0] / 2, size[1] / 2];
    const fx = P.core.createFx(mod, Object.assign({ x: origin[0], y: origin[1], seed: Math.floor(Math.random() * 1000) }, o.fx || {}));
    const frame = P.core.createFrame(size[0], size[1]);
    const c = document.createElement('canvas'); c.width = size[0]; c.height = size[1];
    const g = c.getContext('2d');
    const img = g.createImageData(size[0], size[1]);
    const tex = new THREE.CanvasTexture(c);
    tex.magFilter = THREE.NearestFilter; tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
    const sc = o.scale || (1 / 16);
    const geo = new THREE.PlaneGeometry(size[0] * sc, size[1] * sc);
    geo.translate((size[0] / 2 - origin[0]) * sc, (origin[1] - size[1] / 2) * sc, 0);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide }));
    mesh.renderOrder = 5;
    mesh.userData.billboard = true;
    let acc = 0;
    const draw = () => {
      P.core.clearFrame(frame);
      fx.draw(frame, 'back'); fx.draw(frame, 'front');
      img.data.fill(0);
      P.core.composite(frame, img.data, null);
      g.putImageData(img, 0, 0);
      tex.needsUpdate = true;
    };
    draw();
    return {
      mesh, loop: !!meta.loop,
      update(dt) { fx.update(dt); acc += dt; if (acc > 1 / 24) { acc = 0; draw(); } },
      done() { return !meta.loop && typeof fx.done === 'function' && fx.done(); },
      dispose() { geo.dispose(); mesh.material.dispose(); tex.dispose(); },
    };
  }

  /** 箱の形（テクスチャが伸びないように、面の大きさに合わせて模様をくり返す） */
  function boxGeo(w, h, d, density) {
    const g = new THREE.BoxGeometry(w, h, d);
    const k = density || 2;
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) for (let i = 0; i < 4; i++) { const idx = f * 4 + i; uv.setXY(idx, uv.getX(idx) * dims[f][0] * k, uv.getY(idx) * dims[f][1] * k); }
    uv.needsUpdate = true;
    return g;
  }

  root.W3 = { createWorld, fxBillboard, boxGeo, TEX, mat, makeBillboard, setBillboardCanvas, canvasTexture, iconSprite, blobShadow, pixelTexture };
})(window);
