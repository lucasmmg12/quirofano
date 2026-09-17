import React from 'react';
import { 
    MessageCircle, CalendarCheck, Handshake, ListTodo, 
    ArrowRight, CheckCircle2, Sparkles, Clock, User, ShieldAlert 
} from 'lucide-react';

export default function ContactCenterMiSemana({ chats = [], onSelectChat, onNavigateTab }) {
    const unassignedChats = chats.filter(c => c.status === 'sin_asignar');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
            {/* Header Saludo Estilo AsisteClick / Sanatorio Argentino */}
            <div style={{
                background: 'linear-gradient(135deg, #0A192F 0%, #0F2942 60%, #1E40AF 100%)',
                borderRadius: '16px',
                padding: '24px 28px',
                color: '#FFFFFF',
                boxShadow: '0 10px 25px -5px rgba(15, 41, 66, 0.25)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '16px'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.75rem', fontWeight: 800, letterSpacing: '1.5px', textTransform: 'uppercase', color: '#38BDF8', background: 'rgba(56, 189, 248, 0.15)', padding: '3px 10px', borderRadius: '8px' }}>
                            ASISTECLICK • SANATORIO ARGENTINO
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#CBD5E1' }}>
                            Jueves 17 de septiembre • 23° San Juan
                        </span>
                    </div>
                    <h1 style={{ margin: '0 0 6px', fontSize: '1.65rem', fontWeight: 800, color: '#FFFFFF', letterSpacing: '-0.4px' }}>
                        Buenas tardes, Sanatorio
                    </h1>
                    <p style={{ margin: 0, fontSize: '0.92rem', color: '#CBD5E1', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span>✨</span> Nada urgente hoy. Tienes <b>{unassignedChats.length} chats pendientes</b> — buen día para enfocarte en lo proactivo.
                    </p>
                </div>

                <div style={{ display: 'flex', gap: '12px' }}>
                    <button 
                        onClick={() => onNavigateTab('conversaciones')}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            background: '#0284C7', color: '#FFFFFF', border: 'none',
                            padding: '10px 18px', borderRadius: '10px', fontWeight: 700,
                            fontSize: '0.86rem', cursor: 'pointer', boxShadow: '0 4px 12px rgba(2, 132, 199, 0.35)',
                            transition: 'all 0.2s'
                        }}
                    >
                        <MessageCircle size={17} />
                        Ir a la Bandeja ({unassignedChats.length})
                    </button>
                </div>
            </div>

            {/* Fila de 4 KPIs Principales */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                {/* KPI 1: Chats Pendientes */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <MessageCircle size={18} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#DC2626', background: '#FEE2E2', padding: '2px 8px', borderRadius: '10px' }}>
                                {unassignedChats.length} en tu depto
                            </span>
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                            {unassignedChats.length}
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
                            CHATS PENDIENTES
                        </div>
                    </div>
                </div>

                {/* KPI 2: Tareas por Hacer */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#EFF6FF', color: '#1E40AF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <ListTodo size={18} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#1E40AF', background: '#DBEAFE', padding: '2px 8px', borderRadius: '10px' }}>
                                CRM
                            </span>
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                            —
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
                            TAREAS POR HACER
                        </div>
                    </div>
                </div>

                {/* KPI 3: Mis Deals Activos */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#F5F3FF', color: '#7C3AED', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Handshake size={18} />
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7C3AED', background: '#EDE9FE', padding: '2px 8px', borderRadius: '10px' }}>
                                CRM
                            </span>
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                            —
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
                            MIS DEALS ACTIVOS
                        </div>
                    </div>
                </div>

                {/* KPI 4: Bookings Hoy */}
                <div style={{
                    background: '#FFFFFF', borderRadius: '14px', padding: '18px 20px',
                    border: '1px solid #E2E8F0', boxShadow: '0 2px 5px rgba(0,0,0,0.02)',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                }}>
                    <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                            <div style={{ width: 34, height: 34, borderRadius: '8px', background: '#ECFDF5', color: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CalendarCheck size={18} />
                            </div>
                        </div>
                        <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>
                            0
                        </div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '4px' }}>
                            BOOKINGS HOY
                        </div>
                    </div>
                </div>
            </div>

            {/* Cuerpo Principal Dividido (Chats Pendientes vs Paneles Secundarios) */}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)', gap: '20px', alignItems: 'start' }}>
                {/* Tarjeta de Chats Sin Asignar */}
                <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', overflow: 'hidden', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                    <div style={{ padding: '18px 20px', borderBottom: '1px solid #F1F5F9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#10B981' }} />
                            <h3 style={{ margin: 0, fontSize: '0.98rem', fontWeight: 700, color: '#0F172A' }}>
                                Chats • Sin asignar
                            </h3>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, background: '#F1F5F9', color: '#475569', padding: '2px 8px', borderRadius: '10px' }}>
                                {unassignedChats.length}
                            </span>
                        </div>
                        <button 
                            onClick={() => onNavigateTab('conversaciones')}
                            style={{ background: 'transparent', border: 'none', color: '#0284C7', fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
                        >
                            Ver todo <ArrowRight size={14} />
                        </button>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                        {unassignedChats.map((chat) => (
                            <div 
                                key={chat.id}
                                onClick={() => onSelectChat(chat.id)}
                                style={{
                                    padding: '16px 20px',
                                    borderBottom: '1px solid #F8FAFC',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    cursor: 'pointer',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = '#F8FAFC'}
                                onMouseLeave={(e) => e.currentTarget.style.background = '#FFFFFF'}
                            >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', minWidth: 0 }}>
                                    <div style={{
                                        width: '40px', height: '40px', borderRadius: '50%',
                                        background: chat.avatarColor || '#64748B', color: '#FFFFFF',
                                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        fontSize: '0.85rem', fontWeight: 800, flexShrink: 0
                                    }}>
                                        {chat.contactName.substring(0, 2).toUpperCase()}
                                    </div>
                                    <div style={{ minWidth: 0 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
                                            <span style={{ fontSize: '0.9rem', fontWeight: 700, color: '#0F172A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {chat.contactName}
                                            </span>
                                            <span style={{ fontSize: '0.7rem', color: '#94A3B8' }}>•</span>
                                            <span style={{ fontSize: '0.72rem', color: '#64748B' }}>
                                                {chat.department}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.82rem', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '380px' }}>
                                            {chat.lastMessage}
                                        </div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '6px', flexShrink: 0 }}>
                                    <span style={{ fontSize: '0.72rem', color: '#94A3B8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Clock size={12} /> {chat.timeAgo}
                                    </span>
                                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: '#0284C7', background: '#F0F9FF', padding: '2px 6px', borderRadius: '4px' }}>
                                        {chat.channel}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Columna Derecha: Bookings, Mis Deals y Tareas */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    {/* Bookings */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <CalendarCheck size={18} color="#10B981" />
                                <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>Bookings</h3>
                            </div>
                            <span style={{ fontSize: '0.75rem', color: '#0284C7', fontWeight: 700, cursor: 'pointer' }}>Ver todo →</span>
                        </div>
                        <div style={{ textAlign: 'center', padding: '24px 10px', color: '#94A3B8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#F1F5F9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle2 size={24} color="#94A3B8" />
                            </div>
                            <span style={{ fontSize: '0.85rem' }}>Nada pendiente por acá</span>
                        </div>
                    </div>

                    {/* Mis Deals (Pipeline de Ventas / Cobertura) */}
                    <div style={{ background: '#FFFFFF', borderRadius: '14px', border: '1px solid #E2E8F0', padding: '20px', boxShadow: '0 2px 5px rgba(0,0,0,0.02)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                            <Handshake size={18} color="#7C3AED" />
                            <h3 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>Mis Deals</h3>
                        </div>
                        <div style={{ textAlign: 'center', padding: '16px 10px' }}>
                            <div style={{ width: 48, height: 48, borderRadius: '12px', background: '#ECFDF5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
                                <Handshake size={26} />
                            </div>
                            <h4 style={{ margin: '0 0 4px', fontSize: '0.95rem', fontWeight: 700, color: '#0F172A' }}>Pipeline de ventas visual</h4>
                            <p style={{ margin: '0 0 16px', fontSize: '0.78rem', color: '#64748B', lineHeight: 1.4 }}>
                                Etapas, valor y forecast en una vista que entendés en 5 segundos.
                            </p>
                            <div style={{ textAlign: 'left', background: '#F8FAFC', padding: '12px 14px', borderRadius: '8px', fontSize: '0.76rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '14px' }}>
                                <div>✓ Pipeline drag-and-drop</div>
                                <div>✓ Detección automática de deals stuck</div>
                                <div>✓ Reportes de cierre por usuario</div>
                            </div>
                            <button style={{ width: '100%', padding: '8px', borderRadius: '8px', border: '1px solid #E2E8F0', background: '#FFFFFF', color: '#334155', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer' }}>
                                Ver qué incluye
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
