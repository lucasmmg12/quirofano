/**
 * Utilidad de normalización de teléfonos — Formato Argentina WhatsApp
 * 
 * Formato objetivo: 549XXXXXXXXXX (13 dígitos)
 * Ejemplo: 5492645438114
 * 
 * Reglas de transformación:
 *  1. Limpiar caracteres no numéricos (+, -, espacios, paréntesis)
 *  2. Si ya tiene 549 + 10 dígitos (13 total) → mantener
 *  3. Si tiene 54 + 10 dígitos (12 total) → agregar 9 después de 54
 *  4. Si tiene 10 dígitos (código de área + número) → agregar 549
 *  5. Si empieza con 15 + 7/8 dígitos → no tiene código de área, no se puede normalizar sin él
 *  6. Si empieza con 0 + 10 dígitos → quitar 0, agregar 549
 */

// Códigos de área conocidos de Argentina (los más comunes)
// Se usan para detectar si un número de 10 dígitos ya incluye cod. de área
const AREA_CODES_2_DIGITS = ['11']; // Buenos Aires
const AREA_CODES_3_DIGITS = [
    '220', '221', '223', '230', '236', '237', '249', '260', '261', '263',
    '264', '266', '280', '291', '294', '297', '298', '299',
    '336', '341', '342', '343', '345', '348', '351', '353', '358',
    '362', '364', '370', '376', '379', '380', '381', '383', '385', '387', '388',
    '478', '483',
    '800', '810'
];
const AREA_CODES_4_DIGITS = [
    '2202', '2221', '2223', '2224', '2225', '2226', '2227', '2229',
    '2241', '2242', '2243', '2244', '2245', '2246', '2252', '2254', '2255', '2257',
    '2261', '2262', '2264', '2265', '2266', '2267', '2268', '2271', '2272',
    '2281', '2283', '2284', '2285', '2286', '2291', '2292', '2296', '2297',
    '2302', '2314', '2316', '2317', '2320', '2323', '2324', '2325', '2326',
    '2331', '2333', '2334', '2335', '2336', '2337', '2338', '2342', '2343',
    '2344', '2345', '2346', '2352', '2353', '2354', '2355', '2356', '2357',
    '2358', '2392', '2393', '2394', '2395', '2396',
    '2473', '2474', '2475', '2477', '2478',
    '2622', '2624', '2625', '2626', '2646', '2647', '2648', '2651', '2655', '2656', '2657', '2658',
    '2901', '2902', '2903', '2920', '2921', '2922', '2923', '2924', '2925', '2926', '2927',
    '2929', '2931', '2932', '2933', '2934', '2935', '2936', '2940', '2942', '2944', '2945', '2946',
    '2948', '2952', '2953', '2954', '2962', '2963', '2964', '2966',
    '3327', '3329', '3382', '3385', '3387', '3388',
    '3400', '3401', '3402', '3404', '3405', '3406', '3407', '3408', '3409',
    '3435', '3436', '3437', '3438', '3442', '3444', '3445', '3446', '3447',
    '3454', '3455', '3456', '3458', '3460', '3462', '3463', '3464', '3465',
    '3466', '3467', '3468', '3469', '3471', '3472', '3476', '3482', '3483',
    '3487', '3489', '3491', '3492', '3493', '3496', '3497', '3498',
    '3521', '3522', '3524', '3525', '3532', '3533', '3537', '3541', '3542',
    '3543', '3544', '3546', '3547', '3548', '3549', '3562', '3563', '3564',
    '3571', '3572', '3573', '3574', '3575', '3576', '3583', '3584', '3585',
    '3711', '3715', '3716', '3718', '3721', '3725', '3731', '3734', '3735',
    '3741', '3743', '3751', '3754', '3755', '3756', '3757', '3758',
    '3772', '3773', '3774', '3775', '3777', '3781', '3782', '3786',
    '3821', '3825', '3826', '3827', '3832', '3835', '3837', '3838',
    '3841', '3843', '3844', '3845', '3846', '3854', '3855', '3856', '3857', '3858',
    '3861', '3862', '3863', '3865', '3867', '3868', '3869', '3873', '3876', '3877', '3878',
    '3885', '3886', '3887', '3888', '3891', '3892', '3894'
];

/**
 * Normaliza un teléfono al formato WhatsApp Argentina: 549XXXXXXXXXX
 * 
 * @param {string} raw - Teléfono en cualquier formato
 * @param {string} defaultAreaCode - Código de área por defecto (ej: '264' para San Juan)
 * @returns {{ normalized: string, original: string, valid: boolean, note: string }}
 */
