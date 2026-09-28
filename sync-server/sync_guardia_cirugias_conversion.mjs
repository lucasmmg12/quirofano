import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const SQL_CONFIG = {
    server: process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_DB_PORT, 10) || 2450,
    user: process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DB_NAME || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 120000,
        connectionTimeout: 30000,
        tdsVersion: '7_4',
    }
};

/**
 * Parsea fecha string tipo "31/08/2026" o Date a formato "YYYY-MM-DD"
 */
function parseDateStr(raw) {
    if (!raw) return null;
    if (raw instanceof Date) {
        return raw.toISOString().split('T')[0];
    }
    const str = String(raw).trim();
    if (str.includes('/')) {
        const parts = str.split('/');
        if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const month = parts[1].padStart(2, '0');
            const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
            return `${year}-${month}-${day}`;
        }
    }
    return str.slice(0, 10);
}

/**
 * Calcula horas transcurridas entre llegada a guardia y cirugía
 */
function calcularHorasEspera(guardiaDateTime, cirugiaDateStr, cirugiaHoraStr) {
    try {
        if (!guardiaDateTime) return null;
        const gDate = new Date(guardiaDateTime);
        if (isNaN(gDate.getTime())) return null;

        const dateIso = parseDateStr(cirugiaDateStr);
        if (!dateIso) return null;

        const timeStr = cirugiaHoraStr ? String(cirugiaHoraStr).trim() : '12:00:00';
        const cDate = new Date(`${dateIso}T${timeStr}`);
        if (isNaN(cDate.getTime())) return null;

        const diffMs = cDate.getTime() - gDate.getTime();
        const diffHours = Math.round((diffMs / (1000 * 60 * 60)) * 10) / 10;
        return diffHours;
    } catch {
        return null;
    }
}

function asignarRangoEspera(horas) {
    if (horas === null || horas === undefined) return 'Sin Registro Horario';
    if (horas <= 6) return '< 6 hs (Emergencia Inmediata)';
    if (horas <= 12) return '6 - 12 hs (Urgencia Quirúrgica)';
    if (horas <= 24) return '12 - 24 hs (Resolución 24h)';
    if (horas <= 48) return '24 - 48 hs (Ventana 48h)';
    return '> 48 hs (Programación diferida)';
}

