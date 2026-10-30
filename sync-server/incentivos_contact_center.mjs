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
    'AGUILERA CARDOZO, ANA DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera', shortName: 'Daniela', role: 'Senior' },
    'AGUILERA, ANA DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera', shortName: 'Daniela', role: 'Senior' },
    'AGUILERA, DANIELA ROMINA': { id: 'daguilera', name: 'Daniela Aguilera', shortName: 'Daniela', role: 'Senior' },
    'AGUILERA, DANIELA': { id: 'daguilera', name: 'Daniela Aguilera', shortName: 'Daniela', role: 'Senior' },
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
export function calculateEscalon(valor, tipo, dotacion = 1, factorDemanda = 1.0) {
    const config = INCENTIVO_TIERS.bolsas[tipo];
    if (!config) return { escalon: 0, monto: 0, progresoPct: 0 };

    const div = (tipo === 'turnos' && dotacion > 1) ? Number(dotacion) : 1;
    const fDemanda = (tipo === 'turnos' && factorDemanda > 0) ? Number(factorDemanda) : 1.0;
    const base = (config.base / div) * fDemanda;
    const paso = (config.paso / div) * fDemanda;
    const tope = (config.tope / div) * fDemanda;

    if (valor < base) {
        return { escalon: 0, monto: 0, progresoPct: Math.min(100, Math.round((valor / base) * 100)) };
    }

    let escalon = 0;
    if (tipo === 'asistencia') {
        escalon = Math.floor(valor - base);
    } else {
        escalon = Math.floor((valor - base) / paso) + 1;
    }

    escalon = Math.max(0, Math.min(10, escalon));
    const monto = Math.round((escalon * config.montoPaso) * 100) / 100;
    const progresoPct = Math.min(100, Math.round((valor / tope) * 100));

    return { escalon, monto, progresoPct };
}

/**
 * Clasifica una dupla (Especialidad, TipoVisita) de SALUS dentro de las 4 áreas estratégicas
 * solicitadas para el análisis del Contact Center (Diagnóstico por Imágenes, Chequeo, Prevenir, Kinesiología)
 * o bien dentro de Consultorios Externos / Otras Especialidades.
 */
