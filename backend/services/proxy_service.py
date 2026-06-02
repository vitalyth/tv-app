from urllib.parse import parse_qs, parse_qsl, unquote, urlencode, urljoin, urlparse
from pathlib import Path
import os
import mimetypes
from utils.http import create_session
from fastapi.responses import Response, StreamingResponse
import requests
import re
import html
import json

session = create_session()

PROXY_CONNECT_TIMEOUT_SECONDS = float(os.getenv("PROXY_CONNECT_TIMEOUT_SECONDS", "10"))
PROXY_READ_TIMEOUT_SECONDS = float(os.getenv("PROXY_READ_TIMEOUT_SECONDS", "60"))
PROXY_REQUEST_TIMEOUT = (PROXY_CONNECT_TIMEOUT_SECONDS, PROXY_READ_TIMEOUT_SECONDS)
KAN_VOD_PROXY_MAX_BITRATE = int(os.getenv("KAN_VOD_PROXY_MAX_BITRATE", "0"))
KAN_VOD_SEGMENT_RETRIES = max(0, int(os.getenv("KAN_VOD_SEGMENT_RETRIES", "2")))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Range, Origin, Accept, Content-Type, User-Agent, Referer",
    "Access-Control-Expose-Headers": "Accept-Ranges, Content-Length, Content-Range, Content-Type",
}


def _is_public_host(host: str) -> bool:
    """Returns True only for public domain names on standard ports."""
    parts = host.split(":")
    hostname = parts[0]
    port = int(parts[1]) if len(parts) > 1 else None

    # Any IP address (v4)
    if re.match(r"^\d{1,3}(\.\d{1,3}){3}$", hostname):
        return False
    # Plain hostnames without dots or localhost
    if "." not in hostname or hostname == "localhost":
        return False
    # Non-standard port — don't force https
    if port and port not in (80, 443):
        return False
    return True


def _request_public_proxy_url(request):
    root_path = request.scope.get("root_path", "") or request.headers.get("x-forwarded-prefix", "")

    if not root_path and request.url.path.endswith("/proxy"):
        root_path = request.url.path[:-len("/proxy")]

    root_path = root_path or ""
    current_endpoint = request.url.path.strip("/").split("/")[-1] or "proxy"
    proxy_endpoint = (
        request.headers.get("x-forwarded-proxy-endpoint")
        or current_endpoint
    ).strip("/") or "proxy"

    proto = request.headers.get("x-forwarded-proto")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc

    if not proto:
        try:
            proto = json.loads(request.headers.get("cf-visitor", "{}")).get("scheme")
        except json.JSONDecodeError:
            proto = None

    if not proto:
        proto = request.url.scheme

    if proto == "http" and host and _is_public_host(host):
        proto = "https"

    return f"{proto}://{host}{root_path}/{proxy_endpoint}"


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
    path = urlparse(url).path.lower()

    if path.endswith((".mp4", ".m4s")) and "audio" in path:
        return "audio/mp4"

    if clean_content_type and clean_content_type not in {
        "application/octet-stream",
        "binary/octet-stream",
    }:
        return content_type

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
    return (
        parsed.path.endswith("/proxy")
        or parsed.path.endswith("/vod_proxy")
    ) and "url" in parse_qs(parsed.query)


def _origin_for_url(url):
    parsed = urlparse(url)
    return f"{parsed.scheme}://{parsed.netloc}"


def _split_kodi_url_props(url):
    for separator in ("|", "%7C", "%7c"):
        if separator in url:
            clean_url, raw_props = url.split(separator, 1)
            break
    else:
        return url, {}

    headers = {}
    for key, value in parse_qsl(unquote(raw_props), keep_blank_values=True):
        normalized_key = key.strip().lower()
        if normalized_key == "user-agent":
            headers["User-Agent"] = value
        elif normalized_key in ("referer", "referrer"):
            headers["Referer"] = value
        elif normalized_key == "accept":
            headers["Accept"] = value

    return clean_url, headers


def _default_referer(url, referer):
    return referer or _origin_for_url(url) + "/"


def _query_int(value):
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _proxy_query_max_bitrate(request):
    value = _query_int(request.query_params.get("max_bitrate"))
    return value if value and value > 0 else None


def _is_kan_vod_redge_url(url):
    parsed = urlparse(url)
    host = parsed.netloc.lower()
    path = parsed.path.lower()

    return (
        "redge.media" in host
        and "/kancdn/vod/" in path
        and "/manifest.ism/" in path
    )


def _default_max_bitrate_for_request(request, url):
    requested_max_bitrate = _proxy_query_max_bitrate(request)
    if requested_max_bitrate:
        return requested_max_bitrate

    if KAN_VOD_PROXY_MAX_BITRATE > 0 and _is_kan_vod_redge_url(url):
        return KAN_VOD_PROXY_MAX_BITRATE

    return None


