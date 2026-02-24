/**
 * Servicio de Presupuestos Quirúrgicos
 * 
 * Operaciones:
 *   - bulkUpsertBudgets   → Carga masiva desde Excel (headers + items)
 *   - fetchBudgetsByPatient → Lazy-load: obtener presupuestos de un paciente
 *   - fetchBudgetItems     → Obtener ítems de un presupuesto
 *   - clearAllBudgets      → Limpia todo para recarga completa
 * 
 * Diseño read-only: no hay edición individual, solo carga Excel
 */
import { supabase } from '../lib/supabase';


// =============================================
// CARGA MASIVA DESDE EXCEL
// =============================================

/**
 * Upsert masivo de presupuestos + ítems desde un Excel parseado
 * 
 * @param {Array} presupuestos - Array de presupuestos con _items anidados
 * @param {Function} [onProgress] - Callback de progreso: ({ step, total, detail })
 * @returns {{ inserted: number, updated: number, itemsInserted: number, errors: Array }}
 */
export async function bulkUpsertBudgets(presupuestos, onProgress = null) {
    const BATCH_SIZE = 50;    // Headers por lote
    const ITEM_BATCH = 100;   // Items por lote

    let inserted = 0;
    let updated = 0;
    let itemsInserted = 0;
    const errors = [];

    const totalSteps = Math.ceil(presupuestos.length / BATCH_SIZE);

    // ── PASO 1: Upsert de cabeceras ──
    for (let i = 0; i < presupuestos.length; i += BATCH_SIZE) {
        const batch = presupuestos.slice(i, i + BATCH_SIZE);
        const step = Math.floor(i / BATCH_SIZE) + 1;

        if (onProgress) {
            onProgress({ step, total: totalSteps, detail: `Presupuestos ${i + 1}-${Math.min(i + BATCH_SIZE, presupuestos.length)}...` });
        }

        // Preparar headers sin _items
        const headers = batch.map(p => ({
            id_presupuesto: p.id_presupuesto,
            id_paciente: p.id_paciente,
            paciente: p.paciente,
            fecha: p.fecha,
            observaciones: p.observaciones,
            aceptado: p.aceptado,
            fecha_caducidad: p.fecha_caducidad,
            presup_descripcion: p.presup_descripcion,
            total_items: p.total_items,
            importe_total: p.importe_total,
            importe_cobrado: p.importe_cobrado,
        }));

        try {
            const { data, error } = await supabase
                .from('presupuestos')
                .upsert(headers, {
                    onConflict: 'id_presupuesto',
                    ignoreDuplicates: false,
                })
                .select('id_presupuesto');

            if (error) {
                console.error('[BudgetService] Error upserting headers batch:', error);
                errors.push(`Lote ${step}: ${error.message}`);
            } else {
                const count = data?.length || batch.length;
                inserted += count;
            }
        } catch (err) {
            errors.push(`Lote ${step}: ${err.message}`);
        }
    }

    // ── PASO 2: Limpiar e insertar ítems ──
    // Para simplificar el upsert de ítems, limpiamos los existentes primero
    // ya que la constraint uq_presupuesto_item puede no cubrir todos los casos
    // cuando el Excel cambia líneas
    const allIdPresupuestos = presupuestos.map(p => p.id_presupuesto);

    if (onProgress) {
        onProgress({ step: totalSteps, total: totalSteps + 1, detail: 'Actualizando ítems...' });
    }

    // Borrar ítems anteriores de estos presupuestos
    try {
        // Borrar en lotes para no exceder límites de query
        for (let i = 0; i < allIdPresupuestos.length; i += 200) {
            const idBatch = allIdPresupuestos.slice(i, i + 200);
            const { error: delError } = await supabase
                .from('presupuesto_items')
                .delete()
                .in('id_presupuesto', idBatch);

            if (delError) {
                console.error('[BudgetService] Error deleting old items:', delError);
            }
        }
    } catch (err) {
        console.warn('[BudgetService] Non-fatal: error cleaning old items:', err.message);
    }

    // Insertar todos los ítems (usamos INSERT ya que limpiamos primero)
    const allItems = presupuestos.flatMap(p => p._items || []);

    // ── Deduplicar ítems por (id_presupuesto, id_articulo, linea) ──
    // El Excel puede tener filas duplicadas que causan error 21000 en PostgreSQL
    const dedupMap = new Map();
    for (const item of allItems) {
        const key = `${item.id_presupuesto}|${item.id_articulo}|${item.linea}`;
        dedupMap.set(key, item); // Último gana
    }
    const uniqueItems = [...dedupMap.values()];
    if (uniqueItems.length < allItems.length) {
        console.warn(`[BudgetService] Deduplicados ${allItems.length - uniqueItems.length} ítems duplicados`);
    }

    for (let i = 0; i < uniqueItems.length; i += ITEM_BATCH) {
        const batch = uniqueItems.slice(i, i + ITEM_BATCH);

        try {
            const { data, error } = await supabase
                .from('presupuesto_items')
                .insert(batch)
                .select('id');

            if (error) {
                console.error('[BudgetService] Error inserting items batch:', error);
                errors.push(`Ítems lote ${Math.floor(i / ITEM_BATCH) + 1}: ${error.message}`);
            } else {
                itemsInserted += data?.length || batch.length;
            }
        } catch (err) {
            errors.push(`Ítems: ${err.message}`);
        }
    }

    if (onProgress) {
        onProgress({ step: totalSteps + 1, total: totalSteps + 1, detail: '¡Completado!' });
    }

    console.log(`[BudgetService] Resultado: ${inserted} presupuestos, ${itemsInserted} ítems, ${errors.length} errores`);

    return { inserted, updated, itemsInserted, errors };
}


