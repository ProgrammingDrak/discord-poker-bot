import { writeFileSync } from "node:fs";
import { jobs } from "../jobs/index.js";
import { describeJob } from "../jobs/types.js";
import { describeSchedule } from "../runtime/schedule.js";

// Emits catalog.json: the machine-readable answer to "what bots exist, what do
// they do, and when do they fire".
//
// This file is committed. The organism dashboard in claude-brain reads it out of
// the local clone, so the brain can render the fleet without network access,
// GitHub credentials, or a copy of this repo's TypeScript. Regenerate with
// `npm run catalog` whenever the registry changes; CI checks it is current.

const timezone = process.env.TIMEZONE ?? "America/New_York";

const catalog = {
  repo: "effectors",
  host: "github-actions",
  timezone,
  jobs: jobs.map((job) => describeJob(job, describeSchedule(job.schedule, timezone))),
  retired: [
    {
      name: "poker-poll",
      title: "Poker Poll",
      retiredAt: "2026-08-19",
      reason: "Poker is dead. Workflows disabled, code removed, history kept in git."
    },
    {
      name: "poll-reminders",
      title: "Poker Poll Reminders",
      retiredAt: "2026-08-19",
      reason: "Retired with the poker poll."
    },
    {
      name: "poll-summaries",
      title: "Poker Poll Summaries",
      retiredAt: "2026-08-19",
      reason: "Retired with the poker poll."
    },
    {
      name: "weekend-poll",
      title: "Weekend Poll",
      retiredAt: "2026-08-19",
      reason: "One-off Friday-to-Sunday poker poll, manual dispatch only. Retired with poker."
    }
  ]
};

const json = `${JSON.stringify(catalog, null, 2)}\n`;
const target = process.argv[2] ?? "catalog.json";

if (target === "-") {
  process.stdout.write(json);
} else {
  writeFileSync(target, json);
  console.log(`wrote ${target}`);
}
