import sql from 'mssql';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

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

async function testWaitTimesOutliers() {
    const pool = await sql.connect(SQL_CONFIG);

    const query = `
        DECLARE @FechaDesde DATETIME = '2026-09-01 00:00:00';
        DECLARE @FechaHasta DATETIME = '2026-09-30 23:59:59';

        WITH Consultas AS (
            SELECT 
                v.idVisita,
                v.NHC,
                v.Paciente,
                v.Cliente AS ObraSocial,
                v.Agenda,
                v.[Tipo Visita] AS TipoVisita,
                CONVERT(VARCHAR(10), v.[Fecha Visita], 103) AS FechaVisita,
                CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS HoraLlegada,
                CONVERT(VARCHAR(8), v.[Fecha Hora Entrada], 108) AS HoraAtencion,
                CONVERT(VARCHAR(8), v.[Fecha Salida Real], 108) AS HoraEgreso,
                CASE 
                    WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Hora Entrada] IS NOT NULL 
                         AND v.[Fecha Hora Entrada] >= v.[Fecha Entrada Real]
                    THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada])
                    ELSE NULL 
                END AS MinutosEspera,
                CASE 
                    WHEN v.[Fecha Entrada Real] IS NOT NULL AND v.[Fecha Salida Real] IS NOT NULL
                         AND v.[Fecha Salida Real] >= v.[Fecha Entrada Real]
                    THEN DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real])
                    ELSE NULL 
                END AS MinutosPermanencia
            FROM VLISE_Visitas v
            WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
              AND v.[Fecha Visita] >= @FechaDesde 
              AND v.[Fecha Visita] <= @FechaHasta
              AND v.Asistencia = 'Presente'
        )
        SELECT 
            COUNT(*) AS TotalConsultas,
            COUNT(MinutosEspera) AS ConEsperaRegistrada,
            AVG(MinutosEspera) AS PromedioEspera,
            MAX(MinutosEspera) AS MaxEspera,
            COUNT(CASE WHEN MinutosEspera <= 15 THEN 1 END) AS Espera_0_15m,
            COUNT(CASE WHEN MinutosEspera > 15 AND MinutosEspera <= 30 THEN 1 END) AS Espera_15_30m,
            COUNT(CASE WHEN MinutosEspera > 30 AND MinutosEspera <= 60 THEN 1 END) AS Espera_30_60m,
            COUNT(CASE WHEN MinutosEspera > 60 AND MinutosEspera <= 90 THEN 1 END) AS Espera_60_90m_Outlier,
            COUNT(CASE WHEN MinutosEspera > 90 THEN 1 END) AS Espera_Mas_90m_Critico,
            COUNT(CASE WHEN MinutosPermanencia > 180 AND MinutosPermanencia <= 240 THEN 1 END) AS Perm_3_4hs_Outlier,
            COUNT(CASE WHEN MinutosPermanencia > 240 THEN 1 END) AS Perm_Mas_4hs_Critico
        FROM Consultas;
    `;

    const res = await pool.request().query(query);
    console.table(res.recordset);

    const queryOutliers = `
        DECLARE @FechaDesde DATETIME = '2026-09-01 00:00:00';
        DECLARE @FechaHasta DATETIME = '2026-09-30 23:59:59';

        SELECT TOP 10
            v.Paciente,
            v.NHC,
            v.Cliente AS ObraSocial,
            CONVERT(VARCHAR(10), v.[Fecha Visita], 103) AS Fecha,
            CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS Llegada,
            CONVERT(VARCHAR(8), v.[Fecha Hora Entrada], 108) AS Atencion,
            DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada]) AS EsperaMin,
            DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Salida Real]) AS PermanenciaMin
        FROM VLISE_Visitas v
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= @FechaDesde 
          AND v.[Fecha Visita] <= @FechaHasta
          AND v.Asistencia = 'Presente'
          AND DATEDIFF(MINUTE, v.[Fecha Entrada Real], v.[Fecha Hora Entrada]) > 60
        ORDER BY EsperaMin DESC;
    `;
    const resOutliers = await pool.request().query(queryOutliers);
    console.log('Top 10 Outliers de Espera > 60 min en Septiembre:');
    console.table(resOutliers.recordset);

    await pool.close();
}

testWaitTimesOutliers().catch(console.error);
