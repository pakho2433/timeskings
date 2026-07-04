/**
 * game.js
 * Three.js 熊仔跑酷：10 關、三選一平台、塌台、重生與終點線
 */

const Game = (() => {
  let scene, camera, renderer, clock;
  let localPlayerId = null;
  let roomPlayers = [];
  let courseData = [];
  let gameActive = false;
  let localStage = 0;
  let localFinished = false;
  let finishTriggered = false;

  const GRAVITY = -24;
  const JUMP_FORCE = 9.5;
  const MOVE_SPEED = 7;
  const GROUND_Y = 0;
  const FALL_RESET_Y = -8;
  const FIRST_STAGE_Z = -8;
  const STAGE_SPACING = 13;
  const PLATFORM_WIDTH = 3;
  const PLATFORM_HEIGHT = 0.55;
  const PLATFORM_DEPTH = 3.2;
  const PLATFORM_GAP = 0.75;
  const PLATFORM_SURFACE_Y = 1.05;
  const VOID_DEPTH = 5.8;

  const playerObjects = new Map();
  let platforms = [];
  let courseObjects = [];
  let particles = [];

  let onStageCompleted = () => {};
  let onFall = () => {};
  let onFinish = () => {};
  let onPositionUpdate = () => {};

  function init(canvas, callbacks = {}) {
    onStageCompleted = callbacks.onStageCompleted || (() => {});
    onFall = callbacks.onFall || (() => {});
    onFinish = callbacks.onFinish || (() => {});
    onPositionUpdate = callbacks.onPositionUpdate || (() => {});

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x87ceeb);
    scene.fog = new THREE.Fog(0x87ceeb, 28, 105);
    clock = new THREE.Clock();

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 240);
    camera.position.set(0, 7, 12);
    camera.lookAt(0, 1, -3);

    setupLights();
    createWorld();
    window.addEventListener('resize', onResize);
    animate();
  }

  function setupLights() {
    scene.add(new THREE.AmbientLight(0xffffff, 0.62));

    const sun = new THREE.DirectionalLight(0xfffde7, 1.15);
    sun.position.set(12, 25, 12);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -20;
    sun.shadow.camera.right = 20;
    sun.shadow.camera.top = 24;
    sun.shadow.camera.bottom = -24;
    scene.add(sun);

    scene.add(new THREE.HemisphereLight(0x8ed8ff, 0x4fa553, 0.42));
  }

  function createWorld() {
    const courseLength = STAGE_SPACING * 10 + 35;
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(28, courseLength),
      new THREE.MeshToonMaterial({ color: 0x79df87 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, GROUND_Y - 0.03, -courseLength / 2 + 8);
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(courseLength, 70, 0x38a96a, 0x38a96a);
    grid.position.set(0, GROUND_Y, -courseLength / 2 + 8);
    grid.material.opacity = 0.17;
    grid.material.transparent = true;
    scene.add(grid);

    for (let i = 0; i < 7; i++) {
      const cloud = createCloud();
      cloud.position.set((Math.random() - 0.5) * 55, 10 + Math.random() * 7, -10 - Math.random() * 115);
      cloud.userData.speed = 0.25 + Math.random() * 0.25;
      scene.add(cloud);
      particles.push(cloud);
    }
  }

  function createCloud() {
    const group = new THREE.Group();
    const material = new THREE.MeshToonMaterial({ color: 0xffffff });
    [[0, 0, 0, 1.2], [-1.1, -0.15, 0, 0.85], [1.1, -0.15, 0, 0.85], [0.45, 0.32, 0, 0.75]].forEach(([x, y, z, r]) => {
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 9, 7), material);
      mesh.position.set(x, y, z);
      group.add(mesh);
    });
    return group;
  }

  function createBearMesh(color) {
    const bear = new THREE.Group();
    const fur = new THREE.MeshToonMaterial({ color });
    const darkFur = new THREE.MeshToonMaterial({ color: darkenColor(color, 0.62) });
    const muzzleMat = new THREE.MeshToonMaterial({ color: 0xffe2b8 });
    const eyeMat = new THREE.MeshToonMaterial({ color: 0x1d1d1d });

    const body = new THREE.Mesh(new THREE.SphereGeometry(0.58, 14, 11), fur);
    body.scale.set(0.95, 1.18, 0.82);
    body.position.y = 0.78;
    body.castShadow = true;
    bear.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.34, 12, 9), muzzleMat);
    belly.scale.set(0.95, 1.15, 0.3);
    belly.position.set(0, 0.78, 0.48);
    bear.add(belly);

    const head = new THREE.Mesh(new THREE.SphereGeometry(0.48, 14, 11), fur);
    head.position.y = 1.55;
    head.castShadow = true;
    bear.add(head);

    [-0.34, 0.34].forEach((x) => {
      const ear = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), darkFur);
      ear.position.set(x, 1.88, 0);
      bear.add(ear);
    });

    const muzzle = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 9), muzzleMat);
    muzzle.scale.set(1.1, 0.85, 0.72);
    muzzle.position.set(0, 1.45, 0.4);
    bear.add(muzzle);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.08, 8, 6), eyeMat);
    nose.position.set(0, 1.53, 0.59);
    bear.add(nose);

    [-0.17, 0.17].forEach((x) => {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), eyeMat);
      eye.position.set(x, 1.67, 0.42);
      bear.add(eye);
    });

    [-0.5, 0.5].forEach((x) => {
      const arm = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), fur);
      arm.scale.set(0.7, 1.25, 0.7);
      arm.position.set(x, 0.92, 0.02);
      arm.rotation.z = x < 0 ? -0.25 : 0.25;
      bear.add(arm);
    });

    [-0.27, 0.27].forEach((x) => {
      const leg = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), darkFur);
      leg.scale.set(0.82, 0.7, 1.05);
      leg.position.set(x, 0.2, 0.05);
      bear.add(leg);
    });

    const tail = new THREE.Mesh(new THREE.SphereGeometry(0.18, 9, 7), muzzleMat);
    tail.position.set(0, 0.75, -0.53);
    bear.add(tail);

    return bear;
  }

  function darkenColor(hex, factor) {
    const r = Math.floor(((hex >> 16) & 0xff) * factor);
    const g = Math.floor(((hex >> 8) & 0xff) * factor);
    const b = Math.floor((hex & 0xff) * factor);
    return (r << 16) | (g << 8) | b;
  }

  function setupPlayers(players, myId) {
    localPlayerId = myId;
    roomPlayers = players;

    playerObjects.forEach((obj) => scene.remove(obj.mesh));
    playerObjects.clear();

    players.forEach((player, index) => {
      const mesh = createBearMesh(player.color);
      mesh.position.set(startXForIndex(index, players.length), GROUND_Y, 2);
      scene.add(mesh);

      playerObjects.set(player.id, {
        mesh,
        vel: new THREE.Vector3(),
        onGround: true,
        jumpCount: 0,
        isLocal: player.id === myId,
        bobTimer: Math.random() * Math.PI * 2,
        fallReported: false,
      });
    });
  }

  function startXForIndex(index, count) {
    return (index - (count - 1) / 2) * 1.8;
  }

  function loadCourse(data, players, myId) {
    courseData = Array.isArray(data) ? data : [];
    roomPlayers = players || [];
    if (myId) localPlayerId = myId;
    localStage = 0;
    localFinished = false;
    finishTriggered = false;
    createCourseObjects();
    resetLocalPlayer(false);
    gameActive = true;
  }

  function createCourseObjects() {
    clearCourseObjects();

    courseData.forEach((stage, stageIndex) => {
      const stageZ = getStageZ(stageIndex);

      const voidMarker = new THREE.Mesh(
        new THREE.PlaneGeometry(19, VOID_DEPTH),
        new THREE.MeshBasicMaterial({ color: 0x172038 })
      );
      voidMarker.rotation.x = -Math.PI / 2;
      voidMarker.position.set(0, GROUND_Y + 0.015, stageZ);
      scene.add(voidMarker);
      courseObjects.push(voidMarker);

      const question = createTextSprite(`${stage.question.a} × ${stage.question.b}`, '#ffe36b', 'rgba(20,30,55,0.92)');
      question.position.set(0, 4.5, stageZ + 0.2);
      question.scale.set(4.6, 2.2, 1);
      scene.add(question);
      courseObjects.push(question);

      const totalWidth = 3 * PLATFORM_WIDTH + 2 * PLATFORM_GAP;
      const startX = -totalWidth / 2 + PLATFORM_WIDTH / 2;

      stage.options.forEach((value, optionIndex) => {
        const x = startX + optionIndex * (PLATFORM_WIDTH + PLATFORM_GAP);
        const geometry = new THREE.BoxGeometry(PLATFORM_WIDTH, PLATFORM_HEIGHT, PLATFORM_DEPTH);
        const material = new THREE.MeshToonMaterial({ color: 0x3f78bf });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(x, PLATFORM_SURFACE_Y - PLATFORM_HEIGHT / 2, stageZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        scene.add(mesh);

        const edge = new THREE.LineSegments(
          new THREE.EdgesGeometry(geometry),
          new THREE.LineBasicMaterial({ color: 0xffffff })
        );
        mesh.add(edge);

        const label = createTextSprite(String(value), '#ffffff', 'rgba(10,25,60,0.86)');
        label.position.set(x, PLATFORM_SURFACE_Y + 0.75, stageZ);
        scene.add(label);

        const platform = {
          mesh,
          label,
          stageIndex,
          optionIndex,
          isCorrect: optionIndex === stage.correctIndex,
          x,
          z: stageZ,
          originalY: mesh.position.y,
          collapsing: false,
          collapseSpeed: 0,
          passed: false,
        };
        platforms.push(platform);
        courseObjects.push(mesh, label);
      });
    });

    createFinishLine();
  }

  function createFinishLine() {
    const finishZ = getFinishZ();
    const white = new THREE.MeshToonMaterial({ color: 0xffffff });
    const gold = new THREE.MeshToonMaterial({ color: 0xffcc33 });

    [-5.6, 5.6].forEach((x) => {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.45, 5.8, 0.45), gold);
      post.position.set(x, 2.9, finishZ);
      post.castShadow = true;
      scene.add(post);
      courseObjects.push(post);
    });

    const beam = new THREE.Mesh(new THREE.BoxGeometry(11.7, 0.55, 0.55), gold);
    beam.position.set(0, 5.55, finishZ);
    scene.add(beam);
    courseObjects.push(beam);

    const banner = createTextSprite('FINISH 終點', '#1a1a2e', '#ffffff');
    banner.position.set(0, 4.7, finishZ);
    banner.scale.set(5.2, 1.6, 1);
    scene.add(banner);
    courseObjects.push(banner);

    const line = new THREE.Mesh(new THREE.PlaneGeometry(12, 1.4), white);
    line.rotation.x = -Math.PI / 2;
    line.position.set(0, GROUND_Y + 0.02, finishZ);
    scene.add(line);
    courseObjects.push(line);
  }

  function createTextSprite(text, color = '#ffffff', background = 'rgba(0,0,0,0.72)') {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 220;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    roundRect(ctx, 12, 12, 488, 196, 34);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 10;
    ctx.stroke();
    ctx.fillStyle = color;
    ctx.font = 'bold 92px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 256, 116);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, depthTest: false });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(3.2, 1.4, 1);
    return sprite;
  }

  function roundRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function clearCourseObjects() {
    courseObjects.forEach((object) => {
      scene.remove(object);
      if (object.geometry) object.geometry.dispose();
      if (object.material && object.material.map) object.material.map.dispose();
    });
    courseObjects = [];
    platforms = [];
  }

  function jump() {
    if (!gameActive || localFinished) return;
    const local = playerObjects.get(localPlayerId);
    if (!local || local.jumpCount >= 2) return;

    local.vel.y = JUMP_FORCE;
    local.onGround = false;
    local.jumpCount++;
    local.mesh.scale.set(0.92, 1.1, 0.92);
  }

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);

    if (gameActive) {
      updateLocalPlayer(dt);
      updateCollapsingPlatforms(dt);
      updateCamera();
    }
    updateClouds(dt);
    renderer.render(scene, camera);
  }

  function updateLocalPlayer(dt) {
    const obj = playerObjects.get(localPlayerId);
    if (!obj || localFinished) return;

    const input = Controls.getInput();
    obj.vel.x = input.x * MOVE_SPEED;
    obj.vel.z = input.y * MOVE_SPEED;

    if (!obj.onGround) obj.vel.y += GRAVITY * dt;

    const previousY = obj.mesh.position.y;
    obj.mesh.position.x += obj.vel.x * dt;
    obj.mesh.position.y += obj.vel.y * dt;
    obj.mesh.position.z += obj.vel.z * dt;
    obj.mesh.position.x = Math.max(-7, Math.min(7, obj.mesh.position.x));

    const checkpointZ = getCheckpointZ(localStage);
    obj.mesh.position.z = Math.min(checkpointZ + 3, obj.mesh.position.z);
    if (localStage < courseData.length) {
      obj.mesh.position.z = Math.max(getStageZ(localStage) - 2.15, obj.mesh.position.z);
    }

    obj.onGround = false;
    const landedOnPlatform = checkPlatformLanding(obj, previousY);

    if (!landedOnPlatform && !isInVoidZone(obj.mesh.position.z) && obj.mesh.position.y <= GROUND_Y) {
      landAtHeight(obj, GROUND_Y);
    }

    if (!obj.onGround && obj.mesh.position.y < FALL_RESET_Y) {
      resetLocalPlayer(!obj.fallReported);
    }

    if (!obj.onGround) {
      const stretch = Math.max(0.75, 1 + obj.vel.y * 0.018);
      obj.mesh.scale.set(1 / Math.sqrt(stretch), stretch, 1 / Math.sqrt(stretch));
    } else {
      obj.mesh.scale.lerp(new THREE.Vector3(1, 1, 1), 0.22);
      obj.bobTimer += dt * 3;
      obj.mesh.rotation.z = Math.sin(obj.bobTimer) * 0.025;
    }

    if (Math.abs(obj.vel.x) > 0.1 || Math.abs(obj.vel.z) > 0.1) {
      obj.mesh.rotation.y = Math.atan2(obj.vel.x, obj.vel.z);
    }

    if (localStage >= courseData.length && obj.mesh.position.z <= getFinishZ() && !finishTriggered) {
      finishTriggered = true;
      localFinished = true;
      obj.vel.set(0, 0, 0);
      onFinish();
    }

    onPositionUpdate({
      x: obj.mesh.position.x,
      y: obj.mesh.position.y,
      z: obj.mesh.position.z,
    });
  }

  function checkPlatformLanding(obj, previousY) {
    if (obj.vel.y > 0) return false;

    for (const platform of platforms) {
      if (platform.collapsing) continue;
      if (Math.abs(obj.mesh.position.x - platform.x) > PLATFORM_WIDTH / 2 + 0.22) continue;
      if (Math.abs(obj.mesh.position.z - platform.z) > PLATFORM_DEPTH / 2 + 0.22) continue;
      if (previousY < PLATFORM_SURFACE_Y - 0.45) continue;
      if (obj.mesh.position.y > PLATFORM_SURFACE_Y + 0.32) continue;

      if (platform.stageIndex === localStage) {
        if (platform.isCorrect) {
          landAtHeight(obj, PLATFORM_SURFACE_Y);
          if (!platform.passed) {
            platform.passed = true;
            platform.mesh.material.color.setHex(0x39c96f);
            const completedStage = localStage;
            localStage++;
            spawnConfetti(obj.mesh.position.x, obj.mesh.position.y + 1, obj.mesh.position.z);
            onStageCompleted(completedStage);
          }
          return true;
        }

        platform.collapsing = true;
        platform.collapseSpeed = 0;
        platform.mesh.material.color.setHex(0xe54747);
        obj.fallReported = true;
        onFall(localStage);
        return false;
      }

      if (platform.isCorrect && platform.stageIndex < localStage) {
        landAtHeight(obj, PLATFORM_SURFACE_Y);
        return true;
      }
    }

    return false;
  }

  function landAtHeight(obj, height) {
    obj.mesh.position.y = height;
    obj.vel.y = 0;
    obj.onGround = true;
    obj.jumpCount = 0;
  }

  function updateCollapsingPlatforms(dt) {
    platforms.forEach((platform) => {
      if (!platform.collapsing) return;
      platform.collapseSpeed += 11 * dt;
      platform.mesh.position.y -= platform.collapseSpeed * dt;
      platform.label.position.y -= platform.collapseSpeed * dt;
      platform.mesh.rotation.z += dt * 0.9;
      platform.mesh.material.transparent = true;
      platform.mesh.material.opacity = Math.max(0.15, platform.mesh.material.opacity - dt * 0.8);
      platform.label.material.opacity = platform.mesh.material.opacity;
    });
  }

  function resetLocalPlayer(reportFall) {
    const obj = playerObjects.get(localPlayerId);
    if (!obj) return;

    if (reportFall) onFall(Math.min(localStage, courseData.length - 1));
    restoreStagePlatforms(Math.min(localStage, courseData.length - 1));

    const playerIndex = Math.max(0, roomPlayers.findIndex((player) => player.id === localPlayerId));
    obj.mesh.position.set(startXForIndex(playerIndex, roomPlayers.length), GROUND_Y, getCheckpointZ(localStage));
    obj.vel.set(0, 0, 0);
    obj.onGround = true;
    obj.jumpCount = 0;
    obj.fallReported = false;
    obj.mesh.scale.set(1, 1, 1);
  }

  function restoreStagePlatforms(stageIndex) {
    platforms.forEach((platform) => {
      if (platform.stageIndex !== stageIndex || platform.isCorrect) return;
      platform.collapsing = false;
      platform.collapseSpeed = 0;
      platform.mesh.position.y = platform.originalY;
      platform.mesh.rotation.set(0, 0, 0);
      platform.mesh.material.opacity = 1;
      platform.mesh.material.transparent = false;
      platform.mesh.material.color.setHex(0x3f78bf);
      platform.label.position.y = PLATFORM_SURFACE_Y + 0.75;
      platform.label.material.opacity = 1;
    });
  }

  function spawnConfetti(x, y, z) {
    const colors = [0xffcc44, 0x44aaff, 0xff6699, 0x44ff88];
    for (let i = 0; i < 14; i++) {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.14, 0.14, 0.14),
        new THREE.MeshToonMaterial({ color: colors[i % colors.length] })
      );
      mesh.position.set(x, y, z);
      const angle = Math.random() * Math.PI * 2;
      mesh.userData.vel = new THREE.Vector3(Math.cos(angle) * 4, 5 + Math.random() * 3, Math.sin(angle) * 4);
      mesh.userData.life = 1.2;
      scene.add(mesh);
      courseObjects.push(mesh);
    }
  }

  function updateCamera() {
    const local = playerObjects.get(localPlayerId);
    if (!local) return;

    const targetX = local.mesh.position.x * 0.35;
    const targetY = local.mesh.position.y + 7.2;
    const targetZ = local.mesh.position.z + 10.5;
    camera.position.x += (targetX - camera.position.x) * 0.07;
    camera.position.y += (targetY - camera.position.y) * 0.07;
    camera.position.z += (targetZ - camera.position.z) * 0.07;
    camera.lookAt(local.mesh.position.x * 0.35, local.mesh.position.y + 0.8, local.mesh.position.z - 5.2);
  }

  function updateClouds(dt) {
    particles.forEach((cloud) => {
      cloud.position.x += cloud.userData.speed * dt;
      if (cloud.position.x > 35) cloud.position.x = -35;
    });
  }

  function updateRemotePlayer(playerId, position) {
    const obj = playerObjects.get(playerId);
    if (!obj || obj.isLocal || !position) return;
    obj.mesh.position.x += (position.x - obj.mesh.position.x) * 0.24;
    obj.mesh.position.y += (position.y - obj.mesh.position.y) * 0.24;
    obj.mesh.position.z += (position.z - obj.mesh.position.z) * 0.24;
  }

  function setLocalStage(stage) {
    localStage = Math.max(0, Math.min(courseData.length, Number(stage) || 0));
  }

  function setFinished(finished) {
    localFinished = Boolean(finished);
    if (localFinished) gameActive = false;
  }

  function setGameActive(active) {
    gameActive = Boolean(active);
  }

  function getStageZ(stageIndex) {
    return FIRST_STAGE_Z - stageIndex * STAGE_SPACING;
  }

  function getCheckpointZ(stageIndex) {
    if (courseData.length === 0) return 2;
    if (stageIndex >= courseData.length) return getStageZ(courseData.length - 1) - 4.6;
    return getStageZ(stageIndex) + 5.2;
  }

  function getFinishZ() {
    const lastStage = Math.max(0, courseData.length - 1);
    return getStageZ(lastStage) - 9;
  }

  function isInVoidZone(z) {
    return courseData.some((_, index) => Math.abs(z - getStageZ(index)) <= VOID_DEPTH / 2);
  }

  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  }

  function dispose() {
    window.removeEventListener('resize', onResize);
    clearCourseObjects();
    if (renderer) renderer.dispose();
  }

  return {
    init,
    setupPlayers,
    loadCourse,
    jump,
    setGameActive,
    setLocalStage,
    setFinished,
    updateRemotePlayer,
    dispose,
  };
})();
