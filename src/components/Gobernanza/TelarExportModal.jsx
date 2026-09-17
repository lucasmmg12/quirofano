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
import { getSanatorioLogoBase64 } from '../../utils/sanatorioLogoBase64';

export default function TelarExportModal({ activeIndicators = [], globalMetrics = {}, rawRows = [], onClose }) {
    const [selectedTab, setSelectedTab] = useState('presentation');
    const [selectedTheme, setSelectedTheme] = useState('institutional_blue');
    const [isExportingPPTX, setIsExportingPPTX] = useState(false);
    
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

    // Paletas temáticas ejecutivas para PowerPoint (Sanatorio Argentino)
    const PPTX_THEMES = {
        institutional_blue: {
            coverBg: '0A192F',          // Azul Noche / Navy Institucional Sanatorio
            coverAccent: '0284C7',      // Cyan Médico
            coverSecondary: '38BDF8',   // Celeste Luminoso
            coverCardBg: '112240',      // Tarjeta Medianoche
            coverCardBorder: '1E3A8A',  // Borde Navy
            slideBg: 'F8FAFC',          // Lienzo Clínico Blanco Suave
            topBarPrimary: '0F2942',    // Franja Superior Primaria
            topBarAccent: '0284C7',     // Franja Superior Secundaria
            titleColor: '0F172A',       // Título Slate 900
            subtitleColor: '64748B',    // Subtítulo Slate 500
            cardBg: 'FFFFFF',           // Tarjeta Blanca Pura
            cardBorder: 'E2E8F0',       // Borde Slate 200
            accentPrimary: '1E40AF',    // Azul Real Sanatorio
            accentSecondary: '0284C7',  // Cyan Asistencial
            badgeBg: 'EFF6FF',          // Píldora Celeste Suave
            badgeBorder: 'BFDBFE',
            badgeText: '1E40AF',
            bodyColor: '334155',        // Texto Slate 700
            footerColor: '94A3B8'
        },
        surgical_green: {
            coverBg: '064E3B',          // Verde Bosque Quirúrgico
            coverAccent: '10B981',      // Esmeralda Quirúrgico
            coverSecondary: '34D399',   // Menta Suave
            coverCardBg: '065F46',      // Tarjeta Jade Oscuro
            coverCardBorder: '047857',  // Borde Verde
            slideBg: 'F0FDF4',          // Lienzo Clínico Verde Suave
            topBarPrimary: '064E3B',    // Franja Superior Verde Oscuro
            topBarAccent: '10B981',     // Franja Superior Esmeralda
            titleColor: '064E3B',       // Título Verde
            subtitleColor: '475569',    // Subtítulo Slate 600
            cardBg: 'FFFFFF',
            cardBorder: 'D1FAE5',
            accentPrimary: '059669',
            accentSecondary: '10B981',
            badgeBg: 'ECFDF5',
            badgeBorder: 'A7F3D0',
            badgeText: '065F46',
            bodyColor: '334155',
            footerColor: '94A3B8'
        },
        minimalist: {
            coverBg: '0F172A',          // Pizarra Oscura
            coverAccent: '475569',      // Gris Neutro
            coverSecondary: '94A3B8',   // Gris Claro
            coverCardBg: '1E293B',      // Tarjeta Slate
            coverCardBorder: '334155',  // Borde
            slideBg: 'F8FAFC',          // Blanco Clínico
            topBarPrimary: '0F172A',
            topBarAccent: '475569',
            titleColor: '0F172A',
            subtitleColor: '64748B',
            cardBg: 'FFFFFF',
            cardBorder: 'E2E8F0',
            accentPrimary: '1E293B',
            accentSecondary: '64748B',
            badgeBg: 'F1F5F9',
            badgeBorder: 'CBD5E1',
            badgeText: '0F172A',
            bodyColor: '334155',
            footerColor: '94A3B8'
        }
    };

    // Generador PPTX de Alta Gama con pptxgenjs y Logo Oficial Sanatorio Argentino
    const generatePPTX = async (slidesData) => {
        if (!slidesData || slidesData.length === 0) return;

        try {
            setIsExportingPPTX(true);
            const pptx = new pptxgen();
            pptx.layout = 'LAYOUT_16x9'; // Formato moderno panorámico 16:9 (13.33 x 7.5 pulgadas)

            const theme = PPTX_THEMES[selectedTheme] || PPTX_THEMES.institutional_blue;
            const logoB64 = await getSanatorioLogoBase64();

            const sectorLabel = globalMetrics.sector || 'Cuidados Críticos (UCI)';
            const subNivelLabel = globalMetrics.subNivel ? ` - ${globalMetrics.subNivel}` : ' (16 Camas)';
            const periodoLabel = `${globalMetrics.fechaDesde || 'Inicio'} al ${globalMetrics.fechaHasta || 'Fin'}`;

            slidesData.forEach((slide, sIdx) => {
                const pptSlide = pptx.addSlide();

                if (sIdx === 0) {
                    // ── DIAPOSITIVA 1: PORTADA EJECUTIVA DE ALTO IMPACTO ──
                    pptSlide.background = { color: theme.coverBg };

                    // Franjas de acento institucional lateral
                    pptSlide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 0.28, h: 7.5, fill: { color: theme.coverAccent }, line: { color: theme.coverAccent } });
                    pptSlide.addShape(pptx.shapes.RECTANGLE, { x: 0.28, y: 0, w: 0.12, h: 7.5, fill: { color: theme.coverSecondary }, line: { color: theme.coverSecondary } });

                    // Insignia contenedor blanco del Logo oficial
                    pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { x: 1.0, y: 0.75, w: 1.5, h: 1.5, fill: { color: 'FFFFFF' }, line: { color: 'E2E8F0', width: 1 }, rectRadius: 0.15 });
                    if (logoB64) {
                        pptSlide.addImage({ data: logoB64, x: 1.15, y: 0.9, w: 1.2, h: 1.2 });
                    }

                    // Título institucional membretado
                    pptSlide.addText('SANATORIO ARGENTINO', { 
                        x: 2.8, y: 0.95, w: 9.5, h: 0.4, 
                        fontSize: 16, bold: true, color: theme.coverSecondary, 
                        fontFace: 'Segoe UI', charSpacing: 3 
                    });
                    pptSlide.addText('SISTEMA DE GOBERNANZA CLÍNICA & GESTIÓN MÉDICA', { 
                        x: 2.8, y: 1.35, w: 9.5, h: 0.35, 
                        fontSize: 11, bold: true, color: '94A3B8', 
                        fontFace: 'Segoe UI', charSpacing: 1.5 
                    });

                    // Título y Subtítulo de la Portada
                    const coverTitle = (slide.title || 'INFORME EJECUTIVO DE GOBERNANZA CLÍNICA').toUpperCase();
                    pptSlide.addText(coverTitle, { 
                        x: 1.0, y: 2.65, w: 11.33, h: 1.3, 
                        fontSize: 30, bold: true, color: 'FFFFFF', 
                        fontFace: 'Segoe UI', valign: 'top' 
                    });

                    const coverSubtitle = slide.subtitle || 'Auditoría Integral de Ocupación, Rotación y Seguridad del Paciente';
                    pptSlide.addText(coverSubtitle, { 
                        x: 1.0, y: 4.05, w: 11.33, h: 0.65, 
                        fontSize: 15, color: 'CBD5E1', 
                        fontFace: 'Segoe UI' 
                    });

                    // Tarjetas de Metadatos Ejecutivos en la Portada
                    const metaCards = [
                        { label: 'SECTOR CLÍNICO', val: `${sectorLabel}${subNivelLabel}` },
                        { label: 'PERÍODO AUDITADO', val: periodoLabel },
                        { label: 'OCUPACIÓN GLOBAL', val: globalMetrics.porcOcupacion ? `${globalMetrics.porcOcupacion}% (${globalMetrics.diasOcupados || 0} c-día)` : 'UCI 16 Camas' },
                        { label: 'CALIDAD ASISTENCIAL', val: 'Sanatorio Argentino' }
                    ];

                    metaCards.forEach((c, idx) => {
                        const xPos = 1.0 + idx * 2.85;
                        pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                            x: xPos, y: 5.35, w: 2.7, h: 1.3, 
                            fill: { color: theme.coverCardBg }, 
                            line: { color: theme.coverCardBorder, width: 1 }, 
                            rectRadius: 0.1 
                        });
                        pptSlide.addText(c.label, { 
                            x: xPos + 0.15, y: 5.5, w: 2.4, h: 0.25, 
                            fontSize: 9, bold: true, color: theme.coverSecondary, 
                            fontFace: 'Segoe UI', charSpacing: 1 
                        });
                        pptSlide.addText(c.val, { 
                            x: xPos + 0.15, y: 5.8, w: 2.4, h: 0.65, 
                            fontSize: 12, bold: true, color: 'FFFFFF', 
                            fontFace: 'Segoe UI' 
                        });
                    });
                } else {
                    // ── DIAPOSITIVAS 2 A N: CONTENIDO CLÍNICO EJECUTIVO ──
                    pptSlide.background = { color: theme.slideBg };

                    // Barra superior doble acento
                    pptSlide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0, w: 13.33, h: 0.08, fill: { color: theme.topBarPrimary }, line: { color: theme.topBarPrimary } });
                    pptSlide.addShape(pptx.shapes.RECTANGLE, { x: 0, y: 0.08, w: 13.33, h: 0.04, fill: { color: theme.topBarAccent }, line: { color: theme.topBarAccent } });

                    // Logo y Membrete Superior
                    if (logoB64) {
                        pptSlide.addImage({ data: logoB64, x: 0.8, y: 0.32, w: 0.65, h: 0.65 });
                    }
                    pptSlide.addText('SANATORIO ARGENTINO  |  GOBERNANZA CLÍNICA UCI', { 
                        x: 1.6, y: 0.38, w: 8.5, h: 0.25, 
                        fontSize: 10, bold: true, color: theme.topBarAccent, 
                        fontFace: 'Segoe UI', charSpacing: 1.5 
                    });
                    pptSlide.addText(slide.title || 'Análisis Clínico y Operativo', { 
                        x: 1.6, y: 0.65, w: 10.5, h: 0.55, 
                        fontSize: 22, bold: true, color: theme.titleColor, 
                        fontFace: 'Segoe UI' 
                    });

                    const startY = slide.subtitle ? 1.65 : 1.45;
                    if (slide.subtitle) {
                        pptSlide.addText(slide.subtitle, { 
                            x: 1.6, y: 1.2, w: 10.5, h: 0.35, 
                            fontSize: 12.5, italic: true, color: theme.subtitleColor, 
                            fontFace: 'Segoe UI' 
                        });
                    }

                    const bullets = slide.bullets || [];

                    if (bullets.length <= 4) {
                        // Tarjetas horizontales de ancho completo
                        const cardH = bullets.length <= 3 ? 1.1 : 0.95;
                        const gap = 0.15;
                        bullets.forEach((b, bIdx) => {
                            const yPos = startY + bIdx * (cardH + gap);

                            // Contenedor de tarjeta blanca con borde
                            pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                                x: 0.8, y: yPos, w: 11.73, h: cardH, 
                                fill: { color: theme.cardBg }, 
                                line: { color: theme.cardBorder, width: 1 }, 
                                rectRadius: 0.08 
                            });

                            // Franja vertical de acento en el borde izquierdo
                            pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                                x: 0.8, y: yPos, w: 0.14, h: cardH, 
                                fill: { color: bIdx % 2 === 0 ? theme.accentPrimary : theme.accentSecondary }, 
                                line: { color: bIdx % 2 === 0 ? theme.accentPrimary : theme.accentSecondary }, 
                                rectRadius: 0.08 
                            });

                            // Píldora de numeración (01, 02...)
                            pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                                x: 1.12, y: yPos + (cardH - 0.55) / 2, w: 0.55, h: 0.55, 
                                fill: { color: theme.badgeBg }, 
                                line: { color: theme.badgeBorder, width: 1 }, 
                                rectRadius: 0.08 
                            });
                            pptSlide.addText('0' + (bIdx + 1), { 
                                x: 1.12, y: yPos + (cardH - 0.55) / 2 + 0.04, w: 0.55, h: 0.45, 
                                fontSize: 12, bold: true, color: theme.badgeText, 
                                fontFace: 'Segoe UI', align: 'center' 
                            });

                            // Separación inteligente de texto (título destacado antes de ':')
                            const colonIdx = b.indexOf(':');
                            let textRuns = [];
                            if (colonIdx > 0 && colonIdx < 40) {
                                textRuns.push({ text: b.substring(0, colonIdx + 1), options: { bold: true, color: theme.titleColor, fontSize: 13.5, fontFace: 'Segoe UI' } });
                                textRuns.push({ text: b.substring(colonIdx + 1), options: { bold: false, color: theme.bodyColor, fontSize: 13.5, fontFace: 'Segoe UI' } });
                            } else {
                                textRuns.push({ text: b, options: { bold: false, color: theme.bodyColor, fontSize: 13.5, fontFace: 'Segoe UI' } });
                            }
                            pptSlide.addText(textRuns, { x: 1.85, y: yPos + 0.1, w: 10.45, h: cardH - 0.2, valign: 'middle' });
                        });
                    } else {
                        // Cuadrícula ejecutiva de 2 columnas balanceadas
                        const colW = 5.75;
                        const cardH = 0.9;
                        const gap = 0.12;
                        bullets.forEach((b, bIdx) => {
                            const isCol2 = bIdx >= Math.ceil(bullets.length / 2);
                            const rowIdx = isCol2 ? bIdx - Math.ceil(bullets.length / 2) : bIdx;
                            const colX = isCol2 ? 6.78 : 0.8;
                            const yPos = startY + rowIdx * (cardH + gap);

                            pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                                x: colX, y: yPos, w: colW, h: cardH, 
                                fill: { color: theme.cardBg }, 
                                line: { color: theme.cardBorder, width: 1 }, 
                                rectRadius: 0.08 
                            });
                            pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                                x: colX, y: yPos, w: 0.12, h: cardH, 
                                fill: { color: bIdx % 2 === 0 ? theme.accentPrimary : theme.accentSecondary }, 
                                line: { color: bIdx % 2 === 0 ? theme.accentPrimary : theme.accentSecondary }, 
                                rectRadius: 0.08 
                            });

                            pptSlide.addShape(pptx.shapes.ROUNDED_RECTANGLE, { 
                                x: colX + 0.25, y: yPos + 0.18, w: 0.5, h: 0.5, 
                                fill: { color: theme.badgeBg }, 
                                line: { color: theme.badgeBorder, width: 1 }, 
                                rectRadius: 0.08 
                            });
                            pptSlide.addText('0' + (bIdx + 1), { 
                                x: colX + 0.25, y: yPos + 0.2, w: 0.5, h: 0.45, 
                                fontSize: 11, bold: true, color: theme.badgeText, 
                                fontFace: 'Segoe UI', align: 'center' 
                            });

                            const colonIdx = b.indexOf(':');
                            let textRuns = [];
                            if (colonIdx > 0 && colonIdx < 35) {
                                textRuns.push({ text: b.substring(0, colonIdx + 1), options: { bold: true, color: theme.titleColor, fontSize: 12, fontFace: 'Segoe UI' } });
                                textRuns.push({ text: b.substring(colonIdx + 1), options: { bold: false, color: theme.bodyColor, fontSize: 12, fontFace: 'Segoe UI' } });
                            } else {
                                textRuns.push({ text: b, options: { bold: false, color: theme.bodyColor, fontSize: 12, fontFace: 'Segoe UI' } });
                            }
                            pptSlide.addText(textRuns, { x: colX + 0.85, y: yPos + 0.08, w: colW - 0.95, h: cardH - 0.16, valign: 'middle' });
                        });
                    }

                    // Pie de página institucional
                    pptSlide.addShape(pptx.shapes.LINE, { x: 0.8, y: 6.82, w: 11.73, h: 0, line: { color: theme.cardBorder, width: 1 } });
                    pptSlide.addText('Sanatorio Argentino • Informe Oficial de Gobernanza Clínica y Calidad Asistencial • Confidencial', { 
                        x: 0.8, y: 6.9, w: 8, h: 0.3, 
                        fontSize: 9, color: theme.footerColor, fontFace: 'Segoe UI' 
                    });
                    pptSlide.addText(`Diapositiva ${sIdx + 1} de ${slidesData.length}`, { 
                        x: 9.53, y: 6.9, w: 3, h: 0.3, 
                        fontSize: 9, color: theme.footerColor, fontFace: 'Segoe UI', align: 'right' 
                    });
                }

                // Notas del orador incrustadas en PowerPoint
                if (slide.notes) {
                    pptSlide.addNotes(slide.notes);
                }
            });

            const dateStr = new Date().toISOString().split('T')[0];
            await pptx.writeFile({ fileName: `Sanatorio_Argentino_Reporte_UCI_${dateStr}.pptx` });
        } catch (err) {
            console.error('Error al generar PPTX:', err);
            alert('Error al generar la presentación PPTX: ' + (err.message || ''));
        } finally {
            setIsExportingPPTX(false);
        }
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

    const [downloadingMermaid, setDownloadingMermaid] = useState(false);

    const handleDownloadMermaidImage = () => {
        try {
            setDownloadingMermaid(true);
            const container = document.getElementById('telar-mermaid-container');
            const svgElement = container?.querySelector('svg');
            if (!svgElement) {
                alert('No se encontró el diagrama visual para exportar.');
                setDownloadingMermaid(false);
                return;
            }

            // Clonar SVG para no alterar el DOM
            const clonedSvg = svgElement.cloneNode(true);

            // Obtener dimensiones reales del diagrama
            let width = 1200;
            let height = 800;
            const viewBox = svgElement.getAttribute('viewBox');
            if (viewBox) {
                const parts = viewBox.split(/\s+/).map(Number);
                if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
                    width = parts[2];
                    height = parts[3];
                }
            } else {
                const bbox = svgElement.getBoundingClientRect();
                width = bbox.width || 1200;
                height = bbox.height || 800;
            }

            // Margen para padding prolijo
            const padding = 36;
            const exportWidth = Math.ceil(width + padding * 2);
            const exportHeight = Math.ceil(height + padding * 2);

            clonedSvg.setAttribute('width', exportWidth);
            clonedSvg.setAttribute('height', exportHeight);
            clonedSvg.setAttribute('viewBox', `-${padding} -${padding} ${exportWidth} ${exportHeight}`);
            clonedSvg.style.backgroundColor = '#FFFFFF';

            // Serializar XML del SVG
            const serializer = new XMLSerializer();
            let svgString = serializer.serializeToString(clonedSvg);
            if (!svgString.match(/^<svg[^>]+xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)) {
                svgString = svgString.replace(/^<svg/, '<svg xmlns="http://www.w3.org/2000/svg"');
            }

            const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
            const URL = window.URL || window.webkitURL || window;
            const blobURL = URL.createObjectURL(svgBlob);

            const img = new Image();
            img.onload = () => {
                const scale = 2; // Resolución HD Retina 2x
                const canvas = document.createElement('canvas');
                canvas.width = exportWidth * scale;
                canvas.height = exportHeight * scale;
                const ctx = canvas.getContext('2d');

                // Fondo blanco clínico Sanatorio Argentino
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);

                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(blobURL);

                canvas.toBlob((blob) => {
                    setDownloadingMermaid(false);
                    if (!blob) return;
                    const dateStr = new Date().toISOString().split('T')[0];
                    const a = document.createElement('a');
                    a.download = `Diagrama_Conceptual_UCI_${dateStr}.png`;
                    a.href = URL.createObjectURL(blob);
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(a.href);
                }, 'image/png', 1.0);
            };

            img.onerror = (e) => {
                setDownloadingMermaid(false);
                console.warn('Fallback a exportación SVG:', e);
                const dateStr = new Date().toISOString().split('T')[0];
                const a = document.createElement('a');
                a.download = `Diagrama_Conceptual_UCI_${dateStr}.svg`;
                a.href = blobURL;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            };

            img.src = blobURL;
        } catch (err) {
            setDownloadingMermaid(false);
            console.error('Error al exportar diagrama:', err);
            alert('Error al exportar imagen: ' + err.message);
        }
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
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <img src="/logosanatorio.png" alt="Sanatorio Argentino" style={{ width: '28px', height: '28px', objectFit: 'contain' }} />
                                                    <h2 style={{ margin: 0, fontSize: '1.25rem', color: '#1E293B', fontWeight: 700 }}>Presentación Lista para Descargar</h2>
                                                </div>
                                                <p style={{ margin: '6px 0 0', color: '#64748B', fontSize: '0.85rem' }}>
                                                    Estructuradas {flashContent.slides?.length || 0} diapositivas ejecutivas (16:9) con logo oficial, tipografía Segoe UI, colores institucionales y notas de orador.
                                                </p>
                                            </div>
                                            <button 
                                                onClick={() => generatePPTX(flashContent.slides)} 
                                                disabled={isExportingPPTX}
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                                    padding: '12px 24px', 
                                                    background: isExportingPPTX ? '#94A3B8' : (selectedTheme === 'surgical_green' ? '#059669' : '#1E40AF'), 
                                                    color: '#FFFFFF', 
                                                    border: 'none', borderRadius: '8px', cursor: isExportingPPTX ? 'not-allowed' : 'pointer', 
                                                    fontWeight: 700, fontSize: '0.9rem',
                                                    boxShadow: '0 4px 6px -1px rgba(30, 64, 175, 0.3)',
                                                    transition: 'all 0.2s'
                                                }}
                                            >
                                                {isExportingPPTX ? (
                                                    <>
                                                        <Loader2 size={18} style={{ animation: 'spin 1.2s linear infinite' }} />
                                                        Generando PPTX...
                                                    </>
                                                ) : (
                                                    <>
                                                        <Download size={18} /> Descargar Archivo PPTX (16:9)
                                                    </>
                                                )}
                                            </button>
                                        </div>

                                        {/* Vista Previa Ejecutiva de Diapositivas */}
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                            {flashContent.slides?.map((slide, sIdx) => (
                                                sIdx === 0 ? (
                                                    /* Portada Ejecutiva de Alto Impacto */
                                                    <div key={sIdx} style={{ 
                                                        background: selectedTheme === 'surgical_green' 
                                                            ? 'linear-gradient(135deg, #064E3B 0%, #065F46 100%)' 
                                                            : selectedTheme === 'minimalist' 
                                                            ? 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)' 
                                                            : 'linear-gradient(135deg, #0A192F 0%, #0F2942 100%)', 
                                                        borderRadius: '14px', border: '1px solid rgba(255,255,255,0.12)', padding: '24px 28px', color: '#fff',
                                                        boxShadow: '0 10px 25px -5px rgba(10, 25, 47, 0.4)', position: 'relative', overflow: 'hidden'
                                                    }}>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, width: '6px', height: '100%', background: selectedTheme === 'surgical_green' ? '#10B981' : '#38BDF8' }} />
                                                        
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
                                                            <div style={{ width: '48px', height: '48px', background: '#FFFFFF', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.25)', padding: '5px' }}>
                                                                <img src="/logosanatorio.png" alt="Sanatorio Argentino" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                                                            </div>
                                                            <div>
                                                                <div style={{ fontSize: '0.8rem', fontWeight: 800, color: selectedTheme === 'surgical_green' ? '#34D399' : '#38BDF8', letterSpacing: '2px', textTransform: 'uppercase' }}>
                                                                    Sanatorio Argentino
                                                                </div>
                                                                <div style={{ fontSize: '0.7rem', color: '#94A3B8', letterSpacing: '1px', fontWeight: 600 }}>
                                                                    SISTEMA DE GOBERNANZA CLÍNICA & GESTIÓN MÉDICA
                                                                </div>
                                                            </div>
                                                            <span style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.12)', padding: '4px 12px', borderRadius: '12px', fontSize: '0.72rem', fontWeight: 700, color: '#E2E8F0', letterSpacing: '0.5px' }}>
                                                                DIAPOSITIVA 1 • PORTADA
                                                            </span>
                                                        </div>

                                                        <h3 style={{ margin: '0 0 8px', fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF', lineHeight: '1.3', letterSpacing: '-0.3px' }}>
                                                            {slide.title}
                                                        </h3>
                                                        {slide.subtitle && (
                                                            <p style={{ margin: '0 0 16px', fontSize: '0.9rem', color: '#CBD5E1', lineHeight: '1.4' }}>
                                                                {slide.subtitle}
                                                            </p>
                                                        )}

                                                        {/* Tarjetas de metadatos integradas en portada */}
                                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '10px', marginTop: '14px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.12)' }}>
                                                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 12px' }}>
                                                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>SECTOR AUDITADO</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#FFFFFF', fontWeight: 600 }}>{globalMetrics.sector || 'Cuidados Críticos'} (16 Camas)</div>
                                                            </div>
                                                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 12px' }}>
                                                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>PERÍODO</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#FFFFFF', fontWeight: 600 }}>{globalMetrics.fechaDesde || 'Inicio'} al {globalMetrics.fechaHasta || 'Fin'}</div>
                                                            </div>
                                                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 12px' }}>
                                                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>OCUPACIÓN GLOBAL</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#FFFFFF', fontWeight: 600 }}>{globalMetrics.porcOcupacion ? `${globalMetrics.porcOcupacion}%` : '87.5%'} ({globalMetrics.diasOcupados || 0} c-día)</div>
                                                            </div>
                                                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: '8px', padding: '8px 12px' }}>
                                                                <div style={{ fontSize: '0.65rem', color: '#94A3B8', fontWeight: 700 }}>AUDITORÍA</div>
                                                                <div style={{ fontSize: '0.8rem', color: '#FFFFFF', fontWeight: 600 }}>Calidad Asistencial</div>
                                                            </div>
                                                        </div>

                                                        {slide.notes && (
                                                            <div style={{ marginTop: '14px', padding: '8px 12px', background: 'rgba(0,0,0,0.28)', borderRadius: '6px', fontSize: '0.75rem', color: '#94A3B8', fontStyle: 'italic', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span>💬</span> <b>Notas del Orador:</b> {slide.notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    /* Diapositivas Ejecutivas de Contenido */
                                                    <div key={sIdx} style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '20px 24px', boxShadow: '0 2px 6px rgba(0,0,0,0.03)', position: 'relative', overflow: 'hidden' }}>
                                                        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: selectedTheme === 'surgical_green' ? 'linear-gradient(90deg, #064E3B 0%, #10B981 100%)' : 'linear-gradient(90deg, #0F2942 0%, #0284C7 100%)' }} />
                                                        
                                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #F1F5F9', paddingBottom: '10px', marginBottom: '14px' }}>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                <img src="/logosanatorio.png" alt="SA" style={{ width: '22px', height: '22px', objectFit: 'contain' }} />
                                                                <span style={{ fontSize: '0.72rem', fontWeight: 700, color: selectedTheme === 'surgical_green' ? '#059669' : '#1E40AF', letterSpacing: '1px', textTransform: 'uppercase' }}>
                                                                    Sanatorio Argentino • Gobernanza Clínica UCI
                                                                </span>
                                                            </div>
                                                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', background: '#F1F5F9', padding: '3px 10px', borderRadius: '6px' }}>
                                                                Diapositiva {sIdx + 1}
                                                            </span>
                                                        </div>

                                                        <h4 style={{ margin: '0 0 6px', color: '#0F172A', fontSize: '1.1rem', fontWeight: 700 }}>
                                                            {slide.title}
                                                        </h4>
                                                        {slide.subtitle && (
                                                            <p style={{ margin: '0 0 14px', fontSize: '0.82rem', color: '#64748B', fontStyle: 'italic' }}>
                                                                {slide.subtitle}
                                                            </p>
                                                        )}

                                                        {/* Tarjetas de bullets con diseño corporativo */}
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
                                                            {slide.bullets?.map((b, bIdx) => {
                                                                const colonIdx = b.indexOf(':');
                                                                const hasColon = colonIdx > 0 && colonIdx < 40;
                                                                const label = hasColon ? b.substring(0, colonIdx + 1) : '';
                                                                const rest = hasColon ? b.substring(colonIdx + 1) : b;
                                                                
                                                                return (
                                                                    <div key={bIdx} style={{ 
                                                                        display: 'flex', alignItems: 'center', gap: '12px', 
                                                                        background: '#F8FAFC', border: '1px solid #E2E8F0', 
                                                                        borderLeft: `4px solid ${bIdx % 2 === 0 ? (selectedTheme === 'surgical_green' ? '#059669' : '#1E40AF') : (selectedTheme === 'surgical_green' ? '#10B981' : '#0284C7')}`,
                                                                        borderRadius: '8px', padding: '10px 14px' 
                                                                    }}>
                                                                        <span style={{ 
                                                                            background: selectedTheme === 'surgical_green' ? '#ECFDF5' : '#EFF6FF', 
                                                                            color: selectedTheme === 'surgical_green' ? '#065F46' : '#1E40AF', 
                                                                            fontWeight: 800, fontSize: '0.75rem', 
                                                                            borderRadius: '6px', padding: '3px 8px', flexShrink: 0 
                                                                        }}>
                                                                            0{bIdx + 1}
                                                                        </span>
                                                                        <div style={{ fontSize: '0.85rem', color: '#334155', lineHeight: '1.45' }}>
                                                                            {hasColon && <b style={{ color: '#0F172A' }}>{label} </b>}
                                                                            {rest}
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>

                                                        {slide.notes && (
                                                            <div style={{ marginTop: '12px', padding: '8px 12px', background: '#F8FAFC', border: '1px dashed #CBD5E1', borderRadius: '6px', fontSize: '0.75rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                <span>💡</span> <b>Notas del Orador:</b> {slide.notes}
                                                            </div>
                                                        )}
                                                    </div>
                                                )
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
                                            <MermaidRenderer id="telar-mermaid-container" chart={flashContent} />
                                        </div>
                                        <div style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', justifyContent: 'center' }}>
                                            <button 
                                                onClick={handleDownloadMermaidImage} 
                                                disabled={downloadingMermaid}
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                                    padding: '10px 22px', background: '#10B981', color: 'white', 
                                                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
                                                    boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                {downloadingMermaid ? (
                                                    <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                                ) : (
                                                    <Download size={16} />
                                                )}
                                                Descargar como Imagen (PNG)
                                            </button>
                                            <button 
                                                onClick={handleCopyText} 
                                                style={{ 
                                                    display: 'flex', alignItems: 'center', gap: '8px', 
                                                    padding: '10px 22px', background: '#1E40AF', color: 'white', 
                                                    border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600,
                                                    boxShadow: '0 2px 6px rgba(30, 64, 175, 0.25)',
                                                    transition: 'all 0.15s ease'
                                                }}
                                            >
                                                <Copy size={16} /> Copiar Código Mermaid
                                            </button>
                                        </div>
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
