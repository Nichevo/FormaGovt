# FormaGovt

A browser game about forming a government in New Zealand after an election. Pick a party, then negotiate with the others to reach a majority while keeping your voters on side.

> FormaGovt is a game, not a prediction or an official source. Party policies, positions, people and processes are simplified and may be out of date or differ from reality. Characters are based on real public figures, but their responses in the game are invented by the game's rules. The game is not affiliated with or endorsed by any political party. For accurate information, check each party's own website and the Electoral Commission.

## Play it

Once GitHub Pages is switched on (below), the game is at **https://nichevo.github.io/FormaGovt/**. Share that link with anyone: it works in a phone or desktop browser with nothing to install.

## Status

Phases 1 to 4 of 5 are in: pick any party, then spend 10 days negotiating with the others. Each party judges your offers on its own policies, bottom lines and red lines, the whole programme you have agreed so far, and what it does to the budget. Your score combines the policies you won, your own voters' mood and the stability of the arrangement. The other big party leads a rival bloc that courts the same partners each day, pressure builds as either side nears a majority, and a graph tracks the race. Difficulty is rated for each election result by test plays. First-time players get tips as they go, the About page explains how to play and share, results show the cabinet and a policy drift compass, and you can send a challenge link, save a result image and replay past games kept in your browser.

| Phase | What it adds |
| --- | --- |
| 1. Data and seat maths | Seven parties, MMP seat calculator, poll scenarios, variance |
| 2. Core negotiation | Offers, AI responses, policy comparison |
| 3. Scoring and voters | Weighted score, voter mood, budget tracker, policy cards, MMP explainers, press conferences |
| 4. Polish and launch | Rival bloc and pressure, progress graph, tips, share and challenge links, result image, play history, drift compass, About page |
| 5. Extras | Historical scenarios, achievements, daily scenario |

## Content rules

- Real names are used only for key public figures. Every other MP is a role-named placeholder.
- No invented quotes from real people. Talks replies come from a party's "negotiating team", are templated by the game's rules, and are labelled fictional.
- Portraits, when added, are original cartoons, never traced from press photos.
- No party logos. Party names and the game's own colours only.
- Nothing may suggest a party or leader endorses the game. The disclaimer says it is not affiliated with or endorsed by any party.
- Policy cards stay accurate and link to a source. Budget figures are labelled as either the party's own costing (with a source) or a rough game estimate.
- The game shows only a notice on election day (7 November 2026, NZ time).

## Run it locally

```sh
npm install
npm run dev     # local server
npm test        # unit tests (includes a check against the official 2023 result)
npm run build   # production build into dist/
```

## Switch on GitHub Pages (one time)

1. In the repo on GitHub, open **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Every push to `main` then deploys the game automatically.

## Where the data lives

- `src/data/parties/*.json`: one file per party, with policies (weights, bottom lines and sources), key people, sign-off process and relationships. Edit these to update the game; the schema in `src/data/schema.ts` checks them on start-up and in tests.
- `src/data/polls.json`: recent polls used for the poll-average scenario.
- `src/data/electorates-2026.json`: assumed electorate winners for poll scenarios. This is a rough assumption, not a forecast.

Only each party's leaders, deputy and at most one or two other key figures appear by name. Everyone else is a placeholder named by role.
