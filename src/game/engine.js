'use strict';

const { EventEmitter } = require('node:events');
const { ABILITIES, classifyGift, normalizeGiftName } = require('./abilities');
const { createBotProfile } = require('./bots');
const {
  TAU,
  clamp,
  rand,
  randInt,
  pick,
  colorFromId,
  cleanNickname,
  cleanChat,
  hashString,
  mulberry32,
} = require('./util');

const ROUND_SIZE = 16;

const PHASE = {
  BATTLE: 'battle',
  ROUND_END: 'round_end',
};

function defaultSettings() {
  return {
    roundSeconds: 90,
    intermissionSeconds: 7,
    roundSize: ROUND_SIZE,
    winMultiplier: 1.1,
    maxPower: 8,
    joinOnChat: true,
    joinOnGift: true,
    autoStart: true,
    thresholds: { diamond: 5, lightning: 10, meteor: 50, titan: 1000 },
    reviveGifts: ['rose', 'gül', 'gul', 'tiktok', 'tik tok'],
    demo: true,
    tickRate: 30,
  };
}

class ArenaEngine extends EventEmitter {
  constructor(settings = {}) {
    super();
    this.settings = { ...defaultSettings(), ...settings };
    this.settings.thresholds = { ...defaultSettings().thresholds, ...(settings.thresholds || {}) };
    this.roster = new Map();
    this.fighters = new Map();
    this.round = 0;
    this.phase = PHASE.BATTLE;
    this.phaseTime = 0;
    this.timeLeft = 0;
    this.clock = 0;
    this.roundStartClock = 0;
    this.championId = null;
    this.lastRoundReason = null;
    this.pending = [];
    this.streaks = new Map();
    this.feed = [];
    this.feedSeq = 0;
    this.botNames = new Set();
    this.botSeq = 0;
    this.stats = {
      gifts: 0,
      diamonds: 0,
      joins: 0,
      kos: 0,
      viewers: 0,
      likes: 0,
      chats: 0,
      rounds: 0,
    };
    this.gifterDiamonds = new Map();
    this.lastChatAt = new Map();
    this.startRound(1, true);
  }

  get roundSize() {
    return clamp(Number(this.settings.roundSize) || ROUND_SIZE, 4, 24);
  }

  /* ------------------------------------------------------------------ */
  /* Oyuncu / bot kayit defteri                                          */
  /* ------------------------------------------------------------------ */

  playerProfile(user) {
    if (!user) return null;
    const uniqueId = String(user.uniqueId || user.userId || '').trim().toLowerCase();
    if (!uniqueId) return null;
    const id = 'u:' + uniqueId;
    let profile = this.roster.get(id);
    if (!profile) {
      profile = {
        id,
        kind: 'player',
        uniqueId,
        nickname: cleanNickname(user.nickname || user.uniqueId, uniqueId),
        color: colorFromId(uniqueId),
        power: 1,
        wins: 0,
        streak: 0,
        kills: 0,
        diamonds: 0,
        gifts: 0,
        joinedAt: Date.now(),
        lastActive: Date.now(),
        skill: 1,
        aggression: 1,
      };
      this.roster.set(id, profile);
      this.stats.joins += 1;
      this.pushFeed({
        type: 'join',
        icon: '🚪',
        color: profile.color,
        user: profile.nickname,
        text: 'arenaya katıldı',
      });
      this.emit('join', { id, nickname: profile.nickname, color: profile.color });
    } else {
      profile.nickname = cleanNickname(user.nickname || profile.nickname, profile.nickname);
    }
    profile.lastActive = Date.now();
    return profile;
  }

