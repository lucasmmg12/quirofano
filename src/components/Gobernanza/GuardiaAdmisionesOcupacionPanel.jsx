import React, { useState, useEffect, useMemo } from 'react';
import {
    Search, RefreshCw, FileSpreadsheet
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
                            Horas Totales: {selectedAdmDetail.horas_brutas_salus} hs → Días Proporcionales Reales: {selectedAdmDetail.dias_proporcionales_total} días
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
