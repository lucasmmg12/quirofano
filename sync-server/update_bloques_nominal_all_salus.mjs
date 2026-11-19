import sql from 'mssql';
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

function mapAgendaToSala(agenda, grupoAgenda) {
    const a = (agenda || '').toUpperCase();
    const g = (grupoAgenda || '').toUpperCase();
    if (a.includes('PARTO')) return 'SALA DE PARTO';
    if (a.includes('1')) return 'Qx 1';
    if (a.includes('2')) return 'Qx 2';
    if (a.includes('3')) return 'Qx 3';
    if (a.includes('4')) return 'Qx 4';
    if (a.includes('5')) return 'Qx 5 - HdD';
    if (a.includes('6') || a.includes('ENDOSCOP')) return 'Qx 6 - HdD';
    if (g.includes('HDD')) return 'Qx 5 - HdD';
    if (g.includes('HEMODINAMIA')) return 'HEMODINAMIA';
    return 'Qx 1';
}

async function run() {
    const pool = await sql.connect(SQL_CONFIG);
    console.log('Conectado a SALUS. Extrayendo TODAS las cirugías realizadas Ago-Nov 2026...');

    const res = await pool.request().query(`
        SELECT 
            v.idVisita,
            CONVERT(VARCHAR(10), CAST(v.[Fecha Visita] AS DATE), 120) AS fechaISO,
            CONVERT(VARCHAR(10), CAST(v.[Fecha Visita] AS DATE), 103) AS fechaLegible,
            COALESCE(
                NULLIF(LTRIM(RTRIM(tc.[Hora programada])), ''),
                NULLIF(LTRIM(RTRIM(tc.[Hora Inicio cirugía])), ''),
                CONVERT(VARCHAR(8), CAST(v.[Fecha Visita] AS TIME), 108),
                '08:00:00'
            ) AS hora,
            v.Agenda,
            v.[Grupo Agenda] AS GrupoAgenda,
            v.Paciente AS paciente,
            ISNULL(v.NIF, tc.DNI) AS dni,
            ISNULL(v.Cliente, tc.[Obra Social]) AS obraSocial,
            COALESCE(NULLIF(LTRIM(RTRIM(tc.[Nombre cirugía])), ''), v.[Tipo Visita]) AS procedimiento,
            COALESCE(
                NULLIF(LTRIM(RTRIM(tc.Cirujano)), ''),
                NULLIF(LTRIM(RTRIM(v.Responsable)), ''),
                v.[Grupo Agenda]
            ) AS cirujano,
            ISNULL(tc.[Duracion Minutos Cirugia], 45) AS rawDurFoja
        FROM dbo.VLISE_Visitas v WITH (NOLOCK)
        OUTER APPLY (
            SELECT TOP 1 
                Cirujano, 
                Anestesista,
                DNI,
                [Obra Social],
                [Nombre cirugía],
                [Hora programada],
                [Hora Inicio cirugía],
                [Duracion Minutos Cirugia]
            FROM dbo.TABLEAU_Cirugias c WITH (NOLOCK)
            WHERE c.idvisita = v.idVisita
        ) tc
        WHERE CAST(v.[Fecha Visita] AS DATE) >= '2026-08-01'
          AND CAST(v.[Fecha Visita] AS DATE) <= '2026-11-30'
          AND v.Asistencia IN ('Presente', 'URGENCIA', 'NO PROGRAMADA', 'INTERNADO')
          AND (
              v.[Grupo Agenda] IN (N'QUIRÓFANOS CENTRALES', N'QUIRÓFANOS HdD')
              OR (v.[Grupo Agenda] = N'HEMODINAMIA' AND tc.Anestesista IS NOT NULL AND LEN(LTRIM(RTRIM(tc.Anestesista))) > 0)
          )
          AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%COLOCACION DE MEDICAM%'
          AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%HEMOTERAPIA%'
          AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%HIERRO%'
          AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%FERROCARBOXIMALTOSA%'
          AND ISNULL(v.[Tipo Visita], '') NOT LIKE '%SACARATO%'
          AND ISNULL(v.Agenda, '') NOT LIKE '%HEMOTERAPIA%'
          AND ISNULL(v.Paciente, '') NOT LIKE '%Bloque%'
          AND v.IdPaciente IS NOT NULL
        ORDER BY CAST(v.[Fecha Visita] AS DATE) ASC, hora ASC, v.idVisita ASC
    `);

    console.log('Total registros extraídos de SALUS (Ago-Nov 2026):', res.recordset.length);

    const rows = res.recordset.map(r => {
        const durFoja = (r.rawDurFoja >= 10 && r.rawDurFoja <= 600) ? Number(r.rawDurFoja) : 45;
        return {
            fechaISO: r.fechaISO,
            fechaLegible: r.fechaLegible,
            hora: String(r.hora || '08:00:00').slice(0, 8),
            sala: mapAgendaToSala(r.Agenda, r.GrupoAgenda),
            paciente: (r.paciente || '').trim(),
            dni: String(r.dni || '').trim(),
            obraSocial: (r.obraSocial || 'PARTICULAR').trim(),
            procedimiento: (r.procedimiento || '(CX) INTERVENCION QUIRURGICA').trim(),
            cirujano: (r.cirujano || 'SIN ASIGNAR').trim(),
            durFojaMin: durFoja,
            durOcupacionMin: durFoja + 30
        };
    });

    // Preserve SALUS_ALERTAS_7DIAS_AGENDA from current file
    const currentFile = resolve(__dirname, '..', 'src', 'data', 'salusBloquesNominalData.js');
    const existingText = fs.readFileSync(currentFile, 'utf8');
    const alertasIdx = existingText.indexOf('export const SALUS_ALERTAS_7DIAS_AGENDA');
    const alertasSection = alertasIdx !== -1 ? existingText.slice(alertasIdx) : 'export const SALUS_ALERTAS_7DIAS_AGENDA = [];\n';

    const newContent = `// =========================================================================================
// DATOS REALES AUDITADOS DE SALUS (dbo.TABLEAU_Cirugias & dbo.VLISE_Visitas)
// Universo Completo de Cirugías Realizadas (Ago - Nov 2026) por Sala, Fecha, Hora y Prestador
// Permite auditar tanto las cirugías del Titular del Bloque como las de Otros Prestadores en esa Franja Horaria
// Fórmula de Ocupación: Duración Foja Quirúrgica + 30 min (15m pre-anestesia + 15m higiene/recambio)
// =========================================================================================

export const SALUS_BLOQUES_CIRUGIAS_REALES = ${JSON.stringify(rows, null, 2)};

${alertasSection}`;

    fs.writeFileSync(currentFile, newContent, 'utf8');
    console.log('Archivo src/data/salusBloquesNominalData.js actualizado con éxito con', rows.length, 'cirugías.');
    await pool.close();
}

run().catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
