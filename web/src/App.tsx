import { useCallback, useEffect, useState } from 'react';
import { api, clearToken, Role, setUnauthorizedHandler } from './api';
import Login from './Login';
import CoachApp from './app/CoachApp';
import StudentApp from './app/StudentApp';

type State =
  | { kind: 'loading' }
  | { kind: 'login' }
  | { kind: 'coach'; authEnabled: boolean }
  | { kind: 'student' };

/** Entrada única: el rol del token decide si se abre el panel del profe o la app del alumno. */
export default function App() {
  const [state, setState] = useState<State>({ kind: 'loading' });

  const bootstrap = useCallback(() => {
    api.session()
      .then((s) => setState(s.role === 'student' ? { kind: 'student' } : { kind: 'coach', authEnabled: s.auth_enabled }))
      .catch(() => setState({ kind: 'login' }));
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState({ kind: 'login' }));
    bootstrap();
  }, [bootstrap]);

  // El panel del profe es claro (las pantallas de evaluación están diseñadas así);
  // el alumno sigue el tema del teléfono.
  useEffect(() => {
    if (state.kind === 'coach') document.documentElement.dataset.theme = 'light';
    else delete document.documentElement.dataset.theme;
  }, [state.kind]);

  const logout = () => {
    clearToken();
    setState({ kind: 'login' });
    window.scrollTo(0, 0);
  };

  if (state.kind === 'loading') return null;
  if (state.kind === 'login') return <Login onDone={(_role: Role) => bootstrap()} />;
  if (state.kind === 'student') return <StudentApp onLogout={logout} />;
  return <CoachApp onLogout={logout} authEnabled={state.authEnabled} />;
}
