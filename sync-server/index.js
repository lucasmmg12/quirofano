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

// ── Supabase Client ──
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// ── SQL Server Config ──
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

// ── Pool de conexiones ──
let pool = null;
async function getPool() {
    if (!pool || !pool.connected) {
        console.log('🔌 Conectando a SQL Server SALUS...');
        pool = await sql.connect(SQL_CONFIG);
        console.log('✅ Conectado a SALUS');
    }
    return pool;
}

// ── Middleware ──
app.use(cors({ origin: '*', methods: ['GET', 'POST'] }));
app.use(express.json());

// ── Helpers ──
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

// ════════════════════════════════════════════════
// SYNC CIRUGÍAS — SQL Server → Supabase
// ════════════════════════════════════════════════
async function syncCirugias(db) {
    console.log('📋 [1/4] Extrayendo cirugías de SALUS...');
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

    // Filtrar registros con datos completos para upsert
    const validRecords = records.filter(r => r.id_paciente && r.nombre && r.fecha_cirugia);
    
    // Deduplicar (último gana)
    const deduped = new Map();
    for (const row of validRecords) {
        const key = `${row.id_paciente}|${row.nombre}|${row.fecha_cirugia}`;
        deduped.set(key, row);
    }

    const patientIds = [...new Set([...deduped.values()].map(r => r.id_paciente))];

    // ── PASO 1: Obtener estados existentes para preservarlos ──
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

    // ── PASO 2: Limpiar registros huérfanos con fechas incorrectas ──
    // Detectar registros en Supabase cuya fecha NO coincide con SALUS.
    // Estos son restos del bug de timezone (fecha -1 día) o reprogramaciones.
    // Se ELIMINAN directamente. El upsert posterior los recreará con la fecha correcta
    // y los estados se preservan via existingMap.
    if (patientIds.length > 0) {
        // Crear mapa de SALUS: id_paciente+nombre → fecha más reciente
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
                        // La fecha en Supabase no coincide con SALUS → eliminar el registro obsoleto
                        // El upsert posterior creará el registro con la fecha correcta
                        console.log(`   🗑️ Eliminando obsoleto: ${row.nombre} ${row.fecha_cirugia} (correcto: ${salusDate})`);
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
                            console.error(`   ❌ Error eliminando ${row.nombre}:`, delErr.message);
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
            console.error('   ❌ Batch error:', error.message);
            skipped += batch.length;
        } else if (data) {
            data.forEach(d => {
                d.created_at === d.updated_at ? inserted++ : updated++;
            });
        }
    }

    const summary = { total: result.recordset.length, inserted, updated, skipped };
    console.log(`   ✅ Cirugías: ${inserted} nuevos, ${updated} actualizados, ${skipped} errores`);
    return summary;
}

