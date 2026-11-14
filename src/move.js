#!/usr/bin/env node
'use strict';
const { resolve } = require('node:path');
const { RoboVac } = require('eufy-robovac');
const { readConfig } = require('./control');
const { bounded, validateMove, move } = require('./motion');

async function main() {
  const [direction, duration, ...extra] = process.argv.slice(2);
  const durationMs = Number(duration);
  validateMove(direction, durationMs);
  if (extra.length) throw new Error('Unexpected arguments.');
  try { process.loadEnvFile(resolve(__dirname, '..', '.env')); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
  const config = readConfig(process.env);
  const robot = new RoboVac(config, false);
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGINT', abort);
  process.once('SIGTERM', abort);
  robot.api.on('disconnected', abort);
  try {
    if (!config.ip) {
      await bounded(() => robot.api.find({ timeout: config.timeout }), (config.timeout + 1) * 1000);
      if (robot.api.device.version !== '3.3') throw new Error('Unsupported protocol.');
    }
    controller.signal.throwIfAborted();
    await bounded(() => robot.connect(), 10000);
    await move(robot, direction, durationMs, { signal: controller.signal });
    console.log(JSON.stringify({ direction, durationMs, pauseRequested: true,
      message: 'Timed movement finished; pause requested. Distance and angle were not measured.' }));
  } finally {
    robot.api.removeListener('disconnected', abort);
    await bounded(() => robot.disconnect());
    process.removeListener('SIGINT', abort);
    process.removeListener('SIGTERM', abort);
  }
}

main().then(() => process.exit(0), () => {
  console.error('Movement interrupted or failed. Check the vacuum; pausing requires a connection.');
  process.exit(1);
});
