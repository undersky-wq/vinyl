const ru: Record<string, string> = { а:'a',б:'b',в:'v',г:'g',д:'d',е:'e',ё:'yo',ж:'zh',з:'z',и:'i',й:'y',к:'k',л:'l',м:'m',н:'n',о:'o',п:'p',р:'r',с:'s',т:'t',у:'u',ф:'f',х:'kh',ц:'ts',ч:'ch',ш:'sh',щ:'sch',ъ:'',ы:'y',ь:'',э:'e',ю:'yu',я:'ya' };

export function musicSlug(artist: string, title: string) {
  return [...`${artist}-${title}`.toLowerCase()].map(letter => ru[letter] ?? letter).join('')
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 140).replace(/-$/, '') || 'music';
}

export function musicShareLinks(rows: { id: string; artist: string; title: string; isOriginal?: boolean }[]) {
  const used = new Set<string>();
  return [...rows].sort((a,b) => a.id.localeCompare(b.id)).map(row => {
    const section = row.isOriginal ? 'tracks' : 'mixes';
    const base = musicSlug(row.artist, row.title);
    let slug = base;
    let suffix = 2;
    while (used.has(`${section}/${slug}`)) slug = `${base}-${suffix++}`;
    used.add(`${section}/${slug}`);
    return { id: row.id, path: `/${section}/${slug}`, slug, original: Boolean(row.isOriginal) };
  });
}
