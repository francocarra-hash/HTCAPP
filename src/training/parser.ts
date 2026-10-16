/**
 * Parser del formato libre con el que el coach anota las sesiones:
 *
 *   13/2/2026 - Carlos                  ← fecha (+ título, o "solo para" un alumno)
 *   Cat/Cow - Spinal Bridge - ...       ← entrada en calor / movilidad
 *   [Crawling 20s/ Tabletop - ...] x2   ← circuito: estaciones separadas por " - ",
 *                                          ejercicios alternados por "/"
 *   A1 - Skater Sq 10r + CMJ 3          ← bloque principal (superserie por " + ")
 *   x3                                   ← vueltas del bloque
 *   S · 4x4 -> 15                       ← notas extra (se muestran tal cual)
 *
 * No interpreta ni completa nada: cada ítem conserva el texto original. Lo único
 * que se deriva es el nombre del ejercicio (sin la dosis) para agrupar el progreso.
 */

export interface ParsedItem {
  /** Texto tal como lo escribió el coach (sin el nombre del alumno si es una variante). */
  text: string;
  /** Nombre del ejercicio sin la dosis, para agrupar el progreso entre sesiones. */
  name: string;
  /** Variante personal: "ceci 15 inclined" → who = "Ceci". */
  who?: string;
}

export interface ParsedCircuit {
  rounds: number | null;
  /** Cada estación es un grupo de ejercicios que se alternan ("/"). */
  stations: ParsedItem[][];
}

export interface ParsedStrengthLine {
  label: string;
  items: ParsedItem[];
}

export interface ParsedStrength {
  rounds: number | null;
  lines: ParsedStrengthLine[];
}

export interface ParsedSessionBody {
  warmup: string[];
  circuits: ParsedCircuit[];
  strength: ParsedStrength | null;
  extras: string[];
  /** Sesión sin estructura (ej. "Trabajo articular de seguimiento pieza por pieza"). */
  note: string | null;
}

export interface Participant {
  id: string;
  name: string;
  username?: string;
}

export interface SplitSession {
  date: string | null;
  dateRaw: string | null;
  dateNote: string | null;
  title: string | null;
  /** Id del alumno si la cabecera dice "- Carlos" y Carlos está entre los participantes. */
  onlyFor: string | null;
  body: string;
}

// ── helpers ─────────────────────────────────────────────────────────────────

export const fold = (s: string): string =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

export const firstName = (name: string): string => name.trim().split(/\s+/)[0] ?? name;

const normalize = (s: string): string =>
  s.replace(/\r\n?/g, '\n').replace(/[–—]/g, '-').replace(/->/g, '→').replace(/ /g, ' ');

/** Guion separador: con espacio al menos de un lado ("a - b", "12- b", "10r  -b"); no "t-rotation". */
const HYPHEN_SEP = /\s+-+\s*|\s*-+\s+/;
/** "/" seguido de letra separa ejercicios ("Crawling f/ tabletop b"); seguido de número son series ("20/25/30"). */
const SLASH_ITEM = /\s*\/\s*(?=[A-Za-zÀ-ÿ])/;
const MODIFIER = /^(sl|sa)$/i;

const UNIT_ANY = '(?:min|mins|minutos|seg|segs|sec|s|reps?|repes|r|kg|k)';

const num = (s: string): number => Number(s.replace(',', '.'));

/** "10sx2" → "10s x2" para que la unidad y las vueltas se lean por separado. */
const splitGluedSets = (t: string): string => t.replace(/(\d)([a-z]+)[x×](\d)/gi, '$1$2 x$3');
/** "+10r", "+5s": un extra después de la dosis principal. */
const EXTRA_DOSE = new RegExp(`\\+\\s*\\d+(?:[.,]\\d+)?\\s*${UNIT_ANY}?\\b`, 'gi');
const stripSets = (t: string): string =>
  t.replace(/(^|[\s\d])[x×]\s*\d+/gi, '$1 ').replace(/([A-Za-z]{3,})[x×]\d+\b/g, '$1 ');

