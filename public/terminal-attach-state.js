function startTerminalAttach(entry) {
  if (!entry || entry.attached || entry.attaching) return false;
  entry.attaching = true;
  return true;
}

function bufferTerminalInput(entry, data) {
  if (!entry || !data) return '';
  entry.pendingInput = `${entry.pendingInput || ''}${data}`;
  return entry.pendingInput;
}

function markTerminalAttached(entry) {
  if (!entry) return '';
  entry.attached = true;
  entry.attaching = false;
  const pendingInput = entry.pendingInput || '';
  entry.pendingInput = '';
  return pendingInput;
}

function markTerminalDetached(entry) {
  if (!entry) return;
  entry.attached = false;
  entry.attaching = false;
}

const terminalAttachState = {
  startTerminalAttach,
  bufferTerminalInput,
  markTerminalAttached,
  markTerminalDetached,
};

if (typeof module === 'object' && module.exports) {
  module.exports = terminalAttachState;
}

if (typeof window !== 'undefined') {
  window.TerminalAttachState = terminalAttachState;
}
