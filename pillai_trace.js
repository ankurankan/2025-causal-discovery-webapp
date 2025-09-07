const { Matrix, SVD, inverse } = require('ml-matrix');
const { RandomForestRegression } = require('ml-random-forest');
var jStat = require('jstat');

// Center matrix columns
function centerMatrix(M){
  const colMeans = M.mean('column');
  return M.subRowVector(colMeans);
}

// Canonical correlations
function canonicalCorrelations(X, Y) {
  const Xc = centerMatrix(X);
  const Yc = centerMatrix(Y);
  const Cxx = Xc.transpose().mmul(Xc).div(Xc.rows - 1);
  const Cyy = Yc.transpose().mmul(Yc).div(Yc.rows - 1);
  const Cxy = Xc.transpose().mmul(Yc).div(Xc.rows - 1);
  const Cyx = Cxy.transpose();
  let CxxInv, CyyInv;
  try {
    CxxInv = inverse(Cxx);
    CyyInv = inverse(Cyy);
  } catch(e) {
    return []; // singular
  }
  const mat = CxxInv.mmul(Cxy).mmul(CyyInv).mmul(Cyx);
  const svd = new SVD(mat, { autoTranspose: true });
  return svd.diagonal.map(Math.sqrt);
}

// Pillai trace style CI test using residual matrices (supports categorical X/Y)
function pillai_test(X, Y, Z, df) {
  const n = df.shape[0];
  const cols = df.columns;
  const idxX = cols.indexOf(X.id);
  const idxY = cols.indexOf(Y.id);
  if(idxX === -1 || idxY === -1) return { effectSize:0, pValue:1 };
  const idxZ = Z.map(zName => cols.indexOf(zName.id)).filter(i => i !== -1);

  // Extract raw values
  const X_vals = new Array(n);
  const Y_vals = new Array(n);
  const Z_vals = new Array(n);
  for (let i = 0; i < n; i++) {
    const row = df.iloc({ rows: [i] }).values[0];
    X_vals[i] = row[idxX];
    Y_vals[i] = row[idxY];
    Z_vals[i] = idxZ.length ? idxZ.map(zIdx => row[zIdx]) : [1];
  }

  function rfPredict(features, target){
    const rf = new RandomForestRegression({ nEstimators:100, maxFeatures:0.8, replacement:true, seed:42 });
    rf.train(features, target);
    return rf.predict(features);
  }

  function residualMatrix(values){
    const isCat = values.some(v => typeof v === 'string');
    if(!isCat){
      const preds = rfPredict(Z_vals, values);
      const res = values.map((v,i)=> v - preds[i]);
      return new Matrix(res.map(v=>[v]));
    }
    const labels = Array.from(new Set(values));
    if(labels.length < 2){
      return new Matrix(n,1).fill(0);
    }
    const k = labels.length;
    const probCols = [];
    const oneHotCols = [];
    for(let c=0;c<k;c++){
      const lab = labels[c];
      const y_bin = values.map(v => v === lab ? 1 : 0);
      const pred = rfPredict(Z_vals, y_bin).map(p => Math.min(1, Math.max(0,p)));
      probCols.push(pred);
      oneHotCols.push(y_bin);
    }
  // Build residual columns (one-hot - prob) but deliberately DROP the last class (k-th)
  // to avoid linear dependence (sum of residual columns would be negative of dropped one).
  const colsRes = [];
  for(let c=0;c<k-1;c++){
      const col = new Array(n);
      for(let i=0;i<n;i++){
        col[i] = oneHotCols[c][i] - probCols[c][i];
      }
      colsRes.push(col);
    }
    const data = Array.from({length:n}, (_,i)=> colsRes.map(col => col[i]));
    return new Matrix(data);
  }

  const matX = residualMatrix(X_vals);
  const matY = residualMatrix(Y_vals);

  let ccs;
  try { ccs = canonicalCorrelations(matX, matY); } catch(e){ return { effectSize:0, pValue:1 }; }
  if (ccs > 1) debugger;
  if(!ccs.length) return { effectSize:0, pValue:1 };
  const coef = ccs.reduce((s,r)=> s + r*r, 0);
  const a = matX.columns; const b = matY.columns; const smin = Math.min(a,b);
  if(coef === 0 || smin === 0) return { effectSize:0, pValue:1 };
  const df1 = a*b; const df2 = smin * (n - 1 + smin - a - b);
  if(df1<=0 || df2<=0) return { effectSize:0, pValue:1 };
  const fstat = (coef/df1) * (df2/Math.max(smin - coef, 1e-12));
  let pval = 1 - jStat.centralF.cdf(fstat, df1, df2);
  if(!isFinite(pval) || pval < 0) pval = 1;
  return { effectSize: coef, pValue: pval };
}

module.exports = { canonicalCorrelations, pillai_test };
