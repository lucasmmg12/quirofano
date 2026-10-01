import sql from 'mssql';
import pg from 'pg';

const salusConfig = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        requestTimeout: 60000
    }
};

const pgConfig = {
    connectionString: "postgresql://postgres:07052812Mv.@db.hakysnqiryimxbwdslwe.supabase.co:5432/postgres",
    ssl: { rejectUnauthorized: false }
};

async function checkSalus() {
    console.log('\n=== Buscando tablas en SALUS (SQL Server 128.223.16.29) ===');
    try {
        await sql.connect(salusConfig);
        const res = await sql.query(`
            SELECT TABLE_SCHEMA, TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME LIKE '%CONSUM%' 
               OR TABLE_NAME LIKE '%DESCART%' 
               OR TABLE_NAME LIKE '%MODULO%' 
               OR TABLE_NAME LIKE '%MATERIAL%'
               OR TABLE_NAME LIKE '%PRESUP%'
               OR TABLE_NAME LIKE '%CIRUG%'
               OR TABLE_NAME LIKE '%QUIR%'
            ORDER BY TABLE_NAME
        `);
        console.log(`Encontradas ${res.recordset.length} tablas en SALUS:`);
        res.recordset.forEach(r => console.log(` - ${r.TABLE_SCHEMA}.${r.TABLE_NAME}`));
    } catch (e) {
        console.log('Error en Salus:', e.message);
    } finally {
        await sql.close();
    }
}

async function checkPg() {
    console.log('\n=== Buscando tablas en Postgres Supabase ===');
    const client = new pg.Client(pgConfig);
    try {
        await client.connect();
        const res = await client.query(`
            SELECT table_schema, table_name 
            FROM information_schema.tables 
            WHERE table_name ILIKE '%consum%' 
               OR table_name ILIKE '%descart%'
               OR table_name ILIKE '%articulo%'
               OR table_name ILIKE '%precio%'
            ORDER BY table_name;
        `);
        console.log(`Encontradas ${res.rows.length} tablas en Postgres:`);
        res.rows.forEach(r => console.log(` - ${r.table_schema}.${r.table_name}`));
    } catch (e) {
        console.log('Error en Postgres:', e.message);
    } finally {
        await client.end();
    }
}

async function main() {
    await checkPg();
    await checkSalus();
}

main().catch(console.error);
