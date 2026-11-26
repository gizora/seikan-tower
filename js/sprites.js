/* 星喚の塔 — ドット絵（コードで描く。画像ファイルは使わない） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const OUTLINE = '#1a1226';
  const HW = 18, HH = 22;                     // 英雄の絵の大きさ（ドット）

  // ---------- 色の道具 ----------
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function shade(c, k) { const [r, g, b] = hex(c); return toHex(r * k, g * k, b * k); }

  function makeGrid(w, h) { return Array.from({ length: h }, () => Array(w).fill(null)); }

  /** rows（文字列の配列）を grid に塗る。'.' は塗らない。pal で文字 → 色 */
  function paint(grid, rows, top, pal, left) {
    left = left || 0;
    rows.forEach((row, dy) => {
      const y = top + dy;
      if (y < 0 || y >= grid.length) return;
      for (let dx = 0; dx < row.length; dx++) {
        const ch = row[dx];
        if (ch === '.' || ch === ' ') continue;
        const x = left + dx;
        if (x < 0 || x >= grid[0].length) continue;
        const col = pal[ch];
        if (col) grid[y][x] = col;
      }
    });
  }
  function dot(grid, x, y, col) { if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) grid[y][x] = col; }

  /** 塗った部分のまわりに縁取りをつける */
  function outline(grid) {
    const h = grid.length, w = grid[0].length;
    const out = grid.map(r => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (grid[y][x]) continue;
      if ((y > 0 && grid[y - 1][x]) || (y < h - 1 && grid[y + 1][x]) || (x > 0 && grid[y][x - 1]) || (x < w - 1 && grid[y][x + 1])) {
        out[y][x] = OUTLINE;
      }
    }
    return out;
  }

  function toCanvas(grid) {
    const c = document.createElement('canvas');
    c.width = grid[0].length;
    c.height = grid.length;
    const ctx = c.getContext('2d');
    grid.forEach((row, y) => row.forEach((col, x) => { if (col) { ctx.fillStyle = col; ctx.fillRect(x, y, 1, 1); } }));
    return c;
  }

  // ---------- 英雄（部品を組み合わせて描く） ----------
  const HEAD = [
    '.....SSSSSSSS.....',
    '....SSSSSSSSSS....',
    '....SSSSSSSSSS....',
    '....SSESSSSESS....',
    '....SSESSSSESS....',
    '....SrSSSSSSrS....',
    '.....SSSSSSSS.....',
    '.......SSSS.......',
  ]; // y6〜13

  const HAIR_SHORT = [
    '......HHHHHH......',
    '....HHHHHHHHHH....',
    '...HHHHHHHHHHHH...',
    '...HHHHHHHHHHHH...',
    '...HHHhHHHHhHHH...',
    '...HH.h....h.HH...',
    '...H..........H...',
    '...H..........H...',
  ]; // y3〜10
  const HAIR = {
    short: [[3, HAIR_SHORT]],
    messy: [[2, ['.......H..H.......']], [3, HAIR_SHORT]],
    spiky: [[1, ['.....H..H..H......', '.....HH.HH.HH.....']], [3, HAIR_SHORT]],
    long: [[3, HAIR_SHORT], [11, Array(4).fill('...HH........HH...').concat(['...H..........H...'])]],
    bob: [[3, HAIR_SHORT], [11, ['...HH........HH...', '...hh........hh...']]],
    ponytail: [[3, HAIR_SHORT], [5, ['...............HH.', '...............HH.', '...............HH.', '...............Hh.', '................h.', '................h.']]],
    twin: [[3, HAIR_SHORT], [8, ['.HH............HH.', '.HH............HH.', '.Hh............hH.', '.hh............hh.', '..h............h..']]],
    bald: [[8, ['...H..........H...', '...H..........H...']]],
  };

  const BODY = {
    tunic: [
      '.....oOOOOOOo.....',
      '....OOOOAAOOOO....',
      '...SOOOOAAOOOOS...',
      '....AAAAAAAAAA....',
      '....OOOOOOOOOO....',
    ],
    light: [
      '.....AAAAAAAA.....',
      '....OOOOOOOOOO....',
      '...SOOOOAAOOOOS...',
      '....AAAAAAAAAA....',
      '....OOOOOOOOOO....',
    ],
    robe: [
      '.....oOOOOOOo.....',
      '....OOOOAAOOOO....',
      '...SOOOOAAOOOOS...',
      '....OOOOAAOOOO....',
      '....OOOOAAOOOO....',
      '...OOOOOAAOOOOO...',
      '...oOOOOOOOOOOo...',
    ],
    armor: [
      '...MMoOOOOOOoMM...',
      '...MMMMMMMMMMMM...',
      '...SMMMMmmMMMMS...',
      '....AAAAAAAAAA....',
      '....mmmmmmmmmm....',
    ],
  }; // y14〜
  const LEGS = {
    stand: ['.....PPP..PPP.....', '.....PPP..PPP.....', '.....BBB..BBB.....'],
    walk: ['.....PPP..PPP.....', '....PPP....PPP....', '....BBB....BBB....'],
    robeStand: ['.....BB....BB.....'],
    robeWalk: ['....BB......BB....'],
  };

  const GEAR = {
    wizardHat: [[0, ['..........tt......', '.........tTT......', '........TTTT......', '.......TTTTTT.....', '......TTTTTTTT....', '..AAAAAAAAAAAAAA..']]],
    hood: [[3, ['......tttttt......', '....tTTTTTTTTt....', '...tTTTTTTTTTTt...', '...TTTTTTTTTTTT...', '...TT........TT...', '...TT........TT...', '...TT........TT...', '...TT........TT...', '...TT........TT...', '...TT........TT...', '....TT......TT....']]],
    mask: [[11, ['....TTTTTTTTTT....', '.....TTTTTTTT.....']]],
    helmet: [[3, ['......MMMMMM......', '....MMMMMMMMMM....', '...MMMMMMMMMMMM...', '...MmmmmmmmmmmM...', '...MM........MM...', '...MM........MM...', '...M..........M...']]],
    halo: [[0, ['......GGGGGG......', '.....G......G.....', '......GGGGGG......']]],
    crown: [[1, ['.....G.G..G.G.....', '.....GGGGGGGG.....']]],
    headband: [[6, ['...AAAAAAAAAAAA...']]],
    strawHat: [[2, ['......WWWWWW......', '.....WWWWWWWW.....', '...wwwwwwwwwwww...', '.WWWWWWWWWWWWWWWW.']]],
    elfEars: [[8, ['.S..............S.', '..SS..........SS..']]],
    mouseEars: [[0, ['..HHH......HHH....', '.HHrHH....HHrHH...', '.HHHH......HHHH...']]],
    beard: [[11, ['....ZSSSSSSSSZ....', '.....ZZZZZZZZ.....', '......ZZZZZZ......', '.......ZZZZ.......']]],
  };
  const BACK_GEAR = {
    wings: [[11, ['GG..............GG', 'GGG............GGG', '.GGG..........GGG.', '..GG..........GG..', '...G..........G...']]],
    cape: [[14, Array(6).fill('..X............X..').concat(['..XX..........XX..'])]],
  };

  const WEAPON = {
    sword: [[15, 7, 'M'], ...[8, 9, 10, 11, 12, 13, 14].flatMap(y => [[15, y, 'M'], [16, y, 'm']]), [14, 15, 'A'], [15, 15, 'A'], [16, 15, 'A'], [17, 15, 'A'], [15, 16, 'W'], [16, 16, 'W']],
    axe: [...[8, 9, 10, 11, 12, 13, 14, 15, 16, 17].map(y => [15, y, 'W']), [16, 8, 'M'], [17, 8, 'M'], [16, 9, 'M'], [17, 9, 'M'], [16, 10, 'M'], [17, 10, 'm'], [16, 11, 'm']],
    staff: [...[4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(y => [15, y, 'W']), [15, 2, 'G'], [14, 3, 'G'], [15, 3, 'G'], [16, 3, 'G'], [15, 4, 'G']],
    orb: [...[5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(y => [15, y, 'W']), [15, 2, 'G'], [16, 2, 'G'], [15, 3, 'G'], [16, 3, 'G'], [14, 3, 'G'], [15, 4, 'G']],
    wand: [[15, 13, 'W'], [15, 14, 'W'], [15, 15, 'W'], [15, 16, 'W'], [15, 11, 'G'], [14, 12, 'G'], [15, 12, 'G'], [16, 12, 'G']],
    bow: [[16, 9, 'W'], [17, 10, 'W'], [17, 11, 'W'], [17, 12, 'W'], [17, 13, 'W'], [17, 14, 'W'], [17, 15, 'W'], [17, 16, 'W'], [17, 17, 'W'], [16, 18, 'W'], ...[10, 11, 12, 13, 14, 15, 16, 17].map(y => [15, y, 'C'])],
    daggers: [[15, 13, 'M'], [15, 14, 'M'], [15, 15, 'M'], [2, 13, 'M'], [2, 14, 'M'], [2, 15, 'M']],
    fork: [...[6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21].map(y => [15, y, 'W']), [14, 3, 'M'], [16, 3, 'M'], [14, 4, 'M'], [15, 4, 'M'], [16, 4, 'M'], [15, 5, 'M']],
    shield: [[15, 7, 'M'], ...[8, 9, 10, 11, 12, 13, 14].flatMap(y => [[15, y, 'M'], [16, y, 'm']]), [14, 15, 'A'], [15, 15, 'A'], [16, 15, 'A'], [15, 16, 'W'],
      ...[14, 15, 16, 17, 18].flatMap(y => [0, 1, 2, 3].map(x => [x, y, (y === 14 || y === 18 || x === 0 || x === 3) ? 'M' : 'A']))],
  };

  function heroPalette(look) {
    const p = {
      S: look.skin, s: shade(look.skin, 0.85), E: '#2a1d3a', r: '#f2a0a0',
      H: look.hair, h: shade(look.hair, 0.75),
      O: look.outfit, o: shade(look.outfit, 0.78), A: look.accent,
      P: look.pants, B: look.boots,
      M: '#d0d6e2', m: '#8a92a6', W: '#8a5a32', w: '#5e3b1f', C: '#f4f0e8',
      G: look.gem || '#ffe27a', T: look.hat || look.outfit, t: shade(look.hat || look.outfit, 0.78),
      X: look.cape || '#b0303a', Z: look.beard || look.hair,
    };
    return p;
  }

  /** frame: 0 = 立ち、1 = 歩き */
  function heroGrid(look, cls, frame) {
    const g = makeGrid(HW, HH);
    const pal = heroPalette(look);
    const gear = look.gear || [];
    for (const k of gear) if (BACK_GEAR[k]) for (const [top, rows] of BACK_GEAR[k]) paint(g, rows, top, pal);
    const bodyKind = D.CLASSES[cls] ? D.CLASSES[cls].body : 'tunic';
    paint(g, BODY[bodyKind], 14, pal);
    if (bodyKind === 'robe') paint(g, frame ? LEGS.robeWalk : LEGS.robeStand, 21, pal);
    else paint(g, frame ? LEGS.walk : LEGS.stand, 19, pal);
    paint(g, HEAD, 6, pal);
    for (const [top, rows] of (HAIR[look.style] || HAIR.short)) paint(g, rows, top, pal);
    for (const k of gear) if (GEAR[k]) for (const [top, rows] of GEAR[k]) paint(g, rows, top, pal);
    for (const [x, y, ch] of (WEAPON[look.weapon] || [])) dot(g, x, y, pal[ch]);
    return outline(g);
  }

  // ---------- 敵（1体ずつ手で描いた絵） ----------
  const ENEMY_ART = {
    slime: { pal: { B: '#5ad08a', b: '#2f9a5a', W: '#d8ffe8', E: '#1a2a20' }, rows: [
      '................', '................', '................', '................', '................',
      '.......BB.......', '.....BBBBBB.....', '....BWWBBBBB....', '...BBWBBBBBBB...', '...BBBBBBBBBB...',
      '..BBBEBBBBEBBB..', '..BBBEBBBBEBBB..', '..BBBBBBBBBBBB..', '..bBBBBBBBBBBb..', '...bbbbbbbbbb...', '................'] },
    rat: { pal: { B: '#9a8a7a', b: '#6a5a4c', E: '#1a1010', P: '#f0a0a8', T: '#d08a90' }, rows: [
      '................', '................', '................', '................', '................', '................',
      '...BB...........', '..BBBB..........', '.BBEBBBBBBB.....', 'PBBBBBBBBBBBB...', '.BBBBBBBBBBBBB..',
      '..bBBBBBBBBBBB.T', '...bbBBBBBBBb.T.', '....P.P...P.PT..', '................', '................'] },
    goblin: { pal: { G: '#7ab84a', E: '#ffe040', W: '#f4f0e0', L: '#8a6a3a', A: '#5a3a1a', w: '#7a4a22' }, rows: [
      '................', '................', '................', '......GGGG......', '.....GGGGGG.....',
      'GG..GGGGGGGG..GG', '.GGGGEGGGGEGGGG.', '..GGGEGGGGEGGG..', '....GGGGGGGG..ww', '.....GWGGWG...ww',
      '....LLLLLLLL..w.', '...GLLLLLLLLGw..', '...GLLLLLLLLG...', '....AAAAAAAA....', '....GGG..GGG....', '................'] },
    bat: { pal: { B: '#5a3a7a', E: '#ff4a4a', W: '#f4f0e0' }, rows: [
      '................', '................', '................', '................', '................',
      '.B............B.', 'BBB....BB....BBB', 'BBBB..BBBB..BBBB', 'BBBBBBEBBEBBBBBB', '.BBBBBBBBBBBBBB.',
      '..B.BBBWWBBB.B..', '......BBBB......', '................', '................', '................', '................'] },
    wolf: { pal: { B: '#7a7a8a', b: '#4a4a5a', E: '#ffd040', W: '#f4f0e0' }, rows: [
      '................', '................', '................', '................',
      '...B.........b..', '..BBB.......bb..', '.BBBBB......b...', 'BBEBBBB.....B...', 'WBBBBBBBBBBBB...',
      '..WBBBBBBBBBBB..', '....bBBBBBBBBB..', '....BB.BB..BB.B.', '....BB.B...B..B.', '...bb.bb..bb.bb.', '................', '................'] },
    shaman: { pal: { R: '#6a3a9a', r: '#4a2a6a', G: '#7ab84a', E: '#ffe040', W: '#f4f0e0', w: '#7a4a22' }, rows: [
      '................', '......RRRR......', '.....RRRRRR.....', '....RRRRRRRR..GG', '...RRGGGGGGRR.GG',
      '...RGEGGGGEGR..w', '...RGGGGGGGGR..w', '....RGWGGWGR...w', '...RRRRRRRRRR..w', '..RRRRRRRRRRRRGw',
      '..RRRRRRRRRRRR.w', '..rRRRRRRRRRRr.w', '..rrRRRRRRRRrr.w', '....GG....GG....', '................', '................'] },
    skeleton: { pal: { W: '#e8e2cf', E: '#ff4a4a', M: '#c8d0dc' }, rows: [
      '................', '.....WWWWWW.....', '....WWWWWWWW....', '....WEEWWEEW....', '....WEEWWEEW....',
      '.....WWWWWW.....', '......W.W.W.....', '.......WW......M', '...WWWWWWWWWW.M.', '...W.WWWWWW.WM..',
      '..W..WWWWWW..W..', '.....W.WW.W.....', '......WWWW......', '.....WW..WW.....', '.....W....W.....', '....WW....WW....'] },
    orc: { pal: { O: '#6a9a5a', o: '#4a6a3a', E: '#ff4a4a', W: '#f4f0e0', L: '#7a5a3a', A: '#4a3020' }, rows: [
      '................', '....OOOOOOOO....', '...OOOOOOOOOO...', '..OOOEOOOOEOOO..', '..OOOOOOOOOOOO..',
      '..OOWOOOOOOWOO..', '...OOWOOOOWOO...', '..LLLLLLLLLLLL..', '.OLLLLLLLLLLLLO.', 'OO.LLLLAALLLL.OO',
      'OO.LLLLAALLLL.OO', '...AAAAAAAAAA...', '...OOOO..OOOO...', '...OOOO..OOOO...', '..oooo....oooo..', '................'] },
    ghost: { pal: { W: 'rgba(220,230,255,0.85)', E: '#2a2a5a' }, rows: [
      '................', '................', '......WWWW......', '....WWWWWWWW....', '...WWWWWWWWWW...',
      '...WWEEWWEEWW...', '...WWEEWWEEWW...', '..WWWWWWWWWWWW..', '..WWWWWEEWWWWW..', '..WWWWWWWWWWWW..',
      '.WWWWWWWWWWWWWW.', '.WWWWWWWWWWWWWW.', '.WW.WWW.WWW.WWW.', '.W...W...W...W..', '................', '................'] },
    golem: { pal: { S: '#9a9080', s: '#6a6258', G: '#60e0ff' }, rows: [
      '................', '....SSSSSSSS....', '...SSSSSSSSSS...', '...SSGSSSSGSS...', '...SSSSSSSSSS...',
      '.ssSSSSSSSSSSss.', 'SSSSSSSSSSSSSSSS', 'SSS.SSSGGSSS.SSS', 'SSS.SSSGGSSS.SSS', 'SS..SSSSSSSS..SS',
      'SS..sSSSSSSs..SS', '....SSSS.SSSS...', '....SSSS.SSSS...', '...sssss.sssss..', '................', '................'] },
    dragon: { pal: { B: '#e8e2cf', b: '#a89e88', W: '#7a5a9a', E: '#ff3a3a', T: '#ffffff' }, rows: [
      '........b.....b.', '.......bb....bb.', '......bWb...bWb.', '.BBB..bWWb.bWWb.', 'BBEBB.bWWWbWWWb.',
      'TBBBBB.bWWWWWb..', '.T.BBBBBBWWWb...', 'T.T.BBBBBBBBB...', '.....BBBBBBBBB..', '.....B.BBBBBBBB.',
      '.....B.B..BBBBBB', '....bb.bb..b.BBB', '..............BB', '................', '................', '................'] },
    eye: { pal: { P: '#5a2a8a', W: '#f4f0f8', E: '#d03a6a', Y: '#ffe040', T: '#ffffff' }, rows: [
      '................', '....P......P....', '.P..PP....PP..P.', '..PPPPPPPPPPPP..', '.PPPPPPPPPPPPPP.',
      'PPPPWWWWWWWWPPPP', 'PPPWWWWWWWWWWPPP', 'PPPWWWEEEEWWWPPP', 'PPPWWWEYYEWWWPPP', 'PPPWWWEEEEWWWPPP',
      'PPPPWWWWWWWWPPPP', '.PPPPPPPPPPPPPP.', '..PPPTTTTTTPPP..', '.P..PPPPPPPP..P.', 'P....P.PP.P....P', '................'] },
  };

  // 色違い
  const TINTS = {
    ice:   { B: '#a8e0ff', b: '#6aaad8', W: '#f0faff', G: '#a8e0ff' },
    stone: { B: '#8a8a92', E: '#ffb040' },
    dark:  { W: '#8a7aa8', E: '#ff4a8a', M: '#6a5a8a' },
    fire:  { R: '#c83a2a', r: '#8a2a1a', G: '#e08a3a' },
    king:  { G: '#5a9a3a', L: '#a02a2a', A: '#e0b040' },
    ogre:  { O: '#b05a3a', o: '#7a3a22', L: '#4a3a5a', A: '#2a2030' },
  };

  function enemyGrid(key) {
    const tpl = D.ENEMIES[key];
    if (tpl.sprite === 'human') return heroGrid(tpl.look, tpl.look.weapon === 'sword' ? 'warrior' : 'mage', 0);
    const art = ENEMY_ART[tpl.sprite];
    const pal = Object.assign({}, art.pal, tpl.tint ? TINTS[tpl.tint] : {});
    const g = makeGrid(16, 16);
    paint(g, art.rows, 0, pal);
    if (tpl.tint === 'king') paint(g, ['.....Y.YY.Y.....', '.....YYYYYY.....'], 1, { Y: '#ffd040' });
    return outline(g);
  }

  // ---------- 外に見せる道具 ----------
  const cache = {};
  const Sprites = {
    heroCanvas(id, frame) {
      const k = 'h:' + id + ':' + (frame || 0);
      if (!cache[k]) { const h = D.heroById[id]; cache[k] = toCanvas(heroGrid(h.look, h.cls, frame || 0)); }
      return cache[k];
    },
    enemyCanvas(key) {
      const k = 'e:' + key;
      if (!cache[k]) cache[k] = toCanvas(enemyGrid(key));
      return cache[k];
    },
    /** 拡大した画像の URL（<img> に使う） */
    url(canvas, scale) {
      const k = 'u:' + scale + ':' + (canvas.__id || (canvas.__id = Math.random().toString(36).slice(2)));
      if (cache[k]) return cache[k];
      const c = document.createElement('canvas');
      c.width = canvas.width * scale;
      c.height = canvas.height * scale;
      const ctx = c.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(canvas, 0, 0, c.width, c.height);
      cache[k] = c.toDataURL('image/png');
      return cache[k];
    },
    heroUrl(id, scale) { return this.url(this.heroCanvas(id, 0), scale || 4); },
    enemyUrl(key, scale) { return this.url(this.enemyCanvas(key), scale || 4); },
    /** <img> の HTML。alt は空（名前は別に書くため） */
    heroImg(id, cls) { return `<img class="px ${cls || ''}" src="${this.heroUrl(id)}" alt="" width="${HW * 2}" height="${HH * 2}">`; },
    enemyImg(key, cls) {
      const human = D.ENEMIES[key].sprite === 'human';
      return `<img class="px ${cls || ''}" src="${this.enemyUrl(key)}" alt="" width="${(human ? HW : 16) * 2}" height="${(human ? HH : 16) * 2}">`;
    },
    HW, HH,
  };

  root.Sprites = Sprites;
})(window);
