import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
    AlertTriangle, Award, BookOpen, Calendar, Camera, CheckCircle2,
    ChevronDown, ChevronUp, ClipboardCheck, Download, Edit3, ExternalLink,
    FileSpreadsheet, FileText, Image as ImageIcon, Layers, ListChecks,
    Loader2, Lock, Plus, Presentation, RefreshCw, Save, Search, ShieldAlert,
    Sparkles, Target, Trash2, TrendingDown, TrendingUp, Users, X, Zap
} from 'lucide-react';
import {
    fetchDoraOportunidadesMejora,
    formatDoraSectorLabel,
    formatDoraStatus,
} from '../../services/doraCalidadService';
import {
    calcVariacionYTendencia,
    createBlankOrClonedInforme,
    deleteObjetivoSector,
    fetchReunionesSectorBundle,
    formatPeriodoLabel,
    getSectorMeta,
    autocompletarIndicadoresDesdeSalus,
    uploadFotoInforme,
    upsertInformeMensual,
    upsertObjetivoSector,
    upsertRevisionDireccion,
} from '../../services/reunionesServicioService';
import {
    exportInformeMensualPptx,
    exportInformesRdir04Excel,
    exportObjetivos2027Excel,
    exportRevisionDireccionPptx,
} from '../../utils/reunionesServicioExporters';

const COLOR_NAVY = '#003B73';
const COLOR_BLUE = '#1E40AF';

const GUIA_OBJETIVOS_2027 = [
    { campo: 'Objetivo propuesto 2027', desc: 'Un cambio prioritario que el servicio quiere lograr.', ej: 'Reducir errores de identificación inequívoca o tiempo de respuesta.', rec: 'Usar verbo de acción: reducir, aumentar, implementar, mejorar, consolidar.' },
    { campo: 'Situación de partida / Línea de base', desc: 'Dato o situación actual desde donde se parte.', ej: '18% de resolución de reportes en 2026 y 26,8 días de cierre.', rec: 'Evitar frases generales; incluir un dato concreto.' },
    { campo: 'Resultado esperado', desc: 'Cómo debería verse el servicio al cumplir el objetivo.', ej: 'Disminución efectiva de duplicaciones y estudios mal vinculados.', rec: 'Describir el efecto clínico/operativo, no repetir la meta.' },
    { campo: 'Indicador y Fórmula', desc: 'Dato repetible + cálculo y fuente oficial.', ej: 'Estudios realizados / Meta definida × 100 (Fuente: SALUS).', rec: 'Elegir indicadores que puedan medirse mensualmente.' },
    { campo: 'Meta 2027 y Plazo', desc: 'Valor objetivo concreto + fecha límite.', ej: '≥ 95% disponibilidad de equipos al 31/05/2027.', rec: 'Debe permitir verificar sin ambigüedad si se cumplió.' },
    { campo: 'Principales acciones (3–5)', desc: 'Acciones esenciales accionables con seguimiento.', ej: '1) Definir protocolo. 2) Capacitar recepción. 3) Auditar cierres.', rec: 'Cada acción se gestiona aquí con tilde de avance en vivo.' },
];

function StatusBadge({ value }) {
    const v = String(value || '').toLowerCase();
    let bg = '#F1F5F9', color = '#475569', border = '#CBD5E1';
    if (v.includes('cumplido') || v.includes('mejora') || v.includes('aprobado')) {
        bg = '#DCFCE7'; color = '#166534'; border = '#86EFAC';
    } else if (v.includes('deterioro') || v.includes('riesgo') || v.includes('vencid')) {
        bg = '#FEE2E2'; color = '#991B1B'; border = '#FCA5A5';
    } else if (v.includes('curso') || v.includes('ejecución') || v.includes('significativo') || v.includes('parcial') || v.includes('favorable')) {
        bg = '#EFF6FF'; color = '#1E40AF'; border = '#BFDBFE';
    } else if (v.includes('estable') || v.includes('formulación')) {
        bg = '#FEF3C7'; color = '#92400E'; border = '#FDE68A';
    }
    return (
        <span style={{
            display: 'inline-flex', alignItems: 'center', gap: '4px',
            padding: '3px 9px', borderRadius: '999px', fontSize: '0.71rem', fontWeight: 700,
            background: bg, color, border: `1px solid ${border}`, whiteSpace: 'nowrap'
        }}>
            {v.includes('mejora') && <TrendingUp size={12} />}
            {v.includes('deterioro') && <TrendingDown size={12} />}
            {value || '—'}
        </span>
    );
}

function CardBlock({ title, subtitle, rightNode, children }) {
    return (
        <div style={{
            background: '#FFFFFF',
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            padding: '18px 20px',
            boxShadow: '0 1px 3px rgba(15, 23, 42, 0.03)',
            display: 'flex',
            flexDirection: 'column',
            gap: '14px',
        }}>
            {(title || subtitle || rightNode) && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px' }}>
                    <div>
                        {title && <h4 style={{ margin: 0, fontSize: '0.94rem', fontWeight: 800, color: COLOR_NAVY }}>{title}</h4>}
                        {subtitle && <p style={{ margin: '2px 0 0', fontSize: '0.76rem', color: '#64748B' }}>{subtitle}</p>}
                    </div>
                    {rightNode && <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>{rightNode}</div>}
                </div>
            )}
            {children}
        </div>
    );
}

const inputStyle = {
    width: '100%',
    padding: '7px 10px',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    fontSize: '0.8rem',
    color: '#0F172A',
    background: '#FFFFFF',
    boxSizing: 'border-box',
};

