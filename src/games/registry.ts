import { AmblyotrisGame } from './amblyotris/AmblyotrisGame';
import { AmblyonoidGame } from './amblyonoid/AmblyonoidGame';
import { BridgeDockGame } from './bridgedock/BridgeDockGame';
import { FlyingBirdGame } from './flyingbird/FlyingBirdGame';
import { asset } from '@/assets';
import type { GameController, GameDefinition } from './types';

export const GAMES: GameDefinition[] = [
  {
    id: 'amblyotris',
    nameKey: 'game.amblyotris.name',
    descKey: 'game.amblyotris.desc',
    screenshot: asset('/amblyotris/logo.png'),
    controlScheme: 'tetris',
    hasPreview: true,
    boardAspect: 0.5,
    create: (opts) =>
      new AmblyotrisGame({
        board: opts.board,
        nextCanvas: opts.nextCanvas,
        subNextCanvas: opts.subNextCanvas,
        settings: opts.settings,
        soundBasePath: asset('/amblyotris'),
      }) as unknown as GameController,
  },
  {
    id: 'amblyonoid',
    nameKey: 'game.amblyonoid.name',
    descKey: 'game.amblyonoid.desc',
    screenshot: asset('/amblyonoid/logo.svg'),
    controlScheme: 'paddle',
    hasPreview: false,
    boardAspect: 2 / 3,
    create: (opts) =>
      new AmblyonoidGame({
        board: opts.board,
        settings: opts.settings,
        soundBasePath: asset('/amblyotris'),
      }) as unknown as GameController,
  },
  {
    id: 'bridgedock',
    nameKey: 'game.bridgedock.name',
    descKey: 'game.bridgedock.desc',
    screenshot: asset('/bridgedock/logo.svg'),
    controlScheme: 'pointer',
    hasPreview: false,
    boardAspect: 0.75,
    // No dot/piece shape to vary — BridgeDockGame never reads settings.variant.
    settingsCapabilities: { fill: false },
    create: (opts) =>
      new BridgeDockGame({
        board: opts.board,
        settings: opts.settings,
      }) as unknown as GameController,
  },
  {
    id: 'flyingbird',
    nameKey: 'game.flyingbird.name',
    descKey: 'game.flyingbird.desc',
    screenshot: asset('/flyingbird/logo.svg'),
    controlScheme: 'glider',
    hasPreview: false,
    boardAspect: 4 / 3,
    // No dot/piece shape to vary — FlyingBirdGame never reads settings.variant.
    settingsCapabilities: { fill: false },
    create: (opts) =>
      new FlyingBirdGame({
        board: opts.board,
        settings: opts.settings,
      }) as unknown as GameController,
  },
];

export function getGame(id: string | undefined): GameDefinition | undefined {
  return GAMES.find((g) => g.id === id);
}
