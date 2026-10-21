const assert = require('node:assert/strict');
require('ts-node').register({ transpileOnly: true });
const { AudioService } = require('../src/modules/audio/audio.service.ts');
const service = Object.create(AudioService.prototype);

function mp3Frame() {
  const frame = Buffer.alloc(417);
  Buffer.from([0xff, 0xfb, 0x90, 0]).copy(frame);
  return frame;
}
(async () => {
  const frames = Buffer.concat(Array.from({ length: 100 }, mp3Frame));
  assert(Math.abs(service.detectMp3DurationFromFrames(frames) - 100 * 1152 / 44100) < .001);
  const mp4 = Buffer.concat([Buffer.from('00000018667479706461736800000000', 'hex'), frames]);
  assert.equal(service.detectMp3DurationFromFrames(mp4), null, 'MP4 payload must never be scanned as MP3');
  const randomSync = Buffer.concat(Array.from({ length: 50 }, () => Buffer.concat([mp3Frame(), Buffer.alloc(20)])));
  assert.equal(service.detectMp3DurationFromFrames(randomSync), null, 'separated false sync headers are not a real frame stream');
  const wav = Buffer.alloc(44 + 8000 * 2 * 3);
  wav.write('RIFF', 0); wav.writeUInt32LE(wav.length - 8, 4); wav.write('WAVEfmt ', 8);
  wav.writeUInt32LE(16, 16); wav.writeUInt16LE(1, 20); wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(8000, 24); wav.writeUInt32LE(16000, 28); wav.writeUInt16LE(2, 32); wav.writeUInt16LE(16, 34);
  wav.write('data', 36); wav.writeUInt32LE(wav.length - 44, 40);
  assert.equal(service.detectMp3DurationFromFrames(wav), null);
  const duration = await service.detectDurationFromBuffer(wav, 'audio/mpeg', 100);
  assert.equal(duration.durationSec, 3, 'actual WAV content must override an incorrect MP3 MIME and size');
  assert.equal(duration.durationRaw, '0:03');
  assert.equal(await service.detectDurationFromBuffer(Buffer.alloc(500), 'audio/mpeg'), null);
  console.log('PASS: content-based duration, incorrect MIME/size, MP4 guard, valid MP3 frames and false-sync rejection');
})().catch(error => { console.error(error); process.exit(1); });
