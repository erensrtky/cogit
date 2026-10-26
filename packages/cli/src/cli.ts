import { createProgram } from "./program.js";
import { migrateGlobal, takeMigrationWarnings } from "./store/migrate.js";

// Silent, idempotent: a `~/.config/codelineage` from before the rename becomes `cogit`.
await migrateGlobal();
for (const line of takeMigrationWarnings()) process.stderr.write(`warning: ${line}\n`);

await createProgram().parseAsync(process.argv);
