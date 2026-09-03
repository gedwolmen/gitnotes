// Stub for missing manualSync module
export interface ManualSync {
  trigger(): Promise<void>;
}

export const manualSync: ManualSync = {
  trigger: async () => {},
};
