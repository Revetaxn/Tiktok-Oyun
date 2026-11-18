'use strict';

const { foldTurkish } = require('./util');

/**
 * Hediye -> yetenek tablosu.
 * Esik degerleri "jeton" (coin) uzerinden calisir. TikTok hediye listesinde
 * maliyet bilgisi yoksa elmas sayisi jeton kabul edilir.
 */
const ABILITIES = {
  punch: {
    key: 'punch',
    name: 'Düz Vuruş',
    short: 'VURUŞ',
    icon: '👊',
    color: '#7dd3fc',
    minCoins: 1,
    damage: 22,
    targets: 1,
    desc: 'Hedefe hızlı bir yumruk.',
  },
  diamond: {
    key: 'diamond',
    name: 'Elmas Vuruş',
    short: 'ELMAS',
    icon: '💎',
    color: '#67e8f9',
    minCoins: 5,
    damage: 38,
    targets: 1,
    desc: 'Keskin elmas darbesi.',
  },
  lightning: {
    key: 'lightning',
    name: 'Yıldırım',
    short: 'YILDIRIM',
    icon: '⚡',
    color: '#fde047',
    minCoins: 10,
    damage: 52,
    chain: 2,
    chainDamage: 22,
    targets: 3,
    desc: 'Ana hedefe yıldırım, yakındakilere zincirleme hasar.',
  },
  meteor: {
    key: 'meteor',
    name: 'Meteor',
    short: 'METEOR',
    icon: '☄️',
    color: '#fb923c',
    minCoins: 50,
    damage: 68,
    radius: 0.34,
    targets: 16,
    desc: 'Arenaya meteor düşürür, alan hasarı verir.',
  },
  titan: {
    key: 'titan',
    name: 'Titan Modu',
    short: 'TITAN',
    icon: '🦁',
    color: '#f472b6',
    minCoins: 1000,
    damage: 85,
    radius: 0.4,
    buff: 1.4,
    targets: 16,
    desc: 'Dev hediye: kalıcı güç artışı + dev alan hasarı.',
  },
  revive: {
    key: 'revive',
    name: 'Diriliş',
    short: 'DİRİLİŞ',
    icon: '🌹',
    color: '#f9a8d4',
    minCoins: 1,
    heal: 0.22,
    healCooldown: 5,
    reviveHp: 0.55,
    desc: 'Öldüysen seni diriltir, yaşıyorsan canını doldurur.',
  },
};

const DEFAULT_REVIVE_GIFTS = [
  'rose', 'gül', 'gul', 'tiktok', 'tik tok', 'rose gift',
];

function normalizeGiftName(name) {
  return foldTurkish(name).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * @param {{name?:string, coins?:number, diamonds?:number}} gift
 * @param {{thresholds?:object, reviveGifts?:string[]}} settings
 */
function classifyGift(gift, settings = {}) {
  const name = String(gift.name || 'Hediye');
  const folded = normalizeGiftName(name);
  const thresholds = {
    diamond: 5,
    lightning: 10,
    meteor: 50,
    titan: 1000,
    ...(settings.thresholds || {}),
  };
  const reviveGifts = (settings.reviveGifts && settings.reviveGifts.length
    ? settings.reviveGifts
    : DEFAULT_REVIVE_GIFTS
  ).map(normalizeGiftName);

  const coins = Math.max(1, Math.round(Number(gift.coins) || Number(gift.diamonds) || 1));
  const diamonds = Math.max(0, Math.round(Number(gift.diamonds) || 0));

  if (reviveGifts.some((x) => x && (folded === x || folded.includes(x)))) {
    return { ability: ABILITIES.revive, coins, diamonds, name };
  }
  if (coins >= thresholds.titan) return { ability: ABILITIES.titan, coins, diamonds, name };
  if (coins >= thresholds.meteor) return { ability: ABILITIES.meteor, coins, diamonds, name };
  if (coins >= thresholds.lightning) return { ability: ABILITIES.lightning, coins, diamonds, name };
  if (coins >= thresholds.diamond) return { ability: ABILITIES.diamond, coins, diamonds, name };
  return { ability: ABILITIES.punch, coins, diamonds, name };
}

function publicAbilityTable(settings) {
  const t = { diamond: 5, lightning: 10, meteor: 50, titan: 1000, ...(settings.thresholds || {}) };
  return [
    { ...ABILITIES.punch, from: 1, to: t.diamond - 1 },
    { ...ABILITIES.diamond, from: t.diamond, to: t.lightning - 1 },
    { ...ABILITIES.lightning, from: t.lightning, to: t.meteor - 1 },
    { ...ABILITIES.meteor, from: t.meteor, to: t.titan - 1 },
    { ...ABILITIES.titan, from: t.titan, to: null },
    { ...ABILITIES.revive, from: 1, to: null, special: true },
  ];
}

module.exports = {
  ABILITIES,
  DEFAULT_REVIVE_GIFTS,
  classifyGift,
  publicAbilityTable,
  normalizeGiftName,
};
