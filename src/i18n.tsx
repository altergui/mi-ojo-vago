import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export type Lang = 'es' | 'en';

/**
 * Resolves `?lang=` from a `location.search` string (e.g. a legacy deep-link
 * redirect landing with `#/play/amblyotris?lang=en`). `null` means "don't
 * touch the current language" — no param, or a value we don't recognize.
 */
export function langFromSearch(search: string): Lang | null {
  const requested = new URLSearchParams(search).get('lang');
  return requested === 'es' || requested === 'en' ? requested : null;
}

const STRINGS = {
  es: {
    'app.title': 'Mi Ojo Vago',
    'app.tagline': 'Entrenamiento visual con anteojos anáglifos (rojo/cian) para el ojo vago (ambliopía).',
    'nav.games': 'Juegos',
    'nav.stats': 'Estadísticas',
    'hub.about1':
      'Esta página gratuita ha sido posible gracias a un grupo de programadores con problemas visuales que trabajaron mano a mano con oftalmólogos y ortoptistas para desarrollarla. Si quiere colaborar aquí tiene más información. Solo deberá comprar alguno de los anteojos sugeridos al pie que son necesarios para los jueguitos.',
    'hub.about2':
      'En el ojo vago (ambliopía) hay un ojo que ve menos para fijar y leer. El ojo que fija bien ve mejor que el otro. Por ello todos los juegos de esta página se pueden configurar para que el ojo bueno tenga figuras de menos contraste para que así se estimule el ojo vago.',
    'hub.about3':
      'El PC Orthoptics por otro lado, permite entrenar la visión en forma binocular mejorando a quienes tienen mala convergencia y por ello se cansan de leer. Y además en los casos de ambliopía ayuda a mejorar la visión en forma binocular bajando el contraste del ojo bueno.',
    'hub.about4':
      'Los otros cuatro jueguitos son para el ojo vago y funcionan tanto en forma binocular como dicotópicamente, pues tienen ambos tipos de estímulo. El Tetris también incluye distintos tipos de contraste en los estímulos.',
    'hub.play': 'JUGAR GRATIS',
    'hub.trainFree': 'ENTRENAR GRATIS',
    'hub.glassesTitle': '¿No tenés anteojos rojo/cian?',
    'hub.glassesText': 'Necesitás anteojos anáglifos (rojo/cian) para que el entrenamiento funcione.',
    'hub.glasses.seeMore': 'VER MÁS',
    'hub.glasses.piramideName': 'Lentes Rojo-Azul Anáglifos',
    'hub.glasses.mercadolibreName': 'Anteojo 3D Rojo y Azul Anáglifo',
    'hub.glasses.bernellName': 'HTS Red/Blue Goggle',
    'hub.marioTitle': 'Dr. Mario Cerrella',
    'hub.marioVisualTraining': 'Visual Training',
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
    'shell.start': 'Comenzar',
    'shell.resume': 'Continuar',
    'shell.pause': 'Pausa',
    'shell.paused': 'En pausa',
    'shell.menu': 'Menú',
    'shell.reset': 'Reiniciar',
    'shell.settings': 'Configurar',
    'shell.sound': 'Sonido',
    'shell.fullscreen': 'Pantalla completa',
    'shell.back': 'Volver',
    'shell.score': 'PUNTAJE',
    'shell.level': 'NIVEL',
    'shell.rows': 'LÍNEAS',
    'shell.lives': 'VIDAS',
    'shell.next': 'SIGUIENTE',
    'shell.gameover': 'Juego terminado',
    'shell.gameoverText': '¡Buen trabajo! ¿Querés intentarlo de nuevo?',
    'shell.tryAgain': 'Intentar de nuevo',
    'shell.confirmReset': '¿Terminar esta partida y empezar una nueva?',
    'shell.yes': 'Sí',
    'shell.no': 'No',
    'shell.cancel': 'Cancelar',
    'shell.accept': 'Aceptar',
    'settings.title': 'Configuración del juego',
    'settings.calibration': 'Calibración',
    'settings.contrastHelp': 'Ayuda sobre el contraste',
    'settings.contrastHelpText': 'Tapate con la mano el ojo vago y disminuí el contraste del color que ves con el ojo bueno.',
    'palette.white': 'Blanco',
    'palette.violet': 'Violeta',
    'settings.fill': 'Relleno',
    'variant.filled': 'Relleno',
    'variant.hollowLine': 'Rayado',
    'variant.hollow': 'Hueco',
    'settings.redEyeLabel': 'Ojo con vidrio rojo',
    'settings.left': 'Izquierdo',
    'settings.right': 'Derecho',
    'calib.background': 'Fondo',
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
    'stats.clearConfirm': '¿Borrar todas las estadísticas? Esto borra los datos en TODOS tus dispositivos sincronizados, no solo este. Esta acción no se puede deshacer.',
    'stats.loginRequired': 'Iniciá sesión para ver tus estadísticas.',
    'stats.minutes': 'min',
    'stats.date': 'Fecha',
    'stats.duration': 'Duración',
    'stats.bestScore': 'Mejor puntaje',
    'common.none': '—',
    'sync.title': 'Sincronizar entre dispositivos',
    'sync.disabledIntro': 'Podés iniciar sesión usando tu nombre y fecha de nacimiento.',
    'sync.nameLabel': 'Nombre',
    'sync.namePlaceholder': 'Juan Pérez',
    'sync.dobLabel': 'Fecha de nacimiento',
    'sync.nameRequired': 'Ingresá tu nombre.',
    'sync.nameIncomplete': 'Ingresá tu nombre y apellido.',
    'sync.dobRequired': 'Ingresá tu fecha de nacimiento.',
    'sync.dobFuture': 'La fecha de nacimiento no puede ser futura.',
    'sync.connect': 'Iniciar sesión',
    'sync.connecting': 'Conectando…',
    'sync.linkError': 'No se pudo conectar. Probá de nuevo.',
    'sync.joinNotFound': 'No pudimos encontrar esa cuenta. Probá escanear el código de nuevo.',
    'sync.registerPrompt': 'No encontramos datos previos con ese nombre y fecha.',
    'sync.register': 'Registrar',
    'sync.registering': 'Registrando…',
    'sync.syncedAs': 'Sincronizado como',
    'sync.copy': 'Copiar',
    'sync.copied': '¡Copiado!',
    'sync.scanHint': 'Escaneá este código QR, o escribí el mismo nombre y fecha de nacimiento en tu otro dispositivo.',
    'sync.lastSynced': 'Última sincronización',
    'sync.never': 'todavía no',
    'sync.logout': 'Cerrar sesión',
    'sync.disconnectConfirm':
      '¿Cerrar sesión? Tus estadísticas locales en este dispositivo se borrarán, pero se conservan en el servidor y vuelven a aparecer si iniciás sesión de nuevo.',
    'sync.devices': 'Dispositivos',
    'sync.thisDevice': 'este dispositivo',
    'stats.deviceId': 'ID',
    'stats.device': 'Dispositivo',
    'footer.copyright': 'Copyright © 2026 MI OJO VAGO',
    'footer.donationsLabel': 'PARA DONACIONES COMUNICARSE A:',
  },
  en: {
    'app.title': 'My Lazy Eye',
    'app.tagline': 'Vision training with anaglyph (red/cyan) glasses for lazy eye (amblyopia).',
    'nav.games': 'Games',
    'nav.stats': 'Stats',
    'hub.about1':
      'This free website has been made possible thanks to a group of visually impaired programmers who worked hand in hand with ophthalmologists and orthoptists to develop it. If you would like to help, you can find more information here. All you have to do is buy one of the glasses suggested at the bottom, which are necessary for the games.',
    'hub.about2':
      'In lazy eye (amblyopia) there is one eye that sees less for fixation and reading. The eye that fixates well sees better than the other eye. That is why all the games on this page can be configured so that the good eye has figures with lower contrast in order to stimulate the lazy eye.',
    'hub.about3':
      'PC Orthoptics, on the other hand, allows binocular vision training for those who have poor convergence and therefore get tired of reading. And also in cases of amblyopia it helps to improve binocular vision by lowering the contrast of the good eye.',
    'hub.about4':
      'The other four games are for the lazy eye and work both binocularly and dichoptically, as they have both types of stimulus. Tetris also has different type of contrast in the stimulus.',
    'hub.play': 'PLAY FREE',
    'hub.trainFree': 'FREE TRAINING',
    'hub.glassesTitle': "Don't have red/cyan glasses?",
    'hub.glassesText': 'You need anaglyph glasses (red/cyan) for the training to work.',
    'hub.glasses.seeMore': 'SEE MORE',
    'hub.glasses.piramideName': 'Red/Blue Anaglyph Glasses',
    'hub.glasses.mercadolibreName': 'Red and Blue 3D Anaglyph Glasses',
    'hub.glasses.bernellName': 'HTS Red/Blue Goggle',
    'hub.marioTitle': 'Dr. Mario Cerrella',
    'hub.marioVisualTraining': 'Visual Training',
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
    'shell.start': 'Start',
    'shell.resume': 'Resume',
    'shell.pause': 'Pause',
    'shell.paused': 'Paused',
    'shell.menu': 'Menu',
    'shell.reset': 'Restart',
    'shell.settings': 'Settings',
    'shell.sound': 'Sound',
    'shell.fullscreen': 'Fullscreen',
    'shell.back': 'Back',
    'shell.score': 'SCORE',
    'shell.level': 'LEVEL',
    'shell.rows': 'LINES',
    'shell.lives': 'LIVES',
    'shell.next': 'NEXT',
    'shell.gameover': 'Game over',
    'shell.gameoverText': 'Nice work! Want to try again?',
    'shell.tryAgain': 'Try again',
    'shell.confirmReset': 'End this game and start a new one?',
    'shell.yes': 'Yes',
    'shell.no': 'No',
    'shell.cancel': 'Cancel',
    'shell.accept': 'OK',
    'settings.title': 'Game settings',
    'settings.calibration': 'Calibration',
    'settings.contrastHelp': 'Help about contrast',
    'settings.contrastHelpText': 'Cover your lazy eye with your hand, then lower the contrast of the color your good eye sees.',
    'palette.white': 'White',
    'palette.violet': 'Violet',
    'settings.fill': 'Fill',
    'variant.filled': 'Filled',
    'variant.hollowLine': 'Striped',
    'variant.hollow': 'Hollow',
    'settings.redEyeLabel': 'Eye wearing the red lens',
    'settings.left': 'Left',
    'settings.right': 'Right',
    'calib.background': 'Background',
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
    'stats.clearConfirm': 'Delete all statistics? This clears data on ALL your synced devices, not just this one. This cannot be undone.',
    'stats.loginRequired': 'Log in to see your stats.',
    'stats.minutes': 'min',
    'stats.date': 'Date',
    'stats.duration': 'Duration',
    'stats.bestScore': 'Best score',
    'common.none': '—',
    'sync.title': 'Cross-device sync',
    'sync.disabledIntro': 'You can log in using your name and date of birth.',
    'sync.nameLabel': 'Name',
    'sync.namePlaceholder': 'Jane Doe',
    'sync.dobLabel': 'Date of birth',
    'sync.nameRequired': 'Enter your name.',
    'sync.nameIncomplete': 'Enter your first and last name.',
    'sync.dobRequired': 'Enter your date of birth.',
    'sync.dobFuture': "Date of birth can't be in the future.",
    'sync.connect': 'Log in',
    'sync.connecting': 'Connecting…',
    'sync.linkError': "Couldn't connect. Try again.",
    'sync.joinNotFound': "Couldn't find that account. Try scanning the code again.",
    'sync.registerPrompt': "We didn't find any previous data for that name and date.",
    'sync.register': 'Register',
    'sync.registering': 'Registering…',
    'sync.syncedAs': 'Synced as',
    'sync.copy': 'Copy',
    'sync.copied': 'Copied!',
    'sync.scanHint': 'Scan this QR code, or type the same name and date of birth on your other device.',
    'sync.lastSynced': 'Last synced',
    'sync.never': 'not yet',
    'sync.logout': 'Log out',
    'sync.disconnectConfirm':
      "Log out? Your local stats on this device will be cleared, but they're preserved on the server and will come back if you log in again.",
    'sync.devices': 'Devices',
    'sync.thisDevice': 'this device',
    'stats.deviceId': 'ID',
    'stats.device': 'Device',
    'footer.copyright': 'Copyright © 2026 MI OJO VAGO',
    'footer.donationsLabel': 'FOR DONATIONS CONTACT:',
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
