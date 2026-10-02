const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const browser = process.env.CHROME_BIN || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
if (!fs.existsSync(browser)) throw new Error('Set CHROME_BIN to the Chrome executable.');
const output = path.resolve('docs/screenshots'); fs.mkdirSync(output, { recursive: true });
const profile = path.resolve('tmp/screenshot-profile');
const shots = [['index.html', 'home-desktop', '1440,1000'], ['index.html', 'home-mobile', '600,1000'], ['explore.html', 'explore-mobile', '600,1200'], ['community.html', 'community-desktop', '1440,1000']];
for (const [page, name, size] of shots) {
  const result = spawnSync(browser, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', `--window-size=${size}`, '--virtual-time-budget=6000', `--user-data-dir=${profile}`, `--screenshot=${path.join(output, name + '.png')}`, 'http://localhost:3000/' + page], { windowsHide: true, timeout: 30000, stdio: 'ignore' });
  if (result.status !== 0 || !fs.existsSync(path.join(output, name + '.png'))) throw new Error(`Could not render ${name}`);
  console.log('Rendered', name);
}
