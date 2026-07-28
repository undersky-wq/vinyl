const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const CAMELOT_TO_KEY = {
  '1m': 'Am',
  '2m': 'Em',
  '3m': 'Bm',
  '4m': 'F#m',
  '5m': 'C#m',
  '6m': 'G#m',
  '7m': 'D#m',
  '8m': 'A#m',
  '9m': 'Fm',
  '10m': 'Cm',
  '11m': 'Gm',
  '12m': 'Dm',
  '1d': 'C',
  '2d': 'G',
  '3d': 'D',
  '4d': 'A',
  '5d': 'E',
  '6d': 'B',
  '7d': 'F#',
  '8d': 'C#',
  '9d': 'G#',
  '10d': 'D#',
  '11d': 'A#',
  '12d': 'F',
};

const TRAKTOR_MUSICAL_KEY_TO_CAMELOT = {
  0: '1d',
  1: '8d',
  2: '3d',
  3: '10d',
  4: '5d',
  5: '12d',
  6: '7d',
  7: '2d',
  8: '9d',
  9: '4d',
  10: '11d',
  11: '6d',
  12: '10m',
  13: '5m',
  14: '12m',
  15: '7m',
  16: '2m',
  17: '9m',
  18: '4m',
  19: '11m',
  20: '6m',
  21: '1m',
  22: '8m',
  23: '3m',
};

function loadEnv() {
  const envPath = path.resolve(__dirname, '../../../.env');
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
      continue;
    }

    const [key, ...valueParts] = trimmed.split('=');
    if (!process.env[key]) {
      process.env[key] = valueParts.join('=').replace(/^["']|["']$/g, '');
    }
  }
}

function normalizeDatabaseUrlForHost() {
  if (
    process.env.DATABASE_URL &&
    process.env.DATABASE_URL.includes('@postgres:') &&
    !fs.existsSync('/.dockerenv')
  ) {
    process.env.DATABASE_URL = process.env.DATABASE_URL.replace('@postgres:', '@localhost:');
  }
}

function getArg(name, fallback = null) {
  const index = process.argv.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  return process.argv[index + 1] || fallback;
}

function decodeXml(value = '') {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function parseAttrs(tag = '') {
  const attrs = {};
  const attrRegex = /([A-Z0-9_:-]+)="([^"]*)"/gi;
  let match;
  while ((match = attrRegex.exec(tag))) {
    attrs[match[1]] = decodeXml(match[2]);
  }
  return attrs;
}

