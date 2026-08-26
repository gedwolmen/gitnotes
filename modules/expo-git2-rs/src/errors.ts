/**
 * Error types for native git2-rs protocol.
 *
 * GPL-3.0 derivative of GitSync.
 */

export class NativeProtocolError extends Error {
  readonly kind = 'NativeProtocolError';
  constructor(message: string) {
    super(message);
    this.name = 'NativeProtocolError';
  }
}

export class NativeInvocationError extends Error {
  readonly kind = 'NativeInvocationError';
  constructor(message: string) {
    super(message);
    this.name = 'NativeInvocationError';
  }
}
