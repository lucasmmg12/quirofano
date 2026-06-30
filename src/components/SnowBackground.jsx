import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function SnowParticles() {
    const pointsRef = useRef();
    
    // Generar partículas de nieve
    const [positions, speeds, phases] = useMemo(() => {
        const count = 2000;
        const positions = new Float32Array(count * 3);
        const speeds = new Float32Array(count);
        const phases = new Float32Array(count);
        
        for (let i = 0; i < count; i++) {
            positions[i * 3] = (Math.random() - 0.5) * 30; // x
            positions[i * 3 + 1] = (Math.random() - 0.5) * 30; // y
            positions[i * 3 + 2] = (Math.random() - 0.5) * 20; // z
            speeds[i] = 0.05 + Math.random() * 0.1; // speed
            phases[i] = Math.random() * Math.PI * 2; // phase for swaying
        }
        return [positions, speeds, phases];
    }, []);

    useFrame((state, delta) => {
        if (!pointsRef.current) return;
        const posAttr = pointsRef.current.geometry.attributes.position;
        const time = state.clock.getElapsedTime();
        
        for (let i = 0; i < posAttr.count; i++) {
            let y = posAttr.getY(i) - speeds[i] * delta * 50;
            // Balanceo horizontal
            let x = posAttr.getX(i) + Math.sin(time + phases[i]) * 0.02;
            
            // Reciclar la partícula arriba si cae
            if (y < -15) {
                y = 15;
                x = (Math.random() - 0.5) * 30;
            }
            
            posAttr.setX(i, x);
            posAttr.setY(i, y);
        }
        posAttr.needsUpdate = true;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    count={positions.length / 3}
                    array={positions}
                    itemSize={3}
                />
            </bufferGeometry>
            <pointsMaterial
                size={0.15}
                color="#ffffff"
                transparent
                opacity={0.8}
                blending={THREE.AdditiveBlending}
                sizeAttenuation
                depthWrite={false}
            />
        </points>
    );
}

export default function SnowBackground() {
    return (
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, pointerEvents: 'none', zIndex: -1 }}>
            <Canvas camera={{ position: [0, 0, 10], fov: 75 }}>
                <SnowParticles />
            </Canvas>
        </div>
    );
}
