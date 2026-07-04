/**
 * server.js
 * Node.js + Express + WebSocket 伺服器
 * 負責房間管理與遊戲狀態同步
 */

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { createRoom, joinRoom, leaveRoom, getRoomByPlayerId, getRoomInfo } = require('./roomManager');
const { generateLevel, TOTAL_LEVELS } = require('./gameLogic');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const PORT = process.env.PORT || 3000;

// 靜態檔案服務
app.use(express.static(path.join(__dirname, '../public')));

// 玩家 ID 計數器
let playerIdCounter = 0;

// playerId -> WebSocket
const playerSockets = new Map();

/**
 * 向房間內所有玩家廣播訊息
 */
function broadcastToRoom(room, message, excludeId = null) {
  const data = JSON.stringify(message);
  for (const [pid, player] of room.players) {
    if (pid === excludeId) continue;
    const ws = playerSockets.get(pid);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(data);
    }
  }
}

/**
 * 傳送訊息給特定玩家
 */
function sendToPlayer(playerId, message) {
  const ws = playerSockets.get(playerId);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

/**
 * 開始新關卡
 */
function startLevel(room) {
  room.currentLevel++;
  room.completedPlayers = new Set();
  room.levelData = generateLevel(room.currentLevel);

  // 重設所有玩家的完成狀態
  for (const player of room.players.values()) {
    player.hasCompleted = false;
  }

  broadcastToRoom(room, {
    type: 'LEVEL_START',
    level: room.currentLevel,
    levelData: room.levelData,
    roomInfo: getRoomInfo(room),
  });
}

/**
 * 檢查是否所有玩家都完成了當前關卡
 */
function checkAllCompleted(room) {
  const activePlayers = [...room.players.keys()];
  return activePlayers.every((pid) => room.completedPlayers.has(pid));
}

// WebSocket 連線處理
wss.on('connection', (ws) => {
  const playerId = `p${++playerIdCounter}`;
  playerSockets.set(playerId, ws);

  // 送出玩家 ID
  ws.send(JSON.stringify({ type: 'CONNECTED', playerId }));

  ws.on('message', (rawData) => {
    let msg;
    try {
      msg = JSON.parse(rawData);
    } catch (e) {
      return;
    }

    switch (msg.type) {
      // === 房間管理 ===
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
        // 通知房間其他玩家
        broadcastToRoom(room, {
          type: 'PLAYER_JOINED',
          player,
          roomInfo: getRoomInfo(room),
        }, playerId);
        break;
      }

      case 'START_GAME': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'waiting') break;
        if (room.players.size < 1) break;

        room.gameState = 'playing';
        room.startTime = Date.now();
        room.missCount = 0;
        room.currentLevel = 0;

        startLevel(room);
        break;
      }

      // === 遊戲事件 ===
      case 'PLAYER_MOVE': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (player) {
          player.position = msg.position;
        }

        // 廣播位置給其他玩家
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

        room.missCount++;
        broadcastToRoom(room, {
          type: 'PLAYER_MISS',
          playerId,
          missCount: room.missCount,
        });
        break;
      }

      case 'CORRECT_ANSWER': {
        const room = getRoomByPlayerId(playerId);
        if (!room || room.gameState !== 'playing') break;

        const player = room.players.get(playerId);
        if (!player || room.completedPlayers.has(playerId)) break;

        room.completedPlayers.add(playerId);
        player.hasCompleted = true;

        broadcastToRoom(room, {
          type: 'PLAYER_COMPLETED',
          playerId,
          completedCount: room.completedPlayers.size,
          totalPlayers: room.players.size,
          roomInfo: getRoomInfo(room),
        });

        // 檢查是否全員完成
        if (checkAllCompleted(room)) {
          if (room.currentLevel >= TOTAL_LEVELS) {
            // 遊戲通關
            room.gameState = 'finished';
            const elapsed = Math.floor((Date.now() - room.startTime) / 1000);
            broadcastToRoom(room, {
              type: 'GAME_COMPLETED',
              totalTime: elapsed,
              missCount: room.missCount,
            });
          } else {
            // 進入下一關（短暫延遲讓玩家看到動畫）
            setTimeout(() => startLevel(room), 2000);
          }
        }
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

        // 若遊戲進行中，有玩家離線，重新檢查是否全員完成
        if (room.gameState === 'playing' && checkAllCompleted(room)) {
          if (room.currentLevel >= TOTAL_LEVELS) {
            room.gameState = 'finished';
            const elapsed = Math.floor((Date.now() - room.startTime) / 1000);
            broadcastToRoom(room, {
              type: 'GAME_COMPLETED',
              totalTime: elapsed,
              missCount: room.missCount,
            });
          } else {
            setTimeout(() => startLevel(room), 2000);
          }
        }
      }
    }
    playerSockets.delete(playerId);
  });

  ws.on('error', (err) => {
    console.error(`WebSocket error for player ${playerId}:`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`乘法王 伺服器啟動：http://localhost:${PORT}`);
});
