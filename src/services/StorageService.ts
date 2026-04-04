import AsyncStorage from '@react-native-async-storage/async-storage';
import { Note, NoteCreateInput, NoteUpdateInput, createNote, updateNote } from '../models/Note';
import { GitRepository } from './GitService';

const NOTES_STORAGE_KEY = '@gitnotes:notes';
const REPOS_STORAGE_KEY = '@gitnotes:repos';

export class StorageService {
  static async getAllNotes(): Promise<Note[]> {
    try {
      const jsonValue = await AsyncStorage.getItem(NOTES_STORAGE_KEY);
      if (jsonValue === null) return [];
      const notes: Note[] = JSON.parse(jsonValue);
      return notes;
    } catch (error) {
      console.error('Error reading notes from storage:', error);
      return [];
    }
  }

  static async saveAllNotes(notes: Note[]): Promise<void> {
    try {
      const jsonValue = JSON.stringify(notes);
      await AsyncStorage.setItem(NOTES_STORAGE_KEY, jsonValue);
    } catch (error) {
      console.error('Error saving notes to storage:', error);
      throw error;
    }
  }

  static async getNoteById(id: string): Promise<Note | null> {
    try {
      const notes = await this.getAllNotes();
      return notes.find((note) => note.id === id) || null;
    } catch (error) {
      console.error('Error getting note by id:', error);
      return null;
    }
  }

  static async createNote(input: NoteCreateInput): Promise<Note> {
    const notes = await this.getAllNotes();
    const newNote = createNote(input);
    notes.push(newNote);
    await this.saveAllNotes(notes);
    return newNote;
  }

  static async updateNote(input: NoteUpdateInput): Promise<Note | null> {
    const notes = await this.getAllNotes();
    const index = notes.findIndex((note) => note.id === input.id);
    if (index === -1) return null;

    const updatedNote = updateNote(notes[index], input);
    notes[index] = updatedNote;
    await this.saveAllNotes(notes);
    return updatedNote;
  }

  static async deleteNote(id: string): Promise<boolean> {
    try {
      const notes = await this.getAllNotes();
      const filteredNotes = notes.filter((note) => note.id !== id);
      if (filteredNotes.length === notes.length) return false;
      await this.saveAllNotes(filteredNotes);
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
    try {
      await AsyncStorage.removeItem(NOTES_STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing notes:', error);
      throw error;
    }
  }

  static async getSavedRepositories(): Promise<GitRepository[]> {
    try {
      const jsonValue = await AsyncStorage.getItem(REPOS_STORAGE_KEY);
      if (jsonValue === null) return [];
      return JSON.parse(jsonValue);
    } catch (error) {
      console.error('Error reading repositories from storage:', error);
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
}
