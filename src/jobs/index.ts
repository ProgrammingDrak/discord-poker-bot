import { Job } from "./types.js";
import { gameNightPoll } from "./gameNightPoll.js";

// The fleet. Adding an effector means writing one module and adding one line
// here. No new workflow, no new secret plumbing, no new cadence logic.
//
// Retired: the poker poll, its Tuesday/Wednesday reminders, its winner
// summaries, and the one-off weekend poll all lived here until 2026-08-19.
// Poker is dead; see git history and the state issue's `legacy` block.
export const jobs: Job[] = [gameNightPoll];

export function findJob(name: string): Job | null {
  return jobs.find((job) => job.name === name) ?? null;
}

export function jobNames(): string[] {
  return jobs.map((job) => job.name);
}
