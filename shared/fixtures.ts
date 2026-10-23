import type { Category } from './context';

/**
 * Fake screens used by tests, the e2e fake display, and the copy-review sampler.
 * `title` is what the browser would expose as the shared surface's label.
 */
export interface ScreenFixture {
  id: string;
  title: string;
  category: Category | 'sensitive';
  sensitive: boolean;
  /** Rendered into a canvas by the e2e fake display. */
  visual: { bg: string; fg: string; accent: string; heading: string; lines: string[] };
}

export const SCREEN_FIXTURES: ScreenFixture[] = [
  {
    id: 'chat',
    title: 'WhatsApp',
    category: 'chat',
    sensitive: false,
    visual: { bg: '#efeae2', fg: '#111b21', accent: '#25d366', heading: 'Weekend crew', lines: ['who is bringing the cake?', 'me!! chocolate obviously', 'see you all at 7'] },
  },
  {
    id: 'call',
    title: 'Zoom Meeting',
    category: 'call',
    sensitive: false,
    visual: { bg: '#1a1a1a', fg: '#ffffff', accent: '#2d8cff', heading: 'Friday catch-up', lines: ['[ 6 people · everyone smiling ]', 'Gallery view'] },
  },
  {
    id: 'social',
    title: 'Instagram',
    category: 'social',
    sensitive: false,
    visual: { bg: '#ffffff', fg: '#262626', accent: '#e1306c', heading: 'Feed', lines: ['Just finished my first half-marathon!', '♥ 214   You: congrats, so proud of you!'] },
  },
  {
    id: 'photos',
    title: 'Lisbon Trip – Photos',
    category: 'photos',
    sensitive: false,
    visual: { bg: '#fafafa', fg: '#202124', accent: '#fbbc04', heading: 'Lisbon Trip', lines: ['142 photos · June', '[ sunset over the river ]'] },
  },
  {
    id: 'watch',
    title: 'Perfect Sourdough at Home - YouTube',
    category: 'watch',
    sensitive: false,
    visual: { bg: '#0f0f0f', fg: '#f1f1f1', accent: '#ff0000', heading: 'Perfect Sourdough at Home', lines: ['Step 3: the stretch and fold'] },
  },
  {
    id: 'code',
    title: 'checkout.tsx — hypeshop — Visual Studio Code',
    category: 'code',
    sensitive: false,
    visual: { bg: '#1e1e1e', fg: '#d4d4d4', accent: '#569cd6', heading: 'checkout.tsx', lines: ['export function cartTotal(items: Item[]) {', '  return items.reduce((sum, i) => sum + i.price * i.qty, 0);', '}', '', 'test("applies discount", () => { … })'] },
  },
  {
    id: 'email',
    title: 'Inbox (9) - Gmail',
    category: 'email',
    sensitive: false,
    visual: { bg: '#ffffff', fg: '#202124', accent: '#d93025', heading: 'Inbox — 9 unread', lines: ['Design review notes', 'Re: launch timeline', 'Weekly digest', 'Invoice approved'] },
  },
  {
    id: 'sheet',
    title: 'Q3 Forecast - Google Sheets',
    category: 'sheet',
    sensitive: false,
    visual: { bg: '#ffffff', fg: '#202124', accent: '#188038', heading: 'Q3 Forecast', lines: ['Region | Jul | Aug | Sep | Total', 'North | 120 | 135 | 150 | =SUM(B2:D2)', 'South | 98 | 101 | 117 | =SUM(B3:D3)'] },
  },
  {
    id: 'slides',
    title: 'Series A Pitch - Google Slides',
    category: 'slides',
    sensitive: false,
    visual: { bg: '#f8f9fa', fg: '#202124', accent: '#f4b400', heading: 'Slide 7 — Why now', lines: ['Teams waste 9 hours a week on status updates', 'We turn that into 9 minutes'] },
  },
  {
    id: 'doc',
    title: 'Launch Plan - Google Docs',
    category: 'doc',
    sensitive: false,
    visual: { bg: '#ffffff', fg: '#202124', accent: '#4285f4', heading: 'Launch Plan', lines: ['1. Goals', 'Ship the beta to 200 design partners by November.', '2. Risks'] },
  },
  {
    id: 'design',
    title: 'Onboarding v2 – Figma',
    category: 'design',
    sensitive: false,
    visual: { bg: '#2c2c2c', fg: '#ffffff', accent: '#a259ff', heading: 'Onboarding v2', lines: ['Frame: Welcome / Step 1', 'Button / Primary / Hover', 'Auto layout · 16 gap'] },
  },
  {
    id: 'research',
    title: 'useEffect – React documentation',
    category: 'research',
    sensitive: false,
    visual: { bg: '#ffffff', fg: '#23272f', accent: '#087ea4', heading: 'useEffect', lines: ['useEffect is a React Hook that lets you synchronize a component with an external system.'] },
  },
  {
    id: 'blank',
    title: 'New Tab',
    category: 'blank',
    sensitive: false,
    visual: { bg: '#ffffff', fg: '#ffffff', accent: '#ffffff', heading: '', lines: [] },
  },
  {
    id: 'bank',
    title: 'Chase — Account Statement',
    category: 'sensitive',
    sensitive: true,
    visual: { bg: '#ffffff', fg: '#111111', accent: '#117aca', heading: 'Checking ••••4821 — Statement', lines: ['Available balance  $4,182.33', '10/02  Payroll deposit   +$2,950.00', '10/04  Rent            -$1,800.00'] },
  },
  {
    id: 'passwords',
    title: '1Password – Vault',
    category: 'sensitive',
    sensitive: true,
    visual: { bg: '#0b1c3a', fg: '#ffffff', accent: '#3a86ff', heading: 'Personal vault', lines: ['github.com  •  ••••••••••', 'bank login  •  ••••••••••'] },
  },
  {
    id: 'dating',
    title: 'Hinge',
    category: 'sensitive',
    sensitive: true,
    visual: { bg: '#ffffff', fg: '#111111', accent: '#000000', heading: 'Alex, 29', lines: ['Lives in Brooklyn · 3 miles away'] },
  },
  {
    id: 'medical',
    title: 'MyChart - Test Results',
    category: 'sensitive',
    sensitive: true,
    visual: { bg: '#ffffff', fg: '#222222', accent: '#0074d9', heading: 'Lab results', lines: ['Hemoglobin A1c  5.4%', 'Cholesterol  182 mg/dL'] },
  },
];

export function fixture(id: string): ScreenFixture {
  const f = SCREEN_FIXTURES.find((s) => s.id === id);
  if (!f) throw new Error(`unknown fixture ${id}`);
  return f;
}
