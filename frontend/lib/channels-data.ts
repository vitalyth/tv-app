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
