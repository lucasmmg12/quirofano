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

// â”€â”€â”€ MÃ©tricas del dÃ­a â”€â”€â”€
export async function fetchMetricasHoy() {
    return fetchMetricasPorRango(getTodayStart());
}

// ─── Métricas por Rango de Fechas ───
export async function fetchMetricasPorRango(inicioIso, finIso = null) {
    let qTurnos = supabase.from('turnos_cola').select('*').gte('created_at', inicioIso);
    let qAtenciones = supabase.from('turnos_atencion').select('*').gte('created_at', inicioIso);

    if (finIso) {
        qTurnos = qTurnos.lte('created_at', finIso);
        qAtenciones = qAtenciones.lte('created_at', finIso);
    }

    const { data: turnos } = await qTurnos;
    const { data: atenciones } = await qAtenciones;

    const total = turnos?.length || 0;
    const atendidos = turnos?.filter(t => t.estado === 'atendido').length || 0;
    const esperando = turnos?.filter(t => t.estado === 'esperando').length || 0;
    const enAtencion = turnos?.filter(t => t.estado === 'en_atencion' || t.estado === 'llamando').length || 0;

    // Tiempo promedio de atenciÃ³n (en minutos)
    const tiemposAtencion = (atenciones || [])
        .filter(a => a.hora_inicio && a.hora_fin)
        .map(a => (new Date(a.hora_fin) - new Date(a.hora_inicio)) / 60000);
    const tiempoPromedio = tiemposAtencion.length > 0
        ? tiemposAtencion.reduce((s, t) => s + t, 0) / tiemposAtencion.length
        : 0;

    // Tiempo promedio de espera (created_at -> llamado_at), ignorando outliers > 45 min
    const tiemposEspera = (turnos || [])
        .filter(t => t.estado === 'atendido' && t.llamado_at)
        .map(t => (new Date(t.llamado_at) - new Date(t.created_at)) / 60000)
        .filter(mins => mins <= 45);
    const esperaPromedio = tiemposEspera.length > 0
        ? tiemposEspera.reduce((s, t) => s + t, 0) / tiemposEspera.length
        : 0;

    // Por tipo de trámite
    const porTipo = {};
    (turnos || []).forEach(t => {
        if (!porTipo[t.tipo_tramite]) porTipo[t.tipo_tramite] = { total: 0, atendidos: 0 };
        porTipo[t.tipo_tramite].total++;
        if (t.estado === 'atendido') porTipo[t.tipo_tramite].atendidos++;
    });

    // Por empleado
    const porEmpleado = {};
    (atenciones || []).filter(a => a.hora_fin).forEach(a => {
        if (!porEmpleado[a.empleado_nombre]) {
            porEmpleado[a.empleado_nombre] = { cantidad: 0, tiempoTotal: 0 };
        }
        porEmpleado[a.empleado_nombre].cantidad++;
        if (a.hora_inicio && a.hora_fin) {
            porEmpleado[a.empleado_nombre].tiempoTotal +=
                (new Date(a.hora_fin) - new Date(a.hora_inicio)) / 60000;
        }
    });

    return {
        total,
        atendidos,
        esperando,
        enAtencion,
        tiempoPromedio: Math.round(tiempoPromedio * 10) / 10,
        esperaPromedio: Math.round(esperaPromedio * 10) / 10,
        porTipo,
        porEmpleado,
        turnosRaw: turnos || [],
        atencionesRaw: atenciones || []
    };
}

// â”€â”€â”€ Helper â”€â”€â”€
function getTodayStart() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.toISOString();
}

export async function fetchTurnosHistoricos(dias = 30) {
    const fecha = new Date();
    fecha.setDate(fecha.getDate() - dias);
    fecha.setHours(0,0,0,0);
    const { data } = await supabase.from('turnos_cola').select('created_at').gte('created_at', fecha.toISOString());
    return data || [];
}
