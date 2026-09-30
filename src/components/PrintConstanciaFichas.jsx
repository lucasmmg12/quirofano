/**
 * PrintConstanciaFichas.jsx — Plantilla de impresión A4 institucional para Entrega de Fichas de Admisión
 * 
 * Estética idéntica a Asociaciones / Garantías con logo oficial,
 * resumen de lote, detalle de admisiones, estado documental y firmas digitales.
 */
import React, { forwardRef } from 'react';

const PrintConstanciaFichas = forwardRef(function PrintConstanciaFichas({ data }, ref) {
    if (!data || !data.items || data.items.length === 0) {
        return <div ref={ref} />;
    }

    const {
        codigo,
        fecha,
        responsableEntrega,
        responsableRecibe,
        firmaEntrega,
        firmaRecibe,
        observaciones,
        items = []
    } = data;

    const fechaHora = new Date(fecha || new Date()).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const completasCount = items.filter(i => (i.docEstado || i.estado_documentacion || i.ficha_doc_estado) !== 'incompleta').length;
    const incompletasCount = items.length - completasCount;

    return (
        <div ref={ref} className="print-constancia-fichas" style={{ display: 'none' }}>
            <style>{`
                @media print {
                    @page {
                        size: A4 portrait;
                        margin: 10mm;
                    }
                    body {
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-constancia-fichas {
                        display: block !important;
                        position: fixed;
                        top: 0; left: 0;
                        width: 100%;
                        height: 100%;
                        background: #fff;
                        z-index: 9999999;
                        font-family: 'Segoe UI', Arial, -apple-system, sans-serif;
                        font-size: 10pt;
                        color: #0f172a;
                        padding: 12mm 10mm;
                        box-sizing: border-box;
                    }
                    .print-constancia-fichas * {
                        box-sizing: border-box;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Header Institucional */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '3px solid #0f172a', paddingBottom: '12px', marginBottom: '14px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{ width: '48px', height: '48px', objectFit: 'contain' }}
                        onError={(e) => { e.target.style.display = 'none'; }}
                    />
                    <div>
                        <div style={{ fontSize: '13pt', fontWeight: 900, letterSpacing: '-0.3px', color: '#0f172a' }}>
                            SANATORIO ARGENTINO
                        </div>
                        <div style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 600 }}>
                            Recepción · Mesa de Entradas & Administración
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '11pt', fontWeight: 900,
                        color: '#0284c7', letterSpacing: '0.3px',
                    }}>
                        CONSTANCIA DE ENTREGA DE FICHAS
                    </div>
                    <div style={{ fontSize: '8.5pt', color: '#64748b', fontWeight: 700 }}>
                        Control de Admisiones y Documentación
                    </div>
                </div>
            </div>

            {/* Info Box */}
            <div style={{
                display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)',
                padding: '8px 12px', marginBottom: '14px',
                background: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0',
                gap: '8px'
            }}>
                <div>
                    <span style={{ fontSize: '7.5pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Remito / Código</span>
                    <div style={{ fontSize: '9.5pt', fontWeight: 800, fontFamily: 'monospace', color: '#0f172a' }}>{codigo || '—'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7.5pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Fecha y Hora</span>
                    <div style={{ fontSize: '9pt', fontWeight: 700, color: '#0f172a' }}>{fechaHora}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7.5pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Entrega (Recepción)</span>
                    <div style={{ fontSize: '9pt', fontWeight: 800, color: '#0284c7' }}>{responsableEntrega || 'Francisco'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7.5pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Recibe (Administración)</span>
                    <div style={{ fontSize: '9pt', fontWeight: 800, color: '#0f172a' }}>{responsableRecibe || 'Administración'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '7.5pt', color: '#64748b', textTransform: 'uppercase', fontWeight: 700 }}>Total Fichas</span>
                    <div style={{ fontSize: '9.5pt', fontWeight: 800, color: '#0f172a' }}>
                        {items.length} {incompletasCount > 0 ? (
                            <span style={{ fontSize: '7.5pt', color: '#d97706', fontWeight: 700 }}>({incompletasCount} inc.)</span>
                        ) : (
                            <span style={{ fontSize: '7.5pt', color: '#16a34a', fontWeight: 700 }}>(100% comp.)</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabla de Fichas */}
            <table style={{
                width: '100%', borderCollapse: 'collapse', marginBottom: '14px',
                fontSize: '8.5pt', border: '1px solid #cbd5e1'
            }}>
                <thead>
                    <tr style={{ background: '#0f172a', color: '#ffffff' }}>
                        <th style={{ padding: '5px 6px', textAlign: 'center', width: '24px', fontWeight: 700 }}>#</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700, width: '65px' }}>Ingreso</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700, width: '65px' }}>N° Adm.</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700 }}>Paciente</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700, width: '70px' }}>DNI / NHC</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700 }}>Obra Social / Prepaga</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700 }}>Especialidad</th>
                        <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: 700 }}>Recepcionó</th>
                        <th style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, width: '90px' }}>Estado Docs</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => {
                        const isIncompleta = (item.docEstado || item.estado_documentacion || item.ficha_doc_estado) === 'incompleta';
                        const motivo = item.motivoIncompleta || item.motivo_incompleta || item.ficha_doc_incompleta_motivo || '';
                        
                        return (
                            <tr key={item.id || idx} style={{
                                background: idx % 2 === 0 ? '#ffffff' : '#f8fafc',
                                borderBottom: '1px solid #e2e8f0',
                            }}>
                                <td style={{ padding: '4px 6px', textAlign: 'center', fontWeight: 700, color: '#64748b' }}>
                                    {idx + 1}
                                </td>
                                <td style={{ padding: '4px 6px', whiteSpace: 'nowrap' }}>
                                    {item.fecha_ingreso ? new Date(item.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}
                                </td>
                                <td style={{ padding: '4px 6px', fontWeight: 700, fontFamily: 'monospace' }}>
                                    {item.numero_admision || '—'}
                                </td>
                                <td style={{ padding: '4px 6px', fontWeight: 700, color: '#0f172a' }}>
                                    {item.paciente}
                                </td>
                                <td style={{ padding: '4px 6px', fontFamily: 'monospace', fontSize: '8pt' }}>
                                    {item.dni || item.id_paciente || '—'}
                                    {item.nhc && item.nhc !== '—' && <span style={{ color: '#64748b' }}> ({item.nhc})</span>}
                                </td>
                                <td style={{ padding: '4px 6px' }}>
                                    {item.cliente || 'Particular'}
                                </td>
                                <td style={{ padding: '4px 6px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {item.especialidad || '—'}
                                </td>
                                <td style={{ padding: '4px 6px', color: '#475569' }}>
                                    {item.responsableRecepcion || item.responsable_recepcion || item.operador || 'Recepción'}
                                </td>
                                <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                                    {isIncompleta ? (
                                        <div style={{
                                            background: '#fef3c7', color: '#92400e', padding: '2px 5px',
                                            borderRadius: '4px', fontSize: '7pt', fontWeight: 800, border: '1px solid #fde68a'
                                        }}>
                                            ⚠️ INCOMPLETA
                                            {motivo && <div style={{ fontWeight: 500, fontSize: '6.5pt' }}>{motivo}</div>}
                                        </div>
                                    ) : (
                                        <div style={{
                                            background: '#dcfce7', color: '#166534', padding: '2px 5px',
                                            borderRadius: '4px', fontSize: '7pt', fontWeight: 800, border: '1px solid #bbf7d0'
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

            {/* Observaciones si las hay */}
            {observaciones && (
                <div style={{
                    padding: '6px 10px', marginBottom: '14px',
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px',
                    fontSize: '8.5pt', color: '#92400e'
                }}>
                    <strong>Observaciones generales:</strong> {observaciones}
                </div>
            )}

            {/* Bloque de Firmas Digitales */}
            <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px',
                marginTop: '16px', pageBreakInside: 'avoid'
            }}>
                {/* Firma Entrega */}
                <div style={{
                    border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px',
                    textAlign: 'center', background: '#f8fafc'
                }}>
                    <div style={{
                        fontSize: '7.5pt', fontWeight: 800, textTransform: 'uppercase',
                        color: '#64748b', letterSpacing: '0.5px', marginBottom: '6px'
                    }}>
                        ENTREGADO POR (RECEPCIÓN / CADETERÍA)
                    </div>

                    <div style={{
                        height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '4px'
                    }}>
                        {firmaEntrega ? (
                            <img
                                src={firmaEntrega}
                                alt="Firma Entrega"
                                style={{ maxHeight: '55px', maxWidth: '85%', objectFit: 'contain' }}
                            />
                        ) : (
                            <div style={{ borderBottom: '1px dashed #94a3b8', width: '70%', height: '35px' }} />
                        )}
                    </div>

                    <div style={{ borderTop: '2px solid #0f172a', paddingTop: '4px', width: '85%', margin: '0 auto' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 800, color: '#0f172a' }}>
                            {responsableEntrega || 'Francisco'}
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b' }}>
                            Firma y Aclaración de quien entrega
                        </div>
                    </div>
                </div>

                {/* Firma Recibe */}
                <div style={{
                    border: '1px solid #cbd5e1', borderRadius: '6px', padding: '10px 14px',
                    textAlign: 'center', background: '#f8fafc'
                }}>
                    <div style={{
                        fontSize: '7.5pt', fontWeight: 800, textTransform: 'uppercase',
                        color: '#64748b', letterSpacing: '0.5px', marginBottom: '6px'
                    }}>
                        RECIBIDO POR (ADMINISTRACIÓN)
                    </div>

                    <div style={{
                        height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        marginBottom: '4px'
                    }}>
                        {firmaRecibe ? (
                            <img
                                src={firmaRecibe}
                                alt="Firma Recibe"
                                style={{ maxHeight: '55px', maxWidth: '85%', objectFit: 'contain' }}
                            />
                        ) : (
                            <div style={{ borderBottom: '1px dashed #94a3b8', width: '70%', height: '35px' }} />
                        )}
                    </div>

                    <div style={{ borderTop: '2px solid #0f172a', paddingTop: '4px', width: '85%', margin: '0 auto' }}>
                        <div style={{ fontSize: '9pt', fontWeight: 800, color: '#0f172a' }}>
                            {responsableRecibe || 'Administración'}
                        </div>
                        <div style={{ fontSize: '7.5pt', color: '#64748b' }}>
                            Firma y Aclaración de quien recibe
                        </div>
                    </div>
                </div>
            </div>

            {/* Pie de página institucional */}
            <div style={{
                position: 'fixed', bottom: '10mm', left: '10mm', right: '10mm',
                borderTop: '1px solid #e2e8f0', paddingTop: '6px',
                display: 'flex', justifyContent: 'space-between', fontSize: '7pt', color: '#94a3b8'
            }}>
                <span>Sanatorio Argentino · Constancia Oficial de Transferencia de Admisiones Físicas</span>
                <span>Documento generado por Plataforma Integral de Sanatorio Argentino</span>
            </div>
        </div>
    );
});

export default PrintConstanciaFichas;
