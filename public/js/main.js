/**
 * main.js
 * 熊仔乘法跑酷主控制器
 */

(async function () {
  let localPlayerId = null;
  let localPlayerName = '玩家';
  let currentRoom = null;
  let courseData = [];
  let localStage = 0;
  let positionThrottle = 0;
  let controlsInitialized = false;

  UI.initLobby(
    (name) => createRoom(name),
    (name, code) => joinRoom(name, code)
  );

  Network.on('CONNECTED', (message) => {
    localPlayerId = message.playerId;
  });

  Network.on('ROOM_CREATED', (message) => {
    localPlayerName = message.player.name;
    currentRoom = message.roomInfo;
    UI.showRoom(message.roomInfo, localPlayerId, startGame, leaveRoom);
  });

  Network.on('ROOM_JOINED', (message) => {
    localPlayerName = message.player.name;
    currentRoom = message.roomInfo;
    UI.showRoom(message.roomInfo, localPlayerId, startGame, leaveRoom);
  });

  Network.on('JOIN_FAILED', (message) => {
    const errorMap = {
      ROOM_NOT_FOUND: '找不到此房間代碼！',
      ROOM_FULL: '房間已滿（最多 4 人）！',
      GAME_ALREADY_STARTED: '比賽已開始或已結束，無法加入！',
    };
    UI.showToast(errorMap[message.error] || '加入失敗', '❌');
  });

  Network.on('PLAYER_JOINED', (message) => {
    currentRoom = message.roomInfo;
    UI.updateRoomUI(message.roomInfo, localPlayerId);
    UI.showToast(`${message.player.name} 的熊仔加入了！`, '🐻');
  });

  Network.on('PLAYER_LEFT', (message) => {
    currentRoom = message.roomInfo;
    UI.updateRoomUI(message.roomInfo, localPlayerId);
    UI.updatePlayerStatus(message.roomInfo.players, localPlayerId);
    UI.showToast(`${message.playerName} 離開比賽`, '👋');
  });

  Network.on('COURSE_START', (message) => {
    courseData = message.courseData || [];
    currentRoom = message.roomInfo;
    localStage = 0;

    Game.setupPlayers(message.roomInfo.players, localPlayerId);
    if (!controlsInitialized) {
      Controls.init(() => Game.jump());
      controlsInitialized = true;
    }

    UI.showGameHud();
    UI.updateRaceQuestion(0, courseData[0]);
    UI.updatePlayerStatus(message.roomInfo.players, localPlayerId);
    UI.showToast('熊仔跑酷開始！踩正確答案繼續前進！', '🏁', 2200);

    Game.loadCourse(courseData, message.roomInfo.players, localPlayerId);
    Game.setGameActive(true);
  });

  Network.on('PLAYER_MOVED', (message) => {
    if (message.playerId !== localPlayerId) {
      Game.updateRemotePlayer(message.playerId, message.position);
    }
  });

  Network.on('PLAYER_PROGRESS', (message) => {
    currentRoom = message.roomInfo;
    UI.updatePlayerStatus(message.roomInfo.players, localPlayerId);

    if (message.playerId === localPlayerId) {
      localStage = message.currentStage;
      Game.setLocalStage(localStage);
      UI.updateRaceQuestion(localStage, courseData[localStage]);
      if (localStage < courseData.length) {
        UI.showToast(`第 ${message.completedStage + 1} 關成功！前往第 ${localStage + 1} 關`, '✅', 1500);
      } else {
        UI.showToast('10 關完成！快衝過終點線！', '🏁', 2200);
      }
    } else {
      const player = message.roomInfo.players.find((item) => item.id === message.playerId);
      if (player) UI.showToast(`${player.name} 已到第 ${Math.min(player.currentStage + 1, 10)} 關`, '🐻', 900);
    }
  });

  Network.on('PLAYER_FELL', (message) => {
    currentRoom = message.roomInfo;
    UI.updatePlayerStatus(message.roomInfo.players, localPlayerId);

    if (message.playerId === localPlayerId) {
      UI.showToast('踩錯或跌落！返回本關起點再試！', '💥', 1800);
    } else {
      const player = message.roomInfo.players.find((item) => item.id === message.playerId);
      if (player) UI.showToast(`${player.name} 的熊仔跌落了！`, '⬇️', 900);
    }
  });

  Network.on('PLAYER_FINISHED', (message) => {
    currentRoom = message.roomInfo;
    UI.updatePlayerStatus(message.roomInfo.players, localPlayerId);

    if (message.playerId === localPlayerId) {
      Game.setFinished(true);
      UI.updateRaceQuestion(10, null);
      UI.showRaceMessage(`你第 ${message.rank} 名到達終點！等待其他熊仔完成…`);
      UI.showToast(`成功衝線！第 ${message.rank} 名！`, '🏆', 2400);
    } else {
      const player = message.roomInfo.players.find((item) => item.id === message.playerId);
      if (player) UI.showToast(`${player.name} 第 ${message.rank} 名衝線！`, '🏁', 1400);
    }
  });

  Network.on('GAME_COMPLETED', (message) => {
    Game.setFinished(true);
    UI.showComplete(message.totalTime, message.leaderboard, localPlayerId);
  });

  Network.on('DISCONNECTED', () => {
    UI.showToast('與伺服器斷線，嘗試重連...', '📡', 3000);
  });

  Network.on('RECONNECTED', (message) => {
    localPlayerId = message.playerId || Network.getPlayerId();
    UI.showToast('已重新連線！', '✅', 2000);
  });

  if (typeof THREE === 'undefined') {
    UI.showToast('3D 引擎載入失敗，請重新整理頁面', '❌', 6000);
    return;
  }

  try {
    Game.init(document.getElementById('game-canvas'), {
      onStageCompleted: handleStageCompleted,
      onFall: handleFall,
      onFinish: handleFinish,
      onPositionUpdate: handlePositionUpdate,
    });
  } catch (error) {
    console.error('[Main] 3D 場景初始化失敗', error);
    UI.showToast('3D 畫面啟動失敗，請重新整理頁面', '❌', 6000);
    return;
  }

  try {
    await Network.connect();
    localPlayerId = Network.getPlayerId();
  } catch (error) {
    console.error('[Main] 無法連線到伺服器', error);
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

  function handleStageCompleted(stageIndex) {
    Network.send('PLAYER_STAGE_SUCCESS', { stageIndex });
  }

  function handleFall(stageIndex) {
    Network.send('PLAYER_FALL', { stageIndex });
  }

  function handleFinish() {
    Network.send('PLAYER_FINISH');
  }

  function handlePositionUpdate(position) {
    const now = Date.now();
    if (now - positionThrottle < 50) return;
    positionThrottle = now;
    Network.send('PLAYER_MOVE', { position });
  }
})();
