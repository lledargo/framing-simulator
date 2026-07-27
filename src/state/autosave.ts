import { useEffect, useRef } from 'react';
import { parseProject, projectToJson } from '../core/project';
import { useStore } from './store';

const STORAGE_KEY = 'framing-simulator:autosave';
const DEBOUNCE_MS = 600;

/**
 * Autosave to localStorage.
 *
 * The container this runs in is disposable and a browser tab is easy to close
 * by accident, so the model is written back on a short debounce rather than
 * only on an explicit Save. Failures are swallowed: a full quota or a locked
 * private-mode store should not take the app down mid-edit.
 */
export function useAutosave(): void {
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const saved = safeRead();
    if (!saved) return;

    try {
      const parsed = parseProject(saved);
      if (parsed.boards.length === 0) return;
      useStore.getState().loadProjectJson(saved);
      // Restoring is not an edit; clear it so the first Undo doesn't wipe the
      // model the user just came back to.
      useStore.temporal.getState().clear();
    } catch {
      safeRemove();
    }
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const unsubscribe = useStore.subscribe((state, previous) => {
      if (
        state.boards === previous.boards &&
        state.constraints === previous.constraints &&
        state.name === previous.name &&
        state.settings.units === previous.settings.units
      ) {
        return;
      }

      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        const current = useStore.getState();
        safeWrite(
          projectToJson({
            name: current.name,
            units: current.settings.units,
            boards: current.boards,
            constraints: current.constraints,
          }),
        );
      }, DEBOUNCE_MS);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsubscribe();
    };
  }, []);
}

function safeRead(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function safeWrite(value: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // Quota exceeded or storage unavailable — not worth interrupting the user.
  }
}

function safeRemove(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Ignore.
  }
}
