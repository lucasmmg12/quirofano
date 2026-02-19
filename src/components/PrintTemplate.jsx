import { forwardRef } from 'react';
import { formatDate } from '../utils/searchUtils';

/**
 * Plantilla de impresión que replica el formato actual del Sanatorio.
 * Formato: A5 portrait, simple, con el nombre del estudio prominente.
 */
const PrintTemplate = forwardRef(({ patientData, items, singleItem }, ref) => {
    const practiceList = singleItem ? [singleItem] : items;

    return (
        <div ref={ref} className="print-area">
            {practiceList.map((item, idx) => (
                <div className="print-page" key={item.id || idx}>
                    {/* Nombre del paciente */}
                    <div className="print-row print-row--center">
                        <span className="print-value print-value--name">
                            {patientData.nombre || '_______________'}
                        </span>
                    </div>

                    {/* Obra Social + N° Afiliado */}
                    <div className="print-row print-row--split">
                        <span className="print-value">{patientData.obraSocial || '_______________'}</span>
                        <span className="print-value">{patientData.afiliado || '_______________'}</span>
                    </div>

                    {/* Separador */}
                    <div className="print-spacer" />

                    {/* Nombre del estudio — PROMINENTE */}
                    <div className="print-study">
                        <span className="print-study__text">
                            {item.displayName || item.name}
                        </span>
                    </div>

                    {/* Separador */}
                    <div className="print-spacer" />

                    {/* Diagnóstico */}
                    <div className="print-row">
                        <span className="print-label">DIAGNOSTICO:</span>
                        <span className="print-value">{patientData.diagnostico || '_______________'}</span>
                    </div>

                    {/* Separador */}
                    <div className="print-spacer--sm" />

                    {/* Código x Cantidad */}
                    <div className="print-row">
                        <span className="print-label">CODIGO:</span>
                        <span className="print-value">
                            {item.code}{item.quantity > 1 ? ` X ${item.quantity}` : ''}
                        </span>
                    </div>

                    {/* Fecha — abajo a la derecha */}
                    <div className="print-date">
                        <span>{formatDate(item.date || patientData.fecha)}</span>
                    </div>
                </div>
            ))}
        </div>
    );
});

PrintTemplate.displayName = 'PrintTemplate';

export default PrintTemplate;
