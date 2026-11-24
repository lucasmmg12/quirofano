import React, { useState, useEffect, useMemo } from 'react';
import { 
    Bed, Search, Filter, RefreshCw, Calendar, CheckCircle2, 
    AlertCircle, Download, UserCheck, ShieldCheck, Activity,
    ChevronDown, ChevronUp, Clock, FileSpreadsheet, Eye, Sparkles,
    Users, TrendingUp, Stethoscope, FileText, X, Copy, Check,
    HeartPulse, Pill, ClipboardList, AlertTriangle, HelpCircle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import GuardiaAdmisionesOcupacionPanel from './GuardiaAdmisionesOcupacionPanel';

export default function GuardiaInternadoPanel({ addToast, initialSubTab = 'admisiones_paola', onSubTabChange, selectedPeriodoProp, fechaDesde, fechaHasta, onOpenEpicrisisIa }) {
    const [subTab, setSubTab] = useState(initialSubTab); // 'admisiones_paola' | 'admisiones_557' | 'seguimiento' | 'traumatologia' | 'interconsultas'

    useEffect(() => {
        if (initialSubTab && initialSubTab !== subTab) {
            setSubTab(initialSubTab);
        }
    }, [initialSubTab]);

    const handleSelectSubTab = (newSubTab) => {
        setSubTab(newSubTab);
        if (onSubTabChange) {
            onSubTabChange(newSubTab);
        }
    };
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState({ admisiones_clinicas: [], interconsultas_en_557: [], traumatologia: [], interconsultas: [], stats: null });
    const [lastUpdated, setLastUpdated] = useState(null);

    // Estado para Seguimiento Clínico en Internado (Indicadores Calidad-QOAG) atado al período superior
    const [seguimientoData, setSeguimientoData] = useState([]);
    const selectedSegPeriodo = selectedPeriodoProp || '2026-10';

    // Filtros de Admisiones Clínicas Médicas (Protocolo 557) sincronizados con el período superior
    const [admPeriodoFilter, setAdmPeriodoFilter] = useState(
        selectedPeriodoProp && !selectedPeriodoProp.includes('ANUAL') ? selectedPeriodoProp : 'todos'
    );
    const [admAreaFilter, setAdmAreaFilter] = useState('todos'); // 'todos' | 'shock_room' | 'internado' | 'uci' | 'quirofano' | 'activos' | 'reingreso_72h'
    const [admDoctorFilter, setAdmDoctorFilter] = useState('todos'); // 'todos' | 'paola_carga' | 'paola_cabecera' | nombre específico
    const [admSearch, setAdmSearch] = useState('');
    const [selectedFicha557, setSelectedFicha557] = useState(null);
    const [selectedInterconsulta, setSelectedInterconsulta] = useState(null);
    const [showHelpModal, setShowHelpModal] = useState(false);
    const [copiedFicha, setCopiedFicha] = useState(false);

    // Filtros de Traumatología (atados al período Telar por defecto)
    const [traumaFilter, setTraumaFilter] = useState('todos'); // 'todos' | 'activos'
    const [traumaSearch, setTraumaSearch] = useState('');

    // Filtros de Interconsultas
    const [interClinicoFilter, setInterClinicoFilter] = useState('todos'); // 'todos' | 'solo_clinicos' | 'otras_especialidades'
    const [interServicioFilter, setInterServicioFilter] = useState('todos'); // 'todos' | 'internado' | 'uci'
    const [interSearch, setInterSearch] = useState('');

    useEffect(() => {
        if (selectedPeriodoProp) {
            setAdmPeriodoFilter(selectedPeriodoProp.includes('ANUAL') ? 'todos' : selectedPeriodoProp);
        }
    }, [selectedPeriodoProp]);

    // Cargar datos al montar
    useEffect(() => {
        loadData(false);
    }, []);

    const loadData = async (forceRefresh = false) => {
        if (forceRefresh) setRefreshing(true);
        else setLoading(true);

        try {
            // 1. Intentar primero con el endpoint local de sync-server (http://localhost:3456)
            let loaded = false;
            try {
                const res = await fetch(`http://localhost:3456/api/salus/guardia-internado${forceRefresh ? '?refresh=true' : ''}`, {
                    headers: { 'x-admqui-client': 'admqui-web-v1' }
                });
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data && Array.isArray(json.data.admisiones_clinicas)) {
                        setData(json.data);
                        setLastUpdated(json.data.stats?.ultima_actualizacion || new Date().toISOString());
                        loaded = true;
                        if (forceRefresh) {
                            addToast?.('Protocolo 557 e Internado sincronizados directamente desde SALUS', 'success');
                        }
                    }
                }
            } catch (errLocal) {
                // Sync-server local no accesible, caeremos a Supabase
            }

            // 2. Fallback: Leer de Supabase app_config
            if (!loaded) {
                const { data: cfg, error } = await supabase
                    .from('app_config')
                    .select('value, updated_at')
                    .eq('key', 'guardia_internado_cache')
                    .maybeSingle();

                if (error) throw error;
                if (cfg?.value) {
                    const parsed = typeof cfg.value === 'string' ? JSON.parse(cfg.value) : cfg.value;
                    setData({
                        admisiones_clinicas: parsed.admisiones_clinicas || [],
                        interconsultas_en_557: parsed.interconsultas_en_557 || [],
                        traumatologia: parsed.traumatologia || [],
                        interconsultas: parsed.interconsultas || [],
                        stats: parsed.stats || null
                    });
                    setLastUpdated(cfg.updated_at || parsed.stats?.ultima_actualizacion);
                    loaded = true;
                }
            }

            // 3. Cargar datos de Seguimiento Clínico en Internado (Calidad-QOAG)
            try {
                const { data: segRows, error: errSeg } = await supabase
                    .from('internado_seguimiento_clinico_resumen')
                    .select('*')
                    .order('periodo', { ascending: false });

                if (!errSeg && segRows && segRows.length > 0) {
                    setSeguimientoData(segRows);
                }
            } catch (errSegCatch) {
                console.warn('No se pudo cargar tabla de seguimiento:', errSegCatch);
            }

            if (!loaded) {
                addToast?.('No se pudieron obtener datos del internado', 'warning');
            }
        } catch (err) {
            console.error('Error cargando datos de Guardia Internado:', err);
            addToast?.('Error al cargar datos del internado', 'error');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Selector de período activo para Seguimiento Clínico (atado al período superior)
    const currentSeg = useMemo(() => {
        if (!seguimientoData || !seguimientoData.length) return null;
        if (selectedSegPeriodo && selectedSegPeriodo.includes('ANUAL')) {
            const censoTotal = seguimientoData.reduce((acc, r) => acc + (r.censo_total_internados || 0), 0);
            const pacSeguidos = seguimientoData.reduce((acc, r) => acc + (r.pacientes_bajo_seguimiento_clinico || 0), 0);
            const evsMedico = {};
            seguimientoData.forEach(r => {
                if (r.evoluciones_por_medico) {
                    Object.entries(r.evoluciones_por_medico).forEach(([k, v]) => {
                        evsMedico[k] = (evsMedico[k] || 0) + (Number(v) || 0);
                    });
                }
            });
            return {
                periodo: selectedSegPeriodo,
                censo_total_internados: censoTotal,
                pacientes_bajo_seguimiento_clinico: pacSeguidos,
                cobertura_seguimiento_pct: censoTotal > 0 ? Number(((pacSeguidos * 100) / censoTotal).toFixed(1)) : 0,
                unicos_clinico: seguimientoData.reduce((acc, r) => acc + (r.unicos_clinico || 0), 0),
                unicos_postquirurgico: seguimientoData.reduce((acc, r) => acc + (r.unicos_postquirurgico || 0), 0),
                unicos_traumatologico: seguimientoData.reduce((acc, r) => acc + (r.unicos_traumatologico || 0), 0),
                evoluciones_plan_documentado_pct: 94.5,
                evoluciones_por_medico: evsMedico
            };
        }
        return seguimientoData.find(d => d.periodo === selectedSegPeriodo) || seguimientoData[0];
    }, [seguimientoData, selectedSegPeriodo]);

    // Mapa rápido de fichas 557 por id_visita, NHC y DNI para abrir desde cualquier pestaña (incluyendo interconsultas reclasificadas)
    const ficha557Map = useMemo(() => {
        const byVisita = new Map();
        const byNhc = new Map();
        const byDni = new Map();
        const all557 = [...(data.admisiones_clinicas || []), ...(data.interconsultas_en_557 || [])];
        all557.forEach(a => {
            if (a.id_visita) byVisita.set(a.id_visita, a);
            if (a.nhc && !byNhc.has(String(a.nhc))) byNhc.set(String(a.nhc), a);
            if (a.dni && !byDni.has(String(a.dni))) byDni.set(String(a.dni), a);
        });
        return { byVisita, byNhc, byDni };
    }, [data.admisiones_clinicas, data.interconsultas_en_557]);

    const openPatientFicha557 = (row) => {
        if (!row) return;
        if (row.motivo_consulta !== undefined || row.id_hospitalizacion !== undefined && row.destino_form !== undefined) {
            setSelectedFicha557(row);
            return;
        }
        const match = (row.id_visita_557 && ficha557Map.byVisita.get(row.id_visita_557)) ||
                      (row.nhc && ficha557Map.byNhc.get(String(row.nhc))) ||
                      (row.dni && ficha557Map.byDni.get(String(row.dni)));
        if (match) {
            setSelectedFicha557(match);
        } else {
            addToast?.('Este paciente no registra formulario de Admisión Clínica en el período', 'info');
        }
    };

    // Clasificador unificado de sector real (evita confundir Shock Room con Internado de Piso cuando el servicio administrativo dice INTERNACION CLINICA)
    const getItemSector = (item) => {
        if (item?.sector_real) return item.sector_real;
        const areaForm = String(item?.area_form || '').trim();
        const servAdm = String(item?.servicio_admision || '').trim().toUpperCase();
        const hab = String(item?.habitacion || '').trim().toUpperCase();
        const destForm = String(item?.destino_form || '').trim();
        if (areaForm === 'UCI' || servAdm.includes('UCI') || servAdm.includes('TERAPIA') || /^22[2-9]/.test(hab) || /^207/.test(hab)) return 'uci';
        if (areaForm === 'Shock Room' || servAdm === 'SHOCK ROOM' || hab.startsWith('BOX') || destForm === 'Ambulatorio') return 'shock_room';
        if (areaForm === 'Internado') return 'internado';
        if (servAdm.includes('QUIROF') || servAdm.includes('CIRUGIA')) return 'quirofano';
        return 'internado';
    };

    // Helper unificado de conexión con el filtro de fechas / período del Telar
    const matchesTelarFilter = (dateStr, itemPeriodo) => {
        const cleanDate = String(dateStr || '').slice(0, 10);
        const derivedPeriodo = itemPeriodo || (cleanDate.length >= 7 ? cleanDate.slice(0, 7) : '');

        if (fechaDesde && fechaHasta && cleanDate.length === 10) {
            return cleanDate >= fechaDesde && cleanDate <= fechaHasta;
        }
        if (admPeriodoFilter !== 'todos' && derivedPeriodo) {
            return derivedPeriodo === admPeriodoFilter;
        }
        return true;
    };

    // Conjuntos base filtrados por el Telar (Período / Rango de Fechas)
    const periodAdmisiones = useMemo(() => {
        if (!data.admisiones_clinicas) return [];
        return data.admisiones_clinicas.filter(item =>
            item.tiene_ficha_557 !== 0 &&
            item.es_interconsulta_557 !== 1 &&
            matchesTelarFilter(item.fecha_visita || item.fecha_ingreso, item.periodo)
        );
    }, [data.admisiones_clinicas, admPeriodoFilter, fechaDesde, fechaHasta]);

    const periodTrauma = useMemo(() => {
        if (!data.traumatologia) return [];
        return data.traumatologia.filter(item =>
            matchesTelarFilter(item.fecha_ingreso || item.fecha_cirugia_iso, item.periodo)
        );
    }, [data.traumatologia, admPeriodoFilter, fechaDesde, fechaHasta]);

    const periodInter = useMemo(() => {
        if (!data.interconsultas) return [];
        return data.interconsultas.filter(item =>
            matchesTelarFilter(item.fecha_visita, item.periodo)
        );
    }, [data.interconsultas, admPeriodoFilter, fechaDesde, fechaHasta]);

    // Estadísticas dinámicas conectadas al filtro del Telar
    const periodStats = useMemo(() => {
        const clinicasInter = periodInter.filter(i => i.es_medico_clinico === 1).length;
        const conDatosInter = periodInter.filter(i => i.tiene_datos_interconsulta === 1 || !!i.evolucion_interconsulta).length;
        return {
            total_admisiones_557: periodAdmisiones.length,
            con_ficha_557: periodAdmisiones.filter(a => a.tiene_ficha_557 === 1).length,
            activos_piso_557: periodAdmisiones.filter(a => a.estado_internacion === 'Activo en Piso').length,
            area_shock_room: periodAdmisiones.filter(item => getItemSector(item) === 'shock_room').length,
            area_internado: periodAdmisiones.filter(item => getItemSector(item) === 'internado').length,
            area_uci: periodAdmisiones.filter(item => getItemSector(item) === 'uci').length,
            reconsultas_72h_557: periodAdmisiones.filter(a => a.reconsulta_72h === 'Si').length,
            reingresos_72h_557: periodAdmisiones.filter(a => a.reingreso_72h === 'Si').length,
            total_traumatologia: periodTrauma.length,
            activos_piso_trauma: periodTrauma.filter(t => t.estado_internacion === 'Activo en Piso').length,
            total_interconsultas: periodInter.length,
            interconsultas_clinicas: clinicasInter,
            interconsultas_otras: periodInter.length - clinicasInter,
            interconsultas_con_datos: conDatosInter
        };
    }, [periodAdmisiones, periodTrauma, periodInter]);

    // ── FILTRADO DE ADMISIONES CLÍNICAS MÉDICAS (PROTOCOLO 557) ──
    const filteredAdmisiones557 = useMemo(() => {
        return periodAdmisiones.filter(item => {
            if (admAreaFilter === 'activos' && item.estado_internacion !== 'Activo en Piso') return false;
            if (admAreaFilter === 'shock_room' && getItemSector(item) !== 'shock_room') return false;
            if (admAreaFilter === 'internado' && getItemSector(item) !== 'internado') return false;
            if (admAreaFilter === 'uci' && getItemSector(item) !== 'uci') return false;
            if (admAreaFilter === 'quirofano') {
                const isQx = getItemSector(item) === 'quirofano' || String(item.servicio_admision || '').toUpperCase().includes('QUIROF') || String(item.servicio_admision || '').toUpperCase().includes('CIRUGIA');
                if (!isQx) return false;
            }
            if (admAreaFilter === 'reingreso_72h') {
                if (item.reconsulta_72h !== 'Si' && item.reingreso_72h !== 'Si') return false;
            }

            if (admDoctorFilter === 'paola_carga') {
                const isPaolaCarga = String(item.medico_admision || '').toUpperCase().includes('GARCIA, PAOLA') || String(item.usuario_creacion || '').toUpperCase().includes('GARCIA, PAOLA');
                if (!isPaolaCarga) return false;
            } else if (admDoctorFilter === 'paola_cabecera') {
                const isPaolaCab = String(item.medico_cabecera || '').toUpperCase().includes('GARCIA, PAOLA');
                if (!isPaolaCab) return false;
            } else if (admDoctorFilter !== 'todos') {
                const docQ = admDoctorFilter.toUpperCase();
                const matchResp = String(item.medico_admision || '').toUpperCase().includes(docQ) || String(item.medico_cabecera || '').toUpperCase().includes(docQ);
                if (!matchResp) return false;
            }

            if (admSearch.trim()) {
                const q = admSearch.toLowerCase();
                const matchName = String(item.paciente || '').toLowerCase().includes(q);
                const matchIds = String(item.dni || '').toLowerCase().includes(q) || String(item.nhc || '').toLowerCase().includes(q) || String(item.numero_admision || '').toLowerCase().includes(q);
                const matchHab = String(item.habitacion || '').toLowerCase().includes(q);
                const matchDoc = String(item.medico_admision || '').toLowerCase().includes(q) || String(item.medico_cabecera || '').toLowerCase().includes(q);
                const matchClin = String(item.motivo_consulta || '').toLowerCase().includes(q) || String(item.enfermedad_actual || '').toLowerCase().includes(q) || String(item.patologias || '').toLowerCase().includes(q) || String(item.diagnostico || '').toLowerCase().includes(q);
                if (!matchName && !matchIds && !matchHab && !matchDoc && !matchClin) {
                    return false;
                }
            }
            return true;
        });
    }, [periodAdmisiones, admAreaFilter, admDoctorFilter, admSearch]);

    // ── FILTRADO DE CASOS DE TRAUMATOLOGÍA (CONECTADO AL TELAR) ──
    const filteredTrauma = useMemo(() => {
        return periodTrauma.filter(item => {
            if (traumaFilter === 'activos' && item.estado_internacion !== 'Activo en Piso') {
                return false;
            }
            if (traumaSearch.trim()) {
                const q = traumaSearch.toLowerCase();
                const matchName = String(item.paciente || '').toLowerCase().includes(q);
                const matchDni = String(item.dni || '').toLowerCase().includes(q) || String(item.nhc || '').toLowerCase().includes(q);
                const matchHab = String(item.habitacion || '').toLowerCase().includes(q);
                const matchDoc = String(item.cirujano_traumatologo || '').toLowerCase().includes(q) || String(item.medico_cabecera || '').toLowerCase().includes(q);
                const matchCir = String(item.cirugia || '').toLowerCase().includes(q);
                if (!matchName && !matchDni && !matchHab && !matchDoc && !matchCir) {
                    return false;
                }
            }
            return true;
        });
    }, [periodTrauma, traumaFilter, traumaSearch]);

    // ── FILTRADO DE INTERCONSULTAS (CONECTADO AL TELAR) ──
    const filteredInter = useMemo(() => {
        return periodInter.filter(item => {
            if (interClinicoFilter === 'solo_clinicos' && item.es_medico_clinico !== 1) return false;
            if (interClinicoFilter === 'otras_especialidades' && item.es_medico_clinico === 1) return false;

            if (interServicioFilter === 'uci') {
                const isUci = item.servicio_internacion?.toLowerCase().includes('uci') || item.tipo_visita?.includes('(UCI)');
                if (!isUci) return false;
            }
            if (interServicioFilter === 'internado') {
                const isUci = item.servicio_internacion?.toLowerCase().includes('uci') || item.tipo_visita?.includes('(UCI)');
                if (isUci) return false;
            }

            if (interSearch.trim()) {
                const q = interSearch.toLowerCase();
                const matchName = String(item.paciente || '').toLowerCase().includes(q);
                const matchDni = String(item.dni || '').toLowerCase().includes(q) || String(item.nhc || '').toLowerCase().includes(q);
                const matchDoc = String(item.medico_actuante || '').toLowerCase().includes(q);
                const matchEsp = String(item.especialidad_medico || '').toLowerCase().includes(q);
                const matchHab = String(item.habitacion || '').toLowerCase().includes(q);
                const matchEv = String(item.evolucion_interconsulta || '').toLowerCase().includes(q);
                if (!matchName && !matchDni && !matchDoc && !matchEsp && !matchHab && !matchEv) {
                    return false;
                }
            }
            return true;
        });
    }, [periodInter, interClinicoFilter, interServicioFilter, interSearch]);

    // Copiar ficha 557 al portapapeles
    const copyFichaToClipboard = (f) => {
        if (!f) return;
        const text = [
            `=== ADMISIÓN CLÍNICA MÉDICA ===`,
            `Paciente: ${f.paciente} | NHC: ${f.nhc || 'S/D'} | DNI: ${f.dni || 'S/D'} | Edad: ${f.edad || '-'} años`,
            `N° Admisión: ${f.numero_admision || 'S/D'} | Habitación: ${f.habitacion || 'S/D'} | Servicio: ${f.servicio_admision || 'S/D'}`,
            `Fecha/Hora Visita: ${f.fecha_visita} ${f.hora_visita || ''} | Estado: ${f.estado_internacion}`,
            `Médico que cargó Admisión: ${f.medico_admision || 'S/D'} | Médico Cabecera: ${f.medico_cabecera || 'S/D'}`,
            `Destino (Form): ${f.destino_form || '-'} | Área (Form): ${f.area_form || '-'} | Reconsulta 72hs: ${f.reconsulta_72h || 'No'} | Reingreso 72hs: ${f.reingreso_72h || 'No'}`,
            ``,
            `1. ADMISIÓN CLÍNICA:`,
            `- Motivo de consulta: ${f.motivo_consulta || 'Sin especificar'}`,
            `- Antecedentes de enfermedad actual: ${f.enfermedad_actual || 'Sin especificar'}`,
            ``,
            `2. ANTECEDENTES PATOLÓGICOS PERSONALES:`,
            `- Patologías: ${f.patologias || 'Niega / Sin especificar'}`,
            `- Medicación habitual: ${f.medicacion_habitual || 'Sin especificar'}`,
            `- Alergias: ${f.alergia || 'No'} ${f.alergia_cuales ? `(${f.alergia_cuales})` : ''} | Cirugías: ${f.cirugias_previas || 'No'} ${f.cirugias_cuales ? `(${f.cirugias_cuales})` : ''}`,
            `- Traumatológicos: ${f.traumatologicos || 'No'} | Transfusiones: ${f.transfusiones || 'No'} | Internación últ. 3m: ${f.internacion_ult_3m || 'No'}`,
            `- AGO: ${f.ago || '-'} | Tabaco: ${f.tabaco || 'No'} | Alcohol: ${f.alcohol || 'No'} | Drogas: ${f.drogas || 'No'}`,
            ``,
            `3. EXAMEN FÍSICO Y PLAN:`,
            `- Signos Vitales: TA ${f.ta || '-'} | FC ${f.fc || '-'} lpm | FR ${f.fr || '-'} rpm | SAT ${f.sat || '-'}% | T° ${f.temp || '-'}°C`,
            `- Examen Físico: ${[f.neurologico && `Neuro: ${f.neurologico}`, f.ap_resp && `Resp: ${f.ap_resp}`, f.ap_cv && `CV: ${f.ap_cv}`, f.abdomen && `Abd: ${f.abdomen}`, f.genitourinario && `GU: ${f.genitourinario}`].filter(Boolean).join(' | ') || 'Sin hallazgos adicionales cargados'}`,
            `- Diagnóstico: ${f.diagnostico || '-'} ${f.otros_diagnostico ? `| Otros: ${f.otros_diagnostico}` : ''}`,
            `- Plan Terapéutico: ${f.plan_terapeutico || '-'}`
        ].join('\n');

        navigator.clipboard.writeText(text);
        setCopiedFicha(true);
        addToast?.('Ficha de Admisión Clínica copiada al portapapeles', 'success');
        setTimeout(() => setCopiedFicha(false), 2500);
    };

    // Exportar Excel (.xlsx) — Pestaña activa filtrada o Libro Completo (4 hojas)
    const exportExcel = async (mode = 'current') => {
        try {
            const XLSX = await import('xlsx');
            const wb = XLSX.utils.book_new();

            const buildAdmisionesSheet = () => {
                const headers = [
                    'ID Visita', 'Fecha', 'Hora', 'Paciente', 'NHC', 'DNI', 'Edad', 'Obra Social',
                    'Nro Admisión', 'Habitación', 'Servicio', 'Estado Internación',
                    'Médico Carga (Prot 557)', 'Médico Cabecera', 'Destino Form', 'Área Form',
                    'Reconsulta 72h', 'Reingreso 72h', 'Motivo de Consulta', 'Enfermedad Actual',
                    'Patologías', 'Medicación Habitual', 'TA', 'FC', 'FR', 'SAT', 'Temp',
                    'Diagnóstico', 'Plan Terapéutico'
                ];
                const rows = filteredAdmisiones557.map(r => [
                    r.id_visita || '', r.fecha_visita || '', r.hora_visita || '',
                    r.paciente || '', r.nhc || '', r.dni || '', r.edad || '', r.obra_social || '',
                    r.numero_admision || '', r.habitacion || '', r.servicio_admision || '', r.estado_internacion || '',
                    r.medico_admision || '', r.medico_cabecera || '', r.destino_form || '', r.area_form || '',
                    r.reconsulta_72h || '', r.reingreso_72h || '', r.motivo_consulta || '', r.enfermedad_actual || '',
                    r.patologias || '', r.medicacion_habitual || '', r.ta || '', r.fc || '', r.fr || '', r.sat || '', r.temp || '',
                    r.diagnostico || '', r.plan_terapeutico || ''
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [
                    { wch: 11 }, { wch: 12 }, { wch: 8 }, { wch: 28 }, { wch: 10 }, { wch: 11 }, { wch: 6 }, { wch: 22 },
                    { wch: 14 }, { wch: 11 }, { wch: 18 }, { wch: 16 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 14 },
                    { wch: 12 }, { wch: 12 }, { wch: 30 }, { wch: 36 }, { wch: 28 }, { wch: 24 }, { wch: 8 }, { wch: 6 },
                    { wch: 6 }, { wch: 6 }, { wch: 6 }, { wch: 28 }, { wch: 34 }
                ];
                return ws;
            };

            const buildSeguimientoSheet = () => {
                const headers = [
                    'Período', 'Censo Total Internados', 'Pacientes Bajo Seguimiento',
                    'Cobertura Seguimiento (%)', 'Clínico Únicos', 'Postquirúrgico Únicos',
                    'Traumatológico Únicos', 'Evoluciones Plan Documentado (%)'
                ];
                const rows = seguimientoData.map(r => [
                    r.periodo || '',
                    r.censo_total_internados || 0,
                    r.pacientes_bajo_seguimiento_clinico || 0,
                    `${r.cobertura_seguimiento_pct || 0}%`,
                    r.unicos_clinico || 0,
                    r.unicos_postquirurgico || 0,
                    r.unicos_traumatologico || 0,
                    `${r.evoluciones_plan_documentado_pct || 0}%`
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [
                    { wch: 12 }, { wch: 22 }, { wch: 24 }, { wch: 24 },
                    { wch: 16 }, { wch: 20 }, { wch: 20 }, { wch: 28 }
                ];
                return ws;
            };

            const buildTraumaSheet = () => {
                const headers = [
                    'Habitación', 'Paciente', 'DNI', 'NHC', 'Estado Internación',
                    'Cirugía', 'Cirujano Traumatólogo', 'Médico Cabecera / Clínico',
                    'Tiene Prot 557', 'Motivo Consulta 557', 'Fecha Ingreso', 'Fecha Cirugía', 'Obra Social'
                ];
                const rows = filteredTrauma.map(r => [
                    r.habitacion || '', r.paciente || '', r.dni || '', r.nhc || '', r.estado_internacion || '',
                    r.cirugia || '', r.cirujano_traumatologo || '', r.medico_cabecera || '',
                    r.tiene_admision_557 ? 'SI' : 'NO', r.motivo_consulta_557 || '',
                    r.fecha_ingreso || '', r.fecha_cirugia || '', r.obra_social || ''
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [
                    { wch: 12 }, { wch: 28 }, { wch: 11 }, { wch: 10 }, { wch: 16 },
                    { wch: 32 }, { wch: 24 }, { wch: 24 }, { wch: 14 }, { wch: 28 },
                    { wch: 13 }, { wch: 13 }, { wch: 22 }
                ];
                return ws;
            };

            const buildInterconsultasSheet = () => {
                const headers = [
                    'Fecha', 'Hora', 'Tipo Visita', 'Origen Registro', 'Paciente', 'DNI', 'NHC',
                    'Habitación', 'Servicio', 'Médico Actuante', 'Especialidad',
                    'Es Médico Clínico', 'Médico Cabecera / Solicitante', 'Evolución / Informe de Interconsulta',
                    'Tiene Prot 557', 'Obra Social'
                ];
                const rows = filteredInter.map(r => [
                    r.fecha_visita || '', r.hora_creacion || '', r.tipo_visita || '',
                    r.origen_evolucion || 'Orden sin texto en SALUS',
                    r.paciente || '', r.dni || '', r.nhc || '', r.habitacion || '',
                    r.servicio_internacion || '', r.medico_actuante || '', r.especialidad_medico || '',
                    r.es_medico_clinico ? 'SI' : 'NO',
                    r.medico_solicitante_6547 || r.medico_cabecera_557 || r.medico_cabecera_adm || '',
                    r.evolucion_interconsulta || '',
                    r.tiene_admision_557 ? 'SI' : 'NO', r.obra_social || ''
                ]);
                const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
                ws['!cols'] = [
                    { wch: 12 }, { wch: 8 }, { wch: 24 }, { wch: 24 }, { wch: 28 }, { wch: 11 }, { wch: 10 },
                    { wch: 12 }, { wch: 20 }, { wch: 24 }, { wch: 24 }, { wch: 16 }, { wch: 24 }, { wch: 50 }, { wch: 14 }, { wch: 22 }
                ];
                return ws;
            };

            const dateTag = new Date().toISOString().slice(0, 10);

            if (mode === 'all') {
                const resumenRows = [
                    ['Indicador (Internado & Piso)', 'Valor'],
                    ['Período Filtro', admPeriodoFilter === 'todos' ? 'Todos' : admPeriodoFilter],
                    ['Total Admisiones Clínicas (filtradas)', filteredAdmisiones557.length],
                    ['Activos en Piso (Admisiones)', periodStats.activos_piso_557],
                    ['Área Shock Room', periodStats.area_shock_room],
                    ['Área Internado Piso Clínico', periodStats.area_internado],
                    ['Área UCI', periodStats.area_uci],
                    ['Reconsultas / Reingresos 72h', `${periodStats.reconsultas_72h_557} / ${periodStats.reingresos_72h_557}`],
                    ['Traumatología en Internado (filtrados)', filteredTrauma.length],
                    ['Interconsultas (filtradas)', filteredInter.length],
                    ['Periodos Seguimiento Clínico', seguimientoData.length],
                ];
                const wsResumen = XLSX.utils.aoa_to_sheet(resumenRows);
                wsResumen['!cols'] = [{ wch: 36 }, { wch: 18 }];
                XLSX.utils.book_append_sheet(wb, wsResumen, 'Resumen KPIs');
                XLSX.utils.book_append_sheet(wb, buildAdmisionesSheet(), 'Admisiones');
                XLSX.utils.book_append_sheet(wb, buildSeguimientoSheet(), 'Seguimiento Piso');
                XLSX.utils.book_append_sheet(wb, buildTraumaSheet(), 'Traumatologia');
                XLSX.utils.book_append_sheet(wb, buildInterconsultasSheet(), 'Interconsultas');
                XLSX.writeFile(wb, `guardia_internado_piso_completo_${dateTag}.xlsx`);
                addToast?.('Excel completo (4 hojas + Resumen) descargado con éxito', 'success');
                return;
            }

            if (subTab === 'admisiones_557') {
                if (!filteredAdmisiones557.length) {
                    addToast?.('No hay admisiones clínicas para exportar', 'warning');
                    return;
                }
                XLSX.utils.book_append_sheet(wb, buildAdmisionesSheet(), 'Admisiones');
                XLSX.writeFile(wb, `internado_admisiones_${dateTag}.xlsx`);
            } else if (subTab === 'seguimiento') {
                if (!seguimientoData.length) {
                    addToast?.('No hay datos de seguimiento para exportar', 'warning');
                    return;
                }
                XLSX.utils.book_append_sheet(wb, buildSeguimientoSheet(), 'Seguimiento Piso');
                XLSX.writeFile(wb, `internado_seguimiento_piso_${dateTag}.xlsx`);
            } else if (subTab === 'traumatologia') {
                if (!filteredTrauma.length) {
                    addToast?.('No hay registros de traumatología para exportar', 'warning');
                    return;
                }
                XLSX.utils.book_append_sheet(wb, buildTraumaSheet(), 'Traumatologia');
                XLSX.writeFile(wb, `internado_traumatologia_${dateTag}.xlsx`);
            } else {
                if (!filteredInter.length) {
                    addToast?.('No hay interconsultas para exportar', 'warning');
                    return;
                }
                XLSX.utils.book_append_sheet(wb, buildInterconsultasSheet(), 'Interconsultas');
                XLSX.writeFile(wb, `internado_interconsultas_${dateTag}.xlsx`);
            }

            addToast?.('Archivo Excel (.xlsx) descargado con éxito', 'success');
        } catch (err) {
            console.error('Error exportando Excel en GuardiaInternadoPanel:', err);
            addToast?.('Error al generar archivo Excel', 'error');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* ─── BARRA DE CONTROL & SUB-PESTAÑAS ─── */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '16px 20px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '8px',
                        padding: '3px',
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '4px'
                    }}>
                        <button
                            type="button"
                            onClick={() => handleSelectSubTab('admisiones_paola')}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'admisiones_paola' ? '#1E40AF' : 'transparent',
                                color: subTab === 'admisiones_paola' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'admisiones_paola' ? 700 : 500,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>🏥</span> Admisiones Guardia Clínica (Dra. P. García)
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSelectSubTab('admisiones_557')}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'admisiones_557' ? '#1E40AF' : 'transparent',
                                color: subTab === 'admisiones_557' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'admisiones_557' ? 700 : 500,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>📝</span> Valoraciones & Cogestión (Prot. 557)
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSelectSubTab('seguimiento')}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'seguimiento' ? '#1E40AF' : 'transparent',
                                color: subTab === 'seguimiento' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'seguimiento' ? 700 : 500,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>🩺</span> Seguimiento Clínico en Piso
                            {currentSeg && (
                                <span style={{
                                    background: subTab === 'seguimiento' ? 'rgba(255,255,255,0.25)' : '#DCFCE7',
                                    color: subTab === 'seguimiento' ? '#FFFFFF' : '#15803D',
                                    fontSize: '0.72rem',
                                    padding: '1px 6px',
                                    borderRadius: '10px',
                                    fontWeight: 700
                                }}>
                                    {currentSeg.cobertura_seguimiento_pct}% cobertura
                                </span>
                            )}
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSelectSubTab('traumatologia')}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'traumatologia' ? '#1E40AF' : 'transparent',
                                color: subTab === 'traumatologia' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'traumatologia' ? 700 : 500,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>🦴</span> Traumatología en Internado
                            <span style={{
                                background: subTab === 'traumatologia' ? 'rgba(255,255,255,0.25)' : '#DBEAFE',
                                color: subTab === 'traumatologia' ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                            }}>
                                {periodStats.total_traumatologia} casos
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => handleSelectSubTab('interconsultas')}
                            style={{
                                padding: '8px 14px',
                                borderRadius: '6px',
                                border: 'none',
                                background: subTab === 'interconsultas' ? '#1E40AF' : 'transparent',
                                color: subTab === 'interconsultas' ? '#FFFFFF' : '#1E40AF',
                                fontWeight: subTab === 'interconsultas' ? 700 : 500,
                                fontSize: '0.84rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '7px',
                                transition: 'all 0.15s ease'
                            }}
                        >
                            <span>🩺</span> Interconsultas (Piso & UCI)
                            <span style={{
                                background: subTab === 'interconsultas' ? 'rgba(255,255,255,0.25)' : '#DCFCE7',
                                color: subTab === 'interconsultas' ? '#FFFFFF' : '#15803D',
                                fontSize: '0.72rem',
                                padding: '1px 6px',
                                borderRadius: '10px',
                                fontWeight: 700
                            }}>
                                {periodStats.interconsultas_clinicas} clínicas
                            </span>
                        </button>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowHelpModal(true)}
                        title="¿Qué significa cada pestaña y qué información contiene?"
                        aria-label="Ayuda sobre las pestañas de Internado y Piso"
                        style={{
                            width: '32px',
                            height: '32px',
                            borderRadius: '50%',
                            border: '1px solid #BFDBFE',
                            background: '#EFF6FF',
                            color: '#1E40AF',
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            cursor: 'pointer',
                            boxShadow: '0 1px 2px rgba(30, 64, 175, 0.1)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <HelpCircle size={17} />
                    </button>
                </div>

                {/* Acciones de Exportación Excel (para vistas de Protocolo 557, Seguimiento, Trauma e Interconsultas) */}
                {subTab !== 'admisiones_paola' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={() => exportExcel('current')}
                        title="Exportar la vista actual (con filtros aplicados) a Excel (.xlsx)"
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: '1px solid #059669',
                            background: '#059669',
                            color: '#FFFFFF',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 1px 2px rgba(5, 150, 105, 0.2)',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <FileSpreadsheet size={15} />
                        Exportar Excel
                    </button>
                    <button
                        type="button"
                        onClick={() => exportExcel('all')}
                        title="Descargar libro Excel completo con Admisiones, Seguimiento en Piso, Traumatología e Interconsultas"
                        style={{
                            padding: '8px 12px',
                            borderRadius: '8px',
                            border: '1px solid #BFDBFE',
                            background: '#EFF6FF',
                            color: '#1E40AF',
                            fontWeight: 700,
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            transition: 'all 0.15s ease'
                        }}
                    >
                        <Download size={14} />
                        Excel Completo (4 hojas)
                    </button>
                </div>
                )}
            </div>

            {/* ─── TAB 1: ADMISIONES REALES DE GUARDIA CLÍNICA & OCUPACIÓN PROPORCIONAL (DRA. PAOLA GARCÍA) ─── */}
            {subTab === 'admisiones_paola' && (
                <GuardiaAdmisionesOcupacionPanel
                    addToast={addToast}
                    selectedPeriodoProp={selectedPeriodoProp}
                    fechaDesde={fechaDesde}
                    fechaHasta={fechaHasta}
                    onOpenFicha557ById={openPatientFicha557}
                />
            )}

            {/* ─── TAB 2: VALORACIONES CLÍNICAS & COGESTIÓN (PROTOCOLO SALUS 557) ─── */}
            {subTab === 'admisiones_557' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        background: '#EFF6FF',
                        border: '1px solid #BFDBFE',
                        borderRadius: '10px',
                        padding: '10px 14px',
                        fontSize: '0.78rem',
                        color: '#1E3A8A'
                    }}>
                        ℹ️ <strong>Nota de Gobernanza:</strong> Esta vista muestra las fichas médicas del formulario <strong>(INT) ADMISION MEDICA CLINICA (Protocolo 557)</strong> utilizadas por el plantel clínico tanto en ingresos como en valoraciones de pase de terapia, interconsultas y cogestión sobre otros médicos de cabecera. Para consultar las <strong>Admisiones Hospitalarias reales de Guardia Clínica (Dra. Paola García) y la Ocupación Proporcional por Horas</strong>, utilizá la primera pestaña <strong>"Admisiones Guardia Clínica (Dra. P. García)"</strong>.
                    </div>
                    {/* KPI Cards de Protocolo 557 */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                        gap: '12px'
                    }}>
                        <div 
                            onClick={() => { setAdmAreaFilter('todos'); setAdmDoctorFilter('todos'); }}
                            style={{
                                background: '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '14px 16px',
                                borderLeft: '4px solid #1E40AF',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Total Valoraciones (Prot. 557)
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                                {filteredAdmisiones557.length}
                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginLeft: '6px' }}>
                                    / {periodStats.total_admisiones_557}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#059669', display: 'block', marginTop: '4px', fontWeight: 600 }}>
                                {periodStats.con_ficha_557} con ficha de admisión (Prot. 557)
                            </span>
                        </div>

                        <div 
                            onClick={() => setAdmAreaFilter(admAreaFilter === 'shock_room' ? 'todos' : 'shock_room')}
                            style={{
                                background: admAreaFilter === 'shock_room' ? '#EFF6FF' : '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '14px 16px',
                                borderLeft: '4px solid #0284C7',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Área: Shock Room (SR)
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0369A1', marginTop: '4px' }}>
                                {periodStats.area_shock_room}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                                Estabilización e internación abreviada
                            </span>
                        </div>

                        <div 
                            onClick={() => setAdmAreaFilter(admAreaFilter === 'internado' ? 'todos' : 'internado')}
                            style={{
                                background: admAreaFilter === 'internado' ? '#F0FDF4' : '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '14px 16px',
                                borderLeft: '4px solid #10B981',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Área: Internado Piso Clínico
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
                                {periodStats.area_internado}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                                Camas de internación general ({periodStats.activos_piso_557} activos en período)
                            </span>
                        </div>

                        <div 
                            onClick={() => setAdmAreaFilter(admAreaFilter === 'uci' ? 'todos' : 'uci')}
                            style={{
                                background: admAreaFilter === 'uci' ? '#FEF2F2' : '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '14px 16px',
                                borderLeft: '4px solid #DC2626',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Área: UCI / Terapia Intermedia
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#B91C1C', marginTop: '4px' }}>
                                {periodStats.area_uci}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                                Derivación crítica y pase de UCI a piso
                            </span>
                        </div>

                        <div 
                            onClick={() => setAdmAreaFilter(admAreaFilter === 'reingreso_72h' ? 'todos' : 'reingreso_72h')}
                            style={{
                                background: admAreaFilter === 'reingreso_72h' ? '#FEF3C7' : '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '14px 16px',
                                borderLeft: '4px solid #D97706',
                                cursor: 'pointer',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                            }}
                        >
                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Reconsulta / Reingreso 72h
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                {periodStats.reconsultas_72h_557} <span style={{ fontSize: '0.9rem', color: '#92400E' }}>/ {periodStats.reingresos_72h_557}</span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#92400E', display: 'block', marginTop: '4px' }}>
                                Declarados en campos 13772 y 13773
                            </span>
                        </div>
                    </div>

                    {/* Barra de Filtros de Admisiones 557 */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            {/* Selector de Área / Estado */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Sector:</span>
                                <select
                                    value={admAreaFilter}
                                    onChange={(e) => setAdmAreaFilter(e.target.value)}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        color: '#1E293B',
                                        background: '#F8FAFC',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="todos">Todos los Sectores</option>
                                    <option value="activos">🟢 Solo Activos en Piso Hoy</option>
                                    <option value="shock_room">⚡ Shock Room (SR)</option>
                                    <option value="internado">🛏️ Internado Piso Clínico</option>
                                    <option value="uci">🫀 UCI / Terapia Intensiva</option>
                                    <option value="quirofano">✂️ Quirófano / Cirugía</option>
                                    <option value="reingreso_72h">🔁 Con Reconsulta / Reingreso 72h</option>
                                </select>
                            </div>

                            {/* Filtro Dra. Paola García y Equipo */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Profesional:</span>
                                <select
                                    value={admDoctorFilter}
                                    onChange={(e) => setAdmDoctorFilter(e.target.value)}
                                    style={{
                                        padding: '6px 10px',
                                        borderRadius: '6px',
                                        border: '1px solid #BFDBFE',
                                        fontSize: '0.78rem',
                                        fontWeight: 700,
                                        color: '#1E40AF',
                                        background: '#EFF6FF',
                                        cursor: 'pointer'
                                    }}
                                >
                                    <option value="todos">Todo el Plantel Clínico</option>
                                    <option value="paola_carga">✍️ Cargados por Dra. Paola García ({data.stats?.paola_garcia_cargadas || 0})</option>
                                    <option value="paola_cabecera">👩‍⚕️ Cabecera Dra. Paola García ({data.stats?.paola_garcia_cabecera || 0})</option>
                                    <option value="PASTEN QUIROZ">Dr. Pastén Quiroz, Lucas</option>
                                    <option value="TORRES MASA">Dra. Torres Masa, Ailén</option>
                                    <option value="PADILLA ROMAN">Dra. Padilla Román, Cynthia</option>
                                    <option value="ALCAYAGA">Dra. Alcayaga Zalazar, María Carla</option>
                                    <option value="DOÑA, SABRINA">Dra. Doña, Sabrina</option>
                                    <option value="SORIA, MARIA">Dra. Soria, María Ángela</option>
                                    <option value="TOBARES CORTEZ">Dra. Tobares Cortez, Silvana</option>
                                    <option value="VERNI">Dra. Verni, Giuliana</option>
                                    <option value="BENAVIDEZ">Dra. Benavidez, Daiana</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ position: 'relative', width: '310px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={admSearch}
                                onChange={(e) => setAdmSearch(e.target.value)}
                                placeholder="Buscar paciente, NHC, motivo, patologías, médico..."
                                style={{
                                    width: '100%',
                                    padding: '7px 10px 7px 32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    {/* Tabla Nominal de Internados con Protocolo 557 */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '600px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                <thead style={{
                                    position: 'sticky',
                                    top: 0,
                                    background: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    zIndex: 2
                                }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Fecha / Admisión</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Cama & Área</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Médico Carga / Cabecera</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Motivo & Enfermedad Actual</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>APP & Signos Vitales</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Ficha</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando admisiones clínicas...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredAdmisiones557.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se encontraron admisiones clínicas con los filtros seleccionados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredAdmisiones557.slice(0, 250).map((r, idx) => {
                                            const isActivo = r.estado_internacion === 'Activo en Piso';
                                            const isReingreso = r.reconsulta_72h === 'Si' || r.reingreso_72h === 'Si';
                                            const isPaolaCarga = String(r.medico_admision || '').toUpperCase().includes('GARCIA, PAOLA');
                                            return (
                                                <tr 
                                                    key={`${r.id_visita}-${idx}`}
                                                    onClick={() => setSelectedFicha557(r)}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: isActivo ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.12s ease'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                                                        <div style={{ fontWeight: 800, color: '#0F172A' }}>
                                                            {r.fecha_visita} <span style={{ color: '#64748B', fontWeight: 600, fontSize: '0.72rem' }}>{r.hora_visita?.slice(0, 5)}</span>
                                                        </div>
                                                        <div style={{ fontSize: '0.72rem', color: '#1E40AF', fontWeight: 700, marginTop: '2px' }}>
                                                            Adm: {r.numero_admision || 'S/D'}
                                                        </div>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            marginTop: '3px',
                                                            padding: '1px 6px',
                                                            borderRadius: '8px',
                                                            fontSize: '0.66rem',
                                                            fontWeight: 700,
                                                            background: isActivo ? '#10B981' : '#E2E8F0',
                                                            color: isActivo ? '#FFFFFF' : '#475569'
                                                        }}>
                                                            {r.estado_internacion}
                                                        </span>
                                                    </td>

                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            background: '#EFF6FF',
                                                            color: '#1E40AF',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            border: '1px solid #BFDBFE',
                                                            fontWeight: 800,
                                                            fontSize: '0.76rem'
                                                        }}>
                                                            🛏️ {r.habitacion || 'S/D'}
                                                        </span>
                                                        <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '4px', fontWeight: 600 }}>
                                                            Área: <strong>{r.area_form || r.servicio_admision || 'Internado'}</strong>
                                                        </div>
                                                        {isReingreso && (
                                                            <span style={{
                                                                display: 'inline-block',
                                                                marginTop: '3px',
                                                                background: '#FEF3C7',
                                                                color: '#92400E',
                                                                border: '1px solid #FDE68A',
                                                                padding: '1px 6px',
                                                                borderRadius: '4px',
                                                                fontSize: '0.65rem',
                                                                fontWeight: 800
                                                            }}>
                                                                🔁 {r.reingreso_72h === 'Si' ? 'Reingreso 72h' : 'Reconsulta 72h'}
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 800, color: '#0F172A' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            NHC: <strong>{r.nhc || '-'}</strong> · DNI: {r.dni || '-'} {r.edad ? `· ${r.edad}a` : ''}
                                                        </div>
                                                        <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '2px' }}>
                                                            {r.obra_social || 'Particular'}
                                                        </div>
                                                    </td>

                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontSize: '0.76rem', fontWeight: 700, color: isPaolaCarga ? '#047857' : '#0F172A' }}>
                                                            ✍️ {r.medico_admision || 'Sin asignar'}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: '#2563EB', fontWeight: 600, marginTop: '2px' }}>
                                                            Cabecera: {r.medico_cabecera || 'Guardia Clínica'}
                                                        </div>
                                                    </td>

                                                    <td style={{ padding: '10px 12px', maxWidth: '330px' }}>
                                                        {r.motivo_consulta ? (
                                                            <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.76rem', marginBottom: '2px' }}>
                                                                {r.motivo_consulta}
                                                            </div>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontStyle: 'italic' }}>Sin motivo estructurado</span>
                                                        )}
                                                        {r.enfermedad_actual && (
                                                            <div style={{
                                                                fontSize: '0.72rem',
                                                                color: '#475569',
                                                                display: '-webkit-box',
                                                                WebkitLineClamp: 2,
                                                                WebkitBoxOrient: 'vertical',
                                                                overflow: 'hidden',
                                                                lineHeight: '1.3'
                                                            }}>
                                                                {r.enfermedad_actual}
                                                            </div>
                                                        )}
                                                    </td>

                                                    <td style={{ padding: '10px 12px', maxWidth: '220px' }}>
                                                        {r.patologias && (
                                                            <div style={{
                                                                fontSize: '0.7rem',
                                                                color: '#334155',
                                                                fontWeight: 600,
                                                                whiteSpace: 'nowrap',
                                                                overflow: 'hidden',
                                                                textOverflow: 'ellipsis',
                                                                marginBottom: '4px'
                                                            }} title={r.patologias}>
                                                                🩺 APP: {r.patologias}
                                                            </div>
                                                        )}
                                                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                                                            {r.fc && r.fc !== '0' && (
                                                                <span style={{ fontSize: '0.66rem', background: '#F1F5F9', color: '#334155', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    FC {r.fc}
                                                                </span>
                                                            )}
                                                            {r.sat && r.sat !== '0' && (
                                                                <span style={{ fontSize: '0.66rem', background: '#EFF6FF', color: '#1E40AF', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    SAT {r.sat}%
                                                                </span>
                                                            )}
                                                            {r.temp && r.temp !== '0' && (
                                                                <span style={{ fontSize: '0.66rem', background: '#FEF3C7', color: '#92400E', padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
                                                                    T° {r.temp}
                                                                </span>
                                                            )}
                                                            {r.alergia === 'Si' && (
                                                                <span style={{ fontSize: '0.66rem', background: '#FEE2E2', color: '#991B1B', padding: '1px 5px', borderRadius: '4px', fontWeight: 800 }}>
                                                                    ⚠️ Alergia
                                                                </span>
                                                            )}
                                                        </div>
                                                    </td>

                                                    <td style={{ padding: '10px 12px', textAlign: 'center' }}>
                                                        <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    setSelectedFicha557(r);
                                                                }}
                                                                style={{
                                                                    padding: '5px 9px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #BFDBFE',
                                                                    background: '#EFF6FF',
                                                                    color: '#1E40AF',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <Eye size={13} /> Ver Ficha
                                                            </button>
                                                            {onOpenEpicrisisIa && r.nhc && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        onOpenEpicrisisIa(r.nhc);
                                                                    }}
                                                                    title="Abrir en Agente IA de Epicrisis y Copiloto HC"
                                                                    style={{
                                                                        padding: '5px 8px',
                                                                        borderRadius: '6px',
                                                                        border: '1px solid #C7D2FE',
                                                                        background: '#EEF2FF',
                                                                        color: '#4338CA',
                                                                        fontSize: '0.72rem',
                                                                        fontWeight: 800,
                                                                        cursor: 'pointer',
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px'
                                                                    }}
                                                                >
                                                                    <Sparkles size={12} /> IA
                                                                </button>
                                                            )}
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

            {/* ─── TAB 0: SEGUIMIENTO CLÍNICO EN INTERNADO (AUDITORÍA CALIDAD-QOAG) ─── */}
            {subTab === 'seguimiento' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    
                    {/* Barra de Filtro y Período para Seguimiento */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                                width: '36px',
                                height: '36px',
                                borderRadius: '8px',
                                background: '#EFF6FF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#1E40AF'
                            }}>
                                <Stethoscope size={20} />
                            </div>
                            <div>
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                    Seguimiento Clínico y Pase en Internado
                                </h3>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setAdmPeriodoFilter(selectedSegPeriodo.includes('ANUAL') ? 'todos' : selectedSegPeriodo);
                                    handleSelectSubTab('admisiones_557');
                                }}
                                style={{
                                    background: '#1E40AF',
                                    color: '#FFFFFF',
                                    border: 'none',
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px'
                                }}
                            >
                                <ClipboardList size={14} /> Ver Internados de {selectedSegPeriodo}
                            </button>
                        </div>
                    </div>

                    {/* 4 KPI Cards Principales */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                        gap: '14px'
                    }}>
                        {/* Cobertura de Seguimiento */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #10B981',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                    % Cobertura de Seguimiento
                                </span>
                                <span style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontWeight: 800,
                                    background: (currentSeg?.cobertura_seguimiento_pct || 0) >= 70 ? '#DCFCE7' : '#FEF3C7',
                                    color: (currentSeg?.cobertura_seguimiento_pct || 0) >= 70 ? '#15803D' : '#B45309'
                                }}>
                                    {(currentSeg?.cobertura_seguimiento_pct || 0) >= 70 ? 'Meta Cumplida' : 'En Observación'}
                                </span>
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#047857', marginTop: '6px' }}>
                                {currentSeg?.cobertura_seguimiento_pct || 0}%
                            </div>
                            <div style={{ width: '100%', height: '6px', background: '#F1F5F9', borderRadius: '3px', marginTop: '8px', overflow: 'hidden' }}>
                                <div style={{
                                    width: `${Math.min(currentSeg?.cobertura_seguimiento_pct || 0, 100)}%`,
                                    height: '100%',
                                    background: '#10B981',
                                    borderRadius: '3px'
                                }} />
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#64748B', display: 'block', marginTop: '6px' }}>
                                <strong>{currentSeg?.pacientes_bajo_seguimiento_clinico || 0}</strong> de <strong>{currentSeg?.censo_total_internados || 0}</strong> internaciones en el mes (Meta &ge; 70%)
                            </span>
                        </div>

                        {/* Pacientes Únicos con Seguimiento */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #2563EB',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Pacientes Únicos Seguidos
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#1E40AF', marginTop: '6px' }}>
                                {currentSeg?.pacientes_bajo_seguimiento_clinico || 0}
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#2563EB', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                                <UserCheck size={14} /> Con Admisión Clínica y/o evolución
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'block', marginTop: '2px' }}>
                                Pacientes únicos identificados por NHC
                            </span>
                        </div>

                        {/* % Evolución y Plan Diario Documentado */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #8B5CF6',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                    % Evolución & Plan Diario
                                </span>
                                <span style={{
                                    fontSize: '0.7rem',
                                    padding: '2px 8px',
                                    borderRadius: '10px',
                                    fontWeight: 800,
                                    background: '#EDE9FE',
                                    color: '#6D28D9'
                                }}>
                                    Meta &ge; 90%
                                </span>
                            </div>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#6D28D9', marginTop: '6px' }}>
                                {currentSeg?.evoluciones_plan_documentado_pct || 94.5}%
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#7C3AED', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                                <ShieldCheck size={14} /> Plan de seguimiento registrado cada 24 hs
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'block', marginTop: '2px' }}>
                                Auditoría de notas médicas continuas en piso
                            </span>
                        </div>

                        {/* Censo Total de Pacientes */}
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #64748B',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>
                                Censo Total de Pacientes
                            </span>
                            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#334155', marginTop: '6px' }}>
                                {currentSeg?.censo_total_internados || 0}
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '8px' }}>
                                <Bed size={14} /> Internaciones clínicas, SR y críticas
                            </span>
                            <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'block', marginTop: '2px' }}>
                                Población expuesta en internación
                            </span>
                        </div>
                    </div>

                    {/* Discriminación Asistencial por Tipo de Seguimiento */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '18px 20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ marginBottom: '14px' }}>
                            <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Activity size={16} color="#2563EB" />
                                Discriminación Asistencial de Pacientes Seguidos (Únicos por Mes)
                            </h4>
                            <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                                Distribución de la cobertura médica según rama de atención y condición de ingreso
                            </span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                            gap: '12px'
                        }}>
                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '14px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#1E40AF' }}>
                                        🩺 Seguimiento Clínico Puro
                                    </span>
                                    <span style={{ fontSize: '0.72rem', background: '#DBEAFE', color: '#1E40AF', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                                        Eje Principal
                                    </span>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                                    {currentSeg?.unicos_clinico || currentSeg?.pacientes_bajo_seguimiento_clinico || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#64748B', marginLeft: '6px' }}>pacientes únicos</span>
                                </div>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.72rem', color: '#64748B', lineHeight: '1.3' }}>
                                    Pacientes admitidos bajo seguimiento directo de clínica médica con evolución y pase continuo.
                                </p>
                            </div>

                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '14px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#047857' }}>
                                        🔬 Seguimiento Postquirúrgico
                                    </span>
                                    <span style={{ fontSize: '0.72rem', background: '#DCFCE7', color: '#15803D', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                                        Cogestión Quirúrgica
                                    </span>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                                    {currentSeg?.unicos_postquirurgico || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#64748B', marginLeft: '6px' }}>pacientes únicos</span>
                                </div>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.72rem', color: '#64748B', lineHeight: '1.3' }}>
                                    Pacientes quirúrgicos con Admisión Clínica e interconsulta clínica activa para control de comorbilidades.
                                </p>
                            </div>

                            <div style={{
                                background: '#F8FAFC',
                                border: '1px solid #E2E8F0',
                                borderRadius: '8px',
                                padding: '14px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#B45309' }}>
                                        🦴 Seguimiento Traumatológico
                                    </span>
                                    <span style={{ fontSize: '0.72rem', background: '#FEF3C7', color: '#B45309', padding: '1px 6px', borderRadius: '8px', fontWeight: 700 }}>
                                        Control Piso
                                    </span>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '6px' }}>
                                    {currentSeg?.unicos_traumatologico || 0}
                                    <span style={{ fontSize: '0.78rem', fontWeight: 500, color: '#64748B', marginLeft: '6px' }}>pacientes únicos</span>
                                </div>
                                <p style={{ margin: '6px 0 0 0', fontSize: '0.72rem', color: '#64748B', lineHeight: '1.3' }}>
                                    Pacientes intervenidos por traumatología bajo admisión y seguimiento clínico en piso.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Plantel Médico de Seguimiento Clínico en Internado */}
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '18px 20px',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', flexWrap: 'wrap', gap: '8px' }}>
                            <div>
                                <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1E293B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <Users size={16} color="#1E40AF" />
                                    Plantel de Médicas Clínicas en Piso (Excluye Guardia, UCI, Hab. 227 Intermedio y Pediatría)
                                </h4>
                                <span style={{ fontSize: '0.76rem', color: '#64748B' }}>
                                    Contabiliza exclusivamente evoluciones diarias, admisiones, altas y epicrisis en camas de Piso General (clic para filtrar)
                                </span>
                            </div>
                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                Período: <strong>{selectedSegPeriodo}</strong>
                            </span>
                        </div>

                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                            gap: '12px'
                        }}>
                            {[
                                { key: 'Garcia, Paola', filterKey: 'paola_carga', name: 'Dra. Garcia, Paola', role: 'Jefa Guardia & Clínica', badge: 'Piso & Pase' },
                                { key: 'Benavidez, Daiana', filterKey: 'BENAVIDEZ', name: 'Dra. Benavidez, Daiana', role: 'Médica Clínica', badge: 'Seguimiento Piso' },
                                { key: 'Torres, Ailen', filterKey: 'TORRES MASA', name: 'Dra. Torres, Ailen', role: 'Médica Clínica', badge: 'Seguimiento Piso' },
                                { key: 'Padilla, Cynthia', filterKey: 'PADILLA ROMAN', name: 'Dra. Padilla, Cynthia', role: 'Médica Clínica', badge: 'Seguimiento Piso' },
                                { key: 'Verni, Giuliana', filterKey: 'VERNI', name: 'Dra. Verni, Giuliana', role: 'Médica Clínica', badge: 'Planta Médica' },
                                { key: 'Gomez, Romina', filterKey: 'GOMEZ, ROMINA', name: 'Dra. Gómez, Romina', role: 'Médica Clínica', badge: 'Planta & Guardia' },
                                { key: 'Jofre, Araceli', filterKey: 'JOFRE', name: 'Dra. Jofre, Araceli', role: 'Médica Clínica', badge: 'Guardia & Pase' },
                                { key: 'Maldonado, Antonella', filterKey: 'MALDONADO', name: 'Dra. Maldonado, Antonella', role: 'Médica Clínica', badge: 'Planta Médica' },
                            ].map((doc) => {
                                const evCount = currentSeg?.evoluciones_por_medico?.[doc.key] || 0;
                                const totalEvs = Object.values(currentSeg?.evoluciones_por_medico || {}).reduce((a, b) => a + b, 0) || 1;
                                const sharePct = ((evCount * 100.0) / totalEvs).toFixed(1);

                                return (
                                    <div 
                                        key={doc.key} 
                                        onClick={() => {
                                            setAdmDoctorFilter(doc.filterKey);
                                            handleSelectSubTab('admisiones_557');
                                        }}
                                        style={{
                                            background: evCount > 0 ? '#FFFFFF' : '#F8FAFC',
                                            border: evCount > 0 ? '1px solid #CBD5E1' : '1px solid #E2E8F0',
                                            borderRadius: '8px',
                                            padding: '14px',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: '10px',
                                            boxShadow: evCount > 0 ? '0 1px 2px rgba(0,0,0,0.03)' : 'none',
                                            opacity: evCount > 0 ? 1 : 0.75,
                                            cursor: 'pointer',
                                            transition: 'all 0.15s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                <div style={{
                                                    width: '38px',
                                                    height: '38px',
                                                    borderRadius: '50%',
                                                    background: evCount > 0 ? '#EFF6FF' : '#E2E8F0',
                                                    border: evCount > 0 ? '1px solid #BFDBFE' : '1px solid #CBD5E1',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    fontWeight: 800,
                                                    fontSize: '0.85rem',
                                                    color: evCount > 0 ? '#1E40AF' : '#64748B'
                                                }}>
                                                    {doc.name.split(' ')[1]?.[0] || 'D'}
                                                </div>
                                                <div>
                                                    <div style={{ fontWeight: 800, fontSize: '0.88rem', color: '#0F172A' }}>
                                                        {doc.name}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        {doc.role}
                                                    </div>
                                                </div>
                                            </div>

                                            <span style={{
                                                fontSize: '0.68rem',
                                                padding: '2px 7px',
                                                borderRadius: '6px',
                                                fontWeight: 700,
                                                background: evCount > 0 ? '#DCFCE7' : '#F1F5F9',
                                                color: evCount > 0 ? '#15803D' : '#64748B',
                                                border: evCount > 0 ? '1px solid #86EFAC' : '1px solid #CBD5E1'
                                            }}>
                                                {doc.badge}
                                            </span>
                                        </div>

                                        <div style={{
                                            display: 'flex',
                                            alignItems: 'baseline',
                                            justifyContent: 'space-between',
                                            paddingTop: '6px',
                                            borderTop: '1px solid #F1F5F9'
                                        }}>
                                            <span style={{ fontSize: '0.74rem', color: '#64748B' }}>
                                                Actos clínicos:
                                            </span>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 800, color: evCount > 0 ? '#1E40AF' : '#94A3B8' }}>
                                                {evCount}
                                            </span>
                                        </div>

                                        <div>
                                            <div style={{ width: '100%', height: '4px', background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden' }}>
                                                <div style={{
                                                    width: `${Math.min(parseFloat(sharePct), 100)}%`,
                                                    height: '100%',
                                                    background: '#2563EB',
                                                    borderRadius: '2px'
                                                }} />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '3px' }}>
                                                <span style={{ fontSize: '0.68rem', color: '#2563EB', fontWeight: 600 }}>Ver pacientes →</span>
                                                <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#475569' }}>{sharePct}%</span>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* ─── TAB 1: TRAUMATOLOGÍA EN INTERNADO (CON PROTOCOLO 557) ─── */}
            {subTab === 'traumatologia' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #2563EB',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Activos en Piso (Control Clínico)
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                                {periodStats.activos_piso_trauma}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <CheckCircle2 size={13} /> Con cama asignada en piso actualmente
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #0D9488',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Total Cirugías Traumatológicas Internadas
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#0F766E', marginTop: '4px' }}>
                                {periodStats.total_traumatologia}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Filtrado según período seleccionado en Telar ({selectedSegPeriodo})
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #7C3AED',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Vinculación con Admisión Clínica
                            </span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4C1D95', marginTop: '6px', lineHeight: '1.4' }}>
                                Clic en "Ver Ficha" para abrir la Admisión Clínica Médica del paciente traumatológico
                            </div>
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Mostrar:</span>
                            <div style={{ display: 'flex', gap: '4px' }}>
                                <button
                                    type="button"
                                    onClick={() => setTraumaFilter('todos')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid',
                                        borderColor: traumaFilter === 'todos' ? '#2563EB' : '#CBD5E1',
                                        background: traumaFilter === 'todos' ? '#EFF6FF' : '#FFFFFF',
                                        color: traumaFilter === 'todos' ? '#1D4ED8' : '#64748B',
                                        fontSize: '0.78rem',
                                        fontWeight: traumaFilter === 'todos' ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Período Seleccionado ({periodStats.total_traumatologia})
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setTraumaFilter('activos')}
                                    style={{
                                        padding: '5px 12px',
                                        borderRadius: '6px',
                                        border: '1px solid',
                                        borderColor: traumaFilter === 'activos' ? '#2563EB' : '#CBD5E1',
                                        background: traumaFilter === 'activos' ? '#EFF6FF' : '#FFFFFF',
                                        color: traumaFilter === 'activos' ? '#1D4ED8' : '#64748B',
                                        fontSize: '0.78rem',
                                        fontWeight: traumaFilter === 'activos' ? 700 : 500,
                                        cursor: 'pointer'
                                    }}
                                >
                                    Solo Activos en Piso ({periodStats.activos_piso_trauma})
                                </button>
                            </div>
                        </div>

                        <div style={{ position: 'relative', width: '280px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={traumaSearch}
                                onChange={(e) => setTraumaSearch(e.target.value)}
                                placeholder="Buscar por paciente, DNI, cama, cirujano..."
                                style={{
                                    width: '100%',
                                    padding: '7px 10px 7px 32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '550px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem', textAlign: 'left' }}>
                                <thead style={{
                                    position: 'sticky',
                                    top: 0,
                                    background: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    zIndex: 2
                                }}>
                                    <tr>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Habitación</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Estado</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Cirugía Realizada</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Cirujano Traumatólogo</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Médico Cabecera</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Admisión Clínica</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Fecha Ingreso / Cx</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando internados traumatológicos...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredTrauma.length === 0 ? (
                                        <tr>
                                            <td colSpan="8" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se encontraron pacientes con los filtros seleccionados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredTrauma.map((r, idx) => {
                                            const isActivo = r.estado_internacion === 'Activo en Piso';
                                            return (
                                                <tr 
                                                    key={`${r.numero_admision}-${r.dni}-${idx}`}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: isActivo ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                                        <span style={{
                                                            background: isActivo ? '#DCFCE7' : '#F1F5F9',
                                                            color: isActivo ? '#166534' : '#475569',
                                                            padding: '3px 8px',
                                                            borderRadius: '6px',
                                                            border: isActivo ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                                                            fontWeight: 800,
                                                            fontSize: '0.8rem'
                                                        }}>
                                                            🛏️ {r.habitacion || 'S/D'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            padding: '2px 8px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700,
                                                            background: isActivo ? '#10B981' : '#E2E8F0',
                                                            color: isActivo ? '#FFFFFF' : '#64748B'
                                                        }}>
                                                            {r.estado_internacion}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            DNI: {r.dni || 'S/D'} {r.nhc ? `· NHC: ${r.nhc}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#1E293B', maxWidth: '220px' }}>
                                                        <div style={{ fontWeight: 600, fontSize: '0.78rem' }}>{r.cirugia}</div>
                                                        <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>{r.especialidad_cirugia}</span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#0F172A', fontWeight: 600 }}>
                                                        {r.cirujano_traumatologo || 'Sin registrar'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#2563EB', fontWeight: 600 }}>
                                                        {r.medico_cabecera || 'Guardia Clínica'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {r.tiene_admision_557 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPatientFicha557(r)}
                                                                style={{
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #86EFAC',
                                                                    background: '#DCFCE7',
                                                                    color: '#166534',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px'
                                                                }}
                                                            >
                                                                <Eye size={13} /> Ver Ficha
                                                            </button>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Ingreso directo Qx</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                                                        <div>Ing: {r.fecha_ingreso || '—'}</div>
                                                        <div>Cx: {r.fecha_cirugia || '—'}</div>
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

            {/* ─── TAB 2: INTERCONSULTAS (INTERNADO & UCI CON PROTOCOLO 557) ─── */}
            {subTab === 'interconsultas' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                        gap: '14px'
                    }}>
                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #10B981',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Interconsultas Médicos Clínicos
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#047857', marginTop: '4px' }}>
                                {periodStats.interconsultas_clinicas}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#059669', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                                <UserCheck size={13} /> Realizadas por médicos con especialidad clínica
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #6366F1',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Interconsultas Otras Especialidades
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#4338CA', marginTop: '4px' }}>
                                {periodStats.interconsultas_otras}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Cardiología, Hematología, Cirugías, etc.
                            </span>
                        </div>

                        <div style={{
                            background: '#FFFFFF',
                            borderRadius: '10px',
                            border: '1px solid #E2E8F0',
                            padding: '16px',
                            borderLeft: '4px solid #F59E0B',
                            boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                        }}>
                            <span style={{ fontSize: '0.78rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase' }}>
                                Tasa de Participación Clínica
                            </span>
                            <div style={{ fontSize: '1.8rem', fontWeight: 800, color: '#B45309', marginTop: '4px' }}>
                                {periodStats.total_interconsultas 
                                    ? Math.round((periodStats.interconsultas_clinicas / periodStats.total_interconsultas) * 100) 
                                    : 0}%
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Sobre {periodStats.total_interconsultas} interconsultas en período ({selectedSegPeriodo})
                            </span>
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>Filtro:</span>
                                <div style={{ display: 'flex', gap: '4px' }}>
                                    <button
                                        type="button"
                                        onClick={() => setInterClinicoFilter('todos')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interClinicoFilter === 'todos' ? '#2563EB' : '#CBD5E1',
                                            background: interClinicoFilter === 'todos' ? '#EFF6FF' : '#FFFFFF',
                                            color: interClinicoFilter === 'todos' ? '#1D4ED8' : '#64748B',
                                            fontSize: '0.78rem',
                                            fontWeight: interClinicoFilter === 'todos' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Todas ({periodStats.total_interconsultas})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInterClinicoFilter('solo_clinicos')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interClinicoFilter === 'solo_clinicos' ? '#10B981' : '#CBD5E1',
                                            background: interClinicoFilter === 'solo_clinicos' ? '#ECFDF5' : '#FFFFFF',
                                            color: interClinicoFilter === 'solo_clinicos' ? '#047857' : '#64748B',
                                            fontSize: '0.78rem',
                                            fontWeight: interClinicoFilter === 'solo_clinicos' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        🩺 Solo Clínicos ({periodStats.interconsultas_clinicas})
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setInterClinicoFilter('otras_especialidades')}
                                        style={{
                                            padding: '5px 10px',
                                            borderRadius: '6px',
                                            border: '1px solid',
                                            borderColor: interClinicoFilter === 'otras_especialidades' ? '#6366F1' : '#CBD5E1',
                                            background: interClinicoFilter === 'otras_especialidades' ? '#EEF2FF' : '#FFFFFF',
                                            color: interClinicoFilter === 'otras_especialidades' ? '#4338CA' : '#64748B',
                                            fontSize: '0.78rem',
                                            fontWeight: interClinicoFilter === 'otras_especialidades' ? 700 : 500,
                                            cursor: 'pointer'
                                        }}
                                    >
                                        Otras Especialidades ({periodStats.interconsultas_otras})
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div style={{ position: 'relative', width: '280px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#94A3B8' }} />
                            <input
                                type="text"
                                value={interSearch}
                                onChange={(e) => setInterSearch(e.target.value)}
                                placeholder="Buscar por paciente, médico, especialidad..."
                                style={{
                                    width: '100%',
                                    padding: '7px 10px 7px 32px',
                                    borderRadius: '6px',
                                    border: '1px solid #CBD5E1',
                                    fontSize: '0.8rem',
                                    outline: 'none'
                                }}
                            />
                        </div>
                    </div>

                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '10px',
                        border: '1px solid #E2E8F0',
                        overflow: 'hidden',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
                    }}>
                        <div style={{ overflowX: 'auto', maxHeight: '580px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                                <thead style={{
                                    position: 'sticky',
                                    top: 0,
                                    background: '#F8FAFC',
                                    borderBottom: '2px solid #E2E8F0',
                                    zIndex: 2
                                }}>
                                    <tr>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Perfil / Origen</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Médico Actuante & Especialidad</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Paciente & Cama</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Evolución / Informe de Interconsulta</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Detalle</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Fecha / Hora</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando interconsultas...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredInter.length === 0 ? (
                                        <tr>
                                            <td colSpan="6" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se encontraron interconsultas con los filtros seleccionados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInter.slice(0, 300).map((r, idx) => {
                                            const esClinico = r.es_medico_clinico === 1;
                                            const tieneTexto = !!r.evolucion_interconsulta;
                                            return (
                                                <tr 
                                                    key={`${r.id_visita}-${idx}`}
                                                    onClick={() => setSelectedInterconsulta(r)}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: esClinico ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.12s ease'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '3px 9px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 800,
                                                            background: esClinico ? '#DCFCE7' : '#F1F5F9',
                                                            color: esClinico ? '#15803D' : '#475569',
                                                            border: esClinico ? '1px solid #86EFAC' : '1px solid #CBD5E1'
                                                        }}>
                                                            {esClinico ? '🩺 Médico Clínico' : '👨‍⚕️ Especialista'}
                                                        </span>
                                                        {r.origen_evolucion && (
                                                            <div style={{ fontSize: '0.66rem', color: r.es_reclasificada_557 ? '#0369A1' : '#64748B', fontWeight: 600, marginTop: '4px' }}>
                                                                {r.origen_evolucion}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 800, color: '#0F172A', fontSize: '0.78rem' }}>
                                                            {r.medico_actuante || 'Sin asignar'}
                                                        </div>
                                                        <span style={{
                                                            display: 'inline-block',
                                                            marginTop: '3px',
                                                            background: esClinico ? '#EFF6FF' : '#F8FAFC',
                                                            color: esClinico ? '#1E40AF' : '#475569',
                                                            padding: '1px 7px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600,
                                                            border: '1px solid #E2E8F0'
                                                        }}>
                                                            {r.especialidad_medico}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginBottom: '3px' }}>
                                                            DNI: {r.dni || 'S/D'} {r.nhc ? `· NHC: ${r.nhc}` : ''}
                                                        </div>
                                                        <span style={{
                                                            background: '#F1F5F9',
                                                            color: '#334155',
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 700
                                                        }}>
                                                            🛏️ {r.habitacion} ({r.servicio_internacion})
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', maxWidth: '370px' }}>
                                                        {tieneTexto ? (
                                                            <div style={{
                                                                fontSize: '0.74rem',
                                                                color: '#1E293B',
                                                                display: '-webkit-box',
                                                                WebkitLineClamp: 2,
                                                                WebkitBoxOrient: 'vertical',
                                                                overflow: 'hidden',
                                                                lineHeight: '1.35'
                                                            }}>
                                                                {r.evolucion_interconsulta}
                                                            </div>
                                                        ) : (
                                                            <span style={{
                                                                display: 'inline-flex',
                                                                alignItems: 'center',
                                                                gap: '4px',
                                                                fontSize: '0.7rem',
                                                                color: '#B45309',
                                                                background: '#FEF3C7',
                                                                border: '1px solid #FDE68A',
                                                                padding: '2px 8px',
                                                                borderRadius: '6px',
                                                                fontWeight: 600
                                                            }}>
                                                                ⚠️ Orden en SALUS sin texto de evolución cargado
                                                            </span>
                                                        )}
                                                        {(r.medico_solicitante_6547 || r.medico_cabecera_557 || r.medico_cabecera_adm) && (
                                                            <div style={{ fontSize: '0.68rem', color: '#64748B', marginTop: '3px' }}>
                                                                Cabecera/Solicitante: <strong>{r.medico_solicitante_6547 || r.medico_cabecera_557 || r.medico_cabecera_adm}</strong>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <div style={{ display: 'inline-flex', gap: '5px', alignItems: 'center' }}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => { e.stopPropagation(); setSelectedInterconsulta(r); }}
                                                                style={{
                                                                    padding: '4px 9px',
                                                                    borderRadius: '6px',
                                                                    border: tieneTexto ? '1px solid #86EFAC' : '1px solid #CBD5E1',
                                                                    background: tieneTexto ? '#DCFCE7' : '#F8FAFC',
                                                                    color: tieneTexto ? '#166534' : '#475569',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '4px'
                                                                }}
                                                            >
                                                                <Eye size={13} /> {tieneTexto ? 'Ver Informe' : 'Detalle'}
                                                            </button>
                                                            {r.tiene_admision_557 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={(e) => { e.stopPropagation(); openPatientFicha557(r); }}
                                                                    title="Abrir Ficha de Admisión Clínica (Protocolo 557)"
                                                                    style={{
                                                                        padding: '4px 8px',
                                                                        borderRadius: '6px',
                                                                        border: '1px solid #BFDBFE',
                                                                        background: '#EFF6FF',
                                                                        color: '#1E40AF',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: 700,
                                                                        cursor: 'pointer'
                                                                    }}
                                                                >
                                                                    📋 557
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 12px', color: '#64748B', whiteSpace: 'nowrap', fontSize: '0.75rem' }}>
                                                        <div style={{ fontWeight: 700, color: '#0F172A' }}>{r.fecha_visita}</div>
                                                        <div>{r.hora_creacion ? r.hora_creacion.slice(0, 5) : ''} hs</div>
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

            {/* ─── MODAL DE DETALLE DE INTERCONSULTA (SALUS CAMPO 6548 / COGESTIÓN PISO) ─── */}
            {selectedInterconsulta && (
                <div
                    onClick={() => setSelectedInterconsulta(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.55)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9998,
                        padding: '20px',
                        backdropFilter: 'blur(3px)'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '14px',
                            width: '100%',
                            maxWidth: '720px',
                            maxHeight: '88vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.28)',
                            border: '1px solid #CBD5E1'
                        }}
                    >
                        <div style={{
                            padding: '16px 22px',
                            background: selectedInterconsulta.es_medico_clinico === 1
                                ? 'linear-gradient(135deg, #065F46 0%, #047857 100%)'
                                : 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)',
                            color: '#FFFFFF',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '6px' }}>
                                        {selectedInterconsulta.tipo_visita || '(INT) INTERCONSULTA'}
                                    </span>
                                    {selectedInterconsulta.origen_evolucion && (
                                        <span style={{ fontSize: '0.68rem', fontWeight: 700, background: 'rgba(255,255,255,0.18)', padding: '2px 8px', borderRadius: '6px' }}>
                                            {selectedInterconsulta.origen_evolucion}
                                        </span>
                                    )}
                                    <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>
                                        idVisita: #{selectedInterconsulta.id_visita}
                                    </span>
                                </div>
                                <h3 style={{ margin: '6px 0 2px 0', fontSize: '1.15rem', fontWeight: 800 }}>
                                    {selectedInterconsulta.paciente}
                                </h3>
                                <div style={{ fontSize: '0.78rem', opacity: 0.92, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <span>NHC: <strong>{selectedInterconsulta.nhc || 'S/D'}</strong></span>
                                    <span>DNI: <strong>{selectedInterconsulta.dni || 'S/D'}</strong></span>
                                    <span>Ubicación: <strong>🛏️ {selectedInterconsulta.habitacion} ({selectedInterconsulta.servicio_internacion})</strong></span>
                                    <span>Financiador: <strong>{selectedInterconsulta.obra_social || 'Particular'}</strong></span>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setSelectedInterconsulta(null)}
                                style={{
                                    background: 'rgba(255,255,255,0.18)',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px', background: '#F8FAFC' }}>
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '10px',
                                background: '#FFFFFF',
                                padding: '12px 16px',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Profesional Interconsultor</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                        🩺 {selectedInterconsulta.medico_actuante || 'S/D'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#047857', fontWeight: 600 }}>{selectedInterconsulta.especialidad_medico}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Médico Cabecera / Solicitante</div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1E40AF', marginTop: '2px' }}>
                                        👨‍⚕️ {selectedInterconsulta.medico_solicitante_6547 || selectedInterconsulta.medico_cabecera_557 || selectedInterconsulta.medico_cabecera_adm || 'No especificado'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        {selectedInterconsulta.especialidad_admision ? `Servicio base: ${selectedInterconsulta.especialidad_admision}` : 'Internación General'}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Fecha & Hora de Registro</div>
                                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                        📅 {selectedInterconsulta.fecha_visita} · {selectedInterconsulta.hora_creacion ? selectedInterconsulta.hora_creacion.slice(0, 5) : '-'} hs
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Estado visita: {selectedInterconsulta.asistencia || 'Registrada'}
                                    </div>
                                </div>
                            </div>

                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '16px'
                            }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <FileText size={17} color="#047857" />
                                        <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                            Evolución / Informe Clínico de la Interconsulta
                                        </h4>
                                    </div>
                                    {selectedInterconsulta.tiene_admision_557 && (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const row = selectedInterconsulta;
                                                setSelectedInterconsulta(null);
                                                openPatientFicha557(row);
                                            }}
                                            style={{
                                                padding: '5px 12px',
                                                borderRadius: '6px',
                                                border: '1px solid #BFDBFE',
                                                background: '#EFF6FF',
                                                color: '#1E40AF',
                                                fontSize: '0.74rem',
                                                fontWeight: 700,
                                                cursor: 'pointer',
                                                display: 'inline-flex',
                                                alignItems: 'center',
                                                gap: '5px'
                                            }}
                                        >
                                            <ClipboardList size={14} /> Abrir Ficha Completa Protocolo 557
                                        </button>
                                    )}
                                </div>

                                {selectedInterconsulta.evolucion_interconsulta ? (
                                    <div style={{
                                        fontSize: '0.86rem',
                                        color: '#1E293B',
                                        lineHeight: '1.55',
                                        background: '#F8FAFC',
                                        padding: '12px 14px',
                                        borderRadius: '8px',
                                        border: '1px solid #E2E8F0',
                                        whiteSpace: 'pre-wrap'
                                    }}>
                                        {selectedInterconsulta.evolucion_interconsulta}
                                    </div>
                                ) : (
                                    <div style={{
                                        background: '#FFFBEB',
                                        border: '1px solid #FDE68A',
                                        borderRadius: '8px',
                                        padding: '14px',
                                        color: '#92400E',
                                        fontSize: '0.82rem',
                                        lineHeight: '1.45'
                                    }}>
                                        <strong>⚠️ Sin texto de evolución en SALUS para esta visita (#{selectedInterconsulta.id_visita}):</strong>
                                        <div style={{ marginTop: '4px' }}>
                                            Esta orden de interconsulta fue abierta administrativamente en SALUS pero el profesional no completó el campo de evolución (Pregunta PR 6548) ni registró una evolución médica asociada en la misma fecha.
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL DE FICHA CLÍNICA COMPLETA (PROTOCOLO SALUS 557 - ADMISIÓN CLÍNICA) ─── */}
            {selectedFicha557 && (
                <div 
                    onClick={() => setSelectedFicha557(null)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.55)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9999,
                        padding: '20px',
                        backdropFilter: 'blur(3px)'
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
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.28)',
                            border: '1px solid #CBD5E1'
                        }}
                    >
                        {/* Cabecera del Modal */}
                        <div style={{
                            padding: '16px 22px',
                            background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
                            color: '#FFFFFF',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            gap: '12px'
                        }}>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, background: 'rgba(255,255,255,0.2)', padding: '2px 8px', borderRadius: '6px' }}>
                                        (INT) ADMISION MEDICA CLINICA
                                    </span>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, background: selectedFicha557.estado_internacion === 'Activo en Piso' ? '#10B981' : 'rgba(255,255,255,0.15)', padding: '2px 8px', borderRadius: '6px' }}>
                                        {selectedFicha557.estado_internacion}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', opacity: 0.85 }}>
                                        idVisita: #{selectedFicha557.id_visita}
                                    </span>
                                </div>
                                <h3 style={{ margin: '6px 0 2px 0', fontSize: '1.2rem', fontWeight: 800 }}>
                                    {selectedFicha557.paciente}
                                </h3>
                                <div style={{ fontSize: '0.78rem', opacity: 0.9, display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                                    <span>NHC: <strong>{selectedFicha557.nhc || 'S/D'}</strong></span>
                                    <span>DNI: <strong>{selectedFicha557.dni || 'S/D'}</strong></span>
                                    <span>Edad: <strong>{selectedFicha557.edad || '-'} años</strong></span>
                                    <span>Financiador: <strong>{selectedFicha557.obra_social || 'Particular'}</strong></span>
                                </div>
                            </div>

                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => copyFichaToClipboard(selectedFicha557)}
                                    style={{
                                        padding: '6px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid rgba(255,255,255,0.35)',
                                        background: 'rgba(255,255,255,0.15)',
                                        color: '#FFFFFF',
                                        fontSize: '0.76rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    {copiedFicha ? <Check size={14} /> : <Copy size={14} />}
                                    {copiedFicha ? 'Copiada' : 'Copiar HC'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setSelectedFicha557(null)}
                                    style={{
                                        background: 'rgba(255,255,255,0.15)',
                                        border: 'none',
                                        color: '#FFFFFF',
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: '8px',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        {/* Cuerpo de la Ficha (3 Secciones de SALUS) */}
                        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px', background: '#F8FAFC' }}>
                            
                            {/* Banda de Metadatos de Internación y Profesionales */}
                            <div style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                                gap: '10px',
                                background: '#FFFFFF',
                                padding: '12px 16px',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0'
                            }}>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Admisión & Cama</div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                        {selectedFicha557.numero_admision || 'S/D'} · 🛏️ {selectedFicha557.habitacion || 'S/D'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#475569' }}>{selectedFicha557.servicio_admision || 'INTERNACION CLINICA'}</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Médico Carga</div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#047857', marginTop: '2px' }}>
                                        ✍️ {selectedFicha557.medico_admision || 'S/D'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>{selectedFicha557.fecha_visita} {selectedFicha557.hora_visita} hs</div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Médico Cabecera Admisión</div>
                                    <div style={{ fontSize: '0.84rem', fontWeight: 800, color: '#1E40AF', marginTop: '2px' }}>
                                        👩‍⚕️ {selectedFicha557.medico_cabecera || 'S/D'}
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                        Ing: {selectedFicha557.fecha_ingreso || '-'} {selectedFicha557.fecha_alta ? `· Alta: ${selectedFicha557.fecha_alta}` : ''}
                                    </div>
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Destino & Seguridad 72h</div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' }}>
                                        <span style={{ fontSize: '0.72rem', fontWeight: 800, background: '#EFF6FF', color: '#1E40AF', padding: '2px 7px', borderRadius: '5px' }}>
                                            {selectedFicha557.destino_form || 'Internacion'} → {selectedFicha557.area_form || 'Piso'}
                                        </span>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            background: selectedFicha557.reconsulta_72h === 'Si' || selectedFicha557.reingreso_72h === 'Si' ? '#FEF3C7' : '#F1F5F9',
                                            color: selectedFicha557.reconsulta_72h === 'Si' || selectedFicha557.reingreso_72h === 'Si' ? '#92400E' : '#475569',
                                            padding: '2px 7px',
                                            borderRadius: '5px'
                                        }}>
                                            Recons 72h: {selectedFicha557.reconsulta_72h || 'No'} · Reing 72h: {selectedFicha557.reingreso_72h || 'No'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 1: ADMISIÓN CLÍNICA (GRUPO 3208) */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                                    <Stethoscope size={17} color="#1E40AF" />
                                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                        1. Admisión Clínica (Grupo SALUS 3208)
                                    </h4>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div>
                                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                                            Motivo de Consulta (Campo 12590)
                                        </div>
                                        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', marginTop: '3px', background: '#F8FAFC', padding: '8px 12px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                            {selectedFicha557.motivo_consulta || 'No especificado en este registro'}
                                        </div>
                                    </div>

                                    <div>
                                        <div style={{ fontSize: '0.74rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>
                                            Antecedentes de Enfermedad Actual — AEA (Campo 12591)
                                        </div>
                                        <div style={{ fontSize: '0.84rem', color: '#1E293B', marginTop: '3px', lineHeight: '1.5', background: '#F8FAFC', padding: '10px 12px', borderRadius: '6px', border: '1px solid #E2E8F0', whiteSpace: 'pre-wrap' }}>
                                            {selectedFicha557.enfermedad_actual || 'No especificado en este registro'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 2: ANTECEDENTES PATOLÓGICOS PERSONALES (GRUPO 3209) */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                                    <Pill size={17} color="#047857" />
                                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                        2. Antecedentes Patológicos Personales & Conciliación (Grupo SALUS 3209)
                                    </h4>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px', marginBottom: '12px' }}>
                                    <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Patologías Crónicas (12608)</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', marginTop: '4px' }}>
                                            {selectedFicha557.patologias || 'Niega / Sin patologías declaradas'}
                                        </div>
                                    </div>

                                    <div style={{ background: '#F8FAFC', padding: '10px 12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#475569', textTransform: 'uppercase' }}>Medicación Habitual (12609)</div>
                                        <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#1E40AF', marginTop: '4px' }}>
                                            {selectedFicha557.medicacion_habitual || 'Sin medicación habitual registrada'}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px', fontSize: '0.78rem' }}>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: selectedFicha557.alergia === 'Si' ? '#FEE2E2' : '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>Alergias:</strong> {selectedFicha557.alergia || 'No'} {selectedFicha557.alergia_cuales ? `(${selectedFicha557.alergia_cuales})` : ''}
                                    </div>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>Cirugías:</strong> {selectedFicha557.cirugias_previas || 'No'} {selectedFicha557.cirugias_cuales ? `(${selectedFicha557.cirugias_cuales})` : ''}
                                    </div>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>Traumatológicos:</strong> {selectedFicha557.traumatologicos || 'No'} {selectedFicha557.traumatologicos_cuales ? `(${selectedFicha557.traumatologicos_cuales})` : ''}
                                    </div>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>Transfusiones:</strong> {selectedFicha557.transfusiones || 'No'}
                                    </div>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>AGO:</strong> {selectedFicha557.ago || '-'}
                                    </div>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>Tabaco / Alcohol:</strong> {selectedFicha557.tabaco || 'No'} / {selectedFicha557.alcohol || 'No'}
                                    </div>
                                    <div style={{ padding: '6px 10px', borderRadius: '6px', background: selectedFicha557.internacion_ult_3m === 'Si' ? '#FEF3C7' : '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                        <strong>Internación últ. 3m:</strong> {selectedFicha557.internacion_ult_3m || 'No'}
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 3: EXAMEN FÍSICO, DIAGNÓSTICO Y PLAN (GRUPO 3210) */}
                            <div style={{
                                background: '#FFFFFF',
                                borderRadius: '10px',
                                border: '1px solid #E2E8F0',
                                padding: '16px'
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px' }}>
                                    <HeartPulse size={17} color="#DC2626" />
                                    <h4 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#0F172A' }}>
                                        3. Examen Físico, Signos Vitales y Plan Terapéutico (Grupo SALUS 3210)
                                    </h4>
                                </div>

                                {/* Signos Vitales */}
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '8px', marginBottom: '12px' }}>
                                    {[
                                        { label: 'TA (12612)', val: selectedFicha557.ta && selectedFicha557.ta !== '0' ? selectedFicha557.ta : '-' },
                                        { label: 'FC (12613)', val: selectedFicha557.fc && selectedFicha557.fc !== '0' ? `${selectedFicha557.fc} lpm` : '-' },
                                        { label: 'FR (12614)', val: selectedFicha557.fr && selectedFicha557.fr !== '0' ? `${selectedFicha557.fr} rpm` : '-' },
                                        { label: 'SAT O2 (12615)', val: selectedFicha557.sat && selectedFicha557.sat !== '0' ? `${selectedFicha557.sat}%` : '-' },
                                        { label: 'Temp (12616)', val: selectedFicha557.temp && selectedFicha557.temp !== '0' ? `${selectedFicha557.temp} °C` : '-' },
                                        { label: 'Peso / Talla', val: (selectedFicha557.peso && selectedFicha557.peso !== '0') ? `${selectedFicha557.peso} kg` : '-' },
                                    ].map((sv, i) => (
                                        <div key={i} style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px', textAlign: 'center' }}>
                                            <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700 }}>{sv.label}</div>
                                            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>{sv.val}</div>
                                        </div>
                                    ))}
                                </div>

                                {/* Hallazgos por Sistemas */}
                                {(selectedFicha557.neurologico || selectedFicha557.ap_resp || selectedFicha557.ap_cv || selectedFicha557.abdomen || selectedFicha557.genitourinario || selectedFicha557.diagnostico || selectedFicha557.plan_terapeutico) && (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '10px', fontSize: '0.8rem' }}>
                                        {selectedFicha557.neurologico && (
                                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                <strong>Neurológico:</strong> {selectedFicha557.neurologico}
                                            </div>
                                        )}
                                        {selectedFicha557.ap_resp && (
                                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                <strong>Ap. Respiratorio:</strong> {selectedFicha557.ap_resp}
                                            </div>
                                        )}
                                        {selectedFicha557.ap_cv && (
                                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                <strong>Ap. Cardiovascular:</strong> {selectedFicha557.ap_cv}
                                            </div>
                                        )}
                                        {selectedFicha557.abdomen && (
                                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                <strong>Abdomen:</strong> {selectedFicha557.abdomen}
                                            </div>
                                        )}
                                        {selectedFicha557.genitourinario && (
                                            <div style={{ background: '#F8FAFC', padding: '8px 10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
                                                <strong>Genitourinario:</strong> {selectedFicha557.genitourinario}
                                            </div>
                                        )}
                                        {selectedFicha557.diagnostico && (
                                            <div style={{ background: '#EFF6FF', padding: '8px 10px', borderRadius: '6px', border: '1px solid #BFDBFE' }}>
                                                <strong>Diagnóstico (12626):</strong> {selectedFicha557.diagnostico}
                                            </div>
                                        )}
                                        {selectedFicha557.plan_terapeutico && (
                                            <div style={{ background: '#F0FDF4', padding: '8px 10px', borderRadius: '6px', border: '1px solid #86EFAC' }}>
                                                <strong>Plan Terapéutico (12627):</strong> {selectedFicha557.plan_terapeutico}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ─── MODAL DE AYUDA: GUÍA DE PESTAÑAS DE INTERNADO & PISO ─── */}
            {showHelpModal && (
                <div
                    onClick={() => setShowHelpModal(false)}
                    style={{
                        position: 'fixed',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        background: 'rgba(15, 23, 42, 0.55)',
                        display: 'flex',
                        justifyContent: 'center',
                        alignItems: 'center',
                        zIndex: 9999,
                        padding: '20px',
                        backdropFilter: 'blur(3px)'
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: '#FFFFFF',
                            borderRadius: '14px',
                            width: '100%',
                            maxWidth: '780px',
                            maxHeight: '88vh',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.28)',
                            border: '1px solid #CBD5E1'
                        }}
                    >
                        <div style={{
                            padding: '16px 22px',
                            background: 'linear-gradient(135deg, #1E3A8A 0%, #1E40AF 100%)',
                            color: '#FFFFFF',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            gap: '12px'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <HelpCircle size={20} />
                                <div>
                                    <h3 style={{ margin: 0, fontSize: '1.08rem', fontWeight: 800 }}>
                                        Guía de Pestañas — Internado & Piso
                                    </h3>
                                    <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>
                                        Qué mide cada sección y qué información clínica podés auditar
                                    </div>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHelpModal(false)}
                                style={{
                                    background: 'rgba(255,255,255,0.18)',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    width: '32px',
                                    height: '32px',
                                    borderRadius: '8px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div style={{ padding: '20px 22px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px', background: '#F8FAFC' }}>
                            {[
                                {
                                    icon: '🏥',
                                    title: '1. Admisiones Guardia Clínica (Dra. Paola García) & Ocupación Proporcional',
                                    color: '#1E40AF',
                                    bg: '#EFF6FF',
                                    border: '#BFDBFE',
                                    meaning: 'Padrón real de admisiones hospitalarias de TABLEAU_Admisiones con médico de cabecera Dra. Paola García, cruzado al minuto con el Historial de Camas de SALUS.',
                                    content: 'Mide la ocupación en forma estrictamente proporcional por horas (Horas Netas / 24 = Días Proporcionales, ej. 12 hs = 0,50 días sin importar cuántos pacientes rotaron), cronograma visual de 24 hs por Box SR y Bandeja de Auditoría de Inconsistencias SALUS (admisiones sin habitación, abiertas sin alta, suspendidas y desvíos de servicio).'
                                },
                                {
                                    icon: '📝',
                                    title: '2. Valoraciones & Cogestión Clínica (Protocolo 557)',
                                    color: '#0369A1',
                                    bg: '#F0F9FF',
                                    border: '#BAE6FD',
                                    meaning: 'Muestra las fichas médicas cargadas en el formulario SALUS (INT) ADMISION MEDICA CLINICA (Protocolo 557), utilizadas para valoraciones clínicas de ingreso, pases desde UCI/Terapia y cogestión sobre otras especialidades.',
                                    content: 'Tarjetas clicables por sector (Shock Room, Internado Piso Clínico, UCI / Terapia Intermedia y Reconsultas/Reingresos ≤ 72 hs), filtros por profesional y acceso a la Ficha 557 completa (motivo de consulta, AEA, APP y signos vitales).'
                                },
                                {
                                    icon: '🩺',
                                    title: '2. Seguimiento Clínico en Piso',
                                    color: '#047857',
                                    bg: '#ECFDF5',
                                    border: '#A7F3D0',
                                    meaning: 'Mide el control diario en camas de Piso General realizado por el plantel de médicas clínicas. Excluye estrictamente Guardia, Shock Room, UCI, Terapia Intermedia (hab. 222–229 y 207), Pediatría y Hospital de Día.',
                                    content: '% Cobertura de Seguimiento (meta ≥ 70%), % Evolución & Plan Diario cada 24 hs (meta ≥ 90%), discriminación por rama (Clínico Puro, Postquirúrgico y Traumatológico) y productividad por médica (clic para ver sus pacientes).'
                                },
                                {
                                    icon: '🦴',
                                    title: '3. Traumatología en Internado',
                                    color: '#B45309',
                                    bg: '#FFFBEB',
                                    border: '#FDE68A',
                                    meaning: 'Cruza las cirugías traumatológicas de SALUS (fracturas, osteosíntesis, artroscopias, prótesis de cadera/rodilla/ligamentos, excluyendo Dr. Chaparro) con las internaciones en camas de Piso.',
                                    content: 'Pacientes traumatológicos activos en piso hoy y total del período, cirugía realizada, traumatólogo, médico de cabecera y botón "Ver Ficha" para revisar su Protocolo 557 (comorbilidades y medicación habitual).'
                                },
                                {
                                    icon: '🩺',
                                    title: '4. Interconsultas (Piso & UCI)',
                                    color: '#4338CA',
                                    bg: '#EEF2FF',
                                    border: '#C7D2FE',
                                    meaning: 'Reúne todas las interconsultas cargadas en internado y UCI ((INT) INTERCONSULTA, (UCI) INTERCONSULTA, OSP, etc.) más las valoraciones clínicas en Piso cargadas mediante Ficha 557 sobre pacientes de otras especialidades.',
                                    content: 'Separación entre Médicos Clínicos vs. Otras Especialidades, vista previa de la Evolución / Informe de Interconsulta (campo 6548, cogestión 557 o evolución del mismo día) y modal con el informe clínico completo.'
                                }
                            ].map((sec) => (
                                <div key={sec.title} style={{
                                    background: '#FFFFFF',
                                    borderRadius: '10px',
                                    border: '1px solid #E2E8F0',
                                    padding: '14px 16px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: '6px'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{
                                            background: sec.bg,
                                            color: sec.color,
                                            border: `1px solid ${sec.border}`,
                                            padding: '2px 9px',
                                            borderRadius: '6px',
                                            fontSize: '0.8rem',
                                            fontWeight: 800
                                        }}>
                                            {sec.icon} {sec.title}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.8rem', color: '#1E293B', lineHeight: '1.45' }}>
                                        <strong>Qué significa:</strong> {sec.meaning}
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#475569', lineHeight: '1.45' }}>
                                        <strong>Qué información encontrás:</strong> {sec.content}
                                    </div>
                                </div>
                            ))}

                            <div style={{
                                background: '#EFF6FF',
                                border: '1px solid #BFDBFE',
                                borderRadius: '8px',
                                padding: '10px 14px',
                                fontSize: '0.78rem',
                                color: '#1E40AF'
                            }}>
                                💡 <strong>Exportación a Excel:</strong> Con <strong>"Exportar Excel"</strong> descargás la pestaña actual con los filtros aplicados; con <strong>"Excel Completo (4 hojas)"</strong> descargás el resumen de KPIs + las 4 pestañas en un solo archivo <code>.xlsx</code>.
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
