// pearson.js
// Linear-regression based partial correlation (Pearson residual test)
// Signature matches pillai_test(X, Y, Z, df)
// Returns { effectSize: number, pValue: number }

'use strict';

var Matrix = require('ml-matrix').Matrix;
var jStat = require('jstat');

/**
 * Compute partial correlation between X and Y given conditioning set Z
 * by (a) regressing X on Z, Y on Z using OLS (linear), (b) correlating residuals,
 * and (c) performing a t-test for zero partial correlation.
 * If Z is empty this reduces to ordinary Pearson correlation.
 * @param {object} X - DAGitty vertex object for variable X
 * @param {object} Y - DAGitty vertex object for variable Y
 * @param {Array<object>} Z - array of DAGitty vertex objects to condition on
 * @param {DataFrame} df - Danfo.js DataFrame containing data columns named by vertex ids
 * @returns {{effectSize:number, pValue:number}}
 */
function pearsonr(X, Y, Z, df) {
  const n = df.shape[0];
  const cols = df.columns;

  const idxX = cols.indexOf(X.id);
  const idxY = cols.indexOf(Y.id);
  const idxZ = Z.map(z => cols.indexOf(z.id)).filter(i => i >= 0);
  const k = idxZ.length; // number of conditioning vars

  // Extract raw values
  const X_vals = new Array(n);
  const Y_vals = new Array(n);
  const Z_vals = new Array(n); // each row: array length k

  for (let i = 0; i < n; i++) {
    const row = df.iloc({ rows: [i] }).values[0];
    X_vals[i] = row[idxX];
    Y_vals[i] = row[idxY];
    if (k > 0) {
      Z_vals[i] = idxZ.map(ix => row[ix]);
    }
  }

  // Helper: compute residuals of response r on predictors design matrix (with intercept)
  function residualize(response, predictors) {
    // Center if no predictors besides intercept
    if (k === 0) {
      const mean = response.reduce((a, b) => a + b, 0) / response.length;
      return response.map(v => v - mean);
    }
    try {
      const Zmat = new Matrix(predictors); // n x k
      const ones = Matrix.ones(n, 1);
      const design = ones.concat(Zmat, 1); // n x (k+1)
      const y = Matrix.columnVector(response); // n x 1
      const XtX = design.transpose().mmul(design);
      // Invert (fallback to pseudo-inverse if singular)
      let XtX_inv;
      try {
        XtX_inv = XtX.inverse();
      } catch (e) {
        // pseudoInverse may be safer if available; fallback: add ridge
        const ridge = Matrix.eye(XtX.rows, XtX.columns).mul(1e-8);
        XtX_inv = XtX.add(ridge).inverse();
      }
      const beta = XtX_inv.mmul(design.transpose().mmul(y)); // (k+1) x 1
      const fitted = design.mmul(beta); // n x 1
      const resid = new Array(n);
      for (let i = 0; i < n; i++) {
        resid[i] = response[i] - fitted.get(i, 0);
      }
      return resid;
    } catch (err) {
      // On any numerical error, fall back to simple centering
      const mean = response.reduce((a, b) => a + b, 0) / response.length;
      return response.map(v => v - mean);
    }
  }

  const rX = residualize(X_vals, Z_vals);
  const rY = residualize(Y_vals, Z_vals);

  // Compute Pearson correlation of residuals
  let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
  for (let i = 0; i < n; i++) {
    const x = rX[i];
    const y = rY[i];
    sumX += x;
    sumY += y;
    sumX2 += x * x;
    sumY2 += y * y;
    sumXY += x * y;
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  const cov = (sumXY - n * meanX * meanY);
  const varX = (sumX2 - n * meanX * meanX);
  const varY = (sumY2 - n * meanY * meanY);

  let r = 0;
  if (varX > 0 && varY > 0) {
    r = cov / Math.sqrt(varX * varY);
  }
  // Bound for numerical stability
  if (!isFinite(r)) r = 0;
  r = Math.max(-1, Math.min(1, r));

  // Degrees of freedom for partial correlation: n - k - 2
  const dof = n - k - 2;
  let pValue = 1.0;
  if (dof > 0 && Math.abs(r) < 1) {
    const t = r * Math.sqrt(dof / (1 - r * r));
    pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(t), dof));
  }

  return {
    effectSize: Math.abs(r), // absolute partial correlation as effect size
    pValue: pValue
  };
}

module.exports = {
  pearsonr: pearsonr
};
