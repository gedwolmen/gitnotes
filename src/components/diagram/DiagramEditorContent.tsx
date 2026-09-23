/**
 * Touch-native ASCII Diagram editor.
 *
 * Renders a measured monospace grid with viewport pan/pinch and full object
 * interaction (draw/select/move/resize/erase + box/line/elbow/paint/text).
 * All diagram state is managed through DiagramContext; this component is
 * purely the interactive surface.
 */

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  BackHandler,
  Dimensions,
  Clipboard,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';

import type {
  DrawObject,
  InkColor,
  Point,
} from '../../models/Diagram';
import {
  createBox,
  createElbow,
  createLine,
  createPaint,
  createText,
} from '../../models/DiagramFactory';
import {
  DiagramState,
  canUndo as stateCanUndo,
  canRedo as stateCanRedo,
  clearSelection,
  createDiagramState,
  deleteSelected,
  redo,
  replaceDocument,
  selectObject,
  undo,
} from '../../services/diagram/core/state';
import { exportAscii } from '../../services/diagram/core/ascii';
import { useDiagrams } from '../../contexts/DiagramContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSafeBack } from '../../hooks/useSafeBack';
import { subscribeGitContentRefresh } from '../../hooks/useGitRefreshEvent';
import type { RootStackParamList } from '../../navigation/types';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GridRenderer } from './GridRenderer';
import { ToolPalette } from './ToolPalette';
import { TextInputOverlay } from './TextInputOverlay';
import type { DrawingState, ToolKey } from './types';
import { hitTestObject } from './types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'DiagramEditor'>;
type RouteType = RouteProp<RootStackParamList, 'DiagramEditor'>;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

// ---------------------------------------------------------------------------
// Main editor component
// ---------------------------------------------------------------------------

