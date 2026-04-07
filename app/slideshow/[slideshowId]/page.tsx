'use client';

/**
 * Slideshow Player with Rolling Buffer
 * Version: 2.0.0
 * 
 * Infinite smooth playback with continuous background refresh
 * - Rolling N-slide buffer (configurable)
 * - Fetch 1 candidate per transition (non-blocking)
 * - Image preloading for smooth transitions
 * - Resilient to network failures
 * - Supports 16:9, 1:1 (2x1 mosaic), 9:16 (3x1 mosaic)
 */

import { useEffect, useState, useRef, use } from 'react';

interface Submission {
  _id: string;
  imageUrl: string;
  width: number;
  height: number;
}

interface Slide {
  type: 'single' | 'mosaic';
  aspectRatio: '16:9' | '1:1' | '9:16';
  submissions: Submission[];
}

interface SlideshowSettings {
  _id: string;
  name: string;
  eventName: string;
  transitionDurationMs: number;
  fadeDurationMs: number;
  bufferSize: number;
  refreshStrategy: 'continuous' | 'batch';
}

export default function SlideshowPlayerV2({
  params,
}: {
  params: Promise<{ slideshowId: string }>;
}) {
  const resolvedParams = use(params);
  const { slideshowId } = resolvedParams;

  // Slideshow state with 3-playlist rotation
  const [settings, setSettings] = useState<SlideshowSettings | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [playlistA, setPlaylistA] = useState<Slide[]>([]);
  const [playlistB, setPlaylistB] = useState<Slide[]>([]);
  const [playlistC, setPlaylistC] = useState<Slide[]>([]);
  const [activePlaylist, setActivePlaylist] = useState<'A' | 'B' | 'C'>('A');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Get the currently active playlist
  const getCurrentPlaylist = () => {
    switch (activePlaylist) {
      case 'A': return playlistA;
      case 'B': return playlistB;
      case 'C': return playlistC;
    }
  };
  
  const buffer = getCurrentPlaylist();
  
  // UI state
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [isPlaying, setIsPlaying] = useState(true);
  
  // Refs
  const containerRef = useRef<HTMLDivElement>(null);
  const hideControlsTimeout = useRef<NodeJS.Timeout | null>(null);
  const preloadedImages = useRef<Map<string, HTMLImageElement>>(new Map());
  const isFetchingCandidate = useRef(false);

  // Helper: Get all submission IDs from buffer
  const getBufferSubmissionIds = (): string[] => {
    const ids: string[] = [];
    buffer.forEach(slide => {
      slide.submissions.forEach(sub => ids.push(sub._id));
    });
    return ids;
  };

  // Helper: Preload image
  const preloadImage = (url: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      if (preloadedImages.current.has(url)) {
        resolve();
        return;
      }

      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        preloadedImages.current.set(url, img);
        resolve();
      };
      img.onerror = () => {
        console.warn(`Failed to preload image: ${url}`);
        reject();
      };
      img.src = url;
    });
  };

