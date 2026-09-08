import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
    BookOpen, Filter, Calendar, Bed, Activity, Users, 
    AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, RotateCcw, 
    X, FileText, Layers, PanelLeftClose, PanelLeftOpen, LayoutDashboard, 
    Sparkles, RefreshCw, Sliders, Table, Eye, Download, Clock, HeartHandshake
} from 'lucide-react';
import SalusSyncButton from '../SalusSyncButton';
import TelarCatalogoDrawer from './TelarCatalogoDrawer';
import TelarDataModal from './TelarDataModal';
import { SECTORES_CONFIG, INDICADORES_CATALOGO, DEFAULT_ACTIVE_INDICATOR_IDS } from './telarConfig';

const COLORS_ETARIO = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444'];
const COLORS_MOTIVO = ['#F97316', '#EF4444', '#06B6D4', '#8B5CF6', '#10B981', '#6B7280'];
const COLORS_ESTANCIA = {
    corta: '#3B82F6',   // 1-2 días (Azul)
    media: '#F97316',   // 3-7 días (Naranja)
    larga: '#EF4444'    // >7 días (Rojo)
};

const ESPECIALIDAD_PALETTE = [
    '#F59E0B', '#10B981', '#3B82F6', '#8B5CF6', '#EC4899', 
    '#14B8A6', '#6366F1', '#F97316', '#06B6D4', '#84CC16',
    '#A855F7', '#EAB308', '#64748B', '#D946EF', '#0EA5E9'
];

