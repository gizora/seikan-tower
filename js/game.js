/* 星喚の塔 — 進行データ（保存・ガチャ・育成・報酬） */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.GameData;
  const E = isNode ? require('./battle.js') : root.BattleEngine;

  const SAVE_KEY = 'seikan-tower-save-v1';

  function expToNext(lv) { return 30 + 25 * (lv - 1); }
  function floorExp(floorIndex) { return 40 + 30 * (floorIndex + 1); }
  function floorGold(floorIndex) { return 50 + 40 * (floorIndex + 1); }
  function firstClearGems(floorIndex) { return (floorIndex + 1) % 5 === 0 ? 800 : 300; }

  function newState() {
    const heroes = {};
    for (const id of D.STARTER_HEROES) heroes[id] = { lv: 1, exp: 0, awaken: 0 };
    return {
      v: 1,
      gems: D.START_GEMS,
      gold: D.START_GOLD,
      heroes,
      party: D.STARTER_HEROES.concat([null, null]).slice(0, D.PARTY_SIZE),
      rows: {},                       // heroId -> 'front' | 'back'（未設定なら職業の初期値）
      tactics: Object.assign({}, D.DEFAULT_TACTICS),
      cleared: 0,                     // クリアした一番上の階（0 = まだ）
      pity: 0,
      speed: 2,
      seenIntro: false,
      stats: { pulls: 0, battles: 0, wins: 0 },
    };
  }

  function sanitize(s) {
    const base = newState();
    if (!s || typeof s !== 'object' || s.v !== 1) return base;
    const out = Object.assign(base, s);
    out.tactics = Object.assign({}, D.DEFAULT_TACTICS, s.tactics || {});
    out.heroes = {};
    for (const [id, h] of Object.entries(s.heroes || {})) {
      if (!D.heroById[id]) continue;
      const maxLv = D.RARITY[D.heroById[id].rarity].maxLv;
      out.heroes[id] = {
        lv: Math.min(maxLv, Math.max(1, Math.floor(h.lv) || 1)),
        exp: Math.max(0, Math.floor(h.exp) || 0),
        awaken: Math.min(D.GACHA.maxAwaken, Math.max(0, Math.floor(h.awaken) || 0)),
      };
    }
    if (Object.keys(out.heroes).length === 0) return base;
    const party = Array.isArray(s.party) ? s.party.slice(0, D.PARTY_SIZE) : [];
    while (party.length < D.PARTY_SIZE) party.push(null);
    const seen = new Set();
    out.party = party.map(id => (id && out.heroes[id] && !seen.has(id) && seen.add(id)) ? id : null);
    out.cleared = Math.min(D.FLOORS.length, Math.max(0, Math.floor(s.cleared) || 0));
    out.gems = Math.max(0, Math.floor(s.gems) || 0);
    out.gold = Math.max(0, Math.floor(s.gold) || 0);
    out.speed = [1, 2, 3].includes(s.speed) ? s.speed : 2;
    out.stats = Object.assign(base.stats, s.stats || {});
    return out;
  }

  const Game = {
    state: null,
    storage: null,

    init(storage) {
      this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
      let raw = null;
      try { raw = this.storage && this.storage.getItem(SAVE_KEY); } catch (e) { raw = null; }
      let parsed = null;
      try { parsed = raw ? JSON.parse(raw) : null; } catch (e) { parsed = null; }
      this.state = sanitize(parsed);
      return this.state;
    },

    save() {
      try { this.storage && this.storage.setItem(SAVE_KEY, JSON.stringify(this.state)); } catch (e) { /* 容量不足などは無視 */ }
    },

    reset() {
      this.state = newState();
      this.save();
    },

    // ---------- 英雄 ----------
    owned(id) { return this.state.heroes[id] || null; },
    def(id) { return D.heroById[id]; },
    maxLv(id) { return D.RARITY[D.heroById[id].rarity].maxLv; },
    rowOf(id) { return this.state.rows[id] || D.CLASSES[D.heroById[id].cls].row; },
    stats(id) { return E.heroStats(D.heroById[id], this.owned(id)); },
    power(id) { return E.power(this.stats(id)); },

    ownedList() {
      return Object.keys(this.state.heroes).sort((a, b) => {
        const da = D.heroById[a], db = D.heroById[b];
        return db.rarity - da.rarity || this.state.heroes[b].lv - this.state.heroes[a].lv ||
          D.HEROES.indexOf(da) - D.HEROES.indexOf(db);
      });
    },

    partyIds() { return this.state.party.filter(Boolean); },

    partyForBattle() {
      return this.partyIds().map(id => ({ def: D.heroById[id], owned: Object.assign({}, this.owned(id)), row: this.rowOf(id) }));
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

    /** 金貨で次のレベルまで鍛える */
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

    // ---------- ガチャ ----------
    rollRarity(rng, guaranteeTwo) {
      const s = this.state;
      if (s.pity + 1 >= D.GACHA.pityMax) return 3;
      const r = rng();
      if (r < D.GACHA.rates[3]) return 3;
      if (r < D.GACHA.rates[3] + D.GACHA.rates[2]) return 2;
      return guaranteeTwo ? 2 : 1;
    },

    addHero(id) {
      const s = this.state;
      if (!s.heroes[id]) {
        s.heroes[id] = { lv: 1, exp: 0, awaken: 0 };
        return { id, isNew: true };
      }
      const h = s.heroes[id];
      if (h.awaken < D.GACHA.maxAwaken) {
        h.awaken++;
        return { id, isNew: false, awaken: h.awaken };
      }
      s.gold += D.GACHA.dupGold;
      return { id, isNew: false, gold: D.GACHA.dupGold };
    },

    /** n 回召喚する（1 か 10）。足りなければ null */
    pull(n, rng) {
      rng = rng || Math.random;
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
      // 空いている編成枠があれば、新しい英雄を自動で入れる
      for (const r of results) {
        if (r.isNew && s.party.includes(null) && !s.party.includes(r.id)) s.party[s.party.indexOf(null)] = r.id;
      }
      this.save();
      return results;
    },

    pityLeft() { return D.GACHA.pityMax - this.state.pity; },

    // ---------- 塔 ----------
    isUnlocked(floorIndex) { return floorIndex <= this.state.cleared; },

    /** 戦闘の結果を反映して、報酬の内訳を返す */
    applyBattleResult(floorIndex, win, partyIds) {
      const s = this.state;
      s.stats.battles++;
      const exp = Math.round(floorExp(floorIndex) * (win ? 1 : 0.3));
      const gold = win ? floorGold(floorIndex) : 0;
      let gems = 0;
      let firstClear = false;
      if (win) {
        s.stats.wins++;
        if (floorIndex + 1 > s.cleared) {
          s.cleared = floorIndex + 1;
          gems = firstClearGems(floorIndex);
          firstClear = true;
        }
      }
      s.gold += gold;
      s.gems += gems;
      const levelUps = [];
      for (const id of partyIds) {
        const before = this.owned(id).lv;
        const up = this.gainExp(id, exp);
        if (up > 0) levelUps.push({ id, from: before, to: this.owned(id).lv });
      }
      this.save();
      return { win, exp, gold, gems, firstClear, levelUps };
    },
  };

  const api = { Game, expToNext, floorExp, floorGold, firstClearGems, newState, sanitize, SAVE_KEY };
  if (isNode) module.exports = api;
  else root.GameCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
