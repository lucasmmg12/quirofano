import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, RefreshCw, FileSpreadsheet, Clock, Sliders, X, AlertTriangle, CheckCircle2, Info
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
    CartesianGrid, Tooltip as RechartsTooltip, Legend
} from 'recharts';
import { supabase } from '../../lib/supabase';

const INCONSISTENCIA_META = {
    OK: {
        label: 'OK (Consistente)',
        badgeBg: '#DCFCE7',
        badgeColor: '#166534',
        border: '#86EFAC'
    },
    SIN_HABITACION_CON_ATENCION: {
        label: 'Sin Habitación (Con Atención Real)',
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        border: '#FCD34D'
    },
    INTERNACION_SUSPENDIDA: {
        label: 'Excluida: Internación Suspendida (<1h)',
        badgeBg: '#FFEDD5',
        badgeColor: '#9A3412',
        border: '#FDBA74'
    },
    ABIERTA_OLVIDADA_SIN_ALTA: {
        label: 'Excluida: Abierta sin Alta SALUS',
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        border: '#FCA5A5'
    },
    SERVICIO_INCORRECTO_CHEQUEO: {
        label: 'Excluida: Error Servicio CHEQUEO',
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        border: '#FCA5A5'
    },
    SERVICIO_MAL_IMPUTADO_SR: {
        label: 'Box SR (Cargada como Internación Clínica)',
        badgeBg: '#E0F2FE',
        badgeColor: '#075985',
        border: '#7DD3FC'
    },
    SOLAPAMIENTO_HORARIO_BOX: {
        label: 'OK (Solapamiento deduplicado en Box)',
        badgeBg: '#EDE9FE',
        badgeColor: '#5B21B6',
        border: '#C4B5FD'
    }
};

const BOX_COLORS = ['#1E40AF', '#0284C7', '#0D9488', '#4F46E5', '#D97706', '#059669'];

