import React, { useState } from 'react';
import { ShieldCheck, Lock, Users, CheckCircle2, XCircle, Search, RefreshCw, AlertTriangle } from 'lucide-react';
import { SYSTEM_KNOWN_USERS, MASTER_ADMINS } from '../../services/contactCenterService';

export default function ContactCenterPermisosTab({ allowedUsers = [], onToggleUser, saving = false }) {
    const [searchTerm, setSearchTerm] = useState('');

    const filteredUsers = SYSTEM_KNOWN_USERS.filter(u => {
        if (!searchTerm) return true;
        const q = searchTerm.toLowerCase();
        return u.nombre.toLowerCase().includes(q) || u.usuario.toLowerCase().includes(q) || u.rol.toLowerCase().includes(q);
    });

    return (
        <div style={{ maxWidth: '960px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '22px' }}>
            {/* Header del Panel de Seguridad */}
            <div style={{
                background: 'linear-gradient(135deg, #0F2942 0%, #1E3A8A 100%)',
                borderRadius: '16px', padding: '24px 28px', color: '#FFFFFF',
                boxShadow: '0 4px 15px rgba(15, 41, 66, 0.15)',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px'
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{ width: 48, height: 48, borderRadius: '12px', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <ShieldCheck size={28} color="#38BDF8" />
                    </div>
                    <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#38BDF8', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
                            POLÍTICA DE SEGURIDAD & RBAC
                        </div>
                        <h2 style={{ margin: '2px 0 0', fontSize: '1.35rem', fontWeight: 800, color: '#FFFFFF' }}>
                            Gestión de Permisos — Contact Center
                        </h2>
                        <p style={{ margin: '4px 0 0', fontSize: '0.82rem', color: '#CBD5E1' }}>
                            Solo los usuarios que autorices en esta lista podrán ver el módulo en el menú lateral y acceder a los chats de AsisteClick.
                        </p>
                    </div>
                </div>

                <div style={{ background: 'rgba(255,255,255,0.1)', padding: '8px 16px', borderRadius: '10px', fontSize: '0.78rem', color: '#E2E8F0', fontWeight: 600 }}>
                    👑 Administrador Activo: <b>lmarinero</b>
                </div>
            </div>

            {/* Tarjeta Informativa de Resumen */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px' }}>
                <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>USUARIOS TOTALES</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', marginTop: '4px' }}>{SYSTEM_KNOWN_USERS.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>En base de datos del sistema</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase' }}>USUARIOS AUTORIZADOS</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', marginTop: '4px' }}>{allowedUsers.length}</div>
                    <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Pueden ver y operar Contact Center</div>
                </div>

                <div style={{ background: '#FFFFFF', padding: '16px 20px', borderRadius: '12px', border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>SIN ACCESO (BLOQUEADOS)</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626', marginTop: '4px' }}>{Math.max(0, SYSTEM_KNOWN_USERS.length - allowedUsers.length)}</div>
                    <div style={{ fontSize: '0.74rem', color: '#94A3B8' }}>Oculto en su barra lateral</div>
                </div>
            </div>

            {/* Tabla de Usuarios y Switches de Aprobación */}
            <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 6px rgba(0,0,0,0.02)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Users size={18} color="#1E40AF" />
                        <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                            Colaboradores del Sanatorio
                        </h3>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '6px 12px', width: '280px' }}>
                        <Search size={14} color="#94A3B8" />
                        <input 
                            type="text"
                            placeholder="Buscar colaborador o usuario..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: '0.8rem', width: '100%', color: '#1E293B' }}
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {filteredUsers.map(user => {
                        const isMaster = MASTER_ADMINS.includes(user.usuario);
                        const isAllowed = isMaster || allowedUsers.includes(user.usuario);

                        return (
                            <div 
                                key={user.usuario}
                                style={{
                                    padding: '16px 20px',
                                    borderBottom: '1px solid #F8FAFC',
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    background: isMaster ? '#F0F9FF' : '#FFFFFF',
                                    transition: 'background 0.15s'
                                }}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                                    <div style={{
                                        width: 38, height: 38, borderRadius: '50%',
                                        background: isMaster ? '#0284C7' : '#E2E8F0',
                                        color: isMaster ? '#FFFFFF' : '#334155',
                                        fontSize: '0.82rem', fontWeight: 800,
                                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                                    }}>
                                        {user.avatar}
                                    </div>
                                    <div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            <span style={{ fontSize: '0.92rem', fontWeight: 700, color: '#0F172A' }}>
                                                {user.nombre}
                                            </span>
                                            <span style={{ fontSize: '0.74rem', color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                                                @{user.usuario}
                                            </span>
                                            {isMaster && (
                                                <span style={{ fontSize: '0.68rem', fontWeight: 800, color: '#0284C7', background: '#E0F2FE', padding: '2px 8px', borderRadius: '10px' }}>
                                                    ADMIN MAESTRO
                                                </span>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.78rem', color: '#64748B', marginTop: '2px' }}>
                                            {user.rol}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                                    <span style={{
                                        fontSize: '0.74rem', fontWeight: 700,
                                        padding: '4px 10px', borderRadius: '20px',
                                        background: isAllowed ? '#DCFCE7' : '#F1F5F9',
                                        color: isAllowed ? '#16A34A' : '#94A3B8',
                                        display: 'flex', alignItems: 'center', gap: '4px'
                                    }}>
                                        {isAllowed ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
                                        {isAllowed ? 'Acceso Permitido' : 'Bloqueado'}
                                    </span>

                                    {/* Toggle Switch */}
                                    <label style={{ position: 'relative', display: 'inline-block', width: 44, height: 24, cursor: isMaster ? 'not-allowed' : 'pointer' }}>
                                        <input 
                                            type="checkbox"
                                            checked={isAllowed}
                                            disabled={isMaster || saving}
                                            onChange={() => onToggleUser(user.usuario)}
                                            style={{ opacity: 0, width: 0, height: 0 }}
                                        />
                                        <span style={{
                                            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                                            backgroundColor: isAllowed ? '#10B981' : '#CBD5E1',
                                            borderRadius: 24,
                                            transition: '0.2s',
                                            opacity: isMaster ? 0.8 : 1
                                        }}>
                                            <span style={{
                                                position: 'absolute', content: '""', height: 18, width: 18,
                                                left: isAllowed ? 22 : 3, bottom: 3,
                                                backgroundColor: 'white',
                                                borderRadius: '50%',
                                                transition: '0.2s',
                                                boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
                                            }} />
                                        </span>
                                    </label>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
