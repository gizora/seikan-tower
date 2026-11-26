/* 星喚の塔 — 画面（必要最低限の表示。詳しいことはタップしたときだけ出す） */
(function () {
  'use strict';
  const D = window.GameData;
  const E = window.BattleEngine;
  const SP = window.Sprites;
  const Room = window.Room;
  const Field = window.Field;
  const { Game, expToNext, floorExp, floorGold, firstClearGems, firstClearShards, repeatShards, traitSlots, isBossFloor } = window.GameCore;

  // ---------- 小さな道具 ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n).toLocaleString('ja-JP');
  const S = () => Game.state;
  const stars = (n) => `<span class="stars" aria-label="★${n}">${'★'.repeat(n)}</span>`;
  const traitText = (t) => { const d = D.TRAITS[t.id], v = d.vals[t.lv - 1]; return d.desc.replace('{p}', Math.round(v * 100)).replace('{v}', v); };
  const traitChip = (t) => `<span class="trait" title="${esc(traitText(t))}">${esc(D.TRAITS[t.id].name)}<b>${['Ⅰ', 'Ⅱ', 'Ⅲ'][t.lv - 1]}</b></span>`;
  const nameOf = (id) => D.heroById[id].name;

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
  }

  let lastWallet = {};
  function renderWallet() {
    for (const k of ['gems', 'gold', 'shards']) {
      const el = $('#' + k);
      el.textContent = num(S()[k]);
      if (lastWallet[k] != null && lastWallet[k] !== S()[k]) { const c = el.parentElement; c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump'); }
      lastWallet[k] = S()[k];
    }
  }

  // ---------- モーダル ----------
  let modalReturnFocus = null;
  let modalOnClose = null;
  function openModal(html, opts) {
    opts = opts || {};
    const m = $('#modal');
    if (m.hidden) modalReturnFocus = document.activeElement;
    $('#modal-body').innerHTML = html;
    m.hidden = false;
    m.dataset.locked = opts.locked ? '1' : '';
    modalOnClose = opts.onClose || null;
    Room.stop();
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
    modalOnClose = null;
    if (cb) cb();
    if (currentTab === 'home' && $('#battle').hidden) { Room.clearSelection(); Room.start(); }
    if (modalReturnFocus && document.body.contains(modalReturnFocus) && !modalReturnFocus.closest('[hidden]')) modalReturnFocus.focus({ preventScroll: true });
    modalReturnFocus = null;
  }

  // ---------- タブ ----------
  let currentTab = 'home';
  function showTab(name) {
    currentTab = name;
    for (const sec of document.querySelectorAll('.tab')) sec.hidden = sec.id !== 'tab-' + name;
    for (const b of document.querySelectorAll('.tabbtn')) {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    if (name !== 'home') Room.stop();
    renderTab();
    window.scrollTo(0, 0);
  }
  function renderTab() {
    renderWallet();
    ({ home: renderHome, tower: renderTower, gacha: renderGacha, heroes: renderHeroes, party: renderParty })[currentTab]();
  }

  function faceHTML(id, extra) {
    if (!id) return `<span class="face empty ${extra || ''}" aria-hidden="true"></span>`;
    const h = Game.owned(id);
    return `<span class="face r${h ? h.star : 1} ${extra || ''}" aria-hidden="true">${SP.faceImg(id)}</span>`;
  }

  // ---------- 待機所（ホーム） ----------
  function proposalsHTML() {
    const list = S().proposals;
    if (!list.length) return '';
    return `<ul class="props">${list.map(p => `<li>
      ${faceHTML(p.heroId)}<span class="pt">${esc(Game.proposalText(p))}${p.data.cost ? ` <small>🪙${num(p.data.cost)}</small>` : ''}</span>
      <button type="button" class="btn btn-small btn-gold" data-action="prop-yes" data-pid="${p.id}" ${S().gold < (p.data.cost || 0) ? 'disabled' : ''}>受ける</button>
      <button type="button" class="btn btn-small" data-action="prop-no" data-pid="${p.id}">断る</button></li>`).join('')}</ul>`;
  }

  function renderHome() {
    const s = S();
    const next = Math.min(s.cleared + 1, D.FLOORS.length);
    $('#tab-home').innerHTML = `
      <div class="home-head">
        <button type="button" class="base-name" data-action="rename" aria-label="待機所の名前（タップで変更）">${esc(s.base.name)}</button>
        <span class="chip dif-${s.difficulty}">${esc(Game.difficulty().name)}</span>
      </div>
      <div id="room-box"></div>
      <div id="home-props">${proposalsHTML()}</div>
      <div class="actions">
        <button type="button" class="btn btn-gold" data-action="goto" data-tab="tower">${s.worldSaved ? '塔へ' : `塔へ ${next}階`}</button>
        <button type="button" class="btn" data-action="goto" data-tab="party">編成</button>
        <button type="button" class="btn" data-action="facilities">施設</button>
        ${s.fallen.length ? `<button type="button" class="btn" data-action="memorial" aria-label="慰霊碑 ${s.fallen.length}人">🪦 ${s.fallen.length}</button>` : ''}
      </div>`;
    Room.mount($('#room-box'), {
      getHeroes: () => Object.keys(S().heroes).map(id => ({ id, trust: S().heroes[id].trust, proposal: S().proposals.some(p => p.heroId === id) })),
      getBuildings: () => D.BUILDING_ORDER.map(key => ({ key, lv: Game.buildingLv(key) })),
      fallenCount: () => S().fallen.length,
      onHero: (id) => heroDetail(id),
      onBuilding: (key) => buildingModal(key),
    });
    if (!$('#battle').hidden || !$('#modal').hidden) Room.stop();
  }

  function answerProp(pid, yes) {
    const p = S().proposals.find(x => x.id === pid);
    if (!p) return;
    const r = Game.answerProposal(pid, yes);
    if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : 'できませんでした'); return; }
    toast(yes ? `${nameOf(p.heroId)}の提案を受けた（♥+${r.trust}）${r.detail ? '・' + r.detail : ''}` : `${nameOf(p.heroId)}の提案を断った（♥${r.trust}）`);
    renderWallet();
    if (!$('#modal').hidden && $('#modal [data-hero-detail]')) heroDetail(p.heroId);
    if (currentTab === 'home') { $('#home-props').innerHTML = proposalsHTML(); Room.refresh(); }
    else renderTab();
  }

  // 施設
  function buildingEffect(key, lv) {
    if (lv <= 0) return '未建設';
    switch (key) {
      case 'gate': return `★3 ${Math.round(D.GATE_RATE3[lv] * 100)}%`;
      case 'dorm': return `${D.DORM_CAP[lv]}人`;
      case 'plaza': return `提案 ${Math.round(D.PLAZA_CHANCE[lv] * 100)}%`;
      case 'training': return `待機中も EXP ${Math.round(D.TRAINING_SHARE[lv] * 100)}%`;
      case 'strategy': return `命令 ${D.CMD_COST[lv]}行動`;
      case 'fusion': return `費用 ×${D.FUSION_COST[lv]}`;
      case 'armory': return `${D.EQUIP_TIERS[lv].name}まで`;
      case 'alchemy': return `薬 ${D.POTION_CAP[lv]}個`;
      default: return '';
    }
  }

  function facilitiesModal() {
    openModal(`<h2 id="modal-title">施設</h2>
      <ul class="fac-list">${D.BUILDING_ORDER.map(key => {
        const lv = Game.buildingLv(key);
        const info = Game.buildInfo(key);
        return `<li><button type="button" class="fac ${lv ? '' : 'unbuilt'}" data-action="building" data-key="${key}">
          <span class="fi" aria-hidden="true">${D.BUILDINGS[key].icon}</span><b>${esc(D.BUILDINGS[key].name)}</b>
          <span class="lv">${lv ? 'Lv' + lv : '—'}</span><small>${esc(buildingEffect(key, lv))}</small>${info.can ? '<span class="up" aria-label="レベルを上げられる">▲</span>' : ''}</button></li>`;
      }).join('')}</ul>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>`);
  }

  function buildingModal(key, note) {
    const def = D.BUILDINGS[key];
    const lv = Game.buildingLv(key);
    const info = Game.buildInfo(key);
    let extra = '';
    if (key === 'gate') extra = `<div class="modal-actions"><button type="button" class="btn btn-gold" data-action="goto" data-tab="tower">塔へ</button><button type="button" class="btn" data-action="goto" data-tab="gacha">召喚</button></div>`;
    if (key === 'strategy' && lv) extra = `<div class="modal-actions"><button type="button" class="btn" data-action="goto" data-tab="party">作戦</button></div>`;
    if (key === 'armory' && lv) {
      extra = `<h3>装備を作る</h3><div class="forge">${Object.keys(D.EQUIP_KINDS).map(kind => `<div class="frow"><span>${D.EQUIP_KINDS[kind].icon}</span>${[1, 2, 3, 4, 5].filter(tier => tier <= lv).map(tier =>
        `<button type="button" class="btn btn-small" data-action="forge" data-kind="${kind}" data-tier="${tier}" ${S().gold < D.EQUIP_TIERS[tier].cost ? 'disabled' : ''}>${D.EQUIP_TIERS[tier].name}<small>🪙${num(D.EQUIP_TIERS[tier].cost)}</small></button>`).join('')}</div>`).join('')}</div>
        <p class="muted">倉庫: ${S().items.length ? S().items.map(it => D.EQUIP_KINDS[it.kind].icon + D.EQUIP_TIERS[it.tier].name).join('・') : 'なし'}</p>`;
    }
    if (key === 'alchemy' && lv) {
      extra = `<h3>薬を作る <span class="muted">${Game.potionTotal()} / ${Game.potionCap()}</span></h3><div class="forge"><div class="frow">${Object.entries(D.POTIONS).map(([k, p]) =>
        `<button type="button" class="btn btn-small" data-action="brew" data-key="${k}" ${!Game.canBrew(k) || S().gold < p.cost || Game.potionTotal() >= Game.potionCap() ? 'disabled' : ''} title="${esc(p.desc)}">${p.icon}${esc(p.name)} ${S().potions[k]}<small>${Game.canBrew(k) ? '🪙' + p.cost : 'Lv' + p.lv}</small></button>`).join('')}</div></div>
        <p class="muted">薬は戦闘で英雄が自分で使う</p>`;
    }
    if (key === 'fusion' && lv) extra = `<p class="muted">英雄の「送り出す」で特性を受け継がせる</p>`;
    openModal(`
      <h2 id="modal-title">${def.icon} ${esc(def.name)} <span class="muted">${lv ? 'Lv' + lv : '未建設'}</span></h2>
      ${note ? `<p class="note">${note}</p>` : ''}
      <p class="muted">${esc(def.desc)}</p>
      <p class="effect">${esc(buildingEffect(key, lv))}${info.next ? ` → <b>${esc(buildingEffect(key, info.next))}</b>` : ''}</p>
      ${info.reason === 'max' ? '' : `<div class="modal-actions"><button type="button" class="btn btn-gold" data-action="build" data-key="${key}" ${info.can ? '' : 'disabled'}>${lv ? `Lv${info.next}` : '建てる'}　🪙${num(info.cost)}</button></div>
        ${info.reason === 'floor' ? `<p class="muted center">${info.req}階クリアで解放</p>` : ''}`}
      ${extra}
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>`, { focus: info.can ? '[data-action="build"]' : '[data-action="close"]' });
  }

  function doBuild(key) {
    const r = Game.build(key);
    if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'floor' ? `${r.req}階クリアで解放` : '最大です'); return; }
    renderWallet();
    Room.refresh();
    modalOnClose = null;
    buildingModal(key, `${r.isNew ? '建てた' : 'Lv' + r.lv + ' になった'}`);
  }

  function memorialModal() {
    const list = S().fallen.slice().reverse();
    openModal(`<h2 id="modal-title">🪦 慰霊碑</h2>
      <ul class="memorial">${list.map(f => `<li>${SP.faceImg(f.id, 'mono')}<span><b>${esc(f.name)}</b> ★${f.star} Lv${f.lv}<br><small>${f.floor}階</small></span></li>`).join('')}</ul>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>`);
  }

  // ---------- 塔 ----------
  let towerZone = null;
  function renderTower() {
    const s = S();
    const curZone = Math.min(9, Math.floor(s.cleared / D.FLOORS_PER_ZONE));
    if (towerZone === null || towerZone > curZone) towerZone = curZone;
    const z = D.ZONES[towerZone];
    const chips = D.ZONES.map((zz, i) => {
      const open = i <= curZone;
      const done = Game.zoneCleared(i);
      return `<button type="button" class="zchip ${i === towerZone ? 'on' : ''} ${done ? 'done' : ''}" data-action="zone" data-z="${i}" ${open ? '' : 'disabled'} aria-pressed="${i === towerZone}" aria-label="${i * 10 + 1}〜${i * 10 + 10}階${done ? ' 制覇' : ''}">${i * 10 + 1}<small>${done ? '✓' : open ? '' : '🔒'}</small></button>`;
    }).join('');
    const floors = [];
    for (let k = 0; k < D.FLOORS_PER_ZONE; k++) {
      const i = towerZone * D.FLOORS_PER_ZONE + k;
      const cleared = i < s.cleared, current = i === s.cleared, locked = i > s.cleared;
      floors.push(`<button type="button" class="fl ${cleared ? 'cleared' : ''} ${current ? 'current' : ''} ${isBossFloor(i) ? 'boss' : ''}" data-action="floor" data-floor="${i}" ${locked ? 'disabled' : ''}
        aria-label="${i + 1}階${isBossFloor(i) ? ' ボス' : ''}${cleared ? ' クリア' : current ? ' 挑戦できる' : ''}">${i + 1}${isBossFloor(i) ? '<small>👑</small>' : cleared ? '<small>✓</small>' : ''}</button>`);
    }
    $('#tab-tower').innerHTML = `
      <div class="tower-head"><b>${esc(z.name)}</b><span>${s.cleared} / ${D.FLOORS.length}</span></div>
      <div class="progress" aria-hidden="true"><i style="width:${s.cleared}%"></i></div>
      ${s.worldSaved ? `<p class="note gold">✦ 世界「${esc(D.WORLD_NAME)}」を救った</p>` : ''}
      <div class="zchips" role="group" aria-label="区域">${chips}</div>
      <div class="floors">${floors.reverse().join('')}</div>`;
  }

  function floorInfo(i) {
    const f = D.FLOORS[i];
    const s = S();
    const enemies = [];
    for (const w of f.waves) for (const k of w) if (!enemies.includes(k)) enemies.push(k);
    const bossKey = enemies.find(k => D.ENEMIES[k].boss);
    const first = i >= s.cleared;
    const rm = Game.difficulty().reward;
    const partyN = Game.partyIds().length;
    openModal(`
      <h2 id="modal-title">${i + 1}階 <span class="muted">${esc(f.name)}</span></h2>
      <div class="enemy-row">${enemies.map(k => `<span class="enemy-chip" title="${esc(D.ENEMIES[k].name)}">${SP.enemyImg(k)}<small>${esc(D.ENEMIES[k].name)}</small></span>`).join('')}</div>
      ${bossKey ? `<p class="note">👑 ${esc(D.ENEMIES[bossKey].trait)}</p>` : ''}
      <p class="rewards">Lv${f.lv}　🪙${num(Math.round(floorGold(i) * rm))}　✦${Math.round((first ? firstClearShards(i) : repeatShards(i)) * rm)}${first ? `　💎${Math.round(firstClearGems(i) * rm / 10) * 10}` : ''}</p>
      <div class="party-faces">${s.party.map(id => faceHTML(id)).join('')}<span class="power">${num(Game.partyPower())}</span></div>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="goto" data-tab="party">編成</button>
        <button type="button" class="btn btn-gold" data-action="start" data-floor="${i}" ${partyN ? '' : 'disabled'}>挑戦</button>
      </div>`, { focus: partyN ? '[data-action="start"]' : '[data-tab="party"]' });
  }

  function confirmStart(fi) {
    if (S().seenDeathWarning) { BV.start(fi); return; }
    openModal(`
      <h2 id="modal-title">⚠ 倒れた英雄は二度と戻らない</h2>
      <p class="muted">危ないときは「撤退」。</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="close">やめる</button>
        <button type="button" class="btn btn-gold" data-action="start-confirmed" data-floor="${fi}">挑戦する</button>
      </div>`);
  }

  // ---------- 召喚 ----------
  function renderGacha() {
    const s = S();
    const r = Game.gachaRates();
    $('#tab-gacha').innerHTML = `
      <div class="portal-card">
        <div class="portal" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="pull-row">
          <button type="button" class="btn" data-action="pull" data-n="1" ${s.gems < D.GACHA.cost1 ? 'disabled' : ''}>1回<small>💎${D.GACHA.cost1}</small></button>
          <button type="button" class="btn btn-gold" data-action="pull" data-n="10" ${s.gems < D.GACHA.cost10 ? 'disabled' : ''}>10回<small>💎${num(D.GACHA.cost10)}</small></button>
        </div>
        <p class="gacha-info">★3 ${Math.round(r[3] * 100)}%・天井まで <b id="pity-left">${Game.pityLeft()}</b>・宿舎 ${Object.keys(s.heroes).length}/${Game.dormCap()}</p>
      </div>
      ${Game.roomLeft() <= 0 ? '<p class="note">宿舎がいっぱい（新しい英雄は欠片になる）</p>' : ''}`;
  }

  function doPull(n) {
    const res = Game.pull(n);
    if (!res) { toast('召喚石が足りません'); return; }
    renderWallet();
    renderTab();
    Room.refresh();
    const best = Math.max(...res.map(r => D.heroById[r.id].rarity));
    const cards = res.map((r, i) => {
      const h = D.heroById[r.id];
      const tag = r.isNew ? '<span class="tag">NEW</span>' : `<span class="tag aw">✦${r.shards}</span>`;
      return `<div class="pull-card r${h.rarity}" style="animation-delay:${i * 0.1}s">${tag}<span class="pe">${SP.heroImg(r.id)}</span><span class="pn">${esc(h.name)}</span></div>`;
    }).join('');
    const again = S().gems >= (n === 10 ? D.GACHA.cost10 : D.GACHA.cost1);
    openModal(`
      <h2 id="modal-title" class="center">${best === 3 ? '✨ ★3' : '召喚'}</h2>
      <div class="pull-grid ${n === 1 ? 'one' : ''}">${cards}</div>
      <p class="sr-only">${res.map(r => nameOf(r.id) + '（★' + D.heroById[r.id].rarity + (r.isNew ? '、新しい仲間' : '、星の欠片') + '）').join('、')}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="close">閉じる</button>
        <button type="button" class="btn btn-gold" data-action="pull" data-n="${n}" ${again ? '' : 'disabled'}>もう一度</button>
      </div>`, { focus: again ? '[data-action="pull"]' : '[data-action="close"]' });
  }

  // ---------- 英雄 ----------
  function heroCardHTML(id, opts) {
    opts = opts || {};
    const h = D.heroById[id];
    const o = Game.owned(id);
    if (!o) return `<div class="hero-card locked" aria-label="まだ出会っていない英雄"><span class="he">${SP.heroImg(id)}</span><span class="hn">？？？</span></div>`;
    const inP = Game.inParty(id);
    const prop = S().proposals.some(p => p.heroId === id);
    return `<button type="button" class="hero-card r${o.star} ${inP ? 'in-party' : ''}" data-action="${opts.action || 'hero'}" data-id="${id}"
      aria-label="${esc(h.name)} ★${o.star} Lv${o.lv} 信頼度${o.trust}${inP ? ' 編成中' : ''}${prop ? ' 提案あり' : ''}">
      ${prop && !opts.action ? '<span class="dot" aria-hidden="true">!</span>' : ''}
      <span class="he">${opts.face ? SP.faceImg(id) : SP.heroImg(id)}</span>
      <span class="hn">${esc(h.name)}</span>
      <span class="hl">${'★'.repeat(o.star)} ${o.lv}</span>
    </button>`;
  }

  function renderHeroes() {
    const owned = Game.ownedList();
    const unknown = D.HEROES.filter(h => !Game.owned(h.id)).map(h => h.id);
    $('#tab-heroes').innerHTML = `
      <div class="hero-grid">${owned.map(id => heroCardHTML(id)).join('')}${unknown.map(id => heroCardHTML(id)).join('')}</div>`;
  }

  function landHTML(id) {
    const h = D.heroById[id];
    if (Game.memoryCount(id) < 2) return '？';
    const land = D.LANDS.find(l => l.id === h.land);
    return `${esc(land.name)}${Game.landFreed(h.land) ? ' ✦' : ''}`;
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
    const eqBtn = (kind) => {
      const tierN = o.equip[kind];
      return `<button type="button" class="eq" data-action="equip" data-id="${id}" data-kind="${kind}">${D.EQUIP_KINDS[kind].icon} ${tierN ? esc(D.EQUIP_TIERS[tierN].name) : '—'}</button>`;
    };
    openModal(`
      <div class="detail-head" data-hero-detail="${id}">
        <div class="detail-face r${o.star}">${SP.heroImg(id)}</div>
        <div class="dh">
          <h2 id="modal-title">${esc(h.name)} <span class="muted">${c.icon}${esc(c.name)}</span></h2>
          <div>${stars(o.star)} <b>Lv${o.lv}</b><span class="muted">/${maxLv}</span></div>
          <div class="trust" title="${esc(tier.desc)}">♥ ${o.trust} <span class="muted">${esc(tier.name)}</span><i class="bar"><b style="width:${o.trust}%"></b></i></div>
          <div class="expbar" aria-label="経験値"><i style="width:${atMax ? 100 : Math.floor(o.exp / expToNext(o.lv) * 100)}%"></i></div>
        </div>
      </div>
      ${note ? `<p class="note">${note}</p>` : ''}
      ${prop ? `<div class="prop-inline">${esc(Game.proposalText(prop))}${prop.data.cost ? ` <small>🪙${num(prop.data.cost)}</small>` : ''}
        <span><button type="button" class="btn btn-small btn-gold" data-action="prop-yes" data-pid="${prop.id}" ${S().gold < (prop.data.cost || 0) ? 'disabled' : ''}>受ける</button>
        <button type="button" class="btn btn-small" data-action="prop-no" data-pid="${prop.id}">断る</button></span></div>` : ''}
      <div class="stat-row"><span>HP<b>${num(st.hp)}</b></span><span>攻<b>${num(st.atk)}</b></span><span>防<b>${num(st.def)}</b></span><span>速<b>${num(st.spd)}</b></span></div>
      <div class="eq-row">${eqBtn('weapon')}${eqBtn('armor')}</div>
      <div class="chips">${o.traits.map(traitChip).join('')}<span class="trait skill" title="${esc(h.skill.desc)}">✦${esc(h.skill.name)}</span><span class="trait pers" title="${esc(D.PERSONALITIES[h.pers].desc)}">${esc(D.PERSONALITIES[h.pers].name)}</span></div>
      <details class="mem"><summary>記憶 ${Game.memoryCount(id)}/4・故郷 ${landHTML(id)}</summary>
        <ol>${h.memories.map((m, i) => i < Game.memoryCount(id) ? `<li>${esc(m)}</li>` : `<li class="locked">★${i + 2}</li>`).join('')}</ol></details>
      <div class="modal-actions four">
        <button type="button" class="btn" data-action="train" data-id="${id}" ${atMax || S().gold < cost ? 'disabled' : ''}>訓練<small>${atMax ? '最大' : '🪙' + num(cost)}</small></button>
        <button type="button" class="btn" data-action="promote" data-id="${id}" ${pi.can ? '' : 'disabled'}>昇級<small>${pi.reason === 'max' ? '★5' : pi.reason === 'level' ? 'Lv' + pi.needLv : '✦' + pi.cost}</small></button>
        <button type="button" class="btn" data-action="toggle-party" data-id="${id}" data-from="detail" ${full ? 'disabled' : ''}>${inP ? '外す' : '編成'}<small>${inP ? '編成中' : full ? '満員' : ''}</small></button>
        <button type="button" class="btn" data-action="farewell" data-id="${id}">送り出す<small>✦${Game.farewellShards(id)}</small></button>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>`,
    { focus: '[data-action="close"]' });
  }

  function equipModal(id, kind) {
    const o = Game.owned(id);
    const items = S().items.filter(it => it.kind === kind).sort((a, b) => b.tier - a.tier);
    const cur = o.equip[kind];
    const forgeT = Math.min(Game.maxForgeTier(), 5);
    const pct = (tier) => Math.round(D.EQUIP_TIERS[tier][kind === 'weapon' ? 'atk' : 'def'] * 100);
    openModal(`
      <h2 id="modal-title">${D.EQUIP_KINDS[kind].icon} ${esc(nameOf(id))}の${D.EQUIP_KINDS[kind].name}</h2>
      <p class="effect">いま: <b>${cur ? esc(D.EQUIP_TIERS[cur].name) + ` (+${pct(cur)}%)` : 'なし'}</b></p>
      <div class="forge"><div class="frow">${items.length ? items.map(it => `<button type="button" class="btn btn-small" data-action="equip-set" data-id="${id}" data-uid="${it.uid}">${esc(D.EQUIP_TIERS[it.tier].name)}<small>+${pct(it.tier)}%</small></button>`).join('') : '<span class="muted">倉庫にない</span>'}</div></div>
      ${forgeT ? `<h3>作る</h3><div class="forge"><div class="frow">${[1, 2, 3, 4, 5].filter(t => t <= forgeT).map(t => `<button type="button" class="btn btn-small" data-action="forge" data-kind="${kind}" data-tier="${t}" data-id="${id}" ${S().gold < D.EQUIP_TIERS[t].cost ? 'disabled' : ''}>${D.EQUIP_TIERS[t].name}<small>🪙${num(D.EQUIP_TIERS[t].cost)}</small></button>`).join('')}</div></div>` : '<p class="muted">武器倉庫を建てると作れる</p>'}
      <div class="modal-actions">
        ${cur ? `<button type="button" class="btn" data-action="unequip" data-id="${id}" data-kind="${kind}">外す</button>` : ''}
        <button type="button" class="btn btn-small" data-action="hero" data-id="${id}">戻る</button>
      </div>`, { focus: '[data-action="hero"]' });
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
      preview = p.mode === 'merge' ? `${esc(rn)}: ${D.TRAITS[p.id].name} Lv${p.from} → Lv${p.lv}`
        : p.mode === 'add' ? `${esc(rn)}: ＋${D.TRAITS[p.id].name} Lv${p.lv}`
        : `${esc(rn)}: ${D.TRAITS[p.replaced].name} → ${D.TRAITS[p.id].name} Lv${p.lv}`;
    }
    const enough = S().gold >= cost;
    openModal(`
      <h2 id="modal-title">${esc(h.name)}を送り出す <span class="muted">✦+${Game.farewellShards(id)}</span></h2>
      <p class="muted">元には戻せない。装備は倉庫に戻る。</p>
      ${canFuse ? `<h3>特性を受け継がせる</h3>
      <div class="seg" role="group" aria-label="受け継がせる特性">${o.traits.map((t, i) => `<button type="button" data-action="fw" data-id="${id}" data-r="${receiverId || ''}" data-i="${i}" aria-pressed="${i === traitIndex}">${esc(D.TRAITS[t.id].name)} ${['Ⅰ', 'Ⅱ', 'Ⅲ'][t.lv - 1]}</button>`).join('')}</div>
      <div class="roster" style="margin-top:8px">
        <button type="button" class="hero-card ${!receiverId ? 'picked' : ''}" data-action="fw" data-id="${id}" data-r="" data-i="${traitIndex}" aria-pressed="${!receiverId}"><span class="he big">✕</span><span class="hn">なし</span></button>
        ${others.map(x => `<button type="button" class="hero-card r${Game.owned(x).star} ${receiverId === x ? 'picked' : ''}" data-action="fw" data-id="${id}" data-r="${x}" data-i="${traitIndex}" aria-pressed="${receiverId === x}"><span class="he">${SP.faceImg(x)}</span><span class="hn">${esc(nameOf(x))}</span></button>`).join('')}
      </div>
      ${preview ? `<p class="note">${preview}　🪙${num(cost)}</p>` : ''}` : '<p class="muted">合成所を建てると特性を受け継がせられる</p>'}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="hero" data-id="${id}">やめる</button>
        <button type="button" class="btn btn-gold" data-action="fw-do" data-id="${id}" data-r="${canFuse ? receiverId || '' : ''}" data-i="${traitIndex}" ${enough ? '' : 'disabled'}>送り出す</button>
      </div>`, { focus: '[data-action="hero"]' });
  }

  // ---------- 編成・作戦 ----------
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
  function potionsLine() {
    const p = S().potions;
    const list = Object.entries(D.POTIONS).filter(([k]) => p[k] > 0).map(([k, d]) => `${d.icon}${p[k]}`);
    return list.length ? `<p class="muted">持っていく薬 ${list.join(' ')}</p>` : '';
  }

  function renderParty() {
    const s = S();
    const slots = s.party.map((id, i) => {
      if (!id) return `<div class="slot">${faceHTML(null)}</div>`;
      const row = Game.rowOf(id);
      return `<div class="slot">
        <button type="button" class="face r${Game.owned(id).star}" data-action="slot-remove" data-i="${i}" aria-label="${esc(nameOf(id))}を外す">${SP.faceImg(id)}</button>
        <button type="button" class="rowbtn ${row}" data-action="row" data-id="${id}" aria-label="${esc(nameOf(id))}: ${row === 'front' ? '前衛' : '後衛'}">${row === 'front' ? '前' : '後'}</button>
      </div>`;
    }).join('');
    $('#tab-party').innerHTML = `
      <div class="party-top"><div class="slots">${slots}</div><span class="power">⚔ ${num(Game.partyPower())}</span></div>
      <div class="actions"><button type="button" class="btn btn-small" data-action="auto-party">おまかせ</button></div>
      ${potionsLine()}
      <div class="roster">${Game.ownedList().map(id => heroCardHTML(id, { action: 'toggle-party', face: true })).join('')}</div>
      <div class="tactics" id="tactics-box">${tacticsHTML()}</div>
      <div id="hero-targets">${heroTargetsHTML()}</div>`;
  }

  function setTactic(key, raw) {
    const opt = D.TACTICS[key].options.find(o => String(o.value) === raw);
    if (!opt || !Game.tacticUnlocked(key)) return;
    S().tactics[key] = opt.value;   // 戦闘中の Battle も同じオブジェクトを見ているので、すぐ反映される
    Game.save();
    for (const box of document.querySelectorAll('#tactics-box, #battle-tactics-box')) {
      box.innerHTML = tacticsHTML();
      const b = box.querySelector(`[data-key="${key}"][data-value="${raw}"]`);
      if (b) b.focus();
    }
  }

  // ---------- 戦闘（マスターが見る塔の中の映像） ----------
  const BASE_WAIT = { act: 950, wave: 1500, end: 900 };
  const BV = {
    battle: null, floorIndex: 0, partyIds: [], wait: 0, last: 0, raf: 0, paused: false, ending: false, cmd: null,

    start(floorIndex) {
      const party = Game.partyForBattle();
      if (!party.length) { toast('編成に英雄がいません'); return; }
      closeModal();
      Room.stop();
      this.floorIndex = floorIndex;
      this.partyIds = party.map(p => p.def.id);
      this.battle = new E.Battle(Object.assign({ party, floorIndex, tactics: S().tactics }, Game.battleOptions()));
      this.paused = false;
      this.ending = false;
      this.wait = 300;
      this.closeCmd();
      window.scrollTo(0, 0);
      const el = $('#battle');
      el.hidden = false;
      el.classList.remove('boss-wave');
      document.body.style.overflow = 'hidden';
      $('#b-floor').textContent = `${floorIndex + 1}階`;
      $('#b-wave').textContent = '';
      $('#b-log').innerHTML = '';
      $('#b-proposal').hidden = true;
      this.renderList();
      this.updateSpeed();
      Field.load(this.battle, D.FLOORS[floorIndex].zone);
      Field.start();
      this.updateGauge();
      $('#b-retreat').focus({ preventScroll: true });
      this.last = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(t => this.loop(t));
    },

    stop() {
      cancelAnimationFrame(this.raf);
      this.closeCmd();
      Field.stop();
      this.battle = null;
      $('#battle').hidden = true;
      document.body.style.overflow = '';
    },

    loop(now) {
      const dt = Math.min(100, now - this.last);
      this.last = now;
      if (this.battle && !this.paused && !this.ending) {
        this.wait -= dt * S().speed * (this.cmd ? 0.25 : 1);
        if (this.wait <= 0) { const ev = this.battle.next(); if (ev) this.handle(ev); }
      }
      if (this.battle) this.raf = requestAnimationFrame(t => this.loop(t));
    },

    /** テスト用: 待ち時間なしで1つ進める */
    stepNow() {
      if (!this.battle || this.ending) return null;
      const ev = this.battle.next();
      if (ev) this.handle(ev);
      return ev;
    },

    updateSpeed() { $('#b-speed').textContent = '×' + S().speed; $('#b-speed').setAttribute('aria-label', `速さ ${S().speed}倍`); },

    // 英雄の一覧（誰が何をしているか）
    renderList() {
      const b = this.battle;
      $('#b-list').innerHTML = b.heroes.map(u => `<button type="button" class="hrow r${u.star}" id="hr-${u.id}" data-action="cmd-unit" data-uid="${u.id}" aria-label="${esc(u.name)}（タップで命令）">
        ${SP.faceImg(u.heroId)}<span class="hn">${esc(u.name)}</span><span class="ha"></span><span class="hs"></span><i class="hb"><b></b></i></button>`).join('');
      this.updateList();
    },
    updateList() {
      const b = this.battle;
      if (!b) return;
      for (const u of b.heroes) {
        const el = document.getElementById('hr-' + u.id);
        if (!el) continue;
        const r = u.hp / u.maxHp;
        const bar = el.querySelector('.hb b');
        bar.style.width = (r * 100) + '%';
        bar.className = r < 0.25 ? 'crit' : r < 0.5 ? 'low' : '';
        const act = u.alive ? u.action : 'down';
        const a = el.querySelector('.ha');
        a.textContent = D.ACTIONS[act] || '';
        a.className = 'ha a-' + act;
        el.querySelector('.hs').textContent = (u.fear > 0 ? '😨' : '') + (u.bleed > 0 ? '🩸' : '') + (u.guard ? '🛡' : '') + (u.order ? '📣' : '');
        el.classList.toggle('dead', !u.alive);
        el.classList.toggle('slack', u.alive && act === 'slack');
        el.classList.toggle('fear', u.alive && u.fear > 0);
        el.classList.toggle('bleed', u.alive && u.bleed > 0);
        el.classList.toggle('picked', !!this.cmd && this.cmd.uid === u.id);
      }
    },

    log(text, cls) {
      const ol = $('#b-log');
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      ol.appendChild(li);
      while (ol.children.length > 4) ol.firstChild.remove();
    },
    banner(text, boss) {
      const el = $('#b-banner');
      el.className = 'banner' + (boss ? ' bossb' : '');
      el.innerHTML = `<span>${esc(text)}</span>`;
      void el.offsetWidth;
      el.classList.add('show');
    },

    handle(ev) {
      const b = this.battle;
      if (ev.type === 'wave') {
        $('#b-wave').textContent = `${ev.index + 1}/${ev.total}`;
        $('#battle').classList.toggle('boss-wave', !!ev.boss);
        this.banner(ev.boss ? 'BOSS' : `WAVE ${ev.index + 1}`, ev.boss);
        if (ev.boss) this.log(`${ev.enemies.find(e => e.boss).name}が現れた`, 'sys');
        for (const n of ev.notes || []) this.log(n.text, 'n-' + n.kind);
        if (this.cmd && this.cmd.mode === 'target') this.closeCmd();
        Field.play(ev, S().speed);
        this.updateList();
        this.wait = BASE_WAIT.wave;
        return;
      }
      if (ev.type === 'end') {
        this.ending = true;
        this.closeCmd();
        $('#b-proposal').hidden = true;
        this.banner(ev.win ? '勝利' : ev.reason === 'retreat' ? '撤退' : '敗北', !ev.win);
        this.updateList();
        setTimeout(() => this.showResult(ev), BASE_WAIT.end);
        return;
      }
      // 行動
      Field.play(ev, S().speed);
      if (ev.kind === 'slack' || ev.kind === 'freeze') this.log(ev.text, 'n-slack');
      else if (ev.kind === 'skill' && ev.side === 'hero') this.log(`${b.unitById(ev.actor).name} ✦ ${ev.label}`, 'skill');
      else if (ev.kind === 'bleedout') this.log(ev.text, 'n-bleed');
      for (const h of ev.hits || []) { if (h.dead) { const u = b.unitById(h.id); if (u && u.side === 'hero' && ev.kind !== 'bleedout') this.log(`${u.name}が倒れた`, 'n-down'); } }
      for (const n of ev.notes || []) this.log(n.text, 'n-' + n.kind);
      if (ev.proposalExpired && $('#b-proposal').dataset.unit === ev.proposalExpired.unit) $('#b-proposal').hidden = true;
      if (ev.proposal) this.showProposal(ev.proposal);
      this.wait = BASE_WAIT.act;
      this.updateList();
      this.updateGauge();
      if (this.cmd) { const cu = b.unitById(this.cmd.uid); if (!cu || !cu.alive) this.closeCmd(); else if (this.cmd.mode === 'menu') this.renderCmd(); }
    },

    // 英雄からの提案
    showProposal(p) {
      const el = $('#b-proposal');
      const u = this.battle.unitById(p.unit);
      el.dataset.unit = p.unit;
      el.innerHTML = `${SP.faceImg(u.heroId)}<span>${esc(u.name)}が${esc(D.BATTLE_PROPOSALS[p.kind].name)}を提案しています</span>
        <button type="button" class="btn btn-small btn-gold" data-action="bprop-yes">受ける</button><button type="button" class="btn btn-small" data-action="bprop-no">断る</button>`;
      el.hidden = false;
      this.log(`${u.name}が${D.BATTLE_PROPOSALS[p.kind].name}を提案しています`, 'n-prop');
    },
    answerProposal(yes) {
      const b = this.battle;
      if (!b) return;
      $('#b-proposal').hidden = true;
      const r = b.answerProposal(yes);
      if (!r.ok) return;
      this.log(yes ? `提案を受けた: ${D.BATTLE_PROPOSALS[r.kind].name}` : '提案を断った', 'sys');
      if (r.end) this.handle(r.end);
      this.updateList();
    },

    // マスターの命令
    updateGauge() {
      const b = this.battle;
      const el = $('#b-gauge');
      if (!b || !el) return;
      const ready = b.canCommand();
      el.classList.toggle('ready', ready);
      el.innerHTML = Array.from({ length: b.cmdCost }, (_, i) => `<i class="${i < b.cmdCharge ? 'on' : ''}"></i>`).join('');
      el.setAttribute('aria-label', ready ? '命令できる' : `命令の準備中 ${b.cmdCharge}/${b.cmdCost}`);
    },
    openCmd(uid) {
      const b = this.battle;
      if (!b || this.ending || b.waveIndex < 0) return;
      const u = b.unitById(uid);
      if (!u || !u.alive || u.side !== 'hero') return;
      if (!b.canCommand()) { toast(`命令の準備中（${b.cmdCharge}/${b.cmdCost}）`); return; }
      this.cmd = { uid, mode: 'menu' };
      this.renderCmd();
    },
    renderCmd() {
      const b = this.battle;
      const box = $('#b-cmd');
      if (!this.cmd || !b) { box.hidden = true; return; }
      const u = b.unitById(this.cmd.uid);
      Field.setTargeting(this.cmd.mode === 'target');
      Field.setPicked(u.id);
      if (this.cmd.mode === 'target') {
        box.innerHTML = `<span class="ch">${esc(u.name)}: 敵をタップ</span><button type="button" class="btn btn-small" data-action="cmd-cancel">やめる</button>`;
      } else {
        box.innerHTML = `<span class="ch">${SP.faceImg(u.heroId)}${esc(u.name)}${u.trust < 45 ? ' <small>♥' + u.trust + '</small>' : ''}</span>
          <button type="button" class="btn btn-small" data-action="cmd-order" data-type="target">⚔️ 狙え</button>
          <button type="button" class="btn btn-small" data-action="cmd-order" data-type="skill" ${u.cd > 0 ? 'disabled' : ''}>✦ スキル</button>
          <button type="button" class="btn btn-small" data-action="cmd-order" data-type="guard">🛡️ 守れ</button>
          <button type="button" class="btn btn-small" data-action="cmd-cancel" aria-label="やめる">✕</button>`;
      }
      box.hidden = false;
      this.updateList();
      const first = box.querySelector('button:not(:disabled)');
      if (first) first.focus({ preventScroll: true });
    },
    closeCmd() {
      this.cmd = null;
      const box = $('#b-cmd');
      if (box) { box.hidden = true; box.innerHTML = ''; }
      Field.setTargeting(false);
      Field.setPicked(null);
      if (this.battle) this.updateList();
    },
    chooseOrder(type) {
      if (!this.cmd) return;
      if (type === 'target') { this.cmd.mode = 'target'; this.renderCmd(); return; }
      this.issue(type, null);
    },
    tapUnit(uid) {
      const u = this.battle && this.battle.unitById(uid);
      if (!u) return;
      if (this.cmd && this.cmd.mode === 'target' && u.side === 'enemy') { this.issue('target', uid); return; }
      if (u.side === 'hero') this.openCmd(uid);
    },
    issue(type, targetId) {
      const b = this.battle;
      const uid = this.cmd.uid;
      const r = b.command(uid, type, targetId);
      this.closeCmd();
      if (!r.ok) { toast(r.reason === 'charge' ? '命令の準備中' : r.reason === 'cd' ? 'スキルはまだ使えない' : '命令できない'); return; }
      S().stats.commands = (S().stats.commands || 0) + 1;
      this.log(r.text, r.obeyed ? 'sys' : 'n-slack');
      this.updateList();
      this.updateGauge();
    },

    showResult(ev) {
      const b = this.battle;
      const win = ev.win;
      const reward = Game.applyBattleResult(this.floorIndex, win, this.partyIds, ev.fallen, ev.reason, { mvp: ev.mvp, trustDelta: ev.trustDelta, potionsUsed: ev.potionsUsed });
      renderWallet();
      const fi = this.floorIndex;
      const hasNext = win && fi + 1 < D.FLOORS.length && Game.isUnlocked(fi + 1);
      const mvpStats = ev.heroStats.find(h => h.heroId === ev.mvp);
      const mvp = ev.mvp ? `<div class="mvp">${SP.heroImg(ev.mvp)}<span><small>MVP</small><b>${esc(nameOf(ev.mvp))}</b>${mvpStats ? `<span class="muted">与えた ${num(mvpStats.dmg)}・回復 ${num(mvpStats.heal)}</span>` : ''}</span></div>` : '';
      const slackers = ev.heroStats.filter(h => h.slack > 0).map(h => `${nameOf(h.heroId)} ${h.slack}回`);
      const ups = reward.levelUps.length ? `<ul class="ups">${reward.levelUps.map(l => `<li>${SP.faceImg(l.id)}<span>${esc(nameOf(l.id))}<b>Lv${l.from}→${l.to}</b></span></li>`).join('')}</ul>` : '';
      const lost = reward.fallen.length ? `<ul class="ups lost">${reward.fallen.map(f => `<li>${SP.faceImg(f.id, 'mono')}<span>${esc(f.name)}<b>戦死</b></span></li>`).join('')}</ul>` : '';
      const title = win ? '勝利' : ev.reason === 'retreat' ? '撤退' : '敗北';
      openModal(`
        <p class="result-title ${win ? 'win' : 'lose'}" id="modal-title">${title}</p>
        <p class="muted center">${fi + 1}階${reward.firstClear ? '・初クリア' : ''}</p>
        ${reward.worldSaved ? `<p class="note gold">✦ 世界「${esc(D.WORLD_NAME)}」を救った</p>` : ''}
        ${reward.freedZone && !reward.worldSaved ? `<p class="note gold">✦ ${esc(reward.freedZone.name)}を取り戻した${reward.freedZone.natives.length ? `（${reward.freedZone.natives.map(nameOf).join('・')} ♥+10）` : ''}</p>` : ''}
        ${mvp}${lost}${ups}
        <p class="rewards center">${reward.gold ? '🪙+' + num(reward.gold) + '　' : ''}${reward.shards ? '✦+' + num(reward.shards) + '　' : ''}${reward.gems ? '💎+' + num(reward.gems) : ''}${reward.trainExp ? `　🎯+${reward.trainExp}` : ''}</p>
        ${slackers.length ? `<p class="muted center">サボり: ${esc(slackers.join('・'))}</p>` : ''}
        ${reward.newcomer ? `<p class="note">流れ者の英雄「${esc(nameOf(reward.newcomer))}」が来た</p>` : ''}
        ${reward.proposal ? `<p class="note">${esc(Game.proposalText(reward.proposal))}</p>` : ''}
        <div class="modal-actions">
          ${hasNext ? `<button type="button" class="btn btn-gold" data-action="start" data-floor="${fi + 1}">次へ ${fi + 2}階</button>` : ''}
          <button type="button" class="btn ${hasNext ? '' : 'btn-gold'}" data-action="start" data-floor="${fi}" ${Game.partyIds().length ? '' : 'disabled'}>${win ? 'もう一度' : '再挑戦'}</button>
          <button type="button" class="btn" data-action="result-home">待機所</button>
        </div>`, { locked: true, onClose: () => { if (this.battle === b) { this.stop(); Room.refresh(); showTab(currentTab); } } });
    },

    openTactics() {
      if (!this.battle || this.ending) return;
      this.closeCmd();
      this.paused = true;
      openModal(`<h2 id="modal-title">作戦</h2><div class="tactics" id="battle-tactics-box">${tacticsHTML()}</div>
        <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="close">戻る</button></div>`,
      { focus: '[data-action="close"]', onClose: () => { this.paused = false; this.last = performance.now(); } });
    },
    retreat() {
      if (!this.battle || this.ending) return;
      this.closeCmd();
      this.paused = true;
      openModal(`<h2 id="modal-title">撤退する？</h2><p class="muted">報酬はなし。生きている英雄は帰れる。</p>
        <div class="modal-actions"><button type="button" class="btn" data-action="close">続ける</button><button type="button" class="btn btn-gold" data-action="retreat-yes">撤退</button></div>`,
      { focus: '[data-action="close"]', onClose: () => { this.paused = false; this.last = performance.now(); } });
    },
  };

  // ---------- 遊び方 ----------
  function showIntro() {
    const s = S();
    openModal(`
      <h2 id="modal-title">✦ 星喚の塔</h2>
      <p>滅びかけた世界「${esc(D.WORLD_NAME)}」。塔の<b>100階</b>を制覇すれば世界を救える。</p>
      <ul class="intro">
        <li>🔮 英雄を呼ぶ（記憶をなくした、この世界の人々）</li>
        <li>📜 編成と作戦を決める</li>
        <li>🗼 戦闘は英雄まかせ。英雄をタップで命令</li>
        <li>💬 英雄の声は聞こえない。提案に答えて信頼を深める</li>
      </ul>
      <p class="note">⚠ 倒れた英雄は二度と戻らない</p>
      <p class="muted center">${esc(s.base.name)}・難易度 ${esc(Game.difficulty().name)}</p>
      <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="close">はじめる</button></div>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="reset">最初からやり直す</button></div>`,
    { onClose: () => { if (!S().seenIntro) { S().seenIntro = true; Game.save(); } } });
  }

  // ---------- 操作 ----------
  document.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tabbtn');
    if (tabBtn) { showTab(tabBtn.dataset.tab); return; }
    const el = e.target.closest('[data-action]');
    if (!el || el.disabled) return;
    const a = el.dataset.action;
    const id = el.dataset.id;
    switch (a) {
      case 'close': closeModal(); break;
      case 'goto': {
        if (BV.battle) BV.stop();
        modalOnClose = null;
        closeModal();
        showTab(el.dataset.tab);
        break;
      }
      case 'intro': showIntro(); break;
      case 'rename': {
        const n = prompt('待機所の名前', S().base.name);
        if (n !== null && Game.renameBase(n)) renderTab();
        break;
      }
      case 'facilities': facilitiesModal(); break;
      case 'building': buildingModal(el.dataset.key); break;
      case 'build': doBuild(el.dataset.key); break;
      case 'memorial': memorialModal(); break;
      case 'prop-yes': answerProp(Number(el.dataset.pid), true); break;
      case 'prop-no': answerProp(Number(el.dataset.pid), false); break;
      case 'forge': {
        const r = Game.forge(el.dataset.kind, Number(el.dataset.tier), id || null);
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : '作れません'); break; }
        renderWallet();
        toast(`${D.EQUIP_TIERS[r.item.tier].name}の${D.EQUIP_KINDS[r.item.kind].name}を作った`);
        if (id) heroDetail(id); else buildingModal('armory');
        break;
      }
      case 'brew': {
        const r = Game.brew(el.dataset.key);
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'cap' ? 'これ以上持てない' : '作れません'); break; }
        renderWallet();
        buildingModal('alchemy');
        break;
      }
      case 'zone': towerZone = Number(el.dataset.z); renderTower(); { const b = $(`[data-action="zone"][data-z="${towerZone}"]`); if (b) b.focus(); } break;
      case 'floor': floorInfo(Number(el.dataset.floor)); break;
      case 'start': {
        const fi = Number(el.dataset.floor);
        if (BV.battle) { modalOnClose = null; $('#modal').hidden = true; BV.stop(); }
        confirmStart(fi);
        break;
      }
      case 'start-confirmed': S().seenDeathWarning = true; Game.save(); BV.start(Number(el.dataset.floor)); break;
      case 'pull': doPull(Number(el.dataset.n)); break;
      case 'hero': heroDetail(id); break;
      case 'equip': equipModal(id, el.dataset.kind); break;
      case 'equip-set': Game.equip(id, Number(el.dataset.uid)); heroDetail(id); renderTab(); break;
      case 'unequip': Game.unequip(id, el.dataset.kind); heroDetail(id); renderTab(); break;
      case 'train': {
        const r = Game.train(id);
        if (r.ok) toast(`${nameOf(id)} Lv${r.lv}`); else if (r.reason === 'gold') toast('金貨が足りません');
        renderWallet(); renderTab(); heroDetail(id);
        const next = $('#modal [data-action="train"]'); if (next && !next.disabled) next.focus();
        break;
      }
      case 'promote': {
        const r = Game.promote(id);
        if (!r.ok) break;
        renderWallet(); renderTab();
        heroDetail(id, `✨ ★${r.star}${r.newTrait ? `・新しい特性「${esc(D.TRAITS[r.newTrait.id].name)}」` : ''}${r.memory ? `<br><span class="memory-flash">記憶がよみがえった ──「${esc(r.memory)}」</span>` : ''}`);
        break;
      }
      case 'farewell': farewellModal(id, null, 0); break;
      case 'fw': farewellModal(id, el.dataset.r || null, Number(el.dataset.i)); break;
      case 'fw-do': {
        const name = nameOf(id);
        const r = Game.farewell(id, el.dataset.r || null, Number(el.dataset.i));
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'last' ? '最後の一人は送り出せません' : '送り出せません'); break; }
        modalOnClose = null;
        closeModal();
        Room.refresh(); renderWallet(); renderTab();
        toast(`${name}は故郷へ帰った（✦+${r.shards}）${r.inherit ? `・${nameOf(r.inherit.receiver)}が「${D.TRAITS[r.inherit.id].name}」を受け継いだ` : ''}`);
        break;
      }
      case 'toggle-party': {
        const r = Game.togglePartyMember(id);
        if (r === 'full') toast('編成がいっぱい（5人まで）');
        renderTab();
        if (el.dataset.from === 'detail') heroDetail(id);
        else { const again = document.querySelector(`#tab-party [data-action="toggle-party"][data-id="${id}"]`); if (again) again.focus(); }
        break;
      }
      case 'slot-remove': Game.removeFromSlot(Number(el.dataset.i)); renderTab(); break;
      case 'row': Game.toggleRow(id); renderTab(); { const again = document.querySelector(`#tab-party [data-action="row"][data-id="${id}"]`); if (again) again.focus(); } break;
      case 'auto-party': Game.autoParty(); renderTab(); break;
      case 'tactic': setTactic(el.dataset.key, el.dataset.value); break;
      case 'hero-target': Game.setHeroTarget(id, el.dataset.value || null); $('#hero-targets').innerHTML = heroTargetsHTML(); break;
      case 'reset':
        if (confirm('保存データをすべて消して、最初からやり直しますか？（元に戻せません）')) { Game.reset(); lastWallet = {}; Room.stop(); window.location.reload(); }
        break;
      case 'result-home': closeModal(); showTab('home'); break;
      case 'retreat-yes': {
        modalOnClose = null;
        closeModal();
        BV.paused = false;
        const ev = BV.battle && BV.battle.retreat();
        if (ev) BV.handle(ev);
        break;
      }
      case 'cmd-unit': BV.openCmd(el.dataset.uid); break;
      case 'cmd-order': BV.chooseOrder(el.dataset.type); break;
      case 'cmd-cancel': BV.closeCmd(); break;
      case 'bprop-yes': BV.answerProposal(true); break;
      case 'bprop-no': BV.answerProposal(false); break;
      default: break;
    }
  });

  $('#b-speed').addEventListener('click', () => { S().speed = S().speed >= 3 ? 1 : S().speed + 1; Game.save(); BV.updateSpeed(); });
  $('#b-tactics').addEventListener('click', () => BV.openTactics());
  $('#b-retreat').addEventListener('click', () => BV.retreat());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && BV.cmd && $('#modal').hidden) { e.preventDefault(); BV.closeCmd(); return; }
    if (e.key === 'Escape' && !$('#modal').hidden) { if ($('#modal').dataset.locked) return; e.preventDefault(); closeModal(); }
  });
  $('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !$('#modal').dataset.locked) closeModal(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Room.stop();
    else if (currentTab === 'home' && $('#battle').hidden && $('#modal').hidden) Room.start();
  });

  // ---------- 起動 ----------
  Field.mount($('#b-field'), { onTap: (uid) => BV.tapUnit(uid) });
  Game.init();
  showTab('home');
  if (!S().seenIntro) showIntro();

  window.__game = { Game, BV, showTab, D, Room, Field };

  // ホーム画面に追加（PWA）: http(s) で開いたときだけ有効にする
  if (/^https?:$/.test(location.protocol)) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.appendChild(link);
    if ('serviceWorker' in navigator) window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
  }
})();
