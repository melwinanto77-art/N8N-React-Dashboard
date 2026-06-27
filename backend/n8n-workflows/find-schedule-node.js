const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'nodes-docker.json');
try {
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  console.log('Total node types:', data.length);
  
  const scheduleNodes = data.filter(node => 
    (node.name && node.name.toLowerCase().includes('schedule')) ||
    (node.displayName && node.displayName.toLowerCase().includes('schedule'))
  );

  console.log('Found schedule-related nodes:', scheduleNodes.length);
  for (const node of scheduleNodes) {
    console.log({
      name: node.name,
      displayName: node.displayName,
      version: node.version,
      typeVersion: node.typeVersion,
      defaults: node.defaults
    });
  }
} catch (err) {
  console.error('Error:', err.message);
}
