import { useEffect, useMemo, useRef } from 'react';
import {
  StyleSheet,
  type NativeSyntheticEvent,
  type ViewProps,
} from 'react-native';
import type { ComponentType } from 'react';
import {
  VegaShakaPlayer,
  getVegaRequestUri,
} from '../../platforms/vega/src/media/vega/VegaShakaPlayer';
import {
  registerMediaTeardown,
  waitForMediaRelease,
} from './MediaSurface.kepler';
import type { MediaStream } from './player';
import type { MultiViewSurfaceProps } from './MultiViewSurface.types';

declare const require: (name: string) => any;
const register = require('@amazon-devices/react-native-kepler/Libraries/Utilities/registerGeneratedViewConfig');
const {
  VideoPlayer,
} = require('@amazon-devices/react-native-w3cmedia/dist/headless');

type TileEvent = {
  detail?: string;
  index: number;
  state: 'loading' | 'playing' | 'error';
  source: string;
};
interface NativeProps extends ViewProps {
  source0: string;
  source1: string;
  source2: string;
  source3: string;
  paused: boolean;
  onTileState: (event: NativeSyntheticEvent<TileEvent>) => void;
}

register('TvAppVlcView', {
  uiViewClassName: 'TvAppVlcView',
  validAttributes: {
    source0: true,
    source1: true,
    source2: true,
    source3: true,
    paused: true,
  },
  bubblingEventTypes: {
    topTileState: {
      phasedRegistrationNames: {
        bubbled: 'onTileState',
        captured: 'onTileStateCapture',
      },
    },
  },
});
const NativeView = 'TvAppVlcView' as unknown as ComponentType<NativeProps>;

function FocusedAudio({
  stream,
  paused,
}: {
  stream: MediaStream;
  paused: boolean;
}) {
  const settings = useRef({ paused });
  settings.current = { paused };
  const active = useRef<any>(null);
  useEffect(() => {
    let cancelled = false;
    let player: any;
    let shaka: VegaShakaPlayer | undefined;
    const opening = (async () => {
      await waitForMediaRelease();
      if (cancelled) {
        return;
      }
      player = new VideoPlayer();
      active.current = player;
      await player.initialize();
      if (cancelled) {
        return;
      }
      // No video track or native video surface: this must not allocate a decoder.
      player.muted = true;
      shaka = new VegaShakaPlayer(
        player,
        () => {
          console.warn('[VlcMultiView] focused audio failed');
        },
        undefined,
        true,
      );
      await shaka.load(stream.url, stream.type === 'mpd' ? 'mpd' : 'm3u8');
      if (cancelled) {
        return;
      }
      player.muted = false;
      if (settings.current.paused) {
        player.pause();
      }
    })();
    opening.catch(() => {
      if (!cancelled) {
        console.warn('[VlcMultiView] focused audio could not start');
      }
    });
    return () => {
      cancelled = true;
      active.current = null;
      if (player) {
        player.muted = true;
      }
      registerMediaTeardown(
        (async () => {
          await opening.catch(() => {});
          try {
            await shaka?.destroy();
          } finally {
            if (player) {
              player.pause();
              player.deinitializeSync(2000);
            }
          }
        })(),
      );
    };
  }, [stream.url, stream.type]);
  useEffect(() => {
    const player = active.current;
    if (!player) {
      return;
    }
    if (paused) {
      player.pause();
    } else {
      Promise.resolve(player.play()).catch(() => {});
    }
  }, [paused]);
  return null;
}

export function MultiViewSurface({
  streams,
  audioTile,
  paused,
  onTileState,
}: MultiViewSurfaceProps) {
  const urls = useMemo(
    () => streams.map(stream => getVegaRequestUri(stream.url)),
    [streams],
  );
  const audio = streams[audioTile];
  return (
    <>
      <NativeView
        testID="software-multiview-surface"
        style={StyleSheet.absoluteFill}
        source0={urls[0] ?? ''}
        source1={urls[1] ?? ''}
        source2={urls[2] ?? ''}
        source3={urls[3] ?? ''}
        paused={paused}
        onTileState={({ nativeEvent }) => {
          const { index, state, source, detail } = nativeEvent;
          if (
            index >= 0 &&
            index < urls.length &&
            urls[index] === source &&
            (state === 'playing' || state === 'loading' || state === 'error')
          ) {
            console.info('[VlcMultiView] tile state', { index, state, detail });
            onTileState(index, state);
          }
        }}
      />
      {audio ? (
        <FocusedAudio key={audio.url} stream={audio} paused={paused} />
      ) : null}
    </>
  );
}
