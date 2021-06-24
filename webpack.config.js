const path = require('path')
const webpack = require('webpack')

module.exports = {
  context: path.resolve(__dirname, 'src'),
  entry: {
    EmaMei: './EmaMei.ts',
  },
  plugins: [
    new webpack.NormalModuleReplacementPlugin(
      /server.ts/,
      path.resolve(__dirname, 'src/domParser/client.ts')
    ),
  ],
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    modules: ['node_modules'],
    extensions: ['.js', '.ts']
  },
  output: {
    filename: 'ema-mei.js',
    path: path.resolve(__dirname, 'dist'),
    libraryTarget: 'umd',
    library: '[name]',
    libraryExport: 'default'
  },
  devtool: 'cheap-module-source-map',
  mode: 'production',
}