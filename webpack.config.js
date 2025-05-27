const path    = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: './utils.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    library: 'MyDAGUtils',
    libraryTarget: 'var'
  },
  resolve: {
    alias: {
      'danfojs-node': 'danfojs'
    },
    fallback: {
      crypto: require.resolve('crypto-browserify'),
      stream: require.resolve('stream-browserify'),
      buffer: require.resolve('buffer/'),
      process: require.resolve('process/browser'),
      vm: require.resolve('vm-browserify') 
    }
  },
  module: {
    rules: [
      {
        test: /\.js$/,
        exclude: /node_modules\/(?!(ml-matrix|ml-random-forest|jstat)\/).*/,
        use: {
          loader: 'babel-loader',
          options: { presets: ['@babel/preset-env'] }
        }
      }
    ]
  },
  plugins: [
    // Ignore big TF/plotly/xlsx deps you don’t need
    new webpack.IgnorePlugin({ resourceRegExp: /^@tensorflow\/tfjs/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^plotly\.js-dist-min$/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^xlsx$/ }),

    // Inject Buffer and process so crypto-browserify & friends work
    new webpack.ProvidePlugin({
      Buffer: ['buffer', 'Buffer'],
      process: 'process/browser'
    })
  ]
};
