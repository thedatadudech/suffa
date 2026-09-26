/** AI suggestions and chapters of a recording in the app (story 11.4). */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChapterList } from '@/modules/classes/player/ChapterList';
import { SuggestionsEditor } from '@/modules/classes/player/SuggestionsEditor';
import { InteractiveApi, type SuggestionState } from '@/services/media/interactiveApi';

const READY: SuggestionState = {
  run: { status: 'ready', error: null },
  suggestions: [
    { id: 's1', kind: 'chapter', atSec: 95, data: { title: 'Neue Wörter: Schule' } },
    {
      id: 's2',
      kind: 'checkpoint',
      atSec: 100,
      data: { kind: 'vocab_flash', ar: 'اِسْم', de: 'Name', contentRef: 'v-ism' },
    },
    {
      id: 's3',
      kind: 'checkpoint',
      atSec: 120,
      data: {
        kind: 'mcq',
        question: 'Wie heißt sie?',
        options: ['Sara', 'Huda'],
        answer: 1,
      },
    },
  ],
};

function setup(states: SuggestionState[]) {
  const requests: { method: string; path: string; body: unknown }[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(input);
    requests.push({
      method,
      path,
      body: init?.body ? JSON.parse(String(init.body)) : null,
    });
    if (method === 'GET')
      return Response.json(states.length > 1 ? states.shift() : states[0]);
    if (method === 'POST') return new Response(null, { status: 202 });
    return new Response(null, { status: 204 });
  });
  const onChange = vi.fn();
  render(
    <SuggestionsEditor
      api={new InteractiveApi(fetchImpl as typeof fetch)}
      classId="c1"
      mediaId="m1"
      onChange={onChange}
      pollMs={5}
    />
  );
  return { requests, onChange };
}

describe('Recording suggestions', () => {
  afterEach(() => localStorage.clear());

  it('dismisses all open suggestions at once, and folds away', async () => {
    const { requests, onChange } = setup([READY]);
    expect(await screen.findByText('KI-Vorschläge (3 offen)')).toBeTruthy();
    await userEvent.click(screen.getByRole('button', { name: 'Alle verwerfen' }));
    const puts = requests.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => r.body)).toEqual([
      { decision: 'dismiss' },
      { decision: 'dismiss' },
      { decision: 'dismiss' },
    ]);
    expect(screen.queryByText('Kapitel: Neue Wörter: Schule')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /Zuklappen/ }));
    expect(screen.getByText('Vorschläge holen')).not.toBeVisible();
  });

  it('asks for suggestions, waits for them, and takes over only what the teacher accepts', async () => {
    const { requests, onChange } = setup([
      { run: null, suggestions: [] },
      { run: { status: 'running', error: null }, suggestions: [] },
      READY,
    ]);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Vorschläge holen' })
    );
    expect(requests.find((r) => r.method === 'POST')?.path).toBe(
      '/api/v1/classes/c1/media/m1/suggestions'
    );
    expect(await screen.findByText('Kapitel: Neue Wörter: Schule')).toBeTruthy();
    expect(screen.getByText('(Kurswort)')).toBeTruthy();
    expect(screen.getByText('(Huda)')).toBeTruthy();

    await userEvent.click(screen.getByRole('button', { name: 'Übernehmen (1:35)' }));
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen (2:00)' }));
    const puts = requests.filter((r) => r.method === 'PUT');
    expect(puts.map((r) => [r.path, r.body])).toEqual([
      ['/api/v1/classes/c1/media/m1/suggestions/s1', { decision: 'accept' }],
      ['/api/v1/classes/c1/media/m1/suggestions/s3', { decision: 'dismiss' }],
    ]);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Kapitel: Neue Wörter: Schule')).toBeNull();
  });

  it('shows a failed run', async () => {
    setup([{ run: { status: 'failed', error: 'x' }, suggestions: [] }]);
    expect(await screen.findByText(/hat nicht geklappt/)).toBeTruthy();
  });
});

describe('Chapter list', () => {
  it('marks the current chapter, jumps and lets teachers remove one', async () => {
    const onSeek = vi.fn();
    const onRemove = vi.fn();
    const chapters = [
      { id: 'a', atSec: 0, title: 'Begrüßung' },
      { id: 'b', atSec: 95, title: 'Schule' },
    ];
    const { rerender } = render(
      <ChapterList chapters={chapters} time={120} onSeek={onSeek} onRemove={onRemove} />
    );
    expect(
      screen.getByRole('button', { name: '1:35 Schule' }).getAttribute('aria-current')
    ).toBe('true');
    await userEvent.click(screen.getByRole('button', { name: '0:00 Begrüßung' }));
    expect(onSeek).toHaveBeenCalledWith(0);
    await userEvent.click(
      screen.getByRole('button', { name: 'Kapitel „Schule“ entfernen' })
    );
    expect(onRemove).toHaveBeenCalledWith(chapters[1]);
    rerender(<ChapterList chapters={[]} time={0} onSeek={onSeek} />);
    expect(screen.queryByRole('navigation', { name: 'Kapitel' })).toBeNull();
  });
});
