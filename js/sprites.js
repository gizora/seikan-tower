/* 星喚の塔 — ドット絵（コードで描く。画像ファイルは使わない） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const OUTLINE = '#1a1226';
  const HW = 32, HH = 64;                     // 英雄の絵の大きさ（ドット）。斜め前から見た、人の頭身の姿

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


  // ---------- 英雄（32×64 ドット・斜め前から見た姿。骨組みに肉付けして、ポーズを変えられる） ----------
  const LIGHT = [-0.6, -0.8];                  // 光は左上から
  const WOOD = '#7a4e2a', METAL = '#d4dae6', GOLD = '#f0c850', CLOTH_W = '#f4f0e8';

  /** 描くための画用紙。色と、陰影のための「明るさ」を持つ */
  function Canvas2(w, h) {
    this.w = w; this.h = h;
    this.col = new Array(w * h).fill(null);
    this.lit = new Float32Array(w * h);
  }
  Canvas2.prototype.set = function (x, y, c, l) {
    x = Math.round(x); y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h || !c) return;
    this.col[y * this.w + x] = c; this.lit[y * this.w + x] = l || 0;
  };
  /** 太さのある線（腕・脚・武器）。光の向きで3段階の陰をつける */
  Canvas2.prototype.capsule = function (x1, y1, x2, y2, r, c) {
    const minx = Math.floor(Math.min(x1, x2) - r - 1), maxx = Math.ceil(Math.max(x1, x2) + r + 1);
    const miny = Math.floor(Math.min(y1, y2) - r - 1), maxy = Math.ceil(Math.max(y1, y2) + r + 1);
    const dx = x2 - x1, dy = y2 - y1, len2 = dx * dx + dy * dy || 1;
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / len2));
      const px = x - (x1 + dx * t), py = y - (y1 + dy * t);
      const d = Math.hypot(px, py);
      if (d <= r + 0.15) this.set(x, y, c, (px * LIGHT[0] + py * LIGHT[1]) / Math.max(0.8, r));
    }
  };
  Canvas2.prototype.ellipse = function (cx, cy, rx, ry, c, flat) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
      const nx = (x - cx) / Math.max(0.5, rx), ny = (y - cy) / Math.max(0.5, ry);
      if (nx * nx + ny * ny <= 1.05) this.set(x, y, c, flat ? 0 : (nx * LIGHT[0] + ny * LIGHT[1]));
    }
  };
  /** 多角形（胴・すそ・マント・帽子） */
  Canvas2.prototype.poly = function (pts, c, shadeX) {
    const ys = pts.map(p => p[1]);
    const miny = Math.floor(Math.min(...ys)), maxy = Math.ceil(Math.max(...ys));
    const xs = pts.map(p => p[0]);
    const minx = Math.min(...xs), maxx = Math.max(...xs);
    for (let y = miny; y <= maxy; y++) {
      const cross = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y + 0.5 && by > y + 0.5) || (by <= y + 0.5 && ay > y + 0.5)) cross.push(ax + (y + 0.5 - ay) / (by - ay) * (bx - ax));
      }
      cross.sort((a, b) => a - b);
      for (let i = 0; i + 1 < cross.length; i += 2) {
        for (let x = Math.ceil(cross[i] - 0.5); x <= Math.floor(cross[i + 1] - 0.5); x++) {
          const l = shadeX === false ? 0 : ((x - (minx + maxx) / 2) / Math.max(1, (maxx - minx) / 2)) * -0.7;
          this.set(x, y, c, l);
        }
      }
    }
  };
  /** 3段階の陰をつけ、まわりに色つきの縁取りをする */
  Canvas2.prototype.finish = function (keep) {
    const { w, h } = this;
    const out = makeGrid(w, h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = this.col[y * w + x];
      if (!c) continue;
      if (keep.has(c)) { out[y][x] = c; continue; }
      const l = this.lit[y * w + x];
      out[y][x] = l > 0.42 ? shade(c, 1.18) : l < -0.38 ? shade(c, 0.72) : c;
    }
    const res = out.map(r => r.slice());
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (out[y][x]) continue;
      let n = null;
      for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const yy = y + dy, xx = x + dx; if (yy >= 0 && yy < h && xx >= 0 && xx < w && out[yy][xx]) { n = out[yy][xx]; break; } }
      if (n) res[y][x] = shade(n, 0.28);
    }
    return res;
  };

  const BUILDS = { slim: 3.4, normal: 4.0, broad: 4.9 };

  // ポーズ: 角度は度（0 = 右、90 = 下）。front は手前（右）、back は奥（左）
  const POSES = {
    idle0: { fa: [78, 12], ba: [100, 10], fl: [96, 0], bl: [86, 0], lean: 0, bob: 0 },
    idle1: { fa: [80, 14], ba: [98, 12], fl: [96, 0], bl: [86, 0], lean: 0, bob: 1 },
    walk0: { fa: [62, 18], ba: [118, 8], fl: [112, -14], bl: [68, 16], lean: 1, bob: 0 },
    walk1: { fa: [80, 12], ba: [100, 10], fl: [94, 4], bl: [88, 6], lean: 1, bob: 1 },
    walk2: { fa: [112, 8], ba: [66, 18], fl: [68, 16], bl: [112, -14], lean: 1, bob: 0 },
    walk3: { fa: [80, 12], ba: [100, 10], fl: [88, 6], bl: [94, 4], lean: 1, bob: 1 },
    atk0:  { fa: [-70, 40], ba: [120, 20], fl: [100, 0], bl: [78, 6], lean: -1, bob: 0 },
    atk1:  { fa: [20, 6], ba: [130, 10], fl: [70, 14], bl: [108, -6], lean: 2, bob: 0 },
    cast:  { fa: [-30, 30], ba: [-40, 34], fl: [96, 0], bl: [84, 0], lean: 0, bob: 0 },
    hurt:  { fa: [140, -20], ba: [60, 20], fl: [104, -6], bl: [80, 6], lean: -2, bob: 1 },
  };
  const rad = (d) => d * Math.PI / 180;

  /** look とポーズから 32×64 の絵を作る */
  function heroGrid(look, pose) {
    const P = POSES[pose] || POSES.idle0;
    const cv = new Canvas2(HW, HH);
    const gear = look.gear || [];
    const has = (k) => gear.includes(k);
    const S = look.skin, H = look.hair, C1 = look.c1, C2 = look.c2;
    const PANTS = look.pants, BOOT = look.boots, EYE = look.eye || '#2a1d3a';
    const M = look.metal || METAL, GEM = look.gem || '#ffe27a', HAT = look.hat || C1;
    const top = look.top || 'tunic';
    const robe = top === 'robe', dress = top === 'dress';
    const sw = BUILDS[look.build] || BUILDS.normal;
    const hgt = 54 - (look.h || 0) * 2.2;                 // 背の高さ
    const feet = 62;
    const headTop = feet - hgt + P.bob;
    const cx = 15 + P.lean * 0.5;
    const headR = 4.1;
    const hc = { x: cx + 1 + P.lean * 0.6, y: headTop + 4.6 };
    const neckY = headTop + 9.4;
    const shY = headTop + 11.2;
    const waistY = headTop + 23;
    const hipY = headTop + 27.5;
    const legLen = feet - hipY;
    const upperArm = hgt * 0.17, foreArm = hgt * 0.15;
    const sF = { x: cx + sw * 0.95 + P.lean, y: shY + 0.6 }, sB = { x: cx - sw * 0.75 + P.lean, y: shY - 0.4 };
    const hF = { x: cx + 1.8, y: hipY }, hB = { x: cx - 1.6, y: hipY };
    const limb = (s, a1, bend, l1, l2) => {
      const e = { x: s.x + Math.cos(rad(a1)) * l1, y: s.y + Math.sin(rad(a1)) * l1 };
      const a2 = a1 + bend;
      const h = { x: e.x + Math.cos(rad(a2)) * l2, y: e.y + Math.sin(rad(a2)) * l2 };
      return { s, e, h, a2 };
    };
    const armF = limb(sF, P.fa[0], P.fa[1], upperArm, foreArm);
    const armB = limb(sB, P.ba[0], P.ba[1], upperArm * 0.95, foreArm * 0.95);
    const legF = limb(hF, P.fl[0], P.fl[1], legLen * 0.5, legLen * 0.52);
    const legB = limb(hB, P.bl[0], P.bl[1], legLen * 0.5, legLen * 0.52);
    // 足は地面より下に行かない
    for (const L of [legF, legB]) { const over = L.h.y - feet; if (over > 0) { L.h.y = feet; L.e.y -= over / 2; } }

    const sleeveC = top === 'armor' ? M : top === 'vest' ? S : C1;
    const foreC = top === 'armor' ? shade(M, 0.85) : (top === 'leather' || top === 'vest' || top === 'dress' || top === 'tunic') ? S : C1;
    const armR = Math.max(1.3, sw * 0.36), legR = Math.max(1.5, sw * 0.42);

    // ===== 1. いちばん奥: マント・羽・後ろ髪・矢筒 =====
    if (has('cape')) {
      const X = look.cape || '#7a2a34';
      const sway = pose.startsWith('walk') ? (pose === 'walk0' ? -2 : pose === 'walk2' ? 1 : -0.5) : 0;
      cv.poly([[sB.x - 1.5, shY - 1], [sF.x + 0.5, shY - 1], [cx + 3 + sway, feet - 3], [cx - 7 + sway * 1.5, feet - 1], [cx - 5, waistY]], X);
    }
    if (has('wings')) {
      const Wc = '#d8fbff';
      cv.poly([[cx - 2, shY + 2], [cx - 14, shY - 8], [cx - 15, shY + 4], [cx - 8, shY + 12]], Wc, false);
      cv.poly([[cx + 1, shY + 2], [cx + 9, shY - 10], [cx + 11, shY + 2], [cx + 5, shY + 10]], shade(Wc, 0.9), false);
    }
    const longHair = look.style === 'long' || look.style === 'ponytail' || look.style === 'twin';
    if (look.style === 'long' && !has('helmet')) cv.poly([[hc.x - 4.5, hc.y - 1], [hc.x + 2, hc.y - 1], [hc.x + 1, hc.y + 13], [hc.x - 6, hc.y + 14]], shade(H, 0.85));
    if (look.style === 'ponytail' && !has('helmet')) { cv.capsule(hc.x - 3.5, hc.y - 1.5, hc.x - 6.5, hc.y + 4, 1.6, H); cv.capsule(hc.x - 6.5, hc.y + 4, hc.x - 6, hc.y + 11, 1.3, shade(H, 0.9)); }
    if (look.weapon === 'bow') { cv.capsule(sB.x + 0.5, shY - 3, sB.x - 2.5, shY + 9, 1.4, '#6a4026'); cv.capsule(sB.x + 1, shY - 5, sB.x + 0.5, shY - 3, 0.8, CLOTH_W); }

    // ===== 2. 奥の腕と脚 =====
    const drawLeg = (L, back) => {
      const pc = back ? shade(PANTS, 0.85) : PANTS;
      cv.capsule(L.s.x, L.s.y, L.e.x, L.e.y, legR, pc);
      const bootStart = { x: L.e.x + (L.h.x - L.e.x) * 0.35, y: L.e.y + (L.h.y - L.e.y) * 0.35 };
      cv.capsule(L.e.x, L.e.y, bootStart.x, bootStart.y, legR * 0.92, pc);
      cv.capsule(bootStart.x, bootStart.y, L.h.x, L.h.y - 0.5, legR * 0.95, back ? shade(BOOT, 0.85) : BOOT);
      cv.capsule(L.h.x - 0.5, L.h.y, L.h.x + 2.2, L.h.y, 1.1, back ? shade(BOOT, 0.85) : BOOT);   // つま先
    };
    const drawArm = (A, back) => {
      const k = back ? 0.82 : 1;
      cv.capsule(A.s.x, A.s.y, A.e.x, A.e.y, armR, shade(sleeveC, k));
      cv.capsule(A.e.x, A.e.y, A.h.x, A.h.y, armR * 0.9, shade(foreC, k));
      if (top === 'robe' && !back) cv.capsule(A.e.x, A.e.y, A.e.x + Math.cos(rad(A.a2)) * 2.5, A.e.y + Math.sin(rad(A.a2)) * 2.5, armR * 1.35, shade(C1, k));
      cv.ellipse(A.h.x, A.h.y, 1.3, 1.3, top === 'armor' ? shade(M, 0.8 * k) : shade(S, k));
    };
    drawArm(armB, true);
    if (!robe) drawLeg(legB, true);

    // ===== 3. 胴と服 =====
    const tw = sw * 0.85;           // 腰の太さ
    const torso = [[sB.x - 0.8, shY], [sF.x + 0.8, shY + 0.4], [cx + tw + P.lean * 0.5, waistY], [cx + tw * 0.95, hipY + 1], [cx - tw * 0.95, hipY + 1], [cx - tw + P.lean * 0.3, waistY]];
    if (robe || dress) {
      const len = robe ? feet - 0.5 : feet - 8;
      const flare = robe ? 5.5 : 4.5;
      const sway = pose.startsWith('walk') ? (pose === 'walk0' ? 1.5 : pose === 'walk2' ? -1.5 : 0) : 0;
      cv.poly([[cx - tw, waistY], [cx + tw, waistY], [cx + tw + flare + sway, len], [cx - tw - flare + sway, len]], C1);
      cv.poly([[cx + 0.5, waistY + 1], [cx + 2, waistY + 1], [cx + 3 + flare * 0.4 + sway, len], [cx + 1 + flare * 0.2 + sway, len]], C2, false);   // 前の縁
      if (dress) { drawLeg(legB, true); drawLeg(legF, false); cv.poly([[cx - tw, waistY], [cx + tw, waistY], [cx + tw + flare + sway, len], [cx - tw - flare + sway, len]], C1); }
      cv.poly(torso, C1);
      cv.capsule(cx - tw, waistY, cx + tw, waistY, 0.9, C2);
      if (robe) { cv.capsule(legF.h.x, feet - 0.5, legF.h.x + 2, feet - 0.5, 1, BOOT); }
    } else {
      cv.poly(torso, top === 'armor' ? M : top === 'vest' ? S : C1);
      if (top === 'coat') {
        const tail = Math.min(feet - 6, hipY + 13);
        const sway = pose.startsWith('walk') ? (pose === 'walk0' ? -1.5 : pose === 'walk2' ? 1.5 : 0) : 0;
        drawLeg(legF, false);
        cv.poly([[cx - tw, hipY - 1], [cx - 0.5, hipY], [cx - 1 + sway, tail], [cx - tw - 3 + sway, tail - 1]], shade(C1, 0.9));
        cv.poly([[cx + 1.5, hipY], [cx + tw + 0.5, hipY - 1], [cx + tw + 3 + sway, tail - 1], [cx + 2.5 + sway, tail]], C1);
        cv.capsule(cx + 1, shY + 2, cx + 1.5, hipY, 0.5, C2);
        for (let y = shY + 4; y < waistY; y += 3) cv.set(cx + 1.5, y, GOLD);
        cv.capsule(cx - tw, waistY, cx + tw, waistY, 0.8, shade(C1, 0.5));
        cv.set(cx + 1, waistY, C2);
      } else if (top === 'armor') {
        cv.poly([[cx - 1.5, shY + 3], [cx + 3, shY + 3], [cx + 2.5, hipY + 6], [cx - 1, hipY + 6]], C1, false);       // 胸当ての上の布
        cv.capsule(cx - tw, waistY, cx + tw, waistY, 0.9, '#4a3424');
        cv.capsule(cx - tw + 0.5, shY + 5.5, cx + tw, shY + 5.5, 0.5, shade(M, 0.75));
        drawLeg(legF, false);
      } else if (top === 'vest') {
        cv.poly([[sB.x - 0.5, shY], [cx - 1, shY + 1], [cx - 1.2, waistY], [cx - tw, waistY]], C1);
        cv.poly([[cx + 1.8, shY + 1], [sF.x + 0.5, shY + 0.4], [cx + tw, waistY], [cx + 2, waistY]], C1);
        cv.set(cx, shY + 6, shade(S, 0.8)); cv.set(cx + 1, shY + 6, shade(S, 0.8)); cv.set(cx, shY + 9, shade(S, 0.8));
        cv.capsule(cx - tw, waistY + 1, cx + tw, waistY + 1, 0.9, C2);
        drawLeg(legF, false);
      } else if (top === 'leather') {
        cv.capsule(sF.x - 0.5, shY + 0.5, cx - tw + 0.5, waistY - 1, 0.6, C2);
        cv.capsule(cx - tw, waistY, cx + tw, waistY, 0.9, C2);
        cv.set(cx + 1, waistY, GOLD);
        drawLeg(legF, false);
      } else if (top === 'overalls') {
        cv.poly([[cx - tw + 0.5, shY + 4], [cx + tw - 0.5, shY + 4], [cx + tw, hipY + 1], [cx - tw, hipY + 1]], C1);
        cv.capsule(cx - tw + 1.2, shY, cx - tw + 1.2, shY + 4, 0.6, C1); cv.capsule(cx + tw - 1, shY, cx + tw - 1, shY + 4, 0.6, C1);
        drawLeg(legF, false);
      } else {
        cv.capsule(cx - tw, waistY, cx + tw, waistY, 0.9, C2);
        cv.set(cx + 1, waistY, GOLD);
        cv.poly([[cx - tw, waistY + 1], [cx + tw, waistY + 1], [cx + tw + 1, hipY + 3], [cx - tw - 1, hipY + 3]], C1);   // チュニックのすそ
        drawLeg(legF, false);
      }
    }
    if (top === 'armor') {   // 肩当て
      cv.ellipse(sF.x, sF.y + 0.4, sw * 0.62, 2.1, M);
      cv.ellipse(sB.x, sB.y + 0.4, sw * 0.5, 1.8, shade(M, 0.85));
    }

    // ===== 4. 首と頭 =====
    cv.capsule(hc.x - 0.3, hc.y + 3, cx + 0.6, neckY + 1.2, 1.25, shade(S, 0.9));
    if (has('scarf')) {
      const Q = look.scarf || '#b03a3a';
      cv.capsule(cx - 2.5, neckY + 1, cx + 3, neckY + 1.4, 1.4, Q);
      cv.capsule(cx - 2, neckY + 1.5, cx - 6, neckY + 6 + (pose.startsWith('walk') ? 1 : 0), 1, shade(Q, 0.85));
    }
    cv.ellipse(hc.x, hc.y, headR - 0.3, headR + 0.3, S);
    cv.ellipse(hc.x + 1.2, hc.y + 2.2, 2.4, 1.8, S);                          // あご（斜め前を向く）
    cv.set(hc.x - 3.4, hc.y + 0.6, shade(S, 0.85));                           // 耳
    if (has('elfEars')) { cv.capsule(hc.x - 3.4, hc.y + 0.4, hc.x - 6, hc.y - 2.2, 0.6, S); }
    // 目（手前の目は大きく、奥の目は小さく）
    const eyeY = Math.round(hc.y + 0.6);
    cv.set(hc.x + 2, eyeY, EYE); cv.set(hc.x + 2, eyeY - 1, EYE); cv.set(hc.x + 3, eyeY, '#f4f0f0'); cv.set(hc.x + 3, eyeY - 1, shade(S, 0.8));
    cv.set(hc.x - 0.6, eyeY, EYE);
    cv.set(hc.x + 2, eyeY - 1, shade(EYE, 1.4));
    cv.set(hc.x + 3.6, eyeY + 1.6, shade(S, 0.82));                           // 鼻の陰
    cv.set(hc.x + 2.2, eyeY + 3, shade(S, 0.7));                              // 口
    if (has('scar')) { cv.set(hc.x + 1, eyeY - 2, '#a8584a'); cv.set(hc.x + 1.6, eyeY - 1, '#a8584a'); cv.set(hc.x + 2.4, eyeY + 1.4, '#a8584a'); }

    // ===== 5. 髪 =====
    if (!has('helmet')) {
      const Hd = shade(H, 0.8);
      switch (look.style) {
        case 'bald':
          cv.capsule(hc.x - 3.6, hc.y + 0.5, hc.x - 3.2, hc.y + 2.5, 0.8, H);
          break;
        default: {
          // 頭のてっぺん
          cv.ellipse(hc.x - 0.4, hc.y - 2.5, headR + 0.5, 2.7, H);
          cv.poly([[hc.x - headR - 0.4, hc.y - 1.5], [hc.x - headR + 0.4, hc.y + 3.2], [hc.x - 1.8, hc.y + 1], [hc.x - 1, hc.y - 1.2]], Hd);   // 後ろ側
          // 前髪
          if (look.style === 'swept') cv.poly([[hc.x - 1, hc.y - 3.5], [hc.x + headR + 0.6, hc.y - 2.5], [hc.x + headR + 0.4, hc.y + 0.9], [hc.x + 3.2, hc.y - 0.2], [hc.x + 1.4, hc.y - 1]], H);
          else if (look.style === 'spiky') {
            cv.poly([[hc.x - 4, hc.y - 3], [hc.x - 2.5, hc.y - 7.5], [hc.x - 1, hc.y - 3.5], [hc.x + 0.5, hc.y - 8], [hc.x + 1.5, hc.y - 3.6], [hc.x + 3.5, hc.y - 6.5], [hc.x + 4.4, hc.y - 1.8]], H);
            cv.poly([[hc.x + 1, hc.y - 2.6], [hc.x + 4.6, hc.y - 1.6], [hc.x + 3.6, hc.y - 0.6]], H);
          } else if (look.style === 'messy') {
            cv.poly([[hc.x - 3, hc.y - 4], [hc.x - 1.5, hc.y - 6], [hc.x, hc.y - 4.4], [hc.x + 2, hc.y - 6], [hc.x + 4.2, hc.y - 2]], H);
            cv.poly([[hc.x + 0.5, hc.y - 3], [hc.x + 4.4, hc.y - 2], [hc.x + 4, hc.y - 0.6], [hc.x + 2.4, hc.y - 1.4]], H);
          } else cv.poly([[hc.x - 0.5, hc.y - 3.6], [hc.x + headR + 0.4, hc.y - 2.4], [hc.x + headR, hc.y - 0.4], [hc.x + 2.5, hc.y - 1.4], [hc.x + 1.2, hc.y - 0.4]], H);
          if (look.style === 'long') { cv.capsule(hc.x + 3.4, hc.y - 1, hc.x + 3.8, hc.y + 7, 0.9, H); }
          if (look.style === 'bob') { cv.poly([[hc.x - 4.6, hc.y - 1], [hc.x - 3.6, hc.y + 4.5], [hc.x - 1, hc.y + 4], [hc.x - 1.5, hc.y]], H); cv.capsule(hc.x + 3.6, hc.y - 1, hc.x + 3.8, hc.y + 3.5, 0.9, H); }
          if (look.style === 'twin') { cv.capsule(hc.x - 4.5, hc.y, hc.x - 6.5, hc.y + 9, 1.3, H); cv.capsule(hc.x + 4, hc.y, hc.x + 5, hc.y + 8, 1.1, Hd); cv.set(hc.x - 4.6, hc.y, C2); }
        }
      }
    }
    void longHair;

    // ===== 6. 頭の飾り =====
    if (has('beard')) { const Z = look.beard || H; cv.poly([[hc.x - 2, hc.y + 1.5], [hc.x + 4, hc.y + 2], [hc.x + 3.4, hc.y + 5.2], [hc.x, hc.y + 5]], Z); cv.set(hc.x + 2.2, eyeY + 2, shade(Z, 0.7)); }
    if (has('longBeard')) { const Z = look.beard || '#eeeef4'; cv.poly([[hc.x - 2, hc.y + 1.5], [hc.x + 4, hc.y + 2], [hc.x + 3, hc.y + 10], [hc.x + 0.5, hc.y + 13], [hc.x - 1, hc.y + 7]], Z); }
    if (has('mask')) { const K = look.mask || HAT; cv.poly([[hc.x - 1.5, hc.y + 1.6], [hc.x + 4.4, hc.y + 1.4], [hc.x + 3.6, hc.y + 4.6], [hc.x - 0.5, hc.y + 4.4]], K); }
    if (has('hood')) {
      cv.poly([[hc.x - 5.2, hc.y + 1], [hc.x - 3.8, hc.y - 4.8], [hc.x + 0.5, hc.y - 6], [hc.x + 4.4, hc.y - 3.8], [hc.x + 4.8, hc.y - 1.6], [hc.x + 1.6, hc.y - 2.6], [hc.x - 0.6, hc.y + 2], [hc.x - 1.8, hc.y + 6], [hc.x - 5, hc.y + 7]], HAT);
      cv.poly([[sB.x - 1.5, shY - 1], [sF.x + 1, shY - 0.4], [sF.x + 0.5, shY + 2.5], [sB.x - 2, shY + 3]], shade(HAT, 0.9));
      cv.set(hc.x + 2, eyeY - 1, shade(EYE, 1.4));   // フードの中で目が光る
    }
    if (has('helmet')) {
      cv.ellipse(hc.x - 0.2, hc.y - 1, headR + 0.7, headR + 0.2, M);
      cv.poly([[hc.x - headR - 0.6, hc.y - 0.5], [hc.x - headR, hc.y + 4], [hc.x - 1, hc.y + 4.4], [hc.x - 1.4, hc.y]], shade(M, 0.8));
      cv.capsule(hc.x + 0.5, eyeY - 0.2, hc.x + 4.4, eyeY - 0.2, 0.6, '#120c18');
      cv.set(hc.x + 2.4, eyeY - 0.2, EYE); cv.set(hc.x + 3.4, eyeY - 0.2, EYE);
      cv.capsule(hc.x - 1, hc.y - 5.6, hc.x - 3.5, hc.y - 8.5, 1.1, C2);       // 飾りの羽根
    }
    if (has('wizardHat')) {
      cv.ellipse(hc.x - 0.2, hc.y - 3, headR + 3.4, 1.4, HAT);
      cv.poly([[hc.x - 3.6, hc.y - 3.4], [hc.x + 3.4, hc.y - 3.4], [hc.x - 2, hc.y - 10], [hc.x - 5.5, hc.y - 12.5]], HAT);
      cv.capsule(hc.x - 3.4, hc.y - 4, hc.x + 3.2, hc.y - 4, 0.7, C2);
      cv.set(hc.x + 0.5, hc.y - 4, GEM);
    }
    if (has('strawHat')) { cv.ellipse(hc.x, hc.y - 3, headR + 4.4, 1.5, '#dcbc64'); cv.ellipse(hc.x - 0.3, hc.y - 4.5, headR - 0.3, 2.3, '#c8a050'); cv.capsule(hc.x - 3.4, hc.y - 3.6, hc.x + 3.4, hc.y - 3.6, 0.5, '#a83a2a'); }
    if (has('halo')) { for (let a = 0; a < 360; a += 20) cv.set(hc.x - 0.5 + Math.cos(rad(a)) * 4.2, hc.y - 7 + Math.sin(rad(a)) * 1.3, GOLD); }
    if (has('crown')) { const Cc = look.crown || GOLD; cv.poly([[hc.x - 3.4, hc.y - 3], [hc.x + 3.6, hc.y - 3], [hc.x + 3.8, hc.y - 6], [hc.x + 2, hc.y - 4.4], [hc.x + 0.2, hc.y - 6.6], [hc.x - 1.6, hc.y - 4.4], [hc.x - 3.6, hc.y - 6]], Cc); cv.set(hc.x + 0.2, hc.y - 4, GEM); }
    if (has('circlet')) { cv.capsule(hc.x - 3.8, hc.y - 2.2, hc.x + 4.2, hc.y - 2.6, 0.5, GOLD); cv.set(hc.x + 2.6, hc.y - 2.6, GEM); }
    if (has('headband')) { cv.capsule(hc.x - 4, hc.y - 2, hc.x + 4.2, hc.y - 2.4, 0.6, C2); cv.capsule(hc.x - 4, hc.y - 2, hc.x - 7, hc.y + 1.5, 0.6, C2); }
    if (has('mouseEars')) { cv.ellipse(hc.x - 3, hc.y - 5.4, 2.2, 2.2, H); cv.ellipse(hc.x + 2.6, hc.y - 5.8, 2.2, 2.2, H); cv.set(hc.x + 2.6, hc.y - 5.8, '#f0a8b0'); cv.set(hc.x - 3, hc.y - 5.4, '#f0a8b0'); }

    // ===== 7. 体の前の飾り =====
    if (has('satchel')) { cv.capsule(sF.x, shY, cx - tw, waistY, 0.5, '#5a3a1e'); cv.poly([[cx - tw - 3, waistY], [cx - tw + 1, waistY], [cx - tw + 1, waistY + 4], [cx - tw - 3, waistY + 4]], '#9a6a3a'); }
    if (has('cape')) { cv.set(sB.x + 1, shY, GOLD); cv.set(sF.x - 1, shY + 0.5, GOLD); }

    // ===== 8. 手前の腕と武器 =====
    const wdir = { x: Math.cos(rad(armF.a2)), y: Math.sin(rad(armF.a2)) };
    const hx = armF.h.x, hy = armF.h.y;
    const weaponBehind = look.weapon === 'staff' || look.weapon === 'orb' || look.weapon === 'fork';
    const staffTopY = Math.min(headTop - 3, hy - 22);
    if (weaponBehind) {
      const grip = { x: hx, y: hy };
      const up = pose === 'atk1' ? { x: grip.x + 14, y: grip.y - 8 } : pose === 'cast' || pose === 'atk0' ? { x: grip.x + 3, y: grip.y - 22 } : { x: grip.x + 1.5, y: staffTopY };
      const down = { x: grip.x - (up.x - grip.x) * 0.45, y: grip.y + (grip.y - up.y) * 0.45 };
      cv.capsule(down.x, down.y, up.x, up.y, 0.75, WOOD);
      if (look.weapon === 'staff') { cv.ellipse(up.x, up.y - 1.5, 1.6, 1.6, GEM, true); cv.capsule(up.x - 2, up.y, up.x - 1.5, up.y - 3, 0.5, WOOD); cv.capsule(up.x + 2, up.y, up.x + 1.5, up.y - 3, 0.5, WOOD); }
      if (look.weapon === 'orb') cv.ellipse(up.x, up.y - 2, 2.4, 2.4, GEM);
      if (look.weapon === 'fork') { cv.capsule(up.x - 1.6, up.y, up.x + 1.6, up.y, 0.5, METAL); for (const dx of [-1.6, 0, 1.6]) cv.capsule(up.x + dx, up.y, up.x + dx, up.y - 3.5, 0.45, METAL); }
    }
    if (look.weapon === 'shield') {
      const s0 = { x: armB.h.x + 4, y: armB.h.y - 4 };
      cv.poly([[s0.x - 4, s0.y - 5], [s0.x + 4, s0.y - 5], [s0.x + 4, s0.y + 3], [s0.x, s0.y + 8], [s0.x - 4, s0.y + 3]], M);
      cv.poly([[s0.x - 2.8, s0.y - 3.8], [s0.x + 2.8, s0.y - 3.8], [s0.x + 2.8, s0.y + 2.4], [s0.x, s0.y + 6], [s0.x - 2.8, s0.y + 2.4]], C1);
      cv.capsule(s0.x, s0.y - 3, s0.x, s0.y + 4, 0.5, C2); cv.capsule(s0.x - 2, s0.y - 0.5, s0.x + 2, s0.y - 0.5, 0.5, C2);
    }
    drawArm(armF, false);
    const blade = (len, width, col) => {
      const tip = { x: hx + wdir.x * len, y: hy + wdir.y * len };
      cv.capsule(hx + wdir.x * 1.5, hy + wdir.y * 1.5, tip.x, tip.y, width, col);
      cv.capsule(hx + wdir.x * 2, hy + wdir.y * 2, tip.x - wdir.x * 1.5, tip.y - wdir.y * 1.5, Math.max(0.3, width - 0.8), shade(col, 1.25));
      const px2 = -wdir.y, py2 = wdir.x;
      cv.capsule(hx + px2 * 2.2 + wdir.x, hy + py2 * 2.2 + wdir.y, hx - px2 * 2.2 + wdir.x, hy - py2 * 2.2 + wdir.y, 0.6, GOLD);   // つば
      cv.capsule(hx - wdir.x * 2, hy - wdir.y * 2, hx, hy, 0.6, '#3a2418');
    };
    switch (look.weapon) {
      case 'sword': blade(14, 1.0, M); break;
      case 'greatsword': blade(20, 1.6, M); break;
      case 'shield': blade(11, 0.9, METAL); break;
      case 'axe': {
        const tip = { x: hx + wdir.x * 13, y: hy + wdir.y * 13 };
        cv.capsule(hx - wdir.x * 3, hy - wdir.y * 3, tip.x, tip.y, 0.7, WOOD);
        const px2 = -wdir.y, py2 = wdir.x;
        cv.poly([[tip.x - wdir.x * 5, tip.y - wdir.y * 5], [tip.x + px2 * 5 - wdir.x * 6, tip.y + py2 * 5 - wdir.y * 6], [tip.x + px2 * 5.5, tip.y + py2 * 5.5], [tip.x, tip.y]], M);
        break;
      }
      case 'daggers': {
        cv.capsule(hx + wdir.x, hy + wdir.y, hx + wdir.x * 6, hy + wdir.y * 6, 0.6, METAL);
        cv.capsule(armB.h.x, armB.h.y, armB.h.x + 1, armB.h.y + 5, 0.6, METAL);
        break;
      }
      case 'wand': { const tip = { x: hx + wdir.x * 6 + 1, y: hy - 5 }; cv.capsule(hx, hy, tip.x, tip.y, 0.5, WOOD); cv.ellipse(tip.x, tip.y - 1, 1.4, 1.4, GEM, true); cv.set(tip.x, tip.y - 3, shade(GEM, 1.3)); break; }
      case 'bow': {
        const bx = hx + 2, by = hy - 1;
        for (let a = -70; a <= 70; a += 7) cv.set(bx + Math.cos(rad(a)) * 3, by + Math.sin(rad(a)) * 10, WOOD);
        for (let a = -70; a <= 70; a += 7) cv.set(bx + Math.cos(rad(a)) * 3 + 0.7, by + Math.sin(rad(a)) * 10, shade(WOOD, 0.7));
        cv.capsule(bx + 1, by - 9.5, bx + (pose === 'atk0' ? -3 : 1), by, 0.3, CLOTH_W);
        cv.capsule(bx + (pose === 'atk0' ? -3 : 1), by, bx + 1, by + 9.5, 0.3, CLOTH_W);
        if (pose === 'atk0') cv.capsule(bx - 3, by, bx + 7, by, 0.4, '#c8a878');
        break;
      }
      default: break;
    }
    return cv.finish(new Set([EYE, GEM, GOLD, shade(EYE, 1.4), '#f4f0f0']));
  }

  /** 顔のまわり（20×20）を切り出す */
  function faceGrid(look) {
    const full = heroGrid(look, 'idle0');
    const hgt = 54 - (look.h || 0) * 2.2;
    const top = Math.max(0, Math.round(62 - hgt - 4));
    const out = makeGrid(20, 20);
    for (let y = 0; y < 20; y++) for (let x = 0; x < 20; x++) { const sy = top + y, sx = 6 + x; if (sy < HH) out[y][x] = full[sy][sx]; }
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
    lava:  { B: '#e8642a', b: '#a8381a', W: '#ffd27a', S: '#8a4a34', s: '#5a2a1e', G: '#ffb030', E: '#ffe040' },
    lavaBoss: { S: '#6a2a1e', s: '#3a140e', G: '#ff6a1a' },
    sea:   { B: '#3a8ab8', b: '#1e5a7a', W: '#a8e8ff', E: '#ffe060', M: '#6a9a9a' },
    sky:   { B: '#e0e4f0', E: '#3a6ad8', W: '#ffffff', S: '#d8dce8', s: '#9aa2b8', G: '#ffe060' },
    small: { P: '#2a3a8a', E: '#5ad0ff', Y: '#ffffff' },
  };

  function enemyGrid(key) {
    const tpl = D.ENEMIES[key];
    if (tpl.sprite === 'human') return heroGrid(tpl.look, 'idle0');
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
    /** 英雄の全身（32×64）。pose: idle0 idle1 walk0〜3 atk0 atk1 cast hurt */
    heroCanvas(id, pose) {
      pose = pose || 'idle0';
      if (typeof pose === 'number') pose = pose ? 'walk0' : 'idle0';
      const k = 'h:' + id + ':' + pose;
      if (!cache[k]) cache[k] = toCanvas(heroGrid(D.heroById[id].look, pose));
      return cache[k];
    },
    /** look から直接（人型の敵など） */
    lookCanvas(key, look, pose) {
      const k = 'l:' + key + ':' + (pose || 'idle0');
      if (!cache[k]) cache[k] = toCanvas(heroGrid(look, pose || 'idle0'));
      return cache[k];
    },
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
    heroUrl(id, scale) { return this.url(this.heroCanvas(id), scale || 3); },
    faceUrl(id, scale) { return this.url(this.faceCanvas(id), scale || 3); },
    enemyUrl(key, scale) { return this.url(this.enemyCanvas(key), scale || 4); },
    /** 全身の <img>。alt は空（名前は別に書くため） */
    heroImg(id, cls) { return `<img class="px body ${cls || ''}" src="${this.heroUrl(id)}" alt="" width="${HW * 2}" height="${HH * 2}">`; },
    faceImg(id, cls) { return `<img class="px facei ${cls || ''}" src="${this.faceUrl(id)}" alt="" width="40" height="40">`; },
    enemyImg(key, cls) {
      const human = D.ENEMIES[key].sprite === 'human';
      return `<img class="px ${human ? 'body' : 'mon'} ${cls || ''}" src="${this.enemyUrl(key)}" alt="" width="${(human ? HW : 16) * 2}" height="${(human ? HH : 16) * 2}">`;
    },
    POSES: Object.keys(POSES),
    HW, HH,
  };

  root.Sprites = Sprites;
})(window);
