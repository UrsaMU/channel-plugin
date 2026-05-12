/**
 * Native @channel command — channel admin/listing for players.
 *
 * Supersedes the legacy sandbox script `scripts/channels.ts` (which remains
 * registered for backward compatibility — the engine's command dispatch
 * order checks native `addCmd` before sandbox scripts, so this wins).
 *
 * Adds two format-hook slots resolved through `resolveFormat`:
 *   - CHANNELLISTFORMAT — full block override (%0 = default rendered block)
 *   - CHANNELROWFORMAT  — per-row override (%0 = default rendered row)
 */
import {
  addCmd,
  dbojs,
  resolveFormat,
  type FormatSlot,
} from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

/**
 * Two-tier format lookup: check `#0` (game-wide skin) first, then the
 * enactor (`u.me`) for a per-player skin. Returns null if neither yields
 * an override. Mirrors the WHO/PS pattern in ursamu core.
 */
async function resolveGlobalFormat(
  u: IUrsamuSDK,
  slot: string,
  defaultArg: string,
): Promise<string | null> {
  const root = await dbojs.queryOne({ id: "0" });
  if (root) {
    const rootObj = root as unknown as IDBObj;
    const onRoot = await resolveFormat(u, rootObj, slot as FormatSlot, defaultArg);
    if (onRoot != null) return onRoot;
  }
  return await resolveFormat(u, u.me, slot as FormatSlot, defaultArg);
}

interface IChanListEntry {
  name: string;
  alias?: string;
  header?: string;
  hidden?: boolean;
}

/** Render a single channel row in the default style. */
function renderRow(ch: IChanListEntry): string {
  const header = ch.header ? ` ${ch.header}` : "";
  return `  %ch${ch.name}%cn${header}`;
}

/** Render and emit the channel list, with format-hook support. */
export async function channelList(u: IUrsamuSDK): Promise<void> {
  const raw = await u.chan.list() as IChanListEntry[];
  const list = (raw ?? []).filter((c) => !c.hidden);
  if (!list.length) {
    u.send("No channels are currently available.");
    return;
  }

  // Build per-row renderings with optional CHANNELROWFORMAT override.
  const rows: string[] = [];
  for (const ch of list) {
    const defaultRow = renderRow(ch);
    const rowOverride = await resolveGlobalFormat(u, "CHANNELROWFORMAT", defaultRow);
    rows.push(rowOverride != null ? rowOverride : defaultRow);
  }

  const header = "%ch--- Channels ---%cn";
  const footer = "---";
  const lines: string[] = [header, ...rows, footer];
  const defaultBlock = lines.join("\n");

  const blockOverride = await resolveGlobalFormat(u, "CHANNELLISTFORMAT", defaultBlock);
  if (blockOverride != null) {
    u.send(blockOverride);
    return;
  }

  for (const line of lines) u.send(line);
}

addCmd({
  name: "@channel",
  pattern: /^@?channel(?:\/(\S+))?\s*(.*)/i,
  lock: "connected",
  category: "Communication",
  help: `@channel[/<switch>] [<args>]  — Manage your channel subscriptions.

Switches:
  /join     Join a channel and assign an alias to speak on it.
  /leave    Leave a channel by alias.
  /list     List all available channels (default).

Format hooks: set @channellistformat / @channelrowformat on #0 (game-wide)
or self.
  @channellistformat: %0 = default rendered channel list block.
  @channelrowformat:  %0 = default rendered channel row.

Examples:
  @channel                    List all available channels.
  @channel/list               Same as @channel.
  @channel/join public=pub    Join "public" with alias "pub".
  @channel/leave pub          Leave the channel with alias "pub".`,

  exec: async (u: IUrsamuSDK) => {
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const arg = (u.cmd.args[1] ?? "").trim();

    if (sw === "join") {
      if (!arg) { u.send("Usage: @channel/join <channel>=<alias>"); return; }
      const eq = arg.indexOf("=");
      if (eq < 0) { u.send("Usage: @channel/join <channel>=<alias>"); return; }
      const chan = u.util.stripSubs(arg.slice(0, eq)).trim();
      const alias = u.util.stripSubs(arg.slice(eq + 1)).trim();
      if (!chan || !alias) { u.send("Usage: @channel/join <channel>=<alias>"); return; }
      await u.chan.join(chan, alias);
      u.send(`You have joined channel ${chan} with alias ${alias}.`);
      return;
    }

    if (sw === "leave") {
      const alias = u.util.stripSubs(arg).trim();
      if (!alias) { u.send("Usage: @channel/leave <alias>"); return; }
      await u.chan.leave(alias);
      u.send(`You have left the channel with alias ${alias}.`);
      return;
    }

    // default: /list (or empty)
    await channelList(u);
  },
});
