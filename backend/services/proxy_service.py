from collections import OrderedDict
from time import time
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from utils.http import create_session
from fastapi.responses import Response, StreamingResponse
import requests
import re
import json
import html

session = create_session()
CAST_LIVE_SEGMENT_LIMIT = 10
MANIFEST_CACHE_TTL_SECONDS = 1.5
SEGMENT_CACHE_TTL_SECONDS = 120
SEGMENT_CACHE_MAX_ITEM_BYTES = 8 * 1024 * 1024
SEGMENT_CACHE_MAX_TOTAL_BYTES = 0
manifest_cache = OrderedDict()
segment_cache = OrderedDict()
segment_cache_size = 0

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Origin, Accept, Content-Type, User-Agent, Referer",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
}


def _request_base_proxy(request):
    root_path = request.scope.get("root_path", "") or request.headers.get("x-forwarded-prefix", "")

    if not root_path and request.url.path.endswith("/proxy"):
        root_path = request.url.path[:-len("/proxy")]

    return root_path or ""


def _request_public_base_proxy(request):
    root_path = _request_base_proxy(request)
    proto = request.headers.get("x-forwarded-proto")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc

    if not proto:
        try:
            proto = json.loads(request.headers.get("cf-visitor", "{}")).get("scheme")
        except json.JSONDecodeError:
            proto = None

    if not proto:
        proto = request.url.scheme

    if proto == "http" and host and not host.startswith(("localhost", "127.0.0.1", "0.0.0.0")):
        proto = "https"

    return f"{proto}://{host}{root_path}"


def cors_preflight():
    return Response(status_code=204, headers=CORS_HEADERS)


def _response_headers(extra=None):
    headers = dict(CORS_HEADERS)

    if extra:
        headers.update({key: value for key, value in extra.items() if value})

    return headers


def _content_type_for_url(url, content_type):
    clean_content_type = (content_type or "").split(";", 1)[0].strip().lower()

    if clean_content_type and clean_content_type not in {
        "application/octet-stream",
        "binary/octet-stream",
    }:
        return content_type

    path = urlparse(url).path.lower()

    if path.endswith((".mp4", ".m4s")):
        return "video/mp4"

    if path.endswith(".m4a"):
        return "audio/mp4"

    if path.endswith(".ts"):
        return "video/mp2t"

    if path.endswith(".m3u8"):
        return "application/vnd.apple.mpegurl"

    return content_type or "application/octet-stream"


def _url_path(url):
    return urlparse(url).path.lower()


def _is_manifest_url(url):
    return _url_path(url).endswith((".m3u8", ".mpd", ".livx"))


def _is_segment_url(url):
    return _url_path(url).endswith((".ts", ".m4s", ".mp4", ".m4a", ".aac", ".vtt"))


def _is_local_proxy_url(uri):
    parsed = urlparse(uri)
    return parsed.path.endswith("/proxy") and "url" in parse_qs(parsed.query)


def _origin_for_url(url):
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _default_referer(url, referer):
    return referer or _origin_for_url(url) + "/"


def _proxied_url(base_proxy, full_url, referer, cast):
    if _is_local_proxy_url(full_url):
        return full_url

    params = {
        "url": full_url,
        "referer": referer,
    }

    if cast:
        params["cast"] = "1"

    return f"{base_proxy}/proxy?{urlencode(params)}"


def _cache_key(url, referer):
    return (url, referer or "")


def _get_manifest_cache(key):
    entry = manifest_cache.get(key)

    if not entry:
        return None

    expires_at = entry[0]

    if expires_at <= time():
        manifest_cache.pop(key, None)
        return None

    manifest_cache.move_to_end(key)
    return entry[1:]


def _get_segment_cache(key):
    global segment_cache_size

    entry = segment_cache.get(key)

    if not entry:
        return None

    expires_at = entry[0]

    if expires_at <= time():
        expired_entry = segment_cache.pop(key, None)

        if expired_entry:
            segment_cache_size -= len(expired_entry[1])

        return None

    segment_cache.move_to_end(key)
    return entry[1:]


def _set_manifest_cache(key, text, content_type):
    manifest_cache[key] = (time() + MANIFEST_CACHE_TTL_SECONDS, text, content_type)
    manifest_cache.move_to_end(key)

    while len(manifest_cache) > 128:
        manifest_cache.popitem(last=False)


def _set_segment_cache(key, content, content_type, headers):
    global segment_cache_size

    if SEGMENT_CACHE_MAX_TOTAL_BYTES <= 0:
        return

    if len(content) > SEGMENT_CACHE_MAX_ITEM_BYTES:
        return

    previous = segment_cache.pop(key, None)

    if previous:
        segment_cache_size -= len(previous[1])

    segment_cache[key] = (time() + SEGMENT_CACHE_TTL_SECONDS, content, content_type, headers)
    segment_cache.move_to_end(key)
    segment_cache_size += len(content)

    while segment_cache_size > SEGMENT_CACHE_MAX_TOTAL_BYTES and segment_cache:
        _, expired_entry = segment_cache.popitem(last=False)
        segment_cache_size -= len(expired_entry[1])


