/**
 * RoleModuleSelector — Selector interactivo de Módulos y Submódulos
 * Estética Calidad-QOAG: Limpia, Clínica, bordes suaves y acentos Azul Institucional.
 */
import React, { useState } from 'react';
import { Check, ChevronDown, ChevronRight, Layers } from 'lucide-react';
import { MODULE_TREE, ALL_SUBMODULE_IDS } from '../config/rolesCatalog';

export default function RoleModuleSelector({
    selectedModules = [],
    onChange,
    disabled = false,
    compact = false,
}) {
    const [expandedGroups, setExpandedGroups] = useState(() =>
        new Set(MODULE_TREE.map(g => g.id))
    );

    const selectedSet = new Set(selectedModules || []);

    const toggleExpand = (groupId) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(groupId)) next.delete(groupId);
            else next.add(groupId);
            return next;
        });
    };

    const toggleSubmodule = (subId) => {
        if (disabled) return;
        const next = new Set(selectedSet);
        if (next.has(subId)) next.delete(subId);
        else next.add(subId);
        onChange?.(Array.from(next));
    };

    const toggleGroupAll = (group) => {
        if (disabled) return;
        const ids = group.items.map(i => i.id);
        const allSelected = ids.every(id => selectedSet.has(id));
        const next = new Set(selectedSet);
        ids.forEach(id => {
            if (allSelected) next.delete(id);
            else next.add(id);
        });
        onChange?.(Array.from(next));
    };

    const handleSelectAll = () => {
        if (disabled) return;
        onChange?.([...ALL_SUBMODULE_IDS]);
    };

    const handleClearAll = () => {
        if (disabled) return;
        onChange?.([]);
    };

    return (
        <div style={{
            border: '1px solid #E2E8F0',
            borderRadius: '10px',
            background: '#FFFFFF',
            overflow: 'hidden',
        }}>
            {/* Barra superior */}
            <div style={{
                padding: '10px 14px',
                background: '#F8FAFC',
                borderBottom: '1px solid #E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '8px',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Layers size={15} color="#1E4078" />
                    <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0F172A' }}>
                        Módulos y Submódulos Habilitados
                    </span>
                    <span style={{
                        padding: '2px 8px',
                        borderRadius: '999px',
                        background: '#DBEAFE',
                        color: '#1E40AF',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                    }}>
                        {selectedSet.size} / {ALL_SUBMODULE_IDS.length}
                    </span>
                </div>

                {!disabled && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                            type="button"
                            onClick={handleSelectAll}
                            style={{
                                padding: '4px 9px',
                                borderRadius: '6px',
                                border: '1px solid #BFDBFE',
                                background: '#EFF6FF',
                                color: '#1E40AF',
                                fontSize: '0.71rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                            }}
                        >
                            Seleccionar todos
                        </button>
                        <button
                            type="button"
                            onClick={handleClearAll}
                            style={{
                                padding: '4px 9px',
                                borderRadius: '6px',
                                border: '1px solid #E2E8F0',
                                background: '#FFFFFF',
                                color: '#64748B',
                                fontSize: '0.71rem',
                                fontWeight: 600,
                                cursor: 'pointer',
                            }}
                        >
                            Limpiar
                        </button>
                    </div>
                )}
            </div>

            {/* Árbol de módulos y submódulos */}
            <div style={{
                padding: '10px 12px',
                display: 'grid',
                gridTemplateColumns: compact ? '1fr' : 'repeat(auto-fit, minmax(250px, 1fr))',
                gap: '10px',
                maxHeight: compact ? '260px' : '360px',
                overflowY: 'auto',
            }}>
                {MODULE_TREE.map(group => {
                    const ids = group.items.map(i => i.id);
                    const selectedCount = ids.filter(id => selectedSet.has(id)).length;
                    const allSelected = selectedCount === ids.length && ids.length > 0;
                    const partialSelected = selectedCount > 0 && selectedCount < ids.length;
                    const isExpanded = expandedGroups.has(group.id);

                    return (
                        <div
                            key={group.id}
                            style={{
                                border: `1px solid ${selectedCount > 0 ? '#BFDBFE' : '#E2E8F0'}`,
                                borderRadius: '8px',
                                background: selectedCount > 0 ? '#F8FAFF' : '#FFFFFF',
                                overflow: 'hidden',
                            }}
                        >
                            {/* Header del módulo */}
                            <div style={{
                                padding: '8px 10px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '6px',
                                borderBottom: isExpanded ? '1px solid #E2E8F0' : 'none',
                                background: selectedCount > 0 ? '#EFF6FF' : '#F8FAFC',
                            }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flex: 1, minWidth: 0 }}>
                                    <button
                                        type="button"
                                        disabled={disabled}
                                        onClick={() => toggleGroupAll(group)}
                                        title={allSelected ? 'Quitar todo el módulo' : 'Habilitar todo el módulo'}
                                        style={{
                                            width: '18px',
                                            height: '18px',
                                            borderRadius: '4px',
                                            border: `1.5px solid ${allSelected || partialSelected ? '#1E4078' : '#CBD5E1'}`,
                                            background: allSelected ? '#1E4078' : partialSelected ? '#DBEAFE' : '#FFFFFF',
                                            color: allSelected ? '#FFFFFF' : '#1E4078',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            cursor: disabled ? 'default' : 'pointer',
                                            flexShrink: 0,
                                            padding: 0,
                                            fontSize: '0.7rem',
                                            fontWeight: 800,
                                        }}
                                    >
                                        {allSelected ? <Check size={12} /> : partialSelected ? '−' : null}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => toggleExpand(group.id)}
                                        style={{
                                            background: 'none',
                                            border: 'none',
                                            padding: 0,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px',
                                            color: '#0F172A',
                                            fontWeight: 700,
                                            fontSize: '0.76rem',
                                            textAlign: 'left',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            whiteSpace: 'nowrap',
                                        }}
                                    >
                                        {isExpanded ? <ChevronDown size={13} color="#64748B" /> : <ChevronRight size={13} color="#64748B" />}
                                        <span>{group.label}</span>
                                    </button>
                                </div>
                                <span style={{
                                    fontSize: '0.66rem',
                                    fontWeight: 700,
                                    color: selectedCount > 0 ? '#1E40AF' : '#94A3B8',
                                    flexShrink: 0,
                                }}>
                                    {selectedCount}/{ids.length}
                                </span>
                            </div>

                            {/* Submódulos */}
                            {isExpanded && (
                                <div style={{ padding: '6px 10px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {group.items.map(sub => {
                                        const checked = selectedSet.has(sub.id);
                                        return (
                                            <label
                                                key={sub.id}
                                                style={{
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: '7px',
                                                    fontSize: '0.73rem',
                                                    color: checked ? '#0F172A' : '#64748B',
                                                    fontWeight: checked ? 600 : 500,
                                                    cursor: disabled ? 'default' : 'pointer',
                                                    padding: '2px 0',
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={checked}
                                                    disabled={disabled}
                                                    onChange={() => toggleSubmodule(sub.id)}
                                                    style={{ accentColor: '#1E4078', cursor: disabled ? 'default' : 'pointer' }}
                                                />
                                                <span>{sub.label}</span>
                                            </label>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
