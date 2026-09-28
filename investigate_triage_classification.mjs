import sql from 'mssql';

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
        requestTimeout: 180000,
        connectionTimeout: 20000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

async function main() {
    const pool = await sql.connect(SQL_CONFIG);
    console.log('Connected to SALUS');

    // 1. Column names of PR Protocolos
    const qCols1 = await pool.request().query(`
        SELECT TOP 1 * FROM [PR Protocolos] WHERE idProtocolo = 621
    `);
    console.log('PR Protocolos columns:', Object.keys(qCols1.recordset[0] || {}));
    console.log('PR Protocolos row:', qCols1.recordset[0]);

    // 2. Column names of PR PreguntasProtocolo
    const qCols2 = await pool.request().query(`
        SELECT TOP 1 * FROM [PR PreguntasProtocolo] WHERE idProtocolo = 621
    `);
    console.log('PR PreguntasProtocolo columns:', Object.keys(qCols2.recordset[0] || {}));

    // 3. All questions for Protocol 621
    const qQuestions = await pool.request().query(`
        SELECT * FROM [PR PreguntasProtocolo] WHERE idProtocolo = 621
    `);
    console.log('--- ALL QUESTIONS PROTOCOL 621 ---');
    console.table(qQuestions.recordset.map(q => ({
        idPreguntaPr: q.idPreguntaPr,
        idProtocolo: q.idProtocolo,
        enunciado: q.enunciado || q.Enunciado || q.Texto || q.Nombre || q.titulo,
        tipo: q.tipo || q.Tipo || q.IdTipoPregunta,
        orden: q.orden || q.Orden
    })));

    // 4. Also check all questions in PR Preguntas
    const qPreg = await pool.request().query(`
        SELECT p.idPreguntaPr, p.enunciado, p.tipo, pp.orden
        FROM [PR Preguntas] p
        INNER JOIN [PR PreguntasProtocolo] pp ON p.idPreguntaPr = pp.idPreguntaPr
        WHERE pp.idProtocolo = 621
        ORDER BY pp.orden
    `);
    console.log('--- JOIN WITH PR PREGUNTAS ---');
    console.table(qPreg.recordset);

    await pool.close();
}

main().catch(console.error);
