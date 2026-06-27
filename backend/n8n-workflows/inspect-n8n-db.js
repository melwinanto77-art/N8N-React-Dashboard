const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');
console.log('Database Path:', dbPath);

try {
  const db = new DatabaseSync(dbPath);
  
  // List all tables
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
  console.log('Tables:', tables.map(t => t.name));

  // Get users
  try {
    const users = db.prepare("SELECT id, email, firstName, lastName FROM user").all();
    console.log('Users:', users);
  } catch (e) {
    console.log('Error reading user table:', e.message);
  }

  // Get workflows
  try {
    const workflows = db.prepare("SELECT id, name FROM workflow_entity").all();
    console.log('Workflows in workflow_entity:', workflows);
  } catch (e) {
    console.log('Error reading workflow_entity table:', e.message);
  }

  // Get shared_workflow or similar relation tables
  const sharedTables = tables.map(t => t.name).filter(n => n.includes('shared') || n.includes('user') || n.includes('relation') || n.includes('project'));
  console.log('Related/Shared Tables:', sharedTables);

  for (const table of sharedTables) {
    try {
      const rows = db.prepare(`SELECT * FROM "${table}" LIMIT 5`).all();
      console.log(`Rows in ${table}:`, rows);
    } catch (e) {
      console.log(`Error reading table ${table}:`, e.message);
    }
  }

} catch (err) {
  console.error('Error:', err);
}
