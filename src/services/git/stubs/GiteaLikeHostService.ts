// Stub for missing GiteaLikeHostService module
export interface GiteaLikeHostService {
  isAuthenticated(): boolean;
}

export const stubGiteaLikeHostService: GiteaLikeHostService = {
  isAuthenticated: () => false,
};