def _proxied_url(proxy_url, full_url, referer, cast, preserve_dash_tokens=False, max_bitrate=None):
    if _is_local_proxy_url(full_url):
        return full_url

    params = {
        "url": full_url,
        "referer": referer,
    }

    if cast:
        params["cast"] = "1"

    if max_bitrate:
        params["max_bitrate"] = str(max_bitrate)

    safe_chars = "$" if preserve_dash_tokens else ""
    return f"{proxy_url}?{urlencode(params, safe=safe_chars)}"


def _response_metadata_headers(upstream):
    return {
        "Content-Range": upstream.headers.get("Content-Range", ""),
        "Accept-Ranges": upstream.headers.get("Accept-Ranges", "bytes"),
        "Content-Length": upstream.headers.get("Content-Length", ""),
    }


def _stream_response(upstream, content_type, cast=False):
    # Cast requires full buffered response with known Content-Length
    if cast:
        content = upstream.content
        headers = _response_metadata_headers(upstream)
        headers["Content-Length"] = str(len(content))
        upstream.close()
        return Response(
            content=content,
            status_code=upstream.status_code,
            media_type=content_type,
            headers=_response_headers(headers)
        )

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


def _buffered_segment_response(url, headers, upstream, content_type, retries=0):
    max_attempts = retries + 1

    for attempt in range(max_attempts):
        current = upstream

        if attempt > 0:
            try:
                current = session.get(url, headers=headers, stream=True, timeout=PROXY_REQUEST_TIMEOUT)
            except requests.exceptions.RequestException as exc:
                print(f"Buffered segment retry open failed ({attempt}/{retries}) for url={url}: {exc}", flush=True)
                if attempt >= retries:
                    return Response(status_code=502, headers=CORS_HEADERS)
                continue

        try:
            content = current.content
            response_headers = _response_metadata_headers(current)
            response_headers["Content-Length"] = str(len(content))
            status_code = current.status_code
            current.close()

            return Response(
                content=content,
                status_code=status_code,
                media_type=content_type,
                headers=_response_headers(response_headers),
            )
        except requests.exceptions.RequestException as exc:
            try:
                current.close()
            except Exception:
                pass

            if attempt < retries:
                print(f"Retrying buffered segment ({attempt + 1}/{retries}) for url={url}: {exc}", flush=True)
                continue

            print(f"Buffered segment failed for url={url}: {exc}", flush=True)
            return Response(status_code=502, headers=CORS_HEADERS)

    return Response(status_code=502, headers=CORS_HEADERS)


def _rewrite_hls_uri(uri, manifest_base, source_url, referer, proxy_url, cast, max_bitrate=None):
    if not uri or uri.startswith(("data:", "blob:")):
        return uri

    if _is_local_proxy_url(uri):
        parsed = urlparse(uri)

        if parsed.netloc:
            return uri

        query = parsed.query
        if max_bitrate and "max_bitrate=" not in query:
            separator = "&" if query else ""
            query = f"{query}{separator}max_bitrate={max_bitrate}"

        return f"{proxy_url}?{query}"

    full_url = urljoin(manifest_base, uri)
    return _proxied_url(proxy_url, full_url, _default_referer(source_url, referer), cast, max_bitrate=max_bitrate)


def _rewrite_hls_manifest(text, source_url, referer, proxy_url, cast, max_bitrate=None):
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
                proxied = _rewrite_hls_uri(uri, manifest_base, source_url, referer, proxy_url, cast, max_bitrate=max_bitrate)
                return f'URI="{proxied}"'

            rewritten_lines.append(re.sub(r'URI="([^"]+)"', replace_uri, line))
            continue

        rewritten_lines.append(
            _rewrite_hls_uri(stripped, manifest_base, source_url, referer, proxy_url, cast, max_bitrate=max_bitrate)
        )

    return "\n".join(rewritten_lines)


def _filter_hls_master_by_max_bitrate(text, max_bitrate):
    if not max_bitrate or "#EXT-X-STREAM-INF" not in text:
        return text

    lines = text.splitlines()
    output = []
    kept_streams = 0
    removed_streams = 0
    pending_stream_line = None

    for line in lines:
        stripped = line.strip()

        if stripped.startswith("#EXT-X-STREAM-INF"):
            match = re.search(r"\bBANDWIDTH=(\d+)", stripped)
            bandwidth = int(match.group(1)) if match else None

            if bandwidth and bandwidth > max_bitrate:
                pending_stream_line = None
                removed_streams += 1
                continue

            pending_stream_line = line
            continue

        if pending_stream_line is not None:
            output.append(pending_stream_line)
            pending_stream_line = None
            output.append(line)
            kept_streams += 1
            continue

        output.append(line)

    if pending_stream_line is not None:
        output.append(pending_stream_line)

    if kept_streams == 0 and removed_streams > 0:
        return text

    return "\n".join(output)


