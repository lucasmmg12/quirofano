import React, { useState, useMemo, useRef, useEffect } from 'react';
import { 
    Calendar, ChevronLeft, ChevronRight, Search, Download, 
    Maximize2, Minimize2, Users, Bed, Clock, Filter, AlertCircle,
    Activity, ArrowLeftRight
} from 'lucide-react';
import * as XLSX from 'xlsx';

// Definición exacta y absoluta de las 16 camas de UCI
export const CAMAS_UCI_CONFIG = [
    // Terapia Intermedia (8 camas)
    { id: '222', label: 'Habitación 222', shortLabel: '222', sector: 'INTERMEDIA', orden: 1 },
    { id: '223', label: 'Habitación 223', shortLabel: '223', sector: 'INTERMEDIA', orden: 2 },
    { id: '224', label: 'Habitación 224', shortLabel: '224', sector: 'INTERMEDIA', orden: 3 },
    { id: '225', label: 'Habitación 225', shortLabel: '225', sector: 'INTERMEDIA', orden: 4 },
    { id: '226', label: 'Habitación 226', shortLabel: '226', sector: 'INTERMEDIA', orden: 5 },
    { id: '227', label: 'Habitación 227', shortLabel: '227', sector: 'INTERMEDIA', orden: 6 },
    { id: '228', label: 'Habitación 228', shortLabel: '228', sector: 'INTERMEDIA', orden: 7 },
    { id: '229', label: 'Habitación 229', shortLabel: '229', sector: 'INTERMEDIA', orden: 8 },
    // Terapia Intensiva (8 camas)
    { id: 'BOX 1', label: 'Box 1', shortLabel: 'BOX 1', sector: 'INTENSIVA', orden: 9 },
    { id: 'BOX 2', label: 'Box 2', shortLabel: 'BOX 2', sector: 'INTENSIVA', orden: 10 },
    { id: 'BOX 3', label: 'Box 3', shortLabel: 'BOX 3', sector: 'INTENSIVA', orden: 11 },
    { id: 'BOX 4', label: 'Box 4', shortLabel: 'BOX 4', sector: 'INTENSIVA', orden: 12 },
    { id: 'BOX 5', label: 'Box 5', shortLabel: 'BOX 5', sector: 'INTENSIVA', orden: 13 },
    { id: 'BOX 6', label: 'Box 6', shortLabel: 'BOX 6', sector: 'INTENSIVA', orden: 14 },
    { id: 'BOX 7', label: 'Box 7', shortLabel: 'BOX 7', sector: 'INTENSIVA', orden: 15 },
    { id: 'BOX 8', label: 'Box 8', shortLabel: 'BOX 8', sector: 'INTENSIVA', orden: 16 }
];

export function normalizeCamaId(hab) {
    if (!hab) return null;
    const str = String(hab).toUpperCase().trim();
    for (let i = 222; i <= 229; i++) {
        if (str.includes(String(i))) return String(i);
    }
    for (let i = 1; i <= 8; i++) {
        if (str.includes(`BOX ${i}`) || str.includes(`BOX${i}`) || str.includes(`B${i}`)) return `BOX ${i}`;
    }
    return null;
}

const PALETA_COBERTURAS = [
    { bg: 'linear-gradient(135deg, #1E40AF, #3B82F6)', border: '#1D4ED8', text: '#FFFFFF' }, // Azul OSDE/Default
    { bg: 'linear-gradient(135deg, #047857, #10B981)', border: '#059669', text: '#FFFFFF' }, // Verde Provincia
    { bg: 'linear-gradient(135deg, #B45309, #F59E0B)', border: '#D97706', text: '#FFFFFF' }, // Naranja Sancor
    { bg: 'linear-gradient(135deg, #6D28D9, #8B5CF6)', border: '#7C3AED', text: '#FFFFFF' }, // Violeta Medicus/Swiss
    { bg: 'linear-gradient(135deg, #BE185D, #EC4899)', border: '#DB2777', text: '#FFFFFF' }, // Rosa Jerárquicos
    { bg: 'linear-gradient(135deg, #0F766E, #14B8A6)', border: '#0D9488', text: '#FFFFFF' }, // Teal
    { bg: 'linear-gradient(135deg, #374151, #4B5563)', border: '#4B5563', text: '#FFFFFF' }  // Gris
];

