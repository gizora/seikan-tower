/* 星喚の塔 — ゲームデータ（英雄・敵・塔の階） */
(function (root) {
  'use strict';

  // 職業ごとの基本能力（★1・レベル1のとき）
  const CLASSES = {
    warrior:   { name: '戦士',   icon: '🛡️', hp: 260, atk: 22, def: 22, spd: 85,  row: 'front', crit: 0.05 },
    swordsman: { name: '剣士',   icon: '⚔️', hp: 190, atk: 32, def: 12, spd: 100, row: 'front', crit: 0.08 },
    thief:     { name: '盗賊',   icon: '🗡️', hp: 165, atk: 27, def: 9,  spd: 130, row: 'front', crit: 0.2 },
    archer:    { name: '弓手',   icon: '🏹', hp: 150, atk: 30, def: 8,  spd: 105, row: 'back',  crit: 0.1 },
    mage:      { name: '魔術師', icon: '🔮', hp: 130, atk: 33, def: 6,  spd: 95,  row: 'back',  crit: 0.05 },
    priest:    { name: '僧侶',   icon: '✨', hp: 155, atk: 24, def: 10, spd: 100, row: 'back',  crit: 0.05, healer: true },
  };

  // レア度: 能力の倍率と最大レベル
  const RARITY = {
    1: { mult: 1.0,  maxLv: 20 },
    2: { mult: 1.25, maxLv: 30 },
    3: { mult: 1.6,  maxLv: 40 },
  };

  // 性格: 英雄が自分で考えて動くときのくせ
  const PERSONALITIES = {
    loyal:     { name: '忠実',     desc: '作戦にきっちり従う。' },
    brave:     { name: '勇敢',     desc: '決して守りに入らない。「おまかせ」だと強い敵を狙う。' },
    careful:   { name: '慎重',     desc: 'HP が減ると早めに守りを固める。「おまかせ」だと弱った敵を狙う。' },
    whimsical: { name: '気まぐれ', desc: 'ときどき作戦を無視して、気になった敵を狙う。' },
    caring:    { name: '仲間思い', desc: '仲間がピンチなら、温存中でもスキルで助ける。' },
  };

  // スキルの種類
  // single: 1体に大ダメージ / multi: 複数回攻撃 / aoe: 敵全体 / heal_all: 味方全体を回復 / taunt: 敵の攻撃を引きつける
  const HEROES = [
    // ★3
    { id: 'seres',    name: 'セレス',   title: '光の剣士',   cls: 'swordsman', rarity: 3, emoji: '🤺', pers: 'brave',
      skill: { name: '聖光斬', type: 'single', mult: 2.8, cd: 3, desc: '敵1体に大ダメージ' }, line: '光よ、切り裂け！' },
    { id: 'verna',    name: 'ヴェルナ', title: '炎の魔女',   cls: 'mage',      rarity: 3, emoji: '🧙‍♀️', pers: 'whimsical',
      skill: { name: '業火', type: 'aoe', mult: 1.4, cd: 3, desc: '敵全体にダメージ' }, line: 'まとめて燃えなさい！' },
    { id: 'gard',     name: 'ガルド',   title: '鉄の守護者', cls: 'warrior',   rarity: 3, emoji: '🧔', pers: 'caring',
      skill: { name: '不動の誓い', type: 'taunt', partyDef: true, cd: 4, desc: '敵の攻撃を引きつけ、味方全員の防御を上げる' }, line: '俺の後ろに下がれ！' },
    { id: 'riina',    name: 'リィナ',   title: '森の射手',   cls: 'archer',    rarity: 3, emoji: '🧝‍♀️', pers: 'careful',
      skill: { name: '千本矢', type: 'multi', hits: 5, mult: 0.75, spread: true, cd: 3, desc: 'ランダムな敵に5回攻撃' }, line: '逃がさないよ！' },
    { id: 'mireille', name: 'ミレイユ', title: '白の聖女',   cls: 'priest',    rarity: 3, emoji: '👼', pers: 'caring',
      skill: { name: '大いなる癒し', type: 'heal_all', mult: 1.7, cd: 3, desc: '味方全体を大きく回復' }, line: 'みんな、まだ戦えます！' },
    // ★2
    { id: 'baruk',    name: 'バルク',   title: '傭兵',       cls: 'warrior',   rarity: 2, emoji: '👨‍🦰', pers: 'brave',
      skill: { name: '挑発', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'こっちだ、かかってこい！' },
    { id: 'kai',      name: 'カイ',     title: '双剣使い',   cls: 'thief',     rarity: 2, emoji: '🥷', pers: 'whimsical',
      skill: { name: '連撃', type: 'multi', hits: 3, mult: 0.85, cd: 3, desc: '敵1体に3回攻撃' }, line: '遅い遅い！' },
    { id: 'nono',     name: 'ノノ',     title: '見習い魔導士', cls: 'mage',    rarity: 2, emoji: '🧙', pers: 'careful',
      skill: { name: '雷撃', type: 'aoe', mult: 1.1, cd: 3, desc: '敵全体にダメージ' }, line: 'え、えいっ！' },
    { id: 'jin',      name: 'ジン',     title: '狩人',       cls: 'archer',    rarity: 2, emoji: '🧝‍♂️', pers: 'loyal',
      skill: { name: '狙い撃ち', type: 'single', mult: 2.3, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'そこだ。' },
    { id: 'ema',      name: 'エマ',     title: '森の妖精',   cls: 'priest',    rarity: 2, emoji: '🧚‍♀️', pers: 'loyal',
      skill: { name: '癒しの風', type: 'heal_all', mult: 1.2, cd: 3, desc: '味方全体を回復' }, line: '風よ、みんなを癒して！' },
    { id: 'roran',    name: 'ロラン',   title: '王子騎士',   cls: 'swordsman', rarity: 2, emoji: '🤴', pers: 'caring',
      skill: { name: '鼓舞の剣', type: 'single', mult: 1.8, partyAtk: true, cd: 4, desc: '敵1体を攻撃し、味方全員の攻撃を上げる' }, line: '皆、続け！' },
    // ★1
    { id: 'tom',      name: 'トム',     title: '村の若者',   cls: 'swordsman', rarity: 1, emoji: '👦', pers: 'brave',
      skill: { name: '力いっぱい斬り', type: 'single', mult: 2.0, cd: 3, desc: '敵1体に大きめのダメージ' }, line: 'うおおお！' },
    { id: 'dolf',     name: 'ドルフ',   title: '農夫',       cls: 'warrior',   rarity: 1, emoji: '🧑‍🌾', pers: 'loyal',
      skill: { name: '踏ん張り', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'ここは通さねえ！' },
    { id: 'yuna',     name: 'ユナ',     title: '薬師',       cls: 'priest',    rarity: 1, emoji: '👩', pers: 'careful',
      skill: { name: '薬草の雨', type: 'heal_all', mult: 1.0, cd: 4, desc: '味方全体を少し回復' }, line: 'お薬の時間です！' },
    { id: 'pico',     name: 'ピコ',     title: '弓の練習生', cls: 'archer',    rarity: 1, emoji: '👧', pers: 'whimsical',
      skill: { name: '二連射', type: 'multi', hits: 2, mult: 1.0, cd: 3, desc: '敵1体に2回攻撃' }, line: '当たれー！' },
    { id: 'nez',      name: 'ネズ',     title: 'すばしっこい盗賊', cls: 'thief', rarity: 1, emoji: '🐭', pers: 'careful',
      skill: { name: '急所突き', type: 'single', mult: 1.8, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'チュッ、もらった！' },
    { id: 'maro',     name: 'マロ',     title: '占い師',     cls: 'mage',      rarity: 1, emoji: '👴', pers: 'loyal',
      skill: { name: '星くず', type: 'aoe', mult: 0.9, cd: 3, desc: '敵全体に少しダメージ' }, line: '星よ、降り注げ…' },
  ];

  const STARTER_HEROES = ['tom', 'dolf', 'yuna'];

  // 敵（レベル1のときの能力）
  const ENEMIES = {
    slime:      { name: 'スライム',   emoji: '💧', hp: 110, atk: 15, def: 4,  spd: 80 },
    rat:        { name: '大ネズミ',   emoji: '🐀', hp: 85,  atk: 17, def: 3,  spd: 120 },
    goblin:     { name: 'ゴブリン',   emoji: '👺', hp: 150, atk: 21, def: 8,  spd: 95 },
    bat:        { name: 'コウモリ',   emoji: '🦇', hp: 80,  atk: 18, def: 2,  spd: 140 },
    wolf:       { name: 'オオカミ',   emoji: '🐺', hp: 170, atk: 25, def: 8,  spd: 125 },
    shaman:     { name: '呪術師',     emoji: '👿', hp: 140, atk: 26, def: 6,  spd: 100,
                  skill: { name: '呪いの炎', type: 'aoe', mult: 0.7, cd: 3 } },
    skeleton:   { name: 'スケルトン', emoji: '💀', hp: 210, atk: 28, def: 16, spd: 90 },
    orc:        { name: 'オーク',     emoji: '👹', hp: 330, atk: 33, def: 15, spd: 80,
                  skill: { name: '叩きつけ', type: 'single', mult: 1.8, cd: 3 } },
    goblinKing: { name: 'ゴブリンキング', emoji: '👺', boss: true, hp: 700, atk: 36, def: 16, spd: 90,
                  skill: { name: '王の号令', type: 'aoe', mult: 0.8, cd: 3 }, summon: 'goblin', summonMax: 3,
                  trait: '手下のゴブリンを呼び続ける。王を倒さないと終わらない。' },
    boneDragon: { name: '骨の竜',     emoji: '🐉', boss: true, gray: true, hp: 800, atk: 56, def: 20, spd: 95,
                  skill: { name: '死の息', type: 'aoe', mult: 1.0, cd: 3 }, enrage: 0.06,
                  trait: '行動するたびに怒りが増し、攻撃力が上がっていく。' },
  };

  // 塔の階
  const FLOORS = [
    { name: '草原の入口',     lv: 1,  waves: [['slime', 'slime'], ['slime', 'rat']] },
    { name: '湿った回廊',     lv: 3,  waves: [['rat', 'rat', 'slime'], ['goblin', 'slime']] },
    { name: 'ゴブリンの巣',   lv: 5,  waves: [['goblin', 'goblin'], ['bat', 'goblin', 'bat']] },
    { name: '獣の通り道',     lv: 7,  waves: [['wolf', 'bat', 'bat'], ['goblin', 'shaman', 'goblin']] },
    { name: 'ゴブリン王の間', lv: 8,  waves: [['goblin', 'goblin', 'shaman'], ['goblin', 'goblinKing', 'shaman']] },
    { name: '骨の回廊',       lv: 10, waves: [['skeleton', 'bat', 'skeleton'], ['wolf', 'wolf', 'wolf']] },
    { name: '静寂の墓所',     lv: 12, waves: [['skeleton', 'skeleton', 'skeleton'], ['shaman', 'orc', 'shaman']] },
    { name: 'オークの砦',     lv: 14, waves: [['orc', 'wolf', 'orc'], ['skeleton', 'shaman', 'skeleton', 'shaman']] },
    { name: '闇の階段',       lv: 16, waves: [['wolf', 'wolf', 'bat', 'bat'], ['orc', 'skeleton', 'orc'], ['shaman', 'skeleton', 'shaman']] },
    { name: '骨の竜の玉座',   lv: 17, waves: [['skeleton', 'orc', 'skeleton'], ['skeleton', 'boneDragon', 'skeleton']] },
  ];

  // 作戦の選択肢
  const TACTICS = {
    stance: {
      label: '作戦',
      options: [
        { value: 'attack',  name: '攻撃重視', desc: '攻撃力が上がり、防御が下がる。誰も守りに入らない。' },
        { value: 'balance', name: 'バランス', desc: '攻めと守りのバランスをとる。' },
        { value: 'defend',  name: '守り重視', desc: '防御が上がり、攻撃が下がる。HP が減ると早めに守りに入る。' },
      ],
    },
    target: {
      label: '狙う敵',
      options: [
        { value: 'weak',   name: '弱った敵', desc: '残り HP が一番少ない敵から倒す。' },
        { value: 'strong', name: '強い敵',   desc: 'ボスや攻撃力の高い敵を先に狙う。' },
        { value: 'front',  name: '前の敵',   desc: '一番前の敵から順に倒す。' },
        { value: 'auto',   name: 'おまかせ', desc: '英雄それぞれの性格で狙う敵を決める。' },
      ],
    },
    healLine: {
      label: '回復の目安',
      options: [
        { value: 0.3, name: 'HP 30%', desc: '仲間の HP が 30% を切ったら回復する。回復が少ないぶん攻撃が多い。' },
        { value: 0.5, name: 'HP 50%', desc: '仲間の HP が 50% を切ったら回復する。' },
        { value: 0.7, name: 'HP 70%', desc: '仲間の HP が 70% を切ったら回復する。とても安全だが攻撃が減る。' },
      ],
    },
    skill: {
      label: 'スキル',
      options: [
        { value: 'now',  name: 'すぐ使う', desc: '使えるようになったらすぐ使う。' },
        { value: 'save', name: '温存',     desc: 'ボス戦か、自分がピンチのときまでとっておく。' },
      ],
    },
  };

  const DEFAULT_TACTICS = { stance: 'balance', target: 'weak', healLine: 0.5, skill: 'now' };

  const GACHA = {
    cost1: 100,
    cost10: 1000,
    rates: { 3: 0.05, 2: 0.25, 1: 0.70 },
    pityMax: 60,          // この回数までに★3が出なければ必ず★3
    maxAwaken: 5,
    dupGold: 200,         // 覚醒が最大の英雄が出たときの金貨
  };

  const PARTY_SIZE = 5;
  const START_GEMS = 1500;
  const START_GOLD = 300;

  const data = {
    CLASSES, RARITY, PERSONALITIES, HEROES, STARTER_HEROES, ENEMIES, FLOORS, TACTICS,
    DEFAULT_TACTICS, GACHA, PARTY_SIZE, START_GEMS, START_GOLD,
    heroById: Object.fromEntries(HEROES.map(h => [h.id, h])),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.GameData = data;
})(typeof window !== 'undefined' ? window : globalThis);
