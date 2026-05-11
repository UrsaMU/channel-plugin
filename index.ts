/**
 * @ursamu/channel-plugin
 *
 * Extracts the channel system from the UrsaMU engine into a standalone plugin.
 * Provides: matchChannel middleware, joinChans on login, and channel admin scripts.
 *
 * Requires engine >= 1.9.27 (SessionEvent.socketId, registerCmdMiddleware, joinSocketToRoom).
 */

import "./commands.ts"; // Phase 1 — register scripts at module load time

import {
  gameHooks,
  registerCmdMiddleware,
  type IPlugin,
  type SessionEvent,
} from "@ursamu/ursamu";

import { matchChannel } from "./src/matchChannel.ts";
import { joinChans } from "./src/joinChans.ts";

// Named handler references — required for remove() to mirror init()
const onLogin = async ({ actorId, socketId }: SessionEvent): Promise<void> => {
  if (!socketId) return; // pre-1.9.27 engine — skip
  await joinChans(actorId, socketId).catch(
    (e: unknown) => console.error("[channel-plugin] joinChans error:", e)
  );
};

const channelMiddleware = async (
  ctx: Parameters<typeof matchChannel>[0],
  next: () => Promise<void>
): Promise<void> => {
  if (await matchChannel(ctx)) return;
  await next();
};

export const plugin: IPlugin = {
  name: "channel-plugin",
  version: "2.3.0",
  description: "Channel system for UrsaMU — chat channels with aliases, history, admin tools, and format hooks.",

  init: () => {
    gameHooks.on("player:login", onLogin);
    registerCmdMiddleware(channelMiddleware);
    console.log("[channel-plugin] Initialized.");
    return true;
  },

  remove: () => {
    gameHooks.off("player:login", onLogin);
    // Note: registerCmdMiddleware is not reversible — restart required to remove middleware.
    console.log("[channel-plugin] Removed. Restart the server to fully unload middleware.");
  },
};
