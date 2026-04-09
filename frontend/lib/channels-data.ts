type ManifestType = "hls" | "mpd"

export interface LinkDetails {
  link: string
  referer?: string
  final?: boolean
  manifest_type?: ManifestType
  ch?: string
  regex?: string
}

export interface Program {
    start: number
    end: number
    name: string
    description: string
} 

export interface Channel {
  id: string
  index: number
  name: string
  logo: string
  category: string
  //streamUrl: string

  channelID: string
  module: string
  mode: number
  linkDetails: LinkDetails
  type: string
  programs: Program[]
}

/*
export const channels: Channel[] = [
  { index: 1, id: "ch_11", name: "כאן 11", logo: "kan.jpg", category: "חדשות", module: "kan", channelID: "ch_11", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8" } },
  { index: 2, id: "ch_11b", name: "כאן 11 - גיבוי", logo: "kan.jpg", category: "חדשות", module: "tv", channelID: "ch_11b", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livedash/oil/kancdn-live/live/kan11/live.livx", final: true, manifest_type: "mpd" } },
  { index: 3, id: "ch_11c", name: "כאן 11 - לקויי שמיעה", logo: "kan.jpg", category: "חדשות", module: "kan", channelID: "ch_11c", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11_subs/live.livx/playlist.m3u8" } },

  { index: 4, id: "ch_12", name: "קשת 12", logo: "keshet.jpg", category: "בידור", module: "keshet", channelID: "ch_12", mode: 10, type: "tv", linkDetails: { link: "/direct/hls/live/2033791/k12/index.m3u8?as=1" } },
  { index: 5, id: "ch_12b", name: "קשת 12 - גיבוי", logo: "keshet.jpg", category: "בידור", module: "keshet", channelID: "ch_12b", mode: 10, type: "tv", linkDetails: { link: "/stream/hls/live/2033791/k12n12wad/index.m3u8?b-in-range=0-700" } },
  { index: 6, id: "ch_12b2", name: "קשת 12 - גיבוי 2", logo: "keshet.jpg", category: "בידור", module: "keshet", channelID: "ch_12b2", mode: 10, type: "tv", linkDetails: { link: "/direct/hls/live/2033791/k12dvr/index.m3u8?b-in-range=800-2700" } },
  { index: 7, id: "ch_12b3", name: "קשת 12 - גיבוי 3", logo: "keshet.jpg", category: "בידור", module: "keshet", channelID: "ch_12b3", mode: 10, type: "tv", linkDetails: { link: "/n12/hls/live/2103938/k12/index.m3u8?b-in-range=0-1100" } },
  { index: 8, id: "ch_12c", name: "קשת 12 - לקויי שמיעה", logo: "keshet.jpg", category: "בידור", module: "keshet", channelID: "ch_12c", mode: 10, type: "tv", linkDetails: { link: "/direct/hls/live/2035325/k12cc/index.m3u8?as=1" } },

  { index: 9, id: "ch_13", name: "רשת 13", logo: "13.jpg", category: "בידור", module: "reshet", channelID: "ch_13", mode: 4, type: "tv", linkDetails: { referer: "https://13tv.co.il/live/", link: "https://dsk76kvc9kie6.cloudfront.net/media/87f59c77-03f6-4bad-a648-897e095e7360/mainManifest.m3u8" } },
  { index: 10, id: "ch_13b", name: "רשת 13 - גיבוי", logo: "13.jpg", category: "בידור", module: "reshet", channelID: "ch_13b", mode: 4, type: "tv", linkDetails: { referer: "https://13tv.co.il/live/", link: "https://d18b0e6mopany4.cloudfront.net/out/v1/2f2bc414a3db4698a8e94b89eaf2da2a/index.m3u8" } },
  { index: 11, id: "ch_13b2", name: "רשת 13 - גיבוי 2", logo: "13.jpg", category: "בידור", module: "reshet", channelID: "ch_13b2", mode: 4, type: "tv", linkDetails: { referer: "https://13tv.co.il/allshows/2010263/", link: "https://d2xg1g9o5vns8m.cloudfront.net/out/v1/0855d703f7d5436fae6a9c7ce8ca5075/index.m3u8" } },
  { index: 12, id: "ch_13c", name: "רשת 13 - לקויי שמיעה", logo: "13.jpg", category: "בידור", module: "reshet", channelID: "ch_13c", mode: 4, type: "tv", linkDetails: { referer: "https://13tv.co.il/live/", link: "https://reshet.g-mana.live/media/4607e158-e4d4-4e18-9160-3dc3ea9bc677/mainManifest.m3u8" } },

  { index: 13, id: "ch_14", name: "עכשיו 14", logo: "14tv.png", category: "חדשות", module: "14tv", channelID: "ch_14", mode: 10, type: "tv", linkDetails: { link: "https://ch14channel14.encoders.immergo.tv/app/2/streamPlaylist.m3u8" } },
  { index: 14, id: "ch_14b", name: "עכשיו 14 - גיבוי", logo: "14tv.png", category: "חדשות", module: "tv", channelID: "ch_14b", mode: 10, type: "tv", linkDetails: { link: "https://ch14channel14.encoders.immergo.tv/app/2/streamPlaylist.m3u8" } },
  { index: 15, id: "ch_14b2", name: "עכשיו 14 - גיבוי 2", logo: "14tv.png", category: "חדשות", module: "tv", channelID: "ch_14b2", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livehls/oil/ch14/live/ch14/live.livx/playlist.m3u8?bitrate=5692000&audioId=1&videoId=0", final: true } },

  { index: 16, id: "ch_10", name: "כלכלה 10", logo: "10tv.png", category: "חדשות", module: "tv", channelID: "ch_10", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livehls/oil/calcala-live/live/channel10/live.livx/playlist.m3u8" } },

  { index: 17, id: "ch_23", name: "כאן חינוכית 23", logo: "23tv.jpg", category: "ילדים", module: "kan", channelID: "ch_23", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan_edu/live.livx/playlist.m3u8" } },
  { index: 18, id: "ch_23b", name: "כאן חינוכית 23 - גיבוי", logo: "23tv.jpg", category: "ילדים", module: "tv", channelID: "ch_23b", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livedash/oil/kancdn-live/live/kan_edu/live.livx", final: true, manifest_type: "mpd" } },

  { index: 19, id: "ch_24", name: "ערוץ 24 החדש", logo: "24telad.png", category: "מוזיקה", module: "keshet", channelID: "ch_24", mode: 10, type: "tv", linkDetails: { link: "/direct/hls/live/2035340/ch24live/index.m3u8?as=1" } },

  { index: 20, id: "ch_bb", name: "האח הגדול 26", logo: "bb.jpg", category: "בידור", module: "reshet", channelID: "ch_bb", mode: 4, type: "tv", linkDetails: { link: "https://d3snfszc9pg25z.cloudfront.net/media/e1739115-9182-4adc-8d19-8eb7fb6fdd3a/playlist_3.m3u8" } },
  { index: 21, id: "ch_bbb", name: "האח הגדול 26 - גיבוי", logo: "bb.jpg", category: "בידור", module: "tv", channelID: "ch_bbb", mode: 10, type: "tv", linkDetails: { link: "https://d3snfszc9pg25z.cloudfront.net/media/e1739115-9182-4adc-8d19-8eb7fb6fdd3a/master.m3u8", final: true } },

  { index: 22, id: "ch_33", name: "מכאן 33", logo: "makan.png", category: "חדשות", module: "kan", channelID: "ch_33", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/makan/live.livx/playlist.m3u8" } },
  { index: 23, id: "ch_33b", name: "מכאן 33 - גיבוי", logo: "makan.png", category: "חדשות", module: "tv", channelID: "ch_33b", mode: 10, type: "tv", linkDetails: { link: "https://r.il.cdn-redge.media/livedash/oil/kancdn-live/live/makan/live.livx", final: true, manifest_type: "mpd" } },

  { index: 24, id: "ch_66", name: "קבלה 66", logo: "kabbalah.jpg", category: "תיעודי", module: "tv", channelID: "ch_66", mode: 10, type: "tv", linkDetails: { link: "https://edge2.il.kab.tv/live/tv66-heb-high/playlist.m3u8" } },

  { index: 25, id: "ch_97", name: "הידברות 97", logo: "hidabroot.jpg", category: "תיעודי", module: "hidabroot", channelID: "ch_97", mode: 10, type: "tv", linkDetails: { link: "https://www.hidabroot.org/live" } },

  { index: 26, id: "ch_99", name: "כנסת 99", logo: "knesset.png", category: "ממשל", module: "tv", channelID: "ch_99", mode: 10, type: "tv", linkDetails: { link: "https://kneset.gostreaming.tv/p2-kneset/_definst_/myStream/index.m3u8" } },
  { index: 27, id: "ch_99c", name: "כנסת 99 - לקויי שמיעה", logo: "knesset.png", category: "ממשל", module: "tv", channelID: "ch_99c", mode: 10, type: "tv", linkDetails: { link: "https://kneset.gostreaming.tv/p2-Accessibility/_definst_/myStream/index.m3u8" } },

  { index: 28, id: "ch_ynet", name: "Ynet Live", logo: "ynet.jpg", category: "חדשות", module: "tv", channelID: "ch_ynet", mode: 10, type: "tv", linkDetails: { link: "https://ynet-live-01.ynet-pic1.yit.co.il/ynet/live.m3u8", final: true } },

  { index: 29, id: "ch_sport5", name: "ספורט 5 אתר", logo: "Sport5.png", category: "ספורט", module: "sport5", channelID: "ch_sport5", mode: 10, type: "tv", linkDetails: { link: "https://rgelive.akamaized.net/hls/live/2043095/live3/playlist.m3u8" } },

  { index: 30, id: "ch_100", name: "100FM רדיוס", logo: "100fm.jpg", category: "מוזיקה", module: "tv", channelID: "ch_100", mode: 10, type: "tv", linkDetails: { link: "https://cdn.cybercdn.live/Radios_100FM/Video/playlist.m3u8" } },

  { index: 31, id: "ch_9", name: "ערוץ 9", logo: "9tv.png", category: "חדשות", module: "tv", channelID: "ch_9", mode: 10, type: "tv", linkDetails: { link: "https://contact.gostreaming.tv/Con-11/index.m3u8" } },

  { index: 32, id: "ch_891", name: "89.1FM", logo: "891fm.png", category: "מוזיקה", module: "tv", channelID: "ch_891", mode: 10, type: "tv", linkDetails: { link: "https://www.oles.tv/891fm/player/", regex: "streamSource\\s*=\\s*'(.*?)'" } },

  { index: 33, id: "ch_kabru", name: "קבלה רוסית", logo: "kabbalah.jpg", category: "תיעודי", module: "tv", channelID: "ch_kabru", mode: 10, type: "tv", linkDetails: { link: "https://edge2.il.kab.tv/live/tv66-rus-high/playlist.m3u8" } },

  { index: 34, id: "ch_musayof", name: "מוסיוף", logo: "musayof.jpg", category: "תיעודי", module: "tv", channelID: "ch_musayof", mode: 10, type: "tv", linkDetails: { link: "http://wowza.media-line.co.il/Musayof-Live/livestream.sdp/playlist.m3u8", referer: "http://media-line.co.il/Media-Line-Player/musayof/livePlayer.aspx" } },

  { index: 35, id: "ch_i24news", name: "i24news", logo: "i24news.png", category: "חדשות", module: "i24news", channelID: "ch_i24news", mode: 10, type: "tv", linkDetails: { link: "https://fastly.live.brightcove.com/6386790215112/.../playlist-hls.m3u8", manifest_type: "hls" } },
  { index: 36, id: "ch_i24newsen", name: "i24news en", logo: "i24news.png", category: "חדשות", module: "i24news", channelID: "ch_i24newsen", mode: 10, type: "tv", linkDetails: { link: "https://fastly.live.brightcove.com/6386790908112/.../playlist-hls.m3u8", manifest_type: "hls" } },
  { index: 37, id: "ch_i24newsfr", name: "i24news fr", logo: "i24news.png", category: "חדשות", module: "i24news", channelID: "ch_i24newsfr", mode: 10, type: "tv", linkDetails: { link: "https://fastly.live.brightcove.com/6386790513112/.../playlist-hls.m3u8", manifest_type: "hls" } },
  { index: 38, id: "ch_i24newsar", name: "i24news ar", logo: "i24news.png", category: "חדשות", module: "i24news", channelID: "ch_i24newsar", mode: 10, type: "tv", linkDetails: { link: "https://fastly.live.brightcove.com/6386792572112/.../playlist-hls.m3u8", manifest_type: "hls" } },

  { index: 39, id: "ch_13comedy", name: "קומדיות 13", logo: "13comedy.jpg", category: "בידור", module: "reshet", channelID: "ch_13comedy", mode: 4, type: "tv", linkDetails: { link: "https://d15ds134q59udk.cloudfront.net/out/v1/fbba879221d045598540ee783b140fe2/index.m3u8" } },
  { index: 40, id: "ch_13nofesh", name: "נופש", logo: "13nofesh.jpg", category: "בידור", module: "reshet", channelID: "ch_13nofesh", mode: 4, type: "tv", linkDetails: { link: "https://d1yd8hohnldm33.cloudfront.net/out/v1/19dee23c2cc24f689bd4e1288661ee0c/index.m3u8" } },
  { index: 41, id: "ch_13reality", name: "ריאליטי", logo: "13reality.jpg", category: "בידור", module: "reshet", channelID: "ch_13reality", mode: 4, type: "tv", linkDetails: { link: "https://d2dffl3588mvfk.cloudfront.net/out/v1/d8e15050ca4148aab0ee387a5e2eb46b/index.m3u8" } },

  { index: 42, id: "ch_erets", name: "ארץ נהדרת", logo: "erets.jpg", category: "בידור", module: "keshet", channelID: "ch_erets", mode: 10, type: "tv", linkDetails: { link: "/free/hls/live/2111419/erets/index.m3u8?b-in-range=0-1800" } },
  { index: 43, id: "ch_savri", name: "סברי מרנן", logo: "savri.jpg", category: "בידור", module: "keshet", channelID: "ch_savri", mode: 10, type: "tv", linkDetails: { link: "/free/hls/live/2111419/savri/index.m3u8?b-in-range=0-1800" } },
  { index: 44, id: "ch_hatuna", name: "חתונמי", logo: "hatuna.jpg", category: "בידור", module: "keshet", channelID: "ch_hatuna", mode: 10, type: "tv", linkDetails: { link: "/free/hls/live/2111419/hatuna/index.m3u8?b-in-range=0-1800" } },
  { index: 45, id: "ch_kohav", name: "הכוכב הבא", logo: "kohav.jpg", category: "בידור", module: "keshet", channelID: "ch_kohav", mode: 10, type: "tv", linkDetails: { link: "/free/hls/live/2111419/kohav/index.m3u8?b-in-range=0-1800" } },
  { index: 46, id: "ch_ninja", name: "נינג'ה ישראל", logo: "ninja.jpg", category: "בידור", module: "keshet", channelID: "ch_ninja", mode: 10, type: "tv", linkDetails: { link: "/free/hls/live/2111419/ninja/index.m3u8?b-in-range=0-1800" } }
]

export const channels: Channel[] = [
  {
    id: "ch_11",
    name: "כאן 11",
    logo: "11",
    category: "חדשות",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8",
    channelID: "11",
    module: "kan",
    mode: 10,
  },
  {
    id: "ch_11b",
    name: "כאן 11 - גיבוי",
    logo: "11",
    category: "חדשות",
    streamUrl: "https://r.il.cdn-redge.media/livedash/oil/kancdn-live/live/kan11/live.livx",
    channelID: "11",
    module: "tv",
    mode: 10,
  },
  {
    id: "ch_11c",
    name: "כאן 11 - לקויי שמיעה",
    logo: "11",
    category: "חדשות",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11_subs/live.livx/playlist.m3u8",
    channelID: "11",
    module: "kan",
    mode: 10,
  },
  {
    id: "ch_12",
    name: "קשת 12",
    logo: "12",
    category: "בידור",
    streamUrl: "/direct/hls/live/2033791/k12/index.m3u8?as=1",
    channelID: "12",
    module: "keshet",
    mode: 10,
  },
  {
    id: "ch_12b",
    name: "קשת 12 - גיבוי",
    logo: "12",
    category: "בידור",
    streamUrl: "/stream/hls/live/2033791/k12n12wad/index.m3u8?b-in-range=0-700",
    channelID: "12",
    module: "keshet",
    mode: 10,
  },
  {
    id: "ch_12b2",
    name: "קשת 12 - גיבוי 2",
    logo: "12",
    category: "בידור",
    streamUrl: "/direct/hls/live/2033791/k12dvr/index.m3u8?b-in-range=800-2700",
    channelID: "12",
    module: "keshet",
    mode: 10,
  },
  {
    id: "ch_12b3",
    name: "קשת 12 - גיבוי 3",
    logo: "12",
    category: "בידור",
    streamUrl: "/n12/hls/live/2103938/k12/index.m3u8?b-in-range=0-1100",
    channelID: "12",
    module: "keshet",
    mode: 10,
  },
  {
    id: "ch_12c",
    name: "קשת 12 - לקויי שמיעה",
    logo: "12",
    category: "בידור",
    streamUrl: "/direct/hls/live/2035325/k12cc/index.m3u8?as=1",
    channelID: "12",
    module: "keshet",
    mode: 10,
  },
  {
    id: "ch_13",
    name: "רשת 13",
    logo: "13",
    category: "בידור",
    streamUrl: "https://dsk76kvc9kie6.cloudfront.net/media/87f59c77-03f6-4bad-a648-897e095e7360/mainManifest.m3u8",
    channelID: "13",
    module: "reshet",
    mode: 4,
  },
  {
    id: "ch_13b",
    name: "רשת 13 - גיבוי",
    logo: "13",
    category: "בידור",
    streamUrl: "https://d18b0e6mopany4.cloudfront.net/out/v1/2f2bc414a3db4698a8e94b89eaf2da2a/index.m3u8",
    channelID: "13",
    module: "reshet",
    mode: 4,
  },
  {
    id: "ch_14",
    name: "עכשיו 14",
    logo: "14",
    category: "חדשות",
    streamUrl: "https://ch14channel14.encoders.immergo.tv/app/2/streamPlaylist.m3u8",
    channelID: "14",
    module: "14tv",
    mode: 10,
  },
  {
    id: "ch_10",
    name: "כלכלה 10",
    logo: "10",
    category: "חדשות",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/calcala-live/live/channel10/live.livx/playlist.m3u8",
    channelID: "10",
    module: "tv",
    mode: 10,
  },
  {
    id: "ch_23",
    name: "כאן חינוכית 23",
    logo: "23",
    category: "ילדים",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan_edu/live.livx/playlist.m3u8",
    channelID: "23",
    module: "kan",
    mode: 10,
  },
  {
    id: "ch_24",
    name: "ערוץ 24 החדש",
    logo: "24",
    category: "מוזיקה",
    streamUrl: "/direct/hls/live/2035340/ch24live/index.m3u8?as=1",
    channelID: "24",
    module: "keshet",
    mode: 10,
  },
  {
    id: "ch_33",
    name: "מכאן 33",
    logo: "33",
    category: "חדשות",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/makan/live.livx/playlist.m3u8",
    channelID: "33",
    module: "kan",
    mode: 10,
  },
  {
    id: "ch_66",
    name: "קבלה 66",
    logo: "66",
    category: "תיעודי",
    streamUrl: "https://edge2.il.kab.tv/live/tv66-heb-high/playlist.m3u8",
    channelID: "66",
    module: "tv",
    mode: 10,
  },
  {
    id: "ch_97",
    name: "הידברות 97",
    logo: "97",
    category: "תיעודי",
    streamUrl: "https://www.hidabroot.org/live",
    channelID: "97",
    module: "hidabroot",
    mode: 10,
  },
  {
    id: "ch_99",
    name: "כנסת 99",
    logo: "99",
    category: "ממשל",
    streamUrl: "https://kneset.gostreaming.tv/p2-kneset/_definst_/myStream/index.m3u8",
    channelID: "99",
    module: "tv",
    mode: 10,
  }
]
*/

