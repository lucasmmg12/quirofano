/**
 * UserSecurityAdminPanel — Panel Integral de Gestión de Usuarios, Roles y Ciberseguridad (ABM)
 * Estética Calidad-QOAG: Limpia, Clínica, bg-white, bordes redondeados y acentos Azul Institucional.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    ShieldCheck, Users, UserPlus, KeyRound, Smartphone, QrCode, Search,
    RefreshCw, CheckCircle2, AlertTriangle, XCircle, Edit3, RotateCcw,
    Lock, Unlock, Phone, Mail, Shield, Check, X, Loader2
} from 'lucide-react';
import {
    adminListUsers,
    adminSaveUser,
    adminResetUserSecurity,
} from '../services/authService';
import { logAction } from '../services/auditService';

const ROLE_OPTIONS = [
    { value: 'admin', label: 'Administrador Total', color: '#1E40AF', bg: '#DBEAFE' },
    { value: 'operador', label: 'Operador / Admisión / Quirófano', color: '#334155', bg: '#F1F5F9' },
    { value: 'contact_center', label: 'Agente Contact Center', color: '#047857', bg: '#D1FAE5' },
    { value: 'gobernanza', label: 'Gobernanza de Datos', color: '#6D28D9', bg: '#EDE9FE' },
    { value: 'gobernanza_dashboard', label: 'Gobernanza (Solo Dashboard)', color: '#7C3AED', bg: '#F3E8FF' },
    { value: 'uci', label: 'Indicadores UCI', color: '#0369A1', bg: '#E0F2FE' },
    { value: 'activos', label: 'Gestión de Activos', color: '#B45309', bg: '#FEF3C7' },
    { value: 'laboratorio', label: 'Portal Externo Laboratorio', color: '#64748B', bg: '#F8FAFC' },
];

function getRoleMeta(rol) {
    return ROLE_OPTIONS.find(r => r.value === rol) || ROLE_OPTIONS[1];
}

export default function UserSecurityAdminPanel({ addToast, currentUser }) {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active'); // 'all' | 'active' | 'inactive' | 'pending_pwd'

    // Modal Crear / Editar Usuario
    const [editingUser, setEditingUser] = useState(null); // null | user object (id=null for new)
    const [savingUser, setSavingUser] = useState(false);

    // Modal Resetear Contraseña / 2FA
    const [resetModalUser, setResetModalUser] = useState(null);
    const [tempPassword, setTempPassword] = useState('123456');
    const [resetting, setResetting] = useState(false);

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true);
            const data = await adminListUsers();
            setUsers(data);
        } catch (err) {
            console.error('[UserSecurityAdminPanel] Error cargando usuarios:', err);
            addToast?.('Error al cargar usuarios: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        loadUsers();
    }, [loadUsers]);

    const kpis = useMemo(() => {
        const activeUsers = users.filter(u => u.activo && u.rol !== 'laboratorio');
        const pwdUpdated = activeUsers.filter(u => !u.must_change_password).length;
        const pwdPending = activeUsers.filter(u => u.must_change_password).length;
        const mfaConfigured = activeUsers.filter(u => u.mfa_method || u.has_totp || u.telefono_whatsapp).length;
        const trustedTotal = activeUsers.reduce((acc, u) => acc + Number(u.trusted_devices_count || 0), 0);
        return {
            total: users.length,
            activeCount: activeUsers.length,
            inactiveCount: users.filter(u => !u.activo).length,
            pwdUpdated,
            pwdPending,
            mfaConfigured,
            trustedTotal,
        };
    }, [users]);

    const filteredUsers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return users.filter(u => {
            if (roleFilter !== 'all' && (u.rol || 'operador') !== roleFilter) return false;
            if (statusFilter === 'active' && !u.activo) return false;
            if (statusFilter === 'inactive' && u.activo) return false;
            if (statusFilter === 'pending_pwd' && !u.must_change_password) return false;

            if (!q) return true;
            return (
                (u.nombre || '').toLowerCase().includes(q) ||
                (u.usuario || '').toLowerCase().includes(q) ||
                (u.email || '').toLowerCase().includes(q) ||
                (u.telefono_whatsapp || '').toLowerCase().includes(q)
            );
        });
    }, [users, search, roleFilter, statusFilter]);

    const handleOpenCreate = () => {
        setEditingUser({
            id: null,
            usuario: '',
            nombre: '',
            iniciales: '',
            email: '',
            telefono_whatsapp: '',
            rol: 'operador',
            password: '123456',
            activo: true,
            must_change_password: true,
            mfa_enabled: true,
        });
    };

    const handleOpenEdit = (u) => {
        setEditingUser({
            id: u.id,
            usuario: u.usuario || '',
            nombre: u.nombre || '',
            iniciales: u.iniciales || '',
            email: u.email || `${u.usuario}@sanatorioargentino.com.ar`,
            telefono_whatsapp: u.telefono_whatsapp || '',
            rol: u.rol || 'operador',
            password: '',
            activo: Boolean(u.activo),
            must_change_password: Boolean(u.must_change_password),
            mfa_enabled: Boolean(u.mfa_enabled),
        });
    };

    const handleSaveUserSubmit = async (e) => {
        e.preventDefault();
        if (!editingUser.usuario.trim() || !editingUser.nombre.trim()) {
            addToast?.('Usuario y Nombre completo son obligatorios', 'error');
            return;
        }
        try {
            setSavingUser(true);
            await adminSaveUser(editingUser);
            await logAction(editingUser.id ? 'admin_update_user' : 'admin_create_user', {
                admin: currentUser?.usuario,
                target_usuario: editingUser.usuario,
                rol: editingUser.rol,
            });
            addToast?.(
                editingUser.id
                    ? `✅ Usuario ${editingUser.nombre} actualizado`
                    : `✅ Usuario ${editingUser.nombre} creado correctamente`,
                'success'
            );
            setEditingUser(null);
            await loadUsers();
        } catch (err) {
            addToast?.('Error al guardar usuario: ' + err.message, 'error');
        } finally {
            setSavingUser(false);
        }
    };

    const handleQuickToggleActive = async (u) => {
        try {
            await adminSaveUser({
                ...u,
                activo: !u.activo,
            });
            await logAction('admin_toggle_user_active', {
                admin: currentUser?.usuario,
                target_usuario: u.usuario,
                activo: !u.activo,
            });
            addToast?.(
                !u.activo ? `✅ Usuario ${u.nombre} reactivado` : `⚠️ Usuario ${u.nombre} dado de baja`,
                !u.activo ? 'success' : 'info'
            );
            await loadUsers();
        } catch (err) {
            addToast?.('Error cambiando estado: ' + err.message, 'error');
        }
    };

    const handleResetPasswordAndMfa = async ({ resetPassword, resetMfa }) => {
        if (!resetModalUser) return;
        try {
            setResetting(true);
            await adminResetUserSecurity(resetModalUser.id, {
                resetPassword,
                tempPassword: tempPassword || '123456',
                resetMfa,
            });
            await logAction('admin_reset_security', {
                admin: currentUser?.usuario,
                target_usuario: resetModalUser.usuario,
                resetPassword,
                resetMfa,
            });
            addToast?.(`✅ Seguridad reseteada para ${resetModalUser.nombre}`, 'success');
            setResetModalUser(null);
            await loadUsers();
        } catch (err) {
            addToast?.('Error al resetear: ' + err.message, 'error');
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="content no-print" style={{ padding: '20px 24px', maxWidth: '1440px', margin: '0 auto' }}>
            {/* HEADER PRINCIPAL */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px',
                marginBottom: '20px',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '16px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                    <div style={{
                        width: '46px', height: '46px', borderRadius: '12px',
                        background: 'linear-gradient(135deg, #1E4078 0%, #2563EB 100%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(30, 64, 120, 0.2)',
                    }}>
                        <ShieldCheck size={24} color="#FFFFFF" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 800, color: '#0F172A' }}>
                            Gestión de Usuarios, Roles y Ciberseguridad
                        </h2>
                        <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Control de altas/bajas, políticas de contraseña obligatoria y autenticación multifactor (2FA WhatsApp & Authenticator QR)
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <button
                        onClick={loadUsers}
                        disabled={loading}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 16px', borderRadius: '10px',
                            background: '#F8FAFC', color: '#334155',
                            border: '1px solid #CBD5E1', fontSize: '0.82rem',
                            fontWeight: 600, cursor: 'pointer',
                        }}
                    >
                        <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
                    </button>
                    <button
                        onClick={handleOpenCreate}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '10px 18px', borderRadius: '10px',
                            background: '#1E4078', color: '#FFFFFF',
                            border: 'none', fontSize: '0.84rem',
                            fontWeight: 700, cursor: 'pointer',
                            boxShadow: '0 4px 12px rgba(30, 64, 120, 0.2)',
                        }}
                    >
                        <UserPlus size={16} /> Nuevo Usuario
                    </button>
                </div>
            </div>

            {/* TARJETAS KPI DE SEGURIDAD */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '14px',
                marginBottom: '20px',
            }}>
                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Usuarios Activos</span>
                        <Users size={18} color="#1E4078" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A' }}>{kpis.activeCount}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                        Total registrados: {kpis.total} ({kpis.inactiveCount} dados de baja)
                    </div>
                </div>

                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Cambio de Clave Personal</span>
                        <KeyRound size={18} color="#D97706" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A' }}>
                        {kpis.pwdUpdated} <span style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748B' }}>/ {kpis.activeCount}</span>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#D97706', fontWeight: 600, marginTop: '2px' }}>
                        {kpis.pwdPending} usuarios actualizarán su clave al próximo ingreso
                    </div>
                </div>

                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>2FA Multifactor Activo</span>
                        <Smartphone size={18} color="#059669" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#059669' }}>Híbrido</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                        WhatsApp Bot OTP + Google/Microsoft QR
                    </div>
                </div>

                <div style={{
                    background: '#FFFFFF', borderRadius: '12px', padding: '16px 18px',
                    border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>Equipos de Confianza (30d)</span>
                        <Shield size={18} color="#2563EB" />
                    </div>
                    <div style={{ fontSize: '1.65rem', fontWeight: 800, color: '#0F172A' }}>{kpis.trustedTotal}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
                        PCs validadas con sesión 2FA vigente
                    </div>
                </div>
            </div>

            {/* BARRA DE FILTROS Y BÚSQUEDA */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '14px 18px',
                marginBottom: '16px',
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
            }}>
                <div style={{ position: 'relative', flex: '1 1 280px', maxWidth: '420px' }}>
                    <Search size={16} style={{
                        position: 'absolute', left: '12px', top: '50%',
                        transform: 'translateY(-50%)', color: '#94A3B8',
                    }} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar por nombre, usuario, email o celular..."
                        style={{
                            width: '100%', padding: '9px 12px 9px 36px',
                            borderRadius: '8px', border: '1px solid #CBD5E1',
                            fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                    <select
                        value={roleFilter}
                        onChange={e => setRoleFilter(e.target.value)}
                        style={{
                            padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #CBD5E1', fontSize: '0.8rem',
                            fontWeight: 600, color: '#334155', background: '#F8FAFC',
                        }}
                    >
                        <option value="all">Todos los Roles</option>
                        {ROLE_OPTIONS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                    </select>

                    <select
                        value={statusFilter}
                        onChange={e => setStatusFilter(e.target.value)}
                        style={{
                            padding: '8px 12px', borderRadius: '8px',
                            border: '1px solid #CBD5E1', fontSize: '0.8rem',
                            fontWeight: 600, color: '#334155', background: '#F8FAFC',
                        }}
                    >
                        <option value="all">Todos los Estados</option>
                        <option value="active">Solo Usuarios Activos</option>
                        <option value="inactive">Usuarios Dados de Baja</option>
                        <option value="pending_pwd">Pendientes de Cambio de Clave</option>
                    </select>
                </div>
            </div>

            {/* TABLA DE AUDITORÍA Y GESTIÓN DE USUARIOS */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                overflow: 'hidden',
                boxShadow: '0 1px 3px rgba(15, 23, 42, 0.04)',
            }}>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                            <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', textAlign: 'left' }}>
                                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Colaborador / Usuario</th>
                                <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Rol / Nivel Acceso</th>
                                <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Contacto 2FA</th>
                                <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Estado Contraseña</th>
                                <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Estado 2FA / PCs</th>
                                <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Último Ingreso</th>
                                <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                        Cargando nómina de usuarios y estado de seguridad...
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan={7} style={{ padding: '36px', textAlign: 'center', color: '#64748B' }}>
                                        No se encontraron usuarios con los filtros seleccionados.
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map(u => {
                                    const roleMeta = getRoleMeta(u.rol);
                                    return (
                                        <tr
                                            key={u.id}
                                            style={{
                                                borderBottom: '1px solid #F1F5F9',
                                                opacity: u.activo ? 1 : 0.55,
                                                background: u.activo ? '#FFFFFF' : '#F8FAFC',
                                            }}
                                        >
                                            {/* Colaborador */}
                                            <td style={{ padding: '12px 16px' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                    <div style={{
                                                        width: '34px', height: '34px', borderRadius: '9px',
                                                        background: u.activo ? '#1E4078' : '#94A3B8',
                                                        color: '#FFFFFF', fontWeight: 700, fontSize: '0.76rem',
                                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                        flexShrink: 0,
                                                    }}>
                                                        {(u.iniciales || u.nombre?.slice(0, 2) || 'U').slice(0, 2).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                            {u.nombre}
                                                            {!u.activo && (
                                                                <span style={{
                                                                    fontSize: '0.65rem', padding: '1px 6px', borderRadius: '6px',
                                                                    background: '#FEE2E2', color: '#DC2626', fontWeight: 700,
                                                                }}>
                                                                    BAJA
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.74rem', color: '#64748B', fontFamily: 'monospace' }}>
                                                            @{u.usuario}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Rol */}
                                            <td style={{ padding: '12px 14px' }}>
                                                <span style={{
                                                    display: 'inline-block', padding: '4px 10px', borderRadius: '999px',
                                                    fontSize: '0.72rem', fontWeight: 700,
                                                    color: roleMeta.color, background: roleMeta.bg,
                                                }}>
                                                    {roleMeta.label}
                                                </span>
                                            </td>

                                            {/* Contacto 2FA */}
                                            <td style={{ padding: '12px 14px' }}>
                                                <div style={{ fontSize: '0.75rem', color: '#334155', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Phone size={12} color="#059669" />
                                                    {u.telefono_whatsapp ? (
                                                        <span style={{ fontWeight: 600 }}>{u.telefono_whatsapp}</span>
                                                    ) : (
                                                        <span style={{ color: '#94A3B8' }}>Se pedirá al ingresar</span>
                                                    )}
                                                </div>
                                                <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <Mail size={11} color="#94A3B8" />
                                                    {u.email || `${u.usuario}@sanatorioargentino.com.ar`}
                                                </div>
                                            </td>

                                            {/* Estado Contraseña */}
                                            <td style={{ padding: '12px 14px' }}>
                                                {u.must_change_password ? (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        padding: '4px 9px', borderRadius: '8px',
                                                        background: '#FEF3C7', color: '#B45309',
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                    }}>
                                                        <AlertTriangle size={13} /> Actualizará al ingresar
                                                    </span>
                                                ) : (
                                                    <span style={{
                                                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                        padding: '4px 9px', borderRadius: '8px',
                                                        background: '#DCFCE7', color: '#15803D',
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                    }}>
                                                        <CheckCircle2 size={13} /> Clave personal activa
                                                    </span>
                                                )}
                                            </td>

                                            {/* Estado 2FA */}
                                            <td style={{ padding: '12px 14px' }}>
                                                {!u.mfa_enabled ? (
                                                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>Exento</span>
                                                ) : (
                                                    <div>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem', fontWeight: 700, color: '#0F172A' }}>
                                                            {u.has_totp ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#1E4078' }}>
                                                                    <QrCode size={13} /> App QR
                                                                </span>
                                                            ) : u.mfa_method === 'whatsapp' ? (
                                                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#059669' }}>
                                                                    <Smartphone size={13} /> WhatsApp OTP
                                                                </span>
                                                            ) : (
                                                                <span style={{ color: '#64748B' }}>2FA Activo (Elegirá al entrar)</span>
                                                            )}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: '#64748B', marginTop: '2px' }}>
                                                            {u.trusted_devices_count || 0} PC(s) recordadas (30d)
                                                        </div>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Último Ingreso */}
                                            <td style={{ padding: '12px 14px', fontSize: '0.75rem', color: '#475569' }}>
                                                {u.ultimo_login
                                                    ? new Date(u.ultimo_login).toLocaleString('es-AR', {
                                                          day: '2-digit', month: '2-digit', year: '2-digit',
                                                          hour: '2-digit', minute: '2-digit'
                                                      })
                                                    : 'Sin registro'}
                                            </td>

                                            {/* Acciones */}
                                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                    <button
                                                        onClick={() => handleOpenEdit(u)}
                                                        title="Editar usuario, rol y teléfono WhatsApp"
                                                        style={{
                                                            padding: '6px 10px', borderRadius: '8px',
                                                            border: '1px solid #CBD5E1', background: '#FFFFFF',
                                                            color: '#1E293B', fontSize: '0.74rem', fontWeight: 600,
                                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        }}
                                                    >
                                                        <Edit3 size={13} /> Editar
                                                    </button>
                                                    <button
                                                        onClick={() => { setResetModalUser(u); setTempPassword('123456'); }}
                                                        title="Blanquear contraseña o resetear 2FA"
                                                        style={{
                                                            padding: '6px 10px', borderRadius: '8px',
                                                            border: '1px solid #FDE68A', background: '#FFFBEB',
                                                            color: '#B45309', fontSize: '0.74rem', fontWeight: 600,
                                                            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                        }}
                                                    >
                                                        <RotateCcw size={13} /> Clave / 2FA
                                                    </button>
                                                    <button
                                                        onClick={() => handleQuickToggleActive(u)}
                                                        title={u.activo ? 'Dar de baja usuario' : 'Reactivar usuario'}
                                                        style={{
                                                            padding: '6px 10px', borderRadius: '8px',
                                                            border: `1px solid ${u.activo ? '#FECACA' : '#BBF7D0'}`,
                                                            background: u.activo ? '#FEF2F2' : '#F0FDF4',
                                                            color: u.activo ? '#DC2626' : '#15803D',
                                                            fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                                        }}
                                                    >
                                                        {u.activo ? 'Baja' : 'Alta'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ================================================================= */}
            {/* MODAL CREAR / EDITAR USUARIO                                      */}
            {/* ================================================================= */}
            {editingUser && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100000,
                        background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setEditingUser(null); }}
                >
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '520px',
                        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)', overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '18px 22px', borderBottom: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#F8FAFC',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <UserPlus size={19} color="#1E4078" />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#0F172A' }}>
                                    {editingUser.id ? `Editar Usuario (@${editingUser.usuario})` : 'Alta de Nuevo Usuario'}
                                </h3>
                            </div>
                            <button
                                onClick={() => setEditingUser(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveUserSubmit} style={{ padding: '20px 22px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                                        Nombre y Apellido *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={editingUser.nombre}
                                        onChange={e => setEditingUser(prev => ({ ...prev, nombre: e.target.value }))}
                                        placeholder="Ej: María Pérez"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                                        Usuario de Login *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={editingUser.usuario}
                                        onChange={e => setEditingUser(prev => ({ ...prev, usuario: e.target.value.toLowerCase().trim() }))}
                                        placeholder="Ej: mperez"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                                        Celular WhatsApp (para 2FA)
                                    </label>
                                    <input
                                        type="tel"
                                        value={editingUser.telefono_whatsapp}
                                        onChange={e => setEditingUser(prev => ({ ...prev, telefono_whatsapp: e.target.value }))}
                                        placeholder="Ej: 2645123456"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                                        Email Institucional
                                    </label>
                                    <input
                                        type="email"
                                        value={editingUser.email}
                                        onChange={e => setEditingUser(prev => ({ ...prev, email: e.target.value }))}
                                        placeholder="usuario@sanatorioargentino.com.ar"
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '14px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                                        Rol y Nivel de Acceso
                                    </label>
                                    <select
                                        value={editingUser.rol}
                                        onChange={e => setEditingUser(prev => ({ ...prev, rol: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', background: '#FFFFFF', boxSizing: 'border-box' }}
                                    >
                                        {ROLE_OPTIONS.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '5px', textTransform: 'uppercase' }}>
                                         {editingUser.id ? 'Nueva Clave (Opcional)' : 'Clave Inicial'}
                                    </label>
                                    <input
                                        type="text"
                                        value={editingUser.password}
                                        onChange={e => setEditingUser(prev => ({ ...prev, password: e.target.value }))}
                                        placeholder={editingUser.id ? 'Dejar vacío para no cambiar' : '123456'}
                                        style={{ width: '100%', padding: '9px 12px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.85rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{
                                background: '#F8FAFC', border: '1px solid #E2E8F0',
                                borderRadius: '10px', padding: '12px 14px', marginBottom: '18px',
                                display: 'flex', flexDirection: 'column', gap: '10px',
                            }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={editingUser.must_change_password}
                                        onChange={e => setEditingUser(prev => ({ ...prev, must_change_password: e.target.checked }))}
                                    />
                                    <span>Exigir que el usuario actualice su contraseña en su próximo ingreso</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={editingUser.mfa_enabled}
                                        onChange={e => setEditingUser(prev => ({ ...prev, mfa_enabled: e.target.checked }))}
                                    />
                                    <span>Requerir Autenticación Multifactor 2FA (WhatsApp / Google Authenticator)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={editingUser.activo}
                                        onChange={e => setEditingUser(prev => ({ ...prev, activo: e.target.checked }))}
                                    />
                                    <span>Cuenta Activa (Habilitada para ingresar al sistema)</span>
                                </label>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setEditingUser(null)}
                                    style={{
                                        padding: '10px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontSize: '0.84rem', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={savingUser}
                                    style={{
                                        padding: '10px 20px', borderRadius: '8px', border: 'none',
                                        background: '#1E4078', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    }}
                                >
                                    {savingUser ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                    Guardar Usuario
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* ================================================================= */}
            {/* MODAL RESETEAR CONTRASEÑA / 2FA                                   */}
            {/* ================================================================= */}
            {resetModalUser && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100000,
                        background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setResetModalUser(null); }}
                >
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '440px',
                        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)', padding: '22px',
                    }}>
                        <h3 style={{ margin: '0 0 6px', fontSize: '1.05rem', fontWeight: 800, color: '#0F172A' }}>
                            Blanqueo de Seguridad — {resetModalUser.nombre}
                        </h3>
                        <p style={{ margin: '0 0 16px', fontSize: '0.8rem', color: '#64748B' }}>
                            Seleccioná qué acción querés aplicar sobre la cuenta <strong>@{resetModalUser.usuario}</strong>:
                        </p>

                        <div style={{
                            background: '#F8FAFC', border: '1px solid #E2E8F0',
                            borderRadius: '10px', padding: '14px', marginBottom: '14px',
                        }}>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                                1. Blanquear Contraseña Temporal
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    value={tempPassword}
                                    onChange={e => setTempPassword(e.target.value)}
                                    style={{
                                        flex: 1, padding: '8px 12px', borderRadius: '8px',
                                        border: '1px solid #CBD5E1', fontSize: '0.85rem', fontWeight: 600,
                                    }}
                                />
                                <button
                                    type="button"
                                    disabled={resetting}
                                    onClick={() => handleResetPasswordAndMfa({ resetPassword: true, resetMfa: false })}
                                    style={{
                                        padding: '8px 14px', borderRadius: '8px', border: 'none',
                                        background: '#D97706', color: '#FFFFFF', fontSize: '0.78rem',
                                        fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                                    }}
                                >
                                    Blanquear Clave
                                </button>
                            </div>
                            <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                Le asigna esta clave temporal y le exige elegir una nueva apenas ingrese.
                            </p>
                        </div>

                        <div style={{
                            background: '#F8FAFC', border: '1px solid #E2E8F0',
                            borderRadius: '10px', padding: '14px', marginBottom: '18px',
                        }}>
                            <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 700, color: '#475569', marginBottom: '6px', textTransform: 'uppercase' }}>
                                2. Reiniciar Segundo Factor (2FA) y Equipos Recordados
                            </label>
                            <button
                                type="button"
                                disabled={resetting}
                                onClick={() => handleResetPasswordAndMfa({ resetPassword: false, resetMfa: true })}
                                style={{
                                    width: '100%', padding: '9px 14px', borderRadius: '8px',
                                    border: '1px solid #CBD5E1', background: '#FFFFFF',
                                    color: '#1E4078', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                                }}
                            >
                                Limpiar QR Authenticator y Cerrar Dispositivos (30d)
                            </button>
                            <p style={{ margin: '6px 0 0', fontSize: '0.72rem', color: '#64748B' }}>
                                Útil si el colaborador cambió de teléfono celular o necesita reconfigurar su QR.
                            </p>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                            <button
                                type="button"
                                onClick={() => setResetModalUser(null)}
                                style={{
                                    padding: '8px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                    background: '#FFFFFF', color: '#475569', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer',
                                }}
                            >
                                Cerrar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

