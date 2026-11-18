'use strict';

(function () {
  const socket = window.io({ reconnectionDelay: 800, reconnectionDelayMax: 4000 });

  const handlers = new Map();

  function on(event, fn) {
    if (!handlers.has(event)) handlers.set(event, []);
    handlers.get(event).push(fn);
    socket.on(event, fn);
  }

  async function api(path, body, method = 'POST') {
    const res = await fetch(path, {
      method: body === undefined && method === 'POST' ? 'GET' : method,
      headers: { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let data = null;
    try {
      data = await res.json();
    } catch (err) {
      data = {};
    }
    if (!res.ok) {
      const error = new Error(data.error || data.message || `İstek başarısız (${res.status})`);
      error.data = data;
      throw error;
    }
    return data;
  }

  window.ArenaNet = {
    socket,
    on,
    api,
    connected: () => socket.connected,
  };
})();
