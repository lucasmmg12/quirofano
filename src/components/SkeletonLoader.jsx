/**
 * SkeletonLoader — Reusable skeleton placeholders for loading states
 * Uses the .skeleton CSS class from index.css (shimmer animation)
 * 
 * Variants:
 * - SkeletonCard: Simple rectangular placeholder
 * - SkeletonRow: Table row placeholder
 * - SkeletonTable: Table with header + rows
 * - SkeletonKPI: Single KPI card
 * - SkeletonDashboard: Full dashboard layout (KPIs + content)
 * - SkeletonTablePanel: KPIs + filters + table (for panel views)
 * - SkeletonContactList: Chat contact list
 * - SkeletonChartGrid: Charts/metrics grid
 * - SkeletonFormPanel: Form/config layout
 */

export function SkeletonCard({ width = '100%', height = 120 }) {
    return (
        <div className="skeleton" style={{ width, height, borderRadius: '16px' }} />
    );
}

export function SkeletonRow({ cols = 5 }) {
    return (
        <tr>
            {Array.from({ length: cols }).map((_, i) => (
                <td key={i} style={{ padding: '12px 8px' }}>
                    <div className="skeleton" style={{ height: 16, width: i === 0 ? '60%' : '80%', borderRadius: '6px' }} />
                </td>
            ))}
        </tr>
    );
}

