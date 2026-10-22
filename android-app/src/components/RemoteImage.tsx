import {useEffect, useState} from 'react';
import {Image, type ImageProps} from 'react-native';
import {getBundledChannelLogo} from './channelLogoAssets';

interface RemoteImageProps extends Omit<ImageProps, 'source'> {
  uri: string;
  fallbackUri?: string;
}

export function RemoteImage({uri, fallbackUri, ...props}: RemoteImageProps) {
  const [sourceUri, setSourceUri] = useState(uri);

  useEffect(() => {
    setSourceUri(uri);
  }, [fallbackUri, uri]);

  return (
    <Image
      {...props}
      source={getBundledChannelLogo(sourceUri) ?? {
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
