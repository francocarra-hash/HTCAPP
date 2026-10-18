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
  /** Primer bloque principal (A1, A2…); todos están en `strengths`. */
  strength: ParsedStrength | null;
  strengths: ParsedStrength[];
  /** Orden en que aparecen circuitos y bloques principales en el texto. */
  order: Array<{ kind: 'circuit' | 'strength'; index: number }>;
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
/**
 * "/" con espacio y seguido de letra separa ejercicios ("Crawling f/ tabletop b");
 * seguido de número son series ("20/25/30"); sin espacios es un nombre ("Flex/Ext", "IR/ER").
 */
const SLASH_ITEM = /(?:\s+\/\s*|\/\s+)(?=[A-Za-zÀ-ÿ])/;
/** Alternativa del ejercicio anterior: "Rolling Tabletop 15/ SL 8", "Plank 45s/ Dynamic 30s". */
export const MODIFIER = /^(sl|sa|dynamic|dinamico|dinámico|iso)$/i;

/** "m" son minutos en estas notas ("Horse Stance 2m", "1:30m"); nunca metros. */
const UNIT_ANY = '(?:min|mins|minutos|m|seg|segs|sec|s|reps?|repes|r|kg|k)';

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
  t = t.replace(/(\d+(?:[.,]\d+)?)\s*(?:min|mins|minutos|m)\b/gi, (_m, a: string) => {
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
    if (MODIFIER.test(name) && prev && !prev.who) name = `${prev.name} ${name.length <= 2 ? name.toUpperCase() : name}`;
    out.push(who ? { text, name, who } : { text, name });
  }
  return out;
}

