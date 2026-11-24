import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, RefreshCw, FileSpreadsheet, User, Calendar, Clock, Bed, HeartPulse, Stethoscope, Activity, ShieldAlert, FileText, Check, Copy, X, Pill, AlertTriangle, ArrowRight
} from 'lucide-react';
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

function cleanAuditDetail(text) {
    if (!text) return 'OK — Consistente';
    return String(text)
        .replace(/para evitar inflar el presupuesto/gi, 'para evitar distorsión horaria')
        .replace(/presupuesto/gi, 'cálculo de ocupación');
}

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
    fechaHasta
}) {
    const [viewTab, setViewTab] = useState('planilla_excel'); // 'planilla_excel' | 'ocupacion_boxes' | 'auditoria'
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [admisiones, setAdmisiones] = useState([]);
    const [ocupacionDiaria, setOcupacionDiaria] = useState([]);
    const [boxesConfig, setBoxesConfig] = useState(3);

    const [rangeMode, setRangeMode] = useState('telar'); // 'telar' | 'anio_2026' | 'todo_2025_2026'

    const [serieFilter, setSerieFilter] = useState('TODAS'); // 'TODAS' | 'SOLO_I' | 'SOLO_SR'
    const [ubicacionFilter, setUbicacionFilter] = useState('TODAS'); // 'TODAS' | 'SHOCK_ROOM' | 'PISO' | 'SIN_HABITACION' | 'EXCLUIDAS'
    const [procesoFilter, setProcesoFilter] = useState('TODOS'); // 'TODOS' | '400109' | '420301' | 'SIN_PROCESO'
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAdmDetail, setSelectedAdmDetail] = useState(null);
    const [selectedInspectDate, setSelectedInspectDate] = useState('');
    const [fichas557, setFichas557] = useState([]);
    const [modalTab, setModalTab] = useState('general'); // 'general' | 'clinica' | 'camas'
    const [copiedModal, setCopiedModal] = useState(false);

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
            const [admRows, ocupRows, cfgRes, cache557Res] = await Promise.all([
                fetchAllRows('gob_guardia_admisiones_paola', 'fecha_ingreso'),
                fetchAllRows('gob_guardia_ocupacion_diaria_box', 'fecha'),
                supabase
                    .from('gob_internacion_camas_config')
                    .select('*')
                    .eq('sector', 'SHOCK ROOM')
                    .eq('anio', 2026)
                    .maybeSingle(),
                supabase
                    .from('app_config')
                    .select('value')
                    .eq('key', 'guardia_internado_cache')
                    .maybeSingle()
            ]);

            setAdmisiones(admRows || []);
            setOcupacionDiaria(ocupRows || []);
            if (cfgRes.data?.camas_operativas) {
                setBoxesConfig(Number(cfgRes.data.camas_operativas) || 3);
            }
            if (cache557Res?.data?.value) {
                const clinicas = (typeof cache557Res.data.value === 'string' ? JSON.parse(cache557Res.data.value) : cache557Res.data.value)?.admisiones_clinicas || [];
                setFichas557(clinicas);
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

    const effectiveDateRange = useMemo(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const maxDataDate = ocupacionDiaria.length > 0 ? ocupacionDiaria[0].fecha : todayStr;
        const capEnd = maxDataDate < todayStr ? todayStr : maxDataDate;

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
    }, [rangeMode, fechaDesde, fechaHasta, selectedPeriodoProp, ocupacionDiaria]);

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

    const filteredRows = useMemo(() => {
        return periodAdmisiones.filter(a => {
            if (serieFilter === 'SOLO_I' && !isSerieI(a)) return false;
            if (serieFilter === 'SOLO_SR' && !isSerieSR(a)) return false;

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

    const totals = useMemo(() => {
        const countSerieI = periodAdmisiones.filter(isSerieI).length;
        const countSerieSR = periodAdmisiones.filter(isSerieSR).length;

        let sumHoras = 0;
        let sumDiasProporcionales = 0;
        let sumHorasSR = 0;
        let sumHorasPiso = 0;
        let sumDiasPropSR = 0;
        let sumDiasPropPiso = 0;

        for (const r of filteredRows) {
            if (!r.incluida_en_presupuesto) continue;
            sumHoras += Number(r.horas_presupuesto_total || 0);
            sumDiasProporcionales += Number(r.dias_proporcionales_total || 0);
            sumHorasSR += Number(r.horas_shock_room || 0);
            sumHorasPiso += Number(r.horas_piso || 0);
            sumDiasPropSR += Number(r.dias_proporcionales_sr || 0);
            sumDiasPropPiso += Number(r.dias_proporcionales_piso || 0);
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
            filteredCount: filteredRows.length,
            sumHoras: Math.round(sumHoras * 100) / 100,
            sumHorasSR: Math.round(sumHorasSR * 100) / 100,
            sumHorasPiso: Math.round(sumHorasPiso * 100) / 100,
            sumDiasProporcionales: Math.round(sumDiasProporcionales * 100) / 100,
            sumDiasPropSR: Math.round(sumDiasPropSR * 100) / 100,
            sumDiasPropPiso: Math.round(sumDiasPropPiso * 100) / 100,
            horasNetasBoxesSr: Math.round(horasNetasBoxesSr * 100) / 100,
            diasPropBoxesSr: Math.round(diasPropBoxesSr * 100) / 100,
            diasDispBoxesSr,
            pctOcupBoxesSr: Math.round(pctOcupBoxesSr * 100) / 100,
            sinHabCount,
            excluidasCount,
            boxSummary
        };
    }, [periodAdmisiones, filteredRows, periodOcupacion, effectiveDateRange, boxesConfig]);

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

    const handleExportExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            const headers = [
                'Fecha Ingreso',
                'Mes/Año',
                'N. Admisión',
                'Serie Admisión',
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
                'Horas de Internación',
                'Días Proporcionales (Horas ÷ 24)',
                'Horas en Shock Room',
                'Días Prop. Shock Room (Hs SR ÷ 24)',
                'Horas en Piso Clínico',
                'Días Prop. Piso (Hs Piso ÷ 24)',
                'Válida para Ocupación',
                'Estado de Auditoría'
            ];

            const rowsToExport = filteredRows.map(a => [
                formatSqlDateTime(a.fecha_ingreso),
                `${a.periodo}-01`,
                a.numero_admision || '',
                a.serie_admision || (isSerieSR(a) ? 'SHOCK ROOM' : 'INTERNADO'),
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
                Number(a.dias_proporcionales_total || 0),
                Number(a.horas_shock_room || 0),
                Number(a.dias_proporcionales_sr || 0),
                Number(a.horas_piso || 0),
                Number(a.dias_proporcionales_piso || 0),
                a.incluida_en_presupuesto ? 'SI' : 'NO (EXCLUIDA)',
                cleanAuditDetail(a.inconsistencia_detalle)
            ]);

            const wsAdm = XLSX.utils.aoa_to_sheet([headers, ...rowsToExport]);
            wsAdm['!cols'] = [
                { wch: 20 }, { wch: 12 }, { wch: 13 }, { wch: 15 }, { wch: 13 },
                { wch: 30 }, { wch: 28 }, { wch: 12 }, { wch: 44 }, { wch: 20 },
                { wch: 26 }, { wch: 10 }, { wch: 8 }, { wch: 22 }, { wch: 36 },
                { wch: 20 }, { wch: 20 }, { wch: 20 }, { wch: 28 }, { wch: 18 },
                { wch: 24 }, { wch: 18 }, { wch: 22 }, { wch: 20 }, { wch: 56 }
            ];
            XLSX.utils.book_append_sheet(wb, wsAdm, '1_Admisiones_Guardia_Clinica');

            const resumenAoA = [
                ['RESUMEN DE ADMISIONES Y OCUPACIÓN PROPORCIONAL — GUARDIA CLÍNICA (DRA. PAOLA GARCÍA)'],
                ['Período Exportado:', effectiveDateRange.label],
                ['Días Calendario del Período:', effectiveDateRange.diasCalendario],
                [],
                ['INDICADOR', 'VALOR', 'DETALLE'],
                ['Total Admisiones del Período', totals.totalPeriodo, `Serie I (Internación): ${totals.countSerieI} · Serie SR (Shock Room): ${totals.countSerieSR}`],
                ['Horas Reales de Internación (Selección)', totals.sumHoras, `${totals.sumHorasSR} hs en Boxes SR + ${totals.sumHorasPiso} hs en Camas de Piso`],
                ['Días Proporcionales Totales (Horas ÷ 24)', totals.sumDiasProporcionales, `${totals.sumDiasPropSR} d en Shock Room + ${totals.sumDiasPropPiso} d en Piso`],
                [],
                ['OCUPACIÓN FÍSICA NETA DE LOS 3 BOXES DE SHOCK ROOM', 'HORAS NETAS', 'DÍAS PROP. (Hs/24)', 'DÍAS DISPONIBLES', '% OCUPACIÓN REAL', 'PACIENTES'],
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
            wsRes['!cols'] = [{ wch: 52 }, { wch: 18 }, { wch: 50 }, { wch: 18 }, { wch: 18 }, { wch: 14 }];
            XLSX.utils.book_append_sheet(wb, wsRes, '2_Resumen_Ocupacion');

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
            XLSX.writeFile(wb, `Admisiones_Guardia_Clinica_${tag}.xlsx`);
            addToast?.(`Excel descargado con ${rowsToExport.length} admisiones`, 'success');
        } catch (err) {
            console.error('Error exportando Excel:', err);
            addToast?.('Error al generar el archivo Excel', 'error');
        }
    };

    const relatedFicha557 = useMemo(() => {
        if (!selectedAdmDetail || !fichas557.length) return null;
        const admNum = (selectedAdmDetail.numero_admision || '').trim().toUpperCase();
        const admNhc = String(selectedAdmDetail.nhc || '').replace(/^0+/, '');
        const admVisita = selectedAdmDetail.id_visita_557 ? String(selectedAdmDetail.id_visita_557) : null;

        return fichas557.find(f => {
            if (admVisita && f.id_visita && String(f.id_visita) === admVisita) return true;
            if (admNum && f.numero_admision && f.numero_admision.trim().toUpperCase() === admNum) return true;
            if (admNhc && f.nhc && String(f.nhc).replace(/^0+/, '') === admNhc) return true;
            return false;
        }) || null;
    }, [selectedAdmDetail, fichas557]);

    const copyPatientToClipboard = (adm, f557) => {
        if (!adm) return;
        const lines = [
            `============================================================`,
            `SANATORIO ARGENTINO — DOSSIER CLÍNICO Y DE GESTIÓN`,
            `============================================================`,
            `PACIENTE: ${adm.paciente}`,
            `NHC: ${adm.nhc || 'S/D'} | DNI: ${adm.dni || 'S/D'} | EDAD: ${adm.edad_salus || f557?.edad || '-'} años`,
            `COBERTURA: ${adm.obra_social || 'PARTICULAR'}`,
            `ADMISIÓN SALUS: ${adm.numero_admision} (ID #${adm.id_admision})`,
            `SERIE / RÉGIMEN: ${adm.serie_admision || 'SHOCK ROOM'} (${adm.regimen_ubicacion || 'SHOCK_ROOM'})`,
            `ESTADO SALUS: ${adm.estado_salus || 'ACTIVA'}`,
            `HABITACIÓN / BOX: ${adm.habitacion_salus || 'SIN ASIGNAR'}`,
            `MÉDICO CABECERA: ${adm.doctor_cabecera || 'Dra. Paola García'}`,
            `SERVICIO / ESP: ${adm.servicio_salus || '-'} · ${adm.especialidad_salus || '-'}`,
            `PROCESO: ${adm.proceso_salus || '-'}`,
            `PROCEDENCIA: ${adm.procedencia_salus || 'Guardia'}`,
            `------------------------------------------------------------`,
            `CRONOGRAMA DE INTERNACIÓN:`,
            `INGRESO: ${formatDateTimeShort(adm.fecha_ingreso)}`,
            `ALTA / ESTADO: ${adm.fecha_alta ? formatDateTimeShort(adm.fecha_alta) : 'En Curso (Activa)'}`,
            `MOTIVO DE ALTA: ${adm.motivo_alta || (adm.fecha_alta ? 'Alta SALUS' : 'Internación en curso')}`,
            `TIEMPO TOTAL: ${adm.horas_brutas_salus} hs (${adm.dias_proporcionales_total} días prop.)`,
            `DESGLOSE: Shock Room ${adm.horas_shock_room} hs | Piso ${adm.horas_piso} hs`,
            `RECORRIDO DE CAMAS:`,
            ...(adm.tramos_json || []).map((t, idx) => `  ${idx + 1}. ${t.unidad}: ${formatDateTimeShort(t.inicio)} a ${formatDateTimeShort(t.fin)} (${t.horas} hs)`),
        ];

        if (f557) {
            lines.push(
                `------------------------------------------------------------`,
                `VALORACIÓN MÉDICA PROTOCOLO 557:`,
                `MÉDICO ADMISIÓN: ${f557.medico_admision || '-'} (${f557.fecha_visita || ''} ${f557.hora_visita || ''})`,
                `MOTIVO CONSULTA: ${f557.motivo_consulta || '-'}`,
                `ENFERMEDAD ACTUAL: ${f557.enfermedad_actual || '-'}`,
                `SIGNOS VITALES: TA: ${f557.ta || '-'} | FC: ${f557.fc || '-'} lpm | FR: ${f557.fr || '-'} rpm | SAT: ${f557.sat || '-'}% | TEMP: ${f557.temp || '-'}°C`,
                `MEDICACIÓN HABITUAL: ${f557.medicacion_habitual || 'No refiere'}`,
                `ANTECEDENTES / PATOLOGÍAS: ${f557.patologias || 'No refiere'}`,
                `ALERGIAS: ${f557.alergia || 'No'} ${f557.alergia_cuales ? `(${f557.alergia_cuales})` : ''}`,
                `CIRUGÍAS PREVIAS: ${f557.cirugias_previas || 'No'} ${f557.cirugias_cuales ? `(${f557.cirugias_cuales})` : ''}`,
                `EXAMEN FÍSICO: Neuro: ${f557.neurologico || '-'} | Resp: ${f557.ap_resp || '-'} | CV: ${f557.ap_cv || '-'} | Abdomen: ${f557.abdomen || '-'}`,
                `DIAGNÓSTICO: ${f557.diagnostico || '-'}`,
                `PLAN TERAPÉUTICO: ${f557.plan_terapeutico || '-'}`
            );
        }

        if (adm.tiene_inconsistencia) {
            lines.push(
                `------------------------------------------------------------`,
                `AUDITORÍA DE INCONSISTENCIA:`,
                `CÓDIGO: ${adm.inconsistencia_codigo}`,
                `DETALLE: ${adm.inconsistencia_detalle}`
            );
        }

        lines.push(`============================================================`);
        navigator.clipboard.writeText(lines.join('\n'));
        setCopiedModal(true);
        setTimeout(() => setCopiedModal(false), 2500);
        addToast?.('Dossier completo del paciente copiado al portapapeles', 'success');
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
                    Cargando padrón completo de admisiones de Guardia Clínica...
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
                            Período visualizado: <strong style={{ color: '#1E40AF' }}>{effectiveDateRange.label}</strong> · Incluye admisiones de <strong>Serie I</strong> (Internación) y <strong>Serie SR</strong> (Shock Room).
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
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
            </div>

            {/* ─── 4 TARJETAS DE RESUMEN DEL PERÍODO ─── */}
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
                        Serie I (Internación): <strong>{totals.countSerieI}</strong> · Serie SR (Shock Room): <strong>{totals.countSerieSR}</strong>
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
                        SR: <strong>{totals.sumDiasPropSR.toLocaleString('es-AR')} d</strong> · Piso: <strong>{totals.sumDiasPropPiso.toLocaleString('es-AR')} d</strong> (12 hs = 0,50 d)
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
                VISTA 1: PLANILLA DE TODAS LAS ADMISIONES
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'planilla_excel' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
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
                                <option value="SOLO_I">Solo Serie I — Internación ({totals.countSerieI})</option>
                                <option value="SOLO_SR">Solo Serie SR — Shock Room ({totals.countSerieSR})</option>
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
                                placeholder="Buscar N° admisión, paciente, DNI, NHC..."
                                style={{ width: '100%', padding: '6px 10px 6px 30px', borderRadius: '6px', border: '1px solid #CBD5E1', fontSize: '0.78rem' }}
                            />
                        </div>
                    </div>

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
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Serie</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Documento</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Paciente</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Cliente (Obra Social)</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Procesos</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Servicio</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>NHC</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Habitación & Recorrido</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Fecha Alta</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', textAlign: 'right', color: '#334155' }}>Horas</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', textAlign: 'right', color: '#1E40AF', background: '#EFF6FF' }}>Días Prop. (Hs÷24)</th>
                                        <th style={{ padding: '9px 10px', whiteSpace: 'nowrap', color: '#334155' }}>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredRows.length === 0 ? (
                                        <tr>
                                            <td colSpan="14" style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                                                No hay admisiones para los filtros seleccionados.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredRows.slice(0, 500).map((a, idx) => {
                                            const esSR = isSerieSR(a);
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
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap', fontWeight: 800, color: esSR ? '#1E40AF' : '#0F172A' }}>
                                                        {a.numero_admision}
                                                    </td>
                                                    <td style={{ padding: '7px 10px', whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            padding: '2px 7px',
                                                            borderRadius: '5px',
                                                            fontSize: '0.68rem',
                                                            fontWeight: 800,
                                                            background: esSR ? '#DBEAFE' : '#E2E8F0',
                                                            color: esSR ? '#1E40AF' : '#334155'
                                                        }}>
                                                            {esSR ? 'Serie SR' : isSerieI(a) ? 'Serie I' : (a.serie_admision || 'Otra')}
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
                                Mostrando primeras 500 filas en pantalla. Con <strong>"Descargar Excel Completo ({filteredRows.length} admisiones)"</strong> se exportan el 100% de las filas.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Modal de Dossier Clínico y Administrativo Completo del Paciente */}
            {selectedAdmDetail && (
                <div
                    onClick={() => setSelectedAdmDetail(null)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        backdropFilter: 'blur(3px)',
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
                            borderRadius: '14px',
                            width: '100%',
                            maxWidth: '880px',
                            maxHeight: '90vh',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                            border: '1px solid #E2E8F0',
                            overflow: 'hidden'
                        }}
                    >
                        {/* ─── HEADER DEL PACIENTE ─── */}
                        <div style={{
                            padding: '18px 24px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '16px',
                            flexWrap: 'wrap'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '280px' }}>
                                <div style={{
                                    width: '46px',
                                    height: '46px',
                                    borderRadius: '50%',
                                    background: '#EFF6FF',
                                    border: '1.5px solid #BFDBFE',
                                    color: '#1E40AF',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontWeight: 900,
                                    fontSize: '1.1rem',
                                    flexShrink: 0
                                }}>
                                    <User size={22} />
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 900, color: '#0F172A' }}>
                                            {selectedAdmDetail.paciente}
                                        </h3>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: selectedAdmDetail.estado_salus === 'ACTIVA' ? '#DCFCE7' : '#EFF6FF',
                                            color: selectedAdmDetail.estado_salus === 'ACTIVA' ? '#15803D' : '#1E40AF',
                                            border: `1px solid ${selectedAdmDetail.estado_salus === 'ACTIVA' ? '#86EFAC' : '#BFDBFE'}`
                                        }}>
                                            {selectedAdmDetail.estado_salus === 'ACTIVA' ? '🟢 INTERNADO ACTIVO' : selectedAdmDetail.fecha_alta ? '🔵 ALTA SALUS' : '🟡 ABIERTA'}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                            padding: '2px 8px',
                                            borderRadius: '6px',
                                            background: (selectedAdmDetail.serie_admision === 'SHOCK ROOM' || selectedAdmDetail.numero_admision?.startsWith('SR')) ? '#FEF3C7' : '#EFF6FF',
                                            color: (selectedAdmDetail.serie_admision === 'SHOCK ROOM' || selectedAdmDetail.numero_admision?.startsWith('SR')) ? '#B45309' : '#1E40AF',
                                            border: '1px solid #E2E8F0'
                                        }}>
                                            {selectedAdmDetail.serie_admision || (selectedAdmDetail.numero_admision?.startsWith('SR') ? 'SHOCK ROOM' : 'SERIE I')}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                        <span>NHC: <strong style={{ color: '#0F172A' }}>{selectedAdmDetail.nhc || relatedFicha557?.nhc || 'S/D'}</strong></span>
                                        <span>·</span>
                                        <span>DNI: <strong style={{ color: '#0F172A' }}>{selectedAdmDetail.dni || relatedFicha557?.dni || 'S/D'}</strong></span>
                                        <span>·</span>
                                        <span>Edad: <strong style={{ color: '#0F172A' }}>{selectedAdmDetail.edad_salus || relatedFicha557?.edad ? `${selectedAdmDetail.edad_salus || relatedFicha557?.edad} años` : 'S/D'}</strong></span>
                                        <span>·</span>
                                        <span>Obra Social: <strong style={{ color: '#1E40AF' }}>{selectedAdmDetail.obra_social || 'PARTICULAR'}</strong></span>
                                    </div>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => copyPatientToClipboard(selectedAdmDetail, relatedFicha557)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '6px',
                                        padding: '7px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        background: copiedModal ? '#DCFCE7' : '#FFFFFF',
                                        color: copiedModal ? '#166534' : '#334155',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    {copiedModal ? <Check size={14} /> : <Copy size={14} />}
                                    {copiedModal ? 'Copiado' : 'Copiar Dossier'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedAdmDetail(null)}
                                    style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        background: '#FFFFFF',
                                        color: '#64748B',
                                        fontSize: '1rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* ─── PESTAÑAS DE NAVEGACIÓN DENTRO DEL MODAL ─── */}
                        <div style={{
                            padding: '8px 24px 0 24px',
                            background: '#FFFFFF',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            gap: '8px',
                            overflowX: 'auto'
                        }}>
                            {[
                                { id: 'general', label: '📋 Datos Administrativos & Estadía' },
                                { id: 'clinica', label: `🩺 Ficha Clínica (Prot. 557)`, badge: relatedFicha557 ? 'Disponible' : `${selectedAdmDetail.visitas_hc_count || 0} ev.` },
                                { id: 'camas', label: `🛏️ Recorrido de Camas (${(selectedAdmDetail.tramos_json || []).length})` }
                            ].map(t => {
                                const active = modalTab === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setModalTab(t.id)}
                                        style={{
                                            padding: '9px 14px',
                                            border: 'none',
                                            borderBottom: active ? '3px solid #1E40AF' : '3px solid transparent',
                                            background: 'transparent',
                                            color: active ? '#1E40AF' : '#64748B',
                                            fontWeight: active ? 800 : 600,
                                            fontSize: '0.82rem',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '6px',
                                            whiteSpace: 'nowrap'
                                        }}
                                    >
                                        {t.label}
                                        {t.badge && (
                                            <span style={{
                                                fontSize: '0.68rem',
                                                padding: '1px 6px',
                                                borderRadius: '6px',
                                                background: relatedFicha557 ? '#DCFCE7' : '#F1F5F9',
                                                color: relatedFicha557 ? '#15803D' : '#64748B',
                                                fontWeight: 700
                                            }}>
                                                {t.badge}
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>

                        {/* ─── CUERPO PRINCIPAL DEL MODAL (SCROLLABLE) ─── */}
                        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* PESTAÑA 1: DATOS ADMINISTRATIVOS & ESTADÍA */}
                            {modalTab === 'general' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {/* Grid de 2 columnas: Tiempos de Estadía y Clasificación Asistencial */}
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '14px' }}>
                                        {/* Card 1: Estadía & Días Proporcionales */}
                                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Clock size={16} /> Cronograma de Estadía y Ocupación
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '0.78rem' }}>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Fecha/Hora Ingreso:</span>
                                                    <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                        {formatDateTimeShort(selectedAdmDetail.fecha_ingreso)}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Fecha/Hora Alta:</span>
                                                    <div style={{ fontWeight: 800, color: selectedAdmDetail.fecha_alta ? '#0F172A' : '#15803D', marginTop: '2px' }}>
                                                        {selectedAdmDetail.fecha_alta ? formatDateTimeShort(selectedAdmDetail.fecha_alta) : 'En Curso (Activa)'}
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Horas Brutas SALUS:</span>
                                                    <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                        {selectedAdmDetail.horas_brutas_salus} hs
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Días Proporcionales:</span>
                                                    <div style={{ fontWeight: 800, color: '#1E40AF', marginTop: '2px' }}>
                                                        {selectedAdmDetail.dias_proporcionales_total} d (Base 24h)
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Horas Shock Room:</span>
                                                    <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                        {selectedAdmDetail.horas_shock_room} hs ({selectedAdmDetail.dias_proporcionales_sr} d)
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Horas Piso Clínico:</span>
                                                    <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                        {selectedAdmDetail.horas_piso} hs ({selectedAdmDetail.dias_proporcionales_piso} d)
                                                    </div>
                                                </div>
                                            </div>
                                            {selectedAdmDetail.motivo_alta && (
                                                <div style={{ fontSize: '0.78rem', paddingTop: '8px', borderTop: '1px solid #E2E8F0' }}>
                                                    <span style={{ color: '#64748B' }}>Motivo de Alta:</span>{' '}
                                                    <strong style={{ color: '#0F172A' }}>{selectedAdmDetail.motivo_alta}</strong>
                                                </div>
                                            )}
                                        </div>

                                        {/* Card 2: Gestión Asistencial SALUS */}
                                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                            <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0284C7', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                <Activity size={16} /> Clasificación Asistencial y Médico Responsable
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '8px', fontSize: '0.78rem' }}>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Médico/a Cabecera:</span>
                                                    <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                        {selectedAdmDetail.doctor_cabecera || 'GARCIA, PAOLA GUADALUPE'}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                    <div>
                                                        <span style={{ color: '#64748B' }}>Servicio SALUS:</span>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                            {selectedAdmDetail.servicio_salus || '-'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: '#64748B' }}>Especialidad:</span>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                            {selectedAdmDetail.especialidad_salus || '-'}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div>
                                                    <span style={{ color: '#64748B' }}>Proceso / Prestación Asistencial:</span>
                                                    <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                        {selectedAdmDetail.proceso_salus || '-'}
                                                    </div>
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                    <div>
                                                        <span style={{ color: '#64748B' }}>Habitación SALUS:</span>
                                                        <div style={{ fontWeight: 800, color: '#1E40AF', marginTop: '2px' }}>
                                                            {selectedAdmDetail.habitacion_salus || 'SIN HABITACIÓN'}
                                                        </div>
                                                    </div>
                                                    <div>
                                                        <span style={{ color: '#64748B' }}>Procedencia:</span>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                            {selectedAdmDetail.procedencia_salus || 'Derivado desde Urgencias'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Card de Auditoría de Inconsistencia (si existe) */}
                                    {selectedAdmDetail.tiene_inconsistencia ? (
                                        <div style={{
                                            background: '#FFFBEB',
                                            border: '1.5px solid #FCD34D',
                                            borderRadius: '10px',
                                            padding: '12px 16px',
                                            display: 'flex',
                                            gap: '12px',
                                            alignItems: 'flex-start'
                                        }}>
                                            <AlertTriangle size={20} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '3px', fontSize: '0.78rem' }}>
                                                <strong style={{ color: '#92400E' }}>
                                                    Auditoría de Inconsistencia SALUS: {selectedAdmDetail.inconsistencia_codigo}
                                                </strong>
                                                <p style={{ margin: 0, color: '#78350F' }}>
                                                    {cleanAuditDetail(selectedAdmDetail.inconsistencia_detalle)}
                                                </p>
                                            </div>
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: '#F0FDF4',
                                            border: '1px solid #BBF7D0',
                                            borderRadius: '10px',
                                            padding: '10px 16px',
                                            display: 'flex',
                                            gap: '10px',
                                            alignItems: 'center',
                                            fontSize: '0.78rem',
                                            color: '#166534'
                                        }}>
                                            <Check size={18} color="#16A34A" />
                                            <span><strong>Validación OK:</strong> Registro consistente con habitación física y proceso normado en SALUS.</span>
                                        </div>
                                    )}

                                    {/* Historial Resumido de Evoluciones en HC */}
                                    <div style={{
                                        background: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        padding: '12px 16px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: '0.8rem'
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <FileText size={16} color="#64748B" />
                                            <span>Visitas / Evoluciones en Historia Clínica SALUS:</span>
                                            <strong style={{ color: '#0F172A' }}>{selectedAdmDetail.visitas_hc_count || 0} registros</strong>
                                        </div>
                                        {relatedFicha557 && (
                                            <button
                                                type="button"
                                                onClick={() => setModalTab('clinica')}
                                                style={{
                                                    background: '#EFF6FF',
                                                    color: '#1E40AF',
                                                    border: '1px solid #BFDBFE',
                                                    borderRadius: '6px',
                                                    padding: '4px 10px',
                                                    fontSize: '0.74rem',
                                                    fontWeight: 700,
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                Ver Ficha 557 →
                                            </button>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* PESTAÑA 2: FICHA CLÍNICA & ANTECEDENTES (PROTOCOLO 557) */}
                            {modalTab === 'clinica' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                    {relatedFicha557 ? (
                                        <>
                                            {/* Signos Vitales al Ingreso */}
                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px' }}>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#1E40AF', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <HeartPulse size={16} /> Signos Vitales al Ingreso
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px' }}>
                                                    {[
                                                        { label: 'T.A.', val: relatedFicha557.ta && relatedFicha557.ta !== '0' ? relatedFicha557.ta : '-' },
                                                        { label: 'F.C.', val: relatedFicha557.fc && relatedFicha557.fc !== '0' ? `${relatedFicha557.fc} lpm` : '-' },
                                                        { label: 'F.R.', val: relatedFicha557.fr && relatedFicha557.fr !== '0' ? `${relatedFicha557.fr} rpm` : '-' },
                                                        { label: 'SAT O2', val: relatedFicha557.sat && relatedFicha557.sat !== '0' ? `${relatedFicha557.sat}%` : '-' },
                                                        { label: 'TEMP.', val: relatedFicha557.temp && relatedFicha557.temp !== '0' ? `${relatedFicha557.temp} °C` : '-' },
                                                        { label: 'PESO', val: relatedFicha557.peso && relatedFicha557.peso !== '0' ? `${relatedFicha557.peso} kg` : '-' }
                                                    ].map((s, idx) => (
                                                        <div key={idx} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                                                            <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#64748B' }}>{s.label}</span>
                                                            <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#0F172A', marginTop: '2px' }}>{s.val}</div>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Motivo de Consulta y Enfermedad Actual */}
                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
                                                <div>
                                                    <span style={{ fontWeight: 800, color: '#334155' }}>Motivo de Consulta:</span>
                                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px', marginTop: '4px', color: '#0F172A', fontWeight: 600 }}>
                                                        {relatedFicha557.motivo_consulta || 'No especificado'}
                                                    </div>
                                                </div>
                                                {relatedFicha557.enfermedad_actual && (
                                                    <div>
                                                        <span style={{ fontWeight: 800, color: '#334155' }}>Enfermedad Actual:</span>
                                                        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px', marginTop: '4px', color: '#0F172A', lineHeight: 1.45 }}>
                                                            {relatedFicha557.enfermedad_actual}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>

                                            {/* Antecedentes Patológicos & Medicación Habitual */}
                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.78rem' }}>
                                                <div style={{ fontWeight: 800, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                    <Pill size={16} /> Antecedentes Patológicos & Medicación
                                                </div>
                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '8px' }}>
                                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px' }}>
                                                        <span style={{ color: '#64748B' }}>Medicación Habitual:</span>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                            {relatedFicha557.medicacion_habitual || 'No refiere'}
                                                        </div>
                                                    </div>
                                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px' }}>
                                                        <span style={{ color: '#64748B' }}>Alergias:</span>
                                                        <div style={{ fontWeight: 700, color: relatedFicha557.alergia === 'Si' ? '#DC2626' : '#0F172A', marginTop: '2px' }}>
                                                            {relatedFicha557.alergia || 'No'} {relatedFicha557.alergia_cuales ? `(${relatedFicha557.alergia_cuales})` : ''}
                                                        </div>
                                                    </div>
                                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px' }}>
                                                        <span style={{ color: '#64748B' }}>Patologías de Base:</span>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                            {relatedFicha557.patologias || 'No refiere'}
                                                        </div>
                                                    </div>
                                                    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px' }}>
                                                        <span style={{ color: '#64748B' }}>Cirugías Previas:</span>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', marginTop: '2px' }}>
                                                            {relatedFicha557.cirugias_previas || 'No'} {relatedFicha557.cirugias_cuales ? `(${relatedFicha557.cirugias_cuales})` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Diagnóstico y Plan Terapéutico */}
                                            {(relatedFicha557.diagnostico || relatedFicha557.plan_terapeutico) && (
                                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.8rem' }}>
                                                    <div style={{ fontWeight: 800, color: '#1E40AF', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <Stethoscope size={16} /> Diagnóstico y Plan Terapéutico
                                                    </div>
                                                    {relatedFicha557.diagnostico && (
                                                        <div>
                                                            <span style={{ fontWeight: 700, color: '#334155' }}>Diagnóstico:</span>
                                                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px', marginTop: '3px', fontWeight: 700, color: '#0F172A' }}>
                                                                {relatedFicha557.diagnostico}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {relatedFicha557.plan_terapeutico && (
                                                        <div>
                                                            <span style={{ fontWeight: 700, color: '#334155' }}>Plan Terapéutico:</span>
                                                            <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '8px 10px', marginTop: '3px', color: '#0F172A', lineHeight: 1.45 }}>
                                                                {relatedFicha557.plan_terapeutico}
                                                            </div>
                                                        </div>
                                                    )}
                                                    <div style={{ fontSize: '0.74rem', color: '#64748B', marginTop: '4px' }}>
                                                        Médico de Admisión: <strong>{relatedFicha557.medico_admision || 'S/D'}</strong> ({relatedFicha557.fecha_visita} {relatedFicha557.hora_visita} hs)
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <div style={{
                                            background: '#F8FAFC',
                                            border: '1px dashed #CBD5E1',
                                            borderRadius: '10px',
                                            padding: '36px 20px',
                                            textAlign: 'center',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            alignItems: 'center',
                                            gap: '10px'
                                        }}>
                                            <Stethoscope size={36} color="#94A3B8" />
                                            <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#0F172A' }}>
                                                Sin formulario Protocolo 557 vinculado
                                            </div>
                                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B', maxWidth: '480px' }}>
                                                Esta admisión de Guardia registra {selectedAdmDetail.visitas_hc_count || 0} evoluciones directas en SALUS, pero no cuenta con Protocolo 557 de valoración de internado completado.
                                            </p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* PESTAÑA 3: RECORRIDO FÍSICO DE CAMAS Y TRAMOS */}
                            {modalTab === 'camas' && (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0F172A' }}>
                                            Trazabilidad Cronológica de Camas / Boxes en SALUS:
                                        </span>
                                        <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                                            Total: <strong>{(selectedAdmDetail.tramos_json || []).length} tramos registrados</strong>
                                        </span>
                                    </div>

                                    {(selectedAdmDetail.tramos_json || []).length === 0 ? (
                                        <div style={{ background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '8px', padding: '24px', textAlign: 'center', fontSize: '0.8rem', color: '#64748B' }}>
                                            Sin tramos intermedios de camas registrados.
                                        </div>
                                    ) : (
                                        (selectedAdmDetail.tramos_json || []).map((t, i) => {
                                            const isSr = t.unidad?.includes('BOX') || t.tipo === 'SHOCK_ROOM_BOX';
                                            return (
                                                <div
                                                    key={i}
                                                    style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #E2E8F0',
                                                        borderLeft: `4px solid ${isSr ? '#F59E0B' : '#2563EB'}`,
                                                        borderRadius: '8px',
                                                        padding: '12px 14px',
                                                        display: 'flex',
                                                        justifyContent: 'space-between',
                                                        alignItems: 'center',
                                                        gap: '12px',
                                                        flexWrap: 'wrap'
                                                    }}
                                                >
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <span style={{
                                                            width: '26px',
                                                            height: '26px',
                                                            borderRadius: '50%',
                                                            background: isSr ? '#FEF3C7' : '#EFF6FF',
                                                            color: isSr ? '#B45309' : '#1E40AF',
                                                            fontWeight: 900,
                                                            fontSize: '0.72rem',
                                                            display: 'flex',
                                                            alignItems: 'center',
                                                            justifyContent: 'center'
                                                        }}>
                                                            #{i + 1}
                                                        </span>
                                                        <div>
                                                            <div style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <Bed size={15} color={isSr ? '#F59E0B' : '#2563EB'} />
                                                                {t.unidad}
                                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, padding: '1px 6px', borderRadius: '4px', background: isSr ? '#FEF3C7' : '#EFF6FF', color: isSr ? '#B45309' : '#1E40AF' }}>
                                                                    {isSr ? 'Shock Room' : 'Piso Internación'}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '2px' }}>
                                                                {formatDateTimeShort(t.inicio)} → {formatDateTimeShort(t.fin)}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div style={{ textAlign: 'right' }}>
                                                        <div style={{ fontSize: '0.92rem', fontWeight: 900, color: '#1E40AF' }}>
                                                            {t.horas} hs
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            {Number(t.dias_prop || 0).toFixed(4)} días prop.
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
                                </div>
                            )}
                        </div>

                        {/* ─── FOOTER DEL MODAL ─── */}
                        <div style={{
                            padding: '12px 24px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                Auditoría de Admisiones · Dra. Paola García · Sanatorio Argentino
                            </span>
                            <button
                                type="button"
                                onClick={() => setSelectedAdmDetail(null)}
                                style={{
                                    padding: '7px 18px',
                                    borderRadius: '8px',
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    color: '#334155',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
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
