import { Navigate, useParams } from 'react-router-dom';
import { getGame } from '@/games/registry';
import { GameShell } from '@/components/GameShell';

export function GamePage() {
  const { gameId } = useParams();
  const def = getGame(gameId);
  if (!def) return <Navigate to="/" replace />;
  return <GameShell key={def.id} def={def} />;
}
