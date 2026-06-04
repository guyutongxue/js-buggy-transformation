const path = require('path');

module.exports = {
  mode: 'production',
  entry: './src/input.js',
  output: {
    path: path.resolve(__dirname, 'dist/webpack'),
    filename: 'output.js',
  },
  resolve: {
    extensions: ['.js'],
  },
  target: 'node',
  optimization: {
    minimize: false,
  },
};
