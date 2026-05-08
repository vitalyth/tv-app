from urllib.parse import urlencode, urljoin, urlparse
from utils.http import create_session
from fastapi.responses import Response, StreamingResponse
import requests
import re

session = create_session()

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
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc

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


def _proxied_url(base_proxy, full_url, referer, cast):
    params = {
        "url": full_url,
        "referer": referer,
    }

    if cast:
        params["cast"] = "1"

    return f"{base_proxy}/proxy?{urlencode(params)}"


def handle_proxy(request, url, referer, cast=False):
    parsed = urlparse(url)
    origin = f"{parsed.scheme}://{parsed.netloc}"

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
        return Response(
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers({
                "Content-Range": r.headers.get("Content-Range", ""),
                "Accept-Ranges": r.headers.get("Accept-Ranges", "bytes"),
                "Content-Length": r.headers.get("Content-Length", ""),
            })
        )

    # 🎥 Video/audio fragments
    if (
        "video" in content_type
        or "audio" in content_type
        or url.endswith((".ts", ".m4s", ".mp4", ".m4a"))
    ):

        def generate():
            try:
                for chunk in r.iter_content(chunk_size=1024 * 64):  # chunk for stability
                    if chunk:
                        yield chunk
            except Exception as e:
                print("Stream interrupted:", e)
            finally:
                r.close()

        return StreamingResponse(
            generate(),
            status_code=r.status_code,
            media_type=content_type,
            headers=_response_headers({
                "Content-Range": r.headers.get("Content-Range", ""),
                "Accept-Ranges": r.headers.get("Accept-Ranges", "bytes"),
                "Content-Length": r.headers.get("Content-Length", ""),
            })
        )

    # text (m3u8 or other)
    try:
        text = r.text
    except Exception:
        return Response(status_code=500, headers=CORS_HEADERS)

    is_mpd = (
        "dash+xml" in content_type
        or url.endswith(".mpd")
        or "<MPD" in text[:500]
    )

    if is_mpd:
        return Response(
            content=r.content,
            media_type="application/dash+xml",
            headers=_response_headers()
        )

    is_m3u8 = (
        "mpegurl" in content_type
        or url.endswith(".m3u8")
        or "#EXTM3U" in text
    )

    # If not M3U8 → return as is
    if not is_m3u8:
        return Response(
            content=r.content,
            media_type=content_type,
            headers=_response_headers()
        )

    # rewrite to m3u8
    base_url = url.rsplit("/", 1)[0] + "/"
    base_proxy = _request_public_base_proxy(request) if cast else _request_base_proxy(request)

    new_lines = []

    for line in text.splitlines():
        line = line.strip()

        if not line:
            new_lines.append(line)
            continue

        if line.startswith("#"):
            def replace_uri(match):
                uri = match.group(1)
                full_url = urljoin(base_url, uri)
                proxied = _proxied_url(base_proxy, full_url, referer or origin + "/", cast)
                return f'URI="{proxied}"'

            line = re.sub(r'URI="([^"]+)"', replace_uri, line)
            new_lines.append(line)
            continue

        full_url = urljoin(base_url, line)

        proxied = _proxied_url(base_proxy, full_url, referer or origin + "/", cast)

        new_lines.append(proxied)

    return Response(
        content="\n".join(new_lines),
        media_type="application/vnd.apple.mpegurl",
        headers=_response_headers()
    )
