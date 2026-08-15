import React, { useState, useEffect, useCallback, useRef } from 'react';
import YouTube from 'react-youtube';
import { Track, YOUTUBE_PLAYLIST_ID, formatDuration } from './data/tracks';
import { mechanicalAudio } from './audioEngine';
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
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11 6L2 12l9 6V6zm11 0l-9 6l9 6V6z" />
    </svg>
  ),
  prev: (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
      <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
    </svg>
  ),
  play: (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7z" />
    </svg>
  ),
  pause: (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </svg>
  ),
  stop: (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  ),
  next: (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
      <path d="M16 6h2v12h-2zm-12 12l8.5-6L4 6v12z" />
    </svg>
  ),
  ffwdFast: (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="currentColor">
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

const ENABLE_VU_METER = false;

export interface SavedTape {
  id: string;
  name: string;
}

interface BoomboxProps {
  currentTrack: Track;
  isPlaying: boolean;
  progress: number;
  volume: number;
  playlistName: string;
  playlistId: string;
  savedTapes: SavedTape[];
  tracks: Track[];
  onPlayPause: () => void;
  onStop: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSelectTrack: (track: Track, index: number) => void;
  onSeek: (pct: number) => void;
  onVolumeChange: (vol: number) => void;
  onLoadNewTape: (name: string, link?: string) => void;
  onDeleteTape: (id: string) => void;
  isVisible: boolean;
  isIdle: boolean;
  onToggleVisibility: () => void;
}

export function CompactVintageBoombox({
  currentTrack,
  isPlaying,
  progress,
  volume,
  tracks = [],
  playlistName,
  playlistId,
  savedTapes = [],
  onPlayPause,
  onStop,
  onNext,
  onPrev,
  onSeek,
  onVolumeChange,
  onLoadNewTape,
  onDeleteTape,
  onSelectTrack,
  isVisible,
  isIdle,
  onToggleVisibility,
}: BoomboxProps) {
  const [tapeStage, setTapeStage] = useState<CassetteStage>('loaded');
  const [activeTapeLabel, setActiveTapeLabel] = useState(playlistName || 'CUSTOM MIXTAPE');
  const [showTapeMenu, setShowTapeMenu] = useState(false);
  const [menuTab, setMenuTab] = useState<'tapes' | 'tracks'>('tapes');
  const [showAddModal, setShowAddModal] = useState(false);
  const [tempTapeName, setTempTapeName] = useState('Custom Mixtape');
  const [tempTapeLink, setTempTapeLink] = useState('');
  const [activePianoBtn, setActivePianoBtn] = useState<string | null>(null);

  const isDraggingVol = useRef(false);
  const startY = useRef(0);
  const startVol = useRef(0);

  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingVol.current = true;
    startY.current = e.clientY;
    startVol.current = volume;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDraggingVol.current) return;
    const deltaY = startY.current - e.clientY; // Up is positive
    const sensitivity = 0.01; // 1% per pixel
    const newVol = Math.max(0, Math.min(1, startVol.current + deltaY * sensitivity));
    onVolumeChange(newVol);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingVol.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const toggleTapeMenu = (targetTab: 'tapes' | 'tracks') => {
    mechanicalAudio.playPianoKeyClack();
    if (showTapeMenu && menuTab === targetTab) {
      setShowTapeMenu(false);
      setShowAddModal(false);
    } else {
      setMenuTab(targetTab);
      setShowTapeMenu(true);
    }
  };

  const closeTapeMenu = () => {
    setShowTapeMenu(false);
    setShowAddModal(false);
  };

  const elapsed = Math.floor(progress * (currentTrack.duration || 381));
  const knobAngle = -135 + volume * 270;

  useEffect(() => {
    if (playlistName) setActiveTapeLabel(playlistName);
  }, [playlistName]);

  const triggerCassetteSequence = (newLabel: string) => {
    setTapeStage('empty');
    if (isPlaying) onPlayPause();

    setTimeout(() => {
      setActiveTapeLabel(newLabel);
      setTapeStage('appearing');
      mechanicalAudio.playTapeSlide();
    }, 350);

    setTimeout(() => {
      setTapeStage('sliding');
    }, 850);

    setTimeout(() => {
      setTapeStage('clicking');
      mechanicalAudio.playPianoKeyClack();
    }, 1400);

    setTimeout(() => {
      setTapeStage('loaded');
    }, 1800);
  };

  const handleEjectClick = () => {
    mechanicalAudio.playPianoKeyClack();
    if (tapeStage === 'loaded') {
      setTapeStage('empty');
      if (isPlaying) onStop();
      setTimeout(() => mechanicalAudio.playTapeSlide(), 300);
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
    mechanicalAudio.playPianoKeyClack();
    setActivePianoBtn(btnName);
    action();
    setTimeout(() => setActivePianoBtn(null), 150);
  };

  return (
    <>
    <div className={`boombox-3d-scene-container ${!isVisible ? 'boombox-hidden' : ''}`}>
      <div className="boombox-3d-box">
        
        {/* Compact playlist / cassette dock. */}
        {showTapeMenu && (
          <div className="tape-docker-wrapper">
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
              <button className="minimal-close-btn" onClick={closeTapeMenu} aria-label="Close cassette library">×</button>
            </div>

            {menuTab === 'tapes' ? (
              <div className="minimal-items-grid">
                {savedTapes.map((tape) => {
                  const isActive = tape.id === playlistId;
                  return (
                    <div 
                      key={tape.id}
                      className={`minimal-item ${isActive ? 'minimal-item--active' : ''}`}
                      style={{ cursor: isActive ? 'default' : 'pointer', paddingRight: '2em' }}
                      onClick={() => {
                        if (isActive) return;
                        triggerCassetteSequence(tape.name);
                        onLoadNewTape(tape.name, tape.id);
                        setMenuTab('tracks');
                      }}
                    >
                      <span className="minimal-title">{tape.name}</span>
                      <span className="minimal-tag">YouTube Playlist</span>
                      {savedTapes.length > 1 && (
                        <button 
                          className="tape-delete-btn" 
                          onClick={(e) => { e.stopPropagation(); onDeleteTape(tape.id); }}
                          title="Delete Tape"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}

                <div className="minimal-tape-cta" style={{ gridColumn: '1 / -1', marginTop: '10px' }}>
                  <button className="tape-cta-btn" onClick={() => setShowAddModal(true)} style={{ width: '100%', padding: '12px', background: 'rgba(255,255,255,0.1)', color: '#fff', border: '1px dashed rgba(255,255,255,0.3)', borderRadius: '6px', cursor: 'pointer', fontFamily: 'monospace' }}>
                    + Add Your Playlist
                  </button>
                </div>
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

            {/* Attached Modal for Adding Playlist */}
            {showAddModal && (
              <div className="minimal-add-playlist-modal">
                <h3 className="minimal-modal-title">Add Custom Mixtape</h3>
                
                <div className="minimal-modal-field">
                  <label className="minimal-modal-label">YouTube Playlist Link</label>
                  <input
                    type="text"
                    className="minimal-modal-input"
                    placeholder="https://youtube.com/playlist?list=..."
                    value={tempTapeLink}
                    onChange={(e) => setTempTapeLink(e.target.value)}
                  />
                </div>
                
                <div className="minimal-modal-field">
                  <label className="minimal-modal-label">Name Your Tape</label>
                  <input
                    type="text"
                    className="minimal-modal-input"
                    value={tempTapeName}
                    onChange={(e) => setTempTapeName(e.target.value)}
                  />
                </div>
                
                <div className="minimal-modal-actions">
                  <button className="minimal-modal-btn minimal-modal-btn--cancel" onClick={() => setShowAddModal(false)}>Cancel</button>
                  <button className="minimal-modal-btn minimal-modal-btn--submit" onClick={() => {
                    const finalName = tempTapeName || 'Custom Mixtape';
                    triggerCassetteSequence(finalName);
                    onLoadNewTape(finalName, tempTapeLink);
                    setShowAddModal(false);
                    setTempTapeLink('');
                    setMenuTab('tracks');
                  }}>Add Tape</button>
                </div>
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

            {/* VU METER */}
            {ENABLE_VU_METER && (
              <div className="vu-meter-panel">
                <div className="vu-channel">
                  <span className="vu-label">L</span>
                  <div className="vu-leds">
                    {[...Array(12)].map((_, i) => (
                      <div key={`l-${i}`} className={`vu-led vu-led--${i < 7 ? 'green' : i < 10 ? 'yellow' : 'red'} ${isPlaying && tapeStage === 'loaded' ? 'vu-led--active' : ''}`} style={{ animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${0.2 + Math.random() * 0.3}s` }} />
                    ))}
                  </div>
                </div>
                <div className="vu-channel">
                  <span className="vu-label">R</span>
                  <div className="vu-leds">
                    {[...Array(12)].map((_, i) => (
                      <div key={`r-${i}`} className={`vu-led vu-led--${i < 7 ? 'green' : i < 10 ? 'yellow' : 'red'} ${isPlaying && tapeStage === 'loaded' ? 'vu-led--active' : ''}`} style={{ animationDelay: `${Math.random() * 0.5}s`, animationDuration: `${0.2 + Math.random() * 0.3}s` }} />
                    ))}
                  </div>
                </div>
              </div>
            )}

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
                    style={{ transform: `rotate(${knobAngle}deg)`, touchAction: 'none' }}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
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

      {/* MINI PLAYER BAR (Appears when boombox is hidden) */}
      <div className={`mini-player-bar ${!isVisible ? 'mini-player-bar--visible' : ''}`}>
        <div className="mini-progress-track" onClick={handleSeekClick}>
          <div className="mini-progress-bar" style={{ width: `${progress * 100}%` }} />
        </div>
        <button className="mini-btn" onClick={onToggleVisibility} title="Show Boombox">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect>
            <circle cx="7" cy="13" r="2.5"></circle>
            <circle cx="17" cy="13" r="2.5"></circle>
            <path d="M10 9h4"></path>
            <path d="M6 6v-2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <div className="mini-track-info">
          <span className="mini-title">{trackInfo.title}</span>
          <span className="mini-artist">{trackInfo.artist}</span>
        </div>
        <button className="mini-btn" onClick={onPrev}>
          {Icons.prev}
        </button>
        <button className="mini-btn" onClick={onPlayPause}>
          {isPlaying ? Icons.pause : Icons.play}
        </button>
        <button className="mini-btn" onClick={onNext}>
          {Icons.next}
        </button>
        <button className="mini-btn mini-btn--menu" onClick={() => {
          onToggleVisibility();
          setMenuTab('tracks');
          setShowTapeMenu(true);
        }}>
          TRACKS
        </button>
        <button className="mini-btn mini-btn--menu" onClick={() => {
          onToggleVisibility();
          setMenuTab('tapes');
          setShowTapeMenu(true);
        }}>
          TAPES
        </button>
      </div>
      
      {/* HIDE BOOMBOX BTN (Appears when boombox is visible) */}
      <button 
        className={`hide-boombox-btn ${isVisible && !isIdle ? 'hide-boombox-btn--visible' : ''}`}
        onClick={onToggleVisibility}
        title="Hide Boombox"
      >
        <span>HIDE</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="2" y="6" width="20" height="12" rx="2" ry="2"></rect>
          <circle cx="7" cy="13" r="2.5"></circle>
          <circle cx="17" cy="13" r="2.5"></circle>
          <path d="M10 9h4"></path>
          <path d="M6 6v-2a2 2 0 0 1 2 -2h8a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    </>
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

export default function App() {
  const [loading, setLoading] = useState(true);
  const [playlistName, setPlaylistName] = useState(() => localStorage.getItem('yaadein_playlist') || 'CUSTOM MIXTAPE');
  const [playlistId, setPlaylistId] = useState(() => localStorage.getItem('yaadein_playlist_id') || YOUTUBE_PLAYLIST_ID);
  
  const [savedTapes, setSavedTapes] = useState<SavedTape[]>(() => {
    const saved = localStorage.getItem('yaadein_saved_tapes');
    if (saved) return JSON.parse(saved);
    return [{ id: YOUTUBE_PLAYLIST_ID, name: 'CUSTOM MIXTAPE' }];
  });
  
  const [tracks, setTracks] = useState<Track[]>([]);
  
  const [currentTrack, setCurrentTrack] = useState<Track>(INITIAL_TRACK);

  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [isBoomboxVisible, setIsBoomboxVisible] = useState(true);
  const [isIdle, setIsIdle] = useState(false);
  
  const [volume, setVolume] = useState(() => {
    const savedVol = localStorage.getItem('yaadein_volume');
    return savedVol ? parseFloat(savedVol) : 0.75;
  });

  useEffect(() => { localStorage.setItem('yaadein_volume', volume.toString()); }, [volume]);
  useEffect(() => { localStorage.setItem('yaadein_playlist', playlistName); }, [playlistName]);
  useEffect(() => { localStorage.setItem('yaadein_playlist_id', playlistId); }, [playlistId]);
  useEffect(() => { localStorage.setItem('yaadein_saved_tapes', JSON.stringify(savedTapes)); }, [savedTapes]);
  useEffect(() => { if (currentTrack && currentTrack.id) localStorage.setItem('yaadein_track_id', currentTrack.id); }, [currentTrack]);




  const hydratedPlaylistRef = useRef('');
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [useIframeFallback, setUseIframeFallback] = useState(false);
  const ytPlayerRef = useRef<any>(null);

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
    let timeout: number;
    const handleActivity = () => {
      setIsIdle(false);
      clearTimeout(timeout);
      timeout = window.setTimeout(() => setIsIdle(true), 3000);
    };
    
    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('touchstart', handleActivity);
    handleActivity();
    
    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('touchstart', handleActivity);
      clearTimeout(timeout);
    };
  }, []);

  const prefetchedId = useRef<string | null>(null);

  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        if (useIframeFallback && ytPlayerRef.current) {
          try {
            const cTime = ytPlayerRef.current.getCurrentTime();
            const dur = ytPlayerRef.current.getDuration();
            if (dur > 0) {
              setProgress(cTime / dur);
            }
          } catch (e) { /* ignore */ }
        } else if (audioRef.current && audioRef.current.duration > 0) {
          const cTime = audioRef.current.currentTime;
          const dur = audioRef.current.duration;
          setProgress(cTime / dur);
        }
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isPlaying, useIframeFallback]);

  // Immediately prefetch the next song in the background whenever the current song changes
  useEffect(() => {
    if (!currentTrack || tracks.length === 0) return;
    const currentIndex = Math.max(0, tracks.findIndex((t) => t.youtubeId === currentTrack.youtubeId));
    const nextIndex = (currentIndex + 1) % tracks.length;
    const nextTrack = tracks[nextIndex];
    
    if (nextTrack && prefetchedId.current !== nextTrack.youtubeId) {
      prefetchedId.current = nextTrack.youtubeId;
      fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/prefetch?id=${nextTrack.youtubeId}`).catch(() => {});
    }
  }, [currentTrack, tracks]);

  const handlePlayPause = useCallback(() => {
    if (useIframeFallback) {
      if (ytPlayerRef.current) {
        try {
          const playerState = ytPlayerRef.current.getPlayerState();
          if (playerState === 1) { // playing
            ytPlayerRef.current.pauseVideo();
            setIsPlaying(false);
          } else {
            ytPlayerRef.current.playVideo();
            setIsPlaying(true);
          }
        } catch (e) {
          setIsPlaying((p) => !p);
        }
      } else {
        setIsPlaying((p) => !p);
      }
      return;
    }

    if (!audioRef.current) {
      setIsPlaying((p) => !p);
      return;
    }
    if (audioRef.current.paused) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
    } else {
      audioRef.current.pause();
      setIsPlaying(false);
    }
  }, [useIframeFallback]);

  const handleStop = useCallback(() => {
    if (useIframeFallback) {
      if (ytPlayerRef.current) {
        try {
          ytPlayerRef.current.pauseVideo();
          ytPlayerRef.current.seekTo(0, true);
        } catch (e) { /* ignore */ }
      }
    } else if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setProgress(0);
    setIsPlaying(false);
  }, [useIframeFallback]);

  const handleSelectTrack = useCallback((track: Track, autoplay = true) => {
    setCurrentTrack(track);
    setProgress(0);
    setIsPlaying(autoplay);
    
    if (useIframeFallback && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.loadVideoById(track.youtubeId);
        if (autoplay) {
          ytPlayerRef.current.playVideo();
        } else {
          ytPlayerRef.current.pauseVideo();
        }
      } catch (e) { /* ignore */ }
    } else {
      setAudioUrl(`${import.meta.env.VITE_BACKEND_URL || ''}/stream?id=${track.youtubeId}`);
    }
  }, [useIframeFallback]);

  const handleNext = useCallback(() => {
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.youtubeId === currentTrack.youtubeId));
    const nextIndex = (currentIndex + 1) % tracks.length;
    handleSelectTrack(tracks[nextIndex], true);
  }, [currentTrack.youtubeId, handleSelectTrack, tracks]);

  const handlePrev = useCallback(() => {
    if (progress > 0.05) {
      setProgress(0);
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    if (!tracks.length) return;
    const currentIndex = Math.max(0, tracks.findIndex((track) => track.youtubeId === currentTrack.youtubeId));
    const previousIndex = (currentIndex - 1 + tracks.length) % tracks.length;
    handleSelectTrack(tracks[previousIndex], true);
  }, [currentTrack.youtubeId, handleSelectTrack, progress, tracks]);

  const handleSeek = useCallback(async (pct: number) => {
    setProgress(pct);
    if (useIframeFallback && ytPlayerRef.current) {
      try {
        const dur = ytPlayerRef.current.getDuration();
        if (dur) ytPlayerRef.current.seekTo(pct * dur, true);
      } catch (e) { /* ignore */ }
    } else if (audioRef.current && audioRef.current.duration) {
      audioRef.current.currentTime = pct * audioRef.current.duration;
    }
  }, [useIframeFallback]);

  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    if (useIframeFallback && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume(vol * 100);
      } catch (e) { /* ignore */ }
    } else if (audioRef.current) {
      audioRef.current.volume = vol;
    }
  }, [useIframeFallback]);

  // Set up Media Session API for mobile lock screen & media keys
  useEffect(() => {
    if ('mediaSession' in navigator) {
      // Ensure the image URL is absolute, as some mobile OS require it for the lock screen
      const artworkUrl = new URL(mainScene, window.location.href).href;
      
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: playlistName,
        artwork: [
          { src: artworkUrl, sizes: '512x512', type: 'image/png' }
        ]
      });

      navigator.mediaSession.setActionHandler('play', handlePlayPause);
      navigator.mediaSession.setActionHandler('pause', handlePlayPause);
      navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
      navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    }
  }, [currentTrack, playlistName, handlePlayPause, handlePrev, handleNext]);

  // Set up Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in the "Add Tape" input
      if (document.activeElement?.tagName === 'INPUT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          handlePlayPause();
          break;
        case 'ArrowRight':
          e.preventDefault();
          handleNext();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          handlePrev();
          break;
        case 'ArrowUp':
          e.preventDefault();
          handleVolumeChange(Math.min(1, volume + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          handleVolumeChange(Math.max(0, volume - 0.1));
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlePlayPause, handleNext, handlePrev, handleVolumeChange, volume]);

  useEffect(() => {
    if (useIframeFallback && ytPlayerRef.current) {
      try {
        if (isPlaying) {
          ytPlayerRef.current.playVideo();
        } else {
          ytPlayerRef.current.pauseVideo();
        }
      } catch (e) { /* ignore */ }
    }
  }, [isPlaying, useIframeFallback]);

  useEffect(() => {
    if (useIframeFallback && ytPlayerRef.current) {
      try {
        ytPlayerRef.current.setVolume(volume * 100);
      } catch (e) { /* ignore */ }
    }
  }, [volume, useIframeFallback]);

  const hydratePlaylist = useCallback(async (pid: string) => {
    if (!pid || hydratedPlaylistRef.current === pid) return;
    hydratedPlaylistRef.current = pid;
    
    try {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_URL || ''}/playlist?id=${pid}`);
      if (!res.ok) throw new Error('Failed to fetch playlist from backend');
      const data = await res.json();
      
      const playerTracks = data.tracks || [];
      if (!playerTracks.length) return;
      
      setTracks(playerTracks);
      
      const savedTrackId = localStorage.getItem('yaadein_track_id');
      if (savedTrackId) {
        const trackIndex = playerTracks.findIndex((t: Track) => t.youtubeId === savedTrackId);
        if (trackIndex >= 0) {
          setCurrentTrack(playerTracks[trackIndex]);
          return;
        }
      }
      
      setCurrentTrack(playerTracks[0]);
    } catch (err) {
      console.warn('Playlist hydrate error:', err);
    }
  }, []);

  useEffect(() => {
    hydratePlaylist(playlistId);
  }, [playlistId, hydratePlaylist]);

  const handleLoadNewTape = useCallback((name: string, link?: string) => {
    setPlaylistName(name);
    setIsPlaying(false);
    if (link) {
      let extractedId = link.trim();
      try {
        const url = new URL(extractedId);
        const listParam = url.searchParams.get('list');
        if (listParam) extractedId = listParam;
      } catch { /* fallback */ }
      setPlaylistId(extractedId);
      setTracks([]);
      setAudioUrl(null);
      
      setSavedTapes((prev) => {
        if (prev.some((t) => t.id === extractedId)) return prev;
        return [...prev, { id: extractedId, name }];
      });
      localStorage.removeItem('yaadein_track_id');
    }
  }, []);

  const handleDeleteTape = useCallback((id: string) => {
    setSavedTapes((prev) => prev.filter(t => t.id !== id));
  }, []);

  return (
    <>
      {!useIframeFallback && audioUrl && (
        <audio 
          ref={audioRef} 
          src={audioUrl} 
          autoPlay={isPlaying}
          onEnded={handleNext}
          onError={() => {
             console.warn('Audio stream failed, falling back to YouTube Iframe player...');
             setUseIframeFallback(true);
          }}
        />
      )}

      {useIframeFallback && (
        <div style={{ position: 'fixed', bottom: 0, right: 0, width: '200px', height: '200px', opacity: 0.001, pointerEvents: 'none', zIndex: -999 }}>
          <YouTube
            videoId={currentTrack.youtubeId}
            opts={{
              width: '200',
              height: '200',
              playerVars: {
                autoplay: isPlaying ? 1 : 0,
                controls: 0,
                disablekb: 1,
                fs: 0,
                iv_load_policy: 3,
                origin: window.location.origin,
              },
            }}
            onReady={(event) => {
              ytPlayerRef.current = event.target;
              event.target.setVolume(volume * 100);
              if (isPlaying) event.target.playVideo();
            }}
            onStateChange={(event) => {
              const state = event.data;
              if (state === 1) { // PLAYING
                setIsPlaying(true);
              } else if (state === 0) { // ENDED
                setIsPlaying(false);
                handleNext();
              } else if (state === 2) { // PAUSED
                setIsPlaying(false);
              }
            }}
            onError={() => {
              console.warn('YouTube Iframe error, skipping to next...');
              setTimeout(handleNext, 1000);
            }}
          />
        </div>
      )}

      <LoadingScreen visible={loading} />

      <div className="scene" id="immersive-scene">
        <img className="scene__artwork" src={mainScene} alt="Indian Night Scene" draggable={false} />
        <div className="scene__vignette" />
        
        <div className="credits-badge">
          <a href="https://arnb.in" target="_blank" rel="noopener noreferrer">arnb.in</a>
          <a href="https://github.com/arnab-iitkgp" target="_blank" rel="noopener noreferrer">GITHUB</a>
        </div>
        
        <AmbientParticles />
        <RetroTitleBlock isPlaying={isPlaying} tapeName={playlistName} />

        <CompactVintageBoombox
          currentTrack={currentTrack}
          isPlaying={isPlaying}
          progress={progress}
          volume={volume}
          playlistName={playlistName}
          playlistId={playlistId}
          savedTapes={savedTapes}
          tracks={tracks}
          onPlayPause={handlePlayPause}
          onStop={handleStop}
          onPrev={handlePrev}
          onNext={handleNext}
          onSelectTrack={(track) => handleSelectTrack(track, true)}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onLoadNewTape={handleLoadNewTape}
          onDeleteTape={handleDeleteTape}
          isVisible={isBoomboxVisible}
          isIdle={isIdle}
          onToggleVisibility={() => setIsBoomboxVisible(!isBoomboxVisible)}
        />
      </div>
    </>
  );
}
