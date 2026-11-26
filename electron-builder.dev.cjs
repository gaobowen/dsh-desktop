const packageJson = require('./package.json')
const productName = `${packageJson.build.productName} Dev`

module.exports = {
  ...packageJson.build,
  appId: 'io.dsh.desktop.dev',
  productName,
  directories: {
    ...packageJson.build.directories,
    output: 'dist-dev'
  },
  extraMetadata: {
    name: 'dsh-desktop-dev',
    productName,
    dshDesktopChannel: 'development'
  },
  artifactName: 'VinaHarness-dev-${os}-${arch}.${ext}',
  linux: {
    ...packageJson.build.linux,
    executableName: 'dsh-desktop-dev',
    artifactName: 'VinaHarness-dev-linux-${arch}-${version}.${ext}'
  },
  nsis: {
    ...packageJson.build.nsis,
    artifactName: 'VinaHarness-dev-windows-${arch}-setup.${ext}'
  },
  publish: null
}
