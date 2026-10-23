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
  // chat / messaging — the interaction, never the message text
  L('chat', 'hype', 'Love {detail}. {Subject} is lucky to have you in it.'),
  L('chat', 'hype', '{Subject} is buzzing, and {detail} is a big part of why.'),
  L('chat', 'hype', 'Look at you keeping {subject} alive. {Detail} is friendship in action.'),
  L('chat', 'coach', 'Good to see you making time for people. {Detail} in {subject} matters more than it looks.'),
  L('chat', 'coach', "Staying connected takes effort, and {detail} shows you're putting it in."),
  L('chat', 'coach', 'Nice, steady presence in {subject}. {Detail} is how friendships stay strong.'),
  L('chat', 'bestie', '{Subject} is the best thing on your screen right now. {Detail}? Iconic.'),
  L('chat', 'bestie', "Okay, {detail} in {subject} made me smile. You're good people."),
  L('chat', 'bestie', 'Ten out of ten chat energy. {Detail} is exactly the vibe.'),
  // video calls
  L('call', 'hype', '{Subject} has great energy. {Detail} is the kind of moment that makes a day.'),
  L('call', 'hype', "Love seeing {detail}. You're bringing good vibes to {subject}."),
  L('call', 'hype', '{Detail}! {Subject} is clearly a good one.'),
  L('call', 'coach', 'Good presence on {subject}. {Detail} says people feel heard.'),
  L('call', 'coach', 'Showing up for people counts. {Detail} on {subject} is a nice sign.'),
  L('call', 'coach', 'Calm and engaged. {Detail} makes {subject} feel easy for everyone.'),
  L('call', 'bestie', '{Subject} looks like the place to be. {Detail} is adorable.'),
  L('call', 'bestie', 'Low-key wishing I had an invite to {subject}. {Detail} looks so fun.'),
  L('call', 'bestie', 'Love {detail}. {Subject} is officially the highlight of the day.'),
  // social feeds
  L('social', 'hype', "Spreading good energy on {subject}. {Detail} is a small thing that makes someone's day."),
  L('social', 'hype', "{Detail}? That's how you make the internet a nicer place."),
  L('social', 'hype', 'Love {detail}. {Subject} is better with you in it.'),
  L('social', 'coach', 'Nice way to spend a few minutes. {Detail} keeps you connected to your people.'),
  L('social', 'coach', 'Kindness online counts. {Detail} on {subject} is a good example of it.'),
  L('social', 'coach', 'Being generous with your attention is a real skill. {Detail} shows it.'),
  L('social', 'bestie', '{Detail}? Supportive friend energy, love it.'),
  L('social', 'bestie', 'Scrolling {subject} with a good heart. {Detail} is very you.'),
  L('social', 'bestie', '{Subject} just got a little brighter. {Detail} was a lovely touch.'),
  // photos
  L('photos', 'hype', '{Detail} in {subject} is a frame-worthy memory. What a moment.'),
  L('photos', 'hype', '{Subject} is full of good days, {detail} especially.'),
  L('photos', 'hype', 'Great eye. {Detail} in {subject} is a keeper.'),
  L('photos', 'coach', 'Revisiting {subject} is a nice habit. {Detail} is worth remembering.'),
  L('photos', 'coach', '{Detail} captures something real. {Subject} is a lovely record of it.'),
  L('photos', 'coach', 'Good memories, well kept. {Detail} stands out in {subject}.'),
  L('photos', 'bestie', 'Okay, {detail}? Stunning. {Subject} deserves a gallery wall.'),
  L('photos', 'bestie', '{Subject} is full of joy, and {detail} might be my favourite.'),
  L('photos', 'bestie', "I'd happily scroll {subject} all day. {Detail} is gorgeous."),
  // watching
  L('watch', 'hype', 'Great pick with {subject}. {Detail} looks genuinely good.'),
  L('watch', 'hype', '{Subject} is a solid choice. Enjoy {detail}, you earned it.'),
  L('watch', 'hype', '{Detail} and you, settled in? Perfect pairing.'),
  L('watch', 'coach', 'A good break is part of a good day. {Subject} looks like a nice one.'),
  L('watch', 'coach', 'Picking up something from {subject}? {Detail} looks worth the time.'),
  L('watch', 'coach', 'Nice to see you enjoying {subject}. Rest counts too.'),
  L('watch', 'bestie', 'Ooh, {subject}. Great taste, honestly. {Detail} looks so good.'),
  L('watch', 'bestie', 'Save me a seat for {subject}. {Detail} looks fun.'),
  // music
  L('music', 'hype', '{Subject} is a great call. {Detail} brings the energy.'),
  L('music', 'hype', 'Your taste in music is strong. {Detail} on {subject} proves it.'),
  L('music', 'coach', 'Good soundtrack for the moment. {Detail} sets a nice tone.'),
  L('music', 'coach', '{Subject} is a calm, good choice. Enjoy {detail}.'),
  L('music', 'bestie', '{Subject}? Excellent taste. {Detail} is a certified bop.'),
  L('music', 'bestie', 'Okay DJ, {detail} is perfect. {Subject} is a vibe.'),
  // games
  L('game', 'hype', "{Detail} in {subject}? That's some serious skill."),
  L('game', 'hype', "You're on a roll in {subject}. {Detail} was clutch."),
  L('game', 'coach', 'Nice focus in {subject}. {Detail} shows real patience.'),
  L('game', 'coach', 'Good, steady play. {Detail} is how {subject} gets won.'),
  L('game', 'bestie', "{Detail}? Okay, champion. {Subject} doesn't stand a chance."),
  L('game', 'bestie', 'Watching you play {subject} is fun. {Detail} was so good.'),
  // code
  L('code', 'hype', '{Subject} is getting seriously clean. {Detail} reads like you knew exactly where you were going.'),
  L('code', 'hype', 'Look at you in {subject}. {Detail} is the kind of code future-you sends a thank-you note for.'),
  L('code', 'hype', 'Sharp move in {subject}. {Detail} makes the whole file feel simpler and stronger.'),
  L('code', 'hype', "{Detail} in {subject}? Crisp. You're writing code people will actually enjoy reviewing."),
  L('code', 'coach', 'Steady work in {subject}. {Detail} is clearer than it was ten minutes ago, and that compounds.'),
  L('code', 'coach', 'Nice discipline on {detail}. Small, careful changes like this are how {subject} stays healthy.'),
  L('code', 'coach', "You're making real progress in {subject}. {Detail} looks deliberate, not rushed. Keep that pace."),
  L('code', 'bestie', "Okay, {subject} is looking good. {Detail} is so neat I'd high-five it."),
  L('code', 'bestie', "Peeked at {subject} and wow. {Detail} is so well done I'm taking notes."),
  L('code', 'bestie', '{Detail} in {subject} is so neat I want to frame it. Fridge-worthy code.'),
  // email — only ever the unread count, never senders or subjects
  L('email', 'hype', "Only {detail} left in {subject}. You're clearing it like it owes you money."),
  L('email', 'hype', "{Detail} and falling. You're running {subject} instead of it running you."),
  L('email', 'hype', 'Down to {detail}. That is a genuinely satisfying number to see in {subject}.'),
  L('email', 'coach', 'Good rhythm on {subject}. {Detail} means fewer loose ends for tomorrow.'),
  L('email', 'coach', "One reply at a time and look: {detail}. That's how a clear head gets built."),
  L('email', 'coach', 'Steady, methodical work. {Detail} in {subject} is real progress.'),
  L('email', 'bestie', '{Detail}? Who are you, the inbox whisperer?'),
  L('email', 'bestie', 'Watching {subject} shrink to {detail} is weirdly soothing.'),
  L('email', 'bestie', 'Your inbox would thank you if it could. {Detail} is a lovely sight.'),
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
  L('slides', 'hype', '{Subject} is shaping up to be one people remember. {Detail} lands with real punch.'),
  L('slides', 'hype', "{Detail} in {subject} is strong. You're building the kind of story that gets a yes."),
  L('slides', 'hype', 'That is a confident deck. {Detail} makes {subject} feel focused and inevitable.'),
  L('slides', 'coach', '{Subject} is getting clearer slide by slide. {Detail} says one thing and says it well.'),
  L('slides', 'coach', 'Good editing instinct on {detail}. Less on the slide means more for the audience.'),
  L('slides', 'coach', 'Solid structure in {subject}. {Detail} sets up the next point naturally.'),
  L('slides', 'bestie', 'Okay presenter, {subject} is looking sleek. {Detail} is going to get nods.'),
  L('slides', 'bestie', "{Detail} in {subject}? I'd lean forward in my chair for that one."),
  L('slides', 'bestie', 'Your slides have taste. {Detail} is clean, clear and a little bit fancy.'),
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
  L('research', 'hype', 'Deep in {subject} and actually absorbing it. Your focus on {detail} pays off.'),
  L('research', 'hype', 'Learning mode looks good on you. {Detail} in {subject} is homework done right.'),
  L('research', 'hype', "You're working through {subject} like a pro. {Detail} doesn't stand a chance."),
  L('research', 'coach', 'Good focus on {subject}. Taking time with {detail} now saves hours of guessing later.'),
  L('research', 'coach', 'Steady, curious reading. Slowing down on {detail} in {subject} is exactly right.'),
  L('research', 'coach', 'Solid prep work. Understanding {detail} properly is what makes the next step easy.'),
  L('research', 'bestie', 'Nerd mode activated and I love it. {Detail} in {subject} looks fascinating.'),
  L('research', 'bestie', 'Look at you actually reading {subject}. {Detail} is officially in your brain now.'),
];

const LOWER_STARTS = /^(the|your|that|this|those|these|a|an|all|everyone|what|three|two|one)\b/;

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
