import React, {
  createContext,
  ReactNode,
  RefObject,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { LayoutChangeEvent, View } from 'react-native';

interface DragPoint {
  x: number;
  y: number;
}

interface DragTargetRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RegisteredDropTarget {
  enabled: boolean;
  onDrop: (payload: string) => void;
  measure: () => void;
}

interface DragDropContextValue {
  isDragging: boolean;
  activeTargetId: string | null;
  startDrag: (payload: string, point: DragPoint) => void;
  updateDrag: (point: DragPoint) => void;
  endDrag: () => void;
  cancelDrag: () => void;
  registerDropTarget: (id: string, target: RegisteredDropTarget) => () => void;
  updateTargetRect: (id: string, rect: DragTargetRect | null) => void;
}

const DragDropContext = createContext<DragDropContextValue | null>(null);

export function DragDropBoundary({ children }: { children: ReactNode }) {
  const parentContext = useContext(DragDropContext);
  if (parentContext) {
    return <>{children}</>;
  }

  return <DragDropProvider>{children}</DragDropProvider>;
}

export function DragDropProvider({ children }: { children: ReactNode }) {
  const [isDragging, setIsDragging] = useState(false);
  const [activeTargetId, setActiveTargetId] = useState<string | null>(null);
  const dragPayloadRef = useRef<string | null>(null);
  const targetsRef = useRef(new Map<string, RegisteredDropTarget>());
  const targetRectsRef = useRef(new Map<string, DragTargetRect>());
  const activeTargetIdRef = useRef<string | null>(null);

  const updateActiveTarget = useCallback((nextTargetId: string | null) => {
    activeTargetIdRef.current = nextTargetId;
    setActiveTargetId((currentTargetId) => (currentTargetId === nextTargetId ? currentTargetId : nextTargetId));
  }, []);

  const resolveTargetId = useCallback((point: DragPoint) => {
    for (const [id, target] of Array.from(targetsRef.current.entries())) {
      if (!target.enabled) {
        continue;
      }

      const rect = targetRectsRef.current.get(id);
      if (!rect) {
        continue;
      }

      const isInside = point.x >= rect.x
        && point.x <= rect.x + rect.width
        && point.y >= rect.y
        && point.y <= rect.y + rect.height;

      if (isInside) {
        return id;
      }
    }

    return null;
  }, []);

  const refreshTargetMeasurements = useCallback(() => {
    for (const target of Array.from(targetsRef.current.values())) {
      target.measure();
    }
  }, []);

  const startDrag = useCallback((payload: string, point: DragPoint) => {
    dragPayloadRef.current = payload;
    setIsDragging(true);
    refreshTargetMeasurements();
    requestAnimationFrame(() => {
      updateActiveTarget(resolveTargetId(point));
    });
  }, [refreshTargetMeasurements, resolveTargetId, updateActiveTarget]);

  const updateDrag = useCallback((point: DragPoint) => {
    if (!dragPayloadRef.current) {
      return;
    }

    updateActiveTarget(resolveTargetId(point));
  }, [resolveTargetId, updateActiveTarget]);

  const finishDrag = useCallback((shouldDrop: boolean) => {
    const payload = dragPayloadRef.current;
    const targetId = activeTargetIdRef.current;

    dragPayloadRef.current = null;
    updateActiveTarget(null);
    setIsDragging(false);

    if (!shouldDrop || !payload || !targetId) {
      return;
    }

    const target = targetsRef.current.get(targetId);
    target?.onDrop(payload);
  }, [updateActiveTarget]);

  const endDrag = useCallback(() => {
    finishDrag(true);
  }, [finishDrag]);

  const cancelDrag = useCallback(() => {
    finishDrag(false);
  }, [finishDrag]);

  const registerDropTarget = useCallback((id: string, target: RegisteredDropTarget) => {
    targetsRef.current.set(id, target);

    return () => {
      targetsRef.current.delete(id);
      targetRectsRef.current.delete(id);
      if (activeTargetIdRef.current === id) {
        updateActiveTarget(null);
      }
    };
  }, [updateActiveTarget]);

  const updateTargetRect = useCallback((id: string, rect: DragTargetRect | null) => {
    if (!rect) {
      targetRectsRef.current.delete(id);
      return;
    }

    targetRectsRef.current.set(id, rect);
  }, []);

  const value = useMemo<DragDropContextValue>(() => ({
    isDragging,
    activeTargetId,
    startDrag,
    updateDrag,
    endDrag,
    cancelDrag,
    registerDropTarget,
    updateTargetRect,
  }), [activeTargetId, cancelDrag, endDrag, isDragging, registerDropTarget, startDrag, updateDrag, updateTargetRect]);

  return (
    <DragDropContext.Provider value={value}>
      {children}
    </DragDropContext.Provider>
  );
}

function useDragDropContext() {
  const context = useContext(DragDropContext);
  if (!context) {
    throw new Error('DragDropProvider is required for drag and drop interactions.');
  }

  return context;
}

let targetIdCounter = 0;

interface UseDropTargetOptions {
  enabled?: boolean;
  onDrop: (payload: string) => void;
}

export function useDropTarget({ enabled = true, onDrop }: UseDropTargetOptions) {
  const { activeTargetId, isDragging, registerDropTarget, updateTargetRect } = useDragDropContext();
  const targetIdRef = useRef(`drop-target-${targetIdCounter += 1}`);
  const viewRef = useRef<View>(null);

  const measure = useCallback(() => {
    viewRef.current?.measureInWindow((x, y, width, height) => {
      if (width <= 0 || height <= 0) {
        updateTargetRect(targetIdRef.current, null);
        return;
      }

      updateTargetRect(targetIdRef.current, { x, y, width, height });
    });
  }, [updateTargetRect]);

  useEffect(() => registerDropTarget(targetIdRef.current, { enabled, onDrop, measure }), [enabled, measure, onDrop, registerDropTarget]);

  const onLayout = useCallback((_event: LayoutChangeEvent) => {
    requestAnimationFrame(measure);
  }, [measure]);

  return {
    ref: viewRef as RefObject<View>,
    onLayout,
    isActive: isDragging && activeTargetId === targetIdRef.current,
  };
}

export function useDragDrop() {
  return useDragDropContext();
}
