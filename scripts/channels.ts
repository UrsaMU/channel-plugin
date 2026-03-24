import type { IUrsamuSDK } from "@ursamu/ursamu";

export const aliases = ["channel"];

/**
 * @channel[/join|/leave|/list]  — Manage your channel subscriptions.
 *
 * Switches:
 *   /join   Join a channel and assign an alias to speak on it.
 *   /leave  Leave a channel by alias.
 *   /list   List all available channels (default).
 *
 * Examples:
 *   @channel/join public=pub    Join "public" with alias "pub".
 *   @channel/leave pub          Leave the channel with alias "pub".
 *   @channel/list               List all available channels.
 *   @channel                    Same as @channel/list.
 */
export default async (u: IUrsamuSDK) => {
  const switchArg = (u.cmd.switches?.[0] || u.cmd.name.split("/")[1] || "").toLowerCase();

  switch (switchArg) {
    case "join": {
      const arg = (u.cmd.args[0] || "").trim();
      if (!arg) {
        u.send("Usage: @channel/join <channel>=<alias>");
        return;
      }
      const eqIdx = arg.indexOf("=");
      if (eqIdx < 0) {
        u.send("Usage: @channel/join <channel>=<alias>");
        return;
      }
      const chan = arg.slice(0, eqIdx).trim();
      const alias = arg.slice(eqIdx + 1).trim();
      if (!chan || !alias) {
        u.send("Usage: @channel/join <channel>=<alias>");
        return;
      }
      await u.chan.join(chan, alias);
      u.send(`You have joined channel ${chan} with alias ${alias}.`);
      break;
    }
    case "leave": {
      const alias = (u.cmd.args[0] || "").trim();
      if (!alias) {
        u.send("Usage: @channel/leave <alias>");
        return;
      }
      await u.chan.leave(alias);
      u.send(`You have left the channel with alias ${alias}.`);
      break;
    }
    case "list":
    default: {
      const list = await u.chan.list() as { name: string; alias?: string; header?: string }[];
      if (!list.length) {
        u.send("No channels are currently available.");
        return;
      }
      u.send("%ch--- Channels ---%cn");
      for (const ch of list) {
        const header = ch.header ? ` ${ch.header}` : "";
        u.send(`  %ch${ch.name}%cn${header}`);
      }
      u.send("---");
      break;
    }
  }
};
