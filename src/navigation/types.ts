export type RootStackParamList = {
  MainTabs: undefined;
  NoteEditor: { noteId?: string; format?: 'markdown' | 'neorg' | 'org'; initialTitle?: string; initialContent?: string; repo?: string; branch?: string; folderPath?: string };
  NoteViewer: { noteId: string };
  PdfViewer: { owner: string; repo: string; branch?: string; path: string; title?: string };
  FileViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  ImageViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  VideoViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  CanvasEditor: { canvasId?: string; canvasWidth?: number; canvasHeight?: number; canvasTitle?: string };
  CanvasList: undefined;
};

export type BottomTabParamList = {
  HomeTab: undefined;
  NotesTab: undefined;
  ExploreTab: undefined;
  TodosTab: undefined;
  SettingsTab: undefined;
};

export type Note = {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  tags?: string[];
  repo?: string;
  branch?: string;
  commit?: string;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}