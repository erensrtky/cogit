import { userInfo } from "node:os";
import { findGitRoot, gitUserEmail, gitUserName } from "./git.js";

/**
 * Who a session belongs to (Story 9.3): the git identity it was recorded with.
 * Like git, a person is their email when there is one, else their name. A
 * session's thoughts are its author's own; another person's session is never
 * taken for a continuation of yours.
 */
export interface Author {
  author?: string | undefined;
  authorEmail?: string | undefined;
}

/**
 * Whether two sessions were recorded by the same person. Emails decide when both
 * have one, else names; a record from before authors were stamped matches
 * anyone, since it was made before teammates' records could be told apart.
 */
export function sameAuthor(a: Author, b: Author): boolean {
  if (a.authorEmail !== undefined && b.authorEmail !== undefined)
    return a.authorEmail.toLowerCase() === b.authorEmail.toLowerCase();
  if (a.author !== undefined && b.author !== undefined) return a.author === b.author;
  return true;
}

/**
 * Who gets credited for a session (Story 9.3): the git name this repository
 * commits with, else the OS user. Recorded once, on the first write; a record
 * made on another machine keeps its own author.
 */
export async function sessionAuthor(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<string | undefined> {
  const gitRoot = await findGitRoot(root);
  const fromGit = gitRoot === undefined ? undefined : await gitUserName(gitRoot, env);
  if (fromGit !== undefined) return fromGit;
  try {
    return userInfo().username || undefined;
  } catch {
    return env.USER ?? env.USERNAME ?? undefined;
  }
}

/** The name and git email a session is credited to on this machine. */
export async function sessionIdentity(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<Author> {
  const gitRoot = await findGitRoot(root);
  const email = gitRoot === undefined ? undefined : await gitUserEmail(gitRoot, env);
  return { author: await sessionAuthor(root, env), authorEmail: email };
}

/**
 * The identity a write stamps: the record's own once it has one, so a record
 * made elsewhere keeps its author; a record that has a name but no email yet
 * (written before emails) gets this machine's email only when the names match.
 */
export function stampedIdentity(stored: Author | undefined, here: Author): Author {
  const author = stored?.author ?? here.author;
  const authorEmail =
    stored?.authorEmail ??
    (stored?.author === undefined || stored.author === here.author ? here.authorEmail : undefined);
  return {
    ...(author === undefined ? {} : { author }),
    ...(authorEmail === undefined ? {} : { authorEmail }),
  };
}
