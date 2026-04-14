/**
 * PrintConstanciaEntrega.jsx — Plantilla de impresión A4
 *
 * Documento de constancia de entrega de documentación quirúrgica
 * con firma pre-cargada del responsable y espacio para el cadete.
 */
import { forwardRef } from 'react';

const PrintConstanciaEntrega = forwardRef(function PrintConstanciaEntrega({ constancia, items = [] }, ref) {
    if (!constancia) return null;

    const fechaHora = new Date(constancia.fecha_entrega).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    return (
        <div ref={ref} className="print-constancia" style={{ display: 'none' }}>
            <style>{`
                @media print {
                    .print-constancia {
                        display: block !important;
                        position: fixed;
                        top: 0; left: 0;
                        width: 100%;
                        height: 100%;
                        background: #fff;
                        z-index: 999999;
                        font-family: 'Segoe UI', Arial, sans-serif;
                        font-size: 11pt;
                        color: #1a1a1a;
                        padding: 20mm 15mm 15mm 15mm;
                        box-sizing: border-box;
                    }
                    .print-constancia * {
                        box-sizing: border-box;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                borderBottom: '3px solid #1a1a1a', paddingBottom: '12px', marginBottom: '20px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <img
                        src="/logosanatorio.png"
                        alt="Sanatorio Argentino"
                        style={{ width: '50px', height: '50px', objectFit: 'contain' }}
                    />
                    <div>
                        <div style={{ fontSize: '14pt', fontWeight: 800, letterSpacing: '-0.5px' }}>
                            SANATORIO ARGENTINO
                        </div>
                        <div style={{ fontSize: '9pt', color: '#666', letterSpacing: '0.5px' }}>
                            Administración
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '12pt', fontWeight: 800,
                        color: '#1a1a1a', letterSpacing: '0.5px',
                    }}>
                        CONSTANCIA DE ENTREGA
                    </div>
                    <div style={{ fontSize: '9pt', color: '#666' }}>
                        Documentación Quirúrgica
                    </div>
                </div>
            </div>

            {/* Info Row */}
            <div style={{
                display: 'flex', justifyContent: 'space-between',
                padding: '10px 14px', marginBottom: '16px',
                background: '#f5f5f5', borderRadius: '6px', border: '1px solid #ddd',
            }}>
                <div>
                    <span style={{ fontSize: '9pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Código</span>
                    <div style={{ fontSize: '13pt', fontWeight: 800, fontFamily: 'monospace' }}>{constancia.codigo}</div>
                </div>
                <div>
                    <span style={{ fontSize: '9pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fecha y Hora</span>
                    <div style={{ fontSize: '11pt', fontWeight: 600 }}>{fechaHora}</div>
                </div>
                <div>
                    <span style={{ fontSize: '9pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Asociación</span>
                    <div style={{ fontSize: '11pt', fontWeight: 700 }}>{constancia.asociacion}</div>
                </div>
                <div>
                    <span style={{ fontSize: '9pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Expedientes</span>
                    <div style={{ fontSize: '13pt', fontWeight: 800 }}>{items.length}</div>
                </div>
            </div>

            {/* Table */}
            <table style={{
                width: '100%', borderCollapse: 'collapse', marginBottom: '16px',
                fontSize: '9.5pt',
            }}>
                <thead>
                    <tr style={{ background: '#1a1a1a', color: '#fff' }}>
                        <th style={{ padding: '6px 8px', textAlign: 'center', width: '30px', fontWeight: 700 }}>#</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Fecha</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Paciente</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>DNI</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Obra Social</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Cirugía</th>
                        <th style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 700 }}>Cirujano</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, idx) => (
                        <tr key={item.id} style={{
                            background: idx % 2 === 0 ? '#fff' : '#fafafa',
                            borderBottom: '1px solid #e5e5e5',
                        }}>
                            <td style={{ padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#888' }}>{idx + 1}</td>
                            <td style={{ padding: '5px 8px', whiteSpace: 'nowrap' }}>
                                {item.fecha_realizacion ? new Date(item.fecha_realizacion + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'}
                            </td>
                            <td style={{ padding: '5px 8px', fontWeight: 600 }}>{item.nombre_paciente}</td>
                            <td style={{ padding: '5px 8px', fontFamily: 'monospace' }}>{item.dni || '—'}</td>
                            <td style={{ padding: '5px 8px' }}>{item.cliente || '—'}</td>
                            <td style={{ padding: '5px 8px', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.nombre_cirugia || '—'}
                            </td>
                            <td style={{ padding: '5px 8px' }}>{item.cirujano || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Notas */}
            {constancia.notas && (
                <div style={{
                    padding: '8px 12px', marginBottom: '16px',
                    background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '4px',
                    fontSize: '9.5pt',
                }}>
                    <strong>Observaciones:</strong> {constancia.notas}
                </div>
            )}

            {/* Signatures */}
            <div style={{
                display: 'flex', justifyContent: 'space-between', gap: '40px',
                marginTop: '40px', paddingTop: '0',
            }}>
                {/* Firma Entrega */}
                <div style={{
                    flex: 1, textAlign: 'center', padding: '16px',
                    border: '1px solid #ccc', borderRadius: '8px',
                }}>
                    <div style={{
                        fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '1px', color: '#888', marginBottom: '40px',
                    }}>
                        ENTREGA
                    </div>
                    <div style={{
                        borderTop: '2px solid #1a1a1a', width: '70%', margin: '0 auto',
                        paddingTop: '8px',
                    }}>
                        <div style={{ fontSize: '11pt', fontWeight: 700 }}>{constancia.responsable_entrega}</div>
                        <div style={{ fontSize: '9pt', color: '#666' }}>Sanatorio Argentino — Administración</div>
                    </div>
                </div>

                {/* Firma Recibe */}
                <div style={{
                    flex: 1, textAlign: 'center', padding: '16px',
                    border: '1px solid #ccc', borderRadius: '8px',
                }}>
                    <div style={{
                        fontSize: '8pt', fontWeight: 700, textTransform: 'uppercase',
                        letterSpacing: '1px', color: '#888', marginBottom: '40px',
                    }}>
                        RECIBE
                    </div>
                    <div style={{
                        borderTop: '2px solid #1a1a1a', width: '70%', margin: '0 auto',
                        paddingTop: '8px',
                    }}>
                        <div style={{ fontSize: '11pt', fontWeight: 700 }}>
                            {constancia.nombre_cadete || '________________________'}
                        </div>
                        <div style={{ fontSize: '9pt', color: '#666' }}>{constancia.asociacion}</div>
                    </div>
                </div>
            </div>

            {/* Footer */}
            <div style={{
                position: 'absolute', bottom: '15mm', left: '15mm', right: '15mm',
                textAlign: 'center', paddingTop: '10px',
                borderTop: '1px solid #e5e5e5',
                fontSize: '8pt', color: '#aaa',
            }}>
                Esta constancia acredita la entrega de la documentación quirúrgica detallada.
                Conserve este documento como comprobante. • Sistema ADM-QUI — Sanatorio Argentino
            </div>
        </div>
    );
});

export default PrintConstanciaEntrega;
