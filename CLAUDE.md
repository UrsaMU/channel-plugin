# channel-plugin — Claude Code Instructions

## Project identity

External UrsaMU plugin: chat channels with aliases, headers, locks,
hidden flag, history logging, and per-player join state. Targets
ursamu **^2.3.0**.

- **Ecosystem skill**: load `/ursamu-dev` before working here.
- **API reference**: `/Users/kumakun/.claude/skills/ursamu-dev/references/api-reference.md`
  is authoritative for every type, method, import path, and event payload.
  Read it before writing code. Never guess signatures.

---

## Commands

```bash
deno task check    # type-check entry (index.ts)
deno task lint     # must be clean
deno task test     # full suite
```

## Pre-commit checklist (all must pass)

```bash
deno check --unstable-kv index.ts
deno lint
deno test --allow-all --unstable-kv --no-check tests/
```

---

## Repo layout

```
index.ts                Plugin entry (Phase 1 import + IPlugin export)
commands.ts             Script-registry loader + native addCmd wiring
channelListCmd.ts       Native `@channel` addCmd — format-hook aware
scripts/                Sandbox scripts (chancreate / chandestroy / chanset / channels)
src/matchChannel.ts     Channel-talk middleware (alias parser + broadcast)
src/joinChans.ts        player:login auto-subscribe
src/types.ts            IChannel / IChanEntry / IChanMessage
tests/                  Deno test files
```

---

## Imports

```typescript
import {
  addCmd, dbojs, DBO, gameHooks, send, joinSocketToRoom,
  registerCmdMiddleware, registerScript,
  resolveFormat, type FormatSlot,
  registerFormatHandler, unregisterFormatHandler,
} from "@ursamu/ursamu";
import type {
  ICmd, IPlugin, IDBObj, IUrsamuSDK, SessionEvent,
} from "@ursamu/ursamu";
```

DBO namespace rule: collection names prefixed with `server.` (e.g.
`server.chans`, `server.chan_history`) — preserved from the engine's
original channel module for backward compatibility.

---

## Format hooks (v2.3+)

The `@channel/list` listing supports two slots resolved via `resolveFormat`:

| Slot | `%0` value | Effect |
|------|------------|--------|
| `CHANNELLISTFORMAT` | Default rendered block | Full list override |
| `CHANNELROWFORMAT`  | Default rendered row   | Per-channel row override |

Two-tier lookup (mirrors WHO/PS): `#0` (game-wide) → enactor (`u.me`) →
plugin handler → built-in default.

Helper (in `channelListCmd.ts`):

```typescript
async function resolveGlobalFormat(u, slot, defaultArg) {
  const root = await dbojs.queryOne({ id: "0" });
  if (root) {
    const onRoot = await resolveFormat(u, root as IDBObj, slot as FormatSlot, defaultArg);
    if (onRoot != null) return onRoot;
  }
  return await resolveFormat(u, u.me, slot as FormatSlot, defaultArg);
}
```

Cast plugin-defined slot names as `slot as FormatSlot` — they are not in
the core union but `resolveFormat` accepts any string at runtime.

---

## Key SDK idioms

```typescript
// Strip MUSH codes BEFORE DB ops or length checks (always)
const clean = u.util.stripSubs(u.cmd.args[0]).trim();

// DB writes — op must be "$set" | "$inc" | "$unset" only
await chans.modify({ name }, "$set", { hidden: true });

// Target resolution — always guard
const target = await u.util.target(u.me, raw, true);
if (!target) { u.send("Not found."); return; }
```

---

## MUSH color codes

| Code | Effect | Code | Effect |
|------|--------|------|--------|
| `%ch` | Bold | `%cn` | Reset (close every open code) |
| `%cr` | Red | `%cg` | Green |
| `%cb` | Blue | `%cy` | Yellow |
| `%cw` | White | `%cc` | Cyan |
| `%r`  | Newline | `%t` | Tab |

---

## Plugin lifecycle (three phases — non-negotiable)

```
Phase 1 — module load   import "./commands.ts" → addCmd() + registerScript() fire at load time
Phase 2 — init()        attach gameHooks listeners, registerCmdMiddleware → return true
Phase 3 — remove()      detach hooks with the SAME named function reference
```

Pair every `gameHooks.on(evt, fn)` in `init()` with `gameHooks.off(evt, fn)`
in `remove()` using the same named reference. `registerCmdMiddleware` is
not reversible — note in remove().

---

## Test patterns

Required boilerplate for tests that touch service layer:

```typescript
const OPTS = { sanitizeResources: false, sanitizeOps: false };
Deno.test("desc", OPTS, async () => { /* ... */ });
```

Format-hook integration tests follow ursamu's
`tests/look_formats_integration.test.ts` — real `softcodeService` + `dbojs`,
numeric ids so softcode dbref resolution works. Required cases:

- no attrs → default rendering preserved
- `@channellistformat` set → block override wins
- `@channelrowformat` set → per-row override
- two-tier: `#0` attr wins over enactor attr
- plugin handler runs when no attr is set

Close DB in the last test: `await DBO.close()`.

---

## Code style (non-negotiable)

- Early return over nested conditions.
- No function longer than 50 lines.
- No file longer than 200 lines.
- No bare `catch` — always `catch (e: unknown)`.
- Library-first.
- Max nesting depth 3.

---

## Audit checklist

- [ ] `u.util.stripSubs()` on user strings before DB ops or length checks
- [ ] DB writes use `$set` / `$inc` / `$unset`
- [ ] `u.util.target()` results null-checked
- [ ] All `%c*` codes closed with `%cn`
- [ ] Every `addCmd` has `help:` with syntax + ≥2 examples
- [ ] `gameHooks.on()` paired with matching `gameHooks.off()`
- [ ] DBO namespace prefixed (`server.*` for channel collections)
- [ ] `init()` returns `true`
- [ ] Format-hook calls use `resolveGlobalFormat` two-tier helper

---

## PRs and commits

- No Claude/AI attribution in PR titles, commit messages, or code comments.
- Squash-merge feature PRs.
- Tag versions after merge: `git tag v<version> && git push --tags`.
