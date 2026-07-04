/**
 * game.js
 * Three.js 3D 場景、角色、平台、跳躍與二段跳邏輯
 */

const Game = (() => {
  // Three.js 核心物件
  let scene, camera, renderer, clock;

  // 遊戲狀態
  let localPlayerId = null;
  let roomPlayers = []; // 房間玩家資料陣列
  let levelData = null; // 當前關卡資料
  let gameActive = false;
  let hasCompletedLevel = false; // 本玩家是否已過關

  // 物理常數
  const GRAVITY = -22;
  const JUMP_FORCE = 9;
  const MOVE_SPEED = 6;
  const PLATFORM_Y = 0;        // 平台表面 Y 座標
  const GROUND_Y = -2;         // 地面 Y 座標
  const PLAYER_HEIGHT = 1.0;   // 角色腳底到中心

  // 平台設定
  const PLATFORM_WIDTH = 2.8;
  const PLATFORM_HEIGHT = 0.5;
  const PLATFORM_DEPTH = 2.8;
  const PLATFORM_GAP = 1.2;    // 平台間距
  const PLATFORM_START_Z = -8; // 平台起始 Z 距離

  // 玩家物件 Map: id -> { mesh, vel, onGround, jumpCount, ... }
  const playerObjects = new Map();

  // 平台物件陣列
  let platforms = [];
  let platformMeshes = [];
  let labelSprites = [];

  // 場景裝飾
  let groundMesh, skyMesh;
  let particles = [];

  // 回呼
  let onCorrectAnswer = null;
  let onWrongAnswer = null;
  let onPositionUpdate = null;

  // ── 初始化場景 ──────────────────────────────────────
  function init(canvas, callbacks = {}) {
    onCorrectAnswer = callbacks.onCorrectAnswer || (() => {});
    onWrongAnswer = callbacks.onWrongAnswer || (() => {});
    onPositionUpdate = callbacks.onPositionUpdate || (() => {});

    // 建立渲染器
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.NoToneMapping;

    // 場景
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 20, 60);

    // 時鐘
    clock = new THREE.Clock();

    // 相機（第三人稱跟隨）
    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);
    camera.position.set(0, 6, 10);
    camera.lookAt(0, 0, 0);

    // 燈光
    setupLights();

    // 地面
    createGround();

    // 天空裝飾
    createSkyDecor();

    // 視窗大小改變
    window.addEventListener('resize', onResize);

    // 啟動渲染迴圈
    animate();
  }

  function setupLights() {
    const ambient = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambient);

    const dirLight = new THREE.DirectionalLight(0xfffde7, 1.2);
    dirLight.position.set(10, 20, 10);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 100;
    dirLight.shadow.camera.left = -20;
    dirLight.shadow.camera.right = 20;
    dirLight.shadow.camera.top = 20;
    dirLight.shadow.camera.bottom = -20;
    scene.add(dirLight);

    const hemi = new THREE.HemisphereLight(0x87ceeb, 0x44aa44, 0.4);
    scene.add(hemi);
  }

  function createGround() {
    const geo = new THREE.PlaneGeometry(80, 80);
    const mat = new THREE.MeshToonMaterial({ color: 0x5cb85c });
    groundMesh = new THREE.Mesh(geo, mat);
    groundMesh.rotation.x = -Math.PI / 2;
    groundMesh.position.y = GROUND_Y;
    groundMesh.receiveShadow = true;
    scene.add(groundMesh);

    // 地面格線裝飾
    const gridHelper = new THREE.GridHelper(80, 40, 0x44aa44, 0x44aa44);
    gridHelper.position.y = GROUND_Y + 0.01;
    gridHelper.material.opacity = 0.2;
    gridHelper.material.transparent = true;
    scene.add(gridHelper);
  }

  function createSkyDecor() {
    // 簡單的雲朵（用白色球體群組）
    for (let i = 0; i < 6; i++) {
      const cloud = createCloud();
      cloud.position.set(
        (Math.random() - 0.5) * 60,
        8 + Math.random() * 5,
        -10 - Math.random() * 30
      );
      cloud.userData.speed = 0.3 + Math.random() * 0.3;
      cloud.userData.startX = cloud.position.x;
      scene.add(cloud);
      particles.push(cloud);
    }
  }

  function createCloud() {
    const group = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color: 0xffffff });
    const positions = [
      [0, 0, 0, 1.2],
      [-1.2, -0.2, 0, 0.9],
      [1.2, -0.2, 0, 0.9],
      [0.5, 0.3, 0, 0.8],
    ];
    for (const [x, y, z, r] of positions) {
      const geo = new THREE.SphereGeometry(r, 8, 6);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      group.add(mesh);
    }
    return group;
  }

  // ── 建立角色 ──────────────────────────────────────────
  function createPlayerMesh(color) {
    const group = new THREE.Group();
    const mat = new THREE.MeshToonMaterial({ color });

    // 身體（膠囊形：圓柱 + 半球）
    const bodyGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.8, 10);
    const body = new THREE.Mesh(bodyGeo, mat);
    body.castShadow = true;
    group.add(body);

    // 頭部
    const headGeo = new THREE.SphereGeometry(0.38, 12, 10);
    const headMat = new THREE.MeshToonMaterial({ color: 0xffe0b2 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.75;
    head.castShadow = true;
    group.add(head);

    // 眼睛
    const eyeMat = new THREE.MeshToonMaterial({ color: 0x333333 });
    [-0.13, 0.13].forEach((x) => {
      const eyeGeo = new THREE.SphereGeometry(0.07, 6, 6);
      const eye = new THREE.Mesh(eyeGeo, eyeMat);
      eye.position.set(x, 0.8, 0.33);
      group.add(eye);
    });

    // 帽子（方塊）
    const hatGeo = new THREE.BoxGeometry(0.55, 0.3, 0.55);
    const hatMat = new THREE.MeshToonMaterial({ color: darkenColor(color, 0.5) });
    const hat = new THREE.Mesh(hatGeo, hatMat);
    hat.position.y = 1.2;
    group.add(hat);

    // 帽沿
    const brimGeo = new THREE.BoxGeometry(0.75, 0.07, 0.75);
    const brim = new THREE.Mesh(brimGeo, hatMat);
    brim.position.y = 1.08;
    group.add(brim);

    return group;
  }

  function darkenColor(hex, factor) {
    const r = Math.floor(((hex >> 16) & 0xff) * factor);
    const g = Math.floor(((hex >> 8) & 0xff) * factor);
    const b = Math.floor((hex & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  // ── 平台 ──────────────────────────────────────────────
  function createPlatforms(options, correctIndex) {
    clearPlatforms();

    const totalW = options.length * PLATFORM_WIDTH + (options.length - 1) * PLATFORM_GAP;
    const startX = -totalW / 2 + PLATFORM_WIDTH / 2;

    options.forEach((value, i) => {
      const isCorrect = i === correctIndex;
      const x = startX + i * (PLATFORM_WIDTH + PLATFORM_GAP);
      const z = PLATFORM_START_Z;

      // 平台本體
      const geo = new THREE.BoxGeometry(PLATFORM_WIDTH, PLATFORM_HEIGHT, PLATFORM_DEPTH);

      // 正確/錯誤用不同顏色（主要辨識還是靠數字）
      const color = isCorrect ? 0x4fc3f7 : 0xef9a9a;
      const mat = new THREE.MeshToonMaterial({ color });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, PLATFORM_Y - PLATFORM_HEIGHT / 2, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);

      // 平台邊框（輪廓）
      const edges = new THREE.EdgesGeometry(geo);
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, linewidth: 1 });
      const edgesMesh = new THREE.LineSegments(edges, lineMat);
      mesh.add(edgesMesh);

      // 數字標籤
      const label = createTextSprite(String(value), isCorrect ? '#ffffff' : '#ffffff');
      label.position.set(x, PLATFORM_Y + 0.5, z);
      scene.add(label);

      const platformData = {
        mesh,
        label,
        value,
        isCorrect,
        x,
        z,
        alive: true,
        shakeTimer: 0,
        fallTimer: -1,
        originalY: mesh.position.y,
      };

      platforms.push(platformData);
      platformMeshes.push(mesh);
      labelSprites.push(label);
    });
  }

  function clearPlatforms() {
    platforms.forEach((p) => {
      scene.remove(p.mesh);
      scene.remove(p.label);
      if (p.mesh.geometry) p.mesh.geometry.dispose();
      if (p.label.material && p.label.material.map) p.label.material.map.dispose();
    });
    platforms = [];
    platformMeshes = [];
    labelSprites = [];
  }

  // ── 文字 Sprite ──────────────────────────────────────
  function createTextSprite(text, color = '#ffffff') {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // 背景（圓形徽章）
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.beginPath();
    ctx.arc(128, 128, 110, 0, Math.PI * 2);
    ctx.fill();

    // 邊框
    ctx.strokeStyle = color;
    ctx.lineWidth = 8;
    ctx.stroke();

    // 數字
    ctx.fillStyle = color;
    ctx.font = 'bold 120px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 128, 135);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(2.2, 2.2, 1);
    return sprite;
  }

  // ── 玩家管理 ──────────────────────────────────────────
  function setupPlayers(players, myId) {
    localPlayerId = myId;
    roomPlayers = players;

    // 移除舊的玩家
    playerObjects.forEach((obj) => {
      scene.remove(obj.mesh);
    });
    playerObjects.clear();

    players.forEach((p, i) => {
      const mesh = createPlayerMesh(p.color);
      const startX = (i - (players.length - 1) / 2) * 2.5;
      mesh.position.set(startX, GROUND_Y + PLAYER_HEIGHT, 2);
      scene.add(mesh);

      playerObjects.set(p.id, {
        mesh,
        vel: { x: 0, y: 0, z: 0 },
        onGround: true,
        jumpCount: 0,
        hasCompletedLevel: false,
        isLocal: p.id === myId,
        color: p.color,
        name: p.name,
        bobTimer: Math.random() * Math.PI * 2,
      });
    });
  }

  function updateRemotePlayer(pid, position) {
    const obj = playerObjects.get(pid);
    if (!obj || obj.isLocal) return;
    // 平滑插值
    obj.mesh.position.x += (position.x - obj.mesh.position.x) * 0.2;
    obj.mesh.position.y += (position.y - obj.mesh.position.y) * 0.2;
    obj.mesh.position.z += (position.z - obj.mesh.position.z) * 0.2;
  }

  // ── 跳躍 ──────────────────────────────────────────────
  function jump() {
    if (!gameActive) return;

    const local = playerObjects.get(localPlayerId);
    if (!local) return;

    if (local.jumpCount < 2) {
      local.vel.y = JUMP_FORCE;
      local.onGround = false;
      local.jumpCount++;

      // 跳躍特效（小縮放彈跳）
      local.mesh.scale.set(0.9, 1.15, 0.9);
      setTimeout(() => {
        if (local.mesh) local.mesh.scale.set(1, 1, 1);
      }, 120);
    }
  }

  // ── 碰撞檢測 ──────────────────────────────────────────
  function checkPlatformCollision(obj) {
    if (!levelData || obj.vel.y > 0) return; // 上升中不檢測
    if (hasCompletedLevel) return;

    const pos = obj.mesh.position;

    for (const p of platforms) {
      if (!p.alive) continue;

      // 平台表面 Y
      const surfaceY = p.mesh.position.y + PLATFORM_HEIGHT / 2;

      // Y 範圍：腳底略高於平台，且速度向下
      const feetY = pos.y - PLAYER_HEIGHT;
      if (feetY > surfaceY + 0.3) continue; // 還在上方
      if (feetY < surfaceY - 0.5) continue; // 已在平台下方

      // X/Z 範圍
      const halfW = PLATFORM_WIDTH / 2;
      const halfD = PLATFORM_DEPTH / 2;
      if (Math.abs(pos.x - p.x) > halfW + 0.3) continue;
      if (Math.abs(pos.z - p.z) > halfD + 0.3) continue;

      // 落在平台上
      if (p.isCorrect) {
        // 正確答案！
        landOnPlatform(obj, surfaceY);
        if (!hasCompletedLevel) {
          hasCompletedLevel = true;
          obj.hasCompletedLevel = true;

          // 勝利特效
          spawnConfetti(pos.x, pos.y, pos.z);
          onCorrectAnswer();
        }
      } else {
        // 錯誤答案：平台開始塌陷
        if (p.fallTimer < 0) {
          p.shakeTimer = 0.4;
          p.fallTimer = 0.5; // 0.5 秒後開始下落
          p.alive = false;    // 不允許再站上

          setTimeout(() => onWrongAnswer(), 200);
        }
        // 玩家落到地面（不阻止掉落）
      }
      return;
    }
  }

  function landOnPlatform(obj, surfaceY) {
    obj.vel.y = 0;
    obj.onGround = true;
    obj.jumpCount = 0;
    obj.mesh.position.y = surfaceY + PLAYER_HEIGHT;
  }

  // ── 粒子特效 ──────────────────────────────────────────
  const confettiParticles = [];

  function spawnConfetti(x, y, z) {
    const colors = [0xffcc44, 0x44aaff, 0xff6699, 0x44ff88, 0xff8844];
    for (let i = 0; i < 20; i++) {
      const geo = new THREE.BoxGeometry(0.15, 0.15, 0.15);
      const mat = new THREE.MeshToonMaterial({ color: colors[i % colors.length] });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 4;
      mesh.userData.vel = {
        x: Math.cos(angle) * speed,
        y: 5 + Math.random() * 5,
        z: Math.sin(angle) * speed,
      };
      mesh.userData.life = 1.5;
      scene.add(mesh);
      confettiParticles.push(mesh);
    }
  }

  // ── 主更新迴圈 ────────────────────────────────────────
  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (gameActive) {
      updateLocalPlayer(dt);
      updatePlatforms(dt);
      updateConfetti(dt);
      updateClouds(dt);
      updateCamera();
    }

    renderer.render(scene, camera);
  }

  function updateLocalPlayer(dt) {
    const obj = playerObjects.get(localPlayerId);
    if (!obj) return;

    // 取得搖桿輸入
    const input = Controls.getInput();

    // 水平移動（只在未過關時）
    if (!hasCompletedLevel) {
      obj.vel.x = input.x * MOVE_SPEED;
      obj.vel.z = input.y * MOVE_SPEED; // joystick y -> world Z
    } else {
      obj.vel.x *= 0.85;
      obj.vel.z *= 0.85;
    }

    // 重力
    if (!obj.onGround) {
      obj.vel.y += GRAVITY * dt;
    }

    // 更新位置
    obj.mesh.position.x += obj.vel.x * dt;
    obj.mesh.position.y += obj.vel.y * dt;
    obj.mesh.position.z += obj.vel.z * dt;

    // 地面碰撞
    const groundLevel = GROUND_Y + PLAYER_HEIGHT;
    if (obj.mesh.position.y <= groundLevel) {
      obj.mesh.position.y = groundLevel;
      obj.vel.y = 0;
      obj.onGround = true;
      obj.jumpCount = 0;
    } else {
      obj.onGround = false;
    }

    // 平台碰撞
    checkPlatformCollision(obj);

    // 限制 X 範圍
    obj.mesh.position.x = Math.max(-12, Math.min(12, obj.mesh.position.x));

    // 角色朝向（面向移動方向）
    if (Math.abs(obj.vel.x) > 0.1 || Math.abs(obj.vel.z) > 0.1) {
      const angle = Math.atan2(obj.vel.x, obj.vel.z);
      obj.mesh.rotation.y = angle;
    }

    // 跳躍動畫（壓縮/拉伸）
    if (!obj.onGround) {
      const stretch = 1 + obj.vel.y * 0.02;
      obj.mesh.scale.set(1 / Math.sqrt(Math.abs(stretch)), Math.max(0.7, stretch), 1 / Math.sqrt(Math.abs(stretch)));
    } else {
      obj.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.2);

      // 待機搖擺
      obj.bobTimer += dt * 2;
      obj.mesh.position.y += Math.sin(obj.bobTimer) * 0.005;
    }

    // 同步位置到伺服器（每幀）
    onPositionUpdate({
      x: obj.mesh.position.x,
      y: obj.mesh.position.y,
      z: obj.mesh.position.z,
    });
  }

  function updatePlatforms(dt) {
    platforms.forEach((p) => {
      if (p.shakeTimer > 0) {
        p.shakeTimer -= dt;
        p.mesh.position.x = p.x + Math.sin(p.shakeTimer * 30) * 0.08;
        p.mesh.position.y = p.originalY + Math.sin(p.shakeTimer * 25) * 0.05;
      }

      if (p.fallTimer >= 0) {
        p.fallTimer -= dt;
        if (p.fallTimer < 0) {
          // 開始下落
          p.fallTimer = -2; // 標記為正在下落
        }
      }

      if (p.fallTimer <= -0.01 && p.fallTimer > -5) {
        p.mesh.position.y -= dt * 5;
        p.label.position.y -= dt * 5;
        p.mesh.material.opacity = Math.max(0, p.mesh.material.opacity - dt * 2);
        if (!p.mesh.material.transparent) p.mesh.material.transparent = true;
        p.label.material.opacity = p.mesh.material.opacity;

        // 超過一定深度後移除
        if (p.mesh.position.y < GROUND_Y - 10) {
          scene.remove(p.mesh);
          scene.remove(p.label);
          p.fallTimer = -999;
        }
      }
    });
  }

  function updateConfetti(dt) {
    for (let i = confettiParticles.length - 1; i >= 0; i--) {
      const m = confettiParticles[i];
      m.userData.life -= dt;
      m.userData.vel.y += GRAVITY * dt;
      m.position.x += m.userData.vel.x * dt;
      m.position.y += m.userData.vel.y * dt;
      m.position.z += m.userData.vel.z * dt;
      m.rotation.x += dt * 3;
      m.rotation.z += dt * 2;
      m.material.opacity = m.userData.life / 1.5;
      if (!m.material.transparent) m.material.transparent = true;

      if (m.userData.life <= 0) {
        scene.remove(m);
        if (m.geometry) m.geometry.dispose();
        confettiParticles.splice(i, 1);
      }
    }
  }

  function updateClouds(dt) {
    particles.forEach((cloud) => {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 35) {
        cloud.position.x = -35;
      }
    });
  }

  function updateCamera() {
    const local = playerObjects.get(localPlayerId);
    if (!local) return;

    const targetX = local.mesh.position.x * 0.3;
    const targetY = 8;
    const targetZ = local.mesh.position.z + 12;

    camera.position.x += (targetX - camera.position.x) * 0.05;
    camera.position.y += (targetY - camera.position.y) * 0.05;
    camera.position.z += (targetZ - camera.position.z) * 0.05;

    const lookAtX = local.mesh.position.x * 0.5;
    const lookAtY = local.mesh.position.y;
    const lookAtZ = local.mesh.position.z - 3;
    camera.lookAt(lookAtX, lookAtY, lookAtZ);
  }

  // ── 關卡載入 ──────────────────────────────────────────
  function loadLevel(data, players, myId) {
    levelData = data;
    gameActive = true;
    hasCompletedLevel = false;

    // 更新玩家資料
    roomPlayers = players;
    if (myId) localPlayerId = myId;

    // 重設本地玩家位置
    const obj = playerObjects.get(localPlayerId);
    if (obj) {
      const idx = players.findIndex((p) => p.id === localPlayerId);
      const startX = (idx - (players.length - 1) / 2) * 2.5;
      obj.mesh.position.set(startX, GROUND_Y + PLAYER_HEIGHT, 2);
      obj.vel = { x: 0, y: 0, z: 0 };
      obj.onGround = true;
      obj.jumpCount = 0;
      obj.hasCompletedLevel = false;
    }

    // 建立平台
    createPlatforms(data.options, data.correctIndex);
  }

  function resetLevel() {
    hasCompletedLevel = false;
    const obj = playerObjects.get(localPlayerId);
    if (obj) {
      obj.hasCompletedLevel = false;
    }
  }

  function setGameActive(active) {
    gameActive = active;
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    clearPlatforms();
    if (renderer) renderer.dispose();
  }

  return {
    init,
    setupPlayers,
    loadLevel,
    jump,
    resetLevel,
    setGameActive,
    updateRemotePlayer,
    dispose,
  };
})();
