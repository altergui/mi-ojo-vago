/**
 * Two 200-word lists, index-aligned (WORDLIST_ES[17] === 'gato' <-> WORDLIST_EN[17] === 'cat').
 * Used only for display/entry of sync codes — the canonical code is the index pair,
 * see code.ts. Kept ASCII/diacritic-free (no ñ/accents) so codes are easy to type
 * on any keyboard and unambiguous to parse.
 */

const ANIMALS_ES = [
  'gato', 'perro', 'leon', 'tigre', 'oso', 'lobo', 'zorro', 'ciervo', 'conejo', 'raton',
  'caballo', 'vaca', 'cerdo', 'oveja', 'cabra', 'pollo', 'pato', 'ganso', 'aguila', 'halcon',
  'buho', 'cuervo', 'paloma', 'loro', 'pinguino', 'delfin', 'ballena', 'tiburon', 'pulpo', 'cangrejo',
  'rana', 'serpiente', 'tortuga', 'lagarto', 'abeja', 'hormiga', 'mariposa', 'tarantula', 'mosca', 'grillo',
];
const ANIMALS_EN = [
  'cat', 'dog', 'lion', 'tiger', 'bear', 'wolf', 'fox', 'deer', 'rabbit', 'mouse',
  'horse', 'cow', 'pig', 'sheep', 'goat', 'chicken', 'duck', 'goose', 'eagle', 'hawk',
  'owl', 'crow', 'dove', 'parrot', 'penguin', 'dolphin', 'whale', 'shark', 'octopus', 'crab',
  'frog', 'snake', 'turtle', 'lizard', 'bee', 'ant', 'butterfly', 'tarantula', 'fly', 'cricket',
];

const COLORS_ES = [
  'rojo', 'azul', 'verde', 'amarillo', 'naranja', 'morado', 'rosa', 'negro', 'blanco', 'gris',
  'dorado', 'plateado', 'turquesa', 'violeta', 'celeste', 'marron', 'beige', 'coral', 'lima', 'oliva',
];
const COLORS_EN = [
  'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'black', 'white', 'gray',
  'gold', 'silver', 'turquoise', 'violet', 'skyblue', 'brown', 'beige', 'coral', 'lime', 'olive',
];

const NATURE_ES = [
  'sol', 'luna', 'estrella', 'cielo', 'nube', 'lluvia', 'nieve', 'viento', 'trueno', 'rayo',
  'montana', 'rio', 'lago', 'mar', 'oceano', 'playa', 'arena', 'roca', 'piedra', 'arbol',
  'flor', 'hoja', 'rama', 'raiz', 'bosque', 'selva', 'desierto', 'isla', 'volcan', 'cueva',
];
const NATURE_EN = [
  'sun', 'moon', 'star', 'sky', 'cloud', 'rain', 'snow', 'wind', 'thunder', 'lightning',
  'mountain', 'river', 'lake', 'sea', 'ocean', 'beach', 'sand', 'rock', 'stone', 'tree',
  'flower', 'leaf', 'branch', 'root', 'forest', 'jungle', 'desert', 'island', 'volcano', 'cave',
];

const FOOD_ES = [
  'pan', 'queso', 'leche', 'huevo', 'manzana', 'pera', 'fresa', 'uva', 'limon', 'sandia',
  'melon', 'cereza', 'kiwi', 'mango', 'coco', 'arroz', 'pasta', 'sopa', 'ensalada', 'pastel',
  'galleta', 'chocolate', 'miel', 'azucar', 'sal', 'aceite', 'cafe', 'te', 'agua', 'vino',
];
const FOOD_EN = [
  'bread', 'cheese', 'milk', 'egg', 'apple', 'pear', 'strawberry', 'grape', 'lemon', 'watermelon',
  'melon', 'cherry', 'kiwi', 'mango', 'coconut', 'rice', 'pasta', 'soup', 'salad', 'cake',
  'cookie', 'chocolate', 'honey', 'sugar', 'salt', 'oil', 'coffee', 'tea', 'water', 'wine',
];

const OBJECTS_ES = [
  'mesa', 'silla', 'puerta', 'ventana', 'libro', 'lapiz', 'papel', 'lampara', 'espejo', 'reloj',
  'llave', 'caja', 'bolsa', 'taza', 'plato', 'cuchara', 'tenedor', 'cuchillo', 'botella', 'vela',
  'martillo', 'tornillo', 'cuerda', 'cadena', 'escalera', 'maleta', 'sombrero', 'zapato', 'guante', 'anillo',
];
const OBJECTS_EN = [
  'table', 'chair', 'door', 'window', 'book', 'pencil', 'paper', 'lamp', 'mirror', 'clock',
  'key', 'box', 'bag', 'cup', 'plate', 'spoon', 'fork', 'knife', 'bottle', 'candle',
  'hammer', 'screw', 'rope', 'chain', 'ladder', 'suitcase', 'hat', 'shoe', 'glove', 'ring',
];

const BODY_ES = [
  'mano', 'pie', 'ojo', 'oreja', 'nariz', 'boca', 'dedo', 'brazo', 'pierna', 'corazon',
  'cabeza', 'diente', 'cabello', 'hombro', 'rodilla', 'cuello', 'espalda', 'codo', 'tobillo', 'cintura',
];
const BODY_EN = [
  'hand', 'foot', 'eye', 'ear', 'nose', 'mouth', 'finger', 'arm', 'leg', 'heart',
  'head', 'tooth', 'hair', 'shoulder', 'knee', 'neck', 'back', 'elbow', 'ankle', 'waist',
];

const MISC_ES = [
  'fuego', 'hielo', 'humo', 'sombra', 'luz', 'musica', 'cancion', 'baile', 'juego', 'suerte',
];
const MISC_EN = [
  'fire', 'ice', 'smoke', 'shadow', 'light', 'music', 'song', 'dance', 'game', 'luck',
];

const ADJ_ES = [
  'grande', 'chico', 'alto', 'bajo', 'rapido', 'lento', 'fuerte', 'suave', 'duro', 'frio',
  'caliente', 'limpio', 'sucio', 'nuevo', 'viejo', 'joven', 'feliz', 'triste', 'valiente', 'tranquilo',
];
const ADJ_EN = [
  'big', 'small', 'tall', 'short', 'fast', 'slow', 'strong', 'soft', 'hard', 'cold',
  'hot', 'clean', 'dirty', 'new', 'old', 'young', 'happy', 'sad', 'brave', 'calm',
];

export const WORDLIST_ES: readonly string[] = [
  ...ANIMALS_ES, ...COLORS_ES, ...NATURE_ES, ...FOOD_ES, ...OBJECTS_ES, ...BODY_ES, ...MISC_ES, ...ADJ_ES,
];
export const WORDLIST_EN: readonly string[] = [
  ...ANIMALS_EN, ...COLORS_EN, ...NATURE_EN, ...FOOD_EN, ...OBJECTS_EN, ...BODY_EN, ...MISC_EN, ...ADJ_EN,
];

export const WORDLIST_SIZE = WORDLIST_ES.length;
