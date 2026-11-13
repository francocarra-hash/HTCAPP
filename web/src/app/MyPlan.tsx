import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../api';
import { addDays, FinanceData, isMercadoPago, occurrences, shortDate, studentApi, WEEKDAYS } from './data';
import { fmtLong, makeFin, money, MOD_LABEL, shiftYM, ym } from './billing';
import { Icon, Skeleton } from './ui';

/**
 * "Mi plan y pagos" del alumno: usa lo mismo que Finanzas (pagos, asistencia y
 * agenda), sin duplicar datos. Abrir el link de pago no marca nada como pagado:
 * el pago queda registrado cuando el profe lo confirma.
 */
export function MyPlan({ toast }: { toast: (m: string) => void }) {
  const [data, setData] = useState<FinanceData | null>(null);
  const [err, setErr] = useState('');
  const [all, setAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { studentApi.plan().then(setData).catch((e: Error) => setErr(e.message)); }, []);
  useEffect(load, [load]);

  if (err) return <section className="card"><h2>Mi plan y pagos</h2><p className="hint">No se pudo cargar: {err}</p></section>;
  if (!data) return <section className="card"><h2>Mi plan y pagos</h2><Skeleton /></section>;
  const fin = makeFin(data);
  const s = data.students[0];
  if (!s) return null;
  const b = fin.billing(s);
  if (!s.billing || b.cuota == null) {
    return (
      <section className="card">
        <h2>Mi plan y pagos</h2>
        <p className="hint">Tu profe todavía no cargó tu plan. Cuando lo haga, vas a ver acá tus clases y tus pagos.</p>
      </section>
    );
  }
  const mon = fin.moneda(s);
  const modo = fin.modo(s);
  const c = fin.estadoPago(s);
  const sd = fin.saldo(s);
  const pays = [...fin.pagosDe(s.id)].reverse();
  const shown = all ? pays : pays.slice(0, 4);
  const link = b.pago_link && isMercadoPago(b.pago_link.url) ? b.pago_link : null;
  const horario = s.schedule?.weekly.length
    ? s.schedule.weekly.map((w) => `${WEEKDAYS[w.weekday]}${w.time ? ` ${w.time}` : ''}`).join(' · ')
    : null;

  // Clases del período vigente.
  let clases: { contratadas: number | null; hechas: number; quedan: number | null; txt: string } | null = null;
  if (modo === 'clases' && sd) {
    const N = fin.clasesPaquete(s) || [...fin.cargosDe(s.id)].reverse().find((c) => c.sessions)?.sessions || null;
    const quedan = sd.restan;
    // Hechas del paquete vigente: si ya arrancó el nuevo, el anterior quedó completo.
    const hechas = N != null ? (quedan < 0 ? N : Math.max(0, N - quedan)) : Math.max(0, sd.tomadas);
    clases = {
      contratadas: N, hechas, quedan,
      txt: quedan < 0 ? `Ya ${-quedan === 1 ? 'tomaste 1 clase' : `tomaste ${-quedan} clases`} del paquete nuevo.` : quedan === 0 ? 'Terminaste el paquete.' : '',
    };
  } else if (modo === 'mensual') {
    const m = ym(fin.today);
    const fin0 = addDays(`${shiftYM(m, 1)}-01`, -1);
    const prog = new Set(occurrences(s.schedule, `${m}-01`, fin0).map((o) => o.date));
    const hechas = fin.marcasDe(s.id).filter(([f, k]) => f.startsWith(m) && k === 'p').length;
    const pendientes = [...prog].filter((f) => f >= fin.today && !fin.marca(s.id, f)).length;
    clases = { contratadas: prog.size || null, hechas, quedan: pendientes, txt: 'Clases de este mes según tu agenda.' };
  }

  const estado = c.k === 'debe' ? { t: 'Vencido', cls: 'bad' } : c.k === 'pagar' ? { t: 'Para pagar', cls: 'bad' } : c.k === 'sinfecha' ? { t: 'Sin fecha', cls: '' } : { t: 'Pendiente', cls: 'low' };
  const cuando = c.k === 'debe'
    ? c.due ? `Era el ${shortDate(c.due)}` : 'Ya venció'
    : c.k === 'pagar' ? 'Después de la clase de hoy'
    : c.due ? (modo === 'prog' ? `Vence el ${fmtLong(c.due)}` : `Después de la clase del ${fmtLong(c.due)}`) : 'Tu profe te avisa la fecha';
  const avisado = b.pago_avisado;

  const avisar = async () => {
    setBusy(true);
    try { await studentApi.payNotice(); toast('Le avisamos a tu profe'); load(); } catch (e) { toast((e as ApiError).message); } finally { setBusy(false); }
  };

  return (
    <section className="card myplan">
      <h2>Mi plan y pagos</h2>
      <div className="mp-grid">
        <div className="mp-cell">
          <span className="lab">Mi plan</span>
          <b>{MOD_LABEL[b.modalidad]}</b>
          <small>{fin.modoTxt(s)}{horario ? ` · ${horario}` : ''}</small>
        </div>
        {clases && (
          <div className="mp-cell">
            <span className="lab">{modo === 'mensual' ? 'Clases del mes' : 'Clases disponibles'}</span>
            <b>{clases.quedan != null && clases.quedan > 0 ? (clases.quedan === 1 ? 'Te queda 1' : `Te quedan ${clases.quedan}`) : clases.quedan === 0 ? 'Te quedan 0' : 'Toca renovar'}</b>
            <small>
              {clases.contratadas != null ? `${modo === 'mensual' ? 'Programadas' : 'Contratadas'} ${clases.contratadas} · ` : ''}hechas {clases.hechas}
              {clases.txt ? `. ${clases.txt}` : ''}
            </small>
          </div>
        )}
        <div className="mp-cell">
          <span className="lab">Próximo pago</span>
          <b>{money(c.monto, mon)}</b>
          <small>{cuando} · <span className={`pill ${estado.cls}`}>{estado.t}</span></small>
          {(c.k === 'aldia' || c.k === 'pronto') && <small>Tu período actual está pagado.</small>}
        </div>
      </div>

      {link ? (
        <div className="mp-pay">
          <a className="btn primary wide" href={link.url} target="_blank" rel="noopener noreferrer">Pagar con Mercado Pago · {money(link.monto, link.moneda)}</a>
          {link.detalle && <small>{link.detalle}</small>}
          <p className="hint">Abrir el link no registra el pago: tu profe lo confirma cuando le llega.</p>
          {avisado
            ? <p className="hint">{Icon.check} Le avisaste a tu profe el {shortDate(avisado.slice(0, 10))}. Queda a confirmar.</p>
            : <button className="btn sm" disabled={busy} onClick={avisar}>Ya pagué, avisarle a mi profe</button>}
        </div>
      ) : (
        <p className="hint">Cuando tu profe cargue el link de pago de tu próxima cuota, vas a poder pagar desde acá con Mercado Pago.</p>
      )}

      {pays.length > 0 && (
        <>
          <div className="label" style={{ marginTop: 14 }}>Pagos anteriores</div>
          <div className="rows">
            {shown.map((p) => (
              <div key={p.id} className="frow">
                <span className="fw"><b>{fin.queCubre(p)}</b><small>Pagado el {shortDate(p.paid_on)} {p.paid_on.slice(0, 4)}</small></span>
                <span className="amt">{money(p.amount, mon)}</span>
              </div>
            ))}
          </div>
          {pays.length > 4 && <button className="btn sm ghost" onClick={() => setAll(!all)}>{all ? 'Ver menos' : `Ver los ${pays.length} pagos`}</button>}
        </>
      )}
    </section>
  );
}
