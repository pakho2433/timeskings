/**
 * main.js
 * 遊戲主控制器：連接 Network、UI、Game、Controls 各模組
 */

(async function () {
  // ── 狀態 ──────────────────────────────────────────────
  let localPlayerId = null;
  let localPlayerName = '玩家';
  let currentRoom = null;
  let completedPlayers = new Set(); // 本關已過關的玩家 ID
  let positionThrottle = 0;        // 位置更新節流

  // ── 先初始化 UI，避免 3D／網絡錯誤令按鈕完全失效 ────────
  UI.initLobby(
    (name) => createRoom(name),
    (name, code) => joinRoom(name, code)
  );

  // ── WebSocket 訊息處理（必須在 connect 前註冊）──────────
  Network.on('CONNECTED', (msg) => {
    localPlayerId = msg.playerId;
    console.log('[Main] 已取得 playerId:', localPlayerId);
  });

  Network.on('ROOM_CREATED', (msg) => {
    localPlayerName = msg.player.name;
    currentRoom = msg.roomInfo;
    UI.showRoom(
      msg.roomInfo,
      localPlayerId,
      () => startGame(),
      () => leaveRoom()
    );
  });

  Network.on('ROOM_JOINED', (msg) => {
    localPlayerName = msg.player.name;
    currentRoom = msg.roomInfo;
    UI.showRoom(
      msg.roomInfo,
      localPlayerId,
      () => startGame(),
      () => leaveRoom()
    );
  });

  Network.on('JOIN_FAILED', (msg) => {
    const errMap = {
      ROOM_NOT_FOUND: '找不到此房間代碼！',
      ROOM_FULL: '房間已滿（最多 4 人）！',
      GAME_ALREADY_STARTED: '遊戲已開始，無法加入！',
    };
    UI.showToast(errMap[msg.error] || '加入失敗', '❌');
  });

  Network.on('PLAYER_JOINED', (msg) => {
    currentRoom = msg.roomInfo;
    UI.updateRoomUI(msg.roomInfo, localPlayerId);
    UI.showToast(`${msg.player.name} 加入了房間！`, '👋');
  });

  Network.on('PLAYER_LEFT', (msg) => {
    currentRoom = msg.roomInfo;
    UI.updateRoomUI(msg.roomInfo, localPlayerId);
    UI.showToast(`${msg.playerName} 離開了房間`, '👋');
  });

  Network.on('LEVEL_START', (msg) => {
    completedPlayers = new Set();
    currentRoom = msg.roomInfo;
    const players = msg.roomInfo.players;

    if (msg.level === 1) {
      Game.setupPlayers(players, localPlayerId);
      Controls.init(() => Game.jump());
    }

    UI.showGameHud();
    UI.hideWaiting();
    UI.updateQuestion(msg.level, msg.levelData.question.a, msg.levelData.question.b);
    UI.updatePlayerStatus(players, completedPlayers, localPlayerId);

    if (msg.level > 1) {
      UI.showToast(`第 ${msg.level} 關！`, '🎯', 1500);
    }

    Game.loadLevel(msg.levelData, players, localPlayerId);
    Game.setGameActive(true);
  });

  Network.on('PLAYER_MOVED', (msg) => {
    if (msg.playerId !== localPlayerId) {
      Game.updateRemotePlayer(msg.playerId, msg.position);
    }
  });

  Network.on('PLAYER_MISS', (msg) => {
    if (msg.playerId === localPlayerId) {
      UI.showToast('踩空了！再試一次！', '💨', 1200);
    }
  });

  Network.on('PLAYER_COMPLETED', (msg) => {
    completedPlayers = new Set(
      msg.roomInfo.players.filter((p) => p.hasCompleted).map((p) => p.id)
    );
    UI.updatePlayerStatus(msg.roomInfo.players, completedPlayers, localPlayerId);

    if (msg.playerId !== localPlayerId) {
      const p = msg.roomInfo.players.find((pl) => pl.id === msg.playerId);
      if (p) UI.showToast(`${p.name} 答對了！`, '⭐', 1200);
    }

    if (completedPlayers.has(localPlayerId) && msg.completedCount < msg.totalPlayers) {
      UI.showWaiting(msg.completedCount, msg.totalPlayers);
    }
  });

  Network.on('GAME_COMPLETED', (msg) => {
    Game.setGameActive(false);
    UI.showComplete(msg.totalTime, msg.missCount);
  });

  Network.on('DISCONNECTED', () => {
    UI.showToast('與伺服器斷線，嘗試重連...', '📡', 3000);
  });

  Network.on('RECONNECTED', (msg) => {
    localPlayerId = msg.playerId || Network.getPlayerId();
    UI.showToast('已重新連線！', '✅', 2000);
  });

  // ── 初始化 Three.js 場景 ──────────────────────────────
  if (typeof THREE === 'undefined') {
    UI.showToast('3D 引擎載入失敗，請重新整理頁面', '❌', 6000);
    return;
  }

  try {
    const canvas = document.getElementById('game-canvas');
    Game.init(canvas, {
      onCorrectAnswer: handleCorrectAnswer,
      onWrongAnswer: handleWrongAnswer,
      onPositionUpdate: handlePositionUpdate,
    });
  } catch (e) {
    console.error('[Main] 3D 場景初始化失敗', e);
    UI.showToast('3D 畫面啟動失敗，請重新整理頁面', '❌', 6000);
    return;
  }

  // ── 連線到伺服器 ──────────────────────────────────────
  try {
    await Network.connect();
    localPlayerId = Network.getPlayerId();
    console.log('[Main] 伺服器連線完成:', localPlayerId);
  } catch (e) {
    console.error('[Main] 無法連線到伺服器', e);
    UI.showToast('無法連線到伺服器，請重新整理', '❌', 5000);
  }

  // ── 動作函式 ──────────────────────────────────────────
  function createRoom(name) {
    localPlayerName = name || '玩家';
    const sent = Network.send('CREATE_ROOM', { playerName: localPlayerName });
    if (!sent) {
      UI.showToast('伺服器仍在連線，請稍候再試', '📡', 2500);
    }
  }

  function joinRoom(name, code) {
    localPlayerName = name || '玩家';
    const sent = Network.send('JOIN_ROOM', {
      playerName: localPlayerName,
      roomCode: code,
    });
    if (!sent) {
      UI.showToast('伺服器仍在連線，請稍候再試', '📡', 2500);
    }
  }

  function startGame() {
    if (!Network.send('START_GAME')) {
      UI.showToast('伺服器連線中斷，請重新整理', '📡', 2500);
    }
  }

  function leaveRoom() {
    location.reload();
  }

  function handleCorrectAnswer() {
    UI.showToast('答對了！🎉', '✅', 1500);
    Network.send('CORRECT_ANSWER');
  }

  function handleWrongAnswer() {
    Network.send('WRONG_ANSWER');
  }

  // 位置更新節流（每 50ms 最多一次）
  function handlePositionUpdate(position) {
    const now = Date.now();
    if (now - positionThrottle < 50) return;
    positionThrottle = now;
    Network.send('PLAYER_MOVE', { position });
  }
})();