def _response_metadata_headers(upstream):
    return {
        "Content-Range": upstream.headers.get("Content-Range", ""),
        "Accept-Ranges": upstream.headers.get("Accept-Ranges", "bytes"),
        "Content-Length": upstream.headers.get("Content-Length", ""),
    }


def _safe_content_length(headers):
    try:
        return int(headers.get("Content-Length", ""))
    except (TypeError, ValueError):
        return None


def _stream_response(upstream, content_type):
    def generate():
        try:
            for chunk in upstream.iter_content(chunk_size=1024 * 64):
                if chunk:
                    yield chunk
        except Exception as e:
            print("Stream interrupted:", e)
        finally:
            upstream.close()

    return StreamingResponse(
        generate(),
        status_code=upstream.status_code,
        media_type=content_type,
        headers=_response_headers(_response_metadata_headers(upstream))
    )


def _rewrite_hls_uri(uri, manifest_base, source_url, referer, base_proxy, cast):
    if not uri or uri.startswith(("data:", "blob:")):
        return uri

    if _is_local_proxy_url(uri):
        parsed = urlparse(uri)

        if parsed.netloc:
            return uri

        base_path = urlparse(base_proxy).path.rstrip("/")
        uri_path = parsed.path

        if base_path and uri_path.startswith(base_path + "/"):
            uri_path = uri_path[len(base_path):]

        return f"{base_proxy}{uri_path}?{parsed.query}"

    full_url = urljoin(manifest_base, uri)
    return _proxied_url(base_proxy, full_url, _default_referer(source_url, referer), cast)


def _rewrite_hls_manifest(text, source_url, referer, base_proxy, cast):
    manifest_base = source_url.rsplit("/", 1)[0] + "/"
    rewritten_lines = []

    for line in text.splitlines():
        stripped = line.strip()

        if not stripped:
            rewritten_lines.append(line)
            continue

        if stripped.startswith("#"):
            def replace_uri(match):
                uri = match.group(1)
                proxied = _rewrite_hls_uri(uri, manifest_base, source_url, referer, base_proxy, cast)
                return f'URI="{proxied}"'

            rewritten_lines.append(re.sub(r'URI="([^"]+)"', replace_uri, line))
            continue

        rewritten_lines.append(
            _rewrite_hls_uri(stripped, manifest_base, source_url, referer, base_proxy, cast)
        )

    return "\n".join(rewritten_lines)


def _trim_hls_live_media_playlist(text, segment_limit=CAST_LIVE_SEGMENT_LIMIT):
    lines = text.splitlines()

    if "#EXT-X-ENDLIST" in text or "#EXT-X-STREAM-INF" in text:
        return text

    has_segments = any(line.strip().startswith("#EXTINF") for line in lines)

    if not has_segments:
        return text

    header_lines = []
    segments = []
    pending_tags = []
    current_sequence = None
    before_first_segment = True
    expect_segment_uri = False
    segment_preface_tags = (
        "#EXT-X-PROGRAM-DATE-TIME",
        "#EXT-X-DISCONTINUITY",
        "#EXT-X-BYTERANGE",
    )

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("#EXT-X-MEDIA-SEQUENCE:"):
            try:
                current_sequence = int(stripped.split(":", 1)[1])
            except ValueError:
                current_sequence = None

            header_lines.append(line)
            continue

        if stripped.startswith("#EXTINF"):
            before_first_segment = False
            pending_tags.append(line)
            expect_segment_uri = True
            continue

        if stripped.startswith(segment_preface_tags):
            before_first_segment = False
            pending_tags.append(line)
            continue

        if expect_segment_uri and stripped and not stripped.startswith("#"):
            pending_tags.append(line)
            segments.append(pending_tags)
            pending_tags = []
            expect_segment_uri = False
            continue

        if before_first_segment:
            header_lines.append(line)
        else:
            pending_tags.append(line)

    if len(segments) <= segment_limit:
        return text

    dropped_segments = len(segments) - segment_limit
    trimmed_segments = segments[-segment_limit:]
    output_lines = []
    sequence_written = False

    for line in header_lines:
        stripped = line.strip()

        if stripped.startswith("#EXT-X-MEDIA-SEQUENCE:") and current_sequence is not None:
            output_lines.append(f"#EXT-X-MEDIA-SEQUENCE:{current_sequence + dropped_segments}")
            sequence_written = True
        else:
            output_lines.append(line)

    if current_sequence is not None and not sequence_written:
        output_lines.append(f"#EXT-X-MEDIA-SEQUENCE:{current_sequence + dropped_segments}")

    for segment in trimmed_segments:
        output_lines.extend(segment)

    return "\n".join(output_lines)