export default function DiasOcupacionDashboard({ onOpenInfografia, onMetricsUpdate, addToast }) {
    // === ESTADOS DE NAVEGACIÓN Y SECTOR ===
    const [sidebarOpen, setSidebarOpen] = useState(true);
    const [sectorId, setSectorId] = useState('UCI');
    const [especialidad, setEspecialidad] = useState('TODOS');
    const [camasTotales, setCamasTotales] = useState(11);
    const [fechaDesde, setFechaDesde] = useState('2025-06-01');
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // === ESTADOS MODULARES DE INDICADORES ===
    const [activeIndicatorIds, setActiveIndicatorIds] = useState(() => {
        try {
            const saved = localStorage.getItem('telar_active_indicators_v2');
            return saved ? JSON.parse(saved) : DEFAULT_ACTIVE_INDICATOR_IDS;
        } catch {
            return DEFAULT_ACTIVE_INDICATOR_IDS;
        }
    });

    const [isCatalogoOpen, setIsCatalogoOpen] = useState(false);
    const [inspectDataIndicator, setInspectDataIndicator] = useState(null);

    // Guardar indicadores activos en localStorage
    useEffect(() => {
        try {
            localStorage.setItem('telar_active_indicators_v2', JSON.stringify(activeIndicatorIds));
        } catch {}
    }, [activeIndicatorIds]);

    const handleToggleIndicator = (id) => {
        setActiveIndicatorIds(prev => {
            if (prev.includes(id)) {
                if (prev.length <= 1) {
                    addToast?.('Debe haber al menos un indicador activo en el Telar', 'info');
                    return prev;
                }
                return prev.filter(item => item !== id);
            } else {
                return [...prev, id];
            }
        });
    };

    const handleResetDefaults = () => {
        setActiveIndicatorIds(DEFAULT_ACTIVE_INDICATOR_IDS);
        addToast?.('Indicadores predeterminados restablecidos', 'success');
    };

    // Estados de Datos de Ocupación
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [especialidadesDisponibles, setEspecialidadesDisponibles] = useState([]);

    // Estados de Datos de Peticiones y Estudios Clínicos (VLISE)
    const [peticionesResumen, setPeticionesResumen] = useState([]);
    const [peticionesEstudios, setPeticionesEstudios] = useState([]);
    const [loadingPeticiones, setLoadingPeticiones] = useState(false);
    
    // Modal de Documentación Técnica
    const [showDocModal, setShowDocModal] = useState(false);

    // Configuración del sector activo
    const activeSectorConfig = useMemo(() => {
        return SECTORES_CONFIG.find(s => s.id === sectorId) || SECTORES_CONFIG[0];
    }, [sectorId]);

    // Cuando cambia el sector, actualizar camas por defecto
    const handleSelectSector = (sId) => {
        setSectorId(sId);
        setEspecialidad('TODOS');
        const cfg = SECTORES_CONFIG.find(s => s.id === sId);
        if (cfg) {
            setCamasTotales(cfg.camasDefault);
        }
    };

    // Cargar datos desde Supabase
    useEffect(() => {
        fetchData();
    }, [sectorId, fechaDesde, fechaHasta]);

    const fetchData = async () => {
        setLoading(true);
        setLoadingPeticiones(true);
        try {
            // 1. Cargar Días Camas de Ocupación
            let query = supabase
                .from('calidad_admisiones_ocupacion')
                .select('*')
                .gte('fecha_ocupacion', fechaDesde)
                .lte('fecha_ocupacion', fechaHasta);

            if (sectorId === 'CRITICOS_CONSOLIDADO') {
                query = query.in('servicio', ['UCI', 'TERAPIA INTERMEDIA']);
            } else if (sectorId && sectorId !== 'TODOS') {
                query = query.eq('servicio', sectorId);
            }

            const { data, error } = await query;
            if (error) throw error;

            setRows(data || []);

            // Extraer especialidades dinámicas
            const especSet = new Set();
            data?.forEach(r => {
                if (r.especialidad) especSet.add(r.especialidad.trim());
            });
            setEspecialidadesDisponibles(Array.from(especSet).sort());

            // 2. Cargar Resumen Global por Origen (Query 2)
            try {
                const { data: resOrigen } = await supabase
                    .from('calidad_peticiones_resumen_origen')
                    .select('*')
                    .order('cantidad_estudios', { ascending: false });
                if (resOrigen && resOrigen.length > 0) {
                    setPeticionesResumen(resOrigen);
                }
            } catch (errRes) {
                console.warn('Advertencia cargando resumen de origen:', errRes);
            }

            // 3. Cargar Estudios Clínicos de UCI e Internación (Query 1)
            try {
                let pQuery = supabase
                    .from('calidad_peticiones_pruebas')
                    .select('*')
                    .gte('fecha_solicitud', fechaDesde + 'T00:00:00')
                    .lte('fecha_solicitud', fechaHasta + 'T23:59:59')
                    .limit(10000);

                const { data: pData } = await pQuery;
                setPeticionesEstudios(pData || []);
            } catch (errPet) {
                console.warn('Advertencia cargando estudios clínicos:', errPet);
            }

        } catch (err) {
            console.error('Error al cargar datos de gobernanza:', err);
        } finally {
            setLoading(false);
            setLoadingPeticiones(false);
        }
    };

    // Filtrar filas según Especialidad seleccionada
    const filteredRows = useMemo(() => {
        if (!especialidad || especialidad === 'TODOS') return rows;
        return rows.filter(r => r.especialidad && r.especialidad.trim() === especialidad.trim());
    }, [rows, especialidad]);

    // === CÁLCULO DE KPIS E INDICADORES ===
    const metrics = useMemo(() => {
        const diasOcupados = filteredRows.length;

        // Calcular días del período
        const dStart = new Date(fechaDesde);
        const dEnd = new Date(fechaHasta);
        const diffMs = Math.max(0, dEnd - dStart);
        const diasPeriodo = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

        const camasDisponibles = Number(camasTotales || 0) * diasPeriodo;
        const porcOcupacion = camasDisponibles > 0 
            ? ((diasOcupados / camasDisponibles) * 100).toFixed(1) 
            : '0.0';

        // Admisiones únicas en el período filtrado
        const admisionesMap = new Map();
        filteredRows.forEach(r => {
            const key = r.id_admision || r.numero_admision;
            if (!admisionesMap.has(key)) {
                admisionesMap.set(key, r);
            }
        });
        const admisionesUnicas = Array.from(admisionesMap.values());
        const totalAdmisiones = admisionesUnicas.length;

        // Tasa de defunción (% defunción sobre egresos/admisiones únicas)
        const defunciones = admisionesUnicas.filter(r => {
            const m = (r.motivo_de_alta || '').toLowerCase();
            return m.includes('defunci') || m.includes('fallecid') || m.includes('obito');
        }).length;

        const porcDefuncion = totalAdmisiones > 0 
            ? ((defunciones / totalAdmisiones) * 100).toFixed(1) 
            : '0.0';

        // Promedio de Estancia (ALOS)
        let sumEstancia = 0;
        let countEstancia = 0;
        admisionesUnicas.forEach(r => {
            if (r.fecha_ingreso && r.fecha_alta) {
                const diffTime = Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso));
                const days = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                sumEstancia += days;
                countEstancia++;
            }
        });
        const alos = countEstancia > 0 ? (sumEstancia / countEstancia).toFixed(1) : '—';

        // 1. Gráfico: Admisiones por Especialidad por Mes
        const mesesSet = new Set();
        filteredRows.forEach(r => {
            if (r.fecha_ocupacion) {
                mesesSet.add(r.fecha_ocupacion.substring(0, 7));
            }
        });
        const mesesSorted = Array.from(mesesSet).sort();

        const especialidadPorMes = {};
        mesesSorted.forEach(m => {
            especialidadPorMes[m] = {};
        });

        const topEspecialidadesSet = new Set();
        filteredRows.forEach(r => {
            const m = r.fecha_ocupacion?.substring(0, 7);
            const esp = r.especialidad ? r.especialidad.trim() : 'Sin Especialidad';
            if (m && especialidadPorMes[m]) {
                especialidadPorMes[m][esp] = (especialidadPorMes[m][esp] || 0) + 1;
                topEspecialidadesSet.add(esp);
            }
        });

        const topEspecialidades = Array.from(topEspecialidadesSet).slice(0, 15);
        const dataEspecialidades = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            const item = { mesKey: m, mes: mesNombre };
            topEspecialidades.forEach(esp => {
                item[esp] = especialidadPorMes[m][esp] || 0;
            });
            return item;
        });

        // 2. Gráfico: Admisiones Totales por Mes
        const admisionesPorMesMap = {};
        admisionesUnicas.forEach(r => {
            const m = r.fecha_ingreso ? r.fecha_ingreso.substring(0, 7) : null;
            if (m) {
                admisionesPorMesMap[m] = (admisionesPorMesMap[m] || 0) + 1;
            }
        });
        const dataAdmisionesTotales = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            return {
                mesKey: m,
                mes: mesNombre,
                total: admisionesPorMesMap[m] || 0
            };
        });

        // 3. Gráfico: Motivos de Alta
        const motivosMap = {};
        admisionesUnicas.forEach(r => {
            let m = (r.motivo_de_alta || 'Sin Alta Registrada').trim();
            if (m.toLowerCase().includes('alta m')) m = 'Alta médica';
            else if (m.toLowerCase().includes('traslado a otro')) m = 'Traslado a otro centro';
            else if (m.toLowerCase().includes('defunci')) m = 'Defunción';
            else if (m.toLowerCase().includes('voluntari')) m = 'Alta voluntaria';
            motivosMap[m] = (motivosMap[m] || 0) + 1;
        });
        const dataMotivosAlta = Object.keys(motivosMap)
            .map((k, idx) => ({
                label: k,
                value: motivosMap[k],
                color: COLORS_MOTIVO[idx % COLORS_MOTIVO.length]
            }))
            .sort((a, b) => b.value - a.value);

        // 4. Gráfico: Rango Etario
        const etarioMap = { 'Pediátrico (0-17)': 0, 'Adulto Joven (18-45)': 0, 'Adulto (46-65)': 0, 'Mayor (>65)': 0 };
        admisionesUnicas.forEach(r => {
            const edad = Number(r.edad);
            if (isNaN(edad)) return;
            if (edad <= 17) etarioMap['Pediátrico (0-17)']++;
            else if (edad <= 45) etarioMap['Adulto Joven (18-45)']++;
            else if (edad <= 65) etarioMap['Adulto (46-65)']++;
            else etarioMap['Mayor (>65)']++;
        });
        const dataRangoEtario = Object.keys(etarioMap).map((k, idx) => ({
            label: k,
            value: etarioMap[k],
            color: COLORS_ETARIO[idx % COLORS_ETARIO.length]
        }));

        // 5. Gráfico: Categorías de Estancias
        const estanciasPorMes = {};
        mesesSorted.forEach(m => {
            estanciasPorMes[m] = { corta: 0, media: 0, larga: 0 };
        });
        admisionesUnicas.forEach(r => {
            if (r.fecha_ingreso) {
                const m = r.fecha_ingreso.substring(0, 7);
                if (estanciasPorMes[m]) {
                    let dias = 1;
                    if (r.fecha_alta) {
                        const diffTime = Math.abs(new Date(r.fecha_alta) - new Date(r.fecha_ingreso));
                        dias = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    }
                    if (dias <= 2) estanciasPorMes[m].corta++;
                    else if (dias <= 7) estanciasPorMes[m].media++;
                    else estanciasPorMes[m].larga++;
                }
            }
        });
        const dataEstancias = mesesSorted.map(m => {
            const dObj = new Date(m + '-01T12:00:00');
            const mesNombre = dObj.toLocaleDateString('es-AR', { month: 'short', year: '2-digit' });
            return {
                mesKey: m,
                mes: mesNombre,
                corta: estanciasPorMes[m].corta,
                media: estanciasPorMes[m].media,
                larga: estanciasPorMes[m].larga
            };
        });

        // 6. Gráfico: Procedencia
        const procedenciaMap = {};
        admisionesUnicas.forEach(r => {
            const p = (r.procedencia || 'Sin Procedencia').trim();
            procedenciaMap[p] = (procedenciaMap[p] || 0) + 1;
        });
        const dataProcedencia = Object.keys(procedenciaMap)
            .map((k, idx) => ({
                label: k,
                value: procedenciaMap[k],
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 6);

        // 7. Gráfico: Obras Sociales / Clientes
        const clientesMap = {};
        admisionesUnicas.forEach(r => {
            const c = (r.cliente || 'Particular').trim();
            clientesMap[c] = (clientesMap[c] || 0) + 1;
        });
        const dataClientes = Object.keys(clientesMap)
            .map((k, idx) => ({
                label: k,
                value: clientesMap[k],
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        // 8. Gráfico: Producción por Origen (Query 2 de VLISE)
        let dataProduccionOrigen = [
            { name: 'Ambulatorio', value: 409913, pct: 75.7, color: '#3B82F6' },
            { name: 'Hospitalización', value: 131574, pct: 24.3, color: '#10B981' }
        ];
        if (peticionesResumen && peticionesResumen.length > 0) {
            dataProduccionOrigen = peticionesResumen.map(r => ({
                name: r.origen,
                value: Number(r.cantidad_estudios),
                pct: Number(r.porcentaje_produccion),
                color: r.origen?.toLowerCase().includes('ambulat') ? '#3B82F6' : '#10B981'
            }));
        }

        // 9. Gráfico: Top Pruebas y Estudios Clínicos (Query 1 de VLISE)
        const estudiosCounts = {};
        peticionesEstudios.forEach(p => {
            let est = p.estudio || 'SIN DETALLE';
            est = est.replace(/<[^>]+>/g, '').trim(); // Quitar códigos como <475>
            if (!est || est === 'SIN DETALLE') return;
            estudiosCounts[est] = (estudiosCounts[est] || 0) + 1;
        });
        const dataTopEstudios = Object.entries(estudiosCounts)
            .map(([label, value], idx) => ({
                label,
                value,
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 10);

        // 10. Gráfico: Top Médicos Solicitantes
        const solicitantesCounts = {};
        peticionesEstudios.forEach(p => {
            let sol = p.solicitante;
            if (!sol || sol.trim() === '') return;
            sol = sol.trim();
            solicitantesCounts[sol] = (solicitantesCounts[sol] || 0) + 1;
        });
        const dataTopSolicitantes = Object.entries(solicitantesCounts)
            .map(([label, value], idx) => ({
                label,
                value,
                color: ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]
            }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);

        const calculated = {
            diasOcupados,
            camasDisponibles,
            porcOcupacion,
            porcDefuncion,
            alos,
            totalAdmisiones,
            defunciones,
            dataEspecialidades,
            topEspecialidades,
            dataAdmisionesTotales,
            dataMotivosAlta,
            dataRangoEtario,
            dataEstancias,
            dataProcedencia,
            dataClientes,
            dataProduccionOrigen,
            dataTopEstudios,
            dataTopSolicitantes,
            totalEstudiosPeriodo: peticionesEstudios.length,
            admisionesUnicas
        };

        if (onMetricsUpdate) {
            onMetricsUpdate({
                sector: activeSectorConfig.label,
                camasTotales,
                diasOcupados,
                camasDisponibles,
                porcOcupacion,
                porcDefuncion,
                alos,
                totalAdmisiones,
                dataMotivosAlta,
                dataRangoEtario,
                topEspecialidades,
                dataProduccionOrigen,
                topEstudiosCount: dataTopEstudios.length
            });
        }

        return calculated;
    }, [filteredRows, camasTotales, fechaDesde, fechaHasta, activeSectorConfig, onMetricsUpdate, peticionesResumen, peticionesEstudios]);

    const isIndicatorActive = (id) => activeIndicatorIds.includes(id);

    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            background: '#F8FAFC',
            fontFamily: "'Inter', sans-serif"
        }}>
            
            {/* ─── BARRA SUPERIOR UNIFICADA ─── */}
            <div style={{
                background: '#FFFFFF',
                borderBottom: '1px solid #E2E8F0',
                padding: '12px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
                flexWrap: 'wrap',
                zIndex: 10
            }}>
                {/* Lado Izquierdo: Toggle Sidebar + Título del Sector */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                        onClick={() => setSidebarOpen(prev => !prev)}
                        title={sidebarOpen ? "Ocultar panel de sectores" : "Mostrar panel de sectores"}
                        style={{
                            background: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '7px',
                            cursor: 'pointer',
                            color: '#475569',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        {sidebarOpen ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
                    </button>

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '1.2rem' }}>{activeSectorConfig.icon}</span>
                            <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                                {activeSectorConfig.label}
                            </h2>
                            <span style={{
                                fontSize: '0.72rem',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontWeight: 700,
                                border: '1px solid #BFDBFE'
                            }}>
                                {activeIndicatorIds.length} Indicadores
                            </span>
                        </div>
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            {activeSectorConfig.descripcion}
                        </span>
                    </div>
                </div>

                {/* Filtros Paramétricos Centrales */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    
                    {/* Botón Catálogo de Indicadores */}
                    <button
                        onClick={() => setIsCatalogoOpen(true)}
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #2563EB',
                            color: '#1E40AF',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <Sliders size={15} />
                        Catálogo ({activeIndicatorIds.length})
                    </button>

                    {/* Botón Documentación Técnica */}
                    <button
                        onClick={() => setShowDocModal(true)}
                        style={{
                            background: '#F1F5F9',
                            border: '1px solid #CBD5E1',
                            color: '#334155',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer'
                        }}
                    >
                        <BookOpen size={15} color="#1E40AF" />
                        Fórmulas & SQL
                    </button>

                    <div style={{ height: '24px', width: '1px', background: '#E2E8F0' }} />

                    {/* Filtro Especialidad */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Especialidad:</span>
                        <select
                            value={especialidad}
                            onChange={(e) => setEspecialidad(e.target.value)}
                            style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#1E293B',
                                background: '#FFFFFF',
                                maxWidth: '160px'
                            }}
                        >
                            <option value="TODOS">(Todas)</option>
                            {especialidadesDisponibles.map(esp => (
                                <option key={esp} value={esp}>{esp}</option>
                            ))}
                        </select>
                    </div>

                    {/* Camas Totales */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748B' }}>Camas:</span>
                        <input
                            type="number"
                            min="1"
                            max="300"
                            value={camasTotales}
                            onChange={(e) => setCamasTotales(Number(e.target.value))}
                            style={{
                                width: '55px',
                                padding: '5px 6px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                fontWeight: 700,
                                color: '#1E40AF',
                                textAlign: 'center'
                            }}
                        />
                    </div>

                    {/* Fechas */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Calendar size={14} color="#64748B" />
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                            style={{
                                padding: '4px 6px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.75rem',
                                color: '#1E293B'
                            }}
                        />
                        <span style={{ color: '#94A3B8', fontSize: '0.8rem' }}>a</span>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                            style={{
                                padding: '4px 6px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.75rem',
                                color: '#1E293B'
                            }}
                        />
                    </div>

                </div>

                {/* Sincronización y Exportación IA */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <SalusSyncButton />
                    
                    {onOpenInfografia && (
                        <button
                            onClick={onOpenInfografia}
                            style={{
                                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                                color: '#FFFFFF',
                                border: 'none',
                                borderRadius: '8px',
                                padding: '7px 12px',
                                fontWeight: 600,
                                fontSize: '0.8rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                cursor: 'pointer'
                            }}
                        >
                            <Sparkles size={14} />
                            Infografía AI
                        </button>
                    )}
                </div>
            </div>

            {/* ─── CUERPO UNIFICADO: SIDEBAR DE SECTORES + LIENZO MODULAR DEL TELAR ─── */}
            <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
                
                {/* SIDEBAR LATERAL: SECTORES HOSPITALARIOS */}
                {sidebarOpen && (
                    <div style={{
                        width: '250px',
                        background: '#FFFFFF',
                        borderRight: '1px solid #E2E8F0',
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'auto'
                    }}>
                        <div style={{
                            padding: '14px 16px',
                            borderBottom: '1px solid #F1F5F9',
                            fontSize: '0.75rem',
                            fontWeight: 800,
                            color: '#64748B',
                            textTransform: 'uppercase',
                            letterSpacing: '0.6px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <span>Sectores / Áreas</span>
                            <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{SECTORES_CONFIG.length}</span>
                        </div>

                        <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            {SECTORES_CONFIG.map(s => {
                                const isSelected = sectorId === s.id;
                                return (
                                    <button
                                        key={s.id}
                                        onClick={() => handleSelectSector(s.id)}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                            padding: '10px 12px',
                                            borderRadius: '8px',
                                            border: isSelected ? '1px solid #BFDBFE' : '1px solid transparent',
                                            background: isSelected ? '#EFF6FF' : 'transparent',
                                            color: isSelected ? '#1E40AF' : '#334155',
                                            fontWeight: isSelected ? 700 : 500,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            textAlign: 'left',
                                            transition: 'all 0.15s ease'
                                        }}
                                        onMouseOver={e => {
                                            if (!isSelected) e.currentTarget.style.background = '#F8FAFC';
                                        }}
                                        onMouseOut={e => {
                                            if (!isSelected) e.currentTarget.style.background = 'transparent';
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '1.1rem' }}>{s.icon}</span>
                                            <div>
                                                <div>{s.shortLabel}</div>
                                                <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{s.camasDefault} camas</span>
                                            </div>
                                        </div>
                                        {isSelected && <ChevronRight size={16} color="#2563EB" />}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* LIENZO PRINCIPAL DEL TELAR (MODULAR) */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
                    {loading ? (
                        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '350px', flexDirection: 'column', gap: '12px' }}>
                            <RefreshCw className="animate-spin" size={36} color="#2563EB" />
                            <span style={{ color: '#64748B', fontSize: '0.9rem', fontWeight: 600 }}>
                                Cargando indicadores del sector {activeSectorConfig.label}...
                            </span>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            
                            {/* ─── BLOQUE 1: SCORECARDS EJECUTIVOS ─── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                                
                                {/* 1. Días Camas Ocupados */}
                                {isIndicatorActive('kpi_dias_ocupados') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)', position: 'relative'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Días Camas Ocupados
                                            </span>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'kpi_dias_ocupados', label: 'Días Camas Ocupados', sector: activeSectorConfig.label })}
                                                title="Ver datos tabulados"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1E293B', margin: '8px 0' }}>
                                            {metrics.diasOcupados.toLocaleString('es-AR')}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#10B981', fontWeight: 600 }}>
                                            ✓ Total pernoctadas / camas consumidas
                                        </span>
                                    </div>
                                )}

                                {/* 2. Días Camas Disponibles */}
                                {isIndicatorActive('kpi_dias_disponibles') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Días Camas Disponibles
                                            </span>
                                            <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{camasTotales} camas</span>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#1E293B', margin: '8px 0' }}>
                                            {metrics.camasDisponibles.toLocaleString('es-AR')}
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            Capacidad instalada del sector
                                        </span>
                                    </div>
                                )}

                                {/* 3. % de Ocupación */}
                                {isIndicatorActive('kpi_porc_ocupacion') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                % de Ocupación
                                            </span>
                                            <span style={{
                                                width: '10px', height: '10px', borderRadius: '50%',
                                                background: Number(metrics.porcOcupacion) > 95 ? '#EF4444' : Number(metrics.porcOcupacion) > 85 ? '#F59E0B' : '#10B981'
                                            }} />
                                        </div>
                                        <div style={{
                                            fontSize: '2.2rem', fontWeight: 800, margin: '8px 0',
                                            color: Number(metrics.porcOcupacion) > 95 ? '#EF4444' : Number(metrics.porcOcupacion) > 85 ? '#D97706' : '#10B981'
                                        }}>
                                            {metrics.porcOcupacion}%
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            {Number(metrics.porcOcupacion) > 95 ? '⚠️ Alta Saturación' : 'Normal operativa'}
                                        </span>
                                    </div>
                                )}

                                {/* 4. % de Defunción */}
                                {isIndicatorActive('kpi_porc_defuncion') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                % de Defunción
                                            </span>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'kpi_porc_defuncion', label: 'Mortalidad y Egresos', sector: activeSectorConfig.label })}
                                                title="Ver datos tabulados"
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#EF4444', margin: '8px 0' }}>
                                            {metrics.porcDefuncion}%
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            {metrics.defunciones} de {metrics.totalAdmisiones} admisiones únicas
                                        </span>
                                    </div>
                                )}

                                {/* 5. Promedio de Estancia (ALOS) - Activado o desde catálogo */}
                                {isIndicatorActive('kpi_alos') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '18px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
                                        boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                                                Promedio de Estancia
                                            </span>
                                            <Clock size={16} color="#2563EB" />
                                        </div>
                                        <div style={{ fontSize: '2.2rem', fontWeight: 800, color: '#2563EB', margin: '8px 0' }}>
                                            {metrics.alos} <span style={{ fontSize: '1rem', fontWeight: 600 }}>días</span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                            Rotación media por paciente
                                        </span>
                                    </div>
                                )}

                            </div>

                            {/* ─── BLOQUE 2: ADMISIONES POR ESPECIALIDAD Y TOTALES ─── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '20px' }}>
                                
                                {/* Gráfico: Admisiones por Especialidad */}
                                {isIndicatorActive('chart_especialidades') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                                Cantidad de Admisiones por Especialidad
                                            </h3>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'chart_especialidades', label: 'Admisiones por Especialidad', sector: activeSectorConfig.label })}
                                                style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '4px 8px', fontSize: '0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                                            >
                                                <Eye size={13} /> Ver datos
                                            </button>
                                        </div>

                                        <div style={{ height: '260px' }}>
                                            <ResponsiveContainer width="100%" height={260}>
                                                <BarChart data={metrics.dataEspecialidades} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={11} />
                                                    <YAxis stroke="#64748B" fontSize={11} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.7rem', paddingTop: '8px' }} />
                                                    {metrics.topEspecialidades.map((esp, i) => (
                                                        <Bar key={esp} dataKey={esp} stackId="a" fill={ESPECIALIDAD_PALETTE[i % ESPECIALIDAD_PALETTE.length]} name={esp} />
                                                    ))}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* Gráfico: Admisiones Totales por Mes */}
                                {isIndicatorActive('chart_admisiones_totales') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#1E293B' }}>
                                                Cantidad de Admisiones Totales
                                            </h3>
                                            <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                                                Evolución mensual del sector
                                            </span>
                                        </div>

                                        <div style={{ height: '260px' }}>
                                            <ResponsiveContainer width="100%" height={260}>
                                                <BarChart data={metrics.dataAdmisionesTotales} margin={{ top: 15, right: 10, left: -15, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={11} />
                                                    <YAxis stroke="#64748B" fontSize={11} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                    <Bar dataKey="total" fill="#1E40AF" radius={[4, 4, 0, 0]} name="Admisiones" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* ─── BLOQUE 3: MOTIVOS DE ALTA, RANGO ETARIO Y ESTANCIAS ─── */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px' }}>
                                
                                {/* 1. Motivos de Alta */}
                                {isIndicatorActive('chart_motivos_alta') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                Motivos de Alta
                                            </h3>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'chart_motivos_alta', label: 'Motivos de Alta', sector: activeSectorConfig.label })}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </div>

                                        <div style={{ height: '230px' }}>
                                            <ResponsiveContainer width="100%" height={230}>
                                                <PieChart>
                                                    <Pie
                                                        data={metrics.dataMotivosAlta}
                                                        dataKey="value"
                                                        nameKey="label"
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={45}
                                                        outerRadius={75}
                                                        paddingAngle={2}
                                                    >
                                                        {metrics.dataMotivosAlta.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* 2. Rango Etario */}
                                {isIndicatorActive('chart_rango_etario') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                Rango Etario
                                            </h3>
                                            <button 
                                                onClick={() => setInspectDataIndicator({ id: 'chart_rango_etario', label: 'Rango Etario', sector: activeSectorConfig.label })}
                                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                            >
                                                <Eye size={15} />
                                            </button>
                                        </div>

                                        <div style={{ height: '230px' }}>
                                            <ResponsiveContainer width="100%" height={230}>
                                                <PieChart>
                                                    <Pie
                                                        data={metrics.dataRangoEtario}
                                                        dataKey="value"
                                                        nameKey="label"
                                                        cx="50%"
                                                        cy="50%"
                                                        innerRadius={45}
                                                        outerRadius={75}
                                                        paddingAngle={2}
                                                    >
                                                        {metrics.dataRangoEtario.map((entry, index) => (
                                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                                        ))}
                                                    </Pie>
                                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                                </PieChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                                {/* 3. Categorías de Estancias */}
                                {isIndicatorActive('chart_estancias') && (
                                    <div style={{
                                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                        padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                Categorías de Estancias
                                            </h3>
                                            <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>Corta / Media / Larga</span>
                                        </div>

                                        <div style={{ height: '230px' }}>
                                            <ResponsiveContainer width="100%" height={230}>
                                                <BarChart data={metrics.dataEstancias} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                                                    <XAxis dataKey="mes" stroke="#64748B" fontSize={10} />
                                                    <YAxis stroke="#64748B" fontSize={10} />
                                                    <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                    <Legend wrapperStyle={{ fontSize: '0.72rem', paddingTop: '6px' }} />
                                                    <Bar dataKey="corta" stackId="s" fill={COLORS_ESTANCIA.corta} name="1-2 días" />
                                                    <Bar dataKey="media" stackId="s" fill={COLORS_ESTANCIA.media} name="3-7 días" />
                                                    <Bar dataKey="larga" stackId="s" fill={COLORS_ESTANCIA.larga} name=">7 días" />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                )}

                            </div>

                            {/* ─── BLOQUE 4: INDICADORES MODULARES ADICIONALES (Procedencia y Financiadores) ─── */}
                            {(isIndicatorActive('chart_procedencia') || isIndicatorActive('chart_clientes')) && (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '20px' }}>
                                    
                                    {isIndicatorActive('chart_procedencia') && (
                                        <div style={{
                                            background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                            padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                    Canal de Procedencia del Paciente
                                                </h3>
                                                <button 
                                                    onClick={() => setInspectDataIndicator({ id: 'chart_procedencia', label: 'Procedencia de Ingreso', sector: activeSectorConfig.label })}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                                >
                                                    <Eye size={15} />
                                                </button>
                                            </div>
                                            <div style={{ height: '220px' }}>
                                                <ResponsiveContainer width="100%" height={220}>
                                                    <BarChart data={metrics.dataProcedencia} layout="vertical" margin={{ top: 5, right: 15, left: 40, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                                        <XAxis type="number" stroke="#64748B" fontSize={10} />
                                                        <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={90} />
                                                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                        <Bar dataKey="value" fill="#3B82F6" radius={[0, 4, 4, 0]} name="Pacientes" />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                    {isIndicatorActive('chart_clientes') && (
                                        <div style={{
                                            background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                            padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                                                <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                    Top Obras Sociales y Financiadores
                                                </h3>
                                                <button 
                                                    onClick={() => setInspectDataIndicator({ id: 'chart_clientes', label: 'Financiadores y Clientes', sector: activeSectorConfig.label })}
                                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                                >
                                                    <Eye size={15} />
                                                </button>
                                            </div>
                                            <div style={{ height: '220px' }}>
                                                <ResponsiveContainer width="100%" height={220}>
                                                    <BarChart data={metrics.dataClientes} layout="vertical" margin={{ top: 5, right: 15, left: 40, bottom: 5 }}>
                                                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                                        <XAxis type="number" stroke="#64748B" fontSize={10} />
                                                        <YAxis type="category" dataKey="label" stroke="#64748B" fontSize={10} width={90} />
                                                        <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }} />
                                                        <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} name="Pacientes" />
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        </div>
                                    )}

                                </div>
                            )}

                            {/* ─── BLOQUE 5: ESTUDIOS Y PRUEBAS CLÍNICAS (VLISE_PeticionesPruebas) ─── */}
                            {(isIndicatorActive('chart_produccion_origen') || isIndicatorActive('chart_top_estudios_uci') || isIndicatorActive('chart_solicitantes_uci') || isIndicatorActive('table_peticiones_detalle')) && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop: '4px' }}>
                                    
                                    {/* Header de Sección Clínica */}
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        background: 'linear-gradient(90deg, #EFF6FF 0%, #FFFFFF 100%)',
                                        border: '1px solid #BFDBFE',
                                        borderRadius: '10px',
                                        padding: '10px 16px'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <Activity size={18} color="#2563EB" />
                                            <div>
                                                <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#1E3A8A' }}>
                                                    Estudios y Pruebas Clínicas (Laboratorio y Diagnóstico)
                                                </span>
                                                <span style={{ fontSize: '0.72rem', color: '#64748B', marginLeft: '8px' }}>
                                                    Integración directa VLISE_PeticionesPruebas — Producción global y cuidados intensivos
                                                </span>
                                            </div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            padding: '3px 8px',
                                            borderRadius: '999px',
                                            background: '#DBEAFE',
                                            color: '#1D4ED8'
                                        }}>
                                            {peticionesEstudios.length.toLocaleString('es-AR')} estudios vinculados en UCI/Internación
                                        </span>
                                    </div>

                                    {/* Gráficos de Producción y Top Estudios */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                                        
                                        {/* 1. Producción por Origen (Query 2) */}
                                        {isIndicatorActive('chart_produccion_origen') && (
                                            <div style={{
                                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                                padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                            Producción Global por Origen
                                                        </h3>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Query 2 VLISE: Ambulatorio vs Hospitalización</span>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, color: '#059669', background: '#ECFDF5',
                                                        padding: '3px 8px', borderRadius: '6px'
                                                    }}>
                                                        541.487 Estudios Totales
                                                    </span>
                                                </div>

                                                <div style={{ height: '220px', display: 'flex', alignItems: 'center' }}>
                                                    <div style={{ width: '55%', height: '100%' }}>
                                                        <ResponsiveContainer width="100%" height={220}>
                                                            <PieChart>
                                                                <Pie
                                                                    data={metrics.dataProduccionOrigen}
                                                                    dataKey="value"
                                                                    nameKey="name"
                                                                    cx="50%"
                                                                    cy="50%"
                                                                    innerRadius={50}
                                                                    outerRadius={80}
                                                                    paddingAngle={3}
                                                                >
                                                                    {metrics.dataProduccionOrigen.map((entry, index) => (
                                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                                    ))}
                                                                </Pie>
                                                                <Tooltip
                                                                    formatter={(val) => [Number(val).toLocaleString('es-AR') + ' estudios', 'Volumen']}
                                                                    contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                                                />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                    <div style={{ width: '45%', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                                        {metrics.dataProduccionOrigen.map(item => (
                                                            <div key={item.name} style={{
                                                                background: '#F8FAFC',
                                                                border: '1px solid #E2E8F0',
                                                                borderRadius: '8px',
                                                                padding: '8px 12px'
                                                            }}>
                                                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
                                                                    <div style={{ width: '10px', height: '10px', borderRadius: '2px', background: item.color }} />
                                                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#1E293B' }}>{item.name}</span>
                                                                </div>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                                                                    <span style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                                                                        {item.value.toLocaleString('es-AR')}
                                                                    </span>
                                                                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: item.color }}>
                                                                        {item.pct}%
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {/* 2. Top Estudios Clínicos en UCI / Hospitalización (Query 1) */}
                                        {isIndicatorActive('chart_top_estudios_uci') && (
                                            <div style={{
                                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                                padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                            Top Pruebas y Estudios en UCI / Críticos
                                                        </h3>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Estudios de laboratorio y gasometría más solicitados</span>
                                                    </div>
                                                    <span style={{
                                                        fontSize: '0.7rem', fontWeight: 700, color: '#1E40AF', background: '#EFF6FF',
                                                        padding: '3px 8px', borderRadius: '6px'
                                                    }}>
                                                        Top 10 Frecuencia
                                                    </span>
                                                </div>

                                                <div style={{ height: '240px' }}>
                                                    {metrics.dataTopEstudios.length === 0 ? (
                                                        <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94A3B8', fontSize: '0.85rem' }}>
                                                            No hay estudios clínicos registrados en el rango de fechas
                                                        </div>
                                                    ) : (
                                                        <ResponsiveContainer width="100%" height={240}>
                                                            <BarChart
                                                                data={metrics.dataTopEstudios}
                                                                layout="vertical"
                                                                margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                                                            >
                                                                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                                                <XAxis type="number" stroke="#64748B" fontSize={10} />
                                                                <YAxis
                                                                    type="category"
                                                                    dataKey="label"
                                                                    stroke="#64748B"
                                                                    fontSize={9}
                                                                    width={130}
                                                                    tickFormatter={(v) => v.length > 20 ? v.substring(0, 20) + '...' : v}
                                                                />
                                                                <Tooltip
                                                                    formatter={(val) => [Number(val).toLocaleString('es-AR') + ' solicitudes', 'Cantidad']}
                                                                    contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                                                />
                                                                <Bar dataKey="value" fill="#2563EB" radius={[0, 4, 4, 0]} name="Solicitudes" />
                                                            </BarChart>
                                                        </ResponsiveContainer>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                    </div>

                                    {/* Gráfico de Médicos Solicitantes y Tabla Auditoría */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '20px' }}>
                                        
                                        {/* 3. Top Médicos Solicitantes */}
                                        {isIndicatorActive('chart_solicitantes_uci') && (
                                            <div style={{
                                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                                padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                            Médicos Solicitantes Más Activos
                                                        </h3>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Prescriptores clínicos con mayor volumen</span>
                                                    </div>
                                                </div>

                                                <div style={{ height: '220px' }}>
                                                    <ResponsiveContainer width="100%" height={220}>
                                                        <BarChart
                                                            data={metrics.dataTopSolicitantes}
                                                            layout="vertical"
                                                            margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
                                                        >
                                                            <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                                                            <XAxis type="number" stroke="#64748B" fontSize={10} />
                                                            <YAxis
                                                                type="category"
                                                                dataKey="label"
                                                                stroke="#64748B"
                                                                fontSize={9}
                                                                width={120}
                                                                tickFormatter={(v) => v.length > 18 ? v.substring(0, 18) + '...' : v}
                                                            />
                                                            <Tooltip
                                                                formatter={(val) => [val, 'Solicitudes']}
                                                                contentStyle={{ borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.8rem' }}
                                                            />
                                                            <Bar dataKey="value" fill="#8B5CF6" radius={[0, 4, 4, 0]} name="Solicitudes" />
                                                        </BarChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            </div>
                                        )}

                                        {/* 4. Tabla Detallada de Auditoría de Peticiones */}
                                        {isIndicatorActive('table_peticiones_detalle') && (
                                            <div style={{
                                                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                                                padding: '20px', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                            }}>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                                                    <div>
                                                        <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 800, color: '#1E293B' }}>
                                                            Auditoría de Peticiones y Pruebas
                                                        </h3>
                                                        <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Últimos estudios solicitados en la unidad</span>
                                                    </div>
                                                </div>

                                                <div style={{ overflowX: 'auto', maxHeight: '220px', fontSize: '0.78rem' }}>
                                                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                                        <thead>
                                                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#64748B' }}>
                                                                <th style={{ padding: '6px 8px' }}>Fecha</th>
                                                                <th style={{ padding: '6px 8px' }}>Estudio</th>
                                                                <th style={{ padding: '6px 8px' }}>Hab./Box</th>
                                                                <th style={{ padding: '6px 8px' }}>Solicitante</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {peticionesEstudios.slice(0, 12).map((p, idx) => (
                                                                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                    <td style={{ padding: '6px 8px', whiteSpace: 'nowrap', color: '#64748B' }}>
                                                                        {p.fecha_solicitud ? new Date(p.fecha_solicitud).toLocaleDateString('es-AR') : '-'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 8px', fontWeight: 600, color: '#1E293B' }}>
                                                                        {(p.estudio || '').replace(/<[^>]+>/g, '')}
                                                                    </td>
                                                                    <td style={{ padding: '6px 8px', color: '#2563EB', fontWeight: 600 }}>
                                                                        {p.habitacion || 'Piso'}
                                                                    </td>
                                                                    <td style={{ padding: '6px 8px', color: '#475569', fontSize: '0.72rem' }}>
                                                                        {p.solicitante || '-'}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                </div>
                                            </div>
                                        )}

                                    </div>

                                </div>
                            )}

                        </div>
                    )}
                </div>

            </div>

            {/* ─── MODAL DE AUDITORÍA TABULAR DE DATOS ─── */}
            {inspectDataIndicator && (
                <TelarDataModal
                    indicator={inspectDataIndicator}
                    rawData={filteredRows}
                    onClose={() => setInspectDataIndicator(null)}
                />
            )}

            {/* ─── DRAWER DEL CATÁLOGO MODULAR DE INDICADORES ─── */}
            <TelarCatalogoDrawer
                isOpen={isCatalogoOpen}
                onClose={() => setIsCatalogoOpen(false)}
                activeIds={activeIndicatorIds}
                onToggleIndicator={handleToggleIndicator}
                onResetDefaults={handleResetDefaults}
                sectorLabel={activeSectorConfig.label}
            />

            {/* ─── MODAL DE DOCUMENTACIÓN TÉCNICA ─── */}
            {showDocModal && (
                <div style={{
                    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                    backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
                    zIndex: 12000, display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '90%', maxWidth: '800px',
                        maxHeight: '85vh', display: 'flex', flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        <div style={{
                            padding: '18px 24px', borderBottom: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#F8FAFC'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BookOpen size={20} color="#1E40AF" />
                                <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800, color: '#0F172A' }}>
                                    Documentación Técnica y Metodología de Ocupación
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowDocModal(false)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div style={{ padding: '24px', overflowY: 'auto', fontSize: '0.88rem', color: '#334155', lineHeight: 1.6 }}>
                            <h4 style={{ color: '#1E40AF', marginTop: 0 }}>1. Query Canónica de Extracción (SALUS SQL Server)</h4>
                            <pre style={{
                                background: '#F1F5F9', padding: '12px', borderRadius: '8px',
                                fontSize: '0.78rem', overflowX: 'auto', border: '1px solid #CBD5E1',
                                fontFamily: 'Consolas, monospace'
                            }}>
{`SELECT 
    b.[Número admisión],
    DATEADD(DAY, v.number, CAST(b.[Fecha ingreso] AS DATE)) AS [Fecha Ocupacion],
    b.Especialidad,
    b.idAdmision,
    b.[Fecha ingreso],
    b.[Fecha alta],
    b.Procedencia,
    b.NHC,
    b.Paciente,
    b.[Motivo de alta],
    b.Cliente,
    b.[Estado Conceptos],
    b.Servicio,
    b.Proceso,
    b.Edad,
    b.[Motivo Alta],
    b.[Control ADM finalizado]
FROM TABLEAU_Admisiones b
JOIN master.dbo.spt_values v
  ON v.type = 'P' 
  AND v.number <= DATEDIFF(DAY, CAST(b.[Fecha ingreso] AS DATE), CAST(ISNULL(b.[Fecha alta], GETDATE()) AS DATE))
WHERE (b.[Fecha alta] >= '2025-06-01' OR b.[Fecha alta] IS NULL)`}
                            </pre>

                            <h4 style={{ color: '#1E40AF', marginTop: '20px' }}>2. Queries de Peticiones y Estudios Clínicos (VLISE_PeticionesPruebas)</h4>
                            <p style={{ fontSize: '0.8rem', color: '#64748B', margin: '4px 0 8px 0' }}>
                                Utilizadas para entender los estudios clínicos y analíticas en UCI, internación y producción global:
                            </p>
                            
                            <strong style={{ fontSize: '0.82rem', color: '#1E293B' }}>A. Detalle de Peticiones y Pruebas</strong>
                            <pre style={{
                                background: '#F1F5F9', padding: '12px', borderRadius: '8px',
                                fontSize: '0.76rem', overflowX: 'auto', border: '1px solid #CBD5E1',
                                fontFamily: 'Consolas, monospace', marginTop: '4px'
                            }}>
{`SELECT 
    CAST(IdPeticionDePrueba AS VARCHAR(50)) AS IdPeticion,
    [Fecha Solicitud],
    IdPaciente,
    Paciente,
    Solicitante,
    CAST([Paciente Edad] AS INT) AS PacienteEdad,
    Origen, -- Fundamental dejarlo abierto
    [Tipo Visita] AS TipoVisita,
    [Tipo Articulo] AS TipoArticulo,
    YEAR([Fecha Solicitud]) AS AnioSolicitud,
    MONTH([Fecha Solicitud]) AS MesSolicitud
FROM VLISE_PeticionesPruebas
WHERE [Fecha Solicitud] >= '2025-06-01'
  AND [Fecha Solicitud] IS NOT NULL`}
                            </pre>

                            <strong style={{ fontSize: '0.82rem', color: '#1E293B', marginTop: '10px', display: 'inline-block' }}>B. Producción Global por Origen</strong>
                            <pre style={{
                                background: '#F1F5F9', padding: '12px', borderRadius: '8px',
                                fontSize: '0.76rem', overflowX: 'auto', border: '1px solid #CBD5E1',
                                fontFamily: 'Consolas, monospace', marginTop: '4px'
                            }}>
{`SELECT 
    Origen,
    COUNT(*) AS CantidadEstudios,
    CAST(
        COUNT(*) * 100.0 / SUM(COUNT(*)) OVER() 
    AS DECIMAL(10, 2)) AS PorcentajeProduccion
FROM VLISE_PeticionesPruebas
WHERE [Fecha Solicitud] >= '2025-06-01'
  AND [Fecha Solicitud] IS NOT NULL
GROUP BY Origen`}
                            </pre>

                            <h4 style={{ color: '#1E40AF', marginTop: '20px' }}>3. Fórmulas de Indicadores</h4>
                            <ul>
                                <li><strong>Cantidad de Días Camas Ocupados:</strong> Conteo de pernoctadas efectivas en el período.</li>
                                <li><strong>Cantidad de Días Camas Disponibles:</strong> <code>Camas Totales × Días Transcurridos</code>.</li>
                                <li><strong>% de Ocupación:</strong> <code>(Días Camas Ocupados / Días Camas Disponibles) × 100</code>.</li>
                                <li><strong>% de Defunción (Mortalidad Cruda):</strong> <code>(Pacientes únicos fallecidos / Total de pacientes únicos) × 100</code>.</li>
                                <li><strong>Promedio de Estancia (ALOS):</strong> <code>Sumatoria de días de estancia / Total de altas efectivas</code>.</li>
                                <li><strong>Producción de Estudios:</strong> Distribución porcentual entre demanda ambulatoria (75.7%) e internación hospitalaria (24.3%).</li>
                            </ul>
                        </div>

                        <div style={{ padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowDocModal(false)}
                                style={{
                                    padding: '8px 16px', borderRadius: '6px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#334155', fontWeight: 600, cursor: 'pointer'
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}

        </div>
    );
}
