// Outils système communs (Windows, macOS, Linux).
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WIN = process.platform === "win32";

// Sous Windows la commande s'appelle souvent « python », ailleurs « python3 ».
export const PYTHON = process.env.PYTHON || (WIN ? "python" : "python3");
export const HYPERFRAMES = path.join(ROOT, "node_modules", ".bin", WIN ? "hyperframes.cmd" : "hyperframes");

export function spawn(cmd, args, opts = {}) {
  // Les .cmd de Windows ne se lancent qu'à travers le shell.
  const shell = WIN && cmd.endsWith(".cmd");
  const quoted = shell ? args.map((a) => (/[\s"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a)) : args;
  return spawnSync(shell ? `"${cmd}"` : cmd, quoted, { cwd: ROOT, encoding: "utf8", shell, ...opts });
}
