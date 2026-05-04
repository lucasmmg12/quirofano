/**
 * WhatsAppLineStatus — Live counter + connection status per WhatsApp line
 * Shows in the topbar when viewing 'mensajeria' or 'cirugias'
 * Displays:
 *   - Connection status dot (green=online, red=offline) from whatsapp_lines.is_active
 *   - Conversations initiated by us (first msg outgoing) in the last 24h per line
 *   - Visual alert if any line exceeds 30 initiated conversations in 24h
 */
import { useState, useEffect } from 'react';
import { AlertTriangle, Wifi, WifiOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

const ALERT_THRESHOLD = 30;

export default function WhatsAppLineStatus() {
    const [lines, setLines] = useState([]);
    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
        // Refresh every 30 seconds (status changes + counters)
        const interval = setInterval(loadData, 30_000);
        return () => clearInterval(interval);
    }, []);

    // Subscribe to realtime changes on whatsapp_lines for instant status updates
    useEffect(() => {
        const channel = supabase
            .channel('whatsapp-lines-status')
            .on(
                'postgres_changes',
                { event: 'UPDATE', schema: 'public', table: 'whatsapp_lines' },
                (payload) => {
                    // Update the specific line's is_active status in real-time
                    setLines(prev => prev.map(line =>
                        line.id === payload.new.id
                            ? { ...line, is_active: payload.new.is_active, updated_at: payload.new.updated_at }
                            : line
                    ));
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    const loadData = async () => {
        try {
            // Fetch only ADM-QUI lines (excluir line_recepciones del sistema Recepciones)
            const { data: linesData } = await supabase
                .from('whatsapp_lines')
                .select('id, label, phone, color, is_active, updated_at')
                .in('id', ['line_a', 'line_b', 'line_c'])
                .order('id');

            if (!linesData) return;
            setLines(linesData);

            // Count conversations INITIATED by us in last 24h
            // A conversation is "initiated by us" when the first message to that phone was outgoing
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const { data: msgData } = await supabase
                .from('whatsapp_messages')
                .select('line_id, phone, direction, created_at')
                .gte('created_at', since24h.toISOString())
                .order('created_at', { ascending: true })
                .limit(10000);

            // For each phone, find the first message in the 24h window.
            // If it's outgoing → conversation initiated by us. Count it.
            const firstMsgByPhone = {}; // phone → { line_id, direction }
            (msgData || []).forEach(msg => {
                if (!firstMsgByPhone[msg.phone]) {
                    firstMsgByPhone[msg.phone] = {
                        line_id: msg.line_id || 'line_a',
                        direction: msg.direction,
                    };
                }
            });

            // Count only phones where the first message was outgoing (chat initiated by us)
            const lineCounts = {};
            linesData.forEach(l => { lineCounts[l.id] = 0; });

            Object.values(firstMsgByPhone).forEach(({ line_id, direction }) => {
                if (direction === 'outgoing' && lineCounts[line_id] !== undefined) {
                    lineCounts[line_id]++;
                }
            });

            const result = { ...lineCounts };

            setCounts(result);
        } catch (err) {
            console.error('WhatsAppLineStatus error:', err);
        } finally {
            setLoading(false);
        }
    };

    if (loading || lines.length === 0) return null;

    const anyAlert = lines.some(l => (counts[l.id] || 0) >= ALERT_THRESHOLD);
    const anyOffline = lines.some(l => !l.is_active);

    // Format "last seen" from updated_at
    const formatLastSeen = (updatedAt) => {
        if (!updatedAt) return '';
        const diff = Date.now() - new Date(updatedAt).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1) return 'ahora';
        if (mins < 60) return `hace ${mins}m`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24) return `hace ${hrs}h`;
        return `hace ${Math.floor(hrs / 24)}d`;
    };

    return (
        <div style={{
            display: 'flex', alignItems: 'center', gap: '8px',
            padding: '4px 6px', borderRadius: '10px',
            background: anyOffline ? '#FEF2F2' : anyAlert ? '#FEF2F2' : '#F0FDF4',
            border: `1px solid ${anyOffline ? '#FECACA' : anyAlert ? '#FECACA' : '#BBF7D0'}`,
            animation: (anyOffline || anyAlert) ? 'pulse-alert 2s ease-in-out infinite' : 'none',
            transition: 'all 0.3s',
        }}>
            {lines.map(line => {
                const count = counts[line.id] || 0;
                const isOver = count >= ALERT_THRESHOLD;
                const percentage = Math.min((count / ALERT_THRESHOLD) * 100, 100);
                const isOnline = line.is_active;

                return (
                    <div
                        key={line.id}
                        title={`${line.label}: ${isOnline ? '🟢 Conectado' : '🔴 Desconectado'}${line.updated_at ? ` (${formatLastSeen(line.updated_at)})` : ''} — ${count} conv. iniciadas (24h)`}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '5px',
                            padding: '3px 10px', borderRadius: '8px',
                            background: !isOnline ? '#FEE2E2'
                                : isOver ? '#FEE2E2'
                                : `${line.color}12`,
                            border: `1px solid ${!isOnline ? '#FCA5A5' : isOver ? '#FCA5A5' : line.color + '30'}`,
                            transition: 'all 0.3s',
                            position: 'relative',
                            overflow: 'hidden',
                        }}
                    >
                        {/* Progress bar background */}
                        <div style={{
                            position: 'absolute', left: 0, top: 0, bottom: 0,
                            width: `${percentage}%`,
                            background: isOver
                                ? 'rgba(239,68,68,0.12)'
                                : `${line.color}10`,
                            transition: 'width 0.5s ease',
                            borderRadius: '8px',
                        }} />

                        {/* Connection status indicator */}
                        <div style={{
                            position: 'relative', zIndex: 1,
                            display: 'flex', alignItems: 'center',
                        }}>
                            {!isOnline ? (
                                <WifiOff size={11} color="#EF4444" style={{
                                    animation: 'pulse-alert 1.5s ease-in-out infinite',
                                }} />
                            ) : (
                                <div style={{
                                    position: 'relative',
                                    width: '8px', height: '8px',
                                }}>
                                    {/* Pulsing ring */}
                                    <span style={{
                                        position: 'absolute',
                                        top: '-2px', left: '-2px',
                                        width: '12px', height: '12px',
                                        borderRadius: '50%',
                                        background: isOver ? '#EF4444' : '#22C55E',
                                        opacity: 0.3,
                                        animation: 'pulse-ring 2s ease-in-out infinite',
                                    }} />
                                    {/* Solid dot */}
                                    <span style={{
                                        position: 'absolute',
                                        top: 0, left: 0,
                                        width: '8px', height: '8px',
                                        borderRadius: '50%',
                                        background: isOver ? '#EF4444' : '#22C55E',
                                        boxShadow: `0 0 6px ${isOver ? '#EF4444' : '#22C55E'}40`,
                                    }} />
                                </div>
                            )}
                        </div>

                        {isOver && (
                            <AlertTriangle size={11} color="#EF4444" style={{
                                position: 'relative', zIndex: 1,
                            }} />
                        )}

                        <span style={{
                            fontSize: '0.68rem', fontWeight: 700,
                            color: !isOnline ? '#DC2626' : isOver ? '#DC2626' : '#374151',
                            fontFamily: 'monospace', position: 'relative', zIndex: 1,
                            whiteSpace: 'nowrap',
                            textDecoration: !isOnline ? 'line-through' : 'none',
                            opacity: !isOnline ? 0.7 : 1,
                        }}>
                            ···{line.phone.slice(-4)}
                        </span>

                        <span style={{
                            fontSize: '0.72rem', fontWeight: 800,
                            color: !isOnline ? '#DC2626' : isOver ? '#DC2626' : line.color,
                            position: 'relative', zIndex: 1,
                            minWidth: '16px', textAlign: 'center',
                        }}>
                            {count}
                        </span>

                        <span style={{
                            fontSize: '0.58rem', color: '#94A3B8',
                            position: 'relative', zIndex: 1,
                        }}>
                            /{ALERT_THRESHOLD}
                        </span>
                    </div>
                );
            })}

            {/* Offline alert */}
            {anyOffline && (
                <span style={{
                    fontSize: '0.62rem', fontWeight: 800,
                    color: '#DC2626', whiteSpace: 'nowrap',
                    animation: 'pulse-alert 1.5s ease-in-out infinite',
                    display: 'flex', alignItems: 'center', gap: '3px',
                }}>
                    <WifiOff size={10} />
                    OFFLINE
                </span>
            )}

            {/* Counter alert */}
            {anyAlert && !anyOffline && (
                <span style={{
                    fontSize: '0.62rem', fontWeight: 800,
                    color: '#DC2626', whiteSpace: 'nowrap',
                    animation: 'pulse-alert 1.5s ease-in-out infinite',
                }}>
                    ⚠️ LÍMITE
                </span>
            )}

            <style>{`
                @keyframes pulse-alert {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }
                @keyframes pulse-ring {
                    0% { transform: scale(1); opacity: 0.3; }
                    50% { transform: scale(1.8); opacity: 0; }
                    100% { transform: scale(1); opacity: 0.3; }
                }
            `}</style>
        </div>
    );
}
