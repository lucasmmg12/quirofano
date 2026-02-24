/**
 * ChangePasswordModal — Modal para cambio de contraseña
 * 
 * Props:
 *   - isOpen: boolean
 *   - onClose: () => void
 *   - currentUser: { id, usuario, nombre }
 *   - addToast: (msg, type) => void
 */
import { useState } from 'react';
import { Lock, Eye, EyeOff, Loader2, X, CheckCircle2, AlertCircle } from 'lucide-react';
import { changePassword } from '../services/authService';
import { logAction } from '../services/auditService';


export default function ChangePasswordModal({ isOpen, onClose, currentUser, addToast }) {
    const [oldPassword, setOldPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showOld, setShowOld] = useState(false);
    const [showNew, setShowNew] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const resetForm = () => {
        setOldPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setShowOld(false);
        setShowNew(false);
        setError('');
    };

    const handleClose = () => {
        resetForm();
        onClose();
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');

        if (newPassword !== confirmPassword) {
            setError('Las contraseñas nuevas no coinciden');
            return;
        }
        if (newPassword.length < 4) {
            setError('La nueva contraseña debe tener al menos 4 caracteres');
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
            addToast('Contraseña actualizada correctamente', 'success');
            handleClose();
        } else {
            setError(result.error);
        }
    };

    const inputStyle = {
        width: '100%',
        padding: '10px 40px 10px 14px',
        borderRadius: '8px',
        border: '1.5px solid var(--neutral-200)',
        background: '#fff',
        color: 'var(--neutral-800)',
        fontSize: '0.85rem',
        fontWeight: 500,
        outline: 'none',
        transition: 'all 0.2s',
    };

    return (
        <div
            style={{
                position: 'fixed', inset: 0, zIndex: 100000,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(4px)',
                animation: 'fadeIn 0.15s ease-out',
            }}
            onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
        >
            <div style={{
                width: '100%', maxWidth: '400px',
                background: '#fff', borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
                animation: 'scaleIn 0.2s ease-out',
                overflow: 'hidden',
            }}>
                {/* Header */}
                <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '16px 20px',
                    borderBottom: '1px solid var(--neutral-100)',
                    background: 'linear-gradient(135deg, #EEF2FF, #E0E7FF)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <Lock size={16} style={{ color: '#fff' }} />
                        </div>
                        <div>
                            <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: '#1E293B' }}>
                                Cambiar Contraseña
                            </h3>
                            <p style={{ margin: 0, fontSize: '0.72rem', color: '#64748B' }}>
                                {currentUser.nombre} ({currentUser.usuario})
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleClose}
                        style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: 'var(--neutral-400)', padding: '4px',
                        }}
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
                    {error && (
                        <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 12px', borderRadius: '8px',
                            background: '#FEF2F2', border: '1px solid #FECACA',
                            marginBottom: '16px',
                        }}>
                            <AlertCircle size={15} style={{ color: '#DC2626', flexShrink: 0 }} />
                            <span style={{ fontSize: '0.78rem', color: '#DC2626' }}>{error}</span>
                        </div>
                    )}

                    {/* Contraseña actual */}
                    <div style={{ marginBottom: '14px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.72rem', fontWeight: 600,
                            color: 'var(--neutral-500)', marginBottom: '4px',
                            textTransform: 'uppercase', letterSpacing: '0.3px',
                        }}>
                            Contraseña actual
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showOld ? 'text' : 'password'}
                                value={oldPassword}
                                onChange={e => setOldPassword(e.target.value)}
                                placeholder="Ingresá tu contraseña actual"
                                autoFocus
                                style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px #6366F115'; }}
                                onBlur={e => { e.target.style.borderColor = 'var(--neutral-200)'; e.target.style.boxShadow = 'none'; }}
                            />
                            <button
                                type="button" onClick={() => setShowOld(!showOld)}
                                style={{
                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px',
                                }}
                            >
                                {showOld ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* Nueva contraseña */}
                    <div style={{ marginBottom: '14px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.72rem', fontWeight: 600,
                            color: 'var(--neutral-500)', marginBottom: '4px',
                            textTransform: 'uppercase', letterSpacing: '0.3px',
                        }}>
                            Nueva contraseña
                        </label>
                        <div style={{ position: 'relative' }}>
                            <input
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                placeholder="Mínimo 4 caracteres"
                                style={inputStyle}
                                onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px #6366F115'; }}
                                onBlur={e => { e.target.style.borderColor = 'var(--neutral-200)'; e.target.style.boxShadow = 'none'; }}
                            />
                            <button
                                type="button" onClick={() => setShowNew(!showNew)}
                                style={{
                                    position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)',
                                    background: 'none', border: 'none', cursor: 'pointer', color: '#94A3B8', padding: '2px',
                                }}
                            >
                                {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                        </div>
                    </div>

                    {/* Confirmar contraseña */}
                    <div style={{ marginBottom: '20px' }}>
                        <label style={{
                            display: 'block', fontSize: '0.72rem', fontWeight: 600,
                            color: 'var(--neutral-500)', marginBottom: '4px',
                            textTransform: 'uppercase', letterSpacing: '0.3px',
                        }}>
                            Repetir nueva contraseña
                        </label>
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={e => setConfirmPassword(e.target.value)}
                            placeholder="Repetí la nueva contraseña"
                            style={inputStyle}
                            onFocus={e => { e.target.style.borderColor = '#6366F1'; e.target.style.boxShadow = '0 0 0 3px #6366F115'; }}
                            onBlur={e => { e.target.style.borderColor = 'var(--neutral-200)'; e.target.style.boxShadow = 'none'; }}
                        />
                        {confirmPassword && newPassword && confirmPassword === newPassword && (
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '4px',
                                marginTop: '4px', fontSize: '0.7rem', color: '#16A34A',
                            }}>
                                <CheckCircle2 size={12} /> Coinciden
                            </div>
                        )}
                    </div>

                    {/* Submit */}
                    <button
                        type="submit"
                        disabled={loading || !oldPassword || !newPassword || !confirmPassword}
                        style={{
                            width: '100%', padding: '11px',
                            borderRadius: '8px', border: 'none',
                            background: (!oldPassword || !newPassword || !confirmPassword)
                                ? 'var(--neutral-200)'
                                : 'linear-gradient(135deg, #6366F1, #4F46E5)',
                            color: (!oldPassword || !newPassword || !confirmPassword) ? 'var(--neutral-400)' : '#fff',
                            fontSize: '0.85rem', fontWeight: 700,
                            cursor: loading ? 'not-allowed' : 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                            transition: 'all 0.2s',
                        }}
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                                Actualizando...
                            </>
                        ) : (
                            'Cambiar Contraseña'
                        )}
                    </button>
                </form>
            </div>

            <style>{`
                @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
                @keyframes scaleIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
                @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
