/**
 * Resolves the appropriate playback stream type for react-native-video / ExoPlayer.
 *
 * NOTE: Order is critical! HLS (.m3u8, mpegurl, /livehls/) must be matched first.
 * Streams like Kan 11 Redge CDN have URLs such as:
 *   .../live/kan11/live.livx/playlist.m3u8?dvr=21600000
 * Since they contain '.livx' but end with '.m3u8', treating them as DASH ('mpd') breaks
 * playback because ExoPlayer's DASH XML parser cannot parse the M3U8 HLS manifest.
 */
export const getStreamType = (url?: string | null): 'm3u8' | 'mpd' | 'mp4' => {
  if (!url) return 'm3u8';
  const lower = url.toLowerCase();

  // 1. Explicit HLS extensions or paths take highest precedence
  if (
    lower.includes('.m3u8') ||
    lower.includes('mpegurl') ||
    lower.includes('/livehls/') ||
    lower.includes('/hls/')
  ) {
    return 'm3u8';
  }

  // 2. DASH streams (.mpd or /livedash/)
  if (
    lower.includes('.mpd') ||
    lower.includes('/livedash/') ||
    lower.includes('application/dash+xml') ||
    (lower.includes('.livx') && !lower.includes('.m3u8'))
  ) {
    return 'mpd';
  }

  // 3. Direct MP4 container
  if (lower.includes('.mp4')) {
    return 'mp4';
  }

  // 4. Default for TV live streams is HLS (m3u8) matching native Android app
  return 'm3u8';
};

export default getStreamType;
