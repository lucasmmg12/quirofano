/**
 * deudaService.js — Servicio de gestión de deudas
 * CRUD para pacientes deudores, facturas, seguimiento e importaciones
 */
import { supabase } from '../lib/supabase';

// ─── Categorías de deudor ───
export const CATEGORIAS_DEUDOR = {
    sin_gestionar:         { label: 'Sin gestionar',             color: '#F59E0B', bg: '#FEF3C7', icon: '🟡' },
    en_gestion:            { label: 'En gestión',                color: '#3B82F6', bg: '#DBEAFE', icon: '🔵' },
    comprometido:          { label: 'Comprometido',              color: '#16A34A', bg: '#DCFCE7', icon: '🟢' },
    cuenta_corriente:      { label: 'Cuenta Corriente',          color: '#8B5CF6', bg: '#F3E8FF', icon: '🟣' },
    incobrable:            { label: 'Incobrable',                color: '#EF4444', bg: '#FEE2E2', icon: '🔴' },
    descuento_liquidacion: { label: 'Descuento por Liquidación', color: '#0D9488', bg: '#CCFBF1', icon: '🏷️' },
    deuda_cancelada:       { label: 'Deuda Cancelada',           color: '#6366F1', bg: '#E0E7FF', icon: '🚫' },
    sin_deuda_salus:       { label: 'Sin Deuda en Salus',       color: '#059669', bg: '#D1FAE5', icon: '✅' },
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
        const safeSearch = filters.search.replace(/,/g, ' ').trim();
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

export async function fetchCobros(pacienteId) {
    const { data, error } = await supabase
        .from('deudas_cobros')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha', { ascending: false });
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

export async function fetchNotasCredito(pacienteId) {
    const { data, error } = await supabase
        .from('deudas_notas_credito')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('fecha', { ascending: false });
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
    const { data, error } = await supabase
        .from('deudas_seguimiento')
        .select('*')
        .eq('paciente_id', pacienteId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return data || [];
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
            if (['deuda_cancelada', 'sin_deuda_salus'].includes(existente.categoria) && deudaTotal > 0) {
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
        .select('id, nhc')
        .gt('deuda_total', 0)
        .not('categoria', 'in', '("deuda_cancelada", "sin_deuda_salus")');
    
    let pacientesConciliados = 0;
    
    if (activosDb) {
        const nhcsEnExcel = new Set(Object.keys(porNhc));
        
        for (const pDb of activosDb) {
            if (!nhcsEnExcel.has(pDb.nhc)) {
                await supabase
                    .from('deudas_pacientes')
                    .update({
                        deuda_total: 0,
                        categoria: 'sin_deuda_salus',
                        deuda_cancelada_at: new Date().toISOString(),
                        deuda_cancelada_por: 'Sistema (Conciliación)',
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', pDb.id);
                
                await supabase
                    .from('deudas_seguimiento')
                    .insert({
                        paciente_id: pDb.id,
                        usuario: 'Sistema',
                        descripcion: '✅ Deuda cancelada automáticamente al no registrarse saldo pendiente en la última importación de Salus.',
                        tipo: 'nota',
                        importante: true
                    });
                
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
    const CATEGORIAS_DESCUENTO = ['sin_deuda_salus', 'descuento_liquidacion', 'deuda_cancelada'];

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

export async function marcarCuotaPagada(cuotaId, { fechaPago, comprobante }) {
    const { error } = await supabase
        .from('deudas_cuotas')
        .update({ pagada: true, fecha_pago: fechaPago || new Date().toISOString().split('T')[0], comprobante: comprobante || null })
        .eq('id', cuotaId);
    if (error) throw error;
}

export async function cancelarPlan(planId) {
    const { error } = await supabase
        .from('deudas_planes_pago')
        .update({ estado: 'cancelado', updated_at: new Date().toISOString() })
        .eq('id', planId);
    if (error) throw error;
}