export function clasificarServicioTurno(especialidadRaw, tipoVisitaRaw) {
    const esp = String(especialidadRaw || '').trim().toUpperCase();
    const tipo = String(tipoVisitaRaw || '').trim().toUpperCase();

    // 1. PROGRAMA PREVENIR
    if (tipo.startsWith('(PRV)') || tipo.startsWith('(GINEP)') || tipo.includes('PREVENIR') || esp.includes('PREVENIR')) {
        let sub = 'Programa Prevenir';
        if (tipo.startsWith('(GINEP)') || tipo.includes('GINECOLOGIA')) sub = 'Consulta Ginecología Prevenir';
        else if (tipo.startsWith('(PRV)')) sub = 'Circuito Prevenir ((PRV) PREVENIR)';
        return { key: 'prevenir', label: 'Programa Prevenir', subcategoria: sub };
    }

    // 2. CHEQUEO PREVENTIVO
    if (tipo.startsWith('(CHQ)') || tipo.includes('CHEQUEO') || esp === 'CHEQUEO') {
        let sub = 'Chequeo Preventivo';
        if (tipo.includes('INFORME')) sub = 'Chequeo Informe Médico';
        else if (tipo.includes('ELECTRO')) sub = 'Electrocardiograma Chequeo';
        else if (tipo.includes('PREVENTIVO')) sub = 'Chequeo Preventivo Integral';
        return { key: 'chequeo', label: 'Chequeo Preventivo', subcategoria: sub };
    }

    // 3. KINESIOLOGÍA / FISIATRÍA / REHABILITACIÓN
    if (
        esp.includes('KINESIO') || esp.includes('FISIATR') || esp.includes('REHABILITACION') ||
        tipo.startsWith('(KINESIO)') || tipo.includes('KINESIO') || tipo.includes('FISIOTERAPIA')
    ) {
        let sub = 'Kinesiología General';
        if (tipo.includes('FISIOTERAPIA')) sub = 'Fisioterapia';
        else if (tipo.includes('KINESIOTERAPIA')) sub = 'Kinesioterapia';
        else if (tipo.includes('PISO PELVICO')) sub = 'Rehabilitación de Piso Pélvico';
        else if (tipo.includes('DRENAJE LINFATICO')) sub = 'Drenaje Linfático Manual';
        else if (tipo.includes('CONSULTA KINESIOLOGIA')) sub = 'Consulta Kinesiología';
        return { key: 'kinesiologia', label: 'Kinesiología y Rehabilitación', subcategoria: sub };
    }

    // 4. DIAGNÓSTICO POR IMÁGENES
    if (
        ['ECOGRAFISTA', 'MAMOGRAFIA', 'DENSITOMETRIA', 'TOMOGRAFIA COMPUTADA', 'RADIOLOGIA', 'DIAGNOSTICO POR IMAGENES'].includes(esp) ||
        tipo.startsWith('(ECO)') ||
        tipo.startsWith('(TC)') ||
        (tipo.startsWith('(RX)') && !tipo.includes('MONITOREO FETAL'))
    ) {
        let sub = 'Ecografías y Eco Doppler';
        if (esp === 'MAMOGRAFIA' || tipo.includes('MAMOGRAF')) sub = 'Mamografía Digital';
        else if (esp === 'DENSITOMETRIA' || tipo.includes('DENSITOMETR')) sub = 'Densitometría Ósea';
        else if (esp === 'TOMOGRAFIA COMPUTADA' || tipo.startsWith('(TC)')) sub = 'Tomografía Computada (TC)';
        else if (esp === 'CARDIOLOGIA' && tipo.startsWith('(ECO)')) sub = 'Ecocardiograma / Doppler Cardíaco';
        else if (esp === 'RADIOLOGIA' || tipo.startsWith('(RX)')) sub = 'Radiología (RX)';
        return { key: 'diagnostico_imagenes', label: 'Diagnóstico por Imágenes', subcategoria: sub };
    }

    return { key: 'otras_especialidades', label: 'Otras Especialidades (Consultorios)', subcategoria: esp || tipo || 'General' };
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

    const currentMonthIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const isCurrentMonth = periodoIso === currentMonthIso;
    const todayStr = now.toISOString().substring(0, 10).replace(/-/g, ''); // YYYYMMDD

    // Si es mes actual, solo evaluar citas que ya sucedieron (días anteriores a hoy, o de hoy cuya hora ya pasó o ya tienen asistencia registrada)
    // Se mantiene [Fecha Visita] <= todayStr en el nivel de índice (SARGable) y se excluyen las horas futuras de hoy sin asistencia
    const fechaVisitaEndFilter = isCurrentMonth
        ? `AND [Fecha Visita] <= '${todayStr} 23:59:59'
           AND (
               [Fecha Visita] < '${todayStr}'
               OR [Asistencia] IS NOT NULL
               OR [Hora Inicio Visita Formato Texto] <= CONVERT(VARCHAR(8), GETDATE(), 108)
           )`
        : `AND [Fecha Visita] < '${endDate}'`;

    // Fecha de lookback (3 meses atrás) para aprovechar índices cuando el turno se asignó sobre un hueco creado previamente
    const lookbackDateObj = new Date(year, month - 4, 1);
    const lookbackDate = `${lookbackDateObj.getFullYear()}${String(lookbackDateObj.getMonth() + 1).padStart(2, '0')}01`;
    const citaMonthPattern = `%/${startMonthStr}/${year} %`;

    // 1. TURNOS CREADOS / ASIGNADOS EN EL PERÍODO DESGLOSADOS POR ESPECIALIDAD Y TIPO DE VISITA (Bolsa 2 Grupal + Individual + Análisis de Servicios)
    // Contempla tanto [Usuario Creacion Nombre] como la traza nominal con fecha/hora en [UsuarioCita] (ej. 'APELLIDO, NOMBRE(DD/MM/YYYY HH:MM:SS)')
    const turnosQuery = `
        SELECT 
            ISNULL([Visita_Especialidad], 'SIN ESPECIALIDAD') AS Especialidad,
            ISNULL([Tipo Visita], 'SIN TIPO VISITA') AS TipoVisita,
            COUNT(DISTINCT CASE WHEN ([Fecha Hora Creacion] >= '${startDate}' AND [Fecha Hora Creacion] < '${endDate}' AND [Usuario Creacion Nombre] = 'OLIVIER ESQUIVEL, SOFIA FERNANDA')
                                  OR [UsuarioCita] LIKE '%OLIVIER ESQUIVEL, SOFIA%(${citaMonthPattern}' THEN [idVisita] END) AS solivier,
            COUNT(DISTINCT CASE WHEN ([Fecha Hora Creacion] >= '${startDate}' AND [Fecha Hora Creacion] < '${endDate}' AND [Usuario Creacion Nombre] = 'JACQUES SORIA, VIRGINIA')
                                  OR [UsuarioCita] LIKE '%JACQUES SORIA, VIRGINIA%(${citaMonthPattern}' THEN [idVisita] END) AS vjacques,
            COUNT(DISTINCT CASE WHEN ([Fecha Hora Creacion] >= '${startDate}' AND [Fecha Hora Creacion] < '${endDate}' AND [Usuario Creacion Nombre] LIKE 'AGUILERA%DANIELA%')
                                  OR [UsuarioCita] LIKE '%AGUILERA%DANIELA%(${citaMonthPattern}' THEN [idVisita] END) AS daguilera,
            COUNT(DISTINCT CASE WHEN ([Fecha Hora Creacion] >= '${startDate}' AND [Fecha Hora Creacion] < '${endDate}' AND [Usuario Creacion Nombre] LIKE 'LEAL,%ERICA%')
                                  OR [UsuarioCita] LIKE '%LEAL,%ERICA%(${citaMonthPattern}' THEN [idVisita] END) AS eleal,
            COUNT(DISTINCT CASE WHEN ([Fecha Hora Creacion] >= '${startDate}' AND [Fecha Hora Creacion] < '${endDate}' AND [Usuario Creacion Nombre] = 'ACOSTA ESQUIVEL, MARIA ANTONELLA')
                                  OR [UsuarioCita] LIKE '%ACOSTA ESQUIVEL, MARIA ANTONELLA%(${citaMonthPattern}' THEN [idVisita] END) AS macosta
        FROM [SALUS].[dbo].[VLISE_Visitas] WITH (NOLOCK)
        WHERE ([Fecha Hora Creacion] >= '${lookbackDate}' OR [Fecha Visita] >= '${startDate}')
          AND ([Fecha Hora Creacion] IS NULL OR [Fecha Hora Creacion] < '${endDate}')
          AND ([Paciente] IS NULL OR [Paciente] <> 'TURNOS ONLINE, PACIENTE')
        GROUP BY [Visita_Especialidad], [Tipo Visita]
    `;

    // 2. ASISTENCIA EFECTIVA (Bolsa 3 Individual)
    // Se priorizan siempre las que efectivamente se han hecho: presente, sobreturno, urgencia, internado
    // Y se cuentan únicamente las ausencias explícitas (las citas futuras o sin registrar no penalizan como ausencias)
    const asistenciaQuery = `
        WITH CitasAgente AS (
            SELECT 
                [idVisita],
                [Asistencia],
                CASE 
                    WHEN [Usuario Creacion Nombre] IN (${agentNamesSql}) THEN [Usuario Creacion Nombre]
                    WHEN [UsuarioCita] LIKE '%OLIVIER ESQUIVEL, SOFIA%' THEN 'OLIVIER ESQUIVEL, SOFIA FERNANDA'
                    WHEN [UsuarioCita] LIKE '%JACQUES SORIA, VIRGINIA%' THEN 'JACQUES SORIA, VIRGINIA'
                    WHEN [UsuarioCita] LIKE '%AGUILERA%DANIELA%' THEN 'AGUILERA CARDOZO, DANIELA ROMINA'
                    WHEN [UsuarioCita] LIKE '%LEAL,%ERICA%' THEN 'LEAL, ERICA'
                    WHEN [UsuarioCita] LIKE '%ACOSTA ESQUIVEL, MARIA ANTONELLA%' THEN 'ACOSTA ESQUIVEL, MARIA ANTONELLA'
                    ELSE NULL
                END AS AgenteResuelto
            FROM [SALUS].[dbo].[VLISE_Visitas]
            WHERE [Fecha Visita] >= '${startDate}'
              ${fechaVisitaEndFilter}
              AND ([Paciente] IS NULL OR [Paciente] <> 'TURNOS ONLINE, PACIENTE')
        )
        SELECT 
            AgenteResuelto AS Agente,
            COUNT(DISTINCT [idVisita]) AS TotalCitas,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%asist%' 
                       OR LOWER([Asistencia]) LIKE '%realiz%' 
                       OR LOWER([Asistencia]) = 'presente' 
                       OR LOWER([Asistencia]) = 'sobreturno' 
                       OR LOWER([Asistencia]) = 'urgencia' 
                       OR LOWER([Asistencia]) LIKE '%internad%' 
                     THEN 1 ELSE 0 END) AS Asistidas,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%injustificada%' 
                       OR LOWER([Asistencia]) LIKE '%ausen%' 
                     THEN 1 ELSE 0 END) AS Ausencias,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%justificada%' AND LOWER([Asistencia]) NOT LIKE '%injustificada%' THEN 1 ELSE 0 END) AS Justificadas,
            SUM(CASE WHEN LOWER([Asistencia]) LIKE '%anulad%' OR LOWER([Asistencia]) LIKE '%cancel%' OR LOWER([Asistencia]) LIKE '%susp%' THEN 1 ELSE 0 END) AS Anuladas,
            SUM(CASE WHEN [Asistencia] IS NULL THEN 1 ELSE 0 END) AS SinRegistrar
        FROM CitasAgente
        WHERE AgenteResuelto IS NOT NULL
        GROUP BY AgenteResuelto
    `;

    const [turnosRes, asistenciaRes] = await Promise.all([
        pool.request().query(turnosQuery),
        pool.request().query(asistenciaQuery)
    ]);

    // Consolidar por colaboradora canónica
    const createEmptyServiciosAgente = () => ({
        diagnostico_imagenes: 0,
        chequeo: 0,
        prevenir: 0,
        kinesiologia: 0,
        otras_especialidades: 0
    });

    const agentesMap = {
        solivier: { id: 'solivier', salusKey: 'OLIVIER ESQUIVEL, SOFIA FERNANDA', name: 'Sofia Olivier', rol: 'Senior', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0, sinRegistrar: 0, servicios: createEmptyServiciosAgente() },
        vjacques: { id: 'vjacques', salusKey: 'JACQUES SORIA, VIRGINIA', name: 'Virginia Jacques', rol: 'Senior', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0, sinRegistrar: 0, servicios: createEmptyServiciosAgente() },
        daguilera: { id: 'daguilera', salusKey: 'AGUILERA CARDOZO, DANIELA ROMINA', name: 'Daniela Aguilera', rol: 'Senior', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0, sinRegistrar: 0, servicios: createEmptyServiciosAgente() },
        eleal: { id: 'eleal', salusKey: 'LEAL, ERICA', name: 'Erica Leal', rol: 'Curva de Aprendizaje (50%)', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0, sinRegistrar: 0, servicios: createEmptyServiciosAgente() },
        macosta: { id: 'macosta', salusKey: 'ACOSTA ESQUIVEL, MARIA ANTONELLA', name: 'Antonella Acosta', rol: 'Baja en Septiembre', turnos: 0, citasTotales: 0, asistidas: 0, ausencias: 0, justificadas: 0, anuladas: 0, sinRegistrar: 0, servicios: createEmptyServiciosAgente() }
    };

    // Estructura de análisis estratégico de servicios (DxI, Chequeo, Prevenir, Kinesiología)
    const initCatNode = (key, label) => ({
        key,
        label,
        total: 0,
        porAgente: { solivier: 0, vjacques: 0, daguilera: 0, eleal: 0, macosta: 0 },
        subcategoriasMap: {}
    });

    const categoriasServiciosMap = {
        diagnostico_imagenes: initCatNode('diagnostico_imagenes', 'Diagnóstico por Imágenes'),
        chequeo: initCatNode('chequeo', 'Chequeo Preventivo'),
        prevenir: initCatNode('prevenir', 'Programa Prevenir'),
        kinesiologia: initCatNode('kinesiologia', 'Kinesiología y Rehabilitación'),
        otras_especialidades: initCatNode('otras_especialidades', 'Consultorios y Otras Especialidades')
    };

    const activeAgentKeys = Object.keys(agentesMap).filter(agId => !(periodoIso >= '2026-10' && agId === 'macosta'));

    // Agregar turnos creados / asignados desde filas agrupadas por (Especialidad, TipoVisita)
    for (const row of (turnosRes.recordset || [])) {
        const clasif = clasificarServicioTurno(row.Especialidad, row.TipoVisita);
        const catNode = categoriasServiciosMap[clasif.key] || categoriasServiciosMap.otras_especialidades;

        let rowTotalActive = 0;
        for (const agId of Object.keys(agentesMap)) {
            const cnt = Number(row[agId] || 0);
            if (cnt > 0) {
                agentesMap[agId].turnos += cnt;
                agentesMap[agId].servicios[clasif.key] = (agentesMap[agId].servicios[clasif.key] || 0) + cnt;
                if (activeAgentKeys.includes(agId)) {
                    catNode.porAgente[agId] = (catNode.porAgente[agId] || 0) + cnt;
                    rowTotalActive += cnt;
                }
            }
        }

        if (rowTotalActive > 0) {
            catNode.total += rowTotalActive;
            const subName = clasif.subcategoria;
            if (!catNode.subcategoriasMap[subName]) {
                catNode.subcategoriasMap[subName] = {
                    nombre: subName,
                    total: 0,
                    solivier: 0,
                    vjacques: 0,
                    daguilera: 0,
                    eleal: 0,
                    macosta: 0
                };
            }
            catNode.subcategoriasMap[subName].total += rowTotalActive;
            for (const agId of activeAgentKeys) {
                catNode.subcategoriasMap[subName][agId] += Number(row[agId] || 0);
            }
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
            agentesMap[meta.id].sinRegistrar += (row.SinRegistrar || 0);
        }
    }

    // Días hábiles y proyección inteligente para el mes
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const currentDay = isCurrentMonth ? now.getDate() : totalDaysInMonth;

    let diasHabilesTotales = 0;
    let diasHabilesTranscurridos = 0;
    for (let d = 1; d <= totalDaysInMonth; d++) {
        const testDate = new Date(year, month - 1, d);
        const dayOfWeek = testDate.getDay();
        const isLaborable = dayOfWeek !== 0 && dayOfWeek !== 6;
        if (isLaborable) {
            diasHabilesTotales++;
            if (d <= currentDay) {
                diasHabilesTranscurridos++;
            }
        }
    }
    diasHabilesTranscurridos = Math.max(1, diasHabilesTranscurridos);
    const factorHabiles = isCurrentMonth ? (diasHabilesTotales / diasHabilesTranscurridos) : 1.0;

    // Calcular totales grupales y métricas individuales
    const totalTurnosGrupal = Object.values(agentesMap).reduce((acc, a) => acc + a.turnos, 0);
    const turnosProyectadosGrupal = Math.round(totalTurnosGrupal * factorHabiles);
    const escalonTurnos = calculateEscalon(totalTurnosGrupal, 'turnos');
    const escalonTurnosProy = calculateEscalon(turnosProyectadosGrupal, 'turnos');

    const listaAgentes = Object.values(agentesMap).map(ag => {
        // Evaluables = Todos los turnos ya sucedidos/vencidos (incluyendo los que quedaron con Asistencia NULL al no presentarse el paciente)
        const evaluables = ag.citasTotales;
        const asistenciaPct = evaluables > 0 
            ? Math.round(((ag.asistidas / evaluables) * 100) * 100) / 100 
            : 0;

        const escalonAsistencia = calculateEscalon(asistenciaPct, 'asistencia');

        // Estado y FTE sugerido
        let estado = 'ACTIVA';
        let fte = 1.0;
        if (ag.id === 'eleal') {
            fte = 1.0; // Cobra el 100% de todo; su demanda exigida es el 50%
            estado = 'CURVA_APRENDIZAJE';
        } else if (ag.id === 'macosta') {
            if (periodoIso >= '2026-09') {
                fte = periodoIso === '2026-09' ? 0.2 : 0;
                estado = 'BAJA';
            }
        }

        const dotacion = 4;
        const factorDemanda = ag.id === 'eleal' ? 0.5 : 1.0;
        const escalonTurnosIndiv = calculateEscalon(ag.turnos, 'turnos', dotacion, factorDemanda);
        const turnosProyIndiv = Math.round(ag.turnos * factorHabiles);
        const escalonTurnosProyIndiv = calculateEscalon(turnosProyIndiv, 'turnos', dotacion, factorDemanda);

        return {
            ...ag,
            evaluables,
            asistenciaPct,
            escalonAsistencia: escalonAsistencia.escalon,
            montoAsistencia: escalonAsistencia.monto,
            escalonTurnos: escalonTurnosIndiv.escalon,
            montoTurnos: escalonTurnosIndiv.monto,
            turnosProyectados: turnosProyIndiv,
            escalonTurnosProyectado: escalonTurnosProyIndiv.escalon,
            montoTurnosProyectado: escalonTurnosProyIndiv.monto,
            baseGarantizada: INCENTIVO_TIERS.baseGarantizada,
            estado,
            fte,
            factorDemanda
        };
    }).filter(ag => !(periodoIso >= '2026-10' && ag.id === 'macosta'));

    // Calcular total de turnos grupales de la dotación activa
    const totalTurnosActivos = listaAgentes.reduce((acc, a) => acc + a.turnos, 0);
    const totalTurnosProyectados = Math.round(totalTurnosActivos * factorHabiles);
    const escalonTurnosActivos = calculateEscalon(totalTurnosActivos, 'turnos');
    const escalonTurnosActivosProy = calculateEscalon(totalTurnosProyectados, 'turnos');

    // Construir objeto final de análisis de servicios (DxI, Chequeo, Prevenir, Kinesiología)
    const formatCatNode = (catNode) => {
        const pctSobreTotal = totalTurnosActivos > 0
            ? Math.round(((catNode.total / totalTurnosActivos) * 100) * 100) / 100
            : 0;
        const subcategorias = Object.values(catNode.subcategoriasMap)
            .sort((a, b) => b.total - a.total)
            .map(s => ({
                ...s,
                pctSobreCategoria: catNode.total > 0 ? Math.round(((s.total / catNode.total) * 100) * 10) / 10 : 0,
                pctSobreTotal: totalTurnosActivos > 0 ? Math.round(((s.total / totalTurnosActivos) * 100) * 10) / 10 : 0
            }));
        return {
            key: catNode.key,
            label: catNode.label,
            total: catNode.total,
            proyeccion: Math.round(catNode.total * factorHabiles),
            pctSobreTotal,
            porAgente: catNode.porAgente,
            subcategorias
        };
    };

    const totalEstrategicos = (
        categoriasServiciosMap.diagnostico_imagenes.total +
        categoriasServiciosMap.chequeo.total +
        categoriasServiciosMap.prevenir.total +
        categoriasServiciosMap.kinesiologia.total
    );

    const analisisServicios = {
        totalTurnosAnalizados: totalTurnosActivos,
        totalEstrategicos,
        pctEstrategicos: totalTurnosActivos > 0 ? Math.round(((totalEstrategicos / totalTurnosActivos) * 100) * 100) / 100 : 0,
        diagnostico_imagenes: formatCatNode(categoriasServiciosMap.diagnostico_imagenes),
        chequeo: formatCatNode(categoriasServiciosMap.chequeo),
        prevenir: formatCatNode(categoriasServiciosMap.prevenir),
        kinesiologia: formatCatNode(categoriasServiciosMap.kinesiologia),
        otras_especialidades: formatCatNode(categoriasServiciosMap.otras_especialidades)
    };

    return {
        periodo: periodoIso,
        startDate,
        endDate,
        isCurrentMonth,
        currentDay,
        totalDaysInMonth,
        diasHabilesTranscurridos,
        diasHabilesTotales,
        factorHabiles: Math.round(factorHabiles * 1000) / 1000,
        config: INCENTIVO_TIERS,
        turnosGrupales: {
            total: totalTurnosActivos,
            proyeccion: totalTurnosProyectados,
            escalon: escalonTurnosActivos.escalon,
            escalonProyectado: escalonTurnosActivosProy.escalon,
            montoPorAgente: escalonTurnosActivos.monto,
            montoProyectadoPorAgente: escalonTurnosActivosProy.monto,
            meta: INCENTIVO_TIERS.bolsas.turnos.meta,
            tope: INCENTIVO_TIERS.bolsas.turnos.tope,
            progresoPct: escalonTurnosActivos.progresoPct
        },
        analisisServicios,
        agentes: listaAgentes
    };
}

