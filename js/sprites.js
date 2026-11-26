/* 星喚の塔 — ドット絵（コードで描く。画像ファイルは使わない） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const OUTLINE = '#1a1226';
  const HW = 24, HH = 48;                     // 英雄の絵の大きさ（ドット）。人の頭身（約6.5頭身）で描く

  // ---------- 色の道具 ----------
  function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function toHex(r, g, b) { return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join(''); }
  function shade(c, k) { if (!c || c[0] !== '#') return c; const [r, g, b] = hex(c); return toHex(r * k, g * k, b * k); }

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

  /** 右側（光の当たらない側）のふちを少し暗くして立体感を出す */
  function sideShade(grid, keep) {
    const h = grid.length, w = grid[0].length;
    const out = grid.map(r => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = grid[y][x];
      if (!c || keep.has(c)) continue;
      if (x === w - 1 || !grid[y][x + 1]) out[y][x] = shade(c, 0.76);
      else if (y > 0 && !grid[y - 1][x]) out[y][x] = shade(c, 1.12);
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

  // ---------- 英雄（人の頭身。部品を順に描き重ねる） ----------
  const BUILD = {
    slim:   { sl: 8, sr: 15, tl: 9, tr: 14, al: 7, ar: 16 },
    normal: { sl: 7, sr: 16, tl: 8, tr: 15, al: 6, ar: 17 },
    broad:  { sl: 6, sr: 17, tl: 7, tr: 16, al: 5, ar: 18 },
  };
  const WOOD = '#7a4e2a', WOOD_D = '#4e3018', METAL = '#d4dae6', METAL_D = '#8a92a6', GOLD = '#f0c850', CLOTH_W = '#f4f0e8';

  /**
   * look から 24×48 の絵を作る。frame: 0 = 立ち、1 = 歩き
   * 体の位置（標準の背丈 o=0）: 顔 y7〜12 / 首 y13 / 肩 y14 / 腰 y23 / 脚 y28〜 / 靴 y41〜46
   */
  function heroGrid(look, frame) {
    const g = makeGrid(HW, HH);
    const o = look.h || 0;                       // 大きいほど背が低い（上半身を下にずらし、脚を短くする）
    const B = BUILD[look.build] || BUILD.normal;
    const gear = look.gear || [];
    const has = (k) => gear.includes(k);
    const S = look.skin, Sd = shade(look.skin, 0.84);
    const H = look.hair, Hd = shade(look.hair, 0.74);
    const C1 = look.c1, C1d = shade(look.c1, 0.74), C2 = look.c2;
    const P = look.pants, BT = look.boots;
    const M = look.metal || METAL, Md = look.metal ? shade(look.metal, 0.7) : METAL_D;
    const T = look.hat || look.c1, Td = shade(look.hat || look.c1, 0.72);
    const GEM = look.gem || '#ffe27a';
    const EYE = look.eye || '#2a1d3a';

    const R = (x, y, w, h, c) => { if (!c) return; for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) if (j >= 0 && j < HH && i >= 0 && i < HW) g[j][i] = c; };
    const D1 = (x, y, c) => R(x, y, 1, 1, c);
    const ROWX = (y, x0, x1, c) => R(x0, y, x1 - x0 + 1, 1, c);

    const y0 = 7 + o;                            // 顔のいちばん上
    const sh = 14 + o;                           // 肩
    const waist = 23 + o;
    const hipEnd = 27 + o;
    const legTop = 28 + o;
    const bootTop = 41;
    const feet = 46;
    const hy = 26 + o;                           // 手の高さ
    const knee = Math.round((legTop + bootTop) / 2);
    const walk = frame === 1;
    const top = look.top || 'tunic';
    const longSkirt = top === 'robe';
    const skirt = top === 'robe' || top === 'dress';

    // ===== 1. 背中のもの（マント・羽・後ろ髪・矢筒） =====
    if (has('cape')) {
      const X = look.cape || '#a82a34';
      for (let y = sh; y <= 43; y++) {
        const k = Math.floor((y - sh) / 9);
        ROWX(y, B.sl - 1 - k, B.sr + 1 + k, y >= 41 ? shade(X, 0.8) : X);
      }
    }
    if (has('wings')) {
      const Wc = '#d8fbff', Wd = '#8fd0e0';
      const wing = ['..WW', '.WWW', 'WWWd', 'WWWd', 'WWdd', '.Wdd', '..Wd', '.WWd', 'WWWd', '.WWd', '..W.'];
      paint(g, wing.map(r => r), sh - 3, { W: Wc, d: Wd }, B.al - 5);
      paint(g, wing.map(r => r.split('').reverse().join('')), sh - 3, { W: Wc, d: Wd }, B.ar + 2);
    }
    if (look.style === 'long') R(8, y0, 8, 12, Hd);
    if (look.style === 'bob') R(8, y0 + 3, 8, 4, Hd);
    if (look.style === 'ponytail') { R(15, y0 - 1, 2, 3, H); R(16, y0 + 2, 2, 9, H); R(17, y0 + 6, 1, 6, Hd); }
    if (look.weapon === 'bow') {                 // 矢筒
      R(B.sr - 1, sh - 3, 2, 12, '#7a4a28');
      D1(B.sr - 1, sh - 4, CLOTH_W); D1(B.sr, sh - 5, '#c83a3a'); D1(B.sr, sh - 4, CLOTH_W);
    }

    // ===== 2. 脚と靴 =====
    const lx0 = B.tl, lx1 = 11, rx0 = 12, rx1 = B.tr;
    for (let y = legTop; y < bootTop; y++) {
      const off = walk && y >= knee ? 1 : 0;
      ROWX(y, lx0 - off, lx1 - off, P);
      ROWX(y, rx0 + off, rx1 + off, P);
      D1(lx1 - off, y, shade(P, 0.8));
    }
    for (let y = bootTop; y <= feet; y++) {
      const off = walk ? 1 : 0;
      ROWX(y, lx0 - off - (y === feet ? 1 : 0), lx1 - off, BT);
      ROWX(y, rx0 + off, rx1 + off + (y === feet ? 1 : 0), BT);
    }
    R(lx0 - (walk ? 1 : 0), bootTop, lx1 - lx0 + 1, 1, shade(BT, 1.25));   // 靴の折り返し
    R(rx0 + (walk ? 1 : 0), bootTop, rx1 - rx0 + 1, 1, shade(BT, 1.25));

    // ===== 3. 胴と服 =====
    const torso = (c, from, to) => {
      for (let y = from; y <= to; y++) {
        if (y === sh) ROWX(y, B.sl + 1, B.sr - 1, c);
        else if (y <= sh + 3) ROWX(y, B.sl, B.sr, c);
        else ROWX(y, B.tl, B.tr, c);
      }
    };
    const skirtRows = (c, from, to, trim) => {
      for (let y = from; y <= to; y++) {
        const k = Math.floor((y - from) / 4);
        ROWX(y, B.tl - k, B.tr + k, c);
      }
      if (trim) ROWX(to, B.tl - Math.floor((to - from) / 4), B.tr + Math.floor((to - from) / 4), trim);
    };
    let sleeve = C1, forearm = C1, cuff = C2;
    if (top === 'tunic') {
      torso(C1, sh, hipEnd);
      ROWX(waist, B.tl, B.tr, C2); D1(12, waist, GOLD);
      D1(11, sh, S); D1(12, sh, S); D1(11, sh + 1, Sd);
    } else if (top === 'coat') {
      torso(C1, sh, hipEnd);
      const tailEnd = Math.min(39, hipEnd + 11);
      for (let y = hipEnd + 1; y <= tailEnd; y++) {
        const k = Math.floor((y - hipEnd) / 5);
        ROWX(y, B.tl - k, 10, C1); ROWX(y, 13, B.tr + k, C1);
        D1(10, y, C2); D1(13, y, C2);
      }
      for (let y = sh + 1; y <= hipEnd; y++) { D1(11, y, C1d); }
      ROWX(waist, B.tl, B.tr, shade(C1, 0.55)); D1(12, waist, C2);
      D1(10, sh - 1, C1); D1(13, sh - 1, C1);   // 高いえり
      for (let y = sh + 1; y < waist; y += 3) D1(12, y, C2);
    } else if (top === 'armor') {
      torso(M, sh, waist);
      for (let y = sh + 1; y < waist; y++) D1(B.tr, y, Md);
      ROWX(sh + 4, B.tl + 1, B.tr - 1, Md);
      R(10, sh + 3, 4, hipEnd + 6 - (sh + 3), C1);          // 胸当ての上の布（タバード）
      for (let y = sh + 3; y <= hipEnd + 5; y++) { D1(10, y, C2); D1(13, y, C2); }
      ROWX(waist, B.tl, B.tr, '#4a3424'); D1(12, waist, GOLD);
      R(B.tl, waist + 1, B.tr - B.tl + 1, hipEnd - waist, Md);
      R(10, waist + 1, 4, hipEnd + 6 - waist - 1, C1);
      R(B.sl - 1, sh - 1, 4, 3, M); R(B.sr - 2, sh - 1, 4, 3, M);   // 肩当て
      ROWX(sh + 1, B.sl - 1, B.sl + 2, Md); ROWX(sh + 1, B.sr - 2, B.sr + 1, Md);
      sleeve = M; forearm = Md; cuff = M;
    } else if (top === 'robe') {
      torso(C1, sh, waist);
      ROWX(waist, B.tl, B.tr, C2);
      skirtRows(C1, waist + 1, 45, C2);
      for (let y = sh + 1; y <= 45; y++) if (y !== waist) { D1(11, y, C2); }
      D1(11, sh, S); D1(12, sh, S);
    } else if (top === 'dress') {
      torso(C1, sh, waist);
      ROWX(waist, B.tl, B.tr, C2); D1(11, waist + 1, C2); D1(12, waist + 1, C2);
      skirtRows(C1, waist + 1, Math.min(41, waist + 18), C2);
      D1(11, sh, S); D1(12, sh, S);
      sleeve = C1; forearm = S; cuff = C2;
    } else if (top === 'leather') {
      torso(C1, sh, hipEnd);
      for (let i = 0; i <= waist - sh; i++) D1(B.sl + 1 + Math.round(i * (B.tr - B.sl - 1) / (waist - sh)), sh + i, C2);
      ROWX(waist, B.tl, B.tr, C2); D1(12, waist, GOLD);
      R(B.tl, waist + 1, B.tr - B.tl + 1, hipEnd - waist, P);
      sleeve = C1; forearm = S; cuff = C2;
    } else if (top === 'vest') {
      torso(S, sh, waist);
      for (let y = sh; y <= waist; y++) { ROWX(y, y <= sh + 3 ? B.sl : B.tl, (y <= sh + 3 ? B.sl : B.tl) + 2, C1); ROWX(y, (y <= sh + 3 ? B.sr : B.tr) - 2, y <= sh + 3 ? B.sr : B.tr, C1); }
      D1(11, sh + 5, Sd); D1(12, sh + 5, Sd); D1(11, sh + 8, Sd); D1(12, sh + 8, Sd);
      ROWX(waist + 1, B.tl, B.tr, C2);
      R(B.tl, waist + 2, B.tr - B.tl + 1, hipEnd - waist - 1, P);
      sleeve = S; forearm = S; cuff = C2;
    } else if (top === 'overalls') {
      torso(C2, sh, sh + 3);
      torso(C1, sh + 4, hipEnd);
      for (let y = sh; y <= sh + 3; y++) { D1(B.tl + 1, y, C1); D1(B.tr - 1, y, C1); }
      D1(B.tl + 1, sh + 4, GOLD); D1(B.tr - 1, sh + 4, GOLD);
      sleeve = C2; forearm = S; cuff = C2;
    }

    // ===== 4. 腕と手 =====
    const armTop = sh + 1, armEnd = hy - 1;
    for (let y = armTop; y <= armEnd; y++) {
      const fore = y > armTop + 5;
      const c = fore ? forearm : sleeve;
      const flare = longSkirt && y >= armEnd - 2 ? 1 : 0;
      ROWX(y, B.al - flare, B.al + 1, c);
      ROWX(y, B.ar - 1, B.ar + flare, c);
      if (y === armEnd && cuff !== c) { ROWX(y, B.al - flare, B.al + 1, cuff); ROWX(y, B.ar - 1, B.ar + flare, cuff); }
    }
    const hand = top === 'armor' ? Md : S;
    R(B.al, hy, 2, 2, hand);
    R(B.ar - 1, hy, 2, 2, hand);

    // ===== 5. 首と顔 =====
    D1(11, y0 + 6, Sd); D1(12, y0 + 6, Sd);                   // 首
    R(9, y0, 6, 5, S);
    ROWX(y0 + 5, 10, 13, S);
    D1(8, y0 + 3, S); D1(15, y0 + 3, Sd);                     // 耳
    D1(10, y0 + 3, EYE); D1(13, y0 + 3, EYE);                 // 目
    D1(10, y0 + 2, Hd); D1(13, y0 + 2, Hd);                   // まゆ
    D1(14, y0 + 4, Sd); D1(13, y0 + 5, Sd);
    if (look.style === 'bald') { R(9, y0 - 2, 6, 2, S); D1(10, y0 - 2, shade(S, 1.15)); D1(11, y0 - 2, shade(S, 1.15)); }

    // ===== 6. 前髪 =====
    const cap = () => {
      ROWX(y0 - 3, 10, 13, H);
      ROWX(y0 - 2, 9, 14, H);
      ROWX(y0 - 1, 8, 15, H);
      ROWX(y0, 8, 15, H);
      ROWX(y0 + 1, 8, 15, H); D1(11, y0 + 1, null); g[y0 + 1][11] = S; g[y0 + 1][13] = S;
      D1(8, y0 + 2, H); D1(15, y0 + 2, H); D1(8, y0 + 3, Hd); D1(15, y0 + 3, Hd);
      D1(10, y0 - 1, Hd); D1(13, y0, Hd);
    };
    switch (look.style) {
      case 'bald':
        D1(8, y0 + 1, H); D1(8, y0 + 2, H); D1(15, y0 + 1, H); D1(15, y0 + 2, H);
        break;
      case 'messy':
        cap(); D1(10, y0 - 4, H); D1(13, y0 - 4, H); D1(7, y0, H); D1(16, y0 + 1, H); D1(7, y0 + 1, Hd);
        break;
      case 'spiky':
        cap(); D1(9, y0 - 4, H); D1(12, y0 - 5, H); D1(12, y0 - 4, H); D1(15, y0 - 4, H); D1(14, y0 - 3, H); D1(9, y0 - 3, H); D1(16, y0 - 1, H); D1(7, y0 - 1, H);
        break;
      case 'swept':
        cap(); g[y0 + 1][11] = H; g[y0 + 1][13] = H; ROWX(y0 + 2, 12, 15, H); ROWX(y0 + 3, 13, 15, Hd); D1(16, y0 + 1, H);
        break;
      case 'long':
        cap(); R(8, y0 + 2, 1, 10, H); R(15, y0 + 2, 1, 10, H); D1(8, y0 + 11, Hd); D1(15, y0 + 11, Hd); D1(7, y0 + 4, H); D1(16, y0 + 4, H);
        break;
      case 'bob':
        cap(); R(8, y0 + 2, 1, 4, H); R(15, y0 + 2, 1, 4, H); R(7, y0 + 1, 1, 4, H); R(16, y0 + 1, 1, 4, Hd);
        break;
      case 'ponytail':
        cap();
        break;
      case 'twin':
        cap(); R(6, y0, 2, 9, H); R(16, y0, 2, 9, H); D1(6, y0 + 9, Hd); D1(17, y0 + 9, Hd); D1(7, y0, C2); D1(16, y0, C2);
        break;
      default:
        cap();
    }

    // ===== 7. 頭の飾り =====
    if (has('beard')) { const Z = look.beard || H; D1(9, y0 + 4, Z); D1(14, y0 + 4, Z); D1(11, y0 + 4, Z); D1(12, y0 + 4, Z); ROWX(y0 + 5, 10, 13, Z); ROWX(y0 + 6, 11, 12, shade(Z, 0.8)); }
    if (has('longBeard')) { const Z = look.beard || '#eeeef4'; ROWX(y0 + 4, 9, 14, Z); R(10, y0 + 5, 4, 5, Z); R(11, y0 + 10, 2, 3, shade(Z, 0.85)); D1(12, y0 + 6, shade(Z, 0.85)); }
    if (has('scar')) { D1(14, y0 + 3, '#a8584a'); D1(13, y0 + 4, '#a8584a'); }
    if (has('mask')) { const K = look.mask || T; ROWX(y0 + 4, 9, 14, K); ROWX(y0 + 5, 10, 13, shade(K, 0.8)); }
    if (has('hood')) {
      ROWX(y0 - 4, 10, 13, T);
      ROWX(y0 - 3, 9, 14, T);
      for (let y = y0 - 2; y <= y0 + 5; y++) { ROWX(y, 7, 8, T); ROWX(y, 15, 16, Td); }
      ROWX(y0 - 2, 9, 14, T); ROWX(y0 - 1, 9, 14, T); ROWX(y0, 9, 14, Td);
      ROWX(y0 + 1, 9, 14, H); D1(14, y0 + 2, H);   // フードの中の前髪
      ROWX(y0 + 6, 8, 10, T); ROWX(y0 + 6, 13, 15, Td);
      ROWX(sh - 1, B.sl, B.sr, T); ROWX(sh, B.sl - 1, B.sr + 1, Td);          // 肩にかかる布
    }
    if (has('helmet')) {
      ROWX(y0 - 3, 10, 13, M); ROWX(y0 - 2, 9, 14, M);
      for (let y = y0 - 1; y <= y0 + 1; y++) ROWX(y, 8, 15, M);
      for (let y = y0 + 2; y <= y0 + 5; y++) { ROWX(y, 8, 9, Md); ROWX(y, 14, 15, Md); }
      ROWX(y0 + 2, 9, 14, Md); R(11, y0 + 2, 2, 3, M);
      ROWX(y0 + 3, 10, 13, '#120c18'); D1(10, y0 + 3, EYE); D1(13, y0 + 3, EYE);
      R(11, y0 - 6, 2, 3, C2); D1(13, y0 - 6, C2);
    }
    if (has('wizardHat')) {
      ROWX(y0 - 1, 5, 18, T); ROWX(y0, 6, 17, Td);
      ROWX(y0 - 2, 8, 15, shade(T, 1.25));
      ROWX(y0 - 3, 9, 14, T); ROWX(y0 - 4, 10, 14, T); ROWX(y0 - 5, 10, 13, T); ROWX(y0 - 6, 11, 13, T); ROWX(y0 - 7, 12, 14, Td);
      D1(11, y0 - 2, GEM);
    }
    if (has('strawHat')) {
      const W1 = '#dcbc64', W2 = '#b0903e';
      ROWX(y0 - 1, 4, 19, W1); ROWX(y0, 5, 18, W2);
      ROWX(y0 - 2, 8, 15, '#a83a2a'); ROWX(y0 - 3, 9, 14, W1); ROWX(y0 - 4, 9, 14, W1); ROWX(y0 - 5, 10, 13, W2);
    }
    if (has('halo')) { ROWX(y0 - 7, 9, 14, GOLD); D1(8, y0 - 6, GOLD); D1(15, y0 - 6, GOLD); ROWX(y0 - 5, 9, 14, shade(GOLD, 0.8)); }
    if (has('crown')) { const Cc = look.crown || GOLD; D1(9, y0 - 5, Cc); D1(11, y0 - 5, Cc); D1(12, y0 - 5, Cc); D1(14, y0 - 5, Cc); ROWX(y0 - 4, 9, 14, Cc); ROWX(y0 - 3, 9, 14, shade(Cc, 0.8)); D1(11, y0 - 4, GEM); D1(12, y0 - 4, GEM); }
    if (has('circlet')) { ROWX(y0, 8, 15, GOLD); D1(11, y0, GEM); D1(12, y0, GEM); }
    if (has('headband')) { ROWX(y0, 8, 15, C2); D1(16, y0, C2); D1(17, y0 + 1, C2); D1(17, y0 + 2, shade(C2, 0.8)); }
    if (has('elfEars')) { D1(8, y0 + 3, S); D1(7, y0 + 2, S); D1(6, y0 + 1, S); D1(15, y0 + 3, S); D1(16, y0 + 2, S); D1(17, y0 + 1, Sd); }
    if (has('mouseEars')) {
      const pink = '#f0a8b0';
      R(6, y0 - 5, 4, 3, H); R(7, y0 - 6, 2, 1, H); D1(7, y0 - 4, pink); D1(8, y0 - 4, pink);
      R(14, y0 - 5, 4, 3, H); R(15, y0 - 6, 2, 1, H); D1(15, y0 - 4, pink); D1(16, y0 - 4, pink);
    }

    // ===== 8. 体の前の飾り =====
    if (has('scarf')) { const Q = look.scarf || '#b03a3a'; ROWX(y0 + 6, 9, 14, Q); ROWX(sh, 9, 14, shade(Q, 0.85)); R(13, sh + 1, 2, 5, Q); D1(14, sh + 6, shade(Q, 0.8)); }
    if (has('satchel')) {
      for (let i = 0; i <= waist - sh; i++) D1(B.sr - 1 - Math.round(i * (B.sr - B.tl - 1) / (waist - sh)), sh + i, '#5a3a1e');
      R(B.tl - 2, waist, 4, 4, '#9a6a3a'); ROWX(waist, B.tl - 2, B.tl + 1, '#6a4422'); D1(B.tl, waist + 1, GOLD);
    }
    if (has('cape')) { D1(B.sl + 1, sh, GOLD); D1(B.sr - 1, sh, GOLD); }

    // ===== 9. 武器 =====
    const gx = B.ar + 1;                         // 右手に持つ武器の柄の位置
    switch (look.weapon) {
      case 'sword':
        D1(gx, hy - 2, GOLD); R(gx, hy - 1, 1, 3, WOOD_D);
        ROWX(hy + 2, gx - 1, gx + 2, GOLD);
        R(gx, hy + 3, 1, 13, METAL); R(gx + 1, hy + 3, 1, 12, METAL_D);
        break;
      case 'greatsword':
        R(gx, hy - 2, 1, 4, WOOD_D); D1(gx, hy + 2, GOLD);
        ROWX(hy - 3, gx - 2, gx + 2, C2 || GOLD);
        R(gx - 1, hy - 21, 3, 18, M); R(gx, hy - 21, 1, 18, shade(M, 1.3)); R(gx + 1, hy - 21, 1, 18, Md); D1(gx, hy - 22, M);
        break;
      case 'axe':
        R(gx, hy - 12, 1, 19, WOOD);
        R(gx + 1, hy - 12, 3, 6, METAL); R(gx + 4, hy - 11, 1, 4, METAL_D); D1(gx - 1, hy - 10, METAL_D); D1(gx - 1, hy - 9, METAL_D);
        break;
      case 'staff':
        R(gx, y0 - 4, 1, feet - (y0 - 4) + 1, WOOD); R(gx, y0 + 8, 1, 2, WOOD_D);
        D1(gx - 1, y0 - 6, WOOD); D1(gx + 1, y0 - 6, WOOD); D1(gx - 1, y0 - 5, WOOD_D); D1(gx + 1, y0 - 5, WOOD_D);
        R(gx, y0 - 7, 1, 2, GEM); D1(gx, y0 - 8, shade(GEM, 1.2));
        break;
      case 'orb':
        R(gx, y0 - 2, 1, feet - (y0 - 2) + 1, WOOD);
        R(gx - 1, y0 - 5, 3, 3, GEM); D1(gx - 1, y0 - 5, shade(GEM, 1.3)); D1(gx + 1, y0 - 3, shade(GEM, 0.7));
        break;
      case 'wand':
        R(gx, hy - 5, 1, 7, WOOD);
        ROWX(hy - 7, gx - 1, gx + 1, GEM); D1(gx, hy - 8, GEM); D1(gx, hy - 6, GEM);
        break;
      case 'fork':
        R(gx, y0 - 3, 1, feet - (y0 - 3) + 1, WOOD);
        ROWX(y0 - 4, gx - 1, gx + 1, METAL_D);
        R(gx - 1, y0 - 7, 1, 3, METAL); R(gx, y0 - 7, 1, 3, METAL); R(gx + 1, y0 - 7, 1, 3, METAL);
        break;
      case 'daggers':
        D1(gx, hy + 1, WOOD_D); R(gx, hy + 2, 1, 4, METAL); D1(gx, hy + 1, GOLD);
        D1(B.al - 1, hy + 1, GOLD); R(B.al - 1, hy + 2, 1, 4, METAL);
        break;
      case 'bow': {
        const bx = B.al - 3;
        R(bx, hy - 6, 1, 13, WOOD);
        R(bx + 1, hy - 10, 1, 4, WOOD); R(bx + 1, hy + 7, 1, 4, WOOD);
        D1(bx + 2, hy - 11, WOOD_D); D1(bx + 2, hy + 11, WOOD_D);
        R(bx + 3, hy - 10, 1, 21, CLOTH_W);
        R(B.al, hy, 2, 2, S);
        break;
      }
      case 'shield': {
        D1(gx, hy - 2, GOLD); R(gx, hy - 1, 1, 3, WOOD_D);
        ROWX(hy + 2, gx - 1, gx + 2, GOLD);
        R(gx, hy + 3, 1, 12, METAL); R(gx + 1, hy + 3, 1, 11, METAL_D);
        const s0 = B.al - 3, sy = sh + 3;
        const kite = ['MMMMMM', 'MCCCCM', 'MCGGCM', 'MCGGCM', 'MCCCCM', 'MCCCCM', 'MCCCCM', 'MCCCCM', '.MCCM.', '.MCCM.', '..MM..'];
        paint(g, kite, sy, { M: M, C: C1, G: C2 }, s0);
        break;
      }
      default: break;
    }

    const keep = new Set([EYE, GEM, GOLD]);
    return outline(sideShade(g, keep));
  }

  /** 顔のまわり（16×16）を切り出す。y0 は顔のいちばん上 */
  function faceGrid(look) {
    const full = heroGrid(look, 0);
    const y0 = 7 + (look.h || 0);
    const top = Math.max(0, y0 - 6);
    const out = makeGrid(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const sy = top + y, sx = 4 + x;
      if (sy < HH) out[y][x] = full[sy][sx];
    }
    return out;
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
    if (tpl.sprite === 'human') return heroGrid(tpl.look, 0);
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
    /** 英雄の全身（24×48）。frame: 0 立ち / 1 歩き */
    heroCanvas(id, frame) {
      const k = 'h:' + id + ':' + (frame || 0);
      if (!cache[k]) cache[k] = toCanvas(heroGrid(D.heroById[id].look, frame || 0));
      return cache[k];
    },
    /** 英雄の顔まわり（16×16） */
    faceCanvas(id) {
      const k = 'f:' + id;
      if (!cache[k]) cache[k] = toCanvas(faceGrid(D.heroById[id].look));
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
    faceUrl(id, scale) { return this.url(this.faceCanvas(id), scale || 4); },
    enemyUrl(key, scale) { return this.url(this.enemyCanvas(key), scale || 4); },
    /** 全身の <img>。alt は空（名前は別に書くため） */
    heroImg(id, cls) { return `<img class="px body ${cls || ''}" src="${this.heroUrl(id)}" alt="" width="${HW * 2}" height="${HH * 2}">`; },
    /** 顔の <img> */
    faceImg(id, cls) { return `<img class="px facei ${cls || ''}" src="${this.faceUrl(id)}" alt="" width="32" height="32">`; },
    enemyImg(key, cls) {
      const human = D.ENEMIES[key].sprite === 'human';
      return `<img class="px ${human ? 'body' : 'mon'} ${cls || ''}" src="${this.enemyUrl(key)}" alt="" width="${(human ? HW : 16) * 2}" height="${(human ? HH : 16) * 2}">`;
    },
    HW, HH,
  };

  root.Sprites = Sprites;
})(window);
