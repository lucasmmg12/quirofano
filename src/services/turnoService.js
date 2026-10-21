/**
 * turnoService.js â€” Servicio de gestiÃ³n de turnos / cola de atenciÃ³n
 * Maneja toda la lÃ³gica de negocio: crear turno, llamar, finalizar, mÃ©tricas
 */
import { supabase } from '../lib/supabase';

// â”€â”€â”€ ConfiguraciÃ³n â”€â”€â”€
export async function fetchTurnoConfig() {
    const { data, error } = await supabase
        .from('turnos_config')
        .select('*')
        .eq('activo', true)
        .order('id');
    if (error) throw error;
    return data || [];
}

// â”€â”€â”€ Crear Turno (desde Kiosco) â”€â”€â”€
export async function crearTurno(tipoTramite, dni = null) {
    // 1. Obtener prÃ³ximo nÃºmero via funciÃ³n PL/pgSQL
    const { data: numData, error: numErr } = await supabase
        .rpc('next_turno_number', { p_tipo: tipoTramite });
    if (numErr) throw numErr;
    const numeroTurno = numData;

    // 2. Obtener box disponible con balanceo inteligente
    const { getBoxBalanceado } = await import('./boxService');
    const boxAsignado = await getBoxBalanceado();
    // Si no hay boxes disponibles, el turno se crea sin box (admin asigna después)

    // 3. Buscar nombre del paciente si tiene DNI
    let nombrePaciente = null;
    if (dni && dni.trim()) {
        const { data: paciente } = await supabase
            .from('hospital_pacientes')
            .select('id_paciente, dni')
            .eq('dni', dni.trim())
            .limit(1)
            .single();
        // No importa si no lo encuentra, el DNI queda guardado
        if (paciente) {
            nombrePaciente = null; // hospital_pacientes no tiene nombre, podrÃ­a buscarse en surgeries
        }
    }

    // 4. Insertar en cola
    const { data: turno, error: insertErr } = await supabase
        .from('turnos_cola')
        .insert({
            numero_turno: numeroTurno,
            tipo_tramite: tipoTramite,
            dni: dni?.trim() || null,
            nombre_paciente: nombrePaciente,
            box_asignado: boxAsignado || 1,
            estado: 'esperando',
        })
        .select()
        .single();

    if (insertErr) throw insertErr;
    return turno;
}

