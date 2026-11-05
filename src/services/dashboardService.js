/**
 * dashboardService.js — KPIs en vivo y Copiloto Personal de Actividad para el HomePanel
 * Queries livianas a Supabase para el HomePanel
 */
import { supabase } from '../lib/supabase';

const SURGERY_STATUS_NAMES = {
    lila: 'Sin mensaje (Lila)',
    rosado: 'Doc. recibida (Rosado)',
    amarillo: 'En revisión (Amarillo)',
    verde: 'Autorizada (Verde)',
    azul: 'Confirmada (Azul)',
    rojo: 'Con problema (Rojo)',
    precaucion: 'Precaución',
    fertilidad: 'Fertilidad',
    realizada: 'Realizada',
    suspendida: 'Suspendida',
};

function formatStatusTransition(raw) {
    if (!raw) return 'Actualización de estado';
    const str = String(raw).trim();
    const toMatch = str.match(/^(?:null|[\w_]+)\s+to\s+([\w_]+)$/i);
    if (toMatch) {
        const target = toMatch[1].toLowerCase();
        const label = SURGERY_STATUS_NAMES[target] || target;
        return `Actualizó estado de cirugía a "${label}"`;
    }
    return str.replace(/_/g, ' ');
}

/**
 * Genera variantes del nombre del usuario para cruzar contra tablas operativas
 * Ej: { usuario: 'gcortez', nombre: 'Gisel Cortez' } -> ['Gisel Cortez', 'gcortez', 'G. Cortez', 'Cortez']
 */
function buildUserNameVariants(currentUser) {
    if (!currentUser) return [];
    const variants = new Set();
    const u = (currentUser.usuario || '').trim();
    const n = (currentUser.nombre || '').trim();
    if (u) {
        variants.add(u);
        variants.add(u.split('@')[0]);
    }
    if (n) {
        variants.add(n);
        const parts = n.split(/\s+/).filter(Boolean);
        if (parts.length >= 2) {
            const firstInitial = parts[0][0].toUpperCase();
            const lastName = parts[parts.length - 1];
            variants.add(`${firstInitial}. ${lastName}`);
            variants.add(`${firstInitial}.${lastName}`);
            variants.add(lastName);
        }
    }
    return [...variants].filter(Boolean);
}

/**
 * Obtiene KPIs operativos para el dashboard home.
 * Cada query es independiente — si una falla, las demás siguen.
 */
export async function fetchDashboardKPIs() {
    const today = new Date().toISOString().split('T')[0];
    const results = {
        cirugias_hoy: 0,
        cirugias_sin_confirmar: 0,
        cirugias_semana: 0,
        mensajes_sin_leer: 0,
        deudores_activos: 0,
        deuda_total: 0,
        altas_pendientes: 0,
        turnos_espera: 0,
    };

    // --- Cirugías hoy ---
    try {
        const { count } = await supabase
            .from('surgeries')
            .select('id', { count: 'exact', head: true })
            .eq('fecha_cirugia', today);
        results.cirugias_hoy = count || 0;
    } catch (e) { console.warn('[dashboard] cirugias_hoy error:', e.message); }

    // --- Cirugías sin confirmar (próximas 7 días, estado != azul/rojo/realizada) ---
    try {
        const weekLater = new Date();
        weekLater.setDate(weekLater.getDate() + 7);
        const { count } = await supabase
            .from('surgeries')
            .select('id', { count: 'exact', head: true })
            .gte('fecha_cirugia', today)
            .lte('fecha_cirugia', weekLater.toISOString().split('T')[0])
            .not('status', 'in', '("azul","rojo","realizada","suspendida")');
        results.cirugias_sin_confirmar = count || 0;
    } catch (e) { console.warn('[dashboard] cirugias_sin_confirmar error:', e.message); }

    // --- Cirugías semana ---
    try {
        const weekLater = new Date();
        weekLater.setDate(weekLater.getDate() + 7);
        const { count } = await supabase
            .from('surgeries')
            .select('id', { count: 'exact', head: true })
            .gte('fecha_cirugia', today)
            .lte('fecha_cirugia', weekLater.toISOString().split('T')[0]);
        results.cirugias_semana = count || 0;
    } catch (e) { console.warn('[dashboard] cirugias_semana error:', e.message); }

    // --- Mensajes sin leer ---
    try {
        const { count } = await supabase
            .from('whatsapp_messages')
            .select('id', { count: 'exact', head: true })
            .eq('direction', 'incoming')
            .eq('is_read', false);
        results.mensajes_sin_leer = count || 0;
    } catch (e) { console.warn('[dashboard] mensajes_sin_leer error:', e.message); }

    // --- Deudores activos + deuda total ---
    try {
        const { data } = await supabase
            .from('deudas_pacientes')
            .select('deuda_total')
            .gte('deuda_total', 50000)
            .not('categoria', 'in', '("deuda_cancelada","descuento_liquidacion")');
        if (data) {
            results.deudores_activos = data.length;
            results.deuda_total = data.reduce((s, d) => s + Number(d.deuda_total), 0);
        }
    } catch (e) { console.warn('[dashboard] deudores error:', e.message); }

    // --- Altas pendientes (no finalizadas) ---
    try {
        const { count } = await supabase
            .from('altas_administrativas')
            .select('id', { count: 'exact', head: true })
            .in('estado', ['Procesada', 'En auditoria', 'Prórroga']);
        results.altas_pendientes = count || 0;
    } catch (e) { console.warn('[dashboard] altas_pendientes error:', e.message); }

    return results;
}

