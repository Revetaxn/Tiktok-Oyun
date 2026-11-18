'use strict';

const { randomChatLine } = require('./game/bots');
const { rand, randInt, pick, colorFromId, cleanNickname } = require('./game/util');

const DEMO_NAMES = [
  'ayse_tt', 'mertcan', 'zeynep.k', 'burak07', 'elif_34', 'kaan61', 'deniz_06',
  'selin', 'emirhan', 'adax', 'sudenaz', 'ozan_yt', 'ipek', 'tuna99', 'duru',
  'ege_35', 'nazli', 'ardas', 'yagmur', 'kerem', 'mira', 'alperen', 'ece',
  'sarp', 'melis', 'yigit', 'azra', 'cem', 'nehir', 'kuzey', 'aysu', 'onur',
  'lara', 'dogukan', 'buse', 'ilayda', 'meric', 'pelin', 'serkan', 'tugba',
];

const GIFTS = [
  { name: 'Rose', coins: 1 },
  { name: 'TikTok', coins: 1 },
  { name: 'Ice Cream Cone', coins: 1 },
  { name: 'Finger Heart', coins: 5 },
  { name: 'Hand Hearts', coins: 9 },
  { name: 'Doughnut', coins: 30 },
  { name: 'Confetti', coins: 20 },
  { name: 'Lightning Bolt', coins: 15 },
  { name: 'Meteor Shower', coins: 100 },
  { name: 'Lion', coins: 500 },
  { name: 'Galaxy', coins: 1000 },
];

class DemoStream {
  constructor(engine) {
    this.engine = engine;
    this.timer = null;
    this.running = false;
    this.users = DEMO_NAMES.map((name, i) => ({
      uniqueId: `demo_${i + 1}`,
      nickname: cleanNickname(name),
      color: colorFromId(`demo_${i + 1}`),
      joined: false,
    }));
    this.tickMs = 2400;
  }

  get activeUsers() {
    return this.users.filter((u) => u.joined);
  }

  start() {
    if (this.running) return;
    this.running = true;
    // Ilk anda birkaç izleyiciyi arenaya al.
    for (let i = 0; i < 8; i++) this.join(pick(this.users));
    this.loop();
  }

  stop() {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  loop() {
    if (!this.running) return;
    this.step();
    this.tickMs = randInt(1600, 3200);
    this.timer = setTimeout(() => this.loop(), this.tickMs);
    if (this.timer.unref) this.timer.unref();
  }

  step() {
    const engine = this.engine;
    engine.stats.viewers = randInt(850, 2600);
    engine.stats.likes += randInt(1, 9);

    const roll = Math.random();
    if (roll < 0.56) {
      const user = pick(this.users);
      this.join(user);
      const text = randomChatLine();
      engine.handleChat(user, text);
    } else if (roll < 0.87) {
      const user = pick(this.users);
      this.join(user);
      this.sendGift(user);
    } else if (roll < 0.95) {
      this.join(pick(this.users));
    } else {
      engine.stats.viewers += randInt(5, 80);
    }
  }

  join(user) {
    if (!user) return;
    if (!user.joined) {
      user.joined = true;
      const profile = this.engine.playerProfile(user);
      this.engine.ensureInArena(profile);
    }
  }

  sendGift(user) {
    if (!user) return;
    const gift = this.randomGift();
    const units = gift.coins < 5 ? (Math.random() < 0.25 ? randInt(2, 6) : 1) : 1;
    this.engine.handleGift(user, {
      name: gift.name,
      coins: gift.coins,
      diamonds: Math.max(1, Math.round(gift.coins / 2)),
      units,
    });
  }

  randomGift() {
    const roll = Math.random();
    if (roll < 0.34) return GIFTS[0]; // Rose
    if (roll < 0.58) return pick([GIFTS[1], GIFTS[2]]);
    if (roll < 0.78) return pick([GIFTS[3], GIFTS[4]]);
    if (roll < 0.9) return pick([GIFTS[5], GIFTS[6], GIFTS[7]]);
    if (roll < 0.98) return GIFTS[8];
    return pick([GIFTS[9], GIFTS[10]]);
  }
}

module.exports = { DemoStream, DEMO_NAMES, GIFTS };
