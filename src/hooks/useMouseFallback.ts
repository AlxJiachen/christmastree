import { useState, useEffect, useCallback, useRef } from 'react';
import { TreeState, GestureType } from '@/types/christmas';

interface UseMouseFallbackOptions {
  enabled: boolean;
  currentState: TreeState;
  onStateChange: (state: TreeState) => void;
  onOrbitChange: (rotation: { x: number; y: number }) => void;
  onGestureChange?: (gesture: GestureType) => void;
}

export function useMouseFallback({
  enabled,
  currentState,
  onStateChange,
  onOrbitChange,
  onGestureChange,
}: UseMouseFallbackOptions) {
  const [isDragging, setIsDragging] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0.5, y: 0.5 });
  const [simulatedGesture, setSimulatedGesture] = useState<GestureType>('none');

  // --- Refs ---
  const lastClickRef = useRef<number>(0);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const rotationRef = useRef({ x: 0, y: 0 });
  
  const isPinchingRef = useRef(false);
  
  // 触摸专用 Refs
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const initialPinchDistRef = useRef<number | null>(null);

  // ==============================
  // 🖱️ 鼠标逻辑 (电脑端)
  // ==============================

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!enabled) return;
    
    // 1. 双键齐按 = 触发 Pinch (选中/放大)
    if (e.buttons === 3) {
      if (!isPinchingRef.current) {
        setSimulatedGesture('pinch');
        onGestureChange?.('pinch');
        isPinchingRef.current = true;
      }
      lastClickRef.current = 0; 
      return;
    }

    // 2. 单键逻辑
    const now = Date.now();
    const timeSinceLastClick = now - lastClickRef.current;
    
    // 左键双击切换 Galaxy/Tree (仅在非 Focus 模式下)
    if (e.button === 0 && timeSinceLastClick < 300) {
      if (currentState !== 'focus') {
        onStateChange(currentState === 'tree' ? 'galaxy' : 'tree');
      } else {
        // 如果在看照片，双击直接退出到 Galaxy
        onStateChange('galaxy');
      }
      lastClickRef.current = 0;
      return;
    }
    
    lastClickRef.current = now;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    setSimulatedGesture('open');
  }, [enabled, currentState, onStateChange, onGestureChange]);

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!enabled) return;

    // 双键保持中 (Pinch)
    if (e.buttons === 3) {
       if (simulatedGesture !== 'pinch') setSimulatedGesture('pinch');
       return;
    }

    // 左键拖拽旋转 (Rotate)
    // ✨ 修改：只要不是在看照片(focus)，无论是树还是星空，都能旋转！
    if (isDragging && e.buttons === 1 && currentState !== 'focus') {
      if (simulatedGesture !== 'open') setSimulatedGesture('open');

      const deltaX = (e.clientX - dragStartRef.current.x) * 0.002;
      const deltaY = (e.clientY - dragStartRef.current.y) * 0.002;
      
      rotationRef.current = {
        x: rotationRef.current.x + deltaY,
        y: rotationRef.current.y + deltaX,
      };
      
      onOrbitChange(rotationRef.current);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [enabled, isDragging, currentState, onOrbitChange, simulatedGesture]);

  const handleMouseUp = useCallback((e: MouseEvent) => {
    if (e.buttons !== 3) isPinchingRef.current = false;

    if (e.buttons === 0) {
      setIsDragging(false);
      setSimulatedGesture('none');
    } else if (e.buttons === 1) {
      setSimulatedGesture('open');
      dragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  }, []);

  // ==============================
  // 📱 触摸逻辑 (手机端)
  // ==============================

  const handleTouchStart = useCallback((e: TouchEvent) => {
    if (!enabled) return;

    // 单指按下：准备旋转
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      setSimulatedGesture('open');
    } 
    // 双指按下：准备捏合
    else if (e.touches.length === 2) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const dist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      initialPinchDistRef.current = dist;
      setSimulatedGesture('pinch'); 
    }
  }, [enabled]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!enabled) return;
    if (e.cancelable) e.preventDefault();

    // 1. 单指拖动 = 旋转
    // ✨ 修改：只要不是 Focus 模式，树和星空都能转
    if (e.touches.length === 1 && currentState !== 'focus' && lastTouchRef.current) {
      const touch = e.touches[0];
      // 手机灵敏度优化
      const deltaX = (touch.clientX - lastTouchRef.current.x) * 0.004; 
      const deltaY = (touch.clientY - lastTouchRef.current.y) * 0.004;

      rotationRef.current = {
        x: rotationRef.current.x + deltaY,
        y: rotationRef.current.y + deltaX,
      };

      onOrbitChange(rotationRef.current);
      lastTouchRef.current = { x: touch.clientX, y: touch.clientY };
      
      if (simulatedGesture !== 'open') setSimulatedGesture('open');
    }

    // 2. 双指移动 = 检测捏合 (触发 Focus)
    if (e.touches.length === 2 && initialPinchDistRef.current) {
      const p1 = e.touches[0];
      const p2 = e.touches[1];
      const currentDist = Math.hypot(p1.clientX - p2.clientX, p1.clientY - p2.clientY);
      const delta = Math.abs(currentDist - initialPinchDistRef.current);

      if (delta > 15) { // 稍微降低一点阈值，让操作更容易
        if (!isPinchingRef.current) {
          onGestureChange?.('pinch');
          isPinchingRef.current = true;
          initialPinchDistRef.current = currentDist; 
        }
        if (simulatedGesture !== 'pinch') setSimulatedGesture('pinch');
      }
    }
  }, [enabled, currentState, onOrbitChange, onGestureChange, simulatedGesture]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length === 0) {
      setSimulatedGesture('none');
      lastTouchRef.current = null;
      initialPinchDistRef.current = null;
      isPinchingRef.current = false;
    } else if (e.touches.length === 1) {
      setSimulatedGesture('open');
      lastTouchRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isPinchingRef.current = false;
    }
  }, []);

  // ==============================
  // 🎧 事件绑定
  // ==============================

  useEffect(() => {
    if (!enabled) return;

    // Mouse
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', (e) => e.preventDefault());

    // Touch
    window.addEventListener('touchstart', handleTouchStart, { passive: false });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', (e) => e.preventDefault());

      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [enabled, handleMouseDown, handleMouseMove, handleMouseUp, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    isDragging,
    mousePosition,
    simulatedGesture,
  };
}