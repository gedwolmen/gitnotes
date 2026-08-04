import React from 'react';
import { View, Text, type ViewProps, type TextProps } from 'react-native';
import { cn } from '../lib/utils';

const Card = React.forwardRef<React.ComponentRef<typeof View>, ViewProps & { className?: string }>(
  ({ className, ...props }, ref) => (
    <View
      ref={ref}
      className={cn('rounded-xl border border-gray-200 bg-white shadow-sm', className)}
      {...props}
    />
  )
);
Card.displayName = 'Card';

const CardHeader = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn('flex flex-col space-y-1.5 p-6', className)} {...props} />
);

const CardTitle = ({ className, ...props }: TextProps & { className?: string }) => (
  <Text className={cn('text-lg font-semibold leading-none tracking-tight text-gray-900', className)} {...props} />
);

const CardContent = ({ className, ...props }: ViewProps & { className?: string }) => (
  <View className={cn('p-6 pt-0', className)} {...props} />
);

export { Card, CardHeader, CardTitle, CardContent };