/** "15", "30s", "1min+12r": sólo dosis, sin nombre de ejercicio ("90/90" es un ejercicio). */
const isDoseOnly = (t: string): boolean => /\d/.test(t) && !exerciseName(t) && !/^90\s*\/\s*90\b/.test(t);
/** "Inverted Bridge 15 - 15 - 15": las series siguen al ejercicio, no son ejercicios nuevos. */
const splitHyphen = (s: string): string[] =>
  // Un guion entre paréntesis ("Tempo Push ups (4- 2-1)") no separa ejercicios.
  s.replace(/\([^)]*\)/g, (p) => p.replace(/-/g, '\u0001')).split(HYPHEN_SEP)
    .map((x) => x.replace(/\u0001/g, '-').trim()).filter(Boolean).reduce<string[]>((out, t) => {
    if (out.length && isDoseOnly(t)) out[out.length - 1] += ` - ${t}`;
    else out.push(t);
    return out;
  }, []);
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
  const strengths: ParsedStrength[] = [];
  const order: ParsedSessionBody['order'] = [];
  const warmupLines: string[] = [];
  const extras: string[] = [];
  /** Líneas sueltas desde el último bloque: si sigue un "x2", forman un circuito. */
  let pending: string[] = [];
  /** Hubo una línea en blanco: si lo que sigue no es un "x2", empieza otro grupo. */
  let gap = false;
  /** Bloque principal al que todavía no se le anotaron las vueltas. */
  let open: ParsedStrength | null = null;

  const started = (): boolean => order.length > 0;
  const release = (): void => {
    (started() ? extras : warmupLines).push(...pending);
    pending = [];
  };
  const addCircuit = (c: ParsedCircuit): void => {
    circuits.push(c);
    order.push({ kind: 'circuit', index: circuits.length - 1 });
    open = null;
  };

  const line = (raw: string): void => {
    let l = raw.trim().replace(/^[•·]\s*/, '');
    if (!l) {
      gap = true;
      return;
    }
    // "… ISO Row 30s] x2" sin "[": es el final de un circuito al que le faltó abrir el corchete.
    const stray = !l.includes('[') ? /^(.*\S)\s*\]\s*([xX×]\s*\d+)$/.exec(l) : null;
    if (stray) {
      line(stray[1]!);
      l = stray[2]!.replace(/\s+/g, '');
    }
    const sl = STRENGTH_LINE.exec(l);
    // "Plank 35s - Superman 35s x2": las vueltas de esa línea, escritas al final.
    const inline = !(sl && sl[3]) && HYPHEN_SEP.test(l) ? /^(.*\S)\s+[xX×]\s*(\d+)$/.exec(l) : null;
    if (inline) {
      gap = true;
      open = null;
      line(inline[1]!);
      line(`x${inline[2]}`);
      return;
    }
    const hadGap = gap;
    if (gap && !ROUNDS_LINE.test(l)) release();
    gap = false;
    if (sl && sl[3]) {
      release();
      // "A1, A2 · línea en blanco · B1, B2 x3": otra letra después de un corte es otro bloque.
      if (open && hadGap && open.lines[open.lines.length - 1]?.label[0] !== sl[1]) open = null;
      if (!open) {
        open = { rounds: null, lines: [] };
        strengths.push(open);
        order.push({ kind: 'strength', index: strengths.length - 1 });
      }
      open.lines.push({ label: `${sl[1]}${sl[2]}`, items: parseStrengthItems(sl[3], names) });
      return;
    }
    const rl = ROUNDS_LINE.exec(l);
    if (rl && open) {
      // Vueltas del bloque principal; lo anotado entre medio queda como nota.
      release();
      open.rounds = Number(rl[1]);
      open = null;
      return;
    }
    if (rl && pending.length) {
      // Así anotaba antes de usar corchetes: líneas seguidas de "x2" son un circuito.
      let lines = pending;
      pending = [];
      // Lo que va antes y no tiene dosis (la movilidad del principio, un título o una
      // indicación) no entra en las vueltas.
      let k = 0;
      while (k < lines.length - 1 && !/\d/.test(lines[k]!)) k++;
      (started() ? extras : warmupLines).push(...lines.slice(0, k));
      lines = lines.slice(k);
      const stations = lines.flatMap(splitHyphen).map((st) => toItems(splitSlash(st), names)).filter((st) => st.length > 0);
      addCircuit({ rounds: Number(rl[1]), stations });
      return;
    }
    if (rl) {
      extras.push(l);
      return;
    }
    pending.push(l);
  };

  const re = /\[([\s\S]*?)\]\s*(?:[xX×][ \t]*(\d+)?)?/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    text.slice(last, m.index).split('\n').forEach(line);
    release();
    addCircuit(parseCircuit(m[1] ?? '', m[2], names));
    last = re.lastIndex;
  }
  text.slice(last).split('\n').forEach(line);
  release();

  let warmup = warmupLines.flatMap(splitHyphen);
  let note: string | null = null;
  const only = warmup[0];
  if (!started() && warmup.length === 1 && only && !/\d/.test(only) && only.split(/\s+/).length >= 4) {
    note = only;
    warmup = [];
  }
  return { warmup, circuits, strength: strengths[0] ?? null, strengths, order, extras, note };
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
 * Una fecha imposible que se lee bien con día y mes invertidos ("8/22/2025", escrita
 * mes/día) se toma invertida, también anotada.
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
    if (!v || kept.has(i)) continue;
    const swapped: Ymd = { y: v.y, m: v.d, d: v.m };
    if (!isValid(v) && !isValid(swapped)) continue;
    let prev: Ymd | null = null;
    for (let j = i - 1; j >= 0 && !prev; j--) prev = resolved[j] ?? null;
    let next: Ymd | null = null;
    for (let j = i + 1; j < raw.length && !next; j++) if (kept.has(j)) next = raw[j] ?? null;
    const fits = (c: Ymd): boolean =>
      isValid(c) && (!prev || ord(prev) <= ord(c)) && (!next || ord(c) <= ord(next));
    if (!isValid(v)) {
      const alt = [swapped, ...[prev, next].filter((n): n is Ymd => Boolean(n && n.y !== v.y)).map((n) => ({ ...swapped, y: n.y }))];
      const fix = alt.find(fits) ?? swapped;
      resolved[i] = fix;
      out[i] = {
        date: iso(fix),
        note: `Escrita como ${dmy(v)} (mes/día); se tomó como ${dmy(fix)}${fits(fix) ? '' : ', pero queda fuera de orden'}. Revisala.`,
      };
      continue;
    }
    const candidates: Ymd[] = [swapped];
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
    // "Carlos", "(Carlos)", "solo Carlos", "Carlos solo" → sesión sólo de Carlos.
    const restKey = fold(h.rest).replace(/^\(\s*(.*?)\s*\)$/, '$1').replace(/^solo\s+|\s+solo$/, '').trim();
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
