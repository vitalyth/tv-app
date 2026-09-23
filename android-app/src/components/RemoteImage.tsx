import {useEffect, useState} from 'react';
import {Image, type ImageProps} from 'react-native';

interface RemoteImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
  fallbackUri?: string;
}

export function RemoteImage({uri, fallbackUri, ...props}: RemoteImageProps) {
  const [sourceUri, setSourceUri] = useState(uri);

  useEffect(() => setSourceUri(uri), [uri]);

  return (
    <Image
      {...props}
      source={{
        uri: sourceUri,
        headers: {'User-Agent': 'okhttp/4.12.0'},
      }}
      onError={() => {
        if (fallbackUri && sourceUri !== fallbackUri) {
          setSourceUri(fallbackUri);
        }
      }}
    />
  );
}
