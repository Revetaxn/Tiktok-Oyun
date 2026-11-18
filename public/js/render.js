'use strict';

(function () {
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const easeIn = (t) => Math.pow(clamp(t, 0, 1), 2);

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function wrapText(ctx, text, maxWidth, maxLines = 3) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
        if (lines.length === maxLines - 1) break;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) lines.length = maxLines;
    const joined = lines.join(' ');
    if (joined.length < String(text).replace(/\s+/g, ' ').trim().length) {
      let last = lines[maxLines - 1] || '';
      while (last.length > 3 && ctx.measureText(last + '…').width > maxWidth) {
        last = last.slice(0, -1);
      }
      lines[maxLines - 1] = last + '…';
    }
    return lines;
  }

  const ABILITY_FX = {
    punch: { shards: 0, shake: 0.12 },
    diamond: { shards: 12, shake: 0.2 },
    lightning: { shards: 0, shake: 0.35 },
    meteor: { shards: 0, shake: 1.1 },
    titan: { shards: 0, shake: 1.4 },
  };

  class ArenaRenderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.views = new Map();
      this.snapshot = null;
      this.effects = [];
      this.damage = [];
      this.particles = [];
      this.delayed = [];
      this.stars = [];
      this.dust = [];
      this.shake = 0;
      this.flash = 0;
      this.flashColor = 'rgba(255,255,255,1)';
      this.time = 0;
      this.lastFrame = performance.now();
      this.arena = { cx: 0, cy: 0, rx: 0, ry: 0 };
      this.unit = 1.7;
      this.resize();
      window.addEventListener('resize', () => this.resize());
      requestAnimationFrame((t) => this.loop(t));
    }

    resize() {
      const w = window.innerWidth;
      const h = window.innerHeight;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.w = w;
      this.h = h;
      this.dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.canvas.style.width = w + 'px';
      this.canvas.style.height = h + 'px';
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rx = Math.min(w * 0.333, h * 0.6);
      this.arena = {
        cx: w * 0.5,
        cy: h * 0.548,
        rx,
        ry: rx * 0.555,
      };
      this.unit = clamp(Math.min(w, h) / 470, 1.25, 2.7);
      this.makeAmbient();
    }

    makeAmbient() {
      const count = Math.round((this.w * this.h) / 26000);
      this.stars = Array.from({ length: count }, () => ({
        x: Math.random() * this.w,
        y: Math.random() * this.h * 0.9,
        r: rand(0.4, 1.6),
        a: rand(0.08, 0.45),
        tw: rand(0.3, 1.4),
        ph: rand(0, TAU),
      }));
      this.dust = Array.from({ length: 34 }, () => this.newDust(true));
    }

    newDust(initial = false) {
      const a = rand(0, TAU);
      const r = Math.sqrt(Math.random()) * 0.92;
      return {
        x: Math.cos(a) * r,
        y: Math.sin(a) * r,
        vx: rand(-0.006, 0.006),
        vy: rand(-0.018, -0.004),
        r: rand(0.6, 2.1),
        a: rand(0.08, 0.35),
        ph: rand(0, TAU),
        initial,
      };
    }

    /* ------------------------------------------------------------- state */

    setSnapshot(snap) {
      const now = performance.now();
      const prevById = this.snapshot
        ? new Map(this.snapshot.fighters.map((f) => [f.id, f]))
        : new Map();

      const nextViews = new Map();
      for (const f of snap.fighters) {
        const old = this.views.get(f.id);
        const prev = prevById.get(f.id);
        const view = old || {
          animPhase: Math.random() * 10,
          seed: Math.random() * 100,
          speed: 0,
          bubbleUntil: 0,
          bubbleText: '',
          bubbleAt: 0,
          deathAt: 0,
          lastX: f.x,
          lastY: f.y,
        };
        view.id = f.id;
        view.name = f.n;
        view.kind = f.k;
        view.color = f.c;
        view.px = prev ? prev.x : f.x;
        view.py = prev ? prev.y : f.y;
        view.x = f.x;
        view.y = f.y;
        view.hp = f.hp;
        view.maxHp = f.mhp;
        view.power = f.pw;
        view.alive = !!f.al;
        view.state = f.st;
        view.facing = f.f;
        view.swing = f.sw;
        view.hurt = f.hu;
        view.invuln = !!f.iv;
        view.wins = f.w || 0;
        view.streak = f.sk || 0;
        view.snapAt = now;
        if (old && old.alive && !f.al) view.deathAt = now;
        if (!f.al && !view.deathAt) view.deathAt = now - 500;
        if (f.bub) {
          if (view.bubbleText !== f.bub.t) {
            view.bubbleText = f.bub.t;
            view.bubbleAt = now;
          }
          view.bubbleUntil = now + f.bub.ms;
        }
        view.speed = Math.hypot(view.x - view.lastX, view.y - view.lastY) * 14;
        view.lastX = view.x;
        view.lastY = view.y;
        nextViews.set(f.id, view);
      }
      this.views = nextViews;
      this.snapshot = snap;
    }

    schedule(ms, fn) {
      this.delayed.push({ at: performance.now() + ms, fn });
    }

    pushFx(fx) {
      const now = performance.now();
      switch (fx.type) {
        case 'cast': {
          const ability = fx.ability;
          Sfx.ability(ability);
          if (ability === 'lightning') {
            (fx.targets || []).forEach((t, i) => {
              this.effects.push({
                kind: 'lightning',
                x: t.x,
                y: t.y,
                color: fx.color || '#fde047',
                age: -i * 0.06,
                life: 0.55,
                seed: Math.random() * 1000,
              });
            });
            this.flash = Math.max(this.flash, 0.16);
            this.flashColor = 'rgba(253,224,71,';
            this.shake = Math.max(this.shake, 0.3);
          } else if (ability === 'meteor' || ability === 'titan') {
            const impact = fx.impact || (fx.targets && fx.targets[0]) || fx.caster;
            this.effects.push({
              kind: ability === 'titan' ? 'titan' : 'meteor',
              x: impact.x,
              y: impact.y,
              age: 0,
              life: 1.5,
              fall: 0.42,
              impacted: false,
              color: fx.color || '#fb923c',
            });
            this.flash = Math.max(this.flash, 0.3);
            this.flashColor = ability === 'titan' ? 'rgba(244,114,182,' : 'rgba(251,146,60,';
            this.shake = Math.max(this.shake, ability === 'titan' ? 0.75 : 0.55);
            this.schedule(420, () => this.burst(impact.x, impact.y, '#fdba74', 26, 1.5));
          } else if (ability === 'diamond') {
            (fx.targets || []).forEach((t) => {
              this.effects.push({
                kind: 'slash',
                x: t.x,
                y: t.y,
                age: 0,
                life: 0.32,
                color: fx.color || '#67e8f9',
                angle: rand(-0.7, 0.7),
                size: 1.25,
              });
              this.burst(t.x, t.y, fx.color || '#67e8f9', 12, 0.9);
            });
            this.shake = Math.max(this.shake, 0.22);
          } else if (ability === 'revive') {
            // diriliş ayrı fx ile geliyor
          } else {
            (fx.targets || []).forEach((t) => {
              this.effects.push({
                kind: 'slash',
                x: t.x,
                y: t.y,
                age: 0,
                life: 0.26,
                color: fx.color || '#7dd3fc',
                angle: rand(-0.5, 0.5),
                size: 0.9,
              });
              this.burst(t.x, t.y, fx.color || '#7dd3fc', 5, 0.5);
            });
          }
          break;
        }
        case 'melee': {
          this.effects.push({
            kind: 'melee',
            x: fx.x,
            y: fx.y,
            tx: fx.target?.x ?? fx.x,
            ty: fx.target?.y ?? fx.y,
            age: 0,
            life: 0.16,
            color: fx.color || '#94a3b8',
          });
          break;
        }
        case 'hit': {
          const isBig = fx.ability === 'meteor' || fx.ability === 'titan';
          const delay = fx.ability === 'lightning' ? 120 : isBig ? 340 : 0;
          const add = () => {
            this.addDamage(fx.x, fx.y, fx.amount, fx.crit, fx.ability, fx.color);
            this.burst(fx.x, fx.y, fx.crit ? '#fbbf24' : '#fca5a5', fx.crit ? 10 : 5, fx.crit ? 0.8 : 0.45);
            if (fx.crit) Sfx.play('crit');
            else Sfx.play('hit');
          };
          if (delay) this.schedule(delay, add);
          else add();
          break;
        }
        case 'ko': {
          this.effects.push({
            kind: 'ko',
            x: fx.x,
            y: fx.y,
            age: 0,
            life: 1.4,
            color: fx.color || '#f87171',
            seed: Math.random() * 100,
          });
          this.shake = Math.max(this.shake, 0.35);
          Sfx.play('ko');
          break;
        }
        case 'revive': {
          this.effects.push({
            kind: 'revive',
            x: fx.x,
            y: fx.y,
            age: 0,
            life: 1.3,
            color: '#f9a8d4',
          });
          this.flash = Math.max(this.flash, 0.12);
          this.flashColor = 'rgba(249,168,212,';
          Sfx.play('revive');
          break;
        }
        case 'heal': {
          this.effects.push({
            kind: 'heal',
            x: fx.x,
            y: fx.y,
            age: 0,
            life: 0.9,
            color: '#4ade80',
          });
          this.addDamage(fx.x, fx.y, fx.amount || 0, false, 'heal', '#4ade80', true);
          Sfx.play('heal');
          break;
        }
        default:
          break;
      }
    }

    addDamage(x, y, amount, crit, ability, color, heal = false) {
      const text = heal ? `+${amount}` : `-${amount}`;
      this.damage.push({
        x: x + rand(-0.02, 0.02),
        y,
        vy: -0.5,
        age: 0,
        life: 1.0,
        text,
        crit,
        heal,
        color: heal ? '#86efac' : crit ? '#fde047' : color && ability !== 'melee' ? color : '#ffffff',
        size: heal ? 0.9 : crit ? 1.45 : 1,
      });
    }

    burst(x, y, color, count = 6, power = 0.6) {
      for (let i = 0; i < count; i++) {
        const a = rand(0, TAU);
        const sp = rand(0.12, 0.55) * power;
        this.particles.push({
          kind: 'spark',
          x,
          y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp - 0.1,
          age: 0,
          life: rand(0.25, 0.6),
          color,
          size: rand(1, 2.6) * this.unit * 0.55,
          gravity: 1.2,
        });
      }
    }

    celebrate() {
      const colors = ['#fbbf24', '#22d3ee', '#a78bfa', '#f472b6', '#4ade80', '#f8fafc'];
      for (let i = 0; i < 130; i++) {
        this.particles.push({
          kind: 'confetti',
          x: rand(0.05, 0.95),
          y: -0.05 - rand(0, 0.4),
          vx: rand(-0.05, 0.05),
          vy: rand(0.12, 0.34),
          age: -rand(0, 0.7),
          life: rand(2.6, 4.4),
          color: colors[i % colors.length],
          size: rand(3, 7),
          rot: rand(0, TAU),
          vr: rand(-5, 5),
          gravity: 0.05,
        });
      }
      this.shake = Math.max(this.shake, 0.25);
      Sfx.play('round');
    }

    /* ------------------------------------------------------------- update */

    update(dt, now) {
      this.time += dt;
      this.shake = Math.max(0, this.shake - dt * 2.4);
      this.flash = Math.max(0, this.flash - dt * 1.9);

      for (const d of this.delayed) {
        if (now >= d.at) {
          d.done = true;
          d.fn();
        }
      }
      this.delayed = this.delayed.filter((d) => !d.done);

      for (const e of this.effects) {
        e.age += dt;
        if (e.kind === 'meteor' && !e.impacted && e.age >= e.fall) {
          e.impacted = true;
          this.shake = Math.max(this.shake, 1.15);
          this.flash = Math.max(this.flash, 0.42);
          this.flashColor = 'rgba(251,146,60,';
          Sfx.play('meteor');
          this.burst(e.x, e.y, '#fb923c', 34, 1.5);
          this.burst(e.x, e.y, '#fde047', 18, 1.1);
        }
        if (e.kind === 'titan' && !e.impacted && e.age >= e.fall) {
          e.impacted = true;
          this.shake = Math.max(this.shake, 1.3);
          this.flash = Math.max(this.flash, 0.45);
          this.flashColor = 'rgba(244,114,182,';
          Sfx.play('titan');
          this.burst(e.x, e.y, '#f472b6', 40, 1.7);
          this.burst(e.x, e.y, '#fbbf24', 24, 1.3);
        }
      }
      this.effects = this.effects.filter((e) => e.age < e.life);

      for (const d of this.damage) {
        d.age += dt;
        d.y += d.vy * dt * 0.16;
        d.vy *= 0.94;
      }
      this.damage = this.damage.filter((d) => d.age < d.life);

      for (const p of this.particles) {
        p.age += dt;
        if (p.age < 0) continue;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += (p.gravity || 0.8) * dt;
        if (p.kind === 'confetti') p.rot += p.vr * dt;
      }
      this.particles = this.particles.filter((p) => p.age < p.life);

      for (const d of this.dust) {
        d.x += d.vx * dt;
        d.y += d.vy * dt;
        if (d.y < -1 || Math.hypot(d.x, d.y) > 1) Object.assign(d, this.newDust());
      }

      for (const v of this.views.values()) {
        if (!v.alive) continue;
        const moving = v.speed > 0.05 ? 1 : 0;
        v.animPhase += dt * (moving || v.state === 'run' ? 9.5 : 2.2);
      }
    }

    /* --------------------------------------------------------------- draw */

    loop(now) {
      const dt = Math.min(0.05, (now - this.lastFrame) / 1000);
      this.lastFrame = now;
      this.update(dt, now);
      this.draw(now);
      requestAnimationFrame((t) => this.loop(t));
    }

    toScreen(x, y) {
      const a = this.arena;
      return { x: a.cx + x * a.rx, y: a.cy + y * a.ry };
    }

    draw(now) {
      const ctx = this.ctx;
      ctx.clearRect(0, 0, this.w, this.h);

      const shakeX = this.shake > 0.02 ? rand(-1, 1) * this.shake * 7 : 0;
      const shakeY = this.shake > 0.02 ? rand(-1, 1) * this.shake * 6 : 0;

      ctx.save();
      ctx.translate(shakeX, shakeY);

      this.drawAmbient(ctx);
      this.drawArena(ctx);
      this.drawDust(ctx);
      this.drawFighters(ctx, now);
      this.drawEffects(ctx);
      this.drawParticles(ctx);
      this.drawDamage(ctx);

      ctx.restore();

      if (this.flash > 0.01) {
        ctx.fillStyle = this.flashColor + (this.flash * 0.5).toFixed(3) + ')';
        ctx.fillRect(0, 0, this.w, this.h);
      }
    }

    drawAmbient(ctx) {
      for (const s of this.stars) {
        const tw = 0.5 + Math.sin(this.time * s.tw + s.ph) * 0.5;
        ctx.globalAlpha = s.a * (0.35 + tw * 0.65);
        ctx.fillStyle = '#9bd8ff';
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // tepeden gelen isik huzmeleri
      const { cx, cy, rx, ry } = this.arena;
      const g = ctx.createLinearGradient(cx, cy - ry * 2.4, cx, cy + ry * 0.4);
      g.addColorStop(0, 'rgba(56,189,248,0.05)');
      g.addColorStop(1, 'rgba(56,189,248,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(cx - rx * 0.36, cy - ry * 2.4);
      ctx.lineTo(cx + rx * 0.36, cy - ry * 2.4);
      ctx.lineTo(cx + rx * 0.72, cy + ry * 0.6);
      ctx.lineTo(cx - rx * 0.72, cy + ry * 0.6);
      ctx.closePath();
      ctx.fill();
    }

    ellipsePath(ctx, cx, cy, rx, ry) {
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
    }

    drawArena(ctx) {
      const { cx, cy, rx, ry } = this.arena;

      // zemin isigi
      const halo = ctx.createRadialGradient(cx, cy, rx * 0.1, cx, cy, rx * 1.08);
      halo.addColorStop(0, 'rgba(30,64,120,0.18)');
      halo.addColorStop(0.55, 'rgba(14,32,64,0.14)');
      halo.addColorStop(1, 'rgba(3,8,18,0)');
      ctx.fillStyle = halo;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      ctx.beginPath();
      ctx.arc(0, 0, rx * 1.08, 0, TAU);
      ctx.fill();
      ctx.restore();

      // arena govdesi
      ctx.save();
      ctx.translate(cx, cy);
      ctx.scale(1, ry / rx);
      const R = rx;
      const floor = ctx.createRadialGradient(0, 0, R * 0.05, 0, 0, R);
      floor.addColorStop(0, 'rgba(26,48,88,0.72)');
      floor.addColorStop(0.5, 'rgba(13,26,50,0.82)');
      floor.addColorStop(1, 'rgba(5,10,22,0.94)');
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, TAU);
      ctx.fillStyle = floor;
      ctx.fill();
      ctx.clip();

      // izgara
      ctx.strokeStyle = 'rgba(86,150,220,0.1)';
      ctx.lineWidth = 1;
      const step = R / 5.5;
      for (let i = -6; i <= 6; i++) {
        ctx.beginPath();
        ctx.moveTo(i * step, -R);
        ctx.lineTo(i * step, R);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-R, i * step);
        ctx.lineTo(R, i * step);
        ctx.stroke();
      }

      // esmerkezli halkalar
      for (let i = 1; i <= 5; i++) {
        const rr = (R * i) / 6;
        ctx.beginPath();
        ctx.arc(0, 0, rr, 0, TAU);
        ctx.strokeStyle = i === 3 ? 'rgba(34,211,238,0.16)' : 'rgba(86,150,220,0.09)';
        ctx.lineWidth = i === 3 ? 1.6 : 1;
        ctx.stroke();
      }

      // isinlar
      for (let i = 0; i < 24; i++) {
        const a = (i / 24) * TAU;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.16, Math.sin(a) * R * 0.16);
        ctx.lineTo(Math.cos(a) * R * 0.98, Math.sin(a) * R * 0.98);
        ctx.strokeStyle = 'rgba(86,150,220,0.055)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // tarayan isik
      const sweep = this.time * 0.35;
      const sweepGrad = ctx.createLinearGradient(0, 0, Math.cos(sweep) * R, Math.sin(sweep) * R);
      sweepGrad.addColorStop(0, 'rgba(34,211,238,0)');
      sweepGrad.addColorStop(1, 'rgba(34,211,238,0.14)');
      ctx.fillStyle = sweepGrad;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, R, sweep - 0.26, sweep);
      ctx.closePath();
      ctx.fill();

      // merkez amblem
      ctx.globalAlpha = 0.34;
      ctx.strokeStyle = 'rgba(103,232,249,0.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * TAU - Math.PI / 2;
        const px = Math.cos(a) * R * 0.11;
        const py = Math.sin(a) * R * 0.11;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.globalAlpha = 0.16;
      ctx.font = `600 ${Math.round(R * 0.045)}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText('A R E N A', 0, R * 0.21);
      ctx.globalAlpha = 1;

      ctx.restore();

      // kenar cizgileri
      ctx.save();
      ctx.shadowColor = 'rgba(34,211,238,0.55)';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(96,215,255,0.55)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();

      ctx.save();
      ctx.setLineDash([10, 16]);
      ctx.lineDashOffset = -this.time * 22;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx * 0.972, ry * 0.972, 0, 0, TAU);
      ctx.strokeStyle = 'rgba(167,139,250,0.28)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();

      // kose parantezleri
      const bx = cx - rx * 1.06;
      const by = cy - ry * 1.16;
      const bw = rx * 2.12;
      const bh = ry * 2.32;
      const len = Math.min(38, rx * 0.08);
      ctx.strokeStyle = 'rgba(34,211,238,0.38)';
      ctx.lineWidth = 2;
      const corners = [
        [bx, by, 1, 1],
        [bx + bw, by, -1, 1],
        [bx, by + bh, 1, -1],
        [bx + bw, by + bh, -1, -1],
      ];
      for (const [x, y, sx, sy] of corners) {
        ctx.beginPath();
        ctx.moveTo(x + sx * len, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x, y + sy * len);
        ctx.stroke();
      }
    }

    drawDust(ctx) {
      const { cx, cy, rx, ry } = this.arena;
      for (const d of this.dust) {
        const x = cx + d.x * rx;
        const y = cy + d.y * ry;
        const a = d.a * (0.6 + Math.sin(this.time * 1.4 + d.ph) * 0.4);
        ctx.fillStyle = `rgba(147,222,255,${a.toFixed(3)})`;
        ctx.beginPath();
        ctx.arc(x, y, d.r, 0, TAU);
        ctx.fill();
      }
    }

    drawFighters(ctx, now) {
      const list = [...this.views.values()].map((v) => {
        const t = clamp((now - v.snapAt) / 55, 0, 1);
        const x = lerp(v.px, v.x, t);
        const y = lerp(v.py, v.y, t);
        const p = this.toScreen(x, y);
        return { v, sx: p.x, sy: p.y, depth: 0.9 + ((y + 1) / 2) * 0.18 };
      });
      list.sort((a, b) => a.sy - b.sy);

      // hedef secimi icin hafif isaretler
      for (const item of list) this.drawShadow(ctx, item);

      for (const item of list) this.drawFighter(ctx, item, now);
    }

    drawShadow(ctx, item) {
      const { v, sx, sy, depth } = item;
      if (!v.alive) return;
      ctx.save();
      ctx.globalAlpha = 0.32;
      ctx.fillStyle = '#020617';
      ctx.beginPath();
      ctx.ellipse(sx, sy + 1, 13 * this.unit * depth * 0.7, 4.4 * this.unit * depth * 0.7, 0, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    drawFighter(ctx, item, now) {
      const { v, sx, sy, depth } = item;
      const U = this.unit * depth;
      const s = U / 1.7;
      const color = v.color;
      const dead = !v.alive;
      const champion = v.wins > 0;

      // guc aurosu (ince halka + yorunge parcaciklari)
      if (v.power > 1.05 && !dead) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.strokeStyle = this.rgba(color, 0.55);
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 17 * U, 5.6 * U, 0, 0, TAU);
        ctx.stroke();
        for (let i = 0; i < 2; i++) {
          const a = this.time * 1.5 + i * Math.PI + v.seed;
          const px = sx + Math.cos(a) * 17 * U;
          const py = sy + Math.sin(a) * 5.6 * U;
          ctx.fillStyle = this.rgba(color, 0.9);
          ctx.beginPath();
          ctx.arc(px, py - 3 * U, 1.7, 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }

      ctx.save();
      ctx.translate(sx, sy + (dead ? 0 : Math.sin(v.animPhase * 0.9 + v.seed) * 0.8));

      const deadAge = dead ? clamp((now - (v.deathAt || now)) / 1000, 0, 4) : 0;
      if (!v.alive) {
        const timeSince = Math.min(1, (now - (v.deathAt || now)) / 400);
        ctx.rotate(-1.35 * timeSince);
        ctx.globalAlpha = Math.max(0, 0.5 - deadAge * 0.14);
        if (ctx.globalAlpha <= 0.005) {
          ctx.restore();
          return;
        }
      }

      const hurt = v.hurt > 0.05;
      const bodyColor = dead ? '#64748b' : color;
      const lineWidth = clamp(3.1 * s, 2.2, 4.6);

      // kosu / saldiri animasyonu
      const running = v.alive && (v.state === 'run' || v.speed > 0.06);
      const walk = Math.sin(v.animPhase + v.seed) * (running ? 0.9 : 0.1);
      const attackP = v.swing > 0 ? 1 - v.swing : 1;
      const attacking = v.swing > 0.01 && v.alive;

      const hipY = -17 * U;
      const shoulderY = -30 * U;
      const headY = -38 * U;
      const headR = 6.1 * U;

      // golge / enerji halkasi
      if (v.invuln && v.alive) {
        ctx.save();
        ctx.globalAlpha = 0.5 + Math.sin(this.time * 6) * 0.2;
        ctx.strokeStyle = '#f9a8d4';
        ctx.lineWidth = 1.6;
        ctx.setLineDash([4, 5]);
        ctx.beginPath();
        ctx.ellipse(0, -22 * U, 16 * U, 26 * U, 0, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      // bacaklar (2 eklemli)
      const legSwing = walk * 8 * U;
      const legBend = running ? 4.5 * U : 1.5 * U;
      for (let i = 0; i < 2; i++) {
        const dir = i === 0 ? 1 : -1;
        const off = dir * legSwing * 0.6;
        const kneeX = off + dir * 1.5 * U;
        const kneeY = hipY + 7.6 * U;
        const footX = off * 1.5;
        const footY = 0;
        ctx.beginPath();
        ctx.moveTo(0, hipY);
        ctx.quadraticCurveTo(kneeX, kneeY - legBend, footX, footY);
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }

      // govde
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(0, shoulderY);
      ctx.strokeStyle = bodyColor;
      ctx.lineWidth = lineWidth + 0.4;
      ctx.stroke();

      // kollar
      const facing = v.facing >= 0 ? 1 : -1;
      const baseArm = 0.5 * facing;
      const swingAngle = attacking ? lerp(-1.85 * facing, 0.95 * facing, easeOut(attackP)) : baseArm;
      const otherArm = -baseArm * 0.9 + (running ? walk * 0.35 : Math.sin(v.animPhase * 0.9 + v.seed) * 0.08);

      for (let i = 0; i < 2; i++) {
        const angle = i === 0 ? swingAngle : otherArm;
        const ax = Math.sin(angle) * 12.5 * U * (i === 0 ? 1 : 0.9);
        const ay = Math.cos(angle) * 12.5 * U;
        const ex = Math.sin(angle) * 6.2 * U;
        const ey = shoulderY + Math.cos(angle) * 6.2 * U;
        ctx.beginPath();
        ctx.moveTo(0, shoulderY + 1 * U);
        ctx.quadraticCurveTo(ex, ey, ax, shoulderY + 1 * U + ay);
        ctx.strokeStyle = bodyColor;
        ctx.lineWidth = lineWidth - 0.2;
        ctx.stroke();

        if (i === 0) {
          // kilic
          const hx = ax;
          const hy = shoulderY + 1 * U + ay;
          const bladeAngle = angle + 0.5 * facing;
          const bx = hx + Math.sin(bladeAngle) * 13 * U;
          const by = hy + Math.cos(bladeAngle) * 13 * U;
          ctx.save();
          ctx.shadowColor = this.rgba(color, 0.85);
          ctx.shadowBlur = 10;
          ctx.strokeStyle = 'rgba(255,255,255,0.85)';
          ctx.lineWidth = 1.7;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.strokeStyle = this.rgba(color, 0.55);
          ctx.lineWidth = 3.2;
          ctx.globalAlpha *= 0.35;
          ctx.beginPath();
          ctx.moveTo(hx, hy);
          ctx.lineTo(bx, by);
          ctx.stroke();
          ctx.restore();
        }
      }

      // kafa
      ctx.save();
      ctx.shadowColor = this.rgba(color, 0.55);
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(0, headY, headR, 0, TAU);
      const headGrad = ctx.createRadialGradient(-headR * 0.3, headY - headR * 0.4, 1, 0, headY, headR);
      headGrad.addColorStop(0, '#ffffff');
      headGrad.addColorStop(0.25, bodyColor);
      headGrad.addColorStop(1, this.rgba(color, 0.45));
      ctx.fillStyle = dead ? '#52525b' : headGrad;
      ctx.fill();
      ctx.restore();

      // yuz
      ctx.fillStyle = '#06121f';
      const eyeR = 0.9 * U;
      if (dead) {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 1.3;
        for (const ex of [-2.3, 2.3]) {
          ctx.beginPath();
          ctx.moveTo(ex * U * facing - 1.1, headY - 1.2);
          ctx.lineTo(ex * U * facing + 1.1, headY + 1.2);
          ctx.moveTo(ex * U * facing + 1.1, headY - 1.2);
          ctx.lineTo(ex * U * facing - 1.1, headY + 1.2);
          ctx.stroke();
        }
      } else {
        ctx.beginPath();
        ctx.arc(-2 * U * facing, headY - 0.6 * U, eyeR, 0, TAU);
        ctx.arc(2.5 * U * facing, headY - 0.6 * U, eyeR, 0, TAU);
        ctx.fill();
        // agiz
        ctx.strokeStyle = 'rgba(6,18,31,0.8)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(0.4 * U * facing, headY + 2.2 * U, 1.9 * U, 0.15, Math.PI - 0.15);
        ctx.stroke();
      }

      ctx.restore();

      if (v.alive && hurt) {
        ctx.save();
        ctx.globalAlpha = 0.6 * v.hurt;
        ctx.strokeStyle = '#fecdd3';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fb7185';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(sx, sy - 24 * U, (15 + (1 - v.hurt) * 12) * U, 0, TAU);
        ctx.stroke();
        ctx.restore();
      }

      this.drawLabel(ctx, item, now);
    }

    drawLabel(ctx, item, now) {
      const { v, sx, sy } = item;
      const U = this.unit;
      const s = clamp(U / 1.7, 0.8, 1.25);
      const topY = sy - 56 * U;
      const dead = !v.alive;
      const deadAge = dead ? clamp((now - (v.deathAt || now)) / 1000, 0, 1.6) : 0;
      if (dead && deadAge >= 1.6) return;

      ctx.save();
      ctx.globalAlpha = dead ? Math.max(0, 0.42 - deadAge * 0.3) : 1;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      // isim
      const name = (v.wins > 0 ? '👑 ' : '') + String(v.name || '').slice(0, 18);
      const fontSize = Math.round(12.5 * s);
      ctx.font = `700 ${fontSize}px "Chakra Petch", "Segoe UI", sans-serif`;
      const nameW = ctx.measureText(name).width;
      const plateW = nameW + 16 * s;
      const plateH = 18 * s;
      const plateY = topY - plateH / 2;

      roundRect(ctx, sx - plateW / 2, plateY, plateW, plateH, 6);
      ctx.fillStyle = dead ? 'rgba(8,12,20,0.62)' : 'rgba(5,10,19,0.78)';
      ctx.fill();
      ctx.strokeStyle = this.rgba(v.color, dead ? 0.2 : 0.45);
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = dead ? '#94a3b8' : '#f1f5f9';
      ctx.fillText(name, sx, plateY + plateH / 2 + 0.5);

      // guc rozeti
      if (v.power > 1.04) {
        const badge = `×${v.power.toFixed(2).replace(/0$/, '')}`;
        ctx.font = `700 ${Math.round(9.5 * s)}px "Chakra Petch", sans-serif`;
        const bw = ctx.measureText(badge).width + 10 * s;
        const bx = sx + plateW / 2 + 3;
        roundRect(ctx, bx, plateY + 2 * s, bw, plateH - 4 * s, 5);
        ctx.fillStyle = 'rgba(251,191,36,0.16)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(251,191,36,0.45)';
        ctx.stroke();
        ctx.fillStyle = '#fcd34d';
        ctx.fillText(badge, bx + bw / 2, plateY + plateH / 2);
      }

      // can cubugu (olenlerde gosterme)
      if (dead) {
        if (v.bubbleText && now < v.bubbleUntil) this.drawBubble(ctx, item, v, now);
        ctx.restore();
        return;
      }
      const barW = Math.max(46 * s, nameW + 8 * s);
      const barH = 4 * s;
      const barY = plateY + plateH + 3.5 * s;
      roundRect(ctx, sx - barW / 2, barY, barW, barH, 99);
      ctx.fillStyle = 'rgba(2,6,14,0.8)';
      ctx.fill();
      const pct = clamp(v.hp / (v.maxHp || 100), 0, 1);
      if (pct > 0) {
        const hpColor = pct > 0.55 ? '#34d399' : pct > 0.28 ? '#fbbf24' : '#fb7185';
        roundRect(ctx, sx - barW / 2, barY, Math.max(barH, barW * pct), barH, 99);
        ctx.fillStyle = hpColor;
        ctx.fill();
        ctx.save();
        ctx.globalAlpha = 0.35;
        ctx.fillStyle = '#fff';
        ctx.fillRect(sx - barW / 2, barY, barW * pct, barH * 0.45);
        ctx.restore();
      }

      // konusma balonu
      if (v.bubbleText && now < v.bubbleUntil) {
        this.drawBubble(ctx, item, v, now);
      }

      ctx.restore();
    }

    drawBubble(ctx, item, v, now) {
      const { sx, sy } = item;
      const s = clamp(this.unit / 1.7, 0.82, 1.15);
      const fontSize = Math.round(12 * s);
      const maxW = 176 * s;
      const remain = v.bubbleUntil - now;
      const appear = clamp((now - v.bubbleAt) / 160, 0, 1);
      const fade = clamp(remain / 420, 0, 1);

      ctx.save();
      ctx.font = `500 ${fontSize}px "Inter", sans-serif`;
      const lines = wrapText(ctx, v.bubbleText, maxW, 3);
      let textW = 0;
      for (const line of lines) textW = Math.max(textW, ctx.measureText(line).width);
      const padX = 9 * s;
      const padY = 6 * s;
      const lineH = fontSize * 1.24;
      const bw = Math.min(maxW + padX * 2, textW + padX * 2);
      const bh = lines.length * lineH + padY * 2;
      const tail = 6 * s;
      const topY = sy - 56 * this.unit - 18 * s - bh - tail;
      let bx = sx - bw / 2;
      bx = clamp(bx, 92, this.w - 92 - bw);
      const by = Math.max(72, topY);

      const scale = 0.86 + appear * 0.14;
      ctx.globalAlpha = fade;
      ctx.translate(sx, by + bh / 2);
      ctx.scale(scale, scale);
      ctx.translate(-sx, -(by + bh / 2));

      roundRect(ctx, bx, by, bw, bh, 9);
      ctx.fillStyle = 'rgba(7,13,24,0.93)';
      ctx.fill();
      ctx.strokeStyle = this.rgba(v.color, 0.55);
      ctx.lineWidth = 1.2;
      ctx.stroke();

      // kuyruk
      ctx.beginPath();
      const tailX = clamp(sx, bx + 12, bx + bw - 12);
      ctx.moveTo(tailX - tail * 0.7, by + bh - 0.5);
      ctx.lineTo(tailX + tail * 0.7, by + bh - 0.5);
      ctx.lineTo(tailX, by + bh + tail);
      ctx.closePath();
      ctx.fillStyle = 'rgba(7,13,24,0.93)';
      ctx.fill();
      ctx.strokeStyle = this.rgba(v.color, 0.55);
      ctx.stroke();

      ctx.fillStyle = '#e8f2ff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      lines.forEach((line, i) => {
        ctx.fillText(line, bx + bw / 2, by + padY + lineH * (i + 0.5));
      });
      ctx.restore();
    }

    drawEffects(ctx) {
      for (const e of this.effects) {
        const age = e.age;
        if (age < 0) continue;
        const p = clamp(age / e.life, 0, 1);
        switch (e.kind) {
          case 'lightning':
            this.drawLightning(ctx, e, p);
            break;
          case 'meteor':
          case 'titan':
            this.drawMeteor(ctx, e, age, p);
            break;
          case 'slash':
            this.drawSlash(ctx, e, p);
            break;
          case 'melee':
            this.drawMelee(ctx, e, p);
            break;
          case 'revive':
            this.drawRevive(ctx, e, p);
            break;
          case 'heal':
            this.drawHeal(ctx, e, p);
            break;
          case 'ko':
            this.drawKo(ctx, e, p);
            break;
          default:
            break;
        }
      }
    }

    drawLightning(ctx, e, p) {
      const t = this.toScreen(e.x, e.y);
      const top = { x: t.x + rand(-14, 14), y: -30 };
      const alpha = p < 0.12 ? 1 : 1 - p;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round';

      const drawBolt = (from, to, depth, width, color) => {
        const segments = 7;
        const pts = [from];
        for (let i = 1; i < segments; i++) {
          const k = i / segments;
          const jitter = (1 - Math.abs(k - 0.5) * 2) * 34;
          pts.push({
            x: lerp(from.x, to.x, k) + rand(-jitter, jitter),
            y: lerp(from.y, to.y, k) + rand(-8, 8),
          });
        }
        pts.push(to);
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.strokeStyle = color;
        ctx.lineWidth = width;
        ctx.stroke();
        if (depth > 0) {
          for (let b = 0; b < 2; b++) {
            const mid = pts[Math.floor(rand(2, pts.length - 2))];
            drawBolt(mid, { x: mid.x + rand(-45, 45), y: mid.y + rand(20, 60) }, depth - 1, width * 0.5, color);
          }
        }
      };

      ctx.shadowColor = e.color;
      ctx.shadowBlur = 26;
      drawBolt(top, t, 2, 6, this.rgba(e.color, 0.45));
      ctx.shadowBlur = 16;
      drawBolt(top, t, 1, 2.2, 'rgba(255,255,255,0.95)');

      // carpma noktasi
      const r = 8 + p * 40;
      const g = ctx.createRadialGradient(t.x, t.y, 1, t.x, t.y, r);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(0.4, this.rgba(e.color, 0.5));
      g.addColorStop(1, this.rgba(e.color, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, r, 0, TAU);
      ctx.fill();

      // zemin halkasi
      ctx.strokeStyle = this.rgba(e.color, 0.5 * (1 - p));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(t.x, t.y, 14 + p * 34, (14 + p * 34) * 0.4, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    drawMeteor(ctx, e, age, p) {
      const t = this.toScreen(e.x, e.y);
      const fall = e.fall || 0.42;
      if (age < fall) {
        const k = easeIn(age / fall);
        const startX = t.x + this.arena.rx * 0.55;
        const startY = t.y - this.arena.ry * 2.2;
        const x = lerp(startX, t.x, k);
        const y = lerp(startY, t.y, k);
        const r = lerp(6, 24, k) * (this.unit / 1.7);

        // iz
        ctx.save();
        ctx.globalAlpha = 0.75;
        const trail = ctx.createLinearGradient(x + 56, y - 110, x, y);
        trail.addColorStop(0, 'rgba(251,146,60,0)');
        trail.addColorStop(1, this.rgba(e.color, 0.65));
        ctx.strokeStyle = trail;
        ctx.lineWidth = r * 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 90, y - 160);
        ctx.lineTo(x, y);
        ctx.stroke();

        ctx.shadowColor = e.color;
        ctx.shadowBlur = 30;
        const g = ctx.createRadialGradient(x, y, 1, x, y, r * 2.2);
        g.addColorStop(0, '#fff7ed');
        g.addColorStop(0.4, '#fdba74');
        g.addColorStop(1, 'rgba(249,115,22,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.65, 0, TAU);
        ctx.fill();
        ctx.restore();
        return;
      }

      const k = clamp((age - fall) / (e.life - fall), 0, 1);
      const r = (1 - k) * this.arena.rx * 0.16;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';

      // sok dalgasi
      for (let i = 0; i < 3; i++) {
        const rr = (0.25 + i * 0.3 + k * 1.5) * this.arena.rx * 0.24;
        ctx.strokeStyle = this.rgba(i === 0 ? '#fde047' : e.color, (1 - k) * (0.8 - i * 0.22));
        ctx.lineWidth = 3 - i;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, rr, rr * 0.42, 0, 0, TAU);
        ctx.stroke();
      }

      // ates topu
      const g = ctx.createRadialGradient(t.x, t.y, 1, t.x, t.y, Math.max(4, r * 2.4));
      g.addColorStop(0, `rgba(255,247,237,${(1 - k) * 0.95})`);
      g.addColorStop(0.35, `rgba(253,186,116,${(1 - k) * 0.55})`);
      g.addColorStop(1, 'rgba(249,115,22,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(t.x, t.y, Math.max(4, r * 2.4), 0, TAU);
      ctx.fill();

      // dikey isin
      if (k < 0.3) {
        const beam = ctx.createLinearGradient(t.x, t.y - 260, t.x, t.y);
        beam.addColorStop(0, 'rgba(251,146,60,0)');
        beam.addColorStop(1, `rgba(251,191,36,${(0.5 * (1 - k / 0.3)).toFixed(3)})`);
        ctx.fillStyle = beam;
        ctx.fillRect(t.x - 26, t.y - 260, 52, 260);
      }
      ctx.restore();
    }

    drawSlash(ctx, e, p) {
      const t = this.toScreen(e.x, e.y);
      const alpha = (1 - p) * 0.95;
      const len = 34 * (e.size || 1);
      ctx.save();
      ctx.translate(t.x, t.y - 20 * this.unit);
      ctx.rotate(e.angle || 0);
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#fff';
      ctx.shadowColor = e.color;
      ctx.shadowBlur = 18;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, len * (0.7 + p * 0.5), -1.15, 1.15);
      ctx.stroke();
      ctx.strokeStyle = this.rgba(e.color, 0.7);
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(0, 0, len * (0.7 + p * 0.5), -1.1, 1.1);
      ctx.stroke();
      ctx.restore();
    }

    drawMelee(ctx, e, p) {
      const a = this.toScreen(e.x, e.y);
      const b = this.toScreen(e.tx, e.ty);
      ctx.save();
      ctx.globalAlpha = (1 - p) * 0.5;
      ctx.strokeStyle = this.rgba(e.color, 0.8);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y - 22 * this.unit);
      ctx.lineTo(lerp(a.x, b.x, 0.55), lerp(a.y, b.y, 0.55) - 18 * this.unit);
      ctx.stroke();
      ctx.restore();
    }

    drawRevive(ctx, e, p) {
      const t = this.toScreen(e.x, e.y);
      const alpha = 1 - p;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = alpha;

      const beam = ctx.createLinearGradient(t.x, t.y - 190, t.x, t.y);
      beam.addColorStop(0, 'rgba(249,168,212,0)');
      beam.addColorStop(0.6, 'rgba(249,168,212,0.22)');
      beam.addColorStop(1, 'rgba(249,168,212,0.4)');
      ctx.fillStyle = beam;
      ctx.fillRect(t.x - 20, t.y - 190, 40, 190);

      for (let i = 0; i < 3; i++) {
        const rr = 12 + p * 70 + i * 10;
        ctx.strokeStyle = `rgba(249,168,212,${(alpha * (0.7 - i * 0.2)).toFixed(3)})`;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.ellipse(t.x, t.y, rr, rr * 0.38, 0, 0, TAU);
        ctx.stroke();
      }

      ctx.fillStyle = 'rgba(253,242,248,0.9)';
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + p * 2;
        const r = 14 + p * 52 + (i % 3) * 8;
        ctx.beginPath();
        ctx.arc(t.x + Math.cos(a) * r, t.y - 20 - p * 40 + Math.sin(a) * r * 0.4, 1.8, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawHeal(ctx, e, p) {
      const t = this.toScreen(e.x, e.y);
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.fillStyle = '#4ade80';
      ctx.font = `700 ${Math.round(22 * (this.unit / 1.7))}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur = 14;
      ctx.fillText('+', t.x - 12, t.y - 50 - p * 40);
      ctx.font = `700 ${Math.round(15 * (this.unit / 1.7))}px "Chakra Petch", sans-serif`;
      ctx.fillText('+', t.x + 14, t.y - 74 - p * 30);
      ctx.restore();
    }

    drawKo(ctx, e, p) {
      const t = this.toScreen(e.x, e.y);
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.textAlign = 'center';
      ctx.font = `${Math.round(20 * (this.unit / 1.7))}px serif`;
      ctx.fillText('💀', t.x, t.y - 82 - p * 45);
      ctx.font = `700 ${Math.round(11 * (this.unit / 1.7))}px "Chakra Petch", sans-serif`;
      ctx.fillStyle = '#fca5a5';
      ctx.fillText('ELENDİ', t.x, t.y - 64 - p * 45);
      ctx.restore();
    }

    drawParticles(ctx) {
      for (const prt of this.particles) {
        if (prt.age < 0) continue;
        const p = prt.age / prt.life;
        ctx.save();
        if (prt.kind === 'confetti') {
          const pos = this.toScreen(prt.x, prt.y);
          ctx.translate(pos.x, pos.y);
          ctx.rotate(prt.rot || 0);
          ctx.globalAlpha = 1 - p;
          ctx.fillStyle = prt.color;
          ctx.fillRect(-prt.size / 2, -prt.size / 4, prt.size, prt.size / 2);
        } else {
          const pos = this.toScreen(prt.x, prt.y);
          ctx.globalAlpha = (1 - p) * 0.9;
          ctx.fillStyle = prt.color;
          ctx.shadowColor = prt.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(pos.x, pos.y, Math.max(0.6, prt.size * (1 - p * 0.6)), 0, TAU);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    drawDamage(ctx) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const d of this.damage) {
        const t = this.toScreen(d.x, d.y);
        const p = d.age / d.life;
        const rise = easeOut(p) * 46;
        const pop = p < 0.16 ? 0.6 + (p / 0.16) * 0.5 : 1;
        const alpha = 1 - Math.max(0, (p - 0.55) / 0.45);
        const size = 15 * d.size * (this.unit / 1.7) * pop;
        ctx.globalAlpha = clamp(alpha, 0, 1);
        ctx.font = `800 ${Math.round(size)}px "Chakra Petch", "Segoe UI", sans-serif`;
        ctx.lineWidth = 4;
        ctx.strokeStyle = 'rgba(2,6,14,0.85)';
        ctx.strokeText(d.text, t.x, t.y - 34 - rise);
        ctx.fillStyle = d.color;
        if (d.crit) {
          ctx.shadowColor = '#fbbf24';
          ctx.shadowBlur = 14;
        }
        ctx.fillText(d.text, t.x, t.y - 34 - rise);
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    }

    rgba(hex, alpha) {
      const h = String(hex || '#ffffff').replace('#', '');
      const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
      const n = parseInt(full, 16);
      const r = (n >> 16) & 255;
      const g = (n >> 8) & 255;
      const b = n & 255;
      return `rgba(${r},${g},${b},${alpha})`;
    }
  }

  window.ArenaRenderer = ArenaRenderer;
})();
