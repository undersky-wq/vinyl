const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');

// Local setup only. Never print the key or replace an existing nonempty key.
const file = path.resolve(__dirname, '../../../.env');
const text = fs.readFileSync(file, 'utf8');
const pattern = /^AUTH_2FA_ENCRYPTION_KEY\s*=([^\r\n]*)/m;
const match = text.match(pattern);
const existing = (match?.[1] || '').trim().replace(/^['"]|['"]$/g, '');
if (existing) {
  if (!/^[a-f0-9]{64}$/i.test(existing)) throw Error('Existing 2FA key is invalid; refusing to replace it.');
  console.log('Local 2FA key already configured; unchanged.');
} else {
  const line = `AUTH_2FA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`;
  const newline = text.includes('\r\n') ? '\r\n' : '\n';
  fs.writeFileSync(file, match ? text.replace(pattern, line) : `${text}${text.endsWith('\n') ? '' : newline}${line}${newline}`, { mode: 0o600 });
  console.log('Local 2FA key configured. Secret not displayed.');
}
