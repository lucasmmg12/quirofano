/**
 * UserSecurityAdminPanel — Panel Integral de Gestión de Usuarios, Roles, Telemetría y Ciberseguridad (ABM + DLP)
 * Estética Calidad-QOAG: Limpia, Clínica, bg-white, bordes redondeados y acentos Azul Institucional.
 */
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
    ShieldCheck, Users, UserPlus, KeyRound, Smartphone, QrCode, Search,
    RefreshCw, CheckCircle2, AlertTriangle, Edit3, RotateCcw,
    Phone, Mail, Shield, Check, X, Loader2, ChevronDown, ChevronUp,
    MapPin, Globe, Monitor, Activity, Clock, FileDown, Copy, Printer, ExternalLink,
    Camera, Inbox, CheckCircle, XCircle
} from 'lucide-react';
import {
    adminListUsers,
    adminSaveUser,
    adminResetUserSecurity,
    adminListAccessRequests,
    adminApproveAccessRequest,
    adminRejectAccessRequest,
    validateStrictCellphone,
    normalizeLegacyPhoneTo10Digits,
    uploadAvatarFileOnly,
} from '../services/authService';
import { logAction, fetchUserCybersecurityProfile } from '../services/auditService';
import { requestAndRecordGeolocation, subscribeTelemetry } from '../lib/activityTracker';

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

