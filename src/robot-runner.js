'use strict';
const { spawn } = require('node:child_process');
const { resolve } = require('node:path');
const { validateCommand } = require('./control');
const { validateMove } = require('./motion');

const ROOT = resolve(__dirname, '..');

function createRunner({ spawnProcess = spawn } = {}) {
  let active;
  async function run(kind, args, { signal } = {}) {
    if (kind === 'control') validateCommand(args);
    else if (kind === 'move') validateMove(args[0], Number(args[1]));
    else throw new Error('Operación inválida.');
    signal?.throwIfAborted();
    // Stop/dock preempt a manual movement; never queue stale movement commands.
    if (active && ['pause', 'home'].includes(args[0]) && kind === 'control') {
      active.controller.abort();
      await active.done.catch(() => {});
    }
    if (active) throw new Error('Robotina está atendiendo otra operación. Espera o pide pausar.');
    const controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    const record = { controller };
    active = record;
    record.done = new Promise((resolveResult, reject) => {
      let output = '';
      let forceKill;
      const child = spawnProcess(process.execPath, [resolve(__dirname, kind === 'move' ? 'move.js' : 'cli.js'), ...args], {
        cwd: ROOT, env: { ...process.env, DEBUG: '', NODE_DEBUG: '' }, stdio: ['ignore', 'pipe', 'ignore'],
      });
      const cancel = () => {
        child.kill('SIGINT');
        forceKill = setTimeout(() => child.kill('SIGKILL'), 5000);
      };
      combined.addEventListener('abort', cancel, { once: true });
      if (combined.aborted) cancel();
      const timeout = setTimeout(() => controller.abort(), 30000);
      const cleanup = () => {
        clearTimeout(timeout); clearTimeout(forceKill);
        combined.removeEventListener('abort', cancel);
      };
      child.stdout.on('data', chunk => {
        output += chunk;
        if (output.length > 65536) controller.abort();
      });
      child.on('error', () => { cleanup(); reject(new Error('No se pudo iniciar el controlador de Robotina.')); });
      child.on('close', code => {
        cleanup();
        if (code !== 0 || combined.aborted) {
          reject(new Error('Operación fallida o cancelada. Comprueba la conexión y el estado del robot antes de repetirla.'));
          return;
        }
        try { resolveResult(JSON.parse(output)); }
        catch { reject(new Error('El controlador devolvió una respuesta inválida.')); }
      });
    });
    try { return await record.done; }
    finally { if (active === record) active = undefined; }
  }
  async function close() {
    if (active) { active.controller.abort(); await active.done.catch(() => {}); }
  }
  return { run, close };
}

module.exports = { createRunner };
