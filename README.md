# Jeopardy

A fully customizable Jeopardy game built with React. Your laptop runs the game and shows the board, and everyone else uses their phone as a buzzer over the same Wi-Fi. There's nothing to install on the phones: players scan a QR code and pick a team.

## Features

- **Any board size**: 1–12 columns (categories), 1–10 rows, 1–12 teams, with your own point values, team names and colors
- **Phone buzzers** over your local network, with fair "who pressed first" detection (see [How buzzing works](#how-buzzing-works))
- **Full, half or negative points** for any team, plus manual score adjustments and undo
- **Animated transitions**: the board fills in tile by tile, clues zoom out of their tile, scores count up, and there's a results podium at the end
- **Board editor** with import/export to JSON, so you can save and share games
- **Survives refreshes and restarts**: the game is saved to `data/game.json` as you play
- Sample board included, so you can play straight away

## Quick start

You need [Node.js](https://nodejs.org) 20.19 or newer (the current LTS is recommended).

```bash
npm install
npm start
```

`npm start` builds the app, starts the server and opens the host screen in your browser. The terminal also prints the address players should use:

```
  Host screen (this laptop):  http://localhost:3000/host
  Players join on phones at:  http://192.168.1.23:3000
```

On Windows, the first time you run it you'll see a **Windows Defender Firewall** prompt for Node.js. Tick **Private networks** and click **Allow**, or phones won't be able to connect.

## Playing a game

1. **Setup**: pick the number of columns, rows and teams, name your teams, and write your categories, clues and answers (or keep the sample board). Everything saves automatically.
2. **Lobby**: put the host screen on a TV or projector. Players connect to the same Wi-Fi, scan the QR code (or type the address), enter their name and pick a team. Late arrivals can join any time from the **Join** button on the board.
3. **Board**: click a tile to open a clue. Read it out, then press **Space** to open the buzzers.
4. **Buzz**: the first team to buzz in gets the floor, and the host screen shows everyone's order and how far behind they were. Pressing before the buzzers open locks that phone out for a quarter of a second, like the real show.
5. **Score**: use **✓** for full points, **½** for half points or **✗** for a wrong answer. A wrong answer locks that team out and hands the floor to the next team in line, or reopens the buzzers for everyone else.
6. **Results**: when the board is cleared (or whenever you click **Results**), the final scores appear. **Play again** resets the scores and puts every clue back on the board.

Click a team's score at the bottom of the board to add or subtract any amount. Right-click a played tile to put it back on the board.

### Host keyboard shortcuts (while a clue is open)

| Key   | Action                                  |
| ----- | --------------------------------------- |
| Space | Open the buzzers                        |
| C     | Correct, full points for the team up    |
| H     | Half points for the team up             |
| W     | Wrong answer for the team up            |
| A     | Reveal or hide the answer               |
| Esc   | Back to the board (marks the clue done) |

### Rules you can change

- **Buzzers open** when you press Space, or automatically a few seconds after the clue appears
- **Wrong answers lose points** on or off
- **Early-buzz lockout** on or off
- **Value prefix**: `$` by default, or anything else (leave it empty for plain points)

## How buzzing works

Wi-Fi adds a different delay for every phone, so "whichever message reached the laptop first" isn't fair. Instead, each phone measures its own reaction time: how long after *it* saw the buzzers open the player pressed. That cancels out network delay in both directions.

The server waits 150 ms after the first press for any others, then ranks them by reaction time. It also checks every reported time against what it saw itself (time since opening, minus that phone's measured round trip), so a phone can't claim an impossibly fast press. Teammates share one place in line: whoever on the team was fastest.

## Troubleshooting

**Phones can't load the page**

- Make sure the phones and the laptop are on the **same Wi-Fi** network (not a guest network, and phones not on mobile data).
- On Windows, set the Wi-Fi network to **Private**: Settings → Network & internet → Wi-Fi → your network → Network profile type → Private.
- Allow Node.js through the firewall: Windows Security → Firewall & network protection → Allow an app through firewall → tick **Private** for Node.js.
- If the laptop has several network adapters (VPN, WSL, virtual machines), the QR code might point at the wrong one. Open **Join** on the host screen and click **Try another address**. Turning off a VPN also helps.
- Some public, office or hotel networks block devices from talking to each other. Use a phone hotspot or your laptop's Mobile Hotspot instead.

**"Port 3000 is already in use"**: another copy of the game is running. Close it, or pick another port: `set PORT=3001 && npm start` (Command Prompt), `$env:PORT=3001; npm start` (PowerShell) or `PORT=3001 npm start` (macOS/Linux).

**"This is the host screen" on a phone**: the host screen only works on the computer running the game, so players can't take over. Players should use the join address. If you really want to run the host screen from another device, start the server with `npm start -- --allow-remote-host`.

**Starting over**: `npm start -- --fresh` ignores the saved game. You can also delete the `data` folder.

## Development

```bash
npm run dev        # server + Vite with hot reload (players use port 5173)
npm run typecheck  # TypeScript
npm test           # game engine tests
npm run build      # production build into dist/
npm run serve      # serve an existing build without rebuilding
```

Other server flags: `--no-open` (don't open a browser), `--fresh`, `--allow-remote-host`.

### Project layout

```
server/   Express + Socket.IO server and the game engine (state, scoring, buzzer ranking)
shared/   Types, defaults and setup validation used by both server and client
src/
  host/     Host screen: setup, lobby, board, clue, results
  player/   Phone screen: join and buzzer
  components/, lib/, styles/
```

## Contributing

`main` is protected: changes go through a pull request that passes CI and is approved by a code owner. Create a branch, push it, and open a PR.
