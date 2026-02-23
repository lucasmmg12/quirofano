import { forwardRef } from 'react';
import { formatDate } from '../utils/searchUtils';

/**
 * Plantilla de impresión que replica el formato del membrete A5 del Sanatorio.
 * El papel ya tiene impreso: encabezado (logo, sedes) y pie (url, redes).
 * Este template deja espacio arriba y abajo para no pisar esas zonas.
 */
const PrintTemplate = forwardRef(({ patientData, items, singleItem }, ref) => {
    const practiceList = singleItem ? [singleItem] : items;

    return (
        <div ref={ref} className="print-area">
            {practiceList.map((item, idx) => (
                <div className="print-page" key={item.id || idx}>
                    {/* === ZONA SUPERIOR: Nombre del paciente centrado === */}
                    <div className="print-patient-name">
                        {patientData.nombre || '_______________'}
                    </div>

                    {/* === Obra Social + N° Afiliado en una línea === */}
                    <div className="print-os-line">
                        {patientData.obraSocial || '_______________'}
                        {patientData.afiliado ? `: ${patientData.afiliado}` : ''}
                    </div>

                    {/* === Título del estudio — PROMINENTE Y CENTRADO === */}
                    <div className="print-study-title">
                        {item.displayName || item.name}
                    </div>

                    {/* === Campos: Diag. / Trat. / Cod. === */}
                    <div className="print-fields">
                        <div className="print-field-row">
                            <span className="print-field-label">Diag.:</span>
                            <span className="print-field-value">
                                {patientData.diagnostico || '_______________'}
                            </span>
                        </div>

                        <div className="print-field-row">
                            <span className="print-field-label">Trat.:</span>
                            <span className="print-field-value">
                                {patientData.tratamiento || (item.displayName || item.name)}
                            </span>
                        </div>

                        <div className="print-field-row">
                            <span className="print-field-label">Cod.:</span>
                            <span className="print-field-value">
                                {item.code}{item.quantity > 1 ? ` x ${item.quantity}` : ''}
                            </span>
                        </div>
                    </div>

                    {/* === Zona inferior: institucional + firma === */}
                    <div className="print-bottom-section">
                        {/* Línea institucional */}
                        <div className="print-institutional">
                            <span className="print-institutional__name">Sanatorio Argentino S.R.L.</span>
                            <span className="print-institutional__type">
                                {patientData.tratamiento ? patientData.tratamiento : 'INTERNADO'}
                            </span>
                        </div>

                        {/* Zona de firma y fecha */}
                        <div className="print-signature-area">
                            <div className="print-signature-block">
                                <div className="print-signature-line"></div>
                                <span className="print-signature-label">Firma y Sello del Médico</span>
                            </div>
                            <div className="print-date-block">
                                <span className="print-date-value">
                                    {formatDate(item.date || patientData.fecha)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
});

PrintTemplate.displayName = 'PrintTemplate';

export default PrintTemplate;
