/* 星喚の塔 — 進行データ（保存・ガチャ・育成・昇級・信頼度・特性・永久ロスト・報酬） */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.GameData;
  const E = isNode ? require('./battle.js') : root.BattleEngine;
  const HG = isNode ? require('./herogen.js') : root.HeroGen;

  const SAVE_KEY = 'seikan-tower-save-v1';
  const VERSION = 6;

  function expToNext(lv) { return 30 + 25 * (lv - 1); }
  const isBossFloor = (fi) => (fi + 1) % D.FLOORS_PER_ZONE === 0;
  function floorExp(fi) { return 40 + 9 * (fi + 1); }
  function floorGold(fi) { return 50 + 12 * (fi + 1); }
  function firstClearGems(fi) { return isBossFloor(fi) ? 800 : 100; }
  function firstClearShards(fi) { return 4 + Math.floor(0.6 * (fi + 1)) + (isBossFloor(fi) ? 30 : 0); }
  function repeatShards(fi) { return 1 + Math.floor((fi + 1) / 10); }
  function traitSlots(star) { return 1 + (star >= 3 ? 1 : 0) + (star >= 5 ? 1 : 0); }
  const clampTrust = (t) => Math.max(0, Math.min(100, Math.round(t)));

  function randomTrait(rng, exclude) {
    const keys = Object.keys(D.TRAITS).filter(k => !(exclude || []).includes(k));
    return keys[Math.floor(rng() * keys.length)];
  }

  function newOwned(id, rng) {
    rng = rng || Math.random;
    const def = D.heroById[id];
    const traits = [];
    for (let i = 0; i < traitSlots(def.rarity); i++) traits.push({ id: randomTrait(rng, traits.map(t => t.id)), lv: 1 });
    return { lv: 1, exp: 0, star: def.rarity, trust: D.PERSONALITIES[def.pers].trust, traits, equip: { weapon: 0, armor: 0 },
      bonus: { hp: 0, atk: 0, def: 0, spd: 0 }, injured: 0, activity: 'wander', work: null, joined: Date.now() };
  }

  function rollDifficulty(rng) {
    rng = rng || Math.random;
    const list = Object.entries(D.DIFFICULTIES);
    let r = rng() * list.reduce((a, [, d]) => a + d.weight, 0);
    for (const [k, d] of list) { r -= d.weight; if (r < 0) return k; }
    return 'normal';
  }
  function randomBaseName(rng) { return HG.worldName(rng); }
  /** 現実の日付（その日の曜日のダンジョンの回数を数える） */
  function dayKey(now) { const d = new Date(now || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  /** 費用の表（{ gold, wood, ore, mana, food }）を「🪙300 🪵40」の形にする */
  function costText(cost) {
    if (!cost) return '';
    const out = [];
    if (cost.gold) out.push('🪙' + cost.gold);
    for (const k of D.RES_KEYS) if (cost[k]) out.push(D.RESOURCES[k].icon + cost[k]);
    return out.join(' ');
  }
  const relKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
  /** 英雄の定義を登録する（自動で作った英雄も D.heroById から引けるようにする） */
  function registerDef(def) { D.heroById[def.id] = def; if (!def.talents) def.talents = HG.talentsFor(def); return def; }
  for (const h of D.HEROES) registerDef(h);
  function startBuildings() {
    const b = {};
    for (const k of D.BUILDING_ORDER) b[k] = D.BUILDINGS[k].start;
    return b;
  }

  function newState() {
    const heroes = {};
    const heroDefs = {};
    const usedNames = D.HEROES.map(h => h.name);
    const used = new Set(usedNames);
    const starters = [];
    ['warrior', 'priest', 'swordsman'].forEach((cls, i) => {
      const def = registerDef(HG.generate(Math.random, 1, used, i + 1, cls));
      used.add(def.name); usedNames.push(def.name);
      heroDefs[def.id] = def;
      heroes[def.id] = newOwned(def.id);
      heroes[def.id].trust += 10;                  // 最初からいる仲間は少しだけ信頼している
      starters.push(def.id);
    });
    const rel = {};
    for (let i = 0; i < starters.length; i++) for (let j = i + 1; j < starters.length; j++) rel[relKey(starters[i], starters[j])] = 15;
    return {
      v: VERSION,
      gems: D.START_GEMS,
      gold: D.START_GOLD,
      shards: 0,
      heroes,
      party: starters.concat([null, null]).slice(0, D.PARTY_SIZE),
      rows: {},
      tactics: Object.assign({}, D.DEFAULT_TACTICS),
      cleared: 0,
      pity: 0,
      speed: 1,
      seenIntro: false,
      seenDeathWarning: false,
      fallen: [],                                   // 慰霊碑: 倒れた英雄の記録
      stats: { pulls: 0, battles: 0, wins: 0, lost: 0, promotions: 0, farewells: 0, commands: 0 },
      difficulty: rollDifficulty(),                 // 世界の難易度（始めたときにランダムで決まる）
      base: { name: randomBaseName(), buildings: startBuildings() },
      heroTactics: {},                              // 英雄ごとの「狙う敵」（戦略室 Lv5）
      proposals: [],                                // 英雄からの提案（待機所）
      items: [],                                    // 武器倉庫にある装備 [{ uid, kind, tier }]
      potions: { styptic: 0, calm: 0, heal: 0 },    // 錬金場で作った薬
      nextUid: 1,
      worldSaved: false,
      // 第5版
      heroDefs,                                     // 自動で作った英雄の定義（id → 定義）
      usedNames,                                    // 一度でも出た名前（同じ英雄は二度と出ない）
      everSummoned: [],                             // 一度でも出た特別な英雄
      serial: 4,
      rel,                                          // 英雄どうしの仲（"a|b" → -100〜100）
      quarrels: [],                                 // 喧嘩 [{ id, a, b, at }]
      clock: { last: Date.now(), ticks: 0 },        // 待機室の時間
      log: [],                                      // 待機室で起きたこと
      seed: 1 + Math.floor(Math.random() * 99999),  // 塔のマップの種
      // 第6版
      res: Object.assign({}, D.START_RES),          // 物資（食料・木材と石材・鉱石・魔石）
      fort: { wall: 1, tower: 0 },                  // 陣地（城壁・見張り塔）
      daily: { day: '', tries: 0 },                 // 曜日のダンジョンに入った回数（その日の分）
      hungry: false,                                // 食料が尽きている
    };
  }

  function int(v, d) { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; }
  function initialRel(a, b, rng) {
    const da = D.heroById[a], db = D.heroById[b];
    const base = (D.REL_COMPAT[da.pers] || {})[db.pers] || 0;
    return Math.round(base + (rng() - 0.5) * 30 + (da.land && da.land === db.land ? 10 : 0));
  }

  function sanitizeOwned(id, h, version) {
    const def = D.heroById[id];
    const out = newOwned(id);
    const b = (h.bonus && typeof h.bonus === 'object') ? h.bonus : {};
    for (const k of D.STAT_KEYS) out.bonus[k] = Math.max(0, Math.min(1, Number(b[k]) || 0));
    out.injured = Math.max(0, int(h.injured, 0));
    out.activity = typeof h.activity === 'string' ? h.activity : 'wander';
    out.work = typeof h.work === 'string' ? h.work : null;
    out.joined = int(h.joined, Date.now());
    out.star = Math.min(D.MAX_STAR, Math.max(def.rarity, int(h.star, def.rarity)));
    out.lv = Math.min(D.STARS[out.star].maxLv, Math.max(1, int(h.lv, 1)));
    out.exp = Math.max(0, int(h.exp, 0));
    if (version >= 2) {
      out.trust = clampTrust(int(h.trust, out.trust));
      const eq = (h.equip && typeof h.equip === 'object') ? h.equip : {};
      out.equip = { weapon: Math.max(0, Math.min(5, int(eq.weapon, 0))), armor: Math.max(0, Math.min(5, int(eq.armor, 0))) };
      const tr = Array.isArray(h.traits) ? h.traits.filter(t => t && D.TRAITS[t.id]) : [];
      const seen = new Set();
      const clean = [];
      for (const t of tr) {
        if (seen.has(t.id) || clean.length >= traitSlots(out.star)) continue;
        seen.add(t.id);
        clean.push({ id: t.id, lv: Math.min(D.MAX_TRAIT_LV, Math.max(1, int(t.lv, 1))) });
      }
      if (clean.length > 0) out.traits = clean;
    } else {
      out.trust = clampTrust(out.trust + 10);
    }
    return out;
  }

  /** 保存データを確かめて整える（前の版のデータもここで引き継ぐ） */
  function sanitize(s) {
    const base = newState();
    if (!s || typeof s !== 'object' || ![1, 2, 3, 4, 5, 6].includes(s.v)) return base;
    const version = s.v;
    // 自動で作った英雄の定義を先に登録する
    const defs = {};
    for (const [id, def] of Object.entries((s.heroDefs && typeof s.heroDefs === 'object') ? s.heroDefs : {})) {
      if (def && def.id === id && D.CLASSES[def.cls] && def.look && def.name) defs[id] = registerDef(def);
    }
    const out = Object.assign(base, s, { v: VERSION });
    out.heroDefs = defs;
    out.tactics = Object.assign({}, D.DEFAULT_TACTICS, s.tactics || {});
    out.heroes = {};
    let shards = Math.max(0, int(s.shards, 0));
    for (const [id, h] of Object.entries(s.heroes || {})) {
      if (!D.heroById[id] || !h) continue;
      out.heroes[id] = sanitizeOwned(id, h, version);
      if (version === 1) shards += Math.max(0, int(h.awaken, 0)) * D.GACHA.dupShards[D.heroById[id].rarity];
    }
    out.shards = shards;
    if (Object.keys(out.heroes).length === 0 && version === 1) return base;
    const party = Array.isArray(s.party) ? s.party.slice(0, D.PARTY_SIZE) : [];
    while (party.length < D.PARTY_SIZE) party.push(null);
    const seen = new Set();
    out.party = party.map(id => (id && out.heroes[id] && !seen.has(id) && seen.add(id)) ? id : null);
    // 第3版まで（30階）の進み具合は、100階の塔に引き伸ばす
    const oldCleared = Math.max(0, int(s.cleared, 0));
    out.cleared = Math.min(D.FLOORS.length, version < 4 ? Math.round(Math.min(30, oldCleared) * 10 / 3) : oldCleared);
    out.gems = Math.max(0, int(s.gems, 0));
    out.gold = Math.max(0, int(s.gold, 0));
    out.pity = Math.max(0, int(s.pity, 0));
    out.speed = version < 6 ? 1 : [1, 2, 4].includes(s.speed) ? s.speed : 1;
    out.fallen = Array.isArray(s.fallen) ? s.fallen.filter(f => f && D.heroById[f.id]).slice(-50) : [];
    out.stats = Object.assign(base.stats, s.stats || {});
    out.seenDeathWarning = !!s.seenDeathWarning;
    // 第3版: 世界の難易度・待機所の施設・英雄ごとの作戦
    out.difficulty = D.DIFFICULTIES[s.difficulty] ? s.difficulty : 'normal';
    const sb = (s.base && typeof s.base === 'object') ? s.base : {};
    out.base = { name: typeof sb.name === 'string' && sb.name.trim() ? sb.name.trim().slice(0, 30) : base.base.name, buildings: {} };
    for (const k of D.BUILDING_ORDER) {
      const def = D.BUILDINGS[k];
      let lv = sb.buildings ? int(sb.buildings[k], def.start) : def.start;
      if (version < 3) {
        // 前の版からは、今いる英雄が暮らせる宿舎と、進み具合に合った戦略室を用意する
        if (k === 'dorm') { lv = 1; while (lv < D.BUILDING_MAX && D.DORM_CAP[lv] < Object.keys(out.heroes).length) lv++; }
        if (k === 'strategy') lv = Math.min(D.BUILDING_MAX, Math.floor(oldCleared / 5));
      }
      out.base.buildings[k] = Math.max(def.start, Math.min(D.BUILDING_MAX, lv));
    }
    out.heroTactics = {};
    for (const [id, t] of Object.entries(s.heroTactics || {})) {
      if (out.heroes[id] && t && D.TACTICS.target.options.some(o => o.value === t.target)) out.heroTactics[id] = { target: t.target };
    }
    out.stats.commands = Math.max(0, int(out.stats.commands, 0));
    // 第4版: 提案・装備・薬
    out.nextUid = Math.max(1, int(s.nextUid, 1));
    out.items = Array.isArray(s.items) ? s.items.filter(it => it && D.EQUIP_KINDS[it.kind] && int(it.tier, 0) >= 1 && int(it.tier, 0) <= 5)
      .map(it => ({ uid: Math.max(1, int(it.uid, out.nextUid++)), kind: it.kind, tier: int(it.tier, 1) })).slice(0, 60) : [];
    for (const it of out.items) out.nextUid = Math.max(out.nextUid, it.uid + 1);
    const sp = (s.potions && typeof s.potions === 'object') ? s.potions : {};
    out.potions = {};
    for (const k of Object.keys(D.POTIONS)) out.potions[k] = Math.max(0, Math.min(20, int(sp[k], 0)));
    out.proposals = Array.isArray(s.proposals) ? s.proposals.filter(p => p && out.heroes[p.heroId] && D.PROPOSALS[p.kind]).slice(0, 5) : [];
    out.worldSaved = !!s.worldSaved || out.cleared >= D.FLOORS.length;
    // 第5版: 一度だけの英雄・仲・喧嘩・待機室の時間
    const names = new Set(Array.isArray(s.usedNames) ? s.usedNames.filter(n => typeof n === 'string') : []);
    for (const h of D.HEROES) names.add(h.name);
    for (const d of Object.values(defs)) names.add(d.name);
    out.usedNames = [...names];
    const ever = new Set(Array.isArray(s.everSummoned) ? s.everSummoned : []);
    for (const id of Object.keys(out.heroes)) if (!defs[id]) ever.add(id);
    for (const f of out.fallen) if (!defs[f.id]) ever.add(f.id);
    out.everSummoned = [...ever].filter(id => D.heroById[id] && !D.heroById[id].generated);
    out.serial = Math.max(int(s.serial, 1), ...Object.keys(defs).map(id => int(id.slice(1), 0) + 1), 1);
    out.rel = {};
    const ids = Object.keys(out.heroes);
    const srel = (s.rel && typeof s.rel === 'object') ? s.rel : {};
    // 保存されていた仲を、保存されていた順のまま戻す。足りない組み合わせは新しく決める
    for (const [k, v] of Object.entries(srel)) { const [a, b] = k.split('|'); if (out.heroes[a] && out.heroes[b] && Number.isFinite(v) && k === relKey(a, b)) out.rel[k] = Math.max(-100, Math.min(100, v)); }
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const k = relKey(ids[i], ids[j]);
      if (!(k in out.rel)) out.rel[k] = initialRel(ids[i], ids[j], Math.random);
    }
    out.quarrels = Array.isArray(s.quarrels) ? s.quarrels.filter(q => q && out.heroes[q.a] && out.heroes[q.b]).slice(0, 3) : [];
    const c = (s.clock && typeof s.clock === 'object') ? s.clock : {};
    out.clock = { last: int(c.last, Date.now()), ticks: Math.max(0, int(c.ticks, 0)) };
    out.log = Array.isArray(s.log) ? s.log.slice(-40) : [];
    out.seed = int(s.seed, 1 + Math.floor(Math.random() * 99999));
    if (version < 5) {
      if (typeof s.base === 'object' && /待機所/.test(String(s.base && s.base.name))) out.base.name = randomBaseName();
      for (const k of ['plaza', 'training']) out.base.buildings[k] = Math.max(1, out.base.buildings[k]);
    }
    // 第6版: 物資・陣地・曜日のダンジョン
    const sr = (s.res && typeof s.res === 'object') ? s.res : D.START_RES;
    out.res = {};
    for (const k of D.RES_KEYS) out.res[k] = Math.max(0, Number.isFinite(Number(sr[k])) ? Number(sr[k]) : D.START_RES[k]);
    const sf = (s.fort && typeof s.fort === 'object') ? s.fort : {};
    out.fort = { wall: Math.max(1, Math.min(5, int(sf.wall, 1))), tower: Math.max(0, Math.min(5, int(sf.tower, 0))) };
    for (const k of D.RES_KEYS) out.res[k] = Math.min(D.RES_CAP[out.fort.wall], out.res[k]);
    for (const k of D.PROD_BUILDINGS) out.base.buildings[k] = Math.min(out.base.buildings[k], out.fort.wall);
    const sd = (s.daily && typeof s.daily === 'object') ? s.daily : {};
    out.daily = { day: typeof sd.day === 'string' ? sd.day : '', tries: Math.max(0, int(sd.tries, 0)) };
    out.hungry = !!s.hungry && out.res.food <= 0;
    for (const id of Object.keys(out.heroes)) { const w = out.heroes[id].work; if (w && !D.PROD_BUILDINGS.includes(w)) out.heroes[id].work = null; }
    // 戦略室でまだ使えない作戦は、ふつうの作戦にそろえる
    for (const key of Object.keys(D.TACTICS)) {
      if (D.TACTIC_UNLOCK[key] > out.base.buildings.strategy) out.tactics[key] = D.DEFAULT_TACTICS[key];
    }
    return out;
  }

  const Game = {
    state: null,
    storage: null,
    rng: Math.random,

    init(storage) {
      this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      let parsed = null;
      try {
        const raw = this.storage && this.storage.getItem(SAVE_KEY);
        parsed = raw ? JSON.parse(raw) : null;
      } catch (e) { parsed = null; }
      this.state = sanitize(parsed);
      this.ensureSomeone();
      return this.state;
    },

    save() {
      try { this.storage && this.storage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* 容量不足などは無視 */ }
    },

    reset() { this.state = newState(); this.save(); },

    // ---------- 英雄の定義 ----------
    talents(id) { return D.heroById[id].talents || HG.talentsFor(D.heroById[id]); },
    /** 訓練と戦闘で伸ばせる上限（★が上がると増える） */
    bonusCap(id, stat) { const t = this.talents(id)[stat]; return D.TALENT_CAP[t] * (1 + 0.25 * (this.owned(id).star - 1)); },
    addBonus(id, stat, amount) {
      const h = this.owned(id);
      if (!h || amount <= 0) return 0;
      const cap = this.bonusCap(id, stat);
      const before = h.bonus[stat] || 0;
      h.bonus[stat] = Math.min(cap, before + amount);
      return h.bonus[stat] - before;
    },
    isInjured(id) { const h = this.owned(id); return !!h && h.injured > 0; },

    // ---------- 仲 ----------
    rel(a, b) { if (a === b) return 100; const v = this.state.rel[relKey(a, b)]; return v == null ? 0 : v; },
    addRel(a, b, d) { if (a === b || !this.owned(a) || !this.owned(b)) return; const k = relKey(a, b); this.state.rel[k] = Math.max(-100, Math.min(100, Math.round((this.state.rel[k] || 0) + d))); },
    /** 仲の悪い組み合わせ（悪い順） */
    badPairs() {
      const out = [];
      for (const [k, v] of Object.entries(this.state.rel)) { const [a, b] = k.split('|'); if (this.owned(a) && this.owned(b) && v < D.QUARREL.line) out.push({ a, b, rel: v }); }
      return out.sort((x, y) => x.rel - y.rel);
    },
    addLog(text, kind) { this.state.log.push({ t: Date.now(), text, kind: kind || 'info' }); if (this.state.log.length > 40) this.state.log.shift(); },

    // ---------- 待機室の時間（現実の時間で進む） ----------
    /**
     * 現実の時間に合わせて待機室を進める。now は今の時刻（ミリ秒）。
     * online=false（起動したとき）は、閉じていた間の分をまとめて進める（最大 4 時間）。
     * 戻り値: その間に起きたことのまとめ
     */
    advance(now, online) {
      const s = this.state;
      now = now || Date.now();
      let ticks = Math.floor((now - s.clock.last) / D.TICK_MS);
      if (ticks <= 0) return null;
      const capped = ticks > D.OFFLINE_MAX_TICKS;
      ticks = Math.min(ticks, D.OFFLINE_MAX_TICKS);
      const sum = { ticks, gains: {}, quarrels: 0, proposals: 0, healed: [], noTalent: {}, res: {}, hungry: false };
      for (let i = 0; i < ticks; i++) this.tick(sum, online);
      s.clock.last = capped ? now : s.clock.last + ticks * D.TICK_MS;
      s.clock.ticks += ticks;
      // 閉じていた間の喧嘩は、マスターが戻ってきてから時間を数えはじめる
      for (const q of s.quarrels) if (!q.at) q.at = now;
      this.save();
      return sum;
    },

    /** 待機室の時間を1つ（1分）進める */
    tick(sum, online) {
      const s = this.state;
      for (const [k, v] of Object.entries({ gains: {}, quarrels: 0, proposals: 0, healed: [], noTalent: {}, res: {} })) if (sum[k] == null) sum[k] = v;
      const ids = Object.keys(s.heroes);
      const trainLv = this.buildingLv('training');
      const places = {};
      const prodBuilt = D.PROD_BUILDINGS.filter(k => this.buildingLv(k) > 0);
      const workers = {};
      for (const id of ids) {
        const h = s.heroes[id];
        const def = D.heroById[id];
        if (h.injured > 0) { h.injured--; h.activity = 'rest'; if (h.injured === 0) sum.healed.push(id); continue; }
        // 何をするかは性格で決まる（勝手に訓練して強くなる・物資づくりを手伝う）
        const w = { brave: [5, 2, 1, 2, 2], careful: [4, 2, 3, 1, 3], loyal: [4, 3, 2, 1, 4], whimsical: [2, 3, 2, 3, 1], caring: [3, 4, 2, 1, 4] }[def.pers].slice();
        const keys = ['train', 'social', 'rest', 'wander', 'work'];
        if (trainLv <= 0) w[0] = 0;
        if (!prodBuilt.length) w[4] = 0;
        let x = this.rng() * w.reduce((a, b) => a + b, 0), act = 'wander';
        for (let k = 0; k < 5; k++) { x -= w[k]; if (x < 0) { act = keys[k]; break; } }
        h.activity = act;
        h.work = act === 'work' ? prodBuilt[Math.floor(this.rng() * prodBuilt.length)] : null;
        if (h.work) workers[h.work] = (workers[h.work] || 0) + 1;
        const place = act === 'train' ? 'training' : act === 'social' ? 'plaza' : act === 'rest' ? 'dorm' : act === 'work' ? h.work : 'yard';
        (places[place] = places[place] || []).push(id);
        if (act === 'train') {
          if (s.hungry) continue;                                                          // おなかがすいていると訓練にならない
          const tal = this.talents(id);
          const stat = D.STAT_KEYS[Math.floor(this.rng() * 4)];
          const mult = D.TALENT_MULT[tal[stat]];
          if (mult <= 0) { sum.noTalent[id] = (sum.noTalent[id] || 0) + 1; continue; }   // 才能がない能力は伸びない
          const g = this.addBonus(id, stat, D.TRAIN_GAIN * mult * (1 + 0.2 * (trainLv - 1)));
          if (g > 0) { sum.gains[id] = sum.gains[id] || {}; sum.gains[id][stat] = (sum.gains[id][stat] || 0) + g; }
        }
      }
      // 同じ場所にいる英雄どうしの仲が変わる。仲が悪いと喧嘩になる
      const plazaLv = this.buildingLv('plaza');
      for (const [place, list] of Object.entries(places)) {
        if (list.length < 2) continue;
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
          const a = list[i], b = list[j];
          const compat = (D.REL_COMPAT[D.heroById[a].pers] || {})[D.heroById[b].pers] || 0;
          if (place === 'plaza' || place === 'dorm') this.addRel(a, b, (compat >= 0 ? 1 : -1) * (this.rng() < 0.6 ? 1 : 0) + (place === 'plaza' ? plazaLv * 0.3 : 0));
          const r = this.rel(a, b);
          if (r < D.QUARREL.line && (place === 'plaza' || place === 'dorm' || place === 'yard') && s.quarrels.length < 2 &&
              !s.quarrels.some(q => q.a === a || q.b === a || q.a === b || q.b === b) && this.rng() < D.QUARREL.chance * (-r / 50)) {
            s.quarrels.push({ id: s.nextUid++, a, b, at: online ? Date.now() : null, place });
            sum.quarrels++;
            this.addLog(`${D.heroById[a].name}と${D.heroById[b].name}が喧嘩を始めた`, 'quarrel');
          }
        }
      }
      // 広場で提案が生まれることがある
      if (this.rng() < 0.02 * plazaLv && this.maybePropose(true)) sum.proposals++;
      // 物資づくり（施設のレベルと、働いている英雄の数で決まる）
      for (const k of prodBuilt) {
        const lv = this.buildingLv(k);
        for (const [r, p] of Object.entries(D.PRODUCTION[k])) {
          const got = this.addRes(r, p.base * lv + p.worker * (workers[k] || 0));
          sum.res[r] = (sum.res[r] || 0) + got;
        }
      }
      // 英雄は食料を食べる。足りないと空腹になる
      const eat = ids.length * D.FOOD_PER_HERO;
      if (s.res.food >= eat) { s.res.food -= eat; sum.res.food = (sum.res.food || 0) - eat; if (s.hungry) { s.hungry = false; this.addLog('食料が届き、英雄たちの空腹がおさまった', 'info'); } }
      else {
        sum.res.food = (sum.res.food || 0) - s.res.food;
        s.res.food = 0;
        if (!s.hungry) { s.hungry = true; this.addLog('食料が尽きた。英雄たちが空腹になっている', 'hunger'); }
        sum.hungry = true;
        this.hungryTicks = (this.hungryTicks || 0) + 1;
        if (this.hungryTicks % 30 === 0) for (const id of ids) s.heroes[id].trust = clampTrust(s.heroes[id].trust - 1);
      }
    },

    // ---------- 第6版: 物資 ----------
    resCap() { return D.RES_CAP[this.state.fort.wall]; },
    /** 物資を足す（ためておける量まで）。実際に増えた量を返す */
    addRes(k, n) {
      const s = this.state;
      const before = s.res[k] || 0;
      s.res[k] = Math.max(0, Math.min(this.resCap(), before + n));
      return s.res[k] - before;
    },
    /** 1時間あたりにできる量（今働いている英雄の数で計算） */
    productionPerHour() {
      const out = { food: 0, wood: 0, ore: 0, mana: 0 };
      const workers = {};
      for (const h of Object.values(this.state.heroes)) if (h.work) workers[h.work] = (workers[h.work] || 0) + 1;
      for (const k of D.PROD_BUILDINGS) {
        const lv = this.buildingLv(k);
        if (!lv) continue;
        for (const [r, p] of Object.entries(D.PRODUCTION[k])) out[r] += (p.base * lv + p.worker * (workers[k] || 0)) * 60;
      }
      out.food -= Object.keys(this.state.heroes).length * D.FOOD_PER_HERO * 60;
      return out;
    },
    workersAt(k) { return Object.keys(this.state.heroes).filter(id => this.state.heroes[id].work === k); },
    /** 費用（{ gold, food, wood, ore, mana }）を払えるか。足りないものの名前を返す（払えるなら null） */
    lack(cost) {
      const s = this.state;
      if (!cost) return null;
      if (cost.gold && s.gold < cost.gold) return 'gold';
      for (const k of D.RES_KEYS) if (cost[k] && (s.res[k] || 0) < cost[k]) return k;
      return null;
    },
    pay(cost) {
      if (!cost || this.lack(cost)) return false;
      if (cost.gold) this.state.gold -= cost.gold;
      for (const k of D.RES_KEYS) if (cost[k]) this.state.res[k] -= cost[k];
      return true;
    },
    costText,

    // ---------- 第6版: 陣地（城壁・見張り塔） ----------
    fortLv(k) { return this.state.fort[k] || 0; },
    fortInfo(k) {
      const lv = this.fortLv(k);
      const def = D.FORT[k];
      if (lv >= def.max) return { can: false, reason: 'max', lv };
      const next = lv + 1;
      const cost = D.FORT_COST[k][next];
      const req = D.FORT_REQ[next];
      if (this.state.cleared < req) return { can: false, reason: 'floor', lv, next, cost, req };
      const l = this.lack(cost);
      if (l) return { can: false, reason: l, lv, next, cost, req };
      return { can: true, lv, next, cost, req };
    },
    buildFort(k) {
      const info = this.fortInfo(k);
      if (!info.can) return Object.assign({ ok: false }, info);
      this.pay(info.cost);
      this.state.fort[k] = info.next;
      this.addLog(`${D.FORT[k].name}を Lv${info.next} にした`, 'build');
      this.save();
      return { ok: true, lv: info.next };
    },
    /** 塔へ出かけるとき、食料を持たせる。足りなければ空腹で戦う（true を返す） */
    takeRations(n) {
      const need = n * D.RATION_PER_HERO;
      const s = this.state;
      if (s.res.food >= need) { s.res.food -= need; this.save(); return false; }
      s.res.food = 0;
      this.save();
      return true;
    },

    // ---------- 第6版: 曜日のダンジョン ----------
    dailyToday(now) { return D.DAILY[new Date(now || Date.now()).getDay()]; },
    dailyTriesLeft(now) { const d = this.state.daily; return d.day === dayKey(now) ? Math.max(0, D.DAILY_TRIES - d.tries) : D.DAILY_TRIES; },
    dailyTierOpen(t) { return this.state.cleared >= D.DAILY_TIERS[t].req; },
    /** 曜日のダンジョンに入る。戦闘に渡す設定を返す */
    dailyStart(tier, now) {
      const s = this.state;
      const T = D.DAILY_TIERS[tier];
      if (!T) return { ok: false, reason: 'bad' };
      if (!this.dailyTierOpen(tier)) return { ok: false, reason: 'floor', req: T.req };
      if (this.dailyTriesLeft(now) <= 0) return { ok: false, reason: 'tries' };
      const def = this.dailyToday(now);
      const key = dayKey(now);
      if (s.daily.day !== key) s.daily = { day: key, tries: 0 };
      s.daily.tries++;
      const z = D.ZONES[def.zone];
      let seed = (s.seed * 31 + s.daily.tries * 977 + new Date(now || Date.now()).getDate() * 7) >>> 0;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
      const size = tier >= 2 ? 4 : tier === 0 ? 2 : 3;
      const waves = [];
      for (let w = 0; w < 3; w++) { const wave = []; for (let i = 0; i < size; i++) wave.push(z.pool[Math.floor(rnd() * z.pool.length)]); waves.push(wave); }
      this.save();
      return { ok: true, def, tier, opts: { floor: { name: def.name, lv: T.lv, waves, zone: def.zone }, floorIndex: def.zone * D.FLOORS_PER_ZONE + 4,
        mission: 'hunt', caches: 3, label: `${def.name}（${T.name}）`, seed: seed % 99991 + 1 } };
    },
    /** 曜日のダンジョンの報酬（勝てば全部、負けても見つけた箱の分だけ） */
    dailyReward(def, tier, win, caches) {
      const T = D.DAILY_TIERS[tier];
      const k = (win ? 1 : 0) + 0.25 * (caches || 0);
      const out = {};
      for (const [r, v] of Object.entries(def.reward)) if (r !== 'exp') out[r] = Math.round(v * T.mult * k);
      return out;
    },

    /** 喧嘩を仲裁しないまま時間がたつと、ひどくなる（殺し合いになることもある） */
    updateQuarrels(now, online) {
      if (!online) return [];
      const s = this.state;
      const out = [];
      for (const q of s.quarrels.slice()) {
        if (!q.at || now - q.at < D.QUARREL.timeoutMs) continue;
        out.push(this.escalate(q));
      }
      return out;
    },
    escalate(q) {
      const s = this.state;
      s.quarrels = s.quarrels.filter(x => x.id !== q.id);
      const A = D.heroById[q.a], B = D.heroById[q.b];
      this.addRel(q.a, q.b, -12);
      const r = this.rel(q.a, q.b);
      const pa = this.power(q.a), pb = this.power(q.b);
      const loser = this.rng() < pb / (pa + pb) ? q.a : q.b;
      const winner = loser === q.a ? q.b : q.a;
      if (r <= D.QUARREL.murderLine && this.rng() < D.QUARREL.murderChance) {
        const h = s.heroes[loser];
        s.fallen.push({ id: loser, name: D.heroById[loser].name, star: h.star, lv: h.lv, floor: 0, battle: s.stats.battles, cause: 'murder', by: D.heroById[winner].name });
        this.removeHero(loser);
        s.stats.lost++;
        for (const id of Object.keys(s.heroes)) { s.heroes[id].trust = clampTrust(s.heroes[id].trust - 8); if (id !== winner) this.addRel(id, winner, -25); }
        const text = `${D.heroById[winner].name}が${D.heroById[loser].name}を殺した`;
        this.addLog(text, 'murder');
        this.save();
        return { kind: 'murder', killer: winner, victim: loser, text };
      }
      s.heroes[loser].injured = D.INJURY_TICKS;
      for (const id of [q.a, q.b]) if (s.heroes[id]) s.heroes[id].trust = clampTrust(s.heroes[id].trust - 3);
      const text = `${A.name}と${B.name}の喧嘩がひどくなり、${D.heroById[loser].name}がけがをした`;
      this.addLog(text, 'injury');
      this.save();
      return { kind: 'injury', a: q.a, b: q.b, loser, text };
    },
    /** 仲裁する。side: 'a'（a の味方）/ 'b' / 'both'（両方を叱る） */
    mediate(qid, side) {
      const s = this.state;
      const q = s.quarrels.find(x => x.id === qid);
      if (!q) return { ok: false };
      s.quarrels = s.quarrels.filter(x => x.id !== qid);
      const ha = s.heroes[q.a], hb = s.heroes[q.b];
      let text;
      if (side === 'both') {
        ha.trust = clampTrust(ha.trust - 2); hb.trust = clampTrust(hb.trust - 2);
        this.addRel(q.a, q.b, 14);
        text = `二人を叱った。${D.heroById[q.a].name}と${D.heroById[q.b].name}はしぶしぶ仲直りした`;
      } else {
        const win = side === 'a' ? q.a : q.b, lose = side === 'a' ? q.b : q.a;
        s.heroes[win].trust = clampTrust(s.heroes[win].trust + 5);
        s.heroes[lose].trust = clampTrust(s.heroes[lose].trust - 6);
        this.addRel(q.a, q.b, 6);
        text = `${D.heroById[win].name}の味方をした。${D.heroById[lose].name}は不満そうだ`;
      }
      this.addLog(text, 'mediate');
      this.save();
      return { ok: true, text };
    },

    // ---------- 待機所の施設 ----------
    buildingLv(k) { return this.state.base.buildings[k] || 0; },
    dormCap() { return D.DORM_CAP[Math.max(1, this.buildingLv('dorm'))]; },
    cmdCost() { return D.CMD_COST[this.buildingLv('strategy')]; },
    tacticUnlocked(key) { return this.buildingLv('strategy') >= D.TACTIC_UNLOCK[key]; },
    trainingShare() { return D.TRAINING_SHARE[this.buildingLv('training')]; },
    /** 建てる・レベルを上げるのに必要なものと、できるかどうか */
    buildInfo(k) {
      const lv = this.buildingLv(k);
      const def = D.BUILDINGS[k];
      if (lv >= D.BUILDING_MAX) return { can: false, reason: 'max', lv };
      const next = lv + 1;
      const cost = D.BUILD_COST[next];
      const req = D.BUILD_REQ[next];
      const price = Object.assign({ gold: cost }, D.BUILD_RES[next]);
      const base = { lv, next, cost, req, price };
      if (def.prod && next > this.fortLv('wall')) return Object.assign({ can: false, reason: 'wall' }, base);
      if (this.state.cleared < req) return Object.assign({ can: false, reason: 'floor' }, base);
      const l = this.lack(price);
      if (l) return Object.assign({ can: false, reason: l }, base);
      return Object.assign({ can: true }, base);
    },
    build(k) {
      const info = this.buildInfo(k);
      if (!info.can) return Object.assign({ ok: false }, info);
      this.pay(info.price);
      this.state.base.buildings[k] = info.next;
      this.save();
      return { ok: true, lv: info.next, cost: info.cost, isNew: info.next === 1 };
    },
    /** 建っている施設（下の階から） */
    floorsBuilt() { return D.BUILDING_ORDER.filter(k => this.buildingLv(k) > 0); },

    // ---------- 世界の難易度・滅んだ世界 ----------
    difficulty() { return D.DIFFICULTIES[this.state.difficulty]; },
    /** 区域のボスを倒して、その地方を取り戻したか */
    zoneCleared(zi) { return this.state.cleared >= (zi + 1) * D.FLOORS_PER_ZONE; },
    landFreed(landId) { const zi = D.ZONES.findIndex(z => z.land === landId); return zi >= 0 && this.zoneCleared(zi); },
    /** その英雄がいま思い出している記憶の数（★2で1つ、★5で4つ） */
    memoryCount(id) { return Math.min(4, this.owned(id).star - 1); },

    // ---------- 英雄ごとの作戦（戦略室 Lv5） ----------
    heroTarget(id) { const t = this.state.heroTactics[id]; return t ? t.target : null; },
    setHeroTarget(id, target) {
      if (!target) delete this.state.heroTactics[id];
      else this.state.heroTactics[id] = { target };
      this.save();
    },

    /** 戦闘に渡す設定（難易度・命令ゲージ） */
    battleOptions() { return { enemyMult: this.difficulty().enemy, cmdCost: this.cmdCost(), potions: Object.assign({}, this.state.potions), rels: (a, b) => this.rel(a, b), seed: this.state.seed, scout: this.fortLv('tower') }; },

    // ---------- 装備（武器倉庫） ----------
    maxForgeTier() { return this.buildingLv('armory'); },
    forgeCost(tier) { return D.EQUIP_TIERS[tier].cost; },
    forgePrice(tier) { const t = D.EQUIP_TIERS[tier]; return { gold: t.cost, ore: t.ore || 0, mana: t.mana || 0 }; },
    /** 装備を作る。heroId があれば、その英雄にそのまま持たせる */
    forge(kind, tier, heroId) {
      const s = this.state;
      if (!D.EQUIP_KINDS[kind] || !D.EQUIP_TIERS[tier]) return { ok: false, reason: 'bad' };
      if (tier > this.maxForgeTier()) return { ok: false, reason: 'armory' };
      const cost = this.forgeCost(tier);
      const price = this.forgePrice(tier);
      const l = this.lack(price);
      if (l) return { ok: false, reason: l, cost, price };
      this.pay(price);
      const item = { uid: s.nextUid++, kind, tier };
      s.items.push(item);
      if (heroId) this.equip(heroId, item.uid);
      this.save();
      return { ok: true, item, cost };
    },
    /** 倉庫の装備を英雄に持たせる（持っていた装備は倉庫に戻る） */
    equip(heroId, uid) {
      const s = this.state;
      const h = this.owned(heroId);
      const i = s.items.findIndex(it => it.uid === uid);
      if (!h || i < 0) return false;
      const item = s.items[i];
      s.items.splice(i, 1);
      const cur = h.equip[item.kind];
      if (cur) s.items.push({ uid: s.nextUid++, kind: item.kind, tier: cur });
      h.equip[item.kind] = item.tier;
      this.save();
      return true;
    },
    unequip(heroId, kind) {
      const h = this.owned(heroId);
      if (!h || !h.equip[kind]) return false;
      this.state.items.push({ uid: this.state.nextUid++, kind, tier: h.equip[kind] });
      h.equip[kind] = 0;
      this.save();
      return true;
    },

    // ---------- 薬（錬金場） ----------
    potionCap() { return D.POTION_CAP[this.buildingLv('alchemy')]; },
    potionTotal() { return Object.values(this.state.potions).reduce((a, b) => a + b, 0); },
    canBrew(key) { return this.buildingLv('alchemy') >= D.POTIONS[key].lv; },
    brew(key) {
      const s = this.state;
      const p = D.POTIONS[key];
      if (!p || !this.canBrew(key)) return { ok: false, reason: 'alchemy' };
      if (this.potionTotal() >= this.potionCap()) return { ok: false, reason: 'cap' };
      const price = { gold: p.cost, mana: p.mana || 0 };
      const l = this.lack(price);
      if (l) return { ok: false, reason: l, cost: p.cost, price };
      this.pay(price);
      s.potions[key]++;
      this.save();
      return { ok: true };
    },

    // ---------- 英雄からの提案（待機所） ----------
    /** 戦闘のあとなどに、英雄が提案をすることがある。できた提案を返す */
    maybePropose(force) {
      const s = this.state;
      const plaza = this.buildingLv('plaza');
      if (s.proposals.length >= D.PLAZA_MAX[plaza]) return null;
      if (!force && this.rng() > D.PLAZA_CHANCE[plaza]) return null;
      const ids = Object.keys(s.heroes).filter(id => !s.proposals.some(p => p.heroId === id));
      if (!ids.length) return null;
      const heroId = ids[Math.floor(this.rng() * ids.length)];
      const h = this.owned(heroId);
      const def = D.heroById[heroId];
      const kinds = ['train', 'feast', 'tactic'];
      if (!this.inParty(heroId)) kinds.push('join', 'join');
      if (this.buildingLv('alchemy') >= 1 && this.potionTotal() < this.potionCap()) kinds.push('potion');
      if (this.buildingLv('armory') >= 1 && (h.equip.weapon < this.maxForgeTier() || h.equip.armor < this.maxForgeTier())) kinds.push('forge');
      const kind = kinds[Math.floor(this.rng() * kinds.length)];
      const p = { id: s.nextUid++, heroId, kind, data: {} };
      if (kind === 'train') p.data.cost = 100 + h.lv * 20;
      if (kind === 'feast') p.data.food = 60;
      if (kind === 'tactic') {
        const wish = { brave: ['stance', 'attack'], careful: ['stance', 'defend'], caring: ['healLine', 0.7], loyal: ['stance', 'balance'], whimsical: ['target', 'auto'] }[def.pers];
        p.data = this.tacticUnlocked(wish[0]) ? { key: wish[0], value: wish[1] } : { key: 'stance', value: def.pers === 'brave' ? 'attack' : 'defend' };
        if (s.tactics[p.data.key] === p.data.value) p.data = { key: 'stance', value: s.tactics.stance === 'attack' ? 'balance' : 'attack' };
      }
      if (kind === 'potion') { const keys = Object.keys(D.POTIONS).filter(k => this.canBrew(k)); p.data.potion = keys[Math.floor(this.rng() * keys.length)]; p.data.cost = D.POTIONS[p.data.potion].cost; }
      if (kind === 'forge') { const k = h.equip.weapon <= h.equip.armor ? 'weapon' : 'armor'; p.data.equip = k; p.data.tier = Math.min(this.maxForgeTier(), h.equip[k] + 1); p.data.cost = this.forgeCost(p.data.tier); }
      s.proposals.push(p);
      this.save();
      return p;
    },
    /** 提案の文（「〜が〜を提案しています」） */
    proposalText(p) {
      const n = D.heroById[p.heroId].name;
      let what = D.PROPOSALS[p.kind].name;
      if (p.kind === 'tactic') {
        const opt = D.TACTICS[p.data.key].options.find(o => o.value === p.data.value);
        what = p.data.key === 'stance' ? `作戦「${opt ? opt.name : ''}」` : `作戦「${D.TACTICS[p.data.key].label}: ${opt ? opt.name : ''}」`;
      }
      if (p.kind === 'potion') what = `${D.POTIONS[p.data.potion].name}づくり`;
      if (p.kind === 'forge') what = `${D.EQUIP_TIERS[p.data.tier].name}の${D.EQUIP_KINDS[p.data.equip].name}の新調`;
      return `${n}が${what}を提案しています`;
    },
    answerProposal(pid, accept) {
      const s = this.state;
      const i = s.proposals.findIndex(p => p.id === pid);
      if (i < 0) return { ok: false, reason: 'none' };
      const p = s.proposals[i];
      const h = this.owned(p.heroId);
      if (!accept) {
        s.proposals.splice(i, 1);
        h.trust = clampTrust(h.trust - 2);
        this.save();
        return { ok: true, accepted: false, trust: -2 };
      }
      const cost = p.data.cost || 0;
      const price = { gold: cost, food: p.data.food || 0 };
      const l = this.lack(price);
      if (l) return { ok: false, reason: l, cost, price };
      this.pay(price);
      let detail = '';
      if (p.kind === 'train') { const up = this.gainExp(p.heroId, Math.round(expToNext(h.lv) * 0.6)); detail = up ? `Lv${h.lv} になった` : '経験値を得た'; }
      if (p.kind === 'join') {
        if (!this.inParty(p.heroId)) {
          const empty = s.party.indexOf(null);
          if (empty >= 0) s.party[empty] = p.heroId;
          else { const weakest = this.partyIds().reduce((m, id) => (this.power(id) < this.power(m) ? id : m)); s.party[s.party.indexOf(weakest)] = p.heroId; detail = `${D.heroById[weakest].name}と交代した`; }
        }
      }
      if (p.kind === 'tactic') s.tactics[p.data.key] = p.data.value;
      if (p.kind === 'feast') for (const id of Object.keys(s.heroes)) s.heroes[id].trust = clampTrust(s.heroes[id].trust + 2);
      if (p.kind === 'potion') { if (this.potionTotal() < this.potionCap()) s.potions[p.data.potion]++; }
      if (p.kind === 'forge') { const item = { uid: s.nextUid++, kind: p.data.equip, tier: p.data.tier }; s.items.push(item); this.equip(p.heroId, item.uid); }
      const d = D.PROPOSALS[p.kind].trust;
      h.trust = clampTrust(h.trust + d);
      s.proposals.splice(s.proposals.findIndex(x => x.id === pid), 1);
      this.save();
      return { ok: true, accepted: true, trust: d, cost, detail };
    },

    // ---------- 英雄 ----------
    owned(id) { return this.state.heroes[id] || null; },
    def(id) { return D.heroById[id]; },
    star(id) { return this.owned(id).star; },
    maxLv(id) { return D.STARS[this.star(id)].maxLv; },
    rowOf(id) { return this.state.rows[id] || D.CLASSES[D.heroById[id].cls].row; },
    stats(id) { return E.heroStats(D.heroById[id], this.owned(id)); },
    power(id) { return E.power(this.stats(id)); },
    trustTier(id) { return E.trustTier(this.owned(id).trust); },

    ownedList() {
      return Object.keys(this.state.heroes).sort((a, b) => {
        const ha = this.state.heroes[a], hb = this.state.heroes[b];
        return hb.star - ha.star || hb.lv - ha.lv || D.HEROES.indexOf(D.heroById[a]) - D.HEROES.indexOf(D.heroById[b]);
      });
    },

    partyIds() { return this.state.party.filter(id => id && !this.isInjured(id)); },

    partyForBattle() {
      const perHero = this.tacticUnlocked('perHero');
      return this.partyIds().map(id => ({
        def: D.heroById[id],
        owned: JSON.parse(JSON.stringify(this.owned(id))),
        row: this.rowOf(id),
        tactic: perHero && this.heroTarget(id) ? { target: this.heroTarget(id) } : null,
      }));
    },

    partyPower() { return this.partyIds().reduce((s, id) => s + this.power(id), 0); },
    inParty(id) { return this.state.party.includes(id); },

    togglePartyMember(id) {
      const p = this.state.party;
      const i = p.indexOf(id);
      if (i >= 0) { p[i] = null; this.save(); return 'removed'; }
      const empty = p.indexOf(null);
      if (empty < 0) return 'full';
      p[empty] = id;
      this.save();
      return 'added';
    },

    removeFromSlot(i) { this.state.party[i] = null; this.save(); },

    toggleRow(id) {
      this.state.rows[id] = this.rowOf(id) === 'front' ? 'back' : 'front';
      this.save();
      return this.state.rows[id];
    },

    /** おすすめ編成: 戦士1・僧侶1を優先し、残りを戦力の高い順に */
    autoParty() {
      const list = this.ownedList().slice().sort((a, b) => this.power(b) - this.power(a));
      const pick = [];
      const take = (cls) => {
        const id = list.find(x => D.heroById[x].cls === cls && !pick.includes(x));
        if (id) pick.push(id);
      };
      take('warrior');
      take('priest');
      for (const id of list) if (pick.length < D.PARTY_SIZE && !pick.includes(id)) pick.push(id);
      const party = pick.slice(0, D.PARTY_SIZE);
      while (party.length < D.PARTY_SIZE) party.push(null);
      this.state.party = party;
      this.save();
    },

    /** 経験値を加える。上がったレベル数を返す */
    gainExp(id, amount) {
      const h = this.owned(id);
      const maxLv = this.maxLv(id);
      if (h.lv >= maxLv) return 0;
      const before = h.lv;
      h.exp += amount;
      while (h.lv < maxLv && h.exp >= expToNext(h.lv)) {
        h.exp -= expToNext(h.lv);
        h.lv++;
      }
      if (h.lv >= maxLv) h.exp = 0;
      return h.lv - before;
    },

    trainCost(id) {
      const h = this.owned(id);
      if (h.lv >= this.maxLv(id)) return null;
      return (expToNext(h.lv) - h.exp) * 2;
    },

    train(id) {
      const cost = this.trainCost(id);
      if (cost === null) return { ok: false, reason: 'max' };
      if (this.state.gold < cost) return { ok: false, reason: 'gold', cost };
      this.state.gold -= cost;
      const h = this.owned(id);
      this.gainExp(id, expToNext(h.lv) - h.exp);
      this.save();
      return { ok: true, cost, lv: h.lv };
    },

    // ---------- ★の昇級 ----------
    promoteInfo(id) {
      const h = this.owned(id);
      if (h.star >= D.MAX_STAR) return { can: false, reason: 'max' };
      const cost = D.STARS[h.star].cost;
      if (h.lv < this.maxLv(id)) return { can: false, reason: 'level', cost, needLv: this.maxLv(id) };
      if (this.state.shards < cost) return { can: false, reason: 'shards', cost };
      return { can: true, cost };
    },

    promote(id) {
      const info = this.promoteInfo(id);
      if (!info.can) return Object.assign({ ok: false }, info);
      const h = this.owned(id);
      this.state.shards -= info.cost;
      h.star++;
      h.trust = clampTrust(h.trust + 10);
      let newTrait = null;
      if (h.traits.length < traitSlots(h.star)) {
        newTrait = { id: randomTrait(this.rng, h.traits.map(t => t.id)), lv: 1 };
        h.traits.push(newTrait);
      }
      this.state.stats.promotions++;
      this.save();
      const memory = D.heroById[id].memories[this.memoryCount(id) - 1] || null;
      return { ok: true, star: h.star, newTrait, cost: info.cost, memory };
    },

    // ---------- 送り出す（特性の継承・合成） ----------
    /** 特性を受け継いだら receiver の特性がどうなるかを返す */
    inheritPreview(receiverId, trait) {
      const r = this.owned(receiverId);
      const same = r.traits.find(t => t.id === trait.id);
      if (same) {
        const lv = Math.min(D.MAX_TRAIT_LV, same.lv + trait.lv);
        return { mode: 'merge', id: trait.id, from: same.lv, lv, wasted: same.lv + trait.lv > D.MAX_TRAIT_LV };
      }
      if (r.traits.length < traitSlots(r.star)) return { mode: 'add', id: trait.id, lv: trait.lv };
      const low = r.traits.reduce((m, t) => (t.lv < m.lv ? t : m));
      return { mode: 'replace', id: trait.id, lv: trait.lv, replaced: low.id, replacedLv: low.lv };
    },

    canFuse() { return this.buildingLv('fusion') >= 1; },
    inheritCost(trait) { return Math.round(200 * trait.lv * (D.FUSION_COST[this.buildingLv('fusion')] || 1) / 10) * 10; },
    farewellShards(id) { return D.FAREWELL_SHARDS[D.heroById[id].rarity] * this.owned(id).star; },

    /** 英雄を送り出す。receiverId があれば、traitIndex の特性を受け継がせる */
    farewell(id, receiverId, traitIndex) {
      const s = this.state;
      const h = this.owned(id);
      if (!h) return { ok: false, reason: 'none' };
      if (Object.keys(s.heroes).length <= 1) return { ok: false, reason: 'last' };
      let inherit = null;
      if (receiverId) {
        const r = this.owned(receiverId);
        const trait = h.traits[traitIndex || 0];
        if (!r || receiverId === id || !trait) return { ok: false, reason: 'bad' };
        if (!this.canFuse()) return { ok: false, reason: 'fusion' };
        const cost = this.inheritCost(trait);
        if (s.gold < cost) return { ok: false, reason: 'gold', cost };
        s.gold -= cost;
        inherit = this.inheritPreview(receiverId, trait);
        if (inherit.mode === 'merge') r.traits.find(t => t.id === trait.id).lv = inherit.lv;
        else if (inherit.mode === 'add') r.traits.push({ id: trait.id, lv: trait.lv });
        else r.traits[r.traits.findIndex(t => t.id === inherit.replaced)] = { id: trait.id, lv: trait.lv };
        inherit.receiver = receiverId;
        inherit.cost = cost;
      }
      const shards = this.farewellShards(id);
      s.shards += shards;
      // 送り出す英雄の装備は倉庫に戻る
      for (const k of Object.keys(D.EQUIP_KINDS)) if (h.equip[k]) s.items.push({ uid: s.nextUid++, kind: k, tier: h.equip[k] });
      this.removeHero(id);
      s.stats.farewells++;
      this.save();
      return { ok: true, shards, inherit };
    },

    removeHero(id) {
      const s = this.state;
      delete s.heroes[id];
      delete s.rows[id];
      delete s.heroTactics[id];
      s.proposals = s.proposals.filter(p => p.heroId !== id);
      s.quarrels = s.quarrels.filter(q => q.a !== id && q.b !== id);
      for (const k of Object.keys(s.rel)) if (k.split('|').includes(id)) delete s.rel[k];
      s.party = s.party.map(x => (x === id ? null : x));
    },

    /** 英雄が一人もいなくなり、召喚もできないときは、流れ者の英雄が来てくれる */
    ensureSomeone() {
      const s = this.state;
      if (Object.keys(s.heroes).length > 0 || s.gems >= D.GACHA.cost1) return null;
      const r = this.welcome(this.newHeroDef(1, this.rng));
      s.party[0] = r.id;
      this.save();
      return r.id;
    },

    // ---------- ガチャ ----------
    /** 召喚の確率（次元の門のレベルで★3が出やすくなる） */
    gachaRates() {
      const r3 = D.GATE_RATE3[Math.max(1, this.buildingLv('gate'))];
      return { 3: r3, 2: D.GACHA.rates[2], 1: Math.round((1 - r3 - D.GACHA.rates[2]) * 100) / 100 };
    },

    rollRarity(rng, guaranteeTwo) {
      if (this.state.pity + 1 >= D.GACHA.pityMax) return 3;
      const rates = this.gachaRates();
      const r = rng();
      if (r < rates[3]) return 3;
      if (r < rates[3] + rates[2]) return 2;
      return guaranteeTwo ? 2 : 1;
    },

    roomLeft() { return this.dormCap() - Object.keys(this.state.heroes).length; },

    /** 新しい英雄を待機室に迎える（宿舎がいっぱいなら帰ってしまい、二度と会えない） */
    welcome(def) {
      const s = this.state;
      if (D.heroById[def.id] && !def.generated && s.everSummoned.includes(def.id) && !s.heroes[def.id]) return { id: def.id, isNew: false, gone: true };
      if (def.generated) { registerDef(def); s.heroDefs[def.id] = def; }
      else if (!s.everSummoned.includes(def.id)) s.everSummoned.push(def.id);
      if (!s.usedNames.includes(def.name)) s.usedNames.push(def.name);
      if (this.roomLeft() <= 0) {
        const shards = D.FAREWELL_SHARDS[def.rarity];
        s.shards += shards;
        if (def.generated) delete s.heroDefs[def.id];
        return { id: def.id, isNew: false, full: true, shards, name: def.name, rarity: def.rarity, def };
      }
      s.heroes[def.id] = newOwned(def.id, this.rng);
      for (const other of Object.keys(s.heroes)) if (other !== def.id) s.rel[relKey(def.id, other)] = initialRel(def.id, other, this.rng);
      return { id: def.id, isNew: true, name: def.name, rarity: def.rarity, def };
    },
    /** 新しく英雄を1人作る（特別な英雄は、一度も出ていなければ低い確率で出る） */
    newHeroDef(rarity, rng) {
      const s = this.state;
      const specials = D.HEROES.filter(h => h.rarity === rarity && !s.everSummoned.includes(h.id) && !s.heroes[h.id]);
      if (specials.length && rng() < 0.12) return specials[Math.floor(rng() * specials.length)];
      const def = HG.generate(rng, rarity, new Set(s.usedNames), s.serial++);
      return def;
    },
    addHero(id) {
      const s = this.state;
      if (!s.heroes[id] && D.heroById[id] && !D.heroById[id].generated) return this.welcome(D.heroById[id]);
      if (!s.heroes[id]) {
        if (this.roomLeft() <= 0) {
          // 宿舎がいっぱい: 新しい英雄は門の向こうへ帰り、星の欠片を残していく
          const shards = D.FAREWELL_SHARDS[D.heroById[id].rarity];
          s.shards += shards;
          return { id, isNew: false, full: true, shards };
        }
        s.heroes[id] = newOwned(id, this.rng);
        return { id, isNew: true };
      }
      const shards = D.GACHA.dupShards[D.heroById[id].rarity];
      s.shards += shards;
      return { id, isNew: false, shards };
    },

    pull(n, rng) {
      rng = rng || this.rng;
      const cost = n === 10 ? D.GACHA.cost10 : D.GACHA.cost1 * n;
      const s = this.state;
      if (s.gems < cost) return null;
      s.gems -= cost;
      const results = [];
      for (let i = 0; i < n; i++) {
        const lastOfTen = n === 10 && i === n - 1 && !results.some(r => r.rarity >= 2);
        const rarity = this.rollRarity(rng, lastOfTen);
        s.pity = rarity === 3 ? 0 : s.pity + 1;
        results.push(this.welcome(this.newHeroDef(rarity, rng)));
      }
      s.stats.pulls += n;
      for (const r of results) {
        if (r.isNew && s.party.includes(null) && !s.party.includes(r.id)) s.party[s.party.indexOf(null)] = r.id;
      }
      this.save();
      return results;
    },

    pityLeft() { return D.GACHA.pityMax - this.state.pity; },

    // ---------- 塔 ----------
    isUnlocked(fi) { return fi <= this.state.cleared && fi < D.FLOORS.length; },

    /**
     * 戦闘の結果を反映して、報酬の内訳を返す。
     * fallenIds の英雄は永久に失われる。
     */
    applyBattleResult(fi, win, partyIds, fallenIds, reason, extra) {
      const s = this.state;
      fallenIds = fallenIds || [];
      extra = extra || {};
      // 使った薬
      for (const [k, n] of Object.entries(extra.potionsUsed || {})) if (s.potions[k] != null) s.potions[k] = Math.max(0, s.potions[k] - n);
      s.stats.battles++;
      const survivors = partyIds.filter(id => !fallenIds.includes(id) && s.heroes[id]);
      const daily = extra.daily || null;          // 曜日のダンジョン { def, tier, caches }
      const dailyLv = daily ? D.DAILY_TIERS[daily.tier].lv : 0;
      const exp = daily ? Math.round((40 + 9 * dailyLv) * (win ? (daily.def.reward.exp || 1) : 0.3))
        : Math.round(floorExp(fi) * (win ? 1 : 0.3));
      const rm = this.difficulty().reward;
      let gold = win && !daily ? Math.round(floorGold(fi) * rm) : 0;
      let gems = 0;
      let shards = 0;
      let firstClear = false;
      const dailyGot = {};
      if (daily) {
        const rw = this.dailyReward(daily.def, daily.tier, win, daily.caches);
        for (const [k, v] of Object.entries(rw)) {
          if (k === 'gold') gold += v; else if (k === 'gems') gems += v; else if (k === 'shards') shards += v;
          else { const g = this.addRes(k, v); if (g > 0) dailyGot[k] = Math.round(g); continue; }
          dailyGot[k] = v;
        }
        if (win) s.stats.wins++;
      } else if (win) {
        s.stats.wins++;
        if (fi + 1 > s.cleared) {
          s.cleared = fi + 1;
          gems = Math.round(firstClearGems(fi) * rm / 10) * 10;
          shards = Math.round(firstClearShards(fi) * rm);
          firstClear = true;
        } else {
          shards = Math.round(repeatShards(fi) * rm);
        }
      }
      s.gold += gold;
      s.gems += gems;
      s.shards += shards;
      // 物資（勝つと、その階で集めた木材と石材・鉱石・魔石を持ち帰る）
      const supplies = daily ? dailyGot : {};
      if (win && !daily) {
        const add = (k, n) => { const g = this.addRes(k, Math.round(n * rm)); if (g > 0) supplies[k] = Math.round(g); };
        add('wood', 8 + fi * 0.5);
        add('ore', 3 + fi * 0.3);
        if (isBossFloor(fi) || firstClear) add('mana', 2 + fi * 0.08);
      }

      // 戦闘を通して伸びる（使った能力が伸びる。才能がないと少しだけ）
      const growth = {};
      for (const st of extra.heroStats || []) {
        const id = st.heroId;
        if (!s.heroes[id] || fallenIds.includes(id)) continue;
        const tal = this.talents(id);
        const k = win ? 1 : 0.5;
        const g = {};
        const add = (stat, n) => { const m = Math.max(0.25, D.TALENT_MULT[tal[stat]]); const v = this.addBonus(id, stat, D.TRAIN_GAIN * m * n * k); if (v >= 0.0005) g[stat] = v; };
        add('atk', Math.min(5, (st.hits || 0) / 6));
        add('hp', Math.min(4, (st.taken || 0) / (this.stats(id).hp * 0.6)));
        add('def', Math.min(3, (st.taken || 0) / (this.stats(id).hp * 0.9)));
        add('spd', Math.min(3, (st.acts || 0) / 15));
        if (Object.keys(g).length) growth[id] = g;
      }
      // 裏切り: 仲は戻らないほど悪くなる
      const betrayed = new Map();
      for (const b of extra.betrayals || []) { this.addRel(b.by, b.victim, -100); if (b.killed) betrayed.set(b.victim, b.by); }
      // 永久ロスト
      const fallen = [];
      for (const id of fallenIds) {
        const h = s.heroes[id];
        if (!h) continue;
        fallen.push({ id, name: D.heroById[id].name, star: h.star, lv: h.lv, floor: fi + 1, battle: s.stats.battles,
          cause: betrayed.has(id) ? 'betrayal' : 'battle', by: betrayed.has(id) ? D.heroById[betrayed.get(id)].name : null });
        this.removeHero(id);
        s.stats.lost++;
      }
      s.fallen = s.fallen.concat(fallen).slice(-50);

      // 信頼度の変化
      const trust = {};
      const change = (id, d) => {
        const h = s.heroes[id];
        if (!h || d === 0) return;
        const before = h.trust;
        h.trust = clampTrust(h.trust + d);
        trust[id] = (trust[id] || 0) + (h.trust - before);
      };
      for (const id of survivors) change(id, win ? 4 : reason === 'retreat' ? -1 : -2);
      for (const [id, d] of Object.entries(extra.trustDelta || {})) change(id, d);      // 戦闘中の提案への答え
      const mvp = extra.mvp && s.heroes[extra.mvp] ? extra.mvp : null;
      if (mvp && win) change(mvp, 3);
      if (fallen.length) {
        for (const id of Object.keys(s.heroes)) {
          const inParty = survivors.includes(id);
          const caring = D.heroById[id].pers === 'caring';
          change(id, -fallen.length * (inParty ? (caring ? 12 : 8) : (caring ? 5 : 3)));
        }
      }

      // 区域のボスを初めて倒した: その地方の出身の英雄は信頼度が上がる。100階で世界を救う
      let freedZone = null;
      let worldSaved = false;
      if (win && firstClear && isBossFloor(fi) && !daily) {
        const z = D.zoneOfFloor(fi);
        const natives = z.land ? Object.keys(s.heroes).filter(id => D.heroById[id].land === z.land) : [];
        for (const id of natives) change(id, 10);
        freedZone = { name: z.name, land: z.land, natives };
        if (fi + 1 >= D.FLOORS.length && !s.worldSaved) { s.worldSaved = true; worldSaved = true; }
      }

      const levelUps = [];
      for (const id of survivors) {
        const before = this.owned(id).lv;
        const up = this.gainExp(id, id === mvp && win ? Math.round(exp * 1.2) : exp);
        if (up > 0) levelUps.push({ id, from: before, to: this.owned(id).lv });
      }
      // 訓練所: 編成に入っていない英雄も経験値をもらう
      const trainExp = Math.round(exp * this.trainingShare());
      const trained = [];
      if (trainExp > 0) {
        for (const id of Object.keys(s.heroes)) {
          if (partyIds.includes(id)) continue;
          const before = this.owned(id).lv;
          const up = this.gainExp(id, trainExp);
          trained.push(id);
          if (up > 0) levelUps.push({ id, from: before, to: this.owned(id).lv, training: true });
        }
      }
      const newcomer = this.ensureSomeone();
      const proposal = this.maybePropose();
      this.save();
      return { win, reason: reason || null, exp, gold, gems, shards, firstClear, levelUps, fallen, trust, newcomer, freedZone, worldSaved, mvp,
        trainExp: trained.length ? trainExp : 0, trained, proposal, growth, supplies };
    },
  };

  const api = {
    Game, expToNext, floorExp, floorGold, firstClearGems, firstClearShards, repeatShards, traitSlots, dayKey, costText,
    newState, newOwned, sanitize, SAVE_KEY, rollDifficulty, isBossFloor, relKey, registerDef,
  };
  if (isNode) module.exports = api;
  else root.GameCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
