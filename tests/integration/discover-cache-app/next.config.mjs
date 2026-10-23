import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
export default {
  outputFileTracingRoot: path.resolve(here, "../../.."),
  webpack(config, { webpack }) {
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^@\/lib\/tmdb\/server$/, path.join(here, "upstream.js")));
    config.plugins.push(new webpack.NormalModuleReplacementPlugin(/^@\/features\/search\/actions$/, path.join(here, "actions.js")));
    return config;
  },
};
