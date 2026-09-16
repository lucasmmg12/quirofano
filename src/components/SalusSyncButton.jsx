/**
 * SalusSyncButton.jsx — Botón de sincronización directa con SALUS
 * 
 * - Si el sync-server está corriendo: botón "Sync SALUS" que ejecuta la sincronización
 * - Si está offline: botón que descarga el launcher .bat para que el usuario lo ejecute
 */
import { useState, useEffect } from 'react';
import { Database, Check, AlertTriangle, Loader2, Download, ChevronDown, ChevronUp, HelpCircle } from 'lucide-react';
import { checkSalusHealth } from '../services/salusSync';
import { getCurrentUser } from '../services/authService';

const SYNC_MODULES = {
    cirugias: { label: 'Cirugías', icon: '🔪' },
    presupuestos: { label: 'Presupuestos', icon: '💰' },
    deudas: { label: 'Deudas', icon: '📊' },
    cobros: { label: 'Cobros', icon: '💵' },
    notasCredito: { label: 'Notas de Crédito', icon: '🧾' },
    altas: { label: 'Altas Adm', icon: '📋' },
    uci: { label: 'T. Intensiva (UCI)', icon: '🫁' },
    fojaQuirurgica: { label: 'Foja Quirúrgica', icon: '📝' },
    facturacionInternada: { label: 'Fact. Internada', icon: '🏥' },
    facturacion: { label: 'Fact. Ambulatoria', icon: '💳' },
    visitas: { label: 'Visitas Sede', icon: '🚶' },
    asociaciones: { label: 'Asociaciones', icon: '🔗' },
    laboratorios: { label: 'Laboratorios', icon: '🧪' },
    consultasGuardia: { label: 'Consultas Guardia', icon: '🚑' },
    recepciones: { label: 'Recepciones', icon: '📥' },
    triage: { label: 'Triage Facturación', icon: '🚦' },
    censoCamas: { label: 'Censo Camas UCI', icon: '🛏️' },
    kinesiologiaUci: { label: 'Kinesiología UCI', icon: '🫁' },
    diagnosticos: { label: 'Diagnósticos', icon: '🩺' },
};

function formatLastSync(date) {
    if (!date) return null;
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return null;

    const pad = (n) => String(n).padStart(2, '0');
    const dia = pad(d.getDate());
    const mes = pad(d.getMonth() + 1);
    const anio = d.getFullYear();
    const hora = pad(d.getHours());
    const min = pad(d.getMinutes());

    return `${dia}/${mes}/${anio} ${hora}:${min} hs`;
}

function getRelativeTime(date) {
    if (!date) return '';
    const d = (date instanceof Date) ? date : new Date(date);
    if (isNaN(d.getTime())) return '';
    const diffMs = Date.now() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'hace instantes';
    if (diffMins === 1) return 'hace 1 min';
    if (diffMins < 60) return `hace ${diffMins} min`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours === 1) return 'hace 1 h';
    if (diffHours < 24) return `hace ${diffHours} hs`;
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays === 1) return 'hace 1 d';
    return `hace ${diffDays} d`;
}

