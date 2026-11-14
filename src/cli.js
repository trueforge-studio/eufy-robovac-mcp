#!/usr/bin/env node
'use strict';

const { resolve } = require('node:path');
const { execute } = require('./control');

async function main() {
  try {
    // Node's native loader preserves existing shell environment variables.
    process.loadEnvFile(resolve(__dirname, '..', '.env'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('No se pudo leer .env. Revisa sus permisos y formato.');
  }
  const result = await execute(process.argv.slice(2));
  console.log(typeof result === 'string' ? result : JSON.stringify(result, null, 2));
}

// Force termination also closes UDP listeners left open by legacy find() errors.
process.once('SIGINT', () => process.exit(130));
process.once('SIGTERM', () => process.exit(143));
main().then(() => process.exit(0), error => {
  console.error(error.message);
  process.exit(1);
});