  ensureInArena(profile) {
    if (!profile) return false;
    if (this.fighters.has(profile.id)) return true;
    if (this.phase === PHASE.BATTLE) {
      // Yeni hediye atan oyuncuya yer ac: once olu bot, sonra en zayif bot.
      if (this.fighters.size >= this.roundSize) {
        const bots = [...this.fighters.values()].filter((f) => f.kind === 'bot');
        const deadBot = bots.find((f) => !f.alive && f.id !== this.championId);
        const victim = deadBot || bots.filter((f) => f.id !== this.championId).sort((a, b) => a.hp - b.hp)[0];
        if (victim && (deadBot || [...this.fighters.values()].filter((f) => f.alive).length > 2)) {
          this.fighters.delete(victim.id);
        } else {
          return false;
        }
      }
      this.spawnFighter(profile, this.freeSpawnSlot());
      this.pushFeed({
        type: 'join',
        icon: '⚔️',
        color: profile.color,
        user: profile.nickname,
        text: 'arenaya girdi',
      });
      return true;
    }
    return false;
  }

  freeSpawnSlot() {
    return randInt(0, this.roundSize - 1);
  }

  /* ------------------------------------------------------------------ */
  /* Raunt akisi                                                         */
  /* ------------------------------------------------------------------ */

  startRound(round, silent = false) {
    this.round = round;
    this.phase = PHASE.BATTLE;
    this.phaseTime = 0;
    this.timeLeft = Number(this.settings.roundSeconds) || 110;
    this.roundStartClock = this.clock;
    this.pending.length = 0;
    this.fighters.clear();
    this.stats.rounds = Math.max(this.stats.rounds, round);

    const picks = [];
    const champion = this.championId ? this.roster.get(this.championId) : null;
    if (champion) picks.push(champion);

    const players = [...this.roster.values()]
      .filter((p) => p.kind === 'player' && p !== champion)
      .sort((a, b) => b.lastActive - a.lastActive);
    for (const p of players) {
      if (picks.length >= this.roundSize - 1) break;
      picks.push(p);
    }

    // Kalan yerleri botlarla doldur (en az 8 bot olsun ki arena canli kalsin).
    let guard = 0;
    while (picks.length < this.roundSize && guard++ < 100) {
      const bot = this.makeBot();
      picks.push(bot);
    }
    while (picks.length > this.roundSize) picks.pop();

    const slots = this.shuffleSlots(picks.length);
    picks.forEach((profile, i) => this.spawnFighter(profile, slots[i]));

    if (!silent) {
      this.pushFeed({
        type: 'round',
        icon: '🏁',
        text: `ROUND ${round} başladı · ${picks.length} savaşçı arenada`,
        color: '#93c5fd',
      });
      this.emit('roundStart', {
        round,
        fighters: picks.map((p) => ({ id: p.id, nickname: p.nickname, color: p.color })),
      });
    }

    if (!this.settings.autoStart) this.phase = PHASE.ROUND_END;
  }

  makeBot() {
    const profile = createBotProfile(this.round, this.botNames);
    profile.id = `bot:${++this.botSeq}`;
    profile.color = colorFromId(profile.id + profile.nickname);
    this.botNames.add(profile.nickname);
    this.roster.set(profile.id, profile);
    return profile;
  }

  shuffleSlots(count) {
    const slots = Array.from({ length: count }, (_, i) => i);
    for (let i = slots.length - 1; i > 0; i--) {
      const j = randInt(0, i);
      [slots[i], slots[j]] = [slots[j], slots[i]];
    }
    return slots;
  }

  spawnFighter(profile, slot = 0) {
    const total = Math.max(this.roundSize, 8);
    const angle = (slot / total) * TAU + rand(-0.16, 0.16);
    const radius = rand(0.56, 0.8);
    const seed = hashString(profile.id) % 1000;
    const maxHp = 180;
    const fighter = {
      id: profile.id,
      profileId: profile.id,
      name: profile.nickname,
      kind: profile.kind,
      color: profile.color,
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
      vx: 0,
      vy: 0,
      hp: maxHp,
      maxHp,
      power: profile.power || 1,
      alive: true,
      state: 'idle',
      facing: 1,
      cd: rand(0.2, 0.9),
      retarget: 0,
      invuln: 1.2,
      swing: 0,
      hurt: 0,
      bubble: null,
      bubbleUntil: 0,
      healCd: 0,
      kills: 0,
      damage: 0,
      seed,
      hitStun: 0,
      targetId: null,
      spawnAt: this.clock,
    };
    this.fighters.set(fighter.id, fighter);
    return fighter;
  }

