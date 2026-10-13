import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envLocal = path.join(__dirname, '.env');
const envParent = path.join(__dirname, '..', '.env');
dotenv.config({ path: fs.existsSync(envLocal) ? envLocal : envParent });

const SQL_CONFIG = {
    server: process.env.SALUS_HOST || process.env.SALUS_DB_SERVER || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || process.env.SALUS_DB_PORT || '2450', 10),
    user: process.env.SALUS_USER || process.env.SALUS_DB_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || process.env.SALUS_DB_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || process.env.SALUS_DB_NAME || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 120000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    }
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hakysnqiryimxbwdslwe.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

/**
 * Extrae de SALUS:
 * 1. Pacientes de Cirugía Traumatológica que están o estuvieron en Internado (Piso / Quirófano)
 * 2. Interconsultas realizadas en Internado / UCI, clasificadas según si el médico actuante es Clínico
 */
export async function syncGuardiaInternado() {
    console.log('[sync_guardia_internado] Conectando a SALUS SQL Server...');
    const pool = await sql.connect(SQL_CONFIG);

    try {
        // ── 1. CIRUGÍAS TRAUMATOLÓGICAS EN INTERNADO (CONTROL CLÍNICO) ──
        const qTraumaInternado = `
            WITH CirugiasRecientes AS (
                SELECT 
                    c.[DNI] AS dni,
                    c.[Nombre Paciente] AS paciente,
                    c.[Fecha realización] AS fecha_cirugia_str,
                    CONVERT(VARCHAR(10), c.[Fecha programada], 120) AS fecha_programada,
                    c.[Hora Inicio cirugía] AS hora_cirugia,
                    c.[Nombre cirugía] AS cirugia,
                    c.[Especialidad] AS especialidad_cirugia,
                    c.[Cirujano] AS cirujano_traumatologo,
                    c.[Estado] AS estado_cirugia
                FROM [SALUS].[dbo].[TABLEAU_Cirugias] c
                WHERE (
                    c.[Especialidad] LIKE '%TRAUMATO%' 
                    OR c.[Nombre cirugía] LIKE '%FRACTURA%' 
                    OR c.[Nombre cirugía] LIKE '%OSTEOSINTESIS%' 
                    OR c.[Nombre cirugía] LIKE '%ARTROSCOPIA%'
                    OR c.[Nombre cirugía] LIKE '%PROTESIS%'
                    OR c.[Nombre cirugía] LIKE '%CADERA%'
                    OR c.[Nombre cirugía] LIKE '%RODILLA%'
                    OR c.[Nombre cirugía] LIKE '%LIGAMENTO%'
                )
                AND c.[Fecha programada] >= DATEADD(DAY, -60, GETDATE())
            ),
            AdmisionesRecientes AS (
                SELECT 
                    a.[Número admisión] AS numero_admision,
                    a.[Paciente] AS paciente,
                    a.[NIF] AS dni,
                    a.[NHC] AS nhc,
                    a.[Habitación] AS habitacion,
                    a.[Servicio] AS servicio,
                    CONVERT(VARCHAR(10), a.[Fecha ingreso], 120) AS fecha_ingreso,
                    CONVERT(VARCHAR(10), a.[Fecha alta], 120) AS fecha_alta,
                    a.[Doctor] AS medico_cabecera,
                    a.[Cliente] AS obra_social,
                    CASE WHEN a.[Fecha alta] IS NULL THEN 'Activo en Piso' ELSE 'Alta Otorgada' END AS estado_internacion
                FROM [SALUS].[dbo].[TABLEAU_Admisiones] a
                WHERE a.[Fecha ingreso] >= DATEADD(DAY, -60, GETDATE())
                   OR a.[Fecha alta] IS NULL
            )
            SELECT 
                adm.numero_admision,
                adm.paciente,
                adm.dni,
                adm.nhc,
                adm.habitacion,
                adm.servicio,
                adm.fecha_ingreso,
                adm.fecha_alta,
                adm.medico_cabecera,
                adm.obra_social,
                adm.estado_internacion,
                COALESCE(cir.fecha_cirugia_str, cir.fecha_programada) AS fecha_cirugia,
                cir.hora_cirugia,
                cir.cirugia,
                cir.especialidad_cirugia,
                cir.cirujano_traumatologo,
                cir.estado_cirugia
            FROM AdmisionesRecientes adm
            INNER JOIN CirugiasRecientes cir ON adm.dni = cir.dni
            ORDER BY 
                CASE WHEN adm.estado_internacion = 'Activo en Piso' THEN 0 ELSE 1 END,
                adm.fecha_ingreso DESC;
        `;

        // ── 2. INTERCONSULTAS EN INTERNADO Y UCI (DETECCIÓN DE MÉDICOS CLÍNICOS) ──
        const qInterconsultas = `
            SELECT TOP 200
                v.[idVisita] AS id_visita,
                v.[Paciente] AS paciente,
                v.[NIF] AS dni,
                v.[NHC] AS nhc,
                CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha_visita,
                CONVERT(VARCHAR(8), v.[Fecha Hora Creacion], 108) AS hora_creacion,
                v.[Tipo Visita] AS tipo_visita,
                v.[Responsable] AS medico_actuante,
                COALESCE(doc_esp.especialidad, v.[Visita_Especialidad], 'NO ESPECIFICADA') AS especialidad_medico,
                v.[Cliente] AS obra_social,
                v.[Asistencia] AS asistencia,
                COALESCE(adm.[Habitación], 'SIN CAMA') AS habitacion,
                COALESCE(adm.[Servicio], CASE WHEN v.[Tipo Visita] LIKE '%(UCI)%' THEN 'UCI' ELSE 'INTERNADO' END) AS servicio_internacion,
                CASE 
                    WHEN doc_esp.es_clinico = 1 OR v.[Visita_Especialidad] LIKE '%CLINIC%' OR v.[Tipo Visita] LIKE '%CLINIC%'
                    THEN 1 
                    ELSE 0 
                END AS es_medico_clinico
            FROM [SALUS].[dbo].[VLISE_Visitas] v
            LEFT JOIN (
                SELECT 
                    p.[Nombre] AS doctor,
                    MAX(e.[Descripcion]) AS especialidad,
                    MAX(CASE WHEN e.[Descripcion] LIKE '%CLINIC%' OR e.[Descripcion] LIKE '%MEDICINA INTERNA%' THEN 1 ELSE 0 END) AS es_clinico
                FROM [SALUS].[dbo].[Personal] p
                INNER JOIN [SALUS].[dbo].[PersonalEspecialidad] pe ON p.[id] = pe.[idPersonal]
                INNER JOIN [SALUS].[dbo].[Especialidades] e ON pe.[idEspecialidad] = e.[id]
                GROUP BY p.[Nombre]
            ) doc_esp ON v.[Responsable] = doc_esp.doctor
            OUTER APPLY (
                SELECT TOP 1 a.[Habitación], a.[Servicio]
                FROM [SALUS].[dbo].[TABLEAU_Admisiones] a
                WHERE a.[NIF] = v.[NIF] AND a.[NIF] != ''
                  AND v.[Fecha Visita] >= CONVERT(VARCHAR(10), a.[Fecha ingreso], 120)
                  AND (a.[Fecha alta] IS NULL OR v.[Fecha Visita] <= CONVERT(VARCHAR(10), a.[Fecha alta], 120))
                ORDER BY a.[Fecha ingreso] DESC
            ) adm
            WHERE v.[Tipo Visita] LIKE '%INTERCONSULTA%'
              AND v.[Fecha Visita] >= DATEADD(DAY, -60, GETDATE())
            ORDER BY v.[Fecha Visita] DESC, v.[Fecha Hora Creacion] DESC;
        `;

        console.log('[sync_guardia_internado] Ejecutando extracción de Traumatología en Internado...');
        const resTrauma = await pool.request().query(qTraumaInternado);
        const traumatologia = resTrauma.recordset || [];
        console.log(`[sync_guardia_internado] Traumatología: ${traumatologia.length} casos.`);

        console.log('[sync_guardia_internado] Ejecutando extracción de Interconsultas...');
        const resInter = await pool.request().query(qInterconsultas);
        const interconsultas = resInter.recordset || [];
        const clinicas = interconsultas.filter(i => i.es_medico_clinico === 1);
        console.log(`[sync_guardia_internado] Interconsultas: ${interconsultas.length} totales, ${clinicas.length} clínicas.`);

        const payload = {
            traumatologia,
            interconsultas,
            stats: {
                total_traumatologia: traumatologia.length,
                activos_piso_trauma: traumatologia.filter(t => t.estado_internacion === 'Activo en Piso').length,
                total_interconsultas: interconsultas.length,
                interconsultas_clinicas: clinicas.length,
                interconsultas_otras: interconsultas.length - clinicas.length,
                ultima_actualizacion: new Date().toISOString()
            }
        };

        // Guardar en Supabase app_config para persistencia y respaldo en la nube
        console.log('[sync_guardia_internado] Guardando en Supabase app_config (guardia_internado_cache)...');
        const { error: sbError } = await supabase
            .from('app_config')
            .upsert({
                key: 'guardia_internado_cache',
                value: JSON.stringify(payload),
                label: 'Caché de Traumatología en Internado e Interconsultas Clínicas',
                category: 'guardia_clinica',
                is_secret: false,
                updated_at: new Date().toISOString(),
                updated_by: 'sync_guardia_internado.mjs'
            }, { onConflict: 'key' });

        if (sbError) {
            console.warn('[sync_guardia_internado] Advertencia al guardar en Supabase:', sbError.message);
        } else {
            console.log('[sync_guardia_internado] ✅ Guardado exitoso en Supabase app_config.');
        }

        return payload;
    } finally {
        await pool.close();
    }
}

// Ejecución directa si se corre desde terminal
if (process.argv[1]?.endsWith('sync_guardia_internado.mjs')) {
    syncGuardiaInternado()
        .then(data => {
            console.log('\n--- Resumen Final ---');
            console.log(data.stats);
        })
        .catch(console.error);
}
