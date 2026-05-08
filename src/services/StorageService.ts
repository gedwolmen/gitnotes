import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note, NoteCreateInput, NoteUpdateInput, createNote, updateNote } from '../models/Note';
import { Folder, FolderCreateInput, createFolder, updateFolder } from '../models/Folder';
import { GitRepository } from './GitService';
import { Todo, TodoCreateInput, TodoUpdateInput, createTodoItem, applyTodoUpdate } from '../models/Todo';
import { Canvas, CanvasCreateInput, CanvasUpdateInput, createCanvas, updateCanvas } from '../models/Canvas';
import { NOTE_INDEX_KEY, noteKey, getBootValue } from './StorageBootstrap';
import type { NoteTemplate } from './TemplateService';

const TODOS_STORAGE_KEY = '@gitnotes:todos';
const CANVASES_STORAGE_KEY = '@gitnotes:canvases';
const CANVASES_BACKUP_STORAGE_KEY = '@gitnotes:canvases.bak';
const LEGACY_NOTES_KEY = '@gitnotes:notes';
const REPOS_STORAGE_KEY = '@gitnotes:repos';
const FOLDERS_STORAGE_KEY = '@gitnotes:folders';
const CUSTOM_TEMPLATES_STORAGE_KEY = '@gitnotes:templates';
const TEMPLATE_PINS_STORAGE_KEY = '@gitnotes:template-pins';

let migrationDone = false;

async function migrateFromBlob(): Promise<void> {
  if (migrationDone) return;
  migrationDone = true;

  const indexRaw = await AsyncStorage.getItem(NOTE_INDEX_KEY);
  if (indexRaw !== null) return;

  const legacyRaw = getBootValue('@gitnotes:notes') ?? await AsyncStorage.getItem(LEGACY_NOTES_KEY);
  if (!legacyRaw) return;

  try {
    const notes: Note[] = JSON.parse(legacyRaw);
    if (!Array.isArray(notes) || notes.length === 0) return;

    const pairs: [string, string][] = notes.map((n) => [noteKey(n.id), JSON.stringify(n)]);
    await AsyncStorage.multiSet(pairs);
    await AsyncStorage.setItem(NOTE_INDEX_KEY, JSON.stringify(notes.map((n) => n.id)));
    await AsyncStorage.removeItem(LEGACY_NOTES_KEY);
  } catch (e) {
    console.error('Note blob migration failed:', e);
  }
}

export class StorageService {
  private static canvasWriteQueue: Promise<void> = Promise.resolve();

