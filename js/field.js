/* 星喚の塔 — 塔の中の映像（マスターが見ている、広いマップでの英雄たちの様子を立体で描く） */
(function (root) {
  'use strict';
  const THREE = root.THREE;
  const W3 = root.W3;
  const S = root.Sprites;
  const D = root.GameData;
  const E = root.BattleEngine;
  const T = E.TILE;

  // 区域ごとの床と岩の色
  const THEMES = [
    { floor: ['#5a6a3a', '#526234', '#627240', '#4a5a30'], rock: ['#5a5a50', '#525248', '#62625a'], light: 0xfff0d0, fog: 0x1a2418 },
    { floor: ['#4a4450', '#423c48', '#524c58', '#3a3440'], rock: ['#3a3440', '#34303a', '#423c48'], light: 0xc8b8ff, fog: 0x140f1c },
    { floor: ['#c8d4e0', '#bccad8', '#d4dee8', '#b0c0d0'], rock: ['#8a9aac', '#7a8a9c', '#9aaabc'], light: 0xd8ecff, fog: 0x2a3446 },
    { floor: ['#7a6040', '#6e5638', '#866a48', '#644e32'], rock: ['#5a4630', '#4e3e2a', '#665238'], light: 0xffd8a0, fog: 0x241a10 },
    { floor: ['#3a3048', '#342a40', '#403650', '#2e263a'], rock: ['#2a2234', '#241e2e', '#30283c'], light: 0xa890ff, fog: 0x0e0a16 },
    { floor: ['#5a3020', '#502a1c', '#643626', '#482618'], rock: ['#3a1c14', '#321810', '#42221a'], light: 0xff9a60, fog: 0x1e0a06 },
    { floor: ['#2a5a6a', '#245262', '#306272', '#1e4a5a'], rock: ['#1e3a4a', '#1a3442', '#224052'], light: 0x90d8ff, fog: 0x081a24 },
    { floor: ['#d8dce8', '#ccd2e0', '#e4e8f0', '#c0c8d8'], rock: ['#a8b0c4', '#9aa2b8', '#b4bcd0'], light: 0xfff8e0, fog: 0x3a4460 },
    { floor: ['#2a2848', '#24223e', '#302e52', '#1e1c38'], rock: ['#1a1830', '#16142a', '#1e1c36'], light: 0xc0b0ff, fog: 0x0a0818 },
    { floor: ['#3a2a3a', '#342434', '#403040', '#2e202e'], rock: ['#24182a', '#1e1424', '#2a1c30'], light: 0xff90c0, fog: 0x10060e },
  ];

  let world = null, container = null, layer = null, opts = null;
  let ex = null;
  let units = {};                // id → { mesh, shadow, bar, barBg, icon, iconKey, hitT, atkT, lastHp }
  let floorMesh = null, wallMesh = null, waterMesh = null, bushMesh = null, highMesh = null, waterTex = null;
  let tileIndex = null;          // タイル → { mesh, index }
  let lastExplored = 0;
  let fxList = [];
  let numbers = [];
  let npcObj = null, relicObjs = [], exitObj = null, exitFx = null, campObjs = [], clueObjs = [];
  let t = 0, targeting = false, picked = null, followAll = true;
  let movePreview = null;

  const toWorld = (x, y, map) => new THREE.Vector3(x - map.w / 2, 0, y - map.h / 2);
  const heightAt = (x, y) => (ex && ex.tileAt(x, y) === T.HIGH ? 0.5 : 0);

  function clear() {
    if (!world) return;
    for (const f of fxList) { world.scene.remove(f.mesh); f.dispose(); }
    fxList = [];
    for (const n of numbers) n.el.remove();
    numbers = [];
    const keep = new Set([world.sun, world.sun.target, world.hemi]);
    for (const o of world.scene.children.slice()) if (!keep.has(o)) world.scene.remove(o);
    units = {};
    npcObj = null; relicObjs = []; exitObj = null; exitFx = null; campObjs = []; clueObjs = [];
  }

  // ---------- 地形 ----------
  function buildTerrain() {
    const map = ex.map;
    const th = THEMES[map.zone] || THEMES[0];
    const fTex = W3.TEX.floor(th.floor), rTex = W3.TEX.rock(th.rock);
    const counts = { floor: 0, wall: 0, water: 0, bush: 0, high: 0 };
    for (let i = 0; i < map.w * map.h; i++) {
      const tt = map.tiles[i];
      if (tt === T.WALL) counts.wall++; else if (tt === T.WATER) counts.water++; else if (tt === T.HIGH) counts.high++; else { counts.floor++; if (tt === T.BUSH) counts.bush++; }
    }
    const fMat = new THREE.MeshLambertMaterial({ map: fTex });
    floorMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.3, 1), fMat, counts.floor);
    wallMesh = new THREE.InstancedMesh(W3.boxGeo(1, 1, 1, 1), new THREE.MeshLambertMaterial({ map: rTex }), counts.wall);
    waterTex = W3.TEX.water().clone(); waterTex.needsUpdate = true;
    waterMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.1, 1), new THREE.MeshLambertMaterial({ map: waterTex, emissive: 0x0a2a3a }), Math.max(1, counts.water));
    highMesh = new THREE.InstancedMesh(W3.boxGeo(1, 0.8, 1, 1), new THREE.MeshLambertMaterial({ map: fTex }), Math.max(1, counts.high));
    bushMesh = new THREE.InstancedMesh(new THREE.ConeGeometry(0.42, 0.9, 6), new THREE.MeshLambertMaterial({ color: 0x3a7a3a }), Math.max(1, counts.bush * 2));
    for (const m of [floorMesh, wallMesh, waterMesh, highMesh, bushMesh]) { m.castShadow = m !== floorMesh && m !== waterMesh; m.receiveShadow = true; }
    const dummy = new THREE.Object3D();
    const n = { floor: 0, wall: 0, water: 0, bush: 0, high: 0 };
    tileIndex = new Array(map.w * map.h);
    let seed = 9;
    const rr = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let y = 0; y < map.h; y++) for (let x = 0; x < map.w; x++) {
      const i = y * map.w + x, tt = map.tiles[i];
      const p = toWorld(x, y, map);
      dummy.rotation.set(0, 0, 0); dummy.scale.set(1, 1, 1);
      if (tt === T.WALL) {
        const hgt = 1.2 + rr() * 1.4;
        dummy.position.set(p.x, hgt / 2, p.z); dummy.scale.set(1, hgt, 1); dummy.updateMatrix();
        wallMesh.setMatrixAt(n.wall, dummy.matrix); tileIndex[i] = { mesh: wallMesh, index: n.wall++ };
      } else if (tt === T.WATER) {
        dummy.position.set(p.x, -0.2, p.z); dummy.updateMatrix();
        waterMesh.setMatrixAt(n.water, dummy.matrix); tileIndex[i] = { mesh: waterMesh, index: n.water++ };
      } else if (tt === T.HIGH) {
        dummy.position.set(p.x, 0.1, p.z); dummy.updateMatrix();
        highMesh.setMatrixAt(n.high, dummy.matrix); tileIndex[i] = { mesh: highMesh, index: n.high++ };
      } else {
        dummy.position.set(p.x, -0.15, p.z); dummy.updateMatrix();
        floorMesh.setMatrixAt(n.floor, dummy.matrix); tileIndex[i] = { mesh: floorMesh, index: n.floor++ };
        if (tt === T.BUSH) for (let k = 0; k < 2; k++) {
          dummy.position.set(p.x + (rr() - 0.5) * 0.5, 0.42, p.z + (rr() - 0.5) * 0.5); dummy.scale.set(1, 0.8 + rr() * 0.4, 1); dummy.updateMatrix();
          bushMesh.setMatrixAt(n.bush, dummy.matrix);
          if (k === 0) tileIndex[i].bush = n.bush;
          n.bush++;
        }
      }
    }
    for (const m of [floorMesh, wallMesh, waterMesh, highMesh, bushMesh]) {
      m.instanceMatrix.needsUpdate = true;
      for (let k = 0; k < m.count; k++) m.setColorAt(k, new THREE.Color(0.18, 0.18, 0.22));
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      world.scene.add(m);
    }
    // 見えない外側
    const outer = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshBasicMaterial({ color: th.fog }));
    outer.rotation.x = -Math.PI / 2; outer.position.y = -0.4;
    world.scene.add(outer);
    // 光と霧（塔の中）
    world.setTimeOfDay(13);
    world.scene.background = new THREE.Color(th.fog);
    world.scene.fog = new THREE.Fog(th.fog, 18, 52);
    world.sun.color.set(th.light); world.sun.intensity = 1.0; world.hemi.intensity = 0.6;
    updateFog(true);
  }

  /** まだ誰も見ていない場所は暗く描く */
  function updateFog(force) {
    const exp = ex.explored;
    let sum = 0;
    for (let i = 0; i < exp.length; i += 7) sum += exp[i];
    if (!force && sum === lastExplored) return;
    lastExplored = sum;
    const lit = new THREE.Color(1, 1, 1), dark = new THREE.Color(0.16, 0.16, 0.22);
    const touched = new Set();
    for (let i = 0; i < exp.length; i++) {
      const ti = tileIndex[i];
      if (!ti) continue;
      let seen = exp[i];
      if (!seen && ex.map.tiles[i] === T.WALL) { const x = i % ex.map.w, y = (i / ex.map.w) | 0; seen = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => { const j = (y + dy) * ex.map.w + x + dx; return j >= 0 && j < exp.length && exp[j]; }) ? 1 : 0; }
      ti.mesh.setColorAt(ti.index, seen ? lit : dark);
      if (ti.bush != null) { bushMesh.setColorAt(ti.bush, seen ? lit : dark); bushMesh.setColorAt(ti.bush + 1, seen ? lit : dark); touched.add(bushMesh); }
      touched.add(ti.mesh);
    }
    for (const m of touched) if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }

  // ---------- 置くもの（NPC・遺物・出口・巣） ----------
  const NPC_LOOK = { skin: '#e8c4a6', hair: '#6a5a4a', style: 'short', eye: '#2a2a2a', top: 'tunic', c1: '#7a6a5a', c2: '#4a3a2a', pants: '#4a3a2a', boots: '#3a2a1e', weapon: '', gear: ['scarf'], scarf: '#a87a4a', build: 'slim', h: 1 };
  function buildProps() {
    const map = ex.map;
    // NPC
    const np = toWorld(ex.npc.x, ex.npc.y, map);
    if (ex.npc.kind === 'stele') {
      const g = new THREE.Group();
      const stone = new THREE.Mesh(W3.boxGeo(0.7, 1.6, 0.3, 2), W3.mat(W3.TEX.stone()));
      stone.position.y = 0.8; stone.castShadow = true; g.add(stone);
      const rune = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.9), new THREE.MeshBasicMaterial({ color: 0x8ad8ff }));
      rune.position.set(0, 0.9, 0.16); g.add(rune);
      g.position.copy(np);
      npcObj = { obj: g, billboard: false };
    } else {
      const mesh = W3.makeBillboard(S.lookCanvas('npc', NPC_LOOK, 'idle0'), 1, 2);
      mesh.position.copy(np);
      npcObj = { obj: mesh, billboard: true };
    }
    npcObj.icon = W3.iconSprite('?', '#8ad8ff', 0.7);
    if (!ex.npc.hidden) { world.scene.add(npcObj.obj); world.scene.add(npcObj.icon); }
    // 手掛かり（足跡・書き置き・亡骸・壁画）。NPC と石碑は上で描いている
    for (const c of ex.clues) {
      if (c.npc) { clueObjs.push({ c, obj: null, icon: null }); continue; }
      const g = new THREE.Group();
      if (c.kind === 'tracks') {
        const m = new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.55 });
        for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.CircleGeometry(0.11, 6), m); p.rotation.x = -Math.PI / 2; p.position.set(-0.7 + i * 0.28, 0.03, (i % 2 ? 0.12 : -0.12) + Math.sin(i) * 0.1); p.scale.set(1, 1.6, 1); g.add(p); }
      } else if (c.kind === 'note') {
        const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.32), new THREE.MeshLambertMaterial({ color: 0xe8dcc0, side: THREE.DoubleSide }));
        paper.rotation.x = -Math.PI / 2; paper.rotation.z = 0.4; paper.position.y = 0.04; g.add(paper);
        const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.12, 0), new THREE.MeshLambertMaterial({ color: 0x6a6a6a })); rock.position.set(0.1, 0.1, 0.05); g.add(rock);
      } else if (c.kind === 'corpse') {
        const bone = new THREE.MeshLambertMaterial({ color: 0xd8d0c0 });
        const skull = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), bone); skull.position.set(-0.35, 0.14, 0); g.add(skull);
        for (let i = 0; i < 4; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.4), bone); r.position.set(-0.05 + i * 0.13, 0.05, 0); g.add(r); }
        const sword = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.9, 0.06), new THREE.MeshLambertMaterial({ color: 0x9aa2b4 })); sword.position.set(0.5, 0.42, 0.2); sword.rotation.z = 0.25; sword.castShadow = true; g.add(sword);
      } else if (c.kind === 'mural') {
        const slab = new THREE.Mesh(W3.boxGeo(1.4, 1.1, 0.22, 2), W3.mat(W3.TEX.stone())); slab.position.y = 0.55; slab.castShadow = true; g.add(slab);
        const art = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.75), new THREE.MeshBasicMaterial({ color: 0xc89a5a })); art.position.set(0, 0.58, 0.12); g.add(art);
      }
      g.position.copy(toWorld(c.x, c.y, map));
      const icon = W3.iconSprite('?', '#8ad8ff', 0.55);
      world.scene.add(g); world.scene.add(icon);
      clueObjs.push({ c, obj: g, icon });
    }
    // 物資の箱（曜日のダンジョン）
    for (const r of ex.caches) {
      const g = new THREE.Group();
      const crate = new THREE.Mesh(W3.boxGeo(0.7, 0.55, 0.55, 1), W3.mat(W3.TEX.wood())); crate.position.y = 0.28; crate.castShadow = true; g.add(crate);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.08, 0.57), new THREE.MeshLambertMaterial({ color: 0xd4a640, emissive: 0x3a2a00 })); band.position.y = 0.4; g.add(band);
      g.position.copy(toWorld(r.x, r.y, map));
      world.scene.add(g);
      relicObjs.push({ mesh: g, r, cache: true });
    }
    // 遺物
    for (const r of ex.relics) {
      const m = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      m.position.copy(toWorld(r.x, r.y, map)); m.position.y = 0.7;
      world.scene.add(m);
      relicObjs.push({ mesh: m, r });
    }
    // 出口
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.18, 6, 16), W3.mat(W3.TEX.stone()));
    ring.position.y = 1.0; ring.castShadow = true; g.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.8, 16), new THREE.MeshBasicMaterial({ color: 0x5a4a8a, transparent: true, opacity: 0.35, side: THREE.DoubleSide }));
    disc.position.y = 1.0; g.add(disc);
    g.position.copy(toWorld(map.exit.x, map.exit.y, map));
    exitObj = { group: g, disc };
    world.scene.add(g);
    // 魔物の巣（旗）
    for (const c of ex.camps) {
      const cg = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08), new THREE.MeshLambertMaterial({ color: 0x3a2a1e }));
      pole.position.y = 0.8; cg.add(pole);
      const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), new THREE.MeshLambertMaterial({ color: c.boss ? 0xa02a3a : 0x6a5a3a, side: THREE.DoubleSide }));
      flag.position.set(0.3, 1.4, 0); cg.add(flag);
      cg.position.copy(toWorld(c.x + 1.2, c.y - 0.8, map));
      world.scene.add(cg);
      campObjs.push({ group: cg, camp: c, flag });
    }
  }

  // ---------- 英雄と敵 ----------
  function unitSize(u) {
    if (u.side === 'hero') return [1, 2];
    const tpl = D.ENEMIES[u.key];
    if (tpl.sprite === 'human') return u.boss ? [1.3, 2.6] : [1, 2];
    return u.boss ? [2.8, 2.8] : [1.5, 1.5];
  }
  function unitCanvas(u, pose) {
    if (u.side === 'hero') return S.heroCanvas(u.heroId, pose);
    const tpl = D.ENEMIES[u.key];
    if (tpl.sprite === 'human') return S.lookCanvas(u.key, tpl.look, pose);
    return S.enemyCanvas(u.key);
  }
  function makeUnit(u) {
    const [w, h] = unitSize(u);
    const mesh = W3.makeBillboard(unitCanvas(u, 'idle0'), w, h);
    mesh.userData.uid = u.id;
    const shadow = W3.blobShadow(w * 0.42);
    const barBg = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x120a10, depthTest: false }));
    const bar = new THREE.Sprite(new THREE.SpriteMaterial({ color: u.side === 'hero' ? 0x4cd486 : 0xe0603a, depthTest: false }));
    barBg.center.set(0, 0.5); bar.center.set(0, 0.5);
    barBg.renderOrder = bar.renderOrder = 9;
    world.scene.add(mesh); world.scene.add(shadow); world.scene.add(barBg); world.scene.add(bar);
    const rec = { u, mesh, shadow, bar, barBg, w, h, hitT: 0, atkT: 0, icon: null, iconKey: '', downT: 0 };
    units[u.id] = rec;
    return rec;
  }
  function setIcon(rec, key) {
    if (rec.iconKey === key) return;
    if (rec.icon) { world.scene.remove(rec.icon); rec.icon = null; }
    rec.iconKey = key;
    if (!key) return;
    const spec = { fear: ['恐', '#c9a6ff'], bleed: ['血', '#ff6a6a'], slack: ['Z', '#e0c880'], order: ['!', '#ffd040'], flee: ['逃', '#a8e0ff'] }[key];
    if (!spec) return;
    rec.icon = W3.iconSprite(spec[0], spec[1], 0.5);
    world.scene.add(rec.icon);
  }

  function addFx(name, x, y, z, scale) {
    if (fxList.length > 14) return null;
    const f = W3.fxBillboard(name, { scale: scale || 1 / 24 });
    if (!f) return null;
    f.mesh.position.set(x, y, z);
    world.scene.add(f.mesh);
    fxList.push(f);
    return f;
  }
  function fxAtUnit(name, id, dy, scale) {
    const rec = units[id];
    if (!rec) return null;
    const p = rec.mesh.position;
    return addFx(name, p.x, p.y + (dy == null ? rec.h * 0.5 : dy), p.z + 0.05, scale);
  }
  function number(id, text, cls) {
    const rec = units[id];
    if (!rec || !layer) return;
    const el = document.createElement('span');
    el.className = 'num ' + (cls || '');
    el.textContent = text;
    layer.appendChild(el);
    numbers.push({ el, id, t: 0, dx: (Math.random() - 0.5) * 20 });
  }

  // ---------- 出来事 → 演出 ----------
  function onEvent(e) {
    switch (e.type) {
      case 'hit': {
        const tgt = units[e.to];
        if (e.heal) { number(e.to, '+' + e.amount, 'heal'); if (e.kind === 'heal') fxAtUnit('holy/heal', e.to, 0.6, 1 / 30); break; }
        if (tgt) tgt.hitT = 0.25;
        const from = units[e.from];
        if (from && e.from !== e.to) from.atkT = 0.4;
        number(e.to, (e.crit ? '' : '') + e.amount, e.bleed ? 'bleed' : e.kind === 'betray' ? 'betray' : e.crit ? 'crit' : '');
        if (e.kind === 'attack' || e.kind === 'counter') fxAtUnit(e.crit ? 'impacts/crit-hit' : 'impacts/hit-spark', e.to, null, 1 / 30);
        else if (e.kind === 'shot') fxAtUnit('impacts/hit-spark', e.to, null, 1 / 32);
        else if (e.kind === 'betray') fxAtUnit('melee/heavy-cleave', e.to, null, 1 / 24);
        break;
      }
      case 'skill': {
        const from = units[e.from];
        if (from) from.castT = 0.6;
        const p = toWorld(e.x, e.y, ex.map);
        const y = heightAt(e.x, e.y);
        const fxName = e.enemy ? (e.skill === 'aoe' ? 'shadow/curse' : 'impacts/blunt-hit')
          : e.skill === 'aoe' ? 'explosions/small-explosion' : e.skill === 'heal_all' ? 'holy/heal-aoe' : e.skill === 'taunt' ? 'holy/divine-shield'
          : e.skill === 'multi' ? 'melee/dagger-flurry' : 'melee/sword-slash';
        addFx(fxName, p.x, y + 0.9, p.z + 0.1, e.skill === 'aoe' || e.skill === 'heal_all' ? 1 / 18 : 1 / 22);
        if (from && from.u.side === 'hero') showSkillName(from, e.name);
        break;
      }
      case 'status': fxAtUnit(e.status === 'bleed' ? 'status/bleeding' : 'status/cursed', e.id, null, 1 / 30); break;
      case 'death': {
        const rec = units[e.id];
        if (rec) rec.downT = 0.01;
        fxAtUnit(e.side === 'hero' ? 'spawn/soul-rise' : 'spawn/poof', e.id, 0.6, 1 / 26);
        break;
      }
      case 'spawn': for (const id of e.ids || []) { const u = ex.unitById(id); if (u && !units[id]) makeUnit(u); fxAtUnit('spawn/spawn-portal', id, 0.2, 1 / 28); } break;
      case 'relic': { const p = toWorld(e.x, e.y, ex.map); addFx('pickups/collect-burst', p.x, 0.8, p.z, 1 / 24); break; }
      case 'mission': { if (npcObj && !ex.npc.hidden && ex.npc.met) addFx('ui/exclamation', npcObj.obj.position.x, 2.6, npcObj.obj.position.z, 1 / 26); break; }
      case 'clue': { const p = toWorld(e.x, e.y, ex.map); addFx('ui/exclamation', p.x, 1.8, p.z, 1 / 28); addFx('pickups/collect-burst', p.x, 0.5, p.z, 1 / 26); break; }
      case 'potion': fxAtUnit('nature/healing-bloom', e.id, 0.4, 1 / 30); break;
      case 'note': if (e.kind === 'slack' && e.unit) fxAtUnit('status/sleep', e.unit, 2.1, 1 / 32); break;
      default: break;
    }
  }
  function showSkillName(rec, name) {
    if (!layer || !name) return;
    const el = document.createElement('span');
    el.className = 'num skillname';
    el.textContent = name;
    layer.appendChild(el);
    numbers.push({ el, id: rec.u.id, t: 0, dx: 0, up: 1.1 });
  }

  // ---------- 毎フレーム ----------
  function update(dt) {
    if (!ex) return;
    t += dt;
    if (waterTex) waterTex.offset.x = (t * 0.06) % 1;
    if (Math.floor(t * 2) !== update.fogT) { update.fogT = Math.floor(t * 2); updateFog(false); }
    const az = world.cam.az;
    const all = ex.heroes.concat(ex.enemies);
    for (const u of all) {
      let rec = units[u.id];
      if (!rec) rec = makeUnit(u);
      const map = ex.map;
      const p = toWorld(u.x, u.y, map);
      const y = heightAt(u.x, u.y);
      const visible = u.side === 'hero' || ex.explored[Math.round(u.y) * map.w + Math.round(u.x)] === 1;
      rec.mesh.visible = rec.shadow.visible = visible || !u.alive;
      rec.hitT -= dt; rec.atkT -= dt; rec.castT = (rec.castT || 0) - dt;
      // ポーズ
      let pose = 'idle' + (Math.floor(t * 1.6 + (u.uid % 3)) % 2);
      if (!u.alive) pose = 'hurt';
      else if (rec.hitT > 0.1) pose = 'hurt';
      else if (rec.castT > 0 && (u.cls === 'mage' || u.cls === 'priest')) pose = 'cast';
      else if (rec.atkT > 0) pose = rec.atkT > 0.2 ? 'atk0' : 'atk1';
      else if (u.moving) pose = 'walk' + (Math.floor(t * 9 + u.uid) % 4);
      else if (u.action === 'slack') pose = 'idle1';
      const flip = (u.face || 1) * (Math.cos(az) >= 0 ? 1 : -1) < 0;
      W3.setBillboardCanvas(rec.mesh, unitCanvas(u, pose), u.side === 'enemy' ? !flip : flip);
      if (u.alive) {
        rec.mesh.position.set(p.x, y + (rec.hitT > 0 ? 0.04 : 0), p.z);
        rec.mesh.rotation.set(0, az, 0);
        rec.mesh.material.color.setRGB(1, rec.hitT > 0.1 ? 0.55 : 1, rec.hitT > 0.1 ? 0.55 : 1);
      } else {
        // 倒れる
        rec.downT = Math.min(1, (rec.downT || 0) + dt * 2);
        rec.mesh.position.set(p.x, y + 0.05, p.z);
        rec.mesh.rotation.set(-Math.PI / 2 * rec.downT, az, 0, 'YXZ');
        rec.mesh.material.color.setRGB(0.45, 0.45, 0.5);
        if (u.side === 'enemy') { rec.mesh.material.opacity = Math.max(0, 1 - rec.downT * 0.8); rec.mesh.material.transparent = true; }
      }
      rec.shadow.position.set(p.x, y + 0.02, p.z);
      rec.shadow.material.color.set(picked === u.id ? 0xffe27a : 0xffffff);
      // HP バー
      const show = u.alive && visible && (u.side === 'hero' || u.hp < u.maxHp || u.boss);
      rec.bar.visible = rec.barBg.visible = show;
      if (show) {
        const bw = u.boss ? 1.6 : 0.9, hy = y + rec.h + 0.25;
        const off = new THREE.Vector3(Math.cos(az), 0, -Math.sin(az)).multiplyScalar(-bw / 2);
        rec.barBg.position.set(p.x + off.x, hy, p.z + off.z); rec.barBg.scale.set(bw, 0.1, 1);
        const r = Math.max(0, u.hp / u.maxHp);
        rec.bar.position.copy(rec.barBg.position); rec.bar.scale.set(bw * r, 0.07, 1);
        rec.bar.material.color.set(u.side === 'hero' ? (r < 0.25 ? 0xf0575a : r < 0.5 ? 0xf0b13c : 0x4cd486) : (u.shield > 0 ? 0xb08aff : 0xe0603a));
      }
      // 頭の上のアイコン
      const ik = !u.alive ? '' : u.side !== 'hero' ? '' : u.action === 'slack' ? 'slack' : u.action === 'flee' ? 'flee' : u.fear > 0 ? 'fear' : u.bleed > 0 ? 'bleed' : u.order ? 'order' : '';
      setIcon(rec, ik);
      if (rec.icon) rec.icon.position.set(p.x, y + rec.h + 0.65, p.z);
      // 選んで狙う敵を光らせる
      if (targeting && u.side === 'enemy' && u.alive) rec.mesh.material.color.setRGB(1, 0.9 + Math.sin(t * 8) * 0.1, 0.4);
    }
    // NPC・遺物・出口
    if (npcObj) {
      const n = ex.npc;
      const p = toWorld(n.x, n.y, ex.map);
      npcObj.obj.position.set(p.x, 0, p.z);
      if (npcObj.billboard) { npcObj.obj.rotation.y = az; W3.setBillboardCanvas(npcObj.obj, S.lookCanvas('npc', NPC_LOOK, n.following && ex.aliveHeroes()[0] && Math.hypot(n.x - ex.aliveHeroes()[0].x, n.y - ex.aliveHeroes()[0].y) > 1.5 ? 'walk' + (Math.floor(t * 8) % 4) : 'idle0'), false); }
      const seen = ex.explored[Math.round(n.y) * ex.map.w + Math.round(n.x)] === 1;
      npcObj.obj.visible = seen && !n.hidden;
      npcObj.icon.visible = seen && !n.met && !n.hidden;
      npcObj.icon.position.set(p.x, 2.5 + Math.sin(t * 3) * 0.08, p.z);
    }
    for (const r of relicObjs) {
      r.mesh.visible = !r.r.taken && ex.explored[Math.round(r.r.y) * ex.map.w + Math.round(r.r.x)] === 1;
      if (r.cache) continue;
      r.mesh.rotation.y += dt * 2; r.mesh.position.y = 0.7 + Math.sin(t * 2) * 0.1;
    }
    for (const o of clueObjs) {
      const c = o.c;
      const seen = c.seen || ex.explored[c.y * ex.map.w + c.x] === 1;
      if (o.obj) o.obj.visible = seen;
      if (o.icon) {
        o.icon.visible = seen && !c.found;
        const p = toWorld(c.x, c.y, ex.map);
        o.icon.position.set(p.x, 1.5 + Math.sin(t * 3 + c.id) * 0.08, p.z);
      }
      if (c.npc && npcObj) npcObj.icon.visible = npcObj.icon.visible && !c.found;
    }
    if (exitObj) {
      const m = ex.mission;
      const seen = ex.explored[ex.map.exit.y * ex.map.w + ex.map.exit.x] === 1;
      exitObj.group.visible = seen && (m.exitFound || m.kind !== 'explore');
      exitObj.disc.material.color.set(m.exitOpen ? 0xc8a8ff : 0x4a3a6a);
      exitObj.disc.material.opacity = m.exitOpen ? 0.9 : 0.3;
      exitObj.group.rotation.y = az;
      if (m.exitOpen && !exitFx) { const p = exitObj.group.position; exitFx = addFx('arcane/portal', p.x, 0.1, p.z + 0.1, 1 / 30); }
    }
    for (const c of campObjs) { c.group.visible = !c.camp.cleared && ex.explored[c.camp.y * ex.map.w + c.camp.x] === 1; c.flag.rotation.y = Math.sin(t * 2 + c.camp.id) * 0.3; }
    // エフェクト
    for (const f of fxList.slice()) {
      f.update(dt);
      f.mesh.rotation.y = az;
      f.age = (f.age || 0) + dt;
      if (f.done() || (!f.loop && f.age > 2.5)) { world.scene.remove(f.mesh); f.dispose(); fxList.splice(fxList.indexOf(f), 1); }
    }
    // 数字
    for (const n of numbers.slice()) {
      n.t += dt;
      const rec = units[n.id];
      if (!rec || n.t > 1) { n.el.remove(); numbers.splice(numbers.indexOf(n), 1); continue; }
      const p = rec.mesh.position.clone(); p.y += rec.h * (n.up || 0.85) + n.t * 0.6;
      const s = world.toScreen(p);
      const r = container.getBoundingClientRect();
      n.el.style.transform = `translate(${s.x - r.left + n.dx}px, ${s.y - r.top}px) translate(-50%, -50%)`;
      n.el.style.opacity = String(1 - n.t * n.t);
    }
    // カメラ: いつもは生きている英雄の真ん中を追う
    if (followAll && !world.cam.follow) world.cam.follow = () => center();
    if (movePreview) movePreview.material.opacity = 0.5 + Math.sin(t * 6) * 0.3;
  }

  function center() {
    const hs = ex.aliveHeroes();
    if (!hs.length) return world.cam.target.clone();
    let x = 0, y = 0;
    for (const h of hs) { x += h.x; y += h.y; }
    return toWorld(x / hs.length, y / hs.length, ex.map);
  }

  function onTap(ev) {
    if (!ex) return;
    const meshes = Object.values(units).filter(r => r.u.alive && r.mesh.visible).map(r => r.mesh);
    const hit = ev.pick(meshes)[0];
    if (hit && hit.object.userData.uid) { opts.onTapUnit && opts.onTapUnit(hit.object.userData.uid); return; }
    const g = ev.ground();
    if (!g) return;
    const tx = Math.round(g.x + ex.map.w / 2), ty = Math.round(g.z + ex.map.h / 2);
    opts.onTapGround && opts.onTapGround(tx, ty);
  }

  const Field = {
    mount(el, options) {
      opts = options || {};
      if (world && container === el) return;
      container = el;
      world = W3.createWorld(el, { dist: 14, az: 0.5, pol: 0.9, fov: 34, minDist: 7, maxDist: 40, bounds: 30, shadowSize: 16, bloom: 0.5, onTap });
      layer = document.createElement('div');
      layer.className = 'num-layer';
      el.appendChild(layer);
      world.onFrame = (dt) => update(dt);
    },
    load(expedition) {
      clear();
      ex = expedition;
      followAll = true; picked = null; targeting = false;
      lastExplored = -1;
      buildTerrain();
      buildProps();
      for (const u of ex.heroes.concat(ex.enemies)) makeUnit(u);
      world.cam.target.copy(center());
      world.cam.follow = () => center();
      world.cam.dist = 14;
      world.resize();
    },
    /** 戦いの出来事を演出に変える */
    events(list) { for (const e of list) onEvent(e); },
    start() { if (world) world.start(); },
    stop() { if (world) world.stop(); },
    resize() { if (world) world.resize(); },
    setTargeting(on) { targeting = !!on; },
    setPicked(uid) { picked = uid; },
    follow(uid) {
      followAll = !uid;
      if (!uid) { world.cam.follow = () => center(); return; }
      world.cam.follow = () => { const u = ex.unitById(uid); return u ? toWorld(u.x, u.y, ex.map) : center(); };
    },
    showMoveTarget(tx, ty) {
      if (movePreview) world.scene.remove(movePreview);
      movePreview = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.45, 16), new THREE.MeshBasicMaterial({ color: 0xffe27a, transparent: true, side: THREE.DoubleSide }));
      movePreview.rotation.x = -Math.PI / 2;
      const p = toWorld(tx, ty, ex.map);
      movePreview.position.set(p.x, heightAt(tx, ty) + 0.05, p.z);
      world.scene.add(movePreview);
      setTimeout(() => { if (movePreview) { world.scene.remove(movePreview); movePreview = null; } }, 1600);
    },
    rotate(d) { if (world) world.rotate(d); },
    zoom(f) { if (world) world.zoom(f); },
    screenPos(uid) { const r = units[uid]; if (!r || !world) return null; const p = r.mesh.position.clone(); p.y += r.h * 0.5; return world.toScreen(p); },
    tileScreenPos(tx, ty) { if (!ex || !world) return null; return world.toScreen(toWorld(tx, ty, ex.map)); },
    get world() { return world; },
  };
  root.Field = Field;
})(window);
