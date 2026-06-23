/**
 * SALUS Sync Server — ETL autónomo
 * =================================
 * Servidor Express que:
 *   1. Conecta a SQL Server SALUS (red local)
 *   2. Ejecuta las queries de extracción
 *   3. Procesa y transforma los datos
 *   4. Inserta directamente en Supabase
 *
 * El frontend solo necesita llamar /api/salus/sync-all para disparar todo.
 * No requiere que Vite esté corriendo.
 *
 * Uso: doble click en "Actualizar SALUS.bat" o: cd sync-server && npm start
 */

import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Cargar .env del proyecto padre
config({ path: resolve(__dirname, '..', '.env') });

const app = express();
const PORT = process.env.PORT || 3456;

// â”€â”€ Supabase Client â”€â”€
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// â”€â”€ SQL Server Config â”€â”€
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
        requestTimeout: 120000,    // 2min para queries pesadas
        connectionTimeout: 15000,
        tdsVersion: '7_4',
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
};

// â”€â”€ Pool de conexiones â”€â”€
let pool = null;
async function getPool() {
    if (!pool || !pool.connected) {
        console.log('🔌 Conectando a SQL Server SALUS...');
        pool = await sql.connect(SQL_CONFIG);
        console.log('–… Conectado a SALUS');
    }
    return pool;
}

