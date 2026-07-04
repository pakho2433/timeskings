/**
 * main.js
 * 遊戲主控制器：連接 Network、UI、Game、Controls 各模組
 */

(async function () {
  let localPlayerId = null;
  let localPlayerName = '玩家';
  let currentRoom = null;
  let completedPlayers = new Set();
  let positionThrottle = 0;

  UI.initLobby(
    (name) => createRoom(name),
    (name, code) => joinRoom(name, code)
  );

  Network.on('CONNECTED', (msg) => {
    localPlayerId = msg.playerId;
    console.log('[Main] 已取得 playerId:', localPlayerId);
  });

  Network.on('ROOM_CREATED', (msg) => {
    localPlayerName = msg.player.name;
    currentRoom = msg.roomInfo;
    UI.showRoom(msg.roomInfo, localPlayerId, () => startGame(), () => leaveRoom());
  });

  Network.on('ROOM_JOINED', (msg) => {
    localPlayerName = msg.player.name;
    currentRoom = msg.roomInfo;
    UI.showRoom(msg.roomInfo, localPlayerId, () => startGame(), () => leaveRoom());
  });

  Network.on('JOIN_FAILED', (msg) => {
    const errMap = {
      ROOM_NOT_FOUND: '找不到此房間代碼！',
      ROOM_FULL: '房間已滿（最多 4 人）！',
      GAME_ALREADY_STARTED: '對戰已開始或已結束，無法加入！',
    };
    UI.showToast(errMap[msg.error] || '加入失敗', '❌');
  });

  Network.on('PLAYER_JOINED', (msg) => {
    currentRoom = msg.roomInfo;
    UI.updateRoomUI(msg.roomInfo, localPlayerId);
    UI.showToast(`${msg.player.name} 加入對戰！`, '⚔️');
  });

  Network.on('PLAYER_LEFT', (msg) => {
    currentRoom = msg.roomInfo;
    UI.updateRoomUI(msg.roomInfo, localPlayerId);
    UI.updatePlayerStatus(msg.roomInfo.players, completedPlayers, localPlayerId);
    UI.showToast(`${msg.playerName} 離開了對戰`, '👋');
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

    UI.showToast(msg.level === 1 ? '對戰開始！搶先答對得高分！' : `第 ${msg.level} 關！`, '⚔️', 1600);
    Game.loadLevel(msg.levelData, players, localPlayerId);
    Game.setGameActive(true);
  });

  Network.on('PLAYER_MOVED', (msg) => {
    if (msg.playerId !== localPlayerId) {
      Game.updateRemotePlayer(msg.playerId, msg.position);
    }
  });

  Network.on('PLAYER_MISS', (msg) => {
    currentRoom = msg.roomInfo;
    UI.updatePlayerStatus(msg.roomInfo.players, completedPlayers, localPlayerId);

    if (msg.playerId === localPlayerId) {
      UI.showToast(`答錯！-${msg.penalty} 分，再試一次！`, '💨', 1400);
    } else {
      const player = msg.roomInfo.players.find((p) => p.id === msg.playerId);
      if (player) UI.showToast(`${player.name} 答錯了！`, '💥', 900);
    }
  });

  Network.on('PLAYER_COMPLETED', (msg) => {
    currentRoom = msg.roomInfo;
    completedPlayers = new Set(
      msg.roomInfo.players.filter((p) => p.hasCompleted).map((p) => p.id)
    );
    UI.updatePlayerStatus(msg.roomInfo.players, completedPlayers, localPlayerId);

    const player = msg.roomInfo.players.find((p) => p.id === msg.playerId);
    if (msg.playerId === localPlayerId) {
      UI.showToast(`本關第 ${msg.placement} 名，+${msg.points} 分！`, '🏁', 1800);
    } else if (player) {
      UI.showToast(`${player.name} 第 ${msg.placement} 名答對，+${msg.points} 分`, '⭐', 1300);
    }

    if (completedPlayers.has(localPlayerId) && msg.completedCount < msg.totalPlayers) {
      UI.showWaiting(msg.completedCount, msg.totalPlayers, msg.placement, msg.points);
    }
  });

  Network.on('GAME_COMPLETED', (msg) => {
    Game.setGameActive(false);
    UI.showComplete(msg.totalTime, msg.missCount, msg.leaderboard, localPlayerId);
  });

  Network.on('DISCONNECTED', () => {
    UI.showToast('與伺服器斷線，嘗試重連...', '📡', 3000);
  });

  Network.on('RECONNECTED', (msg) => {
    localPlayerId = msg.playerId || Network.getPlayerId();
    UI.showToast('已重新連線！', '✅', 2000);
  });

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

  try {
    await Network.connect();
    localPlayerId = Network.getPlayerId();
    console.log('[Main] 伺服器連線完成:', localPlayerId);
  } catch (e) {
    console.error('[Main] 無法連線到伺服器', e);
    UI.showToast('無法連線到伺服器，請重新整理', '❌', 5000);
  }

  function createRoom(name) {
    localPlayerName = name || '玩家';
    if (!Network.send('CREATE_ROOM', { playerName: localPlayerName })) {
      UI.showToast('伺服器仍在連線，請稍候再試', '📡', 2500);
    }
  }

  function joinRoom(name, code) {
    localPlayerName = name || '玩家';
    if (!Network.send('JOIN_ROOM', { playerName: localPlayerName, roomCode: code })) {
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
    Network.send('CORRECT_ANSWER');
  }

  function handleWrongAnswer() {
    Network.send('WRONG_ANSWER');
  }

  function handlePositionUpdate(position) {
    const now = Date.now();
    if (now - positionThrottle < 50) return;
    positionThrottle = now;
    Network.send('PLAYER_MOVE', { position });
  }
})();
