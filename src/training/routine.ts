/**
 * Rutina estructurada en bloques, editable por el coach.
 *
 *   list      → un ejercicio por renglón (movilidad / entrada en calor)
 *   circuit   → estaciones; los ejercicios de una estación se alternan
 *   superset  → líneas A1, A2…; los ejercicios de una línea van seguidos
 *   notes     → notas sueltas ("S", "4x4 → 15")
 *
 * Las sesiones cargadas como texto no guardan rutina: se derivan del texto al
 * leerlas. Los ids de esos ítems son posicionales y estables, así las notas y
 * los checks del alumno siguen apuntando al mismo ejercicio.
 */
import { z } from 'zod';
import { exerciseName, fold, MODIFIER, ParsedItem, ParsedSessionBody } from './parser';

export type BlockKind = 'list' | 'circuit' | 'superset' | 'notes';

export interface RoutineItem {
  id: string;
  name: string;
  dose: string;
  /** Variante personal para un alumno ("Para vos: 15 inclined"). */
  who?: string;
}
export interface RoutineGroup { id: string; items: RoutineItem[] }
export interface RoutineBlock { id: string; kind: BlockKind; title: string; rounds: number | null; groups: RoutineGroup[] }
export interface Routine { blocks: RoutineBlock[]; note?: string | null }

const Id = z.string().trim().min(1).max(60);
export const RoutineSchema = z.object({
  blocks: z
    .array(
      z.object({
        id: Id,
        kind: z.enum(['list', 'circuit', 'superset', 'notes']),
        title: z.string().trim().max(60),
        rounds: z.number().int().min(1).max(30).nullable(),
        groups: z
          .array(
            z.object({
              id: Id,
              items: z
                .array(
                  z.object({
                    id: Id,
                    name: z.string().trim().min(1).max(140),
                    dose: z.string().trim().max(140).default(''),
                    who: z.string().trim().min(1).max(40).optional(),
                  }),
                )
                .max(30),
            }),
          )
          .max(60),
      }),
    )
    .max(30),
  note: z.string().trim().max(1000).nullable().optional(),
});

/** "Copenhagen 30s+10r" → nombre "Copenhagen", dosis "30s+10r". */
function splitItem(it: ParsedItem, id: string): RoutineItem {
  const t = it.text.trim();
  if (it.who) return { id, name: t, dose: '', who: it.who };
  if (it.name && fold(t).startsWith(fold(it.name))) {
    return { id, name: t.slice(0, it.name.length).trim(), dose: t.slice(it.name.length).replace(/^[\s:,-]+/, '').trim() };
  }
  // "SL 8" después de "Rolling Tabletop 15": el parser ya le dio el nombre completo.
  const first = t.split(/\s+/)[0] ?? '';
  if (MODIFIER.test(first) && fold(it.name).endsWith(` ${fold(first)}`)) {
    return { id, name: it.name, dose: t.slice(first.length).trim() };
  }
  const m = /^(.*?[A-Za-zÀ-ÿ)])\s+(\d.*)$/.exec(t);
  return m ? { id, name: m[1]!.trim(), dose: m[2]!.trim() } : { id, name: t, dose: '' };
}

export function routineFromParsed(p: ParsedSessionBody): Routine {
  const blocks: RoutineBlock[] = [];
  const add = (kind: BlockKind, title: string, rounds: number | null, groups: RoutineItem[][]) => {
    const b = blocks.length;
    blocks.push({
      id: `b${b}`, kind, title, rounds,
      groups: groups.map((items, g) => ({ id: `b${b}g${g}`, items: items.map((it, i) => ({ ...it, id: `b${b}g${g}i${i}` })) })),
    });
  };
  if (p.warmup.length) add('list', 'Movilidad', null, p.warmup.map((w) => [splitItem({ text: w, name: exerciseName(w) }, '')]));
  // En el orden en que están escritos (un circuito puede ir después del bloque principal).
  for (const o of p.order) {
    if (o.kind === 'circuit') {
      const c = p.circuits[o.index]!;
      add('circuit', p.circuits.length > 1 ? `Circuito ${o.index + 1}` : 'Circuito', c.rounds,
        c.stations.map((st) => st.map((it) => splitItem(it, ''))));
    } else {
      const s = p.strengths[o.index]!;
      const letter = s.lines[0]?.label[0] ?? '';
      add('superset', p.strengths.length > 1 ? `Bloque ${letter}` : 'Bloque principal', s.rounds,
        s.lines.map((l) => l.items.map((it) => splitItem(it, ''))));
    }
  }
  if (p.extras.length) add('notes', 'Notas', null, p.extras.map((x) => [{ id: '', name: x, dose: '' }]));
  return { blocks, note: p.note };
}

/** Texto completo de un ítem, como lo escribiría el coach. */
export const itemText = (it: RoutineItem): string => `${it.name} ${it.dose}`.trim();

/** Ejercicios "reales" (no notas) con el grupo al que pertenecen. */
export function exerciseGroups(r: Routine): RoutineItem[][] {
  return r.blocks.filter((b) => b.kind !== 'notes').flatMap((b) => b.groups.map((g) => g.items));
}

export function routineItemCount(r: Routine): number {
  return exerciseGroups(r).reduce((a, g) => a + g.filter((i) => !i.who).length, 0);
}
