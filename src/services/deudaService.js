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
                ? `Personalizado (${formatFechaDDMMYYYY(fechaDesde)} al ${formatFechaDDMMYYYY(fechaHasta)})`
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

/**
 * Formatea una fecha YYYY-MM-DD o ISO a DD/MM/YYYY (estándar institucional Sanatorio Argentino)
 */
export function formatFechaDDMMYYYY(raw) {
    if (!raw || raw === '-') return '-';
    const s = String(raw).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return s;
    const datePart = s.substring(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [y, m, d] = datePart.split('-');
        return `${d}/${m}/${y}`;
    }
    return s;
}

/**
 * Formatea una fecha-hora ISO o YYYY-MM-DD HH:mm a DD/MM/YYYY HH:mm
 */
export function formatFechaHoraDDMMYYYY(raw) {
    if (!raw || raw === '-') return '-';
    const s = String(raw).trim().replace('T', ' ');
    const datePart = s.substring(0, 10);
    const timePart = s.length >= 16 ? s.substring(11, 16) : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) {
        const [y, m, d] = datePart.split('-');
        return timePart ? `${d}/${m}/${y} ${timePart}` : `${d}/${m}/${y}`;
    }
    return s;
}

/**
 * Normaliza cualquier fecha (DD/MM/YYYY o ISO) a YYYY-MM-DD para comparaciones matemáticas
 */
function normalizeToISO(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    const dmyMatch = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
    return null;
}

/**
 * Suma N días corridos a una fecha YYYY-MM-DD y devuelve YYYY-MM-DD
 */
