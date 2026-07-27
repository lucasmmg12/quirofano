const { Client } = require('pg');
const fs = require('fs');
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
    const sql = fs.readFileSync('garantias_migration.sql', 'utf8');
    await client.query(sql);
    console.log('Migration for Garantías applied successfully.');
  } catch (err) {
    console.error('Error Code:', err.code);
    console.error('Error Message:', err.message);
    if (err.code === 'ENOTFOUND') {
      console.error('\n--> La conexión a la base de datos falló porque db.hakysnqiryimxbwdslwe.supabase.co solo resuelve a IPv6 y este equipo no tiene ruta IPv6.');
    }
  } finally {
    await client.end();
  }
}

run();
