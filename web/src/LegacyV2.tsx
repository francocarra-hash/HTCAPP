import { useState } from 'react';
import Dashboard from './Dashboard';
import AssessmentForm from './AssessmentForm';
import DecisionView from './DecisionView';
import ReportView from './ReportView';

type View =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'decision'; id: string }
  | { name: 'report'; id: string };

/** Modelo v2 (histórico): mismas pantallas de siempre, sin cambios. */
export default function LegacyV2() {
  const [view, setView] = useState<View>({ name: 'dashboard' });
  return (
    <>
      {view.name === 'dashboard' && (
        <Dashboard onNew={() => setView({ name: 'new' })} onOpenDecision={(id) => setView({ name: 'decision', id })} />
      )}
      {view.name === 'new' && (
        <AssessmentForm onDone={(id) => setView({ name: 'decision', id })} onCancel={() => setView({ name: 'dashboard' })} />
      )}
      {view.name === 'decision' && (
        <DecisionView
          decisionId={view.id}
          onBack={() => setView({ name: 'dashboard' })}
          onReport={(id) => setView({ name: 'report', id })}
        />
      )}
      {view.name === 'report' && (
        <ReportView decisionId={view.id} onBack={() => setView({ name: 'decision', id: view.id })} />
      )}
    </>
  );
}
