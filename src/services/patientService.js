/**
 * patientService.js — Búsqueda de pacientes en Supabase
 * 
 * Busca por nombre (ilike) o por DNI (exact match / starts with).
 * Devuelve máximo 10 resultados para el autocomplete.
 * 
 * NOTA: Usa la tabla "hospital_pacientes" (padrón maestro del hospital).
 * La tabla "pacientes" fue reutilizada por el módulo de enfermería con otro schema.
 */
import { supabase } from '../lib/supabase';

/** Nombre de la tabla del padrón hospitalario */
const PATIENTS_TABLE = 'hospital_pacientes';

/**
 * Busca pacientes por nombre o DNI.
 * Si el query es numérico, busca por DNI; sino busca por nombre.
 * @param {string} query — texto de búsqueda (mínimo 2 caracteres)
 * @returns {Promise<Array>}
 */
export async function searchPatients(query) {
    if (!query || query.trim().length < 2) return [];

    const trimmed = query.replace(/,/g, ' ').trim();
    const isNumeric = /^\d+$/.test(trimmed);

    let dbQuery;

    if (isNumeric) {
        // Búsqueda por DNI (starts with)
        dbQuery = supabase
            .from(PATIENTS_TABLE)
            .select('id_paciente, nombre, dni, edad, sexo, email, centro, telefono')
            .ilike('dni', `${trimmed}%`)
            .order('nombre', { ascending: true })
            .limit(10);
    } else {
        // Búsqueda por nombre (ilike con %)
        // Split tokens for multi-word search
        const tokens = trimmed.split(/\s+/);
        dbQuery = supabase
            .from(PATIENTS_TABLE)
            .select('id_paciente, nombre, dni, edad, sexo, email, centro, telefono')
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

    // Convertir a enteros (hospital_pacientes.id_paciente es INTEGER)
    const intIds = ids.map(id => parseInt(id, 10)).filter(id => !isNaN(id));
    if (intIds.length === 0) return {};

    const BATCH = 200;
    const map = {};

    for (let i = 0; i < intIds.length; i += BATCH) {
        const batch = intIds.slice(i, i + BATCH);
        try {
            const { data, error } = await supabase
                .from(PATIENTS_TABLE)
                .select('id_paciente, nombre, dni, edad, sexo, email, centro, notas')
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

/**
 * Normaliza y formatea el nombre del paciente en estilo Título (ej: "Lucas Marinero")
 */
export function formatPatientName(rawName, nombre1, nombre2) {
    const toTitle = (s) => (s || '').trim().toLowerCase().split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    
    if (nombre1 && nombre2) {
        return `${toTitle(nombre1)} ${toTitle(nombre2)}`.trim();
    }
    if (!rawName) return '';
    const clean = rawName.replace(/^[-–—\s]+/, '').trim();
    if (clean.includes(',')) {
        const parts = clean.split(',').map(s => s.trim());
        const apellido = parts[0] || '';
        const nombre = parts[1] || '';
        return `${toTitle(nombre)} ${toTitle(apellido)}`.trim();
    }
    return toTitle(clean);
}

/**
 * Devuelve el saludo según la franja horaria:
 * - 05:00 a 12:59 -> "Buen día"
 * - 13:00 a 19:59 -> "Buenas tardes"
 * - 20:00 a 04:59 -> "Buenas noches"
 */
export function getSaludoPorHora() {
    const hora = new Date().getHours();
    if (hora >= 5 && hora < 13) return 'Buen día';
    if (hora >= 13 && hora < 20) return 'Buenas tardes';
    return 'Buenas noches';
}

/**
 * Búsqueda en vivo de paciente por DNI para Kiosco/Tótem:
 * 1. Consulta Sync-Server SALUS en tiempo real (PR_FICHA_PACIENTE_QRY)
 * 2. Si no responde o no está, consulta Supabase (calidad_pacientes_diagnosticos, hospital_pacientes)
 */
export async function fetchPatientByDniLive(dni) {
    if (!dni) return null;
    const cleanDni = String(dni).replace(/\D/g, '').trim();
    if (cleanDni.length < 5) return null;

    // 1. Intento rápido vía Sync Server conectado a SALUS
    const SYNC_URL = import.meta.env.VITE_SALUS_SYNC_URL || 'http://127.0.0.1:3456/api/salus';
    try {
        const res = await fetch(`${SYNC_URL}/paciente/${cleanDni}`, { signal: AbortSignal.timeout(3500) });
        if (res.ok) {
            const json = await res.json();
            if (json.success && json.paciente) {
                const p = json.paciente;
                return {
                    found: true,
                    source: 'salus_live',
                    rawName: p.nombre,
                    displayName: formatPatientName(p.nombre, p.nombre1, p.nombre2),
                    dni: p.dni || cleanDni,
                    nhc: p.nhc,
                    mutua: p.mutua,
                    telefono: p.telefono
                };
            }
        }
    } catch (_) {
        // Fallback transparente a base de datos
    }

    // 2. Consulta en calidad_pacientes_diagnosticos (Supabase)
    try {
        const { data: diag } = await supabase
            .from('calidad_pacientes_diagnosticos')
            .select('paciente, dni, nhc')
            .eq('dni', cleanDni)
            .order('fecha_visita', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (diag?.paciente) {
            return {
                found: true,
                source: 'supabase_diagnosticos',
                rawName: diag.paciente,
                displayName: formatPatientName(diag.paciente),
                dni: diag.dni || cleanDni,
                nhc: diag.nhc,
            };
        }
    } catch (_) {}

    // 3. Consulta en hospital_pacientes (Supabase)
    try {
        const { data: hp } = await supabase
            .from(PATIENTS_TABLE)
            .select('nombre, dni, nhc, coseguro, telefono')
            .eq('dni', cleanDni)
            .limit(1)
            .maybeSingle();

        if (hp?.nombre) {
            return {
                found: true,
                source: 'supabase_hospital_pacientes',
                rawName: hp.nombre,
                displayName: formatPatientName(hp.nombre),
                dni: hp.dni || cleanDni,
                nhc: hp.nhc,
                mutua: hp.coseguro,
                telefono: hp.telefono
            };
        }
    } catch (_) {}

    return null;
}

