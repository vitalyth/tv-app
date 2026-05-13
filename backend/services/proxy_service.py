from urllib.parse import parse_qs, urlencode, urljoin, urlparse
from utils.http import create_session
from fastapi.responses import Response, StreamingResponse
import requests
import re
import html
import json

session = create_session()

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


def _request_public_base_proxy(request):
    root_path = request.scope.get("root_path", "") or request.headers.get("x-forwarded-prefix", "")

    if not root_path and request.url.path.endswith("/proxy"):
        root_path = request.url.path[:-len("/proxy")]

    root_path = root_path or ""

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

    # Video/audio segments
    if "video" in clean_content_type or "audio" in clean_content_type or _is_segment_url(url):
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
        base_proxy = _request_public_base_proxy(request)
        content = _rewrite_mpd_for_cast(text, url, referer, base_proxy).encode("utf-8") if cast else r.content
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

    if not is_m3u8:
        return Response(
            content=r.content,
            media_type=content_type,
            headers=_response_headers()
        )

    # Always use public base so URLs are absolute — required for cast and external players
    base_proxy = _request_public_base_proxy(request)
    source_text = _prepare_hls_media_playlist(text, cast=cast)
    content = _rewrite_hls_manifest(source_text, url, referer, base_proxy, cast)

    return Response(
        content=content,
        media_type="application/vnd.apple.mpegurl",
        headers=_manifest_headers()
    )
