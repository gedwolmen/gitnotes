const NODE_SIZE = 72;
const REPULSION = 12000;
const ATTRACTION = 0.012;
const DAMPING = 0.88;
const MIN_DISTANCE = 150;
const CENTERING_FORCE = 0.003;
const COLLISION_RADIUS = 60;

export const SIM_ITERATIONS = 250;

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

export interface LayoutEdge {
  from: string;
  to: string;
}

export function computeForceLayout<T extends { id: string; x: number; y: number }>(
  nodes: T[],
  edges: LayoutEdge[],
  canvasWidth: number,
  canvasHeight: number,
): T[] {
  if (!nodes.length) return [];

  const simNodes = nodes.map((n) => ({ ...n, vx: 0, vy: 0 }));
  const nodeById = new Map(simNodes.map((n) => [n.id, n]));

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
      const source = nodeById.get(edge.from);
      const target = nodeById.get(edge.to);
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

  return simNodes.map((node) => {
    const { vx: _vx, vy: _vy, ...rest } = node;
    void _vx;
    void _vy;
    return rest as unknown as T;
  });
}