export function exerciseName(text: string): string {
  let t = splitGluedSets(text.replace(/\(.*?\)/g, ' ')).replace(EXTRA_DOSE, ' ');
  // "Push up iso 30s+short elastic rom 8": lo que va pegado tras "+" es un agregado, no otro nombre.
  const glued = t.search(/(?<=\S)\+(?=\s*[A-Za-zÀ-ÿ])/);
  if (glued > 0) t = t.slice(0, glued);
  return stripSets(
    t.replace(/\d+\s*:\s*\d{2}\s*(?:min|mins|m)?/gi, ' ')
      .replace(new RegExp(`\\d+(?:[.,]\\d+)?\\s*${UNIT_ANY}\\b`, 'gi'), ' '),
  )
    .replace(/\d+(?:[.,]\d+)?/g, ' ')
    .replace(/[+/:]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface Dose {
  seconds: number[];
  reps: number[];
  kg: number[];
}

/** Cantidades escritas en un ítem. Los extras "+10r" no cuentan como dosis principal. */
export function doseOf(text: string): Dose {
  let t = splitGluedSets(text.replace(/\(.*?\)/g, ' ')).replace(EXTRA_DOSE, ' ');
  const seconds: number[] = [];
  const reps: number[] = [];
  const kg: number[] = [];
  t = t.replace(/(\d+)\s*:\s*(\d{2})\s*(?:min|mins|m)?/gi, (_m, a: string, b: string) => {
    seconds.push(Number(a) * 60 + Number(b));
    return ' ';
  });
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos)\b/gi, (_m, a: string) => {
    seconds.push(num(a) * 60);
    return ' ';
  });
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:seg|segs|sec|s)\b/gi, (_m, a: string) => {
    seconds.push(num(a));
    return ' ';
  });
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:kg|k)\b/gi, (_m, a: string) => {
    kg.push(num(a));
    return ' ';
  });
  stripSets(t).replace(/(\d+)\s*(?:reps?|repes|r)?\b/gi, (_m, a: string) => {
    reps.push(Number(a));
    return ' ';
  });
  return { seconds, reps, kg };
}

// ── ítems ───────────────────────────────────────────────────────────────────

function toItems(tokens: string[], names: Map<string, string>): ParsedItem[] {
  const out: ParsedItem[] = [];
  for (const raw of tokens) {
    let text = raw.trim();
    if (!text) continue;
    let who: string | undefined;
    const m = /^([A-Za-zÀ-ÿ]+)\b[\s:,]*(.*)$/.exec(text);
    if (m && m[1] && names.has(fold(m[1])) && (m[2] ?? '').trim()) {
      who = names.get(fold(m[1]));
      text = (m[2] ?? '').trim();
    }
    let name = exerciseName(text);
    const prev = out[out.length - 1];
    // "Rolling Tabletop 15/ SL 8": "SL" modifica al ejercicio anterior.
    if (MODIFIER.test(name) && prev && !prev.who) name = `${prev.name} ${name.toUpperCase()}`;
    out.push(who ? { text, name, who } : { text, name });
  }
  return out;
}

const splitHyphen = (s: string): string[] => s.split(HYPHEN_SEP).map((x) => x.trim()).filter(Boolean);
const splitSlash = (s: string): string[] => s.split(SLASH_ITEM).map((x) => x.trim()).filter(Boolean);

function parseCircuit(inner: string, rounds: string | undefined, names: Map<string, string>): ParsedCircuit {
  const joined = inner
    .replace(/\s*\n\s*(?=[+/])/g, '') // "Copenhagen 30s\n+10r" es una sola dosis cortada
    .replace(/\s*\n\s*/g, ' - ');
  const stations = splitHyphen(joined)
    .map((st) => toItems(splitSlash(st), names))
    .filter((st) => st.length > 0);
  return { rounds: rounds ? Number(rounds) : null, stations };
}

function parseStrengthItems(rest: string, names: Map<string, string>): ParsedItem[] {
  const tokens = rest
    .split(/\s\+\s/)
    .flatMap(splitHyphen)
    .flatMap(splitSlash);
  return toItems(tokens, names);
}

/** Mapa nombre-plegado → nombre visible, para detectar variantes personales. */
export function participantNames(participants: Participant[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of participants) {
    const fn = firstName(p.name);
    m.set(fold(fn), fn);
    if (p.username) m.set(fold(p.username), fn);
  }
  return m;
}

// ── cuerpo de la sesión ─────────────────────────────────────────────────────

