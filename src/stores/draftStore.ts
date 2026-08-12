/**
 * DraftStateStore — in-memory zustand store for AI-generated canvas commands
 * awaiting user accept/discard decisions.
 *
 * Supports per-command + batch operations with atomic undo via transaction ID.
 * Commands flow: CanvasVisionService returns them → stored here → user accepts
 * individual or batch commands → applied to confirmed tiles via callback → removed
 * from this store with undo stack push.
 *
 * Non-persistent: lives only for the active canvas editor session.
 * Pattern reference: aiHubStore.ts (simple state + action interface).
 */

import { create } from 'zustand';
import type { CanvasCommand } from '../services/canvas/VisionResponseParser';

export type DraftCommandStatus = 'pending' | 'accepted';

export interface DraftCommand extends CanvasCommand {
  id: string;
  transactionId: string;
  checked?: boolean; // UI checkbox state
  createdAt: number;
}

interface DraftState {
  commands: DraftCommand[];
  currentTransactionId: string | null;
}

interface DraftActions {
  /**
   * Initialize a new batch of draft commands with a shared transaction ID.
   * Called after CanvasVisionService.transcribe() succeeds. Returns the
   * transaction ID for caller reference.
   */
  addDraftCommands: (commands: Omit<DraftCommand, 'id' | 'transactionId' | 'createdAt'>[]) => string;

  /** Toggle the per-command checkbox. */
  toggleChecked: (commandId: string) => void;

  /** Accept a single command (calls apply callback, removes from store, pushes undo). */
  acceptCommand: (commandId: string, apply: (cmd: DraftCommand) => void, pushUndo: (transactionId: string) => void) => void;

  /** Discard a single command (removes from store, no effect on canvas). */
  discardCommand: (commandId: string) => void;

  /** Accept all checked commands atomically (one undo record with the transaction ID). */
  batchAcceptChecked: (apply: (cmds: DraftCommand[]) => void, pushUndo: (transactionId: string) => void) => void;

  /** Accept EVERY pending command atomically (one undo record). */
  batchAcceptAll: (apply: (cmds: DraftCommand[]) => void, pushUndo: (transactionId: string) => void) => void;

  /** Discard every pending command (no undo record, no canvas changes). */
  batchDiscardAll: () => void;

  /** Clear the store entirely (used on editor unmount / session reset). */
  reset: () => void;
}

function makeId(): string {
  return `dr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function makeTransactionId(): string {
  return `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useDraftStore = create<DraftState & DraftActions>()((set, get) => ({
  commands: [],
  currentTransactionId: null,

  addDraftCommands: (commands) => {
    const transactionId = makeTransactionId();
    const now = Date.now();
    const drafted: DraftCommand[] = commands.map((c: any) => ({
      ...c,
      id: makeId(),
      transactionId,
      createdAt: now,
      checked: false,
    }));
    set((state) => ({
      commands: [...state.commands, ...drafted],
      currentTransactionId: transactionId,
    }));
    return transactionId;
  },

  toggleChecked: (commandId) => {
    set((state) => ({
      commands: state.commands.map((c) =>
        c.id === commandId ? { ...c, checked: !c.checked } : c,
      ),
    }));
  },

  acceptCommand: (commandId, apply, pushUndo) => {
    const { commands } = get();
    const target = commands.find((c) => c.id === commandId);
    if (!target) return;

    // Apply to canvas first; let apply throw propagate normally.
    apply(target);
    pushUndo(target.transactionId);

    set((state) => ({
      commands: state.commands.filter((c) => c.id !== commandId),
    }));
  },

  discardCommand: (commandId) => {
    set((state) => ({
      commands: state.commands.filter((c) => c.id !== commandId),
    }));
  },

  batchAcceptChecked: (apply, pushUndo) => {
    const { commands } = get();
    const checked = commands.filter((c) => c.checked && c.transactionId);
    if (checked.length === 0) return;

    const transactionId = checked[0].transactionId;
    // All checked commands must share the same transaction ID for atomic undo
    const allSameTxn = checked.every((c) => c.transactionId === transactionId);
    if (!allSameTxn) {
      console.warn('[DraftStore] batchAcceptChecked: mixed transaction IDs, aborting');
      return;
    }

    apply(checked);
    pushUndo(transactionId);

    set((state) => ({
      commands: state.commands.filter((c) => !c.checked || c.transactionId !== transactionId),
    }));
  },

  batchAcceptAll: (apply, pushUndo) => {
    const { commands } = get();
    if (commands.length === 0) return;

    const transactionId = commands[0].transactionId;
    apply(commands);
    pushUndo(transactionId);

    set({ commands: [] });
  },

  batchDiscardAll: () => {
    set({ commands: [], currentTransactionId: null });
  },

  reset: () => {
    set({ commands: [], currentTransactionId: null });
  },
}));

/** Hook for selecting commands — returns count of pending commands. */
export const usePendingCount = () => useDraftStore((s) => s.commands.length);
export const useCheckedCount = () => useDraftStore((s) => s.commands.filter((c) => c.checked).length);
