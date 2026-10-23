/**
 * deudaService.js — Servicio de gestión de deudas
 * CRUD para pacientes deudores, facturas, seguimiento e importaciones
 */
import { supabase } from '../lib/supabase';
import { generarExcelCobranzas } from '../utils/deudaCobranzasExcelExporter';

// ─── Categorías de deudor ───
export const CATEGORIAS_DEUDOR = {
    sin_gestionar:         { label: 'Sin gestionar',             color: '#F59E0B', bg: '#FEF3C7', icon: '🟡' },
    en_gestion:            { label: 'En gestión',                color: '#3B82F6', bg: '#DBEAFE', icon: '🔵' },
    comprometido:          { label: 'Comprometido',              color: '#16A34A', bg: '#DCFCE7', icon: '🟢' },
    cuenta_corriente:      { label: 'Cuenta Corriente',          color: '#8B5CF6', bg: '#F3E8FF', icon: '🟣' },
    incobrable:            { label: 'Incobrable',                color: '#EF4444', bg: '#FEE2E2', icon: '🔴' },
    descuento_liquidacion: { label: 'Descuento por Liquidación', color: '#0D9488', bg: '#CCFBF1', icon: '🏷️' },
    deuda_cancelada:       { label: 'Deuda Cancelada',           color: '#6366F1', bg: '#E0E7FF', icon: '🚫' },
};

export const MIN_DEUDA = 50000;

// ─── Pacientes Deudores ───

