const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateAdaptiveLevel, difficultyToParams } = require('../adaptive');

// Helper: builds an answer array with numCorrect correct answers out of numTotal,
// all at the given difficulty level.
function makeAnswers(numCorrect, numTotal, difficulty = 5) {
  return Array.from({ length: numTotal }, (_, i) => ({
    correct: i < numCorrect,
    difficulty,
  }));
}

// =============================================================================
// calculateAdaptiveLevel
// =============================================================================

describe('calculateAdaptiveLevel', () => {

  // --- No history ---

  it('returns default level (5) when answers array is empty', () => {
    assert.equal(calculateAdaptiveLevel([]), 5);
  });

  it('returns custom default level when answers array is empty', () => {
    assert.equal(calculateAdaptiveLevel([], 3), 3);
  });

  it('returns default level (5) when answers is null', () => {
    assert.equal(calculateAdaptiveLevel(null), 5);
  });

  it('returns default level when all difficulty values are invalid (0 or out of range)', () => {
    const answers = [
      { correct: true,  difficulty: 0  },
      { correct: false, difficulty: 11 },
      { correct: true,  difficulty: null },
    ];
    // All difficulties filtered out → currentLevel = 5. accuracy = 2/3 > 0.8? No. >= 0.6? Yes → maintain 5.
    assert.equal(calculateAdaptiveLevel(answers), 5);
  });

  // --- accuracy > 80%: level +2 ---

  it('raises level by 2 when accuracy > 80% (9/10 correct, level 5)', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(9, 10, 5)), 7);
  });

  it('raises level by 2 when accuracy is 100% (10/10 correct, level 5)', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(10, 10, 5)), 7);
  });

  it('caps level at 10 when raising from level 9', () => {
    // accuracy > 0.8 → min(9+2, 10) = 10
    assert.equal(calculateAdaptiveLevel(makeAnswers(9, 10, 9)), 10);
  });

  it('caps level at 10 when already at 10', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(9, 10, 10)), 10);
  });

  // --- accuracy >= 60% and <= 80%: maintain ---

  it('maintains level when accuracy is exactly 60% (6/10)', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(6, 10, 5)), 5);
  });

  it('maintains level when accuracy is exactly 80% (8/10) — boundary: > 0.8 is strict', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(8, 10, 5)), 5);
  });

  it('maintains level when accuracy is 70% (7/10)', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(7, 10, 3)), 3);
  });

  // --- accuracy < 60%: level -1 ---

  it('lowers level by 1 when accuracy < 60% (5/10 correct, level 5)', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(5, 10, 5)), 4);
  });

  it('lowers level by 1 when accuracy is 0% (0/10 correct, level 5)', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(0, 10, 5)), 4);
  });

  it('floors level at 1 when already at level 1', () => {
    // accuracy < 0.6 → max(1-1, 1) = 1
    assert.equal(calculateAdaptiveLevel(makeAnswers(1, 10, 1)), 1);
  });

  it('floors level at 1 when level would go to 0', () => {
    assert.equal(calculateAdaptiveLevel(makeAnswers(0, 10, 1)), 1);
  });

  // --- currentLevel calculated as rounded average of difficulties ---

  it('calculates currentLevel as rounded average of valid difficulties', () => {
    // difficulties: [3, 3, 7, 7] → avg = 5.0 → round = 5; accuracy = 4/4 > 0.8 → 7
    const answers = [
      { correct: true, difficulty: 3 },
      { correct: true, difficulty: 3 },
      { correct: true, difficulty: 7 },
      { correct: true, difficulty: 7 },
    ];
    assert.equal(calculateAdaptiveLevel(answers), 7);
  });

  it('rounds currentLevel up when average is x.5', () => {
    // difficulties: [4, 5] → avg = 4.5 → Math.round(4.5) = 5; accuracy = 2/2 > 0.8 → 7
    const answers = [
      { correct: true, difficulty: 4 },
      { correct: true, difficulty: 5 },
    ];
    assert.equal(calculateAdaptiveLevel(answers), 7);
  });

  it('ignores difficulty values outside the valid range [1,10]', () => {
    // Only difficulty=5 is valid; accuracy = 3/4 > 0.8 → 7
    const answers = [
      { correct: true,  difficulty: 5  },
      { correct: true,  difficulty: 0  },  // invalid
      { correct: true,  difficulty: 11 },  // invalid
      { correct: false, difficulty: 5  },
    ];
    // valid diffs: [5, 5] → avg = 5; accuracy = 3/4 = 0.75 → maintain → 5
    assert.equal(calculateAdaptiveLevel(answers), 5);
  });

});

// =============================================================================
// difficultyToParams
// =============================================================================

