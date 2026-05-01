// Mathematical validation of AI-generated questions.
// Each minigame has its own validation logic; invalid questions are discarded
// before the question set reaches the students.

/**
 * Euclidean GCD algorithm.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function gcd(a, b) {
  while (b !== 0) {
    const t = b;
    b = a % b;
    a = t;
  }
  return a;
}

// Conversion factors relative to the base unit of each family.
// Mass base: g | Length base: m | Volume base: l
const UNIT_TO_BASE = {
  mg: 1e-3, g: 1,    kg: 1e3,
  mm: 1e-3, cm: 1e-2, m: 1, km: 1e3,
  ml: 1e-3, l: 1,    kl: 1e3,
};

// Units within the same family can be converted to each other.
const UNIT_FAMILIES = [
  ['mg', 'g', 'kg'],
  ['mm', 'cm', 'm', 'km'],
  ['ml', 'l', 'kl'],
];

/**
 * Returns true if the question is mathematically correct for the given minigame.
 * Returns false if the answer is wrong, the format is unexpected, or any field is missing.
 *
 * @param {string} minigame
 * @param {object} q
 * @returns {boolean}
 */
function isValidQuestion(minigame, q) {
  try {
    switch (minigame) {

      case 'endless-runner': {
        const a   = Number(q.operand1);
        const b   = Number(q.operand2);
        const ans = Number(q.answer);
        if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(ans)) return false;
        switch (q.operator) {
          case '+': return a + b === ans;
          case '-': return a >= b && a - b === ans;
          case '*': return b >= 0 && b <= 9 && a * b === ans;
          default:  return false;
        }
      }

      case 'decimal-meteors': {
        const match = String(q.question).match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
        if (!match) return false;
        const fromValue = parseFloat(match[1]);
        const fromUnit  = match[2].toLowerCase();
        const toUnit    = String(q.unit).toLowerCase();
        const toValue   = Number(q.value);
        if (!(fromUnit in UNIT_TO_BASE) || !(toUnit in UNIT_TO_BASE)) return false;
        if (!UNIT_FAMILIES.some(f => f.includes(fromUnit) && f.includes(toUnit))) return false;
        const expected = (fromValue * UNIT_TO_BASE[fromUnit]) / UNIT_TO_BASE[toUnit];
        return Math.abs(expected - toValue) <= 1e-6;
      }

      case 'dividing-hills': {
        const type = Number(q.type);

        if (type === 0) {
          const match = String(q.text).match(/Is (\d+) divisible by\s*\n?(\d+)\?/i);
          if (!match) return false;
          const num      = parseInt(match[1]);
          const divisor  = parseInt(match[2]);
          const isDivisible = num % divisor === 0;
          // answer 'B' = Yes (divisible), answer 'A' = No (not divisible)
          return isDivisible === (q.answer === 'B');
        }

        if (type === 1) {
          const match = String(q.text).match(/gcd of (\d+) and (\d+)/i);
          if (!match) return false;
          const computedGcd  = gcd(parseInt(match[1]), parseInt(match[2]));
          const markedAnswer = parseInt(q.options[q.answer]);
          return computedGcd === markedAnswer;
        }

        return false;
      }

      case 'labyrinth': {
        if (!q.question || typeof q.question !== 'string') return false;
        if (!Number.isInteger(q.difficulty) || q.difficulty < 1 || q.difficulty > 10) return false;
        const keys = ['answerA', 'answerB', 'answerC', 'answerD'];
        if (!keys.every(k => Array.isArray(q[k]) && q[k].length === 2)) return false;
        const trueCount = keys.filter(k => q[k][1] === true).length;
        if (trueCount !== 1) return false;
        const texts = keys.map(k => String(q[k][0]));
        return new Set(texts).size === 4;
      }

      default:
        return true;
    }
  } catch {
    return false;
  }
}

/**
 * Filters out mathematically invalid questions and logs how many were discarded.
 *
 * @param {string} minigame
 * @param {object[]} questions
 * @returns {object[]} only the valid questions
 */
function filterValidQuestions(minigame, questions) {
  const valid = questions.filter(q => isValidQuestion(minigame, q));
  const discarded = questions.length - valid.length;
  if (discarded > 0) {
    console.warn(`[validation] ${minigame}: discarded ${discarded}/${questions.length} invalid questions`);
  }
  return valid;
}

module.exports = { gcd, isValidQuestion, filterValidQuestions };
