const dfd = require('danfojs-node');
const { pillai_test } = require('./ci_test');

const df = new dfd.DataFrame([
  { X: 10, Y: 3, Z1: 1, Z2: 5 },
  { X: 12, Y: 4, Z1: 2, Z2: 6 },
  { X: 14, Y: 5, Z1: 3, Z2: 7 },
  { X: 13, Y: 6, Z1: 4, Z2: 8 },
]);

const result = pillai_test('X', 'Y', ['Z1', 'Z2'], df);
console.log('Canonical Correlation(s):', result.canonicalCorrs);
