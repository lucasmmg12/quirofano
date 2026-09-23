/**
 * sync_turnos_activos.mjs
 * Sincronización de turnos y visitas próximas activas para el Chatbot de WhatsApp.
 * - Extrae de SALUS [TABLEAU_Visitas ordenadas por agenda] las visitas con [ASISTENCIA] IS NULL y [FECHA] >= HOY.
 * - Integra turnos online de contact_center_turnos_online.
 * - Realiza upsert por lotes en Supabase (turnos_activos_pacientes).
 * - Purga visitas pasadas (< HOY).
 */

import crypto from 'crypto';

function cleanDni(val) {
    if (!val) return null;
    const clean = String(val).replace(/\D/g, '');
    return clean.length >= 6 ? clean : null;
}

function cleanPhone(val) {
    if (!val) return null;
    const clean = String(val).replace(/\D/g, '');
    return clean.length >= 6 ? clean : null;
}

function formatHora(rawHora) {
    if (!rawHora) return '08:00';
    if (typeof rawHora === 'string') {
        const parts = rawHora.split(':');
        if (parts.length >= 2) {
            return `${parts[0].padStart(2, '0')}:${parts[1].padStart(2, '0')}`;
        }
    }
    if (rawHora instanceof Date) {
        const h = String(rawHora.getUTCHours()).padStart(2, '0');
        const m = String(rawHora.getUTCMinutes()).padStart(2, '0');
        return `${h}:${m}`;
    }
    return String(rawHora).slice(0, 5);
}

function generateTurnoId(origen, dni, fecha, hora, medico, agenda) {
    const raw = `${origen}_${dni}_${fecha}_${hora}_${medico || ''}_${agenda || ''}`;
    return crypto.createHash('md5').update(raw).digest('hex');
}