// â”€â”€ Middleware â”€â”€
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// â”€â”€ Helpers â”€â”€
function formatDate(val) {
    if (!val) return null;
    if (val instanceof Date) {
        // CRÍTICO: Usar métodos UTC para evitar desplazamiento por timezone.
        // SQL Server DATE llega como midnight UTC (ej: 2026-03-31T00:00:00.000Z).
        // En Argentina (UTC-3), getDate() devuelve el día ANTERIOR (30 en vez de 31).
        // getUTCDate() siempre devuelve el día correcto del valor original.
        const y = val.getUTCFullYear();
        const m = String(val.getUTCMonth() + 1).padStart(2, '0');
        const d = String(val.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
    // Si no es Date, puede ser un string ISO — extraer solo la parte de fecha
    const str = String(val);
    const isoMatch = str.match(/^(\d{4}-\d{2}-\d{2})/);
    if (isoMatch) return isoMatch[1];
    // dd/mm/yyyy or dd-mm-yyyy (formato argentino)
    const dmy = str.match(/^(\d{2})[\/\-](\d{2})[\/\-](\d{4})/);
    if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
    return str;
}

function stripRtf(rtf) {
    if (!rtf || typeof rtf !== 'string' || !rtf.startsWith('{\\rtf')) return rtf || null;
    return rtf
        .replace(/\{\\[^{}]*\}/g, '')
        .replace(/\\[a-z]+\d*\s?/gi, '')
        .replace(/[{}]/g, '')
        .replace(/\r?\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim() || null;
}

function normalizeNameForUpsert(name) {
    if (!name) return '';
    return name
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[,.\-_]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toUpperCase();
}

function normalizePhone(raw, areaCode = '264') {
    if (!raw) return { normalized: '', valid: false, original: raw };
    let cleaned = String(raw).replace(/\D/g, '');
    // Ya tiene formato 549XXXXXXXXXX
    if (cleaned.startsWith('549') && cleaned.length === 13) {
        return { normalized: cleaned, valid: true, original: raw };
    }
    // Tiene 10 dígitos (con código de área)
    if (cleaned.length === 10 && !cleaned.startsWith('0')) {
        return { normalized: '549' + cleaned, valid: true, original: raw };
    }
    // 8 dígitos (sin código de área)
    if (cleaned.length >= 7 && cleaned.length <= 8) {
        return { normalized: '549' + areaCode + cleaned, valid: true, original: raw };
    }
    return { normalized: cleaned, valid: false, original: raw };
}

// Módulos excluidos
const EXCLUDED_MODULES = ['Transferencia embrionaria', 'Fertilidad', 'Bloque Médico'];
const EXCLUDED_NAME_PREFIXES = ['BLOQUE'];

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC CIRUGÍAS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncCirugias(db) {
    console.log('📋 [1/7] Extrayendo cirugías de SALUS...');
    const result = await db.request().query(`
        SELECT TOP 400
            CAST(A.Data AS DATE) AS Data_Fecha,
            A.idPaciente, A.nombre, A.telefono1, A.Descrip,
            A.mutua, A.Ausente, A.GrupoAgendas, Q.Doctor,
            V.Instrucciones AS Instrucciones_RTF
        FROM _PR_AGENDA_QRY_SENZILL A
        LEFT JOIN _PR_AGENDA_QRY_QUIROFAN Q 
            ON A.idPaciente = Q.idPaciente 
            AND CAST(A.Data AS DATE) = CAST(Q.Data AS DATE) 
        OUTER APPLY (
            SELECT TOP 1 Instrucciones
            FROM VLIS_PeticionesPruebas_SERVICIO V_Sub
            WHERE V_Sub.IdPaciente = A.idPaciente
              AND CAST(V_Sub.[Fecha Solicitud] AS DATE) <= CAST(A.Data AS DATE)
              AND V_Sub.Instrucciones IS NOT NULL 
            ORDER BY V_Sub.[Fecha Solicitud] DESC
        ) V
        WHERE A.Descrip LIKE '(CX)%'
          AND A.nombre NOT LIKE '%Bloque%'
          AND A.GrupoAgendas IN (N'QUIRÓFANOS CENTRALES', N'QUIRÓFANOS HdD')
          AND CAST(A.Data AS DATE) >= DATEADD(DAY, -7, CAST(GETDATE() AS DATE))
        ORDER BY A.Data DESC
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    // Transformar y preparar para upsert
    const records = [];
    const FIELDS_TO_PRESERVE = [
        'status', 'notificado_at', 'documentacion_recibida_at', 'autorizado_at',
        'confirmado_at', 'archivos', 'whatsapp_message_id', 'ultimo_mensaje_at',
        'notas', 'operador', 'telefono'
    ];

    for (const r of result.recordset) {
        const nombre = r.nombre?.trim();
        if (!nombre || !r.idPaciente) continue;
        const nombreUpper = nombre.toUpperCase();
        if (EXCLUDED_NAME_PREFIXES.some(p => nombreUpper.startsWith(p))) continue;

        const descripcion = r.Descrip || '';
        const excluido = EXCLUDED_MODULES.some(mod => descripcion.toLowerCase().includes(mod.toLowerCase()));
        const phone = normalizePhone(r.telefono1 ? String(r.telefono1) : '');

        records.push({
            id_paciente: String(r.idPaciente),
            nombre: normalizeNameForUpsert(nombre),
            fecha_cirugia: formatDate(r.Data_Fecha),
            telefono: phone.normalized || '',
            telefono_original: phone.original || '',
            descripcion: descripcion,
            modulo: descripcion,
            obra_social: r.mutua || null,
            ausente: r.Ausente != null ? String(r.Ausente).trim() : null,
            grupo_agendas: r.GrupoAgendas || null,
            medico: r.Doctor || r.GrupoAgendas || null,
            instrucciones: stripRtf(r.Instrucciones_RTF),
            excluido,
        });
    }

    // ── ENRIQUECER CON DNI DESDE SUPABASE ──
    // Fuente 1: asociaciones_cirugias (match por nombre normalizado)
    const dniByName = new Map();
    let dniOffset = 0;
    let hasMoreDni = true;
    while (hasMoreDni) {
        const { data: asocRows } = await supabase
            .from('asociaciones_cirugias')
            .select('nombre_paciente, dni')
            .not('dni', 'is', null)
            .range(dniOffset, dniOffset + 499);

        if (asocRows && asocRows.length > 0) {
            for (const row of asocRows) {
                if (row.dni && row.nombre_paciente) {
                    const key = normalizeNameForUpsert(row.nombre_paciente);
                    if (!dniByName.has(key)) dniByName.set(key, String(row.dni).trim());
                }
            }
            dniOffset += 500;
            hasMoreDni = asocRows.length === 500;
        } else {
            hasMoreDni = false;
        }
    }

    // Fuente 2: deudas_pacientes (match exacto por id_paciente_salus)
    const dniById = new Map();
    const uniqueIds = [...new Set(records.map(r => r.id_paciente))];
    const DNI_BATCH = 200;
    for (let i = 0; i < uniqueIds.length; i += DNI_BATCH) {
        const batch = uniqueIds.slice(i, i + DNI_BATCH);
        const { data: deudasRows } = await supabase
            .from('deudas_pacientes')
            .select('id_paciente_salus, dni')
            .in('id_paciente_salus', batch)
            .not('dni', 'is', null);

        if (deudasRows) {
            for (const row of deudasRows) {
                if (row.dni && row.id_paciente_salus) {
                    dniById.set(row.id_paciente_salus, String(row.dni).trim());
                }
            }
        }
    }

    // Aplicar DNI: prioridad id_paciente (exacto) > nombre (fuzzy)
    let dniMatched = 0;
    for (const record of records) {
        const dniExacto = dniById.get(record.id_paciente);
        const dniPorNombre = dniByName.get(record.nombre);
        record.dni = dniExacto || dniPorNombre || null;
        if (record.dni) dniMatched++;
    }
    console.log(`   🪪 ${dniMatched}/${records.length} cirugías enriquecidas con DNI (${dniByName.size} por nombre, ${dniById.size} por id)`);

    // Filtrar registros con datos completos para upsert
    const validRecords = records.filter(r => r.id_paciente && r.nombre && r.fecha_cirugia);

    // Deduplicar (último gana)
    const deduped = new Map();
    for (const row of validRecords) {
        const key = `${row.id_paciente}|${row.nombre}|${row.fecha_cirugia}`;
        deduped.set(key, row);
    }

    const patientIds = [...new Set([...deduped.values()].map(r => r.id_paciente))];

    // â”€â”€ PASO 1: Obtener estados existentes para preservarlos â”€â”€
    // IMPORTANTE: Capturar estados ANTES de cualquier eliminación
    const FIELDS_TO_PRESERVE_QUERY = FIELDS_TO_PRESERVE.join(', ');
    const existingMap = new Map();

    if (patientIds.length > 0) {
        const FETCH_BATCH = 200;
        for (let i = 0; i < patientIds.length; i += FETCH_BATCH) {
            const batch = patientIds.slice(i, i + FETCH_BATCH);
            const { data: existing } = await supabase
                .from('surgeries')
                .select(`id_paciente, fecha_cirugia, nombre, ${FIELDS_TO_PRESERVE_QUERY}`)
                .in('id_paciente', batch);

            if (existing) {
                for (const row of existing) {
                    // Guardar con la clave de la fecha CORRECTA (SALUS) para que el upsert la encuentre
                    const normalizedName = normalizeNameForUpsert(row.nombre);
                    const key = `${row.id_paciente}|${normalizedName}|${row.fecha_cirugia}`;
                    const preserved = {};
                    for (const f of FIELDS_TO_PRESERVE) {
                        if (row[f] != null) preserved[f] = row[f];
                    }
                    if (Object.keys(preserved).length > 0) existingMap.set(key, preserved);
                }
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // â”€â”€ PASO 2: Limpiar registros huérfanos con fechas incorrectas â”€â”€
    // Detectar registros en Supabase cuya fecha NO coincide con SALUS.
    // Estos son restos del bug de timezone (fecha -1 día) o reprogramaciones.
    // Se ELIMINAN directamente. El upsert posterior los recreará con la fecha correcta
    // y los estados se preservan via existingMap.
    if (patientIds.length > 0) {
        // Crear mapa de SALUS: id_paciente+nombre â†’ fecha más reciente
        const salusDateMap = new Map();
        for (const row of deduped.values()) {
            if (row.ausente === '0' || row.ausente === '1') continue;
            const pKey = `${row.id_paciente}|${row.nombre}`;
            const existing = salusDateMap.get(pKey);
            if (!existing || row.fecha_cirugia > existing) {
                salusDateMap.set(pKey, row.fecha_cirugia);
            }
        }

        const FETCH_BATCH = 200;
        let cleaned = 0;
        for (let i = 0; i < patientIds.length; i += FETCH_BATCH) {
            const batch = patientIds.slice(i, i + FETCH_BATCH);
            const { data: existing } = await supabase
                .from('surgeries')
                .select('id, id_paciente, nombre, fecha_cirugia, ausente')
                .in('id_paciente', batch)
                .is('ausente', null);

            if (existing) {
                for (const row of existing) {
                    const pKey = `${row.id_paciente}|${normalizeNameForUpsert(row.nombre)}`;
                    const salusDate = salusDateMap.get(pKey);
                    if (salusDate && row.fecha_cirugia !== salusDate) {
                        // La fecha en Supabase no coincide con SALUS â†’ eliminar el registro obsoleto
                        // El upsert posterior creará el registro con la fecha correcta
                        console.log(`   🖑ï¸ Eliminando obsoleto: ${row.nombre} ${row.fecha_cirugia} (correcto: ${salusDate})`);
                        const { error: delErr } = await supabase
                            .from('surgeries')
                            .delete()
                            .eq('id', row.id);
                        if (!delErr) {
                            cleaned++;
                            // Mover los estados preservados a la key con fecha correcta
                            const oldKey = `${row.id_paciente}|${normalizeNameForUpsert(row.nombre)}|${row.fecha_cirugia}`;
                            const newKey = `${row.id_paciente}|${normalizeNameForUpsert(row.nombre)}|${salusDate}`;
                            const preserved = existingMap.get(oldKey);
                            if (preserved && !existingMap.has(newKey)) {
                                existingMap.set(newKey, preserved);
                            }
                        } else {
                            console.error(`   âŒ Error eliminando ${row.nombre}:`, delErr.message);
                        }
                    }
                }
            }
        }
        if (cleaned > 0) console.log(`   🧹 ${cleaned} registros obsoletos eliminados`);
    }


    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const uniqueRows = [...deduped.values()];
    const BATCH = 50;

    for (let i = 0; i < uniqueRows.length; i += BATCH) {
        const batch = uniqueRows.slice(i, i + BATCH).map(row => {
            const key = `${row.id_paciente}|${row.nombre}|${row.fecha_cirugia}`;
            const preserved = existingMap.get(key);
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('surgeries')
            .upsert(batch, { onConflict: 'id_paciente,nombre,fecha_cirugia', ignoreDuplicates: false })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   âŒ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   –… Cirugías: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC PRESUPUESTOS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncPresupuestos(db) {
    console.log('💰 [2/7] Extrayendo presupuestos de SALUS...');
    const result = await db.request().query(`
        SELECT idPresupuesto, idPaciente, Paciente, NHC, fecha, Observaciones,
               idArticulo, descripcion, cantidad, importeUnitario,
               [Importe Total Linea], [Importe Cobrado], Aceptado,
               FechaCaducidad, Presup_descripcion
        FROM VLISE_Presupuestos
        WHERE fecha >= '2026-01-01'
    `);
    console.log(`   📥 ${result.recordset.length} filas extraídas`);

    // Agrupar por idPresupuesto
    const grouped = {};
    let skippedNoPatient = 0;

    for (const r of result.recordset) {
        if (!r.idPaciente) { skippedNoPatient++; continue; }
        if (!r.idPresupuesto) continue;

        const budgetKey = String(r.idPresupuesto);
        if (!grouped[budgetKey]) {
            grouped[budgetKey] = {
                id_presupuesto: parseInt(budgetKey, 10),
                id_paciente: String(r.idPaciente).trim(),
                nhc: r.NHC ? String(r.NHC).trim() : null,
                paciente: r.Paciente?.trim() || null,
                fecha: formatDate(r.fecha),
                observaciones: r.Observaciones?.trim() || null,
                aceptado: r.Aceptado ? String(r.Aceptado).trim().toLowerCase() : null,
                fecha_caducidad: formatDate(r.FechaCaducidad),
                presup_descripcion: r.Presup_descripcion?.trim() || null,
                items: [],
                lineCounter: 0,
            };
        }
        grouped[budgetKey].lineCounter++;
        grouped[budgetKey].items.push({
            id_presupuesto: parseInt(budgetKey, 10),
            linea: grouped[budgetKey].lineCounter,
            id_articulo: r.idArticulo ? String(r.idArticulo).trim() : `ITEM_${grouped[budgetKey].lineCounter}`,
            descripcion: r.descripcion?.trim() || null,
            cantidad: r.cantidad || 1,
            importe_unitario: Number(r.importeUnitario) || 0,
            importe_total: Number(r['Importe Total Linea']) || 0,
            importe_cobrado: Number(r['Importe Cobrado']) || 0,
        });
    }

    const presupuestos = Object.values(grouped).map(p => ({
        ...p,
        total_items: p.items.length,
        importe_total: p.items.reduce((s, i) => s + i.importe_total, 0),
        importe_cobrado: p.items.reduce((s, i) => s + i.importe_cobrado, 0),
    }));

    console.log(`   📦 ${presupuestos.length} presupuestos agrupados`);

    // Upsert cabeceras en lotes
    let insertedHeaders = 0;
    const BATCH = 50;
    for (let i = 0; i < presupuestos.length; i += BATCH) {
        const batch = presupuestos.slice(i, i + BATCH).map(({ items, lineCounter, ...header }) => header);
        const { data, error } = await supabase
            .from('presupuestos')
            .upsert(batch, { onConflict: 'id_presupuesto', ignoreDuplicates: false })
            .select('id_presupuesto');
        if (!error && data) insertedHeaders += data.length;
        else if (error) console.error('   âŒ Presupuesto header error:', error.message);
    }

    // Upsert ítems: limpiar y reinsertar
    let insertedItems = 0;
    const budgetIds = presupuestos.map(p => p.id_presupuesto);

    if (budgetIds.length > 0) {
        // Borrar ítems existentes para los presupuestos que se actualizan
        for (let i = 0; i < budgetIds.length; i += BATCH) {
            const batchIds = budgetIds.slice(i, i + BATCH);
            await supabase.from('presupuesto_items').delete().in('id_presupuesto', batchIds);
        }

        // Insertar todos los ítems
        const allItems = presupuestos.flatMap(p => p.items);
        for (let i = 0; i < allItems.length; i += BATCH) {
            const batch = allItems.slice(i, i + BATCH);
            const { data, error } = await supabase.from('presupuesto_items').insert(batch).select('id');
            if (!error && data) insertedItems += data.length;
            else if (error) console.error('   âŒ Presupuesto items error:', error.message);
        }
    }

    const summary = { total: result.recordset.length, presupuestos: presupuestos.length, headers: insertedHeaders, items: insertedItems, skippedNoPatient };
    console.log(`   –… Presupuestos: ${insertedHeaders} cabeceras, ${insertedItems} ítems`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC DEUDAS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncDeudas(db) {
    console.log('📊 [3/7] Extrayendo deudas de SALUS...');
    const req = db.request();
    req.timeout = 300000; // 5 minutos — TABLEAU es una vista muy pesada
    const result = await req.query(`
        SELECT
            T.[Fecha albaran], T.Paciente, T.Paciente_NHC, T.Paciente_NIF,
            T.Tarifa, T.Concepto, T.[Numero folio], T.[Cobrado linea],
            T.[Deuda linea], T.[Núm.Admisión], T.HOSP_Habitacion,
            CASE 
                WHEN V.telefono1 IS NOT NULL 
                THEN '549' + 
                    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                    REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(
                        LOWER(V.telefono1)
                    , 'a', ''), 'b', ''), 'c', ''), 'd', ''), 'e', ''), 'f', ''), 'g', ''), 'h', ''), 'i', ''), 'j', '')
                    , 'k', ''), 'l', ''), 'm', ''), 'n', ''), N'ñ', ''), 'o', ''), 'p', ''), 'q', ''), 'r', ''), 's', '')
                    , 't', ''), 'u', ''), 'v', ''), 'w', ''), 'x', ''), 'y', ''), 'z', ''), N'á', ''), N'é', ''), N'í', '')
                    , N'ó', ''), N'ú', ''), '-', ''), ' ', ''), '(', ''), ')', ''), '+', ''), '*', ''), '.', ''), ',', '')
                ELSE NULL
            END AS telefono1_formateado,
            V.email,
            V.mutua
        FROM [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios] AS T
        LEFT JOIN VIS_Pacientes AS V ON T.Paciente_NHC = V.NHC
        WHERE T.Tarifa LIKE '042%'
          AND T.[Deuda linea] > 0
          AND T.[Numero folio] LIKE 'B 00028%'
          AND T.Paciente IS NOT NULL
          AND T.[Fecha albaran] >= '2025-05-01'
        ORDER BY T.[Fecha albaran] DESC
    `);
    console.log(`   📥 ${result.recordset.length} filas extraídas`);

    // Agrupar por folio
    const facturasMap = new Map();
    for (const r of result.recordset) {
        const nhc = r.Paciente_NHC ? String(r.Paciente_NHC).trim() : '';
        const folio = r['Numero folio'] ? String(r['Numero folio']).trim() : '';
        if (!nhc || !folio) continue;

        const deuda = Number(r['Deuda linea']) || 0;
        const cobrado = Number(r['Cobrado linea']) || 0;

        const lineItem = {
            tarifa: String(r.Tarifa || '').trim(),
            concepto: String(r.Concepto || '').trim(),
            deuda, cobrado,
            fecha_albaran: formatDate(r['Fecha albaran']) || '',
            habitacion: String(r.HOSP_Habitacion || '').trim(),
            nAdmision: String(r['Núm.Admisión'] || '').trim(),
        };

        if (!facturasMap.has(folio)) {
            let tel = String(r.telefono1_formateado || '').replace(/\D/g, '');
            let telValido = tel.length === 13 && tel.startsWith('549');

            const dni = r.Paciente_NIF ? String(r.Paciente_NIF).trim() : null;
            facturasMap.set(folio, {
                nombre: r.Paciente, nhc, dni, folio, codigo: folio,
                telefono: tel, telefono_invalido: !telValido && tel !== '',
                obra_social: r.mutua || null,
                pendiente: deuda, cobrado, total: deuda + cobrado,
                lineas: [lineItem],
            });
        } else {
            const ex = facturasMap.get(folio);
            ex.pendiente += deuda;
            ex.cobrado += cobrado;
            ex.total += deuda + cobrado;
            ex.lineas.push(lineItem);
        }
    }

    // Filtrar facturas con deuda > $1
    const registros = [...facturasMap.values()].filter(f => f.pendiente > 1);
    console.log(`   📦 ${registros.length} facturas con deuda > $1`);

    // Procesar cada paciente (agrupado por NHC)
    const porNhc = {};
    for (const r of registros) {
        if (!porNhc[r.nhc]) {
            porNhc[r.nhc] = { nombre: r.nombre, dni: r.dni, obra_social: r.obra_social, facturas: [], telefono: r.telefono, telefono_invalido: r.telefono_invalido };
        } else if (!porNhc[r.nhc].telefono && r.telefono) {
            porNhc[r.nhc].telefono = r.telefono;
            porNhc[r.nhc].telefono_invalido = r.telefono_invalido;
        }
        porNhc[r.nhc].facturas.push(r);
    }

    let pacientesNuevos = 0, pacientesActualizados = 0, filasImportadas = 0;

    for (const [nhc, grupo] of Object.entries(porNhc)) {
        const deudaTotal = grupo.facturas.reduce((s, f) => s + f.pendiente, 0);

        // Fecha más reciente
        let fechaMasReciente = null;
        for (const f of grupo.facturas) {
            for (const l of f.lineas) {
                if (l.fecha_albaran) {
                    const d = new Date(l.fecha_albaran);
                    if (!isNaN(d.getTime()) && (!fechaMasReciente || d > fechaMasReciente)) fechaMasReciente = d;
                }
            }
        }

        // Upsert paciente
        const { data: existente } = await supabase
            .from('deudas_pacientes')
            .select('id, telefono')
            .eq('nhc', nhc)
            .maybeSingle();

        let pacienteId;
        if (existente) {
            const upd = {
                nombre: grupo.nombre,
                dni: grupo.dni || null,
                obra_social: grupo.obra_social || null,
                deuda_total: deudaTotal,
                cantidad_facturas: grupo.facturas.length,
                fecha_ultima_factura: fechaMasReciente?.toISOString() || null,
                updated_at: new Date().toISOString(),
            };
            if (!existente.telefono && grupo.telefono) {
                upd.telefono = grupo.telefono;
                upd.telefono_invalido = grupo.telefono_invalido;
            }
            await supabase.from('deudas_pacientes').update(upd).eq('id', existente.id);
            pacienteId = existente.id;
            pacientesActualizados++;
        } else {
            const { data: nuevo } = await supabase
                .from('deudas_pacientes')
                .insert({
                    nhc, nombre: grupo.nombre, dni: grupo.dni || null,
                    obra_social: grupo.obra_social || null,
                    deuda_total: deudaTotal,
                    cantidad_facturas: grupo.facturas.length,
                    telefono: grupo.telefono || null,
                    telefono_invalido: grupo.telefono_invalido || false,
                    fecha_ultima_factura: fechaMasReciente?.toISOString() || null,
                })
                .select('id').single();
            pacienteId = nuevo?.id;
            pacientesNuevos++;
        }

        // Upsert líneas de factura
        if (pacienteId) {
            for (const f of grupo.facturas) {
                for (let i = 0; i < f.lineas.length; i++) {
                    const linea = f.lineas[i];
                    const cod = f.lineas.length > 1 ? `${f.codigo}::${i}` : f.codigo;
                    const { error } = await supabase.from('deudas_facturas').upsert({
                        paciente_id: pacienteId,
                        codigo: cod,
                        documento: f.folio, folio: f.folio,
                        total: (linea.deuda || 0) + (linea.cobrado || 0),
                        cobrado: linea.cobrado || 0,
                        pendiente: linea.deuda || 0,
                        servicio: linea.tarifa || null,
                        responsable: linea.concepto || null,
                        n_admision: linea.nAdmision || null,
                        fecha_hospitalizacion: linea.fecha_albaran || null,
                        tipo_hospitalizacion: linea.habitacion || null,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'codigo' });
                    if (!error) filasImportadas++;
                }
            }
        }
    }

    // Registrar importación
    await supabase.from('deudas_importaciones').insert({
        archivo_nombre: 'SALUS Sync Automático',
        total_filas: result.recordset.length,
        filas_importadas: filasImportadas,
        filas_ignoradas: result.recordset.length - filasImportadas,
        pacientes_nuevos: pacientesNuevos,
        pacientes_actualizados: pacientesActualizados,
        usuario: 'SALUS Sync',
    });

    const summary = { total: result.recordset.length, pacientesNuevos, pacientesActualizados, filasImportadas };
    console.log(`   –… Deudas: ${pacientesNuevos} nuevos, ${pacientesActualizados} actualizados, ${filasImportadas} líneas`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC COBROS — SQL Server -> Supabase (BATCH)
// ═══════════════════════════════════════════════════
async function syncCobros(db) {
    console.log('💰 [3b/10] Extrayendo cobros de SALUS...');
    const req = db.request();
    req.timeout = 300000;
    const result = await req.query(`
        SELECT t.[IdCobro], t.[nombre], t.[nombreFiscal], t.[NIF], t.[descripcion],
               t.[importe2], t.[comentario],
               CONVERT(VARCHAR(10), t.[fecha], 103) AS [fecha],
               t.[FechaCobro], t.[Entidad_telefono1], t.[Centro_Nombre],
               t.[Paciente], t.[Paciente_NHC], t.[FormaPago], t.[Caja],
               t.[Clasificacion], t.[UsuarioCobro]
          FROM [SALUS].[dbo].[PR_COBROS_QRY] AS t
          WHERE t.[FechaCobro] >= '2025-01-01'
          ORDER BY t.[fecha] DESC
    `);
    console.log('   ' + result.recordset.length + ' cobros extraidos');

    // Prefetch: NHC -> paciente_id (una sola query)
    const { data: allPacientes } = await supabase
        .from('deudas_pacientes').select('id, nhc');
    const nhcMap = {};
    for (const p of (allPacientes || [])) nhcMap[p.nhc] = p.id;

    // Preparar registros y acumular totales por NHC
    const porNhc = {};
    const rows = [];
    const now = new Date().toISOString();

    for (const r of result.recordset) {
        const nhc = r.Paciente_NHC ? String(r.Paciente_NHC).trim() : '';
        const idCobro = r.IdCobro ? String(r.IdCobro).trim() : '';
        if (!nhc || !idCobro) continue;

        const importe = Number(r.importe2) || 0;
        if (importe <= 0) continue;

        let fechaParsed = null;
        if (r.fecha) {
            const parts = String(r.fecha).split('/');
            if (parts.length === 3) fechaParsed = parts[2] + '-' + parts[1] + '-' + parts[0];
        }

        const pacienteId = nhcMap[nhc] || null;
        if (!porNhc[nhc]) porNhc[nhc] = { pacienteId, total: 0, count: 0 };
        porNhc[nhc].total += importe;
        porNhc[nhc].count++;

        rows.push({
            paciente_id: pacienteId, nhc, id_cobro: idCobro,
            nombre: r.nombre || null, nombre_fiscal: r.nombreFiscal || null,
            nif: r.NIF || null, descripcion: r.descripcion || null, importe,
            comentario: r.comentario || null, fecha: fechaParsed,
            fecha_cobro: r.FechaCobro || null, telefono: r.Entidad_telefono1 || null,
            centro: r.Centro_Nombre || null, paciente_nombre: r.Paciente || null,
            forma_pago: r.FormaPago || null, caja: r.Caja || null,
            clasificacion: r.Clasificacion || null, usuario_cobro: r.UsuarioCobro || null,
            updated_at: now,
        });
    }

    // Batch upsert en lotes de 500
    const BATCH = 500;
    let cobrosUpserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('deudas_cobros')
            .upsert(batch, { onConflict: 'id_cobro' });
        if (!error) cobrosUpserted += batch.length;
        else console.error('   Error batch cobros ' + i + ': ' + error.message);
    }
    console.log('   ' + cobrosUpserted + '/' + rows.length + ' cobros upserted en ' + Math.ceil(rows.length / BATCH) + ' batches');

    // Actualizar totales por paciente
    let pacientesActualizados = 0;
    for (const [nhc, data] of Object.entries(porNhc)) {
        if (!data.pacienteId) continue;
        await supabase.from('deudas_pacientes').update({
            total_cobros: data.total, cantidad_cobros: data.count,
            updated_at: now,
        }).eq('id', data.pacienteId);
        pacientesActualizados++;
    }

    console.log('   Cobros OK: ' + pacientesActualizados + ' pacientes actualizados');
    return { total: result.recordset.length, cobrosUpserted, pacientesActualizados };
}

// ═══════════════════════════════════════════════════
// SYNC NOTAS DE CREDITO — SQL Server -> Supabase (BATCH)
// ═══════════════════════════════════════════════════
async function syncNotasCredito(db) {
    console.log('📝 [3c/10] Extrayendo notas de credito de SALUS...');
    const req = db.request();
    req.timeout = 300000;
    const result = await req.query(`
        WITH FacturasUnicas AS (
            SELECT t.[id], t.[fecha] AS FechaOriginal,
                   CONVERT(VARCHAR(10), t.[fecha], 103) AS [fecha],
                   t.[Paciente_Nombre], t.[Paciente_NHC], t.[descripcion],
                   t.[idPaciente], t.[Centro_Alias], t.[Paciente_NIF], t.[NombreSerie],
                   CAST(ABS(t.[ImporteTotal]) AS FLOAT) AS [ImporteTotal],
                   ROW_NUMBER() OVER(PARTITION BY t.[id] ORDER BY t.[fecha] DESC) AS NumeroDeFila
              FROM [SALUS].[dbo].[PR_FACTURAS_QRY] AS t
              WHERE t.[fecha] >= '2025-01-01'
                AND t.[NombreSerie] LIKE '%Nota Cr%dito%'
                AND t.[Paciente_Nombre] IS NOT NULL
        )
        SELECT [id],[fecha],[Paciente_Nombre],[Paciente_NHC],[descripcion],
               [idPaciente],[Centro_Alias],[Paciente_NIF],[NombreSerie],[ImporteTotal]
          FROM FacturasUnicas WHERE NumeroDeFila = 1
          ORDER BY FechaOriginal DESC
    `);
    console.log('   ' + result.recordset.length + ' notas de credito extraidas');

    // Prefetch: NHC -> paciente_id
    const { data: allPacientes } = await supabase
        .from('deudas_pacientes').select('id, nhc');
    const nhcMap = {};
    for (const p of (allPacientes || [])) nhcMap[p.nhc] = p.id;

    const porNhc = {};
    const rows = [];
    const now = new Date().toISOString();

    for (const r of result.recordset) {
        const nhc = r.Paciente_NHC ? String(r.Paciente_NHC).trim() : '';
        const idFactura = r.id ? String(r.id).trim() : '';
        if (!nhc || !idFactura) continue;

        const importe = Number(r.ImporteTotal) || 0;
        if (importe <= 0) continue;

        let fechaParsed = null;
        if (r.fecha) {
            const parts = String(r.fecha).split('/');
            if (parts.length === 3) fechaParsed = parts[2] + '-' + parts[1] + '-' + parts[0];
        }

        const pacienteId = nhcMap[nhc] || null;
        if (!porNhc[nhc]) porNhc[nhc] = { pacienteId, total: 0, count: 0 };
        porNhc[nhc].total += importe;
        porNhc[nhc].count++;

        rows.push({
            paciente_id: pacienteId, nhc, id_factura: idFactura,
            fecha: fechaParsed, paciente_nombre: r.Paciente_Nombre || null,
            descripcion: r.descripcion || null,
            id_paciente_salus: r.idPaciente ? String(r.idPaciente) : null,
            centro: r.Centro_Alias || null, nif: r.Paciente_NIF || null,
            nombre_serie: r.NombreSerie || null, importe_total: importe,
            updated_at: now,
        });
    }

    // Batch upsert en lotes de 500
    const BATCH = 500;
    let ncUpserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error } = await supabase.from('deudas_notas_credito')
            .upsert(batch, { onConflict: 'id_factura' });
        if (!error) ncUpserted += batch.length;
        else console.error('   Error batch NC ' + i + ': ' + error.message);
    }
    console.log('   ' + ncUpserted + '/' + rows.length + ' NC upserted en ' + Math.ceil(rows.length / BATCH) + ' batches');

    // Actualizar totales por paciente
    let pacientesActualizados = 0;
    for (const [nhc, data] of Object.entries(porNhc)) {
        if (!data.pacienteId) continue;
        await supabase.from('deudas_pacientes').update({
            total_notas_credito: data.total, cantidad_notas_credito: data.count,
            updated_at: now,
        }).eq('id', data.pacienteId);
        pacientesActualizados++;
    }

    console.log('   NC OK: ' + pacientesActualizados + ' pacientes actualizados');
    return { total: result.recordset.length, ncUpserted, pacientesActualizados };
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC ALTAS ADMINISTRATIVAS — SQL Server â†’ Supabase
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncAltasAdministrativas(db) {
    console.log('📋 [4/7] Extrayendo altas administrativas de SALUS...');

    // Rango: últimos 60 días de altas
    const result = await db.request().query(`
        WITH CTE AS (
            SELECT 
                TA.[Número admisión],
                TA.[Fecha ingreso],
                CAST(TA.[Fecha alta] AS DATE) AS [Fecha alta],
                TA.[Paciente],
                TA.[Cliente],
                TA.[Especialidad],
                TA.[Proceso],
                TA.[Doctor],
                TA.[Motivo de alta],
                TA.[Control ADM finalizado],
                (
                    SELECT STUFF((
                        SELECT CHAR(13) + CHAR(10) + '---' + CHAR(13) + CHAR(10) + CAST(O.ValorM AS NVARCHAR(MAX))
                        FROM [PR InstRespHospi] O
                        WHERE O.idHospi = TA.idAdmision
                          AND O.activo = 1
                          AND O.ValorM IS NOT NULL
                          AND LEN(LTRIM(RTRIM(CAST(O.ValorM AS NVARCHAR(MAX))))) > 0
                        FOR XML PATH(''), TYPE
                    ).value('.', 'NVARCHAR(MAX)'), 1, 7, '')
                ) AS [Observaciones],
                ROW_NUMBER() OVER (PARTITION BY TA.[Paciente], CAST(TA.[Fecha ingreso] AS DATE) ORDER BY TA.[Número admisión] DESC) as rn
            FROM [SALUS].[dbo].[TABLEAU_Admisiones] TA
            WHERE 
                TA.[Fecha ingreso] >= DATEADD(DAY, -60, CAST(GETDATE() AS DATE))
                AND TA.[Fecha ingreso] < DATEADD(DAY, 1, CAST(GETDATE() AS DATE))
        )
        SELECT * FROM CTE WHERE rn = 1
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    const records = [];
    for (const r of result.recordset) {
        const numAdmision = r['Número admisión'] ? String(r['Número admisión']).trim() : null;
        if (!numAdmision) continue;

        // Limpiar RTF de las observaciones si viene con formato
        const rawObs = r.Observaciones?.trim() || null;
        const cleanObs = rawObs ? stripRtf(rawObs) : null;

        records.push({
            numero_admision: numAdmision,
            paciente: r.Paciente?.trim() || 'Sin nombre',
            cliente: r.Cliente?.trim() || null,
            especialidad: r.Especialidad?.trim() || null,
            proceso: r.Proceso?.trim() || null,
            doctor: r.Doctor?.trim() || null,
            motivo_alta: r['Motivo de alta']?.trim() || null,
            control_adm_finalizado: r['Control ADM finalizado']?.trim() || null,
            observaciones: cleanObs,
            fecha_ingreso: formatDate(r['Fecha ingreso']),
            fecha_alta: formatDate(r['Fecha alta']),
        });
    }

    // Deduplicar por numero_admision (último gana)
    const deduped = new Map();
    for (const row of records) {
        deduped.set(row.numero_admision, row);
    }
    const uniqueRecords = [...deduped.values()];
    console.log(`   📦 ${uniqueRecords.length} registros únicos`);

    // Obtener estados existentes para preservarlos
    const ESTADO_FIELD = 'estado';
    const FIELDS_TO_PRESERVE = ['estado', 'operador', 'notas_internas', 'fecha_alta_adm'];
    const existingMap = new Map();

    const admNums = uniqueRecords.map(r => r.numero_admision);
    const FETCH_BATCH = 200;
    for (let i = 0; i < admNums.length; i += FETCH_BATCH) {
        const batch = admNums.slice(i, i + FETCH_BATCH);
        const { data: existing } = await supabase
            .from('altas_administrativas')
            .select(`numero_admision, ${FIELDS_TO_PRESERVE.join(', ')}, control_adm_finalizado`)
            .in('numero_admision', batch);

        if (existing) {
            for (const row of existing) {
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) {
                        // No preservar 'Procesada' — era el default viejo, ahora es null
                        if (f === 'estado' && row[f] === 'Procesada') continue;
                        preserved[f] = row[f];
                    }
                }
                // Guardar también el estado previo de control_adm para detectar transición
                preserved._prev_control_adm = row.control_adm_finalizado;
                if (Object.keys(preserved).length > 0) {
                    existingMap.set(row.numero_admision, preserved);
                }
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 50;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH).map(row => {
            const preserved = existingMap.get(row.numero_admision);
            const merged = preserved ? { ...row, ...preserved } : row;
            // Limpiar campo interno antes de enviar
            delete merged._prev_control_adm;

            // â”€â”€ Detectar transición a "Alta Adm" para setear timestamp â”€â”€
            const prevControl = preserved?._prev_control_adm;
            const newControl = row.control_adm_finalizado;

            if (newControl === 'Sí' && !merged.fecha_alta_adm) {
                // Primera vez que control_adm_finalizado pasa a 'Sí' â†’ marcar timestamp
                merged.fecha_alta_adm = new Date().toISOString();
            }

            return merged;
        });

        const { data, error } = await supabase
            .from('altas_administrativas')
            .upsert(batch, { onConflict: 'numero_admision', ignoreDuplicates: false })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   âŒ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   –… Altas: ${inserted} nuevas, ${updated} actualizadas, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC FOJA QUIRÚRGICA — SQL Server → Supabase
