/**
 * PrintGarantias.jsx — Plantilla de impresión A4 para Rendición de Garantías
 * Mismo estilo estético que PrintConstanciaEntrega
 */
import React, { forwardRef } from 'react';

const PrintGarantias = forwardRef(function PrintGarantias({ data }, ref) {
    if (!data || !data.garantias || data.garantias.length === 0) {
        return null;
    }

    const { garantias, codigo, fecha, entrega, recibe, notas } = data;

    const fechaHora = new Date(fecha || new Date()).toLocaleString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const PrintCopy = ({ isAdministration }) => (
        <div style={{
            padding: '20mm 15mm 15mm 15mm',
            fontFamily: "'Segoe UI', Arial, sans-serif",
            fontSize: '11pt',
            color: '#1a1a1a',
            boxSizing: 'border-box'
        }}>
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
                            {isAdministration ? 'Administración' : 'Recepción'}
                        </div>
                    </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{
                        fontSize: '12pt', fontWeight: 800,
                        color: '#1a1a1a', letterSpacing: '0.5px',
                    }}>
                        RENDICIÓN DE GARANTÍAS
                    </div>
                    <div style={{ fontSize: '9pt', color: '#666' }}>
                        Copia: {isAdministration ? 'ADMINISTRACIÓN' : 'RECEPCIÓN'}
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
                    <div style={{ fontSize: '13pt', fontWeight: 800, fontFamily: 'monospace' }}>{codigo || '-'}</div>
                </div>
                <div>
                    <span style={{ fontSize: '9pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fecha y Hora</span>
                    <div style={{ fontSize: '11pt', fontWeight: 600 }}>{fechaHora}</div>
                </div>
                <div>
                    <span style={{ fontSize: '9pt', color: '#888', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Garantías</span>
                    <div style={{ fontSize: '13pt', fontWeight: 800 }}>{garantias.length}</div>
                </div>
            </div>

            {/* Table */}
            <table style={{
                width: '100%', borderCollapse: 'collapse', marginBottom: '24px',
                border: '1px solid #ddd'
            }}>
                <thead>
                    <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ccc' }}>
                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '9pt', textTransform: 'uppercase', color: '#555', borderRight: '1px solid #ddd' }}>Fecha Ingreso</th>
                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '9pt', textTransform: 'uppercase', color: '#555', borderRight: '1px solid #ddd' }}>Paciente</th>
                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '9pt', textTransform: 'uppercase', color: '#555', borderRight: '1px solid #ddd' }}>ID / DNI</th>
                        <th style={{ padding: '8px', textAlign: 'left', fontSize: '9pt', textTransform: 'uppercase', color: '#555' }}>Especialidad</th>
                    </tr>
                </thead>
                <tbody>
                    {garantias.map((g, index) => (
                        <tr key={index} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px', fontSize: '10pt', borderRight: '1px solid #ddd' }}>
                                {g.fecha_ingreso ? new Date(g.fecha_ingreso + 'T12:00:00').toLocaleDateString('es-AR') : '-'}
                            </td>
                            <td style={{ padding: '8px', fontSize: '10pt', fontWeight: 600, borderRight: '1px solid #ddd' }}>
                                {g.paciente || g.nombre}
                            </td>
                            <td style={{ padding: '8px', fontSize: '10pt', borderRight: '1px solid #ddd' }}>
                                {g.id_paciente || g.dni || '-'}
                            </td>
                            <td style={{ padding: '8px', fontSize: '10pt', color: '#444' }}>
                                {g.especialidad || g.obra_social || '-'}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {notas && (
                <div style={{ marginBottom: '24px', fontSize: '10pt', color: '#444' }}>
                    <strong>Observaciones: </strong> {notas}
                </div>
            )}

            {/* Firmas */}
            <div style={{ display: 'flex', gap: '30px', marginTop: '40px' }}>
                <div style={{ flex: 1, border: '1px dashed #ccc', padding: '15px', borderRadius: '8px', background: '#fafafa', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid #1a1a1a', height: '40px', marginBottom: '8px', width: '80%', margin: '0 auto 8px auto' }}></div>
                    <div style={{ fontSize: '11pt', fontWeight: 700 }}>Firma de quien ENTREGA</div>
                    <div style={{ fontSize: '9pt', color: '#666', marginTop: '2px' }}>Sector Recepción</div>
                    {entrega && (
                        <div style={{ fontSize: '10pt', color: '#2563eb', marginTop: '6px', fontWeight: 600 }}>
                            {entrega}
                        </div>
                    )}
                </div>
                <div style={{ flex: 1, border: '1px dashed #ccc', padding: '15px', borderRadius: '8px', background: '#fafafa', textAlign: 'center' }}>
                    <div style={{ borderBottom: '1px solid #1a1a1a', height: '40px', marginBottom: '8px', width: '80%', margin: '0 auto 8px auto' }}></div>
                    <div style={{ fontSize: '11pt', fontWeight: 700 }}>Firma de quien RECIBE</div>
                    <div style={{ fontSize: '9pt', color: '#666', marginTop: '2px' }}>Sector Administración</div>
                    {recibe && (
                        <div style={{ fontSize: '10pt', color: '#2563eb', marginTop: '6px', fontWeight: 600 }}>
                            {recibe}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return (
        <div ref={ref} className="print-garantias" style={{ display: 'none' }}>
            <style>{`
                @media print {
                    .print-garantias {
                        display: block !important;
                        position: fixed;
                        top: 0; left: 0;
                        width: 100%;
                        height: 100%;
                        background: #fff;
                        z-index: 999999;
                    }
                    .print-garantias * {
                        box-sizing: border-box;
                    }
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* 1ra Copia: Recepción */}
            <PrintCopy isAdministration={false} />

            <div style={{ pageBreakAfter: 'always', margin: '20px 0', borderTop: '2px dashed #ccc' }}></div>

            {/* 2da Copia: Administración */}
            <PrintCopy isAdministration={true} />
        </div>
    );
});

export default PrintGarantias;
