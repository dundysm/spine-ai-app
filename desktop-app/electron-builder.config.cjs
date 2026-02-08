/**
 * electron-builder config: same as package.json "build" plus afterPack
 * to embed the app icon into the exe before the NSIS installer is built.
 * Use: electron-builder --win --x64 --config electron-builder.config.cjs
 */
const path = require('path');
const { rcedit } = require('rcedit');
const pkg = require('./package.json');

module.exports = {
  ...pkg.build,
  afterPack: async (context) => {
    if (context.electronPlatformName !== 'win32') return;
    const exeName = context.packager.appInfo.productFilename + '.exe';
    const exePath = path.join(context.appOutDir, exeName);
    const iconPath = path.join(context.packager.projectDir, 'electron', 'icon.ico');
    await rcedit(exePath, { icon: iconPath });
    console.log('Icon embedded into', exeName);
  },
};
