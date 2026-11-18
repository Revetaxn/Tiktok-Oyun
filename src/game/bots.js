'use strict';

const { pick, rand, randInt, colorFromId, cleanNickname } = require('./util');

const NAMES = [
  'Kaan', 'Elif', 'Mert', 'Zeynep', 'Burak', 'Ada', 'Emir', 'Selin',
  'Can', 'Derya', 'Ege', 'Naz', 'Arda', 'Yağmur', 'Kerem', 'İpek',
  'Deniz', 'Sude', 'Alp', 'Lina', 'Ozan', 'Mira', 'Bora', 'Aylin',
  'Eren', 'Duru', 'Tuna', 'Melis', 'Sarp', 'Ece', 'Yiğit', 'Nil',
  'Umut', 'Azra', 'Cem', 'Nehir', 'Kuzey', 'Aysu', 'Onur', 'Lara',
];

const TAGS = ['', '', '', '', '', '_tt', '07', '34', '_x', '61', '_yt', '99', '06', '_live'];

const CHAT_LINES = [
  'hadi be', 'gg', 'meteor at', 'yıldırım geliyor', 'bu nasıl oyun',
  'toprak abi selam', 'beni de al', 'gg wp', 'az kaldı', 'vur vur',
  'arkadan geliyor', 'dikkat et', 'kalp at', 'gül atıyorum', 'hile var',
  'bu bot çok güçlü', 'round kaç oldu', 'şampiyon benim', 'yenildim yine',
  'kaç hp kaldı', 'elmas vur', 'off be', 'tam zamanında', 'izliyoruz',
  'abi bağlantı süper', 'arena çok iyi', 'ben de oynamak istiyorum',
  'canlandır beni', 'gül gül gül', 'meteorrr', 'yıldırım atın ona',
  'sa', 'selamlar', 'kolay gelsin', 'bu nasıl vuruş', 'tek yedin',
  'kim kazanacak', 'son 3 kişi', 'helal olsun', 'yeniden başladım',
  'hadi kazan', 'çöp adam savaşı', 'efsane', 'çok hızlı',
];

function makeNickname(used) {
  for (let i = 0; i < 40; i++) {
    const name = pick(NAMES) + pick(TAGS);
    if (!used || !used.has(name)) {
      used && used.add(name);
      return name.slice(0, 22);
    }
  }
  return 'Bot' + randInt(100, 999);
}

let botSeq = 0;

function createBotProfile(round, usedNames) {
  botSeq += 1;
  const nickname = cleanNickname(makeNickname(usedNames));
  const id = `bot:${botSeq}`;
  const skill = rand(0.94, 1.04) + Math.min(0.3, (round - 1) * 0.015);
  return {
    id,
    kind: 'bot',
    uniqueId: null,
    nickname,
    color: colorFromId(id + nickname),
    power: Number(skill.toFixed(2)),
    wins: 0,
    streak: 0,
    kills: 0,
    diamonds: 0,
    gifts: 0,
    joinedAt: Date.now(),
    lastActive: Date.now(),
    skill: rand(0.6, 1),
    aggression: rand(0.7, 1.15),
  };
}

function randomChatLine() {
  return pick(CHAT_LINES);
}

module.exports = { NAMES, createBotProfile, randomChatLine, makeNickname };
