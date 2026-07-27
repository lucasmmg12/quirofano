import React from 'react';
const PrintGarantias = React.forwardRef(({ items, rendicionInfo }, ref) => {
    if (!items || items.length === 0) return null;

    const PrintCopy = ({ isAdministration }) => (
        <div style={{ padding: '40px', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            {/* Encabezado Institucional */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '2px solid #000', paddingBottom: '10px', marginBottom: '20px' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800 }}>SANATORIO ARGENTINO</h1>
                    <p style={{ margin: '4px 0 0', fontSize: '14px', color: '#444' }}>
                        Hoja de Rendición de Garantías / Compromisos de Pago
                    </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: '12px', color: '#666' }}>Copia para:</div>
                    <div style={{ fontSize: '16px', fontWeight: 700, textTransform: 'uppercase' }}>
                        {isAdministration ? 'ADMINISTRACIÓN' : 'RECEPCIÓN'}
                    </div>
                </div>
            </div>

            {/* Info de Rendición */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px', fontSize: '14px' }}>
                <div>
                    <strong>Código de Rendición:</strong> {rendicionInfo?.codigo || 'Pendiente'}<br />
                    <strong>Fecha y Hora de Emisión:</strong> {new Date().toLocaleString('es-AR')}<br />
                </div>
                <div style={{ textAlign: 'right' }}>
                    <strong>Cantidad de Garantías:</strong> {items.length}<br />
                </div>
            </div>

            {/* Tabla de Garantías */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '40px', fontSize: '13px' }}>
                <thead>
                    <tr style={{ backgroundColor: '#f3f4f6' }}>
                        <th style={{ border: '1px solid #d1d5db', padding: '8px', textAlign: 'left' }}>Fecha Internación</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '8px', textAlign: 'left' }}>Paciente</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '8px', textAlign: 'left' }}>DNI</th>
                        <th style={{ border: '1px solid #d1d5db', padding: '8px', textAlign: 'left' }}>Obra Social</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item, i) => (
                        <tr key={i}>
                            <td style={{ border: '1px solid #d1d5db', padding: '8px' }}>
                                {item.fecha_cirugia ? new Date(item.fecha_cirugia + 'T12:00:00').toLocaleDateString('es-AR') : '—'}
                            </td>
                            <td style={{ border: '1px solid #d1d5db', padding: '8px', fontWeight: 600 }}>{item.nombre}</td>
                            <td style={{ border: '1px solid #d1d5db', padding: '8px' }}>{item.dni || '—'}</td>
                            <td style={{ border: '1px solid #d1d5db', padding: '8px' }}>{item.obra_social || '—'}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Cuadro de Firmas */}
            <div style={{ marginTop: '50px' }}>
                <h3 style={{ fontSize: '14px', marginBottom: '30px', borderBottom: '1px solid #e5e7eb', paddingBottom: '8px' }}>Constancia de Traslado Físico</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '40px' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #000', marginBottom: '8px', height: '40px' }}></div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Firma de quien ENTREGA</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Sector Recepción</div>
                        {rendicionInfo?.responsable_entrega && (
                            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '4px' }}>
                                (Firma digital registrada: {rendicionInfo.responsable_entrega})
                            </div>
                        )}
                    </div>
                    
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #000', marginBottom: '8px', height: '40px' }}></div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Firma de quien RECIBE</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>Sector Administración</div>
                    </div>
                    
                    <div style={{ flex: 1, textAlign: 'center' }}>
                        <div style={{ borderBottom: '1px solid #000', marginBottom: '8px', height: '40px' }}></div>
                        <div style={{ fontSize: '12px', fontWeight: 600 }}>Fecha de Recepción</div>
                        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>DD/MM/AAAA</div>
                    </div>
                </div>
            </div>
        </div>
    );

    return (
        <div ref={ref} style={{ display: 'none', '@media print': { display: 'block' } }} className="print-only">
            {/* 1ra Copia: Recepción */}
            <PrintCopy isAdministration={false} />
            
            {/* Salto de página para la segunda copia si es muy larga, o simplemente en la misma hoja si cabe */}
            <div style={{ pageBreakAfter: 'always', margin: '40px 0', borderTop: '2px dashed #ccc' }}></div>
            
            {/* 2da Copia: Administración */}
            <PrintCopy isAdministration={true} />
        </div>
    );
});

export default PrintGarantias;
