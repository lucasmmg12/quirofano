/**
 * AsociacionesEntregaPanel.jsx — Panel de Entrega de Documentación a Asociaciones
 *
 * 3 Pestañas:
 *   1. Cirugías Pendientes — check de docs, enviar al carrito
 *   2. Carrito de Entrega — agrupar por asociación, generar constancia
 *   3. Historial de Entregas — auditoría de constancias pasadas
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    Package, CheckCircle2, ShoppingCart, History, Search,
    Filter, ChevronDown, ChevronRight, Printer, FileCheck,
    AlertCircle, RefreshCw, Loader2, X, PackageCheck, RotateCcw,
} from 'lucide-react';
import {
    fetchAsociacionesCirugias,
    toggleDocsCompletos,
    enviarAlCarrito,
    quitarDelCarrito,
    fetchCarrito,
    generarConstancia,
    fetchConstancias,
    fetchConstanciaDetalle,
    fetchResumenAsociaciones,
    revertirConstancia,
    ASOCIACION_COLORS,
    ASOCIACION_LIST,
} from '../services/asociacionesService';

// ═══════════════════════════════
// Sub-component: Dashboard Badges
// ═══════════════════════════════

// Helper: format date as dd/mm/yyyy (forced, no locale dependency)
const fmtFecha = (isoDate) => {
    if (!isoDate) return '—';
    const parts = isoDate.split('-');
    if (parts.length !== 3) return isoDate;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
};

function AsociacionBadges({ resumen, filtroAsociacion, onFilterChange }) {
    return (
        <div style={{
            display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px',
        }}>
            {/* "Todas" badge */}
            <button
                onClick={() => onFilterChange(null)}
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 14px', borderRadius: '20px',
                    border: filtroAsociacion === null ? '2px solid #374151' : '1px solid #E5E7EB',
                    background: filtroAsociacion === null ? '#F9FAFB' : '#fff',
                    fontWeight: filtroAsociacion === null ? 700 : 500,
                    fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                    color: '#374151',
                }}
            >
                Todas
                <span style={{
                    background: '#F3F4F6', padding: '1px 8px', borderRadius: '10px',
                    fontSize: '0.7rem', fontWeight: 700, color: '#6B7280',
                }}>
                    {Object.values(resumen).reduce((s, r) => s + r.total - r.entregadas, 0)}
                </span>
            </button>

            {ASOCIACION_LIST.map(asoc => {
                const r = resumen[asoc] || { total: 0, sinDocs: 0, conDocs: 0, enCarrito: 0, entregadas: 0 };
                const pendientes = r.total - r.entregadas;
                const color = ASOCIACION_COLORS[asoc];
                const isActive = filtroAsociacion === asoc;
                const shortName = asoc.replace('Asociación de ', '').replace(' (Particular)', '');

                return (
                    <button
                        key={asoc}
                        onClick={() => onFilterChange(isActive ? null : asoc)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '6px 14px', borderRadius: '20px',
                            border: isActive ? `2px solid ${color}` : '1px solid #E5E7EB',
                            background: isActive ? `${color}10` : '#fff',
                            fontWeight: isActive ? 700 : 500,
                            fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                            color: isActive ? color : '#6B7280',
                        }}
                    >
                        <div style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: color, flexShrink: 0,
                        }} />
                        {shortName}
                        <span style={{
                            background: isActive ? `${color}20` : '#F3F4F6',
                            padding: '1px 8px', borderRadius: '10px',
                            fontSize: '0.7rem', fontWeight: 700,
                            color: isActive ? color : '#9CA3AF',
                        }}>
                            {pendientes}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

// ═══════════════════════════════
// Main Panel
// ═══════════════════════════════
export default function AsociacionesEntregaPanel({ addToast, currentUser }) {
    const [activeTab, setActiveTab] = useState('pendientes');
    const [loading, setLoading] = useState(true);

    // Pendientes state
    const [cirugias, setCirugias] = useState([]);
    const [filtroAsociacion, setFiltroAsociacion] = useState(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [resumen, setResumen] = useState({});

    // Carrito state
    const [carrito, setCarrito] = useState({});
    const [carritoLoading, setCarritoLoading] = useState(false);
    const [filtroCarrito, setFiltroCarrito] = useState(null); // null = todas las asociaciones

    // Historial state
    const [constancias, setConstancias] = useState([]);
    const [expandedConstancia, setExpandedConstancia] = useState(null);
    const [constanciaDetalle, setConstanciaDetalle] = useState({});
    const [confirmRevertir, setConfirmRevertir] = useState(null);   // constancia.id pendiente de confirmar
    const [revertirLoading, setRevertirLoading] = useState(null);   // constancia.id en proceso


    // Column filters state
    const [columnFilters, setColumnFilters] = useState({});
    const [openFilterCol, setOpenFilterCol] = useState(null);

    // Close filter dropdown on outside click
    useEffect(() => {
        if (!openFilterCol) return;
        const handleClick = () => setOpenFilterCol(null);
        const timer = setTimeout(() => document.addEventListener('click', handleClick), 0);
        return () => { clearTimeout(timer); document.removeEventListener('click', handleClick); };
    }, [openFilterCol]);

    // Modal for generating constancia
    const [showConstanciaModal, setShowConstanciaModal] = useState(null); // asociacion name

    // ─── Load Data ───
    const loadPendientes = useCallback(async () => {
        setLoading(true);
        try {
            const [data, res] = await Promise.all([
                fetchAsociacionesCirugias({
                    asociacion: filtroAsociacion,
                    search: searchTerm || undefined,
                    soloSinConstancia: true,
                    soloSinCarrito: true,  // ✅ FIX: exclude items already in cart
                }),
                fetchResumenAsociaciones(),
            ]);
            setCirugias(data);
            setResumen(res);
        } catch (err) {
            addToast?.('Error al cargar cirugías: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [filtroAsociacion, searchTerm, addToast]);

    const loadCarrito = useCallback(async () => {
        setCarritoLoading(true);
        try {
            const data = await fetchCarrito();
            setCarrito(data);
        } catch (err) {
            addToast?.('Error al cargar carrito: ' + err.message, 'error');
        } finally {
            setCarritoLoading(false);
        }
    }, [addToast]);

    const loadHistorial = useCallback(async () => {
        try {
            const data = await fetchConstancias();
            setConstancias(data);
        } catch (err) {
            addToast?.('Error al cargar historial: ' + err.message, 'error');
        }
    }, [addToast]);

    useEffect(() => {
        if (activeTab === 'pendientes') {
            // ✅ FIX: load carrito in parallel so badge count is accurate from the start
            loadPendientes();
            loadCarrito();
        }
        else if (activeTab === 'carrito') loadCarrito();
        else if (activeTab === 'historial') loadHistorial();
    }, [activeTab, loadPendientes, loadCarrito, loadHistorial]);

    // ─── Handlers ───
    const handleToggleDocs = async (id) => {
        try {
            const updated = await toggleDocsCompletos(id, currentUser?.nombre || 'Sistema');
            setCirugias(prev => prev.map(c => c.id === id ? updated : c));
            // Refresh resumen
            fetchResumenAsociaciones().then(setResumen);
        } catch (err) {
            addToast?.('Error al actualizar documentación: ' + err.message, 'error');
        }
    };

    const handleEnviarAlCarrito = async () => {
        const conDocs = cirugias.filter(c => c.docs_completos && !c.en_carrito && !c.constancia_id);
        if (conDocs.length === 0) {
            addToast?.('No hay cirugías con documentación completa para enviar', 'info');
            return;
        }
        try {
            await enviarAlCarrito(conDocs.map(c => c.id));
            addToast?.(`${conDocs.length} expediente(s) enviados al carrito`, 'success');
            // ✅ FIX: reload both pendientes AND carrito so badge + tab update instantly
            await Promise.all([loadPendientes(), loadCarrito()]);
        } catch (err) {
            addToast?.('Error al enviar al carrito: ' + err.message, 'error');
        }
    };

    const handleQuitarDelCarrito = async (id) => {
        try {
            await quitarDelCarrito(id);
            addToast?.('Expediente removido del carrito', 'info');
            // ✅ FIX: also refresh pendientes so item reappears there
            await Promise.all([loadCarrito(), loadPendientes()]);
        } catch (err) {
            addToast?.('Error: ' + err.message, 'error');
        }
    };

    const handleExpandConstancia = async (constanciaId) => {
        if (expandedConstancia === constanciaId) {
            setExpandedConstancia(null);
            return;
        }
        setExpandedConstancia(constanciaId);
        if (!constanciaDetalle[constanciaId]) {
            try {
                const detalle = await fetchConstanciaDetalle(constanciaId);
                setConstanciaDetalle(prev => ({ ...prev, [constanciaId]: detalle }));
            } catch (err) {
                addToast?.('Error al cargar detalle', 'error');
            }
        }
    };

    const handleRevertirConstancia = async (cons) => {
        setRevertirLoading(cons.id);
        try {
            await revertirConstancia(cons.id);
            addToast?.(
                `↩️ Constancia ${cons.codigo} revertida — ${cons.cantidad_expedientes} expediente(s) volvieron al carrito`,
                'success'
            );
            setConfirmRevertir(null);
            setExpandedConstancia(null);
            await Promise.all([loadHistorial(), loadCarrito(), loadPendientes()]);
        } catch (err) {
            addToast?.('Error al revertir: ' + err.message, 'error');
        } finally {
            setRevertirLoading(null);
        }
    };

    const handlePrintConstancia = async (constancia, items) => {
        try {
            let printItems = items;
            if (!printItems) {
                printItems = await fetchConstanciaDetalle(constancia.id);
            }

            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 14;
            const colW = pageW - margin * 2;
            let y = 0;

            // Load logo image and clip to circle via canvas
            let logoCircleBase64 = null;
            try {
                const logoImg = new Image();
                logoImg.crossOrigin = 'anonymous';
                logoImg.src = '/logosanatorio.png';
                await new Promise((resolve, reject) => {
                    logoImg.onload = resolve;
                    logoImg.onerror = reject;
                });
                // Draw circular clip on offscreen canvas
                const canvasSize = 200;
                const canvas = document.createElement('canvas');
                canvas.width = canvasSize;
                canvas.height = canvasSize;
                const ctx = canvas.getContext('2d');
                // Circle clip
                ctx.beginPath();
                ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                // Draw image filling the circle
                ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
                logoCircleBase64 = canvas.toDataURL('image/png');
            } catch (e) { /* logo optional */ }

            // ═══════════════════════════════════════════
            //  HEADER — Barra azul institucional
            // ═══════════════════════════════════════════
            doc.setFillColor(13, 59, 102); // #0D3B66
            doc.rect(0, 0, pageW, 34, 'F');

            // Logo circular
            const logoX = margin + 1;
            const logoY = 10;
            const logoSize = 14;
            if (logoCircleBase64) {
                // White ring behind
                doc.setFillColor(255, 255, 255);
                doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
                // Circular logo
                doc.addImage(logoCircleBase64, 'PNG', logoX, logoY, logoSize, logoSize);
            } else {
                // Fallback text
                doc.setFillColor(255, 255, 255);
                doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
                doc.setFontSize(6);
                doc.setTextColor(13, 59, 102);
                doc.text('SA', logoX + 3.5, logoY + logoSize / 2 + 1.5);
            }

            // Title
            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text('SANATORIO ARGENTINO', margin + 18, 14);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 200, 220);
            doc.text('Administración · Documentación Quirúrgica', margin + 18, 21);

            // Top-right badge
            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('CONSTANCIA DE ENTREGA', pageW - margin, 14, { align: 'right' });
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 200, 220);
            doc.text('Sistema ADM-QUI', pageW - margin, 21, { align: 'right' });

            // Accent line
            doc.setFillColor(59, 130, 246); // #3B82F6
            doc.rect(0, 34, pageW, 2, 'F');

            y = 44;

            // ═══════════════════════════════════════════
            //  INFO BAR — Código, Fecha, Asociación, Total
            // ═══════════════════════════════════════════
            const fechaHora = new Date(constancia.fecha_entrega).toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });

            doc.setFillColor(241, 245, 249); // #F1F5F9
            doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
            doc.setDrawColor(226, 232, 240); // #E2E8F0
            doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

            const infoItems = [
                { label: 'CÓDIGO', value: constancia.codigo },
                { label: 'FECHA Y HORA', value: fechaHora },
                { label: 'ASOCIACIÓN', value: constancia.asociacion },
                { label: 'EXPEDIENTES', value: String(printItems.length) },
            ];

            const cellW = colW / 4;
            infoItems.forEach((item, i) => {
                const x = margin + cellW * i + 6;
                doc.setFontSize(6);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(148, 163, 184);
                doc.text(item.label, x, y + 6);
                doc.setFontSize(i === 0 || i === 3 ? 11 : 9);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(13, 59, 102);
                doc.text(item.value || '—', x, y + 13);
            });

            y += 26;

            // ═══════════════════════════════════════════
            //  SECTION TITLE — Detalle de Expedientes
            // ═══════════════════════════════════════════
            doc.setFillColor(59, 130, 246);
            doc.rect(margin, y, 3, 7, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(13, 59, 102);
            doc.text('DETALLE DE EXPEDIENTES ENTREGADOS', margin + 6, y + 5.5);
            y += 12;

            // ═══════════════════════════════════════════
            //  TABLE — Expedientes
            // ═══════════════════════════════════════════
            const tableBody = printItems.map((item, idx) => {
                const fecha = item.fecha_realizacion
                    ? new Date(item.fecha_realizacion + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                    : '—';
                return [
                    String(idx + 1),
                    fecha,
                    item.nombre_paciente || '—',
                    item.dni || '—',
                    item.cliente || '—',
                    (item.nombre_cirugia || '—').substring(0, 35),
                    (item.cirujano || '—').substring(0, 20),
                ];
            });

            autoTable(doc, {
                startY: y,
                head: [['#', 'Fecha', 'Paciente', 'DNI', 'Obra Social', 'Cirugía', 'Cirujano']],
                body: tableBody,
                theme: 'grid',
                headStyles: {
                    fillColor: [13, 59, 102], // #0D3B66
                    textColor: [255, 255, 255],
                    fontSize: 7.5,
                    fontStyle: 'bold',
                    halign: 'left',
                    cellPadding: 3,
                },
                bodyStyles: {
                    fontSize: 7.5,
                    cellPadding: 2.5,
                    textColor: [30, 30, 30],
                },
                alternateRowStyles: {
                    fillColor: [248, 250, 252], // #F8FAFC
                },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
                    1: { cellWidth: 18 },
                    2: { fontStyle: 'bold', cellWidth: 38 },
                    3: { cellWidth: 22, font: 'courier' },
                    4: { cellWidth: 30 },
                    5: { cellWidth: 42 },
                    6: { cellWidth: 24 },
                },
                margin: { left: margin, right: margin },
                didDrawPage: () => {
                    // Re-draw header on every page
                    doc.setFillColor(13, 59, 102);
                    doc.rect(0, 0, pageW, 8, 'F');
                    doc.setFillColor(59, 130, 246);
                    doc.rect(0, 8, pageW, 1, 'F');
                },
            });

            y = doc.lastAutoTable.finalY + 6;

            // ═══════════════════════════════════════════
            //  OBSERVACIONES
            // ═══════════════════════════════════════════
            if (constancia.notas) {
                doc.setFillColor(255, 251, 235); // #FFFBEB
                doc.setDrawColor(253, 230, 138); // #FDE68A
                doc.roundedRect(margin, y, colW, 14, 2, 2, 'FD');
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(146, 64, 14);
                doc.text('OBSERVACIONES:', margin + 4, y + 5);
                doc.setFont('helvetica', 'normal');
                doc.text(constancia.notas.substring(0, 120), margin + 32, y + 5);
                y += 18;
            }

            // ═══════════════════════════════════════════
            //  FIRMAS — Check if we need a new page
            // ═══════════════════════════════════════════
            if (y > pageH - 65) {
                doc.addPage();
                y = 20;
            }

            y += 8;
            const sigBoxW = (colW - 20) / 2;

            // Firma Entrega
            const sig1X = margin;
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(sig1X, y, sigBoxW, 42, 3, 3, 'S');
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(148, 163, 184);
            doc.text('ENTREGA', sig1X + sigBoxW / 2, y + 6, { align: 'center' });
            // Signature line
            doc.setDrawColor(13, 59, 102);
            doc.setLineWidth(0.5);
            doc.line(sig1X + 12, y + 30, sig1X + sigBoxW - 12, y + 30);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(13, 59, 102);
            doc.text(constancia.responsable_entrega || '________________________', sig1X + sigBoxW / 2, y + 35, { align: 'center' });
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text('Sanatorio Argentino — Administración', sig1X + sigBoxW / 2, y + 40, { align: 'center' });

            // Firma Recibe
            const sig2X = margin + sigBoxW + 20;
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(sig2X, y, sigBoxW, 42, 3, 3, 'S');
            doc.setFontSize(6.5);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(148, 163, 184);
            doc.text('RECIBE', sig2X + sigBoxW / 2, y + 6, { align: 'center' });
            doc.setDrawColor(13, 59, 102);
            doc.line(sig2X + 12, y + 30, sig2X + sigBoxW - 12, y + 30);
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(13, 59, 102);
            doc.text(constancia.nombre_cadete || '________________________', sig2X + sigBoxW / 2, y + 35, { align: 'center' });
            doc.setFontSize(7);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 116, 139);
            doc.text(constancia.asociacion, sig2X + sigBoxW / 2, y + 40, { align: 'center' });

            // ═══════════════════════════════════════════
            //  FOOTER — Todas las páginas
            // ═══════════════════════════════════════════
            const totalPages = doc.internal.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                // Footer line
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
                // Footer text
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(170, 170, 170);
                doc.text(
                    'Esta constancia acredita la entrega de la documentación quirúrgica detallada. Conserve este documento como comprobante.',
                    margin, pageH - 8
                );
                doc.text(
                    `Sistema ADM-QUI — Sanatorio Argentino · Pág. ${p}/${totalPages}`,
                    pageW - margin, pageH - 8,
                    { align: 'right' }
                );
            }

            // ═══════════════════════════════════════════
            //  SAVE
            // ═══════════════════════════════════════════
            const fileName = `constancia_${constancia.codigo}_${constancia.asociacion.replace(/\s+/g, '_')}.pdf`;
            doc.save(fileName);
            addToast?.(`✅ PDF "${fileName}" descargado`, 'success');
        } catch (err) {
            console.error('Error generating PDF:', err);
            addToast?.('Error al generar PDF: ' + err.message, 'error');
        }
    };

    // ─── Filter display data ───
    // Server-side query already excludes en_carrito items, so cirugias = only pendientes
    const pendientesCirugias = cirugias; // all items returned are already pending (not in cart)
    const enCarritoCount = Object.values(carrito).flat().length; // from carrito state

    // ─── Column-filtered data ───
    const filteredPendientes = useMemo(() => {
        return pendientesCirugias.filter(c => {
            for (const [col, val] of Object.entries(columnFilters)) {
                if (!val) continue;
                let cellValue = '';
                if (col === 'fecha') {
                    const d = new Date(c.fecha_realizacion + 'T12:00:00');
                    const localeMes = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                    cellValue = localeMes.charAt(0).toUpperCase() + localeMes.slice(1);
                }
                else if (col === 'paciente') cellValue = c.nombre_paciente || '';
                else if (col === 'dni') cellValue = c.dni || '';
                else if (col === 'os') cellValue = c.cliente || '';
                else if (col === 'cirugia') cellValue = c.nombre_cirugia || '';
                else if (col === 'cirujano') cellValue = c.cirujano || '';
                else if (col === 'asociacion') cellValue = c.asociacion || '';
                if (cellValue !== val) return false;
            }
            return true;
        });
    }, [pendientesCirugias, columnFilters]);

    // ─── Unique values for column filter dropdowns ───
    const columnUniqueValues = useMemo(() => {
        const cols = ['fecha', 'paciente', 'dni', 'os', 'cirugia', 'cirujano', 'asociacion'];
        const result = {};
        cols.forEach(col => {
            const vals = new Set();
            pendientesCirugias.forEach(c => {
                let v = '';
                if (col === 'fecha') {
                    if (c.fecha_realizacion) {
                        const d = new Date(c.fecha_realizacion + 'T12:00:00');
                        const localeMes = d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
                        v = localeMes.charAt(0).toUpperCase() + localeMes.slice(1);
                        // Store the raw sortable value string mapped to the display label
                        if (!result.fechaSort) result.fechaSort = {};
                        result.fechaSort[v] = c.fecha_realizacion.substring(0, 7); // 'YYYY-MM'
                    }
                }
                else if (col === 'paciente') v = c.nombre_paciente || '';
                else if (col === 'dni') v = c.dni || '';
                else if (col === 'os') v = c.cliente || '';
                else if (col === 'cirugia') v = c.nombre_cirugia || '';
                else if (col === 'cirujano') v = c.cirujano || '';
                else if (col === 'asociacion') v = c.asociacion || '';
                if (v) vals.add(v);
            });
            result[col] = [...vals].sort((a, b) => {
                if (col === 'fecha') {
                    const sortA = result.fechaSort?.[a] || '';
                    const sortB = result.fechaSort?.[b] || '';
                    return sortB.localeCompare(sortA); // Newest first
                }
                return a.localeCompare(b);
            });
        });
        return result;
    }, [pendientesCirugias]);

    const activeFilterCount = Object.values(columnFilters).filter(Boolean).length;

    const FilterableHeader = ({ label, colKey, width }) => {
        const isOpen = openFilterCol === colKey;
        const isFiltered = !!columnFilters[colKey];
        const uniqueVals = columnUniqueValues[colKey] || [];
        return (
            <th style={{ ...thStyle, width, position: 'relative', userSelect: 'none' }}>
                <div
                    onClick={() => setOpenFilterCol(isOpen ? null : colKey)}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        cursor: 'pointer', color: isFiltered ? '#0D3B66' : undefined,
                    }}
                >
                    {label}
                    <Filter size={11} style={{
                        color: isFiltered ? '#0D3B66' : '#CBD5E1',
                        flexShrink: 0,
                    }} />
                    {isFiltered && (
                        <span style={{
                            width: '6px', height: '6px', borderRadius: '50%',
                            background: '#0D3B66', flexShrink: 0,
                        }} />
                    )}
                </div>
                {isOpen && (
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            position: 'absolute', top: '100%', left: 0, zIndex: 100,
                            minWidth: '180px', maxHeight: '260px', overflowY: 'auto',
                            background: '#fff', border: '1px solid #E2E8F0',
                            borderRadius: '10px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                            padding: '4px', marginTop: '2px',
                        }}
                    >
                        <button
                            onClick={() => { setColumnFilters(prev => ({ ...prev, [colKey]: null })); setOpenFilterCol(null); }}
                            style={{
                                display: 'block', width: '100%', textAlign: 'left',
                                padding: '6px 10px', border: 'none', borderRadius: '6px',
                                background: !columnFilters[colKey] ? '#EFF6FF' : 'transparent',
                                color: '#0D3B66', fontSize: '0.75rem', fontWeight: 600,
                                cursor: 'pointer', marginBottom: '2px',
                            }}
                        >
                            ✕ Todos ({uniqueVals.length})
                        </button>
                        {uniqueVals.map(val => (
                            <button
                                key={val}
                                onClick={() => { setColumnFilters(prev => ({ ...prev, [colKey]: val })); setOpenFilterCol(null); }}
                                style={{
                                    display: 'block', width: '100%', textAlign: 'left',
                                    padding: '5px 10px', border: 'none', borderRadius: '6px',
                                    background: columnFilters[colKey] === val ? '#DBEAFE' : 'transparent',
                                    color: columnFilters[colKey] === val ? '#1D4ED8' : '#374151',
                                    fontSize: '0.73rem', fontWeight: columnFilters[colKey] === val ? 700 : 400,
                                    cursor: 'pointer', overflow: 'hidden',
                                    textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                }}
                            >
                                {val}
                            </button>
                        ))}
                    </div>
                )}
            </th>
        );
    };

    // Tab config
    const tabs = [
        { id: 'pendientes', label: 'Cirugías Pendientes', icon: FileCheck, count: pendientesCirugias.length },
        { id: 'carrito', label: 'Carrito de Entrega', icon: ShoppingCart, count: Object.values(carrito).flat().length },
        { id: 'historial', label: 'Historial', icon: History, count: constancias.length },
    ];

    return (
        <div className="content no-print" style={{ padding: '20px', height: '100%', overflow: 'auto' }}>
            {/* Header */}
            <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: '20px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                        width: '42px', height: '42px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <PackageCheck size={22} color="#fff" />
                    </div>
                    <div>
                        <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1F2937', margin: 0 }}>
                            Entrega Asociaciones
                        </h2>
                        <p style={{ fontSize: '0.78rem', color: '#9CA3AF', margin: 0 }}>
                            Control de documentación quirúrgica para asociaciones médicas
                        </p>
                    </div>
                </div>

                <button
                    onClick={() => {
                        if (activeTab === 'pendientes') loadPendientes();
                        else if (activeTab === 'carrito') loadCarrito();
                        else loadHistorial();
                    }}
                    style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        padding: '8px 14px', borderRadius: '8px',
                        background: '#F3F4F6', border: '1px solid #E5E7EB',
                        fontSize: '0.78rem', fontWeight: 600, color: '#6B7280',
                        cursor: 'pointer', transition: 'all 0.2s',
                    }}
                >
                    <RefreshCw size={14} /> Actualizar
                </button>
            </div>

            {/* Tabs — Estilo fichero */}
            <div style={{
                display: 'flex', gap: '0', marginBottom: '0',
                borderBottom: '2px solid #0D3B66',
                paddingLeft: '4px',
            }}>
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px',
                                padding: isActive ? '10px 22px 10px' : '8px 18px 8px',
                                borderRadius: '10px 10px 0 0',
                                border: isActive ? '2px solid #0D3B66' : '1px solid #CBD5E1',
                                borderBottom: isActive ? '2px solid #fff' : '1px solid transparent',
                                marginBottom: '-2px',
                                background: isActive
                                    ? '#fff'
                                    : 'linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)',
                                color: isActive ? '#0D3B66' : '#64748B',
                                fontWeight: isActive ? 800 : 500,
                                fontSize: '0.82rem',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                                position: 'relative',
                                zIndex: isActive ? 2 : 1,
                                boxShadow: isActive
                                    ? '0 -2px 6px rgba(13, 59, 102, 0.08)'
                                    : 'none',
                            }}
                        >
                            <Icon size={15} style={{
                                color: isActive ? '#0D3B66' : '#94A3B8',
                            }} />
                            {tab.label}
                            {tab.count > 0 && (
                                <span style={{
                                    padding: '1px 8px', borderRadius: '10px',
                                    fontSize: '0.68rem', fontWeight: 700,
                                    background: isActive ? '#0D3B66' : '#94A3B8',
                                    color: '#fff',
                                    minWidth: '20px', textAlign: 'center',
                                }}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* ════════════════════════════════════════ */}
            {/* TAB 1: Cirugías Pendientes              */}
            {/* ════════════════════════════════════════ */}
            {activeTab === 'pendientes' && (
                <div>
                    {/* Badges de asociación */}
                    <AsociacionBadges
                        resumen={resumen}
                        filtroAsociacion={filtroAsociacion}
                        onFilterChange={setFiltroAsociacion}
                    />

                    {/* Search + Actions */}
                    <div style={{
                        display: 'flex', gap: '10px', marginBottom: '14px',
                        alignItems: 'center',
                    }}>
                        <div style={{
                            flex: 1, display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '8px 14px', borderRadius: '8px',
                            border: '1px solid #E5E7EB', background: '#fff',
                        }}>
                            <Search size={15} color="#9CA3AF" />
                            <input
                                type="text"
                                placeholder="Buscar paciente, DNI, cirujano..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{
                                    border: 'none', outline: 'none', flex: 1,
                                    fontSize: '0.82rem', color: '#374151',
                                    background: 'transparent',
                                }}
                            />
                            {searchTerm && (
                                <button onClick={() => setSearchTerm('')} style={{
                                    background: 'none', border: 'none', cursor: 'pointer',
                                    color: '#9CA3AF', padding: '2px',
                                }}>
                                    <X size={14} />
                                </button>
                            )}
                        </div>

                        <button
                            onClick={handleEnviarAlCarrito}
                            disabled={!cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: '8px',
                                background: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? 'linear-gradient(135deg, #10B981, #059669)' : '#E5E7EB',
                                color: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? '#fff' : '#9CA3AF',
                                border: 'none', fontWeight: 700, fontSize: '0.78rem',
                                cursor: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? 'pointer' : 'not-allowed',
                                transition: 'all 0.2s',
                                boxShadow: cirugias.some(c => c.docs_completos && !c.en_carrito && !c.constancia_id)
                                    ? '0 2px 8px rgba(16, 185, 129, 0.3)' : 'none',
                            }}
                        >
                            <ShoppingCart size={14} />
                            Enviar al Carrito
                        </button>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '60px', color: '#9CA3AF', gap: '8px',
                        }}>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            Cargando cirugías...
                        </div>
                    ) : pendientesCirugias.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', color: '#9CA3AF',
                        }}>
                            <CheckCircle2 size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#6B7280', margin: '0 0 4px' }}>
                                No hay cirugías pendientes
                            </h3>
                            <p style={{ fontSize: '0.82rem' }}>
                                {filtroAsociacion ? `No hay cirugías pendientes para ${filtroAsociacion}` : 'Todas las cirugías han sido procesadas'}
                            </p>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            border: '1px solid #E5E7EB', overflow: 'hidden',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#F9FAFB' }}>
                                        <FilterableHeader label="Fecha" colKey="fecha" />
                                        <FilterableHeader label="Paciente" colKey="paciente" />
                                        <FilterableHeader label="DNI" colKey="dni" />
                                        <FilterableHeader label="Obra Social" colKey="os" />
                                        <FilterableHeader label="Cirugía" colKey="cirugia" />
                                        <FilterableHeader label="Cirujano" colKey="cirujano" />
                                        <FilterableHeader label="Asociación" colKey="asociacion" />
                                        <th style={{ ...thStyle, textAlign: 'center', width: '80px' }}>Docs ✓</th>
                                    </tr>
                                    {activeFilterCount > 0 && (
                                        <tr>
                                            <td colSpan={8} style={{
                                                padding: '4px 10px', background: '#EFF6FF',
                                                borderBottom: '1px solid #DBEAFE',
                                            }}>
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', gap: '8px',
                                                    fontSize: '0.72rem', color: '#1E40AF',
                                                }}>
                                                    <Filter size={12} />
                                                    <strong>{activeFilterCount} filtro{activeFilterCount > 1 ? 's' : ''} activo{activeFilterCount > 1 ? 's' : ''}</strong>
                                                    <span style={{ color: '#3B82F6' }}>— {filteredPendientes.length} de {pendientesCirugias.length} registros</span>
                                                    <button
                                                        onClick={() => setColumnFilters({})}
                                                        style={{
                                                            marginLeft: 'auto', background: '#DBEAFE',
                                                            border: 'none', borderRadius: '6px',
                                                            padding: '2px 8px', cursor: 'pointer',
                                                            fontSize: '0.7rem', fontWeight: 600, color: '#1D4ED8',
                                                        }}
                                                    >
                                                        Limpiar filtros
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </thead>
                                <tbody>
                                    {filteredPendientes.map(c => {
                                        const color = ASOCIACION_COLORS[c.asociacion] || '#6B7280';
                                        return (
                                            <tr key={c.id} style={{
                                                borderBottom: '1px solid #F3F4F6',
                                                transition: 'background 0.15s',
                                            }}
                                                onMouseOver={e => e.currentTarget.style.background = '#FAFBFF'}
                                                onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                            >
                                                <td style={tdStyle}>
                                                    {fmtFecha(c.fecha_realizacion)}
                                                </td>
                                                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.nombre_paciente}</td>
                                                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.78rem' }}>{c.dni || '—'}</td>
                                                <td style={tdStyle}>{c.cliente || '—'}</td>
                                                <td style={{ ...tdStyle, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {c.nombre_cirugia || '—'}
                                                </td>
                                                <td style={tdStyle}>{c.cirujano || '—'}</td>
                                                <td style={tdStyle}>
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        padding: '2px 10px', borderRadius: '12px',
                                                        background: `${color}15`, color: color,
                                                        fontSize: '0.72rem', fontWeight: 600,
                                                    }}>
                                                        <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                                                        {c.asociacion.replace('Asociación de ', '').replace(' (Particular)', '')}
                                                    </span>
                                                </td>
                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                    <button
                                                        onClick={() => handleToggleDocs(c.id)}
                                                        style={{
                                                            width: '32px', height: '32px', borderRadius: '8px',
                                                            border: c.docs_completos ? '2px solid #10B981' : '2px solid #D1D5DB',
                                                            background: c.docs_completos ? '#ECFDF5' : '#fff',
                                                            cursor: 'pointer', display: 'flex',
                                                            alignItems: 'center', justifyContent: 'center',
                                                            transition: 'all 0.2s',
                                                            margin: '0 auto',
                                                        }}
                                                        title={c.docs_completos ? `Marcado por ${c.operador}` : 'Marcar documentación completa'}
                                                    >
                                                        {c.docs_completos && <CheckCircle2 size={18} color="#10B981" />}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* En carrito banner — uses server state */}
                    {enCarritoCount > 0 && (
                        <div style={{
                            marginTop: '12px', padding: '10px 16px', borderRadius: '10px',
                            background: '#FFFBEB', border: '1px solid #FDE68A',
                            display: 'flex', alignItems: 'center', gap: '8px',
                            fontSize: '0.8rem', color: '#92400E',
                        }}>
                            <ShoppingCart size={16} />
                            <strong>{enCarritoCount}</strong> expediente(s) ya en el carrito esperando entrega
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* TAB 2: Carrito de Entrega               */}
            {/* ════════════════════════════════════════ */}
            {activeTab === 'carrito' && (
                <div>
                    {carritoLoading ? (
                        <div style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            padding: '60px', color: '#9CA3AF', gap: '8px',
                        }}>
                            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                            Cargando carrito...
                        </div>
                    ) : Object.keys(carrito).length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', color: '#9CA3AF',
                        }}>
                            <ShoppingCart size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#6B7280', margin: '0 0 4px' }}>
                                Carrito vacío
                            </h3>
                            <p style={{ fontSize: '0.82rem' }}>
                                Marque la documentación como completa en la pestaña &quot;Cirugías Pendientes&quot; y envíe al carrito.
                            </p>
                        </div>
                    ) : (() => {
                        // ─── Compute stats ───
                        const totalItems = Object.values(carrito).flat().length;
                        const allItems = Object.values(carrito).flat();
                        // Unique days when items were added (use fecha_realizacion as proxy, or checked_at if available)
                        const uniqueDias = new Set(allItems.map(i => i.checked_at?.substring(0, 10) || i.fecha_realizacion?.substring(0, 10))).size;
                        // Filter carrito entries by selected association
                        const carritoEntries = Object.entries(carrito).filter(([asoc]) =>
                            filtroCarrito === null || asoc === filtroCarrito
                        );

                        return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

                                {/* ─── Stat bar ─── */}
                                <div style={{
                                    display: 'flex', gap: '10px', alignItems: 'center',
                                    padding: '10px 14px', borderRadius: '10px',
                                    background: 'linear-gradient(135deg, #EFF6FF, #DBEAFE)',
                                    border: '1px solid #BFDBFE', marginBottom: '4px',
                                }}>
                                    <ShoppingCart size={15} color="#1D4ED8" />
                                    <span style={{ fontSize: '0.8rem', color: '#1E40AF', fontWeight: 700 }}>
                                        {totalItems} expediente{totalItems !== 1 ? 's' : ''} acumulado{totalItems !== 1 ? 's' : ''}
                                    </span>
                                    <span style={{ color: '#93C5FD', fontWeight: 400 }}>·</span>
                                    <span style={{ fontSize: '0.78rem', color: '#3B82F6' }}>
                                        {Object.keys(carrito).length} asociación{Object.keys(carrito).length !== 1 ? 'es' : ''}
                                    </span>
                                    {uniqueDias > 1 && (
                                        <>
                                            <span style={{ color: '#93C5FD' }}>·</span>
                                            <span style={{ fontSize: '0.78rem', color: '#6366F1', fontWeight: 600 }}>
                                                📅 Cargado en {uniqueDias} días distintos
                                            </span>
                                        </>
                                    )}
                                    <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: '#60A5FA' }}>
                                        Podés seguir agregando expedientes y generar la constancia cuando quieras
                                    </span>
                                </div>

                                {/* ─── Association filter badges ─── */}
                                <div style={{
                                    display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '4px',
                                }}>
                                    {/* "Todas" badge */}
                                    <button
                                        onClick={() => setFiltroCarrito(null)}
                                        style={{
                                            display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 14px', borderRadius: '20px',
                                            border: filtroCarrito === null ? '2px solid #374151' : '1px solid #E5E7EB',
                                            background: filtroCarrito === null ? '#F9FAFB' : '#fff',
                                            fontWeight: filtroCarrito === null ? 700 : 500,
                                            fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                                            color: '#374151',
                                        }}
                                    >
                                        Todas
                                        <span style={{
                                            background: '#F3F4F6', padding: '1px 8px', borderRadius: '10px',
                                            fontSize: '0.7rem', fontWeight: 700, color: '#6B7280',
                                        }}>
                                            {totalItems}
                                        </span>
                                    </button>

                                    {Object.entries(carrito).map(([asoc, items]) => {
                                        const color = ASOCIACION_COLORS[asoc] || '#6B7280';
                                        const isActive = filtroCarrito === asoc;
                                        const shortName = asoc.replace('Asociación de ', '').replace(' (Particular)', '');
                                        return (
                                            <button
                                                key={asoc}
                                                onClick={() => setFiltroCarrito(isActive ? null : asoc)}
                                                style={{
                                                    display: 'flex', alignItems: 'center', gap: '6px',
                                                    padding: '6px 14px', borderRadius: '20px',
                                                    border: isActive ? `2px solid ${color}` : '1px solid #E5E7EB',
                                                    background: isActive ? `${color}10` : '#fff',
                                                    fontWeight: isActive ? 700 : 500,
                                                    fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.2s',
                                                    color: isActive ? color : '#6B7280',
                                                }}
                                            >
                                                <div style={{
                                                    width: '8px', height: '8px', borderRadius: '50%',
                                                    background: color, flexShrink: 0,
                                                }} />
                                                {shortName}
                                                <span style={{
                                                    background: isActive ? `${color}20` : '#F3F4F6',
                                                    padding: '1px 8px', borderRadius: '10px',
                                                    fontSize: '0.7rem', fontWeight: 700,
                                                    color: isActive ? color : '#9CA3AF',
                                                }}>
                                                    {items.length}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* ─── Carrito groups (filtered) ─── */}
                                {carritoEntries.length === 0 ? (
                                    <div style={{
                                        textAlign: 'center', padding: '40px 20px', color: '#9CA3AF',
                                        background: '#F9FAFB', borderRadius: '12px', border: '1px solid #E5E7EB',
                                    }}>
                                        <ShoppingCart size={32} strokeWidth={1.2} style={{ margin: '0 auto 8px', display: 'block' }} />
                                        <p style={{ fontSize: '0.82rem', margin: 0 }}>
                                            No hay expedientes de <strong>{filtroCarrito}</strong> en el carrito.
                                        </p>
                                    </div>
                                ) : (
                                    carritoEntries.map(([asociacion, items]) => {
                                        const color = ASOCIACION_COLORS[asociacion] || '#6B7280';
                                        return (
                                            <div key={asociacion} style={{
                                                background: '#fff', borderRadius: '12px',
                                                border: '1px solid #E5E7EB', overflow: 'hidden',
                                            }}>
                                                {/* Group Header */}
                                                <div style={{
                                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                    padding: '14px 18px',
                                                    background: `linear-gradient(135deg, ${color}08, ${color}15)`,
                                                    borderBottom: `2px solid ${color}30`,
                                                }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        <div style={{
                                                            width: '10px', height: '10px', borderRadius: '50%',
                                                            background: color,
                                                        }} />
                                                        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#1F2937' }}>
                                                            {asociacion}
                                                        </span>
                                                        <span style={{
                                                            padding: '2px 10px', borderRadius: '10px',
                                                            background: `${color}20`, color: color,
                                                            fontSize: '0.72rem', fontWeight: 700,
                                                        }}>
                                                            {items.length} expediente{items.length !== 1 ? 's' : ''}
                                                        </span>
                                                        {/* Date range badge */}
                                                        {items.length > 0 && (() => {
                                                            const fechas = items.map(i => i.fecha_realizacion).filter(Boolean).sort();
                                                            if (fechas.length === 0) return null;
                                                            const desde = fmtFecha(fechas[0]);
                                                            const hasta = fmtFecha(fechas[fechas.length - 1]);
                                                            return (
                                                                <span style={{
                                                                    fontSize: '0.7rem', color: '#6B7280',
                                                                    fontWeight: 500,
                                                                }}>
                                                                    {desde === hasta ? desde : `${desde} — ${hasta}`}
                                                                </span>
                                                            );
                                                        })()}
                                                    </div>

                                                    <button
                                                        onClick={() => setShowConstanciaModal(asociacion)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '6px',
                                                            padding: '8px 16px', borderRadius: '8px',
                                                            background: color, color: '#fff', border: 'none',
                                                            fontWeight: 700, fontSize: '0.78rem',
                                                            cursor: 'pointer', transition: 'all 0.2s',
                                                            boxShadow: `0 2px 8px ${color}40`,
                                                        }}
                                                    >
                                                        <Printer size={14} />
                                                        Generar Constancia
                                                    </button>
                                                </div>

                                                {/* Items Table */}
                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                    <thead>
                                                        <tr style={{ background: '#F9FAFB' }}>
                                                            <th style={thStyle}>Fecha</th>
                                                            <th style={thStyle}>Paciente</th>
                                                            <th style={thStyle}>DNI</th>
                                                            <th style={thStyle}>OS</th>
                                                            <th style={thStyle}>Cirugía</th>
                                                            <th style={thStyle}>Cirujano</th>
                                                            <th style={{ ...thStyle, width: '60px', textAlign: 'center' }}></th>
                                                        </tr>
                                                    </thead>
                                                    <tbody>
                                                        {items.map(c => (
                                                            <tr key={c.id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                                                                <td style={tdStyle}>
                                                                    {fmtFecha(c.fecha_realizacion)}
                                                                </td>
                                                                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.nombre_paciente}</td>
                                                                <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '0.76rem' }}>{c.dni || '—'}</td>
                                                                <td style={tdStyle}>{c.cliente || '—'}</td>
                                                                <td style={tdStyle}>{c.nombre_cirugia || '—'}</td>
                                                                <td style={tdStyle}>{c.cirujano || '—'}</td>
                                                                <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                                    <button
                                                                        onClick={() => handleQuitarDelCarrito(c.id)}
                                                                        title="Quitar del carrito"
                                                                        style={{
                                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                                            color: '#DC2626', padding: '4px',
                                                                            borderRadius: '4px', transition: 'background 0.2s',
                                                                        }}
                                                                        onMouseOver={e => e.currentTarget.style.background = '#FEE2E2'}
                                                                        onMouseOut={e => e.currentTarget.style.background = 'none'}
                                                                    >
                                                                        <X size={14} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        );
                    })()}
                </div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* TAB 3: Historial de Entregas            */}
            {/* ════════════════════════════════════════ */}
            {activeTab === 'historial' && (
                <div>
                    {constancias.length === 0 ? (
                        <div style={{
                            textAlign: 'center', padding: '60px 20px', color: '#9CA3AF',
                        }}>
                            <History size={48} strokeWidth={1.2} style={{ margin: '0 auto 12px', display: 'block' }} />
                            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#6B7280', margin: '0 0 4px' }}>
                                Sin entregas registradas
                            </h3>
                            <p style={{ fontSize: '0.82rem' }}>Las constancias de entrega aparecerán aquí.</p>
                        </div>
                    ) : (
                        <div style={{
                            background: '#fff', borderRadius: '12px',
                            border: '1px solid #E5E7EB', overflow: 'hidden',
                        }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#F9FAFB' }}>
                                        <th style={{ ...thStyle, width: '36px' }}></th>
                                        <th style={thStyle}>Código</th>
                                        <th style={thStyle}>Asociación</th>
                                        <th style={thStyle}>Fecha</th>
                                        <th style={thStyle}>Responsable</th>
                                        <th style={thStyle}>Cadete</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Expedientes</th>
                                        <th style={{ ...thStyle, textAlign: 'center', width: '100px' }}>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {constancias.map(cons => {
                                        const isExpanded = expandedConstancia === cons.id;
                                        const color = ASOCIACION_COLORS[cons.asociacion] || '#6B7280';
                                        const detalle = constanciaDetalle[cons.id];

                                        return (
                                            <>
                                                <tr
                                                    key={cons.id}
                                                    style={{
                                                        borderBottom: '1px solid #F3F4F6',
                                                        cursor: 'pointer',
                                                        transition: 'background 0.15s',
                                                    }}
                                                    onClick={() => handleExpandConstancia(cons.id)}
                                                    onMouseOver={e => e.currentTarget.style.background = '#FAFBFF'}
                                                    onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                                                >
                                                    <td style={{ ...tdStyle, textAlign: 'center', padding: '0 4px' }}>
                                                        {isExpanded
                                                            ? <ChevronDown size={16} style={{ color: '#4F46E5', transition: 'transform 0.2s' }} />
                                                            : <ChevronRight size={16} style={{ color: '#9CA3AF', transition: 'transform 0.2s' }} />
                                                        }
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            fontFamily: 'monospace', fontWeight: 700,
                                                            background: '#EEF2FF', color: '#4F46E5',
                                                            padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem',
                                                        }}>
                                                            {cons.codigo}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '2px 10px', borderRadius: '12px',
                                                            background: `${color}15`, color: color,
                                                            fontSize: '0.72rem', fontWeight: 600,
                                                        }}>
                                                            <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }} />
                                                            {cons.asociacion.replace('Asociación de ', '')}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        {fmtFecha(cons.fecha_entrega?.substring(0, 10))}
                                                    </td>
                                                    <td style={tdStyle}>{cons.responsable_entrega}</td>
                                                    <td style={tdStyle}>{cons.nombre_cadete || '—'}</td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                                                        {cons.cantidad_expedientes}
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                        {confirmRevertir === cons.id ? (
                                                            <div style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                padding: '4px 8px', borderRadius: '8px',
                                                                background: '#FEF2F2', border: '1px solid #FECACA',
                                                            }}>
                                                                <span style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                    ¿Revertir {cons.cantidad_expedientes} exp.?
                                                                </span>
                                                                <button
                                                                    onClick={() => handleRevertirConstancia(cons)}
                                                                    disabled={revertirLoading === cons.id}
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                                        padding: '3px 8px', fontSize: '0.7rem', fontWeight: 700,
                                                                        borderRadius: '5px', border: 'none',
                                                                        background: '#DC2626', color: '#fff',
                                                                        cursor: revertirLoading === cons.id ? 'wait' : 'pointer',
                                                                    }}
                                                                >
                                                                    {revertirLoading === cons.id
                                                                        ? <Loader2 size={10} style={{ animation: 'spin 1s linear infinite' }} />
                                                                        : <RotateCcw size={10} />
                                                                    }
                                                                    Sí, revertir
                                                                </button>
                                                                <button
                                                                    onClick={() => setConfirmRevertir(null)}
                                                                    style={{
                                                                        padding: '3px 8px', fontSize: '0.7rem', fontWeight: 600,
                                                                        borderRadius: '5px', border: '1px solid #FCA5A5',
                                                                        background: '#fff', color: '#6B7280', cursor: 'pointer',
                                                                    }}
                                                                >
                                                                    Cancelar
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                                <button
                                                                    onClick={() => handlePrintConstancia(cons, detalle)}
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                        padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                                                                        borderRadius: '6px', border: '1px solid #93C5FD',
                                                                        background: '#EFF6FF', color: '#2563EB',
                                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                                    }}
                                                                    onMouseOver={e => { e.currentTarget.style.background = '#DBEAFE'; }}
                                                                    onMouseOut={e => { e.currentTarget.style.background = '#EFF6FF'; }}
                                                                >
                                                                    <Printer size={12} /> Reimprimir
                                                                </button>
                                                                <button
                                                                    onClick={() => setConfirmRevertir(cons.id)}
                                                                    title="Revertir esta entrega — los expedientes vuelven al carrito"
                                                                    style={{
                                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                        padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                                                                        borderRadius: '6px', border: '1px solid #FCA5A5',
                                                                        background: '#FFF5F5', color: '#DC2626',
                                                                        cursor: 'pointer', transition: 'all 0.2s',
                                                                    }}
                                                                    onMouseOver={e => { e.currentTarget.style.background = '#FEE2E2'; }}
                                                                    onMouseOut={e => { e.currentTarget.style.background = '#FFF5F5'; }}
                                                                >
                                                                    <RotateCcw size={12} /> Revertir
                                                                </button>
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>

                                                {isExpanded && detalle && (
                                                    <tr key={`${cons.id}-detail`} className="animate-fade-in">
                                                        <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                                                            <div style={{
                                                                background: '#F9FAFB',
                                                                borderLeft: `3px solid ${color}`,
                                                                margin: '0 8px 8px 24px',
                                                                borderRadius: '0 8px 8px 0',
                                                                padding: '8px 0',
                                                            }}>
                                                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                    <thead>
                                                                        <tr>
                                                                            <th style={thSmall}>#</th>
                                                                            <th style={thSmall}>Fecha</th>
                                                                            <th style={thSmall}>Paciente</th>
                                                                            <th style={thSmall}>DNI</th>
                                                                            <th style={thSmall}>OS</th>
                                                                            <th style={thSmall}>Cirugía</th>
                                                                            <th style={thSmall}>Cirujano</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody>
                                                                        {detalle.map((item, idx) => (
                                                                            <tr key={item.id} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                                                <td style={{ ...tdSmall, textAlign: 'center', fontWeight: 700, color: '#9CA3AF' }}>{idx + 1}</td>
                                                                                <td style={tdSmall}>
                                                                                    {fmtFecha(item.fecha_realizacion)}
                                                                                </td>
                                                                                <td style={{ ...tdSmall, fontWeight: 600 }}>{item.nombre_paciente}</td>
                                                                                <td style={{ ...tdSmall, fontFamily: 'monospace' }}>{item.dni || '—'}</td>
                                                                                <td style={tdSmall}>{item.cliente || '—'}</td>
                                                                                <td style={tdSmall}>{item.nombre_cirugia || '—'}</td>
                                                                                <td style={tdSmall}>{item.cirujano || '—'}</td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* ════════════════════════════════════════ */}
            {/* MODAL: Generar Constancia                */}
            {/* ════════════════════════════════════════ */}
            {showConstanciaModal && (
                <ConstanciaModal
                    asociacion={showConstanciaModal}
                    items={carrito[showConstanciaModal] || []}
                    currentUser={currentUser}
                    onClose={() => setShowConstanciaModal(null)}
                    onGenerated={async (constanciaData) => {
                        setShowConstanciaModal(null);
                        addToast?.(`✅ Constancia ${constanciaData.codigo} generada`, 'success');
                        // Generate PDF immediately
                        const detalle = await fetchConstanciaDetalle(constanciaData.id);
                        handlePrintConstancia(constanciaData, detalle);
                        // Refresh tabs
                        loadCarrito();
                        loadPendientes();
                    }}
                    addToast={addToast}
                />
            )}
        </div>
    );
}

// ═══════════════════════════════
// Modal: Generar Constancia
// ═══════════════════════════════
function ConstanciaModal({ asociacion, items, currentUser, onClose, onGenerated, addToast }) {
    const [responsable, setResponsable] = useState('');
    const [nombreCadete, setNombreCadete] = useState('');
    const [notas, setNotas] = useState('');
    const [generating, setGenerating] = useState(false);

    // Load default responsible from localStorage or config
    useEffect(() => {
        const saved = localStorage.getItem('asociaciones_responsable');
        setResponsable(saved || currentUser?.nombre || 'Carlos');
    }, [currentUser]);

    const handleGenerar = async () => {
        if (!responsable.trim()) {
            addToast?.('Ingrese el nombre del responsable de entrega', 'error');
            return;
        }
        setGenerating(true);
        try {
            // Save default for next time
            localStorage.setItem('asociaciones_responsable', responsable);
            const constancia = await generarConstancia({
                asociacion,
                responsable: responsable.trim(),
                nombreCadete: nombreCadete.trim(),
                notas: notas.trim(),
            });
            onGenerated(constancia);
        } catch (err) {
            addToast?.('Error al generar constancia: ' + err.message, 'error');
        } finally {
            setGenerating(false);
        }
    };

    const color = ASOCIACION_COLORS[asociacion] || '#6366F1';

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.5)', zIndex: 999999,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
            <div style={{
                background: '#fff', borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                padding: '28px', width: '90%', maxWidth: '500px',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px',
                }}>
                    <div style={{
                        width: '40px', height: '40px', borderRadius: '10px',
                        background: `linear-gradient(135deg, ${color}, ${color}CC)`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        <Printer size={20} color="#fff" />
                    </div>
                    <div>
                        <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: '#1F2937' }}>
                            Generar Constancia de Entrega
                        </h3>
                        <p style={{ fontSize: '0.78rem', margin: 0, color: '#9CA3AF' }}>
                            {asociacion} • {items.length} expediente{items.length !== 1 ? 's' : ''}
                        </p>
                    </div>
                </div>

                {/* Form */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginBottom: '24px' }}>
                    <div>
                        <label style={labelStyle}>Responsable de entrega *</label>
                        <input
                            type="text"
                            value={responsable}
                            onChange={e => setResponsable(e.target.value)}
                            placeholder="Nombre completo"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Nombre del cadete que retira</label>
                        <input
                            type="text"
                            value={nombreCadete}
                            onChange={e => setNombreCadete(e.target.value)}
                            placeholder="Quién retira la documentación"
                            style={inputStyle}
                        />
                    </div>
                    <div>
                        <label style={labelStyle}>Observaciones</label>
                        <textarea
                            value={notas}
                            onChange={e => setNotas(e.target.value)}
                            placeholder="Notas opcionales..."
                            rows={2}
                            style={{ ...inputStyle, resize: 'vertical' }}
                        />
                    </div>
                </div>

                {/* Preview */}
                <div style={{
                    padding: '10px 14px', borderRadius: '8px',
                    background: '#F9FAFB', border: '1px solid #E5E7EB',
                    marginBottom: '20px', maxHeight: '150px', overflowY: 'auto',
                }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6B7280', marginBottom: '6px', textTransform: 'uppercase' }}>
                        Expedientes a incluir:
                    </div>
                    {items.map((item, idx) => (
                        <div key={item.id} style={{
                            fontSize: '0.76rem', color: '#374151', padding: '2px 0',
                            borderBottom: idx < items.length - 1 ? '1px solid #F3F4F6' : 'none',
                        }}>
                            <strong>{idx + 1}.</strong> {item.nombre_paciente} — {item.nombre_cirugia || 'Cirugía'}
                        </div>
                    ))}
                </div>

                {/* Actions */}
                <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                    <button
                        onClick={onClose}
                        disabled={generating}
                        style={{
                            padding: '10px 20px', borderRadius: '8px',
                            background: '#F3F4F6', border: 'none', color: '#6B7280',
                            fontWeight: 700, fontSize: '0.82rem', cursor: 'pointer',
                        }}
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={handleGenerar}
                        disabled={generating}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 24px', borderRadius: '8px',
                            background: generating ? '#9CA3AF' : `linear-gradient(135deg, ${color}, ${color}DD)`,
                            border: 'none', color: '#fff',
                            fontWeight: 700, fontSize: '0.82rem',
                            cursor: generating ? 'wait' : 'pointer',
                            boxShadow: `0 2px 8px ${color}40`,
                            transition: 'all 0.2s',
                        }}
                    >
                        {generating ? (
                            <>
                                <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                                Generando...
                            </>
                        ) : (
                            <>
                                <Printer size={14} />
                                Imprimir y Registrar
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Styles ───
const thStyle = {
    padding: '10px 12px', textAlign: 'left',
    fontSize: '0.72rem', fontWeight: 700, color: '#6B7280',
    textTransform: 'uppercase', letterSpacing: '0.04em',
    borderBottom: '2px solid #E5E7EB',
};

const tdStyle = {
    padding: '10px 12px', color: '#374151',
};

const thSmall = {
    padding: '4px 10px', fontSize: '0.68rem', fontWeight: 700,
    color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em',
    textAlign: 'left',
};

const tdSmall = {
    padding: '5px 10px', fontSize: '0.78rem', color: '#4B5563',
};

const labelStyle = {
    display: 'block', fontSize: '0.78rem', fontWeight: 700,
    color: '#374151', marginBottom: '4px',
};

const inputStyle = {
    width: '100%', padding: '10px 12px', borderRadius: '8px',
    border: '1px solid #D1D5DB', fontSize: '0.85rem',
    color: '#374151', outline: 'none',
    transition: 'border-color 0.2s',
};
