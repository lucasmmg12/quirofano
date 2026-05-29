/**
 * BulkTemplateSender — Modal de Envío Masivo de Plantillas Meta WhatsApp
 * 
 * Flujo de 3 etapas:
 *   1. Selección de plantilla Meta
 *   2. Preview de destinatarios con resolución de variables
 *   3. Progreso de envío + resumen final
 * 
 * Diseño: Estética Sanatorio (fondo blanco, bordes suaves, azul institucional)
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    X, Send, FileText, CheckCircle, AlertTriangle, XCircle,
    Loader2, ChevronRight, ChevronLeft, Users, Zap, Clock,
    AlertCircle, Phone, User, Calendar, Shield, Ban,
} from 'lucide-react';
import { fetchMetaTemplates } from '../services/metaTemplateService';
import {
    validateBulkRecipients,
    resolveTemplateForPatient,
    sendBulkTemplates,
    MAX_RECIPIENTS,
    DEFAULT_DELAY_MS,
} from '../services/bulkTemplateSendService';

// ============================================================
// COMPONENT
// ============================================================

export default function BulkTemplateSender({
    isOpen,
    onClose,
    selectedSurgeries,
    addToast,
    currentUser,
}) {
    // ── State ──
    const [step, setStep] = useState(1); // 1=template, 2=preview, 3=sending
    const [templates, setTemplates] = useState([]);
    const [loadingTemplates, setLoadingTemplates] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState(null);
    const [lineId] = useState('line_b'); // Default Meta line
    const [sending, setSending] = useState(false);
    const [progress, setProgress] = useState(null);
    const [finalSummary, setFinalSummary] = useState(null);
    const [templateSearch, setTemplateSearch] = useState('');

    const abortControllerRef = useRef(null);

    // ── Validation ──
    const { valid, invalid } = useMemo(() => {
        if (!selectedSurgeries || selectedSurgeries.length === 0) {
            return { valid: [], invalid: [] };
        }
        return validateBulkRecipients(selectedSurgeries);
    }, [selectedSurgeries]);

    // ── Template variable preview per patient ──
    const recipientPreviews = useMemo(() => {
        if (!selectedTemplate || valid.length === 0) return [];
        return valid.map(surgery => {
            const result = resolveTemplateForPatient(selectedTemplate, surgery);
            return { surgery, ...result };
        });
    }, [selectedTemplate, valid]);

    const allCanSend = recipientPreviews.every(r => r.allResolved);
    const sendableCount = recipientPreviews.filter(r => r.allResolved).length;

    // ── Load templates ──
    useEffect(() => {
        if (!isOpen) return;
        setLoadingTemplates(true);
        fetchMetaTemplates(lineId)
            .then(tpls => setTemplates(tpls.filter(t => t.status === 'APPROVED')))
            .catch(err => {
                console.error('[BulkTemplateSender] Error loading templates:', err);
                addToast?.('Error al cargar plantillas Meta', 'error');
            })
            .finally(() => setLoadingTemplates(false));
    }, [isOpen, lineId, addToast]);

    // ── Reset on close/open ──
    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setSelectedTemplate(null);
            setSending(false);
            setProgress(null);
            setFinalSummary(null);
            setTemplateSearch('');
        }
    }, [isOpen]);

    // ── Filtered templates ──
    const filteredTemplates = useMemo(() => {
        if (!templateSearch) return templates;
        const q = templateSearch.toLowerCase();
        return templates.filter(t =>
            (t.name || '').toLowerCase().includes(q) ||
            (t.components?.find(c => c.type === 'BODY')?.text || '').toLowerCase().includes(q)
        );
    }, [templates, templateSearch]);

    // ── Send handler ──
    const handleSend = useCallback(async () => {
        if (sending || !selectedTemplate || sendableCount === 0) return;

        const sendable = recipientPreviews
            .filter(r => r.allResolved)
            .map(r => r.surgery);

        setSending(true);
        setStep(3);
        setProgress({ current: 0, total: sendable.length, results: [] });

        abortControllerRef.current = new AbortController();

        try {
            const result = await sendBulkTemplates({
                surgeries: sendable,
                template: selectedTemplate,
                lineId,
                signal: abortControllerRef.current.signal,
                delayMs: DEFAULT_DELAY_MS,
                senderName: currentUser?.nombre || currentUser?.usuario || 'Sistema ADM-QUI',
                onProgress: (prog) => {
                    setProgress(prev => ({
                        ...prev,
                        current: prog.current,
                        total: prog.total,
                        lastStatus: prog.status,
                        lastMessage: prog.message,
                        results: [...(prev?.results || []), {
                            surgery: prog.surgery,
                            status: prog.status,
                            message: prog.message,
                        }],
                    }));
                },
            });

            setFinalSummary(result);

            if (result.aborted) {
                addToast?.(`Envío cancelado. ${result.sent} enviados de ${sendable.length}`, 'info');
            } else if (result.failed > 0) {
                addToast?.(`Envío completado: ${result.sent} ✅ ${result.failed} ❌`, 'info');
            } else {
                addToast?.(`✅ ${result.sent} plantillas enviadas exitosamente`, 'success');
            }
        } catch (err) {
            console.error('[BulkTemplateSender] Error:', err);
            addToast?.('Error en el envío masivo: ' + err.message, 'error');
        } finally {
            setSending(false);
        }
    }, [sending, selectedTemplate, sendableCount, recipientPreviews, lineId, currentUser, addToast]);

    // ── Abort handler ──
    const handleAbort = () => {
        abortControllerRef.current?.abort();
    };

    if (!isOpen) return null;

    // ============================================================
    // RENDER
    // ============================================================

    const estimatedTime = Math.ceil((sendableCount * DEFAULT_DELAY_MS) / 1000);
    const estimatedMinutes = Math.floor(estimatedTime / 60);
    const estimatedSeconds = estimatedTime % 60;

    return createPortal(
        <div style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'fadeIn 0.2s ease-out',
        }} onClick={(e) => { if (e.target === e.currentTarget && !sending) onClose(); }}>
            <div style={{
                background: '#fff', borderRadius: '16px',
                width: '680px', maxWidth: '95vw', maxHeight: '85vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
                animation: 'slideUp 0.3s ease-out',
                overflow: 'hidden',
            }}>
                {/* ── Header ── */}
                <div style={{
                    padding: '20px 24px', borderBottom: '1px solid #E5E7EB',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    background: 'linear-gradient(135deg, #1E40AF08, #3B82F608)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                            width: '40px', height: '40px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #1E40AF, #3B82F6)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Send size={20} color="#fff" />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 700, color: '#111827' }}>
                                Envío Masivo de Plantilla
                            </h2>
                            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>
                                {valid.length} destinatario{valid.length !== 1 ? 's' : ''} válido{valid.length !== 1 ? 's' : ''}
                                {invalid.length > 0 && ` · ${invalid.length} excluido${invalid.length !== 1 ? 's' : ''}`}
                            </span>
                        </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        {/* Step indicator */}
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                            {[1, 2, 3].map(s => (
                                <div key={s} style={{
                                    width: s === step ? '24px' : '8px', height: '8px',
                                    borderRadius: '4px', transition: 'all 0.3s ease',
                                    background: s <= step ? '#3B82F6' : '#D1D5DB',
                                }} />
                            ))}
                        </div>
                        {!sending && (
                            <button onClick={onClose} style={{
                                background: 'none', border: 'none', cursor: 'pointer',
                                padding: '6px', borderRadius: '8px', color: '#6B7280',
                                display: 'flex', alignItems: 'center',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#F3F4F6'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
                            >
                                <X size={20} />
                            </button>
                        )}
                    </div>
                </div>

                {/* ── Body ── */}
                <div style={{ flex: 1, overflow: 'auto', padding: '20px 24px' }}>
                    {/* STEP 1: Template Selection */}
                    {step === 1 && (
                        <div>
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                marginBottom: '16px',
                            }}>
                                <FileText size={16} color="#3B82F6" />
                                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#374151' }}>
                                    Seleccioná una plantilla aprobada
                                </span>
                            </div>

                            {/* Search */}
                            <input
                                type="text"
                                placeholder="Buscar plantilla..."
                                value={templateSearch}
                                onChange={e => setTemplateSearch(e.target.value)}
                                style={{
                                    width: '100%', padding: '10px 14px', marginBottom: '12px',
                                    borderRadius: '10px', border: '1.5px solid #E5E7EB',
                                    fontSize: '0.82rem', outline: 'none', boxSizing: 'border-box',
                                    transition: 'border-color 0.2s',
                                }}
                                onFocus={e => { e.target.style.borderColor = '#3B82F6'; }}
                                onBlur={e => { e.target.style.borderColor = '#E5E7EB'; }}
                            />

                            {loadingTemplates ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                                    <Loader2 size={24} style={{ animation: 'spin 1s linear infinite' }} />
                                    <p style={{ marginTop: '8px', fontSize: '0.82rem' }}>Cargando plantillas...</p>
                                </div>
                            ) : filteredTemplates.length === 0 ? (
                                <div style={{ textAlign: 'center', padding: '40px', color: '#6B7280' }}>
                                    <AlertCircle size={24} />
                                    <p style={{ marginTop: '8px', fontSize: '0.82rem' }}>No se encontraron plantillas aprobadas</p>
                                </div>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '380px', overflowY: 'auto' }}>
                                    {filteredTemplates.map((tpl, i) => {
                                        const body = tpl.components?.find(c => c.type === 'BODY')?.text || '';
                                        const isSelected = selectedTemplate?.name === tpl.name;
                                        return (
                                            <div
                                                key={tpl.name || i}
                                                onClick={() => setSelectedTemplate(tpl)}
                                                style={{
                                                    padding: '14px 16px', borderRadius: '10px', cursor: 'pointer',
                                                    border: `2px solid ${isSelected ? '#3B82F6' : '#E5E7EB'}`,
                                                    background: isSelected ? '#EFF6FF' : '#fff',
                                                    transition: 'all 0.15s',
                                                }}
                                                onMouseOver={e => { if (!isSelected) e.currentTarget.style.borderColor = '#93C5FD'; }}
                                                onMouseOut={e => { if (!isSelected) e.currentTarget.style.borderColor = '#E5E7EB'; }}
                                            >
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    marginBottom: '6px',
                                                }}>
                                                    <span style={{
                                                        fontSize: '0.82rem', fontWeight: 600,
                                                        color: isSelected ? '#1E40AF' : '#374151',
                                                    }}>
                                                        📋 {tpl.name}
                                                    </span>
                                                    {isSelected && (
                                                        <CheckCircle size={16} color="#3B82F6" />
                                                    )}
                                                </div>
                                                <p style={{
                                                    margin: 0, fontSize: '0.75rem', color: '#6B7280',
                                                    lineHeight: 1.5, maxHeight: '60px', overflow: 'hidden',
                                                    whiteSpace: 'pre-wrap',
                                                }}>
                                                    {body.length > 180 ? body.substring(0, 180) + '...' : body}
                                                </p>
                                                {body.match(/\{\{\d+\}\}/g) && (
                                                    <div style={{
                                                        marginTop: '6px', display: 'flex', gap: '4px', flexWrap: 'wrap',
                                                    }}>
                                                        {[...new Set(body.match(/\{\{\d+\}\}/g))].map(v => (
                                                            <span key={v} style={{
                                                                padding: '2px 8px', borderRadius: '6px',
                                                                background: '#DBEAFE', color: '#1E40AF',
                                                                fontSize: '0.65rem', fontWeight: 600,
                                                            }}>
                                                                {v}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}

                    {/* STEP 2: Recipient Preview */}
                    {step === 2 && selectedTemplate && (
                        <div>
                            {/* Template summary */}
                            <div style={{
                                padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                                background: '#F0F9FF', border: '1px solid #BAE6FD',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                                    <FileText size={14} color="#0284C7" />
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: '#0C4A6E' }}>
                                        {selectedTemplate.name}
                                    </span>
                                </div>
                                <p style={{
                                    margin: 0, fontSize: '0.72rem', color: '#0369A1',
                                    lineHeight: 1.4, whiteSpace: 'pre-wrap',
                                }}>
                                    {selectedTemplate.components?.find(c => c.type === 'BODY')?.text || ''}
                                </p>
                            </div>

                            {/* Time estimate */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 12px', borderRadius: '8px',
                                background: '#FFFBEB', border: '1px solid #FDE68A',
                                marginBottom: '16px', fontSize: '0.75rem', color: '#92400E',
                            }}>
                                <Clock size={14} />
                                <span>
                                    Tiempo estimado: <strong>{estimatedMinutes > 0 ? `${estimatedMinutes}m ` : ''}{estimatedSeconds}s</strong>
                                    {' '}({sendableCount} envío{sendableCount !== 1 ? 's' : ''} × {DEFAULT_DELAY_MS / 1000}s)
                                </span>
                            </div>

                            {/* Invalid recipients warning */}
                            {invalid.length > 0 && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
                                    background: '#FEF2F2', border: '1px solid #FECACA',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                        <AlertTriangle size={14} color="#DC2626" />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#991B1B' }}>
                                            {invalid.length} destinatario{invalid.length !== 1 ? 's' : ''} excluido{invalid.length !== 1 ? 's' : ''}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                                        {invalid.slice(0, 5).map((inv, i) => (
                                            <span key={i} style={{ fontSize: '0.7rem', color: '#B91C1C' }}>
                                                • {inv.surgery.nombre}: {inv.reason}
                                            </span>
                                        ))}
                                        {invalid.length > 5 && (
                                            <span style={{ fontSize: '0.7rem', color: '#DC2626', fontStyle: 'italic' }}>
                                                ... y {invalid.length - 5} más
                                            </span>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Unresolved variable warning */}
                            {recipientPreviews.some(r => !r.allResolved) && (
                                <div style={{
                                    padding: '10px 14px', borderRadius: '8px', marginBottom: '12px',
                                    background: '#FFFBEB', border: '1px solid #FDE68A',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                        <AlertCircle size={14} color="#D97706" />
                                        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#92400E' }}>
                                            {recipientPreviews.filter(r => !r.allResolved).length} paciente{recipientPreviews.filter(r => !r.allResolved).length !== 1 ? 's' : ''} con variables sin resolver (serán omitidos)
                                        </span>
                                    </div>
                                </div>
                            )}

                            {/* Recipients table */}
                            <div style={{
                                fontSize: '0.75rem', fontWeight: 600, color: '#374151',
                                marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px',
                            }}>
                                <Users size={14} color="#3B82F6" />
                                {sendableCount} de {valid.length} se enviarán
                            </div>
                            <div style={{ maxHeight: '280px', overflowY: 'auto', borderRadius: '10px', border: '1px solid #E5E7EB' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem' }}>
                                    <thead>
                                        <tr style={{ background: '#F9FAFB', position: 'sticky', top: 0 }}>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>Estado</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>Paciente</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>Teléfono</th>
                                            <th style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#6B7280', borderBottom: '1px solid #E5E7EB' }}>Preview</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {recipientPreviews.map((rp, i) => (
                                            <tr key={rp.surgery.id || i} style={{
                                                borderBottom: '1px solid #F3F4F6',
                                                background: rp.allResolved ? '#fff' : '#FEF2F2',
                                            }}>
                                                <td style={{ padding: '8px 12px' }}>
                                                    {rp.allResolved ? (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '2px 8px', borderRadius: '6px',
                                                            background: '#DCFCE7', color: '#166534',
                                                            fontSize: '0.68rem', fontWeight: 600,
                                                        }}>
                                                            <CheckCircle size={11} /> Listo
                                                        </span>
                                                    ) : (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '2px 8px', borderRadius: '6px',
                                                            background: '#FEE2E2', color: '#991B1B',
                                                            fontSize: '0.68rem', fontWeight: 600,
                                                        }}>
                                                            <Ban size={11} /> Faltan datos
                                                        </span>
                                                    )}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontWeight: 500 }}>
                                                    {rp.surgery.nombre}
                                                </td>
                                                <td style={{ padding: '8px 12px', fontFamily: 'monospace', color: '#6B7280' }}>
                                                    {rp.surgery._normalizedPhone || rp.surgery.telefono}
                                                </td>
                                                <td style={{ padding: '8px 12px', color: '#6B7280', maxWidth: '200px' }}>
                                                    <span style={{
                                                        display: 'block', overflow: 'hidden',
                                                        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                                    }} title={rp.resolvedText}>
                                                        {rp.resolvedText?.substring(0, 80) || '—'}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: Sending Progress */}
                    {step === 3 && (
                        <div>
                            {/* Progress bar */}
                            <div style={{ marginBottom: '20px' }}>
                                <div style={{
                                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                    marginBottom: '8px',
                                }}>
                                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: '#374151' }}>
                                        {finalSummary ? '✅ Envío completado' : (
                                            <>
                                                <Loader2 size={14} style={{
                                                    display: 'inline', verticalAlign: 'middle',
                                                    marginRight: '6px',
                                                    animation: 'spin 1s linear infinite',
                                                }} />
                                                Enviando...
                                            </>
                                        )}
                                    </span>
                                    <span style={{ fontSize: '0.78rem', color: '#6B7280', fontFamily: 'monospace' }}>
                                        {progress?.current || 0} / {progress?.total || 0}
                                    </span>
                                </div>
                                <div style={{
                                    height: '8px', borderRadius: '4px', background: '#E5E7EB',
                                    overflow: 'hidden',
                                }}>
                                    <div style={{
                                        height: '100%', borderRadius: '4px',
                                        background: finalSummary
                                            ? (finalSummary.failed > 0 ? '#F59E0B' : '#22C55E')
                                            : 'linear-gradient(90deg, #3B82F6, #1E40AF)',
                                        width: `${progress?.total ? (progress.current / progress.total) * 100 : 0}%`,
                                        transition: 'width 0.5s ease',
                                    }} />
                                </div>
                            </div>

                            {/* Summary stats */}
                            {finalSummary && (
                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                                    gap: '12px', marginBottom: '16px',
                                }}>
                                    <div style={{
                                        padding: '14px', borderRadius: '10px', textAlign: 'center',
                                        background: '#F0FDF4', border: '1px solid #BBF7D0',
                                    }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#166534' }}>
                                            {finalSummary.sent}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#15803D', fontWeight: 600 }}>
                                            Enviados ✅
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '14px', borderRadius: '10px', textAlign: 'center',
                                        background: finalSummary.failed > 0 ? '#FEF2F2' : '#F9FAFB',
                                        border: `1px solid ${finalSummary.failed > 0 ? '#FECACA' : '#E5E7EB'}`,
                                    }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: finalSummary.failed > 0 ? '#DC2626' : '#6B7280' }}>
                                            {finalSummary.failed}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: finalSummary.failed > 0 ? '#B91C1C' : '#6B7280', fontWeight: 600 }}>
                                            Fallaron ❌
                                        </div>
                                    </div>
                                    <div style={{
                                        padding: '14px', borderRadius: '10px', textAlign: 'center',
                                        background: '#F9FAFB', border: '1px solid #E5E7EB',
                                    }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#6B7280' }}>
                                            {finalSummary.skipped}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: '#6B7280', fontWeight: 600 }}>
                                            Omitidos ⏭️
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Live log */}
                            <div style={{
                                maxHeight: '250px', overflowY: 'auto', borderRadius: '10px',
                                border: '1px solid #E5E7EB', background: '#FAFAFA',
                            }}>
                                {(progress?.results || []).map((r, i) => (
                                    <div key={i} style={{
                                        padding: '8px 14px', borderBottom: '1px solid #F3F4F6',
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        fontSize: '0.75rem',
                                        animation: 'fadeIn 0.3s ease-out',
                                    }}>
                                        <span style={{ flexShrink: 0 }}>
                                            {r.status === 'sent' && <CheckCircle size={14} color="#22C55E" />}
                                            {r.status === 'failed' && <XCircle size={14} color="#EF4444" />}
                                            {r.status === 'skipped' && <AlertCircle size={14} color="#F59E0B" />}
                                            {r.status === 'aborted' && <Ban size={14} color="#6B7280" />}
                                        </span>
                                        <span style={{ fontWeight: 500, color: '#374151', minWidth: '120px' }}>
                                            {r.surgery?.nombre?.substring(0, 25)}
                                        </span>
                                        <span style={{
                                            color: r.status === 'sent' ? '#15803D' : r.status === 'failed' ? '#DC2626' : '#6B7280',
                                            fontSize: '0.72rem',
                                        }}>
                                            {r.message}
                                        </span>
                                    </div>
                                ))}
                                {sending && !finalSummary && (
                                    <div style={{
                                        padding: '10px 14px', textAlign: 'center',
                                        color: '#6B7280', fontSize: '0.72rem',
                                    }}>
                                        <Loader2 size={14} style={{ display: 'inline', verticalAlign: 'middle', animation: 'spin 1s linear infinite', marginRight: '6px' }} />
                                        Esperando próximo envío...
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Footer ── */}
                <div style={{
                    padding: '16px 24px', borderTop: '1px solid #E5E7EB',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: '#FAFAFA',
                }}>
                    <div>
                        {step === 2 && (
                            <button onClick={() => setStep(1)} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px', border: '1.5px solid #E5E7EB',
                                background: '#fff', color: '#374151', fontSize: '0.82rem',
                                fontWeight: 600, cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.borderColor = '#9CA3AF'; }}
                            onMouseOut={e => { e.currentTarget.style.borderColor = '#E5E7EB'; }}
                            >
                                <ChevronLeft size={16} /> Cambiar plantilla
                            </button>
                        )}
                    </div>

                    <div style={{ display: 'flex', gap: '10px' }}>
                        {step === 3 && sending && !finalSummary && (
                            <button onClick={handleAbort} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: '8px',
                                border: '1.5px solid #FECACA', background: '#FEF2F2',
                                color: '#DC2626', fontSize: '0.82rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#FEE2E2'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#FEF2F2'; }}
                            >
                                <XCircle size={16} /> Cancelar envío
                            </button>
                        )}

                        {step === 3 && finalSummary && (
                            <button onClick={onClose} style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: '8px',
                                border: 'none', background: '#22C55E',
                                color: '#fff', fontSize: '0.82rem', fontWeight: 600,
                                cursor: 'pointer', transition: 'all 0.15s',
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#16A34A'; }}
                            onMouseOut={e => { e.currentTarget.style.background = '#22C55E'; }}
                            >
                                <CheckCircle size={16} /> Cerrar
                            </button>
                        )}

                        {step === 1 && (
                            <button
                                onClick={() => setStep(2)}
                                disabled={!selectedTemplate || valid.length === 0}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '8px 20px', borderRadius: '8px', border: 'none',
                                    background: selectedTemplate && valid.length > 0
                                        ? 'linear-gradient(135deg, #1E40AF, #3B82F6)'
                                        : '#D1D5DB',
                                    color: '#fff', fontSize: '0.82rem', fontWeight: 600,
                                    cursor: selectedTemplate && valid.length > 0 ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.15s',
                                    opacity: selectedTemplate && valid.length > 0 ? 1 : 0.6,
                                }}
                            >
                                Ver destinatarios <ChevronRight size={16} />
                            </button>
                        )}

                        {step === 2 && (
                            <button
                                onClick={handleSend}
                                disabled={sendableCount === 0 || sending}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '10px 24px', borderRadius: '8px', border: 'none',
                                    background: sendableCount > 0 && !sending
                                        ? 'linear-gradient(135deg, #059669, #10B981)'
                                        : '#D1D5DB',
                                    color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                                    cursor: sendableCount > 0 && !sending ? 'pointer' : 'not-allowed',
                                    transition: 'all 0.15s',
                                    boxShadow: sendableCount > 0 ? '0 4px 14px rgba(16,185,129,0.3)' : 'none',
                                }}
                            >
                                <Send size={16} />
                                Enviar a {sendableCount} paciente{sendableCount !== 1 ? 's' : ''}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Keyframes for animations */}
            <style>{`
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            `}</style>
        </div>,
        document.body
    );
}