  endRound(reason = 'elimination') {
    if (this.phase !== PHASE.BATTLE) return;
    const all = [...this.fighters.values()];
    const alive = all.filter((f) => f.alive);
    let winner = alive[0];
    if (!winner) {
      winner = all.sort((a, b) => b.damage - a.damage)[0];
    }
    if (!winner) return;

    winner.alive = true;
    winner.state = 'celebrate';
    winner.hp = Math.max(1, winner.hp);
    this.championId = winner.id;

    const profile = this.roster.get(winner.id);
    let championPayload = null;
    if (profile) {
      const isRepeat = profile.streak > 0;
      profile.wins += 1;
      profile.streak = isRepeat ? profile.streak + 1 : 1;
      const before = profile.power || 1;
      profile.power = Math.min(
        Number(this.settings.maxPower) || 8,
        Math.round(before * (Number(this.settings.winMultiplier) || 1.1) * 100) / 100
      );
      championPayload = {
        id: profile.id,
        nickname: profile.nickname,
        color: profile.color,
        kind: profile.kind,
        wins: profile.wins,
        streak: profile.streak,
        power: profile.power,
        multiplier: profile.power,
        reason,
      };
    }

    this.phase = PHASE.ROUND_END;
    this.phaseTime = 0;
    this.timeLeft = 0;
    this.lastRoundReason = reason;
    this.pending.length = 0;

    this.pushFeed({
      type: 'champion',
      icon: '🏆',
      color: '#fbbf24',
      user: winner.name,
      text: `ROUND ${this.round} şampiyonu! Güç ×${(profile?.power || winner.power).toFixed(2)}`,
      big: true,
    });

    this.emit('roundEnd', {
      round: this.round,
      champion: championPayload || { id: winner.id, nickname: winner.name, color: winner.color },
      reason,
      nextIn: Number(this.settings.intermissionSeconds) || 7,
    });
  }

  /* ------------------------------------------------------------------ */
  /* TikTok olaylari                                                     */
  /* ------------------------------------------------------------------ */

  handleChat(user, rawText) {
    const profile = this.playerProfile(user);
    if (!profile) return;
    const text = cleanChat(rawText, 90);
    if (!text) return;

    this.stats.chats += 1;
    const fighter = this.fighters.get(profile.id);
    if (fighter) {
      fighter.bubble = { text, until: this.clock + 6 };
      fighter.bubbleUntil = this.clock + 6;
    }

    const now = Date.now();
    const last = this.lastChatAt.get(profile.id) || 0;
    if (now - last > 2500) {
      this.lastChatAt.set(profile.id, now);
      this.pushFeed({
        type: 'chat',
        icon: '💬',
        color: profile.color,
        user: profile.nickname,
        text,
      });
    }

    if (this.settings.joinOnChat) this.ensureInArena(profile);
    this.emit('chat', { id: profile.id, nickname: profile.nickname, text, color: profile.color });
  }

