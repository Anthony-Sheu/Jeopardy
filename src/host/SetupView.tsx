import { motion } from 'motion/react';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import {
  countFilled,
  evenValues,
  LIMITS,
  resizeBoard,
  resizeTeams,
  sampleBoard,
  sanitizeSetup,
  TEAM_COLORS,
} from '../../shared/config.ts';
import type { BoardConfig, GameSetup, HostState } from '../../shared/types.ts';
import { Icon } from '../components/Icon.tsx';
import type { Dispatch } from './useHost.ts';

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="stepper">
      <span className="stepper-label">{label}</span>
      <div className="stepper-controls">
        <button onClick={() => onChange(Math.max(min, value - 1))} disabled={value <= min} aria-label={`Fewer ${label}`}>
          <Icon name="minus" size={16} />
        </button>
        <motion.output key={value} initial={{ scale: 1.4, opacity: 0.4 }} animate={{ scale: 1, opacity: 1 }}>
          {value}
        </motion.output>
        <button onClick={() => onChange(Math.min(max, value + 1))} disabled={value >= max} aria-label={`More ${label}`}>
          <Icon name="plus" size={16} />
        </button>
      </div>
    </div>
  );
}

function download(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function SetupView({ state, dispatch }: { state: HostState; dispatch: Dispatch }) {
  const [setup, setSetup] = useState<GameSetup>(state.setup);
  const [valueStart, setValueStart] = useState(state.setup.board.values[0] ?? 200);
  const [valueStep, setValueStep] = useState(
    (state.setup.board.values[1] ?? 400) - (state.setup.board.values[0] ?? 200) || 200,
  );
  const fileInput = useRef<HTMLInputElement>(null);
  const { board, teams, settings } = setup;
  const cols = board.categories.length;
  const rows = board.values.length;
  const { filled, total } = countFilled(board);
  const hasScores = Object.values(state.scores).some((s) => s !== 0) || state.used.flat().some(Boolean);

  // Save drafts to the server as you type, so a refresh or restart loses nothing.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => dispatch({ type: 'saveSetup', setup }), 400);
    return () => clearTimeout(t);
  }, [setup, dispatch]);

  const setBoard = (fn: (b: BoardConfig) => BoardConfig) => setSetup((s) => ({ ...s, board: fn(s.board) }));
  const setClue = (c: number, r: number, field: 'clue' | 'answer', text: string) =>
    setBoard((b) => ({
      ...b,
      categories: b.categories.map((cat, ci) =>
        ci !== c ? cat : { ...cat, clues: cat.clues.map((cl, ri) => (ri !== r ? cl : { ...cl, [field]: text })) },
      ),
    }));

  const importFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      // Accept either a full setup export or just a board.
      const next = sanitizeSetup(Array.isArray(parsed?.categories) ? { ...setup, board: parsed } : parsed);
      setSetup(next);
      setValueStart(next.board.values[0]);
      setValueStep((next.board.values[1] ?? next.board.values[0] * 2) - next.board.values[0]);
    } catch {
      alert("That file couldn't be read. Pick a .json file exported from this game.");
    }
  };

  const proceed = () => {
    dispatch({ type: 'saveSetup', setup });
    dispatch({ type: 'goto', phase: 'lobby' });
  };

  return (
    <div className="setup">
      <header className="setup-header">
        <div>
          <p className="kicker">Game setup</p>
          <h1>Build your board</h1>
        </div>
        <div className="setup-tools">
          <button className="btn btn-ghost" onClick={() => setSetup((s) => ({ ...s, board: resizeBoard(sampleBoard(), cols, rows) }))}>
            <Icon name="sparkle" /> Sample clues
          </button>
          <button className="btn btn-ghost" onClick={() => fileInput.current?.click()}>
            <Icon name="upload" /> Import
          </button>
          <button className="btn btn-ghost" onClick={() => download(`${board.title || 'jeopardy'}.json`, setup)}>
            <Icon name="download" /> Export
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => {
              if (confirm('Erase every category, clue and answer?')) {
                setBoard((b) => resizeBoard({ ...b, categories: [] }, cols, rows));
              }
            }}
          >
            <Icon name="close" /> Clear board
          </button>
          {hasScores && (
            <button
              className="btn btn-ghost"
              onClick={() => confirm('Reset all scores and put every clue back on the board?') && dispatch({ type: 'newGame' })}
            >
              <Icon name="refresh" /> Reset scores
            </button>
          )}
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importFile(f);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="setup-cards">
        <motion.section className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
          <h2>Board</h2>
          <label className="field">
            <span>Game title</span>
            <input
              value={board.title}
              maxLength={80}
              onChange={(e) => setBoard((b) => ({ ...b, title: e.target.value }))}
            />
          </label>
          <div className="stepper-row">
            <Stepper
              label="Columns"
              value={cols}
              min={LIMITS.minColumns}
              max={LIMITS.maxColumns}
              onChange={(n) => setBoard((b) => resizeBoard(b, n, rows))}
            />
            <Stepper
              label="Rows"
              value={rows}
              min={LIMITS.minRows}
              max={LIMITS.maxRows}
              onChange={(n) => setBoard((b) => resizeBoard(b, cols, n))}
            />
          </div>
          <div className="values-fill">
            <label className="field small">
              <span>First value</span>
              <input type="number" value={valueStart} onChange={(e) => setValueStart(Number(e.target.value))} />
            </label>
            <label className="field small">
              <span>Step</span>
              <input type="number" value={valueStep} onChange={(e) => setValueStep(Number(e.target.value))} />
            </label>
            <button className="btn" onClick={() => setBoard((b) => ({ ...b, values: evenValues(rows, valueStart, valueStep) }))}>
              Apply to rows
            </button>
          </div>
        </motion.section>

        <motion.section className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <h2>Teams</h2>
          <Stepper
            label="Teams"
            value={teams.length}
            min={LIMITS.minTeams}
            max={LIMITS.maxTeams}
            onChange={(n) => setSetup((s) => ({ ...s, teams: resizeTeams(s.teams, n) }))}
          />
          <ul className="team-list">
            {teams.map((team, i) => (
              <motion.li key={team.id} layout initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}>
                <label className="swatch" style={{ '--team': team.color } as CSSProperties} title="Team color">
                  <input
                    type="color"
                    value={team.color}
                    list="team-colors"
                    onChange={(e) =>
                      setSetup((s) => ({
                        ...s,
                        teams: s.teams.map((t, ti) => (ti === i ? { ...t, color: e.target.value } : t)),
                      }))
                    }
                  />
                </label>
                <input
                  value={team.name}
                  maxLength={LIMITS.maxNameLength}
                  placeholder={`Team ${i + 1}`}
                  aria-label={`Team ${i + 1} name`}
                  onChange={(e) =>
                    setSetup((s) => ({
                      ...s,
                      teams: s.teams.map((t, ti) => (ti === i ? { ...t, name: e.target.value } : t)),
                    }))
                  }
                />
              </motion.li>
            ))}
          </ul>
          <datalist id="team-colors">
            {TEAM_COLORS.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </motion.section>

        <motion.section className="card" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <h2>Rules</h2>
          <fieldset className="radio-group">
            <legend>Buzzers open</legend>
            <label>
              <input
                type="radio"
                checked={settings.buzzerMode === 'manual'}
                onChange={() => setSetup((s) => ({ ...s, settings: { ...s.settings, buzzerMode: 'manual' } }))}
              />
              When I press Space (after reading the clue)
            </label>
            <label>
              <input
                type="radio"
                checked={settings.buzzerMode === 'auto'}
                onChange={() => setSetup((s) => ({ ...s, settings: { ...s.settings, buzzerMode: 'auto' } }))}
              />
              Automatically after
              <input
                className="inline-num"
                type="number"
                min={0}
                max={60}
                value={settings.autoOpenDelaySec}
                onChange={(e) =>
                  setSetup((s) => ({ ...s, settings: { ...s.settings, autoOpenDelaySec: Number(e.target.value) } }))
                }
              />
              seconds
            </label>
          </fieldset>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.deductWrong}
              onChange={(e) => setSetup((s) => ({ ...s, settings: { ...s.settings, deductWrong: e.target.checked } }))}
            />
            Wrong answers lose points
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.earlyBuzzLockoutMs > 0}
              onChange={(e) =>
                setSetup((s) => ({ ...s, settings: { ...s.settings, earlyBuzzLockoutMs: e.target.checked ? 250 : 0 } }))
              }
            />
            Buzzing too early locks you out for ¼ second
          </label>
          <label className="field small">
            <span>Value prefix</span>
            <input
              value={settings.valuePrefix}
              maxLength={4}
              placeholder="none"
              onChange={(e) => setSetup((s) => ({ ...s, settings: { ...s.settings, valuePrefix: e.target.value } }))}
            />
          </label>
        </motion.section>
      </div>

      <motion.section
        className="editor-wrap"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <div className="editor" style={{ '--cols': cols } as CSSProperties}>
          <div className="editor-corner">Value</div>
          {board.categories.map((cat, c) => (
            <input
              key={`cat-${c}`}
              className="editor-cat"
              value={cat.name}
              maxLength={80}
              placeholder={`Category ${c + 1}`}
              aria-label={`Category ${c + 1} name`}
              onChange={(e) =>
                setBoard((b) => ({
                  ...b,
                  categories: b.categories.map((x, i) => (i === c ? { ...x, name: e.target.value } : x)),
                }))
              }
            />
          ))}
          {board.values.map((value, r) => (
            <div key={`row-${r}`} className="editor-row">
              <input
                className="editor-value"
                type="number"
                value={value}
                aria-label={`Row ${r + 1} value`}
                onChange={(e) =>
                  setBoard((b) => ({ ...b, values: b.values.map((v, i) => (i === r ? Number(e.target.value) : v)) }))
                }
              />
              {board.categories.map((cat, c) => {
                const clue = cat.clues[r];
                return (
                  <div key={`${c}-${r}`} className={`editor-cell ${clue.clue.trim() ? '' : 'is-blank'}`}>
                    <textarea
                      value={clue.clue}
                      placeholder="Clue"
                      rows={3}
                      aria-label={`${cat.name} ${value} clue`}
                      onChange={(e) => setClue(c, r, 'clue', e.target.value)}
                    />
                    <input
                      value={clue.answer}
                      placeholder="Answer"
                      aria-label={`${cat.name} ${value} answer`}
                      onChange={(e) => setClue(c, r, 'answer', e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </motion.section>

      <footer className="setup-footer">
        <span className="muted">
          {filled}/{total} clues written · {cols}×{rows} board · {teams.length} teams
        </span>
        <motion.button className="btn btn-primary btn-lg" whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }} onClick={proceed}>
          Continue to lobby <Icon name="next" />
        </motion.button>
      </footer>
    </div>
  );
}