export default function SalusSyncButton({ onComplete, addToast, module = null, showTimestamp = true }) {
    const [salusAvailable, setSalusAvailable] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [results, setResults] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [lastSyncDate, setLastSyncDate] = useState(() => {
        try {
            const saved = localStorage.getItem('salus_last_sync_timestamp');
            return saved ? new Date(saved) : null;
        } catch (_) {
            return null;
        }
    });
    const [, setTick] = useState(0);
    const [showDownloadHelp, setShowDownloadHelp] = useState(false);

    const currentUser = getCurrentUser();
    const isFrojo = currentUser?.usuario === 'frojo';

    const fetchLatestUpdate = useCallback(async () => {
        try {
            const queries = [];
            if (module === 'cirugias') {
                queries.push(
                    supabase.from('surgeries').select('updated_at').order('updated_at', { ascending: false }).limit(1)
                );
            } else if (module === 'altas') {
                queries.push(
                    supabase.from('altas_administrativas').select('updated_at').order('updated_at', { ascending: false }).limit(1)
                );
            } else {
                queries.push(
                    supabase.from('surgeries').select('updated_at').order('updated_at', { ascending: false }).limit(1),
                    supabase.from('altas_administrativas').select('updated_at').order('updated_at', { ascending: false }).limit(1),
                    supabase.from('calidad_censo_camas_uci').select('updated_at').order('updated_at', { ascending: false }).limit(1)
                );
            }

            const resList = await Promise.all(queries);
            const timestamps = resList
                .flatMap(r => r.data || [])
                .map(r => r.updated_at ? new Date(r.updated_at).getTime() : null)
                .filter(Boolean);

            if (timestamps.length > 0) {
                const maxTs = Math.max(...timestamps);
                setLastSyncDate(prev => {
                    if (!prev || maxTs > prev.getTime()) {
                        const d = new Date(maxTs);
                        try {
                            localStorage.setItem('salus_last_sync_timestamp', d.toISOString());
                        } catch (_) {}
                        return d;
                    }
                    return prev;
                });
            }
        } catch (err) {
            console.warn('[SalusSyncButton] Error consultando última actualización:', err);
        }
    }, [module]);

    useEffect(() => {
        fetchLatestUpdate();
        const interval = setInterval(() => {
            fetchLatestUpdate();
            setTick(t => t + 1);
        }, 60000);
        return () => clearInterval(interval);
    }, [fetchLatestUpdate]);

    // Verificar disponibilidad (máximo 2 intentos si está offline para evitar spam de ERR_CONNECTION_REFUSED en consola)
    useEffect(() => {
        let attempts = 0;
        let intervalId = null;
        const check = () => checkSalusHealth().then(h => {
            setSalusAvailable(h.available);
            if (!h.available) {
                attempts++;
                if (attempts >= 2 && intervalId) {
                    clearInterval(intervalId);
                }
            }
        });
        check();
        intervalId = setInterval(check, 10000);
        return () => { if (intervalId) clearInterval(intervalId); };
    }, []);

    const handleSync = async (isFast = true) => {
        setSyncing(true);
        setExpanded(true);
        setResults(null);

        try {
            const SYNC_URL = import.meta.env.VITE_SALUS_SYNC_URL || 'http://127.0.0.1:3456/api/salus';
            const endpoint = `${SYNC_URL}/sync-all${isFast ? '?fast=true' : ''}`;

            // Timeout adaptativo: 5 min para sync rápido, 30 min para full sync
            const timeoutMs = isFast ? 300000 : 1800000;
            const res = await fetch(endpoint, { signal: AbortSignal.timeout(timeoutMs) });
            const json = await res.json();

            if (json.success) {
                const now = new Date();
                setResults(json.results);
                setLastSync(now);
                setLastSyncDate(now);
                try {
                    localStorage.setItem('salus_last_sync_timestamp', now.toISOString());
                } catch (_) {}
                const msg = `✅ Sincronización ${isFast ? 'rápida' : 'completa'} finalizada (${json.elapsed || ''})`;
                addToast?.(msg, 'success');
                onComplete?.();
            } else {
                setResults({ error: json.error });
                addToast?.(`❌ Error: ${json.error}`, 'error');
            }
        } catch (err) {
            const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.name === 'AbortError';
            const errorMsg = isTimeout 
                ? '⏱️ La sincronización superó el tiempo límite de espera' 
                : `❌ Error de conexión con sync-server: ${err.message}`;
            setResults({ error: errorMsg });
            addToast?.(errorMsg, 'error');
        } finally {
            setSyncing(false);
        }
    };

    const handleDownloadLauncher = () => {
        // El .bat está en /public, servido como estático
        const link = document.createElement('a');
        link.href = '/salus-sync-launcher.bat';
        link.download = 'SALUS Sync - Sanatorio Argentino.bat';
        link.click();
        setShowDownloadHelp(true);
    };

    // ── OFFLINE: Ofrecer descarga del launcher ──
    if (salusAvailable === false) {
        const formattedSync = formatLastSync(lastSyncDate);
        const relTime = getRelativeTime(lastSyncDate);

        return (
            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                <button
                    onClick={handleDownloadLauncher}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #F59E0B, #D97706)',
                        color: '#fff', border: 'none',
                        fontSize: '0.78rem', fontWeight: 700,
                        cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(245, 158, 11, 0.3)',
                        transition: 'all 0.2s',
                    }}
                    onMouseOver={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(245, 158, 11, 0.45)'}
                    onMouseOut={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(245, 158, 11, 0.3)'}
                    title="Descargar launcher para conectar con SALUS"
                >
                    <Download size={14} />
                    Activar SALUS
                </button>

                {showTimestamp && formattedSync && (
                    <div
                        title={`Última sincronización con SALUS: ${formattedSync}${relTime ? ' (' + relTime + ')' : ''}`}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '5px',
                            padding: '6px 10px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            fontSize: '0.73rem',
                            color: '#334155',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            userSelect: 'none',
                            lineHeight: 1.2,
                        }}
                    >
                        <Clock size={13} style={{ color: '#0284C7', flexShrink: 0 }} />
                        <span>
                            <span style={{ color: '#64748B', fontWeight: 500 }}>Actualizado: </span>
                            <strong style={{ color: '#0F172A', fontWeight: 700 }}>{formattedSync}</strong>
                            {relTime && (
                                <span style={{ color: '#0284C7', marginLeft: '5px', fontSize: '0.69rem', fontWeight: 600 }}>
                                    ({relTime})
                                </span>
                            )}
                        </span>
                    </div>
                )}

                {showDownloadHelp && (
                    <div style={{
                        position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
                        backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 999999,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <div style={{
                            background: '#fff', borderRadius: '16px',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                            padding: '24px', width: '90%', maxWidth: '400px',
                            position: 'relative'
                        }}>
                            <button 
                                onClick={() => setShowDownloadHelp(false)}
                                style={{
                                    position: 'absolute', top: '16px', right: '16px',
                                    background: '#F3F4F6', border: 'none', cursor: 'pointer',
                                    width: '32px', height: '32px', borderRadius: '50%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    color: '#6B7280', fontSize: '1.2rem', fontWeight: 600,
                                    transition: 'background 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#E5E7EB'}
                                onMouseOut={e => e.currentTarget.style.background = '#F3F4F6'}
                            >✕</button>
                            
                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1F2937', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Download size={22} color="#F59E0B" /> {isFrojo ? 'Reiniciando motor...' : 'Pasos para activar SALUS'}
                            </div>
                            
                            {isFrojo ? (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', alignItems: 'center', margin: '16px 0' }}>
                                    <img src="/homer-girar.gif" alt="Homer girando" style={{ maxWidth: '100%', maxHeight: '220px', borderRadius: '12px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
                                    <h3 style={{ margin: '8px 0', color: '#1F2937', fontSize: '1.1rem', textAlign: 'center', fontWeight: 'bold' }}>Esperando a que arranque el motor...</h3>
                                </div>
                            ) : (
                                <>
                                    <p style={{ fontSize: '0.85rem', color: '#6B7280', marginBottom: '20px', lineHeight: 1.5 }}>
                                        Se ha descargado un archivo para conectar su computadora con los servidores de SALUS. Siga estos sencillos pasos:
                                    </p>

                                    <div style={{ fontSize: '0.9rem', color: '#4B5563', lineHeight: 1.6, display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <span style={{ background: '#6366F1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>1</span>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#374151' }}>Abra el archivo descargado</div>
                                                <div style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Haga doble clic en <strong style={{ color: '#4B5563' }}>SALUS Sync - Sanatorio Argentino.bat</strong></div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <span style={{ background: '#6366F1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>2</span>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#374151' }}>Espere que inicie el servidor</div>
                                                <div style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Se abrirá una ventana negra. Espere hasta ver <strong>"Servidor INICIADO en puerto 3456"</strong>.</div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px' }}>
                                            <span style={{ background: '#6366F1', color: '#fff', borderRadius: '50%', width: '28px', height: '28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', fontWeight: 700, flexShrink: 0 }}>3</span>
                                            <div>
                                                <div style={{ fontWeight: 600, color: '#374151' }}>¡Listo! Vuelva aquí</div>
                                                <div style={{ fontSize: '0.8rem', color: '#9CA3AF' }}>Este botón se volverá color morado automáticamente.</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{
                                        marginTop: '24px', padding: '12px',
                                        background: '#FEF3C7', border: '1px solid #FDE68A', borderRadius: '12px',
                                        fontSize: '0.8rem', color: '#92400E', display: 'flex', alignItems: 'flex-start', gap: '8px'
                                    }}>
                                        <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
                                        <div>
                                            <strong style={{ display: 'block', marginBottom: '2px' }}>Importante</strong>
                                            No cierre la ventana negra mientras use el sistema. Solo necesita hacer esto una vez por día.
                                        </div>
                                    </div>
                                </>
                            )}
                            
                            <button 
                                onClick={() => setShowDownloadHelp(false)}
                                style={{
                                    marginTop: '20px', width: '100%', padding: '10px',
                                    background: '#F3F4F6', color: '#374151', border: 'none', borderRadius: '8px',
                                    fontWeight: 700, cursor: 'pointer', transition: 'background 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#E5E7EB'}
                                onMouseOut={e => e.currentTarget.style.background = '#F3F4F6'}
                            >
                                Entendido
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── VERIFICANDO ──
    if (salusAvailable === null) {
        return (
            <button disabled style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px',
                padding: '8px 14px', borderRadius: '10px',
                background: '#F3F4F6', color: '#9CA3AF',
                border: '1px solid #E5E7EB', fontSize: '0.78rem', fontWeight: 600,
                cursor: 'wait',
            }}>
                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Verificando...
            </button>
        );
    }

    // ── ONLINE: Botón de sync ──
    const renderModule = (key) => {
        const mod = SYNC_MODULES[key];
        const r = results?.[key];
        if (!r || !mod) return null;
        const isError = !!r.error;

        let detail = '';
        if (isError) {
            detail = `❌ ${r.error}`;
        } else if (r.actualizadas !== undefined) {
            detail = `${r.actualizadas} actualizadas`;
        } else if (r.upserted !== undefined) {
            detail = `${r.total || r.upserted} filas → ${r.upserted} guardados`;
        } else if (r.presupuestos !== undefined) {
            detail = `${r.total} filas → ${r.presupuestos} presupuestos, ${r.items} ítems`;
        } else if (r.pacientesNuevos !== undefined) {
            detail = `${r.total} filas → ${r.pacientesNuevos} nuevos, ${r.pacientesActualizados} actualizados`;
        } else if (r.inserted !== undefined || r.updated !== undefined) {
            detail = `${r.total || (r.inserted || 0) + (r.updated || 0)} registros → ${r.inserted || 0} nuevos, ${r.updated || 0} actualizados`;
        } else if (r.count !== undefined) {
            detail = `${r.count} camas sincronizadas`;
        } else {
            detail = `Sincronizado correctamente`;
        }

        return (
            <div key={key} style={{
                display: 'flex', alignItems: 'flex-start', gap: '10px',
                padding: '8px 12px', borderRadius: '8px',
                background: isError ? '#FEF2F2' : '#F0FDF4',
                border: `1px solid ${isError ? '#FECACA' : '#BBF7D0'}`,
            }}>
                <span style={{ fontSize: '1rem' }}>{mod.icon}</span>
                <div style={{ flex: 1 }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        fontWeight: 600, fontSize: '0.78rem',
                        color: isError ? '#DC2626' : '#16A34A',
                    }}>
                        {isError ? <AlertTriangle size={12} /> : <Check size={12} />}
                        {mod.label}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: '#6B7280', marginTop: '3px', lineHeight: 1.4 }}>
                        {detail}
                    </div>
                </div>
            </div>
        );
    };

    const formattedSync = formatLastSync(lastSyncDate);
    const relTime = getRelativeTime(lastSyncDate);

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                    onClick={() => handleSync(true)}
                    disabled={syncing}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '7px',
                        padding: '8px 16px', borderRadius: '10px',
                        background: syncing
                            ? 'linear-gradient(135deg, #818CF8, #6366F1)'
                            : 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        color: '#fff', border: 'none',
                        fontSize: '0.8rem', fontWeight: 700,
                        cursor: syncing ? 'wait' : 'pointer',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                        transition: 'all 0.2s',
                    }}
                    onMouseOver={e => { if (!syncing) e.currentTarget.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.45)'; }}
                    onMouseOut={e => { e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)'; }}
                    title="Sincroniza SOLO la actividad de los últimos 30 días. Demora pocos segundos. Ideal para el uso diario."
                >
                    {syncing ? (
                        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                        <Database size={15} />
                    )}
                    {syncing ? 'Sincronizando...' : 'Sync Rápido'}
                </button>

                <button
                    onClick={() => {
                        if (window.confirm("La sincronización completa consultará todo el histórico y puede demorar hasta 30 minutos.\n\n¿Deseas continuar?")) {
                            handleSync(false);
                        }
                    }}
                    disabled={syncing}
                    style={{
                        display: 'inline-flex', alignItems: 'center',
                        padding: '8px 12px', borderRadius: '10px',
                        background: '#F3F4F6', color: '#4B5563',
                        border: '1px solid #D1D5DB', fontSize: '0.75rem', fontWeight: 600,
                        cursor: syncing ? 'wait' : 'pointer',
                        transition: 'all 0.2s',
                    }}
                    onMouseOver={e => { if (!syncing) e.currentTarget.style.background = '#E5E7EB'; }}
                    onMouseOut={e => { e.currentTarget.style.background = '#F3F4F6'; }}
                    title="Sincroniza ABSOLUTAMENTE TODO el histórico desde 2025. Demora ~30 minutos."
                >
                    Full Sync
                </button>

                <div title="Sync Rápido: Últimos 30 días (Segundos)&#10;Full Sync: Histórico Completo (30 Minutos)" style={{ display: 'flex', alignItems: 'center', color: '#9CA3AF', cursor: 'help', padding: '0 2px' }}>
                    <HelpCircle size={15} />
                </div>

                {/* Badge Fecha y Hora de Última Actualización */}
                {showTimestamp && (
                    <div
                        title={`Última sincronización con SALUS: ${formattedSync || 'Consultando...'}${relTime ? ' (' + relTime + ')' : ''}\nHaz clic en 'Sync Rápido' para actualizar los datos.`}
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '6px',
                            padding: '6px 11px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            borderRadius: '8px',
                            fontSize: '0.74rem',
                            color: '#334155',
                            whiteSpace: 'nowrap',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                            userSelect: 'none',
                            lineHeight: 1.2,
                        }}
                    >
                        <Clock size={13} style={{ color: '#0284C7', flexShrink: 0 }} />
                        <span>
                            <span style={{ color: '#64748B', fontWeight: 500 }}>Actualizado: </span>
                            <strong style={{ color: '#0F172A', fontWeight: 700 }}>
                                {formattedSync || 'Consultando...'}
                            </strong>
                            {relTime && (
                                <span style={{ color: '#0284C7', marginLeft: '5px', fontSize: '0.7rem', fontWeight: 600 }}>
                                    ({relTime})
                                </span>
                            )}
                        </span>
                    </div>
                )}

                {results && (
                    <button
                        onClick={() => setExpanded(p => !p)}
                        style={{
                            display: 'inline-flex', alignItems: 'center',
                            padding: '8px 6px', borderRadius: '8px',
                            background: 'transparent', border: '1px solid #E5E7EB',
                            cursor: 'pointer', color: '#6B7280',
                        }}
                    >
                        {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                )}
            </div>

            {expanded && results && !results.error && (
                <div style={{
                    position: 'absolute', top: '100%', right: 0,
                    marginTop: '6px', zIndex: 1000,
                    background: '#fff', borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
                    padding: '12px', minWidth: '320px', maxWidth: '380px',
                    maxHeight: '420px', overflowY: 'auto',
                    display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        paddingBottom: '6px', borderBottom: '1px solid #F3F4F6',
                    }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
                            📡 Resultado Sincronización
                        </span>
                        {formattedSync && (
                            <span style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 600 }}>
                                {formattedSync}
                            </span>
                        )}
                    </div>
                    {Object.keys(SYNC_MODULES).map(renderModule)}
                </div>
            )}




        </div>
    );
}
