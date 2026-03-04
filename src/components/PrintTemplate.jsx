import { forwardRef } from 'react';
import { formatDate } from '../utils/searchUtils';

/**
 * Categorías que pueden agruparse en una misma página de impresión.
 * Cuando un pedido tiene varias prácticas de estas categorías,
 * se imprimen juntas en una sola hoja (en vez de una hoja por práctica).
 */
const GROUPABLE_CATEGORIES = ['ecografia', 'tomografia', 'biopsia', 'eco_doppler'];

/**
 * Categorías y códigos que NO deben mostrar la línea "Cod.:" en la impresión.
 */
const HIDE_CODE_CATEGORIES = ['anestesia', 'prorroga', 'neonatal', 'hemoterapia', 'kinesiologia'];
const HIDE_CODE_CODES = ['LAB-GF'];

/**
 * Agrupa las prácticas: las de categorías agrupables se consolidan
 * en un único "grupo" por categoría, el resto se mantiene individual.
 */
function groupPractices(items) {
    const groups = [];
    const categoryBuckets = {};

    items.forEach(item => {
        if (GROUPABLE_CATEGORIES.includes(item.category)) {
            if (!categoryBuckets[item.category]) {
                categoryBuckets[item.category] = [];
            }
            categoryBuckets[item.category].push(item);
        } else {
            // Práctica individual (no agrupable)
            groups.push({ type: 'single', item });
        }
    });

    // Crear un grupo por cada categoría agrupable que tenga items
    Object.entries(categoryBuckets).forEach(([category, catItems]) => {
        if (catItems.length === 1) {
            // Si hay solo una, se imprime como individual
            groups.push({ type: 'single', item: catItems[0] });
        } else {
            // Múltiples prácticas de la misma categoría → una sola página
            groups.push({ type: 'grouped', category, items: catItems });
        }
    });

    return groups;
}

/**
 * Plantilla de impresión que replica el formato del membrete A5 del Sanatorio.
 * El papel ya tiene impreso: encabezado (logo, sedes) y pie (url, redes).
 * Este template deja espacio arriba y abajo para no pisar esas zonas.
 *
 * NUEVO: Soporta agrupación de prácticas (eco, tomo, biopsias) en una sola página.
 */
const PrintTemplate = forwardRef(({ patientData, items, singleItem }, ref) => {
    // Si es un item individual, renderizar como antes
    if (singleItem) {
        return (
            <div ref={ref} className="print-area">
                <SinglePage item={singleItem} patientData={patientData} />
            </div>
        );
    }

    const groups = groupPractices(items);

    return (
        <div ref={ref} className="print-area">
            {groups.map((group, idx) => {
                if (group.type === 'single') {
                    return <SinglePage key={group.item.id || idx} item={group.item} patientData={patientData} />;
                }
                // Grupo de prácticas de la misma categoría
                return (
                    <GroupedPage
                        key={`group-${group.category}-${idx}`}
                        items={group.items}
                        patientData={patientData}
                    />
                );
            })}
        </div>
    );
});

/**
 * Página individual (una práctica por hoja) — formato original.
 */
function SinglePage({ item, patientData }) {
    return (
        <div className="print-page">
            {/* === ZONA SUPERIOR: Nombre del paciente centrado === */}
            <div className="print-patient-name">
                {patientData.nombre || ''}
            </div>

            {/* === Obra Social + N° Afiliado en una línea === */}
            <div className="print-os-line">
                {patientData.obraSocial || ''}
                {patientData.afiliado ? `: ${patientData.afiliado}` : ''}
            </div>

            {/* === SOLICITO + Título del estudio === */}
            <div className="print-solicito-label">SOLICITO</div>
            <div className="print-study-title">
                {item.displayName || item.name}
            </div>

            {/* === Campos: Diag. / Cod. === */}
            <div className="print-fields">
                <div className="print-field-row">
                    <span className="print-field-label">Diag.:</span>
                    <span className="print-field-value">
                        {patientData.diagnostico || ''}
                    </span>
                </div>

                {!HIDE_CODE_CATEGORIES.includes(item.category) && !HIDE_CODE_CODES.includes(item.code) && (
                    <div className="print-field-row">
                        <span className="print-field-label">Cod.:</span>
                        <span className="print-field-value">
                            {item.code}{item.quantity > 1 ? ` x ${item.quantity}` : ''}
                        </span>
                    </div>
                )}
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
    );
}

/**
 * Página agrupada (múltiples prácticas de la misma categoría en una sola hoja).
 * Muestra un encabezado combinado y lista todos los estudios con sus códigos.
 */
function GroupedPage({ items, patientData }) {
    // Usar la fecha del primer item como referencia
    const refDate = items[0]?.date || patientData.fecha;

    // Construir el título combinado y los códigos
    const studyNames = items.map(it => it.displayName || it.name);
    const codesList = items.map(it =>
        `${it.code}${it.quantity > 1 ? ` x ${it.quantity}` : ''}`
    );

    return (
        <div className="print-page">
            {/* === Nombre del paciente === */}
            <div className="print-patient-name">
                {patientData.nombre || ''}
            </div>

            {/* === Obra Social + N° Afiliado === */}
            <div className="print-os-line">
                {patientData.obraSocial || ''}
                {patientData.afiliado ? `: ${patientData.afiliado}` : ''}
            </div>

            {/* === SOLICITO + Lista de estudios === */}
            <div className="print-solicito-label">SOLICITO</div>
            <div className="print-study-group">
                {studyNames.map((name, i) => (
                    <div key={i} className="print-study-group__item">
                        {name}
                    </div>
                ))}
            </div>

            {/* === Campos: Diag. / Cod. === */}
            <div className="print-fields">
                <div className="print-field-row">
                    <span className="print-field-label">Diag.:</span>
                    <span className="print-field-value">
                        {patientData.diagnostico || ''}
                    </span>
                </div>

                {!HIDE_CODE_CATEGORIES.includes(items[0]?.category) && (
                    <div className="print-field-row">
                        <span className="print-field-label">Cod.:</span>
                        <span className="print-field-value">
                            {codesList.join(' + ')}
                        </span>
                    </div>
                )}
            </div>

            {/* === Zona inferior: fecha a la derecha === */}
            <div className="print-bottom-section">
                <div className="print-date-block" style={{ textAlign: 'right' }}>
                    <span className="print-date-value">
                        {formatDate(refDate)}
                    </span>
                </div>
            </div>
        </div>
    );
}

PrintTemplate.displayName = 'PrintTemplate';

export default PrintTemplate;
