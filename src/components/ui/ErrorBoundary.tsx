import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTheme } from '../../contexts/ThemeContext';

interface ErrorBoundaryProps {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
}

class ErrorBoundaryBase extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return <DefaultFallback onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

function DefaultFallback({ onRetry }: { onRetry: () => void }) {
  const { colors } = useTheme();

  return (
    <View className="items-center justify-center p-6 gap-3 min-h-[120px]">
      <Text className="text-base font-semibold text-center" style={{ color: colors.text }}>
        Something went wrong
      </Text>
      <Pressable
        onPress={onRetry}
        className="rounded-full px-4 py-2.5 bg-primary"
      >
        <Text className="text-sm font-semibold text-white">Retry</Text>
      </Pressable>
    </View>
  );
}

export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <ErrorBoundaryBase {...props} />;
}
