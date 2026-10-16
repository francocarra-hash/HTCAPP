/**
 * Capacidades físicas con las que se agrupa el progreso. La clasificación
 * automática es sólo una sugerencia por palabras clave del nombre del ejercicio:
 * el coach la corrige en la biblioteca y su elección siempre prevalece.
 */
import { fold } from './parser';

export const CAPACITIES = [
  { id: 'fuerza', label: 'Fuerza' },
  { id: 'reactividad', label: 'Reactividad' },
  { id: 'movilidad', label: 'Movilidad' },
  { id: 'estabilidad', label: 'Estabilidad' },
  { id: 'control_motor', label: 'Control motor' },
  { id: 'resistencia', label: 'Resistencia' },
] as const;

export type CapacityId = (typeof CAPACITIES)[number]['id'];
export const CAPACITY_IDS = CAPACITIES.map((c) => c.id) as CapacityId[];

// El orden importa: la primera regla que coincide gana ("Chair Jump Squat" es
// reactividad antes que fuerza; "Jefferson to plank" es movilidad antes que estabilidad).
const RULES: Array<[CapacityId, RegExp]> = [
  ['reactividad', /\b(cmj|pogo|hops?|jumps?|salto|saltos|skates?|burpees?|rayuela|bounds?|pliometri\w*|lateral kick)\b/],
  ['control_motor', /(no eyes|ojos cerrados|vestibular|crawl|tennis ball|perturbac|airplane|comandos?|\brdl sl\b|\bsl rdl\b|balance|equilibrio)/],
  ['movilidad', /(cat ?\/? ?cow|\bcars\b|spinal|90\/90|switch|shin box|jefferson|thoracic|stretch|estiramiento|cuclillas|deep squat|deep tier|bjj bridge|capsule|pails|waves)/],
  ['estabilidad', /\b(planks?|plancha|copenhagen|hollow|superman|tabletop|dead ?bug|bird ?dog|swimmers?|l-sit|rolling abs?|pallof|long bridge|star)\b/],
  ['fuerza', /\b(squats?|sq|sentadillas?|pistol|lunges?|estocadas?|wall sit|push ?ups?|flexiones|pike|chin ?ups?|rows?|press|curl|nordic|hinge|bridge|puente|clam ?shell|calf|iywto|yiwto|triceps?|cossack|deadlift|rdl|kickstand|knight|skaters?|horse stance|good morning|gm)\b/],
  ['resistencia', /\b(4x4|intervalos?|bike|bici|remo ergo|run|correr|trote|cardio)\b/],
];

export function suggestCapacity(name: string): CapacityId | null {
  const n = fold(name);
  for (const [cap, re] of RULES) if (re.test(n)) return cap;
  return null;
}

export const isCapacity = (v: unknown): v is CapacityId => typeof v === 'string' && (CAPACITY_IDS as string[]).includes(v);
