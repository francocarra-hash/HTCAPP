import { useState } from 'react';
import { api, ApiError, Role, setToken } from './api';

export default function Login({ onDone }: { onDone: (role: Role) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.login(username.trim(), password);
      if (res.token) setToken(res.token);
      onDone(res.role);
    } catch (err) {
      const status = (err as ApiError).status;
      setError(status === 401 ? 'Usuario o contraseña incorrectos.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bt bt-login">
      <form onSubmit={submit} className="card">
        <div className="brand">
          <span className="mark" aria-hidden="true">H</span>
          <div>
            <b>HTC</b>
            <span>Tu entrenamiento, sesión a sesión</span>
          </div>
        </div>
        <div className="fields" style={{ marginTop: 22 }}>
          <div className="field full">
            <label htmlFor="lg-user">Usuario</label>
            <input id="lg-user" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
              value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </div>
          <div className="field full">
            <label htmlFor="lg-pass">Contraseña</label>
            <input id="lg-pass" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </div>
        </div>
        {error && <p className="err">{error}</p>}
        <div className="actions">
          <button type="submit" className="btn primary wide" disabled={!username.trim() || !password || busy}>
            {busy ? <span className="spin" aria-label="Ingresando" /> : 'Entrar'}
          </button>
        </div>
        <p className="hint" style={{ textAlign: 'center', marginTop: 14 }}>
          ¿No tenés usuario? Pedíselo a tu profe.
        </p>
      </form>
    </div>
  );
}
