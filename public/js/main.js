'use strict';

(function () {
  const params = new URLSearchParams(location.search);
  const overlay = params.get('overlay') === '1' || params.get('overlay') === 'true';
  if (overlay) document.body.classList.add('overlay');

  const renderer = new ArenaRenderer(document.getElementById('scene'));

  ArenaUI.bindAdmin();
  ArenaUI.bindLeaderTabs();

  ArenaNet.on('bootstrap', (data) => {
    ArenaUI.applyBootstrap(data);
    if (data?.snapshot) renderer.setSnapshot(data.snapshot);
  });

  ArenaNet.on('snapshot', (snap) => {
    renderer.setSnapshot(snap);
    ArenaUI.updateSnapshot(snap);
  });

  ArenaNet.on('feed', (item) => ArenaUI.addFeed(item));
  ArenaNet.on('fx', (fx) => renderer.pushFx(fx));
  ArenaNet.on('announce', (data) => ArenaUI.announce(data));
  ArenaNet.on('sessionReset', (data) => ArenaUI.resetSession(data?.username));

  ArenaNet.on('connection', (status) => {
    ArenaUI.setConnection(status);
    if (status?.state === 'error' && status.error) {
      ArenaUI.toast(status.error, true);
    }
    if (status?.state === 'connected') {
      ArenaUI.toast(`@${status.username} yayınına bağlandı`);
    }
  });

  ArenaNet.on('settings', (settings) => ArenaUI.applySettings(settings));
  ArenaNet.on('demo', (data) => ArenaUI.setDemo(!!data.enabled));

  ArenaNet.on('roundStart', () => {
    ArenaUI.hideChampion();
  });

  ArenaNet.on('roundEnd', (data) => {
    ArenaUI.showChampion(data);
    renderer.celebrate();
  });

  ArenaNet.socket.on('connect_error', () => {
    ArenaUI.toast('Sunucuya bağlanılamadı. Node.js çalışıyor mu?', true);
  });

  // ?connect=revetaxn ile otomatik bağlanma.
  const autoUser = params.get('connect');
  if (autoUser) {
    ArenaNet.api('/api/connect', { username: autoUser })
      .then(() => ArenaUI.toast(`@${autoUser} bağlantısı kuruldu`))
      .catch((err) => ArenaUI.toast(err.message, true));
  }

  // Arena boş kalırsa tarayıcı sekmesi başlığında bilgi göster.
  setInterval(() => {
    const snap = ArenaUI.state.snapshot;
    if (!snap) return;
    document.title =
      snap.phase === 'round_end'
        ? `🏆 ${snap.champion?.nickname || 'Şampiyon'} kazandı · TikTok Arena`
        : `ROUND ${snap.round} · ${snap.aliveCount} savaşçı · TikTok Arena`;
  }, 2000);
})();
