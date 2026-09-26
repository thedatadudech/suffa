/**
 * Checkpoints and transcript while a recording plays (stories 8.1, 8.2), pure: which
 * checkpoint is due, whether an answer is right, which transcript cue is current.
 */
import { normalizeArabic } from '@/services/srs/tashkil';

export type CheckpointData =
  | { kind: 'mcq'; question: string; options: string[]; answer: number }
  | { kind: 'dictation'; prompt: string; answer: string }
  | { kind: 'vocab_flash'; ar: string; de: string; contentRef?: string | null };

export interface Checkpoint {
  id: string;
  atSec: number;
  data: CheckpointData;
}

export interface Cue {
  start: number;
  end: number;
  text: string;
}

/** Playing across a checkpoint triggers it; jumping further than this past it does not. */
export const TRIGGER_WINDOW_SEC = 1.5;

/**
 * The checkpoint to show when playback moved from `previous` to `now`: the first one crossed
 * (previous < at ≤ now + 0.5 s tolerance) that is not done yet. Seeking far past a
 * checkpoint skips it; seeking backwards never triggers.
 */
export function dueCheckpoint(
  checkpoints: readonly Checkpoint[],
  previous: number,
  now: number,
  done: ReadonlySet<string>
): Checkpoint | null {
  if (now < previous || now - previous > TRIGGER_WINDOW_SEC) return null;
  return (
    [...checkpoints]
      .sort((a, b) => a.atSec - b.atSec)
      .find((c) => !done.has(c.id) && c.atSec > previous - 0.5 && c.atSec <= now + 0.5) ??
    null
  );
}

/** Is the learner's answer right? Arabic is compared without vowel marks and spacing. */
export function isCorrect(data: CheckpointData, answer: string | number): boolean {
  switch (data.kind) {
    case 'mcq':
      return answer === data.answer;
    case 'dictation':
      return (
        typeof answer === 'string' &&
        normalizeArabic(answer).replace(/\s+/g, ' ').trim() ===
          normalizeArabic(data.answer).replace(/\s+/g, ' ').trim()
      );
    case 'vocab_flash':
      // Seen is enough: a flash card has no wrong answer.
      return true;
  }
}

/** Index of the cue playing at `t`, or -1. Cues are sorted by start. */
export function activeCue(cues: readonly Cue[], t: number): number {
  let lo = 0;
  let hi = cues.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cues[mid]!.start <= t) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found >= 0 && t <= cues[found]!.end + 0.25 ? found : -1;
}

/** "75.4" → "1:15". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** WebVTT timestamp (hh:mm:ss.mmm). */
function vttTime(seconds: number): string {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)}.${pad(ms % 1000, 3)}`;
}

/**
 * The transcript as WebVTT subtitles for the <video> element, so the current line is on the
 * picture, also in full screen. A cue without length lasts until the next one (max 8 s).
 */
export function cuesToVtt(cues: readonly Cue[]): string {
  const blocks = cues.map((cue, i) => {
    const next = cues[i + 1]?.start;
    const end =
      cue.end > cue.start ? cue.end : Math.min(next ?? cue.start + 8, cue.start + 8);
    // A blank line or "-->" would end or break the cue.
    const text = cue.text.replace(/\n\s*\n/g, '\n').replace(/-->/g, '→');
    return `${vttTime(cue.start)} --> ${vttTime(end)}\n${text}`;
  });
  return ['WEBVTT', ...blocks].join('\n\n') + '\n';
}
