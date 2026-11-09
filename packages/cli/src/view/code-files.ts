import type { ViewFile } from "./model.js";

/**
 * Without a code graph to say which files are code, the files a project
 * rarely decides anything in, by name: lockfiles, config, dotfiles, version
 * and licence files, and dependency or build folders.
 */
export function isNoiseFile(path: string): boolean {
  const name = path.split("/").pop() ?? path;
  return (
    /(^|\/)(node_modules|dist|build|out|coverage|vendor)\//.test(path) ||
    path.split("/").some((part) => part.startsWith(".")) ||
    /\.(json|jsonc|ya?ml|toml|ini|lock|env|cfg|conf)$/i.test(name) ||
    /^(VERSION|LICEN[CS]E(\..*)?|package-lock\.json|yarn\.lock|pnpm-lock\.yaml)$/i.test(name)
  );
}

/**
 * The files the Graph view offers: the ones the code graph has as code, or,
 * without a graph, every file that is not noise by name.
 */
export function graphFiles(
  files: readonly ViewFile[],
  codeFiles: readonly string[] | undefined,
): ViewFile[] {
  if (codeFiles === undefined) return files.filter((file) => !isNoiseFile(file.path));
  const code = new Set(codeFiles);
  return files.filter((file) => code.has(file.path));
}
