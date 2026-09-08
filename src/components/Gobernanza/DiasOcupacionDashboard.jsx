import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../lib/supabase';
import { 
    BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, 
    XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend 
} from 'recharts';
import { 
    BookOpen, Filter, Calendar, Bed, Activity, Users, 
    AlertTriangle, CheckCircle2, ChevronDown, RotateCcw, X, FileText, Layers
} from 'lucide-react';

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

export default function DiasOcupacionDashboard() {
    // === ESTADOS DE FILTROS ===
    const [servicio, setServicio] = useState('UCI');
    const [especialidad, setEspecialidad] = useState('TODOS');
    const [camasTotales, setCamasTotales] = useState(11);
    const [fechaDesde, setFechaDesde] = useState('2025-06-01');
    const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0]);

    // Estados de Datos
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [serviciosDisponibles, setServiciosDisponibles] = useState(['UCI']);
    const [especialidadesDisponibles, setEspecialidadesDisponibles] = useState([]);
    
    // Modal de Documentación
    const [showDocModal, setShowDocModal] = useState(false);

    // Cargar datos desde Supabase
    useEffect(() => {
        fetchData();
    }, [servicio, fechaDesde, fechaHasta]);

    const fetchData = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('calidad_admisiones_ocupacion')
                .select('*')
                .gte('fecha_ocupacion', fechaDesde)
                .lte('fecha_ocupacion', fechaHasta);

            if (servicio && servicio !== 'TODOS') {
                query = query.eq('servicio', servicio);
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

        } catch (err) {
            console.error('Error al cargar datos de ocupación:', err);
        } finally {
            setLoading(false);
        }
    };

    // Filtrar filas según Especialidad seleccionada
    const filteredRows = useMemo(() => {
        if (!especialidad || especialidad === 'TODOS') return rows;
        return rows.filter(r => r.especialidad && r.especialidad.trim() === especialidad.trim());
    }, [rows, especialidad]);

    // === CÁLCULO DE KPIS SUPERIORES ===
    const kpis = useMemo(() => {
        const diasOcupados = filteredRows.length;

        // Calcular días del período
        const dStart = new Date(fechaDesde);
        const dEnd = new Date(fechaHasta);
        const diffMs = Math.max(0, dEnd - dStart);
        const diasPeriodo = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)) + 1);

        const camasDisponibles = Number(camasTotales || 0) * diasPeriodo;
        const ocupacionPct = camasDisponibles > 0 ? ((diasOcupados / camasDisponibles) * 100).toFixed(2) : '0.00';

        // Pacientes únicos (agrupados por id_admision)
        const admisionesMap = new Map();
        filteredRows.forEach(r => {
            if (!admisionesMap.has(r.id_admision)) {
                admisionesMap.set(r.id_admision, r);
            }
        });
        const totalPacientesUnicos = admisionesMap.size;

        let defunciones = 0;
        admisionesMap.forEach(r => {
            if (r.motivo_de_alta && r.motivo_de_alta.toLowerCase().includes('defunci')) {
                defunciones++;
            }
        });

        const defuncionPct = totalPacientesUnicos > 0 
            ? ((defunciones / totalPacientesUnicos) * 100).toFixed(2) 
            : '0.00';

        return {
            diasOcupados: diasOcupados.toLocaleString('es-AR'),
            camasDisponibles: camasDisponibles.toLocaleString('es-AR'),
            ocupacionPct,
            defuncionPct,
            totalPacientesUnicos,
            diasPeriodo
        };
    }, [filteredRows, camasTotales, fechaDesde, fechaHasta]);

    // === ADMISIONES ÚNICAS PARA GRÁFICOS DE EGRESO, EDAD Y ESTANCIAS ===
    const admisionesUnicas = useMemo(() => {
        const map = new Map();
        filteredRows.forEach(r => {
            if (!map.has(r.id_admision)) {
                // Calcular días de estancia para la admisión
                let diasEstancia = 1;
                if (r.fecha_ingreso && r.fecha_alta) {
                    const fi = new Date(r.fecha_ingreso);
                    const fa = new Date(r.fecha_alta);
                    diasEstancia = Math.max(1, Math.ceil((fa - fi) / (1000 * 60 * 60 * 24)));
                } else if (r.fecha_ingreso) {
                    const fi = new Date(r.fecha_ingreso);
                    const fa = new Date();
                    diasEstancia = Math.max(1, Math.ceil((fa - fi) / (1000 * 60 * 60 * 24)));
                }

                // Categoría de estancia
                let catEstancia = '1. Estancia Corta (1-2 d)';
                if (diasEstancia >= 3 && diasEstancia <= 7) {
                    catEstancia = '2. Estancia Media (3-7 d)';
                } else if (diasEstancia > 7) {
                    catEstancia = '3. Estancia Larga (>7 d)';
                }

                // Grupo etario
                const edad = r.edad || 0;
                let grupoEtario = '4. Mayor (>65)';
                if (edad <= 17) grupoEtario = '1. Pediátrico (0-17)';
                else if (edad <= 45) grupoEtario = '2. Adulto Joven (18-45)';
                else if (edad <= 65) grupoEtario = '3. Adulto (46-65)';

                // Mes de ingreso
                let mesIngreso = 'Sin Fecha';
                if (r.fecha_ingreso) {
                    const d = new Date(r.fecha_ingreso);
                    mesIngreso = d.toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });
                }

                // Mes numérico para orden
                const dObj = r.fecha_ingreso ? new Date(r.fecha_ingreso) : new Date(0);
                const sortKey = `${dObj.getFullYear()}-${String(dObj.getMonth() + 1).padStart(2, '0')}`;

                map.set(r.id_admision, {
                    ...r,
                    diasEstancia,
                    catEstancia,
                    grupoEtario,
                    mesIngreso,
                    sortKey
                });
            }
        });
        return Array.from(map.values());
    }, [filteredRows]);

    // === 1 & 2. ADMISIONES TOTALES Y POR ESPECIALIDAD (MENSUAL) ===
    const { seriesEspecialidad, mesesData, todasEspecialidades } = useMemo(() => {
        const mesesMap = {};
        const espSet = new Set();

        admisionesUnicas.forEach(adm => {
            const mKey = adm.sortKey;
            const mLabel = adm.mesIngreso;
            const esp = adm.especialidad || 'OTRAS';
            espSet.add(esp);

            if (!mesesMap[mKey]) {
                mesesMap[mKey] = {
                    key: mKey,
                    mes: mLabel,
                    total: 0
                };
            }
            mesesMap[mKey].total = (mesesMap[mKey].total || 0) + 1;
            mesesMap[mKey][esp] = (mesesMap[mKey][esp] || 0) + 1;
        });

        const sortedMeses = Object.values(mesesMap).sort((a, b) => a.key.localeCompare(b.key));
        return {
            seriesEspecialidad: sortedMeses,
            mesesData: sortedMeses,
            todasEspecialidades: Array.from(espSet)
        };
    }, [admisionesUnicas]);

    // === 3. MOTIVOS DE ALTA (DONUT) ===
    const dataMotivosAlta = useMemo(() => {
        const counts = {};
        admisionesUnicas.forEach(adm => {
            const m = adm.motivo_de_alta ? adm.motivo_de_alta.trim() : 'En Curso / Sin Datos';
            counts[m] = (counts[m] || 0) + 1;
        });
        return Object.keys(counts)
            .map(k => ({ name: k, value: counts[k] }))
            .sort((a, b) => b.value - a.value);
    }, [admisionesUnicas]);

    // === 4. RANGO ETARIO (DONUT) ===
    const dataRangoEtario = useMemo(() => {
        const counts = {
            '1. Pediátrico (0-17)': 0,
            '2. Adulto Joven (18-45)': 0,
            '3. Adulto (46-65)': 0,
            '4. Mayor (>65)': 0
        };
        admisionesUnicas.forEach(adm => {
            if (counts[adm.grupoEtario] !== undefined) {
                counts[adm.grupoEtario]++;
            }
        });
        return Object.keys(counts)
            .filter(k => counts[k] > 0)
            .map(k => ({ name: k, value: counts[k] }));
    }, [admisionesUnicas]);

    // === 5. CATEGORÍAS DE ESTANCIAS (MENSUAL APILADO) ===
    const dataCategoriasEstancias = useMemo(() => {
        const mesesMap = {};
        admisionesUnicas.forEach(adm => {
            const mKey = adm.sortKey;
            const mLabel = adm.mesIngreso;
            if (!mesesMap[mKey]) {
                mesesMap[mKey] = {
                    key: mKey,
                    mes: mLabel,
                    corta: 0,
                    media: 0,
                    larga: 0
                };
            }
            if (adm.catEstancia.includes('Corta')) mesesMap[mKey].corta++;
            else if (adm.catEstancia.includes('Media')) mesesMap[mKey].media++;
            else mesesMap[mKey].larga++;
        });
        return Object.values(mesesMap).sort((a, b) => a.key.localeCompare(b.key));
    }, [admisionesUnicas]);

    return (
        <div style={{ padding: '16px', background: '#F8FAFC', minHeight: '100%', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* ─── BARRA SUPERIOR DE CONTROL (ESTILO TABLEAU) ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                padding: '12px 20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                border: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <button
                        onClick={() => setShowDocModal(true)}
                        style={{
                            background: '#1E40AF',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 14px',
                            fontWeight: 600,
                            fontSize: '0.85rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            cursor: 'pointer',
                            transition: 'background 0.2s'
                        }}
                    >
                        <BookOpen size={16} />
                        Documentación
                    </button>
                    
                    <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Bed size={22} color="#1E40AF" />
                        Días Ocupación
                    </h2>
                </div>

                {/* Filtros Interactivos */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                    
                    {/* Filtro Servicio */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Servicio</label>
                        <select
                            value={servicio}
                            onChange={(e) => setServicio(e.target.value)}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.85rem',
                                color: '#1E293B',
                                background: '#FFFFFF',
                                fontWeight: 500,
                                cursor: 'pointer'
                            }}
                        >
                            <option value="UCI">UCI (Terapia Intensiva)</option>
                            <option value="NEONATOLOGÍA">Neonatología</option>
                            <option value="INTERNADO">Internado</option>
                            <option value="PEDIATRÍA">Pediatría</option>
                            <option value="CIRUGIA PEDIATRICA">Cirugía Pediátrica</option>
                            <option value="TODOS">Todos los Servicios</option>
                        </select>
                    </div>

                    {/* Filtro Especialidad */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Especialidad</label>
                        <select
                            value={especialidad}
                            onChange={(e) => setEspecialidad(e.target.value)}
                            style={{
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.85rem',
                                color: '#1E293B',
                                background: '#FFFFFF',
                                fontWeight: 500,
                                cursor: 'pointer',
                                maxWidth: '200px'
                            }}
                        >
                            <option value="TODOS">(Todo)</option>
                            {especialidadesDisponibles.map(esp => (
                                <option key={esp} value={esp}>{esp}</option>
                            ))}
                        </select>
                    </div>

                    {/* Camas Totales (Parametrizable) */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Camas Totales</label>
                        <input
                            type="number"
                            min="1"
                            max="200"
                            value={camasTotales}
                            onChange={(e) => setCamasTotales(Number(e.target.value))}
                            style={{
                                width: '70px',
                                padding: '6px 10px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.85rem',
                                fontWeight: 700,
                                color: '#1E40AF',
                                textAlign: 'center'
                            }}
                        />
                    </div>

                    {/* Rango de Fechas */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Fecha Desde</label>
                        <input
                            type="date"
                            value={fechaDesde}
                            onChange={(e) => setFechaDesde(e.target.value)}
                            style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#1E293B'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <label style={{ fontSize: '0.7rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase' }}>Fecha Hasta</label>
                        <input
                            type="date"
                            value={fechaHasta}
                            onChange={(e) => setFechaHasta(e.target.value)}
                            style={{
                                padding: '5px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.8rem',
                                color: '#1E293B'
                            }}
                        />
                    </div>

                </div>
            </div>

            {/* ─── TOP 4 SCORECARDS (KPIS EJECUTIVOS) ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                
                {/* 1. Días Camas Ocupados */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    borderTop: '4px solid #1E40AF',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Cantidad de Días Camas Ocupados</span>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
                        {kpis.diasOcupados}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{kpis.totalPacientesUnicos} pacientes únicos</span>
                </div>

                {/* 2. Días Camas Disponibles */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    borderTop: '4px solid #0284C7',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>Cantidad de Días Camas Disponibles</span>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
                        {kpis.camasDisponibles}
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{camasTotales} camas × {kpis.diasPeriodo} días</span>
                </div>

                {/* 3. % de Ocupación */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    borderTop: `4px solid ${Number(kpis.ocupacionPct) > 95 ? '#EF4444' : Number(kpis.ocupacionPct) > 85 ? '#F59E0B' : '#10B981'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>% de Ocupación</span>
                        <span style={{
                            fontSize: '0.7rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '12px',
                            background: Number(kpis.ocupacionPct) > 95 ? '#FEF2F2' : '#ECFDF5',
                            color: Number(kpis.ocupacionPct) > 95 ? '#DC2626' : '#059669'
                        }}>
                            {Number(kpis.ocupacionPct) > 95 ? 'Sobreocupación' : 'Normal'}
                        </span>
                    </div>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.5px' }}>
                        {kpis.ocupacionPct}%
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Ocupados vs. Capacidad instalada</span>
                </div>

                {/* 4. % de Defunción */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    borderTop: '4px solid #EF4444',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '4px'
                }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 600, color: '#64748B' }}>% de Defunción</span>
                    <div style={{ fontSize: '1.85rem', fontWeight: 800, color: '#DC2626', letterSpacing: '-0.5px' }}>
                        {kpis.defuncionPct}%
                    </div>
                    <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>Mortalidad cruda sobre admisiones</span>
                </div>

            </div>

            {/* ─── FILA 1: ADMISIONES POR ESPECIALIDAD Y DONUTS (MOTIVO ALTA + EDAD) ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '16px' }}>
                
                {/* Gráfico 1: Cantidad de Admisiones por Especialidad (Barras Apiladas) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column',
                    gridColumn: 'span 2'
                }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        Cantidad de Admisiones por Especialidad
                    </h3>
                    <div style={{ width: '100%', height: '300px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={seriesEspecialidad} margin={{ top: 10, right: 20, left: 0, bottom: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#64748B' }} angle={-25} textAnchor="end" />
                                <YAxis tick={{ fontSize: 11, fill: '#64748B' }} />
                                <Tooltip />
                                {todasEspecialidades.slice(0, 10).map((esp, idx) => (
                                    <Bar 
                                        key={esp} 
                                        dataKey={esp} 
                                        stackId="a" 
                                        fill={ESPECIALIDAD_PALETTE[idx % ESPECIALIDAD_PALETTE.length]} 
                                    />
                                ))}
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Gráfico 3: Motivos de Alta (Donut) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        Motivos de Alta
                    </h3>
                    <div style={{ width: '100%', height: '260px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={dataMotivosAlta}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={55}
                                    outerRadius={85}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {dataMotivosAlta.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS_MOTIVO[index % COLORS_MOTIVO.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend layout="horizontal" verticalAlign="bottom" align="center" wrapperStyle={{ fontSize: '11px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* ─── FILA 2: ADMISIONES TOTALES, GRUPO ETARIO Y ESTANCIAS ─── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '16px' }}>
                
                {/* Gráfico 2: Cantidad de Admisiones Totales (Mensual) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        Cantidad de Admisiones Totales
                    </h3>
                    <div style={{ width: '100%', height: '260px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={mesesData} margin={{ top: 15, right: 10, left: -10, bottom: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#64748B' }} angle={-25} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                                <Tooltip />
                                <Bar dataKey="total" fill="#3B82F6" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 10, fill: '#1E40AF' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Gráfico 4: Rango Etario (Donut) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        Rango Etario
                    </h3>
                    <div style={{ width: '100%', height: '260px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height={260}>
                            <PieChart>
                                <Pie
                                    data={dataRangoEtario}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {dataRangoEtario.map((entry, index) => (
                                        <Cell key={`cell-age-${index}`} fill={COLORS_ETARIO[index % COLORS_ETARIO.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '11px' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Gráfico 5: Categorías de Estancias (Barras Apiladas) */}
                <div style={{
                    background: '#FFFFFF',
                    borderRadius: '12px',
                    padding: '20px',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                    border: '1px solid #E2E8F0',
                    display: 'flex',
                    flexDirection: 'column'
                }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: '0.95rem', fontWeight: 700, color: '#1E293B' }}>
                        Categorías de Estancias (Mensual)
                    </h3>
                    <div style={{ width: '100%', height: '260px', minWidth: 0 }}>
                        <ResponsiveContainer width="100%" height={260}>
                            <BarChart data={dataCategoriasEstancias} margin={{ top: 15, right: 10, left: -10, bottom: 25 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                                <XAxis dataKey="mes" tick={{ fontSize: 10, fill: '#64748B' }} angle={-25} textAnchor="end" />
                                <YAxis tick={{ fontSize: 10, fill: '#64748B' }} />
                                <Tooltip />
                                <Bar dataKey="corta" name="1. Corta (1-2 d)" stackId="st" fill={COLORS_ESTANCIA.corta} />
                                <Bar dataKey="media" name="2. Media (3-7 d)" stackId="st" fill={COLORS_ESTANCIA.media} />
                                <Bar dataKey="larga" name="3. Larga (>7 d)" stackId="st" fill={COLORS_ESTANCIA.larga} />
                                <Legend wrapperStyle={{ fontSize: '10px' }} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>

            {/* ─── MODAL DE DOCUMENTACIÓN (POPUP COMPLETO) ─── */}
            {showDocModal && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.6)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        maxWidth: '850px',
                        width: '100%',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                        overflow: 'hidden'
                    }}>
                        {/* Cabecera del Modal */}
                        <div style={{
                            padding: '16px 24px',
                            background: '#1E40AF',
                            color: '#FFFFFF',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <BookOpen size={20} />
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                                    Ficha Técnica & Gobernanza: Días Ocupación
                                </h3>
                            </div>
                            <button
                                onClick={() => setShowDocModal(false)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    cursor: 'pointer',
                                    padding: '4px',
                                    borderRadius: '6px'
                                }}
                            >
                                <X size={20} />
                            </button>
                        </div>

                        {/* Contenido de la Ficha Técnica */}
                        <div style={{ padding: '24px', overflowY: 'auto', fontSize: '0.9rem', color: '#334155', lineHeight: 1.6 }}>
                            <h4 style={{ color: '#1E40AF', marginTop: 0 }}>1. Query Canónica de Extracción (SALUS SQL Server)</h4>
                            <pre style={{
                                background: '#F1F5F9',
                                padding: '12px',
                                borderRadius: '8px',
                                fontSize: '0.78rem',
                                overflowX: 'auto',
                                border: '1px solid #CBD5E1',
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

                            <h4 style={{ color: '#1E40AF' }}>2. Fórmulas de Indicadores</h4>
                            <ul>
                                <li><strong>Cantidad de Días Camas Ocupados:</strong> Conteo de filas en el rango de fechas para el servicio/especialidad filtrado.</li>
                                <li><strong>Cantidad de Días Camas Disponibles:</strong> <code>Camas Totales × Días Transcurridos</code> en el período.</li>
                                <li><strong>% de Ocupación:</strong> <code>(Días Camas Ocupados / Días Camas Disponibles) × 100</code>.</li>
                                <li><strong>% de Defunción:</strong> <code>(Pacientes únicos con egreso por Defunción / Total Pacientes únicos) × 100</code>.</li>
                            </ul>

                            <h4 style={{ color: '#1E40AF' }}>3. Grupos Etarios y Estancias</h4>
                            <ul>
                                <li><strong>Pediátrico:</strong> 0 a 17 años</li>
                                <li><strong>Adulto Joven:</strong> 18 a 45 años</li>
                                <li><strong>Adulto:</strong> 46 a 65 años</li>
                                <li><strong>Mayor:</strong> Más de 65 años</li>
                                <li><strong>Estancia Corta:</strong> 1 a 2 días | <strong>Media:</strong> 3 a 7 días | <strong>Larga:</strong> Más de 7 días</li>
                            </ul>

                            <h4 style={{ color: '#1E40AF' }}>4. Servicios Cubiertos</h4>
                            <p>Esta base de datos soporta análisis transversal para: <strong>UCI (Terapia Intensiva), Neonatología, Internado Clínico, Pediatría, Cirugía Pediátrica, Quirófanos y Urgencias</strong>.</p>
                        </div>

                        {/* Pie del Modal */}
                        <div style={{ padding: '12px 24px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setShowDocModal(false)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#334155',
                                    fontWeight: 600,
                                    cursor: 'pointer'
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
