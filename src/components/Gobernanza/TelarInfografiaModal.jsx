import React, { useState, useEffect } from 'react';
import { X, Sparkles, Download, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';

export default function TelarInfografiaModal({ activeIndicators, onClose }) {
    const [status, setStatus] = useState('idle'); // idle, generating, success, error
    const [imageSrc, setImageSrc] = useState(null);
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        if (activeIndicators && activeIndicators.length > 0) {
            generateInfographic();
        } else {
            setStatus('error');
            setErrorMessage('No hay indicadores activos en el Telar para generar una infografía.');
        }
    }, [activeIndicators]);

    const generateInfographic = async () => {
        try {
            setStatus('generating');
            setErrorMessage('');

            // Invocar la Edge Function de Supabase que llama a Imagen 3 (Google AI Studio)
            const { data, error } = await supabase.functions.invoke('gemini-infographic', {
                body: { indicators: activeIndicators }
            });

            if (error) {
                throw new Error(error.message || 'Error al conectar con el servidor.');
            }

            if (!data.success) {
                throw new Error(data.error || 'La generación de la infografía falló.');
            }

            // data.imageBase64 contiene la imagen generada
            setImageSrc(`data:image/jpeg;base64,${data.imageBase64}`);
            setStatus('success');

        } catch (err) {
            console.error('Error generando infografía:', err);
            setStatus('error');
            setErrorMessage(err.message || 'Ocurrió un error inesperado al generar la imagen.');
        }
    };

    const handleDownload = () => {
        if (!imageSrc) return;
        
        const a = document.createElement('a');
        a.href = imageSrc;
        a.download = `Infografia_Telar_${new Date().toISOString().split('T')[0]}.jpg`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(15, 23, 42, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '24px'
        }}>
            <div style={{
                background: '#fff', borderRadius: '16px',
                width: '100%', maxWidth: '900px', height: '90vh',
                display: 'flex', flexDirection: 'column',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
                overflow: 'hidden', animation: 'scale-up 0.3s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 24px', borderBottom: '1px solid #E2E8F0',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    background: 'linear-gradient(to right, #F8FAFC, #FFFFFF)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ 
                            background: 'linear-gradient(135deg, #4F46E5, #7C3AED)',
                            padding: '8px', borderRadius: '10px', color: 'white',
                            display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <h2 style={{ margin: 0, fontSize: '1.1rem', color: '#1E293B' }}>Infografía de Datos (AI)</h2>
                            <p style={{ margin: 0, fontSize: '0.8rem', color: '#64748B' }}>Generada usando Google Imagen 3</p>
                        </div>
                    </div>
                    <button 
                        onClick={onClose}
                        style={{
                            background: 'transparent', border: 'none', cursor: 'pointer',
                            color: '#64748B', padding: '8px', borderRadius: '8px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'background 0.2s'
                        }}
                        onMouseOver={e => e.currentTarget.style.background = '#F1F5F9'}
                        onMouseOut={e => e.currentTarget.style.background = 'transparent'}
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Content */}
                <div style={{ flex: 1, backgroundColor: '#F8FAFC', position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', overflow: 'auto' }}>
                    
                    {status === 'generating' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '16px', color: '#4F46E5' }}>
                            <Loader2 size={48} style={{ animation: 'spin 1.5s linear infinite' }} />
                            <div style={{ textAlign: 'center' }}>
                                <h3 style={{ margin: 0, color: '#1E293B' }}>Dibujando tu infografía...</h3>
                                <p style={{ margin: '8px 0 0', color: '#64748B', fontSize: '0.9rem' }}>Imagen 3 está procesando los indicadores. Esto puede tomar unos 10-15 segundos.</p>
                            </div>
                        </div>
                    )}

                    {status === 'error' && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: '#EF4444', textAlign: 'center', maxWidth: '400px' }}>
                            <div style={{ background: '#FEE2E2', padding: '16px', borderRadius: '50%' }}>
                                <X size={32} />
                            </div>
                            <h3 style={{ margin: 0 }}>No se pudo generar la imagen</h3>
                            <p style={{ margin: 0, fontSize: '0.9rem', color: '#64748B' }}>{errorMessage}</p>
                            <button 
                                onClick={generateInfographic}
                                style={{ marginTop: '16px', padding: '8px 16px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
                            >
                                Reintentar
                            </button>
                        </div>
                    )}

                    {status === 'success' && imageSrc && (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%', height: '100%', gap: '16px' }}>
                            <div style={{ 
                                flex: 1, 
                                width: '100%', 
                                maxWidth: '600px',
                                background: '#fff', 
                                borderRadius: '12px', 
                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)',
                                overflow: 'hidden',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}>
                                <img 
                                    src={imageSrc} 
                                    alt="Infografía Generada" 
                                    style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                />
                            </div>
                            
                            <button 
                                onClick={handleDownload}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '8px',
                                    background: '#10B981', color: 'white',
                                    border: 'none', padding: '12px 24px',
                                    borderRadius: '12px', fontSize: '1rem',
                                    fontWeight: 600, cursor: 'pointer',
                                    boxShadow: '0 4px 6px -1px rgba(16, 185, 129, 0.3)',
                                    transition: 'transform 0.2s'
                                }}
                                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                            >
                                <Download size={18} />
                                Descargar Infografía (JPG)
                            </button>
                        </div>
                    )}
                </div>
                
                {/* CSS para animaciones locales */}
                <style dangerouslySetInnerHTML={{__html: `
                    @keyframes spin { 100% { transform: rotate(360deg); } }
                    @keyframes scale-up { 
                        from { transform: scale(0.95); opacity: 0; } 
                        to { transform: scale(1); opacity: 1; } 
                    }
                `}} />
            </div>
        </div>
    );
}
