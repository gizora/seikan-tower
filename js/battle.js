/* 星喚の塔 — 塔の中（広いマップを英雄が自分で探索する。画面に依存しない。Node でもシミュレーションできる） */
(function (root) {
  'use strict';
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.GameData;

  // ---------- 能力 ----------
  const STANCE = {
    attack:  { atk: 1.2,  def: 0.8,  flee: 0.12 },
    balance: { atk: 1.0,  def: 1.0,  flee: 0.2 },
    defend:  { atk: 0.9,  def: 1.5,  flee: 0.3 },
  };
  function traitVal(traits, id) { const t = (traits || []).find(x => x.id === id); return t ? D.TRAITS[id].vals[t.lv - 1] : 0; }
  function disobeyChance(trust) { return Math.max(0, (45 - trust) / 100); }
  function trustBonus(trust) { return trust >= 90 ? 0.1 : trust >= 60 ? 0.05 : 0; }
  function trustTier(trust) { let i = 0; D.TRUST_TIERS.forEach((t, k) => { if (trust >= t.min) i = k; }); return i; }

  /** 英雄の能力（レベル・★・信頼度・特性・装備・訓練と戦闘で伸びた分） */
  function heroStats(def, owned) {
    const c = D.CLASSES[def.cls];
    const star = D.STARS[owned.star || def.rarity];
    const g = (1 + 0.07 * (owned.lv - 1)) * star.mult;
    const tb = 1 + trustBonus(owned.trust == null ? 50 : owned.trust);
    const tr = owned.traits || [];
    const eq = owned.equip || {};
    const wt = D.EQUIP_TIERS[eq.weapon || 0], at = D.EQUIP_TIERS[eq.armor || 0];
    const b = owned.bonus || {};
    return {
      hp: Math.round(c.hp * g * (1 + traitVal(tr, 'sturdy')) * (1 + (at ? at.hp : 0)) * (1 + (b.hp || 0))),
      atk: Math.round(c.atk * g * tb * (1 + traitVal(tr, 'might')) * (1 + (wt ? wt.atk : 0)) * (1 + (b.atk || 0))),
      def: Math.round(c.def * g * tb * (1 + traitVal(tr, 'guard')) * (1 + (at ? at.def : 0)) * (1 + (b.def || 0))),
      spd: Math.round((c.spd + ((owned.star || def.rarity) - 1) * 5) * (1 + traitVal(tr, 'swift')) * (1 + (b.spd || 0))),
    };
  }
  function enemyStats(tpl, lv) {
    const n = lv - 1;
    return { hp: Math.round(tpl.hp * (1 + 0.08 * n)), atk: Math.round(tpl.atk * (1 + 0.11 * n)), def: Math.round(tpl.def * (1 + 0.05 * n)), spd: tpl.spd };
  }
  function power(st) { return Math.round(st.hp * 0.25 + st.atk * 3 + st.def * 2 + st.spd * 0.5); }

  // ---------- マップ ----------
  const T = { FLOOR: 0, WALL: 1, WATER: 2, BUSH: 3, HIGH: 4 };
  function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const passable = (t) => t !== T.WALL && t !== T.WATER;

  function bfs(map, sx, sy) {
    const { w, h, tiles } = map;
    const dist = new Int32Array(w * h).fill(-1);
    const q = [sy * w + sx];
    dist[q[0]] = 0;
    for (let i = 0; i < q.length; i++) {
      const p = q[i], x = p % w, y = (p / w) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (dist[np] >= 0 || !passable(tiles[np])) continue;
        dist[np] = dist[p] + 1;
        q.push(np);
      }
    }
    return dist;
  }

  /** その階のマップを作る（seed が同じなら同じマップ） */
  function makeMap(fi, seed) {
    const rng = mulberry(seed * 7919 + fi * 104729 + 17);
    const zone = Math.floor(fi / D.FLOORS_PER_ZONE);
    const w = 34 + Math.min(10, zone), h = 30 + Math.min(10, zone);
    let tiles = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) tiles[i] = rng() < 0.42 ? T.WALL : T.FLOOR;
    const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? T.WALL : tiles[y * w + x];
    for (let it = 0; it < 4; it++) {
      const next = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy) === T.WALL) n++;
        next[y * w + x] = (n >= 5 || (it < 2 && n <= 1 && rng() < 0.3)) ? T.WALL : T.FLOOR;
      }
      tiles = next;
    }
    for (let x = 0; x < w; x++) { tiles[x] = T.WALL; tiles[(h - 1) * w + x] = T.WALL; }
    for (let y = 0; y < h; y++) { tiles[y * w] = T.WALL; tiles[y * w + w - 1] = T.WALL; }
    // いちばん広い場所だけを残す
    const seen = new Int32Array(w * h).fill(-1);
    let best = -1, bestSize = 0, region = 0;
    for (let i = 0; i < w * h; i++) {
      if (tiles[i] !== T.FLOOR || seen[i] >= 0) continue;
      const q = [i]; seen[i] = region;
      for (let k = 0; k < q.length; k++) {
        const p = q[k], x = p % w, y = (p / w) | 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const np = (y + dy) * w + x + dx; if (tiles[np] === T.FLOOR && seen[np] < 0) { seen[np] = region; q.push(np); } }
      }
      if (q.length > bestSize) { bestSize = q.length; best = region; }
      region++;
    }
    for (let i = 0; i < w * h; i++) if (tiles[i] === T.FLOOR && seen[i] !== best) tiles[i] = T.WALL;
    const map = { w, h, tiles, zone };
    // スタート（左上に近い床）と、いちばん遠い場所
    let start = null;
    for (let s = 0; s < w + h && !start; s++) for (let x = 0; x <= s; x++) { const y = s - x; if (x < w && y < h && tiles[y * w + x] === T.FLOOR) { start = { x, y }; break; } }
    const dist = bfs(map, start.x, start.y);
    let far = 0, farP = 0;
    for (let i = 0; i < w * h; i++) if (dist[i] > far) { far = dist[i]; farP = i; }
    const exit = { x: farP % w, y: (farP / w) | 0 };
    // 地形: 水・草むら・高台（スタートと出口のまわりは空ける）
    const near = (x, y, p, r) => Math.abs(x - p.x) + Math.abs(y - p.y) <= r;
    const blob = (type, count, size) => {
      for (let n = 0; n < count; n++) {
        for (let tries = 0; tries < 30; tries++) {
          const cx = 2 + Math.floor(rng() * (w - 4)), cy = 2 + Math.floor(rng() * (h - 4));
          if (tiles[cy * w + cx] !== T.FLOOR || near(cx, cy, start, 5) || near(cx, cy, exit, 4)) continue;
          const r = size * (0.6 + rng() * 0.6);
          for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 3; x <= cx + 3; x++) {
            if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
            if (tiles[y * w + x] === T.FLOOR && Math.hypot(x - cx, y - cy) <= r && !near(x, y, start, 3) && !near(x, y, exit, 2)) tiles[y * w + x] = type;
          }
          break;
        }
      }
    };
    blob(T.HIGH, 4, 2.2);
    blob(T.BUSH, 7, 1.8);
    blob(T.WATER, 2, 1.6);
    const d2 = bfs(map, start.x, start.y);
    if (d2[exit.y * w + exit.x] < 0) for (let i = 0; i < w * h; i++) if (tiles[i] === T.WATER) tiles[i] = T.FLOOR;
    map.start = start;
    map.exit = exit;
    map.dist = bfs(map, start.x, start.y);
    map.far = far;
    map.rng = rng;
    return map;
  }

  /** 床のうち、スタートからの距離が [lo, hi]（割合）の場所を1つ選ぶ（others から gap 以上離す） */
  function placeAt(map, lo, hi, others, gap) {
    const { w, h, tiles, dist, far, rng } = map;
    const cand = [];
    for (let i = 0; i < w * h; i++) {
      if (tiles[i] === T.WALL || tiles[i] === T.WATER || dist[i] < 0) continue;
      const r = dist[i] / far;
      if (r < lo || r > hi) continue;
      const x = i % w, y = (i / w) | 0;
      if (others.some(o => Math.abs(o.x - x) + Math.abs(o.y - y) < gap)) continue;
      cand.push({ x, y });
    }
    return cand.length ? cand[Math.floor(rng() * cand.length)] : null;
  }

  // ---------- 経路 ----------
  function findPath(map, sx, sy, tx, ty) {
    const { w, h, tiles } = map;
    sx = Math.round(sx); sy = Math.round(sy); tx = Math.round(tx); ty = Math.round(ty);
    if (sx === tx && sy === ty) return [];
    if (tx < 0 || ty < 0 || tx >= w || ty >= h) return null;
    const start = sy * w + sx, goal = ty * w + tx;
    const came = new Int32Array(w * h).fill(-1);
    const g = new Float32Array(w * h).fill(Infinity);
    const f = new Float32Array(w * h).fill(Infinity);
    const inOpen = new Uint8Array(w * h);
    const open = [start];
    inOpen[start] = 1;
    g[start] = 0;
    const H = (p) => { const x = p % w, y = (p / w) | 0, dx = Math.abs(x - tx), dy = Math.abs(y - ty); return Math.max(dx, dy) + 0.41 * Math.min(dx, dy); };
    f[start] = H(start);
    let guard = 0;
    while (open.length && guard++ < 4000) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (f[open[i]] < f[open[bi]]) bi = i;
      const p = open[bi];
      open[bi] = open[open.length - 1]; open.pop(); inOpen[p] = 0;
      if (p === goal) break;
      const x = p % w, y = (p / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const np = ny * w + nx;
        if (!passable(tiles[np]) && np !== goal) continue;
        if (dx && dy && (!passable(tiles[y * w + nx]) || !passable(tiles[ny * w + x]))) continue;   // 角を斜めに抜けない
        const cost = g[p] + (dx && dy ? 1.41 : 1);
        if (cost < g[np]) { g[np] = cost; came[np] = p; f[np] = cost + H(np); if (!inOpen[np]) { open.push(np); inOpen[np] = 1; } }
      }
    }
    if (came[goal] < 0) return null;
    const path = [];
    for (let p = goal; p !== start; p = came[p]) path.push({ x: p % w, y: (p / w) | 0 });
    return path.reverse();
  }

  function lineOfSight(map, ax, ay, bx, by) {
    let x0 = Math.round(ax), y0 = Math.round(ay);
    const x1 = Math.round(bx), y1 = Math.round(by);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, guard = 0;
    while ((x0 !== x1 || y0 !== y1) && guard++ < 200) {
      if (map.tiles[y0 * map.w + x0] === T.WALL) return false;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x0 += sx; }
      if (e2 < dx) { err += dx; y0 += sy; }
    }
    return true;
  }

  // ---------- 遠征（塔の1つの階） ----------
  const TIME_LIMIT = 420;          // 秒（ゲームの中の時間）
  const AGGRO = 5.5, LEASH = 11, SIGHT = 6.5;
  const RANGE = { warrior: 1.4, swordsman: 1.4, thief: 1.4, archer: 5, mage: 4.5, priest: 4 };

  /**
   * opts: { party:[{def, owned, row, tactic}], floorIndex, tactics, enemyMult, cmdCost, potions, rels, seed, rng }
   *   rels: (heroIdA, heroIdB) => 仲（-100〜100）
   */
  function Expedition(opts) {
    this.rng = opts.rng || Math.random;
    this.tactics = opts.tactics;
    this.floorIndex = opts.floorIndex;
    this.floor = D.FLOORS[opts.floorIndex];
    this.enemyMult = opts.enemyMult || 1;
    this.cmdCost = opts.cmdCost || 6;
    this.cmdCharge = this.cmdCost;
    this.rels = opts.rels || (() => 0);
    this.potions = Object.assign({ styptic: 0, calm: 0, heal: 0 }, opts.potions || {});
    this.potionsUsed = { styptic: 0, calm: 0, heal: 0 };
    this.time = 0;
    this.state = 'running';
    this.result = null;
    this.events = [];
    this.proposal = null; this.proposed = {}; this.trustDelta = {}; this.betrayals = [];
    this.summary = { deaths: 0, healed: 0, skills: 0, disobeyed: 0, commands: 0, obeyed: 0, slacked: 0, feared: 0, bled: 0, fled: 0, undying: 0, bossReached: false };
    this.uid = 0;
    const map = this.map = makeMap(opts.floorIndex, opts.seed || 1);
    this.explored = new Uint8Array(map.w * map.h);
    // 任務
    const boss = this.floor.waves.some(wv => wv.some(k => D.ENEMIES[k].boss));
    const kinds = ['hunt', 'relic', 'escort', 'explore', 'survive'];
    const kind = boss ? 'boss' : kinds[Math.floor(map.rng() * kinds.length)];
    this.mission = { kind, revealed: false, done: false, progress: 0, goal: kind === 'relic' ? 3 : 1, exitOpen: false, exitFound: kind !== 'explore', surviveLeft: 90, surviveStarted: false };
    // 英雄
    this.heroes = opts.party.map((p, i) => {
      const st = heroStats(p.def, p.owned);
      const c = D.CLASSES[p.def.cls];
      const tr = p.owned.traits || [];
      const pos = this.freeNear(map.start.x + (i % 2), map.start.y + Math.floor(i / 2));
      return this.unit({
        id: 'h' + i, side: 'hero', heroId: p.def.id, name: p.def.name, cls: p.def.cls, row: p.row || c.row, pers: p.def.pers,
        skill: p.def.skill, healer: !!c.healer, crit: c.crit + traitVal(tr, 'keen'), range: RANGE[p.def.cls],
        maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd, star: p.owned.star || p.def.rarity,
        trust: p.owned.trust == null ? 50 : p.owned.trust, traits: tr, healMul: 1 + traitVal(tr, 'mend'), drain: traitVal(tr, 'drain'),
        undying: traitVal(tr, 'undying'), undyingUsed: false, counter: traitVal(tr, 'counter'),
        tacOverride: p.tactic || null, x: pos.x, y: pos.y, stats: { dmg: 0, heal: 0, taken: 0, kills: 0, slack: 0, acts: 0, hits: 0 },
      });
    });
    // 敵の巣・NPC・遺物
    this.enemies = [];
    const placed = [map.start];
    const waves = this.floor.waves.slice();
    const normalWaves = waves.filter(wv => !wv.some(k => D.ENEMIES[k].boss));
    const campCount = kind === 'hunt' ? 4 : 3;
    this.camps = [];
    for (let c = 0; c < campCount; c++) {
      const isBossCamp = boss && c === campCount - 1;
      const wave = isBossCamp ? waves.find(wv => wv.some(k => D.ENEMIES[k].boss)) : normalWaves[c % Math.max(1, normalWaves.length)] || waves[0];
      const spot = isBossCamp ? map.exit : placeAt(map, 0.25 + c * 0.18, 0.55 + c * 0.15, placed, 7) || placeAt(map, 0.2, 1, placed, 4);
      if (!spot) continue;
      placed.push(spot);
      const camp = { id: c, x: spot.x, y: spot.y, boss: isBossCamp, cleared: false, units: [] };
      wave.forEach((key) => camp.units.push(this.spawnEnemy(key, spot.x, spot.y, camp)));
      this.camps.push(camp);
    }
    const npcSpot = placeAt(map, 0.3, 0.6, placed, 5) || placeAt(map, 0.1, 1, placed, 3) || map.start;
    placed.push(npcSpot);
    const npcDef = D.NPCS[Math.floor(map.rng() * D.NPCS.length)];
    this.npc = { name: kind === 'escort' ? '取り残された生存者' : npcDef.name, kind: kind === 'escort' ? 'npc' : npcDef.kind, x: npcSpot.x, y: npcSpot.y, met: false, following: false, spd: 90 };
    this.relics = [];
    if (kind === 'relic') for (let r = 0; r < 3; r++) { const sp = placeAt(map, 0.35, 1, placed, 6) || placeAt(map, 0.2, 1, placed, 3); if (sp) { placed.push(sp); this.relics.push({ x: sp.x, y: sp.y, taken: false }); } }
    this.reveal(map.start.x, map.start.y, SIGHT + 1);
    this.lastCombat = -99;
    this.note(`${this.floorIndex + 1}階に入った。任務はまだわからない`, 'sys');
  }

  const P = Expedition.prototype;
  P.unit = function (u) {
    return Object.assign({ uid: ++this.uid, alive: true, atkT: this.rng() * 0.8, skillT: 2 + this.rng() * 2, guardT: 0, tauntT: 0, defUpT: 0, atkUpT: 0,
      fear: 0, bleed: 0, bleedT: 0, path: null, pathT: 0, goal: null, order: null, action: 'wait', slackT: 0, fleeT: 0, target: null, think: 0, face: 1 }, u);
  };
  P.freeNear = function (x, y) {
    const { w, tiles } = this.map;
    for (let r = 0; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx > 0 && ny > 0 && nx < this.map.w - 1 && ny < this.map.h - 1 && passable(tiles[ny * w + nx])) return { x: nx, y: ny };
    }
    return { x, y };
  };
  P.spawnEnemy = function (key, x, y, camp) {
    const tpl = D.ENEMIES[key];
    const st = enemyStats(tpl, this.floor.lv);
    const pos = this.freeNear(x + Math.round((this.rng() - 0.5) * 3), y + Math.round((this.rng() - 0.5) * 3));
    const ranged = tpl.sprite === 'shaman' || tpl.sprite === 'eye' || key === 'iceWitch';
    const u = this.unit({
      id: 'e' + (this.uid + 1), side: 'enemy', key, name: tpl.name, boss: !!tpl.boss, skill: tpl.skill || null, crit: 0.05,
      maxHp: Math.round(st.hp * this.enemyMult), hp: Math.round(st.hp * this.enemyMult), atk: Math.round(st.atk * this.enemyMult), def: st.def, spd: st.spd,
      range: ranged ? 4 : 1.4, x: pos.x, y: pos.y, home: { x: pos.x, y: pos.y }, camp, lv: this.floor.lv,
    });
    if (tpl.barrier) { u.maxShield = Math.round(u.maxHp * tpl.barrier); u.shield = u.maxShield; u.shieldT = 0; }
    this.enemies.push(u);
    return u;
  };

  P.emit = function (e) { e.t = this.time; this.events.push(e); };
  P.note = function (text, kind, unit) { this.emit({ type: 'note', text, kind: kind || 'info', unit: unit ? unit.id : null }); };
  P.aliveHeroes = function () { return this.heroes.filter(u => u.alive); };
  P.aliveEnemies = function () { return this.enemies.filter(u => u.alive); };
  P.unitById = function (id) { return this.heroes.find(u => u.id === id) || this.enemies.find(u => u.id === id) || null; };
  P.tileAt = function (x, y) { const tx = Math.round(x), ty = Math.round(y); return (tx < 0 || ty < 0 || tx >= this.map.w || ty >= this.map.h) ? T.WALL : this.map.tiles[ty * this.map.w + tx]; };
  P.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  P.reveal = function (x, y, r) {
    const { w, h } = this.map;
    const R = Math.ceil(r);
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) {
      const nx = Math.round(x) + dx, ny = Math.round(y) + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || dx * dx + dy * dy > r * r) continue;
      this.explored[ny * w + nx] = 1;
    }
  };
  P.fallenHeroIds = function () { return this.heroes.filter(u => !u.alive).map(u => u.heroId); };

  // ---------- 状態（恐怖・出血） ----------
  P.inflict = function (u, key) {
    if (!u.alive || u.side !== 'hero') return;
    const fresh = !(u[key] > 0);
    u[key] = key === 'fear' ? 8 : 3;
    if (key === 'bleed') u.bleedT = 2;
    if (fresh) {
      this.summary[key === 'fear' ? 'feared' : 'bled']++;
      this.note(D.STATUS[key].msg.replace('{n}', u.name), key, u);
      this.emit({ type: 'status', id: u.id, status: key });
    }
  };
  P.fearOnDeath = function (dead) {
    for (const h of this.aliveHeroes()) {
      if (h === dead) continue;
      const p = 0.22 + (h.pers === 'careful' || h.pers === 'whimsical' ? 0.15 : 0) - (h.pers === 'brave' ? 0.15 : 0) + (h.trust < 45 ? 0.1 : 0);
      if (this.rng() < p) this.inflict(h, 'fear');
    }
  };
  P.usePotion = function (u, key) {
    if (this.potions[key] <= 0) return false;
    this.potions[key]--; this.potionsUsed[key]++;
    this.note(`${u.name}が${D.POTIONS[key].name}を使った`, 'potion', u);
    this.emit({ type: 'potion', id: u.id, potion: key });
    return true;
  };

  // ---------- ダメージ ----------
  P.damage = function (a, t, mult, forceCrit, noCounter, kind) {
    const T0 = this.tactics;
    const fearMul = D.STATUS.fear.mult;
    let atkMul = (a.side === 'hero' ? STANCE[T0.stance].atk : 1) * (a.atkUpT > 0 ? 1.25 : 1) * (a.fear > 0 ? fearMul : 1);
    const defMul = (t.side === 'hero' ? STANCE[T0.stance].def : 1) * (t.guardT > 0 ? 2 : 1) * (t.defUpT > 0 ? 1.35 : 1) * (t.fear > 0 ? fearMul : 1);
    if (this.tileAt(a.x, a.y) === T.HIGH && this.tileAt(t.x, t.y) !== T.HIGH) atkMul *= 1.2;      // 高台から
    let dmg = a.atk * atkMul * mult * 50 / (50 + t.def * defMul) * (0.9 + 0.2 * this.rng());
    if (this.tileAt(t.x, t.y) === T.BUSH) dmg *= 0.75;                                              // 草むらに隠れている
    const crit = !!forceCrit || this.rng() < a.crit;
    if (crit) dmg *= 1.5;
    let amount = Math.max(1, Math.round(dmg));
    const res = { from: a.id, to: t.id, amount, crit, dead: false, kind: kind || 'attack' };
    if (t.shield > 0) { const ab = Math.min(t.shield, amount); t.shield -= ab; amount -= ab; res.shield = ab; res.amount = amount; if (t.shield === 0) res.shieldBroken = true; }
    t.hp = Math.max(0, t.hp - amount);
    if (t.hp === 0 && t.side === 'hero' && t.undying > 0 && !t.undyingUsed && this.rng() < t.undying) { t.hp = 1; t.undyingUsed = true; res.undying = true; this.summary.undying++; }
    if (a.side === 'hero') { a.stats.dmg += amount; a.stats.hits++; }
    if (t.side === 'hero') t.stats.taken += amount;
    if (t.side === 'enemy' && !t.target && a.alive) t.target = a;
    this.emit(Object.assign({ type: 'hit' }, res));
    if (t.hp === 0) { res.dead = true; this.kill(t, a); }
    if (a.side === 'hero' && a.drain > 0 && a.alive && amount > 0) { const hh = Math.min(a.maxHp - a.hp, Math.round(amount * a.drain)); if (hh > 0) a.hp += hh; }
    if (a.side === 'enemy' && t.side === 'hero' && t.alive && amount > 0) {
      const tpl = D.ENEMIES[a.key];
      if ((tpl.bleed && this.rng() < tpl.bleed) || (crit && this.rng() < 0.5)) this.inflict(t, 'bleed');
      if (tpl.fear && this.rng() < tpl.fear) this.inflict(t, 'fear');
    }
    if (!noCounter && t.side === 'hero' && t.alive && t.counter > 0 && a.alive && this.dist(a, t) < 2 && this.rng() < t.counter) this.damage(t, a, 0.6, false, true, 'counter');
    return res;
  };
  P.kill = function (t, by) {
    if (!t.alive) return;
    t.alive = false;
    t.action = 'down';
    if (by && by.side === 'hero' && by !== t) by.stats.kills++;
    this.emit({ type: 'death', id: t.id, side: t.side });
    if (t.side === 'hero') {
      this.summary.deaths++;
      this.note(`${t.name}が倒れた`, 'down', t);
      this.fearOnDeath(t);
    } else if (t.camp && t.camp.units.every(u => !u.alive) && !t.camp.cleared) {
      t.camp.cleared = true;
      this.emit({ type: 'camp', camp: t.camp.id });
      if (this.mission.kind === 'hunt') this.note(`魔物の巣を潰した（${this.camps.filter(c => c.cleared).length}/${this.camps.length}）`, 'mission');
    }
  };
  P.heal = function (a, t, mult) {
    const raw = Math.round(a.atk * mult * (a.healMul || 1) * (0.9 + 0.2 * this.rng()));
    const amount = Math.min(t.maxHp - t.hp, raw);
    t.hp += amount;
    this.summary.healed += amount;
    if (a.stats) a.stats.heal += amount;
    if (amount > 0) this.emit({ type: 'hit', from: a.id, to: t.id, amount, heal: true, kind: 'heal' });
    return amount;
  };

  // ---------- 命令・提案 ----------
  P.canCommand = function () { return this.state === 'running' && this.cmdCharge >= this.cmdCost; };
  /** type: target / skill / guard / move / flee。arg: 敵の id、または {x, y} */
  P.command = function (unitId, type, arg) {
    const u = this.heroes.find(h => h.id === unitId);
    if (!u || !u.alive) return { ok: false, reason: 'unit' };
    if (!this.canCommand()) return { ok: false, reason: 'charge' };
    if (type === 'skill' && u.skillT > 0) return { ok: false, reason: 'cd' };
    if (type === 'target' && !this.enemies.some(e => e.id === arg && e.alive)) return { ok: false, reason: 'target' };
    if (type === 'move' && (!arg || !passable(this.tileAt(arg.x, arg.y)))) return { ok: false, reason: 'tile' };
    if (!D.ORDERS[type]) return { ok: false, reason: 'type' };
    this.cmdCharge = 0;
    this.summary.commands++;
    if (this.rng() < disobeyChance(u.trust)) {
      this.summary.disobeyed++;
      const text = `${u.name}は命令に従わなかった`;
      this.note(text, 'slack', u);
      return { ok: true, obeyed: false, unit: u.id, text };
    }
    this.summary.obeyed++;
    u.order = { type, arg, until: this.time + (type === 'move' ? 25 : type === 'flee' ? 6 : 12) };
    u.slackT = 0;
    if (type === 'guard') u.guardT = 5;
    if (type === 'move' || type === 'flee') u.path = null;
    const text = `${u.name}が命令「${D.ORDERS[type].name}」に従う`;
    this.note(text, 'sys', u);
    return { ok: true, obeyed: true, unit: u.id, text };
  };
  /** 指示モード: 生きている英雄全員を (x, y) へ（英雄ごとに従うかが決まる） */
  P.partyMove = function (x, y) {
    if (!this.canCommand()) return { ok: false, reason: 'charge' };
    if (!passable(this.tileAt(x, y))) return { ok: false, reason: 'tile' };
    this.cmdCharge = 0;
    this.summary.commands++;
    let n = 0, i = 0;
    for (const u of this.aliveHeroes()) {
      if (this.rng() < disobeyChance(u.trust)) { this.summary.disobeyed++; continue; }
      const p = this.freeNear(Math.round(x) + (i % 2), Math.round(y) + (Math.floor(i / 2) % 2));
      u.order = { type: 'move', arg: p, until: this.time + 25 }; u.path = null; u.slackT = 0; n++; i++;
    }
    this.note(`マスターの指示: ${n}人が移動`, 'sys');
    return { ok: true, moved: n };
  };
  P.maybePropose = function (u) {
    if (this.proposal || !u.alive || this.state !== 'running' || this.rng() > 0.05) return null;
    const allies = this.aliveHeroes();
    const bossNear = this.aliveEnemies().some(e => e.boss && this.dist(e, u) < 9);
    let kind = null;
    if (!this.proposed.retreat && this.tactics.retreat === 'never' && (u.pers === 'careful' || u.pers === 'caring') && (this.summary.deaths > 0 || allies.some(a => a.hp / a.maxHp < 0.25))) kind = 'retreat';
    else if (!this.proposed.defend && this.tactics.stance !== 'defend' && u.pers !== 'brave' && u.hp / u.maxHp < 0.45) kind = 'defend';
    else if (!this.proposed.focus && bossNear && (u.pers === 'brave' || u.pers === 'loyal')) kind = 'focus';
    if (!kind) return null;
    this.proposed[kind] = true;
    this.proposal = { kind, unit: u.id, heroId: u.heroId, expires: this.time + 12 };
    this.emit({ type: 'proposal', proposal: this.proposal });
    return this.proposal;
  };
  P.answerProposal = function (accept) {
    const p = this.proposal;
    if (!p || this.state !== 'running') return { ok: false };
    this.proposal = null;
    const u = this.unitById(p.unit);
    const d = accept ? 2 : -1;
    u.trust = Math.max(0, Math.min(100, u.trust + d));
    this.trustDelta[u.heroId] = (this.trustDelta[u.heroId] || 0) + d;
    if (!accept) return { ok: true, accepted: false, kind: p.kind };
    if (p.kind === 'retreat') { this.finish(false, 'retreat'); return { ok: true, accepted: true, kind: p.kind, ended: true }; }
    if (p.kind === 'defend') this.tactics.stance = 'defend';
    if (p.kind === 'focus') { const boss = this.aliveEnemies().find(e => e.boss); if (boss) for (const h of this.aliveHeroes()) h.order = { type: 'target', arg: boss.id, until: this.time + 15 }; }
    return { ok: true, accepted: true, kind: p.kind };
  };
  P.retreat = function () { if (this.state === 'running') this.finish(false, 'retreat'); };

  // ---------- 任務 ----------
  P.revealMission = function (by) {
    if (this.mission.revealed) return;
    this.mission.revealed = true;
    const m = D.MISSIONS[this.mission.kind];
    const src = this.npc.kind === 'stele' ? '石碑を調べた' : `${this.npc.name}から話を聞いた`;
    this.note(`${by.name}が${src} —— 任務「${m.name}: ${m.desc}」が判明`, 'mission', by);
    this.emit({ type: 'mission', mission: this.mission });
    if (this.mission.kind === 'escort') this.npc.following = true;
    if (this.mission.kind === 'survive') { this.mission.surviveStarted = true; this.surviveSpawnT = 4; }
  };
  P.updateMission = function (dt) {
    const m = this.mission;
    if (m.exitOpen) return;
    let done = false;
    if (m.kind === 'hunt') done = this.camps.every(c => c.cleared);
    else if (m.kind === 'boss') done = this.enemies.filter(e => e.boss).every(e => !e.alive);
    else if (m.kind === 'relic') done = this.relics.filter(r => r.taken).length >= 3;
    else if (m.kind === 'escort') done = this.npc.following && this.dist(this.npc, this.map.exit) < 2.5;
    else if (m.kind === 'explore') done = m.exitFound;
    else if (m.kind === 'survive' && m.surviveStarted) {
      m.surviveLeft -= dt;
      this.surviveSpawnT -= dt;
      if (this.surviveSpawnT <= 0 && m.surviveLeft > 8) {
        this.surviveSpawnT = 14;
        const pool = D.ZONES[this.map.zone].pool;
        const near = this.aliveHeroes()[0];
        if (near) {
          const cx = near.x + (this.rng() < 0.5 ? -6 : 6), cy = near.y + (this.rng() < 0.5 ? -5 : 5);
          const ids = [];
          for (let i = 0; i < 2 + Math.floor(this.floorIndex / 30); i++) {
            const pos = this.freeNear(Math.round(Math.max(1, Math.min(this.map.w - 2, cx))), Math.round(Math.max(1, Math.min(this.map.h - 2, cy))));
            const e = this.spawnEnemy(pool[Math.floor(this.rng() * pool.length)], pos.x, pos.y, null);
            e.target = near; ids.push(e.id);
          }
          this.emit({ type: 'spawn', ids });
          this.note('魔物が押し寄せてきた', 'warn');
        }
      }
      done = m.surviveLeft <= 0;
    }
    m.progress = m.kind === 'hunt' ? this.camps.filter(c => c.cleared).length : m.kind === 'relic' ? this.relics.filter(r => r.taken).length : m.progress;
    if (done) {
      m.done = true; m.exitOpen = true; m.exitFound = true;
      this.note(m.revealed ? '任務を果たした。出口が開いた' : '出口が開いた（気づかないうちに任務を果たしていた）', 'mission');
      this.emit({ type: 'exit' });
    }
  };

  // ---------- 1歩進める ----------
  P.step = function (dt) {
    if (this.state !== 'running') { const ev = this.events; this.events = []; return ev; }
    this.time += dt;
    if (this.cmdCharge < this.cmdCost) this.cmdCharge = Math.min(this.cmdCost, this.cmdCharge + dt / 1.2);
    if (this.proposal && this.time > this.proposal.expires) { this.emit({ type: 'proposalExpired', proposal: this.proposal }); this.proposal = null; }
    const units = this.heroes.concat(this.enemies);
    for (const u of units) {
      if (!u.alive) continue;
      u.atkT -= dt; u.skillT -= dt;
      if (u.guardT > 0) u.guardT -= dt;
      if (u.tauntT > 0) u.tauntT -= dt;
      if (u.defUpT > 0) u.defUpT -= dt;
      if (u.atkUpT > 0) u.atkUpT -= dt;
      if (u.fear > 0) u.fear -= dt;
      if (u.side === 'hero') this.heroStatus(u, dt);
      if (!u.alive) continue;
      u.think -= dt;
      if (u.side === 'hero') this.heroThink(u, dt); else this.enemyThink(u, dt);
    }
    this.updateNpc(dt);
    this.updateMission(dt);
    this.betrayalCheck(dt);
    // ひと息（敵が近くにいないと少しずつ回復）
    const fighting = this.aliveHeroes().some(h => this.aliveEnemies().some(e => this.dist(e, h) < 7));
    if (fighting) this.lastCombat = this.time;
    else if (this.time - this.lastCombat > 3) for (const h of this.aliveHeroes()) h.hp = Math.min(h.maxHp, h.hp + h.maxHp * 0.025 * dt);
    // 終わりの判定
    const alive = this.aliveHeroes();
    if (!alive.length) this.finish(false, 'wipe');
    else if (this.mission.exitOpen && alive.some(h => this.dist(h, this.map.exit) < 1.6)) {
      if (!this.exitTouch) this.exitTouch = this.time;
      if (alive.every(h => this.dist(h, this.map.exit) < 4) || this.time - this.exitTouch > 6) this.finish(true);
    } else if (this.time >= TIME_LIMIT) this.finish(false, 'timeout');
    else this.autoRetreat();
    const ev = this.events; this.events = [];
    return ev;
  };

  P.autoRetreat = function () {
    const r = this.tactics.retreat;
    if (r === 'down' && this.summary.deaths > 0) this.finish(false, 'retreat');
    else if (r === 'danger' && (this.summary.deaths > 0 || this.aliveHeroes().some(h => h.hp / h.maxHp < 0.15))) this.finish(false, 'retreat');
  };

  P.heroStatus = function (u, dt) {
    if (u.bleed > 0 && this.potions.styptic > 0 && this.usePotion(u, 'styptic')) u.bleed = 0;
    if (u.fear > 0 && this.potions.calm > 0 && this.usePotion(u, 'calm')) u.fear = 0;
    if (u.hp / u.maxHp < 0.3 && this.potions.heal > 0 && this.usePotion(u, 'heal')) { const a = Math.min(u.maxHp - u.hp, Math.round(u.maxHp * 0.4)); u.hp += a; this.emit({ type: 'hit', from: u.id, to: u.id, amount: a, heal: true, kind: 'potion' }); }
    if (u.bleed > 0) {
      u.bleedT -= dt;
      if (u.bleedT <= 0) {
        u.bleedT = 2; u.bleed--;
        const amt = Math.max(1, Math.round(u.maxHp * D.STATUS.bleed.dmg));
        u.hp = Math.max(0, u.hp - amt);
        u.stats.taken += amt;
        this.emit({ type: 'hit', from: u.id, to: u.id, amount: amt, bleed: true, kind: 'bleed' });
        if (u.hp === 0) { this.note(`${u.name}が出血で倒れた`, 'bleed', u); this.kill(u, null); }
      }
    }
  };

  // 移動: 目標に向かって経路をたどる
  P.moveToward = function (u, tx, ty, dt, stopDist) {
    const d = Math.hypot(tx - u.x, ty - u.y);
    if (d <= (stopDist || 0.15)) { u.path = null; return true; }
    const gx = Math.round(tx), gy = Math.round(ty);
    if (!u.path || u.pathT <= 0 || !u.goal || u.goal.x !== gx || u.goal.y !== gy) {
      u.path = findPath(this.map, u.x, u.y, gx, gy) || [];
      u.goal = { x: gx, y: gy };
      u.pathT = 1.2;
    }
    u.pathT -= dt;
    const next = u.path[0] || { x: tx, y: ty };
    const sp = 2.4 * Math.sqrt((u.spd || 90) / 100) * (u.fear > 0 ? 0.8 : 1) * dt;
    const dx = next.x - u.x, dy = next.y - u.y, dd = Math.hypot(dx, dy);
    if (dd <= sp) { u.x = next.x; u.y = next.y; if (u.path.length) u.path.shift(); }
    else { u.x += dx / dd * sp; u.y += dy / dd * sp; }
    if (Math.abs(dx) > 0.05) u.face = dx < 0 ? -1 : 1;
    u.moving = true;
    if (u.side === 'hero') this.reveal(u.x, u.y, SIGHT);
    return false;
  };

  P.visibleEnemies = function (u, range) {
    return this.aliveEnemies().filter(e => {
      const d = this.dist(e, u);
      const r = this.tileAt(e.x, e.y) === T.BUSH ? range * 0.6 : range;
      return d <= r && lineOfSight(this.map, u.x, u.y, e.x, e.y);
    });
  };

  P.pickTarget = function (u, foes) {
    if (u.order && u.order.type === 'target') { const t = this.enemies.find(e => e.id === u.order.arg && e.alive); if (t) return t; u.order = null; }
    if (!foes.length) return null;
    const tac = Object.assign({}, this.tactics, u.tacOverride || {});
    let mode = tac.target;
    if (u.pers === 'whimsical' && this.rng() < 0.2) return foes[Math.floor(this.rng() * foes.length)];
    if (mode === 'auto') mode = { brave: 'strong', careful: 'weak' }[u.pers] || 'front';
    if (mode === 'weak') return foes.reduce((m, f) => (f.hp < m.hp ? f : m));
    if (mode === 'strong') return foes.find(f => f.boss) || foes.reduce((m, f) => (f.atk > m.atk ? f : m));
    return foes.reduce((m, f) => (this.dist(f, u) < this.dist(m, u) ? f : m));
  };

  // 英雄の思考
  P.heroThink = function (u, dt) {
    u.moving = false;
    const T0 = this.tactics;
    if (u.order && this.time > u.order.until) u.order = null;
    if (u.slackT > 0) { u.slackT -= dt; u.action = 'slack'; return; }
    if (u.think <= 0) {
      u.think = 0.8 + this.rng() * 0.4;
      if (!u.order && this.rng() < disobeyChance(u.trust) * 0.12) {
        const slackP = u.trust < 25 ? 0.6 : u.pers === 'whimsical' ? 0.4 : 0.15;
        if (this.rng() < slackP) { u.slackT = 3 + this.rng() * 3; u.stats.slack++; this.summary.slacked++; this.summary.disobeyed++; this.note(`${u.name}がサボっている`, 'slack', u); u.action = 'slack'; return; }
      }
      this.maybePropose(u);
    }
    if (u.order && u.order.type === 'flee') { this.flee(u, dt); return; }
    if (u.order && u.order.type === 'move') {
      u.action = 'move';
      if (this.moveToward(u, u.order.arg.x, u.order.arg.y, dt, 0.3)) u.order = null;
      this.fightIfInRange(u);
      return;
    }
    // 自分の判断で逃げる（HP が少ないとき）
    const foesNear = this.visibleEnemies(u, AGGRO + 1);
    const fleeLine = STANCE[T0.stance].flee + (u.pers === 'careful' ? 0.1 : 0) - (u.pers === 'brave' ? 0.1 : 0);
    if (u.fleeT > 0 || (foesNear.length && u.hp / u.maxHp < fleeLine && !u.healer && !(u.order && u.order.type === 'target'))) {
      if (u.fleeT <= 0) { u.fleeT = 3; this.summary.fled++; this.emit({ type: 'flee', id: u.id }); }
      u.fleeT -= dt;
      this.flee(u, dt);
      return;
    }
    // 回復役
    if (u.healer) {
      const tac = Object.assign({}, T0, u.tacOverride || {});
      const allies = this.aliveHeroes();
      const needy = allies.filter(a => a.hp / a.maxHp < tac.healLine && this.dist(a, u) < 7).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      if (needy.length) {
        const sk = u.skill;
        const force = u.order && u.order.type === 'skill';
        if (sk && sk.type === 'heal_all' && u.skillT <= 0 && (force || needy.length >= 2 || needy[0].hp / needy[0].maxHp < 0.3)) {
          if (u.atkT <= 0) {
            u.skillT = sk.cd * 3.5; u.atkT = 1.4 * 100 / u.spd; this.summary.skills++; u.stats.acts++;
            this.emit({ type: 'skill', from: u.id, name: sk.name, skill: sk.type, x: u.x, y: u.y });
            for (const a of allies) if (this.dist(a, u) < 7) this.heal(u, a, sk.mult);
            if (force) u.order = null;
          }
          u.action = 'heal';
          return;
        }
        const t = needy[0];
        if (this.dist(t, u) > 4.5) { u.action = 'move'; this.moveToward(u, t.x, t.y, dt, 3.5); return; }
        if (u.atkT <= 0) { u.atkT = 1.5 * 100 / u.spd; this.heal(u, t, 1.0); u.stats.acts++; }
        u.action = 'heal';
        return;
      }
    }
    // 戦う
    if (foesNear.length || (u.order && u.order.type === 'target')) {
      const target = this.pickTarget(u, foesNear);
      if (target) { this.engage(u, target, dt); return; }
    }
    // 仲間が戦っていれば加勢する
    const busy = this.aliveHeroes().find(h => h !== u && h.target && h.target.alive && h.target.side === 'enemy' && this.dist(h, u) < 10);
    if (busy && this.dist(busy.target, u) < 12) { this.engage(u, busy.target, dt); return; }
    u.target = null;
    this.pursueMission(u, dt);
  };

  P.fightIfInRange = function (u) {
    if (u.atkT > 0) return;
    const foes = this.visibleEnemies(u, u.range + 0.2);
    if (foes.length) this.attack(u, foes[0]);
  };

  P.flee = function (u, dt) {
    u.action = 'flee';
    const foes = this.aliveEnemies().filter(e => this.dist(e, u) < 9);
    if (!foes.length) { u.fleeT = 0; if (u.order && u.order.type === 'flee') u.order = null; return; }
    let ax = 0, ay = 0;
    for (const f of foes) { const d = Math.max(0.5, this.dist(f, u)); ax += (u.x - f.x) / d; ay += (u.y - f.y) / d; }
    const healer = this.aliveHeroes().find(h => h.healer && h !== u);
    let tx = u.x + ax * 3, ty = u.y + ay * 3;
    if (healer && this.dist(healer, u) > 2) { tx = (tx + healer.x) / 2; ty = (ty + healer.y) / 2; }
    tx = Math.max(1, Math.min(this.map.w - 2, tx)); ty = Math.max(1, Math.min(this.map.h - 2, ty));
    const p = this.freeNear(Math.round(tx), Math.round(ty));
    this.moveToward(u, p.x, p.y, dt, 0.3);
  };

  P.engage = function (u, target, dt) {
    u.target = target;
    const d = this.dist(u, target);
    const range = u.range + (this.tileAt(u.x, u.y) === T.HIGH && u.range > 2 ? 1 : 0);
    if (d > range || (u.range > 2 && !lineOfSight(this.map, u.x, u.y, target.x, target.y))) {
      u.action = 'move';
      this.moveToward(u, target.x, target.y, dt, u.range > 2 ? Math.min(range - 0.3, Math.max(1.5, d - 1)) : range - 0.2);
      return;
    }
    if (u.range > 2 && d < 1.6 && u.pers === 'careful') { const p = this.freeNear(Math.round(u.x + (u.x - target.x)), Math.round(u.y + (u.y - target.y))); this.moveToward(u, p.x, p.y, dt, 0.2); }
    u.face = target.x < u.x ? -1 : 1;
    if (u.atkT <= 0) this.attack(u, target);
    else if (u.action !== 'skill' || u.atkT < 0.6) u.action = 'attack';
  };

  P.attack = function (u, target) {
    const sk = u.skill;
    const tac = Object.assign({}, this.tactics, u.tacOverride || {});
    const bossPresent = this.aliveEnemies().some(e => e.boss && this.dist(e, u) < 10);
    const force = u.order && u.order.type === 'skill';
    const allow = u.skillT <= 0 && (force || tac.skill === 'now' || bossPresent || u.hp / u.maxHp < 0.35);
    u.atkT = 1.6 * 100 / u.spd;
    u.stats.acts++;
    u.face = target.x < u.x ? -1 : 1;
    if (sk && allow && sk.type === 'taunt') {
      u.skillT = sk.cd * 3.5; u.tauntT = 6; u.guardT = 4; this.summary.skills++;
      for (const e of this.aliveEnemies()) if (this.dist(e, u) < 6) e.target = u;
      if (sk.partyDef) for (const a of this.aliveHeroes()) if (this.dist(a, u) < 7) a.defUpT = 8;
      this.emit({ type: 'skill', from: u.id, name: sk.name, skill: 'taunt', x: u.x, y: u.y });
      u.action = 'skill'; if (force) u.order = null;
      return;
    }
    if (sk && allow && (sk.type === 'single' || sk.type === 'multi' || sk.type === 'aoe')) {
      u.skillT = sk.cd * 3.5; this.summary.skills++;
      this.emit({ type: 'skill', from: u.id, to: target.id, name: sk.name, skill: sk.type, x: target.x, y: target.y });
      if (sk.type === 'single') { this.damage(u, target, sk.mult, sk.sure, false, 'skill'); if (sk.partyAtk) for (const a of this.aliveHeroes()) a.atkUpT = 8; }
      else if (sk.type === 'multi') {
        for (let i = 0; i < sk.hits; i++) {
          const pool = this.aliveEnemies().filter(e => this.dist(e, u) < u.range + 3);
          if (!pool.length) break;
          const t = sk.spread ? pool[Math.floor(this.rng() * pool.length)] : (target.alive ? target : pool[0]);
          this.damage(u, t, sk.mult, false, false, 'skill');
        }
      } else for (const e of this.aliveEnemies()) if (this.dist(e, target) < 2.8) this.damage(u, e, sk.mult, false, false, 'skill');
      u.action = 'skill'; if (force) u.order = null;
      return;
    }
    this.damage(u, target, u.healer ? 0.7 : 1.0, false, false, u.range > 2 ? 'shot' : 'attack');
    u.action = 'attack';
  };

  P.pursueMission = function (u, dt) {
    const m = this.mission;
    const leader = this.aliveHeroes()[0];
    let goal = null;
    if (m.exitOpen) goal = this.map.exit;
    else if (!this.npc.met) goal = this.npc;
    else if (m.kind === 'hunt' || m.kind === 'boss') goal = this.camps.filter(cc => !cc.cleared && (m.kind === 'hunt' || cc.boss)).sort((a, b) => this.dist(a, u) - this.dist(b, u))[0] || null;
    else if (m.kind === 'relic') goal = this.relics.filter(rr => !rr.taken).sort((a, b) => this.dist(a, u) - this.dist(b, u))[0] || null;
    else if (m.kind === 'escort') goal = this.map.exit;
    else if (m.kind === 'survive') goal = leader === u ? null : leader;
    if (m.kind === 'explore' && this.npc.met && !m.exitFound) goal = this.frontier(u);
    if (!goal) goal = this.frontier(u);
    if (leader && leader !== u && this.dist(leader, u) > 6) goal = leader;
    if (!goal) { u.action = 'wait'; return; }
    u.action = 'explore';
    this.moveToward(u, goal.x, goal.y, dt, goal === leader ? 1.8 : 0.6);
    if (!this.npc.met && this.dist(u, this.npc) < 1.6) { this.npc.met = true; this.revealMission(u); }
    for (const r of this.relics) if (!r.taken && this.dist(u, r) < 1.2) {
      r.taken = true;
      this.emit({ type: 'relic', x: r.x, y: r.y });
      this.note(`${u.name}が遺物を拾った（${this.relics.filter(rr => rr.taken).length}/3）`, 'mission', u);
    }
    if (m.kind === 'explore' && !m.exitFound && this.dist(u, this.map.exit) < 3) { m.exitFound = true; this.note(`${u.name}が隠された出口を見つけた`, 'mission', u); }
  };

  /** まだ見ていない場所のうち近いところ */
  P.frontier = function (u) {
    if (u.explore && this.explored[u.explore.y * this.map.w + u.explore.x] === 0) return u.explore;
    const { w, h, tiles } = this.map;
    let best = null, bd = Infinity;
    for (let i = 0; i < 160; i++) {
      const x = 1 + Math.floor(this.rng() * (w - 2)), y = 1 + Math.floor(this.rng() * (h - 2));
      if (this.explored[y * w + x] || !passable(tiles[y * w + x]) || this.map.dist[y * w + x] < 0) continue;
      const d = Math.hypot(x - u.x, y - u.y);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    u.explore = best || this.map.exit;
    return u.explore;
  };

  P.updateNpc = function (dt) {
    const n = this.npc;
    if (!n.following) return;
    const leader = this.aliveHeroes()[0];
    if (!leader) return;
    if (this.dist(n, leader) > 1.5) this.moveToward(n, leader.x, leader.y, dt, 1.3);
  };

  // 敵の思考
  P.enemyThink = function (u, dt) {
    u.moving = false;
    const tpl = D.ENEMIES[u.key];
    if (u.shieldT !== undefined && u.shield === 0) { u.shieldT += dt; if (u.shieldT > 12) { u.shield = u.maxShield; u.shieldT = 0; this.emit({ type: 'reshield', id: u.id }); this.note(`${u.name}が盾を張り直した`, 'warn'); } }
    let t = u.target && u.target.alive ? u.target : null;
    const taunter = this.aliveHeroes().find(h => h.tauntT > 0 && this.dist(h, u) < 6);
    if (taunter) t = taunter;
    if (!t) {
      const seen = this.aliveHeroes().filter(h => { const r = this.tileAt(h.x, h.y) === T.BUSH ? AGGRO * 0.5 : AGGRO; return this.dist(h, u) < r && lineOfSight(this.map, u.x, u.y, h.x, h.y); });
      if (seen.length) t = seen.reduce((m, h) => (this.dist(h, u) < this.dist(m, u) ? h : m));
    }
    if (t && u.home && this.dist(t, u.home) > LEASH && !u.boss && this.mission.kind !== 'survive') t = null;   // 巣から離れすぎない
    u.target = t;
    if (t && u.boss) this.summary.bossReached = true;
    if (!t) {
      if (u.home && this.dist(u, u.home) > 0.8) { this.moveToward(u, u.home.x, u.home.y, dt, 0.5); u.hp = Math.min(u.maxHp, u.hp + u.maxHp * 0.05 * dt); }
      u.action = 'wait';
      return;
    }
    const d = this.dist(u, t);
    if (d > u.range) { u.action = 'move'; this.moveToward(u, t.x, t.y, dt, u.range - 0.2); return; }
    u.face = t.x < u.x ? -1 : 1;
    if (u.atkT > 0) return;
    u.atkT = 1.7 * 100 / u.spd;
    u.action = 'attack';
    if (u.skill && u.skillT <= 0) {
      u.skillT = u.skill.cd * 3.5;
      this.emit({ type: 'skill', from: u.id, to: t.id, name: u.skill.name, skill: u.skill.type, x: t.x, y: t.y, enemy: true });
      if (u.skill.type === 'aoe') { for (const h of this.aliveHeroes()) if (this.dist(h, u) < 6) this.damage(u, h, u.skill.mult, false, false, 'skill'); }
      else this.damage(u, t, u.skill.mult, false, false, 'skill');
      if (tpl.summon && this.aliveEnemies().filter(e => e.camp === u.camp).length < tpl.summonMax + 1) {
        const s = this.spawnEnemy(tpl.summon, u.x, u.y, u.camp);
        if (u.camp) u.camp.units.push(s);
        s.target = t;
        this.emit({ type: 'spawn', ids: [s.id] });
        this.note(`${s.name}が呼び出された`, 'warn');
      }
      if (tpl.freeze) { for (const h of this.aliveHeroes()) h.atkT += tpl.freeze / 250; this.note(D.STATUS.cold.msg.replace('{n}', '英雄たち'), 'cold'); this.emit({ type: 'freeze' }); }
    } else {
      this.damage(u, t, 1.0, false, false, 'attack');
      if (tpl.double) { const t2 = this.aliveHeroes().find(h => h !== t && this.dist(h, u) < 2.2); if (t2) this.damage(u, t2, 1.0, false, false, 'attack'); }
    }
    if (tpl.enrage) { u.baseAtk = u.baseAtk || u.atk; u.atk = Math.round(u.atk + u.baseAtk * tpl.enrage); u.rage = (u.rage || 0) + 1; }
  };

  // 仲のとても悪い英雄どうしは、戦いのどさくさで裏切ることがある
  P.betrayalCheck = function (dt) {
    this.betrayT = (this.betrayT || 0) + dt;
    if (this.betrayT < 5) return;
    this.betrayT = 0;
    if (this.time - this.lastCombat > 2) return;
    const hs = this.aliveHeroes();
    for (const a of hs) for (const b of hs) {
      if (a === b || !a.alive || !b.alive) continue;
      const rel = this.rels(a.heroId, b.heroId);
      if (rel > D.QUARREL.betrayLine) continue;
      if (this.rng() > 0.05 * (-rel / 70)) continue;
      const amount = Math.round(b.maxHp * 0.3 + b.maxHp * 0.3 * (a.atk / Math.max(1, a.atk + b.def)));
      b.hp = Math.max(0, b.hp - amount);
      b.stats.taken += amount;
      this.emit({ type: 'hit', from: a.id, to: b.id, amount, crit: true, kind: 'betray' });
      const killed = b.hp === 0;
      this.betrayals.push({ by: a.heroId, victim: b.heroId, killed });
      this.note(`${a.name}が${b.name}に斬りかかった！（裏切り）`, 'down', a);
      if (killed) { this.note(`${b.name}は${a.name}に殺された`, 'down', b); this.kill(b, null); }
      return;
    }
  };

  P.finish = function (win, reason) {
    if (this.state !== 'running') return;
    this.state = 'done';
    this.proposal = null;
    const score = (h) => h.stats.dmg + h.stats.heal * 1.2 + h.stats.taken * 0.35 + h.stats.kills * 40 - h.stats.slack * 60 + (h.alive ? 50 : 0);
    let mvp = null;
    for (const h of this.heroes) if (!mvp || score(h) > score(mvp)) mvp = h;
    this.result = {
      win, reason: reason || null, fallen: this.fallenHeroIds(), mvp: mvp ? mvp.heroId : null,
      heroStats: this.heroes.map(h => ({ heroId: h.heroId, alive: h.alive, score: Math.round(score(h)), ...h.stats })),
      trustDelta: this.trustDelta, potionsUsed: this.potionsUsed, betrayals: this.betrayals, time: this.time,
      mission: { kind: this.mission.kind, revealed: this.mission.revealed, done: this.mission.done },
    };
    this.emit(Object.assign({ type: 'end' }, this.result));
  };

  /** 最後まで一気に進める（テスト・シミュレーション用） */
  P.runToEnd = function (dt) {
    dt = dt || 0.1;
    let guard = 0;
    while (this.state === 'running' && guard++ < 20000) this.step(dt);
    return this.result;
  };

  const api = { Expedition, heroStats, enemyStats, power, STANCE, disobeyChance, trustBonus, trustTier, traitVal, makeMap, findPath, lineOfSight, TILE: T, TIME_LIMIT };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BattleEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
