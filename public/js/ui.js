'use strict';

(function () {
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => [...document.querySelectorAll(sel)];
  const nf = new Intl.NumberFormat('tr-TR');

  const el = {
    app: $('#app'),
    feed: $('#feed'),
    leaderList: $('#leaderList'),
    legend: $('#legend'),
    queueStrip: $('#queueStrip'),
    announce: $('#announce'),
    champion: $('#championBanner'),
    champName: $('#champName'),
    champRound: $('#champRound'),
    champPower: $('#champPower'),
    champCountdown: $('#champCountdown'),
    roundNumber: $('#roundNumber'),
    phaseLabel: $('#phaseLabel'),
    timerText: $('#timerText'),
    aliveText: $('#aliveText'),
    roundState: $('#roundState'),
    timebarFill: $('#timebarFill'),
    timebar: $('.timebar'),
    viewerCount: $('#viewerCount'),
    diamondCount: $('#diamondCount'),
    giftCount: $('#giftCount'),
    streamerName: $('#streamerName'),
    streamerStatus: $('#streamerStatus'),
    liveDot: $('#liveDot'),
    connectBtn: $('#connectBtn'),
    soundBtn: $('#soundBtn'),
    settingsBtn: $('#settingsBtn'),
    modal: $('#modalBackdrop'),
    closeModal: $('#closeModal'),
    toast: $('#toast'),
    connStatus: $('#connStatus'),
    usernameInput: $('#usernameInput'),
    demo: $('#demoToggle'),
    giftGrid: $('#giftGrid'),
    obsUrl: $('#obsUrl'),
  };

  const state = {
    snapshot: null,
    settings: null,
    connection: null,
    demo: false,
    leaderTab: 'gifters',
    announceTimer: null,
    announceQueue: [],
    championVisible: false,
    toastTimer: null,
    lastChampion: null,
  };

  function initials(name) {
    return String(name || '?')
      .replace(/[^\p{L}\p{N} ]/gu, '')
      .trim()
      .slice(0, 2)
      .toUpperCase();
  }

  function fmt(n) {
    return nf.format(Math.round(Number(n) || 0));
  }

  function mmss(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  }

  /* ------------------------------------------------------------------ feed */

  function feedItemNode(item) {
    const div = document.createElement('div');
    div.className = `feed-item ${item.type || ''}`;
    const icon = document.createElement('span');
    icon.className = 'ficon';
    icon.textContent = item.icon || '•';
    const body = document.createElement('span');
    body.className = 'fbody';
    if (item.user) {
      const user = document.createElement('span');
      user.className = 'fuser';
      user.style.color = item.color || '#e2e8f0';
      user.textContent = item.user;
      body.appendChild(user);
    }
    const text = document.createElement('span');
    text.textContent = item.text || '';
    body.appendChild(text);
    div.appendChild(icon);
    div.appendChild(body);
    return div;
  }

  function addFeed(item) {
    if (!item) return;
    if (el.feed.querySelector('.feed-empty')) el.feed.innerHTML = '';
    const node = feedItemNode(item);
    el.feed.insertBefore(node, el.feed.firstChild);
    while (el.feed.children.length > 24) el.feed.removeChild(el.feed.lastChild);
  }

  function setFeed(items = []) {
    el.feed.innerHTML = '';
    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'feed-empty';
      empty.textContent = 'Hediye ve sohbetler burada görünecek…';
      el.feed.appendChild(empty);
      return;
    }
    for (const item of items.slice(0, 24)) el.feed.appendChild(feedItemNode(item));
  }

  /* --------------------------------------------------------------- leaders */

  function renderLeaders() {
    const snap = state.snapshot;
    if (!snap) return;
    const data = state.leaderTab === 'gifters' ? snap.leaders.gifters : snap.leaders.fighters;
    el.leaderList.innerHTML = '';
    if (!data.length) {
      const empty = document.createElement('div');
      empty.className = 'feed-empty';
      empty.textContent =
        state.leaderTab === 'gifters' ? 'Henüz hediye yok. İlk krallık senin!' : 'Henüz şampiyon yok.';
      el.leaderList.appendChild(empty);
      return;
    }
    data.forEach((row, i) => {
      const div = document.createElement('div');
      div.className = 'leader-row';

      const rank = document.createElement('div');
      rank.className = 'leader-rank';
      rank.textContent = i === 0 ? '👑' : String(i + 1);

      const avatar = document.createElement('div');
      avatar.className = 'leader-avatar';
      avatar.style.background = row.color || '#38bdf8';
      avatar.textContent = initials(row.nickname);

      const info = document.createElement('div');
      info.className = 'leader-info';
      const name = document.createElement('div');
      name.className = 'leader-name';
      name.textContent = row.nickname;
      const sub = document.createElement('div');
      sub.className = 'leader-sub';
      if (state.leaderTab === 'gifters') {
        sub.textContent = `${row.diamonds ? fmt(row.diamonds) + ' elmas' : '0 elmas'}`;
      } else {
        const bits = [];
        if (row.wins) bits.push(`${row.wins} şampiyonluk`);
        bits.push(`${row.kills || 0} KO`);
        if (row.kind === 'bot') bits.push('bot');
        sub.textContent = bits.join(' · ');
      }
      info.appendChild(name);
      info.appendChild(sub);

      const value = document.createElement('div');
      value.className = 'leader-value' + (i === 0 ? ' gold' : '');
      value.textContent =
        state.leaderTab === 'gifters'
          ? `💎 ${fmt(row.diamonds)}`
          : `×${Number(row.power || 1).toFixed(2)}`;

      div.appendChild(rank);
      div.appendChild(avatar);
      div.appendChild(info);
      div.appendChild(value);
      el.leaderList.appendChild(div);
    });
  }

  function bindLeaderTabs() {
    $$('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.tab-btn').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        state.leaderTab = btn.dataset.tab;
        renderLeaders();
      });
    });
  }

  /* ---------------------------------------------------------------- legend */

  function renderLegend() {
    const settings = state.settings;
    if (!settings || !settings.abilities) return;
    const abilities = settings.abilities;
    el.legend.innerHTML = '';

    const head = document.createElement('div');
    head.className = 'legend-head';
    const title = document.createElement('div');
    title.className = 'legend-title';
    title.textContent = 'HEDİYE YETENEKLERİ';
    const sub = document.createElement('div');
    sub.className = 'legend-sub';
    sub.textContent = 'JETON → GÜÇ';
    head.appendChild(title);
    head.appendChild(sub);
    el.legend.appendChild(head);

    const ordered = ['punch', 'diamond', 'lightning', 'meteor', 'titan', 'revive'];
    for (const key of ordered) {
      const ability = abilities.find((a) => a.key === key);
      if (!ability) continue;
      if (key === 'revive' && Number(settings.thresholds?.titan) > 9000) continue;
      const row = document.createElement('div');
      row.className = 'legend-row' + (key === 'revive' ? ' revive' : '');

      const icon = document.createElement('div');
      icon.className = 'licon';
      icon.textContent = ability.icon;

      const name = document.createElement('div');
      name.className = 'lname';
      name.textContent = ability.name;

      const price = document.createElement('div');
      price.className = 'lprice';
      if (key === 'revive') price.textContent = 'GÜL';
      else if (ability.to === null) price.textContent = `${fmt(ability.from)}+ JETON`;
      else if (ability.from === 1) price.textContent = `1–${fmt(ability.to)} JETON`;
      else price.textContent = `${fmt(ability.from)}–${fmt(ability.to)} JETON`;

      row.appendChild(icon);
      row.appendChild(name);
      row.appendChild(price);
      el.legend.appendChild(row);
    }

    const note = document.createElement('div');
    note.className = 'legend-note';
    note.innerHTML =
      'Hediye serisi gönderirsen her adet ayrı vuruş olur. <b>Gül at → diril.</b> ' +
      'Şampiyon her raunt <b>×' + Number(settings.winMultiplier || 1.1).toFixed(2) + '</b> güç kazanır.';
    el.legend.appendChild(note);
  }

  /* ------------------------------------------------------------- round hud */

  function updateHud() {
    const snap = state.snapshot;
    if (!snap) return;

    el.roundNumber.textContent = snap.round;
    el.aliveText.textContent = snap.aliveCount;

    if (snap.phase === 'round_end') {
      el.phaseLabel.textContent = 'ŞAMPİYON';
      el.timerText.textContent = 'SONRAKİ';
      el.roundState.textContent = 'yeni raunt hazırlanıyor';
      const total = Number(state.settings?.intermissionSeconds) || 7;
      const pct = Math.max(0, Math.min(100, (snap.intermissionLeft / total) * 100));
      el.timebarFill.style.width = pct + '%';
      el.timebar.classList.remove('hurry');
      if (state.championVisible) el.champCountdown.textContent = Math.ceil(snap.intermissionLeft);
    } else {
      el.phaseLabel.textContent = 'ROUND';
      el.timerText.textContent = mmss(snap.timeLeft);
      el.roundState.textContent = snap.aliveCount <= 3 ? 'final kapışması!' : 'kapışma sürüyor';
      const pct = Math.max(0, Math.min(100, (snap.timeLeft / (snap.roundSeconds || 110)) * 100));
      el.timebarFill.style.width = pct + '%';
      el.timebar.classList.toggle('hurry', snap.timeLeft <= 20);
    }
  }

  function updateStats() {
    const snap = state.snapshot;
    if (!snap) return;
    el.viewerCount.textContent = fmt(snap.stats.viewers || 0);
    el.diamondCount.textContent = fmt(snap.stats.diamonds || 0);
    el.giftCount.textContent = fmt(snap.stats.gifts || 0);
  }

  function renderQueue() {
    const snap = state.snapshot;
    if (!snap) return;
    const queued = snap.queued || [];
    if (!queued.length || snap.phase === 'round_end') {
      el.queueStrip.classList.remove('show');
      el.queueStrip.innerHTML = '';
      return;
    }
    el.queueStrip.innerHTML = '';
    const label = document.createElement('div');
    label.className = 'queue-label';
    label.textContent = 'SIRADAKİ RAUNT';
    el.queueStrip.appendChild(label);
    for (const q of queued.slice(0, 7)) {
      const chip = document.createElement('div');
      chip.className = 'queue-chip';
      const dot = document.createElement('i');
      dot.style.background = q.color;
      const name = document.createElement('span');
      name.textContent = q.nickname;
      chip.appendChild(dot);
      chip.appendChild(name);
      el.queueStrip.appendChild(chip);
    }
    el.queueStrip.classList.add('show');
  }

  /* ------------------------------------------------------------- announce */

  function showAnnounce(data) {
    const ability = state.settings?.abilities?.find((a) => a.key === data.ability);
    el.announce.innerHTML = '';

    const icon = document.createElement('div');
    icon.className = 'announce-icon';
    icon.textContent = data.abilityIcon || ability?.icon || '🎁';

    const body = document.createElement('div');
    body.className = 'announce-body';
    const top = document.createElement('div');
    top.className = 'announce-top';
    top.textContent = data.units > 1 ? `${data.coins} JETON × ${data.units}` : `${data.coins} JETON`;
    const user = document.createElement('div');
    user.className = 'announce-user';
    user.style.color = data.color || '#fbbf24';
    user.textContent = data.nickname;
    const sub = document.createElement('div');
    sub.className = 'announce-sub';
    sub.textContent = data.giftName;
    body.appendChild(top);
    body.appendChild(user);
    body.appendChild(sub);

    const abilityChip = document.createElement('div');
    abilityChip.className = 'announce-ability';
    abilityChip.style.color = data.abilityColor || '#fbbf24';
    abilityChip.textContent = `${data.abilityIcon || ''} ${data.abilityName || ''}`.trim();

    el.announce.appendChild(icon);
    el.announce.appendChild(body);
    el.announce.appendChild(abilityChip);
    el.announce.classList.add('show');

    clearTimeout(state.announceTimer);
    state.announceTimer = setTimeout(() => el.announce.classList.remove('show'), 3600);
  }

  function announce(data) {
    if (!data) return;
    if (data.coins < 5 && data.ability !== 'revive') {
      Sfx.play('gift');
      return;
    }
    Sfx.play('gift');
    showAnnounce(data);
  }

  /* -------------------------------------------------------------- champion */

  function showChampion(data) {
    if (!data || !data.champion) return;
    state.championVisible = true;
    state.lastChampion = data.champion;
    el.champName.textContent = data.champion.nickname || '—';
    el.champRound.textContent = data.round || state.snapshot?.round || 1;
    el.champPower.textContent = `×${Number(data.champion.power || data.champion.multiplier || 1.1).toFixed(2)}`;
    el.champCountdown.textContent = Math.ceil(data.nextIn || 7);
    el.champion.classList.add('show');
    Sfx.play('champion');
  }

  function hideChampion() {
    state.championVisible = false;
    el.champion.classList.remove('show');
  }

  /* ------------------------------------------------------------------ chip */

  function setConnection(conn) {
    if (!conn) return;
    state.connection = conn;
    const name = conn.username || state.settings?.defaultUsername || 'revetaxn';
    el.streamerName.textContent = '@' + name.replace(/^@/, '');
    el.liveDot.classList.toggle('on', conn.state === 'connected');
    el.liveDot.classList.toggle('demo', conn.state !== 'connected' && state.demo);

    const map = {
      connected: 'canlı yayına bağlı',
      connecting: 'bağlanıyor…',
      reconnecting: 'yeniden bağlanıyor…',
      idle: 'bağlantı bekleniyor',
      offline: 'yayın çevrimdışı',
      error: 'bağlantı hatası',
    };
    el.streamerStatus.textContent = conn.state === 'connected' ? 'canlı yayına bağlı' : map[conn.state] || 'bağlantı yok';

    el.connectBtn.textContent = conn.state === 'connected' ? 'Bağlı' : 'Bağlan';
    el.connectBtn.disabled = conn.state === 'connecting' || conn.state === 'reconnecting';

    const status = el.connStatus;
    if (status) {
      const pill = status.querySelector('.status-pill');
      const text = status.querySelector('p');
      status.className = 'conn-status';
      pill.className = 'status-pill';
      if (conn.state === 'connected') {
        pill.classList.add('ok');
        pill.textContent = 'BAĞLI';
        text.textContent = `@${name} yayınına bağlı. Oda: ${conn.roomId || '—'} · ${fmt(conn.viewers || 0)} izleyici`;
      } else if (conn.state === 'connecting' || conn.state === 'reconnecting') {
        pill.classList.add('wait');
        pill.textContent = 'BAĞLANIYOR';
        text.textContent = conn.error || 'TikTok yayınına bağlanılıyor…';
      } else if (conn.state === 'error' || conn.state === 'offline') {
        pill.classList.add('err');
        pill.textContent = conn.state === 'offline' ? 'ÇEVRİMDIŞI' : 'HATA';
        text.textContent = conn.error || 'Bağlantı kurulamadı.';
      } else {
        pill.textContent = 'HAZIR';
        text.textContent = 'Yayıncı canlıdaysa sohbet ve hediyeler otomatik olarak oyuna akar.';
      }
    }
  }

  function setDemo(enabled) {
    state.demo = !!enabled;
    if (el.demo) el.demo.checked = state.demo;
    el.liveDot.classList.toggle('demo', state.demo && state.connection?.state !== 'connected');
    if (state.connection && state.connection.state !== 'connected') {
      el.streamerStatus.textContent = state.demo ? 'demo akışı' : 'bağlantı yok';
    }
  }

  function applySettings(settings) {
    if (!settings) return;
    state.settings = settings;
    renderLegend();
    fillSettingsForm();
    if (settings.defaultUsername) {
      if (!el.usernameInput.dataset.touched) el.usernameInput.value = settings.defaultUsername;
      el.obsUrl.textContent = `${location.origin}/?overlay=1`;
      if (!state.connection?.username) {
        el.streamerName.textContent = '@' + settings.defaultUsername.replace(/^@/, '');
      }
    }
    if (typeof settings.demo === 'boolean') setDemo(settings.demo);
    buildGiftGrid();
  }

  function fillSettingsForm() {
    const s = state.settings;
    if (!s || !s.thresholds) return;
    const map = {
      setRoundSeconds: s.roundSeconds,
      setIntermission: s.intermissionSeconds,
      setRoundSize: s.roundSize,
      setWinMultiplier: s.winMultiplier,
      setThresholdDiamond: s.thresholds.diamond,
      setThresholdLightning: s.thresholds.lightning,
      setThresholdMeteor: s.thresholds.meteor,
      setThresholdTitan: s.thresholds.titan,
    };
    for (const [id, value] of Object.entries(map)) {
      const input = document.getElementById(id);
      if (input) input.value = value;
    }
    const revive = document.getElementById('setReviveGifts');
    if (revive) revive.value = (s.reviveGifts || []).join(', ');
    document.getElementById('setJoinChat').checked = !!s.joinOnChat;
    document.getElementById('setJoinGift').checked = !!s.joinOnGift;
    if (el.demo) el.demo.checked = state.demo;
  }

  /* ----------------------------------------------------------------- modal */

  function openModal(tab = 'connect') {
    el.modal.hidden = false;
    switchModalTab(tab);
  }

  function closeModal() {
    el.modal.hidden = true;
  }

  function switchModalTab(name) {
    $$('.mtab').forEach((b) => b.classList.toggle('active', b.dataset.mtab === name));
    $$('.mpanel').forEach((p) => p.classList.toggle('active', p.dataset.mpanel === name));
  }

  function toast(message, isError = false) {
    el.toast.textContent = message;
    el.toast.className = 'toast show' + (isError ? ' error' : '');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => el.toast.classList.remove('show'), 3400);
  }

  /* ------------------------------------------------------------------ test */

  function buildGiftGrid() {
    if (!el.giftGrid) return;
    const s = state.settings;
    if (!s || !s.abilities) return;
    const t = s.thresholds || {};
    const buttons = [
      { gift: 'Rose', coins: 1, icon: '🌹', name: 'Gül', coinsText: 'DİRİLİŞ · 1' },
      { gift: 'TikTok', coins: 1, icon: '👊', name: 'Düz Vuruş', coinsText: '1 jeton' },
      { gift: 'Finger Heart', coins: t.diamond || 5, icon: '💎', name: 'Elmas Vuruş', coinsText: `${t.diamond || 5} jeton` },
      { gift: 'Lightning Bolt', coins: t.lightning || 10, icon: '⚡', name: 'Yıldırım', coinsText: `${t.lightning || 10} jeton` },
      { gift: 'Meteor Shower', coins: t.meteor || 50, icon: '☄️', name: 'Meteor', coinsText: `${t.meteor || 50} jeton` },
      { gift: 'Lion', coins: t.titan || 1000, icon: '🦁', name: 'Titan', coinsText: `${t.titan || 1000} jeton` },
    ];
    el.giftGrid.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.className = 'gift-btn';
      const icon = document.createElement('span');
      icon.className = 'gi';
      icon.textContent = b.icon;
      const info = document.createElement('span');
      const name = document.createElement('span');
      name.className = 'gn';
      name.textContent = b.name;
      const coins = document.createElement('span');
      coins.className = 'gc';
      coins.textContent = b.coinsText;
      info.appendChild(name);
      info.appendChild(document.createElement('br'));
      info.appendChild(coins);
      btn.appendChild(icon);
      btn.appendChild(info);
      btn.addEventListener('click', () => sendTestGift(b));
      el.giftGrid.appendChild(btn);
    }
  }

  function testNickname() {
    return (document.getElementById('testNickname')?.value || 'TestOyuncu').trim() || 'TestOyuncu';
  }

  async function sendTestGift(b) {
    try {
      await ArenaNet.api('/api/test/gift', {
        nickname: testNickname(),
        uniqueId: 'test_' + testNickname().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12),
        gift: b.gift,
        coins: b.coins,
        units: 1,
      });
      toast(`${b.name} tetiklendi (${b.coins} jeton)`);
    } catch (err) {
      toast(err.message, true);
    }
  }

  async function sendTestChat(text) {
    try {
      await ArenaNet.api('/api/test/chat', {
        nickname: testNickname(),
        uniqueId: 'test_' + testNickname().toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12),
        text,
      });
      toast('Sohbet gönderildi');
    } catch (err) {
      toast(err.message, true);
    }
  }

  /* ---------------------------------------------------------------- admin */

  function bindAdmin() {
    el.settingsBtn.addEventListener('click', () => openModal('connect'));
    el.connectBtn.addEventListener('click', () => openModal('connect'));
    el.closeModal.addEventListener('click', closeModal);
    el.modal.addEventListener('pointerdown', (e) => {
      if (e.target === el.modal) closeModal();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !el.modal.hidden) closeModal();
    });

    $$('.mtab').forEach((btn) => {
      btn.addEventListener('click', () => switchModalTab(btn.dataset.mtab));
    });

    el.usernameInput.addEventListener('input', () => {
      el.usernameInput.dataset.touched = '1';
    });

    const doConnect = document.getElementById('doConnect');
    doConnect.addEventListener('click', async () => {
      const username = el.usernameInput.value.trim().replace(/^@/, '');
      if (!username) return toast('Kullanıcı adı gir.', true);
      doConnect.disabled = true;
      doConnect.textContent = 'Bağlanıyor…';
      try {
        const res = await ArenaNet.api('/api/connect', { username });
        setConnection(res.connection);
        toast(`@${username} bağlantısı kuruldu`);
      } catch (err) {
        setConnection(err.data?.connection || { ...state.connection, state: 'error', error: err.message });
        toast(err.message, true);
      } finally {
        doConnect.disabled = false;
        doConnect.textContent = 'Bağlan';
      }
    });

    document.getElementById('doDisconnect').addEventListener('click', async () => {
      try {
        await ArenaNet.api('/api/disconnect', {});
        toast('Bağlantı kesildi');
      } catch (err) {
        toast(err.message, true);
      }
    });

    document.getElementById('refreshStatus').addEventListener('click', async () => {
      try {
        const res = await ArenaNet.api('/api/status');
        setConnection(res.connection);
        setDemo(res.demo);
        toast('Durum güncellendi');
      } catch (err) {
        toast(err.message, true);
      }
    });

    el.demo.addEventListener('change', async () => {
      try {
        await ArenaNet.api('/api/demo', { enabled: el.demo.checked });
        setDemo(el.demo.checked);
        toast(el.demo.checked ? 'Demo akışı açıldı' : 'Demo akışı kapatıldı');
      } catch (err) {
        toast(err.message, true);
      }
    });

    document.getElementById('saveSettings').addEventListener('click', async () => {
      const payload = {
        roundSeconds: Number(document.getElementById('setRoundSeconds').value),
        intermissionSeconds: Number(document.getElementById('setIntermission').value),
        roundSize: Number(document.getElementById('setRoundSize').value),
        winMultiplier: Number(document.getElementById('setWinMultiplier').value),
        thresholds: {
          diamond: Number(document.getElementById('setThresholdDiamond').value),
          lightning: Number(document.getElementById('setThresholdLightning').value),
          meteor: Number(document.getElementById('setThresholdMeteor').value),
          titan: Number(document.getElementById('setThresholdTitan').value),
        },
        reviveGifts: document
          .getElementById('setReviveGifts')
          .value.split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        joinOnChat: document.getElementById('setJoinChat').checked,
        joinOnGift: document.getElementById('setJoinGift').checked,
      };
      try {
        const res = await ArenaNet.api('/api/settings', payload);
        applySettings(res.settings);
        toast('Ayarlar kaydedildi');
      } catch (err) {
        toast(err.message, true);
      }
    });

    document.getElementById('sendTestChat').addEventListener('click', () => {
      const text = document.getElementById('testChatText').value || 'selam arena';
      sendTestChat(text);
    });

    document.getElementById('sendTestJoin').addEventListener('click', () => {
      sendTestChat('arenaya katılıyorum!');
    });

    document.getElementById('resetGame').addEventListener('click', async () => {
      if (!window.confirm('Oyunu sıfırlamak istediğine emin misin?')) return;
      try {
        await ArenaNet.api('/api/reset', {});
        toast('Oyun sıfırlandı');
      } catch (err) {
        toast(err.message, true);
      }
    });

    el.soundBtn.addEventListener('click', () => {
      const on = Sfx.toggle();
      el.soundBtn.textContent = on ? '🔊' : '🔇';
      toast(on ? 'Ses açık' : 'Ses kapalı');
    });
    if (!Sfx.enabled) el.soundBtn.textContent = '🔇';
  }

  /* ------------------------------------------------------------------ boot */

  function applyBootstrap(data) {
    if (!data) return;
    state.connection = data.connection;
    setConnection(data.connection);
    applySettings(data.settings);
    setDemo(!!data.demo);
    if (data.connection?.username) el.usernameInput.value = data.connection.username;
    setFeed(data.feed || []);
    if (data.snapshot) {
      state.snapshot = data.snapshot;
      updateHud();
      updateStats();
      renderLeaders();
      renderQueue();
      if (data.snapshot.phase === 'round_end' && data.snapshot.champion) {
        showChampion({
          round: data.snapshot.round,
          champion: data.snapshot.champion,
          nextIn: data.snapshot.intermissionLeft,
        });
        state.championVisible = true;
      }
    }
    if (data.demo || data.connection?.state !== 'connected') {
      el.liveDot.classList.toggle('demo', !!data.demo);
    }
  }

  function resetSession(username) {
    setFeed([]);
    el.leaderList.innerHTML = '';
    el.queueStrip.innerHTML = '';
    hideChampion();
    state.lastChampion = null;
    state.announceQueue = [];
    clearTimeout(state.announceTimer);
    el.announce.classList.remove('show');
    el.announce.innerHTML = '';
    state.snapshot = null;
    toast(username ? `Yeni yayına bağlandı: @${username}` : 'Yeni yayın oturumu başladı');
  }

  function updateSnapshot(snap) {
    if (!snap) return;
    state.snapshot = snap;
    updateHud();
    updateStats();
    renderLeaders();
    renderQueue();
  }

  window.ArenaUI = {
    state,
    el,
    applyBootstrap,
    updateSnapshot,
    addFeed,
    setFeed,
    resetSession,
    setConnection,
    setDemo,
    applySettings,
    announce,
    showChampion,
    hideChampion,
    toast,
    bindAdmin,
    bindLeaderTabs,
    renderLeaders,
    renderLegend,
  };
})();
