import { useEffect } from 'react';

declare const require: (moduleName: string) => any;

const FOREGROUND_PLAYBACK_TIMEOUT_SECONDS = 6 * 60 * 60;

const {
  LIFESPAN_POLICY,
  useSetLifespanCallback,
  useSetTimeoutCallback,
} = require('@amazon-devices/react-native-kepler/Libraries/TimeoutManager');

let userEngagementModule: {
  startVideoEngagement?: () => boolean;
  stopVideoEngagement?: () => boolean;
} | null = null;
let didResolveUserEngagementModule = false;

function getUserEngagementModule() {
  if (didResolveUserEngagementModule) {
    return userEngagementModule;
  }

  didResolveUserEngagementModule = true;
  try {
    userEngagementModule = require('@tvapp/vega-user-engagement');
  } catch {
    userEngagementModule = null;
  }

  return userEngagementModule;
}

function startVideoEngagement() {
  try {
    getUserEngagementModule()?.startVideoEngagement?.();
  } catch {
    // The timeout APIs below are still useful if the native engagement module is unavailable.
  }
}

function stopVideoEngagement() {
  try {
    getUserEngagementModule()?.stopVideoEngagement?.();
  } catch {
    // Best effort cleanup only.
  }
}

export function useForegroundPlaybackTimeout(enabled: boolean) {
  const setForegroundTimeout = useSetTimeoutCallback();
  const setForegroundLifespan = useSetLifespanCallback();

  useEffect(() => {
    if (!enabled) {
      stopVideoEngagement();
      setForegroundTimeout(0);
      setForegroundLifespan(LIFESPAN_POLICY.SHORT);
      return;
    }

    startVideoEngagement();
    setForegroundTimeout(FOREGROUND_PLAYBACK_TIMEOUT_SECONDS);
    setForegroundLifespan(LIFESPAN_POLICY.PERMANENT);

    return () => {
      stopVideoEngagement();
      setForegroundTimeout(0);
      setForegroundLifespan(LIFESPAN_POLICY.SHORT);
    };
  }, [enabled, setForegroundLifespan, setForegroundTimeout]);
}