export async function syncCirugiasConversion(targetPeriodo = null) {
    let pool;
    try {
        console.log(`[SYNC-CIRUGIAS] Iniciando sincronización de cirugías derivadas de Guardia Clínica...`);
        pool = await sql.connect(SQL_CONFIG);

        const periodos = targetPeriodo 
            ? [targetPeriodo] 
            : [
                '2026-01', '2026-02', '2026-03', '2026-04', 
                '2026-05', '2026-06', '2026-07', '2026-08', '2026-09'
            ];

        for (const per of periodos) {
            const [y, m] = per.split('-').map(Number);
            const startDate = `${y}-${String(m).padStart(2, '0')}-01 00:00:00`;
            const lastDay = new Date(y, m, 0).getDate();
            const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')} 23:59:59`;

            console.log(`[SYNC-CIRUGIAS] Procesando período ${per} (${startDate} a ${endDate})...`);

            const q = `
                WITH GuardiaConsultas AS (
                    SELECT 
                        v.idVisita,
                        v.NHC,
                        v.NIF,
                        v.Paciente,
                        v.[Fecha Visita] AS FechaVisita,
                        v.[Fecha Entrada Real] AS FechaHoraLlegada
                    FROM VLISE_Visitas v
                    WHERE v.[Grupo Agenda] = 'GUARDIA CLINICA'
                      AND v.[Fecha Visita] >= '${startDate}'
                      AND v.[Fecha Visita] <= '${endDate}'
                      AND v.Asistencia = 'Presente'
                )
                SELECT 
                    g.idVisita AS idVisitaGuardia,
                    g.NHC,
                    g.NIF AS DNI,
                    g.Paciente,
                    g.FechaVisita,
                    g.FechaHoraLlegada,
                    c.idvisita AS idVisitaCirugia,
                    c.[Nombre cirugía] AS Cirugia,
                    c.Especialidad,
                    c.Cirujano,
                    c.Tipo AS TipoCirugia,
                    c.Estado AS EstadoCirugia,
                    c.[Obra Social] AS ObraSocial,
                    c.[Fecha programada] AS FechaProgramada,
                    c.[Hora programada] AS HoraProgramada,
                    c.[Fecha realización] AS FechaRealizacion,
                    c.[Hora Inicio cirugía] AS HoraInicioCirugia,
                    c.[Duracion Minutos Cirugia] AS DuracionMinutos
                FROM GuardiaConsultas g
                INNER JOIN TABLEAU_Cirugias c
                    ON g.NIF = c.DNI
                   AND c.[Fecha programada] >= CAST(g.FechaVisita AS DATE)
                   AND c.[Fecha programada] <= DATEADD(HOUR, 48, g.FechaHoraLlegada)
                WHERE c.[Fecha programada] >= '${startDate}'
                  AND c.[Fecha programada] <= DATEADD(DAY, 3, '${endDate}')
                ORDER BY g.FechaHoraLlegada ASC;
            `;

            const res = await pool.request().query(q);
            const rows = res.recordset || [];
            console.log(`[SYNC-CIRUGIAS] Período ${per}: Encontradas ${rows.length} cirugías derivadas de guardia.`);

            if (rows.length === 0) continue;

            const upsertRows = rows.map(r => {
                const fGuardia = r.FechaHoraLlegada ? new Date(r.FechaHoraLlegada) : new Date(r.FechaVisita);
                const fechaGuardiaStr = fGuardia.toISOString().split('T')[0];
                const horaGuardiaStr = fGuardia.toTimeString().split(' ')[0];

                const fechaCirugiaRaw = r.FechaRealizacion || r.FechaProgramada;
                const fechaCirugiaStr = parseDateStr(fechaCirugiaRaw);
                const horaCirugiaStr = r.HoraInicioCirugia || r.HoraProgramada || '00:00:00';

                let fechaHoraCirugiaIso = null;
                if (fechaCirugiaStr) {
                    try {
                        fechaHoraCirugiaIso = new Date(`${fechaCirugiaStr}T${horaCirugiaStr}`).toISOString();
                    } catch {}
                }

                const horasEspera = calcularHorasEspera(fGuardia, fechaCirugiaStr, horaCirugiaStr);
                const rangoEspera = asignarRangoEspera(horasEspera);

                return {
                    periodo: per,
                    id_visita_guardia: r.idVisitaGuardia,
                    id_visita_cirugia: r.idVisitaCirugia,
                    nhc: r.NHC ? String(r.NHC).trim() : null,
                    dni: r.DNI ? String(r.DNI).trim() : null,
                    paciente: (r.Paciente || 'DESCONOCIDO').trim(),
                    obra_social: (r.ObraSocial || 'Particular').trim(),
                    fecha_guardia: fechaGuardiaStr,
                    hora_guardia: horaGuardiaStr,
                    fecha_hora_guardia: fGuardia.toISOString(),
                    fecha_cirugia: fechaCirugiaStr,
                    hora_cirugia: horaCirugiaStr,
                    fecha_hora_cirugia: fechaHoraCirugiaIso,
                    horas_espera_qx: horasEspera,
                    rango_espera: rangoEspera,
                    cirugia_procedimiento: (r.Cirugia || 'CIRUGIA GENERAL').trim(),
                    especialidad: (r.Especialidad || 'CIRUGIA').trim(),
                    cirujano: r.Cirujano ? String(r.Cirujano).trim() : 'Sin Asignar',
                    tipo_cirugia: r.TipoCirugia ? String(r.TipoCirugia).trim() : null,
                    estado_cirugia: r.EstadoCirugia ? String(r.EstadoCirugia).trim() : 'Programada',
                    duracion_minutos: r.DuracionMinutos ? parseInt(r.DuracionMinutos, 10) : null
                };
            });

            // Upsert in batches of 50
            const batchSize = 50;
            for (let i = 0; i < upsertRows.length; i += batchSize) {
                const batch = upsertRows.slice(i, i + batchSize);
                const { error: upsertErr } = await supabase
                    .from('guardia_cirugias_conversion')
                    .upsert(batch, { onConflict: 'periodo, id_visita_guardia, id_visita_cirugia' });

                if (upsertErr) {
                    console.error(`[SYNC-CIRUGIAS] Error en upsert batch ${i}-${i + batch.length}:`, upsertErr.message);
                }
            }
            console.log(`[SYNC-CIRUGIAS] ✅ Período ${per} sincronizado con éxito (${upsertRows.length} registros).`);
        }

        console.log(`[SYNC-CIRUGIAS] Sincronización completa finalizada exitosamente.`);
    } catch (err) {
        console.error(`[SYNC-CIRUGIAS] Error crítico:`, err);
    } finally {
        if (pool) await pool.close();
    }
}

// Si se ejecuta directamente desde terminal
if (process.argv[1] && process.argv[1].endsWith('sync_guardia_cirugias_conversion.mjs')) {
    syncCirugiasConversion().then(() => process.exit(0)).catch(() => process.exit(1));
}
