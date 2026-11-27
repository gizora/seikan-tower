/* 星喚の塔 — 画面（待機室だけを映す。建物や英雄をタップして、それぞれの機能に入る） */
(function () {
  'use strict';
  const D = window.GameData;
  const E = window.BattleEngine;
  const SP = window.Sprites;
  const Room = window.Room;
  const Field = window.Field;
  const { Game, expToNext, floorGold, firstClearGems, firstClearShards, repeatShards, traitSlots, isBossFloor } = window.GameCore;

  // ---------- 小さな道具 ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n).toLocaleString('ja-JP');
  const S = () => Game.state;
  const nameOf = (id) => D.heroById[id].name;
  const pct = (v) => Math.round(v * 1000) / 10;
  const traitText = (t) => { const d = D.TRAITS[t.id], v = d.vals[t.lv - 1]; return d.desc.replace('{p}', Math.round(v * 100)).replace('{v}', v); };
  const traitChip = (t) => `<span class="trait" title="${esc(traitText(t))}">${esc(D.TRAITS[t.id].name)}<b>${['Ⅰ', 'Ⅱ', 'Ⅲ'][t.lv - 1]}</b></span>`;
  const ACT_NAME = { train: '訓練中', social: '広場で過ごしている', rest: '休んでいる', wander: '歩き回っている' };

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  let lastWallet = {};
  function renderWallet() {
    for (const k of ['gems', 'gold', 'shards']) {
      const el = $('#' + k);
      el.textContent = num(S()[k]);
      if (lastWallet[k] != null && lastWallet[k] !== S()[k]) { const c = el.parentElement; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
      lastWallet[k] = S()[k];
    }
    $('#world-name').textContent = S().base.name;
  }

  // ---------- モーダル（パネル） ----------
  let modalReturnFocus = null, modalOnClose = null, modalBack = null;
  function openModal(html, opts) {
    opts = opts || {};
    const m = $('#modal');
    if (m.hidden) modalReturnFocus = document.activeElement;
    modalBack = opts.back || null;
    $('#modal-body').innerHTML = (modalBack ? '<button type="button" class="back" data-action="back" aria-label="戻る">‹ 戻る</button>' : '') + html;
    m.hidden = false;
    m.dataset.locked = opts.locked ? '1' : '';
    modalOnClose = opts.onClose || null;
    const target = (opts.focus && $(opts.focus, m)) || $('.btn-gold:not(:disabled), button:not(:disabled)', m);
    if (target) target.focus({ preventScroll: true });
    $('.modal-card', m).scrollTop = 0;
  }
  function closeModal() {
    const m = $('#modal');
    if (m.hidden) return;
    m.hidden = true;
    $('#modal-body').innerHTML = '';
    const cb = modalOnClose;
    modalOnClose = null; modalBack = null;
    if (cb) cb();
    Room.clearSelection();
    if (modalReturnFocus && document.body.contains(modalReturnFocus) && !modalReturnFocus.closest('[hidden]')) modalReturnFocus.focus({ preventScroll: true });
    modalReturnFocus = null;
  }
  const close = '<div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>';

  function faceHTML(id, extra) {
    if (!id) return `<span class="face empty ${extra || ''}" aria-hidden="true"></span>`;
    const h = Game.owned(id);
    return `<span class="face r${h ? h.star : 1} ${extra || ''}" aria-hidden="true">${SP.faceImg(id)}</span>`;
  }

  // ---------- 待機室 ----------
  function quarrelOf(id) {
    const q = S().quarrels.find(x => x.a === id || x.b === id);
    return q ? (q.a === id ? q.b : q.a) : null;
  }
  function mountRoom() {
    Room.mount($('#scene'), {
      getHeroes: () => Object.keys(S().heroes).map(id => ({ id, activity: S().heroes[id].activity, injured: S().heroes[id].injured > 0, proposal: S().proposals.some(p => p.heroId === id), quarrel: quarrelOf(id) })),
      getBuildings: () => D.BUILDING_ORDER.map(key => ({ key, lv: Game.buildingLv(key) })),
      fallenCount: () => S().fallen.length,
      onHero: (id) => heroDetail(id),
      onBuilding: (key) => buildingModal(key),
      onMemorial: () => memorialModal(),
    });
  }
  function renderNotices() {
    const s = S();
    const list = [];
    for (const q of s.quarrels) list.push(`<button type="button" class="notice quarrel" data-action="quarrel" data-qid="${q.id}">${faceHTML(q.a)}${faceHTML(q.b)}<span>${esc(nameOf(q.a))}と${esc(nameOf(q.b))}が喧嘩しています</span></button>`);
    if (s.proposals.length) list.push(`<button type="button" class="notice prop" data-action="building" data-key="plaza"><span class="badge">${s.proposals.length}</span><span>提案があります</span></button>`);
    const inj = Object.keys(s.heroes).filter(id => s.heroes[id].injured > 0);
    if (inj.length) list.push(`<span class="notice inj"><span>けが ${inj.map(nameOf).map(esc).join('・')}</span></span>`);
    $('#notices').innerHTML = list.join('');
  }
  function refreshHome() { renderWallet(); renderNotices(); Room.refresh(); }

  // 喧嘩の仲裁
  function quarrelModal(qid) {
    const q = S().quarrels.find(x => x.id === qid);
    if (!q) { renderNotices(); return; }
    const r = Game.rel(q.a, q.b);
    const left = q.at ? Math.max(0, Math.ceil((D.QUARREL.timeoutMs - (Date.now() - q.at)) / 1000)) : null;
    openModal(`
      <h2 id="modal-title">喧嘩を仲裁する</h2>
      <div class="vs">${faceHTML(q.a, 'big')}<span>✕</span>${faceHTML(q.b, 'big')}</div>
      <p class="center">${esc(nameOf(q.a))}と${esc(nameOf(q.b))}が喧嘩しています</p>
      <p class="muted center">仲 ${r}${r <= D.QUARREL.murderLine ? '・殺し合いになりそうだ' : ''}${left != null ? `・あと${left}秒で手がつけられなくなる` : ''}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="mediate" data-qid="${qid}" data-side="a">${esc(nameOf(q.a))}の味方</button>
        <button type="button" class="btn" data-action="mediate" data-qid="${qid}" data-side="b">${esc(nameOf(q.b))}の味方</button>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="mediate" data-qid="${qid}" data-side="both">二人を叱る（仲直りさせる）</button></div>
      ${close}`);
  }

  // ---------- 施設 ----------
  function buildingEffect(key, lv) {
    if (lv <= 0) return '未建設';
    switch (key) {
      case 'gate': return `★3 ${Math.round(D.GATE_RATE3[lv] * 100)}%`;
      case 'dorm': return `${D.DORM_CAP[lv]}人`;
      case 'plaza': return `提案 ${Math.round(D.PLAZA_CHANCE[lv] * 100)}%・仲が深まる`;
      case 'training': return `訓練の効果 ×${(1 + 0.2 * (lv - 1)).toFixed(1)}`;
      case 'strategy': return `命令 ${D.CMD_COST[lv]}秒`;
      case 'fusion': return `費用 ×${D.FUSION_COST[lv]}`;
      case 'armory': return `${D.EQUIP_TIERS[lv].name}まで`;
      case 'alchemy': return `薬 ${D.POTION_CAP[lv]}個`;
      default: return '';
    }
  }
  function upgradeHTML(key) {
    const lv = Game.buildingLv(key);
    const info = Game.buildInfo(key);
    if (info.reason === 'max') return '<p class="muted center">レベル最大</p>';
    return `<div class="upgrade"><span>${esc(buildingEffect(key, lv))} → <b>${esc(buildingEffect(key, info.next))}</b></span>
      <button type="button" class="btn btn-small ${info.can ? 'btn-gold' : ''}" data-action="build" data-key="${key}" ${info.can ? '' : 'disabled'}>${lv ? 'Lv' + info.next : '建てる'}<small>${info.reason === 'floor' ? info.req + '階クリア' : '🪙' + num(info.cost)}</small></button></div>`;
  }

  function buildingModal(key, note) {
    const def = D.BUILDINGS[key];
    const lv = Game.buildingLv(key);
    let body = '';
    if (key === 'gate') body = `<div class="big-actions"><button type="button" class="btn btn-gold big" data-action="tower">🗼 塔へ</button><button type="button" class="btn big" data-action="gacha">🔮 召喚</button></div>`;
    else if (key === 'dorm') body = heroListHTML();
    else if (key === 'strategy') body = lv ? `<div class="big-actions"><button type="button" class="btn btn-gold big" data-action="party">📜 編成と作戦</button></div>` : `<div class="big-actions"><button type="button" class="btn big" data-action="party">📜 編成</button></div><p class="muted center">建てると細かい作戦が使える</p>`;
    else if (key === 'plaza') body = plazaHTML();
    else if (key === 'training') body = trainingHTML();
    else if (key === 'armory' && lv) body = `<h3>装備を作る</h3><div class="forge">${Object.keys(D.EQUIP_KINDS).map(kind => `<div class="frow"><span>${D.EQUIP_KINDS[kind].icon}</span>${[1, 2, 3, 4, 5].filter(tier => tier <= lv).map(tier =>
      `<button type="button" class="btn btn-small" data-action="forge" data-kind="${kind}" data-tier="${tier}" ${S().gold < D.EQUIP_TIERS[tier].cost ? 'disabled' : ''}>${D.EQUIP_TIERS[tier].name}<small>🪙${num(D.EQUIP_TIERS[tier].cost)}</small></button>`).join('')}</div>`).join('')}</div>
      <p class="muted">倉庫: ${S().items.length ? S().items.map(it => D.EQUIP_KINDS[it.kind].icon + D.EQUIP_TIERS[it.tier].name).join('・') : 'なし'}</p>`;
    else if (key === 'alchemy' && lv) body = `<h3>薬を作る <span class="muted">${Game.potionTotal()} / ${Game.potionCap()}</span></h3><div class="forge"><div class="frow">${Object.entries(D.POTIONS).map(([k, p]) =>
      `<button type="button" class="btn btn-small" data-action="brew" data-key="${k}" ${!Game.canBrew(k) || S().gold < p.cost || Game.potionTotal() >= Game.potionCap() ? 'disabled' : ''} title="${esc(p.desc)}">${p.icon}${esc(p.name)} ${S().potions[k]}<small>${Game.canBrew(k) ? '🪙' + p.cost : 'Lv' + p.lv}</small></button>`).join('')}</div></div><p class="muted">戦闘で英雄が自分で使う</p>`;
    else if (key === 'fusion' && lv) body = `<p class="muted">英雄の「送り出す」で特性を受け継がせる</p>`;
    openModal(`
      <h2 id="modal-title">${def.icon} ${esc(def.name)} <span class="muted">${lv ? 'Lv' + lv : '未建設'}</span></h2>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      ${body}
      ${upgradeHTML(key)}
      ${close}`);
  }

  function doBuild(key) {
    const r = Game.build(key);
    if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'floor' ? `${r.req}階クリアで解放` : '最大です'); return; }
    renderWallet();
    Room.refresh();
    modalOnClose = null;
    buildingModal(key, r.isNew ? '建てた' : 'Lv' + r.lv + ' になった');
  }

  function plazaHTML() {
    const s = S();
    const props = s.proposals.map(p => `<li>${faceHTML(p.heroId)}<span class="pt">${esc(Game.proposalText(p))}${p.data.cost ? ` <small>🪙${num(p.data.cost)}</small>` : ''}</span>
      <button type="button" class="btn btn-small btn-gold" data-action="prop-yes" data-pid="${p.id}" ${s.gold < (p.data.cost || 0) ? 'disabled' : ''}>受ける</button>
      <button type="button" class="btn btn-small" data-action="prop-no" data-pid="${p.id}">断る</button></li>`).join('');
    const quarrels = s.quarrels.map(q => `<li><button type="button" class="btn btn-small" data-action="quarrel" data-qid="${q.id}">${esc(nameOf(q.a))}と${esc(nameOf(q.b))}の喧嘩を仲裁する</button></li>`).join('');
    const bad = Game.badPairs().slice(0, 5).map(b => `<li>${faceHTML(b.a)}${faceHTML(b.b)}<span>${esc(nameOf(b.a))}・${esc(nameOf(b.b))}</span><b class="rel-bad">仲 ${b.rel}</b></li>`).join('');
    const log = s.log.slice(-6).reverse().map(l => `<li class="lg-${l.kind}">${esc(l.text)}</li>`).join('');
    return `${props ? `<h3>提案</h3><ul class="props">${props}</ul>` : '<p class="muted">提案はない</p>'}
      ${quarrels ? `<h3>喧嘩</h3><ul class="plain">${quarrels}</ul>` : ''}
      ${bad ? `<h3>仲の悪い英雄</h3><ul class="pairs">${bad}</ul><p class="muted">仲がとても悪いと、塔の中で裏切ることがある</p>` : ''}
      ${log ? `<h3>最近の出来事</h3><ul class="log-list">${log}</ul>` : ''}`;
  }

  function trainingHTML() {
    const ids = Game.ownedList();
    const rows = ids.map(id => {
      const h = Game.owned(id), tal = Game.talents(id);
      return `<li class="${h.activity === 'train' ? 'on' : ''}">${faceHTML(id)}<span class="tn">${esc(nameOf(id))}<small>${h.activity === 'train' ? '訓練中' : esc(ACT_NAME[h.activity] || '')}</small></span>
        ${D.STAT_KEYS.map(k => `<span class="tal t${tal[k]}" title="${D.STAT_NAMES[k]}: 才能 ${D.TALENT_NAMES[tal[k]]}・+${pct(h.bonus[k] || 0)}%（上限 ${pct(Game.bonusCap(id, k))}%）">${D.STAT_NAMES[k].slice(0, 1)}<b>${D.TALENT_NAMES[tal[k]]}</b><i>+${pct(h.bonus[k] || 0)}</i></span>`).join('')}</li>`;
    }).join('');
    return `<p class="muted">英雄は自分で訓練する。才能のない能力（—）は伸びない</p><ul class="train-list">${rows}</ul>`;
  }

  function memorialModal() {
    const list = S().fallen.slice().reverse();
    const cause = (f) => f.cause === 'murder' ? `${esc(f.by)}に殺された` : f.cause === 'betrayal' ? `${f.floor}階で${esc(f.by)}に裏切られた` : `${f.floor}階`;
    openModal(`<h2 id="modal-title">🪦 慰霊碑</h2>
      <ul class="memorial">${list.map(f => `<li>${SP.faceImg(f.id, 'mono')}<span><b>${esc(f.name)}</b> ★${f.star} Lv${f.lv}<br><small>${cause(f)}</small></span></li>`).join('')}</ul>${close}`);
  }

  // ---------- 塔（次元の門から） ----------
  let towerZone = null;
  function towerModal() {
    const s = S();
    const curZone = Math.min(9, Math.floor(s.cleared / D.FLOORS_PER_ZONE));
    if (towerZone === null || towerZone > curZone) towerZone = curZone;
    const z = D.ZONES[towerZone];
    const chips = D.ZONES.map((zz, i) => {
      const open = i <= curZone, done = Game.zoneCleared(i);
      return `<button type="button" class="zchip ${i === towerZone ? 'on' : ''} ${done ? 'done' : ''}" data-action="zone" data-z="${i}" ${open ? '' : 'disabled'} aria-pressed="${i === towerZone}">${i * 10 + 1}<small>${done ? '✓' : open ? '' : '🔒'}</small></button>`;
    }).join('');
    const floors = [];
    for (let k = 0; k < D.FLOORS_PER_ZONE; k++) {
      const i = towerZone * D.FLOORS_PER_ZONE + k;
      const cleared = i < s.cleared, current = i === s.cleared, locked = i > s.cleared;
      floors.push(`<button type="button" class="fl ${cleared ? 'cleared' : ''} ${current ? 'current' : ''} ${isBossFloor(i) ? 'boss' : ''}" data-action="floor" data-floor="${i}" ${locked ? 'disabled' : ''} aria-label="${i + 1}階">${i + 1}${isBossFloor(i) ? '<small>👑</small>' : cleared ? '<small>✓</small>' : ''}</button>`);
    }
    openModal(`
      <h2 id="modal-title">🗼 塔 <span class="muted">${s.cleared} / ${D.FLOORS.length}</span></h2>
      <div class="progress" aria-hidden="true"><i style="width:${s.cleared}%"></i></div>
      <p class="muted">${esc(z.name)}</p>
      <div class="zchips" role="group" aria-label="区域">${chips}</div>
      <div class="floors">${floors.reverse().join('')}</div>${close}`, { back: () => buildingModal('gate') });
  }
  function floorInfo(i) {
    const f = D.FLOORS[i];
    const enemies = [];
    for (const w of f.waves) for (const k of w) if (!enemies.includes(k)) enemies.push(k);
    const bossKey = enemies.find(k => D.ENEMIES[k].boss);
    const first = i >= S().cleared;
    const rm = Game.difficulty().reward;
    const ids = Game.partyIds();
    const injured = S().party.filter(id => id && Game.isInjured(id));
    openModal(`
      <h2 id="modal-title">${i + 1}階 <span class="muted">${esc(f.name)}</span></h2>
      <p class="muted">任務: ？？？（中で調べるとわかる）</p>
      <div class="enemy-row">${enemies.map(k => `<span class="enemy-chip">${SP.enemyImg(k)}<small>${esc(D.ENEMIES[k].name)}</small></span>`).join('')}</div>
      ${bossKey ? `<p class="note">👑 ${esc(D.ENEMIES[bossKey].trait)}</p>` : ''}
      <p class="rewards">Lv${f.lv}　🪙${num(Math.round(floorGold(i) * rm))}　✦${Math.round((first ? firstClearShards(i) : repeatShards(i)) * rm)}${first ? `　💎${Math.round(firstClearGems(i) * rm / 10) * 10}` : ''}</p>
      <div class="party-faces">${S().party.map(id => faceHTML(id, id && Game.isInjured(id) ? 'inj' : '')).join('')}<span class="power">${num(Game.partyPower())}</span></div>
      ${injured.length ? `<p class="muted">けがをしている ${injured.map(nameOf).map(esc).join('・')} は行けない</p>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="party">編成</button>
        <button type="button" class="btn btn-gold" data-action="start" data-floor="${i}" ${ids.length ? '' : 'disabled'}>挑戦</button>
      </div>`, { back: towerModal, focus: ids.length ? '[data-action="start"]' : '[data-action="party"]' });
  }

  // ---------- 召喚 ----------
  function gachaModal() {
    const s = S();
    const r = Game.gachaRates();
    openModal(`
      <h2 id="modal-title">🔮 召喚</h2>
      <div class="portal-card"><div class="portal" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="pull-row">
          <button type="button" class="btn" data-action="pull" data-n="1" ${s.gems < D.GACHA.cost1 ? 'disabled' : ''}>1回<small>💎${D.GACHA.cost1}</small></button>
          <button type="button" class="btn btn-gold" data-action="pull" data-n="10" ${s.gems < D.GACHA.cost10 ? 'disabled' : ''}>10回<small>💎${num(D.GACHA.cost10)}</small></button>
        </div>
        <p class="gacha-info">★3 ${Math.round(r[3] * 100)}%・天井まで ${Game.pityLeft()}・宿舎 ${Object.keys(s.heroes).length}/${Game.dormCap()}</p>
      </div>
      <p class="muted">呼ばれるのは、記憶をなくした${esc(s.base.name)}の人々。同じ英雄は二度と現れない。</p>
      ${Game.roomLeft() <= 0 ? '<p class="note">宿舎がいっぱい（新しい英雄は帰ってしまう）</p>' : ''}${close}`, { back: () => buildingModal('gate') });
  }
  function doPull(n) {
    const res = Game.pull(n);
    if (!res) { toast('召喚石が足りません'); return; }
    renderWallet();
    Room.refresh();
    const best = Math.max(...res.map(r => r.rarity));
    const cards = res.map((r, i) => {
      const tag = r.isNew ? (D.heroById[r.id] && D.heroById[r.id].special ? '<span class="tag sp">特別</span>' : '<span class="tag">NEW</span>') : `<span class="tag aw">帰還 ✦${r.shards}</span>`;
      return `<div class="pull-card r${r.rarity} ${r.isNew ? '' : 'gone'}" style="animation-delay:${i * 0.1}s">${tag}<span class="pe">${r.isNew ? SP.heroImg(r.id) : '<span class="ghost">?</span>'}</span><span class="pn">${esc(r.name)}</span><span class="ps">${'★'.repeat(r.rarity)}</span></div>`;
    }).join('');
    const again = S().gems >= (n === 10 ? D.GACHA.cost10 : D.GACHA.cost1);
    openModal(`
      <h2 id="modal-title" class="center">${best === 3 ? '✨ ★3' : '召喚'}</h2>
      <div class="pull-grid ${n === 1 ? 'one' : ''}">${cards}</div>
      ${res.some(r => !r.isNew) ? '<p class="note">宿舎がいっぱいで、何人かは門の向こうへ帰っていった（二度と会えない）</p>' : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="close">閉じる</button>
        <button type="button" class="btn btn-gold" data-action="pull" data-n="${n}" ${again ? '' : 'disabled'}>もう一度</button>
      </div>`, { back: gachaModal, focus: again ? '[data-action="pull"]' : '[data-action="close"]' });
  }

  // ---------- 英雄 ----------
  function heroCardHTML(id, opts) {
    opts = opts || {};
    const o = Game.owned(id);
    const h = D.heroById[id];
    const inP = Game.inParty(id);
    const prop = S().proposals.some(p => p.heroId === id);
    return `<button type="button" class="hero-card r${o.star} ${inP ? 'in-party' : ''} ${o.injured ? 'inj' : ''}" data-action="${opts.action || 'hero'}" data-id="${id}"
      aria-label="${esc(h.name)} ★${o.star} Lv${o.lv}${inP ? ' 編成中' : ''}${o.injured ? ' けが' : ''}">
      ${prop && !opts.action ? '<span class="dot" aria-hidden="true">!</span>' : ''}
      <span class="he">${opts.face ? SP.faceImg(id) : SP.heroImg(id)}</span>
      <span class="hn">${esc(h.name)}</span>
      <span class="hl">${'★'.repeat(o.star)} ${o.lv}</span>
    </button>`;
  }
  function heroListHTML() {
    const owned = Game.ownedList();
    return `<p class="muted">${owned.length} / ${Game.dormCap()}人</p><div class="hero-grid">${owned.map(id => heroCardHTML(id)).join('')}</div>`;
  }
  function landHTML(id) {
    const h = D.heroById[id];
    if (Game.memoryCount(id) < 2) return '？';
    const land = D.LANDS.find(l => l.id === h.land);
    return land ? `${esc(land.name)}${Game.landFreed(h.land) ? ' ✦' : ''}` : '？';
  }
  function heroDetail(id, note) {
    const h = D.heroById[id];
    const o = Game.owned(id);
    if (!o) { closeModal(); return; }
    const st = Game.stats(id);
    const maxLv = Game.maxLv(id);
    const atMax = o.lv >= maxLv;
    const cost = Game.trainCost(id);
    const inP = Game.inParty(id);
    const full = !inP && !S().party.includes(null);
    const c = D.CLASSES[h.cls];
    const pi = Game.promoteInfo(id);
    const tier = D.TRUST_TIERS[Game.trustTier(id)];
    const prop = S().proposals.find(p => p.heroId === id);
    const tal = Game.talents(id);
    const others = Game.ownedList().filter(x => x !== id).map(x => ({ x, r: Game.rel(id, x) })).sort((a, b) => b.r - a.r);
    const best = others[0], worst = others[others.length - 1];
    const eqBtn = (kind) => `<button type="button" class="eq" data-action="equip" data-id="${id}" data-kind="${kind}">${D.EQUIP_KINDS[kind].icon} ${o.equip[kind] ? esc(D.EQUIP_TIERS[o.equip[kind]].name) : '—'}</button>`;
    openModal(`
      <div class="detail-head" data-hero-detail="${id}">
        <div class="detail-face r${o.star}">${SP.heroImg(id)}</div>
        <div class="dh">
          <h2 id="modal-title">${esc(h.name)} <span class="muted">${c.icon}${esc(c.name)}</span></h2>
          <div class="muted">${esc(h.title || '')}</div>
          <div><span class="stars">${'★'.repeat(o.star)}</span> <b>Lv${o.lv}</b><span class="muted">/${maxLv}</span> <span class="act">${o.injured ? '🩹けが' : esc(ACT_NAME[o.activity] || '')}</span></div>
          <div class="trust" title="${esc(tier.desc)}">♥ ${o.trust} <span class="muted">${esc(tier.name)}</span><i class="bar"><b style="width:${o.trust}%"></b></i></div>
          <div class="expbar" aria-label="経験値"><i style="width:${atMax ? 100 : Math.floor(o.exp / expToNext(o.lv) * 100)}%"></i></div>
        </div>
      </div>
      ${note ? `<p class="note">${note}</p>` : ''}
      ${prop ? `<div class="prop-inline">${esc(Game.proposalText(prop))}${prop.data.cost ? ` <small>🪙${num(prop.data.cost)}</small>` : ''}
        <span><button type="button" class="btn btn-small btn-gold" data-action="prop-yes" data-pid="${prop.id}" ${S().gold < (prop.data.cost || 0) ? 'disabled' : ''}>受ける</button>
        <button type="button" class="btn btn-small" data-action="prop-no" data-pid="${prop.id}">断る</button></span></div>` : ''}
      <div class="stat-row">${D.STAT_KEYS.map(k => `<span>${D.STAT_NAMES[k]}<b>${num(st[k])}</b><em class="tal t${tal[k]}">才能 ${D.TALENT_NAMES[tal[k]]}${o.bonus[k] ? ` +${pct(o.bonus[k])}%` : ''}</em></span>`).join('')}</div>
      <div class="eq-row">${eqBtn('weapon')}${eqBtn('armor')}</div>
      <div class="chips">${o.traits.map(traitChip).join('')}<span class="trait skill" title="${esc(h.skill.desc)}">✦${esc(h.skill.name)}</span><span class="trait pers" title="${esc(D.PERSONALITIES[h.pers].desc)}">${esc(D.PERSONALITIES[h.pers].name)}</span></div>
      ${best ? `<p class="muted rels">仲良し ${esc(nameOf(best.x))}（${best.r}）${worst && worst !== best && worst.r < 0 ? `・不仲 <span class="rel-bad">${esc(nameOf(worst.x))}（${worst.r}）</span>` : ''}</p>` : ''}
      <details class="mem"><summary>記憶 ${Game.memoryCount(id)}/4・故郷 ${landHTML(id)}</summary>
        <ol>${h.memories.map((m, i) => i < Game.memoryCount(id) ? `<li>${esc(m)}</li>` : `<li class="locked">★${i + 2}</li>`).join('')}</ol></details>
      <div class="modal-actions four">
        <button type="button" class="btn" data-action="train" data-id="${id}" ${atMax || S().gold < cost ? 'disabled' : ''}>特訓<small>${atMax ? '最大' : '🪙' + num(cost)}</small></button>
        <button type="button" class="btn" data-action="promote" data-id="${id}" ${pi.can ? '' : 'disabled'}>昇級<small>${pi.reason === 'max' ? '★5' : pi.reason === 'level' ? 'Lv' + pi.needLv : '✦' + pi.cost}</small></button>
        <button type="button" class="btn" data-action="toggle-party" data-id="${id}" data-from="detail" ${full ? 'disabled' : ''}>${inP ? '外す' : '編成'}<small>${inP ? '編成中' : full ? '満員' : ''}</small></button>
        <button type="button" class="btn" data-action="farewell" data-id="${id}">送り出す<small>✦${Game.farewellShards(id)}</small></button>
      </div>
      ${close}`, { focus: '[data-action="close"]', onClose: () => Room.clearSelection() });
  }
  function equipModal(id, kind) {
    const o = Game.owned(id);
    const items = S().items.filter(it => it.kind === kind).sort((a, b) => b.tier - a.tier);
    const cur = o.equip[kind];
    const forgeT = Math.min(Game.maxForgeTier(), 5);
    const p = (tier) => Math.round(D.EQUIP_TIERS[tier][kind === 'weapon' ? 'atk' : 'def'] * 100);
    openModal(`
      <h2 id="modal-title">${D.EQUIP_KINDS[kind].icon} ${esc(nameOf(id))}の${D.EQUIP_KINDS[kind].name}</h2>
      <p class="effect">いま: <b>${cur ? esc(D.EQUIP_TIERS[cur].name) + ` (+${p(cur)}%)` : 'なし'}</b></p>
      <div class="forge"><div class="frow">${items.length ? items.map(it => `<button type="button" class="btn btn-small" data-action="equip-set" data-id="${id}" data-uid="${it.uid}">${esc(D.EQUIP_TIERS[it.tier].name)}<small>+${p(it.tier)}%</small></button>`).join('') : '<span class="muted">倉庫にない</span>'}</div></div>
      ${forgeT ? `<h3>作る</h3><div class="forge"><div class="frow">${[1, 2, 3, 4, 5].filter(t => t <= forgeT).map(t => `<button type="button" class="btn btn-small" data-action="forge" data-kind="${kind}" data-tier="${t}" data-id="${id}" ${S().gold < D.EQUIP_TIERS[t].cost ? 'disabled' : ''}>${D.EQUIP_TIERS[t].name}<small>🪙${num(D.EQUIP_TIERS[t].cost)}</small></button>`).join('')}</div></div>` : '<p class="muted">武器倉庫を建てると作れる</p>'}
      ${cur ? `<div class="modal-actions"><button type="button" class="btn" data-action="unequip" data-id="${id}" data-kind="${kind}">外す</button></div>` : ''}`, { back: () => heroDetail(id) });
  }
  function farewellModal(id, receiverId, traitIndex) {
    const h = D.heroById[id];
    const o = Game.owned(id);
    traitIndex = traitIndex || 0;
    const others = Game.ownedList().filter(x => x !== id);
    if (!others.length) { toast('最後の一人は送り出せません'); return; }
    const trait = o.traits[traitIndex];
    const canFuse = Game.canFuse();
    let preview = '', cost = 0;
    if (canFuse && receiverId && trait) {
      const p = Game.inheritPreview(receiverId, trait);
      const rn = nameOf(receiverId);
      cost = Game.inheritCost(trait);
      preview = p.mode === 'merge' ? `${esc(rn)}: ${D.TRAITS[p.id].name} Lv${p.from} → Lv${p.lv}` : p.mode === 'add' ? `${esc(rn)}: ＋${D.TRAITS[p.id].name} Lv${p.lv}` : `${esc(rn)}: ${D.TRAITS[p.replaced].name} → ${D.TRAITS[p.id].name} Lv${p.lv}`;
    }
    const enough = S().gold >= cost;
    openModal(`
      <h2 id="modal-title">${esc(h.name)}を送り出す <span class="muted">✦+${Game.farewellShards(id)}</span></h2>
      <p class="muted">二度と戻らない。装備は倉庫に戻る。</p>
      ${canFuse ? `<h3>特性を受け継がせる</h3>
      <div class="seg" role="group" aria-label="受け継がせる特性">${o.traits.map((t, i) => `<button type="button" data-action="fw" data-id="${id}" data-r="${receiverId || ''}" data-i="${i}" aria-pressed="${i === traitIndex}">${esc(D.TRAITS[t.id].name)} ${['Ⅰ', 'Ⅱ', 'Ⅲ'][t.lv - 1]}</button>`).join('')}</div>
      <div class="roster" style="margin-top:8px">
        <button type="button" class="hero-card ${!receiverId ? 'picked' : ''}" data-action="fw" data-id="${id}" data-r="" data-i="${traitIndex}" aria-pressed="${!receiverId}"><span class="he big">✕</span><span class="hn">なし</span></button>
        ${others.map(x => `<button type="button" class="hero-card r${Game.owned(x).star} ${receiverId === x ? 'picked' : ''}" data-action="fw" data-id="${id}" data-r="${x}" data-i="${traitIndex}" aria-pressed="${receiverId === x}"><span class="he">${SP.faceImg(x)}</span><span class="hn">${esc(nameOf(x))}</span></button>`).join('')}
      </div>
      ${preview ? `<p class="note">${preview}　🪙${num(cost)}</p>` : ''}` : '<p class="muted">合成所を建てると特性を受け継がせられる</p>'}
      <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="fw-do" data-id="${id}" data-r="${canFuse ? receiverId || '' : ''}" data-i="${traitIndex}" ${enough ? '' : 'disabled'}>送り出す</button></div>`, { back: () => heroDetail(id) });
  }

  // ---------- 編成・作戦（戦略室から） ----------
  function tacticsHTML() {
    const t = S().tactics;
    const order = Object.keys(D.TACTICS).sort((a, b) => D.TACTIC_UNLOCK[a] - D.TACTIC_UNLOCK[b]);
    return order.map(key => {
      const def = D.TACTICS[key];
      if (!Game.tacticUnlocked(key)) return `<div class="tactic locked"><span class="tl">${def.label}</span><span class="muted">🔒 戦略室Lv${D.TACTIC_UNLOCK[key]}</span></div>`;
      return `<div class="tactic" role="group" aria-label="${def.label}"><span class="tl">${def.label}</span>
        <div class="seg">${def.options.map(o => `<button type="button" data-action="tactic" data-key="${key}" data-value="${o.value}" aria-pressed="${o.value === t[key]}" title="${esc(o.desc)}">${o.name}</button>`).join('')}</div></div>`;
    }).join('');
  }
  function heroTargetsHTML() {
    if (!Game.tacticUnlocked('perHero')) return '';
    return Game.partyIds().map(id => {
      const cur = Game.heroTarget(id);
      return `<div class="tactic per-hero">${SP.faceImg(id)}<div class="seg" role="group" aria-label="${esc(nameOf(id))}の狙う敵">
        <button type="button" data-action="hero-target" data-id="${id}" data-value="" aria-pressed="${!cur}">全体</button>
        ${D.TACTICS.target.options.map(o => `<button type="button" data-action="hero-target" data-id="${id}" data-value="${o.value}" aria-pressed="${cur === o.value}">${o.name}</button>`).join('')}</div></div>`;
    }).join('');
  }
  function partyModal() {
    const s = S();
    const slots = s.party.map((id, i) => {
      if (!id) return `<div class="slot">${faceHTML(null)}</div>`;
      const row = Game.rowOf(id);
      return `<div class="slot"><button type="button" class="face r${Game.owned(id).star} ${Game.isInjured(id) ? 'inj' : ''}" data-action="slot-remove" data-i="${i}" aria-label="${esc(nameOf(id))}を外す">${SP.faceImg(id)}</button>
        <button type="button" class="rowbtn ${row}" data-action="row" data-id="${id}" aria-label="${esc(nameOf(id))}: ${row === 'front' ? '前衛' : '後衛'}">${row === 'front' ? '前' : '後'}</button></div>`;
    }).join('');
    const pots = Object.entries(D.POTIONS).filter(([k]) => s.potions[k] > 0).map(([k, d]) => `${d.icon}${s.potions[k]}`);
    const bad = Game.badPairs().filter(b => s.party.includes(b.a) && s.party.includes(b.b) && b.rel <= D.QUARREL.betrayLine);
    openModal(`
      <h2 id="modal-title">📜 編成 <span class="muted">⚔ ${num(Game.partyPower())}</span></h2>
      <div class="slots">${slots}</div>
      ${bad.length ? `<p class="note">⚠ ${bad.map(b => `${esc(nameOf(b.a))}と${esc(nameOf(b.b))}`).join('、')}はとても仲が悪い（裏切りに注意）</p>` : ''}
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="auto-party">おまかせ</button></div>
      ${pots.length ? `<p class="muted">持っていく薬 ${pots.join(' ')}</p>` : ''}
      <div class="roster">${Game.ownedList().map(id => heroCardHTML(id, { action: 'toggle-party', face: true })).join('')}</div>
      <h3>作戦</h3>
      <div class="tactics" id="tactics-box">${tacticsHTML()}</div>
      <div id="hero-targets">${heroTargetsHTML()}</div>${close}`, { back: () => buildingModal('strategy') });
  }
  function setTactic(key, raw) {
    const opt = D.TACTICS[key].options.find(o => String(o.value) === raw);
    if (!opt || !Game.tacticUnlocked(key)) return;
    S().tactics[key] = opt.value;
    Game.save();
    for (const box of document.querySelectorAll('#tactics-box, #battle-tactics-box')) {
      box.innerHTML = tacticsHTML();
      const b = box.querySelector(`[data-key="${key}"][data-value="${raw}"]`);
      if (b) b.focus();
    }
  }

  // ---------- 塔の中（マスターが見る映像） ----------
  const EX = {
    ex: null, floorIndex: 0, partyIds: [], raf: 0, last: 0, acc: 0, paused: false, ending: false, cmd: null, orderMode: false,

    start(floorIndex) {
      const party = Game.partyForBattle().filter(p => !Game.isInjured(p.def.id));
      if (!party.length) { toast('塔に行ける英雄がいません'); return; }
      closeModal();
      this.floorIndex = floorIndex;
      this.partyIds = party.map(p => p.def.id);
      this.ex = new E.Expedition(Object.assign({ party, floorIndex, tactics: S().tactics }, Game.battleOptions()));
      this.paused = false; this.ending = false; this.cmd = null; this.orderMode = false;
      Room.stop();
      $('#scene').hidden = true;
      $('#hud').hidden = true;
      $('#expedition').hidden = false;
      document.body.classList.add('in-tower');
      $('#x-floor').textContent = `${floorIndex + 1}階`;
      $('#x-log').innerHTML = '';
      $('#x-proposal').hidden = true;
      Field.mount($('#field'), { onTapUnit: (uid) => this.tapUnit(uid), onTapGround: (x, y) => this.tapGround(x, y) });
      Field.load(this.ex);
      this.renderList();
      this.updateTop();
      this.updateSpeed();
      this.updateOrderMode();
      Field.start();
      this.last = performance.now(); this.acc = 0;
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(t => this.loop(t));
      $('#x-retreat').focus({ preventScroll: true });
    },
    stop() {
      cancelAnimationFrame(this.raf);
      Field.stop();
      this.ex = null;
      this.closeCmd();
      $('#expedition').hidden = true;
      $('#scene').hidden = false;
      $('#hud').hidden = false;
      document.body.classList.remove('in-tower');
      Room.resize(); Room.start();
      refreshHome();
    },
    loop(now) {
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      if (this.ex && !this.paused && !this.ending) {
        this.acc += dt * S().speed * (this.cmd ? 0.3 : 1);
        let n = 0;
        while (this.acc >= 0.1 && n++ < 12 && this.ex.state === 'running') { this.acc -= 0.1; this.handle(this.ex.step(0.1)); }
        if (Math.floor(now / 250) !== this.loop.k) { this.loop.k = Math.floor(now / 250); this.updateList(); this.updateTop(); }
      }
      if (this.ex) this.raf = requestAnimationFrame(t => this.loop(t));
    },
    /** テスト用: 一気に最後まで進める */
    runFast(seconds) {
      if (!this.ex) return;
      let n = 0;
      while (this.ex && this.ex.state === 'running' && n++ < (seconds || 600) * 10) this.handle(this.ex.step(0.1));
    },
    handle(events) {
      Field.events(events);
      for (const e of events) {
        if (e.type === 'note') this.log(e.text, 'n-' + e.kind);
        else if (e.type === 'proposal') this.showProposal(e.proposal);
        else if (e.type === 'proposalExpired') $('#x-proposal').hidden = true;
        else if (e.type === 'mission' || e.type === 'exit') this.updateTop();
        else if (e.type === 'end') { this.ending = true; this.closeCmd(); $('#x-proposal').hidden = true; this.banner(e.win ? '勝利' : e.reason === 'retreat' ? '撤退' : e.reason === 'timeout' ? '時間切れ' : '全滅', !e.win); this.updateList(); setTimeout(() => this.showResult(e), 1100); }
      }
      if (this.cmd) { const u = this.ex && this.ex.unitById(this.cmd.uid); if (!u || !u.alive) this.closeCmd(); }
    },
    log(text, cls) {
      const ol = $('#x-log');
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      ol.appendChild(li);
      while (ol.children.length > 4) ol.firstChild.remove();
    },
    banner(text, bad) {
      const el = $('#x-banner');
      el.className = 'banner' + (bad ? ' bad' : '');
      el.innerHTML = `<span>${esc(text)}</span>`;
      void el.offsetWidth;
      el.classList.add('show');
    },
    updateTop() {
      const x = this.ex;
      if (!x) return;
      const m = x.mission;
      const md = D.MISSIONS[m.kind];
      let text = m.revealed ? `${md.name}: ${md.desc}` : '任務: ？？？（手がかりを探している）';
      if (m.revealed && m.kind === 'hunt') text += `（${m.progress}/${x.camps.length}）`;
      if (m.revealed && m.kind === 'relic') text += `（${m.progress}/3）`;
      if (m.revealed && m.kind === 'survive' && m.surviveStarted && !m.done) text += `（あと${Math.ceil(m.surviveLeft)}秒）`;
      if (m.exitOpen) text = '出口が開いた → 出口へ向かっている';
      $('#x-mission').textContent = text;
      $('#x-mission').classList.toggle('known', m.revealed || m.exitOpen);
      $('#x-time').textContent = `${Math.max(0, Math.ceil(E.TIME_LIMIT - x.time))}秒`;
      const g = $('#x-gauge');
      const ready = x.canCommand();
      g.classList.toggle('ready', ready);
      g.style.setProperty('--p', String(Math.min(1, x.cmdCharge / x.cmdCost)));
      g.setAttribute('aria-label', ready ? '命令できる' : '命令の準備中');
    },
    updateSpeed() { $('#x-speed').textContent = '×' + S().speed; },
    updateOrderMode() { $('#x-order').classList.toggle('on', this.orderMode); $('#x-order').setAttribute('aria-pressed', String(this.orderMode)); $('#expedition').classList.toggle('order-mode', this.orderMode); },

    // 英雄の一覧（誰が何をしているか）
    renderList() {
      $('#x-list').innerHTML = this.ex.heroes.map(u => `<button type="button" class="hrow r${u.star}" id="hr-${u.id}" data-action="x-unit" data-uid="${u.id}" aria-label="${esc(u.name)}">
        ${SP.faceImg(u.heroId)}<span class="hn">${esc(u.name)}</span><span class="ha"></span><span class="hs"></span><i class="hb"><b></b></i></button>`).join('');
      this.updateList();
    },
    updateList() {
      if (!this.ex) return;
      const ACT = { attack: '攻撃', skill: 'スキル', heal: '回復', guard: '防御', slack: 'サボり', move: '移動', explore: '探索', flee: '逃走', wait: '待機', down: '戦闘不能' };
      for (const u of this.ex.heroes) {
        const el = document.getElementById('hr-' + u.id);
        if (!el) continue;
        const r = u.hp / u.maxHp;
        const bar = el.querySelector('.hb b');
        bar.style.width = (r * 100) + '%';
        bar.className = r < 0.25 ? 'crit' : r < 0.5 ? 'low' : '';
        const act = u.alive ? (u.guardT > 0 && u.action !== 'skill' ? 'guard' : u.action) : 'down';
        const a = el.querySelector('.ha');
        a.textContent = ACT[act] || '';
        a.className = 'ha a-' + act;
        el.querySelector('.hs').textContent = (u.fear > 0 ? '😨' : '') + (u.bleed > 0 ? '🩸' : '') + (u.order ? '📣' : '');
        el.classList.toggle('dead', !u.alive);
        el.classList.toggle('slack', u.alive && act === 'slack');
        el.classList.toggle('picked', !!this.cmd && this.cmd.uid === u.id);
      }
    },
    showProposal(p) {
      const el = $('#x-proposal');
      const u = this.ex.unitById(p.unit);
      el.innerHTML = `${SP.faceImg(u.heroId)}<span>${esc(u.name)}が${esc(D.BATTLE_PROPOSALS[p.kind].name)}を提案しています</span>
        <button type="button" class="btn btn-small btn-gold" data-action="xprop-yes">受ける</button><button type="button" class="btn btn-small" data-action="xprop-no">断る</button>`;
      el.hidden = false;
      this.log(`${u.name}が${D.BATTLE_PROPOSALS[p.kind].name}を提案しています`, 'n-prop');
    },
    answerProposal(yes) {
      if (!this.ex) return;
      $('#x-proposal').hidden = true;
      const r = this.ex.answerProposal(yes);
      if (!r.ok) return;
      this.log(yes ? `提案を受けた: ${D.BATTLE_PROPOSALS[r.kind].name}` : '提案を断った', 'sys');
      if (r.ended) this.handle(this.ex.step(0));
    },

    // 命令
    tapUnit(uid) {
      const x = this.ex;
      if (!x || this.ending) return;
      const u = x.unitById(uid);
      if (!u) return;
      if (this.cmd && this.cmd.mode === 'target' && u.side === 'enemy') { this.issue('target', uid); return; }
      if (u.side === 'hero') this.openCmd(uid);
    },
    tapGround(tx, ty) {
      const x = this.ex;
      if (!x || this.ending) return;
      if (this.cmd && this.cmd.mode === 'move') { this.issue('move', { x: tx, y: ty }); return; }
      if (this.orderMode) {
        const r = x.partyMove(tx, ty);
        if (!r.ok) { toast(r.reason === 'charge' ? '命令の準備中' : '行けない場所'); return; }
        Field.showMoveTarget(tx, ty);
        this.updateTop();
      }
    },
    openCmd(uid) {
      const x = this.ex;
      const u = x.unitById(uid);
      if (!u || !u.alive) return;
      Field.follow(uid);
      if (!x.canCommand()) { toast('命令の準備中'); this.cmd = null; Field.setPicked(uid); return; }
      this.cmd = { uid, mode: 'menu' };
      this.renderCmd();
    },
    renderCmd() {
      const box = $('#x-cmd');
      if (!this.cmd || !this.ex) { box.hidden = true; return; }
      const u = this.ex.unitById(this.cmd.uid);
      Field.setTargeting(this.cmd.mode === 'target');
      Field.setPicked(u.id);
      if (this.cmd.mode === 'target') box.innerHTML = `<span class="ch">${esc(u.name)}: 狙う敵をタップ</span><button type="button" class="btn btn-small" data-action="x-cancel">やめる</button>`;
      else if (this.cmd.mode === 'move') box.innerHTML = `<span class="ch">${esc(u.name)}: 行き先をタップ</span><button type="button" class="btn btn-small" data-action="x-cancel">やめる</button>`;
      else box.innerHTML = `<span class="ch">${SP.faceImg(u.heroId)}${esc(u.name)}${u.trust < 45 ? ' <small>♥' + u.trust + '</small>' : ''}</span>
        <button type="button" class="btn btn-small" data-action="x-order" data-type="target">⚔️ 狙え</button>
        <button type="button" class="btn btn-small" data-action="x-order" data-type="skill" ${u.skillT > 0 ? 'disabled' : ''}>✦ スキル</button>
        <button type="button" class="btn btn-small" data-action="x-order" data-type="guard">🛡️ 守れ</button>
        <button type="button" class="btn btn-small" data-action="x-order" data-type="move">📍 ここへ</button>
        <button type="button" class="btn btn-small" data-action="x-order" data-type="flee">💨 逃げろ</button>
        <button type="button" class="btn btn-small" data-action="x-cancel" aria-label="やめる">✕</button>`;
      box.hidden = false;
      this.updateList();
    },
    closeCmd() {
      this.cmd = null;
      const box = $('#x-cmd');
      if (box) { box.hidden = true; box.innerHTML = ''; }
      Field.setTargeting(false);
      Field.setPicked(null);
      if (this.ex) this.updateList();
    },
    chooseOrder(type) {
      if (!this.cmd) return;
      if (type === 'target' || type === 'move') { this.cmd.mode = type; this.renderCmd(); return; }
      this.issue(type, null);
    },
    issue(type, arg) {
      const uid = this.cmd.uid;
      const r = this.ex.command(uid, type, arg);
      this.closeCmd();
      if (!r.ok) { toast(r.reason === 'charge' ? '命令の準備中' : r.reason === 'cd' ? 'スキルはまだ使えない' : r.reason === 'tile' ? '行けない場所' : '命令できない'); return; }
      if (type === 'move' && r.obeyed) Field.showMoveTarget(arg.x, arg.y);
      S().stats.commands = (S().stats.commands || 0) + 1;
      this.updateTop();
    },

    showResult(e) {
      const x = this.ex;
      const win = e.win;
      const reward = Game.applyBattleResult(this.floorIndex, win, this.partyIds, e.fallen, e.reason, e);
      renderWallet();
      const fi = this.floorIndex;
      const hasNext = win && fi + 1 < D.FLOORS.length && Game.isUnlocked(fi + 1);
      const mvpSt = e.heroStats.find(h => h.heroId === e.mvp);
      const mvp = e.mvp ? `<div class="mvp">${SP.heroImg(e.mvp)}<span><small>MVP</small><b>${esc(nameOf(e.mvp))}</b>${mvpSt ? `<span class="muted">与えた ${num(mvpSt.dmg)}・回復 ${num(mvpSt.heal)}</span>` : ''}</span></div>` : '';
      const ups = reward.levelUps.filter(l => !l.training);
      const upsHTML = ups.length ? `<ul class="ups">${ups.map(l => `<li>${SP.faceImg(l.id)}<span>${esc(nameOf(l.id))}<b>Lv${l.from}→${l.to}</b></span></li>`).join('')}</ul>` : '';
      const grow = Object.entries(reward.growth || {}).map(([id, g]) => `${esc(nameOf(id))} ${Object.entries(g).map(([k, v]) => D.STAT_NAMES[k] + '+' + pct(v) + '%').join(' ')}`);
      const lost = reward.fallen.length ? `<ul class="ups lost">${reward.fallen.map(f => `<li>${SP.faceImg(f.id, 'mono')}<span>${esc(f.name)}<b>${f.cause === 'betrayal' ? esc(f.by) + 'に殺された' : '戦死'}</b></span></li>`).join('')}</ul>` : '';
      const slackers = e.heroStats.filter(h => h.slack > 0).map(h => `${nameOf(h.heroId)} ${h.slack}回`);
      const md = D.MISSIONS[e.mission.kind];
      const title = win ? '勝利' : e.reason === 'retreat' ? '撤退' : e.reason === 'timeout' ? '時間切れ' : '全滅';
      openModal(`
        <p class="result-title ${win ? 'win' : 'lose'}" id="modal-title">${title}</p>
        <p class="muted center">${fi + 1}階・任務「${esc(md.name)}」${e.mission.done ? '達成' : e.mission.revealed ? '未達成' : 'は不明のまま'}${reward.firstClear ? '・初クリア' : ''}</p>
        ${reward.worldSaved ? `<p class="note gold">✦ 世界「${esc(S().base.name)}」を救った</p>` : ''}
        ${reward.freedZone && !reward.worldSaved ? `<p class="note gold">✦ ${esc(reward.freedZone.name)}を取り戻した${reward.freedZone.natives.length ? `（${reward.freedZone.natives.map(nameOf).join('・')} ♥+10）` : ''}</p>` : ''}
        ${(e.betrayals || []).length ? `<p class="note">⚔ ${e.betrayals.map(b => `${esc(nameOf(b.by))}が${esc(D.heroById[b.victim].name)}を裏切った`).join('、')}</p>` : ''}
        ${mvp}${lost}${upsHTML}
        ${grow.length ? `<p class="muted center grow">成長: ${grow.join(' / ')}</p>` : ''}
        <p class="rewards center">${reward.gold ? '🪙+' + num(reward.gold) + '　' : ''}${reward.shards ? '✦+' + num(reward.shards) + '　' : ''}${reward.gems ? '💎+' + num(reward.gems) : ''}</p>
        ${slackers.length ? `<p class="muted center">サボり: ${esc(slackers.join('・'))}</p>` : ''}
        ${reward.newcomer ? `<p class="note">流れ者の英雄「${esc(nameOf(reward.newcomer))}」が来た</p>` : ''}
        <div class="modal-actions">
          ${hasNext ? `<button type="button" class="btn btn-gold" data-action="start" data-floor="${fi + 1}">次へ ${fi + 2}階</button>` : ''}
          <button type="button" class="btn ${hasNext ? '' : 'btn-gold'}" data-action="start" data-floor="${fi}" ${Game.partyIds().length ? '' : 'disabled'}>${win ? 'もう一度' : '再挑戦'}</button>
          <button type="button" class="btn" data-action="result-home">待機室へ</button>
        </div>`, { locked: true, onClose: () => { if (this.ex === x) this.stop(); } });
    },
    openTactics() {
      if (!this.ex || this.ending) return;
      this.closeCmd();
      this.paused = true;
      openModal(`<h2 id="modal-title">作戦</h2><div class="tactics" id="battle-tactics-box">${tacticsHTML()}</div>
        <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="close">戻る</button></div>`, { onClose: () => { this.paused = false; this.last = performance.now(); } });
    },
    retreat() {
      if (!this.ex || this.ending) return;
      this.closeCmd();
      this.paused = true;
      openModal(`<h2 id="modal-title">撤退する？</h2><p class="muted">報酬はなし。生きている英雄は帰れる。</p>
        <div class="modal-actions"><button type="button" class="btn" data-action="close">続ける</button><button type="button" class="btn btn-gold" data-action="retreat-yes">撤退</button></div>`, { onClose: () => { this.paused = false; this.last = performance.now(); } });
    },
  };

  // ---------- 待機室の時間（現実の時間で進む） ----------
  function awayModal(sum) {
    if (!sum || sum.ticks < 3) return false;
    const gains = Object.entries(sum.gains).filter(([id]) => Game.owned(id)).map(([id, g]) => `<li>${faceHTML(id)}<span>${esc(nameOf(id))}<small>${Object.entries(g).map(([k, v]) => D.STAT_NAMES[k] + ' +' + pct(v) + '%').join('・')}</small></span></li>`).join('');
    const noTal = Object.keys(sum.noTalent).filter(id => Game.owned(id) && !sum.gains[id]).map(nameOf);
    const h = Math.floor(sum.ticks / 60), m = sum.ticks % 60;
    openModal(`
      <h2 id="modal-title">留守のあいだに</h2>
      <p class="muted">${h ? h + '時間' : ''}${m}分のあいだ、英雄たちは自分で過ごしていた</p>
      ${gains ? `<h3>訓練で強くなった</h3><ul class="ups list">${gains}</ul>` : ''}
      ${noTal.length ? `<p class="muted">${esc(noTal.join('・'))}は訓練したが、才能がなく伸びなかった</p>` : ''}
      ${sum.quarrels ? `<p class="note">喧嘩が ${sum.quarrels} 件起きている。仲裁しよう</p>` : ''}
      ${sum.proposals ? `<p class="note">提案が ${sum.proposals} 件ある（広場）</p>` : ''}
      ${sum.healed.length ? `<p class="muted">${esc(sum.healed.filter(id => Game.owned(id)).map(nameOf).join('・'))}のけがが治った</p>` : ''}
      ${close}`);
    return true;
  }
  function clockTick() {
    if (!$('#expedition').hidden) return;
    const sum = Game.advance(Date.now(), true);
    const escalated = Game.updateQuarrels(Date.now(), true);
    for (const r of escalated || []) {
      if (r.kind === 'murder') { Room.refresh(); renderNotices(); openModal(`<h2 id="modal-title">⚠ 殺し合い</h2><p class="center">${esc(r.text)}</p><p class="muted center">仲裁が間に合わなかった。待機室の英雄たちのマスターへの信頼が下がった。</p>${close}`); }
      else toast(r.text);
    }
    if (sum || (escalated && escalated.length)) { renderWallet(); renderNotices(); Room.refresh(); }
    else if (S().quarrels.length) renderNotices();
  }

  // ---------- 遊び方 ----------
  function showIntro() {
    const s = S();
    openModal(`
      <h2 id="modal-title">✦ ${esc(s.base.name)}</h2>
      <p>ここは、滅びかけた世界「${esc(s.base.name)}」の待機室。塔の<b>100階</b>を制覇すれば、世界を救える。</p>
      <ul class="intro">
        <li>🏰 建物や英雄をタップ（次元の門 → 塔・召喚）</li>
        <li>👆 ドラッグで見回す・ピンチで寄る</li>
        <li>⏳ 待機室の時間は現実と同じ。英雄は勝手に訓練し、喧嘩もする。仲裁はマスターの役目</li>
        <li>🗼 塔の中は英雄まかせ。英雄をタップで命令、「指示」で行き先を決める</li>
        <li>💬 英雄の声は聞こえない。提案に答えて信頼を深める</li>
      </ul>
      <p class="note">⚠ 倒れた英雄は二度と戻らない。同じ英雄が現れることもない</p>
      <p class="muted center">難易度 ${esc(Game.difficulty().name)}</p>
      <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="close">はじめる</button></div>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="reset">最初からやり直す</button></div>`,
    { onClose: () => { if (!S().seenIntro) { S().seenIntro = true; Game.save(); } } });
  }

  // ---------- 操作 ----------
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    const id = el.dataset.id;
    switch (a) {
      case 'close': closeModal(); break;
      case 'back': { const b = modalBack; if (b) b(); break; }
      case 'help': showIntro(); break;
      case 'rename': { const n = prompt('待機室の名前（滅んだ世界の名前）', S().base.name); if (n !== null && Game.renameBase(n)) renderWallet(); break; }
      case 'building': buildingModal(el.dataset.key); break;
      case 'build': doBuild(el.dataset.key); break;
      case 'quarrel': quarrelModal(Number(el.dataset.qid)); break;
      case 'mediate': { const r = Game.mediate(Number(el.dataset.qid), el.dataset.side); if (r.ok) { closeModal(); toast(r.text); refreshHome(); } break; }
      case 'tower': towerModal(); break;
      case 'gacha': gachaModal(); break;
      case 'party': partyModal(); break;
      case 'zone': towerZone = Number(el.dataset.z); towerModal(); break;
      case 'floor': floorInfo(Number(el.dataset.floor)); break;
      case 'start': {
        const fi = Number(el.dataset.floor);
        if (EX.ex) { modalOnClose = null; $('#modal').hidden = true; EX.stop(); }
        if (!S().seenDeathWarning) {
          openModal(`<h2 id="modal-title">⚠ 倒れた英雄は二度と戻らない</h2><p class="muted">危ないときは「撤退」。</p>
            <div class="modal-actions"><button type="button" class="btn" data-action="close">やめる</button><button type="button" class="btn btn-gold" data-action="start-confirmed" data-floor="${fi}">挑戦する</button></div>`);
        } else EX.start(fi);
        break;
      }
      case 'start-confirmed': S().seenDeathWarning = true; Game.save(); EX.start(Number(el.dataset.floor)); break;
      case 'pull': doPull(Number(el.dataset.n)); break;
      case 'hero': heroDetail(id); break;
      case 'prop-yes': case 'prop-no': {
        const pid = Number(el.dataset.pid);
        const p = S().proposals.find(x => x.id === pid);
        const r = Game.answerProposal(pid, a === 'prop-yes');
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : 'できません'); break; }
        toast(r.accepted ? `${nameOf(p.heroId)}の提案を受けた（♥+${r.trust}）` : `${nameOf(p.heroId)}の提案を断った（♥${r.trust}）`);
        renderWallet(); renderNotices(); Room.refresh();
        if ($('#modal [data-hero-detail]')) heroDetail(p.heroId); else buildingModal('plaza');
        break;
      }
      case 'forge': {
        const r = Game.forge(el.dataset.kind, Number(el.dataset.tier), id || null);
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : '作れません'); break; }
        renderWallet();
        toast(`${D.EQUIP_TIERS[r.item.tier].name}の${D.EQUIP_KINDS[r.item.kind].name}を作った`);
        if (id) heroDetail(id); else buildingModal('armory');
        break;
      }
      case 'brew': { const r = Game.brew(el.dataset.key); if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'cap' ? 'これ以上持てない' : '作れません'); break; } renderWallet(); buildingModal('alchemy'); break; }
      case 'equip': equipModal(id, el.dataset.kind); break;
      case 'equip-set': Game.equip(id, Number(el.dataset.uid)); heroDetail(id); break;
      case 'unequip': Game.unequip(id, el.dataset.kind); heroDetail(id); break;
      case 'train': { const r = Game.train(id); if (r.ok) toast(`${nameOf(id)} Lv${r.lv}`); else if (r.reason === 'gold') toast('金貨が足りません'); renderWallet(); heroDetail(id); break; }
      case 'promote': {
        const r = Game.promote(id);
        if (!r.ok) break;
        renderWallet();
        heroDetail(id, `✨ ★${r.star}${r.newTrait ? `・新しい特性「${esc(D.TRAITS[r.newTrait.id].name)}」` : ''}${r.memory ? `<br><span class="memory-flash">記憶がよみがえった ──「${esc(r.memory)}」</span>` : ''}`);
        break;
      }
      case 'farewell': farewellModal(id, null, 0); break;
      case 'fw': farewellModal(id, el.dataset.r || null, Number(el.dataset.i)); break;
      case 'fw-do': {
        const name = nameOf(id);
        const r = Game.farewell(id, el.dataset.r || null, Number(el.dataset.i));
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'last' ? '最後の一人は送り出せません' : '送り出せません'); break; }
        modalOnClose = null; closeModal(); refreshHome();
        toast(`${name}は故郷へ帰った（✦+${r.shards}）${r.inherit ? `・${nameOf(r.inherit.receiver)}が「${D.TRAITS[r.inherit.id].name}」を受け継いだ` : ''}`);
        break;
      }
      case 'toggle-party': {
        const r = Game.togglePartyMember(id);
        if (r === 'full') toast('編成がいっぱい（5人まで）');
        if (el.dataset.from === 'detail') heroDetail(id); else partyModal();
        break;
      }
      case 'slot-remove': Game.removeFromSlot(Number(el.dataset.i)); partyModal(); break;
      case 'row': Game.toggleRow(id); partyModal(); break;
      case 'auto-party': Game.autoParty(); partyModal(); break;
      case 'tactic': setTactic(el.dataset.key, el.dataset.value); break;
      case 'hero-target': Game.setHeroTarget(id, el.dataset.value || null); $('#hero-targets').innerHTML = heroTargetsHTML(); break;
      case 'reset': if (confirm('保存データをすべて消して、最初からやり直しますか？（元に戻せません）')) { Game.reset(); window.location.reload(); } break;
      case 'result-home': closeModal(); break;
      case 'retreat-yes': modalOnClose = null; closeModal(); EX.paused = false; if (EX.ex) { EX.ex.retreat(); EX.handle(EX.ex.step(0)); } break;
      case 'x-unit': EX.tapUnit(el.dataset.uid); break;
      case 'x-order': EX.chooseOrder(el.dataset.type); break;
      case 'x-cancel': EX.closeCmd(); break;
      case 'xprop-yes': EX.answerProposal(true); break;
      case 'xprop-no': EX.answerProposal(false); break;
      case 'cam': { const v = el.dataset.v; const target = EX.ex ? Field : Room; if (v === 'l') target.rotate(0.4); else if (v === 'r') target.rotate(-0.4); else if (v === 'in') target.zoom(0.85); else if (v === 'out') target.zoom(1.18); else if (v === 'all' && EX.ex) Field.follow(null); break; }
      default: break;
    }
  });
  $('#x-speed').addEventListener('click', () => { S().speed = S().speed >= 4 ? 1 : S().speed * 2; Game.save(); EX.updateSpeed(); });
  $('#x-tactics').addEventListener('click', () => EX.openTactics());
  $('#x-retreat').addEventListener('click', () => EX.retreat());
  $('#x-order').addEventListener('click', () => { EX.orderMode = !EX.orderMode; EX.updateOrderMode(); toast(EX.orderMode ? '指示: 地面をタップすると全員がそこへ向かう' : 'おまかせ: 英雄が自分で動く'); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && EX.cmd && $('#modal').hidden) { e.preventDefault(); EX.closeCmd(); return; }
    if (e.key === 'Escape' && !$('#modal').hidden) { if ($('#modal').dataset.locked) return; e.preventDefault(); closeModal(); }
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#modal').dataset.locked) closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Room.stop();
    else if ($('#expedition').hidden) { clockTick(); Room.start(); }
  });

  // ---------- 起動 ----------
  Game.init();
  if (S().speed !== 1 && S().speed !== 2 && S().speed !== 4) S().speed = 2;
  const away = Game.advance(Date.now(), false);
  renderWallet();
  mountRoom();
  renderNotices();
  if (!S().seenIntro) showIntro(); else awayModal(away);
  setInterval(clockTick, 5000);

  window.__game = { Game, EX, D, Room, Field, renderNotices, clockTick };

  if (/^https?:$/.test(location.protocol)) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.appendChild(link);
    if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
