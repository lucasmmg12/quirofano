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

    return {
        REGLA_PRIORIDAD_ABSOLUTA:
            'SIEMPRE prioriza los números exactos de "pantallaActiva.datosEnPantallaAhoraMismo" y de "dashboardsEnVivoSincronizados" por sobre cualquier estimación o valor histórico, para que tus cifras coincidan 100% con lo que el usuario está viendo en su pantalla.',
        pantallaActiva,
        dashboardsEnVivoSincronizados: {
            UCI_CuidadosCriticos: uciCtx || (activeTelarSector === 'UCI' ? legacyIndCtx : null),
            GuardiaClinica_Internado: guardiaCtx,
            QuirofanoCentral_HospitalDeDia: quirofanoCtx,
            DiagnosticoPorImagenes_DxI: dxiCtx,
            VigilanciaEpidemiologica_SNVS_C2: epidemiologiaCtx,
            ProyectosGobernanza: proyectosCtx
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

