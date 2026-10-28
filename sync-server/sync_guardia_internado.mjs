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
 * 1. Admisiones Clínicas Médicas (Protocolo 557 - '(INT) ADMISION MEDICA CLINICA') con sus 44 campos pivoteados
 *    y cruzadas 1 a 1 con TABLEAU_Admisiones (IdHospitalizacion = idAdmision).
 * 2. Pacientes de Cirugía Traumatológica en Internado (Piso / Quirófano) enriquecidos con Protocolo 557.
 * 3. Interconsultas realizadas en Internado / UCI clasificadas por perfil clínico y enriquecidas con Protocolo 557.
 */
export async function syncGuardiaInternado() {
    console.log('[sync_guardia_internado] Conectando a SALUS SQL Server...');
    const pool = await sql.connect(SQL_CONFIG);

    try {
        // ── 1. ADMISIONES CLÍNICAS MÉDICAS (PROTOCOLO 557 - '(INT) ADMISION MEDICA CLINICA') ──
        const qAdmisiones557 = `
            WITH Visitas557 AS (
                SELECT 
                    v.idVisita AS id_visita,
                    v.IdPaciente AS id_paciente,
                    LTRIM(RTRIM(CAST(v.NHC AS VARCHAR(50)))) AS nhc,
                    LTRIM(RTRIM(CAST(v.NIF AS VARCHAR(50)))) AS dni,
                    LTRIM(RTRIM(v.Paciente)) AS paciente,
                    v.Edad AS edad,
                    v.Sexo AS sexo,
                    LTRIM(RTRIM(v.Cliente)) AS obra_social,
                    CONVERT(VARCHAR(7), v.[Fecha Visita], 120) AS periodo,
                    CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha_visita,
                    v.[Hora Inicio Visita Formato Texto] AS hora_visita,
                    LTRIM(RTRIM(v.Responsable)) AS medico_admision,
                    LTRIM(RTRIM(v.[Usuario Creacion Nombre])) AS usuario_creacion,
                    v.IdHospitalizacion AS id_hospitalizacion
                FROM [SALUS].[dbo].[VLISE_Visitas] v
                WHERE v.[Tipo Visita] = '(INT) ADMISION MEDICA CLINICA'
                  AND v.[Fecha Visita] >= '2026-07-01'
            ),
            RespuestasPivot AS (
                SELECT 
                    ir.idVisita,
                    MAX(CASE WHEN ir.idPreguntaPr = 13772 THEN resp.Descripcion END) AS reconsulta_72h,
                    MAX(CASE WHEN ir.idPreguntaPr = 13773 THEN resp.Descripcion END) AS reingreso_72h,
                    MAX(CASE WHEN ir.idPreguntaPr = 12590 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS motivo_consulta,
                    MAX(CASE WHEN ir.idPreguntaPr = 12591 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS enfermedad_actual,
                    MAX(CASE WHEN ir.idPreguntaPr = 12592 THEN resp.Descripcion END) AS alergia,
                    MAX(CASE WHEN ir.idPreguntaPr = 12593 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS alergia_cuales,
                    MAX(CASE WHEN ir.idPreguntaPr = 12594 THEN resp.Descripcion END) AS cirugias_previas,
                    MAX(CASE WHEN ir.idPreguntaPr = 12595 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS cirugias_cuales,
                    MAX(CASE WHEN ir.idPreguntaPr = 12596 THEN resp.Descripcion END) AS traumatologicos,
                    MAX(CASE WHEN ir.idPreguntaPr = 12597 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS traumatologicos_cuales,
                    MAX(CASE WHEN ir.idPreguntaPr = 12598 THEN resp.Descripcion END) AS transfusiones,
                    MAX(CASE WHEN ir.idPreguntaPr = 12599 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS transfusiones_cuales,
                    MAX(CASE WHEN ir.idPreguntaPr = 12600 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS ago,
                    MAX(CASE WHEN ir.idPreguntaPr = 12601 THEN resp.Descripcion END) AS controles_ginecologicos,
                    MAX(CASE WHEN ir.idPreguntaPr = 12602 THEN resp.Descripcion END) AS tabaco,
                    MAX(CASE WHEN ir.idPreguntaPr = 12603 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS tabaco_aclaraciones,
                    MAX(CASE WHEN ir.idPreguntaPr = 12604 THEN resp.Descripcion END) AS alcohol,
                    MAX(CASE WHEN ir.idPreguntaPr = 12605 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS alcohol_aclaraciones,
                    MAX(CASE WHEN ir.idPreguntaPr = 12606 THEN resp.Descripcion END) AS drogas,
                    MAX(CASE WHEN ir.idPreguntaPr = 12607 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS drogas_aclaraciones,
                    MAX(CASE WHEN ir.idPreguntaPr = 12608 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS patologias,
                    MAX(CASE WHEN ir.idPreguntaPr = 12609 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS medicacion_habitual,
                    MAX(CASE WHEN ir.idPreguntaPr = 12610 THEN resp.Descripcion END) AS internacion_ult_3m,
                    MAX(CASE WHEN ir.idPreguntaPr = 12611 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS observaciones_app,
                    MAX(CASE WHEN ir.idPreguntaPr = 12612 THEN COALESCE(NULLIF(LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(100)))), ''), CAST(ir.valorN AS NVARCHAR(100))) END) AS ta,
                    MAX(CASE WHEN ir.idPreguntaPr = 12613 THEN CAST(ir.valorN AS NVARCHAR(100)) END) AS fc,
                    MAX(CASE WHEN ir.idPreguntaPr = 12614 THEN CAST(ir.valorN AS NVARCHAR(100)) END) AS fr,
                    MAX(CASE WHEN ir.idPreguntaPr = 12615 THEN CAST(ir.valorN AS NVARCHAR(100)) END) AS sat,
                    MAX(CASE WHEN ir.idPreguntaPr = 12616 THEN CAST(ir.valorN AS NVARCHAR(100)) END) AS temp,
                    MAX(CASE WHEN ir.idPreguntaPr = 12617 THEN CAST(ir.valorN AS NVARCHAR(100)) END) AS peso,
                    MAX(CASE WHEN ir.idPreguntaPr = 12618 THEN CAST(ir.valorN AS NVARCHAR(100)) END) AS talla,
                    MAX(CASE WHEN ir.idPreguntaPr = 12619 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS cavidad_oral,
                    MAX(CASE WHEN ir.idPreguntaPr = 12620 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS piel_faneras,
                    MAX(CASE WHEN ir.idPreguntaPr = 13227 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS neurologico,
                    MAX(CASE WHEN ir.idPreguntaPr = 12621 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS ap_resp,
                    MAX(CASE WHEN ir.idPreguntaPr = 12623 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS ap_cv,
                    MAX(CASE WHEN ir.idPreguntaPr = 12628 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS abdomen,
                    MAX(CASE WHEN ir.idPreguntaPr = 12624 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS genitourinario,
                    MAX(CASE WHEN ir.idPreguntaPr = 12625 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS vascular_periferico,
                    MAX(CASE WHEN ir.idPreguntaPr = 12626 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS diagnostico,
                    MAX(CASE WHEN ir.idPreguntaPr = 13774 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS otros_diagnostico,
                    MAX(CASE WHEN ir.idPreguntaPr = 12627 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS plan_terapeutico,
                    MAX(CASE WHEN ir.idPreguntaPr = 13775 THEN resp.Descripcion END) AS destino_form,
                    MAX(CASE WHEN ir.idPreguntaPr = 13776 THEN resp.Descripcion END) AS area_form
                FROM [SALUS].[dbo].[PR InstRespVisitaPaciente] ir
                INNER JOIN Visitas557 v ON ir.idVisita = v.id_visita
                LEFT JOIN [SALUS].[dbo].[PR Respuestas] resp ON ir.idPredRP = resp.id
                GROUP BY ir.idVisita
            )
            SELECT 
                v.*,
                LTRIM(RTRIM(adm.[Número admisión])) AS numero_admision,
                LTRIM(RTRIM(adm.Habitación)) AS habitacion,
                LTRIM(RTRIM(adm.Servicio)) AS servicio_admision,
                LTRIM(RTRIM(adm.Especialidad)) AS especialidad_admision,
                LTRIM(RTRIM(adm.Doctor)) AS medico_cabecera,
                CONVERT(VARCHAR(10), adm.[Fecha ingreso], 120) AS fecha_ingreso,
                CONVERT(VARCHAR(10), adm.[Fecha alta], 120) AS fecha_alta,
                LTRIM(RTRIM(adm.[Motivo de alta])) AS motivo_alta,
                CASE 
                    WHEN adm.idAdmision IS NOT NULL AND adm.[Fecha alta] IS NULL THEN 'Activo en Piso' 
                    WHEN adm.idAdmision IS NOT NULL THEN 'Alta Otorgada'
                    ELSE 'Guardia / Ambulatorio' 
                END AS estado_internacion,
                rp.reconsulta_72h,
                rp.reingreso_72h,
                rp.motivo_consulta,
                rp.enfermedad_actual,
                rp.alergia,
                rp.alergia_cuales,
                rp.cirugias_previas,
                rp.cirugias_cuales,
                rp.traumatologicos,
                rp.traumatologicos_cuales,
                rp.transfusiones,
                rp.transfusiones_cuales,
                rp.ago,
                rp.controles_ginecologicos,
                rp.tabaco,
                rp.tabaco_aclaraciones,
                rp.alcohol,
                rp.alcohol_aclaraciones,
                rp.drogas,
                rp.drogas_aclaraciones,
                rp.patologias,
                rp.medicacion_habitual,
                rp.internacion_ult_3m,
                rp.observaciones_app,
                rp.ta,
                rp.fc,
                rp.fr,
                rp.sat,
                rp.temp,
                rp.peso,
                rp.talla,
                rp.cavidad_oral,
                rp.piel_faneras,
                rp.neurologico,
                rp.ap_resp,
                rp.ap_cv,
                rp.abdomen,
                rp.genitourinario,
                rp.vascular_periferico,
                rp.diagnostico,
                rp.otros_diagnostico,
                rp.plan_terapeutico,
                rp.destino_form,
                rp.area_form,
                CASE WHEN rp.motivo_consulta IS NOT NULL OR rp.enfermedad_actual IS NOT NULL OR rp.destino_form IS NOT NULL THEN 1 ELSE 0 END AS tiene_ficha_557
            FROM Visitas557 v
            LEFT JOIN [SALUS].[dbo].[TABLEAU_Admisiones] adm ON v.id_hospitalizacion = adm.idAdmision
            LEFT JOIN RespuestasPivot rp ON v.id_visita = rp.idVisita
            ORDER BY v.fecha_visita DESC, v.id_visita DESC;
        `;

        // ── 2. CIRUGÍAS TRAUMATOLÓGICAS EN INTERNADO (CONTROL CLÍNICO) ──
        const qTraumaInternado = `
            WITH CirugiasRecientes AS (
                SELECT 
                    LTRIM(RTRIM(CAST(c.[DNI] AS VARCHAR(50)))) AS dni,
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
                AND ISNULL(c.[Cirujano], '') NOT LIKE '%CHAPARRO%'
            ),
            AdmisionesRecientes AS (
                SELECT 
                    a.idAdmision AS id_admision,
                    LTRIM(RTRIM(a.[Número admisión])) AS numero_admision,
                    LTRIM(RTRIM(a.[Paciente])) AS paciente,
                    LTRIM(RTRIM(CAST(a.[NIF] AS VARCHAR(50)))) AS dni,
                    LTRIM(RTRIM(CAST(a.[NHC] AS VARCHAR(50)))) AS nhc,
                    LTRIM(RTRIM(a.[Habitación])) AS habitacion,
                    LTRIM(RTRIM(a.[Servicio])) AS servicio,
                    CONVERT(VARCHAR(10), a.[Fecha ingreso], 120) AS fecha_ingreso,
                    CONVERT(VARCHAR(10), a.[Fecha alta], 120) AS fecha_alta,
                    LTRIM(RTRIM(a.[Doctor])) AS medico_cabecera,
                    LTRIM(RTRIM(a.[Cliente])) AS obra_social,
                    CASE WHEN a.[Fecha alta] IS NULL THEN 'Activo en Piso' ELSE 'Alta Otorgada' END AS estado_internacion
                FROM [SALUS].[dbo].[TABLEAU_Admisiones] a
                WHERE (a.[Fecha ingreso] >= DATEADD(DAY, -60, GETDATE()) OR a.[Fecha alta] IS NULL)
                  -- Regla Dra. Paola García: Solo camas de Piso (excluir Chaparro, UCI, Terapia Intermedia hab 227/222-229/207, Pediatría 201-203 y Boxes)
                  AND ISNULL(a.[Doctor], '') NOT LIKE '%CHAPARRO%'
                  AND ISNULL(a.[Servicio], '') NOT IN ('UCI', 'TERAPIA INTERMEDIA', 'TERAPIA PEDIÁTRICA', 'PEDIATRÍA', 'NEONATOLOGÍA', 'CHEQUEO', 'HOSPITAL DE DIA', 'SHOCK ROOM')
                  AND ISNULL(a.[Habitación], '') NOT LIKE '22[2-9]%'
                  AND ISNULL(a.[Habitación], '') NOT LIKE '20[1-3]%'
                  AND ISNULL(a.[Habitación], '') NOT LIKE '207%'
                  AND ISNULL(a.[Habitación], '') NOT LIKE 'BOX%'
                  AND ISNULL(a.[Habitación], '') NOT LIKE 'CUNA%'
            )
            SELECT 
                adm.id_admision,
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

        // ── 3. INTERCONSULTAS EN INTERNADO Y UCI (DETECCIÓN DE MÉDICOS CLÍNICOS) ──
        const qInterconsultas = `
            SELECT TOP 250
                v.[idVisita] AS id_visita,
                LTRIM(RTRIM(v.[Paciente])) AS paciente,
                LTRIM(RTRIM(CAST(v.[NIF] AS VARCHAR(50)))) AS dni,
                LTRIM(RTRIM(CAST(v.[NHC] AS VARCHAR(50)))) AS nhc,
                v.IdHospitalizacion AS id_hospitalizacion,
                CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha_visita,
                CONVERT(VARCHAR(8), v.[Fecha Hora Creacion], 108) AS hora_creacion,
                v.[Tipo Visita] AS tipo_visita,
                LTRIM(RTRIM(v.[Responsable])) AS medico_actuante,
                COALESCE(doc_esp.especialidad, v.[Visita_Especialidad], 'NO ESPECIFICADA') AS especialidad_medico,
                LTRIM(RTRIM(v.[Cliente])) AS obra_social,
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

        console.log('[sync_guardia_internado] 1/3 Extrayendo Admisiones Clínicas Médicas (Protocolo 557)...');
        const resAdm557 = await pool.request().query(qAdmisiones557);
        const admisiones_clinicas = resAdm557.recordset || [];
        console.log(`[sync_guardia_internado] Protocolo 557: ${admisiones_clinicas.length} admisiones extraídas.`);

        // Crear mapas rápidos por id_hospitalizacion, NHC y DNI para enriquecer Traumatología e Interconsultas
        const mapByHosp = new Map();
        const mapByNhc = new Map();
        const mapByDni = new Map();
        for (const a of admisiones_clinicas) {
            if (a.id_hospitalizacion && !mapByHosp.has(a.id_hospitalizacion)) {
                mapByHosp.set(a.id_hospitalizacion, a);
            }
            if (a.nhc && !mapByNhc.has(a.nhc)) {
                mapByNhc.set(a.nhc, a);
            }
            if (a.dni && !mapByDni.has(a.dni)) {
                mapByDni.set(a.dni, a);
            }
        }

        console.log('[sync_guardia_internado] 2/3 Extrayendo Traumatología en Internado...');
        const resTrauma = await pool.request().query(qTraumaInternado);
        const traumatologia = (resTrauma.recordset || []).map(t => {
            const p557 = (t.id_admision && mapByHosp.get(t.id_admision)) || mapByNhc.get(String(t.nhc || '')) || mapByDni.get(String(t.dni || '')) || null;
            return {
                ...t,
                tiene_admision_557: !!p557,
                id_visita_557: p557?.id_visita || null,
                motivo_consulta_557: p557?.motivo_consulta || null,
                enfermedad_actual_557: p557?.enfermedad_actual || null,
                patologias_557: p557?.patologias || null,
                medicacion_557: p557?.medicacion_habitual || null,
                medico_admision_557: p557?.medico_admision || null,
                area_557: p557?.area_form || null
            };
        });
        console.log(`[sync_guardia_internado] Traumatología: ${traumatologia.length} casos.`);

        console.log('[sync_guardia_internado] 3/3 Extrayendo Interconsultas...');
        const resInter = await pool.request().query(qInterconsultas);
        const interconsultas = (resInter.recordset || []).map(i => {
            const p557 = (i.id_hospitalizacion && mapByHosp.get(i.id_hospitalizacion)) || mapByNhc.get(String(i.nhc || '')) || mapByDni.get(String(i.dni || '')) || null;
            return {
                ...i,
                tiene_admision_557: !!p557,
                id_visita_557: p557?.id_visita || null,
                motivo_consulta_557: p557?.motivo_consulta || null,
                enfermedad_actual_557: p557?.enfermedad_actual || null,
                patologias_557: p557?.patologias || null,
                medico_cabecera_557: p557?.medico_cabecera || null
            };
        });
        const clinicas = interconsultas.filter(i => i.es_medico_clinico === 1);
        console.log(`[sync_guardia_internado] Interconsultas: ${interconsultas.length} totales, ${clinicas.length} clínicas.`);

        const paolaCargadas = admisiones_clinicas.filter(a => 
            (a.medico_admision || '').toUpperCase().includes('GARCIA, PAOLA') ||
            (a.usuario_creacion || '').toUpperCase().includes('GARCIA, PAOLA')
        ).length;
        const paolaCabecera = admisiones_clinicas.filter(a => 
            (a.medico_cabecera || '').toUpperCase().includes('GARCIA, PAOLA')
        ).length;

        const payload = {
            admisiones_clinicas,
            traumatologia,
            interconsultas,
            stats: {
                total_admisiones_557: admisiones_clinicas.length,
                con_ficha_557: admisiones_clinicas.filter(a => a.tiene_ficha_557 === 1).length,
                activos_piso_557: admisiones_clinicas.filter(a => a.estado_internacion === 'Activo en Piso').length,
                paola_garcia_cargadas: paolaCargadas,
                paola_garcia_cabecera: paolaCabecera,
                area_shock_room: admisiones_clinicas.filter(a => a.area_form === 'Shock Room' || (a.servicio_admision || '').includes('SHOCK')).length,
                area_internado: admisiones_clinicas.filter(a => a.area_form === 'Internado' || (a.servicio_admision || '').includes('INTERN')).length,
                area_uci: admisiones_clinicas.filter(a => a.area_form === 'UCI' || (a.servicio_admision || '').includes('UCI') || (a.servicio_admision || '').includes('TERAPIA')).length,
                reconsultas_72h_557: admisiones_clinicas.filter(a => a.reconsulta_72h === 'Si').length,
                reingresos_72h_557: admisiones_clinicas.filter(a => a.reingreso_72h === 'Si').length,
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
                label: 'Caché de Admisiones Clínicas (Protocolo 557), Traumatología en Internado e Interconsultas',
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
