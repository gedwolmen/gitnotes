export interface Account {
  id: string;
  name: string;
  email?: string;
  provider: string;
}

export const useActiveAccount = () => {
  return {
    activeAccount: null as Account | null,
    accounts: [] as Account[],
  };
};
