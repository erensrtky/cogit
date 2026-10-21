/**
 * The built template is embedded into the CLI bundle as text by tsup's loader
 * (see `tsup.config.ts`), so `codelineage build` needs no asset files next to
 * `dist/cli.js`.
 */
import templateHtml from "../../../template/dist/index.html";

export const TEMPLATE_HTML: string = templateHtml;
