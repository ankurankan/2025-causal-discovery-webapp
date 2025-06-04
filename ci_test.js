var RFRegression = require('ml-random-forest').RandomForestRegression;
const RFClassifier = require('ml-random-forest').RandomForestClassifier;
var Matrix = require('ml-matrix').Matrix;
var canonicalCorrelations = require('./cancor').canonicalCorrelations;
var jStat = require('jstat');

/**
 * Fit RFs, compute residuals, canonical corrs, Pillai effect & p-value.
 * @return {object} { effectSize: number, pValue: number }
 */
function pillai_test(X, Y, Z, df, varTypes) {
  const n = df.shape[0];
  const cols = df.columns;

  const idxX = cols.indexOf(X.id);
  const idxY = cols.indexOf(Y.id);
  const idxZ = Z.map(zName => cols.indexOf(zName.id));

  var X_vals = new Array(n);
  var Y_vals = new Array(n);
  var Z_vals = new Array(n);

  // 1) extract
  if (idxZ.length === 0){
  	for (var i = 0; i < n; i++) {
  	  var row = df.iloc({ rows: [i] }).values[0];
  	  X_vals[i] = row[idxX];
  	  Y_vals[i] = row[idxY];
  	  Z_vals[i] = [1];
	}
  } else{
  	for (var i = 0; i < n; i++) {
  	  var row = df.iloc({ rows: [i] }).values[0];
  	  X_vals[i] = row[idxX];
  	  Y_vals[i] = row[idxY];
  	  Z_vals[i] = idxZ.map(zIdx => row[zIdx]);
  	}
  }

  // 2) train RF X ~ Z
  const typeX = varTypes[X.id];
  let modelX, X_pred;

  if (typeX === "categorical") {
    // RandomForestClassifier expects the labels (X_vals) to be numeric or string categories
    modelX = new RFClassifier({
      nEstimators: 100,
      maxFeatures: 0.8,
      replacement: true,
      seed: 42
    });
    modelX.train(Z_vals, X_vals);
    X_pred = modelX.predict(Z_vals);
  } else {
    modelX = new RFRegression({
      nEstimators: 100,
      maxFeatures: 0.8,
      replacement: true,
      seed: 42
    });
    modelX.train(Z_vals, X_vals);
    X_pred = modelX.predict(Z_vals);
  }

  // 3) Decide whether to train a Classifier or Regressor for Y~Z
  const typeY = varTypes[Y.id];
  let modelY, Y_pred;
  if (typeY === "categorical") {
    modelY = new RFClassifier({
      nEstimators: 100,
      maxFeatures: 0.8,
      replacement: true,
      seed: 42
    });
    modelY.train(Z_vals, Y_vals);
    Y_pred = modelY.predict(Z_vals);
  } else {
    modelY = new RFRegression({
      nEstimators: 100,
      maxFeatures: 0.8,
      replacement: true,
      seed: 42
    });
    modelY.train(Z_vals, Y_vals);
    Y_pred = modelY.predict(Z_vals);
  }

  // 4) residuals
  var resX = X_vals.map(function(v,i){ return v - X_pred[i]; });
  var resY = Y_vals.map(function(v,i){ return v - Y_pred[i]; });

  // 5) canonical correlations
  var matX = new Matrix(resX.map(function(v){ return [v]; }));
  var matY = new Matrix(resY.map(function(v){ return [v]; }));
  var ccs  = canonicalCorrelations(matX, matY);

  // 6) Pillai statistic -> F -> p-value
  var coef = ccs.reduce(function(s,r){ return s + r*r; }, 0);
  var a    = matX.columns;
  var b    = matY.columns;
  var smin = Math.min(a,b);
  var df1  = a * b;
  var df2  = smin * (n - 1 + smin - a - b);
  var fstat = (coef/df1) * (df2/(smin - coef));
  var pval  = 1 - jStat.centralF.cdf(fstat, df1, df2);

  console.log("CI Test: X =", X.id, "Y =", Y.id, "Z =", Z.map(zName => zName.id), "coef=", coef, "pval=", pval);
  return {
    effectSize: coef,
    pValue: pval
  };
}


