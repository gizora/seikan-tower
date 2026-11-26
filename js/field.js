/* 星喚の塔 — 戦闘の映像（マスターが見ている塔の中の様子） */
(function (root) {
  'use strict';
  const D = root.GameData;
  const S = root.Sprites;
  const W = 320, H = 180;

  // 区域ごとの地面と空の色
  const THEMES = [
    ['#2a4a3a', '#4a6a3a', '#3a5a32'], ['#2a2234', '#4a4250', '#3a3442'], ['#3a4a6a', '#c8d8e8', '#a8b8d0'],
    ['#3a2a1a', '#6a5a3a', '#5a4a2a'], ['#1a1428', '#3a3048', '#2a2238'], ['#3a1410', '#6a3020', '#5a2418'],
    ['#0e2a3a', '#2a5a6a', '#1e4a5a'], ['#6a8ab0', '#d8dce8', '#b8c0d4'], ['#100c24', '#3a3060', '#2a2448'], ['#140a1e', '#4a2a4a', '#2e1a34'],
  ];

  let canvas, ctx, buf, bctx, k = 1;
  let battle = null, zone = 0, opts = null;
  let anim = {};                 // uid → { lunge, shake, flash, until... }
  let floats = [];               // { x, y, text, col, t }
  let raf = 0, running = false, last = 0, t = 0;
  let targeting = false, picked = null;
  let bg = null;

  const px = (c, x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };

  function drawBg() {
    const b = document.createElement('canvas');
    b.width = W; b.height = H;
    const c = b.getContext('2d');
    const th = THEMES[zone] || THEMES[0];
    const g = c.createLinearGradient(0, 0, 0, 70);
    g.addColorStop(0, '#0a0814'); g.addColorStop(1, th[0]);
    c.fillStyle = g; c.fillRect(0, 0, W, 70);
    // 遠くの柱（塔の中）
    for (let x = 10; x < W; x += 52) { px(c, x, 14, 10, 56, 'rgba(0,0,0,0.25)'); px(c, x - 2, 12, 14, 3, 'rgba(255,255,255,0.06)'); }
    // 床
    c.fillStyle = th[1]; c.fillRect(0, 70, W, H - 70);
    for (let y = 74; y < H; y += 9) px(c, 0, y, W, 1, th[2]);
    for (let i = 0; i < 90; i++) px(c, (i * 73) % W, 72 + (i * 37) % (H - 72), 2, 1, th[2]);
    px(c, 0, 70, W, 2, 'rgba(0,0,0,0.3)');
    return b;
  }

  // ---------- 並び方 ----------
  function heroPos(u) {
    const front = battle.heroes.filter(h => h.row === 'front');
    const back = battle.heroes.filter(h => h.row !== 'front');
    const list = u.row === 'front' ? front : back;
    const i = list.indexOf(u), n = list.length;
    const y = 100 + (n === 1 ? 35 : i * (70 / (n - 1)));
    return { x: (u.row === 'front' ? 112 : 62) - (i % 2) * 6, y: Math.round(y) };
  }
  function enemyPos(u) {
    const list = battle.enemies;
    const i = list.indexOf(u), n = list.length;
    const col = i % 2;
    const y = 104 + (n === 1 ? 32 : i * (66 / Math.max(1, n - 1)));
    return { x: 214 + col * 40 + (u.boss ? 10 : 0), y: Math.round(y) };
  }
  function posOf(u) { return u.side === 'hero' ? heroPos(u) : enemyPos(u); }
  function sprOf(u) { return u.side === 'hero' ? S.heroCanvas(u.heroId, 0) : S.enemyCanvas(u.key); }
  function scaleOf(u) { if (u.side === 'hero') return 1; const human = D.ENEMIES[u.key].sprite === 'human'; return human ? (u.boss ? 1.25 : 1) : (u.boss ? 3.5 : 2.5); }
  function boxOf(u) {
    const p = posOf(u), spr = sprOf(u), s = scaleOf(u);
    const w = spr.width * s, h = spr.height * s;
    return { x: p.x - w / 2, y: p.y - h, w, h };
  }

  // ---------- 描く ----------
  function miniIcon(c, ch, x, y) {
    c.font = '9px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'bottom';
    c.fillText(ch, x, y);
  }
  function drawUnit(c, u) {
    const a = anim[u.id] || {};
    const p = posOf(u);
    const spr = sprOf(u);
    const s = scaleOf(u);
    const w = Math.round(spr.width * s), h = Math.round(spr.height * s);
    let dx = 0, dy = 0;
    if (a.lunge && t < a.lunge.until) { const f = 1 - Math.abs((a.lunge.until - t) / a.lunge.dur * 2 - 1); dx += a.lunge.dx * f; dy += a.lunge.dy * f; }
    if (a.shake && t < a.shake) dx += (Math.floor(t * 40) % 2 ? 2 : -2);
    if (u.side === 'hero' && u.alive && u.fear > 0) dx += (Math.floor(t * 18) % 2 ? 1 : 0);
    const slacking = u.side === 'hero' && u.alive && u.action === 'slack';
    if (slacking) dy += 3;
    // かげ
    px(c, p.x - w / 3, p.y - 1, Math.round(w * 2 / 3), 3, 'rgba(0,0,0,0.3)');
    c.save();
    if (!u.alive) {
      c.globalAlpha = 0.45;
      c.translate(p.x, p.y - 6);
      c.rotate(u.side === 'hero' ? -Math.PI / 2 : Math.PI / 2);
      c.drawImage(spr, -w / 2, -h / 2, w, h);
      c.restore();
      return;
    }
    if (u.side === 'enemy' && !u.flipFix) { /* 敵はそのまま（左向き） */ }
    c.drawImage(spr, Math.round(p.x - w / 2 + dx), Math.round(p.y - h + dy), w, h);
    if (a.flash && t < a.flash) { c.globalAlpha = 0.6; c.globalCompositeOperation = 'source-atop'; }
    c.restore();
    if (a.flash && t < a.flash) px(c, p.x - w / 2 + dx, p.y - h + dy, w, h, a.flashCol || 'rgba(255,255,255,0.35)');
    // 頭の上: HP（敵）・状態のアイコン
    const top = p.y - h + dy - 2;
    if (u.side === 'enemy') {
      const r = u.hp / u.maxHp;
      px(c, p.x - 12, top - 3, 24, 3, '#1a0a10');
      px(c, p.x - 12, top - 3, Math.max(0, Math.round(24 * r)), 3, r < 0.3 ? '#f0575a' : '#e0804a');
      if (u.shield > 0) px(c, p.x - 12, top - 5, Math.round(24 * u.shield / u.maxShield), 1, '#b08aff');
      if (targeting) { c.strokeStyle = Math.floor(t * 4) % 2 ? '#ffe27a' : '#c8912a'; c.lineWidth = 1; c.strokeRect(Math.round(p.x - w / 2) - 1.5, Math.round(p.y - h) - 1.5, w + 3, h + 3); }
      if (battle.heroes.some(hh => hh.alive && hh.order && hh.order.type === 'target' && hh.order.targetId === u.id)) miniIcon(c, '🎯', p.x + 14, top + 2);
    } else {
      const r = u.hp / u.maxHp;
      px(c, p.x - 9, top - 2, 18, 2, '#0a1a10');
      px(c, p.x - 9, top - 2, Math.max(0, Math.round(18 * r)), 2, r < 0.25 ? '#f0575a' : r < 0.5 ? '#f0b13c' : '#4cd486');
      let ic = '';
      if (slacking) ic += '💤';
      if (u.fear > 0) ic += '😨';
      if (u.bleed > 0) ic += '🩸';
      if (u.guard) ic += '🛡';
      if (u.order) ic += '📣';
      if (ic) miniIcon(c, ic, p.x, top - 3);
      if (picked === u.id) { px(c, p.x - 10, p.y + 2, 20, 1, '#ffe27a'); }
    }
  }

  function render() {
    if (!battle) return;
    bctx.imageSmoothingEnabled = false;
    bctx.drawImage(bg, 0, 0);
    const units = battle.heroes.concat(battle.enemies).slice().sort((a, b) => posOf(a).y - posOf(b).y);
    units.filter(u => !u.alive).forEach(u => drawUnit(bctx, u));
    units.filter(u => u.alive).forEach(u => drawUnit(bctx, u));
    // 数字
    bctx.textAlign = 'center'; bctx.textBaseline = 'middle';
    floats = floats.filter(f => t - f.t < 0.9);
    for (const f of floats) {
      const a = (t - f.t) / 0.9;
      bctx.globalAlpha = 1 - a * a;
      bctx.font = `bold ${f.big ? 12 : 10}px sans-serif`;
      bctx.fillStyle = '#000';
      bctx.fillText(f.text, f.x + 1, f.y - a * 16 + 1);
      bctx.fillStyle = f.col;
      bctx.fillText(f.text, f.x, f.y - a * 16);
      bctx.globalAlpha = 1;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W * k, H * k);
  }

  function loop(now) {
    if (!running) return;
    t += Math.min(0.1, (now - last) / 1000);
    last = now;
    render();
    raf = requestAnimationFrame(loop);
  }

  function addFloat(u, text, col, big) {
    const b = boxOf(u);
    floats.push({ x: b.x + b.w / 2 + (Math.random() * 10 - 5), y: b.y + 8, text, col, t, big });
  }

  const Field = {
    mount(el, options) {
      canvas = el;
      opts = options || {};
      ctx = canvas.getContext('2d');
      buf = document.createElement('canvas'); buf.width = W; buf.height = H;
      bctx = buf.getContext('2d');
      canvas.addEventListener('click', (e) => {
        if (!battle) return;
        const r = canvas.getBoundingClientRect();
        const lx = (e.clientX - r.left) / r.width * W, ly = (e.clientY - r.top) / r.height * H;
        const units = battle.heroes.concat(battle.enemies).filter(u => u.alive).sort((a, b) => posOf(b).y - posOf(a).y);
        const hit = units.find(u => { const bx = boxOf(u); return lx >= bx.x - 3 && lx <= bx.x + bx.w + 3 && ly >= bx.y - 3 && ly <= bx.y + bx.h + 3; });
        if (hit && opts.onTap) opts.onTap(hit.id);
      });
    },
    load(b, zoneIndex) {
      battle = b; zone = zoneIndex || 0; anim = {}; floats = []; targeting = false; picked = null;
      bg = drawBg();
      this.resize();
    },
    resize() {
      if (!canvas) return;
      const cssW = canvas.clientWidth || W * 2;
      const dpr = root.devicePixelRatio || 1;
      k = Math.max(1, Math.ceil(cssW * dpr / W));
      canvas.width = W * k; canvas.height = H * k;
      if (battle && bg) render();
    },
    start() { if (running || !canvas) return; running = true; last = performance.now(); raf = requestAnimationFrame(loop); },
    stop() { running = false; cancelAnimationFrame(raf); },
    setTargeting(on) { targeting = !!on; },
    setPicked(uid) { picked = uid; },
    /** 出来事に合わせて動かす */
    play(ev, speed) {
      if (!battle || !ev) return;
      const dur = 0.42 / (speed || 1);
      if (ev.type === 'act') {
        const actor = battle.unitById(ev.actor);
        const first = (ev.hits || [])[0];
        const target = first && !first.heal ? battle.unitById(first.id) : null;
        if (actor && target && actor.alive && (ev.kind === 'attack' || ev.kind === 'skill')) {
          const pa = posOf(actor), pt = posOf(target);
          const dx = (pt.x - pa.x) * (actor.side === 'hero' && actor.row !== 'front' && actor.cls !== 'swordsman' ? 0.15 : 0.45);
          anim[actor.id] = Object.assign(anim[actor.id] || {}, { lunge: { dx, dy: (pt.y - pa.y) * 0.3, until: t + dur, dur } });
        }
        if (ev.kind === 'skill' && actor) { anim[actor.id] = Object.assign(anim[actor.id] || {}, { flash: t + 0.25, flashCol: 'rgba(255,230,140,0.45)' }); }
        setTimeout(() => {
          for (const h of ev.hits || []) {
            const u = battle && battle.unitById(h.id);
            if (!u) continue;
            if (h.heal) { addFloat(u, '+' + h.amount, '#6af0a4'); continue; }
            addFloat(u, String(h.amount), h.bleed ? '#ff6a6a' : h.crit ? '#ffd14a' : '#ffffff', h.crit);
            anim[u.id] = Object.assign(anim[u.id] || {}, { shake: t + 0.25, flash: t + 0.15, flashCol: 'rgba(255,80,80,0.4)' });
            if (h.counter) { const cu = battle.unitById(h.counter.id); if (cu) addFloat(cu, String(h.counter.amount), '#ffffff'); }
          }
          for (const n of ev.notes || []) { if (n.heal) { const u = battle && battle.unitById(n.unit); if (u) addFloat(u, '+' + n.heal, '#6af0a4'); } }
        }, Math.round(dur * 500));
        if (actor && actor.side === 'hero' && actor.bleedTick) addFloat(actor, String(actor.bleedTick), '#ff6a6a');
      }
      if (ev.type === 'wave') for (const h of ev.healed || []) { const u = battle.unitById(h.id); if (u) addFloat(u, '+' + h.amount, '#6af0a4'); }
    },
    /** テスト用: その部隊の画面上の位置 */
    screenPos(uid) {
      if (!battle || !canvas) return null;
      const u = battle.unitById(uid);
      if (!u) return null;
      const b = boxOf(u), r = canvas.getBoundingClientRect();
      return { x: r.left + (b.x + b.w / 2) / W * r.width, y: r.top + (b.y + b.h / 2) / H * r.height };
    },
    W, H,
  };
  root.addEventListener('resize', () => Field.resize());
  root.Field = Field;
})(window);
