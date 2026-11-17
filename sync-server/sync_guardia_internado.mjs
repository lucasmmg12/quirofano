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
                  AND v.[Fecha Visita] >= '2026-01-01'
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
                CASE 
                    WHEN NULLIF(LTRIM(RTRIM(ISNULL(rp.motivo_consulta, ''))), '') IS NOT NULL
                      OR NULLIF(LTRIM(RTRIM(ISNULL(rp.enfermedad_actual, ''))), '') IS NOT NULL
                      OR NULLIF(LTRIM(RTRIM(ISNULL(rp.diagnostico, ''))), '') IS NOT NULL
                      OR NULLIF(LTRIM(RTRIM(ISNULL(rp.plan_terapeutico, ''))), '') IS NOT NULL
                      OR NULLIF(LTRIM(RTRIM(ISNULL(rp.patologias, ''))), '') IS NOT NULL
                      OR rp.destino_form IS NOT NULL
                    THEN 1 
                    ELSE 0 
                END AS tiene_ficha_557
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
                AND c.[Fecha programada] >= '2026-01-01'
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
                    CONVERT(VARCHAR(7), a.[Fecha ingreso], 120) AS periodo,
                    CONVERT(VARCHAR(10), a.[Fecha ingreso], 120) AS fecha_ingreso,
                    CONVERT(VARCHAR(10), a.[Fecha alta], 120) AS fecha_alta,
                    LTRIM(RTRIM(a.[Doctor])) AS medico_cabecera,
                    LTRIM(RTRIM(a.[Cliente])) AS obra_social,
                    CASE WHEN a.[Fecha alta] IS NULL THEN 'Activo en Piso' ELSE 'Alta Otorgada' END AS estado_internacion
                FROM [SALUS].[dbo].[TABLEAU_Admisiones] a
                WHERE (a.[Fecha ingreso] >= '2026-01-01' OR a.[Fecha alta] IS NULL)
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
                adm.periodo,
                adm.fecha_ingreso,
                adm.fecha_alta,
                adm.medico_cabecera,
                adm.obra_social,
                adm.estado_internacion,
                cir.fecha_programada AS fecha_cirugia_iso,
                COALESCE(cir.fecha_cirugia_str, cir.fecha_programada) AS fecha_cirugia,
                cir.hora_cirugia,
                cir.cirugia,
                cir.especialidad_cirugia,
                cir.cirujano_traumatologo,
                cir.estado_cirugia
            FROM AdmisionesRecientes adm
            INNER JOIN CirugiasRecientes cir ON adm.dni = cir.dni
              AND cir.fecha_programada >= CONVERT(VARCHAR(10), DATEADD(DAY, -2, CAST(adm.fecha_ingreso AS DATE)), 120)
              AND cir.fecha_programada <= CONVERT(VARCHAR(10), ISNULL(CAST(adm.fecha_alta AS DATE), DATEADD(DAY, 15, CAST(adm.fecha_ingreso AS DATE))), 120)
            ORDER BY 
                CASE WHEN adm.estado_internacion = 'Activo en Piso' THEN 0 ELSE 1 END,
                adm.fecha_ingreso DESC;
        `;

        // ── 3. INTERCONSULTAS EN INTERNADO Y UCI (CON EXTRACCIÓN DE EVOLUCIÓN 6548 + FALLBACK MISMO DÍA) ──
        const qInterconsultas = `
            WITH VisitasInter AS (
                SELECT
                    v.[idVisita] AS id_visita,
                    LTRIM(RTRIM(v.[Paciente])) AS paciente,
                    LTRIM(RTRIM(CAST(v.[NIF] AS VARCHAR(50)))) AS dni,
                    LTRIM(RTRIM(CAST(v.[NHC] AS VARCHAR(50)))) AS nhc,
                    v.IdHospitalizacion AS id_hospitalizacion,
                    CONVERT(VARCHAR(7), v.[Fecha Visita], 120) AS periodo,
                    CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha_visita,
                    CONVERT(VARCHAR(8), v.[Fecha Hora Creacion], 108) AS hora_creacion,
                    v.[Fecha Hora Creacion] AS fh_creacion_raw,
                    v.[Tipo Visita] AS tipo_visita,
                    LTRIM(RTRIM(v.[Responsable])) AS medico_actuante,
                    v.[Visita_Especialidad] AS visita_especialidad,
                    LTRIM(RTRIM(v.[Cliente])) AS obra_social,
                    v.[Asistencia] AS asistencia
                FROM [SALUS].[dbo].[VLISE_Visitas] v
                WHERE v.[Tipo Visita] LIKE '%INTERCONSULTA%'
                  AND v.[Fecha Visita] >= '2026-01-01'
            ),
            RespInter AS (
                SELECT
                    ir.idVisita,
                    MAX(CASE WHEN ir.idPreguntaPr = 6548 THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS evolucion_6548,
                    MAX(CASE WHEN ir.idPreguntaPr != 6548 AND ir.valorM IS NOT NULL THEN LTRIM(RTRIM(CAST(ir.valorM AS NVARCHAR(MAX)))) END) AS otro_texto_pr,
                    MAX(CASE WHEN ir.idPreguntaPr = 6547 THEN ir.valorN END) AS id_prof_6547
                FROM [SALUS].[dbo].[PR InstRespVisitaPaciente] ir
                INNER JOIN VisitasInter vi ON ir.idVisita = vi.id_visita
                GROUP BY ir.idVisita
            ),
            DocEsp AS (
                SELECT 
                    p.[Nombre] AS doctor,
                    MAX(e.[Descripcion]) AS especialidad,
                    MAX(CASE WHEN e.[Descripcion] LIKE '%CLINIC%' OR e.[Descripcion] LIKE '%MEDICINA INTERNA%' THEN 1 ELSE 0 END) AS es_clinico
                FROM [SALUS].[dbo].[Personal] p
                INNER JOIN [SALUS].[dbo].[PersonalEspecialidad] pe ON p.[id] = pe.[idPersonal]
                INNER JOIN [SALUS].[dbo].[Especialidades] e ON pe.[idEspecialidad] = e.[id]
                GROUP BY p.[Nombre]
            ),
            PacientesSinTexto AS (
                SELECT DISTINCT vi.dni, vi.fecha_visita
                FROM VisitasInter vi
                LEFT JOIN RespInter ri ON vi.id_visita = ri.idVisita
                WHERE NULLIF(ri.evolucion_6548, '') IS NULL
                  AND NULLIF(ri.otro_texto_pr, '') IS NULL
                  AND ISNULL(vi.dni, '') <> ''
            ),
            EvolucionesMismoDia AS (
                SELECT
                    LTRIM(RTRIM(CAST(v2.[NIF] AS VARCHAR(50)))) AS dni,
                    CONVERT(VARCHAR(10), v2.[Fecha Visita], 120) AS fecha_visita,
                    MAX(LTRIM(RTRIM(CAST(ir2.valorM AS NVARCHAR(MAX))))) AS texto_evolucion
                FROM [SALUS].[dbo].[VLISE_Visitas] v2
                INNER JOIN PacientesSinTexto pst
                    ON v2.[NIF] = pst.dni
                   AND CONVERT(VARCHAR(10), v2.[Fecha Visita], 120) = pst.fecha_visita
                INNER JOIN [SALUS].[dbo].[PR InstRespVisitaPaciente] ir2
                    ON v2.idVisita = ir2.idVisita AND ir2.valorM IS NOT NULL
                WHERE v2.[Fecha Visita] >= '2026-01-01'
                  AND v2.[Tipo Visita] IN ('(INT) EVOLUCION MEDICA DIARIA', '(REGMED) REGISTRO MEDICO')
                  AND LTRIM(RTRIM(CAST(ir2.valorM AS NVARCHAR(MAX)))) <> ''
                GROUP BY
                    LTRIM(RTRIM(CAST(v2.[NIF] AS VARCHAR(50)))),
                    CONVERT(VARCHAR(10), v2.[Fecha Visita], 120)
            )
            SELECT
                vi.id_visita,
                vi.paciente,
                vi.dni,
                vi.nhc,
                COALESCE(vi.id_hospitalizacion, adm.idAdmision) AS id_hospitalizacion,
                vi.periodo,
                vi.fecha_visita,
                vi.hora_creacion,
                vi.tipo_visita,
                vi.medico_actuante,
                COALESCE(doc_esp.especialidad, vi.visita_especialidad, 'NO ESPECIFICADA') AS especialidad_medico,
                vi.obra_social,
                vi.asistencia,
                COALESCE(LTRIM(RTRIM(adm.[Habitación])), 'SIN CAMA') AS habitacion,
                COALESCE(LTRIM(RTRIM(adm.[Servicio])), CASE WHEN vi.tipo_visita LIKE '%(UCI)%' THEN 'UCI' ELSE 'INTERNADO' END) AS servicio_internacion,
                LTRIM(RTRIM(adm.[Especialidad])) AS especialidad_admision,
                LTRIM(RTRIM(adm.[Doctor])) AS medico_cabecera_adm,
                CASE 
                    WHEN doc_esp.es_clinico = 1 OR vi.visita_especialidad LIKE '%CLINIC%' OR vi.tipo_visita LIKE '%CLINIC%'
                    THEN 1 
                    ELSE 0 
                END AS es_medico_clinico,
                COALESCE(NULLIF(ri.evolucion_6548, ''), NULLIF(ri.otro_texto_pr, ''), NULLIF(ev_dia.texto_evolucion, '')) AS evolucion_interconsulta,
                CASE
                    WHEN NULLIF(ri.evolucion_6548, '') IS NOT NULL OR NULLIF(ri.otro_texto_pr, '') IS NOT NULL THEN 'Ficha Interconsulta (6548)'
                    WHEN NULLIF(ev_dia.texto_evolucion, '') IS NOT NULL THEN 'Evolución Médica Mismo Día'
                    ELSE NULL
                END AS origen_evolucion,
                LTRIM(RTRIM(p_sol.[Nombre])) AS medico_solicitante_6547
            FROM VisitasInter vi
            LEFT JOIN RespInter ri ON vi.id_visita = ri.idVisita
            LEFT JOIN [SALUS].[dbo].[Personal] p_sol ON ri.id_prof_6547 = p_sol.id
            LEFT JOIN DocEsp doc_esp ON vi.medico_actuante = doc_esp.doctor
            LEFT JOIN EvolucionesMismoDia ev_dia
                ON vi.dni = ev_dia.dni AND vi.fecha_visita = ev_dia.fecha_visita
            OUTER APPLY (
                SELECT TOP 1 a.idAdmision, a.[Habitación], a.[Servicio], a.[Especialidad], a.[Doctor]
                FROM [SALUS].[dbo].[TABLEAU_Admisiones] a
                WHERE a.[NIF] = vi.dni AND vi.dni <> ''
                  AND vi.fecha_visita >= CONVERT(VARCHAR(10), a.[Fecha ingreso], 120)
                  AND (a.[Fecha alta] IS NULL OR vi.fecha_visita <= CONVERT(VARCHAR(10), a.[Fecha alta], 120))
                ORDER BY a.[Fecha ingreso] DESC
            ) adm
            ORDER BY vi.fecha_visita DESC, vi.fh_creacion_raw DESC;
        `;

        console.log('[sync_guardia_internado] 1/3 Extrayendo Admisiones Clínicas Médicas (Protocolo 557)...');
        const resAdm557 = await pool.request().query(qAdmisiones557);
        const raw557 = resAdm557.recordset || [];

        // 1.A Descartar clics vacíos (tiene_ficha_557 === 0) donde se abrió (INT) ADMISION MEDICA CLINICA por error sin cargar ningún dato
        const filled557 = raw557.filter(a => a.tiene_ficha_557 === 1);
        const vaciasDescartadas = raw557.length - filled557.length;

        // 1.B Ordenar cronológicamente para detectar la 1° admisión por hospitalización vs re-evaluaciones / interconsultas posteriores
        const asc557 = [...filled557].sort((a, b) => {
            const da = `${a.fecha_visita || ''} ${a.hora_visita || ''}`;
            const db = `${b.fecha_visita || ''} ${b.hora_visita || ''}`;
            return da.localeCompare(db) || ((a.id_visita || 0) - (b.id_visita || 0));
        });

        const seenHospCount = new Map();
        const hospOrderMap = new Map();
        for (const row of asc557) {
            const hospKey = row.id_hospitalizacion ? `H_${row.id_hospitalizacion}` : `P_${row.dni || row.nhc}_${row.periodo}`;
            const prev = seenHospCount.get(hospKey) || 0;
            seenHospCount.set(hospKey, prev + 1);
            hospOrderMap.set(row.id_visita, prev + 1);
        }

        const admisiones_clinicas = [];
        const interconsultas_en_557 = [];

        for (const a of filled557) {
            const rnHosp = hospOrderMap.get(a.id_visita) || 1;
            const espAdm = String(a.especialidad_admision || '').trim().toUpperCase();
            const servAdm = String(a.servicio_admision || '').trim().toUpperCase();
            const hab = String(a.habitacion || '').trim().toUpperCase();
            const areaForm = String(a.area_form || '').trim();
            const destForm = String(a.destino_form || '').trim();
            const mcLower = String(a.motivo_consulta || '').toLowerCase();
            const eaLower = String(a.enfermedad_actual || '').toLowerCase();

            // Determinar el sector real de la evaluación (evitando que 'INTERNACION CLINICA' en Shock Room se cuente como Piso)
            let sector_real = 'internado';
            if (areaForm === 'UCI' || servAdm.includes('UCI') || servAdm.includes('TERAPIA') || /^22[2-9]/.test(hab) || /^207/.test(hab)) {
                sector_real = 'uci';
            } else if (areaForm === 'Shock Room' || servAdm === 'SHOCK ROOM' || hab.startsWith('BOX') || destForm === 'Ambulatorio') {
                sector_real = 'shock_room';
            } else if (areaForm === 'Internado') {
                sector_real = 'internado';
            } else if (servAdm.includes('QUIROF') || servAdm.includes('CIRUGIA')) {
                sector_real = 'quirofano';
            }

            // Detectar si este formulario 557 en realidad fue una Interconsulta / Cogestión Clínica en Piso:
            // - Paciente internado en Piso bajo otra especialidad (CIRUGIA, GASTROENTEROLOGIA, TRAUMATOLOGIA, UROLOGIA, GINECOLOGIA, etc.)
            // - O segunda ficha 557 cargada días después en la misma internación (rnHosp > 1, ej. pase de terapia o revaloración)
            // - O motivo de consulta que declara explícitamente interconsulta / valoración a pedido
            const esOtraEspecialidadEnPiso = (sector_real === 'internado' || sector_real === 'quirofano') &&
                espAdm !== '' &&
                !['CLINICO', 'CLINICA MEDICA', 'MEDICINA INTERNA'].includes(espAdm);
            const esTextoInterconsulta = mcLower.includes('interconsulta') || eaLower.includes('pedido de interconsulta') || mcLower.includes('pase de terapia');

            const esInterconsulta557 = esOtraEspecialidadEnPiso || rnHosp > 1 || esTextoInterconsulta;

            const enrichedRow = {
                ...a,
                sector_real,
                rn_hospitalizacion: rnHosp,
                es_interconsulta_557: esInterconsulta557 ? 1 : 0,
                tipo_registro_557: esInterconsulta557
                    ? (esOtraEspecialidadEnPiso ? `Cogestión / Interconsulta en ${espAdm}` : 'Revaloración / Pase en Piso')
                    : 'Admisión Clínica'
            };

            if (esInterconsulta557) {
                interconsultas_en_557.push(enrichedRow);
            } else {
                admisiones_clinicas.push(enrichedRow);
            }
        }

        console.log(`[sync_guardia_internado] Protocolo 557: ${raw557.length} brutos -> ${vaciasDescartadas} vacíos descartados, ${admisiones_clinicas.length} Admisiones Clínicas puras, ${interconsultas_en_557.length} Interconsultas/Cogestión en Piso reclasificadas.`);

        // Crear mapas rápidos por id_hospitalizacion, NHC y DNI (usando todas las fichas 557 con datos) para enriquecer Traumatología e Interconsultas
        const mapByHosp = new Map();
        const mapByNhc = new Map();
        const mapByDni = new Map();
        for (const a of filled557) {
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
        const rawInter = resInter.recordset || [];

        // Filtrar clics duplicados vacíos de interconsulta en el mismo día y paciente cuando ya existe otra interconsulta con evolución cargada
        const filledInterKeys = new Set();
        for (const r of rawInter) {
            if (r.evolucion_interconsulta) {
                filledInterKeys.add(`${r.dni || r.nhc}_${r.fecha_visita}`);
            }
        }
        const dedupedInter = rawInter.filter(r => {
            if (r.evolucion_interconsulta) return true;
            const key = `${r.dni || r.nhc}_${r.fecha_visita}`;
            // Si el mismo día el paciente ya tiene otra interconsulta con texto cargado, descartamos el clic en blanco duplicado
            if (filledInterKeys.has(key)) return false;
            return true;
        });

        const interconsultasNativas = dedupedInter.map(i => {
            const p557 = (i.id_hospitalizacion && mapByHosp.get(i.id_hospitalizacion)) || mapByNhc.get(String(i.nhc || '')) || mapByDni.get(String(i.dni || '')) || null;
            const textoFinal = i.evolucion_interconsulta ||
                (p557 && i.es_medico_clinico === 1
                    ? [p557.motivo_consulta && `MC: ${p557.motivo_consulta}`, p557.enfermedad_actual, p557.plan_terapeutico && `Plan: ${p557.plan_terapeutico}`].filter(Boolean).join(' — ')
                    : null);
            const origenFinal = i.origen_evolucion || (textoFinal && p557 ? 'Ficha Clínica 557 Asociada' : null);

            return {
                ...i,
                evolucion_interconsulta: textoFinal || null,
                origen_evolucion: origenFinal,
                tiene_datos_interconsulta: textoFinal ? 1 : 0,
                tiene_admision_557: !!p557,
                id_visita_557: p557?.id_visita || null,
                motivo_consulta_557: p557?.motivo_consulta || null,
                enfermedad_actual_557: p557?.enfermedad_actual || null,
                patologias_557: p557?.patologias || null,
                plan_terapeutico_557: p557?.plan_terapeutico || null,
                diagnostico_557: p557?.diagnostico || null,
                medico_cabecera_557: p557?.medico_cabecera || i.medico_cabecera_adm || null
            };
        });

        // Incorporar al listado de Interconsultas las valoraciones clínicas en Piso que fueron cargadas usando el formulario 557 sobre pacientes de otras especialidades (Cogestión)
        const existingInterVisitaDay = new Set(interconsultasNativas.map(i => `${i.dni || i.nhc}_${i.fecha_visita}_${i.medico_actuante}`));
        const interconsultasDesde557 = interconsultas_en_557
            .filter(a => !existingInterVisitaDay.has(`${a.dni || a.nhc}_${a.fecha_visita}_${a.medico_admision}`))
            .map(a => {
                const resumenTexto = [
                    a.motivo_consulta ? `Motivo: ${a.motivo_consulta}` : null,
                    a.enfermedad_actual ? `Evolución/AEA: ${a.enfermedad_actual}` : null,
                    a.diagnostico ? `Diag: ${a.diagnostico}` : null,
                    a.plan_terapeutico ? `Plan: ${a.plan_terapeutico}` : null
                ].filter(Boolean).join(' | ');

                return {
                    id_visita: a.id_visita,
                    paciente: a.paciente,
                    dni: a.dni,
                    nhc: a.nhc,
                    id_hospitalizacion: a.id_hospitalizacion,
                    periodo: a.periodo,
                    fecha_visita: a.fecha_visita,
                    hora_creacion: a.hora_visita,
                    tipo_visita: '(INT) INTERCONSULTA / COGESTIÓN (FICHA 557)',
                    medico_actuante: a.medico_admision,
                    especialidad_medico: `CLÍNICA MÉDICA (${a.tipo_registro_557})`,
                    obra_social: a.obra_social,
                    asistencia: 'Asistida',
                    habitacion: a.habitacion || 'SIN CAMA',
                    servicio_internacion: a.servicio_admision || 'INTERNADO',
                    especialidad_admision: a.especialidad_admision || null,
                    medico_cabecera_adm: a.medico_cabecera || null,
                    es_medico_clinico: 1,
                    es_reclasificada_557: 1,
                    evolucion_interconsulta: resumenTexto || 'Ficha 557 completa disponible',
                    origen_evolucion: 'Cargada en Prot. 557 (Cogestión Piso)',
                    medico_solicitante_6547: a.medico_cabecera || null,
                    tiene_datos_interconsulta: 1,
                    tiene_admision_557: true,
                    id_visita_557: a.id_visita,
                    motivo_consulta_557: a.motivo_consulta || null,
                    enfermedad_actual_557: a.enfermedad_actual || null,
                    patologias_557: a.patologias || null,
                    plan_terapeutico_557: a.plan_terapeutico || null,
                    diagnostico_557: a.diagnostico || null,
                    medico_cabecera_557: a.medico_cabecera || null
                };
            });

        const interconsultas = [...interconsultasNativas, ...interconsultasDesde557].sort((a, b) => {
            const da = `${a.fecha_visita || ''} ${a.hora_creacion || ''}`;
            const db = `${b.fecha_visita || ''} ${b.hora_creacion || ''}`;
            return db.localeCompare(da);
        });

        const clinicas = interconsultas.filter(i => i.es_medico_clinico === 1);
        console.log(`[sync_guardia_internado] Interconsultas: ${interconsultas.length} totales (${interconsultasNativas.length} nativas + ${interconsultasDesde557.length} cogestión 557), ${clinicas.length} clínicas.`);

        const paolaCargadas = admisiones_clinicas.filter(a => 
            (a.medico_admision || '').toUpperCase().includes('GARCIA, PAOLA') ||
            (a.usuario_creacion || '').toUpperCase().includes('GARCIA, PAOLA')
        ).length;
        const paolaCabecera = admisiones_clinicas.filter(a => 
            (a.medico_cabecera || '').toUpperCase().includes('GARCIA, PAOLA')
        ).length;

        const payload = {
            admisiones_clinicas,
            interconsultas_en_557,
            traumatologia,
            interconsultas,
            stats: {
                total_admisiones_557: admisiones_clinicas.length,
                con_ficha_557: admisiones_clinicas.length,
                vacias_descartadas_557: vaciasDescartadas,
                interconsultas_reclasificadas_557: interconsultas_en_557.length,
                activos_piso_557: admisiones_clinicas.filter(a => a.estado_internacion === 'Activo en Piso').length,
                paola_garcia_cargadas: paolaCargadas,
                paola_garcia_cabecera: paolaCabecera,
                area_shock_room: admisiones_clinicas.filter(a => a.sector_real === 'shock_room').length,
                area_internado: admisiones_clinicas.filter(a => a.sector_real === 'internado').length,
                area_uci: admisiones_clinicas.filter(a => a.sector_real === 'uci').length,
                reconsultas_72h_557: admisiones_clinicas.filter(a => a.reconsulta_72h === 'Si').length,
                reingresos_72h_557: admisiones_clinicas.filter(a => a.reingreso_72h === 'Si').length,
                total_traumatologia: traumatologia.length,
                activos_piso_trauma: traumatologia.filter(t => t.estado_internacion === 'Activo en Piso').length,
                total_interconsultas: interconsultas.length,
                interconsultas_clinicas: clinicas.length,
                interconsultas_otras: interconsultas.length - clinicas.length,
                interconsultas_con_datos: interconsultas.filter(i => i.tiene_datos_interconsulta === 1).length,
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