  /**
   * TikTok hediye mesajini isler. Ayni hediye serisinde (streak) sadece
   * yeni gelen adetler kadar yetenek tetiklenir.
   */
  handleGift(user, gift = {}) {
    const profile = this.playerProfile(user);
    if (!profile) return;

    const classified = classifyGift(
      { name: gift.name, coins: gift.coins, diamonds: gift.diamonds },
      this.settings
    );
    const { ability } = classified;

    const coins = Math.max(0, Number(gift.coins) || classified.coins || 1);
    const diamonds = Math.max(0, Number(gift.diamonds) || classified.diamonds || 0);
    const totalUnits = Math.max(1, Number(gift.units) || 1);
    const units = clamp(totalUnits, 1, 12);

    this.stats.gifts += units;
    this.stats.diamonds += diamonds * units;
    profile.gifts += units;
    profile.diamonds += diamonds * units;
    this.gifterDiamonds.set(
      profile.id,
      (this.gifterDiamonds.get(profile.id) || 0) + diamonds * units
    );

    const giftText =
      normalizeGiftName(classified.name) === normalizeGiftName(ability.name)
        ? ability.name
        : `${classified.name} → ${ability.name}`;
    this.pushFeed({
      type: 'gift',
      icon: ability.icon,
      color: ability.color,
      user: profile.nickname,
      text: `${totalUnits > 1 ? `×${totalUnits} ` : ''}${giftText}`,
      gift: classified.name,
      ability: ability.key,
      coins,
    });

    this.emit('announce', {
      id: profile.id,
      nickname: profile.nickname,
      color: profile.color,
      giftName: classified.name,
      ability: ability.key,
      abilityName: ability.name,
      abilityIcon: ability.icon,
      abilityColor: ability.color,
      coins,
      units: totalUnits,
      diamonds,
    });

    const inArena = this.ensureInArena(profile);
    if (!inArena && this.phase === PHASE.BATTLE) {
      this.pushFeed({
        type: 'queue',
        icon: '⏳',
        color: '#94a3b8',
        user: profile.nickname,
        text: 'sıradaki raunt için hazır',
      });
      return;
    }

    // Hediyeleri kucuk araliklarla uygula ki animasyonlar ust uste binmesin.
    for (let i = 0; i < units; i++) {
      this.pending.push({
        at: this.clock + i * 0.14,
        profileId: profile.id,
        abilityKey: ability.key,
        gift: { name: classified.name, coins, diamonds },
      });
    }
    if (this.pending.length > 90) this.pending.splice(0, this.pending.length - 90);
  }

  /* ------------------------------------------------------------------ */
  /* Yetenekler                                                          */
  /* ------------------------------------------------------------------ */

  processPending() {
    while (this.pending.length && this.pending[0].at <= this.clock) {
      const item = this.pending.shift();
      this.executeCast(item.profileId, item.abilityKey, item.gift);
    }
    this.pending = this.pending.filter((p) => p.at > this.clock - 2);
  }

  executeCast(profileId, abilityKey, gift) {
    const ability = ABILITIES[abilityKey];
    if (!ability) return;
    const profile = this.roster.get(profileId);
    let fighter = this.fighters.get(profileId);
    if (!profile) return;

    if (!fighter) {
      if (!this.ensureInArena(profile)) return;
      fighter = this.fighters.get(profileId);
    }
    if (!fighter) return;

    if (!fighter.alive) {
      const pct = ability.key === 'revive' ? ability.reviveHp || 0.55 : 0.35;
      this.reviveFighter(fighter, pct, 'gift');
      if (ability.key === 'revive') return;
    }

    if (ability.key === 'revive') {
      if (fighter.healCd > 0) return;
      const heal = Math.round(fighter.maxHp * (ability.heal || 0.22));
      const before = fighter.hp;
      fighter.hp = Math.min(fighter.maxHp, fighter.hp + heal);
      fighter.healCd = ability.healCooldown || 5;
      this.emit('fx', {
        type: 'heal',
        x: fighter.x,
        y: fighter.y,
        amount: fighter.hp - before,
        caster: { x: fighter.x, y: fighter.y },
        color: ability.color,
      });
      return;
    }

    const targets = this.pickAbilityTargets(fighter, ability);
    if (!targets.length) return;

    const rage = this.rageMultiplier();
    if (ability.buff) {
      fighter.power = Math.min(
        Number(this.settings.maxPower) || 8,
        Math.round(fighter.power * ability.buff * 100) / 100
      );
      const p = this.roster.get(fighter.id);
      if (p) p.power = Math.max(p.power, fighter.power);
    }

    this.emit('fx', {
      type: 'cast',
      ability: ability.key,
      abilityName: ability.name,
      color: ability.color,
      icon: ability.icon,
      gift: gift?.name,
      coins: gift?.coins,
      caster: { x: fighter.x, y: fighter.y, id: fighter.id },
      targets: targets.map((t) => ({ x: t.x, y: t.y, id: t.id })),
      impact: targets.impact ? { x: targets.impact.x, y: targets.impact.y } : null,
    });

    const primary = targets[0];
    targets.forEach((target, index) => {
      const crit = Math.random() < 0.12;
      let dmg = ability.damage * fighter.power * rage;
      if (index > 0 && ability.chainDamage) dmg = ability.chainDamage * fighter.power * rage;
      dmg *= rand(0.9, 1.12);
      if (crit) dmg *= 1.5;
      this.damage(target, Math.round(dmg), fighter, {
        ability: ability.key,
        crit,
        knockback: ability.key === 'meteor' || ability.key === 'titan' ? 0.06 : 0.015,
        source: primary,
      });
    });
  }

