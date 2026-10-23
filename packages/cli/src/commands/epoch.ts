import { CliError, type Io } from "../io.js";
import { Slug } from "../schema/common.js";
import { resolveProjectRoot } from "../store/root.js";
import { loadProject, updateProject } from "../store/stores.js";

export async function epochAdd(dir: string, id: string, title: string, io: Io): Promise<void> {
  const { root } = await resolveProjectRoot(dir);
  if (!Slug.safeParse(id).success) {
    throw new CliError(`invalid epoch id "${id}": use letters, digits, _ . -`);
  }
  const project = await loadProject(root);
  if (!project.found)
    throw new CliError(`${root} is not initialized; run \`codelineage init\` first`);
  if (!project.ok) throw new CliError(project.error);

  let added = false;
  await updateProject(root, (cur) => {
    const p = cur ?? project.data;
    const same = p.epochs.find((e) => e.id === id);
    if (same) {
      if (same.title !== title) {
        throw new CliError(`epoch "${id}" already exists with title "${same.title}"`);
      }
      return p;
    }
    added = true;
    return { ...p, epochs: [...p.epochs, { id, title, createdAt: io.now() }] };
  });
  io.out(added ? `Added epoch ${id}: ${title}` : `Epoch ${id} already exists`);
}
