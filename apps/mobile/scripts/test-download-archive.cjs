const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/lib/download-archive.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText, { exports: exportsObject });
const tracks = ['a', 'b'].map(id => ({ id, releaseId: 'same-release', artist: 'Artist', title: id, coverUrl: 'file:///cover.jpg', audioUrl: 'https://remote/audio', localAudioUrl: `file:///${id}.mp3`, durationSec: 120 }));
const items = exportsObject.downloadArchiveItems(tracks);
assert.equal(items.length, 2);
assert.equal(items[0].tracks[0].audioFiles[0].storageUrl, 'file:///a.mp3');
assert.equal(items[0].coverStorageUrl, 'file:///cover.jpg');
assert.equal(exportsObject.downloadArchiveItems(tracks, 'Artist b').length, 1);
const home = fs.readFileSync(path.join(__dirname, '../src/screens/HomeScreen.tsx'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '../App.tsx'), 'utf8');
assert(home.includes('downloads:downloadedTracks.length'));
assert(home.includes('count={sectionCounts[key]}'));
assert(home.includes("section === 'favorites' || downloadsMode"));
assert(app.includes("section={activeTab === 'downloads' ? 'downloads'"));
assert(!app.includes('<DownloadsScreen'));
console.log('PASS: Downloads shares Favorites archive, counts local tracks, preserves local audio and filters entries');
