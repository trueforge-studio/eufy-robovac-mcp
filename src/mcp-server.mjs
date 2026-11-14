#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';
import { z } from 'zod';
import { pathToFileURL } from 'node:url';
import runnerModule from './robot-runner.js';

const { createRunner } = runnerModule;
const empty = z.object({}).strict();
const instructions = `Control the user's Eufy RoboVac through its local Tuya connection.
Requests to send the vacuum to sleep, rest or recharge mean returning to its charging base.
Always fetch a fresh reading before reporting battery level or status.
Only start movement or cleaning when the user requests it.
Sending a command does not confirm that the physical action has finished.
Manual movement is timed; you do not know the vacuum's position, distance or room.
There are no saved routes or default shapes. Do not invent routes to rooms.
Never request or disclose the local key or the Eufy account password.`;

const annotations = readOnly => ({ readOnlyHint: readOnly, destructiveHint: false,
  idempotentHint: readOnly, openWorldHint: false });
const capabilities = {
  device: 'Eufy RoboVac (Tuya 3.3)',
  testedModel: 'Eufy RoboVac 35C',
  testedFeatures: ['status', 'battery level', 'start cleaning', 'pause', 'manual movement'],
  otherLibraryFeatures: ['return to base', 'audible locator', 'suction speed',
    'auto/spot/edge/small-room modes', 'discovery by device ID', 'connection check'],
  manualDirections: ['forward', 'backward', 'left', 'right'],
  savedRoutes: [],
  limitations: ['This API provides no maps, position, distance or angle measurements.',
    'Timed movement from 100 to 5000 ms; durations do not represent metres.',
    'Room routes would require design and calibration from a known starting position.',
    'Network pausing requires a connection; use the physical button if disconnected.'],
};

export function toolDefinitions(runner) {
  const control = (args, context) => runner.run('control', args, { signal: context?.signal });
  return [
    { name: 'robovac_get_capabilities', title: 'Vacuum capabilities',
      description: 'List available local-control features, tested functionality and limitations. Does not connect to the vacuum.',
      schema: empty, readOnly: true, run: async () => capabilities },
    { name: 'robovac_get_status', title: 'Get vacuum status',
      description: 'Read the current battery level, state, mode, speed, error and cleaning activity. Does not move the vacuum.',
      schema: empty, readOnly: true, run: async (_, context) => ({
        ...await control(['status'], context), consultedAt: new Date().toISOString(),
      }) },
    { name: 'robovac_get_battery', title: 'Get battery level',
      description: 'Fetch a fresh battery percentage. Do not present a previous reading as current.',
      schema: empty, readOnly: true, run: async (_, context) => {
        const status = await control(['status'], context);
        if (!Number.isFinite(status.battery) || status.battery < 0 || status.battery > 100) {
          throw new Error('Battery level is unavailable.');
        }
        return { batteryPercent: status.battery, status: status.status, consultedAt: new Date().toISOString() };
      } },
    { name: 'robovac_start_cleaning', title: 'Start cleaning',
      description: 'Start automatic cleaning. Moves the vacuum; use when the user requests cleaning or vacuuming.',
      schema: empty, readOnly: false, run: (_, context) => control(['start'], context) },
    { name: 'robovac_pause', title: 'Pause the vacuum',
      description: 'Request a pause. Interrupts a manual movement started by this MCP before sending the command. Does not return to base.',
      schema: empty, readOnly: false, run: (_, context) => control(['pause'], context) },
    { name: 'robovac_return_to_base', title: 'Return to charging base',
      description: 'Send the vacuum to its charging base. Use for requests to sleep, rest, recharge or return to base. Does not confirm arrival.',
      schema: empty, readOnly: false, run: (_, context) => control(['home'], context) },
    { name: 'robovac_locate', title: 'Find the vacuum by sound',
      description: 'Activate the audible locator. Does not return a position or map.',
      schema: empty, readOnly: false, run: (_, context) => control(['locate'], context) },
    { name: 'robovac_set_speed', title: 'Set suction speed',
      description: 'Set suction speed. off means no suction; it does not pause the wheels. Availability depends on firmware.',
      schema: z.object({ level: z.enum(['standard', 'boost', 'max', 'off']) }).strict(),
      readOnly: false, run: ({ level }, context) => control(['speed', level], context) },
    { name: 'robovac_set_mode', title: 'Set cleaning mode',
      description: 'Activate a cleaning mode: auto, spot, edge or small-room. May start movement; firmware support varies.',
      schema: z.object({ mode: z.enum(['auto', 'spot', 'edge', 'small-room']) }).strict(),
      readOnly: false, run: ({ mode }, context) => control(['mode', mode], context) },
    { name: 'robovac_move', title: 'Brief manual movement',
      description: 'Move forward, backward or turn for 100 to 5000 ms, then attempt to pause. Use only for requested, supervised movement. Does not measure metres or degrees.',
      schema: z.object({ direction: z.enum(['forward', 'backward', 'left', 'right']),
        durationMs: z.number().int().min(100).max(5000) }).strict(),
      readOnly: false, run: ({ direction, durationMs }, context) => runner.run('move',
        [direction, String(durationMs)], { signal: context?.signal }) },
    { name: 'robovac_check_connection', title: 'Check connection',
      description: 'Check the local connection and disconnect without moving the vacuum.',
      schema: empty, readOnly: true, run: (_, context) => control(['connect'], context) },
    { name: 'robovac_discover', title: 'Discover the vacuum IP',
      description: 'Find the configured device ID on the LAN and check its advertised protocol. Does not retrieve credentials or enumerate unknown vacuums.',
      schema: empty, readOnly: true, run: (_, context) => control(['discover'], context) },
  ];
}

export function createServer(runner = createRunner()) {
  const server = new McpServer({ name: 'eufy-robovac', version: '1.0.0' }, { instructions });
  for (const tool of toolDefinitions(runner)) {
    server.registerTool(tool.name, { title: tool.title, description: tool.description,
      inputSchema: tool.schema, annotations: annotations(tool.readOnly) }, async (args, context) => {
      try {
        const data = await tool.run(args, context);
        return { content: [{ type: 'text', text: JSON.stringify(data) }], structuredContent: data };
      } catch {
        return { isError: true, content: [{ type: 'text', text:
          'Unable to complete the operation: connection failure, another active command or cancellation. The physical outcome was not confirmed. Check local network permissions and vacuum status. If it is still moving, use its physical button.' }] };
      }
    });
  }
  return server;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runner = createRunner();
  const handle = serveStdio(() => createServer(runner), {
    onerror: () => console.error('Eufy RoboVac MCP connection error.'),
  });
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await runner.close();
    await handle.close();
    process.exit(0);
  };
  process.once('SIGINT', close);
  process.once('SIGTERM', close);
  process.stdin.once('end', close);
}
