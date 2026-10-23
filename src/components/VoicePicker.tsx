import { useEffect, useState } from 'react';
import { playPreview, say } from '../lib/voice';
import { IconPlay } from './Icons';
import { Button } from './ui';

interface VoiceOption {
  id: string;
  name: string;
  description: string;
  previewUrl: string | null;
  ownerId?: string;
}

/** ElevenLabs voice picker: audition young, energetic male voices and pick Hypeman's. */
export function VoicePicker({ selected, persona, onSelect }: { selected: string | null; persona: string; onSelect(id: string | null): void }) {
  const [voices, setVoices] = useState<VoiceOption[] | null>(null);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/voices')
      .then(async (r) => {
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? 'Couldn’t load voices.');
        return b as { defaultVoiceId: string; voices: VoiceOption[] };
      })
      .then((b) => {
        if (cancelled) return;
        setVoices(b.voices);
        setDefaultId(b.defaultVoiceId);
      })
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  const current = selected ?? defaultId;

  const choose = async (v: VoiceOption) => {
    setBusy(v.id);
    setError(null);
    try {
      let id = v.id;
      if (v.ownerId) {
        const r = await fetch('/api/voices/adopt', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ voiceId: v.id, ownerId: v.ownerId }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? 'Couldn’t add that voice.');
        id = b.voiceId;
      }
      onSelect(id);
      void say('Yessir! Hype man in the house.', null, persona);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (error && !voices) return <p className="text-sm text-muted">{error}</p>;
  if (!voices) return <p className="text-sm text-muted">Loading voices from ElevenLabs…</p>;
  if (!voices.length) return <p className="text-sm text-muted">No matching voices found. The default voice will be used.</p>;

  return (
    <div className="flex flex-col gap-2" role="radiogroup" aria-label="Hypeman's voice">
      {voices.map((v) => {
        const on = v.id === current;
        return (
          <div key={v.id} className={`flex items-center gap-3 rounded-2xl border px-3 py-2.5 ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}>
            <Button size="icon" variant="ghost" aria-label={`Preview ${v.name}`} disabled={!v.previewUrl} onClick={() => v.previewUrl && playPreview(v.previewUrl)}>
              <IconPlay width={18} height={18} />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{v.name}</p>
              {v.description && <p className="truncate text-xs text-muted">{v.description}</p>}
            </div>
            <Button role="radio" aria-checked={on} variant={on ? 'primary' : 'secondary'} disabled={busy !== null} onClick={() => !on && choose(v)}>
              {busy === v.id ? 'Adding…' : on ? 'Using' : 'Use'}
            </Button>
          </div>
        );
      })}
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
