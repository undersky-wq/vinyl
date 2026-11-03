const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function load(file) {
  const out = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    { exports: out, require: () => ({}), Buffer });
  return out;
}
const { waveformFromPcm, waveformPointCount } = load(path.join(__dirname, '../src/modules/audio/waveform-data.ts'));
const frontend = load(path.join(__dirname, '../../frontend/src/lib/waveform.ts'));
const mobile = load(path.join(__dirname, '../../mobile/src/lib/waveform-resample.ts'));
assert.equal(waveformPointCount(180), 1024);
assert.equal(waveformPointCount(600), 2400);
assert.equal(waveformPointCount(3600), 8192);
assert.equal(waveformPointCount(Infinity), 1024);
assert.equal(waveformFromPcm(Buffer.alloc(3)).length, 0);
assert(waveformFromPcm(Buffer.alloc(32000)).every(value => value === .02), 'silence must not normalize into full-height bars');
const pcm = Buffer.alloc(8000 * 4 * 4);
for (let sample = 0; sample < 32000; sample++) {
  const amplitude = sample < 8000 ? .2 : sample < 16000 ? .5 : sample < 24000 ? .8 : 0;
  pcm.writeFloatLE(amplitude * Math.sin(sample * .3), sample * 4);
}
const wave = waveformFromPcm(pcm);
assert.equal(wave.length, 1024);
const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length;
assert(mean(wave.slice(0,256)) < mean(wave.slice(256,512)));
assert(mean(wave.slice(256,512)) < mean(wave.slice(512,768)));
assert(wave.slice(768).every(value => value === .02));
assert(wave.every(value => Number.isFinite(value) && value >= .02 && value <= 1));
const tail = Buffer.alloc(11 * 4);
tail.writeFloatLE(1, tail.length - 4);
assert(waveformFromPcm(tail, 3)[2] > .02, 'the final samples must not be dropped');
const sparse = Array.from({ length: 100 }, (_, i) => i === 99 ? 1 : 0);
const reduced = frontend.resampleWaveform(sparse, 10);
assert.equal(reduced[9], .316, 'a single transient must not fill the whole display bucket');
assert(reduced.slice(0,9).every(value => value === .02));
const cases = [wave, sparse, [.2,.8], [NaN, Infinity, -1, .5], [], Array(180).fill(.6)];
for (const source of cases) for (const count of [1, 7, 48, 180, 400]) {
  const a = frontend.resampleWaveform(source, count);
  const b = mobile.resampleWaveform(source, count);
  assert.equal(JSON.stringify(a), JSON.stringify(b), 'web and APK must use identical aggregation');
  assert(a.every(value => Number.isFinite(value) && value >= .02 && value <= 1));
}
assert.equal(JSON.stringify(frontend.resampleWaveform([.2,.8],4)), JSON.stringify([.2,.2,.8,.8]));
require('ts-node').register({ transpileOnly: true });
const { AudioService } = require('../src/modules/audio/audio.service.ts');
(async () => {
  const service = Object.create(AudioService.prototype);
  const wav = Buffer.alloc(44 + 32000 * 2);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  for (let sample = 0; sample < 32000; sample++) wav.writeInt16LE(Math.round(pcm.readFloatLE(sample * 4) * 32767), 44 + sample * 2);
  const decoded = await service.generateWaveformData(wav, 'audio/wav');
  assert.equal(decoded.length, 1024, 'real FFmpeg decode uses the adaptive sample budget');
  assert(mean(decoded.slice(0,256)) < mean(decoded.slice(512,768)));
  assert(decoded.slice(800).every(value => value === .02));
  assert.equal((await service.generateWaveformData(Buffer.from('not audio'), 'audio/mpeg')).length, 0, 'failed decoding must not invent waveform amplitudes from file bytes');
  console.log('PASS: real FFmpeg decode, adaptive detail, silence, ordered dynamics, complete tail, no transient flattening, finite values and web/APK parity');
})().catch(error => { console.error(error); process.exitCode = 1; });
