/**
 * Versioned, typed JSON contracts for Git host authentication.
 *
 * These contracts define the wire format for the mobile↔backend boundary.
 * They are versioned under /api/v1 and must not change in breaking ways.
 *
 * Exported modules:
 * - providers: Git host provider capabilities
 * - credentials: PAT classes (classic, fine-grained), SSH, expiry/refresh
 * - repository: canonical repo IDs, allowlists, access grants
 * - errors: stable error codes and ApiError shape
 *
 * Version: 1 (contracts v1 — /api/v1 namespace)
 */

// Re-export everything from sub-modules for the public API surface.
export * from './providers';
export * from './credentials';
export * from './repository';
export * from './errors';

/** API version prefix used in all contract types. */
export const API_VERSION = '/api/v1' as const;
