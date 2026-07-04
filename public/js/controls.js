/**
 * controls.js
 * 觸控搖桿與跳躍按鈕邏輯
 * 僅處理觸控事件，不處理鍵盤/滑鼠
 */

const Controls = (() => {
  // 搖桿輸入向量 (-1 ~ 1)
  const input = { x: 0, y: 0 };
  let jumpCallback = null;

  // 搖桿元件
  let outerEl, innerEl;
  let joystickActive = false;
  let joystickTouchId = null;
  let joystickOrigin = { x: 0, y: 0 };
  let outerRadius = 70;

  function init(onJump) {
    jumpCallback = onJump;

    outerEl = document.getElementById('joystick-outer');
    innerEl = document.getElementById('joystick-inner');
    const jumpBtn = document.getElementById('jump-btn');

    if (!outerEl || !innerEl || !jumpBtn) {
      console.warn('[Controls] 找不到控制元件');
      return;
    }

    outerRadius = outerEl.offsetWidth / 2;

    // 搖桿觸控事件
    outerEl.addEventListener('touchstart', onJoystickStart, { passive: false });
    document.addEventListener('touchmove', onJoystickMove, { passive: false });
    document.addEventListener('touchend', onJoystickEnd, { passive: false });
    document.addEventListener('touchcancel', onJoystickEnd, { passive: false });

    // 跳躍按鈕
    jumpBtn.addEventListener('touchstart', onJumpPress, { passive: false });

    // 視窗大小改變時重新計算
    window.addEventListener('resize', () => {
      if (outerEl) outerRadius = outerEl.offsetWidth / 2;
    });
  }

  function onJoystickStart(e) {
    e.preventDefault();
    if (joystickActive) return;

    const touch = e.changedTouches[0];
    joystickTouchId = touch.identifier;
    joystickActive = true;

    const rect = outerEl.getBoundingClientRect();
    joystickOrigin.x = rect.left + rect.width / 2;
    joystickOrigin.y = rect.top + rect.height / 2;

    outerRadius = rect.width / 2;
    updateJoystick(touch.clientX, touch.clientY);
  }

  function onJoystickMove(e) {
    if (!joystickActive) return;

    for (const touch of e.changedTouches) {
      if (touch.identifier === joystickTouchId) {
        e.preventDefault();
        updateJoystick(touch.clientX, touch.clientY);
        break;
      }
    }
  }

  function onJoystickEnd(e) {
    for (const touch of e.changedTouches) {
      if (touch.identifier === joystickTouchId) {
        joystickActive = false;
        joystickTouchId = null;
        input.x = 0;
        input.y = 0;
        // 回到中心
        innerEl.style.transform = 'translate(-50%, -50%)';
        break;
      }
    }
  }

  function updateJoystick(cx, cy) {
    const dx = cx - joystickOrigin.x;
    const dy = cy - joystickOrigin.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = outerRadius * 0.7;
    const clampedDist = Math.min(dist, maxDist);

    const angle = Math.atan2(dy, dx);
    const nx = Math.cos(angle) * clampedDist;
    const ny = Math.sin(angle) * clampedDist;

    input.x = nx / maxDist;
    input.y = ny / maxDist;

    // 視覺更新
    innerEl.style.transform = `translate(calc(-50% + ${nx}px), calc(-50% + ${ny}px))`;
  }

  function onJumpPress(e) {
    e.preventDefault();
    if (jumpCallback) jumpCallback();
  }

  function getInput() {
    return { ...input };
  }

  function dispose() {
    if (outerEl) {
      outerEl.removeEventListener('touchstart', onJoystickStart);
    }
    document.removeEventListener('touchmove', onJoystickMove);
    document.removeEventListener('touchend', onJoystickEnd);
    document.removeEventListener('touchcancel', onJoystickEnd);
    const jumpBtn = document.getElementById('jump-btn');
    if (jumpBtn) jumpBtn.removeEventListener('touchstart', onJumpPress);
  }

  return { init, getInput, dispose };
})();
