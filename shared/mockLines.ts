import type { Category, ScreenContext } from './context';
import type { PersonaId } from './personas';

/**
 * Canned lines for mock mode. Every template references the context's
 * {subject} and/or {detail} so mock output is never generic.
 * {Subject}/{Detail} = same value with a sentence-start capital where natural.
 */
export interface MockLine {
  category: Exclude<Category, 'blank'>;
  persona: PersonaId;
  text: string;
}

const L = (category: MockLine['category'], persona: PersonaId, text: string): MockLine => ({ category, persona, text });

export const MOCK_LINES: MockLine[] = [
  // code
  L('code', 'hype', '{Subject} is getting seriously clean. {Detail} reads like you knew exactly where you were going.'),
  L('code', 'hype', 'Look at you in {subject}. {Detail} is the kind of code future-you sends a thank-you note for.'),
  L('code', 'hype', 'Sharp move in {subject}. {Detail} just got simpler and stronger at the same time.'),
  L('code', 'hype', "{Detail} in {subject}? Crisp. You're writing code people will actually enjoy reviewing."),
  L('code', 'coach', 'Steady work in {subject}. {Detail} is clearer than it was ten minutes ago, and that compounds.'),
  L('code', 'coach', 'Nice discipline on {detail}. Small, careful changes like this are how {subject} stays healthy.'),
  L('code', 'coach', "You're making real progress in {subject}. {Detail} looks deliberate, not rushed. Keep that pace."),
  L('code', 'bestie', "Okay, {subject} is looking good. {Detail} is so neat I'd high-five it."),
  L('code', 'bestie', 'Peeked at {subject} and wow. {Detail} is really well done, you clever thing.'),
  L('code', 'bestie', '{Detail} in {subject} is so tidy I want to frame it. Carry on, genius.'),
  // email
  L('email', 'hype', "Love {detail}. You're clearing {subject} like it owes you money."),
  L('email', 'hype', "{Detail}! You're running {subject} instead of it running you."),
  L('email', 'hype', 'Inbox-clearing pace is elite right now. {Detail} is a genuinely satisfying thing to watch.'),
  L('email', 'hype', '{Detail} and still going. That is how a champion handles {subject}.'),
  L('email', 'coach', 'Good rhythm on {subject}. {Detail} means fewer loose ends for tomorrow.'),
  L('email', 'coach', "One reply at a time and look: {detail}. That's how a clear head gets built."),
  L('email', 'coach', "Calm, methodical triage. {Detail} is real progress, even if it doesn't feel dramatic."),
  L('email', 'bestie', '{Detail}? Who are you, the inbox whisperer?'),
  L('email', 'bestie', 'Watching {subject} shrink is weirdly soothing. {Detail}, very cool of you.'),
  L('email', 'bestie', 'Your inbox would thank you if it could. {Detail} is very satisfying to witness.'),
  // spreadsheet
  L('sheet', 'hype', '{Subject} is coming together beautifully. {Detail} looks like the work of someone who really gets the numbers.'),
  L('sheet', 'hype', 'Big spreadsheet energy. {Detail} in {subject} is turning raw data into a real story.'),
  L('sheet', 'hype', "{Subject} looks rock solid. The way you structured {detail} is going to save everyone time."),
  L('sheet', 'hype', 'Spreadsheets this clean win meetings. {Detail} in {subject} is doing a lot of heavy lifting.'),
  L('sheet', 'coach', 'Careful work on {subject}. {Detail} is clear enough that anyone could follow your logic.'),
  L('sheet', 'coach', "You're building {subject} the right way: {detail} first, then the rest falls into place."),
  L('sheet', 'coach', 'Good, patient modelling in {subject}. Getting {detail} right is the part most people rush.'),
  L('sheet', 'bestie', '{Subject} is giving organised genius, and {detail} is honestly beautiful.'),
  L('sheet', 'bestie', 'I love a person who respects a spreadsheet. {Detail} in {subject} is so neat.'),
  L('sheet', 'bestie', 'Plot twist: {subject} is fun now. {Detail} looks fantastic.'),
  // slides
  L('slides', 'hype', '{Subject} is shaping up to be a deck people remember. {Detail} lands with real punch.'),
  L('slides', 'hype', "{Detail} in {subject} is strong. You're building the kind of story that gets a yes."),
  L('slides', 'hype', 'That is a confident deck. {Detail} makes {subject} feel focused and inevitable.'),
  L('slides', 'coach', '{Subject} is getting clearer slide by slide. {Detail} says one thing and says it well.'),
  L('slides', 'coach', 'Good editing instinct on {detail}. Less on the slide means more for the audience.'),
  L('slides', 'coach', 'Solid structure in {subject}. {Detail} sets up the next point naturally.'),
  L('slides', 'bestie', 'Okay presenter, {subject} is looking sleek. {Detail} is going to get nods.'),
  L('slides', 'bestie', "{Detail} in {subject}? I'd lean forward in my chair for that one."),
  L('slides', 'bestie', 'Your deck has taste. {Detail} is clean, clear and a little bit fancy.'),
  // docs / writing
  L('doc', 'hype', "{Subject} is flowing. {Detail} pulls the reader right in and doesn't let go."),
  L('doc', 'hype', 'Words are moving in {subject}. {Detail} sounds like someone who knows exactly what they mean.'),
  L('doc', 'hype', '{Detail} in {subject} has real momentum. Keep riding this draft.'),
  L('doc', 'coach', 'Steady progress on {subject}. {Detail} is clearer than the version before it.'),
  L('doc', 'coach', "You're doing the hard part of writing: making {detail} simple. {Subject} is better for it."),
  L('doc', 'coach', 'Good choice tightening {detail}. {Subject} reads with more confidence now.'),
  L('doc', 'bestie', '{Subject} is a page-turner in the making. {Detail} made me want the next bit.'),
  L('doc', 'bestie', 'Writer mode suits you. {Detail} in {subject} is lovely.'),
  L('doc', 'bestie', 'Not to be dramatic, but {detail} in {subject} is kind of brilliant.'),
  // design
  L('design', 'hype', 'Real craft in {detail}. {Subject} is looking seriously sharp.'),
  L('design', 'hype', '{Subject} has taste all over it. The care in {detail} is obvious.'),
  L('design', 'hype', 'Pixel-level care on {detail}. {Subject} is going to feel great to use.'),
  L('design', 'coach', 'Thoughtful work on {detail}. Consistency like that is what makes {subject} feel trustworthy.'),
  L('design', 'coach', '{Subject} is getting calmer and clearer. Your decisions on {detail} are paying off.'),
  L('design', 'coach', "Patient iteration on {detail}. That's how {subject} goes from fine to excellent."),
  L('design', 'bestie', "{Subject} is so pretty I'm a little jealous. The work on {detail} is stunning."),
  L('design', 'bestie', 'Designer brain fully on. The attention to {detail} in {subject} is very satisfying.'),
  L('design', 'bestie', "{Subject} is giving polished. Whoever did {detail} has excellent taste. Oh wait, it's you."),
  // research / reading
  L('research', 'hype', 'Deep in {subject} and actually absorbing it. That focus on {detail} pays off.'),
  L('research', 'hype', 'Learning mode looks good on you. {Detail} in {subject} is homework done right.'),
  L('research', 'hype', "You're working through {subject} like a pro. {Detail} doesn't stand a chance."),
  L('research', 'coach', 'Good focus on {subject}. Taking time with {detail} now saves hours of guessing later.'),
  L('research', 'coach', 'Steady, curious reading. {Detail} is exactly the right place to slow down in {subject}.'),
  L('research', 'coach', 'Solid prep work. Understanding {detail} properly is what makes the next step easy.'),
  L('research', 'bestie', 'Nerd mode activated and I love it. {Detail} in {subject} looks fascinating.'),
  L('research', 'bestie', 'Look at you actually reading {subject}. {Detail} is officially in your brain now.'),
];

const LOWER_STARTS = /^(the|your|that|this|those|these|a|an|three|two|one)\b/;

function cap(s: string): string {
  return LOWER_STARTS.test(s) ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

export function renderLine(template: string, ctx: Pick<ScreenContext, 'subject' | 'detail'>): string {
  return template
    .replaceAll('{Subject}', cap(ctx.subject))
    .replaceAll('{subject}', ctx.subject)
    .replaceAll('{Detail}', cap(ctx.detail))
    .replaceAll('{detail}', ctx.detail);
}
