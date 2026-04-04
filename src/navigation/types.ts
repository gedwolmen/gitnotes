export type RootStackParamList = {
  MainTabs: undefined;
  NoteEditor: { noteId?: string };
  NoteViewer: { noteId: string };
};

export type BottomTabParamList = {
  HomeTab: undefined;
  NotesTab: undefined;
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