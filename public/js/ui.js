/**
 * ui.js
 * UI 管理：大廳、等候室、對戰 HUD、排行榜與結算畫面
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
    Object.entries(screens).forEach(([key, el]) => {
      if (!el) return;
      el.style.display = key === name ? 'flex' : 'none';
    });

    const controlsOverlay = document.getElementById('controls-overlay');
    if (controlsOverlay) {
      controlsOverlay.style.display = name === 'gameHud' ? 'block' : 'none';
    }
  }

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

  function showRoom(roomInfo, localPlayerId, onStart, onLeave) {
    showScreen('room');
    updateRoomUI(roomInfo, localPlayerId);

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
    if (statusEl) statusEl.textContent = `${roomInfo.playerCount} / ${roomInfo.maxPlayers} 位玩家準備對戰`;

    const slots = document.querySelectorAll('.player-slot');
    const players = roomInfo.players || [];

    slots.forEach((slot, i) => {
      const p = players[i];
      const iconEl = slot.querySelector('.slot-icon');
      const nameEl = slot.querySelector('.slot-name');

      if (p) {
        slot.classList.remove('empty');
        if (iconEl) iconEl.style.background = toHexColor(p.color);
        if (nameEl) nameEl.textContent = p.id === localPlayerId ? `${p.name}（你）` : p.name;
      } else {
        slot.classList.add('empty');
        if (iconEl) iconEl.style.background = '';
        if (nameEl) nameEl.textContent = '等待加入...';
      }
    });
  }

  function showGameHud() {
    showScreen('gameHud');
  }

  function updateQuestion(level, a, b) {
    const levelTag = document.querySelector('#question-display .level-tag');
    const questionText = document.querySelector('#question-display .question-text');
    if (levelTag) levelTag.textContent = `對戰第 ${level} / 10 關`;
    if (questionText) questionText.textContent = `${a} × ${b} = ?`;
  }

  function updatePlayerStatus(players, completedSet, localPlayerId) {
    const bar = document.getElementById('player-status-bar');
    if (!bar) return;
    bar.innerHTML = '';

    const sorted = [...players].sort((a, b) => {
      if ((b.score || 0) !== (a.score || 0)) return (b.score || 0) - (a.score || 0);
      return a.slotIndex - b.slotIndex;
    });

    sorted.forEach((p, index) => {
      const completed = completedSet.has(p.id);
      const item = document.createElement('div');
      item.className = 'player-status-item' + (completed ? ' completed' : '');

      const dot = document.createElement('div');
      dot.className = 'player-status-dot';
      dot.style.background = toHexColor(p.color);
      dot.style.border = completed ? '2px solid #44ff88' : '2px solid rgba(255,255,255,0.3)';
      dot.textContent = completed ? placementBadge(p.lastPlacement) : String(index + 1);
      dot.style.display = 'flex';
      dot.style.alignItems = 'center';
      dot.style.justifyContent = 'center';
      dot.style.fontSize = '0.7rem';
      dot.style.color = '#fff';
      dot.style.fontWeight = 'bold';

      const name = document.createElement('div');
      name.className = 'player-status-name';
      const displayName = p.id === localPlayerId ? `${p.name}（你）` : p.name;
      name.textContent = `${displayName} · ${p.score || 0}分`;
      name.style.maxWidth = '130px';

      item.appendChild(dot);
      item.appendChild(name);
      bar.appendChild(item);
    });
  }

  function showWaiting(completedCount, totalCount, placement, points) {
    const banner = document.getElementById('waiting-banner');
    if (!banner) return;

    banner.style.display = 'block';
    const p = banner.querySelector('p');
    if (p) {
      p.textContent = `本關第 ${placement} 名，+${points} 分！等待其他玩家… (${completedCount}/${totalCount})`;
    }
  }

  function hideWaiting() {
    const banner = document.getElementById('waiting-banner');
    if (banner) banner.style.display = 'none';
  }

  function showComplete(totalTime, missCount, leaderboard, localPlayerId) {
    showScreen('complete');
    screens.complete.style.display = 'flex';

    const titleEl = document.getElementById('complete-title');
    const emojiEl = document.querySelector('.complete-emoji');
    const timeEl = document.getElementById('stat-time');
    const missEl = document.getElementById('stat-miss');
    const leaderboardEl = document.getElementById('battle-leaderboard');

    const localResult = (leaderboard || []).find((p) => p.id === localPlayerId);
    if (titleEl) {
      titleEl.textContent = localResult && localResult.rank === 1 ? '你是乘法王！' : '對戰完成！';
    }
    if (emojiEl) emojiEl.textContent = localResult && localResult.rank === 1 ? '🏆' : '🎖️';

    const mins = Math.floor(totalTime / 60);
    const secs = totalTime % 60;
    if (timeEl) timeEl.textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    if (missEl) missEl.textContent = `${missCount} 次`;

    if (leaderboardEl) {
      leaderboardEl.innerHTML = '';
      (leaderboard || []).forEach((player) => {
        const row = document.createElement('div');
        row.className = 'stat-row';
        if (player.id === localPlayerId) {
          row.style.background = 'rgba(255,204,68,0.12)';
          row.style.borderRadius = '8px';
          row.style.paddingLeft = '8px';
          row.style.paddingRight = '8px';
        }

        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = `${rankMedal(player.rank)} ${player.name}${player.id === localPlayerId ? '（你）' : ''}`;

        const value = document.createElement('span');
        value.className = 'stat-value';
        value.textContent = `${player.score} 分`;

        row.appendChild(label);
        row.appendChild(value);
        leaderboardEl.appendChild(row);
      });
    }

    const playAgainBtn = document.getElementById('btn-play-again');
    if (playAgainBtn) playAgainBtn.onclick = () => location.reload();
  }

  function showToast(message, emoji = '', duration = 1800) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = emoji ? `${emoji} ${message}` : message;
    toast.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), duration);
  }

  function placementBadge(placement) {
    if (placement === 1) return '1';
    if (placement === 2) return '2';
    if (placement === 3) return '3';
    if (placement === 4) return '4';
    return '✓';
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
    updateQuestion,
    updatePlayerStatus,
    showWaiting,
    hideWaiting,
    showComplete,
    showToast,
  };
})();
