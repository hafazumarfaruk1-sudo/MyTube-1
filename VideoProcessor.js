/**
 * VideoProcessor.js
 * এই ফাইলটি নেটিভ ইঞ্জিন (YtDlpModule) থেকে পাওয়া কাঁচা JSON ডেটা প্রসেস করবে।
 * এটি অডিও, ভিডিও, এবং কমেন্ট আলাদা করে প্লেয়ার স্ক্রিনে পাঠাবে।
 */

export const processExtractedData = (rawJsonString, action = 'play', requestedQuality = 720) => {
    try {
        // নেটিভ ইঞ্জিন থেকে আসা স্ট্রিংটিকে JSON-এ রূপান্তর
        const output = JSON.parse(rawJsonString);

        // ==========================================
        // ১. শুধু অডিও ডাউনলোডের জন্য (action === 'audio')
        // ==========================================
        if (action === 'audio') {
            let audioLinks = [];
            const allAudio = output.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
            
            // বিটরেট অনুযায়ী অবরোহী ক্রমে সাজানো
            allAudio.sort((a, b) => (b.abr || 0) - (a.abr || 0));

            for (const f of allAudio) {
                const bitrate = f.abr ? Math.round(f.abr) : 'Unknown';
                const filesizeMB = f.filesize ? (f.filesize / 1048576).toFixed(2) + ' MB' : 'Unknown';
                
                audioLinks.push({
                    quality: `${bitrate}kbps`,
                    ext: f.ext === 'webm' ? 'opus' : f.ext,
                    url: f.url,
                    filesize: filesizeMB
                });
            }
            return { mode: 'audio', title: output.title, thumbnail: output.thumbnail, availableAudio: audioLinks };
        }

        // ==========================================
        // ২. ভিডিও ডাউনলোডের জন্য (action === 'download')
        // ==========================================
        if (action === 'download') {
            let downloadLinks = [];
            let seenHeights = new Set();

            const allCombined = output.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.ext === 'mp4' && f.height);
            allCombined.sort((a, b) => b.height - a.height);

            for (const f of allCombined) {
                if (!seenHeights.has(f.height)) {
                    seenHeights.add(f.height);
                    downloadLinks.push({
                        quality: `${f.height}p`, ext: f.ext, url: f.url,
                        filesize: f.filesize ? (f.filesize / 1048576).toFixed(2) + ' MB' : 'Unknown'
                    });
                }
            }
            return { mode: 'download', title: output.title, thumbnail: output.thumbnail, availableLinks: downloadLinks };
        }

        // ==========================================
        // ৩. প্লেয়ার মোড এবং কমেন্ট (action === 'play')
        // ==========================================
        if (action === 'play') {
            let finalVideoUrl = null;
            let finalAudioUrl = null;
            let streamType = 'combined';

            const combinedFormat = output.formats.slice().reverse().find(f =>
                f.height <= requestedQuality && f.vcodec !== 'none' && f.acodec !== 'none' && (f.ext === 'mp4' || f.ext === '3gp')
            );

            if (combinedFormat && requestedQuality <= 720) {
                finalVideoUrl = combinedFormat.url;
            } else {
                const vOnly = output.formats.slice().reverse().find(f => f.height <= requestedQuality && f.vcodec !== 'none' && f.acodec === 'none' && (f.ext === 'mp4' || f.ext === 'webm'));
                const aOnly = output.formats.slice().reverse().find(f => f.acodec !== 'none' && f.vcodec === 'none');
                if (vOnly && aOnly) {
                    finalVideoUrl = vOnly.url;
                    finalAudioUrl = aOnly.url;
                    streamType = 'separate';
                }
            }

            if (!finalVideoUrl) {
                const anyF = output.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || (output.formats.length > 0 ? output.formats[0] : null);
                finalVideoUrl = output.url || (anyF ? anyF.url : null);
            }

            // সিসি (Captions) লজিক
            let captions = [];
            const autoSubs = output.automatic_captions || {};
            const subs = output.subtitles || {};
            
            if (subs['bn']) {
                const vtt = subs['bn'].find(f => f.ext === 'vtt');
                if (vtt) captions.push({ label: 'Bengali (Original)', language: 'bn', uri: vtt.url });
            } else {
                const baseLang = autoSubs['en'] ? 'en' : Object.keys(autoSubs)[0];
                if (baseLang && autoSubs[baseLang]) {
                    const vtt = autoSubs[baseLang].find(f => f.ext === 'vtt');
                    if (vtt) captions.push({ label: 'Bengali (Translated)', language: 'bn', uri: vtt.url + '&tlang=bn' });
                }
            }

            // 🚨 কমেন্ট এক্সট্রাকশন (১০০টি কমেন্ট যা নেটিভ ইঞ্জিন পাঠাবে)
            const comments = output.comments ? output.comments.map(c => ({
                id: c.id,
                author: c.author,
                text: c.text,
                like_count: c.like_count || 0,
                time_text: c.time_text || ''
            })) : [];

            return { 
                mode: 'play', 
                streamType, 
                url: finalVideoUrl, 
                audioUrl: finalAudioUrl, 
                captions,
                title: output.title,
                thumbnail: output.thumbnail,
                comments: comments // 👈 কমেন্টগুলো এখানে রিটার্ন করা হলো
            };
        }

    } catch (error) {
        console.error("Data Processing Error:", error);
        return null;
    }
};
