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
   * world は故郷（滅んだ世界）、memories は★2〜★5 に昇級したときに思い出す記憶。
   */
  const HEROES = [
    // ★3
    { id: 'seres',    name: 'セレス',   title: '光の剣士',   cls: 'swordsman', rarity: 3, pers: 'brave', world: 'astra',
      skill: { name: '聖光斬', type: 'single', mult: 2.8, cd: 3, desc: '敵1体に大ダメージ' }, line: '光よ、切り裂け！',
      look: { skin: '#f4d6bf', hair: '#f0d070', style: 'long', eye: '#3a6ad8', top: 'coat', c1: '#e8eaf4', c2: '#d4a640', pants: '#2e3a6e', boots: '#5a3a2a', weapon: 'sword', gear: ['cape'], cape: '#2f4fa8', build: 'slim', h: 0 },
      memories: ['夜空を見上げると、懐かしくて、少し怖い。',
        '星の海アストラでは、星ひとつひとつに国があった。私はその守り手の一人だった。',
        '星喰らいが現れて、星がひとつ、またひとつと消えた。空が暗くなるたびに、国が消えていった。',
        '最後の星で、私は剣を折られた。……それでも、光はまだここにある。今度は、折れない。'] },
    { id: 'verna',    name: 'ヴェルナ', title: '炎の魔女',   cls: 'mage',      rarity: 3, pers: 'whimsical', world: 'nox',
      skill: { name: '業火', type: 'aoe', mult: 1.4, cd: 3, desc: '敵全体にダメージ' }, line: 'まとめて燃えなさい！',
      look: { skin: '#f6dac6', hair: '#d8402a', style: 'long', eye: '#f0a030', top: 'robe', c1: '#3e1f56', c2: '#e8902a', pants: '#2a1838', boots: '#2a1838', weapon: 'staff', gem: '#ff6a3a', gear: ['wizardHat'], hat: '#2c1440', build: 'slim', h: 0 },
      memories: ['火を見ていると落ち着く。燃やしたいわけじゃない……たぶん。',
        '影の都ノクスの魔導院で、一番の問題児だった。先生たちはいつも頭を抱えていた。',
        '都の灯りがひとつずつ影に食われていった。わたしの炎だけが、最後まで消えなかった。',
        '影の騎士は、わたしに炎を教えてくれた師匠だった。……弟子として、けじめをつける。'] },
    { id: 'gard',     name: 'ガルド',   title: '鉄の守護者', cls: 'warrior',   rarity: 3, pers: 'caring', world: 'necroa',
      skill: { name: '不動の誓い', type: 'taunt', partyDef: true, cd: 4, desc: '敵の攻撃を引きつけ、味方全員の防御を上げる' }, line: '俺の後ろに下がれ！',
      look: { skin: '#d29a76', hair: '#5e3a22', style: 'short', eye: '#3a2a1a', top: 'armor', c1: '#8a2a2a', c2: '#d4a640', pants: '#3a3030', boots: '#8a92a6', weapon: 'shield', gear: ['beard'], beard: '#5e3a22', build: 'broad', h: -1 },
      memories: ['盾を構えると、心が静まる。誰かを背中にかばう形が、体にしみついている。',
        '帝国の近衛だった。皇帝ではなく、城下の子どもたちを守るのが好きだった。',
        '骨の竜が空を覆った夜、死んだ者たちが起き上がり、生きている者を襲いはじめた。',
        '倒れた部下たちが、骨になって俺に剣を向けた。……もう誰も、あんな姿にはさせない。'] },
    { id: 'riina',    name: 'リィナ',   title: '森の射手',   cls: 'archer',    rarity: 3, pers: 'careful', world: 'garm',
      skill: { name: '千本矢', type: 'multi', hits: 5, mult: 0.75, spread: true, cd: 3, desc: 'ランダムな敵に5回攻撃' }, line: '逃がさないよ！',
      look: { skin: '#f4dcc6', hair: '#e6e0a8', style: 'ponytail', eye: '#3a9a5a', top: 'leather', c1: '#3e7a44', c2: '#8a5a32', pants: '#2e4a30', boots: '#5a3a24', weapon: 'bow', gear: ['elfEars', 'headband'], build: 'slim', h: 0 },
      memories: ['風の向きで、獲物の居場所がわかる。森の中にいるみたいに。',
        '獣の大陸ガルムの大森林で、エルフの見張りをしていた。木の上が家だった。',
        '巨人たちが森を焼いた。魔獣たちは狂ったように暴れ、森の歌が聞こえなくなった。',
        '最後に聞いたのは、焼け落ちる世界樹のきしむ音。あの音を、二度と誰にも聞かせない。'] },
    { id: 'mireille', name: 'ミレイユ', title: '白の聖女',   cls: 'priest',    rarity: 3, pers: 'caring', world: 'frosbel',
      skill: { name: '大いなる癒し', type: 'heal_all', mult: 1.7, cd: 3, desc: '味方全体を大きく回復' }, line: 'みんな、まだ戦えます！',
      look: { skin: '#fae4d4', hair: '#e2e6f2', style: 'long', eye: '#8a7ad8', top: 'dress', c1: '#f4f2ec', c2: '#d8b04a', pants: '#e8e2d4', boots: '#c8b890', weapon: 'staff', gem: '#ffe27a', gear: ['halo'], build: 'slim', h: 1 },
      memories: ['祈りの言葉を、ひとつ残らず覚えている。でも、誰に祈っていたのかは思い出せない。',
        '凍える人々のために、大聖堂の扉をいつも開けていた。',
        '氷の魔女は、わたしの妹だった。人々を救えない自分を責めて、冬に心を明け渡してしまった。',
        'あの子を止められるのは、わたしの祈りだけ。……今度こそ、手を離さない。'] },
    // ★2
    { id: 'baruk',    name: 'バルク',   title: '傭兵',       cls: 'warrior',   rarity: 2, pers: 'brave', world: 'necroa',
      skill: { name: '挑発', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'こっちだ、かかってこい！',
      look: { skin: '#d8a07c', hair: '#c03a24', style: 'spiky', eye: '#5a3a1a', top: 'vest', c1: '#5e3e26', c2: '#2e2018', pants: '#3e3226', boots: '#2e2018', weapon: 'axe', gear: ['scar'], build: 'broad', h: -1 },
      memories: ['金のために戦っていた。……それだけだったはずだ。',
        '傭兵団の連中は、うるさくて、汚くて、最高の仲間だった。',
        '帝国が崩れたとき、雇い主は真っ先に逃げた。俺たちは金にならない撤退戦を引き受けた。',
        '団長は言った。「報酬は、誰かが明日を迎えることだ」。俺はまだ、その報酬を受け取りに行く途中だ。'] },
    { id: 'kai',      name: 'カイ',     title: '双剣使い',   cls: 'thief',     rarity: 2, pers: 'whimsical', world: 'necroa',
      skill: { name: '連撃', type: 'multi', hits: 3, mult: 0.85, cd: 3, desc: '敵1体に3回攻撃' }, line: '遅い遅い！',
      look: { skin: '#e8c4a6', hair: '#1e1e28', style: 'swept', eye: '#e03a3a', top: 'coat', c1: '#34364a', c2: '#a83a44', pants: '#24242e', boots: '#1a1a22', weapon: 'daggers', gear: ['hood', 'mask'], hat: '#44465c', mask: '#7a2a34', build: 'slim', h: 0 },
      memories: ['暗い路地の歩き方を知っている。音を立てない足の運びも。',
        '帝国の裏の部隊で、誰かの命令で誰かを消していた。名前の代わりに、番号で呼ばれていた。',
        '最後の命令は「竜を呼んだ司祭を殺せ」。間に合わなかった。',
        '司祭は笑っていた。「帝国は永遠になる。死者として」。……あの笑い声を、止めに行く。'] },
    { id: 'nono',     name: 'ノノ',     title: '見習い魔導士', cls: 'mage',    rarity: 2, pers: 'careful', world: 'frosbel',
      skill: { name: '雷撃', type: 'aoe', mult: 1.1, cd: 3, desc: '敵全体にダメージ' }, line: 'え、えいっ！',
      look: { skin: '#fae0cc', hair: '#5a86d8', style: 'bob', eye: '#2a4aa8', top: 'robe', c1: '#34529c', c2: '#ecd060', pants: '#26386a', boots: '#26386a', weapon: 'staff', gem: '#9ad8ff', gear: ['wizardHat'], hat: '#2a4488', build: 'slim', h: 4 },
      memories: ['寒いのは苦手。なのに、雪の結晶の形を見ると胸がぎゅっとなる。',
        '魔法学院の一番の下っ端だった。先生の杖を磨くのが、わたしの仕事。',
        '雪がやまなくなって百日目、先生は「春を呼ぶ魔法」を完成させるために塔へ登った。',
        '先生の魔法は、氷の魔女に奪われた。……あの魔法の続きを書けるのは、わたしだけ。'] },
    { id: 'jin',      name: 'ジン',     title: '狩人',       cls: 'archer',    rarity: 2, pers: 'loyal', world: 'garm',
      skill: { name: '狙い撃ち', type: 'single', mult: 2.3, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'そこだ。',
      look: { skin: '#e2c2a4', hair: '#c4c8d4', style: 'swept', eye: '#6a8a5a', top: 'leather', c1: '#2e4430', c2: '#6a4a2e', pants: '#34342a', boots: '#3e2a1c', weapon: 'bow', gear: ['elfEars', 'cape'], cape: '#243a28', build: 'normal', h: -1 },
      memories: ['獲物は必要なぶんだけ狩る。それが掟だった気がする。',
        '群れからはぐれた狼の子を育てていた。名前はハイロ。',
        '大陸じゅうの獣が狂ったとき、ハイロも牙をむいた。俺は弓を下ろせなかった。',
        '獣を狂わせたのは、闘技場で育てられた双頭の怪物だった。……ハイロの仇は、あいつだ。'] },
    { id: 'ema',      name: 'エマ',     title: '森の妖精',   cls: 'priest',    rarity: 2, pers: 'loyal', world: 'garm',
      skill: { name: '癒しの風', type: 'heal_all', mult: 1.2, cd: 3, desc: '味方全体を回復' }, line: '風よ、みんなを癒して！',
      look: { skin: '#fce6d6', hair: '#f088b8', style: 'twin', eye: '#3aa87a', top: 'dress', c1: '#78c888', c2: '#f6f0a0', pants: '#5aa86a', boots: '#5aa86a', weapon: 'wand', gem: '#b8fff0', gear: ['wings'], build: 'slim', h: 4 },
      memories: ['花が咲く音が聞こえる。人には聞こえないなんて、知らなかった。',
        '世界樹の葉っぱの上で生まれた。仲間の妖精は、百人くらいいた。',
        '森が燃えた日、羽の小さい子たちから順に、煙にのまれていった。',
        '最後のひとりになったわたしを、誰かの手が門の中へ押し込んだ。……あれは、誰の手だったの？'] },
    { id: 'roran',    name: 'ロラン',   title: '王子騎士',   cls: 'swordsman', rarity: 2, pers: 'caring', world: 'frosbel',
      skill: { name: '鼓舞の剣', type: 'single', mult: 1.8, partyAtk: true, cd: 4, desc: '敵1体を攻撃し、味方全員の攻撃を上げる' }, line: '皆、続け！',
      look: { skin: '#f4d4ba', hair: '#e6be50', style: 'short', eye: '#3a5ab0', top: 'coat', c1: '#2a52a8', c2: '#e6be50', pants: '#ece6d8', boots: '#4a2e20', weapon: 'sword', gear: ['circlet', 'cape'], cape: '#a82a34', build: 'normal', h: -1 },
      memories: ['人の前に立つと、自然と背筋が伸びる。誰に教わったのだろう。',
        '氷の国フロスベルの第二王子だった。兄上のほうが、ずっと王にふさわしかった。',
        '兄上は民を逃がすために、凍った城に一人で残った。私は逃げる側だった。',
        '王冠は兄上のものだ。私はただ、兄上が守ろうとした人々の前に立ち続ける。'] },
    // ★1
    { id: 'tom',      name: 'トム',     title: '村の若者',   cls: 'swordsman', rarity: 1, pers: 'brave', world: 'elde',
      skill: { name: '力いっぱい斬り', type: 'single', mult: 2.0, cd: 3, desc: '敵1体に大きめのダメージ' }, line: 'うおおお！',
      look: { skin: '#eec09a', hair: '#7e5230', style: 'messy', eye: '#5a3a1a', top: 'tunic', c1: '#c4a274', c2: '#6a4a2c', pants: '#54463a', boots: '#46301e', weapon: 'sword', gear: [], build: 'normal', h: 0 },
      memories: ['麦畑の匂いを覚えている。毎朝、誰かと剣のまねごとをしていた。',
        '幼なじみがいた。「騎士になったら、この村を守ってね」と笑っていた。',
        '空が緑色ににごった日、ゴブリンの群れが丘を越えてきた。俺は棒きれ一本で立っていた。',
        '守れなかった。だから今度こそ、あの丘の向こうまで剣を届かせる。'] },
    { id: 'dolf',     name: 'ドルフ',   title: '農夫',       cls: 'warrior',   rarity: 1, pers: 'loyal', world: 'elde',
      skill: { name: '踏ん張り', type: 'taunt', cd: 4, desc: '敵の攻撃を引きつけて守りを固める' }, line: 'ここは通さねえ！',
      look: { skin: '#d49c74', hair: '#76563a', style: 'short', eye: '#3a2a1a', top: 'overalls', c1: '#46669c', c2: '#e0d2b0', pants: '#46669c', boots: '#523622', weapon: 'fork', gear: ['strawHat', 'beard'], beard: '#76563a', build: 'broad', h: 0 },
      memories: ['土を耕す手の感触だけは、忘れていない。',
        '女房と娘がいた。収穫祭の夜、三人で焼いた芋がうまかった。',
        '王国の騎士たちは先に逃げた。残ったのは、鍬を持った俺たち農夫だけだった。',
        '最後まで畑の前に立っていた。……あの子たちが逃げる時間は、稼げたんだろうか。'] },
    { id: 'yuna',     name: 'ユナ',     title: '薬師',       cls: 'priest',    rarity: 1, pers: 'careful', world: 'elde',
      skill: { name: '薬草の雨', type: 'heal_all', mult: 1.0, cd: 4, desc: '味方全体を少し回復' }, line: 'お薬の時間です！',
      look: { skin: '#f4d0b4', hair: '#663822', style: 'ponytail', eye: '#5a3a22', top: 'dress', c1: '#5e8e50', c2: '#f0e8d4', pants: '#46663a', boots: '#46301e', weapon: 'staff', gem: '#9be07a', gear: ['satchel'], build: 'slim', h: 2 },
      memories: ['薬草の名前は、なぜか全部すらすら出てくる。',
        '師匠のおばあさんに「薬は人を待ってくれない」と、よく叱られていた。',
        '病に倒れた人であふれた教会で、薬が尽きるまで走り回った。',
        '最後の一瓶を、知らない兵士に渡した。あの人は、生き延びられたのかな。'] },
    { id: 'pico',     name: 'ピコ',     title: '弓の練習生', cls: 'archer',    rarity: 1, pers: 'whimsical', world: 'elde',
      skill: { name: '二連射', type: 'multi', hits: 2, mult: 1.0, cd: 3, desc: '敵1体に2回攻撃' }, line: '当たれー！',
      look: { skin: '#f6d6be', hair: '#ee8838', style: 'twin', eye: '#6a4a22', top: 'tunic', c1: '#d4ac6c', c2: '#8a5a30', pants: '#76582e', boots: '#583a22', weapon: 'bow', gear: [], build: 'slim', h: 3 },
      memories: ['的の真ん中に当てると、誰かが頭をなでてくれた気がする。',
        '兄さんは王国一の弓使いだった。わたしはいつも、追いかけてばかり。',
        '兄さんは城壁の上から矢を射ち続けて、そのまま帰ってこなかった。',
        '兄さんの弓、ずっと重くて引けなかった。今なら、引けるよ。'] },
    { id: 'nez',      name: 'ネズ',     title: 'すばしっこい盗賊', cls: 'thief', rarity: 1, pers: 'careful', world: 'garm',
      skill: { name: '急所突き', type: 'single', mult: 1.8, sure: true, cd: 3, desc: '敵1体に必ず会心の一撃' }, line: 'チュッ、もらった！',
      look: { skin: '#f0d2be', hair: '#9898a6', style: 'messy', eye: '#2a2a2a', top: 'leather', c1: '#76563a', c2: '#c49c5e', pants: '#563e2e', boots: '#3a2a1e', weapon: 'daggers', gear: ['mouseEars', 'scarf'], scarf: '#b03a3a', build: 'slim', h: 3 },
      memories: ['鍵穴を見ると、指がむずむずする。',
        'ネズミの耳の一族は、大陸の地下に町を作って暮らしていた。',
        '地上が魔獣だらけになって、地下の町へ逃げてくる人たちを、こっそり助けていた。',
        '町の入口を最後に閉めたのは、おいらだ。外に残った仲間の声が、まだ耳に残ってる。'] },
    { id: 'maro',     name: 'マロ',     title: '占い師',     cls: 'mage',      rarity: 1, pers: 'loyal', world: 'nox',
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
      ['この待機所は、もう私たちの家です。', 'あなたが守ってくれるから、私もみんなを守れます。'],
    ],
  };

  // 待機所でのひとりごと（性格ごと）
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

  // ---------- 滅んだ世界（塔の5階ごとのまとまり。ボスを倒すとその世界を救える） ----------
  const WORLDS = [
    { id: 'elde',    name: '緑の王国エルデ',   desc: '草原と麦畑の王国。ゴブリンの大群に飲み込まれて滅んだ。' },
    { id: 'necroa',  name: '骨の帝国ネクロア', desc: '死の竜が呼ばれ、死者が生者を襲う国になって滅んだ。' },
    { id: 'frosbel', name: '氷の国フロスベル', desc: '雪がやまなくなり、永遠の冬に閉ざされて滅んだ。' },
    { id: 'garm',    name: '獣の大陸ガルム',   desc: '魔獣と巨人が暴れ、森ごと焼かれて滅んだ。' },
    { id: 'nox',     name: '影の都ノクス',     desc: '都の灯りが影に食われ、闇に沈んで滅んだ。' },
    { id: 'astra',   name: '星の海アストラ',   desc: '星を喰らう怪物に、空ごと食べられて滅んだ。' },
  ];
  const FLOORS_PER_WORLD = 5;

  // ---------- 世界の難易度（始めたときにランダムで決まる） ----------
  const DIFFICULTIES = {
    calm:   { name: '穏やかな世界', weight: 20, enemy: 0.9,  reward: 0.9,  desc: '敵が少し弱い。そのぶん報酬も少し少ない。' },
    normal: { name: 'ふつうの世界', weight: 45, enemy: 1.0,  reward: 1.0,  desc: '標準の強さ。' },
    harsh:  { name: '過酷な世界',   weight: 25, enemy: 1.1,  reward: 1.25, desc: '敵が強い。そのぶん報酬が多い。' },
    hell:   { name: '地獄の世界',   weight: 10, enemy: 1.2,  reward: 1.5,  desc: '敵がとても強い。報酬はとても多い。' },
  };

  // ---------- 待機所の施設（建てると待機所の階が増える） ----------
  const BUILDINGS = {
    gate:     { name: '次元の門', icon: '🌀', max: 5, start: 1, desc: '異世界から英雄を呼ぶ門。塔への入口でもある。レベルが上がると★3の英雄が出やすくなる。' },
    dorm:     { name: '宿舎',     icon: '🛏️', max: 5, start: 1, desc: '英雄たちが暮らす部屋。レベルが上がると、暮らせる英雄が増える。' },
    training: { name: '訓練所',   icon: '🎯', max: 5, start: 0, desc: '待機中の英雄が鍛える場所。編成に入っていない英雄も、戦闘のたびに経験値をもらえる。' },
    strategy: { name: '戦略室',   icon: '🗺️', max: 5, start: 0, desc: '作戦を練る部屋。レベルが上がると細かい作戦を立てられ、戦闘中の命令も出しやすくなる。' },
  };
  const BUILDING_ORDER = ['gate', 'dorm', 'training', 'strategy'];   // 下の階から
  const BUILD_COST = { 1: 300, 2: 800, 3: 2000, 4: 4500, 5: 9000 };  // そのレベルにするのに必要な金貨
  const BUILD_REQ = { 1: 0, 2: 3, 3: 8, 4: 15, 5: 20 };              // そのレベルにするのに必要なクリア階数
  const DORM_CAP = [0, 8, 11, 14, 17, 20];                          // 宿舎のレベルごとの、暮らせる人数
  const TRAINING_SHARE = [0, 0.2, 0.35, 0.5, 0.65, 0.8];            // 訓練所: 待機中の英雄がもらえる経験値の割合
  const GATE_RATE3 = [0, 0.05, 0.06, 0.07, 0.08, 0.09];             // 次元の門: ★3 の出る確率
  // 戦略室のレベルで使えるようになる作戦（stance はいつでも使える）。perHero は英雄ごとの「狙う敵」
  const TACTIC_UNLOCK = { stance: 0, retreat: 1, target: 2, healLine: 3, skill: 4, perHero: 5 };
  // 命令ゲージ: 命令してから次の命令を出せるまでに必要な行動の数（戦略室のレベルごと）
  const CMD_COST = [6, 5, 4, 4, 3, 2];

  const BASE_NAMES = ['灰色の灯台', '銀の鐘', '名もなき港', '月影の宿', '星屑の庭', '風見の塔', '琥珀の家', '白樺の館', '夜明けの砦', '黄昏の宿場', '迷い星の巣', '静かな方舟'];

  // ---------- 戦闘中の命令 ----------
  const ORDERS = {
    target: { name: 'この敵を狙え', icon: '⚔️', desc: '選んだ敵を優先して攻撃する（倒すまで、または4回の行動まで）' },
    skill:  { name: 'スキルを使え', icon: '✦',  desc: '次の行動ですぐにスキルを使う（温存の作戦でも使う）' },
    guard:  { name: '守りを固めろ', icon: '🛡️', desc: 'すぐに守りの構えをとり、次の行動でも守る' },
  };
  // 命令への返事（性格ごと）: [従う, 従わない]
  const ORDER_LINES = {
    loyal:     [['はい、マスター！', '了解です！'], ['……今は、できません']],
    brave:     [['任せろ！', 'おう！'], ['指図すんな！', '俺のやり方でやる']],
    careful:   [['わかりました', '慎重にいきます'], ['それは危険です…', '従えません']],
    whimsical: [['しょうがないなあ', 'はいはい'], ['やだ', '気が乗らない']],
    caring:    [['みんなのために！', '任せてください'], ['今はそれどころじゃ…', 'ごめんなさい、できません']],
  };

  const data = {
    CLASSES, STARS, MAX_STAR, PERSONALITIES, TRUST_TIERS, TRAITS, MAX_TRAIT_LV, HEROES, STARTER_HEROES, ENEMIES, FLOORS,
    TACTICS, DEFAULT_TACTICS, GACHA, FAREWELL_SHARDS, PARTY_SIZE, START_GEMS, START_GOLD,
    TALK, ROOM_LINES, CHATS, GRIEF_LINES,
    WORLDS, FLOORS_PER_WORLD, DIFFICULTIES, BUILDINGS, BUILDING_ORDER, BUILD_COST, BUILD_REQ, DORM_CAP, TRAINING_SHARE, GATE_RATE3,
    TACTIC_UNLOCK, CMD_COST, BASE_NAMES, ORDERS, ORDER_LINES,
    worldOfFloor: (fi) => WORLDS[Math.floor(fi / FLOORS_PER_WORLD)],
    heroById: Object.fromEntries(HEROES.map(h => [h.id, h])),
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = data;
  else root.GameData = data;
})(typeof window !== 'undefined' ? window : globalThis);
