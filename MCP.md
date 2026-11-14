# Eufy RoboVac MCP setup

This local STDIO server exposes generic tools for an Eufy RoboVac. It opens no
HTTP ports and does not require a hosted service. Each controller process reads
the device ID and local key from the project's `.env`. Your account password is
not needed or stored in the MCP configuration.

Tool names do not depend on your vacuum's nickname. Use whichever name you prefer
when speaking to your assistant.

## Register with Codex

Install dependencies and configure `.env` as described in [README.md](README.md).
With Codex CLI installed, run from the project root:

```sh
codex mcp add eufy-robovac -- "$(command -v node)" "$PWD/src/mcp-server.mjs"
```

Reload the server connection in your MCP client. If it does not appear, restart
the client. On macOS, enable the client under **System Settings → Privacy &
Security → Local Network**. Terminal needs its own permission for CLI tests.

Then ask: **“How much battery does my vacuum have?”** The assistant should call
`robovac_get_battery` and report a fresh reading.

For other STDIO-compatible clients, configure:

- **Command:** the absolute path to your Node.js executable.
- **Arguments:** the absolute path to `src/mcp-server.mjs` in this checkout.
- **Working directory:** optional; the controller resolves `.env` from the project.
- **Environment credentials:** none needed when using the project's `.env`.

Use absolute paths so startup does not depend on the client's current directory.
If you move the checkout, update its registered path.

## Available tools

| Tool | Behavior |
| --- | --- |
| `robovac_get_capabilities` | List features, tested model and limitations without connecting to hardware |
| `robovac_get_status` | Fetch current battery, activity, mode, speed and error information |
| `robovac_get_battery` | Fetch a fresh battery percentage |
| `robovac_start_cleaning` | Start automatic cleaning |
| `robovac_pause` | Pause; interrupt a manual movement from this server first |
| `robovac_return_to_base` | Request a return to the charging base; does not confirm arrival |
| `robovac_locate` | Activate the audible locator; does not return a physical position |
| `robovac_set_speed` | Set `level` to `standard`, `boost`, `max` or `off` |
| `robovac_set_mode` | Set `mode` to `auto`, `spot`, `edge` or `small-room`; may start movement |
| `robovac_move` | Move in a `direction` for `durationMs`, then attempt to pause |
| `robovac_check_connection` | Connect and disconnect without moving the vacuum |
| `robovac_discover` | Find the IP for the configured device ID; does not retrieve credentials |

Manual directions are `forward`, `backward`, `left` and `right`. Movement duration
must be an integer from 100 to 5000 ms. Suction `off` does not pause the wheels.
Firmware support varies; RoboVac 35C is the tested model, not a guarantee of
compatibility with every Eufy vacuum.

The server includes tool descriptions and instructions so assistants can map
natural language to these actions. Requests to send the vacuum to sleep, rest or
recharge map to returning to its base. No hardware sleep command is implemented.

## Execution and cancellation

The server accepts one active hardware operation at a time. It rejects additional
commands instead of queuing stale actions. Pause and return-to-base requests
cancel the active operation first. MCP cancellation and connection closure also
stop the controller process; a manual movement attempts to pause before exiting.

No command response guarantees that a physical action has finished. Read-only
tools are marked as such; movement tools are not marked idempotent because
repeating a timed movement changes the result. If Wi-Fi fails, a pause command
may not reach the vacuum: use its physical button when needed.

## Routes and positioning

No routes or shapes are predefined. This API provides no maps, current position,
odometry, distance measurement or room recognition. Future routes would need a
known starting position, orientation and calibration. Timed movement cannot
recover its location after encountering an obstacle or slipping on a different
surface.

## Diagnostics

```sh
npm run check
npm test
npm run mcp:check
npm run mcp:check -- --battery
```

`mcp:check` performs an actual STDIO handshake and lists tools without touching
hardware. `--battery` adds a real read-only battery request. The MCP test client
is a development dependency installed by `npm ci`.

`npm run mcp` starts a STDIO server waiting for an MCP client. It is not an
interactive terminal menu. Child controller output is kept separate from the
MCP protocol, and errors do not disclose credentials.

If tools are listed but hardware requests fail, check network reachability,
local network permissions, device credentials and Tuya 3.3 compatibility. A
successful command from Terminal does not prove that another application has
permission to access the same LAN device.

Inspect or remove the registration with:

```sh
codex mcp get eufy-robovac
codex mcp remove eufy-robovac
```

## References

- [MCP in Codex](https://learn.chatgpt.com/docs/extend/mcp?surface=app)
- [Official MCP TypeScript SDK](https://ts.sdk.modelcontextprotocol.io/v2/get-started/first-server)
- [Local network permissions on macOS](https://support.apple.com/en-gb/guide/mac-help/mchla4f49138/mac)
