const { DatabaseSync } = require('node:sqlite');

try {
  const db = new DatabaseSync('/home/node/.n8n/database.sqlite');
  const row = db.prepare("SELECT name, nodes FROM workflow_entity WHERE id = 'bmd9BUbfHcEgP4w6'").get();
  
  if (!row) {
    console.error('Workflow bmd9BUbfHcEgP4w6 not found in DB!');
    process.exit(1);
  }
  
  const nodes = JSON.parse(row.nodes);
  const slackNode = nodes.find(n => n.name === 'Slack Alert');
  
  if (slackNode) {
    console.log('--- DB Configured Slack Alert Node ---');
    console.log(JSON.stringify(slackNode, null, 2));
  } else {
    console.log('Slack Alert node not found in nodes list!');
  }
} catch (e) {
  console.error('Error:', e.message);
}
