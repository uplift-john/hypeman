/** Browser notifications so a comment still reaches you when the tab is in the background. */

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function notify(line: string): void {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const n = new Notification('Hypeman', { body: line, tag: 'hypeman', silent: true, icon: '/favicon.svg' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    // Some platforms only allow notifications from a service worker — ignore.
  }
}
