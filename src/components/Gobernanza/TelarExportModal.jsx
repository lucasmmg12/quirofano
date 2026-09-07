import React, { useState, useEffect } from 'react';
import { X, Sparkles, Download, Loader2, Image as ImageIcon, Map, Presentation, FileText, Copy } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import ReactMarkdown from 'react-markdown';
import MermaidRenderer from './MermaidRenderer';

export default function TelarExportModal({ activeIndicators, onClose }) {
    const [selectedTab, setSelectedTab] = useState('infographic');
    
    // Estados para Imagen (Infografía Visual)
    const [imageStatus, setImageStatus] = useState('idle');
    const [imageSrc, setImageSrc] = useState(null);
    const [imageError, setImageError] = useState('');

    // Estados para OmniFlash (Texto/Mermaid)
    const [flashStatus, setFlashStatus] = useState('idle');
    const [flashContent, setFlashContent] = useState('');
    const [flashError, setFlashError] = useState('');

    // Opciones del menú
    const tabs = [
        { id: 'infographic', label: 'Infografía Visual', icon: <ImageIcon size={18} />, description: 'Diseño clínico generado por Imagen 3' },
        { id: 'conceptual_map', label: 'Mapa Conceptual', icon: <Map size={18} />, description: 'Grafo de métricas (Mermaid)' },
        { id: 'presentation', label: 'Presentación', icon: <Presentation size={18} />, description: 'Estructura para diapositivas' },
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

        // Si cambiamos de tab y no hay contenido generado para ese tab, lo generamos
        if (selectedTab === 'infographic' && !imageSrc && imageStatus === 'idle') {
            generateInfographic();
        } else if (selectedTab !== 'infographic' && flashStatus === 'idle') {
            generateOmniFlash(selectedTab);
        }
    }, [selectedTab, activeIndicators]);

    // Generador Imagen 3 (Ya existía)
    const generateInfographic = async () => {
        try {
            setImageStatus('generating');
            setImageError('');
            const { data, error } = await supabase.functions.invoke('gemini-infographic', {
                body: { indicators: activeIndicators }
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

    // Generador OmniFlash
    const generateOmniFlash = async (type) => {
        try {
            setFlashStatus('generating');
            setFlashError('');
            setFlashContent('');
            
            const { data, error } = await supabase.functions.invoke('gemini-omniflash', {
                body: { indicators: activeIndicators, exportType: type }
            });

            if (error) throw new Error(error.message);
            if (!data.success) throw new Error(data.error);
            
            setFlashContent(data.textContent);
            setFlashStatus('success');
        } catch (err) {
            console.error(err);
            setFlashStatus('error');
            setFlashError(err.message || 'Error al generar texto.');
        }
    };

    const handleTabChange = (tabId) => {
        setSelectedTab(tabId);
        // Si es OmniFlash, limpiamos para regenerar (o podríamos cachearlo, pero regenerar permite prompts frescos)
        if (tabId !== 'infographic') {
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
        if (!flashContent) return;
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
                        <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#64748B' }}>Selecciona el formato de exportación deseado.</p>
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
                    <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #E2E8F0' }}>
                        <h3 style={{ margin: 0, color: '#1E293B', fontSize: '1rem' }}>{tabs.find(t => t.id === selectedTab)?.label}</h3>
                        <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748B' }}>
                            <X size={20} />
                        </button>
                    </div>

                    <div style={{ flex: 1, overflow: 'auto', padding: '24px', backgroundColor: '#F1F5F9', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        {/* ESTADOS DE CARGA Y ERROR PARA INFOGRAFIA VISUAL */}
                        {selectedTab === 'infographic' && imageStatus === 'generating' && (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '16px', color: '#4F46E5' }}>
                                <Loader2 size={48} style={{ animation: 'spin 1.5s linear infinite' }} />
                                <h3>Dibujando con Imagen 3...</h3>
                            </div>
                        )}
                        {selectedTab === 'infographic' && imageStatus === 'error' && (
                            <div style={{ color: '#EF4444' }}>{imageError} <button onClick={generateInfographic}>Reintentar</button></div>
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
                            <div style={{ color: '#EF4444' }}>{flashError} <button onClick={() => generateOmniFlash(selectedTab)}>Reintentar</button></div>
                        )}
                        {selectedTab !== 'infographic' && flashStatus === 'success' && flashContent && (
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