def _is_live_hls_media_playlist(text):
    return (
        "#EXTINF" in text
        and "#EXT-X-STREAM-INF" not in text
        and "#EXT-X-ENDLIST" not in text
    )


def _is_fmp4_hls_media_playlist(lines):
    if any(line.strip().startswith("#EXT-X-MAP:") for line in lines):
        return True

    return any(
        line.strip().lower().split("?", 1)[0].endswith((".mp4", ".m4s"))
        for line in lines
        if line.strip() and not line.strip().startswith("#")
    )


def _prepare_hls_media_playlist(text, cast=False):
    """
    Upgrade VERSION to 6 and add EXT-X-START for all players.
    For cast only: add DISCONTINUITY before MPEG-TS segments to reset PTS —
    required for Redge Media livx streams with very high PTS timestamps. Do
    not add it to fMP4/CMAF playlists; it can invalidate the EXT-X-MAP context
    for Chromecast receivers.
    """
    if not _is_live_hls_media_playlist(text):
        return text

    lines = text.splitlines()
    has_start = any(line.strip().startswith("#EXT-X-START:") for line in lines)
    is_fmp4_playlist = _is_fmp4_hls_media_playlist(lines)
    should_reset_pts_for_cast = cast and not is_fmp4_playlist

    output = []
    inserted = False

    for line in lines:
        stripped = line.strip()

        # Drop existing VERSION — we'll inject VERSION:6 after #EXTM3U
        if stripped.startswith("#EXT-X-VERSION:"):
            continue

        if should_reset_pts_for_cast and stripped.startswith("#EXTINF"):
            previous = next((l.strip() for l in reversed(output) if l.strip()), "")
            if previous != "#EXT-X-DISCONTINUITY":
                output.append("#EXT-X-DISCONTINUITY")

        output.append(line)

        if inserted or stripped != "#EXTM3U":
            continue

        output.append("#EXT-X-VERSION:6")

        if not has_start and not is_fmp4_playlist:
            output.append("#EXT-X-START:TIME-OFFSET=-12,PRECISE=NO")

        inserted = True

    return "\n".join(output)


def _looks_like_html_response(text, content_type):
    clean_content_type = (content_type or "").split(";", 1)[0].strip().lower()
    sample = text.lstrip()[:200].lower()

    return (
        "html" in clean_content_type
        or sample.startswith("<!doctype html")
        or sample.startswith("<html")
        or "<title>access denied</title>" in sample
    )


def _rewrite_mpd_for_cast(text, source_url, referer, proxy_url):
    manifest_base = source_url.rsplit("/", 1)[0] + "/"
    base_url_match = re.search(r"<BaseURL>([^<]+)</BaseURL>", text, flags=re.IGNORECASE)
    segment_base = html.unescape(base_url_match.group(1)) if base_url_match else manifest_base
    request_referer = _default_referer(source_url, referer)

    def rewrite_template_url(match):
        attr = match.group(1)
        uri = html.unescape(match.group(2))
        full_url = urljoin(segment_base, uri)
        proxied = _proxied_url(
            proxy_url,
            full_url,
            request_referer,
            True,
            preserve_dash_tokens=True,
        )
        return f'{attr}="{html.escape(proxied, quote=True)}"'

    text = re.sub(r'\b(media|initialization)="([^"]+)"', rewrite_template_url, text)

    if base_url_match:
        text = re.sub(r"<BaseURL>[^<]+</BaseURL>", "", text, count=1, flags=re.IGNORECASE)

    return text



def _content_type_for_file(path: str) -> str:
    guessed, _ = mimetypes.guess_type(path)
    if guessed:
        return guessed

    lower_path = path.lower()
    if lower_path.endswith(".mkv"):
        return "video/x-matroska"
    if lower_path.endswith(".mp4") or lower_path.endswith(".m4v"):
        return "video/mp4"
    if lower_path.endswith(".avi"):
        return "video/x-msvideo"
    if lower_path.endswith(".mov"):
        return "video/quicktime"
    if lower_path.endswith(".ts"):
        return "video/mp2t"
    if lower_path.endswith(".webm"):
        return "video/webm"

    return "application/octet-stream"


def _parse_range_header(range_header: str, file_size: int) -> tuple[int, int] | None:
    if not range_header or not range_header.startswith("bytes="):
        return None

    range_value = range_header.replace("bytes=", "", 1).split(",", 1)[0].strip()
    if "-" not in range_value:
        return None

    start_text, end_text = range_value.split("-", 1)

    try:
        if start_text == "":
            # suffix range: bytes=-500
            suffix_length = int(end_text)
            if suffix_length <= 0:
                return None
            start = max(file_size - suffix_length, 0)
            end = file_size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else file_size - 1
    except ValueError:
        return None

    if start < 0 or start >= file_size or end < start:
        return None

    return start, min(end, file_size - 1)


