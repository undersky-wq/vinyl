export type ArtistFact = { text: string; source: string; language: 'ru' | 'en' };

export function normalizeFactArtist(value: string): string | null {
  if (/[\u0000-\u001f\u007f|<>]/.test(value)) return null;
  const artist = value.normalize('NFKC').replace(/\s+/g, ' ').trim();
  if (!artist || artist.length > 100 || /[|\r\n<>]/.test(artist)) return null;
  if (/^(various(?: artists)?|v\.?a\.?|unknown(?: artist)?|неизвестный(?: исполнитель)?|разные исполнители)$/i.test(artist)) return null;
  // Collaborations are not reliably identifiable as a single Wikipedia subject.
  if (/\s(?:feat\.?|ft\.?|vs\.?)\s|\s[&/]\s/i.test(artist)) return null;
  return artist;
}

type WikiPage = {
  title?: string; missing?: boolean; extract?: string;
  pageprops?: { disambiguation?: string };
  categories?: { title: string }[];
};

export function factFromWikiPage(page: WikiPage, language: 'ru' | 'en'): ArtistFact | null {
  if (page.missing !== undefined || !page.title || page.pageprops?.disambiguation !== undefined) return null;
  // A name match alone is not enough: reject non-musicians and ambiguous pages.
  const musicCategory = /disc jockey|\bdjs\b|musician|record producer|singer|musical group|music duo|music group|bands\b|дидже|ди-дже|музыкант|музыкальн.*(?:групп|коллектив)|певц|певиц|музыкальн.*продюсер/i;
  if (!page.categories?.some(category => musicCategory.test(category.title))) return null;
  // Birth-date/transliteration asides often contain abbreviations such as "род."
  // that would split the opening sentence in the middle. Remove these asides.
  let extract = page.extract || '';
  for (let depth = 0; depth < 3; depth++) extract = extract.replace(/\([^()]*\)/g, '');
  extract = extract.replace(/\s+/g, ' ').trim();
  const sentences = extract.match(/[^.!?]+[.!?](?=\s|$)/g) || [];
  const eligible = sentences.map(sentence => sentence.trim()).filter(sentence => sentence.length >= 35 && sentence.length <= 320);
  const interesting = /found(?:ed|er)|pioneer|known as|pseudonym|Detroit|основа|пионер|псевдоним|известен|Детройт/i;
  const text = eligible.find(sentence => interesting.test(sentence)) || eligible[0];
  if (!text) return null;
  return { text, language, source: `https://${language}.wikipedia.org/wiki/${encodeURIComponent(page.title.replaceAll(' ', '_'))}` };
}

const cache = new Map<string, { expires: number; fact: ArtistFact | null }>();
const pending = new Map<string, Promise<ArtistFact | null>>();
const MAX_CACHE = 300;
const MAX_PENDING = 4;
let requestsInWindow = 0;
let windowStarted = Date.now();

async function lookup(artist: string): Promise<ArtistFact | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6500);
  try {
    for (const language of ['ru', 'en'] as const) {
      const variants = language === 'ru'
        ? [artist, `${artist} (музыкант)`, `${artist} (группа)`, `${artist} (диджей)`]
        : [artist, `${artist} (musician)`, `${artist} (DJ)`, `${artist} (band)`];
      const params = new URLSearchParams({
        action: 'query', format: 'json', formatversion: '2', redirects: '1',
        prop: 'extracts|categories|pageprops', titles: variants.join('|'),
        exintro: '1', explaintext: '1', exchars: '1000', exlimit: '4', cllimit: 'max',
      });
      const response = await fetch(`https://${language}.wikipedia.org/w/api.php?${params}`, {
        signal: controller.signal, cache: 'no-store',
        headers: { 'User-Agent': 'MityaDimaArtistFacts/1.0 (https://mityadima.ru/)', Accept: 'application/json' },
      });
      if (!response.ok) continue;
      const data = await response.json() as { query?: { pages?: WikiPage[] } };
      const facts = (data.query?.pages || []).map(page => factFromWikiPage(page, language)).filter((fact): fact is ArtistFact => fact !== null);
      // Multiple musician matches can refer to unrelated namesakes. Stay silent.
      const unique = [...new Map(facts.map(fact => [fact.source, fact])).values()];
      if (unique.length > 1) return null;
      if (unique.length === 1) return unique[0];
    }
  } catch {
    // Metadata failures are intentionally silent and never affect the player.
  } finally { clearTimeout(timeout); }
  return null;
}

export async function getArtistFact(value: string): Promise<ArtistFact | null> {
  const artist = normalizeFactArtist(value);
  if (!artist) return null;
  const key = artist.toLocaleLowerCase();
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.fact;
  const existing = pending.get(key);
  if (existing) return existing;
  if (Date.now() - windowStarted > 60000) { windowStarted = Date.now(); requestsInWindow = 0; }
  if (pending.size >= MAX_PENDING || requestsInWindow >= 30) return null;
  requestsInWindow++;
  const promise = lookup(artist).then(fact => {
    if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value!);
    cache.set(key, { fact, expires: Date.now() + (fact ? 86400000 : 600000) });
    return fact;
  }).finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
