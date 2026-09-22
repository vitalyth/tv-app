import React, { useEffect, useState } from 'react';
import { ApplicationShell } from './components/ApplicationShell';
import { LoadingScreen } from './components/LoadingScreen';

const MINIMUM_LOADING_TIME_MS = 900;

export function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const timeout = setTimeout(() => setReady(true), MINIMUM_LOADING_TIME_MS);
    return () => clearTimeout(timeout);
  }, []);

  if (!ready) {
    return <LoadingScreen />;
  }

  return <ApplicationShell />;
}

export default App;