function compute_effects(dag, df, pval_thresh, effect_thresh, varTypes) {
  var verts = dag.getVertices();
  var out = [];

  for (var i = 0; i < verts.length; i++) {
    for (var j = i + 1; j < verts.length; j++) {
      var n1 = verts[i];
      var n2 = verts[j];

      var p1 = n1.getParents();
      var p2 = n2.getParents();

      var other, u, v, arrow;

      if (p1.indexOf(n2) !== -1) {
        other = p1.filter(function(x){ return x !== n2; });
        u = n2; v = n1; arrow = '->';
      }
      else if (p2.indexOf(n1) !== -1) {
        other = p2.filter(function(x){ return x !== n1; });
        u = n1; v = n2; arrow = '->';
      }
      else {
        // union of p1 and p2
        other = p1.slice();
        p2.forEach(function(x){
          if (other.indexOf(x) === -1) { other.push(x); }
        });
        u = n1; v = n2; arrow = '--';
      }

      // call our Pillai test
      var res = pillai_test(u, v, other, df, varTypes);

      if (res.effectSize > effect_thresh && res.pValue < pval_thresh){
      	out.push({
        	X: u,
        	A: arrow,
        	Y: v,
        	cor: res.effectSize,
        	p:   res.pValue
      	});
      }
    }
  }
	
  return out;
}

function rmsea(dag, df) {
  const vertices = dag.getVertices();
  const nVert = vertices.length;
  const pvalues = [];

  // 3) Loop over every unordered pair (i < j)
  for (let i = 0; i < nVert - 1; i++) {
    for (let j = i + 1; j < nVert; j++) {
      const vi = vertices[i];
      const vj = vertices[j];
      const name_i = vi.id;
      const name_j = vj.id;

      const parents_i = vi.getParents(); 
      const parents_j = vj.getParents();

      const parentNames_i = parents_i.map((p) => p.id);
      const parentNames_j = parents_j.map((p) => p.id);

      const i_in_pj = parentNames_j.indexOf(name_i) !== -1;
      const j_in_pi = parentNames_i.indexOf(name_j) !== -1;

      if (!i_in_pj && !j_in_pi) {
        const ZbyId = {};
        parents_i.forEach((p) => {
          ZbyId[p.id] = p;
        });
        parents_j.forEach((p) => {
          ZbyId[p.id] = p;
        });
        // Convert back to an array of Vertex objects
        const Zunion = Object.values(ZbyId);

        // 3c) Call your Pillai‐based CI test:
        const res = pillai_test(vi, vj, Zunion, df);
        const pval = Math.max(res.pValue, 1e-40);
        pvalues.push(pval);
      }
    }
  }

  // 4) Now compute Fisher’s C = -2 * sum(log(p_i))
  const m = pvalues.length;
  if (m === 0) {
    // If there were no non‐adjacent pairs at all (unlikely), return 0
    return 0;
  }
  let sumLog = 0;
  for (let k = 0; k < m; k++) {
    sumLog += Math.log(pvalues[k]);
  }
  const fisherc = -2 * sumLog;

  // 5) Compute sample size n (number of rows in df)
  //    In Danfo.js, DataFrame.shape[0] is the row‐count.
  const n = df.shape[0];

  // 6) RMSEA = sqrt( max( C − 2*m, 0 ) / [2 * m * (n − 1)] )
  const numerator = Math.max(fisherc - 2 * m, 0);
  const denominator = 2 * m * (n - 1);
  const rmseaVal = Math.sqrt(numerator / denominator);

  return rmseaVal;
}



module.exports = {
  rmsea: rmsea,
  pillai_test:    pillai_test,
  compute_effects: compute_effects
};
