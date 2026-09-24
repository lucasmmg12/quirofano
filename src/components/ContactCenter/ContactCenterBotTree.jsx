import React, { useState, useMemo } from 'react';
import { 
    GitBranch, MessageSquare, ArrowRight, CornerDownRight, CheckCircle2, 
    AlertCircle, Sparkles, Edit3, Play, RotateCcw, Copy, Check, Plus, 
    Search, Filter, ChevronDown, ChevronRight, Info, Eye, Sliders, ExternalLink,
    Shield, Activity, Zap, UserCheck, UserX, Clock, MapPin, Send, Cpu, Layers
} from 'lucide-react';
import { BOT_TREE_CATEGORIES, DEFAULT_BOT_TREE_NODES, generatePromptDirectivesFromTree } from './botTreeData';

export default function ContactCenterBotTree({
    botTreeNodes = DEFAULT_BOT_TREE_NODES,
    onSaveTree,
    onSyncPromptWithTree,
    onTestNodeInSimulator,
    botName = 'Dora',
    saving = false,
    addToast
}) {
    const [nodes, setNodes] = useState(botTreeNodes);
    const [selectedNodeId, setSelectedNodeId] = useState('root_saludo');
    const [filterCategory, setFilterCategory] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedNodeIds, setExpandedNodeIds] = useState({
        'root_saludo': true,
        'nodo_turnos_triage': true,
        'nodo_camino_1_registrado': true,
        'nodo_camino_2_nuevo': true,
        'nodo_estudios_menu': true,
        'nodo_operador_handoff': true
    });
    const [viewMode, setViewMode] = useState('diagram'); // 'diagram' | 'compact_list'
    const [editingNode, setEditingNode] = useState(null);
    const [editForm, setEditForm] = useState({
        title: '',
        patientTrigger: '',
        botResponse: '',
        systemAction: ''
    });
    const [copiedNodeId, setCopiedNodeId] = useState(null);

    // Actualizar nodos si la prop externa cambia (ej. al recargar config)
    React.useEffect(() => {
        if (botTreeNodes && Array.isArray(botTreeNodes) && botTreeNodes.length > 0) {
            setNodes(botTreeNodes);
        }
    }, [botTreeNodes]);

    // Nodo seleccionado actualmente
    const selectedNode = useMemo(() => {
        return nodes.find(n => n.id === selectedNodeId) || nodes[0] || null;
    }, [nodes, selectedNodeId]);

    // Alternar colapsado de rama
    const toggleExpand = (nodeId) => {
        setExpandedNodeIds(prev => ({
            ...prev,
            [nodeId]: !prev[nodeId]
        }));
    };

    // Expandir o colapsar todo
    const toggleExpandAll = (expand) => {
        const next = {};
        nodes.forEach(n => {
            next[n.id] = expand;
        });
        setExpandedNodeIds(next);
    };

    // Iniciar edición de un nodo
    const handleStartEdit = (node) => {
        setEditingNode(node);
        setEditForm({
            title: node.title,
            patientTrigger: node.patientTrigger,
            botResponse: node.botResponse,
            systemAction: node.systemAction
        });
    };

    // Guardar edición local del nodo
    const handleSaveNodeEdit = () => {
        if (!editingNode) return;
        setNodes(prev => prev.map(n => {
            if (n.id === editingNode.id) {
                return {
                    ...n,
                    title: editForm.title,
                    patientTrigger: editForm.patientTrigger,
                    botResponse: editForm.botResponse,
                    systemAction: editForm.systemAction,
                    isCustomized: true
                };
            }
            return n;
        }));
        addToast?.(`Nodo "${editForm.title}" actualizado localmente. Recordá presionar "Guardar Árbol" para persistirlo.`, 'success');
        setEditingNode(null);
    };

    // Restablecer un nodo específico a valores por defecto
    const handleResetSingleNode = (nodeId) => {
        const defaultNode = DEFAULT_BOT_TREE_NODES.find(n => n.id === nodeId);
        if (!defaultNode) return;

        setNodes(prev => prev.map(n => n.id === nodeId ? { ...defaultNode, isCustomized: false } : n));
        if (editingNode && editingNode.id === nodeId) {
            setEditForm({
                title: defaultNode.title,
                patientTrigger: defaultNode.patientTrigger,
                botResponse: defaultNode.botResponse,
                systemAction: defaultNode.systemAction
            });
        }
        addToast?.(`Nodo restablecido a la configuración de fábrica`, 'info');
    };

    // Restablecer todo el árbol a valores de fábrica
    const handleResetAllTree = () => {
        if (window.confirm('¿Estás seguro de restablecer TODO el árbol de respuestas predeterminadas al estado de fábrica de Sanatorio Argentino? Perderás las modificaciones no guardadas.')) {
            setNodes(DEFAULT_BOT_TREE_NODES);
            addToast?.('Árbol conversacional restablecido a valores predeterminados', 'info');
        }
    };

    // Copiar respuesta del nodo
    const handleCopyResponse = (node) => {
        const compiled = node.botResponse.replace(/\{bot_name\}/g, botName);
        navigator.clipboard.writeText(compiled);
        setCopiedNodeId(node.id);
        setTimeout(() => setCopiedNodeId(null), 2000);
        addToast?.('Respuesta copiada al portapapeles', 'info');
    };

    // Insertar tag dinámico en la respuesta del editor
    const handleInsertTagInEdit = (tag) => {
        setEditForm(prev => ({
            ...prev,
            botResponse: prev.botResponse + ' ' + tag
        }));
    };

    // Lanzar prueba en el simulador
    const handleTestNode = (node) => {
        const sampleText = (node.patientExamples && node.patientExamples[0]) || node.patientTrigger.split('(')[0].replace(/["']/g, '').trim();
        
        let targetPatientType = 'registrado';
        if (node.id.includes('nuevo') || node.category === 'admision') {
            targetPatientType = 'nuevo';
        }

        if (onTestNodeInSimulator) {
            onTestNodeInSimulator({
                message: sampleText,
                nodeId: node.id,
                nodeTitle: node.title,
                patientType: targetPatientType,
                expectedResponse: node.botResponse
            });
        }
    };

    // Filtrado de nodos
    const filteredNodes = useMemo(() => {
        return nodes.filter(n => {
            const matchesCat = filterCategory === 'all' || n.category === filterCategory;
            const q = searchQuery.toLowerCase().trim();
            const matchesSearch = !q || 
                n.title.toLowerCase().includes(q) || 
                n.patientTrigger.toLowerCase().includes(q) || 
                n.botResponse.toLowerCase().includes(q) ||
                n.systemAction.toLowerCase().includes(q);
            return matchesCat && matchesSearch;
        });
    }, [nodes, filterCategory, searchQuery]);

    // Helpers de jerarquía
    const rootNode = useMemo(() => nodes.find(n => n.id === 'root_saludo') || nodes[0], [nodes]);
    const getNodeChildren = (parentId) => nodes.filter(n => n.parentId === parentId);

    // Contadores
    const stats = useMemo(() => {
        const total = nodes.length;
        const customized = nodes.filter(n => n.isCustomized).length;
        const categoriesCount = Object.keys(BOT_TREE_CATEGORIES).length;
        return { total, customized, categoriesCount };
    }, [nodes]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
            
            {/* Header del Árbol & Acciones Principales */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                border: '1px solid #E2E8F0',
                padding: '18px 22px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '14px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
            }}>
                <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#FFFFFF'
                        }}>
                            <GitBranch size={20} />
                        </div>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800, color: '#0F2942' }}>
                                    Árbol de Decisión Conversacional (WhatsApp Sanatorio Argentino)
                                </h3>
                                <span style={{
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    padding: '2px 8px',
                                    borderRadius: '12px',
                                    background: '#E0F2FE',
                                    color: '#0284C7',
                                    border: '1px solid #BAE6FD'
                                }}>
                                    {stats.total} Nodos Clínicos
                                </span>
                                {stats.customized > 0 && (
                                    <span style={{
                                        fontSize: '0.72rem',
                                        fontWeight: 700,
                                        padding: '2px 8px',
                                        borderRadius: '12px',
                                        background: '#FEF3C7',
                                        color: '#B45309',
                                        border: '1px solid #FDE68A'
                                    }}>
                                        {stats.customized} Personalizados
                                    </span>
                                )}
                            </div>
                            <p style={{ margin: '3px 0 0 0', fontSize: '0.82rem', color: '#64748B' }}>
                                Flujograma paso a paso: cada entrada o mensaje del paciente bifurca a una respuesta predeterminada y su acción correspondiente en SALUS.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Acciones globales */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        onClick={handleResetAllTree}
                        style={{
                            padding: '8px 12px',
                            background: '#F8FAFC',
                            border: '1px solid #CBD5E1',
                            borderRadius: '8px',
                            color: '#475569',
                            fontSize: '0.78rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '5px'
                        }}
                        title="Restablecer todas las respuestas al valor de fábrica de Sanatorio Argentino"
                    >
                        <RotateCcw size={13} />
                        Restablecer Árbol
                    </button>

                    <button
                        type="button"
                        onClick={() => {
                            if (onSyncPromptWithTree) {
                                onSyncPromptWithTree(nodes);
                                addToast?.('Directivas del árbol sincronizadas con el System Prompt.', 'info');
                            }
                        }}
                        style={{
                            padding: '8px 14px',
                            background: '#F0FDF4',
                            border: '1px solid #BBF7D0',
                            borderRadius: '8px',
                            color: '#15803D',
                            fontSize: '0.78rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px'
                        }}
                        title="Inyecta la lógica de este árbol en el System Prompt de OpenAI"
                    >
                        <Sparkles size={14} />
                        Sincronizar con System Prompt
                    </button>

                    <button
                        type="button"
                        onClick={() => onSaveTree?.(nodes)}
                        disabled={saving}
                        style={{
                            padding: '8px 18px',
                            background: 'linear-gradient(135deg, #0284C7 0%, #0369A1 100%)',
                            border: 'none',
                            borderRadius: '8px',
                            color: '#FFFFFF',
                            fontSize: '0.82rem',
                            fontWeight: 700,
                            cursor: saving ? 'not-allowed' : 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '6px',
                            boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)',
                            opacity: saving ? 0.7 : 1
                        }}
                    >
                        <Check size={14} />
                        {saving ? 'Guardando Árbol...' : 'Guardar y Publicar Árbol'}
                    </button>
                </div>
            </div>

            {/* Filtros, Búsqueda y Modos de Vista */}
            <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #E2E8F0',
                padding: '12px 18px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: '12px'
            }}>
                {/* Categorías como Pills */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.74rem', fontWeight: 800, color: '#64748B', marginRight: '4px' }}>
                        Filtrar Rama:
                    </span>
                    <button
                        type="button"
                        onClick={() => setFilterCategory('all')}
                        style={{
                            padding: '4px 10px',
                            borderRadius: '20px',
                            border: filterCategory === 'all' ? '1px solid #0284C7' : '1px solid #E2E8F0',
                            background: filterCategory === 'all' ? '#0284C7' : '#F8FAFC',
                            color: filterCategory === 'all' ? '#FFFFFF' : '#475569',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer'
                        }}
                    >
                        Todas ({nodes.length})
                    </button>
                    {Object.entries(BOT_TREE_CATEGORIES).map(([catKey, catInfo]) => {
                        const count = nodes.filter(n => n.category === catKey).length;
                        const isSelected = filterCategory === catKey;
                        return (
                            <button
                                key={catKey}
                                type="button"
                                onClick={() => setFilterCategory(catKey)}
                                style={{
                                    padding: '4px 10px',
                                    borderRadius: '20px',
                                    border: isSelected ? `1px solid ${catInfo.color}` : '1px solid #E2E8F0',
                                    background: isSelected ? catInfo.bg : '#FFFFFF',
                                    color: isSelected ? catInfo.color : '#475569',
                                    fontSize: '0.72rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '4px'
                                }}
                            >
                                <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: catInfo.color }} />
                                {catInfo.label} ({count})
                            </button>
                        );
                    })}
                </div>

                {/* Búsqueda y Switch de Vista */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div style={{ position: 'relative' }}>
                        <Search size={14} color="#94A3B8" style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)' }} />
                        <input
                            type="text"
                            placeholder="Buscar en el árbol (ej: DNI, Glims, turno)..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            style={{
                                padding: '6px 12px 6px 30px',
                                borderRadius: '8px',
                                border: '1px solid #CBD5E1',
                                fontSize: '0.76rem',
                                width: '240px',
                                outline: 'none'
                            }}
                        />
                    </div>

                    <div style={{ display: 'flex', background: '#F1F5F9', padding: '2px', borderRadius: '8px', border: '1px solid #E2E8F0' }}>
                        <button
                            type="button"
                            onClick={() => setViewMode('diagram')}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: 'none',
                                background: viewMode === 'diagram' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'diagram' ? '#0284C7' : '#64748B',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: viewMode === 'diagram' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <GitBranch size={13} />
                            Vista Flujograma
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('compact_list')}
                            style={{
                                padding: '4px 10px',
                                borderRadius: '6px',
                                border: 'none',
                                background: viewMode === 'compact_list' ? '#FFFFFF' : 'transparent',
                                color: viewMode === 'compact_list' ? '#0284C7' : '#64748B',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                boxShadow: viewMode === 'compact_list' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                            }}
                        >
                            <Layers size={13} />
                            Vista Lista Detallada
                        </button>
                    </div>

                    <div style={{ display: 'flex', gap: '4px' }}>
                        <button
                            type="button"
                            onClick={() => toggleExpandAll(true)}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#475569',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            title="Expandir todas las ramas"
                        >
                            Expandir
                        </button>
                        <button
                            type="button"
                            onClick={() => toggleExpandAll(false)}
                            style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                border: '1px solid #CBD5E1',
                                background: '#FFFFFF',
                                color: '#475569',
                                fontSize: '0.72rem',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                            title="Colapsar ramas"
                        >
                            Colapsar
                        </button>
                    </div>
                </div>
            </div>

            {/* Layout Principal: Diagrama / Lista de Nodos */}
            <div style={{ display: 'grid', gridTemplateColumns: selectedNode ? '1fr 380px' : '1fr', gap: '20px', alignItems: 'start' }}>
                
                {/* Panel Izquierdo: Visualizador del Árbol */}
                <div style={{
                    background: '#F8FAFC',
                    borderRadius: '16px',
                    border: '1px solid #E2E8F0',
                    padding: '24px',
                    minHeight: '600px',
                    overflowX: 'auto',
                    boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.02)'
                }}>
                    {viewMode === 'diagram' ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                            {/* Renderizamos el Nodo Raíz y sus Ramas Hojas */}
                            {rootNode && (
                                <TreeNodeCard
                                    node={rootNode}
                                    allNodes={nodes}
                                    selectedNodeId={selectedNodeId}
                                    expandedNodeIds={expandedNodeIds}
                                    onSelectNode={setSelectedNodeId}
                                    onToggleExpand={toggleExpand}
                                    onStartEdit={handleStartEdit}
                                    onTestNode={handleTestNode}
                                    onCopyResponse={handleCopyResponse}
                                    copiedNodeId={copiedNodeId}
                                    botName={botName}
                                    filterCategory={filterCategory}
                                    searchQuery={searchQuery}
                                />
                            )}
                        </div>
                    ) : (
                        /* Vista Lista Detallada con Acordeón */
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                            {filteredNodes.map(node => (
                                <CompactNodeRow
                                    key={node.id}
                                    node={node}
                                    isSelected={selectedNodeId === node.id}
                                    onSelect={() => setSelectedNodeId(node.id)}
                                    onStartEdit={() => handleStartEdit(node)}
                                    onTest={() => handleTestNode(node)}
                                    onCopy={() => handleCopyResponse(node)}
                                    copied={copiedNodeId === node.id}
                                    botName={botName}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* Panel Derecho: Inspector y Editor del Nodo Seleccionado */}
                {selectedNode && (
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 4px 14px rgba(0,0,0,0.05)',
                        overflow: 'hidden',
                        position: 'sticky',
                        top: '20px'
                    }}>
                        {/* Cabecera del Inspector */}
                        <div style={{
                            padding: '16px 20px',
                            background: BOT_TREE_CATEGORIES[selectedNode.category]?.bg || '#F8FAFC',
                            borderBottom: `1px solid ${BOT_TREE_CATEGORIES[selectedNode.category]?.border || '#E2E8F0'}`,
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <span style={{
                                    fontSize: '0.68rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    letterSpacing: '0.5px',
                                    color: BOT_TREE_CATEGORIES[selectedNode.category]?.color || '#475569'
                                }}>
                                    {BOT_TREE_CATEGORIES[selectedNode.category]?.label} • Nivel {selectedNode.level}
                                </span>
                                <h4 style={{ margin: '2px 0 0 0', fontSize: '0.96rem', fontWeight: 800, color: '#0F2942' }}>
                                    {selectedNode.title}
                                </h4>
                            </div>

                            <button
                                type="button"
                                onClick={() => handleStartEdit(selectedNode)}
                                style={{
                                    padding: '6px 12px',
                                    borderRadius: '8px',
                                    background: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    color: '#0284C7',
                                    fontSize: '0.74rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '5px',
                                    boxShadow: '0 1px 2px rgba(0,0,0,0.04)'
                                }}
                            >
                                <Edit3 size={13} />
                                Editar
                            </button>
                        </div>

                        {/* Cuerpo del Inspector */}
                        <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            
                            {/* Entrada / Disparador del Paciente */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                                    🗣️ Entrada / Mensaje Disparador del Paciente:
                                </label>
                                <div style={{
                                    background: '#F8FAFC',
                                    border: '1px solid #E2E8F0',
                                    borderRadius: '10px',
                                    padding: '10px 14px',
                                    fontSize: '0.8rem',
                                    color: '#1E293B',
                                    fontWeight: 600
                                }}>
                                    {selectedNode.patientTrigger}
                                </div>
                                {selectedNode.patientExamples && selectedNode.patientExamples.length > 0 && (
                                    <div style={{ marginTop: '6px', display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                                        {selectedNode.patientExamples.map((ex, i) => (
                                            <span key={i} style={{
                                                fontSize: '0.68rem',
                                                background: '#EFF6FF',
                                                color: '#1D4ED8',
                                                padding: '2px 8px',
                                                borderRadius: '6px',
                                                border: '1px solid #DBEAFE'
                                            }}>
                                                "{ex}"
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Acción del Sistema */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 800, color: '#475569', marginBottom: '6px' }}>
                                    ⚙️ Acción Interna / Triage SALUS:
                                </label>
                                <div style={{
                                    background: '#F1F5F9',
                                    borderRadius: '8px',
                                    padding: '8px 12px',
                                    fontSize: '0.76rem',
                                    color: '#334155',
                                    lineHeight: 1.4
                                }}>
                                    {selectedNode.systemAction}
                                </div>
                            </div>

                            {/* Respuesta Predeterminada del Bot */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '0.74rem', fontWeight: 800, color: '#475569' }}>
                                        🤖 Respuesta Predeterminada del Bot:
                                    </label>
                                    <button
                                        type="button"
                                        onClick={() => handleCopyResponse(selectedNode)}
                                        style={{
                                            border: 'none',
                                            background: 'transparent',
                                            color: copiedNodeId === selectedNode.id ? '#16A34A' : '#0284C7',
                                            fontSize: '0.7rem',
                                            fontWeight: 700,
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                        }}
                                    >
                                        {copiedNodeId === selectedNode.id ? <Check size={12} /> : <Copy size={12} />}
                                        {copiedNodeId === selectedNode.id ? 'Copiado' : 'Copiar'}
                                    </button>
                                </div>

                                <div style={{
                                    background: '#F0FDF4',
                                    border: '1px solid #BBF7D0',
                                    borderRadius: '12px',
                                    padding: '14px',
                                    fontSize: '0.8rem',
                                    color: '#064E3B',
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap',
                                    fontFamily: 'system-ui, -apple-system, sans-serif'
                                }}>
                                    {selectedNode.botResponse.replace(/\{bot_name\}/g, botName)}
                                </div>
                            </div>

                            {/* Botones de Acción Directa */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                                <button
                                    type="button"
                                    onClick={() => handleTestNode(selectedNode)}
                                    style={{
                                        width: '100%',
                                        padding: '10px 16px',
                                        borderRadius: '8px',
                                        background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                                        border: 'none',
                                        color: '#FFFFFF',
                                        fontSize: '0.82rem',
                                        fontWeight: 700,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '8px',
                                        boxShadow: '0 2px 6px rgba(16, 185, 129, 0.25)'
                                    }}
                                >
                                    <Play size={14} />
                                    Probar este Nodo en Simulador Sandbox
                                </button>

                                <button
                                    type="button"
                                    onClick={() => handleResetSingleNode(selectedNode.id)}
                                    style={{
                                        width: '100%',
                                        padding: '8px 14px',
                                        borderRadius: '8px',
                                        background: '#FFFFFF',
                                        border: '1px solid #CBD5E1',
                                        color: '#64748B',
                                        fontSize: '0.76rem',
                                        fontWeight: 600,
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: '6px'
                                    }}
                                >
                                    <RotateCcw size={13} />
                                    Restablecer este Nodo a Fábrica
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal de Edición del Nodo */}
            {editingNode && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(15, 23, 42, 0.65)',
                    backdropFilter: 'blur(4px)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    padding: '20px'
                }}>
                    <div style={{
                        background: '#FFFFFF',
                        borderRadius: '16px',
                        width: '100%',
                        maxWidth: '680px',
                        maxHeight: '90vh',
                        display: 'flex',
                        flexDirection: 'column',
                        boxShadow: '0 20px 40px rgba(0,0,0,0.2)',
                        overflow: 'hidden'
                    }}>
                        {/* Cabecera Modal */}
                        <div style={{
                            padding: '18px 24px',
                            background: '#F8FAFC',
                            borderBottom: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center'
                        }}>
                            <div>
                                <span style={{
                                    fontSize: '0.7rem',
                                    fontWeight: 800,
                                    textTransform: 'uppercase',
                                    color: BOT_TREE_CATEGORIES[editingNode.category]?.color || '#0284C7'
                                }}>
                                    Configurar Rama • ID: {editingNode.id}
                                </span>
                                <h3 style={{ margin: '2px 0 0 0', fontSize: '1.1rem', fontWeight: 800, color: '#0F2942' }}>
                                    Editar Respuesta Predeterminada del Bot
                                </h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setEditingNode(null)}
                                style={{
                                    border: 'none',
                                    background: '#F1F5F9',
                                    borderRadius: '50%',
                                    width: '32px',
                                    height: '32px',
                                    cursor: 'pointer',
                                    fontSize: '1rem',
                                    color: '#64748B',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                            >
                                ✕
                            </button>
                        </div>

                        {/* Contenido Formulario */}
                        <div style={{ padding: '24px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                            {/* Título */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    Título descriptivo del paso:
                                </label>
                                <input
                                    type="text"
                                    value={editForm.title}
                                    onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.85rem'
                                    }}
                                />
                            </div>

                            {/* Trigger del Paciente */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    🗣️ Entrada / Mensaje Disparador del Paciente:
                                </label>
                                <input
                                    type="text"
                                    value={editForm.patientTrigger}
                                    onChange={(e) => setEditForm({ ...editForm, patientTrigger: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.85rem'
                                    }}
                                />
                            </div>

                            {/* Respuesta Predeterminada */}
                            <div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                                    <label style={{ fontSize: '0.76rem', fontWeight: 700, color: '#475569' }}>
                                        🤖 Texto de Respuesta Predeterminada del Bot:
                                    </label>
                                    <div style={{ display: 'flex', gap: '4px' }}>
                                        {['{nombre}', '{dni}', '{cobertura}', '{turnos}', '{bot_name}'].map(tag => (
                                            <button
                                                key={tag}
                                                type="button"
                                                onClick={() => handleInsertTagInEdit(tag)}
                                                style={{
                                                    fontSize: '0.68rem',
                                                    padding: '2px 6px',
                                                    background: '#EFF6FF',
                                                    color: '#1D4ED8',
                                                    border: '1px solid #BFDBFE',
                                                    borderRadius: '4px',
                                                    cursor: 'pointer',
                                                    fontWeight: 700
                                                }}
                                            >
                                                +{tag}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <textarea
                                    rows={8}
                                    value={editForm.botResponse}
                                    onChange={(e) => setEditForm({ ...editForm, botResponse: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '12px',
                                        borderRadius: '10px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.84rem',
                                        lineHeight: 1.5,
                                        fontFamily: 'monospace',
                                        resize: 'vertical'
                                    }}
                                />
                            </div>

                            {/* Acción del sistema */}
                            <div>
                                <label style={{ display: 'block', fontSize: '0.76rem', fontWeight: 700, color: '#475569', marginBottom: '4px' }}>
                                    ⚙️ Acción del Sistema / Lógica SALUS:
                                </label>
                                <input
                                    type="text"
                                    value={editForm.systemAction}
                                    onChange={(e) => setEditForm({ ...editForm, systemAction: e.target.value })}
                                    style={{
                                        width: '100%',
                                        padding: '8px 12px',
                                        borderRadius: '8px',
                                        border: '1px solid #CBD5E1',
                                        fontSize: '0.82rem',
                                        color: '#475569'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Pie Modal */}
                        <div style={{
                            padding: '16px 24px',
                            background: '#F8FAFC',
                            borderTop: '1px solid #E2E8F0',
                            display: 'flex',
                            justifyContent: 'flex-end',
                            gap: '10px'
                        }}>
                            <button
                                type="button"
                                onClick={() => setEditingNode(null)}
                                style={{
                                    padding: '8px 16px',
                                    borderRadius: '8px',
                                    background: '#FFFFFF',
                                    border: '1px solid #CBD5E1',
                                    color: '#475569',
                                    fontSize: '0.8rem',
                                    fontWeight: 600,
                                    cursor: 'pointer'
                                }}
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveNodeEdit}
                                style={{
                                    padding: '8px 20px',
                                    borderRadius: '8px',
                                    background: '#0284C7',
                                    border: 'none',
                                    color: '#FFFFFF',
                                    fontSize: '0.82rem',
                                    fontWeight: 700,
                                    cursor: 'pointer',
                                    boxShadow: '0 2px 6px rgba(2, 132, 199, 0.3)'
                                }}
                            >
                                Guardar Cambio en este Nodo
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

/**
 * Tarjeta individual del Diagrama del Árbol (con soporte recursivo para hijos)
 */
function TreeNodeCard({
    node,
    allNodes,
    selectedNodeId,
    expandedNodeIds,
    onSelectNode,
    onToggleExpand,
    onStartEdit,
    onTestNode,
    onCopyResponse,
    copiedNodeId,
    botName,
    filterCategory,
    searchQuery
}) {
    const isSelected = selectedNodeId === node.id;
    const isExpanded = !!expandedNodeIds[node.id];
    const categoryInfo = BOT_TREE_CATEGORIES[node.category] || BOT_TREE_CATEGORIES.inicio;

    // Buscar hijos directos
    const children = allNodes.filter(n => n.parentId === node.id);
    const hasChildren = children.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            
            {/* Contenedor de la Tarjeta del Nodo */}
            <div 
                onClick={() => onSelectNode(node.id)}
                style={{
                    background: '#FFFFFF',
                    borderRadius: '14px',
                    border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                    boxShadow: isSelected 
                        ? '0 6px 20px rgba(2, 132, 199, 0.15)' 
                        : '0 2px 6px rgba(0,0,0,0.03)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    position: 'relative',
                    overflow: 'hidden'
                }}
            >
                {/* Barra de color de categoría en el borde izquierdo */}
                <div style={{
                    position: 'absolute',
                    top: 0,
                    bottom: 0,
                    left: 0,
                    width: '5px',
                    background: categoryInfo.color
                }} />

                {/* Cabecera del Nodo */}
                <div style={{
                    padding: '12px 18px 10px 22px',
                    borderBottom: '1px solid #F1F5F9',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {hasChildren && (
                            <button
                                type="button"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onToggleExpand(node.id);
                                }}
                                style={{
                                    border: 'none',
                                    background: '#F1F5F9',
                                    borderRadius: '4px',
                                    width: '22px',
                                    height: '22px',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    color: '#64748B'
                                }}
                            >
                                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                            </button>
                        )}
                        <span style={{
                            fontSize: '0.68rem',
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: '8px',
                            background: categoryInfo.bg,
                            color: categoryInfo.color,
                            border: `1px solid ${categoryInfo.border}`
                        }}>
                            {categoryInfo.label}
                        </span>
                        <h4 style={{ margin: 0, fontSize: '0.88rem', fontWeight: 800, color: '#0F2942' }}>
                            {node.title}
                        </h4>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onTestNode(node);
                            }}
                            title="Probar este paso en el Simulador Sandbox"
                            style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: '#ECFDF5',
                                border: '1px solid #A7F3D0',
                                color: '#059669',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                            }}
                        >
                            <Play size={11} />
                            Probar
                        </button>
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onStartEdit(node);
                            }}
                            title="Editar texto predeterminado"
                            style={{
                                padding: '4px 8px',
                                borderRadius: '6px',
                                background: '#F8FAFC',
                                border: '1px solid #CBD5E1',
                                color: '#475569',
                                fontSize: '0.7rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '3px'
                            }}
                        >
                            <Edit3 size={11} />
                            Editar
                        </button>
                    </div>
                </div>

                {/* Contenido Visual: Entrada del Paciente ---> Respuesta del Bot */}
                <div style={{ padding: '14px 18px 16px 22px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    
                    {/* Fila 1: Paciente Trigger */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#EFF6FF',
                            color: '#1D4ED8',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            🗣️ Paciente
                        </div>
                        <div style={{
                            fontSize: '0.8rem',
                            color: '#1E293B',
                            fontWeight: 600,
                            background: '#F8FAFC',
                            padding: '6px 12px',
                            borderRadius: '8px',
                            border: '1px solid #E2E8F0',
                            flex: 1
                        }}>
                            {node.patientTrigger}
                        </div>
                    </div>

                    {/* Flecha Conectora de Decisión */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingLeft: '8px' }}>
                        <ArrowRight size={14} color="#94A3B8" />
                        <span style={{ fontSize: '0.7rem', color: '#64748B', fontWeight: 600 }}>
                            {node.systemAction}
                        </span>
                    </div>

                    {/* Fila 2: Respuesta Predeterminada del Bot */}
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                        <div style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: '#ECFDF5',
                            color: '#059669',
                            fontSize: '0.7rem',
                            fontWeight: 800,
                            whiteSpace: 'nowrap',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px'
                        }}>
                            🤖 Bot ({botName})
                        </div>
                        <div style={{
                            fontSize: '0.78rem',
                            color: '#064E3B',
                            background: '#F0FDF4',
                            padding: '10px 14px',
                            borderRadius: '10px',
                            border: '1px solid #BBF7D0',
                            lineHeight: 1.45,
                            whiteSpace: 'pre-wrap',
                            flex: 1
                        }}>
                            {node.botResponse.replace(/\{bot_name\}/g, botName)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Renderizado de Ramas Hijas (Recursivo o Anidado) */}
            {hasChildren && isExpanded && (
                <div style={{
                    paddingLeft: '32px',
                    borderLeft: '2px dashed #CBD5E1',
                    marginLeft: '24px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '16px'
                }}>
                    {children.map(child => (
                        <TreeNodeCard
                            key={child.id}
                            node={child}
                            allNodes={allNodes}
                            selectedNodeId={selectedNodeId}
                            expandedNodeIds={expandedNodeIds}
                            onSelectNode={onSelectNode}
                            onToggleExpand={onToggleExpand}
                            onStartEdit={onStartEdit}
                            onTestNode={onTestNode}
                            onCopyResponse={onCopyResponse}
                            copiedNodeId={copiedNodeId}
                            botName={botName}
                            filterCategory={filterCategory}
                            searchQuery={searchQuery}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}

/**
 * Fila compacta para la vista de lista
 */
function CompactNodeRow({
    node,
    isSelected,
    onSelect,
    onStartEdit,
    onTest,
    onCopy,
    copied,
    botName
}) {
    const categoryInfo = BOT_TREE_CATEGORIES[node.category] || BOT_TREE_CATEGORIES.inicio;

    return (
        <div 
            onClick={onSelect}
            style={{
                background: '#FFFFFF',
                borderRadius: '10px',
                border: isSelected ? '2px solid #0284C7' : '1px solid #E2E8F0',
                padding: '12px 16px',
                cursor: 'pointer',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '14px',
                transition: 'all 0.15s ease'
            }}
        >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
                <span style={{
                    fontSize: '0.68rem',
                    fontWeight: 800,
                    padding: '2px 8px',
                    borderRadius: '6px',
                    background: categoryInfo.bg,
                    color: categoryInfo.color,
                    border: `1px solid ${categoryInfo.border}`,
                    whiteSpace: 'nowrap'
                }}>
                    Nivel {node.level} • {categoryInfo.label}
                </span>

                <div style={{ minWidth: 0 }}>
                    <h5 style={{ margin: 0, fontSize: '0.85rem', fontWeight: 800, color: '#0F2942' }}>
                        {node.title}
                    </h5>
                    <p style={{ margin: '2px 0 0 0', fontSize: '0.74rem', color: '#64748B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        🗣️ <strong style={{ color: '#334155' }}>Entrada:</strong> {node.patientTrigger}
                    </p>
                </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onTest();
                    }}
                    style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#ECFDF5',
                        border: '1px solid #A7F3D0',
                        color: '#059669',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                    }}
                >
                    <Play size={11} />
                    Probar
                </button>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        onStartEdit();
                    }}
                    style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: '#F8FAFC',
                        border: '1px solid #CBD5E1',
                        color: '#475569',
                        fontSize: '0.7rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                    }}
                >
                    <Edit3 size={11} />
                    Editar
                </button>
            </div>
        </div>
    );
}
