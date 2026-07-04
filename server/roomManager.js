/**
 * roomManager.js
 * 房間建立、加入、人數與對戰玩家資料管理
 */

const MAX_PLAYERS_PER_ROOM = 4;
const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

function createRoom(playerId, playerName) {
  const code = generateRoomCode();
  const player = createPlayer(playerId, playerName, 0);

  const room = {
    code,
    players: new Map([[playerId, player]]),
    gameState: 'waiting',
    currentLevel: 0,
    levelData: null,
    completedPlayers: new Set(),
    missCount: 0,
    startTime: null,
  };

  rooms.set(code, room);
  return { room, player };
}

function joinRoom(code, playerId, playerName) {
  if (typeof code !== 'string') {
    return { success: false, error: 'ROOM_NOT_FOUND' };
  }

  const room = rooms.get(code.toUpperCase());
  if (!room) return { success: false, error: 'ROOM_NOT_FOUND' };
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    return { success: false, error: 'ROOM_FULL' };
  }
  if (room.gameState !== 'waiting') {
    return { success: false, error: 'GAME_ALREADY_STARTED' };
  }

  const slotIndex = getNextSlotIndex(room);
  const player = createPlayer(playerId, playerName, slotIndex);
  room.players.set(playerId, player);

  return { success: true, room, player };
}

function leaveRoom(playerId) {
  for (const [code, room] of rooms) {
    if (!room.players.has(playerId)) continue;

    room.players.delete(playerId);
    room.completedPlayers.delete(playerId);

    if (room.players.size === 0) {
      rooms.delete(code);
      return { wasLast: true };
    }

    return { room, wasLast: false };
  }
  return { wasLast: false };
}

function getRoomByPlayerId(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function createPlayer(id, name, slotIndex) {
  const colors = [0xff4444, 0x44aaff, 0x44ff88, 0xffcc44];
  return {
    id,
    name: sanitizePlayerName(name) || `玩家 ${slotIndex + 1}`,
    slotIndex,
    color: colors[slotIndex % colors.length],
    position: { x: (slotIndex - 1.5) * 2, y: 1, z: 0 },
    hasCompleted: false,
    lastPlacement: null,
    score: 0,
    correctAnswers: 0,
    wrongAnswers: 0,
  };
}

function sanitizePlayerName(name) {
  if (typeof name !== 'string') return '';
  return name.trim().slice(0, 12);
}

function getNextSlotIndex(room) {
  const usedSlots = new Set([...room.players.values()].map((p) => p.slotIndex));
  for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i++) {
    if (!usedSlots.has(i)) return i;
  }
  return room.players.size;
}

function getRoomInfo(room) {
  return {
    code: room.code,
    gameState: room.gameState,
    currentLevel: room.currentLevel,
    playerCount: room.players.size,
    maxPlayers: MAX_PLAYERS_PER_ROOM,
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      slotIndex: p.slotIndex,
      color: p.color,
      hasCompleted: p.hasCompleted,
      lastPlacement: p.lastPlacement,
      score: p.score,
      correctAnswers: p.correctAnswers,
      wrongAnswers: p.wrongAnswers,
    })),
  };
}

module.exports = {
  createRoom,
  joinRoom,
  leaveRoom,
  getRoomByPlayerId,
  getRoomInfo,
  MAX_PLAYERS_PER_ROOM,
};
