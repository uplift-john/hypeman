import { useCallback, useEffect, useMemo, useState } from 'react';
import { PERSONAS } from '../shared/personas';
import type { Mode } from '../shared/types';
import { SessionView, type ManualFeedback } from './components/SessionView';
import { SettingsDrawer } from './components/SettingsDrawer';
import { StartScreen } from './components/StartScreen';
import { ToastRegion } from './components/Toast';
import { api } from './lib/api';
import { notify, requestNotificationPermission } from './lib/notify';
import { loadHistory, loadSettings, recordDelivery, saveSettings, upsertHistory, type Settings } from './lib/storage';
import { say, setVoiceBackend, stopSpeaking } from './lib/voice';
import { GREETINGS } from '../shared/personas';
import type { EndReason, FeedItem, ManualResult } from './session/engine';
import { useSession } from './session/useSession';
import { HOSTED, hostedDeps, watchHostedMode } from './hosted/hosted';

const START_FAILURES: EndReason[] = ['denied', 'cancelled', 'unsupported', 'failed'];

function useResolvedTheme(pref: Settings['theme']): 'light' | 'dark' {
  const [systemDark, setSystemDark] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false);
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const on = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
}

function feedbackFor(r: ManualResult): string | null {
  switch (r.kind) {
    case 'silent':
      if (r.reason === 'sensitive') return 'This screen looks private, so Hypeman is staying quiet.';
      if (r.reason === 'no-frame') return 'Add a screenshot first: paste it, drop it, or choose a file.';
      if (r.reason === 'nothing-notable') return 'Nothing to hype on this screen yet. Try another screenshot or try again later.';
      return 'Couldn’t find something new to say right now. Try again in a bit.';
    case 'error':
      return 'That didn’t work. Hypeman will try again in a few minutes.';
    case 'unavailable':
      return 'The session isn’t running right now.';
    default:
      return null;
  }
}

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [mode, setMode] = useState<Mode | null>(null);
  const [serverDown, setServerDown] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toastId, setToastId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<ManualFeedback | null>(null);

  const theme = useResolvedTheme(settings.theme);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (HOSTED) return watchHostedMode(setMode);
    let cancelled = false;
    api
      .health()
      .then((h) => {
        if (cancelled) return;
        setMode(h.mode);
        setServerDown(false);
        setVoiceBackend(h.voice === 'elevenlabs' ? 'elevenlabs' : 'browser');
      })
      .catch(() => !cancelled && setServerDown(true));
    return () => {
      cancelled = true;
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const engineSettings = useMemo(
    () => ({ persona: settings.persona, frequency: settings.frequency, quietHours: settings.quietHours, sendFrame: mode === 'real' || HOSTED }),
    [settings.persona, settings.frequency, settings.quietHours, mode],
  );
  const { engine, state, now, wallNow } = useSession(engineSettings, hostedDeps);

  // Deliver each comment: toast, history, optional voice, notification when backgrounded.
  useEffect(
    () =>
      engine.onComment((item: FeedItem) => {
        setToastId(item.id);
        recordDelivery(item.at);
        upsertHistory({ id: item.id, at: item.at, line: item.line, persona: settings.persona, reaction: null });
        if (settings.voiceOn) void say(item.line, settings.voiceURI, settings.persona);
        if (settings.notifications && document.visibilityState === 'hidden') notify(item.line);
      }),
    [engine, settings.persona, settings.voiceOn, settings.voiceURI, settings.notifications],
  );

  useEffect(() => {
    if (!feedback) return;
    const t = window.setTimeout(() => setFeedback(null), 8_000);
    return () => window.clearTimeout(t);
  }, [feedback]);

  const toastItem = toastId ? (state.feed.find((f) => f.id === toastId) ?? null) : null;
  const dismissToast = useCallback(() => setToastId(null), []);

  const onReact = useCallback(
    (id: string, r: 'up' | 'down') => {
      const updated = engine.react(id, r);
      if (updated) {
        const prev = loadHistory().find((h) => h.id === id);
        upsertHistory({ id, at: updated.at, line: updated.line, persona: prev?.persona ?? settings.persona, reaction: updated.reaction });
      }
    },
    [engine, settings.persona],
  );

  const start = useCallback(async () => {
    setFeedback(null);
    // Ask for notification permission on this click (a user gesture), only once.
    if (settings.notifications) void requestNotificationPermission();
    if (state.phase === 'ended') engine.reset();
    // Say hi on the Start click itself: proves the sound works and unlocks speech for later.
    if (settings.voiceOn) void say(GREETINGS[settings.persona], settings.voiceURI, settings.persona);
    await engine.start();
  }, [engine, settings.notifications, settings.voiceOn, settings.voiceURI, settings.persona, state.phase]);

  const stop = useCallback(() => {
    stopSpeaking();
    setToastId(null);
    engine.stop();
  }, [engine]);

  const hypeNow = useCallback(async () => {
    setFeedback(null);
    const r = await engine.hypeNow();
    const text = feedbackFor(r);
    if (text) setFeedback({ text, at: performance.now() });
  }, [engine]);

  const closeDrawer = useCallback(() => setDrawerOpen(false), []);

  const showStart =
    state.phase === 'off' || state.phase === 'starting' || (state.phase === 'ended' && state.endReason !== null && START_FAILURES.includes(state.endReason));

  const quiet = settings.quietHours;
  return (
    <>
      <div inert={drawerOpen}>
        {showStart ? (
          <StartScreen
            hosted={HOSTED}
            mode={mode}
            serverDown={serverDown}
            starting={state.phase === 'starting'}
            error={state.phase === 'ended' ? state.endReason : null}
            persona={settings.persona}
            onPersona={(persona) => update({ persona })}
            onStart={start}
            onOpenSettings={() => setDrawerOpen(true)}
          />
        ) : (
          <SessionView
            hosted={HOSTED}
            state={state}
            mode={mode}
            now={now}
            wallNow={wallNow}
            feedback={feedback}
            quietEnd={quiet.end}
            onHypeNow={hypeNow}
            onPause={() => engine.pause()}
            onResume={() => engine.resume()}
            onSnooze={(m) => engine.snooze(m)}
            onWake={() => engine.endSnooze()}
            onStop={stop}
            onRestart={start}
            onHome={() => engine.reset()}
            onReact={onReact}
            onOpenSettings={() => setDrawerOpen(true)}
            voiceOn={settings.voiceOn}
            onToggleVoice={() => {
              if (settings.voiceOn) stopSpeaking();
              else void say('Sound on!', settings.voiceURI, settings.persona);
              update({ voiceOn: !settings.voiceOn });
            }}
            onDismissNotice={() => engine.dismissNotice()}
          />
        )}
      </div>
      <ToastRegion item={toastItem} personaName={PERSONAS[settings.persona].name} onDismiss={dismissToast} onReact={onReact} />
      <SettingsDrawer
        open={drawerOpen}
        settings={settings}
        onChange={update}
        onClose={closeDrawer}
        onClearHistory={() => {
          try {
            localStorage.removeItem('hypeman.history.v1');
          } catch {
            // ignore
          }
        }}
      />
    </>
  );
}
