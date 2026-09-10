import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env del proyecto padre
config({ path: resolve(__dirname, '..', '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

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
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return val.toISOString();
    }
    return String(val);
}

function formatDateOnly(val) {
    if (!val) return null;
    if (val instanceof Date) {
        return val.toISOString().split('T')[0];
    }
    return String(val).split('T')[0];
}

export function parseSalusDate(str) {
    if (!str) return null;
    if (str instanceof Date) return str.toISOString();
    if (typeof str === 'string') {
        const parts = str.trim().split(' ');
        if (parts[0].includes('/')) {
            const [d, m, y] = parts[0].split('/').map(Number);
            const timeStr = parts[1] || '00:00:00';
            const [hh, mm, ss] = timeStr.split(':').map(Number);
            const pad = (n) => String(n).padStart(2, '0');
            return `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss || 0)}-03:00`;
        }
    }
    return new Date(str).toISOString();
}

/**
 * 1. Sincronizar Historial Granular de Camas y Traslados (Tramos exactos fechaInicio -> fechaFin)
 * Extrae de [TABLEAU_Admisiones con historial de camas2] JOIN TABLEAU_Admisiones
 */
export async function syncHistorialCamas(filtroServicio = null) {
    console.log('🛌 Iniciando Sincronización de Historial de Camas y Traslados...');
    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);
        console.log('✅ Conectado a SALUS (Historial Camas)');

        let query = `
            SELECT 
                h.idadmision,
                h.[Numero admision],
                h.Paciente,
                h.NombreHabitacion,
                h.NombreCama,
                h.fechaInicio,
                h.fechaFin,
                b.Especialidad,
                b.Cliente,
                b.[Motivo de alta],
                b.Edad,
                b.NHC,
                ISNULL(h.HOSP_Servicio, b.Servicio) AS Servicio,
                b.Procedencia
            FROM [TABLEAU_Admisiones con historial de camas2] h
            JOIN TABLEAU_Admisiones b ON h.idadmision = b.idAdmision
            WHERE (b.[Fecha alta] >= '2025-06-01' OR b.[Fecha alta] IS NULL)
        `;

        if (filtroServicio === 'UCI') {
            query += ` AND (
                h.HOSP_Servicio IN ('UCI', 'TERAPIA INTERMEDIA') 
                OR b.Servicio IN ('UCI', 'TERAPIA INTERMEDIA')
                OR h.NombreHabitacion LIKE '%BOX%'
                OR h.NombreHabitacion LIKE '%22[2-9]%'
            )`;
        } else if (filtroServicio) {
            query += ` AND (h.HOSP_Servicio = '${filtroServicio}' OR b.Servicio = '${filtroServicio}')`;
        }

        query += ` ORDER BY h.fechaInicio DESC`;

        console.log(`📋 Ejecutando extracción de historial de traslados (Filtro: ${filtroServicio || 'TODOS'})...`);
        const result = await pool.request().query(query);
        const records = result.recordset;
        console.log(`📥 Se extrajeron ${records.length} tramos de estancias en cama de SALUS.`);

        if (records.length === 0) {
            return { total: 0 };
        }

        // Mapear a esquema Supabase
        const dataToUpsert = records
            .filter(r => r.idadmision && r.NombreHabitacion && r.fechaInicio)
            .map(r => ({
                id_admision: Number(r.idadmision),
                numero_admision: r['Numero admision'] ? String(r['Numero admision']).trim() : null,
                paciente: r.Paciente ? String(r.Paciente).trim() : 'SIN NOMBRE',
                nhc: r.NHC ? String(r.NHC).trim() : null,
                servicio: r.Servicio ? String(r.Servicio).trim() : 'UCI',
                habitacion: String(r.NombreHabitacion).trim(),
                cama: r.NombreCama ? String(r.NombreCama).trim() : null,
                fecha_inicio: parseSalusDate(r.fechaInicio),
                fecha_fin: r.fechaFin ? parseSalusDate(r.fechaFin) : null,
                especialidad: r.Especialidad ? String(r.Especialidad).trim() : null,
                cliente: r.Cliente ? String(r.Cliente).trim() : null,
                edad: typeof r.Edad === 'number' ? r.Edad : parseInt(r.Edad, 10) || null,
                motivo_de_alta: r['Motivo de alta'] ? String(r['Motivo de alta']).trim() : null,
                procedencia: r.Procedencia ? String(r.Procedencia).trim() : null,
                updated_at: new Date().toISOString()
            }));

        console.log(`📦 Guardando en Supabase (tabla: calidad_admisiones_camas_historial)...`);
        const BATCH_SIZE = 1000;
        let insertedCount = 0;

        for (let i = 0; i < dataToUpsert.length; i += BATCH_SIZE) {
            const batch = dataToUpsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('calidad_admisiones_camas_historial')
                .upsert(batch, { onConflict: 'id_admision,habitacion,fecha_inicio' });

            if (error) {
                console.error(`❌ Error en lote historial ${i / BATCH_SIZE + 1}:`, error.message);
            } else {
                insertedCount += batch.length;
                console.log(`  -> Historial camas: ${insertedCount} / ${dataToUpsert.length} procesados...`);
            }
        }

        console.log(`✅ Sincronización de historial de camas completada: ${insertedCount} tramos.`);
        return { total: insertedCount };

    } finally {
        if (pool) await pool.close();
    }
}

/**
 * 2. Sincronización de Días Ocupación Canónicos (Tabla agregada por día)
 */
