import { TranscriptBuffer } from './transcript';

/**
 * Listen mode: hears the room through the browser's own speech recognition (audio never
 * reaches Hypeman's server — only short text snippets, and only when he's deciding whether
 * to react). Fires `onMoment` at natural pauses in the conversation.
 */

export type ListenStatus = 'off' | 'starting' | 'listening' | 'paused' | 'denied' | 'unsupported' | 'error';

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function listenSupported(): boolean {
  return typeof window !== 'undefined' && recognitionCtor() !== null;
}

export interface Listener {
  start(): void;
  stop(): void;
  pause(): void;
  resume(): void;
  /** True while Hypeman is talking: stop hearing so he never reacts to himself. */
  setSpeaking(on: boolean): void;
  transcript(): string;
  latest(): string;
  status(): ListenStatus;
  subscribe(fn: () => void): () => void;
}

export function createListener(opts: { onMoment(): void; now?: () => number; lang?: string }): Listener {
  const now = opts.now ?? (() => performance.now());
  const buffer = new TranscriptBuffer();
  const listeners = new Set<() => void>();
  let status: ListenStatus = listenSupported() ? 'off' : 'unsupported';
  let rec: Recognition | null = null;
  let wanted = false; // should we be listening right now?
  let speaking = false;
  let resumeTimer: ReturnType<typeof setTimeout> | null = null;
  let tick: ReturnType<typeof setInterval> | null = null;
  let errors = 0;

  const set = (s: ListenStatus) => {
    status = s;
    listeners.forEach((l) => l());
  };
  const changed = () => listeners.forEach((l) => l());

  function begin() {
    const Ctor = recognitionCtor();
    if (!Ctor) return set('unsupported');
    if (rec || !wanted || speaking) return;
    const r = new Ctor();
    r.continuous = true;
    r.interimResults = true;
    r.lang = opts.lang ?? 'en-US';
    r.onstart = () => {
      errors = 0;
      set('listening');
    };
    r.onresult = (e) => {
      if (speaking) return;
      const t = now();
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) buffer.addFinal(res[0].transcript, t);
        else interim += res[0].transcript;
      }
      buffer.setInterim(interim, t);
      changed();
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
        wanted = false;
        set('denied');
      } else if (e.error !== 'no-speech' && e.error !== 'aborted') {
        errors++;
        if (errors > 5) {
          wanted = false;
          set('error');
        }
      }
    };
    r.onend = () => {
      rec = null;
      // Chrome ends recognition after silences or ~a minute; keep going while wanted.
      if (wanted && !speaking) setTimeout(begin, errors ? Math.min(500 * 2 ** errors, 8_000) : 250);
    };
    rec = r;
    if (status !== 'listening') set('starting');
    try {
      r.start();
    } catch {
      rec = null;
    }
  }

  function halt() {
    if (rec) {
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        // ignore
      }
      rec = null;
    }
  }

  const ensureTick = () => {
    tick ??= setInterval(() => {
      if (wanted && !speaking && buffer.takeMoment(now())) opts.onMoment();
    }, 400);
  };

  return {
    start() {
      if (!listenSupported()) return set('unsupported');
      wanted = true;
      buffer.clear();
      begin();
      ensureTick();
    },
    stop() {
      wanted = false;
      halt();
      buffer.clear();
      if (tick) clearInterval(tick);
      tick = null;
      if (status !== 'unsupported' && status !== 'denied') set('off');
    },
    pause() {
      wanted = false;
      halt();
      buffer.clear();
      if (status === 'listening' || status === 'starting') set('paused');
    },
    resume() {
      if (status === 'denied' || status === 'unsupported') return;
      wanted = true;
      begin();
      ensureTick();
    },
    setSpeaking(on) {
      if (on === speaking) return;
      speaking = on;
      if (resumeTimer) clearTimeout(resumeTimer);
      if (on) {
        // Stop hearing while he talks, and forget the last bit so his own words never count.
        halt();
        buffer.clear();
      } else {
        resumeTimer = setTimeout(() => {
          if (wanted) begin();
        }, 600);
      }
    },
    transcript: () => buffer.text(now()),
    latest: () => buffer.latest(),
    status: () => status,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
