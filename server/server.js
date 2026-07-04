/**
 * server.js
 * Node.js + Express + WebSocket：10 關熊仔乘法跑酷競賽
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
  generateCourse,
  buildRaceLeaderboard,
  TOTAL_STAGES,
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

function allRemainingPlayersFinished(room) {
  const players = [...room.players.values()];
  return players.length > 0 && players.every((player) => player.isFinished);
}

function finishRace(room) {
  if (!room || room.gameState !== 'playing') return;
  room.gameState = 'finished';

  broadcastToRoom(room, {
    type: 'GAME_COMPLETED',
    totalTime: Math.floor((Date.now() - room.startTime) / 1000),
    leaderboard: buildRaceLeaderboard(room.players.values()),
  });
}

wss.on('connection', (ws) => {
  const playerId = `p${++playerIdCounter}`;
  playerSockets.set(playerId, ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', playerId }));

  ws.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch (error) {
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
        room.courseData = generateCourse();
        room.finishOrder = [];

        for (const player of room.players.values()) {
          player.currentStage = 0;
          player.isFinished = false;
          player.finishTime = null;
          player.finishRank = null;
          player.falls = 0;
        }

        broadcastToRoom(room, {
          type: 'COURSE_START',
          courseData: room.courseData,
          roomInfo: getRoomInfo(room),
        });
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
        }, playerId);
        break;
      }

      case 'PLAYER_STAGE_SUCCESS': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        const stageIndex = Number(msg.stageIndex);
        if (!player || player.isFinished) break;
        if (!Number.isInteger(stageIndex) || stageIndex !== player.currentStage) break;
        if (stageIndex < 0 || stageIndex >= TOTAL_STAGES) break;

        player.currentStage++;
        broadcastToRoom(room, {
          type: 'PLAYER_PROGRESS',
          playerId,
          completedStage: stageIndex,
          currentStage: player.currentStage,
          roomInfo: getRoomInfo(room),
        });
        break;
      }

      case 'PLAYER_FALL': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (!player || player.isFinished) break;
        player.falls++;

        broadcastToRoom(room, {
          type: 'PLAYER_FELL',
          playerId,
          stageIndex: player.currentStage,
          falls: player.falls,
          roomInfo: getRoomInfo(room),
        });
        break;
      }

      case 'PLAYER_FINISH': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (!player || player.isFinished || player.currentStage < TOTAL_STAGES) break;

        player.isFinished = true;
        player.finishRank = room.finishOrder.length + 1;
        player.finishTime = Math.floor((Date.now() - room.startTime) / 1000);
        room.finishOrder.push(playerId);

        broadcastToRoom(room, {
          type: 'PLAYER_FINISHED',
          playerId,
          rank: player.finishRank,
          finishTime: player.finishTime,
          roomInfo: getRoomInfo(room),
        });

        if (allRemainingPlayersFinished(room)) finishRace(room);
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

        if (room.gameState === 'playing' && allRemainingPlayersFinished(room)) {
          finishRace(room);
        }
      }
    }
    playerSockets.delete(playerId);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error for player ${playerId}:`, error.message);
  });
});

server.listen(PORT, () => {
  console.log(`熊仔乘法跑酷伺服器啟動：http://localhost:${PORT}`);
});
