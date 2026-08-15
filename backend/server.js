require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { spawn, execSync } = require('child_process');
const ytDlpConstants = require('youtube-dl-exec/src/constants');

// In-memory RAM cache for gapless playback (max 3 songs to prevent RAM leak on free hosts)
const streamCache = new Map();
let activePrefetchProcess = null;
let activePrefetchVideoId = null;

const app = express();
app.use(cors());

// Initialize Cookies securely for Production environments
const fs = require('fs');
const path = require('path');
const txtPath = path.join(__dirname, 'cookies.txt');

if (process.env.YOUTUBE_COOKIES_BASE64) {
    try {
        const decoded = Buffer.from(process.env.YOUTUBE_COOKIES_BASE64, 'base64').toString('utf8');
        fs.writeFileSync(txtPath, decoded);
        console.log("✅ Successfully loaded cookies from YOUTUBE_COOKIES_BASE64 environment variable.");
    } catch (e) {
        console.error("❌ Failed to decode YOUTUBE_COOKIES_BASE64", e);
    }
} else {
    // Fallback: Convert JSON cookies to Netscape format if json exists but txt doesn't
    const jsonPath = path.join(__dirname, '..', 'cookies.json');
    if (fs.existsSync(jsonPath) && !fs.existsSync(txtPath)) {
        try {
            const cookiesJson = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            let netscapeTxt = "# Netscape HTTP Cookie File\n# http://curl.haxx.se/rfc/cookie_spec.html\n# This is a generated file!  Do not edit.\n\n";
            for (const c of cookiesJson) {
                const domain = c.domain || "";
                const hostOnly = c.hostOnly ? "FALSE" : "TRUE";
                const pathStr = c.path || "/";
                const secure = c.secure ? "TRUE" : "FALSE";
                const expiry = c.expirationDate ? Math.round(c.expirationDate) : 0;
                netscapeTxt += `${domain}\t${hostOnly}\t${pathStr}\t${secure}\t${expiry}\t${c.name}\t${c.value}\n`;
            }
            fs.writeFileSync(txtPath, netscapeTxt);
            console.log("✅ Converted local cookies.json to Netscape cookies.txt");
        } catch (e) {
            console.error("❌ Failed to convert cookies:", e);
        }
    }
}

// Health check endpoint for UptimeRobot
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date() });
});

// Endpoint to fetch playlist metadata
app.get('/playlist', (req, res) => {
    const playlistId = req.query.id;
    if (!playlistId) return res.status(400).send('Missing ID');

    console.log(`Fetching playlist: ${playlistId}`);
    try {
        const url = `https://www.youtube.com/playlist?list=${playlistId}`;
        const output = execSync(`"${ytDlpConstants.YOUTUBE_DL_PATH}" -J --flat-playlist "${url}"`, { encoding: 'utf-8' });
        const data = JSON.parse(output);
        
        const tracks = (data.entries || []).map(entry => ({
            id: entry.id,
            youtubeId: entry.id,
            title: entry.title,
            artist: entry.uploader || 'Unknown Artist',
            duration: entry.duration || 0,
        })).filter(t => t.id);

        res.json({ tracks });
    } catch (err) {
        console.error('Playlist fetch error:', err.message);
        res.status(500).json({ error: 'Failed to fetch playlist' });
    }
});

