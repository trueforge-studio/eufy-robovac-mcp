import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { fileURLToPath } from 'node:url';
import { createServer } from '../src/mcp-server.mjs';

async function connect(runner) {
  const server = createServer(runner);
  const client = new Client({ name: 'robovac-test', version: '1.0.0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  await client.connect(b);
  return { client, close: async () => { await client.close(); await server.close(); } };
}

test('MCP exposes live status, validates inputs, and maps actions without leaking errors', async () => {
  const calls = [];
  const connection = await connect({ run: async (kind, args) => {
    calls.push([kind, args]);
    if (args[0] === 'locate') throw new Error('SECRET-LOCAL-KEY');
    return args[0] === 'status' ? { battery: 88, status: 'standby' } : { message: 'Request sent.' };
  } });
  try {
    const tools = (await connection.client.listTools()).tools;
    assert.equal(tools.length, 12);
    assert.ok(!tools.some(t => /square|heart/i.test(t.name)));
    assert.equal(tools.find(t => t.name === 'robovac_get_battery').annotations.readOnlyHint, true);
    assert.equal(tools.find(t => t.name === 'robovac_move').annotations.idempotentHint, false);
    const battery = await connection.client.callTool({ name: 'robovac_get_battery', arguments: {} });
    assert.equal(battery.structuredContent.batteryPercent, 88);
    const home = await connection.client.callTool({ name: 'robovac_return_to_base', arguments: {} });
    assert.ok(!home.isError);
    await connection.client.callTool({ name: 'robovac_set_mode', arguments: { mode: 'edge' } });
    await connection.client.callTool({ name: 'robovac_move', arguments: { direction: 'left', durationMs: 300 } });
    assert.deepEqual(calls, [['control', ['status']], ['control', ['home']],
      ['control', ['mode', 'edge']], ['move', ['left', '300']]]);
    const invalid = await connection.client.callTool({ name: 'robovac_move', arguments: { direction: 'left', durationMs: 999999 } });
    assert.equal(invalid.isError, true);
    assert.equal(calls.length, 4);
    const failed = await connection.client.callTool({ name: 'robovac_locate', arguments: {} });
    assert.equal(failed.isError, true);
    assert.ok(!JSON.stringify(failed).includes('SECRET-LOCAL-KEY'));
  } finally { await connection.close(); }
});

test('MCP rejects an unknown battery rather than reporting a fabricated percentage', async () => {
  const connection = await connect({ run: async () => ({ status: 'standby' }) });
  try {
    const result = await connection.client.callTool({ name: 'robovac_get_battery', arguments: {} });
    assert.equal(result.isError, true);
  } finally { await connection.close(); }
});

test('real stdio server handshakes and lists capabilities without touching hardware', async () => {
  const client = new Client({ name: 'robovac-stdio-test', version: '1.0.0' });
  const transport = new StdioClientTransport({ command: process.execPath,
    args: [fileURLToPath(new URL('../src/mcp-server.mjs', import.meta.url))], stderr: 'pipe' });
  try {
    await client.connect(transport);
    assert.equal((await client.listTools()).tools.length, 12);
    const result = await client.callTool({ name: 'robovac_get_capabilities', arguments: {} });
    assert.deepEqual(result.structuredContent.savedRoutes, []);
  } finally { await client.close(); }
});
