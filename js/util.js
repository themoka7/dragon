// 공용 유틸: 시드 RNG, 색상, 수학 헬퍼
(function (DV) {
  'use strict';

  // mulberry32 — 시드 고정 난수. 같은 시드면 항상 같은 드래곤이 나온다.
  function makeRng(seed) {
    let a = seed >>> 0;
    const next = function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.range = (min, max) => min + next() * (max - min);
    next.int = (min, max) => Math.floor(min + next() * (max - min + 1));
    next.pick = arr => arr[Math.floor(next() * arr.length)];
    next.chance = p => next() < p;
    // [[값, 가중치], ...]
    next.weighted = pairs => {
      let total = 0;
      for (const [, w] of pairs) total += Math.max(0, w);
      let x = next() * total;
      for (const [v, w] of pairs) {
        x -= Math.max(0, w);
        if (x <= 0) return v;
      }
      return pairs[pairs.length - 1][0];
    };
    return next;
  }

  const newSeed = () => (Math.random() * 4294967296) >>> 0;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const wrapHue = h => ((h % 360) + 360) % 360;

  function hsl(h, s, l, a) {
    h = wrapHue(h);
    s = clamp(s, 0, 100);
    l = clamp(l, 0, 100);
    return a === undefined || a >= 1
      ? `hsl(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%)`
      : `hsla(${h.toFixed(1)},${s.toFixed(1)}%,${l.toFixed(1)}%,${a.toFixed(3)})`;
  }

  // 원형 색상환에서의 평균
  function hueMix(a, b, t) {
    let d = wrapHue(b - a);
    if (d > 180) d -= 360;
    return wrapHue(a + d * t);
  }

  function fmt(n) {
    n = Math.floor(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K';
    return n.toLocaleString('ko-KR');
  }

  function fmtTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    if (h) return `${h}시간 ${m}분`;
    if (m) return `${m}분 ${String(sec).padStart(2, '0')}초`;
    return `${sec}초`;
  }

  DV.util = { makeRng, newSeed, clamp, lerp, hsl, hueMix, wrapHue, fmt, fmtTime };
})(window.DV = window.DV || {});