export async function syncTurnosActivos(pool, supabase) {
    console.log('\n======================================================');
    console.log('🔄 [SYNC-TURNOS] Iniciando sincronización de turnos activos...');
    const startTime = Date.now();

    try {
        const todayIso = new Date().toISOString().split('T')[0];

        // 1. EXTRAER DE SALUS: Visitas con ASISTENCIA IS NULL y FECHA >= HOY
        const salusQuery = `
            SELECT 
                [AgendaNombre],
                [TIPO AGENDA],
                [FECHA],
                [HORA],
                [TIPO VISITA],
                [NHC],
                [NIF],
                [PACIENTE],
                [CLIENTE],
                [MOTIVO],
                [ASISTENCIA],
                [MEDICO],
                [TELEFONO1 PACIENTE],
                [TELEFONO2 PACIENTE],
                [EMAIL PACIENTE],
                [ESPECIALIDAD],
                [Centro]
            FROM [SALUS].[dbo].[TABLEAU_Visitas ordenadas por agenda]
            WHERE [ASISTENCIA] IS NULL 
              AND [FECHA] >= CONVERT(VARCHAR(8), GETDATE(), 112)
            ORDER BY [FECHA] ASC, [HORA] ASC
        `;

        console.log('📡 [SYNC-TURNOS] Consultando SALUS SQL Server...');
        const result = await pool.request().query(salusQuery);
        const rows = result.recordset || [];
        console.log(`📥 [SYNC-TURNOS] ${rows.length} visitas futuras recuperadas de SALUS.`);

        const turnosMap = new Map();

        // 2. PROCESAR FILAS DE SALUS
        for (const r of rows) {
            const dni = cleanDni(r.NIF);
            const paciente = (r.PACIENTE || '').trim();
            if (!dni || !paciente) continue;

            const fechaRaw = r.FECHA;
            const fechaStr = fechaRaw instanceof Date 
                ? fechaRaw.toISOString().split('T')[0] 
                : String(fechaRaw).slice(0, 10);

            if (fechaStr < todayIso) continue;

            const horaStr = formatHora(r.HORA);
            const medico = (r.MEDICO || 'Profesional asignado').trim();
            const agenda = (r.AgendaNombre || r['TIPO AGENDA'] || '').trim();
            const id = generateTurnoId('salus', dni, fechaStr, horaStr, medico, agenda);

            turnosMap.set(id, {
                id,
                dni,
                paciente_nombre: paciente,
                nhc: r.NHC ? String(r.NHC).trim() : null,
                telefono: cleanPhone(r['TELEFONO1 PACIENTE']),
                telefono2: cleanPhone(r['TELEFONO2 PACIENTE']),
                email: r['EMAIL PACIENTE'] ? String(r['EMAIL PACIENTE']).trim() : null,
                fecha: fechaStr,
                hora: horaStr,
                medico,
                especialidad: (r.ESPECIALIDAD || 'Consulta Médica').trim(),
                sede: (r.Centro || 'Sede San Luis (San Luis 432 Oeste)').trim(),
                obra_social: (r.CLIENTE || 'Particular / A confirmar').trim(),
                tipo_visita: r['TIPO VISITA'] ? String(r['TIPO VISITA']).trim() : null,
                motivo: r.MOTIVO ? String(r.MOTIVO).trim() : null,
                tipo_agenda: r['TIPO AGENDA'] ? String(r['TIPO AGENDA']).trim() : null,
                origen: 'salus_visita',
                asistencia: null,
                updated_at: new Date().toISOString()
            });
        }

        // 3. INTEGRAR TURNOS ONLINE DE SUPABASE (contact_center_turnos_online)
        try {
            const { data: turnosOnline, error: toErr } = await supabase
                .from('contact_center_turnos_online')
                .select('*')
                .gte('fechas_resumen', todayIso)
                .limit(500);

            if (!toErr && turnosOnline && turnosOnline.length > 0) {
                console.log(`🌐 [SYNC-TURNOS] Integrando ${turnosOnline.length} registros de turnos online...`);
                for (const to of turnosOnline) {
                    const dni = cleanDni(to.dni);
                    if (!dni) continue;

                    const turnosList = Array.isArray(to.turnos) ? to.turnos : [];
                    for (const subTurno of turnosList) {
                        const fTurno = subTurno.fechaTurno || to.fechas_resumen?.split(',')[0]?.trim();
                        if (!fTurno || fTurno < todayIso) continue;

                        const hTurno = subTurno.horaInicio || '09:00';
                        const medico = subTurno.profesional || to.prestador_nombre || 'Profesional Asignado';
                        const id = generateTurnoId('online', dni, fTurno, hTurno, medico, subTurno.agenda);

                        if (!turnosMap.has(id)) {
                            turnosMap.set(id, {
                                id,
                                dni,
                                paciente_nombre: (to.paciente_nombre || 'Paciente').trim(),
                                nhc: null,
                                telefono: cleanPhone(to.telefono),
                                telefono2: null,
                                email: to.email || null,
                                fecha: fTurno,
                                hora: hTurno,
                                medico,
                                especialidad: subTurno.motivo || 'Consulta Online',
                                sede: 'Consultorios Externos',
                                obra_social: to.mutua || 'A confirmar',
                                tipo_visita: subTurno.motivo || 'Turno Web',
                                motivo: subTurno.motivo || null,
                                tipo_agenda: subTurno.agenda || to.agenda_nombre || 'Online',
                                origen: 'turno_online',
                                asistencia: null,
                                updated_at: new Date().toISOString()
                            });
                        }
                    }
                }
            }
        } catch (onlineErr) {
            console.warn('⚠️ [SYNC-TURNOS] Advertencia recuperando turnos online:', onlineErr?.message || onlineErr);
        }

        const totalRecords = Array.from(turnosMap.values());
        console.log(`📦 [SYNC-TURNOS] Total de turnos activos consolidados para upsert: ${totalRecords.length}`);

        // 4. UPSERT EN LOTES A SUPABASE (500 por bloque)
        const BATCH_SIZE = 500;
        let inserted = 0;
        for (let i = 0; i < totalRecords.length; i += BATCH_SIZE) {
            const batch = totalRecords.slice(i, i + BATCH_SIZE);
            const { error: upsertErr } = await supabase
                .from('turnos_activos_pacientes')
                .upsert(batch, { onConflict: 'id' });

            if (upsertErr) {
                console.error(`❌ [SYNC-TURNOS] Error en upsert lote ${i} - ${i + batch.length}:`, upsertErr);
            } else {
                inserted += batch.length;
            }
        }

        // 5. PURGAR TURNOS PASADOS (< HOY)
        const { error: delErr } = await supabase
            .from('turnos_activos_pacientes')
            .delete()
            .lt('fecha', todayIso);

        if (delErr) {
            console.warn('⚠️ [SYNC-TURNOS] Advertencia eliminando turnos vencidos:', delErr.message);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log(`✅ [SYNC-TURNOS] Sincronización completada: ${inserted} turnos activos actualizados en ${elapsed}s`);
        return { success: true, count: inserted, elapsedSeconds: elapsed };

    } catch (err) {
        console.error('❌ [SYNC-TURNOS] Error fatal en sincronización de turnos activos:', err);
        return { success: false, error: err.message };
    }
}
