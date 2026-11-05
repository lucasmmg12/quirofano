import { GOBERNANZA_PROJECTS_DOSSIER_DATA } from './gobernanzaServiceProjectPdf';
import { RENDICION_GOBIERNO_DATA } from './gobernanzaRendicionGobiernoPdf';

/**
 * Sincronizador Maestro de Contexto en Tiempo Real para Beto IA — Sanatorio Argentino
 * Garantiza que los números que ve el usuario en cualquier Dashboard de la plataforma
 * coincidan 100% con las respuestas de Beto, y que desde cualquier módulo del sistema
 * se pueda consultar toda la información de Gobernanza de Datos y Operaciones.
 */
export function buildUnifiedBetoContext(activeModule = 'global') {
    if (typeof window === 'undefined') return null;

    const activeTelarSector = window.__telar_active_sector || 'UCI';
    const uciCtx = window.__uci_active_context || null;
    const guardiaCtx = window.__guardia_active_context || null;
    const quirofanoCtx = window.__quirofano_active_context || null;
    const dxiCtx = window.__dxi_active_context || null;
    const epidemiologiaCtx = window.__epidemiologia_active_context || null;
    const proyectosCtx = window.__gobernanza_proyectos_context || null;
    const deudasCtx = window.__deudas_active_context || null;
    const legacyIndCtx = window.__indicadores_active_context || null;

    // Determinar cuál es el panel exacto que el usuario está mirando ahora mismo en pantalla
    let pantallaActiva = {
        moduloGeneral: activeModule,
        sectorGobernanzaActivo: activeModule === 'gobernanza_indicadores' ? activeTelarSector : null,
        datosEnPantallaAhoraMismo: null
    };

    if (activeModule === 'gobernanza_indicadores') {
        if (activeTelarSector === 'UCI') {
            pantallaActiva.datosEnPantallaAhoraMismo = uciCtx || legacyIndCtx;
        } else if (activeTelarSector === 'GUARDIA') {
            pantallaActiva.datosEnPantallaAhoraMismo = guardiaCtx || legacyIndCtx;
        } else if (activeTelarSector === 'QUIROFANO') {
            pantallaActiva.datosEnPantallaAhoraMismo = quirofanoCtx || legacyIndCtx;
        } else if (activeTelarSector === 'DXI') {
            pantallaActiva.datosEnPantallaAhoraMismo = dxiCtx || legacyIndCtx;
        } else if (activeTelarSector === 'EPIDEMIOLOGIA') {
            pantallaActiva.datosEnPantallaAhoraMismo = epidemiologiaCtx || legacyIndCtx;
        } else {
            pantallaActiva.datosEnPantallaAhoraMismo = legacyIndCtx;
        }
    } else if (activeModule === 'gobernanza') {
        pantallaActiva.datosEnPantallaAhoraMismo = proyectosCtx;
    } else if (activeModule === 'deudas') {
        pantallaActiva.datosEnPantallaAhoraMismo = deudasCtx;
    }

    // Compendio estructurado de los 5 Dossiers Oficiales de Gobernanza de Datos
    const catalogoCincoServiciosGobernanza = Object.values(GOBERNANZA_PROJECTS_DOSSIER_DATA).map((d) => ({
        key: d.key,
        codigo: d.codigo,
        titulo: d.titulo,
        servicio: d.servicio,
        estado: d.estado,
        resumen: d.resumenCorto,
        metricasClave: d.metricasResumen,
        indicadoresAuditados: (d.indicadoresTabla || []).map((row) => ({
            indicador: row[0],
            fuenteSalus: row[1],
            formulaRegla: row[2],
            estado: row[3]
        }))
    }));

    // Snapshots auditados por defecto (cuando el usuario consulta desde Inicio u otro módulo antes de montar una pestaña específica del Telar)
    const defaultSnapshots = {
        UCI: {
            modulo: 'Gobernanza Indicadores - Unidad de Cuidados Críticos (UCI)',
            sectorId: 'UCI',
            capacidadInstalada: '16 camas reales operativas (8 UTI Boxes 1..8 + 8 Terapia Intermedia Hab. 222..229)',
            metricasPorPeriodo: {
                '2026-10 (Octubre 2026)': {
                    diasCamaOcupados: 408,
                    diasUtiIntensiva: 139,
                    diasTerapiaIntermedia: 269,
                    tasaOcupacionGlobalPct: '82.3%',
                    tasaOcupacionUtiPct: '56.0%',
                    tasaOcupacionIntermediaPct: '108.5%',
                    totalPacientesUnicos: 78,
                    estanciaMediaDias: 5.2,
                    defunciones: 3,
                    tasaMortalidadPct: '3.8%'
                },
                '2026-09 (Septiembre 2026)': {
                    diasCamaOcupados: 438,
                    diasUtiIntensiva: 146,
                    diasTerapiaIntermedia: 292,
                    tasaOcupacionGlobalPct: '91.3%',
                    tasaOcupacionUtiPct: '60.8%',
                    tasaOcupacionIntermediaPct: '121.7%',
                    totalPacientesUnicos: 94,
                    estanciaMediaDias: 4.7,
                    defunciones: 7,
                    tasaMortalidadPct: '7.4%'
                },
                '2026-08 (Agosto 2026)': {
                    diasCamaOcupados: 439,
                    diasUtiIntensiva: 145,
                    diasTerapiaIntermedia: 294,
                    tasaOcupacionGlobalPct: '88.5%',
                    totalPacientesUnicos: 88,
                    estanciaMediaDias: 5.0,
                    defunciones: 8,
                    tasaMortalidadPct: '9.1%'
                },
                '2026-07 (Julio 2026)': {
                    diasCamaOcupados: 379,
                    diasUtiIntensiva: 111,
                    diasTerapiaIntermedia: 268,
                    tasaOcupacionGlobalPct: '76.4%',
                    totalPacientesUnicos: 89,
                    estanciaMediaDias: 4.3,
                    defunciones: 13,
                    tasaMortalidadPct: '14.6%'
                }
            }
        },
        GUARDIA: {
            modulo: 'Gobernanza Indicadores - Guardia Clínica y Seguimiento en Internado',
            sectorId: 'GUARDIA',
            metricasPorPeriodo: {
                '2026-ANUAL (Acumulado 2026)': {
                    totalConsultasGuardia: 14561,
                    tasaConversionCirugiaPct: '9.67%',
                    esperaMediaMedicoMin: 28.58,
                    permanenciaMediaGuardiaMin: 43.20,
                    tasaReconsulta72hPct: '5.25%',
                    tasaReinternacion72hPct: '4.20%',
                    estanciaMediaClinicaDias: 1.73,
                    adherenciaEpicrisisPct: '99.52%'
                },
                '2026-10 (Octubre 2026)': {
                    totalConsultasGuardia: 1744,
                    tasaConversionCirugiaBrutaPct: '9.12%',
                    conversionQuirurgica48h: { totalPases: 46, urgenciasRealesDepuradas: 34, programadasExcluidas: 12 },
                    esperaMediaMedicoMin: 31.47,
                    permanenciaMediaGuardiaMin: 45.83,
                    coberturaTriagePct: '36.75%',
                    tasaReconsulta72hPct: '4.76%',
                    tasaReinternacion72hPct: '0.00%',
                    estanciaMediaClinicaDias: 1.70,
                    adherenciaEpicrisisPct: '100%',
                    admisionesClinicasDesdeGuardia: { total: 239, internadoPiso: 154, quirofano: 54, uci: 31 },
                    franjasHorarias: [
                        { franja: '08 a 14', consultas: 638, esperaPromedioMin: 29.19, cumplimientoMetaPct: '63.11%', masDe60m: 78 },
                        { franja: '14 a 22', consultas: 794, esperaPromedioMin: 34.12, cumplimientoMetaPct: '58.78%', masDe60m: 133 },
                        { franja: '22 a 08', consultas: 312, esperaPromedioMin: 29.45, cumplimientoMetaPct: '73.44%', masDe60m: 47 }
                    ]
                },
                '2026-09 (Septiembre 2026)': {
                    totalConsultasGuardia: 1831,
                    curvaOportunidadValidas: {
                        totalAuditadas: 1830,
                        enMeta30m: '1.044 (57.0%)',
                        demoraLeve31a60m: '462 (25.2%)',
                        outliersModerados61a90m: 163,
                        outliersCriticosMas90m: 149,
                        permanenciaProlongadaMas3h: 47
                    },
                    tasaConversionCirugiaBrutaPct: '8.41%',
                    conversionQuirurgica48h: { totalPases: 36, urgenciasRealesDepuradas: 31, programadasExcluidas: 5 },
                    esperaMediaMedicoMin: 34.94,
                    permanenciaMediaGuardiaMin: 47.21,
                    coberturaTriagePct: '28.35%',
                    tasaReconsulta72hPct: '5.63%',
                    tasaReinternacion72hPct: '3.49%',
                    estanciaMediaClinicaDias: 2.05,
                    adherenciaEpicrisisPct: '100%',
                    admisionesClinicasDesdeGuardia: { total: 220, internadoPiso: 126, quirofano: 56, uci: 38 }
                }
            },
            seguimientoInternadoYTrauma2026: {
                totalAdmisionesClinicasAuditadas: 1862,
                conFichaHcCompleta: 1461,
                adherenciaHcPct: '78.5%',
                distribucionAreas: { internadoPiso: 1089, shockRoom: 664, uci: 270 },
                reconsultas72h: 65,
                reingresos72h: 20,
                tasaReingresoPct: '1.07%',
                internacionesTraumatologiaAuditadas: 302,
                redInterconsultasHospitalarias: { total: 3233, clinicas: 238, especialidades: 2995 }
            }
        },
        QUIROFANO: {
            modulo: 'Gobernanza Indicadores - Quirófano Central y Hospital de Día (HdD)',
            sectorId: 'QUIROFANO',
            capacidadInstalada: '7 Salas (Qx 1 a Qx 4 Centrales, Qx 5 y Qx 6 Hospital de Día, Sala de Partos)',
            serieMensualSalus2026: {
                '2026-10 (Octubre 2026)': { totalAgendadasSalus: 1029, centrales: 638, hdd: 391, realizadasEfectivas: 820, presentes: 748, urgencias: 44, noProgramadas: 28, suspendidasTotal: 163, suspendidas24h: 113, suspendidasEnElDia: 50, tasaSuspensionSalus: '15.8%' },
                '2026-09 (Septiembre 2026)': { totalAgendadasSalus: 969, centrales: 604, hdd: 365, realizadasEfectivas: 819, presentes: 748, urgencias: 26, noProgramadas: 45, suspendidasTotal: 145, suspendidas24h: 102, suspendidasEnElDia: 43, tasaSuspensionSalus: '15.0%' },
                '2026-08 (Agosto 2026)': { totalAgendadasSalus: 933, centrales: 615, hdd: 318, realizadasEfectivas: 773, presentes: 686, urgencias: 38, noProgramadas: 49, suspendidasTotal: 155, suspendidas24h: 126, suspendidasEnElDia: 29, tasaSuspensionSalus: '16.6%' }
            },
            cortesTableroNominal: {
                octubre2026: { programadas: 629, realizadas: 560, suspendidasBrutas: 69, tasaSuspBruta: '10.97%', causal2ObraSocial: 15 },
                septiembre2026: { programadas: 599, realizadas: 527, suspendidasBrutas: 72, tasaSuspBruta: '12.02%', causal2ObraSocial: 16 },
                benchmarkMayo2026: { realizadas: 713, central: 557, hdd: 156, horasEfectivas: 1535.5, ocupacionCentralPromedio: '84.2%' }
            },
            bloquesQuirurgicosAuditados: '10 bloques quirúrgicos institucionales (Agosto y Septiembre 2026) con regla de liberación automática a 7 días si ocupación < 45%.'
        },
        DXI: {
            modulo: 'Gobernanza Indicadores - Diagnóstico por Imágenes (DxI)',
            sectorId: 'DXI',
            reglaForense: 'Clasificación en 5 modalidades oficiales (Ecografía, Radiología, Mamografía, Tomografía Computada y Densitometría Ósea) con exclusión estricta de contrastes en TC.',
            metricasPorPeriodo: {
                '2026-10 (Octubre 2026 - Mes Cerrado)': {
                    estudiosEfectivamenteRealizados: 9382,
                    totalTurnosCitados: 12044,
                    tasaEfectividadPct: '77.9%',
                    desglosePorModalidad: {
                        ECOGRAFIA: { realizados: 6543, pct: '69.74%' },
                        RADIOLOGIA: { realizados: 1497, pct: '15.96%' },
                        MAMOGRAFIA: { realizados: 687, pct: '7.32%' },
                        TOMOGRAFIA_SIN_CONTRASTE: { realizados: 470, pct: '5.01%' },
                        DENSITOMETRIA: { realizados: 185, pct: '1.97%' }
                    },
                    ausentesNoShow: 1563,
                    tasaAusentismoPct: '13.0%',
                    sinRegistrarPendientesCierre: 1099,
                    estudiosInformados: 7489,
                    pctInformados: '79.8%',
                    pendientesInforme: 1893
                },
                '2026-09 (Septiembre 2026)': {
                    estudiosEfectivamenteRealizados: 10237,
                    totalTurnosCitados: 12664,
                    tasaEfectividadPct: '80.8%',
                    desglosePorModalidad: {
                        ECOGRAFIA: 6902,
                        RADIOLOGIA: 1840,
                        MAMOGRAFIA: 768,
                        TOMOGRAFIA_SIN_CONTRASTE: 488,
                        DENSITOMETRIA: 239
                    },
                    ausentesNoShow: 1621,
                    sinRegistrarPendientesCierre: 806,
                    estudiosInformados: 8175
                },
                '2026-08 (Agosto 2026)': {
                    estudiosEfectivamenteRealizados: 9873,
                    totalTurnosCitados: 12518,
                    desglosePorModalidad: {
                        ECOGRAFIA: 6959,
                        RADIOLOGIA: 1670,
                        MAMOGRAFIA: 723,
                        TOMOGRAFIA_SIN_CONTRASTE: 399,
                        DENSITOMETRIA: 122
                    }
                }
            }
        },
        EPIDEMIOLOGIA: {
            modulo: 'Gobernanza Indicadores - Vigilancia Epidemiológica (Planilla C2 SNVS 2.0 y Neurocirugía - Dr. Romano)',
            sectorId: 'EPIDEMIOLOGIA',
            totalNotificaciones12Meses: 2920,
            periodoConsolidado: 'Noviembre 2025 a Octubre 2026 (12 meses)',
            hitosEstacionales: {
                picoInvernalJunio2026: { total: 483, etiInfluenza: 240, neumonia: 92, bronquiolitisMenor2Anios: 88, diarreas: 28, ets: 20, varicela: 15 },
                julio2026: { total: 416, etiInfluenza: 198, neumonia: 79, bronquiolitisMenor2Anios: 72, diarreas: 31, ets: 22, varicela: 14 },
                agosto2026: { total: 310, etiInfluenza: 134, neumonia: 58, bronquiolitisMenor2Anios: 45, diarreas: 38, ets: 24, varicela: 11 },
                septiembre2026: { total: 212, etiInfluenza: 78, diarreas: 44, neumonia: 34, ets: 27, bronquiolitisMenor2Anios: 22, varicela: 7 },
                octubre2026: { total: 156, etiInfluenza: 49, diarreas: 48, neumonia: 23, ets: 17, bronquiolitisMenor2Anios: 14, varicela: 5 }
            },
            reglaBronquiolitis: 'Validación estricta DATEDIFF(MONTH, FechaNacimiento, FechaVisita) < 24 meses cumplidos al día de la consulta.',
            neurocirugia: 'Indicador N° 7 completado: trazabilidad de 5 años de cirugías (CX) en Neurocirugía y Neurología.'
        }
    };

    return {
        REGLA_PRIORIDAD_ABSOLUTA:
            'SIEMPRE prioriza los números exactos de "pantallaActiva.datosEnPantallaAhoraMismo" y de "dashboardsEnVivoSincronizados" por sobre cualquier estimación o valor histórico, para que tus cifras coincidan 100% con lo que el usuario está viendo en su pantalla.',
        pantallaActiva,
        dashboardsEnVivoSincronizados: {
            UCI_CuidadosCriticos: uciCtx || (activeTelarSector === 'UCI' ? legacyIndCtx : null) || defaultSnapshots.UCI,
            GuardiaClinica_Internado: guardiaCtx || defaultSnapshots.GUARDIA,
            QuirofanoCentral_HospitalDeDia: quirofanoCtx || defaultSnapshots.QUIROFANO,
            DiagnosticoPorImagenes_DxI: dxiCtx || defaultSnapshots.DXI,
            VigilanciaEpidemiologica_SNVS_C2: epidemiologiaCtx || defaultSnapshots.EPIDEMIOLOGIA,
            ProyectosGobernanza: proyectosCtx,
            Deudas_Cobranzas: deudasCtx
        },
        baseConocimientoGobernanzaDatos: {
            resumenEjecutivo:
                'Programa Institucional de Gobernanza Clínica y de Datos del Sanatorio Argentino (Innovación y Transformación Digital). Cuenta con toda la arquitectura e infraestructura híbrida montada (SALUS SQL Server -> Sync Server -> Supabase PostgreSQL + Edge Functions IA + Dashboards React/Vite Telar).',
            alcanceGlobal: {
                sectoresTotalesObjetivo: 29,
                serviciosTroncalesYaDesplegadosEnProduccion: 5,
                indicadoresSqlAuditadosEnProduccion: 52,
                avanceInfraestructuraTecnologica: '100% montada y operativa',
                etapaActual: 'Escalamiento metodológico de entrevistas y relevamiento hacia los 24 sectores restantes (total 29 sectores institucionales).'
            },
            equipoOperativoGobernanza: [
                {
                    integrante: 'Pamela (Jefa de Tecnología y Sistemas - TyS)',
                    rol: 'Gestión de relevamiento institucional, agenda y conducción de entrevistas con referentes de los 29 sectores.'
                },
                {
                    integrante: 'Matías (Analista de Datos)',
                    rol: 'Ingeniería de datos, consultas SQL en SALUS, validación de reglas de negocio, diccionarios de datos y vistas analíticas.'
                },
                {
                    integrante: 'Lucas (Desarrollador Frontend)',
                    rol: 'Diseño e implementación de interfaces clínicas, dashboards interactivos en el Telar, experiencia de usuario y exportadores PDF/Excel.'
                }
            ],
            rendicionTecnicaContableGobiernoSJ: {
                programa: RENDICION_GOBIERNO_DATA?.encabezado?.programa || 'ANR Gobierno de San Juan',
                beneficiario: 'Sanatorio Argentino S.R.L.',
                presupuestoTotalRendicion: '$ 25.565.000,00 ARS (ANR Agencia: $ 18.000.000 + Contraparte Sanatorio: $ 7.565.000)',
                resumenEstado: 'Etapa 1 de Arquitectura, ETL SALUS-Supabase, Grabador IA y 5 Dashboards Troncales 100% operativa. Etapa 2 de entrevistas en curso.'
            },
            cincoServiciosActivos: catalogoCincoServiciosGobernanza
        }
    };
}

