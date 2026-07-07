import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'es' | 'en';

const STRINGS = {
  es: {
    'app.title': 'Mi Ojo Vago',
    'app.tagline': 'Entrenamiento visual con anteojos anáglifos (rojo/cian) para el ojo vago (ambliopía).',
    'app.disclaimer':
      'Estos juegos son una ayuda de entrenamiento, no un dispositivo médico. El tratamiento de la ambliopía debe ser supervisado por un oftalmólogo u ortoptista.',
    'nav.games': 'Juegos',
    'nav.stats': 'Estadísticas',
    'hub.intro':
      'Usá anteojos anáglifos (un vidrio rojo y uno azul/cian) sobre tus lentes habituales. Cada ojo verá figuras distintas: reducí el contraste del ojo fuerte para estimular el ojo vago.',
    'hub.play': 'JUGAR GRATIS',
    'hub.glassesTitle': '¿No tenés anteojos rojo/cian?',
    'hub.glassesText': 'Necesitás anteojos anáglifos (rojo izquierda / cian derecha) para que el entrenamiento funcione.',
    'game.amblyotris.name': 'Amblyotris',
    'game.amblyotris.desc': 'Una versión del Tetris para personas con ambliopía, con anteojos anáglifos.',
    'game.amblyonoid.name': 'Amblyonoid',
    'game.amblyonoid.desc': 'Una versión del Arkanoid / Breakout para entrenar el ojo vago.',
    'game.bridgedock.name': 'Bridge Dock',
    'game.bridgedock.desc': 'Esquivá los obstáculos que caen moviendo la pelota con el mouse o el dedo.',
    'game.flyingbird.name': 'Pájaro Volador',
    'game.flyingbird.desc': 'Esquivá los obstáculos moviendo el pájaro hacia arriba y abajo, con anteojos anáglifos.',
    'game.orthoptics.name': 'Ortóptica',
    'game.orthoptics.desc': 'Ejercicio de fusión y convergencia: acercá o alejá las figuras para entrenar la visión binocular.',
    'hub.exercisesTitle': 'Ejercicios de convergencia',
    'shell.start': 'Comenzar',
    'shell.resume': 'Continuar',
    'shell.pause': 'Pausa',
    'shell.paused': 'En pausa',
    'shell.menu': 'Menú',
    'shell.reset': 'Reiniciar',
    'shell.settings': 'Configurar',
    'shell.calibrate': 'Calibrar colores',
    'shell.sound': 'Sonido',
    'shell.fullscreen': 'Pantalla completa',
    'shell.back': 'Volver',
    'shell.score': 'PUNTAJE',
    'shell.level': 'NIVEL',
    'shell.rows': 'LÍNEAS',
    'shell.lives': 'VIDAS',
    'shell.next': 'SIGUIENTE',
    'shell.welcome': '¡Bienvenido!',
    'shell.welcomeText':
      'Poné tus anteojos rojo/cian (rojo izquierda, cian derecha) y tocá Comenzar. Usá las flechas del teclado o los botones en pantalla para jugar.',
    'shell.gameover': 'Juego terminado',
    'shell.gameoverText': '¡Buen trabajo! ¿Querés intentarlo de nuevo?',
    'shell.tryAgain': 'Intentar de nuevo',
    'shell.confirmReset': '¿Terminar esta partida y empezar una nueva?',
    'shell.yes': 'Sí',
    'shell.no': 'No',
    'shell.cancel': 'Cancelar',
    'shell.accept': 'Aceptar',
    'settings.title': 'Configuración del juego',
    'settings.palette': 'Paleta de colores',
    'settings.difficulty': 'Dificultad',
    'settings.contrastCyan': 'Contraste cian (un ojo)',
    'settings.contrastRed': 'Contraste rojo (otro ojo)',
    'settings.eyes': 'Ojo con vidrio cian',
    'settings.left': 'Izquierdo',
    'settings.right': 'Derecho',
    'calib.title': 'Calibrar colores',
    'calib.text': 'Ajustá cada color hasta que cada ojo vea sólo su figura a través de los anteojos.',
    'calib.white': 'Fondo',
    'calib.cyan': 'Cian',
    'calib.red': 'Rojo',
    'stats.title': 'Estadísticas de entrenamiento',
    'stats.totalTime': 'Tiempo total',
    'stats.today': 'Hoy',
    'stats.streak': 'Días entrenados',
    'stats.last7': 'Últimos 7 días',
    'stats.byContrast': 'Tiempo por contraste / ojo',
    'stats.sessions': 'Sesiones recientes',
    'stats.noData': 'Todavía no hay datos. ¡Empezá a entrenar!',
    'stats.export': 'Exportar JSON',
    'stats.clear': 'Borrar datos',
    'stats.clearConfirm': '¿Borrar todas las estadísticas? Esta acción no se puede deshacer.',
    'stats.minutes': 'min',
    'stats.date': 'Fecha',
    'stats.duration': 'Duración',
    'stats.bestScore': 'Mejor puntaje',
    'common.none': '—',
  },
  en: {
    'app.title': 'My Lazy Eye',
    'app.tagline': 'Vision training with anaglyph (red/cyan) glasses for lazy eye (amblyopia).',
    'app.disclaimer':
      'These games are a training aid, not a medical device. Amblyopia treatment should be supervised by an ophthalmologist or orthoptist.',
    'nav.games': 'Games',
    'nav.stats': 'Stats',
    'hub.intro':
      'Wear anaglyph glasses (one red lens, one blue/cyan) over your usual glasses. Each eye sees different figures: lower the strong eye’s contrast to stimulate the lazy eye.',
    'hub.play': 'PLAY FREE',
    'hub.glassesTitle': "Don't have red/cyan glasses?",
    'hub.glassesText': 'You need anaglyph glasses (red left / cyan right) for the training to work.',
    'game.amblyotris.name': 'Amblyotris',
    'game.amblyotris.desc': 'A Tetris built for people with amblyopia, using anaglyph glasses.',
    'game.amblyonoid.name': 'Amblyonoid',
    'game.amblyonoid.desc': 'An Arkanoid / Breakout to train the lazy eye.',
    'game.bridgedock.name': 'Bridge Dock',
    'game.bridgedock.desc': 'Dodge the falling obstacles by moving the ball with your mouse or finger.',
    'game.flyingbird.name': 'Flying Bird',
    'game.flyingbird.desc': 'Dodge the obstacles by gliding your bird up and down, with anaglyph glasses.',
    'game.orthoptics.name': 'Orthoptics',
    'game.orthoptics.desc': 'Fusion and convergence exercise: bring the shapes together or apart to train binocular vision.',
    'hub.exercisesTitle': 'Convergence exercises',
    'shell.start': 'Start',
    'shell.resume': 'Resume',
    'shell.pause': 'Pause',
    'shell.paused': 'Paused',
    'shell.menu': 'Menu',
    'shell.reset': 'Restart',
    'shell.settings': 'Settings',
    'shell.calibrate': 'Calibrate colors',
    'shell.sound': 'Sound',
    'shell.fullscreen': 'Fullscreen',
    'shell.back': 'Back',
    'shell.score': 'SCORE',
    'shell.level': 'LEVEL',
    'shell.rows': 'LINES',
    'shell.lives': 'LIVES',
    'shell.next': 'NEXT',
    'shell.welcome': 'Welcome!',
    'shell.welcomeText': 'Put on your red/cyan glasses (red left, cyan right) and tap Start. Use the keyboard arrows or the on-screen buttons to play.',
    'shell.gameover': 'Game over',
    'shell.gameoverText': 'Nice work! Want to try again?',
    'shell.tryAgain': 'Try again',
    'shell.confirmReset': 'End this game and start a new one?',
    'shell.yes': 'Yes',
    'shell.no': 'No',
    'shell.cancel': 'Cancel',
    'shell.accept': 'OK',
    'settings.title': 'Game settings',
    'settings.palette': 'Color palette',
    'settings.difficulty': 'Difficulty',
    'settings.contrastCyan': 'Cyan contrast (one eye)',
    'settings.contrastRed': 'Red contrast (other eye)',
    'settings.eyes': 'Eye wearing the cyan lens',
    'settings.left': 'Left',
    'settings.right': 'Right',
    'calib.title': 'Color calibration',
    'calib.text': 'Adjust each color until each eye sees only its own figure through the glasses.',
    'calib.white': 'Background',
    'calib.cyan': 'Cyan',
    'calib.red': 'Red',
    'stats.title': 'Training statistics',
    'stats.totalTime': 'Total time',
    'stats.today': 'Today',
    'stats.streak': 'Days trained',
    'stats.last7': 'Last 7 days',
    'stats.byContrast': 'Time by contrast / eye',
    'stats.sessions': 'Recent sessions',
    'stats.noData': 'No data yet. Start training!',
    'stats.export': 'Export JSON',
    'stats.clear': 'Clear data',
    'stats.clearConfirm': 'Delete all statistics? This cannot be undone.',
    'stats.minutes': 'min',
    'stats.date': 'Date',
    'stats.duration': 'Duration',
    'stats.bestScore': 'Best score',
    'common.none': '—',
  },
} as const;

export type StringKey = keyof (typeof STRINGS)['es'];

interface I18nContextValue {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);
const LANG_KEY = 'miojovago.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => (localStorage.getItem(LANG_KEY) as Lang) || 'es');
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    localStorage.setItem(LANG_KEY, l);
    document.documentElement.lang = l;
  }, []);
  const t = useCallback((key: StringKey) => STRINGS[lang][key] ?? key, [lang]);
  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}
