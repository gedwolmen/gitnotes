// Stub for missing activeHost module
export interface ActiveHost {
  getCurrent(): string | null;
  setCurrent(hostId: string): void;
}

export const activeHost: ActiveHost = {
  getCurrent: () => null,
  setCurrent: () => {},
};
