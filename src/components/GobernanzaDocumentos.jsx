import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { UploadCloud, FileText, Image as ImageIcon, X, Download, Loader2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';

export default function GobernanzaDocumentos({ proyectoId, currentUser }) {
    const [documentos, setDocumentos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [uploading, setUploading] = useState(false);
    
    const [viewerFile, setViewerFile] = useState(null); // Para el modal visor
    const fileInputRef = useRef(null);

    useEffect(() => {
        if (proyectoId) fetchDocumentos();
    }, [proyectoId]);

    const fetchDocumentos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('gobernanza_documentos')
                .select('*')
                .eq('proyecto_id', proyectoId)
                .order('created_at', { ascending: false });
            
            if (error) throw error;
            setDocumentos(data || []);
        } catch (err) {
            console.error("Error al cargar documentos", err);
        } finally {
            setLoading(false);
        }
    };

    const handleUpload = async (e) => {
        const files = e.target.files;
        if (!files || files.length === 0) return;
        
        setUploading(true);
        
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fileExt = file.name.split('.').pop();
            const fileName = `${proyectoId}/${uuidv4()}.${fileExt}`;
            
            try {
                // 1. Subir al storage
                const { error: uploadError } = await supabase.storage
                    .from('gobernanza_documentos')
                    .upload(fileName, file);
                
                if (uploadError) throw uploadError;

                // 2. Obtener URL pública
                const { data: publicUrlData } = supabase.storage
                    .from('gobernanza_documentos')
                    .getPublicUrl(fileName);
                
                // 3. Guardar en BD
                const { data: docData, error: dbError } = await supabase.from('gobernanza_documentos').insert({
                    proyecto_id: proyectoId,
                    nombre: file.name,
                    url: publicUrlData.publicUrl,
                    tipo_archivo: file.type || 'unknown',
                    uploaded_by: currentUser?.id
                }).select().single();

                if (dbError) throw dbError;

                // 4. Registrar actividad
                await supabase.from('gobernanza_actividad').insert({
                    proyecto_id: proyectoId,
                    usuario_id: currentUser?.id,
                    accion: 'SUBIO_DOCUMENTO',
                    detalles: { nombre: file.name }
                });

                setDocumentos(prev => [docData, ...prev]);
            } catch (err) {
                console.error("Error subiendo archivo:", err);
                alert(`Error al subir ${file.name}`);
            }
        }
        
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
    };

    const isViewable = (tipo) => {
        return tipo.startsWith('image/') || tipo === 'application/pdf';
    };

    const getIcon = (tipo) => {
        if (tipo.startsWith('image/')) return <ImageIcon size={24} color="#3b82f6" />;
        return <FileText size={24} color="#f43f5e" />;
    };

    const handleFileClick = (doc) => {
        if (isViewable(doc.tipo_archivo)) {
            setViewerFile(doc);
        } else {
            // Forzar descarga para Excel/Word
            window.open(doc.url, '_blank');
        }
    };

    if (loading) return <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="animate-spin" size={32} color="#94a3b8" /></div>;

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                <h3 style={{ margin: 0, color: '#0f172a', fontWeight: 800 }}>Documentos del Proyecto</h3>
                <div>
                    <input 
                        type="file" 
                        multiple 
                        ref={fileInputRef} 
                        onChange={handleUpload} 
                        style={{ display: 'none' }} 
                    />
                    <button 
                        onClick={() => fileInputRef.current.click()} 
                        disabled={uploading}
                        style={{ background: '#0f172a', color: 'white', border: 'none', borderRadius: '8px', padding: '8px 16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    >
                        {uploading ? <Loader2 size={16} className="animate-spin" /> : <UploadCloud size={16} />} 
                        Subir Archivos
                    </button>
                </div>
            </div>

            {documentos.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px', color: '#64748b', background: 'white', borderRadius: '12px', border: '1px dashed #cbd5e1' }}>
                    <UploadCloud size={48} color="#cbd5e1" style={{ margin: '0 auto 16px' }} />
                    <p>No hay documentos. Sube imágenes, mockups o PDFs de referencia.</p>
                </div>
            ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '16px' }}>
                    {documentos.map(doc => (
                        <div 
                            key={doc.id} 
                            onClick={() => handleFileClick(doc)}
                            style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', cursor: 'pointer', textAlign: 'center', transition: 'transform 0.2s', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
                            onMouseOver={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
                        >
                            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: '8px', marginBottom: '12px', display: 'flex', justifyContent: 'center' }}>
                                {getIcon(doc.tipo_archivo)}
                            </div>
                            <p style={{ margin: '0 0 8px', fontSize: '0.9rem', color: '#334155', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={doc.nombre}>
                                {doc.nombre}
                            </p>
                            <span style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                                {isViewable(doc.tipo_archivo) ? 'Ver archivo' : <><Download size={12} /> Descargar</>}
                            </span>
                        </div>
                    ))}
                </div>
            )}

            {/* VISOR MODAL */}
            {viewerFile && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15, 23, 42, 0.9)', zIndex: 9999, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#0f172a', color: 'white' }}>
                        <h3 style={{ margin: 0 }}>{viewerFile.nombre}</h3>
                        <div style={{ display: 'flex', gap: '16px' }}>
                            <a href={viewerFile.url} download target="_blank" rel="noreferrer" style={{ color: 'white', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <Download size={20} />
                            </a>
                            <button onClick={() => setViewerFile(null)} style={{ background: 'transparent', border: 'none', color: 'white', cursor: 'pointer' }}>
                                <X size={24} />
                            </button>
                        </div>
                    </div>
                    <div style={{ flex: 1, padding: '24px', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
                        {viewerFile.tipo_archivo.startsWith('image/') ? (
                            <img src={viewerFile.url} alt={viewerFile.nombre} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                        ) : viewerFile.tipo_archivo === 'application/pdf' ? (
                            <iframe src={viewerFile.url} style={{ width: '100%', height: '100%', border: 'none', background: 'white' }} title={viewerFile.nombre} />
                        ) : null}
                    </div>
                </div>
            )}
        </div>
    );
}