describe('difficultyToParams — endless-runner', () => {

  it('level 1 → only addition, max operand 20', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 1), {
      operation_types: ['add'], max_operand: 20,
    });
  });

  it('level 3 → only addition, max operand 20 (boundary)', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 3), {
      operation_types: ['add'], max_operand: 20,
    });
  });

  it('level 4 → addition and subtraction, max operand 50', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 4), {
      operation_types: ['add', 'sub'], max_operand: 50,
    });
  });

  it('level 5 → addition and subtraction, max operand 50 (boundary)', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 5), {
      operation_types: ['add', 'sub'], max_operand: 50,
    });
  });

  it('level 6 → all operations, max operand 50', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 6), {
      operation_types: ['add', 'sub', 'mul'], max_operand: 50,
    });
  });

  it('level 7 → all operations, max operand 50 (boundary)', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 7), {
      operation_types: ['add', 'sub', 'mul'], max_operand: 50,
    });
  });

  it('level 8 → all operations, max operand 99', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 8), {
      operation_types: ['add', 'sub', 'mul'], max_operand: 99,
    });
  });

  it('level 10 → all operations, max operand 99', () => {
    assert.deepEqual(difficultyToParams('endless-runner', 10), {
      operation_types: ['add', 'sub', 'mul'], max_operand: 99,
    });
  });

});

describe('difficultyToParams — dividing-hills', () => {

  it('level 1 → small divisors, no GCD questions', () => {
    assert.deepEqual(difficultyToParams('dividing-hills', 1), {
      max_divisor: 20, use_gcd: false,
    });
  });

  it('level 3 → small divisors, no GCD (boundary)', () => {
    assert.deepEqual(difficultyToParams('dividing-hills', 3), {
      max_divisor: 20, use_gcd: false,
    });
  });

  it('level 4 → medium divisors, GCD enabled', () => {
    assert.deepEqual(difficultyToParams('dividing-hills', 4), {
      max_divisor: 50, use_gcd: true,
    });
  });

  it('level 6 → medium divisors, GCD enabled (boundary)', () => {
    assert.deepEqual(difficultyToParams('dividing-hills', 6), {
      max_divisor: 50, use_gcd: true,
    });
  });

  it('level 7 → large divisors, GCD enabled', () => {
    assert.deepEqual(difficultyToParams('dividing-hills', 7), {
      max_divisor: 100, use_gcd: true,
    });
  });

  it('level 10 → large divisors, GCD enabled', () => {
    assert.deepEqual(difficultyToParams('dividing-hills', 10), {
      max_divisor: 100, use_gcd: true,
    });
  });

});

describe('difficultyToParams — decimal-meteors', () => {

  it('level 1 → small exponent, single magnitude', () => {
    assert.deepEqual(difficultyToParams('decimal-meteors', 1), {
      max_exponent: 3, mixed_units: false,
    });
  });

  it('level 3 → small exponent, single magnitude (boundary)', () => {
    assert.deepEqual(difficultyToParams('decimal-meteors', 3), {
      max_exponent: 3, mixed_units: false,
    });
  });

  it('level 4 → medium exponent, single magnitude', () => {
    assert.deepEqual(difficultyToParams('decimal-meteors', 4), {
      max_exponent: 6, mixed_units: false,
    });
  });

  it('level 6 → medium exponent, single magnitude (boundary)', () => {
    assert.deepEqual(difficultyToParams('decimal-meteors', 6), {
      max_exponent: 6, mixed_units: false,
    });
  });

  it('level 7 → large exponent, mixed magnitudes', () => {
    assert.deepEqual(difficultyToParams('decimal-meteors', 7), {
      max_exponent: 9, mixed_units: true,
    });
  });

  it('level 10 → large exponent, mixed magnitudes', () => {
    assert.deepEqual(difficultyToParams('decimal-meteors', 10), {
      max_exponent: 9, mixed_units: true,
    });
  });

});

describe('difficultyToParams — labyrinth and fraction-race (default)', () => {

  it('labyrinth returns difficulty_level directly', () => {
    assert.deepEqual(difficultyToParams('labyrinth', 4), { difficulty_level: 4 });
  });

  it('labyrinth level 10 returns difficulty_level 10', () => {
    assert.deepEqual(difficultyToParams('labyrinth', 10), { difficulty_level: 10 });
  });

  it('fraction-race returns difficulty_level directly', () => {
    assert.deepEqual(difficultyToParams('fraction-race', 3), { difficulty_level: 3 });
  });

  it('unknown minigame falls back to difficulty_level', () => {
    assert.deepEqual(difficultyToParams('unknown-game', 7), { difficulty_level: 7 });
  });

});
