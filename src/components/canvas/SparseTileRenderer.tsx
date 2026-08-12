import React, { useEffect, useMemo, useRef } from 'react';
import { Canvas, Group } from '@shopify/react-native-skia';

type GroupProps = React.ComponentProps<typeof Group>;
const TestableGroup = Group as unknown as React.ComponentType<GroupProps & { testID?: string }>;

export interface SparseTile {
  x: number;
  y: number;
  content: string;
}

export interface SparseTileViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SparseTileDirtyBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface SparseTileRendererProps {
  tiles: SparseTile[];
  tileSize: number;
  viewport: SparseTileViewport;
  dirtyBox?: SparseTileDirtyBox;
  onTileRendered?: (tileX: number, tileY: number) => void;
}

const MAX_VISIBLE_TILES = 50;
const RENDER_CALLBACK_DEBOUNCE_MS = 100;

interface Rect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

function tileBounds(tileX: number, tileY: number, tileSize: number): Rect {
  return {
    x1: tileX * tileSize,
    y1: tileY * tileSize,
    x2: (tileX + 1) * tileSize,
    y2: (tileY + 1) * tileSize,
  };
}

function rectsIntersect(a: Rect, b: Rect): boolean {
  return a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
}

function viewportRect(viewport: SparseTileViewport): Rect {
  return {
    x1: viewport.x,
    y1: viewport.y,
    x2: viewport.x + viewport.width,
    y2: viewport.y + viewport.height,
  };
}

export function getVisibleTiles(
  tiles: SparseTile[],
  viewport: SparseTileViewport,
  tileSize: number,
  maxTiles: number = MAX_VISIBLE_TILES,
): SparseTile[] {
  const vp = viewportRect(viewport);
  const visible: SparseTile[] = [];
  for (const tile of tiles) {
    if (visible.length >= maxTiles) break;
    if (rectsIntersect(tileBounds(tile.x, tile.y, tileSize), vp)) {
      visible.push(tile);
    }
  }
  return visible;
}

function getDirtyTiles(
  tiles: SparseTile[],
  dirtyBox: SparseTileDirtyBox,
  tileSize: number,
): SparseTile[] {
  const box: Rect = { x1: dirtyBox.x1, y1: dirtyBox.y1, x2: dirtyBox.x2, y2: dirtyBox.y2 };
  return tiles.filter((tile) => rectsIntersect(tileBounds(tile.x, tile.y, tileSize), box));
}

function shallowEqualTiles(a: SparseTile[], b: SparseTile[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].x !== b[i].x || a[i].y !== b[i].y || a[i].content !== b[i].content) {
      return false;
    }
  }
  return true;
}

function shallowEqualViewport(a: SparseTileViewport, b: SparseTileViewport): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function shallowEqualDirtyBox(
  a: SparseTileDirtyBox | undefined,
  b: SparseTileDirtyBox | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.x1 === b.x1 && a.y1 === b.y1 && a.x2 === b.x2 && a.y2 === b.y2;
}

function propsAreEqual(
  prev: SparseTileRendererProps,
  next: SparseTileRendererProps,
): boolean {
  return (
    prev.tileSize === next.tileSize &&
    prev.onTileRendered === next.onTileRendered &&
    shallowEqualTiles(prev.tiles, next.tiles) &&
    shallowEqualViewport(prev.viewport, next.viewport) &&
    shallowEqualDirtyBox(prev.dirtyBox, next.dirtyBox)
  );
}

const SparseTileRendererComponent: React.FC<SparseTileRendererProps> = ({
  tiles,
  tileSize,
  viewport,
  dirtyBox,
  onTileRendered,
}) => {
  const renderedTiles = useMemo(() => {
    const visible = getVisibleTiles(tiles, viewport, tileSize);
    return dirtyBox ? getDirtyTiles(visible, dirtyBox, tileSize) : visible;
  }, [tiles, viewport, tileSize, dirtyBox]);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<SparseTile[]>([]);
  const callbackRef = useRef(onTileRendered);
  callbackRef.current = onTileRendered;

  useEffect(() => {
    pendingRef.current = renderedTiles;
    if (!callbackRef.current) return;

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      debounceTimerRef.current = null;
      const callback = callbackRef.current;
      if (!callback) return;
      for (const tile of pendingRef.current) {
        callback(tile.x, tile.y);
      }
    }, RENDER_CALLBACK_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [renderedTiles]);

  return (
    <Canvas
      style={{ width: viewport.width, height: viewport.height }}
      testID="sparse-tile-renderer.canvas"
    >
      {renderedTiles.map((tile) => (
        <TestableGroup
          key={`tile-${tile.x}-${tile.y}`}
          transform={[{ translateX: tile.x * tileSize }, { translateY: tile.y * tileSize }]}
          testID={`sparse-tile-renderer.tile-${tile.x}-${tile.y}`}
        />
      ))}
    </Canvas>
  );
};

export const SparseTileRenderer = React.memo(SparseTileRendererComponent, propsAreEqual);

export default SparseTileRenderer;
