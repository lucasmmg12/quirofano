import React, { useState } from 'react';
import { Palette, Check, RotateCcw, X, Image as ImageIcon, Sliders, Moon, Sun, Sparkles } from 'lucide-react';
import { THEME_PRESETS, WALLPAPERS, saveStoredTheme, resetStoredTheme } from '../../services/contactCenterThemeService';

const COLOR_SWATCHES = [
    { name: 'Blanco Clínico', color: '#FFFFFF', isDark: false },
    { name: 'Gris Slate', color: '#1E293B', isDark: true },
    { name: 'Deep Obsidian', color: '#0B1120', isDark: true },
    { name: 'Azul Noche', color: '#0F172A', isDark: true },
    { name: 'Gris Carbón', color: '#18181B', isDark: true },
    { name: 'Gris Plata', color: '#F1F5F9', isDark: false }
];

export default function ContactCenterThemeModal({ isOpen, onClose, currentTheme, onThemeChange }) {
    const [activeTab, setActiveTab] = useState('presets'); // 'presets' | 'custom'
    const [localTheme, setLocalTheme] = useState(currentTheme);

    if (!isOpen) return null;

    const handleSelectPreset = (presetKey) => {
        const selected = THEME_PRESETS[presetKey];
        if (selected) {
            const updated = { ...selected };
            setLocalTheme(updated);
            saveStoredTheme(updated);
            onThemeChange(updated);
        }
    };

    const handleUpdateCustom = (field, value) => {
        const updated = {
            ...localTheme,
            id: 'custom',
            name: 'Personalizado por Operadora',
            [field]: value
        };
        // Si el sidebar izquierdo o derecho se hace oscuro, ajustar bandera isDark
        if (field === 'leftSidebarBg') {
            const isDarkColor = ['#1E293B', '#0B1120', '#0F172A', '#18181B', '#111827', '#030712'].includes(value.toUpperCase());
            updated.leftSidebarText = isDarkColor ? '#F8FAFC' : '#0F172A';
            updated.leftSidebarBorder = isDarkColor ? '#334155' : '#E2E8F0';
            updated.leftSidebarHeaderBg = isDarkColor ? '#0F172A' : '#F8FAFC';
            updated.isDark = isDarkColor;
        }
        if (field === 'rightSidebarBg') {
            const isDarkColor = ['#1E293B', '#0B1120', '#0F172A', '#18181B', '#111827', '#030712'].includes(value.toUpperCase());
            updated.rightSidebarText = isDarkColor ? '#F8FAFC' : '#0F172A';
            updated.rightSidebarBorder = isDarkColor ? '#334155' : '#E2E8F0';
            updated.rightSidebarCardBg = isDarkColor ? '#0F172A' : '#FFFFFF';
            updated.rightSidebarCardBorder = isDarkColor ? '#334155' : '#E2E8F0';
        }
        setLocalTheme(updated);
        saveStoredTheme(updated);
        onThemeChange(updated);
    };

    const handleReset = () => {
        const res = resetStoredTheme();
        setLocalTheme(res);
        onThemeChange(res);
    };

    return (
        <div style={{
            position: 'fixed',
            inset: 0,
            zIndex: 99999,
            background: 'rgba(15, 23, 42, 0.65)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '16px'
        }}>
            <div style={{
                background: '#FFFFFF',
                borderRadius: '16px',
                width: '100%',
                maxWidth: '680px',
                boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '90vh'
            }}>
                {/* Header */}
                <div style={{
                    padding: '16px 20px',
                    borderBottom: '1px solid #E2E8F0',
                    background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px', height: '36px', borderRadius: '10px',
                            background: 'rgba(255,255,255,0.12)', display: 'flex',
                            alignItems: 'center', justifyContent: 'center'
                        }}>
                            <Palette size={20} color="#38BDF8" />
                        </div>
                        <div>
                            <div style={{ fontSize: '0.96rem', fontWeight: 800 }}>
                                Personalización Visual de Contact Center
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#94A3B8' }}>
                                Elige un modo descansador para la vista o personaliza el fondo del chat y los paneles
                            </div>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: 'none',
                            color: '#FFFFFF',
                            width: '30px',
                            height: '30px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Pestañas de Selector */}
                <div style={{
                    display: 'flex',
                    background: '#F8FAFC',
                    borderBottom: '1px solid #E2E8F0',
                    padding: '6px 16px',
                    gap: '8px'
                }}>
                    <button
                        onClick={() => setActiveTab('presets')}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: activeTab === 'presets' ? '#FFFFFF' : 'transparent',
                            color: activeTab === 'presets' ? '#0284C7' : '#64748B',
                            boxShadow: activeTab === 'presets' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                        }}
                    >
                        <Sparkles size={14} />
                        Modos Predeterminados
                    </button>
                    <button
                        onClick={() => setActiveTab('custom')}
                        style={{
                            padding: '8px 14px',
                            borderRadius: '8px',
                            border: 'none',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: activeTab === 'custom' ? '#FFFFFF' : 'transparent',
                            color: activeTab === 'custom' ? '#0284C7' : '#64748B',
                            boxShadow: activeTab === 'custom' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                        }}
                    >
                        <Sliders size={14} />
                        Personalizado (Libre)
                    </button>
                </div>

                {/* Contenido */}
                <div style={{ padding: '20px', overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    {activeTab === 'presets' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {/* Preset 1: Default */}
                            <div
                                onClick={() => handleSelectPreset('default')}
                                style={{
                                    border: localTheme.id === 'default' ? '2px solid #0284C7' : '1px solid #E2E8F0',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    cursor: 'pointer',
                                    background: '#FFFFFF',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.15s ease',
                                    boxShadow: localTheme.id === 'default' ? '0 0 0 3px rgba(2, 132, 199, 0.15)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '42px', height: '42px', borderRadius: '10px',
                                        background: '#F0F9FF', border: '1px solid #BAE6FD',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Sun size={20} color="#0284C7" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#0F172A' }}>
                                            {THEME_PRESETS.default.name}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                            {THEME_PRESETS.default.description}
                                        </div>
                                    </div>
                                </div>
                                {localTheme.id === 'default' && (
                                    <div style={{ background: '#0284C7', color: '#FFF', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Check size={14} />
                                    </div>
                                )}
                            </div>

                            {/* Preset 2: Slate */}
                            <div
                                onClick={() => handleSelectPreset('slate')}
                                style={{
                                    border: localTheme.id === 'slate' ? '2px solid #38BDF8' : '1px solid #CBD5E1',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    cursor: 'pointer',
                                    background: '#1E293B',
                                    color: '#FFFFFF',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.15s ease',
                                    boxShadow: localTheme.id === 'slate' ? '0 0 0 3px rgba(56, 189, 248, 0.3)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '42px', height: '42px', borderRadius: '10px',
                                        background: '#334155', border: '1px solid #475569',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Moon size={20} color="#38BDF8" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#F8FAFC', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {THEME_PRESETS.slate.name}
                                            <span style={{ fontSize: '0.62rem', background: '#0284C7', color: '#FFF', padding: '1px 6px', borderRadius: '4px', fontWeight: 700 }}>
                                                Recomendado
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#94A3B8', marginTop: '2px' }}>
                                            {THEME_PRESETS.slate.description}
                                        </div>
                                    </div>
                                </div>
                                {localTheme.id === 'slate' && (
                                    <div style={{ background: '#38BDF8', color: '#0F172A', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Check size={14} strokeWidth={3} />
                                    </div>
                                )}
                            </div>

                            {/* Preset 3: Dark */}
                            <div
                                onClick={() => handleSelectPreset('dark')}
                                style={{
                                    border: localTheme.id === 'dark' ? '2px solid #10B981' : '1px solid #334155',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    cursor: 'pointer',
                                    background: '#0B1120',
                                    color: '#FFFFFF',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    transition: 'all 0.15s ease',
                                    boxShadow: localTheme.id === 'dark' ? '0 0 0 3px rgba(16, 185, 129, 0.3)' : 'none'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                    <div style={{
                                        width: '42px', height: '42px', borderRadius: '10px',
                                        background: '#1E293B', border: '1px solid #334155',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        <Moon size={20} color="#10B981" />
                                    </div>
                                    <div>
                                        <div style={{ fontSize: '0.86rem', fontWeight: 800, color: '#F1F5F9' }}>
                                            {THEME_PRESETS.dark.name}
                                        </div>
                                        <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                            {THEME_PRESETS.dark.description}
                                        </div>
                                    </div>
                                </div>
                                {localTheme.id === 'dark' && (
                                    <div style={{ background: '#10B981', color: '#FFFFFF', borderRadius: '50%', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Check size={14} strokeWidth={3} />
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
                            {/* 1. Selector de Imagen de Fondo */}
                            <div>
                                <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                                    <ImageIcon size={14} color="#0284C7" />
                                    Fondo del Chat de WhatsApp:
                                </label>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
                                    {WALLPAPERS.map(w => {
                                        const isSelected = localTheme.chatBgImage === w.url;
                                        return (
                                            <div
                                                key={w.id}
                                                onClick={() => handleUpdateCustom('chatBgImage', w.url)}
                                                style={{
                                                    border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                                                    borderRadius: '10px',
                                                    padding: '8px 10px',
                                                    cursor: 'pointer',
                                                    background: isSelected ? '#F0F9FF' : '#F8FAFC',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '10px',
                                                    transition: 'all 0.15s ease',
                                                    boxShadow: isSelected ? '0 2px 8px rgba(2, 132, 199, 0.12)' : 'none'
                                                }}
                                            >
                                                {w.thumbnail ? (
                                                    <img 
                                                        src={w.thumbnail} 
                                                        alt={w.name} 
                                                        style={{ width: '56px', height: '36px', borderRadius: '6px', objectFit: 'cover', flexShrink: 0, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }} 
                                                    />
                                                ) : (
                                                    <div style={{ width: '56px', height: '36px', borderRadius: '6px', background: '#E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.66rem', fontWeight: 700, color: '#64748B', flexShrink: 0 }}>
                                                        Liso
                                                    </div>
                                                )}
                                                <div style={{ fontSize: '0.74rem', fontWeight: isSelected ? 800 : 700, color: isSelected ? '#0369A1' : '#1E293B', flex: 1, lineHeight: 1.25 }}>
                                                    {w.name}
                                                </div>
                                                {isSelected && (
                                                    <div style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#0284C7', color: '#FFF', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                                        <Check size={12} strokeWidth={3} />
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* 2. Slider de Oscurecimiento de Fondo */}
                            {localTheme.chatBgImage && (
                                <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', padding: '12px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#334155' }}>
                                            Oscurecimiento sobre la imagen (Transparencia):
                                        </span>
                                        <strong style={{ fontSize: '0.78rem', color: '#0284C7' }}>
                                            {Math.round((localTheme.chatOverlayOpacity || 0.70) * 100)}%
                                        </strong>
                                    </div>
                                    <input 
                                        type="range"
                                        min="0.20"
                                        max="0.90"
                                        step="0.05"
                                        value={localTheme.chatOverlayOpacity || 0.70}
                                        onChange={(e) => handleUpdateCustom('chatOverlayOpacity', parseFloat(e.target.value))}
                                        style={{ width: '100%', cursor: 'pointer' }}
                                    />
                                    <div style={{ fontSize: '0.66rem', color: '#64748B', marginTop: '4px' }}>
                                        💡 Con 70% de oscurecimiento, la imagen se aprecia sutilmente sin afectar la lectura de los mensajes.
                                    </div>
                                </div>
                            )}

                            {/* 3. Color Sidebar Izquierdo */}
                            <div>
                                <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0F172A', display: 'block', marginBottom: '8px' }}>
                                    Color de Fondo — Sidebar Izquierdo (Bandeja):
                                </label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {COLOR_SWATCHES.map(s => (
                                        <button
                                            key={s.color}
                                            onClick={() => handleUpdateCustom('leftSidebarBg', s.color)}
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '8px',
                                                background: s.color,
                                                border: localTheme.leftSidebarBg === s.color ? '2.5px solid #0284C7' : '1px solid #CBD5E1',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                            }}
                                            title={s.name}
                                        >
                                            {localTheme.leftSidebarBg === s.color && (
                                                <Check size={14} color={s.isDark ? '#FFF' : '#0284C7'} strokeWidth={3} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* 4. Color Sidebar Derecho */}
                            <div>
                                <label style={{ fontSize: '0.76rem', fontWeight: 800, color: '#0F172A', display: 'block', marginBottom: '8px' }}>
                                    Color de Fondo — Sidebar Derecho (Ficha CRM & Historial):
                                </label>
                                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                    {COLOR_SWATCHES.map(s => (
                                        <button
                                            key={s.color}
                                            onClick={() => handleUpdateCustom('rightSidebarBg', s.color)}
                                            style={{
                                                width: '32px',
                                                height: '32px',
                                                borderRadius: '8px',
                                                background: s.color,
                                                border: localTheme.rightSidebarBg === s.color ? '2.5px solid #0284C7' : '1px solid #CBD5E1',
                                                cursor: 'pointer',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
                                            }}
                                            title={s.name}
                                        >
                                            {localTheme.rightSidebarBg === s.color && (
                                                <Check size={14} color={s.isDark ? '#FFF' : '#0284C7'} strokeWidth={3} />
                                            )}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div style={{
                    padding: '12px 20px',
                    borderTop: '1px solid #E2E8F0',
                    background: '#F8FAFC',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                }}>
                    <button
                        onClick={handleReset}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            background: 'transparent',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            padding: '6px 12px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            color: '#64748B',
                            cursor: 'pointer'
                        }}
                    >
                        <RotateCcw size={12} />
                        Restablecer por defecto
                    </button>
                    <button
                        onClick={onClose}
                        style={{
                            background: '#0284C7',
                            color: '#FFFFFF',
                            border: 'none',
                            borderRadius: '8px',
                            padding: '8px 18px',
                            fontSize: '0.78rem',
                            fontWeight: 800,
                            cursor: 'pointer',
                            boxShadow: '0 2px 6px rgba(2,132,199,0.3)'
                        }}
                    >
                        Listo / Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}