function addDaysISO(isoDate, days = 30) {
    if (!isoDate || !/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
    const d = new Date(isoDate + 'T12:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    return d.toISOString().substring(0, 10);
}

/**
 * Calcula los días corridos entre dos fechas YYYY-MM-DD (fechaFin - fechaInicio)
 */
function diffDaysISO(fechaInicioISO, fechaFinISO) {
    if (!fechaInicioISO || !fechaFinISO) return null;
    const d1 = new Date(fechaInicioISO + 'T12:00:00');
    const d2 = new Date(fechaFinISO + 'T12:00:00');
    if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return null;
    return Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
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

    // 4. Obtener todas las facturas para cruzar fecha de alta y exigibilidad
    let queryFacturas = supabase
        .from('deudas_facturas')
        .select('paciente_id, n_admision, fecha_hospitalizacion, pendiente, cobrado, total');

    const [pacientesRes, segRes, cuotasRes, facturasRes] = await Promise.all([
        queryPacientes,
        querySeguimiento,
        queryCuotas,
        queryFacturas
    ]);

    const pacientes = pacientesRes.data || [];
    const seguimientos = segRes.data || [];
    const cuotas = cuotasRes.data || [];
    const todasFacturas = facturasRes.data || [];

    // 5. Obtener altas administrativas para determinar Fecha de Alta exacta y Regla de 30 días
    const distinctAdmsAll = [...new Set(todasFacturas.map(f => f.n_admision).filter(Boolean))];
    let allAltas = [];
    if (distinctAdmsAll.length > 0) {
        for (let i = 0; i < distinctAdmsAll.length; i += 100) {
            const chunk = distinctAdmsAll.slice(i, i + 100);
            const { data: chunkAltas } = await supabase
                .from('altas_administrativas')
                .select('numero_admision, fecha_alta, fecha_ingreso')
                .in('numero_admision', chunk);
            if (chunkAltas) allAltas.push(...chunkAltas);
        }
    }
    const altasMap = new Map();
    allAltas.forEach(a => altasMap.set(String(a.numero_admision).trim(), a));

    // Mapa de Fecha de Alta y Fecha de Exigibilidad (+30d) por Paciente
    const pacFechasMoraMap = {};
    const facturasPorPac = {};
    todasFacturas.forEach(f => {
        if (!facturasPorPac[f.paciente_id]) facturasPorPac[f.paciente_id] = [];
        facturasPorPac[f.paciente_id].push(f);
    });

    pacientes.forEach(p => {
        const pFacturas = facturasPorPac[p.id] || [];
        let fAltaISO = null;

        for (const f of pFacturas) {
            const admKey = f.n_admision ? String(f.n_admision).trim() : null;
            const alta = admKey ? altasMap.get(admKey) : null;
            if (alta?.fecha_alta) {
                const candidate = normalizeToISO(alta.fecha_alta);
                if (candidate && (!fAltaISO || candidate < fAltaISO)) fAltaISO = candidate;
            } else if (f.fecha_hospitalizacion) {
                const candidate = normalizeToISO(f.fecha_hospitalizacion);
                if (candidate && (!fAltaISO || candidate < fAltaISO)) fAltaISO = candidate;
            }
        }

        if (!fAltaISO && p.fecha_ultima_factura) {
            fAltaISO = normalizeToISO(p.fecha_ultima_factura);
        }

        const fExigibleISO = fAltaISO ? addDaysISO(fAltaISO, 30) : null;
        pacFechasMoraMap[p.id] = {
            fechaAltaISO: fAltaISO,
            fechaExigibleISO: fExigibleISO,
            fechaAltaDisplay: formatFechaDDMMYYYY(fAltaISO),
            fechaExigibleDisplay: formatFechaDDMMYYYY(fExigibleISO)
        };
    });

    // 6. Obtener cobros de caja SALUS (deudas_cobros) para los pacientes de la cartera
    const nhcs = [...new Set(pacientes.map(p => p.nhc).filter(Boolean))];
    const nhcToPac = {};
    pacientes.forEach(p => { if (p.nhc) nhcToPac[p.nhc] = p; });
    const pacientesMap = {};
    pacientes.forEach(p => { pacientesMap[p.id] = p; });

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

    // ─── Calcular cobros por mes y discriminación Exigible (>=30d) vs. En Gracia (<30d) ───
    const cobradoPorMes = {};
    let totalDeudaCobrada = 0;
    let montoDeudasCanceladas = 0;
    let countDeudasCanceladas = 0;
    let montoCobrosCuotasYSeg = 0;

    let montoCobradoExigible = 0;
    let montoCobradoEnGracia = 0;
    const pacsCobradosExigiblesSet = new Set();
    const pacsCobradosEnGraciaSet = new Set();

    // Helper para clasificar si un cobro ocurrió >= 30 días post-alta (Deuda Exigible) o < 30 días (Período de Gracia)
    const evaluarExigibilidadCobro = (pacId, fechaCobroISO) => {
        const infoMora = pacFechasMoraMap[pacId];
        if (!infoMora || !infoMora.fechaAltaISO || !fechaCobroISO) {
            return { esExigible: true, diasPostAlta: null };
        }
        const dias = diffDaysISO(infoMora.fechaAltaISO, fechaCobroISO);
        if (dias !== null && dias < 30) {
            return { esExigible: false, diasPostAlta: Math.max(0, dias) };
        }
        return { esExigible: true, diasPostAlta: dias };
    };

    const registrarCobroEnPeriodo = (pacId, monto, fechaCobroISO) => {
        const { esExigible } = evaluarExigibilidadCobro(pacId, fechaCobroISO);
        if (esExigible) {
            montoCobradoExigible += monto;
            if (pacId) pacsCobradosExigiblesSet.add(pacId);
        } else {
            montoCobradoEnGracia += monto;
            if (pacId) pacsCobradosEnGraciaSet.add(pacId);
        }
    };

    // Nivel 1: Cobros reales registrados en caja SALUS (deudas_cobros)
    // REGLA DE ORO DEL INCENTIVO: Solo se suman como Deuda Cobrada aquellos pagos realizados >= 30 días post-alta (esExigible === true).
    // Los pagos realizados durante la internación o antes de los 30 días del alta se contabilizan aparte en montoCobradoEnGracia (excluidos del incentivo).
    const nhcsConCobros = new Set();
    const pacsCanceladosEnPeriodoSet = new Set();
    cobros.forEach(c => {
        const cDate = c.fecha ? c.fecha.substring(0, 10) : '';
        const ym = cDate ? cDate.substring(0, 7) : '';
        const monto = Number(c.importe) || 0;
        const pac = nhcToPac[c.nhc];
        if (c.nhc && monto > 0) nhcsConCobros.add(c.nhc);

        if (monto > 0 && ym) {
            const { esExigible } = evaluarExigibilidadCobro(pac?.id, cDate);
            const inRange = (effDesde && effHasta)
                ? (cDate >= effDesde && cDate <= effHasta)
                : true;

            if (esExigible) {
                cobradoPorMes[ym] = (cobradoPorMes[ym] || 0) + monto;
                if (inRange) {
                    totalDeudaCobrada += monto;
                    montoCobradoExigible += monto;
                    if (pac?.id) pacsCobradosExigiblesSet.add(pac.id);
                    if (pac?.categoria === 'deuda_cancelada') {
                        montoDeudasCanceladas += monto;
                        pacsCanceladosEnPeriodoSet.add(pac.id);
                    } else {
                        montoCobrosCuotasYSeg += monto;
                    }
                }
            } else if (inRange) {
                montoCobradoEnGracia += monto;
                if (pac?.id) pacsCobradosEnGraciaSet.add(pac.id);
            }
        }
    });

    // Nivel 2: Pagos manuales en seguimiento (solo para pacientes sin recibos duplicados en SALUS)
    const pacIdsConPagoSeg = new Set();
    seguimientos.forEach(s => {
        if (s.tipo === 'pago' && Number(s.monto) > 0) {
            const pac = pacientesMap[s.paciente_id];
            if (pac?.nhc && nhcsConCobros.has(pac.nhc)) return;
            pacIdsConPagoSeg.add(s.paciente_id);

            const sDate = s.created_at ? s.created_at.substring(0, 10) : '';
            const ym = sDate ? sDate.substring(0, 7) : '';
            const monto = Number(s.monto) || 0;

            if (monto > 0 && ym) {
                const { esExigible } = evaluarExigibilidadCobro(s.paciente_id, sDate);
                const inRange = (effDesde && effHasta)
                    ? (sDate >= effDesde && sDate <= effHasta)
                    : true;

                if (esExigible) {
                    cobradoPorMes[ym] = (cobradoPorMes[ym] || 0) + monto;
                    if (inRange) {
                        totalDeudaCobrada += monto;
                        montoCobradoExigible += monto;
                        if (s.paciente_id) pacsCobradosExigiblesSet.add(s.paciente_id);
                        if (pac?.categoria === 'deuda_cancelada') {
                            montoDeudasCanceladas += monto;
                            pacsCanceladosEnPeriodoSet.add(pac.id);
                        } else {
                            montoCobrosCuotasYSeg += monto;
                        }
                    }
                } else if (inRange) {
                    montoCobradoEnGracia += monto;
                    if (s.paciente_id) pacsCobradosEnGraciaSet.add(s.paciente_id);
                }
            }
        }
    });

    // Nivel 3: Pacientes con deuda_cancelada (si no tienen cobros ya sumados en Nivel 1 o Nivel 2)
    pacientes.forEach(p => {
        if (p.categoria === 'deuda_cancelada' && p.deuda_cancelada_at) {
            const cancDate = p.deuda_cancelada_at.substring(0, 10);
            const ym = cancDate.substring(0, 7);
            const monto = Number(p.total_cobros) > 0 ? Number(p.total_cobros) : Number(p.deuda_total);
            const yaContabilizado = (p.nhc && nhcsConCobros.has(p.nhc)) || pacIdsConPagoSeg.has(p.id);

            const inRange = (effDesde && effHasta)
                ? (cancDate >= effDesde && cancDate <= effHasta)
                : true;

            if (!yaContabilizado && monto > 0 && ym) {
                const { esExigible } = evaluarExigibilidadCobro(p.id, cancDate);
                if (esExigible) {
                    cobradoPorMes[ym] = (cobradoPorMes[ym] || 0) + monto;
                    if (inRange) {
                        totalDeudaCobrada += monto;
                        montoCobradoExigible += monto;
                        pacsCobradosExigiblesSet.add(p.id);
                        montoDeudasCanceladas += monto;
                        pacsCanceladosEnPeriodoSet.add(p.id);
                    }
                } else if (inRange) {
                    montoCobradoEnGracia += monto;
                    pacsCobradosEnGraciaSet.add(p.id);
                }
            }
        }
    });
    countDeudasCanceladas = pacsCanceladosEnPeriodoSet.size;

    // Totales históricos acumulados
    const totalHistoricoCanceladasMonto = pacientes
        .filter(p => p.categoria === 'deuda_cancelada')
        .reduce((s, p) => s + (Number(p.total_cobros) || Number(p.deuda_total) || 0), 0);
    const totalHistoricoCanceladasCount = pacientes.filter(p => p.categoria === 'deuda_cancelada').length;
    const totalHistoricoCobrado = Object.values(cobradoPorMes).reduce((a, b) => a + b, 0);

    // Cuadre contable estricto: Descomposición exacta del total cobrado
    if (montoDeudasCanceladas > totalDeudaCobrada) {
        montoDeudasCanceladas = totalDeudaCobrada;
    }
    montoCobrosCuotasYSeg = Math.max(0, totalDeudaCobrada - montoDeudasCanceladas);

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
        const sum = pacList.reduce((s, p) => {
            const cap = Number(p.deuda_total) > 0 ? Number(p.deuda_total) : Number(p.total_cobros || 0);
            return s + cap;
        }, 0);
        gestionadoPorMes[ym] = sum;
    });

    // ─── Métricas Globales de Cartera Activa ───
    const CATEGORIAS_DESCUENTO = ['descuento_liquidacion', 'deuda_cancelada'];
    const deudaBruta = pacientes.reduce((s, p) => s + Number(p.deuda_total), 0);
    const deudaDescontada = pacientes
        .filter(p => CATEGORIAS_DESCUENTO.includes(p.categoria))
        .reduce((s, p) => s + Number(p.deuda_total), 0);
    const totalDeudaActiva = Math.max(0, deudaBruta - deudaDescontada);
    const deudoresActivos = pacientes.filter(p => !CATEGORIAS_DESCUENTO.includes(p.categoria)).length;
    const pacientesActivosIds = new Set(pacientes.filter(p => !CATEGORIAS_DESCUENTO.includes(p.categoria)).map(p => p.id));

    // ─── Análisis de Exigibilidad: Regla de 30 días post-alta (Sincronizado a Cartera Activa) ───
    let totalDeudaExigible = 0;
    let totalDeudaEnGracia = 0;
    let countPacientesExigibles = 0;
    let countPacientesEnGracia = 0;

    try {
        const facturasActivas = todasFacturas.filter(f => Number(f.pendiente) > 0 && pacientesActivosIds.has(f.paciente_id));

        const todayISO = new Date().toISOString().substring(0, 10);
        const pacExigibilidad = {};
        facturasActivas.forEach(f => {
            if (!pacExigibilidad[f.paciente_id]) {
                pacExigibilidad[f.paciente_id] = { exigible: 0, enGracia: 0 };
            }
            const admKey = f.n_admision ? String(f.n_admision).trim() : null;
            const alta = admKey ? altasMap.get(admKey) : null;
            const monto = Number(f.pendiente) || 0;
            const fAltaISO = normalizeToISO(alta?.fecha_alta || f.fecha_hospitalizacion);

            if (fAltaISO) {
                const diffDays = diffDaysISO(fAltaISO, todayISO);
                if (diffDays !== null && diffDays >= 30) {
                    pacExigibilidad[f.paciente_id].exigible += monto;
                } else {
                    pacExigibilidad[f.paciente_id].enGracia += monto;
                }
            } else {
                pacExigibilidad[f.paciente_id].enGracia += monto;
            }
        });

        let rawExigibleSum = 0;
        let rawGraciaSum = 0;
        Object.values(pacExigibilidad).forEach(pe => {
            rawExigibleSum += pe.exigible;
            rawGraciaSum += pe.enGracia;
            if (pe.exigible > 0) countPacientesExigibles++;
            if (pe.enGracia > 0 && pe.exigible === 0) countPacientesEnGracia++;
        });

        // Escalar proporcionalmente para cuadrar 100% con totalDeudaActiva
        const rawSum = rawExigibleSum + rawGraciaSum;
        if (rawSum > 0 && totalDeudaActiva > 0) {
            const factor = totalDeudaActiva / rawSum;
            totalDeudaExigible = Math.round(rawExigibleSum * factor);
            totalDeudaEnGracia = Math.max(0, totalDeudaActiva - totalDeudaExigible);
        } else {
            totalDeudaExigible = Math.round(rawExigibleSum);
            totalDeudaEnGracia = Math.max(0, totalDeudaActiva - totalDeudaExigible);
        }
    } catch (errExig) {
        console.warn('Error calculando exigibilidad 30d:', errExig);
        totalDeudaExigible = Math.round(totalDeudaActiva * 0.6);
        totalDeudaEnGracia = totalDeudaActiva - totalDeudaExigible;
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

    // 2. Datos para Gráfico de Líneas: Evolución de la Deuda Total (Stock de Pasivo Vivo al cierre de cada mes)
    const stockPorMes = {};
    const curYm = new Date().toISOString().substring(0, 7);
    const pastOrCurrentMonths = sortedMonths.filter(m => m <= curYm);
    const anchorMonth = pastOrCurrentMonths.length > 0 
        ? pastOrCurrentMonths[pastOrCurrentMonths.length - 1] 
        : sortedMonths[sortedMonths.length - 1];

    stockPorMes[anchorMonth] = Math.round(totalDeudaActiva);

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
        stockPorMes[sortedMonths[i]] = Math.round(totalDeudaActiva);
    }

    const evolucionDeudaTotal = sortedMonths.map(ym => {
        const originada = deudaPorMes[ym] || 0;
        const cobrada = cobradoPorMes[ym] || 0;
        const stockMes = stockPorMes[ym] ?? Math.round(totalDeudaActiva);
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
            fechaAlta: pacFechasMoraMap[p.id]?.fechaAltaDisplay || '-',
            fechaExigible: pacFechasMoraMap[p.id]?.fechaExigibleDisplay || '-',
            gestionadoEnPeriodo: patientHasGestionInRange.has(p.id) || (effDesde && effHasta ? false : true),
        }));

    // Tasa financiera de recuperación: Cobrado / (Cobrado + Deuda Activa Pendiente)
    const baseCarteraTotal = totalDeudaCobrada + totalDeudaActiva;
    const tasaRecuperacionGestionada = baseCarteraTotal > 0 
        ? Math.min(100, Math.round((totalDeudaCobrada / baseCarteraTotal) * 100)) 
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
        montoCobradoExigible,
        montoCobradoEnGracia,
        countCobradoExigible: pacsCobradosExigiblesSet.size,
        countCobradoEnGracia: pacsCobradosEnGraciaSet.size,
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
 * Incluye pacientes cobrados, planes vigentes, deuda restante, fechas de alta/exigibilidad (DD/MM/AAAA) y movimientos de caja
 */
