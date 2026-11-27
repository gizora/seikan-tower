/* 星喚の塔 — 英雄を自動で作る（召喚のたびに、世界に一人だけの英雄が生まれる。同じ英雄は二度と出ない） */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const D = isNode ? require('./data.js') : root.GameData;

  const pick = (rng, a) => a[Math.floor(rng() * a.length)];
  const chance = (rng, p) => rng() < p;

  // ---------- 名前 ----------
  const MORA_HEAD = ['ア', 'イ', 'エ', 'オ', 'カ', 'キ', 'ク', 'ケ', 'コ', 'サ', 'シ', 'セ', 'ソ', 'タ', 'テ', 'ト', 'ナ', 'ニ', 'ノ', 'ハ', 'ヒ', 'フ', 'ミ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ヴァ', 'ヴィ', 'ジェ', 'ゼ', 'ダ', 'ベ', 'ギ', 'グ', 'ユ', 'ヨ', 'シェ', 'ティ', 'ディ', 'ファ', 'イオ', 'エル'];
  const MORA_MID = ['ア', 'イ', 'ウ', 'カ', 'キ', 'サ', 'シ', 'タ', 'ナ', 'ニ', 'ネ', 'ノ', 'マ', 'ミ', 'ラ', 'リ', 'ル', 'レ', 'ロ', 'ヴ', 'ゼ', 'ド', 'バ', 'ー', 'ン', 'ッ', 'ル', 'リ'];
  const MORA_TAIL = ['ス', 'ト', 'ア', 'ン', 'ル', 'ラ', 'ナ', 'ド', 'ク', 'リ', 'ロ', 'カ', 'ネ', 'ム', 'ザ', 'ヤ', 'ジュ', 'ル', 'ス', 'エ', 'オ'];
  function makeName(rng) {
    const n = 1 + Math.floor(rng() * 3);       // 頭 + 中 0〜2 + 尾
    let s = pick(rng, MORA_HEAD);
    let last = '';
    for (let i = 0; i < n - 1; i++) {
      let m = pick(rng, MORA_MID);
      if ((m === 'ー' || m === 'ン' || m === 'ッ') && (last === 'ー' || last === 'ン' || last === 'ッ')) m = 'ラ';
      s += m; last = m;
    }
    let t = pick(rng, MORA_TAIL);
    if (last === 'ッ' && (t === 'ン' || t === 'ア' || t === 'エ' || t === 'オ')) t = 'ト';
    return s + t;
  }

  // ---------- 見た目 ----------
  const SKIN = ['#f6d7bd', '#f0c8a8', '#e8b894', '#d8a07c', '#c08a64', '#a87452', '#8a5a3e', '#f8e0d0'];
  const HAIR = ['#1e1e28', '#2a2230', '#3a2a22', '#5e3a22', '#8a5a30', '#c03a24', '#d8402a', '#f0d070', '#e6e0a8', '#c4c8d4', '#e8e8ee', '#5a86d8', '#7a4ab0', '#2a5a4a', '#a83a5a', '#4a4a5a'];
  const EYES = ['#3a6ad8', '#3a9a5a', '#8a5a2a', '#e03a3a', '#c050ff', '#f0a030', '#40d0ff', '#2a1d3a', '#ffd040'];
  const DARK = ['#24242e', '#2e3a4a', '#3a2232', '#4a1f2a', '#2a3a2a', '#3e2a1e', '#34364a', '#2a2238', '#1e2a36'];
  const MID = ['#7a2a2a', '#2a52a8', '#3e1f56', '#5e8e50', '#46669c', '#6a4a8a', '#8a5a34', '#3e7a44', '#5a3a6a', '#6a6a7a'];
  const LIGHT = ['#e8eaf4', '#c4a274', '#d8c8a8', '#b8b0c8', '#f4f2ec', '#c8d0b8'];
  const ACCENT = ['#d4a640', '#c8c8d8', '#a83a44', '#9a4ad8', '#3a8ac8', '#e8902a', '#5ad08a', '#e03a5a'];
  const METAL = [null, null, '#8a92a6', '#5a5468', '#d4b060', '#a8b0c0'];
  const GEM = ['#ff6a3a', '#9ad8ff', '#ffe27a', '#c8a8ff', '#9be07a', '#ff5a8a', '#60e0ff'];
  const STYLES = ['short', 'short', 'messy', 'spiky', 'swept', 'swept', 'long', 'long', 'bob', 'ponytail', 'twin', 'bald'];

  const CLASS_LOOK = {
    warrior:   { tops: ['armor', 'armor', 'armor', 'vest'], weapons: ['shield', 'shield', 'axe', 'greatsword'], gear: [['helmet', 0.25], ['cape', 0.35], ['beard', 0.3], ['scar', 0.2]], build: ['broad', 'broad', 'normal'] },
    swordsman: { tops: ['coat', 'coat', 'tunic', 'armor'], weapons: ['sword', 'sword', 'greatsword'], gear: [['cape', 0.45], ['scarf', 0.2], ['circlet', 0.1], ['scar', 0.15]], build: ['normal', 'slim', 'normal'] },
    thief:     { tops: ['coat', 'leather', 'leather'], weapons: ['daggers'], gear: [['hood', 0.55], ['mask', 0.4], ['scarf', 0.3], ['scar', 0.15]], build: ['slim', 'slim', 'normal'] },
    archer:    { tops: ['leather', 'leather', 'tunic', 'coat'], weapons: ['bow'], gear: [['hood', 0.3], ['cape', 0.35], ['headband', 0.25], ['elfEars', 0.2]], build: ['slim', 'normal'] },
    mage:      { tops: ['robe', 'robe', 'robe', 'coat'], weapons: ['staff', 'staff', 'orb', 'wand'], gear: [['wizardHat', 0.4], ['hood', 0.25], ['circlet', 0.15], ['longBeard', 0.08]], build: ['slim', 'normal'] },
    priest:    { tops: ['robe', 'dress', 'dress'], weapons: ['staff', 'wand'], gear: [['halo', 0.2], ['circlet', 0.3], ['hood', 0.2], ['satchel', 0.2]], build: ['slim', 'slim', 'normal'] },
  };

  function makeLook(rng, cls) {
    const L = CLASS_LOOK[cls];
    const top = pick(rng, L.tops);
    const gear = [];
    for (const [g, p] of L.gear) if (chance(rng, p)) gear.push(g);
    if (gear.includes('helmet')) { const i = gear.indexOf('hood'); if (i >= 0) gear.splice(i, 1); }
    if (gear.includes('wizardHat') && gear.includes('hood')) gear.splice(gear.indexOf('hood'), 1);
    const dark = chance(rng, 0.6);
    const c1 = top === 'armor' ? pick(rng, MID) : dark ? pick(rng, DARK) : chance(rng, 0.5) ? pick(rng, MID) : pick(rng, LIGHT);
    const look = {
      skin: pick(rng, SKIN), hair: pick(rng, HAIR), style: pick(rng, STYLES), eye: pick(rng, EYES), top,
      c1, c2: pick(rng, ACCENT), pants: pick(rng, DARK), boots: pick(rng, ['#2a1e16', '#3a2a1e', '#1a1a22', '#4a3020', '#5a5468']),
      weapon: pick(rng, L.weapons), gear, build: pick(rng, L.build), h: pick(rng, [0, 0, 0, 1, 1, -1, 2, 3]),
      gem: pick(rng, GEM), hat: pick(rng, DARK.concat(MID)), cape: pick(rng, MID.concat(DARK)), scarf: pick(rng, ACCENT),
      beard: null, metal: pick(rng, METAL),
    };
    if (look.gear.includes('mask')) look.mask = pick(rng, ['#7a2a34', '#2a2a36', '#4a4a5a']);
    if (look.style === 'bald' && !gear.includes('hood') && !gear.includes('helmet')) look.hair = pick(rng, ['#3a2a22', '#e8e8ee', '#5e3a22']);
    if (look.h >= 3 && look.build === 'broad') look.build = 'normal';
    return look;
  }

  // ---------- 二つ名・スキル ----------
  const TITLE_ADJ = ['灰', '銀', '紅', '蒼', '黒', '白', '月', '星', '霧', '嵐', '静寂', '黄昏', '夜明け', '鉄', '風', '雪', '影', '焔'];
  const TITLE_NOUN = {
    warrior: ['盾', '守り手', '重騎士', '城壁'], swordsman: ['剣士', '剣', '騎士', '刃'], thief: ['影', '盗賊', '短剣', '足音'],
    archer: ['射手', '狩人', '弓', '鷹'], mage: ['魔術師', '魔女', '賢者', '詠み手'], priest: ['祈り手', '聖女', '癒し手', '巡礼者'],
  };
  const SKILL_NAMES = {
    warrior: ['不動の構え', '鉄壁', '挑発', '守護の誓い', '大盾'], swordsman: ['一閃', '烈斬', '月影斬', '断罪', '流星斬'],
    thief: ['連撃', '影縫い', '急所突き', '乱れ刃'], archer: ['千本矢', '狙い撃ち', '雨の矢', '貫く矢'],
    mage: ['業火', '雷撃', '氷嵐', '星くず', '闇の波動'], priest: ['癒しの光', '祈り', '聖なる風', '再生の歌'],
  };
  function makeSkill(rng, cls, r) {
    const name = pick(rng, SKILL_NAMES[cls]);
    switch (cls) {
      case 'warrior': { const pd = r >= 3 || chance(rng, 0.3); return { name, type: 'taunt', partyDef: pd, cd: 4, desc: pd ? '敵を引きつけ、味方全員の防御を上げる' : '敵を引きつけて守りを固める' }; }
      case 'swordsman': { const pa = chance(rng, 0.2); return { name, type: 'single', mult: +(1.7 + 0.35 * r).toFixed(2), partyAtk: pa, cd: pa ? 4 : 3, desc: pa ? '敵1体を攻撃し、味方の攻撃を上げる' : '敵1体に大ダメージ' }; }
      case 'thief': return chance(rng, 0.5) ? { name, type: 'multi', hits: 3, mult: +(0.7 + 0.08 * r).toFixed(2), cd: 3, desc: '敵1体に3回攻撃' } : { name, type: 'single', mult: +(1.6 + 0.25 * r).toFixed(2), sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' };
      case 'archer': return chance(rng, 0.5) ? { name, type: 'multi', hits: 2 + r, mult: +(0.62 + 0.05 * r).toFixed(2), spread: true, cd: 3, desc: `ランダムな敵に${2 + r}回攻撃` } : { name, type: 'single', mult: +(1.9 + 0.2 * r).toFixed(2), sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' };
      case 'mage': return { name, type: 'aoe', mult: +(0.75 + 0.25 * r).toFixed(2), cd: 3, desc: '敵全体にダメージ' };
      default: return { name, type: 'heal_all', mult: +(0.85 + 0.3 * r).toFixed(2), cd: r >= 2 ? 3 : 4, desc: '味方全体を回復' };
    }
  }

  // ---------- 才能 ----------
  const TALENT_WEIGHT = {
    warrior: { hp: 3, atk: 1, def: 3, spd: 1 }, swordsman: { hp: 1.5, atk: 3, def: 1.5, spd: 1.5 }, thief: { hp: 1, atk: 2, def: 1, spd: 3 },
    archer: { hp: 1, atk: 3, def: 1, spd: 2 }, mage: { hp: 1, atk: 3.5, def: 1, spd: 1.5 }, priest: { hp: 2.5, atk: 2.5, def: 2, spd: 1 },
  };
  function makeTalents(rng, cls, r) {
    const t = { hp: 0, atk: 0, def: 0, spd: 0 };
    let left = D.TALENT_TOTAL[r] + (chance(rng, 0.25) ? 1 : 0) - (chance(rng, 0.2) ? 1 : 0);
    const w = TALENT_WEIGHT[cls];
    let guard = 0;
    while (left > 0 && guard++ < 50) {
      const keys = D.STAT_KEYS.filter(k => t[k] < 4);
      if (!keys.length) break;
      let sum = keys.reduce((a, k) => a + w[k], 0), x = rng() * sum, k = keys[0];
      for (const kk of keys) { x -= w[kk]; if (x < 0) { k = kk; break; } }
      t[k]++; left--;
    }
    return t;
  }

  // ---------- 記憶 ----------
  const JOBS = {
    warrior: ['城門の衛兵', '鍛冶屋の手伝い', '村の自警団', '傭兵'], swordsman: ['騎士見習い', '剣術道場の弟子', '王都の衛士', '流れの剣士'],
    thief: ['裏通りの孤児', '錠前師の弟子', '密偵', '義賊'], archer: ['森の狩人', '見張り台の射手', '猟師', '伝令'],
    mage: ['魔法学院の生徒', '占い師の弟子', '図書館の書き手', '錬金術師の助手'], priest: ['修道院の見習い', '薬師', '巡礼者', '教会の鐘つき'],
  };
  const SPOTS = ['麦畑のそばの小さな家', '坂の上の教会', '港の見える丘', '雪の積もる城下町', '森の奥の里', '灯りの消えない市場', '川沿いの水車小屋', '古い城壁の下'];
  const ITEMS = ['古い鍵', '焼きたてのパン', '折れた剣', '青い花', '小さな鈴', '色あせた地図', '刺繍のハンカチ', '木彫りの鳥'];
  const RELS = ['妹', '弟', '母', '父', '幼なじみ', '師匠', '親友', '祖母', '相棒', '兄', '姉'];
  const CALAMITY = {
    elde: 'ゴブリンの群れが丘を越えてきた', necroa: '死んだ者たちが起き上がった', frosbel: '雪がやまなくなった',
    garm: '森が燃え、獣たちが狂った', nox: '都の灯りが影に食われていった', astra: '空から星が消えていった',
  };
  const WORDS = ['生きて', '振り返らないで', 'あなたは強い子だから', 'また明日ね', '約束、忘れないで', '先に行け', 'お前ならできる', 'ありがとう'];
  const M1 = [
    (c) => `${c.job}をしていた手の感覚だけは、なぜか覚えている。`,
    (c) => `${c.spot}の匂いを、ときどき夢に見る。`,
    () => '誰かに名前を呼ばれていた気がする。やさしい声だった。',
    (c) => `${c.item}を見ると、胸の奥がざわつく。`,
  ];
  function makeMemories(rng, cls, land) {
    const c = { job: pick(rng, JOBS[cls]), spot: pick(rng, SPOTS), item: pick(rng, ITEMS), rel: pick(rng, RELS), pname: makeName(rng) };
    const landName = (D.LANDS.find(l => l.id === land) || D.LANDS[0]).name;
    return [
      pick(rng, M1)(c),
      `${landName}の${c.spot}で、${c.job}をしていた。${c.rel}の${c.pname}が、いつもそばにいた。`,
      `${CALAMITY[land] || '世界が崩れはじめた'}あの日、${c.rel}の${c.pname}とはぐれた。`,
      `${c.pname}の最後の言葉を思い出した。「${pick(rng, WORDS)}」……だから、まだ倒れるわけにはいかない。`,
    ];
  }

  const CLASS_WEIGHT = [['warrior', 2], ['swordsman', 2], ['thief', 1.5], ['archer', 1.5], ['mage', 1.5], ['priest', 1.5]];
  const PERS = ['loyal', 'brave', 'careful', 'whimsical', 'caring'];

  /**
   * 新しい英雄の定義を作る。usedNames（Set）にある名前は使わない。
   * @returns {object} HEROES と同じ形（id・name・title・cls・rarity・pers・land・skill・look・memories・talents）
   */
  function generate(rng, rarity, usedNames, serial, forceCls) {
    rng = rng || Math.random;
    let name = '', guard = 0;
    do { name = makeName(rng); } while ((usedNames.has(name) || name.length < 2) && guard++ < 200);
    if (usedNames.has(name)) name = name + 'ル' + serial;
    let x = rng() * CLASS_WEIGHT.reduce((a, [, w]) => a + w, 0), cls = 'warrior';
    for (const [c, w] of CLASS_WEIGHT) { x -= w; if (x < 0) { cls = c; break; } }
    if (forceCls) cls = forceCls;
    const land = pick(rng, D.LANDS).id;
    return {
      id: 'g' + serial, name, title: `${pick(rng, TITLE_ADJ)}の${pick(rng, TITLE_NOUN[cls])}`, cls, rarity,
      pers: pick(rng, PERS), land, skill: makeSkill(rng, cls, rarity), line: '',
      look: makeLook(rng, cls), memories: makeMemories(rng, cls, land), talents: makeTalents(rng, cls, rarity), generated: true,
    };
  }

  /** 手作りの英雄の才能（id から決まる） */
  function talentsFor(def) {
    if (def.talents) return def.talents;
    let seed = 0;
    for (const ch of def.id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const rng = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    return makeTalents(rng, def.cls, def.rarity);
  }

  /** 待機室（滅んだ世界）の名前 */
  function worldName(rng) {
    rng = rng || Math.random;
    let n = '';
    for (let i = 0; i < 20; i++) { n = pick(rng, D.WORLD_HEADS) + pick(rng, D.WORLD_TAILS); if (n.length >= 4 && n.length <= 6) break; }
    return n;
  }

  const api = { generate, talentsFor, worldName, makeName };
  if (isNode) module.exports = api;
  else root.HeroGen = api;
})(typeof window !== 'undefined' ? window : globalThis);
