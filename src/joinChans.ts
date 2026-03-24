import { dbojs, DBO, send, joinSocketToRoom } from "@ursamu/ursamu";
import type { IChannel, IChanEntry } from "./types.ts";

const chans = new DBO<IChannel>("server.chans");

function flagsMatch(flags: string, lock: string): boolean {
  if (!lock) return true;
  const flagSet = new Set(flags.toLowerCase().split(/\s+/).filter(Boolean));
  return lock.toLowerCase().split(/\s+/).filter(Boolean).every(l => flagSet.has(l));
}

/**
 * Subscribe a socket to channels the player is eligible for.
 * Called from the player:login gameHook — socketId comes from SessionEvent.
 *
 * Mirrors the old joinChans utility but uses joinSocketToRoom (engine export)
 * instead of ctx.socket.join.
 */
export const joinChans = async (playerId: string, socketId: string): Promise<void> => {
  const player = await dbojs.queryOne({ id: playerId });
  if (!player) return;

  const allChans = await chans.query({});

  // Join player's own room
  joinSocketToRoom(socketId, `#${playerId}`);
  if (player.location) joinSocketToRoom(socketId, `#${player.location}`);

  for (const channel of allChans) {
    if (!channel.alias) continue;
    const eligible = flagsMatch(player.flags || "", channel.lock || "");
    const userChans = (player.data?.channels || []) as IChanEntry[];

    if (eligible) {
      const existing = userChans.find((c: IChanEntry) => c.channel === channel.name);
      if (!existing) {
        // Auto-join new eligible channels
        player.data ||= {};
        player.data.channels ||= [];
        const chs = player.data.channels as IChanEntry[];
        chs.push({ id: channel.id, channel: channel.name, alias: channel.alias, active: true });
        // deno-lint-ignore no-explicit-any
        await dbojs.modify({ id: player.id }, "$set", { "data.channels": chs } as any);
        joinSocketToRoom(socketId, channel.name);
        send([socketId], `You have joined ${channel.name} with the alias '${channel.alias}'.`);
      } else if (existing.active) {
        // Re-subscribe existing active channels after reconnect
        joinSocketToRoom(socketId, channel.name);
      }
    } else {
      // Remove locked-out channels
      const existing = userChans.find((c: IChanEntry) => c.channel === channel.name);
      if (existing) {
        player.data ||= {};
        const chs = (player.data.channels || []) as IChanEntry[];
        player.data.channels = chs.filter((c: IChanEntry) => c.channel !== channel.name);
        // deno-lint-ignore no-explicit-any
        await dbojs.modify({ id: player.id }, "$set", { "data.channels": player.data.channels } as any);
        send([socketId], `You have left ${channel.name} with the alias '${channel.alias}'.`);
      }
    }
  }

  // Re-subscribe all currently active channel rooms
  const refreshedPlayer = await dbojs.queryOne({ id: playerId });
  const updatedChans = (refreshedPlayer?.data?.channels || []) as IChanEntry[];
  for (const ch of updatedChans) {
    if (ch.active) joinSocketToRoom(socketId, ch.channel);
  }
};
