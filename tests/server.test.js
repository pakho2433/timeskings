const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const http = require('node:http');
const path = require('node:path');
const WebSocket = require('ws');

async function unusedPort() {
  const probe = net.createServer();
  await new Promise((resolve, reject) => {
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', resolve);
  });
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  return port;
}

async function connect(url) {
  const socket = new WebSocket(url);
  const messages = [];
  const waiters = new Set();
  socket.on('message', (data) => {
    const message = JSON.parse(data);
    messages.push(message);
    for (const waiter of [...waiters]) {
      if (waiter.predicate(message)) {
        clearTimeout(waiter.timer);
        waiters.delete(waiter);
        waiter.resolve(message);
      }
    }
  });
  const client = {
    socket,
    messages,
    wait(type, predicate = () => true, since = 0) {
      const match = (message) => message.type === type && predicate(message);
      const received = messages.slice(since).find(match);
      if (received) return Promise.resolve(received);
      return new Promise((resolve, reject) => {
        const waiter = { predicate: match, resolve };
        waiter.timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error(`Timed out waiting for ${type}`));
        }, 5000);
        waiters.add(waiter);
      });
    },
    async send(type, data, response, predicate) {
      const since = messages.length;
      socket.send(JSON.stringify({ type, ...data }));
      return client.wait(response, predicate, since);
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      await new Promise((resolve) => {
        socket.once('close', resolve);
        socket.close();
      });
    },
  };
  const ready = client.wait('CONNECTED');
  socket.once('error', (error) => {
    for (const waiter of waiters) {
      clearTimeout(waiter.timer);
      waiter.resolve({ type: 'CONNECTION_ERROR', error: error.message });
    }
    waiters.clear();
  });
  const connected = await ready;
  assert.equal(connected.type, 'CONNECTED');
  client.id = connected.playerId;
  return client;
}

async function completeStages(client) {
  for (let stageIndex = 0; stageIndex < 10; stageIndex++) {
    await client.send('PLAYER_STAGE_SUCCESS', { stageIndex }, 'PLAYER_PROGRESS',
      (message) => message.playerId === client.id && message.currentStage === stageIndex + 1);
  }
}

