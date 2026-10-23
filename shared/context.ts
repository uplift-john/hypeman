/**
 * "Context" = what Hypeman thinks is going on. In real mode the model reads the
 * screen itself; in mock mode we derive a context from the shared surface's title
 * (when the browser exposes one) or fall back to a sample one.
 *
 * Hypeman is social-first: chats, calls, feeds, photos, things you're watching or
 * playing. Work is just one more thing it can cheer on.
 */

export type SocialCategory = 'chat' | 'call' | 'social' | 'photos' | 'watch' | 'music' | 'game';
export type WorkCategory = 'code' | 'email' | 'sheet' | 'slides' | 'doc' | 'design' | 'research';
export type Category = SocialCategory | WorkCategory | 'blank';

export interface ScreenContext {
  category: Category;
  /** Short, concrete name of what's going on, e.g. "the group chat", "Q3 Forecast". */
  subject: string;
  /** A concrete detail, e.g. "the birthday plans coming together". */
  detail: string;
  /** Where this context came from — shown in mock mode for transparency. */
  source: 'title' | 'fake';
}

// Order matters: the first match wins.
const RULES: Array<{ category: Category; re: RegExp }> = [
  { category: 'blank', re: /^(new tab|desktop|blank|about:blank|untitled)$/i },
  { category: 'call', re: /\bzoom\b|google meet|\bmeet\b|facetime|webex|\bhuddle\b|video call|\bcall\b|teams meeting/i },
  { category: 'chat', re: /whatsapp|telegram|signal|messenger|imessage|^messages\b|discord|slack|groupme|wechat|group chat|\bchat\b|\bdms?\b/i },
  { category: 'social', re: /instagram|twitter|\bx\.com\b|threads|reddit|facebook|tiktok|linkedin|bluesky|mastodon|tumblr|pinterest|\bfeed\b|snapchat/i },
  { category: 'photos', re: /photos|\balbum\b|camera roll|lightroom|flickr|\.(jpe?g|png|heic)\b/i },
  { category: 'watch', re: /youtube|netflix|twitch|prime video|disney\+|hulu|vimeo|\bwatch\b/i },
  { category: 'music', re: /spotify|apple music|soundcloud|bandcamp|playlist|tidal|deezer/i },
  { category: 'game', re: /steam|xbox|playstation|epic games|minecraft|chess\.com|lichess|wordle|crossword|\bgame\b/i },
  { category: 'design', re: /figma|sketch|canva|photoshop|illustrator|framer|affinity|penpot/i },
  { category: 'slides', re: /slides|keynote|powerpoint|\.pptx?\b|\bdeck\b|pitch/i },
  { category: 'sheet', re: /sheets|excel|\.xlsx?\b|\.csv\b|spreadsheet|numbers|airtable/i },
  { category: 'email', re: /inbox|gmail|outlook|\bmail\b|superhuman|fastmail|proton/i },
  { category: 'code', re: /visual studio|vs ?code|intellij|pycharm|webstorm|xcode|cursor|zed|vim|github|gitlab|\.(ts|tsx|js|jsx|py|rb|go|rs|java|kt|swift|cpp|cs|php|css|html|sql)\b/i },
  { category: 'doc', re: /docs|\bword\b|\.docx?\b|notion|draft|\bpages\b|obsidian|bear|ulysses|scrivener|essay|chapter|proposal|memo/i },
  { category: 'research', re: /wikipedia|mdn|stack ?overflow|documentation|reference|arxiv|medium|substack|guide|tutorial/i },
];

const APP_SUFFIX = /\s+[-–—|•]\s+(google (docs|sheets|slides)|microsoft (word|excel|powerpoint)|word|excel|powerpoint|keynote|numbers|pages|figma|notion|visual studio code|vs code|cursor|gmail|outlook|chrome|google chrome|firefox|safari|edge|arc|brave|youtube|spotify|netflix|twitch|steam)\b.*$/i;

/**
 * Social surfaces never use the window title as the subject: chat and profile titles
 * carry other people's names. They get a role-based subject instead.
 */
const ROLE_SUBJECT: Partial<Record<Category, string>> = {
  chat: 'the chat',
  call: 'this call',
  social: 'your feed',
  email: 'your inbox',
};

