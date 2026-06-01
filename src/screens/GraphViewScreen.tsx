import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, Pressable, LayoutChangeEvent } from 'react-native';
import { Canvas, Skia, Path, Circle, Group } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, runOnJS } from 'react-native-reanimated';

import { useNotes } from '../contexts/NoteContext';
import { useTheme } from '../contexts/ThemeContext';
import { useViewMode } from '../contexts/ViewModeContext';
import { useAIStore } from '../stores/aiStore';
import { Note } from '../models/Note';
import { buildBacklinkIndex } from '../services/BacklinksService';
import { parseWikiLinks } from '../utils/wikiLinksParser';
import { RootStackParamList } from '../navigation/types';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ScreenHeader, useScreenHeaderHeight, useTabBarHeight } from '../components/ui';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface GraphNode {
  id: string;
  note: Note;
  x: number;
  y: number;
  connections: Set<string>;
}

interface GraphEdge {
  from: string;
  to: string;
}

const NODE_SIZE = 72;
const CANVAS_SIZE = 1500;
const REPULSION = 8000;
const ATTRACTION = 0.008;
const DAMPING = 0.85;
const MIN_DISTANCE = 120;

function getNodeDisplayTitle(title: string, maxLen = 10): string {
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 1) + '…';
}

export default function GraphViewScreen() {
  const navigation = useNavigation<NavigationProp>();
  const { colors } = useTheme();
  const { notes } = useNotes();
  const { setViewMode } = useViewMode();
  const setChatRepo = useAIStore((s) => s.setChatRepo);
  const headerHeight = useScreenHeaderHeight();
  const tabBarHeight = useTabBarHeight();
  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

  const canvasWidth = CANVAS_SIZE;
  const canvasHeight = CANVAS_SIZE;

  const scale = useSharedValue(0.6);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(0.6);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const draggingNodeIdRef = useRef<string | null>(null);
  const [localNodes, setLocalNodes] = useState<GraphNode[]>([]);

  const { nodes, edges } = useMemo(() => {
    if (!notes.length) {
      return { nodes: [], edges: [] };
    }

    const nodeMap = new Map<string, GraphNode>();
    const graphEdges: GraphEdge[] = [];

    notes.forEach((note, index) => {
      const angle = (index / notes.length) * 2 * Math.PI;
      const radius = Math.min(canvasWidth, canvasHeight) / 4;
      nodeMap.set(note.id, {
        id: note.id,
        note,
        x: canvasWidth / 2 + Math.cos(angle) * radius,
        y: canvasHeight / 2 + Math.sin(angle) * radius,
        connections: new Set(),
      });
    });

    notes.forEach((note) => {
      const links = parseWikiLinks(note.content);
      links.forEach((link) => {
        const targetNote = notes.find(
          (n) =>
            n.title.toLowerCase() === link.target.toLowerCase() ||
            n.filePath?.toLowerCase().includes(link.target.toLowerCase())
        );
        if (targetNote && targetNote.id !== note.id) {
          graphEdges.push({ from: note.id, to: targetNote.id });
          nodeMap.get(note.id)?.connections.add(targetNote.id);
          nodeMap.get(targetNote.id)?.connections.add(note.id);
        }
      });
    });

    const backlinkIndex = buildBacklinkIndex(notes);
    notes.forEach((note) => {
      const backlinks = backlinkIndex.get(note.id) || [];
      backlinks.forEach((bl) => {
        if (bl.sourceNoteId !== note.id) {
          graphEdges.push({ from: bl.sourceNoteId, to: note.id });
          nodeMap.get(bl.sourceNoteId)?.connections.add(note.id);
          nodeMap.get(note.id)?.connections.add(bl.sourceNoteId);
        }
      });
    });

    return {
      nodes: Array.from(nodeMap.values()),
      edges: graphEdges,
    };
  }, [notes, canvasWidth, canvasHeight]);

  const layoutNodes = useMemo(() => {
    if (!nodes.length) return [];

    const simNodes = nodes.map((n) => ({ ...n, vx: 0, vy: 0 }));

    for (let iter = 0; iter < 150; iter++) {
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[j].x - simNodes[i].x;
          const dy = simNodes[j].y - simNodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = REPULSION / (dist * dist);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          simNodes[i].vx -= fx;
          simNodes[i].vy -= fy;
          simNodes[j].vx += fx;
          simNodes[j].vy += fy;
        }
      }

      for (const edge of edges) {
        const source = simNodes.find((n) => n.id === edge.from);
        const target = simNodes.find((n) => n.id === edge.to);
        if (source && target) {
          const dx = target.x - source.x;
          const dy = target.y - source.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          if (dist > MIN_DISTANCE) {
            const force = (dist - MIN_DISTANCE) * ATTRACTION;
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            source.vx += fx;
            source.vy += fy;
            target.vx -= fx;
            target.vy -= fy;
          }
        }
      }

      const centerX = canvasWidth / 2;
      const centerY = canvasHeight / 2;
      for (const node of simNodes) {
        node.vx += (centerX - node.x) * 0.002;
        node.vy += (centerY - node.y) * 0.002;
      }

      for (const node of simNodes) {
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(NODE_SIZE / 2 + 40, Math.min(canvasWidth - NODE_SIZE / 2 - 40, node.x));
        node.y = Math.max(NODE_SIZE / 2 + 40, Math.min(canvasHeight - NODE_SIZE / 2 - 40, node.y));
      }
    }

    return simNodes.map(({ vx, vy, ...node }) => node);
  }, [nodes, edges, canvasWidth, canvasHeight]);

  useEffect(() => {
    setLocalNodes(layoutNodes);
  }, [layoutNodes]);

  useEffect(() => {
    if (layoutNodes.length > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      layoutNodes.forEach((n) => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      });

      const contentWidth = maxX - minX + NODE_SIZE * 2;
      const contentHeight = maxY - minY + NODE_SIZE * 2;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const availableWidth = screenWidth;
      const availableHeight = containerHeight > 0 ? containerHeight : screenHeight - headerHeight - tabBarHeight - 60;
      const fitScale = Math.min(availableWidth / contentWidth, availableHeight / contentHeight, 1.5);

      scale.value = fitScale;
      translateX.value = screenWidth / 2 - centerX * fitScale;
      translateY.value = (headerHeight + 20) + availableHeight / 2 - centerY * fitScale;
      savedScale.value = fitScale;
      savedTranslateX.value = screenWidth / 2 - centerX * fitScale;
      savedTranslateY.value = (headerHeight + 20) + availableHeight / 2 - centerY * fitScale;
    }
  }, [layoutNodes.length, containerHeight]);

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  };

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return localNodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, localNodes]);

  const handleNodePress = useCallback((nodeId: string) => {
    setSelectedNodeId(nodeId);
  }, []);

  const handleNodeLongPress = useCallback((node: GraphNode) => {
    if (node.note.repo && node.note.branch) {
      setChatRepo(node.note.repo, node.note.branch.split('/')[0], node.note.branch);
    }
    setSelectedNodeId(node.id);
  }, [setChatRepo]);

  const handleOpenNote = useCallback(() => {
    if (selectedNode) {
      setViewMode('list');
      navigation.navigate('NoteEditor', { noteId: selectedNode.note.id });
    }
  }, [selectedNode, navigation, setViewMode]);

  const handleCloseScreen = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const handleNodeDragStart = useCallback((nodeId: string) => {
    draggingNodeIdRef.current = nodeId;
  }, []);

  const handleNodeDrag = useCallback((nodeId: string, dx: number, dy: number) => {
    setLocalNodes((prev) =>
      prev.map((n) => {
        if (n.id === nodeId) {
          const newX = Math.max(NODE_SIZE / 2 + 40, Math.min(canvasWidth - NODE_SIZE / 2 - 40, n.x + dx / scale.value));
          const newY = Math.max(NODE_SIZE / 2 + 40, Math.min(canvasHeight - NODE_SIZE / 2 - 40, n.y + dy / scale.value));
          return { ...n, x: newX, y: newY };
        }
        return n;
      })
    );
  }, [scale, canvasWidth, canvasHeight]);

  const handleNodeDragEnd = useCallback(() => {
    draggingNodeIdRef.current = null;
  }, []);

  const getNodeColor = useCallback(
    (node: GraphNode) => {
      if (node.note.color) {
        switch (node.note.color) {
          case 'red': return '#ef4444';
          case 'orange': return '#f97316';
          case 'yellow': return '#eab308';
          case 'green': return '#22c55e';
          case 'blue': return '#3b82f6';
          case 'purple': return '#a855f7';
          case 'pink': return '#ec4899';
          case 'gray': return '#6b7280';
        }
      }
      return colors.primary;
    },
    [colors]
  );

  const edgePath = useMemo(() => {
    const path = Skia.Path.Make();
    edges.forEach((edge) => {
      const source = localNodes.find((n) => n.id === edge.from);
      const target = localNodes.find((n) => n.id === edge.to);
      if (source && target) {
        path.moveTo(source.x, source.y);
        path.lineTo(target.x, target.y);
      }
    });
    return path;
  }, [edges, localNodes]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(0.2, Math.min(3, savedScale.value * e.scale));
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (draggingNodeIdRef.current) {
        runOnJS(handleNodeDrag)(draggingNodeIdRef.current, e.translationX, e.translationY);
      } else {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (draggingNodeIdRef.current) {
        runOnJS(handleNodeDragEnd)();
      } else {
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const composedGesture = Gesture.Simultaneous(pinchGesture, panGesture);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <SafeAreaView edges={[]} style={[styles.container, { backgroundColor: colors.background }]}>
      <ScreenHeader
        title="Graph View"
        onBack={handleCloseScreen}
      />

      <View style={styles.content} onLayout={handleContainerLayout}>
        {notes.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="git-network-outline" size={64} color={colors.textSecondary} />
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              No notes to display
            </Text>
            <Text style={[styles.emptySubtext, { color: colors.textSecondary }]}>
              Create notes with [[wiki links]] to see connections
            </Text>
          </View>
        ) : (
          <GestureDetector gesture={composedGesture}>
            <Animated.View style={[styles.canvasWrapper, animatedStyle]}>
              <View style={{ width: canvasWidth, height: canvasHeight }}>
                <Canvas style={{ width: canvasWidth, height: canvasHeight }}>
                  <Path
                    path={edgePath}
                    color={colors.border}
                    style="stroke"
                    strokeWidth={2}
                    opacity={0.5}
                  />

                  {localNodes.map((node) => (
                    <Group key={node.id}>
                      <Circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_SIZE / 2 + 4}
                        color={colors.background}
                      />
                      <Circle
                        cx={node.x}
                        cy={node.y}
                        r={NODE_SIZE / 2}
                        color={getNodeColor(node)}
                      />
                    </Group>
                  ))}
                </Canvas>

                {localNodes.map((node) => (
                  <Pressable
                    key={node.id}
                    onPress={() => handleNodePress(node.id)}
                    onLongPress={() => handleNodeLongPress(node)}
                    onPressIn={() => handleNodeDragStart(node.id)}
                    style={[
                      styles.nodeTouchable,
                      {
                        left: node.x - NODE_SIZE / 2,
                        top: node.y - NODE_SIZE / 2,
                        width: NODE_SIZE,
                        height: NODE_SIZE,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.nodeInner,
                        { backgroundColor: getNodeColor(node) },
                      ]}
                    >
                      <Text style={styles.nodeText} numberOfLines={2}>
                        {getNodeDisplayTitle(node.note.title, 9)}
                      </Text>
                    </View>
                    <View style={[styles.nodeBadge, { backgroundColor: colors.surface }]}>
                      <Text style={[styles.nodeBadgeText, { color: colors.text }]}>
                        {node.connections.size}
                      </Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          </GestureDetector>
        )}

        {selectedNode && (
          <View style={[styles.nodeInfo, { backgroundColor: colors.surface, borderColor: colors.border }]}>
            <View style={styles.nodeInfoHeader}>
              <View style={[styles.nodeColorDot, { backgroundColor: getNodeColor(selectedNode) }]} />
              <Text style={[styles.nodeTitle, { color: colors.text }]} numberOfLines={1}>
                {selectedNode.note.title}
              </Text>
            </View>
            <Text style={[styles.nodeMeta, { color: colors.textSecondary }]}>
              {selectedNode.connections.size} connection{selectedNode.connections.size !== 1 ? 's' : ''}
            </Text>
            <View style={styles.nodeInfoActions}>
              <TouchableOpacity
                style={[styles.openButton, { backgroundColor: colors.primary }]}
                onPress={handleOpenNote}
              >
                <Text style={styles.openButtonText}>Open Note</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>

      <View style={[styles.legend, { backgroundColor: colors.surface }]}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Notes</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendLine, { backgroundColor: colors.border }]} />
          <Text style={[styles.legendText, { color: colors.textSecondary }]}>Links</Text>
        </View>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>·</Text>
        <Text style={[styles.hintText, { color: colors.textSecondary }]}>
          Drag nodes to move them
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeButton: { padding: 8 },
  content: { flex: 1 },
  canvasWrapper: { flex: 1 },
  nodeTouchable: {
    position: 'absolute',
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  nodeInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  nodeText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '700',
    textAlign: 'center',
  },
  nodeBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 3,
  },
  nodeBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: { fontSize: 18, fontWeight: '600', marginTop: 16 },
  emptySubtext: { fontSize: 14, textAlign: 'center', marginTop: 8 },
  nodeInfo: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    right: 16,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
  },
  nodeInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  nodeColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  nodeTitle: { fontSize: 17, fontWeight: '700', flex: 1 },
  nodeMeta: { fontSize: 13, marginTop: 6, marginLeft: 22 },
  nodeInfoActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  openButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    alignItems: 'center',
  },
  openButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  legend: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 12,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  legendLine: { width: 20, height: 2 },
  legendText: { fontSize: 12 },
  hintText: { fontSize: 11 },
});
