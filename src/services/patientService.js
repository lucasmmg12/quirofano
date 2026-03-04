/**
 * patientService.js — Búsqueda de pacientes en Supabase
 * 
 * Busca por nombre (ilike) o por DNI (exact match / starts with).
 * Devuelve máximo 10 resultados para el autocomplete.
 */
import { supabase } from '../lib/supabase';

/**
 * Busca pacientes por nombre o DNI.
 * Si el query es numérico, busca por DNI; sino busca por nombre.
 * @param {string} query — texto de búsqueda (mínimo 2 caracteres)
 * @returns {Promise<Array>}
 */
export async function searchPatients(query) {
    if (!query || query.trim().length < 2) return [];

    const trimmed = query.trim();
    const isNumeric = /^\d+$/.test(trimmed);

    let dbQuery;

    if (isNumeric) {
        // Búsqueda por DNI (starts with)
        dbQuery = supabase
            .from('pacientes')
            .select('id_paciente, nombre, dni, edad, sexo, email, centro')
            .ilike('dni', `${trimmed}%`)
            .order('nombre', { ascending: true })
            .limit(10);
    } else {
        // Búsqueda por nombre (ilike con %)
        // Split tokens for multi-word search
        const tokens = trimmed.split(/\s+/);
        dbQuery = supabase
            .from('pacientes')
            .select('id_paciente, nombre, dni, edad, sexo, email, centro')
            .order('nombre', { ascending: true })
            .limit(10);

        // Chain ilike for each token
        for (const token of tokens) {
            dbQuery = dbQuery.ilike('nombre', `%${token}%`);
        }
    }

    const { data, error } = await dbQuery;

    if (error) {
        console.error('Error buscando pacientes:', error);
        return [];
    }

    return data || [];
}

/**
 * Obtiene datos de múltiples pacientes por sus IDs (batch).
 * Usado para enriquecer las cirugías con datos del paciente (DNI, Edad, Centro).
 * @param {Array<string|number>} ids — Array de id_paciente
 * @returns {Promise<Object>} — Mapa { [id_paciente]: { dni, edad, sexo, email, centro, nombre } }
 */
export async function fetchPatientsByIds(ids) {
    if (!ids || ids.length === 0) return {};

    // Convertir a enteros (pacientes.id_paciente es INTEGER)
    const intIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (intIds.length === 0) return {};

    const BATCH = 200;
    const map = {};

    for (let i = 0; i < intIds.length; i += BATCH) {
        const batch = intIds.slice(i, i + BATCH);
        try {
            const { data, error } = await supabase
                .from('pacientes')
                .select('id_paciente, nombre, dni, edad, sexo, email, centro')
                .in('id_paciente', batch);

            if (error) {
                console.warn('[patientService] Error fetching batch:', error.message);
                continue;
            }
            if (data) {
                for (const p of data) {
                    map[String(p.id_paciente)] = p;
                }
            }
        } catch (err) {
            console.warn('[patientService] Non-fatal fetch error:', err.message);
        }
    }

    return map;
}
