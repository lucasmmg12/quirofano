import React, { useState, useRef, useEffect } from 'react';
import { 
    GripVertical, Move, ChevronLeft, ChevronRight, 
    Maximize2, Minimize2, RotateCcw 
} from 'lucide-react';

/**
 * DraggableChartCard — Tarjeta contenedora modular para gráficos del Telar
 * - Soporta Reordenamiento por Drag & Drop nativo y botones direccionales
 * - Redimensionamiento libre por cursor en esquina inferior derecha
 * - Presets de ancho rápido (50% media pantalla / 100% ancho completo)
 * - Estética "Limpia y Clínica" Sanatorio Argentino (Calidad-QOAG)
 */
export default function DraggableChartCard({
    id,
    title,
    subtitle,
    badge,
    actions,
    size = { width: 'half', height: 260 },
    onSizeChange,
    onDragStart,
    onDragOver,
    onDragLeave,
    onDrop,
    onDragEnd,
    onMoveLeft,
    onMoveRight,
    isFirst = false,
    isLast = false,
    isDragging = false,
    isDropTarget = false,
    children
}) {
    const cardRef = useRef(null);
    const [isResizing, setIsResizing] = useState(false);
    const [currentHeight, setCurrentHeight] = useState(size.height || 260);
    const [currentWidthMode, setCurrentWidthMode] = useState(size.width || 'half'); // 'half' | 'full' | number

    // Sincronizar estado local con props si cambian externamente
    useEffect(() => {
        if (size.height && size.height !== currentHeight) {
            setCurrentHeight(size.height);
        }
        if (size.width && size.width !== currentWidthMode) {
            setCurrentWidthMode(size.width);
        }
    }, [size.height, size.width]);

    // Manejo de Redimensionamiento Libre con Mouse
    const handleResizeMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsResizing(true);

        const startY = e.clientY;
        const startX = e.clientX;
        const startH = currentHeight;
        const cardElem = cardRef.current;
        const startW = cardElem ? cardElem.offsetWidth : 450;
        const parentW = cardElem?.parentElement ? cardElem.parentElement.offsetWidth : 1000;

        const onMouseMove = (moveEvent) => {
            const deltaY = moveEvent.clientY - startY;
            const deltaX = moveEvent.clientX - startX;
            
            // Altura libre entre 200px y 650px
            const newHeight = Math.max(200, Math.min(650, Math.round(startH + deltaY)));
            setCurrentHeight(newHeight);

            // Ancho: si el usuario arrastra significativamente a la derecha, pasa a full; si achica, pasa a half
            const proposedW = startW + deltaX;
            if (proposedW > parentW * 0.75) {
                setCurrentWidthMode('full');
            } else if (proposedW < parentW * 0.6) {
                setCurrentWidthMode('half');
            }
        };

        const onMouseUp = (upEvent) => {
            setIsResizing(false);
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);

            const deltaY = upEvent.clientY - startY;
            const finalHeight = Math.max(200, Math.min(650, Math.round(startH + deltaY)));
            
            const cardElemEnd = cardRef.current;
            const startWEnd = cardElemEnd ? cardElemEnd.offsetWidth : 450;
            const parentWEnd = cardElemEnd?.parentElement ? cardElemEnd.parentElement.offsetWidth : 1000;
            const deltaX = upEvent.clientX - startX;
            const proposedW = startWEnd + deltaX;
            const finalWidth = proposedW > parentWEnd * 0.75 ? 'full' : 'half';

            onSizeChange?.(id, { height: finalHeight, width: finalWidth });
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    // Toggle rápido de ancho 50% vs 100%
    const handleToggleWidth = () => {
        const nextMode = currentWidthMode === 'full' ? 'half' : 'full';
        setCurrentWidthMode(nextMode);
        onSizeChange?.(id, { height: currentHeight, width: nextMode });
    };

    // Reset a tamaño predeterminado
    const handleResetSize = () => {
        setCurrentHeight(260);
        setCurrentWidthMode('half');
        onSizeChange?.(id, { height: 260, width: 'half' });
    };

    // Estilos dinámicos de ancho
    const isFullWidth = currentWidthMode === 'full';
    const flexStyle = isFullWidth 
        ? { flex: '1 1 100%', width: '100%' } 
        : { flex: '1 1 calc(50% - 12px)', minWidth: '420px', maxWidth: '100%' };

    return (
        <div
            ref={cardRef}
            draggable
            onDragStart={(e) => onDragStart?.(e, id)}
            onDragOver={(e) => onDragOver?.(e, id)}
            onDragLeave={(e) => onDragLeave?.(e, id)}
            onDrop={(e) => onDrop?.(e, id)}
            onDragEnd={onDragEnd}
            style={{
                ...flexStyle,
                background: '#FFFFFF',
                border: isDropTarget ? '2px dashed #2563EB' : '1px solid #E2E8F0',
                borderRadius: '12px',
                padding: '18px 20px',
                boxShadow: isDragging ? '0 12px 24px rgba(0,0,0,0.15)' : '0 2px 4px rgba(0,0,0,0.02)',
                position: 'relative',
                display: 'flex',
                flexDirection: 'column',
                transition: isResizing ? 'none' : 'box-shadow 0.2s ease, border-color 0.2s ease',
                opacity: isDragging ? 0.45 : 1,
                transform: isDragging ? 'scale(0.98)' : 'none',
                boxSizing: 'border-box'
            }}
        >
            {/* Header de la Tarjeta con Controles de Posición y Tamaño */}
            <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '14px',
                gap: '12px',
                flexWrap: 'wrap'
            }}>
                {/* Lado Izquierdo: Drag Handle + Título + Subtítulo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '220px' }}>
                    <div 
                        title="Arrastrar para mover y reordenar en el Dashboard"
                        style={{
                            cursor: 'grab',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#94A3B8',
                            padding: '4px',
                            borderRadius: '4px',
                            background: '#F8FAFC',
                            border: '1px solid #E2E8F0',
                            transition: 'all 0.15s ease'
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = '#1E40AF'; e.currentTarget.style.background = '#EFF6FF'; }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = '#94A3B8'; e.currentTarget.style.background = '#F8FAFC'; }}
                    >
                        <GripVertical size={16} />
                    </div>

                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <h3 style={{ margin: 0, fontSize: '0.92rem', fontWeight: 800, color: '#1E293B' }}>
                                {title}
                            </h3>
                            {badge && (
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 700,
                                    color: '#1E40AF',
                                    background: '#EFF6FF',
                                    border: '1px solid #BFDBFE',
                                    padding: '1px 6px',
                                    borderRadius: '6px'
                                }}>
                                    {badge}
                                </span>
                            )}
                        </div>
                        {subtitle && (
                            <span style={{ fontSize: '0.7rem', color: '#64748B', display: 'block', marginTop: '1px' }}>
                                {subtitle}
                            </span>
                        )}
                    </div>
                </div>

                {/* Lado Derecho: Acciones Específicas + Controles de Tamaño y Posición */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {/* Botones de acción propios del gráfico (ej: Expandir / Excel) */}
                    {actions}

                    <div style={{ height: '18px', width: '1px', background: '#E2E8F0', margin: '0 2px' }} />

                    {/* Botones de mover izquierda / derecha */}
                    <div style={{ display: 'flex', gap: '2px' }}>
                        <button
                            type="button"
                            onClick={() => onMoveLeft?.(id)}
                            disabled={isFirst}
                            title="Mover gráfico antes"
                            style={{
                                background: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                borderRadius: '4px',
                                padding: '3px 5px',
                                color: isFirst ? '#CBD5E1' : '#475569',
                                cursor: isFirst ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ChevronLeft size={12} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onMoveRight?.(id)}
                            disabled={isLast}
                            title="Mover gráfico después"
                            style={{
                                background: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                borderRadius: '4px',
                                padding: '3px 5px',
                                color: isLast ? '#CBD5E1' : '#475569',
                                cursor: isLast ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center'
                            }}
                        >
                            <ChevronRight size={12} />
                        </button>
                    </div>

                    {/* Botón rápido ancho 50% / 100% */}
                    <button
                        type="button"
                        onClick={handleToggleWidth}
                        title={isFullWidth ? "Cambiar a ancho medio (50%)" : "Cambiar a ancho completo (100%)"}
                        style={{
                            background: isFullWidth ? '#EFF6FF' : '#F8FAFC',
                            border: isFullWidth ? '1px solid #93C5FD' : '1px solid #CBD5E1',
                            borderRadius: '4px',
                            padding: '3px 6px',
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            color: isFullWidth ? '#1E40AF' : '#64748B',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '3px'
                        }}
                    >
                        {isFullWidth ? '100%' : '50%'}
                    </button>
                </div>
            </div>

            {/* Contenido Dinámico del Gráfico con Altura Ajustable */}
            <div style={{ height: `${currentHeight}px`, position: 'relative', width: '100%' }}>
                {typeof children === 'function' ? children({ height: currentHeight, width: currentWidthMode }) : children}
            </div>

            {/* Tirador de Redimensionamiento Libre en la Esquina Inferior Derecha */}
            <div
                onMouseDown={handleResizeMouseDown}
                onDoubleClick={handleResetSize}
                title="Arrastrar para redimensionar libremente ancho y alto (Doble clic para restablecer)"
                style={{
                    position: 'absolute',
                    bottom: '2px',
                    right: '2px',
                    width: '18px',
                    height: '18px',
                    cursor: 'nwse-resize',
                    display: 'flex',
                    alignItems: 'flex-end',
                    justifyContent: 'flex-end',
                    padding: '2px',
                    color: isResizing ? '#2563EB' : '#94A3B8',
                    zIndex: 10,
                    userSelect: 'none'
                }}
            >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M9 1L1 9M9 5L5 9M9 9L9 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
            </div>
        </div>
    );
}
