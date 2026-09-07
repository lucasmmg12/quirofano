import React, { useState, useEffect } from 'react';
import { X, Sparkles, Download, Loader2, Image as ImageIcon, Map, Presentation, FileText, Copy, Palette } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ReactMarkdown from 'react-markdown';
import MermaidRenderer from './MermaidRenderer';
import pptxgen from 'pptxgenjs';

export default function TelarExportModal({ activeIndicators, onClose }) {
    const [selectedTab, setSelectedTab] = useState('infographic');
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
        { id: 'infographic', label: 'Infografía Visual', icon: <ImageIcon size={18} />, description: 'Diseño clínico generado por Gemini 3.1' },
        { id: 'conceptual_map', label: 'Mapa Conceptual', icon: <Map size={18} />, description: 'Grafo de métricas (Mermaid)' },
        { id: 'presentation', label: 'Presentación PPTX', icon: <Presentation size={18} />, description: 'Diapositivas listas para descargar' },
        { id: 'speech_script', label: 'Guión de Discurso', icon: <FileText size={18} />, description: 'Discurso profesional (Markdown)' },
    ];

    useEffect(() => {
        if (!activeIndicators || activeIndicators.length === 0) {
            setImageStatus('error');
            setImageError('No hay indicadores activos.');
            setFlashStatus('error');
            setFlashError('No hay indicadores activos.');
            return;
        }

        // Si cambiamos de tab y no hay contenido generado, generarlo
        if (selectedTab === 'infographic' && !imageSrc && imageStatus === 'idle') {
            generateInfographic();
        } else if (selectedTab !== 'infographic' && flashStatus === 'idle') {
            generateOmniFlash(selectedTab);
        }
    }, [selectedTab, activeIndicators, selectedTheme]);

    // Generador Imagen 3 (Gemini 3.1 Flash Image)
    const generateInfographic = async () => {
        try {
            setImageStatus('generating');
            setImageError('');
            const { data, error } = await supabase.functions.invoke('gemini-infographic', {
                body: { indicators: activeIndicators, engine: 'google', theme: selectedTheme }
            });
            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            setImageSrc(`data:image/jpeg;base64,${data.imageBase64}`);
            setImageStatus('success');
        } catch (err) {
            console.error(err);
            setImageStatus('error');
            setImageError(err.message || 'Error al generar imagen.');
        }
    };

    // Generador PPTX
    const generatePPTX = (slidesData) => {
        let pptx = new pptxgen();
        
        // Determinar colores basados en el tema
        let bgColor = 'FFFFFF';
        let titleColor = '1E293B';
        let accentColor = '3B82F6';
        
        if (selectedTheme === 'institutional_blue') {
            titleColor = '1E40AF';
            accentColor = '2563EB';
        } else if (selectedTheme === 'surgical_green') {
            titleColor = '166534';
            accentColor = '10B981';
        }

        pptx.defineSlideMaster({
            title: 'MASTER_SLIDE',
            background: { color: bgColor },
            objects: [
                { rect: { x: 0, y: 0, w: '100%', h: 0.75, fill: { color: accentColor } } },
                { text: { text: 'Sanatorio Argentino - Reporte Inteligente', options: { x: 0.5, y: 0.2, w: 9, h: 0.5, color: 'FFFFFF', fontSize: 18, bold: true } } }
            ]
        });

        slidesData.forEach((slide, index) => {
            let pptSlide = pptx.addSlide({ masterName: 'MASTER_SLIDE' });
            
            // Título
            pptSlide.addText(slide.title || 'Diapositiva', {
                x: 0.5, y: 1.0, w: '90%', h: 1, fontSize: 32, bold: true, color: titleColor
            });

            // Subtítulo
            if (slide.subtitle) {
                pptSlide.addText(slide.subtitle, {
                    x: 0.5, y: 1.8, w: '90%', h: 0.5, fontSize: 20, italic: true, color: '64748B'
                });
            }

            // Bullets
            if (slide.bullets && slide.bullets.length > 0) {
                const bulletText = slide.bullets.map(b => ({ text: b, options: { bullet: true } }));
                pptSlide.addText(bulletText, {
                    x: 0.5, y: 2.5, w: '90%', h: 3, fontSize: 18, color: '334155', valign: 'top'
                });
            }

            // Notas
            if (slide.notes) {
                pptSlide.addNotes(slide.notes);
            }
        });

        pptx.writeFile({ fileName: `Presentacion_Sanatorio_${new Date().getTime()}.pptx` });
    };

    // Generador OmniFlash
    const generateOmniFlash = async (type) => {
        try {
            setFlashStatus('generating');
            setFlashError('');
            setFlashContent('');
            
            const { data, error } = await supabase.functions.invoke('gemini-omniflash', {
                body: { indicators: activeIndicators, exportType: type, theme: selectedTheme }
            });

            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            
            if (type === 'presentation') {
                // Parsear JSON y generar PPTX
                try {
                    // Limpiar markdown si el LLM devolvió bloques de código
                    let cleanJson = data.textContent.replace(/```json\n/g, '').replace(/```/g, '').trim();
                    const parsed = JSON.parse(cleanJson);
                    setFlashContent(parsed);
                    setFlashStatus('success');
                } catch (e) {
                    throw new Error("El formato devuelto no es un JSON válido para la presentación.");
                }
            } else {
                setFlashContent(data.textContent);
                setFlashStatus('success');
            }
        } catch (err) {
            console.error(err);
            setFlashStatus('error');
            setFlashError(err.message || 'Error al generar contenido.');
        }
    };

    const handleTabChange = (tabId) => {
        setSelectedTab(tabId);
        // Limpiamos estados al cambiar
        if (tabId === 'infographic') {
            setImageStatus('idle');
            setImageSrc(null);
        } else {
            setFlashStatus('idle');
            setFlashContent('');
        }
    };

    const handleThemeChange = (theme) => {
        setSelectedTheme(theme);
        // Regenerar la vista actual
        if (selectedTab === 'infographic') {
            setImageStatus('idle');
            setImageSrc(null);
        } else {
            setFlashStatus('idle');
            setFlashContent('');
        }
    };

    const handleDownloadImage = () => {
        if (!imageSrc) return;
        const a = document.createElement('a');
        a.href = imageSrc;
        a.download = `Infografia_${new Date().getTime()}.jpg`;
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
                background: '#fff', borderRadius: '16px', width: '100%', maxWidth: '1100px', height: '90vh',
                display: 'flex', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', overflow: 'hidden',
                animation: 'scale-up 0.3s ease-out'
            }}>
                
                {/* SIDEBAR */}
                <div style={{ width: '280px', background: '#F8FAFC', borderRight: '1px solid #E2E8F0', display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '20px', borderBottom: '1px solid #E2E8F0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#4F46E5' }}>
                            <Sparkles size={20} />
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1E293B' }}>Centro de Exportación</h2>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>Selecciona el formato deseado.</p>
                    </div>
                    
                    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', flex: 1, overflowY: 'auto' }}>
                        {tabs.map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => handleTabChange(tab.id)}
                                style={{
                                    display: 'flex', flexDirection: 'column', alignItems: 'flex-start',
                                    padding: '12px', borderRadius: '12px', border: '1px solid transparent',
                                    background: selectedTab === tab.id ? '#EEF2FF' : 'transparent',
                                    borderColor: selectedTab === tab.id ? '#C7D2FE' : 'transparent',
                                    cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: selectedTab === tab.id ? '#4F46E5' : '#475569', fontWeight: 600 }}>
                                    {tab.icon} {tab.label}
                                </div>
                                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px' }}>{tab.description}</div>
                            </button>
                        ))}
                    </div>
                </div>

                {/* MAIN CONTENT AREA */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
                    
                    {/* TOPBAR WITH THEME SELECTOR */}
                    <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0', background: '#fff' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                            <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1rem' }}>{tabs.find(t => t.id === selectedTab)?.label}</h3>
                            
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F1F5F9', padding: '4px 8px', borderRadius: '8px' }}>
                                <Palette size={16} color="#64748B" />
                                <select 
                                    value={selectedTheme} 
                                    onChange={(e) => handleThemeChange(e.target.value)}
                                    style={{ border: 'none', background: 'transparent', color: '#334155', fontWeight: 500, outline: 'none', cursor: 'pointer' }}
                                >
                                    <option value="institutional_blue">Azul Institucional</option>
                                    <option value="surgical_green">Verde Quirúrgico</option>
                                    <option value="minimalist">Minimalista Claro</option>
                                </select>
                            </div>
                        </div>

                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '24px', backgroundColor: '#F1F5F9', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        
                        {/* ESTADOS DE CARGA Y ERROR PARA INFOGRAFIA VISUAL */}
                        {selectedTab === 'infographic' && imageStatus === 'generating' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#4F46E5' }}>
                                <Loader2 size={48} style={{ animation: 'spin 1.5s linear infinite' }} />
                                <h3>Dibujando con Gemini 3.1 Flash Image...</h3>
                            </div>
                        )}
                        {selectedTab === 'infographic' && (imageStatus === 'error' || imageStatus === 'idle') && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', marginTop: '40px' }}>
                                {imageStatus === 'error' && <div style={{ color: '#EF4444', background: '#FEE2E2', padding: '12px', borderRadius: '8px' }}>{imageError}</div>}
                                <button onClick={generateInfographic} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#4F46E5', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                    <Sparkles size={18} /> Generar Infografía con {selectedTheme === 'institutional_blue' ? 'Azul' : selectedTheme === 'surgical_green' ? 'Verde' : 'Blanco'}
                                </button>
                            </div>
                        )}
                        {selectedTab === 'infographic' && imageStatus === 'success' && imageSrc && (
                            <div style={{ width: '100%', maxWidth: '600px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <img src={imageSrc} alt="Infografía" style={{ width: '100%', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                                <button onClick={handleDownloadImage} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                    <Download size={18} /> Descargar (JPG)
                                </button>
                            </div>
                        )}

                        {/* ESTADOS DE CARGA Y ERROR PARA OMNIFLASH */}
                        {selectedTab !== 'infographic' && flashStatus === 'generating' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#4F46E5' }}>
                                <Loader2 size={48} style={{ animation: 'spin 1.5s linear infinite' }} />
                                <h3>Procesando con Gemini OmniFlash...</h3>
                            </div>
                        )}
                        {selectedTab !== 'infographic' && flashStatus === 'error' && (
                            <div style={{ color: '#EF4444', background: '#FEE2E2', padding: '12px', borderRadius: '8px' }}>{flashError} <button onClick={() => generateOmniFlash(selectedTab)} style={{ marginLeft: '12px', padding: '4px 8px', borderRadius: '4px', border: '1px solid #EF4444', background: 'transparent', color: '#EF4444', cursor: 'pointer' }}>Reintentar</button></div>
                        )}
                        
                        {selectedTab === 'presentation' && flashStatus === 'success' && flashContent && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px', marginTop: '40px' }}>
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', textAlign: 'center' }}>
                                    <Presentation size={48} color="#4F46E5" style={{ marginBottom: '16px' }} />
                                    <h2 style={{ margin: '0 0 8px 0', color: '#1E293B' }}>¡Presentación Lista!</h2>
                                    <p style={{ color: '#64748B', margin: '0 0 24px 0' }}>Se han generado {flashContent.slides?.length || 0} diapositivas listas para PowerPoint con los datos exactos del Sanatorio.</p>
                                    
                                    <button onClick={() => generatePPTX(flashContent.slides)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 24px', background: '#10B981', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600, width: '100%', justifyContent: 'center' }}>
                                        <Download size={18} /> Descargar Archivo PPTX
                                    </button>
                                </div>
                            </div>
                        )}

                        {selectedTab !== 'infographic' && selectedTab !== 'presentation' && flashStatus === 'success' && flashContent && (
                            <div style={{ width: '100%', maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', overflowX: 'auto', width: '100%' }}>
                                    {selectedTab === 'conceptual_map' ? (
                                        <MermaidRenderer chart={flashContent} />
                                    ) : (
                                        <div className="markdown-body" style={{ color: '#334155' }}>
                                            <ReactMarkdown>{flashContent}</ReactMarkdown>
                                        </div>
                                    )}
                                </div>
                                <button onClick={handleCopyText} style={{ alignSelf: 'center', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', background: '#3B82F6', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}>
                                    <Copy size={18} /> Copiar al portapapeles
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                <style dangerouslySetInnerHTML={{__html: `
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    @keyframes scale-up { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
                    .markdown-body h1, .markdown-body h2, .markdown-body h3 { color: #1E293B; margin-top: 0; }
                    .markdown-body ul { padding-left: 20px; }
                    .markdown-body li { margin-bottom: 8px; }
                `}} />
            </div>
        </div>
    );
}
