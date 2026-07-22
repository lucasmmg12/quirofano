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
                    <div className="bg-white p-3 rounded-lg shadow-lg border border-slate-200 w-64 text-sm z-50 pointer-events-none">
                        <div className="font-bold text-slate-700 mb-1">
                            {new Date(data.fecha).toLocaleString('es-AR')}
                        </div>
                        <div className="text-slate-600 max-h-40 overflow-y-auto">
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
                    <div className="bg-amber-50 p-3 rounded-lg shadow-lg border border-amber-200 w-64 text-sm z-50 pointer-events-none">
                        <div className="font-bold text-amber-800 mb-1 border-b border-amber-200 pb-1">
                            Foja Quirúrgica
                        </div>
                        <div className="text-amber-900 mt-1">
                            <span className="font-semibold">Cirujano:</span> {data.cirujano || 'N/A'}
                        </div>
                        <div className="text-amber-900">
                            <span className="font-semibold">Procedimiento:</span> {data.procedimiento || 'N/A'}
                        </div>
                        <div className="text-amber-900">
                            <span className="font-semibold">Diagnóstico:</span> {data.diagnostico || 'N/A'}
                        </div>
                        <div className="text-amber-900 mt-1 text-xs text-amber-700">
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
            <div className="flex items-center justify-center h-full w-full bg-slate-50 text-slate-500 rounded-lg border border-slate-200">
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
        <div className="w-full h-full bg-slate-900 rounded-lg overflow-hidden relative">
            <div className="absolute top-4 left-4 z-10 bg-black/50 text-white px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md">
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
