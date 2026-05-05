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
    setIsImporting(true);
    try {
      const DocumentPicker = require('react-native-document-picker').default;
      const result = await DocumentPicker.pick({
        type: [DocumentPicker.types.zip],
        allowMultiSelection: false,
      });

      if (!result || result.length === 0) {
        setIsImporting(false);
        return;
      }

      const RNFS = require('react-native-fs');
      const { default: JSZip } = require('jszip');

      const fileContent = await RNFS.readFile(result[0].uri, 'base64');
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
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'DOCUMENT_PICKER_CANCELED') {
        return;
      }
      HapticService.error();
      Alert.alert('Import Failed', e instanceof Error ? e.message : 'Could not import from Google Keep.');
    } finally {
      setIsImporting(false);
    }
  }, [importNotes]);

  const handleImportAppleNotes = useCallback(async () => {
    setIsImporting(true);
    try {
      const DocumentPicker = require('react-native-document-picker').default;
      const result = await DocumentPicker.pick({
        type: ['text/plain', 'text/html', 'public.plain-text', 'public.html'],
        allowMultiSelection: true,
      });

      if (!result || result.length === 0) {
        setIsImporting(false);
        return;
      }

      const RNFS = require('react-native-fs');

      const files: ImportedFile[] = [];
      for (const doc of result) {
        const content = await RNFS.readFile(doc.uri, 'utf8');
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
      if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'DOCUMENT_PICKER_CANCELED') {
        return;
      }
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
