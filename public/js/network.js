/**
 * network.js
 * WebSocket 連線與同步邏輯
 */

const Network = (() => {
  let ws = null;
  let playerId = null;
  let reconnectTimer = null;
  const handlers = {};

  /** 連線到伺服器 */
  function connect() {
    return new Promise((resolve, reject) => {
      const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${location.host}`;
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[Network] 已連線');
        resolve();
      };

      ws.onerror = (err) => {
        console.error('[Network] 連線錯誤', err);
        reject(err);
      };

      ws.onclose = () => {
        console.warn('[Network] 連線關閉，嘗試重連...');
        emit('DISCONNECTED', {});
        scheduleReconnect();
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'CONNECTED') {
            playerId = msg.playerId;
          }
          emit(msg.type, msg);
        } catch (e) {
          console.error('[Network] 解析訊息失敗', e);
        }
      };
    });
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(async () => {
      reconnectTimer = null;
      try {
        await connect();
        emit('RECONNECTED', {});
      } catch (e) {
        scheduleReconnect();
      }
    }, 3000);
  }

  /** 傳送訊息給伺服器 */
  function send(type, data = {}) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type, ...data }));
    }
  }

  /** 訂閱訊息類型 */
  function on(type, handler) {
    if (!handlers[type]) handlers[type] = [];
    handlers[type].push(handler);
  }

  /** 取消訂閱 */
  function off(type, handler) {
    if (!handlers[type]) return;
    handlers[type] = handlers[type].filter((h) => h !== handler);
  }

  /** 觸發訂閱的 handler */
  function emit(type, data) {
    if (handlers[type]) {
      handlers[type].forEach((h) => h(data));
    }
  }

  function getPlayerId() {
    return playerId;
  }

  return { connect, send, on, off, getPlayerId };
})();
