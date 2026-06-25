import { useEffect, useRef } from 'react';
import type { DichopticSettings } from '@/engine/dichoptic';
import { statsStore, summarizeSettings } from './store';

export interface RecorderTarget {
  getState(): { playing: boolean };
  getSettings(): DichopticSettings;
}

/**
 * Accrues training time into the stats store while the game is actively playing
 * and the tab is visible, tagged with the live dichoptic settings. Records a
 * session summary on unmount. Idle / paused / backgrounded time is not counted.
 */
export function useTrainingRecorder(game: RecorderTarget | null, gameId: string, getScore: () => number | undefined): void {
  // Keep latest values in refs so the interval closure stays stable.
  const gameRef = useRef(game);
  const scoreRef = useRef(getScore);
  gameRef.current = game;
  scoreRef.current = getScore;

  useEffect(() => {
    if (!game) return;
    const startedAt = new Date().toISOString();
    let last = performance.now();
    let sessionMs = 0;
    let lastSettings = game.getSettings();

    const id = window.setInterval(() => {
      const now = performance.now();
      const delta = now - last;
      last = now;
      const g = gameRef.current;
      if (!g) return;
      // delta guard: skip large jumps (tab was suspended) to avoid bogus time
      if (delta > 0 && delta < 5000 && g.getState().playing && document.visibilityState === 'visible') {
        lastSettings = g.getSettings();
        statsStore.addTraining(gameId, delta, lastSettings);
        sessionMs += delta;
      }
    }, 1000);

    return () => {
      window.clearInterval(id);
      if (sessionMs >= 1000) {
        const score = scoreRef.current();
        statsStore.recordSession({
          game: gameId,
          startedAt,
          durationMs: sessionMs,
          score,
          settings: summarizeSettings(lastSettings),
        });
        if (typeof score === 'number') statsStore.recordScore(gameId, score);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, gameId]);
}