export async function fetchDeudores(filters = {}) {
    const sortBy = filters.sortBy || 'deuda_total';
    const ascending = filters.sortDir === 'asc';
    let query = supabase
        .from('deudas_pacientes')
        .select('*')
        .gte('deuda_total', MIN_DEUDA)
        .order(sortBy, { ascending });

    if (filters.categoria) {
        query = query.eq('categoria', filters.categoria);
    }
    if (filters.search) {
        const safeSearch = filters.search.trim().replace(/[\s,]+/g, '%');
        query = query.or(`nombre.ilike.%${safeSearch}%,nhc.ilike.%${safeSearch}%,telefono.ilike.%${safeSearch}%`);
    }
    if (filters.conTelefono === true) {
        query = query.not('telefono', 'is', null);
    }
    if (filters.conTelefono === false) {
        query = query.is('telefono', null);
    }
    // Filtro por rango de fechas (campo dinámico: fecha_ultima_factura o deuda_cancelada_at)
    const dateField = (filters.dateField === 'deuda_cancelada_at') ? 'deuda_cancelada_at' : 'fecha_ultima_factura';
    if (filters.fechaDesde) {
        query = query.gte(dateField, filters.fechaDesde);
    }
    if (filters.fechaHasta) {
        query = query.lte(dateField, filters.fechaHasta);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

export async function fetchDeudorByNhc(nhc) {
    const { data, error } = await supabase
        .from('deudas_pacientes')
        .select('*')
        .eq('nhc', nhc)
        .maybeSingle();
    if (error) throw error;
    return data;
}

export async function fetchDeudorById(id) {
    const { data, error } = await supabase
        .from('deudas_pacientes')
        .select('*')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

export async function updateDeudor(id, updates) {
    const { error } = await supabase
        .from('deudas_pacientes')
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) throw error;
}

export async function updateDeudorTelefono(id, telefono) {
    return updateDeudor(id, { telefono });
}

export async function updateDeudorCategoria(id, categoria, usuario) {
    // ─── Protección: Deuda ya cancelada no se puede volver a cancelar ───
    if (categoria === 'deuda_cancelada') {
        const { data: current } = await supabase
            .from('deudas_pacientes')
            .select('categoria, deuda_cancelada_at')
            .eq('id', id)
            .single();
        if (current?.categoria === 'deuda_cancelada' && current?.deuda_cancelada_at) {
            throw new Error('Esta deuda ya fue cancelada previamente. No se puede volver a cancelar.');
        }
        // Registrar fecha y usuario de cancelación
        await updateDeudor(id, {
            categoria,
            deuda_cancelada_at: new Date().toISOString(),
            deuda_cancelada_por: usuario,
        });
    } else {
        await updateDeudor(id, { categoria });
    }
    // Registrar en seguimiento
    await addSeguimiento(id, {
        tipo: 'cambio_categoria',
        descripcion: categoria === 'deuda_cancelada'
            ? `✅ Deuda Cancelada — Pago efectivo registrado por ${usuario}. Ingreso generado al sanatorio.`
            : `Categoría cambiada a: ${CATEGORIAS_DEUDOR[categoria]?.label || categoria}`,
        usuario,
    });
}

// ─── Info de cancelación ───

export async function fetchDeudaCanceladaInfo(id) {
    const { data, error } = await supabase
        .from('deudas_pacientes')
        .select('deuda_cancelada_at, deuda_cancelada_por')
        .eq('id', id)
        .single();
    if (error) throw error;
    return data;
}

// ─── Facturas ───

export async function fetchFacturas(pacienteId) {
    const { data, error } = await supabase
        .from('deudas_facturas')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('pendiente', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── Cobros ───

export async function fetchCobros(pacienteId, nhc = null) {
    if (!pacienteId && !nhc) return [];
    let query = supabase.from('deudas_cobros').select('*');
    if (pacienteId && nhc) {
        query = query.or(`paciente_id.eq.${pacienteId},nhc.eq.${nhc}`);
    } else if (nhc) {
        query = query.eq('nhc', nhc);
    } else {
        query = query.eq('paciente_id', pacienteId);
    }
    const { data, error } = await query.order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function fetchCobrosPorNhc(nhc) {
    if (!nhc) return [];
    const { data, error } = await supabase
        .from('deudas_cobros')
        .select('*')
        .eq('nhc', nhc)
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── Notas de Crédito ───

export async function fetchNotasCredito(pacienteId, nhc = null) {
    if (!pacienteId && !nhc) return [];
    let query = supabase.from('deudas_notas_credito').select('*');
    if (pacienteId && nhc) {
        query = query.or(`paciente_id.eq.${pacienteId},nhc.eq.${nhc}`);
    } else if (nhc) {
        query = query.eq('nhc', nhc);
    } else {
        query = query.eq('paciente_id', pacienteId);
    }
    const { data, error } = await query.order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function fetchNotasCreditoPorNhc(nhc) {
    if (!nhc) return [];
    const { data, error } = await supabase
        .from('deudas_notas_credito')
        .select('*')
        .eq('nhc', nhc)
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── Presupuestos vinculados por NHC ───

export async function fetchPresupuestosPorNhc(nhc) {
    if (!nhc) return [];
    // presupuestos.nhc = NHC del paciente en VLISE_Presupuestos
    // deudas_pacientes.nhc = Paciente_NHC de TABLEAU_Detalle de ventas
    const { data, error } = await supabase
        .from('presupuestos')
        .select('id_presupuesto, paciente, fecha, observaciones, aceptado, presup_descripcion, importe_total, importe_cobrado, total_items')
        .eq('nhc', nhc)
        .order('fecha', { ascending: false });
    if (error) throw error;
    return data || [];
}

// ─── Seguimiento / Timeline ───

export async function fetchSeguimiento(pacienteId) {
    const { data: segData, error } = await supabase
        .from('deudas_seguimiento')
        .select('*')
        .eq('paciente_id', pacienteId);
    
    if (error) throw error;
    
    const historial = segData || [];

    // Buscar teléfono del paciente
    const { data: paciente } = await supabase
        .from('deudas_pacientes')
        .select('telefono')
        .eq('id', pacienteId)
        .single();
    
    if (paciente && paciente.telefono) {
        // Buscar mensajes de WhatsApp para este teléfono
        const { data: wspData } = await supabase
            .from('whatsapp_messages')
            .select('*')
            .eq('phone', paciente.telefono);
        
        if (wspData && wspData.length > 0) {
            for (const msg of wspData) {
                historial.push({
                    id: 'wsp_' + msg.id,
                    paciente_id: pacienteId,
                    tipo: 'whatsapp',
                    descripcion: msg.direction === 'outgoing' 
                        ? `[Msg Enviado]: ${msg.content || '(Multimedia)'}` 
                        : `[Respuesta]: ${msg.content || '(Multimedia)'}`,
                    usuario: msg.sender_name || (msg.direction === 'outgoing' ? 'Sistema / Bot' : 'Paciente'),
                    monto: null,
                    created_at: msg.created_at,
                    importante: msg.direction === 'incoming'
                });
            }
        }
    }

    // Ordenar de más nuevo a más viejo
    historial.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    
    return historial;
}

export async function addSeguimiento(pacienteId, { tipo, descripcion, monto, usuario }) {
    const { data, error } = await supabase
        .from('deudas_seguimiento')
        .insert({
            paciente_id: pacienteId,
            tipo,
            descripcion,
            monto: monto || null,
            usuario,
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ─── Tracking de WhatsApp (cruce con whatsapp_messages) ───

export async function fetchWhatsAppTracking(telefono) {
    if (!telefono) return { ultimoEnviado: null, ultimaRespuesta: null, totalEnviados: 0, totalRecibidos: 0 };

    // Último mensaje enviado al paciente
    const { data: outgoing } = await supabase
        .from('whatsapp_messages')
        .select('created_at, content, sender_name')
        .eq('phone', telefono)
        .eq('direction', 'outgoing')
        .order('created_at', { ascending: false })
        .limit(1);

    // Última respuesta del paciente
    const { data: incoming } = await supabase
        .from('whatsapp_messages')
        .select('created_at, content')
        .eq('phone', telefono)
        .eq('direction', 'incoming')
        .order('created_at', { ascending: false })
        .limit(1);

    // Totales
    const { count: totalEnviados } = await supabase
        .from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('phone', telefono)
        .eq('direction', 'outgoing');

    const { count: totalRecibidos } = await supabase
        .from('whatsapp_messages')
        .select('id', { count: 'exact', head: true })
        .eq('phone', telefono)
        .eq('direction', 'incoming');

    return {
        ultimoEnviado: outgoing?.[0] || null,
        ultimaRespuesta: incoming?.[0] || null,
        totalEnviados: totalEnviados || 0,
        totalRecibidos: totalRecibidos || 0,
    };
}

// ─── Importación de Excel ───

export async function importarDeudas(registros, usuario, onProgress) {
    let pacientesNuevos = 0;
    let pacientesActualizados = 0;
    let filasImportadas = 0;
    let filasIgnoradas = 0;

    // Agrupar facturas por NHC
    const porNhc = {};
    for (const r of registros) {
        const pendiente = Number(r.pendiente) || 0;
        if (pendiente <= 1) {
            filasIgnoradas++;
            continue;
        }
        if (!r.nhc || !String(r.nhc).trim()) {
            filasIgnoradas++;
            continue;
        }
        const nhc = String(r.nhc).trim();
        if (!porNhc[nhc]) {
            porNhc[nhc] = { nombre: r.nombre, dni: r.nif || null, facturas: [], telefono: r.telefono, telefono_invalido: r.telefono_invalido };
        } else {
            if (!porNhc[nhc].telefono && r.telefono) {
                porNhc[nhc].telefono = r.telefono;
                porNhc[nhc].telefono_invalido = r.telefono_invalido;
            }
            if (!porNhc[nhc].dni && r.nif) {
                porNhc[nhc].dni = r.nif;
            }
        }
        porNhc[nhc].facturas.push(r);
    }

    // Procesar cada paciente
    const nhcEntries = Object.entries(porNhc);
    const totalPacientes = nhcEntries.length;
    let pacienteIdx = 0;

    for (const [nhc, grupo] of nhcEntries) {
        pacienteIdx++;
        if (onProgress) onProgress({ current: pacienteIdx, total: totalPacientes, nombre: grupo.nombre });
        const deudaTotal = grupo.facturas.reduce((s, f) => s + (Number(f.pendiente) || 0), 0);

        // Calcular fecha más reciente de las facturas
        let fechaMasReciente = null;
        for (const f of grupo.facturas) {
            const lineas = f.lineas || [];
            for (const l of lineas) {
                if (l.fecha_albaran) {
                    const d = new Date(l.fecha_albaran);
                    if (!isNaN(d.getTime()) && (!fechaMasReciente || d > fechaMasReciente)) {
                        fechaMasReciente = d;
                    }
                }
            }
            // Fallback al campo directo
            if (f.fecha_albaran && !fechaMasReciente) {
                const d = new Date(f.fecha_albaran);
                if (!isNaN(d.getTime())) fechaMasReciente = d;
            }
        }

        // Upsert paciente
        const { data: existente } = await supabase
            .from('deudas_pacientes')
            .select('id, dni, telefono, categoria, notas')
            .eq('nhc', nhc)
            .maybeSingle();

        let pacienteId;
        if (existente) {
            // Actualizar montos
            const updateData = {
                nombre: grupo.nombre,
                deuda_total: deudaTotal,
                cantidad_facturas: grupo.facturas.length,
                fecha_ultima_factura: fechaMasReciente ? fechaMasReciente.toISOString() : null,
                updated_at: new Date().toISOString(),
            };

            let reactivado = false;
            // Reactivar paciente si estaba cancelado o sin deuda y ahora trae deuda nueva
            if (existente.categoria === 'deuda_cancelada' && deudaTotal > 0) {
                updateData.categoria = 'sin_gestionar';
                updateData.deuda_cancelada_at = null;
                updateData.deuda_cancelada_por = null;
                reactivado = true;
            }
            
            // Solo insertamos el tel del Excel si el paciente NO tenía uno válido antes
            // o si el excel trae uno pero en la BD no había ninguno.
            // Asi respetamos lo que el usuario edite manualmente.
            if (!existente.telefono && grupo.telefono) {
                updateData.telefono = grupo.telefono;
                updateData.telefono_invalido = grupo.telefono_invalido;
            }

            // Also update DNI if it is not present in database but is present in Excel group
            if (!existente.dni && grupo.dni) {
                updateData.dni = grupo.dni;
            }

            await supabase
                .from('deudas_pacientes')
                .update(updateData)
                .eq('id', existente.id);
            pacienteId = existente.id;
            pacientesActualizados++;

            if (reactivado) {
                await supabase
                    .from('deudas_seguimiento')
                    .insert({
                        paciente_id: existente.id,
                        usuario: 'Sistema',
                        descripcion: '⚠️ Paciente reingresa a gestión por nueva deuda pendiente.',
                        tipo: 'cambio_categoria',
                    });
            }
        } else {
            const { data: nuevo } = await supabase
                .from('deudas_pacientes')
                .insert({
                    nhc,
                    nombre: grupo.nombre,
                    dni: grupo.dni || null,
                    deuda_total: deudaTotal,
                    cantidad_facturas: grupo.facturas.length,
                    telefono: grupo.telefono || null,
                    telefono_invalido: grupo.telefono_invalido || false,
                    fecha_ultima_factura: fechaMasReciente ? fechaMasReciente.toISOString() : null,
                })
                .select('id')
                .single();
            pacienteId = nuevo.id;
            pacientesNuevos++;
        }

        // Upsert líneas individuales de cada factura
        for (const f of grupo.facturas) {
            const lineas = f.lineas || [{ tarifa: f.tarifa || '', concepto: f.concepto || '', deuda: Number(f.pendiente) || 0, cobrado: Number(f.cobrado) || 0, fecha_albaran: f.fecha_albaran || '', habitacion: f.habitacion || '', nAdmision: f.nAdmision || '' }];
            
            for (let i = 0; i < lineas.length; i++) {
                const linea = lineas[i];
                const codigoUnico = lineas.length > 1 ? `${String(f.codigo)}::${i}` : String(f.codigo);
                
                const { error } = await supabase
                    .from('deudas_facturas')
                    .upsert({
                        paciente_id: pacienteId,
                        codigo: codigoUnico,
                        documento: String(f.folio || f.codigo || ''),
                        folio: String(f.folio || f.codigo || ''),
                        total: (linea.deuda || 0) + (linea.cobrado || 0),
                        cobrado: linea.cobrado || 0,
                        pendiente: linea.deuda || 0,
                        servicio: linea.tarifa || null,
                        responsable: linea.concepto || null,
                        n_admision: String(linea.nAdmision || f.nAdmision || '').trim() || null,
                        fecha_hospitalizacion: linea.fecha_albaran || null,
                        tipo_hospitalizacion: String(linea.habitacion || '').trim() || null,
                        updated_at: new Date().toISOString(),
                    }, { onConflict: 'codigo' });

                if (!error) filasImportadas++;
                else filasIgnoradas++;
            }
        }
    }

    // ─── CONCILIACIÓN: Pacientes que ya no tienen deuda en Salus ───
    const { data: activosDb } = await supabase
        .from('deudas_pacientes')
        .select('id, nhc, categoria')
        .neq('categoria', 'deuda_cancelada');
    
    let pacientesConciliados = 0;
    
    if (activosDb) {
        const nhcsEnExcel = new Set(Object.keys(porNhc));
        
        for (const pDb of activosDb) {
            if (!nhcsEnExcel.has(pDb.nhc)) {
                // No está en el Excel → ya no tiene deuda en SALUS → borrar
                await supabase
                    .from('deudas_pacientes')
                    .delete()
                    .eq('id', pDb.id);
                
                pacientesConciliados++;
            }
        }
    }

    // Registrar importación
    const { data: importacion } = await supabase
        .from('deudas_importaciones')
        .insert({
            archivo_nombre: 'Excel de deudas',
            total_filas: registros.length,
            filas_importadas: filasImportadas,
            filas_ignoradas: filasIgnoradas,
            pacientes_nuevos: pacientesNuevos,
            pacientes_actualizados: pacientesActualizados,
            usuario,
        })
        .select()
        .single();

    return {
        importacion,
        pacientesNuevos,
        pacientesActualizados,
        filasImportadas,
        filasIgnoradas,
        pacientesConciliados,
    };
}

// ─── Métricas / Dashboard ───

export async function fetchMetricasDeudas(filtros = {}) {
    let query = supabase
        .from('deudas_pacientes')
        .select('id, nombre, nhc, deuda_total, categoria, telefono, telefono_invalido, ultimo_contacto_at, ultima_respuesta_at, cantidad_facturas, deuda_cancelada_at')
        .gte('deuda_total', MIN_DEUDA)
        .order('deuda_total', { ascending: false });

    // Filtro por rango de fechas (campo dinámico)
    const dateField = (filtros.dateField === 'deuda_cancelada_at') ? 'deuda_cancelada_at' : 'fecha_ultima_factura';
    if (filtros.fechaDesde) {
        query = query.gte(dateField, filtros.fechaDesde);
    }
    if (filtros.fechaHasta) {
        query = query.lte(dateField, filtros.fechaHasta);
    }

    const { data: pacientes } = await query;

    const all = pacientes || [];
    const total = all.length;

    // Categorías que descuentan de la deuda activa
    const CATEGORIAS_DESCUENTO = ['descuento_liquidacion', 'deuda_cancelada'];

    const deudaBruta = all.reduce((s, p) => s + Number(p.deuda_total), 0);
    const deudaDescontada = all
        .filter(p => CATEGORIAS_DESCUENTO.includes(p.categoria))
        .reduce((s, p) => s + Number(p.deuda_total), 0);
    const deudaTotal = deudaBruta - deudaDescontada;
    const deudoresActivos = all.filter(p => !CATEGORIAS_DESCUENTO.includes(p.categoria)).length;

    const conTelefono = all.filter(p => p.telefono).length;
    const sinTelefono = total - conTelefono;

    const porCategoria = {};
    Object.keys(CATEGORIAS_DEUDOR).forEach(k => { porCategoria[k] = { count: 0, monto: 0 }; });
    all.forEach(p => {
        if (porCategoria[p.categoria]) {
            porCategoria[p.categoria].count++;
            porCategoria[p.categoria].monto += Number(p.deuda_total);
        }
    });

    const top10 = all.filter(p => !CATEGORIAS_DESCUENTO.includes(p.categoria)).slice(0, 10);

    // ─── Deudas Canceladas (ingreso generado) ───
    const canceladas = all.filter(p => p.categoria === 'deuda_cancelada');
    const totalCanceladas = canceladas.length;
    const montoCancelado = canceladas.reduce((s, p) => s + Number(p.deuda_total), 0);

    // ─── Contactados y Respondieron: cruzar con whatsapp_messages ───
    // Obtener teléfonos únicos de deudores que tienen teléfono
    const telefonosDeudores = [...new Set(all.filter(p => p.telefono).map(p => p.telefono))];

    let contactados = 0;
    let respondieron = 0;

    if (telefonosDeudores.length > 0) {
        // Buscar teléfonos que tienen al menos 1 mensaje outgoing (contactados)
        const { data: outPhones } = await supabase
            .from('whatsapp_messages')
            .select('phone')
            .in('phone', telefonosDeudores)
            .eq('direction', 'outgoing')
            .limit(5000);

        const phonesContactados = new Set((outPhones || []).map(m => m.phone));
        contactados = phonesContactados.size;

        // Buscar teléfonos que tienen al menos 1 mensaje incoming (respondieron)
        const { data: inPhones } = await supabase
            .from('whatsapp_messages')
            .select('phone')
            .in('phone', telefonosDeudores)
            .eq('direction', 'incoming')
            .limit(5000);

        const phonesRespondieron = new Set((inPhones || []).map(m => m.phone));
        respondieron = phonesRespondieron.size;
    }

    const sinContactar = total - contactados;

    // Derivados
    const promedioPorPaciente = deudoresActivos > 0 ? deudaTotal / deudoresActivos : 0;
    const tasaContactabilidad = conTelefono > 0 ? Math.round((contactados / conTelefono) * 100) : 0;
    const tasaRespuesta = contactados > 0 ? Math.round((respondieron / contactados) * 100) : 0;
    const tasaRecuperacion = total > 0 ? Math.round((totalCanceladas / total) * 100) : 0;

    return {
        total,
        deudaTotal,
        deudaBruta,
        deudaDescontada,
        deudoresActivos,
        conTelefono,
        sinTelefono,
        porCategoria,
        top10,
        contactados,
        sinContactar,
        respondieron,
        promedioPorPaciente,
        tasaContactabilidad,
        tasaRespuesta,
        // Canceladas — Ingreso efectivo
        totalCanceladas,
        montoCancelado,
        tasaRecuperacion,
    };
}

/**
 * Obtener deudas canceladas (pagos efectivos) en un período.
 * IMPORTANTE: Filtra por `deuda_cancelada_at` (fecha del pago real),
 * NO por `fecha_ultima_factura` (fecha de la deuda original).
 * Una deuda de abril pagada en junio aparece en el reporte de junio.
 */
export async function fetchDeudasCanceladasEnPeriodo(filtros = {}) {
    let query = supabase
        .from('deudas_pacientes')
        .select('id, nombre, nhc, deuda_total, deuda_cancelada_at, deuda_cancelada_por, fecha_ultima_factura, obra_social, updated_at')
        .eq('categoria', 'deuda_cancelada')
        .order('updated_at', { ascending: false });

    // Filtrar por período de CANCELACIÓN — usa deuda_cancelada_at por defecto,
    // pero si el usuario eligió updated_at como campo de filtro, usar ese.
    const cancelField = 'deuda_cancelada_at';
    if (filtros.fechaDesde) {
        query = query.gte(cancelField, filtros.fechaDesde);
    }
    if (filtros.fechaHasta) {
        query = query.lte(cancelField, filtros.fechaHasta);
    }

    const { data, error } = await query;
    if (error) throw error;

    const canceladas = data || [];
    const totalMonto = canceladas.reduce((s, p) => s + Number(p.deuda_total), 0);

    return {
        canceladas,
        totalCanceladas: canceladas.length,
        montoTotalIngresado: totalMonto,
    };
}

// ─── Altas vinculadas por N° Admisión ───

export async function fetchAltasPorAdmisiones(admisiones) {
    if (!admisiones?.length) return [];
    const cleaned = admisiones.filter(a => a && String(a).trim()).map(a => String(a).trim());
    if (!cleaned.length) return [];
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('numero_admision, paciente, fecha_ingreso, fecha_alta, estado, operador, cliente, control_adm_finalizado, responsable_override')
        .in('numero_admision', cleaned)
        .order('fecha_ingreso', { ascending: false });
    if (error) throw error;
    return data || [];
}

/**
 * Obtener el responsable (override o auto) para una lista de nombres de paciente.
 * Devuelve un mapa: { nombre_normalizado: { responsable, isOverride } }
 * Se cruza por nombre de paciente ya que altas_administrativas no tiene campo nhc.
 */
export async function fetchResponsablesPorNombres(nombres) {
    if (!nombres?.length) return {};
    const cleaned = [...new Set(nombres.filter(Boolean).map(n => String(n).trim()))];
    if (!cleaned.length) return {};

    // Fetch altas más recientes por nombre de paciente
    const { data, error } = await supabase
        .from('altas_administrativas')
        .select('paciente, operador, responsable_override')
        .in('paciente', cleaned)
        .order('fecha_ingreso', { ascending: false });

    if (error) {
        console.warn('Error fetching responsables por nombre:', error.message);
        return {};
    }

    // Usar la más reciente por paciente
    const map = {};
    for (const row of (data || [])) {
        if (!row.paciente || map[row.paciente]) continue;
        const resp = row.responsable_override || row.operador || null;
        if (resp) {
            map[row.paciente] = {
                responsable: resp,
                isOverride: !!row.responsable_override,
            };
        }
    }
    return map;
}

// ─── Planes de Pago ───

export async function fetchPlanesPago(pacienteId) {
    const { data, error } = await supabase
        .from('deudas_planes_pago')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    const plans = data || [];
    for (const plan of plans) {
        const { data: cuotas } = await supabase
            .from('deudas_cuotas')
            .select('*')
            .eq('plan_id', plan.id)
            .order('numero_cuota', { ascending: true });
        plan.cuotas = cuotas || [];
    }
    return plans;
}

export async function createPlanPago(pacienteId, { montoOriginal, tipoInteres, tasaInteres, cantidadCuotas, fechaInicio, notas, usuario }) {
    let montoCuota, montoTotalFinanciado;
    if (tipoInteres === 'fijo') {
        montoCuota = (montoOriginal / cantidadCuotas) + Number(tasaInteres);
        montoTotalFinanciado = montoCuota * cantidadCuotas;
    } else {
        const r = Number(tasaInteres) / 100;
        if (r > 0) {
            montoCuota = montoOriginal * (r * Math.pow(1 + r, cantidadCuotas)) / (Math.pow(1 + r, cantidadCuotas) - 1);
        } else {
            montoCuota = montoOriginal / cantidadCuotas;
        }
        montoTotalFinanciado = montoCuota * cantidadCuotas;
    }
    montoCuota = Math.round(montoCuota * 100) / 100;
    montoTotalFinanciado = Math.round(montoTotalFinanciado * 100) / 100;

    const { data: plan, error: planError } = await supabase
        .from('deudas_planes_pago')
        .insert({
            paciente_id: pacienteId,
            monto_original: montoOriginal,
            tipo_interes: tipoInteres,
            tasa_interes: tasaInteres,
            cantidad_cuotas: cantidadCuotas,
            monto_cuota: montoCuota,
            monto_total_financiado: montoTotalFinanciado,
            notas, usuario,
        })
        .select().single();
    if (planError) throw planError;

    const inicio = new Date(fechaInicio || new Date());
    const cuotas = [];
    for (let i = 0; i < cantidadCuotas; i++) {
        const venc = new Date(inicio);
        venc.setMonth(venc.getMonth() + i + 1);
        cuotas.push({
            plan_id: plan.id,
            numero_cuota: i + 1,
            monto: montoCuota,
            fecha_vencimiento: venc.toISOString().split('T')[0],
        });
    }
    const { error: cuotasError } = await supabase.from('deudas_cuotas').insert(cuotas);
    if (cuotasError) throw cuotasError;
    return plan;
}

export async function marcarCuotaPagada(cuotaId, { fechaPago, comprobante, usuario }) {
    // 1. Obtener info de la cuota y plan para el registro de seguimiento
    const { data: cuota } = await supabase
        .from('deudas_cuotas')
        .select('*, plan:deudas_planes_pago(paciente_id, cantidad_cuotas)')
        .eq('id', cuotaId)
        .single();

    // 2. Marcar cuota como pagada
    const { error } = await supabase
        .from('deudas_cuotas')
        .update({ pagada: true, fecha_pago: fechaPago || new Date().toISOString().split('T')[0], comprobante: comprobante || null })
        .eq('id', cuotaId);
    if (error) throw error;

    // 3. Registrar en seguimiento si tenemos paciente_id
    if (cuota?.plan?.paciente_id) {
        const desc = `Pago cuota ${cuota.numero_cuota}/${cuota.plan.cantidad_cuotas} del plan de pago.${comprobante ? ' Comprobante: ' + comprobante : ''}`;
        await addSeguimiento(cuota.plan.paciente_id, {
            tipo: 'pago',
            descripcion: desc,
            monto: cuota.monto,
            usuario: usuario || 'Sistema',
        });
    }
}

export async function cancelarPlan(planId) {
    const { error } = await supabase
        .from('deudas_planes_pago')
        .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', planId);
    if (error) throw error;
}

// ─── Certificados de Libre Deuda ───
export async function fetchCertificadosLibreDeuda(search = '') {
    let q = supabase
        .from('libre_de_deuda_certificados')
        .select('*')
        .order('created_at', { ascending: false });

    const searchStr = search != null ? String(search).trim() : '';
    if (searchStr) {
        q = q.or(`paciente_nombre.ilike.%${searchStr}%,paciente_dni.ilike.%${searchStr}%,codigo.ilike.%${searchStr}%,nhc.ilike.%${searchStr}%`);
    }

    const { data, error } = await q;
    if (error) {
        console.error('[deudaService] fetchCertificadosLibreDeuda error:', error);
        throw error;
    }
    return data || [];
}

export async function createCertificadoLibreDeuda(certData) {
    const year = new Date().getFullYear();
    const { count } = await supabase
        .from('libre_de_deuda_certificados')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', `${year}-01-01T00:00:00.000Z`);

    const seq = (count || 0) + 1;
    const codigo = `LDD-${year}-${String(seq).padStart(4, '0')}`;

    const isUUID = (id) => typeof id === 'string' && /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(id);

    const record = {
        codigo,
        paciente_nombre: certData.pacienteNombre,
        paciente_dni: certData.pacienteDni || null,
        n_internacion: certData.nInternacion || null,
        garante_nombre: certData.garanteNombre || null,
        asesor_nombre: certData.asesorNombre || 'Asesor Administrativo',
        fecha_texto: certData.fechaTexto || null,
        fecha_emision: certData.fechaEmision || new Date().toISOString(),
        nhc: certData.nhc || certData.nInternacion || null,
        id_paciente: isUUID(certData.idPaciente) ? certData.idPaciente : null,
        observaciones: certData.observaciones || null,
    };

    const { data, error } = await supabase
        .from('libre_de_deuda_certificados')
        .insert(record)
        .select()
        .single();

    if (error) {
        console.error('[deudaService] createCertificadoLibreDeuda error:', error);
        throw error;
    }

    if (certData.pacienteDeudasId || certData.nhc) {
        try {
            let pId = certData.pacienteDeudasId;
            if (!pId && certData.nhc) {
                const { data: p } = await supabase
                    .from('deudas_pacientes')
                    .select('id')
                    .eq('nhc', certData.nhc)
                    .maybeSingle();
                if (p) pId = p.id;
            }
            if (pId) {
                await addSeguimiento(pId, {
                    tipo: 'cambio_categoria',
                    descripcion: `📜 Emitido Certificado de Libre Deuda N° ${codigo}. Asesor: ${certData.asesorNombre || 'Administración'}`,
                    usuario: certData.asesorNombre || 'Sistema',
                });
            }
        } catch (e) {
            console.warn('Could not attach seguimiento note:', e);
        }
    }

    return data;
}

/**
 * Métricas analíticas completas para el dashboard de deudas:
 * 1. Métricas agregadas de Deuda Gestionada, Deuda Cobrada, Deuda Activa, Tasa de Recupero.
 * 2. Evolución mensual: Deuda Cobrada vs Deuda Gestionada mes a mes.
 * 3. Evolución temporal de la Deuda Total mes a mes.
 * 4. Ranking de pacientes con mayor deuda (Top Deudores).
 */
/**
 * Resuelve las fechas de inicio y fin para los presets temporales de métricas
 */
export function getRangoFechasPreset(preset = 'todos', fechaDesde = null, fechaHasta = null) {
    const now = new Date();
    const curYear = now.getFullYear();
    const curMonth = now.getMonth() + 1; // 1-12
    const monthNamesEs = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    if (preset === 'este_mes') {
        const mStr = String(curMonth).padStart(2, '0');
        const lastDay = new Date(curYear, curMonth, 0).getDate();
        return {
            preset: 'este_mes',
            fechaDesde: `${curYear}-${mStr}-01`,
            fechaHasta: `${curYear}-${mStr}-${String(lastDay).padStart(2, '0')}`,
            label: `Este Mes (${monthNamesEs[curMonth - 1]} ${curYear})`
        };
    }

    if (preset === 'mes_anterior') {
        const prevDate = new Date(curYear, curMonth - 2, 1);
        const prevYear = prevDate.getFullYear();
        const prevMonth = prevDate.getMonth() + 1;
        const mStr = String(prevMonth).padStart(2, '0');
        const lastDay = new Date(prevYear, prevMonth, 0).getDate();
        return {
            preset: 'mes_anterior',
            fechaDesde: `${prevYear}-${mStr}-01`,
            fechaHasta: `${prevYear}-${mStr}-${String(lastDay).padStart(2, '0')}`,
            label: `Mes Anterior (${monthNamesEs[prevMonth - 1]} ${prevYear})`
        };
    }

    if (preset === 'personalizado') {
        return {
            preset: 'personalizado',
            fechaDesde: fechaDesde || `${curYear}-01-01`,
            fechaHasta: fechaHasta || `${curYear}-12-31`,
            label: fechaDesde && fechaHasta
                ? `Personalizado (${fechaDesde} al ${fechaHasta})`
                : 'Período Personalizado'
        };
    }

    return {
        preset: 'todos',
        fechaDesde: null,
        fechaHasta: null,
        label: 'Todo el Histórico'
    };
}

export async function fetchMetricasAvanzadasDeudas(filtros = {}) {
    const { preset = 'todos', fechaDesde = null, fechaHasta = null } = filtros;
    const rango = getRangoFechasPreset(preset, fechaDesde, fechaHasta);
    const { fechaDesde: effDesde, fechaHasta: effHasta } = rango;

    // 1. Obtener todos los pacientes de deudas (sin descartar cancelados con saldo 0)
    let queryPacientes = supabase
        .from('deudas_pacientes')
        .select('*')
        .order('deuda_total', { ascending: false });

    // 2. Obtener todos los seguimientos (acciones de gestión y notas)
    let querySeguimiento = supabase
        .from('deudas_seguimiento')
        .select('*')
        .order('created_at', { ascending: true });

    // 3. Obtener cuotas pagadas
    let queryCuotas = supabase
        .from('deudas_cuotas')
        .select('*')
        .eq('pagada', true);

    const [pacientesRes, segRes, cuotasRes] = await Promise.all([
        queryPacientes,
        querySeguimiento,
        queryCuotas
    ]);

    const pacientes = pacientesRes.data || [];
    const seguimientos = segRes.data || [];
    const cuotas = cuotasRes.data || [];

    // 4. Obtener cobros de caja SALUS (deudas_cobros) para los pacientes de la cartera
    const nhcs = [...new Set(pacientes.map(p => p.nhc).filter(Boolean))];
    let cobros = [];
    if (nhcs.length > 0) {
        const { data: cobrosData } = await supabase
            .from('deudas_cobros')
            .select('nhc, importe, fecha, forma_pago, descripcion')
            .in('nhc', nhcs)
            .order('fecha', { ascending: true });
        cobros = cobrosData || [];
    }

    // Helper nombre meses en español
    const monthNames = {
        '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
        '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
        '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic'
    };
    const formatMonthLabel = (ym) => {
        if (!ym || !ym.includes('-')) return ym;
        const [y, m] = ym.split('-');
        return `${monthNames[m] || m} '${y.slice(2)}`;
    };

    // Tracking de primera gestión por paciente
    const patientFirstGestion = {};
    const patientHasGestionInRange = new Set();
    const patientHasPaymentInRange = new Set();

    seguimientos.forEach(s => {
        const sDate = s.created_at ? s.created_at.substring(0, 10) : '';
        const ym = s.created_at ? s.created_at.substring(0, 7) : '';

        if (!patientFirstGestion[s.paciente_id]) {
            patientFirstGestion[s.paciente_id] = ym;
        }

        // Chequear si el seguimiento cae dentro del período filtrado
        if (effDesde && effHasta) {
            if (sDate >= effDesde && sDate <= effHasta) {
                patientHasGestionInRange.add(s.paciente_id);
                if (s.tipo === 'pago' && s.monto > 0) {
                    patientHasPaymentInRange.add(s.paciente_id);
                }
            }
        } else {
            patientHasGestionInRange.add(s.paciente_id);
            if (s.tipo === 'pago' && s.monto > 0) {
                patientHasPaymentInRange.add(s.paciente_id);
            }
        }
    });

    // Identificar pacientes gestionados
    const pacientesGestionadosList = pacientes.filter(p => {
        if (effDesde && effHasta) {
            if (patientHasGestionInRange.has(p.id)) return true;
            if (p.ultimo_contacto_at) {
                const cDate = p.ultimo_contacto_at.substring(0, 10);
                if (cDate >= effDesde && cDate <= effHasta) return true;
            }
            if (p.categoria === 'deuda_cancelada' && p.deuda_cancelada_at) {
                const cancDate = p.deuda_cancelada_at.substring(0, 10);
                if (cancDate >= effDesde && cancDate <= effHasta) return true;
            }
            return false;
        }

        return (
            p.categoria !== 'sin_gestionar' || 
            p.ultimo_contacto_at || 
            patientFirstGestion[p.id]
        );
    });

    const totalDeudaGestionada = pacientesGestionadosList.reduce((acc, p) => {
        const cap = Number(p.deuda_total) > 0 ? Number(p.deuda_total) : Number(p.total_cobros || 0);
        return acc + cap;
    }, 0);
    const totalPacientes = pacientes.length;
    const countGestionados = pacientesGestionadosList.length;
    const porcentajeGestionado = totalPacientes > 0 ? Math.round((countGestionados / totalPacientes) * 100) : 0;

    // ─── Calcular cobros por mes (Caja Real SALUS + Cancelaciones) ───
    const cobradoPorMes = {};
    let totalDeudaCobrada = 0;
    let montoDeudasCanceladas = 0;
    let countDeudasCanceladas = 0;
    let montoCobrosCuotasYSeg = 0;

    // A) Sumar los cobros reales registrados en caja SALUS (deudas_cobros)
    cobros.forEach(c => {
        const cDate = c.fecha ? c.fecha.substring(0, 10) : '';
        const ym = cDate ? cDate.substring(0, 7) : '';
        const monto = Number(c.importe) || 0;

        if (monto > 0 && ym) {
            cobradoPorMes[ym] = (cobradoPorMes[ym] || 0) + monto;

            if (effDesde && effHasta) {
                if (cDate >= effDesde && cDate <= effHasta) {
                    totalDeudaCobrada += monto;
                    montoCobrosCuotasYSeg += monto;
                }
            } else {
                totalDeudaCobrada += monto;
                montoCobrosCuotasYSeg += monto;
            }
        }
    });

    // B) Pacientes cancelados (si no tienen cobros en deudas_cobros)
    const nhcsConCobros = new Set(cobros.map(c => c.nhc));
    pacientes.forEach(p => {
        if (p.categoria === 'deuda_cancelada' && p.deuda_cancelada_at) {
            const cancDate = p.deuda_cancelada_at.substring(0, 10);
            const ym = cancDate.substring(0, 7);
            const monto = Number(p.total_cobros) > 0 ? Number(p.total_cobros) : Number(p.deuda_total);

            // Si el paciente no tenía movimientos en deudas_cobros, computamos su monto cancelado
            if (!nhcsConCobros.has(p.nhc) && monto > 0 && ym) {
                cobradoPorMes[ym] = (cobradoPorMes[ym] || 0) + monto;
                if (effDesde && effHasta) {
                    if (cancDate >= effDesde && cancDate <= effHasta) {
                        totalDeudaCobrada += monto;
                        montoDeudasCanceladas += monto;
                        countDeudasCanceladas++;
                    }
                } else {
                    totalDeudaCobrada += monto;
                    montoDeudasCanceladas += monto;
                    countDeudasCanceladas++;
                }
            } else if (effDesde && effHasta && cancDate >= effDesde && cancDate <= effHasta) {
                montoDeudasCanceladas += monto;
                countDeudasCanceladas++;
            } else if (!effDesde && !effHasta) {
                montoDeudasCanceladas += monto;
                countDeudasCanceladas++;
            }
        }
    });

    // Totales históricos acumulados
    const totalHistoricoCanceladasMonto = pacientes
        .filter(p => p.categoria === 'deuda_cancelada')
        .reduce((s, p) => s + (Number(p.total_cobros) || Number(p.deuda_total) || 0), 0);
    const totalHistoricoCanceladasCount = pacientes.filter(p => p.categoria === 'deuda_cancelada').length;
    const totalHistoricoCobrado = Object.values(cobradoPorMes).reduce((a, b) => a + b, 0);

    // Calcular deuda gestionada/abordada por mes (Criterio Cosecha)
    const gestionadoPorMes = {};
    const pacientesPorMesGestion = {};

    seguimientos.forEach(s => {
        const ym = s.created_at ? s.created_at.substring(0, 7) : '';
        if (ym) {
            if (!pacientesPorMesGestion[ym]) pacientesPorMesGestion[ym] = new Set();
            pacientesPorMesGestion[ym].add(s.paciente_id);
        }
    });

    pacientes.forEach(p => {
        if (p.ultimo_contacto_at) {
            const ym = p.ultimo_contacto_at.substring(0, 7);
            if (ym) {
                if (!pacientesPorMesGestion[ym]) pacientesPorMesGestion[ym] = new Set();
                pacientesPorMesGestion[ym].add(p.id);
            }
        }
        if (p.categoria === 'deuda_cancelada' && p.deuda_cancelada_at) {
            const ym = p.deuda_cancelada_at.substring(0, 7);
            if (ym) {
                if (!pacientesPorMesGestion[ym]) pacientesPorMesGestion[ym] = new Set();
                pacientesPorMesGestion[ym].add(p.id);
            }
        }
    });

    Object.entries(pacientesPorMesGestion).forEach(([ym, pacSet]) => {
        const pacList = pacientes.filter(p => pacSet.has(p.id));
        // Capital gestionado: si se canceló al 100%, rescatamos el capital de total_cobros
        const sum = pacList.reduce((s, p) => {
            const cap = Number(p.deuda_total) > 0 ? Number(p.deuda_total) : Number(p.total_cobros || 0);
            return s + cap;
        }, 0);
        gestionadoPorMes[ym] = sum;
    });

    // ─── Análisis de Exigibilidad: Regla de 30 días post-alta ───
    let totalDeudaExigible = 0;
    let totalDeudaEnGracia = 0;
    let countPacientesExigibles = 0;
    let countPacientesEnGracia = 0;

    try {
        const { data: facturasActivas = [] } = await supabase
            .from('deudas_facturas')
            .select('paciente_id, n_admision, pendiente')
            .gt('pendiente', 0);

        const distinctAdms = [...new Set(facturasActivas.map(f => f.n_admision).filter(Boolean))];
        let allAltas = [];
        if (distinctAdms.length > 0) {
            for (let i = 0; i < distinctAdms.length; i += 100) {
                const chunk = distinctAdms.slice(i, i + 100);
                const { data: chunkAltas } = await supabase
                    .from('altas_administrativas')
                    .select('numero_admision, fecha_alta, fecha_ingreso')
                    .in('numero_admision', chunk);
                if (chunkAltas) allAltas.push(...chunkAltas);
            }
        }
        const altasMap = new Map();
        allAltas.forEach(a => altasMap.set(a.numero_admision, a));

        const today = new Date();
        const pacExigibilidad = {};
        facturasActivas.forEach(f => {
            if (!pacExigibilidad[f.paciente_id]) {
                pacExigibilidad[f.paciente_id] = { exigible: 0, enGracia: 0 };
            }
            const alta = altasMap.get(f.n_admision);
            const monto = Number(f.pendiente) || 0;
            if (alta && alta.fecha_alta) {
                const fAlta = new Date(alta.fecha_alta + 'T12:00:00');
                const diffDays = Math.floor((today - fAlta) / (1000 * 60 * 60 * 24));
                if (diffDays >= 30) {
                    pacExigibilidad[f.paciente_id].exigible += monto;
                } else {
                    pacExigibilidad[f.paciente_id].enGracia += monto;
                }
            } else {
                pacExigibilidad[f.paciente_id].enGracia += monto;
            }
        });

        Object.values(pacExigibilidad).forEach(pe => {
            totalDeudaExigible += pe.exigible;
            totalDeudaEnGracia += pe.enGracia;
            if (pe.exigible > 0) countPacientesExigibles++;
            if (pe.enGracia > 0 && pe.exigible === 0) countPacientesEnGracia++;
        });
    } catch (errExig) {
        console.warn('Error calculando exigibilidad 30d:', errExig);
    }

    // Calcular deuda originada / incorporada por mes (para evolución de stock)
    const deudaPorMes = {};
    pacientes.forEach(p => {
        let ym = '2026-07';
        if (p.fecha_ultima_factura) {
            const fm = p.fecha_ultima_factura.substring(0, 7);
            if (fm) ym = fm;
        }
        deudaPorMes[ym] = (deudaPorMes[ym] || 0) + Number(p.deuda_total);
    });

    // Definir el rango de meses cronológicos relevantes
    const allMonthsSet = new Set([
        ...Object.keys(cobradoPorMes),
        ...Object.keys(gestionadoPorMes),
        ...Object.keys(deudaPorMes).filter(m => m >= '2026-05')
    ]);
    ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10'].forEach(m => allMonthsSet.add(m));

    const sortedMonths = Array.from(allMonthsSet).sort().filter(m => m >= '2026-05' && m <= '2026-12');

    // Determinamos qué meses están dentro del período filtrado para resaltarlos o enfocarlos
    const targetYmStart = effDesde ? effDesde.substring(0, 7) : null;
    const targetYmEnd = effHasta ? effHasta.substring(0, 7) : null;

    // 1. Datos para Gráfico de Barras: Deuda Cobrada vs Deuda Gestionada mes a mes
    const barrasMesAMes = sortedMonths.map(ym => {
        const inPeriod = targetYmStart && targetYmEnd 
            ? (ym >= targetYmStart && ym <= targetYmEnd)
            : true;

        return {
            rawMes: ym,
            mes: formatMonthLabel(ym),
            deudaGestionada: Math.round(gestionadoPorMes[ym] || 0),
            deudaCobrada: Math.round(cobradoPorMes[ym] || 0),
            inPeriod
        };
    });

    // Métricas globales y categorías de descuento (definidas antes del cálculo de stock)
    const CATEGORIAS_DESCUENTO = ['descuento_liquidacion', 'deuda_cancelada'];
    const deudaBruta = pacientes.reduce((s, p) => s + Number(p.deuda_total), 0);
    const deudaDescontada = pacientes
        .filter(p => CATEGORIAS_DESCUENTO.includes(p.categoria))
        .reduce((s, p) => s + Number(p.deuda_total), 0);
    const totalDeudaActiva = deudaBruta - deudaDescontada;
    const deudoresActivos = pacientes.filter(p => !CATEGORIAS_DESCUENTO.includes(p.categoria)).length;

    // 2. Datos para Gráfico de Líneas: Evolución de la Deuda Total (Stock de Pasivo Vivo al cierre de cada mes)
    const stockPorMes = {};
    const curYm = new Date().toISOString().substring(0, 7);
    const pastOrCurrentMonths = sortedMonths.filter(m => m <= curYm);
    const anchorMonth = pastOrCurrentMonths.length > 0 
        ? pastOrCurrentMonths[pastOrCurrentMonths.length - 1] 
        : sortedMonths[sortedMonths.length - 1];

    stockPorMes[anchorMonth] = Math.round(deudaBruta);

    const anchorIdx = sortedMonths.indexOf(anchorMonth);
    for (let i = anchorIdx; i > 0; i--) {
        const curM = sortedMonths[i];
        const prevM = sortedMonths[i - 1];
        const originada = deudaPorMes[curM] || 0;
        const cobrada = cobradoPorMes[curM] || 0;
        const prevStock = stockPorMes[curM] - originada + cobrada;
        stockPorMes[prevM] = Math.max(0, Math.round(prevStock));
    }

    for (let i = anchorIdx + 1; i < sortedMonths.length; i++) {
        stockPorMes[sortedMonths[i]] = Math.round(deudaBruta);
    }

    const evolucionDeudaTotal = sortedMonths.map(ym => {
        const originada = deudaPorMes[ym] || 0;
        const cobrada = cobradoPorMes[ym] || 0;
        const stockMes = stockPorMes[ym] ?? Math.round(deudaBruta);
        const inPeriod = targetYmStart && targetYmEnd 
            ? (ym >= targetYmStart && ym <= targetYmEnd)
            : true;

        return {
            rawMes: ym,
            mes: formatMonthLabel(ym),
            deudaTotal: stockMes,
            cobradaMes: Math.round(cobrada),
            incorporadaMes: Math.round(originada),
            inPeriod
        };
    });

    // 3. Datos para Gráfico de Barras: Top Pacientes con Mayor Deuda
    const topDeudores = pacientes
        .filter(p => !CATEGORIAS_DESCUENTO.includes(p.categoria))
        .slice(0, 12)
        .map((p, index) => ({
            id: p.id,
            ranking: index + 1,
            nombre: p.nombre,
            nombreCorto: p.nombre.length > 22 ? p.nombre.slice(0, 20) + '…' : p.nombre,
            nhc: p.nhc,
            deuda: Number(p.deuda_total),
            categoria: p.categoria,
            obraSocial: p.obra_social || 'Particular / S.D.',
            telefono: p.telefono,
            gestionadoEnPeriodo: patientHasGestionInRange.has(p.id) || (effDesde && effHasta ? false : true),
        }));

    const tasaRecuperacionGestionada = totalDeudaGestionada > 0 
        ? Math.round((totalDeudaCobrada / totalDeudaGestionada) * 100) 
        : 0;

    return {
        periodo: rango,
        totalPacientes,
        countGestionados,
        porcentajeGestionado,
        totalDeudaGestionada,
        totalDeudaCobrada,
        montoDeudasCanceladas,
        countDeudasCanceladas,
        montoCobrosCuotasYSeg,
        totalDeudaActiva,
        deudoresActivos,
        tasaRecuperacionGestionada,
        totalHistoricoCobrado,
        totalHistoricoCanceladasMonto,
        totalHistoricoCanceladasCount,
        totalDeudaExigible,
        totalDeudaEnGracia,
        countPacientesExigibles,
        countPacientesEnGracia,
        barrasMesAMes,
        evolucionDeudaTotal,
        topDeudores,
    };
}

/**
 * Genera y descarga el Excel oficial de Auditoría de Cobranzas del Sanatorio Argentino
 * Incluye pacientes cobrados, planes vigentes, deuda restante, gestores y movimientos de caja
 */
export async function descargarInformeCobranzasExcel(filtros = {}) {
    const { preset = 'este_mes', fechaDesde = null, fechaHasta = null } = filtros;
    const rango = getRangoFechasPreset(preset, fechaDesde, fechaHasta);
    const { fechaDesde: effDesde, fechaHasta: effHasta, label: periodoLabel } = rango;

    // 1. Obtener todos los pacientes
    const { data: pacientes = [] } = await supabase
        .from('deudas_pacientes')
        .select('*');

    const pacientesMap = {};
    pacientes.forEach(p => { pacientesMap[p.id] = p; });

    // 2. Obtener todos los seguimientos
    const { data: seguimientos = [] } = await supabase
        .from('deudas_seguimiento')
        .select('*')
        .order('created_at', { ascending: true });

    // 3. Obtener todos los planes de pago y sus cuotas
    const { data: planes = [] } = await supabase
        .from('deudas_planes_pago')
        .select('*, cuotas:deudas_cuotas(*)');

    const planesPorPaciente = {};
    planes.forEach(pl => {
        if (!planesPorPaciente[pl.paciente_id]) planesPorPaciente[pl.paciente_id] = [];
        planesPorPaciente[pl.paciente_id].push(pl);
    });

    // 4. Identificar pagos y armar cobros por paciente
    const movimientosCaja = [];
    const cobrosPorPaciente = {}; // pacId -> { totalPeriodo, totalHistorico, ultimoCobroFecha, ultimoComprobante, ultimoOperador }

    seguimientos.forEach(s => {
        if (s.tipo === 'pago' && s.monto > 0) {
            const pac = pacientesMap[s.paciente_id];
            const pacNombre = pac ? pac.nombre : 'Paciente Desconocido';
            const pacNhc = pac ? (pac.nhc || 'S/D') : 'S/D';
            const sDate = s.created_at ? s.created_at.substring(0, 10) : '';
            const sDateTime = s.created_at ? s.created_at.replace('T', ' ').substring(0, 16) : '';
            const monto = Number(s.monto);

            if (!cobrosPorPaciente[s.paciente_id]) {
                cobrosPorPaciente[s.paciente_id] = {
                    totalPeriodo: 0,
                    totalHistorico: 0,
                    ultimoCobroFecha: sDate,
                    ultimoComprobante: s.descripcion || '',
                    ultimoOperador: s.usuario || '',
                };
            }
            cobrosPorPaciente[s.paciente_id].totalHistorico += monto;

            const inRange = effDesde && effHasta 
                ? (sDate >= effDesde && sDate <= effHasta)
                : true;

            if (inRange) {
                cobrosPorPaciente[s.paciente_id].totalPeriodo += monto;
                cobrosPorPaciente[s.paciente_id].ultimoCobroFecha = sDate;
                if (s.usuario) cobrosPorPaciente[s.paciente_id].ultimoOperador = s.usuario;
                if (s.descripcion) cobrosPorPaciente[s.paciente_id].ultimoComprobante = s.descripcion;

                movimientosCaja.push({
                    fecha: sDateTime,
                    paciente: pacNombre,
                    nhc: pacNhc,
                    monto,
                    concepto: 'Cuota / Pago a cuenta',
                    medio: s.descripcion?.includes('[') ? s.descripcion.split('[')[1]?.split(']')[0] : 'Transferencia / Efectivo',
                    comprobante: s.descripcion?.includes('Ref:') ? s.descripcion.split('Ref:')[1]?.split('—')[0]?.trim() : (s.descripcion || '-'),
                    usuario: s.usuario || 'Sistema',
                    detalle: s.descripcion || ''
                });
            }
        }
    });

    // Sumar pacientes con deuda_cancelada que no tengan pago duplicado en seguimiento
    const pacIdsConPagoSeg = new Set(
        seguimientos.filter(s => s.tipo === 'pago' && s.monto > 0).map(s => s.paciente_id)
    );

    pacientes.forEach(p => {
        if (p.categoria === 'deuda_cancelada' && p.deuda_cancelada_at) {
            const cancDate = p.deuda_cancelada_at.substring(0, 10);
            const cancDateTime = p.deuda_cancelada_at.replace('T', ' ').substring(0, 16);
            const montoCanc = Number(p.total_cobros) > 0 ? Number(p.total_cobros) : Number(p.deuda_total);

            if (!cobrosPorPaciente[p.id]) {
                cobrosPorPaciente[p.id] = {
                    totalPeriodo: 0,
                    totalHistorico: 0,
                    ultimoCobroFecha: cancDate,
                    ultimoComprobante: 'Cancelación 100% Deuda',
                    ultimoOperador: p.deuda_cancelada_por || 'Administración',
                };
            }

            if (!pacIdsConPagoSeg.has(p.id)) {
                cobrosPorPaciente[p.id].totalHistorico += montoCanc;

                const inRange = effDesde && effHasta
                    ? (cancDate >= effDesde && cancDate <= effHasta)
                    : true;

                if (inRange) {
                    cobrosPorPaciente[p.id].totalPeriodo += montoCanc;
                    cobrosPorPaciente[p.id].ultimoCobroFecha = cancDate;
                    if (p.deuda_cancelada_por) cobrosPorPaciente[p.id].ultimoOperador = p.deuda_cancelada_por;

                    movimientosCaja.push({
                        fecha: cancDateTime,
                        paciente: p.nombre,
                        nhc: p.nhc || 'S/D',
                        monto: montoCanc,
                        concepto: 'Cancelación Total (100%)',
                        medio: 'Liquidación / Pago Total',
                        comprobante: 'Cancelación Definitiva',
                        usuario: p.deuda_cancelada_por || 'Administración',
                        detalle: `Cancelación al 100% de la cuenta por $${montoCanc}`
                    });
                }
            }
        }
    });

    // Tracking de primera fecha de gestión por paciente
    const patientFirstGestion = {};
    seguimientos.forEach(s => {
        if (!patientFirstGestion[s.paciente_id]) {
            patientFirstGestion[s.paciente_id] = s.created_at ? s.created_at.substring(0, 10) : '';
        }
    });

    // Armar lista consolidada de Pacientes Cobrados
    const pacientesCobradosList = [];

    Object.entries(cobrosPorPaciente).forEach(([pacId, cobroInfo]) => {
        if (cobroInfo.totalPeriodo <= 0) return; // Solo incluir los que tuvieron cobro en este período

        const p = pacientesMap[pacId];
        if (!p) return;

        // Evaluar planes de pago
        const pacPlanes = planesPorPaciente[pacId] || [];
        const planActivo = pacPlanes.find(pl => pl.estado === 'activo') || pacPlanes[0] || null;

        let tienePlan = false;
        let detallePlan = 'Sin plan activo';
        let saldoPlan = 0;

        if (planActivo) {
            tienePlan = planActivo.estado === 'activo';
            const cuotasTotales = planActivo.cuotas || [];
            const cuotasPagadas = cuotasTotales.filter(c => c.pagada).length;
            const cuotasPendientes = cuotasTotales.length - cuotasPagadas;
            saldoPlan = cuotasTotales.filter(c => !c.pagada).reduce((s, c) => s + Number(c.monto || 0), 0);
            detallePlan = `Plan ${planActivo.estado.toUpperCase()}: ${cuotasTotales.length} cuotas ($${Math.round(planActivo.monto_cuota || 0)}) · ${cuotasPagadas} pagadas / ${cuotasPendientes} pendientes`;
        }

        // Tipo de cobro
        let tipoCobro = 'Cuota / Pago parcial';
        if (p.categoria === 'deuda_cancelada') {
            tipoCobro = 'Cancelación 100% (Deuda Saldada)';
        } else if (tienePlan) {
            tipoCobro = 'Cuotas de Plan Vigente';
        }

        // Deuda vigente
        const deudaVigente = p.categoria === 'deuda_cancelada' ? 0 : Number(p.deuda_total);

        pacientesCobradosList.push({
            id: p.id,
            nombre: p.nombre,
            nhc: p.nhc,
            telefono: p.telefono,
            obraSocial: p.obra_social,
            cobradoPeriodo: cobroInfo.totalPeriodo,
            cobradoHistorico: cobroInfo.totalHistorico,
            tipoCobro,
            categoria: p.categoria,
            categoriaLabel: CATEGORIAS_DEUDOR[p.categoria]?.label || p.categoria,
            deudaOriginal: Number(p.deuda_total) + cobroInfo.totalHistorico,
            deudaVigente,
            tienePlan,
            detallePlan,
            saldoPlan,
            gestionadoPor: cobroInfo.ultimoOperador || p.deuda_cancelada_por || 'Sistema',
            fechaCobro: cobroInfo.ultimoCobroFecha,
            fechaInicioGestion: patientFirstGestion[p.id] || (p.ultimo_contacto_at ? p.ultimo_contacto_at.substring(0, 10) : '-'),
            observaciones: cobroInfo.ultimoComprobante
        });
    });

    // Ordenar de mayor a menor monto cobrado en el período
    pacientesCobradosList.sort((a, b) => b.cobradoPeriodo - a.cobradoPeriodo);
    movimientosCaja.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));

    // Resumen
    const totalCobradoPeriodo = pacientesCobradosList.reduce((s, p) => s + p.cobradoPeriodo, 0);
    const montoCanceladas = pacientesCobradosList
        .filter(p => p.categoria === 'deuda_cancelada')
        .reduce((s, p) => s + p.cobradoPeriodo, 0);
    const cantCanceladas = pacientesCobradosList.filter(p => p.categoria === 'deuda_cancelada').length;
    const montoCuotas = totalCobradoPeriodo - montoCanceladas;
    const cantConPlan = pacientesCobradosList.filter(p => p.tienePlan).length;
    const saldoDeudaPendiente = pacientesCobradosList.reduce((s, p) => s + p.deudaVigente, 0);

    // Totales históricos
    const totalHistoricoCobrado = Object.values(cobrosPorPaciente).reduce((s, c) => s + c.totalHistorico, 0);
    const totalHistoricoCanceladasMonto = pacientes
        .filter(p => p.categoria === 'deuda_cancelada')
        .reduce((s, p) => s + Number(p.deuda_total || 0), 0);
    const totalHistoricoCanceladasCount = pacientes.filter(p => p.categoria === 'deuda_cancelada').length;

    const resumen = {
        totalCobradoPeriodo,
        montoCanceladas,
        cantCanceladas,
        montoCuotas,
        cantConPlan,
        saldoDeudaPendiente,
        totalHistoricoCobrado,
        totalHistoricoCanceladasMonto,
        totalHistoricoCanceladasCount
    };

    return await generarExcelCobranzas({
        periodoLabel,
        pacientesCobrados: pacientesCobradosList,
        movimientosCaja,
        resumen
    });
}


