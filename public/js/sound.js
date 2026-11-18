'use strict';

(function () {
  const storeKey = 'arena.sound';
  let enabled = localStorage.getItem(storeKey) !== '0';
  let ctx = null;
  let master = null;
  let lastPlay = 0;

  function init() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return ctx;
    }
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      ctx = new AudioCtx();
      master = ctx.createGain();
      master.gain.value = 0.55;
      master.connect(ctx.destination);
    } catch (err) {
      ctx = null;
    }
    return ctx;
  }

  function tone({ from = 440, to = null, dur = 0.15, type = 'sine', gain = 0.15, delay = 0 }) {
    if (!init() || !enabled) return;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise({ dur = 0.2, gain = 0.2, filter = 1200, type = 'lowpass', delay = 0 }) {
    if (!init() || !enabled) return;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(filter, t0);
    f.frequency.exponentialRampToValueAtTime(Math.max(80, filter * 0.25), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur);
  }

  const SFX = {
    punch() {
      noise({ dur: 0.1, gain: 0.1, filter: 700 });
      tone({ from: 140, to: 60, dur: 0.11, type: 'sine', gain: 0.12 });
    },
    hit() {
      noise({ dur: 0.07, gain: 0.06, filter: 900 });
    },
    crit() {
      tone({ from: 220, to: 90, dur: 0.16, type: 'square', gain: 0.07 });
      noise({ dur: 0.12, gain: 0.12, filter: 1400 });
    },
    diamond() {
      tone({ from: 1100, to: 1900, dur: 0.14, type: 'triangle', gain: 0.08 });
      tone({ from: 1600, to: 2400, dur: 0.1, type: 'sine', gain: 0.05, delay: 0.03 });
    },
    lightning() {
      noise({ dur: 0.34, gain: 0.22, filter: 5200, type: 'highpass' });
      tone({ from: 900, to: 130, dur: 0.24, type: 'sawtooth', gain: 0.07 });
    },
    meteor() {
      tone({ from: 110, to: 26, dur: 0.7, type: 'sine', gain: 0.28 });
      noise({ dur: 0.65, gain: 0.26, filter: 900 });
      tone({ from: 320, to: 40, dur: 0.5, type: 'sawtooth', gain: 0.06, delay: 0.05 });
    },
    titan() {
      tone({ from: 70, to: 24, dur: 1.0, type: 'sawtooth', gain: 0.2 });
      noise({ dur: 0.9, gain: 0.24, filter: 600 });
    },
    revive() {
      [523, 659, 784, 1046].forEach((f, i) =>
        tone({ from: f, to: f * 1.01, dur: 0.22, type: 'sine', gain: 0.075, delay: i * 0.075 })
      );
    },
    heal() {
      tone({ from: 640, to: 900, dur: 0.18, type: 'sine', gain: 0.06 });
    },
    ko() {
      tone({ from: 320, to: 60, dur: 0.38, type: 'sawtooth', gain: 0.09 });
      noise({ dur: 0.25, gain: 0.12, filter: 500 });
    },
    round() {
      [392, 523, 659].forEach((f, i) =>
        tone({ from: f, dur: 0.3, type: 'triangle', gain: 0.09, delay: i * 0.14 })
      );
    },
    champion() {
      [523, 659, 784, 1046, 1318].forEach((f, i) =>
        tone({ from: f, dur: 0.45, type: 'triangle', gain: 0.08, delay: i * 0.11 })
      );
    },
    gift() {
      tone({ from: 880, to: 1320, dur: 0.1, type: 'triangle', gain: 0.05 });
    },
    join() {
      tone({ from: 420, to: 620, dur: 0.1, type: 'sine', gain: 0.04 });
    },
  };

  window.Sfx = {
    get enabled() {
      return enabled;
    },
    unlock() {
      init();
    },
    toggle() {
      enabled = !enabled;
      localStorage.setItem(storeKey, enabled ? '1' : '0');
      if (enabled) init();
      return enabled;
    },
    play(name) {
      if (!enabled) return;
      const now = performance.now();
      if (now - lastPlay < 28) return;
      lastPlay = now;
      const fn = SFX[name];
      if (!fn) return;
      try {
        fn();
      } catch (err) {
        /* ses kritik degil */
      }
    },
    ability(key) {
      if (key === 'lightning') return this.play('lightning');
      if (key === 'meteor') return this.play('meteor');
      if (key === 'titan') return this.play('titan');
      if (key === 'diamond') return this.play('diamond');
      if (key === 'revive') return this.play('revive');
      return this.play('punch');
    },
  };

  // Tarayici otomatik oynatma kilidini ilk etkilesimde ac.
  const unlock = () => {
    init();
    window.removeEventListener('pointerdown', unlock);
    window.removeEventListener('keydown', unlock);
  };
  window.addEventListener('pointerdown', unlock, { once: true });
  window.addEventListener('keydown', unlock, { once: true });
})();
