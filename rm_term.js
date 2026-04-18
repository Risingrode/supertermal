const fs = require('fs');
const content = fs.readFileSync('server.js', 'utf8');
const startTag = '// === Persistent Terminal Management ===';
const endTag = '// Default fallback MODEL_MAP (overridden by model config at runtime)';

const startIndex = content.indexOf(startTag);
const endIndex = content.indexOf(endTag);

if (startIndex !== -1 && endIndex !== -1) {
  const newContent = content.slice(0, startIndex) + content.slice(endIndex);
  fs.writeFileSync('server.js', newContent);
  console.log('Successfully removed terminal block.');
} else {
  console.error('Tags not found.');
}
