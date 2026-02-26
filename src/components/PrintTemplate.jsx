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

                    {/* === Zona inferior: solo fecha a la derecha === */}
                    <div className="print-bottom-section">
                        <div className="print-date-block" style={{ textAlign: 'right' }}>
                            <span className="print-date-value">
                                {formatDate(item.date || patientData.fecha)}
                            </span>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
});

PrintTemplate.displayName = 'PrintTemplate';

export default PrintTemplate;
