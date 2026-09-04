import React, { useState } from 'react';
import { X, Maximize2 } from 'lucide-react';
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import TelarDataModal from './TelarDataModal';

// Mock Data para Gráficos
const mockDataBar = [
    { name: 'Lun', valor: 12 }, { name: 'Mar', valor: 19 },
    { name: 'Mié', valor: 15 }, { name: 'Jue', valor: 22 },
    { name: 'Vie', valor: 28 }, { name: 'Sáb', valor: 10 },
];

const mockDataLine = [
    { name: 'Sem 1', valor: 80 }, { name: 'Sem 2', valor: 85 },
    { name: 'Sem 3', valor: 82 }, { name: 'Sem 4', valor: 90 },
];

const mockDataPie = [
    { name: 'Falta de Ayuno', value: 30 },
    { name: 'Llegada Tarde', value: 45 },
    { name: 'Causas Médicas', value: 25 },
];
const COLORS = ['#60A5FA', '#34D399', '#F87171'];

export default function TelarCanvas({ activeIndicators, onRemoveIndicator, dateFilter }) {
    const [selectedIndicator, setSelectedIndicator] = useState(null);

    // Componente interno para renderizar el gráfico correcto según el tipo
    const renderChart = (type) => {
        switch(type) {
            case 'bar':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={mockDataBar} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                            <Tooltip cursor={{ fill: '#F1F5F9' }} />
                            <Bar dataKey="valor" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                );
            case 'line':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={mockDataLine} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                            <Tooltip />
                            <Line type="monotone" dataKey="valor" stroke="#10B981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                );
            case 'pie':
                return (
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={mockDataPie}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {mockDataPie.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: '12px' }}/>
                        </PieChart>
                    </ResponsiveContainer>
                );
            default:
                return null;
        }
    };

    return (
        <div style={{ position: 'relative', minHeight: '100%' }}>
            {activeIndicators.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--neutral-400)', marginTop: '100px' }}>
                    <Maximize2 size={48} strokeWidth={1} style={{ marginBottom: '16px' }} />
                    <h3 style={{ margin: 0, fontWeight: 500, color: 'var(--neutral-500)' }}>El Telar está vacío</h3>
                    <p style={{ fontSize: '0.9rem' }}>Selecciona indicadores desde el catálogo a la izquierda</p>
                </div>
            ) : (
                <div className="telar-grid animate-fade-in">
                    {activeIndicators.map(ind => (
                        <div key={ind.id} className="telar-card">
                            <div className="telar-card__header">
                                <div>
                                    <div className="telar-card__title">{ind.label}</div>
                                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                                        <span className="telar-card__badge">{ind.sector}</span>
                                        <span className="telar-card__badge" style={{ background: '#EEF2FF', color: '#4F46E5' }}>{dateFilter.label || dateFilter.type.replace(/_/g, ' ')}</span>
                                    </div>
                                </div>
                                <div style={{ display: 'flex', gap: '8px' }}>
                                    <button 
                                        onClick={() => setSelectedIndicator(ind)}
                                        title="Ver Tabla de Datos"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: '4px' }}
                                    >
                                        <Maximize2 size={16} />
                                    </button>
                                    <button 
                                        onClick={() => onRemoveIndicator(ind.id)}
                                        title="Quitar del Telar"
                                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--neutral-400)', padding: '4px' }}
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            </div>
                            <div 
                                className="telar-card__content"
                                onClick={() => setSelectedIndicator(ind)}
                                style={{ cursor: 'pointer' }}
                            >
                                {renderChart(ind.type)}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Modal de Tabla de Datos */}
            {selectedIndicator && (
                <TelarDataModal 
                    indicator={selectedIndicator} 
                    onClose={() => setSelectedIndicator(null)} 
                    dateFilter={dateFilter}
                />
            )}
        </div>
    );
}
