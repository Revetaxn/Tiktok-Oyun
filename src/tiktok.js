'use strict';

const { EventEmitter } = require('node:events');
const {
  TikTokLiveConnection,
  ControlEvent,
} = require('tiktok-live-connector');

function normalizeUsername(raw) {
  let value = String(raw || '').trim();
  if (!value) return '';
  try {
    if (/^https?:\/\//i.test(value)) {
      const url = new URL(value);
      const parts = url.pathname.split('/').filter(Boolean);
      const at = parts.find((p) => p.startsWith('@'));
      value = at || parts[0] || '';
    }
  } catch (err) {
    /* yoksay */
  }
  value = value.replace(/^@+/, '').replace(/\/.*$/, '');
  return value.trim();
}

function firstNumber(...values) {
  for (const v of values) {
    if (v === undefined || v === null || v === '') continue;
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

/**
 * TikTok v3 olaylarinda kullanici alanlari displayId / id olarak geliyor
 * (eski dokumanlardaki uniqueId / userId alanlari yok). Tek yerden esliyoruz.
 */
function mapUser(user) {
  if (!user) return null;
  const uniqueId = String(user.displayId || user.uniqueId || user.nickname || '').trim();
  if (!uniqueId) return null;
  return {
    uniqueId,
    nickname: String(user.nickname || uniqueId),
    userId: String(user.id || user.userId || ''),
    profilePictureUrl: user.avatarThumb?.url?.[0] || user.profilePictureUrl || null,
  };
}

function extractGift(data) {
  const details = data.giftDetails || data.giftStruct || data.gift || {};
  const extended = data.extendedGiftInfo || {};
  const name =
    details.giftName ||
    details.name ||
    extended.name ||
    data.giftName ||
    data.giftDetails?.name ||
    `Hediye ${data.giftId || ''}`.trim();

  const coins = firstNumber(
    extended.cost,
    extended.coins,
    details.cost,
    details.coins,
    data.coins,
    data.diamondCount,
    details.diamondCount
  );
  const diamonds = firstNumber(
    details.diamondCount,
    data.diamondCount,
    extended.diamond_count,
    extended.diamondCount,
    coins
  );
  return {
    id: String(data.giftId || details.giftId || ''),
    name: String(name || 'Hediye'),
    coins: coins > 0 ? coins : 1,
    diamonds: diamonds > 0 ? diamonds : Math.max(1, Math.round((coins || 1) / 2)),
    repeatCount: firstNumber(data.repeatCount, data.repeat_count, 1),
    repeatEnd: data.repeatEnd !== undefined ? !!data.repeatEnd : data.repeat_end !== undefined ? !!data.repeat_end : true,
    giftType: firstNumber(details.giftType, details.type, data.giftType, data.gift?.gift_type),
    imageUrl: details.giftImage?.url?.[0] || extended.image?.url_list?.[0] || null,
  };
}

class TikTokManager extends EventEmitter {
  constructor() {
    super();
    this.connection = null;
    this.username = '';
    this.stopRequested = false;
    this.retryTimer = null;
    this.retryCount = 0;
    this.streaks = new Map();
    this.status = {
      state: 'idle',
      username: '',
      roomId: '',
      error: '',
      since: Date.now(),
      retries: 0,
      viewers: 0,
      likes: 0,
      hasApiKey: Boolean(process.env.EULER_API_KEY || process.env.SIGN_API_KEY),
    };
  }

  setStatus(patch = {}) {
    this.status = { ...this.status, ...patch, since: patch.since || Date.now() };
    this.emit('status', this.getStatus());
  }

  getStatus() {
    return {
      ...this.status,
      connected: this.status.state === 'connected',
      viewers: this.status.viewers,
      likes: this.status.likes,
      hasApiKey: Boolean(process.env.EULER_API_KEY || process.env.SIGN_API_KEY),
    };
  }

  async connect(rawUsername, { auto = false } = {}) {
    const username = normalizeUsername(rawUsername);
    if (!username) throw new Error('Geçerli bir TikTok kullanıcı adı girin.');

    this.stopRequested = false;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }

    await this.disconnect({ silent: true });
    this.stopRequested = false;

    this.username = username;
    this.retryCount = 0;
    this.setStatus({
      state: 'connecting',
      username,
      roomId: '',
      error: '',
      retries: 0,
      viewers: 0,
      likes: 0,
    });

    const options = {
      // Oda hediye listesini cekmek Euler imzasi gerektiriyor. Hediye adi/jetoni
      // zaten 'gift' olayinin icindeki 'gift' alaninda geldigi icin buna gerek yok.
      enableExtendedGiftInfo: false,
      fetchRoomInfoOnConnect: true,
    };
    const apiKey = process.env.EULER_API_KEY || process.env.SIGN_API_KEY;
    if (apiKey) options.signApiKey = apiKey;

    let connection;
    try {
      connection = new TikTokLiveConnection(username, options);
    } catch (err) {
      this.setStatus({ state: 'error', error: this.friendlyError(err) });
      throw err;
    }
    this.connection = connection;
    this.bind(connection);

    try {
      const state = await Promise.race([
        connection.connect(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Bağlantı zaman aşımına uğradı (25 sn).')), 25000)
        ),
      ]);
      this.retryCount = 0;
      const roomInfo = connection.roomInfo || {};
      const infoData = roomInfo.data || {};
      const initialViewers = firstNumber(
        infoData.user_count,
        infoData.liveRoom?.user_count,
        infoData.liveRoom?.stats?.total_user,
        infoData.stats?.total_user,
        state?.viewers
      );
      this.setStatus({
        state: 'connected',
        roomId: String(state?.roomId || connection.roomId || ''),
        error: '',
        retries: 0,
        viewers: initialViewers || this.status.viewers,
      });
      if (initialViewers > 0) this.emit('viewers', initialViewers);
      if (!auto) this.streaks.clear();
      this.emit('connected', { username, roomId: this.status.roomId, fresh: !auto });
      return this.getStatus();
    } catch (err) {
      const message = this.friendlyError(err);
      this.setStatus({ state: 'error', error: message });
      this.emit('connectError', { username, message });
      throw new Error(message);
    }
  }

  async disconnect({ silent = false } = {}) {
    this.stopRequested = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const conn = this.connection;
    this.connection = null;
    this.streaks.clear();
    if (conn) {
      try {
        conn.removeAllListeners();
      } catch (err) {
        /* yoksay */
      }
      try {
        await conn.disconnect();
      } catch (err) {
        /* yoksay */
      }
    }
    if (!silent) {
      this.setStatus({
        state: 'idle',
        roomId: '',
        error: '',
        retries: 0,
        viewers: 0,
      });
      this.emit('disconnected', { manual: true });
    }
  }

  bind(connection) {
    connection.on(ControlEvent.CONNECTED, () => {
      this.setStatus({ state: 'connected', error: '', retries: 0 });
    });

    connection.on(ControlEvent.DISCONNECTED, (info = {}) => {
      if (this.stopRequested) return;
      this.setStatus({
        state: 'reconnecting',
        roomId: '',
        error: `Bağlantı koptu (${info.code ?? '?'}). Yeniden bağlanılıyor...`,
      });
      this.emit('disconnected', { manual: false, code: info.code, reason: info.reason });
      this.scheduleReconnect();
    });

    connection.on(ControlEvent.ERROR, (err) => {
      this.setStatus({ state: 'error', error: this.friendlyError(err) });
      this.emit('error', err);
    });

    connection.on('chat', (data) => {
      const user = mapUser(data?.user);
      if (!user) return;
      // v3'te sohbet metni 'content' alaninda gelir ('comment' eski surumlerdeydi).
      const text = String(data.content ?? data.comment ?? '').trim();
      if (!text) return;
      this.emit('chat', { user, text });
    });

    connection.on('gift', (data) => {
      const user = mapUser(data?.user);
      if (!user) return;
      const gift = extractGift(data);
      const units = this.streakUnits(user.uniqueId, gift);
      if (units <= 0) return;
      this.emit('gift', {
        user,
        gift,
        units,
        rawRepeatCount: gift.repeatCount,
      });
    });

    connection.on('member', (data) => {
      const user = mapUser(data?.user);
      if (!user) return;
      this.emit('member', {
        uniqueId: user.uniqueId,
        nickname: user.nickname,
        viewerCount: firstNumber(data.memberCount, this.status.viewers),
      });
    });

    connection.on('like', (data) => {
      // 'count' bu paketteki begeni, 'total' yayin boyunca toplam begeni.
      const batch = firstNumber(data.count, data.likeCount, 0);
      const total = firstNumber(data.total, data.totalLikeCount, 0);
      if (total > 0) this.status.likes = total;
      else this.status.likes += Math.max(1, batch);
      this.emit('like', { count: batch || 1, total: this.status.likes });
    });

    connection.on('roomUser', (data) => {
      // 'total' anlik izleyici, 'totalUser' ise yayin boyunca gelen toplam kisi.
      const viewers = firstNumber(data.total, data.viewerCount, data.viewer_count, this.status.viewers);
      this.status.viewers = viewers;
      this.emit('viewers', viewers);
    });

    connection.on('social', (data) => {
      const user = mapUser(data?.user);
      if (!user) return;
      this.emit('social', {
        action: data.action,
        uniqueId: user.uniqueId,
        nickname: user.nickname,
      });
    });

    connection.on('streamEnd', () => {
      this.setStatus({ state: 'offline', error: 'Yayın sona erdi.', roomId: '' });
      this.emit('streamEnd', {});
      if (!this.stopRequested) this.scheduleReconnect();
    });
  }

  /**
   * Ayni hediye serisinde tekrar sayilari kumulatiftir (1,2,3...10).
   * Sadece artis miktarini yetenek sayisina ceviririz; boylece 10x gül
   * 10 yetenek tetikler, ayni olay tekrar gelirse cift sayilmaz.
   */
  streakUnits(uniqueId, gift) {
    const key = `${uniqueId}:${gift.id || gift.name}`;
    const now = Date.now();
    const prev = this.streaks.get(key);
    const recent = prev && now - prev.at < 20000 ? prev : null;
    const count = Math.max(1, gift.repeatCount || 1);

    if (recent) {
      if (count > recent.count) {
        const delta = count - recent.count;
        if (gift.repeatEnd) this.streaks.delete(key);
        else this.streaks.set(key, { count, at: now });
        return Math.min(12, delta);
      }
      // Ayni tur tekrar bildirildi (orn. repeatEnd kapanisi) - yeniden sayma.
      if (gift.repeatEnd) this.streaks.delete(key);
      else this.streaks.set(key, { count: recent.count, at: now });
      return 0;
    }

    if (gift.repeatEnd) this.streaks.delete(key);
    else this.streaks.set(key, { count, at: now });
    return Math.min(12, count);
  }

  scheduleReconnect() {
    if (this.stopRequested || !this.username) return;
    if (this.retryCount >= 5) {
      this.setStatus({
        state: 'error',
        error: 'Yeniden bağlanma denemeleri başarısız. "Bağlan" ile tekrar deneyin.',
      });
      return;
    }
    this.retryCount += 1;
    this.setStatus({ state: 'reconnecting', retries: this.retryCount });
    const delay = Math.min(30000, 4000 * this.retryCount);
    this.retryTimer = setTimeout(async () => {
      this.retryTimer = null;
      if (this.stopRequested) return;
      try {
        await this.connect(this.username, { auto: true });
      } catch (err) {
        /* connect() kendi durumunu set ediyor */
      }
    }, delay);
    if (this.retryTimer.unref) this.retryTimer.unref();
  }

  friendlyError(err) {
    const raw = String(err?.message || err || 'Bilinmeyen hata');
    const short = raw.split('\n')[0].slice(0, 240);
    if (err?.name === 'UserOfflineError' || /offline|not live/i.test(raw)) {
      return 'Yayıncı şu anda canlı yayında değil. Yayın başlayınca tekrar bağlanın.';
    }
    if (/business plan|purchase one|pricing/i.test(raw)) {
      return (
        'TikTok bağlantısı için imzalama servisi ek ayar istedi. Genellikle buna gerek yoktur; ' +
        'demo akışıyla devam edebilirsiniz. Detay: ' + short
      );
    }
    if (err?.name === 'SignAPIError' || /sign|signature/i.test(raw)) {
      return (
        'TikTok imzalama servisi isteği reddetti. Bu genellikle gerekli değildir; ' +
        'bağlantıyı tekrar deneyin. Detay: ' + short
      );
    }
    if (/api key|apikey|unauthorized|forbidden|401|403/i.test(raw)) {
      return (
        'TikTok bağlantısı için ek yetkilendirme gerekiyor olabilir. ' +
        'Bağlantıyı tekrar deneyin. Detay: ' + short
      );
    }
    if (/not found|does not exist|invalid unique/i.test(raw)) {
      return 'Kullanıcı bulunamadı. Kullanıcı adını kontrol edin. Detay: ' + short;
    }
    return short;
  }
}

module.exports = { TikTokManager, normalizeUsername, extractGift };
