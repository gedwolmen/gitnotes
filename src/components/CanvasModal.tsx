import React, { useCallback, useMemo, useState } from 'react';
import { Modal, View, StyleSheet, TouchableOpacity, Text, ScrollView, TextInput, Alert, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Canvas as SkiaCanvas,
  Path,
  Rect,
  Oval,
  RoundedRect,
  Fill,
  Group,
  Skia,
  useCanvasRef,
} from '@shopify/react-native-skia';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import * as FileSystem from 'expo-file-system/legacy';
import { runOnJS, useDerivedValue, useSharedValue } from 'react-native-reanimated';

export interface CanvasSavePayload {
  uri: string;
  name: string;
  jsonUri: string;
  jsonName: string;
  width?: number;
  height?: number;
  size?: number;
}

interface CanvasModalProps {
  visible: boolean;
  onSave: (payload: CanvasSavePayload) => void;
  onClose: () => void;
  editJsonUri?: string;
}

type Point = { x: number; y: number };
type ToolIconName = React.ComponentProps<typeof Ionicons>['name'];

interface DrawStroke {
  id: string;
  tool: 'pen' | 'highlighter' | 'eraser';
  color: string;
  width: number;
  points: Point[];
}

interface DrawShape {
  id: string;
  shape: 'line' | 'rect' | 'roundRect' | 'ellipse' | 'diamond' | 'arrow';
  color: string;
  fillColor?: string;
  width: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

type DrawElement = DrawStroke | DrawShape;

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
];

