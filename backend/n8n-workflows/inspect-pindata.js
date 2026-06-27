const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');

try {
  const db = new DatabaseSync(dbPath);
  const row = db.prepare("SELECT id, name, pinData FROM workflow_entity WHERE id = 'bmd9BUbfHcEgP4w6'").get();
  console.log('Workflow row:', row);
  console.log('pinData type:', typeof row.pinData);
} catch (err) {
  console.error('Error:', err.message);
}