  private static enqueueCanvasWrite<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.canvasWriteQueue.catch(() => undefined).then(operation);
    this.canvasWriteQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private static async readAllCanvasesRaw(): Promise<Canvas[]> {
    try {
      const boot = getBootValue('@gitnotes:canvases');
      const json = boot ?? await AsyncStorage.getItem(CANVASES_STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (error) {
      console.error('Error reading canvases from storage:', error);
      return [];
    }
  }

  private static async backupCanvasBlob(): Promise<void> {
    const current = await AsyncStorage.getItem(CANVASES_STORAGE_KEY);
    if (current !== null) {
      await AsyncStorage.setItem(CANVASES_BACKUP_STORAGE_KEY, current);
    }
  }

  static async mutateCanvases<T>(mutator: (canvases: Canvas[]) => Promise<T> | T): Promise<T> {
    return this.enqueueCanvasWrite(async () => {
      const canvases = await this.readAllCanvasesRaw();
      const result = await mutator(canvases);
      try {
        await this.backupCanvasBlob();
        await AsyncStorage.setItem(CANVASES_STORAGE_KEY, JSON.stringify(canvases));
      } catch (error) {
        console.error('Error saving canvases to storage:', error);
        throw error;
      }
      return result;
    });
  }

  static async getAllNotes(): Promise<Note[]> {
    await migrateFromBlob();
    try {
      const indexRaw = await AsyncStorage.getItem(NOTE_INDEX_KEY);
      if (!indexRaw) return [];
      const ids: string[] = JSON.parse(indexRaw);
      if (ids.length === 0) return [];

      const pairs = await AsyncStorage.multiGet(ids.map(noteKey));
      const notes: Note[] = [];
      for (const [, raw] of pairs) {
        if (raw) {
          try { notes.push(JSON.parse(raw)); } catch (error) { void error; /* skip corrupt */ }
        }
      }
      return notes;
    } catch (error) {
      console.error('Error reading notes from storage:', error);
      return [];
    }
  }

  private static async saveNoteIndex(ids: string[]): Promise<void> {
    await AsyncStorage.setItem(NOTE_INDEX_KEY, JSON.stringify(ids));
  }

  static async saveAllNotes(notes: Note[]): Promise<void> {
    await migrateFromBlob();
    try {
      if (notes.length > 0) {
        const pairs: [string, string][] = notes.map((n) => [noteKey(n.id), JSON.stringify(n)]);
        await AsyncStorage.multiSet(pairs);
      }
      await this.saveNoteIndex(notes.map((n) => n.id));
    } catch (error) {
      console.error('Error saving notes to storage:', error);
      throw error;
    }
  }

  static async getNoteById(id: string): Promise<Note | null> {
    await migrateFromBlob();
    try {
      const raw = await AsyncStorage.getItem(noteKey(id));
      return raw ? JSON.parse(raw) : null;
    } catch (error) {
      console.error('Error getting note by id:', error);
      return null;
    }
  }

  static async createNote(input: NoteCreateInput): Promise<Note> {
    await migrateFromBlob();
    const newNote = createNote(input);
    await AsyncStorage.setItem(noteKey(newNote.id), JSON.stringify(newNote));

    const indexRaw = await AsyncStorage.getItem(NOTE_INDEX_KEY);
    const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
    ids.push(newNote.id);
    await this.saveNoteIndex(ids);
    return newNote;
  }

  static async updateNote(input: NoteUpdateInput): Promise<Note | null> {
    await migrateFromBlob();
    const raw = await AsyncStorage.getItem(noteKey(input.id));
    if (!raw) return null;

    const existing: Note = JSON.parse(raw);
    const updatedNote = updateNote(existing, input);
    await AsyncStorage.setItem(noteKey(input.id), JSON.stringify(updatedNote));
    return updatedNote;
  }

  static async deleteNote(id: string): Promise<boolean> {
    await migrateFromBlob();
    try {
      const indexRaw = await AsyncStorage.getItem(NOTE_INDEX_KEY);
      const ids: string[] = indexRaw ? JSON.parse(indexRaw) : [];
      if (!ids.includes(id)) return false;

      await AsyncStorage.removeItem(noteKey(id));
      await this.saveNoteIndex(ids.filter((i) => i !== id));
      return true;
    } catch (error) {
      console.error('Error deleting note:', error);
      return false;
    }
  }

  static async searchNotes(query: string): Promise<Note[]> {
    const notes = await this.getAllNotes();
    if (!query.trim()) return notes;

    const lowerQuery = query.toLowerCase();
    return notes.filter(
      (note) =>
        note.title.toLowerCase().includes(lowerQuery) ||
        note.content.toLowerCase().includes(lowerQuery) ||
        note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
    );
  }

  static async getNotesByRepo(repo: string): Promise<Note[]> {
    const notes = await this.getAllNotes();
    return notes.filter((note) => note.repo === repo);
  }

  static async clearAllNotes(): Promise<void> {
    await migrateFromBlob();
    try {
      const indexRaw = await AsyncStorage.getItem(NOTE_INDEX_KEY);
      if (indexRaw) {
        const ids: string[] = JSON.parse(indexRaw);
        await AsyncStorage.multiRemove(ids.map(noteKey));
      }
      await AsyncStorage.removeItem(NOTE_INDEX_KEY);
      await AsyncStorage.removeItem(LEGACY_NOTES_KEY);
    } catch (error) {
      console.error('Error clearing notes:', error);
      throw error;
    }
  }

  static async getSavedRepositories(): Promise<GitRepository[]> {
    try {
      const boot = getBootValue('@gitnotes:repos');
      const jsonValue = boot ?? await AsyncStorage.getItem(REPOS_STORAGE_KEY);
      if (jsonValue === null) return [];
      return JSON.parse(jsonValue);
    } catch (error) {
      console.error('Error reading repositories from storage:', error);
      return [];
    }
  }

  static async saveCustomTemplates(templates: NoteTemplate[]): Promise<void> {
    try {
      await AsyncStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(templates));
    } catch (error) {
      console.error('Error saving custom templates to storage:', error);
      throw error;
    }
  }

  static async loadCustomTemplates(): Promise<NoteTemplate[]> {
    try {
      const raw = await AsyncStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Error loading custom templates from storage:', error);
      return [];
    }
  }

  static async saveTemplatePins(pinIds: string[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TEMPLATE_PINS_STORAGE_KEY, JSON.stringify(pinIds));
    } catch (error) {
      console.error('Error saving template pins to storage:', error);
      throw error;
    }
  }

