const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { gcd, isValidQuestion, filterValidQuestions } = require('../validation');

// =============================================================================
// gcd
// =============================================================================

describe('gcd', () => {

  it('gcd(12, 8) = 4', () => assert.equal(gcd(12, 8), 4));
  it('gcd(24, 36) = 12', () => assert.equal(gcd(24, 36), 12));
  it('gcd(7, 13) = 1 (coprime)', () => assert.equal(gcd(7, 13), 1));
  it('gcd(100, 25) = 25', () => assert.equal(gcd(100, 25), 25));
  it('gcd(a, a) = a', () => assert.equal(gcd(9, 9), 9));
  it('gcd(a, 0) = a', () => assert.equal(gcd(15, 0), 15));
  it('gcd is commutative', () => assert.equal(gcd(36, 24), gcd(24, 36)));

});

// =============================================================================
// isValidQuestion — endless-runner
// =============================================================================

describe('isValidQuestion — endless-runner', () => {

  it('valid addition', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 45, operator: '+', operand2: 32, answer: 77 }), true);
  });

  it('invalid addition: answer is wrong', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 45, operator: '+', operand2: 32, answer: 78 }), false);
  });

  it('valid subtraction', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 50, operator: '-', operand2: 20, answer: 30 }), true);
  });

  it('invalid subtraction: operand1 < operand2 (negative result)', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 20, operator: '-', operand2: 50, answer: -30 }), false);
  });

  it('invalid subtraction: operand1 < operand2 even if answer matches the abs value', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 20, operator: '-', operand2: 50, answer: 30 }), false);
  });

  it('valid multiplication', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 12, operator: '*', operand2: 5, answer: 60 }), true);
  });

  it('valid multiplication: operand2 = 0', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 12, operator: '*', operand2: 0, answer: 0 }), true);
  });

  it('valid multiplication: operand2 = 9 (boundary)', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 11, operator: '*', operand2: 9, answer: 99 }), true);
  });

  it('invalid multiplication: operand2 > 9', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 12, operator: '*', operand2: 10, answer: 120 }), false);
  });

  it('invalid: unknown operator', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 10, operator: '/', operand2: 2, answer: 5 }), false);
  });

  it('invalid: non-integer answer', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 3, operator: '+', operand2: 4, answer: 7.5 }), false);
  });

  it('invalid: missing field', () => {
    assert.equal(isValidQuestion('endless-runner', { operand1: 3, operator: '+', answer: 7 }), false);
  });

});

// =============================================================================
// isValidQuestion — decimal-meteors
// =============================================================================

describe('isValidQuestion — decimal-meteors', () => {

  it('valid: 250mg → g (0.25)', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '250mg', value: 0.25, unit: 'g' }), true);
  });

  it('valid: 3km → m (3000)', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '3km', value: 3000, unit: 'm' }), true);
  });

  it('valid: 500ml → l (0.5)', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '500ml', value: 0.5, unit: 'l' }), true);
  });

  it('valid: 2g → kg (0.002)', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '2g', value: 0.002, unit: 'kg' }), true);
  });

  it('valid: 100cm → m (1)', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '100cm', value: 1, unit: 'm' }), true);
  });

  it('invalid: wrong converted value', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '250mg', value: 25, unit: 'g' }), false);
  });

  it('invalid: cross-family conversion (mg → l)', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '250mg', value: 0.25, unit: 'l' }), false);
  });

  it('invalid: unknown source unit', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '250lb', value: 113, unit: 'g' }), false);
  });

  it('invalid: unknown target unit', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: '250g', value: 250, unit: 'oz' }), false);
  });

  it('invalid: unparseable question string', () => {
    assert.equal(isValidQuestion('decimal-meteors', { question: 'hello', value: 1, unit: 'g' }), false);
  });

});

// =============================================================================
// isValidQuestion — dividing-hills type 0 (divisibility)
// =============================================================================

describe('isValidQuestion — dividing-hills type 0', () => {

  it('valid: 450 is divisible by 5 → answer B (Yes)', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 0, text: 'Is 450 divisible by 5?',
      answer: 'B', options: { A: 'No', B: 'Yes' },
    }), true);
  });

  it('valid: 451 is not divisible by 5 → answer A (No)', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 0, text: 'Is 451 divisible by 5?',
      answer: 'A', options: { A: 'No', B: 'Yes' },
    }), true);
  });

  it('invalid: 450 divisible by 5 but answer marked A (No)', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 0, text: 'Is 450 divisible by 5?',
      answer: 'A', options: { A: 'No', B: 'Yes' },
    }), false);
  });

  it('invalid: 451 not divisible by 5 but answer marked B (Yes)', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 0, text: 'Is 451 divisible by 5?',
      answer: 'B', options: { A: 'No', B: 'Yes' },
    }), false);
  });

  it('invalid: unparseable text', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 0, text: 'What is seven?',
      answer: 'A', options: { A: 'No', B: 'Yes' },
    }), false);
  });

});

