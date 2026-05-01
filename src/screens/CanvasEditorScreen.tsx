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
  matchFont,
  Text as SkiaText,
} from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useCanvases } from '../contexts/CanvasContext';
import {
  CanvasScene,
  CanvasElement,
  CanvasStroke,
  CanvasShape,
  CanvasText,
  DEFAULT_SCENE,
  slugifyCanvasTitle,
} from '../models/Canvas';
import GitContextPicker from '../components/GitContextPicker';
import { syncCanvasToGitHub } from '../services/CanvasGitHubSyncService';
import type { RootStackParamList } from '../navigation/types';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'CanvasEditor'>;
type RouteType = RouteProp<RootStackParamList, 'CanvasEditor'>;
type Point = { x: number; y: number };

const COLORS = ['#000000', '#FFFFFF', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#5856D6', '#AF52DE', '#FF2D55'];
const TOOLS = [
  { key: 'pen', label: '✏️' },
  { key: 'highlighter', label: '🖊' },
  { key: 'eraser', label: '🧹' },
  { key: 'line', label: '╱' },
  { key: 'arrow', label: '→' },
  { key: 'rect', label: '□' },
  { key: 'roundRect', label: '⬜' },
  { key: 'ellipse', label: '○' },
  { key: 'diamond', label: '◇' },
  { key: 'text', label: 'T' },
  { key: 'select', label: '☝️' },
];

function uid(): string {
  return `el-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildStrokePath(points: Point[]): SkPath | null {
  if (points.length === 0) return null;
  const p = Skia.Path.Make();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    p.lineTo(points[i].x, points[i].y);
  }
  return p;
}

function buildArrowPath(x1: number, y1: number, x2: number, y2: number, sw: number): SkPath {
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
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  return p;
}

export default function CanvasEditorScreen() {
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

  const cw = canvasWidth ?? Dimensions.get('window').width;
  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  const [title, setTitle] = useState(canvasTitle ?? 'Untitled Canvas');
  const existingCanvas = canvasId ? getCanvasById(canvasId) : undefined;
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

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const setZoom = useCallback(
    (next: number) => {
      const clamped = Math.max(0.5, Math.min(4, next));
      scale.value = withSpring(clamped, { mass: 0.5, damping: 14, stiffness: 200 });
    },
    [scale],
  );

  const resetView = useCallback(() => {
    scale.value = withSpring(1, { mass: 0.5, damping: 14, stiffness: 200 });
    translateX.value = withSpring(0, { mass: 0.5, damping: 14, stiffness: 200 });
    translateY.value = withSpring(0, { mass: 0.5, damping: 14, stiffness: 200 });
  }, [scale, translateX, translateY]);

  const canvasAnimStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [repo, setRepo] = useState<string | undefined>(existingCanvas?.repo);
  const [branch, setBranch] = useState<string | undefined>(existingCanvas?.branch);
  const dragStartRef = useRef<Point | null>(null);
  const isDrawingRef = useRef(false);

  const textFont = useMemo(
    () =>
      matchFont({
        fontFamily: Platform.select({ ios: 'Helvetica', default: 'serif' }),
        fontSize: 20,
        fontWeight: 'normal' as const,
      }),
    [],
  );

  const saveHistory = useCallback(() => {
    setHistory((prev) => {
      const next = [...prev, JSON.stringify(elements)];
      return next.length > 40 ? next.slice(-40) : next;
    });
  }, [elements]);

  const undo = useCallback(() => {
    setHistory((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setElements(JSON.parse(last));
      return prev.slice(0, -1);
    });
  }, []);

  const clearAll = useCallback(() => {
    saveHistory();
    setElements([]);
    setSelectedId(null);
  }, [saveHistory]);

  const hitTest = useCallback((el: CanvasElement, px: number, py: number): boolean => {
    const pad = 8;
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
    return false;
  }, []);

  const moveElement = useCallback((el: CanvasElement, dx: number, dy: number): CanvasElement => {
    if (el.type === 'stroke') {
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    }
    if (el.type === 'shape') {
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    }
    if (el.type === 'text') {
      return { ...el, x: el.x + dx, y: el.y + dy };
    }
    if (el.type === 'chart') {
      return { ...el, x: el.x + dx, y: el.y + dy };
    }
    return el;
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .maxPointers(1)
        .runOnJS(true)
        .onStart((e) => {
          const pt = { x: e.x, y: e.y };
          dragStartRef.current = pt;

          if (tool === 'text') {
            setTextPosition(pt);
            setTextInput('');
            setTextModalVisible(true);
            return;
          }

          if (tool === 'select') {
            for (let i = elements.length - 1; i >= 0; i--) {
              if (hitTest(elements[i], pt.x, pt.y)) {
                setSelectedId(elements[i].id);
                return;
              }
            }
            setSelectedId(null);
            return;
          }

          isDrawingRef.current = true;
          saveHistory();

          if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
            const stroke: CanvasStroke = {
              type: 'stroke',
              id: uid(),
              tool: tool === 'eraser' ? 'eraser' : tool === 'highlighter' ? 'highlighter' : 'pen',
              color: tool === 'eraser' ? '#FFFFFF' : color,
              width: tool === 'eraser' ? size * 3 : tool === 'highlighter' ? size * 5 : size,
              points: [pt],
            };
            setElements((prev) => [...prev, stroke]);
          } else {
            const shape: CanvasShape = {
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
            setElements((prev) => [...prev, shape]);
          }
        })
        .onChange((e) => {
          if (!dragStartRef.current) return;
          const pt = { x: e.x, y: e.y };

          if (tool === 'select' && selectedId) {
            const dx = pt.x - dragStartRef.current.x;
            const dy = pt.y - dragStartRef.current.y;
            setElements((prev) => prev.map((el) => (el.id === selectedId ? moveElement(el, dx, dy) : el)));
            dragStartRef.current = pt;
            return;
          }

          if (!isDrawingRef.current) return;

          setElements((prev) => {
            const clone = [...prev];
            const last = clone[clone.length - 1];
            if (!last) return clone;

            if (last.type === 'stroke') {
              clone[clone.length - 1] = { ...last, points: [...last.points, pt] };
            } else if (last.type === 'shape') {
              clone[clone.length - 1] = { ...last, x2: pt.x, y2: pt.y };
            }
            return clone;
          });
        })
        .onEnd(() => {
          isDrawingRef.current = false;
          dragStartRef.current = null;
        }),
    [tool, color, size, filled, elements, selectedId, hitTest, moveElement, saveHistory],
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
          scale.value = Math.max(0.5, Math.min(4, next));
        }),
    [scale, savedScale],
  );

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
          translateX.value = savedTx.value + e.translationX;
          translateY.value = savedTy.value + e.translationY;
        }),
    [translateX, translateY, savedTx, savedTy],
  );

  const composedGesture = useMemo(
    () => Gesture.Simultaneous(panGesture, pinchGesture, twoFingerPan),
    [panGesture, pinchGesture, twoFingerPan],
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
      await updateCanvas({ id: canvasId, title, scene, repo, branch, filePath: canvasFilePath });
    } else {
      await createCanvas({ title, scene, repo, branch, filePath: canvasFilePath });
    }

    if (repo) {
      const syncResult = await syncCanvasToGitHub({
        repo,
        branch,
        filePath: canvasFilePath,
        title: title.trim(),
        scene,
      });

      if (!syncResult.success) {
        console.warn('[CanvasEditor] GitHub sync failed:', syncResult.error);
      }
    }

    navigation.goBack();
  }, [canvasId, title, elements, canvasSize, cw, repo, branch, existingCanvas, updateCanvas, createCanvas, navigation]);

  const renderElement = useCallback(
    (el: CanvasElement, idx: number) => {
      const isSelected = el.id === selectedId;

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

      return null;
    },
    [selectedId, textFont],
  );

  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={28} color="#007AFF" />
        </TouchableOpacity>
        <TextInput style={styles.titleInput} value={title} onChangeText={setTitle} placeholder="Canvas Title" />
        <TouchableOpacity onPress={saveCanvas} style={styles.saveBtn}>
          <Text style={styles.saveBtnText}>Save</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.toolbar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          {TOOLS.map(({ key, label }) => (
            <TouchableOpacity
              key={key}
              style={[styles.toolBtn, tool === key && styles.toolBtnActive]}
              onPress={() => { setTool(key); setSelectedId(null); }}
            >
              <Text style={styles.toolBtnLabel}>{label}</Text>
            </TouchableOpacity>
          ))}
          <TouchableOpacity style={[styles.toolBtn, filled && styles.toolBtnActive]} onPress={() => setFilled(!filled)}>
            <Text style={styles.toolBtnLabel}>{filled ? '▣' : '□'}</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.toolBtn} onPress={undo}>
            <Text style={styles.toolBtnLabel}>↩</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={clearAll}>
            <Text style={styles.toolBtnLabel}>🗑</Text>
          </TouchableOpacity>
          <View style={styles.separator} />
          <TouchableOpacity style={styles.toolBtn} onPress={() => setZoom(scale.value - 0.25)}>
            <Text style={styles.toolBtnLabel}>−</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={() => setZoom(scale.value + 0.25)}>
            <Text style={styles.toolBtnLabel}>+</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toolBtn} onPress={resetView}>
            <Text style={styles.toolBtnLabel}>⟲</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      <View style={styles.controls}>
        {COLORS.map((c) => (
          <TouchableOpacity
            key={c}
            style={[styles.swatch, { backgroundColor: c }, color === c && styles.swatchActive]}
            onPress={() => setColor(c)}
          />
        ))}
        <TextInput
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
          onCommitChange={() => {}}
        />
      </View>

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
                {elements.map(renderElement)}
              </Canvas>
            </Animated.View>
          </GestureDetector>
        )}
      </View>

      <Modal visible={textModalVisible} transparent animationType="fade" onRequestClose={() => setTextModalVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Enter text</Text>
            <TextInput
              style={styles.modalInput}
              value={textInput}
              onChangeText={setTextInput}
              autoFocus
              placeholder="Type here..."
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalBtn} onPress={() => setTextModalVisible(false)}>
                <Text>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.modalBtn} onPress={addTextElement}>
                <Text style={{ color: '#007AFF', fontWeight: '600' }}>Add</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  safeArea: { flex: 1 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  iconBtn: { padding: 8 },
  iconText: { fontSize: 15, color: '#007AFF' },
  backBtn: { paddingVertical: 8, paddingHorizontal: 4, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  titleInput: {
    flex: 1,
    marginHorizontal: 8,
    height: 36,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 15,
  },
  saveBtn: { backgroundColor: '#007AFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toolbar: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
  },
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 6,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: { backgroundColor: '#e0ecff', borderColor: '#007AFF' },
  toolBtnLabel: { fontSize: 16 },
  separator: { width: 1, height: 28, backgroundColor: '#ddd', marginHorizontal: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#ddd',
    gap: 4,
  },
  swatch: { width: 22, height: 22, borderRadius: 11, borderWidth: 1, borderColor: '#ccc' },
  swatchActive: { borderWidth: 2, borderColor: '#007AFF', transform: [{ scale: 1.15 }] },
  sizeInput: {
    width: 36,
    height: 28,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 13,
    marginLeft: 8,
  },
  canvasPane: { flex: 1, overflow: 'hidden' },
  gitContextContainer: { paddingHorizontal: 16, paddingVertical: 8 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center' },
  modalCard: { width: 300, padding: 16, backgroundColor: '#fff', borderRadius: 12 },
  modalTitle: { fontSize: 16, fontWeight: '600', marginBottom: 10 },
  modalInput: { height: 40, borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingHorizontal: 8, fontSize: 15 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12, gap: 16 },
  modalBtn: { paddingVertical: 6, paddingHorizontal: 12 },
});