  pickAbilityTargets(caster, ability) {
    const enemies = [...this.fighters.values()].filter(
      (f) => f.alive && f.id !== caster.id && f.invuln <= 0
    );
    if (!enemies.length) return [];

    const dist2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const sorted = enemies.sort((a, b) => dist2(a, caster) - dist2(b, caster));
    const nearest = sorted[0];

    if (ability.key === 'meteor' || ability.key === 'titan') {
      const radius = ability.radius || 0.34;
      let best = nearest;
      let bestCount = -1;
      for (const candidate of enemies.slice(0, 8)) {
        const count = enemies.filter((e) => dist2(e, candidate) <= radius * radius).length;
        if (count > bestCount) {
          bestCount = count;
          best = candidate;
        }
      }
      const hit = enemies.filter((e) => dist2(e, best) <= radius * radius);
      const result = hit.length ? hit : [best];
      result.impact = { x: best.x, y: best.y };
      return result;
    }

    if (ability.key === 'lightning') {
      const chain = [nearest];
      const rest = enemies.filter((e) => e.id !== nearest.id).sort((a, b) => dist2(a, nearest) - dist2(b, nearest));
      for (const e of rest) {
        if (chain.length >= (ability.targets || 3)) break;
        if (dist2(e, nearest) <= 0.34 * 0.34) chain.push(e);
      }
      return chain;
    }

    return [nearest];
  }

  rageMultiplier() {
    const elapsed = this.clock - this.roundStartClock;
    return 1 + Math.max(0, elapsed - 48) * 0.02;
  }

  damage(target, amount, source, opts = {}) {
    if (!target || !target.alive) return;
    if (target.invuln > 0) return;
    const dmg = Math.max(1, Math.round(amount));
    target.hp -= dmg;
    target.hurt = 1;
    target.hitStun = 0.14;
    if (source) {
      source.damage += dmg;
      const sp = this.roster.get(source.id);
      if (sp) sp.damage = (sp.damage || 0) + dmg;
    }
    if (opts.knockback && source) {
      const dx = target.x - source.x;
      const dy = target.y - source.y;
      const len = Math.hypot(dx, dy) || 1;
      target.vx += (dx / len) * opts.knockback;
      target.vy += (dy / len) * opts.knockback;
    }
    this.emit('fx', {
      type: 'hit',
      x: target.x,
      y: target.y,
      targetId: target.id,
      amount: dmg,
      crit: !!opts.crit,
      ability: opts.ability || 'melee',
      color: source?.color,
    });
    if (target.hp <= 0) this.kill(target, source);
  }

  kill(target, source) {
    if (!target.alive) return;
    target.alive = false;
    target.hp = 0;
    target.state = 'dead';
    target.deadAt = this.clock;
    target.bubble = null;
    this.stats.kos += 1;
    if (source) {
      source.kills += 1;
      const p = this.roster.get(source.id);
      if (p) p.kills += 1;
    }
    const killerName = source?.name || 'Arena';
    this.pushFeed({
      type: 'ko',
      icon: '💀',
      color: source?.color || '#f87171',
      user: killerName,
      text: `${target.name} elendi!`,
    });
    this.emit('fx', {
      type: 'ko',
      x: target.x,
      y: target.y,
      targetId: target.id,
      killer: killerName,
      color: target.color,
    });
    this.emit('ko', { id: target.id, name: target.name, killer: killerName });
  }