function formatDateDMY(ymd) {
    if (!ymd) return '-';
    const s = String(ymd).slice(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return s;
    return `${d}/${m}/${y}`;
}

function formatSqlDateTime(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr).slice(0, 19);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

function formatDateTimeShort(isoStr) {
    if (!isoStr) return 'SIN ALTA (ABIERTA)';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return String(isoStr).slice(0, 16);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    return `${dd}/${mm}/${yyyy} ${hh}:${mi}`;
}

function countCalendarDaysInclusive(startStr, endStr) {
    if (!startStr || !endStr) return 30;
    const [sy, sm, sd] = startStr.split('-').map(Number);
    const [ey, em, ed] = endStr.split('-').map(Number);
    const t1 = Date.UTC(sy, sm - 1, sd);
    const t2 = Date.UTC(ey, em - 1, ed);
    if (isNaN(t1) || isNaN(t2) || t2 < t1) return 1;
    return Math.floor((t2 - t1) / 86400000) + 1;
}

/**
 * Fórmula que aplica actualmente la planilla de Dirección:
 * Si Horas/24 < 1 -> pone 1 día entero; si Horas >= 24 -> redondea Horas/24 a 2 decimales.
 */
function calcDiasFormulaDireccion(horas) {
    const h = Number(horas || 0);
    if (h <= 0) return 0;
    if (h < 24) return 1;
    return Math.round((h / 24) * 100) / 100;
}

function isSerieI(adm) {
    const n = String(adm.numero_admision || '').trim().toUpperCase();
    return n.startsWith('I');
}

function isSerieSR(adm) {
    const n = String(adm.numero_admision || '').trim().toUpperCase();
    return n.startsWith('SR');
}

function formatRecorridoCamas(tramos) {
    if (!Array.isArray(tramos) || tramos.length === 0) return '-';
    const parts = tramos
        .filter(t => t.unidad && t.unidad !== 'SIN_HABITACION')
        .map(t => `${t.unidad} (${Number(t.horas || 0).toFixed(1)}h)`);
    return parts.length ? parts.join(' → ') : 'SIN CAMA EN HISTORIAL';
}

export default function GuardiaAdmisionesOcupacionPanel({
    addToast,
    selectedPeriodoProp,
    fechaDesde,
    fechaHasta,
    onOpenFicha557ById
}) {
    // Vista principal por defecto: LA PLANILLA COMPLETA DE ADMISIONES (formato Excel comparable con Dirección)
    const [viewTab, setViewTab] = useState('planilla_excel'); // 'planilla_excel' | 'ocupacion_boxes' | 'auditoria'
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [admisiones, setAdmisiones] = useState([]);
    const [ocupacionDiaria, setOcupacionDiaria] = useState([]);
    const [boxesConfig, setBoxesConfig] = useState(3);

    // Override local de rango para que el usuario pueda ver con 1 clic "Corte Dirección (Nov 2025 - Jun 2026)" o "Año 2026" o usar el filtro superior del Telar
    const [rangeMode, setRangeMode] = useState('telar'); // 'telar' | 'corte_direccion' | 'anio_2026' | 'todo_2025_2026' | 'custom_local'
    const [customDesde, setCustomDesde] = useState('2025-11-01');
    const [customHasta, setCustomHasta] = useState('2026-06-30');

    // Filtros de la planilla tipo Excel
    const [serieFilter, setSerieFilter] = useState('TODAS'); // 'TODAS' | 'SOLO_I_DIRECCION' | 'SOLO_SR_OMITIDAS'
    const [ubicacionFilter, setUbicacionFilter] = useState('TODAS'); // 'TODAS' | 'SHOCK_ROOM' | 'PISO' | 'SIN_HABITACION' | 'EXCLUIDAS'
    const [procesoFilter, setProcesoFilter] = useState('TODOS'); // 'TODOS' | '400109' | '420301' | 'SIN_PROCESO'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAdmDetail, setSelectedAdmDetail] = useState(null);
    const [selectedInspectDate, setSelectedInspectDate] = useState('');

    // Si el usuario cambia las fechas arriba en la barra del Telar, volver automáticamente a 'telar'
    useEffect(() => {
        if (fechaDesde && fechaHasta) {
            setRangeMode('telar');
        }
    }, [fechaDesde, fechaHasta, selectedPeriodoProp]);

    const fetchAllRows = async (table, orderCol) => {
        const pageSize = 1000;
        let all = [];
        let from = 0;
        while (true) {
            let q = supabase.from(table).select('*').range(from, from + pageSize - 1);
            if (orderCol) q = q.order(orderCol, { ascending: false });
            const { data, error } = await q;
            if (error) throw error;
            if (!data || data.length === 0) break;
            all = all.concat(data);
            if (data.length < pageSize) break;
            from += pageSize;
        }
        return all;
    };

    const loadData = async () => {
        setLoading(true);
        try {
            const [admRows, ocupRows, cfgRes] = await Promise.all([
                fetchAllRows('gob_guardia_admisiones_paola', 'fecha_ingreso'),
                fetchAllRows('gob_guardia_ocupacion_diaria_box', 'fecha'),
                supabase
                    .from('gob_internacion_camas_config')
                    .select('*')
                    .eq('sector', 'SHOCK ROOM')
                    .eq('anio', 2026)
                    .maybeSingle()
            ]);

            setAdmisiones(admRows || []);
            setOcupacionDiaria(ocupRows || []);
            if (cfgRes.data?.camas_operativas) {
                setBoxesConfig(Number(cfgRes.data.camas_operativas) || 3);
            }
        } catch (err) {
            console.error('Error cargando Admisiones de Guardia Clínica:', err);
            addToast?.('Error al cargar admisiones de Guardia Clínica', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const handleSyncFromSalus = async () => {
        setSyncing(true);
        try {
            const res = await fetch('http://localhost:3456/api/salus/guardia-admisiones-ocupacion/sync', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-admqui-client': 'admqui-web-v1'
                },
                body: JSON.stringify({ startYear: 2025 })
            });
            if (res.ok) {
                addToast?.('Padrón de admisiones sincronizado en vivo desde SALUS', 'success');
                await loadData();
            } else {
                await loadData();
                addToast?.('Datos recargados desde Supabase', 'info');
            }
        } catch (_) {
            await loadData();
            addToast?.('Datos recargados desde Supabase', 'info');
        } finally {
            setSyncing(false);
        }
    };

    // Rango efectivo activo
    const effectiveDateRange = useMemo(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const maxDataDate = ocupacionDiaria.length > 0 ? ocupacionDiaria[0].fecha : todayStr;
        const capEnd = maxDataDate < todayStr ? todayStr : maxDataDate;

        if (rangeMode === 'corte_direccion') {
            return {
                desde: '2025-11-01',
                hasta: '2026-06-30',
                diasCalendario: countCalendarDaysInclusive('2025-11-01', '2026-06-30'),
                label: 'Corte Planilla Dirección (01/11/2025 al 30/06/2026)'
            };
        }
        if (rangeMode === 'anio_2026') {
            return {
                desde: '2026-01-01',
                hasta: capEnd,
                diasCalendario: countCalendarDaysInclusive('2026-01-01', capEnd),
                label: `Año 2026 Completo (01/01/2026 al ${formatDateDMY(capEnd)})`
            };
        }
        if (rangeMode === 'todo_2025_2026') {
            return {
                desde: '2025-01-01',
                hasta: capEnd,
                diasCalendario: countCalendarDaysInclusive('2025-01-01', capEnd),
                label: `Histórico Completo 2025–2026 (01/01/2025 al ${formatDateDMY(capEnd)})`
            };
        }
        if (rangeMode === 'custom_local') {
            return {
                desde: customDesde,
                hasta: customHasta,
                diasCalendario: countCalendarDaysInclusive(customDesde, customHasta),
                label: `${formatDateDMY(customDesde)} al ${formatDateDMY(customHasta)}`
            };
        }

        // Default 'telar'
        if (fechaDesde && fechaHasta) {
            const endEffective = fechaHasta > capEnd ? capEnd : fechaHasta;
            const safeEnd = endEffective >= fechaDesde ? endEffective : fechaHasta;
            return {
                desde: fechaDesde,
                hasta: safeEnd,
                diasCalendario: countCalendarDaysInclusive(fechaDesde, safeEnd),
                label: `${formatDateDMY(fechaDesde)} al ${formatDateDMY(safeEnd)}`
            };
        }
        if (selectedPeriodoProp && /^\d{4}-\d{2}$/.test(selectedPeriodoProp)) {
            const [y, m] = selectedPeriodoProp.split('-').map(Number);
            const lastDay = new Date(y, m, 0).getDate();
            const dDesde = `${selectedPeriodoProp}-01`;
            const rawEnd = `${selectedPeriodoProp}-${String(lastDay).padStart(2, '0')}`;
            const dHasta = rawEnd > capEnd && capEnd.startsWith(selectedPeriodoProp) ? capEnd : rawEnd;
            return {
                desde: dDesde,
                hasta: dHasta,
                diasCalendario: countCalendarDaysInclusive(dDesde, dHasta),
                label: `${formatDateDMY(dDesde)} al ${formatDateDMY(dHasta)}`
            };
        }
        return {
            desde: '2026-01-01',
            hasta: capEnd,
            diasCalendario: countCalendarDaysInclusive('2026-01-01', capEnd),
            label: `01/01/2026 al ${formatDateDMY(capEnd)}`
        };
    }, [rangeMode, customDesde, customHasta, fechaDesde, fechaHasta, selectedPeriodoProp, ocupacionDiaria]);

    // Admisiones del rango de fechas seleccionado
    const periodAdmisiones = useMemo(() => {
        const { desde, hasta } = effectiveDateRange;
        return admisiones.filter(a => {
            const d = String(a.fecha_ingreso_date || '').slice(0, 10);
            return d >= desde && d <= hasta;
        });
    }, [admisiones, effectiveDateRange]);

    const periodOcupacion = useMemo(() => {
        const { desde, hasta } = effectiveDateRange;
        return ocupacionDiaria.filter(o => {
            const d = String(o.fecha || '').slice(0, 10);
            return d >= desde && d <= hasta;
        });
    }, [ocupacionDiaria, effectiveDateRange]);

    // Filas filtradas en la Planilla Principal Tipo Excel
    const filteredRows = useMemo(() => {
        return periodAdmisiones.filter(a => {
            if (serieFilter === 'SOLO_I_DIRECCION' && !isSerieI(a)) return false;
            if (serieFilter === 'SOLO_SR_OMITIDAS' && !isSerieSR(a)) return false;

            if (ubicacionFilter === 'SHOCK_ROOM' && a.regimen_ubicacion !== 'SHOCK_ROOM' && a.regimen_ubicacion !== 'MIXTO_SR_PISO') return false;
            if (ubicacionFilter === 'PISO' && a.regimen_ubicacion !== 'PISO_CLINICO' && a.regimen_ubicacion !== 'CRITICOS_UCI' && a.regimen_ubicacion !== 'MIXTO_SR_PISO') return false;
            if (ubicacionFilter === 'SIN_HABITACION' && a.habitacion_salus) return false;
            if (ubicacionFilter === 'EXCLUIDAS' && a.incluida_en_presupuesto) return false;

            const proc = String(a.proceso_salus || '');
            if (procesoFilter === '400109' && !proc.includes('400109')) return false;
            if (procesoFilter === '420301' && !proc.includes('420301')) return false;
            if (procesoFilter === 'SIN_PROCESO' && proc.trim() !== '') return false;

            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const match =
                    String(a.paciente || '').toLowerCase().includes(q) ||
                    String(a.numero_admision || '').toLowerCase().includes(q) ||
                    String(a.nhc || '').toLowerCase().includes(q) ||
                    String(a.dni || '').toLowerCase().includes(q) ||
                    String(a.habitacion_salus || '').toLowerCase().includes(q) ||
                    String(a.obra_social || '').toLowerCase().includes(q) ||
                    String(a.servicio_salus || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }, [periodAdmisiones, serieFilter, ubicacionFilter, procesoFilter, searchQuery]);

    // Resumen numérico directo sobre las filas filtradas y sobre el período
    const totals = useMemo(() => {
        const countSerieI = periodAdmisiones.filter(isSerieI).length;
        const countSerieSR = periodAdmisiones.filter(isSerieSR).length;
        const countOtras = periodAdmisiones.length - countSerieI - countSerieSR;

        let sumHoras = 0;
        let sumDiasDireccion = 0;
        let sumDiasProporcionales = 0;
        let sumHorasSR = 0;
        let sumHorasPiso = 0;

        for (const r of filteredRows) {
            if (!r.incluida_en_presupuesto) continue;
            const h = Number(r.horas_presupuesto_total || 0);
            sumHoras += h;
            sumDiasDireccion += calcDiasFormulaDireccion(r.horas_brutas_salus);
            sumDiasProporcionales += Number(r.dias_proporcionales_total || 0);
            sumHorasSR += Number(r.horas_shock_room || 0);
            sumHorasPiso += Number(r.horas_piso || 0);
        }

        const srRows = periodOcupacion.filter(o => o.tipo_unidad === 'SHOCK_ROOM_BOX');
        const horasNetasBoxesSr = srRows.reduce((s, o) => s + Number(o.horas_netas_ocupadas || 0), 0);
        const diasPropBoxesSr = horasNetasBoxesSr / 24;
        const diasDispBoxesSr = boxesConfig * effectiveDateRange.diasCalendario;
        const pctOcupBoxesSr = diasDispBoxesSr > 0 ? (diasPropBoxesSr / diasDispBoxesSr) * 100 : 0;

        const sinHabCount = periodAdmisiones.filter(a => !a.habitacion_salus).length;
        const excluidasCount = periodAdmisiones.filter(a => !a.incluida_en_presupuesto).length;

        const boxSummary = ['BOX 1-SR', 'BOX 2-SR', 'BOX 3-SR'].map(boxName => {
            const bRows = srRows.filter(r => r.unidad === boxName);
            const hNet = bRows.reduce((s, r) => s + Number(r.horas_netas_ocupadas || 0), 0);
            const dProp = hNet / 24;
            const pacs = bRows.reduce((s, r) => s + Number(r.pacientes_distintos || 0), 0);
            return {
                unidad: boxName,
                horasNetas: Math.round(hNet * 100) / 100,
                diasProporcionales: Math.round(dProp * 100) / 100,
                diasDisponibles: effectiveDateRange.diasCalendario,
                pctOcupacion: Math.round((dProp / effectiveDateRange.diasCalendario) * 1000) / 10,
                pacientes: pacs
            };
        });

        return {
            totalPeriodo: periodAdmisiones.length,
            countSerieI,
            countSerieSR,
            countOtras,
            filteredCount: filteredRows.length,
            sumHoras: Math.round(sumHoras * 100) / 100,
            sumHorasSR: Math.round(sumHorasSR * 100) / 100,
            sumHorasPiso: Math.round(sumHorasPiso * 100) / 100,
            sumDiasDireccion: Math.round(sumDiasDireccion * 100) / 100,
            sumDiasProporcionales: Math.round(sumDiasProporcionales * 100) / 100,
            diferenciaDias: Math.round((sumDiasDireccion - sumDiasProporcionales) * 100) / 100,
            horasNetasBoxesSr: Math.round(horasNetasBoxesSr * 100) / 100,
            diasPropBoxesSr: Math.round(diasPropBoxesSr * 100) / 100,
            diasDispBoxesSr,
            pctOcupBoxesSr: Math.round(pctOcupBoxesSr * 100) / 100,
            sinHabCount,
            excluidasCount,
            boxSummary
        };
    }, [periodAdmisiones, filteredRows, periodOcupacion, effectiveDateRange, boxesConfig]);

    // Días con mayor rotación para la pestaña de Boxes 24h
    const highRotationDays = useMemo(() => {
        const byDay = new Map();
        for (const r of periodOcupacion) {
            if (r.tipo_unidad !== 'SHOCK_ROOM_BOX') continue;
            const prev = byDay.get(r.fecha) || { fecha: r.fecha, pacs: 0, diasProp: 0 };
            prev.pacs += Number(r.pacientes_distintos || 0);
            prev.diasProp += Number(r.dias_proporcionales || 0);
            byDay.set(r.fecha, prev);
        }
        return Array.from(byDay.values()).sort((a, b) => b.pacs - a.pacs || b.fecha.localeCompare(a.fecha));
    }, [periodOcupacion]);

    useEffect(() => {
        if (highRotationDays.length && !highRotationDays.some(d => d.fecha === selectedInspectDate)) {
            setSelectedInspectDate(highRotationDays[0].fecha);
        }
    }, [highRotationDays]);

    const inspectDayBoxes = useMemo(() => {
        if (!selectedInspectDate) return [];
        const dayRows = periodOcupacion.filter(o => o.fecha === selectedInspectDate && o.tipo_unidad === 'SHOCK_ROOM_BOX');
        return ['BOX 1-SR', 'BOX 2-SR', 'BOX 3-SR'].map(boxName => {
            const found = dayRows.find(r => r.unidad === boxName);
            const hNet = Number(found?.horas_netas_ocupadas || 0);
            return {
                unidad: boxName,
                horasNetas: Math.round(hNet * 100) / 100,
                diasProporcionales: Math.round((hNet / 24) * 1000) / 1000,
                pctOcupacion: Math.round((hNet / 24) * 1000) / 10,
                pacientesCount: Number(found?.pacientes_distintos || 0),
                tramos: Array.isArray(found?.detalle_tramos_dia) ? found.detalle_tramos_dia : []
            };
        });
    }, [periodOcupacion, selectedInspectDate]);

    // Exportar Excel IDÉNTICO a las columnas de Dirección + Columnas de Conciliación y Proporción Real
    const handleExportExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            // Hoja 1: TODAS LAS ADMISIONES (Mismo formato que Dirección + Columnas Auditadas)
            const headers = [
                'Fecha Ingreso',
                'Mes/Año',
                'N. Admisión',
                'Serie Admisión',
                '¿Estaba en Excel Dirección?',
                'Documento',
                'Paciente',
                'Cliente',
                'Días (SALUS)',
                'Procesos',
                'Servicio',
                'Doctor',
                'NHC',
                'Edad',
                'Habitación (Cabecera SALUS)',
                'Recorrido Real de Camas (Historial)',
                'Fecha Alta',
                'Motivo Alta',
                'Horas de Internación (SALUS)',
                'Días s/Fórmula Dirección (Mín 1)',
                'Días Proporcionales Reales (Horas ÷ 24)',
                'Horas en Shock Room',
                'Días Prop. Shock Room (Hs SR ÷ 24)',
                'Horas en Piso Clínico',
                'Días Prop. Piso (Hs Piso ÷ 24)',
                'Incluida en Presupuesto',
                'Diagnóstico de Auditoría'
            ];

            const rowsToExport = filteredRows.map(a => {
                const enDireccion = isSerieI(a) ? 'SÍ (Serie I)' : 'NO — OMITIDA POR DIRECCIÓN (Serie SR/Otra)';
                const diasDir = a.incluida_en_presupuesto ? calcDiasFormulaDireccion(a.horas_brutas_salus) : 0;
                return [
                    formatSqlDateTime(a.fecha_ingreso),
                    `${a.periodo}-01`,
                    a.numero_admision || '',
                    a.serie_admision || (isSerieSR(a) ? 'SHOCK ROOM' : 'INTERNADO'),
                    enDireccion,
                    a.dni || '',
                    a.paciente || '',
                    a.obra_social || '',
                    a.dias_salus ?? '',
                    a.proceso_salus || '',
                    a.servicio_salus || '',
                    a.doctor_cabecera || 'GARCIA, PAOLA GUADALUPE',
                    a.nhc || '',
                    a.edad_salus !== null && a.edad_salus !== undefined ? `${a.edad_salus}a` : '',
                    a.habitacion_salus || 'SIN HABITACIÓN',
                    formatRecorridoCamas(a.tramos_json),
                    a.fecha_alta ? formatSqlDateTime(a.fecha_alta) : 'SIN ALTA (ABIERTA)',
                    a.motivo_alta || '',
                    Number(a.horas_brutas_salus || 0),
                    diasDir,
                    Number(a.dias_proporcionales_total || 0),
                    Number(a.horas_shock_room || 0),
                    Number(a.dias_proporcionales_sr || 0),
                    Number(a.horas_piso || 0),
                    Number(a.dias_proporcionales_piso || 0),
                    a.incluida_en_presupuesto ? 'SI' : 'NO (EXCLUIDA)',
                    a.inconsistencia_detalle || 'OK — Consistente'
                ];
            });

            const wsAdm = XLSX.utils.aoa_to_sheet([headers, ...rowsToExport]);
            wsAdm['!cols'] = [
                { wch: 20 }, { wch: 12 }, { wch: 13 }, { wch: 15 }, { wch: 34 },
                { wch: 13 }, { wch: 30 }, { wch: 28 }, { wch: 12 }, { wch: 44 },
                { wch: 20 }, { wch: 26 }, { wch: 10 }, { wch: 8 }, { wch: 22 },
                { wch: 36 }, { wch: 20 }, { wch: 20 }, { wch: 22 }, { wch: 26 },
                { wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 18 }, { wch: 22 },
                { wch: 20 }, { wch: 60 }
            ];
            XLSX.utils.book_append_sheet(wb, wsAdm, '1_Todas_Las_Admisiones');

            // Hoja 2: Resumen Ejecutivo y Explicación de Diferencias con Dirección
            const resumenAoA = [
                ['CONCILIACIÓN DE ADMISIONES GUARDIA CLÍNICA (DRA. PAOLA GARCÍA) — SALUS vs. EXCEL DIRECCIÓN'],
                ['Período Exportado:', effectiveDateRange.label],
                ['Días Calendario del Período:', effectiveDateRange.diasCalendario],
                [],
                ['1. ¿QUÉ ADMISIONES FALTABAN EN EL EXCEL DE DIRECCIÓN?', 'CANTIDAD', 'EXPLICACIÓN'],
                ['Total Admisiones Reales en SALUS (en el período)', totals.totalPeriodo, '100% de las admisiones no anuladas con Doctor = GARCIA, PAOLA GUADALUPE'],
                ['Admisiones Serie I (I0...) — Las únicas que veía Dirección', totals.countSerieI, 'Dirección tenía filtrado únicamente el talonario/serie I (Internado)'],
                ['Admisiones Serie SR (SR00...) — OMITIDAS en Excel Dirección', totals.countSerieSR, 'Pacientes reales atendidos en Shock Room (módulo 400109/420301) ingresados con serie SR'],
                ['Otras Series (UCI / TI / Otros)', totals.countOtras, ' Casos puntuales de otras series'],
                [],
                ['2. COMPARATIVA DE DÍAS DE OCUPACIÓN (FILAS FILTRADAS)', 'VALOR', 'CRITERIO'],
                ['Suma de Horas Reales (Válidas)', totals.sumHoras, `${totals.sumHorasSR} hs en Boxes SR + ${totals.sumHorasPiso} hs en Camas de Piso`],
                ['Días según Fórmula Excel Dirección (Mínimo 1 día si < 24h)', totals.sumDiasDireccion, 'Infla cada estancia breve de 2 o 3 hs en Shock Room como 1,00 día entero'],
                ['Días Proporcionales Reales (Horas ÷ 24)', totals.sumDiasProporcionales, '12 hs usadas de 24 hs = 0,50 días sin importar cuántos pacientes rotaron'],
                ['Días Inflados Depurados', totals.diferenciaDias, 'Diferencia entre fórmula con piso mínimo 1 día vs. proporción exacta Hs/24'],
                [],
                ['3. OCUPACIÓN FÍSICA NETA DE LOS 3 BOXES DE SHOCK ROOM', 'HORAS NETAS', 'DÍAS PROP. (Hs/24)', 'DÍAS DISPONIBLES', '% OCUPACIÓN REAL', 'PACIENTES'],
                ...totals.boxSummary.map(b => [
                    b.unidad,
                    b.horasNetas,
                    b.diasProporcionales,
                    b.diasDisponibles,
                    `${b.pctOcupacion}%`,
                    b.pacientes
                ]),
                ['TOTAL 3 BOXES SHOCK ROOM', totals.horasNetasBoxesSr, totals.diasPropBoxesSr, totals.diasDispBoxesSr, `${totals.pctOcupBoxesSr}%`, '']
            ];
            const wsRes = XLSX.utils.aoa_to_sheet(resumenAoA);
            wsRes['!cols'] = [{ wch: 56 }, { wch: 18 }, { wch: 62 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
            XLSX.utils.book_append_sheet(wb, wsRes, '2_Conciliacion_Direccion');

            // Hoja 3: Ocupación Diaria por Box
            const ocupHeaders = [
                'Fecha', 'Unidad / Box', 'Pacientes en el Día', 'Horas Netas Ocupadas (Máx 24h)',
                'Días Proporcionales Reales (Horas ÷ 24)', '% Ocupación del Box en el Día'
            ];
            const ocupRows = periodOcupacion
                .filter(o => o.tipo_unidad === 'SHOCK_ROOM_BOX')
                .map(o => [
                    o.fecha,
                    o.unidad,
                    o.pacientes_distintos,
                    Number(o.horas_netas_ocupadas || 0),
                    Number(o.dias_proporcionales || 0),
                    `${Number(o.porcentaje_ocupacion || 0)}%`
                ]);
            const wsOcup = XLSX.utils.aoa_to_sheet([ocupHeaders, ...ocupRows]);
            wsOcup['!cols'] = [{ wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 28 }, { wch: 32 }, { wch: 26 }];
            XLSX.utils.book_append_sheet(wb, wsOcup, '3_Ocupacion_Diaria_Boxes');

            const tag = `${effectiveDateRange.desde}_a_${effectiveDateRange.hasta}`;
            XLSX.writeFile(wb, `Admisiones_Guardia_Paola_Garcia_${tag}.xlsx`);
            addToast?.(`Excel descargado con ${rowsToExport.length} admisiones`, 'success');
        } catch (err) {
            console.error('Error exportando Excel:', err);
            addToast?.('Error al generar el archivo Excel', 'error');
        }
    };

    if (loading) {
        return (
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '48px 24px',
                textAlign: 'center'
            }}>
                <RefreshCw size={28} className="animate-spin" style={{ color: '#1E40AF', margin: '0 auto 12px auto' }} />
                <div style={{ fontWeight: 700, color: '#0F172A' }}>
                    Cargando padrón completo de admisiones de Dra. Paola García...
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* ─── BARRA SUPERIOR: PERÍODOS RÁPIDOS + DESCARGA EXCEL DIRECTA ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #CBD5E1',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.05)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                            Planilla Maestra de Admisiones — Guardia Clínica (Cabecera: Dra. Paola García)
                        </h3>
                        <p style={{ margin: '3px 0 0 0', fontSize: '0.8rem', color: '#475569' }}>
                            Período visualizado: <strong style={{ color: '#1E40AF' }}>{effectiveDateRange.label}</strong> · Incluye tanto talonario <strong>Serie I</strong> (el que veía Dirección) como <strong>Serie SR</strong> (Shock Room).
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={handleSyncFromSalus}
                            disabled={syncing}
                            style={{
                                padding: '9px 13px',
                                borderRadius: '8px',
                                border: '1px solid #BFDBFE',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                fontWeight: 700,
                                fontSize: '0.8rem',
                                cursor: syncing ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                            {syncing ? 'Sincronizando...' : 'Sincronizar SALUS'}
                        </button>

                        <button
                            type="button"
                            onClick={handleExportExcel}
                            style={{
                                padding: '9px 18px',
                                borderRadius: '8px',
                                border: '1px solid #047857',
                                background: '#059669',
                                color: '#FFFFFF',
                                fontWeight: 800,
                                fontSize: '0.85rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '8px',
                                boxShadow: '0 2px 4px rgba(5, 150, 105, 0.25)'
                            }}
                        >
                            <FileSpreadsheet size={17} />
                            Descargar Excel Completo ({filteredRows.length} admisiones)
                        </button>
                    </div>
                </div>

                {/* Botones rápidos de corte temporal + pestañas simples */}
                <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '10px',
                    borderTop: '1px solid #F1F5F9',
                    paddingTop: '12px'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155' }}>Corte de Fechas:</span>
                        {[
                            { id: 'telar', label: 'Filtro Superior del Tablero' },
                            { id: 'corte_direccion', label: '🔍 Corte Excel Dirección (Nov 2025 – Jun 2026)' },
                            { id: 'anio_2026', label: 'Año 2026 Completo' },
                            { id: 'todo_2025_2026', label: 'Todo 2025–2026' }
                        ].map(btn => (
                            <button
                                key={btn.id}
                                type="button"
                                onClick={() => setRangeMode(btn.id)}
                                style={{
                                    padding: '6px 11px',
                                    borderRadius: '6px',
                                    border: rangeMode === btn.id ? '1px solid #1E40AF' : '1px solid #CBD5E1',
                                    background: rangeMode === btn.id ? '#1E40AF' : '#F8FAFC',
                                    color: rangeMode === btn.id ? '#FFFFFF' : '#334155',
                                    fontWeight: 700,
                                    fontSize: '0.76rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {btn.label}
                            </button>
                        ))}
                    </div>

                    <div style={{ display: 'flex', background: '#F1F5F9', padding: '3px', borderRadius: '8px', gap: '4px' }}>
                        {[
                            { id: 'planilla_excel', label: `📋 Planilla de Todas las Admisiones (${filteredRows.length})` },
                            { id: 'ocupacion_boxes', label: `📊 Ocupación por Box 24h (${totals.pctOcupBoxesSr}%)` },
                            { id: 'auditoria', label: `⚠️ Sin Habitación / Excluidas (${totals.sinHabCount + totals.excluidasCount})` }
                        ].map(t => (
                            <button
                                key={t.id}
                                type="button"
                                onClick={() => setViewTab(t.id)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: 'none',
                                    background: viewTab === t.id ? '#FFFFFF' : 'transparent',
                                    color: viewTab === t.id ? '#1E40AF' : '#475569',
                                    fontWeight: viewTab === t.id ? 800 : 600,
                                    fontSize: '0.77rem',
                                    cursor: 'pointer',
                                    boxShadow: viewTab === t.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                                }}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ─── 4 TARJETAS CLARAS DE CONCILIACIÓN CONTRA EL EXCEL DE DIRECCIÓN ─── */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: '12px'
            }}>
                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #BFDBFE', borderLeft: '4px solid #1E40AF', padding: '12px 15px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
                        Total Admisiones Reales (SALUS)
                    </div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0F172A', marginTop: '3px' }}>
                        {totals.totalPeriodo.toLocaleString('es-AR')}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: '3px' }}>
                        Serie I (Dirección): <strong>{totals.countSerieI}</strong> · Serie SR (Omitidas): <strong style={{ color: '#DC2626' }}>{totals.countSerieSR}</strong>
                    </div>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', borderLeft: '4px solid #0284C7', padding: '12px 15px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                        Horas de Internación (Selección)
                    </div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#0F172A', marginTop: '3px' }}>
                        {totals.sumHoras.toLocaleString('es-AR')} hs
                    </div>
                    <div style={{ fontSize: '0.74rem', color: '#475569', marginTop: '3px' }}>
                        Shock Room: <strong>{totals.sumHorasSR.toLocaleString('es-AR')} hs</strong> · Piso: <strong>{totals.sumHorasPiso.toLocaleString('es-AR')} hs</strong>
                    </div>
                </div>

                <div style={{ background: '#EFF6FF', borderRadius: '10px', border: '1px solid #93C5FD', borderLeft: '4px solid #1D4ED8', padding: '12px 15px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
                        Días Proporcionales Reales (Horas ÷ 24)
                    </div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#1E40AF', marginTop: '3px' }}>
                        {totals.sumDiasProporcionales.toLocaleString('es-AR')} días
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#1E3A8A', marginTop: '3px' }}>
                        Fórmula Dirección (mín. 1d): <strong>{totals.sumDiasDireccion.toLocaleString('es-AR')} d</strong> (−{totals.diferenciaDias.toLocaleString('es-AR')} d inflados)
                    </div>
                </div>

                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', borderLeft: '4px solid #059669', padding: '12px 15px' }}>
                    <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>
                        Ocupación Neta 3 Boxes SR (24 hs/día)
                    </div>
                    <div style={{ fontSize: '1.55rem', fontWeight: 900, color: '#047857', marginTop: '3px' }}>
                        {totals.pctOcupBoxesSr}%
                        <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#475569', marginLeft: '6px' }}>
                            ({totals.diasPropBoxesSr} / {totals.diasDispBoxesSr} días)
                        </span>
                    </div>
                    <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '3px' }}>
                        {totals.horasNetasBoxesSr.toLocaleString('es-AR')} hs netas sobre {totals.diasDispBoxesSr * 24} hs disponibles
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════════
                VISTA 1 (PRINCIPAL): PLANILLA MAESTRA ESTILO EXCEL DE TODAS LAS ADMISIONES
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'planilla_excel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {/* Barra de filtros de columnas de la planilla */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '12px 16px',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <select
                                value={serieFilter}
                                onChange={(e) => setSerieFilter(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700, background: '#F8FAFC', color: '#0F172A' }}
                            >
                                <option value="TODAS">Todas las Series ({totals.totalPeriodo})</option>
                                <option value="SOLO_I_DIRECCION">Solo Serie I — Las que están en Excel Dirección ({totals.countSerieI})</option>
                                <option value="SOLO_SR_OMITIDAS">Solo Serie SR — Shock Room omitidas por Dirección ({totals.countSerieSR})</option>
                            </select>

                            <select
                                value={ubicacionFilter}
                                onChange={(e) => setUbicacionFilter(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700, background: '#F8FAFC', color: '#0F172A' }}
                            >
                                <option value="TODAS">Todas las Habitaciones</option>
                                <option value="SHOCK_ROOM">Con paso por BOX 1/2/3-SR</option>
                                <option value="PISO">Camas de Piso / UCI</option>
                                <option value="SIN_HABITACION">Sin Habitación en SALUS ({totals.sinHabCount})</option>
                                <option value="EXCLUIDAS">Excluidas por Auditoría ({totals.excluidasCount})</option>
                            </select>

                            <select
                                value={procesoFilter}
                                onChange={(e) => setProcesoFilter(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem', fontWeight: 700, background: '#F8FAFC', color: '#0F172A' }}
                            >
                                <option value="TODOS">Todos los Procesos / Códigos</option>
                                <option value="400109">400109 - Internación Breve UCE</option>
                                <option value="420301">420301 - Atención Médica por Día</option>
                                <option value="SIN_PROCESO">Sin Proceso Cargado</option>
                            </select>
                        </div>

                        <div style={{ position: 'relative', width: '290px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar N° admisión (ej. I050089, SR000318), paciente, DNI..."
                                style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                            />
                        </div>
                    </div>

                    {/* Grilla estilo Excel con las mismas columnas de Dirección + Días Proporcionales */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #CBD5E1',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '620px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.76rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F1F5F9', borderBottom: '2px solid #CBD5E1', zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Fecha Ingreso</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>N. Admisión</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>¿En Excel Dir.?</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Documento</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Paciente</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Cliente (Obra Social)</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Procesos</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Servicio</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>NHC</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Habitación & Recorrido</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Fecha Alta</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', textAlign: 'right', color: '#334155' }}>Horas</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', textAlign: 'right', color: '#991B1B', background: '#FEF2F2' }}>Días s/Dir. (Mín 1)</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', textAlign: 'right', color: '#1E40AF', background: '#EFF6FF' }}>Días Prop. (Hs÷24)</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Auditoría</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.length === 0 ? (
                                        <tr>
                                            <td colSpan="15" style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                                                No hay admisiones para los filtros seleccionados.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRows.slice(0, 500).map((a, idx) => {
                                            const enDir = isSerieI(a);
                                            const diasDir = a.incluida_en_presupuesto ? calcDiasFormulaDireccion(a.horas_brutas_salus) : 0;
                                            const meta = INCONSISTENCIA_META[a.inconsistencia_codigo] || INCONSISTENCIA_META.OK;
                                            return (
                                                <tr
                                                    key={a.id_admision}
                                                    onClick={() => setSelectedAdmDetail(a)}
                                                    style={{
                                                        borderBottom: '1px solid #E2E8F0',
                                                        background: !a.incluida_en_presupuesto
                                                            ? '#FFF1F2'
                                                            : idx % 2 === 0
                                                                ? '#FFFFFF'
                                                                : '#F8FAFC',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                                                        {formatDateTimeShort(a.fecha_ingreso)}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: 800, color: enDir ? '#0F172A' : '#1E40AF' }}>
                                                        {a.numero_admision}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            padding: '2px 7px',
                                                            borderRadius: '5px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 800,
                                                            background: enDir ? '#E2E8F0' : '#FEF3C7',
                                                            color: enDir ? '#334155' : '#92400E'
                                                        }}>
                                                            {enDir ? 'Sí (Serie I)' : 'Omitida (SR)'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#475569' }}>
                                                        {a.dni || '-'}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap' }}>
                                                        {a.paciente}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', maxWidth: '170px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }} title={a.obra_social}>
                                                        {a.obra_social}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#475569' }} title={a.proceso_salus || ''}>
                                                        {a.proceso_salus ? a.proceso_salus.slice(0, 26) : <span style={{ color: '#94A3B8' }}>(Sin código)</span>}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#334155' }}>
                                                        {a.servicio_salus}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', color: '#475569' }}>
                                                        {a.nhc || '-'}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                                        <strong style={{ color: a.habitacion_salus ? '#1E40AF' : '#DC2626' }}>
                                                            {a.habitacion_salus || 'SIN HABITACIÓN'}
                                                        </strong>
                                                        {Array.isArray(a.tramos_json) && a.tramos_json.length > 1 && (
                                                            <div style={{ fontSize: '0.66rem', color: '#64748B' }}>
                                                                {formatRecorridoCamas(a.tramos_json)}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontFamily: 'monospace', fontSize: '0.73rem', color: a.fecha_alta ? '#334155' : '#DC2626' }}>
                                                        {formatDateTimeShort(a.fecha_alta)}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#0F172A' }}>
                                                        {Number(a.horas_brutas_salus || 0).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 700, color: '#991B1B', background: 'rgba(254, 226, 226, 0.35)' }}>
                                                        {diasDir}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: 900, color: '#1E40AF', background: 'rgba(219, 234, 254, 0.45)' }}>
                                                        {Number(a.dias_proporcionales_total || 0).toFixed(2)}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            padding: '2px 7px',
                                                            borderRadius: '5px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 700,
                                                            background: meta.badgeBg,
                                                            color: meta.badgeColor,
                                                            border: `1px solid ${meta.border}`
                                                        }}>
                                                            {meta.label}
                                                        </span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filteredRows.length > 500 && (
                            <div style={{ padding: '8px 14px', background: '#F8FAFC', borderTop: '1px solid #E2E8F0', fontSize: '0.75rem', color: '#475569', textAlign: 'center' }}>
                                Mostrando primeras 500 filas en pantalla para fluidez visual. Al hacer clic en <strong>"Descargar Excel Completo ({filteredRows.length} admisiones)"</strong> se exportan el 100% de las filas.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
                VISTA 2: OCUPACIÓN DIARIA POR BOX DE SHOCK ROOM (24 HS = 1 DÍA)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'ocupacion_boxes' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '16px 20px' }}>
                        <h4 style={{ margin: '0 0 10px 0', fontSize: '0.95rem', fontWeight: 800, color: '#0F172A' }}>
                            Ocupación Proporcional por Box Físico en el Período ({effectiveDateRange.diasCalendario} días calendario)
                        </h4>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                                    <th style={{ padding: '9px 12px' }}>Box Físico</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Horas Ocupadas Netas</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Horas Disponibles (24h/día)</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right', color: '#1E40AF' }}>Días Proporcionales (Horas ÷ 24)</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>% Ocupación Real</th>
                                    <th style={{ padding: '9px 12px', textAlign: 'right' }}>Pacientes Atendidos</th>
                                </tr>
                            </thead>
                            <tbody>
                                {totals.boxSummary.map(b => (
                                    <tr key={b.unidad} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                        <td style={{ padding: '10px 12px', fontWeight: 800 }}>⚡ {b.unidad}</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 700 }}>{b.horasNetas.toLocaleString('es-AR')} hs</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', color: '#64748B' }}>{(b.diasDisponibles * 24).toLocaleString('es-AR')} hs</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 900, color: '#1E40AF' }}>
                                            {b.diasProporcionales.toLocaleString('es-AR')} / {b.diasDisponibles} días
                                        </td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right', fontWeight: 800, color: '#047857' }}>{b.pctOcupacion}%</td>
                                        <td style={{ padding: '10px 12px', textAlign: 'right' }}>{b.pacientes}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Verificador visual de 24 hs de un día puntual */}
                    <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #BFDBFE', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: '#0F172A' }}>
                                    Detalle Horario de un Día Puntual (00:00 a 24:00 hs)
                                </h4>
                                <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                                    Verificá cómo las horas de varios pacientes en el mismo día se suman y dividen por 24 sin superar jamás 1,00 día por box.
                                </span>
                            </div>
                            <input
                                type="date"
                                value={selectedInspectDate}
                                min={effectiveDateRange.desde}
                                max={effectiveDateRange.hasta}
                                onChange={(e) => setSelectedInspectDate(e.target.value)}
                                style={{ padding: '6px 10px', borderRadius: '6px', border: '1px solid #93C5FD', fontWeight: 800, fontSize: '0.8rem' }}
                            />
                        </div>

                        {inspectDayBoxes.map(box => (
                            <div key={box.unidad} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px', fontSize: '0.78rem' }}>
                                    <strong>{box.unidad} · {box.pacientesCount} pac.</strong>
                                    <strong style={{ color: '#1E40AF' }}>{box.horasNetas} hs ÷ 24 = {box.diasProporcionales} días ({box.pctOcupacion}%)</strong>
                                </div>
                                <div style={{ position: 'relative', height: '24px', background: '#E2E8F0', borderRadius: '5px', overflow: 'hidden' }}>
                                    {box.tramos.map((t, idx) => {
                                        const leftPct = Math.max(0, Math.min(100, (t.min_inicio / 1440) * 100));
                                        const widthPct = Math.max(1.2, Math.min(100 - leftPct, ((t.min_fin - t.min_inicio) / 1440) * 100));
                                        return (
                                            <div
                                                key={`${t.id_admision}-${idx}`}
                                                title={`${t.paciente} (${t.numero_admision}) · ${t.inicio_hm}–${t.fin_hm} (${t.horas} hs)`}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${leftPct}%`,
                                                    width: `${widthPct}%`,
                                                    top: '2px',
                                                    bottom: '2px',
                                                    background: BOX_COLORS[idx % BOX_COLORS.length],
                                                    borderRadius: '3px'
                                                }}
                                            />
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
                VISTA 3: AUDITORÍA DE SIN HABITACIÓN Y EXCLUIDAS
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'auditoria' && (
                <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px 20px' }}>
                    <h4 style={{ margin: '0 0 8px 0', fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                        Casos sin Habitación en SALUS o Excluidos por Inconsistencia Administrativa
                    </h4>
                    <p style={{ margin: '0 0 14px 0', fontSize: '0.78rem', color: '#475569' }}>
                        Nota clave: Los 4 casos que figuraban con habitación vacía en el Excel de Dirección (<code>I048472</code>, <code>I048891</code>, <code>I050089</code> e <code>I050935</code>) <strong>sí tuvieron habitación real</strong> en SALUS (Enfermería liberó la cama minutos antes del alta administrativa). Abajo se listan las admisiones que realmente nunca tuvieron habitación asignada o quedaron abiertas/suspendidas en SALUS:
                    </p>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
                            <thead>
                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0' }}>
                                    <th style={{ padding: '8px 10px' }}>N. Admisión</th>
                                    <th style={{ padding: '8px 10px' }}>Ingreso → Alta</th>
                                    <th style={{ padding: '8px 10px' }}>Paciente</th>
                                    <th style={{ padding: '8px 10px' }}>Habitación SALUS</th>
                                    <th style={{ padding: '8px 10px' }}>Horas SALUS</th>
                                    <th style={{ padding: '8px 10px' }}>Motivo Exacto</th>
                                </tr>
                            </thead>
                            <tbody>
                                {periodAdmisiones
                                    .filter(a => !a.habitacion_salus || !a.incluida_en_presupuesto)
                                    .map(a => (
                                        <tr key={a.id_admision} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '8px 10px', fontWeight: 800, color: '#1E40AF' }}>{a.numero_admision}</td>
                                            <td style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                                                {formatDateTimeShort(a.fecha_ingreso)} → {formatDateTimeShort(a.fecha_alta)}
                                            </td>
                                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{a.paciente} (NHC {a.nhc})</td>
                                            <td style={{ padding: '8px 10px', color: '#DC2626', fontWeight: 800 }}>{a.habitacion_salus || 'SIN HABITACIÓN'}</td>
                                            <td style={{ padding: '8px 10px', fontWeight: 700 }}>{a.horas_brutas_salus} hs</td>
                                            <td style={{ padding: '8px 10px', color: '#334155' }}>{a.inconsistencia_detalle}</td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Modal de detalle de tramos al hacer clic en una fila */}
            {selectedAdmDetail && (
                <div
                    onClick={() => setSelectedAdmDetail(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.55)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 9999,
                        padding: '16px'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            width: '100%',
                            maxWidth: '640px',
                            padding: '20px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}
                    >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800 }}>
                                {selectedAdmDetail.numero_admision} — {selectedAdmDetail.paciente}
                            </h3>
                            <button type="button" onClick={() => setSelectedAdmDetail(null)} style={{ border: '1px solid #CBD5E1', background: '#FFF', borderRadius: '6px', padding: '4px 8px', cursor: 'pointer' }}>
                                ✕
                            </button>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#334155' }}>
                            <strong>Ingreso:</strong> {formatDateTimeShort(selectedAdmDetail.fecha_ingreso)} · <strong>Alta:</strong> {formatDateTimeShort(selectedAdmDetail.fecha_alta)}
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: 700 }}>
                            Horas Totales: {selectedAdmDetail.horas_brutas_salus} hs → Días Proporcionales Reales: {selectedAdmDetail.dias_proporcionales_total} días (vs. {calcDiasFormulaDireccion(selectedAdmDetail.horas_brutas_salus)} días en fórmula Dirección)
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <strong style={{ fontSize: '0.78rem' }}>Recorrido Físico en Historial de Camas SALUS:</strong>
                            {(selectedAdmDetail.tramos_json || []).map((t, i) => (
                                <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '7px 10px', fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between' }}>
                                    <span><strong>{t.unidad}</strong> · {formatDateTimeShort(t.inicio)} → {formatDateTimeShort(t.fin)}</span>
                                    <strong>{t.horas} hs ({Number(t.dias_prop || 0).toFixed(2)} d)</strong>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
