import { create } from 'zustand';

// Stub for missing auth modules
interface Account {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
}

interface Credential {
  kind: string;
  username?: string;
  token?: string;
}

const AccountService = {
  listAccounts: async () => [] as Account[],
  getActiveAccountId: async () => null as string | null,
  setActiveAccountId: async (_id: string | null) => {},
  updateAccount: async (_id: string, _patch: { name?: string; email?: string | null }) => {},
  deleteAccount: async (_id: string) => {},
  setCredential: async (_accountId: string, _credential: Credential) => {},
};

interface AccountState {
  accounts: Account[];
  activeAccountId: string | null;
  loaded: boolean;
  load: () => Promise<void>;
  addAccount: (account: Account) => Promise<void>;
  updateAccount: (id: string, patch: { name?: string; email?: string | null }) => Promise<void>;
  removeAccount: (id: string) => Promise<void>;
  setActiveAccount: (id: string | null) => Promise<void>;
  setCredential: (accountId: string, credential: Credential) => Promise<void>;
}

export const useAccountStore = create<AccountState>((set, get) => ({
  accounts: [],
  activeAccountId: null,
  loaded: false,

  async load() {
    const [accounts, activeAccountId] = await Promise.all([
      AccountService.listAccounts(),
      AccountService.getActiveAccountId(),
    ]);
    set({ accounts, activeAccountId, loaded: true });
  },

  async addAccount(account) {
    set({ accounts: [...get().accounts, account] });
    if (!get().activeAccountId) {
      await AccountService.setActiveAccountId(account.id);
      set({ activeAccountId: account.id });
    }
  },

  async updateAccount(id, patch) {
    await AccountService.updateAccount(id, patch);
    set({
      accounts: get().accounts.map((account) =>
        account.id === id ? { ...account, ...patch } : account,
      ),
    });
  },

  async removeAccount(id) {
    await AccountService.deleteAccount(id);
    const accounts = get().accounts.filter((account) => account.id !== id);
    const nextActive = get().activeAccountId === id ? (accounts[0]?.id ?? null) : get().activeAccountId;
    if (nextActive !== get().activeAccountId) {
      await AccountService.setActiveAccountId(nextActive);
    }
    set({ accounts, activeAccountId: nextActive });
  },

  async setActiveAccount(id) {
    await AccountService.setActiveAccountId(id);
    set({ activeAccountId: id });
  },

  async setCredential(accountId, credential) {
    await AccountService.setCredential(accountId, credential);
  },
}));