export function normalizePhone(raw, defaultAreaCode = '') {
    const original = String(raw || '').trim();

    // Limpiar: solo dígitos
    let digits = original.replace(/\D/g, '');

    if (!digits || digits.length < 6) {
        return { normalized: '', original, valid: false, note: 'Número muy corto o vacío' };
    }

    // Caso 1: Ya es formato internacional completo con 549
    if (digits.startsWith('549') && digits.length === 13) {
        return { normalized: digits, original, valid: true, note: 'Ya normalizado' };
    }

    // Caso 2: Tiene 54 pero sin el 9 (formato fijo)
    if (digits.startsWith('54') && !digits.startsWith('549') && digits.length === 12) {
        const withNine = '549' + digits.slice(2);
        return { normalized: withNine, original, valid: true, note: 'Agregado 9 después de 54' };
    }

    // Caso 3: Empieza con 0 (formato nacional 0XX-XXXXXXX)
    if (digits.startsWith('0')) {
        digits = digits.slice(1); // quitar el 0
        // Ahora debería quedar con código de área + número (10 dígitos)
        if (digits.startsWith('15')) {
            // 015XXXXXXX → no tiene cod de área real, aplicar default
            digits = digits.slice(2); // quitar 15
            if (defaultAreaCode) {
                const full = '549' + defaultAreaCode + digits;
                if (full.length === 13) {
                    return { normalized: full, original, valid: true, note: `Reemplazado 015 con código de área ${defaultAreaCode}` };
                }
            }
            return { normalized: '', original, valid: false, note: 'Empieza con 015, se necesita código de área' };
        }
        // Quitar 15 interno si existe (ej: 0264-15-XXXXXXX)
        digits = removeInternalFifteen(digits);
        if (digits.length === 10) {
            return { normalized: '549' + digits, original, valid: true, note: 'Quitado 0 inicial, agregado 549' };
        }
    }

    // Caso 4: Empieza con 15 (número local sin código de área)
    if (digits.startsWith('15') && digits.length >= 8 && digits.length <= 10) {
        const localNumber = digits.slice(2); // quitar el 15
        if (defaultAreaCode) {
            const full = '549' + defaultAreaCode + localNumber;
            if (full.length === 13) {
                return { normalized: full, original, valid: true, note: `Reemplazado 15 con código de área ${defaultAreaCode}` };
            }
        }
        return {
            normalized: '',
            original,
            valid: false,
            note: 'Empieza con 15 sin código de área. Se requiere código de área para normalizar.'
        };
    }

    // Caso 5: 10 dígitos = código de área + número local (formato más común del Excel)
    if (digits.length === 10) {
        return { normalized: '549' + digits, original, valid: true, note: 'Agregado 549 (10 dígitos con código de área)' };
    }

    // Caso 6: 11 dígitos que incluyen 15 interno (ej: 26415XXXXXXX)
    if (digits.length === 11) {
        const cleaned = removeInternalFifteen(digits);
        if (cleaned.length === 10) {
            return { normalized: '549' + cleaned, original, valid: true, note: 'Quitado 15 interno, agregado 549' };
        }
    }

    // Caso 7: 13 dígitos pero no empieza con 549 → formato desconocido
    if (digits.length === 13 && digits.startsWith('549')) {
        return { normalized: digits, original, valid: true, note: 'Ya normalizado (13 dígitos)' };
    }

    // No se pudo normalizar
    return {
        normalized: digits.length >= 10 ? digits : '',
        original,
        valid: false,
        note: `Formato no reconocido (${digits.length} dígitos)`
    };
}

/**
 * Quita el 15 interno si está presente después del código de área
 * Ej: 264-15-438114 → 264-438114 → 2644438114 (10 dígitos)
 */
function removeInternalFifteen(digits) {
    // Probar con códigos de 2 dígitos
    for (const ac of AREA_CODES_2_DIGITS) {
        if (digits.startsWith(ac) && digits.substring(ac.length).startsWith('15')) {
            return ac + digits.substring(ac.length + 2);
        }
    }
    // Probar con códigos de 3 dígitos
    for (const ac of AREA_CODES_3_DIGITS) {
        if (digits.startsWith(ac) && digits.substring(ac.length).startsWith('15')) {
            return ac + digits.substring(ac.length + 2);
        }
    }
    // Probar con códigos de 4 dígitos
    for (const ac of AREA_CODES_4_DIGITS) {
        if (digits.startsWith(ac) && digits.substring(ac.length).startsWith('15')) {
            return ac + digits.substring(ac.length + 2);
        }
    }
    return digits;
}

/**
 * Detecta el código de área de un número de 10 dígitos
 * @param {string} digits - 10 dígitos puros
 * @returns {string} código de área detectado o ''
 */
export function detectAreaCode(digits) {
    for (const ac of AREA_CODES_4_DIGITS) {
        if (digits.startsWith(ac)) return ac;
    }
    for (const ac of AREA_CODES_3_DIGITS) {
        if (digits.startsWith(ac)) return ac;
    }
    for (const ac of AREA_CODES_2_DIGITS) {
        if (digits.startsWith(ac)) return ac;
    }
    return '';
}

/**
 * Procesa un array de registros y normaliza los teléfonos
 * Retorna los registros con teléfonos normalizados y un resumen
 * 
 * @param {Array} records - Array de objetos con campo telefono
 * @param {string} phoneField - Nombre del campo de teléfono
 * @param {string} defaultAreaCode - Código de área por defecto
 * @returns {{ records: Array, summary: { total, valid, invalid, details: Array } }}
 */
export function bulkNormalizePhones(records, phoneField = 'telefono1', defaultAreaCode = '') {
    const details = [];
    const processed = records.map((record, index) => {
        const rawPhone = record[phoneField] || '';
        const result = normalizePhone(rawPhone, defaultAreaCode);

        details.push({
            row: index + 1,
            nombre: record.nombre || record.Nombre || record.name || '',
            original: result.original,
            normalized: result.normalized,
            valid: result.valid,
            note: result.note,
        });

        return {
            ...record,
            _telefono_normalizado: result.normalized,
            _telefono_original: result.original,
            _telefono_valido: result.valid,
            _telefono_nota: result.note,
        };
    });

    return {
        records: processed,
        summary: {
            total: records.length,
            valid: details.filter(d => d.valid).length,
            invalid: details.filter(d => !d.valid).length,
            details,
        },
    };
}
