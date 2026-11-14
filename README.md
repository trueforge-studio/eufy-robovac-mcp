# Eufy RoboVac MCP

A local MCP server and command-line controller for Eufy RoboVac vacuums using
Tuya 3.3. Tested with the **RoboVac 35C**. This is an independent community
project, not affiliated with Eufy or Anker.

Ask an MCP-enabled assistant to check your vacuum's battery, start cleaning,
pause, return to its charging base or change suction speed. You can use any
name for your vacuum in conversation; the server and tools use generic names.

## Requirements

- Node.js 22 or later and npm.
- A compatible vacuum already paired with the official Eufy app.
- Your vacuum's Tuya device ID and 16-character local key.
- Local network access between your computer and vacuum.

Support for other models and firmware versions is not guaranteed. The library
uses fixed DPS identifiers and Tuya 3.3; it does not implement Tuya 3.4 or 3.5.

## Installation

```sh
git clone https://github.com/trueforge-studio/eufy-robovac-mcp.git
cd eufy-robovac-mcp
npm ci
cp .env.example .env
chmod 600 .env
```

Edit `.env` on your own computer:

| Variable | Value |
| --- | --- |
| `EUFY_DEVICE_ID` | Your vacuum's Tuya device ID, not its display name or necessarily its serial number |
| `EUFY_LOCAL_KEY` | Its 16-character ASCII local key, not your Eufy or Wi-Fi password |
| `EUFY_IP` | Optional vacuum IPv4 address, available from your router |
| `EUFY_TIMEOUT_SECONDS` | Discovery timeout from 1 to 60 seconds; default: 10 |

The controller loads `.env` from the project root. Existing shell environment
variables take precedence. The file is excluded from Git but remains plain text:
keep it private and never attach it to an issue or paste credentials into a chat.

## Obtaining device credentials

First verify that your vacuum works in the official EufyHome/eufy Clean app.
This project's discovery command only finds the IP of a known device ID. It
requires the ID and key because the underlying library constructor requires them;
it cannot retrieve a local key or identify an unknown vacuum.

The [upstream Homebridge configuration guide](https://github.com/apexad/homebridge-eufy-robovac#configuration)
points to [eufy-clean-local-key-grabber](https://github.com/Rjevski/eufy-clean-local-key-grabber).
That separate tool is unmaintained, and its authentication method may not work
with current accounts or services. Review its documentation before using it.
It is not bundled or run by this project. If you already have a working local
integration, you may be able to reuse its current device ID and key.

The MCP server does not need your Eufy email or password. Once configured, it
uses the local key for LAN control. Pairing and credential retrieval may still
require Eufy's cloud services. Re-pairing can change the local key.

## Connect an MCP client

See [MCP.md](MCP.md) for setup, tool names and troubleshooting. With Codex CLI
installed, run this from the project root:

```sh
codex mcp add eufy-robovac -- "$(command -v node)" "$PWD/src/mcp-server.mjs"
```

Reload the MCP connection or restart your client. On macOS, allow the client
under **System Settings → Privacy & Security → Local Network**.

Example requests:

- “How much battery does my vacuum have?”
- “Start cleaning.”
- “Pause the vacuum.”
- “Send it back to its charging base.”
- “Set suction to standard.”

Sending a command does not confirm that the physical action has finished.

## Command-line usage

Start with commands that do not move the vacuum:

```sh
npm start -- help
npm start -- discover
npm start -- connect
npm start -- status
```

`discover` searches by the configured device ID, even when `EUFY_IP` is set.
It does not save the result automatically. Set `EUFY_IP` to skip discovery on
later commands. `status` reports the fields the vacuum provides: battery,
activity, mode, suction speed, errors and play/pause state.

Actions:

```sh
npm start -- start
npm start -- pause
npm start -- home
npm start -- locate
npm start -- speed standard
npm start -- speed boost
npm start -- speed max
npm start -- speed off
npm start -- mode auto
npm start -- mode spot
npm start -- mode edge
npm start -- mode small-room
```

`start`, `home` and cleaning modes can move the vacuum. `locate` activates its
audible locator. Suction `off` does not stop the wheels. Some functions may
behave differently or be unavailable depending on firmware. Each command
disconnects when it finishes. Its total time limit is the configured discovery
timeout plus 15 seconds. After a timeout, check the vacuum before retrying.

For a brief, supervised manual movement:

```sh
npm run move -- forward 500
```

Directions are `forward`, `backward`, `left` and `right`. The duration must be
100–5000 milliseconds. The controller attempts to pause before and after moving;
Ctrl+C also attempts to pause. A failed network connection can prevent stopping,
so use the physical button if needed. Timing does not measure distance or angle.

## Network and protocol limitations

The RoboVac 35C uses 2.4 GHz Wi-Fi. Your computer can use Ethernet or 5 GHz if the
router allows both devices to communicate. Discovery listens on UDP 6666/6667
and normally requires the same local network segment. Control uses TCP 6668.
Guest networks, client isolation, VLANs, VPNs and firewalls can block access.
Do not expose these ports to the Internet.

With an explicit IP, the library attempts Tuya 3.3 directly. Without an IP,
discovery checks the advertised protocol and rejects a different version.
The project does not provide cloud control, pairing, firmware updates, maps,
position tracking, odometry or room recognition. No routes or shapes are saved.
Room routes would require future design and calibration from a known position;
timed movements cannot correct their position after encountering obstacles.

If connection fails, check the official app, power, current IP and local network
permissions. Close other controllers if they compete for the connection. A DHCP
reservation helps keep the vacuum's IP stable.

## Development and verification

```sh
npm run check
npm test
npm run mcp:check
npm run mcp:check -- --battery
npm audit
```

Tests cover command mapping, discovery failures, credential-safe output, timed
movement, cancellation, concurrency and the real MCP STDIO handshake. They use
simulated hardware and do not move a vacuum. The optional `--battery` check
makes a real read-only request. The test client is a development dependency;
install with `npm ci` to use it.

The controller uses `eufy-robovac` 1.4.6. Its `pause()` method incorrectly writes
`true` to DPS 2, so this project calls `setPlayPause(false)` instead. Discovery
is explicit because the library's `doWork()` catches discovery failures and
continues. The installed library is not modified. A `debug` dependency override
avoids a known vulnerability in the old transitive version.

## References

- [Upstream eufy-robovac library](https://github.com/apexad/eufy-robovac)
- [Eufy Wi-Fi compatible models](https://service.eufy.com/article-description/Which-RoboVac-models-support-WiFi-app)
- [Community model reference including 35C/T2117](https://github.com/bostonmhauer/eufy_vacuum)
