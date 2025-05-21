const { RandomForestRegression } = require('ml-random-forest');
const dfd = require('danfojs-node');
const { Matrix } = require('ml-matrix');
const { canonicalCorrelations } = require('./cancor');

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
  const X_vals = df.column(X).values;
  const Y_vals = df.column(Y).values;
  const Z_df = df.loc({ columns: Z });
  const Z_vals = Z_df.toArray();

  console.log('Z_vals shape:', Z_vals.length, Z_vals[0]?.length);
  console.log('X_vals shape:', X_vals.length);
  console.log('Y_vals shape:', Y_vals.length);


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

  return { residualsX, residualsY, canonicalCorrs };
}

module.exports = { pillai_test };
