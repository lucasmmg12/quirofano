const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

const connectionString = process.env.SUPABASE_DB_URL;
if (!connectionString) {
  console.error('No SUPABASE_DB_URL found');
  process.exit(1);
}

const client = new Client({
  connectionString,
});

async function run() {
  try {
    await client.connect();
    const sqlPath = path.join(__dirname, '..', 'supabase', 'migrations', '054_activos_proximo_mantenimiento.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await client.query(sql);
    console.log('Migration 054 applied successfully.');
  } catch (err) {
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
  } finally {
    await client.end();
  }
}

run();
