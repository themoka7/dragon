// 절차적 드래곤 렌더러. 유전자 + 성장 단계 + 시간 t 를 받아 캔버스에 그린다.
// 모든 좌표는 드래곤 로컬 단위(성체 기준 약 300x260)이며 오른쪽을 바라본다.
(function (DV) {
  'use strict';
  const { makeRng, hsl, clamp, lerp } = DV.util;
  const TAU = Math.PI * 2;
  const LW = 3; // 외곽선 두께

  // ---------------------------------------------------------------- geometry
  function sampleSpine(pts, ws, steps) {
    steps = steps || 8;
    const P = [], W = [];
    const n = pts.length;
    for (let i = 0; i < n - 1; i++) {
      const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, n - 1)];
      for (let s = 0; s < steps; s++) {
        const t = s / steps, t2 = t * t, t3 = t2 * t;
        P.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
        });
        const e = t * t * (3 - 2 * t);
        W.push(lerp(ws[i], ws[i + 1], (t + e) / 2));
      }
    }
    P.push({ x: pts[n - 1].x, y: pts[n - 1].y });
    W.push(ws[n - 1]);
    const N = P.map((p, i) => {
      const a = P[Math.max(i - 1, 0)], b = P[Math.min(i + 1, P.length - 1)];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L = Math.hypot(dx, dy) || 1;
      return { x: -dy / L, y: dx / L };
    });
    let ny = 0;
    for (const v of N) ny += v.y;
    const up = ny > 0 ? -1 : 1; // P + N*up 이 "위쪽"
    return { P, W, N, up };
  }

  function tubePath(ctx, s, capStart, capEnd, noBegin) {
    const { P, W, N } = s;
    const n = P.length;
    if (!noBegin) ctx.beginPath();
    ctx.moveTo(P[0].x + N[0].x * W[0] / 2, P[0].y + N[0].y * W[0] / 2);
    for (let i = 1; i < n; i++) ctx.lineTo(P[i].x + N[i].x * W[i] / 2, P[i].y + N[i].y * W[i] / 2);
    if (capEnd !== false && W[n - 1] > 1) {
      const a = Math.atan2(N[n - 1].y, N[n - 1].x);
      ctx.arc(P[n - 1].x, P[n - 1].y, W[n - 1] / 2, a, a - Math.PI, true);
    }
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(P[i].x - N[i].x * W[i] / 2, P[i].y - N[i].y * W[i] / 2);
    if (capStart !== false && W[0] > 1) {
      const a = Math.atan2(N[0].y, N[0].x);
      ctx.arc(P[0].x, P[0].y, W[0] / 2, a + Math.PI, a, true);
    }
    ctx.closePath();
  }

  function at(s, f) {
    const i = clamp(Math.round(f * (s.P.length - 1)), 0, s.P.length - 1);
    return { p: s.P[i], n: s.N[i], w: s.W[i], i };
  }

  function grad(ctx, x0, y0, x1, y1, stops) {
    const g = ctx.createLinearGradient(x0, y0, x1, y1);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    return g;
  }

  function fs(ctx, fill, line, lw) {
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) {
      ctx.strokeStyle = line;
      ctx.lineWidth = lw || LW;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }
  }

  // 위로 볼록한 잎/깃털 모양 (base → tip)
  function leafPath(ctx, x0, y0, ang, len, wid, bend) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const nx = -s, ny = c;
    const tx = x0 + c * len + nx * (bend || 0), ty = y0 + s * len + ny * (bend || 0);
    const mx = x0 + c * len * 0.45, my = y0 + s * len * 0.45;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.quadraticCurveTo(mx + nx * wid, my + ny * wid, tx, ty);
    ctx.quadraticCurveTo(mx - nx * wid, my - ny * wid, x0, y0);
    ctx.closePath();
  }

  // --------------------------------------------------------------- palette
  function makePalette(g, shade) {
    shade = shade || 0;
    const c = g.colors;
    const L = v => clamp(v + shade, 5, 95);
    const dark = shade < 0;
    return {
      main: hsl(c.h1, c.s1, L(c.l1)),
      mainHi: hsl(c.h1, c.s1, L(c.l1 + 14)),
      mainLo: hsl(c.h1, c.s1 + 6, L(c.l1 - 16)),
      sec: hsl(c.h2, c.s2, L(c.l2)),
      secHi: hsl(c.h2, c.s2, L(c.l2 + 16)),
      secLo: hsl(c.h2, c.s2, L(c.l2 - 16)),
      belly: hsl(c.hb, c.sb, L(c.lb)),
      bellyLo: hsl(c.hb, c.sb, L(c.lb - 16)),
      acc: hsl(c.ha, 90, L(56)),
      accHi: hsl(c.ha, 95, L(78)),
      accLo: hsl(c.ha, 85, L(36)),
      line: hsl(c.h1, 45, clamp(c.l1 - 42 + shade * 0.4, 5, 24)),
      eye: hsl(c.he, 100, 58),
      eyeHi: hsl(c.he, 100, 82),
      glow: hsl(c.hg, 100, 62),
      glowA: a => hsl(c.hg, 100, 62, a),
      gold: dark ? ['#d9b54a', '#a8790d', '#5c3f05'] : ['#fff4b0', '#f6c12e', '#a5700a'],
    };
  }

  function hornColors(g, p) {
    const c = g.colors;
    switch (g.horn.mat) {
      case 'gold': return p.gold;
      case 'crystal': return [hsl(c.hg, 100, 92), hsl(c.hg, 90, 70), hsl(c.hg, 80, 42)];
      case 'obsidian': return ['#7c7494', '#34304a', '#100e18'];
      case 'accent': return [p.accHi, p.acc, p.accLo];
      default: return ['#fff8e6', '#e6d3a6', '#9b8256'];
    }
  }

  // ------------------------------------------------------------- stages/pose
  const STAGE = [
    null,
    { scale: 0.7, body: 1.05, bodyLen: 0.78, head: 1.6, neck: 0.4, leg: 0.7, wing: 0.42, tail: 0.55, snout: 0.5, eye: 1.75, horn: 0.35, crest: 0.5 },
    { scale: 0.85, body: 1.0, bodyLen: 0.9, head: 1.28, neck: 0.7, leg: 0.86, wing: 0.72, tail: 0.8, snout: 0.75, eye: 1.3, horn: 0.7, crest: 0.8 },
    { scale: 1.0, body: 1.0, bodyLen: 1.0, head: 1.0, neck: 1.0, leg: 1.0, wing: 1.0, tail: 1.0, snout: 1.0, eye: 1.0, horn: 1.0, crest: 1.0 },
    { scale: 1.08, body: 1.05, bodyLen: 1.05, head: 1.05, neck: 1.1, leg: 1.05, wing: 1.08, tail: 1.1, snout: 1.05, eye: 1.0, horn: 1.35, crest: 1.3 },
  ];
  const BODY_MOD = {
    wyvern: { thick: 0.86, len: 1.05, neck: 1.15, leg: 1.1 },
    beast: { thick: 1.12, len: 1.0, neck: 0.85, leg: 1.0 },
    drake: { thick: 1.3, len: 0.82, neck: 0.62, leg: 0.78 },
    serpent: { thick: 0.9, len: 1.0, neck: 1.0, leg: 0.6 },
  };
  const GROUND = 70;

  function buildPose(g, stage, t) {
    const S = STAGE[stage];
    const sh = g.shape;
    const M = BODY_MOD[g.body];
    const breathe = Math.sin(t * 2.2) * 2;
    const sway = Math.sin(t * 1.4);
    const bt = 52 * sh.bodyThick * S.body * M.thick;
    const bl = 100 * sh.bodyLen * S.bodyLen * M.len;
    const legLen = 46 * sh.legLen * S.leg * M.leg;
    const pose = { bt, bl, legLen, S, legs: [], flesh: [], belly: [], dorsal: [] };

    if (g.body === 'serpent') {
      const ph = t * 1.8;
      const raw = [
        [64, -62], [52, -24], [22, 10], [-22, 30], [-70, 26], [-108, 2], [-126, -32], [-128, -64 * sh.tailLen],
      ];
      const pts = raw.map(([x, y], i) => ({
        x: x * sh.bodyLen,
        y: y + Math.sin(ph + i * 0.9) * 3.2 * (i / raw.length) + (i === 0 ? breathe : 0),
      }));
      const tb = bt * 0.92;
      const ws = [tb * 0.62, tb * 0.74, tb * 0.8, tb * 0.8, tb * 0.7, tb * 0.52, tb * 0.32, 3];
      const s = sampleSpine(pts, ws, 9);
      pose.flesh.push({ s, kind: 'body' });
      pose.body = s;
      pose.belly.push(s);
      pose.dorsal.push({ s, from: 0.04, to: 0.95 });
      const last = s.P[s.P.length - 1], prev = s.P[s.P.length - 4];
      pose.tailEnd = { x: last.x, y: last.y, a: Math.atan2(last.y - prev.y, last.x - prev.x), w: tb * 0.35 };
      const hp = s.P[0];
      pose.head = { x: hp.x + 10, y: hp.y - 20, hs: 1.3 * sh.headSize * S.head };
      pose.neckTop = s;
      const fl = at(s, 0.25), bk = at(s, 0.6);
      const ll = legLen;
      for (const [anchor, front] of [[fl, true], [bk, false]]) {
        const x = anchor.p.x, y = anchor.p.y + anchor.w * 0.2;
        pose.legs.push({ far: true, front, pts: [{ x: x + 10, y: y - 2 }, { x: x + 16, y: y + ll * 0.45 }, { x: x + 22, y: y + ll * 0.75 }], w: [bt * 0.3, bt * 0.2, bt * 0.16] });
        pose.legs.push({ far: false, front, pts: [{ x, y }, { x: x + 6, y: y + ll * 0.5 }, { x: x + 14, y: y + ll * 0.8 }], w: [bt * 0.32, bt * 0.22, bt * 0.17] });
      }
      const sp = at(s, 0.3);
      pose.shoulder = { x: sp.p.x - 6, y: sp.p.y - sp.w * 0.3 };
      pose.wingScale = 0.6 * sh.wingSize * S.wing;
      const ch = at(s, 0.1);
      pose.chest = { x: ch.p.x, y: ch.p.y, n: ch.n, w: ch.w };
      return pose;
    }

    // ----- 사족/와이번형
    const by = GROUND - legLen - bt * 0.32;
    const bodyPts = [
      { x: -bl / 2 - bt * 0.05, y: by + 6 },
      { x: -bl * 0.15, y: by + breathe * 0.4 },
      { x: bl * 0.2, y: by - 2 },
      { x: bl / 2, y: by - 10 },
    ];
    const body = sampleSpine(bodyPts, [bt * 0.82, bt, bt * 0.98, bt * 0.84], 8);

    const nl = sh.neckLen * S.neck * M.neck;
    const n0 = { x: bl / 2 - 4, y: by - 12 };
    const headPos = { x: n0.x + 26 * nl + 8, y: n0.y - 56 * nl - 10 + breathe * 0.6 };
    const neckPts = [n0, { x: n0.x + 22 * nl, y: n0.y - 26 * nl }, { x: headPos.x - 6, y: headPos.y + 8 }];
    const neck = sampleSpine(neckPts, [bt * 0.78, bt * 0.6, bt * 0.5], 8);

    const tl = sh.tailLen * S.tail;
    const tx = -bl / 2 + 2, ty = by + 6;
    const tailPts = [
      { x: tx, y: ty },
      { x: tx - 42 * tl, y: ty + 18 + sway * 3 },
      { x: tx - 84 * tl, y: ty + 10 + sway * 8 },
      { x: tx - 114 * tl, y: ty - 16 + sway * 13 },
      { x: tx - 122 * tl, y: ty - 46 * tl + sway * 16 },
    ];
    const tail = sampleSpine(tailPts, [bt * 0.72, bt * 0.48, bt * 0.3, bt * 0.16, 3], 8);
    const tp = tail.P;
    pose.tailEnd = { x: tp[tp.length - 1].x, y: tp[tp.length - 1].y, a: Math.atan2(tp[tp.length - 1].y - tp[tp.length - 4].y, tp[tp.length - 1].x - tp[tp.length - 4].x), w: bt * 0.2 };

    pose.flesh.push({ s: tail, kind: 'tail' }, { s: body, kind: 'body' }, { s: neck, kind: 'neck' });
    pose.body = body;
    pose.belly.push(body, neck, tail);
    pose.dorsal.push({ s: tail, from: 0.05, to: 0.9 }, { s: body, from: 0.05, to: 0.95 }, { s: neck, from: 0.0, to: 0.85 });
    pose.head = { x: headPos.x, y: headPos.y, hs: 1.3 * sh.headSize * S.head };
    pose.neckTop = neck;

    // 다리
    const hipX = -bl * 0.32, hipY = by + bt * 0.12;
    const shX = bl * 0.33, shY = by + bt * 0.05;
    const G = GROUND - 4;
    const backLeg = (x, y, far) => ({
      far, front: false,
      pts: [{ x, y }, { x: x + bt * 0.2, y: y + legLen * 0.5 }, { x: x - bt * 0.08, y: y + legLen * 0.82 }, { x: x - bt * 0.02, y: G - (far ? 3 : 0) }],
      w: [bt * 0.62, bt * 0.36, bt * 0.24, bt * 0.22],
    });
    const frontLeg = (x, y, far) => ({
      far, front: true,
      pts: [{ x, y }, { x: x - 4, y: y + legLen * 0.52 }, { x: x + 4, y: G - (far ? 3 : 0) }],
      w: [bt * 0.42, bt * 0.27, bt * 0.21],
    });
    pose.legs.push(backLeg(hipX + 14, hipY - 3, true), frontLeg(shX + 12, shY - 3, true));
    pose.legs.push(backLeg(hipX, hipY, false), frontLeg(shX, shY, false));

    pose.shoulder = { x: bl * 0.14, y: by - bt * 0.38 };
    pose.wingScale = Math.min(1.25, sh.wingSize * S.wing * (g.body === 'wyvern' ? 1.08 : g.body === 'drake' ? 0.85 : 1));
    const ch = at(neck, 0.15);
    pose.chest = { x: ch.p.x, y: ch.p.y, n: ch.n, w: ch.w };
    return pose;
  }

  // ---------------------------------------------------------------- parts
  function drawWing(ctx, g, pose, p, t, far) {
    if (g.wing === 'none') return;
    const ws = pose.wingScale;
    const flap = Math.sin(t * 3.1) * 0.2 + (far ? -0.12 : 0);
    ctx.save();
    ctx.translate(pose.shoulder.x + (far ? 16 : 0), pose.shoulder.y + (far ? -6 : 0));
    ctx.rotate(-flap);
    ctx.scale(ws * (far ? 0.86 : 1), ws * (far ? 0.9 : 1) * (1 - Math.sin(t * 3.1) * 0.06));

    const E = { x: -26, y: -40 }, W = { x: -62, y: -86 };
    const tips = [{ x: -52, y: -150 }, { x: -122, y: -128 }, { x: -160, y: -80 }, { x: -164, y: -24 }];
    const root = { x: -78 - pose.bl * 0.25 / ws, y: 14 };

    if (g.wing === 'bat') {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(E.x, E.y);
      ctx.lineTo(W.x, W.y);
      ctx.lineTo(tips[0].x, tips[0].y);
      const pts = tips.concat([root]);
      for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
        ctx.quadraticCurveTo(lerp(mx, W.x, 0.32), lerp(my, W.y, 0.32), b.x, b.y);
      }
      ctx.quadraticCurveTo(-30, 10, 0, 0);
      ctx.closePath();
      fs(ctx, grad(ctx, W.x, W.y, -80, 0, [p.secHi, p.sec, p.secLo]), p.line);
      // 막의 결
      ctx.save();
      ctx.clip();
      ctx.globalAlpha = 0.25;
      ctx.strokeStyle = p.secHi;
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(W.x, W.y, 40 + i * 28, 0.2, 2.4);
        ctx.stroke();
      }
      ctx.restore();
      // 날개뼈
      for (const tp of tips) {
        ctx.beginPath();
        ctx.moveTo(W.x, W.y);
        ctx.lineTo(tp.x, tp.y);
        fs(ctx, null, p.line, 7);
        fs(ctx, null, p.mainLo, 3.5);
      }
      const arm = sampleSpine([{ x: 0, y: 0 }, E, W], [16, 11, 8], 6);
      tubePath(ctx, arm);
      fs(ctx, grad(ctx, 0, 0, W.x, W.y, [p.main, p.mainHi]), p.line);
      // 엄지 발톱
      ctx.beginPath();
      ctx.moveTo(W.x - 3, W.y - 3);
      ctx.quadraticCurveTo(W.x + 2, W.y - 18, W.x + 12, W.y - 20);
      ctx.quadraticCurveTo(W.x + 6, W.y - 8, W.x + 4, W.y + 2);
      fs(ctx, '#f4ead0', p.line, 2);
    } else if (g.wing === 'feather') {
      const arm = sampleSpine([{ x: 0, y: 0 }, E, W, { x: -78, y: -128 }], [16, 12, 9, 5], 6);
      // 칼깃 (바깥 줄)
      const N = 9;
      for (let i = N - 1; i >= 0; i--) {
        const f = i / (N - 1);
        const ang = lerp(-1.95, -3.5, f);
        const len = lerp(80, 100, Math.sin(f * Math.PI)) * (1 - f * 0.2);
        const base = at(arm, lerp(0.95, 0.5, f));
        leafPath(ctx, base.p.x, base.p.y, ang, len, 11, -6);
        fs(ctx, grad(ctx, base.p.x, base.p.y, base.p.x + Math.cos(ang) * len, base.p.y + Math.sin(ang) * len, [p.sec, p.secHi, p.accHi]), p.line, 2.2);
      }
      // 둘째깃 (몸 쪽)
      for (let i = 0; i < 6; i++) {
        const f = i / 5;
        const base = at(arm, lerp(0.5, 0.05, f));
        const ang = lerp(2.75, 2.2, f);
        leafPath(ctx, base.p.x, base.p.y, ang, lerp(78, 44, f), 11, -4);
        fs(ctx, grad(ctx, base.p.x, base.p.y, base.p.x - 60, base.p.y + 30, [p.sec, p.secLo]), p.line, 2.2);
      }
      // 덮깃
      for (let i = 0; i < 7; i++) {
        const f = i / 6;
        const base = at(arm, lerp(0.92, 0.1, f));
        leafPath(ctx, base.p.x, base.p.y, lerp(-2.7, -3.7, f), lerp(36, 28, f), 9, -3);
        fs(ctx, grad(ctx, base.p.x, base.p.y, base.p.x - 30, base.p.y, [p.mainHi, p.main]), p.line, 2);
      }
      tubePath(ctx, arm);
      fs(ctx, grad(ctx, 0, 0, W.x, W.y, [p.main, p.mainHi]), p.line);
    } else if (g.wing === 'crystal' || g.wing === 'flame') {
      const flame = g.wing === 'flame';
      const arm = sampleSpine([{ x: 0, y: 0 }, E, W], [16, 11, 8], 6);
      const N = 7;
      ctx.save();
      if (flame) {
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(E.x, E.y); ctx.lineTo(W.x, W.y);
        for (const tp of tips) ctx.lineTo(tp.x * 0.9, tp.y * 0.9);
        ctx.quadraticCurveTo(-60, 10, 0, 0);
        ctx.fillStyle = grad(ctx, W.x, W.y, -120, 0, [p.glowA(0.5), p.glowA(0.08)]);
        ctx.fill();
        ctx.shadowColor = p.glow;
        ctx.shadowBlur = 16;
      }
      for (let i = N - 1; i >= 0; i--) {
        const f = i / (N - 1);
        const ang = lerp(-1.7, -3.5, f);
        const len = (flame ? lerp(150, 110, f) : lerp(100, 70, f)) * (0.9 + 0.1 * Math.sin(t * 4 + i));
        const bx = flame ? lerp(E.x * 0.8, E.x * 0.3, f) : lerp(W.x, E.x * 0.5, f * 0.8), by = flame ? lerp(E.y * 0.8, E.y * 0.3, f) : lerp(W.y, E.y * 0.5, f * 0.8);
        const c = Math.cos(ang), s = Math.sin(ang), nx = -s, ny = c;
        ctx.beginPath();
        if (flame) {
          const wob = Math.sin(t * 6 + i * 1.7) * 8;
          ctx.moveTo(bx + nx * 9, by + ny * 9);
          ctx.quadraticCurveTo(bx + c * len * 0.5 + nx * (24 + wob), by + s * len * 0.5 + ny * (24 + wob), bx + c * len * 1.1 + nx * wob, by + s * len * 1.1 + ny * wob);
          ctx.quadraticCurveTo(bx + c * len * 0.6 - nx * (10 - wob), by + s * len * 0.6 - ny * (10 - wob), bx - nx * 9, by - ny * 9);
          ctx.closePath();
          ctx.fillStyle = grad(ctx, bx, by, bx + c * len * 1.1, by + s * len * 1.1, [p.secHi, p.accHi, p.glowA(0.75), p.glowA(0)]);
          ctx.fill();
        } else {
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + c * len * 0.4 + nx * 12, by + s * len * 0.4 + ny * 12);
          ctx.lineTo(bx + c * len, by + s * len);
          ctx.lineTo(bx + c * len * 0.4 - nx * 12, by + s * len * 0.4 - ny * 12);
          ctx.closePath();
          ctx.globalAlpha = 0.9;
          fs(ctx, grad(ctx, bx, by, bx + c * len, by + s * len, [p.glowA(0.95), hsl(g.colors.hg, 90, 85, 0.9), '#ffffff']), p.line, 2);
          ctx.globalAlpha = 0.6;
          ctx.beginPath();
          ctx.moveTo(bx, by);
          ctx.lineTo(bx + c * len * 0.9, by + s * len * 0.9);
          fs(ctx, null, '#ffffff', 1.5);
          ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
      if (flame) {
        const short = sampleSpine([{ x: 0, y: 0 }, { x: E.x * 0.8, y: E.y * 0.8 }], [16, 10], 4);
        tubePath(ctx, short);
        fs(ctx, grad(ctx, 0, 0, E.x, E.y, [p.main, p.mainHi]), p.line);
        ctx.beginPath();
        ctx.arc(E.x * 0.8, E.y * 0.8, 6, 0, TAU);
        fs(ctx, p.accHi, p.line, 2);
        ctx.restore();
        return;
      }
      tubePath(ctx, arm);
      fs(ctx, grad(ctx, 0, 0, W.x, W.y, [p.main, p.mainHi]), p.line);
      // 손목 보석
      ctx.beginPath();
      ctx.arc(W.x, W.y, 6, 0, TAU);
      fs(ctx, p.accHi, p.line, 2);
    }
    ctx.restore();
  }

  function drawLeg(ctx, g, leg, p, rare) {
    const s = sampleSpine(leg.pts, leg.w, 6);
    tubePath(ctx, s);
    const a = s.P[0], b = s.P[s.P.length - 1];
    fs(ctx, grad(ctx, a.x, a.y, b.x, b.y, [p.main, p.mainLo]), p.line);
    // 발 + 발톱
    const f = b, fw = leg.w[leg.w.length - 1];
    ctx.beginPath();
    ctx.ellipse(f.x + fw * 0.35, f.y + fw * 0.15, fw * 0.95, fw * 0.55, 0, 0, TAU);
    fs(ctx, p.main, p.line);
    for (let i = 0; i < 3; i++) {
      const cx = f.x + fw * (0.6 + i * 0.32), cy = f.y + fw * 0.3 + i * 1.5 - 2;
      ctx.beginPath();
      ctx.moveTo(cx - 3, cy - 2);
      ctx.quadraticCurveTo(cx + 6, cy - 2, cx + 7, cy + 7);
      ctx.quadraticCurveTo(cx + 1, cy + 4, cx - 3, cy + 4);
      ctx.closePath();
      fs(ctx, '#f6ecd2', p.line, 1.6);
    }
    if (rare) {
      const r = at(s, 0.78);
      const hw = r.w / 2 + 2;
      ctx.beginPath();
      ctx.moveTo(r.p.x + r.n.x * hw, r.p.y + r.n.y * hw);
      ctx.lineTo(r.p.x - r.n.x * hw, r.p.y - r.n.y * hw);
      fs(ctx, null, p.line, 9);
      ctx.strokeStyle = grad(ctx, r.p.x, r.p.y - 4, r.p.x, r.p.y + 4, p.gold);
      ctx.lineWidth = 5.5;
      ctx.stroke();
    }
  }

  function drawDorsal(ctx, g, pose, p, stage) {
    if (g.back === 'none' && stage > 1) return;
    const type = stage === 1 ? 'nubs' : g.back;
    for (const d of pose.dorsal) {
      const s = d.s;
      const n = s.P.length;
      const step = type === 'fur' ? 2 : type === 'fins' ? 1 : 4;
      const pts = [];
      for (let i = Math.floor(d.from * (n - 1)); i <= Math.floor(d.to * (n - 1)); i += step) pts.push(i);
      if (type === 'fins') {
        // 이어진 지느러미 막
        ctx.beginPath();
        pts.forEach((i, k) => {
          const P = s.P[i], N = s.N[i], w = s.W[i] / 2 * s.up;
          const h = (k % 3 === 0 ? 1 : 0.55) * Math.max(6, s.W[i] * 0.45);
          const x = P.x + N.x * (w + h), y = P.y + N.y * (w + h);
          if (k === 0) ctx.moveTo(P.x + N.x * w, P.y + N.y * w);
          ctx.lineTo(x, y);
        });
        for (let k = pts.length - 1; k >= 0; k--) {
          const i = pts[k], P = s.P[i], N = s.N[i], w = s.W[i] / 2 * s.up * 0.6;
          ctx.lineTo(P.x + N.x * w, P.y + N.y * w);
        }
        ctx.closePath();
        fs(ctx, grad(ctx, s.P[0].x, s.P[0].y - 30, s.P[0].x, s.P[0].y, [p.secHi, p.sec]), p.line, 2.4);
        continue;
      }
      for (const i of pts) {
        const P = s.P[i], N = s.N[i];
        const u = s.up;
        const w = s.W[i] / 2;
        const bx = P.x + N.x * w * u * 0.85, by = P.y + N.y * w * u * 0.85;
        // 꼬리 방향(뒤쪽)으로 살짝 눕힘
        const tang = { x: N.y * u, y: -N.x * u };
        const ux = N.x * u, uy = N.y * u;
        const h = clamp(s.W[i] * 0.5, 6, 26);
        ctx.beginPath();
        if (type === 'spikes' || type === 'nubs') {
          const hh = type === 'nubs' ? h * 0.45 : h;
          ctx.moveTo(bx - tang.x * h * 0.35, by - tang.y * h * 0.35);
          ctx.quadraticCurveTo(bx + ux * hh * 0.6, by + uy * hh * 0.6, bx + ux * hh - tang.x * hh * 0.5, by + uy * hh - tang.y * hh * 0.5);
          ctx.lineTo(bx + tang.x * h * 0.35, by + tang.y * h * 0.35);
          ctx.closePath();
          fs(ctx, grad(ctx, bx, by, bx + ux * hh, by + uy * hh, [p.sec, p.secHi]), p.line, 2.2);
        } else if (type === 'plates') {
          ctx.moveTo(bx - tang.x * h * 0.45, by - tang.y * h * 0.45);
          ctx.lineTo(bx + ux * h * 0.7 - tang.x * h * 0.35, by + uy * h * 0.7 - tang.y * h * 0.35);
          ctx.lineTo(bx + ux * h * 1.05, by + uy * h * 1.05);
          ctx.lineTo(bx + ux * h * 0.7 + tang.x * h * 0.35, by + uy * h * 0.7 + tang.y * h * 0.35);
          ctx.lineTo(bx + tang.x * h * 0.45, by + tang.y * h * 0.45);
          ctx.closePath();
          fs(ctx, grad(ctx, bx, by, bx + ux * h, by + uy * h, [p.secLo, p.secHi]), p.line, 2.2);
        } else if (type === 'fur') {
          const hh = h * 0.9;
          ctx.moveTo(bx + tang.x * h * 0.4, by + tang.y * h * 0.4);
          ctx.quadraticCurveTo(bx + ux * hh, by + uy * hh, bx + ux * hh * 0.7 - tang.x * hh * 1.1, by + uy * hh * 0.7 - tang.y * hh * 1.1);
          ctx.quadraticCurveTo(bx + ux * hh * 0.2, by + uy * hh * 0.2, bx - tang.x * h * 0.4, by - tang.y * h * 0.4);
          ctx.closePath();
          fs(ctx, grad(ctx, bx, by, bx + ux * hh, by + uy * hh, [p.sec, p.secHi]), p.line, 2);
        }
      }
    }
  }

  function drawTailTip(ctx, g, pose, p, t, stage) {
    const e = pose.tailEnd;
    if (g.tailTip === 'plain' || stage === 1) return;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.rotate(e.a);
    const k = stage === 2 ? 0.7 : stage === 4 ? 1.2 : 1;
    ctx.scale(k, k);
    switch (g.tailTip) {
      case 'spade':
        ctx.beginPath();
        ctx.moveTo(-6, 0);
        ctx.quadraticCurveTo(4, -22, 30, 0);
        ctx.quadraticCurveTo(4, 22, -6, 0);
        fs(ctx, grad(ctx, -6, 0, 30, 0, [p.sec, p.secHi]), p.line);
        break;
      case 'fin':
        for (let i = -2; i <= 2; i++) {
          leafPath(ctx, -4, 0, i * 0.38, 36 - Math.abs(i) * 5, 7, 0);
          fs(ctx, grad(ctx, 0, 0, 30, 0, [p.sec, p.secHi]), p.line, 2);
        }
        break;
      case 'tuft':
        for (let i = -3; i <= 3; i++) {
          leafPath(ctx, -6, 0, i * 0.22 + Math.sin(t * 2 + i) * 0.06, 42 - Math.abs(i) * 4, 8, i * 2);
          fs(ctx, grad(ctx, 0, 0, 40, 0, [p.belly, p.secHi]), p.line, 2);
        }
        // 금 고리
        ctx.beginPath();
        ctx.rect(-10, -7, 9, 14);
        fs(ctx, grad(ctx, 0, -7, 0, 7, p.gold), p.line, 2);
        break;
      case 'flame': {
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
          const wob = Math.sin(t * 7 + i * 2) * 5;
          ctx.beginPath();
          ctx.moveTo(-4, -9 + i * 2);
          ctx.quadraticCurveTo(18, -18 + wob, 46 - i * 8, wob);
          ctx.quadraticCurveTo(18, 16 + wob, -4, 9 - i * 2);
          ctx.closePath();
          ctx.fillStyle = grad(ctx, 0, 0, 46, 0, [p.accHi, p.glowA(0.8), p.glowA(0)]);
          ctx.fill();
        }
        break;
      }
      case 'crystal':
        for (let i = -1; i <= 1; i++) {
          ctx.save();
          ctx.rotate(i * 0.5);
          ctx.beginPath();
          ctx.moveTo(-4, 0);
          ctx.lineTo(12, -7);
          ctx.lineTo(36 - Math.abs(i) * 10, 0);
          ctx.lineTo(12, 7);
          ctx.closePath();
          ctx.globalAlpha = 0.92;
          fs(ctx, grad(ctx, 0, 0, 36, 0, [p.glow, '#ffffff']), p.line, 2);
          ctx.restore();
        }
        break;
    }
    ctx.restore();
  }

  function fleshFill(ctx, kind, s, p) {
    const ys = s.P.map(v => v.y);
    const top = Math.min(...ys) - 30, bot = Math.max(...ys) + 30;
    return grad(ctx, 0, top, 0, bot, [p.mainHi, p.main, p.mainLo]);
  }

  function drawPattern(ctx, g, pose, p, t) {
    const r = makeRng(g.seed ^ 0x2545f491);
    const type = g.pattern;
    if (type === 'none') return;
    ctx.save();
    ctx.beginPath();
    for (const f of pose.flesh) tubePath(ctx, f.s, true, true, true);
    ctx.clip();
    for (const f of pose.flesh) {
      const s = f.s, n = s.P.length;
      if (type === 'stripes') {
        ctx.fillStyle = p.secLo;
        ctx.globalAlpha = 0.55;
        for (let i = 3; i < n - 2; i += 5) {
          const P = s.P[i], N = s.N[i], w = s.W[i] / 2, u = s.up;
          const tang = { x: N.y, y: -N.x };
          ctx.beginPath();
          ctx.moveTo(P.x + N.x * u * (w + 4) - tang.x * 5, P.y + N.y * u * (w + 4) - tang.y * 5);
          ctx.lineTo(P.x + N.x * u * (w + 4) + tang.x * 5, P.y + N.y * u * (w + 4) + tang.y * 5);
          ctx.lineTo(P.x - N.x * u * w * 0.1, P.y - N.y * u * w * 0.1);
          ctx.closePath();
          ctx.fill();
        }
      } else if (type === 'spots') {
        ctx.fillStyle = p.sec;
        ctx.globalAlpha = 0.6;
        for (let i = 2; i < n - 1; i += 3) {
          const P = s.P[i], N = s.N[i], w = s.W[i] / 2, u = s.up;
          const off = r.range(0.1, 0.8);
          const rad = Math.max(1.5, s.W[i] * r.range(0.06, 0.13));
          ctx.beginPath();
          ctx.arc(P.x + N.x * u * w * off, P.y + N.y * u * w * off, rad, 0, TAU);
          ctx.fill();
        }
      } else if (type === 'scales') {
        ctx.strokeStyle = p.mainLo;
        ctx.globalAlpha = 0.45;
        ctx.lineWidth = 1.5;
        for (let i = 1; i < n - 1; i += 2) {
          const P = s.P[i], N = s.N[i], w = s.W[i] / 2;
          const rows = Math.max(1, Math.floor(w / 6));
          for (let k = -rows; k <= rows; k++) {
            const x = P.x + N.x * k * 6 + ((i / 2) % 2) * 2, y = P.y + N.y * k * 6;
            const rad = clamp(s.W[i] * 0.07, 2, 4.5);
            ctx.beginPath();
            ctx.arc(x, y, rad, 0.2, Math.PI - 0.2);
            ctx.stroke();
          }
        }
      } else if (type === 'runes') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = p.glowA(0.6 + 0.35 * Math.sin(t * 2.5));
        ctx.lineWidth = 2;
        for (let i = 4; i < n - 3; i += 7) {
          const P = s.P[i], N = s.N[i], w = s.W[i] / 2, u = s.up;
          const x = P.x + N.x * u * w * 0.35, y = P.y + N.y * u * w * 0.35;
          const z = clamp(s.W[i] * 0.12, 2, 6);
          ctx.beginPath();
          ctx.moveTo(x - z, y - z); ctx.lineTo(x + z, y - z); ctx.lineTo(x, y + z); ctx.closePath();
          ctx.moveTo(x, y - z * 1.6); ctx.lineTo(x, y + z * 1.6);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  function drawBelly(ctx, g, pose, p) {
    ctx.save();
    ctx.beginPath();
    for (const f of pose.flesh) tubePath(ctx, f.s, true, true, true);
    ctx.clip();
    for (const s of pose.belly) {
      const P = [], W = [], N = s.N;
      for (let i = 0; i < s.P.length; i++) {
        const d = -s.up * s.W[i] * 0.34;
        P.push({ x: s.P[i].x + N[i].x * d, y: s.P[i].y + N[i].y * d });
        W.push(s.W[i] * 0.5);
      }
      const bs = { P, W, N, up: s.up };
      tubePath(ctx, bs);
      const ys = P.map(v => v.y);
      fs(ctx, grad(ctx, 0, Math.min(...ys), 0, Math.max(...ys) + 10, [p.belly, p.bellyLo]), null);
      // 배 마디
      ctx.strokeStyle = p.bellyLo;
      ctx.lineWidth = 1.6;
      ctx.globalAlpha = 0.7;
      for (let i = 2; i < P.length - 1; i += 3) {
        const hw = W[i] / 2;
        ctx.beginPath();
        ctx.moveTo(P[i].x + N[i].x * hw, P[i].y + N[i].y * hw);
        ctx.lineTo(P[i].x - N[i].x * hw, P[i].y - N[i].y * hw);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  function drawHorns(ctx, g, p, S, stage) {
    const hc = hornColors(g, p);
    const L = g.horn.len * S.horn;
    const bases = [{ x: -6, y: -16, a: 0 }, { x: 4, y: -19, a: 0.25 }, { x: -14, y: -9, a: -0.3 }].slice(0, stage === 1 ? 1 : g.horn.count);
    for (let bi = bases.length - 1; bi >= 0; bi--) {
      const b = bases[bi];
      const k = L * (bi === 0 ? 1 : 0.78);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.a);
      if (g.horn.type === 'crown') {
        for (let i = -2; i <= 2; i++) {
          leafPath(ctx, i * 4, 0, -Math.PI / 2 - 0.5 + i * 0.28, 26 * k * (1 - Math.abs(i) * 0.15), 5, 0);
          fs(ctx, grad(ctx, 0, 0, 0, -26 * k, [hc[1], hc[0]]), p.line, 2);
        }
        ctx.restore();
        continue;
      }
      let pts, ws;
      if (g.horn.type === 'curved') {
        pts = [{ x: 0, y: 0 }, { x: -18 * k, y: -20 * k }, { x: -38 * k, y: -14 * k }, { x: -48 * k, y: 4 * k }];
        ws = [11, 8, 4.5, 1];
      } else if (g.horn.type === 'straight') {
        pts = [{ x: 0, y: 0 }, { x: -14 * k, y: -22 * k }, { x: -26 * k, y: -42 * k }];
        ws = [11, 6, 1];
      } else if (g.horn.type === 'spiral') {
        pts = [{ x: 0, y: 0 }, { x: -20 * k, y: -16 * k }, { x: -32 * k, y: -36 * k }, { x: -28 * k, y: -54 * k }];
        ws = [12, 9, 5, 1];
      } else { // antler
        pts = [{ x: 0, y: 0 }, { x: -12 * k, y: -22 * k }, { x: -30 * k, y: -38 * k }, { x: -48 * k, y: -42 * k }];
        ws = [9, 7, 5, 1.5];
      }
      const s = sampleSpine(pts, ws, 6);
      if (g.horn.type === 'antler') {
        // 가지
        for (const f of [0.35, 0.65]) {
          const q = at(s, f);
          const tine = sampleSpine([q.p, { x: q.p.x + 6 * k, y: q.p.y - 18 * k }, { x: q.p.x + 2 * k, y: q.p.y - 28 * k }], [q.w * 0.8, q.w * 0.5, 1], 4);
          tubePath(ctx, tine);
          fs(ctx, grad(ctx, q.p.x, q.p.y, q.p.x, q.p.y - 28 * k, [hc[1], hc[0]]), p.line, 2.4);
        }
      }
      tubePath(ctx, s);
      fs(ctx, grad(ctx, 0, 0, pts[pts.length - 1].x, pts[pts.length - 1].y, [hc[2], hc[1], hc[0]]), p.line, 2.4);
      if (g.horn.type === 'spiral') {
        ctx.save();
        ctx.clip();
        ctx.strokeStyle = hc[2];
        ctx.lineWidth = 1.6;
        for (let i = 2; i < s.P.length - 2; i += 3) {
          const P = s.P[i], N = s.N[i], w = s.W[i] / 2;
          ctx.beginPath();
          ctx.moveTo(P.x + N.x * w + N.y * 3, P.y + N.y * w - N.x * 3);
          ctx.lineTo(P.x - N.x * w, P.y - N.y * w);
          ctx.stroke();
        }
        ctx.restore();
      }
      ctx.restore();
    }
  }

  function drawCrest(ctx, g, p, S, t, behind) {
    const k = S.crest;
    if (g.crest === 'mane' && behind) {
      const N = 11;
      for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < N; i++) {
          const f = i / (N - 1);
          const b = lerp(-1.25, -4.1, f) + layer * 0.12;
          const len = (layer ? 34 : 50) * k * (0.8 + 0.35 * Math.sin(f * Math.PI)) * (1 + Math.sin(t * 2 + i) * 0.03);
          const r0 = 14;
          const bx = -2 + Math.cos(b) * r0, by = 6 + Math.sin(b) * r0;
          leafPath(ctx, bx, by, b - 0.3, len, 12, -7);
          fs(ctx, grad(ctx, bx, by, bx + Math.cos(b) * len, by + Math.sin(b) * len, layer ? [p.belly, '#ffffff'] : [p.secLo, p.sec, p.secHi]), p.line, 2);
        }
      }
    } else if (g.crest === 'fins' && behind) {
      for (const [ox, oy, a] of [[-8, -2, -2.5], [-10, 8, 2.9]]) {
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(a);
        ctx.beginPath();
        ctx.moveTo(0, -6);
        ctx.lineTo(34 * k, -16 * k);
        ctx.quadraticCurveTo(28 * k, -2 * k, 38 * k, 4 * k);
        ctx.quadraticCurveTo(24 * k, 8 * k, 30 * k, 18 * k);
        ctx.lineTo(0, 6);
        ctx.closePath();
        fs(ctx, grad(ctx, 0, 0, 36 * k, 0, [p.sec, p.secHi]), p.line, 2.2);
        ctx.beginPath();
        ctx.moveTo(0, 0); ctx.lineTo(34 * k, -16 * k);
        ctx.moveTo(0, 0); ctx.lineTo(38 * k, 4 * k);
        ctx.moveTo(0, 0); ctx.lineTo(30 * k, 18 * k);
        fs(ctx, null, p.secLo, 1.6);
        ctx.restore();
      }
    } else if (g.crest === 'feathers' && behind) {
      for (let i = 0; i < 5; i++) {
        const ang = -2.6 + i * 0.22 + Math.sin(t * 1.6 + i) * 0.05;
        leafPath(ctx, -10, -8, ang, (46 - i * 4) * k, 7, -8);
        fs(ctx, grad(ctx, -10, -8, -50, -30, [p.sec, p.accHi]), p.line, 2);
      }
    } else if (g.crest === 'frill' && behind) {
      ctx.beginPath();
      const N = 7;
      ctx.moveTo(-2, -16);
      for (let i = 0; i <= N; i++) {
        const a = lerp(-2.0, -4.3, i / N);
        const r = (i % 2 ? 26 : 38) * k;
        ctx.lineTo(-2 + Math.cos(a) * r, 2 + Math.sin(a) * r);
      }
      ctx.lineTo(0, 16);
      ctx.closePath();
      fs(ctx, grad(ctx, -40, 0, 0, 0, [p.secHi, p.sec]), p.line, 2.4);
    }
  }

  function drawHead(ctx, g, pose, p, t, stage, rarity) {
    const S = pose.S;
    const h = pose.head;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(Math.sin(t * 1.1) * 0.05);
    ctx.scale(h.hs, h.hs);

    drawCrest(ctx, g, p, S, t, true);
    drawHorns(ctx, g, p, S, stage);

    const sn = g.shape.snoutLen * S.snout;
    const jaw = sampleSpine([{ x: 0, y: 11 }, { x: 4 + 26 * sn, y: 15 }], [15, 9], 4);
    const snout = sampleSpine([{ x: 4, y: 2 }, { x: 8 + 30 * sn, y: 8 }], [28, 18], 4);
    const craniumR = stage === 1 ? 22 : 20;
    const shapes = () => {
      tubePath(ctx, jaw, true, true, true);
      ctx.moveTo(craniumR, 0);
      ctx.arc(0, 0, craniumR, 0, TAU);
      tubePath(ctx, snout, true, true, true);
    };
    // 하나의 실루엣으로 외곽선 후 채우기
    ctx.beginPath();
    tubePath(ctx, jaw);
    fs(ctx, null, p.line, LW * 2);
    ctx.beginPath();
    ctx.arc(0, 0, craniumR, 0, TAU);
    fs(ctx, null, p.line, LW * 2);
    tubePath(ctx, snout);
    fs(ctx, null, p.line, LW * 2);
    tubePath(ctx, jaw);
    fs(ctx, p.mainLo, null);
    ctx.beginPath();
    ctx.arc(0, 0, craniumR, 0, TAU);
    fs(ctx, grad(ctx, 0, -craniumR, 0, craniumR, [p.mainHi, p.main]), null);
    tubePath(ctx, snout);
    fs(ctx, grad(ctx, 0, -8, 0, 20, [p.mainHi, p.main, p.mainLo]), null);
    void shapes;

    // 입
    ctx.beginPath();
    ctx.moveTo(8, 12);
    ctx.quadraticCurveTo(10 + 16 * sn, 15, 6 + 28 * sn, 11);
    fs(ctx, null, p.line, 2);
    if (stage >= 3) {
      ctx.beginPath();
      ctx.moveTo(2 + 24 * sn, 12.5);
      ctx.lineTo(4 + 25 * sn, 18);
      ctx.lineTo(6 + 25 * sn, 12);
      fs(ctx, '#ffffff', p.line, 1.2);
    }
    // 콧구멍
    ctx.beginPath();
    ctx.ellipse(4 + 30 * sn, 2, 2.4, 1.4, -0.4, 0, TAU);
    fs(ctx, p.line, null);
    // 볼 터치(아기)
    if (stage <= 2) {
      ctx.beginPath();
      ctx.ellipse(6, 9, 6, 3.5, 0, 0, TAU);
      ctx.fillStyle = 'rgba(255,120,150,0.45)';
      ctx.fill();
    }
    // 뺨 가시
    if (stage >= 2) {
      for (let i = 0; i < 2; i++) {
        leafPath(ctx, -12, 8 + i * 6, Math.PI - 0.25 + i * 0.35, 18 - i * 4, 4, 0);
        fs(ctx, p.sec, p.line, 2);
      }
    }

    // 눈
    const es = S.eye;
    const ex = 8, ey = -4;
    const blinkT = (t + (g.seed % 100) / 23) % 4.3;
    const open = blinkT < 0.14 ? 0.08 : 1;
    ctx.save();
    ctx.translate(ex, ey);
    ctx.scale(es, es * open);
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 7.2, 0.15, 0, TAU);
    fs(ctx, g.eye === 'glow' ? p.eyeHi : '#fffdf2', p.line, 2 / es);
    if (open > 0.5) {
      if (g.eye === 'glow') {
        ctx.beginPath();
        ctx.ellipse(1, 0, 5, 6, 0.15, 0, TAU);
        ctx.fillStyle = p.eye;
        ctx.shadowColor = p.eye;
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.shadowBlur = 0;
      } else {
        const ig = ctx.createRadialGradient(1.5, 1, 0.5, 1.5, 1, 5.5);
        ig.addColorStop(0, p.eyeHi);
        ig.addColorStop(1, p.eye);
        ctx.beginPath();
        ctx.ellipse(1.5, 0.5, 4.6, 5.6, 0, 0, TAU);
        fs(ctx, ig, null);
        ctx.beginPath();
        if (g.eye === 'slit') ctx.ellipse(1.8, 0.5, 1.2, 4.6, 0, 0, TAU);
        else ctx.arc(1.8, 0.8, 2.8, 0, TAU);
        fs(ctx, '#140c18', null);
      }
      ctx.beginPath();
      ctx.arc(-0.8, -2.6, 1.7, 0, TAU);
      ctx.arc(3.4, 2.6, 0.9, 0, TAU);
      fs(ctx, '#ffffff', null);
    }
    ctx.restore();
    // 눈썹
    ctx.beginPath();
    ctx.moveTo(ex - 9 * es, ey - 6 * es);
    ctx.quadraticCurveTo(ex, ey - 11 * es, ex + 8 * es, ey - 6 * es);
    fs(ctx, null, p.line, 2.6);

    // 이마 보석
    if (rarity >= 2 && stage >= 2) {
      ctx.save();
      ctx.translate(-2, -12);
      ctx.beginPath();
      ctx.moveTo(0, -6); ctx.lineTo(5, 0); ctx.lineTo(0, 6); ctx.lineTo(-5, 0); ctx.closePath();
      ctx.shadowColor = p.acc;
      ctx.shadowBlur = 8;
      fs(ctx, grad(ctx, 0, -6, 0, 6, [p.accHi, p.acc, p.accLo]), null);
      ctx.shadowBlur = 0;
      fs(ctx, null, p.gold[2], 1.6);
      ctx.restore();
    }
    ctx.restore();
  }

  function drawChestFluff(ctx, pose, p, t) {
    const c = pose.chest;
    const d = c.n.y > 0 ? 1 : -1; // 아래쪽 법선
    const bx = c.x + c.n.x * d * c.w * 0.3, by = c.y + c.n.y * d * c.w * 0.3;
    for (let i = 0; i < 6; i++) {
      const a = lerp(1.0, 2.3, i / 5) + Math.sin(t * 2 + i) * 0.04;
      leafPath(ctx, bx + Math.cos(a) * 6, by - 6 + Math.sin(a) * 6, a, c.w * 0.75 - Math.abs(i - 2.5) * 2, 9, 4);
      fs(ctx, grad(ctx, bx, by, bx, by + c.w, ['#ffffff', p.belly]), p.line, 2);
    }
  }

  function drawNecklace(ctx, g, pose, p, t) {
    const c = pose.chest;
    const nx = c.n.x, ny = c.n.y;
    const tx = ny, ty = -nx;
    const hw = c.w / 2 + 2;
    const a = { x: c.x + nx * hw, y: c.y + ny * hw }, b = { x: c.x - nx * hw, y: c.y - ny * hw };
    const mid = { x: c.x + tx * 10, y: c.y + ty * 10 };
    const dir = tx > 0 ? 1 : -1;
    const sag = { x: mid.x + dir * 6, y: mid.y + 6 };
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(sag.x + 10, sag.y + 6, b.x, b.y);
    fs(ctx, null, p.line, 6);
    ctx.strokeStyle = grad(ctx, a.x, a.y, b.x, b.y, p.gold);
    ctx.lineWidth = 3;
    ctx.stroke();
    // 구슬
    for (let i = 1; i < 6; i++) {
      const f = i / 6;
      const x = (1 - f) * (1 - f) * a.x + 2 * (1 - f) * f * (sag.x + 10) + f * f * b.x;
      const y = (1 - f) * (1 - f) * a.y + 2 * (1 - f) * f * (sag.y + 6) + f * f * b.y;
      ctx.beginPath();
      ctx.arc(x, y, i === 3 ? 0 : 3, 0, TAU);
      fs(ctx, i % 2 ? p.gold[1] : p.accHi, p.line, 1.4);
      if (i === 3) {
        ctx.save();
        ctx.translate(x, y + 4);
        ctx.beginPath();
        ctx.moveTo(0, -7); ctx.lineTo(6, 1); ctx.lineTo(0, 10); ctx.lineTo(-6, 1); ctx.closePath();
        ctx.shadowColor = p.acc;
        ctx.shadowBlur = 10 + Math.sin(t * 3) * 4;
        fs(ctx, grad(ctx, 0, -7, 0, 10, [p.accHi, p.acc, p.accLo]), null);
        ctx.shadowBlur = 0;
        fs(ctx, null, p.gold[2], 2);
        ctx.restore();
      }
    }
  }

  // ------------------------------------------------------------- aura / fx
  const AURA_C = { x: -30, y: -40 };

  function drawAuraBack(ctx, g, stage, t, p, level) {
    const r = g.rarity;
    const cx = AURA_C.x, cy = AURA_C.y;
    // 은은한 광채
    const rg = ctx.createRadialGradient(cx, cy, 10, cx, cy, 210);
    rg.addColorStop(0, p.glowA(0.35 + r * 0.06));
    rg.addColorStop(1, p.glowA(0));
    ctx.fillStyle = rg;
    ctx.beginPath();
    ctx.arc(cx, cy, 210, 0, TAU);
    ctx.fill();

    if (level >= 3) {
      // 빛줄기
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(cx, cy);
      ctx.rotate(t * 0.12);
      const N = 14;
      for (let i = 0; i < N; i++) {
        ctx.rotate(TAU / N);
        const len = 220 + (i % 3) * 30;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(len, -10 - (i % 2) * 8);
        ctx.lineTo(len, 10 + (i % 2) * 8);
        ctx.closePath();
        ctx.fillStyle = grad(ctx, 0, 0, len, 0, ['rgba(255,255,255,0.16)', p.glowA(0.07), p.glowA(0)]);
        ctx.fill();
      }
      ctx.restore();
    }
    if (level >= 2) {
      // 금빛 고리 (레퍼런스의 원형 문양)
      ctx.save();
      ctx.translate(cx + 10, cy - 10);
      ctx.rotate(-t * 0.25);
      ctx.shadowColor = p.gold[1];
      ctx.shadowBlur = 14;
      ctx.lineWidth = 7;
      ctx.strokeStyle = p.line;
      ctx.beginPath(); ctx.arc(0, 0, 112, 0, TAU); ctx.stroke();
      ctx.lineWidth = 4.5;
      ctx.strokeStyle = p.gold[1];
      ctx.beginPath(); ctx.arc(0, 0, 112, 0, TAU); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = p.gold[0];
      ctx.beginPath(); ctx.arc(0, 0, 100, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) {
        ctx.rotate(TAU / 8);
        ctx.beginPath();
        ctx.moveTo(112, -9); ctx.lineTo(120, 0); ctx.lineTo(112, 9); ctx.lineTo(104, 0); ctx.closePath();
        fs(ctx, i % 2 ? p.accHi : p.gold[0], p.line, 1.8);
      }
      ctx.restore();
    }
  }

  function ribbon(ctx, p, g, t, idx, front) {
    const ph = t * 0.35 + idx * 2.1;
    const rx = 190 - idx * 18, ry = 62 + idx * 14;
    const tilt = -0.45 + idx * 0.55;
    const a0 = front ? 0.15 : Math.PI + 0.15;
    const pts = [], ws = [];
    const N = 9;
    for (let i = 0; i < N; i++) {
      const a = a0 + (i / (N - 1)) * 2.7 + Math.sin(ph) * 0.25;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      pts.push({ x: AURA_C.x + x * Math.cos(tilt) - y * Math.sin(tilt), y: AURA_C.y + 20 + x * Math.sin(tilt) + y * Math.cos(tilt) });
      ws.push(Math.sin((i / (N - 1)) * Math.PI) * (12 + idx * 2) + 0.5);
    }
    if (front) for (let i = 0; i < ws.length; i++) ws[i] *= 0.55;
    const s = sampleSpine(pts, ws, 6);
    tubePath(ctx, s);
    const hues = [g.colors.hg, g.colors.ha, g.colors.h2];
    const h = hues[idx % 3];
    const a = pts[0], b = pts[pts.length - 1];
    ctx.save();
    ctx.globalAlpha = front ? 0.7 : 0.85;
    ctx.fillStyle = grad(ctx, a.x, a.y, b.x, b.y, [hsl(h, 95, 70, 0), hsl(h, 95, 72, 0.9), hsl(h + 40, 95, 82, 0.95), hsl(h + 80, 95, 70, 0)]);
    ctx.shadowColor = hsl(h, 100, 65);
    ctx.shadowBlur = 12;
    ctx.fill();
    ctx.restore();
  }

  function drawParticles(ctx, g, t, p, count, front) {
    const r = makeRng(g.seed ^ (front ? 0x9e3779b9 : 0x7f4a7c15));
    const el = g.element;
    for (let i = 0; i < count; i++) {
      const px = r.range(-220, 160), py0 = r.range(-200, 90);
      const spd = r.range(0.06, 0.16), ph = r(), size = r.range(2.5, 6.5) * (front ? 1 : 0.8);
      const life = (t * spd + ph) % 1;
      const alpha = Math.sin(life * Math.PI);
      let x = px, y = py0;
      ctx.save();
      ctx.globalAlpha = alpha * (front ? 1 : 0.7);
      if (el === 'fire') {
        y = 90 - life * 300; x = px + Math.sin(t * 2 + i) * 10;
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = i % 2 ? '#ffd27a' : '#ff6a3a';
        ctx.beginPath(); ctx.arc(x, y, size * 0.7, 0, TAU); ctx.fill();
      } else if (el === 'water') {
        y = 90 - life * 300; x = px + Math.sin(t * 1.5 + i) * 8;
        ctx.strokeStyle = 'rgba(200,240,255,0.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(x, y, size, 0, TAU); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.beginPath(); ctx.arc(x - size * 0.35, y - size * 0.35, size * 0.25, 0, TAU); ctx.fill();
      } else if (el === 'forest' || (el === 'light' && i % 2)) {
        // 다섯 꽃잎 꽃
        y = -200 + life * 300; x = px + Math.sin(t + i) * 20;
        ctx.translate(x, y); ctx.rotate(t * 0.8 + i);
        const petal = el === 'forest' ? (i % 3 ? '#bff0c0' : '#a6e3ff') : '#fff3c4';
        for (let k = 0; k < 5; k++) {
          ctx.rotate(TAU / 5);
          ctx.beginPath(); ctx.ellipse(size * 0.9, 0, size * 0.9, size * 0.5, 0, 0, TAU);
          ctx.fillStyle = petal; ctx.fill();
        }
        ctx.fillStyle = '#ffd54a';
        ctx.beginPath(); ctx.arc(0, 0, size * 0.35, 0, TAU); ctx.fill();
      } else if (el === 'thunder') {
        ctx.globalCompositeOperation = 'lighter';
        if (life > 0.5) { ctx.restore(); continue; }
        ctx.strokeStyle = i % 2 ? '#e8fdff' : '#5ff0ff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let k = 0; k < 3; k++) { x += r.range(-8, 8); y += 8; ctx.lineTo(x, y); }
        ctx.stroke();
      } else if (el === 'light') {
        y = py0 - life * 40;
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(x, y); ctx.rotate(t);
        ctx.fillStyle = '#fffbe0';
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          ctx.rotate(Math.PI / 2);
          ctx.lineTo(size * 1.6, 0); ctx.lineTo(size * 0.35, size * 0.35);
        }
        ctx.closePath(); ctx.fill();
      } else {
        // 어둠: 검은 깃털 조각
        y = -200 + life * 300; x = px + Math.sin(t + i) * 24;
        ctx.translate(x, y); ctx.rotate(t * 1.3 + i);
        ctx.beginPath(); ctx.moveTo(-size * 1.4, 0); ctx.quadraticCurveTo(0, -size, size * 1.4, 0); ctx.quadraticCurveTo(0, size * 0.5, -size * 1.4, 0);
        ctx.fillStyle = i % 2 ? '#2a1838' : '#7b3fd0'; ctx.fill();
      }
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------ main
  // opts: { flip, aura (bool), particles (bool), fit (성장단계 크기 무시) }
  function drawDragon(ctx, g, stage, t, cx, cy, size, opts) {
    opts = opts || {};
    if (stage <= 0) return drawEgg(ctx, g, t, cx, cy, size, opts);
    const S = STAGE[stage];
    const p = makePalette(g, 0);
    const pf = makePalette(g, -14);
    const pose = buildPose(g, stage, t);
    const rarity = g.rarity;
    const auraLevel = opts.aura === false ? -1 : Math.max(rarity >= 4 ? 3 : rarity >= 3 ? 2 : rarity >= 2 ? 1 : 0, stage === 4 ? Math.min(3, rarity + 1) : 0);

    ctx.save();
    ctx.translate(cx, cy);
    const k = (size / 400) * (opts.fit ? 1 : S.scale);
    ctx.scale(k * (opts.flip ? -1 : 1), k);
    // 성장 단계와 관계없이 발이 같은 바닥에 오도록
    ctx.translate(22, opts.fit ? 52 : 52 + (1 / S.scale - 1) * 70);

    if (auraLevel >= 0) {
      drawAuraBack(ctx, g, stage, t, p, auraLevel);
      if (opts.particles !== false) drawParticles(ctx, g, t, p, 6 + rarity * 3, false);
      if (auraLevel >= 1) for (let i = 0; i < auraLevel; i++) ribbon(ctx, p, g, t, i, false);
    }
    // 그림자
    ctx.beginPath();
    ctx.ellipse(-20, GROUND + 4, 120, 14, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fill();

    drawWing(ctx, g, pose, pf, t, true);
    for (const leg of pose.legs) if (leg.far) drawLeg(ctx, g, leg, pf, false);
    drawDorsal(ctx, g, pose, p, stage);
    drawTailTip(ctx, g, pose, p, t, stage);

    // 몸통 실루엣: 외곽선 → 채우기
    for (const f of pose.flesh) { tubePath(ctx, f.s); fs(ctx, null, p.line, LW * 2); }
    for (const f of pose.flesh) { tubePath(ctx, f.s); fs(ctx, fleshFill(ctx, f.kind, f.s, p), null); }
    drawBelly(ctx, g, pose, p);
    drawPattern(ctx, g, pose, p, t);

    if (g.crest === 'mane' && stage >= 2) drawChestFluff(ctx, pose, p, t);
    drawWing(ctx, g, pose, p, t, false);
    const bracelets = rarity >= 1 && stage >= 3;
    for (const leg of pose.legs) if (!leg.far) drawLeg(ctx, g, leg, p, bracelets);
    if ((rarity >= 2 && stage >= 3) || stage === 4) drawNecklace(ctx, g, pose, p, t);
    drawHead(ctx, g, pose, p, t, stage, rarity);

    if (auraLevel >= 1) for (let i = 0; i < Math.max(1, auraLevel - 1); i++) ribbon(ctx, p, g, t, i + 1, true);
    if (auraLevel >= 0 && opts.particles !== false) drawParticles(ctx, g, t, p, 5 + rarity * 3, true);
    ctx.restore();
  }

  // ------------------------------------------------------------------ egg
  function eggPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(0, -52);
    ctx.bezierCurveTo(28, -52, 40, -10, 40, 12);
    ctx.bezierCurveTo(40, 38, 22, 50, 0, 50);
    ctx.bezierCurveTo(-22, 50, -40, 38, -40, 12);
    ctx.bezierCurveTo(-40, -10, -28, -52, 0, -52);
    ctx.closePath();
  }

  // opts: { progress 0..1, ready }
  function drawEgg(ctx, g, t, cx, cy, size, opts) {
    opts = opts || {};
    const p = makePalette(g, 0);
    const r = makeRng(g.seed ^ 0x1234567);
    ctx.save();
    ctx.translate(cx, cy);
    const k = size / 150;
    ctx.scale(k, k);
    // 후광
    const rg = ctx.createRadialGradient(0, 0, 10, 0, 0, 72);
    rg.addColorStop(0, p.glowA(0.5 + g.rarity * 0.08));
    rg.addColorStop(1, p.glowA(0));
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(0, 0, 72, 0, TAU); ctx.fill();
    if (g.rarity >= 3) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.rotate(t * 0.3);
      for (let i = 0; i < 10; i++) {
        ctx.rotate(TAU / 10);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(75, -6); ctx.lineTo(75, 6); ctx.closePath();
        ctx.fillStyle = grad(ctx, 0, 0, 75, 0, ['rgba(255,255,255,0.3)', p.glowA(0)]);
        ctx.fill();
      }
      ctx.restore();
    }
    ctx.beginPath();
    ctx.ellipse(0, 52, 34, 7, 0, 0, TAU);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fill();

    let wob = Math.sin(t * 1.6) * 0.03;
    if (opts.ready) wob = Math.sin(t * 22) * 0.1 * Math.max(0, Math.sin(t * 2.2));
    ctx.translate(0, 50);
    ctx.rotate(wob);
    ctx.translate(0, -50);

    eggPath(ctx);
    const eg = ctx.createRadialGradient(-14, -22, 4, 0, 0, 62);
    eg.addColorStop(0, p.mainHi);
    eg.addColorStop(0.6, p.main);
    eg.addColorStop(1, p.mainLo);
    fs(ctx, eg, null);
    ctx.save();
    ctx.clip();
    const pat = g.pattern;
    ctx.fillStyle = p.sec;
    if (pat === 'spots' || pat === 'none') {
      for (let i = 0; i < 9; i++) {
        ctx.beginPath();
        ctx.ellipse(r.range(-36, 36), r.range(-46, 44), r.range(4, 10), r.range(3, 8), r.range(0, 3), 0, TAU);
        ctx.fill();
      }
    } else if (pat === 'stripes' || pat === 'runes') {
      for (let j = 0; j < 2; j++) {
        const y0 = -10 + j * 26;
        ctx.beginPath();
        ctx.moveTo(-45, y0);
        for (let x = -45; x <= 45; x += 10) ctx.lineTo(x + 5, y0 + (x / 10 % 2 ? -7 : 7));
        ctx.lineTo(45, y0 + 9);
        ctx.lineTo(-45, y0 + 9);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      ctx.globalAlpha = 0.6;
      for (let y = -50; y < 52; y += 9) for (let x = -44 + ((y / 9) % 2) * 5; x < 44; x += 10) {
        ctx.beginPath(); ctx.arc(x, y, 5, 0.1, Math.PI - 0.1); ctx.strokeStyle = p.secLo; ctx.lineWidth = 2; ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    if (g.rarity >= 2) {
      ctx.fillStyle = grad(ctx, 0, 14, 0, 24, p.gold);
      ctx.fillRect(-50, 14, 100, 9);
      for (let x = -30; x <= 30; x += 20) {
        ctx.beginPath(); ctx.arc(x, 18.5, 3.5, 0, TAU);
        fs(ctx, p.accHi, p.line, 1.2);
      }
    }
    // 금
    if (opts.progress > 0.6) {
      ctx.strokeStyle = p.line; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -40); ctx.lineTo(-2, -30); ctx.lineTo(-10, -22); ctx.lineTo(-3, -12);
      if (opts.progress > 0.85) { ctx.moveTo(-10, -22); ctx.lineTo(4, -20); ctx.lineTo(10, -28); }
      ctx.stroke();
    }
    // 하이라이트
    ctx.beginPath();
    ctx.ellipse(-16, -26, 7, 14, 0.4, 0, TAU);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    ctx.restore();
    eggPath(ctx);
    fs(ctx, null, p.line, LW);
    ctx.restore();
  }

  DV.render = { drawDragon, drawEgg, makePalette };
})(window.DV = window.DV || {});
