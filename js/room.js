/* 星喚の塔 — 待機室（城壁に囲まれた敷地を立体で描く。英雄はドット絵の板で、自分の考えで暮らしている） */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const W3 = root.W3;
  const S = root.Sprites;
  const D = root.GameData;

  const WALL_R = 15.5;
  const PLOTS = {
    gate:     { x: 0,    z: -13.4 },
    plaza:    { x: 0,    z: 0 },
    fusion:   { x: -7.6, z: -7.4 },
    armory:   { x: 7.6,  z: -7.4 },
    dorm:     { x: -10.2, z: 1.2 },
    alchemy:  { x: 10.2, z: 1.2 },
    training: { x: -6.4, z: 8.6 },
    strategy: { x: 6.6,  z: 8.6 },
  };
  const MEMORIAL = { x: 3.2, z: -4.4 };
  const HERO_W = 1.0, HERO_H = 2.0;

  let world = null, opts = null, container = null;
  const plotGroups = {};
  let heroes = {};               // id → { mesh, shadow, icon, x, z, tx, tz, state, t, face, anim }
  let levels = {};
  let fxList = [];
  let memorialGroup = null;
  let t = 0;
  let portalTex = null, portalCanvas = null, waterTex = null;
  const lights = [];

  const rnd = (a, b) => a + Math.random() * (b - a);
  const M = {};
  function mats() {
    if (M.stone) return M;
    const T = W3.TEX;
    M.stone = W3.mat(T.stone()); M.brick = W3.mat(T.brick()); M.wood = W3.mat(T.wood()); M.plaster = W3.mat(T.plaster());
    M.roofRed = W3.mat(T.roofRed()); M.roofBlue = W3.mat(T.roofBlue()); M.roofSlate = W3.mat(T.roofSlate()); M.marble = W3.mat(T.marble());
    M.dirt = W3.mat(T.dirt()); M.sand = W3.mat(T.sand()); M.grass = W3.mat(T.grass());
    M.window = new THREE.MeshBasicMaterial({ color: 0xffc860 });
    M.dark = new THREE.MeshLambertMaterial({ color: 0x1a1218 });
    M.gold = new THREE.MeshLambertMaterial({ color: 0xd4a640, emissive: 0x3a2a00 });
    M.straw = new THREE.MeshLambertMaterial({ color: 0xd8b870 });
    M.red = new THREE.MeshLambertMaterial({ color: 0xa83a3a });
    M.metal = new THREE.MeshLambertMaterial({ color: 0x9aa2b4 });
    return M;
  }
  function box(w, h, d, m, x, y, z) {
    const mesh = new THREE.Mesh(W3.boxGeo(w, h, d), m);
    mesh.position.set(x || 0, (y || 0) + h / 2, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function cyl(rt, rb, h, m, x, y, z, seg) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 12), m);
    mesh.position.set(x || 0, (y || 0) + h / 2, z || 0);
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  /** 切妻屋根（三角の屋根）。w は横幅、d は奥行き、rh は高さ */
  function gable(w, d, rh, m, y) {
    const shape = new THREE.Shape();
    shape.moveTo(-w / 2 - 0.25, 0); shape.lineTo(w / 2 + 0.25, 0); shape.lineTo(0, rh); shape.lineTo(-w / 2 - 0.25, 0);
    const g = new THREE.ExtrudeGeometry(shape, { depth: d + 0.5, bevelEnabled: false });
    g.translate(0, 0, -(d + 0.5) / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 0.6, uv.getY(i) * 0.6);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.y = y;
    mesh.castShadow = true; mesh.receiveShadow = true;
    return mesh;
  }
  function pyramid(r, h, m, y) {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(r, h, 4), m);
    mesh.rotation.y = Math.PI / 4;
    mesh.position.y = y + h / 2;
    mesh.castShadow = true;
    return mesh;
  }
  function windowAt(g, x, y, z, ry) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.55), M.window);
    w.position.set(x, y, z); w.rotation.y = ry || 0;
    w.userData.window = true;
    g.add(w);
  }
  function addLight(g, color, x, y, z, dist, intensity) {
    if (lights.length > 9) return null;
    const l = new THREE.PointLight(color, intensity || 1.2, dist || 6, 2);
    l.position.set(x, y, z);
    l.userData.base = intensity || 1.2;
    g.add(l);
    lights.push(l);
    return l;
  }
  function addFx(name, x, y, z, scale, parent) {
    const f = W3.fxBillboard(name, { scale: scale || 1 / 18 });
    if (!f) return null;
    f.mesh.position.set(x, y, z);
    (parent || world.scene).add(f.mesh);
    fxList.push(f);
    return f;
  }

  // ---------- 地面・城壁・道 ----------
  function buildGround() {
    const s = world.scene;
    const outer = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshLambertMaterial({ color: 0x2a2a30 }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.05; outer.receiveShadow = true;
    s.add(outer);
    const gtex = W3.TEX.grass().clone(); gtex.needsUpdate = true; gtex.repeat.set(30, 30);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(WALL_R, 64), new THREE.MeshLambertMaterial({ map: gtex }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
    s.add(ground);
    // 石畳の道（広場から各区画へ）
    const ptex = W3.TEX.stone().clone(); ptex.needsUpdate = true;
    for (const [k, p] of Object.entries(PLOTS)) {
      if (k === 'plaza') continue;
      const len = Math.hypot(p.x, p.z);
      const tx = ptex.clone(); tx.needsUpdate = true; tx.repeat.set(1.2, len * 1.2);
      const road = new THREE.Mesh(new THREE.PlaneGeometry(1.4, len), new THREE.MeshLambertMaterial({ map: tx }));
      road.rotation.x = -Math.PI / 2; road.rotation.z = Math.atan2(p.x, p.z);
      road.position.set(p.x / 2, 0.015, p.z / 2);
      road.receiveShadow = true;
      s.add(road);
    }
    // 城壁（ぐるりと一周。北に次元の門のすき間）
    const segs = 56;
    for (let i = 0; i < segs; i++) {
      const a = i / segs * Math.PI * 2;
      const x = Math.sin(a) * WALL_R, z = -Math.cos(a) * WALL_R;
      if (Math.abs(x) < 2.6 && z < 0) continue;
      const seg = box(1.9, 2.2, 0.9, M.stone, 0, 0, 0);
      seg.position.set(x, 1.1, z);
      seg.rotation.y = -a;
      s.add(seg);
      if (i % 2 === 0) { const c = box(0.55, 0.5, 0.95, M.stone); c.position.set(x, 2.45, z); c.rotation.y = -a; s.add(c); }
      if (i % 14 === 7) { const tw = cyl(1.1, 1.2, 3.6, M.stone, x, 0, z, 8); s.add(tw); const tr = new THREE.Mesh(new THREE.ConeGeometry(1.4, 1.4, 8), M.roofSlate); tr.position.set(x, 4.3, z); tr.castShadow = true; s.add(tr); }
    }
    // 遠くの塔（世界の中心にそびえる）
    const tower = cyl(2.2, 3, 40, new THREE.MeshLambertMaterial({ color: 0x1a1628 }), 0, 0, -48, 8);
    s.add(tower);
    const tl = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffe9a8 }));
    tl.position.set(0, 41, -48); s.add(tl);
  }

  // ---------- 施設（レベルで大きく立派になる） ----------
  function buildPlot(key, lv) {
    const g = new THREE.Group();
    const p = PLOTS[key];
    g.position.set(p.x, 0, p.z);
    g.rotation.y = Math.atan2(-p.x, -p.z);            // 広場の方を向く
    if (key === 'gate') g.rotation.y = 0;
    if (lv <= 0) {
      const lot = box(4, 0.06, 4, M.dirt); g.add(lot);
      for (const [x, z] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) g.add(box(0.12, 0.8, 0.12, M.wood, x, 0, z));
      const sign = box(1, 0.6, 0.08, M.wood, 0, 0.7, 1.9); g.add(sign); g.add(box(0.1, 0.7, 0.1, M.wood, 0, 0, 1.9));
    } else {
      const k = 0.85 + lv * 0.08;
      if (key === 'gate') {
        const h = 4.2 + lv * 0.5;
        g.add(box(1.2, h, 1.4, M.stone, -2.3, 0, 0)); g.add(box(1.2, h, 1.4, M.stone, 2.3, 0, 0));
        const arch = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.6, 6, 12, Math.PI), M.stone);
        arch.position.y = h; arch.castShadow = true; g.add(arch);
        portalCanvas = document.createElement('canvas'); portalCanvas.width = portalCanvas.height = 32;
        portalTex = new THREE.CanvasTexture(portalCanvas); portalTex.magFilter = THREE.NearestFilter; portalTex.minFilter = THREE.NearestFilter;
        const portal = new THREE.Mesh(new THREE.CircleGeometry(1.8, 24), new THREE.MeshBasicMaterial({ map: portalTex, transparent: true }));
        portal.scale.y = (h + 1) / 3.8; portal.position.set(0, (h + 1.2) / 2, 0.1);
        portal.userData.portal = true;
        g.add(portal);
        addLight(g, 0xa070ff, 0, h / 2, 1.5, 9, 2.2);
        if (lv >= 2) { g.add(box(0.5, 1.1, 0.5, M.stone, -3.6, 0, 1.4)); g.add(box(0.5, 1.1, 0.5, M.stone, 3.6, 0, 1.4)); }
        if (lv >= 2) { addFx('fire/torch', p.x - 3.6, 1.0, p.z + 1.4, 1 / 48); addFx('fire/torch', p.x + 3.6, 1.0, p.z + 1.4, 1 / 48); addLight(world.scene, 0xff9a40, p.x, 2, p.z + 2, 7, 1.4); }
      } else if (key === 'plaza') {
        const ring = cyl(1.8 * k, 2 * k, 0.5, M.stone); g.add(ring);
        waterTex = W3.TEX.water().clone(); waterTex.needsUpdate = true; waterTex.repeat.set(3, 3);
        const water = new THREE.Mesh(new THREE.CircleGeometry(1.6 * k, 20), new THREE.MeshLambertMaterial({ map: waterTex, emissive: 0x0a2030 }));
        water.rotation.x = -Math.PI / 2; water.position.y = 0.45; g.add(water);
        g.add(cyl(0.25, 0.35, 1.6 + lv * 0.2, M.marble));
        g.add(cyl(0.7, 0.5, 0.2, M.marble, 0, 1.6 + lv * 0.2, 0));
        for (let i = 0; i < Math.min(4, lv + 1); i++) {
          const a = i / 4 * Math.PI * 2 + Math.PI / 4;
          const bx = Math.sin(a) * 3.6, bz = Math.cos(a) * 3.6;
          const bench = box(1.4, 0.4, 0.5, M.wood, bx, 0, bz); bench.rotation.y = a; g.add(bench);
        }
        for (const [x, z] of [[-3.2, -3.2], [3.2, 3.2]]) { g.add(cyl(0.08, 0.1, 2.4, M.dark, x, 0, z, 6)); const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.35), M.window); lamp.position.set(x, 2.5, z); lamp.userData.window = true; g.add(lamp); }
        addLight(g, 0xffc070, -3.2, 2.6, -3.2, 7, 1.1);
      } else if (key === 'dorm') {
        const w = 4.2 * k, d = 3.2, h = 2.2 + lv * 0.45;
        g.add(box(w, h, d, M.plaster));
        g.add(gable(w, d, 1.6 + lv * 0.15, M.roofRed, h));
        g.add(box(0.7, 1.3, 0.1, M.wood, 0, 0, d / 2 + 0.02));
        for (let i = 0; i < 2 + (lv >= 3 ? 1 : 0); i++) windowAt(g, -w / 2 + 0.8 + i * (w - 1.6) / Math.max(1, 1 + (lv >= 3 ? 1 : 0)), h * 0.6, d / 2 + 0.03);
        if (lv >= 3) { windowAt(g, -w / 4, h * 0.6, -d / 2 - 0.03, Math.PI); }
        if (lv >= 4) g.add(box(0.5, 1.4, 0.5, M.brick, w / 2 - 0.6, h + 0.3, 0));
      } else if (key === 'training') {
        g.add(box(5 * k, 0.05, 4.4 * k, M.sand));
        const n = Math.min(lv + 1, 5);
        for (let i = 0; i < n; i++) {
          const x = -1.8 * k + i * (3.6 * k / Math.max(1, n - 1)), z = (i % 2 ? 0.8 : -0.6);
          g.add(box(0.14, 1.6, 0.14, M.wood, x, 0, z));
          g.add(box(0.9, 0.12, 0.12, M.wood, x, 1.2, z));
          g.add(cyl(0.28, 0.32, 0.8, M.straw, x, 0.75, z, 8));
        }
        g.add(box(2, 1.4, 0.2, M.wood, 0, 0, -2 * k));
        if (lv >= 2) { const tg = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.12, 16), M.red); tg.rotation.x = Math.PI / 2; tg.position.set(2.2 * k, 1.1, -1.6 * k); g.add(tg); }
      } else if (key === 'strategy') {
        const w = 3.2 * k, h = 3 + lv * 0.6;
        g.add(box(w, h, w, M.brick));
        g.add(pyramid(w * 0.82, 2 + lv * 0.25, M.roofBlue, h));
        g.add(box(0.7, 1.3, 0.1, M.wood, 0, 0, w / 2 + 0.02));
        windowAt(g, -w / 4, h * 0.65, w / 2 + 0.03); windowAt(g, w / 4, h * 0.65, w / 2 + 0.03);
        const pole = box(0.08, 2, 0.08, M.dark, 0, h + 2 + lv * 0.25 - 0.5, 0); g.add(pole);
        const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.55), new THREE.MeshLambertMaterial({ color: 0xa83a3a, side: THREE.DoubleSide }));
        flag.position.set(0.45, h + 2 + lv * 0.25 + 1.2, 0); flag.userData.flag = true; g.add(flag);
      } else if (key === 'fusion') {
        const r = 1.6 * k, h = 2.2 + lv * 0.4;
        g.add(cyl(r, r, h, M.marble, 0, 0, 0, 16));
        const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a7ad8 }));
        dome.position.y = h; dome.castShadow = true; g.add(dome);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; g.add(cyl(0.16, 0.16, h, M.marble, Math.sin(a) * (r + 0.4), 0, Math.cos(a) * (r + 0.4), 6)); }
        addLight(g, 0xc8a8ff, 0, h * 0.5, r + 0.8, 5, 0.9);
        if (lv >= 2) addFx('arcane/rune-circle', p.x, 0.1, p.z, 1 / 22) || addFx('arcane/magic-circle-cast', p.x, 0.2, p.z, 1 / 22);
      } else if (key === 'armory') {
        const w = 3.8 * k, d = 3, h = 2.2 + lv * 0.35;
        g.add(box(w, h, d, M.stone));
        g.add(gable(w, d, 1.4, M.roofSlate, h));
        g.add(box(0.6, 2.4 + lv * 0.3, 0.6, M.brick, w / 2 - 0.5, h, -0.6));
        g.add(box(0.9, 1.4, 0.1, M.dark, -0.6, 0, d / 2 + 0.02));
        g.add(box(0.8, 0.6, 0.4, M.metal, 1, 0, d / 2 + 0.8));
        addLight(g, 0xff7a30, 0.3, 0.8, d / 2 + 0.8, 5, 1.3);
        { const f = Math.atan2(-p.x, -p.z); addFx('fire/campfire', p.x + Math.sin(f) * 2.4 + Math.cos(f) * 1.2, 0.02, p.z + Math.cos(f) * 2.4 - Math.sin(f) * 1.2, 1 / 44); }
      } else if (key === 'alchemy') {
        const w = 3.2 * k, h = 2 + lv * 0.35;
        g.add(box(w, h, w, M.wood));
        g.add(pyramid(w * 0.8, 2.2 + lv * 0.2, new THREE.MeshLambertMaterial({ color: 0x3a5a4a }), h));
        g.add(box(0.7, 1.2, 0.1, M.dark, 0, 0, w / 2 + 0.02));
        const pot = cyl(0.55, 0.45, 0.6, M.dark, 1.3, 0, w / 2 + 0.9, 10); g.add(pot);
        const brew = new THREE.Mesh(new THREE.CircleGeometry(0.48, 12), new THREE.MeshBasicMaterial({ color: 0x5ad08a }));
        brew.rotation.x = -Math.PI / 2; brew.position.set(1.3, 0.62, w / 2 + 0.9); g.add(brew);
        addLight(g, 0x5ad08a, 1.3, 1, w / 2 + 0.9, 4, 1.1);
      }
    }
    g.traverse(o => { o.userData.key = key; });
    return g;
  }

  function buildMemorial() {
    if (memorialGroup) world.scene.remove(memorialGroup);
    memorialGroup = new THREE.Group();
    memorialGroup.position.set(MEMORIAL.x, 0, MEMORIAL.z);
    memorialGroup.add(box(0.9, 1.3, 0.35, M.stone));
    memorialGroup.add(box(1.3, 0.2, 0.7, M.stone));
    memorialGroup.traverse(o => { o.userData.key = 'memorial'; });
    world.scene.add(memorialGroup);
  }

  function rebuildPlots(newLevels, fallenCount) {
    for (const f of fxList) { world.scene.remove(f.mesh); if (f.mesh.parent) f.mesh.parent.remove(f.mesh); f.dispose(); }
    fxList = [];
    lights.length = 0;
    for (const k of Object.keys(plotGroups)) { world.scene.remove(plotGroups[k]); delete plotGroups[k]; }
    for (const k of Object.keys(PLOTS)) { plotGroups[k] = buildPlot(k, newLevels[k] || 0); world.scene.add(plotGroups[k]); }
    if (fallenCount > 0) buildMemorial(); else if (memorialGroup) { world.scene.remove(memorialGroup); memorialGroup = null; }
    levels = Object.assign({}, newLevels);
  }

  // ---------- 英雄 ----------
  function spotFor(h, info) {
    const p = PLOTS;
    if (info.quarrel) { const o = heroes[info.quarrel]; if (o) return { x: (h.x + o.x) / 2 + (h.x < o.x ? -0.6 : 0.6), z: (h.z + o.z) / 2 }; }
    switch (info.activity) {
      case 'train': return (levels.training > 0) ? { x: p.training.x + rnd(-2, 2), z: p.training.z + rnd(-0.5, 2.6), act: 'train' } : null;
      case 'social': { const a = rnd(0, Math.PI * 2); return { x: Math.sin(a) * rnd(2.4, 3.6), z: Math.cos(a) * rnd(2.4, 3.6), act: 'social' }; }
      case 'rest': { const f = Math.atan2(-p.dorm.x, -p.dorm.z); return { x: p.dorm.x + Math.sin(f) * 2.4 + rnd(-1, 1), z: p.dorm.z + Math.cos(f) * 2.4 + rnd(-1, 1), act: 'rest' }; }
      default: { const a = rnd(0, Math.PI * 2), r = rnd(4, 11); return { x: Math.sin(a) * r, z: Math.cos(a) * r, act: 'wander' }; }
    }
  }

  function makeHero(id) {
    const mesh = W3.makeBillboard(S.heroCanvas(id, 'idle0'), HERO_W, HERO_H);
    mesh.userData.heroId = id;
    const shadow = W3.blobShadow(0.45);
    world.scene.add(mesh); world.scene.add(shadow);
    const a = rnd(0, Math.PI * 2), r = rnd(3, 9);
    return { id, mesh, shadow, icon: null, iconKey: '', x: Math.sin(a) * r, z: Math.cos(a) * r, tx: null, tz: null, act: 'wander', wait: rnd(0, 2), face: 1, phase: Math.random() * 4, moving: false, alpha: 1 };
  }

  function setIcon(h, key) {
    if (h.iconKey === key) return;
    if (h.icon) { world.scene.remove(h.icon); h.icon = null; }
    h.iconKey = key;
    if (!key) return;
    const spec = { proposal: ['!', '#ffd040'], quarrel: ['怒', '#ff5a5a'], injured: ['✚', '#ff8a8a'], train: ['剣', '#e8e8f0'], rest: ['Z', '#a8c8ff'], social: ['…', '#ffffff'] }[key];
    if (!spec) return;
    h.icon = W3.iconSprite(spec[0], spec[1], key === 'proposal' || key === 'quarrel' ? 0.7 : 0.5);
    world.scene.add(h.icon);
  }

  function sync() {
    const lv = {};
    for (const b of opts.getBuildings()) lv[b.key] = b.lv;
    const fallen = opts.fallenCount();
    const key = JSON.stringify(lv) + ':' + (fallen > 0);
    if (key !== sync.key) { sync.key = key; rebuildPlots(lv, fallen); }
    const list = opts.getHeroes();
    const ids = new Set(list.map(x => x.id));
    for (const id of Object.keys(heroes)) if (!ids.has(id)) { const h = heroes[id]; world.scene.remove(h.mesh); world.scene.remove(h.shadow); if (h.icon) world.scene.remove(h.icon); delete heroes[id]; }
    for (const info of list) {
      if (!heroes[info.id]) {
        heroes[info.id] = makeHero(info.id);
        if (sync.started) { const h = heroes[info.id]; h.x = PLOTS.gate.x; h.z = PLOTS.gate.z + 2.4; h.alpha = 0; }
      }
      const h = heroes[info.id];
      h.info = info;
      if (info.activity !== h.act || (info.quarrel && h.act !== 'quarrel')) { h.act = info.quarrel ? 'quarrel' : info.activity; h.wait = 0; h.tx = null; }
    }
    sync.started = true;
  }

  function update(dt) {
    t += dt;
    // 次元の門のうず
    if (portalCanvas && Math.floor(t * 12) !== update.pf) {
      update.pf = Math.floor(t * 12);
      const g = portalCanvas.getContext('2d');
      g.clearRect(0, 0, 32, 32);
      for (let r = 15; r > 0; r -= 3) { g.fillStyle = ['#2a1a5a', '#4a2a9a', '#7a4ad8', '#a87aff', '#e0c8ff'][Math.floor((15 - r) / 3) % 5]; g.beginPath(); g.arc(16, 16, r, 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 10; i++) { const a = t * 2 + i * 0.63, rr = 3 + (i * 37 % 11); g.fillStyle = '#fff'; g.fillRect(16 + Math.cos(a) * rr, 16 + Math.sin(a) * rr, 1, 1); }
      portalTex.needsUpdate = true;
    }
    if (waterTex) waterTex.offset.x = (t * 0.05) % 1;
    for (const l of lights) l.intensity = l.userData.base * (0.6 + world.night * 0.9) * (0.92 + Math.sin(t * 7 + l.id) * 0.08);
    world.scene.traverse(o => { if (o.userData.window && o.material) o.material.color.setHSL(0.11, 0.9, 0.35 + world.night * 0.35); if (o.userData.flag) o.rotation.y = Math.sin(t * 2) * 0.25; });
    for (const f of fxList) { f.update(dt); f.mesh.rotation.y = world.cam.az; }
    // 英雄
    for (const h of Object.values(heroes)) {
      const info = h.info || {};
      if (h.wait > 0) h.wait -= dt;
      if (h.tx == null && h.wait <= 0) {
        const sp = spotFor(h, info);
        if (sp) { h.tx = sp.x; h.tz = sp.z; h.dest = sp.act; }
        else h.wait = rnd(2, 4);
      }
      h.moving = false;
      if (h.tx != null) {
        const dx = h.tx - h.x, dz = h.tz - h.z, d = Math.hypot(dx, dz);
        if (d < 0.08) { h.tx = null; h.wait = info.quarrel ? 1 : rnd(5, 12); h.arrived = h.dest; }
        else { const sp = Math.min(d, 1.5 * dt); h.x += dx / d * sp; h.z += dz / d * sp; h.moving = true; h.arrived = null; h.dirX = dx; h.dirZ = dz; }
      }
      // 画面での向き（カメラから見て右へ進んでいるか）
      if (h.moving) { const sx = h.dirX * Math.cos(world.cam.az) - h.dirZ * Math.sin(world.cam.az); if (Math.abs(sx) > 0.01) h.face = sx >= 0 ? 1 : -1; }
      if (info.quarrel && heroes[info.quarrel]) { const o = heroes[info.quarrel]; const sx = (o.x - h.x) * Math.cos(world.cam.az) - (o.z - h.z) * Math.sin(world.cam.az); h.face = sx >= 0 ? 1 : -1; }
      let pose = 'idle' + (Math.floor(t * 1.6 + h.phase) % 2);
      if (h.moving) pose = 'walk' + (Math.floor(t * 8 + h.phase) % 4);
      else if (h.arrived === 'train') pose = Math.floor(t * 2.5 + h.phase) % 2 ? 'atk1' : 'atk0';
      else if (info.quarrel) pose = Math.floor(t * 3) % 2 ? 'atk0' : 'hurt';
      W3.setBillboardCanvas(h.mesh, S.heroCanvas(h.id, pose), h.face < 0);
      const shake = info.quarrel ? Math.sin(t * 30) * 0.03 : 0;
      h.mesh.position.set(h.x + shake, 0, h.z);
      h.mesh.rotation.y = world.cam.az;
      if (h.alpha < 1) { h.alpha = Math.min(1, h.alpha + dt * 0.8); h.mesh.material.opacity = h.alpha; }
      h.shadow.position.set(h.x, 0.02, h.z);
      const ik = info.quarrel ? 'quarrel' : info.proposal ? 'proposal' : info.injured ? 'injured' : (h.arrived && !h.moving ? (h.arrived === 'train' ? 'train' : h.arrived === 'rest' ? 'rest' : '') : '');
      setIcon(h, ik);
      if (h.icon) h.icon.position.set(h.x, HERO_H + 0.5 + Math.sin(t * 3 + h.phase) * 0.06, h.z);
      if (h.selected) h.shadow.material.color.set(0xffe27a); else h.shadow.material.color.set(0xffffff);
    }
  }

  function onTap(ev) {
    const heroMeshes = Object.values(heroes).map(h => h.mesh);
    const hit = ev.pick(heroMeshes)[0];
    if (hit && hit.object.userData.heroId) {
      const id = hit.object.userData.heroId;
      for (const h of Object.values(heroes)) h.selected = h.id === id;
      opts.onHero(id);
      return;
    }
    const objs = Object.values(plotGroups).concat(memorialGroup ? [memorialGroup] : []);
    const b = ev.pick(objs)[0];
    if (b && b.object.userData.key) { if (b.object.userData.key === 'memorial') opts.onMemorial && opts.onMemorial(); else opts.onBuilding(b.object.userData.key); }
  }

  const Room = {
    mount(el, options) {
      opts = options;
      if (world && container === el) { sync(); world.resize(); this.start(); return; }
      if (world) { world.dispose(); world = null; heroes = {}; sync.key = ''; }
      container = el;
      mats();
      world = W3.createWorld(el, { dist: 30, az: 0.55, pol: 0.88, fov: 30, minDist: 12, maxDist: 46, bounds: 13, shadowSize: 22, onTap });
      buildGround();
      sync.key = ''; sync.started = false;
      sync();
      world.onFrame = (dt) => update(dt);
      world.setTimeOfDay();
      this.start();
    },
    start() { if (world) world.start(); },
    stop() { if (world) world.stop(); },
    refresh() { if (opts && world) sync(); },
    resize() { if (world) world.resize(); },
    setTime(hour) { if (world) world.setTimeOfDay(hour); },
    rotate(d) { if (world) world.rotate(d); },
    zoom(f) { if (world) world.zoom(f); },
    clearSelection() { for (const h of Object.values(heroes)) h.selected = false; },
    follow(id) { const h = heroes[id]; if (h && world) world.cam.follow = () => new THREE.Vector3(h.x, 0, h.z); },
    debug() { return Object.values(heroes).map(h => ({ id: h.id, x: +h.x.toFixed(2), z: +h.z.toFixed(2), act: h.act, moving: h.moving })); },
    screenPos(id) { const h = heroes[id]; return h && world ? world.toScreen(new THREE.Vector3(h.x, 1.0, h.z)) : null; },
    plotPos(key) { const p = key === 'memorial' ? MEMORIAL : PLOTS[key]; return p && world ? world.toScreen(new THREE.Vector3(p.x, key === 'training' ? 0.4 : 1.2, p.z)) : null; },
    get world() { return world; },
  };
  root.Room = Room;
})(window);