const DEFAULT_DETAILS: Record<Category, string[]> = {
  chat: ['the back-and-forth', 'the plans coming together', 'that quick reply', 'the good vibes in there'],
  call: ['the energy on this call', 'everyone chiming in', 'the way you are listening'],
  social: ['that kind comment you left', 'the thread you are part of', 'what you are sharing'],
  photos: ['that shot', 'the memories in there', 'that framing'],
  watch: ['what you are watching', 'this pick', 'the good stuff on screen'],
  music: ['this track', 'the playlist vibe', 'that pick'],
  game: ['that last round', 'your strategy', 'that move'],
  code: ['that last function', 'the test you just added', 'the cleanup in this file', 'that refactor'],
  email: ['the inbox count dropping'],
  sheet: ['that formula work', 'the new column', 'that tidy table'],
  slides: ['this slide', 'the story flow', 'that layout'],
  doc: ['that paragraph', 'the outline', 'the latest section'],
  design: ['that layout', 'the spacing', 'the component states'],
  research: ['the notes you are pulling together', 'the part you are reading', 'that section'],
  blank: [''],
};

/** Sample contexts for mock mode when the browser exposes no title. Social-heavy on purpose. */
export const FAKE_CONTEXTS: Array<Omit<ScreenContext, 'source'>> = [
  { category: 'chat', subject: 'the group chat', detail: 'the birthday plans coming together' },
  { category: 'chat', subject: 'the family chat', detail: 'that run of weekend photos' },
  { category: 'chat', subject: 'the friends chat', detail: 'the dinner plans finally landing' },
  { category: 'call', subject: 'your video call', detail: 'everyone laughing at once' },
  { category: 'call', subject: 'the catch-up call', detail: 'all the smiles on the grid' },
  { category: 'social', subject: 'your feed', detail: 'the congratulations you just left' },
  { category: 'social', subject: 'that thread', detail: 'your thoughtful reply' },
  { category: 'social', subject: 'the photo you just posted', detail: 'the comments rolling in' },
  { category: 'photos', subject: 'the trip album', detail: 'that sunset shot' },
  { category: 'photos', subject: 'your camera roll', detail: 'the group photo' },
  { category: 'watch', subject: 'the cooking video', detail: 'the recipe you are following' },
  { category: 'watch', subject: 'that nature documentary', detail: 'the deep-sea footage' },
  { category: 'music', subject: 'your playlist', detail: 'that track choice' },
  { category: 'game', subject: 'your game', detail: 'that comeback round' },
  { category: 'sheet', subject: 'Q3 Forecast', detail: 'the revenue column' },
  { category: 'slides', subject: 'Series A Pitch', detail: 'slide 7' },
  { category: 'doc', subject: 'Launch Plan', detail: 'the intro paragraph' },
  { category: 'code', subject: 'checkout.tsx', detail: 'the cart total logic' },
];

export function categorise(title: string): Category | undefined {
  const t = title.trim();
  if (!t) return 'blank';
  return RULES.find((r) => r.re.test(t))?.category;
}

export function subjectFromTitle(title: string): string {
  let s = title.replace(APP_SUFFIX, '').trim();
  s = s.split(/\s[-–—|•]\s/)[0].trim(); // "checkout.tsx — repo" → "checkout.tsx"
  s = s.replace(/^\(\d+\)\s*/, ''); // "(3) Inbox" → "Inbox"
  s = s.replace(/^[●•*]\s*/, ''); // unsaved markers
  if (s.length > 48) s = s.slice(0, 45).trimEnd() + '…';
  return s;
}

export function contextFromTitle(title: string | undefined, rng: () => number): ScreenContext | undefined {
  if (title === undefined) return undefined;
  const category = categorise(title);
  if (!category) return undefined;
  let detail = pick(DEFAULT_DETAILS[category], rng);
  if (category === 'email') {
    // Only the count is ever used from a mail title — never senders, subjects or addresses.
    const m = /\((\d+)\)|(\d+)\s+unread/i.exec(title);
    detail = m ? `${m[1] ?? m[2]} unread` : detail;
  }
  const subject = ROLE_SUBJECT[category] ?? subjectFromTitle(title);
  return { category, subject, detail, source: 'title' };
}

export function fakeContext(rng: () => number): ScreenContext {
  return { ...pick(FAKE_CONTEXTS, rng), source: 'fake' };
}

function pick<T>(arr: T[], rng: () => number): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}
