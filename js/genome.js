// 드래곤 유전자: 생성, 교배, 이름, 능력치
(function (DV) {
  'use strict';
  const { makeRng, newSeed, clamp, hueMix, wrapHue } = DV.util;

  const ELEMENTS = {
    fire:    { key: 'fire',    name: '불',   icon: '🔥', hue: 8,   sat: 85, light: 50, adj: '화염', color: '#ff5a3c' },
    water:   { key: 'water',   name: '물',   icon: '💧', hue: 214, sat: 78, light: 50, adj: '심해', color: '#3d8bff' },
    forest:  { key: 'forest',  name: '숲',   icon: '🌿', hue: 128, sat: 55, light: 44, adj: '신록', color: '#4cc46a' },
    thunder: { key: 'thunder', name: '번개', icon: '⚡', hue: 188, sat: 90, light: 52, adj: '뇌전', color: '#29e0ff' },
    light:   { key: 'light',   name: '빛',   icon: '✨', hue: 46,  sat: 40, light: 82, adj: '성광', color: '#ffe27a' },
    dark:    { key: 'dark',    name: '어둠', icon: '🌙', hue: 272, sat: 40, light: 26, adj: '심연', color: '#a46bff' },
  };
  const ELEMENT_KEYS = Object.keys(ELEMENTS);

  // 상성: 불 > 숲 > 번개 > 물 > 불, 빛 <-> 어둠
  const STRONG = { fire: 'forest', forest: 'thunder', thunder: 'water', water: 'fire' };
  function elemMult(atk, def) {
    if ((atk === 'light' && def === 'dark') || (atk === 'dark' && def === 'light')) return 1.5;
    if (STRONG[atk] === def) return 1.5;
    if (STRONG[def] === atk) return 0.7;
    return 1;
  }

  const RARITIES = [
    { key: 'N', name: '노멀',   color: '#b9c3cf', mult: 1.0,  hatchSec: 15 },
    { key: 'R', name: '레어',   color: '#4fc3f7', mult: 1.15, hatchSec: 30 },
    { key: 'E', name: '에픽',   color: '#b388ff', mult: 1.35, hatchSec: 60 },
    { key: 'L', name: '레전드', color: '#ffc928', mult: 1.6,  hatchSec: 120 },
    { key: 'M', name: '신화',   color: '#ff5c8a', mult: 2.0,  hatchSec: 180 },
  ];

  const BODIES = {
    wyvern:  { name: '와이번' },
    beast:   { name: '비스트' },
    drake:   { name: '드레이크' },
    serpent: { name: '서펜트' },
  };
  const BODY_KEYS = Object.keys(BODIES);

  // stage: 0 알, 1 해치링, 2 유년기, 3 성체, 4 고룡
  const STAGES = [
    { name: '알' },
    { name: '해치링', cap: 5,  evoCost: 100,  mult: 1.0 },
    { name: '유년기', cap: 15, evoCost: 600,  mult: 1.15 },
    { name: '성체',   cap: 30, evoCost: 3000, mult: 1.35 },
    { name: '고룡',   cap: 50, evoCost: 0,    mult: 1.65 },
  ];

  const SYL = ['아', '카', '라', '리', '루', '미', '세', '시', '엘', '오', '이', '제', '크', '타', '티', '페', '하', '바',
    '베', '노', '니', '디', '로', '소', '유', '에', '벨', '실', '렌', '칼', '헬', '네', '도', '마', '비', '셀', '아르',
    '이그', '드라', '발', '펜', '젤', '케', '쿠', '토', '스카', '모', '레', '나', '키'];
  const END = ['론', '라', '스', '니아', '온', '르', '곤', '닉', '렌', '엘', '린', '토스', '드', '칸', '레아', '즈',
    '릭', '엔', '리온', '가르', '샤', '루스', '티아', '벨', '돈', '나르'];

  function makeName(seed) {
    const r = makeRng(seed ^ 0x51ed27);
    let s = r.pick(SYL);
    if (r.chance(0.55)) s += r.pick(SYL);
    return s + r.pick(END);
  }

  function rollRarity(r, weights) {
    const w = weights || [60, 27, 10, 2.6, 0.4];
    return r.weighted(w.map((x, i) => [i, x]));
  }

  function rollElement(r) {
    return r.weighted([['fire', 20], ['water', 20], ['forest', 20], ['thunder', 18], ['light', 11], ['dark', 11]]);
  }

  function makeColors(r, element, rarity) {
    const E = ELEMENTS[element];
    const c = {};
    c.h1 = wrapHue(E.hue + r.range(-16, 16));
    c.s1 = clamp(E.sat + r.range(-15, 10) + rarity * 2, 15, 100);
    c.l1 = clamp(E.light + r.range(-8, 8), 16, 88);
    const scheme = r.weighted([['analog', 30], ['comp', 25], ['split', 20], ['mono', 15], ['gold', 10]]);
    c.h2 = wrapHue({
      analog: c.h1 + r.pick([-35, 35]),
      comp: c.h1 + 180,
      split: c.h1 + r.pick([150, 210]),
      mono: c.h1 + r.range(-8, 8),
      gold: 44,
    }[scheme]);
    c.s2 = r.range(55, 95);
    c.l2 = element === 'dark' ? r.range(32, 55) : r.range(48, 70);
    c.hb = r.chance(0.5) ? c.h2 : wrapHue(40 + r.range(-10, 15));
    c.sb = r.range(35, 75);
    c.lb = element === 'dark' ? r.range(40, 55) : r.range(70, 86);
    c.ha = r.weighted([[44, 55], [wrapHue(c.h1 + 180), 15], [330, 10], [190, 10], [wrapHue(c.h2), 10]]);
    c.he = r.weighted([[wrapHue(E.hue + 180), 25], [c.ha, 25], [50, 20], [E.hue, 15], [350, 15]]);
    c.hg = element === 'light' ? 48 : E.hue;
    if (element === 'light') { c.s1 = r.range(15, 45); c.l1 = r.range(78, 88); }
    return c;
  }

  function generateGenome(opts) {
    opts = opts || {};
    const seed = opts.seed != null ? opts.seed >>> 0 : newSeed();
    const r = makeRng(seed);
    const element = opts.element || rollElement(r);
    const rarity = opts.rarity != null ? opts.rarity : rollRarity(r, opts.rarityWeights);
    const body = opts.body || r.weighted([['wyvern', 30], ['beast', 28], ['drake', 24], ['serpent', 18]]);
    const rr = rarity;
    const serp = body === 'serpent';

    const g = {
      seed, element, rarity, body,
      colors: makeColors(r, element, rarity),
      shape: {
        bodyLen: r.range(0.85, 1.2),
        bodyThick: r.range(0.85, 1.2),
        neckLen: r.range(0.8, 1.2),
        legLen: r.range(0.85, 1.15),
        headSize: r.range(0.9, 1.15),
        snoutLen: r.range(0.75, 1.25),
        tailLen: r.range(0.85, 1.2),
        wingSize: r.range(0.85, 1.2),
      },
      wing: r.weighted([['none', serp ? 45 : 6], ['bat', 38], ['feather', 30], ['crystal', 6 + rr * 6], ['flame', 5 + rr * 6]]),
      horn: {
        type: r.weighted([['curved', 30], ['straight', 20], ['antler', serp ? 40 : 15], ['spiral', 15], ['crown', 8 + rr * 4]]),
        count: r.weighted([[1, 30], [2, 45], [3, 25]]),
        len: r.range(0.8, 1.25),
        mat: r.weighted([['bone', 40], ['gold', 10 + rr * 10], ['crystal', 8 + rr * 5], ['obsidian', element === 'dark' ? 30 : 8], ['accent', 15]]),
      },
      crest: r.weighted([['none', 20], ['mane', body === 'beast' ? 55 : 15], ['fins', 20], ['feathers', 15], ['frill', 15]]),
      back: r.weighted([['spikes', 30], ['fins', 20], ['fur', body === 'beast' ? 35 : 12], ['plates', 15], ['none', 10]]),
      tailTip: r.weighted([['spade', 22], ['flame', 12 + rr * 3], ['fin', 18], ['tuft', body === 'beast' ? 30 : 14], ['crystal', 8 + rr * 4], ['plain', 12]]),
      pattern: r.weighted([['none', 18], ['stripes', 26], ['spots', 24], ['scales', 22], ['runes', rr >= 2 ? 20 : 0]]),
      eye: r.weighted([['slit', 40], ['round', 35], ['glow', 25]]),
      base: {
        hp: Math.round(r.range(90, 120)),
        atk: Math.round(r.range(16, 24)),
        def: Math.round(r.range(8, 14)),
        spd: Math.round(r.range(8, 14)),
      },
    };
    return g;
  }

  // 두 부모의 유전자를 섞는다. 일정 확률로 돌연변이.
  function breedGenome(a, b) {
    const seed = newSeed();
    const r = makeRng(seed);
    const mut = 0.12;
    const pick = (x, y) => (r() < 0.5 ? x : y);
    const fresh = generateGenome({ seed: seed ^ 0xabcdef });

    const element = r.chance(0.08) ? rollElement(r) : pick(a.element, b.element);
    const hi = Math.max(a.rarity, b.rarity), lo = Math.min(a.rarity, b.rarity);
    let rarity = r.weighted([[hi + 1, 14], [hi, 46], [lo, 40]]);
    rarity = clamp(rarity, 0, 4);
    const body = r.chance(mut) ? fresh.body : pick(a.body, b.body);

    const ca = a.colors, cb = b.colors, cf = fresh.colors;
    const t = r();
    const colors = {};
    for (const k of ['h1', 'h2', 'hb', 'ha', 'he']) colors[k] = hueMix(ca[k], cb[k], r.chance(0.6) ? t : r.pick([0, 1]));
    for (const k of ['s1', 'l1', 's2', 'l2', 'sb', 'lb']) colors[k] = ca[k] + (cb[k] - ca[k]) * t;
    if (r.chance(mut)) colors.h2 = cf.h2;
    if (r.chance(mut)) colors.ha = cf.ha;
    if (element !== a.element && element !== b.element) {
      // 속성이 바뀌면 몸 색도 새 속성을 따른다
      const nc = makeColors(r, element, rarity);
      colors.h1 = nc.h1; colors.s1 = nc.s1; colors.l1 = nc.l1;
    }
    colors.hg = element === 'light' ? 48 : ELEMENTS[element].hue;

    const shape = {};
    for (const k of Object.keys(a.shape)) {
      shape[k] = clamp((a.shape[k] + b.shape[k]) / 2 + r.range(-0.08, 0.08), 0.75, 1.3);
    }
    const trait = key => (r.chance(mut) ? fresh[key] : pick(a[key], b[key]));
    const horn = r.chance(mut) ? fresh.horn : {
      type: pick(a.horn.type, b.horn.type),
      count: pick(a.horn.count, b.horn.count),
      len: (a.horn.len + b.horn.len) / 2,
      mat: pick(a.horn.mat, b.horn.mat),
    };
    const base = {};
    for (const k of Object.keys(a.base)) {
      base[k] = Math.round(((a.base[k] + b.base[k]) / 2) * r.range(0.97, 1.1));
    }
    return {
      seed, element, rarity, body, colors, shape, horn, base,
      wing: trait('wing'), crest: trait('crest'), back: trait('back'),
      tailTip: trait('tailTip'), pattern: trait('pattern'), eye: trait('eye'),
    };
  }

  function speciesName(g) {
    return `${ELEMENTS[g.element].adj} ${BODIES[g.body].name}`;
  }
  function dexKey(g) { return `${g.element}:${g.body}`; }

  function expNeed(level) { return Math.floor(20 + level * 12 + level * level * 3); }

  function calcStats(d) {
    const g = d.genome;
    const R = RARITIES[g.rarity].mult;
    const st = STAGES[Math.max(1, d.stage)].mult;
    const lv = d.level;
    const aff = 1 + Math.min(100, d.affection || 0) * 0.002;
    const f = (b, grow) => Math.round(b * R * st * aff * (1 + (lv - 1) * grow));
    const s = { hp: f(g.base.hp, 0.12), atk: f(g.base.atk, 0.1), def: f(g.base.def, 0.09), spd: f(g.base.spd, 0.04) };
    s.power = Math.round(s.hp / 4 + s.atk * 2 + s.def * 1.5 + s.spd);
    return s;
  }

  // 분당 골드 생산량
  function goldRate(d) {
    return (2 + d.level * 0.8) * RARITIES[d.genome.rarity].mult * STAGES[Math.max(1, d.stage)].mult;
  }

  function stageForLevel(lv) {
    if (lv >= 30) return 4;
    if (lv >= 15) return 3;
    if (lv >= 5) return 2;
    return 1;
  }

  DV.data = {
    ELEMENTS, ELEMENT_KEYS, RARITIES, BODIES, BODY_KEYS, STAGES,
    elemMult, generateGenome, breedGenome, makeName, speciesName, dexKey,
    expNeed, calcStats, goldRate, stageForLevel, rollRarity,
  };
})(window.DV = window.DV || {});
