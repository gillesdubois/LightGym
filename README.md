<p align="center">
  <img src="public/icon.svg" width="88" alt="LightGym logo: an open stopwatch ring around an L">
</p>

<h1 align="center">LightGym</h1>

<p align="center">A training log that reads your notes the way you write them.</p>

<p align="center"><a href="https://lightgym.vercel.app/"><b>Open the app → lightgym.vercel.app</b></a></p>

---

Most workout apps make you pick every exercise from a built-in library. If your movement isn't there (a front lever variation, a home-made superset, an unplanned climbing session), you either fake it or give up. At the other end, a phone note accepts anything but does nothing for you during the session (rest, timers) or after it (progress, history).

LightGym sits in between. You write the way you would in a notebook:

```
Tractions +12kg 4x [5-6] : 6,5,4,4
```

The app reads the exercise name, load, number of sets, target range and your results, and highlights the sets that reach the top of the range. It never rejects a line: anything it doesn't understand is kept as a note.

<p align="center">
  <img src="docs/screenshots/semaine.png" width="220" alt="Week view: done and planned sessions, cycling and running distance">
  <img src="docs/screenshots/seance.png" width="220" alt="Session in progress: supersets, logged sets and rest timer">
  <img src="docs/screenshots/chrono.png" width="220" alt="Jump rope interval timer, 60 s work / 20 s rest">
</p>
<p align="center">
  <img src="docs/screenshots/calendrier.png" width="220" alt="Monthly calendar of sessions and activities">
  <img src="docs/screenshots/exercice.png" width="220" alt="Exercise history with its progress curve">
  <img src="docs/screenshots/import.png" width="220" alt="Notes import: preview of the recognised days">
</p>

## What it does

**During a session**
- Your program, written as plain text, suggests each day's session: blocks, supersets, targets and rest times.
- Logging a set starts the rest timer, with 3-2-1 beeps and a vibration at the end.
- A hold timer measures a plank or a front lever and fills in the value for you.
- "Bonus" blocks can be skipped with one tap when time runs short.
- The screen stays awake while you train, so you don't unlock your phone between sets.

**Around your sessions**
- Interval timers: jump rope 60/20, tabata, HIIT, EMOM, custom settings, plus a stopwatch.
- Outside activities (cycling, running, hiking, climbing, yoga…) take two taps to add, with duration, distance and pace.

**Afterwards**
- A monthly calendar shows sessions, activities and distances.
- Each exercise has its own history and curve; supersets are split into their two exercises.
- Bulk import takes weeks of notes pasted as they are, with a preview before anything is saved.
- A week exports to Markdown (Obsidian-friendly), or to a review prompt ready to paste into an AI assistant, with your context, program and progress.

## Your data stays with you

There is no account, no server and no tracking. Everything is stored in your device's browser. You can export and restore a JSON backup from Outils → Sauvegarde (Tools → Backup), which is also how you move between devices.

On iPhone or iPad, open the app in Safari, then Share → Add to Home Screen. It then opens full screen and works offline, and Safari no longer clears its data after 7 days without a visit.

## Writing your notes

There is no strict syntax, just a few markers:

```
# Semaine du 05/10

## Lun 05/10 — Upper body
* Tractions +12kg 4x [5-6] : 6,5,4,4
* Front lever one-leg 5x [8-12s] : G 12s, D 12s, G 11s, D 11s
* Pistol / Goblet squat 20kg 4x [5-6 / 8-10] : 6/10, 6/10, 5/10
Autre :
- Vélo 7 km
Note : a bit tired.

## Mar 06/10 — Cardio
- Running 3 km en 19 min
```

| Marker | Meaning |
|---|---|
| `4x` | number of sets |
| `[5-6]`, `[8-12s]` | target (reps or seconds) |
| `+12kg`, `20kg` | load |
| `6,5,4,4` | result of each set |
| `D 12s`, `G 11s` | right (droite) or left (gauche) side |
| `6/10` | superset: exercise 1 / exercise 2 |
| `Autre :` | outside activities |
| `Note :` | free text |

Dates are written day first (`05/10` is 5 October). When the year is missing, the importer picks the one that keeps the date out of the future. The app's Markdown export can be imported back as is.

## Writing your program

```
## Lundi — Pull
Bloc 1 · skill | repos 2:30
- Front lever one-leg 5x [8-12s]
Superset A · noyau | 4 tours | repos 1:30
- Strict pull-ups [8-10]
- Kettlebell swing 20 kg [15]
Superset B · bonus | 3 tours | repos 1:30
- Ring rows [10-12]
- Gorilla row KB [8-10 / arm]

## Mardi — Cardio
- Running : 3-4 km easy
```

A heading that starts with a weekday suggests that session on that day. Without a weekday, the template is available any time. `noyau` marks a core block, `bonus` an optional one, `tours` the number of rounds and `repos` the rest time. An example program loads on first launch.

## Running the project

Requires Node.js 20 or later.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # parser tests (notes and program)
npm run build    # type check and production build into dist/
```

Stack: Vite, React and TypeScript, with vite-plugin-pwa for installation and offline use. There is no backend. Parsing logic lives in `src/lib`, screens in `src/views`.

## Deploying

The app is a static site. On [Vercel](https://vercel.com), import the repository: the Vite preset is detected, with `npm run build` as the build command and `dist` as the output folder. Netlify, Cloudflare Pages or GitHub Pages work too.

## Current limits

- The interface and the note markers are in French for now. An English interface and English markers (`Mon`, `Other:`, `rest`, `rounds`) are in progress.
- There is no automatic sync between devices; the JSON backup is the way to move data.
- Progress curves only count single values. A per-side value such as `4/4` is shown but not plotted.
