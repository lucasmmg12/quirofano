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
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
};

async function testCensus() {
    try {
        await sql.connect(SQL_CONFIG);
        
        // Consultar los pacientes internados actualmente en las 16 camas de UCI e Intermedia
        const res = await sql.query(`
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
                c.hab_target as HAB,
                COALESCE(a.[F ING], '') as [F ING],
                COALESCE(a.[APELLIDO Y NOMBRE], '') as [APELLIDO Y NOMBRE],
                COALESCE(a.[F NAC], '') as [F NAC],
                COALESCE(a.[DNI], '') as [DNI],
                COALESCE(a.[O SOCIAL], '') as [O SOCIAL],
                COALESCE(a.[Nº O SOCIAL], '') as [Nº O SOCIAL],
                COALESCE(a.[EDAD], '') as [EDAD],
                COALESCE(a.[Nº TELEFONO], '') as [Nº TELEFONO],
                COALESCE(a.[TIPO INTER], '') as [TIPO INTER]
            FROM CamasTarget c
            LEFT JOIN AdmisionesActivas a ON c.hab_target = a.hab_normalizada AND a.rn = 1
            ORDER BY c.orden;
        `);

        console.table(res.recordset);
        await sql.close();
    } catch(e) {
        console.error(e);
    }
}
testCensus();
