/** requestAnimationFrame with a setTimeout fallback (ported from game.ts:30). */
export const requestAnimFrame: (cb: FrameRequestCallback) => number =
  typeof window !== 'undefined' && window.requestAnimationFrame
    ? window.requestAnimationFrame.bind(window)
    : (cb: FrameRequestCallback) => window.setTimeout(() => cb(performance.now()), 1000 / 60);
