import { NextRequest } from "next/server"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url")

  if (!url) {
    return new Response("Missing url", { status: 400 })
  }

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.mako.co.il/",
        Origin: "https://www.mako.co.il",
      },
    })

    const contentType = res.headers.get("content-type") || ""

    // 🎯 אם זה playlist → rewrite
    if (contentType.includes("application/vnd.apple.mpegurl")) {
      let text = await res.text()
      const base = new URL(url)

      text = text.replace(/^(?!#)(.*)$/gm, (line) => {
        if (!line.trim() || line.startsWith("#")) return line
        const full = new URL(line, base).toString()
        return `/api/stream?url=${encodeURIComponent(full)}`
      })

      return new Response(text, {
        headers: {
          "Content-Type": "application/vnd.apple.mpegurl",
        },
      })
    }

    // 🎥 segments
    const buffer = await res.arrayBuffer()

    return new Response(buffer, {
      headers: {
        "Content-Type": contentType,
      },
    })
  } catch (e) {
    return new Response("Proxy error", { status: 500 })
  }
}