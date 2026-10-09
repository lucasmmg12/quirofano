/**
 * incentivos_contact_center.mjs
 * Módulo de extracción y cálculo de métricas para el esquema de incentivos del Contact Center
 * de Sanatorio Argentino (Propuesta v13).
 */

const SALUS_AGENTS_MAP = {
    'OLIVIER ESQUIVEL, SOFIA FERNANDA': { id: 'solivier', name: 'Sofia Olivier', shortName: 'Sofia', role: 'Senior' },
    'ACOSTA ESQUIVEL, MARIA ANTONELLA': { id: 'macosta', name: 'Antonella Acosta', shortName: 'Antonella', role: 'Baja Septiembre' },
    'JACQUES SORIA, VIRGINIA': { id: 'vjacques', name: 'Virginia Jacques', shortName: 'Virginia', role: 'Senior' },
    'AGUILERA CARDOZO, DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera', shortName: 'Daniela', role: 'Senior' },
    'LEAL, ERICA': { id: 'eleal', name: 'Erica Leal', shortName: 'Erica', role: 'Curva 50%' },
    'LEAL,ERICA': { id: 'eleal', name: 'Erica Leal', shortName: 'Erica', role: 'Curva 50%' }
};

export const INCENTIVO_TIERS = {
    baseGarantizada: 139470.59,
    maxVariableTotal: 139470.59,
    bolsas: {
        mensajes: {
            peso: 0.50,
            maxMonto: 69735.29,
            base: 6500,
            meta: 7500,
            tope: 8500,
            paso: 200,
            montoPaso: 6973.53
        },
        turnos: {
            peso: 0.25,
            maxMonto: 34867.65,
            base: 3052,
            meta: 3687,
            tope: 4324,
            paso: 127,
            montoPaso: 3486.76
        },
        asistencia: {
            peso: 0.25,
            maxMonto: 34867.65,
            base: 50.0,
            meta: 55.0,
            tope: 60.0,
            paso: 1.0,
            montoPaso: 3486.76
        }
    }
};

/**
 * Calcula el escalón alcanzado (0 a 10) y el monto correspondiente.
 */
export function calculateEscalon(valor, tipo) {
    const config = INCENTIVO_TIERS.bolsas[tipo];
    if (!config) return { escalon: 0, monto: 0, progresoPct: 0 };

    if (valor < config.base + (tipo === 'turnos' ? 127 : tipo === 'mensajes' ? 200 : 1.0)) {
        return { escalon: 0, monto: 0, progresoPct: Math.min(100, Math.round((valor / config.base) * 100)) };
    }

    let escalon = 0;
    if (tipo === 'asistencia') {
        escalon = Math.floor(valor - config.base);
    } else {
        escalon = Math.floor((valor - config.base) / config.paso);
    }

    escalon = Math.max(0, Math.min(10, escalon));
    const monto = Math.round((escalon * config.montoPaso) * 100) / 100;
    const progresoPct = Math.min(100, Math.round((valor / config.tope) * 100));

    return { escalon, monto, progresoPct };
}

/**
 * Obtiene métricas reales de SALUS para un período específico (YYYY-MM).
 */
