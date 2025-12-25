import { useRef, useEffect, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Sparkles } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';
import { ParticleSystem, GiftBoxes, GemOrnaments, TetrahedronSpiral } from './ParticleSystem';
import { PhotoCards } from './PhotoCards';
import { TreeStar } from './TreeStar';
import { SnowEffect } from './SnowEffect';
import { TreeState } from '@/types/christmas';

// ✨ 新增：接口增加 zoom 属性
interface SceneContentProps {
  state: TreeState;
  photos: string[];
  focusedPhotoIndex: number | null;
  orbitRotation: { x: number; y: number };
  handPosition: { x: number; y: number } | null;
  zoom: number; // <--- 新增
  onStarFocusChange?: (focused: boolean) => void;
}

function CameraController({ 
  state, 
  orbitRotation,
  handPosition,
  zoom, // <--- 接收 zoom
  onStarFocused,
}: { 
  state: TreeState;
  orbitRotation: { x: number; y: number };
  handPosition: { x: number; y: number } | null;
  zoom: number; // <--- 接收 zoom
  onStarFocused?: (focused: boolean) => void;
}) {
  const { camera } = useThree();
  const targetRef = useRef(new THREE.Vector3(0, 0, 0));
  const positionRef = useRef(new THREE.Vector3(0, 2, 12));
  const ribbonTimeRef = useRef(0);
  const prevStateRef = useRef<TreeState>(state);
  const transitionDelayRef = useRef(0);
  const isAtStarRef = useRef(false);
  const hasInitializedRef = useRef(false);
  
  // Physics-based smooth rotation
  const velocityRef = useRef(0);
  const targetVelocityRef = useRef(0.15); 

  // 用来平滑 Zoom 的中间变量
  const smoothZoomRef = useRef(0);

  const findNearestRibbonT = (cameraPos: THREE.Vector3): number => {
    const height = 7;
    const maxRadius = 3.0;
    let nearestT = 0;
    let minDistance = Infinity;
    
    for (let t = 0; t <= 1; t += 0.02) {
      const ribbonY = t * height - height / 2 + 0.3;
      const layerRadius = maxRadius * (1 - t * 0.88) + 0.15;
      const angle = t * Math.PI * 6;
      
      const ribbonX = Math.cos(angle) * layerRadius;
      const ribbonZ = Math.sin(angle) * layerRadius;
      
      const distance = Math.sqrt(
        Math.pow(cameraPos.x - ribbonX, 2) +
        Math.pow(cameraPos.y - ribbonY, 2) +
        Math.pow(cameraPos.z - ribbonZ, 2)
      );
      
      if (distance < minDistance) {
        minDistance = distance;
        nearestT = t;
      }
    }
    
    return nearestT;
  };

  useFrame((_, delta) => {
    // 1. Zoom 平滑处理 (Lerp)
    // 这里的 3 * delta 控制缩放的跟手速度
    smoothZoomRef.current += (zoom - smoothZoomRef.current) * 5 * delta;

    // Detect state change to tree
    if (state === 'tree' && prevStateRef.current !== 'tree') {
      const nearestT = findNearestRibbonT(camera.position);
      
      transitionDelayRef.current = 2.0; 
      ribbonTimeRef.current = nearestT; 
      isAtStarRef.current = false;
      velocityRef.current = 0.05; 
      hasInitializedRef.current = true;
      onStarFocused?.(false);
    }
    
    if (state !== 'tree' && prevStateRef.current === 'tree') {
      isAtStarRef.current = false;
      onStarFocused?.(false);
    }
    prevStateRef.current = state;

    if (transitionDelayRef.current > 0) {
      transitionDelayRef.current -= delta;
    }

    // ✨ 2. 计算基础距离 (把 zoom 加进去)
    // 基础距离 12，加上 zoom 偏移量
    // 限制范围：最近 4，最远 35
    let baseDistance = state === 'tree' ? 12 : 18;
    baseDistance = Math.max(4, Math.min(35, baseDistance + smoothZoomRef.current));
    
    let targetX = 0;
    let targetY = 2;
    let targetZ = baseDistance;
    let lookAtY = 0;
    
    if (state === 'tree' && transitionDelayRef.current <= 0) {
      if (!isAtStarRef.current) {
        const t = ribbonTimeRef.current;
        
        const easeFactor = Math.sin(t * Math.PI); 
        const baseVelocity = 0.05;
        const maxVelocity = 0.12;
        targetVelocityRef.current = baseVelocity + easeFactor * (maxVelocity - baseVelocity);
        
        const acceleration = 2.5; 
        velocityRef.current += (targetVelocityRef.current - velocityRef.current) * acceleration * delta;
        
        ribbonTimeRef.current += velocityRef.current * delta;
        
        if (ribbonTimeRef.current >= 1) {
          isAtStarRef.current = true;
          onStarFocused?.(true);
          ribbonTimeRef.current = 1;
        }
        const tClamped = Math.min(ribbonTimeRef.current, 1);
        
        const height = 7;
        const maxRadius = 3.0;
        const ribbonY = tClamped * height - height / 2 + 0.3;
        const layerRadius = maxRadius * (1 - tClamped * 0.88) + 0.15;
        const angle = tClamped * Math.PI * 6; 
        
        // 当自动攀爬时，我们稍微减弱 zoom 的影响，但也允许轻微推拉
        const cameraDistance = (5 + layerRadius * 1.5) + (smoothZoomRef.current * 0.5);
        const cameraAngle = angle + Math.PI * 0.3; 
        
        targetX = Math.cos(cameraAngle) * cameraDistance;
        targetY = ribbonY + 1.5; 
        targetZ = Math.sin(cameraAngle) * cameraDistance;
        lookAtY = ribbonY;
      } else {
        // 到达顶部 Star
        const starY = 4.4;
        targetX = 0;
        targetY = starY + 1;
        // 允许在看星星的时候缩放
        targetZ = 6 + smoothZoomRef.current;
        lookAtY = starY;
      }
    } else if (handPosition && state === 'galaxy') {
      targetX = (handPosition.x - 0.5) * 20;
      targetY = (0.5 - handPosition.y) * 10 + 2;
      targetZ = Math.cos(orbitRotation.y) * baseDistance;
    } else {
      // 自由旋转模式 (Galaxy Mode)
      // 使用球坐标系，把 zoom 应用到半径上
      targetX = Math.sin(orbitRotation.y) * baseDistance;
      targetY = Math.sin(orbitRotation.x) * 5 + 2;
      targetZ = Math.cos(orbitRotation.y) * baseDistance;
    }
    
    // Frame-rate independent smooth camera movement
    // 增加一点阻尼感，让镜头更有分量
    const smoothFactor = 1 - Math.exp(-2.5 * delta);
    
    positionRef.current.x += (targetX - positionRef.current.x) * smoothFactor;
    positionRef.current.y += (targetY - positionRef.current.y) * smoothFactor;
    positionRef.current.z += (targetZ - positionRef.current.z) * smoothFactor;
    
    targetRef.current.y += (lookAtY - targetRef.current.y) * smoothFactor;
    
    camera.position.copy(positionRef.current);
    camera.lookAt(targetRef.current);
  });

  return null;
}

