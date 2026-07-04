const assert = require('assert');
const {
  generateStage,
  generateCourse,
  buildRaceLeaderboard,
  TOTAL_STAGES,
  OPTIONS_PER_STAGE,
} = require('../server/gameLogic');

assert.strictEqual(TOTAL_STAGES, 10);
assert.strictEqual(OPTIONS_PER_STAGE, 3);

for (let i = 0; i < 100; i++) {
  const stage = generateStage(i % TOTAL_STAGES);
  assert.strictEqual(stage.options.length, 3);
  assert.strictEqual(new Set(stage.options).size, 3);
  assert.strictEqual(stage.options[stage.correctIndex], stage.question.answer);
}

const course = generateCourse();
assert.strictEqual(course.length, 10);
assert.deepStrictEqual(course.map((stage) => stage.stageNumber), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

const leaderboard = buildRaceLeaderboard([
  { id: 'c', name: 'C', color: 3, isFinished: false, finishRank: null, finishTime: null, currentStage: 7, falls: 1, slotIndex: 2 },
  { id: 'b', name: 'B', color: 2, isFinished: true, finishRank: 2, finishTime: 55, currentStage: 10, falls: 0, slotIndex: 1 },
  { id: 'a', name: 'A', color: 1, isFinished: true, finishRank: 1, finishTime: 49, currentStage: 10, falls: 2, slotIndex: 0 },
  { id: 'd', name: 'D', color: 4, isFinished: false, finishRank: null, finishTime: null, currentStage: 5, falls: 0, slotIndex: 3 },
]);

assert.deepStrictEqual(leaderboard.map((player) => player.id), ['a', 'b', 'c', 'd']);
assert.deepStrictEqual(leaderboard.map((player) => player.rank), [1, 2, 3, 4]);

console.log('bear race gameLogic tests passed');
