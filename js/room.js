/* 星喚の塔 — 待機所（城壁に囲まれた敷地を斜め上から見た絵。ホーム画面） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const S = root.Sprites;
  const W = 480, H = 300;                       // 待機所の大きさ（ドット）
  const CX = 240, CY = 168, RX = 226, RY = 118; // 城壁の楕円

  // 施設の区画（地面の中心）。plaza は真ん中
  const PLOTS = {
    gate:     { x: 240, y: 62 },
    fusion:   { x: 140, y: 100 },
    armory:   { x: 340, y: 100 },
    dorm:     { x: 92,  y: 166 },
    alchemy:  { x: 388, y: 166 },
    plaza:    { x: 240, y: 168 },
    training: { x: 146, y: 236 },
    strategy: { x: 334, y: 236 },
  };
  const PW = 46, PD = 23;                       // 区画の大きさ（ひし形の半分の幅・奥行き）

  // 英雄がすること（頭の上のアイコン）
  const ACTS = {
    gate: 'gaze', dorm: 'sleep', plaza: 'chat', training: 'train', strategy: 'read', fusion: 'spark', armory: 'hammer', alchemy: 'flask',
  };

  let canvas, ctx, buf, bctx, bg = null, k = 1, wrap;
  let heroes = [];                              // { id, x, y, tx, ty, state, timer, face, plot, frameT, phase }
  let opts = null;
  let raf = 0, last = 0, running = false, t = 0;
  let bgKey = '';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); }
  function poly(c, pts, col) { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); c.fill(); }
  function shade(col, f) { const n = parseInt(col.slice(1), 16); const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255; return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v * f))).toString(16).padStart(2, '0')).join(''); }

  /** 斜めから見た箱（cx, cy は地面の中心。w, d はひし形の半分の大きさ、h は高さ） */
  function isoBox(c, cx, cy, w, d, h, col) {
    const top = [[cx, cy - d - h], [cx + w, cy - h], [cx, cy + d - h], [cx - w, cy - h]];
    poly(c, [[cx - w, cy - h], [cx, cy + d - h], [cx, cy + d], [cx - w, cy]], shade(col, 0.82));   // 左の面
    poly(c, [[cx + w, cy - h], [cx, cy + d - h], [cx, cy + d], [cx + w, cy]], shade(col, 0.62));   // 右の面
    poly(c, top, col);
    return top;
  }
  /** 三角屋根 */
  function isoRoof(c, cx, cy, w, d, h, rh, col) {
    const y0 = cy - h;
    poly(c, [[cx - w, y0], [cx, y0 + d], [cx, y0 + d - rh], [cx - w / 2, y0 - d / 2 - rh]], shade(col, 0.9));
    poly(c, [[cx + w, y0], [cx, y0 + d], [cx, y0 + d - rh], [cx + w / 2, y0 + d / 2 - rh - d]], shade(col, 0.6));
    poly(c, [[cx - w, y0], [cx - w / 2, y0 - d / 2 - rh], [cx + w / 2, y0 - d / 2 - rh - d + d], [cx, y0 - d]], shade(col, 1.05));
  }
  function pyramid(c, cx, cy, w, d, h, rh, col) {
    const y0 = cy - h;
    poly(c, [[cx - w, y0], [cx, y0 + d], [cx, y0 - rh]], shade(col, 0.95));
    poly(c, [[cx + w, y0], [cx, y0 + d], [cx, y0 - rh]], shade(col, 0.65));
    poly(c, [[cx - w, y0], [cx, y0 - d], [cx, y0 - rh]], shade(col, 1.1));
    poly(c, [[cx + w, y0], [cx, y0 - d], [cx, y0 - rh]], shade(col, 0.8));
  }
  function diamond(c, cx, cy, w, d, col) { poly(c, [[cx, cy - d], [cx + w, cy], [cx, cy + d], [cx - w, cy]], col); }
  function door(c, x, y, col) { px(c, x - 3, y - 9, 6, 9, col || '#2a1a12'); px(c, x - 3, y - 10, 6, 1, '#6a4a34'); }
  function win(c, x, y) { px(c, x, y, 3, 4, '#ffd97a'); px(c, x, y, 3, 1, '#c8a050'); }

  // ---------- 背景 ----------
  function inEllipse(x, y, rx, ry) { return ((x - CX) / rx) ** 2 + ((y - CY) / ry) ** 2 <= 1; }

  function drawGround(c) {
    // 空と外の荒れ地
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#141026'); g.addColorStop(0.3, '#2a2440'); g.addColorStop(1, '#2a2a30');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 70; i++) px(c, (i * 97) % W, 20 + (i * 53) % (H - 20), 2, 1, i % 3 ? '#3a3a44' : '#444038');
    // 城壁の内側の地面
    c.fillStyle = '#4a5a3a'; c.beginPath(); c.ellipse(CX, CY, RX - 6, RY - 4, 0, 0, Math.PI * 2); c.fill();
    for (let i = 0; i < 260; i++) {
      const x = (i * 131) % W, y = (i * 71) % H;
      if (inEllipse(x, y, RX - 10, RY - 8)) px(c, x, y, 2, 1, i % 2 ? '#56683f' : '#425234');
    }
    // 石畳の道（広場から各区画へ）
    for (const p of Object.values(PLOTS)) {
      const steps = 28;
      for (let i = 0; i <= steps; i++) {
        const x = PLOTS.plaza.x + (p.x - PLOTS.plaza.x) * i / steps, y = PLOTS.plaza.y + (p.y - PLOTS.plaza.y) * i / steps;
        diamond(c, Math.round(x), Math.round(y), 9, 4, i % 2 ? '#8a8270' : '#7a7262');
      }
    }
  }

  function drawWallBack(c) {
    // 奥の城壁（上半分）
    for (let a = Math.PI; a <= Math.PI * 2 + 0.001; a += 0.02) {
      const x = CX + Math.cos(a) * RX, y = CY + Math.sin(a) * RY;
      px(c, x - 3, y - 18, 7, 18, '#6a6476');
      px(c, x - 3, y - 20, 7, 3, '#8a8496');
    }
    for (let a = Math.PI; a <= Math.PI * 2; a += 0.12) {
      const x = CX + Math.cos(a) * RX, y = CY + Math.sin(a) * RY;
      px(c, x - 2, y - 24, 4, 4, '#7a7486');
    }
  }
  function drawWallFront(c) {
    for (let a = 0; a <= Math.PI + 0.001; a += 0.02) {
      const x = CX + Math.cos(a) * RX, y = CY + Math.sin(a) * RY;
      px(c, x - 3, y - 10, 7, 14, '#5a5466');
      px(c, x - 3, y - 12, 7, 3, '#7a7486');
    }
    for (let a = 0.06; a <= Math.PI; a += 0.12) {
      const x = CX + Math.cos(a) * RX, y = CY + Math.sin(a) * RY;
      px(c, x - 2, y - 16, 4, 4, '#6a6476');
    }
  }

  // 施設の絵（lv が上がると大きく立派になる）
  function drawPlot(c, key, lv) {
    const p = PLOTS[key];
    const x = p.x, y = p.y;
    if (lv <= 0) {
      // 建設予定地
      diamond(c, x, y, PW - 8, PD - 4, '#6a5a44');
      diamond(c, x, y, PW - 12, PD - 6, '#5e5040');
      for (const [dx, dy] of [[-PW + 10, 0], [PW - 10, 0], [0, -PD + 5], [0, PD - 5]]) { px(c, x + dx, y + dy - 8, 2, 8, '#8a6a44'); }
      px(c, x - 6, y - 14, 12, 7, '#c8b890'); px(c, x - 1, y - 7, 2, 6, '#8a6a44');
      return;
    }
    const big = 0.7 + lv * 0.08;
    const w = Math.round(PW * big), d = Math.round(PD * big);
    if (key === 'gate') {
      // 次元の門（城壁の奥の大きなアーチ）
      const h = 40 + lv * 4;
      isoBox(c, x - 26, y, 8, 5, h, '#5a5470'); isoBox(c, x + 26, y, 8, 5, h, '#5a5470');
      poly(c, [[x - 34, y - h], [x + 34, y - h], [x + 28, y - h - 10], [x - 28, y - h - 10]], '#6a6488');
      px(c, x - 20, y - h + 2, 40, 4, '#4a4466');
      if (lv >= 3) for (const sx of [-44, 44]) { isoBox(c, x + sx, y + 6, 4, 2, 18, '#4a4468'); }
      return;
    }
    if (key === 'plaza') {
      diamond(c, x, y, w + 6, d + 4, '#9a9280');
      diamond(c, x, y, w - 2, d - 1, '#aaa290');
      // 噴水
      isoBox(c, x, y, 16, 8, 6, '#8a8aa0');
      diamond(c, x, y - 6, 12, 6, '#4a8ac8');
      isoBox(c, x, y - 6, 3, 2, 10 + lv * 2, '#a8a8c0');
      if (lv >= 3) for (const [dx, dy] of [[-w, 0], [w, 0], [0, -d], [0, d]]) { px(c, x + dx - 1, y + dy - 14, 2, 14, '#5e4a34'); px(c, x + dx - 3, y + dy - 18, 6, 4, '#ffe9a8'); }
      if (lv >= 4) { isoBox(c, x - w + 10, y + 4, 8, 4, 4, '#7a5030'); isoBox(c, x + w - 10, y + 4, 8, 4, 4, '#7a5030'); }
      return;
    }
    diamond(c, x, y, w + 4, d + 2, '#5a5040');
    if (key === 'dorm') {
      const h = 18 + lv * 4;
      isoBox(c, x, y, w - 6, d - 3, h, '#c8b090');
      isoRoof(c, x, y, w - 4, d - 2, h, 14 + lv, '#8a3a32');
      door(c, x - 6, y + d - 6); win(c, x - 20, y + 2 - h / 2); win(c, x + 12, y + 2 - h / 2);
      if (lv >= 3) { win(c, x - 20, y - h + 10); win(c, x + 12, y - h + 10); }
      if (lv >= 5) px(c, x + 10, y - h - 20, 3, 12, '#5a4a4a');
    } else if (key === 'training') {
      // 訓練場（屋根のない広場に人形）
      diamond(c, x, y, w, d, '#a08a5a');
      const n = Math.min(lv + 1, 5);
      for (let i = 0; i < n; i++) {
        const dx = -w + 14 + i * ((2 * w - 28) / Math.max(1, n - 1)), dy = (i % 2 ? 4 : -4);
        px(c, x + dx, y + dy - 14, 2, 14, '#5e3b1f'); px(c, x + dx - 4, y + dy - 12, 10, 2, '#5e3b1f'); px(c, x + dx - 2, y + dy - 18, 6, 8, '#d8b870');
      }
      if (lv >= 2) { px(c, x + w - 8, y - 22, 2, 12, '#5e3b1f'); c.fillStyle = '#c83a3a'; c.beginPath(); c.arc(x + w - 7, y - 24, 5, 0, Math.PI * 2); c.fill(); px(c, x + w - 8, y - 25, 2, 2, '#f4f0e8'); }
    } else if (key === 'strategy') {
      const h = 22 + lv * 4;
      isoBox(c, x, y, w - 8, d - 4, h, '#5a6a8a');
      pyramid(c, x, y, w - 6, d - 3, h, 16 + lv * 2, '#3a3a5a');
      door(c, x - 6, y + d - 7); win(c, x + 10, y - h / 2);
      px(c, x - 1, y - h - 30 - lv * 2, 2, 12, '#c8c8d8'); px(c, x + 1, y - h - 30 - lv * 2, 8, 5, '#c83a3a');
    } else if (key === 'fusion') {
      const h = 20 + lv * 4;
      isoBox(c, x, y, w - 10, d - 5, h, '#d8d4e4');
      // 丸屋根
      c.fillStyle = '#9a8ad8'; c.beginPath(); c.ellipse(x, y - h, w - 12, 12 + lv * 2, 0, Math.PI, 0); c.fill();
      c.fillStyle = '#b8a8f0'; c.beginPath(); c.ellipse(x - 6, y - h - 6, 6, 4, 0, 0, Math.PI * 2); c.fill();
      door(c, x - 4, y + d - 8, '#3a2a5a');
      for (const dx of [-w + 14, w - 14]) isoBox(c, x + dx, y + 2, 3, 2, h - 2, '#f0ecf8');
    } else if (key === 'armory') {
      const h = 18 + lv * 4;
      isoBox(c, x, y, w - 6, d - 3, h, '#7a6a5a');
      isoRoof(c, x, y, w - 4, d - 2, h, 12 + lv, '#4a4a52');
      door(c, x - 6, y + d - 6, '#1a1a1e');
      px(c, x + 12, y - h - 16, 5, 14, '#4a4040');                 // 炉の煙突
      px(c, x + 18, y - 8, 8, 6, '#3a3a40'); px(c, x + 17, y - 10, 10, 2, '#5a5a62');  // 金床
      if (lv >= 3) for (let i = 0; i < 3; i++) px(c, x - w + 10 + i * 4, y - 18, 1, 14, '#c8d0dc');
    } else if (key === 'alchemy') {
      const h = 16 + lv * 4;
      isoBox(c, x, y, w - 10, d - 5, h, '#6a8a6a');
      pyramid(c, x, y, w - 8, d - 4, h, 20 + lv * 2, '#3a5a4a');
      door(c, x - 4, y + d - 8, '#1e2a1e');
      px(c, x + 16, y - 6, 10, 6, '#3a3a3a'); px(c, x + 17, y - 8, 8, 2, '#5ad08a');   // 大釜
      if (lv >= 3) { px(c, x - 22, y - h - 4, 3, 5, '#c8a8ff'); px(c, x - 16, y - h - 2, 3, 5, '#ffd27a'); }
    }
  }

  function drawBackground(levels, fallen) {
    const b = document.createElement('canvas');
    b.width = W; b.height = H;
    const c = b.getContext('2d');
    drawGround(c);
    drawWallBack(c);
    // 奥から手前へ
    const keys = Object.keys(PLOTS).sort((a, b2) => PLOTS[a].y - PLOTS[b2].y);
    for (const key of keys) if (key !== 'gate' || true) drawPlot(c, key, levels[key] || 0);
    // 慰霊碑（倒れた英雄がいるとき）
    if (fallen > 0) {
      const mx = 196, my = 112;
      isoBox(c, mx, my, 6, 3, 14, '#8a8a96');
      px(c, mx - 2, my - 12, 4, 1, '#5a5a66'); px(c, mx - 2, my - 9, 4, 1, '#5a5a66');
      px(c, mx - 9, my - 2, 3, 3, '#f0d0e0'); px(c, mx + 7, my - 2, 3, 3, '#f0f0a0');
    }
    return b;
  }

  // ---------- 動くもの ----------
  // 小さなドットのアイコン（頭の上に出す）
  const ICONS = {
    sleep: { c: '#c8d8ff', rows: ['ZZZ..', '..Z..', '.Z...', 'ZZZ..', '...zz', '....z', '...zz'] },
    train: { c: '#e8e8f0', rows: ['....X', '...X.', '..X..', 'XX...', '.X...'] },
    read:  { c: '#ffd97a', rows: ['XX.XX', 'XXXXX', 'XX.XX', 'XX.XX'] },
    chat:  { c: '#ffffff', rows: ['XXXXX', 'X.X.X', 'XXXXX', '.X...'] },
    spark: { c: '#c8a8ff', rows: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'] },
    hammer:{ c: '#c8c8d0', rows: ['XXXX.', 'XXXX.', '..X..', '..X..', '..X..'] },
    flask: { c: '#5ad08a', rows: ['.XX..', '.XX..', 'XXXX.', 'XXXX.', '.XX..'] },
    gaze:  { c: '#c8a8ff', rows: ['.XXX.', 'X.X.X', '.XXX.'] },
    alert: { c: '#ffd040', rows: ['.XX.', '.XX.', '.XX.', '....', '.XX.'] },
  };
  function icon(c, key, x, y) {
    const ic = ICONS[key];
    if (!ic) return;
    const w = ic.rows[0].length, h = ic.rows.length;
    px(c, x - Math.ceil(w / 2) - 1, y - h - 1, w + 2, h + 2, 'rgba(10,8,20,0.75)');
    ic.rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') px(c, x - Math.ceil(w / 2) + i, y - h + j, 1, 1, ic.c); });
  }

  function drawDynamic(c) {
    const lv = opts.getBuildings();
    const gl = lv.find(b => b.key === 'gate').lv;
    // 次元の門のうず
    const g = PLOTS.gate, gh = 40 + gl * 4;
    const cy = g.y - gh / 2 - 2;
    for (let i = 0; i < 4; i++) {
      c.fillStyle = ['#2a1a5a', '#4a2a9a', '#7a4ad8', '#c8a8ff'][i];
      c.beginPath(); c.ellipse(g.x, cy, 16 - i * 3.5, (gh / 2 - 2) - i * 4, 0, 0, Math.PI * 2); c.fill();
    }
    for (let i = 0; i < 6; i++) { const a = t * 1.5 + i; px(c, g.x + Math.cos(a) * 10, cy + Math.sin(a) * (gh / 3), 1, 1, '#ffffff'); }
    // 噴水の水しぶき
    const pl = lv.find(b => b.key === 'plaza').lv;
    if (pl > 0) for (let i = 0; i < 5; i++) { const a = (t * 2 + i * 1.3) % 1; px(c, PLOTS.plaza.x - 8 + i * 4, PLOTS.plaza.y - 16 - pl * 2 + a * 10, 1, 2, '#a8d8ff'); }
    // 煙
    for (const key of ['armory', 'dorm']) {
      const b = lv.find(x => x.key === key);
      if (!b || b.lv < (key === 'dorm' ? 5 : 1)) continue;
      for (let i = 0; i < 3; i++) { const a = (t * 0.6 + i / 3) % 1; px(c, PLOTS[key].x + (key === 'armory' ? 14 : 11) + Math.sin(a * 6) * 2, PLOTS[key].y - 40 - lv.find(x => x.key === key).lv * 4 - a * 18, 2, 2, `rgba(200,200,210,${0.6 - a * 0.6})`); }
    }
    // 錬金場の泡
    const al = lv.find(b => b.key === 'alchemy').lv;
    if (al > 0) { const a = (t * 1.5) % 1; px(c, PLOTS.alchemy.x + 20, PLOTS.alchemy.y - 10 - a * 8, 2, 2, '#8affb0'); }
  }

  function drawHero(c, h) {
    const walking = h.state === 'walk';
    const frame = walking && Math.floor(h.frameT * 6) % 2 === 1 ? 1 : 0;
    const spr = S.heroCanvas(h.id, frame);
    const x = Math.round(h.x - spr.width / 2);
    const busy = h.state === 'act';
    const bob = busy && h.act === 'train' ? (Math.floor(t * 5 + h.phase) % 2) : (!walking && Math.floor((t + h.phase) * 1.4) % 2 ? 1 : 0);
    const y = Math.round(h.y - spr.height + 1 - (busy && h.act === 'train' ? bob : -bob * 0));
    px(c, h.x - 7, h.y - 1, 14, 3, 'rgba(0,0,0,0.3)');
    c.save();
    if (h.alpha != null) c.globalAlpha = h.alpha;
    if (h.face < 0) { c.translate(x + spr.width, y); c.scale(-1, 1); c.drawImage(spr, 0, 0); } else c.drawImage(spr, x, y);
    c.restore();
    const info = heroInfo(h.id);
    if (info && info.proposal) icon(c, 'alert', h.x, y + 2);
    else if (busy && h.act) icon(c, h.act, h.x, y + 2);
    if (h.selected) { px(c, h.x - 8, h.y + 2, 16, 1, '#ffe27a'); }
  }

  // ---------- 英雄の動き ----------
  function heroInfo(id) { return opts.getHeroes().find(x => x.id === id); }
  function builtPlots() { return opts.getBuildings().filter(b => b.lv > 0).map(b => b.key); }
  function spotOf(key) {
    const p = PLOTS[key];
    if (key === 'plaza') return { x: p.x + rnd(-40, 40), y: p.y + rnd(18, 30) };
    if (key === 'gate') return { x: p.x + rnd(-16, 16), y: p.y + 22 };
    return { x: p.x + rnd(-14, 14), y: p.y + PD + rnd(2, 8) };
  }
  function clampToGround(x, y) {
    let dx = x - CX, dy = y - CY;
    const r = Math.sqrt((dx / (RX - 24)) ** 2 + (dy / (RY - 16)) ** 2);
    if (r > 1) { dx /= r; dy /= r; }
    return { x: CX + dx, y: Math.max(76, CY + dy) };
  }

  function goTo(h, x, y, plot) {
    const p = clampToGround(x, y);
    h.tx = p.x; h.ty = p.y; h.state = 'walk'; h.plot = plot || null;
    h.face = h.tx < h.x ? -1 : 1;
  }
  function decide(h) {
    const plots = builtPlots();
    if (Math.random() < 0.7 && plots.length) {
      const key = pick(plots);
      const sp = spotOf(key);
      goTo(h, sp.x, sp.y, key);
    } else {
      goTo(h, CX + rnd(-150, 150), CY + rnd(-50, 80), null);
    }
  }
  function arrive(h) {
    if (h.plot) { h.state = 'act'; h.act = ACTS[h.plot]; h.timer = h.act === 'sleep' ? rnd(8, 14) : rnd(5, 10); h.face = h.x > PLOTS[h.plot].x ? -1 : 1; }
    else { h.state = 'idle'; h.act = null; h.timer = rnd(2, 5); }
  }

  function update(dt) {
    t += dt;
    for (const h of heroes) {
      h.frameT += dt;
      if (h.state === 'walk') {
        const dx = h.tx - h.x, dy = h.ty - h.y;
        const d = Math.hypot(dx, dy);
        const step = 22 * dt;
        if (d <= step) { h.x = h.tx; h.y = h.ty; arrive(h); }
        else { h.x += dx / d * step; h.y += dy / d * step; h.face = dx < 0 ? -1 : 1; }
      } else {
        h.timer -= dt;
        if (h.timer <= 0) decide(h);
      }
      if (h.alpha != null) { h.alpha += dt * 2; if (h.alpha >= 1) h.alpha = null; }
    }
  }

  function render() {
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(bg, 0, 0);
    drawDynamic(bctx);
    // 英雄と、手前の城壁
    heroes.slice().sort((a, b) => a.y - b.y).forEach(h => drawHero(bctx, h));
    drawWallFront(bctx);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W * k, H * k);
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
    const cssW = canvas.clientWidth || W;
    const dpr = root.devicePixelRatio || 1;
    k = Math.max(1, Math.ceil(cssW * dpr / W));
    canvas.width = W * k;
    canvas.height = H * k;
    if (bg) render();
  }

  function sync() {
    const levels = {};
    for (const b of opts.getBuildings()) levels[b.key] = b.lv;
    const key = JSON.stringify(levels) + ':' + opts.fallenCount();
    if (key !== bgKey) { bgKey = key; bg = drawBackground(levels, opts.fallenCount()); }
    const list = opts.getHeroes();
    const ids = list.map(x => x.id);
    heroes = heroes.filter(h => ids.includes(h.id));
    const first = heroes.length === 0;
    for (const info of list) {
      if (heroes.some(h => h.id === info.id)) continue;
      const h = { id: info.id, x: PLOTS.gate.x, y: PLOTS.gate.y + 24, tx: 0, ty: 0, state: 'idle', timer: rnd(0.2, 2), face: 1, plot: null, act: null, frameT: 0, phase: Math.random() * 3 };
      if (first) { const p = clampToGround(CX + rnd(-150, 150), CY + rnd(-40, 80)); h.x = p.x; h.y = p.y; }
      else if (last > 0) h.alpha = 0;         // 新しい英雄は次元の門から現れる
      heroes.push(h);
    }
  }

  function heroAt(lx, ly) {
    return heroes.slice().sort((a, b) => b.y - a.y).find(h => lx >= h.x - 8 && lx <= h.x + 8 && ly >= h.y - 44 && ly <= h.y + 3) || null;
  }
  function plotAt(lx, ly) {
    let best = null, bd = Infinity;
    for (const [key, p] of Object.entries(PLOTS)) {
      const top = key === 'gate' ? 60 : 50;
      if (lx < p.x - PW || lx > p.x + PW || ly < p.y - top || ly > p.y + PD) continue;
      const d = Math.abs(lx - p.x) + Math.abs(ly - p.y);
      if (d < bd) { bd = d; best = key; }
    }
    return best;
  }

  function onTap(e) {
    const rect = canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / rect.width * W;
    const ly = (e.clientY - rect.top) / rect.height * H;
    const h = heroAt(lx, ly);
    if (h) {
      heroes.forEach(o => { o.selected = o === h; });
      if (h.state === 'walk') { h.state = 'idle'; h.timer = 4; }
      opts.onHero(h.id);
      return;
    }
    const key = plotAt(lx, ly);
    if (key) opts.onBuilding(key);
  }

  const Room = {
    mount(container, options) {
      opts = options;
      container.innerHTML = '';
      wrap = document.createElement('div');
      wrap.className = 'room-wrap';
      canvas = document.createElement('canvas');
      canvas.className = 'room-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '待機所。城壁の中で英雄たちが暮らしている。英雄や施設をタップできる。');
      wrap.appendChild(canvas);
      container.appendChild(wrap);
      ctx = canvas.getContext('2d');
      buf = document.createElement('canvas'); buf.width = W; buf.height = H;
      bctx = buf.getContext('2d');
      canvas.addEventListener('click', onTap);
      bgKey = '';
      sync();
      resize();
      this.start();
    },
    start() {
      if (running || !canvas) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(loop);
    },
    stop() { running = false; cancelAnimationFrame(raf); },
    refresh() { if (opts) sync(); },
    resize,
    clearSelection() { heroes.forEach(h => { h.selected = false; }); },
    debug() { return heroes.map(h => ({ id: h.id, x: Math.round(h.x), y: Math.round(h.y), state: h.state, act: h.act })); },
    screenPos(id) {
      const h = heroes.find(x => x.id === id);
      if (!h || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + h.x / W * r.width, y: r.top + (h.y - 20) / H * r.height };
    },
    plotPos(key) {
      const p = PLOTS[key];
      if (!p || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + (p.x + PW - 6) / W * r.width, y: r.top + (p.y + 4) / H * r.height };
    },
    W, H,
  };

  root.addEventListener('resize', () => Room.resize());
  root.Room = Room;
})(window);
