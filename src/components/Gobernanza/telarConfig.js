/**
 * telarConfig.js — Configuración centralizada de Sectores e Indicadores del Telar
 * Normado para Sanatorio Argentino (Calidad-QOAG)
 */

export const SECTORES_CONFIG = [
    { 
        id: 'UCI', 
        label: 'Cuidados Críticos (UCI)', 
        shortLabel: 'UCI',
        icon: '🏥', 
        camasDefault: 16,
        serviciosSalus: ['UCI', 'TERAPIA INTERMEDIA'],
        descripcion: '16 camas operativas (UTI 8 + UTIN 8)',
        activo: true
    },
    { 
        id: 'QUIROFANO', 
        label: 'Quirófano Central', 
        shortLabel: 'Quirófano',
        icon: '🔪', 
        camasDefault: 0,
        serviciosSalus: ['QUIROFANO'],
        descripcion: 'Cirugía Mayor y Ambulatoria',
        activo: false,
        badge: 'Próximamente'
    },
    { 
        id: 'INTERNACION_GENERAL', 
        label: 'Internación General', 
        shortLabel: 'Piso',
        icon: '🛏️', 
        camasDefault: 40,
        serviciosSalus: ['INTERNACION GENERAL'],
        descripcion: 'Salas de Internación 2° y 3° Piso',
        activo: false,
        badge: 'Próximamente'
    },
    { 
        id: 'MATERNIDAD_NEO', 
        label: 'Maternidad y Neonatología', 
        shortLabel: 'Maternidad & Neo',
        icon: '👶', 
        camasDefault: 20,
        serviciosSalus: ['NEONATOLOGIA', 'MATERNIDAD'],
        descripcion: 'Área Materno-Infantil y Cuidados Neonatales',
        activo: false,
        badge: 'Próximamente'
    },
    { 
        id: 'GUARDIA', 
        label: 'Guardia y Emergencias', 
        shortLabel: 'Guardia Clínica',
        icon: '🚑', 
        camasDefault: 6,
        serviciosSalus: ['GUARDIA', 'URGENCIAS'],
        descripcion: 'Urgencias Médicas, Triage y Shockroom',
        activo: true
    }
];

