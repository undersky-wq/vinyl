const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const root = path.join(__dirname, '../src');
const source = fs.readFileSync(path.join(root, 'components/shelf-theme-toggle.tsx'), 'utf8');
const ast = ts.createSourceFile('theme.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const fn = ast.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === 'applyTheme');
const frames = new Map();
let id = 0, reads = 0;
const documentElement = { dataset: { shelfTheme: 'dark' }, style: {}, get offsetWidth() { reads++; return 1280; } };
const context = { document: { documentElement }, window: {
  requestAnimationFrame(fn) { frames.set(++id, fn); return id; },
  cancelAnimationFrame(id) { frames.delete(id); },
} };
vm.createContext(context);
vm.runInContext(ts.transpileModule('let themePaintFrame = 0;\n' + fn.getText(ast), {}).outputText, context);
function tick() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(fn => fn()); }
context.applyTheme('light');
assert.equal(documentElement.dataset.shelfThemeChanging, 'true');
assert.equal(documentElement.dataset.shelfTheme, 'light');
assert.equal(documentElement.style.colorScheme, 'light');
assert.equal(reads, 1);
tick();
assert.equal(documentElement.dataset.shelfThemeChanging, 'true');
context.applyTheme('dark');
assert.equal(frames.size, 1, 'Rapid toggles cancel stale cleanup');
tick(); tick();
assert.equal(documentElement.dataset.shelfThemeChanging, undefined);
assert.equal(documentElement.style.colorScheme, 'dark');
context.applyTheme('dark');
assert.equal(frames.size, 0, 'Mounting the existing theme does not animate');
const css = fs.readFileSync(path.join(root, 'components/archive-render-stability.css'), 'utf8');
assert(css.includes('.paper-archive .paper-row{isolation:isolate}'));
assert(css.includes('.paper-archive:not(.is-grid) .paper-transport{will-change:transform}'));
assert.match(css, /@media\(max-width:700px\)\{\s*\.paper-archive>\.paper-header>\.archive-page-header,\s*\.paper-archive>\.paper-header>\.paper-heading\{\s*isolation:isolate;\s*will-change:transform;\s*backface-visibility:hidden;/);
assert(!/\.is-scrolling[^{}]*\.paper-header/.test(css), 'Header layer is stable before, during and after a touch drag');
assert(!css.includes('.paper-archive>.paper-header{'), 'Do not make the parent a containing block for fixed header controls');
const mobileHeader = css.match(/\.paper-archive>\.paper-header>\.paper-heading\{([^}]+)\}/)[1];
assert(!/opacity|visibility\s*:|transform\s*:|position|top|left|height|width|contain/.test(mobileHeader.replace('backface-visibility:hidden;', '')),
  'Keep header geometry, navigation animations and expanded heading visibility unchanged');
assert(!css.includes('opacity:0'));
assert(!css.includes('.paper-record'), 'Theme guard does not disable cover animations');
assert(fs.readFileSync(path.join(root, 'components/paper-archive.tsx'), 'utf8').includes("import './archive-render-stability.css'"));
const themeCss = fs.readFileSync(path.join(root, 'components/shelf-theme.css'), 'utf8');
const toggleRules = [...themeCss.matchAll(/([^{}]*\.shelf-theme-toggle[^{}]*)\{([^{}]*)\}/g)];
assert(toggleRules.some(([, selector, body]) => selector.trim() === '.shelf-theme-toggle'
  && body.includes('-webkit-tap-highlight-color: transparent;')), 'No native tap flash');
assert(themeCss.includes('@media(max-width:700px),(hover:none) and (pointer:coarse){'));
assert(themeCss.includes('html body .shelf-theme-toggle:is(:hover,:active,:focus-visible){color:#888}'));
assert(themeCss.includes("html[data-shelf-theme='dark'] body .shelf-theme-toggle:is(:hover,:active,:focus-visible){color:#aaa}"));
assert(themeCss.includes('.shelf-theme-toggle:hover,.shelf-theme-toggle:focus-visible { color: #111;'), 'Desktop hover behavior is preserved');
const mobileCss = fs.readFileSync(path.join(root, 'components/shelf-mobile-layout.css'), 'utf8');
assert(!mobileCss.includes('--stack-size:var(--cover)'), 'Mobile Stack retains its original on-screen size');
assert(!fs.readFileSync(path.join(root, 'components/paper-archive.tsx'), 'utf8').includes('const coverSize = stackMode ? shelfMobileLayout('));
console.log('PASS: stable deck boundary, atomic theme colors, rapid toggles and two-frame cleanup');
