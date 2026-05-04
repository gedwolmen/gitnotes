import { useCallback, useReducer } from 'react';

type State = {
  text: string;
  past: string[];
  future: string[];
};

type Action =
  | { type: 'set'; text: string }
  | { type: 'undo' }
  | { type: 'redo' };

const HISTORY_LIMIT = 100;

function capHistory(entries: string[]): string[] {
  return entries.length > HISTORY_LIMIT ? entries.slice(entries.length - HISTORY_LIMIT) : entries;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'set': {
      if (action.text === state.text) return state;
      return {
        text: action.text,
        past: capHistory([...state.past, state.text]),
        future: [],
      };
    }
    case 'undo': {
      if (state.past.length === 0) return state;
      const previous = state.past[state.past.length - 1];
      return {
        text: previous,
        past: state.past.slice(0, -1),
        future: [...state.future, state.text],
      };
    }
    case 'redo': {
      if (state.future.length === 0) return state;
      const next = state.future[state.future.length - 1];
      return {
        text: next,
        past: capHistory([...state.past, state.text]),
        future: state.future.slice(0, -1),
      };
    }
  }
}

export interface UseUndoRedoReturn {
  text: string;
  setText: (t: string) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useUndoRedo(initialText: string): UseUndoRedoReturn {
  const [state, dispatch] = useReducer(reducer, {
    text: initialText,
    past: [],
    future: [],
  });

  const setText = useCallback((text: string) => {
    dispatch({ type: 'set', text });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'undo' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'redo' });
  }, []);

  return {
    text: state.text,
    setText,
    undo,
    redo,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  };
}
