// @ts-nocheck
import {DOMParser} from '@xmldom/xmldom';
import {decode} from 'base-64';
import {
  HTMLMediaElement,
  MediaError,
  MediaSource,
  SourceBufferImpl,
  TextDecoder,
  TextTrackCue,
  VTTCue,
  WebCrypto,
  decodingInfo,
  requestMediaKeySystemAccess,
} from '@amazon-devices/react-native-w3cmedia/dist/headless';
import {TextTrackImpl} from '@amazon-devices/react-native-w3cmedia/dist/TextTrackImpl';

declare const require: (moduleName: string) => any;

let shaka: any;

function installPolyfills(mediaElement: any) {
  const runtime = global as any;
  runtime.window ??= runtime;
  runtime.self ??= runtime;
  runtime.navigator ??= {};
  runtime.gmedia = mediaElement;

  if (shaka) {
    return;
  }

  runtime.document ??= {
    createElement: () => runtime.gmedia,
    getElementsByTagName: () => runtime.gmedia,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  };
  runtime.Element ??= class Element {};
  runtime.MediaSource = runtime.window.MediaSource = MediaSource;
  runtime.SourceBuffer = runtime.window.SourceBuffer = SourceBufferImpl;
  runtime.TextTrackCue = runtime.window.TextTrackCue = TextTrackCue;
  runtime.VTTCue = runtime.window.VTTCue = VTTCue;
  runtime.TextTrack = runtime.window.TextTrack = TextTrackImpl;
  runtime.MediaError = runtime.window.MediaError = MediaError;
  runtime.HTMLMediaElement = HTMLMediaElement;
  runtime.TextDecoder = runtime.window.TextDecoder = TextDecoder;
  runtime.DOMParser = runtime.window.DOMParser = DOMParser;
  runtime.navigator.requestMediaKeySystemAccess = requestMediaKeySystemAccess;
  runtime.navigator.mediaCapabilities = {decodingInfo};
  runtime.navigator.userAgent = 'AFTCA001';
  runtime.window.fetch = fetch;
  runtime.window.XMLHttpRequest ??= runtime.XMLHttpRequest;
  if (typeof runtime.TextEncoder === 'undefined') {
    const {TextEncoder: TE} = require('fastestsmallesttextencoderdecoder');
    runtime.TextEncoder = runtime.window.TextEncoder = TE;
  }
  runtime.window.crypto = WebCrypto;
  runtime.window.atob = decode;
  runtime.window.addEventListener ??= () => undefined;
  runtime.window.removeEventListener ??= () => undefined;
  runtime.Node ??= {TEXT_NODE: 3, CDATA_SECTION_NODE: 4};

  if (typeof HTMLMediaElement.prototype.getElementsByTagName === 'undefined') {
    HTMLMediaElement.prototype.getElementsByTagName = () => [];
  }

  if (typeof runtime.navigator.mediaSession === 'undefined') {
    runtime.navigator.mediaSession = {
      playbackState: 'none',
      metadata: null,
      setActionHandler: () => {},
    };
  }

  shaka ??= require('./vendor/shaka-player.compiled');
  shaka.polyfill.installAll();
}

function mimeType(type?: 'm3u8' | 'mpd') {
  if (type === 'm3u8') {
    return 'application/x-mpegurl';
  }
  if (type === 'mpd') {
    return 'application/dash+xml';
  }
  return undefined;
}

export class VegaShakaPlayer {
  private player: any;
  private mediaElement: any;
  private activeQualityHeight?: number;
  private onQualitiesChanged?: (qualities: any[]) => void;

  private getReportedQualityHeight(event?: any): number {
    const candidates = [
      event?.height,
      event?.detail?.height,
      event?.track?.height,
      event?.newTrack?.height,
      event?.mediaQuality?.height,
      event?.detail?.track?.height,
      event?.detail?.newTrack?.height,
      event?.detail?.mediaQuality?.height,
      this.player?.getStats?.()?.height,
      this.mediaElement?.videoHeight,
      this.mediaElement?.naturalVideoHeight,
    ];

    for (const candidate of candidates) {
      const height = Number(candidate);
      if (Number.isFinite(height) && height > 0) {
        return height;
      }
    }

    const activeTrack = this.player
      ?.getVariantTracks?.()
      ?.find((track: any) => track.active);
    const activeTrackHeight = Number(activeTrack?.height);
    return Number.isFinite(activeTrackHeight) && activeTrackHeight > 0
      ? activeTrackHeight
      : 0;
  }

  private updateActiveQuality = (event?: any) => {
    const height = this.getReportedQualityHeight(event);
    if (height > 0) {
      this.activeQualityHeight = height;
    }
    this.onQualitiesChanged?.(this.getQualities());
    this.logActiveQuality();
  };

