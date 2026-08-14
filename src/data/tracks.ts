export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number; // seconds
  youtubeId: string;
}

// ✅ Change this playlist ID to load any YouTube playlist!
export const YOUTUBE_PLAYLIST_ID = 'PLvFQV2EHZMIU6bQc0ZyIF6q23EActwm1w';

// 🎛️ Set to true to enable the retro cassette skin
export const RETRO_MODE = false;

export function formatDuration(seconds: number): string {
  if (!seconds) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

// Fetch a video's title from noembed (free, no API key needed)
export async function fetchVideoTitle(videoId: string): Promise<{ title: string; artist: string }> {
  try {
    const res = await fetch(`https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`);
    const data = await res.json();
    return {
      title: data.title || 'Track',
      artist: data.author_name || 'YouTube',
    };
  } catch {
    return { title: 'Track', artist: 'YouTube' };
  }
}