// ── Helpers de Fechas (Este Mes / Mes Anterior / Personalizado) ──
const getPrimerDiaMes = (d = new Date()) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}-01`;
};

const getUltimoDiaMes = (d = new Date()) => {
    const y = d.getFullYear();
    const m = d.getMonth();
    const lastDay = new Date(y, m + 1, 0).getDate();
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
};

const getRangoMesAnterior = () => {
    const now = new Date();
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
        desde: getPrimerDiaMes(prevMonthDate),
        hasta: getUltimoDiaMes(prevMonthDate)
    };
};

export default function UciGanttChart({ 
    rawData = [], 
    historialCamas = [],
    fechaDesde = null,
    fechaHasta = null,
    datePresetMode = 'este_mes',
    onDatePresetChange = null,
    onCustomDateChange = null,
    onClose = null 
}) {
    // === ESTADOS ===
    const [subNivel, setSubNivel] = useState('TODAS'); // 'TODAS' | 'INTENSIVA' | 'INTERMEDIA'
    const [searchTerm, setSearchTerm] = useState('');
    const [zoomLevel, setZoomLevel] = useState('normal'); // 'compact' (38px), 'normal' (56px), 'detailed' (90px)
    const [hoveredPatient, setHoveredPatient] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
    const [selectedPatient, setSelectedPatient] = useState(null);
    const [isFullscreen, setIsFullscreen] = useState(false);

    // Fechas sincronizadas con el dashboard
    const [localPresetMode, setLocalPresetMode] = useState(datePresetMode || 'este_mes');
    const [localStartDate, setLocalStartDate] = useState(() => fechaDesde || getPrimerDiaMes());
    const [localEndDate, setLocalEndDate] = useState(() => fechaHasta || getUltimoDiaMes());

    const activePreset = datePresetMode || localPresetMode;
    const startDateStr = fechaDesde || localStartDate;
    const endDateStr = fechaHasta || localEndDate;

    const handleSelectPreset = (preset) => {
        setLocalPresetMode(preset);
        if (onDatePresetChange) {
            onDatePresetChange(preset);
        } else {
            if (preset === 'este_mes') {
                setLocalStartDate(getPrimerDiaMes());
                setLocalEndDate(getUltimoDiaMes());
            } else if (preset === 'mes_anterior') {
                const { desde, hasta } = getRangoMesAnterior();
                setLocalStartDate(desde);
                setLocalEndDate(hasta);
            }
        }
    };

    const handleCustomDateFrom = (newFrom) => {
        setLocalStartDate(newFrom);
        setLocalPresetMode('personalizado');
        if (onCustomDateChange) {
            onCustomDateChange(newFrom, endDateStr);
        }
    };

    const handleCustomDateTo = (newTo) => {
        setLocalEndDate(newTo);
        setLocalPresetMode('personalizado');
        if (onCustomDateChange) {
            onCustomDateChange(startDateStr, newTo);
        }
    };

    const scrollContainerRef = useRef(null);

    // Dimensiones según zoom
    const dayWidth = zoomLevel === 'compact' ? 36 : zoomLevel === 'detailed' ? 95 : 56;
    const rowHeight = 52;
    const leftColWidth = 190;

    // Generar array de días en el rango con protección estricta de RAM (máximo 45 días continuos)
    const { days, isRangeClamped } = useMemo(() => {
        const list = [];
        if (!startDateStr || !endDateStr) return { days: list, isRangeClamped: false };

        const start = new Date(startDateStr + 'T00:00:00');
        const end = new Date(endDateStr + 'T23:59:59');
        if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
            return { days: list, isRangeClamped: false };
        }

        // Límite de seguridad de RAM: máx 45 días continuos para prevenir cuelgues del dispositivo
        const MAX_GANTT_DAYS = 45;
        let curr = new Date(start);
        let count = 0;
        let clamped = false;

        while (curr <= end) {
            if (count >= MAX_GANTT_DAYS) {
                clamped = true;
                break;
            }

            const dateStr = curr.toISOString().split('T')[0];
            const dayNum = curr.getDate();
            const dayOfWeek = curr.toLocaleDateString('es-AR', { weekday: 'narrow' }).toUpperCase();
            const monthName = curr.toLocaleDateString('es-AR', { month: 'short' }).toUpperCase();
            const isWeekend = curr.getDay() === 0 || curr.getDay() === 6;
            const isToday = dateStr === new Date().toISOString().split('T')[0];

            list.push({
                dateStr,
                dayNum,
                dayOfWeek,
                monthName,
                isWeekend,
                isToday,
                dateObj: new Date(curr)
            });

            curr.setDate(curr.getDate() + 1);
            count++;
        }
        return { days: list, isRangeClamped: clamped };
    }, [startDateStr, endDateStr]);

    // Agrupar admisiones/tramos con su cama normalizada
    const admissions = useMemo(() => {
        // Prioridad 1: Historial canónico de traslados físicos de camas (tramos exactos)
        if (historialCamas && historialCamas.length > 0) {
            const list = [];
            historialCamas.forEach((r, idx) => {
                const habNorm = normalizeCamaId(r.habitacion);
                if (!habNorm) return;

                const admId = r.numero_admision ? String(r.numero_admision).trim() : String(r.id_admision);
                const uniqueKey = `${r.id_admision}_${habNorm}_${r.fecha_inicio || idx}`;

                list.push({
                    key: uniqueKey,
                    id: admId,
                    idAdmision: r.id_admision,
                    paciente: r.paciente || 'PACIENTE SIN IDENTIFICAR',
                    habitacion: habNorm,
                    habitacionRaw: r.habitacion,
                    camaSub: r.cama,
                    fechaIngreso: r.fecha_inicio ? new Date(r.fecha_inicio) : null,
                    fechaAlta: r.fecha_fin ? new Date(r.fecha_fin) : null,
                    cliente: r.cliente || 'Particular',
                    edad: r.edad,
                    especialidad: r.especialidad || 'UCI',
                    motivoAlta: r.motivo_de_alta || (r.fecha_fin ? 'Alta / Traslado' : 'Internado activo'),
                    servicio: r.servicio || 'UCI'
                });
            });
            return list;
        }

        // Fallback: Datos agregados de rawData
        if (!rawData || rawData.length === 0) return [];
        const map = new Map();

        rawData.forEach(r => {
            const id = r.id_admision || r.numero_admision;
            if (!id) return;

            const habNorm = normalizeCamaId(r.habitacion);
            if (!habNorm) return;

            if (!map.has(id)) {
                map.set(id, {
                    key: String(id),
                    id: r.numero_admision || String(r.id_admision),
                    idAdmision: r.id_admision,
                    paciente: r.paciente || 'PACIENTE SIN IDENTIFICAR',
                    habitacion: habNorm,
                    habitacionRaw: r.habitacion,
                    camaSub: null,
                    fechaIngreso: r.fecha_ingreso ? new Date(r.fecha_ingreso) : null,
                    fechaAlta: r.fecha_alta ? new Date(r.fecha_alta) : null,
                    cliente: r.cliente || 'Particular',
                    edad: r.edad,
                    especialidad: r.especialidad || 'UCI',
                    motivoAlta: r.motivo_de_alta || (r.fecha_alta ? 'Alta' : 'Internado activo'),
                    servicio: r.servicio || 'UCI'
                });
            }
        });

        return Array.from(map.values());
    }, [historialCamas, rawData]);

    // Camas a mostrar según subnivel
    const visibleCamas = useMemo(() => {
        if (subNivel === 'INTENSIVA') {
            return CAMAS_UCI_CONFIG.filter(c => c.sector === 'INTENSIVA');
        }
        if (subNivel === 'INTERMEDIA') {
            return CAMAS_UCI_CONFIG.filter(c => c.sector === 'INTERMEDIA');
        }
        return CAMAS_UCI_CONFIG;
    }, [subNivel]);

    // Mapeo de admisiones por cama
    const admissionsByCama = useMemo(() => {
        const byCama = {};
        CAMAS_UCI_CONFIG.forEach(c => {
            byCama[c.id] = [];
        });

        const startRange = new Date(startDateStr + 'T00:00:00');
        const endRange = new Date(endDateStr + 'T23:59:59');

        admissions.forEach(adm => {
            if (!adm.habitacion || !byCama[adm.habitacion]) return;
            if (!adm.fechaIngreso) return;

            const admStart = adm.fechaIngreso;
            const admEnd = adm.fechaAlta || new Date(); // Si no tiene alta, continúa hasta hoy

            // Verificar si intersecta con el período visible
            if (admEnd >= startRange && admStart <= endRange) {
                // Calcular posición y ancho en píxeles
                const startClamped = admStart < startRange ? startRange : admStart;
                const endClamped = admEnd > endRange ? endRange : admEnd;

                // Días desde el inicio del rango
                const diffDaysStart = Math.max(0, (startClamped - startRange) / (1000 * 60 * 60 * 24));
                // Duración en días en el viewport
                const durationDays = Math.max(0.6, (endClamped - startClamped) / (1000 * 60 * 60 * 24));

                const leftPx = diffDaysStart * dayWidth;
                const widthPx = Math.max(28, durationDays * dayWidth);

                // Días totales reales de estancia
                const totalDays = Math.max(1, Math.ceil((admEnd - admStart) / (1000 * 60 * 60 * 24)));

                // Asignar color por cobertura
                const hash = (adm.cliente || '').split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
                const colorTheme = PALETA_COBERTURAS[hash % PALETA_COBERTURAS.length];

                const matchesSearch = !searchTerm.trim() || 
                    adm.paciente.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
                    adm.id.toLowerCase().includes(searchTerm.toLowerCase().trim()) ||
                    adm.cliente.toLowerCase().includes(searchTerm.toLowerCase().trim());

                byCama[adm.habitacion].push({
                    ...adm,
                    leftPx,
                    widthPx,
                    totalDays,
                    colorTheme,
                    isCurrentActive: !adm.fechaAlta,
                    isDefuncion: (adm.motivoAlta || '').toLowerCase().includes('defunci'),
                    matchesSearch
                });
            }
        });

        return byCama;
    }, [admissions, startDateStr, endDateStr, dayWidth, searchTerm]);

    // Estadísticas del Gantt en la vista actual
    const stats = useMemo(() => {
        let camasOcupadasAhora = 0;
        let estanciaSum = 0;
        let countEstancia = 0;
        const uniquePatients = new Set();
        const camasConPacientes = {};

        visibleCamas.forEach(c => {
            const list = admissionsByCama[c.id] || [];
            camasConPacientes[c.id] = list.length;

            list.forEach(item => {
                uniquePatients.add(item.idAdmision || item.id);
                if (item.isCurrentActive) camasOcupadasAhora++;
                if (item.totalDays) {
                    estanciaSum += item.totalDays;
                    countEstancia++;
                }
            });
        });

        const totalEnVista = uniquePatients.size;

        // Cama con mayor movimiento
        let maxCama = '-';
        let maxCount = 0;
        Object.entries(camasConPacientes).forEach(([cam, cnt]) => {
            if (cnt > maxCount) {
                maxCount = cnt;
                maxCama = cam;
            }
        });

        const alosVista = countEstancia > 0 ? (estanciaSum / countEstancia).toFixed(1) : '-';

        return {
            totalEnVista,
            camasOcupadasAhora: Math.min(visibleCamas.length, camasOcupadasAhora),
            alosVista,
            maxCama,
            maxCount
        };
    }, [visibleCamas, admissionsByCama]);

    // Desplazamiento horizontal fluido (de derecha a izquierda y viceversa)
    const handleScrollHorizontal = (direction) => {
        if (!scrollContainerRef.current) return;
        const offset = direction === 'left' ? -350 : 350;
        scrollContainerRef.current.scrollBy({ left: offset, behavior: 'smooth' });
    };

    // Navegación rápida por días/semanas
    const handleShiftDates = (daysDelta) => {
        const s = new Date(startDateStr + 'T00:00:00');
        const e = new Date(endDateStr + 'T00:00:00');
        s.setDate(s.getDate() + daysDelta);
        e.setDate(e.getDate() + daysDelta);
        const newFrom = s.toISOString().split('T')[0];
        const newTo = e.toISOString().split('T')[0];
        setLocalStartDate(newFrom);
        setLocalEndDate(newTo);
        setLocalPresetMode('personalizado');
        if (onCustomDateChange) {
            onCustomDateChange(newFrom, newTo);
        }
    };

    // Auto-scroll inicial a mitad de mes o a "hoy"
    useEffect(() => {
        if (scrollContainerRef.current) {
            // Centrar aproximadamente en el medio de la cuadrícula
            const totalWidth = days.length * dayWidth;
            scrollContainerRef.current.scrollLeft = Math.max(0, (totalWidth / 3) - 100);
        }
    }, [zoomLevel]);

    // Exportar datos visibles del Gantt a Excel
    const handleExportExcel = () => {
        const rowsToExport = [];
        visibleCamas.forEach(c => {
            const list = admissionsByCama[c.id] || [];
            list.forEach(adm => {
                rowsToExport.push({
                    'CAMA / HABITACIÓN': c.label,
                    'TIPO DE TERAPIA': c.sector === 'INTENSIVA' ? 'Terapia Intensiva' : 'Terapia Intermedia',
                    'N° ADMISIÓN': adm.id,
                    'PACIENTE': adm.paciente,
                    'EDAD': adm.edad ? `${adm.edad} años` : '-',
                    'OBRA SOCIAL': adm.cliente,
                    'FECHA INGRESO': adm.fechaIngreso ? adm.fechaIngreso.toLocaleDateString('es-AR') : '-',
                    'FECHA ALTA': adm.fechaAlta ? adm.fechaAlta.toLocaleDateString('es-AR') : 'Internado Activo',
                    'DÍAS ESTANCIA': adm.totalDays,
                    'ESTADO / MOTIVO': adm.motivoAlta
                });
            });
        });

        const ws = XLSX.utils.json_to_sheet(rowsToExport);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Gantt_UCI');
        XLSX.writeFile(wb, `Gantt_Ocupacion_UCI_${startDateStr}_${endDateStr}.xlsx`);
    };

    return (
        <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #CBD5E1',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.04)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            fontFamily: "'Montserrat', sans-serif, -apple-system",
            ...(isFullscreen ? {
                position: 'fixed',
                top: 10,
                left: 10,
                right: 10,
                bottom: 10,
                zIndex: 99999,
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
            } : {})
        }}>
            {/* ─── BARRA DE CONTROL SUPERIOR ─── */}
            <div style={{
                padding: '12px 18px',
                background: 'linear-gradient(180deg, #FFFFFF 0%, #F8FAFC 100%)',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                {/* Título y Selector de Sub-Nivel */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        background: '#1E40AF',
                        color: '#FFFFFF',
                        padding: '6px 8px',
                        borderRadius: '8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <Bed size={18} />
                    </div>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                Cronograma Gantt de Ocupación UCI
                            </h2>
                            <span style={{
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                padding: '2px 8px',
                                borderRadius: '10px',
                                border: '1px solid #BFDBFE'
                            }}>
                                16 Camas Críticas
                            </span>
                        </div>
                        <span style={{ fontSize: '0.73rem', color: '#64748B' }}>
                            Trazabilidad longitudinal de camas en el tiempo (desplazamiento continuo)
                        </span>
                    </div>

                    {/* Selector de sub-nivel de camas */}
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        padding: '3px',
                        borderRadius: '8px',
                        border: '1px solid #CBD5E1',
                        gap: '3px',
                        marginLeft: '8px'
                    }}>
                        {[
                            { id: 'TODAS', label: '16 Camas (Total)', icon: '⚡' },
                            { id: 'INTENSIVA', label: 'Intensiva (Box 1-8)', icon: '🔴' },
                            { id: 'INTERMEDIA', label: 'Intermedia (222-229)', icon: '🟡' }
                        ].map(t => (
                            <button
                                key={t.id}
                                onClick={() => setSubNivel(t.id)}
                                style={{
                                    background: subNivel === t.id ? '#1E40AF' : 'transparent',
                                    color: subNivel === t.id ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 8px',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease'
                                }}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Controles de Navegación Temporal y Desplazamiento */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    
                    {/* Botones de Desplazamiento Horizontal (Izquierda / Derecha) */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        padding: '2px 4px',
                        gap: '2px'
                    }}>
                        <button
                            onClick={() => handleScrollHorizontal('left')}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '5px',
                                width: '28px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#1E40AF'
                            }}
                            title="Desplazar línea de tiempo hacia la izquierda"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#1E40AF', padding: '0 6px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <ArrowLeftRight size={12} />
                            Desplazar
                        </span>
                        <button
                            onClick={() => handleScrollHorizontal('right')}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '5px',
                                width: '28px',
                                height: '26px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: 'pointer',
                                color: '#1E40AF'
                            }}
                            title="Desplazar línea de tiempo hacia la derecha"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>

                    {/* Selector de Período Clínico idéntico: Este Mes | Mes Anterior | Personalizado */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <div style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            background: '#F1F5F9',
                            padding: '2px',
                            borderRadius: '8px',
                            border: '1px solid #CBD5E1',
                            gap: '2px'
                        }}>
                            <button
                                type="button"
                                onClick={() => handleSelectPreset('este_mes')}
                                style={{
                                    background: activePreset === 'este_mes' ? '#1E40AF' : 'transparent',
                                    color: activePreset === 'este_mes' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 9px',
                                    fontSize: '0.72rem',
                                    fontWeight: activePreset === 'este_mes' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: activePreset === 'este_mes' ? '0 1px 2px rgba(30, 64, 175, 0.2)' : 'none'
                                }}
                                title="Filtrar datos del mes en curso"
                            >
                                Este Mes
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectPreset('mes_anterior')}
                                style={{
                                    background: activePreset === 'mes_anterior' ? '#1E40AF' : 'transparent',
                                    color: activePreset === 'mes_anterior' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 9px',
                                    fontSize: '0.72rem',
                                    fontWeight: activePreset === 'mes_anterior' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: activePreset === 'mes_anterior' ? '0 1px 2px rgba(30, 64, 175, 0.2)' : 'none'
                                }}
                                title="Filtrar datos del mes cerrado anterior"
                            >
                                Mes Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => handleSelectPreset('personalizado')}
                                style={{
                                    background: activePreset === 'personalizado' ? '#1E40AF' : 'transparent',
                                    color: activePreset === 'personalizado' ? '#FFFFFF' : '#475569',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '4px 9px',
                                    fontSize: '0.72rem',
                                    fontWeight: activePreset === 'personalizado' ? 700 : 500,
                                    cursor: 'pointer',
                                    transition: 'all 0.15s ease',
                                    boxShadow: activePreset === 'personalizado' ? '0 1px 2px rgba(30, 64, 175, 0.2)' : 'none'
                                }}
                                title="Seleccionar rango de fechas manual"
                            >
                                Personalizado
                            </button>
                        </div>

                        {/* Rango de Fechas Interactivo (Desde - Hasta) */}
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            background: activePreset === 'personalizado' ? '#EFF6FF' : '#FFFFFF',
                            border: activePreset === 'personalizado' ? '1px solid #93C5FD' : '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '2px 8px',
                            transition: 'all 0.2s ease',
                            boxShadow: activePreset === 'personalizado' ? '0 0 0 2px rgba(59, 130, 246, 0.1)' : 'none'
                        }}>
                            <Calendar size={13} color={activePreset === 'personalizado' ? '#2563EB' : '#64748B'} />
                            <input
                                type="date"
                                value={startDateStr}
                                onChange={(e) => handleCustomDateFrom(e.target.value)}
                                style={{
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.72rem',
                                    color: '#1E293B',
                                    background: '#FFFFFF',
                                    fontWeight: 600
                                }}
                                title="Fecha Desde"
                            />
                            <span style={{ color: activePreset === 'personalizado' ? '#2563EB' : '#94A3B8', fontSize: '0.72rem', fontWeight: 600 }}>a</span>
                            <input
                                type="date"
                                value={endDateStr}
                                onChange={(e) => handleCustomDateTo(e.target.value)}
                                style={{
                                    padding: '2px 4px',
                                    borderRadius: '4px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.72rem',
                                    color: '#1E293B',
                                    background: '#FFFFFF',
                                    fontWeight: 600
                                }}
                                title="Fecha Hasta"
                            />
                        </div>

                        {/* Aviso protector de memoria si el rango fue acotado */}
                        {isRangeClamped && (
                            <div style={{
                                background: '#FEF3C7',
                                border: '1px solid #FCD34D',
                                color: '#92400E',
                                fontSize: '0.68rem',
                                fontWeight: 700,
                                padding: '3px 8px',
                                borderRadius: '6px'
                            }} title="El diagrama de Gantt limita la cuadrícula a 45 días continuos para prevenir cuelgues del navegador y exceso de consumo de RAM">
                                ⚡ Máx. 45 días (Protección RAM)
                            </div>
                        )}
                    </div>

                    {/* Selector de Zoom */}
                    <div style={{
                        display: 'flex',
                        background: '#F1F5F9',
                        padding: '2px',
                        borderRadius: '6px',
                        border: '1px solid #CBD5E1',
                        gap: '2px'
                    }}>
                        {[
                            { id: 'compact', label: 'Compacto' },
                            { id: 'normal', label: 'Normal' },
                            { id: 'detailed', label: 'Detallado' }
                        ].map(z => (
                            <button
                                key={z.id}
                                onClick={() => setZoomLevel(z.id)}
                                style={{
                                    background: zoomLevel === z.id ? '#FFFFFF' : 'transparent',
                                    color: zoomLevel === z.id ? '#0F172A' : '#64748B',
                                    fontWeight: zoomLevel === z.id ? 700 : 500,
                                    border: 'none',
                                    borderRadius: '4px',
                                    padding: '3px 6px',
                                    fontSize: '0.68rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {z.label}
                            </button>
                        ))}
                    </div>

                    {/* Buscador de Paciente */}
                    <div style={{ position: 'relative' }}>
                        <Search size={13} color="#94A3B8" style={{ position: 'absolute', left: '8px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar paciente..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{
                                padding: '4px 8px 4px 26px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.72rem',
                                width: '130px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    {/* Exportar Excel */}
                    <button
                        onClick={handleExportExcel}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '5px 10px',
                            borderRadius: '6px',
                            background: '#ECFDF5',
                            border: '1px solid #10B981',
                            color: '#065F46',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                        title="Exportar registros a Excel tabulado"
                    >
                        <Download size={13} />
                        Excel
                    </button>

                    {/* Pantalla completa */}
                    <button
                        onClick={() => setIsFullscreen(prev => !prev)}
                        style={{
                            background: '#FFFFFF',
                            border: '1px solid #CBD5E1',
                            borderRadius: '6px',
                            padding: '5px 8px',
                            color: '#64748B',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center'
                        }}
                        title={isFullscreen ? 'Salir de pantalla completa' : 'Ver en pantalla completa'}
                    >
                        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                    </button>

                    {onClose && (
                        <button
                            onClick={onClose}
                            style={{
                                background: '#FFFFFF',
                                border: '1px solid #CBD5E1',
                                borderRadius: '6px',
                                padding: '5px 8px',
                                color: '#EF4444',
                                fontWeight: 700,
                                cursor: 'pointer',
                                fontSize: '0.75rem'
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            </div>

            {/* ─── MINI BANNER DE MÉTRICAS DEL GANTT ─── */}
            <div style={{
                background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                padding: '6px 18px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.74rem',
                color: '#475569'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <span>
                        Mostrando: <strong>{visibleCamas.length} camas</strong> ({visibleCamas.filter(c => c.sector === 'INTERMEDIA').length} Intermedia, {visibleCamas.filter(c => c.sector === 'INTENSIVA').length} Intensiva)
                    </span>
                    <span>
                        Pacientes en vista: <strong>{stats.totalEnVista}</strong> admisiones
                    </span>
                    <span>
                        Estancia Media: <strong>{stats.alosVista} días</strong>
                    </span>
                    <span>
                        Cama con mayor rotación: <strong>{stats.maxCama} ({stats.maxCount} pacientes)</strong>
                    </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#10B981' }} />
                        <span style={{ fontSize: '0.7rem' }}>Internado Activo</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#3B82F6' }} />
                        <span style={{ fontSize: '0.7rem' }}>Alta Médica</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <div style={{ width: '10px', height: '10px', borderRadius: '3px', background: '#EF4444' }} />
                        <span style={{ fontSize: '0.7rem' }}>Defunción</span>
                    </div>
                </div>
            </div>

            {/* ─── CONTENEDOR PRINCIPAL DEL GANTT (SCROLL HORIZONTAL Y VERTICAL) ─── */}
            <div 
                ref={scrollContainerRef}
                style={{
                    flex: 1,
                    overflowX: 'auto',
                    overflowY: 'auto',
                    position: 'relative',
                    maxHeight: isFullscreen ? 'calc(100vh - 120px)' : '620px',
                    background: '#FFFFFF'
                }}
            >
                <div style={{
                    display: 'flex',
                    minWidth: `${leftColWidth + (days.length * dayWidth)}px`,
                    position: 'relative'
                }}>

                    {/* ═══ EJE Y: COLUMNA IZQUIERDA FIJA CON TODAS LAS CAMAS ═══ */}
                    <div style={{
                        width: `${leftColWidth}px`,
                        position: 'sticky',
                        left: 0,
                        zIndex: 30,
                        background: '#FFFFFF',
                        borderRight: '2px solid #CBD5E1',
                        boxShadow: '4px 0 10px rgba(0,0,0,0.03)',
                        flexShrink: 0
                    }}>
                        {/* Cabecera de la columna izquierda (Cama) */}
                        <div style={{
                            height: '52px',
                            background: '#F1F5F9',
                            borderBottom: '2px solid #CBD5E1',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0 12px',
                            fontWeight: 800,
                            fontSize: '0.75rem',
                            color: '#1E293B',
                            textTransform: 'uppercase',
                            letterSpacing: '0.5px',
                            position: 'sticky',
                            top: 0,
                            zIndex: 40
                        }}>
                            <span>Cama / Habitación</span>
                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>UCI</span>
                        </div>

                        {/* Filas de Camas */}
                        {visibleCamas.map((cama, idx) => {
                            const list = admissionsByCama[cama.id] || [];
                            const isIntermedia = cama.sector === 'INTERMEDIA';

                            return (
                                <div
                                    key={cama.id}
                                    style={{
                                        height: `${rowHeight}px`,
                                        borderBottom: '1px solid #E2E8F0',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        padding: '0 12px',
                                        background: idx % 2 === 0 ? '#FFFFFF' : '#FBFCFD',
                                        transition: 'background 0.15s'
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <div style={{
                                            background: isIntermedia ? '#FEF3C7' : '#DBEAFE',
                                            color: isIntermedia ? '#92400E' : '#1E40AF',
                                            border: isIntermedia ? '1px solid #FCD34D' : '1px solid #93C5FD',
                                            borderRadius: '6px',
                                            padding: '3px 7px',
                                            fontWeight: 800,
                                            fontSize: '0.75rem'
                                        }}>
                                            {cama.shortLabel}
                                        </div>
                                        <div>
                                            <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#1E293B' }}>
                                                {cama.label}
                                            </div>
                                            <span style={{ fontSize: '0.64rem', color: isIntermedia ? '#B45309' : '#2563EB', fontWeight: 600 }}>
                                                {isIntermedia ? 'Intermedia' : 'Intensiva'}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Contador de pacientes en el período */}
                                    <span style={{
                                        fontSize: '0.68rem',
                                        fontWeight: 700,
                                        color: list.length > 0 ? '#1E40AF' : '#94A3B8',
                                        background: list.length > 0 ? '#EFF6FF' : '#F1F5F9',
                                        padding: '1px 6px',
                                        borderRadius: '10px'
                                    }}>
                                        {list.length} pac.
                                    </span>
                                </div>
                            );
                        })}
                    </div>

                    {/* ═══ EJE X: TIMELINE Y REJILLA DE GANTT ═══ */}
                    <div style={{ flex: 1, position: 'relative' }}>
                        
                        {/* ── Cabecera Sticky de Fechas (Días) ── */}
                        <div style={{
                            height: '52px',
                            position: 'sticky',
                            top: 0,
                            zIndex: 20,
                            background: '#F8FAFC',
                            borderBottom: '2px solid #CBD5E1',
                            display: 'flex'
                        }}>
                            {days.map((d, i) => (
                                <div
                                    key={d.dateStr}
                                    style={{
                                        width: `${dayWidth}px`,
                                        flexShrink: 0,
                                        borderRight: '1px solid #E2E8F0',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        background: d.isToday 
                                            ? '#EFF6FF' 
                                            : d.isWeekend 
                                                ? '#F1F5F9' 
                                                : '#F8FAFC',
                                        position: 'relative'
                                    }}
                                >
                                    {/* Etiqueta de mes si es primer día del mes o primer día del array */}
                                    {(d.dayNum === 1 || i === 0) && (
                                        <span style={{
                                            position: 'absolute',
                                            top: '2px',
                                            left: '4px',
                                            fontSize: '0.62rem',
                                            fontWeight: 800,
                                            color: '#1E40AF',
                                            textTransform: 'uppercase'
                                        }}>
                                            {d.monthName}
                                        </span>
                                    )}

                                    <span style={{ fontSize: '0.62rem', fontWeight: 600, color: d.isWeekend ? '#94A3B8' : '#64748B' }}>
                                        {d.dayOfWeek}
                                    </span>
                                    <span style={{
                                        fontSize: '0.78rem',
                                        fontWeight: d.isToday ? 800 : 700,
                                        color: d.isToday ? '#2563EB' : '#1E293B',
                                        marginTop: '1px'
                                    }}>
                                        {d.dayNum}
                                    </span>

                                    {/* Indicador visual de HOY */}
                                    {d.isToday && (
                                        <div style={{
                                            width: '4px',
                                            height: '4px',
                                            borderRadius: '50%',
                                            background: '#2563EB',
                                            position: 'absolute',
                                            bottom: '2px'
                                        }} />
                                    )}
                                </div>
                            ))}
                        </div>

                        {/* ── Rejilla de Fondo y Barras de Pacientes ── */}
                        <div style={{ position: 'relative' }}>
                            
                            {/* Columnas de cuadrícula de fondo */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                display: 'flex',
                                pointerEvents: 'none',
                                zIndex: 1
                            }}>
                                {days.map(d => (
                                    <div
                                        key={d.dateStr}
                                        style={{
                                            width: `${dayWidth}px`,
                                            flexShrink: 0,
                                            borderRight: '1px dashed #F1F5F9',
                                            background: d.isToday ? 'rgba(239, 246, 255, 0.45)' : d.isWeekend ? 'rgba(248, 250, 252, 0.5)' : 'transparent',
                                            height: '100%'
                                        }}
                                    />
                                ))}
                            </div>

                            {/* Filas de Camas con sus respectivas barras de pacientes */}
                            {visibleCamas.map((cama, idx) => {
                                const list = admissionsByCama[cama.id] || [];

                                return (
                                    <div
                                        key={cama.id}
                                        style={{
                                            height: `${rowHeight}px`,
                                            borderBottom: '1px solid #E2E8F0',
                                            position: 'relative',
                                            background: idx % 2 === 0 ? 'transparent' : 'rgba(251, 252, 253, 0.4)',
                                            zIndex: 2
                                        }}
                                    >
                                        {/* Barras de Internación */}
                                        {list.map(adm => {
                                            const isSelected = selectedPatient?.key ? selectedPatient.key === adm.key : selectedPatient?.id === adm.id;
                                            const opacity = adm.matchesSearch ? 1 : 0.25;

                                            return (
                                                <div
                                                    key={adm.key || adm.id}
                                                    onClick={() => setSelectedPatient(adm)}
                                                    onMouseEnter={(e) => {
                                                        const rect = e.currentTarget.getBoundingClientRect();
                                                        setTooltipPos({ x: rect.left + 20, y: rect.top - 10 });
                                                        setHoveredPatient(adm);
                                                    }}
                                                    onMouseLeave={() => setHoveredPatient(null)}
                                                    style={{
                                                        position: 'absolute',
                                                        left: `${adm.leftPx}px`,
                                                        width: `${adm.widthPx}px`,
                                                        top: '8px',
                                                        height: '36px',
                                                        background: adm.isDefuncion
                                                            ? 'linear-gradient(135deg, #DC2626, #EF4444)'
                                                            : adm.isCurrentActive
                                                                ? 'linear-gradient(135deg, #059669, #10B981)'
                                                                : adm.colorTheme.bg,
                                                        border: isSelected ? '2px solid #FCD34D' : `1px solid ${adm.colorTheme.border}`,
                                                        borderRadius: '8px',
                                                        boxShadow: isSelected 
                                                            ? '0 0 0 3px rgba(251, 191, 36, 0.5), 0 4px 10px rgba(0,0,0,0.15)' 
                                                            : '0 2px 4px rgba(0,0,0,0.06)',
                                                        color: '#FFFFFF',
                                                        padding: '0 8px',
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'space-between',
                                                        cursor: 'pointer',
                                                        overflow: 'hidden',
                                                        whiteSpace: 'nowrap',
                                                        zIndex: isSelected ? 15 : 5,
                                                        opacity,
                                                        transition: 'transform 0.15s, box-shadow 0.15s, opacity 0.2s',
                                                        transform: isSelected ? 'scale(1.02)' : 'none'
                                                    }}
                                                >
                                                    {/* Nombre del paciente y detalles */}
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0, overflow: 'hidden' }}>
                                                        {adm.isCurrentActive && (
                                                            <div 
                                                                title="Internado Actualmente"
                                                                style={{
                                                                    width: '7px',
                                                                    height: '7px',
                                                                    borderRadius: '50%',
                                                                    background: '#FFFFFF',
                                                                    boxShadow: '0 0 6px rgba(255,255,255,0.8)',
                                                                    flexShrink: 0
                                                                }} 
                                                            />
                                                        )}
                                                        <span style={{
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            overflow: 'hidden',
                                                            textOverflow: 'ellipsis',
                                                            letterSpacing: '0.2px'
                                                        }}>
                                                            {adm.paciente}
                                                        </span>
                                                        <span style={{ fontSize: '0.65rem', opacity: 0.85, fontWeight: 500 }}>
                                                            • {adm.cliente}
                                                        </span>
                                                    </div>

                                                    {/* Badge de Estancia */}
                                                    {adm.widthPx > 90 && (
                                                        <span style={{
                                                            fontSize: '0.64rem',
                                                            fontWeight: 800,
                                                            background: 'rgba(255, 255, 255, 0.25)',
                                                            padding: '1px 6px',
                                                            borderRadius: '10px',
                                                            marginLeft: '6px',
                                                            flexShrink: 0
                                                        }}>
                                                            {adm.totalDays}d
                                                        </span>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>

                    </div>
                </div>
            </div>

            {/* ─── TOOLTIP FLOTANTE AL HACER HOVER ─── */}
            {hoveredPatient && (
                <div style={{
                    position: 'fixed',
                    left: `${tooltipPos.x}px`,
                    top: `${tooltipPos.y - 120}px`,
                    zIndex: 100000,
                    background: '#0F172A',
                    color: '#FFFFFF',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    boxShadow: '0 10px 25px rgba(0,0,0,0.3)',
                    fontSize: '0.74rem',
                    pointerEvents: 'none',
                    maxWidth: '320px',
                    animation: 'fadeIn 0.15s ease'
                }}>
                    <div style={{ fontWeight: 800, fontSize: '0.82rem', marginBottom: '4px', color: '#60A5FA' }}>
                        {hoveredPatient.paciente}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '3px 8px', color: '#E2E8F0' }}>
                        <span style={{ color: '#94A3B8' }}>Cama:</span>
                        <strong style={{ color: '#FCD34D' }}>{hoveredPatient.habitacion}</strong>
                        
                        <span style={{ color: '#94A3B8' }}>Admisión:</span>
                        <span>{hoveredPatient.id}</span>

                        <span style={{ color: '#94A3B8' }}>Obra Social:</span>
                        <span>{hoveredPatient.cliente}</span>

                        <span style={{ color: '#94A3B8' }}>Ingreso:</span>
                        <span>{hoveredPatient.fechaIngreso ? hoveredPatient.fechaIngreso.toLocaleDateString('es-AR') : '-'}</span>

                        <span style={{ color: '#94A3B8' }}>Alta:</span>
                        <span>{hoveredPatient.fechaAlta ? hoveredPatient.fechaAlta.toLocaleDateString('es-AR') : 'Internado Activo'}</span>

                        <span style={{ color: '#94A3B8' }}>Estancia:</span>
                        <strong>{hoveredPatient.totalDays} días</strong>

                        <span style={{ color: '#94A3B8' }}>Estado:</span>
                        <span style={{ color: hoveredPatient.isDefuncion ? '#F87171' : hoveredPatient.isCurrentActive ? '#34D399' : '#93C5FD' }}>
                            {hoveredPatient.motivoAlta}
                        </span>
                    </div>
                </div>
            )}

            {/* ─── MODAL DETALLE DE PACIENTE SELECCIONADO ─── */}
            {selectedPatient && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.4)',
                    backdropFilter: 'blur(3px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 100001
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        width: '440px',
                        maxWidth: '90%',
                        padding: '20px 24px',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
                        border: '1px solid #CBD5E1'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ background: '#EFF6FF', color: '#1E40AF', padding: '6px', borderRadius: '8px' }}>
                                    <Bed size={20} />
                                </div>
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                        Ficha de Ocupación de Cama
                                    </h3>
                                    <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Cama {selectedPatient.habitacion} • N° Admisión {selectedPatient.id}
                                    </span>
                                </div>
                            </div>
                            <button
                                onClick={() => setSelectedPatient(null)}
                                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontSize: '1.1rem', color: '#94A3B8' }}
                            >
                                ✕
                            </button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.8rem' }}>
                            <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block', fontWeight: 700, textTransform: 'uppercase' }}>Paciente</span>
                                <strong style={{ fontSize: '0.95rem', color: '#1E293B' }}>{selectedPatient.paciente}</strong>
                                {selectedPatient.edad && <span style={{ fontSize: '0.75rem', color: '#64748B', display: 'block' }}>Edad: {selectedPatient.edad} años</span>}
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Fecha Ingreso</span>
                                    <strong style={{ color: '#0F172A' }}>{selectedPatient.fechaIngreso ? selectedPatient.fechaIngreso.toLocaleDateString('es-AR') : '-'}</strong>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Fecha Alta</span>
                                    <strong style={{ color: selectedPatient.fechaAlta ? '#0F172A' : '#10B981' }}>
                                        {selectedPatient.fechaAlta ? selectedPatient.fechaAlta.toLocaleDateString('es-AR') : 'Internado Activo'}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Obra Social / Cobertura</span>
                                <strong style={{ color: '#1E40AF' }}>{selectedPatient.cliente}</strong>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Estancia en esta Cama</span>
                                    <strong style={{ color: '#2563EB', fontSize: '0.95rem' }}>{selectedPatient.totalDays} días</strong>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: '8px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <span style={{ fontSize: '0.68rem', color: '#64748B', display: 'block' }}>Motivo / Estado</span>
                                    <strong style={{ color: selectedPatient.isDefuncion ? '#EF4444' : '#0F172A' }}>
                                        {selectedPatient.motivoAlta}
                                    </strong>
                                </div>
                            </div>

                            {/* Cronología de Traslados si tuvo más de una cama */}
                            {(() => {
                                const relatedTransfers = admissions
                                    .filter(a => a.idAdmision === selectedPatient.idAdmision)
                                    .sort((a, b) => (a.fechaIngreso || 0) - (b.fechaIngreso || 0));

                                if (relatedTransfers.length <= 1) return null;

                                return (
                                    <div style={{
                                        background: '#EFF6FF',
                                        border: '1px solid #BFDBFE',
                                        borderRadius: '8px',
                                        padding: '10px 12px',
                                        marginTop: '4px'
                                    }}>
                                        <span style={{
                                            fontSize: '0.68rem',
                                            fontWeight: 800,
                                            color: '#1E40AF',
                                            textTransform: 'uppercase',
                                            display: 'block',
                                            marginBottom: '6px'
                                        }}>
                                            🔄 Ruta de Traslados de Cama ({relatedTransfers.length} movimientos en la internación)
                                        </span>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                            {relatedTransfers.map((t, idx) => {
                                                const isCurrent = t.key === selectedPatient.key;
                                                return (
                                                    <div 
                                                        key={idx}
                                                        style={{
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'space-between',
                                                            background: isCurrent ? '#FFFFFF' : 'transparent',
                                                            padding: '4px 8px',
                                                            borderRadius: '6px',
                                                            border: isCurrent ? '1px solid #3B82F6' : '1px solid transparent',
                                                            fontSize: '0.73rem'
                                                        }}
                                                    >
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            <span style={{ fontWeight: 800, color: isCurrent ? '#2563EB' : '#475569' }}>
                                                                {idx + 1}. {t.habitacion} {t.camaSub ? `(${t.camaSub})` : ''}
                                                            </span>
                                                            {isCurrent && (
                                                                <span style={{ background: '#2563EB', color: '#FFF', fontSize: '0.6rem', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    Viendo
                                                                </span>
                                                            )}
                                                        </div>
                                                        <span style={{ color: '#64748B', fontSize: '0.68rem' }}>
                                                            {t.fechaIngreso ? t.fechaIngreso.toLocaleDateString('es-AR') : '-'} → {t.fechaAlta ? t.fechaAlta.toLocaleDateString('es-AR') : 'Activo'}
                                                        </span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>

                        <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setSelectedPatient(null)}
                                style={{
                                    background: '#2563EB',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    borderRadius: '6px',
                                    padding: '7px 16px',
                                    fontSize: '0.8rem',
                                    fontWeight: 700,
                                    cursor: 'pointer'
                                }}
                            >
                                Cerrar Detalle
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
