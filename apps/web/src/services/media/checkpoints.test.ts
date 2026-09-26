import { describe, expect, it } from 'vitest';
import {
  activeCue,
  clock,
  cuesToVtt,
  dueCheckpoint,
  isCorrect,
  type Checkpoint,
} from './checkpoints';

const cp = (id: string, atSec: number): Checkpoint => ({
  id,
  atSec,
  data: { kind: 'dictation', prompt: '', answer: 'x' },
});
const cps = [cp('b', 60), cp('a', 30)];

describe('checkpoints', () => {
  it('triggers when playback crosses a checkpoint, within half a second', () => {
    expect(dueCheckpoint(cps, 29.6, 29.8, new Set())?.id).toBe('a'); // 0.2 s early
    expect(dueCheckpoint(cps, 29.8, 30.1, new Set())?.id).toBe('a');
    expect(dueCheckpoint(cps, 30.1, 30.4, new Set(['a']))).toBeNull();
    expect(dueCheckpoint(cps, 20, 21, new Set())).toBeNull();
  });

  it('never triggers on seeking', () => {
    expect(dueCheckpoint(cps, 10, 45, new Set())).toBeNull(); // jumped past
    expect(dueCheckpoint(cps, 70, 30, new Set())).toBeNull(); // backwards
  });

  it('checks answers without vowel marks', () => {
    const mcq = { kind: 'mcq' as const, question: 'q', options: ['a', 'b'], answer: 1 };
    expect(isCorrect(mcq, 1)).toBe(true);
    expect(isCorrect(mcq, 0)).toBe(false);
    const dictation = {
      kind: 'dictation' as const,
      prompt: '',
      answer: 'مَرْحَبًا بِكَ',
    };
    expect(isCorrect(dictation, 'مرحبا  بك')).toBe(true);
    expect(isCorrect(dictation, 'مرحبا')).toBe(false);
    expect(isCorrect(dictation, 3)).toBe(false);
    expect(isCorrect({ kind: 'vocab_flash', ar: 'كتاب', de: 'Buch' }, '')).toBe(true);
  });

  it('finds the current transcript cue', () => {
    const cues = [
      { start: 0, end: 2, text: 'a' },
      { start: 3, end: 5, text: 'b' },
      { start: 5, end: 9, text: 'c' },
    ];
    expect(activeCue(cues, 1)).toBe(0);
    expect(activeCue(cues, 2.8)).toBe(-1);
    expect(activeCue(cues, 5)).toBe(2);
    expect(activeCue(cues, 20)).toBe(-1);
    expect(activeCue([], 1)).toBe(-1);
    expect(clock(75.4)).toBe('1:15');
  });
});

describe('cuesToVtt', () => {
  it('writes WebVTT with hour timestamps and safe text', () => {
    expect(
      cuesToVtt([
        { start: 0, end: 2.5, text: 'مرحبا' },
        { start: 3661.2, end: 3661.2, text: 'a --> b\n\nc' },
      ])
    ).toBe(
      'WEBVTT\n\n00:00:00.000 --> 00:00:02.500\nمرحبا\n\n01:01:01.200 --> 01:01:09.200\na → b\nc\n'
    );
  });
});
