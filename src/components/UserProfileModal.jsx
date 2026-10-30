/**
 * UserProfileModal — Modal para que cada colaborador personalice su Perfil Institucional
 * - Subida de Foto de Perfil (Avatar)
 * - Celular con validación estricta de 10 dígitos (ej: 2645438114 — sin +549, sin 15, sin espacios)
 * - Nombre, Iniciales, DNI, Email, Área/Sector y Cargo
 * - Pestaña integrada para cambiar contraseña personal
 */
import React, { useState, useEffect, useRef } from 'react';
import {
    User, Camera, Phone, Mail, Building2, Briefcase, Lock, Eye, EyeOff,
    Loader2, X, CheckCircle2, AlertCircle, ShieldCheck
} from 'lucide-react';
import {
    getOwnUserProfile,
    updateOwnUserProfile,
    uploadAvatar,
    validateStrictCellphone,
    changePassword,
} from '../services/authService';
import { logAction } from '../services/auditService';

export default function UserProfileModal({ isOpen, onClose, currentUser, onUserUpdated, addToast }) {
    const [tab, setTab] = useState('profile'); // 'profile' | 'password'
    const [loading, setLoading] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);
    const [error, setError] = useState('');
    const [successMsg, setSuccessMsg] = useState('');
    const fileInputRef = useRef(null);

    const [form, setForm] = useState({
        nombre: '',
        iniciales: '',
        dni: '',
        telefono_whatsapp: '',
        email: '',
        area_sector: '',
        cargo: '',
        avatar_url: '',
    });

    // Estado para pestaña de contraseña
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);

    useEffect(() => {
        if (!isOpen || !currentUser?.id) return;
        setError('');
        setSuccessMsg('');
        setForm({
            nombre: currentUser.nombre || '',
            iniciales: currentUser.iniciales || '',
            dni: currentUser.dni || '',
            telefono_whatsapp: currentUser.telefono_whatsapp || '',
            email: currentUser.email || `${currentUser.usuario}@sanatorioargentino.com.ar`,
            area_sector: currentUser.area_sector || '',
            cargo: currentUser.cargo || '',
            avatar_url: currentUser.avatar_url || '',
        });

        getOwnUserProfile(currentUser.id)
            .then(data => {
                if (data) {
                    setForm({
                        nombre: data.nombre || currentUser.nombre || '',
                        iniciales: data.iniciales || currentUser.iniciales || '',
                        dni: data.dni || '',
                        telefono_whatsapp: data.telefono_whatsapp || '',
                        email: data.email || `${currentUser.usuario}@sanatorioargentino.com.ar`,
                        area_sector: data.area_sector || '',
                        cargo: data.cargo || '',
                        avatar_url: data.avatar_url || '',
                    });
                }
            })
            .catch(() => {});
    }, [isOpen, currentUser]);

    if (!isOpen || !currentUser) return null;

    const handleAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setError('');
        try {
            setUploadingPhoto(true);
            const publicUrl = await uploadAvatar(currentUser.id, file);
            setForm(prev => ({ ...prev, avatar_url: publicUrl }));
            onUserUpdated?.({ ...currentUser, avatar_url: publicUrl });
            addToast?.('📸 Foto de perfil actualizada', 'success');
        } catch (err) {
            setError(err.message || 'No se pudo subir la foto de perfil');
        } finally {
            setUploadingPhoto(false);
        }
    };

    const handleSaveProfile = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (!form.nombre.trim()) {
            setError('Tu nombre y apellido es obligatorio');
            return;
        }

        const phoneCheck = validateStrictCellphone(form.telefono_whatsapp);
        if (!phoneCheck.valid) {
            setError(phoneCheck.error);
            return;
        }

        try {
            setLoading(true);
            const updated = await updateOwnUserProfile(currentUser.id, {
                ...form,
                telefono_whatsapp: phoneCheck.clean,
            });
            await logAction('actualizacion_perfil_propio', {
                usuario: currentUser.usuario,
                telefono_whatsapp: phoneCheck.clean,
                area_sector: form.area_sector,
            });
            onUserUpdated?.(updated);
            setSuccessMsg('¡Tu perfil personal fue guardado correctamente!');
            addToast?.('✅ Perfil actualizado correctamente', 'success');
        } catch (err) {
            setError(err.message || 'Error al guardar el perfil');
        } finally {
            setLoading(false);
        }
    };

    const handlePasswordSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setSuccessMsg('');

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas nuevas no coinciden');
            return;
        }
        if (newPassword.length < 6) {
            setError('La nueva contraseña debe tener al menos 6 caracteres');
            return;
        }
        if (newPassword.trim() === '123456') {
            setError('Por seguridad no podés usar "123456"');
            return;
        }
        if (oldPassword === newPassword) {
            setError('La nueva contraseña debe ser diferente a la actual');
            return;
        }

        setLoading(true);
        const result = await changePassword(currentUser.id, oldPassword, newPassword);
        setLoading(false);

        if (result.success) {
            await logAction('cambio_password', { usuario: currentUser.usuario });
            setOldPassword('');
            setNewPassword('');
            setConfirmPassword('');
            setSuccessMsg('Contraseña actualizada correctamente');
            addToast?.('✅ Contraseña actualizada correctamente', 'success');
        } else {
            setError(result.error);
        }
    };

    const phoneValidation = form.telefono_whatsapp ? validateStrictCellphone(form.telefono_whatsapp) : null;

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(15, 23, 42, 0.5)',
                backdropFilter: 'blur(4px)',
                padding: '16px',
            }}
            onClick={e => { if (e.target === e.currentTarget) onClose(); }}
        >
            <div style={{
                width: '100%', maxWidth: '520px',
                background: '#FFFFFF', borderRadius: '18px',
                boxShadow: '0 20px 60px rgba(15, 23, 42, 0.25)',
                overflow: 'hidden', maxHeight: '92vh', display: 'flex', flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '18px 22px',
                    background: 'linear-gradient(135deg, #1E4078 0%, #2563EB 100%)',
                    color: '#FFFFFF',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div
                            onClick={() => fileInputRef.current?.click()}
                            title="Hacé clic para cambiar tu foto de perfil"
                            style={{
                                width: '48px', height: '48px', borderRadius: '50%',
                                background: form.avatar_url ? `url(${form.avatar_url}) center/cover` : 'rgba(255,255,255,0.2)',
                                border: '2px solid rgba(255,255,255,0.85)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 800, fontSize: '1rem', color: '#FFFFFF',
                                cursor: 'pointer', position: 'relative', flexShrink: 0,
                            }}
                        >
                            {!form.avatar_url && (form.iniciales || currentUser.nombre?.slice(0, 2) || 'U').toUpperCase()}
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '1.02rem', fontWeight: 800 }}>
                                Mi Perfil Personal
                            </h3>
                            <p style={{ margin: '2px 0 0', fontSize: '0.75rem', opacity: 0.85 }}>
                                @{currentUser.usuario} · Sanatorio Argentino
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'rgba(255,255,255,0.15)', border: 'none',
                            borderRadius: '8px', width: '32px', height: '32px',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            cursor: 'pointer', color: '#FFFFFF',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Pestañas */}
                <div style={{
                    display: 'grid', gridTemplateColumns: '1fr 1fr',
                    background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                }}>
                    <button
                        type="button"
                        onClick={() => { setTab('profile'); setError(''); setSuccessMsg(''); }}
                        style={{
                            padding: '12px', border: 'none',
                            borderBottom: tab === 'profile' ? '2.5px solid #1E4078' : '2.5px solid transparent',
                            background: tab === 'profile' ? '#FFFFFF' : 'transparent',
                            color: tab === 'profile' ? '#1E4078' : '#64748B',
                            fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                    >
                        <User size={15} /> Datos y Foto de Perfil
                    </button>
                    <button
                        type="button"
                        onClick={() => { setTab('password'); setError(''); setSuccessMsg(''); }}
                        style={{
                            padding: '12px', border: 'none',
                            borderBottom: tab === 'password' ? '2.5px solid #1E4078' : '2.5px solid transparent',
                            background: tab === 'password' ? '#FFFFFF' : 'transparent',
                            color: tab === 'password' ? '#1E4078' : '#64748B',
                            fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        }}
                    >
                        <Lock size={15} /> Cambiar Contraseña
                    </button>
                </div>

                <div style={{ padding: '20px 22px', overflowY: 'auto' }}>
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 12px', borderRadius: '10px',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            marginBottom: '14px',
                        }}>
                            <AlertCircle size={16} color="#DC2626" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: '#DC2626', fontWeight: 600 }}>{error}</span>
                        </div>
                    )}

                    {successMsg && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 12px', borderRadius: '10px',
                            background: '#ECFDF5', border: '1px solid #A7F3D0',
                            marginBottom: '14px',
                        }}>
                            <CheckCircle2 size={16} color="#059669" style={{ flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: '#065F46', fontWeight: 600 }}>{successMsg}</span>
                        </div>
                    )}

                    {tab === 'profile' ? (
                        <form onSubmit={handleSaveProfile}>
                            {/* Bloque de Foto de Perfil */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '14px',
                                padding: '12px 14px', borderRadius: '12px',
                                background: '#F8FAFC', border: '1px solid #E2E8F0',
                                marginBottom: '16px',
                            }}>
                                <div
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        width: '60px', height: '60px', borderRadius: '50%',
                                        background: form.avatar_url ? `url(${form.avatar_url}) center/cover` : '#1E4078',
                                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontWeight: 800, fontSize: '1.1rem', cursor: 'pointer', flexShrink: 0,
                                        border: '2px solid #CBD5E1',
                                    }}
                                >
                                    {!form.avatar_url && <Camera size={22} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.82rem', fontWeight: 700, color: '#0F172A' }}>
                                        Foto de Perfil Personal
                                    </div>
                                    <div style={{ fontSize: '0.72rem', color: '#64748B', marginTop: '2px' }}>
                                        Subí una foto clara de rostro para identificarte en el sistema.
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    disabled={uploadingPhoto}
                                    onClick={() => fileInputRef.current?.click()}
                                    style={{
                                        padding: '8px 14px', borderRadius: '8px',
                                        border: '1px solid #CBD5E1', background: '#FFFFFF',
                                        color: '#1E4078', fontSize: '0.76rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                                    }}
                                >
                                    <Camera size={14} />
                                    {uploadingPhoto ? 'Subiendo...' : (form.avatar_url ? 'Cambiar Foto' : 'Subir Foto')}
                                </button>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleAvatarChange}
                                    style={{ display: 'none' }}
                                />
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 0.5fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Nombre y Apellido *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={form.nombre}
                                        onChange={e => setForm(prev => ({ ...prev, nombre: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Iniciales
                                    </label>
                                    <input
                                        type="text"
                                        maxLength={3}
                                        value={form.iniciales}
                                        onChange={e => setForm(prev => ({ ...prev, iniciales: e.target.value.toUpperCase() }))}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', textAlign: 'center', fontWeight: 700, boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            {/* Celular estricto 2645438114 */}
                            <div style={{ marginBottom: '12px' }}>
                                <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Celular WhatsApp (10 dígitos exactos, ej: 2645438114) *
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <Phone size={15} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: '#64748B' }} />
                                    <input
                                        type="tel"
                                        required
                                        value={form.telefono_whatsapp}
                                        onChange={e => setForm(prev => ({ ...prev, telefono_whatsapp: e.target.value }))}
                                        placeholder="2645438114"
                                        style={{
                                            width: '100%', padding: '10px 12px 10px 36px', borderRadius: '8px',
                                            border: `1.5px solid ${
                                                !form.telefono_whatsapp
                                                    ? '#CBD5E1'
                                                    : phoneValidation?.valid
                                                        ? '#10B981'
                                                        : '#EF4444'
                                            }`,
                                            fontSize: '0.88rem', fontWeight: 700, letterSpacing: '0.5px', boxSizing: 'border-box',
                                        }}
                                    />
                                </div>
                                <div style={{
                                    marginTop: '4px', fontSize: '0.7rem', fontWeight: 600,
                                    color: !form.telefono_whatsapp ? '#64748B' : phoneValidation?.valid ? '#059669' : '#DC2626',
                                }}>
                                    {!form.telefono_whatsapp
                                        ? 'Formato obligatorio: 2645438114 (No uses +549, ni 15, ni espacios).'
                                        : phoneValidation?.valid
                                            ? '✓ Número válido de 10 dígitos'
                                            : phoneValidation?.error}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        DNI
                                    </label>
                                    <input
                                        type="text"
                                        inputMode="numeric"
                                        value={form.dni}
                                        onChange={e => setForm(prev => ({ ...prev, dni: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                                        placeholder="Ej: 38123456"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={form.email}
                                        onChange={e => setForm(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="usuario@sanatorioargentino.com.ar"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Área / Sector
                                    </label>
                                    <input
                                        type="text"
                                        value={form.area_sector}
                                        onChange={e => setForm(prev => ({ ...prev, area_sector: e.target.value }))}
                                        placeholder="Ej: Admisión Quirófano"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Cargo / Función
                                    </label>
                                    <input
                                        type="text"
                                        value={form.cargo}
                                        onChange={e => setForm(prev => ({ ...prev, cargo: e.target.value }))}
                                        placeholder="Ej: Administrativo/a"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        padding: '10px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        padding: '10px 20px', borderRadius: '8px', border: 'none',
                                        background: '#1E4078', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    }}
                                >
                                    {loading ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                                    Guardar Mi Perfil
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handlePasswordSubmit}>
                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Contraseña Actual
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showOld ? 'text' : 'password'}
                                        required
                                        value={oldPassword}
                                        onChange={e => setOldPassword(e.target.value)}
                                        placeholder="Ingresá tu contraseña actual"
                                        style={{ width: '100%', padding: '10px 38px 10px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowOld(!showOld)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                    >
                                        {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginBottom: '14px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Nueva Contraseña Personal (Mín. 6 caracteres)
                                </label>
                                <div style={{ position: 'relative' }}>
                                    <input
                                        type={showNew ? 'text' : 'password'}
                                        required
                                        value={newPassword}
                                        onChange={e => setNewPassword(e.target.value)}
                                        placeholder="Mínimo 6 caracteres (distinta de 123456)"
                                        style={{ width: '100%', padding: '10px 38px 10px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowNew(!showNew)}
                                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8' }}
                                    >
                                        {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                                    </button>
                                </div>
                            </div>

                            <div style={{ marginBottom: '18px' }}>
                                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                    Confirmar Nueva Contraseña
                                </label>
                                <input
                                    type={showNew ? 'text' : 'password'}
                                    required
                                    value={confirmPassword}
                                    onChange={e => setConfirmPassword(e.target.value)}
                                    placeholder="Repetí la nueva contraseña"
                                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                />
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={onClose}
                                    style={{
                                        padding: '10px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Cerrar
                                </button>
                                <button
                                    type="submit"
                                    disabled={loading}
                                    style={{
                                        padding: '10px 20px', borderRadius: '8px', border: 'none',
                                        background: '#1E4078', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    }}
                                >
                                    {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
                                    Actualizar Contraseña
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}

