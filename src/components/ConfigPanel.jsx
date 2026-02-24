import { useState, useEffect, useCallback } from 'react';
import {
    Settings, Eye, EyeOff, Save, RotateCw, CheckCircle, AlertTriangle,
    Smartphone, Key, Building2, Globe, Copy, ExternalLink, Zap, Shield,
} from 'lucide-react';
import { getAllConfig, updateMultipleConfigs } from '../services/configService';

// Configuración de los campos con metadata para UI
const FIELD_META = {
    builderbot_api_key: {
        icon: Key, placeholder: 'bb-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        description: 'Clave de autenticación de tu proyecto en BuilderBot Cloud.',
        link: 'https://app.builderbot.cloud',
    },
    builderbot_project_id: {
        icon: Globe, placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        description: 'ID del proyecto en BuilderBot. Se encuentra en la URL del dashboard.',
    },
    whatsapp_phone: {
        icon: Smartphone, placeholder: '5492641234567',
        description: 'Número de WhatsApp vinculado al bot (formato internacional sin +).',
    },
    area_code: {
        icon: Globe, placeholder: '264',
        description: 'Código de área predeterminado para normalización de teléfonos.',
        options: ['11', '221', '223', '261', '264', '266', '280', '291', '299', '341', '342', '351', '370', '376', '379', '381', '383', '385', '387', '388'],
    },
    clinic_name: {
        icon: Building2, placeholder: 'Sanatorio Argentino',
        description: 'Nombre que aparece en las notificaciones y mensajes de WhatsApp.',
    },
    webhook_url: {
        icon: ExternalLink, placeholder: '',
        description: 'Pegá esta URL en BuilderBot → Settings → Webhook para recibir mensajes.',
        readOnly: true, copyable: true,
    },
};

const CATEGORY_LABELS = {
    whatsapp: { label: 'WhatsApp & BuilderBot', icon: Smartphone, color: '#25D366' },
    general: { label: 'General', icon: Building2, color: '#6366F1' },
};

