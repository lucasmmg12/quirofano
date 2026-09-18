/**
 * sync_turnos_online.mjs
 * Módulo para detección y gestión de turnos online duplicados/inconsistentes en agendas SALUS.
 */
import fs from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const GESTION_FILE = resolve(__dirname, 'data_turnos_online_gestion.json');

// Cargar almacenamiento local de gestiones
function loadGestiones() {
    try {
        if (fs.existsSync(GESTION_FILE)) {
            const raw = fs.readFileSync(GESTION_FILE, 'utf8');
            return JSON.parse(raw);
        }
    } catch (err) {
        console.warn('⚠️ Error leyendo data_turnos_online_gestion.json:', err.message);
    }
    return {};
}

// Guardar almacenamiento local de gestiones
function saveGestiones(data) {
    try {
        fs.writeFileSync(GESTION_FILE, JSON.stringify(data, null, 2), 'utf8');
    } catch (err) {
        console.error('❌ Error escribiendo data_turnos_online_gestion.json:', err.message);
    }
}

/**
 * Parsea el comentario estructurado del turno online en SALUS
 */
export function parseOnlineComment(comment) {
    if (!comment) return {};
    const getTag = (tag) => {
        const regex = new RegExp(`<${tag}>:\\s*([^\\r\\n<]*)`, 'i');
        const match = comment.match(regex);
        return match ? match[1].trim() : '';
    };

    let nombre = getTag('Nombre') || getTag('NombreSinApellidos');
    const ap1 = getTag('Apellido1');
    const ap2 = getTag('Apellido2');
    if (!nombre && (ap1 || ap2)) {
        nombre = `${ap1} ${ap2}`.trim();
    }

    let telefono = getTag('Teléfono') || getTag('Teléfono2') || '';
    // Limpieza básica de teléfono
    telefono = telefono.replace(/[^\d+]/g, '');

    return {
        nombre: nombre || 'PACIENTE SIN NOMBRE',
        dni: (getTag('NIF') || '').replace(/[^\d]/g, ''),
        telefono,
        telefonoAlt: getTag('Teléfono2') || '',
        email: getTag('Email') || '',
        motivo: getTag('Motivo') || '',
        mutua: getTag('Mutua') || '',
    };
}

/**
 * Obtiene los turnos online creados en un rango de días o fecha específica
 * y detecta inconsistencias (mismo paciente + mismo prestador con múltiples turnos)
 */
