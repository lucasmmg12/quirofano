import React, { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import {
    obtenerRecetaPorTokenOCuir,
    registrarDispensacionFarmacia,
    RENAPDIS_INSTITUTION_CONFIG,
} from '../../services/recetarioService';
import RecetaDocumentoOficial, { formatFechaAR } from './RecetaDocumentoOficial';
import {
    ShieldCheck,
    Printer,
    Download,
    CheckCircle2,
    Building2,
    Search,
    FileCode2,
    Share2,
    AlertCircle,
    Loader2,
    Lock,
    Check,
} from 'lucide-react';

export default function PublicRecetaPrestacionView() {
    const [searchParams] = useSearchParams();
    const params = useParams();
    const initialToken = searchParams.get('token') || searchParams.get('cuir') || params.token || '';

    const [queryToken, setQueryToken] = useState(initialToken);
    const [receta, setReceta] = useState(null);
    const [loading, setLoading] = useState(Boolean(initialToken));
    const [error, setError] = useState(null);
    const [showJsonModal, setShowJsonModal] = useState(false);
    const [showDispensaModal, setShowDispensaModal] = useState(false);
    const [farmaciaNombre, setFarmaciaNombre] = useState('');
    const [farmaceuticoMat, setFarmaceuticoMat] = useState('');
    const [dispensando, setDispensando] = useState(false);
    const [copied, setCopied] = useState(false);

    const cargarReceta = async (tok) => {
        if (!tok || !tok.trim()) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError(null);
        try {
            const data = await obtenerRecetaPorTokenOCuir(tok.trim());
            if (!data) {
                setError('No se encontró ninguna receta electrónica con ese Token, CUIR o Número de Orden.');
                setReceta(null);
            } else {
                setReceta(data);
            }
        } catch (err) {
            setError('Error al verificar la receta en el repositorio oficial: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (initialToken) {
            cargarReceta(initialToken);
        }
    }, [initialToken]);

    const handleDispensar = async (e) => {
        e.preventDefault();
        if (!receta || !farmaciaNombre.trim() || !farmaceuticoMat.trim()) return;
        setDispensando(true);
        try {
            const updated = await registrarDispensacionFarmacia(receta.token, {
                farmaciaNombre: farmaciaNombre.trim(),
                farmaceuticoMatricula: farmaceuticoMat.trim(),
            });
            setReceta(updated);
            setShowDispensaModal(false);
        } catch (err) {
            alert('Error al registrar dispensa: ' + err.message);
        } finally {
            setDispensando(false);
        }
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/prestacion?token=${receta?.token || queryToken}`;
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
    };

    return (
        <div style={{
            minHeight: '100vh',
            background: '#F1F5F9',
            fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
            color: '#0F172A',
            paddingBottom: '48px',
        }}>
            {/* Top Bar Oficial Sanatorio Argentino — Estilo Portal Prestación */}
            <header
                className="no-print"
                style={{
                    background: 'linear-gradient(135deg, #0F2942 0%, #1E4078 60%, #1565C0 100%)',
                    color: '#FFFFFF',
                    padding: '14px 24px',
                    boxShadow: '0 4px 16px rgba(15, 23, 42, 0.15)',
                    position: 'sticky',
                    top: 0,
                    zIndex: 50,
                }}
            >
                <div style={{
                    maxWidth: '960px',
                    margin: '0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img
                            src="/logosanatorio.png"
                            alt="Sanatorio Argentino"
                            style={{
                                width: '42px',
                                height: '42px',
                                borderRadius: '10px',
                                background: '#FFFFFF',
                                padding: '3px',
                                objectFit: 'contain',
                            }}
                        />
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <span style={{ fontWeight: 900, fontSize: '1.05rem', letterSpacing: '-0.01em' }}>
                                    SANATORIO ARGENTINO
                                </span>
                                <span style={{
                                    fontSize: '0.65rem',
                                    fontWeight: 800,
                                    padding: '2px 8px',
                                    borderRadius: '999px',
                                    background: 'rgba(16, 185, 129, 0.25)',
                                    border: '1px solid #34D399',
                                    color: '#A7F3D0',
                                }}>
                                    REPOSITORIO OFICIAL ReNaPDiS
                                </span>
                            </div>
                            <div style={{ fontSize: '0.73rem', color: '#CBD5E1' }}>
                                Portal Público de Receta Electrónica y Validación Farmacéutica — Res. MSAL N° 1959/2024
                            </div>
                        </div>
                    </div>

                    {receta && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <button
                                onClick={handleCopyLink}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 13px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: '#FFFFFF',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                            >
                                {copied ? <Check size={14} /> : <Share2 size={14} />}
                                {copied ? 'Link Copiado' : 'Copiar Link'}
                            </button>

                            <button
                                onClick={() => setShowJsonModal(true)}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 13px',
                                    borderRadius: '8px',
                                    border: '1px solid rgba(255,255,255,0.25)',
                                    background: 'rgba(255,255,255,0.1)',
                                    color: '#FFFFFF',
                                    fontSize: '0.76rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                }}
                                title="Ver esquema JSON no FHIR de Datos Mínimos (Res. 1959/2024)"
                            >
                                <FileCode2 size={14} />
                                Esquema JSON MSAL
                            </button>

                            <button
                                onClick={() => window.print()}
                                style={{
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    border: 'none',
                                    background: '#FFFFFF',
                                    color: '#1E4078',
                                    fontSize: '0.78rem',
                                    fontWeight: 800,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
                                }}
                            >
                                <Printer size={15} />
                                Descargar PDF / Imprimir
                            </button>
                        </div>
                    )}
                </div>
            </header>

            {/* Buscador por Token / CUIR / Orden para Farmacias */}
            <div className="no-print" style={{ maxWidth: '820px', margin: '20px auto 0', padding: '0 16px' }}>
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        cargarReceta(queryToken);
                    }}
                    style={{
                        background: '#FFFFFF',
                        borderRadius: '12px',
                        padding: '12px 16px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 2px 6px rgba(15, 23, 42, 0.04)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '10px',
                        flexWrap: 'wrap',
                    }}
                >
                    <Search size={18} color="#64748B" />
                    <input
                        type="text"
                        value={queryToken}
                        onChange={(e) => setQueryToken(e.target.value)}
                        placeholder="Ingrese Token de validación, CUIR (AR-RNPD-...) o N° de Orden (ej. 2630708731551)..."
                        style={{
                            flex: '1 1 260px',
                            border: 'none',
                            outline: 'none',
                            fontSize: '0.84rem',
                            color: '#0F172A',
                            fontFamily: 'monospace',
                        }}
                    />
                    <button
                        type="submit"
                        style={{
                            padding: '8px 16px',
                            borderRadius: '8px',
                            border: 'none',
                            background: '#1E4078',
                            color: '#FFFFFF',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                        }}
                    >
                        Verificar Receta
                    </button>
                </form>
            </div>

            {/* Contenido Principal */}
            <div style={{ maxWidth: '852px', margin: '18px auto 0', padding: '0 16px' }}>
                {loading ? (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '60px 24px',
                        textAlign: 'center',
                        border: '1px solid #E2E8F0',
                    }}>
                        <Loader2 size={36} color="#1E4078" style={{ animation: 'spin 1s linear infinite', margin: '0 auto 12px' }} />
                        <div style={{ fontWeight: 800, fontSize: '1rem', color: '#1E4078' }}>
                            Verificando firma digital y vigencia en el Repositorio Oficial...
                        </div>
                        <div style={{ fontSize: '0.8rem', color: '#64748B', marginTop: '4px' }}>
                            Sanatorio Argentino • Registro Nacional de Plataformas Digitales Sanitarias (ReNaPDiS)
                        </div>
                    </div>
                ) : error ? (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        padding: '40px 24px',
                        textAlign: 'center',
                        border: '1px solid #FECACA',
                    }}>
                        <AlertCircle size={40} color="#DC2626" style={{ margin: '0 auto 10px' }} />
                        <div style={{ fontWeight: 800, fontSize: '1.05rem', color: '#991B1B' }}>
                            Receta no encontrada o token inválido
                        </div>
                        <div style={{ fontSize: '0.84rem', color: '#64748B', marginTop: '6px' }}>{error}</div>
                    </div>
                ) : receta ? (
                    <>
                        {/* Barra de Estado de Validación Farmacéutica (No sale en impresión) */}
                        <div
                            className="no-print"
                            style={{
                                marginBottom: '16px',
                                background: receta.estado === 'DISPENSADA' ? '#EFF6FF' : '#ECFDF5',
                                border: `1.5px solid ${receta.estado === 'DISPENSADA' ? '#93C5FD' : '#6EE7B7'}`,
                                borderRadius: '12px',
                                padding: '14px 18px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                flexWrap: 'wrap',
                                gap: '12px',
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '40px',
                                    height: '40px',
                                    borderRadius: '10px',
                                    background: receta.estado === 'DISPENSADA' ? '#DBEAFE' : '#D1FAE5',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: receta.estado === 'DISPENSADA' ? '#1D4ED8' : '#059669',
                                }}>
                                    {receta.estado === 'DISPENSADA' ? <CheckCircle2 size={22} /> : <ShieldCheck size={22} />}
                                </div>
                                <div>
                                    <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                        {receta.estado === 'DISPENSADA'
                                            ? `Receta ya dispensada en ${receta.farmacia_dispensadora || 'Farmacia adherida'}`
                                            : 'Receta Electrónica Auténtica y Habilitada para Dispensa en Farmacia'}
                                    </div>
                                    <div style={{ fontSize: '0.74rem', color: '#475569' }}>
                                        {receta.estado === 'DISPENSADA'
                                            ? `Dispensada el ${formatFechaAR(receta.fecha_dispensacion, true)} • Mat. Farmacéutico: ${receta.farmaceutico_matricula || '—'}`
                                            : `Orden N° ${receta.nro_receta} • CUIR ${receta.cuir} • Vigente hasta el ${formatFechaAR(receta.fecha_vencimiento)}`}
                                    </div>
                                </div>
                            </div>

                            {receta.estado === 'VIGENTE' && (
                                <button
                                    onClick={() => setShowDispensaModal(true)}
                                    style={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        gap: '7px',
                                        padding: '9px 16px',
                                        borderRadius: '9px',
                                        border: 'none',
                                        background: '#059669',
                                        color: '#FFFFFF',
                                        fontSize: '0.78rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                        boxShadow: '0 2px 8px rgba(5, 150, 105, 0.25)',
                                    }}
                                >
                                    <Building2 size={15} />
                                    Uso Exclusivo Farmacia: Marcar Dispensada
                                </button>
                            )}
                        </div>

                        {/* Documento Oficial de la Receta */}
                        <RecetaDocumentoOficial receta={receta} />
                    </>
                ) : null}
            </div>

            {/* Modal de Dispensa Farmacéutica */}
            {showDispensaModal && (
                <div
                    className="no-print"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.65)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 100,
                        padding: '16px',
                    }}
                >
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        maxWidth: '440px',
                        width: '100%',
                        padding: '24px',
                        boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
                    }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#1E4078' }}>
                            Registrar Dispensación en Farmacia
                        </h3>
                        <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: '#475569' }}>
                            Conforme a la Res. 1959/2024 (ReNaPDiS), una vez dispensada la receta quedará bloqueada para evitar su reutilización.
                        </p>

                        <form onSubmit={handleDispensar} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Nombre de la Farmacia Habilitada *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: Farmacia San Juan / Farmacia del Pueblo"
                                    value={farmaciaNombre}
                                    onChange={(e) => setFarmaciaNombre(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.84rem',
                                    }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                                    Matrícula del Director Técnico / Farmacéutico *
                                </label>
                                <input
                                    type="text"
                                    required
                                    placeholder="Ej: MP Farm. 1045"
                                    value={farmaceuticoMat}
                                    onChange={(e) => setFarmaceuticoMat(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '9px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.84rem',
                                    }}
                                />
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    onClick={() => setShowDispensaModal(false)}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        background: '#FFFFFF',
                                        fontSize: '0.8rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={dispensando}
                                    style={{
                                        padding: '9px 16px',
                                        borderRadius: '8px',
                                        border: 'none',
                                        background: '#059669',
                                        color: '#FFFFFF',
                                        fontSize: '0.8rem',
                                        fontWeight: 800,
                                        cursor: 'pointer',
                                    }}
                                >
                                    {dispensando ? 'Registrando...' : 'Confirmar Dispensa'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Modal Esquema JSON no FHIR (Res. 1959/2024) */}
            {showJsonModal && receta && (
                <div
                    className="no-print"
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(15, 23, 42, 0.7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 100,
                        padding: '16px',
                    }}
                >
                    <div style={{
                        background: '#0F172A',
                        color: '#F8FAFC',
                        borderRadius: '16px',
                        maxWidth: '680px',
                        width: '100%',
                        maxHeight: '85vh',
                        display: 'flex',
                        flexDirection: 'column',
                        overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '16px 20px',
                            borderBottom: '1px solid #334155',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                        }}>
                            <div>
                                <div style={{ fontWeight: 800, fontSize: '0.92rem', color: '#38BDF8' }}>
                                    Esquema Oficial de Interoperabilidad — Estándar "JSON no FHIR" (Res. 1959/2024 Pág. 9)
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                    Contiene los 18 campos mínimos obligatorios requeridos por ReNaPDiS / Ministerio de Salud
                                </div>
                            </div>
                            <button
                                onClick={() => setShowJsonModal(false)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '6px',
                                    border: '1px solid #475569',
                                    background: '#1E293B',
                                    color: '#FFFFFF',
                                    fontSize: '0.75rem',
                                    cursor: 'pointer',
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                        <pre style={{
                            margin: 0,
                            padding: '18px 20px',
                            overflow: 'auto',
                            fontSize: '0.74rem',
                            lineHeight: 1.45,
                            color: '#A7F3D0',
                            fontFamily: "'Fira Code', 'Courier New', monospace",
                        }}>
                            {JSON.stringify(receta.esquema_json_minimo, null, 2)}
                        </pre>
                    </div>
                </div>
            )}
        </div>
    );
}