/**
 * Obtiene los turnos creados hoy (o en una fecha dada) por cada operadora en SALUS.
 */
export async function getTurnosDiariosContactCenter(pool, { fecha = null } = {}) {
    const today = fecha || new Date().toISOString().substring(0, 10); // YYYY-MM-DD
    const dateFormatted = today.replace(/-/g, '');
    const [yyyy, mm, dd] = today.split('-');
    const dmyStr = `${dd}/${mm}/${yyyy}`;

    const d = new Date(today + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1);
    const nextDayFormatted = d.toISOString().substring(0, 10).replace(/-/g, '');

    const lookbackD = new Date(today + 'T12:00:00Z');
    lookbackD.setUTCDate(lookbackD.getUTCDate() - 60);
    const lookbackFormatted = lookbackD.toISOString().substring(0, 10).replace(/-/g, '');

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
            [UsuarioCita],
            [Fecha Hora Creacion] AS CreadoEl
        FROM [SALUS].[dbo].[VLISE_Visitas]
        WHERE ([Fecha Hora Creacion] >= '${lookbackFormatted}' OR [Fecha Visita] >= '${dateFormatted}')
          AND (
              ([Fecha Hora Creacion] >= '${dateFormatted}' AND [Fecha Hora Creacion] < '${nextDayFormatted}' AND [Usuario Creacion Nombre] IN (${agentNamesSql}))
              OR ([UsuarioCita] LIKE '%(${dmyStr} %' AND (
                  [UsuarioCita] LIKE '%OLIVIER ESQUIVEL%' OR
                  [UsuarioCita] LIKE '%JACQUES SORIA%' OR
                  [UsuarioCita] LIKE '%AGUILERA%DANIELA%' OR
                  [UsuarioCita] LIKE '%LEAL,%ERICA%' OR
                  [UsuarioCita] LIKE '%ACOSTA ESQUIVEL%'
              ))
          )
          AND ([Paciente] IS NULL OR [Paciente] <> 'TURNOS ONLINE, PACIENTE')
        ORDER BY [Fecha Hora Creacion] DESC
    `;

    const res = await pool.request().query(query);
    const agentesMap = {
        solivier: { id: 'solivier', salusKey: 'OLIVIER ESQUIVEL, SOFIA FERNANDA', name: 'Sofia Olivier', turnos: 0, turnosDetalle: [], seenVisitas: new Set() },
        vjacques: { id: 'vjacques', salusKey: 'JACQUES SORIA, VIRGINIA', name: 'Virginia Jacques', turnos: 0, turnosDetalle: [], seenVisitas: new Set() },
        daguilera: { id: 'daguilera', salusKey: 'AGUILERA CARDOZO, DANIELA ROMINA', name: 'Daniela Aguilera', turnos: 0, turnosDetalle: [], seenVisitas: new Set() },
        eleal: { id: 'eleal', salusKey: 'LEAL, ERICA', name: 'Erica Leal', turnos: 0, turnosDetalle: [], seenVisitas: new Set() },
        macosta: { id: 'macosta', salusKey: 'ACOSTA ESQUIVEL, MARIA ANTONELLA', name: 'Antonella Acosta', turnos: 0, turnosDetalle: [], seenVisitas: new Set() }
    };

    const CITA_AGENT_PATTERNS = [
        { id: 'solivier', regex: new RegExp(`OLIVIER ESQUIVEL[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'vjacques', regex: new RegExp(`JACQUES SORIA[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'daguilera', regex: new RegExp(`AGUILERA[^()]*DANIELA[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'eleal', regex: new RegExp(`LEAL,\\s*ERICA[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') },
        { id: 'macosta', regex: new RegExp(`ACOSTA ESQUIVEL[^()]*\\(${dmyStr}\\s+(\\d{2}:\\d{2}:\\d{2})\\)`, 'i') }
    ];

    for (const row of (res.recordset || [])) {
        const matchedAgents = new Map();
        const meta = SALUS_AGENTS_MAP[row.Agente];
        const creadoStr = row.CreadoEl ? new Date(row.CreadoEl).toISOString().substring(0, 10) : '';
        if (meta && agentesMap[meta.id] && creadoStr === today) {
            matchedAgents.set(meta.id, row.CreadoEl ? new Date(row.CreadoEl).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '');
        }
        if (row.UsuarioCita) {
            for (const pat of CITA_AGENT_PATTERNS) {
                const m = row.UsuarioCita.match(pat.regex);
                if (m && !matchedAgents.has(pat.id)) {
                    matchedAgents.set(pat.id, m[1] || '');
                }
            }
        }

        for (const [agId, horaAccion] of matchedAgents.entries()) {
            const agObj = agentesMap[agId];
            if (!agObj || agObj.seenVisitas.has(row.idVisita)) continue;
            agObj.seenVisitas.add(row.idVisita);
            agObj.turnos += 1;
            agObj.turnosDetalle.push({
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
                horaCreacion: horaAccion || (row.CreadoEl ? new Date(row.CreadoEl).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''),
                creadoEl: row.CreadoEl ? row.CreadoEl.toISOString() : ''
            });
        }
    }

    const cleanAgentes = Object.values(agentesMap).map(({ seenVisitas, ...rest }) => rest);

    return {
        fecha: today,
        synced_at: new Date().toISOString(),
        total: cleanAgentes.reduce((acc, a) => acc + a.turnos, 0),
        agentes: cleanAgentes
    };
}