const STRENGTH_LINE = /^([A-D])\s*(\d+)\s*[-:.)]?\s*(.*)$/;
const ROUNDS_LINE = /^[xX×]\s*(\d+)$/;

export function parseBody(body: string, participants: Participant[]): ParsedSessionBody {
  const names = participantNames(participants);
  const text = normalize(body);
  const circuits: ParsedCircuit[] = [];
  const outside: Array<{ text: string; afterBracket: boolean }> = [];
  const re = /\[([\s\S]*?)\]\s*(?:[xX×][ \t]*(\d+)?)?/g;
  let last = 0;
  let seenBracket = false;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    outside.push({ text: text.slice(last, m.index), afterBracket: seenBracket });
    circuits.push(parseCircuit(m[1] ?? '', m[2], names));
    seenBracket = true;
    last = re.lastIndex;
  }
  outside.push({ text: text.slice(last), afterBracket: seenBracket });

  const warmupLines: string[] = [];
  const extras: string[] = [];
  let strength: ParsedStrength | null = null;

  for (const chunk of outside) {
    for (const rawLine of chunk.text.split('\n')) {
      const line = rawLine.trim();
      if (!line) continue;
      const sl = STRENGTH_LINE.exec(line);
      if (sl && sl[3]) {
        strength ??= { rounds: null, lines: [] };
        strength.lines.push({ label: `${sl[1]}${sl[2]}`, items: parseStrengthItems(sl[3], names) });
        continue;
      }
      const rl = ROUNDS_LINE.exec(line);
      if (rl && strength && strength.rounds === null) {
        strength.rounds = Number(rl[1]);
        continue;
      }
      if (!chunk.afterBracket && !strength) warmupLines.push(line);
      else extras.push(line);
    }
  }

  let warmup = warmupLines.flatMap(splitHyphen);
  let note: string | null = null;
  const only = warmup[0];
  if (circuits.length === 0 && !strength && warmup.length === 1 && only && !/\d/.test(only) && only.split(/\s+/).length >= 4) {
    note = only;
    warmup = [];
  }
  return { warmup, circuits, strength, extras, note };
}

// ── división en sesiones + fechas ───────────────────────────────────────────

const DATE_HEADER = /^\s*(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{2,4})\b(.*)$/;

interface Ymd { y: number; m: number; d: number }

const isValid = (v: Ymd): boolean => {
  if (v.m < 1 || v.m > 12 || v.d < 1) return false;
  const dt = new Date(Date.UTC(v.y, v.m - 1, v.d));
  return dt.getUTCMonth() === v.m - 1 && dt.getUTCDate() === v.d;
};
const ord = (v: Ymd): number => Date.UTC(v.y, v.m - 1, v.d);
export const iso = (v: Ymd): string =>
  `${v.y}-${String(v.m).padStart(2, '0')}-${String(v.d).padStart(2, '0')}`;
const dmy = (v: Ymd): string => `${v.d}/${v.m}/${v.y}`;

/**
 * Las notas vienen en orden cronológico; una fecha que rompe ese orden es casi
 * siempre un error de tipeo (día/mes invertidos, mes o año equivocado). Se busca
 * la secuencia ordenada más larga y, para cada fecha fuera de ella, la primera
 * corrección que encaja entre sus vecinas. Toda corrección queda anotada para que
 * el coach la revise; si ninguna encaja, la fecha se conserva y se marca.
 */