// =============================================================================
// isValidQuestion — dividing-hills type 1 (GCD)
// =============================================================================

describe('isValidQuestion — dividing-hills type 1', () => {

  it('valid: gcd(24, 36) = 12 → answer A', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 1, text: 'Select the gcd of 24 and 36:',
      answer: 'A', options: { A: '12', B: '6', C: '4', D: '8' },
    }), true);
  });

  it('invalid: gcd(24, 36) = 12 but answer marked B (6)', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 1, text: 'Select the gcd of 24 and 36:',
      answer: 'B', options: { A: '12', B: '6', C: '4', D: '8' },
    }), false);
  });

  it('valid: coprime numbers — gcd(7, 13) = 1', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 1, text: 'Select the gcd of 7 and 13:',
      answer: 'A', options: { A: '1', B: '7', C: '13', D: '91' },
    }), true);
  });

  it('invalid: gcd(100, 75) = 25 but answer marked B (5)', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 1, text: 'Select the gcd of 100 and 75:',
      answer: 'B', options: { A: '25', B: '5', C: '10', D: '50' },
    }), false);
  });

  it('invalid: unparseable text', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 1, text: 'What is the answer?',
      answer: 'A', options: { A: '12', B: '6', C: '4', D: '8' },
    }), false);
  });

  it('invalid: unknown type', () => {
    assert.equal(isValidQuestion('dividing-hills', {
      type: 2, text: 'Select the gcd of 24 and 36:',
      answer: 'A', options: { A: '12', B: '6', C: '4', D: '8' },
    }), false);
  });

});

// =============================================================================
// isValidQuestion — labyrinth
// =============================================================================

describe('isValidQuestion — labyrinth', () => {

  const validQ = {
    question: 'If 5 cm = 250 km, how many km is 7 cm?',
    answerA: ['300 km', false],
    answerB: ['350 km', true],
    answerC: ['400 km', false],
    answerD: ['250 km', false],
    difficulty: 3,
  };

  it('valid: exactly one true answer, 4 distinct texts', () => {
    assert.equal(isValidQuestion('labyrinth', validQ), true);
  });

  it('invalid: zero true answers', () => {
    const q = { ...validQ, answerB: ['350 km', false] };
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: two true answers', () => {
    const q = { ...validQ, answerA: ['300 km', true] };
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: duplicate option texts', () => {
    const q = { ...validQ, answerC: ['350 km', false] }; // same text as answerB
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: missing answer key', () => {
    const { answerD: _, ...q } = validQ;
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: answer value is not an array', () => {
    const q = { ...validQ, answerA: '300 km' };
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: missing question field', () => {
    const { question: _, ...q } = validQ;
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: difficulty out of range (11)', () => {
    const q = { ...validQ, difficulty: 11 };
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: difficulty is not an integer (float)', () => {
    const q = { ...validQ, difficulty: 3.5 };
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

  it('invalid: missing difficulty field', () => {
    const { difficulty: _, ...q } = validQ;
    assert.equal(isValidQuestion('labyrinth', q), false);
  });

});

// =============================================================================
// filterValidQuestions
// =============================================================================

describe('filterValidQuestions', () => {

  it('returns all questions when all are valid', () => {
    const questions = [
      { operand1: 10, operator: '+', operand2: 5, answer: 15 },
      { operand1: 20, operator: '-', operand2: 8, answer: 12 },
    ];
    assert.equal(filterValidQuestions('endless-runner', questions).length, 2);
  });

  it('filters out invalid questions and keeps valid ones', () => {
    const questions = [
      { operand1: 10, operator: '+', operand2: 5, answer: 15 },  // valid
      { operand1: 10, operator: '+', operand2: 5, answer: 99 },  // invalid
      { operand1: 20, operator: '-', operand2: 8, answer: 12 },  // valid
    ];
    const result = filterValidQuestions('endless-runner', questions);
    assert.equal(result.length, 2);
    assert.equal(result[0].answer, 15);
    assert.equal(result[1].answer, 12);
  });

  it('returns empty array when all questions are invalid', () => {
    const questions = [
      { operand1: 10, operator: '+', operand2: 5, answer: 999 },
      { operand1: 20, operator: '-', operand2: 8, answer: 999 },
    ];
    assert.equal(filterValidQuestions('endless-runner', questions).length, 0);
  });

  it('returns all questions for unknown minigame (no validation rule)', () => {
    const questions = [{ some: 'data' }, { other: 'data' }];
    assert.equal(filterValidQuestions('unknown-game', questions).length, 2);
  });

});
