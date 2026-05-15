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
  channelID: string
  module: string
  mode: number
  linkDetails: LinkDetails
  type: string
  programs: Program[]
  tvgID?: string
  url?: string
  moreData?: string
  playerLogo?: string
  playerTitle?: string
  playerSubtitle?: string
}

export interface VodChannel {
  id: string
  name: string
  mode: number
  logo: string
  module: string
  url: string
  type: "vod"
}

export interface VodItem {
  id: string
  name: string
  mode: number
  logo: string
  module: string
  url: string
  moreData: string
  description: string
  isFolder: boolean
  isPlayable: boolean
}

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

export const CATEGORY_LABELS = new Map([
  ["news", "חדשות"],
  ["entertainment", "בידור"],
  ["kids", "ילדים"],
  ["music", "מוזיקה"],
  ["sports", "ספורט"],
  ["business", "כלכלה"],
  ["reality", "ריאליטי"],
  ["general", "כללי"],
  ["religion", "דת"],
  ["comedy", "קומדיה"],
  ["lifestyle", "לייף סטייל"],
  ["talk", "דיבור"],
  ["culture", "תרבות"],
]);
