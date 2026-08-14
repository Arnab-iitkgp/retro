import React, { useState, useEffect, useCallback, useRef } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Track, YOUTUBE_PLAYLIST_ID, fetchVideoTitle, formatDuration, RETRO_MODE } from './data/tracks';
import mainScene from '../assets/main-scene.png';

/* ============================================
   SVG ICONS
   ============================================ */

const Icons = {
  play: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5.14v14.72a1 1 0 001.5.86l11.26-7.36a1 1 0 000-1.72L9.5 4.28A1 1 0 008 5.14z" />
    </svg>
  ),
  pause: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  ),
  prev: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 4h2v16H6zM9.5 12l10-7v14z" />
    </svg>
  ),
  next: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 4h2v16h-2zM4.5 5l10 7-10 7z" />
    </svg>
  ),
  volume: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" fill="currentColor" stroke="none" />
      <path d="M15.54 8.46a5 5 0 010 7.07" />
    </svg>
  ),
  list: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="12" x2="13" y2="12" />
      <line x1="3" y1="18" x2="10" y2="18" />
      <circle cx="19" cy="16" r="2.5" fill="currentColor" stroke="none" />
      <line x1="19" y1="13" x2="19" y2="10" />
    </svg>
  ),
  shuffle: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  ),
};

/* ============================================
   AMBIENT PARTICLES
   ============================================ */

