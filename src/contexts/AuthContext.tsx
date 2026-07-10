/**
 * @deprecated — re-export only. New code should import from `AccountsContext`.
 * The account/auth flow has moved to `AccountsContext`, which exposes the
 * full multi-host, multi-account surface. `useAuth()` is kept here so legacy
 * call sites continue to compile without changes.
 */
export {
  AccountsProvider,
  useAccounts,
  useAuth,
  useShouldShowAccountUI,
} from './AccountsContext';

export type { StoredAccount } from '../services/AccountStorage';
