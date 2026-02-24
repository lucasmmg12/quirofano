/**
 * PrintTemplateInternacion — Template de impresión para Módulo de Internación
 * A5, sin sello/firma, con fecha, contenido subido ~1cm
 * Renders one page per cart item with dynamic encabezado
 */
import { forwardRef } from 'react';

const PrintTemplateInternacion = forwardRef(({ patientData, items, singleItem }, ref) => {
    const fecha = new Date().toLocaleDateString('es-AR', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });

    const printList = singleItem ? [singleItem] : items;

    return (
        <div ref={ref} className="print-area">
            {printList.map((item, idx) => (
                <div className="print-page print-page--internacion" key={item.id || idx}>
                    {/* Header institucional dinámico */}
                    <div className="print-header-internacion">
                        <p className="print-encabezado-internacion">
                            {item.encabezado || item.displayName || item.name}
                        </p>
                    </div>

                    {/* Datos del paciente */}
                    <div className="print-fields">
                        <div className="print-field-row">
                            <span className="print-field-label">Paciente:</span>
                            <span className="print-field-value">{patientData.nombre || '—'}</span>
                        </div>
                        <div className="print-field-row">
                            <span className="print-field-label">Obra Social:</span>
                            <span className="print-field-value">{patientData.obraSocial || '—'}</span>
                        </div>
                        <div className="print-field-row">
                            <span className="print-field-label">N° Afiliado:</span>
                            <span className="print-field-value">{patientData.afiliado || '—'}</span>
                        </div>
                        <div className="print-field-row">
                            <span className="print-field-label">Diagnóstico:</span>
                            <span className="print-field-value">{patientData.diagnostico || '—'}</span>
                        </div>
                    </div>

                    {/* Código + Cantidad */}
                    <div className="print-fields" style={{ marginTop: '12px' }}>
                        <div className="print-field-row">
                            <span className="print-field-label">Cod.:</span>
                            <span className="print-field-value">
                                {item.code || '—'}{item.quantity > 1 ? ` x ${item.quantity}` : ''}
                            </span>
                        </div>
                    </div>

                    {/* Médico */}
                    <div className="print-fields" style={{ marginTop: '12px' }}>
                        <div className="print-field-row">
                            <span className="print-field-label">Médico tratante:</span>
                            <span className="print-field-value">{patientData.medico || '—'}</span>
                        </div>
                    </div>

                    {/* Fecha (sin firma/sello) */}
                    <div className="print-date-internacion">
                        <p>San Juan, {fecha}</p>
                    </div>
                </div>
            ))}
        </div>
    );
});

PrintTemplateInternacion.displayName = 'PrintTemplateInternacion';
export default PrintTemplateInternacion;
