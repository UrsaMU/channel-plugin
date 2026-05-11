/**
 * Integration test: @channellistformat / @channelrowformat hooks on the
 * channel list output.
 *
 * Uses real `dbojs` from jsr:@ursamu/ursamu and the plugin-handler registry
 * (registerFormatHandler) — both are publicly exported from the JSR package.
 * The softcode-attribute path is exercised through a mocked `u.attr.get`
 * supplied on the test SDK (resolveFormat falls back to plugin handlers when
 * `u.attr` is missing).
 *
 * %0 is the default rendered string (block or row) produced by channelList.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  dbojs,
  DBO,
  registerFormatHandler,
  unregisterFormatHandler,
  type FormatHandler,
  type FormatSlot,
  type IDBObj,
  type IUrsamuSDK,
} from "@ursamu/ursamu";
import { channelList } from "../channelListCmd.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const SLOW = { timeout: 15000 };

const ROOT = "0";        // game-wide skin
const ACTOR = "920001";

interface IChanListEntry {
  name: string;
  alias?: string;
  header?: string;
  hidden?: boolean;
}

async function cleanup() {
  for (const id of [ROOT, ACTOR]) {
    await dbojs.delete({ id }).catch(() => {});
  }
}

async function seed(opts: { rootAttrs?: Record<string, string> } = {}) {
  await cleanup();
  const attributes = Object.entries(opts.rootAttrs ?? {}).map(([name, value]) => ({
    name, value, setter: ACTOR, type: "attribute",
  }));
  await dbojs.create({
    id: ROOT,
    flags: "room",
    data: { name: "Root", attributes },
  });
  await dbojs.create({
    id: ACTOR,
    flags: "player connected",
    data: { name: "Alice" },
  });
}

const SAMPLE_CHANS: IChanListEntry[] = [
  { name: "public", alias: "pub", header: "[PUB]" },
  { name: "staff",  alias: "st",  header: "[STAFF]" },
];

/** Build a minimal IUrsamuSDK with a stubbed u.chan.list. */
function mockU(
  opts: { attrGet?: (id: string, name: string) => string | null } = {},
): IUrsamuSDK & { _sent: string[] } {
  const sent: string[] = [];
  const me = {
    id: ACTOR,
    name: "Alice",
    flags: new Set(["player", "connected"]),
    state: { name: "Alice" },
    location: "",
    contents: [],
  } as unknown as IDBObj;

  const u = {
    me,
    socketId: "chan-fmt-sock",
    send: (m: string) => { sent.push(m); },
    chan: {
      list: () => Promise.resolve(SAMPLE_CHANS),
    },
    util: {
      stripSubs: (s: string) => s,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
    attr: opts.attrGet
      ? { get: (id: string, name: string) => Promise.resolve(opts.attrGet!(id, name)) }
      : undefined,
  } as unknown as IUrsamuSDK & { _sent: string[] };

  (u as unknown as { _sent: string[] })._sent = sent;
  return u;
}

Deno.test("channel: no attrs, no handler — default rendering", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const u = mockU();
  await channelList(u);
  const out = u._sent.join("\n");
  assertStringIncludes(out, "--- Channels ---");
  assertStringIncludes(out, "public");
  assertStringIncludes(out, "[PUB]");
  assertStringIncludes(out, "staff");
  assertStringIncludes(out, "[STAFF]");
  await cleanup();
});

Deno.test("channel: CHANNELLISTFORMAT plugin handler replaces the whole block", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const handler: FormatHandler = (_u, _t, defaultBlock) => `<<BLOCK>>\n${defaultBlock}\n<</BLOCK>>`;
  registerFormatHandler("CHANNELLISTFORMAT" as FormatSlot, handler);
  try {
    const u = mockU();
    await channelList(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "<<BLOCK>>");
    assertStringIncludes(out, "<</BLOCK>>");
    // Per-line sends are suppressed when block override fires; exactly one send.
    assertEquals(u._sent.length, 1);
  } finally {
    unregisterFormatHandler("CHANNELLISTFORMAT" as FormatSlot, handler);
    await cleanup();
  }
});

Deno.test("channel: CHANNELROWFORMAT plugin handler replaces each row", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const handler: FormatHandler = (_u, _t, row) => `ROW>${row}<ROW`;
  registerFormatHandler("CHANNELROWFORMAT" as FormatSlot, handler);
  try {
    const u = mockU();
    await channelList(u);
    const out = u._sent.join("\n");
    const matches = out.match(/ROW>/g) ?? [];
    assertEquals(matches.length, 2);
    assertStringIncludes(out, "public");
    assertStringIncludes(out, "staff");
  } finally {
    unregisterFormatHandler("CHANNELROWFORMAT" as FormatSlot, handler);
    await cleanup();
  }
});

Deno.test("channel: two-tier — #0 attr wins over enactor attr", { ...OPTS, ...SLOW }, async () => {
  await seed();
  // Use a plugin handler that records the target id order — resolveFormat
  // calls plugin handlers after the (missing) softcode step, so the order
  // of calls reflects two-tier ordering.
  const u = mockU({
    attrGet: () => null,  // no softcode attrs; force fall-through
  });
  const seen: string[] = [];
  const handler: FormatHandler = (_u, target, _arg) => { seen.push(target.id); return null; };
  registerFormatHandler("CHANNELLISTFORMAT" as FormatSlot, handler);
  try {
    await channelList(u);
    assertEquals(seen[0], ROOT, "should consult #0 first");
    assertEquals(seen[1], ACTOR, "then fall through to enactor");
  } finally {
    unregisterFormatHandler("CHANNELLISTFORMAT" as FormatSlot, handler);
    await cleanup();
  }
});

Deno.test("channel: plugin handler fallback runs when no attr is set", { ...OPTS, ...SLOW }, async () => {
  await seed();
  const handler: FormatHandler = (_u, _t, defaultBlock) => `HANDLER:${defaultBlock.split("\n")[0]}`;
  registerFormatHandler("CHANNELLISTFORMAT" as FormatSlot, handler);
  try {
    const u = mockU();  // no attr.get → handler is the only override path
    await channelList(u);
    const out = u._sent.join("\n");
    assertStringIncludes(out, "HANDLER:");
  } finally {
    unregisterFormatHandler("CHANNELLISTFORMAT" as FormatSlot, handler);
    await cleanup();
    await DBO.close();
  }
});
