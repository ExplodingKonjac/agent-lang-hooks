import path from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenCodePlugin } from "../scripts/common/opencode_adapter.mjs";

const pluginRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const pluginName = path.basename(pluginRoot);

export const LanguageHookPlugin = createOpenCodePlugin({
  pluginName,
  postEditScriptUrl: new URL("../scripts/post_edit_hook.mjs", import.meta.url),
  stopScriptUrl: new URL("../scripts/stop_hook.mjs", import.meta.url),
});

export default LanguageHookPlugin;