// Fuente: TABLEAU_FojaQuirurgica
// Extrae procedimientos quirúrgicos y calcula triage
// de facturación (Fácil/Media/Difícil) por admisión
// ═══════════════════════════════════════════════════
async function syncFojaQuirurgica(db) {
    console.log('🔪 [4a/10] Extrayendo foja quirúrgica de SALUS...');

    const result = await db.request().query(`
        SELECT 
            [Núm. Admisión],
            [idadmision],
            [Procedimiento quirúrgico],
            [Procedimiento quirúrgico 2],
            [Procedimiento quirúrgico 3],
            [Procedimiento quirúrgico 4]
        FROM [SALUS].[dbo].[TABLEAU_FojaQuirurgica]
        WHERE [Fecha visita] >= '20260401'
        ORDER BY [Fecha visita] DESC
    `);
    console.log(`   📥 ${result.recordset.length} registros de foja extraídos`);

    if (result.recordset.length === 0) {
        return { total: 0, actualizadas: 0, skipped: 0 };
    }

    // Agrupar por numero_admision (una admisión puede tener múltiples fojas)
    // Tomamos la unión de todos los procedimientos
    const fojaMap = new Map();
    for (const r of result.recordset) {
        const numAdm = r['Núm. Admisión'] ? String(r['Núm. Admisión']).trim() : null;
        if (!numAdm) continue;

        const procs = [
            r['Procedimiento quirúrgico'],
            r['Procedimiento quirúrgico 2'],
            r['Procedimiento quirúrgico 3'],
            r['Procedimiento quirúrgico 4'],
        ].filter(p => p && String(p).trim().length > 0)
         .map(p => String(p).trim());

        if (!fojaMap.has(numAdm)) {
            fojaMap.set(numAdm, new Set());
        }
        // Agregar procedimientos únicos
        for (const p of procs) {
            fojaMap.get(numAdm).add(p);
        }
    }

    console.log(`   📦 ${fojaMap.size} admisiones con foja quirúrgica`);

    // Calcular triage y actualizar altas_administrativas
    let actualizadas = 0, skipped = 0;

    for (const [numAdm, procsSet] of fojaMap.entries()) {
        const procs = [...procsSet];
        const cantidad = procs.length;
        let triage = null;
        if (cantidad >= 3) triage = 'Difícil';
        else if (cantidad === 2) triage = 'Media';
        else if (cantidad === 1) triage = 'Fácil';

        const { error } = await supabase
            .from('altas_administrativas')
            .update({
                cantidad_procedimientos: cantidad,
                triage_facturacion: triage,
                procedimientos_detalle: procs,
            })
            .eq('numero_admision', numAdm);

        if (error) {
            skipped++;
        } else {
            actualizadas++;
        }
    }

    const summary = { total: result.recordset.length, admisiones: fojaMap.size, actualizadas, skipped };
    console.log(`   ✅ Foja: ${actualizadas} altas enriquecidas con triage, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC FACTURACIÓN INTERNADA — SQL Server → Supabase
// Fuente: TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios
// Filtra PDV 21 y 31 (facturación internada)
// Cruza con altas_administrativas por numero_admision
// ═══════════════════════════════════════════════════
async function syncFacturacionInternada(db) {
    console.log('🧾 [4b/10] Extrayendo facturación internada (PDV 21/31) de SALUS...');

    const result = await db.request().query(`
        SELECT 
            [Fecha factura],
            [Paciente],
            [Paciente_NHC],
            [Paciente_NIF],
            [Cliente],
            [Concepto],
            [Numero factura],
            [Nº Admision],
            [Usuario creación factura]
        FROM 
            [SALUS].[dbo].[TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios]
        WHERE 
            [Fecha factura] >= DATEADD(DAY, -90, CAST(GETDATE() AS DATE))
            AND (
                [Numero factura] LIKE '00021%' 
                OR [Numero factura] LIKE '00031%'
            )
        ORDER BY 
            [Fecha factura] ASC
    `);
    console.log(`   📥 ${result.recordset.length} líneas de facturación extraídas`);

    if (result.recordset.length === 0) {
        return { total: 0, upserted: 0, skipped: 0, altasActualizadas: 0 };
    }

    const records = [];
    for (const r of result.recordset) {
        const numAdmision = r['Nº Admision'] ? String(r['Nº Admision']).trim() : null;
        const numFactura = r['Numero factura'] ? String(r['Numero factura']).trim() : null;
        if (!numAdmision || !numFactura) continue;

        let pdv = null;
        if (numFactura.startsWith('00021') || numFactura.startsWith('21')) pdv = '21';
        else if (numFactura.startsWith('00031') || numFactura.startsWith('31')) pdv = '31';

        const concepto = r.Concepto ? String(r.Concepto).trim() : null;
        if (!concepto) continue;

        records.push({
            numero_admision: numAdmision,
            numero_factura: numFactura,
            fecha_factura: formatDate(r['Fecha factura']),
            paciente: r.Paciente?.trim() || null,
            paciente_nhc: r.Paciente_NHC ? String(r.Paciente_NHC).trim() : null,
            paciente_nif: r.Paciente_NIF ? String(r.Paciente_NIF).trim() : null,
            cliente: r.Cliente?.trim() || null,
            concepto,
            usuario_factura: r['Usuario creación factura']?.trim() || null,
            pdv,
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Deduplicar por clave única (numero_factura + numero_admision + concepto)
    // SALUS puede devolver la misma línea duplicada, lo que causa
    // "ON CONFLICT DO UPDATE command cannot affect row a second time"
    const dedupMap = new Map();
    for (const r of records) {
        const key = `${r.numero_factura}|${r.numero_admision}|${r.concepto}`;
        dedupMap.set(key, r); // último gana
    }
    const dedupedRecords = [...dedupMap.values()];
    if (dedupedRecords.length < records.length) {
        console.log(`   🔄 Deduplicados: ${records.length} → ${dedupedRecords.length} (${records.length - dedupedRecords.length} duplicados removidos)`);
    }

    let upserted = 0, skipped = 0;
    const BATCH = 100;

    for (let i = 0; i < dedupedRecords.length; i += BATCH) {
        const batch = dedupedRecords.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('facturacion_internada')
            .upsert(batch, {
                onConflict: 'numero_factura,numero_admision,concepto',
                ignoreDuplicates: false,
            })
            .select('id');

        if (error) {
            console.error(`   ❌ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            upserted += data.length;
        }
    }

    console.log(`   ✅ Facturación internada: ${upserted} upserted, ${skipped} errores`);

    // ── Cruce automático con altas_administrativas ──
    const facturadoMap = new Map();
    for (const r of records) {
        if (!facturadoMap.has(r.numero_admision)) {
            facturadoMap.set(r.numero_admision, {
                facturas: new Set(),
                usuario: r.usuario_factura,
                fecha: r.fecha_factura,
            });
        }
        const entry = facturadoMap.get(r.numero_admision);
        entry.facturas.add(r.numero_factura);
        if (r.fecha_factura && (!entry.fecha || r.fecha_factura < entry.fecha)) {
            entry.fecha = r.fecha_factura;
        }
    }

    console.log(`   🔗 ${facturadoMap.size} admisiones con factura, cruzando con altas...`);

    let altasActualizadas = 0;
    for (const [numAdm, info] of facturadoMap.entries()) {
        const { error } = await supabase
            .from('altas_administrativas')
            .update({
                facturada: true,
                facturada_at: info.fecha ? new Date(info.fecha + 'T12:00:00').toISOString() : new Date().toISOString(),
                usuario_facturo: info.usuario,
                cantidad_facturas: info.facturas.size,
            })
            .eq('numero_admision', numAdm);

        if (!error) altasActualizadas++;
    }

    console.log(`   🔗 ${altasActualizadas} altas marcadas como facturadas`);
    return { total: result.recordset.length, upserted, skipped, altasActualizadas };
}


// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC FACTURACIÃ“N SEDE — SQL Server â†’ Supabase
// Fuente: PR_FACTURAS_QRY (dedup por idVisita)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncFacturacionSede(db) {
    console.log('💰 [5/7] Extrayendo facturación Sede Santa Fe de SALUS...');

    // Rango: mes en curso (formato seguro YYYYMMDD)
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const primerDiaMes = `${y}${m}01`;
    const primerDiaMesFmt = `${y}-${m}-01`;

    const result = await db.request().query(`
        WITH Deduped AS (
            SELECT [idVisita], [Paciente_Nombre], [Paciente_NHC], [descripcion],
                   CAST([cantidad] AS INT) AS [cantidad],
                   CAST([importeUnitario] AS DECIMAL(18,2)) AS [ImporteUnitario],
                   CAST([ImporteTotal] AS DECIMAL(18,2)) AS [ImporteTotal],
                   [idPaciente], [Factura_FechaActualizacion],
                   CAST([Factura_FechaActualizacion] AS DATE) AS [Fecha],
                   CAST([Factura_FechaActualizacion] AS TIME(0)) AS [Hora],
                   [Centro_Alias], [Familia], [Servicio], [FormaDePago],
                   [Responsable], [Visita_TipoVisita], [Tarifa],
                   [UsuarioFactura], [Paciente_Telf1],
                   ROW_NUMBER() OVER(PARTITION BY [idVisita], [descripcion] ORDER BY [Factura_FechaActualizacion] DESC) as DupFila
            FROM [SALUS].[dbo].[PR_FACTURAS_QRY]
            WHERE [Factura_FechaActualizacion] >= '${primerDiaMes}'
              AND [Centro_Alias] = 'SANTA FE'
        )
        SELECT d.[idVisita], d.[Paciente_Nombre], d.[Paciente_NHC], d.[descripcion],
               d.[cantidad], d.[ImporteUnitario], d.[ImporteTotal],
               d.[idPaciente], d.[Fecha], d.[Hora],
               d.[Centro_Alias], d.[Familia], d.[Servicio], d.[FormaDePago],
               d.[Responsable], d.[Visita_TipoVisita], d.[Tarifa],
               d.[UsuarioFactura], d.[Paciente_Telf1]
        FROM Deduped d
        WHERE d.DupFila = 1
        ORDER BY d.[Fecha] DESC, d.[Hora] DESC
    `);
    console.log(`   📥 ${result.recordset.length} líneas extraídas (desde ${primerDiaMesFmt})`);

    if (result.recordset.length === 0) {
        return { total: 0, deleted: 0, inserted: 0, skipped: 0 };
    }

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const usuario = r.UsuarioFactura?.trim();
        if (!usuario) continue;

        const fecha = formatDate(r.Fecha);
        if (!fecha) continue;

        // Extraer hora y calcular turno
        let hora = null;
        let turno = null;
        if (r.Hora) {
            if (r.Hora instanceof Date) {
                const h = r.Hora.getUTCHours();
                const mn = r.Hora.getUTCMinutes();
                const s = r.Hora.getUTCSeconds();
                hora = `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
                turno = h < 15 ? 'mañana' : 'tarde';
            } else {
                const timeStr = String(r.Hora);
                const hMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
                if (hMatch) {
                    hora = timeStr.substring(0, 8);
                    turno = parseInt(hMatch[1], 10) < 15 ? 'mañana' : 'tarde';
                }
            }
        }

        // ImporteTotal es el total de TODA la visita
        // Si hay N líneas en la visita, dividir el importe entre N
        // Usar importeUnitario (por práctica) en lugar de ImporteTotal (por visita)
        const importeLinea = Number(r.ImporteUnitario) || 0;

        records.push({
            id_visita: r.idVisita ? String(r.idVisita).trim() : null,
            id_paciente: r.idPaciente ? String(r.idPaciente).trim() : null,
            paciente: r.Paciente_Nombre?.trim() || null,
            paciente_nhc: r.Paciente_NHC ? String(r.Paciente_NHC).trim() : null,
            paciente_telefono: r.Paciente_Telf1 ? String(r.Paciente_Telf1).trim() : null,
            descripcion: r.descripcion?.trim() || null,
            cantidad: Number(r.cantidad) || 1,
            total_importe: importeLinea,
            fecha,
            hora,
            turno,
            familia: r.Familia?.trim() || null,
            servicio: r.Servicio?.trim() || null,
            forma_de_pago: r.FormaDePago?.trim() || null,
            responsable: r.Responsable?.trim() || null,
            visita_tipo: r.Visita_TipoVisita?.trim() || null,
            tarifa: r.Tarifa?.trim() || null,
            usuario_factura: usuario,
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Estrategia: delete-insert (el mes completo)
    // Más confiable que upsert con idVisita que puede ser NULL
    const { error: delError } = await supabase
        .from('facturacion_sede')
        .delete()
        .gte('fecha', primerDiaMesFmt);

    if (delError) {
        console.error(`   âš ï¸ Error al limpiar mes:`, delError.message);
    } else {
        console.log(`   🖑ï¸ Datos del mes limpiados para refresh`);
    }

    // Insert en lotes
    let inserted = 0, skipped = 0;
    const BATCH = 100;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('facturacion_sede')
            .insert(batch)
            .select('id');

        if (error) {
            console.error(`   âŒ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    const summary = { total: result.recordset.length, deleted: 'mes completo', inserted, skipped };
    console.log(`   –… Facturación Sede: ${inserted} registros sincronizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// SYNC VISITAS SEDE — SQL Server â†’ Supabase
// Fuente: VLISE_Visitas (Centro SANTA FE, Asistencia = Presente)
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
async function syncVisitasSede(db) {
    console.log('🏥 [6/7] Extrayendo visitas Sede Santa Fe de SALUS...');

    // Rango: mes en curso
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const primerDiaMes = `${y}${m}01`;
    const primerDiaMesFmt = `${y}-${m}-01`;

    const result = await db.request().query(`
        SELECT 
            v.[idVisita],
            CAST(v.[Fecha Visita] AS DATE) AS [Fecha],
            v.[IdPaciente],
            v.[Paciente],
            v.[Cliente],
            v.[Responsable],
            v.[Tipo Visita],
            v.[Centro],
            v.[Visita_Especialidad],
            LimpiezaUsuario.[UsuarioReal]
        FROM [SALUS].[dbo].[VLISE_Visitas] v
        OUTER APPLY (
            SELECT CAST('<x>' + 
                REPLACE(
                    REPLACE(
                        REPLACE(ISNULL(v.[UsuarioCita], ''), '<', '&lt;'), 
                    '>', '&gt;'), 
                '|', '</x><x>') 
            + '</x>' AS XML) AS xmlData
        ) AS XmlConv
        OUTER APPLY (
            SELECT TOP 1 
                LTRIM(RTRIM(SUBSTRING(Node.Valor, 1, CHARINDEX('(', Node.Valor) - 1))) AS [UsuarioReal]
            FROM (
                SELECT Split.a.value('.', 'VARCHAR(MAX)') AS Valor
                FROM XmlConv.xmlData.nodes('/x') AS Split(a)
            ) AS Node
            WHERE 
                CHARINDEX('(', Node.Valor) > 0 
                AND LEN(Node.Valor) >= CHARINDEX('(', Node.Valor) + 19 
            ORDER BY 
                CASE 
                    WHEN ISDATE(SUBSTRING(Node.Valor, CHARINDEX('(', Node.Valor) + 1, 19)) = 1 
                    THEN CONVERT(DATETIME, SUBSTRING(Node.Valor, CHARINDEX('(', Node.Valor) + 1, 19), 103)
                    ELSE CAST('1900-01-01' AS DATETIME) 
                END DESC
        ) AS LimpiezaUsuario
        WHERE 
            CAST(v.[Fecha Visita] AS DATE) >= '${primerDiaMes}'
            AND v.[Asistencia] = 'Presente'
            AND v.[Centro] = 'SANTA FE'
        ORDER BY v.[Fecha Visita] DESC
    `);
    console.log(`   📥 ${result.recordset.length} visitas extraídas (desde ${primerDiaMesFmt})`);

    if (result.recordset.length === 0) {
        return { total: 0, deleted: 0, inserted: 0, skipped: 0 };
    }

    // Transformar filas — el SQL ya devuelve UsuarioReal limpio via XML splitting
    const records = [];
    for (const r of result.recordset) {
        const usuario = r.UsuarioReal?.trim();
        if (!usuario) continue;

        const fecha = formatDate(r.Fecha);
        if (!fecha) continue;

        records.push({
            id_visita: r.idVisita ? String(r.idVisita).trim() : null,
            fecha,
            id_paciente: r.IdPaciente ? String(r.IdPaciente).trim() : null,
            paciente: r.Paciente?.trim() || null,
            cliente: r.Cliente?.trim() || null,
            responsable: r.Responsable?.trim() || null,
            tipo_visita: r['Tipo Visita']?.trim() || null,
            especialidad: r.Visita_Especialidad?.trim() || null,
            usuario_creacion: usuario,
            centro: 'SANTA FE',
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Estrategia: delete-insert (mes completo)
    const { error: delError } = await supabase
        .from('visitas_sede')
        .delete()
        .gte('fecha', primerDiaMesFmt);

    if (delError) {
        console.error(`   âš ï¸ Error al limpiar mes:`, delError.message);
    } else {
        console.log(`   🖑ï¸ Datos del mes limpiados para refresh`);
    }

    // Insert en lotes
    let inserted = 0, skipped = 0;
    const BATCH = 100;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('visitas_sede')
            .insert(batch)
            .select('id');

        if (error) {
            console.error(`   âŒ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    const summary = { total: result.recordset.length, deleted: 'mes completo', inserted, skipped };
    console.log(`   –… Visitas Sede: ${inserted} registros sincronizados, ${skipped} errores`);
    return summary;
}

// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
// ═══════════════════════════════════════════════════
// SYNC CIRUGÍAS ASOCIACIONES — SQL Server → Supabase
// Fuente: TABLEAU_Cirugias (especialidades con asociación)
// ═══════════════════════════════════════════════════
const ESPECIALIDAD_ASOCIACION = {
    'CIRUGIA': 'Asociación de Cirujanos',
    'GINECOLOGIA': 'Asociación de Ginecólogos',
    'ORTOPEDIA / TRAUMATOLOGIA': 'Asociación de Traumatólogos',
    'CIRUGIA PEDIATRICA': 'Asociación de Cirujanos Pediatras',
    'OTORRINOLARINGOLOGIA': 'ORL (Particular)',
};

async function syncAsociacionesCirugias(db) {
    console.log('📦 [7/7] Extrayendo cirugías para asociaciones de SALUS...');

    const result = await db.request().query(`
        SELECT 
            CONVERT(VARCHAR(10), CONVERT(DATE, LEFT([Fecha realización], 10), 103), 23) AS [Fecha realización],
            [Nombre Paciente],
            [Cliente],
            [DNI],
            [Especialidad],
            [Nombre cirugía],
            [Estado],
            [Cirujano]
        FROM [SALUS].[dbo].[TABLEAU_Cirugias]
        WHERE 
            [Fecha realización] IS NOT NULL
            AND LEN([Fecha realización]) >= 10 
            AND CONVERT(DATE, LEFT([Fecha realización], 10), 103) >= '20260301'
            AND [Especialidad] IN (
                'CIRUGIA', 
                'GASTROENTEROLOGIA',
                'OTORRINOLARINGOLOGIA', 
                'CIRUGIA PEDIATRICA', 
                'ORTOPEDIA / TRAUMATOLOGIA',
                'GINECOLOGIA'
            )
            AND [Estado] IN (
                'Presente', 
                'NO PROGRAMADA', 
                'No Programada',
                'URGENCIA',
                'Urgencia',
                'Realizada',
                'REALIZADA',
                'REALIZADO',
                'Realizado',
                'FINALIZADO',
                'Finalizada',
                'Finalizado'
            )
        ORDER BY CONVERT(DATE, LEFT([Fecha realización], 10), 103) ASC
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    // Campos a preservar durante upsert (estados manuales del frontend)
    const FIELDS_TO_PRESERVE = [
        'docs_completos', 'en_carrito', 'constancia_id',
        'operador', 'checked_at', 'entregado_at',
    ];

    // Transformar filas
    const records = [];
    let skippedSinNombre = 0;
    let skippedFecha = 0;
    const skippedEspecialidades = new Map(); // especialidad → count

    for (const r of result.recordset) {
        const nombre = r['Nombre Paciente']?.trim();
        const especialidad = r.Especialidad?.trim();
        if (!nombre || !especialidad) { skippedSinNombre++; continue; }

        const asociacion = ESPECIALIDAD_ASOCIACION[especialidad];
        if (!asociacion) {
            skippedEspecialidades.set(especialidad, (skippedEspecialidades.get(especialidad) || 0) + 1);
            continue;
        }

        const fechaRaw = r['Fecha realización'];
        const fecha = formatDate(fechaRaw);
        if (!fecha) { skippedFecha++; continue; }

        records.push({
            fecha_realizacion: fecha,
            nombre_paciente: nombre,
            cliente: r.Cliente?.trim() || null,
            dni: r.DNI ? String(r.DNI).trim() : null,
            especialidad,
            nombre_cirugia: r['Nombre cirugía']?.trim() || null,
            estado: r.Estado?.trim() || null,
            cirujano: r.Cirujano?.trim() || null,
            asociacion,
        });
    }

    // Log de exclusiones
    const totalExcluidos = skippedSinNombre + skippedFecha + [...skippedEspecialidades.values()].reduce((a, b) => a + b, 0);
    if (totalExcluidos > 0) {
        console.log(`   ⚠️  ${totalExcluidos} registros excluidos:`);
        if (skippedSinNombre > 0) console.log(`      - Sin nombre/especialidad: ${skippedSinNombre}`);
        if (skippedFecha > 0) console.log(`      - Fecha inválida: ${skippedFecha}`);
        if (skippedEspecialidades.size > 0) {
            console.log(`      - Especialidad no mapeada:`);
            for (const [esp, cnt] of skippedEspecialidades.entries()) {
                console.log(`        • "${esp}": ${cnt} registros`);
            }
        }
    }

    // Deduplicar (último gana por key: fecha+nombre_paciente+cirugia)
    // IMPORTANTE: usar nombre_paciente en vez de dni porque dni puede ser NULL
    // y en PostgreSQL NULL != NULL en constraints UNIQUE
    const deduped = new Map();
    for (const row of records) {
        const key = `${row.fecha_realizacion}|${row.nombre_paciente}|${row.nombre_cirugia}`;
        deduped.set(key, row);
    }
    const uniqueRecords = [...deduped.values()];
    console.log(`   📦 ${uniqueRecords.length} registros únicos`);

    // Obtener estados existentes para preservarlos
    const existingMap = new Map();
    const FETCH_BATCH_SIZE = 200;

    const fechas = [...new Set(uniqueRecords.map(r => r.fecha_realizacion))];
    for (let i = 0; i < fechas.length; i += FETCH_BATCH_SIZE) {
        const batchFechas = fechas.slice(i, i + FETCH_BATCH_SIZE);
        const { data: existing } = await supabase
            .from('asociaciones_cirugias')
            .select(`fecha_realizacion, nombre_paciente, nombre_cirugia, ${FIELDS_TO_PRESERVE.join(', ')}`)
            .in('fecha_realizacion', batchFechas);

        if (existing) {
            for (const row of existing) {
                const key = `${row.fecha_realizacion}|${row.nombre_paciente}|${row.nombre_cirugia}`;
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) preserved[f] = row[f];
                }
                if (Object.keys(preserved).length > 0) existingMap.set(key, preserved);
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 50;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH).map(row => {
            const key = `${row.fecha_realizacion}|${row.nombre_paciente}|${row.nombre_cirugia}`;
            const preserved = existingMap.get(key);
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('asociaciones_cirugias')
            .upsert(batch, {
                onConflict: 'fecha_realizacion,nombre_paciente,nombre_cirugia',
                ignoreDuplicates: false,
            })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   ❌ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   ✅ Asociaciones: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC LABORATORIOS (Anatomía Patológica) — SQL Server → Supabase
// ═══════════════════════════════════════════════════
async function syncLaboratorios(db) {
    console.log('🔬 [8/8] Extrayendo laboratorios de anatomía patológica de SALUS...');

    const result = await db.request().query(`
        SELECT 
              AP.[idvisita]
              ,PP.[N.Admision]
              ,AP.[Fecha visita]
              ,AP.[Paciente]
              ,V.[NIF]
              ,V.[Cliente]
              ,AP.[Laboratorio]
              ,AP.[Biopsia por congelación]
              ,AP.[Biopsia simple]
              ,AP.[Material Remitido (Biopsia simple)]
              ,AP.[Biopsia ampliada]
              ,AP.[Material remitido (Biopsia ampliada)]
          FROM [SALUS].[dbo].[VLIS_AnatomiaPatologica] AS AP
          LEFT JOIN [SALUS].[dbo].[VLISE_Visitas] AS V 
              ON AP.[idvisita] = V.[idVisita]
          OUTER APPLY (
              SELECT TOP 1 PP_Sub.[N.Admision] 
              FROM [SALUS].[dbo].[VLISE_PeticionesPruebas] AS PP_Sub
              WHERE PP_Sub.[idVisita] = AP.[idvisita]
                AND PP_Sub.[N.Admision] IS NOT NULL
          ) AS PP
          WHERE AP.[Fecha visita] >= '20260301'
          ORDER BY AP.[Fecha visita] DESC;
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0 };
    }

    // Campos a preservar durante upsert (estados manuales del frontend)
    const FIELDS_TO_PRESERVE = [
        'modulo_asignado', 'clasificado_at', 'clasificado_por'
    ];

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const idVisita = r.idvisita ? String(r.idvisita).trim() : null;
        if (!idVisita) continue;

        const fechaRaw = r['Fecha visita'];
        const fecha = formatDate(fechaRaw);
        if (!fecha) continue;

        records.push({
            id_visita: idVisita,
            n_admision: r['N.Admision'] ? String(r['N.Admision']).trim() : null,
            fecha_visita: fecha,
            paciente: r.Paciente ? String(r.Paciente).trim() : null,
            dni: r.NIF ? String(r.NIF).trim() : null,
            cliente: r.Cliente ? String(r.Cliente).trim() : null,
            laboratorio: r.Laboratorio ? String(r.Laboratorio).trim() : null,
            biopsia_congelacion: r['Biopsia por congelación'] ? String(r['Biopsia por congelación']).trim() : null,
            biopsia_simple: r['Biopsia simple'] ? String(r['Biopsia simple']).trim() : null,
            material_biopsia_simple: r['Material Remitido (Biopsia simple)'] ? String(r['Material Remitido (Biopsia simple)']).trim() : null,
            biopsia_ampliada: r['Biopsia ampliada'] ? String(r['Biopsia ampliada']).trim() : null,
            material_biopsia_ampliada: r['Material remitido (Biopsia ampliada)'] ? String(r['Material remitido (Biopsia ampliada)']).trim() : null,
        });
    }

    // Deduplicar (último gana por key: id_visita)
    const deduped = new Map();
    for (const row of records) {
        deduped.set(row.id_visita, row);
    }
    const uniqueRecords = [...deduped.values()];
    console.log(`   📦 ${uniqueRecords.length} registros únicos`);

    // Obtener estados existentes para preservarlos
    const existingMap = new Map();
    const FETCH_BATCH_SIZE = 200;

    const ids = uniqueRecords.map(r => r.id_visita);
    for (let i = 0; i < ids.length; i += FETCH_BATCH_SIZE) {
        const batchIds = ids.slice(i, i + FETCH_BATCH_SIZE);
        const { data: existing } = await supabase
            .from('laboratorios_anatomia_patologica')
            .select(`id_visita, ${FIELDS_TO_PRESERVE.join(', ')}`)
            .in('id_visita', batchIds);

        if (existing) {
            for (const row of existing) {
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) preserved[f] = row[f];
                }
                if (Object.keys(preserved).length > 0) existingMap.set(row.id_visita, preserved);
            }
        }
    }
    console.log(`   🔒 ${existingMap.size} registros con estados a preservar`);

    // Upsert en lotes
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 50;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH).map(row => {
            const preserved = existingMap.get(row.id_visita);
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('laboratorios_anatomia_patologica')
            .upsert(batch, {
                onConflict: 'id_visita',
                ignoreDuplicates: false,
            })
            .select('id, created_at, updated_at');

        if (error) {
            console.error('   ❌ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   ✅ Laboratorios: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// ═══════════════════════════════════════════════
// SYNC CONSULTAS GUARDIA — SQL Server → Supabase
// Fuente: VLISE_Visitas con categoria (mes en curso dinámico)
// ═══════════════════════════════════════════════
async function syncConsultasGuardia(db) {
    console.log('\n\ud83c\udfe5 [CONSULTAS] Extrayendo consultas de guardia de SALUS...');

    // Rango dinámico: mes en curso
    const hoy = new Date();
    const y = hoy.getFullYear();
    const m = String(hoy.getMonth() + 1).padStart(2, '0');
    const primerDia = `${y}${m}01`;
    // Primer día del próximo mes
    const nextMonth = hoy.getMonth() + 2 > 12 ? 1 : hoy.getMonth() + 2;
    const nextYear = nextMonth === 1 ? y + 1 : y;
    const primerDiaSiguiente = `${nextYear}${String(nextMonth).padStart(2, '0')}01`;
    const mesPeriodo = `${y}-${m}`;

    console.log(`   \ud83d\udcc5 Rango: ${primerDia} a ${primerDiaSiguiente} (mes_periodo: ${mesPeriodo})`);

    const req = db.request();
    req.timeout = 120000;
    const result = await req.query(`
        WITH VisitasFiltradas AS (
            SELECT 
                [idVisita],
                [IdPaciente],
                [Cliente],
                [Asistencia],
                [Paciente],
                [NHC],
                [NIF],
                [Agenda],
                CASE 
                    WHEN [Agenda] LIKE '(NEO)%' THEN 'NEO'
                    WHEN [Agenda] LIKE 'GYM%' THEN 'GYM'
                    ELSE [Agenda] 
                END AS [Agrupacion_Agenda],
                [Grupo Agenda],
                [Tipo Visita],
                [TiempoPred],
                [Fecha Visita], 
                [Visita_Especialidad],
                [Hora Inicio Visita Formato Texto] AS [Hora_Visita],
                ROW_NUMBER() OVER(PARTITION BY [idVisita] ORDER BY [Fecha Visita] DESC) AS rn
            FROM [SALUS].[dbo].[VLISE_Visitas con categoria]
            WHERE 
                [Fecha Visita] >= '${primerDia}' 
                AND [Fecha Visita] < '${primerDiaSiguiente}'
                AND LOWER(LTRIM(RTRIM([Asistencia]))) = 'presente' 
                AND [Agenda] IN (
                    'GUARDIA CARDIOLOGICA', 'GUARDIAS CLINICA', 'GUARDIAS GINECOLOGIA', 'GUARDIAS PEDIATRÍA',
                    '(NEO) ROSALES TORRES SILVANA', '(NEO) CASTRO MONICA', '(NEO) VALDEZ MARIA', 
                    '(NEO) DRA. RUARTE, SONIA', '(NEO) DRA. SVRIZ WUCHERER NATALIA ELIZABETH', 
                    '(NEO) DRA. CLAVEL MARISA ANALIA', '(NEO) DR. HERNANDEZ, EDUARDO RAFAEL', 
                    '(NEO) GOMEZ ANDREA', '(NEO) HERNANDEZ, MARIA BELEN', '(NEO) DR. LUNA, HORACIO', 
                    '(NEO) JOFRE, GASTON MARCELO', '(NEO) DRA. CORREA, ANDREA', '(NEO) POSATINI MARIA FERNANDA', 
                    '(NEO) MORAN PATRICIA', '(NEO) MALOSCH, GABRIELA', '(NEO) TEJADA, JOSE LUIS', 
                    '(NEO) DR. RAMELLA, FERNANDO JOSE', '(NEO) DRA. AGUIRRE, VERONICA', 
                    '(NEO) DRA. CORREA, ANDREA-Baja', '(NEO) URIZAR ANALIA', '(NEO) AGUILAR, MARIA EUGENIA', 
                    '(NEO)URIZAR ANALIA', '(NEO) MOLINA, BERTHA BEATRIZ', '(NEO) DOMINGUEZ, GLADYS', 
                    '(NEO) DRA. MATEU MARTA EDITH', '(NEO) DR. FONT GERMAN ALBERTO ', 
                    '(NEO) MANRIQUE CLAUDIA', '(NEO)  DRA.RAMOS GABRIELA', '(NEO) MARTIN, AGUSTINA', 
                    'GYM PREPARTO', 'GYM BARIATRICA'
                )
        )
        SELECT 
            [idVisita],
            [IdPaciente],
            [Cliente],
            [Asistencia],
            [Paciente],
            [NHC],
            [NIF],
            [Agenda],             
            [Agrupacion_Agenda],  
            [Grupo Agenda],
            [Tipo Visita],
            [TiempoPred],
            [Fecha Visita],
            [Visita_Especialidad],
            [Hora_Visita]
        FROM 
            VisitasFiltradas
        WHERE 
            rn = 1
    `);
    console.log(`   \ud83d\udce5 ${result.recordset.length} registros extra\u00eddos`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, updated: 0, skipped: 0, mesPeriodo };
    }

    // Crear/actualizar registro de importaci\u00f3n
    const { data: importRec } = await supabase
        .from('consultas_imports')
        .upsert({ mes: mesPeriodo, archivo: 'SALUS Sync Autom\u00e1tico', total_registros: result.recordset.length }, { onConflict: 'mes' })
        .select('id')
        .single();
    const importId = importRec?.id || null;

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const idVisita = r.idVisita ? Number(r.idVisita) : null;
        if (!idVisita) continue;

        const fecha = formatDate(r['Fecha Visita']);
        if (!fecha) continue;

        records.push({
            import_id: importId,
            id_visita: idVisita,
            id_paciente: r.IdPaciente ? Number(r.IdPaciente) : null,
            cliente: (r.Cliente || '').trim(),
            asistencia: (r.Asistencia || '').trim(),
            paciente: (r.Paciente || '').trim(),
            nhc: r.NHC || null,
            nif: r.NIF ? String(r.NIF).trim() : null,
            agenda: (r.Agenda || '').trim(),
            agrupacion_agenda: (r.Agrupacion_Agenda || '').trim(),
            grupo_agenda: (r['Grupo Agenda'] || '').trim(),
            tipo_visita: (r['Tipo Visita'] || '').trim(),
            tiempo_pred: r.TiempoPred || null,
            fecha_visita: fecha,
            hora_visita: (r.Hora_Visita || '').trim() || null,
            visita_especialidad: (r.Visita_Especialidad || '').trim(),
            mes_periodo: mesPeriodo,
        });
    }

    // Deduplicar por id_visita
    const deduped = new Map();
    for (const row of records) deduped.set(row.id_visita, row);
    const uniqueRecords = [...deduped.values()];
    console.log(`   \ud83d\udce6 ${uniqueRecords.length} registros \u00fanicos`);

    // Batch upsert
    let inserted = 0, updated = 0, skipped = 0;
    const BATCH = 500;

    for (let i = 0; i < uniqueRecords.length; i += BATCH) {
        const batch = uniqueRecords.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('consultas_guardia')
            .upsert(batch, { onConflict: 'id_visita', ignoreDuplicates: false })
            .select('id');

        if (error) {
            console.error(`   \u274c Batch ${i} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    // Actualizar total en import
    if (importId) {
        await supabase.from('consultas_imports').update({ total_registros: uniqueRecords.length }).eq('id', importId);
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped, mesPeriodo };
    console.log(`   \u2705 Consultas Guardia: ${inserted} nuevas, ${updated} actualizadas, ${skipped} errores (${mesPeriodo})`);
    return summary;
}

// ═══════════════════════════════════════════════════
// SYNC RECEPCIONES VISITAS — SQL Server → Supabase
// Fuente: TABLEAU_Visitas ordenadas por agenda (CHQ + ECO)
// ═══════════════════════════════════════════════════
async function syncRecepcionesVisitas(db) {
    console.log('\n🏥 [RECEPCIONES] Extrayendo visitas CHQ/ECO de SALUS...');

    // Rango dinámico: desde 30 días atrás (historial reciente + ausentes) + todo lo futuro
    const desde = new Date();
    desde.setDate(desde.getDate() - 30);
    const desdeStr = desde.toISOString().split('T')[0].replace(/-/g, '');

    const req = db.request();
    req.timeout = 120000;
    const result = await req.query(`
        SELECT 
              [TIPO AGENDA]
              ,[FECHA]
              ,[HORA]
              ,REPLACE(REPLACE([TIPO VISITA], CHAR(13), ' '), CHAR(10), ' ') AS [TIPO VISITA]
              ,[NHC]
              ,[NIF] AS [DNI]
              ,[PACIENTE]
              ,[CLIENTE] AS [Obra Social]
              ,REPLACE(REPLACE([MOTIVO], CHAR(13), ' '), CHAR(10), ' ') AS [MOTIVO]
              
              -- LÓGICA DE ASISTENCIA: si ayer y nula → Ausente
              ,CASE 
                  WHEN CAST([FECHA] AS DATE) = CAST(DATEADD(day, -1, GETDATE()) AS DATE) AND [ASISTENCIA] IS NULL THEN 'Ausente'
                  ELSE [ASISTENCIA] 
               END AS [ASISTENCIA]

              ,[MEDICO]
              ,[DIRECCION PACIENTE]
              ,[POBLACION PACIENTE] AS [Departamento]
              
              -- LIMPIEZA TELEFONO 1
              ,CASE 
                  WHEN NULLIF(LTRIM(RTRIM([TELEFONO1 PACIENTE])), '') IS NULL THEN [TELEFONO1 PACIENTE] 
                  WHEN [TELEFONO1 PACIENTE] LIKE '549%' THEN [TELEFONO1 PACIENTE] 
                  WHEN [TELEFONO1 PACIENTE] LIKE '15%' THEN STUFF([TELEFONO1 PACIENTE], 1, 2, '549264') 
                  ELSE '549' + [TELEFONO1 PACIENTE] 
               END AS [TELEFONO1 PACIENTE]
               
              -- LIMPIEZA TELEFONO 2
              ,CASE 
                  WHEN NULLIF(LTRIM(RTRIM([TELEFONO2 PACIENTE])), '') IS NULL THEN [TELEFONO2 PACIENTE] 
                  WHEN [TELEFONO2 PACIENTE] LIKE '549%' THEN [TELEFONO2 PACIENTE] 
                  WHEN [TELEFONO2 PACIENTE] LIKE '15%' THEN STUFF([TELEFONO2 PACIENTE], 1, 2, '549264') 
                  ELSE '549' + [TELEFONO2 PACIENTE] 
               END AS [TELEFONO2 PACIENTE]

              ,REPLACE(REPLACE([COMENTARIOS], CHAR(13), ' '), CHAR(10), ' ') AS [COMENTARIOS]
              ,[ESPECIALIDAD]
              ,[Centro]
          FROM [SALUS].[dbo].[TABLEAU_Visitas ordenadas por agenda]
          WHERE [FECHA] >= '${desdeStr}'
            AND (
                  [TIPO VISITA] LIKE '%(CHQ) CHEQUEO PREVENTIVO%' 
                  OR [TIPO VISITA] LIKE '%(ECO)%'
                );
    `);
    console.log(`   📥 ${result.recordset.length} registros extraídos (desde ${desdeStr})`);

    if (result.recordset.length === 0) {
        return { total: 0, inserted: 0, skipped: 0 };
    }

    // Transformar filas
    const records = [];
    for (const r of result.recordset) {
        const paciente = r.PACIENTE?.trim();
        if (!paciente) continue;

        const fecha = formatDate(r.FECHA);
        if (!fecha) continue;

        // Normalizar teléfonos (ya vienen limpios del SQL, pero aseguramos formato)
        const tel1Raw = r['TELEFONO1 PACIENTE'] ? String(r['TELEFONO1 PACIENTE']).replace(/\D/g, '') : null;
        const tel2Raw = r['TELEFONO2 PACIENTE'] ? String(r['TELEFONO2 PACIENTE']).replace(/\D/g, '') : null;

        // Extraer hora como string
        let hora = null;
        if (r.HORA) {
            if (r.HORA instanceof Date) {
                const h = r.HORA.getUTCHours();
                const mn = r.HORA.getUTCMinutes();
                hora = `${String(h).padStart(2, '0')}:${String(mn).padStart(2, '0')}`;
            } else {
                const timeStr = String(r.HORA);
                const hMatch = timeStr.match(/(\d{1,2}):(\d{2})/);
                if (hMatch) hora = `${hMatch[1].padStart(2, '0')}:${hMatch[2]}`;
            }
        }

        records.push({
            tipo_agenda: r['TIPO AGENDA']?.trim() || null,
            fecha,
            hora,
            tipo_visita: r['TIPO VISITA']?.trim() || null,
            nhc: r.NHC ? String(r.NHC).trim() : null,
            dni: r.DNI ? String(r.DNI).trim() : null,
            paciente,
            obra_social: r['Obra Social']?.trim() || null,
            motivo: r.MOTIVO?.trim() || null,
            asistencia: r.ASISTENCIA?.trim() || null,
            medico: r.MEDICO?.trim() || null,
            direccion: r['DIRECCION PACIENTE']?.trim() || null,
            departamento: r.Departamento?.trim() || null,
            telefono1: tel1Raw || null,
            telefono2: tel2Raw || null,
            comentarios: r.COMENTARIOS?.trim() || null,
            especialidad: r.ESPECIALIDAD?.trim() || null,
            centro: r.Centro?.trim() || null,
        });
    }

    console.log(`   📦 ${records.length} registros válidos`);

    // Estrategia: delete-insert para el rango de fechas activo
    // Detectar rango de fechas en los datos
    const fechas = [...new Set(records.map(r => r.fecha))].sort();
    const fechaMin = fechas[0];
    const fechaMax = fechas[fechas.length - 1];

    const { error: delError } = await supabase
        .from('recepciones_visitas')
        .delete()
        .gte('fecha', fechaMin)
        .lte('fecha', fechaMax);

    if (delError) {
        console.error(`   ⚠️ Error al limpiar rango:`, delError.message);
    } else {
        console.log(`   🗑️ Datos limpiados (${fechaMin} a ${fechaMax})`);
    }

    // Insert en lotes
    let inserted = 0, skipped = 0;
    const BATCH = 100;

    for (let i = 0; i < records.length; i += BATCH) {
        const batch = records.slice(i, i + BATCH);
        const { data, error } = await supabase
            .from('recepciones_visitas')
            .insert(batch)
            .select('id');

        if (error) {
            console.error(`   ❌ Batch ${Math.floor(i / BATCH) + 1} error:`, error.message);
            skipped += batch.length;
        } else if (data) {
            inserted += data.length;
        }
    }

    const summary = { total: result.recordset.length, inserted, skipped, fechaMin, fechaMax };
    console.log(`   ✅ Recepciones: ${inserted} registros sincronizados, ${skipped} errores (${fechaMin} a ${fechaMax})`);
    return summary;
}

// ENDPOINT PRINCIPAL: SYNC TODO
// â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
let syncInProgress = false;

app.get('/api/salus/sync-all', async (req, res) => {
    if (syncInProgress) {
        return res.status(429).json({ success: false, error: 'Ya hay una sincronización en curso. Espere a que termine.' });
    }

    syncInProgress = true;
    const startTime = Date.now();
    console.log('\n🚀 â•â•â• SINCRONIZACIÃ“N COMPLETA INICIADA â•â•â•');

    const results = {};

    try {
        const db = await getPool();

        try {
            results.cirugias = await syncCirugias(db);
        } catch (err) {
            console.error('âŒ Error en cirugías:', err.message);
            results.cirugias = { error: err.message };
        }

        try {
            results.presupuestos = await syncPresupuestos(db);
        } catch (err) {
            console.error('âŒ Error en presupuestos:', err.message);
            results.presupuestos = { error: err.message };
        }

        try {
            results.deudas = await syncDeudas(db);
        } catch (err) {
            console.error('âŒ Error en deudas:', err.message);
            results.deudas = { error: err.message };
        }

        try {
            results.cobros = await syncCobros(db);
        } catch (err) {
            console.error('Error en cobros:', err.message);
            results.cobros = { error: err.message };
        }

        try {
            results.notasCredito = await syncNotasCredito(db);
        } catch (err) {
            console.error('Error en notas de credito:', err.message);
            results.notasCredito = { error: err.message };
        }

        try {
            results.altas = await syncAltasAdministrativas(db);
        } catch (err) {
            console.error('âŒ Error en altas administrativas:', err.message);
            results.altas = { error: err.message };
        }

        try {
            results.fojaQuirurgica = await syncFojaQuirurgica(db);
        } catch (err) {
            console.error('❌ Error en foja quirúrgica:', err.message);
            results.fojaQuirurgica = { error: err.message };
        }

        try {
            results.facturacionInternada = await syncFacturacionInternada(db);
        } catch (err) {
            console.error('\u274C Error en facturaci\u00F3n internada:', err.message);
            results.facturacionInternada = { error: err.message };
        }

        try {
            results.facturacion = await syncFacturacionSede(db);
        } catch (err) {
            console.error('âŒ Error en facturación sede:', err.message);
            results.facturacion = { error: err.message };
        }

        try {
            results.visitas = await syncVisitasSede(db);
        } catch (err) {
            console.error('❌ Error en visitas sede:', err.message);
            results.visitas = { error: err.message };
        }

        try {
            results.asociaciones = await syncAsociacionesCirugias(db);
        } catch (err) {
            console.error('Error en asociaciones:', err.message);
            results.asociaciones = { error: err.message };
        }

        try {
            results.laboratorios = await syncLaboratorios(db);
        } catch (err) {
            console.error('Error en laboratorios:', err.message);
            results.laboratorios = { error: err.message };
        }

        try {
            results.consultasGuardia = await syncConsultasGuardia(db);
        } catch (err) {
            console.error('Error en consultas guardia:', err.message);
            results.consultasGuardia = { error: err.message };
        }

        try {
            results.recepciones = await syncRecepcionesVisitas(db);
        } catch (err) {
            console.error('Error en recepciones:', err.message);
            results.recepciones = { error: err.message };
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n–… ▬▬▬▬▬ SINCRONIZACIÓN COMPLETADA en ${elapsed}s ▬▬▬▬▬ \n`);

        console.log(`
         ___  _____
       .'/,-Y"     "~-.
       l.Y             ^.
       /\\               _\\_
      i            ___/"   "\\
      |          /"   "\\   o !
      l         ]     o !__./
       \\ _  _    \\.___./    "~\\
        X \\/ \\            ___./
       ( \\ ___.   _..--~~"   ~\\\`-.
        \\\` Z,--   /               \\
          \\__.  (   /       ______)
            \\   l  /-----~~" /
             Y   \\          /
             |    "x______.^
             |           \\
             j            Y

    –¨ "Â¡Mmm... Deudas y Presupuestos frescos!" –¨
        `);

        res.json({
            success: true,
            elapsed: `${elapsed}s`,
            timestamp: new Date().toISOString(),
            results,
        });
    } catch (err) {
        console.error('âŒ Error fatal:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        syncInProgress = false;
    }
});

// â”€â”€ Endpoints individuales â”€â”€
app.get('/api/salus/sync/cirugias', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncCirugias(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/presupuestos', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncPresupuestos(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/deudas', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncDeudas(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/cobros', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncCobros(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/notas-credito', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncNotasCredito(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/facturacion', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncFacturacionSede(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/visitas', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncVisitasSede(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/asociaciones', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncAsociacionesCirugias(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/laboratorios', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncLaboratorios(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/consultas-guardia', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncConsultasGuardia(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/recepciones', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncRecepcionesVisitas(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

app.get('/api/salus/sync/facturacion-internada', async (req, res) => {
    try { const db = await getPool(); res.json({ success: true, results: await syncFacturacionInternada(db) }); }
    catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// â”€â”€ Health check â”€â”€
app.get('/api/salus/health', async (req, res) => {
    try {
        const db = await getPool();
        await db.request().query('SELECT 1 AS ok');
        res.json({ success: true, connected: true, server: '128.223.16.29:2450', supabase: supabaseUrl ? 'configured' : 'missing' });
    } catch (err) {
        res.json({ success: false, connected: false, error: err.message });
    }
});

// Limpieza de duplicados de asociaciones por fecha inconsistente
app.get('/api/salus/cleanup/asociaciones-dups', async (req, res) => {
    try {
        console.log('Buscando duplicados de asociaciones por fecha inconsistente...');

        const { data: all, error } = await supabase
            .from('asociaciones_cirugias')
            .select('id, fecha_realizacion, nombre_paciente, nombre_cirugia, dni, docs_completos, en_carrito, constancia_id, created_at')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Agrupar por nombre_paciente + nombre_cirugia + dni (sin fecha)
        const groups = new Map();
        for (const row of all) {
            const key = `${(row.nombre_paciente || '').toUpperCase()}|${(row.nombre_cirugia || '').toUpperCase()}|${row.dni || ''}`;
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        }

        // Detectar duplicados: mismo key con fechas donde dia y mes estan invertidos
        const toDelete = [];
        const dupsFound = [];

        for (const [key, rows] of groups) {
            if (rows.length < 2) continue;

            for (let i = 0; i < rows.length; i++) {
                for (let j = i + 1; j < rows.length; j++) {
                    const a = rows[i], b = rows[j];
                    const [aY, aM, aD] = (a.fecha_realizacion || '').split('-');
                    const [bY, bM, bD] = (b.fecha_realizacion || '').split('-');

                    // Verificar si las fechas son inversion de dia/mes
                    if (aY === bY && aM === bD && aD === bM && aM !== aD) {
                        const aHasWork = a.docs_completos || a.en_carrito || a.constancia_id;
                        const bHasWork = b.docs_completos || b.en_carrito || b.constancia_id;

                        let keep, remove;
                        if (aHasWork && !bHasWork) {
                            keep = a; remove = b;
                        } else if (bHasWork && !aHasWork) {
                            keep = b; remove = a;
                        } else {
                            keep = new Date(a.created_at) > new Date(b.created_at) ? a : b;
                            remove = keep === a ? b : a;
                        }

                        dupsFound.push({
                            paciente: a.nombre_paciente,
                            cirugia: a.nombre_cirugia,
                            fecha_keep: keep.fecha_realizacion,
                            fecha_remove: remove.fecha_realizacion,
                            id_keep: keep.id,
                            id_remove: remove.id,
                        });
                        toDelete.push(remove.id);
                    }
                }
            }
        }

        console.log(`   ${dupsFound.length} duplicados encontrados`);

        const execute = req.query.execute === 'true';
        let deleted = 0;

        if (execute && toDelete.length > 0) {
            const BATCH = 50;
            for (let i = 0; i < toDelete.length; i += BATCH) {
                const batch = toDelete.slice(i, i + BATCH);
                const { error: delErr } = await supabase
                    .from('asociaciones_cirugias')
                    .delete()
                    .in('id', batch);
                if (delErr) console.error('   Error borrando batch:', delErr.message);
                else deleted += batch.length;
            }
            console.log(`   ${deleted} duplicados eliminados`);
        }

        res.json({
            success: true,
            duplicates_found: dupsFound.length,
            details: dupsFound,
            deleted: execute ? deleted : 0,
            message: execute
                ? `${deleted} duplicados eliminados`
                : `${dupsFound.length} duplicados encontrados. Agrega ?execute=true para eliminarlos.`,
        });
    } catch (err) {
        console.error('Error limpiando duplicados:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// â”€â”€ Servidor â”€â”€
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
â•”â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•—
â•‘  🏥 SALUS Sync Server — ADM-QUI                    â•‘
â•‘  Puerto: ${PORT}                                      â•‘
â•‘  SQL Server: 128.223.16.29:2450 (SALUS)            â•‘
â•‘  Supabase: ${supabaseUrl ? '–… Configurado' : 'âŒ FALTA'}                       â•‘
â•‘                                                    â•‘
â•‘  Endpoints:                                        â•‘
â•‘    GET /api/salus/sync-all    (todo de una vez)     â•‘
â•‘    GET /api/salus/sync/cirugias                     â•‘
â•‘    GET /api/salus/sync/presupuestos                 â•‘
â•‘    GET /api/salus/sync/deudas                       â•‘
â•‘    GET /api/salus/sync/asociaciones                     â•‘
â•‘    GET /api/salus/sync/laboratorios                     â•‘
â•‘    GET /api/salus/health                            â•‘
â•šâ•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
    `);
    getPool().catch(err => console.warn('âš ï¸ Conexión inicial fallida:', err.message));
});

process.on('SIGINT', async () => {
    console.log('\n🔒 Cerrando...');
    if (pool) await pool.close();
    process.exit(0);
});