export const INDICADORES_CATALOGO = [
    // ─── GRUPO 1: CAPACIDAD Y DOTACIÓN ───
    {
        id: 'kpi_dias_ocupados',
        label: 'Días Camas Ocupados',
        grupo: 'Capacidad y Dotación',
        tipo: 'kpi',
        icon: 'Bed',
        descripcion: 'Total de camas-día naturales ocupadas por pacientes internados en el período.',
        isDefault: true,
    },
    {
        id: 'kpi_dias_disponibles',
        label: 'Días Camas Disponibles',
        grupo: 'Capacidad y Dotación',
        tipo: 'kpi',
        icon: 'Activity',
        descripcion: 'Capacidad teórica máxima instalada (Camas operativas × Días del período).',
        isDefault: true,
    },
    {
        id: 'kpi_porc_ocupacion',
        label: '% de Ocupación',
        grupo: 'Capacidad y Dotación',
        tipo: 'kpi',
        icon: 'Activity',
        descripcion: 'Tasa de ocupación del servicio con semáforo de saturación.',
        isDefault: true,
    },
    {
        id: 'kpi_alos',
        label: 'Promedio de Estancia (ALOS)',
        grupo: 'Estancia y Rotación',
        tipo: 'kpi',
        icon: 'Clock',
        descripcion: 'Días promedio de permanencia por paciente egresado.',
        isDefault: false,
    },

    // ─── GRUPO 2: SEGURIDAD Y RESULTADOS ───
    {
        id: 'kpi_porc_defuncion',
        label: '% de Defunción (Mortalidad Cruda)',
        grupo: 'Seguridad y Calidad',
        tipo: 'kpi',
        icon: 'AlertTriangle',
        descripcion: 'Porcentaje de defunciones sobre el total de pacientes únicos egresados.',
        isDefault: true,
    },
    {
        id: 'chart_motivos_alta',
        label: 'Motivos de Egreso / Alta',
        grupo: 'Seguridad y Calidad',
        tipo: 'donut',
        icon: 'PieChart',
        descripcion: 'Distribución de egresos: Alta Médica, Traslado, Defunción, Voluntaria.',
        isDefault: true,
    },

    // ─── GRUPO 3: DEMANDA Y ESPECIALIDADES ───
    {
        id: 'chart_especialidades',
        label: 'Admisiones por Especialidad',
        grupo: 'Demanda y Especialidades',
        tipo: 'stacked_bar',
        icon: 'BarChart3',
        descripcion: 'Evolución mensual de admisiones segmentada por especialidad tratante.',
        isDefault: true,
    },
    {
        id: 'chart_admisiones_totales',
        label: 'Admisiones Totales por Mes',
        grupo: 'Demanda y Especialidades',
        tipo: 'bar',
        icon: 'BarChart3',
        descripcion: 'Volumen mensual de pacientes ingresados con etiquetas numéricas.',
        isDefault: true,
    },
    {
        id: 'chart_procedencia',
        label: 'Canal de Procedencia',
        grupo: 'Demanda y Especialidades',
        tipo: 'bar_horizontal',
        icon: 'Layers',
        descripcion: 'Origen del ingreso (Urgencias, Quirófano, Derivación Externa, Programado).',
        isDefault: false,
    },
    {
        id: 'chart_clientes',
        label: 'Obras Sociales y Financiadores',
        grupo: 'Demanda y Especialidades',
        tipo: 'bar_horizontal',
        icon: 'Users',
        descripcion: 'Distribución de internaciones por financiador principal.',
        isDefault: false,
    },

    // ─── GRUPO 4: DEMOGRAFÍA Y ESTANCIAS ───
    {
        id: 'chart_rango_etario',
        label: 'Distribución por Rango Etario',
        grupo: 'Demografía y Estancias',
        tipo: 'donut',
        icon: 'PieChart',
        descripcion: 'Proporción de pacientes: Pediátrico, Adulto Joven, Adulto, Mayor.',
        isDefault: true,
    },
    {
        id: 'chart_estancias',
        label: 'Categorías de Estancias',
        grupo: 'Demografía y Estancias',
        tipo: 'stacked_bar',
        icon: 'BarChart3',
        descripcion: 'Admisiones según tiempo de permanencia: Corta (1-2d), Media (3-7d), Larga (>7d).',
        isDefault: true,
    },
    {
        id: 'table_admisiones_resumen',
        label: 'Tabla Tabulada de Auditoría',
        grupo: 'Auditoría y Trazabilidad',
        tipo: 'table',
        icon: 'FileText',
        descripcion: 'Grilla de datos detallada de admisiones con buscador y exportación.',
        isDefault: false,
    },

    // ─── GRUPO 5: ESTUDIOS Y PRUEBAS CLÍNICAS (VLISE) ───
    {
        id: 'kpi_intensidad_diagnostica',
        label: 'Intensidad Diagnóstica (Estudios / Cama-Día)',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'kpi',
        icon: 'Activity',
        descripcion: 'Promedio de estudios diagnósticos solicitados por cada día-cama ocupado en la unidad.',
        isDefault: true,
    },
    {
        id: 'chart_produccion_origen',
        label: 'Composición Diagnóstica en UCI',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'donut',
        icon: 'PieChart',
        descripcion: 'Distribución dinámica de estudios solicitados según modalidad (Laboratorio, Diagnóstico por Imágenes, Anatomía Patológica) alineada a los filtros activos.',
        isDefault: true,
    },
    {
        id: 'chart_top_estudios_uci',
        label: 'Top Estudios Clínicos Solicitados',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'bar_horizontal',
        icon: 'Activity',
        descripcion: 'Ranking de los estudios más solicitados (Hemograma, Gases en sangre, Ionograma, Ecografías, TAC, etc.).',
        isDefault: true,
    },
    {
        id: 'chart_estudios_por_box',
        label: 'Distribución de Estudios por Box / Cama',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'bar',
        icon: 'Bed',
        descripcion: 'Demanda de estudios diagnósticos desagregada por Box de Terapia Intensiva y Unidades de Terapia Intermedia.',
        isDefault: true,
    },
    {
        id: 'chart_solicitantes_uci',
        label: 'Médicos Solicitantes Más Activos',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'bar_horizontal',
        icon: 'Users',
        descripcion: 'Profesionales médicos con mayor volumen de solicitudes de estudios clínicos.',
        isDefault: false,
    },
    {
        id: 'table_peticiones_detalle',
        label: 'Auditoría de Peticiones y Pruebas',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'table',
        icon: 'FileText',
        descripcion: 'Trazabilidad detallada de peticiones por paciente, fecha, estudio, modalidad, habitación y solicitante.',
        isDefault: false,
    }
];

export const DEFAULT_ACTIVE_INDICATOR_IDS = INDICADORES_CATALOGO
    .filter(i => i.isDefault)
    .map(i => i.id);