export async function descargarInformeCobranzasExcel(filtros = {}) {
    const { preset = 'este_mes', fechaDesde = null, fechaHasta = null, metricasData = null } = filtros;
    const rango = getRangoFechasPreset(preset, fechaDesde, fechaHasta);
    const { fechaDesde: effDesde, fechaHasta: effHasta, label: periodoLabel } = rango;

    // Obtener métricas consolidadas (garantiza paridad 100% con la pantalla)
    const metricas = metricasData || await fetchMetricasAvanzadasDeudas(filtros);

    // 1. Obtener pacientes, seguimientos, planes y facturas en paralelo
    const [pacientesRes, seguimientosRes, planesRes, facturasRes] = await Promise.all([
        supabase.from('deudas_pacientes').select('*'),
        supabase.from('deudas_seguimiento').select('*').order('created_at', { ascending: true }),
        supabase.from('deudas_planes_pago').select('*, cuotas:deudas_cuotas(*)'),
        supabase.from('deudas_facturas').select('paciente_id, n_admision, fecha_hospitalizacion, pendiente, cobrado, total')
    ]);

    const pacientes = pacientesRes.data || [];
    const seguimientos = seguimientosRes.data || [];
    const planes = planesRes.data || [];
    const todasFacturas = facturasRes.data || [];

    const pacientesMap = {};
    pacientes.forEach(p => { pacientesMap[p.id] = p; });

    // Cruzar con altas administrativas para obtener Fecha de Alta y Fecha Exigible (+30d)
    const distinctAdms = [...new Set(todasFacturas.map(f => f.n_admision).filter(Boolean))];
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
    allAltas.forEach(a => altasMap.set(String(a.numero_admision).trim(), a));

    const facturasPorPac = {};
    todasFacturas.forEach(f => {
        if (!facturasPorPac[f.paciente_id]) facturasPorPac[f.paciente_id] = [];
        facturasPorPac[f.paciente_id].push(f);
    });

    const pacFechasMoraMap = {};
    pacientes.forEach(p => {
        const pFacturas = facturasPorPac[p.id] || [];
        let fAltaISO = null;
        for (const f of pFacturas) {
            const admKey = f.n_admision ? String(f.n_admision).trim() : null;
            const alta = admKey ? altasMap.get(admKey) : null;
            if (alta?.fecha_alta) {
                const candidate = normalizeToISO(alta.fecha_alta);
                if (candidate && (!fAltaISO || candidate < fAltaISO)) fAltaISO = candidate;
            } else if (f.fecha_hospitalizacion) {
                const candidate = normalizeToISO(f.fecha_hospitalizacion);
                if (candidate && (!fAltaISO || candidate < fAltaISO)) fAltaISO = candidate;
            }
        }
        if (!fAltaISO && p.fecha_ultima_factura) {
            fAltaISO = normalizeToISO(p.fecha_ultima_factura);
        }
        const fExigibleISO = fAltaISO ? addDaysISO(fAltaISO, 30) : null;
        pacFechasMoraMap[p.id] = {
            fechaAltaISO: fAltaISO,
            fechaExigibleISO: fExigibleISO,
            fechaAltaDisplay: formatFechaDDMMYYYY(fAltaISO),
            fechaExigibleDisplay: formatFechaDDMMYYYY(fExigibleISO)
        };
    });

    const evaluarExigibilidadCobro = (pacId, fechaCobroISO) => {
        const infoMora = pacFechasMoraMap[pacId];
        if (!infoMora || !infoMora.fechaAltaISO || !fechaCobroISO) {
            return { esExigible: true, diasPostAlta: null, label: 'Exigible (≥30d post-alta)' };
        }
        const dias = diffDaysISO(infoMora.fechaAltaISO, fechaCobroISO);
        if (dias !== null && dias < 30) {
            return {
                esExigible: false,
                diasPostAlta: Math.max(0, dias),
                label: `En Gracia (${Math.max(0, dias)}d post-alta)`
            };
        }
        return {
            esExigible: true,
            diasPostAlta: dias,
            label: `Exigible (${dias}d post-alta)`
        };
    };

    const planesPorPaciente = {};
    planes.forEach(pl => {
        if (!planesPorPaciente[pl.paciente_id]) planesPorPaciente[pl.paciente_id] = [];
        planesPorPaciente[pl.paciente_id].push(pl);
    });

    // Map para búsqueda por NHC
    const nhcToPacMap = {};
    pacientes.forEach(p => { if (p.nhc) nhcToPacMap[p.nhc] = p; });

    // 4. Obtener cobros reales de caja SALUS (deudas_cobros)
    const nhcs = [...new Set(pacientes.map(p => p.nhc).filter(Boolean))];
    let cobrosSalus = [];
    if (nhcs.length > 0) {
        const { data: cobrosData } = await supabase
            .from('deudas_cobros')
            .select('nhc, importe, fecha, forma_pago, descripcion')
            .in('nhc', nhcs)
            .order('fecha', { ascending: true });
        cobrosSalus = cobrosData || [];
    }

    // 5. Identificar pagos con jerarquía de 3 niveles sin duplicación
    // REGLA DE ORO DEL INCENTIVO: Solo se incluyen y suman los pagos efectuados >= 30 días post-alta (esExigible === true).
    // Los pagos efectuados durante la internación o antes de los 30 días del alta se contabilizan aparte en totalExcluidoMenos30d.
    const movimientosCaja = [];
    const cobrosPorPaciente = {}; // pacId -> { totalPeriodo, cobradoExigiblePeriodo, cobradoEnGraciaPeriodo, totalHistorico, ultimoCobroFechaISO, ultimoComprobante, ultimoOperador }
    let totalExcluidoMenos30d = 0;
    let countRecibosExcluidosMenos30d = 0;

    const ensurePacCobroEntry = (pacId, fechaISO, comprobante, operador) => {
        if (!cobrosPorPaciente[pacId]) {
            cobrosPorPaciente[pacId] = {
                totalPeriodo: 0,
                cobradoExigiblePeriodo: 0,
                cobradoEnGraciaPeriodo: 0,
                totalHistorico: 0,
                ultimoCobroFechaISO: fechaISO || '',
                ultimoComprobante: comprobante || '',
                ultimoOperador: operador || 'Sistema',
            };
        }
    };

    // Nivel 1: Cobros de caja SALUS
    const nhcsConCobrosSalus = new Set();
    cobrosSalus.forEach(c => {
        const pac = nhcToPacMap[c.nhc];
        if (!pac) return;
        const pacId = pac.id;
        const monto = Number(c.importe) || 0;
        if (monto <= 0) return;
        if (c.nhc) nhcsConCobrosSalus.add(c.nhc);

        const cDate = c.fecha ? c.fecha.substring(0, 10) : '';
        const cDateTime = c.fecha ? c.fecha.replace('T', ' ').substring(0, 16) : '';

        ensurePacCobroEntry(pacId, cDate, c.descripcion || '', 'Caja SALUS');
        cobrosPorPaciente[pacId].totalHistorico += monto;

        const inRange = effDesde && effHasta 
            ? (cDate >= effDesde && cDate <= effHasta)
            : true;

        if (inRange) {
            const evalExig = evaluarExigibilidadCobro(pacId, cDate);
            if (evalExig.esExigible) {
                cobrosPorPaciente[pacId].totalPeriodo += monto;
                cobrosPorPaciente[pacId].cobradoExigiblePeriodo += monto;
                cobrosPorPaciente[pacId].ultimoCobroFechaISO = cDate;
                if (c.descripcion) cobrosPorPaciente[pacId].ultimoComprobante = c.descripcion;

                const moraInfo = pacFechasMoraMap[pacId] || {};
                movimientosCaja.push({
                    rawFecha: cDateTime,
                    fecha: formatFechaHoraDDMMYYYY(cDateTime),
                    paciente: pac.nombre,
                    nhc: pac.nhc,
                    fechaAlta: moraInfo.fechaAltaDisplay || '-',
                    fechaExigible: moraInfo.fechaExigibleDisplay || '-',
                    condicionCobro: evalExig.label,
                    monto,
                    concepto: 'Cobranza Caja SALUS (≥30d post-alta)',
                    medio: c.forma_pago || 'Caja / Transferencia',
                    comprobante: c.descripcion || '-',
                    usuario: 'Caja SALUS',
                    detalle: c.descripcion || ''
                });
            } else {
                cobrosPorPaciente[pacId].cobradoEnGraciaPeriodo += monto;
                totalExcluidoMenos30d += monto;
                countRecibosExcluidosMenos30d++;
            }
        }
    });

    // Nivel 2: Seguimientos de pago (solo si el paciente no tuvo recibo ya contabilizado en SALUS)
    const pacIdsConPagoSeg = new Set();
    seguimientos.forEach(s => {
        if (s.tipo === 'pago' && Number(s.monto) > 0) {
            const pac = pacientesMap[s.paciente_id];
            if (pac && pac.nhc && nhcsConCobrosSalus.has(pac.nhc)) return;
            pacIdsConPagoSeg.add(s.paciente_id);

            const pacNombre = pac ? pac.nombre : 'Paciente Desconocido';
            const pacNhc = pac ? (pac.nhc || 'S/D') : 'S/D';
            const sDate = s.created_at ? s.created_at.substring(0, 10) : '';
            const sDateTime = s.created_at ? s.created_at.replace('T', ' ').substring(0, 16) : '';
            const monto = Number(s.monto);

            ensurePacCobroEntry(s.paciente_id, sDate, s.descripcion || '', s.usuario || '');
            cobrosPorPaciente[s.paciente_id].totalHistorico += monto;

            const inRange = effDesde && effHasta 
                ? (sDate >= effDesde && sDate <= effHasta)
                : true;

            if (inRange) {
                const evalExig = evaluarExigibilidadCobro(s.paciente_id, sDate);
                if (evalExig.esExigible) {
                    cobrosPorPaciente[s.paciente_id].totalPeriodo += monto;
                    cobrosPorPaciente[s.paciente_id].cobradoExigiblePeriodo += monto;
                    cobrosPorPaciente[s.paciente_id].ultimoCobroFechaISO = sDate;
                    if (s.usuario) cobrosPorPaciente[s.paciente_id].ultimoOperador = s.usuario;
                    if (s.descripcion) cobrosPorPaciente[s.paciente_id].ultimoComprobante = s.descripcion;

                    const moraInfo = pacFechasMoraMap[s.paciente_id] || {};
                    movimientosCaja.push({
                        rawFecha: sDateTime,
                        fecha: formatFechaHoraDDMMYYYY(sDateTime),
                        paciente: pacNombre,
                        nhc: pacNhc,
                        fechaAlta: moraInfo.fechaAltaDisplay || '-',
                        fechaExigible: moraInfo.fechaExigibleDisplay || '-',
                        condicionCobro: evalExig.label,
                        monto,
                        concepto: 'Cuota / Pago a cuenta (≥30d post-alta)',
                        medio: s.descripcion?.includes('[') ? s.descripcion.split('[')[1]?.split(']')[0] : 'Transferencia / Efectivo',
                        comprobante: s.descripcion?.includes('Ref:') ? s.descripcion.split('Ref:')[1]?.split('—')[0]?.trim() : (s.descripcion || '-'),
                        usuario: s.usuario || 'Sistema',
                        detalle: s.descripcion || ''
                    });
                } else {
                    cobrosPorPaciente[s.paciente_id].cobradoEnGraciaPeriodo += monto;
                    totalExcluidoMenos30d += monto;
                    countRecibosExcluidosMenos30d++;
                }
            }
        }
    });

    // Nivel 3: Pacientes con deuda_cancelada que NO tengan cobros duplicados ni en SALUS ni en Seguimiento
    pacientes.forEach(p => {
        if (p.categoria === 'deuda_cancelada' && p.deuda_cancelada_at) {
            const cancDate = p.deuda_cancelada_at.substring(0, 10);
            const cancDateTime = p.deuda_cancelada_at.replace('T', ' ').substring(0, 16);
            const montoCanc = Number(p.total_cobros) > 0 ? Number(p.total_cobros) : Number(p.deuda_total);
            const yaContabilizado = (p.nhc && nhcsConCobrosSalus.has(p.nhc)) || pacIdsConPagoSeg.has(p.id);

            ensurePacCobroEntry(p.id, cancDate, 'Cancelación 100% Deuda', p.deuda_cancelada_por || 'Administración');

            if (!yaContabilizado && montoCanc > 0) {
                cobrosPorPaciente[p.id].totalHistorico += montoCanc;

                const inRange = effDesde && effHasta
                    ? (cancDate >= effDesde && cancDate <= effHasta)
                    : true;

                if (inRange) {
                    const evalExig = evaluarExigibilidadCobro(p.id, cancDate);
                    if (evalExig.esExigible) {
                        cobrosPorPaciente[p.id].totalPeriodo += montoCanc;
                        cobrosPorPaciente[p.id].cobradoExigiblePeriodo += montoCanc;
                        cobrosPorPaciente[p.id].ultimoCobroFechaISO = cancDate;
                        if (p.deuda_cancelada_por) cobrosPorPaciente[p.id].ultimoOperador = p.deuda_cancelada_por;

                        const moraInfo = pacFechasMoraMap[p.id] || {};
                        movimientosCaja.push({
                            rawFecha: cancDateTime,
                            fecha: formatFechaHoraDDMMYYYY(cancDateTime),
                            paciente: p.nombre,
                            nhc: p.nhc || 'S/D',
                            fechaAlta: moraInfo.fechaAltaDisplay || '-',
                            fechaExigible: moraInfo.fechaExigibleDisplay || '-',
                            condicionCobro: evalExig.label,
                            monto: montoCanc,
                            concepto: 'Cancelación Total (100%)',
                            medio: 'Liquidación / Pago Total',
                            comprobante: 'Cancelación Definitiva',
                            usuario: p.deuda_cancelada_por || 'Administración',
                            detalle: `Cancelación al 100% de la cuenta por $${montoCanc}`
                        });
                    } else {
                        cobrosPorPaciente[p.id].cobradoEnGraciaPeriodo += montoCanc;
                        totalExcluidoMenos30d += montoCanc;
                        countRecibosExcluidosMenos30d++;
                    }
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

        // Cuadre contable exacto por paciente:
        // Deuda Original = Total Cobrado Histórico + Deuda Vigente Pendiente
        const deudaVigente = p.categoria === 'deuda_cancelada' ? 0 : Math.max(0, Number(p.deuda_total) || 0);
        const cobradoHistorico = Math.max(cobroInfo.totalPeriodo, cobroInfo.totalHistorico || 0);
        const deudaOriginal = cobradoHistorico + deudaVigente;

        const moraInfo = pacFechasMoraMap[p.id] || {};
        const evalUltimoCobro = evaluarExigibilidadCobro(p.id, cobroInfo.ultimoCobroFechaISO);
        const inicioGestISO = patientFirstGestion[p.id] || (p.ultimo_contacto_at ? p.ultimo_contacto_at.substring(0, 10) : null);

        pacientesCobradosList.push({
            id: p.id,
            nombre: p.nombre,
            nhc: p.nhc,
            telefono: p.telefono,
            obraSocial: p.obra_social,
            fechaAlta: moraInfo.fechaAltaDisplay || '-',
            fechaExigible: moraInfo.fechaExigibleDisplay || '-',
            condicionCobro: evalUltimoCobro.label,
            esExigible: evalUltimoCobro.esExigible,
            cobradoPeriodo: cobroInfo.totalPeriodo,
            cobradoExigiblePeriodo: cobroInfo.cobradoExigiblePeriodo,
            cobradoEnGraciaPeriodo: cobroInfo.cobradoEnGraciaPeriodo,
            cobradoHistorico,
            tipoCobro,
            categoria: p.categoria,
            categoriaLabel: CATEGORIAS_DEUDOR[p.categoria]?.label || p.categoria,
            deudaOriginal,
            deudaVigente,
            tienePlan,
            detallePlan,
            saldoPlan: p.categoria === 'deuda_cancelada' ? 0 : saldoPlan,
            gestionadoPor: cobroInfo.ultimoOperador || p.deuda_cancelada_por || 'Sistema',
            fechaCobro: formatFechaDDMMYYYY(cobroInfo.ultimoCobroFechaISO),
            fechaInicioGestion: formatFechaDDMMYYYY(inicioGestISO),
            observaciones: cobroInfo.ultimoComprobante
        });
    });

    // Ordenar de mayor a menor monto cobrado en el período
    pacientesCobradosList.sort((a, b) => b.cobradoPeriodo - a.cobradoPeriodo);
    movimientosCaja.sort((a, b) => (b.rawFecha || '').localeCompare(a.rawFecha || ''));

    // Resumen sincronizado 1:1 entre Hoja 1, Hoja 2 y Dashboard
    const totalCobradoPeriodo = pacientesCobradosList.reduce((s, p) => s + p.cobradoPeriodo, 0);
    const totalCobradoExigible = totalCobradoPeriodo;
    const totalCobradoEnGracia = totalExcluidoMenos30d;
    const montoCanceladas = pacientesCobradosList
        .filter(p => p.categoria === 'deuda_cancelada')
        .reduce((s, p) => s + p.cobradoPeriodo, 0);
    const cantCanceladas = pacientesCobradosList.filter(p => p.categoria === 'deuda_cancelada').length;
    const montoCuotas = Math.max(0, totalCobradoPeriodo - montoCanceladas);
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
        totalCobradoExigible,
        totalCobradoEnGracia,
        montoCanceladas,
        cantCanceladas,
        montoCuotas,
        cantConPlan,
        saldoDeudaPendiente,
        totalHistoricoCobrado: metricas?.totalHistoricoCobrado ?? totalHistoricoCobrado,
        totalHistoricoCanceladasMonto: metricas?.totalHistoricoCanceladasMonto ?? totalHistoricoCanceladasMonto,
        totalHistoricoCanceladasCount: metricas?.totalHistoricoCanceladasCount ?? totalHistoricoCanceladasCount
    };

    return await generarExcelCobranzas({
        periodoLabel,
        pacientesCobrados: pacientesCobradosList,
        movimientosCaja,
        resumen
    });
}