function normalizeText(value = '') {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\[[^\]]*]/g, ' ')
    .replace(/\([^)]*(audiovk|zippyshare|mp3|vk)[^)]*\)/gi, ' ')
    .replace(/\.(mp3|wav|flac|aiff|aif|m4a)$/gi, ' ')
    .replace(/['"`´’]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9а-яё]+/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function normalizeArtistForMatch(value = '') {
  return normalizeText(value).replace(/\s+\d+$/g, '').trim();
}

function getBaseName(file = '') {
  return file.replace(/\.(mp3|wav|flac|aiff|aif|m4a)$/i, '');
}

function isUnknownArtist(artist = '') {
  return !artist.trim() || normalizeText(artist) === 'unknown' || normalizeText(artist) === 'unknown artist';
}

function splitArtistTitle(value = '') {
  const parts = value
    .split(/\s+-\s+|\s+—\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  return {
    artist: parts[0],
    title: parts.slice(1).join(' - '),
  };
}

function deriveEntryIdentity({ title, artist, file }) {
  let nextTitle = title;
  let nextArtist = artist;
  const titleSplit = splitArtistTitle(title);
  const fileSplit = splitArtistTitle(getBaseName(file));

  if (titleSplit) {
    const titleSplitArtist = normalizeArtistForMatch(titleSplit.artist);
    const currentArtist = normalizeArtistForMatch(artist);

    if (isUnknownArtist(artist)) {
      nextArtist = titleSplit.artist;
      nextTitle = titleSplit.title;
    } else if (titleSplitArtist === currentArtist) {
      nextTitle = titleSplit.title;
    }
  }

  if (fileSplit) {
    const fileArtist = normalizeArtistForMatch(fileSplit.artist);
    const currentArtist = normalizeArtistForMatch(nextArtist);
    const currentTitle = normalizeText(nextTitle);

    if (isUnknownArtist(nextArtist) || (!currentTitle && fileSplit.title)) {
      nextArtist = fileSplit.artist;
      nextTitle = fileSplit.title;
    } else if (fileArtist === currentArtist && normalizeText(fileSplit.title).includes(currentTitle)) {
      nextTitle = fileSplit.title;
    }
  }

  return { title: nextTitle, artist: nextArtist };
}

function parseNml(filePath) {
  const xml = fs.readFileSync(filePath, 'utf8');
  const entries = [];
  const entryRegex = /<ENTRY\b([\s\S]*?)<\/ENTRY>/g;
  let match;

  while ((match = entryRegex.exec(xml))) {
    const entryXml = match[0];
    const entryOpen = entryXml.match(/<ENTRY\b([^>]*)>/i)?.[0] || '';
    const infoOpen = entryXml.match(/<INFO\b([^>]*)>/i)?.[0] || '';
    const tempoOpen = entryXml.match(/<TEMPO\b([^>]*)>/i)?.[0] || '';
    const locationOpen = entryXml.match(/<LOCATION\b([^>]*)>/i)?.[0] || '';
    const musicalKeyOpen = entryXml.match(/<MUSICAL_KEY\b([^>]*)>/i)?.[0] || '';

    const entryAttrs = parseAttrs(entryOpen);
    const infoAttrs = parseAttrs(infoOpen);
    const tempoAttrs = parseAttrs(tempoOpen);
    const locationAttrs = parseAttrs(locationOpen);
    const musicalKeyAttrs = parseAttrs(musicalKeyOpen);

    const bpm = Number.parseFloat(tempoAttrs.BPM || '');
    const musicalKeyValue = Number.parseInt(musicalKeyAttrs.VALUE || '', 10);
    const camelotKey =
      (infoAttrs.KEY || '').trim() ||
      (Number.isFinite(musicalKeyValue) ? TRAKTOR_MUSICAL_KEY_TO_CAMELOT[musicalKeyValue] || '' : '');
    const title = (entryAttrs.TITLE || '').trim();
    const artist = (entryAttrs.ARTIST || '').trim();
    const file = (locationAttrs.FILE || '').trim();

    if (!title && !artist && !file) {
      continue;
    }

    const identity = deriveEntryIdentity({ title, artist, file });

    entries.push({
      title: identity.title,
      artist: identity.artist,
      originalTitle: title,
      originalArtist: artist,
      file,
      bpm: Number.isFinite(bpm) ? bpm : null,
      camelotKey: camelotKey || null,
      key: camelotKey ? CAMELOT_TO_KEY[camelotKey.toLowerCase()] || camelotKey : null,
      playtime: Number.parseFloat(infoAttrs.PLAYTIME_FLOAT || infoAttrs.PLAYTIME || '') || null,
      normalizedTitle: normalizeText(identity.title),
      normalizedArtist: normalizeText(identity.artist),
      normalizedArtistMatch: normalizeArtistForMatch(identity.artist),
      normalizedFile: normalizeText(getBaseName(file)),
    });
  }

  return entries;
}

function buildTrackSearch(track) {
  const artists = track.artists?.length ? track.artists.join(', ') : track.release.artist;
  const audioNames = track.audioFiles.flatMap((audioFile) => [
    audioFile.originalName || '',
    audioFile.storageKey || '',
    audioFile.normalizedStorageKey || '',
  ]);

  return {
    track,
    artist: artists,
    title: track.title,
    normalizedTitle: normalizeText(track.title),
    normalizedArtist: normalizeText(artists),
    normalizedArtistMatch: normalizeArtistForMatch(artists),
    normalizedReleaseArtist: normalizeText(track.release.artist),
    normalizedReleaseArtistMatch: normalizeArtistForMatch(track.release.artist),
    normalizedAudioNames: audioNames.map(normalizeText).filter(Boolean),
  };
}

function includesEither(a, b) {
  return Boolean(a && b && (a.includes(b) || b.includes(a)));
}

function hasStrongFileMatch(entry, candidate) {
  if (!entry.normalizedFile) {
    return false;
  }

  return candidate.normalizedAudioNames.some((name) => {
    if (!name) {
      return false;
    }

    return name.includes(entry.normalizedFile) || entry.normalizedFile.includes(name);
  });
}

function scoreMatch(entry, candidate) {
  let score = 0;
  const titleExact = entry.normalizedTitle && entry.normalizedTitle === candidate.normalizedTitle;
  const artistExact =
    entry.normalizedArtistMatch &&
    (entry.normalizedArtistMatch === candidate.normalizedArtistMatch ||
      entry.normalizedArtistMatch === candidate.normalizedReleaseArtistMatch);
  const artistClose =
    includesEither(entry.normalizedArtistMatch, candidate.normalizedArtistMatch) ||
    includesEither(entry.normalizedArtistMatch, candidate.normalizedReleaseArtistMatch);
  const titleClose = includesEither(entry.normalizedTitle, candidate.normalizedTitle);
  const strongFileMatch = hasStrongFileMatch(entry, candidate);
  const fileHits = strongFileMatch || candidate.normalizedAudioNames.some((name) => {
    const hasTitle = includesEither(name, entry.normalizedTitle) || includesEither(name, candidate.normalizedTitle);
    const hasArtist = includesEither(name, entry.normalizedArtist) || includesEither(name, candidate.normalizedArtist);
    const traktorFileMatch = includesEither(entry.normalizedFile, name);
    return traktorFileMatch || (hasTitle && hasArtist);
  });

  if (strongFileMatch) {
    score = 120;
  } else if (titleExact && artistExact) {
    score = 100;
  } else if (fileHits && titleExact) {
    score = 96;
  } else if (fileHits) {
    score = 90;
  } else if (titleExact && artistClose) {
    score = 88;
  } else if (titleClose && artistClose) {
    score = 82;
  } else if (titleExact) {
    score = 70;
  }

  return score;
}

function findBestMatch(entry, candidates) {
  const scored = candidates
    .map((candidate) => ({ candidate, score: scoreMatch(entry, candidate) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) {
    return { match: null, score: 0, ambiguous: false };
  }

  const [best, second] = scored;
  const strongFileMatches = scored.filter((item) => item.score >= 120);
  if (strongFileMatches.length === 1) {
    return { match: strongFileMatches[0].candidate, score: strongFileMatches[0].score, ambiguous: false };
  }

  const ambiguous = Boolean(second && best.score === second.score);
  return { match: best.candidate, score: best.score, ambiguous };
}

function formatEntry(entry) {
  return `${entry.artist || 'Unknown'} - ${entry.title || entry.file}`;
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNullable(value) {
  return value === null || value === undefined || value === '' ? '-' : value;
}

function getUpdateStatus(update) {
  const bpmBefore = update.site.bpm;
  const bpmAfter = update.data.bpm;
  const keyBefore = update.site.key;
  const keyAfter = update.data.key;
  const parts = [];

  if (bpmAfter && !bpmBefore) {
    parts.push('BPM будет заполнен');
  } else if (bpmAfter && bpmBefore !== bpmAfter) {
    parts.push('BPM отличается');
  }

  if (keyAfter && !keyBefore) {
    parts.push('KEY будет заполнен');
  } else if (keyAfter && keyBefore !== keyAfter) {
    parts.push('KEY отличается');
  }

  return parts.length ? parts.join(', ') : 'Без изменений';
}

function buildReport({ entries, tracks, updates, ambiguous, unmatched, reportPath, keyMode }) {
  const changedUpdates = updates.filter((update) => getUpdateStatus(update) !== 'Без изменений');
  const unchangedUpdates = updates.filter((update) => getUpdateStatus(update) === 'Без изменений');
  const rows = changedUpdates
    .concat(unchangedUpdates)
    .map((update, index) => {
      const status = getUpdateStatus(update);
      const statusClass = status === 'Без изменений' ? 'ok' : status.includes('отличается') ? 'warn' : 'fill';

      return `
        <tr>
          <td>${index + 1}</td>
          <td><strong>${escapeHtml(update.traktor.artist || '-')}</strong><br>${escapeHtml(update.traktor.title || '-')}<br><small>${escapeHtml(update.traktor.file || '')}</small></td>
          <td>${escapeHtml(update.traktor.bpm ? update.traktor.bpm.toFixed(2) : '-')}</td>
          <td>${escapeHtml(formatNullable(update.traktor.camelotKey))}</td>
          <td>${escapeHtml(formatNullable(update.traktor.key))}</td>
          <td><strong>${escapeHtml(update.site.artist || '-')}</strong><br>${escapeHtml(update.site.title || '-')}<br><small>${escapeHtml(update.site.release || '')}</small></td>
          <td>${escapeHtml(formatNullable(update.site.bpm))}</td>
          <td>${escapeHtml(formatNullable(update.site.key))}</td>
          <td>${escapeHtml(formatNullable(update.data.bpm))}</td>
          <td>${escapeHtml(formatNullable(update.data.key))}</td>
          <td>${update.score}</td>
          <td><span class="badge ${statusClass}">${escapeHtml(status)}</span></td>
        </tr>
      `;
    })
    .join('\n');

  const ambiguousRows = ambiguous
    .map((entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.artist || 'Unknown')}</td>
        <td>${escapeHtml(entry.title || '-')}</td>
        <td>${escapeHtml(entry.file || '-')}</td>
      </tr>
    `)
    .join('\n');

  const unmatchedRows = unmatched
    .map((entry, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${escapeHtml(entry.artist || 'Unknown')}</td>
        <td>${escapeHtml(entry.title || '-')}</td>
        <td>${escapeHtml(entry.file || '-')}</td>
      </tr>
    `)
    .join('\n');

  const html = `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Traktor BPM / KEY import report</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #101010;
      --panel: #181818;
      --muted: #9f9aa8;
      --text: #f4f0ff;
      --line: rgba(255,255,255,.11);
      --accent: #b578ff;
      --warn: #f0b35a;
      --fill: #62d6a3;
    }
    body {
      margin: 0;
      background: radial-gradient(circle at top left, rgba(181,120,255,.18), transparent 34rem), var(--bg);
      color: var(--text);
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      line-height: 1.45;
    }
    main { padding: 28px; }
    h1 { margin: 0 0 10px; letter-spacing: -.04em; }
    h2 { margin-top: 34px; }
    .summary {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 12px;
      margin: 22px 0;
    }
    .card {
      padding: 16px;
      border: 1px solid var(--line);
      border-radius: 18px;
      background: rgba(24,24,24,.82);
      box-shadow: 0 18px 42px rgba(0,0,0,.22);
    }
    .number { font-size: 28px; font-weight: 900; color: var(--accent); }
    .label { color: var(--muted); font-weight: 700; }
    table {
      width: 100%;
      border-collapse: collapse;
      overflow: hidden;
      border-radius: 16px;
      background: rgba(24,24,24,.9);
    }
    th, td {
      padding: 10px 12px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      text-align: left;
      font-size: 13px;
    }
    th {
      position: sticky;
      top: 0;
      z-index: 1;
      background: #202020;
      color: var(--muted);
      text-transform: uppercase;
      letter-spacing: .05em;
      font-size: 11px;
    }
    small { color: var(--muted); }
    .badge {
      display: inline-flex;
      padding: 5px 9px;
      border-radius: 999px;
      font-weight: 800;
      white-space: nowrap;
      background: rgba(181,120,255,.15);
      color: var(--accent);
    }
    .badge.warn { color: var(--warn); background: rgba(240,179,90,.15); }
    .badge.fill { color: var(--fill); background: rgba(98,214,163,.15); }
    .badge.ok { color: var(--muted); background: rgba(255,255,255,.08); }
    .note { color: var(--muted); max-width: 920px; }
  </style>
</head>
<body>
  <main>
    <h1>Traktor BPM / KEY import report</h1>
    <p class="note">Это dry-run отчёт. Он ничего не записывает в базу. Надёжные совпадения можно применить командой с <code>--apply</code>. Спорные строки не обновляются автоматически.</p>
    <div class="summary">
      <div class="card"><div class="number">${entries.length}</div><div class="label">треков в Traktor NML</div></div>
      <div class="card"><div class="number">${tracks.length}</div><div class="label">треков на сайте</div></div>
      <div class="card"><div class="number">${updates.length}</div><div class="label">надёжных совпадений</div></div>
      <div class="card"><div class="number">${changedUpdates.length}</div><div class="label">будут изменены / заполнены</div></div>
      <div class="card"><div class="number">${ambiguous.length}</div><div class="label">спорных совпадений</div></div>
      <div class="card"><div class="number">${unmatched.length}</div><div class="label">не найдено</div></div>
    </div>
    <p class="note">Key mode: <strong>${escapeHtml(keyMode)}</strong>. Camelot из Traktor переводится в музыкальную тональность для цветов сайта.</p>
    <h2>Надёжные совпадения и расхождения</h2>
    <table>
      <thead>
        <tr>
          <th>#</th>
          <th>Traktor</th>
          <th>BPM</th>
          <th>Camelot</th>
          <th>Key</th>
          <th>Сайт</th>
          <th>BPM сейчас</th>
          <th>KEY сейчас</th>
          <th>BPM будет</th>
          <th>KEY будет</th>
          <th>Score</th>
          <th>Статус</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
    <h2>Спорные совпадения, не будут обновлены</h2>
    <p class="note">Обычно это дубли, Unknown Artist, разные файлы с похожими названиями или несколько Traktor-записей на один трек сайта.</p>
    <table>
      <thead><tr><th>#</th><th>Artist</th><th>Title</th><th>File</th></tr></thead>
      <tbody>${ambiguousRows || '<tr><td colspan="4">Нет спорных совпадений</td></tr>'}</tbody>
    </table>
    <h2>Не найдено</h2>
    <table>
      <thead><tr><th>#</th><th>Artist</th><th>Title</th><th>File</th></tr></thead>
      <tbody>${unmatchedRows || '<tr><td colspan="4">Все треки нашли кандидатов</td></tr>'}</tbody>
    </table>
  </main>
</body>
</html>`;

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, html, 'utf8');
}

async function main() {
  loadEnv();
  normalizeDatabaseUrlForHost();

  const nmlPath = getArg('--file') || process.argv[2];
  const shouldApply = process.argv.includes('--apply');
  const keyMode = getArg('--key-mode', 'musical');
  const reportPath = getArg('--report');

  if (!nmlPath) {
    throw new Error('Usage: node scripts/import-traktor-nml.js --file "C:\\path\\collection.nml" [--apply] [--key-mode musical|camelot]');
  }

  const resolvedNmlPath = path.resolve(nmlPath);
  const entries = parseNml(resolvedNmlPath);
  const prisma = new PrismaClient();

  try {
    const tracks = await prisma.track.findMany({
      include: {
        release: true,
        audioFiles: true,
      },
    });
    const candidates = tracks.map(buildTrackSearch);
    const rawUpdates = [];
    const unmatched = [];
    const ambiguous = [];

    for (const entry of entries) {
      if (!entry.bpm && !entry.key) {
        continue;
      }

      const result = findBestMatch(entry, candidates);
      if (!result.match || result.score < 82) {
        unmatched.push(entry);
        continue;
      }

      if (result.ambiguous) {
        ambiguous.push(entry);
        continue;
      }

      const nextBpm = entry.bpm ? Math.round(entry.bpm) : null;
      const nextKey = keyMode === 'camelot' ? entry.camelotKey : entry.key;
      const track = result.match.track;

      rawUpdates.push({
        trackId: track.id,
        score: result.score,
        traktor: {
          title: entry.title,
          artist: entry.artist,
          file: entry.file,
          bpm: entry.bpm,
          camelotKey: entry.camelotKey,
          key: entry.key,
        },
        site: {
          title: track.title,
          artist: result.match.artist,
          release: track.release.title,
          bpm: track.bpm,
          key: track.key,
        },
        data: {
          ...(nextBpm ? { bpm: nextBpm } : {}),
          ...(nextKey ? { key: nextKey } : {}),
        },
      });
    }

    const updates = [];
    const updatesByTrackId = new Map();
    for (const update of rawUpdates) {
      const existing = updatesByTrackId.get(update.trackId);
      if (!existing) {
        updatesByTrackId.set(update.trackId, update);
        continue;
      }

      const existingData = JSON.stringify(existing.data);
      const nextData = JSON.stringify(update.data);
      if (existingData !== nextData) {
        ambiguous.push({
          title: update.site.title,
          artist: update.site.artist,
          file: `${existing.traktor.file} / ${update.traktor.file}`,
        });
        updatesByTrackId.set(update.trackId, null);
      }
    }

    for (const update of updatesByTrackId.values()) {
      if (update) {
        updates.push(update);
      }
    }

    if (shouldApply) {
      for (const update of updates) {
        await prisma.track.update({
          where: { id: update.trackId },
          data: update.data,
        });
      }
    }

    if (reportPath) {
      buildReport({
        entries,
        tracks,
        updates,
        ambiguous,
        unmatched,
        reportPath: path.resolve(reportPath),
        keyMode,
      });
    }

    console.log(JSON.stringify({
      mode: shouldApply ? 'apply' : 'dry-run',
      keyMode,
      nmlEntries: entries.length,
      siteTracks: tracks.length,
      matched: updates.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
      sampleUpdates: updates.slice(0, 20),
      sampleUnmatched: unmatched.slice(0, 20).map(formatEntry),
      sampleAmbiguous: ambiguous.slice(0, 20).map(formatEntry),
      reportPath: reportPath ? path.resolve(reportPath) : undefined,
    }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
