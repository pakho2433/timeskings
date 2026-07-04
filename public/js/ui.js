/**
 * ui.js
 * 熊仔跑酷 UI：房間、關卡題目、賽事進度及終點排名
 */

const UI = (() => {
  const screens = {
    lobby: document.getElementById('lobby-screen'),
    room: document.getElementById('room-screen'),
    gameHud: document.getElementById('game-hud'),
    complete: document.getElementById('complete-screen'),
  };

  let toastTimer = null;

  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => {
      if (!element) return;
      element.style.display = key === name ? 'flex' : 'none';
    });

    const controls = document.getElementById('controls-overlay');
    if (controls) controls.style.display = name === 'gameHud' ? 'block' : 'none';
  }

  function initLobby(onCreateRoom, onJoinRoom) {
    const nameInput = document.getElementById('player-name-input');
    const createButton = document.getElementById('btn-create-room');
    const joinButton = document.getElementById('btn-join-room');
    const codeInput = document.getElementById('room-code-input');

    createButton.addEventListener('click', () => {
      onCreateRoom(nameInput.value.trim() || '玩家');
    });

    joinButton.addEventListener('click', () => {
      const code = codeInput.value.trim().toUpperCase();
      if (!code) {
        showToast('請輸入房間代碼！', '⚠️');
        return;
      }
      onJoinRoom(nameInput.value.trim() || '玩家', code);
    });
  }

  function showRoom(roomInfo, localPlayerId, onStart, onLeave) {
    showScreen('room');
    updateRoomUI(roomInfo, localPlayerId);

    const startButton = document.getElementById('btn-start-game');
    const leaveButton = document.getElementById('btn-leave-room');
    const newStart = startButton.cloneNode(true);
    const newLeave = leaveButton.cloneNode(true);
    startButton.parentNode.replaceChild(newStart, startButton);
    leaveButton.parentNode.replaceChild(newLeave, leaveButton);
    newStart.addEventListener('click', onStart);
    newLeave.addEventListener('click', onLeave);
  }

  function updateRoomUI(roomInfo, localPlayerId) {
    const codeElement = document.getElementById('room-code-value');
    const statusElement = document.getElementById('room-player-count');
    if (codeElement) codeElement.textContent = roomInfo.code;
    if (statusElement) statusElement.textContent = `${roomInfo.playerCount} / ${roomInfo.maxPlayers} 隻熊仔準備起跑`;

    const slots = document.querySelectorAll('.player-slot');
    const players = roomInfo.players || [];
    slots.forEach((slot, index) => {
      const player = players[index];
      const icon = slot.querySelector('.slot-icon');
      const name = slot.querySelector('.slot-name');

      if (!player) {
        slot.classList.add('empty');
        if (icon) icon.style.background = '';
        if (name) name.textContent = '等待加入...';
        return;
      }

      slot.classList.remove('empty');
      if (icon) icon.style.background = toHexColor(player.color);
      if (name) name.textContent = `🐻 ${player.name}${player.id === localPlayerId ? '（你）' : ''}`;
    });
  }

  function showGameHud() {
    showScreen('gameHud');
    hideRaceMessage();
  }

  function updateRaceQuestion(stageIndex, stageData) {
    const levelTag = document.querySelector('#question-display .level-tag');
    const questionText = document.querySelector('#question-display .question-text');

    if (stageIndex >= 10 || !stageData) {
      if (levelTag) levelTag.textContent = '最後直路';
      if (questionText) questionText.textContent = '衝過終點！';
      return;
    }

    if (levelTag) levelTag.textContent = `第 ${stageIndex + 1} / 10 關`;
    if (questionText) questionText.textContent = `${stageData.question.a} × ${stageData.question.b} = ?`;
  }

  function updatePlayerStatus(players, localPlayerId) {
    const bar = document.getElementById('player-status-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const sorted = [...players].sort((a, b) => {
      if (a.isFinished && b.isFinished) return a.finishRank - b.finishRank;
      if (a.isFinished) return -1;
      if (b.isFinished) return 1;
      if (b.currentStage !== a.currentStage) return b.currentStage - a.currentStage;
      if (a.falls !== b.falls) return a.falls - b.falls;
      return a.slotIndex - b.slotIndex;
    });

    sorted.forEach((player, index) => {
      const item = document.createElement('div');
      item.className = 'player-status-item' + (player.isFinished ? ' completed' : '');

      const dot = document.createElement('div');
      dot.className = 'player-status-dot';
      dot.style.background = toHexColor(player.color);
      dot.style.border = player.isFinished ? '2px solid #ffdf55' : '2px solid rgba(255,255,255,0.4)';
      dot.style.display = 'flex';
      dot.style.alignItems = 'center';
      dot.style.justifyContent = 'center';
      dot.style.color = '#fff';
      dot.style.fontWeight = '900';
      dot.style.fontSize = '0.7rem';
      dot.textContent = player.isFinished ? String(player.finishRank) : String(index + 1);

      const name = document.createElement('div');
      name.className = 'player-status-name';
      name.style.maxWidth = '150px';
      const progress = player.isFinished ? `🏁 第${player.finishRank}名` : `第${Math.min(player.currentStage + 1, 10)}關`;
      name.textContent = `${player.name}${player.id === localPlayerId ? '（你）' : ''} · ${progress}`;

      item.appendChild(dot);
      item.appendChild(name);
      bar.appendChild(item);
    });
  }

  function showRaceMessage(message) {
    const banner = document.getElementById('waiting-banner');
    if (!banner) return;
    banner.style.display = 'block';
    const text = banner.querySelector('p');
    if (text) text.textContent = message;
  }

  function hideRaceMessage() {
    const banner = document.getElementById('waiting-banner');
    if (banner) banner.style.display = 'none';
  }

  function showComplete(totalTime, leaderboard, localPlayerId) {
    showScreen('complete');
    screens.complete.style.display = 'flex';

    const localResult = (leaderboard || []).find((player) => player.id === localPlayerId);
    const title = document.getElementById('complete-title');
    const emoji = document.querySelector('.complete-emoji');
    const time = document.getElementById('stat-time');
    const falls = document.getElementById('stat-miss');
    const leaderboardElement = document.getElementById('battle-leaderboard');

    if (title) title.textContent = localResult && localResult.rank === 1 ? '熊仔跑酷冠軍！' : '比賽完成！';
    if (emoji) emoji.textContent = localResult && localResult.rank === 1 ? '🏆🐻' : '🏁🐻';
    if (time) time.textContent = formatTime(totalTime);
    if (falls) falls.textContent = localResult ? `${localResult.falls} 次` : '--';

    if (leaderboardElement) {
      leaderboardElement.innerHTML = '';
      (leaderboard || []).forEach((player) => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        if (player.id === localPlayerId) {
          row.style.background = 'rgba(255,204,68,0.14)';
          row.style.borderRadius = '8px';
          row.style.paddingLeft = '8px';
          row.style.paddingRight = '8px';
        }

        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = `${rankMedal(player.rank)} 🐻 ${player.name}${player.id === localPlayerId ? '（你）' : ''}`;

        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = player.isFinished ? `${formatTime(player.finishTime)} · 跌${player.falls}次` : `第${player.currentStage + 1}關`;

        row.appendChild(label);
        row.appendChild(value);
        leaderboardElement.appendChild(row);
      });
    }

    const playAgain = document.getElementById('btn-play-again');
    if (playAgain) playAgain.onclick = () => location.reload();
  }

  function showToast(message, emoji = '', duration = 1800) {
    const toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = emoji ? `${emoji} ${message}` : message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function formatTime(totalSeconds) {
    const secondsValue = Math.max(0, Number(totalSeconds) || 0);
    const minutes = Math.floor(secondsValue / 60);
    const seconds = secondsValue % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  function rankMedal(rank) {
    return ['🥇', '🥈', '🥉', '4️⃣'][rank - 1] || `${rank}.`;
  }

  function toHexColor(color) {
    return '#' + Number(color || 0).toString(16).padStart(6, '0');
  }

  return {
    showScreen,
    initLobby,
    showRoom,
    updateRoomUI,
    showGameHud,
    updateRaceQuestion,
    updatePlayerStatus,
    showRaceMessage,
    hideRaceMessage,
    showComplete,
    showToast,
  };
})();