export async function getIncentivosContactCenter(pool, { periodo = null } = {}) {
    const now = new Date();
    let year = now.getFullYear();
    let month = now.getMonth() + 1; // 1-12

    if (periodo && typeof periodo === 'string' && periodo.includes('-')) {
        const parts = periodo.split('-');
        year = parseInt(parts[0], 10);
        month = parseInt(parts[1], 10);
    }

    const startMonthStr = String(month).padStart(2, '0');
    const startDate = `${year}${startMonthStr}01`;

    // Fecha fin: primer día del mes siguiente
    let nextYear = year;
    let nextMonth = month + 1;
    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear++;
    }
    const endMonthStr = String(nextMonth).padStart(2, '0');
    const endDate = `${nextYear}${endMonthStr}01`;

    const periodoIso = `${year}-${startMonthStr}`;
    const agentNamesSql = Object.keys(SALUS_AGENTS_MAP).map(a => `'${a}'`).join(',');

    // 1. TURNOS CREADOS (Bolsa 2 Grupal)
    const turnosQuery = `
        SELECT 
            [Usuario Creacion Nombre] AS Agente,
            COUNT(DISTINCT [idVisita]) AS TurnosCreados
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE [Fecha Hora Creacion] >= '${startDate}'
          AND [Fecha Hora Creacion] <  '${endDate}'
          AND [Usuario Creacion Nombre] IN (${agentNamesSql})
          AND [Paciente] <> 'TURNOS ONLINE, PACIENTE'
        GROUP BY [Usuario Creacion Nombre]
    `;

    // 2. ASISTENCIA EFECTIVA (Bolsa 3 Individual)
    const asistenciaQuery = `
        SELECT 
            [Usuario Creacion Nombre] AS Agente,
            COUNT(DISTINCT [idVisita]) AS TotalCitas,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%asist%' OR LOWER([Asistencia]) LIKE '%realiz%' OR LOWER([Asistencia]) = 'presente' THEN 1 ELSE 0 END) AS Asistidas,
            SUM(CASE WHEN [Asistencia] IS NULL OR LOWER([Asistencia]) LIKE '%injustificada%' OR LOWER([Asistencia]) LIKE '%ausen%' THEN 1 ELSE 0 END) AS Ausencias,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%justificada%' AND LOWER([Asistencia]) NOT LIKE '%injustificada%' THEN 1 ELSE 0 END) AS Justificadas,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%anulad%' OR LOWER([Asistencia]) LIKE '%cancel%' OR LOWER([Asistencia]) LIKE '%susp%' THEN 1 ELSE 0 END) AS Anuladas
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE [Fecha Visita] >= '${startDate}'
          AND [Fecha Visita] <  '${endDate}'
          AND [Usuario Creacion Nombre] IN (${agentNamesSql})
          AND [Paciente] <> 'TURNOS ONLINE, PACIENTE'
        GROUP BY [Usuario Creacion Nombre]
    `;

    const [turnosRes, asistenciaRes] = await Promise.all([
        pool.request().query(turnosQuery),
        pool.request().query(asistenciaQuery)
    ]);

    // Consolidar por colaboradora canónica
    const agentesMap = {
        solivier: { id: 'solivier', salusKey: 'OLIVIER ESQUIVEL, SOFIA FERNANDA', name: 'Sofia Olivier', rol: 'Senior', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0 },
        vjacques: { id: 'vjacques', salusKey: 'JACQUES SORIA, VIRGINIA', name: 'Virginia Jacques', rol: 'Senior', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0 },
        daguilera: { id: 'daguilera', salusKey: 'AGUILERA CARDOZO, DANIELA ROMINA', name: 'Daniela Aguilera', rol: 'Senior', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0 },
        eleal: { id: 'eleal', salusKey: 'LEAL, ERICA', name: 'Erica Leal', rol: 'Curva de Aprendizaje (50%)', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0 },
        macosta: { id: 'macosta', salusKey: 'ACOSTA ESQUIVEL, MARIA ANTONELLA', name: 'Antonella Acosta', rol: 'Baja en Septiembre', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0 }
    };

    // Agregar turnos creados
    for (const row of (turnosRes.recordset || [])) {
        const meta = SALUS_AGENTS_MAP[row.Agente];
        if (meta && agentesMap[meta.id]) {
            agentesMap[meta.id].turnos += row.TurnosCreados;
        }
    }

    // Agregar asistencia
    for (const row of (asistenciaRes.recordset || [])) {
        const meta = SALUS_AGENTS_MAP[row.Agente];
        if (meta && agentesMap[meta.id]) {
            agentesMap[meta.id].citasTotales += row.TotalCitas;
            agentesMap[meta.id].asistidas += row.Asistidas;
            agentesMap[meta.id].ausencias += row.Ausencias;
            agentesMap[meta.id].justificadas += row.Justificadas;
            agentesMap[meta.id].anuladas += row.Anuladas;
        }
    }

    // Calcular totales grupales y métricas individuales
    const totalTurnosGrupal = Object.values(agentesMap).reduce((acc, a) => acc + a.turnos, 0);
    const escalonTurnos = calculateEscalon(totalTurnosGrupal, 'turnos');

    const listaAgentes = Object.values(agentesMap).map(ag => {
        const evaluables = ag.asistidas + ag.ausencias;
        const asistenciaPct = evaluables > 0 
            ? Math.round(((ag.asistidas / evaluables) * 100) * 100) / 100 
            : 0;

        const escalonAsistencia = calculateEscalon(asistenciaPct, 'asistencia');

        // Estado y FTE sugerido
        let estado = 'ACTIVA';
        let fte = 1.0;
        if (ag.id === 'eleal') {
            fte = 0.5; // Curva de aprendizaje al 50%
            estado = 'CURVA_APRENDIZAJE';
        } else if (ag.id === 'macosta') {
            if (periodoIso >= '2026-09') {
                fte = periodoIso === '2026-09' ? 0.2 : 0;
                estado = 'BAJA';
            }
        }

        return {
            ...ag,
            evaluables,
            asistenciaPct,
            escalonAsistencia: escalonAsistencia.escalon,
            montoAsistencia: escalonAsistencia.monto,
            montoTurnos: escalonTurnos.monto,
            baseGarantizada: INCENTIVO_TIERS.baseGarantizada,
            estado,
            fte
        };
    });

    return {
        periodo: periodoIso,
        startDate,
        endDate,
        config: INCENTIVO_TIERS,
        turnosGrupales: {
            total: totalTurnosGrupal,
            escalon: escalonTurnos.escalon,
            montoPorAgente: escalonTurnos.monto,
            meta: INCENTIVO_TIERS.bolsas.turnos.meta,
            tope: INCENTIVO_TIERS.bolsas.turnos.tope,
            progresoPct: escalonTurnos.progresoPct
        },
        agentes: listaAgentes
    };
}

