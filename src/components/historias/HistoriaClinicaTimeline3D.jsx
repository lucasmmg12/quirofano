import { useState, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Text, Box, Sphere } from '@react-three/drei';

function TimelineEvolucion({ data, xPos, index }) {
    const [hovered, setHovered] = useState(false);
    
    // Alternar altura para que no se superpongan si están muy juntas
    const yPos = index % 2 === 0 ? 1 : -1;

    return (
        <group position={[xPos, yPos, 0]}>
            <Sphere 
                args={[0.2, 16, 16]} 
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
            >
                <meshStandardMaterial color={hovered ? "#3b82f6" : "#60a5fa"} />
            </Sphere>

            {/* Linea que conecta al eje */}
            <mesh position={[0, -yPos/2, 0]}>
                <cylinderGeometry args={[0.02, 0.02, Math.abs(yPos)]} />
                <meshBasicMaterial color="#94a3b8" />
            </mesh>

            {hovered && (
                <Html position={[0, 0.5, 0]} center zIndexRange={[100, 0]}>
                    <div style={{ background: '#fff', padding: '12px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', width: '16rem', fontSize: '0.875rem', zIndex: 50, pointerEvents: 'none' }}>
                        <div style={{ fontWeight: 700, color: '#334155', marginBottom: '4px' }}>
                            {new Date(data.fecha).toLocaleString('es-AR')}
                        </div>
                        <div style={{ color: '#475569', maxHeight: '10rem', overflowY: 'auto' }}>
                            {data.texto}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

function TimelineFoja({ data, startX, endX }) {
    const width = Math.max(endX - startX, 0.5); // Min width 0.5
    const centerX = startX + (width / 2);
    
    const [hovered, setHovered] = useState(false);

    return (
        <group position={[centerX, 0, 0]}>
            <Box 
                args={[width, 0.6, 0.6]}
                onPointerOver={() => setHovered(true)}
                onPointerOut={() => setHovered(false)}
            >
                <meshStandardMaterial color={hovered ? "#f59e0b" : "#fbbf24"} transparent opacity={0.8} />
            </Box>
            
            {hovered && (
                <Html position={[0, 1, 0]} center zIndexRange={[100, 0]}>
                    <div style={{ background: '#fffbeb', padding: '12px', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', border: '1px solid #fde68a', width: '16rem', fontSize: '0.875rem', zIndex: 50, pointerEvents: 'none' }}>
                        <div style={{ fontWeight: 700, color: '#92400e', marginBottom: '4px', borderBottom: '1px solid #fde68a', paddingBottom: '4px' }}>
                            Foja Quirúrgica
                        </div>
                        <div style={{ color: '#78350f', marginTop: '4px' }}>
                            <span style={{ fontWeight: 600 }}>Cirujano:</span> {data.cirujano || 'N/A'}
                        </div>
                        <div style={{ color: '#78350f' }}>
                            <span style={{ fontWeight: 600 }}>Procedimiento:</span> {data.procedimiento || 'N/A'}
                        </div>
                        <div style={{ color: '#78350f' }}>
                            <span style={{ fontWeight: 600 }}>Diagnóstico:</span> {data.diagnostico || 'N/A'}
                        </div>
                        <div style={{ color: '#b45309', marginTop: '4px', fontSize: '0.75rem' }}>
                            {new Date(data.hora_comienzo || data.fecha_cirugia).toLocaleTimeString('es-AR')} - 
                            {data.hora_finalizacion ? new Date(data.hora_finalizacion).toLocaleTimeString('es-AR') : 'N/A'}
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

export default function HistoriaClinicaTimeline3D({ admissionData }) {
    if (!admissionData || (admissionData.evoluciones.length === 0 && admissionData.fojas.length === 0)) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', width: '100%', background: '#f8fafc', color: '#64748b', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                No hay datos de evolución para esta admisión.
            </div>
        );
    }

    // Calcular min/max fecha para escalar
    const { minTime, maxTime, range } = useMemo(() => {
        let min = Infinity;
        let max = -Infinity;

        admissionData.evoluciones.forEach(e => {
            const t = new Date(e.fecha).getTime();
            if (t < min) min = t;
            if (t > max) max = t;
        });

        admissionData.fojas.forEach(f => {
            const tStart = new Date(f.hora_comienzo || f.fecha_cirugia).getTime();
            const tEnd = f.hora_finalizacion ? new Date(f.hora_finalizacion).getTime() : tStart + (1000 * 60 * 60); // Asume 1 hora si no hay fin
            if (tStart < min) min = tStart;
            if (tEnd > max) max = tEnd;
        });

        // Margen de 5%
        const timeRange = Math.max(max - min, 1000 * 60 * 60); // Min 1 hora de rango
        return {
            minTime: min - (timeRange * 0.05),
            maxTime: max + (timeRange * 0.05),
            range: timeRange * 1.1
        };
    }, [admissionData]);

    const TOTAL_WIDTH = 20; // 20 units en 3D
    const START_X = -10;

    const getXPos = (timestamp) => {
        const pct = (timestamp - minTime) / range;
        return START_X + (pct * TOTAL_WIDTH);
    };

    return (
        <div style={{ width: '100%', height: '100%', background: '#0f172a', borderRadius: '8px', overflow: 'hidden', position: 'relative' }}>
            <div style={{ position: 'absolute', top: '16px', left: '16px', zIndex: 10, background: 'rgba(0,0,0,0.5)', color: '#fff', padding: '6px 12px', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 600, backdropFilter: 'blur(12px)' }}>
                Línea de Tiempo 3D: Admisión {admissionData.numero_admision}
            </div>
            
            <Canvas camera={{ position: [0, 2, 10], fov: 50 }}>
                <ambientLight intensity={0.5} />
                <directionalLight position={[10, 10, 5]} intensity={1} />
                
                {/* Eje central (Línea de tiempo base) */}
                <mesh position={[0, 0, 0]}>
                    <cylinderGeometry args={[0.05, 0.05, TOTAL_WIDTH]} />
                    <meshStandardMaterial color="#475569" />
                </mesh>
                <mesh position={[0, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
                     <cylinderGeometry args={[0.05, 0.05, TOTAL_WIDTH]} />
                     <meshStandardMaterial color="#475569" />
                </mesh>

                {/* Fojas Quirúrgicas */}
                {admissionData.fojas.map((f, i) => {
                    const tStart = new Date(f.hora_comienzo || f.fecha_cirugia).getTime();
                    const tEnd = f.hora_finalizacion ? new Date(f.hora_finalizacion).getTime() : tStart + (1000 * 60 * 60);
                    return (
                        <TimelineFoja 
                            key={`fq-${i}`} 
                            data={f} 
                            startX={getXPos(tStart)} 
                            endX={getXPos(tEnd)} 
                        />
                    );
                })}

                {/* Evoluciones */}
                {admissionData.evoluciones.map((e, i) => (
                    <TimelineEvolucion 
                        key={`evol-${i}`} 
                        data={e} 
                        xPos={getXPos(new Date(e.fecha).getTime())} 
                        index={i}
                    />
                ))}

                <OrbitControls 
                    enableZoom={true} 
                    enablePan={true}
                    minDistance={2}
                    maxDistance={20}
                    maxPolarAngle={Math.PI / 2 + 0.5} // Permitir ver un poco desde abajo
                />
            </Canvas>
        </div>
    );
}
