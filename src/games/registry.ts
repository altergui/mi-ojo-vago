import { AmblyotrisGame } from './amblyotris/AmblyotrisGame';
import { AmblyonoidGame } from './amblyonoid/AmblyonoidGame';
import type { GameController, GameDefinition } from './types';

export const GAMES: GameDefinition[] = [
  {
    id: 'amblyotris',
    nameKey: 'game.amblyotris.name',
    descKey: 'game.amblyotris.desc',
    screenshot: '/assets/amblyotris/logo.png',
    controlScheme: 'tetris',
    hasPreview: true,
    boardAspect: 0.5,
    create: (opts) =>
      new AmblyotrisGame({
        board: opts.board,
        nextCanvas: opts.nextCanvas,
        subNextCanvas: opts.subNextCanvas,
        settings: opts.settings,
        soundBasePath: '/assets/amblyotris',
      }) as unknown as GameController,
  },
  {
    id: 'amblyonoid',
    nameKey: 'game.amblyonoid.name',
    descKey: 'game.amblyonoid.desc',
    screenshot: '/assets/amblyonoid/logo.svg',
    controlScheme: 'paddle',
    hasPreview: false,
    boardAspect: 2 / 3,
    create: (opts) =>
      new AmblyonoidGame({
        board: opts.board,
        settings: opts.settings,
        soundBasePath: '/assets/amblyotris',
      }) as unknown as GameController,
  },
];

export function getGame(id: string | undefined): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}
