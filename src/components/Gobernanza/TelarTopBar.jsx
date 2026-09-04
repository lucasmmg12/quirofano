import React from 'react';
import { LayoutDashboard, Calendar } from 'lucide-react';

export default function TelarTopBar({ dateFilter, setDateFilter }) {
    const filters = [
        { id: 'this_month', label: 'Este Mes' },
        { id: 'last_month', label: 'Mes Anterior' },
        { id: 'last_3_months', label: 'Últ. 3 Meses' },
        { id: 'last_6_months', label: 'Últ. 6 Meses' },
        { id: 'custom', label: 'Personalizado' },
    ];

    return (
        <div className="telar-topbar">
            <div className="telar-topbar__title">
                <LayoutDashboard size={20} color="var(--primary-600)" />
                El Telar - Dashboard
            </div>

            <div className="telar-topbar__filters">
                <Calendar size={16} color="var(--neutral-400)" style={{ marginRight: '4px' }} />
                {filters.map(f => (
                    <button
                        key={f.id}
                        className={`telar-filter-btn ${dateFilter.type === f.id ? 'telar-filter-btn--active' : ''}`}
                        onClick={() => setDateFilter({ type: f.id, from: null, to: null })}
                    >
                        {f.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