function SceneContent({ 
  state, 
  photos, 
  focusedPhotoIndex,
  orbitRotation,
  handPosition,
  zoom, // <--- 接收 props
  onStarFocusChange,
}: SceneContentProps) {
  const [isStarFocused, setIsStarFocused] = useState(false);

  const handleStarFocused = (focused: boolean) => {
    setIsStarFocused(focused);
    onStarFocusChange?.(focused);
  };

  return (
    <>
      <CameraController 
        state={state} 
        orbitRotation={orbitRotation}
        handPosition={handPosition}
        zoom={zoom} // <--- 传递给 Controller
        onStarFocused={handleStarFocused}
      />
      
      <ambientLight intensity={0.2} />
      
      <spotLight 
        position={[0, 12, 5]} 
        angle={0.6}
        penumbra={0.8}
        intensity={2.5}
        color="#fff8e8"
      />
      
      <pointLight position={[0, -2, 0]} intensity={1.2} color="#ff6633" distance={12} />
      
      <Stars 
        radius={100} 
        depth={50} 
        count={2000} 
        factor={4} 
        saturation={0.5} 
        fade 
        speed={0.3}
      />

      {/* ✨ 新增：魔法闪烁粒子 (增加氛围感) */}
      <Sparkles 
        count={100} 
        scale={12} 
        size={4} 
        speed={0.4} 
        opacity={0.5} 
        color="#fffeb8"
      />
      
      <ParticleSystem state={state} particleCount={4000} />
      
      <GiftBoxes state={state} />
      
      <GemOrnaments state={state} />
      
      <TetrahedronSpiral state={state} />
      
      <PhotoCards 
        state={state} 
        photos={photos}
        focusedIndex={focusedPhotoIndex}
      />
      
      <TreeStar state={state} isFocused={isStarFocused} />
      
      <SnowEffect active={isStarFocused} />
      
      <EffectComposer>
        <Bloom 
          luminanceThreshold={0.85}
          luminanceSmoothing={0.2}
          intensity={1.5}
          mipmapBlur
        />
        <Vignette
          offset={0.2}
          darkness={0.6}
        />
      </EffectComposer>
    </>
  );
}

// ✨ 更新接口
interface ChristmasSceneProps {
  state: TreeState;
  photos: string[];
  focusedPhotoIndex: number | null;
  orbitRotation: { x: number; y: number };
  handPosition: { x: number; y: number } | null;
  zoom: number; // <--- 新增
  onReady?: () => void;
  onStarFocusChange?: (focused: boolean) => void;
}

export function ChristmasScene({ 
  state, 
  photos, 
  focusedPhotoIndex,
  orbitRotation,
  handPosition,
  zoom, // <--- 接收
  onReady,
  onStarFocusChange,
}: ChristmasSceneProps) {
  
  useEffect(() => {
    const timer = setTimeout(() => {
      onReady?.();
    }, 500);
    return () => clearTimeout(timer);
  }, [onReady]);

  return (
    <Canvas
      camera={{ position: [0, 2, 12], fov: 60 }}
      gl={{ 
        antialias: false,
        alpha: false,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      dpr={[1, 1.5]}
      style={{ background: 'linear-gradient(180deg, #0a1628 0%, #1a0a28 50%, #0a1628 100%)' }}
    >
      <color attach="background" args={['#0a1628']} />
      <fog attach="fog" args={['#0a1628', 15, 35]} />
      
      <SceneContent 
        state={state}
        photos={photos}
        focusedPhotoIndex={focusedPhotoIndex}
        orbitRotation={orbitRotation}
        handPosition={handPosition}
        zoom={zoom} // <--- 传递
        onStarFocusChange={onStarFocusChange}
      />
    </Canvas>
  );
}