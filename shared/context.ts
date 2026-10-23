/**
 * "Context" = what Hypeman thinks you're doing. In real mode the model reads the
 * screen itself; in mock mode we derive a context from the shared surface's title
 * (when the browser exposes one) or fall back to a fake one.
 */

export type Category = 'code' | 'email' | 'sheet' | 'slides' | 'doc' | 'design' | 'research' | 'blank';

export interface ScreenContext {
  category: Category;
  /** Short, concrete name of the thing being worked on, e.g. "Q3 Forecast". */
  subject: string;
  /** A concrete detail on screen, e.g. "the revenue column". */
  detail: string;
  /** Where this context came from — shown in mock mode for transparency. */
  source: 'title' | 'fake';
}

const RULES: Array<{ category: Category; re: RegExp }> = [
  { category: 'blank', re: /^(new tab|desktop|blank|about:blank|untitled)$/i },
  { category: 'design', re: /figma|sketch|canva|photoshop|illustrator|framer|affinity|penpot/i },
  { category: 'slides', re: /slides|keynote|powerpoint|\.pptx?\b|\bdeck\b|pitch/i },
  { category: 'sheet', re: /sheets|excel|\.xlsx?\b|\.csv\b|spreadsheet|numbers|airtable/i },
  { category: 'email', re: /inbox|gmail|outlook|\bmail\b|superhuman|fastmail|proton/i },
  { category: 'code', re: /visual studio|vs ?code|intellij|pycharm|webstorm|xcode|cursor|zed|vim|github|gitlab|\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|c|cpp|cs|php|css|html|sql)\b/i },
  { category: 'doc', re: /docs|\bword\b|\.docx?\b|notion|draft|\bpages\b|obsidian|bear|ulysses|scrivener|essay|chapter|proposal|memo/i },
  { category: 'research', re: /wikipedia|mdn|stack ?overflow|documentation|reference|arxiv|medium|substack|guide|tutorial/i },
];

const APP_SUFFIX = /\s+[-–—|]\s+(google (docs|sheets|slides)|microsoft (word|excel|powerpoint)|word|excel|powerpoint|keynote|numbers|pages|figma|notion|visual studio code|vs code|cursor|gmail|outlook|chrome|google chrome|firefox|safari|edge|arc|brave)\b.*$/i;

const DEFAULT_DETAILS: Record<Category, string[]> = {
  code: ['that last function', 'the test you just added', 'the cleanup in this file', 'that tidy refactor'],
  email: ['the inbox count dropping', 'that run of replies', 'the triage pace'],
  sheet: ['that formula work', 'the new column', 'that tidy table'],
  slides: ['this slide', 'the deck flow', 'that layout'],
  doc: ['that paragraph', 'the outline', 'the latest section'],
  design: ['that layout', 'the spacing', 'that component work'],
  research: ['the notes you are pulling together', 'this deep dive', 'that section'],
  blank: [''],
};

export const FAKE_CONTEXTS: Array<Omit<ScreenContext, 'source'>> = [
  { category: 'code', subject: 'auth-service.ts', detail: 'the token refresh function' },
  { category: 'code', subject: 'checkout.tsx', detail: 'the cart total logic' },
  { category: 'code', subject: 'parser.py', detail: 'the new test case' },
  { category: 'email', subject: 'your inbox', detail: 'the unread count dropping to 9' },
  { category: 'email', subject: 'your inbox', detail: 'three replies sent in a row' },
  { category: 'sheet', subject: 'Q3 Forecast', detail: 'the revenue column' },
  { category: 'sheet', subject: 'Hiring Plan 2027', detail: 'the pivot table' },
  { category: 'slides', subject: 'Series A Pitch', detail: 'slide 7' },
  { category: 'slides', subject: 'Quarterly Review', detail: 'the roadmap slide' },
  { category: 'doc', subject: 'Launch Plan', detail: 'the intro paragraph' },
  { category: 'doc', subject: 'Chapter 3', detail: 'that opening line' },
  { category: 'design', subject: 'Onboarding v2', detail: 'the button states' },
  { category: 'design', subject: 'Logo explorations', detail: 'the colour palette' },
  { category: 'research', subject: 'the React docs', detail: 'the hooks section' },
];

export function categorise(title: string): Category | undefined {
  const t = title.trim();
  if (!t) return 'blank';
  return RULES.find((r) => r.re.test(t))?.category;
}

export function subjectFromTitle(title: string): string {
  let s = title.replace(APP_SUFFIX, '').trim();
  s = s.split(/\s[-–—|]\s/)[0].trim(); // "checkout.tsx — repo" → "checkout.tsx"
  s = s.replace(/^\(\d+\)\s*/, ''); // "(3) Inbox" → "Inbox"
  s = s.replace(/^[●•*]\s*/, ''); // unsaved markers
  if (s.length > 48) s = s.slice(0, 45).trimEnd() + '…';
  return s;
}

export function contextFromTitle(title: string | undefined, rng: () => number): ScreenContext | undefined {
  if (title === undefined) return undefined;
  const category = categorise(title);
  if (!category) return undefined;
  const details = DEFAULT_DETAILS[category];
  const detail = details[Math.floor(rng() * details.length) % details.length];
  const subject = category === 'email' ? 'your inbox' : subjectFromTitle(title);
  return { category, subject, detail, source: 'title' };
}

export function fakeContext(rng: () => number): ScreenContext {
  const c = FAKE_CONTEXTS[Math.floor(rng() * FAKE_CONTEXTS.length) % FAKE_CONTEXTS.length];
  return { ...c, source: 'fake' };
}
