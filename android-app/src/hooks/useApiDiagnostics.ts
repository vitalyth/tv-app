import {useCallback, useEffect, useState} from 'react';
import {getLiveChannelCount} from '../api/channels';
import {initialDiagnosticState, type DiagnosticState} from '../state/diagnostics';

export function useApiDiagnostics() {
  const [state, setState] = useState<DiagnosticState>(initialDiagnosticState);
  const reload = useCallback(async () => {
    setState(initialDiagnosticState);
    try {
      const channelCount = await getLiveChannelCount();
      setState({apiStatus: 'connected', channelCount, errorMessage: null});
    } catch (error) {
      setState({
        apiStatus: 'error',
        channelCount: null,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);
  return {...state, reload};
}