export function SkeletonTable({ rows = 5, cols = 6 }) {
    return (
        <div style={{ padding: '16px' }}>
            {/* Header skeleton */}
            <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <div className="skeleton" style={{ height: 20, width: 120, borderRadius: '6px' }} />
                <div className="skeleton" style={{ height: 20, width: 60, borderRadius: '12px' }} />
            </div>
            {/* Rows */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: '12px', padding: '10px 0' }}>
                        {Array.from({ length: cols }).map((_, j) => (
                            <div key={j} className="skeleton" style={{
                                height: 14,
                                flex: j === 0 ? 2 : 1,
                                borderRadius: '6px',
                                opacity: 1 - (i * 0.1),
                            }} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export function SkeletonKPI() {
    return (
        <div style={{
            background: 'var(--neutral-0)', borderRadius: '16px',
            border: '1px solid var(--neutral-200)', padding: '20px',
            display: 'flex', flexDirection: 'column', gap: '10px',
        }}>
            <div className="skeleton" style={{ width: '40%', height: 12, borderRadius: '4px' }} />
            <div className="skeleton" style={{ width: '60%', height: 28, borderRadius: '6px' }} />
            <div className="skeleton" style={{ width: '30%', height: 10, borderRadius: '4px' }} />
        </div>
    );
}

/**
 * SkeletonTablePanel — For main panel views (KPIs + filter bar + table)
 * Used by: AltasPanel, FacturacionPanel, ConsultasPanel, DeudasPanel, LaboratoriosPanel, etc.
 */
export function SkeletonTablePanel({ kpis = 4, cols = 7, rows = 8, showFilters = true }) {
    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <div className="skeleton" style={{ width: 260, height: 22, borderRadius: '6px' }} />
                    <div className="skeleton" style={{ width: 180, height: 12, borderRadius: '4px' }} />
                </div>
                <div className="skeleton" style={{ width: 100, height: 36, borderRadius: '8px' }} />
            </div>

            {/* KPI row */}
            {kpis > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(kpis, 6)}, 1fr)`, gap: '12px' }}>
                    {Array.from({ length: kpis }).map((_, i) => (
                        <div key={i} style={{
                            padding: '14px 16px', borderRadius: '12px',
                            border: '1px solid var(--neutral-100)',
                            background: 'var(--neutral-0)',
                        }}>
                            <div className="skeleton" style={{ width: '50%', height: 28, borderRadius: '6px', marginBottom: '6px' }} />
                            <div className="skeleton" style={{ width: '70%', height: 10, borderRadius: '4px' }} />
                        </div>
                    ))}
                </div>
            )}

            {/* Filter bar */}
            {showFilters && (
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                    <div className="skeleton" style={{ width: 200, height: 34, borderRadius: '8px' }} />
                    <div className="skeleton" style={{ width: 260, height: 34, borderRadius: '8px' }} />
                    <div className="skeleton" style={{ width: 140, height: 34, borderRadius: '8px' }} />
                    <div className="skeleton" style={{ width: 140, height: 34, borderRadius: '8px' }} />
                </div>
            )}

            {/* Table */}
            <div style={{
                borderRadius: '12px', border: '1px solid var(--neutral-100)',
                overflow: 'hidden', background: 'var(--neutral-0)',
            }}>
                {/* Table header */}
                <div style={{
                    display: 'flex', gap: '8px', padding: '12px 16px',
                    background: 'var(--neutral-50)', borderBottom: '2px solid var(--neutral-100)',
                }}>
                    {Array.from({ length: cols }).map((_, i) => (
                        <div key={i} className="skeleton" style={{
                            height: 10, flex: i === 1 ? 2 : 1,
                            borderRadius: '4px', opacity: 0.6,
                        }} />
                    ))}
                </div>
                {/* Table rows */}
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} style={{
                        display: 'flex', gap: '8px', padding: '14px 16px',
                        borderBottom: i < rows - 1 ? '1px solid var(--neutral-50)' : 'none',
                    }}>
                        {Array.from({ length: cols }).map((_, j) => (
                            <div key={j} className="skeleton" style={{
                                height: 14, flex: j === 1 ? 2 : 1,
                                borderRadius: '6px',
                                opacity: 1 - (i * 0.08),
                            }} />
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * SkeletonContactList — For MessagingPanel
 */
export function SkeletonContactList({ items = 8 }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Search bar */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--neutral-100)' }}>
                <div className="skeleton" style={{ height: 36, borderRadius: '8px' }} />
            </div>
            {/* Contact rows */}
            {Array.from({ length: items }).map((_, i) => (
                <div key={i} style={{
                    display: 'flex', gap: '12px', padding: '12px 16px',
                    alignItems: 'center',
                    borderBottom: '1px solid var(--neutral-50)',
                }}>
                    <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%', flexShrink: 0 }} />
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <div className="skeleton" style={{ height: 14, width: '60%', borderRadius: '4px' }} />
                        <div className="skeleton" style={{ height: 10, width: '85%', borderRadius: '4px', opacity: 0.6 }} />
                    </div>
                    <div className="skeleton" style={{ width: 40, height: 10, borderRadius: '4px', opacity: 0.4 }} />
                </div>
            ))}
        </div>
    );
}

/**
 * SkeletonChartGrid — For MetricsPanel, BetoAnalyticsPanel
 */
export function SkeletonChartGrid({ charts = 4, kpis = 4 }) {
    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="skeleton" style={{ width: 200, height: 22, borderRadius: '6px' }} />
                <div className="skeleton" style={{ width: 100, height: 36, borderRadius: '8px' }} />
            </div>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${kpis}, 1fr)`, gap: '12px' }}>
                {Array.from({ length: kpis }).map((_, i) => (
                    <SkeletonKPI key={i} />
                ))}
            </div>
            {/* Charts grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                {Array.from({ length: charts }).map((_, i) => (
                    <div key={i} style={{
                        borderRadius: '16px', border: '1px solid var(--neutral-100)',
                        padding: '20px', background: 'var(--neutral-0)',
                    }}>
                        <div className="skeleton" style={{ width: '40%', height: 14, borderRadius: '4px', marginBottom: '16px' }} />
                        <div className="skeleton" style={{ height: 180, borderRadius: '8px' }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

/**
 * SkeletonFormPanel — For ConfigPanel and similar form-based views
 */
export function SkeletonFormPanel({ sections = 3, fieldsPerSection = 4 }) {
    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Header */}
            <div>
                <div className="skeleton" style={{ width: 220, height: 22, borderRadius: '6px', marginBottom: '6px' }} />
                <div className="skeleton" style={{ width: 300, height: 12, borderRadius: '4px' }} />
            </div>
            {/* Sections */}
            {Array.from({ length: sections }).map((_, s) => (
                <div key={s} style={{
                    borderRadius: '12px', border: '1px solid var(--neutral-100)',
                    padding: '20px', background: 'var(--neutral-0)',
                }}>
                    <div className="skeleton" style={{ width: 160, height: 16, borderRadius: '4px', marginBottom: '16px' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
                        {Array.from({ length: fieldsPerSection }).map((_, f) => (
                            <div key={f}>
                                <div className="skeleton" style={{ width: '40%', height: 10, borderRadius: '3px', marginBottom: '6px' }} />
                                <div className="skeleton" style={{ height: 36, borderRadius: '8px' }} />
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}

/**
 * SkeletonCardGrid — For views with card-based layouts (RecepcionView, TurnoAdminPanel)
 */
export function SkeletonCardGrid({ cards = 6, cols = 3 }) {
    return (
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="skeleton" style={{ width: 200, height: 22, borderRadius: '6px' }} />
                <div className="skeleton" style={{ width: 100, height: 34, borderRadius: '8px' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: '14px' }}>
                {Array.from({ length: cards }).map((_, i) => (
                    <div key={i} style={{
                        borderRadius: '12px', border: '1px solid var(--neutral-100)',
                        padding: '16px', background: 'var(--neutral-0)',
                        display: 'flex', flexDirection: 'column', gap: '10px',
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <div className="skeleton" style={{ width: '55%', height: 16, borderRadius: '4px' }} />
                            <div className="skeleton" style={{ width: 50, height: 20, borderRadius: '10px' }} />
                        </div>
                        <div className="skeleton" style={{ width: '80%', height: 12, borderRadius: '4px' }} />
                        <div className="skeleton" style={{ width: '40%', height: 10, borderRadius: '4px', opacity: 0.5 }} />
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function SkeletonDashboard() {
    return (
        <div style={{ padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
                {Array.from({ length: 4 }).map((_, i) => <SkeletonKPI key={i} />)}
            </div>
            {/* Content area */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px' }}>
                <SkeletonCard height={260} />
                <SkeletonCard height={260} />
            </div>
        </div>
    );
}
