/**
 * pacienteUnificadoService.js — Vista 360° de pacientes
 * Consolida datos de 7+ tablas para una ficha unificada de cada paciente.
 * Usa hospital_pacientes como tabla maestra y cruza en tiempo real.
 */
import { supabase } from '../lib/supabase';

const TABLE = 'hospital_pacientes';

// ─── Búsqueda de pacientes (nombre, DNI o NHC) ───
export async function searchPacientes(query, { page = 0, pageSize = 50 } = {}) {
    if (!query || query.trim().length < 2) return { data: [], count: 0 };

    const trimmed = query.replace(/,/g, ' ').trim();
    const isNumeric = /^\d+$/.test(trimmed);
    const from = page * pageSize;

    let q = supabase
        .from(TABLE)
        .select('id_paciente, nombre, dni, edad, sexo, email, centro, nhc, telefono, manual, notas', { count: 'exact' })
        .order('nombre', { ascending: true })
        .range(from, from + pageSize - 1);

    if (isNumeric) {
        // Buscar por DNI o NHC
        q = q.or(`dni.ilike.${trimmed}%,nhc.ilike.${trimmed}%`);
    } else {
        // Buscar por nombre — multi-token
        const tokens = trimmed.split(/\s+/);
        for (const token of tokens) {
            q = q.ilike('nombre', `%${token}%`);
        }
    }

    const { data, count, error } = await q;
    if (error) {
        console.error('[pacienteUnificado] search error:', error);
        return { data: [], count: 0 };
    }
    return { data: data || [], count: count || 0 };
}

// ─── Fetch todos los pacientes paginados ───
export async function fetchPacientes({ page = 0, pageSize = 50, search = '' } = {}) {
    const from = page * pageSize;

    let q = supabase
        .from(TABLE)
        .select('id_paciente, nombre, dni, edad, sexo, email, centro, nhc, telefono, manual, notas, created_at', { count: 'exact' })
        .order('nombre', { ascending: true })
        .range(from, from + pageSize - 1);

    if (search && search.trim().length >= 2) {
        const trimmed = search.trim();
        const isNumeric = /^\d+$/.test(trimmed);
        if (isNumeric) {
            q = q.or(`dni.ilike.${trimmed}%,nhc.ilike.${trimmed}%`);
        } else {
            const tokens = trimmed.split(/\s+/);
            for (const token of tokens) {
                q = q.ilike('nombre', `%${token}%`);
            }
        }
    }

    const { data, count, error } = await q;
    if (error) {
        console.error('[pacienteUnificado] fetchPacientes error:', error);
        return { data: [], count: 0 };
    }
    return { data: data || [], count: count || 0 };
}