  private logActiveQuality = () => {
    const activeTrack = this.player
      ?.getVariantTracks()
      ?.find(
        (track: any) =>
          track.active || Number(track.height) === this.activeQualityHeight,
      );

    if (!activeTrack) {
      return;
    }

    console.info('[VegaShakaPlayer] active quality', {
      width: activeTrack.width,
      height: activeTrack.height,
      frameRate: activeTrack.frameRate,
      bandwidth: activeTrack.bandwidth,
      codecs: activeTrack.videoCodec,
    });
  };

  constructor(
    mediaElement: any,
    onError: () => void,
    onQualitiesChanged?: (qualities: any[]) => void,
  ) {
    installPolyfills(mediaElement);
    this.mediaElement = mediaElement;
    this.onQualitiesChanged = onQualitiesChanged;
    this.player = new shaka.Player(mediaElement);
    this.player.addEventListener('error', (event: any) => {
      console.warn('[VegaShakaPlayer] error event:', event?.detail ?? event);
      onError();
    });
    this.player.addEventListener('adaptation', this.updateActiveQuality);
    this.player.addEventListener('variantchanged', this.updateActiveQuality);
    this.player.addEventListener(
      'mediaqualitychanged',
      this.updateActiveQuality,
    );
    this.player.configure({
      streaming: {
        bufferingGoal: 4,
        bufferBehind: 2,
        rebufferingGoal: 1,
        segmentPrefetchLimit: 0,
        retryParameters: {maxAttempts: 3},
      },
      manifest: {
        dash: {disableXlinkProcessing: true},
        hls: {
          disableClosedCaptionsDetection: true,
          sequenceMode: false,
        },
      },
      abr: {
        enabled: true,
        restrictions: {
          minWidth: 320,
          minHeight: 240,
          maxWidth: 1920,
          maxHeight: 1080,
        },
      },
    });
  }

  async load(url: string, type?: 'm3u8' | 'mpd') {
    await this.player.load(url, undefined, mimeType(type));
    this.logActiveQuality();
    await this.mediaElement.play();
    const nav = (global as any).navigator;
    if (nav?.mediaSession) {
      nav.mediaSession.playbackState = 'playing';
    }
  }

  getQualities() {
    const tracks = this.player?.getVariantTracks?.() ?? [];
    const statsHeight = Number(this.player?.getStats?.()?.height);
    const mediaHeight = Number(this.mediaElement?.videoHeight);
    const activeHeight =
      Number.isFinite(this.activeQualityHeight) && this.activeQualityHeight
        ? this.activeQualityHeight
        : Number.isFinite(statsHeight) && statsHeight > 0
        ? statsHeight
        : mediaHeight;
    const qualityByHeight = new Map<number, any>();

    tracks
      .filter((track: any) => Number(track.height) > 0)
      .forEach((track: any) => {
        const height = Number(track.height);
        const existing = qualityByHeight.get(height);
        if (
          !existing ||
          (!existing.active && track.active) ||
          (!existing.active &&
            !track.active &&
            Number(track.bandwidth) > Number(existing.bandwidth))
        ) {
          qualityByHeight.set(height, track);
        }
      });

    const qualities = [...qualityByHeight.values()]
      .sort(
        (left: any, right: any) => Number(right.height) - Number(left.height),
      )
      .map((track: any) => ({
        id: String(track.height),
        label: `${track.height}p`,
        height: track.height,
        width: track.width,
        bitrate: track.bandwidth,
        active: Boolean(track.active) || Number(track.height) === activeHeight,
      }));

    return [
      {
        id: 'auto',
        label: 'Auto',
        active: this.player?.getConfiguration?.().abr?.enabled !== false,
      },
      ...qualities,
    ];
  }

  selectQuality(qualityId: string) {
    if (!this.player) {
      return;
    }

    if (!qualityId || qualityId === 'auto') {
      this.player.configure({abr: {enabled: true}});
      return;
    }

    const targetHeight = Number(qualityId);
    const track = this.player
      .getVariantTracks?.()
      ?.find((candidate: any) => Number(candidate.height) === targetHeight);
    if (!track) {
      return;
    }

    this.player.configure({abr: {enabled: false}});
    this.player.selectVariantTrack(track, true);
    this.logActiveQuality();
  }

  async destroy() {
    const nav = (global as any).navigator;
    if (nav?.mediaSession) {
      nav.mediaSession.playbackState = 'none';
    }
    await this.player.destroy();
    this.player = null;
    this.mediaElement = null;
  }
}
