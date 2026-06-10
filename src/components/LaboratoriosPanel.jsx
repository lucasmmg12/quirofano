/**
 * LaboratoriosPanel.jsx — Panel de Anatomía Patológica con sistema de Carrito
 *
 * 3 Pestañas:
 *   1. Registro de Muestras — clasificación, módulos, enviar al carrito
 *   2. Carrito de Entrega — acumular multi-día, agrupar por lab, generar constancia
 *   3. Historial de Entregas — constancias generadas, reimprimir, revertir
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import {
    Microscope, Search, Filter, RefreshCw, Printer, FileText, Download,
    Link, ChevronDown, ChevronUp, ShoppingCart, History, Package,
    X, Loader2, RotateCcw, CheckCircle2, PackageCheck, Calendar,
    ChevronLeft, ChevronRight,
} from 'lucide-react';
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import ModulosQuantity from './ModulosQuantity';
import { SkeletonTable } from './SkeletonLoader';
import MuestrasEditor from './MuestrasEditor';
import { getEstadoFacturacion } from '../utils/facturacionRules';
import {
    fetchLabRecords,
    enviarAlCarritoLab,
    quitarDelCarritoLab,
    fetchCarritoLab,
    generarConstanciaLab,
    fetchConstanciasLab,
    fetchConstanciaDetalleLab,
    revertirConstanciaLab,
    LAB_COLORS,
    LAB_SHORT_NAMES,
    LAB_LIST,
} from '../services/laboratoriosCartService';

// ═══════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════
const thStyle = {
    padding: '10px 14px', fontSize: '0.72rem', fontWeight: 700,
    color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px',
    borderBottom: '2px solid #E2E8F0', background: '#F8FAFC',
    position: 'sticky', top: 0, zIndex: 1,
};
const tdStyle = {
    padding: '10px 14px', fontSize: '0.82rem', color: '#334155',
    borderBottom: '1px solid #F1F5F9', verticalAlign: 'middle',
};
const tdSmall = { padding: '6px 10px', fontSize: '0.78rem', color: '#475569' };
const thSmall = { ...thStyle, padding: '6px 10px', fontSize: '0.68rem' };

const fmtFecha = (d) => {
    if (!d) return '—';
    const dateStr = typeof d === 'string' && d.length === 10 ? d + 'T12:00:00' : d;
    const date = new Date(dateStr);
    return date.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

export default function LaboratoriosPanel({ addToast, currentUser }) {
    // ═══════════════════════════════════════
    // State
    // ═══════════════════════════════════════
    const [activeTab, setActiveTab] = useState('pendientes');
    const [loading, setLoading] = useState(true);

    // Pendientes state
    const [records, setRecords] = useState([]);
    const [deudasMap, setDeudasMap] = useState({});

    const fetchDeudasForRecords = useCallback(async (recordsList) => {
        const dnis = [...new Set(recordsList.filter(r => r.dni).map(r => r.dni))];
        if (dnis.length === 0) return;
        
        try {
            const { data, error } = await supabase
                .from('deudas_pacientes')
                .select('dni, deuda_total, categoria')
                .in('dni', dnis);
                
            if (error) throw error;
            
            const debtMap = {};
            const CATEGORIAS_DESCUENTO = ['sin_deuda_salus', 'descuento_liquidacion', 'deuda_cancelada'];
            
            (data || []).forEach(dp => {
                if (dp.dni && dp.deuda_total > 0 && !CATEGORIAS_DESCUENTO.includes(dp.categoria)) {
                    debtMap[dp.dni] = {
                        deuda_total: dp.deuda_total,
                        categoria: dp.categoria
                    };
                }
            });
            setDeudasMap(prev => ({ ...prev, ...debtMap }));
        } catch (e) {
            console.error('Error fetching deudas:', e);
        }
    }, []);

    const getPatientDebt = useCallback((pacienteDni) => {
        if (!pacienteDni) return null;
        const cleanInput = String(pacienteDni).replace(/\D/g, '');
        if (!cleanInput) return null;

        if (deudasMap[pacienteDni]) return deudasMap[pacienteDni];

        for (const key of Object.keys(deudasMap)) {
            if (String(key).replace(/\D/g, '') === cleanInput) {
                return deudasMap[key];
            }
        }
        return null;
    }, [deudasMap]);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterModulo, setFilterModulo] = useState('all');
    const [filterLaboratorio, setFilterLaboratorio] = useState('all');
    const [filterObraSocial, setFilterObraSocial] = useState('all');
    const [expandedRow, setExpandedRow] = useState(null);

    // Filtro por mes (default: null = todos los meses)
    const [selectedMonth, setSelectedMonth] = useState(null);

    // Carrito state
    const [carrito, setCarrito] = useState([]);
    const [carritoLoading, setCarritoLoading] = useState(false);
    const [filtroCarritoLab, setFiltroCarritoLab] = useState(null);

    // Historial state
    const [constancias, setConstancias] = useState([]);
    const [expandedConstancia, setExpandedConstancia] = useState(null);
    const [constanciaDetalle, setConstanciaDetalle] = useState({});
    const [confirmRevertir, setConfirmRevertir] = useState(null);
    const [revertirLoading, setRevertirLoading] = useState(null);

    // Entrega modal
    const [showEntregaModal, setShowEntregaModal] = useState(false);
    const [entregaLab, setEntregaLab] = useState('');
    const [entregaResponsable, setEntregaResponsable] = useState('');
    const [entregaCadete, setEntregaCadete] = useState('');
    const [entregaNotas, setEntregaNotas] = useState('');
    const [generandoConstancia, setGenerandoConstancia] = useState(false);

    // ═══════════════════════════════════════
    // Data loaders
    // ═══════════════════════════════════════
    const loadPendientes = useCallback(async () => {
        setLoading(true);
        try {
            let fromDate = null, toDate = null;
            if (selectedMonth) {
                fromDate = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-01`;
                const lastDay = new Date(selectedMonth.year, selectedMonth.month + 1, 0).getDate();
                toDate = `${selectedMonth.year}-${String(selectedMonth.month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
            }
            const data = await fetchLabRecords({ fromDate, toDate });

            // Enriquecer con coseguro desde hospital_pacientes
            const dnisNeedCoseguro = [...new Set(
                data.filter(r => !r.coseguro && r.dni).map(r => r.dni)
            )];
            if (dnisNeedCoseguro.length > 0) {
                const { data: pacientes } = await supabase
                    .from('hospital_pacientes')
                    .select('dni, coseguro')
                    .in('dni', dnisNeedCoseguro)
                    .not('coseguro', 'is', null);
                if (pacientes?.length > 0) {
                    const map = {};
                    pacientes.forEach(p => { map[p.dni] = p.coseguro; });
                    data.forEach(r => {
                        if (!r.coseguro && r.dni && map[r.dni]) r.coseguro = map[r.dni];
                    });
                }
            }
            setRecords(data);
            await fetchDeudasForRecords(data);
        } catch (err) {
            console.error('Error loading records:', err);
            addToast?.('Error al cargar registros', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, selectedMonth, fetchDeudasForRecords]);

    const loadCarrito = useCallback(async () => {
        setCarritoLoading(true);
        try {
            const data = await fetchCarritoLab();
            setCarrito(data);
            await fetchDeudasForRecords(data);
        } catch (err) {
            addToast?.('Error al cargar carrito', 'error');
        } finally {
            setCarritoLoading(false);
        }
    }, [addToast, fetchDeudasForRecords]);

    const loadHistorial = useCallback(async () => {
        try {
            const data = await fetchConstanciasLab();
            setConstancias(data);
        } catch (err) {
            addToast?.('Error al cargar historial', 'error');
        }
    }, [addToast]);

    useEffect(() => {
        loadPendientes();
        loadCarrito();
        loadHistorial();
    }, [loadPendientes, loadCarrito, loadHistorial]);

    // ═══════════════════════════════════════
    // Derived
    // ═══════════════════════════════════════
    const laboratoriosUnicos = useMemo(() => {
        const unique = new Set(records.map(r => r.laboratorio).filter(Boolean));
        return Array.from(unique).sort();
    }, [records]);

    const obrasSocialesUnicas = useMemo(() => {
        const unique = new Set(records.map(r => r.cliente).filter(Boolean));
        return Array.from(unique).sort();
    }, [records]);

    const filteredRecords = useMemo(() => {
        return records.filter(r => {
            const matchSearch = searchTerm === '' ||
                (r.paciente?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (r.dni?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (r.n_admision?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
                (r.laboratorio?.toLowerCase() || '').includes(searchTerm.toLowerCase());
            const isAssigned = r.modulo_a_qty > 0 || r.modulo_b_qty > 0 || r.modulo_c_qty > 0 || r.modulo_asignado;
            const matchFilter = filterModulo === 'all' ||
                (filterModulo === 'unassigned' && !isAssigned) ||
                (filterModulo === 'assigned' && isAssigned) ||
                r.modulo_asignado === filterModulo;
            const matchLab = filterLaboratorio === 'all' || r.laboratorio === filterLaboratorio;
            const matchOS = filterObraSocial === 'all' || r.cliente === filterObraSocial;
            return matchSearch && matchFilter && matchLab && matchOS;
        });
    }, [records, searchTerm, filterModulo, filterLaboratorio, filterObraSocial]);

    // Carrito stats
    const carritoStats = useMemo(() => {
        const byLab = {};
        const fechas = new Set();
        carrito.forEach(item => {
            const lab = item.laboratorio || 'Sin lab';
            if (!byLab[lab]) byLab[lab] = [];
            byLab[lab].push(item);
            if (item.fecha_visita) fechas.add(item.fecha_visita.substring(0, 10));
        });
        return { total: carrito.length, byLab, labs: Object.keys(byLab), diasDistintos: fechas.size };
    }, [carrito]);

    const carritoFiltrado = useMemo(() => {
        if (!filtroCarritoLab) return carrito;
        return carrito.filter(i => i.laboratorio === filtroCarritoLab);
    }, [carrito, filtroCarritoLab]);

    // ═══════════════════════════════════════
    // Handlers — Módulos (existing)
    // ═══════════════════════════════════════
    const handleAssignModulo = async (id_visita, modA, modB, modC) => {
        const timestamp = new Date().toISOString();
        const username = currentUser?.nombre || 'Desconocido';
        try {
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update({
                    modulo_a_qty: modA, modulo_b_qty: modB, modulo_c_qty: modC,
                    modulo_asignado: null, clasificado_at: timestamp, clasificado_por: username,
                })
                .eq('id_visita', id_visita);
            if (error) throw error;
            setRecords(prev => prev.map(r =>
                r.id_visita === id_visita
                    ? { ...r, modulo_a_qty: modA, modulo_b_qty: modB, modulo_c_qty: modC, modulo_asignado: null, clasificado_at: timestamp, clasificado_por: username }
                    : r
            ));
            addToast('Módulo actualizado', 'success');
        } catch (err) {
            addToast('Error al asignar módulo', 'error');
        }
    };

    const handleAssignMuestras = async (id_visita, updates) => {
        try {
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update(updates)
                .eq('id_visita', id_visita);
            if (error) throw error;
            setRecords(prev => prev.map(r =>
                r.id_visita === id_visita ? { ...r, ...updates } : r
            ));
            addToast('Muestras actualizadas', 'success');
        } catch (err) {
            addToast('Error al actualizar muestras', 'error');
        }
    };

    const handleDeleteModulo = async (id_visita) => {
        try {
            const { error } = await supabase
                .from('laboratorios_anatomia_patologica')
                .update({
                    modulo_a_qty: 0, modulo_b_qty: 0, modulo_c_qty: 0,
                    modulo_asignado: null, clasificado_at: null, clasificado_por: null,
                })
                .eq('id_visita', id_visita);
            if (error) throw error;
            setRecords(prev => prev.map(r =>
                r.id_visita === id_visita
                    ? { ...r, modulo_a_qty: 0, modulo_b_qty: 0, modulo_c_qty: 0, modulo_asignado: null, clasificado_at: null, clasificado_por: null }
                    : r
            ));
            addToast('Módulo eliminado', 'success');
        } catch (err) {
            addToast('Error al eliminar módulo', 'error');
        }
    };

    // ═══════════════════════════════════════
    // Handlers — Carrito
    // ═══════════════════════════════════════
    const handleEnviarAlCarrito = async (record) => {
        // Optimista: quitar de pendientes y agregar al carrito sin recargar
        setRecords(prev => prev.filter(r => r.id_visita !== record.id_visita));
        setCarrito(prev => [...prev, { ...record, en_carrito: true }]);
        try {
            await enviarAlCarritoLab(record.id_visita);
            addToast?.(`🛒 ${record.paciente} enviado al carrito`, 'success');
        } catch (err) {
            // Rollback en caso de error
            setRecords(prev => [...prev, record]);
            setCarrito(prev => prev.filter(r => r.id_visita !== record.id_visita));
            addToast?.('Error al enviar al carrito', 'error');
        }
    };

    const handleQuitarDelCarrito = async (record) => {
        // Optimista: quitar del carrito y devolver a pendientes sin recargar
        setCarrito(prev => prev.filter(r => r.id_visita !== record.id_visita));
        setRecords(prev => [{ ...record, en_carrito: false }, ...prev]);
        try {
            await quitarDelCarritoLab(record.id_visita);
            addToast?.(`↩️ ${record.paciente} devuelto a pendientes`, 'success');
        } catch (err) {
            // Rollback
            setCarrito(prev => [...prev, record]);
            setRecords(prev => prev.filter(r => r.id_visita !== record.id_visita));
            addToast?.('Error al quitar del carrito', 'error');
        }
    };


    const handleAbrirEntrega = (lab) => {
        setEntregaLab(lab);
        setEntregaResponsable(currentUser?.nombre || '');
        setEntregaCadete('');
        setEntregaNotas('');
        setShowEntregaModal(true);
    };

    const handleGenerarConstancia = async () => {
        if (!entregaResponsable.trim()) {
            addToast?.('Ingrese el responsable de entrega', 'error');
            return;
        }
        setGenerandoConstancia(true);
        try {
            const items = carritoStats.byLab[entregaLab] || [];
            const constancia = await generarConstanciaLab({
                laboratorio: entregaLab,
                items,
                responsable: entregaResponsable.trim(),
                nombreCadete: entregaCadete.trim() || null,
                notas: entregaNotas.trim() || null,
            });
            addToast?.(`✅ Constancia ${constancia.codigo} generada (${items.length} registros)`, 'success');
            setShowEntregaModal(false);
            // Auto-print
            await handlePrintConstancia(constancia, items);
            await Promise.all([loadCarrito(), loadHistorial(), loadPendientes()]);
        } catch (err) {
            addToast?.('Error al generar constancia: ' + err.message, 'error');
        } finally {
            setGenerandoConstancia(false);
        }
    };

    // ═══════════════════════════════════════
    // Handlers — Historial
    // ═══════════════════════════════════════
    const handleExpandConstancia = async (constanciaId) => {
        if (expandedConstancia === constanciaId) {
            setExpandedConstancia(null);
            return;
        }
        setExpandedConstancia(constanciaId);
        if (!constanciaDetalle[constanciaId]) {
            try {
                const detalle = await fetchConstanciaDetalleLab(constanciaId);
                setConstanciaDetalle(prev => ({ ...prev, [constanciaId]: detalle }));
            } catch (err) {
                addToast?.('Error al cargar detalle', 'error');
            }
        }
    };

    const handleRevertirConstancia = async (cons) => {
        setRevertirLoading(cons.id);
        try {
            await revertirConstanciaLab(cons.id);
            addToast?.(
                `↩️ Constancia ${cons.codigo} revertida — ${cons.cantidad_registros} registro(s) volvieron al carrito`,
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
                printItems = await fetchConstanciaDetalleLab(constancia.id);
            }

            const { default: jsPDF } = await import('jspdf');
            const { default: autoTable } = await import('jspdf-autotable');
            const doc = new jsPDF();
            const pageW = doc.internal.pageSize.getWidth();
            const pageH = doc.internal.pageSize.getHeight();
            const margin = 14;
            const colW = pageW - margin * 2;
            let y = 0;

            // Load logo
            let logoCircleBase64 = null;
            try {
                const logoImg = new Image();
                logoImg.crossOrigin = 'anonymous';
                logoImg.src = '/logosanatorio.png';
                await new Promise((resolve, reject) => {
                    logoImg.onload = resolve;
                    logoImg.onerror = reject;
                });
                const canvasSize = 200;
                const canvas = document.createElement('canvas');
                canvas.width = canvasSize;
                canvas.height = canvasSize;
                const ctx = canvas.getContext('2d');
                ctx.beginPath();
                ctx.arc(canvasSize / 2, canvasSize / 2, canvasSize / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(logoImg, 0, 0, canvasSize, canvasSize);
                logoCircleBase64 = canvas.toDataURL('image/png');
            } catch (e) { /* logo optional */ }

            // ═══════ HEADER — Barra institucional ═══════
            doc.setFillColor(13, 59, 102); // #0D3B66
            doc.rect(0, 0, pageW, 34, 'F');

            const logoX = margin + 1;
            const logoY = 10;
            const logoSize = 14;
            if (logoCircleBase64) {
                doc.setFillColor(255, 255, 255);
                doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 1.2, 'F');
                doc.addImage(logoCircleBase64, 'PNG', logoX, logoY, logoSize, logoSize);
            } else {
                doc.setFillColor(255, 255, 255);
                doc.circle(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2, 'F');
                doc.setFontSize(6);
                doc.setTextColor(13, 59, 102);
                doc.text('SA', logoX + 3.5, logoY + logoSize / 2 + 1.5);
            }

            doc.setFontSize(16);
            doc.setTextColor(255, 255, 255);
            doc.setFont('helvetica', 'bold');
            doc.text('SANATORIO ARGENTINO', margin + 18, 14);

            doc.setFontSize(9);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 200, 220);
            doc.text('Administración · Anatomía Patológica', margin + 18, 21);

            doc.setFontSize(11);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(255, 255, 255);
            doc.text('CONSTANCIA DE ENTREGA', pageW - margin, 14, { align: 'right' });
            doc.setFontSize(8);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(180, 200, 220);
            doc.text('Sistema ADM-QUI', pageW - margin, 21, { align: 'right' });

            // Accent line
            doc.setFillColor(30, 90, 142); // Institutional blue accent
            doc.rect(0, 34, pageW, 2, 'F');
            y = 44;

            // ═══════ INFO BAR ═══════
            const labShort = LAB_SHORT_NAMES[constancia.laboratorio] || constancia.laboratorio;
            const fechaHora = new Date(constancia.fecha_entrega).toLocaleString('es-AR', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit',
            });

            doc.setFillColor(241, 245, 249);
            doc.roundedRect(margin, y, colW, 18, 3, 3, 'F');
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(margin, y, colW, 18, 3, 3, 'S');

            const infoItems = [
                { label: 'CÓDIGO', value: constancia.codigo },
                { label: 'FECHA Y HORA', value: fechaHora },
                { label: 'LABORATORIO', value: labShort },
                { label: 'REGISTROS', value: String(printItems.length) },
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

            // ═══════ SECTION TITLE ═══════
            doc.setFillColor(13, 59, 102);
            doc.rect(margin, y, 3, 7, 'F');
            doc.setFontSize(10);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(13, 59, 102);
            doc.text('DETALLE DE MUESTRAS ENTREGADAS', margin + 6, y + 5.5);
            y += 12;

            // ═══════ TABLE ═══════
            const tableBody = printItems.map((item, idx) => {
                const fecha = item.fecha_visita
                    ? new Date(item.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
                    : '—';
                let biopsias = [];
                if (item.biopsia_congelacion && item.biopsia_congelacion !== 'NO') biopsias.push(`C: ${item.biopsia_congelacion}`);
                if (item.biopsia_simple || item.material_biopsia_simple) biopsias.push(`S: ${item.biopsia_simple || '—'}`);
                if (item.biopsia_ampliada || item.material_biopsia_ampliada) biopsias.push(`A: ${item.biopsia_ampliada || '—'}`);
                let modText = [];
                if (item.modulo_a_qty > 0) modText.push(`A:${item.modulo_a_qty}`);
                if (item.modulo_b_qty > 0) modText.push(`B:${item.modulo_b_qty}`);
                if (item.modulo_c_qty > 0) modText.push(`C:${item.modulo_c_qty}`);
                return [
                    String(idx + 1),
                    item.n_admision || '—',
                    fecha,
                    item.paciente || '—',
                    item.dni || '—',
                    item.cliente || '—',
                    biopsias.join(', ') || '—',
                    modText.join(', ') || '—',
                ];
            });

            autoTable(doc, {
                startY: y,
                head: [['#', 'N° Adm', 'Fecha', 'Paciente', 'DNI', 'Obra Social', 'Biopsias', 'Módulo']],
                body: tableBody,
                theme: 'grid',
                headStyles: {
                    fillColor: [13, 59, 102],
                    textColor: [255, 255, 255],
                    fontSize: 7.5, fontStyle: 'bold', halign: 'left', cellPadding: 3,
                },
                bodyStyles: { fontSize: 7.5, cellPadding: 2.5, textColor: [30, 30, 30] },
                alternateRowStyles: { fillColor: [248, 250, 252] },
                columnStyles: {
                    0: { cellWidth: 8, halign: 'center', fontStyle: 'bold', textColor: [148, 163, 184] },
                    1: { cellWidth: 18, font: 'courier' },
                    2: { cellWidth: 16 },
                    3: { fontStyle: 'bold', cellWidth: 32 },
                    4: { cellWidth: 20, font: 'courier' },
                    5: { cellWidth: 28 },
                    6: { cellWidth: 36 },
                    7: { cellWidth: 24 },
                },
                margin: { left: margin, right: margin },
                didDrawPage: () => {
                    doc.setFillColor(13, 59, 102);
                    doc.rect(0, 0, pageW, 8, 'F');
                    doc.setFillColor(30, 90, 142);
                    doc.rect(0, 8, pageW, 1, 'F');
                },
            });

            y = doc.lastAutoTable.finalY + 6;

            // ═══════ OBSERVACIONES ═══════
            if (constancia.notas) {
                doc.setFillColor(255, 251, 235);
                doc.setDrawColor(253, 230, 138);
                doc.roundedRect(margin, y, colW, 14, 2, 2, 'FD');
                doc.setFontSize(7.5);
                doc.setFont('helvetica', 'bold');
                doc.setTextColor(146, 64, 14);
                doc.text('OBSERVACIONES:', margin + 4, y + 5);
                doc.setFont('helvetica', 'normal');
                doc.text((constancia.notas || '').substring(0, 120), margin + 32, y + 5);
                y += 18;
            }

            // ═══════ FIRMAS ═══════
            if (y > pageH - 65) { doc.addPage(); y = 20; }
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
            doc.text(labShort, sig2X + sigBoxW / 2, y + 40, { align: 'center' });

            // ═══════ FOOTER — Todas las páginas ═══════
            const totalPages = doc.internal.getNumberOfPages();
            for (let p = 1; p <= totalPages; p++) {
                doc.setPage(p);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.line(margin, pageH - 12, pageW - margin, pageH - 12);
                doc.setFontSize(6.5);
                doc.setFont('helvetica', 'normal');
                doc.setTextColor(170, 170, 170);
                doc.text(
                    'Esta constancia acredita la entrega de muestras de anatomía patológica. Conserve como comprobante.',
                    margin, pageH - 8
                );
                doc.text(
                    `Sistema ADM-QUI — Sanatorio Argentino · Pág. ${p}/${totalPages}`,
                    pageW - margin, pageH - 8, { align: 'right' }
                );
            }

            // ═══════ SAVE ═══════
            const fileName = `Constancia_${constancia.codigo}_${labShort.replace(/\s+/g, '_')}.pdf`;
            doc.save(fileName);
            addToast?.(`📄 PDF "${fileName}" descargado`, 'success');
        } catch (err) {
            console.error('Error generating PDF:', err);
            addToast?.('Error al generar PDF: ' + err.message, 'error');
        }
    };


    // ═══════════════════════════════════════
    // Export helpers (replicated from original)
    // ═══════════════════════════════════════
    const exportToPDF = () => {
        const doc = new jsPDF();
        doc.setFontSize(16);
        doc.text('Reporte de Anatomía Patológica', 14, 20);
        doc.setFontSize(10);
        doc.text(`Filtros: Lab: ${filterLaboratorio !== 'all' ? filterLaboratorio : 'Todos'} | Modulo: ${filterModulo !== 'all' ? filterModulo : 'Todos'}`, 14, 28);

        const tableColumn = ["Fecha", "N° Adm", "Paciente", "DNI", "Obra Social", "Coseguro", "Lab", "Biopsias", "Módulo", "Acción"];
        const tableRows = filteredRecords.map(r => {
            let biopsias = [];
            if (r.biopsia_congelacion && r.biopsia_congelacion !== 'NO') biopsias.push(`C: ${r.biopsia_congelacion}`);
            if (r.biopsia_simple || r.material_biopsia_simple) biopsias.push(`S: ${r.biopsia_simple || '—'}`);
            if (r.biopsia_ampliada || r.material_biopsia_ampliada) biopsias.push(`A: ${r.biopsia_ampliada || '—'}`);
            let modText = [];
            if (r.modulo_a_qty > 0) modText.push(`A: ${r.modulo_a_qty}`);
            if (r.modulo_b_qty > 0) modText.push(`B: ${r.modulo_b_qty}`);
            if (r.modulo_c_qty > 0) modText.push(`C: ${r.modulo_c_qty}`);
            return [
                r.fecha_visita ? new Date(r.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR') : '-',
                r.n_admision || '-',
                r.paciente || 'S/D', r.dni || 'S/D', r.cliente || '-', r.coseguro || '-',
                r.laboratorio || '-', biopsias.join('\n') || '-',
                modText.length > 0 ? modText.join(', ') : (r.modulo_asignado || 'Sin asignar'),
                getEstadoFacturacion(r.cliente, r.laboratorio),
            ];
        });
        doc.autoTable({ head: [tableColumn], body: tableRows, startY: 35, theme: 'striped', headStyles: { fillColor: [13, 59, 102] } });
        doc.save(`Patologica_${new Date().toISOString().slice(0, 10)}.pdf`);
    };

    const exportToExcel = () => {
        const worksheetData = filteredRecords.map(r => {
            let biopsias = [];
            if (r.biopsia_congelacion && r.biopsia_congelacion !== 'NO') biopsias.push(`C: ${r.biopsia_congelacion}`);
            if (r.biopsia_simple || r.material_biopsia_simple) biopsias.push(`S: ${r.biopsia_simple || '—'}`);
            if (r.biopsia_ampliada || r.material_biopsia_ampliada) biopsias.push(`A: ${r.biopsia_ampliada || '—'}`);
            let modText = [];
            if (r.modulo_a_qty > 0) modText.push(`A: ${r.modulo_a_qty}`);
            if (r.modulo_b_qty > 0) modText.push(`B: ${r.modulo_b_qty}`);
            if (r.modulo_c_qty > 0) modText.push(`C: ${r.modulo_c_qty}`);
            return {
                Fecha: r.fecha_visita ? new Date(r.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR') : '',
                'N° Admision': r.n_admision || '',
                Paciente: r.paciente || '', DNI: r.dni || '', ObraSocial: r.cliente || '',
                Coseguro: r.coseguro || '', Laboratorio: r.laboratorio || '',
                Muestras: biopsias.join(' | '),
                Modulo: modText.length > 0 ? modText.join(', ') : (r.modulo_asignado || ''),
                Facturacion: getEstadoFacturacion(r.cliente, r.laboratorio),
            };
        });
        const ws = XLSX.utils.json_to_sheet(worksheetData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Patologica");
        XLSX.writeFile(wb, `Patologica_${new Date().toISOString().slice(0, 10)}.xlsx`);
    };

    const copyPublicLinkLab = (labString, toastName) => {
        const slugMap = {
            'LDA - Dra. Aguero o Dra Rios': 'aguero',
            'LAB. CEDAP': 'cedap',
            'LAB.INST.PATOLOG.CUYO': 'cuyo',
        };
        const slug = slugMap[labString] || btoa(encodeURIComponent(labString));
        const url = `${window.location.origin}/lab/${slug}`;
        navigator.clipboard.writeText(url);
        addToast(`Enlace de ${toastName} copiado!`, 'success');
    };

    // ═══════════════════════════════════════
    // TABS config
    // ═══════════════════════════════════════
    const tabs = [
        { id: 'pendientes', label: 'Muestras', icon: Microscope, count: filteredRecords.length },
        { id: 'carrito', label: 'Carrito', icon: ShoppingCart, count: carrito.length },
        { id: 'historial', label: 'Historial', icon: History, count: constancias.length },
    ];

    // ═══════════════════════════════════════
    // Render
    // ═══════════════════════════════════════
    return (
        <div className="content animate-fade-in" style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                <div>
                    <h2 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--neutral-800)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Microscope size={24} style={{ color: '#0D3B66' }} />
                        Anatomía Patológica
                    </h2>
                    <p style={{ margin: '4px 0 0', color: 'var(--neutral-500)', fontSize: '0.9rem' }}>
                        Clasificación de muestras y entrega a laboratorios
                    </p>
                </div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                    {/* Navegación por mes */}
                    <div style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '4px 8px', borderRadius: '10px',
                        background: '#F8FAFC', border: '1px solid #E2E8F0',
                    }}>
                        <button onClick={() => setSelectedMonth(p => {
                            const base = p || { year: new Date().getFullYear(), month: new Date().getMonth() };
                            const d = new Date(base.year, base.month - 1, 1);
                            return { year: d.getFullYear(), month: d.getMonth() };
                        })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', color: '#64748B' }}
                            title="Mes anterior">
                            <ChevronLeft size={16} />
                        </button>
                        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0D3B66', minWidth: '120px', textAlign: 'center', textTransform: 'capitalize' }}>
                            {selectedMonth
                                ? new Date(selectedMonth.year, selectedMonth.month).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })
                                : 'Todos los meses'}
                        </span>
                        <button onClick={() => setSelectedMonth(p => {
                            const base = p || { year: new Date().getFullYear(), month: new Date().getMonth() };
                            const d = new Date(base.year, base.month + 1, 1);
                            return { year: d.getFullYear(), month: d.getMonth() };
                        })} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', borderRadius: '6px', display: 'flex', color: '#64748B' }}
                            title="Mes siguiente">
                            <ChevronRight size={16} />
                        </button>
                        <button onClick={() => {
                            const now = new Date();
                            setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
                        }} style={{ fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px', background: '#EFF6FF', color: '#2563EB', border: '1px solid #93C5FD50', cursor: 'pointer' }}
                            title="Ir al mes actual">
                            Hoy
                        </button>
                        <button onClick={() => setSelectedMonth(null)} style={{
                            fontSize: '0.68rem', fontWeight: 600, padding: '2px 8px', borderRadius: '6px',
                            background: !selectedMonth ? '#ECFDF5' : '#F8FAFC',
                            color: !selectedMonth ? '#059669' : '#64748B',
                            border: `1px solid ${!selectedMonth ? '#05966950' : '#E2E8F0'}`,
                            cursor: 'pointer',
                        }}
                            title="Ver todos los meses">
                            Todos
                        </button>
                    </div>
                    <button onClick={() => copyPublicLinkLab('LDA - Dra. Aguero o Dra Rios', 'Agüero')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#EBF5FF', color: '#0D3B66', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #B5D3E8', cursor: 'pointer' }}>
                        <Link size={14} /> Agüero
                    </button>
                    <button onClick={() => copyPublicLinkLab('LAB. CEDAP', 'CEDAP')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#EBF5FF', color: '#0D3B66', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #B5D3E8', cursor: 'pointer' }}>
                        <Link size={14} /> CEDAP
                    </button>
                    <button onClick={() => copyPublicLinkLab('LAB.INST.PATOLOG.CUYO', 'Cuyo')} style={{ padding: '6px 12px', borderRadius: '8px', background: '#EBF5FF', color: '#0D3B66', fontWeight: 600, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #B5D3E8', cursor: 'pointer' }}>
                        <Link size={14} /> Cuyo
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div style={{
                display: 'flex', gap: '0', marginBottom: '0',
                borderBottom: '2px solid #E2E8F0', background: '#fff',
                borderRadius: '12px 12px 0 0', overflow: 'hidden',
            }}>
                {tabs.map(tab => {
                    const Icon = tab.icon;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            style={{
                                flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                padding: '14px 20px', fontSize: '0.88rem', fontWeight: isActive ? 700 : 500,
                                color: isActive ? '#0D3B66' : '#64748B',
                                background: isActive ? '#EBF5FF' : 'transparent',
                                border: 'none', borderBottom: isActive ? '3px solid #1E5A8E' : '3px solid transparent',
                                cursor: 'pointer', transition: 'all 0.2s',
                            }}
                        >
                            <Icon size={18} />
                            {tab.label}
                            {tab.count > 0 && (
                                <span style={{
                                    background: isActive ? '#0D3B66' : '#E2E8F0',
                                    color: isActive ? '#fff' : '#64748B',
                                    padding: '1px 8px', borderRadius: '10px',
                                    fontSize: '0.72rem', fontWeight: 700, minWidth: '20px', textAlign: 'center',
                                }}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content container */}
            <div style={{
                background: '#fff', borderRadius: '0 0 12px 12px',
                border: '1px solid var(--neutral-200)', borderTop: 'none',
                boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)', overflow: 'hidden',
            }}>

                {/* ═══════════════════════════════════════════════════════ */}
                {/* TAB 1: PENDIENTES (Muestras) */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'pendientes' && (
                    <>
                        {/* Toolbar */}
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid var(--neutral-100)',
                            display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', background: '#F8FAFC',
                        }}>
                            <div style={{ position: 'relative', flex: 1, minWidth: '250px' }}>
                                <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--neutral-400)' }} />
                                <input
                                    type="text" placeholder="Buscar paciente, DNI o lab..."
                                    value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', outline: 'none' }}
                                />
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Filter size={16} style={{ color: 'var(--neutral-400)' }} />
                                <select value={filterLaboratorio} onChange={e => setFilterLaboratorio(e.target.value)}
                                    style={{ padding: '10px 32px 10px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', background: '#fff', cursor: 'pointer', outline: 'none' }}>
                                    <option value="all">Todos los Laboratorios</option>
                                    {laboratoriosUnicos.map(l => <option key={l} value={l}>{l}</option>)}
                                </select>
                                <select value={filterObraSocial} onChange={e => setFilterObraSocial(e.target.value)}
                                    style={{ padding: '10px 32px 10px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', background: '#fff', cursor: 'pointer', outline: 'none' }}>
                                    <option value="all">Todas las O.S.</option>
                                    {obrasSocialesUnicas.map(os => <option key={os} value={os}>{os}</option>)}
                                </select>
                                <select value={filterModulo} onChange={e => setFilterModulo(e.target.value)}
                                    style={{ padding: '10px 32px 10px 12px', borderRadius: '8px', border: '1px solid var(--neutral-200)', fontSize: '0.85rem', background: '#fff', cursor: 'pointer', outline: 'none' }}>
                                    <option value="all">Todos</option>
                                    <option value="unassigned">Sin Asignar</option>
                                    <option value="assigned">Ya Asignados</option>
                                </select>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                                <button onClick={exportToPDF} style={{ padding: '8px 14px', borderRadius: '8px', background: '#FEE2E2', color: '#DC2626', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #FECACA', cursor: 'pointer' }}>
                                    <FileText size={15} /> PDF
                                </button>
                                <button onClick={exportToExcel} style={{ padding: '8px 14px', borderRadius: '8px', background: '#DCFCE7', color: '#16A34A', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid #BBF7D0', cursor: 'pointer' }}>
                                    <Download size={15} /> Excel
                                </button>
                                <button onClick={() => { loadPendientes(); loadCarrito(); }} disabled={loading}
                                    style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--neutral-200)', background: '#fff', color: 'var(--neutral-600)', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', opacity: loading ? 0.7 : 1 }}>
                                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
                                </button>
                            </div>
                        </div>

                        {/* Table */}
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: '900px' }}>
                                <thead>
                                    <tr>
                                        <th style={thStyle}>Fecha</th>
                                        <th style={thStyle}>N° Adm</th>
                                        <th style={thStyle}>Paciente</th>
                                        <th style={thStyle}>OS</th>
                                        <th style={thStyle}>Coseguro</th>
                                        <th style={thStyle}>Laboratorio</th>
                                        <th style={thStyle}>Biopsias</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Módulo</th>
                                        <th style={{ ...thStyle, textAlign: 'center' }}>Acción</th>
                                        <th style={{ ...thStyle, textAlign: 'center', width: '100px' }}>Carrito</th>
                                        <th style={{ ...thStyle, width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {loading ? (
                                        <tr><td colSpan={11}><SkeletonTable rows={8} cols={11} /></td></tr>
                                    ) : filteredRecords.length === 0 ? (
                                        <tr><td colSpan={11} style={{ padding: '32px', textAlign: 'center', color: 'var(--neutral-400)' }}>
                                            Ningún registro coincide con los filtros.
                                        </td></tr>
                                    ) : filteredRecords.map(r => {
                                        const estadoAccion = getEstadoFacturacion(r.cliente, r.laboratorio);
                                        const isExpanded = expandedRow === r.id_visita;

                                        return (
                                            <React.Fragment key={r.id_visita}>
                                                <tr
                                                    style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--neutral-100)', cursor: 'pointer', background: isExpanded ? '#F8FAFC' : 'transparent', transition: 'background 0.2s' }}
                                                    onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = '#F8FAFC'; }}
                                                    onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                                    onClick={() => setExpandedRow(isExpanded ? null : r.id_visita)}
                                                >
                                                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                                        {r.fecha_visita && new Date(r.fecha_visita + 'T12:00:00').toLocaleDateString('es-AR')}
                                                    </td>
                                                    <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>
                                                        <span style={{
                                                            background: r.n_admision ? '#EFF6FF' : 'transparent',
                                                            color: r.n_admision ? '#1E40AF' : '#94A3B8',
                                                            padding: r.n_admision ? '2px 8px' : '0',
                                                            borderRadius: '6px',
                                                            fontSize: '0.78rem',
                                                            fontWeight: 600,
                                                            fontFamily: 'monospace',
                                                            border: r.n_admision ? '1px solid #BFDBFE' : 'none',
                                                        }}>
                                                            {r.n_admision || '—'}
                                                        </span>
                                                    </td>
                                                    <td style={tdStyle}>
                                                        <div style={{ fontWeight: 600, color: 'var(--neutral-800)', fontSize: '0.85rem' }}>{r.paciente}</div>
                                                        <div style={{ fontSize: '0.73rem', color: 'var(--neutral-400)' }}>DNI: {r.dni || 'S/D'}</div>
                                                        {(() => {
                                                            const debt = getPatientDebt(r.dni);
                                                            if (debt) {
                                                                return (
                                                                    <div style={{
                                                                        display: 'inline-flex',
                                                                        alignItems: 'center',
                                                                        gap: '4px',
                                                                        background: '#FEF2F2',
                                                                        color: '#DC2626',
                                                                        border: '1px solid #FCA5A5',
                                                                        borderRadius: '6px',
                                                                        padding: '1px 6px',
                                                                        fontSize: '0.7rem',
                                                                        fontWeight: 700,
                                                                        marginTop: '3px',
                                                                        width: 'fit-content'
                                                                    }}>
                                                                        ⚠️ Deuda: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(debt.deuda_total)}
                                                                    </div>
                                                                );
                                                            }
                                                            return null;
                                                        })()}
                                                    </td>
                                                    <td style={{ ...tdStyle, maxWidth: '180px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.cliente}>
                                                        {r.cliente || '-'}
                                                    </td>
                                                    <td style={tdStyle}>{r.coseguro || '-'}</td>
                                                    <td style={tdStyle}>{r.laboratorio || '-'}</td>
                                                    <td style={tdStyle}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                            {r.biopsia_congelacion && r.biopsia_congelacion !== 'NO' && <div style={{ background: '#E0F2FE', color: '#0369A1', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600, border: '1px solid #BAE6FD', fontSize: '0.72rem' }}>❄️ C: {r.biopsia_congelacion}</div>}
                                                            {(r.biopsia_simple || r.material_biopsia_simple) && <div style={{ background: '#DCFCE7', color: '#15803D', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600, border: '1px solid #BBF7D0', fontSize: '0.72rem' }}>S: {r.biopsia_simple || '—'}</div>}
                                                            {(r.biopsia_ampliada || r.material_biopsia_ampliada) && <div style={{ background: '#FFEDD5', color: '#C2410C', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', fontWeight: 600, border: '1px solid #FED7AA', fontSize: '0.72rem' }}>A: {r.biopsia_ampliada || '—'}</div>}
                                                            {!(r.biopsia_congelacion && r.biopsia_congelacion !== 'NO') && !(r.biopsia_simple || r.material_biopsia_simple) && !(r.biopsia_ampliada || r.material_biopsia_ampliada) && '—'}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <ModulosQuantity record={r} displayMode="badge" />
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }}>
                                                        <div style={{
                                                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                                            padding: '3px 8px', borderRadius: '6px', fontSize: '0.72rem', fontWeight: 700,
                                                            background: estadoAccion === 'FACTURAR' ? '#FEF2F2' : estadoAccion === 'ENTREGAR' ? '#F0FDF4' : '#F8FAFC',
                                                            color: estadoAccion === 'FACTURAR' ? '#DC2626' : estadoAccion === 'ENTREGAR' ? '#16A34A' : '#94A3B8',
                                                            border: `1px solid ${estadoAccion === 'FACTURAR' ? '#FECACA' : estadoAccion === 'ENTREGAR' ? '#BBF7D0' : '#E2E8F0'}`,
                                                        }}>
                                                            {estadoAccion}
                                                        </div>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                                                        <button
                                                            onClick={() => handleEnviarAlCarrito(r)}
                                                            title="Enviar al carrito de entrega"
                                                            style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                                                                borderRadius: '6px', border: '1px solid #C4B5FD',
                                                                background: '#F5F3FF', color: '#7C3AED',
                                                                cursor: 'pointer', transition: 'all 0.2s',
                                                            }}
                                                            onMouseOver={e => { e.currentTarget.style.background = '#EDE9FE'; }}
                                                            onMouseOut={e => { e.currentTarget.style.background = '#F5F3FF'; }}
                                                        >
                                                            <ShoppingCart size={12} /> Carrito
                                                        </button>
                                                    </td>
                                                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--neutral-400)' }}>
                                                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid var(--neutral-200)' }}>
                                                        <td colSpan={11} style={{ padding: '0 24px 24px 24px' }}>
                                                            <div style={{ background: '#fff', border: '1px solid var(--neutral-200)', borderRadius: '8px', padding: '16px', display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                                                                <div style={{ flex: '1', minWidth: '250px' }}>
                                                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid var(--neutral-100)', paddingBottom: '4px' }}>Detalles de Muestras</h4>
                                                                    <MuestrasEditor record={r} onSave={handleAssignMuestras} />
                                                                </div>
                                                                <div style={{ flex: '1', minWidth: '350px', borderLeft: '1px solid var(--neutral-100)', paddingLeft: '24px' }}>
                                                                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--neutral-500)', textTransform: 'uppercase', marginBottom: '8px', borderBottom: '1px solid var(--neutral-100)', paddingBottom: '4px' }}>Gestión de Módulo</h4>
                                                                    <div style={{ marginTop: '12px' }}>
                                                                        <ModulosQuantity record={r} onSave={handleAssignModulo} onDelete={handleDeleteModulo} displayMode="editor" />
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div style={{ padding: '12px 20px', background: '#F8FAFC', borderTop: '1px solid var(--neutral-100)', fontSize: '0.75rem', color: 'var(--neutral-400)', display: 'flex', justifyContent: 'space-between' }}>
                            <span>Mostrando {filteredRecords.length} registro/s</span>
                            <span>Actualizado desde SALUS</span>
                        </div>
                    </>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* TAB 2: CARRITO */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'carrito' && (
                    <div style={{ padding: '20px' }}>
                        {/* Stats bar */}
                        {carrito.length > 0 && (
                            <div style={{
                                display: 'flex', gap: '16px', flexWrap: 'wrap', marginBottom: '16px',
                                padding: '14px 18px', borderRadius: '10px',
                                background: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 100%)',
                                border: '1px solid #DDD6FE',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Package size={16} style={{ color: '#7C3AED' }} />
                                    <span style={{ fontWeight: 700, color: '#5B21B6' }}>{carritoStats.total}</span>
                                    <span style={{ color: '#7C3AED', fontSize: '0.82rem' }}>registros</span>
                                </div>
                                <div style={{ width: '1px', background: '#C4B5FD' }}></div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    <Microscope size={16} style={{ color: '#7C3AED' }} />
                                    <span style={{ fontWeight: 700, color: '#5B21B6' }}>{carritoStats.labs.length}</span>
                                    <span style={{ color: '#7C3AED', fontSize: '0.82rem' }}>laboratorio(s)</span>
                                </div>
                                {carritoStats.diasDistintos > 1 && (
                                    <>
                                        <div style={{ width: '1px', background: '#C4B5FD' }}></div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            <Calendar size={16} style={{ color: '#7C3AED' }} />
                                            <span style={{ fontWeight: 700, color: '#5B21B6' }}>{carritoStats.diasDistintos}</span>
                                            <span style={{ color: '#7C3AED', fontSize: '0.82rem' }}>días distintos</span>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}

                        {/* Lab filter badges */}
                        {carritoStats.labs.length > 1 && (
                            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => setFiltroCarritoLab(null)}
                                    style={{
                                        padding: '5px 14px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
                                        border: !filtroCarritoLab ? '2px solid #8B5CF6' : '1px solid #E2E8F0',
                                        background: !filtroCarritoLab ? '#F5F3FF' : '#fff',
                                        color: !filtroCarritoLab ? '#7C3AED' : '#64748B',
                                        cursor: 'pointer', transition: 'all 0.2s',
                                    }}
                                >
                                    Todos ({carrito.length})
                                </button>
                                {carritoStats.labs.map(lab => {
                                    const color = LAB_COLORS[lab] || '#64748B';
                                    const shortName = LAB_SHORT_NAMES[lab] || lab;
                                    const count = carritoStats.byLab[lab]?.length || 0;
                                    const isActive = filtroCarritoLab === lab;
                                    return (
                                        <button key={lab} onClick={() => setFiltroCarritoLab(isActive ? null : lab)}
                                            style={{
                                                padding: '5px 14px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 600,
                                                border: isActive ? `2px solid ${color}` : '1px solid #E2E8F0',
                                                background: isActive ? `${color}15` : '#fff',
                                                color: isActive ? color : '#64748B',
                                                cursor: 'pointer', transition: 'all 0.2s',
                                            }}
                                        >
                                            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: color, marginRight: '6px' }}></span>
                                            {shortName} ({count})
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Carrito content */}
                        {carritoLoading ? (
                            <SkeletonTable rows={5} cols={8} />
                        ) : carrito.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                                <ShoppingCart size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                                <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>Carrito vacío</p>
                                <p style={{ fontSize: '0.85rem' }}>Envíe registros desde la pestaña "Muestras" usando el botón <strong>Carrito</strong></p>
                            </div>
                        ) : (
                            <div>
                                {/* Group by lab */}
                                {(filtroCarritoLab ? [filtroCarritoLab] : carritoStats.labs).map(lab => {
                                    const items = carritoStats.byLab[lab] || [];
                                    if (items.length === 0) return null;
                                    const color = LAB_COLORS[lab] || '#64748B';
                                    const shortName = LAB_SHORT_NAMES[lab] || lab;

                                    return (
                                        <div key={lab} style={{
                                            marginBottom: '20px', borderRadius: '10px',
                                            border: `1px solid ${color}30`, overflow: 'hidden',
                                        }}>
                                            {/* Group header */}
                                            <div style={{
                                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                                padding: '12px 16px', background: `${color}10`,
                                                borderBottom: `1px solid ${color}30`,
                                            }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: color }}></div>
                                                    <span style={{ fontWeight: 700, color, fontSize: '0.9rem' }}>{shortName}</span>
                                                    <span style={{
                                                        background: color, color: '#fff',
                                                        padding: '1px 8px', borderRadius: '10px', fontSize: '0.72rem', fontWeight: 700,
                                                    }}>{items.length}</span>
                                                </div>
                                                <button
                                                    onClick={() => handleAbrirEntrega(lab)}
                                                    style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                        padding: '6px 16px', borderRadius: '8px', border: 'none',
                                                        background: color, color: '#fff', fontWeight: 700,
                                                        fontSize: '0.82rem', cursor: 'pointer', transition: 'all 0.2s',
                                                    }}
                                                    onMouseOver={e => { e.currentTarget.style.opacity = '0.9'; }}
                                                    onMouseOut={e => { e.currentTarget.style.opacity = '1'; }}
                                                >
                                                    <PackageCheck size={14} /> Generar Constancia
                                                </button>
                                            </div>

                                            {/* Items table */}
                                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                                <thead>
                                                    <tr>
                                                        <th style={thSmall}>Fecha</th>
                                                        <th style={thSmall}>Paciente</th>
                                                        <th style={thSmall}>DNI</th>
                                                        <th style={thSmall}>OS</th>
                                                        <th style={thSmall}>Biopsias</th>
                                                        <th style={thSmall}>Módulo</th>
                                                        <th style={{ ...thSmall, textAlign: 'center', width: '60px' }}></th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    {items.map(item => (
                                                        <tr key={item.id_visita} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                            <td style={tdSmall}>{fmtFecha(item.fecha_visita)}</td>
                                                            <td style={{ ...tdSmall }}>
                                                                <div style={{ fontWeight: 600 }}>{item.paciente}</div>
                                                                {(() => {
                                                                    const debt = getPatientDebt(item.dni);
                                                                    if (debt) {
                                                                        return (
                                                                            <div style={{
                                                                                display: 'inline-flex',
                                                                                alignItems: 'center',
                                                                                gap: '4px',
                                                                                background: '#FEF2F2',
                                                                                color: '#DC2626',
                                                                                border: '1px solid #FCA5A5',
                                                                                borderRadius: '6px',
                                                                                padding: '1px 6px',
                                                                                fontSize: '0.68rem',
                                                                                fontWeight: 700,
                                                                                marginTop: '3px',
                                                                                width: 'fit-content'
                                                                            }}>
                                                                                ⚠️ Deuda: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(debt.deuda_total)}
                                                                            </div>
                                                                        );
                                                                    }
                                                                    return null;
                                                                })()}
                                                            </td>
                                                            <td style={{ ...tdSmall, fontFamily: 'monospace' }}>{item.dni || '—'}</td>
                                                            <td style={tdSmall}>{item.cliente || '—'}</td>
                                                            <td style={tdSmall}>
                                                                {[
                                                                    item.biopsia_congelacion && item.biopsia_congelacion !== 'NO' && `C: ${item.biopsia_congelacion}`,
                                                                    (item.biopsia_simple || item.material_biopsia_simple) && `S: ${item.biopsia_simple || '—'}`,
                                                                    (item.biopsia_ampliada || item.material_biopsia_ampliada) && `A: ${item.biopsia_ampliada || '—'}`,
                                                                ].filter(Boolean).join(' | ') || '—'}
                                                            </td>
                                                            <td style={tdSmall}>
                                                                <ModulosQuantity record={item} displayMode="badge" />
                                                            </td>
                                                            <td style={{ ...tdSmall, textAlign: 'center' }}>
                                                                <button onClick={() => handleQuitarDelCarrito(item)}
                                                                    title="Quitar del carrito"
                                                                    style={{
                                                                        border: 'none', background: 'none', cursor: 'pointer',
                                                                        color: '#EF4444', padding: '4px', borderRadius: '4px',
                                                                    }}
                                                                    onMouseOver={e => { e.currentTarget.style.background = '#FEE2E2'; }}
                                                                    onMouseOut={e => { e.currentTarget.style.background = 'none'; }}
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
                                })}
                            </div>
                        )}
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════════ */}
                {/* TAB 3: HISTORIAL */}
                {/* ═══════════════════════════════════════════════════════ */}
                {activeTab === 'historial' && (
                    <div style={{ padding: '20px' }}>
                        {constancias.length === 0 ? (
                            <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94A3B8' }}>
                                <History size={48} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
                                <p style={{ fontWeight: 600, fontSize: '1rem', marginBottom: '4px' }}>Sin entregas registradas</p>
                                <p style={{ fontSize: '0.85rem' }}>Las constancias generadas aparecerán aquí</p>
                            </div>
                        ) : (
                            <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                                    <thead>
                                        <tr>
                                            <th style={thStyle}></th>
                                            <th style={thStyle}>Código</th>
                                            <th style={thStyle}>Laboratorio</th>
                                            <th style={thStyle}>Fecha</th>
                                            <th style={thStyle}>Responsable</th>
                                            <th style={thStyle}>Cadete</th>
                                            <th style={{ ...thStyle, textAlign: 'center' }}>Registros</th>
                                            <th style={{ ...thStyle, textAlign: 'right' }}>Acciones</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {constancias.map(cons => {
                                            const isExpanded = expandedConstancia === cons.id;
                                            const detalle = constanciaDetalle[cons.id];
                                            const color = LAB_COLORS[cons.laboratorio] || '#64748B';

                                            return (
                                                <React.Fragment key={cons.id}>
                                                    <tr
                                                        onClick={() => handleExpandConstancia(cons.id)}
                                                        style={{
                                                            cursor: 'pointer', borderBottom: '1px solid #F1F5F9',
                                                            background: isExpanded ? '#FAFAFE' : 'transparent',
                                                            transition: 'background 0.15s',
                                                        }}
                                                        onMouseOver={e => { if (!isExpanded) e.currentTarget.style.background = '#F8FAFC'; }}
                                                        onMouseOut={e => { if (!isExpanded) e.currentTarget.style.background = 'transparent'; }}
                                                    >
                                                        <td style={{ ...tdStyle, width: '30px' }}>
                                                            {isExpanded ? <ChevronUp size={14} style={{ color: '#94A3B8' }} /> : <ChevronDown size={14} style={{ color: '#94A3B8' }} />}
                                                        </td>
                                                        <td style={tdStyle}>
                                                            <span style={{
                                                                fontFamily: 'monospace', fontWeight: 700,
                                                                background: '#F5F3FF', color: '#7C3AED',
                                                                padding: '2px 8px', borderRadius: '6px', fontSize: '0.78rem',
                                                            }}>
                                                                {cons.codigo}
                                                            </span>
                                                        </td>
                                                        <td style={tdStyle}>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                padding: '2px 10px', borderRadius: '12px',
                                                                background: `${color}15`, color,
                                                                fontSize: '0.72rem', fontWeight: 600,
                                                            }}>
                                                                <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: color }}></div>
                                                                {LAB_SHORT_NAMES[cons.laboratorio] || cons.laboratorio}
                                                            </span>
                                                        </td>
                                                        <td style={tdStyle}>{fmtFecha(cons.fecha_entrega?.substring(0, 10))}</td>
                                                        <td style={tdStyle}>{cons.responsable_entrega}</td>
                                                        <td style={tdStyle}>{cons.nombre_cadete || '—'}</td>
                                                        <td style={{ ...tdStyle, textAlign: 'center', fontWeight: 700 }}>
                                                            {cons.cantidad_registros}
                                                        </td>
                                                        <td style={{ ...tdStyle, textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                                                            {confirmRevertir === cons.id ? (
                                                                <div style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                    padding: '4px 8px', borderRadius: '8px',
                                                                    background: '#FEF2F2', border: '1px solid #FECACA',
                                                                }}>
                                                                    <span style={{ fontSize: '0.7rem', color: '#DC2626', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                                                        ¿Revertir {cons.cantidad_registros} reg.?
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
                                                                        Sí
                                                                    </button>
                                                                    <button onClick={() => setConfirmRevertir(null)}
                                                                        style={{ padding: '3px 8px', fontSize: '0.7rem', fontWeight: 600, borderRadius: '5px', border: '1px solid #FCA5A5', background: '#fff', color: '#6B7280', cursor: 'pointer' }}>
                                                                        No
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div style={{ display: 'inline-flex', gap: '6px', alignItems: 'center' }}>
                                                                    <button
                                                                        onClick={() => handlePrintConstancia(cons, detalle)}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                            padding: '4px 10px', fontSize: '0.72rem', fontWeight: 600,
                                                                            borderRadius: '6px', border: '1px solid #C4B5FD',
                                                                            background: '#F5F3FF', color: '#7C3AED',
                                                                            cursor: 'pointer', transition: 'all 0.2s',
                                                                        }}
                                                                        onMouseOver={e => { e.currentTarget.style.background = '#EDE9FE'; }}
                                                                        onMouseOut={e => { e.currentTarget.style.background = '#F5F3FF'; }}
                                                                    >
                                                                        <Printer size={12} /> Reimprimir
                                                                    </button>
                                                                    <button
                                                                        onClick={() => setConfirmRevertir(cons.id)}
                                                                        title="Revertir — los registros vuelven al carrito"
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

                                                    {/* Expanded detail */}
                                                    {isExpanded && detalle && (
                                                        <tr key={`${cons.id}-detail`} className="animate-fade-in">
                                                            <td colSpan={8} style={{ padding: 0, border: 'none' }}>
                                                                <div style={{
                                                                    background: '#F9FAFB', borderLeft: `3px solid ${color}`,
                                                                    margin: '0 8px 8px 24px', borderRadius: '0 8px 8px 0', padding: '8px 0',
                                                                }}>
                                                                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                                                        <thead>
                                                                            <tr>
                                                                                <th style={thSmall}>#</th>
                                                                                <th style={thSmall}>Fecha</th>
                                                                                <th style={thSmall}>Paciente</th>
                                                                                <th style={thSmall}>DNI</th>
                                                                                <th style={thSmall}>OS</th>
                                                                                <th style={thSmall}>Biopsias</th>
                                                                                <th style={thSmall}>Módulo</th>
                                                                            </tr>
                                                                        </thead>
                                                                        <tbody>
                                                                            {detalle.map((item, idx) => (
                                                                                <tr key={item.id || idx} style={{ borderTop: '1px solid #F1F5F9' }}>
                                                                                    <td style={{ ...tdSmall, textAlign: 'center', fontWeight: 700, color: '#9CA3AF' }}>{idx + 1}</td>
                                                                                    <td style={tdSmall}>{fmtFecha(item.fecha_visita)}</td>
                                                                                    <td style={{ ...tdSmall, fontWeight: 600 }}>{item.paciente}</td>
                                                                                    <td style={{ ...tdSmall, fontFamily: 'monospace' }}>{item.dni || '—'}</td>
                                                                                    <td style={tdSmall}>{item.cliente || '—'}</td>
                                                                                    <td style={tdSmall}>
                                                                                        {[
                                                                                            item.biopsia_congelacion && item.biopsia_congelacion !== 'NO' && `C: ${item.biopsia_congelacion}`,
                                                                                            (item.biopsia_simple || item.material_biopsia_simple) && `S: ${item.biopsia_simple || '—'}`,
                                                                                            (item.biopsia_ampliada || item.material_biopsia_ampliada) && `A: ${item.biopsia_ampliada || '—'}`,
                                                                                        ].filter(Boolean).join(', ') || '—'}
                                                                                    </td>
                                                                                    <td style={tdSmall}>
                                                                                        <ModulosQuantity record={item} displayMode="badge" />
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </tbody>
                                                                    </table>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* ═══════════════════════════════════════════════════════ */}
            {/* MODAL: Generar Constancia */}
            {/* ═══════════════════════════════════════════════════════ */}
            {showEntregaModal && (
                <div style={{
                    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
                }}>
                    <div style={{
                        background: '#fff', borderRadius: '16px', width: '420px', maxWidth: '95vw',
                        boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '20px 24px', borderBottom: '1px solid #E2E8F0',
                            background: 'linear-gradient(135deg, #F5F3FF, #EDE9FE)',
                        }}>
                            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#5B21B6' }}>
                                Generar Constancia de Entrega
                            </h3>
                            <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#7C3AED' }}>
                                {LAB_SHORT_NAMES[entregaLab] || entregaLab} — {(carritoStats.byLab[entregaLab] || []).length} registro(s)
                            </p>
                        </div>
                        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>
                                    Responsable de Entrega *
                                </label>
                                <input
                                    type="text" value={entregaResponsable}
                                    onChange={e => setEntregaResponsable(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.85rem', outline: 'none' }}
                                    placeholder="Nombre del responsable"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>
                                    Cadete / Transportista
                                </label>
                                <input type="text" value={entregaCadete}
                                    onChange={e => setEntregaCadete(e.target.value)}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.85rem', outline: 'none' }}
                                    placeholder="Opcional"
                                />
                            </div>
                            <div>
                                <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', marginBottom: '4px', display: 'block' }}>
                                    Notas
                                </label>
                                <textarea
                                    value={entregaNotas}
                                    onChange={e => setEntregaNotas(e.target.value)}
                                    rows={2}
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #D1D5DB', fontSize: '0.85rem', outline: 'none', resize: 'vertical', fontFamily: 'inherit' }}
                                    placeholder="Observaciones opcionales"
                                />
                            </div>
                        </div>
                        <div style={{
                            padding: '16px 24px', borderTop: '1px solid #E2E8F0',
                            display: 'flex', justifyContent: 'flex-end', gap: '8px', background: '#F8FAFC',
                        }}>
                            <button
                                onClick={() => setShowEntregaModal(false)}
                                style={{
                                    padding: '8px 20px', borderRadius: '8px', border: '1px solid #D1D5DB',
                                    background: '#fff', color: '#475569', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleGenerarConstancia}
                                disabled={generandoConstancia || !entregaResponsable.trim()}
                                style={{
                                    padding: '8px 24px', borderRadius: '8px', border: 'none',
                                    background: generandoConstancia ? '#A78BFA' : '#7C3AED',
                                    color: '#fff', fontWeight: 700, fontSize: '0.85rem',
                                    cursor: generandoConstancia ? 'wait' : 'pointer',
                                    display: 'flex', alignItems: 'center', gap: '6px',
                                }}
                            >
                                {generandoConstancia
                                    ? <><Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> Generando...</>
                                    : <><CheckCircle2 size={14} /> Generar &amp; Imprimir</>
                                }
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