// Helper: Preload all images in a slide
  const preloadSlide = async (slide: Slide): Promise<void> => {
    console.log(`[Preload] Preloading ${slide.type === 'mosaic' ? slide.aspectRatio : 'single'} slide with ${slide.submissions.length} images`);
    
    const results = await Promise.allSettled(
      slide.submissions.map(async (sub) => {
        try {
          await preloadImage(sub.imageUrl);
          return { success: true, subId: sub._id };
        } catch (error) {
          console.warn(`[Preload] Failed to preload ${sub._id}: ${error}`);
          return { success: false, subId: sub._id };
        }
      })
    );
    
    const failed = results.filter(r => r.status === 'rejected');
    if (failed.length > 0) {
      console.warn(`[Preload] ${failed.length} images failed to preload, mosaic may flicker`);
    } else {
      console.log(`[Preload] All ${results.length} images preloaded successfully`);
    }
  };

  // Initial load: Fetch buffer-sized playlist
  const loadInitialBuffer = async () => {
    try {
      console.log('Loading initial buffer for slideshow:', slideshowId);
      
      const response = await fetch(`/api/slideshows/${slideshowId}/playlist`);
      if (!response.ok) {
        throw new Error(`Failed to load slideshow: ${response.status}`);
      }

      const data = await response.json();
      console.log('Initial playlist loaded:', data.playlist.length, 'slides');

      if (!data.slideshow || !data.playlist) {
        throw new Error('Invalid slideshow data');
      }

      setSettings(data.slideshow);
      
      // Fetch logo for loading-slideshow scenario
      console.log('Slideshow data:', data.slideshow);
      console.log('Event ID for logo fetch:', data.slideshow.eventId);
      if (data.slideshow.eventId) {
        try {
          console.log('Fetching logos for event:', data.slideshow.eventId);
          const logoResponse = await fetch(`/api/events/${data.slideshow.eventId}/logos`);
          console.log('Logo response status:', logoResponse.status);
          if (logoResponse.ok) {
            const logoData = await logoResponse.json();
            console.log('Logo data:', logoData);
            const loadingLogos = logoData.data?.logos?.['loading-slideshow'] || logoData.logos?.['loading-slideshow'] || [];
            console.log('Loading-slideshow logos:', loadingLogos);
            const activeLogo = loadingLogos.find((l: any) => l.isActive);
            console.log('Active logo:', activeLogo);
            if (activeLogo) {
              console.log('Setting logo URL:', activeLogo.imageUrl);
              setLogoUrl(activeLogo.imageUrl);
            }
          }
        } catch (err) {
          console.error('Failed to fetch logo:', err);
        }
      } else {
        console.warn('No eventId in slideshow data');
      }
      
      // STARTUP: Build A, B, C with proper exclusion
      // Images in A cannot be in B, images in A+B cannot be in C
      if (data.playlist.length > 0) {
        console.log('[Startup] Building Playlist A (10 least-played):', data.playlist.length, 'slides...');
        await Promise.all(data.playlist.map(preloadSlide));
        setPlaylistA(data.playlist);
        
        // Get IDs in A to exclude from B
        const idsInA: string[] = [];
        data.playlist.forEach((slide: Slide) => {
          slide.submissions.forEach(sub => idsInA.push(sub._id));
        });
        console.log(`[Startup] Playlist A has ${idsInA.length} images, excluding them from B`);
        
        // Build Playlist B (exclude images in A)
        console.log('[Startup] Building Playlist B (excluding A)...');
        const playlistBData = await fetchAndBuildPlaylistWithExclusions('B', idsInA);
        console.log('[Startup] Playlist B ready');
        
        // Get IDs in B to exclude from C (along with A)
        const idsInB: string[] = [];
        playlistBData.forEach((slide: Slide) => {
          slide.submissions.forEach(sub => idsInB.push(sub._id));
        });
        const excludeForC = [...idsInA, ...idsInB];
        console.log(`[Startup] Playlist B has ${idsInB.length} images, excluding ${excludeForC.length} total from C`);
        
        // Build Playlist C (exclude images in A and B)
        console.log('[Startup] Building Playlist C (excluding A+B)...');
        await fetchAndBuildPlaylistWithExclusions('C', excludeForC);
        console.log('[Startup] Playlist C ready');
        
        // Start playing A
        setActivePlaylist('A');
        console.log('[Startup] Starting playback - A, B, C all have DIFFERENT images');
      }

      setIsLoading(false);
    } catch (err) {
      console.error('Failed to load initial buffer:', err);
      setError(err instanceof Error ? err.message : 'Failed to load slideshow');
      setIsLoading(false);
    }
  };

  // Fetch and build a complete playlist with exclusions
  // excludeIds: images currently locked in other playlists
  const fetchAndBuildPlaylistWithExclusions = async (targetPlaylist: 'A' | 'B' | 'C', excludeIds: string[] = []): Promise<Slide[]> => {
    if (isFetchingCandidate.current) return [];
    
    isFetchingCandidate.current = true;
    
    try {
      console.log(`[Playlist] Building Playlist ${targetPlaylist}...`);
      
      // Build URL with exclusions
      const url = excludeIds.length > 0
        ? `/api/slideshows/${slideshowId}/playlist?exclude=${excludeIds.join(',')}`
        : `/api/slideshows/${slideshowId}/playlist`;
      
      // Fetch fresh playlist from API (recalculated with current play counts + exclusions)
      const response = await fetch(url);
      if (!response.ok) {
        console.warn(`Failed to fetch playlist ${targetPlaylist}:`, response.status);
        return [];
      }
      
      const data = await response.json();
      if (!data.playlist || data.playlist.length === 0) {
        console.warn(`No playlist data returned for ${targetPlaylist}`);
        return [];
      }
      
      console.log(`[Playlist] Preloading ${data.playlist.length} slides for Playlist ${targetPlaylist}...`);
      
      // Preload all images
      await Promise.all(data.playlist.map(preloadSlide));
      
      // Set the target playlist
      switch (targetPlaylist) {
        case 'A':
          setPlaylistA(data.playlist);
          break;
        case 'B':
          setPlaylistB(data.playlist);
          break;
        case 'C':
          setPlaylistC(data.playlist);
          break;
      }
      
      return data.playlist;
    } catch (err) {
      console.error(`Error building playlist ${targetPlaylist}:`, err);
      return [];
    } finally {
      isFetchingCandidate.current = false;
    }
  };
  
  // Backwards compatibility wrapper
  const fetchAndBuildPlaylist = async (targetPlaylist: 'A' | 'B' | 'C'): Promise<Slide[]> => {
    return fetchAndBuildPlaylistWithExclusions(targetPlaylist, []);
  };

  // Update play counts for displayed slide
  // CRITICAL: This must NOT block slideshow advancement, fire-and-forget
  const updatePlayCounts = async (slide: Slide) => {
    try {
      const submissionIds = slide.submissions.map(s => s._id);
      console.log(`[PlayCount] Sending increment request for ${submissionIds.length} images...`);
      
      const response = await fetch(`/api/slideshows/${slideshowId}/played`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionIds }),
      });
      
      if (!response.ok) {
        console.warn(`[PlayCount] API returned ${response.status}`);
      } else {
        const data = await response.json();
        const count = data.updatedCount ?? data.data?.updatedCount;
        console.log(`[PlayCount] ✓ ${count} images incremented`);
      }
    } catch (err) {
      console.error('[PlayCount] ERROR:', err);
      // Do NOT throw - slideshow must continue even if play count fails
    }
  };

  // Load initial buffer on mount
  useEffect(() => {
    loadInitialBuffer();
  }, [slideshowId]);

  // Auto-advance slides with background refresh - instant cuts, no fade
  useEffect(() => {
    if (!settings || !isPlaying || buffer.length === 0) return;

    const currentSlide = buffer[currentIndex];
    console.log(`[Slideshow] Starting slide ${currentIndex + 1}/${buffer.length}, type: ${currentSlide?.type}, aspect: ${currentSlide?.aspectRatio}`);
    console.log(`[Slideshow] Display duration: ${settings.transitionDurationMs}ms`);

    // COUNT PLAY IMMEDIATELY when slide appears on screen
    if (currentSlide) {
      updatePlayCounts(currentSlide);
      console.log(`[PlayCount] Counted ${currentSlide.submissions.length} images now on screen`);
    }

    // Instant cut to next slide after duration
    const advanceTimer = setTimeout(() => {

      // Check if we've reached the end of current playlist
      const nextIndex = currentIndex + 1;
      
      if (nextIndex >= buffer.length) {
        // End of playlist - rotate to next
        console.log(`[Slideshow] End of Playlist ${activePlaylist}, rotating...`);
        
        // Determine next playlist and rebuild the one that just finished
        // A finishes → play B, rebuild A
        // B finishes → play C, rebuild B
        // C finishes → play A, rebuild C
        let nextPlaylist: 'A' | 'B' | 'C';
        let playlistToRebuild: 'A' | 'B' | 'C';
        
        switch (activePlaylist) {
          case 'A':
            nextPlaylist = 'B';
            playlistToRebuild = 'A'; // Rebuild A while B plays
            break;
          case 'B':
            nextPlaylist = 'C';
            playlistToRebuild = 'B'; // Rebuild B while C plays
            break;
          case 'C':
            nextPlaylist = 'A';
            playlistToRebuild = 'C'; // Rebuild C while A plays
            break;
        }
        
        setActivePlaylist(nextPlaylist);
        setCurrentIndex(0);
        console.log(`[Slideshow] Now playing Playlist ${nextPlaylist}, rebuilding Playlist ${playlistToRebuild}`);
        
        // Start building the next playlist in background, excluding images in the two active playlists
        if (settings.refreshStrategy === 'continuous') {
          // Get IDs from the two playlists that are NOT being rebuilt
          const excludeIds: string[] = [];
          
          // Get IDs from both remaining playlists
          const remainingPlaylists = ['A', 'B', 'C'].filter(p => p !== playlistToRebuild) as ('A' | 'B' | 'C')[];
          remainingPlaylists.forEach(p => {
            const playlist = p === 'A' ? playlistA : p === 'B' ? playlistB : playlistC;
            playlist.forEach(slide => {
              slide.submissions.forEach(sub => excludeIds.push(sub._id));
            });
          });
          
          console.log(`[Slideshow] Rebuilding ${playlistToRebuild}, excluding ${excludeIds.length} images from ${remainingPlaylists.join('+')}}`);
          fetchAndBuildPlaylistWithExclusions(playlistToRebuild, excludeIds);
        }
      } else {
        // Continue within current playlist
        setCurrentIndex(nextIndex);
      }
    }, settings.transitionDurationMs);

    return () => {
      clearTimeout(advanceTimer);
    };
  }, [settings, currentIndex, isPlaying, buffer, activePlaylist, playlistA, playlistB, playlistC, slideshowId]);

  // Fullscreen handling
  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Auto-hide controls in fullscreen
  const handleMouseMove = () => {
    if (!isFullscreen) return;
    
    setShowControls(true);
    
    if (hideControlsTimeout.current) {
      clearTimeout(hideControlsTimeout.current);
    }
    
    hideControlsTimeout.current = setTimeout(() => {
      setShowControls(false);
    }, 3000);
  };

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') {
        toggleFullscreen();
      } else if (e.key === ' ') {
        e.preventDefault();
        setIsPlaying(prev => !prev);
      } else if (e.key === 'ArrowRight' && buffer.length > 0) {
        setCurrentIndex((prev) => (prev + 1) % buffer.length);
      } else if (e.key === 'ArrowLeft' && buffer.length > 0) {
        setCurrentIndex((prev) => (prev - 1 + buffer.length) % buffer.length);
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [buffer]);

  // Loading state
  if (isLoading) {
    return (
      <div className="w-screen h-screen flex flex-col items-center justify-center bg-black">
        {logoUrl && (
          <img 
            src={logoUrl} 
            alt="Event logo" 
            className="max-w-md max-h-64 mb-8 object-contain"
          />
        )}
        <div className="text-white text-2xl">Loading slideshow...</div>
      </div>
    );
  }

  // Error state
  if (error || !settings) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-black">
        <div className="text-red-500 text-2xl">{error || 'Slideshow not found'}</div>
      </div>
    );
  }

  // Empty buffer state
  if (buffer.length === 0) {
    return (
      <div className="w-screen h-screen flex items-center justify-center bg-black">
        <div className="text-white text-center">
          <div className="text-4xl mb-4">📸</div>
          <div className="text-2xl">{settings.name}</div>
          <div className="text-gray-400 mt-2">No submissions yet</div>
        </div>
      </div>
    );
  }

  const currentSlide = buffer[currentIndex];
  
  // Generate stable key for current slide to prevent unnecessary re-renders
  const currentSlideKey = currentSlide ? currentSlide.submissions.map(s => s._id).join('-') : 'loading';

  // Helper function to render slide content
  // SPECIFICATION: All slides rendered in a 16:9 box that fits the screen maximum while maintaining aspect ratio
  // NO MARGIN, NO PADDING anywhere in the layout
  const renderSlide = (slide: Slide) => {
    if (slide.type === 'single') {
      // LANDSCAPE: Single 16:9 landscape image fills the entire 16:9 container
      // Image fits to maximum size within container, aspect ratio preserved
      return (
        <img
          src={slide.submissions[0].imageUrl}
          alt="Slideshow image"
          style={{ 
            width: '100%', 
            height: '100%', 
            objectFit: 'contain',
            padding: 0,
            margin: 0
          }}
        />
      );
    } else if (slide.aspectRatio === '1:1') {
      // SQUARE 1:1 MOSAIC SPECIFICATION:
      // - 16:9 container fragmented into 6 equal parts: 3 columns (1/3 horizontal each) x 2 rows (1/2 vertical each)
      // - Absolute positioning for EXACT pixel control
      // - Each image: objectFit: contain preserves aspect ratio
      // - NO margin, NO padding, NO gap
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Top Left */}
          <div style={{ position: 'absolute', left: '0%', top: '0%', width: '33.333%', height: '50%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-start', overflow: 'hidden' }}>
            <img src={slide.submissions[0].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Top Center */}
          <div style={{ position: 'absolute', left: '33.333%', top: '0%', width: '33.333%', height: '50%', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={slide.submissions[1].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Top Right */}
          <div style={{ position: 'absolute', left: '66.666%', top: '0%', width: '33.333%', height: '50%', display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', overflow: 'hidden' }}>
            <img src={slide.submissions[2].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Bottom Left */}
          <div style={{ position: 'absolute', left: '0%', top: '50%', width: '33.333%', height: '50%', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-start', overflow: 'hidden' }}>
            <img src={slide.submissions[3].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Bottom Center */}
          <div style={{ position: 'absolute', left: '33.333%', top: '50%', width: '33.333%', height: '50%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={slide.submissions[4].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Bottom Right */}
          <div style={{ position: 'absolute', left: '66.666%', top: '50%', width: '33.333%', height: '50%', display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', overflow: 'hidden' }}>
            <img src={slide.submissions[5].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        </div>
      );
    } else {
      // PORTRAIT 9:16 MOSAIC SPECIFICATION:
      // - 16:9 container fragmented into 3 equal horizontal parts (1/3 each), full height
      // - Absolute positioning for EXACT pixel control
      // - Each image: objectFit: contain preserves aspect ratio
      // - NO margin, NO padding, NO gap
      return (
        <div style={{ position: 'relative', width: '100%', height: '100%' }}>
          {/* Left image */}
          <div style={{ position: 'absolute', left: '0%', top: '0%', width: '33.333%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-start', overflow: 'hidden' }}>
            <img src={slide.submissions[0].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Center image */}
          <div style={{ position: 'absolute', left: '33.333%', top: '0%', width: '33.333%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <img src={slide.submissions[1].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
          
          {/* Right image */}
          <div style={{ position: 'absolute', left: '66.666%', top: '0%', width: '33.333%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' }}>
            <img src={slide.submissions[2].imageUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          </div>
        </div>
      );
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-screen h-screen bg-black overflow-hidden"
      onMouseMove={handleMouseMove}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Slideshow Canvas - 16:9 aspect ratio box that fits screen
          CRITICAL: Maintains strict 16:9 aspect ratio in ALL scenarios:
          - Desktop window resize (any dimension)
          - Mobile rotation (portrait/landscape)
          - Tablet orientation changes
          
          How it works:
          - width: 100vw and height: 56.25vw (9/16 = 0.5625) attempts to fill width first
          - max-width: 177.78vh (16/9 = 1.7778) constrains width if viewport is taller than 16:9
          - max-height: 100vh prevents overflow in any scenario
          - Centering ensures letterbox (top/bottom) or pillarbox (left/right) as needed
          
          Why this approach:
          - Previous code used width: 100% + height: 100% which OVERRIDES aspectRatio
          - Using viewport units (vw/vh) with max constraints maintains the ratio
          - Absolute positioning + transform centers the box perfectly
      */}
      <div 
        className="relative"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100vw',
          height: '56.25vw',  // 9/16 = 0.5625 (maintains 16:9 when width-constrained)
          maxWidth: '177.78vh', // 16/9 = 1.7778 (maintains 16:9 when height-constrained)
          maxHeight: '100vh',
          backgroundColor: 'black',
        }}
      >
        {/* Slide Content - instant cuts, no transitions */}
        <div
          key={currentSlideKey}
          style={{
            width: '100%',
            height: '100%',
            position: 'relative',
          }}
        >
          {renderSlide(currentSlide)}
        </div>

        {/* Controls Overlay - YouTube/Netflix style */}
        {(!isFullscreen || showControls) && (
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6 transition-opacity">
            <div className="max-w-7xl mx-auto">
              {/* Title */}
              <div className="mb-4">
                <h1 className="text-white text-2xl font-bold">{settings.name}</h1>
                <p className="text-gray-300 text-sm">{settings.eventName}</p>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-4">
                {/* Play/Pause */}
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="text-white hover:text-gray-300 transition-colors"
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z"/>
                    </svg>
                  )}
                </button>

                {/* Progress */}
                <div className="flex-1 text-white text-sm">
                  Slide {currentIndex + 1} of {buffer.length} • Buffer: {settings.bufferSize}
                </div>

                {/* Fullscreen */}
                <button
                  onClick={toggleFullscreen}
                  className="text-white hover:text-gray-300 transition-colors"
                  title="Fullscreen (F)"
                >
                  {isFullscreen ? (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/>
                    </svg>
                  ) : (
                    <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
