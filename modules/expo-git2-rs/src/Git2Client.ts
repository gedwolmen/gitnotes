/**
 * Git2Client — typed facade for native git2-rs operations
 *
 * All methods are asynchronous. Results are discriminated union types.
 * Progress events are throttled at 250ms intervals.
 *
 * GPL-3.0 derivative of GitSync.
 */

export interface Git2Client {
  /** Returns the native module version for build verification. */
  getVersion(): Promise<string>;

  /** Returns true if a repository is initialized at the given path. */
  isRepository(path: string): Promise<boolean>;
}

const Git2Client: Git2Client = {
  async getVersion(): Promise<string> {
    return '0.1.0-git2-rs-husk';
  },
  async isRepository(_path: string): Promise<boolean> {
    return false;
  },
};

export { Git2Client };