export default function ConfigPanel({ addToast }) {
    const [configs, setConfigs] = useState([]);
    const [editValues, setEditValues] = useState({});
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showSecrets, setShowSecrets] = useState({});
    const [hasChanges, setHasChanges] = useState(false);
    const [testResult, setTestResult] = useState(null); // 'success' | 'error' | null
    const [testing, setTesting] = useState(false);

    const loadConfig = useCallback(async () => {
        try {
            setLoading(true);
            const data = await getAllConfig();
            setConfigs(data);
            const vals = {};
            data.forEach(c => { vals[c.key] = c.value; });
            setEditValues(vals);
            setHasChanges(false);
        } catch (e) {
            console.error(e);
            addToast?.('Error al cargar configuración', 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => { loadConfig(); }, [loadConfig]);

    const handleChange = (key, value) => {
        setEditValues(prev => ({ ...prev, [key]: value }));
        setHasChanges(true);
        setTestResult(null);
    };

    const handleSave = async () => {
        try {
            setSaving(true);
            // Solo guardar los que cambiaron y no son readOnly
            const changed = {};
            configs.forEach(c => {
                const meta = FIELD_META[c.key];
                if (!meta?.readOnly && editValues[c.key] !== c.value) {
                    changed[c.key] = editValues[c.key];
                }
            });

            if (Object.keys(changed).length === 0) {
                addToast?.('No hay cambios para guardar', 'info');
                return;
            }

            await updateMultipleConfigs(changed);
            addToast?.('✅ Configuración guardada correctamente', 'success');
            await loadConfig();
        } catch (e) {
            console.error(e);
            addToast?.('Error al guardar: ' + e.message, 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTestConnection = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            // Verificar que las credenciales no están vacías
            const apiKey = editValues.builderbot_api_key;
            const projectId = editValues.builderbot_project_id;
            if (!apiKey || !projectId) {
                setTestResult('error');
                addToast?.('Completá API Key y Project ID primero', 'error');
                return;
            }
            // Intentar una llamada simple
            const url = `https://app.builderbot.cloud/api/v2/${projectId}/messages`;
            // No podemos llamar directamente por CORS, usamos la Edge Function
            const response = await fetch(`https://hakysnqiryimxbwdslwe.supabase.co/functions/v1/send-whatsapp`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: 'ping', number: '0000000000' }),
            });
            if (response.ok) {
                setTestResult('success');
                addToast?.('✅ Conexión exitosa con BuilderBot', 'success');
            } else {
                setTestResult('error');
                const errData = await response.json().catch(() => ({}));
                addToast?.('❌ Error de conexión: ' + (errData.error || response.statusText), 'error');
            }
        } catch (e) {
            setTestResult('error');
            addToast?.('❌ Sin conexión: ' + e.message, 'error');
        } finally {
            setTesting(false);
        }
    };

    const handleCopy = (value) => {
        // Fallback for browsers without Clipboard API (pre-2021 or non-HTTPS)
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(value).then(() => {
                addToast?.('📋 Copiado al portapapeles', 'success');
            }).catch(() => {
                fallbackCopy(value);
            });
        } else {
            fallbackCopy(value);
        }
    };

    const fallbackCopy = (text) => {
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0';
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            addToast?.('📋 Copiado al portapapeles', 'success');
        } catch (e) {
            addToast?.('No se pudo copiar', 'error');
        }
    };

    const toggleSecret = (key) => {
        setShowSecrets(prev => ({ ...prev, [key]: !prev[key] }));
    };

    // Agrupar configs por categoría
    const grouped = {};
    configs.forEach(c => {
        if (!grouped[c.category]) grouped[c.category] = [];
        grouped[c.category].push(c);
    });

    if (loading) {
        return (
            <div className="content no-print">
                <div className="cart animate-fade-in" style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <RotateCw size={32} style={{ animation: 'spin 1s linear infinite', color: 'var(--primary-400)' }} />
                    <p style={{ marginTop: '12px', color: 'var(--neutral-400)' }}>Cargando configuración...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="content no-print">
            <div className="cart animate-fade-in">
                {/* Header */}
                <div className="cart__header" style={{ borderBottom: '2px solid var(--neutral-100)', paddingBottom: '16px' }}>
                    <div className="cart__title-group">
                        <div className="cart__icon-badge" style={{ background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)' }}>
                            <Settings size={18} color="#fff" />
                        </div>
                        <div>
                            <h3 className="cart__title" style={{ margin: 0 }}>Configuración del Sistema</h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.78rem', color: 'var(--neutral-400)' }}>
                                Credenciales, parámetros y preferencias
                            </p>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            onClick={loadConfig}
                            disabled={saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 16px', borderRadius: 'var(--radius-md)',
                                background: 'var(--neutral-50)', color: 'var(--neutral-600)',
                                border: '1px solid var(--neutral-200)', cursor: 'pointer',
                                fontSize: '0.8rem', fontWeight: 600, transition: 'all 0.15s',
                            }}
                        >
                            <RotateCw size={14} /> Recargar
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={!hasChanges || saving}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '6px',
                                padding: '8px 20px', borderRadius: 'var(--radius-md)',
                                background: hasChanges ? 'linear-gradient(135deg, #22C55E 0%, #16A34A 100%)' : 'var(--neutral-100)',
                                color: hasChanges ? '#fff' : 'var(--neutral-400)',
                                border: 'none', cursor: hasChanges ? 'pointer' : 'not-allowed',
                                fontSize: '0.8rem', fontWeight: 700, transition: 'all 0.2s',
                                boxShadow: hasChanges ? '0 3px 12px rgba(34,197,94,0.3)' : 'none',
                            }}
                        >
                            {saving ? <RotateCw size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Save size={14} />}
                            {saving ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>

                {/* Secciones por categoría */}
                {Object.entries(grouped).map(([category, items]) => {
                    const catMeta = CATEGORY_LABELS[category] || { label: category, icon: Settings, color: '#64748B' };
                    const CatIcon = catMeta.icon;

                    return (
                        <div key={category} style={{ marginTop: '24px' }}>
                            {/* Category Header */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '10px',
                                marginBottom: '16px', paddingBottom: '8px',
                                borderBottom: `2px solid ${catMeta.color}20`,
                            }}>
                                <div style={{
                                    width: '32px', height: '32px', borderRadius: '8px',
                                    background: `${catMeta.color}15`, display: 'flex',
                                    alignItems: 'center', justifyContent: 'center',
                                }}>
                                    <CatIcon size={16} color={catMeta.color} />
                                </div>
                                <h4 style={{
                                    margin: 0, fontSize: '0.9rem', fontWeight: 700,
                                    color: 'var(--neutral-700)',
                                }}>
                                    {catMeta.label}
                                </h4>

                                {/* Test Connection button (solo en whatsapp) */}
                                {category === 'whatsapp' && (
                                    <button
                                        onClick={handleTestConnection}
                                        disabled={testing}
                                        style={{
                                            marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px',
                                            padding: '6px 14px', borderRadius: 'var(--radius-md)',
                                            background: testResult === 'success' ? '#DCFCE7' :
                                                testResult === 'error' ? '#FEF2F2' : '#F0F9FF',
                                            color: testResult === 'success' ? '#16A34A' :
                                                testResult === 'error' ? '#EF4444' : '#0284C7',
                                            border: `1px solid ${testResult === 'success' ? '#22C55E30' :
                                                testResult === 'error' ? '#EF444430' : '#0284C730'}`,
                                            cursor: testing ? 'wait' : 'pointer',
                                            fontSize: '0.75rem', fontWeight: 700, transition: 'all 0.15s',
                                        }}
                                    >
                                        {testing ? (
                                            <><RotateCw size={13} style={{ animation: 'spin 1s linear infinite' }} /> Probando...</>
                                        ) : testResult === 'success' ? (
                                            <><CheckCircle size={13} /> Conexión OK</>
                                        ) : testResult === 'error' ? (
                                            <><AlertTriangle size={13} /> Error de conexión</>
                                        ) : (
                                            <><Zap size={13} /> Probar Conexión</>
                                        )}
                                    </button>
                                )}
                            </div>

                            {/* Fields */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {items.map(config => {
                                    const meta = FIELD_META[config.key] || {};
                                    const FieldIcon = meta.icon || Settings;
                                    const isSecret = config.is_secret;
                                    const isReadOnly = meta.readOnly;
                                    const isVisible = !isSecret || showSecrets[config.key];
                                    const currentValue = editValues[config.key] || '';
                                    const isChanged = currentValue !== config.value;

                                    return (
                                        <div key={config.key} style={{
                                            background: isChanged ? '#FFFBEB' : '#fff',
                                            borderRadius: 'var(--radius-md)',
                                            border: `1px solid ${isChanged ? '#F59E0B40' : 'var(--neutral-200)'}`,
                                            padding: '14px 16px',
                                            transition: 'all 0.2s',
                                        }}>
                                            {/* Label row */}
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                                                <FieldIcon size={14} color="var(--neutral-400)" />
                                                <label style={{
                                                    fontSize: '0.8rem', fontWeight: 700,
                                                    color: 'var(--neutral-700)', flex: 1,
                                                }}>
                                                    {config.label || config.key}
                                                </label>
                                                {isSecret && (
                                                    <button
                                                        onClick={() => toggleSecret(config.key)}
                                                        style={{
                                                            background: 'none', border: 'none', cursor: 'pointer',
                                                            color: 'var(--neutral-400)', padding: '2px',
                                                        }}
                                                        title={isVisible ? 'Ocultar' : 'Mostrar'}
                                                    >
                                                        {isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                                                    </button>
                                                )}
                                                {isChanged && (
                                                    <span style={{
                                                        fontSize: '0.65rem', fontWeight: 700,
                                                        color: '#F59E0B', background: '#FEF3C7',
                                                        padding: '1px 6px', borderRadius: '8px',
                                                    }}>
                                                        Modificado
                                                    </span>
                                                )}
                                                {isSecret && (
                                                    <Shield size={12} color="#EAB308" title="Dato sensible" />
                                                )}
                                            </div>

                                            {/* Input */}
                                            <div style={{ display: 'flex', gap: '8px' }}>
                                                {meta.options ? (
                                                    <select
                                                        value={currentValue}
                                                        onChange={e => handleChange(config.key, e.target.value)}
                                                        style={{
                                                            flex: 1, padding: '8px 12px',
                                                            borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--neutral-200)',
                                                            fontSize: '0.82rem', fontFamily: 'monospace',
                                                            background: '#FAFAFA',
                                                        }}
                                                    >
                                                        {meta.options.map(opt => (
                                                            <option key={opt} value={opt}>{opt}</option>
                                                        ))}
                                                    </select>
                                                ) : (
                                                    <input
                                                        type={isSecret && !isVisible ? 'password' : 'text'}
                                                        value={currentValue}
                                                        onChange={e => handleChange(config.key, e.target.value)}
                                                        readOnly={isReadOnly}
                                                        placeholder={meta.placeholder}
                                                        style={{
                                                            flex: 1, padding: '8px 12px',
                                                            borderRadius: 'var(--radius-sm)',
                                                            border: '1px solid var(--neutral-200)',
                                                            fontSize: '0.82rem', fontFamily: 'monospace',
                                                            background: isReadOnly ? 'var(--neutral-50)' : '#FAFAFA',
                                                            color: isReadOnly ? 'var(--neutral-500)' : 'var(--neutral-800)',
                                                            cursor: isReadOnly ? 'default' : 'text',
                                                        }}
                                                    />
                                                )}
                                                {meta.copyable && (
                                                    <button
                                                        onClick={() => handleCopy(currentValue)}
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                                            color: 'var(--neutral-600)', transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        <Copy size={13} /> Copiar
                                                    </button>
                                                )}
                                                {meta.link && (
                                                    <a
                                                        href={meta.link}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        style={{
                                                            display: 'flex', alignItems: 'center', gap: '4px',
                                                            padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                                                            background: 'var(--neutral-100)', border: '1px solid var(--neutral-200)',
                                                            cursor: 'pointer', fontSize: '0.75rem', fontWeight: 600,
                                                            color: 'var(--neutral-600)', textDecoration: 'none',
                                                            transition: 'all 0.15s',
                                                        }}
                                                    >
                                                        <ExternalLink size={13} /> Abrir
                                                    </a>
                                                )}
                                            </div>

                                            {/* Description */}
                                            {meta.description && (
                                                <p style={{
                                                    margin: '6px 0 0', fontSize: '0.72rem',
                                                    color: 'var(--neutral-400)', lineHeight: 1.4,
                                                }}>
                                                    {meta.description}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}

                {/* Footer info */}
                <div style={{
                    marginTop: '24px', padding: '12px 16px',
                    borderRadius: 'var(--radius-md)',
                    background: 'linear-gradient(135deg, #EFF6FF 0%, #F0F9FF 100%)',
                    border: '1px solid #BFDBFE40',
                    fontSize: '0.73rem', color: '#1E40AF',
                    display: 'flex', alignItems: 'center', gap: '8px',
                }}>
                    <Shield size={14} />
                    <span>
                        Los datos sensibles se almacenan encriptados en Supabase.
                        Los cambios en API Key y Project ID requieren <strong>re-deploy</strong> de las Edge Functions para tomar efecto.
                    </span>
                </div>
            </div>
        </div>
    );
}
