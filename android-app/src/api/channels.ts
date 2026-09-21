import {getJson} from './client';

export async function getLiveChannelCount(): Promise<number> {
  const channels = await getJson<unknown>('/live_channels');
  if (!Array.isArray(channels)) {
    throw new Error('Unexpected live channels response');
  }
  return channels.length;
}
