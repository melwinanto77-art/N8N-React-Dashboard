const { DatabaseSync } = require('node:sqlite');

try {
  const db = new DatabaseSync('/home/node/.n8n/database.sqlite');
  const rows = db.prepare("SELECT id, name, pinData FROM workflow_entity").all();
  console.log('Workflows in container DB:');
  for (const r of rows) {
    console.log(`ID: ${r.id} | Name: ${r.name} | pinData: ${r.pinData}`);
  }
} catch (e) {
  console.error('Error:', e.message);
}
