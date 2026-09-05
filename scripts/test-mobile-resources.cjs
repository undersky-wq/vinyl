const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('../apps/mobile/node_modules/typescript');

const source = fs.readFileSync(
  path.resolve(__dirname, '../apps/mobile/src/lib/retriable-resource.ts'),
  'utf8',
);
const code = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const moduleUnderTest = { exports: {} };
new Function('module', 'exports', code)(moduleUnderTest, moduleUnderTest.exports);
const { createRetriableResource } = moduleUnderTest.exports;

async function main() {
  let attempts = 0;
  const applied = [];
  const resource = createRetriableResource(async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('temporary network failure');
    return ['loaded'];
  }, (value) => applied.push(value), 0);

  const results = await Promise.all([resource.load(), resource.load()]);
  assert.deepEqual(results, [true, true], 'concurrent callers should share a successful retry');
  assert.equal(attempts, 2, 'one initial request and one retry should run');
  assert.deepEqual(applied, [['loaded']], 'successful data should be applied only once');
  assert.equal(resource.hasLoaded(), true);

  await resource.load();
  assert.equal(attempts, 2, 'loaded data should not be fetched again unless forced');

  await resource.load(true);
  assert.equal(attempts, 3, 'manual refresh should force exactly one new request');

  let unavailable = true;
  let recoveryAttempts = 0;
  const recoveringResource = createRetriableResource(async () => {
    recoveryAttempts += 1;
    if (unavailable) throw new Error('offline');
    return 'recovered';
  }, () => {}, 0);

  assert.equal(await recoveringResource.load(), false);
  assert.equal(recoveringResource.hasLoaded(), false, 'failed resource must remain eligible for retry');
  assert.equal(recoveryAttempts, 2);

  unavailable = false;
  assert.equal(await recoveringResource.load(), true, 'opening the screen later can recover the resource');
  assert.equal(recoveryAttempts, 3);

  console.log('Mobile retriable resource tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
