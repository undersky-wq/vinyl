const fs = require('node:fs');
const path = require('node:path');
const postcss = require('postcss');

function retireClassicStyles(css) {
  const current = postcss.parse(css);
  const retired = postcss.root();
  const classic = /^\.(?:profile-design-setting[\w-]*|mix-card[\w-]*|mix-admin-panel[\w-]*|mix-admin-form[\w-]*|mixes-page|mixes-empty|release-grid|release-card[\w-]*|home-grid[\w-]*|home-style-toggle)(?=[\s.:#[>+~]|$)/;
  current.walkRules(rule => {
    const unused = rule.selectors.filter(selector => classic.test(selector.trim()) && !/:(?:is|where|has|not)\(/.test(selector));
    if (!unused.length) return;
    // Retain mixed/shared selectors and their surrounding media conditions.
    const keep = rule.selectors.filter(selector => !unused.includes(selector));
    let archived = rule.clone({ selector: unused.join(', ') });
    for (let parent = rule.parent; parent && parent.type !== 'root'; parent = parent.parent) {
      const wrapper = parent.clone({ nodes: [] });
      wrapper.append(archived);
      archived = wrapper;
    }
    retired.append(archived);
    if (keep.length) rule.selector = keep.join(', ');
    else rule.remove();
  });
  current.walkAtRules(rule => { if (rule.nodes?.length === 0) rule.remove(); });
  return { current: current.toString(), retired: retired.toString() };
}

if (require.main === module) {
  const source = path.join(__dirname, '../src/app/globals.css');
  const archive = path.join(__dirname, '../src/styles/retired-classic.css');
  const before = fs.readFileSync(source, 'utf8');
  const result = retireClassicStyles(before);
  if (!result.retired.trim()) {
    console.log('Classic styles already retired; archive left unchanged');
    process.exit(0);
  }
  fs.mkdirSync(path.dirname(archive), { recursive: true });
  fs.writeFileSync(archive, '/* Retired UI styles. Not imported by the application. */\n' + result.retired);
  fs.writeFileSync(source, result.current);
  console.log(`Shared CSS: ${Buffer.byteLength(before)} -> ${Buffer.byteLength(result.current)} bytes`);
}
module.exports = { retireClassicStyles };
