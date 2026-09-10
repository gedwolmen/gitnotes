export type OperationActivityAction = 'begin' | 'end' | 'none';

export interface OperationActivityTransition {
  active: boolean;
  action: OperationActivityAction;
}

export function operationActivityTransition(
  wasActive: boolean,
  runningCount: number,
): OperationActivityTransition {
  const active = runningCount > 0;
  if (active === wasActive) return { active, action: 'none' };
  return { active, action: active ? 'begin' : 'end' };
}
