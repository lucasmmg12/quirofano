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

                    {/* Datos del paciente (arriba del título) */}
                    <div className="print-patient-internacion">
                        <p className="print-patient-internacion__name">
                            {patientData.nombre || '—'}
                        </p>
                        <p className="print-patient-internacion__os">
                            {patientData.obraSocial || '—'}
                            {patientData.afiliado ? `: ${patientData.afiliado}` : ''}
                        </p>
                    </div>

                    {/* Título SOLICITO */}
                    <div className="print-header-internacion">
                        <p className="print-encabezado-internacion">
                            SOLICITO INTERNACION EN SANATORIO ARGENTINO
                        </p>
                    </div>

                    {/* Diag. / Trat. / Cod. */}
                    <div className="print-fields" style={{ marginTop: '6mm' }}>
                        <div className="print-field-row">
                            <span className="print-field-label">Diag.:</span>
                            <span className="print-field-value">{patientData.diagnostico || '—'}</span>
                        </div>
                        <div className="print-field-row">
                            <span className="print-field-label">Trat.:</span>
                            <span className="print-field-value">{patientData.tratamiento || '—'}</span>
                        </div>
                        <div className="print-field-row">
                            <span className="print-field-label">Cod.:</span>
                            <span className="print-field-value">
                                {item.code || '—'}{item.quantity > 1 ? ` x ${item.quantity}` : ''}
                            </span>
                        </div>
                    </div>

                    {/* Fecha (sin San Juan, sin firma) */}
                    <div className="print-date-internacion">
                        <p>{fecha}</p>
                    </div>
                </div>
            ))}
        </div>
    );
});

PrintTemplateInternacion.displayName = 'PrintTemplateInternacion';
export default PrintTemplateInternacion;
