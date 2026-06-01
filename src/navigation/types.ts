import type { NavigatorScreenParams } from '@react-navigation/native';

type ProductionStackParamList = {
  MainTabs: NavigatorScreenParams<BottomTabParamList> | undefined;
  NoteEditor: { noteId?: string; format?: 'markdown' | 'neorg' | 'org'; initialTitle?: string; initialContent?: string; initialTags?: string[]; repo?: string; branch?: string; folderPath?: string; anchor?: string };
  NoteViewer: { noteId: string };
  PdfViewer: { owner: string; repo: string; branch?: string; path: string; title?: string };
  FileViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  ImageViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  VideoViewer: { owner: string; repo: string; branch?: string; path: string; title?: string; size?: number };
  CanvasEditor: { canvasId?: string; canvasWidth?: number; canvasHeight?: number; canvasTitle?: string };
  GraphView: undefined;
  ChatThreadList: undefined;
  ChatScreen: { threadId: string };
  RenderStyleSettings: undefined;
  RenderStyleEditor: { format: 'markdown' | 'org' | 'neorg' };
  TemplateManager: undefined;
  SyncStatus: undefined;
  ConflictResolver: { repoPath: string; branch: string; filePath: string };
};

type DevOnlyStackParamList = {
  NeumorphicGallery: undefined;
};

export type RootStackParamList = ProductionStackParamList & DevOnlyStackParamList;

export type BottomTabParamList = {
  HomeTab: undefined;
  NotesTab: undefined;
  ExploreTab: undefined;
  TodosTab: undefined;
  SettingsTab: undefined;
  CanvasList: undefined;
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
