import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { Assignments } from '@/modules/classes/Assignments';
import { RecordingPlayer } from '@/modules/classes/RecordingPlayer';
import { db } from '@/services/storage';
import { useListenStore, usePracticeStore } from '@/state';

const CLASS = '11111111-1111-4111-8111-111111111111';
const MEDIA = '22222222-2222-4222-8222-222222222222';
const playback = {
  id: MEDIA,
  title: 'Stunde 1',
  source: 'upload',
  status: 'ready',
  progress: 100,
  durationSec: 100,
  hasVideo: false,
  originalName: 'a.m4a',
  originalSize: 10,
  error: null,
  publishedAt: '2026-09-24T10:00:00.000Z',
  createdAt: '2026-09-24T09:00:00.000Z',
  audio: '/media/suffa-media/x/audio.m4a',
  video: null,
};
const interactive = {
  transcript: {
    status: 'ready',
    source: 'manual',
    cues: [
      { start: 0, end: 4, text: 'السلام عليكم' },
      { start: 5, end: 9, text: 'كيف حالك' },
    ],
    error: null,
    updatedAt: '2026-09-24T10:00:00.000Z',
  },
  checkpoints: [
    {
      id: 'cp1',
      atSec: 6,
      data: {
        kind: 'mcq',
        question: 'Was heißt حال?',
        options: ['Zustand', 'Haus'],
        answer: 0,
      },
    },
  ],
  canEdit: false,
  canGenerate: false,
};

describe('Interactive recordings (integration)', () => {
  const requests: { method: string; path: string; body: unknown }[] = [];
  beforeEach(async () => {
    requests.length = 0;
    await db.media_progress.clear();
    await db.practice_progress.clear();
    await useListenStore.getState().load();
    await usePracticeStore.getState().load();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const path = String(input);
        requests.push({
          method: init?.method ?? 'GET',
          path,
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        if (path.endsWith('/play')) return Response.json(playback);
        if (path.endsWith('/interactive')) return Response.json(interactive);
        if (path.endsWith('/assignments') && (init?.method ?? 'GET') === 'GET') {
          return Response.json({
            assignments: [
              {
                id: 'a1',
                kind: 'unit',
                ref: '3',
                title: 'Einheit 3: Test bestehen',
                dueAt: '2026-10-01T21:59:00.000Z',
                done: true,
                doneCount: null,
                learners: null,
              },
              {
                id: 'a2',
                kind: 'recording',
                ref: MEDIA,
                title: 'Anhören: Stunde 1',
                dueAt: '2026-10-02T21:59:00.000Z',
                done: false,
                doneCount: null,
                learners: null,
              },
            ],
          });
        }
        if (path.endsWith('/media')) return Response.json({ items: [playback] });
        return Response.json({ id: 'new' }, { status: 201 });
      })
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('pauses at a checkpoint, counts a right answer and shows the transcript', async () => {
    const router = createMemoryRouter(
      [{ path: '/classes/:id/recordings/:mediaId', element: <RecordingPlayer /> }],
      { initialEntries: [`/classes/${CLASS}/recordings/${MEDIA}`] }
    );
    render(<RouterProvider router={router} />);
    const audio = (await screen.findByLabelText('Stunde 1')) as HTMLAudioElement;
    const transcript = screen.getByRole('region', { name: 'Transkript' });
    expect(within(transcript).getAllByText('كيف حالك').length).toBeGreaterThan(0);

    let time = 0;
    Object.defineProperty(audio, 'currentTime', {
      get: () => time,
      set: (v: number) => (time = v),
      configurable: true,
    });
    const pause = vi.fn();
    audio.pause = pause;
    audio.play = vi.fn(async () => undefined);
    fireEvent.play(audio);
    for (const t of [1, 2, 3, 4, 5, 6.1]) {
      time = t;
      fireEvent.timeUpdate(audio);
    }
    expect(pause).toHaveBeenCalled();
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getByLabelText('Zustand'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Prüfen' }));
    expect(within(dialog).getByText('Richtig!')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Weiter' }));
    await vi.waitFor(() =>
      expect(
        usePracticeStore.getState().records[`0:checkpoint:${MEDIA}/cp1`]
      ).toBeTruthy()
    );
    expect(screen.queryByRole('dialog')).toBeNull();
    // Folded, the line being spoken stays in view under the player.
    expect(transcript.querySelector('.transcript-now')).toHaveTextContent('كيف حالك');
    // Opened: the current line is marked in the list; a tap on a line jumps there.
    await userEvent.click(within(transcript).getByRole('button', { name: /Aufklappen/ }));
    const line = within(transcript)
      .getAllByText('كيف حالك')
      .find((el) => el.closest('li'));
    expect(line?.closest('li')).toHaveClass('transcript-current');
    await userEvent.click(within(transcript).getByText('السلام عليكم'));
    expect(time).toBe(0);
  });

  it('shows learners what is open and done, and lets teachers set assignments', async () => {
    const router = createMemoryRouter(
      [
        { path: '/learner', element: <Assignments classId={CLASS} teacher={false} /> },
        { path: '/teacher', element: <Assignments classId={CLASS} teacher /> },
      ],
      { initialEntries: ['/learner'] }
    );
    render(<RouterProvider router={router} />);
    expect(
      await screen.findByRole('link', { name: '✓ Einheit 3: Test bestehen' })
    ).toHaveAttribute('href', '/units/3');
    expect(screen.getByRole('link', { name: 'Anhören: Stunde 1' })).toHaveAttribute(
      'href',
      `/classes/${CLASS}/recordings/${MEDIA}`
    );
    expect(screen.queryByRole('form', { name: 'Aufgabe stellen' })).toBeNull();

    await router.navigate('/teacher');
    const form = await screen.findByRole('form', { name: 'Aufgabe stellen' });
    await userEvent.selectOptions(within(form).getByLabelText('Aufgabe'), 'unit:5');
    await userEvent.click(within(form).getByRole('button', { name: 'Aufgabe stellen' }));
    const post = requests.find((r) => r.method === 'POST');
    expect(post).toMatchObject({
      path: `/api/v1/classes/${CLASS}/assignments`,
      body: { kind: 'unit', ref: '5', title: 'Einheit 5: Test bestehen' },
    });
  });
});
