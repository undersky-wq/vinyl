const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/components/paper-archive.tsx'), 'utf8');
const preview = source.slice(source.indexOf('{stackMode && selected === null && hovered !== null'), source.indexOf('{release && (expanded || stackMode)'));
assert(preview.includes('key={`stack-label-${releases[hovered].id}`}'), 'each hovered release restarts the reveal');
for (const field of ['artist', 'title', 'year', 'styles']) assert(preview.includes(`releases[hovered].${field}`));
assert(!preview.includes('<ol>'), 'hover must not expose the tracklist');

(async () => {
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
  const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const css = ['record-archive.css', 'shelf-theme.css'].map(file => fs.readFileSync(path.join(root, 'src/components', file), 'utf8')).join('\n');
    for (const theme of ['light', 'dark']) {
      await page.setContent(`<html data-visual-variant="shelf" data-shelf-theme="${theme}"><head><style>${css}</style></head><body>
        <section class="paper-archive is-stack" style="--travel:0px">
          <div class="paper-stack-hover-label" style="--hover-position:720px"><strong>Francisco</strong><span class="paper-stack-hover-meta"><span>Hero / Venti Venti</span><span>2005</span></span><p class="paper-release-styles">House</p></div>
          <aside class="paper-tracklist"><h2>Francisco</h2><p>Hero / Venti Venti <span>2005</span></p><p class="paper-release-styles">House</p></aside>
        </section></body></html>`);
      const result = await page.evaluate(() => {
        const hover = document.querySelector('.paper-stack-hover-label');
        const full = document.querySelector('.paper-tracklist');
        const animation = (element, pseudo) => {
          const s = getComputedStyle(element, pseudo);
          return [s.animationName, s.animationDuration, s.animationDelay, s.animationTimingFunction, s.animationFillMode];
        };
        return {
          line: animation(hover, '::before'), fullLine: animation(full, '::before'),
          artist: animation(hover.querySelector('strong')), fullArtist: animation(full.querySelector('h2')),
          meta: animation(hover.querySelector('span')), fullMeta: animation(full.querySelector('p')),
          genres: animation(hover.querySelector('p')), fullGenres: animation(full.querySelector('.paper-release-styles')),
          color: getComputedStyle(hover, '::before').backgroundColor,
          width: getComputedStyle(hover, '::before').width,
          lineHeight: parseFloat(getComputedStyle(hover, '::before').height), height: hover.offsetHeight,
          left: getComputedStyle(hover).left, fullLeft: getComputedStyle(full).left,
          padding: getComputedStyle(hover).paddingLeft, fullPadding: getComputedStyle(full).paddingLeft,
        };
      });
      for (const [hover, full] of [['line', 'fullLine'], ['artist', 'fullArtist'], ['meta', 'fullMeta'], ['genres', 'fullGenres']]) {
        assert.deepEqual(result[hover], result[full], `${theme}: ${hover} shares the full reveal animation`);
      }
      assert(parseFloat(result.genres[2]) > Math.max(parseFloat(result.artist[2]), parseFloat(result.meta[2])), 'genres start after the main labels');
      const timeline = await previewTimeline(page);
      assert.equal(timeline.before.artist, 0);
      assert.equal(timeline.before.genres, 0, 'no early genre flash');
      assert(timeline.labels.artist > 0 && timeline.labels.meta > 0, 'artist and title reveal first');
      assert.equal(timeline.labels.genres, 0, 'genres stay hidden while the main labels start');
      assert(timeline.genres.genres > 0, 'genres then reveal with the same easing');
      assert.equal(result.width, '1px');
      assert.equal(result.color, theme === 'dark' ? 'rgba(255, 255, 255, 0.44)' : 'rgb(17, 17, 17)');
      assert(Math.abs(result.lineHeight - result.height) < 1, 'line follows the preview height, not the cover height');
      assert.equal(result.left, result.fullLeft, 'the line uses the same cover clearance');
      assert.equal(result.padding, result.fullPadding);
      const positionCode = require('typescript').transpileModule(fs.readFileSync(path.join(root, 'src/lib/stack-hover-position.ts'), 'utf8'), {compilerOptions:{module:require('typescript').ModuleKind.CommonJS}}).outputText;
      await page.addScriptTag({content:`var exports = {}; ${positionCode}`});
      for (const angle of [-55, -49, 0]) {
        const geometry = await page.evaluate(angle => {
          const root = document.querySelector('.paper-archive');
          const label = root.querySelector('.paper-stack-hover-label');
          const cover = document.createElement('div');
          cover.style.cssText = `position:absolute;left:500px;top:300px;width:400px;height:400px;transform:perspective(1200px) rotateX(${angle}deg)`;
          root.append(cover);
          exports.positionStackHoverLabel(root, cover, label);
          const c = cover.getBoundingClientRect(), l = label.getBoundingClientRect();
          cover.remove();
          return {gap:l.left-c.right, top:l.top-c.top};
        }, angle);
        assert(Math.abs(geometry.gap-28)<1, 'line stays 28px beyond the projected cover edge');
        assert(Math.abs(geometry.top)<1, 'line starts at the projected top edge');
      }
      await page.emulateMedia({ reducedMotion: 'reduce' });
      assert(await page.locator('.paper-stack-hover-label').evaluate(element => [getComputedStyle(element, '::before'), ...Array.from(element.children, child => getComputedStyle(child))].every(style => style.animationName === 'none')));
      await page.emulateMedia({ reducedMotion: 'no-preference' });
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(await page.locator('.paper-stack-hover-label').evaluate(element => getComputedStyle(element).display), 'none', 'touch layout stays unchanged');
      await page.setViewportSize({ width: 1440, height: 1000 });
    }
    console.log('PASS: hover keeps artist/title/year/styles only; reveal, line, spacing match the open release in both themes; reduced motion and mobile unchanged');
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

function previewTimeline(page) {
  return page.locator('.paper-stack-hover-label').evaluate(element => {
    const nodes = { artist: element.querySelector('strong'), meta: element.querySelector('.paper-stack-hover-meta'), genres: element.querySelector('p') };
    const at = time => Object.fromEntries(Object.entries(nodes).map(([key, node]) => {
      const animation = node.getAnimations()[0];
      animation.pause();
      animation.currentTime = time;
      return [key, Number(getComputedStyle(node).opacity)];
    }));
    return { before: at(250), labels: at(450), genres: at(750) };
  });
}
