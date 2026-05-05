import React, { useCallback, useState } from 'react';
import { Text, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotes } from '../../contexts/NoteContext';
import { Group, GroupRow } from '../ui';
import { parseGoogleKeepTakeout } from '../../services/import/GoogleKeepImporter';
import { parseAppleNotesExport } from '../../services/import/AppleNotesImporter';
import { ImportedFile } from '../../services/import/types';
import { HapticService } from '../../utils/haptics';
import { isNoteColor } from '../../models/Note';

// Native modules required by import flows. We require() them lazily inside
// the click handlers so a dev client built before these deps were added (or
// any future native-module mismatch) surfaces a single Alert from the import
// button instead of crashing the whole Settings tab — when the module fails
// to resolve at top-level import, every consumer of ImportSection blows up
// with `Cannot read property 'ImportSection' of undefined`.
type DocumentPickerModule = typeof import('expo-document-picker');
type FileSystemModule = typeof import('expo-file-system/legacy');
type JSZipCtor = typeof import('jszip');

function loadDocumentPicker(): DocumentPickerModule | null {
  try {
    return require('expo-document-picker');
  } catch {
    return null;
  }
}

function loadFileSystem(): FileSystemModule | null {
  try {
    return require('expo-file-system/legacy');
  } catch {
    return null;
  }
}

function loadJSZip(): JSZipCtor | null {
  try {
    return require('jszip');
  } catch {
    return null;
  }
}

const REBUILD_HINT =
  'Rebuild the dev client (`yarn ios` / `yarn android`) to pick up the import deps.';

export function ImportSection() {
  const { colors } = useTheme();
  const { createNote } = useNotes();
  const [isImporting, setIsImporting] = useState(false);

  const importNotes = useCallback(async (importedNotes: Awaited<ReturnType<typeof parseGoogleKeepTakeout>>) => {
    let created = 0;
    let failed = 0;
    for (const note of importedNotes) {
      try {
        const color = note.color && isNoteColor(note.color) ? note.color : undefined;
        await createNote({
          title: note.title,
          content: note.content,
          tags: note.tags,
          color: color ?? null,
          isPinned: note.pinned,
          format: 'markdown',
        });
        created++;
      } catch {
        failed++;
      }
    }
    return { created, failed };
  }, [createNote]);

  const handleImportGoogleKeep = useCallback(async () => {
    const DocumentPicker = loadDocumentPicker();
    const FileSystem = loadFileSystem();
    const JSZip = loadJSZip();
    if (!DocumentPicker || !FileSystem || !JSZip) {
      Alert.alert('Import unavailable', REBUILD_HINT);
      return;
    }

    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) {
        setIsImporting(false);
        return;
      }

      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const zip = await JSZip.loadAsync(fileContent, { base64: true });

      const files: ImportedFile[] = [];
      const fileNames = Object.keys(zip.files);
      for (const name of fileNames) {
        if (zip.files[name].dir) continue;
        const content = await zip.files[name].async('string');
        const baseName = name.split('/').pop() || name;
        files.push({ name: baseName, content, relativePath: name });
      }

      const importedNotes = parseGoogleKeepTakeout(files);
      if (importedNotes.length === 0) {
        Alert.alert('No Notes Found', 'Could not find any Google Keep notes in the selected file.');
        return;
      }

      const { created, failed } = await importNotes(importedNotes);

      if (failed === 0) {
        HapticService.success();
        Alert.alert('Import Complete', `Imported ${created} note(s) from Google Keep.`);
      } else {
        HapticService.error();
        Alert.alert('Import Finished', `Imported ${created} note(s); ${failed} failed.`);
      }
    } catch (e: unknown) {
      HapticService.error();
      Alert.alert('Import Failed', e instanceof Error ? e.message : 'Could not import from Google Keep.');
    } finally {
      setIsImporting(false);
    }
  }, [importNotes]);

  const handleImportAppleNotes = useCallback(async () => {
    const DocumentPicker = loadDocumentPicker();
    const FileSystem = loadFileSystem();
    if (!DocumentPicker || !FileSystem) {
      Alert.alert('Import unavailable', REBUILD_HINT);
      return;
    }

    setIsImporting(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/html'],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) {
        setIsImporting(false);
        return;
      }

      const files: ImportedFile[] = [];
      for (const doc of result.assets) {
        const content = await FileSystem.readAsStringAsync(doc.uri);
        const name = doc.name || doc.uri.split('/').pop() || 'Untitled';
        files.push({ name, content });
      }

      const importedNotes = parseAppleNotesExport(files);
      if (importedNotes.length === 0) {
        Alert.alert('No Notes Found', 'Could not find any Apple Notes in the selected files.');
        return;
      }

      const { created, failed } = await importNotes(importedNotes);

      if (failed === 0) {
        HapticService.success();
        Alert.alert('Import Complete', `Imported ${created} note(s) from Apple Notes.`);
      } else {
        HapticService.error();
        Alert.alert('Import Finished', `Imported ${created} note(s); ${failed} failed.`);
      }
    } catch (e: unknown) {
      HapticService.error();
      Alert.alert('Import Failed', e instanceof Error ? e.message : 'Could not import from Apple Notes.');
    } finally {
      setIsImporting(false);
    }
  }, [importNotes]);

  return (
    <Group title="Import">
      <GroupRow
        onPress={isImporting ? undefined : handleImportGoogleKeep}
        disabled={isImporting}
        leading={<Ionicons name="logo-google" size={20} color={colors.text} />}
        trailing={isImporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
      >
        <Text style={{ fontSize: 16, color: colors.text }}>Import from Google Keep</Text>
      </GroupRow>
      <GroupRow
        onPress={isImporting ? undefined : handleImportAppleNotes}
        disabled={isImporting}
        leading={<Ionicons name="document-text-outline" size={20} color={colors.text} />}
        trailing={isImporting ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
      >
        <Text style={{ fontSize: 16, color: colors.text }}>Import from Apple Notes</Text>
      </GroupRow>
    </Group>
  );
}
