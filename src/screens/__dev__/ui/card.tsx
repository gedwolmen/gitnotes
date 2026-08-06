import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';
import { cn } from '../lib/utils';

const Card = React.forwardRef<React.ComponentRef<typeof View>, ViewProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn('rounded-lg border border-border bg-card', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn('flex flex-col gap-2 p-4', className)} {...props} />
);

const CardTitle = ({ className, ...props }: TextProps & { className?: string }) => (
  <Text className={cn('text-lg font-semibold leading-none tracking-tight text-text', className)} {...props} />
);

const CardContent = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn('p-4 pt-0', className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardContent };
