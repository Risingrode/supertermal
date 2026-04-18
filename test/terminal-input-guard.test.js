const test = require('node:test');
const assert = require('node:assert/strict');

const { shouldIgnoreTerminalKeyEvent } = require('../public/terminal-input-guard.js');

test('ignores composing keyboard events', () => {
  assert.equal(
    shouldIgnoreTerminalKeyEvent({ type: 'keydown', isComposing: true, keyCode: 0 }),
    true,
  );
});

test('ignores legacy IME keycode 229 events', () => {
  assert.equal(
    shouldIgnoreTerminalKeyEvent({ type: 'keydown', isComposing: false, keyCode: 229 }),
    true,
  );
});

test('does not ignore normal keyboard events', () => {
  assert.equal(
    shouldIgnoreTerminalKeyEvent({ type: 'keydown', isComposing: false, keyCode: 72 }),
    false,
  );
});