function AmbientParticles() {
  const particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    size: 1.5 + Math.random() * 1.5,
    duration: 14 + Math.random() * 20,
    delay: Math.random() * 14,
    opacity: 0.1 + Math.random() * 0.15,
  }));

  return (
    <div className="particles">
      {particles.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: p.left,
            bottom: '-10px',
            width: `${p.size}px`,
            height: `${p.size}px`,
            opacity: p.opacity,
            animationDuration: `${p.duration}s`,
            animationDelay: `${p.delay}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ============================================
   LOADING SCREEN
   ============================================ */

function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div className={`loading ${visible ? '' : 'loading--hidden'}`}>
      <div className="loading__text">entering the scene…</div>
    </div>
  );
}

/* ============================================
   CASSETTE REELS
   ============================================ */

function CassetteWindow({ isPlaying }: { isPlaying: boolean }) {
  const reelClass = `device__reel ${isPlaying ? 'device__reel--spinning' : ''}`;

  return (
    <div className="device__cassette">
      <div className={reelClass}>
        <div className="device__reel-spoke" />
        <div className="device__reel-spoke" />
        <div className="device__reel-spoke" />
        <div className="device__reel-hub" />
      </div>
      {/* Tape strip — visible only in retro mode via CSS */}
      <div className="device__tape-strip">
        <div className={`device__tape-ribbon ${isPlaying ? 'device__tape-ribbon--moving' : ''}`} />
      </div>
      <div className={reelClass}>
        <div className="device__reel-spoke" />
        <div className="device__reel-spoke" />
        <div className="device__reel-spoke" />
        <div className="device__reel-hub" />
      </div>
      <div className="device__tape-head" />
      {/* Cassette label — retro mode only */}
      <div className="device__cassette-label">yaadein · C-90</div>
    </div>
  );
}

/* ============================================
   PLAYLIST PANEL
   ============================================ */

interface PlaylistPanelProps {
  tracks: Track[];
  currentTrack: Track;
  isPlaying: boolean;
  isOpen: boolean;
  onSelectTrack: (track: Track) => void;
}

function PlaylistPanel({ tracks, currentTrack, isPlaying, isOpen, onSelectTrack }: PlaylistPanelProps) {
  return (
    <div className={`playlist-container ${isOpen ? 'playlist-container--open' : ''}`}>
      <div className="playlist">
        <div className="playlist__header">
          <span className="playlist__title">Late Night Tapes</span>
          <span className="playlist__count">{tracks.length} tracks</span>
        </div>
        {tracks.map((track, index) => {
          const isActive = track.id === currentTrack.id;
          return (
            <div
              key={track.id}
              className={`playlist__track ${isActive ? 'playlist__track--active' : ''}`}
              onClick={() => onSelectTrack(track)}
              role="button"
              tabIndex={0}
              aria-label={`Play ${track.title} by ${track.artist}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectTrack(track);
                }
              }}
            >
              {isActive && isPlaying ? (
                <div className="playlist__track-eq">
                  <div className="playlist__track-eq-bar" />
                  <div className="playlist__track-eq-bar" />
                  <div className="playlist__track-eq-bar" />
                </div>
              ) : (
                <span className="playlist__track-number">{index + 1}</span>
              )}
              <div className="playlist__track-info">
                <div className="playlist__track-title">{track.title}</div>
                <div className="playlist__track-artist">{track.artist}</div>
              </div>
              <span className="playlist__track-duration">{formatDuration(track.duration)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================================
   MUSIC DEVICE 
   ============================================ */

interface MusicDeviceProps {
  currentTrack: Track;
  isPlaying: boolean;
  progress: number;
  volume: number;
  playlistOpen: boolean;
  tracks: Track[];
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onTogglePlaylist: () => void;
  onSelectTrack: (track: Track) => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (pct: number) => void;
}

function MusicDevice({
  currentTrack,
  isPlaying,
  progress,
  volume,
  playlistOpen,
  tracks,
  onPlayPause,
  onPrev,
  onNext,
  onTogglePlaylist,
  onSelectTrack,
  onSeek,
  onVolumeChange,
}: MusicDeviceProps) {
  const elapsed = Math.floor(progress * currentTrack.duration);

  const handleMeterClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onSeek(pct);
    },
    [onSeek]
  );

  const handleVolumeClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      onVolumeChange(pct);
    },
    [onVolumeChange]
  );

  return (
    <div className={`device ${RETRO_MODE ? 'retro' : ''}`} id="music-player">
      {/* Playlist drawer — extends from device top */}
      <PlaylistPanel
        tracks={tracks}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        isOpen={playlistOpen}
        onSelectTrack={onSelectTrack}
      />

      {/* Display window — recessed top section */}
      <div className="device__display">
        <CassetteWindow isPlaying={isPlaying} />

        <div className="device__track-info">
          <div className="device__track-title">{currentTrack.title}</div>
          <div className="device__track-artist">{currentTrack.artist}</div>
        </div>

        <div className={`device__led ${isPlaying ? 'device__led--on' : ''}`} />

        <button
          className={`device__list-btn ${playlistOpen ? 'device__list-btn--active' : ''}`}
          onClick={onTogglePlaylist}
          aria-label={playlistOpen ? 'Close playlist' : 'Open playlist'}
          aria-expanded={playlistOpen}
          id="playlist-toggle"
        >
          {Icons.list}
        </button>
      </div>

      {/* Progress meter */}
      <div className="device__meter">
        <span className="device__time">{formatDuration(elapsed)}</span>
        <div
          className="device__meter-track"
          onClick={handleMeterClick}
          role="slider"
          aria-label="Seek"
          aria-valuenow={Math.round(progress * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          tabIndex={0}
          id="progress-bar"
        >
          <div
            className="device__meter-fill"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <span className="device__time">{formatDuration(currentTrack.duration)}</span>
      </div>

      {/* Transport controls */}
      <div className="device__transport">
        <button className="device__btn device__shuffle" aria-label="Shuffle" id="shuffle-btn">
          {Icons.shuffle}
        </button>

        <button className="device__btn" onClick={onPrev} aria-label="Previous track" id="prev-btn">
          {Icons.prev}
        </button>

        <button
          className={`device__btn device__btn--play ${isPlaying ? 'device__btn--playing' : ''}`}
          onClick={onPlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          id="play-btn"
        >
          {isPlaying ? Icons.pause : Icons.play}
        </button>

        <button className="device__btn" onClick={onNext} aria-label="Next track" id="next-btn">
          {Icons.next}
        </button>

        <div className="device__volume">
          <button className="device__btn" aria-label="Volume" id="volume-btn">
            {Icons.volume}
          </button>
          <div 
            className="device__vol-track" 
            id="volume-slider"
            onClick={handleVolumeClick}
            role="slider"
            aria-label="Volume"
            aria-valuenow={Math.round(volume * 100)}
            tabIndex={0}
          >
            <div
              className="device__vol-fill"
              style={{ width: `${volume * 100}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================
   APP — ROOT COMPOSITION
   ============================================ */

const INITIAL_TRACK: Track = {
  id: '_init',
  title: 'Loading…',
  artist: 'Yaadein Cassettes',
  duration: 0,
  youtubeId: '',
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [tracks, setTracks] = useState<Track[]>([INITIAL_TRACK]);
  const [currentTrack, setCurrentTrack] = useState<Track>(INITIAL_TRACK);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.7);
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);

  // Custom Cursor & Parallax tracker
  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;

    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let cursorTargetX = -100, cursorTargetY = -100;
    let cursorCurrentX = -100, cursorCurrentY = -100;
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      cursorTargetX = e.clientX;
      cursorTargetY = e.clientY;
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const updateLoop = () => {
      currentX += (targetX - currentX) * 0.08;
      currentY += (targetY - currentY) * 0.08;
      document.documentElement.style.setProperty('--mouse-x', currentX.toString());
      document.documentElement.style.setProperty('--mouse-y', currentY.toString());
      cursorCurrentX += (cursorTargetX - cursorCurrentX) * 0.35;
      cursorCurrentY += (cursorTargetY - cursorCurrentY) * 0.35;
      document.documentElement.style.setProperty('--cursor-x', `${cursorCurrentX}px`);
      document.documentElement.style.setProperty('--cursor-y', `${cursorCurrentY}px`);
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    updateLoop();
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  // Wait for artwork to load
  useEffect(() => {
    const img = new Image();
    img.src = mainScene;
    img.onload = () => setTimeout(() => setLoading(false), 600);
    img.onerror = () => setTimeout(() => setLoading(false), 600);
  }, []);

  // Sync volume to YT player
  useEffect(() => {
    if (ytPlayerRef.current) {
      ytPlayerRef.current.setVolume(volume * 100);
    }
  }, [volume]);

  // Track playback progress
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(async () => {
        if (ytPlayerRef.current) {
          try {
            const ct = await ytPlayerRef.current.getCurrentTime();
            const dur = await ytPlayerRef.current.getDuration();
            if (dur > 0) setProgress(ct / dur);
          } catch { /* Player in transition */ }
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Sync current track info from YT player
  const syncCurrentTrack = useCallback(async (player: YouTubePlayer) => {
    try {
      const data = player.getVideoData();
      const duration = await player.getDuration();
      const idx = player.getPlaylistIndex();
      if (data && data.video_id) {
        const newTrack: Track = {
          id: data.video_id,
          title: data.title || 'Unknown Track',
          artist: data.author || 'YouTube',
          duration: duration || 0,
          youtubeId: data.video_id,
        };
        setCurrentTrack(newTrack);
        setTracks(prev => {
          const updated = [...prev];
          if (idx >= 0 && idx < updated.length) {
            updated[idx] = { ...updated[idx], title: newTrack.title, artist: newTrack.artist, duration: newTrack.duration };
          }
          return updated;
        });
      }
    } catch { /* ignore */ }
  }, []);

  // Fetch all track titles when playlist loads
  const fetchAllTitles = useCallback(async (videoIds: string[]) => {
    const placeholders: Track[] = videoIds.map((id, i) => ({
      id, title: `Track ${i + 1}`, artist: 'Loading…', duration: 0, youtubeId: id,
    }));
    setTracks(placeholders);

    const results = await Promise.all(videoIds.map(id => fetchVideoTitle(id)));
    const fullTracks: Track[] = videoIds.map((id, i) => ({
      id, title: results[i].title, artist: results[i].artist, duration: 0, youtubeId: id,
    }));
    setTracks(fullTracks);
  }, []);

  // Transport controls
  const handlePlayPause = useCallback(() => {
    if (!ytPlayerRef.current) return;
    const state = ytPlayerRef.current.getPlayerState();
    if (state === 1) ytPlayerRef.current.pauseVideo();
    else ytPlayerRef.current.playVideo();
  }, []);

  const handleNext = useCallback(() => {
    if (ytPlayerRef.current) ytPlayerRef.current.nextVideo();
    setProgress(0);
  }, []);

  const handlePrev = useCallback(() => {
    if (ytPlayerRef.current) ytPlayerRef.current.previousVideo();
    setProgress(0);
  }, []);

  const handleSelectTrack = useCallback((track: Track) => {
    if (!ytPlayerRef.current) return;
    const pl = ytPlayerRef.current.getPlaylist() || [];
    const idx = pl.indexOf(track.youtubeId);
    if (idx !== -1) {
      ytPlayerRef.current.playVideoAt(idx);
      setProgress(0);
    }
  }, []);

  const handleSeek = useCallback(async (pct: number) => {
    setProgress(pct);
    if (ytPlayerRef.current) {
      try {
        const dur = await ytPlayerRef.current.getDuration();
        if (dur) ytPlayerRef.current.seekTo(pct * dur, true);
      } catch { /* ignore */ }
    }
  }, []);

  const handleTogglePlaylist = useCallback(() => setPlaylistOpen(p => !p), []);

  // YouTube Events
  const onPlayerReady = useCallback((event: YouTubeEvent) => {
    ytPlayerRef.current = event.target;
    event.target.setVolume(volume * 100);

    setTimeout(async () => {
      const player = event.target;
      const videoIds: string[] = player.getPlaylist() || [];
      if (videoIds.length > 0) {
        fetchAllTitles(videoIds);
        syncCurrentTrack(player);
      }
    }, 2000);
  }, [fetchAllTitles, syncCurrentTrack]);

  const onPlayerStateChange = useCallback((event: YouTubeEvent) => {
    const state = event.data;
    if (state === 1) {
      setIsPlaying(true);
      syncCurrentTrack(event.target);
    } else if (state === 2) {
      setIsPlaying(false);
    } else if (state === 0) {
      setProgress(0);
    } else if (state === 5) {
      syncCurrentTrack(event.target);
    }
  }, [syncCurrentTrack]);

  return (
    <>
      <div className="custom-cursor" />

      <LoadingScreen visible={loading} />

      <div className="scene" id="immersive-scene">
        <img
          className="scene__artwork"
          src={mainScene}
          alt="A nostalgic Indian neighborhood at night — a warmly-lit cassette shop on a quiet street under a deep blue sky"
          draggable={false}
        />
        <div className="scene__vignette" />
        <AmbientParticles />

        {/* Editorial title */}
        <div className="title" id="editorial-title">
          <h1 className="title__hindi">यादें</h1>
          <p className="title__name">Yaadein Cassettes</p>
          <p className="title__tagline">Late Night Tapes</p>
          <div className="title__context">
            {isPlaying ? 'NOW PLAYING' : 'BROADCASTING'} · LATE NIGHT
          </div>
        </div>

        <MusicDevice
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          progress={progress}
          volume={volume}
          playlistOpen={playlistOpen}
          tracks={tracks}
          onPlayPause={handlePlayPause}
          onPrev={handlePrev}
          onNext={handleNext}
          onTogglePlaylist={handleTogglePlaylist}
          onSelectTrack={handleSelectTrack}
          onSeek={handleSeek}
          onVolumeChange={setVolume}
        />
      </div>

      {/* Hidden YouTube Player */}
      <div style={{ position: 'fixed', top: '-9999px', left: '-9999px', width: '1px', height: '1px', overflow: 'hidden' }}>
        <YouTube
          opts={{
            width: '1',
            height: '1',
            playerVars: {
              autoplay: 0,
              controls: 0,
              disablekb: 1,
              fs: 0,
              iv_load_policy: 3,
              listType: 'playlist' as any,
              list: YOUTUBE_PLAYLIST_ID,
              origin: window.location.origin,
            },
          }}
          onReady={onPlayerReady}
          onStateChange={onPlayerStateChange}
        />
      </div>
    </>
  );
}