// ─── CATÁLOGO DE INDICADORES DE GUARDIA CLÍNICA (SALUS) ───
export const INDICADORES_GUARDIA_CATALOGO = [
    {
        id: 'guardia_conversion_cirugia',
        label: 'Tasa de Conversión a Cirugía',
        grupo: 'Resolutividad y Quirófano',
        tipo: 'kpi',
        icon: 'Activity',
        descripcion: 'Porcentaje de pacientes asistidos en Guardia que ingresan a Quirófano dentro de las 24 hs.',
        benchmark: '8% - 12%',
        origen: 'VLISE_Visitas cruzada con TABLEAU_Admisiones por NHC'
    },
    {
        id: 'guardia_tiempos_espera',
        label: 'Tiempos de Espera (Triage y Médico)',
        grupo: 'Oportunidad y Acceso',
        tipo: 'kpi',
        icon: 'Clock',
        descripcion: 'Minutos promedio desde el ingreso hasta la atención médica efectiva y permanencia total.',
        benchmark: '< 30 min (Atención)',
        origen: 'VLISE_Visitas (Marcas de Fecha Entrada Real, Fecha Hora Entrada, Fecha Salida Real)'
    },
    {
        id: 'guardia_cobertura_triage',
        label: 'Cobertura y Clasificación de Triage',
        grupo: 'Oportunidad y Acceso',
        tipo: 'kpi',
        icon: 'CheckCircle',
        descripcion: 'Porcentaje de pacientes con nivel de severidad asignado formalmente (N1 a N3).',
        benchmark: '> 95%',
        origen: 'VLISE_Visitas ([Tipo Visita] N1, N2, N3)'
    },
    {
        id: 'guardia_reconsulta_72h',
        label: 'Tasa de Reconsulta (72 hs)',
        grupo: 'Seguridad y Calidad Clínica',
        tipo: 'kpi',
        icon: 'RotateCcw',
        descripcion: 'Porcentaje de pacientes que retornan a la Guardia dentro de las 72 hs por el mismo episodio.',
        benchmark: '< 7%',
        origen: 'VLISE_Visitas (Autocruce temporal por NHC)'
    },
    {
        id: 'guardia_reinternacion_72h',
        label: 'Tasa de Reinternación Temprana (72 hs)',
        grupo: 'Seguridad y Calidad Clínica',
        tipo: 'kpi',
        icon: 'AlertTriangle',
        descripcion: 'Pacientes dados de alta de internación clínica que reingresan antes de las 72 horas.',
        benchmark: '< 5%',
        origen: 'TABLEAU_Admisiones (Procedencia Urgencias, Especialidad CLINICO)'
    },
    {
        id: 'guardia_volumen_imagenes',
        label: 'Volumen de TAC y Rx Solicitadas',
        grupo: 'Apoyo Diagnóstico',
        tipo: 'kpi',
        icon: 'Layers',
        descripcion: 'Intensidad diagnóstica de imágenes: total de estudios TAC y Rx y tasa cada 100 consultas.',
        benchmark: '25 - 35 / 100 consult.',
        origen: 'VLISE_PeticionesPruebasRadiologia vinculada a consultas de Guardia'
    },
    {
        id: 'guardia_destinos_post',
        label: 'Distribución de Destinos Post-Guardia',
        grupo: 'Gestión de Pacientes',
        tipo: 'donut',
        icon: 'PieChart',
        descripcion: 'Distribución de egresos: Domicilio, Piso de Internación, Terapia, Quirófano o Derivación.',
        benchmark: 'Trazabilidad 100%',
        origen: 'VLISE_Visitas cruzada con TABLEAU_Admisiones'
    },
    {
        id: 'guardia_estada_clinica',
        label: 'Promedio de Días de Estada Clínica',
        grupo: 'Gestión de Camas',
        tipo: 'kpi',
        icon: 'Bed',
        descripcion: 'Días promedio de internación para pacientes derivados desde Urgencias a sala general clínica.',
        benchmark: '1.5 - 2.5 días',
        origen: 'TABLEAU_Admisiones (Especialidad CLINICO, campo Dias)'
    },
    {
        id: 'guardia_adherencia_epicrisis',
        label: 'Tasa de Adherencia a Epicrisis',
        grupo: 'Auditoría y Normativa',
        tipo: 'kpi',
        icon: 'FileText',
        descripcion: 'Porcentaje de pacientes egresados con Protocolo 382 (Epicrisis Médica) completado en SALUS.',
        benchmark: '100% obligatorio',
        origen: 'TABLEAU_Admisiones y PR RespuestasProtocolo (Protocolo 382)'
    }
];

export const DEFAULT_ACTIVE_GUARDIA_IDS = INDICADORES_GUARDIA_CATALOGO.map(i => i.id);

