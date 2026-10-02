// docs/src/*.html 을 헤드리스 크롬으로 찍어 docs/images/*.png 로 저장한다.
// 실행: node tools/render-docs.js        (크롬 위치가 다르면 CHROME 환경변수로 지정)
// 각 페이지의 <meta name="size" content="가로x세로"> 크기로 찍고, 2배 해상도로 저장한다.

const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { pathToFileURL } = require('url');

const root = path.join(__dirname, '..');
const srcDir = path.join(root, 'docs', 'src');
const outDir = path.join(root, 'docs', 'images');
const demoPopup = path.join(srcDir, 'popup-demo.html');

function findChrome() {
  if (process.env.CHROME) return process.env.CHROME;
  const candidates = {
    win32: [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]
      .filter(Boolean)
      .map((dir) => path.join(dir, 'Google', 'Chrome', 'Application', 'chrome.exe')),
    darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'],
    linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
  }[process.platform] ?? [];
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) throw new Error('크롬을 찾지 못했어요. CHROME 환경변수로 경로를 알려 주세요.');
  return found;
}

// 팝업 스크린샷용 사본: 경로 기준을 저장소 루트로 돌리고 가짜 chrome API(demo.js)를 끼워 넣는다.
function writeDemoPopup() {
  const html = fs.readFileSync(path.join(root, 'popup.html'), 'utf8')
    .replace('<head>', '<head>\n  <base href="../../">')
    .replace('<script src="popup.js"></script>', '<script src="docs/src/demo.js"></script>\n  <script src="popup.js"></script>');
  fs.writeFileSync(demoPopup, html);
}

const chrome = findChrome();
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'monga-docs-'));
fs.mkdirSync(outDir, { recursive: true });
writeDemoPopup();

try {
  const pages = fs.readdirSync(srcDir).filter((f) => f.endsWith('.html') && f !== 'popup-demo.html');
  for (const page of pages) {
    const file = path.join(srcDir, page);
    const size = fs.readFileSync(file, 'utf8').match(/<meta name="size" content="(\d+)x(\d+)">/);
    if (!size) { console.warn(`건너뜀 (size 없음): ${page}`); continue; }

    const out = path.join(outDir, page.replace(/\.html$/, '.png'));
    execFileSync(chrome, [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--allow-file-access-from-files',
      '--force-device-scale-factor=2',
      '--virtual-time-budget=5000',
      `--user-data-dir=${profile}`,
      `--window-size=${size[1]},${size[2]}`,
      `--screenshot=${out}`,
      pathToFileURL(file).href,
    ], { stdio: 'ignore', timeout: 60_000 });
    console.log(path.relative(root, out));
  }
} finally {
  fs.rmSync(demoPopup, { force: true });
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* 크롬이 아직 잡고 있으면 남겨 둔다 */ }
}