// Endpoint to pre-fetch and cache a song in RAM before it plays
app.get('/prefetch', (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing ID');

    if (streamCache.has(videoId)) {
        return res.send('Already in cache');
    }

    // CRITICAL: Kill the previous active prefetch process to prevent 512MB RAM OOM crash
    if (activePrefetchProcess) {
        console.log(`[Prefetch] Killing previous prefetch process for ${activePrefetchVideoId} to save memory`);
        activePrefetchProcess.kill('SIGKILL');
        streamCache.delete(activePrefetchVideoId);
    }

    // Auto-Garbage Collection: Prevent memory leaks on 512MB Free Tier hosts
    if (streamCache.size >= 3) {
        const oldestKey = streamCache.keys().next().value;
        streamCache.delete(oldestKey);
        console.log(`[Cache GC] Evicted oldest stream: ${oldestKey}`);
    }

    console.log(`[Prefetch] Starting RAM buffer for: ${videoId}`);
    streamCache.set(videoId, { status: 'loading', chunks: [], timestamp: Date.now() });

    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const args = [
        url,
        '-f', '140/251/bestaudio', // Prioritize fast M4A/Opus formats
        '-o', '-',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player-client=default,-android_sdkless',
        '--quiet'
    ];

    if (fs.existsSync(txtPath)) args.push('--cookies', txtPath);

    const ytDlp = spawn(ytDlpConstants.YOUTUBE_DL_PATH, args);
    activePrefetchProcess = ytDlp;
    activePrefetchVideoId = videoId;

    ytDlp.stdout.on('data', (chunk) => {
        const cache = streamCache.get(videoId);
        if (cache) cache.chunks.push(chunk);
    });

    ytDlp.on('close', (code) => {
        console.log(`[Prefetch] Finished buffering ${videoId} (code ${code})`);
        if (activePrefetchVideoId === videoId) {
            activePrefetchProcess = null;
            activePrefetchVideoId = null;
        }
        
        const cache = streamCache.get(videoId);
        if (cache) {
            // Only set to done if yt-dlp succeeded and downloaded actual data!
            if (code === 0 && cache.chunks.length > 0) {
                cache.status = 'done';
            } else {
                console.log(`[Prefetch] Buffering failed or produced empty data for ${videoId}. Evicting.`);
                streamCache.delete(videoId);
            }
        }
    });

    res.send('Prefetching started');
});

// Endpoint to stream raw audio
app.get('/stream', (req, res) => {
    const videoId = req.query.id;
    if (!videoId) return res.status(400).send('Missing ID');

    // Serve instantly from RAM cache if pre-fetched!
    if (streamCache.has(videoId)) {
        const cache = streamCache.get(videoId);
        if (cache.status === 'done' && cache.chunks.length > 0) {
            const fullBuffer = Buffer.concat(cache.chunks);
            if (fullBuffer.length > 0) {
                console.log(`[Stream] Serving ${videoId} instantly from RAM Cache (${fullBuffer.length} bytes)!`);
                res.setHeader('Content-Type', 'audio/mp4'); // format 140 is m4a
                res.setHeader('Content-Length', fullBuffer.length);
                res.setHeader('Accept-Ranges', 'bytes');
                return res.send(fullBuffer);
            }
        }
        // If cache was invalid or empty, remove it
        streamCache.delete(videoId);
    }

    console.log(`[Stream] Live streaming (no cache): ${videoId}`);
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Transfer-Encoding', 'chunked');

    const args = [
        url,
        '-f', '140/251/bestaudio', // Prioritize fast M4A/Opus formats
        '-o', '-',
        '--js-runtimes', 'node',
        '--extractor-args', 'youtube:player-client=default,-android_sdkless',
        '--quiet'
    ];

    if (fs.existsSync(txtPath)) {
        args.push('--cookies', txtPath);
    } else if (fs.existsSync(path.join(__dirname, 'cookies.txt'))) {
        args.push('--cookies', path.join(__dirname, 'cookies.txt'));
    }

    const ytDlp = spawn(ytDlpConstants.YOUTUBE_DL_PATH, args);

    ytDlp.stdout.pipe(res);
    ytDlp.stderr.on('data', (d) => console.log('yt-dlp err:', d.toString()));
    ytDlp.on('close', () => res.end());

    // CRITICAL: Kill the yt-dlp python process if the user skips the song!
    // This prevents the 137 OOM Error on Render.
    req.on('close', () => {
        ytDlp.kill('SIGKILL');
    });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Crack Server running on port ${PORT}`));
