const path    = require('path');
const webpack = require('webpack');

module.exports = {
  mode: 'production',
  entry: './utils.js',
  output: {
    filename:   'bundle.js',
    path:       path.resolve(__dirname, 'dist'),
    library:    'MyDAGUtils',
    libraryTarget: 'var'
  },
  resolve: {
    alias: {
      'danfojs-node': 'danfojs'
    },
    fallback: {
      // tell Webpack: if a module does `require('crypto')`,
      // use the crypto-browserify package instead
      crypto: require.resolve('crypto-browserify'),
      // if you installed more polyfills, add them here:
      // stream:  require.resolve('stream-browserify'),
      // buffer:  require.resolve('buffer/'),
      // process: require.resolve('process/browser'),
      // util:    require.resolve('util/'),
      // assert:  require.resolve('assert/'),
      // events:  require.resolve('events/')
    },
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
    new webpack.IgnorePlugin({ resourceRegExp: /^@tensorflow\/tfjs/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^plotly\.js-dist-min$/ }),
    new webpack.IgnorePlugin({ resourceRegExp: /^xlsx$/ })
  ]
};
