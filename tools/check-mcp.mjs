import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { fileURLToPath } from 'node:url';

const client = new Client({ name: 'robovac-check', version: '1.0.0' });
const transport = new StdioClientTransport({ command: process.execPath,
  args: [fileURLToPath(new URL('../src/mcp-server.mjs', import.meta.url))], stderr: 'pipe' });
try {
  await client.connect(transport);
  const tools = await client.listTools();
  console.log(JSON.stringify({ mcpConnected: true, tools: tools.tools.map(tool => tool.name) }));
  if (process.argv.includes('--battery')) {
    const result = await client.callTool({ name: 'robovac_get_battery', arguments: {} });
    console.log(JSON.stringify(result.structuredContent || result.content));
    if (result.isError) process.exitCode = 1;
  }
} catch {
  console.error('Unable to complete the MCP check.');
  process.exitCode = 1;
} finally { await client.close(); }
