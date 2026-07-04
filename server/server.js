/**
 * server.js
 * Node.js + Express + WebSocket 伺服器
 * 負責房間管理、多人位置同步與對戰計分
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomByPlayerId,
  getRoomInfo,
} = require('./roomManager');
const {
  generateLevel,
  getPlacementPoints,
  buildLeaderboard,
  TOTAL_LEVELS,
  WRONG_ANSWER_PENALTY,
} = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, '../public')));

let playerIdCounter = 0;
const playerSockets = new Map();

function broadcastToRoom(room, message, excludeId = null) {
  const data = JSON.stringify(message);
  for (const [pid] of room.players) {
    if (pid === excludeId) continue;
    const ws = playerSockets.get(pid);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
  }
}

function sendToPlayer(playerId, message) {
  const ws = playerSockets.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

function startLevel(room) {
  if (!room || room.gameState !== 'playing' || room.players.size === 0) return;

  room.transitionScheduled = false;
  room.currentLevel++;
  room.completedPlayers = new Set();
  room.levelData = generateLevel(room.currentLevel);

  for (const player of room.players.values()) {
    player.hasCompleted = false;
    player.lastPlacement = null;
  }

  broadcastToRoom(room, {
    type: 'LEVEL_START',
    level: room.currentLevel,
    levelData: room.levelData,
    roomInfo: getRoomInfo(room),
  });
}

function checkAllCompleted(room) {
  const activePlayers = [...room.players.keys()];
  return activePlayers.length > 0 && activePlayers.every((pid) => room.completedPlayers.has(pid));
}

function finishGame(room) {
  if (!room || room.gameState !== 'playing') return;

  room.gameState = 'finished';
  room.transitionScheduled = false;
  const elapsed = Math.floor((Date.now() - room.startTime) / 1000);
  const leaderboard = buildLeaderboard(room.players.values());

  broadcastToRoom(room, {
    type: 'GAME_COMPLETED',
    totalTime: elapsed,
    missCount: room.missCount,
    leaderboard,
    winner: leaderboard[0] || null,
  });
}

function completeRound(room) {
  if (!room || room.transitionScheduled || !checkAllCompleted(room)) return;

  if (room.currentLevel >= TOTAL_LEVELS) {
    finishGame(room);
    return;
  }

  room.transitionScheduled = true;
  setTimeout(() => startLevel(room), 2000);
}

wss.on('connection', (ws) => {
  const playerId = `p${++playerIdCounter}`;
  playerSockets.set(playerId, ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', playerId }));

  ws.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      case 'CREATE_ROOM': {
        const { room, player } = createRoom(playerId, msg.playerName);
        sendToPlayer(playerId, {
          type: 'ROOM_CREATED',
          roomCode: room.code,
          player,
          roomInfo: getRoomInfo(room),
        });
        break;
      }

      case 'JOIN_ROOM': {
        const result = joinRoom(msg.roomCode, playerId, msg.playerName);
        if (!result.success) {
          sendToPlayer(playerId, { type: 'JOIN_FAILED', error: result.error });
          break;
        }

        const { room, player } = result;
        sendToPlayer(playerId, {
          type: 'ROOM_JOINED',
          roomCode: room.code,
          player,
          roomInfo: getRoomInfo(room),
        });
        broadcastToRoom(room, {
          type: 'PLAYER_JOINED',
          player,
          roomInfo: getRoomInfo(room),
        }, playerId);
        break;
      }

      case 'START_GAME': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'waiting' || room.players.size < 1) break;

        room.gameState = 'playing';
        room.startTime = Date.now();
        room.missCount = 0;
        room.currentLevel = 0;
        room.transitionScheduled = false;

        for (const player of room.players.values()) {
          player.score = 0;
          player.correctAnswers = 0;
          player.wrongAnswers = 0;
          player.hasCompleted = false;
          player.lastPlacement = null;
        }

        startLevel(room);
        break;
      }

      case 'PLAYER_MOVE': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (player && msg.position && typeof msg.position === 'object') {
          player.position = msg.position;
        }

        broadcastToRoom(room, {
          type: 'PLAYER_MOVED',
          playerId,
          position: msg.position,
          animState: msg.animState,
        }, playerId);
        break;
      }

      case 'WRONG_ANSWER': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (!player || room.completedPlayers.has(playerId)) break;

        room.missCount++;
        player.wrongAnswers++;
        player.score = Math.max(0, player.score - WRONG_ANSWER_PENALTY);

        broadcastToRoom(room, {
          type: 'PLAYER_MISS',
          playerId,
          penalty: WRONG_ANSWER_PENALTY,
          score: player.score,
          missCount: room.missCount,
          roomInfo: getRoomInfo(room),
        });
        break;
      }

      case 'CORRECT_ANSWER': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (!player || room.completedPlayers.has(playerId)) break;

        const placement = room.completedPlayers.size + 1;
        const points = getPlacementPoints(placement);

        room.completedPlayers.add(playerId);
        player.hasCompleted = true;
        player.lastPlacement = placement;
        player.correctAnswers++;
        player.score += points;

        broadcastToRoom(room, {
          type: 'PLAYER_COMPLETED',
          playerId,
          placement,
          points,
          score: player.score,
          completedCount: room.completedPlayers.size,
          totalPlayers: room.players.size,
          roomInfo: getRoomInfo(room),
        });

        completeRound(room);
        break;
      }

      case 'PING': {
        sendToPlayer(playerId, { type: 'PONG' });
        break;
      }

      default:
        break;
    }
  });

  ws.on('close', () => {
    const room = getRoomByPlayerId(playerId);
    if (room) {
      const player = room.players.get(playerId);
      const { wasLast } = leaveRoom(playerId);

      if (!wasLast) {
        broadcastToRoom(room, {
          type: 'PLAYER_LEFT',
          playerId,
          playerName: player ? player.name : '',
          roomInfo: getRoomInfo(room),
        });

        if (room.gameState === 'playing') completeRound(room);
      }
    }
    playerSockets.delete(playerId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for player ${playerId}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`乘法王對戰伺服器啟動：http://localhost:${PORT}`);
});
