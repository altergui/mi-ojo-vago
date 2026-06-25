import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { I18nProvider } from './i18n';
import { App } from './App';
import { Hub } from './routes/Hub';
import { GamePage } from './routes/GamePage';
import { StatsPage } from './routes/StatsPage';
import './styles/global.css';

const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <Hub /> },
      { path: 'play/:gameId', element: <GamePage /> },
      { path: 'stats', element: <StatsPage /> },
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
