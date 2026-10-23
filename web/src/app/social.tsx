/**
 * Lo compartido entre profe y alumnos: fotos de perfil, video de cada ejercicio
 * y la comunidad (mensajes para todos).
 */
import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ApiError, getToken } from '../api';
import { CommunityMessage, initials, longDate, Person, socialApi } from './data';
import { Icon, Sheet, Skeleton } from './ui';

// ── personas (nombre + foto) ────────────────────────────────────────────────

interface PeopleCtx {
  me: string | null;
  byId: Map<string, Person>;
  reload: () => void;
  setAvatar: (id: string, version: string | null) => void;
}
const Ctx = createContext<PeopleCtx>({ me: null, byId: new Map(), reload: () => undefined, setAvatar: () => undefined });
export const usePeople = () => useContext(Ctx);

export function PeopleProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<{ me: string; people: Person[] } | null>(null);
  const reload = useCallback(() => { socialApi.people().then(setData).catch(() => undefined); }, []);
  useEffect(reload, [reload]);
  const value = useMemo<PeopleCtx>(() => ({
    me: data?.me ?? null,
    byId: new Map((data?.people ?? []).map((p) => [p.id, p])),
    reload,
    setAvatar: (id, v) => setData((d) => d && { ...d, people: d.people.map((p) => (p.id === id ? { ...p, avatar: v } : p)) }),
  }), [data, reload]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

const avatarCache = new Map<string, Promise<string | null>>();
function avatarUrl(owner: string, version: string): Promise<string | null> {
  const k = `${owner}@${version}`;
  if (!avatarCache.has(k)) {
    const token = getToken();
    avatarCache.set(k, fetch(`/api/social/avatars/${owner}?v=${encodeURIComponent(version)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).then((r) => (r.ok ? r.blob() : null)).then((b) => (b ? URL.createObjectURL(b) : null)).catch(() => null));
  }
  return avatarCache.get(k)!;
}

/** Foto de perfil (o iniciales). `id`: 'coach' o el id del alumno. */
export function Avatar({ id, name, size = 40, className }: { id: string; name?: string; size?: number; className?: string }) {
  const { byId } = usePeople();
  const p = byId.get(id);
  const version = p?.avatar ?? null;
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setUrl(null);
    if (version) avatarUrl(id, version).then((u) => { if (alive) setUrl(u); });
    return () => { alive = false; };
  }, [id, version]);
  const label = name ?? p?.name ?? '';
  return (
    <span className={`pic${className ? ` ${className}` : ''}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }} aria-hidden="true">
      {url ? <img src={url} alt="" /> : initials(label || '?')}
    </span>
  );
}

/** Achica la foto en el navegador (cuadrada, 384 px) antes de subirla. */
async function toSquareJpeg(file: File): Promise<string> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => bad(new Error('No se pudo leer la imagen'));
      i.src = src;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const out = 384;
    const c = document.createElement('canvas');
    c.width = out; c.height = out;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, out, out);
    return c.toDataURL('image/jpeg', 0.85);
  } finally {
    URL.revokeObjectURL(src);
  }
}

export function PhotoPicker({ owner, name, toast, size = 88 }: { owner: string; name: string; toast: (m: string) => void; size?: number }) {
  const { byId, setAvatar } = usePeople();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const has = Boolean(byId.get(owner)?.avatar);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const data = await toSquareJpeg(file);
      const r = await socialApi.setAvatar(owner, data);
      setAvatar(owner, r.avatar);
      toast('Foto actualizada');
    } catch (e) { toast((e as ApiError).message || 'No se pudo subir la foto'); } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };
  const remove = async () => {
    try { await socialApi.deleteAvatar(owner); setAvatar(owner, null); toast('Foto quitada'); } catch (e) { toast((e as ApiError).message); }
  };
  return (
    <div className="photo-pick">
      <button className="ph" onClick={() => input.current?.click()} aria-label="Cambiar foto" disabled={busy}>
        <Avatar id={owner} name={name} size={size} />
        <span className="cam" aria-hidden="true">{busy ? <span className="spin" /> : Icon.camera}</span>
      </button>
      <div style={{ display: 'grid', gap: 4 }}>
        <button className="btn sm" onClick={() => input.current?.click()} disabled={busy}>{busy ? 'Subiendo…' : has ? 'Cambiar foto' : 'Subir foto'}</button>
        {has && <button className="btn sm ghost" onClick={remove}>Quitar</button>}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

// ── video de un ejercicio ───────────────────────────────────────────────────

/** Link → video embebible (YouTube, Vimeo) o null si hay que abrirlo afuera. */
export function embedOf(url: string): { src: string; vertical: boolean } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\.|^m\./, '');
    let id: string | null = null;
    let vertical = false;
    if (host === 'youtu.be') id = u.pathname.slice(1).split('/')[0] ?? null;
    else if (host.endsWith('youtube.com')) {
      if (u.pathname.startsWith('/shorts/')) { id = u.pathname.split('/')[2] ?? null; vertical = true; }
      else if (u.pathname.startsWith('/embed/')) id = u.pathname.split('/')[2] ?? null;
      else id = u.searchParams.get('v');
    }
    if (id) return { src: `https://www.youtube-nocookie.com/embed/${id}?rel=0&playsinline=1`, vertical };
    if (host === 'vimeo.com') {
      const v = u.pathname.split('/').find((x) => /^\d+$/.test(x));
      if (v) return { src: `https://player.vimeo.com/video/${v}`, vertical: false };
    }
  } catch { /* link inválido */ }
  return null;
}

