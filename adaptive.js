// Pure functions for adaptive difficulty calculation.
// Extracted here so they can be unit-tested without importing the full server.

/**
 * Calculates the new difficulty level (1-10) based on a student's recent answers.
 *
 * @param {Array<{correct: boolean, difficulty: number}>} answers
 * @param {number} defaultLevel - used when no valid history exists (default 5)
 * @returns {number} new difficulty level, clamped to [1, 10]
 */
function calculateAdaptiveLevel(answers, defaultLevel = 5) {
  if (!answers || answers.length === 0) return defaultLevel;

  const total = answers.length;
  const correct = answers.filter(a => a.correct).length;
  const accuracy = correct / total;

  const validDiffs = answers
    .map(a => a.difficulty)
    .filter(d => d != null && d >= 1 && d <= 10);

  const currentLevel = validDiffs.length > 0
    ? Math.round(validDiffs.reduce((sum, d) => sum + d, 0) / validDiffs.length)
    : defaultLevel;

  if (accuracy > 0.8)  return Math.min(currentLevel + 2, 10);
  if (accuracy >= 0.6) return currentLevel;
  return Math.max(currentLevel - 1, 1);
}

/**
 * Translates a difficulty level (1-10) into concrete game parameters for a minigame.
 *
 * @param {string} minigame
 * @param {number} level - integer 1-10
 * @returns {object} parameters specific to that minigame
 */
function difficultyToParams(minigame, level) {
  switch (minigame) {
    case 'endless-runner': {
      if (level <= 3) return { operation_types: ['add'], max_operand: 20 };
      if (level <= 5) return { operation_types: ['add', 'sub'], max_operand: 50 };
      if (level <= 7) return { operation_types: ['add', 'sub', 'mul'], max_operand: 50 };
      return { operation_types: ['add', 'sub', 'mul'], max_operand: 99 };
    }
    case 'dividing-hills': {
      if (level <= 3) return { max_divisor: 20, use_gcd: false };
      if (level <= 6) return { max_divisor: 50, use_gcd: true };
      return { max_divisor: 100, use_gcd: true };
    }
    case 'decimal-meteors': {
      if (level <= 3) return { max_exponent: 3, mixed_units: false };
      if (level <= 6) return { max_exponent: 6, mixed_units: false };
      return { max_exponent: 9, mixed_units: true };
    }
    // labyrinth and fraction-race: difficulty_level passed directly for question filtering
    default:
      return { difficulty_level: level };
  }
}

module.exports = { calculateAdaptiveLevel, difficultyToParams };
