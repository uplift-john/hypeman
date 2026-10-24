import type { Category, ScreenContext } from './context';
import type { PersonaId } from './personas';

/**
 * Canned lines for mock mode. Every template references the context's
 * {subject} and/or {detail} so mock output is never generic.
 * {Subject}/{Detail} = same value with a sentence-start capital where natural.
 */
export interface MockLine {
  /** 'any' lines fit every screen; category lines lightly reference what's going on. */
  category: Exclude<Category, 'blank'> | 'any';
  persona: PersonaId;
  text: string;
}

const L = (category: MockLine['category'], persona: PersonaId, text: string): MockLine => ({ category, persona, text });

/**
 * Hypeman talks out loud, so lines are tiny reactions — the kind a friend shouts across
 * the room: "Noice!", "Yessirrrrr!", "I see what you did there, and I like it."
 */
export const MOCK_LINES: MockLine[] = [
  // any screen
  L('any', 'hype', 'Noice!'),
  L('any', 'hype', 'Yessirrrrr!'),
  L('any', 'hype', "Let's gooo!"),
  L('any', 'hype', 'Okay, okay, I see you!'),
  L('any', 'hype', "That's what I'm talking about!"),
  L('any', 'hype', 'Big moves.'),
  L('any', 'hype', 'Sheeesh, look at that.'),
  L('any', 'hype', 'Ooh, that is clean.'),
  L('any', 'hype', "Now we're cooking!"),
  L('any', 'hype', 'You love to see it.'),
  L('any', 'hype', 'Absolute scenes!'),
  L('any', 'hype', 'Somebody stop this person!'),
  L('any', 'coach', 'Nice. Steady.'),
  L('any', 'coach', 'Good stuff.'),
  L('any', 'coach', 'Solid.'),
  L('any', 'coach', "That's the way."),
  L('any', 'coach', 'Love that.'),
  L('any', 'coach', 'Clean. Keep rolling.'),
  L('any', 'coach', 'Nicely done.'),
  L('any', 'coach', "That'll do it."),
  L('any', 'bestie', 'I see what you did there, and I like it.'),
  L('any', 'bestie', 'Obsessed.'),
  L('any', 'bestie', 'Iconic.'),
  L('any', 'bestie', "Stop it, that's so good."),
  L('any', 'bestie', 'Okay, slay!'),
  L('any', 'bestie', 'Ooh, cute!'),
  L('any', 'bestie', 'Main character energy.'),
  L('any', 'bestie', "Tell me more, I'm invested."),
  // chats
  L('chat', 'hype', '{Subject} is popping!'),
  L('chat', 'coach', 'Good chat. Good people.'),
  L('chat', 'bestie', '{Subject}? Love that for you.'),
  // calls
  L('call', 'hype', 'This call has energy!'),
  L('call', 'coach', 'Good call. Good crowd.'),
  L('call', 'bestie', 'Ooh, the gang is all here!'),
  // feeds
  L('social', 'hype', 'Spreading the love. Noice!'),
  L('social', 'coach', 'Kind words go a long way.'),
  L('social', 'bestie', 'Supportive friend energy!'),
  // photos
  L('photos', 'hype', '{Subject}? Frame it!'),
  L('photos', 'coach', 'Good memories right there.'),
  L('photos', 'bestie', 'Okay, photographer!'),
  // watching
  L('watch', 'hype', 'Great pick!'),
  L('watch', 'coach', 'Good choice. Enjoy it.'),
  L('watch', 'bestie', 'Ooh, save me a seat.'),
  // music
  L('music', 'hype', 'Banger alert!'),
  L('music', 'coach', 'Good soundtrack.'),
  L('music', 'bestie', 'Certified bop.'),
  // games
  L('game', 'hype', 'Clutch!'),
  L('game', 'coach', 'Smart play.'),
  L('game', 'bestie', 'Okay, champion!'),
  // work
  L('code', 'hype', '{Subject}? Noice!'),
  L('code', 'coach', 'Solid work on {subject}.'),
  L('code', 'bestie', 'Look at you, coding.'),
  L('email', 'hype', '{Detail}? Yessir!'),
  L('email', 'coach', 'Inbox under control.'),
  L('email', 'bestie', 'Inbox whisperer!'),
  L('sheet', 'hype', 'Look at {subject} go!'),
  L('sheet', 'coach', 'Tidy numbers. Nice.'),
  L('sheet', 'bestie', 'Spreadsheet wizard!'),
  L('slides', 'hype', '{Subject} is landing!'),
  L('slides', 'coach', 'Clear slide. Good.'),
  L('slides', 'bestie', 'Your slides have taste.'),
  L('doc', 'hype', 'Words are flowing!'),
  L('doc', 'coach', '{Subject} reads well.'),
  L('doc', 'bestie', 'Ooh, wordsmith!'),
  L('design', 'hype', '{Subject} looks sharp!'),
  L('design', 'coach', 'Nice spacing.'),
  L('design', 'bestie', 'Pretty! Very pretty.'),
  L('research', 'hype', 'Big brain moves.'),
  L('research', 'coach', 'Good reading.'),
  L('research', 'bestie', 'Nerd mode, love it.'),
];

/** Listen mode (mock): reactions to what was just said, by vibe. */
export type TalkVibe = 'funny' | 'agree' | 'win' | 'any';

export const TALK_LINES: Record<TalkVibe, Record<PersonaId, string[]>> = {
  funny: {
    hype: ["That's hilarious!", 'Stop, I can’t.', 'Comedy gold.', 'Okay, that got me.'],
    coach: ['Ha. Good one.', 'That’s genuinely funny.', 'Nice timing on that.'],
    bestie: ['I’m dead.', 'Screaming.', 'Not you being this funny.', 'Okay, that’s iconic.'],
  },
  agree: {
    hype: ["You're spot on!", 'Facts.', 'Say it louder!', 'Preach!'],
    coach: ['Good point.', 'That’s exactly right.', 'Well said.'],
    bestie: ['So true.', 'Literally this.', 'Couldn’t agree more.'],
  },
  win: {
    hype: ['Yesssssir!', "Let's gooo!", 'Big moves!', 'That’s what I’m talking about!'],
    coach: ['That’s a real win.', 'Earned it.', 'Proud of that.'],
    bestie: ['Obsessed with this news.', 'Okay, winner!', 'Love that for you.'],
  },
  any: {
    hype: ['Yessir!', 'Ooh, I like it.', 'Okay, okay!', 'Big energy.'],
    coach: ['Good stuff.', 'Love that.', 'Nice.'],
    bestie: ['Ooh, tell me more.', 'I’m invested.', 'Love this convo.'],
  },
};

const VIBES: Array<[TalkVibe, RegExp]> = [
  ['funny', /\b(ha(ha)+|lol|lmao|hilarious|funny|joke|dying|cracking up)\b/i],
  ['win', /\b(got (the|it|in)|we (won|did it)|nailed|crushed|promoted|accepted|finished|shipped|done it|let'?s go|engaged|hired|passed)\b/i],
  ['agree', /\b(exactly|so true|good point|makes sense|i agree|totally|right\?|you'?re right|that'?s true|facts)\b/i],
];

export function talkVibe(transcript: string): TalkVibe {
  // Weight the most recent part of the conversation.
  const tail = transcript.slice(-300);
  return VIBES.find(([, re]) => re.test(tail))?.[0] ?? 'any';
}

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
