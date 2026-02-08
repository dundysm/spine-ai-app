/**
 * Embeds the app icon into the built Windows exe (win-unpacked).
 * Run after electron-builder when signAndEditExecutable is false.
 */
const path = require('path');
const fs = require('fs');

const root = path.join(__dirname, '..');
const exePath = path.join(root, 'installer', 'win-unpacked', 'Spine AI.exe');
const iconPath = path.join(root, 'electron', 'icon.ico');

if (!fs.existsSync(exePath)) {
  console.warn('set-exe-icon: exe not found, skipping:', exePath);
  process.exit(0);
}
if (!fs.existsSync(iconPath)) {
  console.warn('set-exe-icon: icon not found, skipping:', iconPath);
  process.exit(0);
}

const { rcedit } = require('rcedit');
rcedit(exePath, { icon: iconPath })
  .then(() => console.log('set-exe-icon: icon embedded into', path.basename(exePath)))
  .catch((err) => {
    console.error('set-exe-icon failed:', err.message);
    process.exit(1);
  });
