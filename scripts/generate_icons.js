const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const targetDir = path.resolve(__dirname, '../android-app/src/assets/icons');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const icons = {
  'home': `<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>`,
  'live-tv': `<rect width="20" height="15" x="2" y="7" rx="2" ry="2"/><polyline points="17 2 12 7 7 2"/>`,
  'vod': `<path d="M20.2 6 3 11l-.9-3 17.2-5Z"/><path d="m6.2 5.3 3.1 4"/><path d="m12.4 3.4 3.1 4"/><path d="M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>`,
  'series': `<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>`,
  'movies': `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18"/><path d="M3 7.5h4"/><path d="M3 12h18"/><path d="M3 16.5h4"/><path d="M17 3v18"/><path d="M17 7.5h4"/><path d="M17 16.5h4"/>`,
  'search': `<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>`,
  'settings': `<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>`,
  'play': `<polygon points="6 3 20 12 6 21 6 3" fill="white" stroke="white" stroke-width="2" stroke-linejoin="round"/>`,
  'pause': `<rect x="6" y="4" width="4" height="16" fill="white" stroke="white" stroke-width="2"/><rect x="14" y="4" width="4" height="16" fill="white" stroke="white" stroke-width="2"/>`,
  'quality': `<path d="M4 21v-7"/><path d="M4 10V3"/><path d="M12 21v-9"/><path d="M12 8V3"/><path d="M20 21v-5"/><path d="M20 12V3"/><path d="M1 14h6"/><path d="M9 8h6"/><path d="M17 16h6"/>`,
  'sources': `<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/>`,
  'multiview': `<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 3v18"/><path d="M3 12h18"/>`,
  'close': `<line x1="18" y1="6" x2="6" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="6" y1="6" x2="18" y2="18" stroke="white" stroke-width="2.5" stroke-linecap="round"/>`,
};

const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tv-app-icons-'));

for (const [name, svgContent] of Object.entries(icons)) {
  const html = `<!DOCTYPE html><html><body style="margin:0;padding:0;background:transparent;display:flex;align-items:center;justify-content:center;width:96px;height:96px;overflow:hidden;"><svg xmlns="http://www.w3.org/2000/svg" width="76" height="76" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${svgContent}</svg></body></html>`;
  const tempHtmlPath = path.join(targetDir, `_temp_${name}.html`);
  const outPngPath = path.join(targetDir, `${name}.png`);

  fs.writeFileSync(tempHtmlPath, html, 'utf8');

  try {
    execFileSync(chromePath, [
      '--headless=new',
      '--no-first-run',
      '--disable-gpu',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--disable-features=OptimizationGuideModelDownloading',
      `--user-data-dir=${userDataDir}`,
      '--default-background-color=00000000',
      `--screenshot=${outPngPath}`,
      '--window-size=96,96',
      `file://${tempHtmlPath}`,
    ], {
      stdio: 'pipe',
      timeout: 3000,
      killSignal: 'SIGKILL',
    });
    console.log(`Generated: ${name}.png`);
  } catch (err) {
    if (fs.existsSync(outPngPath)) {
      console.log(`Generated: ${name}.png`);
    } else {
      console.error(`Failed to generate ${name}:`, err.message);
    }
  } finally {
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
  }
}

fs.rmSync(userDataDir, { recursive: true, force: true });
console.log('All icons generated successfully!');
