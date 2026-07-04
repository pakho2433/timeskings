const assert = require('assert');
const {
  generateLevel,
  getPlacementPoints,
  buildLeaderboard,
  TOTAL_LEVELS,
  WRONG_ANSWER_PENALTY,
} = require('../server/gameLogic');

assert.strictEqual(TOTAL_LEVELS, 10);
assert.strictEqual(WRONG_ANSWER_PENALTY, 10);
assert.deepStrictEqual(
  [1, 2, 3, 4, 5].map(getPlacementPoints),
  [100, 70, 50, 30, 0]
);

for (let levelNumber = 1; levelNumber <= 100; levelNumber++) {
  const level = generateLevel(levelNumber);
  assert.ok(level.options.length === 3 || level.options.length === 4);
  assert.strictEqual(new Set(level.options).size, level.options.length);
  assert.strictEqual(level.options[level.correctIndex], level.question.answer);
}

const leaderboard = buildLeaderboard([
  { id: 'b', name: 'B', color: 2, score: 300, correctAnswers: 8, wrongAnswers: 2, slotIndex: 1 },
  { id: 'a', name: 'A', color: 1, score: 300, correctAnswers: 9, wrongAnswers: 5, slotIndex: 0 },
  { id: 'c', name: 'C', color: 3, score: 250, correctAnswers: 10, wrongAnswers: 0, slotIndex: 2 },
]);

assert.deepStrictEqual(leaderboard.map((p) => p.id), ['a', 'b', 'c']);
assert.deepStrictEqual(leaderboard.map((p) => p.rank), [1, 2, 3]);

console.log('gameLogic tests passed');
