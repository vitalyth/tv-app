import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { VideoPlayer } from '@amazon-devices/react-native-w3cmedia/dist/headless';
import { KeplerVideoSurfaceView } from '@amazon-devices/react-native-w3cmedia/dist/interface/KeplerVideoSurfaceView';
import { useForegroundPlaybackTimeout } from '../../../src/hooks/useForegroundPlaybackTimeout';

const CLIP_ORIGIN = 'http://192.168.1.107:8766';

function DiagnosticTile({ index }: { index: number }) {
  const player = useRef<any>(null);
  const handle = useRef<string | undefined>(undefined);
  const disposed = useRef(false);
  const initialization = useRef<Promise<void> | null>(null);
  const [status, setStatus] = useState('WAITING');
  const [metrics, setMetrics] = useState('');

  const attach = useCallback(async (surface: string) => {
    handle.current = surface;
    if (player.current || disposed.current) {
      return;
    }
    const instance = new VideoPlayer();
    player.current = instance;
    setStatus('INITIALIZING');
    try {
      initialization.current = instance.initialize();
      await initialization.current;
      console.warn('[DecoderDiagnostic] initialized', index);
      if (disposed.current) {
        return;
      }
      instance.setSurfaceHandle(surface);
      instance.muted = true;
      instance.autoplay = true;
      instance.loop = true;
      instance.addEventListener('playing', () => {
        if (!disposed.current) { setStatus('PLAYING'); }
      });
      instance.addEventListener('error', () => {
        if (!disposed.current) { setStatus('ERROR'); }
        console.warn('[DecoderDiagnostic] error', index);
      });
      instance.src = `${CLIP_ORIGIN}/tile-${index}.mp4`;
      setStatus('LOADING');
      console.warn('[DecoderDiagnostic] source assigned', index, instance.src);
      await instance.play();
    } catch (error) {
      if (!disposed.current) { setStatus('ERROR'); }
      console.warn('[DecoderDiagnostic] initialization', index, String(error));
    }
  }, [index]);

  useEffect(() => {
    const timer = setInterval(() => {
      const instance = player.current;
      if (!instance) { return; }
      const quality = instance.videoWidth > 0 ? instance.getVideoPlaybackQuality?.() : undefined;
      const sample = {
        tile: index,
        time: Number(instance.currentTime ?? 0).toFixed(1),
        paused: instance.paused,
        width: instance.videoWidth,
        height: instance.videoHeight,
        frames: quality?.totalVideoFrames,
        dropped: quality?.droppedVideoFrames,
      };
      setMetrics(JSON.stringify(sample));
      console.warn('[DecoderDiagnostic]', JSON.stringify(sample));
    }, 3000);
    return () => {
      disposed.current = true;
      clearInterval(timer);
      const instance = player.current;
      if (instance && handle.current) { instance.clearSurfaceHandle(handle.current); }
      initialization.current?.catch(() => {}).then(() => {
        instance?.pause();
        instance?.deinitializeSync(2000);
      }).catch(error => {
        console.warn('[DecoderDiagnostic] cleanup', index, String(error));
      });
    };
  }, [index]);

  return (
    <View style={styles.tile}>
      <View style={styles.video}>
        <KeplerVideoSurfaceView
          style={StyleSheet.absoluteFill}
          scalingmode="fit"
          onSurfaceViewCreated={attach}
          onSurfaceViewDestroyed={surface => {
            if (handle.current === surface) {
              player.current?.clearSurfaceHandle(surface);
              handle.current = undefined;
            }
          }}
        />
      </View>
      <Text style={styles.label}>{index}: {status}</Text>
      <Text style={styles.metrics}>{metrics}</Text>
    </View>
  );
}

export function DecoderDiagnostic() {
  useForegroundPlaybackTimeout(true);
  const [count, setCount] = useState(0);
  useEffect(() => {
    const first = setTimeout(() => setCount(1), 3000);
    const second = setTimeout(() => setCount(2), 20000);
    const third = setTimeout(() => setCount(3), 40000);
    return () => { clearTimeout(first); clearTimeout(second); clearTimeout(third); };
  }, []);
  return (
    <View style={styles.root}>
      <Text style={styles.title}>Decoder Diagnostic: {count} / 3</Text>
      <View style={styles.row}>
        {[1, 2, 3].map(index => index <= count
          ? <DiagnosticTile key={index} index={index} />
          : <View key={index} style={styles.tile} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#101010', padding: 20 },
  title: { color: '#ffffff', fontSize: 20, marginBottom: 24 },
  row: { flexDirection: 'row', gap: 12 },
  tile: { flex: 1 },
  video: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000000' },
  label: { color: '#ffffff', fontSize: 16, marginTop: 12 },
  metrics: { color: '#cccccc', fontSize: 12, marginTop: 8 },
});
