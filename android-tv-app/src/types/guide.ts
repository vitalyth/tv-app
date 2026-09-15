export interface TvStreamSource {
  id?: string;
  name: string;
  url: string;
  isDirect?: boolean;
  rawChannel?: any;
}

export interface TvProgram {
  id: string;
  channelId: string;
  title: string;
  description: string;
  imageUrl?: string | null;
  startSeconds: number;
  endSeconds: number;
  timeRange?: string;
  isLive?: boolean;
  progress?: number;
  durationMinutes?: number;
}

export interface TvChannel {
  id: string;
  name: string;
  number: string;
  index?: number;
  logoUrl?: string | null;
  streamUrl: string;
  sources: TvStreamSource[];
  currentProgram?: TvProgram | null;
  rawChannel?: any;
}

export interface GuideData {
  channels: TvChannel[];
  programsByChannel: Record<string, TvProgram[]>;
  guideStartSeconds: number;
  guideEndSeconds: number;
}

export enum AppDestination {
  HOME = 'HOME',
  LIVE_TV = 'LIVE_TV',
  VOD = 'VOD',
}
