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
        destructive: 'bg-red-500',
        outline: 'border border-gray-300 bg-white',
        secondary: 'bg-gray-200',
        ghost: 'bg-transparent',
        link: 'bg-transparent',
      },
      size: {
        default: 'h-10 px-4',
        sm: 'h-8 px-3',
        lg: 'h-12 px-6',
        icon: 'h-10 w-10',
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
