const { DatabaseSync } = require('node:sqlite');

try {
  const db = new DatabaseSync('/home/node/.n8n/database.sqlite');
  
  db.exec("BEGIN TRANSACTION;");
  
  // Set pinData to '{}' instead of null
  const result = db.prepare("UPDATE workflow_entity SET pinData = '{}' WHERE pinData IS NULL").run();
  console.log('Successfully patched workflows:', result);
  
  db.exec("COMMIT;");
  
  // Verify
  const rows = db.prepare("SELECT id, name, pinData FROM workflow_entity").all();
  console.log('Updated rows:');
  for (const r of rows) {
    console.log(`ID: ${r.id} | Name: ${r.name} | pinData: ${r.pinData}`);
  }
} catch (e) {
  console.error('Error:', e.message);
}
