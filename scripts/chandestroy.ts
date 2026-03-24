import type { IUrsamuSDK } from "@ursamu/ursamu";

export const aliases = ["chandestroy", "@chandestroy"];

/**
 * @chandestroy <name>  — Destroy an existing channel. Admin+ only.
 *
 * Examples:
 *   @chandestroy public      Destroy the channel named "public".
 *   @chandestroy staff       Destroy the channel named "staff".
 */
export default async (u: IUrsamuSDK) => {
  const actor = u.me;

  if (!actor.flags.has("admin") && !actor.flags.has("wizard") && !actor.flags.has("superuser")) {
    u.send("Permission denied.");
    return;
  }

  const name = (u.cmd.args[0] || "").trim().toLowerCase();

  if (!name) {
    u.send("Usage: @chandestroy <name>");
    return;
  }

  const result = await u.chan.destroy(name) as { error?: string };

  if (result?.error) {
    u.send(result.error);
    return;
  }

  u.send(`Channel %ch${name}%cn has been destroyed.`);
};
