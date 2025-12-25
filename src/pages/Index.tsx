import { useState, useCallback, useEffect, lazy, Suspense, useRef } from 'react';
import { GestureIndicator } from '@/components/christmas/GestureIndicator';
import { AudioControl } from '@/components/christmas/AudioControl';
import { PhotoUpload } from '@/components/christmas/PhotoUpload';
import { InstructionsOverlay } from '@/components/christmas/InstructionsOverlay';
import { CameraDebug } from '@/components/christmas/CameraDebug';
import { LoadingScreen } from '@/components/christmas/LoadingScreen';
import { CustomTextOverlay } from '@/components/christmas/CustomTextOverlay';
import { useHandGesture } from '@/hooks/useHandGesture';
import { useMouseFallback } from '@/hooks/useMouseFallback';
import { useChristmasAudio } from '@/hooks/useChristmasAudio';
import { TreeState, GestureType } from '@/types/christmas';
import { Github } from 'lucide-react';

// Lazy load heavy 3D scene
const ChristmasScene = lazy(() => import('@/components/christmas/Scene').then(m => ({ default: m.ChristmasScene })));

// Reading URL parameters helper
const getUrlParameter = (name: string) => {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
};

const Index = () => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [treeState, setTreeState] = useState<TreeState>('tree');
  const [photos, setPhotos] = useState<string[]>([
    '/Photos/1.jpg',
    '/Photos/2.jpg',
    '/Photos/3.jpg',
    '/Photos/4.jpg',
    '/Photos/5.jpg',
    '/Photos/6.jpg',
    '/Photos/7.jpg',
    '/Photos/8.jpg',
    '/Photos/9.jpg',
    '/Photos/10.jpg',
    '/Photos/11.jpg',
    '/Photos/12.jpg',
    
  ]);
  const [focusedPhotoIndex, setFocusedPhotoIndex] = useState<number | null>(null);
  const [orbitRotation, setOrbitRotation] = useState({ x: 0, y: 0 });
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied' | 'requesting'>('prompt');
  const [showInstructions, setShowInstructions] = useState(true);
  
  // Initialize text with URL parameter support
  const [customText, setCustomText] = useState(getUrlParameter('name') || '小齐宝宝 圣诞节快乐!');
  
  const [isStarFocused, setIsStarFocused] = useState(false);
  
  // Use refs for values accessed in callbacks to prevent re-renders
  const treeStateRef = useRef(treeState);
  const photosRef = useRef(photos);
  treeStateRef.current = treeState;
  photosRef.current = photos;

  // Simulate loading progress
  useEffect(() => {
    const interval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 95) {
          clearInterval(interval);
          return prev;
        }
        return prev + Math.random() * 20;
      });
    }, 300);
    return () => clearInterval(interval);
  }, []);

  const handleSceneReady = useCallback(() => {
    setLoadingProgress(100);
  }, []);

  const audio = useChristmasAudio();

  // 🖐️ Core Gesture Logic (Used by both Hand and Mouse)
  const handleGestureChange = useCallback((gesture: GestureType) => {
    const currentTreeState = treeStateRef.current;
    const currentPhotos = photosRef.current;
    
    switch (gesture) {
      case 'fist':
        setTreeState('tree');
        setFocusedPhotoIndex(null);
        break;
      case 'open':
        setTreeState('galaxy');
        setFocusedPhotoIndex(null);
        break;
      case 'pinch':
        // ✨ PINCH LOGIC: Toggle Focus Mode
        if (currentTreeState === 'galaxy') {
          const photoCount = currentPhotos.length > 0 ? currentPhotos.length : 12;
          const randomIndex = Math.floor(Math.random() * Math.min(photoCount, 12));
          setFocusedPhotoIndex(randomIndex);
          setTreeState('focus');
        } else if (currentTreeState === 'focus') {
          setFocusedPhotoIndex(null);
          setTreeState('galaxy');
        }
        break;
    }
  }, []);

  const handleRequestCamera = useCallback(async () => {
    console.log('[Index] Requesting camera permission...');
    setCameraPermission('requesting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user'
        } 
      });
      console.log('[Index] Camera permission granted!');
      stream.getTracks().forEach(track => track.stop());
      setCameraPermission('granted');
    } catch (error) {
      console.error('[Index] Camera permission denied:', error);
      setCameraPermission('denied');
    }
  }, []);

  // Hand gesture hook
  const handGesture = useHandGesture({
    enabled: cameraPermission === 'granted',
    onGestureChange: handleGestureChange,
  });

  // Mouse fallback hook
  // ✨ 1. Pass handleGestureChange to let mouse trigger "Pinch" actions
  const { simulatedGesture } = useMouseFallback({
    enabled: !handGesture.isTracking,
    currentState: treeState,
    onStateChange: setTreeState,
    onOrbitChange: setOrbitRotation,
    onGestureChange: handleGestureChange, // <--- 关键连接：让鼠标也能调用上面的 switch 逻辑
  });

  // Update orbit from hand position
  useEffect(() => {
    if (handGesture.isTracking && handGesture.handPosition && treeState === 'galaxy') {
      setOrbitRotation({
        x: (handGesture.handPosition.y - 0.5) * Math.PI * 0.5,
        y: (handGesture.handPosition.x - 0.5) * Math.PI * 2,
      });
    }
  }, [handGesture.handPosition, handGesture.isTracking, treeState]);

  const handleDismissInstructions = useCallback(() => {
    setShowInstructions(false);
    audio.play();
  }, [audio]);

  const currentDisplayGesture = handGesture.isTracking 
    ? handGesture.gesture 
    : simulatedGesture;

  return (
    <div className="relative w-full h-screen overflow-hidden bg-background">
      {!isLoaded && (
        <LoadingScreen 
          progress={loadingProgress} 
          onLoaded={() => setIsLoaded(true)} 
        />
      )}

      <Suspense fallback={null}>
        <ChristmasScene
          state={treeState}
          photos={photos}
          focusedPhotoIndex={focusedPhotoIndex}
          orbitRotation={orbitRotation}
          handPosition={handGesture.isTracking ? handGesture.handPosition : null}
          // ✨ 2. No longer zooming with mouse, set to 0
          zoom={0} 
          onReady={handleSceneReady}
          onStarFocusChange={setIsStarFocused}
        />
      </Suspense>

      {isLoaded && (
        <>
          <GestureIndicator
            gesture={currentDisplayGesture as GestureType} 
            isTracking={handGesture.isTracking}
            usingMouse={!handGesture.isTracking}
            cameraPermission={cameraPermission}
            mediapipeStatus={handGesture.status}
            onRequestCamera={handleRequestCamera}
          />
          {/* ✨ GitHub Icon - 放在右上角 */}
          <a
            href="https://github.com/AlxJiachen/christmastree" // 👈 记得改成你真实的 GitHub 链接
            target="_blank"
            rel="noopener noreferrer"
            className="absolute top-4 right-4 z-50 p-3 bg-black/20 backdrop-blur-sm rounded-full text-white/80 hover:text-white hover:bg-black/40 hover:scale-110 transition-all duration-300 cursor-pointer"
            title="View Source Code"
          >
            <Github size={24} />
          </a>
          <AudioControl
            isPlaying={audio.isPlaying}
            isMuted={audio.isMuted}
            onToggle={audio.toggle}
            onMuteToggle={audio.toggleMute}
          />

          <PhotoUpload
            photos={photos}
            onPhotosChange={setPhotos}
          />

          <CameraDebug enabled={cameraPermission === 'granted'} />

          {showInstructions && (
            <InstructionsOverlay onDismiss={handleDismissInstructions} />
          )}

          <CustomTextOverlay
            isVisible={isStarFocused}
            text={customText}
            onTextChange={setCustomText}
          />
        </>
      )}
    </div>
  );
};

export default Index;