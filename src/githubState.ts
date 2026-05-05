export type GithubStatePoll = {
  messageId: string;
  channelId: string;
  weekStart: string;
  weekEnd: string;
  expectedCloseAt: string;
  summaryPostedAt: string | null;
};

export type GithubState = {
  polls: GithubStatePoll[];
};

const STATE_MARKER_START = "<!-- boredom-bot-state";
const STATE_MARKER_END = "-->";

export async function loadGithubState(): Promise<GithubState> {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repo = process.env.GITHUB_REPOSITORY?.split("/").at(1);
  const issueNumber = process.env.BOT_STATE_ISSUE_NUMBER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !issueNumber || !token) {
    return { polls: [] };
  }

  const response = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    token
  );

  if (response.status === 404) {
    return { polls: [] };
  }

  if (!response.ok) {
    throw new Error(`Failed to load GitHub state issue: ${response.status}`);
  }

  const issue = (await response.json()) as { body?: string | null };
  return parseState(issue.body ?? "");
}

export async function saveGithubState(state: GithubState): Promise<void> {
  const owner = process.env.GITHUB_REPOSITORY_OWNER;
  const repo = process.env.GITHUB_REPOSITORY?.split("/").at(1);
  const issueNumber = process.env.BOT_STATE_ISSUE_NUMBER;
  const token = process.env.GITHUB_TOKEN;

  if (!owner || !repo || !issueNumber || !token) {
    return;
  }

  const body = [
    "State for Boredom Bot. Do not edit by hand.",
    "",
    `${STATE_MARKER_START}`,
    JSON.stringify(state, null, 2),
    STATE_MARKER_END
  ].join("\n");

  const response = await githubFetch(
    `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`,
    token,
    {
      method: "PATCH",
      body: JSON.stringify({ body })
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to save GitHub state issue: ${response.status}`);
  }
}

export function parseState(body: string): GithubState {
  const start = body.indexOf(STATE_MARKER_START);
  const end = body.indexOf(STATE_MARKER_END, start);

  if (start === -1 || end === -1) {
    return { polls: [] };
  }

  const json = body.slice(start + STATE_MARKER_START.length, end).trim();
  if (!json) {
    return { polls: [] };
  }

  const parsed = JSON.parse(json) as Partial<GithubState>;
  return {
    polls: Array.isArray(parsed.polls) ? parsed.polls : []
  };
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
