import { isPersonaId, type PersonaId } from '../../shared/personas';
import type { Frequency, QuietHours } from '../../shared/scheduler';

/**
 * localStorage holds settings and reaction history only — never frames or screen text.
 * Every access is wrapped: private windows and blocked storage must not break the app.
 */

export type ThemePref = 'system' | 'light' | 'dark';

export interface Settings {
  persona: PersonaId;
  frequency: Frequency;
  voiceOn: boolean;
  voiceURI: string | null;
  notifications: boolean;
  quietHours: QuietHours;
  theme: ThemePref;
}

export const DEFAULT_SETTINGS: Settings = {
  persona: 'hype',
  frequency: 'normal',
  voiceOn: true,
  voiceURI: null,
  notifications: true,
  quietHours: { enabled: false, start: '22:00', end: '08:00' },
  theme: 'system',
};

// v2: voice is on by default now (he's meant to be heard).
const SETTINGS_KEY = 'hypeman.settings.v2';
const HISTORY_KEY = 'hypeman.history.v1';
const HISTORY_MAX = 100;
const DELIVERIES_KEY = 'hypeman.deliveries.v1';

function read(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // storage full/blocked — settings just won't persist
  }
}

const HHMM = /^\d{2}:\d{2}$/;

export function loadSettings(): Settings {
  const v = read(SETTINGS_KEY);
  if (!v || typeof v !== 'object') return DEFAULT_SETTINGS;
  const o = v as Partial<Settings>;
  const q = (o.quietHours ?? {}) as Partial<QuietHours>;
  return {
    persona: isPersonaId(o.persona) ? o.persona : DEFAULT_SETTINGS.persona,
    frequency: o.frequency === 'chill' || o.frequency === 'normal' || o.frequency === 'max' ? o.frequency : DEFAULT_SETTINGS.frequency,
    voiceOn: typeof o.voiceOn === 'boolean' ? o.voiceOn : DEFAULT_SETTINGS.voiceOn,
    voiceURI: typeof o.voiceURI === 'string' ? o.voiceURI : null,
    notifications: typeof o.notifications === 'boolean' ? o.notifications : DEFAULT_SETTINGS.notifications,
    quietHours: {
      enabled: typeof q.enabled === 'boolean' ? q.enabled : false,
      start: typeof q.start === 'string' && HHMM.test(q.start) ? q.start : DEFAULT_SETTINGS.quietHours.start,
      end: typeof q.end === 'string' && HHMM.test(q.end) ? q.end : DEFAULT_SETTINGS.quietHours.end,
    },
    theme: o.theme === 'light' || o.theme === 'dark' || o.theme === 'system' ? o.theme : 'system',
  };
}

export function saveSettings(s: Settings): void {
  write(SETTINGS_KEY, s);
}

/** One entry per delivered comment; `reaction` is updated when the user reacts. */
export interface HistoryEntry {
  id: string;
  /** Wall-clock ms when delivered. */
  at: number;
  line: string;
  persona: PersonaId;
  reaction: 'up' | 'down' | null;
}

export function loadHistory(): HistoryEntry[] {
  const v = read(HISTORY_KEY);
  if (!Array.isArray(v)) return [];
  return v.filter(
    (e): e is HistoryEntry =>
      !!e && typeof e === 'object' && typeof e.id === 'string' && typeof e.at === 'number' && typeof e.line === 'string',
  );
}

export function upsertHistory(entry: HistoryEntry): void {
  const all = loadHistory().filter((e) => e.id !== entry.id);
  all.push(entry);
  write(HISTORY_KEY, all.slice(-HISTORY_MAX));
}

/**
 * Wall-clock times of comments delivered in the last 10 minutes. Kept separately from the
 * reaction history (which the user can clear) so a reload or "clear history" can't reset
 * the rate limiter.
 */
export function recordDelivery(nowWall: number, withinMs = 600_000): void {
  const v = read(DELIVERIES_KEY);
  const list = Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Math.abs(nowWall - x) < withinMs) : [];
  list.push(nowWall);
  write(DELIVERIES_KEY, list.slice(-10));
}

/** Ages of recently delivered comments — seeds the rate limiter. Slightly negative ages (clock moved back) count as "just now". */
export function recentDeliveryAges(nowWall: number, withinMs = 600_000): number[] {
  const v = read(DELIVERIES_KEY);
  if (!Array.isArray(v)) return [];
  // Entries more than 10 min in the future come from a clock that was wrong and has since been
  // corrected; they can't be trusted, so they're dropped rather than treated as "just now" forever.
  return v
    .filter((x): x is number => typeof x === 'number')
    .map((at) => nowWall - at)
    .filter((age) => age < withinMs && age > -withinMs);
}
