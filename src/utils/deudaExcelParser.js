/**
 * deudaExcelParser.js — Parsea el Excel de deudas exportado de SALUS
 * Mapea las columnas del formato conocido a objetos planos para importación
 * Filtro: solo registros con Pendiente > $1
 */
import { read, utils } from 'xlsx';

// Mapeo de columnas por índice (formato con Concepto)
const COL_MAP = {
    0: 'fecha_albaran',      // Fecha albaran
    1: 'nombre',             // Paciente
    2: 'nhc',                // Paciente_NHC
    3: 'nif',                // Paciente_NIF
    4: 'tarifa',             // Tarifa
    5: 'concepto',           // Concepto (motivo del cargo)
    6: 'folio',              // Numero folio (clave de factura)
    7: 'cobrado_linea',      // Cobrado linea
    8: 'deuda_linea',        // Deuda linea (monto pendiente a sumar)
    9: 'nAdmision',          // Núm.Admisión
    10: 'habitacion',        // HOSP_Habitacion
    11: 'telefono_raw',      // telefono1_formateado
    12: 'email',             // email
};

export async function parseDeudaExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const rawData = utils.sheet_to_json(ws, { header: 1, defval: '' });

                if (rawData.length < 2) {
                    reject(new Error('El archivo está vacío o no tiene datos'));
                    return;
                }

                const dataRows = rawData.slice(1);
                let filasDescartadas = 0;

                // Agrupar filas por "Numero folio" (Factura), conservando líneas individuales
                const facturasMap = new Map();

                for (const row of dataRows) {
                    const r = {};
                    for (const [colIndex, fieldName] of Object.entries(COL_MAP)) {
                        let val = row[Number(colIndex)];
                        if (typeof val === 'string') val = val.trim();
                        r[fieldName] = val;
                    }

                    // Validar NHC
                    if (!r.nhc || !String(r.nhc).trim()) {
                        filasDescartadas++;
                        continue;
                    }

                    const folio = String(r.folio || '').trim();
                    if (!folio) {
                        filasDescartadas++;
                        continue;
                    }

                    const deudaLinea = parseFloat(r.deuda_linea) || 0;
                    const cobradoLinea = parseFloat(r.cobrado_linea) || 0;

                    // Cada línea individual se preserva
                    const lineItem = {
                        tarifa: String(r.tarifa || '').trim(),
                        concepto: String(r.concepto || '').trim(),
                        deuda: deudaLinea,
                        cobrado: cobradoLinea,
                        fecha_albaran: r.fecha_albaran || '',
                        habitacion: String(r.habitacion || '').trim(),
                        nAdmision: String(r.nAdmision || '').trim(),
                    };

                    if (!facturasMap.has(folio)) {
                        facturasMap.set(folio, {
                            ...r,
                            codigo: folio,
                            pendiente: deudaLinea,
                            cobrado: cobradoLinea,
                            total: deudaLinea + cobradoLinea,
                            lineas: [lineItem],
                        });
                    } else {
                        const existing = facturasMap.get(folio);
                        existing.pendiente += deudaLinea;
                        existing.cobrado += cobradoLinea;
                        existing.total += (deudaLinea + cobradoLinea);
                        existing.lineas.push(lineItem);
                    }
                }

                const registros = [];
                for (const factura of facturasMap.values()) {
                    // Limpiar y validar teléfono
                    let tel = String(factura.telefono_raw || '').replace(/\D/g, '');
                    
                    let telefono_es_valido = true;
                    if (tel && tel.length !== 13) {
                        telefono_es_valido = false;
                    } else if (tel && !tel.startsWith('549')) {
                        telefono_es_valido = false;
                    }
                    
                    factura.telefono = tel;
                    factura.telefono_invalido = !telefono_es_valido && tel !== '';

                    if (factura.pendiente > 1) {
                        registros.push(factura);
                    } else {
                        filasDescartadas++;
                    }
                }

                resolve({
                    registros,
                    totalFilas: dataRows.length,
                    filasConDeuda: registros.length,
                    filasDescartadas,
                });
            } catch (err) {
                reject(new Error('Error al leer el archivo Excel: ' + err.message));
            }
        };
        reader.onerror = () => reject(new Error('Error al leer el archivo'));
        reader.readAsArrayBuffer(file);
    });
}