// ════════════════════════════════════════════════
// SYNC PRESUPUESTOS — SQL Server → Supabase
// ════════════════════════════════════════════════
async function syncPresupuestos(db) {
    console.log('💰 [2/4] Extrayendo presupuestos de SALUS...');
    const result = await db.request().query(`
        SELECT idPresupuesto, idPaciente, Paciente, fecha, Observaciones,
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
        else if (error) console.error('   ❌ Presupuesto header error:', error.message);
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
            else if (error) console.error('   ❌ Presupuesto items error:', error.message);
        }
    }

    const summary = { total: result.recordset.length, presupuestos: presupuestos.length, headers: insertedHeaders, items: insertedItems, skippedNoPatient };
    console.log(`   ✅ Presupuestos: ${insertedHeaders} cabeceras, ${insertedItems} ítems`);
    return summary;
}

// ════════════════════════════════════════════════
// SYNC DEUDAS — SQL Server → Supabase
// ════════════════════════════════════════════════
async function syncDeudas(db) {
    console.log('📊 [3/4] Extrayendo deudas de SALUS...');
    const result = await db.request().query(`
        SELECT TOP 1000
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
            V.email
        FROM [TABLEAU_Detalle de ventas Facturadas con Gastos y Honorarios] AS T
        LEFT JOIN VIS_Pacientes AS V ON T.Paciente_NHC = V.NHC
        WHERE T.Tarifa LIKE '042%'
          AND T.[Deuda linea] > 0
          AND T.[Numero folio] IS NOT NULL
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

            facturasMap.set(folio, {
                nombre: r.Paciente, nhc, folio, codigo: folio,
                telefono: tel, telefono_invalido: !telValido && tel !== '',
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
            porNhc[r.nhc] = { nombre: r.nombre, facturas: [], telefono: r.telefono, telefono_invalido: r.telefono_invalido };
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
                    nhc, nombre: grupo.nombre, deuda_total: deudaTotal,
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
    console.log(`   ✅ Deudas: ${pacientesNuevos} nuevos, ${pacientesActualizados} actualizados, ${filasImportadas} líneas`);
    return summary;
}

// ════════════════════════════════════════════════
// SYNC ALTAS ADMINISTRATIVAS — SQL Server → Supabase
// ════════════════════════════════════════════════
async function syncAltasAdministrativas(db) {
    console.log('📋 [4/4] Extrayendo altas administrativas de SALUS...');

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
                OBS.ValorM AS [Observaciones],
                ROW_NUMBER() OVER (PARTITION BY TA.[Paciente] ORDER BY TA.[Fecha ingreso] DESC, TA.[Número admisión] DESC) as rn
            FROM [SALUS].[dbo].[TABLEAU_Admisiones] TA
            LEFT JOIN [PR InstRespHospi] OBS 
                ON TA.idAdmision = OBS.idHospi 
                AND OBS.idPreguntaPr = 6175 
                AND OBS.activo = 1
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

        records.push({
            numero_admision: numAdmision,
            paciente: r.Paciente?.trim() || 'Sin nombre',
            cliente: r.Cliente?.trim() || null,
            especialidad: r.Especialidad?.trim() || null,
            proceso: r.Proceso?.trim() || null,
            doctor: r.Doctor?.trim() || null,
            motivo_alta: r['Motivo de alta']?.trim() || null,
            control_adm_finalizado: r['Control ADM finalizado']?.trim() || null,
            observaciones: r.Observaciones?.trim() || null,
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
    const FIELDS_TO_PRESERVE = ['estado', 'operador', 'notas_internas'];
    const existingMap = new Map();

    const admNums = uniqueRecords.map(r => r.numero_admision);
    const FETCH_BATCH = 200;
    for (let i = 0; i < admNums.length; i += FETCH_BATCH) {
        const batch = admNums.slice(i, i + FETCH_BATCH);
        const { data: existing } = await supabase
            .from('altas_administrativas')
            .select(`numero_admision, ${FIELDS_TO_PRESERVE.join(', ')}`)
            .in('numero_admision', batch);

        if (existing) {
            for (const row of existing) {
                const preserved = {};
                for (const f of FIELDS_TO_PRESERVE) {
                    if (row[f] != null) preserved[f] = row[f];
                }
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
            return preserved ? { ...row, ...preserved } : row;
        });

        const { data, error } = await supabase
            .from('altas_administrativas')
            .upsert(batch, { onConflict: 'numero_admision', ignoreDuplicates: false })
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
    console.log(`   ✅ Altas: ${inserted} nuevas, ${updated} actualizadas, ${skipped} errores`);
    return summary;
}

// ════════════════════════════════════════════════
// ENDPOINT PRINCIPAL: SYNC TODO
// ════════════════════════════════════════════════
let syncInProgress = false;

app.get('/api/salus/sync-all', async (req, res) => {
    if (syncInProgress) {
        return res.status(429).json({ success: false, error: 'Ya hay una sincronización en curso. Espere a que termine.' });
    }

    syncInProgress = true;
    const startTime = Date.now();
    console.log('\n🚀 ═══ SINCRONIZACIÓN COMPLETA INICIADA ═══');

    const results = {};

    try {
        const db = await getPool();

        try {
            results.cirugias = await syncCirugias(db);
        } catch (err) {
            console.error('❌ Error en cirugías:', err.message);
            results.cirugias = { error: err.message };
        }

        try {
            results.presupuestos = await syncPresupuestos(db);
        } catch (err) {
            console.error('❌ Error en presupuestos:', err.message);
            results.presupuestos = { error: err.message };
        }

        try {
            results.deudas = await syncDeudas(db);
        } catch (err) {
            console.error('❌ Error en deudas:', err.message);
            results.deudas = { error: err.message };
        }

        try {
            results.altas = await syncAltasAdministrativas(db);
        } catch (err) {
            console.error('❌ Error en altas administrativas:', err.message);
            results.altas = { error: err.message };
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`\n✅ ═══ SINCRONIZACIÓN COMPLETADA en ${elapsed}s ═══\n`);

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

    ✨ "¡Mmm... Deudas y Presupuestos frescos!" ✨
        `);

        res.json({
            success: true,
            elapsed: `${elapsed}s`,
            timestamp: new Date().toISOString(),
            results,
        });
    } catch (err) {
        console.error('❌ Error fatal:', err.message);
        res.status(500).json({ success: false, error: err.message });
    } finally {
        syncInProgress = false;
    }
});

// ── Endpoints individuales ──
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

// ── Health check ──
app.get('/api/salus/health', async (req, res) => {
    try {
        const db = await getPool();
        await db.request().query('SELECT 1 AS ok');
        res.json({ success: true, connected: true, server: '128.223.16.29:2450', supabase: supabaseUrl ? 'configured' : 'missing' });
    } catch (err) {
        res.json({ success: false, connected: false, error: err.message });
    }
});

// ── Servidor ──
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
╔════════════════════════════════════════════════════╗
║  🏥 SALUS Sync Server — ADM-QUI                    ║
║  Puerto: ${PORT}                                      ║
║  SQL Server: 128.223.16.29:2450 (SALUS)            ║
║  Supabase: ${supabaseUrl ? '✅ Configurado' : '❌ FALTA'}                       ║
║                                                    ║
║  Endpoints:                                        ║
║    GET /api/salus/sync-all    (todo de una vez)     ║
║    GET /api/salus/sync/cirugias                     ║
║    GET /api/salus/sync/presupuestos                 ║
║    GET /api/salus/sync/deudas                       ║
║    GET /api/salus/health                            ║
╚════════════════════════════════════════════════════╝
    `);
    getPool().catch(err => console.warn('⚠️ Conexión inicial fallida:', err.message));
});

process.on('SIGINT', async () => {
    console.log('\n🔒 Cerrando...');
    if (pool) await pool.close();
    process.exit(0);
});
