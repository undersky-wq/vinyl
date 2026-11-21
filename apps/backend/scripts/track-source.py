import json
import re
import sys
from difflib import SequenceMatcher
from urllib.parse import urlsplit

from curl_cffi import requests
from yt_dlp import YoutubeDL
from yt_dlp.networking.impersonate import ImpersonateTarget
from yt_dlp.utils import DownloadError


def bandcamp_post(path, data):
    response = requests.post('https://bandcamp.com/api/' + path, json=data, impersonate='chrome', timeout=12)
    response.raise_for_status()
    return response.json()


def normalize(value):
    value = re.sub(r'\b(?:official\s+(?:music\s+)?(?:video|audio)|official upload|lyrics|hd|hq)\b',
                   ' ', value.casefold())
    return ' '.join(re.findall(r'[^\W_]+', value))


def score(expected, candidate):
    expected, candidate = normalize(expected), normalize(candidate)
    if not expected or not candidate:
        return 0
    return int(100 * SequenceMatcher(None, expected, candidate, autojunk=False).ratio())


def youtube_score(artist, title, label, channel):
    parts = re.split(r'\s+[-–—]\s+', label, maxsplit=1)
    found_artist, found_title = parts if len(parts) == 2 else (channel, label)
    title_score = score(title, found_title)
    subtitle = re.fullmatch(r'(.+?)\s*[\[(]([^\]()]+)[\])]\s*(?:\(official (?:music )?(?:video|audio)\))?',
                            found_title, re.IGNORECASE)
    if subtitle and score(title, subtitle[1]) == 100 and not re.search(
        r'\b(remix|edit|live|cover|remaster\w*|version|mix|acoustic|instrumental|demo|remake)\b',
        subtitle[2], re.IGNORECASE,
    ):
        title_score = max(title_score, 90)
    return min(score(artist, found_artist), title_score) if artist else title_score


def search(source, artist, title, duration):
    query = f'{artist} {title}'.strip()
    rows = []
    if source == 'youtube':
        with YoutubeDL({'quiet': True, 'extract_flat': True, 'socket_timeout': 10,
                        'extractor_retries': 0, 'retries': 0}) as ydl:
            result = ydl.extract_info(f'ytsearch10:{query}', download=False)
        for entry in result.get('entries') or []:
            if not entry or not re.fullmatch(r'[\w-]{11}', entry.get('id', ''), re.ASCII):
                continue
            label = entry.get('title') or ''
            channel = (entry.get('channel') or entry.get('uploader') or '').removesuffix(' - Topic')
            rows.append({'title': label, 'url': 'https://www.youtube.com/watch?v=' + entry['id'],
                         'duration': entry.get('duration'), 'score': youtube_score(artist, title, label, channel),
                         'media': {'id': entry['id']}})
    else:
        result = bandcamp_post('bcsearch_public_api/1/autocomplete_elastic', {
            'search_text': query, 'search_filter': 't', 'full_page': True, 'fan_id': None})
        entries = result['auto']['results']
        for entry in entries[:20]:
            url = entry.get('item_url_path') or ''
            parsed = urlsplit(url)
            if (entry.get('type') != 't' or not isinstance(entry.get('id'), int)
                    or not isinstance(entry.get('band_id'), int) or parsed.scheme != 'https'
                    or not (parsed.hostname or '').endswith('.bandcamp.com')
                    or not parsed.path.startswith('/track/')):
                continue
            label = f"{entry.get('band_name', '')} — {entry.get('name', '')}"
            similarity = score(title, entry.get('name') or '')
            if artist:
                similarity = min(similarity, score(artist, entry.get('band_name') or ''))
            rows.append({'title': label, 'url': url, 'duration': None, 'score': similarity,
                         'media': {'id': entry['id'], 'bandId': entry['band_id']}})
    candidates = [
        row for row in rows if row['score'] >= 75 and (
            not duration or not row['duration']
            or abs(row['duration'] - duration) <= max(20, duration * 0.15))
    ]
    return sorted(candidates, key=lambda row: row['score'], reverse=True)[:5]


def bandcamp_audio(media):
    details = bandcamp_post('mobile/25/tralbum_details', {
        'band_id': media['bandId'], 'tralbum_id': media['id'], 'tralbum_type': 't'})
    track = next((row for row in details['tracks'] if row.get('track_id') == media['id']), {})
    stream = (track.get('streaming_url') or {}).get('mp3-128') or ''
    parsed = urlsplit(stream)
    if parsed.scheme == 'https' and parsed.hostname == 'bandcamp.com' and parsed.path == '/stream_redirect':
        response = requests.post(stream, timeout=12, impersonate='chrome', allow_redirects=False)
        response.raise_for_status()
        stream = response.headers.get('Location', '') if response.status_code in (301, 302, 303, 307, 308) else ''
    parsed = urlsplit(stream)
    if parsed.scheme != 'https' or not (parsed.hostname or '').endswith('.bcbits.com'):
        raise ValueError('Missing Bandcamp audio')
    return stream


def download(source, media, output):
    options = {
        'quiet': True, 'noprogress': True, 'noplaylist': True, 'socket_timeout': 12, 'retries': 1,
        'extractor_retries': 0, 'max_filesize': 50 * 1024 * 1024, 'outtmpl': output + '.%(ext)s',
        'format': 'bestaudio/best', 'cachedir': False,
        'js_runtimes': {'node': {}},
        'postprocessors': [{'key': 'FFmpegExtractAudio', 'preferredcodec': 'mp3', 'preferredquality': '320'}],
    }
    if source == 'bandcamp':
        options['impersonate'] = ImpersonateTarget.from_str('chrome')
    with YoutubeDL(options) as ydl:
        if source == 'youtube':
            if not re.fullmatch(r'[\w-]{11}', media['id'], re.ASCII):
                raise ValueError('Invalid YouTube ID')
            ydl.extract_info('https://www.youtube.com/watch?v=' + media['id'], download=True)
        else:
            ydl.process_ie_result({'id': str(media['id']), 'title': str(media['id']),
                                   'url': bandcamp_audio(media), 'ext': 'mp3',
                                   'vcodec': 'none', 'acodec': 'mp3'}, download=True)


if __name__ == '__main__':
    action, source, encoded = sys.argv[1:4]
    payload = json.loads(encoded)
    try:
        if action == 'search':
            print(json.dumps(search(source, **payload)))
        elif action == 'download':
            download(source, payload, sys.argv[4])
    except (KeyError, OSError, ValueError, DownloadError, requests.RequestsError):
        sys.exit(1)
