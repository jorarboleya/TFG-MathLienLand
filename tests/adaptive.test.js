const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { calculateAdaptiveLevel, difficultyToParams, TIME_THRESHOLDS, answerScore } = require('../adaptive');

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

// =============================================================================
// answerScore — time-weighted scoring
// =============================================================================

describe('answerScore', () => {

  const th = TIME_THRESHOLDS['endless-runner']; // fast ≤ 8, slow > 13

  it('incorrect answer always scores 0 regardless of time', () => {
    assert.equal(answerScore({ correct: false, time: 1 },    th), 0);
    assert.equal(answerScore({ correct: false, time: 100 },  th), 0);
    assert.equal(answerScore({ correct: false, time: null }, th), 0);
  });

  it('correct + fast (at boundary) scores 1.0', () => {
    assert.equal(answerScore({ correct: true, time: 8 }, th), 1.0);
  });

  it('correct + fast (well under threshold) scores 1.0', () => {
    assert.equal(answerScore({ correct: true, time: 2 }, th), 1.0);
  });

  it('correct + medium (just above fast threshold) scores 0.85', () => {
    assert.equal(answerScore({ correct: true, time: 9 }, th), 0.85);
  });

  it('correct + medium (at slow boundary) scores 0.85', () => {
    assert.equal(answerScore({ correct: true, time: 13 }, th), 0.85);
  });

  it('correct + slow (just above slow threshold) scores 0.70', () => {
    assert.equal(answerScore({ correct: true, time: 14 }, th), 0.70);
  });

  it('correct + slow (far above threshold) scores 0.70', () => {
    assert.equal(answerScore({ correct: true, time: 60 }, th), 0.70);
  });

  it('correct with no time falls back to 1.0', () => {
    assert.equal(answerScore({ correct: true, time: null }, th), 1.0);
    assert.equal(answerScore({ correct: true },             th), 1.0);
  });

  it('correct with no thresholds (unknown minigame) falls back to 1.0', () => {
    assert.equal(answerScore({ correct: true, time: 999 }, null), 1.0);
  });

});

// =============================================================================
// calculateAdaptiveLevel — time-weighted (with minigame)
// =============================================================================

describe('calculateAdaptiveLevel — time-weighted (endless-runner)', () => {

  // Helper: all-fast correct answers (score 1.0 each)
  function fastCorrect(n, difficulty = 5) {
    return Array.from({ length: n }, () => ({ correct: true,  difficulty, time: 1 }));
  }
  function fastWrong(n, difficulty = 5) {
    return Array.from({ length: n }, () => ({ correct: false, difficulty, time: 1 }));
  }

  it('10/10 fast correct → score 1.0 > 0.8 → level +2', () => {
    assert.equal(calculateAdaptiveLevel(fastCorrect(10), 5, 'endless-runner'), 7);
  });

  it('10/10 medium correct (time=10) → score 0.85 > 0.8 → level +2', () => {
    const answers = Array.from({ length: 10 }, () => ({ correct: true, difficulty: 5, time: 10 }));
    assert.equal(calculateAdaptiveLevel(answers, 5, 'endless-runner'), 7);
  });

  it('10/10 slow correct (time=20) → score 0.70 < 0.8, >= 0.6 → maintain', () => {
    const answers = Array.from({ length: 10 }, () => ({ correct: true, difficulty: 5, time: 20 }));
    assert.equal(calculateAdaptiveLevel(answers, 5, 'endless-runner'), 5);
  });

  it('mix: 8 fast correct + 2 wrong → score 0.8, not > 0.8 → maintain', () => {
    const answers = [...fastCorrect(8), ...fastWrong(2)];
    assert.equal(calculateAdaptiveLevel(answers, 5, 'endless-runner'), 5);
  });

  it('mix: 9 fast correct + 1 wrong → score 0.9 > 0.8 → level +2', () => {
    const answers = [...fastCorrect(9), ...fastWrong(1)];
    assert.equal(calculateAdaptiveLevel(answers, 5, 'endless-runner'), 7);
  });

  it('mix: 6 slow correct (0.70) + 4 wrong → score 0.42 < 0.6 → level -1', () => {
    const slow = Array.from({ length: 6 }, () => ({ correct: true,  difficulty: 5, time: 20 }));
    const wrong = Array.from({ length: 4 }, () => ({ correct: false, difficulty: 5, time: 1  }));
    assert.equal(calculateAdaptiveLevel([...slow, ...wrong], 5, 'endless-runner'), 4);
  });

  it('time thresholds are specific to the minigame (labyrinth fast ≤ 40)', () => {
    // time=30 is fast for labyrinth but slow for endless-runner
    const answers = Array.from({ length: 10 }, () => ({ correct: true, difficulty: 5, time: 30 }));
    assert.equal(calculateAdaptiveLevel(answers, 5, 'labyrinth'),       7); // 30 ≤ 40 → fast → score 1.0 → +2
    assert.equal(calculateAdaptiveLevel(answers, 5, 'endless-runner'),  5); // 30 > 13 → slow → score 0.70 → maintain
  });

});

// =============================================================================

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
