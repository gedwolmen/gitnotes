import { requireNativeModule, type EventSubscription } from 'expo-modules-core';
import type { GitEngineModule } from './GitEngine.types';

export type NativeGitEngine = GitEngineModule & {
  addListener(eventName: string, listener: (...args: unknown[]) => void): EventSubscription;
  removeListeners(eventName: string): void;
};

export default requireNativeModule<NativeGitEngine>('GitEngine');