  static async loadTemplatePins(): Promise<string[]> {
    try {
      const raw = await AsyncStorage.getItem(TEMPLATE_PINS_STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('Error loading template pins from storage:', error);
      return [];
    }
  }

  static async saveRepositories(repos: GitRepository[]): Promise<void> {
    try {
      const jsonValue = JSON.stringify(repos);
      await AsyncStorage.setItem(REPOS_STORAGE_KEY, jsonValue);
    } catch (error) {
      console.error('Error saving repositories to storage:', error);
      throw error;
    }
  }

  static async addRepository(repo: GitRepository): Promise<void> {
    const repos = await this.getSavedRepositories();
    if (!repos.find((r) => r.path === repo.path)) {
      repos.push(repo);
      await this.saveRepositories(repos);
    }
  }

  static async removeRepository(path: string): Promise<void> {
    const repos = await this.getSavedRepositories();
    const filtered = repos.filter(r => r.path !== path);
    await this.saveRepositories(filtered);
  }

  /**
   * Drop every locally-cached note, canvas and todo whose `repo` matches
   * `path`. Called after a repo is removed from settings so the lists in
   * the UI stop showing ghost entries from a disconnected source.
   *
   * Local-only items (no `repo` field) are untouched; only remote-backed
   * records tied to the now-orphaned repo path are cleared.
   */
  static async purgeRepoData(path: string): Promise<void> {
    try {
      const notes = await this.getAllNotes();
      const survivingNotes = notes.filter((n) => n.repo !== path);
      if (survivingNotes.length !== notes.length) {
        const removedIds = notes
          .filter((n) => n.repo === path)
          .map((n) => noteKey(n.id));
        if (removedIds.length > 0) {
          await AsyncStorage.multiRemove(removedIds);
        }
        await this.saveNoteIndex(survivingNotes.map((n) => n.id));
      }
    } catch (error) {
      console.error('Error purging notes for repo:', error);
    }

    try {
      const todos = await this.getAllTodos();
      const survivingTodos = todos.filter((t) => t.repo !== path);
      if (survivingTodos.length !== todos.length) {
        await this.saveAllTodos(survivingTodos);
      }
    } catch (error) {
      console.error('Error purging todos for repo:', error);
    }

    try {
      await this.mutateCanvases((canvases) => {
        for (let i = canvases.length - 1; i >= 0; i--) {
          if (canvases[i].repo === path) canvases.splice(i, 1);
        }
      });
    } catch (error) {
      console.error('Error purging canvases for repo:', error);
    }
  }

  static async getAllFolders(): Promise<Folder[]> {
    try {
      const boot = getBootValue('@gitnotes:folders');
      const jsonValue = boot ?? await AsyncStorage.getItem(FOLDERS_STORAGE_KEY);
      if (jsonValue === null) return [];
      return JSON.parse(jsonValue);
    } catch (error) {
      console.error('Error reading folders from storage:', error);
      return [];
    }
  }

  static async saveAllFolders(folders: Folder[]): Promise<void> {
    try {
      const jsonValue = JSON.stringify(folders);
      await AsyncStorage.setItem(FOLDERS_STORAGE_KEY, jsonValue);
    } catch (error) {
      console.error('Error saving folders to storage:', error);
      throw error;
    }
  }

  static async getFolderById(id: string): Promise<Folder | null> {
    try {
      const folders = await this.getAllFolders();
      return folders.find((folder) => folder.id === id) || null;
    } catch (error) {
      console.error('Error getting folder by id:', error);
      return null;
    }
  }

  static async createFolder(input: FolderCreateInput): Promise<Folder> {
    const folders = await this.getAllFolders();
    const newFolder = createFolder(input, folders);
    folders.push(newFolder);
    await this.saveAllFolders(folders);
    return newFolder;
  }

  static async updateFolder(id: string, input: Partial<FolderCreateInput>): Promise<Folder | null> {
    const folders = await this.getAllFolders();
    const index = folders.findIndex((folder) => folder.id === id);
    if (index === -1) return null;

    const updatedFolder = updateFolder(folders[index], input);
    folders[index] = updatedFolder;
    await this.saveAllFolders(folders);
    return updatedFolder;
  }

  static async deleteFolder(id: string): Promise<boolean> {
    try {
      const folders = await this.getAllFolders();
      const filteredFolders = folders.filter((folder) => folder.id !== id);
      if (filteredFolders.length === folders.length) return false;
      await this.saveAllFolders(filteredFolders);
      return true;
    } catch (error) {
      console.error('Error deleting folder:', error);
      return false;
    }
  }

  static async getNotesByFolder(folderPath: string): Promise<Note[]> {
    const notes = await this.getAllNotes();
    return notes.filter((note) => note.folderPath === folderPath);
  }

  static async moveNoteToFolder(noteId: string, folderPath: string | undefined): Promise<Note | null> {
    return this.updateNote({ id: noteId, folderPath });
  }

  static async clearAllFolders(): Promise<void> {
    try {
      await AsyncStorage.removeItem(FOLDERS_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing folders:', error);
      throw error;
    }
  }

  static async getAllTodos(): Promise<Todo[]> {
    try {
      const boot = getBootValue('@gitnotes:todos');
      const json = boot ?? await AsyncStorage.getItem(TODOS_STORAGE_KEY);
      return json ? JSON.parse(json) : [];
    } catch (error) { void error;
      return [];
    }
  }

  static async saveAllTodos(todos: Todo[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TODOS_STORAGE_KEY, JSON.stringify(todos));
    } catch (error) {
      console.error('Error saving todos to storage:', error);
      throw error;
    }
  }

  static async createTodo(input: TodoCreateInput): Promise<Todo> {
    const todos = await this.getAllTodos();
    const todo = createTodoItem(input);
    todos.unshift(todo);
    await this.saveAllTodos(todos);
    return todo;
  }

  static async updateTodo(input: TodoUpdateInput): Promise<Todo | null> {
    const todos = await this.getAllTodos();
    const idx = todos.findIndex((t) => t.id === input.id);
    if (idx === -1) return null;
    todos[idx] = applyTodoUpdate(todos[idx], input);
    await this.saveAllTodos(todos);
    return todos[idx];
  }

  static async deleteTodo(id: string): Promise<boolean> {
    const todos = await this.getAllTodos();
    const filtered = todos.filter((t) => t.id !== id);
    if (filtered.length === todos.length) return false;
    await this.saveAllTodos(filtered);
    return true;
  }

  static async getAllCanvases(): Promise<Canvas[]> {
    await this.canvasWriteQueue;
    return this.readAllCanvasesRaw();
  }

  static async saveAllCanvases(canvases: Canvas[]): Promise<void> {
    await this.enqueueCanvasWrite(async () => {
      try {
        await this.backupCanvasBlob();
        await AsyncStorage.setItem(CANVASES_STORAGE_KEY, JSON.stringify(canvases));
      } catch (error) {
        console.error('Error saving canvases to storage:', error);
        throw error;
      }
    });
  }

  static async getCanvasById(id: string): Promise<Canvas | null> {
    const canvases = await this.getAllCanvases();
    return canvases.find((c) => c.id === id) || null;
  }

  static async createCanvas(input: CanvasCreateInput): Promise<Canvas> {
    return this.mutateCanvases((canvases) => {
      const newCanvas = createCanvas(input);
      canvases.push(newCanvas);
      return newCanvas;
    });
  }

  static async updateCanvas(input: CanvasUpdateInput): Promise<Canvas | null> {
    return this.mutateCanvases((canvases) => {
      const idx = canvases.findIndex((c) => c.id === input.id);
      if (idx === -1) return null;
      canvases[idx] = updateCanvas(canvases[idx], input);
      return canvases[idx];
    });
  }

  static async deleteCanvas(id: string): Promise<boolean> {
    return this.mutateCanvases((canvases) => {
      const idx = canvases.findIndex((c) => c.id === id);
      if (idx === -1) return false;
      canvases.splice(idx, 1);
      return true;
    });
  }
}
