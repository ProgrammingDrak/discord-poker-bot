# Discord Poker Scheduler Bot

TypeScript Discord bot that posts a weekly native Discord poll for poker availability.

## What It Does

- Posts a poker poll every Sunday at 10:00 AM in `America/New_York`.
- Offers Monday through the following Sunday as day/date choices.
- Keeps the poll open for 48 hours.
- Allows members to pick multiple days.
- Posts a winner summary after Discord finalizes poll results.
- Provides GitHub Actions manual workflow dispatch for manual testing.
- Stores poll metadata in SQLite via Node 24's built-in `node:sqlite`.

## Game Night Poll

A second, independent poll for the `quest board` channel.

- Posts every other Saturday at 2:00 PM in `America/New_York`.
- Offers the eight Wednesday-through-Saturday nights of the following two weeks.
- Adds `I can't make it` and `I can host the nights I want to play`, for exactly
  10 answers, which is Discord's per-poll maximum.
- Keeps the poll open 72 hours, closing Tuesday 2:00 PM, the day before the
  earliest candidate night.
- Allows members to pick multiple nights.

GitHub cron cannot express "every other week", so `Game Night Poll` runs weekly
and `src/gameNight.ts` drops off weeks by comparing the window start against
`GAME_NIGHT_ANCHOR_WINDOW_START`. Change that anchor to shift which week the
game night lands on. Manual `workflow_dispatch` bypasses both the Saturday
window and the cadence gate.

Requires `QUEST_BOARD_CHANNEL_ID` as an env var locally and as a repository
secret in GitHub Actions.

## Setup

1. Create a Discord application and bot in the Discord Developer Portal.
2. Invite the bot with the `bot` and `applications.commands` scopes.
3. Give it channel permissions to view the poker channel, send messages, and create polls.
4. Copy `.env.example` to `.env` and fill in the values.
5. Install dependencies:

```bash
npm install
```

6. Discover server/channel IDs after the bot is invited:

```bash
npm run discover-discord
```

7. Check the configured poker channel permissions:

```bash
npm run check-channel
```

The bot needs `View Channel`, `Send Messages`, `Read Message History`, and `Create Polls`.

8. Start the bot:

```bash
npm run build
npm start
```

For local development:

```bash
npm run dev
```

## Environment Variables

- `DISCORD_TOKEN`: bot token.
- `DISCORD_CLIENT_ID`: application/client ID.
- `DISCORD_GUILD_ID`: server ID.
- `POKER_CHANNEL_ID`: channel where poker polls and summaries should be posted.
- `QUEST_BOARD_CHANNEL_ID`: channel where the game night poll should be posted.
- `TIMEZONE`: defaults to `America/New_York`.
- `DATABASE_PATH`: defaults to `./data/poker-bot.sqlite`.
- `TASK_SECRET`: required for secure HTTP task endpoints on web hosts.
- `DISABLE_INTERNAL_SCHEDULER`: set to `true` when an external scheduler calls the HTTP task endpoints.

## Cloud Hosting Notes

Use an always-on worker/service with Node 24 or newer. On Render, deploy this as a background worker with a persistent disk mounted at `/data`, and set `DATABASE_PATH=/data/poker-bot.sqlite`.

This repo includes `render.yaml` for a Render Blueprint. `DISCORD_TOKEN` is marked `sync: false`, so provide it in the Render Dashboard during Blueprint setup instead of committing it.

For Railway, this repo includes `railway.toml`. Deploy it as a long-running service, attach a volume mounted at `/data`, and set `DATABASE_PATH=/data/poker-bot.sqlite`.

For a free Render trial run, use `render.free.yaml` or equivalent service settings with `DATABASE_PATH=/tmp/poker-bot.sqlite`. That runs the bot as a free web service with a tiny `/health` endpoint. It keeps hosting free but uses ephemeral SQLite state, so poll records can reset on service restarts.

Free Render scheduled wakeups can call:

- `POST /tasks/poker-poll` every Sunday at 10 AM ET.
- `POST /tasks/check-summaries` periodically after polls close.

Pass `Authorization: Bearer $TASK_SECRET` on both requests.
