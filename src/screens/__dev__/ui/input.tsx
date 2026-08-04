import React from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { cn } from '../lib/utils';

const Input = React.forwardRef<React.ComponentRef<typeof TextInput>, TextInputProps & { className?: string }>(
  ({ className, ...props }, ref) => {
    return (
      <TextInput
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-base text-gray-900',
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = 'Input';

export { Input };
