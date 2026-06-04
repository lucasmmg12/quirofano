/**
 * DocumentosPanel.jsx — Repositorio centralizado de documentos
 * Upload, visualización, descarga y gestión de archivos multiformat
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
    FolderOpen, Upload, Search, Filter, Download, Trash2, Eye,
    FileText, Image, FileSpreadsheet, Presentation, File, X,
    Plus, Clock, HardDrive, User, ChevronDown, Loader2, AlertCircle,
    CheckCircle,
} from 'lucide-react';
import {
    uploadDocumento, fetchDocumentos, deleteDocumento,
    getDocumentoPublicUrl, getCategorias, ACCEPT_STRING, MAX_FILE_SIZE,
} from '../services/documentosService';

// ═══════ FILE TYPE HELPERS ═══════

function getFileIcon(mimeType, fileName) {
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';

    if (mimeType?.startsWith('image/')) return { icon: Image, color: '#8B5CF6', bg: '#F5F3FF', label: 'Imagen' };
    if (mimeType === 'application/pdf') return { icon: FileText, color: '#EF4444', bg: '#FEF2F2', label: 'PDF' };
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ext === 'xlsx' || ext === 'xls')
        return { icon: FileSpreadsheet, color: '#10B981', bg: '#ECFDF5', label: 'Excel' };
    if (mimeType?.includes('word') || ext === 'doc' || ext === 'docx')
        return { icon: FileText, color: '#3B82F6', bg: '#EFF6FF', label: 'Word' };
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint') || ext === 'pptx' || ext === 'ppt')
        return { icon: Presentation, color: '#F59E0B', bg: '#FFFBEB', label: 'PowerPoint' };

    return { icon: File, color: '#6B7280', bg: '#F3F4F6', label: 'Archivo' };
}

function formatFileSize(bytes) {
    if (!bytes) return '0 B';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTimeAgo(dateStr) {
    if (!dateStr) return '';
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Hace instantes';
    if (mins < 60) return `Hace ${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `Hace ${hrs}h`;
    const days = Math.floor(hrs / 24);
    if (days < 30) return `Hace ${days}d`;
    return new Date(dateStr).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function formatFullDate(dateStr) {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });
}

function isOfficeDoc(mimeType, fileName) {
    const ext = fileName?.split('.').pop()?.toLowerCase() || '';
    if (mimeType?.includes('word') || ext === 'doc' || ext === 'docx') return true;
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel') || ext === 'xlsx' || ext === 'xls') return true;
    if (mimeType?.includes('presentation') || mimeType?.includes('powerpoint') || ext === 'pptx' || ext === 'ppt') return true;
    return false;
}

function getOfficeViewerUrl(publicUrl) {
    return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(publicUrl)}`;
}

// ═══════ MAIN COMPONENT ═══════

export default function DocumentosPanel({ addToast, currentUser }) {
    const [documentos, setDocumentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [categoriaFilter, setCategoriaFilter] = useState('');
    const [categorias, setCategorias] = useState([]);
    const [showUploadModal, setShowUploadModal] = useState(false);
    const [previewDoc, setPreviewDoc] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Stats
    const totalDocs = documentos.length;
    const totalSize = documentos.reduce((sum, d) => sum + (d.size_bytes || 0), 0);
    const lastUploaded = documentos.length > 0 ? documentos[0] : null;

    // ─── Load Data ───
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [docs, cats] = await Promise.all([
                fetchDocumentos({ search, categoria: categoriaFilter }),
                getCategorias(),
            ]);
            setDocumentos(docs);
            setCategorias(cats);
        } catch (e) {
            console.error('[DocumentosPanel] Error:', e);
            addToast?.('Error al cargar documentos', 'error');
        } finally {
            setLoading(false);
        }
    }, [search, categoriaFilter, addToast]);

    useEffect(() => { loadData(); }, [loadData]);

    // ─── Delete Handler ───
    const handleDelete = useCallback(async (doc) => {
        try {
            await deleteDocumento(doc.id, doc.nombre_storage);
            addToast?.('Documento eliminado', 'success');
            setDeleteConfirm(null);
            loadData();
        } catch (e) {
            addToast?.('Error al eliminar: ' + e.message, 'error');
        }
    }, [addToast, loadData]);

    // ─── View / Download ───
    const handleView = useCallback((doc) => {
        const url = getDocumentoPublicUrl(doc.nombre_storage);
        if (doc.mime_type?.startsWith('image/') || doc.mime_type === 'application/pdf') {
            setPreviewDoc({ ...doc, url, viewerUrl: null });
        } else if (isOfficeDoc(doc.mime_type, doc.nombre_original)) {
            setPreviewDoc({ ...doc, url, viewerUrl: getOfficeViewerUrl(url) });
        } else {
            window.open(url, '_blank');
        }
    }, []);

    const handleDownload = useCallback((doc) => {
        const url = getDocumentoPublicUrl(doc.nombre_storage);
        const a = document.createElement('a');
        a.href = url;
        a.download = doc.nombre_original;
        a.target = '_blank';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }, []);

    return (
        <div className="content no-print view-transition-enter" style={{ maxWidth: '1200px', margin: '0 auto' }}>

            {/* ═══════ HEADER STATS ═══════ */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '16px',
                marginBottom: '20px',
            }}>
                {/* Total Documentos */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', padding: '20px',
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: '#EEF2FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <FolderOpen size={18} style={{ color: '#6366F1' }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-500)' }}>Total Documentos</span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-800)', letterSpacing: '-0.02em' }}>
                        {totalDocs}
                    </div>
                </div>

                {/* Espacio utilizado */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', padding: '20px',
                    boxShadow: 'var(--shadow-sm)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <HardDrive size={18} style={{ color: '#10B981' }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-500)' }}>Espacio Utilizado</span>
                    </div>
                    <div style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--neutral-800)', letterSpacing: '-0.02em' }}>
                        {formatFileSize(totalSize)}
                    </div>
                </div>

                {/* Último documento subido */}
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '16px',
                    border: '1px solid var(--neutral-200)', padding: '20px',
                    boxShadow: 'var(--shadow-sm)', gridColumn: 'span 2',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: '#FFFBEB', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Clock size={18} style={{ color: '#F59E0B' }} />
                        </div>
                        <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-500)' }}>Última Subida</span>
                    </div>
                    {lastUploaded ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lastUploaded.nombre_original}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: 'var(--neutral-500)', fontWeight: 500, flexShrink: 0 }}>
                                {formatFullDate(lastUploaded.created_at)} por {lastUploaded.subido_por}
                            </span>
                        </div>
                    ) : (
                        <span style={{ fontSize: '0.85rem', color: 'var(--neutral-400)' }}>Sin documentos aún</span>
                    )}
                </div>
            </div>

            {/* ═══════ TOOLBAR ═══════ */}
            <div style={{
                display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap',
            }}>
                {/* Search */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px',
                    padding: '8px 14px', borderRadius: '10px',
                    border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                    flex: '1 1 240px', minWidth: '200px',
                }}>
                    <Search size={16} style={{ color: 'var(--neutral-400)', flexShrink: 0 }} />
                    <input
                        type="text"
                        placeholder="Buscar documentos..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{
                            border: 'none', outline: 'none', background: 'transparent',
                            fontSize: '0.82rem', color: 'var(--neutral-700)', width: '100%',
                            fontFamily: 'inherit',
                        }}
                    />
                    {search && (
                        <button onClick={() => setSearch('')} style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--neutral-400)', display: 'flex', padding: 0,
                        }}>
                            <X size={14} />
                        </button>
                    )}
                </div>

                {/* Category filter */}
                <div style={{ position: 'relative' }}>
                    <select
                        value={categoriaFilter}
                        onChange={e => setCategoriaFilter(e.target.value)}
                        style={{
                            padding: '8px 32px 8px 14px', borderRadius: '10px',
                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                            fontSize: '0.82rem', color: 'var(--neutral-600)', fontWeight: 500,
                            cursor: 'pointer', appearance: 'none', fontFamily: 'inherit',
                            minWidth: '160px',
                        }}
                    >
                        <option value="">Todas las categorías</option>
                        {categorias.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                        ))}
                    </select>
                    <ChevronDown size={14} style={{
                        position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                        color: 'var(--neutral-400)', pointerEvents: 'none',
                    }} />
                </div>

                {/* Upload button */}
                <button
                    onClick={() => setShowUploadModal(true)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '9px 20px', borderRadius: '10px',
                        background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        border: 'none', color: '#fff', fontSize: '0.82rem', fontWeight: 700,
                        cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: '0 2px 8px rgba(99, 102, 241, 0.3)',
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform = 'translateY(-1px)'; e.currentTarget.style.boxShadow = '0 4px 16px rgba(99, 102, 241, 0.4)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.3)'; }}
                >
                    <Upload size={16} />
                    Subir Documento
                </button>
            </div>

            {/* ═══════ DOCUMENTS GRID ═══════ */}
            {loading ? (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px',
                }}>
                    {Array.from({ length: 6 }).map((_, i) => (
                        <div key={i} style={{
                            background: 'var(--neutral-0)', borderRadius: '14px',
                            border: '1px solid var(--neutral-200)', padding: '20px',
                            height: '140px', animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                    ))}
                </div>
            ) : documentos.length === 0 ? (
                <div style={{
                    background: 'var(--neutral-0)', borderRadius: '20px',
                    border: '1px solid var(--neutral-200)', padding: '60px 40px',
                    textAlign: 'center', boxShadow: 'var(--shadow-sm)',
                }}>
                    <FolderOpen size={56} strokeWidth={1.2} style={{ color: 'var(--neutral-300)', marginBottom: '16px' }} />
                    <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--neutral-600)', margin: '0 0 8px' }}>
                        {search || categoriaFilter ? 'Sin resultados' : 'Repositorio vacío'}
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--neutral-400)', margin: '0 0 20px', maxWidth: '400px', marginInline: 'auto' }}>
                        {search || categoriaFilter
                            ? 'No se encontraron documentos con los filtros aplicados.'
                            : 'Subí tu primer documento para comenzar a centralizar la documentación del Sanatorio.'}
                    </p>
                    {!search && !categoriaFilter && (
                        <button
                            onClick={() => setShowUploadModal(true)}
                            style={{
                                display: 'inline-flex', alignItems: 'center', gap: '8px',
                                padding: '10px 24px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                                border: 'none', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            <Upload size={16} />
                            Subir primer documento
                        </button>
                    )}
                </div>
            ) : (
                <div style={{
                    display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '14px',
                }}>
                    {documentos.map(doc => {
                        const ft = getFileIcon(doc.mime_type, doc.nombre_original);
                        const IconComp = ft.icon;
                        return (
                            <div
                                key={doc.id}
                                style={{
                                    background: 'var(--neutral-0)', borderRadius: '14px',
                                    border: '1px solid var(--neutral-200)', padding: '18px',
                                    transition: 'all 0.2s', cursor: 'default',
                                    boxShadow: 'var(--shadow-sm)',
                                }}
                                onMouseOver={e => { e.currentTarget.style.borderColor = ft.color + '60'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                                onMouseOut={e => { e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; e.currentTarget.style.transform = 'translateY(0)'; }}
                            >
                                {/* Top row: icon + type badge */}
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                                    <div style={{
                                        width: '42px', height: '42px', borderRadius: '12px',
                                        background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    }}>
                                        <IconComp size={20} style={{ color: ft.color }} />
                                    </div>
                                    <span style={{
                                        padding: '3px 10px', borderRadius: '8px', fontSize: '0.68rem',
                                        fontWeight: 700, background: ft.bg, color: ft.color,
                                        textTransform: 'uppercase', letterSpacing: '0.03em',
                                    }}>
                                        {ft.label}
                                    </span>
                                </div>

                                {/* Filename */}
                                <div style={{
                                    fontSize: '0.85rem', fontWeight: 700, color: 'var(--neutral-800)',
                                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                    marginBottom: '4px',
                                }} title={doc.nombre_original}>
                                    {doc.nombre_original}
                                </div>

                                {/* Category + description */}
                                {doc.descripcion && (
                                    <div style={{
                                        fontSize: '0.75rem', color: 'var(--neutral-500)',
                                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                        marginBottom: '4px',
                                    }} title={doc.descripcion}>
                                        {doc.descripcion}
                                    </div>
                                )}

                                {/* Metadata row */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                                    fontSize: '0.72rem', color: 'var(--neutral-400)', marginBottom: '14px', marginTop: '6px',
                                }}>
                                    <span style={{
                                        padding: '2px 8px', borderRadius: '6px',
                                        background: 'var(--neutral-50)', color: 'var(--neutral-500)',
                                        fontWeight: 600,
                                    }}>
                                        {doc.categoria}
                                    </span>
                                    <span>·</span>
                                    <span>{formatFileSize(doc.size_bytes)}</span>
                                    <span>·</span>
                                    <span title={formatFullDate(doc.created_at)}>{formatTimeAgo(doc.created_at)}</span>
                                </div>

                                {/* Subido por */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                    fontSize: '0.72rem', color: 'var(--neutral-400)', marginBottom: '14px',
                                }}>
                                    <User size={12} />
                                    <span>Subido por <strong style={{ color: 'var(--neutral-600)' }}>{doc.subido_por}</strong></span>
                                </div>

                                {/* Action buttons */}
                                <div style={{ display: 'flex', gap: '6px' }}>
                                    <button
                                        onClick={() => handleView(doc)}
                                        title="Visualizar"
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                            padding: '7px 0', borderRadius: '8px',
                                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                            fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-600)',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.background = '#EEF2FF'; e.currentTarget.style.borderColor = '#A5B4FC'; e.currentTarget.style.color = '#4F46E5'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = 'var(--neutral-0)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.color = 'var(--neutral-600)'; }}
                                    >
                                        <Eye size={14} /> Ver
                                    </button>
                                    <button
                                        onClick={() => handleDownload(doc)}
                                        title="Descargar"
                                        style={{
                                            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                                            padding: '7px 0', borderRadius: '8px',
                                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                            fontSize: '0.75rem', fontWeight: 600, color: 'var(--neutral-600)',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.background = '#ECFDF5'; e.currentTarget.style.borderColor = '#6EE7B7'; e.currentTarget.style.color = '#059669'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = 'var(--neutral-0)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.color = 'var(--neutral-600)'; }}
                                    >
                                        <Download size={14} /> Bajar
                                    </button>
                                    <button
                                        onClick={() => setDeleteConfirm(doc)}
                                        title="Eliminar"
                                        style={{
                                            width: '36px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            padding: '7px 0', borderRadius: '8px',
                                            border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                            fontSize: '0.75rem', color: 'var(--neutral-400)',
                                            cursor: 'pointer', transition: 'all 0.15s',
                                        }}
                                        onMouseOver={e => { e.currentTarget.style.background = '#FEF2F2'; e.currentTarget.style.borderColor = '#FCA5A5'; e.currentTarget.style.color = '#DC2626'; }}
                                        onMouseOut={e => { e.currentTarget.style.background = 'var(--neutral-0)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; e.currentTarget.style.color = 'var(--neutral-400)'; }}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ═══════ UPLOAD MODAL ═══════ */}
            {showUploadModal && (
                <UploadModal
                    onClose={() => setShowUploadModal(false)}
                    onUploaded={() => { setShowUploadModal(false); loadData(); }}
                    addToast={addToast}
                    currentUser={currentUser}
                    existingCategorias={categorias}
                />
            )}

            {/* ═══════ PREVIEW MODAL ═══════ */}
            {previewDoc && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        padding: '40px', animation: 'fadeIn 0.2s ease',
                    }}
                    onClick={() => setPreviewDoc(null)}
                >
                    <div
                        style={{
                            background: 'var(--neutral-0)', borderRadius: '20px',
                            width: '90vw', maxWidth: '900px', height: '85vh',
                            display: 'flex', flexDirection: 'column', overflow: 'hidden',
                            boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Preview header */}
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '16px 20px', borderBottom: '1px solid var(--neutral-200)',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                <Eye size={18} style={{ color: 'var(--primary-500)', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {previewDoc.nombre_original}
                                </span>
                            </div>
                            <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                                <button
                                    onClick={() => handleDownload(previewDoc)}
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '6px 14px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                        fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-600)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Download size={14} /> Descargar
                                </button>
                                <button
                                    onClick={() => setPreviewDoc(null)}
                                    style={{
                                        width: '32px', height: '32px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', color: 'var(--neutral-500)',
                                    }}
                                >
                                    <X size={16} />
                                </button>
                            </div>
                        </div>

                        {/* Preview content */}
                        <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC' }}>
                            {previewDoc.viewerUrl ? (
                                <iframe
                                    src={previewDoc.viewerUrl}
                                    title={previewDoc.nombre_original}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                />
                            ) : previewDoc.mime_type?.startsWith('image/') ? (
                                <img
                                    src={previewDoc.url}
                                    alt={previewDoc.nombre_original}
                                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', padding: '20px' }}
                                />
                            ) : previewDoc.mime_type === 'application/pdf' ? (
                                <iframe
                                    src={previewDoc.url}
                                    title={previewDoc.nombre_original}
                                    style={{ width: '100%', height: '100%', border: 'none' }}
                                />
                            ) : null}
                        </div>
                    </div>
                </div>
            )}

            {/* ═══════ DELETE CONFIRMATION ═══════ */}
            {deleteConfirm && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 9999,
                        background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        animation: 'fadeIn 0.15s ease',
                    }}
                    onClick={() => setDeleteConfirm(null)}
                >
                    <div
                        style={{
                            background: 'var(--neutral-0)', borderRadius: '16px',
                            padding: '28px', width: '400px', maxWidth: '90vw',
                            boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                            <div style={{
                                width: '36px', height: '36px', borderRadius: '10px',
                                background: '#FEF2F2', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            }}>
                                <AlertCircle size={18} style={{ color: '#EF4444' }} />
                            </div>
                            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--neutral-800)' }}>Eliminar documento</span>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--neutral-600)', margin: '0 0 20px', lineHeight: 1.5 }}>
                            ¿Estás seguro de eliminar <strong>{deleteConfirm.nombre_original}</strong>? Esta acción no se puede deshacer.
                        </p>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px',
                                    border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                    fontSize: '0.82rem', fontWeight: 600, color: 'var(--neutral-600)',
                                    cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={() => handleDelete(deleteConfirm)}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px',
                                    border: 'none', background: '#EF4444',
                                    fontSize: '0.82rem', fontWeight: 700, color: '#fff',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                }}
                                onMouseOver={e => e.currentTarget.style.background = '#DC2626'}
                                onMouseOut={e => e.currentTarget.style.background = '#EF4444'}
                            >
                                Sí, eliminar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


// ═══════ UPLOAD MODAL COMPONENT ═══════

function UploadModal({ onClose, onUploaded, addToast, currentUser, existingCategorias }) {
    const fileInputRef = useRef(null);
    const [dragOver, setDragOver] = useState(false);
    const [selectedFile, setSelectedFile] = useState(null);
    const [categoria, setCategoria] = useState('General');
    const [newCategoria, setNewCategoria] = useState('');
    const [showNewCat, setShowNewCat] = useState(false);
    const [descripcion, setDescripcion] = useState('');
    const [uploading, setUploading] = useState(false);

    const handleFiles = useCallback((files) => {
        if (files.length === 0) return;
        const file = files[0];

        if (file.size > MAX_FILE_SIZE) {
            addToast?.(`Archivo demasiado grande (${(file.size / 1024 / 1024).toFixed(1)}MB). Máx: 50MB`, 'error');
            return;
        }

        setSelectedFile(file);
    }, [addToast]);

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
    }, [handleFiles]);

    const handleUpload = useCallback(async () => {
        if (!selectedFile) return;
        setUploading(true);

        const finalCategoria = showNewCat && newCategoria.trim()
            ? newCategoria.trim()
            : categoria;

        try {
            await uploadDocumento(
                selectedFile,
                finalCategoria,
                descripcion,
                currentUser?.nombre || currentUser?.usuario || 'usuario'
            );
            addToast?.(`"${selectedFile.name}" subido correctamente`, 'success');
            onUploaded();
        } catch (e) {
            addToast?.('Error: ' + e.message, 'error');
        } finally {
            setUploading(false);
        }
    }, [selectedFile, categoria, newCategoria, showNewCat, descripcion, currentUser, addToast, onUploaded]);

    const ft = selectedFile ? getFileIcon(selectedFile.type, selectedFile.name) : null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 9999,
                background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '40px', animation: 'fadeIn 0.2s ease',
            }}
            onClick={onClose}
        >
            <div
                style={{
                    background: 'var(--neutral-0)', borderRadius: '20px',
                    padding: '0', width: '520px', maxWidth: '95vw',
                    boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
                    overflow: 'hidden',
                }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '20px 24px', borderBottom: '1px solid var(--neutral-100)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Upload size={18} style={{ color: '#fff' }} />
                        </div>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--neutral-800)' }}>Subir Documento</span>
                    </div>
                    <button onClick={onClose} style={{
                        width: '32px', height: '32px', borderRadius: '8px',
                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', color: 'var(--neutral-400)',
                    }}>
                        <X size={16} />
                    </button>
                </div>

                <div style={{ padding: '24px' }}>
                    {/* Drop Zone */}
                    <div
                        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={handleDrop}
                        onClick={() => fileInputRef.current?.click()}
                        style={{
                            border: `2px dashed ${dragOver ? '#6366F1' : selectedFile ? '#10B981' : 'var(--neutral-300)'}`,
                            borderRadius: '14px', padding: '32px 20px', textAlign: 'center',
                            cursor: 'pointer', transition: 'all 0.2s',
                            background: dragOver ? '#EEF2FF' : selectedFile ? '#F0FDF4' : 'var(--neutral-50)',
                            marginBottom: '20px',
                        }}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept={ACCEPT_STRING}
                            style={{ display: 'none' }}
                            onChange={e => handleFiles(e.target.files)}
                        />

                        {selectedFile ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', justifyContent: 'center' }}>
                                <div style={{
                                    width: '48px', height: '48px', borderRadius: '12px',
                                    background: ft.bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <ft.icon size={24} style={{ color: ft.color }} />
                                </div>
                                <div style={{ textAlign: 'left' }}>
                                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-800)' }}>
                                        {selectedFile.name}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--neutral-500)' }}>
                                        {formatFileSize(selectedFile.size)} · {ft.label}
                                    </div>
                                </div>
                                <button
                                    onClick={e => { e.stopPropagation(); setSelectedFile(null); }}
                                    style={{
                                        width: '28px', height: '28px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', color: 'var(--neutral-400)',
                                    }}
                                >
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <>
                                <Upload size={32} style={{ color: dragOver ? '#6366F1' : 'var(--neutral-400)', marginBottom: '10px' }} />
                                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--neutral-700)' }}>
                                    Arrastrá un archivo aquí
                                </div>
                                <div style={{ fontSize: '0.78rem', color: 'var(--neutral-400)', marginTop: '4px' }}>
                                    o hacé click para seleccionar · JPG, PNG, PDF, Excel, Word, PPT · Máx 50MB
                                </div>
                            </>
                        )}
                    </div>

                    {/* Categoría */}
                    <div style={{ marginBottom: '14px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '6px' }}>
                            Categoría
                        </label>
                        {showNewCat ? (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="Nombre de nueva categoría..."
                                    value={newCategoria}
                                    onChange={e => setNewCategoria(e.target.value)}
                                    autoFocus
                                    style={{
                                        flex: 1, padding: '8px 14px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', fontSize: '0.82rem',
                                        fontFamily: 'inherit', color: 'var(--neutral-700)',
                                        outline: 'none',
                                    }}
                                    onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                                    onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                                />
                                <button
                                    onClick={() => { setShowNewCat(false); setNewCategoria(''); }}
                                    style={{
                                        padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                        fontSize: '0.78rem', color: 'var(--neutral-500)', cursor: 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <select
                                    value={categoria}
                                    onChange={e => setCategoria(e.target.value)}
                                    style={{
                                        flex: 1, padding: '8px 14px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', fontSize: '0.82rem',
                                        fontFamily: 'inherit', color: 'var(--neutral-600)',
                                        cursor: 'pointer', background: 'var(--neutral-0)',
                                    }}
                                >
                                    <option value="General">General</option>
                                    {existingCategorias.filter(c => c !== 'General').map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                </select>
                                <button
                                    onClick={() => setShowNewCat(true)}
                                    title="Nueva categoría"
                                    style={{
                                        display: 'flex', alignItems: 'center', gap: '5px',
                                        padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid var(--neutral-200)', background: 'var(--neutral-0)',
                                        fontSize: '0.78rem', fontWeight: 600, color: 'var(--neutral-500)',
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Plus size={14} /> Nueva
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Descripción */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--neutral-600)', marginBottom: '6px' }}>
                            Descripción <span style={{ fontWeight: 400, color: 'var(--neutral-400)' }}>(opcional)</span>
                        </label>
                        <textarea
                            placeholder="Breve descripción del documento..."
                            value={descripcion}
                            onChange={e => setDescripcion(e.target.value)}
                            rows={2}
                            style={{
                                width: '100%', padding: '8px 14px', borderRadius: '8px',
                                border: '1px solid var(--neutral-200)', fontSize: '0.82rem',
                                fontFamily: 'inherit', color: 'var(--neutral-700)',
                                resize: 'vertical', outline: 'none',
                                boxSizing: 'border-box',
                            }}
                            onFocus={e => e.currentTarget.style.borderColor = '#6366F1'}
                            onBlur={e => e.currentTarget.style.borderColor = 'var(--neutral-200)'}
                        />
                    </div>

                    {/* Submit */}
                    <button
                        onClick={handleUpload}
                        disabled={!selectedFile || uploading}
                        style={{
                            width: '100%', padding: '12px', borderRadius: '10px',
                            border: 'none',
                            background: !selectedFile ? 'var(--neutral-200)' : 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            color: !selectedFile ? 'var(--neutral-400)' : '#fff',
                            fontSize: '0.88rem', fontWeight: 700,
                            cursor: !selectedFile ? 'not-allowed' : 'pointer',
                            transition: 'all 0.2s',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        }}
                    >
                        {uploading ? (
                            <>
                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                Subiendo...
                            </>
                        ) : (
                            <>
                                <Upload size={16} />
                                Subir documento
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
