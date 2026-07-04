/**
 * gameLogic.js
 * 10 關熊仔乘法跑酷：出題、三選一選項與終點排名
 */

const TOTAL_STAGES = 10;
const OPTIONS_PER_STAGE = 3;

function generateQuestion() {
  const a = Math.floor(Math.random() * 9) + 1;
  const b = Math.floor(Math.random() * 9) + 1;
  return { a, b, answer: a * b };
}

function generateOptions(correctAnswer) {
  const options = new Set([correctAnswer]);
  let attempts = 0;

  while (options.size < OPTIONS_PER_STAGE && attempts < 200) {
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
      const neighbouringFactor = Math.floor(Math.random() * 9) + 1;
      decoy = neighbouringFactor * (Math.floor(Math.random() * 9) + 1);
    }

    if (Number.isInteger(decoy) && decoy > 0 && decoy <= 81 && decoy !== correctAnswer) {
      options.add(decoy);
    }
  }

  for (let fallback = 1; options.size < OPTIONS_PER_STAGE && fallback <= 81; fallback++) {
    if (fallback !== correctAnswer) options.add(fallback);
  }

  return shuffle([...options]);
}

function generateStage(stageIndex) {
  const question = generateQuestion();
  const options = generateOptions(question.answer);

  return {
    stageIndex,
    stageNumber: stageIndex + 1,
    question,
    options,
    correctIndex: options.indexOf(question.answer),
  };
}

function generateCourse() {
  return Array.from({ length: TOTAL_STAGES }, (_, index) => generateStage(index));
}

function buildRaceLeaderboard(players) {
  return [...players]
    .sort((a, b) => {
      if (a.isFinished && b.isFinished) {
        return a.finishRank - b.finishRank;
      }
      if (a.isFinished) return -1;
      if (b.isFinished) return 1;
      if (b.currentStage !== a.currentStage) return b.currentStage - a.currentStage;
      if (a.falls !== b.falls) return a.falls - b.falls;
      return a.slotIndex - b.slotIndex;
    })
    .map((player, index) => ({
      rank: player.finishRank || index + 1,
      id: player.id,
      name: player.name,
      color: player.color,
      currentStage: player.currentStage,
      isFinished: player.isFinished,
      finishTime: player.finishTime,
      falls: player.falls,
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
  generateStage,
  generateCourse,
  buildRaceLeaderboard,
  TOTAL_STAGES,
  OPTIONS_PER_STAGE,
};