export default function ReunionesServicioPanel({ sectorId = 'DXI', addToast }) {
    const sectorMeta = useMemo(() => getSectorMeta(sectorId), [sectorId]);
    const [activePilar, setActivePilar] = useState('informes'); // 'informes' | 'revision' | 'objetivos'
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [syncingSalus, setSyncingSalus] = useState(false);
    const [exporting, setExporting] = useState('');

    // Datos cargados desde Supabase
    const [informes, setInformes] = useState([]);
    const [selectedPeriodo, setSelectedPeriodo] = useState('');
    const [draftInforme, setDraftInforme] = useState(null);
    const [dirtyInforme, setDirtyInforme] = useState(false);

    const [revisiones, setRevisiones] = useState([]);
    const [draftRevision, setDraftRevision] = useState(null);
    const [editingRevision, setEditingRevision] = useState(false);

    const [objetivos, setObjetivos] = useState([]);
    const [editingObjId, setEditingObjId] = useState(null);
    const [showGuiaObjetivos, setShowGuiaObjetivos] = useState(false);
    const [newAccionText, setNewAccionText] = useState({});

    // Modal Nuevo Mes & Lightbox Foto
    const [showNewMonthModal, setShowNewMonthModal] = useState(false);
    const [newMonthValue, setNewMonthValue] = useState('2026-11');
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [lightboxFoto, setLightboxFoto] = useState(null);

    // Oportunidades de Mejora en tiempo real desde Dora (SOLO LECTURA)
    const [doraData, setDoraData] = useState({ reports: [], doraSectors: [], metrics: { total: 0, resueltos: 0, pendientes: 0, validacion: 0, criticos: 0, pctResolucion: 0, avgDiasCierre: null } });
    const [loadingDora, setLoadingDora] = useState(false);
    const [doraError, setDoraError] = useState('');
    const [doraStatusFilter, setDoraStatusFilter] = useState('all'); // 'all' | 'pending' | 'validation' | 'resolved' | 'critical'
    const [doraSectorFilter, setDoraSectorFilter] = useState('all');
    const [doraSearch, setDoraSearch] = useState('');
    const [expandedDoraId, setExpandedDoraId] = useState(null);

    const loadDoraOm = useCallback(async () => {
        setLoadingDora(true);
        setDoraError('');
        try {
            const res = await fetchDoraOportunidadesMejora(sectorMeta.id);
            setDoraData(res);
            setDoraSectorFilter('all');
        } catch (err) {
            console.error('[DoraCalidad] Error consultando OM en vivo:', err);
            setDoraError(err.message || 'No se pudo consultar Dora en este momento.');
        } finally {
            setLoadingDora(false);
        }
    }, [sectorMeta.id]);

    useEffect(() => {
        loadDoraOm();
    }, [loadDoraOm]);

    const filteredDoraReports = useMemo(() => {
        const q = doraSearch.trim().toLowerCase();
        return (doraData.reports || []).filter(r => {
            if (doraSectorFilter !== 'all' && (r.dora_sector_match || r.sector) !== doraSectorFilter) return false;
            const st = String(r.status || '');
            if (doraStatusFilter === 'resolved' && st !== 'resolved') return false;
            if (doraStatusFilter === 'validation' && st !== 'quality_validation') return false;
            if (doraStatusFilter === 'pending' && (st === 'resolved' || st === 'quality_validation')) return false;
            if (doraStatusFilter === 'critical') {
                const urg = String(r.ai_urgency || '').toLowerCase();
                if (!r.is_adverse_event && !urg.includes('crit') && !urg.includes('alta') && urg !== 'high' && urg !== 'critical') return false;
            }
            if (!q) return true;
            return [r.tracking_id, r.ai_summary, r.content, r.ai_category, r.root_cause, r.corrective_plan, r.origin_sector, r.sector]
                .some(v => String(v || '').toLowerCase().includes(q));
        });
    }, [doraData.reports, doraSectorFilter, doraStatusFilter, doraSearch]);

    const handleImportDoraReportToRdir04 = (rep) => {
        if (!draftInforme) return;
        const nextNum = String((draftInforme.oportunidades_mejora || []).length + 1).padStart(2, '0');
        const newOm = {
            codigo: `OM-${nextNum}`,
            oportunidad: rep.ai_summary || (rep.content || '').slice(0, 160) || `Reporte Dora ${rep.tracking_id || ''}`,
            origen: `Dora ${rep.tracking_id || ''} · ${formatDoraSectorLabel(rep.dora_sector_match || rep.sector)}`,
            accion_propuesta: rep.corrective_plan || rep.corrective_action_plan || rep.immediate_action || rep.resolution_notes || 'En análisis con Calidad y jefatura de servicio.',
            responsable: `${sectorMeta.nombre} + Calidad`,
            estado: rep.status === 'resolved' ? 'Cumplido' : 'En curso',
        };
        updateInformeField('oportunidades_mejora', [...(draftInforme.oportunidades_mejora || []), newOm]);
        setActivePilar('informes');
        notify(`OM ${rep.tracking_id || ''} copiada al Informe RDIR 04 (${formatPeriodoLabel(draftInforme.periodo)}). Recordá presionar Guardar.`);
    };

    const notify = useCallback((msg, type = 'success') => {
        if (addToast) addToast(msg, type);
    }, [addToast]);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const bundle = await fetchReunionesSectorBundle(sectorMeta.id);
            const infList = bundle.informes || [];
            setInformes(infList);
            if (infList.length > 0) {
                const latest = infList[infList.length - 1];
                setSelectedPeriodo(latest.periodo);
                setDraftInforme(structuredClone(latest));
            } else {
                const nowYm = new Date().toISOString().slice(0, 7);
                const blank = createBlankOrClonedInforme(sectorMeta.id, nowYm, null);
                setSelectedPeriodo(nowYm);
                setDraftInforme(blank);
            }
            setDirtyInforme(false);

            const revList = bundle.revisiones || [];
            setRevisiones(revList);
            if (revList.length > 0) {
                setDraftRevision(structuredClone(revList[0]));
            } else {
                setDraftRevision({
                    sector_id: sectorMeta.id,
                    servicio_nombre: sectorMeta.nombre,
                    periodo_evaluado: 'Ejercicio 2026',
                    periodos_incluidos: infList.map(i => i.periodo),
                    sintesis_ejecutiva: '',
                    metodologia: '',
                    resultados_generales: [],
                    evaluacion_ejes: [],
                    evolucion_indicadores: [],
                    nota_validacion: '',
                    logros_periodo: [],
                    pendientes_alertas: [],
                    conclusion_direccion: '',
                    pedido_proximo_ejercicio: { titulo: 'Pedido de Dirección para 2027', intro: '', requisitos: [], temas_recomendados: '' },
                });
            }

            setObjetivos(bundle.objetivos || []);
        } catch (err) {
            console.error('[ReunionesServicioPanel] Error cargando datos:', err);
            notify('Error al cargar Reuniones de Servicio: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [sectorMeta, notify]);

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const handleSelectPeriodo = (per) => {
        setSelectedPeriodo(per);
        const found = informes.find(i => i.periodo === per);
        if (found) {
            setDraftInforme(structuredClone(found));
            setDirtyInforme(false);
        }
    };

    const updateInformeField = (field, val) => {
        setDraftInforme(prev => ({ ...prev, [field]: val }));
        setDirtyInforme(true);
    };

    const handleCreateNewMonth = async () => {
        if (!/^\d{4}-\d{2}$/.test(newMonthValue)) return;
        const existing = informes.find(i => i.periodo === newMonthValue);
        if (existing) {
            handleSelectPeriodo(newMonthValue);
            setShowNewMonthModal(false);
            return;
        }
        const sortedPrev = [...informes].filter(i => i.periodo < newMonthValue).sort((a, b) => a.periodo.localeCompare(b.periodo));
        const prevInf = sortedPrev[sortedPrev.length - 1] || informes[informes.length - 1] || null;
        const cloned = createBlankOrClonedInforme(sectorMeta.id, newMonthValue, prevInf);

        setSaving(true);
        try {
            const saved = await upsertInformeMensual(cloned);
            const nextList = [...informes, saved].sort((a, b) => a.periodo.localeCompare(b.periodo));
            setInformes(nextList);
            setSelectedPeriodo(saved.periodo);
            setDraftInforme(structuredClone(saved));
            setDirtyInforme(false);
            setShowNewMonthModal(false);
            notify(`Informe de ${formatPeriodoLabel(saved.periodo)} creado con base del mes anterior.`);
        } catch (err) {
            notify('Error al crear nuevo mes: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleSaveInforme = async () => {
        if (!draftInforme) return;
        setSaving(true);
        try {
            const saved = await upsertInformeMensual(draftInforme);
            setInformes(prev => {
                const exists = prev.some(i => i.periodo === saved.periodo);
                const updated = exists ? prev.map(i => (i.periodo === saved.periodo ? saved : i)) : [...prev, saved];
                return updated.sort((a, b) => a.periodo.localeCompare(b.periodo));
            });
            setDraftInforme(structuredClone(saved));
            setDirtyInforme(false);
            notify(`Informe RDIR 04 (${formatPeriodoLabel(saved.periodo)}) guardado correctamente.`);
        } catch (err) {
            notify('Error al guardar informe: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleAutocompletarSalus = async () => {
        if (!draftInforme) return;
        setSyncingSalus(true);
        try {
            const { indicadores: nextInds, updatedCount, fuente } = await autocompletarIndicadoresDesdeSalus(
                sectorMeta.id,
                draftInforme.periodo,
                draftInforme.indicadores || []
            );
            if (updatedCount > 0) {
                setDraftInforme(prev => ({ ...prev, indicadores: nextInds }));
                setDirtyInforme(true);
                notify(`${updatedCount} indicador(es) autocompletados desde ${fuente}.`);
            } else {
                notify(`Sin registros nuevos en ${fuente} para ${formatPeriodoLabel(draftInforme.periodo)} (podés editarlos manualmente).`, 'warning');
            }
        } catch (err) {
            notify('Error consultando datos SALUS: ' + err.message, 'error');
        } finally {
            setSyncingSalus(false);
        }
    };

    const handleUploadFotos = async (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length || !draftInforme) return;
        setUploadingPhoto(true);
        try {
            const uploaded = [];
            for (const f of files) {
                const item = await uploadFotoInforme(f, sectorMeta.id, draftInforme.periodo);
                uploaded.push(item);
            }
            const nextFotos = [...(draftInforme.fotos || []), ...uploaded];
            const updatedDraft = { ...draftInforme, fotos: nextFotos };
            setDraftInforme(updatedDraft);
            const saved = await upsertInformeMensual(updatedDraft);
            setInformes(prev => prev.map(i => (i.periodo === saved.periodo ? saved : i)));
            setDirtyInforme(false);
            notify(`${uploaded.length} evidencia(s) fotográfica(s) adjuntada(s) y guardada(s).`);
        } catch (err) {
            notify('Error al subir imagen: ' + err.message, 'error');
        } finally {
            setUploadingPhoto(false);
            e.target.value = '';
        }
    };

    const handleUpdateIndicador = (idx, field, val) => {
        const list = [...(draftInforme.indicadores || [])];
        const row = { ...list[idx], [field]: val };
        if (field === 'resultado_anterior' || field === 'resultado_actual') {
            const numVal = val === '' ? null : Number(val);
            row[field] = Number.isFinite(numVal) ? numVal : null;
            const { variacion, tendencia } = calcVariacionYTendencia(row.resultado_anterior, row.resultado_actual);
            row.variacion = variacion;
            row.tendencia = tendencia;
        }
        list[idx] = row;
        updateInformeField('indicadores', list);
    };

    // ── SINCRONIZAR MATRIZ DE REVISIÓN DE DIRECCIÓN CON LOS INFORMES MENSUALES ──
    const handleSyncRevisionFromInformes = () => {
        if (!informes.length || !draftRevision) return;
        const periodos = informes.map(i => i.periodo);
        const allIndNames = [];
        informes.forEach(inf => {
            (inf.indicadores || []).forEach(ind => {
                if (ind.indicador && Number.isFinite(Number(ind.resultado_actual)) && !allIndNames.includes(ind.indicador)) {
                    allIndNames.push(ind.indicador);
                }
            });
        });
        const nuevaEvol = allIndNames.map(name => {
            const valores = {};
            informes.forEach(inf => {
                const found = (inf.indicadores || []).find(x => x.indicador === name);
                if (found && found.resultado_actual !== null && found.resultado_actual !== undefined) {
                    valores[inf.periodo] = Number(found.resultado_actual);
                }
            });
            const existing = (draftRevision.evolucion_indicadores || []).find(e => e.indicador === name);
            return {
                indicador: name,
                valores,
                lectura: existing?.lectura || 'Serie sincronizada desde Informes Ejecutivos RDIR 04.',
            };
        });
        setDraftRevision(prev => ({
            ...prev,
            periodos_incluidos: periodos,
            evolucion_indicadores: nuevaEvol,
        }));
        notify('Tabla de evolución sincronizada con los Informes Mensuales cargados.');
    };

    const handleSaveRevision = async () => {
        if (!draftRevision) return;
        setSaving(true);
        try {
            const saved = await upsertRevisionDireccion(draftRevision);
            setDraftRevision(structuredClone(saved));
            setRevisiones([saved]);
            setEditingRevision(false);
            notify('Revisión por la Dirección guardada correctamente.');
        } catch (err) {
            notify('Error guardando Revisión: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    // ── ACCIONES INTERACTIVAS DE OBJETIVOS 2027 ──
    const handleToggleAccionObjetivo = async (obj, accIdx) => {
        const nextAcciones = (obj.acciones_principales || []).map((a, i) =>
            i === accIdx ? { ...a, completada: !a.completada } : a
        );
        const total = nextAcciones.length;
        const done = nextAcciones.filter(a => a.completada).length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const nextEstado = pct === 100 ? 'Cumplido' : (obj.estado === 'Cumplido' ? 'En ejecución' : obj.estado);

        const optimistic = { ...obj, acciones_principales: nextAcciones, progreso_pct: pct, estado: nextEstado };
        setObjetivos(prev => prev.map(o => (o.id === obj.id ? optimistic : o)));
        try {
            const saved = await upsertObjetivoSector(optimistic);
            setObjetivos(prev => prev.map(o => (o.id === obj.id ? saved : o)));
        } catch (err) {
            notify('Error actualizando acción: ' + err.message, 'error');
        }
    };

    const handleAddAccionToObjetivo = async (obj) => {
        const txt = (newAccionText[obj.id] || '').trim();
        if (!txt) return;
        const nextAcciones = [
            ...(obj.acciones_principales || []),
            { id: `acc_${Date.now()}`, texto: txt, completada: false }
        ];
        setNewAccionText(prev => ({ ...prev, [obj.id]: '' }));
        try {
            const saved = await upsertObjetivoSector({ ...obj, acciones_principales: nextAcciones });
            setObjetivos(prev => prev.map(o => (o.id === obj.id ? saved : o)));
            notify('Acción incorporada al objetivo.');
        } catch (err) {
            notify('Error agregando acción: ' + err.message, 'error');
        }
    };

    const handleAddNuevoObjetivo = async () => {
        const nextOrden = objetivos.length > 0 ? Math.max(...objetivos.map(o => Number(o.orden) || 0)) + 1 : 1;
        const nuevo = {
            sector_id: sectorMeta.id,
            servicio_nombre: sectorMeta.nombre,
            anio_ejercicio: 2027,
            periodo_etiqueta: 'Noviembre 2026 - Octubre 2027',
            fecha_presentacion: 'Noviembre 2026',
            orden: nextOrden,
            objetivo: `Nuevo objetivo estratégico #${nextOrden} — ${sectorMeta.nombre}`,
            linea_base: '',
            resultado_esperado: '',
            indicador: '',
            formula_medicion: '',
            meta: '',
            plazo: '2027-10-31',
            responsable: sectorMeta.responsableDefault || '',
            acciones_principales: [
                { id: `acc_${Date.now()}`, texto: 'Definir línea de base y cronograma de ejecución.', completada: false }
            ],
            necesidades_apoyo: 'No requiere',
            estado: 'En formulación',
            progreso_pct: 0,
        };
        try {
            const saved = await upsertObjetivoSector(nuevo);
            setObjetivos(prev => [...prev, saved]);
            setEditingObjId(saved.id);
            notify(`Objetivo #${nextOrden} creado.`);
        } catch (err) {
            notify('Error creando objetivo: ' + err.message, 'error');
        }
    };

    const handleSaveObjetivoEdit = async (obj) => {
        setSaving(true);
        try {
            const saved = await upsertObjetivoSector(obj);
            setObjetivos(prev => prev.map(o => (o.id === saved.id ? saved : o)));
            setEditingObjId(null);
            notify('Objetivo actualizado correctamente.');
        } catch (err) {
            notify('Error guardando objetivo: ' + err.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDeleteObjetivo = async (obj) => {
        if (!window.confirm(`¿Eliminar el Objetivo #${obj.orden}?`)) return;
        try {
            await deleteObjetivoSector(obj.id);
            setObjetivos(prev => prev.filter(o => o.id !== obj.id));
            notify('Objetivo eliminado.');
        } catch (err) {
            notify('Error eliminando objetivo: ' + err.message, 'error');
        }
    };

    // Métricas globales de Objetivos 2027
    const objStats = useMemo(() => {
        const totalObj = objetivos.length;
        let totalAcc = 0, doneAcc = 0, sumPct = 0;
        objetivos.forEach(o => {
            const accs = o.acciones_principales || [];
            totalAcc += accs.length;
            doneAcc += accs.filter(a => a.completada).length;
            sumPct += Number(o.progreso_pct) || 0;
        });
        return {
            totalObj,
            avgPct: totalObj > 0 ? Math.round(sumPct / totalObj) : 0,
            totalAcc,
            doneAcc,
            cumplidos: objetivos.filter(o => o.estado === 'Cumplido').length,
        };
    }, [objetivos]);

    if (loading) {
        return (
            <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '64px 20px', textAlign: 'center' }}>
                <Loader2 size={30} color={COLOR_NAVY} className="animate-spin" style={{ margin: '0 auto 12px' }} />
                <div style={{ fontWeight: 700, color: '#0F172A', fontSize: '0.92rem' }}>
                    Cargando Reuniones de Servicio — {sectorMeta.nombre}...
                </div>
            </div>
        );
    }

    const periodosRevision = draftRevision?.periodos_incluidos?.length > 0
        ? draftRevision.periodos_incluidos
        : informes.map(i => i.periodo);

    return (
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: "'Inter', sans-serif" }}>
            {/* ── CABECERA INSTITUCIONAL DEL SUBMÓDULO REUNIONES DE SERVICIO ── */}
            <div style={{
                background: '#FFFFFF',
                border: '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '16px 20px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
            }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '42px', height: '42px', borderRadius: '10px',
                            background: '#EFF6FF', border: '1px solid #BFDBFE', color: COLOR_NAVY,
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                        }}>
                            <ClipboardCheck size={22} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <h2 style={{ margin: 0, fontSize: '1.12rem', fontWeight: 800, color: '#0F172A' }}>
                                    Reuniones de Servicio · {sectorMeta.nombre}
                                </h2>
                                <span style={{
                                    padding: '2px 9px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800,
                                    background: '#EFF6FF', color: COLOR_NAVY, border: '1px solid #BFDBFE'
                                }}>
                                    RDIR 04 · GOBERNANZA DE DATOS
                                </span>
                            </div>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                                Gestión mensual de Informes Ejecutivos, Revisión por la Dirección y Objetivos Estratégicos accionables
                            </p>
                        </div>
                    </div>

                    {/* Navegación de los 3 Pilares */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: '#F1F5F9', padding: '4px', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
                        {[
                            { id: 'informes', label: `1. Informes Mensuales (${informes.length})`, icon: FileText },
                            { id: 'revision', label: '2. Revisión por la Dirección', icon: Award },
                            { id: 'objetivos', label: `3. Objetivos 2027 (${objetivos.length})`, icon: Target },
                            { id: 'dora_om', label: `4. OM en Vivo · Dora (${doraData.metrics.total})`, icon: ShieldAlert },
                        ].map(tab => {
                            const Icon = tab.icon;
                            const active = activePilar === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActivePilar(tab.id)}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '7px 14px', borderRadius: '8px', border: 'none',
                                        background: active ? COLOR_NAVY : 'transparent',
                                        color: active ? '#FFFFFF' : '#475569',
                                        fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                                        transition: 'all 0.15s ease',
                                    }}
                                >
                                    <Icon size={15} />
                                    {tab.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* =====================================================================
                PILAR 1: INFORMES EJECUTIVOS MENSUALES (RDIR 04)
               ===================================================================== */}
            {activePilar === 'informes' && draftInforme && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Barra de Meses + Exportadores Oficiales + Autocompletado SALUS */}
                    <div style={{
                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px',
                        padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.73rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', marginRight: '4px' }}>
                                Mes del Informe:
                            </span>
                            {informes.map(inf => {
                                const isSel = inf.periodo === selectedPeriodo;
                                return (
                                    <button
                                        key={inf.periodo}
                                        type="button"
                                        onClick={() => handleSelectPeriodo(inf.periodo)}
                                        style={{
                                            padding: '6px 12px', borderRadius: '8px',
                                            border: isSel ? `1.5px solid ${COLOR_NAVY}` : '1px solid #CBD5E1',
                                            background: isSel ? '#EFF6FF' : '#FFFFFF',
                                            color: isSel ? COLOR_NAVY : '#334155',
                                            fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer'
                                        }}
                                    >
                                        {formatPeriodoLabel(inf.periodo)}
                                    </button>
                                );
                            })}
                            <button
                                type="button"
                                onClick={() => setShowNewMonthModal(true)}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '6px 11px', borderRadius: '8px', border: '1px dashed #2563EB',
                                    background: '#F8FAFC', color: '#2563EB', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                <Plus size={14} /> Nuevo Mes
                            </button>
                        </div>

                        {/* Botonera de Acciones Ejecutivas */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                type="button"
                                onClick={handleAutocompletarSalus}
                                disabled={syncingSalus}
                                title="Completar automáticamente los indicadores cuantitativos desde los datos reales de SALUS"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 12px', borderRadius: '8px', border: '1px solid #BAE6FD',
                                    background: '#F0F9FF', color: '#0369A1', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                {syncingSalus ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
                                Autocompletar SALUS
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    setExporting('excel');
                                    try {
                                        const pool = informes.length > 0
                                            ? informes.map(i => (i.periodo === draftInforme.periodo ? draftInforme : i))
                                            : [draftInforme];
                                        await exportInformesRdir04Excel(pool, sectorMeta.nombre);
                                        notify('Excel oficial RDIR 04 (multi-hoja) descargado.');
                                    } finally {
                                        setExporting('');
                                    }
                                }}
                                disabled={Boolean(exporting)}
                                title="Exportar libro Excel con todas las hojas mensuales en formato oficial RDIR 04 + Instructivo"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 12px', borderRadius: '8px', border: '1px solid #A7F3D0',
                                    background: '#ECFDF5', color: '#065F46', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                <FileSpreadsheet size={15} />
                                {exporting === 'excel' ? 'Generando...' : 'Excel RDIR 04 (Multi-Hoja)'}
                            </button>

                            <button
                                type="button"
                                onClick={async () => {
                                    setExporting('pptx');
                                    try {
                                        await exportInformeMensualPptx(draftInforme);
                                        notify(`Presentación PPTX de ${formatPeriodoLabel(draftInforme.periodo)} descargada.`);
                                    } finally {
                                        setExporting('');
                                    }
                                }}
                                disabled={Boolean(exporting)}
                                title="Generar presentación PowerPoint institucional (.pptx) exclusiva de este mes con logo e insights"
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 12px', borderRadius: '8px', border: '1px solid #C7D2FE',
                                    background: '#EEF2FF', color: '#3730A3', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer'
                                }}
                            >
                                <Presentation size={15} />
                                {exporting === 'pptx' ? 'Armando PPTX...' : `PPTX ${formatPeriodoLabel(draftInforme.periodo)}`}
                            </button>

                            <button
                                type="button"
                                onClick={handleSaveInforme}
                                disabled={saving}
                                style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                    padding: '7px 15px', borderRadius: '8px', border: 'none',
                                    background: dirtyInforme ? '#059669' : COLOR_NAVY,
                                    color: '#FFFFFF', fontSize: '0.77rem', fontWeight: 800, cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(0, 59, 115, 0.18)'
                                }}
                            >
                                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                {dirtyInforme ? 'Guardar Cambios *' : 'Guardar Informe'}
                            </button>
                        </div>
                    </div>

                    {/* SECCIÓN 1: IDENTIFICACIÓN, RESUMEN EJECUTIVO E INSIGHTS PPTX */}
                    <CardBlock
                        title={`1. Identificación y Resumen Ejecutivo — ${formatPeriodoLabel(draftInforme.periodo)}`}
                        subtitle="Encabezado oficial RDIR 04, síntesis del período, insights para PowerPoint y compromisos de la reunión"
                    >
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px' }}>
                            <div>
                                <label style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Servicio</label>
                                <input style={inputStyle} value={draftInforme.servicio_nombre || ''} onChange={e => updateInformeField('servicio_nombre', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Responsable del Servicio</label>
                                <input style={inputStyle} value={draftInforme.responsable || ''} onChange={e => updateInformeField('responsable', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Tutor de Dirección</label>
                                <input style={inputStyle} value={draftInforme.tutor || ''} onChange={e => updateInformeField('tutor', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Fecha de Reunión</label>
                                <input style={inputStyle} value={draftInforme.fecha_reunion || ''} onChange={e => updateInformeField('fecha_reunion', e.target.value)} placeholder="Ej: 31/08/2026 o Pendiente" />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Participantes</label>
                                <input style={inputStyle} value={draftInforme.participantes || ''} onChange={e => updateInformeField('participantes', e.target.value)} />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: '4px' }}>Estado General del Servicio</label>
                                <select style={inputStyle} value={draftInforme.estado_general || ''} onChange={e => updateInformeField('estado_general', e.target.value)}>
                                    <option value="Favorable, con oportunidades de mejora">Favorable, con oportunidades de mejora</option>
                                    <option value="Favorable / Cumplimiento pleno">Favorable / Cumplimiento pleno</option>
                                    <option value="Estable con seguimiento prioritario">Estable con seguimiento prioritario</option>
                                    <option value="Con desvíos críticos a corregir">Con desvíos críticos a corregir</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '0.73rem', fontWeight: 800, color: COLOR_NAVY, display: 'block', marginBottom: '5px' }}>
                                    Resumen Ejecutivo del Período (RDIR 04)
                                </label>
                                <textarea
                                    rows={7}
                                    style={{ ...inputStyle, lineHeight: 1.45, resize: 'vertical' }}
                                    value={draftInforme.resumen_ejecutivo || ''}
                                    onChange={e => updateInformeField('resumen_ejecutivo', e.target.value)}
                                    placeholder="Síntesis ejecutiva de producción, seguridad del paciente, continuidad operativa y decisiones del mes..."
                                />
                            </div>

                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '5px' }}>
                                    <label style={{ fontSize: '0.73rem', fontWeight: 800, color: '#3730A3', display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
                                        <Sparkles size={13} /> Insights Destacados del Mes (Diapositiva 2 del PPTX)
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => updateInformeField('insights_clave', [...(draftInforme.insights_clave || []), ''])}
                                        style={{ border: 'none', background: '#EEF2FF', color: '#3730A3', borderRadius: '6px', padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }}
                                    >
                                        + Insight
                                    </button>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                    {(draftInforme.insights_clave || []).length === 0 && (
                                        <div style={{ padding: '12px', borderRadius: '8px', background: '#F8FAFC', border: '1px dashed #CBD5E1', fontSize: '0.76rem', color: '#64748B' }}>
                                            Si no cargás bullets manuales, el generador PPTX construye automáticamente los insights cuantitativos del mes.
                                        </div>
                                    )}
                                    {(draftInforme.insights_clave || []).map((ins, idx) => (
                                        <div key={idx} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <input
                                                style={inputStyle}
                                                value={ins}
                                                onChange={e => {
                                                    const next = [...(draftInforme.insights_clave || [])];
                                                    next[idx] = e.target.value;
                                                    updateInformeField('insights_clave', next);
                                                }}
                                                placeholder={`Insight ejecutivo #${idx + 1}...`}
                                            />
                                            <button
                                                type="button"
                                                onClick={() => updateInformeField('insights_clave', draftInforme.insights_clave.filter((_, i) => i !== idx))}
                                                style={{ border: 'none', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}
                                            >
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Compromisos acordados en la reunión */}
                        <div style={{ borderTop: '1px solid #F1F5F9', paddingTop: '12px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                    Compromisos Acordados en Reunión ({(draftInforme.compromisos_acordados || []).length})
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const nextNro = (draftInforme.compromisos_acordados || []).length + 1;
                                        updateInformeField('compromisos_acordados', [
                                            ...(draftInforme.compromisos_acordados || []),
                                            { nro: nextNro, compromiso: '', responsable: sectorMeta.nombre, fecha_seguimiento: 'Próxima reunión' }
                                        ]);
                                    }}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '7px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <Plus size={13} /> Agregar compromiso
                                </button>
                            </div>
                            {(draftInforme.compromisos_acordados || []).length > 0 && (
                                <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                        <thead>
                                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                                                <th style={{ padding: '8px 10px', width: '48px' }}>N°</th>
                                                <th style={{ padding: '8px 10px' }}>Compromiso acordado</th>
                                                <th style={{ padding: '8px 10px', width: '240px' }}>Responsable</th>
                                                <th style={{ padding: '8px 10px', width: '190px' }}>Fecha / Seguimiento</th>
                                                <th style={{ padding: '8px 10px', width: '40px' }} />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(draftInforme.compromisos_acordados || []).map((c, idx) => (
                                                <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                    <td style={{ padding: '6px 10px', fontWeight: 700, color: COLOR_NAVY }}>{c.nro || idx + 1}</td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <input style={inputStyle} value={c.compromiso || ''} onChange={e => {
                                                            const next = [...draftInforme.compromisos_acordados];
                                                            next[idx] = { ...next[idx], compromiso: e.target.value };
                                                            updateInformeField('compromisos_acordados', next);
                                                        }} />
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <input style={inputStyle} value={c.responsable || ''} onChange={e => {
                                                            const next = [...draftInforme.compromisos_acordados];
                                                            next[idx] = { ...next[idx], responsable: e.target.value };
                                                            updateInformeField('compromisos_acordados', next);
                                                        }} />
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <input style={inputStyle} value={c.fecha_seguimiento || ''} onChange={e => {
                                                            const next = [...draftInforme.compromisos_acordados];
                                                            next[idx] = { ...next[idx], fecha_seguimiento: e.target.value };
                                                            updateInformeField('compromisos_acordados', next);
                                                        }} />
                                                    </td>
                                                    <td style={{ padding: '6px 8px' }}>
                                                        <button type="button" onClick={() => updateInformeField('compromisos_acordados', draftInforme.compromisos_acordados.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </CardBlock>

                    {/* SECCIÓN 4 (DESTACADA): INDICADORES DEL SERVICIO CON CONEXIÓN SALUS */}
                    <CardBlock
                        title="4. Indicadores del Servicio (Producción, Calidad y Gestión)"
                        subtitle="La variación (%) y tendencia se calculan automáticamente al cargar o autocompletar desde SALUS"
                        rightNode={
                            <>
                                <button
                                    type="button"
                                    onClick={handleAutocompletarSalus}
                                    disabled={syncingSalus}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #BAE6FD', background: '#F0F9FF', color: '#0369A1', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <Zap size={13} /> Sincronizar con SALUS
                                </button>
                                <button
                                    type="button"
                                    onClick={() => updateInformeField('indicadores', [
                                        ...(draftInforme.indicadores || []),
                                        { codigo_salus: '', indicador: '', unidad: 'Cantidad', meta: 'Según presupuesto mensual', resultado_anterior: null, resultado_actual: null, variacion: null, tendencia: 'Estable', comentario: '' }
                                    ])}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <Plus size={13} /> Agregar Indicador
                                </button>
                            </>
                        }
                    >
                        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ background: '#EFF6FF', color: COLOR_NAVY, borderBottom: '2px solid #BFDBFE', textAlign: 'left' }}>
                                        <th style={{ padding: '9px 10px', minWidth: '185px' }}>Indicador</th>
                                        <th style={{ padding: '9px 8px', width: '90px' }}>Unidad</th>
                                        <th style={{ padding: '9px 8px', minWidth: '150px' }}>Meta</th>
                                        <th style={{ padding: '9px 8px', width: '110px', textAlign: 'right' }}>Mes Ant.</th>
                                        <th style={{ padding: '9px 8px', width: '110px', textAlign: 'right' }}>Actual</th>
                                        <th style={{ padding: '9px 8px', width: '90px', textAlign: 'right' }}>Variación</th>
                                        <th style={{ padding: '9px 8px', width: '110px', textAlign: 'center' }}>Tendencia</th>
                                        <th style={{ padding: '9px 10px', minWidth: '250px' }}>Comentario Ejecutivo</th>
                                        <th style={{ padding: '9px 6px', width: '34px' }} />
                                    </tr>
                                </thead>
                                <tbody>
                                    {(draftInforme.indicadores || []).map((ind, idx) => {
                                        const vNum = ind.variacion !== null && ind.variacion !== undefined && ind.variacion !== '' ? Number(ind.variacion) : NaN;
                                        const pctStr = Number.isFinite(vNum) ? `${vNum >= 0 ? '+' : ''}${(vNum * 100).toFixed(1)}%` : '—';
                                        return (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '6px 8px' }}>
                                                    <input style={{ ...inputStyle, fontWeight: 700 }} value={ind.indicador || ''} onChange={e => handleUpdateIndicador(idx, 'indicador', e.target.value)} />
                                                </td>
                                                <td style={{ padding: '6px 6px' }}>
                                                    <input style={inputStyle} value={ind.unidad || ''} onChange={e => handleUpdateIndicador(idx, 'unidad', e.target.value)} />
                                                </td>
                                                <td style={{ padding: '6px 6px' }}>
                                                    <input style={inputStyle} value={ind.meta || ''} onChange={e => handleUpdateIndicador(idx, 'meta', e.target.value)} />
                                                </td>
                                                <td style={{ padding: '6px 6px' }}>
                                                    <input
                                                        type="number"
                                                        style={{ ...inputStyle, textAlign: 'right' }}
                                                        value={ind.resultado_anterior ?? ''}
                                                        onChange={e => handleUpdateIndicador(idx, 'resultado_anterior', e.target.value)}
                                                    />
                                                </td>
                                                <td style={{ padding: '6px 6px' }}>
                                                    <input
                                                        type="number"
                                                        style={{ ...inputStyle, textAlign: 'right', fontWeight: 800, color: COLOR_NAVY, background: '#F8FAFC' }}
                                                        value={ind.resultado_actual ?? ''}
                                                        onChange={e => handleUpdateIndicador(idx, 'resultado_actual', e.target.value)}
                                                    />
                                                </td>
                                                <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 800, color: vNum > 0.01 ? '#166534' : vNum < -0.01 ? '#991B1B' : '#475569' }}>
                                                    {pctStr}
                                                </td>
                                                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                                                    <StatusBadge value={ind.tendencia || 'Sin dato'} />
                                                </td>
                                                <td style={{ padding: '6px 8px' }}>
                                                    <input style={inputStyle} value={ind.comentario || ''} onChange={e => handleUpdateIndicador(idx, 'comentario', e.target.value)} placeholder="Lectura ejecutiva del indicador..." />
                                                </td>
                                                <td style={{ padding: '6px 4px', textAlign: 'center' }}>
                                                    <button type="button" onClick={() => updateInformeField('indicadores', draftInforme.indicadores.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
                                                        <Trash2 size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </CardBlock>

                    {/* SECCIÓN 2: SEGUIMIENTO DEL PLAN DE ACCIÓN DE LA REVISIÓN (PA-*) */}
                    <CardBlock
                        title="2. Seguimiento del Plan de Acción de la Revisión"
                        subtitle="Compromisos estratégicos con trazabilidad directa a tareas de Bitrix24"
                        rightNode={
                            <button
                                type="button"
                                onClick={() => updateInformeField('plan_accion', [
                                    ...(draftInforme.plan_accion || []),
                                    { codigo: `PA-${String((draftInforme.plan_accion || []).length + 1).padStart(2, '0')}`, accion: '', vinculo_bitrix: '', responsable: sectorMeta.responsableDefault, fecha_objetivo: '', estado: 'En curso', avance_mes: '', dificultad: '' }
                                ])}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '5px 10px', borderRadius: '7px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer' }}
                            >
                                <Plus size={13} /> Agregar Acción (PA)
                            </button>
                        }
                    >
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {(draftInforme.plan_accion || []).map((pa, idx) => (
                                <div key={idx} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px', background: '#F8FAFC', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: '90px 1fr 220px 135px 140px auto', gap: '8px', alignItems: 'center' }}>
                                        <input style={{ ...inputStyle, fontWeight: 800, color: COLOR_NAVY }} value={pa.codigo || ''} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], codigo: e.target.value }; updateInformeField('plan_accion', next);
                                        }} placeholder="PA-01" />
                                        <input style={{ ...inputStyle, fontWeight: 700 }} value={pa.accion || ''} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], accion: e.target.value }; updateInformeField('plan_accion', next);
                                        }} placeholder="Acción / compromiso..." />
                                        <input style={inputStyle} value={pa.responsable || ''} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], responsable: e.target.value }; updateInformeField('plan_accion', next);
                                        }} placeholder="Responsable" />
                                        <input style={inputStyle} value={pa.fecha_objetivo || ''} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], fecha_objetivo: e.target.value }; updateInformeField('plan_accion', next);
                                        }} placeholder="Fecha obj." />
                                        <select style={inputStyle} value={pa.estado || 'En curso'} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], estado: e.target.value }; updateInformeField('plan_accion', next);
                                        }}>
                                            <option value="En curso">En curso</option>
                                            <option value="Cumplido">Cumplido</option>
                                            <option value="Pendiente">Pendiente</option>
                                            <option value="En riesgo">En riesgo</option>
                                        </select>
                                        <button type="button" onClick={() => updateInformeField('plan_accion', draftInforme.plan_accion.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
                                            <Trash2 size={15} />
                                        </button>
                                    </div>
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 260px', gap: '8px', alignItems: 'center' }}>
                                        <input style={inputStyle} value={pa.avance_mes || ''} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], avance_mes: e.target.value }; updateInformeField('plan_accion', next);
                                        }} placeholder="Avance registrado en el mes..." />
                                        <input style={inputStyle} value={pa.dificultad || ''} onChange={e => {
                                            const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], dificultad: e.target.value }; updateInformeField('plan_accion', next);
                                        }} placeholder="Dificultad / desvío observado..." />
                                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                                            <input style={inputStyle} value={pa.vinculo_bitrix || ''} onChange={e => {
                                                const next = [...draftInforme.plan_accion]; next[idx] = { ...next[idx], vinculo_bitrix: e.target.value }; updateInformeField('plan_accion', next);
                                            }} placeholder="URL tarea Bitrix24..." />
                                            {pa.vinculo_bitrix && (
                                                <a href={pa.vinculo_bitrix} target="_blank" rel="noreferrer" title="Abrir tarea en Bitrix24" style={{ padding: '7px', borderRadius: '7px', background: '#EFF6FF', color: COLOR_BLUE, display: 'inline-flex' }}>
                                                    <ExternalLink size={14} />
                                                </a>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </CardBlock>

                    {/* SECCIÓN 3: OPORTUNIDADES DE MEJORA (OM-*) + SECCIÓN 5: DECISIONES DE DIRECCIÓN */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: '16px' }}>
                        <CardBlock
                            title="3. Oportunidades de Mejora (OM) · Dora"
                            subtitle="Estadísticas en vivo desde el Sistema de Calidad Dora (solo lectura)"
                            rightNode={
                                <button
                                    type="button"
                                    onClick={() => setActivePilar('dora_om')}
                                    style={{
                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                        padding: '6px 12px', borderRadius: '8px', border: 'none',
                                        background: COLOR_NAVY, color: '#FFFFFF',
                                        fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer'
                                    }}
                                >
                                    <Lock size={12} /> Ver todas ({doraData.metrics.total}) →
                                </button>
                            }
                        >
                            {loadingDora ? (
                                <div style={{ padding: '24px', textAlign: 'center', color: '#64748B', fontSize: '0.8rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                    <RefreshCw size={15} className="animate-spin" /> Consultando estadísticas de Dora...
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '8px' }}>
                                        {[
                                            { label: 'Total OM', value: doraData.metrics.total, color: COLOR_NAVY, bg: '#EFF6FF', border: '#BFDBFE' },
                                            { label: 'Resueltas', value: `${doraData.metrics.resueltos} (${doraData.metrics.pctResolucion}%)`, color: '#047857', bg: '#ECFDF5', border: '#A7F3D0' },
                                            { label: 'Pendientes', value: doraData.metrics.pendientes, color: '#B45309', bg: '#FFFBEB', border: '#FDE68A' },
                                            { label: 'Validación Calidad', value: doraData.metrics.validacion, color: '#1D4ED8', bg: '#F0F9FF', border: '#BAE6FD' },
                                            { label: 'Críticos / EA', value: doraData.metrics.criticos, color: '#B91C1C', bg: '#FEF2F2', border: '#FECACA' },
                                            { label: 'Prom. cierre', value: doraData.metrics.avgDiasCierre !== null ? `${doraData.metrics.avgDiasCierre} d` : '—', color: '#334155', bg: '#F8FAFC', border: '#E2E8F0' },
                                        ].map((stat, i) => (
                                            <div key={i} style={{ padding: '10px 12px', borderRadius: '8px', background: stat.bg, border: `1px solid ${stat.border}` }}>
                                                <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                    {stat.label}
                                                </div>
                                                <div style={{ fontSize: '1.08rem', fontWeight: 800, color: stat.color, marginTop: '2px' }}>
                                                    {stat.value}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {(doraData.doraSectors || []).length > 0 && (
                                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', paddingTop: '4px', borderTop: '1px solid #F1F5F9' }}>
                                            {doraData.doraSectors.map(sec => {
                                                const count = (doraData.reports || []).filter(r => r.sector === sec).length;
                                                return (
                                                    <span key={sec} style={{ fontSize: '0.72rem', fontWeight: 600, color: '#334155', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '6px', padding: '3px 8px' }}>
                                                        {formatDoraSectorLabel(sec)}: <strong>{count}</strong>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardBlock>

                        <CardBlock
                            title="5. Necesidades del Servicio y Decisiones de Dirección"
                            subtitle="Escalamientos formales, requerimientos de apoyo y registro de hitos del mes"
                            rightNode={
                                <button
                                    type="button"
                                    onClick={() => updateInformeField('necesidades_direccion', [
                                        ...(draftInforme.necesidades_direccion || []),
                                        { tipo: 'Apoyo / decisión', necesidad: '', fundamento: '', decision_requerida: '', responsable_resolucion: 'Dirección' }
                                    ])}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 9px', borderRadius: '7px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <Plus size={13} /> + Decisión
                                </button>
                            }
                        >
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {(draftInforme.necesidades_direccion || []).length === 0 && (
                                    <div style={{ padding: '14px', borderRadius: '8px', background: '#F8FAFC', color: '#64748B', fontSize: '0.78rem', textAlign: 'center' }}>
                                        Sin pedidos de decisión escalados a Dirección en este mes.
                                    </div>
                                )}
                                {(draftInforme.necesidades_direccion || []).map((nec, idx) => (
                                    <div key={idx} style={{ border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                        <div style={{ display: 'flex', gap: '6px' }}>
                                            <input style={{ ...inputStyle, fontWeight: 700 }} value={nec.necesidad || ''} onChange={e => {
                                                const next = [...draftInforme.necesidades_direccion]; next[idx] = { ...next[idx], necesidad: e.target.value }; updateInformeField('necesidades_direccion', next);
                                            }} placeholder="Necesidad o situación..." />
                                            <button type="button" onClick={() => updateInformeField('necesidades_direccion', draftInforme.necesidades_direccion.filter((_, i) => i !== idx))} style={{ border: 'none', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                        <input style={inputStyle} value={nec.fundamento || ''} onChange={e => {
                                            const next = [...draftInforme.necesidades_direccion]; next[idx] = { ...next[idx], fundamento: e.target.value }; updateInformeField('necesidades_direccion', next);
                                        }} placeholder="Fundamento clínico/operativo..." />
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 180px', gap: '6px' }}>
                                            <input style={inputStyle} value={nec.decision_requerida || ''} onChange={e => {
                                                const next = [...draftInforme.necesidades_direccion]; next[idx] = { ...next[idx], decision_requerida: e.target.value }; updateInformeField('necesidades_direccion', next);
                                            }} placeholder="Decisión o apoyo requerido..." />
                                            <input style={inputStyle} value={nec.responsable_resolucion || ''} onChange={e => {
                                                const next = [...draftInforme.necesidades_direccion]; next[idx] = { ...next[idx], responsable_resolucion: e.target.value }; updateInformeField('necesidades_direccion', next);
                                            }} placeholder="Responsable" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardBlock>
                    </div>

                    {/* SECCIÓN 6: GALERÍA DE FOTOS Y EVIDENCIAS DEL MES */}
                    <CardBlock
                        title={`6. Evidencias Fotográficas del Informe (${(draftInforme.fotos || []).length})`}
                        subtitle="Las fotos adjuntas se incrustan automáticamente en la hoja del mes del Excel RDIR 04 y en las diapositivas del PowerPoint (.pptx)"
                        rightNode={
                            <label style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '6px 12px', borderRadius: '8px', background: COLOR_NAVY,
                                color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                            }}>
                                {uploadingPhoto ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                                {uploadingPhoto ? 'Subiendo...' : 'Adjuntar Foto / Evidencia'}
                                <input type="file" accept="image/*" multiple onChange={handleUploadFotos} style={{ display: 'none' }} />
                            </label>
                        }
                    >
                        {(draftInforme.fotos || []).length === 0 ? (
                            <div style={{
                                border: '1.5px dashed #CBD5E1', borderRadius: '10px', padding: '26px',
                                textAlign: 'center', color: '#64748B', background: '#F8FAFC', fontSize: '0.8rem'
                            }}>
                                <ImageIcon size={26} color="#94A3B8" style={{ margin: '0 auto 6px', display: 'block' }} />
                                Podés subir fotos de equipamiento instalado, obras, tableros en sala, mantenimientos UPS o capacitaciones del mes.
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '12px' }}>
                                {(draftInforme.fotos || []).map((foto, idx) => (
                                    <div key={foto.id || idx} style={{ border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden', background: '#FFFFFF' }}>
                                        <div
                                            onClick={() => setLightboxFoto(foto)}
                                            style={{ height: '145px', background: '#0F172A', cursor: 'pointer', position: 'relative' }}
                                        >
                                            <img src={foto.url || foto.dataUrl} alt={foto.titulo} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                        </div>
                                        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <input
                                                style={{ ...inputStyle, fontWeight: 700, fontSize: '0.76rem' }}
                                                value={foto.titulo || ''}
                                                onChange={e => {
                                                    const next = [...draftInforme.fotos];
                                                    next[idx] = { ...next[idx], titulo: e.target.value };
                                                    updateInformeField('fotos', next);
                                                }}
                                                placeholder="Título de la foto..."
                                            />
                                            <div style={{ display: 'flex', gap: '6px' }}>
                                                <input
                                                    style={{ ...inputStyle, fontSize: '0.73rem' }}
                                                    value={foto.descripcion || ''}
                                                    onChange={e => {
                                                        const next = [...draftInforme.fotos];
                                                        next[idx] = { ...next[idx], descripcion: e.target.value };
                                                        updateInformeField('fotos', next);
                                                    }}
                                                    placeholder="Epígrafe / detalle..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => updateInformeField('fotos', draftInforme.fotos.filter((_, i) => i !== idx))}
                                                    style={{ border: 'none', background: '#FEE2E2', color: '#991B1B', borderRadius: '6px', padding: '6px', cursor: 'pointer' }}
                                                >
                                                    <Trash2 size={13} />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardBlock>
                </div>
            )}

            {/* =====================================================================
                PILAR 2: REVISIÓN POR LA DIRECCIÓN (SÍNTESIS MULTIMENSUAL)
               ===================================================================== */}
            {activePilar === 'revision' && draftRevision && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Banner Síntesis Ejecutiva de Dirección */}
                    <div style={{
                        background: 'linear-gradient(135deg, #003B73 0%, #1E40AF 100%)',
                        borderRadius: '12px', padding: '22px 26px', color: '#FFFFFF',
                        display: 'flex', flexDirection: 'column', gap: '12px'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
                            <div>
                                <div style={{ fontSize: '0.72rem', fontWeight: 800, color: '#93C5FD', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                    SANATORIO ARGENTINO · REVISIÓN POR LA DIRECCIÓN
                                </div>
                                <h3 style={{ margin: '4px 0 0', fontSize: '1.25rem', fontWeight: 800 }}>
                                    {draftRevision.servicio_nombre || sectorMeta.nombre} — Período: {draftRevision.periodo_evaluado}
                                </h3>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                <button
                                    type="button"
                                    onClick={handleSyncRevisionFromInformes}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.12)', color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                >
                                    <RefreshCw size={14} /> Sincronizar con Informes Mensuales
                                </button>
                                <button
                                    type="button"
                                    onClick={() => exportRevisionDireccionPptx(draftRevision)}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 12px', borderRadius: '8px', border: 'none', background: '#FFFFFF', color: COLOR_NAVY, fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                    <Presentation size={14} /> Descargar PPTX Revisión
                                </button>
                                <button
                                    type="button"
                                    onClick={() => (editingRevision ? handleSaveRevision() : setEditingRevision(true))}
                                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '7px 13px', borderRadius: '8px', border: 'none', background: editingRevision ? '#10B981' : '#38BDF8', color: editingRevision ? '#FFFFFF' : '#0F172A', fontSize: '0.75rem', fontWeight: 800, cursor: 'pointer' }}
                                >
                                    {editingRevision ? <><Save size={14} /> Guardar Revisión</> : <><Edit3 size={14} /> Editar Lectura de Dirección</>}
                                </button>
                            </div>
                        </div>

                        {editingRevision ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <input
                                    style={{ ...inputStyle, maxWidth: '360px', fontWeight: 700 }}
                                    value={draftRevision.periodo_evaluado || ''}
                                    onChange={e => setDraftRevision(prev => ({ ...prev, periodo_evaluado: e.target.value }))}
                                    placeholder="Período evaluado (ej. Julio - Octubre 2026)"
                                />
                                <textarea
                                    rows={4}
                                    style={inputStyle}
                                    value={draftRevision.sintesis_ejecutiva || ''}
                                    onChange={e => setDraftRevision(prev => ({ ...prev, sintesis_ejecutiva: e.target.value }))}
                                    placeholder="Síntesis ejecutiva de la Dirección sobre el desempeño del servicio..."
                                />
                            </div>
                        ) : (
                            <p style={{ margin: 0, fontSize: '0.88rem', lineHeight: 1.55, color: '#EFF6FF', background: 'rgba(255,255,255,0.08)', padding: '12px 16px', borderRadius: '8px', borderLeft: '4px solid #38BDF8' }}>
                                <strong>Síntesis ejecutiva:</strong> {draftRevision.sintesis_ejecutiva || 'Aún no se redactó la síntesis ejecutiva de Dirección para este período.'}
                            </p>
                        )}
                    </div>

                    {/* 2. Matriz de Resultado General del Período */}
                    <CardBlock title="Resultado General del Período — Lectura de Dirección por Compromiso" subtitle="Evaluación ejecutiva sobre los ejes del Plan de Acción reportados por la jefatura del servicio">
                        <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #E2E8F0', textAlign: 'left', color: COLOR_NAVY }}>
                                        <th style={{ padding: '10px 12px', width: '24%' }}>Eje / Compromiso</th>
                                        <th style={{ padding: '10px 12px', width: '14%', textAlign: 'center' }}>Estado de Cierre</th>
                                        <th style={{ padding: '10px 12px', width: '28%' }}>Avance Observado</th>
                                        <th style={{ padding: '10px 12px', width: '34%' }}>Lectura de Dirección</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {(draftRevision.resultados_generales || []).map((rg, idx) => (
                                        <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                            <td style={{ padding: '10px 12px', fontWeight: 800, color: '#0F172A' }}>{rg.codigo}. {rg.eje}</td>
                                            <td style={{ padding: '10px 12px', textAlign: 'center' }}><StatusBadge value={rg.estado_cierre} /></td>
                                            <td style={{ padding: '10px 12px', color: '#334155', lineHeight: 1.4 }}>{rg.avance_observado}</td>
                                            <td style={{ padding: '10px 12px', color: COLOR_NAVY, fontWeight: 600, background: '#F8FAFC', lineHeight: 1.4 }}>{rg.lectura_direccion}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardBlock>

                    {/* 3. Tarjetas de Evaluación por Eje */}
                    {(draftRevision.evaluacion_ejes || []).length > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '14px' }}>
                            {(draftRevision.evaluacion_ejes || []).map((eje, idx) => (
                                <CardBlock key={idx} title={eje.titulo} subtitle={`Objetivo: ${eje.objetivo}`}>
                                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '0.8rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '5px' }}>
                                        {(eje.avances || []).map((av, i) => <li key={i}>{av}</li>)}
                                    </ul>
                                    <div style={{ padding: '9px 12px', borderRadius: '8px', background: '#EFF6FF', borderLeft: `3px solid ${COLOR_NAVY}`, fontSize: '0.78rem', color: '#0F172A' }}>
                                        <strong>Evaluación de Dirección:</strong> {eje.evaluacion_direccion}
                                    </div>
                                    {eje.pendiente_principal && (
                                        <div style={{ padding: '8px 12px', borderRadius: '8px', background: '#FFFBEB', borderLeft: '3px solid #F59E0B', fontSize: '0.77rem', color: '#92400E' }}>
                                            <strong>Pendiente principal:</strong> {eje.pendiente_principal}
                                        </div>
                                    )}
                                </CardBlock>
                            ))}
                        </div>
                    )}

                    {/* 4. Evolución Comparativa Multi-Mes de Indicadores */}
                    {(draftRevision.evolucion_indicadores || []).length > 0 && (
                        <CardBlock title={`Evolución Consolidada de Indicadores (${draftRevision.periodo_evaluado})`} subtitle={draftRevision.nota_validacion || 'Consolidado cuantitativo de los Informes Ejecutivos mensuales'}>
                            <div style={{ overflowX: 'auto', border: '1px solid #E2E8F0', borderRadius: '8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ background: '#EFF6FF', color: COLOR_NAVY, borderBottom: '2px solid #BFDBFE' }}>
                                            <th style={{ padding: '9px 12px', textAlign: 'left' }}>Indicador</th>
                                            {periodosRevision.map(p => (
                                                <th key={p} style={{ padding: '9px 12px', textAlign: 'right' }}>{formatPeriodoLabel(p)}</th>
                                            ))}
                                            <th style={{ padding: '9px 12px', textAlign: 'left' }}>Lectura del Período</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(draftRevision.evolucion_indicadores || []).map((row, idx) => (
                                            <tr key={idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                <td style={{ padding: '9px 12px', fontWeight: 800, color: '#0F172A' }}>{row.indicador}</td>
                                                {periodosRevision.map(p => (
                                                    <td key={p} style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 700, color: COLOR_NAVY, fontVariantNumeric: 'tabular-nums' }}>
                                                        {row.valores?.[p] !== undefined ? Number(row.valores[p]).toLocaleString('es-AR') : '—'}
                                                    </td>
                                                ))}
                                                <td style={{ padding: '9px 12px', color: '#475569' }}>{row.lectura}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardBlock>
                    )}

                    {/* 5. Logros vs. Pendientes y Conclusión */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '16px' }}>
                        <CardBlock title="Principales Logros del Período" subtitle="Avances verificados en producción, seguridad e infraestructura">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {(draftRevision.logros_periodo || []).map((lg, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.8rem', color: '#1E293B' }}>
                                        <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span>{lg}</span>
                                    </div>
                                ))}
                            </div>
                        </CardBlock>

                        <CardBlock title="Pendientes y Alertas al Cierre" subtitle="Focos prioritarios que deben pasar al Plan 2027">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                                {(draftRevision.pendientes_alertas || []).map((al, i) => (
                                    <div key={i} style={{ display: 'flex', gap: '8px', alignItems: 'flex-start', fontSize: '0.8rem', color: '#1E293B' }}>
                                        <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <span>{al}</span>
                                    </div>
                                ))}
                            </div>
                        </CardBlock>
                    </div>

                    {draftRevision.conclusion_direccion && (
                        <CardBlock title="Conclusión de Dirección y Pedido para el Ejercicio 2027">
                            <p style={{ margin: 0, fontSize: '0.84rem', lineHeight: 1.55, color: '#0F172A', padding: '12px 14px', background: '#F8FAFC', borderRadius: '8px', borderLeft: `4px solid ${COLOR_NAVY}` }}>
                                {draftRevision.conclusion_direccion}
                            </p>
                            {draftRevision.pedido_proximo_ejercicio?.intro && (
                                <div style={{ padding: '12px 14px', borderRadius: '8px', background: '#EFF6FF', border: '1px solid #BFDBFE', fontSize: '0.8rem', color: '#1E293B' }}>
                                    <div style={{ fontWeight: 800, color: COLOR_NAVY, marginBottom: '4px' }}>{draftRevision.pedido_proximo_ejercicio.titulo}</div>
                                    <div>{draftRevision.pedido_proximo_ejercicio.intro}</div>
                                    {draftRevision.pedido_proximo_ejercicio.temas_recomendados && (
                                        <div style={{ marginTop: '6px', fontSize: '0.76rem', color: '#1E40AF' }}>
                                            <strong>Ejes recomendados:</strong> {draftRevision.pedido_proximo_ejercicio.temas_recomendados}
                                        </div>
                                    )}
                                </div>
                            )}
                        </CardBlock>
                    )}
                </div>
            )}

            {/* =====================================================================
                PILAR 3: OBJETIVOS DEL SECTOR (ACCIONABLES 2027)
               ===================================================================== */}
            {activePilar === 'objetivos' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* KPIs de Objetivos Accionables */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '12px' }}>
                        {[
                            { lbl: 'OBJETIVOS PRIORIZADOS 2027', val: objStats.totalObj, sub: 'Meta institucional: 3 a 5 por servicio', col: COLOR_NAVY },
                            { lbl: 'AVANCE GLOBAL DE ACCIONES', val: `${objStats.avgPct}%`, sub: `${objStats.doneAcc} de ${objStats.totalAcc} acciones ejecutadas`, col: '#0284C7' },
                            { lbl: 'OBJETIVOS CUMPLIDOS', val: `${objStats.cumplidos} / ${objStats.totalObj}`, sub: 'Período Nov 2026 – Oct 2027', col: '#059669' },
                        ].map((k, idx) => (
                            <div key={idx} style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', borderLeft: `4px solid ${k.col}`, padding: '14px 16px' }}>
                                <div style={{ fontSize: '0.7rem', fontWeight: 800, color: '#64748B' }}>{k.lbl}</div>
                                <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#0F172A', margin: '4px 0 2px' }}>{k.val}</div>
                                <div style={{ fontSize: '0.74rem', color: '#475569' }}>{k.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Barra de Herramientas de Objetivos */}
                    <div style={{
                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 16px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
                    }}>
                        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                            Planificación y Seguimiento Accionable — Ejercicio 2027 ({sectorMeta.nombre})
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            {/* Guía Oficial: solo '?' con descripción al pasar el mouse */}
                            <div
                                style={{ position: 'relative', display: 'inline-flex' }}
                                onMouseEnter={() => setShowGuiaObjetivos(true)}
                                onMouseLeave={() => setShowGuiaObjetivos(false)}
                            >
                                <button
                                    type="button"
                                    onClick={() => setShowGuiaObjetivos(p => !p)}
                                    aria-label="Guía Oficial Dirección"
                                    style={{
                                        width: '34px', height: '34px', borderRadius: '8px',
                                        border: '1px solid #CBD5E1', background: showGuiaObjetivos ? '#EFF6FF' : '#FFFFFF',
                                        color: COLOR_NAVY, fontSize: '0.9rem', fontWeight: 800,
                                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                    }}
                                >
                                    ?
                                </button>
                                {showGuiaObjetivos && (
                                    <div style={{
                                        position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 80,
                                        width: '440px', maxWidth: '88vw', background: '#FFFFFF',
                                        border: '1px solid #CBD5E1', borderRadius: '10px',
                                        boxShadow: '0 12px 28px rgba(15, 23, 42, 0.14)', padding: '14px 16px'
                                    }}>
                                        <div style={{ fontSize: '0.78rem', fontWeight: 800, color: COLOR_NAVY, marginBottom: '8px', paddingBottom: '6px', borderBottom: '1px solid #F1F5F9' }}>
                                            Guía Oficial — Propuesta de Objetivos 2027
                                        </div>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', maxHeight: '340px', overflowY: 'auto' }}>
                                            {GUIA_OBJETIVOS_2027.map((g, i) => (
                                                <div key={i} style={{ fontSize: '0.73rem', lineHeight: 1.4 }}>
                                                    <strong style={{ color: COLOR_NAVY }}>{g.campo}:</strong>{' '}
                                                    <span style={{ color: '#334155' }}>{g.desc}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* Exportar Excel: solo icono con tooltip 'Exportar' */}
                            <button
                                type="button"
                                title="Exportar"
                                aria-label="Exportar"
                                onClick={() => exportObjetivos2027Excel(objetivos, { servicioNombre: sectorMeta.nombre, responsable: sectorMeta.responsableDefault, anio: 2027 })}
                                disabled={!objetivos.length}
                                style={{
                                    width: '34px', height: '34px', borderRadius: '8px',
                                    border: '1px solid #BFDBFE', background: '#EFF6FF', color: COLOR_NAVY,
                                    cursor: objetivos.length ? 'pointer' : 'not-allowed',
                                    opacity: objetivos.length ? 1 : 0.45,
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center'
                                }}
                            >
                                <FileSpreadsheet size={16} />
                            </button>

                            <button
                                type="button"
                                onClick={handleAddNuevoObjetivo}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 14px', borderRadius: '8px', border: 'none', background: COLOR_NAVY, color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer', height: '34px' }}
                            >
                                <Plus size={15} /> Nuevo Objetivo 2027
                            </button>
                        </div>
                    </div>

                    {/* Tarjetas Accionables de Objetivos (Estética Calidad-QOAG · Paleta Institucional) */}
                    {objetivos.map((obj) => {
                        const isEditing = editingObjId === obj.id;
                        const acciones = obj.acciones_principales || [];
                        const completadasCount = acciones.filter(a => a.completada).length;
                        const pct = obj.progreso_pct || 0;
                        return (
                            <div key={obj.id} style={{
                                background: '#FFFFFF',
                                border: '1px solid #E2E8F0',
                                borderLeft: `4px solid ${COLOR_NAVY}`,
                                borderRadius: '10px',
                                padding: '18px 20px',
                                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '14px'
                            }}>
                                {/* Cabecera del Objetivo */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>
                                    <div style={{ flex: '1 1 480px', minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: COLOR_NAVY, color: '#FFFFFF', fontSize: '0.7rem', fontWeight: 800, letterSpacing: '0.03em' }}>
                                                OBJ-0{obj.orden}
                                            </span>
                                            <span style={{ padding: '2px 8px', borderRadius: '6px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: COLOR_NAVY, fontSize: '0.7rem', fontWeight: 700 }}>
                                                {obj.estado || 'En ejecución'}
                                            </span>
                                            {obj.plazo && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', fontWeight: 600, color: '#475569' }}>
                                                    <Calendar size={12} color="#64748B" /> {obj.plazo}
                                                </span>
                                            )}
                                            {obj.responsable && (
                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.73rem', color: '#64748B' }}>
                                                    <Users size={12} color="#64748B" /> {obj.responsable}
                                                </span>
                                            )}
                                        </div>
                                        {isEditing ? (
                                            <input
                                                style={{ ...inputStyle, fontWeight: 800, fontSize: '0.94rem' }}
                                                value={obj.objetivo || ''}
                                                onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, objetivo: e.target.value } : o)))}
                                            />
                                        ) : (
                                            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.35 }}>
                                                {obj.objetivo}
                                            </h4>
                                        )}
                                    </div>

                                    {/* Avance Institucional + Acciones */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
                                        <div style={{ minWidth: '132px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 10px' }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '4px' }}>
                                                <span style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Avance</span>
                                                <span style={{ fontSize: '0.82rem', fontWeight: 800, color: COLOR_NAVY }}>{pct}%</span>
                                            </div>
                                            <div style={{ width: '100%', height: '6px', background: '#E2E8F0', borderRadius: '999px', overflow: 'hidden' }}>
                                                <div style={{ width: `${pct}%`, height: '100%', background: COLOR_NAVY, borderRadius: '999px', transition: 'width 0.25s ease' }} />
                                            </div>
                                        </div>
                                        {isEditing ? (
                                            <button
                                                type="button"
                                                onClick={() => handleSaveObjetivoEdit(obj)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 12px', borderRadius: '8px', border: 'none', background: COLOR_NAVY, color: '#FFFFFF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                <Save size={13} /> Guardar
                                            </button>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => setEditingObjId(obj.id)}
                                                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', padding: '7px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer' }}
                                            >
                                                <Edit3 size={13} /> Editar
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            title="Eliminar objetivo"
                                            onClick={() => handleDeleteObjetivo(obj)}
                                            style={{ border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#64748B', borderRadius: '8px', padding: '7px', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    </div>
                                </div>

                                {/* Cuerpo: Edición o Vista 2 Columnas (Ficha Técnica | Plan de Acción) */}
                                {isEditing ? (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Situación de partida / Línea de base</label>
                                            <textarea rows={2} style={inputStyle} value={obj.linea_base || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, linea_base: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Resultado esperado</label>
                                            <textarea rows={2} style={inputStyle} value={obj.resultado_esperado || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, resultado_esperado: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Indicador</label>
                                            <input style={inputStyle} value={obj.indicador || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, indicador: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Fórmula / Forma de medición</label>
                                            <input style={inputStyle} value={obj.formula_medicion || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, formula_medicion: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Meta Cuantitativa 2027</label>
                                            <input style={inputStyle} value={obj.meta || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, meta: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Plazo / Fecha objetivo</label>
                                            <input style={inputStyle} value={obj.plazo || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, plazo: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Responsable Principal</label>
                                            <input style={inputStyle} value={obj.responsable || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, responsable: e.target.value } : o)))} />
                                        </div>
                                        <div>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Estado del Objetivo</label>
                                            <select style={inputStyle} value={obj.estado || 'En ejecución'} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, estado: e.target.value } : o)))}>
                                                <option value="En formulación">En formulación</option>
                                                <option value="Elevado a Dirección">Elevado a Dirección</option>
                                                <option value="Aprobado">Aprobado</option>
                                                <option value="En ejecución">En ejecución</option>
                                                <option value="En riesgo">En riesgo</option>
                                                <option value="Cumplido">Cumplido</option>
                                            </select>
                                        </div>
                                        <div style={{ gridColumn: '1 / -1' }}>
                                            <label style={{ fontSize: '0.7rem', fontWeight: 700, color: '#475569' }}>Necesidades de apoyo / inversión</label>
                                            <input style={inputStyle} value={obj.necesidades_apoyo || ''} onChange={e => setObjetivos(prev => prev.map(o => (o.id === obj.id ? { ...o, necesidades_apoyo: e.target.value } : o)))} />
                                        </div>
                                    </div>
                                ) : (
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: '16px', alignItems: 'start' }}>
                                        {/* Columna Izquierda: Ficha Técnica */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                            <div style={{ padding: '10px 12px', borderRadius: '8px', background: '#EFF6FF', border: '1px solid #BFDBFE' }}>
                                                <div style={{ fontSize: '0.67rem', fontWeight: 800, color: COLOR_NAVY, textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '2px' }}>
                                                    Meta 2027
                                                </div>
                                                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.4 }}>
                                                    {obj.meta || '—'}
                                                </div>
                                            </div>
                                            <div style={{ padding: '9px 12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                                <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '2px' }}>
                                                    Indicador y Fórmula
                                                </div>
                                                <div style={{ fontSize: '0.78rem', color: '#334155', lineHeight: 1.4 }}>
                                                    {obj.indicador || '—'} {obj.formula_medicion ? `(${obj.formula_medicion})` : ''}
                                                </div>
                                            </div>
                                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                                                <div style={{ padding: '9px 12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '2px' }}>
                                                        Línea de base
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', color: '#334155', lineHeight: 1.4 }}>
                                                        {obj.linea_base || '—'}
                                                    </div>
                                                </div>
                                                <div style={{ padding: '9px 12px', borderRadius: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0' }}>
                                                    <div style={{ fontSize: '0.67rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', marginBottom: '2px' }}>
                                                        Apoyo / Inversión
                                                    </div>
                                                    <div style={{ fontSize: '0.76rem', color: '#334155', lineHeight: 1.4 }}>
                                                        {obj.necesidades_apoyo || 'No requiere'}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Columna Derecha: Plan de Acción Operativo */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}>
                                                <span style={{ fontSize: '0.74rem', fontWeight: 800, color: COLOR_NAVY, display: 'inline-flex', alignItems: 'center', gap: '6px', textTransform: 'uppercase', letterSpacing: '0.02em' }}>
                                                    <ListChecks size={14} /> Plan de Acción
                                                </span>
                                                <span style={{ fontSize: '0.7rem', fontWeight: 700, color: COLOR_NAVY, background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '6px', padding: '1px 7px' }}>
                                                    {completadasCount}/{acciones.length}
                                                </span>
                                            </div>
                                            {acciones.map((acc, aIdx) => (
                                                <label
                                                    key={acc.id || aIdx}
                                                    style={{
                                                        display: 'flex', alignItems: 'center', gap: '9px',
                                                        padding: '8px 11px', borderRadius: '8px',
                                                        background: acc.completada ? '#EFF6FF' : '#FFFFFF',
                                                        border: acc.completada ? '1px solid #BFDBFE' : '1px solid #E2E8F0',
                                                        cursor: 'pointer', fontSize: '0.79rem',
                                                        color: acc.completada ? '#475569' : '#0F172A',
                                                        textDecoration: acc.completada ? 'line-through' : 'none',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={Boolean(acc.completada)}
                                                        onChange={() => handleToggleAccionObjetivo(obj, aIdx)}
                                                        style={{ accentColor: COLOR_NAVY, width: '15px', height: '15px', cursor: 'pointer', flexShrink: 0 }}
                                                    />
                                                    <span style={{ flex: 1, fontWeight: acc.completada ? 500 : 600, lineHeight: 1.35 }}>{acc.texto}</span>
                                                </label>
                                            ))}
                                            <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                                <input
                                                    style={{ ...inputStyle, flex: 1 }}
                                                    value={newAccionText[obj.id] || ''}
                                                    onChange={e => setNewAccionText(prev => ({ ...prev, [obj.id]: e.target.value }))}
                                                    onKeyDown={e => { if (e.key === 'Enter') handleAddAccionToObjetivo(obj); }}
                                                    placeholder="Agregar acción..."
                                                />
                                                <button
                                                    type="button"
                                                    onClick={() => handleAddAccionToObjetivo(obj)}
                                                    style={{ padding: '6px 12px', borderRadius: '8px', border: '1px solid #BFDBFE', background: '#EFF6FF', color: COLOR_NAVY, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
                                                >
                                                    + Acción
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* =====================================================================
                PILAR 4: OPORTUNIDADES DE MEJORA EN TIEMPO REAL — DORA (SOLO LECTURA)
               ===================================================================== */}
            {activePilar === 'dora_om' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {/* Banner de conexión Solo Lectura con Dora */}
                    <div style={{
                        background: '#FFFFFF', border: '1px solid #BFDBFE', borderLeft: `4px solid ${COLOR_NAVY}`,
                        borderRadius: '10px', padding: '14px 18px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
                    }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                <span style={{ fontSize: '0.94rem', fontWeight: 800, color: COLOR_NAVY }}>
                                    Oportunidades de Mejora en Tiempo Real — Sistema de Calidad Dora
                                </span>
                                <span style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '4px',
                                    padding: '2px 9px', borderRadius: '999px', fontSize: '0.68rem', fontWeight: 800,
                                    background: '#ECFDF5', color: '#065F46', border: '1px solid #A7F3D0'
                                }}>
                                    <Lock size={11} /> SOLO LECTURA · EN VIVO
                                </span>
                            </div>
                            <div style={{ fontSize: '0.76rem', color: '#64748B', marginTop: '3px' }}>
                                Sectores vinculados en Dora: {(doraData.doraSectors || []).map(formatDoraSectorLabel).join(' · ') || 'Sin sectores mapeados'}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={loadDoraOm}
                            disabled={loadingDora}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                padding: '7px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                background: '#FFFFFF', color: COLOR_NAVY, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer'
                            }}
                        >
                            <RefreshCw size={14} className={loadingDora ? 'animate-spin' : ''} /> Actualizar desde Dora
                        </button>
                    </div>

                    {/* 4 KPIs en vivo de Dora */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: '12px' }}>
                        {[
                            { lbl: 'REPORTES / OM EN DORA', val: doraData.metrics.total, sub: `${doraData.metrics.pendientes} pendientes · ${doraData.metrics.validacion} en validación`, col: COLOR_NAVY },
                            { lbl: 'TASA DE RESOLUCIÓN', val: `${doraData.metrics.pctResolucion}%`, sub: `${doraData.metrics.resueltos} reportes cerrados`, col: '#059669' },
                            { lbl: 'CRÍTICOS / EVENTOS ADVERSOS', val: doraData.metrics.criticos, sub: 'Urgencia alta/crítica o EA', col: '#DC2626' },
                            { lbl: 'PROMEDIO DÍAS DE CIERRE', val: doraData.metrics.avgDiasCierre !== null ? `${doraData.metrics.avgDiasCierre} d` : '—', sub: 'Desde creación hasta resolución', col: '#0284C7' },
                        ].map((k, idx) => (
                            <div key={idx} style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', borderLeft: `4px solid ${k.col}`, padding: '13px 15px' }}>
                                <div style={{ fontSize: '0.68rem', fontWeight: 800, color: '#64748B' }}>{k.lbl}</div>
                                <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: '3px 0 2px' }}>{k.val}</div>
                                <div style={{ fontSize: '0.72rem', color: '#475569' }}>{k.sub}</div>
                            </div>
                        ))}
                    </div>

                    {/* Filtros de consulta en vivo */}
                    <div style={{
                        background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px 14px',
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px'
                    }}>
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {[
                                { id: 'all', label: `Todos (${doraData.metrics.total})` },
                                { id: 'pending', label: `Pendientes (${doraData.metrics.pendientes})` },
                                { id: 'validation', label: `Validación Calidad (${doraData.metrics.validacion})` },
                                { id: 'resolved', label: `Resueltos (${doraData.metrics.resueltos})` },
                                { id: 'critical', label: `Críticos / EA (${doraData.metrics.criticos})` },
                            ].map(f => (
                                <button
                                    key={f.id}
                                    type="button"
                                    onClick={() => setDoraStatusFilter(f.id)}
                                    style={{
                                        padding: '5px 10px', borderRadius: '8px', fontSize: '0.73rem', fontWeight: 700, cursor: 'pointer',
                                        border: doraStatusFilter === f.id ? `1px solid ${COLOR_NAVY}` : '1px solid #CBD5E1',
                                        background: doraStatusFilter === f.id ? COLOR_NAVY : '#FFFFFF',
                                        color: doraStatusFilter === f.id ? '#FFFFFF' : '#475569'
                                    }}
                                >
                                    {f.label}
                                </button>
                            ))}

                            {(doraData.doraSectors || []).length > 1 && (
                                <select
                                    value={doraSectorFilter}
                                    onChange={e => setDoraSectorFilter(e.target.value)}
                                    style={{ padding: '5px 9px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.73rem', fontWeight: 700, color: '#0F172A' }}
                                >
                                    <option value="all">Todas las Sedes Dora</option>
                                    {doraData.doraSectors.map(sec => (
                                        <option key={sec} value={sec}>{formatDoraSectorLabel(sec)}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div style={{ position: 'relative', minWidth: '240px', flex: '0 1 300px' }}>
                            <Search size={14} style={{ position: 'absolute', left: '10px', top: '9px', color: '#64748B' }} />
                            <input
                                type="text"
                                value={doraSearch}
                                onChange={e => setDoraSearch(e.target.value)}
                                placeholder="Buscar por código, resumen o causa..."
                                style={{ ...inputStyle, paddingLeft: '30px' }}
                            />
                        </div>
                    </div>

                    {doraError && (
                        <div style={{ padding: '12px 16px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#991B1B', fontSize: '0.8rem', fontWeight: 600 }}>
                            Error consultando Dora: {doraError}
                        </div>
                    )}

                    {/* Listado de OM en tiempo real */}
                    {loadingDora ? (
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '44px', textAlign: 'center', color: '#64748B' }}>
                            <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                            Consultando reportes de Calidad en Dora...
                        </div>
                    ) : filteredDoraReports.length === 0 ? (
                        <div style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '0.84rem' }}>
                            No se encontraron Oportunidades de Mejora en Dora con los filtros actuales.
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {filteredDoraReports.map(rep => {
                                const stInfo = formatDoraStatus(rep.status);
                                const isOpen = expandedDoraId === rep.id;
                                const fechaTxt = rep.created_at ? new Date(rep.created_at).toLocaleDateString('es-AR') : '—';
                                const isCrit = rep.is_adverse_event || String(rep.ai_urgency || '').toLowerCase().includes('crit') || String(rep.ai_urgency || '').toLowerCase() === 'high';
                                return (
                                    <div key={rep.id} style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '10px', overflow: 'hidden' }}>
                                        <div
                                            onClick={() => setExpandedDoraId(isOpen ? null : rep.id)}
                                            style={{
                                                padding: '12px 15px', cursor: 'pointer',
                                                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap'
                                            }}
                                        >
                                            <div style={{ flex: '1 1 460px', minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexWrap: 'wrap', marginBottom: '4px' }}>
                                                    <span style={{ fontSize: '0.72rem', fontWeight: 800, color: COLOR_NAVY, background: '#EFF6FF', padding: '2px 7px', borderRadius: '6px' }}>
                                                        {rep.tracking_id || 'DORA'}
                                                    </span>
                                                    <StatusBadge value={stInfo.label} />
                                                    {isCrit && (
                                                        <span style={{ fontSize: '0.68rem', fontWeight: 800, padding: '2px 7px', borderRadius: '999px', background: '#FEE2E2', color: '#991B1B', border: '1px solid #FCA5A5' }}>
                                                            {rep.is_adverse_event ? 'Evento Adverso' : 'Urgencia Alta'}
                                                        </span>
                                                    )}
                                                    <span style={{ fontSize: '0.71rem', fontWeight: 700, color: '#475569' }}>
                                                        {formatDoraSectorLabel(rep.dora_sector_match || rep.sector)}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>· {fechaTxt}</span>
                                                </div>
                                                <div style={{ fontSize: '0.84rem', fontWeight: 700, color: '#0F172A', lineHeight: 1.35 }}>
                                                    {rep.ai_summary || (rep.content || 'Sin descripción').slice(0, 180)}
                                                </div>
                                            </div>

                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                                                {draftInforme && (
                                                    <button
                                                        type="button"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleImportDoraReportToRdir04(rep);
                                                        }}
                                                        title="Copiar esta OM al informe RDIR 04 del mes (no modifica Dora)"
                                                        style={{
                                                            padding: '5px 9px', borderRadius: '7px', border: '1px solid #BFDBFE',
                                                            background: '#EFF6FF', color: COLOR_NAVY, fontSize: '0.71rem', fontWeight: 700, cursor: 'pointer'
                                                        }}
                                                    >
                                                        + Llevar al RDIR 04
                                                    </button>
                                                )}
                                                {isOpen ? <ChevronUp size={16} color="#64748B" /> : <ChevronDown size={16} color="#64748B" />}
                                            </div>
                                        </div>

                                        {isOpen && (
                                            <div style={{ padding: '12px 16px', borderTop: '1px solid #F1F5F9', background: '#F8FAFC', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px', fontSize: '0.78rem' }}>
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <strong style={{ color: COLOR_NAVY }}>Descripción del reporte:</strong>
                                                    <div style={{ color: '#334155', marginTop: '2px', whiteSpace: 'pre-wrap' }}>{rep.content || '—'}</div>
                                                </div>
                                                <div><strong style={{ color: COLOR_NAVY }}>Categoría / Tipo:</strong> <span style={{ color: '#334155' }}>{rep.ai_category || rep.finding_type || '—'}</span></div>
                                                <div><strong style={{ color: COLOR_NAVY }}>Sector origen:</strong> <span style={{ color: '#334155' }}>{rep.origin_sector || rep.reporter_sector || '—'}</span></div>
                                                <div><strong style={{ color: COLOR_NAVY }}>Causa raíz:</strong> <span style={{ color: '#334155' }}>{rep.root_cause || 'Sin registrar'}</span></div>
                                                <div><strong style={{ color: COLOR_NAVY }}>Acción inmediata:</strong> <span style={{ color: '#334155' }}>{rep.immediate_action || 'Sin registrar'}</span></div>
                                                <div style={{ gridColumn: '1 / -1' }}>
                                                    <strong style={{ color: '#065F46' }}>Plan correctivo / Resolución:</strong>{' '}
                                                    <span style={{ color: '#0F172A' }}>{rep.corrective_plan || rep.corrective_action_plan || rep.resolution_notes || 'Pendiente de resolución en Dora.'}</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {/* ── MODAL CREAR NUEVO MES ── */}
            {showNewMonthModal && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.45)', zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }} onClick={() => setShowNewMonthModal(false)}>
                    <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '22px', width: '100%', maxWidth: '400px', boxShadow: '0 20px 30px rgba(0,0,0,0.18)' }} onClick={e => e.stopPropagation()}>
                        <h3 style={{ margin: '0 0 8px', fontSize: '1rem', fontWeight: 800, color: COLOR_NAVY }}>
                            Crear Nuevo Informe Mensual (RDIR 04)
                        </h3>
                        <p style={{ margin: '0 0 14px', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.4 }}>
                            Se clonará automáticamente el Plan de Acción y las Oportunidades de Mejora del mes previo, trasladando los resultados anteriores como base comparativa.
                        </p>
                        <label style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155', display: 'block', marginBottom: '6px' }}>
                            Seleccionar Mes (YYYY-MM)
                        </label>
                        <input
                            type="month"
                            value={newMonthValue}
                            onChange={e => setNewMonthValue(e.target.value)}
                            style={{ ...inputStyle, marginBottom: '16px', fontWeight: 700 }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                            <button type="button" onClick={() => setShowNewMonthModal(false)} style={{ padding: '7px 13px', borderRadius: '8px', border: '1px solid #CBD5E1', background: '#FFFFFF', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer' }}>
                                Cancelar
                            </button>
                            <button type="button" onClick={handleCreateNewMonth} style={{ padding: '7px 14px', borderRadius: '8px', border: 'none', background: COLOR_NAVY, color: '#FFFFFF', fontSize: '0.76rem', fontWeight: 800, cursor: 'pointer' }}>
                                Crear e Inicializar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── LIGHTBOX DE FOTO ADJUNTA ── */}
            {lightboxFoto && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.82)', zIndex: 1300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }} onClick={() => setLightboxFoto(null)}>
                    <div style={{ background: '#FFFFFF', borderRadius: '12px', padding: '14px', maxWidth: '900px', width: '100%', position: 'relative' }} onClick={e => e.stopPropagation()}>
                        <button type="button" onClick={() => setLightboxFoto(null)} style={{ position: 'absolute', top: '10px', right: '10px', border: 'none', borderRadius: '50%', width: '30px', height: '30px', background: '#F1F5F9', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <X size={16} />
                        </button>
                        <img src={lightboxFoto.url || lightboxFoto.dataUrl} alt={lightboxFoto.titulo} style={{ width: '100%', maxHeight: '72vh', objectFit: 'contain', borderRadius: '8px', background: '#0F172A' }} />
                        <div style={{ marginTop: '10px' }}>
                            <div style={{ fontWeight: 800, color: COLOR_NAVY, fontSize: '0.92rem' }}>{lightboxFoto.titulo}</div>
                            {lightboxFoto.descripcion && <div style={{ fontSize: '0.8rem', color: '#475569', marginTop: '2px' }}>{lightboxFoto.descripcion}</div>}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
