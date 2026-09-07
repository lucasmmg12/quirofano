import React, { useEffect, useRef } from 'react';
import mermaid from 'mermaid';

mermaid.initialize({
    startOnLoad: false,
    theme: 'default',
    securityLevel: 'loose',
});

export default function MermaidRenderer({ chart }) {
    const containerRef = useRef(null);

    useEffect(() => {
        if (chart && containerRef.current) {
            try {
                // Clear previous content
                containerRef.current.innerHTML = '';
                
                // Render new chart
                mermaid.render(`mermaid-${Math.random().toString(36).substring(2)}`, chart).then(({ svg }) => {
                    if (containerRef.current) {
                        containerRef.current.innerHTML = svg;
                    }
                }).catch(err => {
                    console.error("Mermaid Render Error:", err);
                    if (containerRef.current) {
                        containerRef.current.innerHTML = `<div style="color: red; padding: 10px; border: 1px solid red;">Error renderizando diagrama. Código inválido generado por IA.</div><pre style="font-size:10px">${chart}</pre>`;
                    }
                });
            } catch (err) {
                console.error("Mermaid sync Error:", err);
            }
        }
    }, [chart]);

    return (
        <div 
            ref={containerRef} 
            className="mermaid-container"
            style={{ 
                width: '100%', 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center',
                overflow: 'auto',
                padding: '20px'
            }}
        />
    );
}
