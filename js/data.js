/* 星喚の塔 — ゲームデータ（英雄・敵・塔の階・特性・会話） */
(function (root) {
  'use strict';

  // 職業ごとの基本能力（★1・レベル1のとき）
  const CLASSES = {
    warrior:   { name: '戦士',   icon: '🛡️', hp: 260, atk: 22, def: 22, spd: 85,  row: 'front', crit: 0.05, body: 'armor' },
    swordsman: { name: '剣士',   icon: '⚔️', hp: 190, atk: 32, def: 12, spd: 100, row: 'front', crit: 0.08, body: 'tunic' },
    thief:     { name: '盗賊',   icon: '🗡️', hp: 165, atk: 27, def: 9,  spd: 130, row: 'front', crit: 0.2,  body: 'light' },
    archer:    { name: '弓手',   icon: '🏹', hp: 150, atk: 30, def: 8,  spd: 105, row: 'back',  crit: 0.1,  body: 'light' },
    mage:      { name: '魔術師', icon: '🔮', hp: 130, atk: 33, def: 6,  spd: 95,  row: 'back',  crit: 0.05, body: 'robe' },
    priest:    { name: '僧侶',   icon: '✨', hp: 155, atk: 24, def: 10, spd: 100, row: 'back',  crit: 0.05, body: 'robe', healer: true },
  };

  // 星（★）の段階: 能力の倍率・最大レベル・次の★に上げるのに必要な「星の欠片」
  const STARS = {
    1: { mult: 1.0,  maxLv: 20, cost: 20 },
    2: { mult: 1.25, maxLv: 30, cost: 60 },
    3: { mult: 1.6,  maxLv: 40, cost: 150 },
    4: { mult: 2.0,  maxLv: 50, cost: 300 },
    5: { mult: 2.5,  maxLv: 60, cost: null },
  };
  const MAX_STAR = 5;

  // 性格: 英雄が自分で考えて動くときのくせと、最初の信頼度
  const PERSONALITIES = {
    loyal:     { name: '忠実',     trust: 55, desc: '作戦にきっちり従う。マスターを信じやすい。' },
    brave:     { name: '勇敢',     trust: 40, desc: '決して守りに入らない。「おまかせ」だと強い敵を狙う。' },
    careful:   { name: '慎重',     trust: 40, desc: 'HP が減ると早めに守りを固める。「おまかせ」だと弱った敵を狙う。' },
    whimsical: { name: '気まぐれ', trust: 30, desc: 'ときどき作戦を無視して、気になった敵を狙う。' },
    caring:    { name: '仲間思い', trust: 45, desc: '仲間がピンチなら、温存中でもスキルで助ける。仲間を失うと深く傷つく。' },
  };

  // 信頼度の段階
  // 信頼度 45 未満だと作戦に従わないことがある（低いほど多い）。talk は会話（TALK）のどの段を使うか
  const TRUST_TIERS = [
    { min: 0,  name: '警戒', talk: 0, desc: '作戦に従わないことが多い' },
    { min: 25, name: '迷い', talk: 0, desc: 'たまに作戦に従わない' },
    { min: 45, name: '普通', talk: 1, desc: '作戦に従う' },
    { min: 60, name: '信頼', talk: 2, desc: '作戦に従う。能力が少し上がる（+5%）' },
    { min: 90, name: '絆',   talk: 3, desc: '作戦に従う。能力が上がる（+10%）' },
  ];

  // 特性（レベル1〜3）
  const TRAITS = {
    might:   { name: '怪力',   vals: [0.08, 0.16, 0.24], desc: '攻撃 +{p}%' },
    guard:   { name: '鉄壁',   vals: [0.12, 0.24, 0.36], desc: '防御 +{p}%' },
    sturdy:  { name: '頑丈',   vals: [0.10, 0.20, 0.30], desc: 'HP +{p}%' },
    swift:   { name: '俊足',   vals: [0.06, 0.12, 0.18], desc: '速さ +{p}%' },
    keen:    { name: '会心',   vals: [0.08, 0.16, 0.24], desc: '会心の確率 +{p}%' },
    mend:    { name: '癒し手', vals: [0.15, 0.30, 0.45], desc: '回復量 +{p}%' },
    drain:   { name: '吸血',   vals: [0.08, 0.16, 0.24], desc: '与えたダメージの {p}% だけ HP を回復' },
    first:   { name: '先制',   vals: [300, 600, 900],    desc: '戦いの始まりに素早く動ける（+{v}）' },
    undying: { name: '不屈',   vals: [0.4, 0.7, 1.0],    desc: '1回の戦闘で1度だけ、倒れるはずの攻撃を HP 1 で耐える（{p}%）' },
    counter: { name: '反撃',   vals: [0.15, 0.30, 0.45], desc: '攻撃を受けたとき {p}% の確率で反撃する' },
  };
  const MAX_TRAIT_LV = 3;

  /*
   * 英雄。look はドット絵の見た目:
   *   skin 肌 / hair 髪 / style 髪型(short long bob spiky ponytail twin messy bald)
   *   outfit 服 / accent 飾り / pants ズボン / boots 靴 / weapon 武器
   *   gear 頭や体の飾り(wizardHat hood mask helmet halo crown headband strawHat elfEars mouseEars beard wings cape)
   *   hat 帽子・フードの色 / gem 宝石の色 / beard ひげの色 / cape マントの色
   */
  const HEROES = [
    // ★3
    { id: 'seres',    name: 'セレス',   title: '光の剣士',   cls: 'swordsman', rarity: 3, pers: 'brave',
      skill: { name: '聖光斬', type: 'single', mult: 2.8, cd: 3, desc: '敵1体に大ダメージ' }, line: '光よ、切り裂け！',
      look: { skin: '#f6d7bd', hair: '#f3d36b', style: 'long', outfit: '#eef0f8', accent: '#d9a93b', pants: '#3a4a86', boots: '#6b4630', weapon: 'sword', gear: ['cape'], cape: '#3c5bb8' } },
    { id: 'verna',    name: 'ヴェルナ', title: '炎の魔女',   cls: 'mage',      rarity: 3, pers: 'whimsical',
      skill: { name: '業火', type: 'aoe', mult: 1.4, cd: 3, desc: '敵全体にダメージ' }, line: 'まとめて燃えなさい！',
      look: { skin: '#f8dcc6', hair: '#e04a2c', style: 'long', outfit: '#4a2360', accent: '#f0a030', pants: '#2a1838', boots: '#2a1838', weapon: 'staff', gem: '#ff6a3a', gear: ['wizardHat'], hat: '#3a1a50' } },
    { id: 'gard',     name: 'ガルド',   title: '鉄の守護者', cls: 'warrior',   rarity: 3, pers: 'caring',
      skill: { name: '不動の誓い', type: 'taunt', partyDef: true, cd: 4, desc: '敵の攻撃を引きつけ、味方全員の防御を上げる' }, line: '俺の後ろに下がれ！',
      look: { skin: '#d9a07a', hair: '#6a4026', style: 'short', outfit: '#7a2a2a', accent: '#d9a93b', pants: '#4a3a3a', boots: '#7d8698', weapon: 'shield', gear: ['beard'], beard: '#6a4026' } },
    { id: 'riina',    name: 'リィナ',   title: '森の射手',   cls: 'archer',    rarity: 3, pers: 'careful',
      skill: { name: '千本矢', type: 'multi', hits: 5, mult: 0.75, spread: true, cd: 3, desc: 'ランダムな敵に5回攻撃' }, line: '逃がさないよ！',
      look: { skin: '#f6dcc4', hair: '#e8e0a0', style: 'ponytail', outfit: '#3f8a4a', accent: '#a8743a', pants: '#2f5a34', boots: '#6b4630', weapon: 'bow', gear: ['elfEars', 'headband'] } },
    { id: 'mireille', name: 'ミレイユ', title: '白の聖女',   cls: 'priest',    rarity: 3, pers: 'caring',
      skill: { name: '大いなる癒し', type: 'heal_all', mult: 1.7, cd: 3, desc: '味方全体を大きく回復' }, line: 'みんな、まだ戦えます！',
      look: { skin: '#fbe4d2', hair: '#dfe4f0', style: 'long', outfit: '#f6f4ee', accent: '#e0b84a', pants: '#e8e2d4', boots: '#c9b890', weapon: 'staff', gem: '#ffe27a', gear: ['halo'] } },
    // ★2
    { id: 'baruk',    name: 'バルク',   title: '傭兵',       cls: 'warrior',   rarity: 2, pers: 'brave',
      skill: { name: '挑発', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'こっちだ、かかってこい！',
      look: { skin: '#e0a985', hair: '#c8402a', style: 'spiky', outfit: '#6b4a2e', accent: '#3a2a1e', pants: '#4a3a2a', boots: '#3a2a1e', weapon: 'axe' } },
    { id: 'kai',      name: 'カイ',     title: '双剣使い',   cls: 'thief',     rarity: 2, pers: 'whimsical',
      skill: { name: '連撃', type: 'multi', hits: 3, mult: 0.85, cd: 3, desc: '敵1体に3回攻撃' }, line: '遅い遅い！',
      look: { skin: '#f0c8a8', hair: '#22222e', style: 'short', outfit: '#2c2c3c', accent: '#c83a3a', pants: '#22222e', boots: '#22222e', weapon: 'daggers', gear: ['hood', 'mask'], hat: '#33334a' } },
    { id: 'nono',     name: 'ノノ',     title: '見習い魔導士', cls: 'mage',    rarity: 2, pers: 'careful',
      skill: { name: '雷撃', type: 'aoe', mult: 1.1, cd: 3, desc: '敵全体にダメージ' }, line: 'え、えいっ！',
      look: { skin: '#fbe0cc', hair: '#5a8ae0', style: 'bob', outfit: '#3a5aa8', accent: '#f0d060', pants: '#2a3a70', boots: '#2a3a70', weapon: 'staff', gem: '#9ad8ff', gear: ['wizardHat'], hat: '#2e4a96' } },
    { id: 'jin',      name: 'ジン',     title: '狩人',       cls: 'archer',    rarity: 2, pers: 'loyal',
      skill: { name: '狙い撃ち', type: 'single', mult: 2.3, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'そこだ。',
      look: { skin: '#e8c8a8', hair: '#c8ccd8', style: 'short', outfit: '#2f4a32', accent: '#7a5a3a', pants: '#3a3a2a', boots: '#4a3020', weapon: 'bow', gear: ['elfEars'] } },
    { id: 'ema',      name: 'エマ',     title: '森の妖精',   cls: 'priest',    rarity: 2, pers: 'loyal',
      skill: { name: '癒しの風', type: 'heal_all', mult: 1.2, cd: 3, desc: '味方全体を回復' }, line: '風よ、みんなを癒して！',
      look: { skin: '#fde6d6', hair: '#f08ab8', style: 'twin', outfit: '#7ccf8a', accent: '#f6f0a0', pants: '#5aa86a', boots: '#5aa86a', weapon: 'wand', gem: '#b8fff0', gear: ['wings'] } },
    { id: 'roran',    name: 'ロラン',   title: '王子騎士',   cls: 'swordsman', rarity: 2, pers: 'caring',
      skill: { name: '鼓舞の剣', type: 'single', mult: 1.8, partyAtk: true, cd: 4, desc: '敵1体を攻撃し、味方全員の攻撃を上げる' }, line: '皆、続け！',
      look: { skin: '#f6d6bc', hair: '#e8c050', style: 'short', outfit: '#2e5ab0', accent: '#e8c050', pants: '#f0ece0', boots: '#5a3a2a', weapon: 'sword', gear: ['crown', 'cape'], cape: '#b0303a' } },
    // ★1
    { id: 'tom',      name: 'トム',     title: '村の若者',   cls: 'swordsman', rarity: 1, pers: 'brave',
      skill: { name: '力いっぱい斬り', type: 'single', mult: 2.0, cd: 3, desc: '敵1体に大きめのダメージ' }, line: 'うおおお！',
      look: { skin: '#f0c49e', hair: '#8a5a30', style: 'messy', outfit: '#c8a878', accent: '#6b4a2e', pants: '#5a4a3a', boots: '#4a3020', weapon: 'sword' } },
    { id: 'dolf',     name: 'ドルフ',   title: '農夫',       cls: 'warrior',   rarity: 1, pers: 'loyal',
      skill: { name: '踏ん張り', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'ここは通さねえ！',
      look: { skin: '#d8a078', hair: '#7a5a3a', style: 'short', outfit: '#4a6aa0', accent: '#d8c8a0', pants: '#4a6aa0', boots: '#5a3a24', weapon: 'fork', gear: ['strawHat', 'beard'], beard: '#7a5a3a' } },
    { id: 'yuna',     name: 'ユナ',     title: '薬師',       cls: 'priest',    rarity: 1, pers: 'careful',
      skill: { name: '薬草の雨', type: 'heal_all', mult: 1.0, cd: 4, desc: '味方全体を少し回復' }, line: 'お薬の時間です！',
      look: { skin: '#f6d2b6', hair: '#6a3a22', style: 'ponytail', outfit: '#6a9a5a', accent: '#f2ead8', pants: '#4a6a3a', boots: '#4a3020', weapon: 'staff', gem: '#9be07a' } },
    { id: 'pico',     name: 'ピコ',     title: '弓の練習生', cls: 'archer',    rarity: 1, pers: 'whimsical',
      skill: { name: '二連射', type: 'multi', hits: 2, mult: 1.0, cd: 3, desc: '敵1体に2回攻撃' }, line: '当たれー！',
      look: { skin: '#f8d8c0', hair: '#f08a3a', style: 'twin', outfit: '#d8b070', accent: '#8a5a30', pants: '#7a5a30', boots: '#5a3a22', weapon: 'bow' } },
    { id: 'nez',      name: 'ネズ',     title: 'すばしっこい盗賊', cls: 'thief', rarity: 1, pers: 'careful',
      skill: { name: '急所突き', type: 'single', mult: 1.8, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'チュッ、もらった！',
      look: { skin: '#f2d4c0', hair: '#9a9aa8', style: 'short', outfit: '#7a5a3a', accent: '#c8a060', pants: '#5a4030', boots: '#3a2a1e', weapon: 'daggers', gear: ['mouseEars'] } },
    { id: 'maro',     name: 'マロ',     title: '占い師',     cls: 'mage',      rarity: 1, pers: 'loyal',
      skill: { name: '星くず', type: 'aoe', mult: 0.9, cd: 3, desc: '敵全体に少しダメージ' }, line: '星よ、降り注げ…',
      look: { skin: '#e8c0a0', hair: '#e8e8ee', style: 'bald', outfit: '#6a4a8a', accent: '#e0c060', pants: '#4a3a6a', boots: '#3a2a4a', weapon: 'orb', gem: '#c8a8ff', gear: ['wizardHat', 'beard'], hat: '#4a2a6a', beard: '#eeeef4' } },
  ];

  const STARTER_HEROES = ['tom', 'dolf', 'yuna'];

  // 敵（レベル1のときの能力）。sprite はドット絵の種類、tint は色違い
  const ENEMIES = {
    slime:      { name: 'スライム',   sprite: 'slime',    hp: 110, atk: 15, def: 4,  spd: 80 },
    rat:        { name: '大ネズミ',   sprite: 'rat',      hp: 85,  atk: 17, def: 3,  spd: 120 },
    goblin:     { name: 'ゴブリン',   sprite: 'goblin',   hp: 150, atk: 21, def: 8,  spd: 95 },
    bat:        { name: 'コウモリ',   sprite: 'bat',      hp: 80,  atk: 18, def: 2,  spd: 140 },
    wolf:       { name: 'オオカミ',   sprite: 'wolf',     hp: 170, atk: 25, def: 8,  spd: 125 },
    shaman:     { name: '呪術師',     sprite: 'shaman',   hp: 140, atk: 26, def: 6,  spd: 100,
                  skill: { name: '呪いの炎', type: 'aoe', mult: 0.7, cd: 3 } },
    skeleton:   { name: 'スケルトン', sprite: 'skeleton', hp: 210, atk: 28, def: 16, spd: 90 },
    orc:        { name: 'オーク',     sprite: 'orc',      hp: 330, atk: 33, def: 15, spd: 80,
                  skill: { name: '叩きつけ', type: 'single', mult: 1.8, cd: 3 } },
    ghost:      { name: 'ゴースト',   sprite: 'ghost',    hp: 120, atk: 26, def: 4,  spd: 135 },
    iceSlime:   { name: '氷スライム', sprite: 'slime', tint: 'ice', hp: 170, atk: 22, def: 12, spd: 85,
                  skill: { name: '凍える息', type: 'aoe', mult: 0.5, cd: 3 } },
    iceWolf:    { name: '雪狼',       sprite: 'wolf',  tint: 'ice', hp: 200, atk: 30, def: 10, spd: 130 },
    golem:      { name: 'ゴーレム',   sprite: 'golem',    hp: 420, atk: 30, def: 30, spd: 60 },
    gargoyle:   { name: 'ガーゴイル', sprite: 'bat',   tint: 'stone', hp: 190, atk: 30, def: 20, spd: 110 },
    deathKnight:{ name: '死霊騎士',   sprite: 'skeleton', tint: 'dark', hp: 300, atk: 38, def: 22, spd: 95,
                  skill: { name: '死霊の剣', type: 'single', mult: 1.8, cd: 3 } },
    imp:        { name: 'インプ',     sprite: 'shaman', tint: 'fire', hp: 150, atk: 32, def: 8, spd: 120,
                  skill: { name: '火の粉', type: 'aoe', mult: 0.6, cd: 3 } },
    // ボス
    goblinKing: { name: 'ゴブリンキング', sprite: 'goblin', tint: 'king', boss: true, hp: 700, atk: 36, def: 16, spd: 90,
                  skill: { name: '王の号令', type: 'aoe', mult: 0.8, cd: 3 }, summon: 'goblin', summonMax: 3,
                  trait: '手下のゴブリンを呼び続ける。王を倒さないと終わらない。' },
    boneDragon: { name: '骨の竜',     sprite: 'dragon', boss: true, hp: 800, atk: 56, def: 20, spd: 95,
                  skill: { name: '死の息', type: 'aoe', mult: 1.0, cd: 3 }, enrage: 0.06,
                  trait: '行動するたびに怒りが増し、攻撃力が上がっていく。' },
    iceWitch:   { name: '氷の魔女',   sprite: 'human', boss: true, hp: 900, atk: 50, def: 18, spd: 100,
                  skill: { name: '氷嵐', type: 'aoe', mult: 0.8, cd: 3 }, freeze: 450,
                  look: { skin: '#e8f0ff', hair: '#f0f8ff', style: 'long', outfit: '#5a8ad0', accent: '#d0f0ff', pants: '#3a5a9a', boots: '#3a5a9a', weapon: 'staff', gem: '#a0f0ff', gear: ['wizardHat'], hat: '#2a4a8a' },
                  trait: '氷嵐で凍えさせ、英雄の行動を遅らせる。素早い英雄や「先制」が役に立つ。' },
    ogre:       { name: '双頭のオーガ', sprite: 'orc', tint: 'ogre', boss: true, hp: 1400, atk: 58, def: 22, spd: 85,
                  skill: { name: '大地割り', type: 'aoe', mult: 0.9, cd: 4 }, double: true,
                  trait: '2つの頭で、1回の行動で2人を同時に殴る。前衛の守りが大切。' },
    shadowKnight:{ name: '影の騎士',  sprite: 'human', boss: true, hp: 1000, atk: 62, def: 26, spd: 105,
                  skill: { name: '影斬り', type: 'single', mult: 2.0, cd: 3 }, barrier: 0.35,
                  look: { skin: '#5a4a6a', hair: '#1a1424', style: 'short', outfit: '#2a2238', accent: '#9a4ad8', pants: '#1a1424', boots: '#1a1424', weapon: 'sword', gear: ['helmet', 'cape'], cape: '#4a1a6a' },
                  trait: '影の盾で守られている。盾は時間がたつと張り直される。一気に削り切ろう。' },
    starEater:  { name: '星喰らい',   sprite: 'eye', boss: true, hp: 1200, atk: 54, def: 26, spd: 100,
                  skill: { name: '星喰い', type: 'aoe', mult: 1.0, cd: 3 }, summon: 'imp', summonMax: 3, enrage: 0.03,
                  trait: 'インプを呼び、時間がたつほど強くなる。塔の最後の敵。' },
  };

  // 塔の階（lv は敵のレベル）
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
    { name: '霧の回廊',       lv: 24, waves: [['ghost', 'bat', 'ghost'], ['skeleton', 'ghost', 'skeleton']] },
    { name: '凍える通路',     lv: 28, waves: [['iceSlime', 'iceSlime', 'iceSlime'], ['iceWolf', 'shaman', 'iceWolf']] },
    { name: '石像の間',       lv: 32, waves: [['gargoyle', 'golem', 'gargoyle'], ['golem', 'shaman', 'golem']] },
    { name: '吹雪の階段',     lv: 36, waves: [['iceWolf', 'iceWolf', 'iceWolf'], ['iceSlime', 'golem', 'iceSlime', 'shaman']] },
    { name: '氷の魔女の間',   lv: 39, waves: [['iceWolf', 'iceSlime', 'iceWolf'], ['iceSlime', 'iceWitch', 'iceSlime']] },
    { name: '亡霊の書庫',     lv: 46, waves: [['ghost', 'ghost', 'ghost', 'ghost'], ['deathKnight', 'ghost', 'deathKnight']] },
    { name: '死霊の砦',       lv: 50, waves: [['deathKnight', 'skeleton', 'deathKnight'], ['shaman', 'deathKnight', 'shaman']] },
    { name: '炎の回廊',       lv: 54, waves: [['imp', 'imp', 'imp'], ['orc', 'imp', 'orc', 'imp']] },
    { name: '魔獣の檻',       lv: 58, waves: [['wolf', 'iceWolf', 'wolf', 'iceWolf'], ['golem', 'imp', 'golem'], ['gargoyle', 'gargoyle', 'gargoyle']] },
    { name: 'オーガの闘技場', lv: 60, waves: [['orc', 'orc', 'imp'], ['imp', 'ogre', 'imp']] },
    { name: '崩れた礼拝堂',   lv: 68, waves: [['gargoyle', 'deathKnight', 'gargoyle'], ['ghost', 'shaman', 'ghost', 'shaman']] },
    { name: '影の回廊',       lv: 75, waves: [['deathKnight', 'deathKnight', 'deathKnight'], ['imp', 'golem', 'imp']] },
    { name: '魔導の塔',       lv: 82, waves: [['shaman', 'shaman', 'shaman', 'shaman'], ['golem', 'deathKnight', 'golem']] },
    { name: '星の見える橋',   lv: 88, waves: [['gargoyle', 'iceWolf', 'gargoyle', 'iceWolf'], ['deathKnight', 'imp', 'deathKnight', 'imp']] },
    { name: '影の騎士の間',   lv: 92, waves: [['deathKnight', 'ghost', 'deathKnight'], ['ghost', 'shadowKnight', 'ghost']] },
    { name: '黄昏の庭',       lv: 106, waves: [['imp', 'imp', 'imp', 'imp'], ['golem', 'golem', 'shaman']] },
    { name: '歪んだ回廊',     lv: 112, waves: [['ghost', 'deathKnight', 'ghost', 'deathKnight'], ['orc', 'golem', 'orc']] },
    { name: '星屑の階段',     lv: 118, waves: [['iceWolf', 'wolf', 'iceWolf', 'wolf'], ['deathKnight', 'shaman', 'deathKnight', 'shaman']] },
    { name: '終わりの門',     lv: 124, waves: [['golem', 'deathKnight', 'golem'], ['imp', 'gargoyle', 'imp', 'gargoyle'], ['deathKnight', 'deathKnight', 'shaman']] },
    { name: '星喰らいの玉座', lv: 126, waves: [['deathKnight', 'imp', 'deathKnight'], ['imp', 'starEater', 'imp']] },
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
    retreat: {
      label: '撤退',
      options: [
        { value: 'never',  name: 'しない',     desc: '最後まで戦う。倒れた英雄は二度と戻らない。' },
        { value: 'down',   name: '1人倒れたら', desc: '誰かが倒れたら、残りの英雄を連れて撤退する。' },
        { value: 'danger', name: '危なくなったら', desc: 'HP が 15% を切った仲間が出たら、倒れる前に撤退する。' },
      ],
    },
  };

  const DEFAULT_TACTICS = { stance: 'balance', target: 'weak', healLine: 0.5, skill: 'now', retreat: 'never' };

  const GACHA = {
    cost1: 100,
    cost10: 1000,
    rates: { 3: 0.05, 2: 0.25, 1: 0.70 },
    pityMax: 60,                         // この回数までに★3が出なければ必ず★3
    dupShards: { 1: 5, 2: 15, 3: 50 },   // 同じ英雄が出たときにもらえる星の欠片
  };
  // 送り出す（お別れ）ときにもらえる星の欠片（元のレア度ごと、★の数を掛ける）
  const FAREWELL_SHARDS = { 1: 5, 2: 15, 3: 40 };

  const PARTY_SIZE = 5;
  const START_GEMS = 1500;
  const START_GOLD = 300;

  // ---------- 会話 ----------
  // 話しかけたときの返事（性格 × 信頼度の段階: 0 警戒 / 1 普通 / 2 信頼 / 3 絆）
  const TALK = {
    loyal: [
      ['……ご命令があれば、従います。', 'マスターのことは、まだよく知りません。'],
      ['今日も塔ですか？ 準備はできています。', '作戦、ちゃんと覚えましたよ。'],
      ['マスターの作戦なら、安心して戦えます。', '次の階も、一緒に登りましょう。'],
      ['どこまでもお供します、マスター。', 'あなたに呼ばれて、本当によかった。'],
    ],
    brave: [
      ['あんたの指図はいらねえ。俺は俺で戦う。', '弱い★だからって、捨て駒にする気じゃないだろうな？'],
      ['もっと強い敵と戦わせてくれよ！', '退屈だ。早く塔へ行こうぜ。'],
      ['あんたの作戦、悪くねえな。', '前は任せろ。誰にも触らせねえ。'],
      ['あんたとなら、塔のてっぺんまで行ける気がする！', '背中は預けたぜ、マスター。'],
    ],
    careful: [
      ['……本当に、生きて帰れるんですか？', '無茶な作戦なら、従えません。'],
      ['危ない階は、ちゃんと準備してからにしましょう。', '倒れたら二度と戻れない……忘れないでくださいね。'],
      ['マスターは無茶をしないから、信じられます。', '撤退の判断、助かりました。'],
      ['あなたの判断なら、命を預けられます。', 'ずっと一緒にいられるように、がんばります。'],
    ],
    whimsical: [
      ['ふーん。で、あなた誰だっけ？', '作戦？ 気が向いたらね。'],
      ['今日は何して遊ぶ？ 塔？ ふーん。', 'あの星、きれいだと思わない？'],
      ['あなたの作戦、ちょっと面白いかも。', 'たまには言うこと聞いてあげる。'],
      ['あなたのこと、けっこう気に入ってるんだよ？', 'ずっとここにいてあげる。特別だよ。'],
    ],
    caring: [
      ['……仲間を使い捨てにする人には、従えません。', 'みんな、怖い思いをしています。'],
      ['みんなの様子、見てあげてくださいね。', '今日は誰もけがをしていませんか？'],
      ['あなたは仲間を大事にしてくれる。うれしいです。', 'みんな、あなたを信じ始めていますよ。'],
      ['この待機室は、もう私たちの家です。', 'あなたが守ってくれるから、私もみんなを守れます。'],
    ],
  };

  // 待機室でのひとりごと（性格ごと）
  const ROOM_LINES = {
    loyal:     ['次の作戦は何だろう', '剣の手入れをしておこう', '今日もがんばるぞ'],
    brave:     ['腕がなるぜ！', 'まだまだ鍛え足りねえ', '早く塔に行きてえ'],
    careful:   ['無理はしないように…', '回復薬、足りるかな', '次の敵の情報を読んでおこう'],
    whimsical: ['ふあ〜あ', 'お腹すいた〜', 'あの雲、ドラゴンみたい'],
    caring:    ['みんな元気かな', '今日も全員そろってる', 'お茶をいれてこよう'],
  };
  // 二人の会話
  const CHATS = [
    ['昨日の戦い、すごかったね', 'まあね、次も任せて'],
    ['塔の上には何があるんだろう', '星が近いらしいよ'],
    ['ご飯できたよー', 'やった！'],
    ['ちょっと手合わせしない？', 'いいね、負けないよ'],
    ['マスターってどんな人なのかな', '…悪い人じゃなさそう'],
    ['この本、読んだ？', 'まだ。貸して！'],
    ['強くなったね', 'そっちこそ'],
    ['眠れないの？', '星を見てただけ'],
  ];
  // 仲間を失ったあとの言葉（{name} は失った英雄）
  const GRIEF_LINES = ['{name}…どうして…', '{name}の分まで戦う', '{name}の席、まだ空いたままだ', 'もう誰も失いたくない'];

  const data = {
    CLASSES, STARS, MAX_STAR, PERSONALITIES, TRUST_TIERS, TRAITS, MAX_TRAIT_LV, HEROES, STARTER_HEROES, ENEMIES, FLOORS,
    TACTICS, DEFAULT_TACTICS, GACHA, FAREWELL_SHARDS, PARTY_SIZE, START_GEMS, START_GOLD,
    TALK, ROOM_LINES, CHATS, GRIEF_LINES,
    heroById: Object.fromEntries(HEROES.map(h => [h.id, h])),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.GameData = data;
})(typeof window !== 'undefined' ? window : globalThis);