  reviveFighter(fighter, pct = 0.55, reason = 'rose') {
    if (!fighter) return;
    const profile = this.roster.get(fighter.id);
    const slot = randInt(0, Math.max(7, this.roundSize - 1));
    const angle = (slot / Math.max(8, this.roundSize)) * TAU;
    const radius = 0.74;
    fighter.alive = true;
    fighter.hp = Math.round(fighter.maxHp * clamp(pct, 0.15, 1));
    fighter.invuln = 2.6;
    fighter.state = 'idle';
    fighter.hitStun = 0;
    fighter.cd = 0.6;
    fighter.healCd = 2;
    fighter.x = Math.cos(angle) * radius;
    fighter.y = Math.sin(angle) * radius;
    fighter.vx = 0;
    fighter.vy = 0;
    if (profile) profile.lastActive = Date.now();
    this.pushFeed({
      type: 'revive',
      icon: '🌹',
      color: '#f9a8d4',
      user: fighter.name,
      text: reason === 'rose' ? 'gül ile dirildi!' : 'hediye ile dirildi!',
    });
    this.emit('fx', {
      type: 'revive',
      x: fighter.x,
      y: fighter.y,
      targetId: fighter.id,
      color: '#f9a8d4',
    });
  }

  /* ------------------------------------------------------------------ */
  /* Simulasyon                                                          */
  /* ------------------------------------------------------------------ */

  tick(dt) {
    dt = clamp(dt, 0, 0.1);
    this.clock += dt;

    if (this.phase === PHASE.BATTLE) {
      this.timeLeft = Math.max(0, (Number(this.settings.roundSeconds) || 110) - (this.clock - this.roundStartClock));
      this.processPending();
      this.updateBubbles();

      const fighters = [...this.fighters.values()];
      for (const f of fighters) this.updateFighter(f, dt);
      this.applySeparation(dt);

      let aliveCount = 0;
      for (const f of this.fighters.values()) if (f.alive) aliveCount++;
      if (aliveCount <= 1) this.endRound('elimination');
      else if (this.timeLeft <= 0) this.endRound('time');
    } else {
      this.phaseTime += dt;
      const winner = this.championId ? this.fighters.get(this.championId) : null;
      if (winner) {
        winner.state = 'celebrate';
        winner.swing = 0.3 + Math.sin(this.clock * 6) * 0.25;
        winner.hurt = 0;
      }
      if (this.phaseTime >= (Number(this.settings.intermissionSeconds) || 7)) {
        this.startRound(this.round + 1);
      }
    }
  }

  updateBubbles() {
    for (const f of this.fighters.values()) {
      if (f.bubble && this.clock >= f.bubble.until) f.bubble = null;
    }
  }

  updateFighter(f, dt) {
    f.cd -= dt;
    f.retarget -= dt;
    f.healCd = Math.max(0, f.healCd - dt);
    f.invuln = Math.max(0, f.invuln - dt);
    f.swing = Math.max(0, f.swing - dt * 4.2);
    f.hurt = Math.max(0, f.hurt - dt * 3.4);
    f.hitStun = Math.max(0, f.hitStun - dt);

    if (!f.alive) {
      f.vx *= 0.9;
      f.vy *= 0.9;
      return;
    }

    let target = f.targetId ? this.fighters.get(f.targetId) : null;
    if (!target || !target.alive || f.retarget <= 0) {
      target = this.findTarget(f);
      f.targetId = target ? target.id : null;
      f.retarget = rand(0.55, 1.1);
    }
    if (!target) {
      f.state = 'idle';
      return;
    }

    const dx = target.x - f.x;
    const dy = target.y - f.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    const nx = dx / dist;
    const ny = dy / dist;

    const range = f.kind === 'player' ? 0.088 : 0.084;
    const speed = (f.kind === 'player' ? 0.175 : 0.165) * (1 + Math.min(0.45, (f.power - 1) * 0.08));

    let mx = 0;
    let my = 0;
    if (dist > range * 0.92) {
      mx += nx;
      my += ny;
    } else if (dist < range * 0.55) {
      mx -= nx * 0.9;
      my -= ny * 0.9;
    }

    // Etrafinda donerek daha canli bir savas goruntusu olustur.
    const strafe = Math.sin(this.clock * (0.7 + (f.seed % 100) / 180) + f.seed) * 0.55;
    mx += -ny * strafe;
    my += nx * strafe;

    const len = Math.hypot(mx, my) || 1;
    f.vx += ((mx / len) * speed - f.vx) * Math.min(1, dt * 7);
    f.vy += ((my / len) * speed - f.vy) * Math.min(1, dt * 7);

    if (f.hitStun > 0) {
      f.vx *= 0.55;
      f.vy *= 0.55;
    }

    f.x += f.vx * dt;
    f.y += f.vy * dt;

    // Arena siniri
    const r = Math.hypot(f.x, f.y);
    if (r > 0.93) {
      f.x = (f.x / r) * 0.93;
      f.y = (f.y / r) * 0.93;
      f.vx *= 0.4;
      f.vy *= 0.4;
    }

    if (Math.abs(f.vx) > 0.012) f.facing = f.vx > 0 ? 1 : -1;

    if (dist < range * 1.12 && f.cd <= 0 && f.hitStun <= 0) {
      this.meleeAttack(f, target);
      f.cd = (f.kind === 'bot' ? rand(1.15, 1.75) : rand(1.0, 1.4)) / Math.max(0.7, f.power * 0.5 + 0.5);
    }

    const moving = Math.hypot(f.vx, f.vy) > 0.025;
    f.state = f.hitStun > 0 ? 'hit' : moving ? 'run' : 'idle';
  }

