import React, { useState, useEffect, useMemo } from 'react';
import { 
    X, Sparkles, Download, Loader2, Image as ImageIcon, Map, 
    Presentation, FileText, Copy, Palette, FileSpreadsheet, 
    CheckCircle2, RefreshCw, Layers, Calendar, Bed, Activity
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ReactMarkdown from 'react-markdown';
import MermaidRenderer from './MermaidRenderer';
import pptxgen from 'pptxgenjs';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export default function TelarExportModal({ activeIndicators = [], globalMetrics = {}, rawRows = [], onClose }) {
    const [selectedTab, setSelectedTab] = useState('presentation');
    const [selectedTheme, setSelectedTheme] = useState('institutional_blue');
    
    // Estados para Imagen (Infografía Visual)
    const [imageStatus, setImageStatus] = useState('idle');
    const [imageSrc, setImageSrc] = useState(null);
    const [imageError, setImageError] = useState('');

    // Estados para OmniFlash (Texto/Mermaid/PPTX)
    const [flashStatus, setFlashStatus] = useState('idle');
    const [flashContent, setFlashContent] = useState('');
    const [flashError, setFlashError] = useState('');

    // Opciones del menú
    const tabs = [
        { id: 'presentation', label: 'Presentación PPTX', icon: <Presentation size={18} />, description: 'Diapositivas editables para Directorio' },
        { id: 'excel_sheet', label: 'Planilla Excel (.xlsx)', icon: <FileSpreadsheet size={18} />, description: 'Métricas y pacientes tabulados' },
        { id: 'pdf_report', label: 'Reporte Ejecutivo PDF', icon: <FileText size={18} />, description: 'Informe clínico formal membretado' },
        { id: 'infographic', label: 'Infografía Visual', icon: <ImageIcon size={18} />, description: 'Diseño clínico generado por IA' },
        { id: 'conceptual_map', label: 'Mapa Conceptual', icon: <Map size={18} />, description: 'Grafo de métricas (Mermaid JS)' },
        { id: 'speech_script', label: 'Guión de Discurso', icon: <FileText size={18} />, description: 'Discurso profesional (Markdown)' },
    ];

    // Síntesis infalible de indicadores activos si vinieron vacíos
    const effectiveIndicators = useMemo(() => {
        if (Array.isArray(activeIndicators) && activeIndicators.length > 0) {
            return activeIndicators;
        }

        if (globalMetrics && Object.keys(globalMetrics).length > 0) {
            const list = [];
            const sectorName = globalMetrics.sector || 'Cuidados Críticos (UCI)';
            const subNivelName = globalMetrics.subNivel ? ` - ${globalMetrics.subNivel}` : '';
            
            list.push({
                id: 'sector_info',
                label: 'Sector Hospitalario',
                value: `${sectorName}${subNivelName} (16 Camas UCI)`,
                descripcion: globalMetrics.fechaDesde ? `Período: ${globalMetrics.fechaDesde} al ${globalMetrics.fechaHasta}` : 'Gestión de Camas'
            });

            if (globalMetrics.diasOcupados != null) {
                list.push({
                    id: 'kpi_dias_ocupados',
                    label: 'Días Camas Ocupados',
                    value: `${Number(globalMetrics.diasOcupados).toLocaleString('es-AR')} días`,
                    descripcion: 'Total camas-día efectivas ocupadas en el período'
                });
            }

            if (globalMetrics.camasDisponibles != null) {
                list.push({
                    id: 'kpi_dias_disponibles',
                    label: 'Días Camas Disponibles',
                    value: `${Number(globalMetrics.camasDisponibles).toLocaleString('es-AR')} días`,
                    descripcion: `Capacidad instalada (${globalMetrics.camasTotales || 16} camas)`
                });
            }

            if (globalMetrics.porcOcupacion != null) {
                list.push({
                    id: 'kpi_porc_ocupacion',
                    label: '% de Ocupación',
                    value: `${globalMetrics.porcOcupacion}%`,
                    descripcion: 'Tasa de ocupación operativa de camas'
                });
            }

            if (globalMetrics.totalAdmisiones != null) {
                list.push({
                    id: 'kpi_total_admisiones',
                    label: 'Admisiones Únicas',
                    value: `${globalMetrics.totalAdmisiones} pacientes`,
                    descripcion: 'Pacientes únicos internados en el período'
                });
            }

            if (globalMetrics.alos != null) {
                list.push({
                    id: 'kpi_alos',
                    label: 'Promedio de Estancia (ALOS)',
                    value: `${globalMetrics.alos} días`,
                    descripcion: 'Estancia media de permanencia por paciente'
                });
            }

            if (globalMetrics.porcDefuncion != null) {
                list.push({
                    id: 'kpi_porc_defuncion',
                    label: '% de Defunción',
                    value: `${globalMetrics.porcDefuncion}%`,
                    descripcion: `${globalMetrics.defunciones || 0} fallecimientos en el período`
                });
            }

            if (globalMetrics.intensidadCamaDia != null) {
                list.push({
                    id: 'kpi_intensidad_diagnostica',
                    label: 'Intensidad Diagnóstica (VLISE)',
                    value: `${globalMetrics.intensidadCamaDia} estudios/cama-día`,
                    descripcion: 'Consumo de prácticas de laboratorio e imágenes'
                });
            }

            if (globalMetrics.topEspecialidades && globalMetrics.topEspecialidades.length > 0) {
                list.push({
                    id: 'top_especialidades',
                    label: 'Top Especialidades',
                    value: globalMetrics.topEspecialidades.slice(0, 5).join(', '),
                    descripcion: 'Especialidades con mayor demanda asistencial'
                });
            }

            return list;
        }

        return [];
    }, [activeIndicators, globalMetrics]);

    useEffect(() => {
        if (effectiveIndicators.length === 0) {
            return;
        }

        // Si cambiamos de tab y no hay contenido generado, generarlo automáticamente para tabs IA
        if (selectedTab === 'infographic' && !imageSrc && imageStatus === 'idle') {
            generateInfographic();
        } else if (['presentation', 'conceptual_map', 'speech_script'].includes(selectedTab) && flashStatus === 'idle') {
            generateOmniFlash(selectedTab);
        }
    }, [selectedTab, effectiveIndicators, selectedTheme]);

    // Generador Imagen (Gemini 3.1 Flash Image)
    const generateInfographic = async () => {
        if (effectiveIndicators.length === 0) {
            setImageStatus('error');
            setImageError('No hay indicadores activos para generar la infografía.');
            return;
        }
        try {
            setImageStatus('generating');
            setImageError('');
            const { data, error } = await supabase.functions.invoke('gemini-infographic', {
                body: { indicators: effectiveIndicators, metrics: globalMetrics, engine: 'google', theme: selectedTheme }
            });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            setImageSrc(`data:image/jpeg;base64,${data.imageBase64}`);
            setImageStatus('success');
        } catch (err) {
            console.error(err);
            setImageStatus('error');
            setImageError(err.message || 'Error al generar infografía visual.');
        }
    };

    // Generador PPTX con pptxgenjs
    const generatePPTX = (slidesData) => {
        let pptx = new pptxgen();
        
        let bgColor = 'FFFFFF';
        let titleColor = '1E293B';
        let accentColor = '1E40AF'; // Azul Institucional Sanatorio Argentino
        
        if (selectedTheme === 'institutional_blue') {
            titleColor = '0D3B66';
            accentColor = '1E40AF';
        } else if (selectedTheme === 'surgical_green') {
            titleColor = '065F46';
            accentColor = '059669';
        }

        pptx.defineSlideMaster({
            title: 'MASTER_SLIDE',
            background: { color: bgColor },
            objects: [
                { rect: { x: 0, y: 0, w: '100%', h: 0.8, fill: { color: accentColor } } },
                { text: { text: 'SANATORIO ARGENTINO — GOBERNANZA CLÍNICA', options: { x: 0.5, y: 0.22, w: 9, h: 0.45, color: 'FFFFFF', fontSize: 16, bold: true } } }
            ]
        });

        slidesData.forEach((slide) => {
            let pptSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
            
            // Título
            pptSlide.addText(slide.title || 'Diapositiva Ejecutiva', {
                x: 0.6, y: 1.1, w: '88%', h: 0.8, fontSize: 26, bold: true, color: titleColor
            });

            // Subtítulo
            if (slide.subtitle) {
                pptSlide.addText(slide.subtitle, {
                    x: 0.6, y: 1.8, w: '88%', h: 0.5, fontSize: 16, italic: true, color: '64748B'
                });
            }

            // Bullets
            if (slide.bullets && slide.bullets.length > 0) {
                const bulletText = slide.bullets.map(b => ({ text: b, options: { bullet: true, fontSize: 15, color: '334155' } }));
                pptSlide.addText(bulletText, {
                    x: 0.6, y: 2.4, w: '88%', h: 3.8, valign: 'top'
                });
            }

            // Notas del orador
            if (slide.notes) {
                pptSlide.addNotes(slide.notes);
            }
        });

        const dateStr = new Date().toISOString().split('T')[0];
        pptx.writeFile({ fileName: `Sanatorio_Argentino_Reporte_UCI_${dateStr}.pptx` });
    };

    // Generador OmniFlash (LLM para Presentación, Mapa Conceptual o Guión)
    const generateOmniFlash = async (type) => {
        if (effectiveIndicators.length === 0) {
            setFlashStatus('error');
            setFlashError('No hay indicadores activos cargados.');
            return;
        }

        try {
            setFlashStatus('generating');
            setFlashError('');
            setFlashContent('');
            
            const { data, error } = await supabase.functions.invoke('gemini-omniflash', {
                body: { indicators: effectiveIndicators, metrics: globalMetrics, exportType: type, theme: selectedTheme }
            });

            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            
            if (type === 'presentation') {
                try {
                    let text = (data.textContent || '').trim();
                    if (text.startsWith('```')) {
                        text = text.replace(/^```(?:json)?\s*/i, '');
                    }
                    if (text.endsWith('```')) {
                        text = text.replace(/\s*```$/i, '');
                    }
                    text = text.trim();
                    const parsed = JSON.parse(text);
                    setFlashContent(parsed);
                    setFlashStatus('success');
                } catch {
                    throw new Error("El formato devuelto no pudo ser interpretado como JSON para la presentación.");
                }
            } else {
                setFlashContent(data.textContent);
                setFlashStatus('success');
            }
        } catch (err) {
            console.error(err);
            setFlashStatus('error');
            setFlashError(err.message || 'Error al generar el contenido de exportación.');
        }
    };

    // Exportador Nativo Directo a Excel (.xlsx) con Tabulación Real
    const handleDownloadExcel = () => {
        const wb = XLSX.utils.book_new();

        // 1. Hoja de Indicadores y Resumen
        const resumenData = [
            ['SANATORIO ARGENTINO — REPORTE DE GOBERNANZA CLÍNICA'],
            ['Sector:', globalMetrics.sector || 'Cuidados Críticos (UCI)'],
            ['Nivel Asistencial:', globalMetrics.subNivel || 'UCI Consolidada (16 Camas)'],
            ['Período Auditado:', `${globalMetrics.fechaDesde || 'Inicio'} al ${globalMetrics.fechaHasta || 'Fin'}`],
            ['Fecha de Generación:', new Date().toLocaleString('es-AR')],
            [],
            ['INDICADOR CLÍNICO / OPERATIVO', 'VALOR REGISTRADO', 'DESCRIPCIÓN TÉCNICA'],
            ...effectiveIndicators.map(ind => [ind.label, ind.value, ind.descripcion || ''])
        ];
        const wsResumen = XLSX.utils.aoa_to_sheet(resumenData);
        wsResumen['!cols'] = [{ wch: 35 }, { wch: 25 }, { wch: 45 }];
        XLSX.utils.book_append_sheet(wb, wsResumen, 'Indicadores_KPIs');

        // 2. Hoja de Detalle de Pacientes / Admisiones
        if (rawRows && rawRows.length > 0) {
            const admisionesDetalle = rawRows.map(r => ({
                'Habitación / Cama': r.habitacion || (r.servicio === 'UCI' ? 'BOX (Intensiva)' : '222-229 (Intermedia)'),
                'Paciente': r.paciente || 'Sin Datos',
                'NHC': r.nhc || '',
                'Obra Social / Financiador': r.cliente || 'Particular',
                'Fecha Ingreso': r.fecha_ingreso ? r.fecha_ingreso.substring(0, 10) : '',
                'Fecha Alta': r.fecha_alta ? r.fecha_alta.substring(0, 10) : 'Internado Activo',
                'Especialidad': r.especialidad || 'Cuidados Críticos',
                'Motivo Egreso': r.motivo_de_alta || 'En Internación',
                'Edad': r.edad || ''
            }));
            const wsAdmisiones = XLSX.utils.json_to_sheet(admisionesDetalle);
            wsAdmisiones['!cols'] = [
                { wch: 18 }, { wch: 32 }, { wch: 12 }, { wch: 28 }, 
                { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 8 }
            ];
            XLSX.utils.book_append_sheet(wb, wsAdmisiones, 'Detalle_Admisiones');
        }

        const dateStr = new Date().toISOString().split('T')[0];
        XLSX.writeFile(wb, `Gobernanza_Sanatorio_Argentino_UCI_${dateStr}.xlsx`);
    };

    // Exportador Nativo a PDF Institucional con jsPDF y autoTable
    const handleDownloadPdf = () => {
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
        const primaryColor = [13, 59, 102]; // #0D3B66 Azul Institucional

        // Membrete
        doc.setFillColor(...primaryColor);
        doc.rect(0, 0, 210, 24, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.text('SANATORIO ARGENTINO', 14, 11);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text('SISTEMA DE GOBERNANZA CLÍNICA Y AUDITORÍA DE CALIDAD', 14, 17);

        doc.setFontSize(8);
        doc.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 196, 17, { align: 'right' });

        // Título del Reporte
        let y = 34;
        doc.setTextColor(30, 41, 59);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text('Informe Ejecutivo de Ocupación e Indicadores — Cuidados Críticos (UCI)', 14, y);

        y += 6;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        const sub = globalMetrics.subNivel ? `Nivel: ${globalMetrics.subNivel} | ` : '';
        const per = globalMetrics.fechaDesde ? `Período: ${globalMetrics.fechaDesde} al ${globalMetrics.fechaHasta}` : '';
        doc.text(`${sub}${per} | Capacidad Auditada: 16 Camas Totales (8 Intensiva + 8 Intermedia)`, 14, y);

        // Cuadros KPI Destacados
        y += 8;
        const kpis = [
            { label: 'DÍAS OCUPADOS', val: Number(globalMetrics.diasOcupados || 0).toLocaleString('es-AR'), col: [37, 99, 235] },
            { label: '% OCUPACIÓN', val: `${globalMetrics.porcOcupacion || '0.0'}%`, col: [16, 185, 129] },
            { label: 'ALOS (ESTANCIA)', val: `${globalMetrics.alos || '—'} d`, col: [99, 102, 241] },
            { label: '% DEFUNCIÓN', val: `${globalMetrics.porcDefuncion || '0.0'}%`, col: [239, 68, 68] }
        ];

        kpis.forEach((k, idx) => {
            const x = 14 + idx * 46;
            doc.setFillColor(248, 250, 252);
            doc.setDrawColor(226, 232, 240);
            doc.roundedRect(x, y, 42, 18, 2, 2, 'FD');

            doc.setFontSize(7);
            doc.setTextColor(100, 116, 139);
            doc.setFont('helvetica', 'bold');
            doc.text(k.label, x + 4, y + 6);

            doc.setFontSize(13);
            doc.setTextColor(...k.col);
            doc.text(k.val, x + 4, y + 14);
        });

        // Tabla de Indicadores
        y += 24;
        const tableBody = effectiveIndicators.map(ind => [
            ind.label,
            ind.value,
            ind.descripcion || '—'
        ]);

        autoTable(doc, {
            startY: y,
            head: [['Indicador Hospitalario', 'Valor Registrado', 'Descripción Técnica']],
            body: tableBody,
            theme: 'grid',
            headStyles: {
                fillColor: primaryColor,
                textColor: 255,
                fontSize: 8,
                fontStyle: 'bold'
            },
            styles: {
                fontSize: 8,
                cellPadding: 2.5
            },
            columnStyles: {
                0: { fontStyle: 'bold', cellWidth: 50 },
                1: { cellWidth: 45, textColor: [37, 99, 235] },
                2: { cellWidth: 'auto', textColor: [71, 85, 105] }
            }
        });

        // Tabla resumen de admisiones recientes si existen
        if (rawRows && rawRows.length > 0) {
            const lastY = doc.lastAutoTable.finalY + 8;
            if (lastY < 240) {
                doc.setFontSize(10);
                doc.setTextColor(30, 41, 59);
                doc.setFont('helvetica', 'bold');
                doc.text(`Registro Muestral de Pacientes Auditados (${Math.min(15, rawRows.length)} de ${rawRows.length} total)`, 14, lastY);

                const sampleRows = rawRows.slice(0, 15).map(r => [
                    r.habitacion || (r.servicio === 'UCI' ? 'BOX' : '222-229'),
                    r.paciente || 'Sin Nombre',
                    r.cliente ? r.cliente.substring(0, 18) : 'Particular',
                    r.fecha_ingreso ? r.fecha_ingreso.substring(0, 10) : '',
                    r.fecha_alta ? r.fecha_alta.substring(0, 10) : 'Activo',
                    r.especialidad ? r.especialidad.substring(0, 15) : 'UCI'
                ]);

                autoTable(doc, {
                    startY: lastY + 3,
                    head: [['Cama/Box', 'Paciente', 'Financiador', 'Ingreso', 'Alta', 'Especialidad']],
                    body: sampleRows,
                    theme: 'striped',
                    headStyles: { fillColor: [71, 85, 105], textColor: 255, fontSize: 7, fontStyle: 'bold' },
                    styles: { fontSize: 7, cellPadding: 1.8 }
                });
            }
        }

        // Pie de Página
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(7);
            doc.setTextColor(148, 163, 184);
            doc.text(`Página ${i} de ${pageCount} — Documento emitido por Sistema de Gestión ADM-QUI / Calidad Sanatorio Argentino`, 105, 290, { align: 'center' });
        }

        const dateStr = new Date().toISOString().split('T')[0];
        doc.save(`Reporte_Gobernanza_UCI_${dateStr}.pdf`);
    };

    const handleTabChange = (tabId) => {
        setSelectedTab(tabId);
        if (tabId === 'infographic') {
            setImageStatus('idle');
            setImageSrc(null);
        } else if (['presentation', 'conceptual_map', 'speech_script'].includes(tabId)) {
            setFlashStatus('idle');
            setFlashContent('');
        }
    };

    const handleThemeChange = (theme) => {
        setSelectedTheme(theme);
        if (selectedTab === 'infographic') {
            setImageStatus('idle');
            setImageSrc(null);
        } else if (['presentation', 'conceptual_map', 'speech_script'].includes(selectedTab)) {
            setFlashStatus('idle');
            setFlashContent('');
        }
    };

    const handleDownloadImage = () => {
        if (!imageSrc) return;
        const a = document.createElement('a');
        a.href = imageSrc;
        a.download = `Infografia_Sanatorio_${new Date().getTime()}.jpg`;
        a.click();
    };

    const handleCopyText = () => {
        if (!flashContent || typeof flashContent === 'object') return;
        navigator.clipboard.writeText(flashContent);
        alert('Copiado al portapapeles');
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '24px'
        }}>
            <div style={{
                background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '1120px', height: '90vh',
                display: 'flex', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
                animation: 'scale-up 0.3s ease-out'
            }}>
                
                {/* SIDEBAR DE FORMATOS DE EXPORTACIÓN */}
                <div style={{ width: '300px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#1E40AF' }}>
                            <Sparkles size={20} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1E293B', fontWeight: 700 }}>Centro de Exportación</h2>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.78rem', color: '#64748B' }}>
                            {globalMetrics.sector || 'Cuidados Críticos (UCI)'} — 16 Camas
                        </p>
                    </div>
                    
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                    padding: '12px 14px', borderRadius: '10px',
                                    background: selectedTab === tab.id ? '#EFF6FF' : 'transparent',
                                    border: selectedTab === tab.id ? '1px solid #BFDBFE' : '1px solid transparent',
                                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s ease'
                                }}
                            >
                                <div style={{ 
                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                    color: selectedTab === tab.id ? '#1E40AF' : '#475569', 
                                    fontWeight: selectedTab === tab.id ? 700 : 600,
                                    fontSize: '0.86rem'
                                }}>
                                    {tab.icon} {tab.label}
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '3px' }}>
                                    {tab.description}
                                </div>
                            </button>
                        ))}
                    </div>

                    {/* Resumen inferior de indicadores cargados */}
                    <div style={{ padding: '14px', borderTop: '1px solid #E2E8F0', background: '#FFFFFF', fontSize: '0.75rem', color: '#64748B' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#10B981', fontWeight: 600, marginBottom: '2px' }}>
                            <CheckCircle2 size={14} />
                            {effectiveIndicators.length} Indicadores UCI Activos
                        </div>
                        <div>Ocupación: <b>{globalMetrics.porcOcupacion || '—'}%</b> | {globalMetrics.diasOcupados || 0} camas-día</div>
                    </div>
                </div>

                {/* LIENZO DE CONTENIDO PRINCIPAL */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    
                    {/* BARRA SUPERIOR DEL MODAL */}
                    <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1.05rem', fontWeight: 700 }}>
                                {tabs.find(t => t.id === selectedTab)?.label}
                            </h3>
                            
                            {/* Selector de Paleta Institucional (aplica a PPTX, Infografía y Mermaid) */}
                            {['presentation', 'infographic', 'conceptual_map'].includes(selectedTab) && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#F1F5F9', padding: '4px 10px', borderRadius: '8px' }}>
                                    <Palette size={15} color="#64748B" />
                                    <select 
                                        value={selectedTheme} 
                                        onChange={(e) => handleThemeChange(e.target.value)}
                                        style={{ border: 'none', background: 'transparent', color: '#334155', fontWeight: 600, fontSize: '0.78rem', outline: 'none', cursor: 'pointer' }}
                                    >
                                        <option value="institutional_blue">Azul Institucional (Sanatorio)</option>
                                        <option value="surgical_green">Verde Quirúrgico</option>
                                        <option value="minimalist">Minimalista Blanco / Negro</option>
                                    </select>
                                </div>
                            )}
                        </div>

                        <button 
                            onClick={onClose} 
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B', padding: '4px' }}
                            title="Cerrar modal"
                        >
                            <X size={22} />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '24px', backgroundColor: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        
                        {/* ─── TAB 1: PRESENTACIÓN PPTX ─── */}
                        {selectedTab === 'presentation' && (
                            <div style={{ width: '100%', maxWidth: '820px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                {flashStatus === 'generating' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', gap: '16px', color: '#1E40AF' }}>
                                        <Loader2 size={44} style={{ animation: 'spin 1.2s linear infinite' }} />
                                        <div style={{ textAlign: 'center' }}>
                                            <h3 style={{ margin: 0, color: '#1E293B' }}>Estructurando diapositivas con IA...</h3>
                                            <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#64748B' }}>Calculando métricas de UCI y redactando notas de orador</p>
                                        </div>
                                    </div>
                                )}

                                {flashStatus === 'error' && (
                                    <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', padding: '16px 20px', borderRadius: '10px', color: '#991B1B', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>{flashError}</span>
                                        <button onClick={() => generateOmniFlash('presentation')} style={{ padding: '6px 14px', borderRadius: '6px', border: '1px solid #DC2626', background: '#FFFFFF', color: '#DC2626', fontWeight: 600, cursor: 'pointer' }}>
                                            Reintentar
                                        </button>
                                    </div>
                                )}

                                {flashStatus === 'success' && flashContent && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                                        <div style={{ background: '#FFFFFF', padding: '22px 26px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <div>
                                                <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: 700 }}>Presentación Lista para Descargar</h2>
                                                <p style={{ margin: '4px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
                                                    Se estructuraron {flashContent.slides?.length || 0} diapositivas PowerPoint con colores institucionales y notas de orador.
                                                </p>
                                            </div>
                                            <button 
                                                onClick={() => generatePPTX(flashContent.slides)} 
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                                    padding: '12px 24px', background: '#1E40AF', color: '#FFFFFF', 
                                                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem',
                                                    boxShadow: '0 4px 6px -1px rgba(30, 64, 175, 0.3)'
                                                }}
                                            >
                                                <Download size={18} /> Descargar Archivo PPTX
                                            </button>
                                        </div>

                                        {/* Vista Previa de Diapositivas */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                            {flashContent.slides?.map((slide, sIdx) => (
                                                <div key={sIdx} style={{ background: '#FFFFFF', borderRadius: '10px', border: '1px solid #E2E8F0', padding: '16px 20px' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '8px', marginBottom: '10px' }}>
                                                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF', textTransform: 'uppercase' }}>
                                                            Diapositiva {sIdx + 1}
                                                        </span>
                                                        {slide.subtitle && <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>{slide.subtitle}</span>}
                                                    </div>
                                                    <h4 style={{ margin: '0 0 10px', color: '#0F172A', fontSize: '1rem' }}>{slide.title}</h4>
                                                    <ul style={{ margin: 0, paddingLeft: '20px', color: '#334155', fontSize: '0.85rem', lineHeight: '1.6' }}>
                                                        {slide.bullets?.map((b, bIdx) => (
                                                            <li key={bIdx}>{b}</li>
                                                        ))}
                                                    </ul>
                                                    {slide.notes && (
                                                        <div style={{ marginTop: '10px', padding: '8px 12px', background: '#F8FAFC', borderRadius: '6px', fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                                                            💬 <b>Notas del Orador:</b> {slide.notes}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── TAB 2: PLANILLA EXCEL (.XLSX) ─── */}
                        {selectedTab === 'excel_sheet' && (
                            <div style={{ width: '100%', maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ background: '#FFFFFF', padding: '26px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                                    <FileSpreadsheet size={52} color="#16A34A" style={{ margin: '0 auto 14px' }} />
                                    <h2 style={{ margin: '0 0 8px', color: '#1E293B', fontSize: '1.3rem', fontWeight: 700 }}>
                                        Exportación Tabulada a Microsoft Excel (.xlsx)
                                    </h2>
                                    <p style={{ margin: '0 0 24px', color: '#64748B', fontSize: '0.88rem', maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto' }}>
                                        Descarga un libro de cálculo profesional con hojas separadas: tabla de indicadores clave (KPIs) y nómina clínica auditada con camas, pacientes, fechas de internación y diagnósticos.
                                    </p>

                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px', marginBottom: '24px', textAlign: 'left' }}>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Capacidad UCI</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E293B', marginTop: '4px' }}>16 Camas</div>
                                            <span style={{ fontSize: '0.7rem', color: '#10B981' }}>8 Intensiva + 8 Intermedia</span>
                                        </div>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Ocupación</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#1E40AF', marginTop: '4px' }}>{globalMetrics.porcOcupacion || '—'}%</div>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>{globalMetrics.diasOcupados || 0} camas-día</span>
                                        </div>
                                        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '12px', borderRadius: '8px' }}>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700 }}>Registros Clínicos</span>
                                            <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{rawRows?.length || 0}</div>
                                            <span style={{ fontSize: '0.7rem', color: '#64748B' }}>Filas tabuladas</span>
                                        </div>
                                    </div>

                                    <button 
                                        onClick={handleDownloadExcel} 
                                        style={{ 
                                            display: 'inline-flex', alignItems: 'center', gap: '8px', 
                                            padding: '14px 32px', background: '#16A34A', color: '#FFFFFF', 
                                            border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
                                            boxShadow: '0 4px 10px rgba(22, 163, 74, 0.25)'
                                        }}
                                    >
                                        <Download size={20} /> Descargar Archivo Excel (.xlsx)
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB 3: REPORTE EJECUTIVO PDF ─── */}
                        {selectedTab === 'pdf_report' && (
                            <div style={{ width: '100%', maxWidth: '780px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                <div style={{ background: '#FFFFFF', padding: '26px', borderRadius: '14px', border: '1px solid #E2E8F0', boxShadow: '0 2px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                                    <FileText size={52} color="#1E40AF" style={{ margin: '0 auto 14px' }} />
                                    <h2 style={{ margin: '0 0 8px', color: '#1E293B', fontSize: '1.3rem', fontWeight: 700 }}>
                                        Reporte Clínico Formal en PDF
                                    </h2>
                                    <p style={{ margin: '0 0 24px', color: '#64748B', fontSize: '0.88rem', maxWidth: '580px', marginLeft: 'auto', marginRight: 'auto' }}>
                                        Genera un informe con membrete del Sanatorio Argentino, paleta institucional en azul marino, KPIs destacados y tabla formal lista para imprimir o elevar al Comité de Dirección.
                                    </p>

                                    <button 
                                        onClick={handleDownloadPdf} 
                                        style={{ 
                                            display: 'inline-flex', alignItems: 'center', gap: '8px', 
                                            padding: '14px 32px', background: '#0D3B66', color: '#FFFFFF', 
                                            border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700, fontSize: '0.95rem',
                                            boxShadow: '0 4px 10px rgba(13, 59, 102, 0.3)'
                                        }}
                                    >
                                        <Download size={20} /> Descargar Informe PDF Institucional
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* ─── TAB 4: INFOGRAFÍA VISUAL IA ─── */}
                        {selectedTab === 'infographic' && (
                            <div style={{ width: '100%', maxWidth: '640px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px' }}>
                                {imageStatus === 'generating' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', gap: '16px', color: '#1E40AF' }}>
                                        <Loader2 size={44} style={{ animation: 'spin 1.2s linear infinite' }} />
                                        <div style={{ textAlign: 'center' }}>
                                            <h3 style={{ margin: 0, color: '#1E293B' }}>Generando infografía visual con Gemini...</h3>
                                            <p style={{ margin: '6px 0 0', fontSize: '0.85rem', color: '#64748B' }}>Aplicando estética clínica y números exactos del Sanatorio</p>
                                        </div>
                                    </div>
                                )}

                                {(imageStatus === 'error' || imageStatus === 'idle') && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '30px' }}>
                                        {imageStatus === 'error' && (
                                            <div style={{ color: '#DC2626', background: '#FEE2E2', border: '1px solid #FECACA', padding: '12px 18px', borderRadius: '8px', fontSize: '0.85rem' }}>
                                                {imageError}
                                            </div>
                                        )}
                                        <button 
                                            onClick={generateInfographic} 
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: '8px', 
                                                padding: '12px 28px', background: '#1E40AF', color: 'white', 
                                                border: 'none', borderRadius: '10px', cursor: 'pointer', fontWeight: 700,
                                                boxShadow: '0 4px 10px rgba(30, 64, 175, 0.25)'
                                            }}
                                        >
                                            <Sparkles size={18} /> Generar Infografía Visual IA
                                        </button>
                                    </div>
                                )}

                                {imageStatus === 'success' && imageSrc && (
                                    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', alignItems: 'center' }}>
                                        <img src={imageSrc} alt="Infografía Visual Sanatorio Argentino" style={{ width: '100%', borderRadius: '12px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)' }} />
                                        <button 
                                            onClick={handleDownloadImage} 
                                            style={{ 
                                                display: 'flex', alignItems: 'center', gap: '8px', 
                                                padding: '10px 24px', background: '#10B981', color: 'white', 
                                                border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 700 
                                            }}
                                        >
                                            <Download size={18} /> Guardar Imagen (JPG)
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── TAB 5: MAPA CONCEPTUAL (MERMAID) ─── */}
                        {selectedTab === 'conceptual_map' && (
                            <div style={{ width: '100%', maxWidth: '840px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {flashStatus === 'generating' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', gap: '16px', color: '#1E40AF' }}>
                                        <Loader2 size={44} style={{ animation: 'spin 1.2s linear infinite' }} />
                                        <h3 style={{ margin: 0, color: '#1E293B' }}>Diseñando grafo conceptual en Mermaid...</h3>
                                    </div>
                                )}

                                {flashStatus === 'error' && (
                                    <div style={{ background: '#FEE2E2', padding: '14px 18px', borderRadius: '8px', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>{flashError}</span>
                                        <button onClick={() => generateOmniFlash('conceptual_map')} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #DC2626', background: 'transparent', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>
                                            Reintentar
                                        </button>
                                    </div>
                                )}

                                {flashStatus === 'success' && flashContent && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div style={{ background: '#FFFFFF', padding: '24px', borderRadius: '12px', border: '1px solid #E2E8F0', overflowX: 'auto' }}>
                                            <MermaidRenderer chart={flashContent} />
                                        </div>
                                        <button onClick={handleCopyText} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1E40AF', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                            <Copy size={16} /> Copiar Código Mermaid
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ─── TAB 6: GUIÓN DE DISCURSO ─── */}
                        {selectedTab === 'speech_script' && (
                            <div style={{ width: '100%', maxWidth: '820px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                {flashStatus === 'generating' && (
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '350px', gap: '16px', color: '#1E40AF' }}>
                                        <Loader2 size={44} style={{ animation: 'spin 1.2s linear infinite' }} />
                                        <h3 style={{ margin: 0, color: '#1E293B' }}>Redactando discurso ejecutivo...</h3>
                                    </div>
                                )}

                                {flashStatus === 'error' && (
                                    <div style={{ background: '#FEE2E2', padding: '14px 18px', borderRadius: '8px', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <span>{flashError}</span>
                                        <button onClick={() => generateOmniFlash('speech_script')} style={{ padding: '4px 10px', borderRadius: '4px', border: '1px solid #DC2626', background: 'transparent', color: '#DC2626', cursor: 'pointer', fontWeight: 600 }}>
                                            Reintentar
                                        </button>
                                    </div>
                                )}

                                {flashStatus === 'success' && flashContent && (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                                        <div className="markdown-body" style={{ background: '#FFFFFF', padding: '28px', borderRadius: '12px', border: '1px solid #E2E8F0', color: '#334155', lineHeight: '1.7' }}>
                                            <ReactMarkdown>{flashContent}</ReactMarkdown>
                                        </div>
                                        <button onClick={handleCopyText} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 22px', background: '#1E40AF', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                            <Copy size={16} /> Copiar Discurso Completo
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                    </div>
                </div>

                <style dangerouslySetInnerHTML={{__html: `
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    @keyframes scale-up { from { transform: scale(0.96); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #0F172A; margin-top: 14px; margin-bottom: 8px; font-weight: 700; }
                    .markdown-body p { margin-bottom: 12px; }
                    .markdown-body ul { padding-left: 20px; margin-bottom: 12px; }
                    .markdown-body li { margin-bottom: 6px; }
                `}} />
            </div>
        </div>
    );
}
