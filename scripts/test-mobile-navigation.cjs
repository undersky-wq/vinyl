// Run: node scripts/test-mobile-navigation.cjs (no device or network required).
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');
const root = path.resolve(__dirname, '../apps/mobile');
const source = ts.createSourceFile('App.tsx', fs.readFileSync(path.join(root, 'App.tsx'), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const nodes = [];
function visit(node) { nodes.push(node); ts.forEachChild(node, visit); }
visit(source);
const tabs = nodes.find((node) => ts.isVariableDeclaration(node) && node.name.getText(source) === 'tabs');
const nav = nodes.find((node) => ts.isJsxElement(node) && node.openingElement.attributes.getText(source) === 'style={styles.tabbar}');
assert.ok(tabs);
assert.ok(nav);
const code = `const ${tabs.getText(source)};
exports.render = (lang, activeTab, setActiveTab, setActiveRelease) => (${nav.getText(source)});`;
const compiled = ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2020 },
});
const jsx = (type, props) => ({ type, props });
const loaded = { exports: {} };
new Function('require', 'exports', 'House', 'Library', 'ListMusic', 'AudioLines', 'Heart', 'View', 'Pressable', 'Text', 'styles', 'colors', compiled.outputText)(
  () => ({ jsx, jsxs: jsx }), loaded.exports,
  'House', 'Library', 'ListMusic', 'AudioLines', 'Heart', 'View', 'Pressable', 'Text', {},
  { accent: 'purple', muted: 'grey' },
);
const expected = {
  en: ['Home', 'Library', 'Playlists', 'Mixes', 'Likes'],
  ru: ['Главная', 'Библиотека', 'Плейлисты', 'Миксы', 'Избранное'],
};
const keys = ['home', 'library', 'playlists', 'mixes', 'favorites'];
for (const lang of ['en', 'ru', 'en']) {
  for (const activeTab of keys) {
    let selected;
    let release = 'open';
    const tree = loaded.exports.render(lang, activeTab, (value) => { selected = value; }, (value) => { release = value; });
    assert.equal(tree.props.children.length, 5);
    tree.props.children.forEach((tab, index) => {
      assert.equal(tab.props.accessibilityLabel, expected[lang][index]);
      assert.equal(tab.props.accessibilityState.selected, keys[index] === activeTab);
      const label = tab.props.children.find((child) => child.type === 'Text');
      assert.equal(label.props.children, expected[lang][index]);
      assert.equal(label.props.numberOfLines, 1);
      assert.equal(label.props.adjustsFontSizeToFit, true);
      tab.props.onPress();
      assert.equal(selected, keys[index]);
      assert.equal(release, null);
    });
  }
}
// Every language switcher must use the parent's state, including the retained Home screen.
for (const name of ['HomeScreen', 'LibraryScreen', 'PlaylistsScreen', 'MixesScreen', 'FavoritesScreen', 'ProfileScreen']) {
  const instance = nodes.find((node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === name);
  assert.ok(instance, name);
  const attrs = instance.attributes.properties;
  for (const [prop, value] of [['lang', 'lang'], ['onLanguageChange', 'setLang']]) {
    assert.ok(attrs.some((attr) => ts.isJsxAttribute(attr) && attr.name.text === prop && attr.initializer.expression.getText(source) === value), `${name}.${prop}`);
  }
  const screen = fs.readFileSync(path.join(root, 'src/screens', `${name}.tsx`), 'utf8');
  assert.match(screen, /onLanguageChange: setLang/);
  assert.doesNotMatch(screen, /\[lang, setLang\]\s*=\s*useState/);
  assert.match(screen, /setLang\('ru'\)/);
  assert.match(screen, /setLang\('en'\)/);
}
console.log('PASS: RU/EN tab labels and accessibility, active tabs, navigation actions, shared language across all six switchers.');
