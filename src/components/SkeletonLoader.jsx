/**
 * SkeletonLoader — Reusable skeleton placeholders for loading states
 * Uses the .skeleton CSS class from index.css (shimmer animation)
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