// â”€â”€â”€ Cola de Espera (para el Admin) â”€â”€â”€
export async function fetchColaActiva(boxFilter = null) {
    let query = supabase
        .from('turnos_cola')
        .select('*')
        .in('estado', ['esperando', 'llamando', 'en_atencion'])
        .gte('created_at', getTodayStart())
        .order('created_at', { ascending: true });

    if (boxFilter) {
        query = query.eq('box_asignado', boxFilter);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
}

// â”€â”€â”€ Turnos atendidos hoy (para historial del dÃ­a) â”€â”€â”€
export async function fetchAtendidosHoy() {
    const { data, error } = await supabase
        .from('turnos_cola')
        .select('*')
        .eq('estado', 'atendido')
        .gte('created_at', getTodayStart())
        .order('finalizado_at', { ascending: false });

    if (error) throw error;
    return data || [];
}

// â”€â”€â”€ Llamar Turno â”€â”€â”€
export async function llamarTurno(turnoId, empleadoNombre = null, boxNumero = null) {
    const ahora = new Date().toISOString();
    const updateData = {
        estado: 'llamando',
        llamado_at: ahora,
    };
    if (empleadoNombre) updateData.atendido_por = empleadoNombre;
    if (boxNumero) updateData.box_asignado = boxNumero;
    const { error } = await supabase
        .from('turnos_cola')
        .update(updateData)
        .eq('id', turnoId);
    if (error) throw error;
}

// â”€â”€â”€ Iniciar AtenciÃ³n â”€â”€â”€
export async function iniciarAtencion(turnoId, empleadoNombre, boxNumero) {
    const ahora = new Date().toISOString();

    // Actualizar estado del turno + quiÃ©n atiende
    const { error: updateErr } = await supabase
        .from('turnos_cola')
        .update({ estado: 'en_atencion', atendido_por: empleadoNombre })
        .eq('id', turnoId);
    if (updateErr) throw updateErr;

    // Crear registro de atenciÃ³n
    const { data, error: insertErr } = await supabase
        .from('turnos_atencion')
        .insert({
            turno_id: turnoId,
            empleado_nombre: empleadoNombre,
            box_numero: boxNumero,
            hora_llamado: ahora,
            hora_inicio: ahora,
        })
        .select()
        .single();

    if (insertErr) throw insertErr;
    return data;
}

// ——— Devolver a Espera ———
export async function devolverAEspera(turnoId) {
    const ahora = new Date().toISOString();

    // Eliminar el registro de atención si existía (o cerrarlo con nota de error)
    await supabase
        .from('turnos_atencion')
        .update({
            hora_fin: ahora,
            notas: 'Devuelto a espera por error de llamado'
        })
        .eq('turno_id', turnoId)
        .is('hora_fin', null);

    // Actualizar estado del turno a esperando
    const { error } = await supabase
        .from('turnos_cola')
        .update({ estado: 'esperando', llamado_at: null })
        .eq('id', turnoId);

    if (error) throw error;
}

// ——— Finalizar AtenciÃ³n ———
export async function finalizarAtencion(turnoId, notas = null) {
    const ahora = new Date().toISOString();

    // Actualizar turno
    const { error: updateErr } = await supabase
        .from('turnos_cola')
        .update({
            estado: 'atendido',
            finalizado_at: ahora,
        })
        .eq('id', turnoId);
    if (updateErr) throw updateErr;

    // Actualizar registro de atenciÃ³n
    const { error: atencionErr } = await supabase
        .from('turnos_atencion')
        .update({
            hora_fin: ahora,
            notas: notas,
        })
        .eq('turno_id', turnoId)
        .is('hora_fin', null);  // Solo actualizar el registro abierto

    if (atencionErr) throw atencionErr;
}

// â”€â”€â”€ Cancelar Turno â”€â”€â”€
export async function cancelarTurno(turnoId, motivo = null, canceladoPor = null) {
    const { error } = await supabase
        .from('turnos_cola')
        .update({
            estado: 'cancelado',
            finalizado_at: new Date().toISOString(),
            motivo_cancelacion: motivo,
            cancelado_por: canceladoPor,
        })
        .eq('id', turnoId);
    if (error) throw error;
}

// â”€â”€â”€ Derivar a otro Box â”€â”€â”€
export async function derivarTurno(turnoId, nuevoBox) {
    const ahora = new Date().toISOString();

    // 1. Cerrar cualquier registro de atenciÃ³n abierto para este turno (si estaba en_atencion)
    await supabase
        .from('turnos_atencion')
        .update({
            hora_fin: ahora,
            notas: `Derivado a Box ${nuevoBox === 99 ? 'UCI' : nuevoBox}`,
        })
        .eq('turno_id', turnoId)
        .is('hora_fin', null);

    // 2. Actualizar el estado del turno
    const { error } = await supabase
        .from('turnos_cola')
        .update({ box_asignado: nuevoBox, estado: 'esperando', llamado_at: null })
        .eq('id', turnoId);
    if (error) throw error;
}

// â”€â”€â”€ Cambiar TrÃ¡mite de Turno â”€â”€â”€
export async function cambiarTramiteTurno(turnoId, nuevoTipoTramite) {
    const { error } = await supabase
        .from('turnos_cola')
        .update({ tipo_tramite: nuevoTipoTramite })
        .eq('id', turnoId);
    if (error) throw error;
}

// â”€â”€â”€ SuscripciÃ³n Realtime â”€â”€â”€
export function subscribeToCola(callback) {
    const channel = supabase
        .channel('turnos-realtime')
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'turnos_cola',
            },
            (payload) => {
                callback(payload);
            }
        )
        .subscribe();

    return () => {
        supabase.removeChannel(channel);
    };
}

// ——— Helper: Paginación para superar el límite de 1000 filas de PostgREST ———
async function fetchAllRows(tableName, filterFn) {
    const PAGE_SIZE = 1000;
    let all = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        let query = supabase
            .from(tableName)
            .select('*')
            .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);

        query = filterFn(query);
        const { data, error } = await query;
        if (error) {
            console.error(`Error fetching page ${page} from ${tableName}:`, error);
            throw error;
        }

        if (!data || data.length === 0) {
            hasMore = false;
        } else {
            all = all.concat(data);
            if (data.length < PAGE_SIZE) {
                hasMore = false;
            } else {
                page++;
            }
        }
    }
    return all;
}

