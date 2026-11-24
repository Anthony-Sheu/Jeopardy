import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Game } from './game.ts';

function setupGame() {
  let clock = 1_000_000;
  const game = new Game(() => {}, () => clock);
  const [a, b, c] = game.setup.teams;
  game.joinPlayer('sock-a', { playerId: 'pa', name: 'Alice', teamId: a.id });
  game.joinPlayer('sock-b', { playerId: 'pb', name: 'Bob', teamId: b.id });
  game.joinPlayer('sock-c', { playerId: 'pc', name: 'Cara', teamId: c.id });
  game.dispatch({ type: 'goto', phase: 'board' });
  game.dispatch({ type: 'openClue', col: 0, row: 1 }); // worth 400
  return { game, teams: { a, b, c }, tick: (ms: number) => (clock += ms) };
}

test('presses before the buzzers open are ignored', () => {
  const { game } = setupGame();
  assert.equal(game.buzz('sock-a', game.buzzer.round, 10), false);
});

test('the fastest reaction wins even if its packet arrives later', () => {
  const { game, teams, tick } = setupGame();
  game.dispatch({ type: 'openBuzzers' });
  const round = game.buzzer.round;
  tick(300);
  // Bob's press reaches the server first but he reacted in 280ms...
  assert.ok(game.buzz('sock-b', round, 280, 100));
  tick(40);
  // ...Alice is on slower Wi-Fi: she reacted in 220ms but her press arrives 40ms later.
  assert.ok(game.buzz('sock-a', round, 220, 200));
  game.flushPending();
  assert.equal(game.buzzer.status, 'answering');
  assert.deepEqual(
    game.buzzer.queue.map((e) => e.teamId),
    [teams.a.id, teams.b.id],
  );
});

test('impossibly fast reported reactions are clamped to what the server observed', () => {
  const { game, tick } = setupGame();
  game.dispatch({ type: 'openBuzzers' });
  tick(500);
  game.buzz('sock-a', game.buzzer.round, 1, 50); // claims 1ms with a 50ms round trip
  game.flushPending();
  // earliest plausible = 500 - 50 - 60 margin = 390
  assert.equal(game.buzzer.queue[0].reactionMs, 390);
});

test('stale presses from an earlier round are rejected', () => {
  const { game } = setupGame();
  game.dispatch({ type: 'openBuzzers' });
  const oldRound = game.buzzer.round;
  game.dispatch({ type: 'openBuzzers' });
  assert.equal(game.buzz('sock-a', oldRound, 100), false);
});

test('correct, half and wrong answers score and move the game along', () => {
  const { game, teams, tick } = setupGame();
  game.dispatch({ type: 'openBuzzers' });
  const round = game.buzzer.round;
  tick(200);
  game.buzz('sock-a', round, 150);
  game.buzz('sock-b', round, 180);
  game.flushPending();

  game.dispatch({ type: 'judge', teamId: teams.a.id, result: 'wrong' });
  assert.equal(game.scores[teams.a.id], -400);
  assert.equal(game.buzzer.queue[0].teamId, teams.b.id, 'next team in line gets the floor');
  assert.deepEqual(game.buzzer.lockedOut, [teams.a.id]);

  game.dispatch({ type: 'judge', teamId: teams.b.id, result: 'half' });
  assert.equal(game.scores[teams.b.id], 200);
  assert.equal(game.buzzer.status, 'locked');
  assert.equal(game.current?.revealed, true);

  game.dispatch({ type: 'undoScore' });
  assert.equal(game.scores[teams.b.id], 0);
});

test('a wrong answer with nobody waiting reopens the buzzers for the other teams', () => {
  const { game, teams, tick } = setupGame();
  game.dispatch({ type: 'openBuzzers' });
  const first = game.buzzer.round;
  tick(100);
  game.buzz('sock-a', first, 90);
  game.flushPending();
  game.dispatch({ type: 'judge', teamId: teams.a.id, result: 'wrong' });
  assert.equal(game.buzzer.status, 'open');
  assert.ok(game.buzzer.round > first);
  assert.equal(game.buzz('sock-a', game.buzzer.round, 10), false, 'locked-out team cannot buzz again');
  assert.equal(game.buzz('sock-c', game.buzzer.round, 10), true);
});

test('teammates share one place in line', () => {
  const { game, teams, tick } = setupGame();
  game.joinPlayer('sock-a2', { playerId: 'pa2', name: 'Ann', teamId: teams.a.id });
  game.dispatch({ type: 'openBuzzers' });
  const round = game.buzzer.round;
  tick(300);
  game.buzz('sock-a', round, 260);
  game.buzz('sock-a2', round, 210);
  game.flushPending();
  assert.equal(game.buzzer.queue.length, 1);
  assert.equal(game.buzzer.queue[0].playerName, 'Ann');
});

test('resizing the board keeps scores and existing clues', () => {
  const { game, teams } = setupGame();
  game.dispatch({ type: 'closeClue', markUsed: true });
  game.dispatch({ type: 'adjustScore', teamId: teams.a.id, delta: 500 });
  game.dispatch({ type: 'goto', phase: 'setup' });
  const setup = structuredClone(game.setup);
  setup.board.categories = setup.board.categories.slice(0, 3);
  setup.board.values = setup.board.values.slice(0, 4);
  game.dispatch({ type: 'saveSetup', setup });
  assert.equal(game.used.length, 3);
  assert.equal(game.used[0].length, 4);
  assert.equal(game.used[0][1], true);
  assert.equal(game.scores[teams.a.id], 500);
});