export function fixDates(raw: Array<Ymd | null>): Array<{ date: string | null; note: string | null }> {
  const idx = raw.map((v, i) => (v && isValid(v) ? i : -1)).filter((i) => i >= 0);
  // Subsecuencia no decreciente más larga (n chico: O(n²)).
  const len = idx.map(() => 1);
  const prevOf = idx.map(() => -1);
  for (let a = 0; a < idx.length; a++) {
    for (let b = 0; b < a; b++) {
      const va = raw[idx[a]!]!;
      const vb = raw[idx[b]!]!;
      if (ord(vb) <= ord(va) && len[b]! + 1 > len[a]!) {
        len[a] = len[b]! + 1;
        prevOf[a] = b;
      }
    }
  }
  let best = -1;
  for (let a = 0; a < idx.length; a++) if (best < 0 || len[a]! >= len[best]!) best = a;
  const kept = new Set<number>();
  for (let a = best; a >= 0; a = prevOf[a]!) kept.add(idx[a]!);

  const out: Array<{ date: string | null; note: string | null }> = raw.map((v) =>
    v && isValid(v) ? { date: iso(v), note: null } : { date: null, note: v ? `Fecha inválida (${dmy(v)})` : null },
  );
  const resolved: Array<Ymd | null> = raw.map((v, i) => (kept.has(i) ? v : null));

  for (let i = 0; i < raw.length; i++) {
    const v = raw[i];
    if (!v || !isValid(v) || kept.has(i)) continue;
    let prev: Ymd | null = null;
    for (let j = i - 1; j >= 0 && !prev; j--) prev = resolved[j] ?? null;
    let next: Ymd | null = null;
    for (let j = i + 1; j < raw.length && !next; j++) if (kept.has(j)) next = raw[j] ?? null;
    const fits = (c: Ymd): boolean =>
      isValid(c) && (!prev || ord(prev) <= ord(c)) && (!next || ord(c) <= ord(next));
    const candidates: Ymd[] = [{ y: v.y, m: v.d, d: v.m }];
    for (const n of [prev, next]) if (n && n.y !== v.y) candidates.push({ y: n.y, m: v.m, d: v.d });
    for (const n of [prev, next]) if (n) candidates.push({ y: n.y, m: n.m, d: v.d });
    const fix = candidates.find(fits);
    if (fix) {
      resolved[i] = fix;
      out[i] = {
        date: iso(fix),
        note: `Escrita como ${dmy(v)}; estaba fuera de orden y se tomó como ${dmy(fix)}. Revisala.`,
      };
    } else {
      resolved[i] = v;
      out[i] = { date: iso(v), note: `La fecha ${dmy(v)} está fuera de orden. Revisala.` };
    }
  }
  return out;
}

/**
 * Divide un texto con una o varias sesiones. Cada sesión arranca con una línea
 * de fecha (d/m/aaaa). Si el texto no tiene ninguna fecha, es una sola sesión
 * con `defaultDate`.
 */
export function splitSessions(
  text: string,
  participants: Participant[],
  defaultDate: string | null,
): { sessions: SplitSession[]; warnings: string[] } {
  const lines = normalize(text).split('\n');
  const warnings: string[] = [];
  const heads: Array<{ ymd: Ymd; raw: string; rest: string; body: string[] }> = [];
  const preamble: string[] = [];
  for (const line of lines) {
    const h = DATE_HEADER.exec(line);
    if (h) {
      let y = Number(h[3]);
      if (y < 100) y += 2000;
      heads.push({
        ymd: { d: Number(h[1]), m: Number(h[2]), y },
        raw: `${h[1]}/${h[2]}/${h[3]}`,
        rest: (h[4] ?? '').replace(/^[\s\-:·]+/, '').trim(),
        body: [],
      });
    } else if (heads.length) heads[heads.length - 1]!.body.push(line);
    else preamble.push(line);
  }

  const pre = preamble.join('\n').trim();
  if (!heads.length) {
    return pre
      ? { sessions: [{ date: defaultDate, dateRaw: null, dateNote: null, title: null, onlyFor: null, body: pre }], warnings }
      : { sessions: [], warnings };
  }
  if (pre) warnings.push(`Se ignoró el texto antes de la primera fecha: "${pre.slice(0, 60)}${pre.length > 60 ? '…' : ''}"`);

  const byName = new Map<string, string>();
  for (const p of participants) {
    byName.set(fold(firstName(p.name)), p.id);
    byName.set(fold(p.name), p.id);
    if (p.username) byName.set(fold(p.username), p.id);
  }
  const dates = fixDates(heads.map((h) => h.ymd));
  const sessions = heads.map((h, i): SplitSession => {
    const restKey = fold(h.rest);
    const onlyFor = restKey && byName.has(restKey) ? byName.get(restKey)! : null;
    return {
      date: dates[i]?.date ?? null,
      dateRaw: h.raw,
      dateNote: dates[i]?.note ?? null,
      title: onlyFor || !h.rest ? null : h.rest,
      onlyFor,
      body: h.body.join('\n').trim(),
    };
  });
  return { sessions, warnings };
}
