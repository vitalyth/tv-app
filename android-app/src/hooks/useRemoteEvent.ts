import {useState} from 'react';
import {useTVEventHandler} from 'react-native';

export function useRemoteEvent(): string {
  const [lastEvent, setLastEvent] = useState('');
  useTVEventHandler(event => {
    if (event?.eventType) {
      setLastEvent(event.eventType);
    }
  });
  return lastEvent;
}
