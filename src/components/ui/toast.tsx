import { View, Text } from 'react-native';

export interface ToastProps {
  message?: string;
  action?: 'success' | 'error';
  nativeID?: string;
  children?: React.ReactNode;
}

export function Toast({ message, children }: ToastProps) {
  return (
    <View>
      {message ? <Text>{message}</Text> : children}
    </View>
  );
}

export function ToastDescription({ children }: { children: React.ReactNode }) {
  return <Text>{children}</Text>;
}

export function ToastTitle({ children }: { children: React.ReactNode }) {
  return <Text>{children}</Text>;
}

export interface UseToastReturn {
  show: (options: {
    placement?: string;
    duration?: number;
    render?: (props: { id: string }) => React.ReactNode;
  }) => void;
}

export function useToast(): UseToastReturn {
  return {
    show: () => {},
  };
}
