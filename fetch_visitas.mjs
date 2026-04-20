import sql from 'mssql';
import fs from 'fs';

const SQL_CONFIG = {
    server: '128.223.16.29',
    port: 2450,
    user: 'SalusConsulta',
    password: 'ConsultaSALUS1234',
    database: 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 120000,    // 2min timeout for heavy queries
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

async function fetchVisitas() {
    try {
        console.log('🔌 Conectando a SQL Server SALUS...');
        const pool = await sql.connect(SQL_CONFIG);
        console.log('✅ Conectado a SALUS');

        console.log('📋 Ejecutando consulta: SELECT * FROM VLISE_Visitas...');
        const result = await pool.request().query(`
            SELECT * FROM VLISE_Visitas 
            WHERE [Fecha Visita] >= '2025-06-01'
        `);
        
        const count = result.recordset.length;
        console.log(`📥 ${count} registros extraídos.`);
        
        if (count > 0) {
            console.log('👀 Muestra de los primeros 2 registros:');
            console.log(result.recordset.slice(0, 2));

            // Optional: Backup results to a JSON file
            const outputPath = 'visitas_export.json';
            fs.writeFileSync(outputPath, JSON.stringify(result.recordset, null, 2));
            console.log(`📁 Resultados guardados en ${outputPath}`);
        } else {
            console.log('⚠️ No se encontraron registros con los criterios especificados.');
        }

        await pool.close();
        console.log('🔌 Conexión cerrada.');

    } catch (err) {
        console.error('❌ Error durante la consulta:', err);
    }
}

fetchVisitas();
