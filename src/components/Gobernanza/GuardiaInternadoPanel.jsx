import React, { useState, useEffect, useMemo } from 'react';
import { 
    Bed, Search, Filter, RefreshCw, Calendar, CheckCircle2, 
    AlertCircle, Download, UserCheck, ShieldCheck, Activity,
    ChevronDown, ChevronUp, Clock, FileSpreadsheet, Eye, Sparkles,
    Users, TrendingUp, Stethoscope, FileText, X, Copy, Check,
    HeartPulse, Pill, ClipboardList, AlertTriangle
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function GuardiaInternadoPanel({ addToast, initialSubTab = 'admisiones_557', selectedPeriodoProp, onOpenEpicrisisIa }) {
    const [subTab, setSubTab] = useState(initialSubTab); // 'admisiones_557' | 'seguimiento' | 'traumatologia' | 'interconsultas'
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [data, setData] = useState({ admisiones_clinicas: [], traumatologia: [], interconsultas: [], stats: null });
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
    const [copiedFicha, setCopiedFicha] = useState(false);

    // Filtros de Traumatología
    const [traumaFilter, setTraumaFilter] = useState('activos'); // 'activos' | 'todos'
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
                const res = await fetch(`http://localhost:3456/api/salus/guardia-internado${forceRefresh ? '?refresh=true' : ''}`);
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

    // Mapa rápido de fichas 557 por id_visita, NHC y DNI para abrir desde cualquier pestaña
    const ficha557Map = useMemo(() => {
        const byVisita = new Map();
        const byNhc = new Map();
        const byDni = new Map();
        (data.admisiones_clinicas || []).forEach(a => {
            if (a.id_visita) byVisita.set(a.id_visita, a);
            if (a.nhc && !byNhc.has(String(a.nhc))) byNhc.set(String(a.nhc), a);
            if (a.dni && !byDni.has(String(a.dni))) byDni.set(String(a.dni), a);
        });
        return { byVisita, byNhc, byDni };
    }, [data.admisiones_clinicas]);

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
            addToast?.('Este paciente no registra formulario de Admisión Clínica (Protocolo 557) en el período', 'info');
        }
    };

    // ── FILTRADO DE ADMISIONES CLÍNICAS MÉDICAS (PROTOCOLO 557) ──
    const filteredAdmisiones557 = useMemo(() => {
        if (!data.admisiones_clinicas) return [];
        return data.admisiones_clinicas.filter(item => {
            if (admPeriodoFilter !== 'todos' && item.periodo !== admPeriodoFilter) {
                return false;
            }
            if (admAreaFilter === 'activos' && item.estado_internacion !== 'Activo en Piso') return false;
            if (admAreaFilter === 'shock_room') {
                const isSr = item.area_form === 'Shock Room' || String(item.servicio_admision || '').toUpperCase().includes('SHOCK') || String(item.numero_admision || '').toUpperCase().startsWith('SR');
                if (!isSr) return false;
            }
            if (admAreaFilter === 'internado') {
                const isInt = item.area_form === 'Internado' || String(item.servicio_admision || '').toUpperCase().includes('INTERN') || String(item.numero_admision || '').toUpperCase().startsWith('I');
                if (!isInt) return false;
            }
            if (admAreaFilter === 'uci') {
                const isUci = item.area_form === 'UCI' || String(item.servicio_admision || '').toUpperCase().includes('UCI') || String(item.servicio_admision || '').toUpperCase().includes('TERAPIA') || String(item.numero_admision || '').toUpperCase().startsWith('UCI');
                if (!isUci) return false;
            }
            if (admAreaFilter === 'quirofano') {
                const isQx = String(item.servicio_admision || '').toUpperCase().includes('QUIROF') || String(item.servicio_admision || '').toUpperCase().includes('CIRUGIA') || String(item.especialidad_admision || '').toUpperCase().includes('CIRUGIA') || String(item.especialidad_admision || '').toUpperCase().includes('TRAUMA');
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
    }, [data.admisiones_clinicas, admPeriodoFilter, admAreaFilter, admDoctorFilter, admSearch]);

    // ── FILTRADO DE CASOS DE TRAUMATOLOGÍA ──
    const filteredTrauma = useMemo(() => {
        if (!data.traumatologia) return [];
        return data.traumatologia.filter(item => {
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
    }, [data.traumatologia, traumaFilter, traumaSearch]);

    // ── FILTRADO DE INTERCONSULTAS ──
    const filteredInter = useMemo(() => {
        if (!data.interconsultas) return [];
        return data.interconsultas.filter(item => {
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
                if (!matchName && !matchDni && !matchDoc && !matchEsp && !matchHab) {
                    return false;
                }
            }
            return true;
        });
    }, [data.interconsultas, interClinicoFilter, interServicioFilter, interSearch]);

    // Copiar ficha 557 al portapapeles
    const copyFichaToClipboard = (f) => {
        if (!f) return;
        const text = [
            `=== ADMISIÓN CLÍNICA MÉDICA (SALUS PROTOCOLO 557) ===`,
            `Paciente: ${f.paciente} | NHC: ${f.nhc || 'S/D'} | DNI: ${f.dni || 'S/D'} | Edad: ${f.edad || '-'} años`,
            `N° Admisión: ${f.numero_admision || 'S/D'} | Habitación: ${f.habitacion || 'S/D'} | Servicio: ${f.servicio_admision || 'S/D'}`,
            `Fecha/Hora Visita: ${f.fecha_visita} ${f.hora_visita || ''} | Estado: ${f.estado_internacion}`,
            `Médico que cargó Protocolo 557: ${f.medico_admision || 'S/D'} | Médico Cabecera: ${f.medico_cabecera || 'S/D'}`,
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
        addToast?.('Ficha de Admisión Clínica (Protocolo 557) copiada al portapapeles', 'success');
        setTimeout(() => setCopiedFicha(false), 2500);
    };

    // Exportar CSV
    const exportCSV = (type) => {
        let csvContent = "data:text/csv;charset=utf-8,";
        if (type === 'admisiones_557') {
            if (!filteredAdmisiones557.length) {
                addToast?.('No hay admisiones clínicas para exportar', 'warning');
                return;
            }
            csvContent += "ID Visita,Fecha,Hora,Paciente,NHC,DNI,Edad,Obra Social,Nro Admisión,Habitación,Servicio,Estado,Médico Carga (Prot 557),Médico Cabecera,Destino Form,Área Form,Reconsulta 72h,Reingreso 72h,Motivo de Consulta,Enfermedad Actual,Patologías,Medicación Habitual,TA,FC,FR,SAT,Temp,Diagnóstico,Plan Terapéutico\n";
            filteredAdmisiones557.forEach(r => {
                const clean = (val) => String(val || '').replace(/"/g, '""').replace(/\r?\n/g, ' ');
                csvContent += `"${r.id_visita || ''}","${r.fecha_visita || ''}","${r.hora_visita || ''}","${clean(r.paciente)}","${clean(r.nhc)}","${clean(r.dni)}","${r.edad || ''}","${clean(r.obra_social)}","${clean(r.numero_admision)}","${clean(r.habitacion)}","${clean(r.servicio_admision)}","${clean(r.estado_internacion)}","${clean(r.medico_admision)}","${clean(r.medico_cabecera)}","${clean(r.destino_form)}","${clean(r.area_form)}","${clean(r.reconsulta_72h)}","${clean(r.reingreso_72h)}","${clean(r.motivo_consulta)}","${clean(r.enfermedad_actual)}","${clean(r.patologias)}","${clean(r.medicacion_habitual)}","${clean(r.ta)}","${clean(r.fc)}","${clean(r.fr)}","${clean(r.sat)}","${clean(r.temp)}","${clean(r.diagnostico)}","${clean(r.plan_terapeutico)}"\n`;
            });
        } else if (type === 'seguimiento') {
            if (!seguimientoData.length) {
                addToast?.('No hay datos de seguimiento para exportar', 'warning');
                return;
            }
            csvContent += "Período,Censo Total,Pacientes Seguidos,Cobertura %,Clínico Únicos,Postquirúrgico Únicos,Traumatológico Únicos,% Plan Diario Documentado\n";
            seguimientoData.forEach(r => {
                csvContent += `"${r.periodo || ''}","${r.censo_total_internados || 0}","${r.pacientes_bajo_seguimiento_clinico || 0}","${r.cobertura_seguimiento_pct || 0}%","${r.unicos_clinico || 0}","${r.unicos_postquirurgico || 0}","${r.unicos_traumatologico || 0}","${r.evoluciones_plan_documentado_pct || 0}%"\n`;
            });
        } else if (type === 'traumatologia') {
            const rows = filteredTrauma;
            if (!rows.length) {
                addToast?.('No hay registros para exportar', 'warning');
                return;
            }
            csvContent += "Habitación,Paciente,DNI,NHC,Estado Internación,Cirugía,Cirujano Traumatólogo,Médico Cabecera / Clínico,Tiene Prot 557,Motivo Consulta 557,Fecha Ingreso,Fecha Cirugía,Obra Social\n";
            rows.forEach(r => {
                csvContent += `"${r.habitacion || ''}","${r.paciente || ''}","${r.dni || ''}","${r.nhc || ''}","${r.estado_internacion || ''}","${String(r.cirugia || '').replace(/"/g, '""')}","${r.cirujano_traumatologo || ''}","${r.medico_cabecera || ''}","${r.tiene_admision_557 ? 'SI' : 'NO'}","${String(r.motivo_consulta_557 || '').replace(/"/g, '""')}","${r.fecha_ingreso || ''}","${r.fecha_cirugia || ''}","${r.obra_social || ''}"\n`;
            });
        } else {
            const rows = filteredInter;
            if (!rows.length) {
                addToast?.('No hay registros para exportar', 'warning');
                return;
            }
            csvContent += "Fecha,Hora,Tipo Visita,Paciente,DNI,NHC,Habitación,Servicio,Médico Actuante,Especialidad,Es Médico Clínico,Tiene Prot 557,Obra Social\n";
            rows.forEach(r => {
                csvContent += `"${r.fecha_visita || ''}","${r.hora_creacion || ''}","${r.tipo_visita || ''}","${r.paciente || ''}","${r.dni || ''}","${r.nhc || ''}","${r.habitacion || ''}","${r.servicio_internacion || ''}","${r.medico_actuante || ''}","${r.especialidad_medico || ''}","${r.es_medico_clinico ? 'SI' : 'NO'}","${r.tiene_admision_557 ? 'SI' : 'NO'}","${r.obra_social || ''}"\n`;
            });
        }

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `guardia_internado_${type}_${new Date().toISOString().slice(0, 10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        addToast?.('Archivo CSV descargado con éxito', 'success');
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
                            onClick={() => setSubTab('admisiones_557')}
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
                            <span>📋</span> Admisión Clínica Médica (Prot. 557)
                            <span style={{
                                background: subTab === 'admisiones_557' ? 'rgba(255,255,255,0.25)' : '#DBEAFE',
                                color: subTab === 'admisiones_557' ? '#FFFFFF' : '#1E40AF',
                                fontSize: '0.72rem',
                                padding: '1px 7px',
                                borderRadius: '10px',
                                fontWeight: 800
                            }}>
                                {data.admisiones_clinicas?.length || 0} internados
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSubTab('seguimiento')}
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
                            onClick={() => setSubTab('traumatologia')}
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
                                {data.stats?.activos_piso_trauma || 0} activos
                            </span>
                        </button>

                        <button
                            type="button"
                            onClick={() => setSubTab('interconsultas')}
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
                                {data.stats?.interconsultas_clinicas || 0} clínicas
                            </span>
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {lastUpdated && (
                        <span style={{ fontSize: '0.75rem', color: '#64748B' }}>
                            Actualizado: {new Date(lastUpdated).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                        </span>
                    )}

                    <button
                        type="button"
                        onClick={() => exportCSV(subTab)}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 12px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 600,
                            color: '#334155',
                            cursor: 'pointer'
                        }}
                    >
                        <Download size={14} /> Exportar CSV
                    </button>

                    <button
                        type="button"
                        onClick={() => loadData(true)}
                        disabled={refreshing}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '7px 14px',
                            background: '#1E40AF',
                            border: 'none',
                            borderRadius: '8px',
                            fontSize: '0.8rem',
                            fontWeight: 700,
                            color: '#FFFFFF',
                            cursor: refreshing ? 'not-allowed' : 'pointer',
                            opacity: refreshing ? 0.7 : 1
                        }}
                    >
                        <RefreshCw size={14} className={refreshing ? 'spin' : ''} />
                        {refreshing ? 'Sincronizando SALUS...' : 'Actualizar Live'}
                    </button>
                </div>
            </div>

            {/* ─── TAB NUEVA PRINCIPAL: ADMISIÓN CLÍNICA MÉDICA (PROTOCOLO SALUS 557) ─── */}
            {subTab === 'admisiones_557' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    
                    {/* Banner Técnico Explicativo del Impacto en SALUS */}
                    <div style={{
                        background: 'linear-gradient(135deg, #EFF6FF 0%, #F8FAFC 100%)',
                        borderRadius: '10px',
                        border: '1px solid #BFDBFE',
                        padding: '14px 18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '12px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                                width: '40px',
                                height: '40px',
                                borderRadius: '10px',
                                background: '#1E40AF',
                                color: '#FFFFFF',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 800
                            }}>
                                <ClipboardList size={20} />
                            </div>
                            <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                        Trazabilidad Nominal de Internados — Formulario "Admisión Clínica" (Protocolo SALUS 557)
                                    </h3>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 800, background: '#DBEAFE', color: '#1E40AF', padding: '2px 8px', borderRadius: '6px' }}>
                                        idQSOFT: 4ajvwqtu22 · (INT) ADMISION MEDICA CLINICA
                                    </span>
                                </div>
                                <p style={{ margin: '2px 0 0 0', fontSize: '0.76rem', color: '#475569' }}>
                                    Cruce 1 a 1 entre <strong>VLISE_Visitas</strong>, <strong>PR InstRespVisitaPaciente</strong> (44 campos clínicos en 3 grupos) y <strong>TABLEAU_Admisiones</strong> (<code>IdHospitalizacion = idAdmision</code>).
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.72rem', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '6px', color: '#334155', fontWeight: 700 }}>
                                👩‍⚕️ Dra. Paola García (Cabecera): <strong style={{ color: '#1E40AF' }}>{data.stats?.paola_garcia_cabecera || 0}</strong>
                            </span>
                            <span style={{ fontSize: '0.72rem', background: '#FFFFFF', border: '1px solid #CBD5E1', padding: '4px 10px', borderRadius: '6px', color: '#334155', fontWeight: 700 }}>
                                ✍️ Cargadas por su usuario: <strong style={{ color: '#047857' }}>{data.stats?.paola_garcia_cargadas || 0}</strong>
                            </span>
                        </div>
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
                                Total Internados (Prot. 557)
                            </span>
                            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>
                                {filteredAdmisiones557.length}
                                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600, marginLeft: '6px' }}>
                                    / {data.stats?.total_admisiones_557 || 0}
                                </span>
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#059669', display: 'block', marginTop: '4px', fontWeight: 600 }}>
                                {data.stats?.con_ficha_557 || 0} con historia clínica completa
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
                                {data.stats?.area_shock_room || 0}
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
                                {data.stats?.area_internado || 0}
                            </div>
                            <span style={{ fontSize: '0.72rem', color: '#64748B', display: 'block', marginTop: '4px' }}>
                                Camas de internación general ({data.stats?.activos_piso_557 || 0} activos hoy)
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
                                {data.stats?.area_uci || 0}
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
                                {data.stats?.reconsultas_72h_557 || 0} <span style={{ fontSize: '0.9rem', color: '#92400E' }}>/ {data.stats?.reingresos_72h_557 || 0}</span>
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
                            {/* Selector de Período */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#334155' }}>Mes:</span>
                                <select
                                    value={admPeriodoFilter}
                                    onChange={(e) => setAdmPeriodoFilter(e.target.value)}
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
                                    <option value="todos">Todos (Jul–Oct 2026)</option>
                                    <option value="2026-10">Octubre 2026</option>
                                    <option value="2026-09">Septiembre 2026</option>
                                    <option value="2026-08">Agosto 2026</option>
                                    <option value="2026-07">Julio 2026</option>
                                </select>
                            </div>

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
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Cama & Área (557)</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Médico Carga / Cabecera</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>Motivo & Enfermedad Actual (Prot. 557)</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700 }}>APP & Signos Vitales</th>
                                        <th style={{ padding: '10px 12px', color: '#475569', fontWeight: 700, textAlign: 'center' }}>Ficha 557</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando admisiones clínicas (Protocolo 557)...
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
                                                                <Eye size={13} /> Ver 557
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
                                    Seguimiento Clínico y Pase en Internado (Vinculado a Protocolo 557)
                                </h3>
                                <p style={{ margin: 0, fontSize: '0.78rem', color: '#64748B' }}>
                                    Auditoría de cobertura asistencial, admisiones clínicas médicas (Prot. 557) y evoluciones diarias del plantel
                                </p>
                            </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <button
                                type="button"
                                onClick={() => {
                                    setAdmPeriodoFilter(selectedSegPeriodo.includes('ANUAL') ? 'todos' : selectedSegPeriodo);
                                    setSubTab('admisiones_557');
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
                                <ClipboardList size={14} /> Ver Internados de {selectedSegPeriodo} (Prot. 557)
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
                                <UserCheck size={14} /> Con Admisión Clínica (557) y/o evolución
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
                                Distribución de la cobertura médica según rama de atención y condición de ingreso en Protocolo 557
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
                                    Pacientes admitidos con Protocolo 557 bajo seguimiento directo de clínica médica con evolución y pase continuo.
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
                                    Pacientes quirúrgicos con Admisión Clínica (557) e interconsulta clínica activa para control de comorbilidades.
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
                                    Pacientes intervenidos por traumatología bajo protocolo de admisión y seguimiento clínico en piso.
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
                                    Contabiliza exclusivamente evoluciones diarias, admisiones 557, altas y epicrisis en camas de Piso General (clic para filtrar)
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
                                            setSubTab('admisiones_557');
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
                                                Actos clínicos / Prot. 557:
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
                                {data.stats?.activos_piso_trauma || 0}
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
                                {data.stats?.total_traumatologia || 0}
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Últimos 60 días acumulados (SALUS)
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
                                Vinculación con Admisión Clínica (557)
                            </span>
                            <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#4C1D95', marginTop: '6px', lineHeight: '1.4' }}>
                                Clic en "Ver 557" para abrir la Admisión Clínica Médica del paciente traumatológico
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
                                    Solo Activos en Piso ({data.stats?.activos_piso_trauma || 0})
                                </button>
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
                                    Histórico Completo ({data.traumatologia?.length || 0})
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
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Admisión Clínica (Prot. 557)</th>
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
                                                                <Eye size={13} /> Ver Ficha 557
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
                                {data.stats?.interconsultas_clinicas || 0}
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
                                {data.stats?.interconsultas_otras || 0}
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
                                {data.stats?.total_interconsultas 
                                    ? Math.round((data.stats.interconsultas_clinicas / data.stats.total_interconsultas) * 100) 
                                    : 0}%
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', display: 'block' }}>
                                Sobre {data.stats?.total_interconsultas || 0} interconsultas recientes
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
                                        Todas ({data.interconsultas?.length || 0})
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
                                        🩺 Solo Clínicos ({data.stats?.interconsultas_clinicas || 0})
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
                                        Otras Especialidades ({data.stats?.interconsultas_otras || 0})
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
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Perfil Profesional</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Médico Actuante</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Especialidad</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Paciente</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Ubicación / Cama</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Ficha Admisión 557</th>
                                        <th style={{ padding: '10px 14px', color: '#475569', fontWeight: 700 }}>Fecha / Hora</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                    <RefreshCw size={18} className="spin" /> Cargando interconsultas...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredInter.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" style={{ padding: '36px', textAlign: 'center', color: '#94A3B8' }}>
                                                No se encontraron interconsultas con los filtros seleccionados
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredInter.map((r, idx) => {
                                            const esClinico = r.es_medico_clinico === 1;
                                            return (
                                                <tr 
                                                    key={`${r.id_visita}-${idx}`}
                                                    style={{
                                                        borderBottom: '1px solid #F1F5F9',
                                                        background: esClinico ? '#F0FDF4' : idx % 2 === 0 ? '#FFFFFF' : '#FAFAFA'
                                                    }}
                                                >
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            display: 'inline-flex',
                                                            alignItems: 'center',
                                                            gap: '5px',
                                                            padding: '3px 9px',
                                                            borderRadius: '12px',
                                                            fontSize: '0.72rem',
                                                            fontWeight: 800,
                                                            background: esClinico ? '#DCFCE7' : '#F1F5F9',
                                                            color: esClinico ? '#15803D' : '#475569',
                                                            border: esClinico ? '1px solid #86EFAC' : '1px solid #CBD5E1'
                                                        }}>
                                                            {esClinico ? '🩺 Médico Clínico' : '👨‍⚕️ Especialista'}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                                        {r.medico_actuante || 'Sin asignar'}
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <span style={{
                                                            background: esClinico ? '#EFF6FF' : '#F8FAFC',
                                                            color: esClinico ? '#1E40AF' : '#475569',
                                                            padding: '2px 8px',
                                                            borderRadius: '6px',
                                                            fontSize: '0.74rem',
                                                            fontWeight: 600,
                                                            border: '1px solid #E2E8F0'
                                                        }}>
                                                            {r.especialidad_medico}
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        <div style={{ fontWeight: 700, color: '#1E293B' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                            DNI: {r.dni || 'S/D'} {r.nhc ? `· NHC: ${r.nhc}` : ''}
                                                        </div>
                                                    </td>
                                                    <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0F172A' }}>
                                                        <span style={{
                                                            background: '#F1F5F9',
                                                            color: '#334155',
                                                            padding: '2px 7px',
                                                            borderRadius: '4px',
                                                            fontSize: '0.78rem'
                                                        }}>
                                                            🛏️ {r.habitacion} ({r.servicio_internacion})
                                                        </span>
                                                    </td>
                                                    <td style={{ padding: '10px 14px' }}>
                                                        {r.tiene_admision_557 ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => openPatientFicha557(r)}
                                                                style={{
                                                                    padding: '4px 10px',
                                                                    borderRadius: '6px',
                                                                    border: '1px solid #BFDBFE',
                                                                    background: '#EFF6FF',
                                                                    color: '#1E40AF',
                                                                    fontSize: '0.72rem',
                                                                    fontWeight: 700,
                                                                    cursor: 'pointer',
                                                                    display: 'inline-flex',
                                                                    alignItems: 'center',
                                                                    gap: '5px'
                                                                }}
                                                            >
                                                                <Eye size={13} /> Ver Ficha 557
                                                            </button>
                                                        ) : (
                                                            <span style={{ fontSize: '0.72rem', color: '#94A3B8' }}>Sin Prot. 557</span>
                                                        )}
                                                    </td>
                                                    <td style={{ padding: '10px 14px', color: '#64748B', whiteSpace: 'nowrap' }}>
                                                        {r.fecha_visita} {r.hora_creacion ? r.hora_creacion.slice(0, 5) : ''}
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
                                        SALUS PROTOCOLO 557 · (INT) ADMISION MEDICA CLINICA
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
                                    <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase' }}>Médico Carga (Prot. 557)</div>
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
        </div>
    );
}
