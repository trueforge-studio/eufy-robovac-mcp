'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execute, readConfig } = require('../src/control');
const env = { EUFY_DEVICE_ID: 'test-device', EUFY_LOCAL_KEY: '0123456789abcdef', EUFY_IP: '192.0.2.10' };

function fixture(overrides = {}) {
  const calls = [];
  const robot = {
    api: { device: { ip: env.EUFY_IP, version: '3.3' },
      find: async () => calls.push('find') },
    connect: async () => calls.push('connect'),
    disconnect: async () => calls.push('disconnect'),
    setPlayPause: async value => calls.push(['pause', value]),
    startCleaning: async () => calls.push('start'),
    goHome: async () => calls.push('home'),
    setFindRobot: async value => calls.push(['locate', value]),
    setCleanSpeed: async value => calls.push(['speed', value]),
    setWorkMode: async value => calls.push(['mode', value]),
    getStatuses: async () => ({ devId: 'hidden', key: env.EUFY_LOCAL_KEY,
      dps: { '104': 78, '15': 'Charging' } }),
    ...overrides,
  };
  return { calls, robot, create: () => robot };
}

test('help and invalid commands never construct a robot', async () => {
  const create = () => { throw new Error('Unexpected construction'); };
  assert.match(await execute([], {}, create), /Uso:/);
  await assert.rejects(execute(['speed', 'turbo'], env, create), /inválidos/);
});
test('validates secrets, address and timeout without exposing values', () => {
  assert.throws(() => readConfig({ ...env, EUFY_LOCAL_KEY: 'secret' }), /16/);
  assert.throws(() => readConfig({ ...env, EUFY_IP: 'invalid' }), /IPv4/);
  assert.throws(() => readConfig({ ...env, EUFY_TIMEOUT_SECONDS: 'Infinity' }), /entero/);
});
test('pause writes false and always disconnects', async () => {
  const f = fixture();
  await execute(['pause'], env, f.create);
  assert.deepEqual(f.calls, ['connect', ['pause', false], 'disconnect']);
});
test('discovery ignores configured IP, never connects or moves robot', async () => {
  const f = fixture();
  const result = await execute(['discover'], env, config => {
    assert.equal(config.ip, undefined);
    return f.robot;
  });
  assert.equal(result.ip, env.EUFY_IP);
  assert.deepEqual(f.calls, ['find', 'disconnect']);
});
test('discovery failure prevents connecting and cleans up', async () => {
  const f = fixture();
  f.robot.api.find = async () => { throw new Error(env.EUFY_LOCAL_KEY); };
  await assert.rejects(execute(['start'], { ...env, EUFY_IP: '' }, f.create), error => {
    assert.ok(!error.message.includes(env.EUFY_LOCAL_KEY));
    return true;
  });
  assert.deepEqual(f.calls, ['disconnect']);
});
test('unsupported advertised protocol prevents control', async () => {
  const f = fixture();
  f.robot.api.device.version = '3.4';
  await assert.rejects(execute(['start'], { ...env, EUFY_IP: '' }, f.create), /3.3/);
  assert.deepEqual(f.calls, ['find', 'disconnect']);
});
test('status returns only whitelisted information', async () => {
  const f = fixture();
  const result = JSON.stringify(await execute(['status'], env, f.create));
  assert.match(result, /78/);
  assert.ok(!result.includes(env.EUFY_LOCAL_KEY));
  assert.ok(!result.includes('hidden'));
});
test('action failure still disconnects and does not expose library error', async () => {
  const f = fixture({ goHome: async () => { throw new Error(env.EUFY_LOCAL_KEY); } });
  await assert.rejects(execute(['home'], env, f.create), /No se pudo/);
  assert.deepEqual(f.calls, ['connect', 'disconnect']);
});
test('control commands call the installed API with expected values', async () => {
  for (const [args, expected] of [
    [['start'], 'start'], [['home'], 'home'], [['locate'], ['locate', true]],
    [['speed', 'standard'], ['speed', 'Standard']],
    [['speed', 'boost'], ['speed', 'Boost_IQ']], [['speed', 'max'], ['speed', 'Max']],
    [['speed', 'off'], ['speed', 'No_suction']], [['mode', 'auto'], ['mode', 'auto']],
    [['mode', 'spot'], ['mode', 'Spot']], [['mode', 'edge'], ['mode', 'Edge']],
    [['mode', 'small-room'], ['mode', 'SmallRoom']],
  ]) {
    const f = fixture();
    await execute(args, env, f.create);
    assert.deepEqual(f.calls, ['connect', expected, 'disconnect']);
  }
});
