const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const COMMON_PASSWORDS = ['', 'postgres', 'admin', 'password', 'supersecretpassword'];
const SQL_PATH = path.join(__dirname, 'init.sql');

async function tryConnect(password) {
  const client = new Client({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: password,
    database: 'postgres',
    connectionTimeoutMillis: 1000,
  });

  try {
    await client.connect();
    return client;
  } catch (err) {
    return null;
  }
}

async function run() {
  console.log('Searching for database connection...');
  let rootClient = null;
  let successfulPassword = '';

  for (const pw of COMMON_PASSWORDS) {
    console.log(`Trying password: "${pw}"...`);
    rootClient = await tryConnect(pw);
    if (rootClient) {
      successfulPassword = pw;
      break;
    }
  }

  if (!rootClient) {
    console.error('❌ Could not connect to PostgreSQL. Please ensure the "postgres" user password is one of the following: empty, "postgres", "admin", "password".');
    console.error('Otherwise, please create a database named "analytics" and run init.sql manually.');
    process.exit(1);
  }

  console.log(`✅ Connected successfully using password: "${successfulPassword}"`);

  try {
    // Check if database analytics exists
    const dbCheck = await rootClient.query("SELECT 1 FROM pg_database WHERE datname = 'analytics'");
    if (dbCheck.rows.length === 0) {
      console.log('Creating database "analytics"...');
      // Create database cannot be run inside a transaction block
      await rootClient.query('CREATE DATABASE analytics');
      console.log('Database "analytics" created.');
    } else {
      console.log('Database "analytics" already exists.');
    }
    await rootClient.end();

    // Now connect to the analytics database and run init.sql
    console.log('Connecting to "analytics" database...');
    const dbClient = new Client({
      host: 'localhost',
      port: 5432,
      user: 'postgres',
      password: successfulPassword,
      database: 'analytics',
    });
    await dbClient.connect();

    console.log('Reading init.sql schema...');
    const sql = fs.readFileSync(SQL_PATH, 'utf8');

    console.log('Executing schema initialization queries...');
    await dbClient.query(sql);
    console.log('✅ Local PostgreSQL schema initialized successfully!');

    // Check if analytics_user exists, if not create
    const userCheck = await dbClient.query("SELECT 1 FROM pg_roles WHERE rolname = 'analytics_user'");
    if (userCheck.rows.length === 0) {
      console.log('Creating role "analytics_user"...');
      await dbClient.query("CREATE ROLE analytics_user WITH LOGIN PASSWORD 'supersecretpassword'");
      await dbClient.query("ALTER ROLE analytics_user CREATEDB");
      await dbClient.query("GRANT ALL PRIVILEGES ON DATABASE analytics TO analytics_user");
      // Grant schema/table privileges
      await dbClient.query("GRANT ALL ON SCHEMA public TO analytics_user");
      await dbClient.query("GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO analytics_user");
      await dbClient.query("GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO analytics_user");
      console.log('Role "analytics_user" created and configured.');
    }

    await dbClient.end();
    console.log('🎉 Database initialization complete!');
  } catch (err) {
    console.error('Error during database initialization:', err);
    if (rootClient) {
      try { await rootClient.end(); } catch (e) {}
    }
    process.exit(1);
  }
}

run();
