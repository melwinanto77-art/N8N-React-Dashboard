const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');
console.log('Database Path:', dbPath);

try {
  const db = new DatabaseSync(dbPath);
  
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec("BEGIN TRANSACTION;");
  
  // Update project ID in project table
  const pResult = db.prepare("UPDATE project SET id = 'AjxPYctShCSN48h3' WHERE id = 'UYfqKOSAHzhXavsc'").run();
  console.log('Updated project:', pResult);
  
  // Update project ID in project_relation table
  const prResult = db.prepare("UPDATE project_relation SET projectId = 'AjxPYctShCSN48h3' WHERE projectId = 'UYfqKOSAHzhXavsc'").run();
  console.log('Updated project_relation:', prResult);
  
  // Update project ID in shared_workflow table
  const swResult = db.prepare("UPDATE shared_workflow SET projectId = 'AjxPYctShCSN48h3' WHERE projectId = 'UYfqKOSAHzhXavsc'").run();
  console.log('Updated shared_workflow:', swResult);
  
  // Update project ID in shared_credentials table
  const scResult = db.prepare("UPDATE shared_credentials SET projectId = 'AjxPYctShCSN48h3' WHERE projectId = 'UYfqKOSAHzhXavsc'").run();
  console.log('Updated shared_credentials:', scResult);
  
  db.exec("COMMIT;");
  console.log("✅ Successfully updated project ID to 'AjxPYctShCSN48h3' in n8n database!");
} catch (e) {
  console.error("❌ Error running migration:", e.message);
}
