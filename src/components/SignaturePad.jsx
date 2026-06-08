/**
 * SignaturePad.jsx — Componente de firma digital (HTML5 Canvas)
 * 
 * Componente reutilizable que permite dibujar una firma a mano alzada
 * sobre un canvas. Exporta la firma como base64 PNG dataURL.
 * 
 * Props:
 * - onSignatureChange(base64|null) — callback cuando cambia la firma
 * - width (default 400)
 * - height (default 150)
 * - label (default 'Firma')
 */
import { useRef, useEffect, useState, useCallback } from 'react';
import { Eraser, PenTool } from 'lucide-react';

export default function SignaturePad({ onSignatureChange, width = 400, height = 150, label = 'Firma' }) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasSignature, setHasSignature] = useState(false);

    // Get correct coordinates relative to canvas
    const getCoords = useCallback((e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        if (e.touches) {
            return {
                x: (e.touches[0].clientX - rect.left) * scaleX,
                y: (e.touches[0].clientY - rect.top) * scaleY,
            };
        }
        return {
            x: (e.clientX - rect.left) * scaleX,
            y: (e.clientY - rect.top) * scaleY,
        };
    }, []);

    // Initialize canvas
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.strokeStyle = '#1F2937';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
    }, []);

    const startDrawing = useCallback((e) => {
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const coords = getCoords(e);
        ctx.beginPath();
        ctx.moveTo(coords.x, coords.y);
        setIsDrawing(true);
    }, [getCoords]);

    const draw = useCallback((e) => {
        e.preventDefault();
        if (!isDrawing) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const coords = getCoords(e);
        ctx.lineTo(coords.x, coords.y);
        ctx.stroke();
    }, [isDrawing, getCoords]);

    const stopDrawing = useCallback(() => {
        if (!isDrawing) return;
        setIsDrawing(false);
        setHasSignature(true);
        // Export
        const canvas = canvasRef.current;
        const dataURL = canvas.toDataURL('image/png');
        onSignatureChange?.(dataURL);
    }, [isDrawing, onSignatureChange]);

    const clearSignature = useCallback(() => {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasSignature(false);
        onSignatureChange?.(null);
    }, [onSignatureChange]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{
                    fontSize: '0.72rem', fontWeight: 700, color: 'var(--neutral-500)',
                    textTransform: 'uppercase', letterSpacing: '0.04em',
                    display: 'flex', alignItems: 'center', gap: '5px',
                }}>
                    <PenTool size={12} /> {label}
                </label>
                {hasSignature && (
                    <button
                        type="button"
                        onClick={clearSignature}
                        style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '3px 10px', borderRadius: '6px',
                            background: '#FEF2F2', color: '#DC2626',
                            border: '1px solid #FECACA', cursor: 'pointer',
                            fontSize: '0.7rem', fontWeight: 600,
                            transition: 'all 0.15s',
                        }}
                    >
                        <Eraser size={11} /> Limpiar
                    </button>
                )}
            </div>
            <div style={{
                position: 'relative',
                borderRadius: '10px',
                border: `1.5px ${hasSignature ? 'solid #A5B4FC' : 'dashed var(--neutral-300, #D1D5DB)'}`,
                background: hasSignature ? '#FAFBFF' : '#FAFAFA',
                overflow: 'hidden',
                transition: 'all 0.2s',
                cursor: 'crosshair',
            }}>
                <canvas
                    ref={canvasRef}
                    width={width * 2}
                    height={height * 2}
                    style={{
                        width: '100%',
                        height: `${height}px`,
                        display: 'block',
                        touchAction: 'none',
                    }}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                />
                {/* Línea de referencia */}
                <div style={{
                    position: 'absolute', bottom: '30px', left: '20px', right: '20px',
                    borderBottom: '1px dashed #E5E7EB',
                    pointerEvents: 'none',
                }} />
                {!hasSignature && (
                    <div style={{
                        position: 'absolute', top: '50%', left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#D1D5DB', fontSize: '0.8rem', fontWeight: 500,
                        pointerEvents: 'none', userSelect: 'none',
                        display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                        <PenTool size={14} /> Firmar aquí
                    </div>
                )}
            </div>
        </div>
    );
}
