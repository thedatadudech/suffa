/** Parts of a recorded lesson (story 11.4): tap to jump; teachers can remove a chapter. */
import { CollapsibleCard } from '@/components';
import { clock } from '@/services/media/checkpoints';
import type { Chapter } from '@/services/media/interactiveApi';

export function ChapterList({
  chapters,
  time,
  onSeek,
  onRemove,
}: {
  chapters: Chapter[];
  time: number;
  onSeek: (sec: number) => void;
  onRemove?: (chapter: Chapter) => void;
}) {
  if (chapters.length === 0) return null;
  const current = [...chapters].reverse().find((c) => c.atSec <= time)?.id;
  return (
    <CollapsibleCard id="chapters" title="Kapitel">
      <nav className="stack" aria-label="Kapitel" style={{ gap: '0.35rem' }}>
        {chapters.map((c) => (
          <div key={c.id} className="row" style={{ gap: '0.5rem' }}>
            <button
              type="button"
              className={`btn ${c.id === current ? 'btn-primary' : ''}`}
              aria-current={c.id === current ? 'true' : undefined}
              onClick={() => onSeek(c.atSec)}
              style={{ flex: 1, justifyContent: 'flex-start' }}
            >
              <span className="muted">{clock(c.atSec)}</span>&nbsp;{c.title}
            </button>
            {onRemove && (
              <button
                type="button"
                className="btn"
                aria-label={`Kapitel „${c.title}“ entfernen`}
                onClick={() => onRemove(c)}
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </nav>
    </CollapsibleCard>
  );
}