def _file_iterator(file_path: str, start: int, end: int, chunk_size: int = 1024 * 1024):
    with open(file_path, "rb") as video_file:
        video_file.seek(start)
        remaining = end - start + 1

        while remaining > 0:
            chunk = video_file.read(min(chunk_size, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk


def handle_local_file_proxy(request, file_path: str, root_dir: str):
    """Stream a local media file with byte-range support for seeking."""
    real_root = os.path.realpath(root_dir)
    real_file = os.path.realpath(file_path)

    if real_file != real_root and not real_file.startswith(real_root + os.sep):
        return Response("Invalid file path", status_code=403, headers=CORS_HEADERS)

    if not os.path.isfile(real_file):
        return Response("File not found", status_code=404, headers=CORS_HEADERS)

    file_size = os.path.getsize(real_file)
    content_type = _content_type_for_file(real_file)
    range_header = request.headers.get("range")
    byte_range = _parse_range_header(range_header, file_size)

    if range_header and byte_range is None:
        return Response(
            status_code=416,
            headers=_response_headers({
                "Content-Range": f"bytes */{file_size}",
                "Accept-Ranges": "bytes",
            }),
        )

    if byte_range:
        start, end = byte_range
        status_code = 206
    else:
        start, end = 0, file_size - 1
        status_code = 200

    content_length = end - start + 1
    headers = _response_headers({
        "Accept-Ranges": "bytes",
        "Content-Length": str(content_length),
        "Content-Range": f"bytes {start}-{end}/{file_size}" if status_code == 206 else "",
        "Cache-Control": "no-cache",
    })

    if request.method == "HEAD":
        return Response(status_code=status_code, media_type=content_type, headers=headers)

    return StreamingResponse(
        _file_iterator(real_file, start, end),
        status_code=status_code,
        media_type=content_type,
        headers=headers,
    )

def handle_proxy(request, url, referer, cast=False):
    url, kodi_headers = _split_kodi_url_props(url)
    origin = _origin_for_url(url)
    max_bitrate = _default_max_bitrate_for_request(request, url)

    headers = {
        "User-Agent": request.headers.get("user-agent", "Mozilla/5.0"),
        "Accept": "*/*",
        "Origin": origin,
        "Referer": referer or origin + "/",
    }
    headers.update(kodi_headers)

    if "range" in request.headers:
        headers["Range"] = request.headers["range"]

    try:
        r = session.get(url, headers=headers, stream=True, timeout=PROXY_REQUEST_TIMEOUT)
    except requests.exceptions.RequestException as e:
        print("Proxy request failed:", e)
        return Response(status_code=502, headers=CORS_HEADERS)

    content_type = _content_type_for_url(url, r.headers.get("content-type", ""))
    clean_content_type = content_type.lower()
    is_head = request.method == "HEAD"

    if r.status_code >= 400:
        content = r.content
        r.close()
        return Response(
            content=content,
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers()
        )

    if is_head:
        r.close()
        return Response(
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers(_response_metadata_headers(r))
        )

    # Video/audio segments
    if "video" in clean_content_type or "audio" in clean_content_type or _is_segment_url(url):
        if cast and _is_kan_vod_redge_url(url) and _is_segment_url(url):
            return _buffered_segment_response(
                url,
                headers,
                r,
                content_type,
                retries=KAN_VOD_SEGMENT_RETRIES,
            )

        return _stream_response(r, content_type, cast=cast)

    # Text content (m3u8, mpd, etc.)
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
        proxy_url = _request_public_proxy_url(request)
        content = _rewrite_mpd_for_cast(text, url, referer, proxy_url).encode("utf-8") if cast else r.content
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

    if is_m3u8 and "#EXTM3U" not in text and _looks_like_html_response(text, content_type):
        return Response(
            content=r.content,
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers()
        )

    if not is_m3u8:
        return Response(
            content=r.content,
            media_type=content_type,
            headers=_response_headers()
        )

    # Always use public base so URLs are absolute — required for cast and external players
    proxy_url = _request_public_proxy_url(request)
    try:
        source_text = _filter_hls_master_by_max_bitrate(text, max_bitrate)
        source_text = _prepare_hls_media_playlist(source_text, cast=cast)
        content = _rewrite_hls_manifest(
            source_text,
            url,
            referer,
            proxy_url,
            cast,
            max_bitrate=max_bitrate,
        )
    except Exception as exc:
        print(f"Proxy HLS rewrite failed for url={url}: {exc}", flush=True)
        return Response(status_code=502, headers=CORS_HEADERS)

    return Response(
        content=content,
        media_type="application/vnd.apple.mpegurl",
        headers=_manifest_headers()
    )
