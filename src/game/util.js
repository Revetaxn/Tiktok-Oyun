'use strict';

const TAU = Math.PI * 2;

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

function randInt(min, max) {
  return Math.floor(rand(min, max + 1));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLORS = [
  '#38bdf8', '#a78bfa', '#f472b6', '#fbbf24', '#34d399',
  '#fb7185', '#22d3ee', '#c084fc', '#facc15', '#4ade80',
  '#60a5fa', '#f97316', '#e879f9', '#2dd4bf', '#fda4af', '#a3e635',
];

function colorFromId(id) {
  const h = hashString(String(id));
  return COLORS[h % COLORS.length];
}

function cleanNickname(name, fallback = 'izleyici') {
  let s = String(name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  s = s.replace(/\s+/g, ' ');
  if (!s) s = fallback;
  return s.slice(0, 22);
}

function cleanChat(text, max = 90) {
  let s = String(text || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.slice(0, max);
}

function foldTurkish(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/â/g, 'a')
    .replace(/î/g, 'i');
}

function formatNumber(n) {
  const num = Number(n) || 0;
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1).replace('.0', '') + 'M';
  if (num >= 10_000) return (num / 1000).toFixed(1).replace('.0', '') + 'B';
  return new Intl.NumberFormat('tr-TR').format(Math.round(num));
}

module.exports = {
  TAU,
  clamp,
  lerp,
  rand,
  randInt,
  pick,
  shuffle,
  hashString,
  mulberry32,
  colorFromId,
  cleanNickname,
  cleanChat,
  foldTurkish,
  formatNumber,
};
