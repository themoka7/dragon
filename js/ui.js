// 화면 구성과 입력 처리
(function (DV) {
  'use strict';
  const D = DV.data, G = DV.game, R = DV.render;
  const { fmt, fmtTime, hsl } = DV.util;
  const $ = (sel, root) => (root || document).querySelector(sel);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const TRAIT = {
    body: { wyvern: '와이번형', beast: '비스트형', drake: '드레이크형', serpent: '서펜트형' },
    wing: { none: '날개 없음', bat: '박쥐 날개', feather: '깃털 날개', crystal: '수정 날개', flame: '화염 날개' },
    horn: { curved: '굽은 뿔', straight: '곧은 뿔', antler: '사슴뿔', spiral: '나선 뿔', crown: '왕관 뿔' },
    mat: { bone: '상아', gold: '황금', crystal: '수정', obsidian: '흑요석', accent: '보석' },
    crest: { none: '', mane: '사자 갈기', fins: '지느러미 귀', feathers: '깃털 장식', frill: '목 프릴' },
    back: { spikes: '등 가시', fins: '등지느러미', fur: '등 털', plates: '골판', none: '' },
    tailTip: { spade: '창끝 꼬리', flame: '불꽃 꼬리', fin: '지느러미 꼬리', tuft: '술 꼬리', crystal: '수정 꼬리', plain: '' },
    pattern: { none: '', stripes: '줄무늬', spots: '점박이', scales: '비늘 무늬', runes: '룬 문양' },
    eye: { slit: '세로 동공', round: '동그란 눈', glow: '빛나는 눈' },
  };

  let tab = 'nest';
  let breedSel = [null, null];
  let battle = null;

  // ----------------------------------------------------------- helpers
  function toast(msg) {
    const el = document.createElement('div');
    el.textContent = msg;
    $('#toast').appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  function floatText(x, y, text, big) {
    const el = document.createElement('div');
    el.className = 'float' + (big ? ' big' : '');
    el.textContent = text;
    const app = $('#app').getBoundingClientRect();
    el.style.left = (x - app.left) + 'px';
    el.style.top = (y - app.top) + 'px';
    $('#fx').appendChild(el);
    setTimeout(() => el.remove(), 1300);
  }
  function floatAt(el, text, big, dy) {
    if (!el) return;
    const r = el.getBoundingClientRect();
    floatText(r.left + r.width / 2 + (Math.random() - 0.5) * 40, r.top + r.height * 0.45 + (dy || 0), text, big);
  }

  function fitCanvas(c) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = c.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    return { w, h };
  }

  const thumbCache = new Map();
  function thumb(genome, stage, size) {
    size = size || 200;
    const key = `${genome.seed}:${stage}:${size}`;
    let url = thumbCache.get(key);
    if (!url) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      if (stage === 0) R.drawEgg(ctx, genome, 0.5, size / 2, size / 2, size * 0.95, {});
      else R.drawDragon(ctx, genome, stage, 0.8, size * 0.5, size * 0.5, size * 1.08, { fit: true, particles: false, aura: genome.rarity >= 2 });
      url = c.toDataURL();
      thumbCache.set(key, url);
    }
    return url;
  }

  const rarityBadge = g => { const r = D.RARITIES[g.rarity]; return `<span class="badge" style="color:${r.color}">${r.name}</span>`; };
  const elemBadge = g => { const e = D.ELEMENTS[g.element]; return `<span class="badge" style="color:${e.color}">${e.icon} ${e.name}</span>`; };

  function dragonCard(d, extra) {
    const r = D.RARITIES[d.genome.rarity];
    return `<button class="card ${extra || ''}" data-id="${d.id}">
      <img src="${thumb(d.genome, d.stage)}" alt="">
      <span class="star" style="background:${r.color}"></span>
      <span class="el">${D.ELEMENTS[d.genome.element].icon}</span>
      <span class="lv">Lv.${d.level}</span>
    </button>`;
  }

  // ----------------------------------------------------------- anim loop
  const anims = new Map();
  function loop(now) {
    const t = now / 1000;
    for (const fn of anims.values()) fn(t);
    requestAnimationFrame(loop);
  }

  function stageBg(ctx, w, h, g, t) {
    const E = D.ELEMENTS[g.element];
    const bg = ctx.createRadialGradient(w / 2, h * 0.45, 10, w / 2, h * 0.5, Math.max(w, h) * 0.75);
    bg.addColorStop(0, hsl(E.hue, 45, 30));
    bg.addColorStop(0.6, hsl(E.hue, 40, 14));
    bg.addColorStop(1, hsl(E.hue, 30, 6));
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    // 둥지 바닥
    ctx.fillStyle = hsl(E.hue, 30, 8, 0.7);
    ctx.beginPath();
    ctx.ellipse(w / 2, h * 0.86, w * 0.55, h * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // 별가루
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 24; i++) {
      const x = ((i * 97.3) % 1) * w || (i * 53 % w), y = (i * 37 % 100) / 100 * h * 0.7;
      const a = 0.3 + 0.7 * Math.abs(Math.sin(t * 0.8 + i));
      ctx.globalAlpha = a * 0.6;
      ctx.fillRect((i * 61 % 100) / 100 * w, y, 2, 2);
      void x;
    }
    ctx.globalAlpha = 1;
  }

  // ----------------------------------------------------------- top bar
  function renderTop() {
    const S = G.S;
    $('#r-gold').textContent = fmt(S.gold);
    $('#r-food').textContent = fmt(S.food);
    $('#dot-hatch').classList.toggle('on', S.eggs.some(G.eggReady));
    $('#btn-diff').classList.toggle('on', G.MULT_KEYS.some(k => S.mult[k] !== 1));
    $('#dot-shop').classList.toggle('on', G.freeEggLeft() === 0 && S.eggs.length < G.CONFIG.incubators);
  }

  // ----------------------------------------------------------- tabs
  function setTab(name) {
    tab = name;
    document.querySelectorAll('#tabbar button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    document.querySelectorAll('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    anims.delete('hatch');
    anims.delete('shop');
    render();
    $('#screen-' + name).scrollTop = 0;
  }

  function render() {
    renderTop();
    ({ nest: renderNest, hatch: renderHatch, adventure: renderAdventure, breed: renderBreed, shop: renderShop, difficulty: renderDifficulty })[tab]();
  }

  // ----------------------------------------------------------- nest
  function renderNest() {
    const S = G.S;
    const el = $('#screen-nest');
    const d = G.selected();
    if (!d) {
      anims.delete('nest');
      el.innerHTML = `<div class="empty-state">
        <div class="big">🥚</div>
        <h2>아직 드래곤이 없어요</h2>
        <p class="muted">부화장에서 알을 부화시켜 첫 드래곤을 만나보세요!</p>
        <button class="btn gold" data-tab-go="hatch">부화장으로</button>
      </div>`;
      return;
    }
    const st = D.STAGES[d.stage];
    const need = D.expNeed(d.level);
    const atCap = G.atCap(d) || (d.level >= st.cap && d.stage < 4);
    const pend = G.totalPending();
    const evo = G.canEvolve(d);
    el.innerHTML = `
      <div class="stage-view" id="stage-view">
        <canvas id="nest-canvas"></canvas>
        <div class="dragon-head">
          <div class="badges">${rarityBadge(d.genome)}${elemBadge(d.genome)}</div>
          <button class="dname" data-act="rename">${esc(d.name)} <span class="pen">✏️</span></button>
          <div class="species">${D.speciesName(d.genome)} · ${st.name}</div>
        </div>
        <button class="collect ${pend > 0 ? '' : 'hidden'}" data-act="collect" id="collect-btn">🪙 +${fmt(pend)}</button>
        <div class="lvl">
          <span class="lv">Lv.${d.level}</span>
          <div class="bar"><i style="width:${Math.min(100, d.exp / need * 100)}%"></i></div>
          <span>${atCap ? (d.stage < 4 ? '진화 가능!' : 'MAX') : `${d.exp}/${need}`}</span>
        </div>
      </div>
      ${evo ? `<button class="btn purple block evo-banner" data-act="evolve">✨ 진화하기 → ${D.STAGES[d.stage + 1].name} <span class="sub">🪙 ${fmt(st.evoCost)}</span></button>` : ''}
      <div class="actions">
        <button class="btn" data-act="feed" data-n="1"><i>🍖</i>먹이 1</button>
        <button class="btn" data-act="feed" data-n="10"><i>🍖</i>먹이 10</button>
        <button class="btn" data-act="pet"><i>🤚</i>쓰다듬기</button>
        <button class="btn ghost" data-act="info"><i>📜</i>정보</button>
      </div>
      <div class="section-title"><span>내 드래곤</span><small>${S.dragons.length}/${G.CONFIG.nestCap} · 분당 🪙${fmt(S.dragons.reduce((a, x) => a + G.goldRate(x), 0))}</small></div>
      <div class="roster">
        ${S.dragons.map(x => dragonCard(x, x.id === d.id ? 'sel' : '')).join('')}
        ${S.dragons.length < G.CONFIG.nestCap ? `<button class="card empty" data-tab-go="hatch">＋</button>` : ''}
      </div>`;
    anims.set('nest', t => {
      const c = $('#nest-canvas');
      if (!c || tab !== 'nest') return;
      const cur = G.selected();
      if (!cur) return;
      const { w, h } = fitCanvas(c);
      const ctx = c.getContext('2d');
      stageBg(ctx, w, h, cur.genome, t);
      const size = Math.min(w * 1.02, h * 1.15);
      R.drawDragon(ctx, cur.genome, cur.stage, t, w / 2, h * 0.56, size, {});
    });
  }

  // ----------------------------------------------------------- hatch
  function renderHatch() {
    const S = G.S;
    const el = $('#screen-hatch');
    const slots = [];
    for (let i = 0; i < G.CONFIG.incubators; i++) {
      const e = S.eggs[i];
      if (!e) {
        slots.push(`<div class="panel incubator empty">빈 부화기<br><small>상점에서 알을 구하거나 교배로 얻을 수 있어요</small><br><br><button class="btn small ghost" data-tab-go="shop">🛒 상점 가기</button></div>`);
        continue;
      }
      const r = D.RARITIES[e.genome.rarity];
      slots.push(`<div class="panel incubator" data-egg="${e.id}">
        <canvas data-eggc="${e.id}"></canvas>
        <div class="info">
          <div class="t" style="color:${r.color}">${D.ELEMENTS[e.genome.element].icon} 신비한 알</div>
          <div class="bar"><i data-eggbar="${e.id}" style="width:0%"></i></div>
          <div class="muted" data-eggtime="${e.id}"></div>
          <button class="btn gold" data-act="hatch" data-id="${e.id}" data-eggbtn="${e.id}">부화!</button>
        </div>
      </div>`);
    }
    el.innerHTML = `
      <div class="section-title"><span>🥚 부화장</span><small>${S.eggs.length}/${G.CONFIG.incubators}</small></div>
      <div class="incubators">${slots.join('')}</div>
      <p class="muted center" style="font-size:13px;margin-top:16px">알이 따뜻해지면 흔들리기 시작해요.<br>어떤 드래곤이 태어날지는 부화해 봐야 알 수 있어요!</p>`;
    tickHatch();
    anims.set('hatch', t => {
      if (tab !== 'hatch') return;
      for (const e of G.S.eggs) {
        const c = document.querySelector(`[data-eggc="${e.id}"]`);
        if (!c) continue;
        const { w, h } = fitCanvas(c);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        R.drawEgg(ctx, e.genome, t, w / 2, h / 2, w * 0.95, { progress: G.eggProgress(e), ready: G.eggReady(e) });
      }
    });
  }

  function tickHatch() {
    for (const e of G.S.eggs) {
      const bar = document.querySelector(`[data-eggbar="${e.id}"]`);
      if (!bar) continue;
      const ready = G.eggReady(e);
      bar.style.width = (G.eggProgress(e) * 100).toFixed(1) + '%';
      document.querySelector(`[data-eggtime="${e.id}"]`).textContent = ready ? '부화 준비 완료!' : `남은 시간 ${fmtTime(G.eggLeft(e))}`;
      const btn = document.querySelector(`[data-eggbtn="${e.id}"]`);
      btn.innerHTML = ready ? '🐣 부화!' : `⚡ 즉시 부화 <span class="sub">🪙${fmt(G.skipCost(e))}</span>`;
      btn.className = ready ? 'btn gold' : 'btn small';
    }
  }

  // ----------------------------------------------------------- adventure
  function renderAdventure() {
    const S = G.S;
    const el = $('#screen-adventure');
    const d = G.selected();
    if (!d) { el.innerHTML = `<div class="empty-state"><div class="big">⚔️</div><p class="muted">모험을 떠날 드래곤이 없어요.</p></div>`; return; }
    const s = D.calcStats(d);
    el.innerHTML = `
      <div class="panel me-card">
        <img src="${thumb(d.genome, d.stage)}" alt="">
        <div style="flex:1">
          <div>${esc(d.name)} <span class="muted">Lv.${d.level}</span></div>
          <div class="pw">⚔️ ${fmt(s.power)}</div>
          <div class="stat">HP ${s.hp} · 공격 ${s.atk} · 방어 ${s.def} · 속도 ${s.spd}</div>
        </div>
        <button class="btn small ghost" data-act="pick-adv">변경</button>
      </div>
      <div class="section-title"><span>🗺️ 모험 지역</span><small>상성: 🔥›🌿›⚡›💧›🔥 · ✨⇄🌙</small></div>
      <div class="regions">
        ${G.REGIONS.map((R0, i) => {
          const locked = i > S.cleared;
          const avgLv = (R0.lv[0] + R0.lv[1]) / 2;
          const rec = Math.round((100 / 4 + 20 * 2 + 11 * 1.5 + 11) * (1 + (avgLv - 1) * 0.1) * D.STAGES[D.stageForLevel(avgLv)].mult * 1.2);
          return `<button class="panel region ${locked ? 'locked' : ''}" data-act="${locked ? 'locked' : 'fight'}" data-r="${i}"
            style="background:linear-gradient(90deg, ${hsl(R0.bg[0], R0.bg[1], 26)}, ${hsl(R0.bg[0], R0.bg[1], 14)})">
            <div class="num">${locked ? '🔒' : i < S.cleared ? '⭐' : i + 1}</div>
            <div class="body" style="text-align:left">
              <div class="nm">${R0.name}</div>
              <div class="meta">Lv.${R0.lv[0]}~${R0.lv[1]} · ${R0.elems.map(e => D.ELEMENTS[e].icon).join('')} · 권장 ⚔️${fmt(rec)}</div>
              <div class="meta">보상 🪙${fmt(R0.gold)} 🍖${R0.food}</div>
            </div>
            <div style="font-size:22px">${locked ? '' : '▶'}</div>
          </button>`;
        }).join('')}
      </div>`;
  }

  // ----------------------------------------------------------- breed
  function renderBreed() {
    const S = G.S;
    const el = $('#screen-breed');
    breedSel = breedSel.map(id => (id && G.get(id) ? id : null));
    const [a, b] = breedSel.map(id => id && G.get(id));
    const slot = (d, i) => d
      ? `<button class="parent filled" data-act="pick-parent" data-i="${i}"><img src="${thumb(d.genome, d.stage)}" alt=""><span class="nm">${esc(d.name)} Lv.${d.level}</span></button>`
      : `<button class="parent" data-act="pick-parent" data-i="${i}"><div style="font-size:34px">＋</div><div>부모 ${i + 1}</div></button>`;
    const cost = a && b ? G.breedCost(a, b) : 0;
    const adults = S.dragons.filter(d => d.stage >= 3).length;
    el.innerHTML = `
      <div class="section-title"><span>💞 교배</span><small>성체 이상 ${adults}마리</small></div>
      <div class="panel">
        <div class="breed-row">${slot(a, 0)}<div class="heart">💗</div>${slot(b, 1)}</div>
        <p class="muted center" style="font-size:13px;margin:12px 0">
          두 부모의 속성·색·생김새를 물려받은 알이 태어나요.<br>가끔 <b style="color:var(--pink)">돌연변이</b>로 새로운 특징이나 더 높은 등급이 나와요!
        </p>
        <button class="btn gold block ${a && b ? '' : 'disabled'}" data-act="breed">💞 교배하기 ${cost ? `<span class="sub">🪙${fmt(cost)}</span>` : ''}</button>
      </div>
      ${adults < 2 ? `<p class="muted center" style="margin-top:16px">성체(Lv.15 진화) 드래곤이 2마리 필요해요.<br>먹이와 모험으로 드래곤을 키워보세요!</p>` : ''}`;
  }

  // ----------------------------------------------------------- shop
  function renderShop() {
    const S = G.S;
    const el = $('#screen-shop');
    const free = G.freeEggLeft();
    const demo = [D.generateGenome({ seed: 11, rarity: 0, element: 'forest' }), D.generateGenome({ seed: 22, rarity: 1, element: 'fire' }),
      D.generateGenome({ seed: 33, rarity: 2, element: 'water' }), D.generateGenome({ seed: 44, rarity: 3, element: 'light' })];
    el.innerHTML = `
      <div class="section-title"><span>🎁 무료 선물</span></div>
      <div class="panel shop-item">
        <div class="emoji">🎁</div>
        <div class="body"><div class="nm">무료 알</div><div class="ds" id="free-ds">${free ? `${fmtTime(free)} 뒤 받을 수 있어요` : '지금 받을 수 있어요!'}</div></div>
        <button class="btn ${free ? 'disabled' : 'gold'}" data-act="free-egg">받기</button>
      </div>
      <div class="section-title"><span>🥚 알 상점</span><small>부화기 ${S.eggs.length}/${G.CONFIG.incubators}</small></div>
      <div class="shop-list">
        ${G.SHOP_EGGS.map((it, i) => `<div class="panel shop-item">
          <canvas data-shopegg="${i}"></canvas>
          <div class="body"><div class="nm">${it.name}</div><div class="ds">${it.desc}</div></div>
          <button class="btn gold" data-act="buy-egg" data-i="${i}">🪙${fmt(it.price)}</button>
        </div>`).join('')}
      </div>
      <div class="section-title"><span>🍖 먹이</span><small>먹이 1개 = EXP ${fmt(G.expPerFood())}</small></div>
      <div class="shop-list">
        ${G.SHOP_FOOD.map((it, i) => `<div class="panel shop-item">
          <div class="emoji">🍖</div>
          <div class="body"><div class="nm">고기 ${fmt(it.amount * S.mult.food)}개</div><div class="ds">개당 🪙${+(it.price / (it.amount * S.mult.food)).toFixed(2)}</div></div>
          <button class="btn" data-act="buy-food" data-i="${i}">🪙${fmt(it.price)}</button>
        </div>`).join('')}
      </div>`;
    anims.set('shop', t => {
      if (tab !== 'shop') return;
      demo.forEach((g, i) => {
        const c = document.querySelector(`[data-shopegg="${i}"]`);
        if (!c) return;
        const { w, h } = fitCanvas(c);
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, w, h);
        R.drawEgg(ctx, g, t + i, w / 2, h / 2, w * 0.95, {});
      });
    });
  }

  // ----------------------------------------------------------- difficulty
  // 비밀번호는 해시만 보관 (브라우저 안에서만 확인하는 간단한 잠금)
  const PW_HASH = 'dfc93cd0';
  function pwHash(str) {
    let x = 2166136261 >>> 0;
    for (const c of str + '|dragon-nest') { x ^= c.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; }
    return x.toString(16);
  }
  let diffUnlocked = false;
  try { diffUnlocked = sessionStorage.getItem('dn-diff') === '1'; } catch (e) { /* ignore */ }

  function openDifficulty() {
    if (diffUnlocked) { setTab('difficulty'); return; }
    modal('🔒 난이도 조절', `<p class="center muted">비밀번호를 입력하세요</p>
      <input id="pw-input" class="pw-input" type="password" inputmode="numeric" autocomplete="off" maxlength="12">
      <div class="pw-err" id="pw-err"></div>
      <div class="row"><button class="btn ghost" data-act="close">취소</button><button class="btn gold" data-act="pw-ok">확인</button></div>`);
    const inp = $('#pw-input');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') onAction('pw-ok'); });
    setTimeout(() => inp.focus(), 50);
  }

  const MULT_INFO = {
    gold: { ico: '🪙', nm: '골드 획득량', ds: '드래곤 골드 생산 · 모험 보상 · 놓아주기' },
    exp: { ico: '✨', nm: '경험치 획득량', ds: '먹이 · 쓰다듬기 · 모험' },
    food: { ico: '🍖', nm: '먹이 획득량', ds: '모험 보상 · 상점 구매' },
    hatch: { ico: '🥚', nm: '부화 속도', ds: '부화 중인 알에도 바로 적용' },
  };
  const CHIPS = [0.5, 1, 2, 10, 100, 1000];
  const PRESETS = [
    { nm: '어려움', ico: '💀', v: 0.5 }, { nm: '보통', ico: '🙂', v: 1 }, { nm: '쉬움', ico: '😊', v: 3 },
    { nm: '매우 쉬움', ico: '🥳', v: 10 }, { nm: '치트', ico: '👑', v: 1000 },
  ];
  const fmtMult = v => '×' + (v >= 1000 ? fmt(v) : String(+v.toFixed(2)));

  function renderDifficulty() {
    const S = G.S;
    const el = $('#screen-difficulty');
    if (!diffUnlocked) { el.innerHTML = ''; setTab('nest'); return; }
    el.innerHTML = `
      <div class="section-title"><span>🎚️ 난이도 조절</span><button class="btn small ghost" data-act="diff-lock">🔒 잠그기</button></div>
      <div class="presets">${PRESETS.map(p => `<button class="btn ${G.MULT_KEYS.every(k => S.mult[k] === p.v) ? 'gold' : 'ghost'}" data-act="mult-preset" data-v="${p.v}"><i>${p.ico}</i>${p.nm}</button>`).join('')}</div>
      <div class="section-title"><span>항목별 배율</span><small>최소 ×${G.MULT_MIN} · 최대 ×${fmt(G.MULT_MAX)}</small></div>
      <div class="mult-list">${G.MULT_KEYS.map(k => {
        const I = MULT_INFO[k], v = S.mult[k];
        return `<div class="panel mult-card">
          <div class="head"><span class="ico">${I.ico}</span><div><div class="nm">${I.nm}</div><div class="ds">${I.ds}</div></div><span class="val">${fmtMult(v)}</span></div>
          <div class="chips">${CHIPS.map(c => `<button class="chip ${v === c ? 'on' : ''}" data-act="mult-set" data-k="${k}" data-v="${c}">${fmtMult(c)}</button>`).join('')}</div>
          <div class="custom"><input id="mult-${k}" type="number" inputmode="decimal" min="${G.MULT_MIN}" max="${G.MULT_MAX}" step="any" placeholder="직접 입력 (예: 250)"><button class="btn small" data-act="mult-custom" data-k="${k}">적용</button></div>
        </div>`;
      }).join('')}</div>
      <p class="muted center" style="font-size:13px;margin-top:14px">배율은 바로 적용돼요. 상점 가격과 진화 비용은 바뀌지 않아요.</p>
      <button class="btn ghost block" data-act="mult-reset">기본값(×1)으로 되돌리기</button>`;
  }

  // ----------------------------------------------------------- overlays
  function openOverlay(html, onClose) {
    const ov = $('#overlay');
    ov.innerHTML = html;
    ov.classList.add('on');
    ov._onClose = onClose;
  }
  function closeOverlay() {
    const ov = $('#overlay');
    ov.classList.remove('on');
    ov.innerHTML = '';
    anims.delete('reveal');
    if (battle) { battle.stop(); battle = null; }
    const cb = ov._onClose;
    ov._onClose = null;
    if (cb) cb();
  }
  function modal(title, body) {
    openOverlay(`<div class="modal-bg" data-act="close"></div><div class="modal"><button class="close" data-act="close">✕</button><h2>${title}</h2>${body}</div>`);
  }

  // 부화/진화 성공 연출 (레퍼런스의 SUCCESS! 화면)
  function reveal(opts) {
    const g = opts.genome;
    openOverlay(`<div class="reveal">
      <div class="ribbon">${opts.title}</div>
      <canvas id="reveal-canvas"></canvas>
      ${opts.name ? `<div class="rname">${esc(opts.name)}</div>` : ''}
      <div class="rsub">${opts.sub || ''}</div>
      ${opts.isNew ? '<div class="new">✨ NEW! 도감에 등록되었어요</div>' : ''}
      <div class="btns">${opts.buttons || '<button class="btn" data-act="close">확인</button>'}</div>
    </div>`, opts.onClose);
    const t0 = performance.now() / 1000;
    anims.set('reveal', t => {
      const c = $('#reveal-canvas');
      if (!c) return;
      const { w, h } = fitCanvas(c);
      const ctx = c.getContext('2d');
      ctx.clearRect(0, 0, w, h);
      const e = t - t0;
      // 빛 폭발
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(t * 0.2);
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 16; i++) {
        ctx.rotate(Math.PI / 8);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(w, -w * 0.06);
        ctx.lineTo(w, w * 0.06);
        const gr = ctx.createLinearGradient(0, 0, w * 0.6, 0);
        gr.addColorStop(0, 'rgba(255,240,180,0.35)');
        gr.addColorStop(1, 'rgba(255,240,180,0)');
        ctx.fillStyle = gr;
        ctx.fill();
      }
      ctx.restore();
      const grow = Math.min(1, e / 0.6);
      const k = 0.6 + 0.4 * (1 - Math.pow(1 - grow, 3));
      if (opts.egg) R.drawEgg(ctx, g, t, w / 2, h / 2, w * 0.55 * k, { ready: true });
      else R.drawDragon(ctx, g, opts.stage, t, w / 2, h * 0.52, w * 0.95 * k, { fit: true });
      if (e < 0.5) {
        ctx.fillStyle = `rgba(255,255,255,${1 - e / 0.5})`;
        ctx.fillRect(0, 0, w, h);
      }
    });
  }

  // 브라우저 기본 대화상자 대신 게임 내 대화상자 (임베드 환경에서도 동작)
  function askText(title, value, cb) {
    modal(title, `<input id="ask-input" maxlength="12" value="${esc(value)}" style="width:100%;font:inherit;font-size:18px;padding:10px 12px;border-radius:12px;border:2px solid var(--line);background:#0006;color:var(--text)">
      <div class="row"><button class="btn ghost" data-act="close">취소</button><button class="btn gold" data-act="ask-ok">확인</button></div>`);
    $('#overlay')._ask = v => cb(v);
    const inp = $('#ask-input');
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') onAction('ask-ok'); });
    setTimeout(() => { inp.focus(); inp.select(); }, 50);
  }
  function askConfirm(title, text, okLabel, cb) {
    modal(title, `<p class="center" style="white-space:pre-line">${text}</p>
      <div class="row"><button class="btn ghost" data-act="close">취소</button><button class="btn red" data-act="ask-ok">${okLabel}</button></div>`);
    $('#overlay')._ask = cb;
  }

  function showInfo(d) {
    const s = D.calcStats(d);
    const g = d.genome;
    const traits = [TRAIT.body[g.body], TRAIT.wing[g.wing], `${TRAIT.mat[g.horn.mat]} ${TRAIT.horn[g.horn.type]}`, TRAIT.crest[g.crest],
      TRAIT.back[g.back], TRAIT.tailTip[g.tailTip], TRAIT.pattern[g.pattern], TRAIT.eye[g.eye]].filter(Boolean);
    modal(esc(d.name), `
      <div class="center"><img src="${thumb(g, d.stage, 260)}" style="width:180px;height:180px" alt=""></div>
      <div class="badges" style="justify-content:center;margin-bottom:10px">${rarityBadge(g)}${elemBadge(g)}<span class="badge">${D.STAGES[d.stage].name}</span></div>
      <div class="stats">
        <div><span>❤️ 체력</span>${s.hp}</div><div><span>⚔️ 공격</span>${s.atk}</div>
        <div><span>🛡️ 방어</span>${s.def}</div><div><span>💨 속도</span>${s.spd}</div>
        <div><span>💪 전투력</span>${fmt(s.power)}</div><div><span>💗 애정도</span>${d.affection || 0}/100</div>
        <div><span>🪙 생산</span>${fmt(G.goldRate(d))}/분</div><div><span>📅 나이</span>${fmtTime(Date.now() - d.born)}</div>
      </div>
      <div class="traits">${traits.map(x => `<span>${x}</span>`).join('')}</div>
      <div class="row">
        <button class="btn ghost" data-act="rename">✏️ 이름 변경</button>
        <button class="btn red" data-act="release" data-id="${d.id}">🕊️ 놓아주기</button>
      </div>`);
  }

  function showDex() {
    const S = G.S;
    const total = D.ELEMENT_KEYS.length * D.BODY_KEYS.length;
    const got = Object.keys(S.dex).length;
    modal(`📖 드래곤 도감 <small style="font-size:14px;color:var(--muted)">${got}/${total}</small>`,
      D.ELEMENT_KEYS.map(ek => `<div class="dex-h">${D.ELEMENTS[ek].icon} ${D.ELEMENTS[ek].adj}</div>
        <div class="dex">${D.BODY_KEYS.map(bk => {
          const e = S.dex[`${ek}:${bk}`];
          return e ? `<div class="cell"><img src="${thumb(e.genome, 3, 160)}" alt=""><small>${D.BODIES[bk].name}</small></div>`
            : `<div class="cell">?<small style="color:var(--muted)">${D.BODIES[bk].name}</small></div>`;
        }).join('')}</div>`).join('') +
      `<p class="muted center" style="font-size:12px">모든 종류의 드래곤을 모아보세요!</p>`);
  }

  function showSettings() {
    const S = G.S;
    modal('⚙️ 설정', `
      <div class="help">
        <p><b>🥚 부화</b> 상점에서 알을 사거나 교배로 얻어 부화기에 넣어요. 등급이 높을수록 오래 걸려요.</p>
        <p><b>🍖 육성</b> 먹이를 주면 경험치가 올라요. 레벨 상한(5/15/30)에 도달하면 골드로 <b>진화</b>해요.</p>
        <p><b>🪙 골드</b> 드래곤은 시간이 지나면 골드를 만들어요(최대 8시간치). 둥지에서 수집하세요.</p>
        <p><b>⚔️ 모험</b> 자동 전투! 게이지가 차면 <b>필살기</b>를 눌러요. 속성 상성이 중요해요.</p>
        <p><b>💞 교배</b> 성체 2마리로 유전자가 섞인 새 알을 얻어요. 돌연변이로 더 희귀한 드래곤이 나올 수 있어요.</p>
      </div>
      <div class="stats" style="margin-top:10px">
        <div><span>부화</span>${S.stats.hatched}</div><div><span>교배</span>${S.stats.bred}</div>
        <div><span>전투</span>${S.stats.battles}</div><div><span>승리</span>${S.stats.wins}</div>
      </div>
      <div class="row"><button class="btn red" data-act="reset">데이터 초기화</button></div>`);
  }

  function pickDragon(title, filter, onPick) {
    const S = G.S;
    const list = S.dragons.slice().sort((a, b) => b.stage - a.stage || b.level - a.level);
    modal(title, `<div class="picker">${list.map(d => {
      const why = filter ? filter(d) : '';
      return `<button class="card ${why ? 'off' : ''}" data-act="${why ? 'pick-off' : 'pick'}" data-id="${d.id}" data-why="${esc(why || '')}">
        <img src="${thumb(d.genome, d.stage)}" alt=""><span class="el">${D.ELEMENTS[d.genome.element].icon}</span>
        <span class="nm">${esc(d.name)} Lv.${d.level}</span></button>`;
    }).join('') || '<p class="muted">드래곤이 없어요</p>'}</div>`);
    $('#overlay')._pick = onPick;
  }

  // ----------------------------------------------------------- battle
  function startBattle(ri) {
    const d = G.selected();
    if (!d) return;
    const region = G.REGIONS[ri];
    const enemy = G.makeEnemy(ri);
    const eg = enemy.genome;
    openOverlay(`<div class="battle">
      <div class="hud">
        <div class="who">${D.ELEMENTS[d.genome.element].icon} ${esc(d.name)} <span class="muted">Lv.${d.level}</span>
          <div class="bar hp me"><i id="b-php" style="width:100%"></i></div><div class="hpn" id="b-phpn"></div></div>
        <div class="who right"><span class="muted">Lv.${enemy.level}</span> ${esc(enemy.name)} ${D.ELEMENTS[eg.element].icon}
          <div class="bar hp"><i id="b-ehp" style="width:100%"></i></div><div class="hpn" id="b-ehpn"></div></div>
      </div>
      <canvas id="battle-canvas"></canvas>
      <div class="ctrl">
        <button class="btn ghost small" data-act="b-auto" id="b-auto">자동 OFF</button>
        <button class="btn gold skill" data-act="b-skill" id="b-skill"><span class="fill" id="b-fill"></span>💥 필살기</button>
        <button class="btn ghost small" data-act="b-speed" id="b-speed">x1</button>
      </div>
    </div>`, () => render());
    const c = $('#battle-canvas');
    fitCanvas(c);
    battle = DV.Battle(c, d, enemy, region, {
      onUpdate(st) {
        $('#b-php').style.width = (st.php / st.pmax * 100) + '%';
        $('#b-ehp').style.width = (st.ehp / st.emax * 100) + '%';
        $('#b-phpn').textContent = `${st.php}/${st.pmax}`;
        $('#b-ehpn').textContent = `${st.ehp}/${st.emax}`;
        $('#b-fill').style.width = st.gauge + '%';
        $('#b-skill').classList.toggle('ready', st.gauge >= 100);
        $('#b-auto').textContent = st.auto ? '자동 ON' : '자동 OFF';
        $('#b-speed').textContent = 'x' + st.speed;
      },
      onEnd(win) {
        const res = G.battleReward(ri, win, d);
        const box = document.createElement('div');
        box.className = 'result';
        box.innerHTML = `<div class="modal">
          <h2>${win ? '🏆 승리!' : '💫 패배...'}</h2>
          <div class="reward">
            <span>🪙 +${fmt(res.gold)}</span>${res.food ? `<span>🍖 +${res.food}</span>` : ''}<span>✨ EXP +${res.exp}</span>
          </div>
          ${res.ups ? `<p class="center" style="color:var(--gold)">레벨 업! Lv.${d.level}</p>` : ''}
          ${res.unlocked ? `<p class="center" style="color:var(--good)">🔓 새 지역 「${G.REGIONS[ri + 1].name}」 개방!</p>` : ''}
          ${!win ? '<p class="center muted">드래곤을 더 키우거나 상성이 좋은 드래곤으로 도전해보세요.</p>' : ''}
          <div class="row"><button class="btn ghost" data-act="close">나가기</button><button class="btn gold" data-act="fight" data-r="${ri}">다시 도전</button></div>
        </div>`;
        $('.battle').appendChild(box);
      },
    });
  }

  // ----------------------------------------------------------- actions
  function onAction(act, btn) {
    const S = G.S;
    const d = G.selected();
    switch (act) {
      case 'close': closeOverlay(); break;
      case 'dex': showDex(); break;
      case 'difficulty': openDifficulty(); break;
      case 'pw-ok': {
        const inp = $('#pw-input');
        if (!inp) break;
        if (pwHash(inp.value) !== PW_HASH) {
          $('#pw-err').textContent = '비밀번호가 틀렸어요';
          inp.value = '';
          inp.focus();
          break;
        }
        diffUnlocked = true;
        try { sessionStorage.setItem('dn-diff', '1'); } catch (e) { /* ignore */ }
        closeOverlay();
        setTab('difficulty');
        break;
      }
      case 'diff-lock':
        diffUnlocked = false;
        try { sessionStorage.removeItem('dn-diff'); } catch (e) { /* ignore */ }
        setTab('nest');
        toast('🔒 난이도 설정을 잠갔어요');
        break;
      case 'mult-set': G.setMult(btn.dataset.k, +btn.dataset.v); toast(`${MULT_INFO[btn.dataset.k].nm} ${fmtMult(+btn.dataset.v)}`); break;
      case 'mult-custom': {
        const k = btn.dataset.k;
        const v = parseFloat($('#mult-' + k).value);
        if (!(v >= G.MULT_MIN && v <= G.MULT_MAX)) { toast(`×${G.MULT_MIN} ~ ×${fmt(G.MULT_MAX)} 사이로 입력하세요`); break; }
        G.setMult(k, v);
        toast(`${MULT_INFO[k].nm} ${fmtMult(G.S.mult[k])}`);
        break;
      }
      case 'mult-preset': {
        const v = +btn.dataset.v;
        for (const k of G.MULT_KEYS) G.S.mult[k] = v;
        G.changed();
        toast(`모든 배율 ${fmtMult(v)}`);
        break;
      }
      case 'mult-reset': G.resetMult(); toast('기본값으로 되돌렸어요'); break;
      case 'settings': showSettings(); break;
      case 'reset':
        askConfirm('데이터 초기화', '정말 모든 데이터를 지울까요?\n되돌릴 수 없어요.', '초기화', () => { G.reset(); setTab('hatch'); toast('새로 시작했어요!'); });
        break;
      case 'ask-ok': {
        const fn = $('#overlay')._ask;
        const inp = $('#ask-input');
        const v = inp ? inp.value : undefined;
        closeOverlay();
        if (fn) fn(v);
        break;
      }
      case 'collect': {
        const g = G.collectAll();
        if (g > 0) floatAt($('#collect-btn'), `🪙 +${fmt(g)}`, true);
        break;
      }
      case 'feed': {
        if (!d) break;
        const prevStage = d.stage;
        const r = G.feed(d, +btn.dataset.n);
        if (r.err) { toast(r.err); break; }
        floatAt($('#stage-view'), `+${r.exp} EXP`);
        if (r.ups) setTimeout(() => floatAt($('#stage-view'), `LEVEL UP! Lv.${d.level}`, true, -30), 200);
        if (G.canEvolve(d) && prevStage === d.stage) setTimeout(() => toast('✨ 진화할 수 있어요!'), 400);
        break;
      }
      case 'pet': {
        if (!d) break;
        const r = G.pet(d);
        if (r.err) { toast(r.err); break; }
        for (let i = 0; i < 4; i++) setTimeout(() => floatAt($('#stage-view'), '💗'), i * 120);
        if (r.ups) setTimeout(() => floatAt($('#stage-view'), `LEVEL UP! Lv.${d.level}`, true, -30), 300);
        break;
      }
      case 'evolve': {
        if (!d) break;
        const r = G.evolve(d);
        if (r.err) { toast(r.err); break; }
        reveal({ title: 'SUCCESS!', genome: d.genome, stage: d.stage, name: d.name, sub: `${D.STAGES[d.stage].name}(으)로 진화했어요!` });
        break;
      }
      case 'info': if (d) showInfo(d); break;
      case 'rename': {
        if (!d) break;
        askText('✏️ 이름 변경', d.name, n => G.rename(d, n));
        break;
      }
      case 'release': {
        const x = G.get(+btn.dataset.id);
        if (!x) break;
        askConfirm('🕊️ 놓아주기', `${esc(x.name)}을(를) 자연으로 돌려보낼까요?\n🪙 ${fmt(G.releaseValue(x))} 를 받아요.`, '놓아주기', () => {
          const r = G.release(x);
          if (r.err) toast(r.err); else toast(`🕊️ 안녕, ${x.name}! (+🪙${fmt(r.gold)})`);
        });
        break;
      }
      case 'hatch': {
        const id = +btn.dataset.id;
        const egg = S.eggs.find(e => e.id === id);
        if (!egg) break;
        const r = G.hatch(id, !G.eggReady(egg));
        if (r.err) { toast(r.err); break; }
        const nd = r.dragon;
        reveal({
          title: '부화 성공!', genome: nd.genome, stage: 1, name: nd.name, isNew: r.isNew,
          sub: `${D.RARITIES[nd.genome.rarity].name} · ${D.ELEMENTS[nd.genome.element].icon} ${D.speciesName(nd.genome)}`,
          buttons: '<button class="btn ghost" data-act="rename-new">✏️ 이름 짓기</button><button class="btn" data-act="close-to-nest">확인</button>',
        });
        if (S.tutorial) { S.tutorial = false; G.save(); }
        break;
      }
      case 'rename-new': {
        const nd = G.selected();
        askText('✏️ 이름 짓기', nd.name, n => { G.rename(nd, n); setTab('nest'); });
        break;
      }
      case 'close-to-nest': closeOverlay(); setTab('nest'); break;
      case 'free-egg': {
        const r = G.claimFreeEgg();
        if (r.err) { toast(r.err); break; }
        reveal({ title: '알 획득!', genome: r.egg.genome, egg: true, sub: '부화장에 알을 넣었어요', buttons: '<button class="btn" data-act="close-to-hatch">부화장으로</button>' });
        break;
      }
      case 'buy-egg': {
        const item = G.SHOP_EGGS[+btn.dataset.i];
        if (item.pickElement) {
          if (S.gold < item.price) { toast('골드가 부족해요'); break; }
          modal('속성을 골라주세요', `<div class="el-pick">${D.ELEMENT_KEYS.map(k => `<button class="btn ghost" data-act="buy-el" data-el="${k}" data-i="${btn.dataset.i}"><span style="font-size:24px">${D.ELEMENTS[k].icon}</span>${D.ELEMENTS[k].name}</button>`).join('')}</div>`);
          break;
        }
        buyEgg(item);
        break;
      }
      case 'buy-el': buyEgg(G.SHOP_EGGS[+btn.dataset.i], btn.dataset.el); break;
      case 'close-to-hatch': closeOverlay(); setTab('hatch'); break;
      case 'buy-food': {
        const it = G.SHOP_FOOD[+btn.dataset.i];
        const r = G.buyFood(it);
        if (r.err) toast(r.err); else floatAt(btn, `🍖 +${fmt(r.amount)}`);
        break;
      }
      case 'pick-adv':
        pickDragon('모험 갈 드래곤', null, x => { S.selectedId = x.id; G.changed(); });
        break;
      case 'pick-parent': {
        const i = +btn.dataset.i;
        pickDragon(`부모 ${i + 1} 선택`, x => {
          if (x.stage < 3) return '성체 이상만 가능해요';
          if (G.breedLeft(x)) return `쉬는 중 (${fmtTime(G.breedLeft(x))})`;
          if (breedSel[1 - i] === x.id) return '이미 선택했어요';
          return '';
        }, x => { breedSel[i] = x.id; render(); });
        break;
      }
      case 'pick': {
        const cb = $('#overlay')._pick;
        const x = G.get(+btn.dataset.id);
        closeOverlay();
        if (cb && x) cb(x);
        break;
      }
      case 'pick-off': toast(btn.dataset.why); break;
      case 'breed': {
        const [a, b] = breedSel.map(id => id && G.get(id));
        const r = G.breed(a, b);
        if (r.err) { toast(r.err); break; }
        breedSel = [null, null];
        reveal({ title: '새 알 탄생!', genome: r.egg.genome, egg: true, sub: `${esc(a.name)} 💗 ${esc(b.name)}<br>부화장에 알을 넣었어요`, buttons: '<button class="btn" data-act="close-to-hatch">부화장으로</button>' });
        break;
      }
      case 'locked': toast('이전 지역을 먼저 클리어하세요'); break;
      case 'fight': {
        if (battle) closeOverlay();
        startBattle(+btn.dataset.r);
        break;
      }
      case 'b-skill':
        if (battle) { battle.skill(); if (!battle.skillQueued) toast('게이지가 아직 부족해요'); }
        break;
      case 'b-auto': if (battle) battle.toggleAuto(); break;
      case 'b-speed': if (battle) battle.toggleSpeed(); break;
    }
  }

  function buyEgg(item, el) {
    const r = G.buyEgg(item, el);
    if (r.err) { toast(r.err); return; }
    reveal({ title: '알 획득!', genome: r.egg.genome, egg: true, sub: `${item.name}을(를) 부화장에 넣었어요`, buttons: '<button class="btn ghost" data-act="close">계속 쇼핑</button><button class="btn" data-act="close-to-hatch">부화장으로</button>' });
  }

  // ----------------------------------------------------------- boot
  function boot() {
    const first = G.load();
    G.onChange(() => {
      if (!$('#overlay').classList.contains('on') || battle) renderTop();
      if (!battle) render();
    });

    document.addEventListener('click', e => {
      const tabBtn = e.target.closest('[data-tab]');
      if (tabBtn) { setTab(tabBtn.dataset.tab); return; }
      const go = e.target.closest('[data-tab-go]');
      if (go) { closeOverlay(); setTab(go.dataset.tabGo); return; }
      const card = e.target.closest('.roster .card[data-id]');
      if (card) { G.S.selectedId = +card.dataset.id; G.changed(); return; }
      const a = e.target.closest('[data-act]');
      if (a) onAction(a.dataset.act, a);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.id && e.target.id.startsWith('mult-')) {
        const b = document.querySelector(`[data-act="mult-custom"][data-k="${e.target.id.slice(5)}"]`);
        if (b) onAction('mult-custom', b);
      }
    });
    // 드래곤을 직접 터치하면 쓰다듬기
    document.addEventListener('click', e => {
      if (e.target.id === 'nest-canvas') onAction('pet', e.target);
    });

    setInterval(() => {
      renderTop();
      if (tab === 'hatch') tickHatch();
      if (tab === 'nest') {
        const b = $('#collect-btn');
        if (b) { const p = G.totalPending(); b.textContent = `🪙 +${fmt(p)}`; b.classList.toggle('hidden', p <= 0); }
      }
      if (tab === 'shop') {
        const ds = $('#free-ds');
        const f = G.freeEggLeft();
        if (ds) ds.textContent = f ? `${fmtTime(f)} 뒤 받을 수 있어요` : '지금 받을 수 있어요!';
        if (!f && $('[data-act="free-egg"].disabled')) render();
      }
    }, 1000);

    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

    setTab(first || !G.S.dragons.length ? 'hatch' : 'nest');
    requestAnimationFrame(loop);
    if (first) {
      modal('🐉 드래곤 둥지', `<div class="help center">
        <p>먼 옛날 사라진 드래곤의 알이 당신에게 맡겨졌어요.</p>
        <p>세상에 단 하나뿐인 드래곤을 <b>부화</b>시키고,<br><b>먹이</b>를 주며 키워 <b>고룡</b>으로 진화시켜 보세요!</p>
        <p class="muted">첫 알이 곧 부화해요. 잠시 기다려 주세요!</p>
      </div><div class="row"><button class="btn gold" data-act="close">시작하기</button></div>`);
    }
  }

  DV.ui = { setTab, toast };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.DV = window.DV || {});
