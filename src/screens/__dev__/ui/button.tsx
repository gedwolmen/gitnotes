import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { Pressable, type PressableProps } from 'react-native';
import { cn } from '../lib/utils';

const buttonVariants = cva(
  'items-center justify-center rounded-md active:opacity-80',
  {
    variants: {
      variant: {
        default: 'bg-primary',
        destructive: 'bg-error',
        outline: 'border border-border bg-surface',
        secondary: 'bg-surface-secondary',
        ghost: 'bg-transparent',
        link: 'bg-transparent',
      },
      size: {
        default: 'h-11 px-5',
        sm: 'h-9 px-3',
        lg: 'h-14 px-6',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

interface ButtonProps extends PressableProps, VariantProps<typeof buttonVariants> {
  className?: string;
  testID?: string;
}

const Button = React.forwardRef<React.ComponentRef<typeof Pressable>, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <Pressable
        ref={ref}
        className={cn(buttonVariants({ variant, size, className }))}
        testID={props.testID}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button, buttonVariants, type ButtonProps };