export function VideoSheet({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  const e = embedOf(url);
  return (
    <Sheet title={name} onClose={onClose}>
      {e ? (
        <div className={`vframe${e.vertical ? ' v' : ''}`}>
          <iframe src={e.src} title={`Video: ${name}`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen />
        </div>
      ) : <p className="hint" style={{ margin: 0 }}>Este video se abre en otra pestaña.</p>}
      <a className="btn wide" href={url} target="_blank" rel="noopener noreferrer">{Icon.play} Abrir el video{e ? ' en su sitio' : ''}</a>
    </Sheet>
  );
}

/** Botón ▶ al lado del ejercicio, si tiene video. */
export function VideoBtn({ url, name }: { url?: string | null; name: string }) {
  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <button className="vbtn" aria-label={`Ver video de ${name}`} onClick={(ev) => { ev.stopPropagation(); setOpen(true); }}>{Icon.play}</button>
      {open && <VideoSheet url={url} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

// ── comunidad ───────────────────────────────────────────────────────────────

/** Mensajes sin leer: cada minuto y al volver a la app. */
export function useUnread(): [number, () => void, (n: number) => void] {
  const [n, setN] = useState(0);
  const load = useCallback(() => { socialApi.unread().then((r) => setN(r.unread)).catch(() => undefined); }, []);
  useEffect(() => {
    load();
    const t = window.setInterval(load, 60_000);
    window.addEventListener('focus', load);
    return () => { window.clearInterval(t); window.removeEventListener('focus', load); };
  }, [load]);
  return [n, load, setN];
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
const dayOf = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export function Community({ isCoach, toast, onRead }: { isCoach: boolean; toast: (m: string) => void; onRead: () => void }) {
  const { byId } = usePeople();
  const [msgs, setMsgs] = useState<CommunityMessage[] | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const load = useCallback(async () => {
    try {
      const r = await socialApi.community();
      setMsgs(r.messages);
      const last = r.messages[r.messages.length - 1];
      if (last && r.unread) { await socialApi.read(last.created_at); onRead(); }
    } catch (e) { toast((e as ApiError).message); }
  }, [toast, onRead]);
  useEffect(() => {
    void load();
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 15_000);
    return () => window.clearInterval(t);
  }, [load]);
  useEffect(() => {
    if (msgs && msgs.length !== lastCount.current) {
      end.current?.scrollIntoView({ behavior: lastCount.current ? 'smooth' : 'auto', block: 'end' });
      lastCount.current = msgs.length;
    }
  }, [msgs]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    try {
      const r = await socialApi.post(body);
      setMsgs((m) => [...(m ?? []), r.message]);
      setText('');
    } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    setMenu(null);
    if (!window.confirm('¿Borrar este mensaje? Deja de verse para todos.')) return;
    try { await socialApi.deleteMessage(id); setMsgs((m) => (m ?? []).filter((x) => x.id !== id)); } catch (e) { toast((e as ApiError).message); }
  };

  if (!msgs) return <Skeleton />;
  let lastDay = '';
  return (
    <div className="chat">
      <p className="hint chat-intro">
        {isCoach ? 'Lo que escribís acá le llega a todos tus alumnos, destacado como mensaje del profe.' : 'Acá llegan los mensajes de tu profe y podés escribirle a todo el grupo.'}
      </p>
      {!msgs.length && <p className="empty">Todavía no hay mensajes. {isCoach ? 'Mandá el primero.' : 'Saludá al grupo.'}</p>}
      <div className="msgs">
        {msgs.map((m) => {
          const d = dayOf(m.created_at);
          const head = d !== lastDay ? <div className="mday"><span>{longDate(d)}</span></div> : null;
          lastDay = d;
          const author = byId.get(m.author);
          const coachMsg = m.author === 'coach';
          return (
            <div key={m.id}>
              {head}
              <div className={`msg${m.mine ? ' mine' : ''}${coachMsg ? ' coach' : ''}`}>
                {!m.mine && <Avatar id={m.author} name={author?.name} size={32} />}
                <div className="bub">
                  {!m.mine && <b className="au">{author?.name ?? 'Alumno'}{coachMsg && <span className="ptag">Profe</span>}</b>}
                  <div className="tx">{m.body}</div>
                  <span className="tm">{timeOf(m.created_at)}</span>
                  {(m.mine || isCoach) && (
                    <button className="mmenu" aria-label="Opciones del mensaje" onClick={() => setMenu(menu === m.id ? null : m.id)}>{Icon.menu}</button>
                  )}
                  {menu === m.id && <button className="btn sm danger mdel" onClick={() => remove(m.id)}>{Icon.trash} Borrar</button>}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={end} />
      </div>
      <div className="composer">
        <textarea value={text} rows={1} maxLength={2000} placeholder={isCoach ? 'Mensaje para todos…' : 'Escribile al grupo…'}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(pointer: fine)').matches) { e.preventDefault(); void send(); } }} />
        <button className="btn primary" disabled={busy || !text.trim()} onClick={send} aria-label="Enviar">{Icon.send}</button>
      </div>
    </div>
  );
}
