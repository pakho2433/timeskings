/**
 * ui.js
 * UI 管理：大廳、等候室、遊戲 HUD、通關畫面
 */

const UI = (() => {
  // 畫面元素
  const screens = {
    lobby: document.getElementById('lobby-screen'),
    room: document.getElementById('room-screen'),
    gameHud: document.getElementById('game-hud'),
    complete: document.getElementById('complete-screen'),
  };

  let toastTimer = null;

  // ── 顯示指定畫面 ──────────────────────────────────────
  function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      if (key === name) {
        el.style.display = 'flex';
      } else {
        el.style.display = 'none';
      }
    });

    // controls overlay 跟 HUD 要一起顯示
    const controlsOverlay = document.getElementById('controls-overlay');
    if (controlsOverlay) {
      controlsOverlay.style.display = name === 'gameHud' ? 'block' : 'none';
    }
  }

  // ── 大廳 ──────────────────────────────────────────────
  function initLobby(onCreateRoom, onJoinRoom) {
    const nameInput = document.getElementById('player-name-input');
    const createBtn = document.getElementById('btn-create-room');
    const joinBtn = document.getElementById('btn-join-room');
    const codeInput = document.getElementById('room-code-input');

    createBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || '玩家';
      onCreateRoom(name);
    });

    joinBtn.addEventListener('click', () => {
      const name = nameInput.value.trim() || '玩家';
      const code = codeInput.value.trim().toUpperCase();
      if (!code) {
        showToast('請輸入房間代碼！', '⚠️');
        return;
      }
      onJoinRoom(name, code);
    });
  }

  // ── 等候室 ────────────────────────────────────────────
  function showRoom(roomInfo, localPlayerId, onStart, onLeave) {
    showScreen('room');
    updateRoomUI(roomInfo, localPlayerId);

    // 按鈕事件（先清除舊的）
    const startBtn = document.getElementById('btn-start-game');
    const leaveBtn = document.getElementById('btn-leave-room');

    const newStart = startBtn.cloneNode(true);
    const newLeave = leaveBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStart, startBtn);
    leaveBtn.parentNode.replaceChild(newLeave, leaveBtn);

    newStart.addEventListener('click', onStart);
    newLeave.addEventListener('click', onLeave);
  }

  function updateRoomUI(roomInfo, localPlayerId) {
    const codeEl = document.getElementById('room-code-value');
    const statusEl = document.getElementById('room-player-count');

    if (codeEl) codeEl.textContent = roomInfo.code;
    if (statusEl) statusEl.textContent = `${roomInfo.playerCount} / ${roomInfo.maxPlayers} 位玩家`;

    // 更新玩家格
    const slots = document.querySelectorAll('.player-slot');
    const players = roomInfo.players || [];

    slots.forEach((slot, i) => {
      const p = players[i];
      const iconEl = slot.querySelector('.slot-icon');
      const nameEl = slot.querySelector('.slot-name');

      if (p) {
        slot.classList.remove('empty');
        if (iconEl) {
          iconEl.style.background = '#' + p.color.toString(16).padStart(6, '0');
        }
        if (nameEl) {
          nameEl.textContent = p.id === localPlayerId ? `${p.name} (你)` : p.name;
        }
      } else {
        slot.classList.add('empty');
        if (iconEl) iconEl.style.background = '';
        if (nameEl) nameEl.textContent = '等待加入...';
      }
    });
  }

  // ── 遊戲 HUD ──────────────────────────────────────────
  function showGameHud() {
    showScreen('gameHud');
  }

  function updateQuestion(level, a, b) {
    const levelTag = document.querySelector('#question-display .level-tag');
    const questionText = document.querySelector('#question-display .question-text');
    if (levelTag) levelTag.textContent = `第 ${level} 關`;
    if (questionText) questionText.textContent = `${a} × ${b} = ?`;
  }

  function updatePlayerStatus(players, completedSet, localPlayerId) {
    const bar = document.getElementById('player-status-bar');
    if (!bar) return;
    bar.innerHTML = '';

    players.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'player-status-item' + (completedSet.has(p.id) ? ' completed' : '');

      const dot = document.createElement('div');
      dot.className = 'player-status-dot';
      dot.style.background = '#' + p.color.toString(16).padStart(6, '0');
      dot.style.border = completedSet.has(p.id) ? '2px solid #44ff88' : '2px solid rgba(255,255,255,0.3)';
      dot.textContent = completedSet.has(p.id) ? '✓' : '';
      dot.style.display = 'flex';
      dot.style.alignItems = 'center';
      dot.style.justifyContent = 'center';
      dot.style.fontSize = '0.7rem';
      dot.style.color = '#fff';
      dot.style.fontWeight = 'bold';

      const name = document.createElement('div');
      name.className = 'player-status-name';
      name.textContent = p.id === localPlayerId ? `${p.name} (你)` : p.name;

      item.appendChild(dot);
      item.appendChild(name);
      bar.appendChild(item);
    });
  }

  function showWaiting(completedCount, totalCount) {
    const banner = document.getElementById('waiting-banner');
    if (banner) {
      banner.style.display = 'block';
      const p = banner.querySelector('p');
      if (p) p.textContent = `等待其他玩家... (${completedCount}/${totalCount})`;
    }
  }

  function hideWaiting() {
    const banner = document.getElementById('waiting-banner');
    if (banner) banner.style.display = 'none';
  }

  // ── 通關畫面 ──────────────────────────────────────────
  function showComplete(totalTime, missCount) {
    showScreen('complete');
    screens.complete.style.display = 'flex';

    const timeEl = document.getElementById('stat-time');
    const missEl = document.getElementById('stat-miss');

    const mins = Math.floor(totalTime / 60);
    const secs = totalTime % 60;
    if (timeEl) timeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (missEl) missEl.textContent = `${missCount} 次`;

    const playAgainBtn = document.getElementById('btn-play-again');
    if (playAgainBtn) {
      playAgainBtn.onclick = () => location.reload();
    }
  }

  // ── Toast 通知 ────────────────────────────────────────
  function showToast(message, emoji = '', duration = 1800) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = emoji ? `${emoji} ${message}` : message;
    toast.classList.add('show');

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.remove('show');
    }, duration);
  }

  return {
    showScreen,
    initLobby,
    showRoom,
    updateRoomUI,
    showGameHud,
    updateQuestion,
    updatePlayerStatus,
    showWaiting,
    hideWaiting,
    showComplete,
    showToast,
  };
})();
