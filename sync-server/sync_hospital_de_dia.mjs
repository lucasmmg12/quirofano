import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, '.env') });

const SQL_CONFIG = {
    server: process.env.SALUS_HOST || '128.223.16.29',
    port: parseInt(process.env.SALUS_PORT || '2450', 10),
    user: process.env.SALUS_USER || 'SalusConsulta',
    password: process.env.SALUS_PASSWORD || 'ConsultaSALUS1234',
    database: process.env.SALUS_DATABASE || 'SALUS',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true,
        requestTimeout: 120000,
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
};

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export async function syncHospitalDeDia(desde = '2026-01-01', hasta = '2026-12-31') {
    console.log(`\n🏥 [SYNC HOSPITAL DE DÍA] Iniciando extracción desde SALUS (${desde} a ${hasta})...`);
    const pool = await sql.connect(SQL_CONFIG);

    const query = `
        SELECT 
            v.idVisita,
            CONVERT(VARCHAR(10), v.[Fecha Visita], 120) AS fecha,
            v.[Hora Inicio Visita Formato Texto] AS hora,
            LTRIM(RTRIM(v.Paciente)) AS paciente_nombre,
            LTRIM(RTRIM(REPLACE(REPLACE(ISNULL(v.NIF, ''), '.', ''), ' ', ''))) AS paciente_dni,
            v.NHC AS paciente_nhc,
            v.Cliente AS obra_social,
            v.Agenda AS agenda,
            v.Responsable AS medico_responsable,
            v.Asistencia AS asistencia,
            v.Motivo_Ausencia AS motivo_ausencia,
            v.Centro AS centro,
            v.Comentarios AS motivo_o_comentarios
        FROM VLISE_Visitas v
        WHERE v.[Grupo Agenda] = 'QUIRÓFANOS HdD'
          AND v.[Fecha Visita] >= '${desde}'
          AND v.[Fecha Visita] <= '${hasta} 23:59:59'
        ORDER BY v.[Fecha Visita] ASC, v.[Hora Inicio Visita Formato Texto] ASC
    `;

    const res = await pool.request().query(query);
    console.log(`   📥 Registros obtenidos de SALUS: ${res.recordset.length}`);
    await pool.close();

    const rowsToUpsert = res.recordset.map(r => {
        const comUpper = (r.motivo_o_comentarios || '').toUpperCase();
        const agendaUpper = (r.agenda || '').toUpperCase();
        const esHierro = agendaUpper.includes('HEMOTERAPIA') || 
                         comUpper.includes('HIERRO') || 
                         comUpper.includes('FERR') || 
                         comUpper.includes('SACARATO') || 
                         comUpper.includes('VENOFER') || 
                         comUpper.includes('FERINJECT');

        let farmaco = null;
        let tipo = 'PROCEDIMIENTO_QUIRURGICO';

        if (esHierro) {
            tipo = 'INFUSION_HIERRO';
            if (comUpper.includes('FERINJECT') || comUpper.includes('FERINYET')) {
                farmaco = 'FERINJECT (Carboximaltosa)';
            } else if (comUpper.includes('SACARATO')) {
                farmaco = 'HIERRO SACARATO';
            } else {
                farmaco = 'HIERRO ENDOVENOSO / INFUSIÓN';
            }
        }

        let descPractica = r.motivo_o_comentarios ? r.motivo_o_comentarios.split('\r')[0].split('\n')[0].trim() : '';
        if (!descPractica && tipo === 'PROCEDIMIENTO_QUIRURGICO') {
            descPractica = r.agenda;
        }

        return {
            id_visita: r.idVisita,
            fecha: r.fecha,
            hora: r.hora || null,
            paciente_nombre: r.paciente_nombre,
            paciente_dni: r.paciente_dni || null,
            paciente_nhc: r.paciente_nhc || null,
            obra_social: r.obra_social || 'Particular',
            agenda: r.agenda,
            tipo_actividad: tipo,
            descripcion_practica: descPractica,
            farmaco_hierro: farmaco,
            medico_responsable: r.medico_responsable || 'Sin Médico',
            asistencia: r.asistencia || 'Sin dato',
            motivo_ausencia: r.motivo_ausencia || null,
            centro: r.centro || 'SAN LUIS SUR',
            motivo_o_comentarios: r.motivo_o_comentarios || null
        };
    });

    // Deduplicar por id_visita para evitar colisiones en el mismo batch de upsert
    const dedupMap = new Map();
    for (const row of rowsToUpsert) {
        if (!dedupMap.has(row.id_visita)) {
            dedupMap.set(row.id_visita, row);
        } else {
            const existing = dedupMap.get(row.id_visita);
            if (row.descripcion_practica && !existing.descripcion_practica.includes(row.descripcion_practica)) {
                existing.descripcion_practica += ` + ${row.descripcion_practica}`;
            }
        }
    }
    const finalRows = Array.from(dedupMap.values());

    console.log(`   ⚙️ Clasificación (${finalRows.length} visitas únicas deduplicadas):`);
    const cirugiasCount = finalRows.filter(r => r.tipo_actividad === 'PROCEDIMIENTO_QUIRURGICO').length;
    const hierroCount = finalRows.filter(r => r.tipo_actividad === 'INFUSION_HIERRO').length;
    console.log(`      🔪 Procedimientos Quirúrgicos HdD: ${cirugiasCount}`);
    console.log(`      🩸 Pases de Hierro / Infusiones: ${hierroCount}`);

    // Insertar en lotes de 200 en Supabase
    const BATCH_SIZE = 200;
    let inserted = 0;
    for (let i = 0; i < finalRows.length; i += BATCH_SIZE) {
        const batch = finalRows.slice(i, i + BATCH_SIZE);
        const { error } = await supabase
            .from('hospital_de_dia_actividad')
            .upsert(batch, { onConflict: 'id_visita' });

        if (error) {
            console.error(`❌ Error en batch ${i}:`, error.message);
        } else {
            inserted += batch.length;
        }
    }

    console.log(`   ✅ Sincronización finalizada: ${inserted}/${finalRows.length} filas en Supabase.`);
    return { total: finalRows.length, cirugias: cirugiasCount, hierro: hierroCount };
}

// Si se ejecuta directo
if (process.argv[1] && process.argv[1].endsWith('sync_hospital_de_dia.mjs')) {
    syncHospitalDeDia()
        .then(() => process.exit(0))
        .catch(err => { console.error(err); process.exit(1); });
}
