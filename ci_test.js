// ci_test.js
var { pillai_test } = require('./pillai_trace');
// Linear (Pearson residual) CI test
var pearsonr = require('./pearson').pearsonr;



function compute_effects(dag, df, pval_thresh, effect_thresh, ci_method) {
  // Default method if not provided
  ci_method = ci_method || 'pillai_trace';

  // choose test function
  var testFn = (ci_method === 'pearsonr') ? pearsonr : pillai_test;

  var verts = dag.getVertices();
  var edgesOut = [];
  var pvaluesForRmsea = []; // p-values for NON-adjacent pairs only (i.e., arrow == '--')

  for (var i = 0; i < verts.length; i++) {
    for (var j = i + 1; j < verts.length; j++) {
      var n1 = verts[i];
      var n2 = verts[j];

      var p1 = n1.getParents();
      var p2 = n2.getParents();

      var other, u, v, arrow;
      var nonAdjacent = false;

      if (p1.indexOf(n2) !== -1) {
        other = p1.filter(function(x){ return x !== n2; });
        u = n2; v = n1; arrow = '->';
      }
      else if (p2.indexOf(n1) !== -1) {
        other = p2.filter(function(x){ return x !== n1; });
        u = n1; v = n2; arrow = '->';
      }
      else {
        // union of p1 and p2 (non-adjacent pair)
        other = p1.slice();
        p2.forEach(function(x){
          if (other.indexOf(x) === -1) { other.push(x); }
        });
        u = n1; v = n2; arrow = '--';
        nonAdjacent = true;
      }

      // call selected CI test
      var res = testFn(u, v, other, df);

      // unified debug log (method + variables)
      console.log('[CI]', ci_method, 'X=', u.id, 'Y=', v.id, 'Z=', other.map(function(z){return z.id;}), 'effect=', res.effectSize, 'pval=', res.pValue);

      if (res.effectSize > effect_thresh && res.pValue < pval_thresh){
        edgesOut.push({
          X: u,
          A: arrow,
          Y: v,
          cor: res.effectSize,
          p:   res.pValue
        });
      }

      if (nonAdjacent) {
        // For RMSEA, cap p-values away from zero
        var pv = Math.max(res.pValue, 1e-40);
        if (isFinite(pv)) pvaluesForRmsea.push(pv);
      }
    }
  }

  // Compute RMSEA from collected non-adjacent pair p-values, using Fisher's C
  var rmseaVal = 0;
  var m = pvaluesForRmsea.length;
  if (m > 0) {
    var sumLog = 0;
    for (var k = 0; k < m; k++) sumLog += Math.log(pvaluesForRmsea[k]);
    var fisherC = -2 * sumLog;
    var n = df.shape[0];
    var numerator = Math.max(fisherC - 2 * m, 0);
    var denominator = 2 * m * (n - 1);
    rmseaVal = Math.sqrt(numerator / denominator);
  }

  // Return combined result (edges + rmsea). Existing code expecting array must be updated.
  return { edges: edgesOut, rmsea: rmseaVal };
}

// Backward compatible rmsea wrapper (deprecated): recompute using compute_effects.
function rmsea(dag, df, ci_method){
  const res = compute_effects(dag, df, 1, 0, ci_method || 'pillai_trace');
  return res.rmsea;
}



module.exports = {
  rmsea: rmsea,
  pillai_test:    pillai_test,
  pearsonr: pearsonr,
  compute_effects: compute_effects
};
