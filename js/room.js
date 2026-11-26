/* 星喚の塔 — 待機室（英雄たちが暮らす部屋。ホーム画面） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const S = root.Sprites;
  const W = 192, H = 150;          // 部屋の大きさ（ドット）
  const FLOOR_TOP = 62;

  // 英雄が向かう場所（足もとの位置）
  const SPOTS = {
    read:   { x: 24,  y: 70,  face: -1, text: ['📖', 'ふむふむ', 'この本、面白い'] },
    window: { x: 96,  y: 68,  face: 1,  text: ['星がきれい', '塔の上はどうなってるんだろう', '☆'] },
    fire:   { x: 132, y: 70,  face: 1,  text: ['あったかい…', '🔥', 'ふう…'] },
    table1: { x: 72,  y: 92,  face: 1,  text: ['いただきます', '☕', 'おいしい'] },
    table2: { x: 120, y: 92,  face: -1, text: ['ごちそうさま', '☕', 'もう一杯'] },
    train:  { x: 156, y: 104, face: 1,  text: ['はっ！', 'せいっ！', 'もっと強く…'], train: true },
    bed1:   { x: 20,  y: 116, face: 1,  text: ['Zzz…', 'むにゃ…'], sleep: true },
    bed2:   { x: 20,  y: 138, face: 1,  text: ['Zzz…', 'すやすや'], sleep: true },
  };
  const MEMORIAL = { x: 170, y: 140, face: -1 };

  let canvas, ctx, layer, bgCanvas, k = 1;
  let heroes = [];                 // { id, x, y, tx, ty, state, timer, face, spot, frameT, bubble }
  let opts = null;
  let raf = 0, last = 0, running = false;
  let t = 0;
  let chatTimer = 4;
  let bgKey = '';

  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ---------- 背景（家具）を描く ----------
  function px(c, x, y, w, h, col) { c.fillStyle = col; c.fillRect(x, y, w, h); }

  function drawBackground(fallenCount) {
    const b = document.createElement('canvas');
    b.width = W; b.height = H;
    const c = b.getContext('2d');
    // 壁（石のレンガ）
    px(c, 0, 0, W, FLOOR_TOP, '#3e3152');
    for (let y = 0; y < 52; y += 6) {
      const off = (y / 6) % 2 ? 6 : 0;
      for (let x = -12 + off; x < W; x += 12) { px(c, x, y, 1, 6, '#33284a'); }
      px(c, 0, y, W, 1, '#33284a');
    }
    // 腰板
    px(c, 0, 52, W, 10, '#6a4a34');
    px(c, 0, 52, W, 1, '#8a6446');
    for (let x = 0; x < W; x += 16) px(c, x, 53, 1, 9, '#56402c');
    // 床（板）
    for (let y = FLOOR_TOP; y < H; y += 8) {
      px(c, 0, y, W, 8, (y / 8) % 2 ? '#7a5a3e' : '#735438');
      px(c, 0, y, W, 1, '#5e4430');
      const off = ((y - FLOOR_TOP) / 8) % 3 * 21;
      for (let x = off; x < W; x += 64) px(c, x, y, 1, 8, '#5e4430');
    }
    // じゅうたん
    px(c, 56, 84, 80, 34, '#8a2e3a');
    px(c, 58, 86, 76, 30, '#a83a48');
    for (let x = 60; x < 132; x += 6) { px(c, x, 87, 2, 1, '#e0b84a'); px(c, x, 114, 2, 1, '#e0b84a'); }
    // 本棚
    px(c, 6, 10, 34, 50, '#5a3a24');
    px(c, 8, 12, 30, 46, '#3a2416');
    const books = ['#c84a4a', '#4a8ac8', '#e0b84a', '#6ab86a', '#9a6ad8', '#e8e2cf', '#d87a3a'];
    for (let row = 0; row < 4; row++) {
      const y = 13 + row * 11;
      px(c, 8, y + 10, 30, 1, '#5a3a24');
      let x = 9;
      while (x < 36) {
        const w = 2 + Math.floor((x * 7 + row * 3) % 3);
        const hgt = 7 + ((x + row) % 3);
        px(c, x, y + 10 - hgt, w, hgt, books[(x + row * 2) % books.length]);
        x += w + ((x + row) % 4 === 0 ? 2 : 0);
      }
    }
    // 窓（外は夜空と塔）
    px(c, 76, 6, 40, 38, '#6a4a34');
    const grd = c.createLinearGradient(0, 8, 0, 42);
    grd.addColorStop(0, '#120e2e'); grd.addColorStop(1, '#3a2a72');
    c.fillStyle = grd; c.fillRect(78, 8, 36, 34);
    // 塔のかげ
    px(c, 92, 16, 8, 26, '#0c0a1c');
    px(c, 90, 14, 12, 3, '#0c0a1c');
    px(c, 94, 10, 4, 4, '#0c0a1c');
    px(c, 95, 20, 2, 2, '#ffd97a'); px(c, 95, 28, 2, 2, '#c8a050'); px(c, 95, 35, 2, 2, '#c8a050');
    // 窓枠
    px(c, 95, 8, 2, 34, '#6a4a34'); px(c, 78, 24, 36, 2, '#6a4a34');
    px(c, 74, 44, 44, 3, '#8a6446');
    // 暖炉
    px(c, 120, 24, 30, 38, '#6a6470');
    for (let y = 26; y < 60; y += 5) for (let x = 120 + ((y / 5) % 2) * 4; x < 150; x += 8) px(c, x, y, 1, 4, '#56505c');
    px(c, 118, 22, 34, 4, '#8a8490');
    px(c, 126, 40, 18, 22, '#1a1414');
    // 扉（塔へ）
    px(c, 156, 16, 30, 46, '#3a2a1c');
    px(c, 158, 18, 26, 44, '#7a4e2e');
    px(c, 160, 16, 22, 2, '#3a2a1c');
    for (let x = 163; x < 182; x += 6) px(c, x, 20, 1, 42, '#6a4226');
    px(c, 179, 40, 2, 3, '#e0b84a');
    // 鉢植え
    px(c, 46, 54, 8, 8, '#a8603a'); px(c, 45, 46, 10, 8, '#4a9a4a'); px(c, 48, 42, 4, 5, '#5ab85a');
    // テーブルといす
    px(c, 80, 78, 32, 4, '#8a5a34'); px(c, 80, 82, 32, 2, '#5e3b1f');
    px(c, 82, 84, 3, 10, '#5e3b1f'); px(c, 107, 84, 3, 10, '#5e3b1f');
    px(c, 88, 75, 4, 3, '#e8e2cf'); px(c, 100, 75, 4, 3, '#e8e2cf'); px(c, 94, 74, 4, 4, '#d8a040');
    px(c, 66, 88, 10, 3, '#8a5a34'); px(c, 67, 91, 2, 6, '#5e3b1f'); px(c, 73, 91, 2, 6, '#5e3b1f');
    px(c, 116, 88, 10, 3, '#8a5a34'); px(c, 117, 91, 2, 6, '#5e3b1f'); px(c, 123, 91, 2, 6, '#5e3b1f');
    // ベッド
    for (const by of [102, 124]) {
      px(c, 4, by, 30, 16, '#5e3b1f');
      px(c, 6, by + 2, 26, 12, '#e8e2f0');
      px(c, 6, by + 2, 8, 6, '#ffffff');
      px(c, 14, by + 4, 18, 10, by === 102 ? '#4a6ac8' : '#c84a6a');
    }
    // 訓練用の人形
    px(c, 172, 84, 2, 24, '#5e3b1f');
    px(c, 166, 88, 14, 3, '#5e3b1f');
    px(c, 168, 90, 10, 12, '#d8b870');
    px(c, 169, 80, 8, 9, '#d8b870');
    px(c, 171, 83, 1, 1, '#3a2a1a'); px(c, 174, 83, 1, 1, '#3a2a1a');
    px(c, 168, 106, 10, 3, '#6a6470');
    // 慰霊碑（倒れた英雄がいるとき）
    if (fallenCount > 0) {
      px(c, 164, 122, 16, 16, '#8a8a96');
      px(c, 166, 120, 12, 2, '#8a8a96');
      px(c, 162, 136, 20, 4, '#6a6a74');
      px(c, 168, 126, 8, 1, '#5a5a66'); px(c, 168, 129, 8, 1, '#5a5a66'); px(c, 168, 132, 6, 1, '#5a5a66');
      px(c, 162, 133, 3, 3, '#f0d0e0'); px(c, 180, 133, 3, 3, '#f0f0a0');
    }
    return b;
  }

  // ---------- 動くもの ----------
  function drawDynamic(c) {
    // 窓の星のまたたき
    const stars = [[81, 11], [86, 18], [108, 12], [111, 30], [84, 33], [104, 21], [89, 38]];
    stars.forEach(([x, y], i) => {
      const a = (Math.sin(t * 2 + i * 1.7) + 1) / 2;
      px(c, x, y, 1, 1, a > 0.5 ? '#ffffff' : '#8a84c8');
    });
    // 塔のてっぺんの光
    const g = (Math.sin(t * 3) + 1) / 2;
    px(c, 95, 11, 2, 2, g > 0.5 ? '#ffe9a8' : '#c8a050');
    // 暖炉の火
    const f = Math.floor(t * 8) % 3;
    px(c, 128, 52 - f, 14, 10 + f, '#c83a1a');
    px(c, 130 + f, 50 - f, 10 - f, 10, '#f07a2a');
    px(c, 133, 54 - (f % 2) * 2, 5, 6, '#ffd060');
    // 扉の星の紋章
    const r = (Math.sin(t * 2) + 1) / 2;
    const rc = r > 0.6 ? '#ffe9a8' : r > 0.3 ? '#e0b84a' : '#a07a30';
    px(c, 170, 28, 2, 6, rc); px(c, 168, 30, 6, 2, rc);
  }

  function drawHero(c, h) {
    const walking = h.state === 'walk';
    const frame = walking && Math.floor(h.frameT * 6) % 2 === 1 ? 1 : 0;
    const spr = S.heroCanvas(h.id, frame);
    const bob = !walking && Math.floor((t + h.phase) * 1.6) % 2 === 1 ? 1 : 0;
    const trainBob = h.state === 'act' && h.spot && SPOTS[h.spot] && SPOTS[h.spot].train ? (Math.floor(t * 6) % 2) : 0;
    const x = Math.round(h.x - spr.width / 2);
    const y = Math.round(h.y - spr.height + bob - trainBob);
    // かげ
    c.fillStyle = 'rgba(0,0,0,0.28)';
    c.fillRect(Math.round(h.x) - 6, Math.round(h.y) - 1, 12, 2);
    c.save();
    if (h.face < 0) {
      c.translate(x + spr.width, y);
      c.scale(-1, 1);
      c.drawImage(spr, 0, 0);
    } else {
      c.drawImage(spr, x, y);
    }
    c.restore();
    // 眠っているときは毛布をかける
    if (h.state === 'act' && h.spot && SPOTS[h.spot].sleep) {
      c.fillStyle = h.spot === 'bed1' ? '#4a6ac8' : '#c84a6a';
      c.fillRect(x + 1, y + 13, spr.width - 2, spr.height - 13);
    }
    if (h.selected) {
      c.fillStyle = '#ffe27a';
      c.fillRect(Math.round(h.x) - 1, y - 4, 3, 2);
    }
  }

  // ---------- 英雄の動き ----------
  function heroInfo(id) { return opts.getHeroes().find(x => x.id === id); }

  function say(h, text, ms) {
    if (!layer || !text) return;
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
    h.bubble.style.left = (h.x * s) + 'px';
    h.bubble.style.top = ((h.y - S.HH - 2) * s) + 'px';
  }

  function idleLine(h) {
    const info = heroInfo(h.id);
    if (!info) return null;
    const fallen = opts.recentFallen();
    if (fallen.length && Math.random() < 0.35) return pick(D.GRIEF_LINES).replace('{name}', pick(fallen));
    if (info.trust < 30 && Math.random() < 0.4) return pick(['…', 'マスターなんて信じられない', '次は誰が倒れるんだろう']);
    return pick(D.ROOM_LINES[D.heroById[h.id].pers]);
  }

  function freeSpot() {
    const used = new Set(heroes.map(h => h.spot).filter(Boolean));
    const keys = Object.keys(SPOTS).filter(k => !used.has(k));
    return keys.length ? pick(keys) : null;
  }

  function goTo(h, x, y, spot) {
    h.tx = Math.max(10, Math.min(W - 10, x));
    h.ty = Math.max(FLOOR_TOP + 6, Math.min(H - 4, y));
    h.state = 'walk';
    h.spot = spot || null;
    h.face = h.tx < h.x ? -1 : 1;
  }

  function decide(h) {
    const r = Math.random();
    const fallen = opts.fallenCount();
    if (fallen > 0 && r < 0.08 && !heroes.some(o => o.spot === 'memorial')) {
      goTo(h, MEMORIAL.x - 14, MEMORIAL.y, 'memorial');
      return;
    }
    if (r < 0.55) {
      const s = freeSpot();
      if (s) { goTo(h, SPOTS[s].x, SPOTS[s].y, s); return; }
    }
    goTo(h, rnd(40, 150), rnd(FLOOR_TOP + 10, H - 10), null);
  }

  function arrive(h) {
    h.state = h.spot ? 'act' : 'idle';
    h.timer = h.spot ? rnd(5, 10) : rnd(2, 5);
    if (h.spot === 'memorial') {
      h.face = 1;
      const names = opts.recentFallen();
      say(h, names.length ? pick(names) + '…安らかに' : '…安らかに', 3200);
    } else if (h.spot && SPOTS[h.spot]) {
      h.face = SPOTS[h.spot].face;
      if (Math.random() < 0.6) say(h, pick(SPOTS[h.spot].text), 2400);
    } else if (Math.random() < 0.3) {
      say(h, idleLine(h), 2600);
    }
  }

  function startChat() {
    const free = heroes.filter(h => h.state === 'idle');
    if (free.length < 2) return;
    const a = pick(free);
    const b = pick(free.filter(x => x !== a));
    const [la, lb] = pick(D.CHATS);
    const side = b.x > 100 ? -1 : 1;
    goTo(a, b.x + side * 16, b.y, null);
    a.onArrive = () => {
      a.face = b.x > a.x ? 1 : -1;
      b.face = a.x > b.x ? 1 : -1;
      b.state = 'idle'; b.timer = 5;
      a.timer = 5;
      say(a, la, 2400);
      setTimeout(() => { if (running && heroes.includes(b)) say(b, lb, 2400); }, 1300);
    };
  }

  function update(dt) {
    t += dt;
    chatTimer -= dt;
    if (chatTimer <= 0) { chatTimer = rnd(6, 11); startChat(); }
    for (const h of heroes) {
      h.frameT += dt;
      if (h.state === 'walk') {
        const dx = h.tx - h.x, dy = h.ty - h.y;
        const d = Math.hypot(dx, dy);
        const step = 18 * dt;
        if (d <= step) {
          h.x = h.tx; h.y = h.ty;
          if (h.onArrive) { const f = h.onArrive; h.onArrive = null; h.state = 'idle'; f(); } else arrive(h);
        } else {
          h.x += dx / d * step; h.y += dy / d * step;
          h.face = dx < 0 ? -1 : 1;
        }
      } else {
        h.timer -= dt;
        if (h.timer <= 0) { decide(h); }
      }
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
    heroes.slice().sort((a, b) => a.y - b.y).forEach(h => drawHero(c, h));
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
  }

  function syncHeroes() {
    const list = opts.getHeroes();
    const ids = list.map(x => x.id);
    heroes = heroes.filter(h => {
      if (ids.includes(h.id)) return true;
      if (h.bubble) h.bubble.remove();
      return false;
    });
    for (const info of list) {
      if (heroes.some(h => h.id === info.id)) continue;
      // 新しい英雄は扉から入ってくる
      const h = { id: info.id, x: 170, y: 70, tx: 170, ty: 70, state: 'idle', timer: rnd(0.2, 2), face: -1, spot: null, frameT: 0, phase: Math.random() * 3 };
      if (heroes.length < list.length && last > 0) say(h, 'よろしく！', 2000);
      heroes.push(h);
    }
    const key = String(opts.fallenCount());
    if (key !== bgKey) { bgKey = key; bgCanvas = drawBackground(opts.fallenCount()); }
  }

  function heroAt(lx, ly) {
    const sorted = heroes.slice().sort((a, b) => b.y - a.y);
    return sorted.find(h => lx >= h.x - 9 && lx <= h.x + 9 && ly >= h.y - S.HH && ly <= h.y + 2) || null;
  }

  function onTap(e) {
    const rect = canvas.getBoundingClientRect();
    const lx = (e.clientX - rect.left) / rect.width * W;
    const ly = (e.clientY - rect.top) / rect.height * H;
    const h = heroAt(lx, ly);
    if (h) {
      heroes.forEach(o => { o.selected = o === h; });
      h.state = 'idle'; h.timer = 4; h.onArrive = null;
      opts.onHero(h.id);
      return;
    }
    if (lx >= 156 && lx <= 186 && ly >= 16 && ly <= 62) opts.onDoor();
  }

  const Room = {
    /** container の中に部屋を作る */
    mount(container, options) {
      opts = options;
      container.innerHTML = '';
      const wrap = document.createElement('div');
      wrap.className = 'room-wrap';
      canvas = document.createElement('canvas');
      canvas.className = 'room-canvas';
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', '待機室。英雄たちが暮らしている。英雄をタップすると話しかけられる。右の扉から塔へ行ける。');
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
    debug() { return heroes.map(h => ({ id: h.id, x: Math.round(h.x), y: Math.round(h.y), state: h.state, spot: h.spot })); },
    /** テスト用: 指定した英雄の画面上の位置（タップ用） */
    screenPos(id) {
      const h = heroes.find(x => x.id === id);
      if (!h || !canvas) return null;
      const r = canvas.getBoundingClientRect();
      return { x: r.left + h.x / W * r.width, y: r.top + (h.y - 10) / H * r.height };
    },
    W, H,
  };

  root.addEventListener('resize', () => Room.resize());
  root.Room = Room;
})(window);
