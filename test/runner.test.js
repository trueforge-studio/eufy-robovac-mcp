'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { createRunner } = require('../src/robot-runner');

function fakeProcess() {
  const children = [];
  return { children, spawnProcess: (_, args) => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.signals = [];
    child.kill = signal => {
      child.signals.push(signal);
      queueMicrotask(() => child.emit('close', 130));
    };
    children.push({ child, args });
    return child;
  } };
}

test('MCP runner does not queue concurrent commands and releases failed operations', async () => {
  const fake = fakeProcess();
  const runner = createRunner(fake);
  const first = runner.run('control', ['status']);
  await assert.rejects(runner.run('control', ['start']), /otra operación/);
  assert.equal(fake.children.length, 1);
  fake.children[0].child.emit('close', 1);
  await assert.rejects(first);
  const second = runner.run('control', ['status']);
  fake.children[1].child.stdout.write('{"battery":88}');
  fake.children[1].child.emit('close', 0);
  assert.deepEqual(await second, { battery: 88 });
});
test('pause preempts an active manual motion before starting its own child', async () => {
  const fake = fakeProcess();
  const runner = createRunner(fake);
  const moving = runner.run('move', ['forward', '1000']);
  const expectedRejection = assert.rejects(moving);
  const pausing = runner.run('control', ['pause']);
  await expectedRejection;
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fake.children[0].child.signals, ['SIGINT']);
  assert.equal(fake.children.length, 2);
  assert.equal(fake.children[1].args.at(-1), 'pause');
  fake.children[1].child.stdout.write('{"message":"Solicitud enviada."}');
  fake.children[1].child.emit('close', 0);
  await pausing;
});
test('MCP cancellation terminates the child without returning its output', async () => {
  const fake = fakeProcess();
  const runner = createRunner(fake);
  const controller = new AbortController();
  const task = runner.run('control', ['status'], { signal: controller.signal });
  const rejected = assert.rejects(task);
  controller.abort();
  await rejected;
  assert.deepEqual(fake.children[0].child.signals, ['SIGINT']);
});
