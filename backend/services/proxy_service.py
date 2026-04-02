from urllib.parse import urlparse, urljoin, quote, urlencode
from utils.http import create_session
from fastapi.responses import Response, StreamingResponse
import requests
import re

session = create_session()

def handle_proxy(request, url, referer):
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
        return Response(status_code=502)

    content_type = r.headers.get("content-type", "")

    # 🎥 Video / fragments
    if "video" in content_type or url.endswith((".ts", ".m4s", ".mp4")):

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
            headers={
                "Content-Range": r.headers.get("Content-Range", ""),
                "Accept-Ranges": "bytes",
                "Access-Control-Allow-Origin": "*"
            }
        )

    # text (m3u8 or other)
    try:
        text = r.text
    except Exception:
        return Response(status_code=500)

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
            headers={"Access-Control-Allow-Origin": "*"}
        )

    # rewrite to m3u8
    base_url = url.rsplit("/", 1)[0] + "/"

    root_path = request.scope.get("root_path", "")
    proto = request.headers.get("x-forwarded-proto", request.url.scheme)
    host = request.headers.get("host", "localhost")

    base_proxy = f"{proto}://{host}{root_path}"

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
                proxied = f"{base_proxy}/proxy?{urlencode({'url': full_url, 'referer': referer or origin + '/'})}"
                return f'URI="{proxied}"'

            line = re.sub(r'URI="([^"]+)"', replace_uri, line)
            new_lines.append(line)
            continue

        full_url = urljoin(base_url, line)

        proxied = f"{base_proxy}/proxy?{urlencode({'url': full_url, 'referer': referer or origin + '/'})}"

        new_lines.append(proxied)

    return Response(
        content="\n".join(new_lines),
        media_type="application/vnd.apple.mpegurl",
        headers={"Access-Control-Allow-Origin": "*"}
    )
