/**
 * Container store — manages repository containers.
 *
 * A container = a directory containing one or more Git repositories.
 * Users can organize repos into named containers.
 *
 * GPL-3.0 derivative of GitSync.
 */

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface RepositoryContainer {
  id: string;
  name: string;
  path: string;
  defaultBranch: string;
  createdAt: number;
}

const CONTAINER_KEY = '@git2:containers:v1';

export interface ContainerState {
  containers: RepositoryContainer[];
  addContainer(name: string, path: string, defaultBranch?: string): Promise<RepositoryContainer>;
  removeContainer(id: string): Promise<void>;
  getContainer(id: string): RepositoryContainer | undefined;
  hydrate(): Promise<void>;
}

export const useContainerStore = create<ContainerState>((set, get) => ({
  containers: [],

  async addContainer(name, path, defaultBranch = 'main') {
    const container: RepositoryContainer = {
      id: `container:${Date.now()}:${Math.random().toString(36).slice(2)}`,
      name,
      path,
      defaultBranch,
      createdAt: Date.now(),
    };
    const next = [...get().containers, container];
    await AsyncStorage.setItem(CONTAINER_KEY, JSON.stringify(next));
    set({ containers: next });
    return container;
  },

  async removeContainer(id) {
    const next = get().containers.filter((c) => c.id !== id);
    await AsyncStorage.setItem(CONTAINER_KEY, JSON.stringify(next));
    set({ containers: next });
  },

  getContainer(id) {
    return get().containers.find((c) => c.id === id);
  },

  async hydrate() {
    const raw = await AsyncStorage.getItem(CONTAINER_KEY);
    if (raw) {
      set({ containers: JSON.parse(raw) });
    }
  },
}));
