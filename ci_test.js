const { RandomForestRegression } = require('ml-random-forest');
const dfd = require('danfojs-node');
const { Matrix } = require('ml-matrix');
const { canonicalCorrelations } = require('./cancor');
const jStat = require('jstat');

/**
 * Computes residuals from two random forest models:
 * - Model 1: Predict X from Z
 * - Model 2: Predict Y from Z
 *
 * @param {string} X - Target variable 1
 * @param {string} Y - Target variable 2
 * @param {string[]} Z - List of feature column names
 * @param {dfd.DataFrame} df - Danfo.js DataFrame
 * @returns {{ residualsX: number[], residualsY: number[] }}
 */
function pillai_test(X, Y, Z, df) {
  // Extract feature matrix Z and targets X, Y
  // const X_vals = df.column(X).values;
  // const Y_vals = df.column(Y).values;
  // const Z_vals = df.loc({ columns: Z }).values.map(row => Array.from(row));

  const numRows = df.shape[0];
  const X_vals = new Array(numRows);
  const Y_vals = new Array(numRows);
  const Z_vals = new Array(numRows);

  for (let i = 0; i < numRows; i++) {
    const row = df.iloc({ rows: [i] }).values[0];
    X_vals[i] = row[0];
    Y_vals[i] = row[1];
    Z_vals[i] = row.slice(2, row.length);
  }

  // Train model for X ~ Z
  const modelX = new RandomForestRegression({
    nEstimators: 100,
    maxFeatures: 0.8,
    replacement: true,
    seed: 42,
  });
  modelX.train(Z_vals, X_vals);
  const X_preds = modelX.predict(Z_vals);

  // Train model for Y ~ Z
  const modelY = new RandomForestRegression({
    nEstimators: 100,
    maxFeatures: 0.8,
    replacement: true,
    seed: 42,
  });
  modelY.train(Z_vals, Y_vals);
  const Y_preds = modelY.predict(Z_vals);

  // Compute residuals
  const residualsX = X_vals.map((trueVal, i) => trueVal - X_preds[i]);
  const residualsY = Y_vals.map((trueVal, i) => trueVal - Y_preds[i]);

  const resXMat = new Matrix(residualsX.map(val => [val]));
  const resYMat = new Matrix(residualsY.map(val => [val]));

  const canonicalCorrs = canonicalCorrelations(resXMat, resYMat);

  const coef = canonicalCorrs.reduce((sum, r) => sum + r * r, 0);

  const a   = resXMat.columns;
  const b   = resYMat.columns;
  const s   = Math.min(a, b);
  const df1 = a * b;
  const df2 = s * (numRows - 1 + s - a - b);

  // F-statistic
  const fStat = (coef / df1) * (df2 / (s - coef));

  // p-value = 1 − F_CDF(fStat; df1, df2)
  return (1 - jStat.centralF.cdf(fStat, df1, df2));
}

/**
 * @param {Object} dag            – graph object with getNodes(), getParents()
 * @param {dfd.DataFrame} df      – your data
 * @returns {dfd.DataFrame}       – columns: X, A, Y, cor, p
 */
function compute_effects(dag, df) {
  const nodes = dag.getVertices();
  const results = [];

  // all pairs i<j
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const n1 = nodes[i];
      const n2 = nodes[j];

      const p1 = dag.getParents(n1);
      const p2 = dag.getParents(n2);

      let otherParents, u, v, a;

      // direction n2 -> n1
      if (p1.includes(n2)) {
        otherParents = p1.filter(p => p !== n2);
        u = n2; v = n1; a = '->';
      }
      // direction n1 -> n2
      else if (p2.includes(n1)) {
        otherParents = p2.filter(p => p !== n1);
        u = n1; v = n2; a = '->';
      }

      // no edge in either direction
      else {
        otherParents = Array.from(new Set([...p1, ...p2]));
        u = n1; v = n2; a = '--';
      }

      // run the Pillai-based CI test
      effect_size, p_value = pillai_test(u, v, otherParents, df);

      // build ml-matrix objects for p-value
      const resXMat = Matrix.columnVector(residualsX);
      const resYMat = Matrix.columnVector(residualsY);

      // compute p-value
      const p = pillaiPValue(
        canonicalCorrs,
        resXMat,
        resYMat,
        df.shape[0]
      );

module.exports = { pillai_test, compute_effects };