// ——— Atendidos por Rango ———
export async function fetchAtendidosPorRango(inicioIso, finIso = null) {
    let query = supabase
        .from('turnos_cola')
        .select('*')
        .eq('estado', 'atendido')
        .gte('created_at', inicioIso)
        .order('finalizado_at', { ascending: false });

    if (finIso) {
        query = query.lte('created_at', finIso);
    }

    const { data, error } = await query.limit(500);
    if (error) {
        console.error('Error fetching atendidos por rango:', error);
        return [];
    }
    return data || [];
}

// ——— Métricas del día ———
export async function fetchMetricasHoy() {
    return fetchMetricasPorRango(getTodayStart());
}

// ─── Métricas por Rango de Fechas (Paginadas y Enriquecidas) ───
export async function fetchMetricasPorRango(inicioIso, finIso = null) {
    const [turnos, atenciones] = await Promise.all([
        fetchAllRows('turnos_cola', q => {
            let res = q.gte('created_at', inicioIso);
            if (finIso) res = res.lte('created_at', finIso);
            return res.order('created_at', { ascending: true });
        }),
        fetchAllRows('turnos_atencion', q => {
            let res = q.gte('created_at', inicioIso);
            if (finIso) res = res.lte('created_at', finIso);
            return res.order('created_at', { ascending: true });
        })
    ]);

    const total = turnos.length;
    const atendidos = turnos.filter(t => t.estado === 'atendido').length;
    const esperando = turnos.filter(t => t.estado === 'esperando').length;
    const enAtencion = turnos.filter(t => t.estado === 'en_atencion' || t.estado === 'llamando').length;
    const cancelados = turnos.filter(t => t.estado === 'cancelado').length;

    const tasaAtencion = total > 0 ? Math.round((atendidos / total) * 100) : 0;
    const tasaCancelacion = total > 0 ? Math.round((cancelados / total) * 100) : 0;

    // Tiempo promedio de atención (en minutos)
    const tiemposAtencion = atenciones
        .filter(a => a.hora_inicio && a.hora_fin)
        .map(a => (new Date(a.hora_fin) - new Date(a.hora_inicio)) / 60000)
        .filter(mins => mins >= 0 && mins < 240); // Descartar errores extremos (> 4h)

    const tiempoPromedio = tiemposAtencion.length > 0
        ? tiemposAtencion.reduce((s, t) => s + t, 0) / tiemposAtencion.length
        : 0;

    // Tiempos de espera reales (created_at -> llamado_at) para turnos atendidos
    const turnosConEspera = turnos
        .filter(t => t.estado === 'atendido' && t.llamado_at && t.created_at)
        .map(t => {
            const esperaMin = (new Date(t.llamado_at) - new Date(t.created_at)) / 60000;
            return {
                ...t,
                esperaMin: Math.max(0, esperaMin)
            };
        })
        .filter(t => t.esperaMin < 300); // Filtro de cordura sanitaria (< 5 horas)

    const tiemposEsperaValidos = turnosConEspera.map(t => t.esperaMin);
    const esperaPromedio = tiemposEsperaValidos.length > 0
        ? tiemposEsperaValidos.reduce((s, t) => s + t, 0) / tiemposEsperaValidos.length
        : 0;

    const esperaMax = tiemposEsperaValidos.length > 0
        ? Math.max(...tiemposEsperaValidos)
        : 0;

    // Mediana de espera
    let esperaMediana = 0;
    if (tiemposEsperaValidos.length > 0) {
        const sorted = [...tiemposEsperaValidos].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        esperaMediana = sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    // Cumplimiento SLA: <= 15m (Meta Sanatorio), 15-25m (Moderado), > 25m (Crítico)
    const slaRapido = tiemposEsperaValidos.filter(m => m <= 15).length;
    const slaModerado = tiemposEsperaValidos.filter(m => m > 15 && m <= 25).length;
    const slaCritico = tiemposEsperaValidos.filter(m => m > 25).length;
    const slaCumplimiento = tiemposEsperaValidos.length > 0
        ? Math.round((slaRapido / tiemposEsperaValidos.length) * 100)
        : 100;

    // Distribución por Hora del Día (07h a 20h)
    const porHoraMap = {};
    for (let h = 7; h <= 20; h++) {
        porHoraMap[h] = { hora: `${h}:00`, total: 0, atendidos: 0, esperaSuma: 0, esperaCount: 0 };
    }

    turnos.forEach(t => {
        const h = new Date(t.created_at).getHours();
        if (porHoraMap[h]) {
            porHoraMap[h].total++;
            if (t.estado === 'atendido') {
                porHoraMap[h].atendidos++;
            }
        }
    });

    turnosConEspera.forEach(t => {
        const h = new Date(t.created_at).getHours();
        if (porHoraMap[h]) {
            porHoraMap[h].esperaSuma += t.esperaMin;
            porHoraMap[h].esperaCount++;
        }
    });

    const porHora = Object.values(porHoraMap).map(item => ({
        hora: item.hora,
        total: item.total,
        atendidos: item.atendidos,
        esperaPromedio: item.esperaCount > 0 ? Math.round((item.esperaSuma / item.esperaCount) * 10) / 10 : 0
    }));

    // Por tipo de trámite
    const porTipo = {};
    turnos.forEach(t => {
        const tipo = t.tipo_tramite || 'GENERAL';
        if (!porTipo[tipo]) {
            porTipo[tipo] = { total: 0, atendidos: 0, cancelados: 0, esperaSuma: 0, esperaCount: 0 };
        }
        porTipo[tipo].total++;
        if (t.estado === 'atendido') porTipo[tipo].atendidos++;
        if (t.estado === 'cancelado') porTipo[tipo].cancelados++;
    });

    turnosConEspera.forEach(t => {
        const tipo = t.tipo_tramite || 'GENERAL';
        if (porTipo[tipo]) {
            porTipo[tipo].esperaSuma += t.esperaMin;
            porTipo[tipo].esperaCount++;
        }
    });

    Object.keys(porTipo).forEach(tipo => {
        porTipo[tipo].esperaPromedio = porTipo[tipo].esperaCount > 0
            ? Math.round((porTipo[tipo].esperaSuma / porTipo[tipo].esperaCount) * 10) / 10
            : 0;
    });

    // Por empleado / operador
    const porEmpleado = {};
    atenciones.filter(a => a.hora_fin).forEach(a => {
        const nombre = a.empleado_nombre || 'Sin Asignar';
        if (!porEmpleado[nombre]) {
            porEmpleado[nombre] = { cantidad: 0, tiempoTotal: 0 };
        }
        porEmpleado[nombre].cantidad++;
        if (a.hora_inicio && a.hora_fin) {
            porEmpleado[nombre].tiempoTotal += (new Date(a.hora_fin) - new Date(a.hora_inicio)) / 60000;
        }
    });

    Object.keys(porEmpleado).forEach(nombre => {
        const emp = porEmpleado[nombre];
        emp.tiempoPromedio = emp.cantidad > 0 ? Math.round((emp.tiempoTotal / emp.cantidad) * 10) / 10 : 0;
    });

    return {
        total,
        atendidos,
        esperando,
        enAtencion,
        cancelados,
        tasaAtencion,
        tasaCancelacion,
        tiempoPromedio: Math.round(tiempoPromedio * 10) / 10,
        esperaPromedio: Math.round(esperaPromedio * 10) / 10,
        esperaMax: Math.round(esperaMax * 10) / 10,
        esperaMediana: Math.round(esperaMediana * 10) / 10,
        sla: {
            cumplimiento: slaCumplimiento,
            rapido: slaRapido,
            moderado: slaModerado,
            critico: slaCritico
        },
        porHora,
        porTipo,
        porEmpleado,
        turnosRaw: turnos,
        atencionesRaw: atenciones
    };
}

// ——— Helper ———
function getTodayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

export async function fetchTurnosHistoricos(dias = 30) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dias);
    fecha.setHours(0, 0, 0, 0);
    return fetchAllRows('turnos_cola', q => q.gte('created_at', fecha.toISOString()).order('created_at', { ascending: true }));
}
