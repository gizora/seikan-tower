/* 星喚の塔 — 画面 */
(function () {
  'use strict';
  const D = window.GameData;
  const E = window.BattleEngine;
  const SP = window.Sprites;
  const Room = window.Room;
  const { Game, expToNext, floorExp, floorGold, firstClearGems, firstClearShards, repeatShards, traitSlots } = window.GameCore;

  // ---------- 小さな道具 ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = (n) => Number(n).toLocaleString('ja-JP');
  const S = () => Game.state;
  const starsHTML = (star, rarity) => `<span class="stars" aria-label="★${star}">${'★'.repeat(star)}<span class="star-empty">${'☆'.repeat(D.MAX_STAR - star)}</span></span>`;
  const traitText = (t) => {
    const def = D.TRAITS[t.id];
    const v = def.vals[t.lv - 1];
    return def.desc.replace('{p}', Math.round(v * 100)).replace('{v}', v);
  };
  const traitChip = (t) => `<span class="trait" title="${esc(traitText(t))}">${esc(D.TRAITS[t.id].name)}<b>${'Ⅰ Ⅱ Ⅲ'.split(' ')[t.lv - 1]}</b></span>`;

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
      if (lastWallet[k] != null && lastWallet[k] !== S()[k]) {
        const c = el.parentElement;
        c.classList.remove('bump');
        void c.offsetWidth;
        c.classList.add('bump');
      }
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
    const target = (opts.focus && $(opts.focus, m)) || $('.btn-gold:not(:disabled), button:not(:disabled)', m);
    if (target) target.focus({ preventScroll: true });
    $('.modal-card', m).scrollTop = 0;     // いつも一番上（誰の画面か）から見せる
  }
  function closeModal() {
    const m = $('#modal');
    if (m.hidden) return;
    m.hidden = true;
    $('#modal-body').innerHTML = '';
    const cb = modalOnClose;
    modalOnClose = null;
    if (cb) cb();
    if (modalReturnFocus && document.body.contains(modalReturnFocus) && !modalReturnFocus.closest('[hidden]')) modalReturnFocus.focus();
    modalReturnFocus = null;
  }

  // ---------- タブ ----------
  let currentTab = 'home';
  function showTab(name) {
    currentTab = name;
    for (const sec of document.querySelectorAll('.tab')) sec.hidden = sec.id !== 'tab-' + name;
    for (const b of document.querySelectorAll('.tabbtn')) {
      if (b.dataset.tab === name) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
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
    if (!id) return `<div class="face empty ${extra || ''}" aria-hidden="true">＋</div>`;
    const h = Game.owned(id);
    return `<div class="face r${h ? h.star : 1} ${extra || ''}" aria-hidden="true">${SP.heroImg(id)}</div>`;
  }

  // ---------- 待機室（ホーム） ----------
  function recentFallenNames() {
    const s = S();
    return s.fallen.filter(f => s.stats.battles - f.battle < 4).map(f => f.name);
  }

  function renderHome() {
    const s = S();
    const talkable = Game.ownedList().filter(id => Game.canTalk(id)).length;
    const fallen = s.fallen.slice().reverse();
    $('#tab-home').innerHTML = `
      <div id="room-box"></div>
      <p class="muted room-hint">英雄をタップすると話しかけられます。右の扉から塔へ。</p>
      <div class="panel">
        <div class="party-strip">
          <div class="party-faces">${s.party.map(id => faceHTML(id)).join('')}</div>
          <div class="power">戦力<br><b>${num(Game.partyPower())}</b></div>
        </div>
        <div class="party-actions">
          <button type="button" class="btn btn-gold" data-action="goto" data-tab="tower">塔へ向かう（${Math.min(s.cleared + 1, D.FLOORS.length)}階）</button>
          <button type="button" class="btn" data-action="goto" data-tab="party">編成・作戦</button>
        </div>
        <p class="muted" style="margin:8px 0 0">待機室の英雄 ${Object.keys(s.heroes).length}人・話せる英雄 ${talkable}人（戦闘のたびにまた話せる）</p>
      </div>
      ${fallen.length ? `<h3>🪦 慰霊碑</h3><div class="panel memorial"><ul>${fallen.slice(0, 12).map(f =>
        `<li>${SP.heroImg(f.id, 'mono')}<span><b>${esc(f.name)}</b> ★${f.star} Lv${f.lv}<br><span class="muted">${f.floor}階で倒れた</span></span></li>`).join('')}</ul>
        ${fallen.length > 12 ? `<p class="muted">ほか ${fallen.length - 12} 人</p>` : ''}</div>` : ''}
      <div class="party-actions"><button type="button" class="btn btn-small" data-action="intro">遊び方</button></div>`;
    Room.mount($('#room-box'), {
      getHeroes: () => Object.keys(S().heroes).map(id => ({ id, trust: S().heroes[id].trust })),
      fallenCount: () => S().fallen.length,
      recentFallen: recentFallenNames,
      onHero: (id) => heroDetail(id),
      onDoor: () => showTab('tower'),
    });
    if (!$('#battle').hidden || !$('#modal').hidden) Room.stop();
  }

  // ---------- 塔 ----------
  function renderTower() {
    const s = S();
    const floors = D.FLOORS.map((f, i) => {
      const cleared = i < s.cleared;
      const current = i === s.cleared;
      const locked = i > s.cleared;
      const boss = f.waves.some(w => w.some(k => D.ENEMIES[k].boss));
      const state = cleared ? '✓ クリア' : current ? '挑戦！' : '🔒';
      return `<li><button type="button" class="floor ${cleared ? 'cleared' : ''} ${current ? 'current' : ''} ${boss ? 'boss' : ''}"
        data-action="floor" data-floor="${i}" ${locked ? 'disabled' : ''} aria-label="${i + 1}階 ${esc(f.name)} ${state}">
        <span class="fnum">${i + 1}<small>階</small></span>
        <span><span class="fname">${esc(f.name)}</span><br><span class="fsub">敵 Lv${f.lv}・${f.waves.length}ウェーブ</span></span>
        <span class="fstate">${state}</span></button></li>`;
    }).reverse().join('');
    const allClear = s.cleared >= D.FLOORS.length;
    $('#tab-tower').innerHTML = `
      <div class="panel">
        <div class="party-strip">
          <div class="party-faces">${s.party.map(id => faceHTML(id)).join('')}</div>
          <div class="power">戦力<br><b>${num(Game.partyPower())}</b></div>
        </div>
        <div class="party-actions">
          <button type="button" class="btn btn-small" data-action="goto" data-tab="party">編成・作戦を変える</button>
        </div>
      </div>
      ${allClear ? '<p class="panel" style="text-align:center">🎉 塔の頂上に到達しました！</p>' : ''}
      <ol class="tower" aria-label="塔の階">${floors}</ol>
      <p class="tower-base">― 塔の入口 ―</p>`;
    // 今の階が見えるようにする
    const cur = $('#tab-tower .floor.current');
    if (cur && cur.scrollIntoView) setTimeout(() => cur.scrollIntoView({ block: 'center' }), 0);
  }

  function floorInfo(i) {
    const f = D.FLOORS[i];
    const s = S();
    const enemies = [];
    for (const w of f.waves) for (const k of w) if (!enemies.includes(k)) enemies.push(k);
    const traits = enemies.filter(k => D.ENEMIES[k].trait)
      .map(k => `<p class="advice"><b>${esc(D.ENEMIES[k].name)}</b>: ${esc(D.ENEMIES[k].trait)}</p>`).join('');
    const firstClear = i >= s.cleared;
    const partyN = Game.partyIds().length;
    const lowTrust = Game.partyIds().filter(id => Game.owned(id).trust < 45).map(id => D.heroById[id].name);
    openModal(`
      <h2 id="modal-title">${i + 1}階 ${esc(f.name)}</h2>
      <p class="muted">敵 Lv${f.lv}・${f.waves.length}ウェーブ</p>
      <div class="enemy-row">${enemies.map(k => `<span class="enemy-chip">${SP.enemyImg(k)}<small>${esc(D.ENEMIES[k].name)}</small></span>`).join('')}</div>
      ${traits}
      <ul class="reward-list">
        <li><span>経験値（1人あたり）</span><b>${floorExp(i)}</b></li>
        <li><span>🪙 金貨</span><b>${floorGold(i)}</b></li>
        <li><span>✦ 星の欠片</span><b>${firstClear ? firstClearShards(i) : repeatShards(i)}</b></li>
        ${firstClear ? `<li><span>💎 初クリア報酬</span><b>${firstClearGems(i)}</b></li>` : ''}
      </ul>
      <div class="party-strip"><div class="party-faces">${s.party.map(id => faceHTML(id)).join('')}</div>
        <div class="power">戦力<br><b>${num(Game.partyPower())}</b></div></div>
      <p class="muted" style="margin:6px 0 0">撤退の作戦: <b>${D.TACTICS.retreat.options.find(o => o.value === s.tactics.retreat).name}</b></p>
      ${lowTrust.length ? `<p class="advice">信頼度が低い英雄（${esc(lowTrust.join('・'))}）は、作戦に従わないことがあります。</p>` : ''}
      ${partyN === 0 ? '<p class="advice">編成に英雄がいません。「編成」で英雄を入れてください。</p>' : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="goto" data-tab="party">編成・作戦</button>
        <button type="button" class="btn btn-gold" data-action="start" data-floor="${i}" ${partyN === 0 ? 'disabled' : ''}>挑戦する</button>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>`,
    { focus: partyN === 0 ? '[data-tab="party"]' : '[data-action="start"]' });
  }

  function confirmStart(fi) {
    if (S().seenDeathWarning) { BV.start(fi); return; }
    openModal(`
      <h2 id="modal-title">⚠ 塔に挑む前に</h2>
      <p>塔の中で<b>倒れた英雄は、二度と戻りません。</b>待機室からいなくなり、名前は慰霊碑に刻まれます。</p>
      <ul class="muted" style="padding-left:1.2em">
        <li>戦闘中の「撤退」ボタンで、いつでも残りの英雄を連れて逃げられます。</li>
        <li>作戦の「撤退」で、危なくなったら自動で逃げるようにもできます。</li>
        <li>仲間を失うと、ほかの英雄のマスターへの信頼が下がります。</li>
      </ul>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="goto" data-tab="party">作戦を見直す</button>
        <button type="button" class="btn btn-gold" data-action="start-confirmed" data-floor="${fi}">わかった、挑戦する</button>
      </div>`);
  }

  // ---------- 召喚 ----------
  function renderGacha() {
    const s = S();
    $('#tab-gacha').innerHTML = `
      <div class="banner-card">
        <div class="banner-orb" aria-hidden="true">🔮</div>
        <div class="banner-title">英雄召喚</div>
        <div class="muted" style="color:#e6dcff">星の力で、塔に挑む英雄を呼び出そう</div>
        <div class="pull-row">
          <button type="button" class="btn" data-action="pull" data-n="1" ${s.gems < D.GACHA.cost1 ? 'disabled' : ''}>1回召喚<small>💎 ${D.GACHA.cost1}</small></button>
          <button type="button" class="btn btn-gold" data-action="pull" data-n="10" ${s.gems < D.GACHA.cost10 ? 'disabled' : ''}>10回召喚<small>💎 ${num(D.GACHA.cost10)}・★2以上1体確定</small></button>
        </div>
        <div class="rates"><span>★3 ${D.GACHA.rates[3] * 100}%</span><span>★2 ${D.GACHA.rates[2] * 100}%</span><span>★1 ${D.GACHA.rates[1] * 100}%</span></div>
        <p class="muted" style="color:#e6dcff;margin:8px 0 0">あと <b id="pity-left">${Game.pityLeft()}</b> 回で ★3 確定</p>
      </div>
      <h3>しくみ</h3>
      <div class="panel muted">
        <p style="margin:0 0 6px">💎 召喚石は、塔の階を初めてクリアするともらえます（ボスの階は多め）。</p>
        <p style="margin:0 0 6px">すでにいる英雄が出ると、✦ 星の欠片に変わります（★1: ${D.GACHA.dupShards[1]}・★2: ${D.GACHA.dupShards[2]}・★3: ${D.GACHA.dupShards[3]}）。星の欠片は★の昇級に使います。</p>
        <p style="margin:0 0 6px">英雄はそれぞれ「特性」を持って生まれてきます。同じ英雄でも特性はちがいます。</p>
        <p style="margin:0">★1 の英雄も、育てて昇級すれば ★5 まで強くなれます。</p>
      </div>`;
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
      return `<div class="pull-card r${h.rarity}" style="animation-delay:${i * 0.12}s">${tag}
        <span class="pe">${SP.heroImg(r.id)}</span><span class="ps">${'★'.repeat(h.rarity)}</span><span class="pn">${esc(h.name)}</span></div>`;
    }).join('');
    const canAgain = S().gems >= (n === 10 ? D.GACHA.cost10 : D.GACHA.cost1);
    openModal(`
      <h2 id="modal-title">${best === 3 ? '✨ ★3 英雄が現れた！ ✨' : '召喚結果'}</h2>
      <div class="pull-grid ${n === 1 ? 'one' : ''}">${cards}</div>
      <p class="sr-only">${res.map(r => D.heroById[r.id].name + '（★' + D.heroById[r.id].rarity + (r.isNew ? '、新しい仲間' : '、星の欠片に変わった') + '）').join('、')}</p>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="close">閉じる</button>
        <button type="button" class="btn btn-gold" data-action="pull" data-n="${n}" ${canAgain ? '' : 'disabled'}>もう一度（💎${num(n === 10 ? D.GACHA.cost10 : D.GACHA.cost1)}）</button>
      </div>`, { focus: canAgain ? '[data-action="pull"]' : '[data-action="close"]' });
  }

  // ---------- 英雄 ----------
  function trustBar(id) {
    const h = Game.owned(id);
    const tier = D.TRUST_TIERS[Game.trustTier(id)];
    return `<div class="trust"><span>♥ 信頼度 <b>${h.trust}</b>（${tier.name}）</span><div class="trustbar"><i style="width:${h.trust}%"></i></div>
      <span class="muted">${esc(tier.desc)}</span></div>`;
  }

  function heroCardHTML(id, opts) {
    opts = opts || {};
    const h = D.heroById[id];
    const o = Game.owned(id);
    if (!o) {
      return `<div class="hero-card locked" aria-label="まだ出会っていない英雄"><span class="he">${SP.heroImg(id)}</span><span class="hn">？？？</span><span class="hs">${'★'.repeat(h.rarity)}</span></div>`;
    }
    const inP = Game.inParty(id);
    const talk = Game.canTalk(id);
    return `<button type="button" class="hero-card r${o.star} ${inP ? 'in-party' : ''}" data-action="${opts.action || 'hero'}" data-id="${id}"
      aria-label="${esc(h.name)} ★${o.star} ${D.CLASSES[h.cls].name} レベル${o.lv} 信頼度${o.trust}${inP ? ' 編成中' : ''}">
      <span class="cls" aria-hidden="true">${D.CLASSES[h.cls].icon}</span>
      ${talk && !opts.action ? '<span class="talk-dot" aria-hidden="true">💬</span>' : ''}
      <span class="he">${SP.heroImg(id)}</span>
      <span class="hn">${esc(h.name)}</span>
      <span class="hs">${'★'.repeat(o.star)}</span>
      <span class="hl">Lv ${o.lv} <span class="heart">♥${o.trust}</span></span>
    </button>`;
  }

  function renderHeroes() {
    const owned = Game.ownedList();
    const unknown = D.HEROES.filter(h => !Game.owned(h.id)).map(h => h.id);
    $('#tab-heroes').innerHTML = `
      <h2>英雄 <span class="muted">待機室に ${owned.length}人</span></h2>
      <p class="muted" style="margin-top:-6px">タップすると、話す・訓練・昇級・送り出すができます。💬 は今話せる英雄です。</p>
      <div class="hero-grid">${owned.map(id => heroCardHTML(id)).join('')}${unknown.map(id => heroCardHTML(id)).join('')}</div>
      <h3>データ</h3>
      <div class="panel muted">
        <p style="margin:0 0 8px">戦闘 ${num(S().stats.battles)} 回（勝利 ${num(S().stats.wins)}）・召喚 ${num(S().stats.pulls)} 回・昇級 ${num(S().stats.promotions)} 回・失った英雄 ${num(S().stats.lost)} 人</p>
        <button type="button" class="btn btn-small" data-action="reset">データを消して最初から</button>
      </div>`;
  }

  function heroDetail(id, note) {
    const h = D.heroById[id];
    const o = Game.owned(id);
    if (!o) { closeModal(); return; }
    Room.stop();
    const st = Game.stats(id);
    const maxLv = Game.maxLv(id);
    const atMax = o.lv >= maxLv;
    const need = expToNext(o.lv);
    const cost = Game.trainCost(id);
    const enough = cost !== null && S().gold >= cost;
    const inP = Game.inParty(id);
    const full = !inP && !S().party.includes(null);
    const c = D.CLASSES[h.cls];
    const pi = Game.promoteInfo(id);
    const promoteLabel = pi.reason === 'max' ? '★最大'
      : `★${o.star + 1} に昇級（✦${pi.cost}）`;
    const promoteNote = pi.reason === 'level' ? `Lv${pi.needLv} になると昇級できます` : pi.reason === 'shards' ? `星の欠片が足りません（${S().shards} / ${pi.cost}）` : '';
    const slots = traitSlots(o.star);
    openModal(`
      <div class="detail-head">
        <div class="detail-face r${o.star}">${SP.heroImg(id)}</div>
        <div>
          <div class="muted">${esc(h.title)}・${c.icon} ${c.name}</div>
          <h2 id="modal-title" style="margin:0">${esc(h.name)}</h2>
          <div>${starsHTML(o.star)} <span class="muted">（生まれは★${h.rarity}）</span></div>
        </div>
      </div>
      ${note ? `<p class="talk-line">${note}</p>` : ''}
      ${trustBar(id)}
      <div style="margin-top:10px"><b>Lv ${o.lv}</b> <span class="muted">/ ${maxLv}</span>
        <span class="muted" style="float:right">${atMax ? 'レベル最大' : `次まで ${need - o.exp} EXP`}</span>
        <div class="expbar"><i style="width:${atMax ? 100 : Math.floor(o.exp / need * 100)}%"></i></div></div>
      <div class="stat-grid">
        <div class="stat"><small>HP</small><b>${num(st.hp)}</b></div>
        <div class="stat"><small>${c.healer ? '攻撃/回復' : '攻撃'}</small><b>${num(st.atk)}</b></div>
        <div class="stat"><small>防御</small><b>${num(st.def)}</b></div>
        <div class="stat"><small>速さ</small><b>${num(st.spd)}</b></div>
      </div>
      <dl class="kv">
        <dt>特性 ${o.traits.length}/${slots}</dt><dd>${o.traits.map(t => `<div>${traitChip(t)} <span class="muted">${esc(traitText(t))}</span></div>`).join('')}
          ${o.star < 5 ? `<span class="muted">★${o.star < 3 ? 3 : 5} で特性の枠が増える</span>` : ''}</dd>
        <dt>スキル</dt><dd><b>${esc(h.skill.name)}</b>（${h.skill.cd}回に1回）<br><span class="muted">${esc(h.skill.desc)}</span></dd>
        <dt>性格</dt><dd><b>${D.PERSONALITIES[h.pers].name}</b><br><span class="muted">${esc(D.PERSONALITIES[h.pers].desc)}</span></dd>
        <dt>配置</dt><dd>${Game.rowOf(id) === 'front' ? '前衛（敵に狙われやすい）' : '後衛（狙われにくい）'}</dd>
      </dl>
      <div class="modal-actions">
        <button type="button" class="btn btn-gold" data-action="talk" data-id="${id}" ${Game.canTalk(id) ? '' : 'disabled'}>${Game.canTalk(id) ? '💬 話す（信頼度 +6）' : '💬 次の戦闘のあとで話せる'}</button>
      </div>
      <div class="modal-actions">
        <button type="button" class="btn" data-action="train" data-id="${id}" ${atMax || !enough ? 'disabled' : ''}>${atMax ? 'レベル最大' : `訓練 → Lv${o.lv + 1}（🪙${num(cost)}）`}</button>
        <button type="button" class="btn" data-action="promote" data-id="${id}" ${pi.can ? '' : 'disabled'}>${promoteLabel}</button>
      </div>
      ${promoteNote ? `<p class="muted" style="text-align:right;margin:4px 0 0">${promoteNote}</p>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="toggle-party" data-id="${id}" data-from="detail" ${full ? 'disabled' : ''}>${inP ? '編成から外す' : full ? '編成がいっぱい' : '編成に入れる'}</button>
        <button type="button" class="btn" data-action="farewell" data-id="${id}">送り出す</button>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-small" data-action="close">閉じる</button></div>`,
    { focus: '[data-action="close"]', onClose: () => { Room.clearSelection(); if (currentTab === 'home' && $('#battle').hidden) Room.start(); } });
  }

  function farewellModal(id, receiverId, traitIndex) {
    const h = D.heroById[id];
    const o = Game.owned(id);
    traitIndex = traitIndex || 0;
    const others = Game.ownedList().filter(x => x !== id);
    if (others.length === 0) { toast('最後の一人は送り出せません'); return; }
    const trait = o.traits[traitIndex];
    let preview = '';
    let cost = 0;
    if (receiverId && trait) {
      const p = Game.inheritPreview(receiverId, trait);
      const rn = D.heroById[receiverId].name;
      cost = Game.inheritCost(trait);
      preview = p.mode === 'merge'
        ? `${esc(rn)}の「${D.TRAITS[p.id].name}」が Lv${p.from} → Lv${p.lv} に合成されます${p.wasted ? '（最大 Lv3 を超えた分はなくなります）' : ''}`
        : p.mode === 'add' ? `${esc(rn)}に「${D.TRAITS[p.id].name} Lv${p.lv}」が加わります`
        : `${esc(rn)}の「${D.TRAITS[p.replaced].name} Lv${p.replacedLv}」が「${D.TRAITS[p.id].name} Lv${p.lv}」に入れ替わります`;
    }
    const enough = S().gold >= cost;
    openModal(`
      <h2 id="modal-title">${esc(h.name)}を送り出す</h2>
      <p class="muted" style="margin-top:-6px">送り出した英雄は故郷へ帰り、待機室からいなくなります（元には戻せません）。</p>
      <ul class="reward-list"><li><span>✦ 星の欠片</span><b>+${Game.farewellShards(id)}</b></li></ul>
      <h3>特性を受け継がせる（合成）</h3>
      <p class="muted" style="margin-top:-4px">${esc(h.name)}の特性を1つ、ほかの英雄に受け継がせられます。同じ特性ならレベルが上がります。</p>
      <div class="seg" role="group" aria-label="受け継がせる特性">${o.traits.map((t, i) => `<button type="button" data-action="fw-trait" data-id="${id}" data-r="${receiverId || ''}" data-i="${i}" aria-pressed="${i === traitIndex}">${esc(D.TRAITS[t.id].name)} ${'Ⅰ Ⅱ Ⅲ'.split(' ')[t.lv - 1]}</button>`).join('')}</div>
      <div class="roster" style="margin-top:8px">
        <button type="button" class="hero-card ${!receiverId ? 'picked' : ''}" data-action="fw-recv" data-id="${id}" data-r="" data-i="${traitIndex}" aria-pressed="${!receiverId}"><span class="he" style="font-size:22px">✕</span><span class="hn">受け継がない</span></button>
        ${others.map(x => `<button type="button" class="hero-card r${Game.owned(x).star} ${receiverId === x ? 'picked' : ''}" data-action="fw-recv" data-id="${id}" data-r="${x}" data-i="${traitIndex}" aria-pressed="${receiverId === x}">
          <span class="he">${SP.heroImg(x)}</span><span class="hn">${esc(D.heroById[x].name)}</span><span class="hl">${Game.owned(x).traits.map(t => D.TRAITS[t.id].name).join('・')}</span></button>`).join('')}
      </div>
      ${preview ? `<p class="advice">${preview}<br>費用: 🪙 ${num(cost)}${enough ? '' : '（金貨が足りません）'}</p>` : ''}
      <div class="modal-actions">
        <button type="button" class="btn" data-action="hero" data-id="${id}">やめる</button>
        <button type="button" class="btn btn-gold" data-action="fw-do" data-id="${id}" data-r="${receiverId || ''}" data-i="${traitIndex}" ${enough ? '' : 'disabled'}>送り出す</button>
      </div>`, { focus: '[data-action="hero"]' });
  }

  // ---------- 編成・作戦 ----------
  function tacticsHTML() {
    const t = S().tactics;
    return Object.entries(D.TACTICS).map(([key, def]) => {
      const cur = def.options.find(o => o.value === t[key]) || def.options[0];
      return `<div class="tactic" role="group" aria-labelledby="tl-${key}">
        <span class="tactic-label" id="tl-${key}">${def.label}</span>
        <div class="seg">${def.options.map(o => `<button type="button" data-action="tactic" data-key="${key}" data-value="${o.value}" aria-pressed="${o.value === t[key]}">${o.name}</button>`).join('')}</div>
        <p class="tactic-desc">${esc(cur.desc)}</p>
      </div>`;
    }).join('');
  }

  function renderParty() {
    const s = S();
    const slots = s.party.map((id, i) => {
      if (!id) return `<div class="slot">${faceHTML(null)}<span class="slot-empty">空き</span></div>`;
      const h = D.heroById[id];
      const o = Game.owned(id);
      const row = Game.rowOf(id);
      return `<div class="slot">
        <button type="button" class="face r${o.star}" data-action="slot-remove" data-i="${i}" aria-label="${esc(h.name)}を編成から外す">${SP.heroImg(id)}</button>
        <span class="sname">${esc(h.name)} <span class="muted">Lv${o.lv}</span></span>
        <span class="heart small">♥${o.trust}</span>
        <button type="button" class="rowbtn ${row}" data-action="row" data-id="${id}" aria-label="${esc(h.name)}の配置: ${row === 'front' ? '前衛' : '後衛'}（タップで切り替え）">${row === 'front' ? '前衛' : '後衛'}</button>
      </div>`;
    }).join('');
    $('#tab-party').innerHTML = `
      <h2>編成 <span class="muted">戦力 ${num(Game.partyPower())}</span></h2>
      <div class="panel">
        <div class="slots">${slots}</div>
        <p class="muted" style="margin:8px 0 0">顔をタップで外す・「前衛/後衛」で配置を切り替え。前衛は敵に狙われやすいので、戦士を置くと後衛を守れます。♥ は信頼度です（45 未満だと作戦に従わないことがある）。</p>
        <div class="party-actions"><button type="button" class="btn btn-small" data-action="auto-party">おすすめ編成</button></div>
      </div>
      <h3>英雄を選ぶ</h3>
      <div class="roster">${Game.ownedList().map(id => heroCardHTML(id, { action: 'toggle-party' })).join('')}</div>
      <h3>作戦</h3>
      <div class="panel">
        <p class="muted" style="margin:0">あなたは英雄たちの「マスター」。戦闘中は英雄が自分で考えて動きます。あなたは作戦で方針を伝えましょう（戦闘中も変えられます）。</p>
        <div id="tactics-box">${tacticsHTML()}</div>
      </div>`;
  }

  function setTactic(key, raw) {
    const opt = D.TACTICS[key].options.find(o => String(o.value) === raw);
    if (!opt) return;
    S().tactics[key] = opt.value;   // 戦闘中の Battle も同じオブジェクトを見ているので、すぐ反映される
    Game.save();
    for (const box of document.querySelectorAll('#tactics-box, #battle-tactics-box')) {
      const focused = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset : {};
      box.innerHTML = tacticsHTML();
      if (focused.key === key) {
        const b = box.querySelector(`[data-key="${key}"][data-value="${raw}"]`);
        if (b) b.focus();
      }
    }
  }

  // ---------- 戦闘 ----------
  const BASE_WAIT = { act: 950, wave: 1600, end: 900 };
  const BV = {
    battle: null, floorIndex: 0, partyIds: [], wait: 0, last: 0, raf: 0, paused: false, ending: false,

    start(floorIndex) {
      const party = Game.partyForBattle();
      if (party.length === 0) { toast('編成に英雄がいません'); return; }
      closeModal();
      Room.stop();
      this.floorIndex = floorIndex;
      this.partyIds = party.map(p => p.def.id);
      this.battle = new E.Battle({ party, floorIndex, tactics: S().tactics });
      this.paused = false;
      this.ending = false;
      this.wait = 300;
      window.scrollTo(0, 0);
      const el = $('#battle');
      el.hidden = false;
      el.classList.remove('boss-wave');
      document.body.style.overflow = 'hidden';
      $('#b-floor').textContent = `${floorIndex + 1}階 ${D.FLOORS[floorIndex].name}`;
      $('#b-wave').textContent = '';
      $('#b-log').innerHTML = '';
      $('#b-enemies').innerHTML = '';
      this.renderHeroes();
      this.updateSpeed();
      $('#b-tactics').focus();
      this.last = performance.now();
      cancelAnimationFrame(this.raf);
      this.raf = requestAnimationFrame(t => this.loop(t));
    },

    stop() {
      cancelAnimationFrame(this.raf);
      this.battle = null;
      $('#battle').hidden = true;
      document.body.style.overflow = '';
    },

    loop(now) {
      const dt = Math.min(100, now - this.last);
      this.last = now;
      if (this.battle && !this.paused && !this.ending) {
        this.wait -= dt * S().speed;
        if (this.wait <= 0) {
          const ev = this.battle.next();
          if (ev) this.handle(ev);
        }
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

    updateSpeed() { $('#b-speed').textContent = '×' + S().speed; $('#b-speed').setAttribute('aria-label', `戦闘の速さ ${S().speed}倍（タップで切り替え）`); },

    unitHTML(u) {
      const cls = ['unit', u.side];
      if (u.side === 'hero') cls.push('r' + u.star);
      if (u.boss) cls.push('boss');
      if (!u.alive) cls.push('dead');
      const img = u.side === 'hero' ? SP.heroImg(u.heroId) : SP.enemyImg(u.key);
      return `<div class="${cls.join(' ')}" id="u-${u.id}" aria-label="${esc(u.name)}">
        ${u.boss ? '<span class="crown" aria-hidden="true">👑</span>' : ''}
        <span class="status" aria-hidden="true"></span>
        <span class="ue">${img}</span>
        <div class="un">${esc(u.name)}${u.side === 'enemy' ? ` <span class="muted">Lv${u.lv}</span>` : ''}</div>
        <div class="hpbar"><i></i></div>
        ${u.maxShield ? '<div class="shieldbar"><i></i></div>' : ''}
        <div class="hpnum"></div>
      </div>`;
    },

    renderHeroes() {
      const b = this.battle;
      $('#b-front').innerHTML = b.heroes.filter(h => h.row === 'front').map(u => this.unitHTML(u)).join('');
      $('#b-back').innerHTML = b.heroes.filter(h => h.row !== 'front').map(u => this.unitHTML(u)).join('');
      for (const u of b.heroes) this.updateUnit(u);
    },

    renderEnemies() {
      const b = this.battle;
      $('#b-enemies').innerHTML = b.enemies.map(u => this.unitHTML(u)).join('');
      for (const u of b.enemies) this.updateUnit(u);
    },

    updateUnit(u) {
      const el = document.getElementById('u-' + u.id);
      if (!el) return;
      const r = u.hp / u.maxHp;
      const bar = el.querySelector('.hpbar i');
      bar.style.width = (r * 100) + '%';
      bar.className = r < 0.25 ? 'crit' : r < 0.5 ? 'low' : '';
      const sb = el.querySelector('.shieldbar i');
      if (sb) sb.style.width = (u.shield / u.maxShield * 100) + '%';
      el.querySelector('.hpnum').textContent = `${num(u.hp)} / ${num(u.maxHp)}${u.shield ? `　盾 ${num(u.shield)}` : ''}`;
      el.classList.toggle('dead', !u.alive);
      let st = '';
      if (u.taunt > 0) st += '🎯';
      if (u.guard) st += '🛡️';
      if (u.atkUp > 0) st += '🔥';
      if (u.defUp > 0) st += '💠';
      if (u.rage) st += '💢' + u.rage;
      el.querySelector('.status').textContent = st;
    },

    updateAll() {
      for (const u of this.battle.heroes) this.updateUnit(u);
      for (const u of this.battle.enemies) this.updateUnit(u);
    },

    flash(id, cls) {
      const el = document.getElementById('u-' + id);
      if (!el) return;
      el.classList.remove(cls);
      void el.offsetWidth;
      el.classList.add(cls);
      setTimeout(() => el.classList.remove(cls), 600);
    },

    float(id, text, cls, delay) {
      const go = () => {
        const el = document.getElementById('u-' + id);
        if (!el) return;
        const f = document.createElement('span');
        f.className = 'float ' + (cls || '');
        f.textContent = text;
        el.appendChild(f);
        setTimeout(() => f.remove(), 950);
      };
      if (delay) setTimeout(go, delay); else go();
    },

    bubble(id, text) {
      const el = document.getElementById('u-' + id);
      if (!el || !text) return;
      el.querySelectorAll('.bubble').forEach(b => b.remove());
      const b = document.createElement('span');
      b.className = 'bubble';
      b.textContent = text;
      el.appendChild(b);
      setTimeout(() => b.remove(), 1650);
    },

    banner(text, boss) {
      const el = $('#b-banner');
      el.className = 'banner' + (boss ? ' bossb' : '');
      el.innerHTML = `<span>${esc(text)}</span>`;
      void el.offsetWidth;
      el.classList.add('show');
    },

    log(text, cls) {
      const ol = $('#b-log');
      const li = document.createElement('li');
      li.textContent = text;
      if (cls) li.className = cls;
      ol.appendChild(li);
      while (ol.children.length > 6) ol.firstChild.remove();
    },

    handle(ev) {
      const b = this.battle;
      if (ev.type === 'wave') {
        this.renderEnemies();
        $('#b-wave').textContent = `ウェーブ ${ev.index + 1} / ${ev.total}`;
        $('#battle').classList.toggle('boss-wave', !!ev.boss);
        this.banner(ev.boss ? '⚠ ボス出現 ⚠' : `ウェーブ ${ev.index + 1}`, ev.boss);
        for (const h of ev.healed) this.float(h.id, '+' + h.amount, 'heal');
        this.log(ev.text, 'sys');
        if (ev.healed.length) this.log('ひと息ついて、英雄たちの HP が少し回復した。', 'sys');
        this.updateAll();
        this.wait = BASE_WAIT.wave;
        return;
      }
      if (ev.type === 'end') {
        this.ending = true;
        const lost = ev.fallen.length;
        this.banner(ev.win ? '勝利！' : ev.reason === 'retreat' ? '撤退…' : '敗北…', !ev.win);
        this.log(ev.win ? '塔の階を制覇した！'
          : ev.reason === 'retreat' ? '残った英雄を連れて撤退した。'
          : ev.reason === 'timeout' ? '戦いが長引き、英雄たちは力尽きた…' : '英雄たちは倒れてしまった…', 'sys');
        if (lost) this.log(`${lost}人の英雄が、二度と戻らない…`, 'sys');
        setTimeout(() => this.showResult(ev), BASE_WAIT.end);
        return;
      }
      // act
      this.flash(ev.actor, 'acting');
      if (ev.speech) this.bubble(ev.actor, ev.speech);
      else if (ev.kind === 'skill' && ev.side === 'enemy') this.bubble(ev.actor, `「${ev.label}」`);
      if (ev.disobey) this.float(ev.actor, '作戦無視', 'small warn');
      if (ev.summoned) {
        for (const s of ev.summoned) {
          $('#b-enemies').insertAdjacentHTML('beforeend', this.unitHTML(s));
          this.flash(s.id, 'spawn');
        }
      }
      const delay = Math.max(60, 200 / S().speed);
      setTimeout(() => {
        if (!this.battle || this.battle !== b) return;
        for (const h of ev.hits || []) {
          if (h.heal) { this.float(h.id, '+' + h.amount, 'heal'); this.flash(h.id, 'healed'); continue; }
          this.float(h.id, (h.crit ? '会心 ' : '') + h.amount, h.crit ? 'crit' : '');
          this.flash(h.id, 'hit');
          if (h.shield) this.float(h.id, '盾 -' + h.shield, 'small', 150);
          if (h.undying) this.float(h.id, '不屈！', 'small gold', 250);
          if (h.drain) this.float(h.drain.id, '+' + h.drain.amount, 'heal', 200);
          if (h.counter) { this.float(h.id, '反撃！', 'small gold', 200); this.float(h.counter.id, String(h.counter.amount), '', 350); }
        }
        for (const id of ev.buffs || []) {
          this.flash(id, 'buffed');
          if (ev.kind === 'guard') this.float(id, '防御', 'small');
        }
        for (const id of ev.frozen || []) this.float(id, '凍えた', 'small ice', 150);
        if (ev.reshield) this.float(ev.actor, '盾 復活', 'small', 100);
        this.updateAll();
      }, delay);
      this.log(ev.text, ev.side === 'hero' ? 'hero-line' : 'enemy-line');
      this.wait = BASE_WAIT.act;
    },

    advice(ev) {
      const b = this.battle;
      const f = D.FLOORS[this.floorIndex];
      const t = S().tactics;
      const tips = [];
      const avgLv = b.heroes.reduce((s, h) => s + h.lv, 0) / b.heroes.length;
      if (ev.fallen.length && t.retreat === 'never') tips.push('作戦の「撤退」を「1人倒れたら」か「危なくなったら」にすると、仲間を失いにくくなります。');
      if (b.summary.disobeyed > 0) tips.push(`作戦に従わない英雄がいました（${b.summary.disobeyed}回）。待機室で話しかけたり、一緒に勝ったりして信頼度を上げましょう。`);
      if (ev.reason === 'timeout') tips.push('戦いが長引きすぎました。「攻撃重視」や、攻撃の得意な英雄を入れてみましょう。');
      if (b.heroes.length < D.PARTY_SIZE) tips.push(`編成にはあと ${D.PARTY_SIZE - b.heroes.length} 人入れられます。召喚で仲間を増やしましょう。`);
      if (!b.heroes.some(h => h.healer)) tips.push('回復役（✨僧侶）がいません。編成に入れると倒れにくくなります。');
      if (!b.heroes.some(h => h.row === 'front')) tips.push('前衛がいないので、後衛が直接狙われています。戦士などを前衛に置きましょう。');
      if (avgLv < f.lv * 0.8) tips.push(`英雄の平均レベル（${Math.floor(avgLv)}）が敵（Lv${f.lv}）より低めです。前の階で鍛えるか、★を昇級させましょう。`);
      if (b.summary.bossReached) {
        for (const w of f.waves) for (const k of w) if (D.ENEMIES[k].boss && D.ENEMIES[k].trait) tips.push(`${D.ENEMIES[k].name}: ${D.ENEMIES[k].trait}`);
      }
      if (t.healLine <= 0.3 && b.heroes.some(h => h.healer)) tips.push('「回復の目安」を上げると、回復役が早めに回復してくれます。');
      if (tips.length === 0) tips.push('作戦を変えたり、召喚で新しい英雄を探したりしてみましょう。');
      return tips.slice(0, 3);
    },

    showResult(ev) {
      const b = this.battle;
      const win = ev.win;
      const tips = win ? '' : `<div class="advice"><b>マスターへのヒント</b><ul>${this.advice(ev).map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
      const reward = Game.applyBattleResult(this.floorIndex, win, this.partyIds, ev.fallen, ev.reason);
      renderWallet();
      const fi = this.floorIndex;
      const hasNext = win && fi + 1 < D.FLOORS.length && Game.isUnlocked(fi + 1);
      const lv = reward.levelUps.map(l => `<li><span>${esc(D.heroById[l.id].name)}</span><b>Lv${l.from} → Lv${l.to}</b></li>`).join('');
      const fallen = reward.fallen.length ? `<div class="advice lost"><b>失われた英雄</b>
        <ul class="lost-list">${reward.fallen.map(f => `<li>${SP.heroImg(f.id, 'mono')}<span>${esc(f.name)}（★${f.star} Lv${f.lv}）<br><span class="muted">${f.floor}階で倒れた。もう戻らない…</span></span></li>`).join('')}</ul>
        <span class="muted">仲間を失い、英雄たちのマスターへの信頼が下がった。</span></div>` : '';
      const trustUps = Object.entries(reward.trust).filter(([, d]) => d !== 0);
      const trustLine = trustUps.length ? `<p class="muted">♥ 信頼度: ${trustUps.map(([id, d]) => `${esc(D.heroById[id].name)} ${d > 0 ? '+' : ''}${d}`).join('・')}</p>` : '';
      const title = win ? '勝利！' : ev.reason === 'retreat' ? '撤退' : '敗北…';
      openModal(`
        <p class="result-title ${win ? 'win' : 'lose'}" id="modal-title">${title}</p>
        <p class="muted" style="text-align:center;margin-top:0">${fi + 1}階 ${esc(D.FLOORS[fi].name)}${reward.firstClear ? ' 初クリア！' : ''}</p>
        ${fallen}
        <ul class="reward-list">
          <li><span>経験値（生き残った英雄）</span><b>${reward.exp}${win ? '' : '（少なめ）'}</b></li>
          ${reward.gold ? `<li><span>🪙 金貨</span><b>+${num(reward.gold)}</b></li>` : ''}
          ${reward.shards ? `<li><span>✦ 星の欠片</span><b>+${num(reward.shards)}</b></li>` : ''}
          ${reward.gems ? `<li><span>💎 召喚石（初クリア）</span><b>+${num(reward.gems)}</b></li>` : ''}
          ${lv}
        </ul>
        ${trustLine}
        ${reward.newcomer ? `<p class="advice">英雄が一人もいなくなった待機室に、流れ者の英雄「${esc(D.heroById[reward.newcomer].name)}」がやってきた。</p>` : ''}
        ${tips}
        ${win && fi + 1 === D.FLOORS.length && reward.firstClear ? '<p class="advice" style="background:#3c2f19;border-color:#c8912a">🎉 星喰らいを倒し、塔の頂上に到達しました！ おめでとうございます！</p>' : ''}
        <div class="modal-actions">
          ${hasNext ? `<button type="button" class="btn btn-gold" data-action="start" data-floor="${fi + 1}">次の階へ（${fi + 2}階）</button>` : ''}
          <button type="button" class="btn ${hasNext ? '' : 'btn-gold'}" data-action="start" data-floor="${fi}" ${Game.partyIds().length ? '' : 'disabled'}>${win ? 'もう一度' : '再挑戦'}</button>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="result-home">待機室に戻る</button>
          <button type="button" class="btn" data-action="result-party">編成・作戦へ</button>
        </div>`, { locked: true, onClose: () => { if (this.battle === b) { this.stop(); Room.refresh(); showTab(currentTab); } } });
    },

    openTactics() {
      if (!this.battle || this.ending) return;
      this.paused = true;
      openModal(`
        <h2 id="modal-title">作戦を変える</h2>
        <p class="muted" style="margin-top:-6px">戦闘は一時停止中。変えた作戦はすぐに反映されます。</p>
        <div id="battle-tactics-box">${tacticsHTML()}</div>
        <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="close">戦闘に戻る</button></div>`,
      { focus: '[data-action="close"]', onClose: () => { this.paused = false; this.last = performance.now(); } });
    },

    retreat() {
      if (!this.battle || this.ending) return;
      this.paused = true;
      openModal(`
        <h2 id="modal-title">撤退しますか？</h2>
        <p class="muted">撤退すると報酬はもらえません。生き残っている英雄は無事に帰れます（もう倒れた英雄は戻りません）。</p>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="close">戦い続ける</button>
          <button type="button" class="btn btn-gold" data-action="retreat-yes">撤退する</button>
        </div>`, { focus: '[data-action="close"]', onClose: () => { this.paused = false; this.last = performance.now(); } });
    },
  };

  // ---------- 遊び方 ----------
  function showIntro() {
    openModal(`
      <h2 id="modal-title">✦ 星喚の塔へようこそ</h2>
      <p>あなたは英雄たちを導く<b>「マスター」</b>です。</p>
      <ol style="padding-left:1.3em;margin:0">
        <li><b>召喚</b>で英雄を仲間にする</li>
        <li><b>編成</b>で5人までのパーティーを組み、<b>作戦</b>を決める</li>
        <li><b>塔</b>に挑む。戦闘中、英雄は<b>自分で考えて</b>戦う</li>
        <li>英雄は<b>待機室</b>で暮らしている。話しかけると<b>信頼度</b>が上がる</li>
      </ol>
      <p class="advice">⚠ 塔で<b>倒れた英雄は二度と戻りません</b>。危ないときは撤退しましょう。</p>
      <p class="muted">信頼度が低い英雄は作戦に従わないことがあります。★1 の英雄も、育てて昇級すれば ★5 まで強くなれます。最初の召喚石で、まずは10回召喚がおすすめです。</p>
      <div class="modal-actions"><button type="button" class="btn btn-gold" data-action="close">はじめる</button></div>`,
    { onClose: () => { if (!S().seenIntro) { S().seenIntro = true; Game.save(); } if (currentTab === 'home') Room.start(); } });
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
        closeModal();
        showTab(el.dataset.tab);
        const btn = document.querySelector(`.tabbtn[data-tab="${el.dataset.tab}"]`);
        if (btn) btn.focus();
        break;
      }
      case 'intro': showIntro(); break;
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
      case 'talk': {
        const r = Game.talk(id);
        if (!r.ok) break;
        const tierName = D.TRUST_TIERS[r.tier].name;
        heroDetail(id, `${SP.heroImg(id)}<span>「${esc(r.line)}」<br><span class="muted">♥ 信頼度が ${r.trust} になった${r.tierUp ? `（${tierName}に上がった！）` : ''}</span></span>`);
        renderTab();
        break;
      }
      case 'train': {
        const r = Game.train(id);
        if (r.ok) toast(`${D.heroById[id].name}が Lv${r.lv} になった！`);
        else if (r.reason === 'gold') toast('金貨が足りません');
        renderWallet();
        renderTab();
        heroDetail(id);
        const next = $('#modal [data-action="train"]');
        if (next && !next.disabled) next.focus();
        break;
      }
      case 'promote': {
        const r = Game.promote(id);
        if (!r.ok) break;
        renderWallet();
        renderTab();
        heroDetail(id, `${SP.heroImg(id)}<span>✨ ★${r.star} に昇級した！${r.newTrait ? `<br>新しい特性「${esc(D.TRAITS[r.newTrait.id].name)}」が目覚めた！` : ''}<br><span class="muted">♥ 信頼度も上がった</span></span>`);
        break;
      }
      case 'farewell': farewellModal(id, null, 0); break;
      case 'fw-trait': farewellModal(id, el.dataset.r || null, Number(el.dataset.i)); break;
      case 'fw-recv': farewellModal(id, el.dataset.r || null, Number(el.dataset.i)); break;
      case 'fw-do': {
        const name = D.heroById[id].name;
        const r = Game.farewell(id, el.dataset.r || null, Number(el.dataset.i));
        if (!r.ok) { toast(r.reason === 'gold' ? '金貨が足りません' : r.reason === 'last' ? '最後の一人は送り出せません' : '送り出せませんでした'); break; }
        modalOnClose = null;
        closeModal();
        Room.refresh();
        renderWallet();
        renderTab();
        toast(`${name}は故郷へ帰っていった（✦+${r.shards}）`);
        if (r.inherit) setTimeout(() => toast(`${D.heroById[r.inherit.receiver].name}が「${D.TRAITS[r.inherit.id].name} Lv${r.inherit.lv}」を受け継いだ`), 1800);
        if (currentTab === 'home') Room.start();
        break;
      }
      case 'toggle-party': {
        const r = Game.togglePartyMember(id);
        if (r === 'full') toast('編成がいっぱいです（5人まで）。先にだれかを外してください');
        else toast(`${D.heroById[id].name}を編成${r === 'added' ? 'に入れました' : 'から外しました'}`);
        renderTab();
        if (el.dataset.from === 'detail') heroDetail(id);
        else {
          const again = document.querySelector(`#tab-party [data-action="toggle-party"][data-id="${id}"]`);
          if (again) again.focus();
        }
        break;
      }
      case 'slot-remove': {
        const pid = S().party[Number(el.dataset.i)];
        Game.removeFromSlot(Number(el.dataset.i));
        if (pid) toast(`${D.heroById[pid].name}を編成から外しました`);
        renderTab();
        const first = $('#tab-party [data-action="slot-remove"]') || $('#tab-party [data-action="toggle-party"]');
        if (first) first.focus();
        break;
      }
      case 'row': {
        Game.toggleRow(id);
        renderTab();
        const again = document.querySelector(`#tab-party [data-action="row"][data-id="${id}"]`);
        if (again) again.focus();
        break;
      }
      case 'auto-party': Game.autoParty(); renderTab(); toast('おすすめの編成にしました'); $('#tab-party [data-action="auto-party"]').focus(); break;
      case 'tactic': setTactic(el.dataset.key, el.dataset.value); break;
      case 'reset':
        if (confirm('保存データをすべて消して、最初からやり直しますか？（元に戻せません）')) {
          Game.reset();
          lastWallet = {};
          Room.stop();
          window.location.reload();
        }
        break;
      case 'result-party': closeModal(); showTab('party'); break;
      case 'result-home': closeModal(); showTab('home'); break;
      case 'retreat-yes': {
        modalOnClose = null;
        closeModal();
        BV.paused = false;
        const ev = BV.battle && BV.battle.retreat();
        if (ev) BV.handle(ev);
        break;
      }
      default: break;
    }
  });

  $('#b-speed').addEventListener('click', () => {
    S().speed = S().speed >= 3 ? 1 : S().speed + 1;
    Game.save();
    BV.updateSpeed();
  });
  $('#b-tactics').addEventListener('click', () => BV.openTactics());
  $('#b-retreat').addEventListener('click', () => BV.retreat());

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#modal').hidden) {
      if ($('#modal').dataset.locked) return;
      e.preventDefault();
      closeModal();
    }
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal' && !$('#modal').dataset.locked) closeModal();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) Room.stop();
    else if (currentTab === 'home' && $('#battle').hidden && $('#modal').hidden) Room.start();
  });

  // ---------- 起動 ----------
  Game.init();
  showTab('home');
  if (!S().seenIntro) showIntro();

  // テストから中身を確かめるための入口
  window.__game = { Game, BV, showTab, D, Room };

  // ホーム画面に追加（PWA）: http(s) で開いたときだけ有効にする
  if (/^https?:$/.test(location.protocol)) {
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = 'manifest.webmanifest';
    document.head.appendChild(link);
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
    }
  }
})();
