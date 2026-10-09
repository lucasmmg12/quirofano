/**
 * PrintConstanciaFichas.jsx — Plantilla de impresión A4 institucional para Entrega de Fichas de Admisión
 * Sistema ADM-QUI · Sanatorio Argentino
 * 
 * Estética institucional oficial:
 * - Azul Sanatorio (#0D3B66) con acentos cyan (#0284C7)
 * - Logo oficial con fallback vector / base64
 * - Info Card de metadatos clínicos/administrativos del lote
 * - Tabla estructurada con cabecera repetible y saltos de página fluidos
 * - Badges de Documentación Completa / Incompleta
 * - Bloque de Firmas digitales pre-cargadas / espacios para aclaración
 * - Paginación y pie de página legal institucional
 */
import React, { forwardRef } from 'react';
import { SANATORIO_LOGO_BASE64 } from '../utils/sanatorioLogoBase64';

const PrintConstanciaFichas = forwardRef(function PrintConstanciaFichas({ data }, ref) {
    if (!data || !data.items || data.items.length === 0) {
        return <div ref={ref} className="print-constancia-fichas" style={{ display: 'none' }} />;
    }

    const {
        codigo = 'ENT-FICHA-S/N',
        fecha = new Date(),
        responsableEntrega = 'Francisco',
        responsableRecibe = 'Administración',
        firmaEntrega = null,
        firmaRecibe = null,
        observaciones = '',
        items = []
    } = data;

    const fechaHora = new Date(fecha).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    // Ordenar alfabéticamente por paciente (A-Z) para coincidir con el archivador físico
    const sortedItems = [...items].sort((a, b) =>
        (a.paciente || '').localeCompare(b.paciente || '', 'es', { sensitivity: 'base' })
    );

    const completasCount = sortedItems.filter(i => {
        const est = (i.docEstado || i.estado_documentacion || i.ficha_doc_estado || '').toLowerCase();
        return est !== 'incompleta';
    }).length;
    const incompletasCount = sortedItems.length - completasCount;

    return (
        <div ref={ref} className="print-constancia-fichas">
            <style>{`
                @media screen {
                    .print-constancia-fichas {
                        display: none !important;
                    }
                }
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 10mm 10mm 14mm 10mm;
                    }
                    html, body {
                        background: #ffffff !important;
                        color: #0f172a !important;
                        height: auto !important;
                        overflow: visible !important;
                        margin: 0 !important;
                        padding: 0 !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    body * {
                        visibility: hidden !important;
                    }
                    .print-constancia-fichas,
                    .print-constancia-fichas * {
                        visibility: visible !important;
                        box-sizing: border-box !important;
                    }
                    .print-constancia-fichas {
                        display: block !important;
                        position: absolute !important;
                        top: 0 !important;
                        left: 0 !important;
                        width: 100% !important;
                        height: auto !important;
                        min-height: 100% !important;
                        overflow: visible !important;
                        background: #ffffff !important;
                        z-index: 9999999 !important;
                        font-family: 'Segoe UI', Arial, -apple-system, BlinkMacSystemFont, sans-serif !important;
                        font-size: 8.5pt !important;
                        color: #0f172a !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .print-constancia-table {
                        width: 100% !important;
                        border-collapse: collapse !important;
                        page-break-inside: auto !important;
                    }
                    .print-constancia-table thead {
                        display: table-header-group !important;
                    }
                    .print-constancia-table tbody tr {
                        page-break-inside: avoid !important;
                        page-break-after: auto !important;
                    }
                    .print-constancia-signatures {
                        page-break-inside: avoid !important;
                        margin-top: 16px !important;
                    }
                    .no-print {
                        display: none !important;
                    }
                }
            `}</style>

            {/* Encabezado Azul Institucional */}
            <div style={{
                background: '#0D3B66',
                color: '#ffffff',
                padding: '12px 16px',
                borderRadius: '6px 6px 0 0',
                borderBottom: '3px solid #0284C7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '12px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '44px',
                        height: '44px',
                        background: '#ffffff',
                        borderRadius: '50%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        overflow: 'hidden',
                        padding: '2px',
                        flexShrink: 0
                    }}>
                        <img
                            src="/logosanatorio.png"
                            alt="Sanatorio Argentino"
                            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                            onError={(e) => {
                                e.target.onerror = null;
                                e.target.src = SANATORIO_LOGO_BASE64;
                            }}
                        />
                    </div>
                    <div>
                        <div style={{ fontSize: '13pt', fontWeight: 900, letterSpacing: '-0.3px', color: '#ffffff' }}>
                            SANATORIO ARGENTINO
                        </div>
                        <div style={{ fontSize: '8pt', color: '#cbd5e1', fontWeight: 600 }}>
                            Mesa de Entradas · Recepción & Control de Admisiones
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#94a3b8' }}>
                            Transferencia Oficial de Documentación y Fichas Físicas
                        </div>
                    </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '11pt',
                        fontWeight: 900,
                        color: '#38bdf8',
                        letterSpacing: '0.4px'
                    }}>
                        CONSTANCIA DE ENTREGA
                    </div>
                    <div style={{ fontSize: '8pt', color: '#cbd5e1', fontWeight: 700 }}>
                        Circuito Administrativo ADM-QUI
                    </div>
                    <div style={{ fontSize: '8pt', color: '#ffffff', fontFamily: 'monospace', fontWeight: 800, marginTop: '2px' }}>
                        Ref: {codigo}
                    </div>
                </div>
            </div>

            {/* Info Box / Resumen del Lote */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(5, 1fr)',
                padding: '8px 12px',
                marginBottom: '12px',
                background: '#f8fafc',
                borderRadius: '6px',
                border: '1px solid #cbd5e1',
                gap: '8px'
            }}>
                <div>
                    <span style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Remito / Código</span>
                    <div style={{ fontSize: '9pt', fontWeight: 800, fontFamily: 'monospace', color: '#0d3b66' }}>{codigo || '—'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Fecha y Hora</span>
                    <div style={{ fontSize: '8.5pt', fontWeight: 700, color: '#0f172a' }}>{fechaHora}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Entrega (Recepción)</span>
                    <div style={{ fontSize: '8.5pt', fontWeight: 800, color: '#0284c7' }}>{responsableEntrega || 'Francisco'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Recibe (Administración)</span>
                    <div style={{ fontSize: '8.5pt', fontWeight: 800, color: '#0f172a' }}>{responsableRecibe || 'Administración'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 800, display: 'block' }}>Total Fichas</span>
                    <div style={{ fontSize: '9pt', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        {sortedItems.length} fichas
                        <span style={{
                            display: 'block', fontSize: '6.8pt', marginTop: '1px',
                            color: incompletasCount > 0 ? '#b45309' : '#16a34a', fontWeight: 800
                        }}>
                            {incompletasCount > 0 ? `(${incompletasCount} incompletas)` : '(100% completas)'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Tabla de Fichas de Admisión */}
            <table className="print-constancia-table" style={{
                width: '100%',
                borderCollapse: 'collapse',
                marginBottom: '14px',
                fontSize: '8pt',
                border: '1px solid #cbd5e1'
            }}>
                <thead>
                    <tr style={{ background: '#0D3B66', color: '#ffffff' }}>
                        <th style={{ padding: '6px 5px', textAlign: 'center', width: '22px', fontWeight: 800, border: '1px solid #0D3B66' }}>#</th>
                        <th style={{ padding: '6px 5px', textAlign: 'center', fontWeight: 800, width: '55px', border: '1px solid #0D3B66' }}>Ingreso</th>
                        <th style={{ padding: '6px 5px', textAlign: 'left', fontWeight: 800, width: '65px', border: '1px solid #0D3B66' }}>N° Adm.</th>
                        <th style={{ padding: '6px 5px', textAlign: 'left', fontWeight: 800, border: '1px solid #0D3B66' }}>Paciente</th>
                        <th style={{ padding: '6px 5px', textAlign: 'left', fontWeight: 800, width: '75px', border: '1px solid #0D3B66' }}>DNI / NHC</th>
                        <th style={{ padding: '6px 5px', textAlign: 'left', fontWeight: 800, border: '1px solid #0D3B66' }}>Obra Social / Prepaga</th>
                        <th style={{ padding: '6px 5px', textAlign: 'left', fontWeight: 800, border: '1px solid #0D3B66' }}>Especialidad</th>
                        <th style={{ padding: '6px 5px', textAlign: 'left', fontWeight: 800, width: '75px', border: '1px solid #0D3B66' }}>Recepcionó</th>
                        <th style={{ padding: '6px 5px', textAlign: 'center', fontWeight: 800, width: '85px', border: '1px solid #0D3B66' }}>Estado Docs</th>
                    </tr>
                </thead>
                <tbody>
                    {sortedItems.map((item, idx) => {
                        const isIncompleta = (item.docEstado || item.estado_documentacion || item.ficha_doc_estado) === 'incompleta';
                        const motivo = item.motivoIncompleta || item.motivo_incompleta || item.ficha_doc_incompleta_motivo || '';
                        
                        return (
                            <tr key={item.id || idx} style={{
                                background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                            }}>
                                <td style={{ padding: '4px 5px', textAlign: 'center', fontWeight: 700, color: '#64748b', border: '1px solid #e2e8f0' }}>
                                    {idx + 1}
                                </td>
                                <td style={{ padding: '4px 5px', textAlign: 'center', whiteSpace: 'nowrap', border: '1px solid #e2e8f0' }}>
                                    {item.fecha_ingreso ? new Date(item.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}
                                </td>
                                <td style={{ padding: '4px 5px', fontWeight: 800, fontFamily: 'monospace', color: '#0d3b66', border: '1px solid #e2e8f0' }}>
                                    {item.numero_admision || '—'}
                                </td>
                                <td style={{ padding: '4px 5px', fontWeight: 700, color: '#0f172a', border: '1px solid #e2e8f0' }}>
                                    {item.paciente}
                                </td>
                                <td style={{ padding: '4px 5px', fontFamily: 'monospace', fontSize: '7.5pt', border: '1px solid #e2e8f0' }}>
                                    {item.dni || item.id_paciente || '—'}
                                    {item.nhc && item.nhc !== '—' && <div style={{ color: '#64748b', fontSize: '7pt' }}>NHC: {item.nhc}</div>}
                                </td>
                                <td style={{ padding: '4px 5px', border: '1px solid #e2e8f0' }}>
                                    {item.cliente || 'Particular'}
                                </td>
                                <td style={{ padding: '4px 5px', border: '1px solid #e2e8f0', maxWidth: '110px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.especialidad || '—'}
                                </td>
                                <td style={{ padding: '4px 5px', color: '#475569', border: '1px solid #e2e8f0', fontSize: '7.5pt' }}>
                                    {item.responsableRecepcion || item.responsable_recepcion || item.operador || 'Recepción'}
                                </td>
                                <td style={{ padding: '4px 5px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                                    {isIncompleta ? (
                                        <div style={{
                                            background: '#fef3c7', color: '#92400e', padding: '2px 4px',
                                            borderRadius: '4px', fontSize: '6.8pt', fontWeight: 800, border: '1px solid #fde68a'
                                        }}>
                                            ⚠️ INCOMPLETA
                                            {motivo && <div style={{ fontWeight: 500, fontSize: '6pt', marginTop: '1px' }}>{motivo}</div>}
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: '#dcfce7', color: '#166534', padding: '2px 4px',
                                            borderRadius: '4px', fontSize: '6.8pt', fontWeight: 800, border: '1px solid #bbf7d0'
                                        }}>
                                            ✓ COMPLETA
                                        </div>
                                    )}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {/* Observaciones Generales */}
            {observaciones && observaciones.trim() && (
                <div style={{
                    padding: '8px 12px',
                    marginBottom: '14px',
                    background: '#fffbeb',
                    border: '1px solid #fde68a',
                    borderRadius: '6px',
                    fontSize: '8pt',
                    color: '#92400e',
                    pageBreakInside: 'avoid'
                }}>
                    <strong style={{ textTransform: 'uppercase', marginRight: '6px' }}>Observaciones generales:</strong>
                    <span>{observaciones}</span>
                </div>
            )}

            {/* Bloque de Firmas Institucionales */}
            <div className="print-constancia-signatures" style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '24px',
                marginTop: '16px',
                pageBreakInside: 'avoid'
            }}>
                {/* Firma Entrega */}
                <div style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    textAlign: 'center',
                    background: '#f8fafc'
                }}>
                    <div style={{
                        fontSize: '7pt',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: '#64748b',
                        letterSpacing: '0.5px',
                        marginBottom: '4px'
                    }}>
                        ENTREGADO POR (RECEPCIÓN / CADETERÍA)
                    </div>

                    <div style={{
                        height: '52px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '4px'
                    }}>
                        {firmaEntrega ? (
                            <img
                                src={firmaEntrega}
                                alt="Firma Entrega"
                                style={{ maxHeight: '48px', maxWidth: '80%', objectFit: 'contain' }}
                            />
                        ) : (
                            <div style={{ borderBottom: '1px dashed #94a3b8', width: '70%', height: '30px' }} />
                        )}
                    </div>

                    <div style={{ borderTop: '2px solid #0D3B66', paddingTop: '4px', width: '85%', margin: '0 auto' }}>
                        <div style={{ fontSize: '8.5pt', fontWeight: 800, color: '#0D3B66' }}>
                            {responsableEntrega || 'Francisco'}
                        </div>
                        <div style={{ fontSize: '7pt', color: '#64748b' }}>
                            Firma y Aclaración de quien entrega
                        </div>
                    </div>
                </div>

                {/* Firma Recibe */}
                <div style={{
                    border: '1px solid #cbd5e1',
                    borderRadius: '6px',
                    padding: '10px 14px',
                    textAlign: 'center',
                    background: '#f8fafc'
                }}>
                    <div style={{
                        fontSize: '7pt',
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        color: '#64748b',
                        letterSpacing: '0.5px',
                        marginBottom: '4px'
                    }}>
                        RECIBIDO POR (ADMINISTRACIÓN)
                    </div>

                    <div style={{
                        height: '52px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: '4px'
                    }}>
                        {firmaRecibe ? (
                            <img
                                src={firmaRecibe}
                                alt="Firma Recibe"
                                style={{ maxHeight: '48px', maxWidth: '80%', objectFit: 'contain' }}
                            />
                        ) : (
                            <div style={{ borderBottom: '1px dashed #94a3b8', width: '70%', height: '30px' }} />
                        )}
                    </div>

                    <div style={{ borderTop: '2px solid #0D3B66', paddingTop: '4px', width: '85%', margin: '0 auto' }}>
                        <div style={{ fontSize: '8.5pt', fontWeight: 800, color: '#0D3B66' }}>
                            {responsableRecibe || 'Administración'}
                        </div>
                        <div style={{ fontSize: '7pt', color: '#64748b' }}>
                            Firma y Aclaración de quien recibe
                        </div>
                    </div>
                </div>
            </div>

            {/* Pie de página institucional */}
            <div style={{
                marginTop: '16px',
                borderTop: '1px solid #cbd5e1',
                paddingTop: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '6.8pt',
                color: '#94a3b8',
                pageBreakInside: 'avoid'
            }}>
                <span>Sanatorio Argentino · Constancia Oficial de Transferencia de Admisiones Físicas</span>
                <span>Sistema ADM-QUI · Generado el {fechaHora}</span>
            </div>
        </div>
    );
});

export default PrintConstanciaFichas;
