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
        camasDefault: 19,
        serviciosSalus: ['UCI', 'TERAPIA INTERMEDIA'],
        descripcion: 'Unidad de Cuidados Críticos (Terapia Intensiva + Terapia Intermedia)'
    },
    { 
        id: 'NEONATOLOGÍA', 
        label: 'Neonatología', 
        shortLabel: 'Neo',
        icon: '👶', 
        camasDefault: 20,
        descripcion: 'Unidad de cuidados intensivos e intermedios neonatales'
    },
    { 
        id: 'INTERNADO', 
        label: 'Internación Clínica', 
        shortLabel: 'Internación',
        icon: '🏨', 
        camasDefault: 45,
        descripcion: 'Pisos de internación médica y quirúrgica general'
    },
    { 
        id: 'PEDIATRÍA', 
        label: 'Pediatría', 
        shortLabel: 'Pediatría',
        icon: '🧸', 
        camasDefault: 15,
        descripcion: 'Internación pediátrica y cuidados infantiles'
    },
    { 
        id: 'TODOS', 
        label: 'Todos los Servicios del Sanatorio', 
        shortLabel: 'Todos',
        icon: '🌐', 
        camasDefault: 107,
        descripcion: 'Consolidado institucional global'
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
        label: 'Producción por Origen y Reclasificación Forense',
        grupo: 'Estudios y Pruebas Clínicas',
        tipo: 'donut',
        icon: 'PieChart',
        descripcion: 'Distribución institucional global con visión dual: Nominal SALUS (75.7% vs 24.3%) y Gobernanza Reclasificada (rescate de 30.743 estudios de internación/guardia).',
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

