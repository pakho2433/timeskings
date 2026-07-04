/**
 * gameLogic.js
 * 出題、對戰計分與最終排名邏輯
 */

const TOTAL_LEVELS = 10;
const PLACEMENT_POINTS = [100, 70, 50, 30];
const WRONG_ANSWER_PENALTY = 10;

/**
 * 產生個位數 × 個位數的乘法題目
 * @returns {{ a: number, b: number, answer: number }}
 */
function generateQuestion() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a * b };
}

/**
 * 產生 3-4 個答案選項（1 個正確，其餘為合理干擾值）
 * @param {number} correctAnswer
 * @param {number} numOptions
 * @returns {number[]}
 */
function generateOptions(correctAnswer, numOptions = 3) {
  const options = new Set([correctAnswer]);
  let attempts = 0;

  while (options.size < numOptions && attempts < 200) {
    attempts++;
    let decoy;
    const strategy = Math.floor(Math.random() * 4);

    if (strategy === 0) {
      const offset = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
      decoy = correctAnswer + offset;
    } else if (strategy === 1) {
      const a = Math.floor(Math.random() * 9) + 1;
      const b = Math.floor(Math.random() * 9) + 1;
      decoy = a * b;
    } else if (strategy === 2) {
      const offset = (Math.floor(Math.random() * 10) + 2) * (Math.random() < 0.5 ? 1 : -1);
      decoy = correctAnswer + offset;
    } else {
      const offset = Math.floor(Math.random() * 8) + 1;
      decoy = correctAnswer + offset * (Math.random() < 0.5 ? 1 : -1);
    }

    if (decoy > 0 && decoy <= 81 && decoy !== correctAnswer) {
      options.add(decoy);
    }
  }

  // 極端情況下以順序數字補齊，保證不會卡住。
  for (let fallback = 1; options.size < numOptions && fallback <= 81; fallback++) {
    if (fallback !== correctAnswer) options.add(fallback);
  }

  return shuffle([...options]);
}

/**
 * 產生一關的完整資料
 */
function generateLevel(level) {
  const numOptions = Math.random() < 0.5 ? 3 : 4;
  const question = generateQuestion();
  const options = generateOptions(question.answer, numOptions);

  return {
    level,
    question,
    options,
    correctIndex: options.indexOf(question.answer),
  };
}

/**
 * 根據本關答對次序取得分數。
 * 第 1/2/3/4 名分別為 100/70/50/30 分。
 */
function getPlacementPoints(placement) {
  if (!Number.isInteger(placement) || placement < 1) return 0;
  return PLACEMENT_POINTS[placement - 1] || 0;
}

/**
 * 建立最終排行榜。
 * 同分時依答對次數、較少答錯、原房間位置排序。
 */
function buildLeaderboard(players) {
  return [...players]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.correctAnswers !== a.correctAnswers) return b.correctAnswers - a.correctAnswers;
      if (a.wrongAnswers !== b.wrongAnswers) return a.wrongAnswers - b.wrongAnswers;
      return a.slotIndex - b.slotIndex;
    })
    .map((player, index) => ({
      rank: index + 1,
      id: player.id,
      name: player.name,
      color: player.color,
      score: player.score,
      correctAnswers: player.correctAnswers,
      wrongAnswers: player.wrongAnswers,
    }));
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = {
  generateLevel,
  getPlacementPoints,
  buildLeaderboard,
  TOTAL_LEVELS,
  WRONG_ANSWER_PENALTY,
};
