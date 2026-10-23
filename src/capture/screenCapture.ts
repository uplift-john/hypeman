import { usefulHint } from '../../shared/sensitive';
import { CaptureError, type CaptureHandle } from '../session/engine';
import { THUMB_H, THUMB_W, toLuma } from './pixelDiff';

export const MAX_FRAME_WIDTH = 1024;
const JPEG_QUALITY = 0.72;

/**
 * Wraps getDisplayMedia. Frames are read from an off-DOM <video> into
 * throwaway canvases; nothing is ever written to disk or kept between calls.
 */
export async function startScreenCapture(): Promise<CaptureHandle> {
  const md = navigator.mediaDevices;
  if (!md || typeof md.getDisplayMedia !== 'function') {
    throw new CaptureError('unsupported', 'Screen sharing is not supported in this browser.');
  }
  let stream: MediaStream;
  try {
    stream = await md.getDisplayMedia({
      video: { frameRate: { ideal: 2, max: 5 } },
      audio: false,
      // Hints only; browsers ignore what they don't support.
      selfBrowserSurface: 'exclude',
      surfaceSwitching: 'include',
    } as DisplayMediaStreamOptions);
  } catch (err) {
    const name = err instanceof DOMException ? err.name : '';
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      // Chrome reports "user clicked Cancel" as NotAllowedError too; the message differs by browser.
      const cancelled = /cancel|dismiss|aborted/i.test(String((err as Error).message));
      throw new CaptureError(cancelled ? 'cancelled' : 'denied', 'Screen sharing permission was denied.');
    }
    if (name === 'AbortError') throw new CaptureError('cancelled', 'Screen sharing was cancelled.');
    if (name === 'NotSupportedError' || name === 'TypeError') throw new CaptureError('unsupported', 'Screen sharing is not supported here.');
    throw new CaptureError('failed', 'Could not start screen sharing.');
  }

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new CaptureError('failed', 'No video track was shared.');
  }

  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.srcObject = stream;
  try {
    await video.play();
  } catch {
    // Autoplay of a muted MediaStream should always work; if not we'll fail on grab.
  }

  const thumb = document.createElement('canvas');
  thumb.width = THUMB_W;
  thumb.height = THUMB_H;
  const thumbCtx = thumb.getContext('2d', { willReadFrequently: true });

  let stopped = false;
  const endedCallbacks: Array<() => void> = [];
  const fireEnded = () => {
    if (stopped) return;
    stopped = true;
    endedCallbacks.forEach((cb) => cb());
  };
  track.addEventListener('ended', fireEnded);

  const ready = () => video.readyState >= 2 && video.videoWidth > 0;

  return {
    hint: usefulHint(track.label),
    sampleThumb() {
      if (stopped || !thumbCtx || !ready()) return null;
      thumbCtx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
      return toLuma(thumbCtx.getImageData(0, 0, THUMB_W, THUMB_H).data);
    },
    async grabFrame() {
      if (stopped) return null;
      if (!ready()) await new Promise((r) => setTimeout(r, 300));
      if (!ready()) return null;
      const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const url = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
      // Drop the backing store right away.
      canvas.width = 0;
      canvas.height = 0;
      return url;
    },
    onEnded(cb) {
      endedCallbacks.push(cb);
    },
    stop() {
      stopped = true;
      track.removeEventListener('ended', fireEnded);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
    },
  };
}