/**
 * Obtiene actividad reciente del sistema (últimos 10 eventos legibles)
 */
export async function fetchRecentActivity() {
    try {
        const [auditRes, deudasSegRes, surgEvtRes] = await Promise.all([
            supabase
                .from('audit_log')
                .select('id, usuario, nombre, accion, detalle, created_at')
                .neq('accion', 'apertura_sistema')
                .order('created_at', { ascending: false })
                .limit(8),
            supabase
                .from('deudas_seguimiento')
                .select('id, paciente_id, tipo, descripcion, usuario, created_at, paciente:deudas_pacientes(nombre)')
                .order('created_at', { ascending: false })
                .limit(6),
            supabase
                .from('surgery_events')
                .select('id, surgery_id, event_type, details, created_at, performed_by')
                .order('created_at', { ascending: false })
                .limit(6),
        ]);

        const combined = [];

        for (const a of (auditRes.data || [])) {
            const label = a.detalle?.label || a.accion?.replace(/_/g, ' ');
            combined.push({
                id: 'aud_' + a.id,
                user_name: a.nombre || a.usuario || 'Usuario',
                description: label,
                module_id: a.detalle?.modulo || null,
                created_at: a.created_at,
            });
        }

        for (const s of (deudasSegRes.data || [])) {
            const pacName = s.paciente?.nombre || 'Paciente';
            combined.push({
                id: 'seg_' + s.id,
                user_name: s.usuario || 'Operador',
                description: `Deudas (${pacName}): ${s.descripcion?.slice(0, 75) || s.tipo}`,
                module_id: 'deudas',
                created_at: s.created_at,
            });
        }

        for (const e of (surgEvtRes.data || [])) {
            combined.push({
                id: 'surg_' + e.id,
                user_name: e.performed_by || 'Quirófano',
                description: formatStatusTransition(e.event_type || e.details),
                module_id: 'cirugias',
                created_at: e.created_at,
            });
        }

        combined.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
        return combined.slice(0, 10);
    } catch (e) {
        console.warn('[dashboard] recent activity error:', e.message);
        return [];
    }
}

/**
 * Obtiene cirugías urgentes (próximas 48h sin confirmar)
 */
export async function fetchUrgentSurgeries() {
    try {
        const now = new Date();
        const in48h = new Date();
        in48h.setHours(in48h.getHours() + 48);
        const { data } = await supabase
            .from('surgeries')
            .select('id, nombre, fecha_cirugia, medico, status, telefono')
            .gte('fecha_cirugia', now.toISOString().split('T')[0])
            .lte('fecha_cirugia', in48h.toISOString().split('T')[0])
            .not('status', 'in', '("azul","realizada","suspendida")')
            .order('fecha_cirugia', { ascending: true })
            .limit(5);
        return data || [];
    } catch (e) {
        console.warn('[dashboard] urgent surgeries error:', e.message);
        return [];
    }
}

/**
 * Copiloto Personal del Usuario:
 * Analiza los módulos visitados por el usuario, extracciones/consultas realizadas,
 * y los últimos pacientes en los que estuvo trabajando (Deudas, Altas, Cirugías)
 * para indicarle si dejó todo al día o si le quedó algo pendiente por cerrar/extraer.
 */
