import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  BackHandler,
} from 'react-native';
import Video, { VideoRef } from 'react-native-video';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { RootStackParamList } from '../../App';
import { Colors } from '../utils/theme';
import { tvApi } from '../services/tvApi';

type Props = NativeStackScreenProps<RootStackParamList, 'Player'>;

export default function PlayerScreen({ route }: Props) {
  const { title, isLive, vodItem } = route.params;
  const navigation = useNavigation();
  const videoRef = useRef<VideoRef>(null);
  const [paused, setPaused] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [url, setUrl] = useState(route.params.url);
  const [loadingUrl, setLoadingUrl] = useState(Boolean(vodItem) && !route.params.url);

  useEffect(() => {
    if (!vodItem || route.params.url) return;

    let active = true;
    setLoadingUrl(true);
    tvApi.getVodStreamUrl(vodItem)
      .then((stream) => {
        if (!active) return;
        setUrl(stream);
      })
      .catch((streamError) => {
        if (!active) return;
        setError(streamError instanceof Error ? streamError.message : 'שגיאת טעינה');
      })
      .finally(() => {
        if (active) setLoadingUrl(false);
      });

    return () => {
      active = false;
    };
  }, [route.params.url, vodItem]);

  // Hide controls after 3 seconds
  const controlsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const resetControlsTimer = () => {
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    setShowControls(true);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  // Handle hardware back button
  useFocusEffect(
    useCallback(() => {
      resetControlsTimer();
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        navigation.goBack();
        return true;
      });
      return () => {
        sub.remove();
        if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
      };
    }, [])
  );

  const togglePlayPause = () => {
    setPaused((p) => !p);
    resetControlsTimer();
  };

  return (
    <View style={styles.root}>
      {/* ── VIDEO ──────────────────────────────────────────── */}
      {url ? (
        <Video
          ref={videoRef}
          source={{ uri: url }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
          paused={paused}
          repeat={!isLive}
          onError={(e) => setError(e.error?.localizedDescription ?? 'שגיאת טעינה')}
          onTouchStart={resetControlsTimer}
        />
      ) : (
        <View style={styles.noUrlPlaceholder}>
          <Text style={styles.noUrlText}>{title}</Text>
          <Text style={styles.noUrlSub}>
            {loadingUrl ? 'טוען קישור לצפייה...' : isLive ? 'שידור חי' : 'VOD'}
          </Text>
        </View>
      )}

      {/* ── ERROR ──────────────────────────────────────────── */}
      {error ? (
        <View style={styles.errorOverlay}>
          <Text style={styles.errorText}>⚠️ {error}</Text>
        </View>
      ) : null}

      {/* ── CONTROLS OVERLAY ───────────────────────────────── */}
      {showControls ? (
        <View style={styles.controls} onTouchStart={resetControlsTimer}>
          {/* Top bar */}
          <View style={styles.topBar}>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.backBtn}
            >
              <Text style={styles.backText}>← חזרה</Text>
            </TouchableOpacity>
            <View style={styles.titleBlock}>
              <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
              {isLive ? (
                <View style={styles.livePill}>
                  <View style={styles.liveDot} />
                  <Text style={styles.liveText}>LIVE</Text>
                </View>
              ) : null}
            </View>
          </View>

          {/* Center play/pause */}
          <TouchableOpacity style={styles.playBtn} onPress={togglePlayPause}>
            <Text style={styles.playIcon}>{paused ? '▶' : '⏸'}</Text>
          </TouchableOpacity>

          {/* Bottom gradient bar */}
          <View style={styles.bottomBar} />
        </View>
      ) : (
        // Tap anywhere to show controls
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          onPress={resetControlsTimer}
          activeOpacity={1}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  noUrlPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
  },
  noUrlText: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  noUrlSub: {
    fontSize: 18,
    color: Colors.live,
    fontWeight: '600',
  },

  // Error
  errorOverlay: {
    position: 'absolute',
    top: '45%',
    alignSelf: 'center',
    backgroundColor: 'rgba(229,66,43,0.2)',
    borderRadius: 10,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  errorText: {
    color: Colors.live,
    fontSize: 16,
    fontWeight: '600',
  },

  // Controls
  controls: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    paddingTop: 24,
    paddingBottom: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  backBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
  },
  backText: {
    color: Colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  titleBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  titleText: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'right',
    maxWidth: 600,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.live,
    borderRadius: 20,
    paddingHorizontal: 9,
    paddingVertical: 4,
    gap: 5,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#fff',
  },
  liveText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  playBtn: {
    alignSelf: 'center',
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    color: '#fff',
    fontSize: 28,
    marginLeft: 3,
  },
  bottomBar: {
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
});
