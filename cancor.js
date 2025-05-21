const { Matrix, SVD, inverse } = require('ml-matrix');

/**
 * Computes canonical correlations between two matrices X (N × a) and Y (N × b).
 * @param {Matrix} X - Matrix of shape (N, a)
 * @param {Matrix} Y - Matrix of shape (N, b)
 * @returns {number[]} Array of canonical correlations
 */
function canonicalCorrelations(X, Y) {
    // Center the matrices
    const Xc = centerMatrix(X);
    const Yc = centerMatrix(Y);

    // Compute covariance matrices
    const Cxx = Xc.transpose().mmul(Xc).div(Xc.rows - 1);
    const Cyy = Yc.transpose().mmul(Yc).div(Yc.rows - 1);
    const Cxy = Xc.transpose().mmul(Yc).div(Xc.rows - 1);
    const Cyx = Cxy.transpose();

    // Inverses of square roots
    const CxxInv = inverse(Cxx);
    const CyyInv = inverse(Cyy);

    // Solve the eigenproblem
    const mat = CxxInv.mmul(Cxy).mmul(CyyInv).mmul(Cyx);
    const svd = new SVD(mat);
    const canonicalCorrs = svd.diagonal.map(Math.sqrt);  // Singular values are squared canonical correlations

    return canonicalCorrs;
}

/**
 * Centers a matrix by subtracting the column mean.
 * @param {Matrix} M
 * @returns {Matrix} centered matrix
 */
function centerMatrix(M) {
    const colMeans = M.mean('column');
    return M.subRowVector(colMeans);
}

