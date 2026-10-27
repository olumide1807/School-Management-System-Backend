// The precision of a mark on a report card: one decimal place. That's what
// averages are shown to, and it allows half marks.
//
// Scores are accepted at that precision, totals are rounded to it when
// stored and when built, and positions are ranked on those rounded
// figures — so what's stored, what's printed and what's ranked are the
// same number. Without it, 12.1 + 50.2 is 62.300000000000004 in floating
// point: printed as such, and ranked above a true 62.3.
const SCORE_DECIMALS = 1;
const FACTOR = 10 ** SCORE_DECIMALS;

const roundScore = (n) => Math.round(Number(n) * FACTOR) / FACTOR;

// True if n has no more decimal places than a report card shows
const hasScorePrecision = (n) => Math.abs(Number(n) * FACTOR - Math.round(Number(n) * FACTOR)) < 1e-9;

module.exports = { SCORE_DECIMALS, roundScore, hasScorePrecision };