export async function getTurnosOnlineDuplicados(pool, options = {}) {
    const { days = 1, targetDate = null } = options;

    let dateCondition = '';
    if (targetDate) {
        // Fecha específica YYYY-MM-DD
        dateCondition = `CAST(v.FechaCreacion AS DATE) = '${targetDate}'`;
    } else {
        // Por defecto: hoy - days (ej: days=1 toma desde ayer 00:00:00)
        dateCondition = `v.FechaCreacion >= DATEADD(day, -${parseInt(days, 10)}, CAST(GETDATE() AS DATE))`;
    }

    const query = `
        SELECT 
            v.id as IdVisita,
            v.idAgenda,
            a.Nombre as NombreAgenda,
            a.NombreAbrev as AgendaAbrev,
            v.idPersonal,
            p.Nombre as NombreProfesional,
            p.NombreAbrev as ProfesionalAbrev,
            v.Data as FechaTurno,
            v.HoraInici,
            v.HoraFi,
            v.FechaCreacion,
            v.UsuarioCita,
            v.EstadoReprogramacion,
            vn.Comentarios
        FROM Visitas v
        INNER JOIN Visitas_ntext vn ON v.id = vn.IdVisita
        LEFT JOIN Agendas a ON v.idAgenda = a.id
        LEFT JOIN Personal p ON v.idPersonal = p.id
        WHERE v.Internet = 1
          AND ${dateCondition}
        ORDER BY v.FechaCreacion DESC
    `;

    const result = await pool.request().query(query);
    const gestiones = loadGestiones();

    const turnosParsed = result.recordset.map(r => {
        const contact = parseOnlineComment(r.Comentarios);
        const horaInicioStr = r.HoraInici 
            ? new Date(r.HoraInici).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) 
            : '';
        const horaFinStr = r.HoraFi 
            ? new Date(r.HoraFi).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) 
            : '';

        return {
            idVisita: r.IdVisita,
            idAgenda: r.idAgenda,
            agenda: r.NombreAgenda || 'Agenda sin nombre',
            agendaAbrev: r.AgendaAbrev || '',
            idPersonal: r.idPersonal,
            profesional: r.NombreProfesional || 'Profesional no asignado',
            fechaTurno: r.FechaTurno ? r.FechaTurno.toISOString().slice(0, 10) : '',
            horaInicio: horaInicioStr,
            horaFin: horaFinStr,
            fechaCreacion: r.FechaCreacion,
            ...contact
        };
    });

    // Agrupar por paciente (DNI) y Prestador
    const groups = {};
    for (const t of turnosParsed) {
        if (!t.dni) continue;
        const key = `${t.dni}_${t.idPersonal || t.idAgenda}`;
        if (!groups[key]) {
            groups[key] = {
                key,
                dni: t.dni,
                nombre: t.nombre,
                telefono: t.telefono,
                telefonoAlt: t.telefonoAlt,
                email: t.email,
                mutua: t.mutua,
                idPersonal: t.idPersonal,
                profesional: t.profesional,
                idAgenda: t.idAgenda,
                agenda: t.agenda,
                turnos: []
            };
        }
        groups[key].turnos.push({
            idVisita: t.idVisita,
            idAgenda: t.idAgenda,
            agenda: t.agenda,
            fechaTurno: t.fechaTurno,
            horaInicio: t.horaInicio,
            horaFin: t.horaFin,
            fechaCreacion: t.fechaCreacion,
            motivo: t.motivo
        });
    }

    // Filtrar sólo aquellos que tengan 2 o más turnos (inconsistencias / duplicados)
    const duplicados = Object.values(groups)
        .filter(g => g.turnos.length > 1)
        .map(g => {
            // Ordenar turnos por fecha de turno
            g.turnos.sort((a, b) => (a.fechaTurno + a.horaInicio).localeCompare(b.fechaTurno + b.horaInicio));
            
            // Adjuntar datos de gestión
            const gestion = gestiones[g.key] || {
                estado: 'pendiente', // 'pendiente', 'contactado', 'resuelto', 'descartado'
                agenteId: null,
                agenteNombre: null,
                notas: '',
                templateName: null,
                updatedAt: null
            };

            // Detectar tipo de duplicado
            const fechas = [...new Set(g.turnos.map(t => t.fechaTurno))];
            const esMismoDia = fechas.length === 1;
            const severidad = g.turnos.length >= 3 ? 'alta' : esMismoDia ? 'alta' : 'media';

            return {
                ...g,
                cantidadTurnos: g.turnos.length,
                esMismoDia,
                fechasTurnos: fechas,
                severidad,
                gestion
            };
        });

    // Estadísticas
    const totalTurnosAnalizados = turnosParsed.length;
    const totalPacientesConDuplicados = duplicados.length;
    const totalTurnosEnConflicto = duplicados.reduce((acc, d) => acc + d.cantidadTurnos, 0);
    const totalPendientes = duplicados.filter(d => d.gestion.estado === 'pendiente').length;
    const totalContactados = duplicados.filter(d => d.gestion.estado === 'contactado').length;
    const totalResueltos = duplicados.filter(d => d.gestion.estado === 'resuelto').length;

    return {
        rango: { days, targetDate },
        stats: {
            totalTurnosAnalizados,
            totalPacientesConDuplicados,
            totalTurnosEnConflicto,
            totalPendientes,
            totalContactados,
            totalResueltos
        },
        casos: duplicados
    };
}

/**
 * Guarda o actualiza el estado de gestión de un caso
 */
export function setGestionTurnoOnline({ key, estado, agenteId, agenteNombre, notas, templateName }) {
    if (!key) throw new Error('Key requerida (dni_prestadorId)');
    const gestiones = loadGestiones();
    
    gestiones[key] = {
        ...gestiones[key],
        estado: estado || gestiones[key]?.estado || 'pendiente',
        agenteId: agenteId || gestiones[key]?.agenteId,
        agenteNombre: agenteNombre || gestiones[key]?.agenteNombre,
        notas: notas !== undefined ? notas : (gestiones[key]?.notas || ''),
        templateName: templateName || gestiones[key]?.templateName,
        updatedAt: new Date().toISOString()
    };

    saveGestiones(gestiones);
    return gestiones[key];
}
