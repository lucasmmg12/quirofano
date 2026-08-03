/**
 * Investigar diferencia en consultas de guardia - Pediatría, Junio 2026
 * Compara lo que trae el sync vs lo que existe en SALUS sin filtros
 */
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
        requestTimeout: 120000,
        connectionTimeout: 15000,
    },
};

async function main() {
    console.log('🔌 Conectando a SALUS...');
    const pool = await sql.connect(SQL_CONFIG);
    console.log('✅ Conectado\n');

    // 1. Todas las visitas de GUARDIAS PEDIATRÍA en junio, por tipo de asistencia
    console.log('═══ Q1: TODAS las visitas de GUARDIAS PEDIATRÍA en Junio (por asistencia) ═══');
    const q1 = await pool.request().query(`
        SELECT 
            LTRIM(RTRIM([Asistencia])) AS Asistencia,
            COUNT(*) AS total_filas,
            COUNT(DISTINCT idVisita) AS visitas_unicas
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
          AND [Agenda] = N'GUARDIAS PEDIATRÍA'
        GROUP BY LTRIM(RTRIM([Asistencia]))
        ORDER BY total_filas DESC
    `);
    console.table(q1.recordset);

    // 2. Duplicados por idVisita?
    console.log('\n═══ Q2: Filas vs IDs únicos (GUARDIAS PEDIATRÍA, presente) ═══');
    const q2 = await pool.request().query(`
        SELECT COUNT(*) AS total_filas, COUNT(DISTINCT idVisita) AS visitas_unicas
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
          AND [Agenda] = N'GUARDIAS PEDIATRÍA'
          AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente'
    `);
    console.table(q2.recordset);

    // 3. Otras agendas con "PEDIATR"
    console.log('\n═══ Q3: TODAS las agendas con "PEDIATR" en Junio (presente) ═══');
    const q3 = await pool.request().query(`
        SELECT 
            [Agenda],
            [Grupo Agenda],
            COUNT(DISTINCT idVisita) AS visitas_unicas
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
          AND [Agenda] LIKE '%PEDIATR%'
          AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente'
        GROUP BY [Agenda], [Grupo Agenda]
        ORDER BY visitas_unicas DESC
    `);
    console.table(q3.recordset);

    // 4. Todas las agendas LIKE GUARDIA%
    console.log('\n═══ Q4: Todas las agendas GUARDIA% en Junio (presente, IDs únicos) ═══');
    const q4 = await pool.request().query(`
        SELECT 
            [Agenda], COUNT(DISTINCT idVisita) AS visitas_unicas
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
          AND [Agenda] LIKE '%GUARDIA%'
          AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente'
        GROUP BY [Agenda]
        ORDER BY visitas_unicas DESC
    `);
    console.table(q4.recordset);

    // 5. Comparar: "Cliente" breakdown en GUARDIAS PEDIATRÍA
    console.log('\n═══ Q5: Breakdown por Cliente en GUARDIAS PEDIATRÍA (para cruzar con OSP/Prepagas/Particular) ═══');
    const q5 = await pool.request().query(`
        SELECT 
            [Cliente],
            COUNT(DISTINCT idVisita) AS visitas_unicas
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
          AND [Agenda] = N'GUARDIAS PEDIATRÍA'
          AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente'
        GROUP BY [Cliente]
        ORDER BY visitas_unicas DESC
    `);
    console.table(q5.recordset);

    // 6. Total del sync actual con la misma query
    console.log('\n═══ Q6: TOTAL con la query exacta del sync (Junio, dedup) ═══');
    const q6 = await pool.request().query(`
        WITH VisitasFiltradas AS (
            SELECT 
                [idVisita],
                ROW_NUMBER() OVER(PARTITION BY [idVisita] ORDER BY [Fecha Visita] DESC) AS rn
            FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
            WHERE 
                [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
                AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente' 
                AND [Agenda] IN (
                    'GUARDIA CARDIOLOGICA', 'GUARDIAS CLINICA', 'GUARDIAS GINECOLOGIA', N'GUARDIAS PEDIATRÍA',
                    '(NEO) ROSALES TORRES SILVANA', '(NEO) CASTRO MONICA', '(NEO) VALDEZ MARIA', 
                    '(NEO) DRA. RUARTE, SONIA', '(NEO) DRA. SVRIZ WUCHERER NATALIA ELIZABETH', 
                    '(NEO) DRA. CLAVEL MARISA ANALIA', '(NEO) DR. HERNANDEZ, EDUARDO RAFAEL', 
                    '(NEO) GOMEZ ANDREA', '(NEO) HERNANDEZ, MARIA BELEN', '(NEO) DR. LUNA, HORACIO', 
                    '(NEO) JOFRE, GASTON MARCELO', '(NEO) DRA. CORREA, ANDREA', '(NEO) POSATINI MARIA FERNANDA', 
                    '(NEO) MORAN PATRICIA', '(NEO) MALOSCH, GABRIELA', '(NEO) TEJADA, JOSE LUIS', 
                    '(NEO) DR. RAMELLA, FERNANDO JOSE', '(NEO) DRA. AGUIRRE, VERONICA', 
                    '(NEO) DRA. CORREA, ANDREA-Baja', '(NEO) URIZAR ANALIA', '(NEO) AGUILAR, MARIA EUGENIA', 
                    '(NEO)URIZAR ANALIA', '(NEO) MOLINA, BERTHA BEATRIZ', '(NEO) DOMINGUEZ, GLADYS', 
                    '(NEO) DRA. MATEU MARTA EDITH', '(NEO) DR. FONT GERMAN ALBERTO ', 
                    '(NEO) MANRIQUE CLAUDIA', '(NEO)  DRA.RAMOS GABRIELA', '(NEO) MARTIN, AGUSTINA', 
                    'GYM PREPARTO', 'GYM BARIATRICA'
                )
        )
        SELECT COUNT(*) AS total_sync
        FROM VisitasFiltradas
        WHERE rn = 1
    `);
    console.table(q6.recordset);

    // 7. Total SIN filtro de Asistencia = presente
    console.log('\n═══ Q7: Total SIN filtro de asistencia (mismas agendas, Junio) ═══');
    const q7 = await pool.request().query(`
        SELECT COUNT(DISTINCT idVisita) AS total_sin_filtro_asistencia
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE 
            [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
            AND [Agenda] IN (
                'GUARDIA CARDIOLOGICA', 'GUARDIAS CLINICA', 'GUARDIAS GINECOLOGIA', N'GUARDIAS PEDIATRÍA',
                '(NEO) ROSALES TORRES SILVANA', '(NEO) CASTRO MONICA', '(NEO) VALDEZ MARIA', 
                '(NEO) DRA. RUARTE, SONIA', '(NEO) DRA. SVRIZ WUCHERER NATALIA ELIZABETH', 
                '(NEO) DRA. CLAVEL MARISA ANALIA', '(NEO) DR. HERNANDEZ, EDUARDO RAFAEL', 
                '(NEO) GOMEZ ANDREA', '(NEO) HERNANDEZ, MARIA BELEN', '(NEO) DR. LUNA, HORACIO', 
                '(NEO) JOFRE, GASTON MARCELO', '(NEO) DRA. CORREA, ANDREA', '(NEO) POSATINI MARIA FERNANDA', 
                '(NEO) MORAN PATRICIA', '(NEO) MALOSCH, GABRIELA', '(NEO) TEJADA, JOSE LUIS', 
                '(NEO) DR. RAMELLA, FERNANDO JOSE', '(NEO) DRA. AGUIRRE, VERONICA', 
                '(NEO) DRA. CORREA, ANDREA-Baja', '(NEO) URIZAR ANALIA', '(NEO) AGUILAR, MARIA EUGENIA', 
                '(NEO)URIZAR ANALIA', '(NEO) MOLINA, BERTHA BEATRIZ', '(NEO) DOMINGUEZ, GLADYS', 
                '(NEO) DRA. MATEU MARTA EDITH', '(NEO) DR. FONT GERMAN ALBERTO ', 
                '(NEO) MANRIQUE CLAUDIA', '(NEO)  DRA.RAMOS GABRIELA', '(NEO) MARTIN, AGUSTINA', 
                'GYM PREPARTO', 'GYM BARIATRICA'
            )
    `);
    console.table(q7.recordset);

    // 8. Breakdown general por agenda (todas las guardias) para ver los totales del spreadsheet
    console.log('\n═══ Q8: Breakdown por Agenda de TODAS las guardias (presente, únicos) ═══');
    const q8 = await pool.request().query(`
        SELECT 
            [Agenda],
            COUNT(DISTINCT idVisita) AS visitas_unicas
        FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
        WHERE [Fecha Visita] >= '20260601' AND [Fecha Visita] < '20260701'
          AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente'
          AND [Agenda] IN ('GUARDIA CARDIOLOGICA', 'GUARDIAS CLINICA', 'GUARDIAS GINECOLOGIA', N'GUARDIAS PEDIATRÍA')
        GROUP BY [Agenda]
        ORDER BY visitas_unicas DESC
    `);
    console.table(q8.recordset);

    await pool.close();
    console.log('\n✅ Investigación completada.');
}

main().catch(e => { console.error(e); process.exit(1); });
