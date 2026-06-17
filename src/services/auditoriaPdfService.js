/**
 * Servicio de datos para el módulo Auditoría HC por PDF.
 * Consume las tablas hc_auditorias y hc_errores_medicos en Supabase.
 */
import { supabase, supabaseUrl, supabaseAnonKey } from '../lib/supabase';

// ═══════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════
export async function obtenerDatosDashboard() {
    const { data: auditorias, error: errorAuditorias } = await supabase.from('hc_auditorias').select('*');
    const { data: erroresMedicos, error: errorErrores } = await supabase.from('hc_errores_medicos').select('*');

    if (errorAuditorias) console.error('Dashboard: Error en hc_auditorias:', errorAuditorias);
    if (errorErrores) console.error('Dashboard: Error en hc_errores_medicos:', errorErrores);

    const auditoriasSeguras = auditorias || [];
    const erroresSeguros = erroresMedicos || [];

    // Errores por Etapa
    const erroresPorEtapa = [
        { etapa: 'Admisión', cantidad: auditoriasSeguras.reduce((s, a) => s + (Number(a.errores_admision) || 0), 0) },
        { etapa: 'Evoluciones', cantidad: auditoriasSeguras.reduce((s, a) => s + (Number(a.errores_evoluciones) || 0), 0) },
        { etapa: 'Foja Quir.', cantidad: auditoriasSeguras.reduce((s, a) => s + (Number(a.errores_foja_quirurgica) || 0), 0) },
        { etapa: 'Epicrisis', cantidad: auditoriasSeguras.reduce((s, a) => s + (Number(a.errores_epicrisis) || 0), 0) },
        { etapa: 'Alta Médica', cantidad: auditoriasSeguras.reduce((s, a) => s + (Number(a.errores_alta_medica || a.errores_alta || 0) || 0), 0) },
    ];

    // Severidad
    const severidadMap = {};
    erroresSeguros.forEach(e => {
        const sev = (e.severidad || 'No definida').toUpperCase();
        severidadMap[sev] = (severidadMap[sev] || 0) + 1;
    });
    const erroresPorSeveridad = Object.entries(severidadMap).map(([severidad, cantidad]) => ({ severidad, cantidad }));

    // Top Errores
    const tiposMap = {};
    erroresSeguros.forEach(e => {
        const tipo = e.tipo_error || 'Otro';
        tiposMap[tipo] = (tiposMap[tipo] || 0) + 1;
    });
    const topErrores = Object.entries(tiposMap)
        .map(([tipo, cantidad]) => ({ tipo, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 10);

    // Ranking Médicos
    const medicosMap = {};
    erroresSeguros.forEach(e => {
        const nombre = e.nombre_medico || 'Desconocido';
        medicosMap[nombre] = (medicosMap[nombre] || 0) + 1;
    });
    const rankingMedicos = Object.entries(medicosMap)
        .map(([nombre, errores]) => ({ nombre, errores }))
        .sort((a, b) => b.errores - a.errores)
        .slice(0, 10);

    // Errores por Rol
    const rolesMap = {};
    erroresSeguros.forEach(e => {
        const rol = e.rol_medico || 'Otro';
        rolesMap[rol] = (rolesMap[rol] || 0) + 1;
    });
    const erroresPorRol = Object.entries(rolesMap).map(([rol, cantidad]) => ({ rol, cantidad }));

    // Auditorias por Fecha
    const fechasMap = {};
    auditoriasSeguras.forEach(a => {
        const dateVal = a.created_at || a.fecha_auditoria;
        if (!dateVal) return;
        try {
            const dateObj = new Date(dateVal);
            if (isNaN(dateObj.getTime())) return;
            const fecha = dateObj.toLocaleDateString('es-AR');
            fechasMap[fecha] = (fechasMap[fecha] || 0) + 1;
        } catch { /* ignore */ }
    });
    const auditoriasPorFecha = Object.entries(fechasMap)
        .map(([fecha, cantidad]) => ({ fecha, cantidad }))
        .sort((a, b) => {
            const [da, ma, ya] = a.fecha.split('/');
            const [db, mb, yb] = b.fecha.split('/');
            return new Date(parseInt(ya), parseInt(ma) - 1, parseInt(da)).getTime() -
                   new Date(parseInt(yb), parseInt(mb) - 1, parseInt(db)).getTime();
        });

    // Distribución Obra Social
    const osMap = {};
    auditoriasSeguras.forEach(a => {
        const os = a.obra_social || 'Desconocida';
        osMap[os] = (osMap[os] || 0) + 1;
    });
    const distribucionObraSocial = Object.entries(osMap)
        .map(([nombre, cantidad]) => ({ nombre, cantidad }))
        .sort((a, b) => b.cantidad - a.cantidad)
        .slice(0, 15);

    // Uso Bisturí Armónico
    const bisturiMap = { 'SI': 0, 'NO': 0, 'No determinado': 0 };
    auditoriasSeguras.forEach(a => {
        let val = String(a.bisturi_armonico || 'No determinado').toUpperCase();
        if (val === 'SÍ') val = 'SI';
        if (bisturiMap.hasOwnProperty(val)) bisturiMap[val]++;
        else bisturiMap['No determinado']++;
    });
    const usoBisturi = Object.entries(bisturiMap).map(([tipo, cantidad]) => ({ tipo, cantidad }));

    return {
        erroresPorEtapa,
        erroresPorSeveridad,
        topErrores,
        rankingMedicos,
        erroresPorRol,
        auditoriasPorFecha,
        distribucionObraSocial,
        usoBisturi,
        totalAuditorias: auditoriasSeguras.length,
    };
}

// ═══════════════════════════════════════════════════
// HISTORIAL
// ═══════════════════════════════════════════════════
export async function obtenerHistorialAuditorias(filtros = {}, page = 1, pageSize = 10) {
    try {
        let query = supabase
            .from('hc_auditorias')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (filtros.nombrePaciente) query = query.ilike('nombre_paciente', `%${filtros.nombrePaciente}%`);
        if (filtros.dni) query = query.ilike('dni_paciente', `%${filtros.dni}%`);
        if (filtros.fechaDesde) query = query.gte('created_at', filtros.fechaDesde);
        if (filtros.fechaHasta) query = query.lte('created_at', filtros.fechaHasta);
        if (filtros.estado) query = query.eq('estado', filtros.estado);
        if (filtros.bisturiArmonico) query = query.eq('bisturi_armonico', filtros.bisturiArmonico);

        const start = (page - 1) * pageSize;
        query = query.range(start, start + pageSize - 1);

        const { data, error, count } = await query;
        if (error) {
            console.error('Error fetching hc_auditorias:', error);
            return { data: [], count: 0 };
        }
        return { data: data || [], count: count || 0 };
    } catch (error) {
        console.error('Error in obtenerHistorialAuditorias:', error);
        return { data: [], count: 0 };
    }
}

export async function obtenerEstadisticasHistorial() {
    try {
        const { data, error } = await supabase.from('hc_auditorias').select('estado, total_errores');
        if (error) return { totalAuditorias: 0, auditoriasPendientes: 0, auditoriasAprobadas: 0, totalErrores: 0 };

        return {
            totalAuditorias: data.length,
            auditoriasPendientes: data.filter(a => a.estado === 'Pendiente de corrección' || a.estado === 'En Revisión').length,
            auditoriasAprobadas: data.filter(a => a.estado === 'Aprobado').length,
            totalErrores: data.reduce((sum, a) => sum + (a.total_errores || 0), 0),
        };
    } catch {
        return { totalAuditorias: 0, auditoriasPendientes: 0, auditoriasAprobadas: 0, totalErrores: 0 };
    }
}

// ═══════════════════════════════════════════════════
// AUDITAR PDF (Edge Function)
// ═══════════════════════════════════════════════════
export async function enviarAuditoriaPDF(pdfText, nombreArchivo) {
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/auditar-hc-pdf`;

    const formData = new FormData();
    formData.append('pdfText', pdfText);
    formData.append('nombreArchivo', nombreArchivo);

    const response = await fetch(edgeFunctionUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${supabaseAnonKey}` },
        body: formData,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error al procesar el PDF: ${errorText}`);
    }

    const data = await response.json();
    if (!data.success || !data.resultado) {
        throw new Error(data.error || 'Error desconocido al procesar el PDF');
    }

    return data;
}
