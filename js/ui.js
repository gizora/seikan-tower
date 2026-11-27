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
  const ACT_NAME = { train: '訓練中', social: '広場で過ごしている', rest: '休んでいる', wander: '歩き回っている', work: '働いている' };
  const actName = (o) => o.activity === 'work' && o.work && D.BUILDINGS[o.work] ? `${D.BUILDINGS[o.work].name}で働いている` : (ACT_NAME[o.activity] || '');
  const LACK = { gold: '金貨', food: '食料', wood: '木材と石材', ore: '鉱石', mana: '魔石' };
  const lackText = (r) => LACK[r] ? `${LACK[r]}が足りません` : r === 'floor' ? 'まだ解放されていません' : r === 'wall' ? '城壁のレベルを上げてください' : r === 'max' ? '最大です' : 'できません';
  const resNum = (k) => Math.floor(S().res[k] || 0);
  /** 報酬の表（gold / gems / shards / 物資）を短い文にする */
  function rewardText(rw) {
    const out = [];
    if (rw.gold) out.push('🪙' + num(rw.gold));
    if (rw.gems) out.push('💎' + num(rw.gems));
    if (rw.shards) out.push('✦' + num(rw.shards));
    for (const k of D.RES_KEYS) if (rw[k]) out.push(D.RESOURCES[k].icon + num(rw[k]));
    return out.join(' ');
  }
  /** 費用ボタンの小さい文字（金貨と物資） */
  const priceText = (p) => Game.costText(p) || '無料';

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
    const cap = Game.resCap();
    $('#res-bar').innerHTML = D.RES_KEYS.map(k => {
      const v = resNum(k);
      return `<span class="res ${v >= cap ? 'full' : ''} ${k === 'food' && S().hungry ? 'empty' : ''}" title="${D.RESOURCES[k].name}"><span aria-hidden="true">${D.RESOURCES[k].icon}</span><span class="sr-only">${D.RESOURCES[k].name}</span><b>${num(v)}</b><i style="--p:${Math.min(1, v / cap)}"></i></span>`;
    }).join('');
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
      getFort: () => S().fort,
      getHeroes: () => Object.keys(S().heroes).map(id => ({ id, activity: S().heroes[id].activity, work: S().heroes[id].work, injured: S().heroes[id].injured > 0, proposal: S().proposals.some(p => p.heroId === id), quarrel: quarrelOf(id) })),
      getBuildings: () => D.BUILDING_ORDER.map(key => ({ key, lv: Game.buildingLv(key) })),
      fallenCount: () => S().fallen.length,
      onHero: (id) => heroDetail(id),
      onBuilding: (key) => (key === 'fort' ? fortModal() : buildingModal(key)),
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
    if (s.hungry) list.push('<button type="button" class="notice hunger" data-action="building" data-key="farm"><span>🍞 食料が尽きた。英雄たちが空腹になっている</span></button>');
    else if (D.RES_KEYS.some(k => resNum(k) >= Game.resCap())) list.push('<button type="button" class="notice full" data-action="fort"><span>📦 物資がいっぱい。城壁を広げるとたくさんためられる</span></button>');
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
      case 'farm': case 'lumber': case 'mine': return Object.entries(D.PRODUCTION[key]).map(([r, p]) => `${D.RESOURCES[r].icon}+${Math.round(p.base * lv * 60)}/時`).join(' ');
      default: return '';
    }
  }
  function upgradeHTML(key) {
    const lv = Game.buildingLv(key);
    const info = Game.buildInfo(key);
    if (info.reason === 'max') return '<p class="muted center">レベル最大</p>';
    return `<div class="upgrade"><span>${esc(buildingEffect(key, lv))} → <b>${esc(buildingEffect(key, info.next))}</b></span>
      <button type="button" class="btn btn-small ${info.can ? 'btn-gold' : ''}" data-action="build" data-key="${key}" ${info.can ? '' : 'disabled'}>${lv ? 'Lv' + info.next : '建てる'}<small>${info.reason === 'floor' ? info.req + '階クリア' : info.reason === 'wall' ? '城壁Lv' + info.next + 'が必要' : esc(priceText(info.price))}</small></button></div>`;
  }

  function buildingModal(key, note) {
    const def = D.BUILDINGS[key];
    const lv = Game.buildingLv(key);
    let body = '';
    if (key === 'gate') { const dd = Game.dailyToday(); body = `<div class="big-actions"><button type="button" class="btn btn-gold big" data-action="tower">🗼 塔へ<small>${S().cleared} / ${D.FLOORS.length}階</small></button></div>
      <div class="big-actions"><button type="button" class="btn big" data-action="daily">${dd.icon} 曜日のダンジョン<small>${D.DAY_NAMES[new Date().getDay()]}曜日・${esc(dd.name)}・あと${Game.dailyTriesLeft()}回</small></button><button type="button" class="btn big" data-action="gacha">🔮 召喚</button></div>`; }
    else if (D.BUILDINGS[key].prod) body = prodHTML(key);
    else if (key === 'dorm') body = heroListHTML();
    else if (key === 'strategy') body = lv ? `<div class="big-actions"><button type="button" class="btn btn-gold big" data-action="party">📜 編成と作戦</button></div>` : `<div class="big-actions"><button type="button" class="btn big" data-action="party">📜 編成</button></div><p class="muted center">建てると細かい作戦が使える</p>`;
    else if (key === 'plaza') body = plazaHTML();
    else if (key === 'training') body = trainingHTML();
    else if (key === 'armory' && lv) body = `<h3>装備を作る</h3><div class="forge">${Object.keys(D.EQUIP_KINDS).map(kind => `<div class="frow"><span>${D.EQUIP_KINDS[kind].icon}</span>${[1, 2, 3, 4, 5].filter(tier => tier <= lv).map(tier =>
      `<button type="button" class="btn btn-small" data-action="forge" data-kind="${kind}" data-tier="${tier}" ${Game.lack(Game.forgePrice(tier)) ? 'disabled' : ''}>${D.EQUIP_TIERS[tier].name}<small>${priceText(Game.forgePrice(tier))}</small></button>`).join('')}</div>`).join('')}</div>
      <p class="muted">倉庫: ${S().items.length ? S().items.map(it => D.EQUIP_KINDS[it.kind].icon + D.EQUIP_TIERS[it.tier].name).join('・') : 'なし'}</p>`;
    else if (key === 'alchemy' && lv) body = `<h3>薬を作る <span class="muted">${Game.potionTotal()} / ${Game.potionCap()}</span></h3><div class="forge"><div class="frow">${Object.entries(D.POTIONS).map(([k, p]) =>
      `<button type="button" class="btn btn-small" data-action="brew" data-key="${k}" ${!Game.canBrew(k) || Game.lack({ gold: p.cost, mana: p.mana }) || Game.potionTotal() >= Game.potionCap() ? 'disabled' : ''} title="${esc(p.desc)}">${p.icon}${esc(p.name)} ${S().potions[k]}<small>${Game.canBrew(k) ? priceText({ gold: p.cost, mana: p.mana }) : 'Lv' + p.lv}</small></button>`).join('')}</div></div><p class="muted">戦闘で英雄が自分で使う</p>`;
    else if (key === 'fusion' && lv) body = `<p class="muted">英雄の「送り出す」で特性を受け継がせる</p>`;
    openModal(`
      <h2 id="modal-title">${def.icon} ${esc(def.name)} <span class="muted">${lv ? 'Lv' + lv : '未建設'}</span></h2>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      ${body}
      ${upgradeHTML(key)}
      ${close}`);
  }

  // ---------- 第6版: 物資の施設・陣地・物資の一覧 ----------
  function prodHTML(key) {
    const lv = Game.buildingLv(key);
    const per = D.PRODUCTION[key];
    if (!lv) return `<p class="muted">建てると${Object.keys(per).map(r => D.RESOURCES[r].name).join('と')}を作れる</p>`;
    const workers = Game.workersAt(key);
    const cap = Game.resCap();
    const rows = Object.entries(per).map(([r, p]) => `<div class="prod-row"><span class="pi">${D.RESOURCES[r].icon}</span><span>${D.RESOURCES[r].name}<b>${num(resNum(r))}</b><small>/ ${num(cap)}</small></span>
      <i class="meter"><b style="width:${Math.min(100, resNum(r) / cap * 100)}%"></b></i><em>+${Math.round((p.base * lv + p.worker * workers.length) * 60)}/時</em></div>`).join('');
    return `<div class="prod">${rows}</div>
      <p class="muted">働いている英雄 ${workers.length ? workers.map(id => faceHTML(id)).join('') : 'なし'}</p>
      <p class="muted">英雄は自分の考えで手伝いに来る。人が多いほどたくさん作れる。施設は城壁のレベルまで上げられる（城壁 Lv${Game.fortLv('wall')}）</p>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="fort">🏰 陣地を広げる</button><button type="button" class="btn btn-small" data-action="supplies">📦 物資の一覧</button></div>`;
  }
  function fortEffect(k, lv) {
    if (k === 'wall') return `物資 ${num(D.RES_CAP[lv])}まで・施設 Lv${lv}まで`;
    if (!lv) return 'なし';
    return `偵察 +${lv * 1.5}マス${lv >= 3 ? '・手掛かり' : ''}${lv >= 5 ? '・巣' : ''}`;
  }
  function fortModal(note) {
    const row = (k) => {
      const def = D.FORT[k], lv = Game.fortLv(k), info = Game.fortInfo(k);
      const btn = info.reason === 'max' ? '<p class="muted center">レベル最大</p>' : `<div class="upgrade"><span>${esc(fortEffect(k, lv))} → <b>${esc(fortEffect(k, info.next))}</b></span>
        <button type="button" class="btn btn-small ${info.can ? 'btn-gold' : ''}" data-action="fort-build" data-key="${k}" ${info.can ? '' : 'disabled'}>Lv${info.next}<small>${info.reason === 'floor' ? info.req + '階クリア' : esc(priceText(info.cost))}</small></button></div>`;
      return `<section class="fort-row"><h3>${def.icon} ${def.name} <span class="muted">Lv${lv}</span></h3><p class="muted">${esc(def.desc)}</p>${btn}</section>`;
    };
    openModal(`<h2 id="modal-title">🏰 陣地</h2>
      ${note ? `<p class="note">${esc(note)}</p>` : ''}
      <p class="muted">城壁を広げると、外側に畑・石切り場・鉱山を大きくできる。見張り塔は塔の中の偵察に役立つ。</p>
      ${row('wall')}${row('tower')}${close}`);
  }
  function suppliesModal() {
    const cap = Game.resCap();
    const ph = Game.productionPerHour();
    const rows = D.RES_KEYS.map(k => `<div class="prod-row"><span class="pi">${D.RESOURCES[k].icon}</span><span>${D.RESOURCES[k].name}<b>${num(resNum(k))}</b><small>/ ${num(cap)}</small></span>
      <i class="meter"><b style="width:${Math.min(100, resNum(k) / cap * 100)}%"></b></i><em class="${ph[k] < 0 ? 'neg' : ''}">${ph[k] >= 0 ? '+' : ''}${Math.round(ph[k])}/時</em></div>`).join('');
    openModal(`<h2 id="modal-title">📦 物資</h2>
      ${S().hungry ? '<p class="note">食料が尽きている。英雄は空腹で、訓練しても伸びず、信頼度が下がっていく</p>' : ''}
      <div class="prod">${rows}</div>
      <p class="muted">食料は英雄が食べ、塔へ持っていく（1人 🍞${D.RATION_PER_HERO}）。木材と石材は建物と陣地に、鉱石は装備に、魔石は薬と強い装備に使う。曜日のダンジョンでもたくさん手に入る。</p>
      <div class="big-actions">${D.PROD_BUILDINGS.map(k => `<button type="button" class="btn" data-action="building" data-key="${k}">${D.BUILDINGS[k].icon} ${D.BUILDINGS[k].name}<small>${Game.buildingLv(k) ? 'Lv' + Game.buildingLv(k) : '未建設'}</small></button>`).join('')}</div>
      <div class="modal-actions"><button type="button" class="btn" data-action="fort">🏰 陣地</button></div>${close}`);
  }

  function doBuild(key) {
    const r = Game.build(key);
    if (!r.ok) { toast(r.reason === 'floor' ? `${r.req}階クリアで解放` : lackText(r.reason)); return; }
    renderWallet();
    Room.refresh();
    modalOnClose = null;
    buildingModal(key, r.isNew ? '建てた' : 'Lv' + r.lv + ' になった');
  }

  function plazaHTML() {
    const s = S();
    const pp = (p) => ({ gold: p.data.cost || 0, food: p.data.food || 0 });
    const props = s.proposals.map(p => `<li>${faceHTML(p.heroId)}<span class="pt">${esc(Game.proposalText(p))}${p.data.cost || p.data.food ? ` <small>${Game.costText(pp(p))}</small>` : ''}</span>
      <button type="button" class="btn btn-small btn-gold" data-action="prop-yes" data-pid="${p.id}" ${Game.lack(pp(p)) ? 'disabled' : ''}>受ける</button>
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
      return `<li class="${h.activity === 'train' ? 'on' : ''}">${faceHTML(id)}<span class="tn">${esc(nameOf(id))}<small>${h.activity === 'train' ? '訓練中' : esc(actName(h))}</small></span>
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

  // ---------- 塔（次元の門から）: 1階から積み上がっていく塔 ----------
  let towerSeen = null;          // 前に塔を見たときのクリア階数（新しく積み上がった階を光らせる）
  function towerModal() {
    const s = S();
    const N = D.FLOORS.length;
    const fresh = towerSeen != null && s.cleared > towerSeen ? [towerSeen, s.cleared] : null;
    towerSeen = s.cleared;
    let rows = '';
    for (let i = N - 1; i >= 0; i--) {
      const zi = Math.floor(i / D.FLOORS_PER_ZONE);
      const cleared = i < s.cleared, current = i === s.cleared, locked = i > s.cleared;
      const w = Math.round(100 - (i / (N - 1)) * 38);
      if ((i + 1) % D.FLOORS_PER_ZONE === 0) rows += `<div class="tz ${Game.zoneCleared(zi) ? 'done' : ''} ${locked && !current ? 'fog' : ''}" style="--w:${w}%"><span>${zi * 10 + 1}–${zi * 10 + 10}階</span><b>${esc(D.ZONES[zi].name)}</b>${Game.zoneCleared(zi) ? '<em>取り戻した</em>' : ''}</div>`;
      const just = fresh && i >= fresh[0] && i < fresh[1];
      rows += `<button type="button" class="tf ${cleared ? 'cleared' : ''} ${current ? 'current' : ''} ${locked ? 'locked' : ''} ${isBossFloor(i) ? 'boss' : ''} ${just ? 'just' : ''}" style="--w:${w}%;--d:${just ? (i - fresh[0]) * 0.12 : 0}s" data-action="floor" data-floor="${i}" ${locked ? 'disabled' : ''} aria-label="${i + 1}階${cleared ? ' クリア済み' : current ? ' 次の階' : ''}">
        <span class="tn">${i + 1}</span><span class="tw" aria-hidden="true"></span>${isBossFloor(i) ? '<span class="tb" aria-hidden="true">👑</span>' : ''}${current ? '<em>NEXT</em>' : ''}</button>`;
    }
    openModal(`
      <h2 id="modal-title">🗼 塔 <span class="muted">${s.cleared} / ${N}階</span></h2>
      <div class="tower-wrap">
        <div class="tower-meter" aria-hidden="true"><i style="height:${s.cleared / N * 100}%"></i><span style="bottom:${s.cleared / N * 100}%">${s.cleared}</span></div>
        <div class="tower-stack" id="tower-stack">
          <div class="tspire ${s.worldSaved ? 'lit' : ''}" aria-hidden="true"><i></i></div>
          ${rows}
          <div class="tbase"><span>⛩ 待機室「${esc(s.base.name)}」</span></div>
        </div>
      </div>${close}`, { back: () => buildingModal('gate'), focus: '.tf.current, .tf.cleared' });
    const stack = $('#tower-stack');
    const cur = $('.tf.current', stack) || $('.tf.cleared', stack);
    if (stack && cur) {
      const target = Math.max(0, cur.offsetTop - stack.clientHeight * 0.55);
      stack.scrollTop = fresh ? target + 160 : target;
      if (fresh) requestAnimationFrame(() => stack.scrollTo({ top: target, behavior: 'smooth' }));
    }
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
      <p class="muted">任務: ？？？（中で手掛かりを調べるとわかる）</p>
      <div class="enemy-row">${enemies.map(k => `<span class="enemy-chip">${SP.enemyImg(k)}<small>${esc(D.ENEMIES[k].name)}</small></span>`).join('')}</div>
      ${bossKey ? `<p class="note">👑 ${esc(D.ENEMIES[bossKey].trait)}</p>` : ''}
      <p class="rewards">Lv${f.lv}　🪙${num(Math.round(floorGold(i) * rm))}　✦${Math.round((first ? firstClearShards(i) : repeatShards(i)) * rm)}${first ? `　💎${Math.round(firstClearGems(i) * rm / 10) * 10}` : ''}</p>
      ${partyBoxHTML()}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="party">編成</button>
        <button type="button" class="btn btn-gold" data-action="start" data-floor="${i}" ${ids.length ? '' : 'disabled'}>挑戦</button>
      </div>`, { back: towerModal, focus: ids.length ? '[data-action="start"]' : '[data-action="party"]' });
  }
  /** 出かける編成と、持っていく食料 */
  function partyBoxHTML() {
    const ids = Game.partyIds();
    const injured = S().party.filter(id => id && Game.isInjured(id));
    const need = ids.length * D.RATION_PER_HERO;
    return `<div class="party-faces">${S().party.map(id => faceHTML(id, id && Game.isInjured(id) ? 'inj' : '')).join('')}<span class="power">⚔ ${num(Game.partyPower())}</span></div>
      <p class="muted">持っていく食料 🍞${need}${resNum('food') < need ? '　<span class="rel-bad">足りない（空腹で戦う・能力 -15%）</span>' : ''}${Game.fortLv('tower') ? `・見張り塔の偵察 Lv${Game.fortLv('tower')}` : ''}</p>
      ${injured.length ? `<p class="muted">けがをしている ${injured.map(nameOf).map(esc).join('・')} は行けない</p>` : ''}`;
  }
  // ---------- 第6版: 曜日のダンジョン ----------
  function dailyModal() {
    const def = Game.dailyToday();
    const left = Game.dailyTriesLeft();
    const today = new Date().getDay();
    const ids = Game.partyIds();
    const week = D.DAILY.map(d => `<span class="wd ${d.day === today ? 'on' : ''}" title="${esc(d.name)}"><b>${D.DAY_NAMES[d.day]}</b><span aria-hidden="true">${d.icon}</span></span>`).join('');
    const tiers = D.DAILY_TIERS.map((t, i) => {
      const open = Game.dailyTierOpen(i);
      const rw = Game.dailyReward(def, i, true, 0);
      return `<button type="button" class="btn tier ${open ? '' : 'lock'}" data-action="daily-start" data-tier="${i}" ${open && left > 0 && ids.length ? '' : 'disabled'}>
        <span class="tt">${t.name}<small>Lv${t.lv}</small></span><small>${open ? esc(rewardText(rw)) + (def.reward.exp ? `・経験値×${def.reward.exp}` : '') : '🔒 ' + t.req + '階クリア'}</small></button>`;
    }).join('');
    openModal(`
      <h2 id="modal-title">${def.icon} ${esc(def.name)} <span class="muted">${D.DAY_NAMES[today]}曜日</span></h2>
      <div class="week" role="list" aria-label="曜日ごとのダンジョン">${week}</div>
      <p class="muted">${esc(def.desc)}。任務ははじめからわかっている（魔物の巣をすべて潰す）。物資の箱を見つけると報酬が増え、負けても箱の分は持ち帰れる。</p>
      <p class="tries">今日あと <b>${left}</b> / ${D.DAILY_TRIES} 回</p>
      <div class="tiers">${tiers}</div>
      ${partyBoxHTML()}
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="party">編成</button></div>`, { back: () => buildingModal('gate') });
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
          <div><span class="stars">${'★'.repeat(o.star)}</span> <b>Lv${o.lv}</b><span class="muted">/${maxLv}</span> <span class="act">${o.injured ? '🩹けが' : esc(actName(o))}</span></div>
          <div class="trust" title="${esc(tier.desc)}">♥ ${o.trust} <span class="muted">${esc(tier.name)}</span><i class="bar"><b style="width:${o.trust}%"></b></i></div>
          <div class="expbar" aria-label="経験値"><i style="width:${atMax ? 100 : Math.floor(o.exp / expToNext(o.lv) * 100)}%"></i></div>
        </div>
      </div>
      ${note ? `<p class="note">${note}</p>` : ''}
      ${prop ? `<div class="prop-inline">${esc(Game.proposalText(prop))}${prop.data.cost || prop.data.food ? ` <small>${Game.costText({ gold: prop.data.cost, food: prop.data.food })}</small>` : ''}
        <span><button type="button" class="btn btn-small btn-gold" data-action="prop-yes" data-pid="${prop.id}" ${Game.lack({ gold: prop.data.cost || 0, food: prop.data.food || 0 }) ? 'disabled' : ''}>受ける</button>
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
      ${forgeT ? `<h3>作る</h3><div class="forge"><div class="frow">${[1, 2, 3, 4, 5].filter(t => t <= forgeT).map(t => `<button type="button" class="btn btn-small" data-action="forge" data-kind="${kind}" data-tier="${t}" data-id="${id}" ${Game.lack(Game.forgePrice(t)) ? 'disabled' : ''}>${D.EQUIP_TIERS[t].name}<small>${priceText(Game.forgePrice(t))}</small></button>`).join('')}</div></div>` : '<p class="muted">武器倉庫を建てると作れる</p>'}
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

    start(floorIndex, dailyTier) {
      const party = Game.partyForBattle().filter(p => !Game.isInjured(p.def.id));
      if (!party.length) { toast('塔に行ける英雄がいません'); return; }
      let extra = {};
      this.daily = null;
      if (dailyTier != null) {
        const r = Game.dailyStart(dailyTier);
        if (!r.ok) { toast(r.reason === 'tries' ? '今日はもう入れません（また明日）' : r.reason === 'floor' ? `${r.req}階クリアで解放` : '入れません'); return; }
        extra = r.opts;
        this.daily = { def: r.def, tier: dailyTier };
        floorIndex = r.opts.floorIndex;
      }
      const hungry = Game.takeRations(party.length);
      closeModal();
      this.floorIndex = floorIndex;
      this.partyIds = party.map(p => p.def.id);
      this.ex = new E.Expedition(Object.assign({ party, floorIndex, tactics: S().tactics }, Game.battleOptions(), extra, { hungry }));
      if (hungry) toast('食料が足りない。英雄たちは空腹のまま出かけた');
      this.paused = false; this.ending = false; this.cmd = null; this.orderMode = false;
      Room.stop();
      $('#scene').hidden = true;
      $('#hud').hidden = true;
      $('#expedition').hidden = false;
      document.body.classList.add('in-tower');
      $('#x-floor').textContent = this.ex.label;
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
      while (ol.children.length > 5) ol.firstChild.remove();
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
      let text = m.revealed ? `${md.name}: ${md.desc}` : `任務: ？？？（手掛かり ${m.clues}/${D.CLUE_NEED}）`;
      if (m.revealed && m.kind === 'hunt') text += `（${m.progress}/${x.camps.length}）`;
      if (m.revealed && m.kind === 'relic') text += `（${m.progress}/3）`;
      if (m.revealed && m.kind === 'survive' && m.surviveStarted && !m.done) text += `（あと${Math.ceil(m.surviveLeft)}秒）`;
      if (x.caches.length && !m.exitOpen) text += `・物資の箱 ${x.caches.filter(c => c.taken).length}/${x.caches.length}`;
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
      const ACT = D.ACTIONS;
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
        el.querySelector('.hs').textContent = (u.fear > 0 ? '😨' : '') + (u.bleed > 0 ? '🩸' : '') + (u.hungry ? '🍞' : '') + (u.order ? '📣' : '');
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
      const daily = this.daily;
      const reward = Game.applyBattleResult(this.floorIndex, win, this.partyIds, e.fallen, e.reason, daily ? Object.assign({}, e, { daily: { def: daily.def, tier: daily.tier, caches: e.caches } }) : e);
      renderWallet();
      const fi = this.floorIndex;
      const hasNext = !daily && win && fi + 1 < D.FLOORS.length && Game.isUnlocked(fi + 1);
      const dailyLeft = daily ? Game.dailyTriesLeft() : 0;
      const sup = {};
      for (const k of D.RES_KEYS) if (reward.supplies && reward.supplies[k]) sup[k] = reward.supplies[k];
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
        <p class="muted center">${esc(x.label)}・任務「${esc(md.name)}」${e.mission.done ? '達成' : e.mission.revealed ? '未達成' : 'は不明のまま'}${reward.firstClear ? '・初クリア' : ''}${daily ? `・物資の箱 ${e.caches}/3` : e.clues ? `・手掛かり ${e.clues}` : ''}</p>
        ${reward.worldSaved ? `<p class="note gold">✦ 世界「${esc(S().base.name)}」を救った</p>` : ''}
        ${reward.freedZone && !reward.worldSaved ? `<p class="note gold">✦ ${esc(reward.freedZone.name)}を取り戻した${reward.freedZone.natives.length ? `（${reward.freedZone.natives.map(nameOf).join('・')} ♥+10）` : ''}</p>` : ''}
        ${(e.betrayals || []).length ? `<p class="note">⚔ ${e.betrayals.map(b => `${esc(nameOf(b.by))}が${esc(D.heroById[b.victim].name)}を裏切った`).join('、')}</p>` : ''}
        ${mvp}${lost}${upsHTML}
        ${grow.length ? `<p class="muted center grow">成長: ${grow.join(' / ')}</p>` : ''}
        <p class="rewards center">${reward.gold ? '🪙+' + num(reward.gold) + '　' : ''}${reward.shards ? '✦+' + num(reward.shards) + '　' : ''}${reward.gems ? '💎+' + num(reward.gems) : ''}</p>
        ${Object.keys(sup).length ? `<p class="rewards center sup">持ち帰った物資 ${D.RES_KEYS.filter(k => sup[k]).map(k => D.RESOURCES[k].icon + '+' + num(sup[k])).join('　')}</p>` : ''}
        ${slackers.length ? `<p class="muted center">サボり: ${esc(slackers.join('・'))}</p>` : ''}
        ${reward.newcomer ? `<p class="note">流れ者の英雄「${esc(nameOf(reward.newcomer))}」が来た</p>` : ''}
        <div class="modal-actions">
          ${hasNext ? `<button type="button" class="btn btn-gold" data-action="start" data-floor="${fi + 1}">次へ ${fi + 2}階</button>` : ''}
          ${daily ? `<button type="button" class="btn btn-gold" data-action="daily-start" data-tier="${daily.tier}" ${dailyLeft > 0 && Game.partyIds().length ? '' : 'disabled'}>もう一度<small>今日あと${dailyLeft}回</small></button>`
            : `<button type="button" class="btn ${hasNext ? '' : 'btn-gold'}" data-action="start" data-floor="${fi}" ${Game.partyIds().length ? '' : 'disabled'}>${win ? 'もう一度' : '再挑戦'}</button>`}
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
      ${Object.keys(sum.res || {}).length ? `<h3>物資</h3><p class="rewards">${D.RES_KEYS.filter(k => sum.res[k] && Math.abs(sum.res[k]) >= 1).map(k => `${D.RESOURCES[k].icon}${sum.res[k] > 0 ? '+' : ''}${num(Math.round(sum.res[k]))}`).join('　')}</p>` : ''}
      ${sum.hungry ? '<p class="note">食料が尽きて、英雄たちが空腹になった。畑を大きくするか、食料を手に入れよう</p>' : ''}
      ${close}`);
    return true;
  }
  function clockTick() {
    if (!$('#expedition').hidden || !$('#bye').hidden) return;
    const sum = Game.advance(Date.now(), true);
    const escalated = Game.updateQuarrels(Date.now(), true);
    for (const r of escalated || []) {
      if (r.kind === 'murder') { Room.refresh(); renderNotices(); openModal(`<h2 id="modal-title">⚠ 殺し合い</h2><p class="center">${esc(r.text)}</p><p class="muted center">仲裁が間に合わなかった。待機室の英雄たちのマスターへの信頼が下がった。</p>${close}`); }
      else toast(r.text);
    }
    if (sum || (escalated && escalated.length)) { renderWallet(); renderNotices(); Room.refresh(); }
    else if (S().quarrels.length) renderNotices();
  }

  // ---------- ログアウト（保存して、アプリを閉じる） ----------
  function logout() {
    Game.save();
    closeModal();
    Room.stop();
    $('#app').classList.add('closed');
    $('#bye').hidden = false;
    $('#bye button').focus({ preventScroll: true });
    // ホーム画面のアプリやスクリプトで開いた窓なら閉じられる。閉じられなければ「おつかれさまでした」の画面のまま
    try { window.close(); } catch (e) { /* ブラウザが閉じるのを止めた */ }
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
        <li>🗼 塔の中は英雄まかせ。一緒に探索し、手掛かりを調べると任務がわかる。英雄をタップで命令</li>
        <li>📦 畑・石切り場・鉱山で物資を作る。城壁を広げて陣地を大きくする</li>
        <li>📅 次元の門から曜日のダンジョンへ（曜日ごとに手に入る物資が変わる）</li>
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
      case 'logout':
        openModal(`<h2 id="modal-title">⏻ ログアウト</h2><p>保存して、アプリを閉じますか？</p><p class="muted">待機室の時間は、閉じているあいだも進みます（最大4時間）。</p>
          <div class="modal-actions"><button type="button" class="btn" data-action="close">やめる</button><button type="button" class="btn btn-gold" data-action="logout-yes">ログアウト</button></div>`, { focus: '[data-action="close"]' });
        break;
      case 'logout-yes': logout(); break;
      case 'bye-back': $('#bye').hidden = true; $('#app').classList.remove('closed'); clockTick(); Room.start(); refreshHome(); $('#logout').focus({ preventScroll: true }); break;
      case 'supplies': suppliesModal(); break;
      case 'fort': fortModal(); break;
      case 'fort-build': { const r = Game.buildFort(el.dataset.key); if (!r.ok) { toast(r.reason === 'floor' ? `${r.req}階クリアで解放` : lackText(r.reason)); break; } renderWallet(); Room.refresh(); renderNotices(); fortModal(`${D.FORT[el.dataset.key].name}が Lv${r.lv} になった`); break; }
      case 'daily': dailyModal(); break;
      case 'daily-start': {
        const tier = Number(el.dataset.tier);
        if (EX.ex) { modalOnClose = null; $('#modal').hidden = true; EX.stop(); }
        EX.start(0, tier);
        break;
      }
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
        if (!r.ok) { toast(lackText(r.reason)); break; }
        toast(r.accepted ? `${nameOf(p.heroId)}の提案を受けた（♥+${r.trust}）` : `${nameOf(p.heroId)}の提案を断った（♥${r.trust}）`);
        renderWallet(); renderNotices(); Room.refresh();
        if ($('#modal [data-hero-detail]')) heroDetail(p.heroId); else buildingModal('plaza');
        break;
      }
      case 'forge': {
        const r = Game.forge(el.dataset.kind, Number(el.dataset.tier), id || null);
        if (!r.ok) { toast(lackText(r.reason)); break; }
        renderWallet();
        toast(`${D.EQUIP_TIERS[r.item.tier].name}の${D.EQUIP_KINDS[r.item.kind].name}を作った`);
        if (id) heroDetail(id); else buildingModal('armory');
        break;
      }
      case 'brew': { const r = Game.brew(el.dataset.key); if (!r.ok) { toast(r.reason === 'cap' ? 'これ以上持てない' : lackText(r.reason)); break; } renderWallet(); buildingModal('alchemy'); break; }
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
  $('#x-speed').addEventListener('click', () => { S().speed = S().speed >= 4 ? 1 : S().speed * 2; Game.save(); EX.updateSpeed(); toast(S().speed === 1 ? 'ふつうの速さ（英雄と一緒に歩く速さ）' : `${S().speed}倍の速さ`); });
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
    else if ($('#expedition').hidden && $('#bye').hidden) { clockTick(); Room.start(); }
  });

  // ---------- 起動 ----------
  Game.init();
  if (S().speed !== 1 && S().speed !== 2 && S().speed !== 4) S().speed = 1;
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
