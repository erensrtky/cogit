/**
 * The "In the code" part of a message's details: commit subjects split into
 * their Conventional Commits parts and file paths split into folder and name,
 * so the panel can draw each part on its own.
 */

export interface CommitSubject {
  /** `feat`, `fix`, … when the subject follows Conventional Commits. */
  type?: string;
  scope?: string;
  /** The subject marks a breaking change (`feat!: …`). */
  breaking: boolean;
  /** The description after the prefix, or the whole subject. */
  text: string;
}

const CONVENTIONAL = /^([a-z]+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

export function parseSubject(subject: string): CommitSubject {
  const match = CONVENTIONAL.exec(subject);
  if (!match) return { breaking: false, text: subject };
  const [, type, scope, bang, text] = match as unknown as [
    string,
    string,
    string | undefined,
    string | undefined,
    string,
  ];
  return { type, ...(scope ? { scope } : {}), breaking: bang === "!", text };
}

/** Lane colour index for a commit type; anything else draws neutral. */
const TYPE_COLOUR: Record<string, number> = {
  feat: 1,
  fix: 5,
  docs: 4,
  refactor: 3,
  perf: 3,
  test: 2,
};

export function typeColour(type: string): number | undefined {
  return TYPE_COLOUR[type];
}

export interface FilePath {
  /** The folder with its trailing slash, or "" at the repository root. */
  dir: string;
  name: string;
}

export function splitPath(file: string): FilePath {
  const slash = file.lastIndexOf("/");
  return slash < 0
    ? { dir: "", name: file }
    : { dir: file.slice(0, slash + 1), name: file.slice(slash + 1) };
}