function formatDurationMinutes(mins) {
    if (!mins || mins < 1) return '< 1 min';
    if (mins < 60) return `${Math.round(mins)} min`;
    const h = Math.floor(mins / 60);
    const m = Math.round(mins % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatRelativeTime(iso) {
    if (!iso) return '—';
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (diffSec < 60) return 'hace instantes';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `hace ${diffMin} min`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `hace ${diffHr} h`;
    const diffDays = Math.floor(diffHr / 24);
    return `hace ${diffDays} d`;
}

function getActionBadgeMeta(accion = '') {
    const a = accion.toLowerCase();
    if (a === 'login' || a === 'apertura_sistema') {
        return { label: a === 'login' ? 'Login 2FA' : 'Apertura App', bg: '#DCFCE7', color: '#15803D', border: '#BBF7D0' };
    }
    if (a === 'logout') {
        return { label: 'Cierre Sesión', bg: '#F1F5F9', color: '#475569', border: '#CBD5E1' };
    }
    if (a.includes('dlp_export') || a.includes('export') || a.includes('excel') || a.includes('pdf')) {
        return { label: '⚠️ Exportación / Descarga', bg: '#FEF3C7', color: '#B45309', border: '#FDE68A' };
    }
    if (a.includes('dlp_copia') || a.includes('copy')) {
        return { label: '⚠️ Copia Portapapeles', bg: '#FEE2E2', color: '#DC2626', border: '#FECACA' };
    }
    if (a.includes('dlp_impresion') || a.includes('print')) {
        return { label: '🖨️ Impresión', bg: '#FCE7F3', color: '#BE185D', border: '#FBCFE8' };
    }
    if (a.includes('password') || a.includes('security') || a.includes('admin_')) {
        return { label: '🔐 Seguridad', bg: '#EDE9FE', color: '#6D28D9', border: '#DDD6FE' };
    }
    if (a.includes('whatsapp') || a.includes('mensaje')) {
        return { label: '💬 WhatsApp', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0' };
    }
    if (a === 'clic') {
        return { label: 'Navegación Módulo', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE' };
    }
    return { label: accion, bg: '#F8FAFC', color: '#334155', border: '#E2E8F0' };
}

function describeMovement(log) {
    const det = log?.detalle || {};
    if (det.label && det.modulo) {
        return `${det.label} (${det.modulo})`;
    }
    if (det.label) return det.label;
    if (det.modulo) return `Módulo: ${det.modulo}`;
    if (det.target_usuario) return `Usuario objetivo: @${det.target_usuario}`;
    if (det.paciente) return `Paciente: ${det.paciente}`;
    if (det.muestra) return `Texto copiado: "${det.muestra}"`;
    if (log.accion === 'login') return `Inicio de sesión validado${det.mfa ? ' con 2FA' : ''}`;
    if (log.accion === 'logout') return 'Cerró sesión en el sistema';
    return 'Actividad registrada en el sistema';
}

export default function UserSecurityAdminPanel({ addToast, currentUser }) {
    const [activeTab, setActiveTab] = useState('users'); // 'users' | 'requests'
    const [users, setUsers] = useState([]);
    const [accessRequests, setAccessRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('active'); // 'all' | 'active' | 'inactive' | 'pending_pwd'
    const [reqStatusFilter, setReqStatusFilter] = useState('pendiente'); // 'pendiente' | 'all' | 'aprobada' | 'rechazada'

    // Desplegable Forense y de Movimientos por Usuario
    const [expandedUserId, setExpandedUserId] = useState(null);
    const [userProfilesCache, setUserProfilesCache] = useState({});
    const [loadingProfileUser, setLoadingProfileUser] = useState(null);
    const [movementsLimitByUser, setMovementsLimitByUser] = useState({}); // default 10, toggleable to 30

    // Telemetría propia de la sesión actual
    const [myTelemetry, setMyTelemetry] = useState(null);
    const [refreshingGeo, setRefreshingGeo] = useState(false);

    // Modal Crear / Editar Usuario
    const [editingUser, setEditingUser] = useState(null);
    const [savingUser, setSavingUser] = useState(false);
    const [uploadingEditAvatar, setUploadingEditAvatar] = useState(false);
    const editAvatarInputRef = useRef(null);

    // Modal Aprobar Solicitud de Alta
    const [approvingReq, setApprovingReq] = useState(null);
    const [processingReqId, setProcessingReqId] = useState(null);

    // Modal Resetear Contraseña / 2FA
    const [resetModalUser, setResetModalUser] = useState(null);
    const [tempPassword, setTempPassword] = useState('123456');
    const [resetting, setResetting] = useState(false);

    useEffect(() => {
        const unsub = subscribeTelemetry((ctx) => {
            setMyTelemetry(ctx);
        });
        return unsub;
    }, []);

    const loadUsers = useCallback(async () => {
        try {
            setLoading(true);
            const [usersData, reqsData] = await Promise.all([
                adminListUsers(),
                adminListAccessRequests().catch(() => []),
            ]);
            setUsers(usersData);
            setAccessRequests(reqsData || []);
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

    const loadUserProfile = useCallback(async (u, force = false) => {
        if (!u?.usuario) return;
        if (!force && userProfilesCache[u.usuario]) return;
        try {
            setLoadingProfileUser(u.usuario);
            const profile = await fetchUserCybersecurityProfile(u.usuario, 30);
            setUserProfilesCache(prev => ({ ...prev, [u.usuario]: profile }));
        } catch (err) {
            console.error('[UserSecurityAdminPanel] Error cargando perfil forense:', err);
        } finally {
            setLoadingProfileUser(null);
        }
    }, [userProfilesCache]);

    const handleToggleExpandUser = (u) => {
        if (expandedUserId === u.id) {
            setExpandedUserId(null);
        } else {
            setExpandedUserId(u.id);
            loadUserProfile(u, true);
        }
    };

    const handleRequestMyGeolocation = async () => {
        setRefreshingGeo(true);
        try {
            const ctx = await requestAndRecordGeolocation();
            if (ctx?.geo_permission === 'granted') {
                addToast?.(`📍 Ubicación verificada: ${ctx.geo_label}`, 'success');
            } else if (ctx?.geo_permission === 'denied') {
                addToast?.('⚠️ El navegador tiene bloqueado el permiso de Ubicación. Hacé clic en el ícono de candado junto a la URL y activá "Ubicación: Permitir".', 'error');
            } else {
                addToast?.(`📍 Ubicación registrada por red IP: ${ctx?.geo_label || ctx?.ip || 'Activa'}`, 'info');
            }
            if (expandedUserId) {
                const expUser = users.find(x => x.id === expandedUserId);
                if (expUser) loadUserProfile(expUser, true);
            }
        } finally {
            setRefreshingGeo(false);
        }
    };

    const kpis = useMemo(() => {
        const activeUsers = users.filter(u => u.activo && u.rol !== 'laboratorio');
        const pwdUpdated = activeUsers.filter(u => !u.must_change_password).length;
        const pwdPending = activeUsers.filter(u => u.must_change_password).length;
        const mfaConfigured = activeUsers.filter(u => u.mfa_method || u.has_totp || u.telefono_whatsapp).length;
        const trustedTotal = activeUsers.reduce((acc, u) => acc + Number(u.trusted_devices_count || 0), 0);
        const pendingRequestsCount = accessRequests.filter(r => r.estado === 'pendiente').length;
        return {
            total: users.length,
            activeCount: activeUsers.length,
            inactiveCount: users.filter(u => !u.activo).length,
            pwdUpdated,
            pwdPending,
            mfaConfigured,
            trustedTotal,
            pendingRequestsCount,
        };
    }, [users, accessRequests]);

    const filteredRequests = useMemo(() => {
        const q = search.trim().toLowerCase();
        return accessRequests.filter(r => {
            if (reqStatusFilter !== 'all' && r.estado !== reqStatusFilter) return false;
            if (!q) return true;
            return (
                (r.nombre || '').toLowerCase().includes(q) ||
                (r.usuario_sugerido || '').toLowerCase().includes(q) ||
                (r.email || '').toLowerCase().includes(q) ||
                (r.telefono_whatsapp || '').toLowerCase().includes(q) ||
                (r.area_sector || '').toLowerCase().includes(q) ||
                (r.dni || '').toLowerCase().includes(q)
            );
        });
    }, [accessRequests, reqStatusFilter, search]);

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
            dni: '',
            area_sector: '',
            cargo: '',
            avatar_url: '',
        });
    };

    const handleOpenEdit = (u) => {
        setEditingUser({
            id: u.id,
            usuario: u.usuario || '',
            nombre: u.nombre || '',
            iniciales: u.iniciales || '',
            email: u.email || `${u.usuario}@sanatorioargentino.com.ar`,
            telefono_whatsapp: normalizeLegacyPhoneTo10Digits(u.telefono_whatsapp || ''),
            rol: u.rol || 'operador',
            password: '',
            activo: Boolean(u.activo),
            must_change_password: Boolean(u.must_change_password),
            mfa_enabled: Boolean(u.mfa_enabled),
            dni: u.dni || '',
            area_sector: u.area_sector || '',
            cargo: u.cargo || '',
            avatar_url: u.avatar_url || '',
        });
    };

    const handleEditAvatarChange = async (e) => {
        const file = e.target.files?.[0];
        if (!file || !editingUser) return;
        try {
            setUploadingEditAvatar(true);
            const url = await uploadAvatarFileOnly(file, editingUser.usuario || 'user');
            setEditingUser(prev => ({ ...prev, avatar_url: url }));
            addToast?.('📸 Foto de perfil cargada', 'success');
        } catch (err) {
            addToast?.('Error subiendo foto: ' + err.message, 'error');
        } finally {
            setUploadingEditAvatar(false);
        }
    };

    const handleSaveUserSubmit = async (e) => {
        e.preventDefault();
        if (!editingUser.usuario.trim() || !editingUser.nombre.trim()) {
            addToast?.('Usuario y Nombre completo son obligatorios', 'error');
            return;
        }
        if (editingUser.telefono_whatsapp && String(editingUser.telefono_whatsapp).trim()) {
            const check = validateStrictCellphone(editingUser.telefono_whatsapp);
            if (!check.valid) {
                addToast?.(check.error, 'error');
                return;
            }
        }
        try {
            setSavingUser(true);
            await adminSaveUser({
                ...editingUser,
                must_change_password: Boolean(editingUser.must_change_password),
                mfa_enabled: Boolean(editingUser.mfa_enabled),
                activo: Boolean(editingUser.activo),
            });
            await logAction(editingUser.id ? 'admin_update_user' : 'admin_create_user', {
                admin: currentUser?.usuario,
                target_usuario: editingUser.usuario,
                rol: editingUser.rol,
                must_change_password: Boolean(editingUser.must_change_password),
                mfa_enabled: Boolean(editingUser.mfa_enabled),
                activo: Boolean(editingUser.activo),
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

    const handleOpenApproveModal = (reqItem) => {
        setApprovingReq({
            ...reqItem,
            usuario: reqItem.usuario_sugerido || '',
            rol: reqItem.rol_solicitado === 'admin' ? 'operador' : (reqItem.rol_solicitado || 'operador'),
            password: '123456',
            must_change_password: true,
            mfa_enabled: true,
            activo: true,
            notas_admin: 'Alta aprobada por Administración',
        });
    };

    const handleConfirmApproveRequest = async (e) => {
        e.preventDefault();
        if (!approvingReq) return;
        const phoneCheck = validateStrictCellphone(approvingReq.telefono_whatsapp);
        if (!phoneCheck.valid) {
            addToast?.(phoneCheck.error, 'error');
            return;
        }
        try {
            setProcessingReqId(approvingReq.id);
            await adminApproveAccessRequest(
                approvingReq.id,
                {
                    usuario: approvingReq.usuario,
                    nombre: approvingReq.nombre,
                    email: approvingReq.email,
                    telefono_whatsapp: phoneCheck.clean,
                    rol: approvingReq.rol,
                    password: approvingReq.password || '123456',
                    must_change_password: Boolean(approvingReq.must_change_password),
                    mfa_enabled: Boolean(approvingReq.mfa_enabled),
                    activo: Boolean(approvingReq.activo),
                    dni: approvingReq.dni,
                    area_sector: approvingReq.area_sector,
                    cargo: approvingReq.cargo,
                    avatar_url: approvingReq.avatar_url,
                    notas_admin: approvingReq.notas_admin,
                },
                currentUser?.usuario || 'admin'
            );
            await logAction('admin_approve_user_request', {
                admin: currentUser?.usuario,
                target_usuario: approvingReq.usuario,
                rol: approvingReq.rol,
            });
            addToast?.(`✅ Alta aprobada: @${approvingReq.usuario} creado y notificado por WhatsApp`, 'success');
            setApprovingReq(null);
            await loadUsers();
        } catch (err) {
            addToast?.('Error al aprobar solicitud: ' + err.message, 'error');
        } finally {
            setProcessingReqId(null);
        }
    };

    const handleRejectRequest = async (reqItem) => {
        const motivoRechazo = window.prompt(`¿Por qué se rechaza la solicitud de ${reqItem.nombre} (@${reqItem.usuario_sugerido})?`, 'Solicitud desestimada');
        if (motivoRechazo === null) return;
        try {
            setProcessingReqId(reqItem.id);
            await adminRejectAccessRequest(reqItem.id, motivoRechazo, currentUser?.usuario || 'admin');
            await logAction('admin_reject_user_request', {
                admin: currentUser?.usuario,
                target_usuario: reqItem.usuario_sugerido,
                motivo: motivoRechazo,
            });
            addToast?.(`Solicitud de ${reqItem.nombre} rechazada`, 'info');
            await loadUsers();
        } catch (err) {
            addToast?.('Error al rechazar solicitud: ' + err.message, 'error');
        } finally {
            setProcessingReqId(null);
        }
    };

    const handleQuickToggleActive = async (u) => {
        try {
            await adminSaveUser({
                ...u,
                activo: !u.activo,
                skipPhoneValidation: true,
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
        <div className="no-print" style={{ padding: '16px 20px', width: '100%', maxWidth: '100%', boxSizing: 'border-box' }}>
            {/* HEADER PRINCIPAL */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '20px 24px',
                marginBottom: '16px',
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
                            Gestión de Usuarios, Telemetría y Ciberseguridad (DLP)
                        </h2>
                        <p style={{ margin: '3px 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                            Hacé clic sobre cualquier usuario para desplegar sus últimos 10 movimientos, geolocalización GPS/IP, módulos que utiliza e indicadores de fuga de datos.
                        </p>
                    </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                        onClick={handleRequestMyGeolocation}
                        disabled={refreshingGeo}
                        title="Solicitar y registrar geolocalización GPS exacta de esta terminal ahora"
                        style={{
                            display: 'flex', alignItems: 'center', gap: '6px',
                            padding: '10px 14px', borderRadius: '10px',
                            background: myTelemetry?.geo_permission === 'granted' ? '#ECFDF5' : '#FEF3C7',
                            color: myTelemetry?.geo_permission === 'granted' ? '#047857' : '#B45309',
                            border: `1px solid ${myTelemetry?.geo_permission === 'granted' ? '#A7F3D0' : '#FDE68A'}`,
                            fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer',
                        }}
                    >
                        <MapPin size={15} className={refreshingGeo ? 'animate-bounce' : ''} />
                        {myTelemetry?.geo_permission === 'granted'
                            ? `GPS Activo (${myTelemetry?.geo_label?.split('(')[0]?.trim() || 'Verificado'})`
                            : 'Validar Mi Geolocalización GPS'}
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
            </div>

            {/* BARRA DE PESTAÑAS: NÓMINA DE USUARIOS vs SOLICITUDES DE ALTA */}
            <div style={{
                display: 'flex',
                gap: '8px',
                marginBottom: '16px',
                borderBottom: '2px solid #E2E8F0',
                paddingBottom: '2px',
            }}>
                <button
                    type="button"
                    onClick={() => setActiveTab('users')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '10px 18px', borderRadius: '10px 10px 0 0',
                        border: 'none', cursor: 'pointer',
                        background: activeTab === 'users' ? '#1E4078' : 'transparent',
                        color: activeTab === 'users' ? '#FFFFFF' : '#475569',
                        fontSize: '0.84rem', fontWeight: 700, transition: 'all 0.15s',
                    }}
                >
                    <Users size={16} />
                    <span>Usuarios y Roles ({users.length})</span>
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab('requests')}
                    style={{
                        display: 'inline-flex', alignItems: 'center', gap: '8px',
                        padding: '10px 18px', borderRadius: '10px 10px 0 0',
                        border: 'none', cursor: 'pointer',
                        background: activeTab === 'requests' ? '#1E4078' : (kpis.pendingRequestsCount > 0 ? '#FEF3C7' : 'transparent'),
                        color: activeTab === 'requests' ? '#FFFFFF' : (kpis.pendingRequestsCount > 0 ? '#B45309' : '#475569'),
                        fontSize: '0.84rem', fontWeight: 700, transition: 'all 0.15s',
                    }}
                >
                    <Inbox size={16} />
                    <span>Solicitudes de Alta</span>
                    <span style={{
                        padding: '2px 8px', borderRadius: '999px', fontSize: '0.72rem', fontWeight: 800,
                        background: kpis.pendingRequestsCount > 0
                            ? (activeTab === 'requests' ? '#F59E0B' : '#DC2626')
                            : (activeTab === 'requests' ? 'rgba(255,255,255,0.2)' : '#E2E8F0'),
                        color: kpis.pendingRequestsCount > 0 ? '#FFFFFF' : (activeTab === 'requests' ? '#FFFFFF' : '#475569'),
                    }}>
                        {kpis.pendingRequestsCount} pendiente{kpis.pendingRequestsCount !== 1 ? 's' : ''}
                    </span>
                </button>
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
                <div style={{ position: 'relative', flex: '1 1 320px' }}>
                    <Search size={16} style={{
                        position: 'absolute', left: '12px', top: '50%',
                        transform: 'translateY(-50%)', color: '#94A3B8',
                    }} />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder={activeTab === 'requests' ? 'Buscar solicitud por nombre, DNI, usuario, sector o celular...' : 'Buscar por nombre, usuario, email o celular...'}
                        style={{
                            width: '100%', padding: '9px 12px 9px 36px',
                            borderRadius: '8px', border: '1px solid #CBD5E1',
                            fontSize: '0.84rem', outline: 'none', boxSizing: 'border-box',
                        }}
                    />
                </div>

                {activeTab === 'users' ? (
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
                ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
                        <select
                            value={reqStatusFilter}
                            onChange={e => setReqStatusFilter(e.target.value)}
                            style={{
                                padding: '8px 12px', borderRadius: '8px',
                                border: '1px solid #CBD5E1', fontSize: '0.8rem',
                                fontWeight: 700, color: '#334155', background: '#F8FAFC',
                            }}
                        >
                            <option value="pendiente">Pendientes de Aprobación ({kpis.pendingRequestsCount})</option>
                            <option value="aprobada">Solicitudes Aprobadas</option>
                            <option value="rechazada">Solicitudes Rechazadas</option>
                            <option value="all">Todas las Solicitudes ({accessRequests.length})</option>
                        </select>
                    </div>
                )}
            </div>

            {/* TABLA DE AUDITORÍA Y GESTIÓN DE USUARIOS */}
            {activeTab === 'users' && (
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
                                    const isExpanded = expandedUserId === u.id;
                                    const profile = userProfilesCache[u.usuario];
                                    const isLoadingProfile = loadingProfileUser === u.usuario;
                                    const movLimit = movementsLimitByUser[u.usuario] || 10;

                                    return (
                                        <React.Fragment key={u.id}>
                                            <tr
                                                onClick={() => handleToggleExpandUser(u)}
                                                title="Hacé clic para desplegar los últimos 10 movimientos, geolocalización y estadísticas de uso"
                                                style={{
                                                    borderBottom: isExpanded ? 'none' : '1px solid #F1F5F9',
                                                    opacity: u.activo ? 1 : 0.55,
                                                    background: isExpanded ? '#F0F9FF' : (u.activo ? '#FFFFFF' : '#F8FAFC'),
                                                    cursor: 'pointer',
                                                    transition: 'background 0.15s ease',
                                                }}
                                            >
                                                {/* Colaborador */}
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {u.avatar_url ? (
                                                            <img
                                                                src={u.avatar_url}
                                                                alt={u.nombre}
                                                                style={{
                                                                    width: '36px', height: '36px', borderRadius: '10px',
                                                                    objectFit: 'cover', flexShrink: 0,
                                                                    border: `2px solid ${isExpanded ? '#0284C7' : '#CBD5E1'}`,
                                                                }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: '36px', height: '36px', borderRadius: '10px',
                                                                background: isExpanded ? '#0284C7' : (u.activo ? '#1E4078' : '#94A3B8'),
                                                                color: '#FFFFFF', fontWeight: 700, fontSize: '0.76rem',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                                flexShrink: 0,
                                                            }}>
                                                                {(u.iniciales || u.nombre?.slice(0, 2) || 'U').slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
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
                                                                <span style={{
                                                                    display: 'inline-flex', alignItems: 'center', gap: '3px',
                                                                    fontSize: '0.68rem', padding: '2px 7px', borderRadius: '999px',
                                                                    background: isExpanded ? '#0284C7' : '#F1F5F9',
                                                                    color: isExpanded ? '#FFFFFF' : '#475569',
                                                                    fontWeight: 700,
                                                                }}>
                                                                    {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                                                                    {isExpanded ? 'Ocultar Auditoría' : 'Ver Movimientos'}
                                                                </span>
                                                            </div>
                                                            <div style={{ fontSize: '0.73rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                                                                <span style={{ fontFamily: 'monospace' }}>@{u.usuario}</span>
                                                                {u.dni && <span>· DNI {u.dni}</span>}
                                                                {u.area_sector && <span style={{ color: '#0284C7', fontWeight: 600 }}>· {u.area_sector}</span>}
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
                                                <td
                                                    style={{ padding: '12px 16px', textAlign: 'right' }}
                                                    onClick={e => e.stopPropagation()}
                                                >
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

                                            {/* ================================================================= */}
                                            {/* FILA DESPLEGABLE: TELEMETRÍA, GEOLOCALIZACIÓN, MÓDULOS Y 10 MOVS  */}
                                            {/* ================================================================= */}
                                            {isExpanded && (
                                                <tr style={{ background: '#F8FAFC', borderBottom: '2px solid #BAE6FD' }}>
                                                    <td colSpan={7} style={{ padding: '18px 22px' }}>
                                                        {isLoadingProfile && !profile ? (
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px', padding: '28px', color: '#0284C7', fontWeight: 700 }}>
                                                                <Loader2 size={18} className="animate-spin" />
                                                                Cargando telemetría de ciberseguridad, geolocalización y últimos movimientos de @{u.usuario}...
                                                            </div>
                                                        ) : profile ? (
                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                                                                {/* CABECERA DEL DESPLEGABLE */}
                                                                <div style={{
                                                                    display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
                                                                    gap: '12px', paddingBottom: '10px', borderBottom: '1px solid #E2E8F0',
                                                                }}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                                                                        <span style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '6px',
                                                                            padding: '4px 10px', borderRadius: '999px', fontSize: '0.74rem', fontWeight: 800,
                                                                            background: profile.isOnline ? '#DCFCE7' : '#F1F5F9',
                                                                            color: profile.isOnline ? '#15803D' : '#475569',
                                                                            border: `1px solid ${profile.isOnline ? '#86EFAC' : '#CBD5E1'}`,
                                                                        }}>
                                                                            <span style={{
                                                                                width: '7px', height: '7px', borderRadius: '50%',
                                                                                background: profile.isOnline ? '#16A34A' : '#94A3B8',
                                                                            }} />
                                                                            {profile.isOnline ? 'EN LÍNEA AHORA' : 'DESCONECTADO'}
                                                                        </span>
                                                                        <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#0F172A' }}>
                                                                            Ficha Forense y Trazabilidad de Ciberseguridad — {u.nombre} (@{u.usuario})
                                                                        </span>
                                                                    </div>

                                                                    <button
                                                                        type="button"
                                                                        onClick={() => loadUserProfile(u, true)}
                                                                        style={{
                                                                            display: 'inline-flex', alignItems: 'center', gap: '5px',
                                                                            padding: '5px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                                                            background: '#FFFFFF', color: '#1E40AF', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
                                                                        }}
                                                                    >
                                                                        <RefreshCw size={13} className={isLoadingProfile ? 'animate-spin' : ''} />
                                                                        Refrescar Actividad
                                                                    </button>
                                                                </div>

                                                                {/* GRILLA SUPERIOR: 1. GEOLOCALIZACIÓN Y TERMINAL | 2. ESTADÍSTICAS Y MÓDULOS | 3. INDICADORES DLP */}
                                                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                                                                    {/* TARJETA 1: GEOLOCALIZACIÓN Y PUESTO DE TRABAJO */}
                                                                    <div style={{
                                                                        background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                                                                        padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <MapPin size={15} color="#0284C7" /> Geolocalización y Terminal
                                                                            </span>
                                                                            {profile.lastDeviceTelemetry?.latitud && profile.lastDeviceTelemetry?.longitud && (
                                                                                <a
                                                                                    href={`https://www.google.com/maps?q=${profile.lastDeviceTelemetry.latitud},${profile.lastDeviceTelemetry.longitud}`}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    style={{
                                                                                        display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                                        fontSize: '0.72rem', fontWeight: 700, color: '#0284C7',
                                                                                        textDecoration: 'none', background: '#F0F9FF',
                                                                                        padding: '3px 8px', borderRadius: '6px', border: '1px solid #BAE6FD',
                                                                                    }}
                                                                                >
                                                                                    <ExternalLink size={12} /> Ver en Google Maps
                                                                                </a>
                                                                            )}
                                                                        </div>

                                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '0.78rem' }}>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                                <span style={{ color: '#64748B', fontWeight: 600 }}>Ubicación detectada:</span>
                                                                                <span style={{ color: '#0F172A', fontWeight: 700, textAlign: 'right' }}>
                                                                                    {profile.lastDeviceTelemetry?.geo_label || 'Se registrará en su próximo acceso'}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                                <span style={{ color: '#64748B', fontWeight: 600 }}>Coordenadas GPS:</span>
                                                                                <span style={{ color: '#334155', fontFamily: 'monospace', fontWeight: 600 }}>
                                                                                    {profile.lastDeviceTelemetry?.latitud && profile.lastDeviceTelemetry?.longitud
                                                                                        ? `${profile.lastDeviceTelemetry.latitud}, ${profile.lastDeviceTelemetry.longitud}${profile.lastDeviceTelemetry.precision_metros ? ` (±${profile.lastDeviceTelemetry.precision_metros}m)` : ''}`
                                                                                        : 'Pendiente de lectura GPS'}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                                <span style={{ color: '#64748B', fontWeight: 600 }}>Permiso Ubicación:</span>
                                                                                <span style={{
                                                                                    fontWeight: 700,
                                                                                    color: profile.lastDeviceTelemetry?.geo_permission === 'granted'
                                                                                        ? '#15803D'
                                                                                        : profile.lastDeviceTelemetry?.geo_permission === 'denied'
                                                                                            ? '#DC2626'
                                                                                            : '#D97706',
                                                                                }}>
                                                                                    {profile.lastDeviceTelemetry?.geo_permission === 'granted'
                                                                                        ? '✅ GPS Exacto Habilitado'
                                                                                        : profile.lastDeviceTelemetry?.geo_permission === 'denied'
                                                                                            ? '🚫 Denegado por usuario (Fallback IP)'
                                                                                            : '📍 Captura automática al abrir'}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                                <span style={{ color: '#64748B', fontWeight: 600 }}>IP Pública / Proveedor:</span>
                                                                                <span style={{ color: '#0F172A', fontWeight: 700 }}>
                                                                                    {profile.lastDeviceTelemetry?.ip || (profile.dlpSummary?.distinctIps?.[0]) || 'Red Local Sanatorio'}
                                                                                    {profile.lastDeviceTelemetry?.isp ? ` · ${profile.lastDeviceTelemetry.isp}` : ''}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                                <span style={{ color: '#64748B', fontWeight: 600 }}>Sistema / Navegador:</span>
                                                                                <span style={{ color: '#334155', fontWeight: 600, textAlign: 'right', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={profile.lastDeviceTelemetry?.os_browser || ''}>
                                                                                    {profile.lastDeviceTelemetry?.os_browser || 'Windows · Chrome'}
                                                                                </span>
                                                                            </div>
                                                                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                                                                                <span style={{ color: '#64748B', fontWeight: 600 }}>ID Terminal / Huella:</span>
                                                                                <span style={{ color: '#475569', fontFamily: 'monospace', fontSize: '0.73rem' }}>
                                                                                    {profile.lastDeviceTelemetry?.device_fingerprint || 'Se asigna al abrir'}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                    </div>

                                                                    {/* TARJETA 2: ESTADÍSTICAS DE USO Y MÓDULOS QUE UTILIZA */}
                                                                    <div style={{
                                                                        background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                                                                        padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <Activity size={15} color="#1E40AF" /> Estadísticas y Módulos Usados
                                                                            </span>
                                                                            <span style={{ fontSize: '0.72rem', color: '#64748B', fontWeight: 700 }}>
                                                                                {profile.sessionsCount} sesiones · {formatDurationMinutes(profile.totalMinutesConnected)}
                                                                            </span>
                                                                        </div>

                                                                        {profile.modulesBreakdown.length === 0 ? (
                                                                            <div style={{ fontSize: '0.78rem', color: '#94A3B8', padding: '16px 0', textAlign: 'center' }}>
                                                                                Sin actividad de módulos registrada aún para este usuario.
                                                                            </div>
                                                                        ) : (
                                                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                                                                {profile.modulesBreakdown.slice(0, 5).map(mod => (
                                                                                    <div key={mod.module_id}>
                                                                                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '3px' }}>
                                                                                            <span style={{ fontWeight: 700, color: '#1E293B' }}>{mod.label}</span>
                                                                                            <span style={{ color: '#64748B', fontWeight: 600 }}>
                                                                                                {mod.visits} acc. · {formatDurationMinutes(mod.minutes)} ({mod.pctVisits}%)
                                                                                            </span>
                                                                                        </div>
                                                                                        <div style={{ width: '100%', height: '6px', background: '#F1F5F9', borderRadius: '999px', overflow: 'hidden' }}>
                                                                                            <div style={{
                                                                                                width: `${Math.max(6, mod.pctVisits)}%`,
                                                                                                height: '100%',
                                                                                                background: 'linear-gradient(90deg, #1E40AF, #3B82F6)',
                                                                                                borderRadius: '999px',
                                                                                            }} />
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>

                                                                    {/* TARJETA 3: CIBERSEGURIDAD & PREVENCIÓN DE FUGA DE DATOS (DLP) */}
                                                                    <div style={{
                                                                        background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                                                                        padding: '14px 16px', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                                                                            <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                                                <Shield size={15} color="#059669" /> Control de Fuga de Datos (DLP)
                                                                            </span>
                                                                            <span style={{ fontSize: '0.7rem', padding: '2px 8px', borderRadius: '999px', background: '#ECFDF5', color: '#047857', fontWeight: 700 }}>
                                                                                Monitoreo Activo
                                                                            </span>
                                                                        </div>

                                                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                                                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <FileDown size={12} color="#D97706" /> Exportaciones / Excel
                                                                                </div>
                                                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                                                    {profile.dlpSummary.exportCount}
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <Copy size={12} color="#DC2626" /> Copiados (Ctrl+C)
                                                                                </div>
                                                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                                                    {profile.dlpSummary.copyCount}
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <Printer size={12} color="#7C3AED" /> Impresiones
                                                                                </div>
                                                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                                                    {profile.dlpSummary.printCount}
                                                                                </div>
                                                                            </div>
                                                                            <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 10px' }}>
                                                                                <div style={{ fontSize: '0.68rem', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                                                    <Globe size={12} color="#0284C7" /> IPs / Equipos Únicos
                                                                                </div>
                                                                                <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
                                                                                    {Math.max(1, profile.dlpSummary.distinctIps.length)} IP · {Math.max(1, profile.dlpSummary.distinctDevices.length)} PC
                                                                                </div>
                                                                            </div>
                                                                        </div>

                                                                        <div style={{ fontSize: '0.72rem', color: '#64748B', lineHeight: 1.35 }}>
                                                                            Accesos fuera de horario (22h–06h): <strong style={{ color: profile.dlpSummary.offHoursCount > 0 ? '#D97706' : '#15803D' }}>{profile.dlpSummary.offHoursCount}</strong> · Total eventos auditados: <strong>{profile.totalLogsCount}</strong>
                                                                        </div>
                                                                    </div>
                                                                </div>

                                                                {/* TABLA DE LOS ÚLTIMOS 10 MOVIMIENTOS DEL USUARIO */}
                                                                <div style={{
                                                                    background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0',
                                                                    overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.03)',
                                                                }}>
                                                                    <div style={{
                                                                        padding: '10px 16px', background: '#F8FAFC', borderBottom: '1px solid #E2E8F0',
                                                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px',
                                                                    }}>
                                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                                            <Clock size={15} color="#1E4078" />
                                                                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0F172A' }}>
                                                                                Últimos {Math.min(movLimit, profile.recentMovements.length)} Movimientos Registrados de @{u.usuario}
                                                                            </span>
                                                                        </div>
                                                                        {profile.recentMovements.length > 10 && (
                                                                            <button
                                                                                type="button"
                                                                                onClick={() => setMovementsLimitByUser(prev => ({
                                                                                    ...prev,
                                                                                    [u.usuario]: movLimit === 10 ? 30 : 10,
                                                                                }))}
                                                                                style={{
                                                                                    background: 'none', border: 'none', color: '#0284C7',
                                                                                    fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                                                                }}
                                                                            >
                                                                                {movLimit === 10 ? `Ver últimos 30 movimientos (${profile.recentMovements.length})` : 'Mostrar solo los últimos 10'}
                                                                            </button>
                                                                        )}
                                                                    </div>

                                                                    {profile.recentMovements.length === 0 ? (
                                                                        <div style={{ padding: '20px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                                                                            Este usuario aún no registra movimientos en el log de auditoría.
                                                                        </div>
                                                                    ) : (
                                                                        <div style={{ overflowX: 'auto' }}>
                                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.77rem' }}>
                                                                                <thead>
                                                                                    <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', color: '#475569', textAlign: 'left' }}>
                                                                                        <th style={{ padding: '8px 14px', width: '42px' }}>#</th>
                                                                                        <th style={{ padding: '8px 12px', width: '170px' }}>Fecha y Hora</th>
                                                                                        <th style={{ padding: '8px 12px', width: '160px' }}>Tipo de Evento</th>
                                                                                        <th style={{ padding: '8px 12px' }}>Módulo / Detalle del Movimiento</th>
                                                                                        <th style={{ padding: '8px 14px', width: '240px' }}>Ubicación / IP / Equipo</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {profile.recentMovements.slice(0, movLimit).map((mov, idx) => {
                                                                                        const badge = getActionBadgeMeta(mov.accion);
                                                                                        const det = mov.detalle || {};
                                                                                        const lat = det.latitud || profile.lastDeviceTelemetry?.latitud;
                                                                                        const lng = det.longitud || profile.lastDeviceTelemetry?.longitud;
                                                                                        const geoText = det.geo_label || (lat && lng ? `${lat}, ${lng}` : (det.ip || profile.lastDeviceTelemetry?.ip || 'Red Sanatorio'));
                                                                                        return (
                                                                                            <tr key={mov.id || idx} style={{ borderBottom: '1px solid #F1F5F9' }}>
                                                                                                <td style={{ padding: '8px 14px', fontWeight: 700, color: '#94A3B8' }}>
                                                                                                    {idx + 1}
                                                                                                </td>
                                                                                                <td style={{ padding: '8px 12px', color: '#334155', whiteSpace: 'nowrap' }}>
                                                                                                    <div style={{ fontWeight: 700 }}>
                                                                                                        {new Date(mov.created_at).toLocaleString('es-AR', {
                                                                                                            day: '2-digit', month: '2-digit', year: '2-digit',
                                                                                                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                                                                                                        })}
                                                                                                    </div>
                                                                                                    <div style={{ fontSize: '0.68rem', color: '#64748B' }}>
                                                                                                        {formatRelativeTime(mov.created_at)}
                                                                                                    </div>
                                                                                                </td>
                                                                                                <td style={{ padding: '8px 12px' }}>
                                                                                                    <span style={{
                                                                                                        display: 'inline-block', padding: '3px 8px', borderRadius: '6px',
                                                                                                        fontSize: '0.7rem', fontWeight: 700,
                                                                                                        background: badge.bg, color: badge.color, border: `1px solid ${badge.border}`,
                                                                                                    }}>
                                                                                                        {badge.label}
                                                                                                    </span>
                                                                                                </td>
                                                                                                <td style={{ padding: '8px 12px', color: '#0F172A', fontWeight: 600 }}>
                                                                                                    {describeMovement(mov)}
                                                                                                </td>
                                                                                                <td style={{ padding: '8px 14px', fontSize: '0.72rem', color: '#475569' }}>
                                                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                                                        <MapPin size={12} color="#0284C7" />
                                                                                                        {lat && lng ? (
                                                                                                            <a
                                                                                                                href={`https://www.google.com/maps?q=${lat},${lng}`}
                                                                                                                target="_blank"
                                                                                                                rel="noopener noreferrer"
                                                                                                                style={{ color: '#0284C7', fontWeight: 700, textDecoration: 'none' }}
                                                                                                            >
                                                                                                                {geoText}
                                                                                                            </a>
                                                                                                        ) : (
                                                                                                            <span>{geoText}</span>
                                                                                                        )}
                                                                                                    </div>
                                                                                                    {(det.os_browser || det.ip) && (
                                                                                                        <div style={{ fontSize: '0.67rem', color: '#94A3B8', marginTop: '2px' }}>
                                                                                                            {[det.ip, det.os_browser].filter(Boolean).join(' · ')}
                                                                                                        </div>
                                                                                                    )}
                                                                                                </td>
                                                                                            </tr>
                                                                                        );
                                                                                    })}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        ) : (
                                                            <div style={{ padding: '16px', color: '#64748B' }}>
                                                                No se pudo cargar la información de auditoría del usuario.
                                                            </div>
                                                        )}
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            )}

            {/* ================================================================= */}
            {/* PESTAÑA 2: SOLICITUDES DE ALTA DE USUARIO (DESDE LOGIN)           */}
            {/* ================================================================= */}
            {activeTab === 'requests' && (
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
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569' }}>Solicitante / DNI</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Usuario y Contacto (10 díg.)</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Sector / Cargo</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Rol Solicitado</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Motivo / Fecha</th>
                                    <th style={{ padding: '12px 14px', fontWeight: 700, color: '#475569' }}>Estado</th>
                                    <th style={{ padding: '12px 16px', fontWeight: 700, color: '#475569', textAlign: 'right' }}>Gestión de Alta</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRequests.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#64748B' }}>
                                            <Inbox size={32} style={{ margin: '0 auto 8px', opacity: 0.4, display: 'block' }} />
                                            No hay solicitudes de alta de usuario en este estado.
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRequests.map(req => {
                                        const roleMeta = getRoleMeta(req.rol_solicitado);
                                        const isPending = req.estado === 'pendiente';
                                        const isApproved = req.estado === 'aprobada';
                                        return (
                                            <tr key={req.id} style={{ borderBottom: '1px solid #F1F5F9', background: isPending ? '#FFFBEB' : '#FFFFFF' }}>
                                                <td style={{ padding: '12px 16px' }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                                        {req.avatar_url ? (
                                                            <img
                                                                src={req.avatar_url}
                                                                alt={req.nombre}
                                                                style={{ width: '38px', height: '38px', borderRadius: '10px', objectFit: 'cover', border: '1.5px solid #CBD5E1' }}
                                                            />
                                                        ) : (
                                                            <div style={{
                                                                width: '38px', height: '38px', borderRadius: '10px',
                                                                background: '#1E4078', color: '#FFFFFF', fontWeight: 700, fontSize: '0.78rem',
                                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                            }}>
                                                                {(req.nombre || 'U').slice(0, 2).toUpperCase()}
                                                            </div>
                                                        )}
                                                        <div>
                                                            <div style={{ fontWeight: 800, color: '#0F172A' }}>{req.nombre}</div>
                                                            <div style={{ fontSize: '0.73rem', color: '#64748B' }}>
                                                                DNI: <strong>{req.dni || 'No informado'}</strong>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ fontFamily: 'monospace', fontWeight: 800, color: '#1E4078', fontSize: '0.82rem' }}>
                                                        @{req.usuario_sugerido}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: '#047857', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                                                        <Phone size={12} /> {req.telefono_whatsapp}
                                                    </div>
                                                    <div style={{ fontSize: '0.71rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                        <Mail size={11} /> {req.email}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <div style={{ fontWeight: 700, color: '#1E293B', fontSize: '0.79rem' }}>
                                                        {req.area_sector || '—'}
                                                    </div>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                        {req.cargo || '—'}
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    <span style={{
                                                        display: 'inline-block', padding: '4px 10px', borderRadius: '999px',
                                                        fontSize: '0.72rem', fontWeight: 700,
                                                        color: roleMeta.color, background: roleMeta.bg,
                                                    }}>
                                                        {roleMeta.label}
                                                    </span>
                                                </td>
                                                <td style={{ padding: '12px 14px', maxWidth: '240px' }}>
                                                    <div style={{ fontSize: '0.75rem', color: '#334155', lineHeight: 1.35 }}>
                                                        {req.motivo || <span style={{ color: '#94A3B8' }}>Sin observaciones</span>}
                                                    </div>
                                                    <div style={{ fontSize: '0.69rem', color: '#64748B', marginTop: '4px' }}>
                                                        {new Date(req.created_at).toLocaleString('es-AR', {
                                                            day: '2-digit', month: '2-digit', year: '2-digit',
                                                            hour: '2-digit', minute: '2-digit',
                                                        })} ({formatRelativeTime(req.created_at)})
                                                    </div>
                                                </td>
                                                <td style={{ padding: '12px 14px' }}>
                                                    {isPending ? (
                                                        <span style={{
                                                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                            padding: '4px 9px', borderRadius: '8px',
                                                            background: '#FEF3C7', color: '#B45309',
                                                            fontSize: '0.72rem', fontWeight: 800,
                                                        }}>
                                                            <Clock size={12} /> Pendiente de Alta
                                                        </span>
                                                    ) : isApproved ? (
                                                        <div>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                padding: '4px 9px', borderRadius: '8px',
                                                                background: '#DCFCE7', color: '#15803D',
                                                                fontSize: '0.72rem', fontWeight: 800,
                                                            }}>
                                                                <CheckCircle size={12} /> Alta Aprobada
                                                            </span>
                                                            {req.resuelto_por && (
                                                                <div style={{ fontSize: '0.67rem', color: '#64748B', marginTop: '3px' }}>
                                                                    por @{req.resuelto_por}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <div>
                                                            <span style={{
                                                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                padding: '4px 9px', borderRadius: '8px',
                                                                background: '#FEE2E2', color: '#DC2626',
                                                                fontSize: '0.72rem', fontWeight: 800,
                                                            }}>
                                                                <XCircle size={12} /> Rechazada
                                                            </span>
                                                            {req.notas_admin && (
                                                                <div style={{ fontSize: '0.67rem', color: '#64748B', marginTop: '3px' }}>
                                                                    {req.notas_admin}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                                                    {isPending ? (
                                                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                                                            <button
                                                                type="button"
                                                                disabled={processingReqId === req.id}
                                                                onClick={() => handleOpenApproveModal(req)}
                                                                style={{
                                                                    padding: '7px 12px', borderRadius: '8px', border: 'none',
                                                                    background: '#059669', color: '#FFFFFF', fontSize: '0.75rem',
                                                                    fontWeight: 700, cursor: 'pointer', display: 'inline-flex',
                                                                    alignItems: 'center', gap: '5px', boxShadow: '0 2px 6px rgba(5,150,105,0.25)',
                                                                }}
                                                            >
                                                                <Check size={14} /> Dar de Alta
                                                            </button>
                                                            <button
                                                                type="button"
                                                                disabled={processingReqId === req.id}
                                                                onClick={() => handleRejectRequest(req)}
                                                                style={{
                                                                    padding: '7px 12px', borderRadius: '8px',
                                                                    border: '1px solid #FECACA', background: '#FEF2F2',
                                                                    color: '#DC2626', fontSize: '0.75rem', fontWeight: 700,
                                                                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '4px',
                                                                }}
                                                            >
                                                                <X size={14} /> Rechazar
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span style={{ fontSize: '0.72rem', color: '#94A3B8', fontWeight: 600 }}>
                                                            Gestionada
                                                        </span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ================================================================= */}
            {/* MODAL REVISAR Y APROBAR SOLICITUD DE ALTA                         */}
            {/* ================================================================= */}
            {approvingReq && (
                <div
                    style={{
                        position: 'fixed', inset: 0, zIndex: 100000,
                        background: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(3px)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px',
                    }}
                    onClick={e => { if (e.target === e.currentTarget) setApprovingReq(null); }}
                >
                    <div style={{
                        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '520px',
                        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)', overflow: 'hidden',
                    }}>
                        <div style={{
                            padding: '16px 22px', borderBottom: '1px solid #E2E8F0',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            background: '#ECFDF5',
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                <CheckCircle2 size={20} color="#059669" />
                                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 800, color: '#065F46' }}>
                                    Confirmar Alta de Usuario Solicitado
                                </h3>
                            </div>
                            <button
                                onClick={() => setApprovingReq(null)}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#065F46' }}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <form onSubmit={handleConfirmApproveRequest} style={{ padding: '20px 22px' }}>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Nombre y Apellido
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={approvingReq.nombre}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, nombre: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Usuario de Login Definitivo *
                                    </label>
                                    <input
                                        type="text"
                                        required
                                        value={approvingReq.usuario}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, usuario: e.target.value.toLowerCase().trim() }))}
                                        style={{ width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', fontFamily: 'monospace', fontWeight: 700, boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Celular WhatsApp (10 dígitos) *
                                    </label>
                                    <input
                                        type="tel"
                                        required
                                        value={approvingReq.telefono_whatsapp}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, telefono_whatsapp: e.target.value }))}
                                        placeholder="2645438114"
                                        style={{ width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', fontWeight: 700, boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Email
                                    </label>
                                    <input
                                        type="email"
                                        value={approvingReq.email}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, email: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.6fr', gap: '12px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Rol Asignado (Podés ajustarlo antes de aprobar)
                                    </label>
                                    <select
                                        value={approvingReq.rol}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, rol: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', background: '#FFFFFF', fontWeight: 600, boxSizing: 'border-box' }}
                                    >
                                        {ROLE_OPTIONS.map(r => (
                                            <option key={r.value} value={r.value}>{r.label}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Clave Temporal
                                    </label>
                                    <input
                                        type="text"
                                        value={approvingReq.password}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, password: e.target.value }))}
                                        style={{ width: '100%', padding: '9px 11px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.84rem', fontWeight: 700, boxSizing: 'border-box' }}
                                    />
                                </div>
                            </div>

                            <div style={{
                                background: '#F8FAFC', border: '1px solid #E2E8F0',
                                borderRadius: '10px', padding: '12px 14px', marginBottom: '14px',
                                display: 'flex', flexDirection: 'column', gap: '10px',
                            }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(approvingReq.must_change_password)}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, must_change_password: e.target.checked }))}
                                    />
                                    <span>Exigir que el usuario actualice su contraseña en su próximo ingreso</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(approvingReq.mfa_enabled)}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, mfa_enabled: e.target.checked }))}
                                    />
                                    <span>Requerir Autenticación Multifactor 2FA (WhatsApp / Google Authenticator)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(approvingReq.activo)}
                                        onChange={e => setApprovingReq(prev => ({ ...prev, activo: e.target.checked }))}
                                    />
                                    <span>Cuenta Activa (Habilitada para ingresar al sistema)</span>
                                </label>
                            </div>

                            <div style={{
                                background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '10px',
                                padding: '10px 14px', marginBottom: '16px', fontSize: '0.76rem', color: '#166534', lineHeight: 1.4,
                            }}>
                                Al confirmar el alta, se notificará por WhatsApp automático al <strong>{approvingReq.telefono_whatsapp}</strong> con su usuario y clave temporal.
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => setApprovingReq(null)}
                                    style={{
                                        padding: '9px 16px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#475569', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                                    }}
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={processingReqId === approvingReq.id}
                                    style={{
                                        padding: '9px 18px', borderRadius: '8px', border: 'none',
                                        background: '#059669', color: '#FFFFFF', fontSize: '0.84rem', fontWeight: 700,
                                        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px',
                                    }}
                                >
                                    {processingReqId === approvingReq.id ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                                    Confirmar Alta y Enviar WhatsApp
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

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
                        background: '#FFFFFF', borderRadius: '16px', width: '100%', maxWidth: '540px',
                        boxShadow: '0 20px 50px rgba(15, 23, 42, 0.25)', overflow: 'hidden', maxHeight: '92vh', overflowY: 'auto',
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
                            {/* Foto de Perfil en modal admin */}
                            <div style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                background: '#F8FAFC', border: '1px solid #E2E8F0',
                                borderRadius: '10px', padding: '10px 14px', marginBottom: '14px',
                            }}>
                                <div
                                    onClick={() => editAvatarInputRef.current?.click()}
                                    style={{
                                        width: '48px', height: '48px', borderRadius: '50%',
                                        background: editingUser.avatar_url ? `url(${editingUser.avatar_url}) center/cover` : '#1E4078',
                                        color: '#FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer', flexShrink: 0, border: '2px solid #CBD5E1',
                                    }}
                                >
                                    {!editingUser.avatar_url && <Camera size={18} />}
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#0F172A' }}>Foto de Perfil del Colaborador</div>
                                    <div style={{ fontSize: '0.7rem', color: '#64748B' }}>Podés subir o actualizar la foto institucional desde acá.</div>
                                </div>
                                <button
                                    type="button"
                                    disabled={uploadingEditAvatar}
                                    onClick={() => editAvatarInputRef.current?.click()}
                                    style={{
                                        padding: '6px 12px', borderRadius: '8px', border: '1px solid #CBD5E1',
                                        background: '#FFFFFF', color: '#1E4078', fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer',
                                    }}
                                >
                                    {uploadingEditAvatar ? 'Subiendo...' : 'Subir Foto'}
                                </button>
                                <input
                                    ref={editAvatarInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleEditAvatarChange}
                                    style={{ display: 'none' }}
                                />
                            </div>

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
                                        Celular WhatsApp (10 dígitos sin +549 ni 15)
                                    </label>
                                    <input
                                        type="tel"
                                        value={editingUser.telefono_whatsapp}
                                        onChange={e => setEditingUser(prev => ({ ...prev, telefono_whatsapp: e.target.value }))}
                                        placeholder="2645438114"
                                        style={{
                                            width: '100%', padding: '9px 12px', borderRadius: '8px',
                                            border: `1.5px solid ${
                                                !editingUser.telefono_whatsapp
                                                    ? '#CBD5E1'
                                                    : validateStrictCellphone(editingUser.telefono_whatsapp).valid
                                                        ? '#10B981'
                                                        : '#EF4444'
                                            }`,
                                            fontSize: '0.85rem', fontWeight: 700, boxSizing: 'border-box',
                                        }}
                                    />
                                    <div style={{ fontSize: '0.68rem', marginTop: '3px', color: !editingUser.telefono_whatsapp ? '#64748B' : validateStrictCellphone(editingUser.telefono_whatsapp).valid ? '#059669' : '#DC2626', fontWeight: 600 }}>
                                        {!editingUser.telefono_whatsapp
                                            ? 'Formato estricto: 2645438114 (sin +549 ni 15)'
                                            : validateStrictCellphone(editingUser.telefono_whatsapp).valid
                                                ? '✓ Formato de 10 dígitos válido'
                                                : validateStrictCellphone(editingUser.telefono_whatsapp).error}
                                    </div>
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

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        DNI
                                    </label>
                                    <input
                                        type="text"
                                        value={editingUser.dni || ''}
                                        onChange={e => setEditingUser(prev => ({ ...prev, dni: e.target.value.replace(/\D/g, '').slice(0, 9) }))}
                                        placeholder="38123456"
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Área / Sector
                                    </label>
                                    <input
                                        type="text"
                                        value={editingUser.area_sector || ''}
                                        onChange={e => setEditingUser(prev => ({ ...prev, area_sector: e.target.value }))}
                                        placeholder="Admisión / Quirófano"
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.7rem', fontWeight: 700, color: '#475569', marginBottom: '4px', textTransform: 'uppercase' }}>
                                        Cargo
                                    </label>
                                    <input
                                        type="text"
                                        value={editingUser.cargo || ''}
                                        onChange={e => setEditingUser(prev => ({ ...prev, cargo: e.target.value }))}
                                        placeholder="Operador/a"
                                        style={{ width: '100%', padding: '8px 10px', borderRadius: '8px', border: '1px solid #CBD5E1', fontSize: '0.82rem', boxSizing: 'border-box' }}
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
                                        checked={Boolean(editingUser.must_change_password)}
                                        onChange={e => setEditingUser(prev => ({ ...prev, must_change_password: e.target.checked }))}
                                    />
                                    <span>Exigir que el usuario actualice su contraseña en su próximo ingreso</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(editingUser.mfa_enabled)}
                                        onChange={e => setEditingUser(prev => ({ ...prev, mfa_enabled: e.target.checked }))}
                                    />
                                    <span>Requerir Autenticación Multifactor 2FA (WhatsApp / Google Authenticator)</span>
                                </label>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', fontWeight: 600, color: '#1E293B', cursor: 'pointer' }}>
                                    <input
                                        type="checkbox"
                                        checked={Boolean(editingUser.activo)}
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
