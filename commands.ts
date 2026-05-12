/**
 * Register all channel-plugin scripts with the engine's script registry.
 * Scripts are resolved at runtime so they can be overridden by local copies
 * in the game project's system/scripts/ directory.
 */
import { registerScript } from "@ursamu/ursamu";
// Native @channel addCmd (format-hook aware) — supersedes scripts/channels.ts.
import "./channelListCmd.ts";

const SCRIPTS_URL = new URL("./scripts/", import.meta.url);

async function loadScript(name: string): Promise<void> {
  const url = new URL(`${name}.ts`, SCRIPTS_URL);
  let src: string;
  if (url.protocol === "file:") {
    src = await Deno.readTextFile(url.pathname);
  } else {
    const res = await fetch(url.toString());
    if (!res.ok) throw new Error(`[channel-plugin] Failed to load script: ${name}`);
    src = await res.text();
  }
  registerScript(name, src);
}

const CHANNEL_SCRIPTS = ["chancreate", "chandestroy", "chanset", "channels"];

for (const name of CHANNEL_SCRIPTS) {
  await loadScript(name).catch(e => console.error(`[channel-plugin] Script load failed (${name}):`, e));
}
