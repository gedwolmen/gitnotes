import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as Speech from 'expo-speech';
import { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { RootStackParamList } from '../../navigation/types';
import { Note, NoteFormat } from '../../models/Note';
import { NeorgContentParser } from '../../services/NeorgContentParser';
import { OrgContentParser } from '../../services/OrgContentParser';
import { PositionMemoryService } from '../../services/PositionMemoryService';
import { HapticService } from '../../utils/haptics';
import { getMarkdownStyles } from '../../utils/preview';
import { NotePreviewRenderer } from '../../utils/markdownRenderer';
import { hasGitnotesImageUris, resolveGitnotesImageUris } from '../../utils/gitnotesImageResolver';
import CanvasPreview from '../CanvasPreview';
import {
  APPROX_LINE_PX,
  TocEntry,
  extractTocFromMarkdown,
  extractTocFromNorg,
  extractTocFromOrg,
  getExtensionForFormat,
  getPreviewContent,
  getSpeakableContent,
  normalizeNotePathForLookup,
  slugifyLocal,
} from './editorShared';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'NoteEditor'>;

interface UseNoteEditorPreviewParams {
  noteId?: string;
  title: string;
  content: string;
  folderPath?: string;
  noteFormat: NoteFormat;
  notes: Note[];
  colors: any;
  isDark: boolean;
  navigation: NavigationProp;
  markdownStyles: ReturnType<typeof getMarkdownStyles>;
  /**
   * Slug to scroll to once the markdown body has rendered. Set when the
   * screen was opened via a cross-file link `[X](other.md#section)`.
   */
  initialAnchor?: string;
}

export function useNoteEditorPreview({
  noteId,
  title,
  content,
  folderPath,
  noteFormat,
  notes,
  colors,
  isDark,
  navigation,
  markdownStyles,
  initialAnchor,
}: UseNoteEditorPreviewParams) {
  const [pdfLoadError, setPdfLoadError] = useState<{ uri: string; message: string } | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const previewScrollRef = useRef<ScrollView>(null);
  const isSpeakingRef = useRef(false);
  const targetScrollYRef = useRef<number | null>(null);
  const restoredScrollRef = useRef(false);
  const lastScrollYRef = useRef(0);
  const saveScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const headingPositionsRef = useRef<Map<string, number>>(new Map());

  const resolvePdfUrl = useCallback((value: string): string => {
    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    const rawGithubMatch = trimmed.match(/^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!rawGithubMatch) return trimmed;

    const [, owner, repo, ref, rawPath] = rawGithubMatch;
    const encodedPath = rawPath.split('/').map((segment) => encodeURIComponent(segment)).join('/');
    return `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(ref)}`;
  }, []);

  const rawPreviewContent = useMemo(() => getPreviewContent(content, noteFormat), [content, noteFormat]);

  // Private-repo images are persisted as `gitnotes://repo-image/...` URIs by
  // the upload path (#733) because GitHub's raw URLs 404 without a token and
  // the signed `?token=` form expires within minutes — too short to ever
  // pin into markdown. The resolver fetches each URI via the authenticated
  // Contents API and substitutes a `data:image/...;base64,...` URI in
  // memory for the renderer. Resolutions are cached per-process so reopens
  // are free; first render of a note with N private images costs N parallel
  // GETs. Public-repo images keep using the cheap raw URL — `previewContent`
  // is identity-equal to `rawPreviewContent` in that case.
  const [resolvedPreviewContent, setResolvedPreviewContent] = useState(rawPreviewContent);
  useEffect(() => {
    if (!hasGitnotesImageUris(rawPreviewContent)) {
      setResolvedPreviewContent(rawPreviewContent);
      return;
    }
    let cancelled = false;
    // Show the markdown immediately with the unresolved URIs so layout is
    // stable; expo-image will render its placeholder for the gitnotes://
    // sources until the data: URIs land a tick later.
    setResolvedPreviewContent(rawPreviewContent);
    resolveGitnotesImageUris(rawPreviewContent).then((resolved) => {
      if (cancelled) return;
      if (resolved !== rawPreviewContent) setResolvedPreviewContent(resolved);
    });
    return () => {
      cancelled = true;
    };
  }, [rawPreviewContent]);
  const previewContent = resolvedPreviewContent;

  useEffect(() => {
    headingPositionsRef.current.clear();
  }, [previewContent]);
  const pdfViewerUri = useMemo(() => resolvePdfUrl(previewContent), [previewContent, resolvePdfUrl]);

  const parsedStructuredContent = useMemo(() => {
    try {
      if (noteFormat === 'markdown' || noteFormat === 'pdf') return null;
      const parser = noteFormat === 'org' ? OrgContentParser : NeorgContentParser;
      const parsed = parser.parseContent(previewContent);
      if (!parsed.success || !parsed.blocks || parsed.blocks.length === 0) return null;
      return parsed.blocks;
    } catch {
      return null;
    }
  }, [noteFormat, previewContent]);

  const currentNotePath = useMemo(() => {
    if (noteId) {
      return notes.find((note) => note.id === noteId)?.filePath;
    }

    return folderPath && title.trim()
      ? normalizeNotePathForLookup(`${folderPath}/${slugifyLocal(title.trim())}${getExtensionForFormat(noteFormat)}`)
      : undefined;
  }, [folderPath, noteFormat, noteId, notes, title]);

  const handleOpenLinkedNote = useCallback((targetPath: string, fragment?: string) => {
    const normalizedTargetPath = normalizeNotePathForLookup(targetPath);
    const targetLower = normalizedTargetPath.toLowerCase();
    const matchByExact = (path: string): Note | undefined =>
      notes.find((note) => note.filePath && normalizeNotePathForLookup(note.filePath) === path);

    // First try matching by note title (wiki links like [[Welcome to Graph Notes]] use title)
    const targetNoteByTitle = notes.find((note) => note.title.toLowerCase() === targetLower);

    let targetNote = targetNoteByTitle || matchByExact(normalizedTargetPath);

    // Extension-less link: try each known note extension before giving up
    // (e.g. `[Other](other)` should resolve to `other.md`, `other.norg`, …).
    if (!targetNote && !/\.[a-z0-9]+$/i.test(normalizedTargetPath)) {
      for (const ext of ['md', 'norg', 'org', 'json', 'pdf']) {
        targetNote = matchByExact(`${normalizedTargetPath}.${ext}`);
        if (targetNote) break;
      }
    }

    // Last-chance basename match for links written without a folder prefix.
    if (!targetNote) {
      const basenameLower = normalizedTargetPath.split('/').pop()?.toLowerCase() ?? '';
      if (basenameLower) {
        targetNote = notes.find((note) => {
          const fp = note.filePath;
          if (!fp) return false;
          const filename = fp.split('/').pop() ?? '';
          if (filename.toLowerCase() === basenameLower) return true;
          const filenameNoExt = filename.replace(/\.[^.]+$/, '').toLowerCase();
          return filenameNoExt === basenameLower;
        });
      }
    }

    if (!targetNote?.id) return false;
    navigation.navigate('NoteEditor', { noteId: targetNote.id, anchor: fragment });
    return true;
  }, [navigation, notes]);

  const notePreviewRenderer = useMemo(
    () =>
      new NotePreviewRenderer({
        colors,
        isDark,
        navigation,
        previewContent,
        previewScrollRef,
        CanvasPreview,
        approxLinePx: APPROX_LINE_PX,
        currentNotePath,
        onOpenNote: handleOpenLinkedNote,
        headingPositions: headingPositionsRef,
      }),
    [colors, currentNotePath, handleOpenLinkedNote, isDark, navigation, previewContent],
  );

  const speakableContent = useMemo(() => getSpeakableContent(previewContent), [previewContent]);

  const handleToggleSpeak = useCallback(async () => {
    if (isSpeaking) {
      await Speech.stop();
      isSpeakingRef.current = false;
      setIsSpeaking(false);
      return;
    }

    if (!speakableContent) return;
    HapticService.light();
    isSpeakingRef.current = true;
    setIsSpeaking(true);
    Speech.speak(speakableContent, {
      onDone: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      },
      onStopped: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      },
      onError: () => {
        isSpeakingRef.current = false;
        setIsSpeaking(false);
      },
    });
  }, [isSpeaking, speakableContent]);

  useEffect(() => {
    return () => {
      if (isSpeakingRef.current) {
        Speech.stop();
      }
    };
  }, []);

  const tocEntries = useMemo<TocEntry[]>(() => {
    if (noteFormat === 'neorg') return extractTocFromNorg(previewContent);
    if (noteFormat === 'org') return extractTocFromOrg(previewContent);
    return extractTocFromMarkdown(previewContent);
  }, [noteFormat, previewContent]);

  const handleTocPress = useCallback((entry: TocEntry) => {
    setShowToc(false);
    requestAnimationFrame(() => {
      const slug = entry.text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      const measuredY = headingPositionsRef.current.get(slug);
      const targetY = measuredY ?? entry.lineIndex * APPROX_LINE_PX;
      previewScrollRef.current?.scrollTo({ y: targetY, animated: true });
    });
  }, []);

  useEffect(() => {
    if (!noteId) return;
    let cancelled = false;
    PositionMemoryService.load(PositionMemoryService.noteKey(noteId)).then((y) => {
      if (!cancelled) targetScrollYRef.current = y ?? 0;
    });
    return () => {
      cancelled = true;
    };
  }, [noteId]);

  useEffect(() => {
    return () => {
      if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
      if (noteId && lastScrollYRef.current > 0) {
        PositionMemoryService.save(PositionMemoryService.noteKey(noteId), lastScrollYRef.current);
      }
    };
  }, [noteId]);

  const handlePreviewScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = event.nativeEvent.contentOffset.y;
    lastScrollYRef.current = y;
    if (!noteId) return;
    if (saveScrollTimeoutRef.current) clearTimeout(saveScrollTimeoutRef.current);
    saveScrollTimeoutRef.current = setTimeout(() => {
      PositionMemoryService.save(PositionMemoryService.noteKey(noteId), y);
    }, 400);
  }, [noteId]);

  const handlePreviewContentSizeChange = useCallback(() => {
    if (restoredScrollRef.current) return;
    // When the screen was opened with an anchor target, the dedicated
    // anchor-scroll effect drives positioning; don't compete with it.
    if (initialAnchor) {
      restoredScrollRef.current = true;
      return;
    }
    const target = targetScrollYRef.current;
    if (target == null) return;
    if (target > 0) {
      previewScrollRef.current?.scrollTo({ y: target, animated: false });
    }
    restoredScrollRef.current = true;
  }, [initialAnchor]);

  // Cross-file link (`[X](other.md#section)`) opens this screen with the
  // slug pre-set; poll the heading-position map while headings finish
  // laying out, then scroll once a y is recorded for the slug.
  useEffect(() => {
    if (!initialAnchor) return;
    const slug = initialAnchor;
    let cancelled = false;
    let attempts = 0;
    const tick = () => {
      if (cancelled) return;
      const y = headingPositionsRef.current.get(slug);
      if (y != null) {
        previewScrollRef.current?.scrollTo({ y, animated: false });
        return;
      }
      if (attempts++ < 30) {
        setTimeout(tick, 60);
      }
    };
    const initial = setTimeout(tick, 80);
    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [initialAnchor, previewContent]);

  return {
    markdownStyles,
    previewContent,
    pdfViewerUri,
    parsedStructuredContent,
    notePreviewRenderer,
    currentNotePath,
    headingPositions: headingPositionsRef,
    onOpenNote: handleOpenLinkedNote,
    speakableContent,
    isSpeaking,
    showToc,
    tocEntries,
    pdfLoadError,
    previewScrollRef,
    setShowToc,
    setPdfLoadError,
    handleToggleSpeak,
    handleTocPress,
    handlePreviewScroll,
    handlePreviewContentSizeChange,
  };
}
