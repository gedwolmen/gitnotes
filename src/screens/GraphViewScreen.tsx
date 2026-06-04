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
import SearchBar from '../components/SearchBar';

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
const CANVAS_SIZE = 2000;
const REPULSION = 12000;
const ATTRACTION = 0.012;
const DAMPING = 0.88;
const MIN_DISTANCE = 150;
const CENTERING_FORCE = 0.003;
const COLLISION_RADIUS = 60;
const SIM_ITERATIONS = 250;
const BASE_SCALE = 1.0;
const MIN_SCALE = 0.25;
const MAX_SCALE = 2.5;

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
  const { width: screenWidth } = Dimensions.get('window');

  const canvasWidth = CANVAS_SIZE;
  const canvasHeight = CANVAS_SIZE;

  const scale = useSharedValue(BASE_SCALE);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(BASE_SCALE);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [containerHeight, setContainerHeight] = useState(0);
  const draggingNodeIdRef = useRef<string | null>(null);
  const [localNodes, setLocalNodes] = useState<GraphNode[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

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

    let alpha = 1.0;
    const alphaDecay = 0.02;
    const repulsionRadius = 80;

    for (let iter = 0; iter < SIM_ITERATIONS; iter++) {
      alpha = Math.max(0.001, alpha * (1 - alphaDecay));

      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[j].x - simNodes[i].x;
          const dy = simNodes[j].y - simNodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;

          if (dist < repulsionRadius) {
            simNodes[i].vx -= dx * 0.5;
            simNodes[i].vy -= dy * 0.5;
            simNodes[j].vx += dx * 0.5;
            simNodes[j].vy += dy * 0.5;
          } else {
            const force = REPULSION / (dist * dist);
            const fx = (dx / dist) * force * alpha;
            const fy = (dy / dist) * force * alpha;
            simNodes[i].vx -= fx;
            simNodes[i].vy -= fy;
            simNodes[j].vx += fx;
            simNodes[j].vy += fy;
          }
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
            const force = (dist - MIN_DISTANCE) * ATTRACTION * alpha;
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
        node.vx += (centerX - node.x) * CENTERING_FORCE * alpha;
        node.vy += (centerY - node.y) * CENTERING_FORCE * alpha;
      }

      const collisionPadding = NODE_SIZE / 2 + 20;
      for (let i = 0; i < simNodes.length; i++) {
        for (let j = i + 1; j < simNodes.length; j++) {
          const dx = simNodes[j].x - simNodes[i].x;
          const dy = simNodes[j].y - simNodes[i].y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const minDist = COLLISION_RADIUS * 2;

          if (dist < minDist && dist > 0) {
            const overlap = (minDist - dist) / 2;
            const fx = (dx / dist) * overlap;
            const fy = (dy / dist) * overlap;
            simNodes[i].vx -= fx;
            simNodes[i].vy -= fy;
            simNodes[j].vx += fx;
            simNodes[j].vy += fy;
          }
        }
      }

      for (const node of simNodes) {
        node.vx *= DAMPING;
        node.vy *= DAMPING;
        node.x += node.vx;
        node.y += node.vy;
        node.x = Math.max(collisionPadding, Math.min(canvasWidth - collisionPadding, node.x));
        node.y = Math.max(collisionPadding, Math.min(canvasHeight - collisionPadding, node.y));
      }
    }

    return simNodes.map(({ vx, vy, ...node }) => node);
  }, [nodes, edges, canvasWidth, canvasHeight]);

  useEffect(() => {
    setLocalNodes(layoutNodes);
  }, [layoutNodes]);

  useEffect(() => {
    if (layoutNodes.length > 0 && containerHeight > 0) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      layoutNodes.forEach((n) => {
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      });

      const padding = NODE_SIZE;
      const contentWidth = maxX - minX + padding * 2;
      const contentHeight = maxY - minY + padding * 2;
      const centerX = (minX + maxX) / 2;
      const centerY = (minY + maxY) / 2;

      const availableWidth = screenWidth;
      const availableHeight = containerHeight;
      const fitScaleX = availableWidth / contentWidth;
      const fitScaleY = availableHeight / contentHeight;
      const fitScale = Math.min(fitScaleX, fitScaleY, MAX_SCALE);

      const clampedScale = Math.max(MIN_SCALE, Math.min(fitScale, MAX_SCALE));
      scale.value = clampedScale;
      translateX.value = screenWidth / 2 - centerX * clampedScale;
      translateY.value = headerHeight + 20 + availableHeight / 2 - centerY * clampedScale;
      savedScale.value = clampedScale;
      savedTranslateX.value = screenWidth / 2 - centerX * clampedScale;
      savedTranslateY.value = headerHeight + 20 + availableHeight / 2 - centerY * clampedScale;
    }
  }, [layoutNodes.length, containerHeight, layoutNodes]);

  const handleContainerLayout = (e: LayoutChangeEvent) => {
    setContainerHeight(e.nativeEvent.layout.height);
  };

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return localNodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, localNodes]);

  const isNodeHighlighted = useCallback((node: GraphNode): boolean => {
    if (searchQuery) {
      return node.note.title.toLowerCase().includes(searchQuery.toLowerCase());
    }
    if (!selectedNodeId) return false;
    return node.id === selectedNodeId || node.connections.has(selectedNodeId);
  }, [selectedNodeId, searchQuery]);

  const getNodeAlpha = useCallback((node: GraphNode): number => {
    if (!selectedNodeId && !searchQuery) return 1.0;
    if (searchQuery) {
      return isNodeHighlighted(node) ? 1.0 : 0.2;
    }
    return isNodeHighlighted(node) ? 1.0 : 0.3;
  }, [selectedNodeId, searchQuery, isNodeHighlighted]);

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

  const highlightedEdgeIds = useMemo(() => {
    if (!selectedNodeId) return new Set<string>();
    const highlighted = new Set<string>();
    const selectedNode = localNodes.find((n) => n.id === selectedNodeId);
    if (selectedNode) {
      edges.forEach((edge) => {
        if (edge.from === selectedNodeId || edge.to === selectedNodeId) {
          highlighted.add(`${edge.from}-${edge.to}`);
        }
      });
      selectedNode.connections.forEach((connId) => {
        highlighted.add(`${selectedNodeId}-${connId}`);
        highlighted.add(`${connId}-${selectedNodeId}`);
      });
    }
    return highlighted;
  }, [selectedNodeId, localNodes, edges]);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.max(MIN_SCALE, Math.min(MAX_SCALE, savedScale.value * e.scale));
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

      {notes.length > 0 && (
        <View style={[styles.searchContainer, { backgroundColor: colors.surface }]}>
          <SearchBar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search nodes..."
          />
        </View>
      )}

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
                    strokeWidth={selectedNodeId ? 2.5 : 1.5}
                    opacity={0.4}
                  />

                  {localNodes.map((node) => {
                    const isHighlighted = isNodeHighlighted(node);
                    const nodeAlpha = getNodeAlpha(node);
                    return (
                      <Group key={node.id} opacity={nodeAlpha}>
                        <Circle
                          cx={node.x}
                          cy={node.y}
                          r={isHighlighted ? NODE_SIZE / 2 + 8 : NODE_SIZE / 2 + 4}
                          color={isHighlighted ? colors.primary : colors.background}
                        />
                        <Circle
                          cx={node.x}
                          cy={node.y}
                          r={NODE_SIZE / 2}
                          color={getNodeColor(node)}
                        />
                      </Group>
                    );
                  })}
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
  searchContainer: { paddingHorizontal: 16, paddingVertical: 8 },
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
