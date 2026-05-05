import React, { useCallback, useState } from 'react';
import { Text, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import JSZip from 'jszip';
import { useTheme } from '../../contexts/ThemeContext';
import { useNotes } from '../../contexts/NoteContext';
import { Group, GroupRow } from '../ui';
import { parseGoogleKeepTakeout } from '../../services/import/GoogleKeepImporter';
import { parseAppleNotesExport } from '../../services/import/AppleNotesImporter';
import { ImportedFile } from '../../services/import/types';
import { HapticService } from '../../utils/haptics';
import { isNoteColor } from '../../models/Note';

export function ImportSection() {
  const { colors } = useTheme();
  const { createNote } = useNotes();
  const [importing, setImporting] = useState<'google' | 'apple' | null>(null);
  const isImporting = importing !== null;

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
    setImporting('google');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        multiple: false,
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) {
        setImporting(null);
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
      setImporting(null);
    }
  }, [importNotes]);

  const handleImportAppleNotes = useCallback(async () => {
    setImporting('apple');
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/plain', 'text/html'],
        multiple: true,
        copyToCacheDirectory: true,
      });

      if (result.canceled || result.assets.length === 0) {
        setImporting(null);
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
      setImporting(null);
    }
  }, [importNotes]);

  return (
    <Group title="Import">
      <GroupRow
        onPress={isImporting ? undefined : handleImportGoogleKeep}
        disabled={isImporting}
        leading={<Ionicons name="logo-google" size={20} color={colors.text} />}
        trailing={importing === 'google' ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
      >
        <Text style={{ fontSize: 16, color: colors.text }}>Import from Google Keep</Text>
      </GroupRow>
      <GroupRow
        onPress={isImporting ? undefined : handleImportAppleNotes}
        disabled={isImporting}
        leading={<Ionicons name="logo-apple" size={20} color={colors.text} />}
        trailing={importing === 'apple' ? <ActivityIndicator size="small" color={colors.primary} /> : <Ionicons name="chevron-forward" size={20} color={colors.textSecondary} />}
      >
        <Text style={{ fontSize: 16, color: colors.text }}>Import from Apple Notes</Text>
      </GroupRow>
    </Group>
  );
}
