'use strict';

require('dotenv').config();

const path = require('node:path');
const http = require('node:http');
const express = require('express');
const { Server } = require('socket.io');

const { readSettings, saveSettings } = require('./src/config');
const { ArenaEngine } = require('./src/game/engine');
const { publicAbilityTable } = require('./src/game/abilities');
const { TikTokManager, normalizeUsername } = require('./src/tiktok');
const { DemoStream } = require('./src/demo');
const { cleanNickname } = require('./src/game/util');

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

const settings = readSettings();
const engine = new ArenaEngine(settings);
const tiktok = new TikTokManager();
const demo = new DemoStream(engine);

const app = express();
app.use(express.json({ limit: '64kb' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  serveClient: true,
});

function abilitiesPayload() {
  return publicAbilityTable(engine.settings);
}

function connectionPayload() {
  return tiktok.getStatus();
}

function publicSettings() {
  return {
    ...engine.settings,
    abilities: abilitiesPayload(),
  };
}

function bootstrapPayload() {
  return {
    snapshot: engine.getSnapshot(),
    feed: engine.feed.slice(0, 40),
    settings: publicSettings(),
    connection: connectionPayload(),
    demo: demo.running,
    serverTime: Date.now(),
  };
}

/* -------------------------------------------------------------------------- */
/* HTTP API                                                                   */
/* -------------------------------------------------------------------------- */

app.get('/api/status', (req, res) => {
  res.json({
    connection: connectionPayload(),
    settings: publicSettings(),
    demo: demo.running,
    snapshot: engine.getSnapshot(),
    feed: engine.feed.slice(0, 25),
    uptime: process.uptime(),
  });
});

app.post('/api/connect', async (req, res) => {
  const username = normalizeUsername(req.body?.username || engine.settings.defaultUsername);
  if (!username) {
    return res.status(400).json({ ok: false, error: 'Kullanıcı adı gerekli.' });
  }
  try {
    const status = await tiktok.connect(username);
    if (demo.running) setDemo(false, { silent: true });
    res.json({ ok: true, connection: status });
  } catch (err) {
    res.status(502).json({ ok: false, error: String(err.message || err), connection: connectionPayload() });
  }
});

app.post('/api/disconnect', async (req, res) => {
  await tiktok.disconnect();
  res.json({ ok: true, connection: connectionPayload() });
});

app.post('/api/demo', (req, res) => {
  const enabled = !!req.body?.enabled;
  setDemo(enabled);
  res.json({ ok: true, demo: demo.running });
});

function setDemo(enabled, { silent = false } = {}) {
  if (enabled && !demo.running) {
    demo.start();
    if (!silent) engine.pushFeed({ type: 'system', icon: '🧪', text: 'Demo akışı başlatıldı', color: '#a3e635' });
  } else if (!enabled && demo.running) {
    demo.stop();
    if (!silent) engine.pushFeed({ type: 'system', icon: '🧪', text: 'Demo akışı durduruldu', color: '#94a3b8' });
  }
  io.emit('demo', { enabled: demo.running });
}

app.post('/api/settings', (req, res) => {
  const body = req.body || {};
  const patch = {};
  const numericKeys = ['roundSeconds', 'intermissionSeconds', 'roundSize', 'winMultiplier', 'maxPower'];
  for (const key of numericKeys) {
    if (body[key] !== undefined && Number.isFinite(Number(body[key]))) patch[key] = Number(body[key]);
  }
  if (patch.roundSeconds) patch.roundSeconds = Math.min(600, Math.max(25, patch.roundSeconds));
  if (patch.intermissionSeconds) {
    patch.intermissionSeconds = Math.min(60, Math.max(2, patch.intermissionSeconds));
  }
  if (patch.roundSize) patch.roundSize = Math.min(24, Math.max(4, patch.roundSize));
  if (patch.winMultiplier) patch.winMultiplier = Math.min(2, Math.max(1, patch.winMultiplier));
  if (patch.maxPower) patch.maxPower = Math.min(50, Math.max(1, patch.maxPower));
  if (typeof body.joinOnChat === 'boolean') patch.joinOnChat = body.joinOnChat;
  if (typeof body.joinOnGift === 'boolean') patch.joinOnGift = body.joinOnGift;
  if (typeof body.demo === 'boolean') {
    setDemo(body.demo);
    settings.demo = body.demo;
  }
  if (body.thresholds && typeof body.thresholds === 'object') {
    const t = {};
    for (const key of ['diamond', 'lightning', 'meteor', 'titan']) {
      const val = Number(body.thresholds[key]);
      if (Number.isFinite(val) && val > 0) t[key] = Math.round(val);
    }
    patch.thresholds = { ...engine.settings.thresholds, ...t };
  }
  if (Array.isArray(body.reviveGifts)) {
    patch.reviveGifts = body.reviveGifts
      .map((s) => String(s || '').trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  }
  if (typeof body.defaultUsername === 'string') {
    patch.defaultUsername = normalizeUsername(body.defaultUsername);
  }
  engine.setSettings(patch);

  const persisted = { ...engine.settings };
  delete persisted.abilities;
  saveSettings(persisted);

  const payload = {
    ok: true,
    settings: publicSettings(),
    demo: demo.running,
    snapshot: engine.getSnapshot(),
  };
  io.emit('settings', payload.settings);
  res.json(payload);
});

app.post('/api/test/chat', (req, res) => {
  const nickname = cleanNickname(req.body?.nickname || 'Test İzleyici');
  const uniqueId = 'test_' + (req.body?.uniqueId || nickname).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  const text = String(req.body?.text || 'selam arena');
  engine.handleChat({ uniqueId, nickname }, text);
  res.json({ ok: true });
});

app.post('/api/test/gift', (req, res) => {
  const nickname = cleanNickname(req.body?.nickname || 'Test İzleyici');
  const uniqueId = 'test_' + (req.body?.uniqueId || nickname).toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 16);
  const giftName = String(req.body?.gift || 'Rose');
  const coins = Math.max(1, Number(req.body?.coins) || 1);
  const units = Math.max(1, Math.min(12, Number(req.body?.units) || 1));
  engine.handleGift(
    { uniqueId, nickname },
    { name: giftName, coins, diamonds: Math.max(1, Math.round(coins / 2)), units }
  );
  res.json({ ok: true });
});

app.post('/api/reset', (req, res) => {
  // Sadece istatistik/siralama sifirlanir; motorun kendisi yeniden baslatilir.
  engine.roster.clear();
  engine.gifterDiamonds.clear();
  engine.championId = null;
  engine.round = 0;
  engine.startRound(1);
  engine.pushFeed({ type: 'system', icon: '♻️', text: 'Oyun sıfırlandı', color: '#94a3b8' });
  res.json({ ok: true, snapshot: engine.getSnapshot() });
});

/* -------------------------------------------------------------------------- */
/* Socket.IO                                                                  */
/* -------------------------------------------------------------------------- */

io.on('connection', (socket) => {
  socket.emit('bootstrap', bootstrapPayload());
  socket.on('disconnect', () => {});
});

engine.on('feed', (item) => io.emit('feed', item));
engine.on('fx', (fx) => io.emit('fx', fx));
engine.on('announce', (data) => io.emit('announce', data));
engine.on('roundStart', (data) => io.emit('roundStart', data));
engine.on('roundEnd', (data) => io.emit('roundEnd', data));
engine.on('ko', (data) => io.emit('ko', data));

tiktok.on('status', (status) => {
  io.emit('connection', status);
  if (status.viewers) engine.stats.viewers = status.viewers;
});
tiktok.on('viewers', (count) => {
  engine.stats.viewers = count;
});
tiktok.on('like', ({ total } = {}) => {
  engine.stats.likes = Math.max(engine.stats.likes, Number(total) || 0);
});
tiktok.on('chat', ({ user, text }) => engine.handleChat(user, text));
tiktok.on('gift', ({ user, gift, units }) =>
  engine.handleGift(user, {
    name: gift.name,
    coins: gift.coins,
    diamonds: gift.diamonds,
    units,
  })
);
tiktok.on('member', ({ uniqueId, nickname }) => {
  // Izleyici girisleri oyunu doldurmasin; sadece canli akista gozuksun.
  if (!uniqueId) return;
  engine.pushFeed({
    type: 'viewer',
    icon: '👤',
    text: cleanNickname(nickname || uniqueId) + ' yayına katıldı',
    color: '#94a3b8',
    throttleKey: 'member:' + uniqueId,
  });
});
tiktok.on('social', ({ action, nickname }) => {
  // 'action' bazi surumlerde sayi, bazilarinda metin ("1" / "follow") geliyor.
  const raw = String(action ?? '').toLowerCase();
  const code = raw === 'follow' ? 1 : raw === 'share' ? 2 : Number(raw);
  const map = { 1: 'takip etti', 2: 'paylaştı', 3: 'abone oldu' };
  engine.pushFeed({
    type: 'social',
    icon: code === 1 ? '➕' : '🔁',
    user: cleanNickname(nickname),
    text: map[code] || 'etkileşim',
    color: '#a3e635',
  });
});
tiktok.on('streamEnd', () => {
  engine.pushFeed({ type: 'system', icon: '📴', text: 'TikTok yayını sona erdi', color: '#f87171' });
});

// Ayni kullanicidan gelen "yayina katildi" mesajlarini 30 sn'de bir goster.
const feedThrottle = new Map();
const originalPushFeed = engine.pushFeed.bind(engine);
engine.pushFeed = (entry) => {
  if (entry.throttleKey) {
    const now = Date.now();
    if (now - (feedThrottle.get(entry.throttleKey) || 0) < 30000) return null;
    feedThrottle.set(entry.throttleKey, now);
  }
  return originalPushFeed(entry);
};

// Yeni bir canli yayina baglanildiginda onceki yayinin oyunculari temizlenir.
// Otomatik yeniden baglanmalarda (fresh=false) arena korunur.
tiktok.on('connected', ({ fresh, username } = {}) => {
  if (!fresh) return;
  if (demo.running) setDemo(false, { silent: true });
  io.emit('sessionReset', { username });
  engine.resetForNewStream(username);
  feedThrottle.clear();
});

/* -------------------------------------------------------------------------- */
/* Oyun dongusu                                                               */
/* -------------------------------------------------------------------------- */

let lastTick = Date.now();
const TICK_MS = 1000 / 30;
setInterval(() => {
  const now = Date.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  engine.tick(dt);
}, TICK_MS);

let lastSnapshot = 0;
setInterval(() => {
  const now = Date.now();
  if (now - lastSnapshot < 45) return;
  lastSnapshot = now;
  io.emit('snapshot', engine.getSnapshot());
}, 45);

/* -------------------------------------------------------------------------- */
/* Baslat                                                                     */
/* -------------------------------------------------------------------------- */

server.listen(PORT, HOST, async () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════╗');
  console.log('  ║          TIKTOK ARENA · ÇÖP ADAM SAVAŞI              ║');
  console.log('  ╚══════════════════════════════════════════════════════╝');
  console.log(`  Yayın paneli : http://localhost:${PORT}`);
  console.log(`  OBS overlay  : http://localhost:${PORT}/?overlay=1`);
  console.log('');

  if (settings.demo) {
    demo.start();
    console.log('  🧪 Demo akışı açık (sohbet + hediye simülasyonu)');
  }

  if (process.env.AUTO_CONNECT === '1') {
    const username = process.env.TIKTOK_USERNAME || settings.defaultUsername || 'revetaxn';
    console.log(`  🔌 TikTok'a bağlanılıyor: @${username}`);
    try {
      await tiktok.connect(username);
      console.log(`  ✅ Bağlandı: @${username}`);
    } catch (err) {
      console.log('  ⚠️  Bağlantı kurulamadı:', err.message);
    }
  } else {
    console.log('  ℹ️  TikTok bağlantısı için panelden "Bağlan" butonunu kullanın.');
  }

  console.log(`  👉 Test yayıncısı: @${settings.defaultUsername || 'revetaxn'}`);
  console.log('');
});

async function shutdown() {
  demo.stop();
  try {
    await tiktok.disconnect();
  } catch (err) {
    /* yoksay */
  }
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
