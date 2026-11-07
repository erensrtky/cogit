import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { findGitRoot } from "../git.js";
import { CliError, type Io } from "../io.js";
import { isSharing } from "../record-sync.js";
import { projectPaths } from "../store/paths.js";

/**
 * The GitHub Action `cogit pr --install-action` writes. On every pull request
 * from this repository it runs `cogit pr` against the target branch and keeps
 * one comment with the result, edited on each push; the description stays the
 * author's. A fork's record stays in the fork, so its pull requests are skipped,
 * and a branch with no recorded thought gets no comment.
 */
export const PR_ACTION_WORKFLOW = `# Written by \`cogit pr --install-action\`. On each pull request it posts the
# decisions behind the branch as one comment and updates it on every push.
# Delete this file to stop it.
name: cogit
on:
  pull_request:
    types: [opened, synchronize, reopened]
permissions:
  contents: read
  pull-requests: write
jobs:
  describe:
    # A fork's session record stays in the fork, so there is nothing to read here.
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: \${{ github.event.pull_request.head.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - name: Describe the branch
        env:
          BASE: \${{ github.base_ref }}
        run: npx --yes @cogit/cli@1 pr "origin/$BASE" > cogit-pr.md
      - name: Post or update the comment
        env:
          GH_TOKEN: \${{ github.token }}
          PR: \${{ github.event.pull_request.number }}
        run: |
          # No recorded thought behind these commits: say nothing.
          grep -q '^### ' cogit-pr.md || exit 0
          { echo '<!-- cogit-pr -->'; cat cogit-pr.md; } > body.md
          id=$(gh api "repos/$GITHUB_REPOSITORY/issues/$PR/comments" --paginate \\
            --jq '.[] | select(.body | startswith("<!-- cogit-pr -->")) | .id' | head -n 1)
          if [ -n "$id" ]; then
            gh api -X PATCH "repos/$GITHUB_REPOSITORY/issues/comments/$id" -F body=@body.md > /dev/null
          else
            gh pr comment "$PR" --repo "$GITHUB_REPOSITORY" --body-file body.md
          fi
`;

const WORKFLOW_PATH = join(".github", "workflows", "cogit.yml");

/**
 * Writes the workflow into the repository. It reads the record from the remote,
 * so a project that keeps its record on this machine is refused with the command
 * that changes it; a file already there is left alone. Committing it stays with
 * the user, as with any file in their repository.
 */
export async function installPrAction(root: string, io: Io): Promise<void> {
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined) throw new CliError("not in a git repository");
  if (!(await isSharing(root)))
    throw new CliError(
      "the Action reads the session records from the remote, but this project keeps them here; share them first with `cogit config git share`",
    );
  const file = join(gitRoot, WORKFLOW_PATH);
  if (existsSync(file)) {
    const same = (await readFile(file, "utf8")) === PR_ACTION_WORKFLOW;
    io.out(
      same
        ? `${WORKFLOW_PATH} is already there.`
        : `${WORKFLOW_PATH} already exists and was left as it is; delete it to write cogit's.`,
    );
    return;
  }
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, PR_ACTION_WORKFLOW);
  const shown = relative(process.cwd(), file) || WORKFLOW_PATH;
  io.out(`Wrote ${shown}.`);
  io.out(
    "Commit and push it: each pull request from this repository then gets the decisions behind it as one comment, updated on every push.",
  );
}

/**
 * The one-time pointer to the Action after a `cogit pr` by a person: only in a
 * project that shares its record and has no workflow yet, and once per clone.
 * Returns the line to show, or nothing.
 */
export async function prActionHint(root: string): Promise<string | undefined> {
  const marker = projectPaths(root).actionHint;
  if (existsSync(marker)) return undefined;
  const gitRoot = await findGitRoot(root);
  if (gitRoot === undefined || existsSync(join(gitRoot, WORKFLOW_PATH))) return undefined;
  if (!(await isSharing(root))) return undefined;
  await mkdir(dirname(marker), { recursive: true });
  await writeFile(marker, "");
  return "tip: to post this on every pull request automatically, run `cogit pr --install-action`";
}
