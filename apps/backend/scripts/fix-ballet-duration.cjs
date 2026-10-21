const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { PrismaClient } = require('@prisma/client');
const { ConfigService } = require('@nestjs/config');
const { StorageService } = require('../dist/modules/storage/storage.service');
const { AudioService } = require('../dist/modules/audio/audio.service');
const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const releaseId = 'cmobxff1u01hmp5c40dtd4m3f';

(async () => {
  const release = await prisma.release.findUnique({ where: { id: releaseId }, include: { tracks: { include: { audioFiles: true }, orderBy: { position: 'asc' } } } });
  assert(release && release.artist === 'Ballet Mechanique');
  assert.equal(release.tracks.length, 4);
  const storage = new StorageService(new ConfigService());
  const detector = Object.create(AudioService.prototype);
  const plan = [];
  for (const track of release.tracks) {
    assert.equal(track.audioFiles.length, 1);
    const file = track.audioFiles[0];
    const url = await storage.getTemporaryObjectUrl(process.env.SELECTEL_S3_BUCKET_AUDIO || 'audio', file.storageKey);
    const response = await fetch(url);
    assert(response.ok, 'Original audio must be readable');
    const buffer = Buffer.from(await response.arrayBuffer());
    const detected = await detector.detectDurationFromBuffer(buffer, file.mimeType, file.sizeBytes);
    assert(detected && detected.durationSec > 60, 'Unexpected duration; no data will be changed');
    const probe = spawnSync('ffprobe', ['-v','error','-show_entries','format=duration','-of','json','-i','pipe:0'], { input: buffer, encoding: 'utf8', maxBuffer: 1024 * 1024 });
    assert.equal(probe.status, 0);
    const verified = Number(JSON.parse(probe.stdout).format.duration);
    assert(Math.abs(verified - detected.durationSec) < 1, 'Independent duration verification must agree');
    plan.push({ id: track.id, title: track.title, audioFileId: file.id, old: { durationSec: track.durationSec, durationRaw: track.durationRaw }, next: detected });
  }
  if (apply) await prisma.$transaction(async tx => {
    for (const row of plan) {
      const result = await tx.track.updateMany({
        where: { id: row.id, releaseId, ...row.old, audioFiles: { some: { id: row.audioFileId } } },
        data: row.next,
      });
      assert.equal(result.count, 1, 'Track changed during inspection; rolling back the complete correction');
    }
  });
  console.log(JSON.stringify({ releaseId, applied: apply, inspectedAt: new Date().toISOString(), tracks: plan }, null, 2));
})().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());
