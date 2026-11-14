'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { move } = require('../src/motion');

function rig() {
  const calls = [];
  let clock = 0;
  return { calls, robot: { DIRECTION: '3', set: async data => calls.push(data),
    setPlayPause: async value => calls.push({ pause: value }) },
    now: () => clock, wait: async ms => { clock += ms; } };
}
test('manual move repeats direction within its time and pauses before and after', async () => {
  const r = rig();
  await move(r.robot, 'left', 500, r);
  assert.deepEqual(r.calls, [{ pause: false }, { '3': 'left' }, { '3': 'left' }, { pause: false }]);
});
test('cancelled manual move attempts pause and sends no later movement', async () => {
  const r = rig();
  const controller = new AbortController();
  r.robot.set = async data => { r.calls.push(data); controller.abort(); };
  await assert.rejects(move(r.robot, 'forward', 1000, { ...r, signal: controller.signal }));
  assert.deepEqual(r.calls, [{ pause: false }, { '3': 'forward' }, { pause: false }]);
});
test('failed direction still attempts pause; invalid inputs never touch robot', async () => {
  const r = rig();
  r.robot.set = async () => { throw new Error('test'); };
  await assert.rejects(move(r.robot, 'backward', 500, r));
  assert.deepEqual(r.calls, [{ pause: false }, { pause: false }]);
  r.calls.length = 0;
  await assert.rejects(move(r.robot, 'forward', 5001, r));
  assert.deepEqual(r.calls, []);
});
