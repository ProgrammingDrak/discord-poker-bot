# effectors

The organism's outward-acting organ: scheduled bots and automations that do
something to the world on a clock, with no one present.

The brain (`claude-brain/`) learns and remembers. Sweep Suite decides what Drake
should do. The Daily Command Center is the surface he touches. This repo is the
part that **acts outward on a schedule**: it posts the polls, sends the messages,
pokes the APIs.

## Why one repo instead of one repo per bot

Every bot needs the same five things: config loading, a Discord client that knows
the REST quirks, timezone-correct schedule gating, dedup so a replayed run does
not double-post, and somewhere durable to write state. Writing those five again
per bot is the actual waste, not the repo count.

Here they are written once, in `src/runtime/`. An effector is one module in
`src/jobs/` plus one line in the registry. No new workflow, no new secret, no new
cron, no new cadence math.

## The fleet

`catalog.json` is generated from the registry and is the machine-readable
answer to "what exists". `npm run dispatch -- --list` prints the same thing.

| Job | Schedule | Channel |
|---|---|---|
| `game-night-poll` | every 2 weeks, Saturday 2 PM ET | `QUEST_BOARD_CHANNEL_ID` |

Retired effectors stay listed in `catalog.json` under `retired` so the organism
dashboard can show what used to run and when it stopped. The poker poll, its
reminders, its summaries, and the one-off weekend poll were all retired
2026-08-19. Their code is in git history; their posting history is preserved in
the state issue under `legacy`.

## How it runs

One workflow, `.github/workflows/effectors.yml`, wakes hourly at :17 and runs the
dispatcher. The dispatcher decides what is due. GitHub Actions rather than an
always-on host because a poll must fire whether or not a laptop is awake, which
is also why this cannot be a step in the nightly heartbeat.

Three properties that matter and are easy to regress:

- **The hour is a lower bound, not a match.** GitHub cron drifts 15-60+ minutes.
  A job due "Saturday 2 PM" fires on the first hourly wake-up at or after 2 PM.
- **Dedup is what makes that safe.** Every job computes a `dedupKey` before it
  runs. One key, one post, however many times the workflow fires.
- **Cadence is anchored, not counted.** `everyNWeeks` measures whole weeks from a
  fixed anchor date, so a skipped or replayed run cannot shift the rhythm, and
  DST and year boundaries do not either.

The workflow uses a `concurrency` group because the state store is a
read-modify-write on one GitHub issue and two overlapping runs would lose a write.

## Adding an effector

1. Write `src/jobs/<name>.ts` exporting a `Job`: metadata, a `schedule`, a
   `dedupKey`, and a `run` that posts through the injected `poster`.
2. Add it to the array in `src/jobs/index.ts`.
3. Add its channel id to the `EFFECTOR_CHANNELS` repository secret (one JSON
   object of `ENV_NAME` to channel id), so no workflow edit is needed.
4. `npm run catalog` to regenerate `catalog.json`. CI fails if you forget.
5. `npm test`, then dry-run it: `npm run dispatch -- --job <name> --force --dry-run`.

`run` receives a `poster`, never a raw client, which is what lets the tests
assert on the exact payload without touching Discord.

## Commands

```bash
npm run dispatch                 # everything due right now
npm run dispatch -- --list       # the registry, without running anything
npm run dispatch -- --job game-night-poll --force --dry-run
npm run dispatch -- --now 2026-08-08T14:00:00 --dry-run   # reproducible schedule tests
npm run doctor                   # every job's channel + bot permissions
npm run discover                 # print guild and channel ids
npm run catalog                  # regenerate catalog.json
npm test
npm run build                    # typecheck
```

`--dry-run` prints the exact payload and writes no state. `--now` makes schedule
decisions reproducible, which is the only sane way to test a biweekly gate
without waiting two weeks.

## State

Durable state lives in the body of one GitHub issue (`BOT_STATE_ISSUE_NUMBER`),
because a workflow can reach it with nothing but `github.token` and a human can
read it without a database client. Two collections:

- `runs[]` one row per outward action, keyed by job + `dedupKey`. This is what
  makes replays idempotent.
- `beats[]` one row per dispatcher decision including skips, so "off week,
  working as intended" is distinguishable from "silently broken". This is what
  the organism dashboard reads.

Both are trimmed to the last 200 entries; the issue body caps at 65536 chars.

## Environment

| Variable | Purpose |
|---|---|
| `DISCORD_TOKEN` | bot token |
| `DISCORD_GUILD_ID` | server id, used by `doctor` |
| `EFFECTOR_CHANNELS` | JSON object of `ENV_NAME` to channel id (how Actions supplies channels) |
| `<JOB>_CHANNEL_ID` | per-job channel, wins over the blob (how `.env` supplies them) |
| `TIMEZONE` | defaults to `America/New_York` |
| `GITHUB_TOKEN`, `BOT_STATE_ISSUE_NUMBER` | durable state; without them state is in-memory |
| `ENFORCE_SCHEDULE=false` | run regardless of schedule, same as `--force` |
| `EFFECTORS_DRY_RUN=true` | same as `--dry-run` |

Secrets live in GitHub Actions and a local `.env`, never in the repo.

## Where this sits in the workspace

Registered at `claude-brain/repos/effectors.md`. The organism dashboard
(`claude-brain/scripts/build_organism_dashboard.py`) reads `catalog.json` out of
the local clone to render the fleet, so the brain describes the bots without
needing network access or a copy of this TypeScript.
