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
    const { TextEncoder: TE } = require('fastestsmallesttextencoderdecoder');
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

  private logActiveQuality = () => {
    const activeTrack = this.player
      ?.getVariantTracks()
      ?.find((track: any) => track.active);

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

  constructor(mediaElement: any, onError: () => void) {
    installPolyfills(mediaElement);
    this.mediaElement = mediaElement;
    this.player = new shaka.Player(mediaElement);
    this.player.addEventListener('error', (event: any) => {
      console.warn('[VegaShakaPlayer] error event:', event?.detail ?? event);
      onError();
    });
    this.player.addEventListener('adaptation', this.logActiveQuality);
    this.player.configure({
      streaming: {
        bufferingGoal: 10,
        bufferBehind: 10,
        rebufferingGoal: 0.01,
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
  }

  async destroy() {
    await this.player.destroy();
    this.player = null;
    this.mediaElement = null;
  }
}
