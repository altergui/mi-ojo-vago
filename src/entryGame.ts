/**
 * Deploy-time knob for a hub-less, login-less single-game build (see
 * docs/deploy-cpanel.md, "tetris" test target). Set `VITE_ENTRY_GAME` to a
 * registered game id and the build skips the Hub entirely, landing straight
 * on that game with no header, nav, or login badge. Unset (the default), the
 * app behaves exactly as it does today.
 */
export const ENTRY_GAME = import.meta.env.VITE_ENTRY_GAME as string | undefined;

export const isStandaloneEntry = Boolean(ENTRY_GAME);