/*
export const channels: Channel[] = [
  // ערוצים עם זרמים אמיתיים
  {
    id: "kan11",
    name: "כאן 11",
    logo: "11",
    category: "חדשות",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan11/live.livx/playlist.m3u8", 
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "kan-educational",
    name: "כאן חינוכית",
    logo: "📚",
    category: "חינוך",
    streamUrl: "https://r.il.cdn-redge.media/livehls/oil/kancdn-live/live/kan_edu/live.livx/playlist.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "knesset",
    name: "ערוץ הכנסת",
    logo: "🏛️",
    category: "ממשל",
    streamUrl: "https://contact.gostreamer.com/Knesset/myStream/playlist.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "kan-kids",
    name: "כאן לילדים",
    logo: "🎨",
    category: "ילדים",
    streamUrl: "https://kan23w.media.kan.org.il/hls/live/2105697/2105697/master.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "keshet12",
    name: "קשת 12",
    logo: "12",
    category: "בידור",
    streamUrl: "https://mako-streaming.akamaized.net/direct/hls/live/2033791/k12/index.m3u8?hdnea=st=1774016388~exp=1774017288~acl=/*~hmac=0f9ee64979144efff695a86596bdace9bd5ab39e5ed1bcf5836a12559b07c8ef",
    module: "keshet",
    channelID: "ch_12",
    mode: 10,
  },
  {
    id: "reshet13",
    name: "רשת 13",
    logo: "13",
    category: "חדשות",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "reshet",
    channelID: "ch_13b",
    mode: 4,
  },
  {
    id: "channel14",
    name: "ערוץ 14",
    logo: "14",
    category: "חדשות",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "sport5",
    name: "ערוץ הספורט",
    logo: "⚽",
    category: "ספורט",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "music24",
    name: "מוזיקה 24",
    logo: "🎵",
    category: "מוזיקה",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "nature",
    name: "טבע ונופים",
    logo: "🌿",
    category: "תיעודי",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "movies",
    name: "סרטים",
    logo: "🎬",
    category: "סרטים",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  },
  {
    id: "comedy",
    name: "קומדיה",
    logo: "😂",
    category: "בידור",
    streamUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    module: "kan",
    channelID: "ch_11",
    mode: 10,
  }
]
*/

export const categories = [
  "הכל",
  "חדשות",
  "בידור",
  "ספורט",
  "חינוך",
  "ילדים",
  "מוזיקה",
  "תיעודי",
  "סרטים",
  "ממשל"
]
