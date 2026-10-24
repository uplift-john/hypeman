import { useEffect, useRef, useState, type ReactNode } from 'react';
import { PERSONAS, PERSONA_IDS } from '../../shared/personas';
import { FREQUENCY_LABELS, type Frequency } from '../../shared/scheduler';
import type { Settings, ThemePref } from '../lib/storage';
import { listVoices, onVoicesChanged, say, voiceSupported } from '../lib/voice';
import { notificationPermission, requestNotificationPermission } from '../lib/notify';
import { IconClose, IconTrash, IconVolume } from './Icons';
import { Button } from './ui';
import { VoicePicker } from './VoicePicker';

interface Props {
  open: boolean;
  settings: Settings;
  onChange(patch: Partial<Settings>): void;
  onClose(): void;
  onClearHistory(): void;
  /** Present on gated deployments. */
  onSignOut?: () => void;
  /** Where the voice comes from; ElevenLabs gets a voice picker. */
  voiceSource?: 'elevenlabs' | 'browser';
}

const FREQ_HELP: Record<Frequency, string> = {
  chill: 'About one comment every 13 minutes.',
  normal: 'About one comment every 6–9 minutes.',
  max: 'As often as allowed — still never more than 2 per 10 minutes.',
};

export function SettingsDrawer({ open, settings, onChange, onClose, onClearHistory, onSignOut, voiceSource = 'browser' }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => listVoices());
  const [perm, setPerm] = useState(() => notificationPermission());
  const [cleared, setCleared] = useState(false);

  useEffect(() => onVoicesChanged(() => setVoices(listVoices())), []);

  // Keep the latest onClose without re-running the focus effect on every parent render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus management: move focus in on open, trap Tab, restore on close. Depends on `open` only.
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    panel.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panel.current) return;
      const f = Array.from(
        panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => el.offsetParent !== null || el.getClientRects().length > 0);
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      restoreTo.current?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const english = voices.filter((v) => /^en/i.test(v.lang));
  const voiceList = english.length ? english : voices;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        className="hm-drawer-in relative flex h-full w-full max-w-md flex-col overflow-y-auto border-l border-line bg-bg shadow-pop"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-bg/95 px-5 py-4 backdrop-blur">
          <h2 id="settings-title" className="font-display text-2xl font-extrabold tracking-tight">
            Settings
          </h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close settings" data-autofocus>
            <IconClose />
          </Button>
        </div>

        <div className="flex flex-col gap-7 px-5 py-6">
          <Group title="Persona" hint="Changes the tone, never the rules.">
            <div className="grid gap-2">
              {PERSONA_IDS.map((id) => {
                const p = PERSONAS[id];
                const checked = settings.persona === id;
                return (
                  <label
                    key={id}
                    className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-[var(--ring)] ${
                      checked ? 'border-accent bg-accent-soft' : 'border-line bg-surface hover:border-line-strong'
                    }`}
                  >
                    <input type="radio" name="settings-persona" className="sr-only" checked={checked} onChange={() => onChange({ persona: id })} />
                    <span className={`h-4 w-4 shrink-0 rounded-full border-2 ${checked ? 'border-accent bg-accent shadow-[inset_0_0_0_3px_var(--surface)]' : 'border-line-strong'}`} aria-hidden="true" />
                    <span>
                      <span className="block font-semibold">{p.name}</span>
                      <span className="block text-sm text-muted">{p.tagline}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </Group>

          <Group title="How often" hint={FREQ_HELP[settings.frequency]} labelId="freq-label">
            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1" role="radiogroup" aria-labelledby="freq-label">
              {(['chill', 'normal', 'max'] as Frequency[]).map((f) => {
                const checked = settings.frequency === f;
                return (
                  <label
                    key={f}
                    className={`flex h-10 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)] ${
                      checked ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <input type="radio" name="frequency" className="sr-only" checked={checked} onChange={() => onChange({ frequency: f })} />
                    {FREQUENCY_LABELS[f]}
                  </label>
                );
              })}
            </div>
          </Group>

          <Group title="Voice" hint={
              voiceSource === 'elevenlabs'
                ? 'Hypeman talks with an ElevenLabs voice. Press ▶ to preview, then Use.'
                : 'Using your browser’s built-in voice. Add ELEVENLABS_API_KEY to the server for a real hype-man voice.'
            }>
            <Switch
              label="Speak comments"
              checked={settings.voiceOn}
              disabled={!voiceSupported()}
              onChange={(v) => onChange({ voiceOn: v })}
            />
            {settings.voiceOn && voiceSource === 'elevenlabs' && (
              <div className="mt-3">
                <VoicePicker selected={settings.elevenVoiceId} persona={settings.persona} onSelect={(id) => onChange({ elevenVoiceId: id })} />
              </div>
            )}
            {settings.voiceOn && voiceSource === 'browser' && (
              <p className="mt-2 text-sm text-muted">ElevenLabs isn’t connected: ELEVENLABS_API_KEY isn’t set on the server (or this deployment predates it).</p>
            )}
            {settings.voiceOn && voiceSource === 'browser' && voiceSupported() && (
              <div className="mt-3 flex flex-col gap-2 min-[400px]:flex-row">
                <label className="flex-1">
                  <span className="sr-only">Voice</span>
                  <select
                    className="h-11 w-full rounded-xl border border-line bg-surface px-3 text-[15px]"
                    value={settings.voiceURI ?? ''}
                    onChange={(e) => onChange({ voiceURI: e.target.value || null })}
                  >
                    <option value="">System default voice</option>
                    {voiceList.map((v) => (
                      <option key={v.voiceURI} value={v.voiceURI}>
                        {v.name} ({v.lang})
                      </option>
                    ))}
                  </select>
                </label>
                <Button onClick={() => void say('Noice! I see what you did there, and I like it.', settings.voiceURI, settings.persona)}>
                  <IconVolume width={18} height={18} /> Test
                </Button>
              </div>
            )}
          </Group>

          <Group title="Notifications" hint="Show comments as system notifications while this tab is in the background.">
            <Switch
              label="Desktop notifications"
              checked={settings.notifications && perm === 'granted'}
              disabled={perm === 'unsupported' || perm === 'denied'}
              onChange={async (v) => {
                if (v && perm === 'default') setPerm(await requestNotificationPermission());
                onChange({ notifications: v });
              }}
            />
            {perm === 'denied' && <p className="mt-2 text-sm text-muted">Notifications are blocked for this site in your browser settings.</p>}
          </Group>

          <Group title="Quiet hours" hint="No automatic comments during these hours. Hype me now still works.">
            <Switch
              label="Enable quiet hours"
              checked={settings.quietHours.enabled}
              onChange={(v) => onChange({ quietHours: { ...settings.quietHours, enabled: v } })}
            />
            {settings.quietHours.enabled && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <TimeField label="From" value={settings.quietHours.start} onChange={(start) => onChange({ quietHours: { ...settings.quietHours, start } })} />
                <TimeField label="Until" value={settings.quietHours.end} onChange={(end) => onChange({ quietHours: { ...settings.quietHours, end } })} />
              </div>
            )}
          </Group>

          <Group title="Appearance" labelId="theme-label">
            <div className="grid grid-cols-3 gap-1 rounded-2xl border border-line bg-surface-2 p-1" role="radiogroup" aria-labelledby="theme-label">
              {(['system', 'light', 'dark'] as ThemePref[]).map((t) => {
                const checked = settings.theme === t;
                return (
                  <label
                    key={t}
                    className={`flex h-10 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold capitalize has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--ring)] ${
                      checked ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink'
                    }`}
                  >
                    <input type="radio" name="theme" className="sr-only" checked={checked} onChange={() => onChange({ theme: t })} />
                    {t}
                  </label>
                );
              })}
            </div>
          </Group>

          <Group title="Your data" hint="Hypeman keeps settings and your 👍/👎 history in this browser only. Screenshots are never stored.">
            <Button
              onClick={() => {
                onClearHistory();
                setCleared(true);
              }}
            >
              <IconTrash width={18} height={18} /> Clear reaction history
            </Button>
            <p className="mt-2 min-h-5 text-sm text-muted" aria-live="polite">
              {cleared ? 'Reaction history cleared.' : ''}
            </p>
            {onSignOut && (
              <Button className="mt-2" onClick={onSignOut}>
                Sign out
              </Button>
            )}
          </Group>
        </div>
      </div>
    </div>
  );
}

