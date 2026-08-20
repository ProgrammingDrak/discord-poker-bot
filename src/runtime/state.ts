import { logger } from "./logger.js";

// Durable state for every effector, stored in the body of a single GitHub issue.
//
// Why an issue and not a database: the whole point of this controller is that it
// runs on GitHub Actions with no always-on host, so it needs a store that is
// reachable from a workflow with nothing but `github.token`. The issue body is
// that store. It is also human-readable, which matters when a job misfires and
// you want to see why without attaching a debugger to a cron.
//
// Two collections:
//   - runs[]  one row per job execution that actually did something outward.
//             `dedupKey` is what makes a replayed workflow idempotent.
//   - beats[] one row per dispatcher decision (including skips), so the brain
//             can show bot health next to the other organs of the organism.
//
// `legacy` holds the retired poker bot's `polls[]` untouched. Poker is dead but
// its history is not ours to shred on a schema change.

export type EffectorRun = {
  job: string;
  dedupKey: string;
  ranAt: string;
  messageId?: string;
  channelId?: string;
  expectedCloseAt?: string | null;
  meta?: Record<string, unknown>;
};

export type EffectorBeat = {
  job: string;
  status: "posted" | "skipped" | "error";
  at: string;
  durationMs: number;
  detail: string;
};

export type EffectorsState = {
  runs: EffectorRun[];
  beats: EffectorBeat[];
  legacy: Record<string, unknown>;
};

// The issue body is capped by GitHub at 65536 characters. Trim oldest first so a
// long-lived deployment cannot wedge itself by outgrowing its own store.
const MAX_RUNS = 200;
const MAX_BEATS = 200;

const STATE_MARKER_START = "<!-- effectors-state";
const STATE_MARKER_END = "-->";

// The retired poker bot wrote its state under this marker. Read it so the
// controller inherits the existing issue instead of orphaning it.
const LEGACY_MARKER_START = "<!-- boredom-bot-state";

type GithubTarget = {
  owner: string;
  repo: string;
  issueNumber: string;
  token: string;
};

function resolveTarget(): GithubTarget | null {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repo = process.env.GITHUB_REPOSITORY?.split("/").at(1);
  const issueNumber = process.env.BOT_STATE_ISSUE_NUMBER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !issueNumber || !token) {
    return null;
  }

  return { owner, repo, issueNumber, token };
}

export function emptyState(): EffectorsState {
  return { runs: [], beats: [], legacy: {} };
}

// Off GitHub Actions (local runs, tests) there is no issue to read. Returning an
// empty state rather than throwing keeps `npm run dispatch -- --dry-run` usable
// on a laptop with only a Discord token.
export async function loadState(): Promise<EffectorsState> {
  const target = resolveTarget();
  if (!target) {
    logger.info("No GitHub state issue configured, using in-memory state");
    return emptyState();
  }

  const response = await githubFetch(issueUrl(target), target.token);

  if (response.status === 404) {
    logger.warn("GitHub state issue not found, using in-memory state", {
      issue: target.issueNumber
    });
    return emptyState();
  }

  if (!response.ok) {
    throw new Error(`Failed to load GitHub state issue: ${response.status}`);
  }

  const issue = (await response.json()) as { body?: string | null };
  return parseState(issue.body ?? "");
}

export async function saveState(state: EffectorsState): Promise<void> {
  const target = resolveTarget();
  if (!target) {
    logger.info("No GitHub state issue configured, skipping state save");
    return;
  }

  const trimmed: EffectorsState = {
    runs: state.runs.slice(-MAX_RUNS),
    beats: state.beats.slice(-MAX_BEATS),
    legacy: state.legacy
  };

  const body = [
    "State for the effectors controller. Do not edit by hand.",
    "",
    STATE_MARKER_START,
    JSON.stringify(trimmed, null, 2),
    STATE_MARKER_END
  ].join("\n");

  const response = await githubFetch(issueUrl(target), target.token, {
    method: "PATCH",
    body: JSON.stringify({ body })
  });

  if (!response.ok) {
    throw new Error(`Failed to save GitHub state issue: ${response.status}`);
  }
}

export function parseState(body: string): EffectorsState {
  const current = extractJson(body, STATE_MARKER_START);
  if (current) {
    const parsed = current as Partial<EffectorsState>;
    return {
      runs: Array.isArray(parsed.runs) ? parsed.runs : [],
      beats: Array.isArray(parsed.beats) ? parsed.beats : [],
      legacy: isRecord(parsed.legacy) ? parsed.legacy : {}
    };
  }

  // First run against an issue the poker bot owned: adopt its payload as legacy
  // so the migration is lossless and obvious in the issue body afterwards.
  const legacy = extractJson(body, LEGACY_MARKER_START);
  if (isRecord(legacy)) {
    return { runs: [], beats: [], legacy };
  }

  return emptyState();
}

export function findRun(state: EffectorsState, job: string, dedupKey: string): EffectorRun | null {
  return state.runs.find((run) => run.job === job && run.dedupKey === dedupKey) ?? null;
}

export function recordRun(state: EffectorsState, run: EffectorRun): void {
  state.runs.push(run);
}

export function recordBeat(state: EffectorsState, beat: EffectorBeat): void {
  state.beats.push(beat);
}

function extractJson(body: string, marker: string): unknown {
  const start = body.indexOf(marker);
  if (start === -1) {
    return null;
  }

  const end = body.indexOf(STATE_MARKER_END, start);
  if (end === -1) {
    return null;
  }

  const json = body.slice(start + marker.length, end).trim();
  if (!json) {
    return null;
  }

  try {
    return JSON.parse(json);
  } catch (error) {
    // A corrupt body must not be silently replaced with an empty state: that
    // would re-post every job as if it had never run. Fail loudly instead.
    throw new Error(`State issue body is not valid JSON: ${(error as Error).message}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function issueUrl(target: GithubTarget): string {
  return `https://api.github.com/repos/${target.owner}/${target.repo}/issues/${target.issueNumber}`;
}

function githubFetch(url: string, token: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      "x-github-api-version": "2022-11-28",
      ...init.headers
    }
  });
}
