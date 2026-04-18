const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startTerminalAttach,
  bufferTerminalInput,
  markTerminalAttached,
  markTerminalDetached,
} = require('../public/terminal-attach-state.js');

test('startTerminalAttach only starts once while attach is in flight', () => {
  const entry = { attached: false, attaching: false, pendingInput: '' };
  assert.equal(startTerminalAttach(entry), true);
  assert.equal(entry.attaching, true);
  assert.equal(startTerminalAttach(entry), false);
});

test('bufferTerminalInput keeps the first characters until attach completes', () => {
  const entry = { attached: false, attaching: true, pendingInput: '' };
  bufferTerminalInput(entry, 'h');
  bufferTerminalInput(entry, 'i');
  assert.equal(entry.pendingInput, 'hi');
});

test('markTerminalAttached flushes pending input exactly once', () => {
  const entry = { attached: false, attaching: true, pendingInput: 'ls\n' };
  const pending = markTerminalAttached(entry);
  assert.equal(pending, 'ls\n');
  assert.equal(entry.pendingInput, '');
  assert.equal(entry.attached, true);
  assert.equal(entry.attaching, false);
});

test('markTerminalDetached clears attach-in-flight state', () => {
  const entry = { attached: true, attaching: true, pendingInput: '' };
  markTerminalDetached(entry);
  assert.equal(entry.attached, false);
  assert.equal(entry.attaching, false);
});
