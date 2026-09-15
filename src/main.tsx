import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, Navigate, RouterProvider } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { App } from './App';
import { Hub } from './routes/Hub';
import { GamePage } from './routes/GamePage';
import { StatsPage } from './routes/StatsPage';
import { SyncPage } from './routes/SyncPage';
import { OrthopticsExercise } from './exercises/orthoptics/OrthopticsExercise';
import { initSyncOnLoad } from './sync/engine';
import { ENTRY_GAME } from './entryGame';
import './styles/global.css';

initSyncOnLoad();

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      // Normally the Hub. A build with VITE_ENTRY_GAME set (see
      // src/entryGame.ts) skips it and lands straight on that game instead.
      { index: true, element: ENTRY_GAME ? <Navigate to={`/play/${ENTRY_GAME}`} replace /> : <Hub /> },
      { path: 'play/:gameId', element: <GamePage /> },
      { path: 'exercise/orthoptics', element: <OrthopticsExercise /> },
      { path: 'stats', element: <StatsPage /> },
      { path: 'sync', element: <SyncPage /> },
      { path: 'sync/join', element: <SyncPage /> },
    ],
  },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>
  </StrictMode>
);