function Group({ title, hint, labelId, children }: { title: string; hint?: string; labelId?: string; children: ReactNode }) {
  return (
    <section>
      <h3 id={labelId} className="font-display text-lg font-bold tracking-tight">
        {title}
      </h3>
      {hint && <p className="mb-3 mt-0.5 text-sm text-muted">{hint}</p>}
      {!hint && <div className="mb-3" />}
      {children}
    </section>
  );
}

function Switch({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled?: boolean; onChange(v: boolean): void }) {
  return (
    <label className={`flex items-center justify-between gap-4 rounded-2xl border border-line bg-surface px-4 py-3 ${disabled ? 'opacity-60' : 'cursor-pointer'}`}>
      <span className="font-semibold">{label}</span>
      <span className="relative inline-flex">
        <input
          type="checkbox"
          role="switch"
          className="peer sr-only"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span
          className="h-7 w-12 rounded-full border border-line-strong bg-surface-2 transition-colors peer-checked:border-accent peer-checked:bg-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)]"
          aria-hidden="true"
        />
        <span
          className="absolute left-1 top-1 h-5 w-5 rounded-full bg-[var(--border-strong)] shadow transition-transform peer-checked:translate-x-5 peer-checked:bg-on-accent"
          aria-hidden="true"
        />
      </span>
    </label>
  );
}

function TimeField({ label, value, onChange }: { label: string; value: string; onChange(v: string): void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-sm font-semibold text-muted">{label}</span>
      <input
        type="time"
        value={value}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="h-11 rounded-xl border border-line bg-surface px-3 text-[15px]"
      />
    </label>
  );
}
