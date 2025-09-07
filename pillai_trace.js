const { Matrix, SVD, inverse } = require('ml-matrix');
var RF = require('ml-random-forest').RandomForestRegression;
var jStat = require('jstat');

// Canonical correlations (moved from cancor.js)
function canonicalCorrelations(X, Y) {
  const Xc = centerMatrix(X);
  const Yc = centerMatrix(Y);
  const Cxx = Xc.transpose().mmul(Xc).div(Xc.rows - 1);
  const Cyy = Yc.transpose().mmul(Yc).div(Yc.rows - 1);
  const Cxy = Xc.transpose().mmul(Yc).div(Xc.rows - 1);
  const Cyx = Cxy.transpose();
  const CxxInv = inverse(Cxx);
  const CyyInv = inverse(Cyy);
  const mat = CxxInv.mmul(Cxy).mmul(CyyInv).mmul(Cyx);
  const svd = new SVD(mat);
  return svd.diagonal.map(Math.sqrt);
}

function centerMatrix(M) {
  const colMeans = M.mean('column');
  return M.subRowVector(colMeans);
}

// Pillai trace CI test (moved from ci_test.js)
function pillai_test(X, Y, Z, df) {
  const n = df.shape[0];
  const cols = df.columns;
  const idxX = cols.indexOf(X.id);
  const idxY = cols.indexOf(Y.id);
  const idxZ = Z.map(zName => cols.indexOf(zName.id));
  const X_vals = new Array(n);
  const Y_vals = new Array(n);
  const Z_vals = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = df.iloc({ rows: [i] }).values[0];
    X_vals[i] = row[idxX];
    Y_vals[i] = row[idxY];
    Z_vals[i] = idxZ.map(zIdx => row[zIdx]);
  }
  const modelX = new RF({ nEstimators: 100, maxFeatures: 0.8, replacement: true, seed: 42 });
  modelX.train(Z_vals, X_vals);
  const X_pred = modelX.predict(Z_vals);
  const modelY = new RF({ nEstimators: 100, maxFeatures: 0.8, replacement: true, seed: 42 });
  modelY.train(Z_vals, Y_vals);
  const Y_pred = modelY.predict(Z_vals);
  const resX = X_vals.map((v,i)=> v - X_pred[i]);
  const resY = Y_vals.map((v,i)=> v - Y_pred[i]);
  const matX = new Matrix(resX.map(v=>[v]));
  const matY = new Matrix(resY.map(v=>[v]));
  const ccs = canonicalCorrelations(matX, matY);
  const coef = ccs.reduce((s,r)=> s + r*r, 0);
  const a = matX.columns; const b = matY.columns; const smin = Math.min(a,b);
  const df1 = a*b; const df2 = smin * (n - 1 + smin - a - b);
  const fstat = (coef/df1) * (df2/(smin - coef));
  const pval = 1 - jStat.centralF.cdf(fstat, df1, df2);
  return { effectSize: coef, pValue: pval };
}

module.exports = { canonicalCorrelations, pillai_test };
