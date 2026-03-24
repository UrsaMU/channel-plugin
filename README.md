# channel-plugin

> Channel system for UrsaMU — chat channels with aliases, history, and admin tools.

Extracted from the UrsaMU engine core (v1.9.27+). Provides everything needed for
a fully functional channel system: alias dispatch middleware, automatic channel
subscription on login, and in-game admin scripts.

## Requirements

- UrsaMU engine `>= 1.9.27`
- `SessionEvent.socketId` (added in v1.9.27)
- `registerCmdMiddleware` and `joinSocketToRoom` exports (added in v1.9.27)

## Commands

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `@chancreate` | `@chancreate[/hidden][/lock] <name>[=<value>]` | admin+ | Create a channel |
| `@chandestroy` | `@chandestroy <name>` | admin+ | Destroy a channel |
| `@chanset` | `@chanset <name>/<prop>=<value>` | admin+ | Modify a channel property |
| `@channel` | `@channel[/join\|/leave\|/list]` | connected | Manage subscriptions |

### Speaking on channels

Once subscribed with an alias, players can speak by prefixing their message with the alias:

```
pub Hello, world!        → [PUBLIC] Alice says, "Hello, world!"
pub :waves at everyone   → [PUBLIC] Alice waves at everyone.
pub ;'s phone rings      → [PUBLIC] Alice's phone rings.
pub on                   → Join (activate) the channel.
pub off                  → Leave (deactivate) the channel temporarily.
```

## Events

| Event | Handler action |
|-------|----------------|
| `player:login` | Subscribes the socket to all eligible channels via `joinChans` |
| `channel:message` | Emitted on every channel message (for Discord bridge etc.) |

## Storage

| Collection | Schema | Purpose |
|------------|--------|---------|
| `server.chans` | `IChannel` | Channel definitions |
| `server.chan_history` | `IChanMessage` | Message history (when logHistory=on) |

## Install

Add to your game project's `plugins.manifest.json`:

```json
{
  "plugins": [
    {
      "name": "channel-plugin",
      "repo": "https://github.com/UrsaMU/channel-plugin",
      "ref": "v1.0.0"
    }
  ]
}
```

The engine auto-discovers `src/plugins/*/index.ts` on startup. The `plugin` export
is optional — script registration runs as a module-load side effect regardless.

## Middleware note

`registerCmdMiddleware` is not reversible at runtime. If you hot-unload the plugin,
the `matchChannel` middleware remains in the pipeline until the server restarts.
The handler will simply not match (no channels remain active) but generates no errors.

## Seeding default channels

Your game's startup code can seed channels by calling the engine's DBO directly:

```typescript
import { DBO } from "jsr:@ursamu/ursamu";

const chans = new DBO("server.chans");
const existing = await chans.queryOne({ name: "public" });
if (!existing) {
  await chans.create({
    id: crypto.randomUUID(),
    name: "public",
    alias: "pub",
    header: "[PUBLIC]",
    lock: "",
    hidden: false,
  });
}
```
