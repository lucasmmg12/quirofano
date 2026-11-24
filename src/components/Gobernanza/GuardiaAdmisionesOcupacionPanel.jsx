import React, { useState, useEffect, useMemo } from 'react';
import {
    Bed, Search, RefreshCw, Calendar, CheckCircle2, AlertTriangle,
    Download, ShieldAlert, Activity, Clock, FileSpreadsheet, Eye,
    BarChart3, Sliders, Info, Layers, ArrowRight, X, Check
} from 'lucide-react';
import {
    ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
    CartesianGrid, Tooltip as RechartsTooltip, Legend, ReferenceLine
} from 'recharts';
import { supabase } from '../../lib/supabase';

const INCONSISTENCIA_META = {
    OK: {
        label: 'Consistente',
        badgeBg: '#DCFCE7',
        badgeColor: '#166534',
        border: '#86EFAC',
        shortDesc: 'Habitación, horario y servicio consistentes'
    },
    SIN_HABITACION_CON_ATENCION: {
        label: 'Sin Habitación (Con Atención Real)',
        badgeBg: '#FEF3C7',
        badgeColor: '#92400E',
        border: '#FCD34D',
        shortDesc: 'Atención comprobada en HC / Módulo 400109 sin asignar Box físico antes del alta'
    },
    INTERNACION_SUSPENDIDA: {
        label: 'Internación Suspendida (< 1h)',
        badgeBg: '#FFEDD5',
        badgeColor: '#9A3412',
        border: '#FDBA74',
        shortDesc: 'Admisión abortada en recepción sin ocupar cama (excluida del presupuesto)'
    },
    ABIERTA_OLVIDADA_SIN_ALTA: {
        label: 'Abierta sin Alta Administrativa',
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        border: '#FCA5A5',
        shortDesc: 'Admisión olvidada abierta en SALUS (> 48h en SR/Sin cama); excluida para no inflar horas'
    },
    SERVICIO_INCORRECTO_CHEQUEO: {
        label: 'Error de Servicio (CHEQUEO)',
        badgeBg: '#FEE2E2',
        badgeColor: '#991B1B',
        border: '#FCA5A5',
        shortDesc: 'Circuito ambulatorio de Chequeo Preventivo imputado por error (excluido)'
    },
    SERVICIO_MAL_IMPUTADO_SR: {
        label: 'Box SR con Servicio Piso',
        badgeBg: '#E0F2FE',
        badgeColor: '#075985',
        border: '#7DD3FC',
        shortDesc: 'Estancia física en BOX SR cargada como INTERNACION CLINICA (reclasificada a SR)'
    },
    SOLAPAMIENTO_HORARIO_BOX: {
        label: 'Solapamiento Horario en Box',
        badgeBg: '#EDE9FE',
        badgeColor: '#5B21B6',
        border: '#C4B5FD',
        shortDesc: 'Superposición administrativa de minutos en el mismo box (deduplicada en ocupación neta)'
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

function formatDateTimeShort(isoStr) {
    if (!isoStr) return 'Sin alta (Abierta)';
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

export default function GuardiaAdmisionesOcupacionPanel({
    addToast,
    selectedPeriodoProp,
    fechaDesde,
    fechaHasta,
    onOpenFicha557ById
}) {
    const [viewTab, setViewTab] = useState('presupuesto'); // 'presupuesto' | 'auditoria' | 'padron'
    const [loading, setLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [admisiones, setAdmisiones] = useState([]);
    const [ocupacionDiaria, setOcupacionDiaria] = useState([]);
    const [boxesConfig, setBoxesConfig] = useState(3);
    const [savingBoxes, setSavingBoxes] = useState(false);

    // Filtros e inspector interactivo
    const [selectedInspectDate, setSelectedInspectDate] = useState('');
    const [inconsistenciaFilter, setInconsistenciaFilter] = useState('TODAS_OBSERVADAS');
    const [regimenFilter, setRegimenFilter] = useState('TODOS');
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedAdmDetail, setSelectedAdmDetail] = useState(null);

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
            console.error('Error cargando Admisiones y Ocupación de Guardia Clínica:', err);
            addToast?.('Error al cargar admisiones y ocupación proporcional de Guardia Clínica', 'error');
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
                addToast?.('Admisiones y ocupación proporcional sincronizadas en vivo desde SALUS', 'success');
                await loadData();
            } else {
                await loadData();
                addToast?.('Datos actualizados desde la base consolidada de Supabase', 'info');
            }
        } catch (_) {
            await loadData();
            addToast?.('Datos recargados desde Supabase (servidor local SALUS no disponible en este equipo)', 'info');
        } finally {
            setSyncing(false);
        }
    };

    const handleSaveBoxesConfig = async (newBoxes) => {
        const val = Math.max(1, Math.min(15, Number(newBoxes) || 3));
        setBoxesConfig(val);
        setSavingBoxes(true);
        try {
            await supabase.from('gob_internacion_camas_config').upsert({
                sector: 'SHOCK ROOM',
                subsector: 'GUARDIA CLINICA',
                anio: 2026,
                camas_operativas: val,
                horas_mes_hdd: val * 24 * 30,
                updated_at: new Date().toISOString()
            }, { onConflict: 'sector,subsector,anio' });
        } catch (e) {
            console.warn('No se pudo persistir camas_operativas SR:', e);
        } finally {
            setSavingBoxes(false);
        }
    };

    // Determinar rango efectivo de fechas conectado al Telar superior
    const effectiveDateRange = useMemo(() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        // Buscar la última fecha real cargada para no diluir meses futuros aún no transcurridos
        const maxDataDate = ocupacionDiaria.length > 0 ? ocupacionDiaria[0].fecha : todayStr;
        const capEnd = maxDataDate < todayStr ? todayStr : maxDataDate;

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

        if (selectedPeriodoProp && selectedPeriodoProp.includes('ANUAL')) {
            const y = selectedPeriodoProp.split('-')[0] || '2026';
            const dDesde = `${y}-01-01`;
            const dHasta = `${y}-12-31` > capEnd && capEnd.startsWith(y) ? capEnd : `${y}-12-31`;
            return {
                desde: dDesde,
                hasta: dHasta,
                diasCalendario: countCalendarDaysInclusive(dDesde, dHasta),
                label: `Acumulado ${y} (${formatDateDMY(dDesde)} al ${formatDateDMY(dHasta)})`
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

        const dDesde = '2026-01-01';
        const dHasta = capEnd >= dDesde ? capEnd : '2026-12-31';
        return {
            desde: dDesde,
            hasta: dHasta,
            diasCalendario: countCalendarDaysInclusive(dDesde, dHasta),
            label: `${formatDateDMY(dDesde)} al ${formatDateDMY(dHasta)}`
        };
    }, [fechaDesde, fechaHasta, selectedPeriodoProp, ocupacionDiaria]);

    // Filtrar admisiones y ocupación diaria según el rango activo
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

    // Días con mayor rotación en Boxes de Shock Room para el inspector visual de 24 horas
    const highRotationDays = useMemo(() => {
        const byDay = new Map();
        for (const r of periodOcupacion) {
            if (r.tipo_unidad !== 'SHOCK_ROOM_BOX') continue;
            const prev = byDay.get(r.fecha) || {
                fecha: r.fecha,
                pacientesBoxes: 0,
                maxPacEnUnBox: 0,
                horasNetasTotal: 0,
                diasPropTotal: 0,
                diasTradTotal: 0
            };
            prev.pacientesBoxes += Number(r.pacientes_distintos || 0);
            prev.maxPacEnUnBox = Math.max(prev.maxPacEnUnBox, Number(r.pacientes_distintos || 0));
            prev.horasNetasTotal += Number(r.horas_netas_ocupadas || 0);
            prev.diasPropTotal += Number(r.dias_proporcionales || 0);
            prev.diasTradTotal += Number(r.dias_conteo_tradicional || 0);
            byDay.set(r.fecha, prev);
        }
        return Array.from(byDay.values()).sort(
            (a, b) => (b.maxPacEnUnBox - a.maxPacEnUnBox) || (b.pacientesBoxes - a.pacientesBoxes) || b.fecha.localeCompare(a.fecha)
        );
    }, [periodOcupacion]);

    useEffect(() => {
        if (!highRotationDays.length) {
            setSelectedInspectDate('');
            return;
        }
        const exists = highRotationDays.some(d => d.fecha === selectedInspectDate);
        if (!exists) {
            setSelectedInspectDate(highRotationDays[0].fecha);
        }
    }, [highRotationDays]);

    // Métricas ejecutivas proporcionales para Gerencia y Presupuesto
    const kpis = useMemo(() => {
        const diasCal = effectiveDateRange.diasCalendario || 1;
        const horasDisponiblesSr = boxesConfig * 24 * diasCal;
        const diasDisponiblesSr = boxesConfig * diasCal; // 1 box x 24h = 1.00 día disponible

        const srRows = periodOcupacion.filter(o => o.tipo_unidad === 'SHOCK_ROOM_BOX');
        const sinBoxRows = periodOcupacion.filter(o => o.tipo_unidad === 'SIN_BOX_AUDITADO');
        const pisoRows = periodOcupacion.filter(o => o.tipo_unidad === 'PISO_CLINICO');

        const horasNetasSr = srRows.reduce((s, r) => s + Number(r.horas_netas_ocupadas || 0), 0);
        const horasBrutasSr = srRows.reduce((s, r) => s + Number(r.horas_brutas_pacientes || 0), 0);
        const minSolapadosSr = srRows.reduce((s, r) => s + Number(r.minutos_solapados || 0), 0);

        // REGLA PROPORCIONAL EXACTA: Días = Horas Netas / 24 (ej. 12 hs = 0.50 días sin importar cant. pacientes)
        const diasProporcionalesSr = horasNetasSr / 24;
        const pctOcupacionSr = horasDisponiblesSr > 0 ? (horasNetasSr / horasDisponiblesSr) * 100 : 0;

        // Conteo tradicional distorsionado en los boxes (1 paciente en el día = 1 día)
        const diasTradicionalesSr = srRows.reduce((s, r) => s + Number(r.dias_conteo_tradicional || 0), 0);
        const diasFantasmaDepurados = Math.max(0, diasTradicionalesSr - diasProporcionalesSr);
        const eventosMultiRotacion = srRows.filter(r => Number(r.pacientes_distintos || 0) >= 2).length;

        const horasSinBox = sinBoxRows.reduce((s, r) => s + Number(r.horas_netas_ocupadas || 0), 0);
        const diasPropSinBox = horasSinBox / 24;

        const horasPiso = pisoRows.reduce((s, r) => s + Number(r.horas_netas_ocupadas || 0), 0);
        const diasPropPiso = horasPiso / 24;

        // Si sumamos las horas reales sin box asignado a la carga de Shock Room (escenario integrado)
        const diasPropSrConSinBox = (horasNetasSr + horasSinBox) / 24;
        const pctOcupacionSrConSinBox = horasDisponiblesSr > 0 ? ((horasNetasSr + horasSinBox) / horasDisponiblesSr) * 100 : 0;

        const validas = periodAdmisiones.filter(a => a.incluida_en_presupuesto);
        const excluidas = periodAdmisiones.filter(a => !a.incluida_en_presupuesto);
        const soloSr = validas.filter(a => a.regimen_ubicacion === 'SHOCK_ROOM');
        const mixtoSrPiso = validas.filter(a => a.regimen_ubicacion === 'MIXTO_SR_PISO');
        const soloPiso = validas.filter(a => a.regimen_ubicacion === 'PISO_CLINICO' || a.regimen_ubicacion === 'CRITICOS_UCI');
        const sinHabConAtencion = periodAdmisiones.filter(a => a.inconsistencia_codigo === 'SIN_HABITACION_CON_ATENCION');

        // Desglose por cada Box físico
        const boxSummary = ['BOX 1-SR', 'BOX 2-SR', 'BOX 3-SR'].map(boxName => {
            const rows = srRows.filter(r => r.unidad === boxName);
            const hNet = rows.reduce((s, r) => s + Number(r.horas_netas_ocupadas || 0), 0);
            const dProp = hNet / 24;
            const dDisp = diasCal; // 1 box * diasCal
            const pacSum = rows.reduce((s, r) => s + Number(r.pacientes_distintos || 0), 0);
            const multiDays = rows.filter(r => Number(r.pacientes_distintos || 0) >= 2).length;
            return {
                unidad: boxName,
                horasNetas: Math.round(hNet * 100) / 100,
                horasDisponibles: diasCal * 24,
                diasProporcionales: Math.round(dProp * 100) / 100,
                diasDisponibles: dDisp,
                pctOcupacion: dDisp > 0 ? Math.round((dProp / dDisp) * 1000) / 10 : 0,
                rotacionesPacientes: pacSum,
                diasConMultiplesPacientes: multiDays,
                horasPromedioPorDia: Math.round((hNet / diasCal) * 100) / 100
            };
        });

        // Conteo de inconsistencias por código
        const inconsistenciasCount = {
            SIN_HABITACION_CON_ATENCION: 0,
            ABIERTA_OLVIDADA_SIN_ALTA: 0,
            INTERNACION_SUSPENDIDA: 0,
            SERVICIO_INCORRECTO_CHEQUEO: 0,
            SERVICIO_MAL_IMPUTADO_SR: 0,
            SOLAPAMIENTO_HORARIO_BOX: 0
        };
        for (const a of periodAdmisiones) {
            if (a.tiene_inconsistencia && inconsistenciasCount[a.inconsistencia_codigo] !== undefined) {
                inconsistenciasCount[a.inconsistencia_codigo]++;
            }
        }
        const anomaliasCriticasYAdvertencias =
            inconsistenciasCount.SIN_HABITACION_CON_ATENCION +
            inconsistenciasCount.ABIERTA_OLVIDADA_SIN_ALTA +
            inconsistenciasCount.INTERNACION_SUSPENDIDA +
            inconsistenciasCount.SERVICIO_INCORRECTO_CHEQUEO;

        return {
            diasCal,
            horasDisponiblesSr,
            diasDisponiblesSr,
            horasNetasSr: Math.round(horasNetasSr * 100) / 100,
            horasBrutasSr: Math.round(horasBrutasSr * 100) / 100,
            minSolapadosSr: Math.round(minSolapadosSr * 10) / 10,
            diasProporcionalesSr: Math.round(diasProporcionalesSr * 100) / 100,
            pctOcupacionSr: Math.round(pctOcupacionSr * 100) / 100,
            diasTradicionalesSr,
            diasFantasmaDepurados: Math.round(diasFantasmaDepurados * 100) / 100,
            eventosMultiRotacion,
            horasSinBox: Math.round(horasSinBox * 100) / 100,
            diasPropSinBox: Math.round(diasPropSinBox * 100) / 100,
            diasPropSrConSinBox: Math.round(diasPropSrConSinBox * 100) / 100,
            pctOcupacionSrConSinBox: Math.round(pctOcupacionSrConSinBox * 100) / 100,
            horasPiso: Math.round(horasPiso * 100) / 100,
            diasPropPiso: Math.round(diasPropPiso * 100) / 100,
            totalAdmisiones: periodAdmisiones.length,
            validasCount: validas.length,
            excluidasCount: excluidas.length,
            soloSrCount: soloSr.length,
            mixtoSrPisoCount: mixtoSrPiso.length,
            soloPisoCount: soloPiso.length,
            sinHabConAtencionCount: sinHabConAtencion.length,
            boxSummary,
            inconsistenciasCount,
            anomaliasCriticasYAdvertencias
        };
    }, [periodAdmisiones, periodOcupacion, effectiveDateRange, boxesConfig]);

    // Serie evolutiva (mensual si el período > 45 días, o diaria si es <= 45 días)
    const chartData = useMemo(() => {
        const isDailyMode = effectiveDateRange.diasCalendario <= 45;
        const srRows = periodOcupacion.filter(o => o.tipo_unidad === 'SHOCK_ROOM_BOX');
        const map = new Map();

        for (const r of srRows) {
            const key = isDailyMode ? r.fecha : r.periodo;
            const prev = map.get(key) || {
                key,
                horasNetas: 0,
                diasProp: 0,
                diasTradicional: 0,
                pacientes: 0
            };
            prev.horasNetas += Number(r.horas_netas_ocupadas || 0);
            prev.diasProp += Number(r.dias_proporcionales || 0);
            prev.diasTradicional += Number(r.dias_conteo_tradicional || 0);
            prev.pacientes += Number(r.pacientes_distintos || 0);
            map.set(key, prev);
        }

        const mesesCortos = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

        return Array.from(map.values())
            .sort((a, b) => a.key.localeCompare(b.key))
            .map(item => {
                let diasCapacidad = boxesConfig;
                let label = item.key;
                if (isDailyMode) {
                    const [, m, d] = item.key.split('-');
                    label = `${d}/${m}`;
                    diasCapacidad = boxesConfig;
                } else {
                    const [y, m] = item.key.split('-').map(Number);
                    const maxDaysInMonth = new Date(y, m, 0).getDate();
                    // Si es el último mes del rango, respetar la fecha tope
                    const monthStart = `${item.key}-01`;
                    const monthEnd = `${item.key}-${String(maxDaysInMonth).padStart(2, '0')}`;
                    const effStart = monthStart < effectiveDateRange.desde ? effectiveDateRange.desde : monthStart;
                    const effEnd = monthEnd > effectiveDateRange.hasta ? effectiveDateRange.hasta : monthEnd;
                    const dCount = countCalendarDaysInclusive(effStart, effEnd);
                    diasCapacidad = boxesConfig * dCount;
                    label = `${mesesCortos[(m || 1) - 1]} ${String(y).slice(2)}`;
                }

                const dProp = Math.round((item.horasNetas / 24) * 100) / 100;
                const pct = diasCapacidad > 0 ? Math.round((dProp / diasCapacidad) * 1000) / 10 : 0;

                return {
                    key: item.key,
                    label,
                    horasNetas: Math.round(item.horasNetas * 10) / 10,
                    diasProporcionales: dProp,
                    diasTradicionales: item.diasTradicional,
                    diasDisponibles: diasCapacidad,
                    pctOcupacion: pct,
                    pacientes: item.pacientes
                };
            });
    }, [periodOcupacion, effectiveDateRange, boxesConfig]);

    // Detalle del día seleccionado para la Franja Visual de 24 Horas por Box
    const inspectDayBoxes = useMemo(() => {
        if (!selectedInspectDate) return [];
        const dayRows = periodOcupacion.filter(
            o => o.fecha === selectedInspectDate && o.tipo_unidad === 'SHOCK_ROOM_BOX'
        );
        return ['BOX 1-SR', 'BOX 2-SR', 'BOX 3-SR'].map(boxName => {
            const found = dayRows.find(r => r.unidad === boxName);
            const horasNetas = Number(found?.horas_netas_ocupadas || 0);
            const diasProp = Math.round((horasNetas / 24) * 1000) / 1000;
            const tramos = Array.isArray(found?.detalle_tramos_dia) ? found.detalle_tramos_dia : [];
            return {
                unidad: boxName,
                horasNetas: Math.round(horasNetas * 100) / 100,
                horasLibres: Math.max(0, Math.round((24 - horasNetas) * 100) / 100),
                diasProporcionales: diasProp,
                pctOcupacion: Math.round((horasNetas / 24) * 1000) / 10,
                pacientesCount: Number(found?.pacientes_distintos || 0),
                minSolapados: Number(found?.minutos_solapados || 0),
                tramos
            };
        });
    }, [periodOcupacion, selectedInspectDate]);

    // Filtrado para Bandeja de Auditoría de Inconsistencias
    const filteredInconsistencias = useMemo(() => {
        return periodAdmisiones.filter(a => {
            if (!a.tiene_inconsistencia) return false;
            if (inconsistenciaFilter === 'CRITICAS_SIN_HAB') {
                return [
                    'SIN_HABITACION_CON_ATENCION',
                    'ABIERTA_OLVIDADA_SIN_ALTA',
                    'INTERNACION_SUSPENDIDA',
                    'SERVICIO_INCORRECTO_CHEQUEO'
                ].includes(a.inconsistencia_codigo);
            }
            if (inconsistenciaFilter !== 'TODAS_OBSERVADAS' && a.inconsistencia_codigo !== inconsistenciaFilter) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const match =
                    String(a.paciente || '').toLowerCase().includes(q) ||
                    String(a.numero_admision || '').toLowerCase().includes(q) ||
                    String(a.nhc || '').toLowerCase().includes(q) ||
                    String(a.dni || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }, [periodAdmisiones, inconsistenciaFilter, searchQuery]);

    // Filtrado para Padrón Nominal Completo
    const filteredPadron = useMemo(() => {
        return periodAdmisiones.filter(a => {
            if (regimenFilter === 'SOLO_VALIDAS' && !a.incluida_en_presupuesto) return false;
            if (regimenFilter === 'SOLO_EXCLUIDAS' && a.incluida_en_presupuesto) return false;
            if (
                ['SHOCK_ROOM', 'MIXTO_SR_PISO', 'PISO_CLINICO', 'SIN_HABITACION'].includes(regimenFilter) &&
                a.regimen_ubicacion !== regimenFilter
            ) {
                return false;
            }
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const match =
                    String(a.paciente || '').toLowerCase().includes(q) ||
                    String(a.numero_admision || '').toLowerCase().includes(q) ||
                    String(a.nhc || '').toLowerCase().includes(q) ||
                    String(a.dni || '').toLowerCase().includes(q) ||
                    String(a.habitacion_salus || '').toLowerCase().includes(q) ||
                    String(a.obra_social || '').toLowerCase().includes(q);
                if (!match) return false;
            }
            return true;
        });
    }, [periodAdmisiones, regimenFilter, searchQuery]);

    // Exportador Excel Presupuestario Multi-Hoja para Gerencia
    const handleExportExcel = async () => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            // Hoja 1: Resumen Ejecutivo para Presupuesto de Gerencia
            const resumenAoA = [
                ['REPORTE PRESUPUESTARIO DE GUARDIA CLÍNICA (CABECERA: DRA. PAOLA GARCÍA)'],
                ['Criterio Oficial de Ocupación:', 'Proporcional por Horas Reales (Horas Ocupadas / 24 = Días Proporcionales, independiente de la cantidad de pacientes)'],
                ['Período Analizado:', effectiveDateRange.label],
                ['Días Calendario del Período:', kpis.diasCal],
                ['Dotación Operativa Shock Room (Boxes):', boxesConfig],
                [],
                ['INDICADOR PRESUPUESTARIO SHOCK ROOM', 'VALOR', 'UNIDAD / DETALLE'],
                ['Capacidad Instalada en Horas (Boxes x 24h x Días)', kpis.horasDisponiblesSr, 'Horas-Box disponibles'],
                ['Capacidad Instalada en Días-Box', kpis.diasDisponiblesSr, 'Días-Box disponibles (1 Box 24h = 1,00 día)'],
                ['Horas Físicas Netas Ocupadas en Boxes SR', kpis.horasNetasSr, 'Horas netas (sin solapamientos)'],
                ['Días Proporcionales Ocupados en Boxes SR (Horas / 24)', kpis.diasProporcionalesSr, 'Días Proporcionales Reales'],
                ['% Ocupación Proporcional Shock Room', `${kpis.pctOcupacionSr}%`, 'Horas Netas / Horas Disponibles'],
                ['Horas Auditadas con Atención Real sin Box Asignado (400109)', kpis.horasSinBox, `${kpis.diasPropSinBox} días proporcionales adicionales`],
                ['% Ocupación Integrada (Boxes + Sin Box con Atención)', `${kpis.pctOcupacionSrConSinBox}%`, `${kpis.diasPropSrConSinBox} días proporcionales totales`],
                [],
                ['CONCILIACIÓN CONTRA CONTEO TRADICIONAL DISTORSIONADO', 'VALOR', 'EXPLICACIÓN'],
                ['Días que arrojaba el Conteo Tradicional (1 pac = 1 día)', kpis.diasTradicionalesSr, 'Inflado cuando entran 2, 3 o 4 pacientes el mismo día al mismo box'],
                ['Días Proporcionales Reales (Horas / 24)', kpis.diasProporcionalesSr, 'Medición exacta por proporción horaria'],
                ['Días-Cama Fantasma Depurados', kpis.diasFantasmaDepurados, `${kpis.eventosMultiRotacion} días-box tuvieron rotación múltiple en el mismo día`],
                [],
                ['DESGLOSE POR BOX FÍSICO DE SHOCK ROOM', 'HORAS NETAS', 'DÍAS PROPORCIONALES (Hs/24)', 'DÍAS DISPONIBLES', '% OCUPACIÓN', 'PACIENTES ATENDIDOS'],
                ...kpis.boxSummary.map(b => [
                    b.unidad,
                    b.horasNetas,
                    b.diasProporcionales,
                    b.diasDisponibles,
                    `${b.pctOcupacion}%`,
                    b.rotacionesPacientes
                ]),
                [],
                ['ESTADÍA EN PISO CLÍNICO (DRA. PAOLA GARCÍA)', 'VALOR', 'DETALLE'],
                ['Admisiones exclusivas en Piso + Tramos Mixtos (SR -> Piso)', kpis.soloPisoCount + kpis.mixtoSrPisoCount, `${kpis.mixtoSrPisoCount} iniciaron en SR y subieron a Piso`],
                ['Horas Ocupadas en Camas de Piso', kpis.horasPiso, `${kpis.diasPropPiso} días proporcionales en Piso`]
            ];
            const wsResumen = XLSX.utils.aoa_to_sheet(resumenAoA);
            wsResumen['!cols'] = [{ wch: 52 }, { wch: 18 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 20 }];
            XLSX.utils.book_append_sheet(wb, wsResumen, '1_Presupuesto_Gerencia');

            // Hoja 2: Ocupación Proporcional Diaria por Box
            const ocupHeaders = [
                'Fecha', 'Período', 'Unidad / Box', 'Tipo Unidad', 'Pacientes en el Día',
                'Horas Brutas Pacientes', 'Horas Netas Ocupadas (Máx 24h)', 'Minutos Solapados Deduplicados',
                'Días Proporcionales (Horas / 24)', 'Conteo Tradicional Pacientes/Día', '% Ocupación del Día'
            ];
            const ocupRows = periodOcupacion.map(o => [
                o.fecha,
                o.periodo,
                o.unidad,
                o.tipo_unidad,
                o.pacientes_distintos,
                Number(o.horas_brutas_pacientes || 0),
                Number(o.horas_netas_ocupadas || 0),
                Number(o.minutos_solapados || 0),
                Number(o.dias_proporcionales || 0),
                Number(o.dias_conteo_tradicional || 0),
                `${Number(o.porcentaje_ocupacion || 0)}%`
            ]);
            const wsOcup = XLSX.utils.aoa_to_sheet([ocupHeaders, ...ocupRows]);
            wsOcup['!cols'] = [
                { wch: 12 }, { wch: 10 }, { wch: 22 }, { wch: 18 }, { wch: 18 },
                { wch: 22 }, { wch: 26 }, { wch: 26 }, { wch: 28 }, { wch: 28 }, { wch: 18 }
            ];
            XLSX.utils.book_append_sheet(wb, wsOcup, '2_Ocupacion_Diaria_Box');

            // Hoja 3: Padrón Nominal Completo Dra. Paola García
            const nomHeaders = [
                'ID Admisión', 'N° Admisión', 'Fecha Ingreso', 'Fecha Alta', 'Paciente', 'NHC', 'DNI',
                'Obra Social', 'Habitación SALUS', 'Régimen Real', 'Servicio SALUS', 'Proceso / Módulo',
                'Motivo Alta', 'Horas Shock Room', 'Días Prop. SR (Hs/24)', 'Horas Piso', 'Días Prop. Piso (Hs/24)',
                'Horas Sin Box Auditadas', 'Total Días Proporcionales', 'Incluida Presupuesto',
                'Código Consistencia', 'Detalle Auditoría'
            ];
            const nomRows = periodAdmisiones.map(a => [
                a.id_admision,
                a.numero_admision || '',
                formatDateTimeShort(a.fecha_ingreso),
                a.fecha_alta ? formatDateTimeShort(a.fecha_alta) : 'ABIERTA',
                a.paciente || '',
                a.nhc || '',
                a.dni || '',
                a.obra_social || '',
                a.habitacion_salus || 'SIN HABITACIÓN',
                a.regimen_ubicacion,
                a.servicio_salus || '',
                a.proceso_salus || '',
                a.motivo_alta || '',
                Number(a.horas_shock_room || 0),
                Number(a.dias_proporcionales_sr || 0),
                Number(a.horas_piso || 0),
                Number(a.dias_proporcionales_piso || 0),
                Number(a.horas_sin_box_auditadas || 0),
                Number(a.dias_proporcionales_total || 0),
                a.incluida_en_presupuesto ? 'SI' : 'NO (EXCLUIDA)',
                a.inconsistencia_codigo,
                a.inconsistencia_detalle || 'OK'
            ]);
            const wsNom = XLSX.utils.aoa_to_sheet([nomHeaders, ...nomRows]);
            wsNom['!cols'] = Array(22).fill({ wch: 20 });
            XLSX.utils.book_append_sheet(wb, wsNom, '3_Padron_Paola_Garcia');

            // Hoja 4: Bandeja de Inconsistencias SALUS
            const incRows = periodAdmisiones
                .filter(a => a.tiene_inconsistencia)
                .map(a => [
                    a.numero_admision || '',
                    formatDateTimeShort(a.fecha_ingreso),
                    a.fecha_alta ? formatDateTimeShort(a.fecha_alta) : 'SIN ALTA',
                    a.paciente || '',
                    a.nhc || '',
                    a.habitacion_salus || 'SIN HABITACIÓN',
                    a.servicio_salus || '',
                    Number(a.horas_brutas_salus || 0),
                    INCONSISTENCIA_META[a.inconsistencia_codigo]?.label || a.inconsistencia_codigo,
                    a.incluida_en_presupuesto ? 'Incluida (Reclasificada)' : 'Excluida de Ocupación',
                    a.inconsistencia_detalle || ''
                ]);
            const wsInc = XLSX.utils.aoa_to_sheet([
                [
                    'N° Admisión', 'Ingreso', 'Alta', 'Paciente', 'NHC', 'Habitación SALUS',
                    'Servicio SALUS', 'Horas Brutas SALUS', 'Tipo Inconsistencia',
                    'Impacto Presupuesto', 'Diagnóstico y Acción Recomendada'
                ],
                ...incRows
            ]);
            wsInc['!cols'] = [
                { wch: 15 }, { wch: 18 }, { wch: 18 }, { wch: 28 }, { wch: 12 }, { wch: 18 },
                { wch: 22 }, { wch: 18 }, { wch: 28 }, { wch: 22 }, { wch: 65 }
            ];
            XLSX.utils.book_append_sheet(wb, wsInc, '4_Inconsistencias_SALUS');

            const tag = new Date().toISOString().slice(0, 10);
            XLSX.writeFile(wb, `presupuesto_guardia_clinica_paola_garcia_${tag}.xlsx`);
            addToast?.('Libro Excel Presupuestario (4 hojas) descargado con éxito', 'success');
        } catch (err) {
            console.error('Error exportando Excel de Guardia Clínica:', err);
            addToast?.('Error al generar el Excel presupuestario', 'error');
        }
    };

    if (loading) {
        return (
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '48px 24px',
                textAlign: 'center',
                color: '#475569'
            }}>
                <RefreshCw size={28} className="animate-spin" style={{ color: '#1E40AF', margin: '0 auto 12px auto' }} />
                <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0F172A' }}>
                    Calculando Ocupación Proporcional por Horas y Auditoría de Admisiones (Dra. Paola García)...
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            {/* ─── ENCABEZADO EJECUTIVO & SUB-NAVEGACIÓN ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)'
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{
                                background: '#DBEAFE',
                                color: '#1E40AF',
                                fontSize: '0.68rem',
                                fontWeight: 800,
                                padding: '2px 8px',
                                borderRadius: '6px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.4px'
                            }}>
                                Criterio Presupuestario Gerencia
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>
                                Período evaluado: <strong style={{ color: '#0F172A' }}>{effectiveDateRange.label}</strong> ({kpis.diasCal} días calendario)
                            </span>
                        </div>
                        <h3 style={{ margin: '6px 0 2px 0', fontSize: '1.08rem', fontWeight: 800, color: '#0F172A' }}>
                            Admisiones de Guardia Clínica (Cabecera: Dra. Paola García) & Ocupación Proporcional por Horas
                        </h3>
                        <p style={{ margin: 0, fontSize: '0.78rem', color: '#475569' }}>
                            Regla proporcional exacta: <strong>Horas Netas Ocupadas ÷ 24 hs = Días Proporcionales</strong> (ej. 12 hs usadas en un día de 24 hs = <strong>0,50 días</strong>, sin importar cuántos pacientes rotaron en el box).
                        </p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                            type="button"
                            onClick={handleSyncFromSalus}
                            disabled={syncing}
                            style={{
                                padding: '8px 12px',
                                borderRadius: '8px',
                                border: '1px solid #BFDBFE',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: syncing ? 'wait' : 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px'
                            }}
                        >
                            <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
                            {syncing ? 'Sincronizando SALUS...' : 'Actualizar SALUS'}
                        </button>

                        <button
                            type="button"
                            onClick={handleExportExcel}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '8px',
                                border: '1px solid #059669',
                                background: '#059669',
                                color: '#FFFFFF',
                                fontWeight: 700,
                                fontSize: '0.78rem',
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '6px',
                                boxShadow: '0 1px 2px rgba(5, 150, 105, 0.2)'
                            }}
                        >
                            <FileSpreadsheet size={15} />
                            Excel Presupuesto Gerencia (4 Hojas)
                        </button>
                    </div>
                </div>

                {/* Selector de Vistas del Módulo */}
                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    borderTop: '1px solid #F1F5F9',
                    paddingTop: '12px'
                }}>
                    <div style={{
                        display: 'flex',
                        background: '#F8FAFC',
                        padding: '3px',
                        borderRadius: '8px',
                        border: '1px solid #E2E8F0',
                        gap: '4px',
                        flexWrap: 'wrap'
                    }}>
                        {[
                            {
                                id: 'presupuesto',
                                label: '📊 Ocupación Proporcional & Presupuesto (Boxes 24h)',
                                badge: `${kpis.diasProporcionalesSr} días (${kpis.pctOcupacionSr}%)`
                            },
                            {
                                id: 'auditoria',
                                label: '🚨 Auditoría de Inconsistencias SALUS',
                                badge: `${kpis.anomaliasCriticasYAdvertencias} desvíos`,
                                alert: kpis.anomaliasCriticasYAdvertencias > 0
                            },
                            {
                                id: 'padron',
                                label: '📋 Padrón Nominal Dra. Paola García',
                                badge: `${kpis.totalAdmisiones} adm.`
                            }
                        ].map(t => {
                            const active = viewTab === t.id;
                            return (
                                <button
                                    key={t.id}
                                    type="button"
                                    onClick={() => setViewTab(t.id)}
                                    style={{
                                        padding: '7px 13px',
                                        borderRadius: '6px',
                                        border: 'none',
                                        background: active ? '#1E40AF' : 'transparent',
                                        color: active ? '#FFFFFF' : '#334155',
                                        fontWeight: active ? 700 : 600,
                                        fontSize: '0.8rem',
                                        cursor: 'pointer',
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '7px',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <span>{t.label}</span>
                                    <span style={{
                                        padding: '1px 7px',
                                        borderRadius: '10px',
                                        fontSize: '0.7rem',
                                        fontWeight: 800,
                                        background: active
                                            ? 'rgba(255,255,255,0.22)'
                                            : t.alert
                                                ? '#FEE2E2'
                                                : '#E2E8F0',
                                        color: active
                                            ? '#FFFFFF'
                                            : t.alert
                                                ? '#991B1B'
                                                : '#334155'
                                    }}>
                                        {t.badge}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Simulador rápido de dotación de Boxes para Gerencia */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        background: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        borderRadius: '8px',
                        padding: '5px 10px'
                    }}>
                        <Sliders size={14} color="#1E40AF" />
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                            Dotación Boxes SR (Simulador):
                        </span>
                        {[2, 3, 4, 5].map(n => (
                            <button
                                key={n}
                                type="button"
                                onClick={() => handleSaveBoxesConfig(n)}
                                disabled={savingBoxes}
                                style={{
                                    padding: '2px 8px',
                                    borderRadius: '6px',
                                    border: boxesConfig === n ? '1px solid #1E40AF' : '1px solid #CBD5E1',
                                    background: boxesConfig === n ? '#1E40AF' : '#FFFFFF',
                                    color: boxesConfig === n ? '#FFFFFF' : '#334155',
                                    fontWeight: 800,
                                    fontSize: '0.74rem',
                                    cursor: 'pointer'
                                }}
                            >
                                {n} {n === 3 ? '(Real)' : ''}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════════════
                VISTA 1: PRESUPUESTO & OCUPACIÓN PROPORCIONAL POR HORAS
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'presupuesto' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {/* 1. TARJETAS KPI EJECUTIVAS */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(225px, 1fr))',
                        gap: '12px'
                    }}>
                        {/* KPI 1: Días Proporcionales Shock Room */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #BFDBFE',
                            borderLeft: '4px solid #1E40AF',
                            padding: '14px 16px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
                                Días Proporcionales Shock Room
                            </span>
                            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                                {kpis.diasProporcionalesSr.toLocaleString('es-AR')}
                                <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>
                                    / {kpis.diasDisponiblesSr} días disp.
                                </span>
                            </div>
                            <div style={{ fontSize: '0.74rem', color: '#334155', marginTop: '4px', fontWeight: 600 }}>
                                <strong>{kpis.horasNetasSr.toLocaleString('es-AR')} hs netas</strong> ÷ 24 hs ({boxesConfig} boxes × {kpis.diasCal} d)
                            </div>
                        </div>

                        {/* KPI 2: % Ocupación Proporcional Real */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            borderLeft: '4px solid #0284C7',
                            padding: '14px 16px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0369A1', textTransform: 'uppercase' }}>
                                % Ocupación Proporcional SR
                            </span>
                            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0369A1', marginTop: '4px' }}>
                                {kpis.pctOcupacionSr}%
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#475569', marginTop: '4px' }}>
                                Con casos sin box ({kpis.horasSinBox} hs): <strong>{kpis.pctOcupacionSrConSinBox}%</strong> ({kpis.diasPropSrConSinBox} d)
                            </div>
                        </div>

                        {/* KPI 3: Admisiones Guardia Clínica (Dra. Paola García) */}
                        <div
                            onClick={() => setViewTab('padron')}
                            style={{
                                background: '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                borderLeft: '4px solid #0D9488',
                                padding: '14px 16px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0F766E', textTransform: 'uppercase' }}>
                                Admisiones Dra. Paola García
                            </span>
                            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#0F172A', marginTop: '4px' }}>
                                {kpis.validasCount}
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>
                                    válidas ({kpis.excluidasCount} excluidas)
                                </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px' }}>
                                SR: <strong>{kpis.soloSrCount}</strong> · SR→Piso: <strong>{kpis.mixtoSrPisoCount}</strong> · Piso: <strong>{kpis.soloPisoCount}</strong>
                            </div>
                        </div>

                        {/* KPI 4: Estadía en Camas de Piso Clínico */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            borderLeft: '4px solid #10B981',
                            padding: '14px 16px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#047857', textTransform: 'uppercase' }}>
                                Tramos en Camas de Piso Clínico
                            </span>
                            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#047857', marginTop: '4px' }}>
                                {kpis.diasPropPiso.toLocaleString('es-AR')}
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#64748B', marginLeft: '6px' }}>
                                    días prop.
                                </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#475569', marginTop: '4px' }}>
                                <strong>{kpis.horasPiso.toLocaleString('es-AR')} hs</strong> en habitaciones de Internado (separadas de SR)
                            </div>
                        </div>

                        {/* KPI 5: Auditoría de Inconsistencias SALUS */}
                        <div
                            onClick={() => setViewTab('auditoria')}
                            style={{
                                background: kpis.anomaliasCriticasYAdvertencias > 0 ? '#FFFBEB' : '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #FDE68A',
                                borderLeft: '4px solid #D97706',
                                padding: '14px 16px',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#B45309', textTransform: 'uppercase' }}>
                                Auditoría sin Cama / Abiertas
                            </span>
                            <div style={{ fontSize: '1.65rem', fontWeight: 900, color: '#92400E', marginTop: '4px' }}>
                                {kpis.anomaliasCriticasYAdvertencias}
                                <span style={{ fontSize: '0.76rem', fontWeight: 700, color: '#B45309', marginLeft: '6px' }}>
                                    casos a auditar →
                                </span>
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#78350F', marginTop: '4px' }}>
                                Sin hab. c/atención: <strong>{kpis.inconsistenciasCount.SIN_HABITACION_CON_ATENCION}</strong> · Abiertas s/alta: <strong>{kpis.inconsistenciasCount.ABIERTA_OLVIDADA_SIN_ALTA}</strong>
                            </div>
                        </div>
                    </div>

                    {/* 2. COMPARADOR PEDAGÓGICO PARA GERENCIA: POR QUÉ CAMBIA EL NÚMERO */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #CBD5E1',
                        padding: '16px 20px',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
                        gap: '16px',
                        alignItems: 'center',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{
                            background: '#FEF2F2',
                            border: '1px solid #FECACA',
                            borderRadius: '10px',
                            padding: '14px 16px'
                        }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase' }}>
                                ❌ Conteo Tradicional Distorsionado (Por Paciente)
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#991B1B', marginTop: '4px' }}>
                                {kpis.diasTradicionalesSr.toLocaleString('es-AR')} días-cama aparentes
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#7F1D1D', marginTop: '4px', lineHeight: 1.4 }}>
                                Si 2 o 3 pacientes ingresan 3 hs cada uno al mismo box en el mismo día, el conteo tradicional sumaba <strong>2 o 3 días enteros en 1 solo box</strong> ({kpis.eventosMultiRotacion} eventos de rotación múltiple detectados).
                            </div>
                        </div>

                        <div style={{
                            background: '#EFF6FF',
                            border: '1px solid #BFDBFE',
                            borderRadius: '10px',
                            padding: '14px 16px'
                        }}>
                            <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
                                ✅ Criterio Proporcional Aprobado (Solo Horas ÷ 24)
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#1E40AF', marginTop: '4px' }}>
                                {kpis.diasProporcionalesSr.toLocaleString('es-AR')} días proporcionales reales
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#1E3A8A', marginTop: '4px', lineHeight: 1.4 }}>
                                Se miden únicamente las <strong>{kpis.horasNetasSr.toLocaleString('es-AR')} hs físicas ocupadas</strong> sobre 24 hs diarias: 12 hs usadas = <strong>0,50 días</strong> sin importar cuántos pacientes pasaron. Se depuraron <strong>{kpis.diasFantasmaDepurados.toLocaleString('es-AR')} días fantasma</strong>.
                            </div>
                        </div>
                    </div>

                    {/* 3. RESUMEN POR CADA BOX FÍSICO DE SHOCK ROOM + GRÁFICO EVOLUTIVO */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
                        gap: '16px'
                    }}>
                        {/* Tabla ejecutiva de los 3 Boxes */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '16px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '12px'
                        }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                    Rendimiento Proporcional por Box Físico (Base 24 hs = 1,00 Día)
                                </h4>
                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    Capacidad individual por box en el período: {kpis.diasCal} días ({kpis.diasCal * 24} hs)
                                </span>
                            </div>

                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left' }}>
                                            <th style={{ padding: '8px 10px', color: '#475569' }}>Unidad</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Horas Netas</th>
                                            <th style={{ padding: '8px 10px', color: '#1E40AF', textAlign: 'right' }}>Días Prop. (Hs/24)</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>% Ocupación</th>
                                            <th style={{ padding: '8px 10px', color: '#475569', textAlign: 'right' }}>Pacientes</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {kpis.boxSummary.map(b => (
                                            <tr key={b.unidad} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '9px 10px', fontWeight: 800, color: '#0F172A' }}>
                                                    ⚡ {b.unidad}
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 600, color: '#334155' }}>
                                                    {b.horasNetas.toLocaleString('es-AR')} hs
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                        prom. {b.horasPromedioPorDia} hs/día
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 900, color: '#1E40AF' }}>
                                                    {b.diasProporcionales.toLocaleString('es-AR')} d
                                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 500 }}>
                                                        de {b.diasDisponibles} d
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right' }}>
                                                    <span style={{
                                                        background: '#EFF6FF',
                                                        color: '#1E40AF',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800
                                                    }}>
                                                        {b.pctOcupacion}%
                                                    </span>
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', color: '#475569', fontWeight: 700 }}>
                                                    {b.rotacionesPacientes}
                                                    <div style={{ fontSize: '0.66rem', color: '#64748B', fontWeight: 500 }}>
                                                        {b.diasConMultiplesPacientes} d c/≥2 pac
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                        {kpis.horasSinBox > 0 && (
                                            <tr style={{ background: '#FFFBEB', borderBottom: '1px solid #FDE68A' }}>
                                                <td style={{ padding: '9px 10px', fontWeight: 800, color: '#92400E' }}>
                                                    ⚠️ Sin Box Asignado (400109)
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#92400E' }}>
                                                    {kpis.horasSinBox} hs
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 800, color: '#92400E' }}>
                                                    {kpis.diasPropSinBox} d
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontSize: '0.7rem', color: '#92400E', fontWeight: 700 }}>
                                                    Bolsa auditada
                                                </td>
                                                <td style={{ padding: '9px 10px', textAlign: 'right', fontWeight: 700, color: '#92400E' }}>
                                                    {kpis.sinHabConAtencionCount}
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        {/* Gráfico: Días Proporcionales vs Conteo Tradicional y % Ocupación */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '12px',
                            border: '1px solid #E2E8F0',
                            padding: '16px 18px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '10px'
                        }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                    Días Proporcionales Reales (Hs/24) vs. Conteo Tradicional
                                </h4>
                                <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                    Barras azules: Días Proporcionales Reales · Barras grises: Días aparentes por paciente · Línea verde: % Ocupación
                                </span>
                            </div>

                            <div style={{ width: '100%', height: '235px' }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={chartData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" vertical={false} />
                                        <XAxis dataKey="label" fontSize={11} stroke="#64748B" tickLine={false} />
                                        <YAxis yAxisId="days" fontSize={11} stroke="#1E40AF" tickLine={false} />
                                        <YAxis yAxisId="pct" orientation="right" fontSize={11} stroke="#059669" unit="%" tickLine={false} domain={[0, 100]} />
                                        <RechartsTooltip
                                            formatter={(value, name) => {
                                                if (name.includes('%')) return [`${value}%`, name];
                                                return [`${value} días`, name];
                                            }}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '0.73rem' }} />
                                        <Bar yAxisId="days" dataKey="diasTradicionales" name="Conteo Tradicional (Distorsionado)" fill="#CBD5E1" radius={[4, 4, 0, 0]} maxBarSize={26} />
                                        <Bar yAxisId="days" dataKey="diasProporcionales" name="Días Proporcionales Reales (Hs/24)" fill="#1E40AF" radius={[4, 4, 0, 0]} maxBarSize={26} />
                                        <Line yAxisId="pct" type="monotone" dataKey="pctOcupacion" name="% Ocupación Real SR" stroke="#059669" strokeWidth={2.5} dot={{ r: 3.5, fill: '#059669' }} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* 4. VERIFICADOR "CAJA DE CRISTAL": CRONOGRAMA DE 24 HORAS POR BOX */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        border: '1px solid #BFDBFE',
                        padding: '18px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '14px',
                        boxShadow: '0 2px 6px rgba(30, 64, 175, 0.05)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Clock size={18} color="#1E40AF" />
                                    <h4 style={{ margin: 0, fontSize: '0.96rem', fontWeight: 800, color: '#0F172A' }}>
                                        Auditoría Visual de 24 Horas por Box ("Caja de Cristal" para Gerencia)
                                    </h4>
                                </div>
                                <span style={{ fontSize: '0.75rem', color: '#475569' }}>
                                    Seleccioná cualquier día para verificar hora por hora qué pacientes ocuparon cada box y cómo la suma de sus horas se convierte en proporción de día (0,00 a 1,00 día).
                                </span>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#334155' }}>Día a inspeccionar:</span>
                                <input
                                    type="date"
                                    value={selectedInspectDate}
                                    min={effectiveDateRange.desde}
                                    max={effectiveDateRange.hasta}
                                    onChange={(e) => setSelectedInspectDate(e.target.value)}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #93C5FD',
                                        background: '#EFF6FF',
                                        color: '#1E3A8A',
                                        fontWeight: 800,
                                        fontSize: '0.78rem'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Accesos rápidos a días con alta rotación de pacientes en un mismo box */}
                        {highRotationDays.length > 0 && (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B' }}>
                                    Ejemplos reales de alta rotación en el período:
                                </span>
                                {highRotationDays.slice(0, 6).map(d => (
                                    <button
                                        key={d.fecha}
                                        type="button"
                                        onClick={() => setSelectedInspectDate(d.fecha)}
                                        style={{
                                            padding: '3px 9px',
                                            borderRadius: '6px',
                                            border: selectedInspectDate === d.fecha ? '1px solid #1E40AF' : '1px solid #CBD5E1',
                                            background: selectedInspectDate === d.fecha ? '#1E40AF' : '#F8FAFC',
                                            color: selectedInspectDate === d.fecha ? '#FFFFFF' : '#334155',
                                            fontSize: '0.71rem',
                                            fontWeight: 700,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        {formatDateDMY(d.fecha)} ({d.pacientesBoxes} pac → {d.diasPropTotal.toFixed(2)} d reales vs {d.diasTradTotal} d trad.)
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Regla de 24 horas para BOX 1-SR, BOX 2-SR y BOX 3-SR */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {inspectDayBoxes.map(box => (
                                <div
                                    key={box.unidad}
                                    style={{
                                        background: '#F8FAFC',
                                        border: '1px solid #E2E8F0',
                                        borderRadius: '10px',
                                        padding: '12px 14px',
                                        display: 'flex',
                                        flexDirection: 'column',
                                        gap: '8px'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{
                                                background: '#1E40AF',
                                                color: '#FFFFFF',
                                                padding: '2px 9px',
                                                borderRadius: '6px',
                                                fontSize: '0.76rem',
                                                fontWeight: 800
                                            }}>
                                                {box.unidad}
                                            </span>
                                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>
                                                {box.pacientesCount} {box.pacientesCount === 1 ? 'paciente atendido' : 'pacientes atendidos'} el {formatDateDMY(selectedInspectDate)}
                                            </span>
                                            {box.minSolapados >= 5 && (
                                                <span style={{
                                                    background: '#EDE9FE',
                                                    color: '#5B21B6',
                                                    padding: '1px 7px',
                                                    borderRadius: '6px',
                                                    fontSize: '0.68rem',
                                                    fontWeight: 700
                                                }}>
                                                    {box.minSolapados} min solapados deduplicados
                                                </span>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.78rem' }}>
                                            <span style={{ color: '#475569' }}>
                                                Ocupado: <strong>{box.horasNetas} hs</strong> / 24 hs (Libre: {box.horasLibres} hs)
                                            </span>
                                            <span style={{
                                                background: '#DCFCE7',
                                                color: '#166534',
                                                border: '1px solid #86EFAC',
                                                padding: '2px 9px',
                                                borderRadius: '6px',
                                                fontWeight: 900
                                            }}>
                                                = {box.diasProporcionales} días ({box.pctOcupacion}%)
                                            </span>
                                        </div>
                                    </div>

                                    {/* Barra proporcional 00:00 a 24:00 */}
                                    <div style={{
                                        position: 'relative',
                                        height: '30px',
                                        background: '#E2E8F0',
                                        borderRadius: '6px',
                                        overflow: 'hidden',
                                        border: '1px solid #CBD5E1'
                                    }}>
                                        {[6, 12, 18].map(hMark => (
                                            <div
                                                key={hMark}
                                                style={{
                                                    position: 'absolute',
                                                    left: `${(hMark / 24) * 100}%`,
                                                    top: 0,
                                                    bottom: 0,
                                                    borderLeft: '1px dashed #94A3B8',
                                                    zIndex: 1
                                                }}
                                            />
                                        ))}
                                        {box.tramos.map((t, idx) => {
                                            const leftPct = Math.max(0, Math.min(100, (t.min_inicio / 1440) * 100));
                                            const widthPct = Math.max(1.2, Math.min(100 - leftPct, ((t.min_fin - t.min_inicio) / 1440) * 100));
                                            const color = BOX_COLORS[idx % BOX_COLORS.length];
                                            return (
                                                <div
                                                    key={`${t.id_admision}-${idx}`}
                                                    title={`${t.paciente} (${t.numero_admision || 'S/N'}) · ${t.inicio_hm} a ${t.fin_hm} (${t.horas} hs = ${t.proporcion_dia} días)`}
                                                    style={{
                                                        position: 'absolute',
                                                        left: `${leftPct}%`,
                                                        width: `${widthPct}%`,
                                                        top: '2px',
                                                        bottom: '2px',
                                                        background: color,
                                                        borderRadius: '4px',
                                                        color: '#FFFFFF',
                                                        fontSize: '0.68rem',
                                                        fontWeight: 700,
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        overflow: 'hidden',
                                                        whiteSpace: 'nowrap',
                                                        padding: '0 4px',
                                                        zIndex: 2,
                                                        boxShadow: '0 1px 2px rgba(0,0,0,0.18)'
                                                    }}
                                                >
                                                    {widthPct > 10 ? `${t.inicio_hm}-${t.fin_hm} (${t.horas}h)` : ''}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.66rem', color: '#64748B', fontWeight: 600 }}>
                                        <span>00:00</span>
                                        <span>06:00</span>
                                        <span>12:00</span>
                                        <span>18:00</span>
                                        <span>24:00</span>
                                    </div>

                                    {box.tramos.length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '2px' }}>
                                            {box.tramos.map((t, idx) => (
                                                <span
                                                    key={`pill-${t.id_admision}-${idx}`}
                                                    style={{
                                                        background: '#FFFFFF',
                                                        border: '1px solid #CBD5E1',
                                                        borderLeft: `4px solid ${BOX_COLORS[idx % BOX_COLORS.length]}`,
                                                        borderRadius: '6px',
                                                        padding: '3px 8px',
                                                        fontSize: '0.72rem',
                                                        color: '#1E293B'
                                                    }}
                                                >
                                                    <strong>{t.inicio_hm}–{t.fin_hm}</strong> · {t.paciente} ({t.numero_admision}) → <strong>{t.horas} hs ({(t.horas / 24).toFixed(2)} d)</strong>
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
                VISTA 2: BANDEJA DE AUDITORÍA DE INCONSISTENCIAS SALUS
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'auditoria' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Resumen explicativo de las causas de Admisiones sin Habitación y Desvíos */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '10px'
                    }}>
                        {[
                            {
                                code: 'SIN_HABITACION_CON_ATENCION',
                                title: 'Sin Habitación c/Atención (400109)',
                                count: kpis.inconsistenciasCount.SIN_HABITACION_CON_ATENCION,
                                color: '#B45309',
                                bg: '#FFFBEB',
                                desc: 'Atendidos en Shock Room con registros en HC pero dados de alta sin asignarles BOX 1/2/3-SR.'
                            },
                            {
                                code: 'ABIERTA_OLVIDADA_SIN_ALTA',
                                title: 'Abiertas Olvidadas sin Alta',
                                count: kpis.inconsistenciasCount.ABIERTA_OLVIDADA_SIN_ALTA,
                                color: '#991B1B',
                                bg: '#FEF2F2',
                                desc: 'Admisiones nunca cerradas en SALUS (> 48h en SR/Sin cama). Excluidas para no inflar cientos de horas.'
                            },
                            {
                                code: 'INTERNACION_SUSPENDIDA',
                                title: 'Internación Suspendida (< 1h)',
                                count: kpis.inconsistenciasCount.INTERNACION_SUSPENDIDA,
                                color: '#9A3412',
                                bg: '#FFF7ED',
                                desc: 'Abiertas en ventanilla y suspendidas antes de ocupar cama ni recibir evolución médica. Excluidas.'
                            },
                            {
                                code: 'SERVICIO_INCORRECTO_CHEQUEO',
                                title: 'Error Servicio (CHEQUEO)',
                                count: kpis.inconsistenciasCount.SERVICIO_INCORRECTO_CHEQUEO,
                                color: '#991B1B',
                                bg: '#FEF2F2',
                                desc: 'Pacientes ambulatorios de Chequeo Preventivo (A-CE...) imputados por error a Dra. Paola García.'
                            },
                            {
                                code: 'SERVICIO_MAL_IMPUTADO_SR',
                                title: 'Box SR con Servicio Piso',
                                count: kpis.inconsistenciasCount.SERVICIO_MAL_IMPUTADO_SR,
                                color: '#0369A1',
                                bg: '#F0F9FF',
                                desc: 'Estancias breves en BOX SR con Servicio INTERNACION CLINICA (reclasificadas a SR y quitadas de Piso).'
                            },
                            {
                                code: 'SOLAPAMIENTO_HORARIO_BOX',
                                title: 'Solapamientos en Mismo Box',
                                count: kpis.inconsistenciasCount.SOLAPAMIENTO_HORARIO_BOX,
                                color: '#5B21B6',
                                bg: '#F5F3FF',
                                desc: 'Demora en alta administrativa que pisó el ingreso del siguiente paciente (minutos deduplicados).'
                            }
                        ].map(card => {
                            const selected = inconsistenciaFilter === card.code;
                            return (
                                <div
                                    key={card.code}
                                    onClick={() => setInconsistenciaFilter(selected ? 'TODAS_OBSERVADAS' : card.code)}
                                    style={{
                                        background: selected ? card.bg : '#FFFFFF',
                                        borderRadius: '10px',
                                        border: selected ? `2px solid ${card.color}` : '1px solid #E2E8F0',
                                        padding: '12px 14px',
                                        cursor: 'pointer',
                                        transition: 'all 0.15s ease'
                                    }}
                                >
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontSize: '0.73rem', fontWeight: 800, color: card.color }}>
                                            {card.title}
                                        </span>
                                        <span style={{
                                            background: card.bg,
                                            color: card.color,
                                            padding: '2px 8px',
                                            borderRadius: '8px',
                                            fontWeight: 900,
                                            fontSize: '0.88rem'
                                        }}>
                                            {card.count}
                                        </span>
                                    </div>
                                    <p style={{ margin: '6px 0 0 0', fontSize: '0.71rem', color: '#475569', lineHeight: 1.35 }}>
                                        {card.desc}
                                    </p>
                                </div>
                            );
                        })}
                    </div>

                    {/* Barra de filtro de Auditoría */}
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Mostrar:</span>
                            <select
                                value={inconsistenciaFilter}
                                onChange={(e) => setInconsistenciaFilter(e.target.value)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    background: '#F8FAFC'
                                }}
                            >
                                <option value="CRITICAS_SIN_HAB">🚨 Críticas: Sin Habitación, Abiertas sin Alta, Suspendidas y Chequeos ({kpis.anomaliasCriticasYAdvertencias})</option>
                                <option value="TODAS_OBSERVADAS">📋 Todas las Observaciones (incluye Servicio Piso en SR y Solapamientos)</option>
                                <option value="SIN_HABITACION_CON_ATENCION">⚠️ Sin Habitación con Atención Real ({kpis.inconsistenciasCount.SIN_HABITACION_CON_ATENCION})</option>
                                <option value="ABIERTA_OLVIDADA_SIN_ALTA">🛑 Abiertas sin Alta Administrativa ({kpis.inconsistenciasCount.ABIERTA_OLVIDADA_SIN_ALTA})</option>
                                <option value="INTERNACION_SUSPENDIDA">⏸️ Internaciones Suspendidas ({kpis.inconsistenciasCount.INTERNACION_SUSPENDIDA})</option>
                                <option value="SERVICIO_INCORRECTO_CHEQUEO">❌ Error Servicio CHEQUEO ({kpis.inconsistenciasCount.SERVICIO_INCORRECTO_CHEQUEO})</option>
                                <option value="SERVICIO_MAL_IMPUTADO_SR">ℹ️ Box SR con Servicio INTERNACION CLINICA ({kpis.inconsistenciasCount.SERVICIO_MAL_IMPUTADO_SR})</option>
                                <option value="SOLAPAMIENTO_HORARIO_BOX">⏱️ Solapamiento Horario en Box ({kpis.inconsistenciasCount.SOLAPAMIENTO_HORARIO_BOX})</option>
                            </select>
                        </div>

                        <div style={{ position: 'relative', width: '280px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar paciente, admisión, NHC..."
                                style={{
                                    width: '100%',
                                    padding: '6px 10px 6px 30px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem'
                                }}
                            />
                        </div>
                    </div>

                    {/* Tabla de Inconsistencias */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '540px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Admisión / Fechas</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Paciente</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Habitación & Servicio SALUS</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Horas SALUS vs. Presupuesto</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Clasificación y Diagnóstico Forense</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredInconsistencias.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#64748B' }}>
                                                No hay registros observados para el filtro seleccionado en este período.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInconsistencias.slice(0, 300).map(a => {
                                            const meta = INCONSISTENCIA_META[a.inconsistencia_codigo] || INCONSISTENCIA_META.OK;
                                            return (
                                                <tr
                                                    key={a.id_admision}
                                                    onClick={() => setSelectedAdmDetail(a)}
                                                    style={{ borderBottom: '1px solid #F1F5F9', cursor: 'pointer' }}
                                                >
                                                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontWeight: 800, color: '#1E40AF' }}>
                                                            {a.numero_admision || `ID ${a.id_admision}`}
                                                        </div>
                                                        <div style={{ fontSize: '0.71rem', color: '#334155' }}>
                                                            Ing: {formatDateTimeShort(a.fecha_ingreso)}
                                                        </div>
                                                        <div style={{ fontSize: '0.71rem', color: a.fecha_alta ? '#64748B' : '#DC2626', fontWeight: a.fecha_alta ? 500 : 800 }}>
                                                            Alta: {formatDateTimeShort(a.fecha_alta)}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 800, color: '#0F172A' }}>{a.paciente}</div>
                                                        <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                                                            NHC: {a.nhc || '-'} · DNI: {a.dni || '-'}
                                                        </div>
                                                        <div style={{ fontSize: '0.69rem', color: '#64748B' }}>{a.obra_social}</div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontWeight: 800,
                                                            fontSize: '0.74rem',
                                                            background: a.habitacion_salus ? '#EFF6FF' : '#FEE2E2',
                                                            color: a.habitacion_salus ? '#1E40AF' : '#991B1B'
                                                        }}>
                                                            {a.habitacion_salus || 'SIN HABITACIÓN'}
                                                        </span>
                                                        <div style={{ fontSize: '0.71rem', color: '#475569', marginTop: '3px' }}>
                                                            Serv: <strong>{a.servicio_salus || 'S/D'}</strong>
                                                        </div>
                                                        {a.proceso_salus && (
                                                            <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                                {a.proceso_salus}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                                                            Brutas SALUS: <strong>{Number(a.horas_brutas_salus || 0).toLocaleString('es-AR')} hs</strong>
                                                        </div>
                                                        <div style={{
                                                            fontSize: '0.76rem',
                                                            fontWeight: 800,
                                                            color: a.incluida_en_presupuesto ? '#047857' : '#991B1B',
                                                            marginTop: '2px'
                                                        }}>
                                                            {a.incluida_en_presupuesto
                                                                ? `Presupuesto: ${a.horas_presupuesto_total} hs (${a.dias_proporcionales_total} d)`
                                                                : 'Excluida (0,00 días)'}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', maxWidth: '380px' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 800,
                                                            background: meta.badgeBg,
                                                            color: meta.badgeColor,
                                                            border: `1px solid ${meta.border}`,
                                                            marginBottom: '4px'
                                                        }}>
                                                            {meta.label}
                                                        </span>
                                                        <div style={{ fontSize: '0.73rem', color: '#334155', lineHeight: 1.35 }}>
                                                            {a.inconsistencia_detalle}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════════════════════════════════════════════════════════════════════════
                VISTA 3: PADRÓN NOMINAL COMPLETO (DRA. PAOLA GARCÍA)
               ═══════════════════════════════════════════════════════════════════════════ */}
            {viewTab === 'padron' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
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
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Régimen Físico:</span>
                            <select
                                value={regimenFilter}
                                onChange={(e) => setRegimenFilter(e.target.value)}
                                style={{
                                    padding: '6px 10px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem',
                                    fontWeight: 700,
                                    color: '#0F172A',
                                    background: '#F8FAFC'
                                }}
                            >
                                <option value="TODOS">Todas las Admisiones ({periodAdmisiones.length})</option>
                                <option value="SOLO_VALIDAS">✅ Incluidas en Presupuesto ({kpis.validasCount})</option>
                                <option value="SHOCK_ROOM">⚡ Exclusivas en Box Shock Room ({kpis.soloSrCount})</option>
                                <option value="MIXTO_SR_PISO">🔄 Mixtas: Shock Room → Subieron a Piso ({kpis.mixtoSrPisoCount})</option>
                                <option value="PISO_CLINICO">🛏️ Directas en Camas de Piso ({kpis.soloPisoCount})</option>
                                <option value="SIN_HABITACION">⚠️ Sin Habitación Asignada ({periodAdmisiones.filter(x => x.regimen_ubicacion === 'SIN_HABITACION').length})</option>
                                <option value="SOLO_EXCLUIDAS">🚫 Excluidas por Auditoría ({kpis.excluidasCount})</option>
                            </select>
                        </div>

                        <div style={{ position: 'relative', width: '300px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Buscar paciente, N° admisión, NHC, box, obra social..."
                                style={{
                                    width: '100%',
                                    padding: '6px 10px 6px 30px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.78rem'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '580px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.79rem', textAlign: 'left' }}>
                                <thead style={{ position: 'sticky', top: 0, background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', zIndex: 2 }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>N° Admisión & Horario</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Paciente</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Ubicación / Régimen</th>
                                        <th style={{ padding: '10px 12px', color: '#1E40AF', textAlign: 'right' }}>Horas & Días SR</th>
                                        <th style={{ padding: '10px 12px', color: '#047857', textAlign: 'right' }}>Horas & Días Piso</th>
                                        <th style={{ padding: '10px 12px', color: '#475569' }}>Estado Auditoría</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredPadron.slice(0, 300).map(a => {
                                        const meta = INCONSISTENCIA_META[a.inconsistencia_codigo] || INCONSISTENCIA_META.OK;
                                        return (
                                            <tr
                                                key={a.id_admision}
                                                onClick={() => setSelectedAdmDetail(a)}
                                                style={{
                                                    borderBottom: '1px solid #F1F5F9',
                                                    background: a.incluida_en_presupuesto ? '#FFFFFF' : '#FEF2F2',
                                                    cursor: 'pointer'
                                                }}
                                            >
                                                <td style={{ padding: '9px 12px', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: 800, color: '#0F172A' }}>
                                                        {a.numero_admision || a.id_admision}
                                                    </div>
                                                    <div style={{ fontSize: '0.71rem', color: '#475569' }}>
                                                        {formatDateTimeShort(a.fecha_ingreso)}
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                        → {formatDateTimeShort(a.fecha_alta)}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 12px' }}>
                                                    <div style={{ fontWeight: 800, color: '#0F172A' }}>{a.paciente}</div>
                                                    <div style={{ fontSize: '0.71rem', color: '#64748B' }}>
                                                        NHC: {a.nhc || '-'} · {a.obra_social}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 12px' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        background: '#EFF6FF',
                                                        color: '#1E40AF',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        fontWeight: 800,
                                                        fontSize: '0.74rem'
                                                    }}>
                                                        {a.habitacion_salus || 'SIN HABITACIÓN'}
                                                    </span>
                                                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '2px' }}>
                                                        {a.regimen_ubicacion} · {a.servicio_salus}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: 800, color: '#1E40AF' }}>
                                                        {Number(a.dias_proporcionales_sr || 0).toFixed(2)} d
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                        {Number(a.horas_shock_room || 0)} hs
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    <div style={{ fontWeight: 800, color: '#047857' }}>
                                                        {Number(a.dias_proporcionales_piso || 0).toFixed(2)} d
                                                    </div>
                                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                        {Number(a.horas_piso || 0)} hs
                                                    </div>
                                                </td>
                                                <td style={{ padding: '9px 12px' }}>
                                                    <span style={{
                                                        display: 'inline-block',
                                                        padding: '2px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '0.7rem',
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
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL DE TRAZABILIDAD DE TRAMOS POR ADMISIÓN ─── */}
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
                        padding: '16px',
                        backdropFilter: 'blur(2px)'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '14px',
                            width: '100%',
                            maxWidth: '680px',
                            maxHeight: '88vh',
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
                        }}
                    >
                        <div style={{
                            padding: '16px 20px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#1E40AF', textTransform: 'uppercase' }}>
                                    Trazabilidad Horaria de Admisión · Cabecera Dra. Paola García
                                </span>
                                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                                    {selectedAdmDetail.paciente} ({selectedAdmDetail.numero_admision || selectedAdmDetail.id_admision})
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedAdmDetail(null)}
                                style={{
                                    border: '1px solid #CBD5E1',
                                    background: '#FFFFFF',
                                    borderRadius: '8px',
                                    width: '32px',
                                    height: '32px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div style={{ padding: '18px 20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', fontSize: '0.78rem' }}>
                                <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 700 }}>INGRESO SALUS</div>
                                    <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{formatDateTimeShort(selectedAdmDetail.fecha_ingreso)}</div>
                                </div>
                                <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                    <div style={{ color: '#64748B', fontSize: '0.68rem', fontWeight: 700 }}>ALTA SALUS</div>
                                    <div style={{ fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{formatDateTimeShort(selectedAdmDetail.fecha_alta)}</div>
                                </div>
                                <div style={{ background: '#EFF6FF', padding: '10px', borderRadius: '8px', border: '1px solid #BFDBFE' }}>
                                    <div style={{ color: '#1E40AF', fontSize: '0.68rem', fontWeight: 700 }}>OCUPACIÓN PROPORCIONAL</div>
                                    <div style={{ fontWeight: 900, color: '#1E40AF', marginTop: '2px' }}>
                                        {selectedAdmDetail.dias_proporcionales_total} días ({selectedAdmDetail.horas_presupuesto_total} hs)
                                    </div>
                                </div>
                            </div>

                            {selectedAdmDetail.inconsistencia_detalle && (
                                <div style={{
                                    background: '#FFFBEB',
                                    border: '1px solid #FDE68A',
                                    borderRadius: '8px',
                                    padding: '10px 12px',
                                    fontSize: '0.78rem',
                                    color: '#92400E'
                                }}>
                                    <strong>Auditoría SALUS:</strong> {selectedAdmDetail.inconsistencia_detalle}
                                </div>
                            )}

                            <div>
                                <div style={{ fontSize: '0.76rem', fontWeight: 800, color: '#334155', marginBottom: '6px' }}>
                                    Tramos Físicos Registrados (Historial de Camas):
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {(selectedAdmDetail.tramos_json || []).map((t, idx) => (
                                        <div
                                            key={idx}
                                            style={{
                                                background: '#F8FAFC',
                                                border: '1px solid #E2E8F0',
                                                borderRadius: '8px',
                                                padding: '8px 12px',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                fontSize: '0.78rem'
                                            }}
                                        >
                                            <div>
                                                <strong style={{ color: '#1E40AF' }}>{t.unidad}</strong> ({t.tipo})
                                                <div style={{ fontSize: '0.7rem', color: '#64748B' }}>
                                                    {formatDateTimeShort(t.inicio)} → {formatDateTimeShort(t.fin)}
                                                </div>
                                            </div>
                                            <div style={{ textAlign: 'right', fontWeight: 800, color: '#0F172A' }}>
                                                {t.horas} hs = {Number(t.dias_prop || 0).toFixed(3)} días
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {selectedAdmDetail.tiene_ficha_557 && onOpenFicha557ById && (
                                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const idVis = selectedAdmDetail.id_visita_557;
                                            const nhc = selectedAdmDetail.nhc;
                                            const dni = selectedAdmDetail.dni;
                                            setSelectedAdmDetail(null);
                                            onOpenFicha557ById({ id_visita_557: idVis, nhc, dni });
                                        }}
                                        style={{
                                            padding: '7px 14px',
                                            borderRadius: '8px',
                                            border: '1px solid #1E40AF',
                                            background: '#1E40AF',
                                            color: '#FFFFFF',
                                            fontWeight: 700,
                                            fontSize: '0.78rem',
                                            cursor: 'pointer'
                                        }}
                                    >
                                        📝 Ver Valoración Clínica Protocolo 557 Asociada
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
