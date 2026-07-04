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

  // ── 初始化 Three.js 場景 ──────────────────────────────
  const canvas = document.getElementById('game-canvas');
  Game.init(canvas, {
    onCorrectAnswer: handleCorrectAnswer,
    onWrongAnswer: handleWrongAnswer,
    onPositionUpdate: handlePositionUpdate,
  });

  // ── 初始化 UI ──────────────────────────────────────────
  UI.initLobby(
    (name) => createRoom(name),
    (name, code) => joinRoom(name, code)
  );

  // ── 連線到伺服器 ──────────────────────────────────────
  try {
    await Network.connect();
  } catch (e) {
    UI.showToast('無法連線到伺服器，請重新整理', '❌', 5000);
    return;
  }

  // ── WebSocket 訊息處理 ────────────────────────────────

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

    // 若還在大廳/等候室，切換到遊戲畫面
    currentRoom = msg.roomInfo;
    const players = msg.roomInfo.players;

    // 初始化玩家場景物件（第一關時建立）
    if (msg.level === 1) {
      Game.setupPlayers(players, localPlayerId);
      // 初始化觸控控制
      Controls.init(() => Game.jump());
    }

    UI.showGameHud();
    UI.hideWaiting();
    UI.updateQuestion(msg.level, msg.levelData.question.a, msg.levelData.question.b);
    UI.updatePlayerStatus(players, completedPlayers, localPlayerId);

    // 若不是第一關，顯示「下一關！」提示
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

    // 若本玩家已完成但還有人未完成，顯示等待
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

  Network.on('RECONNECTED', () => {
    UI.showToast('已重新連線！', '✅', 2000);
  });

  // ── 動作函式 ──────────────────────────────────────────

  function createRoom(name) {
    localPlayerName = name || '玩家';
    Network.send('CREATE_ROOM', { playerName: localPlayerName });
  }

  function joinRoom(name, code) {
    localPlayerName = name || '玩家';
    Network.send('JOIN_ROOM', { playerName: localPlayerName, roomCode: code });
  }

  function startGame() {
    Network.send('START_GAME');
  }

  function leaveRoom() {
    // WebSocket 關閉觸發伺服器端離開邏輯
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
