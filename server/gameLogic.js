/**
 * gameLogic.js
 * 出題邏輯、答案產生、關卡進度判斷
 */

const TOTAL_LEVELS = 10;

/**
 * 產生個位數 × 個位數的乘法題目
 * @returns {{ a: number, b: number, answer: number }}
 */
function generateQuestion() {
  const a = Math.floor(Math.random() * 9) + 1; // 1-9
  const b = Math.floor(Math.random() * 9) + 1; // 1-9
  return { a, b, answer: a * b };
}

/**
 * 產生 3-4 個答案選項（1 個正確，其餘為合理干擾值）
 * @param {number} correctAnswer - 正確答案
 * @param {number} numOptions - 選項數量（3 或 4）
 * @returns {number[]} 打亂後的答案選項陣列
 */
function generateOptions(correctAnswer, numOptions = 3) {
  const options = new Set([correctAnswer]);

  // 產生合理干擾值：與正確答案相近的數字
  const attempts = 0;
  while (options.size < numOptions) {
    let decoy;
    const strategy = Math.floor(Math.random() * 4);

    if (strategy === 0) {
      // ±1 到 ±5 偏移
      const offset = (Math.floor(Math.random() * 5) + 1) * (Math.random() < 0.5 ? 1 : -1);
      decoy = correctAnswer + offset;
    } else if (strategy === 1) {
      // 附近的乘法結果（相鄰因子）
      const a = Math.floor(Math.random() * 9) + 1;
      const b = Math.floor(Math.random() * 9) + 1;
      decoy = a * b;
    } else if (strategy === 2) {
      // ±2 到 ±10 偏移
      const offset = (Math.floor(Math.random() * 10) + 2) * (Math.random() < 0.5 ? 1 : -1);
      decoy = correctAnswer + offset;
    } else {
      // 個位數交換或相近值
      const offset = Math.floor(Math.random() * 8) + 1;
      decoy = correctAnswer + offset * (Math.random() < 0.5 ? 1 : -1);
    }

    // 確保干擾值在合理範圍（1-81），且不重複
    if (decoy > 0 && decoy <= 81 && decoy !== correctAnswer && !options.has(decoy)) {
      options.add(decoy);
    }

    // 防止無窮迴圈：若附近數值不夠用，就用隨機乘法結果
    if (options.size < numOptions && [...options].length === options.size) {
      // fallback: 直接用隨機乘法結果
      const fa = Math.floor(Math.random() * 9) + 1;
      const fb = Math.floor(Math.random() * 9) + 1;
      const fallback = fa * fb;
      if (fallback !== correctAnswer) options.add(fallback);
    }
  }

  // 打亂順序
  return shuffle([...options]);
}

/**
 * 產生一關的完整資料
 * @param {number} level - 關卡編號（1-10）
 * @returns {{ level, question, options, correctIndex }}
 */
function generateLevel(level) {
  const numOptions = Math.random() < 0.5 ? 3 : 4;
  const question = generateQuestion();
  const options = generateOptions(question.answer, numOptions);
  const correctIndex = options.indexOf(question.answer);

  return {
    level,
    question,
    options,
    correctIndex,
  };
}

/**
 * 打亂陣列順序（Fisher-Yates）
 * @param {any[]} arr
 * @returns {any[]}
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { generateLevel, TOTAL_LEVELS };