def _rewrite_mpd_for_cast(text, source_url, referer, base_proxy):
    manifest_base = source_url.rsplit("/", 1)[0] + "/"
    base_url_match = re.search(r"<BaseURL>([^<]+)</BaseURL>", text, flags=re.IGNORECASE)
    segment_base = html.unescape(base_url_match.group(1)) if base_url_match else manifest_base
    request_referer = _default_referer(source_url, referer)

    def rewrite_template_url(match):
        attr = match.group(1)
        uri = html.unescape(match.group(2))
        full_url = urljoin(segment_base, uri)
        proxied = _proxied_url(base_proxy, full_url, request_referer, True)
        return f'{attr}="{html.escape(proxied, quote=True)}"'

    text = re.sub(r'\b(media|initialization)="([^"]+)"', rewrite_template_url, text)

    if base_url_match:
        text = re.sub(r"<BaseURL>[^<]+</BaseURL>", "", text, count=1, flags=re.IGNORECASE)

    return text


def _manifest_response(request, url, referer, cast, text, content_type):
    is_mpd = (
        "dash+xml" in content_type
        or _url_path(url).endswith((".mpd", ".livx"))
        or "<MPD" in text[:500]
    )

    if is_mpd:
        content = text.encode("utf-8")

        if cast:
            content = _rewrite_mpd_for_cast(
                text,
                url,
                referer,
                _request_public_base_proxy(request),
            ).encode("utf-8")

        return Response(
            content=content,
            media_type="application/dash+xml",
            headers=_response_headers()
        )

    is_m3u8 = (
        "mpegurl" in content_type
        or _url_path(url).endswith(".m3u8")
        or "#EXTM3U" in text
    )

    if not is_m3u8:
        return None

    base_proxy = _request_public_base_proxy(request) if cast else _request_base_proxy(request)
    source_text = _trim_hls_live_media_playlist(text) if cast else text
    content = _rewrite_hls_manifest(source_text, url, referer, base_proxy, cast)

    return Response(
        content=content,
        media_type="application/vnd.apple.mpegurl",
        headers=_response_headers()
    )


def handle_proxy(request, url, referer, cast=False):
    origin = _origin_for_url(url)
    cache_key = _cache_key(url, referer)
    can_use_cache = request.method == "GET" and "range" not in request.headers

    if can_use_cache and _is_segment_url(url):
        cached_segment = _get_segment_cache(cache_key)

        if cached_segment:
            content, content_type, headers = cached_segment
            return Response(
                content=content,
                media_type=content_type,
                headers=_response_headers(headers)
            )

    if can_use_cache and _is_manifest_url(url):
        cached_manifest = _get_manifest_cache(cache_key)

        if cached_manifest:
            text, content_type = cached_manifest
            cached_response = _manifest_response(request, url, referer, cast, text, content_type)

            if cached_response:
                return cached_response

    headers = {
        "User-Agent": request.headers.get("user-agent", "Mozilla/5.0"),
        "Accept": "*/*",
        "Origin": origin,
        "Referer": referer or origin + "/",
    }

    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    # 🔥 request with retry + timeout
    try:
        r = session.get(url, headers=headers, stream=True, timeout=10)
    except requests.exceptions.RequestException as e:
        print("Proxy request failed:", e)
        return Response(status_code=502, headers=CORS_HEADERS)

    content_type = _content_type_for_url(url, r.headers.get("content-type", ""))
    is_head = request.method == "HEAD"

    if is_head:
        r.close()
        return Response(
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers(_response_metadata_headers(r))
        )

    if "video" in content_type or "audio" in content_type or _is_segment_url(url):
        content_length = _safe_content_length(r.headers)
        can_cache_segment = (
            can_use_cache
            and r.status_code == 200
            and content_length is not None
            and content_length <= SEGMENT_CACHE_MAX_ITEM_BYTES
        )

        if can_cache_segment:
            content = r.content
            response_headers = _response_metadata_headers(r)
            r.close()
            _set_segment_cache(cache_key, content, content_type, response_headers)
            return Response(
                content=content,
                media_type=content_type,
                headers=_response_headers(response_headers)
            )

        return _stream_response(r, content_type)

    # text (m3u8 or other)
    try:
        text = r.text
    except Exception:
        return Response(status_code=500, headers=CORS_HEADERS)

    manifest_response = _manifest_response(request, url, referer, cast, text, content_type)

    if manifest_response:
        if can_use_cache and r.status_code == 200 and _is_manifest_url(url):
            _set_manifest_cache(cache_key, text, content_type)

        r.close()
        return manifest_response

    if not _is_manifest_url(url):
        return Response(
            content=r.content,
            media_type=content_type,
            headers=_response_headers()
        )

    return Response(
        content=r.content,
        media_type=content_type,
        headers=_response_headers()
    )
