/**
 * roomManager.js
 * 房間建立、加入、人數管理
 */

const MAX_PLAYERS_PER_ROOM = 4;

// 儲存所有房間
// Map<roomCode, Room>
const rooms = new Map();

/**
 * Room 物件結構
 * {
 *   code: string,
 *   players: Map<playerId, PlayerInfo>,
 *   gameState: 'waiting' | 'playing' | 'finished',
 *   currentLevel: number,
 *   levelData: object | null,
 *   completedPlayers: Set<playerId>,
 *   missCount: number,        // 全房間踩空次數
 *   startTime: number | null,
 * }
 */

/**
 * 產生唯一的 4-6 碼房間代碼
 * @returns {string}
 */
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}

/**
 * 建立新房間
 * @param {string} playerId
 * @param {string} playerName
 * @returns {{ room, player }}
 */
function createRoom(playerId, playerName) {
  const code = generateRoomCode();
  const player = createPlayer(playerId, playerName, 0); // 房主是第 0 號玩家

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

/**
 * 加入現有房間
 * @param {string} code
 * @param {string} playerId
 * @param {string} playerName
 * @returns {{ success: boolean, room?, player?, error? }}
 */
function joinRoom(code, playerId, playerName) {
  const room = rooms.get(code.toUpperCase());

  if (!room) {
    return { success: false, error: 'ROOM_NOT_FOUND' };
  }
  if (room.players.size >= MAX_PLAYERS_PER_ROOM) {
    return { success: false, error: 'ROOM_FULL' };
  }
  if (room.gameState === 'playing') {
    return { success: false, error: 'GAME_ALREADY_STARTED' };
  }

  const slotIndex = getNextSlotIndex(room);
  const player = createPlayer(playerId, playerName, slotIndex);
  room.players.set(playerId, player);

  return { success: true, room, player };
}

/**
 * 玩家離開房間
 * @param {string} playerId
 * @returns {{ room?, wasLast: boolean }}
 */
function leaveRoom(playerId) {
  for (const [code, room] of rooms) {
    if (room.players.has(playerId)) {
      room.players.delete(playerId);
      room.completedPlayers.delete(playerId);

      if (room.players.size === 0) {
        rooms.delete(code);
        return { wasLast: true };
      }

      return { room, wasLast: false };
    }
  }
  return { wasLast: false };
}

/**
 * 取得玩家所在的房間
 * @param {string} playerId
 * @returns {object | null}
 */
function getRoomByPlayerId(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

/**
 * 建立玩家資料物件
 */
function createPlayer(id, name, slotIndex) {
  const colors = [0xff4444, 0x44aaff, 0x44ff88, 0xffcc44];
  return {
    id,
    name: name || `玩家 ${slotIndex + 1}`,
    slotIndex,
    color: colors[slotIndex % colors.length],
    position: { x: (slotIndex - 1.5) * 2, y: 1, z: 0 },
    isReady: false,
    hasCompleted: false,
  };
}

/**
 * 取得房間中的下一個空位索引
 */
function getNextSlotIndex(room) {
  const usedSlots = new Set([...room.players.values()].map((p) => p.slotIndex));
  for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i++) {
    if (!usedSlots.has(i)) return i;
  }
  return room.players.size;
}

/**
 * 取得房間的公開資訊（不含 WebSocket 物件）
 */
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
