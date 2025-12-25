import { useState, useEffect, useRef, useCallback } from 'react';
import { GestureType, HandGestureState } from '@/types/christmas';
// ✨ 改动1：必须引入 HandLandmarker，而不是 GestureRecognizer
import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

interface UseHandGestureOptions {
  enabled: boolean;
  onGestureChange?: (gesture: GestureType) => void;
}

export function useHandGesture({ enabled, onGestureChange }: UseHandGestureOptions) {
  const [state, setState] = useState<HandGestureState>({
    gesture: 'none',
    handPosition: null,
    pinchDistance: 1,
    isTracking: false,
  });
  const [status, setStatus] = useState<string>('idle');
  
  const videoRef = useRef<HTMLVideoElement | null>(null);
  // ✨ 改动2：类型必须是 HandLandmarker
  const handLandmarkerRef = useRef<HandLandmarker | null>(null);
  const lastGestureRef = useRef<GestureType>('none');
  const animationFrameIdRef = useRef<number | null>(null);

  const onGestureChangeRef = useRef(onGestureChange);
  onGestureChangeRef.current = onGestureChange;

  // ✨ 几何计算：完全靠算手指距离，不需要大模型
  const calculateFingerDistance = useCallback((landmarks: any[], finger1: number, finger2: number) => {
    const p1 = landmarks[finger1];
    const p2 = landmarks[finger2];
    return Math.sqrt(
      Math.pow(p1.x - p2.x, 2) + 
      Math.pow(p1.y - p2.y, 2) + 
      Math.pow(p1.z - p2.z, 2)
    );
  }, []);

  // ✨ 手势判断逻辑
  const detectGesture = useCallback((landmarks: any[]): GestureType => {
    if (!landmarks || landmarks.length < 21) return 'none';

    // 1. Pinch (捏合): 拇指(4)与食指(8)距离 < 0.06
    const pinchDist = calculateFingerDistance(landmarks, 4, 8);
    if (pinchDist < 0.06) {
      return 'pinch';
    }

    // 2. 判断手指伸缩 (用于区分 Open 和 Fist)
    // y 越小越靠上。指尖 < 关节 = 伸直
    const indexExtended = landmarks[8].y < landmarks[5].y;
    const middleExtended = landmarks[12].y < landmarks[9].y;
    const ringExtended = landmarks[16].y < landmarks[13].y;
    const pinkyExtended = landmarks[20].y < landmarks[17].y;

    const extendedCount = [indexExtended, middleExtended, ringExtended, pinkyExtended].filter(Boolean).length;

    if (extendedCount >= 3) return 'open'; // 张开
    if (extendedCount <= 1) return 'fist'; // 握拳

    return 'none';
  }, [calculateFingerDistance]);

  useEffect(() => {
    if (!enabled) return;

    let stream: MediaStream | null = null;
    let mounted = true;

    const initHandLandmarker = async () => {
      try {
        setStatus('loading-model');
        console.log('[Gesture] Initializing HandLandmarker (Lite Mode)...');

        const vision = await FilesetResolver.forVisionTasks('/wasm');

        // ✨ 改动3：创建 HandLandmarker 实例
        handLandmarkerRef.current = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: '/models/hand_landmarker.task', 
            delegate: 'GPU', // 如果手机端还报错，这里改成 'CPU'
          },
          runningMode: 'VIDEO',
          numHands: 1,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        setStatus('requesting-camera');

        // ... 摄像头逻辑 (保持不变) ...
        const constraints = {
            video: {
              width: { ideal: 640 },
              height: { ideal: 480 },
              facingMode: 'user',
            },
          };
  
        stream = await navigator.mediaDevices.getUserMedia(constraints);
        
        const video = document.createElement('video');
        video.style.display = 'none';
        video.autoplay = true;
        video.playsInline = true;
        video.muted = true;
        video.srcObject = stream;
        
        await new Promise((resolve) => {
          video.onloadedmetadata = () => {
            video.play().then(resolve);
          };
        });

        videoRef.current = video;
        document.body.appendChild(video);
        setStatus('active');

        // ... 侦测循环 ...
        const detectFrame = () => {
          if (!mounted || !videoRef.current || !handLandmarkerRef.current) return;

          if (videoRef.current.readyState >= 2) {
            // ✨ 改动4：API 变成了 detectForVideo
            const results = handLandmarkerRef.current.detectForVideo(
              videoRef.current,
              Date.now()
            );

            processResults(results);
          }
          
          animationFrameIdRef.current = requestAnimationFrame(detectFrame);
        };

        detectFrame();

      } catch (error) {
        console.error('[Gesture] Initialization failed:', error);
        setStatus('error');
        setState(prev => ({ ...prev, isTracking: false }));
      }
    };

    const processResults = (results: any) => {
      if (results.landmarks && results.landmarks.length > 0) {
        const landmarks = results.landmarks[0];
        
        // ✨ 改动5：使用上面写的几何算法判断手势
        const detectedGesture = detectGesture(landmarks);

        if (detectedGesture !== lastGestureRef.current) {
          console.log('[Gesture] New:', detectedGesture);
          lastGestureRef.current = detectedGesture;
          onGestureChangeRef.current?.(detectedGesture);
        }

        const palmBase = landmarks[0];
        const middleFingerMcp = landmarks[9];
        const centerX = (palmBase.x + middleFingerMcp.x) / 2;
        const centerY = (palmBase.y + middleFingerMcp.y) / 2;
        const pinchDist = calculateFingerDistance(landmarks, 4, 8);

        setState({
          isTracking: true,
          gesture: detectedGesture,
          handPosition: { x: 1 - centerX, y: centerY }, 
          pinchDistance: pinchDist
        });

      } else {
        if (state.isTracking) {
           setState(prev => ({ ...prev, isTracking: false, gesture: 'none' }));
        }
      }
    };

    initHandLandmarker();

    return () => {
      mounted = false;
      if (animationFrameIdRef.current) cancelAnimationFrame(animationFrameIdRef.current);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
        videoRef.current.remove();
      }
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      if (handLandmarkerRef.current) {
        handLandmarkerRef.current.close();
      }
    };
  }, [enabled, calculateFingerDistance, detectGesture]);

  return { ...state, status };
}