export async function fetchUserPersonalCopilot(currentUser) {
    if (!currentUser?.usuario) return null;

    const username = currentUser.usuario.trim();
    const nameVariants = buildUserNameVariants(currentUser);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    try {
        // 1. Módulos visitados recientemente por este usuario + logs de auditoría/extracción
        const [modulesRes, auditRes, deudasSegRes, altasRes] = await Promise.all([
            supabase
                .from('user_module_usage')
                .select('id, module_id, module_label, entered_at, left_at, duration_seconds')
                .eq('usuario', username)
                .neq('module_id', 'inicio')
                .order('entered_at', { ascending: false })
                .limit(25),
            supabase
                .from('audit_log')
                .select('id, accion, detalle, created_at')
                .eq('usuario', username)
                .order('created_at', { ascending: false })
                .limit(20),
            supabase
                .from('deudas_seguimiento')
                .select('id, paciente_id, tipo, descripcion, monto, usuario, created_at, paciente:deudas_pacientes(id, nombre, nhc, categoria, deuda_total, ultimo_contacto_at, ultima_respuesta_at)')
                .order('created_at', { ascending: false })
                .limit(60),
            supabase
                .from('altas_administrativas')
                .select('numero_admision, paciente, estado, operador, responsable_override, control_adm_finalizado, observaciones, fecha_ingreso, fecha_alta, created_at')
                .order('fecha_ingreso', { ascending: false })
                .limit(120),
        ]);

        const moduleHistory = modulesRes.data || [];
        const auditHistory = auditRes.data || [];

        // Último módulo real en el que estuvo trabajando
        const lastModuleVisit = moduleHistory[0] || null;

        // Calcular tiempo activo hoy y módulos más usados
        let minutosActivoHoy = 0;
        const modulosResumenMap = new Map();
        for (const m of moduleHistory) {
            const dur = Number(m.duration_seconds) || 45;
            if (m.entered_at && new Date(m.entered_at) >= todayStart) {
                minutosActivoHoy += Math.max(1, Math.round(dur / 60));
            }
            const prev = modulosResumenMap.get(m.module_id) || {
                module_id: m.module_id,
                module_label: m.module_label || m.module_id,
                visitas: 0,
                segundos: 0,
                last_at: m.entered_at,
            };
            prev.visitas += 1;
            prev.segundos += dur;
            modulosResumenMap.set(m.module_id, prev);
        }

        // Verificar si en su última consulta extrajo/descargó información o si solo consultó
        const exportEvents = auditHistory.filter(a =>
            a.accion === 'dlp_exportacion' || a.accion === 'dlp_impresion' || a.accion === 'dlp_copia_texto'
        );
        const lastExport = exportEvents[0] || null;

        let consultaInsight = null;
        if (lastModuleVisit) {
            const modLabel = lastModuleVisit.module_label || lastModuleVisit.module_id;
            const minsInLastMod = Math.max(1, Math.round((Number(lastModuleVisit.duration_seconds) || 60) / 60));
            const exportedDuringOrAfterLastVisit = lastExport &&
                new Date(lastExport.created_at) >= new Date(new Date(lastModuleVisit.entered_at).getTime() - 10 * 60 * 1000);

            if (exportedDuringOrAfterLastVisit) {
                consultaInsight = {
                    status: 'extracted',
                    title: `Extracción completada en ${modLabel}`,
                    description: `En tu consulta reciente pudiste extraer la información (${lastExport.detalle?.boton || lastExport.detalle?.label || 'Reporte descargado'}).`,
                    module_id: lastModuleVisit.module_id,
                    module_label: modLabel,
                    timestamp: lastExport.created_at,
                };
            } else {
                consultaInsight = {
                    status: 'consulting',
                    title: `Estuviste consultando ${modLabel}`,
                    description: `Pasaste ~${minsInLastMod} min en ${modLabel} sin descargar ni exportar reportes. ¿Pudiste obtener el dato que buscabas o querés retomar donde dejaste?`,
                    module_id: lastModuleVisit.module_id,
                    module_label: modLabel,
                    timestamp: lastModuleVisit.entered_at,
                };
            }
        }

        // 2. Filtrar los últimos pacientes que gestionó este usuario y diagnosticar si quedaron "Al día"
        const misPacientesRecientes = [];
        const seenPacientes = new Set();

        const matchesCurrentUser = (str) => {
            if (!str) return false;
            const sLower = String(str).toLowerCase().trim();
            return nameVariants.some(v => {
                const vLower = v.toLowerCase().trim();
                return vLower.length >= 3 && (sLower === vLower || sLower.includes(vLower));
            });
        };

        // 2a. Pacientes de Deudas gestionados por el usuario
        for (const seg of (deudasSegRes.data || [])) {
            if (!matchesCurrentUser(seg.usuario)) continue;
            const pac = seg.paciente;
            if (!pac || seenPacientes.has('deuda_' + pac.id)) continue;
            seenPacientes.add('deuda_' + pac.id);

            const respondioDespues = pac.ultima_respuesta_at && new Date(pac.ultima_respuesta_at) > new Date(seg.created_at);
            const estaCancelada = pac.categoria === 'deuda_cancelada';
            const estaComprometido = pac.categoria === 'comprometido' || pac.categoria === 'descuento_liquidacion';

            let alDia = true;
            let estadoTexto = '';
            let badgeLabel = '';

            if (estaCancelada) {
                alDia = true;
                badgeLabel = '✓ Todo al día';
                estadoTexto = `Deuda cancelada al 100%. Tu última acción: "${seg.descripcion?.slice(0, 65) || seg.tipo}"`;
            } else if (respondioDespues) {
                alDia = false;
                badgeLabel = '💬 Respondió WhatsApp';
                estadoTexto = `El paciente respondió por WhatsApp después de tu último seguimiento. Revisá su mensaje para cerrar la gestión.`;
            } else if (estaComprometido) {
                alDia = true;
                badgeLabel = '✓ Compromiso al día';
                estadoTexto = `Quedó en estado Comprometido / Plan vigente (Saldo: $${Number(pac.deuda_total || 0).toLocaleString('es-AR')}).`;
            } else {
                alDia = false;
                badgeLabel = '⏳ En seguimiento';
                estadoTexto = `Sigue en gestión activa con saldo de $${Number(pac.deuda_total || 0).toLocaleString('es-AR')}. Última nota: "${seg.descripcion?.slice(0, 55) || ''}"`;
            }

            misPacientesRecientes.push({
                id: 'deuda_' + pac.id,
                paciente: pac.nombre,
                identificador: pac.nhc ? `NHC ${pac.nhc}` : 'Deudas',
                modulo: 'deudas',
                moduloLabel: 'Gestión de Deudas',
                fechaAccion: seg.created_at,
                alDia,
                badgeLabel,
                estadoTexto,
            });
        }

        // 2b. Pacientes de Altas Administrativas asignados / operados por el usuario
        for (const alta of (altasRes.data || [])) {
            const resp = alta.responsable_override || alta.operador;
            if (!matchesCurrentUser(resp)) continue;
            const key = 'alta_' + alta.numero_admision;
            if (seenPacientes.has(key)) continue;
            seenPacientes.add(key);

            const finalizado = Boolean(alta.control_adm_finalizado) || alta.estado === 'Finalizada' || alta.estado === 'Facturada';
            const alDia = finalizado;
            const badgeLabel = finalizado ? '✓ Control al día' : `⚠️ Pendiente (${alta.estado || 'Abierta'})`;
            const estadoTexto = finalizado
                ? `Dejaste el Control Administrativo finalizado correctamente (Adm. ${alta.numero_admision}).`
                : `Admisión ${alta.numero_admision} aún figura en estado "${alta.estado || 'Pendiente'}" sin tilde de control finalizado.${alta.observaciones ? ` Obs: "${alta.observaciones.slice(0, 50)}"` : ''}`;

            misPacientesRecientes.push({
                id: key,
                paciente: alta.paciente,
                identificador: `Adm. ${alta.numero_admision}`,
                modulo: 'altas',
                moduloLabel: 'Altas Administrativas',
                fechaAccion: alta.created_at || alta.fecha_alta || alta.fecha_ingreso,
                alDia,
                badgeLabel,
                estadoTexto,
            });

            if (misPacientesRecientes.length >= 8) break;
        }

        // Ordenar por fecha más reciente y tomar los 5 principales
        misPacientesRecientes.sort((a, b) => new Date(b.fechaAccion || 0) - new Date(a.fechaAccion || 0));
        const topPacientes = misPacientesRecientes.slice(0, 5);
        const pendientesCount = topPacientes.filter(p => !p.alDia).length;
        const alDiaCount = topPacientes.filter(p => p.alDia).length;

        // 3. Historial personal de acciones del usuario (legible)
        const misAcciones = auditHistory
            .filter(a => a.accion !== 'apertura_sistema')
            .slice(0, 8)
            .map(a => ({
                id: a.id,
                label: a.detalle?.label || a.accion?.replace(/_/g, ' '),
                modulo: a.detalle?.modulo || 'inicio',
                created_at: a.created_at,
            }));

        return {
            lastModuleVisit,
            minutosActivoHoy,
            modulosFrecuentes: [...modulosResumenMap.values()].slice(0, 4),
            consultaInsight,
            misPacientes: topPacientes,
            pendientesCount,
            alDiaCount,
            misAcciones,
        };
    } catch (e) {
        console.warn('[dashboard] fetchUserPersonalCopilot error:', e.message);
        return null;
    }
}
