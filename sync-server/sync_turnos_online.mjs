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
            vn.Comentarios,
            vl.[Tipo Visita] as TipoVisita,
            vl.[Visita_Especialidad] as Especialidad,
            vl.[Centro] as Centro,
            vl.[Cliente] as Cliente,
            vl.[Asistencia] as Asistencia,
            vl.[Paciente] as PacienteSalus,
            vl.[NIF] as DniSalus,
            vl.[telefono1] as TelefonoSalus,
            vl.[email] as EmailSalus
        FROM Visitas v
        LEFT JOIN Visitas_ntext vn ON v.id = vn.IdVisita
        LEFT JOIN [SALUS].[dbo].[VLISE_Visitas] vl ON v.id = vl.idVisita
        LEFT JOIN Agendas a ON v.idAgenda = a.id
        LEFT JOIN Personal p ON v.idPersonal = p.id
        WHERE v.Internet = 1
          AND ${dateCondition}
        ORDER BY v.FechaCreacion DESC
    `;

    const result = await pool.request().query(query);
    const gestiones = loadGestiones();

    // Deduplicar por IdVisita (por si VLISE_Visitas devuelve más de 1 fila para la misma visita)
    const seenVisitas = new Set();
    const uniqueRecordset = [];
    for (const r of (result.recordset || [])) {
        if (!r.IdVisita || seenVisitas.has(r.IdVisita)) continue;
        seenVisitas.add(r.IdVisita);
        uniqueRecordset.push(r);
    }

    const turnosParsed = uniqueRecordset.map(r => {
        const contact = parseOnlineComment(r.Comentarios);
        const horaInicioStr = r.HoraInici 
            ? new Date(r.HoraInici).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) 
            : '';
        const horaFinStr = r.HoraFi 
            ? new Date(r.HoraFi).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) 
            : '';

        const cleanDni = contact.dni || String(r.DniSalus || '').replace(/[^\d]/g, '');
        const cleanNombre = (contact.nombre && contact.nombre !== 'PACIENTE SIN NOMBRE')
            ? contact.nombre
            : (r.PacienteSalus ? String(r.PacienteSalus).trim() : 'PACIENTE SIN NOMBRE');
        const cleanTel = contact.telefono || String(r.TelefonoSalus || '').replace(/[^\d+]/g, '');
        const cleanEmail = contact.email || (r.EmailSalus ? String(r.EmailSalus).trim() : '');
        const cleanObraSocial = contact.mutua || (r.Cliente ? String(r.Cliente).trim() : '');
        const asistenciaStr = r.Asistencia ? String(r.Asistencia).trim() : '';

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
            tipoVisita: r.TipoVisita ? String(r.TipoVisita).trim() : '',
            especialidad: r.Especialidad ? String(r.Especialidad).trim() : '',
            centro: r.Centro ? String(r.Centro).trim() : '',
            cliente: cleanObraSocial,
            asistencia: asistenciaStr,
            ...contact,
            dni: cleanDni,
            nombre: cleanNombre,
            telefono: cleanTel,
            email: cleanEmail,
            mutua: cleanObraSocial
        };
    });

    // Agrupar por paciente (DNI) y Prestador (solo turnos activos/pendientes de asistencia para alerta de duplicados)
    const groups = {};
    for (const t of turnosParsed) {
        if (!t.dni) continue;
        if (t.asistencia && t.asistencia !== '') continue; // Solo turnos pendientes de asistencia
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
            tipoVisita: t.tipoVisita,
            especialidad: t.especialidad,
            motivo: t.motivo
        });
    }

    // Filtrar sólo aquellos que tengan 2 o más turnos (inconsistencias / duplicados)
    // REGLA DE NEGOCIO: En ecografías y estudios diagnósticos, los pacientes con frecuencia
    // deben solicitar varios turnos consecutivos o el mismo día para diferentes zonas/estudios
    // (ej: Abdomen, Mamaria, Tiroides, Ginecológica).
    // Cuando la agenda o los turnos corresponden a ecografías:
    // SE DEJAN PASAR siempre que los tipos de visita sean distintos (no repite el mismo estudio el mismo día).
    const duplicados = Object.values(groups)
        .filter(g => {
            if (g.turnos.length <= 1) return false;

            const isEstudioOImagenes = 
                /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(g.agenda) ||
                /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(g.profesional) ||
                g.turnos.some(t => 
                    /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(t.tipoVisita) || 
                    /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(t.especialidad) || 
                    /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(t.motivo)
                );

            if (isEstudioOImagenes) {
                // Verificar si hay turnos con el mismo estudio y la misma fecha
                const studiesOnDate = {};
                let hasDuplicateSameStudySameDate = false;
                for (const t of g.turnos) {
                    const studyName = (t.tipoVisita || t.motivo || '').trim().toUpperCase();
                    if (studyName) {
                        const key = `${t.fechaTurno}_${studyName}`;
                        if (studiesOnDate[key]) {
                            hasDuplicateSameStudySameDate = true;
                            break;
                        }
                        studiesOnDate[key] = true;
                    }
                }
                // Si no hay duplicado exacto del mismo estudio en la misma fecha, son estudios complementarios válidos -> DEJAR PASAR
                if (!hasDuplicateSameStudySameDate) {
                    return false;
                }
            }

            return true;
        })
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
        casos: duplicados,
        todosTurnos: turnosParsed
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

/**
 * Sincroniza los turnos online duplicados detectados en SALUS directamente a Supabase
 * con reconciliación activa (elimina o actualiza registros que ya no tienen conflicto en SALUS)
 */
export async function syncTurnosOnlineToSupabase(poolOrOptions, maybeOptions = {}) {
    let sqlPool = poolOrOptions;
    let options = maybeOptions;
    if (poolOrOptions && !poolOrOptions.request && !poolOrOptions.connected) {
        sqlPool = poolOrOptions.sqlPool;
        options = poolOrOptions;
    }
    const days = options.days || 2;
    const targetDate = options.targetDate || null;
    const supabaseClient = options.supabaseClient;

    const result = await getTurnosOnlineDuplicados(sqlPool, { days, targetDate });
    if (!result || !result.casos || !supabaseClient) return result;

    // ── PASO 1: Reconciliación con registros preexistentes en Supabase ──
    // Buscamos todos los registros en contact_center_turnos_online en el rango analizado
    try {
        let sbQuery = supabaseClient
            .from('contact_center_turnos_online')
            .select('*');

        if (targetDate) {
            sbQuery = sbQuery.eq('fecha_creacion', targetDate);
        } else if (days && Number(days) > 0) {
            const d = new Date();
            d.setDate(d.getDate() - Number(days));
            const minDate = d.toISOString().split('T')[0];
            sbQuery = sbQuery.gte('fecha_creacion', minDate);
        }

        const { data: existingRows, error: fetchErr } = await sbQuery;

        if (!fetchErr && Array.isArray(existingRows) && existingRows.length > 0) {
            // Extraer todos los idVisita de los turnos guardados en Supabase
            const allSavedVisitIds = new Set();
            for (const row of existingRows) {
                if (Array.isArray(row.turnos)) {
                    for (const t of row.turnos) {
                        if (t?.idVisita) allSavedVisitIds.add(t.idVisita);
                    }
                }
            }

            // Consultar en SALUS cuáles de esos idVisita siguen existiendo en la tabla Visitas
            const activeSalusVisitIds = new Set();
            const activeSalusVisitsMap = new Map();
            if (allSavedVisitIds.size > 0 && sqlPool) {
                const visitIdList = Array.from(allSavedVisitIds);
                const BATCH_SIZE = 500;
                for (let i = 0; i < visitIdList.length; i += BATCH_SIZE) {
                    const batch = visitIdList.slice(i, i + BATCH_SIZE);
                    const checkRes = await sqlPool.request().query(`
                        SELECT v.id, vl.[Tipo Visita] as TipoVisita, vl.[Visita_Especialidad] as Especialidad
                        FROM Visitas v
                        LEFT JOIN [SALUS].[dbo].[VLISE_Visitas] vl ON v.id = vl.idVisita
                        WHERE v.id IN (${batch.join(',')})
                          AND (vl.Asistencia IS NULL OR vl.Asistencia = '')
                    `);
                    if (checkRes.recordset) {
                        for (const r of checkRes.recordset) {
                            activeSalusVisitIds.add(r.id);
                            activeSalusVisitsMap.set(r.id, r);
                        }
                    }
                }
            }

            // Evaluar cada registro preexistente
            const toDeleteIds = [];
            const toUpdateCases = [];

            for (const row of existingRows) {
                const rowTurnos = Array.isArray(row.turnos) ? row.turnos : [];
                const validTurnos = rowTurnos
                    .filter(t => activeSalusVisitIds.has(t.idVisita))
                    .map(t => {
                        const salusData = activeSalusVisitsMap.get(t.idVisita);
                        return {
                            ...t,
                            tipoVisita: salusData?.TipoVisita ? String(salusData.TipoVisita).trim() : (t.tipoVisita || ''),
                            especialidad: salusData?.Especialidad ? String(salusData.Especialidad).trim() : (t.especialidad || '')
                        };
                    });

                // Si es un caso de ecografías o estudios válidos y distintos (mismo día y consecutivos): DEJARLO PASAR
                const isRowEco = 
                    /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(row.agenda_nombre) ||
                    /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(row.prestador_nombre) ||
                    validTurnos.some(t => 
                        /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(t.tipoVisita) || 
                        /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(t.especialidad) || 
                        /ECO|ECOGRAF|MAMOGRAF|DENSITOM|RADIOLOG|RAYOS|TOMOGRAF|RESONAN|IMAGEN/i.test(t.motivo)
                    );

                if (isRowEco) {
                    const studiesOnDate = {};
                    let hasDupEco = false;
                    for (const t of validTurnos) {
                        const sName = (t.tipoVisita || t.motivo || '').trim().toUpperCase();
                        if (sName) {
                            const k = `${t.fechaTurno}_${sName}`;
                            if (studiesOnDate[k]) { hasDupEco = true; break; }
                            studiesOnDate[k] = true;
                        }
                    }
                    if (!hasDupEco) {
                        // Caso de ecografías legítimas consecutivas: eliminar alerta de conflicto en Supabase
                        toDeleteIds.push(row.id);
                        continue;
                    }
                }

                if (validTurnos.length < 2) {
                    // Ya no tiene duplicados (se eliminaron todos o quedó solo 1 turno en SALUS)
                    // Eliminar el registro obsoleto de la tabla
                    toDeleteIds.push(row.id);
                } else if (validTurnos.length !== rowTurnos.length || validTurnos.some((vt, idx) => vt.tipoVisita !== rowTurnos[idx]?.tipoVisita)) {
                    // Actualizar array con turnos sobrevivientes y enriquecidos con tipoVisita
                    toUpdateCases.push({
                        id: row.id,
                        turnos: validTurnos,
                        total_turnos: validTurnos.length,
                        fechas_resumen: [...new Set(validTurnos.map(t => t.fechaTurno))].join(', '),
                        updated_at: new Date().toISOString()
                    });
                }
            }

            // Ejecutar eliminaciones de registros obsoletos
            if (toDeleteIds.length > 0) {
                console.log(`[turnos-online] 🗑️ Eliminando ${toDeleteIds.length} casos obsoletos/resueltos en SALUS de Supabase:`, toDeleteIds);
                const { error: delErr } = await supabaseClient
                    .from('contact_center_turnos_online')
                    .delete()
                    .in('id', toDeleteIds);
                if (delErr) {
                    console.error('[turnos-online] Error eliminando casos obsoletos:', delErr.message);
                } else {
                    console.log(`[turnos-online] ✅ ${toDeleteIds.length} casos obsoletos purgados exitosamente.`);
                }
            }

            // Ejecutar actualizaciones parciales
            for (const upd of toUpdateCases) {
                await supabaseClient
                    .from('contact_center_turnos_online')
                    .update({
                        turnos: upd.turnos,
                        total_turnos: upd.total_turnos,
                        fechas_resumen: upd.fechas_resumen,
                        updated_at: upd.updated_at
                    })
                    .eq('id', upd.id);
            }
        }
    } catch (reconcileErr) {
        console.warn('[turnos-online] ⚠️ Error durante la reconciliación con SALUS:', reconcileErr.message);
    }

    // ── PASO 2: Upsert de los casos duplicados actuales y activos ──
    const ids = result.casos.map(c => c.key);
    let existingMap = {};
    if (ids.length > 0) {
        const { data: existingRows } = await supabaseClient
            .from('contact_center_turnos_online')
            .select('id, estado, agente_id, agente_nombre, notas, fecha_contacto')
            .in('id', ids);

        if (Array.isArray(existingRows)) {
            for (const row of existingRows) {
                existingMap[row.id] = row;
            }
        }
    }

    const upsertRows = result.casos.map(c => {
        const exist = existingMap[c.key] || {};
        const primerTurno = c.turnos[0];
        let fechaCreacion;
        try {
            const raw = primerTurno?.fechaCreacion;
            const parsedD = raw ? new Date(raw) : new Date();
            fechaCreacion = !isNaN(parsedD.getTime()) ? parsedD.toISOString().split('T')[0] : new Date().toISOString().split('T')[0];
        } catch {
            fechaCreacion = new Date().toISOString().split('T')[0];
        }

        return {
            id: c.key,
            dni: c.dni,
            paciente_nombre: c.nombre,
            telefono: c.telefono || c.telefonoAlt || null,
            email: c.email || null,
            prestador_id: c.idPersonal || null,
            prestador_nombre: c.profesional || null,
            agenda_id: c.idAgenda || null,
            agenda_nombre: c.agenda || null,
            fecha_creacion: fechaCreacion,
            total_turnos: c.cantidadTurnos,
            mismo_dia: c.esMismoDia,
            fechas_resumen: c.fechasTurnos.join(', '),
            turnos: c.turnos,
            estado: exist.estado || c.gestion?.estado || 'pendiente',
            agente_id: exist.agente_id || c.gestion?.agenteId || null,
            agente_nombre: exist.agente_nombre || c.gestion?.agenteNombre || null,
            notas: exist.notas || c.gestion?.notas || null,
            fecha_contacto: exist.fecha_contacto || null,
            updated_at: new Date().toISOString()
        };
    });

    if (upsertRows.length > 0) {
        const { error } = await supabaseClient
            .from('contact_center_turnos_online')
            .upsert(upsertRows, { onConflict: 'id' });
        if (error) {
            console.error('[turnos-online] Error upserting a Supabase:', error);
        } else {
            console.log(`[turnos-online] ✅ ${upsertRows.length} casos duplicados guardados en Supabase contact_center_turnos_online`);
        }
    }

    // ── PASO 3: Guardar TODOS los turnos online realizados en la Base de Datos Maestra (public.cita_online_reservas) ──
    try {
        const allTurnos = Array.isArray(result.todosTurnos) ? result.todosTurnos : [];
        if (allTurnos.length > 0) {
            const allIds = allTurnos.map(t => `visita_${t.idVisita}`);
            const existingReservasMap = new Map();
            const CHUNK = 300;

            for (let i = 0; i < allIds.length; i += CHUNK) {
                const slice = allIds.slice(i, i + CHUNK);
                const { data: existRes } = await supabaseClient
                    .from('cita_online_reservas')
                    .select('id, whatsapp_enviado, whatsapp_plantilla, whatsapp_enviado_at, whatsapp_respuesta, origen_captura')
                    .in('id', slice);
                if (Array.isArray(existRes)) {
                    for (const er of existRes) {
                        existingReservasMap.set(er.id, er);
                    }
                }
            }

            const normalizePhone10 = (raw) => {
                let d = String(raw || '').replace(/\D/g, '');
                if (!d) return '';
                if (d.startsWith('549') && d.length >= 13) d = d.slice(3);
                else if (d.startsWith('54') && d.length >= 12) d = d.slice(2);
                d = d.replace(/^0+/, '');
                if (d.startsWith('15') && d.length === 9) d = '264' + d.slice(2);
                if (d.length === 12) {
                    const idx15 = d.indexOf('15');
                    if (idx15 >= 2 && idx15 <= 4) d = d.slice(0, idx15) + d.slice(idx15 + 2);
                }
                return d.length > 10 ? d.slice(0, 10) : d;
            };

            const nowIso = new Date().toISOString();
            const reservasToUpsert = allTurnos.map(t => {
                const recId = `visita_${t.idVisita}`;
                const prev = existingReservasMap.get(recId);
                const clean10 = normalizePhone10(t.telefono || t.telefonoAlt || '');
                const wa13 = clean10.length === 10 ? `549${clean10}` : (clean10 || null);
                let fechaCreacionIso = nowIso;
                try {
                    if (t.fechaCreacion) {
                        const dt = new Date(t.fechaCreacion);
                        if (!isNaN(dt.getTime())) fechaCreacionIso = dt.toISOString();
                    }
                } catch {}

                return {
                    id: recId,
                    id_visita: t.idVisita,
                    dni: t.dni || null,
                    paciente_nombre: t.nombre || 'PACIENTE SIN NOMBRE',
                    telefono: clean10 || t.telefono || null,
                    whatsapp_phone: wa13,
                    email: t.email || null,
                    profesional: t.profesional || null,
                    id_personal: t.idPersonal || null,
                    especialidad: t.especialidad || null,
                    agenda: t.agenda || null,
                    id_agenda: t.idAgenda || null,
                    tipo_visita: t.tipoVisita || null,
                    centro: t.centro || null,
                    obra_social: t.mutua || t.cliente || null,
                    motivo: t.motivo || null,
                    fecha_turno: t.fechaTurno || null,
                    hora_inicio: t.horaInicio || null,
                    hora_fin: t.horaFin || null,
                    fecha_hora_texto: `${t.fechaTurno || ''} ${t.horaInicio || ''}`.trim() || null,
                    fecha_creacion_salus: fechaCreacionIso,
                    asistencia: t.asistencia || 'Pendiente',
                    origen_captura: prev?.origen_captura === 'web_realtime' ? 'ambos' : (prev?.origen_captura || 'salus_sync'),
                    whatsapp_enviado: prev?.whatsapp_enviado || false,
                    whatsapp_plantilla: prev?.whatsapp_plantilla || null,
                    whatsapp_enviado_at: prev?.whatsapp_enviado_at || null,
                    whatsapp_respuesta: prev?.whatsapp_respuesta || null,
                    updated_at: nowIso
                };
            });

            for (let i = 0; i < reservasToUpsert.length; i += CHUNK) {
                const batch = reservasToUpsert.slice(i, i + CHUNK);
                const { error: resErr } = await supabaseClient
                    .from('cita_online_reservas')
                    .upsert(batch, { onConflict: 'id' });
                if (resErr) {
                    console.error('[turnos-online] Error guardando lote en cita_online_reservas:', resErr.message);
                }
            }
            console.log(`[turnos-online] ✅ ${reservasToUpsert.length} turnos online totales registrados en public.cita_online_reservas`);
        }
    } catch (allTurnosErr) {
        console.warn('[turnos-online] ⚠️ Error sincronizando base completa cita_online_reservas:', allTurnosErr.message);
    }

    return result;
}

