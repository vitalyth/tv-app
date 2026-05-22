// Use the nginx entrypoint so images, streams, and JSON share one reachable TV host.
export const API_BASE_URL = 'http://192.168.86.75:8001/api';
export const WEB_BASE_URL = API_BASE_URL.replace(/\/api\/?$/, '');

export interface LiveChannel {
  id: string;
  channelID: string;
  name: string;
  logo: string;
  module: string;
  mode: number;
  type: string;
}

export interface VodChannel {
  id: string;
  name: string;
  mode: number;
  logo: string;
  module: string;
  url: string;
  type: 'vod';
}

export interface VodItem {
  id: string;
  name: string;
  mode: number;
  logo: string;
  module: string;
  url: string;
  moreData: string;
  description: string;
  title?: string;
  aired?: string;
  episode?: string;
  season?: string;
  programName?: string;
  programImage?: string;
  channelName?: string;
  channelImage?: string;
  episodeName?: string;
  episodeImage?: string;
  isFolder: boolean;
  isPlayable: boolean;
}

export interface VodNode {
  name: string;
  module: string;
  mode: number;
  url: string;
  logo: string;
  moreData: string;
}

const fetchJson = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(`${API_BASE_URL}${path}`, options);

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
};

const withQuery = (path: string, params: Record<string, string | number>) => {
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&');

  return `${path}?${query}`;
};

export const getAssetUrl = (image?: string) => {
  if (!image) return `${WEB_BASE_URL}/ch/vod.jpg`;
  if (image.startsWith('http://') || image.startsWith('https://')) return image;
  return `${WEB_BASE_URL}/ch/${image.replace(/^\/+/, '')}`;
};

export const toVodNode = (channel: VodChannel): VodNode => ({
  name: channel.name,
  module: channel.module,
  mode: channel.mode,
  url: channel.url,
  logo: channel.logo,
  moreData: '',
});

export const vodItemToNode = (item: VodItem): VodNode => ({
  name: item.name,
  module: item.module,
  mode: item.mode,
  url: item.url,
  logo: item.logo,
  moreData: item.moreData,
});

export const tvApi = {
  getLiveChannels: () => fetchJson<LiveChannel[]>('/live_channels'),
  getVodChannels: () => fetchJson<VodChannel[]>('/vod_channels'),
  getVodRecent: () => fetchJson<VodItem[]>('/vod_recent'),
  getVodItems: (node: VodNode) => fetchJson<VodItem[]>(
    withQuery('/vod_items', {
      module: node.module,
      mode: node.mode,
      url: node.url,
      name: node.name,
      iconimage: node.logo,
      moreData: node.moreData,
    }),
  ),
  getLiveStreamUrl: (channel: LiveChannel) => (
    `${API_BASE_URL}${withQuery('/stream', { channel_id: channel.channelID || channel.id })}`
  ),
  getVodStreamUrl: async (item: VodItem) => {
    const response = await fetchJson<{ stream?: string | null }>('/vod_stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(item),
    });

    if (!response.stream) {
      throw new Error('לא נמצא קישור לצפייה');
    }

    return `${API_BASE_URL}${withQuery('/proxy', { url: response.stream })}`;
  },
};
