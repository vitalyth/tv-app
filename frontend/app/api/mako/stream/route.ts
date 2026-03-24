import { NextRequest } from "next/server"

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"

export async function GET(req: NextRequest) {
  const vcmid = req.nextUrl.searchParams.get("vcmid")
  const channelId = req.nextUrl.searchParams.get("channelId")

  if (!vcmid || !channelId) {
    return new Response("Missing params", { status: 400 })
  }

  try {
    // 🔥 1. קריאה ל־playlist API (כמו בפייתון)
    const playlistUrl = `https://www.mako.co.il/AjaxPage?jspName=playlist.jsp&vcmid=${vcmid}&videoChannelId=${channelId}&galleryChannelId=${vcmid}&isGallery=false&consumer=web_html5&encryption=no`

    const res = await fetch(playlistUrl, {
      headers: {
        "User-Agent": UA,
        Referer: "https://www.mako.co.il/",
        Origin: "https://www.mako.co.il",
      },
    })

    const json = await res.json()

    const media = json.media

    const akamai = media.find((m: any) => m.cdn === "AKAMAI")

    if (!akamai) {
      return new Response("No stream found", { status: 404 })
    }

    // 🔥 2. לנקות query ישן
    const baseUrl = akamai.url.split("?")[0]

    // 🔥 3. להביא ticket
    const ticketRes = await fetch(
      `https://mass.mako.co.il/ClicksStatistics/entitlementsServicesV2.jsp?et=gt&lp=${baseUrl}&rv=AKAMAI`,
      {
        headers: {
          "User-Agent": UA,
          Referer: "https://www.mako.co.il/",
          Origin: "https://www.mako.co.il",
        },
      }
    )

    const ticketJson = await ticketRes.json()

    const ticket = ticketJson.tickets?.[0]?.ticket

    if (!ticket) {
      return new Response("No ticket", { status: 403 })
    }

    // 🔥 4. לבנות URL סופי
    const finalUrl = `${baseUrl}?${ticket}`

    return Response.json({ url: finalUrl })
  } catch (e) {
    console.error(e)
    return new Response("Error", { status: 500 })
  }
}