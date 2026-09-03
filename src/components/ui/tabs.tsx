import React from 'react';
import { View, Text, Pressable, type ViewProps, type TextProps } from 'react-native';

type AnyViewProps = ViewProps & { [key: string]: any };
type AnyTextProps = TextProps & { [key: string]: any };

export const Tabs: React.FC<AnyViewProps> = (props) => <View {...props} />;
export const TabsList: React.FC<AnyViewProps> = (props) => (
  <View {...props} style={[{ flexDirection: 'row', flexWrap: 'wrap' }, props.style]} />
);
export const TabsTrigger: React.FC<AnyViewProps> = (props) => <Pressable {...props} />;
export const TabsContent: React.FC<AnyViewProps> = (props) => <View {...props} />;
export const TabsTriggerText: React.FC<AnyTextProps> = (props) => <Text {...props} />;
export const TabsIndicator: React.FC<AnyViewProps> = (props) => <View {...props} />;
