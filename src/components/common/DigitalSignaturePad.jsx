/**
 * DigitalSignaturePad.jsx — Componente reutilizable de Firma Digital
 * 
 * Permite firmar con mouse o pantalla táctil (touch).
 * Exporta automáticamente a Base64 PNG.
 */
import React, { useRef, useState, useEffect } from 'react';
import { Eraser, Check, Edit3 } from 'lucide-react';

export default function DigitalSignaturePad({
    label = 'Firma Digital',
    sublabel = 'Dibuje su firma en el recuadro con el mouse o pantalla táctil',
    onSave, // callback(base64String | null)
    initialSignature = null,
    width = 340,
    height = 140
}) {
    const canvasRef = useRef(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [hasDrawn, setHasDrawn] = useState(false);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#0f172a';

        if (initialSignature) {
            const img = new Image();
            img.onload = () => {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                setHasDrawn(true);
            };
            img.src = initialSignature;
        }
    }, [initialSignature]);

    const getPos = (e) => {
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        if (e.touches && e.touches[0]) {
            return {
                x: e.touches[0].clientX - rect.left,
                y: e.touches[0].clientY - rect.top
            };
        }
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top
        };
    };

    const startDrawing = (e) => {
        if (e.type === 'touchstart') {
            e.preventDefault();
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e);
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        setIsDrawing(true);
    };

    const draw = (e) => {
        if (!isDrawing) return;
        if (e.type === 'touchmove') {
            e.preventDefault();
        }
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        const pos = getPos(e);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        setHasDrawn(true);
    };

    const stopDrawing = () => {
        if (!isDrawing) return;
        setIsDrawing(false);
        const canvas = canvasRef.current;
        if (onSave && canvas) {
            const base64 = canvas.toDataURL('image/png');
            onSave(base64);
        }
    };

    const clear = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        setHasDrawn(false);
        if (onSave) onSave(null);
    };

    return (
        <div style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '12px 14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px'
        }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                    <div style={{ fontSize: '0.82rem', fontWeight: 800, color: '#0f172a', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Edit3 size={15} color="#0284c7" />
                        {label}
                    </div>
                    {sublabel && (
                        <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {sublabel}
                        </div>
                    )}
                </div>

                {hasDrawn && (
                    <button
                        type="button"
                        onClick={clear}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            background: '#f1f5f9', border: '1px solid #cbd5e1',
                            borderRadius: '6px', padding: '4px 8px', fontSize: '0.72rem',
                            fontWeight: 700, color: '#475569', cursor: 'pointer'
                        }}
                    >
                        <Eraser size={13} />
                        Limpiar
                    </button>
                )}
            </div>

            <div style={{
                position: 'relative',
                background: '#fafafa',
                borderRadius: '8px',
                border: '1.5px dashed #94a3b8',
                overflow: 'hidden',
                touchAction: 'none'
            }}>
                <canvas
                    ref={canvasRef}
                    width={width}
                    height={height}
                    onMouseDown={startDrawing}
                    onMouseMove={draw}
                    onMouseUp={stopDrawing}
                    onMouseLeave={stopDrawing}
                    onTouchStart={startDrawing}
                    onTouchMove={draw}
                    onTouchEnd={stopDrawing}
                    style={{
                        display: 'block',
                        width: '100%',
                        height: `${height}px`,
                        cursor: 'crosshair'
                    }}
                />

                {!hasDrawn && (
                    <div style={{
                        position: 'absolute',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        color: '#94a3b8',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        pointerEvents: 'none',
                        userSelect: 'none',
                        textAlign: 'center'
                    }}>
                        Firme aquí
                    </div>
                )}
            </div>

            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                fontSize: '0.7rem',
                color: hasDrawn ? '#16a34a' : '#94a3b8',
                fontWeight: 600
            }}>
                <span>
                    {hasDrawn ? '✓ Firma capturada correctamente' : 'Esperando trazo digital...'}
                </span>
                {hasDrawn && <Check size={14} color="#16a34a" />}
            </div>
        </div>
    );
}
