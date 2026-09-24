/**
 * pacienteUnificadoService.js — Vista 360° de pacientes
 * Consolida datos de 7+ tablas para una ficha unificada de cada paciente.
 * Usa hospital_pacientes como tabla maestra y cruza en tiempo real.
 */
import { supabase } from '../lib/supabase';
import { getSalusSyncBaseUrl } from './salusSync';

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

function getNameTokens(str) {
    if (!str || typeof str !== 'string') return [];
    return str
        .replace(/[,.\-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .split(' ')
        .filter(t => t.length >= 3);
}

// ─── Detalle 360° de un paciente ───
export async function fetchPacienteDetalle(paciente) {
    let { id_paciente, dni, nombre, nhc, telefono } = paciente;

    // Vinculación exclusiva por DNI o NHC: No resolver pacientes por teléfono para evitar confusiones de identidad


    // Queries paralelas a todas las tablas relacionadas
    const queries = [];

    // 1. Cirugías — por DNI estricto; si NO hay DNI, buscar por coincidencia de todos los tokens del nombre
    queries.push(
        (async () => {
            let data = [];
            const cleanDni = dni ? String(dni).replace(/\D/g, '') : '';
            if (cleanDni.length >= 6) {
                const { data: byDni } = await supabase
                    .from('surgeries')
                    .select('id, nombre, dni, telefono, obra_social, fecha_cirugia, medico, modulo, status, notas, created_at')
                    .eq('dni', cleanDni)
                    .order('fecha_cirugia', { ascending: false })
                    .limit(50);
                data = byDni || [];
            } else if (nombre) {
                // Solo si NO se cuenta con DNI, buscar requiriendo todos los tokens del nombre completo
                const tokens = getNameTokens(nombre);
                if (tokens.length >= 2) {
                    let q = supabase
                        .from('surgeries')
                        .select('id, nombre, dni, telefono, obra_social, fecha_cirugia, medico, modulo, status, notas, created_at');
                    tokens.forEach(tok => {
                        q = q.ilike('nombre', `%${tok}%`);
                    });
                    const { data: byName } = await q.order('fecha_cirugia', { ascending: false }).limit(50);
                    data = byName || [];
                }
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
                    .eq('nhc', String(nhc).trim())
                    .maybeSingle();
                data = byNhc;
            }
            // Si no hay NHC ni DNI, buscar por tokens estrictos de nombre
            if (!data && !dni && !nhc && nombre) {
                const tokens = getNameTokens(nombre);
                if (tokens.length >= 2) {
                    let q = supabase
                        .from('deudas_pacientes')
                        .select('id, nhc, nombre, telefono, categoria, deuda_total, cantidad_facturas, notas, ultimo_contacto_at, created_at');
                    tokens.forEach(tok => {
                        q = q.ilike('nombre', `%${tok}%`);
                    });
                    const { data: byName } = await q.limit(1).maybeSingle();
                    data = byName;
                }
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

    // 3. Altas administrativas / Internaciones — por id_paciente o tokens completos de nombre
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
                const tokens = getNameTokens(nombre);
                if (tokens.length >= 2) {
                    let q = supabase
                        .from('altas_administrativas')
                        .select('id, numero_admision, paciente, cliente, especialidad, doctor, fecha_ingreso, fecha_alta, estado, motivo_alta');
                    tokens.forEach(tok => {
                        q = q.ilike('paciente', `%${tok}%`);
                    });
                    const { data: byName } = await q.order('fecha_ingreso', { ascending: false }).limit(20);
                    data = byName || [];
                }
            }
            return { key: 'altas', data };
        })()
    );

    // 4. Consultas guardia, ambulatorias, síntomas/anamnesis y turnos próximos
    queries.push(
        (async () => {
            let consultasData = [];
            let turnosProximosData = [];

            // 4.1 Intentar primero endpoint en tiempo real de SALUS (sync-server) si está disponible en la red
            const syncBase = getSalusSyncBaseUrl();
            if (syncBase) {
                try {
                    const params = new URLSearchParams();
                    if (dni) params.append('dni', dni);
                    if (nhc) params.append('nhc', nhc);
                    if (telefono) params.append('telefono', telefono);
                    if (nombre) params.append('nombre', nombre);

                    const ctrl = new AbortController();
                    const timeoutId = setTimeout(() => ctrl.abort(), 3500);

                    const res = await fetch(`${syncBase}/api/salus/paciente-historial-clinico?${params.toString()}`, {
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
                    // Fallback silencioso a base Supabase para dispositivos en red o clientes remotos
                }
            }

            // 4.2 Si no obtuvimos consultas de SALUS vía sync-server (ej: clientes remotos o Vercel), recurrir a las tablas globales de Supabase
            if (consultasData.length === 0) {
                // A. Buscar en salus_visitas (historial unificado de consultas médicas en Supabase)
                try {
                    let qVis = supabase
                        .from('salus_visitas')
                        .select('id_visita, paciente, cliente, tipo_visita, especialidad, grupo_agenda, fecha_visita, hora_inicio, asistencia, nhc, nif, motivo_visita, responsable, centro, comentarios');

                    if (nhc && dni) {
                        qVis = qVis.or(`nhc.eq.${nhc},nif.eq.${dni}`);
                    } else if (nhc) {
                        qVis = qVis.eq('nhc', String(nhc));
                    } else if (dni) {
                        qVis = qVis.eq('nif', String(dni));
                    } else if (nombre) {
                        const tokens = getNameTokens(nombre);
                        if (tokens.length >= 2) {
                            tokens.forEach(tok => { qVis = qVis.ilike('paciente', `%${tok}%`); });
                        }
                    }

                    const { data: svVisitas } = await qVis.order('fecha_visita', { ascending: false }).limit(50);
                    if (svVisitas && svVisitas.length > 0) {
                        svVisitas.forEach(v => {
                            let diag = null;
                            let form = null;
                            let mot = v.motivo_visita || null;
                            if (v.comentarios) {
                                try {
                                    const parsed = JSON.parse(v.comentarios);
                                    diag = parsed.diagnostico || null;
                                    form = parsed.formulario || null;
                                    mot = parsed.motivo || mot;
                                } catch {
                                    diag = v.comentarios;
                                }
                            }
                            consultasData.push({
                                id_visita: v.id_visita,
                                fecha_visita: v.fecha_visita,
                                hora_visita: v.hora_inicio || '',
                                agenda: v.grupo_agenda || v.especialidad || 'Consulta Médica',
                                medico: v.responsable || 'Profesional Asignado',
                                tipo_visita: v.tipo_visita || 'Consulta Médica',
                                asistencia: v.asistencia || 'Presente',
                                cliente: v.cliente || 'Sanatorio Argentino',
                                centro: v.centro || 'Sanatorio Argentino',
                                paciente: v.paciente || nombre,
                                nhc: v.nhc,
                                diagnostico: diag,
                                motivo: mot,
                                formulario: form,
                                origen: 'salus_presencial'
                            });
                        });
                    }
                } catch (eSv) {
                    console.warn('[pacienteUnificado] error consultando salus_visitas en Supabase:', eSv);
                }

                // B. Consultar consultas_guardia
                try {
                    let cgData = [];
                    if (nhc) {
                        const { data: byNhc } = await supabase
                            .from('consultas_guardia')
                            .select('id_visita, paciente, cliente, visita_especialidad, agenda, tipo_visita, fecha_visita, hora_visita, asistencia, nhc, nif')
                            .eq('nhc', parseInt(nhc, 10))
                            .order('fecha_visita', { ascending: false })
                            .limit(30);
                        cgData = byNhc || [];
                    }
                    if (cgData.length === 0 && dni) {
                        const { data: byDni } = await supabase
                            .from('consultas_guardia')
                            .select('id_visita, paciente, cliente, visita_especialidad, agenda, tipo_visita, fecha_visita, hora_visita, asistencia, nhc, nif')
                            .eq('nif', dni)
                            .order('fecha_visita', { ascending: false })
                            .limit(30);
                        cgData = byDni || [];
                    }
                    if (cgData.length === 0 && !dni && !nhc && nombre) {
                        const tokens = getNameTokens(nombre);
                        if (tokens.length >= 2) {
                            let q = supabase
                                .from('consultas_guardia')
                                .select('id_visita, paciente, cliente, visita_especialidad, agenda, tipo_visita, fecha_visita, hora_visita, asistencia, nhc, nif');
                            tokens.forEach(tok => {
                                q = q.ilike('paciente', `%${tok}%`);
                            });
                            const { data: byNom } = await q.order('fecha_visita', { ascending: false }).limit(30);
                            cgData = byNom || [];
                        }
                    }

                    cgData.forEach(cg => {
                        if (!consultasData.some(c => String(c.id_visita) === String(cg.id_visita))) {
                            consultasData.push({
                                id_visita: cg.id_visita,
                                fecha_visita: cg.fecha_visita,
                                hora_visita: cg.hora_visita || '',
                                agenda: cg.agenda || cg.visita_especialidad || 'Guardia Médica',
                                medico: cg.medico || 'Médico de Guardia',
                                tipo_visita: cg.tipo_visita || 'Visita Guardia',
                                asistencia: cg.asistencia || 'Presente',
                                cliente: cg.cliente || 'Sanatorio Argentino',
                                centro: cg.centro || 'Sanatorio Argentino',
                                paciente: cg.paciente || nombre,
                                nhc: cg.nhc,
                                diagnostico: null,
                                motivo: null,
                                origen: 'guardia'
                            });
                        }
                    });
                } catch (eCg) {
                    console.warn('[pacienteUnificado] error consultando consultas_guardia:', eCg);
                }

                // C. Cruzar con diagnósticos, síntomas y formularios médicos de calidad_pacientes_diagnosticos
                try {
                    let diagData = [];
                    const idVisitas = consultasData.map(c => c.id_visita).filter(Boolean);
                    if (idVisitas.length > 0) {
                        const { data: dVis } = await supabase
                            .from('calidad_pacientes_diagnosticos')
                            .select('id_visita, diagnostico, motivo, formulario, centro, nhc, dni, fecha_visita')
                            .in('id_visita', idVisitas);
                        diagData = dVis || [];
                    }

                    if (nhc || dni) {
                        let qD = supabase.from('calidad_pacientes_diagnosticos').select('id_visita, diagnostico, motivo, formulario, centro, nhc, dni, fecha_visita');
                        if (nhc && dni) qD = qD.or(`nhc.eq.${nhc},dni.eq.${dni}`);
                        else if (nhc) qD = qD.eq('nhc', String(nhc));
                        else if (dni) qD = qD.eq('dni', String(dni));
                        const { data: dFallback } = await qD.limit(30);
                        if (dFallback && dFallback.length > 0) {
                            dFallback.forEach(df => {
                                if (!diagData.some(d => String(d.id_visita) === String(df.id_visita) && d.diagnostico === df.diagnostico)) {
                                    diagData.push(df);
                                }
                            });
                        }
                    }

                    const diagMap = new Map();
                    diagData.forEach(d => {
                        if (d.id_visita) diagMap.set(String(d.id_visita), d);
                    });

                    // Enriquecer las consultas existentes
                    consultasData = consultasData.map(c => {
                        const d = diagMap.get(String(c.id_visita));
                        return {
                            ...c,
                            diagnostico: d?.diagnostico || c.diagnostico || null,
                            motivo: d?.motivo || c.motivo || null,
                            formulario: d?.formulario || c.formulario || null,
                            centro: d?.centro || c.centro || null
                        };
                    });

                    // IMPORTANTE: Si calidad_pacientes_diagnosticos tiene registros clínicos que no estaban en consultasData, agregarlos
                    diagData.forEach(d => {
                        if (!consultasData.some(c => String(c.id_visita) === String(d.id_visita))) {
                            consultasData.push({
                                id_visita: d.id_visita,
                                fecha_visita: d.fecha_visita ? String(d.fecha_visita).split('T')[0] : 'Consulta Registrada',
                                hora_visita: '',
                                agenda: d.formulario || 'Consulta Médica',
                                medico: 'Profesional Sanatorio',
                                tipo_visita: d.formulario || 'Diagnóstico Clínico',
                                asistencia: 'Presente',
                                cliente: 'Sanatorio Argentino',
                                centro: d.centro || 'Sanatorio Argentino',
                                paciente: d.paciente || nombre,
                                nhc: d.nhc || nhc,
                                diagnostico: d.diagnostico,
                                motivo: d.motivo,
                                formulario: d.formulario,
                                origen: 'salus_presencial'
                            });
                        }
                    });
                } catch (eDiag) {
                    console.warn('[pacienteUnificado] error cruzando calidad_pacientes_diagnosticos:', eDiag);
                }
            }

            // Si no obtuvimos turnos próximos de SALUS, consultar turnos_activos_pacientes en Supabase
            if (turnosProximosData.length === 0 && (dni || telefono)) {
                try {
                    const todayIso = new Date().toISOString().split('T')[0];
                    let q = supabase
                        .from('turnos_activos_pacientes')
                        .select('*')
                        .gte('fecha', todayIso);

                    if (dni) {
                        const cleanDni = String(dni).replace(/\D/g, '');
                        q = q.eq('dni', cleanDni);
                    } else if (telefono) {
                        const cleanTel = String(telefono).replace(/\D/g, '').slice(-8);
                        q = q.or(`telefono.ilike.%${cleanTel}%,telefono2.ilike.%${cleanTel}%`);
                    }

                    const { data: turnosSb } = await q.order('fecha', { ascending: true }).limit(20);

                    if (turnosSb && turnosSb.length > 0) {
                        for (const row of turnosSb) {
                            turnosProximosData.push({
                                id_visita: row.id,
                                fecha_visita: row.fecha,
                                fecha_iso: row.fecha,
                                hora_visita: row.hora || '',
                                agenda: row.tipo_agenda || row.especialidad || 'Consulta Médica',
                                medico: row.medico || 'Profesional Asignado',
                                tipo_visita: row.tipo_visita || (row.origen === 'turno_online' ? 'Turno Web Online' : 'Consulta Médica'),
                                asistencia: row.asistencia || (row.origen === 'turno_online' ? 'Reservado Online' : 'Programado'),
                                cliente: row.obra_social || 'Particular / Prepaga',
                                paciente: row.paciente_nombre,
                                dni: row.dni,
                                telefono: row.telefono,
                                email: row.email,
                                motivo: row.motivo,
                                origen: row.origen === 'turno_online' ? 'online' : 'presencial',
                                tipo: row.origen === 'turno_online' ? 'online' : 'presencial'
                            });
                        }
                    }
                } catch (e) {
                    console.warn('[pacienteUnificado] error fallback turnos_activos_pacientes:', e);
                }

                // Fallback secundario a contact_center_turnos_online si sigue vacío
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
            if (data.length === 0 && !dni && !nhc && nombre) {
                const tokens = getNameTokens(nombre);
                if (tokens.length >= 2) {
                    let q = supabase.from('libre_de_deuda_certificados').select('*');
                    tokens.forEach(tok => {
                        q = q.ilike('paciente_nombre', `%${tok}%`);
                    });
                    const { data: byName } = await q.order('created_at', { ascending: false });
                    data = byName || [];
                }
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
