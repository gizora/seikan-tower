/* 星喚の塔 — オート戦闘のしくみ（画面に依存しない。Node でもシミュレーションできる） */
(function (root) {
  'use strict';
  const D = (typeof module !== 'undefined' && module.exports) ? require('./data.js') : root.GameData;

  // 作戦（構え）による倍率
  const STANCE = {
    attack:  { atk: 1.2,  def: 0.8,  guard: 0 },
    balance: { atk: 1.0,  def: 1.0,  guard: 0.2 },
    defend:  { atk: 0.9,  def: 1.6,  guard: 0.3 },
  };
  const ACT_GAUGE = 1000;
  const MAX_TURNS = 600;
  const WAVE_HEAL = 0.2;          // ウェーブの合間に回復する割合
  const DANGER_LINE = 0.15;       // 「危なくなったら撤退」の HP の割合

  // ---------- 能力の計算 ----------
  function traitVal(traits, id) {
    const t = (traits || []).find(x => x.id === id);
    return t ? D.TRAITS[id].vals[t.lv - 1] : 0;
  }

  /** 信頼度 → 作戦に従わない確率 */
  function disobeyChance(trust) {
    return Math.max(0, (45 - trust) / 100);      // 0 なら 45%、45 以上なら 0%
  }
  /** 信頼度 → 能力の上がり方 */
  function trustBonus(trust) {
    return trust >= 90 ? 0.1 : trust >= 60 ? 0.05 : 0;
  }
  function trustTier(trust) {
    let i = 0;
    D.TRUST_TIERS.forEach((t, k) => { if (trust >= t.min) i = k; });
    return i;
  }

  function heroStats(def, owned) {
    const c = D.CLASSES[def.cls];
    const star = D.STARS[owned.star || def.rarity];
    const g = (1 + 0.07 * (owned.lv - 1)) * star.mult;
    const tb = 1 + trustBonus(owned.trust == null ? 50 : owned.trust);
    const tr = owned.traits || [];
    return {
      hp: Math.round(c.hp * g * (1 + traitVal(tr, 'sturdy'))),
      atk: Math.round(c.atk * g * tb * (1 + traitVal(tr, 'might'))),
      def: Math.round(c.def * g * tb * (1 + traitVal(tr, 'guard'))),
      spd: Math.round((c.spd + ((owned.star || def.rarity) - 1) * 5) * (1 + traitVal(tr, 'swift'))),
    };
  }

  function enemyStats(tpl, lv) {
    // HP と防御は伸びを抑え、攻撃はしっかり伸ばす（硬すぎて長引く戦闘を防ぐ）
    const n = lv - 1;
    return {
      hp: Math.round(tpl.hp * (1 + 0.08 * n)),
      atk: Math.round(tpl.atk * (1 + 0.11 * n)),
      def: Math.round(tpl.def * (1 + 0.05 * n)),
      spd: tpl.spd,
    };
  }

  function power(st) {
    return Math.round(st.hp * 0.25 + st.atk * 3 + st.def * 2 + st.spd * 0.5);
  }

  function makeUnitBase() {
    return { gauge: 0, cd: 0, guard: false, taunt: 0, defUp: 0, atkUp: 0, alive: true };
  }

  /**
   * @param {object} opts
   *   party: [{ def, owned, row }]   owned = { lv, star, trust, traits }
   *   floorIndex: 塔の階（0 始まり）
   *   tactics: 作戦（オブジェクトをそのまま参照するので、戦闘中に書き換えるとすぐ反映される）
   *   rng: 0..1 を返す関数（省略時 Math.random）
   */
  function Battle(opts) {
    this.rng = opts.rng || Math.random;
    this.tactics = opts.tactics;
    this.floorIndex = opts.floorIndex;
    this.floor = D.FLOORS[opts.floorIndex];
    this.waveIndex = -1;
    this.turns = 0;
    this.state = 'running';
    this.result = null;
    this.heroes = opts.party.map((p, i) => {
      const st = heroStats(p.def, p.owned);
      const c = D.CLASSES[p.def.cls];
      const traits = p.owned.traits || [];
      return Object.assign(makeUnitBase(), {
        id: 'h' + i, side: 'hero', heroId: p.def.id, name: p.def.name,
        cls: p.def.cls, row: p.row || c.row, pers: p.def.pers, skill: p.def.skill, line: p.def.line,
        healer: !!c.healer, crit: c.crit + traitVal(traits, 'keen'),
        maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd,
        lv: p.owned.lv, star: p.owned.star || p.def.rarity, trust: p.owned.trust == null ? 50 : p.owned.trust,
        traits, healMul: 1 + traitVal(traits, 'mend'), drain: traitVal(traits, 'drain'),
        firstGauge: traitVal(traits, 'first'), undying: traitVal(traits, 'undying'), counter: traitVal(traits, 'counter'),
        undyingUsed: false, disobeyed: 0,
      });
    });
    this.enemies = [];
    this.summary = { deaths: 0, healed: 0, guarded: 0, skills: 0, bossReached: false, lastWave: 0, disobeyed: 0, undying: 0 };
  }

  Battle.prototype.aliveHeroes = function () { return this.heroes.filter(u => u.alive); };
  Battle.prototype.aliveEnemies = function () { return this.enemies.filter(u => u.alive); };
  Battle.prototype.unitById = function (id) {
    return this.heroes.find(u => u.id === id) || this.enemies.find(u => u.id === id);
  };
  /** 倒れた英雄の heroId 一覧（永久に失われる） */
  Battle.prototype.fallenHeroIds = function () { return this.heroes.filter(u => !u.alive).map(u => u.heroId); };

  Battle.prototype.makeEnemy = function (key, id) {
    const tpl = D.ENEMIES[key];
    const lv = this.floor.lv;
    const st = enemyStats(tpl, lv);
    const u = Object.assign(makeUnitBase(), {
      id, side: 'enemy', key, name: tpl.name, boss: !!tpl.boss, row: 'front', skill: tpl.skill || null, crit: 0.05,
      maxHp: st.hp, hp: st.hp, atk: st.atk, def: st.def, spd: st.spd, lv, cd: tpl.skill ? 1 : 0,
    });
    if (tpl.barrier) { u.maxShield = Math.round(st.hp * tpl.barrier); u.shield = u.maxShield; u.shieldTimer = 0; }
    return u;
  };

  Battle.prototype.startWave = function () {
    this.waveIndex++;
    const w = this.waveIndex;
    this.enemies = this.floor.waves[w].map((key, i) => this.makeEnemy(key, 'e' + w + '_' + i));
    if (this.enemies.some(e => e.boss)) this.summary.bossReached = true;
    this.summary.lastWave = w;
    const healed = [];
    for (const h of this.aliveHeroes()) {
      if (w > 0) {
        const amt = Math.min(h.maxHp - h.hp, Math.round(h.maxHp * WAVE_HEAL));
        h.hp += amt;
        if (amt > 0) healed.push({ id: h.id, amount: amt });
      }
      h.gauge = this.rng() * 300 + h.firstGauge;
      h.guard = false;
    }
    for (const e of this.enemies) e.gauge = this.rng() * 300;
    const boss = this.enemies.find(e => e.boss);
    return {
      type: 'wave', index: w, total: this.floor.waves.length, enemies: this.enemies, healed, boss: !!boss,
      text: boss ? `ボス出現！ ${boss.name}が立ちはだかる！` : `ウェーブ ${w + 1}/${this.floor.waves.length} — 敵が現れた！`,
    };
  };

  Battle.prototype.pickActor = function () {
    const units = this.aliveHeroes().concat(this.aliveEnemies());
    let best = null;
    let bt = Infinity;
    for (const u of units) {
      const t = (ACT_GAUGE - u.gauge) / u.spd;
      if (t < bt - 1e-9) { bt = t; best = u; }
    }
    for (const u of units) u.gauge += u.spd * bt;
    best.gauge -= ACT_GAUGE;
    return best;
  };

  /** 次の出来事を1つ進めて返す。終わっていたら null。 */
  Battle.prototype.next = function () {
    if (this.state !== 'running') return null;
    if (this.waveIndex < 0) return this.startWave();
    if (this.aliveHeroes().length === 0) return this.finish(false, 'wipe');
    if (this.aliveEnemies().length === 0) {
      if (this.waveIndex + 1 >= this.floor.waves.length) return this.finish(true);
      return this.startWave();
    }
    const r = this.tactics.retreat;
    if (r === 'down' && this.summary.deaths > 0) return this.finish(false, 'retreat');
    if (r === 'danger' && (this.summary.deaths > 0 || this.aliveHeroes().some(h => h.hp / h.maxHp < DANGER_LINE))) {
      return this.finish(false, 'retreat');
    }
    if (this.turns >= MAX_TURNS) return this.finish(false, 'timeout');
    this.turns++;
    const actor = this.pickActor();
    // 自分の番が来たら、守りの構えは解け、効果の残り回数が減る
    actor.guard = false;
    if (actor.taunt > 0) actor.taunt--;
    if (actor.defUp > 0) actor.defUp--;
    if (actor.atkUp > 0) actor.atkUp--;
    if (actor.cd > 0) actor.cd--;
    const ev = actor.side === 'hero' ? this.heroAct(actor) : this.enemyAct(actor);
    ev.type = 'act';
    ev.actor = actor.id;
    ev.side = actor.side;
    return ev;
  };

  /** マスターが撤退を選んだとき */
  Battle.prototype.retreat = function () {
    if (this.state !== 'running') return null;
    return this.finish(false, 'retreat');
  };

  Battle.prototype.finish = function (win, reason) {
    this.state = 'done';
    this.result = { win, reason: reason || null, fallen: this.fallenHeroIds() };
    return { type: 'end', win, reason: reason || null, fallen: this.result.fallen };
  };

  // ---------- ダメージと回復 ----------
  Battle.prototype.damage = function (a, t, mult, forceCrit, noCounter) {
    const T = this.tactics;
    const atkMul = (a.side === 'hero' ? STANCE[T.stance].atk : 1) * (a.atkUp > 0 ? 1.25 : 1);
    const defMul = (t.side === 'hero' ? STANCE[T.stance].def : 1) * (t.guard ? 2 : 1) * (t.defUp > 0 ? 1.35 : 1);
    const atk = a.atk * atkMul;
    const def = t.def * defMul;
    let dmg = atk * mult * 50 / (50 + def) * (0.9 + 0.2 * this.rng());
    const crit = !!forceCrit || this.rng() < a.crit;
    if (crit) dmg *= 1.5;
    let amount = Math.max(1, Math.round(dmg));
    const res = { id: t.id, amount, crit, dead: false };
    // 影の盾
    if (t.shield > 0) {
      const absorbed = Math.min(t.shield, amount);
      t.shield -= absorbed;
      amount -= absorbed;
      res.shield = absorbed;
      res.amount = amount;
      if (t.shield === 0) res.shieldBroken = true;
    }
    t.hp = Math.max(0, t.hp - amount);
    if (t.hp === 0 && t.side === 'hero' && t.undying > 0 && !t.undyingUsed && this.rng() < t.undying) {
      t.hp = 1;
      t.undyingUsed = true;
      res.undying = true;
      this.summary.undying++;
    }
    if (t.hp === 0) {
      t.alive = false;
      res.dead = true;
      if (t.side === 'hero') this.summary.deaths++;
    }
    // 吸血
    if (a.side === 'hero' && a.drain > 0 && a.alive && amount > 0) {
      const h = Math.min(a.maxHp - a.hp, Math.round(amount * a.drain));
      if (h > 0) { a.hp += h; res.drain = { id: a.id, amount: h }; }
    }
    // 反撃
    if (!noCounter && t.side === 'hero' && t.alive && t.counter > 0 && a.alive && this.rng() < t.counter) {
      res.counter = this.damage(t, a, 0.6, false, true);
    }
    return res;
  };

  Battle.prototype.heal = function (a, t, mult) {
    const raw = Math.round(a.atk * mult * (a.healMul || 1) * (0.9 + 0.2 * this.rng()));
    const amount = Math.min(t.maxHp - t.hp, raw);
    t.hp += amount;
    this.summary.healed += amount;
    return { id: t.id, amount, heal: true };
  };

  Battle.prototype.randomOf = function (arr) {
    return arr[Math.floor(this.rng() * arr.length)];
  };

  // ---------- 英雄の思考 ----------
  Battle.prototype.pickTarget = function (u, foes, mode) {
    if (u.pers === 'whimsical' && this.rng() < 0.25) {
      return { target: this.randomOf(foes), whim: true };
    }
    if (mode === 'auto') mode = { brave: 'strong', careful: 'weak' }[u.pers] || 'front';
    let target;
    if (mode === 'weak') target = foes.reduce((m, f) => (f.hp < m.hp ? f : m));
    else if (mode === 'strong') target = foes.find(f => f.boss) || foes.reduce((m, f) => (f.atk > m.atk ? f : m));
    else target = foes[0];
    return { target, whim: false };
  };

  Battle.prototype.heroAct = function (u) {
    const T = this.tactics;
    // 信頼度が低いと、作戦を無視して自分の考えで動く
    const disobey = this.rng() < disobeyChance(u.trust);
    const tac = disobey ? { target: 'auto', healLine: 0.5, skill: 'now' } : T;
    if (disobey) { u.disobeyed++; this.summary.disobeyed++; }
    const disobeySpeech = disobey && u.disobeyed === 1 ? '悪いけど、好きにやらせてもらう' : null;

    const allies = this.aliveHeroes();
    const foes = this.aliveEnemies();
    const ratio = u.hp / u.maxHp;
    const bossPresent = foes.some(f => f.boss);
    const sk = u.skill;
    const ready = u.cd === 0;
    const allowSkill = ready && (tac.skill === 'now' || bossPresent || ratio < 0.35);
    const pinch = allies.filter(a => a.hp / a.maxHp < 0.3);
    const tag = (ev) => { if (disobey) ev.disobey = true; return ev; };

    // 1) 回復役
    if (u.healer) {
      const needy = allies.filter(a => a.hp / a.maxHp < tac.healLine).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp);
      const caringSave = u.pers === 'caring' && pinch.length > 0;
      if (sk.type === 'heal_all' && ready && (needy.length >= 2 || (needy.length >= 1 && (allowSkill || caringSave)))) {
        u.cd = sk.cd;
        this.summary.skills++;
        const hits = allies.map(a => this.heal(u, a, sk.mult));
        return tag({
          kind: 'skill', label: sk.name, hits,
          speech: disobeySpeech || ((caringSave && !allowSkill) ? 'ピンチは見過ごせない！' : u.line),
          text: `${u.name}の「${sk.name}」！ 味方全体が回復した。`,
        });
      }
      if (needy.length > 0) {
        const t = needy[0];
        const hit = this.heal(u, t, 1.0);
        return tag({
          kind: 'heal', label: '回復', hits: [hit], speech: disobeySpeech || (t === u ? '自分も回復！' : `${t.name}、回復するね！`),
          text: `${u.name}は${t.name}を ${hit.amount} 回復した。`,
        });
      }
    }

    // 2) 挑発（戦士）
    if (sk.type === 'taunt' && ready) {
      const caringSave = u.pers === 'caring' && pinch.some(a => a !== u);
      const backHurt = allies.some(a => a !== u && a.hp / a.maxHp < 0.7);
      if ((allowSkill && (backHurt || bossPresent || T.stance === 'defend')) || caringSave) {
        u.cd = sk.cd;
        u.taunt = 2;
        u.guard = true;
        this.summary.skills++;
        const buffs = [u.id];
        if (sk.partyDef) for (const a of allies) { a.defUp = 3; if (a !== u) buffs.push(a.id); }
        return tag({
          kind: 'skill', label: sk.name, hits: [], buffs,
          speech: disobeySpeech || ((caringSave && !allowSkill) ? '仲間には手を出させない！' : u.line),
          text: sk.partyDef ? `${u.name}の「${sk.name}」！ 敵の攻撃を引きつけ、味方の防御が上がった。`
                            : `${u.name}の「${sk.name}」！ 敵の攻撃を引きつける。`,
        });
      }
    }

    // 3) 守りの構え
    let guardLine = STANCE[T.stance].guard;
    if (u.pers === 'careful') guardLine = Math.max(guardLine, 0.1) + 0.1;
    if (u.pers === 'brave') guardLine = 0;
    const healerAlive = allies.some(a => a.healer && a !== u);
    if (!u.healer && ratio < guardLine && (healerAlive || u.pers === 'careful')) {
      u.guard = true;
      this.summary.guarded++;
      return tag({
        kind: 'guard', label: '防御', hits: [], buffs: [u.id], speech: disobeySpeech || '守りを固める！',
        text: `${u.name}は守りを固めた。`,
      });
    }

    // 4) 攻撃（スキル or 通常）
    const { target, whim } = this.pickTarget(u, foes, tac.target);
    const speech = disobeySpeech || (whim ? 'こっちが気になる！' : null);
    if (allowSkill && (sk.type === 'single' || sk.type === 'multi' || sk.type === 'aoe')) {
      u.cd = sk.cd;
      this.summary.skills++;
      const hits = [];
      if (sk.type === 'single') {
        hits.push(this.damage(u, target, sk.mult, sk.sure));
        if (sk.partyAtk) for (const a of allies) a.atkUp = 3;
      } else if (sk.type === 'multi') {
        let t = target;
        for (let i = 0; i < sk.hits; i++) {
          const alive = this.aliveEnemies();
          if (alive.length === 0) break;
          if (sk.spread) t = this.randomOf(alive);
          else if (!t.alive) t = alive[0];
          hits.push(this.damage(u, t, sk.mult, false));
        }
      } else {
        for (const f of foes) hits.push(this.damage(u, f, sk.mult, false));
      }
      return tag({
        kind: 'skill', label: sk.name, hits, buffs: sk.partyAtk ? allies.map(a => a.id) : [],
        speech: disobeySpeech || u.line,
        text: `${u.name}の「${sk.name}」！ ` + describeHits(this, hits),
      });
    }
    const mult = u.healer ? 0.7 : 1.0;
    const hit = this.damage(u, target, mult, false);
    return tag({
      kind: 'attack', label: '攻撃', hits: [hit], speech,
      text: `${u.name}の攻撃！ ` + describeHits(this, [hit]),
    });
  };

  // ---------- 敵の行動 ----------
  Battle.prototype.enemyAct = function (u) {
    const tpl = D.ENEMIES[u.key];
    const foes = () => this.aliveHeroes();
    const pick = (exclude) => {
      const list = foes().filter(f => f !== exclude);
      if (list.length === 0) return null;
      const taunters = list.filter(f => f.taunt > 0);
      if (taunters.length) return taunters[0];
      const fronts = list.filter(f => f.row === 'front');
      if (fronts.length && this.rng() < 0.7) return this.randomOf(fronts);
      return this.randomOf(list);
    };
    let ev;
    if (u.skill && u.cd === 0) {
      u.cd = u.skill.cd;
      const hits = u.skill.type === 'aoe'
        ? foes().map(f => this.damage(u, f, u.skill.mult, false))
        : [this.damage(u, pick(), u.skill.mult, false)];
      ev = { kind: 'skill', label: u.skill.name, hits, text: `${u.name}の「${u.skill.name}」！ ` + describeHits(this, hits) };
      // 手下を呼ぶボス
      if (tpl.summon && this.aliveEnemies().length < tpl.summonMax) {
        this.spawnCount = (this.spawnCount || 0) + 1;
        const s = this.makeEnemy(tpl.summon, 'e' + this.waveIndex + '_s' + this.spawnCount);
        s.summoned = true;
        this.enemies.push(s);
        ev.summoned = [s];
        ev.text += ` ${s.name}が駆けつけた！`;
      }
      // 凍えさせるボス: 英雄の行動を遅らせる
      if (tpl.freeze) {
        for (const f of foes()) f.gauge -= tpl.freeze;
        ev.frozen = foes().map(f => f.id);
        ev.text += ' 英雄たちは凍えて動きが鈍った！';
      }
    } else {
      const t1 = pick();
      const hits = [this.damage(u, t1, 1.0, false)];
      // 双頭: 2人を同時に殴る
      if (tpl.double) {
        const t2 = pick(t1);
        if (t2) hits.push(this.damage(u, t2, 1.0, false));
      }
      ev = { kind: 'attack', label: '攻撃', hits, text: `${u.name}の攻撃！ ` + describeHits(this, hits) };
    }
    // 行動するたびに強くなるボス
    if (tpl.enrage) {
      u.baseAtk = u.baseAtk || u.atk;
      u.atk = Math.round(u.atk + u.baseAtk * tpl.enrage);
      u.rage = (u.rage || 0) + 1;
      if (u.rage % 3 === 0) ev.text += ` ${u.name}の怒りが増していく…（攻撃力 ${u.atk}）`;
      ev.enraged = true;
    }
    // 影の盾を張り直す
    if (tpl.barrier && u.alive) {
      u.shieldTimer++;
      if (u.shield === 0 && u.shieldTimer >= 4) {
        u.shield = u.maxShield;
        u.shieldTimer = 0;
        ev.reshield = true;
        ev.text += ` ${u.name}は影の盾を張り直した！`;
      } else if (u.shield > 0) {
        u.shieldTimer = 0;
      }
    }
    return ev;
  };

  function describeHits(b, hits) {
    if (hits.length === 0) return '';
    const byTarget = {};
    const order = [];
    const add = (h) => {
      if (!byTarget[h.id]) { byTarget[h.id] = { amount: 0, dead: false, crit: false, shield: 0, undying: false }; order.push(h.id); }
      const r = byTarget[h.id];
      r.amount += h.amount;
      r.shield += h.shield || 0;
      r.dead = r.dead || h.dead;
      r.crit = r.crit || h.crit;
      r.undying = r.undying || !!h.undying;
    };
    for (const h of hits) add(h);
    let text = order.map(id => {
      const t = b.unitById(id);
      const r = byTarget[id];
      return `${r.crit ? '会心！' : ''}${t.name}に ${r.amount}${r.shield ? `（盾が ${r.shield} 防いだ）` : ''}` +
        `${r.undying ? '（不屈で耐えた！）' : ''}${r.dead ? '（倒れた）' : ''}`;
    }).join('、');
    for (const h of hits) {
      if (h.counter) text += ` ${b.unitById(h.id).name}の反撃！ ${b.unitById(h.counter.id).name}に ${h.counter.amount}${h.counter.dead ? '（倒れた）' : ''}`;
    }
    return text;
  }

  /** 最後まで一気に進める（シミュレーション用） */
  Battle.prototype.runToEnd = function () {
    while (this.next()) { /* 進めるだけ */ }
    return this.result;
  };

  const api = { Battle, heroStats, enemyStats, power, STANCE, disobeyChance, trustBonus, trustTier, traitVal };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BattleEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
