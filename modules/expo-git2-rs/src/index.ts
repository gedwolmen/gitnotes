/**
 * expo-git2-rs — Native Git operations via git2-rs
 *
 * This module provides typed native Git operations for Expo/React Native.
 * All operations are asynchronous and emit progress events.
 *
 * GPL-3.0 derivative of GitSync (https://github.com/ViscousPot/GitSync)
 * Pinned upstream commit: 9b3ef2e4d0f3f21d3e11755aa9bf6583ad808d7a
 */

export * from './types';
export { Git2Client } from './Git2Client';
export { NativeProtocolError, NativeInvocationError } from './errors';
