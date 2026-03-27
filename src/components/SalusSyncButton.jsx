/**
 * SalusSyncButton.jsx — Botón de sincronización directa con SALUS
 * 
 * - Si el sync-server está corriendo: botón "Sync SALUS" que ejecuta la sincronización
 * - Si está offline: botón que descarga el launcher .bat para que el usuario lo ejecute
 */
import { useState, useEffect } from 'react';
import { Database, Check, AlertTriangle, Loader2, Download, ChevronDown, ChevronUp } from 'lucide-react';
import { checkSalusHealth } from '../services/salusSync';

const SYNC_MODULES = {
    cirugias: { label: 'Cirugías', icon: '🔪' },
    presupuestos: { label: 'Presupuestos', icon: '💰' },
    deudas: { label: 'Deudas', icon: '📊' },
};

export default function SalusSyncButton({ onComplete, addToast }) {
    const [salusAvailable, setSalusAvailable] = useState(null);
    const [syncing, setSyncing] = useState(false);
    const [results, setResults] = useState(null);
    const [expanded, setExpanded] = useState(false);
    const [lastSync, setLastSync] = useState(null);
    const [showDownloadHelp, setShowDownloadHelp] = useState(false);

    // Verificar disponibilidad cada 10s cuando está offline
    useEffect(() => {
        const check = () => checkSalusHealth().then(h => setSalusAvailable(h.available));
        check();
        const interval = setInterval(check, 10000);
        return () => clearInterval(interval);
    }, []);

    const handleSync = async () => {
        setSyncing(true);
        setExpanded(true);
        setResults(null);

        try {
            const SYNC_URL = import.meta.env.VITE_SALUS_SYNC_URL || '/api/salus';
            const res = await fetch(`${SYNC_URL}/sync-all`, { signal: AbortSignal.timeout(300000) });
            const json = await res.json();

            if (json.success) {
                setResults(json.results);
                setLastSync(new Date());
                addToast?.(`✅ Sincronización completada en ${json.elapsed}`, 'success');
                onComplete?.();
            } else {
                setResults({ error: json.error });
                addToast?.(`❌ Error: ${json.error}`, 'error');
            }
        } catch (err) {
            setResults({ error: err.message });
            addToast?.('❌ Error de conexión con sync-server', 'error');
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
        return (
            <div style={{ position: 'relative' }}>
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

                {showDownloadHelp && (
                    <div style={{
                        position: 'absolute', top: '100%', right: 0,
                        marginTop: '8px', zIndex: 1000,
                        background: '#fff', borderRadius: '12px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05)',
                        padding: '16px', width: '320px',
                    }}>
                        <button 
                            onClick={() => setShowDownloadHelp(false)}
                            style={{
                                position: 'absolute', top: '8px', right: '8px',
                                background: 'none', border: 'none', cursor: 'pointer',
                                color: '#9CA3AF', fontSize: '1.1rem', lineHeight: 1,
                            }}
                        >✕</button>
                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#1F2937', marginBottom: '10px' }}>
                            📋 Pasos para activar:
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#4B5563', lineHeight: 1.6 }}>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ background: '#6366F1', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>1</span>
                                <span>Ejecute el archivo <strong>.bat</strong> que se descargó</span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ background: '#6366F1', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>2</span>
                                <span>Espere a que diga <strong>"Servidor INICIADO"</strong></span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                                <span style={{ background: '#6366F1', color: '#fff', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.65rem', fontWeight: 700, flexShrink: 0 }}>3</span>
                                <span>Vuelva aquí — el botón se activará <strong>automáticamente</strong></span>
                            </div>
                        </div>
                        <div style={{
                            marginTop: '10px', padding: '8px 10px',
                            background: '#FEF3C7', borderRadius: '8px',
                            fontSize: '0.7rem', color: '#92400E',
                        }}>
                            ⚠️ No cierre la ventana negra mientras use el sistema.
                            Solo necesita hacer esto una vez por sesión.
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
        if (!r) return null;
        const isError = !!r.error;

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
                        {isError ? `❌ ${r.error}` : (
                            key === 'cirugias' ? `${r.total} registros → ${r.inserted} nuevos, ${r.updated} actualizados` :
                            key === 'presupuestos' ? `${r.total} filas → ${r.presupuestos} presupuestos, ${r.items} ítems` :
                            `${r.total} filas → ${r.pacientesNuevos} nuevos, ${r.pacientesActualizados} actualizados`
                        )}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div style={{ position: 'relative' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <button
                    onClick={handleSync}
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
                    title="Sincronizar datos desde SALUS (Cirugías + Presupuestos + Deudas)"
                >
                    {syncing ? (
                        <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} />
                    ) : (
                        <Database size={15} />
                    )}
                    {syncing ? 'Sincronizando...' : 'Sync SALUS'}
                </button>

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

            {lastSync && !expanded && (
                <div style={{ fontSize: '0.65rem', color: '#9CA3AF', marginTop: '4px', fontStyle: 'italic' }}>
                    Última sync: {lastSync.toLocaleTimeString('es-AR')}
                </div>
            )}

            {expanded && results && !results.error && (
                <div style={{
                    position: 'absolute', top: '100%', right: 0,
                    marginTop: '6px', zIndex: 1000,
                    background: '#fff', borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.12), 0 0 0 1px rgba(0,0,0,0.05)',
                    padding: '12px', minWidth: '320px',
                    display: 'flex', flexDirection: 'column', gap: '6px',
                }}>
                    <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        paddingBottom: '6px', borderBottom: '1px solid #F3F4F6',
                    }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#374151' }}>
                            📡 Resultado Sincronización
                        </span>
                        {lastSync && (
                            <span style={{ fontSize: '0.65rem', color: '#9CA3AF' }}>
                                {lastSync.toLocaleTimeString('es-AR')}
                            </span>
                        )}
                    </div>
                    {Object.keys(SYNC_MODULES).map(renderModule)}
                </div>
            )}
        </div>
    );
}
