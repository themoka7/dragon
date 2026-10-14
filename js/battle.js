// 턴제 자동 전투 + 필살기. 캔버스 연출과 결과 콜백을 담당한다.
(function (DV) {
  'use strict';
  const D = DV.data;
  const { hsl } = DV.util;

  function Battle(canvas, playerDragon, enemyDragon, region, hooks) {
    const ctx = canvas.getContext('2d');
    const mk = (d, side) => {
      const s = D.calcStats(d);
      return { d, s, hp: s.hp, side, lunge: 0, shake: 0, alpha: 1, flash: 0 };
    };
    const P = mk(playerDragon, -1), E = mk(enemyDragon, 1);
    let clock = 0, last = performance.now(), raf = 0, running = true;
    let speed = 1, gauge = 0, skillQueued = false, auto = false;
    const effects = [];
    const waits = [];

    function wait(sec) { return new Promise(res => waits.push({ at: clock + sec, res })); }
    function tween(obj, key, to, dur) {
      const from = obj[key], t0 = clock;
      return new Promise(res => effects.push({ kind: 'tween', update() {
        const f = Math.min(1, (clock - t0) / dur);
        obj[key] = from + (to - from) * (f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2);
        if (f >= 1) { res(); return false; }
        return true;
      } }));
    }
    function text(side, str, color, big) {
      effects.push({ kind: 'text', side, str, color, big, t0: clock, dur: 1.1 });
    }

    function pos(F) {
      const w = canvas.width, h = canvas.height;
      return { x: w * (F.side < 0 ? 0.26 : 0.74), y: h * 0.64 };
    }

    async function attack(A, T) {
      const isSkill = A === P && (skillQueued || (auto && gauge >= 100)) && gauge >= 100;
      if (isSkill) { gauge = 0; skillQueued = false; }
      await tween(A, 'lunge', 1, isSkill ? 0.18 : 0.22);
      const mult = D.elemMult(A.d.genome.element, T.d.genome.element);
      const crit = Math.random() < 0.1;
      const raw = A.s.atk * (0.9 + Math.random() * 0.2) * mult * (isSkill ? 2.4 : 1) * (crit ? 1.5 : 1);
      const dmg = Math.max(1, Math.round(raw * 60 / (60 + T.s.def)));
      if (isSkill) {
        effects.push({ kind: 'beam', from: A, to: T, hue: A.d.genome.colors.hg, t0: clock, dur: 0.45 });
        await wait(0.3);
      }
      T.hp = Math.max(0, T.hp - dmg);
      T.shake = 1;
      T.flash = 1;
      effects.push({ kind: 'burst', side: T.side, hue: A.d.genome.colors.hg, t0: clock, dur: 0.5, big: isSkill });
      text(T.side, (crit ? '치명타! ' : '') + dmg, crit ? '#ffe14d' : '#ffffff', crit || isSkill);
      if (mult > 1) text(T.side, '효과가 굉장했다!', '#7dffb0');
      else if (mult < 1) text(T.side, '효과가 별로...', '#b0b8c8');
      if (A === P) gauge = Math.min(100, gauge + 30);
      else gauge = Math.min(100, gauge + 12);
      hooks.onUpdate && hooks.onUpdate(state());
      await tween(A, 'lunge', 0, 0.25);
      await wait(0.35);
    }

    function state() {
      return { php: P.hp, pmax: P.s.hp, ehp: E.hp, emax: E.s.hp, gauge, auto, speed };
    }

    async function run() {
      hooks.onUpdate && hooks.onUpdate(state());
      await wait(0.6);
      let turn = 0;
      while (running && P.hp > 0 && E.hp > 0) {
        const first = P.s.spd >= E.s.spd ? [P, E] : [E, P];
        for (const A of first) {
          const T = A === P ? E : P;
          if (A.hp <= 0 || T.hp <= 0 || !running) break;
          await attack(A, T);
        }
        if (++turn > 60) break; // 안전장치
      }
      if (!running) return;
      const win = E.hp <= 0 && P.hp > 0;
      const loser = win ? E : P;
      await tween(loser, 'alpha', 0, 0.6);
      await wait(0.3);
      hooks.onEnd && hooks.onEnd(win);
    }

    function draw(t) {
      const w = canvas.width, h = canvas.height;
      const hue = region.bg[0];
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, hsl(hue, region.bg[1], 14));
      bg.addColorStop(0.6, hsl(hue, region.bg[1], 26));
      bg.addColorStop(1, hsl(hue, region.bg[1] - 10, 10));
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      // 바닥
      ctx.fillStyle = hsl(hue, region.bg[1] - 5, 8, 0.6);
      ctx.beginPath();
      ctx.ellipse(w / 2, h * 0.86, w * 0.7, h * 0.16, 0, 0, Math.PI * 2);
      ctx.fill();

      const size = Math.min(w * 0.5, h * 0.85);
      for (const F of [P, E]) {
        const p = pos(F);
        const dx = -F.side * F.lunge * w * 0.16 + Math.sin(clock * 60) * F.shake * 8;
        F.shake = Math.max(0, F.shake - 0.05);
        ctx.save();
        ctx.globalAlpha = F.alpha;
        DV.render.drawDragon(ctx, F.d.genome, F.d.stage, t + (F.side > 0 ? 1.7 : 0), p.x + dx, p.y, size, {
          flip: F.side > 0, particles: false, aura: F.d.genome.rarity >= 2, fit: true,
        });
        if (F.flash > 0) {
          ctx.globalCompositeOperation = 'lighter';
          ctx.globalAlpha = F.flash * 0.5;
          const rg = ctx.createRadialGradient(p.x, p.y - size * 0.1, 0, p.x, p.y - size * 0.1, size * 0.4);
          rg.addColorStop(0, '#ffffff');
          rg.addColorStop(1, 'rgba(255,255,255,0)');
          ctx.fillStyle = rg;
          ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
          F.flash = Math.max(0, F.flash - 0.06);
        }
        ctx.restore();
      }

      for (let i = effects.length - 1; i >= 0; i--) {
        const fx = effects[i];
        if (fx.kind === 'tween') { if (!fx.update()) effects.splice(i, 1); continue; }
        const f = (clock - fx.t0) / fx.dur;
        if (f >= 1) { effects.splice(i, 1); continue; }
        ctx.save();
        if (fx.kind === 'text') {
          const p = pos({ side: fx.side });
          const sameSide = effects.filter(e => e.kind === 'text' && e.side === fx.side);
          const idx = sameSide.indexOf(fx);
          const scale = w / 400;
          ctx.globalAlpha = 1 - Math.max(0, f - 0.6) / 0.4;
          ctx.font = `900 ${Math.round((fx.big ? 34 : 22) * scale)}px "Jua", system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.lineWidth = 5 * scale;
          ctx.strokeStyle = 'rgba(20,8,30,0.9)';
          const y = p.y - h * 0.3 - f * 40 * scale - idx * 26 * scale;
          ctx.strokeText(fx.str, p.x, y);
          ctx.fillStyle = fx.color;
          ctx.fillText(fx.str, p.x, y);
        } else if (fx.kind === 'burst') {
          const p = pos({ side: fx.side });
          ctx.globalCompositeOperation = 'lighter';
          ctx.translate(p.x, p.y - h * 0.08);
          const R = (fx.big ? 0.32 : 0.18) * w * (0.4 + f);
          ctx.globalAlpha = 1 - f;
          for (let k = 0; k < 10; k++) {
            ctx.rotate(Math.PI / 5);
            ctx.beginPath();
            ctx.moveTo(0, -R * 0.1); ctx.lineTo(R, 0); ctx.lineTo(0, R * 0.1);
            ctx.fillStyle = hsl(fx.hue, 100, 75);
            ctx.fill();
          }
          ctx.beginPath(); ctx.arc(0, 0, R * 0.3, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff'; ctx.fill();
        } else if (fx.kind === 'beam') {
          const a = pos(fx.from), b = pos(fx.to);
          ctx.globalCompositeOperation = 'lighter';
          const x = a.x + (b.x - a.x) * f, y = a.y - h * 0.12 + (b.y - a.y) * f;
          for (let k = 0; k < 8; k++) {
            const kk = k / 8;
            const xx = a.x + (b.x - a.x) * Math.max(0, f - kk * 0.25), yy = a.y - h * 0.12;
            ctx.globalAlpha = (1 - kk) * 0.6;
            ctx.beginPath(); ctx.arc(xx, yy + Math.sin(k + clock * 20) * 4, w * 0.03 * (1 - kk), 0, Math.PI * 2);
            ctx.fillStyle = hsl(fx.hue, 100, 65); ctx.fill();
          }
          ctx.globalAlpha = 1;
          const rg = ctx.createRadialGradient(x, y, 0, x, y, w * 0.08);
          rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.4, hsl(fx.hue, 100, 70)); rg.addColorStop(1, hsl(fx.hue, 100, 60, 0));
          ctx.fillStyle = rg;
          ctx.beginPath(); ctx.arc(x, y, w * 0.08, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
      }
    }

    function frame(now) {
      if (!running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock += dt * speed;
      for (let i = waits.length - 1; i >= 0; i--) if (clock >= waits[i].at) { waits[i].res(); waits.splice(i, 1); }
      draw(clock);
      raf = requestAnimationFrame(frame);
    }

    raf = requestAnimationFrame(frame);
    run();

    return {
      stop() { running = false; cancelAnimationFrame(raf); },
      skill() { if (gauge >= 100) { skillQueued = true; hooks.onUpdate && hooks.onUpdate(state()); } },
      toggleAuto() { auto = !auto; hooks.onUpdate && hooks.onUpdate(state()); return auto; },
      toggleSpeed() { speed = speed === 1 ? 2 : speed === 2 ? 3 : 1; hooks.onUpdate && hooks.onUpdate(state()); return speed; },
      get skillQueued() { return skillQueued; },
    };
  }

  DV.Battle = Battle;
})(window.DV = window.DV || {});
