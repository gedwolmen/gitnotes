import React, { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { SvgUri } from 'react-native-svg';

interface SvgImageProps {
  uri: string;
  width?: number;
  height?: number;
  tintColor?: string;
  isDark: boolean;
}

const isSvgUri = (uri: string) => /\.svg(?:[?#].*)?$/i.test(uri);

export default function SvgImage({ uri, width, height, tintColor, isDark }: SvgImageProps) {
  const [hasError, setHasError] = useState(false);

  const handleError = useCallback(() => {
    setHasError(true);
  }, []);

  if (!isSvgUri(uri)) {
    return <Image source={{ uri }} style={[styles.image, width ? { width } : null, height ? { height } : null]} />;
  }

  if (hasError) {
    return (
      <View style={[styles.errorContainer, width ? { width } : null, height ? { height } : null]}>
        <Text style={styles.errorText}>Failed to load SVG</Text>
      </View>
    );
  }

  return (
    <SvgUri
      uri={uri}
      width={width}
      height={height}
      color={isDark ? tintColor : undefined}
      onError={handleError}
    />
  );
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'contain',
  },
  errorContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    fontSize: 12,
  },
});
