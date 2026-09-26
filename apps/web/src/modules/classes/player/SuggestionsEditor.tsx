/**
 * AI suggestions for a recording (story 11.4): the teacher asks for chapters and checkpoints
 * made from the transcript, then accepts or dismisses each one. Nothing reaches learners
 * without the teacher's click.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArabicText, CollapsibleCard } from '@/components';
import { clock } from '@/services/media/checkpoints';
import type {
  InteractiveApi,
  Suggestion,
  SuggestionState,
} from '@/services/media/interactiveApi';

const POLL_MS = 3000;

function describe(s: Suggestion) {
  if (s.kind === 'chapter') return <span>Kapitel: {s.data.title}</span>;
  const d = s.data;
  switch (d.kind) {
    case 'mcq':
      return (
        <span>
          Frage: {d.question} <span className="muted">({d.options[d.answer]})</span>
        </span>
      );
    case 'dictation':
      return (
        <span>
          Diktat: <ArabicText>{d.answer}</ArabicText>
        </span>
      );
    case 'vocab_flash':
      return (
        <span>
          Wortkarte: <ArabicText>{d.ar}</ArabicText> – {d.de}
          {d.contentRef ? <span className="muted"> (Kurswort)</span> : null}
        </span>
      );
  }
}

export function SuggestionsEditor({
  api,
  classId,
  mediaId,
  onChange,
  pollMs = POLL_MS,
}: {
  api: InteractiveApi;
  classId: string;
  mediaId: string;
  onChange: () => void;
  pollMs?: number;
}) {
  const [state, setState] = useState<SuggestionState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    const result = await api.suggestions(classId, mediaId);
    if (!result.ok) return setMessage(result.message);
    setState(result.value);
    const status = result.value.run?.status;
    if (status === 'queued' || status === 'running') {
      timer.current = setTimeout(() => void load(), pollMs);
    }
  }, [api, classId, mediaId, pollMs]);

  useEffect(() => {
    void load();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [load]);

  const request = async () => {
    setMessage(null);
    const result = await api.requestSuggestions(classId, mediaId);
    if (!result.ok) return setMessage(result.message);
    await load();
  };

  const decide = async (s: Suggestion, decision: 'accept' | 'dismiss') => {
    const result = await api.decide(classId, mediaId, s.id, decision);
    if (!result.ok) return setMessage(result.message);
    setState((current) =>
      current
        ? { ...current, suggestions: current.suggestions.filter((x) => x.id !== s.id) }
        : current
    );
    if (decision === 'accept') onChange();
  };

  // All at once, one after another (each is its own decision on the server).
  const decideAll = async (decision: 'accept' | 'dismiss') => {
    for (const s of state?.suggestions ?? []) {
      const result = await api.decide(classId, mediaId, s.id, decision);
      if (!result.ok) {
        setMessage(result.message);
        break;
      }
      setState((current) =>
        current
          ? { ...current, suggestions: current.suggestions.filter((x) => x.id !== s.id) }
          : current
      );
    }
    if (decision === 'accept') onChange();
  };

  const status = state?.run?.status;
  const working = status === 'queued' || status === 'running';
  return (
    <CollapsibleCard
      id="suggestions"
      title={
        state?.suggestions.length
          ? `KI-Vorschläge (${state.suggestions.length} offen)`
          : 'KI-Vorschläge'
      }
    >
      <p className="muted" style={{ margin: 0 }}>
        Kapitel, Wortkarten, Fragen und Diktate aus dem Transkript. Lernende sehen nur,
        was du übernimmst: Kapitel erscheinen als Liste unter dem Video (antippen springt
        dorthin), Fragen, Diktate und Wortkarten als Checkpoints – das Video hält an der
        Stelle an und zeigt die Aufgabe.
      </p>
      <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          className="btn"
          type="button"
          disabled={working}
          onClick={() => void request()}
        >
          {working
            ? 'Vorschläge werden erstellt …'
            : state?.suggestions.length
              ? 'Neu vorschlagen lassen'
              : 'Vorschläge holen'}
        </button>
        {status === 'failed' && (
          <span className="feedback-bad">Das hat nicht geklappt. Bitte noch einmal.</span>
        )}
        {message && <span className="feedback-bad">{message}</span>}
      </div>
      {(state?.suggestions.length ?? 0) > 1 && (
        <div className="row" style={{ gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void decideAll('accept')}
          >
            Alle übernehmen
          </button>
          <button className="btn" type="button" onClick={() => void decideAll('dismiss')}>
            Alle verwerfen
          </button>
        </div>
      )}
      {state?.suggestions.map((s) => (
        <div
          key={s.id}
          className="row"
          style={{ gap: '0.5rem', justifyContent: 'space-between', flexWrap: 'wrap' }}
        >
          <span>
            <span className="muted">{clock(s.atSec)}</span> {describe(s)}
          </span>
          <span className="row" style={{ gap: '0.4rem' }}>
            <button
              className="btn btn-primary"
              type="button"
              aria-label={`Übernehmen (${clock(s.atSec)})`}
              onClick={() => void decide(s, 'accept')}
            >
              Übernehmen
            </button>
            <button
              className="btn"
              type="button"
              aria-label={`Verwerfen (${clock(s.atSec)})`}
              onClick={() => void decide(s, 'dismiss')}
            >
              Verwerfen
            </button>
          </span>
        </div>
      ))}
    </CollapsibleCard>
  );
}
