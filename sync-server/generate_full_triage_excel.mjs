import sql from 'mssql';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import XLSX from 'xlsx';
import fs from 'fs';

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

async function exportFullTriageExcel() {
    console.log('🔄 Conectando a SALUS...');
    const pool = await sql.connect(SQL_CONFIG);

    const query = `
        DECLARE @FechaDesde DATETIME = '2026-09-01 00:00:00';
        DECLARE @FechaHasta DATETIME = '2026-09-30 23:59:59';

        WITH TriageReal AS (
            SELECT 
                r.idEntrada,
                MAX(CASE WHEN r.idPreguntaPr = 13807 THEN CAST(r.valorM AS VARCHAR(MAX)) END) AS ObservacionTriage,
                MAX(CASE WHEN r.idPreguntaPr = 13802 THEN r.valorN END) AS TD,
                MAX(CASE WHEN r.idPreguntaPr = 13814 THEN r.valorN END) AS TS,
                MAX(CASE WHEN r.idPreguntaPr = 13803 THEN r.valorN END) AS FC,
                MAX(CASE WHEN r.idPreguntaPr = 13804 THEN r.valorN END) AS Temp,
                MAX(CASE WHEN r.idPreguntaPr = 13815 THEN r.valorN END) AS SAO2
            FROM [PR InstRespEntrada] r
            WHERE r.idPreguntaPr IN (13802, 13814, 13803, 13804, 13805, 13806, 13815, 13807)
              AND r.activo = 1
            GROUP BY r.idEntrada
        )
        SELECT 
            ROW_NUMBER() OVER (ORDER BY v.[Fecha Visita] ASC, v.[Fecha Entrada Real] ASC) AS [N°],
            v.Paciente,
            v.NHC,
            v.Cliente AS [Obra Social],
            v.Agenda,
            v.[Tipo Visita] AS [Tipo de Visita],
            CONVERT(VARCHAR(10), v.[Fecha Visita], 103) AS [Fecha de Visita],
            CONVERT(VARCHAR(8), v.[Fecha Entrada Real], 108) AS [Hora Entrada],
            CASE 
                WHEN UPPER(tr.ObservacionTriage) LIKE '%ROJO%' THEN 'N1 Rojo (Emergencia)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%NARANJA%' THEN 'N2 Naranja (Muy Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AMARILLO%' THEN 'N3 Amarillo (Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%VERDE%' THEN 'N4 Verde (Poco Urgente)'
                WHEN UPPER(tr.ObservacionTriage) LIKE '%AZUL%' THEN 'N5 Azul (No Urgente)'
                ELSE 'Evaluado Clínico / Signos'
            END AS [Nivel de Triage],
            ISNULL(tr.ObservacionTriage, '-') AS [Observación de Enfermería],
            ISNULL(CAST(tr.TS AS VARCHAR(10)), '-') AS [T.A. Sistólica],
            ISNULL(CAST(tr.TD AS VARCHAR(10)), '-') AS [T.A. Diastólica],
            ISNULL(CAST(tr.FC AS VARCHAR(10)), '-') AS [Frec. Cardíaca],
            ISNULL(CAST(tr.Temp AS VARCHAR(10)), '-') AS [Temperatura],
            ISNULL(CAST(tr.SAO2 AS VARCHAR(10)), '-') AS [Sat. O2 %]
        FROM VLISE_Visitas v
        INNER JOIN TriageReal tr ON v.idEntrada = tr.idEntrada
        WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
          AND v.[Fecha Visita] >= @FechaDesde 
          AND v.[Fecha Visita] <= @FechaHasta
          AND v.Asistencia = 'Presente'
        ORDER BY v.[Fecha Visita] ASC, v.[Fecha Entrada Real] ASC;
    `;

    const res = await pool.request().query(query);
    const rows = res.recordset;
    console.log(`✅ Obtenidos ${rows.length} registros reales de SALUS.`);

    // Crear libro Excel
    const wb = XLSX.utils.book_new();

    // Hoja 1: Resumen Ejecutivo
    const summaryData = [
        ['SANATORIO ARGENTINO — AUDITORÍA Y GOBERNANZA DE DATOS'],
        ['REPORTE OFICIAL DE TRIAGE DE ENFERMERÍA EN GUARDIA CLÍNICA'],
        ['Período: Septiembre 2026 | Protocolo SALUS 621 (InstRespEntrada)'],
        ['Fecha de Extracción:', new Date().toLocaleString('es-AR')],
        [],
        ['MÉTRICA / INDICADOR', 'CANTIDAD', 'DISTRIBUCIÓN %'],
        ['Total Consultas con Triage Realizado', rows.length, '100.0%'],
        ['Evaluado Clínico / Signos Vitales', rows.filter(r => r['Nivel de Triage'] === 'Evaluado Clínico / Signos').length, `${((rows.filter(r => r['Nivel de Triage'] === 'Evaluado Clínico / Signos').length / rows.length) * 100).toFixed(1)}%`],
        ['N3 Amarillo (Urgente)', rows.filter(r => r['Nivel de Triage'] === 'N3 Amarillo (Urgente)').length, `${((rows.filter(r => r['Nivel de Triage'] === 'N3 Amarillo (Urgente)').length / rows.length) * 100).toFixed(1)}%`],
        ['N4 Verde (Poco Urgente)', rows.filter(r => r['Nivel de Triage'] === 'N4 Verde (Poco Urgente)').length, `${((rows.filter(r => r['Nivel de Triage'] === 'N4 Verde (Poco Urgente)').length / rows.length) * 100).toFixed(1)}%`],
        ['N1 Rojo / N2 Naranja (Emergencia)', rows.filter(r => r['Nivel de Triage'].includes('Rojo') || r['Nivel de Triage'].includes('Naranja')).length, '0.0%'],
        [],
        ['Nota técnica:', 'Los datos provienen de la tabla nativa PR InstRespEntrada de SALUS vinculada por idEntrada a VLISE_Visitas.']
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumen');

    // Hoja 2: Detalle Nominal Completo de Pacientes
    const wsDetail = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, wsDetail, 'Pacientes Triage Completo');

    // Rutas de guardado
    const publicPath = resolve(__dirname, '..', 'public', 'Triage_Enfermeria_Septiembre2026_Completo.xlsx');
    const desktopPath = 'C:\\Users\\Sanatorio Argentino\\Desktop\\Triage_Enfermeria_Septiembre2026_Completo.xlsx';

    XLSX.writeFile(wb, publicPath);
    console.log(`💾 Guardado en public: ${publicPath}`);

    try {
        XLSX.writeFile(wb, desktopPath);
        console.log(`💾 Guardado en Escritorio: ${desktopPath}`);
    } catch (e) {
        console.warn('No se pudo guardar en escritorio directamente:', e.message);
    }

    await pool.close();
}

exportFullTriageExcel().catch(console.error);
