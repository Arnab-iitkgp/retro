import React, { useState, useEffect, useCallback, useRef } from 'react';
import YouTube, { YouTubeEvent, YouTubePlayer } from 'react-youtube';
import { Track, YOUTUBE_PLAYLIST_ID, fetchVideoTitle, formatDuration } from './data/tracks';
import mainScene from '../assets/main-scene.png';

/* Helper to clean YouTube titles into retro song & movie labels */
function cleanTrackInfo(rawTitle: string, rawAuthor?: string): { title: string; artist: string } {
  if (!rawTitle || rawTitle.includes('NO SIGNAL')) return { title: '■■■ FM 88.5 MHz - NO SIGNAL ■■■', artist: 'AWAITING TRANSMISSION...' };

  let cleaned = rawTitle
    .replace(/\(Official.*?\)|\[Official.*?\]|Official Video|Full Song|HD|4K/gi, '')
    .replace(/\|\s*90'?s?\s*Hindi.*$/gi, '')
    .replace(/\|\s*Tips Official.*$/gi, '')
    .trim();

  const pipeParts = cleaned.split('|').map((s) => s.trim()).filter(Boolean);
  if (pipeParts.length >= 2) {
    return {
      title: pipeParts[0].toUpperCase(),
      artist: pipeParts[1].toUpperCase(),
    };
  }

  const dashParts = cleaned.split('-').map((s) => s.trim()).filter(Boolean);
  if (dashParts.length >= 2) {
    return {
      title: dashParts[0].toUpperCase(),
      artist: dashParts[1].toUpperCase(),
    };
  }

  return {
    title: cleaned.toUpperCase(),
    artist: (rawAuthor || 'RETRO CLASSIC').toUpperCase(),
  };
}

/* ============================================
   SVG ICONS
   ============================================ */
const Icons = {
  rewindFast: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 6L2 12l9 6V6zm11 0l-9 6l9 6V6z" />
    </svg>
  ),
  prev: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  ),
  play: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  stop: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  ),
  next: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2zm-12 12l8.5-6L4 6v12z" />
    </svg>
  ),
  ffwdFast: (
    <svg width="9" height="9" viewBox="0 0 24 24" fill="currentColor">
      <path d="M13 6v12l9-6-9-6zm-11 0v12l9-6-9-6z" />
    </svg>
  ),
};

/* ============================================
   AMBIENT PARTICLES, LOADING, & TITLE
   ============================================ */
