// Defaults, limits and helpers for building and resizing a game setup.
import type { BoardConfig, CategoryConfig, GameSettings, GameSetup, TeamConfig } from './types.ts';

export const LIMITS = {
  minColumns: 1,
  maxColumns: 12,
  minRows: 1,
  maxRows: 10,
  minTeams: 1,
  maxTeams: 12,
  maxTextLength: 600,
  maxNameLength: 24,
  maxPlayers: 120,
} as const;

export const TEAM_COLORS = [
  '#ff5a5f',
  '#2ec4b6',
  '#ffb400',
  '#a66cff',
  '#ff7ab6',
  '#4cd964',
  '#ff8c42',
  '#5ac8fa',
  '#c0ca33',
  '#f06292',
  '#26a69a',
  '#ab47bc',
];

export const DEFAULT_SETTINGS: GameSettings = {
  buzzerMode: 'manual',
  autoOpenDelaySec: 3,
  deductWrong: true,
  earlyBuzzLockoutMs: 250,
  valuePrefix: '$',
};

export function makeId(): string {
  // crypto.randomUUID is unavailable on plain-http LAN pages, so keep this simple.
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function makeTeam(index: number): TeamConfig {
  return { id: makeId(), name: `Team ${index + 1}`, color: TEAM_COLORS[index % TEAM_COLORS.length] };
}

export function blankCategory(index: number, rows: number): CategoryConfig {
  return {
    name: `Category ${index + 1}`,
    clues: Array.from({ length: rows }, () => ({ clue: '', answer: '' })),
  };
}

/** Next row value continuing the existing pattern (e.g. 200, 400, 600 -> 800). */
function nextValue(values: number[]): number {
  if (values.length === 0) return 200;
  if (values.length === 1) return values[0] * 2;
  const last = values[values.length - 1];
  const step = last - values[values.length - 2];
  return last + (step > 0 ? step : last);
}

export function resizeBoard(board: BoardConfig, columns: number, rows: number): BoardConfig {
  const values = board.values.slice(0, rows);
  while (values.length < rows) values.push(nextValue(values));

  const categories = board.categories.slice(0, columns).map((cat) => {
    const clues = cat.clues.slice(0, rows);
    while (clues.length < rows) clues.push({ clue: '', answer: '' });
    return { ...cat, clues };
  });
  while (categories.length < columns) categories.push(blankCategory(categories.length, rows));

  return { ...board, values, categories };
}

export function resizeTeams(teams: TeamConfig[], count: number): TeamConfig[] {
  const next = teams.slice(0, count);
  while (next.length < count) {
    const team = makeTeam(next.length);
    // Avoid reusing a color that's already taken when possible.
    const free = TEAM_COLORS.find((c) => !next.some((t) => t.color === c));
    if (free) team.color = free;
    next.push(team);
  }
  return next;
}

export function evenValues(rows: number, start: number, step: number): number[] {
  return Array.from({ length: rows }, (_, i) => start + step * i);
}

export function countFilled(board: BoardConfig): { filled: number; total: number } {
  let filled = 0;
  let total = 0;
  for (const cat of board.categories) {
    for (const clue of cat.clues) {
      total++;
      if (clue.clue.trim()) filled++;
    }
  }
  return { filled, total };
}

export function formatValue(value: number, prefix: string): string {
  const abs = Math.abs(value);
  const text = Number.isInteger(abs) ? abs.toLocaleString('en-US') : abs.toLocaleString('en-US', { maximumFractionDigits: 1 });
  return `${value < 0 ? '-' : ''}${prefix}${text}`;
}

const str = (v: unknown, max: number = LIMITS.maxTextLength): string =>
  typeof v === 'string' ? v.slice(0, max) : '';
const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

/** Validate untrusted setup data (from the host UI or an imported file) into a well-formed setup. */
export function sanitizeSetup(input: unknown): GameSetup {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const rawBoard = (raw.board && typeof raw.board === 'object' ? raw.board : {}) as Record<string, any>;

  const rawValues: unknown[] = Array.isArray(rawBoard.values) ? rawBoard.values : [];
  const rawCats: unknown[] = Array.isArray(rawBoard.categories) ? rawBoard.categories : [];
  const rows = clamp(rawValues.length || 5, LIMITS.minRows, LIMITS.maxRows);
  const columns = clamp(rawCats.length || 6, LIMITS.minColumns, LIMITS.maxColumns);

  const values = Array.from({ length: rows }, (_, i) => clamp(Math.round(num(rawValues[i], (i + 1) * 200) * 100) / 100, -1e7, 1e7));
  const categories: CategoryConfig[] = Array.from({ length: columns }, (_, c) => {
    const cat = (rawCats[c] && typeof rawCats[c] === 'object' ? rawCats[c] : {}) as Record<string, any>;
    const clues: unknown[] = Array.isArray(cat.clues) ? cat.clues : [];
    return {
      name: str(cat.name, 80) || `Category ${c + 1}`,
      clues: Array.from({ length: rows }, (_, r) => {
        const clue = (clues[r] && typeof clues[r] === 'object' ? clues[r] : {}) as Record<string, any>;
        return { clue: str(clue.clue), answer: str(clue.answer) };
      }),
    };
  });

  const rawTeams: unknown[] = Array.isArray(raw.teams) ? raw.teams : [];
  const teamCount = clamp(rawTeams.length || 3, LIMITS.minTeams, LIMITS.maxTeams);
  const seen = new Set<string>();
  const teams: TeamConfig[] = Array.from({ length: teamCount }, (_, i) => {
    const t = (rawTeams[i] && typeof rawTeams[i] === 'object' ? rawTeams[i] : {}) as Record<string, any>;
    let id = str(t.id, 40);
    if (!id || seen.has(id)) id = makeId();
    seen.add(id);
    const color = /^#[0-9a-f]{6}$/i.test(str(t.color, 7)) ? str(t.color, 7) : TEAM_COLORS[i % TEAM_COLORS.length];
    return { id, name: str(t.name, LIMITS.maxNameLength).trim() || `Team ${i + 1}`, color };
  });

  const s = (raw.settings && typeof raw.settings === 'object' ? raw.settings : {}) as Record<string, any>;
  const settings: GameSettings = {
    buzzerMode: s.buzzerMode === 'auto' ? 'auto' : 'manual',
    autoOpenDelaySec: clamp(num(s.autoOpenDelaySec, DEFAULT_SETTINGS.autoOpenDelaySec), 0, 60),
    deductWrong: typeof s.deductWrong === 'boolean' ? s.deductWrong : DEFAULT_SETTINGS.deductWrong,
    earlyBuzzLockoutMs: clamp(Math.round(num(s.earlyBuzzLockoutMs, DEFAULT_SETTINGS.earlyBuzzLockoutMs)), 0, 3000),
    valuePrefix: typeof s.valuePrefix === 'string' ? s.valuePrefix.slice(0, 4) : DEFAULT_SETTINGS.valuePrefix,
  };

  return {
    board: { title: str(rawBoard.title, 80) || 'Jeopardy!', values, categories },
    teams,
    settings,
  };
}

const q = (clue: string, answer: string) => ({ clue, answer });

/** A ready-to-play sample board so the game works out of the box. */
export function sampleBoard(): BoardConfig {
  return {
    title: 'Jeopardy!',
    values: [200, 400, 600, 800, 1000],
    categories: [
      {
        name: 'Space',
        clues: [
          q('Thanks to iron oxide on its surface, this planet is known as the Red Planet', 'What is Mars?'),
          q('It is the closest star to Earth', 'What is the Sun?'),
          q("This planet's moon Ganymede is bigger than the planet Mercury", 'What is Jupiter?'),
          q('The Apollo 11 lunar module that landed on the Moon in 1969 shared its name with this bird', 'What is the Eagle?'),
          q('In 2006 it was reclassified as a dwarf planet', 'What is Pluto?'),
        ],
      },
      {
        name: 'World Capitals',
        clues: [
          q("Parliament Hill overlooks the river in this Canadian capital", 'What is Ottawa?'),
          q('Shibuya Crossing is one of the busiest intersections in this capital', 'What is Tokyo?'),
          q("Not Sydney, not Melbourne: it's Australia's capital", 'What is Canberra?'),
          q('Istanbul is bigger, but this city is the capital of Türkiye', 'What is Ankara?'),
          q("At about 3,600 m, it is the world's highest seat of government", 'What is La Paz?'),
        ],
      },
      {
        name: 'Animal Kingdom',
        clues: [
          q('The largest animal known to have ever lived', 'What is the blue whale?'),
          q('A group of these birds is called a "parliament"', 'What are owls?'),
          q('The only mammal capable of true, sustained flight', 'What is a bat?'),
          q('This eight-armed animal has three hearts and blue blood', 'What is an octopus?'),
          q("A cow's stomach has this many compartments", 'What is four?'),
        ],
      },
      {
        name: 'Food & Drink',
        clues: [
          q('Guacamole is mostly made of this fruit', 'What is avocado?'),
          q('A classic Margherita pizza is topped with tomato, basil and this cheese', 'What is mozzarella?'),
          q('Japanese miso soup is traditionally made with this seaweed-and-fish stock', 'What is dashi?'),
          q('The spice saffron comes from the stigmas of this flower', 'What is the crocus?'),
          q('This country produces more coffee than any other', 'What is Brazil?'),
        ],
      },
      {
        name: 'Sports',
        clues: [
          q('Each soccer team has this many players on the field', 'What is 11?'),
          q('This racket sport is played with a shuttlecock', 'What is badminton?'),
          q('In tennis, a score of zero', 'What is love?'),
          q('This country hosted the first modern Olympic Games in 1896', 'What is Greece?'),
          q('A perfect score in ten-pin bowling', 'What is 300?'),
        ],
      },
      {
        name: 'In the Pool',
        clues: [
          q('The four competitive strokes are butterfly, backstroke, breaststroke and this one', 'What is freestyle?'),
          q('An Olympic-size pool is this many meters long', 'What is 50?'),
          q('In an individual medley, this stroke is swum first', 'What is butterfly?'),
          q('Swimmers do a flip turn at the wall in freestyle and in this stroke', 'What is backstroke?'),
          q('The undulating underwater kick used off starts and turns is named for this sea mammal', 'What is the dolphin?'),
        ],
      },
    ],
  };
}

export function defaultSetup(): GameSetup {
  return {
    board: sampleBoard(),
    teams: resizeTeams([], 3),
    settings: { ...DEFAULT_SETTINGS },
  };
}