  meleeAttack(f, target) {
    const base = f.kind === 'player' ? rand(6, 9) : rand(5, 7.5);
    const dmg = base * f.power * this.rageMultiplier() * (f.kind === 'bot' ? f.aggression || 1 : 1);
    f.swing = 1;
    f.facing = target.x >= f.x ? 1 : -1;
    this.emit('fx', {
      type: 'melee',
      x: f.x,
      y: f.y,
      color: f.color,
      caster: { x: f.x, y: f.y },
      target: { x: target.x, y: target.y },
    });
    this.damage(target, Math.round(dmg), f, { ability: 'melee' });
  }

  findTarget(f) {
    let best = null;
    let bestScore = Infinity;
    const preferPlayers = f.kind === 'player';
    for (const other of this.fighters.values()) {
      if (!other.alive || other.id === f.id) continue;
      const d2 = (other.x - f.x) ** 2 + (other.y - f.y) ** 2;
      let score = d2;
      if (preferPlayers && other.kind === 'player') score *= 0.72;
      if (other.invuln > 0) score *= 1.6;
      score += Math.random() * 0.02;
      if (score < bestScore) {
        bestScore = score;
        best = other;
      }
    }
    return best;
  }

  applySeparation(dt) {
    const fighters = [...this.fighters.values()].filter((f) => f.alive);
    const minDist = 0.082;
    for (let i = 0; i < fighters.length; i++) {
      for (let j = i + 1; j < fighters.length; j++) {
        const a = fighters[i];
        const b = fighters[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d > 0 && d < minDist) {
          const push = ((minDist - d) / d) * 0.5;
          dx *= push;
          dy *= push;
          a.x -= dx * dt * 10;
          a.y -= dy * dt * 10;
          b.x += dx * dt * 10;
          b.y += dy * dt * 10;
        }
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Feed / snapshot                                                     */
  /* ------------------------------------------------------------------ */

  pushFeed(entry) {
    const item = {
      id: ++this.feedSeq,
      ts: Date.now(),
      ...entry,
    };
    this.feed.unshift(item);
    if (this.feed.length > 70) this.feed.length = 70;
    this.emit('feed', item);
    return item;
  }

  getChampion() {
    if (!this.championId) return null;
    const f = this.fighters.get(this.championId);
    const p = this.roster.get(this.championId);
    if (!f && !p) return null;
    return {
      id: this.championId,
      nickname: f?.name || p?.nickname || '?',
      color: f?.color || p?.color || '#fbbf24',
      power: p?.power || f?.power || 1,
      wins: p?.wins || 0,
      streak: p?.streak || 0,
    };
  }

  getQueued() {
    return [...this.roster.values()]
      .filter((p) => p.kind === 'player' && !this.fighters.has(p.id))
      .sort((a, b) => b.lastActive - a.lastActive)
      .slice(0, 12)
      .map((p) => ({ id: p.id, nickname: p.nickname, color: p.color }));
  }

  getLeaders() {
    const gifters = [...this.gifterDiamonds.entries()]
      .map(([id, diamonds]) => {
        const p = this.roster.get(id);
        return { id, nickname: p?.nickname || '?', color: p?.color || '#94a3b8', diamonds };
      })
      .sort((a, b) => b.diamonds - a.diamonds)
      .slice(0, 5);

    const fighters = [...this.roster.values()]
      .filter((p) => p.kind === 'player' || p.wins > 0)
      .sort((a, b) => b.wins - a.wins || b.kills - a.kills)
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        nickname: p.nickname,
        color: p.color,
        wins: p.wins,
        kills: p.kills,
        power: p.power,
        kind: p.kind,
      }));

    return { gifters, fighters };
  }