function AmbientParticles() {
  const particles = Array.from({ length: 15 }, (_, i) => ({
    id: i,
    left: `${Math.random() * 100}%`,
    size: 1.5 + Math.random() * 2,
    duration: 12 + Math.random() * 18,
    delay: Math.random() * 10,
    opacity: 0.15 + Math.random() * 0.25,
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

function LoadingScreen({ visible }: { visible: boolean }) {
  return (
    <div className={`loading ${visible ? '' : 'loading--hidden'}`}>
      <div className="loading__text">entering the scene…</div>
    </div>
  );
}

function RetroTitleBlock({ isPlaying, tapeName }: { isPlaying: boolean; tapeName: string }) {
  return (
    <div className="title" id="editorial-title">
      <h1 className="title__hindi">यादें</h1>
      <p className="title__name">Yaadein Cassettes</p>
      <p className="title__tagline">Late Night Tapes</p>
      <div className="title__context">
        {isPlaying ? 'NOW PLAYING' : 'BROADCASTING'} · {tapeName.replace(' ♡', '').toUpperCase()}
      </div>
    </div>
  );
}

/* ============================================
   FLUID COMPACT VINTAGE BOOMBOX
   ============================================ */
type CassetteStage = 'empty' | 'appearing' | 'sliding' | 'clicking' | 'loaded';

interface BoomboxProps {
  currentTrack: Track;
  isPlaying: boolean;
  progress: number;
  volume: number;
  playlistName: string;
  tracks: Track[];
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectTrack: (track: Track, index: number) => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (vol: number) => void;
  onLoadNewTape: (name: string) => void;
}

export function CompactVintageBoombox({
  currentTrack,
  isPlaying,
  progress,
  volume,
  tracks = [],
  playlistName,
  onPlayPause,
  onStop,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onLoadNewTape,
  onSelectTrack,
}: BoomboxProps) {
  const [tapeStage, setTapeStage] = useState<CassetteStage>('loaded');
  const [activeTapeLabel, setActiveTapeLabel] = useState('LATE NIGHT DRIVE ♡');
  const [showTapeMenu, setShowTapeMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<'tapes' | 'tracks'>('tapes');
  const [activePianoBtn, setActivePianoBtn] = useState<string | null>(null);

  const toggleTapeMenu = (targetTab: 'tapes' | 'tracks') => {
    if (showTapeMenu && menuTab === targetTab) {
      setShowTapeMenu(false);
    } else {
      setMenuTab(targetTab);
      setShowTapeMenu(true);
    }
  };

  const elapsed = Math.floor(progress * (currentTrack.duration || 381));
  const knobAngle = -135 + volume * 270;

  useEffect(() => {
    if (playlistName) setActiveTapeLabel(playlistName);
  }, [playlistName]);

  const triggerCassetteSequence = (newLabel: string, shouldLoadTape = false) => {
    setTapeStage('empty');
    if (isPlaying) onPlayPause();

    setTimeout(() => {
      setActiveTapeLabel(newLabel);
      setTapeStage('appearing');
    }, 350);

    setTimeout(() => {
      setTapeStage('sliding');
    }, 850);

    setTimeout(() => {
      setTapeStage('clicking');
    }, 1400);

    setTimeout(() => {
      setTapeStage('loaded');
      if (shouldLoadTape) onLoadNewTape(newLabel);
    }, 1800);
  };

  const handleEjectClick = () => {
    if (tapeStage === 'loaded') {
      setTapeStage('empty');
      if (isPlaying) onStop();
    } else {
      triggerCassetteSequence(activeTapeLabel);
    }
  };

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (tapeStage !== 'loaded') return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(pct);
  };

  const trackInfo = cleanTrackInfo(currentTrack.title, currentTrack.artist);

  // Helper for satisfying button clicks
  const triggerPianoBtn = (btnName: string, action: () => void) => {
    setActivePianoBtn(btnName);
    action();
    setTimeout(() => setActivePianoBtn(null), 150);
  };

  return (
    <div className="boombox-3d-scene-container">
      <div className="boombox-3d-box">
        
        {/* Compact playlist / cassette dock. */}
        {showTapeMenu && (
          <div className="minimal-tape-menu" role="dialog" aria-label="Cassette library">
            <div className="minimal-menu-header">
              <div className="minimal-tab-bar" role="tablist" aria-label="Library view">
                <button
                  className={`minimal-tab ${menuTab === 'tapes' ? 'minimal-tab--active' : ''}`}
                  onClick={() => setMenuTab('tapes')}
                  role="tab"
                  aria-selected={menuTab === 'tapes'}
                >
                  TAPES
                </button>
                <button
                  className={`minimal-tab ${menuTab === 'tracks' ? 'minimal-tab--active' : ''}`}
                  onClick={() => setMenuTab('tracks')}
                  role="tab"
                  aria-selected={menuTab === 'tracks'}
                >
                  TRACKS
                </button>
              </div>
              <button className="minimal-close-btn" onClick={() => setShowTapeMenu(false)} aria-label="Close cassette library">×</button>
            </div>

            {menuTab === 'tapes' ? (
              <div className="minimal-items-grid">
                <button
                  className={`minimal-item ${activeTapeLabel.includes('LATE NIGHT') ? 'minimal-item--active' : ''}`}
                  onClick={() => triggerCassetteSequence('LATE NIGHT DRIVE ♡', true)}
                >
                  <span className="minimal-title">Late Night Drive</span>
                  <span className="minimal-tag">90s Bollywood</span>
                </button>
                <button
                  className={`minimal-item ${activeTapeLabel.includes('CHILLT') ? 'minimal-item--active' : ''}`}
                  onClick={() => triggerCassetteSequence('CHILLT DRIVE 🌙', true)}
                >
                  <span className="minimal-title">Chillt Drive</span>
                  <span className="minimal-tag">Lo-fi retro</span>
                </button>
                <button
                  className={`minimal-item ${activeTapeLabel.includes('OLD HINDI') ? 'minimal-item--active' : ''}`}
                  onClick={() => triggerCassetteSequence('OLD HINDI HITS ✨', true)}
                >
                  <span className="minimal-title">Old Hindi Hits</span>
                  <span className="minimal-tag">Classics</span>
                </button>
              </div>
            ) : (
              <div className="minimal-track-list">
                {(tracks || []).map((track, i) => {
                  const isActive = currentTrack && (track.id === currentTrack.id || track.youtubeId === currentTrack.youtubeId);
                  const clean = cleanTrackInfo(track?.title || '', track?.artist);
                  return (
                    <button
                      key={track.id || i}
                      className={`minimal-track-row ${isActive ? 'minimal-track-row--active' : ''}`}
                      onClick={() => onSelectTrack(track, i)}
                    >
                      <span className="minimal-num">{String(i + 1).padStart(2, '0')}</span>
                      <div className="minimal-text-col">
                        <span className="minimal-song-title">{clean.title}</span>
                        <span className="minimal-song-artist">{clean.artist}</span>
                      </div>
                      {isActive && isPlaying && <span className="minimal-now-playing">▶ PLAYING</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TOP CHASSIS PANEL — 3 HYPER-REALISTIC RIGHT-SIDE SWITCHES */}
        <div className="box-face box-face--top">
          <div className="top-switch-bay top-switch-bay--right">
            {/* SWITCH 1: EJECT CASSETTE */}
            <div className="top-switch-slot" title="Eject / Load Cassette Tape (⏏)">
              <button
                className={`top-switch-cap ${tapeStage === 'empty' ? 'top-switch-cap--pressed' : ''}`}
                onClick={handleEjectClick}
              >
                <span className="switch-top-bevel">
                  <span className="switch-icon">⏏</span>
                </span>
                <span className="switch-mini-label">EJECT</span>
              </button>
            </div>

            {/* SWITCH 2: CHOOSE / ADD CASSETTE */}
            <div className="top-switch-slot" title="Choose / Load Cassette Tape (📼)">
              <button
                className={`top-switch-cap ${showTapeMenu && menuTab === 'tapes' ? 'top-switch-cap--pressed' : ''}`}
                onClick={() => toggleTapeMenu('tapes')}
              >
                <span className="switch-top-bevel">
                  <span className="switch-icon">📼</span>
                </span>
                <span className="switch-mini-label">TAPES</span>
              </button>
            </div>

            {/* SWITCH 3: SEE PLAYLIST TRACKS */}
            <div className="top-switch-slot" title="See Tracklist / Playlist (🎶)">
              <button
                className={`top-switch-cap ${showTapeMenu && menuTab === 'tracks' ? 'top-switch-cap--pressed' : ''}`}
                onClick={() => toggleTapeMenu('tracks')}
              >
                <span className="switch-top-bevel">
                  <span className="switch-icon">🎶</span>
                </span>
                <span className="switch-mini-label">TRACKS</span>
              </button>
            </div>
          </div>
        </div>

        {/* FRONT FACE */}
        <div className="box-face box-face--front">
          {/* TOP CHASSIS BRAND STAMP */}
          <div className="chassis-brand-stamp">
            <span className="brand-star">✳</span> YAADEIN CASSETTES
          </div>
          
          {/* LEFT SPEAKER */}
          <div className="speaker-housing speaker-housing--left">
            <div className="silver-rim-ring">
              <div className="rim-screw rim-screw--1" />
              <div className="rim-screw rim-screw--2" />
              <div className="rim-screw rim-screw--3" />
              <div className="rim-screw rim-screw--4" />
              <div className="rim-screw rim-screw--5" />
              <div className="rim-screw rim-screw--6" />
              <div className="honeycomb-mesh-grille">
                <div className={`speaker-cone ${isPlaying && tapeStage === 'loaded' ? 'speaker-cone--beating' : ''}`}>
                  <div className="amber-dust-cap" />
                </div>
              </div>
            </div>
          </div>

          {/* CENTER CONSOLE */}
          <div className="center-console">
            
            {/* RETRO OLIVE LCD DISPLAY */}
            <div className={`lcd-display ${tapeStage === 'loaded' ? 'lcd-display--active' : 'lcd-display--empty'}`}>
              <div className="lcd-scanlines"></div>
              {tapeStage === 'loaded' ? (
                <>
                  <div className={`lcd-line-title ${currentTrack.id === 'tuning' ? 'lcd-tuning-blink' : ''}`} title={trackInfo.title}>{trackInfo.title}</div>
                  <div className="lcd-line-artist" title={trackInfo.artist}>{trackInfo.artist}</div>
                  <div className="lcd-line-meta">
                    <span className="lcd-icon">{isPlaying ? '▶' : '⏸'}</span>
                    <span className="lcd-time">{formatDuration(elapsed)}</span>
                    <div className="lcd-track-meter" onClick={handleSeekClick}>
                      <div className="lcd-track-fill" style={{ width: `${progress * 100}%` }} />
                      <div className="lcd-track-dot" style={{ left: `${progress * 100}%` }} />
                    </div>
                    <span className="lcd-time">{formatDuration(currentTrack.duration || 381)}</span>
                  </div>
                </>
              ) : (
                <div className="lcd-empty-state">
                  <div className="lcd-blink-text">NO TAPE</div>
                  <div className="lcd-sub-text">SELECT A TAPE</div>
                </div>
              )}
            </div>

            {/* CASSETTE DECK WINDOW */}
            <div className="cassette-deck-housing">
              <div className="metal-screw metal-screw--tl" />
              <div className="metal-screw metal-screw--tr" />
              <div className="metal-screw metal-screw--bl" />
              <div className="metal-screw metal-screw--br" />

              <div className="deck-window-glass">
                <div className="deck-bare-spindles">
                  <div className={`bare-spindle ${isPlaying && tapeStage === 'loaded' ? 'bare-spindle--spinning' : ''}`} />
                  <div className={`bare-spindle ${isPlaying && tapeStage === 'loaded' ? 'bare-spindle--spinning' : ''}`} />
                </div>

                <div className={`cassette-tape cassette-tape--${tapeStage}`}>
                  <div className="cassette-shell">
                    <div className="cassette-label-sticker">
                      <div className="cassette-stripe-red" />
                      <div className="cassette-title-text">{activeTapeLabel}</div>
                      <div className="cassette-stripe-blue" />
                    </div>
                    <div className="cassette-center-window">
                      <div className={`cassette-reel ${isPlaying && tapeStage === 'loaded' ? 'cassette-reel--spinning' : ''}`}>
                        <div className="reel-spokes" />
                      </div>
                      <div className="tape-bridge-path" />
                      <div className={`cassette-reel ${isPlaying && tapeStage === 'loaded' ? 'cassette-reel--spinning' : ''}`}>
                        <div className="reel-spokes" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CONTROLS ROW: 6 PIANO KEYS + VOL KNOB & RED LED */}
            <div className="controls-row">
              <div className="piano-keys-group">
                <button 
                  className={`piano-key-btn ${activePianoBtn === 'rewind' ? 'piano-key-btn--pressed' : ''}`} 
                  onClick={() => triggerPianoBtn('rewind', () => onSeek(Math.max(0, progress - 0.1)))} 
                  title="Rewind 10%"
                >
                  {Icons.rewindFast}
                </button>
                <button 
                  className={`piano-key-btn ${activePianoBtn === 'prev' ? 'piano-key-btn--pressed' : ''}`} 
                  onClick={() => triggerPianoBtn('prev', onPrev)} 
                  title="Previous Track"
                >
                  {Icons.prev}
                </button>
                <button
                  className={`piano-key-btn piano-key-btn--play ${isPlaying && tapeStage === 'loaded' ? 'piano-key-btn--active-glow' : ''} ${activePianoBtn === 'play' ? 'piano-key-btn--pressed' : ''}`}
                  onClick={() => {
                    triggerPianoBtn('play', () => {
                      if (tapeStage === 'loaded') onPlayPause();
                      else triggerCassetteSequence(activeTapeLabel);
                    });
                  }}
                  title={isPlaying ? 'Pause' : 'Play'}
                >
                  {isPlaying ? Icons.pause : Icons.play}
                </button>
                <button
                  className={`piano-key-btn ${activePianoBtn === 'stop' ? 'piano-key-btn--pressed' : ''}`}
                  onClick={() => triggerPianoBtn('stop', onStop)}
                  title="Stop"
                >
                  {Icons.stop}
                </button>
                <button 
                  className={`piano-key-btn ${activePianoBtn === 'next' ? 'piano-key-btn--pressed' : ''}`} 
                  onClick={() => triggerPianoBtn('next', onNext)} 
                  title="Next Track"
                >
                  {Icons.next}
                </button>
                <button 
                  className={`piano-key-btn ${activePianoBtn === 'ffwd' ? 'piano-key-btn--pressed' : ''}`} 
                  onClick={() => triggerPianoBtn('ffwd', () => onSeek(Math.min(1, progress + 0.1)))} 
                  title="Fast Forward 10%"
                >
                  {Icons.ffwdFast}
                </button>
              </div>

              {/* VOLUME DIAL (WITH CLICKABLE +/- REGIONS) */}
              <div className="volume-section">
                <button className="vol-btn vol-btn--down" onClick={() => onVolumeChange(Math.max(0, volume - 0.1))} title="Volume Down">-</button>
                
                <div className="vol-dial-wrapper">
                  <span className="vol-label">VOL</span>
                  <div
                    className="rotary-knob"
                    style={{ transform: `rotate(${knobAngle}deg)` }}
                    onClick={() => onVolumeChange(volume >= 1 ? 0.2 : volume + 0.2)}
                  >
                    <div className="knob-notch" />
                  </div>
                  <div className={`power-led-dot ${isPlaying && tapeStage === 'loaded' ? 'power-led-dot--on' : ''}`} />
                </div>
                
                <button className="vol-btn vol-btn--up" onClick={() => onVolumeChange(Math.min(1, volume + 0.1))} title="Volume Up">+</button>
              </div>
            </div>

          </div>

          {/* RIGHT SPEAKER */}
          <div className="speaker-housing speaker-housing--right">
            <div className="silver-rim-ring">
              <div className="rim-screw rim-screw--1" />
              <div className="rim-screw rim-screw--2" />
              <div className="rim-screw rim-screw--3" />
              <div className="rim-screw rim-screw--4" />
              <div className="rim-screw rim-screw--5" />
              <div className="rim-screw rim-screw--6" />
              <div className="honeycomb-mesh-grille">
                <div className={`speaker-cone ${isPlaying && tapeStage === 'loaded' ? 'speaker-cone--beating' : ''}`}>
                  <div className="amber-dust-cap" />
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT SIDE PANEL */}
        <div className="box-face box-face--right">
          <div className="side-tuning-dial" />
        </div>

      </div>

      {/* Floating Cassette Graphic for Step 2 */}
      {tapeStage === 'appearing' && (
        <div className="floating-incoming-cassette">
          <div className="cassette-shell">
            <div className="cassette-label-sticker">
              <div className="cassette-stripe-red" />
              <div className="cassette-title-text">{activeTapeLabel}</div>
              <div className="cassette-stripe-blue" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================================
   APP — MAIN ENTRY
   ============================================ */
const INITIAL_TRACK: Track = {
  id: 'tuning',
  title: '■■■ FM 88.5 MHz - NO SIGNAL ■■■',
  artist: 'AWAITING TRANSMISSION...',
  duration: 0,
  youtubeId: 'v8P0i9J42kE',
};

const DEFAULT_PLAYLISTS: Record<string, Track[]> = {
  'LATE NIGHT DRIVE ♡': [
    { id: '1', title: 'LADKI BADI ANJANI HAI', artist: 'KUCH KUCH HOTA HAI - 1998', duration: 381, youtubeId: 'v8P0i9J42kE' },
    { id: '2', title: 'TUJHE DEKHA TOH YEH JAANA', artist: 'DDLJ - 1995', duration: 304, youtubeId: 'c25rJ1wJ5vU' },
    { id: '3', title: 'PEHLA NASHA', artist: 'JO JEETA WOHI SIKANDAR', duration: 295, youtubeId: 'V9PVRfjEBTI' },
    { id: '4', title: 'DIL TO PAGAL HAI', artist: 'UTTAM SINGH - 1997', duration: 338, youtubeId: 'WwJmU1rZ3y0' },
    { id: '5', title: 'CHURA KE DIL MERA', artist: 'MAIN KHILADI TU ANARI', duration: 320, youtubeId: 'tK3Z4a2eGxE' }
  ],
  'CHILLT DRIVE 🌙': [
    { id: 'c1', title: 'BAARISHEIN (LO-FI REMIX)', artist: 'ANUV JAIN - CHILL EDIT', duration: 210, youtubeId: 'V1Pl8CzNzCw' },
    { id: 'c2', title: 'AA CHAL KE TUJHE (RETRO LOFI)', artist: 'KISHORE KUMAR - MIDNIGHT', duration: 245, youtubeId: 'gT56N8Rz5hE' },
    { id: 'c3', title: 'CHAUDHVIN KA CHAND', artist: 'MOHAMMED RAFI - LOFI', duration: 220, youtubeId: 'mN6x0K7Gz10' },
    { id: 'c4', title: 'LAG JA GALE (SLOWED & REVERB)', artist: 'LATA MANGESHKAR', duration: 260, youtubeId: '3vW8vN756zM' }
  ],
  'OLD HINDI HITS ✨': [
    { id: 'o1', title: 'MERE SAPNO KI RANI', artist: 'KISHORE KUMAR - 1969', duration: 300, youtubeId: 'vo1MykK4u8U' },
    { id: 'o2', title: 'ROOP TERA MASTANA', artist: 'ARADHANA - 1969', duration: 225, youtubeId: 'HenA-OUyp0s' },
    { id: 'o3', title: 'YEH SHAAM MASTANI', artist: 'KATI PATANG - 1971', duration: 275, youtubeId: '6L6Xq36Zz10' },
    { id: 'o4', title: 'GULABI AANKHEN', artist: 'THE TRAIN - 1970', duration: 200, youtubeId: 'hgi2MYUQgE8' }
  ]
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [currentTrack, setCurrentTrack] = useState<Track>(INITIAL_TRACK);
  const [playlistName, setPlaylistName] = useState('LATE NIGHT DRIVE ♡');
  const [tracks, setTracks] = useState<Track[]>(DEFAULT_PLAYLISTS['LATE NIGHT DRIVE ♡']);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [volume, setVolume] = useState(0.75);
  const ytPlayerRef = useRef<YouTubePlayer | null>(null);
  const hydratedPlaylistRef = useRef('');

  useEffect(() => {
    if (window.matchMedia('(hover: none)').matches) return;
    let targetX = 0, targetY = 0, currentX = 0, currentY = 0;
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      targetX = (e.clientX / window.innerWidth - 0.5) * 2;
      targetY = (e.clientY / window.innerHeight - 0.5) * 2;
    };

    const updateLoop = () => {
      currentX += (targetX - currentX) * 0.08; currentY += (targetY - currentY) * 0.08;
      document.documentElement.style.setProperty('--mouse-x', currentX.toString());
      document.documentElement.style.setProperty('--mouse-y', currentY.toString());
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    updateLoop();
    window.addEventListener('mousemove', handleMouseMove);
    return () => { cancelAnimationFrame(animationFrameId); window.removeEventListener('mousemove', handleMouseMove); };
  }, []);

  useEffect(() => {
    const img = new Image();
    img.src = mainScene;
    img.onload = () => setTimeout(() => setLoading(false), 500);
    img.onerror = () => setTimeout(() => setLoading(false), 500);
  }, []);

  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(async () => {
        if (ytPlayerRef.current) {
          try {
            const ct = await ytPlayerRef.current.getCurrentTime();
            const dur = await ytPlayerRef.current.getDuration();
            if (dur > 0) setProgress(ct / dur);
          } catch { /* transition */ }
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handlePlayPause = useCallback(() => {
    if (!ytPlayerRef.current) {
      setIsPlaying((p) => !p);
      return;
    }
    const state = ytPlayerRef.current.getPlayerState();
    if (state === 1) ytPlayerRef.current.pauseVideo();
    else ytPlayerRef.current.playVideo();
  }, []);

  const handleStop = useCallback(() => {
    if (ytPlayerRef.current) ytPlayerRef.current.pauseVideo();
    setProgress(0);
    if (ytPlayerRef.current) ytPlayerRef.current.seekTo(0, true);
    setIsPlaying(false);
  }, []);

  const handleSelectTrack = useCallback((track: Track, autoplay = true, playlistIndex?: number) => {
    setCurrentTrack(track);
    setProgress(0);
    setIsPlaying(autoplay);
    if (ytPlayerRef.current && autoplay) {
      if (playlistIndex !== undefined) ytPlayerRef.current.playVideoAt(playlistIndex);
      else ytPlayerRef.current.playVideo();
    }
  }, []);

  const handleNext = useCallback(() => {
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.youtubeId === currentTrack.youtubeId));
    const nextIndex = (currentIndex + 1) % tracks.length;
    handleSelectTrack(tracks[nextIndex], true, nextIndex);
  }, [currentTrack.youtubeId, handleSelectTrack, tracks]);

  const handlePrev = useCallback(() => {
    if (progress > 0.05) {
      setProgress(0);
      ytPlayerRef.current?.seekTo(0, true);
      return;
    }
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.youtubeId === currentTrack.youtubeId));
    const previousIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    handleSelectTrack(tracks[previousIndex], true, previousIndex);
  }, [currentTrack.youtubeId, handleSelectTrack, progress, tracks]);

  const handleSeek = useCallback(async (pct: number) => {
    setProgress(pct);
    if (ytPlayerRef.current) {
      try {
        const dur = await ytPlayerRef.current.getDuration();
        if (dur) ytPlayerRef.current.seekTo(pct * dur, true);
      } catch { /* ignore */ }
    }
  }, []);

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    if (ytPlayerRef.current) ytPlayerRef.current.setVolume(vol * 100);
  }, []);

  const hydratePlaylist = useCallback(async (player: YouTubePlayer) => {
    try {
      const videoIds = (player.getPlaylist?.() || []) as string[];
      const visibleIds = videoIds.slice(0, 20);
      const playlistKey = visibleIds.join('|');
      if (!playlistKey || hydratedPlaylistRef.current === playlistKey) return;

      hydratedPlaylistRef.current = playlistKey;
      const playerTracks: Track[] = await Promise.all(visibleIds.map(async (youtubeId) => {
        const info = await fetchVideoTitle(youtubeId);
        return {
          id: youtubeId,
          youtubeId,
          title: info.title,
          artist: info.artist,
          duration: 0,
        } satisfies Track;
      }));

      setTracks(playerTracks);
      const activeVideoId = player.getVideoData()?.video_id;
      const activeTrack = playerTracks.find((track) => track.youtubeId === activeVideoId);
      if (activeTrack) setCurrentTrack(activeTrack);
    } catch {
      // Keep the local fallback list if YouTube has not exposed the playlist yet.
    }
  }, []);

  const handleLoadNewTape = useCallback((name: string) => {
    setPlaylistName(name);
    const newTracks = DEFAULT_PLAYLISTS[name] || DEFAULT_PLAYLISTS['LATE NIGHT DRIVE ♡'];
    if (newTracks.length > 0) {
      setCurrentTrack(newTracks[0]);
      setProgress(0);
      setIsPlaying(false);
    }
    hydratedPlaylistRef.current = '';
    if (ytPlayerRef.current) void hydratePlaylist(ytPlayerRef.current);
  }, [hydratePlaylist]);

  const syncCurrentTrack = useCallback(async (player: YouTubePlayer) => {
    try {
      const data = player.getVideoData();
      const duration = await player.getDuration();
      if (data && data.video_id) {
        setCurrentTrack((current) => ({
          ...current,
          id: data.video_id,
          title: data.title || current.title,
          artist: data.author || current.artist,
          duration: duration || current.duration,
          youtubeId: data.video_id,
        }));
        return;
      }
      if (data && data.video_id && duration > 0) {
        setCurrentTrack((current) => current.youtubeId === data.video_id
          ? { ...current, duration }
          : current);
        return;
      }
      if (data && data.video_id) {
        setCurrentTrack((current) => current.youtubeId === data.video_id ? ({
          id: data.video_id,
          title: data.title || '■■■ FM 88.5 MHz - NO SIGNAL ■■■',
          artist: data.author || 'AWAITING TRANSMISSION...',
          duration: current.duration,
          youtubeId: data.video_id,
        }) : current);
      }
    } catch { /* ignore */ }
  }, []);

  const onPlayerReady = useCallback((event: YouTubeEvent) => {
    ytPlayerRef.current = event.target;
    event.target.setVolume(volume * 100);
    void hydratePlaylist(event.target);
  }, [hydratePlaylist, volume]);

  const onPlayerStateChange = useCallback((event: YouTubeEvent) => {
    const state = event.data;
    if (state === 1) {
      setIsPlaying(true);
      syncCurrentTrack(event.target);
      void hydratePlaylist(event.target);
    } else if (state === 0) {
      setIsPlaying(false);
      handleNext();
    } else if (state === 2) {
      setIsPlaying(false);
    }
  }, [handleNext, hydratePlaylist, syncCurrentTrack]);

  return (
    <>
      <LoadingScreen visible={loading} />

      <div className="scene" id="immersive-scene">
        <img className="scene__artwork" src={mainScene} alt="Indian Night Scene" draggable={false} />
        <div className="scene__vignette" />
        <AmbientParticles />
        <RetroTitleBlock isPlaying={isPlaying} tapeName={playlistName} />

        <CompactVintageBoombox
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          progress={progress}
          volume={volume}
          playlistName={playlistName}
          tracks={tracks}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onPrev={handlePrev}
          onNext={handleNext}
          onSelectTrack={(track, index) => handleSelectTrack(track, true, index)}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onLoadNewTape={handleLoadNewTape}
        />
      </div>

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