// ─── Detalle 360° de un paciente ───
export async function fetchPacienteDetalle(paciente) {
    let { id_paciente, dni, nombre, nhc, telefono } = paciente;

    // Si no tenemos DNI o NHC pero tenemos teléfono, resolver primero con el padrón maestro
    if ((!dni || !nhc) && telefono) {
        try {
            const { data: rpcPac } = await supabase.rpc('buscar_paciente_por_telefono', { p_telefono: String(telefono) });
            if (rpcPac && rpcPac.length > 0) {
                const found = rpcPac[0];
                dni = dni || found.dni;
                nhc = nhc || found.nhc;
                nombre = nombre || found.nombre;
                id_paciente = id_paciente || found.id_paciente;
            }
        } catch (e) {
            console.warn('[pacienteUnificado] error buscando paciente por teléfono:', e);
        }
    }

    // Queries paralelas a todas las tablas relacionadas
    const queries = [];

    // 1. Cirugías — por DNI o nombre
    queries.push(
        (async () => {
            let data = [];
            if (dni) {
                const { data: byDni } = await supabase
                    .from('surgeries')
                    .select('id, nombre, dni, telefono, obra_social, fecha_cirugia, medico, modulo, status, notas, created_at')
                    .eq('dni', dni)
                    .order('fecha_cirugia', { ascending: false })
                    .limit(50);
                data = byDni || [];
            }
            if (data.length === 0 && nombre) {
                const { data: byName } = await supabase
                    .from('surgeries')
                    .select('id, nombre, dni, telefono, obra_social, fecha_cirugia, medico, modulo, status, notas, created_at')
                    .ilike('nombre', `%${nombre.split(' ').slice(0, 2).join('%')}%`)
                    .order('fecha_cirugia', { ascending: false })
                    .limit(50);
                data = byName || [];
            }
            return { key: 'cirugias', data };
        })()
    );

    // 2. Deudas — por NHC o DNI
    queries.push(
        (async () => {
            let data = null;
            if (nhc) {
                const { data: byNhc } = await supabase
                    .from('deudas_pacientes')
                    .select('id, nhc, nombre, telefono, categoria, deuda_total, cantidad_facturas, notas, ultimo_contacto_at, created_at')
                    .eq('nhc', nhc)
                    .maybeSingle();
                data = byNhc;
            }
            // Si no hay NHC, intentar buscar por nombre
            if (!data && nombre) {
                const { data: byName } = await supabase
                    .from('deudas_pacientes')
                    .select('id, nhc, nombre, telefono, categoria, deuda_total, cantidad_facturas, notas, ultimo_contacto_at, created_at')
                    .ilike('nombre', `%${nombre.split(' ').slice(0, 2).join('%')}%`)
                    .limit(1)
                    .maybeSingle();
                data = byName;
            }
            // Fetch facturas if we have a deudas_paciente
            let facturas = [];
            if (data?.id) {
                const { data: facs } = await supabase
                    .from('deudas_facturas')
                    .select('id, codigo, documento, total, cobrado, pendiente, fecha_factura, responsable, servicio')
                    .eq('paciente_id', data.id)
                    .order('fecha_factura', { ascending: false })
                    .limit(20);
                facturas = facs || [];
            }
            return { key: 'deudas', data: data ? { ...data, facturas } : null };
        })()
    );

    // 3. Altas administrativas — por id_paciente o nombre
    queries.push(
        (async () => {
            let data = [];
            if (id_paciente) {
                const { data: byId } = await supabase
                    .from('altas_administrativas')
                    .select('id, numero_admision, paciente, cliente, especialidad, doctor, fecha_ingreso, fecha_alta, estado, motivo_alta')
                    .eq('id_paciente', String(id_paciente))
                    .order('fecha_ingreso', { ascending: false })
                    .limit(20);
                data = byId || [];
            }
            if (data.length === 0 && nombre) {
                const { data: byName } = await supabase
                    .from('altas_administrativas')
                    .select('id, numero_admision, paciente, cliente, especialidad, doctor, fecha_ingreso, fecha_alta, estado, motivo_alta')
                    .ilike('paciente', `%${nombre.split(' ').slice(0, 2).join('%')}%`)
                    .order('fecha_ingreso', { ascending: false })
                    .limit(20);
                data = byName || [];
            }
            return { key: 'altas', data };
        })()
    );

    // 4. Consultas guardia, ambulatorias, síntomas/anamnesis y turnos próximos
    queries.push(
        (async () => {
            let consultasData = [];
            let turnosProximosData = [];

            // Intentar primero endpoint en tiempo real de SALUS (sync-server)
            try {
                const params = new URLSearchParams();
                if (dni) params.append('dni', dni);
                if (nhc) params.append('nhc', nhc);
                if (telefono) params.append('telefono', telefono);
                if (nombre) params.append('nombre', nombre);

                const ctrl = new AbortController();
                const timeoutId = setTimeout(() => ctrl.abort(), 2800);

                const res = await fetch(`http://localhost:3456/api/salus/paciente-historial-clinico?${params.toString()}`, {
                    signal: ctrl.signal
                });
                clearTimeout(timeoutId);

                if (res.ok) {
                    const json = await res.json();
                    if (json.success) {
                        consultasData = json.consultas || [];
                        turnosProximosData = json.turnosProximos || [];
                    }
                }
            } catch (err) {
                // Fallback silencioso a base Supabase si sync-server no responde
            }

            // Si no obtuvimos consultas de SALUS, recurrir a Supabase consultas_guardia y cruzar con calidad_pacientes_diagnosticos
            if (consultasData.length === 0) {
                if (nhc) {
                    const { data: byNhc } = await supabase
                        .from('consultas_guardia')
                        .select('id_visita, paciente, cliente, visita_especialidad, agenda, tipo_visita, fecha_visita, hora_visita, asistencia, nhc, nif')
                        .eq('nhc', parseInt(nhc, 10))
                        .order('fecha_visita', { ascending: false })
                        .limit(30);
                    consultasData = byNhc || [];
                }
                if (consultasData.length === 0 && dni) {
                    const { data: byDni } = await supabase
                        .from('consultas_guardia')
                        .select('id_visita, paciente, cliente, visita_especialidad, agenda, tipo_visita, fecha_visita, hora_visita, asistencia, nhc, nif')
                        .eq('nif', dni)
                        .order('fecha_visita', { ascending: false })
                        .limit(30);
                    consultasData = byDni || [];
                }
                if (consultasData.length === 0 && nombre) {
                    const { data: byNom } = await supabase
                        .from('consultas_guardia')
                        .select('id_visita, paciente, cliente, visita_especialidad, agenda, tipo_visita, fecha_visita, hora_visita, asistencia, nhc, nif')
                        .ilike('paciente', `%${nombre.split(' ').slice(0, 2).join('%')}%`)
                        .order('fecha_visita', { ascending: false })
                        .limit(30);
                    consultasData = byNom || [];
                }

                // Cruzar con diagnósticos, síntomas y formularios médicos de calidad_pacientes_diagnosticos
                try {
                    let diagData = [];
                    const idVisitas = consultasData.map(c => c.id_visita).filter(Boolean);
                    if (idVisitas.length > 0) {
                        const { data: dVis } = await supabase
                            .from('calidad_pacientes_diagnosticos')
                            .select('id_visita, diagnostico, motivo, formulario, centro, nhc, dni')
                            .in('id_visita', idVisitas);
                        diagData = dVis || [];
                    }

                    if (diagData.length === 0 && (nhc || dni)) {
                        let qD = supabase.from('calidad_pacientes_diagnosticos').select('id_visita, diagnostico, motivo, formulario, centro, nhc, dni, fecha_visita');
                        if (nhc) qD = qD.eq('nhc', String(nhc));
                        else if (dni) qD = qD.eq('dni', String(dni));
                        const { data: dFallback } = await qD.limit(30);
                        diagData = dFallback || [];
                    }

                    const diagMap = new Map();
                    diagData.forEach(d => {
                        if (d.id_visita) diagMap.set(d.id_visita, d);
                    });

                    consultasData = consultasData.map(c => {
                        const d = diagMap.get(c.id_visita);
                        return {
                            ...c,
                            diagnostico: d?.diagnostico || null,
                            motivo: d?.motivo || null,
                            formulario: d?.formulario || null,
                            centro: d?.centro || c.centro || null
                        };
                    });
                } catch (eDiag) {
                    console.warn('[pacienteUnificado] error cruzando calidad_pacientes_diagnosticos:', eDiag);
                }
            }

            // Si no obtuvimos turnos próximos de SALUS, consultar contact_center_turnos_online en Supabase
            if (turnosProximosData.length === 0 && dni) {
                try {
                    const { data: turnosOnlineSb } = await supabase
                        .from('contact_center_turnos_online')
                        .select('*')
                        .eq('dni', dni);

                    if (turnosOnlineSb && turnosOnlineSb.length > 0) {
                        for (const row of turnosOnlineSb) {
                            if (Array.isArray(row.turnos)) {
                                for (const t of row.turnos) {
                                    turnosProximosData.push({
                                        id_visita: t.idVisita,
                                        fecha_visita: t.fechaTurno || t.fecha,
                                        hora_visita: t.horaInicioStr || t.horaInicio || '',
                                        agenda: t.agenda || row.agenda_nombre,
                                        medico: t.profesional || row.prestador_nombre,
                                        tipo_visita: 'Turno Web Online',
                                        asistencia: 'Reservado Online',
                                        cliente: 'Online Web',
                                        paciente: row.paciente_nombre,
                                        dni: row.dni,
                                        telefono: row.telefono,
                                        origen: 'online',
                                        tipo: 'online'
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.warn('[pacienteUnificado] error fallback turnos online:', e);
                }
            }

            return [
                { key: 'consultas', data: consultasData },
                { key: 'turnosProximos', data: turnosProximosData }
            ];
        })()
    );

    // 5. Laboratorios — por DNI
    queries.push(
        (async () => {
            let data = [];
            if (dni) {
                const { data: byDni } = await supabase
                    .from('laboratorios_anatomia_patologica')
                    .select('id, paciente, dni, cliente, fecha_visita, created_at')
                    .eq('dni', dni)
                    .order('fecha_visita', { ascending: false })
                    .limit(20);
                data = byDni || [];
            }
            return { key: 'laboratorios', data };
        })()
    );

    // 6. Presupuestos — por id_paciente o NHC
    queries.push(
        (async () => {
            let data = [];
            if (id_paciente) {
                const { data: byId } = await supabase
                    .from('presupuestos')
                    .select('id, paciente, fecha, importe_total, aceptado, nhc, created_at')
                    .eq('id_paciente', String(id_paciente))
                    .order('fecha', { ascending: false })
                    .limit(20);
                data = byId || [];
            }
            if (data.length === 0 && nhc) {
                const { data: byNhc } = await supabase
                    .from('presupuestos')
                    .select('id, paciente, fecha, importe_total, aceptado, nhc, created_at')
                    .eq('nhc', nhc)
                    .order('fecha', { ascending: false })
                    .limit(20);
                data = byNhc || [];
            }
            return { key: 'presupuestos', data };
        })()
    );

    // 7. Certificados de Libre Deuda — por DNI, NHC o nombre
    queries.push(
        (async () => {
            let data = [];
            if (dni) {
                const { data: byDni } = await supabase
                    .from('libre_de_deuda_certificados')
                    .select('*')
                    .eq('paciente_dni', dni)
                    .order('created_at', { ascending: false });
                data = byDni || [];
            }
            if (data.length === 0 && nhc) {
                const { data: byNhc } = await supabase
                    .from('libre_de_deuda_certificados')
                    .select('*')
                    .eq('nhc', nhc)
                    .order('created_at', { ascending: false });
                data = byNhc || [];
            }
            if (data.length === 0 && nombre) {
                const nombreStr = String(nombre);
                const { data: byName } = await supabase
                    .from('libre_de_deuda_certificados')
                    .select('*')
                    .ilike('paciente_nombre', `%${nombreStr.split(' ').slice(0, 2).join('%')}%`)
                    .order('created_at', { ascending: false });
                data = byName || [];
            }
            return { key: 'certificadosLibreDeuda', data };
        })()
    );

    // Execute all in parallel

    const results = await Promise.allSettled(queries);
    const detalle = {};
    for (const result of results) {
        if (result.status === 'fulfilled') {
            if (Array.isArray(result.value)) {
                for (const item of result.value) {
                    if (item && item.key) detalle[item.key] = item.data;
                }
            } else if (result.value && result.value.key) {
                detalle[result.value.key] = result.value.data;
            }
        } else {
            console.warn('[pacienteUnificado] query failed:', result.reason);
        }
    }

    return detalle;
}

// ─── Crear paciente manual ───
export async function createPaciente({ nombre, dni, edad, sexo, email, centro, nhc, telefono, notas }) {
    // Generar ID (max + 1) — hospital_pacientes usa INTEGER PK
    const { data: maxRow } = await supabase
        .from(TABLE)
        .select('id_paciente')
        .order('id_paciente', { ascending: false })
        .limit(1)
        .single();

    const nextId = (maxRow?.id_paciente || 0) + 1;

    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            id_paciente: nextId,
            nombre: nombre?.toUpperCase().trim(),
            dni: dni?.trim() || null,
            edad: edad || null,
            sexo: sexo || null,
            email: email?.trim() || null,
            centro: centro || null,
            nhc: nhc?.trim() || null,
            telefono: telefono?.trim() || null,
            notas: notas?.trim() || null,
            manual: true,
        })
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

// ─── Actualizar paciente ───
export async function updatePaciente(idPaciente, updates) {
    const allowed = ['telefono', 'email', 'nhc', 'notas', 'edad', 'sexo', 'centro'];
    const cleaned = {};
    for (const key of allowed) {
        if (key in updates) {
            cleaned[key] = updates[key]?.trim?.() || updates[key];
        }
    }
    cleaned.updated_at = new Date().toISOString();

    const { data, error } = await supabase
        .from(TABLE)
        .update(cleaned)
        .eq('id_paciente', idPaciente)
        .select()
        .single();

    if (error) throw new Error(error.message);
    return data;
}

// ─── Stats globales ───
export async function fetchPacienteStats() {
    const { count: totalPacientes } = await supabase
        .from(TABLE)
        .select('id_paciente', { count: 'exact', head: true });

    const { count: conTelefono } = await supabase
        .from(TABLE)
        .select('id_paciente', { count: 'exact', head: true })
        .not('telefono', 'is', null);

    const { count: manuales } = await supabase
        .from(TABLE)
        .select('id_paciente', { count: 'exact', head: true })
        .eq('manual', true);

    // Pacientes con deuda activa
    const { count: conDeuda } = await supabase
        .from('deudas_pacientes')
        .select('id', { count: 'exact', head: true })
        .gt('deuda_total', 0);

    return {
        totalPacientes: totalPacientes || 0,
        conTelefono: conTelefono || 0,
        manuales: manuales || 0,
        conDeuda: conDeuda || 0,
    };
}