/**
 * Obtiene los turnos creados hoy (o en una fecha dada) por cada operadora en SALUS.
 */
export async function getTurnosDiariosContactCenter(pool, { fecha = null } = {}) {
    const today = fecha || new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const dateFormatted = today.replace(/-/g, '');

    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const nextDayFormatted = d.toISOString().substring(0, 10).replace(/-/g, '');

    const agentNamesSql = Object.keys(SALUS_AGENTS_MAP).map(a => `'${a}'`).join(',');
    const query = `
        SELECT 
            [idVisita],
            [IdPaciente],
            [Paciente],
            [NIF] AS DNI,
            [telefono1],
            [telefono2],
            [Visita_Especialidad] AS Especialidad,
            [Responsable] AS Medico,
            [Fecha Visita] AS FechaVisita,
            [Hora Inicio Visita Formato Texto] AS HoraVisita,
            [Tipo Visita] AS TipoVisita,
            [Cliente] AS ObraSocial,
            [Usuario Creacion Nombre] AS Agente,
            [Fecha Hora Creacion] AS CreadoEl
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE [Fecha Hora Creacion] >= '${dateFormatted}'
          AND [Fecha Hora Creacion] <  '${nextDayFormatted}'
          AND [Usuario Creacion Nombre] IN (${agentNamesSql})
          AND [Paciente] <> 'TURNOS ONLINE, PACIENTE'
        ORDER BY [Fecha Hora Creacion] DESC
    `;

    const res = await pool.request().query(query);
    const agentesMap = {
        solivier: { id: 'solivier', salusKey: 'OLIVIER ESQUIVEL, SOFIA FERNANDA', name: 'Sofia Olivier', turnos: 0, turnosDetalle: [] },
        vjacques: { id: 'vjacques', salusKey: 'JACQUES SORIA, VIRGINIA', name: 'Virginia Jacques', turnos: 0, turnosDetalle: [] },
        daguilera: { id: 'daguilera', salusKey: 'AGUILERA CARDOZO, DANIELA ROMINA', name: 'Daniela Aguilera', turnos: 0, turnosDetalle: [] },
        eleal: { id: 'eleal', salusKey: 'LEAL, ERICA', name: 'Erica Leal', turnos: 0, turnosDetalle: [] },
        macosta: { id: 'macosta', salusKey: 'ACOSTA ESQUIVEL, MARIA ANTONELLA', name: 'Antonella Acosta', turnos: 0, turnosDetalle: [] }
    };

    for (const row of (res.recordset || [])) {
        const meta = SALUS_AGENTS_MAP[row.Agente];
        if (meta && agentesMap[meta.id]) {
            agentesMap[meta.id].turnos += 1;
            agentesMap[meta.id].turnosDetalle.push({
                idVisita: row.idVisita,
                idPaciente: row.IdPaciente,
                paciente: row.Paciente,
                dni: String(row.DNI || '').trim(),
                telefono1: row.telefono1 || '',
                telefono2: row.telefono2 || '',
                especialidad: row.Especialidad || '',
                medico: row.Medico || '',
                fechaVisita: row.FechaVisita ? new Date(row.FechaVisita).toISOString().substring(0, 10) : '',
                horaVisita: row.HoraVisita || '',
                tipoVisita: row.TipoVisita || '',
                obraSocial: row.ObraSocial || '',
                horaCreacion: row.CreadoEl ? new Date(row.CreadoEl).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '',
                creadoEl: row.CreadoEl ? row.CreadoEl.toISOString() : ''
            });
        }
    }

    return {
        fecha: today,
        synced_at: new Date().toISOString(),
        total: Object.values(agentesMap).reduce((acc, a) => acc + a.turnos, 0),
        agentes: Object.values(agentesMap)
    };
}

