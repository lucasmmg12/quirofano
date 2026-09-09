import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const SQL_CONFIG = {
    server: process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DB_NAME || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 180000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
};

const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export async function syncCensoCamas() {
    console.log('[sync_censo] Conectando a SALUS SQL Server...');
    await sql.connect(SQL_CONFIG);

    const query = `
        WITH CamasTarget AS (
            SELECT '222' as hab_target, 1 as orden UNION ALL
            SELECT '223', 2 UNION ALL
            SELECT '224', 3 UNION ALL
            SELECT '225', 4 UNION ALL
            SELECT '226', 5 UNION ALL
            SELECT '227', 6 UNION ALL
            SELECT '228', 7 UNION ALL
            SELECT '229', 8 UNION ALL
            SELECT 'BOX 1', 9 UNION ALL
            SELECT 'BOX 2', 10 UNION ALL
            SELECT 'BOX 3', 11 UNION ALL
            SELECT 'BOX 4', 12 UNION ALL
            SELECT 'BOX 5', 13 UNION ALL
            SELECT 'BOX 6', 14 UNION ALL
            SELECT 'BOX 7', 15 UNION ALL
            SELECT 'BOX 8', 16
        ),
        AdmisionesActivas AS (
            SELECT 
                CASE 
                    WHEN [Habitación] LIKE '222%' THEN '222'
                    WHEN [Habitación] LIKE '223%' THEN '223'
                    WHEN [Habitación] LIKE '224%' THEN '224'
                    WHEN [Habitación] LIKE '225%' THEN '225'
                    WHEN [Habitación] LIKE '226%' THEN '226'
                    WHEN [Habitación] LIKE '227%' THEN '227'
                    WHEN [Habitación] LIKE '228%' THEN '228'
                    WHEN [Habitación] LIKE '229%' THEN '229'
                    WHEN [Habitación] LIKE 'BOX 1%' OR [Habitación] LIKE 'Box 1%' THEN 'BOX 1'
                    WHEN [Habitación] LIKE 'BOX 2%' OR [Habitación] LIKE 'Box 2%' THEN 'BOX 2'
                    WHEN [Habitación] LIKE 'BOX 3%' OR [Habitación] LIKE 'Box 3%' THEN 'BOX 3'
                    WHEN [Habitación] LIKE 'BOX 4%' OR [Habitación] LIKE 'Box 4%' THEN 'BOX 4'
                    WHEN [Habitación] LIKE 'BOX 5%' OR [Habitación] LIKE 'Box 5%' THEN 'BOX 5'
                    WHEN [Habitación] LIKE 'BOX 6%' OR [Habitación] LIKE 'Box 6%' THEN 'BOX 6'
                    WHEN [Habitación] LIKE 'BOX 7%' OR [Habitación] LIKE 'Box 7%' THEN 'BOX 7'
                    WHEN [Habitación] LIKE 'BOX 8%' OR [Habitación] LIKE 'Box 8%' THEN 'BOX 8'
                    ELSE NULL
                END as hab_normalizada,
                [Número admisión] as numero_admision,
                CONVERT(VARCHAR(10), [Fecha ingreso], 103) as [F ING],
                [Paciente] as [APELLIDO Y NOMBRE],
                CONVERT(VARCHAR(10), [fechaNacimiento], 103) as [F NAC],
                [NIF] as [DNI],
                [Cliente] as [O SOCIAL],
                COALESCE([Núm. Autorización], [Coseguro], '') as [Nº O SOCIAL],
                CONCAT([Edad], ' a') as [EDAD],
                COALESCE([telefono1], [telefono2], '') as [Nº TELEFONO],
                CASE 
                    WHEN [Servicio] = 'UCI' THEN 'uci'
                    WHEN [Servicio] = 'TERAPIA INTERMEDIA' THEN 'uci'
                    ELSE 'INT'
                END as [TIPO INTER],
                ROW_NUMBER() OVER(PARTITION BY 
                    CASE 
                        WHEN [Habitación] LIKE '222%' THEN '222'
                        WHEN [Habitación] LIKE '223%' THEN '223'
                        WHEN [Habitación] LIKE '224%' THEN '224'
                        WHEN [Habitación] LIKE '225%' THEN '225'
                        WHEN [Habitación] LIKE '226%' THEN '226'
                        WHEN [Habitación] LIKE '227%' THEN '227'
                        WHEN [Habitación] LIKE '228%' THEN '228'
                        WHEN [Habitación] LIKE '229%' THEN '229'
                        WHEN [Habitación] LIKE 'BOX 1%' OR [Habitación] LIKE 'Box 1%' THEN 'BOX 1'
                        WHEN [Habitación] LIKE 'BOX 2%' OR [Habitación] LIKE 'Box 2%' THEN 'BOX 2'
                        WHEN [Habitación] LIKE 'BOX 3%' OR [Habitación] LIKE 'Box 3%' THEN 'BOX 3'
                        WHEN [Habitación] LIKE 'BOX 4%' OR [Habitación] LIKE 'Box 4%' THEN 'BOX 4'
                        WHEN [Habitación] LIKE 'BOX 5%' OR [Habitación] LIKE 'Box 5%' THEN 'BOX 5'
                        WHEN [Habitación] LIKE 'BOX 6%' OR [Habitación] LIKE 'Box 6%' THEN 'BOX 6'
                        WHEN [Habitación] LIKE 'BOX 7%' OR [Habitación] LIKE 'Box 7%' THEN 'BOX 7'
                        WHEN [Habitación] LIKE 'BOX 8%' OR [Habitación] LIKE 'Box 8%' THEN 'BOX 8'
                    END 
                    ORDER BY [Fecha ingreso] DESC) as rn
            FROM TABLEAU_Admisiones
            WHERE [Fecha alta] IS NULL
              AND [Fecha ingreso] >= DATEADD(DAY, -60, GETDATE())
        )
        SELECT 
            c.hab_target as hab,
            c.orden,
            COALESCE(a.[F ING], '') as fecha_ingreso,
            COALESCE(a.[APELLIDO Y NOMBRE], '') as paciente,
            COALESCE(a.[F NAC], '') as fecha_nacimiento,
            COALESCE(a.[DNI], '') as dni,
            COALESCE(a.[O SOCIAL], '') as obra_social,
            COALESCE(a.[Nº O SOCIAL], '') as numero_afiliado,
            COALESCE(a.[EDAD], '') as edad,
            COALESCE(a.[Nº TELEFONO], '') as telefono,
            COALESCE(a.[TIPO INTER], '') as tipo_internacion,
            COALESCE(a.numero_admision, '') as numero_admision,
            CASE WHEN a.[APELLIDO Y NOMBRE] IS NOT NULL AND a.[APELLIDO Y NOMBRE] != '' THEN 'OCUPADA' ELSE 'LIBRE' END as estado
        FROM CamasTarget c
        LEFT JOIN AdmisionesActivas a ON c.hab_target = a.hab_normalizada AND a.rn = 1
        ORDER BY c.orden;
    `;

    const result = await sql.query(query);
    await sql.close();

    const rows = result.recordset.map(r => ({
        hab: r.hab,
        orden: r.orden,
        fecha_ingreso: r.fecha_ingreso,
        paciente: r.paciente,
        fecha_nacimiento: r.fecha_nacimiento,
        dni: r.dni,
        obra_social: r.obra_social,
        numero_afiliado: r.numero_afiliado,
        edad: r.edad,
        telefono: r.telefono,
        tipo_internacion: r.tipo_internacion,
        numero_admision: r.numero_admision,
        estado: r.estado,
        updated_at: new Date().toISOString()
    }));

    console.log(`[sync_censo] ${rows.length} camas obtenidas de SALUS. Sincronizando con Supabase...`);

    const { data, error } = await supabase
        .from('calidad_censo_camas_uci')
        .upsert(rows, { onConflict: 'hab' });

    if (error) {
        console.error('[sync_censo] Error en upsert a Supabase:', error);
        throw error;
    }

    console.log(`[sync_censo] ✅ 16 camas sincronizadas exitosamente en calidad_censo_camas_uci.`);
}

// Ejecutar si se llama directamente
if (process.argv[1]?.endsWith('sync_censo_camas.mjs')) {
    syncCensoCamas().catch(console.error);
}
