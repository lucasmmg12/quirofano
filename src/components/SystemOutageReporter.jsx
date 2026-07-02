import { useState, useRef } from 'react';
import { AlertTriangle, Upload, X, Loader2 } from 'lucide-react';
import { submitOutageReport } from '../services/systemService';

export default function SystemOutageReporter({ currentUser, addToast }) {
    const [isOpen, setIsOpen] = useState(false);
    const [description, setDescription] = useState('');
    const [file, setFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const fileInputRef = useRef(null);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!description.trim()) {
            addToast?.('Por favor ingresa una descripción del problema.', 'warning');
            return;
        }

        try {
            setIsSubmitting(true);
            const reporterName = currentUser?.nombre || currentUser?.usuario || 'Anónimo';
            await submitOutageReport(description, reporterName, file);
            addToast?.('Reporte enviado correctamente. El equipo técnico lo revisará pronto.', 'success');
            setIsOpen(false);
            setDescription('');
            setFile(null);
        } catch (error) {
            console.error('Error al enviar reporte:', error);
            addToast?.('Hubo un error al enviar el reporte.', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setIsOpen(true)}
                title="Reportar problema técnico o caída del sistema"
                style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '6px 12px', borderRadius: '8px',
                    background: '#FEF2F2', border: '1px solid #FCA5A5',
                    color: '#DC2626', fontSize: '0.8rem', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.2s',
                    whiteSpace: 'nowrap'
                }}
                onMouseOver={(e) => {
                    e.currentTarget.style.background = '#FEE2E2';
                    e.currentTarget.style.borderColor = '#EF4444';
                }}
                onMouseOut={(e) => {
                    e.currentTarget.style.background = '#FEF2F2';
                    e.currentTarget.style.borderColor = '#FCA5A5';
                }}
            >
                <AlertTriangle size={16} />
                <span className="hide-mobile">Reportar Problema</span>
            </button>

            {isOpen && (
                <div style={{
                    position: 'fixed', inset: 0, zIndex: 99999,
                    background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    animation: 'fade-in 0.2s ease-out'
                }}>
                    <div style={{
                        background: '#fff', width: '90%', maxWidth: '500px',
                        borderRadius: '12px', overflow: 'hidden',
                        boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
                        animation: 'slide-up 0.3s ease-out'
                    }}>
                        <div style={{
                            padding: '16px 20px', borderBottom: '1px solid #E5E7EB',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            background: '#FEF2F2'
                        }}>
                            <h3 style={{ margin: 0, color: '#DC2626', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '1.1rem' }}>
                                <AlertTriangle size={20} />
                                Reportar Caída del Sistema
                            </h3>
                            <button onClick={() => setIsOpen(false)} style={{
                                background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer',
                                padding: '4px', borderRadius: '4px'
                            }}>
                                <X size={20} />
                            </button>
                        </div>
                        
                        <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                            <div style={{ marginBottom: '16px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                                    ¿Qué está fallando?
                                </label>
                                <textarea
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    placeholder="Ej: No me cargan los pacientes nuevos en el sistema..."
                                    rows={4}
                                    required
                                    style={{
                                        width: '100%', padding: '10px', borderRadius: '8px',
                                        border: '1px solid #D1D5DB', fontSize: '0.9rem',
                                        resize: 'vertical', fontFamily: 'inherit'
                                    }}
                                />
                            </div>

                            <div style={{ marginBottom: '24px' }}>
                                <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#374151', marginBottom: '8px' }}>
                                    Adjuntar evidencia (Captura de pantalla)
                                </label>
                                <div 
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        border: '2px dashed #D1D5DB', borderRadius: '8px',
                                        padding: '20px', textAlign: 'center', cursor: 'pointer',
                                        background: '#F9FAFB', transition: 'all 0.2s',
                                        color: '#6B7280'
                                    }}
                                >
                                    {file ? (
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 500, color: '#10B981' }}>{file.name}</span>
                                            <button 
                                                type="button" 
                                                onClick={(e) => { e.stopPropagation(); setFile(null); }}
                                                style={{ background: 'transparent', border: 'none', color: '#EF4444', cursor: 'pointer', padding: '2px' }}
                                            >
                                                <X size={14} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <Upload size={24} style={{ marginBottom: '8px', color: '#9CA3AF' }} />
                                            <p style={{ margin: 0, fontSize: '0.85rem' }}>Clic para seleccionar una imagen</p>
                                        </>
                                    )}
                                </div>
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    onChange={(e) => {
                                        if (e.target.files && e.target.files[0]) setFile(e.target.files[0]);
                                    }} 
                                    accept="image/*" 
                                    style={{ display: 'none' }} 
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                                <button
                                    type="button"
                                    onClick={() => setIsOpen(false)}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px',
                                        background: '#fff', border: '1px solid #D1D5DB',
                                        color: '#374151', fontSize: '0.9rem', fontWeight: 600, cursor: 'pointer'
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    style={{
                                        padding: '8px 16px', borderRadius: '8px',
                                        background: '#DC2626', border: 'none',
                                        color: '#fff', fontSize: '0.9rem', fontWeight: 600, cursor: isSubmitting ? 'not-allowed' : 'pointer',
                                        display: 'flex', alignItems: 'center', gap: '8px',
                                        opacity: isSubmitting ? 0.7 : 1
                                    }}
                                >
                                    {isSubmitting ? <Loader2 size={16} className="spin" /> : <AlertTriangle size={16} />}
                                    {isSubmitting ? 'Enviando...' : 'Enviar Reporte'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
