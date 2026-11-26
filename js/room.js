/* 星喚の塔 — 待機所（横から見た断面図。施設を建てると階が増え、英雄たちが暮らしている。ホーム画面） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const S = root.Sprites;
  const W = 192;                   // 待機所の幅（ドット）
  const FH = 68;                   // 1つの階の高さ
  const ROOF = 30;                 // 屋根と夜空
  const GROUND = 8;                // 地面
  const STAIR_X = 181;             // 階段の位置（ここで別の階へ移る）

  let canvas, ctx, layer, wrap, bgCanvas, k = 1, H = ROOF + FH + GROUND;
  let heroes = [];                 // { id, fk, x, dy, tx, state, timer, face, spot, frameT, phase, bubble, plan }
  let opts = null;
  let floors = [];                 // [{ key, lv, top, spots }]（下の階から）
  let raf = 0, last = 0, running = false;
  let t = 0;
  let chatTimer = 4;
  let bgKey = '';
  const hits = {};                 // 訓練人形の揺れ

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  // ---------- 階ごとの「英雄が向かう場所」 ----------
  function spotsFor(key, lv, fallen) {
    const sp = [];
    if (key === 'gate') {
      sp.push({ id: 'gate1', x: 104, face: -1, text: ['この先に、塔が…', '門が光ってる', '次はどの世界だろう'] });
      sp.push({ id: 'gate2', x: 16, face: 1, text: ['不思議な光…', '向こうに誰かいる気がする', 'ふう…'] });
      if (fallen > 0) sp.push({ id: 'memorial', x: 152, face: -1, memorial: true });
    } else if (key === 'dorm') {
      const beds = bedsFor(lv);
      beds.forEach((b, i) => sp.push({ id: 'bed' + i, x: b.x, face: 1, sleep: true, bed: b, text: ['Zzz…', 'むにゃ…', 'すやすや'] }));
      sp.push({ id: 'fire', x: 122, face: 1, text: ['あったかい…', 'ふう…', '火の音、落ち着く'] });
      sp.push({ id: 'table1', x: 142, face: 1, text: ['いただきます', 'おいしい', 'お茶をどうぞ'] });
      sp.push({ id: 'table2', x: 166, face: -1, text: ['ごちそうさま', 'もう一杯', 'これ、誰が作ったの？'] });
    } else if (key === 'training') {
      dummiesFor(lv).forEach((x, i) => sp.push({ id: 'train' + i, x: x - 13, face: 1, train: i, text: ['はっ！', 'せいっ！', 'もっと強く…', 'まだまだ！'] }));
      if (lv >= 2) sp.push({ id: 'shoot', x: 128, face: 1, shoot: true, text: ['集中…', '命中！', '風を読む…'] });
    } else if (key === 'strategy') {
      sp.push({ id: 'read', x: 40, face: -1, text: ['ふむふむ', 'この本、面白い', '昔の戦いの記録だ'] });
      sp.push({ id: 'map1', x: 56, face: 1, text: ['次の階は…', 'ここを抜ければ', 'この敵は厄介だな'] });
      sp.push({ id: 'map2', x: 124, face: -1, text: ['作戦を考えよう', '前衛は誰にする？', 'うーん…'] });
      if (lv >= 2) sp.push({ id: 'board', x: 150, face: -1, text: ['なるほど', 'マスターの作戦か', '覚えておこう'] });
    }
    return sp;
  }
  function bedsFor(lv) {
    // 2段ベッド。レベルが上がるとベッドが増える
    const list = [{ x: 28, upper: false }];
    if (lv >= 2) list.push({ x: 28, upper: true });
    if (lv >= 3) list.push({ x: 80, upper: false });
    if (lv >= 4) list.push({ x: 80, upper: true });
    return list;
  }
  function dummiesFor(lv) { return [30, 70, 110].slice(0, Math.max(1, Math.min(3, lv))); }

  // ---------- 背景を描く ----------
  function drawSky(c) {
    const grd = c.createLinearGradient(0, 0, 0, ROOF);
    grd.addColorStop(0, '#0c0920'); grd.addColorStop(1, '#2a1f52');
    c.fillStyle = grd; c.fillRect(0, 0, W, ROOF);
    // 遠くの塔
    px(c, 160, 2, 6, ROOF - 2, '#100c24'); px(c, 158, 6, 10, 2, '#100c24'); px(c, 162, 0, 2, 2, '#100c24');
    px(c, 162, 9, 2, 2, '#c8a050'); px(c, 162, 17, 2, 2, '#8a6a3a');
    // 屋根
    c.fillStyle = '#5a2e2e';
    c.beginPath(); c.moveTo(-2, ROOF); c.lineTo(28, 8); c.lineTo(W - 28, 8); c.lineTo(W + 2, ROOF); c.closePath(); c.fill();
    px(c, 0, ROOF - 3, W, 3, '#3a1c22');
    for (let y = 11; y < ROOF - 3; y += 4) px(c, 20 - (y - 8), y, W - 2 * (20 - (y - 8)), 1, '#46222a');
    px(c, 40, 0, 8, 12, '#4a3a3a'); px(c, 39, 0, 10, 2, '#5e4a4a');        // 煙突
  }

  function wallBricks(c, top, col, line, h) {
    px(c, 0, top, W, h, col);
    for (let y = 0; y < h; y += 6) {
      const off = (y / 6) % 2 ? 6 : 0;
      px(c, 0, top + y, W, 1, line);
      for (let x = off; x < W; x += 12) px(c, x, top + y, 1, 6, line);
    }
  }
  function floorBoards(c, top, a, b, line) {
    const y = top + FH - 10;
    px(c, 0, y, W, 10, a);
    px(c, 0, y, W, 1, line);
    px(c, 0, y + 5, W, 1, b);
    for (let x = 7; x < W; x += 23) px(c, x, y + 1, 1, 4, line);
    for (let x = 18; x < W; x += 29) px(c, x, y + 6, 1, 4, line);
  }
  function stairs(c, top, isTop) {
    // 右はしの階段（上の階へ）
    px(c, 170, top + 3, 22, FH - 13, 'rgba(0,0,0,0.25)');
    if (!isTop) {
      for (let i = 0; i < 7; i++) px(c, 188 - i * 3, top + FH - 13 - i * 8, 4 + i * 3, 3, '#6a4a34');
      for (let i = 0; i < 7; i++) px(c, 188 - i * 3, top + FH - 10 - i * 8, 4 + i * 3, 1, '#4a3424');
    }
    px(c, 170, top + 3, 1, FH - 13, '#2a1e30');
  }
  function beam(c, top) { px(c, 0, top, W, 3, '#3a2a22'); px(c, 0, top + 3, W, 1, '#24181a'); }

  function drawGate(c, top, lv, fallen) {
    wallBricks(c, top, '#2e2a48', '#262240', FH);
    floorBoards(c, top, '#4a4660', '#423e58', '#36324a');
    // 門のアーチ
    const ax = 34, aw = 56;
    for (let y = 0; y < 48; y++) {
      const half = y < 14 ? Math.round(Math.sqrt(Math.max(0, 196 - (14 - y) * (14 - y))) * 2) : 28;
      px(c, ax + aw / 2 - half - 4, top + 10 + y, 4, 1, '#6a6488');
      px(c, ax + aw / 2 + half, top + 10 + y, 4, 1, '#56507a');
    }
    for (let x = -4; x < 4; x++) px(c, ax + aw / 2 + x * 4, top + 8 - Math.abs(x) % 2, 3, 3, '#7a74a0');
    // 台座
    px(c, ax - 6, top + FH - 14, aw + 12, 4, '#5a5478');
    // レベルが上がると柱とかがり火が立つ
    if (lv >= 3) {
      for (const x of [ax - 18, ax + aw + 10]) { px(c, x, top + 20, 8, FH - 30, '#4a4468'); px(c, x - 1, top + 18, 10, 3, '#6a6488'); px(c, x + 1, top + 14, 6, 4, '#3a3450'); }
    }
    // 旗
    px(c, 122, top + 8, 18, 26, '#5a2a6a'); px(c, 122, top + 8, 18, 2, '#e0b84a');
    for (let i = 0; i < 4; i++) px(c, 122 + i * 5, top + 34, 3, 2, '#5a2a6a');
    px(c, 129, top + 16, 4, 8, '#e0b84a'); px(c, 127, top + 19, 8, 2, '#e0b84a');
    // 慰霊碑
    if (fallen > 0) {
      const mx = 140, my = top + FH - 26;
      px(c, mx, my, 16, 16, '#8a8a96'); px(c, mx + 2, my - 2, 12, 2, '#8a8a96');
      px(c, mx - 2, my + 14, 20, 3, '#6a6a74');
      px(c, mx + 4, my + 4, 8, 1, '#5a5a66'); px(c, mx + 4, my + 7, 8, 1, '#5a5a66'); px(c, mx + 4, my + 10, 6, 1, '#5a5a66');
      px(c, mx - 2, my + 11, 3, 3, '#f0d0e0'); px(c, mx + 15, my + 11, 3, 3, '#f0f0a0');
    }
  }

  function drawDorm(c, top, lv) {
    // 板張りの壁
    px(c, 0, top, W, FH, '#6a4a34');
    for (let x = 0; x < W; x += 12) px(c, x, top, 1, FH, '#5a3e2a');
    px(c, 0, top + 40, W, 2, '#8a6446');
    floorBoards(c, top, '#7a5a3e', '#735438', '#5e4430');
    // 窓
    px(c, 136, top + 8, 22, 18, '#4a3424'); px(c, 138, top + 10, 18, 14, '#1a1640');
    px(c, 146, top + 10, 2, 14, '#4a3424'); px(c, 138, top + 16, 18, 2, '#4a3424');
    // 2段ベッド
    const fy = top + FH - 10;
    const frames = lv >= 3 ? [28, 80] : [28];
    for (const bx of frames) {
      px(c, bx - 24, fy - 46, 2, 46, '#4a2e1c'); px(c, bx + 22, fy - 46, 2, 46, '#4a2e1c');
    }
    for (const b of bedsFor(lv)) {
      const sy = b.upper ? fy - 30 : fy - 8;
      px(c, b.x - 22, sy, 44, 4, '#5e3b1f');
      px(c, b.x - 22, sy - 3, 44, 3, '#e8e2f0');
      px(c, b.x - 22, sy - 5, 9, 3, '#ffffff');
      px(c, b.x - 12, sy - 4, 34, 2, b.upper ? '#4a6ac8' : '#c84a6a');
      if (b.upper) for (let i = 0; i < 4; i++) px(c, b.x + 18, sy + 4 + i * 5, 4, 1, '#4a2e1c');
    }
    // 暖炉
    px(c, 110, top + 22, 26, FH - 32, '#6a6470');
    for (let y = top + 24; y < top + FH - 12; y += 5) for (let x = 110 + ((y / 5) % 2) * 4; x < 136; x += 8) px(c, x, y, 1, 4, '#56505c');
    px(c, 108, top + 20, 30, 3, '#8a8490');
    px(c, 115, top + 38, 16, FH - 48, '#1a1414');
    // テーブル
    px(c, 146, fy - 14, 18, 3, '#8a5a34'); px(c, 148, fy - 11, 2, 11, '#5e3b1f'); px(c, 160, fy - 11, 2, 11, '#5e3b1f');
    px(c, 150, fy - 17, 3, 3, '#e8e2cf'); px(c, 157, fy - 17, 3, 3, '#d8a040');
    if (lv >= 5) { px(c, 60, fy - 2, 40, 2, '#a83a48'); px(c, 102, top + 8, 4, 10, '#e0c060'); }
  }

  function drawTraining(c, top, lv) {
    wallBricks(c, top, '#5a4a3a', '#4e4032', FH);
    px(c, 0, top + FH - 10, W, 10, '#a08a5a');
    px(c, 0, top + FH - 10, W, 1, '#7a6a44');
    for (let x = 3; x < W; x += 9) px(c, x, top + FH - 6 + (x % 3), 2, 1, '#8a7a4c');
    // 武器かけ
    px(c, 140, top + 12, 26, 2, '#4a3424');
    const n = 2 + lv;
    for (let i = 0; i < Math.min(5, n); i++) { px(c, 143 + i * 5, top + 8, 1, 22, i % 2 ? '#c8d0dc' : '#7a4e2a'); }
    if (lv >= 4) { px(c, 8, top + 8, 16, 20, '#7a2a2a'); px(c, 14, top + 12, 4, 8, '#e0b84a'); }
    // 的
    if (lv >= 2) {
      const tx = 158, ty = top + FH - 32;
      px(c, tx - 1, ty + 18, 2, 6, '#5e3b1f');
      for (const [r, col] of [[9, '#f4f0e8'], [7, '#c83a3a'], [5, '#f4f0e8'], [3, '#c83a3a'], [1, '#ffd040']]) {
        c.fillStyle = col; c.beginPath(); c.arc(tx, ty + 9, r, 0, Math.PI * 2); c.fill();
      }
    }
  }

  function drawStrategy(c, top, lv) {
    px(c, 0, top, W, FH, '#26304a');
    for (let x = 0; x < W; x += 16) px(c, x, top, 1, FH, '#1e2840');
    floorBoards(c, top, '#4a3a2e', '#43352a', '#342a22');
    const fy = top + FH - 10;
    // 本棚
    px(c, 4, top + 6, 28, FH - 16, '#5a3a24'); px(c, 6, top + 8, 24, FH - 20, '#3a2416');
    const books = ['#c84a4a', '#4a8ac8', '#e0b84a', '#6ab86a', '#9a6ad8', '#e8e2cf', '#d87a3a'];
    for (let row = 0; row < 4; row++) {
      const y = top + 9 + row * 11;
      px(c, 6, y + 10, 24, 1, '#5a3a24');
      for (let x = 7; x < 29; x += 3) px(c, x, y + 3 + ((x + row) % 3), 2, 7 - ((x + row) % 3), books[(x + row * 2) % books.length]);
    }
    // 壁の地図
    px(c, 62, top + 8, 44, 24, '#d8c8a0'); px(c, 62, top + 8, 44, 1, '#8a6a3a'); px(c, 62, top + 31, 44, 1, '#8a6a3a');
    px(c, 68, top + 14, 10, 6, '#7aa86a'); px(c, 84, top + 18, 12, 8, '#7aa86a'); px(c, 80, top + 12, 2, 2, '#c83a3a'); px(c, 96, top + 22, 2, 2, '#c83a3a');
    // 作戦机
    px(c, 62, fy - 14, 56, 4, '#7a5030'); px(c, 64, fy - 10, 3, 10, '#5e3b1f'); px(c, 113, fy - 10, 3, 10, '#5e3b1f');
    px(c, 70, fy - 16, 40, 2, '#d8c8a0');
    if (lv >= 2) { px(c, 88, fy - 26, 4, 10, '#8a84a8'); px(c, 87, fy - 27, 6, 2, '#a8a2c8'); px(c, 89, fy - 29, 2, 2, '#ffe27a'); }
    if (lv >= 3) { c.fillStyle = '#4a8ac8'; c.beginPath(); c.arc(76, fy - 20, 4, 0, Math.PI * 2); c.fill(); px(c, 75, fy - 16, 2, 2, '#5e3b1f'); }
    // 黒板
    if (lv >= 2) {
      px(c, 134, top + 10, 32, 22, '#5a3a24'); px(c, 136, top + 12, 28, 18, '#2a3a2e');
      px(c, 139, top + 16, 10, 1, '#e8e8e8'); px(c, 139, top + 20, 16, 1, '#e8e8e8'); px(c, 152, top + 14, 1, 8, '#e8e8e8'); px(c, 156, top + 24, 5, 1, '#ffd040');
    }
    if (lv >= 5) { px(c, 40, top + 10, 14, 18, '#3a2a5a'); px(c, 46, top + 14, 2, 2, '#ffe27a'); px(c, 43, top + 19, 2, 2, '#ffe27a'); px(c, 49, top + 22, 2, 2, '#ffe27a'); }
  }

  function drawBackground(fallen) {
    const b = document.createElement('canvas');
    b.width = W; b.height = H;
    const c = b.getContext('2d');
    drawSky(c);
    floors.forEach((f, i) => {
      const top = f.top;
      if (f.key === 'gate') drawGate(c, top, f.lv, fallen);
      else if (f.key === 'dorm') drawDorm(c, top, f.lv);
      else if (f.key === 'training') drawTraining(c, top, f.lv);
      else drawStrategy(c, top, f.lv);
      stairs(c, top, i === floors.length - 1);
      beam(c, top);
    });
    // 外壁と地面
    px(c, 0, ROOF, 2, H - ROOF - GROUND, '#2a1e1a'); px(c, W - 2, ROOF, 2, H - ROOF - GROUND, '#2a1e1a');
    px(c, 0, H - GROUND, W, GROUND, '#2e4a2a'); px(c, 0, H - GROUND, W, 2, '#4a6a3a');
    return b;
  }

  // ---------- 動くもの ----------
  function drawDynamic(c) {
    for (const f of floors) {
      if (f.key === 'gate') {
        // 次元の門のうず
        const cx = 62, cy = f.top + 36;
        const big = 10 + f.lv * 2;
        for (let i = 0; i < 4; i++) {
          const r = big - i * (big / 4);
          c.fillStyle = ['#2a1a5a', '#4a2a9a', '#7a4ad8', '#c8a8ff'][i];
          c.beginPath(); c.ellipse(cx, cy, r * 1.05, r * 1.5, 0, 0, Math.PI * 2); c.fill();
        }
        for (let i = 0; i < 6; i++) {
          const a = t * 1.6 + i * Math.PI / 3;
          const rr = big * (0.4 + 0.5 * ((i % 3) / 3));
          px(c, Math.round(cx + Math.cos(a) * rr), Math.round(cy + Math.sin(a) * rr * 1.4), 1, 1, '#ffffff');
        }
        if (f.lv >= 3) {
          const fl = Math.floor(t * 8) % 3;
          for (const x of [62 - 28 - 18 + 2, 62 + 28 + 10 + 2]) { px(c, x, f.top + 10 - fl, 4, 4 + fl, '#f07a2a'); px(c, x + 1, f.top + 12 - fl, 2, 2, '#ffd060'); }
        }
        if (f.lv >= 5) for (let i = 0; i < 3; i++) px(c, 40 + i * 22, Math.round(f.top + 14 + Math.sin(t * 2 + i) * 2), 2, 3, '#a8f0ff');
      } else if (f.key === 'dorm') {
        const fl = Math.floor(t * 8) % 3;
        const by = f.top + FH - 11;
        px(c, 117, by - 8 - fl, 12, 8 + fl, '#c83a1a');
        px(c, 119 + fl, by - 10 - fl, 8 - fl, 9, '#f07a2a');
        px(c, 121, by - 6 - (fl % 2) * 2, 4, 5, '#ffd060');
        [[140, 12], [151, 14], [155, 20], [142, 21]].forEach(([x, y], i) => {
          px(c, x, f.top + y, 1, 1, (Math.sin(t * 2 + i * 1.7) > 0) ? '#ffffff' : '#8a84c8');
        });
      } else if (f.key === 'training') {
        dummiesFor(f.lv).forEach((x, i) => {
          const sway = hits[f.key + i] > t ? (Math.floor(t * 14) % 2 ? 1 : -1) : 0;
          const fy = f.top + FH - 10;
          px(c, x, fy - 30, 2, 30, '#5e3b1f');
          px(c, x - 6 + sway, fy - 26, 14, 3, '#5e3b1f');
          px(c, x - 4 + sway, fy - 24, 10, 12, '#d8b870');
          px(c, x - 3 + sway, fy - 33, 8, 8, '#d8b870');
          px(c, x - 1 + sway, fy - 30, 1, 1, '#3a2a1a'); px(c, x + 2 + sway, fy - 30, 1, 1, '#3a2a1a');
          px(c, x - 4, fy - 2, 10, 2, '#6a6470');
        });
      }
    }
  }

  function feetY(h) { const f = floorOf(h.fk); return f ? f.top + FH - 9 + h.dy : 0; }
  function floorOf(key) { return floors.find(f => f.key === key) || null; }

  function drawHero(c, h) {
    if (h.state === 'stairs') return;
    const walking = h.state === 'walk';
    const frame = walking && Math.floor(h.frameT * 6) % 2 === 1 ? 1 : 0;
    const spr = S.heroCanvas(h.id, frame);
    const fy = feetY(h);
    const spot = h.state === 'act' && h.spot ? spotById(h.fk, h.spot) : null;
    if (spot && spot.sleep) {
      // ベッドで眠る（横になる）
      const f = floorOf(h.fk);
      const sy = (spot.bed.upper ? f.top + FH - 10 - 30 : f.top + FH - 10 - 8) - 3;
      c.save();
      c.translate(Math.round(spot.bed.x), Math.round(sy - 5));
      c.rotate(-Math.PI / 2);
      c.drawImage(spr, -spr.width / 2, -spr.height / 2);
      c.restore();
      px(c, spot.bed.x - 12, sy - 6, 34, 6, spot.bed.upper ? '#4a6ac8' : '#c84a6a');
      px(c, spot.bed.x - 12, sy - 6, 34, 1, spot.bed.upper ? '#6a8ae8' : '#e86a8a');
      return;
    }
    const bob = !walking && Math.floor((t + h.phase) * 1.6) % 2 === 1 ? 1 : 0;
    const trainBob = spot && (spot.train !== undefined || spot.shoot) ? (Math.floor(t * 5 + h.phase) % 2) : 0;
    const x = Math.round(h.x - spr.width / 2);
    const y = Math.round(fy - spr.height + 1 + bob - trainBob);
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(Math.round(h.x) - 7, Math.round(fy), 14, 2);
    c.save();
    if (h.alpha != null) c.globalAlpha = h.alpha;
    if (h.face < 0) { c.translate(x + spr.width, y); c.scale(-1, 1); c.drawImage(spr, 0, 0); }
    else c.drawImage(spr, x, y);
    c.restore();
    if (h.selected) { px(c, Math.round(h.x) - 1, y + 2, 3, 2, '#ffe27a'); px(c, Math.round(h.x), y + 4, 1, 1, '#ffe27a'); }
  }

  function spotById(fk, id) { const f = floorOf(fk); return f ? f.spots.find(s => s.id === id) || null : null; }

  // ---------- 英雄の動き ----------
  function heroInfo(id) { return opts.getHeroes().find(x => x.id === id); }

  function say(h, text, ms) {
    if (!layer || !text || h.state === 'stairs') return;
    if (h.bubble) h.bubble.remove();
    const b = document.createElement('div');
    b.className = 'room-bubble';
    b.textContent = text;
    layer.appendChild(b);
    h.bubble = b;
    h.bubbleUntil = t + (ms || 2600) / 1000;
    placeBubble(h);
  }
  function placeBubble(h) {
    if (!h.bubble) return;
    const s = canvas.clientWidth / W;
    const spot = h.state === 'act' && h.spot ? spotById(h.fk, h.spot) : null;
    const yTop = spot && spot.sleep ? feetY(h) - (spot.bed.upper ? 50 : 26) : feetY(h) - S.HH + 2;
    h.bubble.style.left = (h.x * s) + 'px';
    h.bubble.style.top = (yTop * s) + 'px';
  }

  function idleLine(h) {
    const info = heroInfo(h.id);
    if (!info) return null;
    const fallen = opts.recentFallen();
    if (fallen.length && Math.random() < 0.35) return pick(D.GRIEF_LINES).replace('{name}', pick(fallen));
    if (info.trust < 30 && Math.random() < 0.4) return pick(['…', 'マスターなんて信じられない', '次は誰が倒れるんだろう']);
    return pick(D.ROOM_LINES[D.heroById[h.id].pers]);
  }

  function usedSpots() { return new Set(heroes.map(h => h.fk + ':' + (h.plan ? h.plan.spot : h.spot)).filter(s => !s.endsWith(':null') && !s.endsWith(':undefined'))); }

  function goTo(h, x, spot) {
    h.tx = Math.max(8, Math.min(STAIR_X, x));
    h.state = 'walk';
    h.spot = spot || null;
    h.face = h.tx < h.x ? -1 : 1;
  }

  function decide(h) {
    const r = Math.random();
    const used = usedSpots();
    const all = [];
    for (const f of floors) for (const s of f.spots) if (!used.has(f.key + ':' + s.id) && !s.memorial) all.push({ fk: f.key, s });
    const gate = floorOf('gate');
    const mem = gate && gate.spots.find(s => s.memorial);
    if (mem && r < 0.08 && !used.has('gate:memorial')) { travel(h, 'gate', mem); return; }
    if (r < 0.65 && all.length) {
      const here = all.filter(a => a.fk === h.fk);
      const choice = (here.length && Math.random() < 0.5) ? pick(here) : pick(all);
      travel(h, choice.fk, choice.s);
      return;
    }
    goTo(h, rnd(12, 160), null);
  }

  /** 別の階のときは階段を通って移動する */
  function travel(h, fk, spot) {
    if (fk === h.fk) { goTo(h, spot.x, spot.id); return; }
    h.plan = { fk, spot: spot.id, x: spot.x };
    goTo(h, STAIR_X, null);
  }

  function arrive(h) {
    if (h.plan && h.x >= STAIR_X - 1) {
      h.state = 'stairs';
      h.timer = 0.7;
      if (h.bubble) { h.bubble.remove(); h.bubble = null; }
      return;
    }
    const spot = h.spot ? spotById(h.fk, h.spot) : null;
    h.state = spot ? 'act' : 'idle';
    h.timer = spot ? (spot.sleep ? rnd(8, 14) : rnd(5, 10)) : rnd(2, 5);
    if (spot && spot.memorial) {
      h.face = spot.face;
      const names = opts.recentFallen();
      say(h, names.length ? pick(names) + '…安らかに' : '…安らかに', 3200);
    } else if (spot) {
      h.face = spot.face;
      if (Math.random() < 0.6) say(h, pick(spot.text), 2400);
    } else if (Math.random() < 0.3) {
      say(h, idleLine(h), 2600);
    }
  }

  function startChat() {
    const free = heroes.filter(h => h.state === 'idle');
    for (const a of free) {
      const mates = free.filter(b => b !== a && b.fk === a.fk);
      if (!mates.length) continue;
      const b = pick(mates);
      const [la, lb] = pick(D.CHATS);
      const side = b.x > 90 ? -1 : 1;
      goTo(a, b.x + side * 16, null);
      a.onArrive = () => {
        a.face = b.x > a.x ? 1 : -1;
        b.face = a.x > b.x ? 1 : -1;
        b.state = 'idle'; b.timer = 5;
        a.timer = 5;
        say(a, la, 2400);
        setTimeout(() => { if (running && heroes.includes(b)) say(b, lb, 2400); }, 1300);
      };
      return;
    }
  }

  function update(dt) {
    t += dt;
    chatTimer -= dt;
    if (chatTimer <= 0) { chatTimer = rnd(6, 11); startChat(); }
    for (const h of heroes) {
      h.frameT += dt;
      if (h.state === 'walk') {
        const d = h.tx - h.x;
        const step = 20 * dt;
        if (Math.abs(d) <= step) {
          h.x = h.tx;
          if (h.onArrive) { const f = h.onArrive; h.onArrive = null; h.state = 'idle'; f(); } else arrive(h);
        } else {
          h.x += Math.sign(d) * step;
          h.face = d < 0 ? -1 : 1;
        }
      } else if (h.state === 'stairs') {
        h.timer -= dt;
        if (h.timer <= 0) {
          const p = h.plan;
          h.plan = null;
          if (p && floorOf(p.fk)) { h.fk = p.fk; h.x = STAIR_X; h.alpha = 0; goTo(h, p.x, p.spot); }
          else { h.state = 'idle'; h.timer = 1; }
        }
      } else {
        h.timer -= dt;
        const spot = h.state === 'act' && h.spot ? spotById(h.fk, h.spot) : null;
        if (spot && spot.train !== undefined && Math.floor(t * 5 + h.phase) % 2 === 0) hits['training' + spot.train] = t + 0.15;
        if (h.timer <= 0) decide(h);
      }
      if (h.alpha != null) { h.alpha += dt * 3; if (h.alpha >= 1) h.alpha = null; }
      if (h.bubble) {
        if (t > h.bubbleUntil) { h.bubble.remove(); h.bubble = null; } else placeBubble(h);
      }
    }
  }

  function render() {
    const c = ctx;
    c.setTransform(k, 0, 0, k, 0, 0);
    c.imageSmoothingEnabled = false;
    c.drawImage(bgCanvas, 0, 0);
    drawDynamic(c);
    heroes.slice().sort((a, b) => feetY(a) - feetY(b)).forEach(h => drawHero(c, h));
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    raf = requestAnimationFrame(loop);
  }

  function resize() {
    if (!canvas) return;
    const cssW = canvas.clientWidth || W * 2;
    const dpr = root.devicePixelRatio || 1;
    k = Math.max(1, Math.ceil(cssW * dpr / W));
    canvas.width = W * k;
    canvas.height = H * k;
    heroes.forEach(placeBubble);
    if (running && bgCanvas) render();
  }

  function layoutFloors() {
    const fallen = opts.fallenCount();
    const built = opts.getBuildings().filter(b => b.lv > 0);
    H = ROOF + built.length * FH + GROUND;
    floors = built.map((b, i) => ({ key: b.key, lv: b.lv, top: ROOF + (built.length - 1 - i) * FH, spots: spotsFor(b.key, b.lv, fallen) }));
    if (wrap) wrap.style.aspectRatio = `${W} / ${H}`;
    if (canvas) { canvas.height = H * k; }
  }

  function syncHeroes() {
    const key = JSON.stringify(opts.getBuildings()) + ':' + opts.fallenCount();
    if (key !== bgKey) {
      bgKey = key;
      layoutFloors();
      bgCanvas = drawBackground(opts.fallenCount());
      // なくなった場所にいた英雄は、その場で立ち止まる
      for (const h of heroes) {
        if (!floorOf(h.fk)) { h.fk = floors[0].key; h.state = 'idle'; h.timer = 1; h.spot = null; }
        if (h.spot && !spotById(h.fk, h.spot)) { h.spot = null; h.state = 'idle'; h.timer = 1; }
      }
      resize();
    }
    const list = opts.getHeroes();
    const ids = list.map(x => x.id);
    heroes = heroes.filter(h => {
      if (ids.includes(h.id)) return true;
      if (h.bubble) h.bubble.remove();
      return false;
    });
    const first = heroes.length === 0;
    for (const info of list) {
      if (heroes.some(h => h.id === info.id)) continue;
      const h = { id: info.id, fk: 'gate', x: 62, dy: Math.floor(Math.random() * 3), tx: 62, state: 'idle', timer: rnd(0.2, 2), face: 1, spot: null, frameT: 0, phase: Math.random() * 3 };
      if (first) {
        // 最初はいろいろな階に散らばっている
        const f = pick(floors);
        h.fk = f.key; h.x = rnd(14, 160); h.tx = h.x;
      } else if (last > 0) {
        h.alpha = 0;          // 新しい英雄は次元の門から現れる
        setTimeout(() => say(h, 'よろしく！', 2000), 300);
      }
      heroes.push(h);
    }
  }

  function heroAt(lx, ly) {
    const sorted = heroes.filter(h => h.state !== 'stairs').sort((a, b) => feetY(b) - feetY(a));
    return sorted.find(h => {
      const fy = feetY(h);
      const spot = h.state === 'act' && h.spot ? spotById(h.fk, h.spot) : null;
      if (spot && spot.sleep) {
        const f = floorOf(h.fk);
        const sy = spot.bed.upper ? f.top + FH - 40 : f.top + FH - 18;
        return lx >= spot.bed.x - 24 && lx <= spot.bed.x + 22 && ly >= sy - 12 && ly <= sy + 4;
      }
      return lx >= h.x - 7 && lx <= h.x + 7 && ly >= fy - 44 && ly <= fy + 2;
    }) || null;
  }

  function onTap(e) {
    const rect = canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / rect.width * W;
    const ly = (e.clientY - rect.top) / rect.height * H;
    const h = heroAt(lx, ly);
    if (h) {
      heroes.forEach(o => { o.selected = o === h; });
      if (h.state !== 'act') { h.state = 'idle'; h.timer = 4; h.onArrive = null; h.plan = null; }
      opts.onHero(h.id);
      return;
    }
    const f = floors.find(fl => ly >= fl.top && ly < fl.top + FH);
    if (!f) return;
    if (f.key === 'gate' && lx >= 30 && lx <= 94) { opts.onDoor(); return; }
    opts.onBuilding(f.key);
  }

  const Room = {
    /** container の中に待機所を作る */
    mount(container, options) {
      opts = options;
      container.innerHTML = '';
      wrap = document.createElement('div');
      wrap.className = 'room-wrap';
      canvas = document.createElement('canvas');
      canvas.className = 'room-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '待機所の断面図。英雄たちが暮らしている。英雄をタップすると話しかけられ、部屋をタップすると施設を見られる。1階の次元の門から塔へ行ける。');
      layer = document.createElement('div');
      layer.className = 'room-layer';
      wrap.appendChild(canvas);
      wrap.appendChild(layer);
      container.appendChild(wrap);
      ctx = canvas.getContext('2d');
      canvas.addEventListener('click', onTap);
      heroes.forEach(h => { if (h.bubble) { h.bubble.remove(); h.bubble = null; } });
      bgKey = '';
      syncHeroes();
      resize();
      this.start();
    },
    start() {
      if (running || !canvas) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
    },
    refresh() { if (opts) syncHeroes(); },
    resize,
    clearSelection() { heroes.forEach(h => { h.selected = false; }); },
    /** テスト用: 今いる英雄の様子 */
    debug() { return heroes.map(h => ({ id: h.id, floor: h.fk, x: Math.round(h.x), state: h.state, spot: h.spot })); },
    floors() { return floors.map(f => ({ key: f.key, lv: f.lv })); },
    /** テスト用: 指定した英雄の画面上の位置（タップ用） */
    screenPos(id) {
      const h = heroes.find(x => x.id === id);
      if (!h || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      const spot = h.state === 'act' && h.spot ? spotById(h.fk, h.spot) : null;
      if (spot && spot.sleep) {
        const f = floorOf(h.fk);
        const sy = spot.bed.upper ? f.top + FH - 44 : f.top + FH - 22;
        return { x: r.left + spot.bed.x / W * r.width, y: r.top + sy / H * r.height };
      }
      return { x: r.left + h.x / W * r.width, y: r.top + (feetY(h) - 20) / H * r.height };
    },
    /** テスト用: 指定した階の画面上の位置（タップ用。英雄のいない場所） */
    floorPos(key) {
      const f = floorOf(key);
      if (!f || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + 175 / W * r.width, y: r.top + (f.top + 8) / H * r.height };
    },
    W,
  };

  root.addEventListener('resize', () => Room.resize());
  root.Room = Room;
})(window);
