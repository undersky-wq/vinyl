const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../src/lib/navigation-prefetch.ts'), 'utf8');
const listeners = new Map();
const root = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: name => listeners.delete(name) };
const navigator = { connection: {} };
class Element {
  constructor(attributes = {}, className = '') { this.attributes = attributes; this.classList = { contains: name => name === className }; }
  closest() { return this; }
  getAttribute(name) { return this.attributes[name] || null; }
  hasAttribute(name) { return name in this.attributes; }
}
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
  exports: exportsObject, URL, Element, navigator, location: { href: 'https://example.com/', origin: 'https://example.com', pathname: '/', search: '' },
});
const warmed = [];
const stop = exportsObject.installNavigationPrefetch({ prefetch: href => warmed.push(href) }, root);
assert.equal(warmed.length, 0, 'Do not load every page at startup');
const fire = (type, target, pointerType = 'mouse') => listeners.get(type)({ type, target, pointerType });
fire('pointerover', new Element({ href: '/about' }));
fire('pointerover', new Element({ href: '/about' }));
assert.deepEqual(warmed, ['/about']);
fire('pointerover', new Element({ href: '/favorites' }), 'touch');
assert.equal(warmed.length, 1, 'Do not prefetch when a touch begins scrolling');
fire('focusin', new Element({ href: '/favorites' }));
fire('pointerover', new Element({}, 'paper-section-mixes'));
fire('focusin', new Element({ 'aria-controls': 'paper-playlists-panel' }));
assert.deepEqual(warmed, ['/about', '/favorites', '/mixes', '/?view=playlists']);
for (const attributes of [{ href: 'https://other.com/tracks' }, { href: '/' }, { href: '/upload' }, { href: '/tracks', download: '' }, { href: '/tracks', target: '_blank' }]) {
  fire('pointerover', new Element(attributes));
}
assert.equal(warmed.length, 4);
navigator.connection.saveData = true;
fire('pointerover', new Element({ href: '/tracks' }));
assert.equal(warmed.length, 4);
navigator.connection = { effectiveType: 'slow-2g' };
fire('focusin', new Element({ href: '/tracks' }));
assert.equal(warmed.length, 4);
navigator.connection = {};
fire('pointerover', new Element({ href: '/tracks' }));
assert.equal(warmed.at(-1), '/tracks');
stop(); assert.equal(listeners.size, 0);
console.log('PASS: no startup prefetch, pointer/focus intent, About and section buttons, deduplication, touch/data-saving/external/download guards and cleanup');
