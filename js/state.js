// 게임 상태 + 규칙. 저장은 localStorage.
(function (DV) {
  'use strict';
  const D = DV.data;
  const { makeRng, newSeed } = DV.util;
  const SAVE_KEY = 'dragon-nest-save-v1';

  const CONFIG = {
    nestCap: 12,
    incubators: 3,
    expPerFood: 12,
    petCooldown: 30 * 1000,
    goldCapHours: 8,
    breedCooldown: 3 * 60 * 1000,
    freeEggCooldown: 60 * 60 * 1000,
  };

  const SHOP_EGGS = [
    { id: 'basic', name: '평범한 알', desc: '무작위 속성 · 노멀~레어 위주', price: 150, weights: [70, 25, 4.5, 0.5, 0] },
    { id: 'element', name: '속성의 알', desc: '원하는 속성을 고를 수 있어요', price: 400, weights: [55, 32, 11, 2, 0], pickElement: true },
    { id: 'shiny', name: '빛나는 알', desc: '에픽 이상 확률 대폭 상승', price: 1500, weights: [0, 50, 38, 10, 2] },
    { id: 'ancient', name: '고대의 알', desc: '레전드 이상 확정!', price: 8000, weights: [0, 0, 0, 85, 15] },
  ];
  const SHOP_FOOD = [
    { id: 'f10', name: '고기 10개', amount: 10, price: 60 },
    { id: 'f50', name: '고기 50개', amount: 50, price: 270 },
    { id: 'f200', name: '고기 200개', amount: 200, price: 960 },
  ];

  const REGIONS = [
    { name: '초원의 둥지', lv: [1, 3], elems: ['forest', 'water', 'fire'], rar: [80, 20, 0, 0, 0], bg: [120, 40], gold: 40, food: 4 },
    { name: '화산 협곡', lv: [4, 8], elems: ['fire'], rar: [60, 32, 8, 0, 0], bg: [10, 45], gold: 90, food: 6 },
    { name: '심해 동굴', lv: [8, 13], elems: ['water'], rar: [50, 35, 13, 2, 0], bg: [215, 35], gold: 160, food: 9 },
    { name: '번개 봉우리', lv: [13, 19], elems: ['thunder'], rar: [35, 40, 20, 5, 0], bg: [190, 30], gold: 260, food: 12 },
    { name: '고대 숲', lv: [19, 26], elems: ['forest', 'thunder'], rar: [20, 40, 30, 9, 1], bg: [130, 30], gold: 400, food: 16 },
    { name: '빛의 성역', lv: [26, 34], elems: ['light'], rar: [5, 35, 40, 17, 3], bg: [48, 40], gold: 650, food: 22 },
    { name: '어둠의 심연', lv: [34, 42], elems: ['dark'], rar: [0, 25, 45, 25, 5], bg: [275, 30], gold: 1000, food: 30 },
    { name: '용왕의 왕좌', lv: [42, 50], elems: ['fire', 'water', 'forest', 'thunder', 'light', 'dark'], rar: [0, 0, 30, 55, 15], bg: [330, 35], gold: 1800, food: 45 },
  ];

  // 난이도 배율 (1 = 기본)
  const MULT_KEYS = ['gold', 'exp', 'food', 'hatch'];
  const MULT_MIN = 0.1, MULT_MAX = 1000000;
  const defaultMult = () => ({ gold: 1, exp: 1, food: 1, hatch: 1 });

  let S = null;
  const listeners = new Set();

  function defaultState() {
    return {
      v: 1, gold: 500, food: 30, dragons: [], eggs: [], selectedId: null, dex: {},
      cleared: 0, lastFreeEgg: 0, nextId: 1,
      stats: { hatched: 0, battles: 0, wins: 0, bred: 0 },
      created: Date.now(), tutorial: true,
      mult: defaultMult(),
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        S = Object.assign(defaultState(), JSON.parse(raw));
        S.mult = Object.assign(defaultMult(), S.mult);
        return false;
      }
    } catch (e) { /* 저장소를 못 쓰는 환경이면 새로 시작 */ }
    S = defaultState();
    // 시작 알: 빨리 부화
    addEgg(D.generateGenome({ rarity: 1 }), 8);
    return true;
  }

  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* ignore */ }
  }

  function changed() {
    save();
    for (const fn of listeners) fn();
  }

  function reset() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
    load();
    changed();
  }

  // ---------------------------------------------------------------- eggs
  function addEgg(genome, seconds) {
    if (S.eggs.length >= CONFIG.incubators) return null;
    const egg = {
      id: S.nextId++, genome, start: Date.now(),
      dur: (seconds != null ? seconds : D.RARITIES[genome.rarity].hatchSec) * 1000,
    };
    S.eggs.push(egg);
    return egg;
  }
  const m = k => S.mult[k] || 1;
  // 부화 속도 배율은 이미 부화 중인 알에도 바로 적용된다
  const eggDur = e => e.dur / m('hatch');
  const eggLeft = e => Math.max(0, eggDur(e) - (Date.now() - e.start));
  const eggProgress = e => Math.min(1, (Date.now() - e.start) / eggDur(e));
  const eggReady = e => eggLeft(e) <= 0;
  const skipCost = e => Math.ceil(eggLeft(e) / 1000) * 3;
  const expPerFood = () => Math.max(1, Math.round(CONFIG.expPerFood * m('exp')));
  const goldRate = d => D.goldRate(d) * m('gold');

  function setMult(key, v) {
    if (!MULT_KEYS.includes(key)) return;
    v = Number(v);
    if (!isFinite(v) || v <= 0) return;
    S.mult[key] = Math.min(MULT_MAX, Math.max(MULT_MIN, v));
    changed();
  }
  function resetMult() { S.mult = defaultMult(); changed(); }

  function hatch(eggId, force) {
    const egg = S.eggs.find(e => e.id === eggId);
    if (!egg) return { err: '알을 찾을 수 없어요' };
    if (S.dragons.length >= CONFIG.nestCap) return { err: '둥지가 가득 찼어요! 드래곤을 놓아주세요.' };
    if (!eggReady(egg)) {
      if (!force) return { err: '아직 부화할 때가 아니에요' };
      const cost = skipCost(egg);
      if (S.gold < cost) return { err: '골드가 부족해요' };
      S.gold -= cost;
    }
    S.eggs = S.eggs.filter(e => e.id !== eggId);
    const d = {
      id: S.nextId++, name: D.makeName(egg.genome.seed), genome: egg.genome,
      level: 1, exp: 0, stage: 1, affection: 0,
      born: Date.now(), lastCollect: Date.now(), petAt: 0, breedAt: 0,
    };
    S.dragons.push(d);
    S.selectedId = d.id;
    S.stats.hatched++;
    const key = D.dexKey(d.genome);
    const isNew = !S.dex[key];
    if (isNew || S.dex[key].rarity < d.genome.rarity) S.dex[key] = { genome: d.genome, at: Date.now() };
    changed();
    return { dragon: d, isNew };
  }

  // ------------------------------------------------------------- dragons
  const get = id => S.dragons.find(d => d.id === id);
  const selected = () => get(S.selectedId) || S.dragons[0] || null;
  const cap = d => D.STAGES[d.stage].cap;
  const atCap = d => d.level >= cap(d) && d.exp >= D.expNeed(d.level);
  const canEvolve = d => d.stage < 4 && d.level >= cap(d);

  function addExp(d, amount) {
    let ups = 0;
    d.exp += amount;
    while (d.level < cap(d) && d.exp >= D.expNeed(d.level)) {
      d.exp -= D.expNeed(d.level);
      d.level++;
      ups++;
    }
    if (d.level >= cap(d)) d.exp = Math.min(d.exp, D.expNeed(d.level));
    return ups;
  }

  function feed(d, n) {
    if (atCap(d)) return { err: d.stage < 4 ? '진화가 필요해요!' : '최대 레벨이에요' };
    n = Math.min(n, S.food);
    if (n <= 0) return { err: '먹이가 부족해요. 상점이나 모험에서 구해요!' };
    // 필요한 만큼만 먹인다
    let used = 0, ups = 0;
    while (used < n && !atCap(d)) {
      ups += addExp(d, expPerFood());
      used++;
    }
    S.food -= used;
    changed();
    return { used, ups, exp: used * expPerFood() };
  }

  function pet(d) {
    const left = d.petAt + CONFIG.petCooldown - Date.now();
    if (left > 0) return { err: `${Math.ceil(left / 1000)}초 뒤에 다시 쓰다듬을 수 있어요` };
    d.petAt = Date.now();
    d.affection = Math.min(100, (d.affection || 0) + 2);
    const ups = atCap(d) ? 0 : addExp(d, Math.max(1, Math.round(5 * m('exp'))));
    changed();
    return { ups };
  }

  function evolve(d) {
    if (!canEvolve(d)) return { err: '아직 진화할 수 없어요' };
    const cost = D.STAGES[d.stage].evoCost;
    if (S.gold < cost) return { err: `골드가 부족해요 (${cost} 필요)` };
    S.gold -= cost;
    d.stage++;
    if (d.exp >= D.expNeed(d.level)) { d.exp -= D.expNeed(d.level); d.level++; }
    changed();
    return { ok: true };
  }

  function rename(d, name) {
    name = String(name || '').trim().slice(0, 12);
    if (!name) return;
    d.name = name;
    changed();
  }

  function releaseValue(d) { return Math.round(50 * d.level * D.RARITIES[d.genome.rarity].mult * d.stage * m('gold')); }
  function release(d) {
    if (S.dragons.length <= 1) return { err: '마지막 드래곤은 놓아줄 수 없어요' };
    const g = releaseValue(d);
    S.gold += g;
    S.dragons = S.dragons.filter(x => x.id !== d.id);
    if (S.selectedId === d.id) S.selectedId = S.dragons[0] && S.dragons[0].id;
    changed();
    return { gold: g };
  }

  function pendingGold(d) {
    const mins = (Date.now() - d.lastCollect) / 60000;
    return Math.floor(Math.min(mins, CONFIG.goldCapHours * 60) * goldRate(d));
  }
  function totalPending() { return S.dragons.reduce((a, d) => a + pendingGold(d), 0); }
  function collectAll() {
    let sum = 0;
    const now = Date.now();
    for (const d of S.dragons) {
      const g = pendingGold(d);
      if (g > 0) {
        sum += g;
        // 소수점 이하 분은 다음 수집으로 이월
        d.lastCollect = Math.max(d.lastCollect + (g / goldRate(d)) * 60000, now - CONFIG.goldCapHours * 3600000);
      }
    }
    S.gold += sum;
    changed();
    return sum;
  }

  // ---------------------------------------------------------------- shop
  function buyEgg(item, element) {
    if (S.gold < item.price) return { err: '골드가 부족해요' };
    if (S.eggs.length >= CONFIG.incubators) return { err: '부화장이 가득 찼어요' };
    const seed = newSeed();
    const r = makeRng(seed);
    const g = D.generateGenome({ seed, element: element || undefined, rarity: D.rollRarity(r, item.weights) });
    S.gold -= item.price;
    const egg = addEgg(g);
    changed();
    return { egg };
  }
  function buyFood(item) {
    if (S.gold < item.price) return { err: '골드가 부족해요' };
    S.gold -= item.price;
    const amount = Math.round(item.amount * m('food'));
    S.food += amount;
    changed();
    return { ok: true, amount };
  }
  const freeEggLeft = () => Math.max(0, S.lastFreeEgg + CONFIG.freeEggCooldown - Date.now());
  function claimFreeEgg() {
    if (freeEggLeft() > 0) return { err: '아직 준비 중이에요' };
    if (S.eggs.length >= CONFIG.incubators) return { err: '부화장이 가득 찼어요' };
    S.lastFreeEgg = Date.now();
    const egg = addEgg(D.generateGenome({ rarityWeights: [65, 28, 6, 1, 0] }));
    changed();
    return { egg };
  }

  // --------------------------------------------------------------- breed
  const breedLeft = d => Math.max(0, (d.breedAt || 0) + CONFIG.breedCooldown - Date.now());
  const breedCost = (a, b) => 300 * (1 + a.genome.rarity + b.genome.rarity);
  function breed(a, b) {
    if (!a || !b || a.id === b.id) return { err: '서로 다른 두 드래곤을 골라주세요' };
    if (a.stage < 3 || b.stage < 3) return { err: '성체 이상만 교배할 수 있어요' };
    if (breedLeft(a) || breedLeft(b)) return { err: '아직 쉬는 중인 드래곤이 있어요' };
    const cost = breedCost(a, b);
    if (S.gold < cost) return { err: `골드가 부족해요 (${cost} 필요)` };
    if (S.eggs.length >= CONFIG.incubators) return { err: '부화장이 가득 찼어요' };
    const g = D.breedGenome(a.genome, b.genome);
    S.gold -= cost;
    a.breedAt = b.breedAt = Date.now();
    const egg = addEgg(g, Math.round(D.RARITIES[g.rarity].hatchSec * 1.5));
    S.stats.bred++;
    changed();
    return { egg };
  }

  // ----------------------------------------------------------- adventure
  function makeEnemy(regionIdx) {
    const R = REGIONS[regionIdx];
    const r = makeRng(newSeed());
    const g = D.generateGenome({ element: r.pick(R.elems), rarity: D.rollRarity(r, R.rar) });
    const level = r.int(R.lv[0], R.lv[1]);
    const stage = D.stageForLevel(level);
    return { id: -1, name: D.makeName(g.seed), genome: g, level, stage, affection: 0 };
  }

  function battleReward(regionIdx, win, d) {
    const R = REGIONS[regionIdx];
    S.stats.battles++;
    const res = { gold: 0, food: 0, exp: 0, ups: 0, unlocked: false };
    if (win) {
      S.stats.wins++;
      res.gold = Math.round(R.gold * (0.85 + Math.random() * 0.3) * m('gold'));
      res.food = Math.round(R.food * m('food'));
      res.exp = Math.round((15 + R.lv[1] * 8) * m('exp'));
      if (regionIdx >= S.cleared && regionIdx < REGIONS.length - 1) { S.cleared = regionIdx + 1; res.unlocked = true; }
    } else {
      res.gold = Math.round(R.gold * 0.15 * m('gold'));
      res.exp = Math.round((4 + R.lv[0] * 2) * m('exp'));
    }
    S.gold += res.gold;
    S.food += res.food;
    if (!atCap(d)) res.ups = addExp(d, res.exp);
    changed();
    return res;
  }

  DV.game = {
    CONFIG, SHOP_EGGS, SHOP_FOOD, REGIONS,
    get S() { return S; },
    load, save, reset, changed, onChange: fn => listeners.add(fn),
    MULT_KEYS, MULT_MIN, MULT_MAX, setMult, resetMult, goldRate, expPerFood,
    eggProgress, eggReady, eggLeft, skipCost, hatch,
    get, selected, atCap, canEvolve, feed, pet, evolve, rename, release, releaseValue,
    pendingGold, totalPending, collectAll,
    buyEgg, buyFood, freeEggLeft, claimFreeEgg,
    breedLeft, breedCost, breed,
    makeEnemy, battleReward,
  };
})(window.DV = window.DV || {});