function uid(): string {
  'worklet';
  return `dm-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
}

function buildStrokePath(points: Point[]) {
  if (points.length === 0) return null;
  const p = Skia.Path.Make();
  p.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    p.lineTo(points[i].x, points[i].y);
  }
  return p;
}

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function buildArrowPath(x1: number, y1: number, x2: number, y2: number, sw: number) {
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

function buildDiamondPath(x1: number, y1: number, x2: number, y2: number) {
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

function buildLinePath(x1: number, y1: number, x2: number, y2: number) {
  const p = Skia.Path.Make();
  p.moveTo(x1, y1);
  p.lineTo(x2, y2);
  return p;
}

export default function CanvasModal({ visible, onSave, onClose, editJsonUri }: CanvasModalProps) {
  const insets = useSafeAreaInsets();
  const canvasRef = useCanvasRef();
  const [elements, setElements] = useState<DrawElement[]>([]);
  const [, setHistory] = useState<string[]>([]);
  const [tool, setTool] = useState('pen');
  const [color, setColor] = useState('#000000');
  const [size, setSize] = useState(3);
  const [filled, setFilled] = useState(false);
  const activeDrawingElement = useSharedValue<DrawElement | null>(null);
  const activeStrokePath = useSharedValue(Skia.Path.Make().setIsVolatile(true));

  React.useEffect(() => {
    if (!visible) return;
    if (!editJsonUri) {
      setElements([]);
      setHistory([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const raw = await FileSystem.readAsStringAsync(editJsonUri);
        const parsed = JSON.parse(raw);
        if (cancelled) return;
        if (Array.isArray(parsed?.elements)) {
          setElements(parsed.elements as DrawElement[]);
        } else if (Array.isArray(parsed)) {
          setElements(parsed as DrawElement[]);
        }
        setHistory([]);
      } catch (err) {
        console.warn('Canvas load error:', err);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, editJsonUri]);

  const [canvasSize, setCanvasSize] = useState<{ width: number; height: number } | null>(null);

  const saveHistory = useCallback(() => {
    setHistory((prev) => {
      const next = [...prev, JSON.stringify(elements)];
      return next.length > 20 ? next.slice(-20) : next;
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
  }, [saveHistory]);

  const commitActiveDrawing = useCallback((element: DrawElement | null) => {
    if (element) {
      setElements((prev) => [...prev, element]);
    }
  }, []);

  const activeStrokeColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || !('points' in element)) return 'transparent';
    return element.tool === 'highlighter' ? hexToRgba(element.color, 0.3) : element.color;
  });
  const activeStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'points' in element ? element.width : 0;
  });
  const activeLinePath = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || !('shape' in element) || element.shape !== 'line') return Skia.Path.Make();
    return buildLinePath(element.x1, element.y1, element.x2, element.y2);
  });
  const activeArrowPath = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || !('shape' in element) || element.shape !== 'arrow') return Skia.Path.Make();
    return buildArrowPath(element.x1, element.y1, element.x2, element.y2, element.width);
  });
  const activeDiamondPath = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (!element || !('shape' in element) || element.shape !== 'diamond') return Skia.Path.Make();
    return buildDiamondPath(element.x1, element.y1, element.x2, element.y2);
  });
  const activeShapeRect = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    if (
      !element
      || !('shape' in element)
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
    return element && 'shape' in element ? element.color : 'transparent';
  });
  const activeRectFillColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element && element.shape === 'rect' ? element.fillColor ?? 'transparent' : 'transparent';
  });
  const activeRoundRectFillColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element && element.shape === 'roundRect' ? element.fillColor ?? 'transparent' : 'transparent';
  });
  const activeEllipseFillColor = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element && element.shape === 'ellipse' ? element.fillColor ?? 'transparent' : 'transparent';
  });
  const activeShapeStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element ? element.width : 0;
  });
  const activeRectStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element && element.shape === 'rect' ? element.width : 0;
  });
  const activeRoundRectStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element && element.shape === 'roundRect' ? element.width : 0;
  });
  const activeEllipseStrokeWidth = useDerivedValue(() => {
    const element = activeDrawingElement.value;
    return element && 'shape' in element && element.shape === 'ellipse' ? element.width : 0;
  });

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart((e) => {
          'worklet';
          const pt = { x: e.x, y: e.y };
          runOnJS(saveHistory)();

          if (tool === 'pen' || tool === 'highlighter' || tool === 'eraser') {
            activeStrokePath.value.rewind();
            activeStrokePath.value.moveTo(pt.x, pt.y);
            activeDrawingElement.value = {
              id: uid(),
              tool: tool === 'eraser' ? 'eraser' : tool === 'highlighter' ? 'highlighter' : 'pen',
              color: tool === 'eraser' ? '#FFFFFF' : color,
              width: tool === 'eraser' ? size * 3 : tool === 'highlighter' ? size * 5 : size,
              points: [pt],
            };
          } else {
            activeStrokePath.value.rewind();
            activeDrawingElement.value = {
              id: uid(),
              shape: tool as DrawShape['shape'],
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
          const active = activeDrawingElement.value;
          if (!active) return;

          if ('points' in active) {
            activeStrokePath.value.lineTo(pt.x, pt.y);
            activeDrawingElement.value = { ...active, points: [...active.points, pt] };
          } else {
            activeDrawingElement.value = { ...active, x2: pt.x, y2: pt.y };
          }
        })
        .onEnd(() => {
          'worklet';
          const completedElement = activeDrawingElement.value;
          activeDrawingElement.value = null;
          activeStrokePath.value.rewind();
          runOnJS(commitActiveDrawing)(completedElement);
        }),
    [tool, color, size, filled, saveHistory, commitActiveDrawing, activeDrawingElement, activeStrokePath],
  );

  const handleSave = useCallback(async () => {
    const image = canvasRef.current?.makeImageSnapshot();
    if (!image) {
      Alert.alert('Error', 'Canvas not ready.');
      return;
    }
    try {
      const base64 = image.encodeToBase64();
      const dir = `${FileSystem.documentDirectory}canvas-drawings/`;
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
      }

      let baseName: string;
      if (editJsonUri) {
        const lastSlash = editJsonUri.lastIndexOf('/');
        const file = editJsonUri.slice(lastSlash + 1);
        baseName = file.replace(/\.json$/i, '');
      } else {
        baseName = `canvas-${Date.now()}`;
      }

      const name = `${baseName}.png`;
      const jsonName = `${baseName}.json`;
      const uri = `${dir}${name}`;
      const jsonUri = `${dir}${jsonName}`;

      await FileSystem.writeAsStringAsync(uri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const json = JSON.stringify({
        version: 1,
        width: image.width(),
        height: image.height(),
        elements,
      });
      await FileSystem.writeAsStringAsync(jsonUri, json);

      const info = await FileSystem.getInfoAsync(uri);
      onSave({
        uri,
        name,
        jsonUri,
        jsonName,
        width: image.width(),
        height: image.height(),
        size: info.exists && 'size' in info ? (info as { size?: number }).size : undefined,
      });
    } catch (err) {
      console.error('Canvas save error:', err);
      Alert.alert('Error', 'Failed to save drawing.');
      return;
    }
    setElements([]);
    setHistory([]);
    setTool('pen');
    setColor('#000000');
    setSize(3);
    setFilled(false);
  }, [canvasRef, onSave, editJsonUri, elements]);

  const handleClose = useCallback(() => {
    setElements([]);
    setHistory([]);
    onClose();
  }, [onClose]);

  const renderElement = (el: DrawElement, idx: number) => {
    if ('points' in el) {
      const path = buildStrokePath(el.points);
      if (!path) return null;
      const strokeColor = el.tool === 'highlighter' ? hexToRgba(el.color, 0.3) : el.color;

      return (
        <Group key={el.id ?? idx}>
          <Path path={path} color={strokeColor} style="stroke" strokeWidth={el.width} strokeCap="round" strokeJoin="round" />
        </Group>
      );
    }

    if ('shape' in el) {
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

    return null;
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View
        style={[
          styles.container,
          {
            paddingTop: Math.max(insets.top, Platform.OS === 'android' ? StatusBar.currentHeight ?? 0 : 0),
            paddingBottom: insets.bottom,
          },
        ]}
      >
        <View style={styles.header}>
          <TouchableOpacity testID="canvas-modal.button.close" onPress={handleClose} style={styles.headerBtn}>
            <Ionicons name="close" size={24} color="#fff" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Canvas</Text>
          <TouchableOpacity testID="canvas-modal.button.save" onPress={handleSave} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {TOOLS.map(({ key, label, icon }) => (
              <TouchableOpacity
                key={key}
                style={[styles.toolBtn, tool === key && styles.toolBtnActive]}
                onPress={() => setTool(key)}
              >
                {icon ? <Ionicons name={icon} size={20} color={color} /> : <Text style={styles.toolBtnLabel}>{label}</Text>}
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
              <Ionicons name="trash-outline" size={20} color={color} />
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
            <GestureDetector gesture={panGesture}>
              <SkiaCanvas ref={canvasRef} style={{ width: canvasSize.width, height: canvasSize.height }}>
                <Fill color="white" />
                {elements.map(renderElement)}
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
              </SkiaCanvas>
            </GestureDetector>
          )}
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1c1c1e' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  headerTitle: { fontSize: 17, fontWeight: '600', color: '#fff' },
  headerBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  saveBtn: { backgroundColor: '#007AFF', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 6 },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  toolbar: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
  },
  toolBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 6,
    marginRight: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolBtnActive: { backgroundColor: '#002a6e', borderColor: '#007AFF' },
  toolBtnLabel: { fontSize: 16, color: '#fff' },
  separator: { width: 1, height: 28, backgroundColor: '#3a3a3c', marginHorizontal: 4 },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#3a3a3c',
    gap: 4,
  },
  swatch: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: 'transparent' },
  swatchActive: { borderColor: '#fff', transform: [{ scale: 1.2 }] },
  sizeInput: {
    width: 36,
    height: 28,
    borderWidth: 1,
    borderColor: '#3a3a3c',
    borderRadius: 4,
    textAlign: 'center',
    fontSize: 13,
    color: '#fff',
    marginLeft: 8,
    backgroundColor: '#2c2c2e',
  },
  canvasPane: { flex: 1, overflow: 'hidden', backgroundColor: '#fff' },
});