export default function DiagramEditorContent() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { colors } = useTheme();
  const safeBack = useSafeBack();

  const { diagramId, diagramTitle, repo, branch } = route.params ?? {};

  // Diagram state
  const [diagramState, setDiagramState] = useState<DiagramState>(() => createDiagramState());
  const [title, setTitle] = useState(diagramTitle ?? 'Untitled Diagram');
  const [activeTool, setActiveTool] = useState<ToolKey>('select');
  const [activeColor, setActiveColor] = useState<InkColor>('white');
  const [activeBorder] = useState<'none' | 'single' | 'double' | 'underline'>('none');
  const [textOverlayVisible, setTextOverlayVisible] = useState(false);
  const [textOverlayPosition, setTextOverlayPosition] = useState<Point>({ x: 0, y: 0 });
  const [textOverlayInitial, setTextOverlayInitial] = useState('');
  const [exporting, setExporting] = useState(false);
  const [drawing, setDrawing] = useState<DrawingState | null>(null);

  // Viewport transform
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const { getDiagramById, updateDiagram, createDiagram } = useDiagrams();

  // Load existing diagram if editing
  const existingDiagram = diagramId ? getDiagramById(diagramId) : undefined;
  useEffect(() => {
    if (existingDiagram?.document) {
      setDiagramState((prev) => replaceDocument(prev, existingDiagram.document));
      setTitle(existingDiagram.title);
    }
  }, [existingDiagram?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Subscribe to git checkout events
  useEffect(() => {
    const sub = subscribeGitContentRefresh((event) => {
      if (event.kind === 'checkout') {
        navigation.navigate('MainTabs', { screen: 'CanvasList' });
      }
    });
    return sub;
  }, [navigation]);

  // Back handler
  useEffect(() => {
    const handler = BackHandler.addEventListener('hardwareBackPress', () => {
      safeBack();
      return true;
    });
    return () => handler.remove();
  }, [safeBack]);

  // Screen dimensions for coordinate conversion
  const dims = Dimensions.get('window');
  const originX = dims.width / 2;
  const originY = dims.height / 2;

  // Convert screen coords to grid coords
  const screenToGridCoords = useCallback(
    (sx: number, sy: number): Point => {
      const s = scale.value;
      const tx = translateX.value;
      const ty = translateY.value;
      return {
        x: Math.round((sx - originX - tx) / (12 * s)),
        y: Math.round((sy - originY - ty) / (12 * s)),
      };
    },
    [scale, translateX, translateY, originX, originY],
  );

  // Handle tap (select or start drawing)
  const handleTap = useCallback(
    (sx: number, sy: number) => {
      const gridPt = screenToGridCoords(sx, sy);

      if (activeTool === 'text') {
        setTextOverlayPosition(gridPt);
        setTextOverlayInitial('');
        setTextOverlayVisible(true);
        return;
      }

      if (activeTool === 'erase') {
        const hitObj = diagramState.document.objects.find((obj) =>
          hitTestObject(obj, gridPt.x, gridPt.y, 2),
        );
        if (hitObj) {
          setDiagramState((prev) => {
            const newObjs = prev.document.objects.filter((o) => o.id !== hitObj.id);
            return replaceDocument(prev, { ...prev.document, objects: newObjs });
          });
        }
        return;
      }

      if (activeTool === 'select') {
        const hitObj = diagramState.document.objects.find((obj) =>
          hitTestObject(obj, gridPt.x, gridPt.y),
        );
        if (hitObj) {
          setDiagramState((prev) => selectObject(prev, hitObj.id));
        } else {
          setDiagramState((prev) => clearSelection(prev));
        }
      }
    },
    [activeTool, diagramState.document.objects, screenToGridCoords],
  );

  // Handle draw start
  const handleDrawStart = useCallback(
    (sx: number, sy: number) => {
      if (activeTool === 'select' || activeTool === 'text' || activeTool === 'erase') return;

      const gridPt = screenToGridCoords(sx, sy);

      if (activeTool === 'paint') {
        setDrawing({
          type: 'paint',
          startX: gridPt.x,
          startY: gridPt.y,
          currentX: gridPt.x,
          currentY: gridPt.y,
          points: [{ x: gridPt.x, y: gridPt.y }],
        });
      } else {
        setDrawing({
          type: activeTool as 'box' | 'line' | 'elbow',
          startX: gridPt.x,
          startY: gridPt.y,
          currentX: gridPt.x,
          currentY: gridPt.y,
        });
      }
    },
    [activeTool, screenToGridCoords],
  );

  // Handle draw update
  const handleDrawUpdate = useCallback(
    (sx: number, sy: number) => {
      if (!drawing) return;

      const gridPt = screenToGridCoords(sx, sy);

      if (activeTool === 'paint') {
        setDrawing((prev) => {
          if (!prev || prev.type !== 'paint') return prev;
          const newPoints = [...prev.points!, gridPt];
          return { ...prev, currentX: gridPt.x, currentY: gridPt.y, points: newPoints };
        });
      } else {
        setDrawing((prev) => {
          if (!prev) return prev;
          return { ...prev, currentX: gridPt.x, currentY: gridPt.y };
        });
      }
    },
    [drawing, activeTool, screenToGridCoords],
  );

  // Handle draw end
  const handleDrawEnd = useCallback(() => {
    if (!drawing) return;

    const nextZ = diagramState.nextZIndex;
    let newObj: DrawObject | null = null;

    switch (drawing.type) {
      case 'box': {
        const left = Math.min(drawing.startX, drawing.currentX);
        const top = Math.min(drawing.startY, drawing.currentY);
        const right = Math.max(drawing.startX, drawing.currentX);
        const bottom = Math.max(drawing.startY, drawing.currentY);
        if (right - left >= 1 || bottom - top >= 1) {
          newObj = createBox({ left, top, right, bottom, style: 'auto', color: activeColor, z: nextZ });
        }
        break;
      }
      case 'line': {
        if (drawing.startX !== drawing.currentX || drawing.startY !== drawing.currentY) {
          newObj = createLine({
            x1: drawing.startX, y1: drawing.startY,
            x2: drawing.currentX, y2: drawing.currentY,
            style: 'smooth', color: activeColor, z: nextZ,
          });
        }
        break;
      }
      case 'elbow': {
        if (drawing.startX !== drawing.currentX || drawing.startY !== drawing.currentY) {
          newObj = createElbow({
            x1: drawing.startX, y1: drawing.startY,
            x2: drawing.currentX, y2: drawing.currentY,
            style: 'smooth', color: activeColor, z: nextZ,
            orientation: 'horizontal-first',
          });
        }
        break;
      }
      case 'paint': {
        if (drawing.points && drawing.points.length > 0) {
          newObj = createPaint({ points: drawing.points, color: activeColor, z: nextZ });
        }
        break;
      }
    }

    if (newObj) {
      setDiagramState((prev) =>
        replaceDocument(prev, {
          ...prev.document,
          objects: [...prev.document.objects, newObj!],
        }),
      );
    }

    setDrawing(null);
  }, [drawing, activeColor, diagramState.nextZIndex]);

  // Handle text submission
  const handleTextSubmit = useCallback(
    (text: string, border: 'none' | 'single' | 'double' | 'underline', color: InkColor) => {
      const nextZ = diagramState.nextZIndex;
      const newObj = createText({
        x: textOverlayPosition.x,
        y: textOverlayPosition.y,
        content: text,
        border,
        color,
        z: nextZ,
      });
      setDiagramState((prev) =>
        replaceDocument(prev, {
          ...prev.document,
          objects: [...prev.document.objects, newObj],
        }),
      );
      setTextOverlayVisible(false);
    },
    [diagramState.nextZIndex, textOverlayPosition],
  );

  // Undo/Redo
  const handleUndo = useCallback(() => {
    setDiagramState((prev) => undo(prev));
  }, []);

  const handleRedo = useCallback(() => {
    setDiagramState((prev) => redo(prev));
  }, []);

  // Delete selected
  const handleDeleteSelected = useCallback(() => {
    setDiagramState((prev) => deleteSelected(prev));
  }, []);

  // Save
  const handleSave = useCallback(async () => {
    if (diagramId) {
      await updateDiagram({
        id: diagramId,
        title,
        document: diagramState.document,
        repo,
        branch,
      });
    } else {
      const created = await createDiagram({
        title,
        document: diagramState.document,
        repo,
        branch,
      });
      if (created) {
        navigation.setParams({ diagramId: created.id });
      }
    }
    navigation.goBack();
  }, [diagramId, title, diagramState.document, repo, branch, updateDiagram, createDiagram, navigation]);

  // Export JSON
  const handleExportJson = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    const fileName = `${title.replace(/[^a-z0-9]/gi, '_')}_${new Date().getTime()}.td.json`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    try {
      const content = JSON.stringify(diagramState.document, null, 2);
      await FileSystem.writeAsStringAsync(fileUri, content);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/json' });
      } else {
        Clipboard.setString(content);
        Alert.alert('Copied', 'JSON content copied to clipboard');
      }
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setExporting(false);
    }
  }, [exporting, title, diagramState.document]);

  // Export ASCII
  const handleExportAscii = useCallback(async () => {
    const ascii = exportAscii(diagramState.document);
    if (ascii.trim() === '') {
      Alert.alert('Empty', 'Add some objects before exporting');
      return;
    }
    try {
      Clipboard.setString(ascii);
      Alert.alert('Copied', 'ASCII diagram copied to clipboard');
    } catch (err) {
      Alert.alert('Export failed', err instanceof Error ? err.message : 'Unknown error');
    }
  }, [diagramState.document]);

  // Animated viewport style
  const viewportStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const canUndoVal = stateCanUndo(diagramState);
  const canRedoVal = stateCanRedo(diagramState);
  const hasSelection = diagramState.selectedIds.length > 0;

  // Gesture handlers
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => { savedScale.value = scale.value; })
        .onUpdate((e) => {
          const next = savedScale.value * e.scale;
          scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, next));
        }),
    [scale, savedScale],
  );

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .averageTouches(true)
        .onStart(() => {
          savedTx.value = translateX.value;
          savedTy.value = translateY.value;
        })
        .onUpdate((e) => {
          translateX.value = savedTx.value + e.translationX;
          translateY.value = savedTy.value + e.translationY;
        }),
    [translateX, translateY, savedTx, savedTy],
  );

  const tapGesture = useMemo(
    () =>
      Gesture.Tap()
        .onEnd((e) => {
          runOnJS(handleTap)(e.x, e.y);
        }),
    [handleTap],
  );

  const drawGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart((e) => {
          runOnJS(handleDrawStart)(e.x, e.y);
        })
        .onUpdate((e) => {
          runOnJS(handleDrawUpdate)(e.x, e.y);
        })
        .onEnd(() => {
          runOnJS(handleDrawEnd)();
        }),
    [handleDrawStart, handleDrawUpdate, handleDrawEnd],
  );

  const viewportGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [pinchGesture, panGesture],
  );

  const composedGesture = useMemo(
    () => Gesture.Race(viewportGesture, Gesture.Race(drawGesture, tapGesture)),
    [viewportGesture, drawGesture, tapGesture],
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
        {/* Header */}
        <View style={[styles.header, { borderBottomColor: colors.border }]}>
          <TouchableOpacity
            testID="diagram.header.back"
            accessibilityLabel="Back"
            onPress={safeBack}
            style={styles.headerBtn}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>

          <TextInput
            testID="diagram.header.title"
            style={[styles.titleInput, { color: colors.text }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Diagram title"
            placeholderTextColor={colors.textSecondary}
            maxLength={60}
          />

          <TouchableOpacity
            testID="diagram.header.save"
            accessibilityLabel="Save"
            onPress={handleSave}
            style={styles.headerBtn}
          >
            <Ionicons name="checkmark" size={24} color={colors.primary} />
          </TouchableOpacity>
        </View>

        {/* Canvas viewport */}
        <GestureDetector gesture={composedGesture}>
          <Animated.View style={[styles.viewport, viewportStyle]}>
            <GridRenderer
              document={diagramState.document}
              selectedIds={diagramState.selectedIds}
              drawing={drawing}
              activeColor={activeColor}
              activeStyle={activeTool === 'box' ? 'auto' : 'smooth'}
            />
          </Animated.View>
        </GestureDetector>

        {/* Tool palette */}
        <ToolPalette
          activeTool={activeTool}
          activeColor={activeColor}
          onToolChange={setActiveTool}
          onColorChange={setActiveColor}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndoVal}
          canRedo={canRedoVal}
          onExportJson={handleExportJson}
          onExportAscii={handleExportAscii}
          onDeleteSelected={handleDeleteSelected}
          hasSelection={hasSelection}
        />

        {/* Text input overlay */}
        <TextInputOverlay
          visible={textOverlayVisible}
          initialText={textOverlayInitial}
          border={activeBorder}
          color={activeColor}
          onSubmit={handleTextSubmit}
          onCancel={() => setTextOverlayVisible(false)}
        />
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerBtn: {
    padding: 8,
  },
  titleInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    marginHorizontal: 8,
    padding: 4,
  },
  viewport: {
    flex: 1,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
