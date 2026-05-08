from collections import OrderedDict
from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from utils.http import create_session
from fastapi.responses import Response, StreamingResponse
import requests
import re
import html
import json
import time

session = create_session()
CAST_HLS_WINDOW_TARGET_SECONDS = 90
CAST_HLS_PLAYLIST_CACHE_TTL_SECONDS = 180
cast_hls_playlist_windows = OrderedDict()

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


def _manifest_headers(extra=None):
    return _response_headers({
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
        **(extra or {}),
    })


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


def _response_metadata_headers(upstream):
    return {
        "Content-Range": upstream.headers.get("Content-Range", ""),
        "Accept-Ranges": upstream.headers.get("Accept-Ranges", "bytes"),
        "Content-Length": upstream.headers.get("Content-Length", ""),
    }


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


def _is_live_hls_media_playlist(text):
    return (
        "#EXTINF" in text
        and "#EXT-X-STREAM-INF" not in text
        and "#EXT-X-ENDLIST" not in text
    )


def _hls_target_duration(text):
    match = re.search(r"^#EXT-X-TARGETDURATION:(\d+)", text, flags=re.MULTILINE)

    if not match:
        return None

    try:
        return int(match.group(1))
    except ValueError:
        return None


def _hls_media_sequence(text):
    match = re.search(r"^#EXT-X-MEDIA-SEQUENCE:(\d+)", text, flags=re.MULTILINE)

    if not match:
        return None

    try:
        return int(match.group(1))
    except ValueError:
        return None


def _parse_hls_media_playlist(text):
    header_lines = []
    segments = []
    pending_lines = []
    before_first_segment = True
    expect_segment_uri = False

    for line in text.splitlines():
        stripped = line.strip()

        if stripped.startswith("#EXTINF"):
            before_first_segment = False
            pending_lines.append(line)
            expect_segment_uri = True
            continue

        if expect_segment_uri and stripped and not stripped.startswith("#"):
            pending_lines.append(line)
            segments.append((stripped, pending_lines))
            pending_lines = []
            expect_segment_uri = False
            continue

        if before_first_segment:
            header_lines.append(line)
        else:
            pending_lines.append(line)

    return header_lines, segments


def _merge_hls_live_window(text, source_url):
    if not _is_live_hls_media_playlist(text):
        return text

    now = time.time()

    for key in list(cast_hls_playlist_windows.keys()):
        if now - cast_hls_playlist_windows[key]["updated_at"] > CAST_HLS_PLAYLIST_CACHE_TTL_SECONDS:
            cast_hls_playlist_windows.pop(key, None)

    header_lines, segments = _parse_hls_media_playlist(text)

    if not segments:
        return text

    entry = cast_hls_playlist_windows.get(source_url)

    if not entry:
        entry = {"segments": OrderedDict(), "updated_at": now}
        cast_hls_playlist_windows[source_url] = entry

    for segment_uri, segment_lines in segments:
        entry["segments"][segment_uri] = segment_lines

    target_duration = _hls_target_duration(text) or 4
    max_segments = max(
        len(segments),
        CAST_HLS_WINDOW_TARGET_SECONDS // max(target_duration, 1),
    )

    while len(entry["segments"]) > max_segments:
        entry["segments"].popitem(last=False)

    entry["updated_at"] = now
    cast_hls_playlist_windows.move_to_end(source_url)

    while len(cast_hls_playlist_windows) > 64:
        cast_hls_playlist_windows.popitem(last=False)

    merged_segments = list(entry["segments"].values())
    current_sequence = _hls_media_sequence(text)

    if current_sequence is not None:
        merged_sequence = max(0, current_sequence - (len(merged_segments) - len(segments)))
        header_lines = [
            f"#EXT-X-MEDIA-SEQUENCE:{merged_sequence}"
            if line.strip().startswith("#EXT-X-MEDIA-SEQUENCE:")
            else line
            for line in header_lines
        ]

    output_lines = header_lines[:]

    for segment_lines in merged_segments:
        output_lines.extend(segment_lines)

    return "\n".join(output_lines)


def _prepare_hls_for_cast(text, source_url):
    text = _merge_hls_live_window(text, source_url)

    if not _is_live_hls_media_playlist(text):
        return text

    lines = text.splitlines()
    has_version = any(line.strip().startswith("#EXT-X-VERSION:") for line in lines)
    has_start = any(line.strip().startswith("#EXT-X-START:") for line in lines)

    if has_version and has_start:
        return text

    output = []
    inserted = False

    for line in lines:
        output.append(line)

        if inserted or line.strip() != "#EXTM3U":
            continue

        if not has_version:
            output.append("#EXT-X-VERSION:3")

        if not has_start:
            output.append("#EXT-X-START:TIME-OFFSET=-12,PRECISE=NO")

        inserted = True

    return "\n".join(output)


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


def handle_proxy(request, url, referer, cast=False):
    origin = _origin_for_url(url)

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
    clean_content_type = content_type.lower()
    is_head = request.method == "HEAD"

    if is_head:
        r.close()
        return Response(
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers(_response_metadata_headers(r))
        )

    # 🎥 Video/audio fragments
    if "video" in clean_content_type or "audio" in clean_content_type or _is_segment_url(url):
        return _stream_response(r, content_type)

    # text (m3u8 or other)
    try:
        text = r.text
    except Exception:
        return Response(status_code=500, headers=CORS_HEADERS)

    is_mpd = (
        "dash+xml" in clean_content_type
        or _url_path(url).endswith((".mpd", ".livx"))
        or "<MPD" in text[:500]
    )

    if is_mpd:
        content = r.content

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
        "mpegurl" in clean_content_type
        or _url_path(url).endswith(".m3u8")
        or "#EXTM3U" in text
    )

    # If not M3U8 → return as is
    if not is_m3u8:
        return Response(
            content=r.content,
            media_type=content_type,
            headers=_response_headers()
        )

    base_proxy = _request_public_base_proxy(request) if cast else _request_base_proxy(request)
    source_text = _prepare_hls_for_cast(text, url) if cast else text
    content = _rewrite_hls_manifest(source_text, url, referer, base_proxy, cast)

    return Response(
        content=content,
        media_type="application/vnd.apple.mpegurl",
        headers=_manifest_headers()
    )
