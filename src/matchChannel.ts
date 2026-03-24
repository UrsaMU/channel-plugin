import type { IContext } from "@ursamu/ursamu";
import { dbojs, DBO, send, gameHooks } from "@ursamu/ursamu";
import type { IChannel, IChanEntry, IChanMessage } from "./types.ts";

const chans = new DBO<IChannel>("server.chans");
const chanHistory = new DBO<IChanMessage>("server.chan_history");

function moniker(obj: { data?: Record<string, unknown>; id: string }): string {
  return (obj.data?.moniker as string) || (obj.data?.name as string) || obj.id;
}

function flagsMatch(flags: string, lock: string): boolean {
  if (!lock) return true;
  const flagSet = new Set(flags.toLowerCase().split(/\s+/).filter(Boolean));
  return lock.toLowerCase().split(/\s+/).filter(Boolean).every(l => flagSet.has(l));
}

/** Broadcast a message to every socket currently in the channel room. */
function chanSend(chanName: string, header: string, text: string): void {
  send([chanName], `${header} ${text}`, {});
}

export const matchChannel = async (ctx: IContext): Promise<boolean> => {
  if (!ctx.socket.cid) return false;

  const en = await dbojs.queryOne({ id: ctx.socket.cid });
  if (!en) return false;

  const parts = ctx.msg?.split(" ") || [];
  const trig = parts[0];
  let msg = parts.slice(1).join(" ").trim();
  const match = msg?.match(/^(:|;)?(.*)$/i);
  if (!match) return false;

  if (!en.data?.channels) return false;

  const userChans = en.data.channels as IChanEntry[];
  const channel = userChans.find((c: IChanEntry) => c.alias === trig);
  if (!channel) return false;

  const chan = await chans.queryOne({ name: channel.channel });
  if (!chan) return false;

  if (!flagsMatch(en.flags || "", chan.lock || "")) return false;

  const displayName = channel.mask ?? moniker(en);
  const titlePrefix = channel.title ? channel.title + " " : "";

  if (match[1] === ":") {
    msg = `${titlePrefix}${displayName} ${match[2]}`;
  } else if (match[1] === ";") {
    msg = `${titlePrefix}${displayName}${match[2]}`;
  } else if (msg.toLowerCase() === "on" && channel.active === false) {
    channel.active = true;
    ctx.socket.join(channel.channel);
    // deno-lint-ignore no-explicit-any
    await dbojs.modify({ id: en.id }, "$set", en as any);
    chanSend(channel.channel, chan.header, `${displayName} has joined the channel.`);
    send([ctx.socket.id], `You have joined channel ${channel.channel}.`, {});
    return true;
  } else if (msg.toLowerCase() === "off" && channel.active === true) {
    chanSend(channel.channel, chan.header, `${displayName} has left the channel.`);
    channel.active = false;
    ctx.socket.leave(channel.channel);
    // deno-lint-ignore no-explicit-any
    await dbojs.modify({ id: en.id }, "$set", en as any);
    send([ctx.socket.id], `You have left channel ${channel.channel}.`, {});
    return true;
  } else {
    msg = `${titlePrefix}${displayName} says, "${msg}"`;
  }

  if (!channel.active) return false;

  chanSend(chan.name, chan.header, msg);

  const chanPayload = {
    channelName: chan.name,
    senderId:    en.id,
    senderName:  moniker(en),
    message:     msg,
  };
  gameHooks.emit("channel:message", chanPayload).catch(
    (e: unknown) => console.error("[channel-plugin] channel:message:", e)
  );

  // Persist message if logging is enabled
  if (chan.logHistory) {
    const limit = chan.historyLimit ?? 500;
    const id = crypto.randomUUID();
    await chanHistory.create({
      id,
      chanId: chan.id,
      chanName: chan.name,
      playerId: en.id,
      playerName: moniker(en),
      message: msg,
      timestamp: Date.now(),
    });

    const all = await chanHistory.find({ chanId: chan.id });
    all.sort((a: IChanMessage, b: IChanMessage) => a.timestamp - b.timestamp);
    if (all.length > limit) {
      const toDelete = all.slice(0, all.length - limit);
      for (const entry of toDelete) {
        await chanHistory.delete({ id: entry.id });
      }
    }
  }

  return true;
};
