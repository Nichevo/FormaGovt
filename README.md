# FormaGovt

A browser game about forming a government in New Zealand after an election. Pick a party, then negotiate with the others to reach a majority while keeping your voters on side.

> FormaGovt is a game, not a prediction or an official source. Party policies, positions, people and processes are simplified and may be out of date or differ from reality. Characters are based on real public figures, but their responses in the game are invented by the game's rules. The game is not affiliated with or endorsed by any political party. For accurate information, check each party's own website and the Electoral Commission.

## Play it

Once GitHub Pages is switched on (below), the game is at **https://nichevo.github.io/FormaGovt/**. Share that link with anyone: it works in a phone or desktop browser with nothing to install.

## Status

Phase 1 of 5 is in: party data, the MMP seat calculator and a Parliament view. Negotiation arrives in phase 2.

| Phase | What it adds |
| --- | --- |
| 1. Data and seat maths | Seven parties, MMP seat calculator, poll scenarios, variance |
| 2. Core negotiation | Offers, AI responses, policy comparison |
| 3. Scoring and voters | Weighted score, voter mood, budget tracker |
| 4. Polish and launch | All parties playable, rival bloc and pressure, tutorial, share links |
| 5. Extras | Historical scenarios, achievements, daily scenario |

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
