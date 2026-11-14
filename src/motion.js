'use strict';
const { setTimeout: sleep } = require('node:timers/promises');
const { performance } = require('node:perf_hooks');

async function bounded(operation, ms = 3000) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Tiempo de respuesta agotado.')), ms);
    })]);
  } finally { clearTimeout(timer); }
}

function validateMove(direction, durationMs) {
  if (!['forward', 'backward', 'left', 'right'].includes(direction) ||
      !Number.isInteger(durationMs) || durationMs < 100 || durationMs > 5000) {
    throw new Error('Movimiento inválido: dirección conocida y duración de 100 a 5000 ms.');
  }
}

async function move(robot, direction, durationMs, { signal, wait = sleep,
  now = () => performance.now() } = {}) {
  validateMove(direction, durationMs);
  const pause = () => bounded(() => robot.setPlayPause(false));
  try {
    signal?.throwIfAborted();
    await pause();
    const until = now() + durationMs;
    do {
      signal?.throwIfAborted();
      await bounded(() => robot.set({ [robot.DIRECTION]: direction }));
      signal?.throwIfAborted();
      const remaining = until - now();
      if (remaining > 0) await wait(Math.min(250, remaining), undefined, { signal });
    } while (now() < until);
  } finally { await pause(); }
}

module.exports = { bounded, validateMove, move };