  getSnapshot() {
    const fighters = [];
    let aliveCount = 0;
    for (const f of this.fighters.values()) {
      if (f.alive) aliveCount++;
      fighters.push({
        id: f.id,
        n: f.name,
        k: f.kind,
        c: f.color,
        x: Math.round(f.x * 1000) / 1000,
        y: Math.round(f.y * 1000) / 1000,
        hp: Math.max(0, Math.round(f.hp)),
        mhp: f.maxHp,
        pw: Math.round(f.power * 100) / 100,
        al: f.alive ? 1 : 0,
        st: f.state,
        f: f.facing,
        sw: Math.round(f.swing * 100) / 100,
        hu: Math.round(f.hurt * 100) / 100,
        iv: f.invuln > 0 ? 1 : 0,
        bub: f.bubble ? { t: f.bubble.text, ms: Math.max(0, Math.round((f.bubble.until - this.clock) * 1000)) } : null,
        w: this.roster.get(f.id)?.wins || 0,
        sk: this.roster.get(f.id)?.streak || 0,
      });
    }

    return {
      clock: Math.round(this.clock * 100) / 100,
      phase: this.phase,
      round: this.round,
      roundSeconds: Number(this.settings.roundSeconds) || 110,
      timeLeft: Math.max(0, Math.round(this.timeLeft * 10) / 10),
      intermissionLeft:
        this.phase === PHASE.ROUND_END
          ? Math.max(0, Math.round(((Number(this.settings.intermissionSeconds) || 7) - this.phaseTime) * 10) / 10)
          : 0,
      aliveCount,
      totalFighters: this.fighters.size,
      lastRoundReason: this.lastRoundReason,
      champion: this.getChampion(),
      queued: this.getQueued(),
      stats: { ...this.stats, viewers: this.stats.viewers },
      leaders: this.getLeaders(),
      fighters,
    };
  }

  resetForNewStream(username = '') {
    this.roster.clear();
    this.fighters.clear();
    this.pending.length = 0;
    this.gifterDiamonds.clear();
    this.lastChatAt.clear();
    this.championId = null;
    this.lastRoundReason = null;
    this.round = 0;
    this.stats = {
      gifts: 0,
      diamonds: 0,
      joins: 0,
      kos: 0,
      viewers: 0,
      likes: 0,
      chats: 0,
      rounds: 0,
    };
    this.feed.length = 0;
    this.feedSeq = 0;
    this.startRound(1, true);
    this.pushFeed({
      type: 'system',
      icon: '🔄',
      color: '#93c5fd',
      text: username ? `Yeni yayın: @${username} · arena sıfırlandı` : 'Yeni yayın oturumu · arena sıfırlandı',
    });
  }

  setSettings(next = {}) {
    const merged = { ...this.settings, ...next };
    merged.thresholds = { ...this.settings.thresholds, ...(next.thresholds || {}) };
    if (Array.isArray(next.reviveGifts)) merged.reviveGifts = next.reviveGifts;
    this.settings = merged;
    this.timeLeft = Math.min(this.timeLeft, Number(this.settings.roundSeconds) || 110);
  }
}

module.exports = { ArenaEngine, PHASE, defaultSettings, ROUND_SIZE };