async function main() {
  const port = await unusedPort();
  const child = spawn(process.execPath, [path.join(__dirname, '../server/server.js')], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const clients = [];
  let stderr = '';
  child.stderr.on('data', (data) => { stderr += data; });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Server startup timeout: ${stderr}`)), 5000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code) => { clearTimeout(timer); reject(new Error(`Server exited: ${code} ${stderr}`)); });
      child.stdout.on('data', (data) => {
        if (data.toString().includes('伺服器啟動')) { clearTimeout(timer); resolve(); }
      });
    });
    const response = await new Promise((resolve, reject) => {
      http.get(`http://127.0.0.1:${port}/`, (result) => {
        let body = '';
        result.setEncoding('utf8');
        result.on('data', (data) => { body += data; });
        result.on('end', () => resolve({ status: result.statusCode, body }));
      }).once('error', reject);
    });
    assert.equal(response.status, 200);
    assert.match(response.body, /熊仔乘法跑酷/);

    for (let i = 0; i < 5; i++) clients.push(await connect(`ws://127.0.0.1:${port}`));
    const [a, b, c, d, extra] = clients;
    const created = await a.send('CREATE_ROOM', { playerName: 'A' }, 'ROOM_CREATED');
    const roomCode = created.roomCode;
    assert.match(roomCode, /^[A-Z2-9]{5}$/);
    for (const [index, client] of [b, c, d].entries()) {
      await client.send('JOIN_ROOM', { roomCode, playerName: `玩家${index + 2}` }, 'ROOM_JOINED');
    }
    const full = await extra.send('JOIN_ROOM', { roomCode }, 'JOIN_FAILED');
    assert.equal(full.error, 'ROOM_FULL');

    // A non-creator can start; every player receives the identical ten-stage course.
    const started = await b.send('START_GAME', {}, 'COURSE_START');
    assert.equal(started.courseData.length, 10);
    for (const client of [a, c, d]) {
      assert.deepEqual((await client.wait('COURSE_START')).courseData, started.courseData);
    }

    // Skipped stages and finishing before ten stages must be ignored.
    a.socket.send(JSON.stringify({ type: 'PLAYER_STAGE_SUCCESS', stageIndex: 9 }));
    a.socket.send(JSON.stringify({ type: 'PLAYER_FINISH' }));
    await a.send('PING', {}, 'PONG');
    assert.equal(a.messages.filter((message) => message.type === 'PLAYER_PROGRESS').length, 0);
    assert.equal(a.messages.filter((message) => message.type === 'PLAYER_FINISHED').length, 0);

    const fell = await c.send('PLAYER_FALL', { stageIndex: 0 }, 'PLAYER_FELL',
      (message) => message.playerId === c.id);
    assert.equal(fell.falls, 1);
    assert.equal(fell.stageIndex, 0);

    await completeStages(a);
    const progress = a.messages.filter((message) => message.type === 'PLAYER_PROGRESS').slice(-1)[0];
    assert.equal(progress.roomInfo.players.find((player) => player.id === b.id).currentStage, 0);
    assert.equal(a.messages.some((message) => message.type === 'PLAYER_FINISHED'), false);
    const first = await a.send('PLAYER_FINISH', {}, 'PLAYER_FINISHED', (message) => message.playerId === a.id);
    assert.equal(first.rank, 1);
    assert.equal(a.messages.some((message) => message.type === 'GAME_COMPLETED'), false);

    // Duplicate finish notifications must not consume another rank.
    const finishedCount = a.messages.filter((message) => message.type === 'PLAYER_FINISHED').length;
    a.socket.send(JSON.stringify({ type: 'PLAYER_FINISH' }));
    await a.send('PING', {}, 'PONG');
    assert.equal(a.messages.filter((message) => message.type === 'PLAYER_FINISHED').length, finishedCount);

    await completeStages(b);
    assert.equal((await b.send('PLAYER_FINISH', {}, 'PLAYER_FINISHED', (message) => message.playerId === b.id)).rank, 2);

    // Regression: an earlier finisher disconnects; later ranks must remain 3 and 4.
    await a.close();
    await b.wait('PLAYER_LEFT', (message) => message.playerId === a.id);
    await completeStages(c);
    assert.equal((await c.send('PLAYER_FINISH', {}, 'PLAYER_FINISHED', (message) => message.playerId === c.id)).rank, 3);
    await completeStages(d);
    assert.equal((await d.send('PLAYER_FINISH', {}, 'PLAYER_FINISHED', (message) => message.playerId === d.id)).rank, 4);
    const completed = await d.wait('GAME_COMPLETED');
    assert.deepEqual(completed.leaderboard.map((player) => player.rank), [2, 3, 4]);
    assert.equal(completed.leaderboard.find((player) => player.id === c.id).falls, 1);
    assert.equal(completed.leaderboard.every((player) => player.isFinished), true);
    assert.equal(new Set(completed.leaderboard.map((player) => player.rank)).size, 3);

    // Once a slot is freed, the already-started/finished room still cannot be joined.
    const closedRoom = await extra.send('JOIN_ROOM', { roomCode }, 'JOIN_FAILED');
    assert.equal(closedRoom.error, 'GAME_ALREADY_STARTED');

    // A solo player can run a new race and finish first.
    await extra.send('CREATE_ROOM', { playerName: '單人' }, 'ROOM_CREATED');
    const soloStart = extra.messages.length;
    await extra.send('START_GAME', {}, 'COURSE_START');
    await completeStages(extra);
    assert.equal((await extra.send('PLAYER_FINISH', {}, 'PLAYER_FINISHED', (message) => message.playerId === extra.id)).rank, 1);
    assert.equal((await extra.wait('GAME_COMPLETED', () => true, soloStart)).leaderboard.length, 1);

    // Disconnecting an unfinished player lets the remaining finisher reach settlement.
    const e = await connect(`ws://127.0.0.1:${port}`);
    const f = await connect(`ws://127.0.0.1:${port}`);
    clients.push(e, f);
    const pair = await e.send('CREATE_ROOM', { playerName: 'E' }, 'ROOM_CREATED');
    await f.send('JOIN_ROOM', { roomCode: pair.roomCode, playerName: 'F' }, 'ROOM_JOINED');
    await e.send('START_GAME', {}, 'COURSE_START');
    await completeStages(e);
    await e.send('PLAYER_FINISH', {}, 'PLAYER_FINISHED', (message) => message.playerId === e.id);
    assert.equal(e.messages.some((message) => message.type === 'GAME_COMPLETED'), false);
    await f.close();
    assert.equal((await e.wait('GAME_COMPLETED')).leaderboard.length, 1);
    console.log('HTTP and WebSocket race integration tests passed');
  } finally {
    await Promise.all(clients.map((client) => client.close()));
    child.kill();
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
