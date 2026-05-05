# Discord Poker Scheduler Bot

TypeScript Discord bot that posts a weekly native Discord poll for poker availability.

## What It Does

- Posts a poker poll every Sunday at 10:00 AM in `America/New_York`.
- Offers Monday through the following Sunday as day/date choices.
- Keeps the poll open for 48 hours.
- Allows members to pick multiple days.
- Posts a winner summary after Discord finalizes poll results.
- Provides `/poker-poll` for manual testing.
- Stores poll metadata in SQLite via Node 24's built-in `node:sqlite`.

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

8. Register the slash command:

```bash
npm run register-commands
```

9. Start the bot:

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
- `DISCORD_GUILD_ID`: server ID for registering `/poker-poll`.
- `POKER_CHANNEL_ID`: channel where polls and summaries should be posted.
- `TIMEZONE`: defaults to `America/New_York`.
- `DATABASE_PATH`: defaults to `./data/poker-bot.sqlite`.

## Cloud Hosting Notes

Use an always-on worker/service with Node 24 or newer. On Render, deploy this as a background worker with a persistent disk mounted at `/data`, and set `DATABASE_PATH=/data/poker-bot.sqlite`.

This repo includes `render.yaml` for a Render Blueprint. `DISCORD_TOKEN` is marked `sync: false`, so provide it in the Render Dashboard during Blueprint setup instead of committing it.

For Railway, this repo includes `railway.toml`. Deploy it as a long-running service, attach a volume mounted at `/data`, and set `DATABASE_PATH=/data/poker-bot.sqlite`.
