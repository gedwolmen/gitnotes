export interface CloneProgress {
  phase: string;
  loaded: number;
  total: number;
}

export type CloneProgressCallback = (progress: CloneProgress) => void;

export interface ProgressLine {
  id: string;
  text: string;
  tone: 'info' | 'success' | 'error';
  time: number;
}
