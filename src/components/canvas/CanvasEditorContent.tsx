import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  Platform,
  ScrollView,
  Alert,
  BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Canvas,
  Path,
  Rect,
  Oval,
  RoundedRect,
  Fill,
  Group,
  Skia,
  Image as SkiaImage,
  matchFont,
  Text as SkiaText,
} from '@shopify/react-native-skia';
import type { SkImage } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { cancelAnimation, runOnJS, useAnimatedStyle, useDerivedValue, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { useCanvases } from '../../contexts/CanvasContext';
import { useTheme } from '../../contexts/ThemeContext';
import {
  CanvasScene,
  CanvasElement,
  CanvasStroke,
  CanvasShape,
  CanvasText,
  CanvasChart,
  CanvasImage,
  DEFAULT_SCENE,
  slugifyCanvasTitle,
} from '../../models/Canvas';
import GitContextPicker from '../GitContextPicker';
import { syncCanvasToGitHub } from '../../services/CanvasGitHubSyncService';
import { useAuth } from '../../contexts/AuthContext';
import { renderSceneToPng } from '../../utils/canvasPngExport';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import type { RootStackParamList } from '../../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CanvasEditor'>;
type RouteType = RouteProp<RootStackParamList, 'CanvasEditor'>;
type Point = { x: number; y: number };
type ToolIconName = React.ComponentProps<typeof Ionicons>['name'];

const COLORS = ['#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];
const TOOLS: { key: string; icon?: ToolIconName; label?: string }[] = [
  { key: 'pen', icon: 'pencil' as ToolIconName },
  { key: 'highlighter', icon: 'brush' as ToolIconName },
  { key: 'eraser', icon: 'backspace-outline' as ToolIconName },
  { key: 'line', icon: 'remove' as ToolIconName },
  { key: 'arrow', icon: 'arrow-forward' as ToolIconName },
  { key: 'rect', icon: 'square-outline' as ToolIconName },
  { key: 'roundRect', icon: 'stop-outline' as ToolIconName },
  { key: 'ellipse', icon: 'ellipse-outline' as ToolIconName },
  { key: 'diamond', icon: 'diamond-outline' as ToolIconName },
  { key: 'text', label: 'T' },
  { key: 'image', icon: 'image-outline' as ToolIconName },
  { key: 'chart', icon: 'bar-chart-outline' as ToolIconName },
  { key: 'select', icon: 'hand-left-outline' as ToolIconName },
];

function uid(): string {
  'worklet';
  return `el-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  'worklet';
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildStrokePath(points: Point[]): SkPath | null {
  if (!points || points.length === 0) return null;
  const p = Skia.Path.Make();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    p.lineTo(points[i].x, points[i].y);
  }
  return p;
}

function buildArrowPath(x1: number, y1: number, x2: number, y2: number, sw: number): SkPath {
  'worklet';
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const hl = Math.max(12, sw * 4);
  p.moveTo(x2, y2);
  p.lineTo(x2 - hl * Math.cos(ang - 0.4), y2 - hl * Math.sin(ang - 0.4));
  p.moveTo(x2, y2);
  p.lineTo(x2 - hl * Math.cos(ang + 0.4), y2 - hl * Math.sin(ang + 0.4));
  return p;
}

function buildDiamondPath(x1: number, y1: number, x2: number, y2: number): SkPath {
  'worklet';
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  const p = Skia.Path.Make();
  p.moveTo(cx, y1);
  p.lineTo(x2, cy);
  p.lineTo(cx, y2);
  p.lineTo(x1, cy);
  p.close();
  return p;
}

function buildLinePath(x1: number, y1: number, x2: number, y2: number): SkPath {
  'worklet';
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  return p;
}

export interface CanvasBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function expandBounds(bounds: CanvasBounds | null, x: number, y: number): CanvasBounds {
  'worklet';
  if (!bounds) {
    return { minX: x, minY: y, maxX: x, maxY: y };
  }

  return {
    minX: Math.min(bounds.minX, x),
    minY: Math.min(bounds.minY, y),
    maxX: Math.max(bounds.maxX, x),
    maxY: Math.max(bounds.maxY, y),
  };
}

function assertNeverElement(_element: never): never {
  'worklet';
  throw new TypeError('Unsupported canvas element type');
}

export function getCanvasContentBounds(elements: CanvasElement[]): CanvasBounds | null {
  'worklet';

  let bounds: CanvasBounds | null = null;

  for (const el of elements) {
    switch (el.type) {
      case 'stroke':
        for (const point of el.points) {
          bounds = expandBounds(bounds, point.x - el.width / 2, point.y - el.width / 2);
          bounds = expandBounds(bounds, point.x + el.width / 2, point.y + el.width / 2);
        }
        break;
      case 'shape': {
        const pad = el.width / 2;
        bounds = expandBounds(bounds, Math.min(el.x1, el.x2) - pad, Math.min(el.y1, el.y2) - pad);
        bounds = expandBounds(bounds, Math.max(el.x1, el.x2) + pad, Math.max(el.y1, el.y2) + pad);
        break;
      }
      case 'text': {
        const textWidth = Math.max(1, el.text.length * el.fontSize * 0.6);
        bounds = expandBounds(bounds, el.x, el.y - el.fontSize);
        bounds = expandBounds(bounds, el.x + textWidth, el.y);
        break;
      }
      case 'chart':
      case 'image':
        bounds = expandBounds(bounds, el.x, el.y);
        bounds = expandBounds(bounds, el.x + el.width, el.y + el.height);
        break;
      default:
        assertNeverElement(el);
    }
  }

  return bounds;
}

export function getCanvasFitTranslation(
  bounds: CanvasBounds | null,
  viewportWidth: number,
  viewportHeight: number,
  scaleValue: number,
) {
  'worklet';

  if (!bounds) {
    return { translateX: 0, translateY: 0 };
  }

  return {
    translateX: viewportWidth / 2 - scaleValue * (bounds.minX + bounds.maxX) / 2,
    translateY: viewportHeight / 2 - scaleValue * (bounds.minY + bounds.maxY) / 2,
  };
}

export function clampCanvasTranslation(
  translateX: number,
  translateY: number,
  scaleValue: number,
  bounds: CanvasBounds | null,
  viewportWidth: number,
  viewportHeight: number,
  margin = 80,
) {
  'worklet';

  if (!bounds) {
    return { translateX, translateY };
  }

  const minTx = margin - scaleValue * bounds.maxX;
  const maxTx = viewportWidth - margin - scaleValue * bounds.minX;
  const minTy = margin - scaleValue * bounds.maxY;
  const maxTy = viewportHeight - margin - scaleValue * bounds.minY;
  const fit = getCanvasFitTranslation(bounds, viewportWidth, viewportHeight, scaleValue);

  return {
    translateX: minTx <= maxTx ? Math.min(maxTx, Math.max(minTx, translateX)) : fit.translateX,
    translateY: minTy <= maxTy ? Math.min(maxTy, Math.max(minTy, translateY)) : fit.translateY,
  };
}

export function moveCanvasElement(el: CanvasElement, dx: number, dy: number): CanvasElement {
  'worklet';

  switch (el.type) {
    case 'stroke':
      return { ...el, points: el.points.map((point) => ({ x: point.x + dx, y: point.y + dy })) };
    case 'shape':
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case 'text':
    case 'chart':
    case 'image':
      return { ...el, x: el.x + dx, y: el.y + dy };
    default:
      return assertNeverElement(el);
  }
}

export default function CanvasEditorContent() {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteType>();
  const { canvasId, canvasWidth, canvasTitle } = route.params;

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (navigation.canGoBack()) {
        navigation.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [navigation]);
  const { getCanvasById, createCanvas, updateCanvas } = useCanvases();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const cw = canvasWidth ?? Dimensions.get('window').width;
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  const existingCanvas = canvasId ? getCanvasById(canvasId) : undefined;
  // Stored canvas title is source-of-truth when reopening. Falls back to the
  // route-param title (used by the new-canvas size picker), then a default.
  // Without this, the editor used to mount with 'Untitled Canvas' for any
  // existing canvas and a Save would overwrite the real title (#713).
  const [title, setTitle] = useState(
    existingCanvas?.title || canvasTitle || 'Untitled Canvas',
  );
  // Deep-links / cold-launches into the editor may mount before the canvas
  // store has finished loading. Hydrate once existingCanvas resolves, but
  // never clobber a user edit in progress.
  const titleHydratedRef = useRef(!!existingCanvas?.title || !canvasId);
  useEffect(() => {
    if (titleHydratedRef.current) return;
    if (existingCanvas?.title) {
      setTitle(existingCanvas.title);
      titleHydratedRef.current = true;
    }
  }, [existingCanvas?.title]);
  const [elements, setElements] = useState<CanvasElement[]>(
    existingCanvas?.scene?.elements ?? DEFAULT_SCENE.elements,
  );
  const [, setHistory] = useState<string[]>([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(3);
  const [filled, setFilled] = useState(false);
  const [textModalVisible, setTextModalVisible] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [textPosition, setTextPosition] = useState<Point | null>(null);
  const [exporting, setExporting] = useState(false);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);
  const activeDrawingElement = useSharedValue<CanvasStroke | CanvasShape | null>(null);
  const activeStrokePath = useSharedValue(Skia.Path.Make().setIsVolatile(true));
  const contentBounds = useMemo(() => getCanvasContentBounds(elements), [elements]);
  const shouldAutoFitRef = useRef(true);
  const didAutoFitRef = useRef(!!canvasId);
  const imageCacheRef = useRef<Map<string, SkImage | null>>(new Map());

  const setZoom = useCallback(
    (next: number) => {
      const clamped = Math.max(0.5, Math.min(4, next));
      scale.value = withSpring(clamped, { mass: 0.5, damping: 14, stiffness: 200 });
    },
    [scale],
  );

  const resetView = useCallback(() => {
    const next = canvasSize && contentBounds
      ? getCanvasFitTranslation(contentBounds, canvasSize.width, canvasSize.height, 1)
      : { translateX: 0, translateY: 0 };

    scale.value = withSpring(1, { mass: 0.5, damping: 14, stiffness: 200 });
    translateX.value = withSpring(next.translateX, { mass: 0.5, damping: 14, stiffness: 200 });
    translateY.value = withSpring(next.translateY, { mass: 0.5, damping: 14, stiffness: 200 });
  }, [canvasSize, contentBounds, scale, translateX, translateY]);

  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { activeAccountId } = useAuth();
  const [repo, setRepo] = useState<string | undefined>(existingCanvas?.repo);
  const [branch, setBranch] = useState<string | undefined>(existingCanvas?.branch);
  const accountId = existingCanvas?.accountId ?? activeAccountId ?? undefined;
  const dragStartRef = useRef<Point | null>(null);
  const resizeHandleRef = useRef<'tl' | 'tr' | 'bl' | 'br' | null>(null);
  const resizeOriginalRef = useRef<{ x: number; y: number; w: number; h: number } | null>(null);
  const gestureModeRef = useRef<'RESIZE' | 'MOVE' | 'LASSO' | null>(null);
  const lassoPointsRef = useRef<Point[]>([]);
  const [lassoRenderTick, setLassoRenderTick] = useState(0);

  const textFont = useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica', default: 'serif' }),
        fontSize: 20,
        fontWeight: 'normal' as const,
      }),
    [],
  );

  useEffect(() => {
    const currentIds = new Set(elements.filter((el): el is CanvasImage => el.type === 'image').map((el) => el.id));
    const cache = imageCacheRef.current;
    for (const [id, img] of cache) {
      if (!currentIds.has(id)) {
        if (img) img.dispose();
        cache.delete(id);
      }
    }
  }, [elements]);

  useEffect(() => {
    return () => {
      for (const img of imageCacheRef.current.values()) {
        if (img) img.dispose();
      }
      imageCacheRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!canvasSize) return;

    if (didAutoFitRef.current) return;

    if (shouldAutoFitRef.current && contentBounds) {
      const next = getCanvasFitTranslation(contentBounds, canvasSize.width, canvasSize.height, 1);
      scale.value = withSpring(1, { mass: 0.5, damping: 14, stiffness: 200 });
      translateX.value = withSpring(next.translateX, { mass: 0.5, damping: 14, stiffness: 200 });
      translateY.value = withSpring(next.translateY, { mass: 0.5, damping: 14, stiffness: 200 });
      didAutoFitRef.current = true;
    } else {
      translateX.value = withSpring(0, { mass: 0.5, damping: 14, stiffness: 200 });
      translateY.value = withSpring(0, { mass: 0.5, damping: 14, stiffness: 200 });
      didAutoFitRef.current = true;
    }
  }, [canvasSize, contentBounds, scale, translateX, translateY]);

  const saveHistory = useCallback(() => {
    setHistory((prev) => {
      // Strip base64 image data from history snapshots to avoid
      // multiplying ~512KB per image across 40 undo entries.
      // Image data is preserved in the current elements array.
      const stripped = elements.map(el =>
        el.type === 'image'
          ? { ...el, data: '[image-stripped]' }
          : el
      );
      const next = [...prev, JSON.stringify(stripped)];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }, [elements]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      const restored = JSON.parse(last) as CanvasElement[];
      // Rehydrate stripped image data from current elements
      setElements(restored.map(el => {
        if (el.type === 'image' && el.data === '[image-stripped]') {
          const current = elements.find(e => e.id === el.id);
          return current && current.type === 'image'
            ? { ...el, data: current.data }
            : el;
        }
        return el;
      }));
      return prev.slice(0, -1);
    });
  }, [elements]);

  const clearAll = useCallback(() => {
    saveHistory();
    setElements([]);
    setSelectedIds([]);
  }, [saveHistory]);

  const hitTest = useCallback((el: CanvasElement, px: number, py: number, pad = 8): boolean => {
    if (el.type === 'stroke') {
      const pts = el.points;
      if (!pts || pts.length === 0) return false;
      for (let i = 0; i < pts.length; i++) {
        const dx = pts[i].x - px;
        const dy = pts[i].y - py;
        if (dx * dx + dy * dy <= (el.width + pad) * (el.width + pad)) return true;
      }
      return false;
    }
    if (el.type === 'shape') {
      const minX = Math.min(el.x1, el.x2) - pad;
      const maxX = Math.max(el.x1, el.x2) + pad;
      const minY = Math.min(el.y1, el.y2) - pad;
      const maxY = Math.max(el.y1, el.y2) + pad;
      return px >= minX && px <= maxX && py >= minY && py <= maxY;
    }
    if (el.type === 'text') {
      const tw = el.text.length * el.fontSize * 0.6;
      return px >= el.x - pad && px <= el.x + tw + pad && py >= el.y - el.fontSize - pad && py <= el.y + pad;
    }
    if (el.type === 'chart') {
      return px >= el.x - pad && px <= el.x + el.width + pad && py >= el.y - pad && py <= el.y + el.height + pad;
    }
    if (el.type === 'image') {
      return px >= el.x - pad && px <= el.x + el.width + pad && py >= el.y - pad && py <= el.y + el.height + pad;
    }
    return false;
  }, []);

  const eraserHitTest = useCallback((pt: Point, eraserRadius: number): string[] => {
    const idsToErase: string[] = [];
    for (let i = elements.length - 1; i >= 0; i--) {
      const el = elements[i];
      if (hitTest(el, pt.x, pt.y, eraserRadius)) {
        idsToErase.push(el.id);
      }
    }
    return idsToErase;
  }, [elements, hitTest]);

  const eraseElementsAtPoint = useCallback((pt: Point, radius: number) => {
    const idsToErase = eraserHitTest(pt, radius);
    if (idsToErase.length > 0) {
      saveHistory();
      setElements((prev) => prev.filter((el) => !idsToErase.includes(el.id)));
      setSelectedIds((prev) => prev.filter((id) => !idsToErase.includes(id)));
    }
  }, [eraserHitTest, saveHistory, selectedId]);

  const startTextPlacement = useCallback((pt: Point) => {
    setTextPosition(pt);
    setTextInput('');
    setTextModalVisible(true);
  }, []);

  const startChartPlacement = useCallback((pt: Point) => {
    setChartPosition(pt);
    setChartTitle('Chart');
    setChartType('bar');
    setChartLabelsInput('A, B, C');
    setChartValuesInput('10, 20, 30');
    setChartModalVisible(true);
  }, []);

  const startImagePlacement = useCallback(async (pt: Point) => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]?.base64) return;

      const asset = result.assets[0];
      let base64Data: string = asset.base64!;
      let srcW = asset.width;
      let srcH = asset.height;

      const MAX_BYTES = 512 * 1024;
      while (base64Data.length > MAX_BYTES * 1.33) {
        const data = Skia.Data.fromBase64(base64Data);
        const skImage = Skia.Image.MakeImageFromEncoded(data);
        if (!skImage) break;
        const halfW = Math.max(1, Math.floor(skImage.width() / 2));
        const halfH = Math.max(1, Math.floor(skImage.height() / 2));
        if (halfW < 256 || halfH < 256) break;
        const surface = Skia.Surface.MakeOffscreen(halfW, halfH);
        if (!surface) break;
        try {
          const canvas = surface.getCanvas();
          canvas.drawImageRect(skImage,
            { x: 0, y: 0, width: skImage.width(), height: skImage.height() },
            { x: 0, y: 0, width: halfW, height: halfH },
            Skia.Paint()
          );
          const resized = surface.makeImageSnapshot();
          base64Data = resized.encodeToBase64();
          srcW = halfW;
          srcH = halfH;
        } finally {
          surface.dispose();
        }
      }

      const maxDim = 200;
      const scale = Math.min(maxDim / srcW, maxDim / srcH, 1);
      const displayW = Math.round(srcW * scale);
      const displayH = Math.round(srcH * scale);

      saveHistory();
      const el: CanvasImage = {
        type: 'image',
        id: `img-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
        data: base64Data,
        mimeType: 'image/jpeg',
        x: pt.x - displayW / 2,
        y: pt.y - displayH / 2,
        width: displayW,
        height: displayH,
      };
      setElements((prev) => [...prev, el]);
    } catch (error) {
      Alert.alert('Image error', error instanceof Error ? error.message : 'Failed to load image');
    }
  }, [saveHistory]);

  const checkResizeHandle = useCallback((el: CanvasElement, px: number, py: number): 'tl' | 'tr' | 'bl' | 'br' | null => {
    if (el.type !== 'image') return null;
    const hs = 12;
    if (Math.abs(px - el.x) <= hs && Math.abs(py - el.y) <= hs) return 'tl';
    if (Math.abs(px - (el.x + el.width)) <= hs && Math.abs(py - el.y) <= hs) return 'tr';
    if (Math.abs(px - el.x) <= hs && Math.abs(py - (el.y + el.height)) <= hs) return 'bl';
    if (Math.abs(px - (el.x + el.width)) <= hs && Math.abs(py - (el.y + el.height)) <= hs) return 'br';
    return null;
  }, []);

  const startSelection = useCallback((pt: Point) => {
    dragStartRef.current = pt;
    lassoPointsRef.current = [];
    gestureModeRef.current = null;

    for (const sid of selectedIds) {
      const selEl = elements.find((e) => e.id === sid);
      if (selEl) {
        const handle = checkResizeHandle(selEl, pt.x, pt.y);
        if (handle) {
          gestureModeRef.current = 'RESIZE';
          resizeHandleRef.current = handle;
          resizeOriginalRef.current = selEl.type === 'image'
            ? { x: selEl.x, y: selEl.y, w: selEl.width, h: selEl.height }
            : null;
          saveHistory();
          return;
        }
      }
    }

    for (let i = elements.length - 1; i >= 0; i--) {
      if (hitTest(elements[i], pt.x, pt.y)) {
        const hitId = elements[i].id;
        if (selectedIds.includes(hitId)) {
          gestureModeRef.current = 'MOVE';
          saveHistory();
        } else {
          setSelectedIds([hitId]);
          gestureModeRef.current = 'MOVE';
          saveHistory();
        }
        return;
      }
    }

    setSelectedIds([]);
    gestureModeRef.current = 'LASSO';
  }, [elements, hitTest, selectedIds, checkResizeHandle, saveHistory]);

  const updateSelection = useCallback((pt: Point) => {
    if (!dragStartRef.current) return;
    const dx = pt.x - dragStartRef.current.x;
    const dy = pt.y - dragStartRef.current.y;
    setElements((prev) => prev.map((el) => (el.id === selectedId ? moveCanvasElement(el, dx, dy) : el)));
    dragStartRef.current = pt;
  }, [selectedId]);

  const endSelection = useCallback(() => {
    if (gestureModeRef.current === 'LASSO' && lassoPointsRef.current.length >= 3) {
      const polygon = lassoPointsRef.current;
      const newSelected = elements
        .filter((el) => pointInPolygon(elementCenter(el), polygon))
        .map((el) => el.id);
      if (newSelected.length > 0) {
        setSelectedIds(newSelected);
      }
    }
    dragStartRef.current = null;
    resizeHandleRef.current = null;
    resizeOriginalRef.current = null;
    gestureModeRef.current = null;
    lassoPointsRef.current = [];
    setLassoRenderTick(0);
  }, [elements]);

  const commitActiveDrawing = useCallback((element: CanvasStroke | CanvasShape | null) => {
    if (element) {
      setElements((prev) => [...prev, element]);
    }
  }, []);

  const activeStrokeColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || element.type !== 'stroke') return 'transparent';
    return element.tool === 'highlighter' ? hexToRgba(element.color, 0.3) : element.color;
  });
  const activeStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'stroke' ? element.width : 0;
  });
  const activeLinePath = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || element.type !== 'shape' || element.shape !== 'line') return Skia.Path.Make();
    return buildLinePath(element.x1, element.y1, element.x2, element.y2);
  });
  const activeArrowPath = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || element.type !== 'shape' || element.shape !== 'arrow') return Skia.Path.Make();
    return buildArrowPath(element.x1, element.y1, element.x2, element.y2, element.width);
  });
  const activeDiamondPath = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || element.type !== 'shape' || element.shape !== 'diamond') return Skia.Path.Make();
    return buildDiamondPath(element.x1, element.y1, element.x2, element.y2);
  });
  const activeShapeRect = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (
      !element
      || element.type !== 'shape'
      || (element.shape !== 'rect' && element.shape !== 'roundRect' && element.shape !== 'ellipse')
    ) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }
    return {
      x: Math.min(element.x1, element.x2),
      y: Math.min(element.y1, element.y2),
      width: Math.abs(element.x2 - element.x1),
      height: Math.abs(element.y2 - element.y1),
    };
  });
  const activeShapeX = useDerivedValue(() => activeShapeRect.value.x);
  const activeShapeY = useDerivedValue(() => activeShapeRect.value.y);
  const activeShapeWidth = useDerivedValue(() => activeShapeRect.value.width);
  const activeShapeHeight = useDerivedValue(() => activeShapeRect.value.height);
  const activeShapeStrokeColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' ? element.color : 'transparent';
  });
  const activeRectFillColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' && element.shape === 'rect' ? element.fillColor ?? 'transparent' : 'transparent';
  });
  const activeRoundRectFillColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' && element.shape === 'roundRect' ? element.fillColor ?? 'transparent' : 'transparent';
  });
  const activeEllipseFillColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' && element.shape === 'ellipse' ? element.fillColor ?? 'transparent' : 'transparent';
  });
  const activeShapeStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' ? element.width : 0;
  });
  const activeRectStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' && element.shape === 'rect' ? element.width : 0;
  });
  const activeRoundRectStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' && element.shape === 'roundRect' ? element.width : 0;
  });
  const activeEllipseStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element?.type === 'shape' && element.shape === 'ellipse' ? element.width : 0;
  });

  // Single-finger pan gesture - only for drawing tools (pen, highlighter, eraser, shapes)
  // NEVER for select tool - that uses its own pan handler
  const drawPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart((e) => {
          'worklet';
          const pt = { x: e.x, y: e.y };

          // Text tool is handled via long-press or tap, not pan
          if (tool === 'text') {
            runOnJS(startTextPlacement)(pt);
            return;
          }

          if (tool === 'chart') {
            runOnJS(startChartPlacement)(pt);
            return;
          }

          if (tool === 'image') {
            runOnJS(startImagePlacement)(pt);
            return;
          }

          // Don't draw if in select mode - let the select gesture handle it
          if (tool === 'select') {
            return;
          }

          runOnJS(saveHistory)();

          if (tool === 'eraser') {
            runOnJS(eraseElementsAtPoint)(pt, size * 3);
          } else if (tool === 'pen' || tool === 'highlighter') {
            try {
              activeStrokePath.value.rewind();
              activeStrokePath.value.moveTo(pt.x, pt.y);
} catch {
            activeStrokePath.value = Skia.Path.Make().setIsVolatile(true);
          }
            activeDrawingElement.value = {
              type: 'stroke',
              id: uid(),
              tool,
              color,
              width: tool === 'highlighter' ? size * 5 : size,
              points: [pt],
            };
          } else {
            activeStrokePath.value.rewind();
            activeDrawingElement.value = {
              type: 'shape',
              id: uid(),
              shape: tool as CanvasShape['shape'],
              color,
              fillColor: filled ? color : undefined,
              width: size,
              x1: pt.x,
              y1: pt.y,
              x2: pt.x,
              y2: pt.y,
            };
          }
        })
        .onChange((e) => {
          'worklet';
          const pt = { x: e.x, y: e.y };

          if (tool === 'select') {
            return;
          }

          if (tool === 'eraser') {
            runOnJS(eraseElementsAtPoint)(pt, size * 3);
            return;
          }

          const active = activeDrawingElement.value;
          if (!active) return;

          if (active.type === 'stroke') {
            try {
              activeStrokePath.value.lineTo(pt.x, pt.y);
            } catch {
              activeStrokePath.value = Skia.Path.Make().setIsVolatile(true);
              activeStrokePath.value.moveTo(pt.x, pt.y);
              for (let i = 1; i < active.points.length; i++) {
                activeStrokePath.value.lineTo(active.points[i].x, active.points[i].y);
              }
              activeStrokePath.value.lineTo(pt.x, pt.y);
            }
            const newPoints = [...active.points, pt];
            activeDrawingElement.value = { ...active, points: newPoints };
          } else {
            activeDrawingElement.value = { ...active, x2: pt.x, y2: pt.y };
          }
        })
        .onEnd(() => {
          'worklet';
          if (tool === 'select' || tool === 'eraser') {
            return;
          }

          const completedElement = activeDrawingElement.value;
          activeDrawingElement.value = null;
          try {
            activeStrokePath.value.rewind();
} catch {
              activeStrokePath.value = Skia.Path.Make().setIsVolatile(true);
            }
          runOnJS(commitActiveDrawing)(completedElement);
        })
        .onFinalize(() => {
          'worklet';
          if (activeDrawingElement.value !== null && tool !== 'eraser') {
            activeDrawingElement.value = null;
            try {
              activeStrokePath.value.rewind();
            } catch {
              activeStrokePath.value = Skia.Path.Make().setIsVolatile(true);
            }
          }
        }),
    [tool, color, size, filled, saveHistory, startTextPlacement, startChartPlacement, startImagePlacement, commitActiveDrawing, activeDrawingElement, activeStrokePath, eraseElementsAtPoint],
  );

  const addTextElement = useCallback(() => {
    if (!textPosition || !textInput.trim()) return;
    saveHistory();
    const el: CanvasText = {
      type: 'text',
      id: uid(),
      text: textInput.trim(),
      x: textPosition.x,
      y: textPosition.y,
      fontSize: 20,
      color,
    };
    setElements((prev) => [...prev, el]);
    setTextModalVisible(false);
  }, [textPosition, textInput, color, saveHistory]);

  const addChartElement = useCallback(() => {
    if (!chartPosition) return;
    const labels = parseChartLabels(chartLabelsInput);
    const values = parseChartValues(chartValuesInput);
    if (labels.length === 0 || values.length === 0) {
      Alert.alert('Invalid data', 'Please enter at least one label and one value.');
      return;
    }
    const maxLen = Math.max(labels.length, values.length);
    const paddedLabels = [...labels];
    const paddedValues = [...values];
    while (paddedLabels.length < maxLen) paddedLabels.push(`Label ${paddedLabels.length + 1}`);
    while (paddedValues.length < maxLen) paddedValues.push(0);
    saveHistory();
    const el: CanvasChart = {
      type: 'chart',
      id: uid(),
      chartType: chartType,
      title: chartTitle.trim() || 'Chart',
      labels: paddedLabels,
      values: paddedValues,
      x: chartPosition.x,
      y: chartPosition.y,
      width: 300,
      height: 200,
    };
    setElements((prev) => [...prev, el]);
    setChartModalVisible(false);
  }, [chartPosition, chartTitle, chartType, chartLabelsInput, chartValuesInput, saveHistory]);

  const applyAnimation = useCallback(() => {
    if (selectedIds.length === 0) return;
    const duration = Math.max(500, Math.min(5000, parseInt(animDuration, 10) || 2000));
    saveHistory();
    setElements((prev) => prev.map((el) =>
      selectedIds.includes(el.id)
        ? { ...el, animation: { type: animType, duration, loop: animLoop } }
        : el
    ));
    setAnimModalVisible(false);
  }, [selectedIds, animType, animDuration, animLoop, saveHistory]);

  const removeAnimation = useCallback(() => {
    if (selectedIds.length === 0) return;
    saveHistory();
    setElements((prev) => prev.map((el) => {
      if (!selectedIds.includes(el.id)) return el;
      const { animation: _removed, ...rest } = el as typeof el & { animation?: unknown };
      return rest as typeof el;
    }));
    setAnimModalVisible(false);
  }, [selectedIds, saveHistory]);

  // Select tool pan gesture - ONLY for moving selected elements
  const selectPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart((e) => {
          'worklet';
          if (tool !== 'select') return;
          const pt = { x: e.x, y: e.y };
          runOnJS(startSelection)(pt);
        })
        .onUpdate((e) => {
          'worklet';
          if (tool !== 'select') return;
          const pt = { x: e.x, y: e.y };
          runOnJS(updateSelection)(pt);
        })
        .onEnd(() => {
          'worklet';
          runOnJS(endSelection)();
        }),
    [tool, selectedIds, startSelection, updateSelection, endSelection],
  );

  // Two-finger pinch for zoom
  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          'worklet';
          savedScale.value = scale.value;
        })
        .onUpdate((e) => {
          'worklet';
          const next = savedScale.value * e.scale;
          const nextScale = Math.max(0.5, Math.min(4, next));
          scale.value = nextScale;
          const clamped = clampCanvasTranslation(
            translateX.value,
            translateY.value,
            nextScale,
            contentBounds,
            canvasSize?.width ?? 0,
            canvasSize?.height ?? 0,
          );
          translateX.value = clamped.translateX;
          translateY.value = clamped.translateY;
        }),
    [scale, savedScale, contentBounds, canvasSize?.width, canvasSize?.height, translateX, translateY],
  );

  // Two-finger pan for canvas panning
  const twoFingerPan = useMemo(
    () =>
      Gesture.Pan()
        .minPointers(2)
        .averageTouches(true)
        .onStart(() => {
          'worklet';
          savedTx.value = translateX.value;
          savedTy.value = translateY.value;
        })
        .onUpdate((e) => {
          'worklet';
          const clamped = clampCanvasTranslation(
            savedTx.value + e.translationX,
            savedTy.value + e.translationY,
            scale.value,
            contentBounds,
            canvasSize?.width ?? 0,
            canvasSize?.height ?? 0,
          );
          translateX.value = clamped.translateX;
          translateY.value = clamped.translateY;
        }),
    [translateX, translateY, savedTx, savedTy, scale, contentBounds, canvasSize?.width, canvasSize?.height],
  );

  const viewportPanGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .onStart(() => {
          'worklet';
          savedTx.value = translateX.value;
          savedTy.value = translateY.value;
        })
        .onUpdate((e) => {
          'worklet';
          const clamped = clampCanvasTranslation(
            savedTx.value + e.translationX,
            savedTy.value + e.translationY,
            scale.value,
            contentBounds,
            canvasSize?.width ?? 0,
            canvasSize?.height ?? 0,
          );
          translateX.value = clamped.translateX;
          translateY.value = clamped.translateY;
        }),
    [savedTx, savedTy, scale, contentBounds, canvasSize?.width, canvasSize?.height, translateX, translateY],
  );

  // Two-finger combo for simultaneous zoom+pan
  const twoFingerCombo = useMemo(
    () => Gesture.Simultaneous(pinchGesture, twoFingerPan),
    [pinchGesture, twoFingerPan],
  );

  // Exclusive gesture handling:
  // - In select mode: only selectPanGesture can run (single finger pan for moving elements)
  // - In draw mode: drawPanGesture runs (single finger for drawing)
  // - Two-finger: always wins via Race, provides zoom+pan
  const composedGesture = useMemo(
    () => {
      if (tool === 'select') {
        // In select mode, use select pan OR two-finger combo
        return Gesture.Race(twoFingerCombo, selectPanGesture);
      }
      // In draw mode, use draw pan OR two-finger combo
      return Gesture.Race(twoFingerCombo, drawPanGesture);
    },
    [tool, twoFingerCombo, drawPanGesture, selectPanGesture],
  );

  const saveCanvas = useCallback(async () => {
    if (!repo) {
      Alert.alert('Repository Required', 'Please select a repository before saving.');
      return;
    }

    const scene: CanvasScene = {
      version: 1,
      width: canvasSize?.width ?? cw,
      height: canvasSize?.height ?? 600,
      background: '#FFFFFF',
      elements,
    };
    const slug = slugifyCanvasTitle(title);
    const canvasFilePath = repo
      ? (existingCanvas?.filePath ?? `canvases/${slug}.json`)
      : undefined;

    if (canvasId) {
      await updateCanvas({ id: canvasId, title, scene, repo, branch, filePath: canvasFilePath, accountId });
    } else {
      await createCanvas({ title, scene, repo, branch, filePath: canvasFilePath, accountId });
    }

    if (repo) {
      const syncResult = await syncCanvasToGitHub({
        repo,
        branch,
        filePath: canvasFilePath,
        title: title.trim(),
        scene,
        accountId,
      });

      if (!syncResult.success) {
        Alert.alert('Sync Failed', syncResult.error || 'Canvas changes were saved locally but could not sync to GitHub.');
      }
    }

    navigation.goBack();
  }, [canvasId, title, elements, canvasSize, cw, repo, branch, existingCanvas, updateCanvas, createCanvas, navigation, accountId]);

  const handleExportPng = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    const fileName = `canvas-export-${Date.now()}.png`;
    const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
    try {
      const pngBytes = await renderSceneToPng(elements, canvasSize?.width ?? cw, canvasSize?.height ?? 600);
      if (!pngBytes) {
        Alert.alert('Nothing to export', 'Add elements to the canvas before exporting.');
        return;
      }
      const base64 = Array.from(pngBytes).map(b => String.fromCharCode(b)).join('');
      await FileSystem.writeAsStringAsync(fileUri, base64, { encoding: FileSystem.EncodingType.Base64 });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'image/png' });
      } else {
        Alert.alert('Sharing unavailable', 'Sharing is not available on this device.');
      }
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      try {
        await FileSystem.deleteAsync(fileUri, { idempotent: true });
      } catch {
        // cleanup failure is non-fatal
      }
      setExporting(false);
    }
  }, [exporting, elements, canvasSize, cw]);

  const renderElement = useCallback(
    (el: CanvasElement, idx: number) => {
      const isSelected = selectedIds.includes(el.id);

      if (el.type === 'stroke') {
        const path = buildStrokePath(el.points);
        if (!path) return null;
        const strokeColor = el.tool === 'highlighter' ? hexToRgba(el.color, 0.3) : el.color;

        return (
          <Group key={el.id ?? idx}>
            <Path path={path} color={strokeColor} style="stroke" strokeWidth={el.width} strokeCap="round" strokeJoin="round" />
          </Group>
        );
      }

      if (el.type === 'shape') {
        const { x1, y1, x2, y2, shape, color: sColor, fillColor, width: sw } = el;
        const minX = Math.min(x1, x2);
        const minY = Math.min(y1, y2);
        const w = Math.abs(x2 - x1);
        const h = Math.abs(y2 - y1);

        if (shape === 'line') {
          return <Path key={el.id ?? idx} path={buildLinePath(x1, y1, x2, y2)} style="stroke" strokeWidth={sw} color={sColor} />;
        }
        if (shape === 'arrow') {
          return <Path key={el.id ?? idx} path={buildArrowPath(x1, y1, x2, y2, sw)} style="stroke" strokeWidth={sw} color={sColor} />;
        }
        if (shape === 'rect') {
          return (
            <Group key={el.id ?? idx}>
              {fillColor && <Rect x={minX} y={minY} width={w} height={h} color={fillColor} />}
              <Rect x={minX} y={minY} width={w} height={h} style="stroke" strokeWidth={sw} color={sColor} />
            </Group>
          );
        }
        if (shape === 'roundRect') {
          return (
            <Group key={el.id ?? idx}>
              {fillColor && <RoundedRect x={minX} y={minY} width={w} height={h} r={10} color={fillColor} />}
              <RoundedRect x={minX} y={minY} width={w} height={h} r={10} style="stroke" strokeWidth={sw} color={sColor} />
            </Group>
          );
        }
        if (shape === 'ellipse') {
          return (
            <Group key={el.id ?? idx}>
              {fillColor && <Oval x={minX} y={minY} width={w} height={h} color={fillColor} />}
              <Oval x={minX} y={minY} width={w} height={h} style="stroke" strokeWidth={sw} color={sColor} />
            </Group>
          );
        }
        if (shape === 'diamond') {
          const dp = buildDiamondPath(x1, y1, x2, y2);
          return (
            <Group key={el.id ?? idx}>
              {fillColor && <Path path={dp} color={fillColor} />}
              <Path path={dp} style="stroke" strokeWidth={sw} color={sColor} />
            </Group>
          );
        }
      }

      if (el.type === 'text') {
        return <SkiaText key={el.id ?? idx} x={el.x} y={el.y} text={el.text} font={textFont} color={el.color} />;
      }

      if (el.type === 'chart') {
        const chartColors = ['#007AFF', '#FF3B30', '#34C759', '#FF9500', '#AF52DE'];
        if (el.chartType === 'bar') {
          const maxVal = Math.max(...el.values, 1);
          const bw = Math.max(8, el.width / Math.max(1, el.values.length) - 4);
          return (
            <Group key={el.id ?? idx}>
              <Rect x={el.x} y={el.y} width={el.width} height={el.height} color="#f5f5f5" />
              {el.values.map((v, i) => (
                <Rect
                  key={`bar-${el.id}-${v}-${el.labels[i]}`}
                  x={el.x + i * (bw + 4) + 2}
                  y={el.y + el.height - (v / maxVal) * el.height}
                  width={bw}
                  height={(v / maxVal) * el.height}
                  color={chartColors[i % chartColors.length]}
                />
              ))}
              {isSelected && (
                <Rect x={el.x - 2} y={el.y - 2} width={el.width + 4} height={el.height + 4} color="#007AFF" style="stroke" strokeWidth={2} />
              )}
            </Group>
          );
        }
        if (el.chartType === 'line') {
          const maxVal = Math.max(...el.values, 1);
          const linePath = Skia.Path.Make();
          el.values.forEach((v, i) => {
            const px = el.x + (i / Math.max(1, el.values.length - 1)) * el.width;
            const py = el.y + el.height - (v / maxVal) * el.height;
            if (i === 0) linePath.moveTo(px, py);
            else linePath.lineTo(px, py);
          });
          return (
            <Group key={el.id ?? idx}>
              <Rect x={el.x} y={el.y} width={el.width} height={el.height} color="#f5f5f5" />
              <Path path={linePath} color="#007AFF" style="stroke" strokeWidth={2} />
              {isSelected && (
                <Rect x={el.x - 2} y={el.y - 2} width={el.width + 4} height={el.height + 4} color="#007AFF" style="stroke" strokeWidth={2} />
              )}
            </Group>
          );
        }
        if (el.chartType === 'pie') {
          const total = el.values.reduce((sum, v) => sum + v, 0) || 1;
          let acc = 0;
          const cx = el.x + el.width / 2;
          const cy = el.y + el.height / 2;
          const r = Math.min(el.width, el.height) / 2;
          return (
            <Group key={el.id ?? idx}>
              {el.values.map((v, i) => {
                const startAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
                acc += v;
                const endAngle = (acc / total) * Math.PI * 2 - Math.PI / 2;
                const slicePath = Skia.Path.Make();
                slicePath.moveTo(cx, cy);
                slicePath.arcToOval(
                  { x: cx - r, y: cy - r, width: r * 2, height: r * 2 },
                  (startAngle * 180) / Math.PI,
                  ((endAngle - startAngle) * 180) / Math.PI,
                  false,
                );
                slicePath.close();
                return <Path key={`pie-${el.id}-${v}-${el.labels[i]}`} path={slicePath} color={chartColors[i % chartColors.length]} />;
              })}
              {isSelected && (
                <Rect x={el.x - 2} y={el.y - 2} width={el.width + 4} height={el.height + 4} color="#007AFF" style="stroke" strokeWidth={2} />
              )}
            </Group>
          );
        }
      }

      if (el.type === 'image') {
        let skImage = imageCacheRef.current.get(el.id);
        if (skImage === undefined) {
          try {
            const data = Skia.Data.fromBase64(el.data);
            skImage = Skia.Image.MakeImageFromEncoded(data) ?? null;
          } catch {
            skImage = null;
          }
          imageCacheRef.current.set(el.id, skImage);
        }
        if (skImage) {
          return (
            <Group key={el.id ?? idx}>
              <SkiaImage image={skImage} x={el.x} y={el.y} width={el.width} height={el.height} fit="fill" />
              {isSelected && (
                <Group>
                  <Rect x={el.x - 2} y={el.y - 2} width={el.width + 4} height={el.height + 4} color="#007AFF" style="stroke" strokeWidth={2} />
                  <Rect x={el.x - 4} y={el.y - 4} width={8} height={8} color="#FFFFFF" />
                  <Rect x={el.x - 4} y={el.y - 4} width={8} height={8} color="#007AFF" style="stroke" strokeWidth={1} />
                  <Rect x={el.x + el.width - 4} y={el.y - 4} width={8} height={8} color="#FFFFFF" />
                  <Rect x={el.x + el.width - 4} y={el.y - 4} width={8} height={8} color="#007AFF" style="stroke" strokeWidth={1} />
                  <Rect x={el.x - 4} y={el.y + el.height - 4} width={8} height={8} color="#FFFFFF" />
                  <Rect x={el.x - 4} y={el.y + el.height - 4} width={8} height={8} color="#007AFF" style="stroke" strokeWidth={1} />
                  <Rect x={el.x + el.width - 4} y={el.y + el.height - 4} width={8} height={8} color="#FFFFFF" />
                  <Rect x={el.x + el.width - 4} y={el.y + el.height - 4} width={8} height={8} color="#007AFF" style="stroke" strokeWidth={1} />
                </Group>
              )}
            </Group>
          );
        }
        return (
          <Group key={el.id ?? idx}>
            <Rect x={el.x} y={el.y} width={el.width} height={el.height} color="#CCCCCC" />
            <Rect x={el.x} y={el.y} width={el.width} height={el.height} color="#999999" style="stroke" strokeWidth={1} />
          </Group>
        );
      }

      return null;
    },
    [selectedIds, textFont],
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          testID="canvas-editor.button.back"
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <TextInput
          testID="canvas-editor.input.title"
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          placeholder="Canvas Title"
          placeholderTextColor={colors.textSecondary}
          autoCapitalize="sentences"
        />
        <TouchableOpacity testID="canvas-editor.button.save" onPress={saveCanvas} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1 }}>
          {TOOLS.map(({ key, label, icon }) => {
            // Tool icon used to inherit the active *pen color*, so on dark
            // mode with the default black pen the icon vanished against
            // the dark toolbar. Render in theme text color (highlighted
            // when the tool is active); the swatch row already shows the
            // pen color separately.
            const isActive = tool === key;
            const iconColor = isActive ? colors.primary : colors.text;
            return (
              <TouchableOpacity
                key={key}
                testID="canvas-editor.toolbar.set-tool"
                style={[styles.toolBtn, isActive && styles.toolBtnActive]}
                onPress={() => { setTool(key); setSelectedIds([]); }}
              >
                {icon ? <Ionicons name={icon} size={20} color={iconColor} /> : <Text style={[styles.toolBtnLabel, { color: iconColor }]}>{label}</Text>}
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity testID="canvas-editor.toolbar.set-filled" style={[styles.toolBtn, filled && styles.toolBtnActive]} onPress={() => setFilled(!filled)}>
            <Text style={[styles.toolBtnLabel, { color: filled ? colors.primary : colors.text }]}>{filled ? '[X]' : '[ ]'}</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity testID="canvas-editor.toolbar.undo" style={styles.toolBtn} onPress={undo}>
            <Ionicons name="arrow-undo" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity testID="canvas-editor.toolbar.clear-all" style={styles.toolBtn} onPress={clearAll}>
            <Ionicons name="trash-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          {selectedIds.length > 0 && (
            <TouchableOpacity testID="canvas-editor.toolbar.animate" style={styles.toolBtn} onPress={() => setAnimModalVisible(true)}>
              <Ionicons name="play-outline" size={20} color={colors.text} />
            </TouchableOpacity>
          )}
          <View style={styles.separator} />
          <TouchableOpacity testID="canvas-editor.toolbar.zoom-out" style={styles.toolBtn} onPress={() => setZoom(scale.value - 0.25)}>
            <Text style={[styles.toolBtnLabel, { color: colors.text }]}>-</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="canvas-editor.toolbar.zoom-in" style={styles.toolBtn} onPress={() => setZoom(scale.value + 0.25)}>
            <Text style={[styles.toolBtnLabel, { color: colors.text }]}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="canvas-editor.toolbar.reset-view" style={styles.toolBtn} onPress={resetView}>
            <Ionicons name="refresh" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity
            testID="canvas-editor.toolbar.export-png"
            style={[styles.toolBtn, exporting && { opacity: 0.5 }]}
            onPress={handleExportPng}
            disabled={exporting}
          >
            <Ionicons name="download-outline" size={20} color={colors.text} />
            <Text style={[styles.toolBtnLabel, { color: colors.text, fontSize: 10 }]}>PNG</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.controls}>
        {COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            testID="canvas-editor.picker.color"
            style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
            onPress={() => setColor(c)}
          />
        ))}
        <TextInput
          testID="canvas-editor.input.size"
          style={styles.sizeInput}
          value={String(size)}
          onChangeText={(v) => setSize(Math.max(1, Math.min(36, parseInt(v, 10) || 1)))}
          keyboardType="number-pad"
          maxLength={2}
        />
      </View>

      <View style={styles.gitContextContainer}>
        <GitContextPicker
          repo={repo}
          branch={branch}
          commit={undefined}
          onRepoChange={setRepo}
          onBranchChange={setBranch}
          onCommitChange={() => undefined}
        />
      </View>

      <GestureDetector gesture={viewportPanGesture}>
        <View
          style={styles.canvasPane}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCanvasSize((prev) => {
              if (prev && prev.width === width && prev.height === height) return prev;
              return { width, height };
            });
          }}
        >
          {canvasSize && (
            <GestureDetector gesture={composedGesture}>
              <Animated.View style={[{ width: canvasSize.width, height: canvasSize.height }, canvasAnimStyle]}>
                <Canvas style={{ width: canvasSize.width, height: canvasSize.height }}>
                  <Fill color="white" />
                  {elements.map((el, idx) => {
                    const rendered = renderElement(el, idx);
                    if (!rendered) return null;
                    if (el.animation) {
                      return <AnimatedCanvasElement key={`anim-${el.id ?? idx}`} element={el}>{rendered}</AnimatedCanvasElement>;
                    }
                    return rendered;
                  })}
                  <Path path={activeStrokePath} color={activeStrokeColor} style="stroke" strokeWidth={activeStrokeWidth} strokeCap="round" strokeJoin="round" />
                  <Path path={activeLinePath} color={activeShapeStrokeColor} style="stroke" strokeWidth={activeShapeStrokeWidth} />
                  <Path path={activeArrowPath} color={activeShapeStrokeColor} style="stroke" strokeWidth={activeShapeStrokeWidth} />
                  <Path path={activeDiamondPath} color={activeShapeStrokeColor} style="stroke" strokeWidth={activeShapeStrokeWidth} />
                  <Group>
                    <Rect x={activeShapeX} y={activeShapeY} width={activeShapeWidth} height={activeShapeHeight} color={activeRectFillColor} />
                    <Rect x={activeShapeX} y={activeShapeY} width={activeShapeWidth} height={activeShapeHeight} style="stroke" strokeWidth={activeRectStrokeWidth} color={activeShapeStrokeColor} />
                  </Group>
                  <Group>
                    <RoundedRect
                      x={activeShapeX}
                      y={activeShapeY}
                      width={activeShapeWidth}
                      height={activeShapeHeight}
                      r={10}
                      color={activeRoundRectFillColor}
                    />
                    <RoundedRect
                      x={activeShapeX}
                      y={activeShapeY}
                      width={activeShapeWidth}
                      height={activeShapeHeight}
                      r={10}
                      style="stroke"
                      strokeWidth={activeRoundRectStrokeWidth}
                      color={activeShapeStrokeColor}
                    />
                  </Group>
                  <Group>
                    <Oval x={activeShapeX} y={activeShapeY} width={activeShapeWidth} height={activeShapeHeight} color={activeEllipseFillColor} />
                    <Oval x={activeShapeX} y={activeShapeY} width={activeShapeWidth} height={activeShapeHeight} style="stroke" strokeWidth={activeEllipseStrokeWidth} color={activeShapeStrokeColor} />
                  </Group>
                </Canvas>
                {lassoRenderTick > 0 && lassoPointsRef.current.length >= 2 && (
                  <Canvas
                    style={{ position: 'absolute', top: 0, left: 0, width: canvasSize.width, height: canvasSize.height }}
                    pointerEvents="none"
                  >
                    {(() => {
                      const pts = lassoPointsRef.current;
                      const p = Skia.Path.Make();
                      p.moveTo(pts[0].x, pts[0].y);
                      for (let i = 1; i < pts.length; i++) {
                        p.lineTo(pts[i].x, pts[i].y);
                      }
                      return <Path path={p} color="#007AFF" style="stroke" strokeWidth={1.5} strokeCap="round" />;
                    })()}
                  </Canvas>
                )}
              </Animated.View>
            </GestureDetector>
          )}
        </View>
      </GestureDetector>

      <Modal visible={textModalVisible} transparent animationType="fade" onRequestClose={() => setTextModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter text</Text>
            <TextInput
              style={styles.modalInput}
              value={textInput}
              onChangeText={setTextInput}
              autoFocus
              autoCapitalize="sentences"
              placeholder="Type here..."
              placeholderTextColor={colors.textSecondary}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setTextModalVisible(false)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="canvas-editor.button.add-text" style={styles.modalBtn} onPress={addTextElement}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={chartModalVisible} transparent animationType="fade" onRequestClose={() => setChartModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Insert Chart</Text>
            <TextInput
              style={styles.modalInput}
              value={chartTitle}
              onChangeText={setChartTitle}
              placeholder="Chart title"
              placeholderTextColor={colors.textSecondary}
            />
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
              {(['bar', 'line', 'pie'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.toolBtn, chartType === t && styles.toolBtnActive]}
                  onPress={() => setChartType(t)}
                >
                  <Text style={[styles.toolBtnLabel, { color: chartType === t ? colors.primary : colors.text }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              value={chartLabelsInput}
              onChangeText={setChartLabelsInput}
              placeholder="Labels: A, B, C"
              placeholderTextColor={colors.textSecondary}
            />
            <TextInput
              style={styles.modalInput}
              value={chartValuesInput}
              onChangeText={setChartValuesInput}
              placeholder="Values: 10, 20, 30"
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setChartModalVisible(false)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="canvas-editor.button.add-chart" style={styles.modalBtn} onPress={addChartElement}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={animModalVisible} transparent animationType="fade" onRequestClose={() => setAnimModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Animate Element</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
              {(['pulse', 'fade', 'spin', 'translate'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.toolBtn, animType === t && styles.toolBtnActive]}
                  onPress={() => setAnimType(t)}
                >
                  <Text style={[styles.toolBtnLabel, { color: animType === t ? colors.primary : colors.text }]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={styles.modalInput}
              value={animDuration}
              onChangeText={setAnimDuration}
              placeholder="Duration (ms): 500-5000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
            />
            <TouchableOpacity
              style={[styles.toolBtn, animLoop && styles.toolBtnActive, { alignSelf: 'flex-start', marginBottom: 8 }]}
              onPress={() => setAnimLoop(!animLoop)}
            >
              <Text style={[styles.toolBtnLabel, { color: animLoop ? colors.primary : colors.text }]}>Loop {animLoop ? 'ON' : 'OFF'}</Text>
            </TouchableOpacity>
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={removeAnimation}>
                <Text style={{ color: '#FF3B30' }}>Remove</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setAnimModalVisible(false)}>
                <Text style={{ color: colors.textSecondary }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity testID="canvas-editor.button.apply-animation" style={styles.modalBtn} onPress={applyAnimation}>
                <Text style={{ color: colors.primary, fontWeight: '600' }}>Apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

type StyleColors = ReturnType<typeof useTheme>['colors'];

const makeStyles = (colors: StyleColors) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  safeArea: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  iconBtn: { padding: 8 },
  iconText: { fontSize: 15, color: colors.primary },
  backBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleInput: {
    flex: 1,
    marginHorizontal: 8,
    height: 36,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  saveBtn: { backgroundColor: colors.primary, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toolbar: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
  },
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 6,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: { backgroundColor: colors.primary + '22', borderColor: colors.primary },
  toolBtnLabel: { fontSize: 16, color: colors.text },
  separator: { width: 1, height: 28, backgroundColor: colors.border, marginHorizontal: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.surface,
    gap: 4,
  },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: colors.border },
  swatchActive: { borderWidth: 2, borderColor: colors.primary, transform: [{ scale: 1.15 }] },
  sizeInput: {
    width: 36,
    height: 28,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 13,
    marginLeft: 8,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  canvasPane: { flex: 1, overflow: 'hidden', backgroundColor: '#E5E5E5' },
  gitContextContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: 300, padding: 16, backgroundColor: colors.surface, borderRadius: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10, color: colors.text },
  modalInput: { height: 40, borderWidth: 1, borderColor: colors.border, borderRadius: 6, paddingHorizontal: 8, fontSize: 15, color: colors.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 16 },
  modalBtn: { paddingVertical: 6, paddingHorizontal: 12 },
});
