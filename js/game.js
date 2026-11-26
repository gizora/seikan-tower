/* 星喚の塔 — 進行データ（保存・ガチャ・育成・昇級・信頼度・特性・永久ロスト・報酬） */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.GameData;
  const E = isNode ? require('./battle.js') : root.BattleEngine;

  const SAVE_KEY = 'seikan-tower-save-v1';
  const VERSION = 3;

  function expToNext(lv) { return 30 + 25 * (lv - 1); }
  function floorExp(fi) { return 40 + 30 * (fi + 1); }
  function floorGold(fi) { return 50 + 40 * (fi + 1); }
  function firstClearGems(fi) { return (fi + 1) % 5 === 0 ? 800 : 300; }
  function firstClearShards(fi) { return 10 + 2 * (fi + 1) + ((fi + 1) % 5 === 0 ? 30 : 0); }
  function repeatShards(fi) { return 2 + Math.floor((fi + 1) / 3); }
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
    return { lv: 1, exp: 0, star: def.rarity, trust: D.PERSONALITIES[def.pers].trust, traits, talked: -1 };
  }

  function rollDifficulty(rng) {
    rng = rng || Math.random;
    const list = Object.entries(D.DIFFICULTIES);
    let r = rng() * list.reduce((a, [, d]) => a + d.weight, 0);
    for (const [k, d] of list) { r -= d.weight; if (r < 0) return k; }
    return 'normal';
  }
  function randomBaseName(rng) {
    rng = rng || Math.random;
    const no = 100 + Math.floor(rng() * 9900);
    return '第' + no + '待機所「' + D.BASE_NAMES[Math.floor(rng() * D.BASE_NAMES.length)] + '」';
  }
  function startBuildings() {
    const b = {};
    for (const k of D.BUILDING_ORDER) b[k] = D.BUILDINGS[k].start;
    return b;
  }

  function newState() {
    const heroes = {};
    for (const id of D.STARTER_HEROES) {
      heroes[id] = newOwned(id);
      heroes[id].trust += 10;                       // 最初からいる仲間は少しだけ信頼している
    }
    return {
      v: VERSION,
      gems: D.START_GEMS,
      gold: D.START_GOLD,
      shards: 0,
      heroes,
      party: D.STARTER_HEROES.concat([null, null]).slice(0, D.PARTY_SIZE),
      rows: {},
      tactics: Object.assign({}, D.DEFAULT_TACTICS),
      cleared: 0,
      pity: 0,
      speed: 2,
      seenIntro: false,
      seenDeathWarning: false,
      fallen: [],                                   // 慰霊碑: 倒れた英雄の記録
      stats: { pulls: 0, battles: 0, wins: 0, lost: 0, promotions: 0, farewells: 0, commands: 0 },
      difficulty: rollDifficulty(),                 // 世界の難易度（始めたときにランダムで決まる）
      base: { name: randomBaseName(), buildings: startBuildings() },
      heroTactics: {},                              // 英雄ごとの「狙う敵」（戦略室 Lv5）
    };
  }

  function int(v, d) { const n = Math.floor(Number(v)); return Number.isFinite(n) ? n : d; }

  function sanitizeOwned(id, h, version) {
    const def = D.heroById[id];
    const out = newOwned(id);
    out.star = Math.min(D.MAX_STAR, Math.max(def.rarity, int(h.star, def.rarity)));
    out.lv = Math.min(D.STARS[out.star].maxLv, Math.max(1, int(h.lv, 1)));
    out.exp = Math.max(0, int(h.exp, 0));
    if (version >= 2) {
      out.trust = clampTrust(int(h.trust, out.trust));
      out.talked = int(h.talked, -1);
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
    if (!s || typeof s !== 'object' || ![1, 2, 3].includes(s.v)) return base;
    const version = s.v;
    const out = Object.assign(base, s, { v: VERSION });
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
    out.cleared = Math.min(D.FLOORS.length, Math.max(0, int(s.cleared, 0)));
    out.gems = Math.max(0, int(s.gems, 0));
    out.gold = Math.max(0, int(s.gold, 0));
    out.pity = Math.max(0, int(s.pity, 0));
    out.speed = [1, 2, 3].includes(s.speed) ? s.speed : 2;
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
        if (k === 'dorm') { lv = 1; while (lv < def.max && D.DORM_CAP[lv] < Object.keys(out.heroes).length) lv++; }
        if (k === 'strategy') lv = Math.min(def.max, Math.floor(out.cleared / 5));
      }
      out.base.buildings[k] = Math.max(def.start, Math.min(def.max, lv));
    }
    out.heroTactics = {};
    for (const [id, t] of Object.entries(s.heroTactics || {})) {
      if (out.heroes[id] && t && D.TACTICS.target.options.some(o => o.value === t.target)) out.heroTactics[id] = { target: t.target };
    }
    out.stats.commands = Math.max(0, int(out.stats.commands, 0));
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
      if (lv >= def.max) return { can: false, reason: 'max', lv };
      const next = lv + 1;
      const cost = D.BUILD_COST[next];
      const req = D.BUILD_REQ[next];
      if (this.state.cleared < req) return { can: false, reason: 'floor', lv, next, cost, req };
      if (this.state.gold < cost) return { can: false, reason: 'gold', lv, next, cost, req };
      return { can: true, lv, next, cost, req };
    },
    build(k) {
      const info = this.buildInfo(k);
      if (!info.can) return Object.assign({ ok: false }, info);
      this.state.gold -= info.cost;
      this.state.base.buildings[k] = info.next;
      this.save();
      return { ok: true, lv: info.next, cost: info.cost, isNew: info.next === 1 };
    },
    /** 建っている施設（下の階から） */
    floorsBuilt() { return D.BUILDING_ORDER.filter(k => this.buildingLv(k) > 0); },
    renameBase(name) {
      const n = String(name || '').trim().slice(0, 30);
      if (!n) return false;
      this.state.base.name = n;
      this.save();
      return true;
    },

    // ---------- 世界の難易度・滅んだ世界 ----------
    difficulty() { return D.DIFFICULTIES[this.state.difficulty]; },
    worldSaved(wi) { return this.state.cleared >= (wi + 1) * D.FLOORS_PER_WORLD; },
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
    battleOptions() { return { enemyMult: this.difficulty().enemy, cmdCost: this.cmdCost() }; },

    // ---------- 英雄 ----------
    owned(id) { return this.state.heroes[id] || null; },
    def(id) { return D.heroById[id]; },
    star(id) { return this.owned(id).star; },
    maxLv(id) { return D.STARS[this.star(id)].maxLv; },
    rowOf(id) { return this.state.rows[id] || D.CLASSES[D.heroById[id].cls].row; },
    stats(id) { return E.heroStats(D.heroById[id], this.owned(id)); },
    power(id) { return E.power(this.stats(id)); },
    trustTier(id) { return E.trustTier(this.owned(id).trust); },
    canTalk(id) { const h = this.owned(id); return !!h && h.talked < this.state.stats.battles; },

    ownedList() {
      return Object.keys(this.state.heroes).sort((a, b) => {
        const ha = this.state.heroes[a], hb = this.state.heroes[b];
        return hb.star - ha.star || hb.lv - ha.lv || D.HEROES.indexOf(D.heroById[a]) - D.HEROES.indexOf(D.heroById[b]);
      });
    },

    partyIds() { return this.state.party.filter(Boolean); },

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

    // ---------- 信頼度・会話 ----------
    talk(id) {
      const h = this.owned(id);
      if (!this.canTalk(id)) return { ok: false };
      const before = E.trustTier(h.trust);
      h.trust = clampTrust(h.trust + 6);
      h.talked = this.state.stats.battles;
      const tier = E.trustTier(h.trust);
      const lines = D.TALK[D.heroById[id].pers][D.TRUST_TIERS[tier].talk];
      this.save();
      return { ok: true, line: lines[Math.floor(this.rng() * lines.length)], tierUp: tier > before, tier, trust: h.trust };
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

    inheritCost(trait) { return 200 * trait.lv; },
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
      s.party = s.party.map(x => (x === id ? null : x));
    },

    /** 英雄が一人もいなくなり、召喚もできないときは、流れ者の英雄が来てくれる */
    ensureSomeone() {
      const s = this.state;
      if (Object.keys(s.heroes).length > 0 || s.gems >= D.GACHA.cost1) return null;
      const pool = D.HEROES.filter(h => h.rarity === 1);
      const id = pool[Math.floor(this.rng() * pool.length)].id;
      s.heroes[id] = newOwned(id, this.rng);
      s.party[0] = id;
      this.save();
      return id;
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

    addHero(id) {
      const s = this.state;
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
        const lastOfTen = n === 10 && i === n - 1 && !results.some(r => D.heroById[r.id].rarity >= 2);
        const rarity = this.rollRarity(rng, lastOfTen);
        s.pity = rarity === 3 ? 0 : s.pity + 1;
        const pool = D.HEROES.filter(h => h.rarity === rarity);
        const hero = pool[Math.floor(rng() * pool.length)];
        results.push(this.addHero(hero.id));
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
    applyBattleResult(fi, win, partyIds, fallenIds, reason) {
      const s = this.state;
      fallenIds = fallenIds || [];
      s.stats.battles++;
      const survivors = partyIds.filter(id => !fallenIds.includes(id) && s.heroes[id]);
      const exp = Math.round(floorExp(fi) * (win ? 1 : 0.3));
      const rm = this.difficulty().reward;
      const gold = win ? Math.round(floorGold(fi) * rm) : 0;
      let gems = 0;
      let shards = 0;
      let firstClear = false;
      if (win) {
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

      // 永久ロスト
      const fallen = [];
      for (const id of fallenIds) {
        const h = s.heroes[id];
        if (!h) continue;
        fallen.push({ id, name: D.heroById[id].name, star: h.star, lv: h.lv, floor: fi + 1, battle: s.stats.battles });
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
      if (fallen.length) {
        for (const id of Object.keys(s.heroes)) {
          const inParty = survivors.includes(id);
          const caring = D.heroById[id].pers === 'caring';
          change(id, -fallen.length * (inParty ? (caring ? 12 : 8) : (caring ? 5 : 3)));
        }
      }

      // 世界を救った（ボスの階を初めてクリア）: その世界から来た英雄は信頼度が上がる
      let savedWorld = null;
      if (win && firstClear && (fi + 1) % D.FLOORS_PER_WORLD === 0) {
        const w = D.worldOfFloor(fi);
        const natives = Object.keys(s.heroes).filter(id => D.heroById[id].world === w.id);
        for (const id of natives) change(id, 10);
        savedWorld = { id: w.id, name: w.name, natives };
      }

      const levelUps = [];
      for (const id of survivors) {
        const before = this.owned(id).lv;
        const up = this.gainExp(id, exp);
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
      this.save();
      return { win, reason: reason || null, exp, gold, gems, shards, firstClear, levelUps, fallen, trust, newcomer, savedWorld, trainExp: trained.length ? trainExp : 0, trained };
    },
  };

  const api = {
    Game, expToNext, floorExp, floorGold, firstClearGems, firstClearShards, repeatShards, traitSlots,
    newState, newOwned, sanitize, SAVE_KEY, rollDifficulty,
  };
  if (isNode) module.exports = api;
  else root.GameCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
