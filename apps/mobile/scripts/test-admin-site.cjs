const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/admin-site.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject, URL });
const { isAdminSiteUrl, isAdminPageUrl, recoveryDownloadText } = exportsObject;
for (const route of ['/profile', '/profile/users', '/upload', '/privacy', '/consent']) {
  assert(isAdminPageUrl(`https://mityadima.ru${route}`));
}
for (const url of ['http://mityadima.ru/profile', 'https://mityadima.ru.evil.test/profile', 'https://mityadima.ru@evil.test/profile', 'file:///profile', 'javascript:alert(1)', 'https://mityadima.ru:444/profile']) {
  assert(!isAdminSiteUrl(url));
  assert(!isAdminPageUrl(url));
}
assert(!isAdminPageUrl('https://mityadima.ru/tracks'));
assert(!isAdminPageUrl('https://mityadima.ru/profile-other'));
const message = { channel: 'vinyl-admin-download', name: 'mityadima-recovery-codes.txt', text: 'sample-test-data' };
assert.equal(recoveryDownloadText(JSON.stringify(message)), message.text);
assert.equal(recoveryDownloadText(JSON.stringify({ ...message, name: '../../other.txt' })), null);
assert.equal(recoveryDownloadText(JSON.stringify({ ...message, text: 'x'.repeat(16001) })), null);
assert.equal(recoveryDownloadText('{broken'), null);
const panel = fs.readFileSync(path.join(__dirname, '../src/components/AdminSitePanel.tsx'), 'utf8');
assert(panel.includes('isAdminSiteUrl(event.nativeEvent.url)'));
assert(panel.includes('sharedCookiesEnabled thirdPartyCookiesEnabled={false}'));
assert(panel.includes('mixedContentMode="never" allowFileAccess={false}'));
assert(panel.includes('requestDirectoryPermissionsAsync'));
assert(!panel.includes('vinyl_session'));
assert(!panel.includes('setAll') && !panel.includes('clearAll'));
const profile = fs.readFileSync(path.join(__dirname, '../src/screens/ProfileScreen.tsx'), 'utf8');
assert.match(profile, /if \(isAdmin\) \{\s+return <AdminSitePanel/);
console.log('PASS: admin uses real mobile profile, origin and route checks, bounded explicit recovery download and shared session without token injection');
