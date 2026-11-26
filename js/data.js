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
   * 英雄。look はドット絵の見た目（人の頭身で描く）:
   *   skin 肌 / hair 髪 / style 髪型(short long bob spiky messy swept ponytail twin bald) / eye 目
   *   top 服の形(tunic coat armor robe dress leather vest overalls) / c1 服の色 / c2 飾り・縁の色
   *   pants ズボン / boots 靴 / build 体格(slim normal broad) / h 背の低さ（0 が標準、大きいほど低い。-1 は高い）
   *   weapon 武器(sword greatsword axe staff orb wand bow daggers fork shield)
   *   gear 飾り(wizardHat hood mask helmet halo crown circlet headband strawHat elfEars mouseEars
   *        beard longBeard wings cape scarf satchel scar)
   *   hat 帽子・フードの色 / gem 宝石の色 / beard ひげの色 / cape マントの色 / scarf えりまきの色 / metal 金属の色
   * land は故郷（この世界の地方）、memories は★2〜★5 に昇級したときに思い出す記憶。
   */
  const HEROES = [
    // ★3
    { id: 'seres',    name: 'セレス',   title: '光の剣士',   cls: 'swordsman', rarity: 3, pers: 'brave', land: 'astra',
      skill: { name: '聖光斬', type: 'single', mult: 2.8, cd: 3, desc: '敵1体に大ダメージ' }, line: '光よ、切り裂け！',
      look: { skin: '#f4d6bf', hair: '#f0d070', style: 'long', eye: '#3a6ad8', top: 'coat', c1: '#e8eaf4', c2: '#d4a640', pants: '#2e3a6e', boots: '#5a3a2a', weapon: 'sword', gear: ['cape'], cape: '#2f4fa8', build: 'slim', h: 0 },
      memories: ['夜空を見上げると、懐かしくて、少し怖い。',
        '星の海アストラでは、星ひとつひとつに国があった。私はその守り手の一人だった。',
        '星喰らいが現れて、星がひとつ、またひとつと消えた。空が暗くなるたびに、国が消えていった。',
        '最後の星で、私は剣を折られた。……それでも、光はまだここにある。今度は、折れない。'] },
    { id: 'verna',    name: 'ヴェルナ', title: '炎の魔女',   cls: 'mage',      rarity: 3, pers: 'whimsical', land: 'nox',
      skill: { name: '業火', type: 'aoe', mult: 1.4, cd: 3, desc: '敵全体にダメージ' }, line: 'まとめて燃えなさい！',
      look: { skin: '#f6dac6', hair: '#d8402a', style: 'long', eye: '#f0a030', top: 'robe', c1: '#3e1f56', c2: '#e8902a', pants: '#2a1838', boots: '#2a1838', weapon: 'staff', gem: '#ff6a3a', gear: ['wizardHat'], hat: '#2c1440', build: 'slim', h: 0 },
      memories: ['火を見ていると落ち着く。燃やしたいわけじゃない……たぶん。',
        '影の都ノクスの魔導院で、一番の問題児だった。先生たちはいつも頭を抱えていた。',
        '都の灯りがひとつずつ影に食われていった。わたしの炎だけが、最後まで消えなかった。',
        '影の騎士は、わたしに炎を教えてくれた師匠だった。……弟子として、けじめをつける。'] },
    { id: 'gard',     name: 'ガルド',   title: '鉄の守護者', cls: 'warrior',   rarity: 3, pers: 'caring', land: 'necroa',
      skill: { name: '不動の誓い', type: 'taunt', partyDef: true, cd: 4, desc: '敵の攻撃を引きつけ、味方全員の防御を上げる' }, line: '俺の後ろに下がれ！',
      look: { skin: '#d29a76', hair: '#5e3a22', style: 'short', eye: '#3a2a1a', top: 'armor', c1: '#8a2a2a', c2: '#d4a640', pants: '#3a3030', boots: '#8a92a6', weapon: 'shield', gear: ['beard'], beard: '#5e3a22', build: 'broad', h: -1 },
      memories: ['盾を構えると、心が静まる。誰かを背中にかばう形が、体にしみついている。',
        '帝国の近衛だった。皇帝ではなく、城下の子どもたちを守るのが好きだった。',
        '骨の竜が空を覆った夜、死んだ者たちが起き上がり、生きている者を襲いはじめた。',
        '倒れた部下たちが、骨になって俺に剣を向けた。……もう誰も、あんな姿にはさせない。'] },
    { id: 'riina',    name: 'リィナ',   title: '森の射手',   cls: 'archer',    rarity: 3, pers: 'careful', land: 'garm',
      skill: { name: '千本矢', type: 'multi', hits: 5, mult: 0.75, spread: true, cd: 3, desc: 'ランダムな敵に5回攻撃' }, line: '逃がさないよ！',
      look: { skin: '#f4dcc6', hair: '#e6e0a8', style: 'ponytail', eye: '#3a9a5a', top: 'leather', c1: '#3e7a44', c2: '#8a5a32', pants: '#2e4a30', boots: '#5a3a24', weapon: 'bow', gear: ['elfEars', 'headband'], build: 'slim', h: 0 },
      memories: ['風の向きで、獲物の居場所がわかる。森の中にいるみたいに。',
        '獣の大陸ガルムの大森林で、エルフの見張りをしていた。木の上が家だった。',
        '巨人たちが森を焼いた。魔獣たちは狂ったように暴れ、森の歌が聞こえなくなった。',
        '最後に聞いたのは、焼け落ちる世界樹のきしむ音。あの音を、二度と誰にも聞かせない。'] },
    { id: 'mireille', name: 'ミレイユ', title: '白の聖女',   cls: 'priest',    rarity: 3, pers: 'caring', land: 'frosbel',
      skill: { name: '大いなる癒し', type: 'heal_all', mult: 1.7, cd: 3, desc: '味方全体を大きく回復' }, line: 'みんな、まだ戦えます！',
      look: { skin: '#fae4d4', hair: '#e2e6f2', style: 'long', eye: '#8a7ad8', top: 'dress', c1: '#f4f2ec', c2: '#d8b04a', pants: '#e8e2d4', boots: '#c8b890', weapon: 'staff', gem: '#ffe27a', gear: ['halo'], build: 'slim', h: 1 },
      memories: ['祈りの言葉を、ひとつ残らず覚えている。でも、誰に祈っていたのかは思い出せない。',
        '凍える人々のために、大聖堂の扉をいつも開けていた。',
        '氷の魔女は、わたしの妹だった。人々を救えない自分を責めて、冬に心を明け渡してしまった。',
        'あの子を止められるのは、わたしの祈りだけ。……今度こそ、手を離さない。'] },
    // ★2
    { id: 'baruk',    name: 'バルク',   title: '傭兵',       cls: 'warrior',   rarity: 2, pers: 'brave', land: 'necroa',
      skill: { name: '挑発', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'こっちだ、かかってこい！',
      look: { skin: '#d8a07c', hair: '#c03a24', style: 'spiky', eye: '#5a3a1a', top: 'vest', c1: '#5e3e26', c2: '#2e2018', pants: '#3e3226', boots: '#2e2018', weapon: 'axe', gear: ['scar'], build: 'broad', h: -1 },
      memories: ['金のために戦っていた。……それだけだったはずだ。',
        '傭兵団の連中は、うるさくて、汚くて、最高の仲間だった。',
        '帝国が崩れたとき、雇い主は真っ先に逃げた。俺たちは金にならない撤退戦を引き受けた。',
        '団長は言った。「報酬は、誰かが明日を迎えることだ」。俺はまだ、その報酬を受け取りに行く途中だ。'] },
    { id: 'kai',      name: 'カイ',     title: '双剣使い',   cls: 'thief',     rarity: 2, pers: 'whimsical', land: 'necroa',
      skill: { name: '連撃', type: 'multi', hits: 3, mult: 0.85, cd: 3, desc: '敵1体に3回攻撃' }, line: '遅い遅い！',
      look: { skin: '#e8c4a6', hair: '#1e1e28', style: 'swept', eye: '#e03a3a', top: 'coat', c1: '#34364a', c2: '#a83a44', pants: '#24242e', boots: '#1a1a22', weapon: 'daggers', gear: ['hood', 'mask'], hat: '#44465c', mask: '#7a2a34', build: 'slim', h: 0 },
      memories: ['暗い路地の歩き方を知っている。音を立てない足の運びも。',
        '帝国の裏の部隊で、誰かの命令で誰かを消していた。名前の代わりに、番号で呼ばれていた。',
        '最後の命令は「竜を呼んだ司祭を殺せ」。間に合わなかった。',
        '司祭は笑っていた。「帝国は永遠になる。死者として」。……あの笑い声を、止めに行く。'] },
    { id: 'nono',     name: 'ノノ',     title: '見習い魔導士', cls: 'mage',    rarity: 2, pers: 'careful', land: 'frosbel',
      skill: { name: '雷撃', type: 'aoe', mult: 1.1, cd: 3, desc: '敵全体にダメージ' }, line: 'え、えいっ！',
      look: { skin: '#fae0cc', hair: '#5a86d8', style: 'bob', eye: '#2a4aa8', top: 'robe', c1: '#34529c', c2: '#ecd060', pants: '#26386a', boots: '#26386a', weapon: 'staff', gem: '#9ad8ff', gear: ['wizardHat'], hat: '#2a4488', build: 'slim', h: 4 },
      memories: ['寒いのは苦手。なのに、雪の結晶の形を見ると胸がぎゅっとなる。',
        '魔法学院の一番の下っ端だった。先生の杖を磨くのが、わたしの仕事。',
        '雪がやまなくなって百日目、先生は「春を呼ぶ魔法」を完成させるために塔へ登った。',
        '先生の魔法は、氷の魔女に奪われた。……あの魔法の続きを書けるのは、わたしだけ。'] },
    { id: 'jin',      name: 'ジン',     title: '狩人',       cls: 'archer',    rarity: 2, pers: 'loyal', land: 'garm',
      skill: { name: '狙い撃ち', type: 'single', mult: 2.3, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'そこだ。',
      look: { skin: '#e2c2a4', hair: '#c4c8d4', style: 'swept', eye: '#6a8a5a', top: 'leather', c1: '#2e4430', c2: '#6a4a2e', pants: '#34342a', boots: '#3e2a1c', weapon: 'bow', gear: ['elfEars', 'cape'], cape: '#243a28', build: 'normal', h: -1 },
      memories: ['獲物は必要なぶんだけ狩る。それが掟だった気がする。',
        '群れからはぐれた狼の子を育てていた。名前はハイロ。',
        '大陸じゅうの獣が狂ったとき、ハイロも牙をむいた。俺は弓を下ろせなかった。',
        '獣を狂わせたのは、闘技場で育てられた双頭の怪物だった。……ハイロの仇は、あいつだ。'] },
    { id: 'ema',      name: 'エマ',     title: '森の妖精',   cls: 'priest',    rarity: 2, pers: 'loyal', land: 'garm',
      skill: { name: '癒しの風', type: 'heal_all', mult: 1.2, cd: 3, desc: '味方全体を回復' }, line: '風よ、みんなを癒して！',
      look: { skin: '#fce6d6', hair: '#f088b8', style: 'twin', eye: '#3aa87a', top: 'dress', c1: '#78c888', c2: '#f6f0a0', pants: '#5aa86a', boots: '#5aa86a', weapon: 'wand', gem: '#b8fff0', gear: ['wings'], build: 'slim', h: 4 },
      memories: ['花が咲く音が聞こえる。人には聞こえないなんて、知らなかった。',
        '世界樹の葉っぱの上で生まれた。仲間の妖精は、百人くらいいた。',
        '森が燃えた日、羽の小さい子たちから順に、煙にのまれていった。',
        '最後のひとりになったわたしを、誰かの手が門の中へ押し込んだ。……あれは、誰の手だったの？'] },
    { id: 'roran',    name: 'ロラン',   title: '王子騎士',   cls: 'swordsman', rarity: 2, pers: 'caring', land: 'frosbel',
      skill: { name: '鼓舞の剣', type: 'single', mult: 1.8, partyAtk: true, cd: 4, desc: '敵1体を攻撃し、味方全員の攻撃を上げる' }, line: '皆、続け！',
      look: { skin: '#f4d4ba', hair: '#e6be50', style: 'short', eye: '#3a5ab0', top: 'coat', c1: '#2a52a8', c2: '#e6be50', pants: '#ece6d8', boots: '#4a2e20', weapon: 'sword', gear: ['circlet', 'cape'], cape: '#a82a34', build: 'normal', h: -1 },
      memories: ['人の前に立つと、自然と背筋が伸びる。誰に教わったのだろう。',
        '氷の国フロスベルの第二王子だった。兄上のほうが、ずっと王にふさわしかった。',
        '兄上は民を逃がすために、凍った城に一人で残った。私は逃げる側だった。',
        '王冠は兄上のものだ。私はただ、兄上が守ろうとした人々の前に立ち続ける。'] },
    // ★1
    { id: 'tom',      name: 'トム',     title: '村の若者',   cls: 'swordsman', rarity: 1, pers: 'brave', land: 'elde',
      skill: { name: '力いっぱい斬り', type: 'single', mult: 2.0, cd: 3, desc: '敵1体に大きめのダメージ' }, line: 'うおおお！',
      look: { skin: '#eec09a', hair: '#7e5230', style: 'messy', eye: '#5a3a1a', top: 'tunic', c1: '#c4a274', c2: '#6a4a2c', pants: '#54463a', boots: '#46301e', weapon: 'sword', gear: [], build: 'normal', h: 0 },
      memories: ['麦畑の匂いを覚えている。毎朝、誰かと剣のまねごとをしていた。',
        '幼なじみがいた。「騎士になったら、この村を守ってね」と笑っていた。',
        '空が緑色ににごった日、ゴブリンの群れが丘を越えてきた。俺は棒きれ一本で立っていた。',
        '守れなかった。だから今度こそ、あの丘の向こうまで剣を届かせる。'] },
    { id: 'dolf',     name: 'ドルフ',   title: '農夫',       cls: 'warrior',   rarity: 1, pers: 'loyal', land: 'elde',
      skill: { name: '踏ん張り', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'ここは通さねえ！',
      look: { skin: '#d49c74', hair: '#76563a', style: 'short', eye: '#3a2a1a', top: 'overalls', c1: '#46669c', c2: '#e0d2b0', pants: '#46669c', boots: '#523622', weapon: 'fork', gear: ['strawHat', 'beard'], beard: '#76563a', build: 'broad', h: 0 },
      memories: ['土を耕す手の感触だけは、忘れていない。',
        '女房と娘がいた。収穫祭の夜、三人で焼いた芋がうまかった。',
        '王国の騎士たちは先に逃げた。残ったのは、鍬を持った俺たち農夫だけだった。',
        '最後まで畑の前に立っていた。……あの子たちが逃げる時間は、稼げたんだろうか。'] },
    { id: 'yuna',     name: 'ユナ',     title: '薬師',       cls: 'priest',    rarity: 1, pers: 'careful', land: 'elde',
      skill: { name: '薬草の雨', type: 'heal_all', mult: 1.0, cd: 4, desc: '味方全体を少し回復' }, line: 'お薬の時間です！',
      look: { skin: '#f4d0b4', hair: '#663822', style: 'ponytail', eye: '#5a3a22', top: 'dress', c1: '#5e8e50', c2: '#f0e8d4', pants: '#46663a', boots: '#46301e', weapon: 'staff', gem: '#9be07a', gear: ['satchel'], build: 'slim', h: 2 },
      memories: ['薬草の名前は、なぜか全部すらすら出てくる。',
        '師匠のおばあさんに「薬は人を待ってくれない」と、よく叱られていた。',
        '病に倒れた人であふれた教会で、薬が尽きるまで走り回った。',
        '最後の一瓶を、知らない兵士に渡した。あの人は、生き延びられたのかな。'] },
    { id: 'pico',     name: 'ピコ',     title: '弓の練習生', cls: 'archer',    rarity: 1, pers: 'whimsical', land: 'elde',
      skill: { name: '二連射', type: 'multi', hits: 2, mult: 1.0, cd: 3, desc: '敵1体に2回攻撃' }, line: '当たれー！',
      look: { skin: '#f6d6be', hair: '#ee8838', style: 'twin', eye: '#6a4a22', top: 'tunic', c1: '#d4ac6c', c2: '#8a5a30', pants: '#76582e', boots: '#583a22', weapon: 'bow', gear: [], build: 'slim', h: 3 },
      memories: ['的の真ん中に当てると、誰かが頭をなでてくれた気がする。',
        '兄さんは王国一の弓使いだった。わたしはいつも、追いかけてばかり。',
        '兄さんは城壁の上から矢を射ち続けて、そのまま帰ってこなかった。',
        '兄さんの弓、ずっと重くて引けなかった。今なら、引けるよ。'] },
    { id: 'nez',      name: 'ネズ',     title: 'すばしっこい盗賊', cls: 'thief', rarity: 1, pers: 'careful', land: 'garm',
      skill: { name: '急所突き', type: 'single', mult: 1.8, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'チュッ、もらった！',
      look: { skin: '#f0d2be', hair: '#9898a6', style: 'messy', eye: '#2a2a2a', top: 'leather', c1: '#76563a', c2: '#c49c5e', pants: '#563e2e', boots: '#3a2a1e', weapon: 'daggers', gear: ['mouseEars', 'scarf'], scarf: '#b03a3a', build: 'slim', h: 3 },
      memories: ['鍵穴を見ると、指がむずむずする。',
        'ネズミの耳の一族は、大陸の地下に町を作って暮らしていた。',
        '地上が魔獣だらけになって、地下の町へ逃げてくる人たちを、こっそり助けていた。',
        '町の入口を最後に閉めたのは、おいらだ。外に残った仲間の声が、まだ耳に残ってる。'] },
    { id: 'maro',     name: 'マロ',     title: '占い師',     cls: 'mage',      rarity: 1, pers: 'loyal', land: 'nox',
      skill: { name: '星くず', type: 'aoe', mult: 0.9, cd: 3, desc: '敵全体に少しダメージ' }, line: '星よ、降り注げ…',
      look: { skin: '#e4bc9c', hair: '#e6e6ee', style: 'bald', eye: '#4a3a6a', top: 'robe', c1: '#62468a', c2: '#dcbc5c', pants: '#46366a', boots: '#382848', weapon: 'orb', gem: '#c8a8ff', gear: ['wizardHat', 'longBeard'], hat: '#46286a', beard: '#ececf4', build: 'normal', h: 1 },
      memories: ['星の並びを見ると、明日のことが少しだけわかる。',
        '影の都ノクスの王宮で、星読みをしていた。王は占いを信じない人だった。',
        '「都は影に沈む」と告げた日、わしは牢に入れられた。……当たってほしくなかった。',
        '牢の窓から、最後の星が消えるのを見ていた。だが、星はまた昇る。それも、わしの占いじゃ。'] },
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
    // 塔の上の区域の敵
    fireSlime:  { name: '溶岩スライム', sprite: 'slime', tint: 'lava', hp: 200, atk: 30, def: 14, spd: 85, bleed: 0.2,
                  skill: { name: '溶岩しぶき', type: 'aoe', mult: 0.6, cd: 3 } },
    lavaGolem:  { name: '溶岩ゴーレム', sprite: 'golem', tint: 'lava', hp: 460, atk: 36, def: 30, spd: 60 },
    seaSlime:   { name: '深海スライム', sprite: 'slime', tint: 'sea', hp: 190, atk: 30, def: 12, spd: 90 },
    drowned:    { name: '溺れた兵士', sprite: 'skeleton', tint: 'sea', hp: 280, atk: 36, def: 20, spd: 95, bleed: 0.25 },
    harpy:      { name: 'ハーピー',   sprite: 'bat', tint: 'sky', hp: 200, atk: 36, def: 12, spd: 145, bleed: 0.2 },
    sentinel:   { name: '天空の番兵', sprite: 'golem', tint: 'sky', hp: 420, atk: 38, def: 34, spd: 75,
                  skill: { name: '光線', type: 'single', mult: 1.8, cd: 3 } },
    starling:   { name: '星の眷属',   sprite: 'eye', tint: 'small', hp: 240, atk: 40, def: 18, spd: 115, fear: 0.15 },
    // ボス
    goblinKing: { name: 'ゴブリンキング', sprite: 'goblin', tint: 'king', boss: true, hp: 700, atk: 36, def: 16, spd: 90,
                  skill: { name: '王の号令', type: 'aoe', mult: 0.8, cd: 3 }, summon: 'goblin', summonMax: 3,
                  trait: '手下のゴブリンを呼び続ける。王を倒さないと終わらない。' },
    boneDragon: { name: '骨の竜',     sprite: 'dragon', boss: true, hp: 800, atk: 56, def: 20, spd: 95,
                  skill: { name: '死の息', type: 'aoe', mult: 1.0, cd: 3 }, enrage: 0.06,
                  trait: '行動するたびに怒りが増し、攻撃力が上がっていく。' },
    iceWitch:   { name: '氷の魔女',   sprite: 'human', boss: true, hp: 900, atk: 50, def: 18, spd: 100,
                  skill: { name: '氷嵐', type: 'aoe', mult: 0.8, cd: 3 }, freeze: 450,
                  look: { skin: '#e4ecfc', hair: '#eef6ff', style: 'long', eye: '#40d0ff', top: 'dress', c1: '#4a7ac8', c2: '#cceeff', pants: '#2e4e8e', boots: '#2e4e8e', weapon: 'staff', gem: '#a0f0ff', gear: ['crown'], build: 'slim', h: -1 },
                  trait: '氷嵐で凍えさせ、英雄の行動を遅らせる。素早い英雄や「先制」が役に立つ。' },
    ogre:       { name: '双頭のオーガ', sprite: 'orc', tint: 'ogre', boss: true, hp: 1400, atk: 58, def: 22, spd: 85,
                  skill: { name: '大地割り', type: 'aoe', mult: 0.9, cd: 4 }, double: true,
                  trait: '2つの頭で、1回の行動で2人を同時に殴る。前衛の守りが大切。' },
    shadowKnight:{ name: '影の騎士',  sprite: 'human', boss: true, hp: 1000, atk: 62, def: 26, spd: 105,
                  skill: { name: '影斬り', type: 'single', mult: 2.0, cd: 3 }, barrier: 0.35,
                  look: { skin: '#584868', hair: '#18121f', style: 'short', eye: '#c050ff', top: 'armor', c1: '#2a2238', c2: '#9a4ad8', pants: '#18121f', boots: '#3a3448', weapon: 'greatsword', gear: ['helmet', 'cape'], cape: '#40185e', metal: '#5a5468', build: 'broad', h: -1 },
                  trait: '影の盾で守られている。盾は時間がたつと張り直される。一気に削り切ろう。' },
    starEater:  { name: '星喰らい',   sprite: 'eye', boss: true, hp: 1200, atk: 54, def: 26, spd: 100,
                  skill: { name: '星喰い', type: 'aoe', mult: 1.0, cd: 3 }, summon: 'imp', summonMax: 3, enrage: 0.03,
                  trait: 'インプを呼び、時間がたつほど強くなる。塔の最後の敵。', fear: 0.25 },
    fireGiant:  { name: '炎の巨人',   sprite: 'golem', tint: 'lavaBoss', boss: true, hp: 1500, atk: 60, def: 30, spd: 80,
                  skill: { name: '大噴火', type: 'aoe', mult: 1.0, cd: 3 }, enrage: 0.03, bleed: 0.4,
                  trait: '大噴火で全体を焼き、出血させる。時間がたつほど強くなる。' },
    seaSerpent: { name: '深淵の海竜', sprite: 'dragon', tint: 'sea', boss: true, hp: 1400, atk: 58, def: 26, spd: 100,
                  skill: { name: '大渦', type: 'aoe', mult: 0.9, cd: 3 }, summon: 'seaSlime', summonMax: 3, freeze: 350,
                  trait: '大渦で英雄の動きを鈍らせ、手下を呼ぶ。' },
    steelAngel: { name: '鋼の天使',   sprite: 'human', boss: true, hp: 1300, atk: 64, def: 34, spd: 110,
                  skill: { name: '裁きの光', type: 'aoe', mult: 0.9, cd: 3 }, barrier: 0.3,
                  look: { skin: '#e8e8f0', hair: '#f4f0ff', style: 'long', eye: '#ffe060', top: 'armor', c1: '#e8e2c8', c2: '#f0c850', pants: '#c8ccd8', boots: '#c8ccd8', weapon: 'greatsword', gear: ['halo', 'wings'], metal: '#e4e8f0', build: 'normal', h: -1 },
                  trait: '光の盾に守られ、盾は張り直される。' },
    fallenHero: { name: '堕ちた勇者', sprite: 'human', boss: true, hp: 1400, atk: 70, def: 30, spd: 115,
                  skill: { name: '絶望の剣', type: 'single', mult: 2.2, cd: 3 }, double: true, fear: 0.35,
                  look: { skin: '#c8b8b0', hair: '#e8e8e8', style: 'swept', eye: '#ff3a3a', top: 'coat', c1: '#2a1a1e', c2: '#a02a2a', pants: '#1a1214', boots: '#1a1214', weapon: 'greatsword', gear: ['cape', 'scar'], cape: '#4a0a14', metal: '#8a8a96', build: 'normal', h: -1 },
                  trait: 'かつての勇者。2人を同時に斬り、英雄たちに恐怖を与える。' },
  };

  // ---------- 塔: 100階。10階ごとに区域があり、区域の最後の階にボスがいる ----------
  // land は、その区域がかつてどの地方だったか（英雄の故郷）
  const ZONES = [
    { name: '緑の王国エルデ',   land: 'elde',    boss: 'goblinKing', pool: ['slime', 'rat', 'goblin', 'bat', 'wolf', 'shaman'],
      places: ['草原の入口', '麦畑の跡', '湿った回廊', '獣の通り道', 'ゴブリンの巣', '崩れた砦', '風の丘', '荒れた村', '古井戸'], bossRoom: 'ゴブリン王の間' },
    { name: '骨の帝国ネクロア', land: 'necroa',  boss: 'boneDragon', pool: ['skeleton', 'bat', 'wolf', 'orc', 'shaman', 'ghost'],
      places: ['骨の回廊', '静寂の墓所', 'オークの砦', '闇の階段', '帝都の廃墟', '死者の行進路', '錆びた城門', '鐘のない鐘楼', '近衛の詰所'], bossRoom: '骨の竜の玉座' },
    { name: '氷の国フロスベル', land: 'frosbel', boss: 'iceWitch',   pool: ['iceSlime', 'iceWolf', 'golem', 'gargoyle', 'shaman'],
      places: ['凍える通路', '霧氷の森', '石像の間', '吹雪の階段', '凍った城下町', '氷柱の洞窟', '白い大聖堂', '雪に埋もれた学院', '氷の橋'], bossRoom: '氷の魔女の間' },
    { name: '獣の大陸ガルム',   land: 'garm',    boss: 'ogre',       pool: ['wolf', 'iceWolf', 'orc', 'golem', 'imp', 'bat'],
      places: ['焼けた森', '魔獣の檻', '巨人の足あと', '地下の町', '世界樹の根', '狩人の小屋', '牙の谷', '吠える岩場', '闘技場の控え室'], bossRoom: 'オーガの闘技場' },
    { name: '影の都ノクス',     land: 'nox',     boss: 'shadowKnight', pool: ['ghost', 'deathKnight', 'gargoyle', 'shaman', 'skeleton'],
      places: ['亡霊の書庫', '死霊の砦', '消えた灯りの通り', '魔導院の廃墟', '影の回廊', '星読みの牢', '崩れた礼拝堂', '黒い運河', '王宮の裏門'], bossRoom: '影の騎士の間' },
    { name: '灼熱の山脈',       land: null,      boss: 'fireGiant',  pool: ['fireSlime', 'lavaGolem', 'imp', 'orc'],
      places: ['炎の回廊', '溶岩の川', '灰の村', '鍛冶神の炉', '火口の縁', '黒曜石の谷', '煙る坑道', '燃える橋', '熱風の洞'], bossRoom: '炎の巨人の炉' },
    { name: '沈んだ海の都',     land: null,      boss: 'seaSerpent', pool: ['seaSlime', 'drowned', 'ghost', 'iceSlime'],
      places: ['水没した広場', '珊瑚の回廊', '沈んだ船', '潮の満ちる階段', '泡の神殿', '深い井戸', '海藻の森', '溺れた王宮', '渦の入口'], bossRoom: '海竜の淵' },
    { name: '天空の回廊',       land: null,      boss: 'steelAngel', pool: ['harpy', 'sentinel', 'gargoyle', 'golem'],
      places: ['雲の上の橋', '風の神殿', '浮かぶ庭', '番兵の門', '光の階段', '空中庭園', '雷の塔', '翼の墓所', '天の書庫'], bossRoom: '天使の聖堂' },
    { name: '星の海アストラ',   land: 'astra',   boss: 'fallenHero', pool: ['starling', 'deathKnight', 'imp', 'harpy'],
      places: ['星の見える橋', '消えた星の跡', '黄昏の庭', '歪んだ回廊', '星屑の階段', '光の墓標', '折れた剣の丘', '眠る星の部屋', '最後の灯台'], bossRoom: '勇者の墓' },
    { name: '塔の頂',           land: null,      boss: 'starEater',  pool: ['deathKnight', 'starling', 'sentinel', 'lavaGolem', 'drowned', 'harpy'],
      places: ['終わりの門', '世界の記憶', '時の止まった広間', '名もなき回廊', '空の裂け目', '星喰らいの影', '最後の階段', '静寂の間', '玉座の前'], bossRoom: '星喰らいの玉座' },
  ];
  const FLOORS_PER_ZONE = 10;
  const WORLD_NAME = 'エテルナ';

  // 敵のレベルの伸び方（今までの30階の伸び方を100階に引き伸ばしたもの）
  const LV_CURVE = [1, 3, 5, 7, 8, 10, 12, 14, 16, 17, 24, 28, 32, 36, 39, 46, 50, 54, 58, 60, 68, 75, 82, 88, 92, 106, 112, 118, 124, 126];
  function floorLevel(fi) {
    const x = fi * (LV_CURVE.length - 1) / 99;
    const i = Math.floor(x), t = x - i;
    const a = LV_CURVE[i], b = LV_CURVE[Math.min(LV_CURVE.length - 1, i + 1)];
    return Math.max(1, Math.round(a + (b - a) * t));
  }
  function makeFloors() {
    const out = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    for (let fi = 0; fi < 100; fi++) {
      const z = ZONES[Math.floor(fi / FLOORS_PER_ZONE)];
      const k = fi % FLOORS_PER_ZONE;
      const pool = fi < 3 ? ['slime', 'rat'] : z.pool;
      const pick = () => pool[Math.floor(rnd() * pool.length)];
      const size = Math.min(4, 2 + Math.floor(k / 4) + (fi >= 50 ? 1 : 0));
      const waves = [];
      if (k === FLOORS_PER_ZONE - 1) {
        waves.push([pick(), pick(), pick()]);
        waves.push([pick(), z.boss, pick()]);
      } else {
        const n = (k === 4 || k === 8) ? 3 : 2;
        for (let w = 0; w < n; w++) { const wave = []; for (let i = 0; i < size; i++) wave.push(pick()); waves.push(wave); }
      }
      out.push({ name: k === FLOORS_PER_ZONE - 1 ? z.bossRoom : z.places[k], lv: floorLevel(fi), waves, zone: Math.floor(fi / FLOORS_PER_ZONE) });
    }
    return out;
  }
  const FLOORS = makeFloors();

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

  // ---------- 英雄の状態（英雄の声は聞こえない。状態はメッセージで伝わる） ----------
  const STATUS = {
    fear:  { name: '恐怖', icon: '😨', turns: 3, mult: 0.7, msg: '{n}が恐怖状態、能力値が30%減少' },
    bleed: { name: '出血', icon: '🩸', turns: 3, dmg: 0.06, msg: '{n}が出血状態、体力が減少中' },
    cold:  { name: '凍え', icon: '❄️', msg: '{n}が凍えている、行動が遅れる' },
  };
  // 英雄の今の行動（戦闘の映像の英雄一覧に出す）
  const ACTIONS = { attack: '攻撃', skill: 'スキル', heal: '回復', guard: '防御', slack: 'サボり', freeze: '立ちすくむ', wait: '待機', down: '戦闘不能' };

  // ---------- 提案（英雄がマスターに何かを提案する） ----------
  // 待機所での提案。accept で信頼度が上がり、断ると少し下がる
  const PROPOSALS = {
    train:  { name: '特訓',             trust: 5, desc: '金貨を払って特訓し、経験値を得る' },
    join:   { name: '次の戦いへの参加', trust: 6, desc: '編成に入る（いっぱいなら一番弱い英雄と交代）' },
    tactic: { name: '作戦の変更',       trust: 4, desc: '作戦をこの英雄の考えに変える' },
    feast:  { name: '宴会',             trust: 3, desc: '金貨を払い、待機所の全員の信頼度が上がる' },
    potion: { name: '薬の補充',         trust: 3, desc: '金貨を払い、薬を1つ作る', need: 'alchemy' },
    forge:  { name: '装備の新調',       trust: 4, desc: '金貨を払い、この英雄に新しい装備を作る', need: 'armory' },
  };
  // 戦闘中の提案
  const BATTLE_PROPOSALS = {
    retreat: { name: '撤退',               desc: '残りの英雄を連れて撤退する' },
    defend:  { name: '作戦「守り重視」',   desc: '作戦を守り重視に変える' },
    focus:   { name: 'ボスへの集中攻撃',   desc: '全員でボスを狙う' },
  };

  // ---------- 英雄の故郷（この世界の地方。区域のボスを倒すと、その地方を取り戻せる） ----------
  const LANDS = [
    { id: 'elde',    name: '緑の王国エルデ',   desc: '草原と麦畑の王国。ゴブリンの大群に飲み込まれた。' },
    { id: 'necroa',  name: '骨の帝国ネクロア', desc: '死の竜が呼ばれ、死者が生者を襲う国になった。' },
    { id: 'frosbel', name: '氷の国フロスベル', desc: '雪がやまなくなり、永遠の冬に閉ざされた。' },
    { id: 'garm',    name: '獣の大陸ガルム',   desc: '魔獣と巨人が暴れ、森ごと焼かれた。' },
    { id: 'nox',     name: '影の都ノクス',     desc: '都の灯りが影に食われ、闇に沈んだ。' },
    { id: 'astra',   name: '星の海アストラ',   desc: '星を喰らう怪物に、空ごと食べられた。' },
  ];

  // ---------- 世界の難易度（始めたときにランダムで決まる） ----------
  const DIFFICULTIES = {
    calm:   { name: '穏やか', weight: 20, enemy: 0.9,  reward: 0.9 },
    normal: { name: 'ふつう', weight: 45, enemy: 1.0,  reward: 1.0 },
    harsh:  { name: '過酷',   weight: 25, enemy: 1.1,  reward: 1.25 },
    hell:   { name: '地獄',   weight: 10, enemy: 1.2,  reward: 1.5 },
  };

  // ---------- 待機所の施設 ----------
  const BUILDINGS = {
    gate:     { name: '次元の門', icon: '🌀', start: 1, desc: '英雄を呼ぶ門。塔への入口。★3 が出やすくなる' },
    dorm:     { name: '宿舎',     icon: '🛏️', start: 1, desc: '暮らせる英雄が増える' },
    plaza:    { name: '広場',     icon: '⛲', start: 0, desc: '英雄が集まる。提案が出やすくなる' },
    training: { name: '訓練所',   icon: '🎯', start: 0, desc: '編成に入っていない英雄も経験値をもらえる' },
    strategy: { name: '戦略室',   icon: '🗺️', start: 0, desc: '細かい作戦が使え、命令を出しやすくなる' },
    fusion:   { name: '合成所',   icon: '⚗️', start: 0, desc: '送り出す英雄の特性を受け継がせる。費用が下がる' },
    armory:   { name: '武器倉庫', icon: '⚔️', start: 0, desc: '装備を作る。良い装備を作れるようになる' },
    alchemy:  { name: '錬金場',   icon: '🧪', start: 0, desc: '薬を作る。持っていける数が増える' },
  };
  const BUILDING_ORDER = ['gate', 'dorm', 'plaza', 'training', 'strategy', 'fusion', 'armory', 'alchemy'];
  const BUILDING_MAX = 5;
  const BUILD_COST = { 1: 300, 2: 800, 3: 2000, 4: 4500, 5: 9000 };  // そのレベルにするのに必要な金貨
  const BUILD_REQ = { 1: 0, 2: 10, 3: 25, 4: 50, 5: 75 };            // そのレベルにするのに必要なクリア階数
  const DORM_CAP = [0, 8, 11, 14, 17, 20];
  const TRAINING_SHARE = [0, 0.2, 0.35, 0.5, 0.65, 0.8];
  const GATE_RATE3 = [0, 0.05, 0.06, 0.07, 0.08, 0.09];
  const PLAZA_CHANCE = [0.3, 0.45, 0.55, 0.65, 0.75, 0.85];       // 戦闘のあとに提案が出る確率
  const PLAZA_MAX = [2, 3, 3, 4, 4, 5];                           // ためておける提案の数
  const FUSION_COST = [0, 1, 0.85, 0.7, 0.55, 0.4];               // 合成の費用の倍率
  const POTION_CAP = [0, 4, 6, 8, 10, 12];                        // 薬を持っていける数（合計）
  const TACTIC_UNLOCK = { stance: 0, retreat: 1, target: 2, healLine: 3, skill: 4, perHero: 5 };
  const CMD_COST = [6, 5, 4, 4, 3, 2];
  const BASE_NAMES = ['灰色の灯台', '銀の鐘', '名もなき港', '月影の宿', '星屑の庭', '風見の塔', '琥珀の家', '白樺の館', '夜明けの砦', '黄昏の宿場', '迷い星の巣', '静かな方舟'];

  // ---------- 装備（武器倉庫で作る。倒れた英雄の装備は一緒に失われる） ----------
  const EQUIP_TIERS = [
    null,
    { name: '鉄',       atk: 0.08, def: 0.08, hp: 0.06, cost: 200 },
    { name: '鋼',       atk: 0.16, def: 0.16, hp: 0.12, cost: 600 },
    { name: '銀',       atk: 0.25, def: 0.25, hp: 0.18, cost: 1500 },
    { name: 'ミスリル', atk: 0.35, def: 0.35, hp: 0.25, cost: 3500 },
    { name: '星鉄',     atk: 0.5,  def: 0.5,  hp: 0.35, cost: 8000 },
  ];
  const EQUIP_KINDS = { weapon: { name: '武器', icon: '🗡️' }, armor: { name: '防具', icon: '🛡️' } };

  // ---------- 薬（錬金場で作る。戦闘中、英雄が自分で使う） ----------
  const POTIONS = {
    styptic: { name: '止血薬', icon: '🩹', cures: 'bleed', cost: 80,  lv: 1, desc: '出血を止める' },
    calm:    { name: '鎮静薬', icon: '🌿', cures: 'fear',  cost: 80,  lv: 2, desc: '恐怖をしずめる' },
    heal:    { name: '回復薬', icon: '🧪', cures: null,    cost: 150, lv: 3, desc: 'HP が 30% を切ったら 40% 回復' },
  };

  // ---------- 戦闘中の命令 ----------
  const ORDERS = {
    target: { name: '狙え', icon: '⚔️' },
    skill:  { name: 'スキル', icon: '✦' },
    guard:  { name: '守れ', icon: '🛡️' },
  };

  const data = {
    CLASSES, STARS, MAX_STAR, PERSONALITIES, TRUST_TIERS, TRAITS, MAX_TRAIT_LV, HEROES, STARTER_HEROES, ENEMIES, FLOORS,
    TACTICS, DEFAULT_TACTICS, GACHA, FAREWELL_SHARDS, PARTY_SIZE, START_GEMS, START_GOLD,
    ZONES, FLOORS_PER_ZONE, WORLD_NAME, LANDS, STATUS, ACTIONS, PROPOSALS, BATTLE_PROPOSALS,
    DIFFICULTIES, BUILDINGS, BUILDING_ORDER, BUILDING_MAX, BUILD_COST, BUILD_REQ, DORM_CAP, TRAINING_SHARE, GATE_RATE3,
    PLAZA_CHANCE, PLAZA_MAX, FUSION_COST, POTION_CAP, TACTIC_UNLOCK, CMD_COST, BASE_NAMES, EQUIP_TIERS, EQUIP_KINDS, POTIONS, ORDERS,
    zoneOfFloor: (fi) => ZONES[Math.floor(fi / FLOORS_PER_ZONE)],
    heroById: Object.fromEntries(HEROES.map(h => [h.id, h])),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.GameData = data;
})(typeof window !== 'undefined' ? window : globalThis);
