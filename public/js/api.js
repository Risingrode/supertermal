/**
 * WebSocket API for the Super Terminal Frontend
 */

(function () {
  'use strict';

  let ws = null;
  let reconnectAttempts = 0;
  let reconnectTimer = null;

  function connect() {
    if (ws && ws.readyState <= 1) return;
    
    // WS_URL should be available from constants.js
    const url = window.WS_URL || `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
    ws = new WebSocket(url);

    ws.onopen = () => {
      reconnectAttempts = 0;
      // Get authToken from global state or localStorage
      const authToken = (window.ccState && window.ccState.authToken) || localStorage.getItem('supertermal-token');
      if (authToken) {
        send({ type: 'auth', token: authToken });
      }
    };

    ws.onmessage = (e) => {
      let msg;
      try {
        msg = JSON.parse(e.data);
      } catch (err) {
        console.error('Failed to parse WS message:', err);
        return;
      }
      
      if (typeof window.handleServerMessage === 'function') {
        window.handleServerMessage(msg);
      }
    };

    ws.onclose = () => {
      if (typeof window.onWsClose === 'function') {
        window.onWsClose();
      }
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('WS error:', err);
    };
  }

  function send(data) {
    if (ws && ws.readyState === 1) {
      ws.send(JSON.stringify(data));
    }
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    reconnectAttempts++;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, delay);
  }

  // Expose API
  window.ccApi = {
    connect,
    send,
    get ws() { return ws; },
    get reconnectAttempts() { return reconnectAttempts; },
    set reconnectAttempts(val) { reconnectAttempts = val; }
  };
})();
