/* 星喚の塔 — 進行データ（保存・ガチャ・育成・昇級・信頼度・特性・永久ロスト・報酬） */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.GameData;
  const E = isNode ? require('./battle.js') : root.BattleEngine;

  const SAVE_KEY = 'seikan-tower-save-v1';
  const VERSION = 2;

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
      stats: { pulls: 0, battles: 0, wins: 0, lost: 0, promotions: 0, farewells: 0 },
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
    if (!s || typeof s !== 'object' || (s.v !== 1 && s.v !== 2)) return base;
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
      return this.partyIds().map(id => ({
        def: D.heroById[id],
        owned: JSON.parse(JSON.stringify(this.owned(id))),
        row: this.rowOf(id),
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
      return { ok: true, star: h.star, newTrait, cost: info.cost };
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
    rollRarity(rng, guaranteeTwo) {
      if (this.state.pity + 1 >= D.GACHA.pityMax) return 3;
      const r = rng();
      if (r < D.GACHA.rates[3]) return 3;
      if (r < D.GACHA.rates[3] + D.GACHA.rates[2]) return 2;
      return guaranteeTwo ? 2 : 1;
    },

    addHero(id) {
      const s = this.state;
      if (!s.heroes[id]) {
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
      const gold = win ? floorGold(fi) : 0;
      let gems = 0;
      let shards = 0;
      let firstClear = false;
      if (win) {
        s.stats.wins++;
        if (fi + 1 > s.cleared) {
          s.cleared = fi + 1;
          gems = firstClearGems(fi);
          shards = firstClearShards(fi);
          firstClear = true;
        } else {
          shards = repeatShards(fi);
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

      const levelUps = [];
      for (const id of survivors) {
        const before = this.owned(id).lv;
        const up = this.gainExp(id, exp);
        if (up > 0) levelUps.push({ id, from: before, to: this.owned(id).lv });
      }
      const newcomer = this.ensureSomeone();
      this.save();
      return { win, reason: reason || null, exp, gold, gems, shards, firstClear, levelUps, fallen, trust, newcomer };
    },
  };

  const api = {
    Game, expToNext, floorExp, floorGold, firstClearGems, firstClearShards, repeatShards, traitSlots,
    newState, newOwned, sanitize, SAVE_KEY,
  };
  if (isNode) module.exports = api;
  else root.GameCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
