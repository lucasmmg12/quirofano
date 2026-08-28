import React, { useState, useEffect, useRef } from 'react';
import { getShareData, sendShareChat } from '../../api/shareClient';
import { 
    MessageSquare, 
    ChevronDown, 
    ChevronUp, 
    Share2, 
    Send, 
    Bot,
    FileText,
    BrainCircuit,
    Loader2
} from 'lucide-react';

export default function PublicRecordView() {
    const token = window.location.pathname.split('/share/')[1];
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    // Chat state
    const [chatMessages, setChatMessages] = useState([
        { role: 'ai', content: '¡Hola! Soy el asistente de este resumen. Pregúntame lo que quieras sobre esta charla.' }
    ]);
    const [inputValue, setInputValue] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const messagesEndRef = useRef(null);

    useEffect(() => {
        const loadData = async () => {
            try {
                const result = await getShareData(token);
                setData(result);
            } catch (e) {
                setError('No se pudo cargar el análisis compartido.');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [token]);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [chatMessages, isTyping]);

    const handleSendMessage = async (e) => {
        e.preventDefault();
        if (!inputValue.trim() || isTyping) return;

        const userMsg = { role: 'user', content: inputValue };
        setChatMessages(prev => [...prev, userMsg]);
        setInputValue('');
        setIsTyping(true);

        try {
            const aiResponse = await sendShareChat(token, userMsg.content);
            setChatMessages(prev => [...prev, { role: 'ai', content: aiResponse.content }]);
        } catch (e) {
            setChatMessages(prev => [...prev, { role: 'ai', content: 'Hubo un error al procesar tu pregunta.' }]);
        } finally {
            setIsTyping(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4 text-blue-600">
                    <Loader2 className="w-8 h-8 animate-spin" />
                    <span className="font-medium">Cargando análisis profundo...</span>
                </div>
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="min-h-screen bg-slate-50 flex items-center justify-center">
                <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 text-center">
                    <p className="text-red-500 font-medium mb-2">Error</p>
                    <p className="text-slate-600">{error || 'Enlace no válido o expirado.'}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50 font-sans flex flex-col md:flex-row">
            {/* Left Column: Analysis */}
            <div className="flex-1 p-6 md:p-8 lg:p-12 overflow-y-auto">
                <div className="max-w-4xl mx-auto space-y-8">
                    
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-6">
                        <div className="flex items-center gap-3">
                            <div className="bg-blue-100 p-2 rounded-lg text-blue-700">
                                <BrainCircuit className="w-6 h-6" />
                            </div>
                            <div>
                                <h1 className="text-2xl font-bold text-slate-800">Análisis Profundo</h1>
                                <p className="text-slate-500 text-sm">
                                    Generado el {new Date(data.createdAt).toLocaleDateString()}
                                </p>
                            </div>
                        </div>
                        <button 
                            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 transition-colors shadow-sm"
                            onClick={() => navigator.clipboard.writeText(window.location.href)}
                        >
                            <Share2 className="w-4 h-4" />
                            <span className="text-sm font-medium">Copiar Link</span>
                        </button>
                    </div>

                    {/* Total Summary */}
                    <section className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
                        <div className="bg-slate-50 px-6 py-4 border-b border-slate-200 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            <h2 className="text-lg font-semibold text-slate-800">Resumen Total de la Charla</h2>
                        </div>
                        <div className="p-6 text-slate-700 leading-relaxed">
                            {data.summary}
                        </div>
                    </section>

                    {/* Specific Analysis Accordion */}
                    <section>
                        <h2 className="text-lg font-semibold text-slate-800 mb-4 flex items-center gap-2">
                            <MessageSquare className="w-5 h-5 text-blue-600" />
                            Desglose por Interacción
                        </h2>
                        <div className="space-y-3">
                            {data.specificAnalysis?.map((item) => (
                                <AnalysisAccordion key={item.id} item={item} />
                            ))}
                        </div>
                    </section>
                </div>
            </div>

            {/* Right Column: Chat over Summary */}
            <div className="w-full md:w-96 bg-white border-l border-slate-200 flex flex-col h-screen shadow-[-4px_0_15px_rgba(0,0,0,0.03)] z-10">
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-3">
                    <div className="bg-blue-600 p-1.5 rounded-full text-white">
                        <Bot className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-semibold text-slate-800">Consultar Resumen</h3>
                        <p className="text-xs text-slate-500">Haz preguntas sobre esta charla</p>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
                    {chatMessages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] rounded-lg p-3 text-sm ${
                                msg.role === 'user' 
                                    ? 'bg-blue-600 text-white shadow-sm' 
                                    : 'bg-white border border-slate-200 text-slate-700 shadow-sm'
                            }`}>
                                {msg.content}
                            </div>
                        </div>
                    ))}
                    {isTyping && (
                        <div className="flex justify-start">
                            <div className="bg-white border border-slate-200 text-slate-500 rounded-lg p-3 shadow-sm flex items-center gap-2">
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" />
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-75" />
                                <span className="w-2 h-2 bg-slate-400 rounded-full animate-bounce delay-150" />
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                <div className="p-4 border-t border-slate-200 bg-white">
                    <form onSubmit={handleSendMessage} className="relative">
                        <input
                            type="text"
                            placeholder="Ej. ¿Qué se dijo sobre...?"
                            value={inputValue}
                            onChange={(e) => setInputValue(e.target.value)}
                            className="w-full pl-4 pr-12 py-3 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-sm"
                            disabled={isTyping}
                        />
                        <button 
                            type="submit"
                            disabled={!inputValue.trim() || isTyping}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors disabled:opacity-50"
                        >
                            <Send className="w-4 h-4" />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}

function AnalysisAccordion({ item }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="bg-white border border-slate-200 rounded-lg shadow-sm overflow-hidden transition-all duration-200">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between p-4 bg-white hover:bg-slate-50 transition-colors"
            >
                <div className="flex items-center gap-3 text-left">
                    <span className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 text-slate-600 text-sm font-semibold">
                        Q
                    </span>
                    <span className="font-medium text-slate-800 line-clamp-1">
                        {item.question}
                    </span>
                </div>
                {isOpen ? <ChevronUp className="w-5 h-5 text-slate-400" /> : <ChevronDown className="w-5 h-5 text-slate-400" />}
            </button>
            
            {isOpen && (
                <div className="p-4 pt-0 border-t border-slate-100">
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                            <p className="text-xs font-semibold text-blue-800 uppercase tracking-wider mb-2">Insight (Intención: {item.intent})</p>
                            <p className="text-sm text-blue-900">{item.insight}</p>
                        </div>
                        <div className="bg-slate-50 p-4 rounded-lg border border-slate-100">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Respuesta Sintetizada</p>
                            <p className="text-sm text-slate-700">{item.ai_response_summary}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