// =============================================
// CONSULTAS (LAZY LOAD)
// =============================================

/**
 * Obtiene los presupuestos de un paciente por su id_paciente
 * @param {string} idPaciente - ID del paciente del sistema fuente
 * @returns {Array} Lista de presupuestos (sin ítems)
 */
export async function fetchBudgetsByPatient(idPaciente) {
    if (!idPaciente) return [];

    const { data, error } = await supabase
        .from('presupuestos')
        .select('*')
        .eq('id_paciente', String(idPaciente))
        .order('fecha', { ascending: false });

    if (error) {
        console.error('[BudgetService] Error fetching budgets:', error);
        return [];
    }

    return data || [];
}


/**
 * Obtiene los ítems de un presupuesto específico
 * @param {number} idPresupuesto - ID del presupuesto del sistema fuente
 * @returns {Array} Lista de ítems
 */
export async function fetchBudgetItems(idPresupuesto) {
    if (!idPresupuesto) return [];

    const { data, error } = await supabase
        .from('presupuesto_items')
        .select('*')
        .eq('id_presupuesto', idPresupuesto)
        .order('linea', { ascending: true });

    if (error) {
        console.error('[BudgetService] Error fetching budget items:', error);
        return [];
    }

    return data || [];
}


/**
 * Obtiene estadísticas generales de presupuestos cargados
 */
export async function getBudgetStats() {
    const { data, error } = await supabase
        .from('presupuestos')
        .select('id_presupuesto, id_paciente, aceptado, importe_total');

    if (error) {
        console.error('[BudgetService] Error fetching stats:', error);
        return { total: 0, pacientes: 0, aceptados: 0, totalImporte: 0 };
    }

    const rows = data || [];
    const pacientesUnicos = new Set(rows.map(r => r.id_paciente));

    return {
        total: rows.length,
        pacientes: pacientesUnicos.size,
        aceptados: rows.filter(r => r.aceptado === 'si').length,
        totalImporte: rows.reduce((sum, r) => sum + (parseFloat(r.importe_total) || 0), 0),
    };
}