export async function syncOcupacion(filtroServicio = null) {
    console.log('🚀 Iniciando Sincronización Canónica de Días Ocupación...');
    console.log(`🔌 Conectando a SALUS SQL Server...`);

    let pool;
    try {
        pool = await sql.connect(SQL_CONFIG);
        console.log('✅ Conectado a SALUS');
    } catch (err) {
        console.error('❌ Error conectando a SALUS:', err.message);
        throw err;
    }

    try {
        let query = `
            SELECT 
                b.[Número admisión],
                DATEADD(DAY, v.number, CAST(b.[Fecha ingreso] AS DATE)) AS [Fecha Ocupacion],
                b.[Habitación],
                b.Especialidad,
                b.idAdmision,
                b.[Fecha ingreso],
                b.[Fecha alta],
                b.Procedencia,
                b.NHC,
                b.Paciente,
                b.[Motivo de alta],
                b.Cliente,
                b.[Estado Conceptos],
                b.Servicio,
                b.Proceso,
                b.Edad,
                b.[Motivo Alta],
                b.[Control ADM finalizado]
            FROM TABLEAU_Admisiones b
            JOIN master.dbo.spt_values v
              ON v.type = 'P' 
              AND v.number <= DATEDIFF(DAY, CAST(b.[Fecha ingreso] AS DATE), CAST(ISNULL(b.[Fecha alta], GETDATE()) AS DATE))
            WHERE (b.[Fecha alta] >= '2025-06-01' OR b.[Fecha alta] IS NULL)
        `;

        if (filtroServicio) {
            query += ` AND b.Servicio = '${filtroServicio}'`;
        }

        query += ` ORDER BY [Fecha Ocupacion] DESC`;

        console.log(`📋 Ejecutando consulta de desdoblamiento de días cama (Filtro: ${filtroServicio || 'TODOS'})...`);
        const result = await pool.request().query(query);
        const records = result.recordset;
        console.log(`📥 Se extrajeron ${records.length} registros de días cama de SALUS.`);

        if (records.length === 0) {
            console.log('No hay registros para procesar.');
            return { total: 0 };
        }

        // Mapear datos a Supabase
        const dataToUpsert = records.map(r => ({
            id_admision: r.idAdmision,
            numero_admision: r['Número admisión'] ? String(r['Número admisión']).trim() : null,
            fecha_ocupacion: formatDateOnly(r['Fecha Ocupacion']),
            habitacion: r['Habitación'] ? String(r['Habitación']).trim() : null,
            fecha_ingreso: formatDate(r['Fecha ingreso']),
            fecha_alta: formatDate(r['Fecha alta']),
            especialidad: r.Especialidad ? String(r.Especialidad).trim() : 'Sin Especialidad',
            procedencia: r.Procedencia ? String(r.Procedencia).trim() : null,
            nhc: r.NHC ? String(r.NHC).trim() : null,
            paciente: r.Paciente ? String(r.Paciente).trim() : null,
            motivo_de_alta: r['Motivo de alta'] ? String(r['Motivo de alta']).trim() : null,
            cliente: r.Cliente ? String(r.Cliente).trim() : null,
            estado_conceptos: r['Estado Conceptos'] ? String(r['Estado Conceptos']).trim() : null,
            servicio: r.Servicio ? String(r.Servicio).trim() : 'Sin Servicio',
            proceso: r.Proceso ? String(r.Proceso).trim() : null,
            edad: typeof r.Edad === 'number' ? r.Edad : parseInt(r.Edad, 10) || null,
            motivo_alta_2: r['Motivo Alta'] ? String(r['Motivo Alta']).trim() : null,
            control_adm_finalizado: r['Control ADM finalizado'] ? String(r['Control ADM finalizado']).trim() : null,
            updated_at: new Date().toISOString()
        }));

        console.log(`📦 Guardando en Supabase (tabla: calidad_admisiones_ocupacion)...`);

        const BATCH_SIZE = 1000;
        let insertedCount = 0;

        for (let i = 0; i < dataToUpsert.length; i += BATCH_SIZE) {
            const batch = dataToUpsert.slice(i, i + BATCH_SIZE);
            const { error } = await supabase
                .from('calidad_admisiones_ocupacion')
                .upsert(batch, { onConflict: 'id_admision,fecha_ocupacion' });

            if (error) {
                console.error(`❌ Error en lote ${i / BATCH_SIZE + 1}:`, error.message);
            } else {
                insertedCount += batch.length;
                console.log(`  -> Progreso: ${insertedCount} / ${dataToUpsert.length} filas procesadas...`);
            }
        }

        console.log(`✅ Sincronización de días cama finalizada: ${insertedCount} días cama.`);

        // Sincronizar simultáneamente el historial granular de camas
        try {
            await syncHistorialCamas(filtroServicio);
        } catch (errHist) {
            console.error('⚠️ Error sincronizando historial de camas:', errHist.message);
        }

        return { total: insertedCount };

    } finally {
        await pool.close();
    }
}

// Si se ejecuta directamente desde terminal
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const arg = process.argv[2] || null;
    if (arg === '--historial') {
        const serv = process.argv[3] || 'UCI';
        syncHistorialCamas(serv)
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err);
                process.exit(1);
            });
    } else {
        syncOcupacion(arg)
            .then(() => process.exit(0))
            .catch(err => {
                console.error('Error:', err);
                process.exit(1);
            });
    }
}
