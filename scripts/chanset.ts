import type { IUrsamuSDK } from "@ursamu/ursamu";

export const aliases = ["chanset", "@chanset"];

/**
 * @chanset <name>/<property>=<value>  — Modify a channel's properties. Admin+ only.
 *
 * Properties:
 *   header        Channel header prefix shown on all messages (e.g. [PUB]).
 *   lock          Flag lock expression — only matching players may speak.
 *   hidden        on/off — hide from public channel list.
 *   masking       on/off — allow players to set custom display names.
 *   log           on/off — persist message history.
 *   historyLimit  Number (1–5000) — max messages to retain.
 *
 * Examples:
 *   @chanset public/header=[PUB]        Set the header to [PUB].
 *   @chanset public/lock=player+        Require player flag or above.
 *   @chanset staff/hidden=on            Hide "staff" from the channel list.
 *   @chanset public/log=on              Enable message logging.
 *   @chanset public/historyLimit=200    Keep last 200 messages.
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const input = (u.cmd.args[0] || "").trim();
  const match = input.match(/^([^/]+)\/(\w+)\s*=\s*(.*)$/);

  if (!match) {
    u.send("Usage: @chanset <name>/<property>=<value>");
    u.send("  Properties: header, lock, hidden, masking, log, historyLimit");
    return;
  }

  const chanName = match[1].trim().toLowerCase();
  const property = match[2].trim().toLowerCase();
  const value = match[3].trim();

  if (!actor.flags.has("superuser")) {
    const allChans = await u.chan.list() as { name: string; owner?: string }[];
    const chanObj = allChans.find(c => c.name === chanName);
    if (chanObj && chanObj.owner !== `#${actor.id}` && chanObj.owner !== actor.id) {
      u.send("Permission denied. Only the channel owner or a superuser may modify this channel.");
      return;
    }
  }

  const options: {
    header?: string; lock?: string; hidden?: boolean;
    masking?: boolean; logHistory?: boolean; historyLimit?: number;
  } = {};

  switch (property) {
    case "header":      options.header = value; break;
    case "lock":        options.lock = value; break;
    case "hidden":      options.hidden = ["on","yes","1"].includes(value.toLowerCase()); break;
    case "masking":     options.masking = ["on","yes","1"].includes(value.toLowerCase()); break;
    case "log":
    case "loghistory":  options.logHistory = ["on","yes","1"].includes(value.toLowerCase()); break;
    case "historylimit": {
      const n = parseInt(value);
      if (isNaN(n) || n < 1 || n > 5000) {
        u.send("historyLimit must be a number between 1 and 5000.");
        return;
      }
      options.historyLimit = n;
      break;
    }
    default:
      u.send(`Unknown property: ${property}. Valid: header, lock, hidden, masking, log, historyLimit`);
      return;
  }

  const result = await u.chan.set(chanName, options) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  u.send(`Channel %ch${chanName}%cn: ${property} set to "${value}".`);
};
