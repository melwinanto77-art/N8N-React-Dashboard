const { Client } = require('pg');

async function run() {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'analytics',
  });

  try {
    await client.connect();
    
    const sites = await client.query('SELECT * FROM sites');
    console.log('--- SITES IN DB ---');
    console.log(sites.rows);

    const events = await client.query('SELECT COUNT(*) as count FROM events');
    console.log('\n--- EVENTS COUNT ---');
    console.log(events.rows[0]);

    if (events.rows[0].count > 0) {
      const sampleEvents = await client.query('SELECT * FROM events LIMIT 5');
      console.log('\n--- SAMPLE EVENTS ---');
      console.log(sampleEvents.rows);
    }

  } catch (err) {
    console.error('Database connection error:', err.message);
  } finally {
    await client.end();
  }
}

run();
