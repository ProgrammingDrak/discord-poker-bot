import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type PollSource = "manual" | "scheduled";

export type StoredPoll = {
  messageId: string;
  channelId: string;
  weekStart: string;
  weekEnd: string;
  expectedCloseAt: string;
  summaryPostedAt: string | null;
  source: PollSource;
  createdAt: string;
};

type StoredPollRow = {
  message_id: string;
  channel_id: string;
  week_start: string;
  week_end: string;
  expected_close_at: string;
  summary_posted_at: string | null;
  source: PollSource;
  created_at: string;
};

export class PollStore {
  private readonly db: DatabaseSync;

  constructor(databasePath: string) {
    fs.mkdirSync(path.dirname(databasePath), { recursive: true });
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS polls (
        message_id TEXT PRIMARY KEY,
        channel_id TEXT NOT NULL,
        week_start TEXT NOT NULL,
        week_end TEXT NOT NULL,
        expected_close_at TEXT NOT NULL,
        summary_posted_at TEXT,
        source TEXT NOT NULL CHECK (source IN ('manual', 'scheduled')),
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_polls_pending_summary
        ON polls(summary_posted_at, expected_close_at);

      CREATE INDEX IF NOT EXISTS idx_polls_scheduled_week
        ON polls(source, week_start);
    `);
  }

  recordPoll(poll: StoredPoll): void {
    this.db
      .prepare(`
        INSERT INTO polls (
          message_id,
          channel_id,
          week_start,
          week_end,
          expected_close_at,
          summary_posted_at,
          source,
          created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        poll.messageId,
        poll.channelId,
        poll.weekStart,
        poll.weekEnd,
        poll.expectedCloseAt,
        poll.summaryPostedAt,
        poll.source,
        poll.createdAt
      );
  }

  findScheduledPollForWeek(weekStart: string): StoredPoll | null {
    const row = this.db
      .prepare("SELECT * FROM polls WHERE source = 'scheduled' AND week_start = ? LIMIT 1")
      .get(weekStart) as StoredPollRow | undefined;

    return row ? mapPoll(row) : null;
  }

  listPollsDueForSummary(nowISO: string): StoredPoll[] {
    const rows = this.db
      .prepare(`
        SELECT *
        FROM polls
        WHERE summary_posted_at IS NULL
          AND expected_close_at <= ?
        ORDER BY expected_close_at ASC
      `)
      .all(nowISO) as StoredPollRow[];

    return rows.map(mapPoll);
  }

  markSummaryPosted(messageId: string, postedAtISO: string): void {
    this.db
      .prepare("UPDATE polls SET summary_posted_at = ? WHERE message_id = ?")
      .run(postedAtISO, messageId);
  }

  close(): void {
    this.db.close();
  }
}

function mapPoll(row: StoredPollRow): StoredPoll {
  return {
    messageId: row.message_id,
    channelId: row.channel_id,
    weekStart: row.week_start,
    weekEnd: row.week_end,
    expectedCloseAt: row.expected_close_at,
    summaryPostedAt: row.summary_posted_at,
    source: row.source,
    createdAt: row.created_at
  };
}
