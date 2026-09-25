import {useEffect, useState} from 'react';
import {Image, type ImageProps} from 'react-native';

interface RemoteImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
  fallbackUri?: string;
}

function sanitizeImageUri(uri: string, fallbackUri?: string): string {
  if (uri && uri.toLowerCase().includes('.svg')) {
    if (fallbackUri && !fallbackUri.toLowerCase().includes('.svg')) {
      return fallbackUri;
    }
    return uri.replace(/\.svg(\?.*)?$/i, '.png$1');
  }
  return uri;
}

export function RemoteImage({uri, fallbackUri, ...props}: RemoteImageProps) {
  const [sourceUri, setSourceUri] = useState(() =>
    sanitizeImageUri(uri, fallbackUri),
  );

  useEffect(() => {
    setSourceUri(sanitizeImageUri(uri, fallbackUri));
  }, [fallbackUri, uri]);

  return (
    <Image
      {...props}
      source={{
        uri: sourceUri,
        headers: {'User-Agent': 'okhttp/4.12.0'},
      }}
      onError={e => {
        if (fallbackUri && sourceUri !== fallbackUri) {
          setSourceUri(fallbackUri);
        } else {
          props.onError?.(e);
        }
      }}
    />
  );
}
