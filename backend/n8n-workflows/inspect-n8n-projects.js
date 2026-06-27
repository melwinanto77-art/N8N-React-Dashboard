const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const os = require('os');

const dbPath = path.join(os.homedir(), '.n8n', 'database.sqlite');

try {
  const db = new DatabaseSync(dbPath);

  console.log('--- ALL PROJECTS ---');
  const projects = db.prepare("SELECT * FROM project").all();
  console.log(projects);

  console.log('--- ALL USERS ---');
  const users = db.prepare("SELECT * FROM user").all();
  console.log(users);

  console.log('--- ALL PROJECT RELATIONS ---');
  const relations = db.prepare("SELECT * FROM project_relation").all();
  console.log(relations);

} catch (err) {
  console.error('Error:', err);
}
