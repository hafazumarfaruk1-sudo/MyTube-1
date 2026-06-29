/**
 * VideoProcessor.js
 */

export const processExtractedData = (rawJsonString, action = 'play', requestedQuality = 720) => {
    try {
        const output = JSON.parse(rawJsonString);

        // ==========================================
        // ১. শুধু অডিও ডাউনলোডের জন্য (action === 'audio')
        // ==========================================
        if (action === 'audio') {
            let audioLinks = [];
            const allAudio = output.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
            // বিটরেট অনুযায়ী অবরোহী ক্রমে (Best to Worst) সাজানো
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
        // ২. ডাউনলোড লিস্ট (action === 'download')
        // ==========================================
        if (action === 'download') {
            let downloadLinks = [];
            let seenHeights = new Set();

            const combined = output.formats.filter(f => f.vcodec !== 'none' && f.acodec !== 'none' && f.height);
            const videoOnly = output.formats.filter(f => f.vcodec !== 'none' && f.acodec === 'none' && f.height);
            
            const allFormats = [...combined, ...videoOnly];
            allFormats.sort((a, b) => b.height - a.height);

            for (const f of allFormats) {
                if (!seenHeights.has(f.height)) {
                    seenHeights.add(f.height);
                    let hasAudio = f.acodec !== 'none';
                    downloadLinks.push({
                        quality: `${f.height}p ${hasAudio ? '' : '(Mute/Video Only)'}`, 
                        ext: f.ext, 
                        url: f.url,
                        filesize: f.filesize ? (f.filesize / 1048576).toFixed(2) + ' MB' : 'Unknown'
                    });
                }
            }
            return { mode: 'download', title: output.title, thumbnail: output.thumbnail, availableLinks: downloadLinks };
        }

        // ==========================================
        // 🚀 ৩. প্লেয়ার মোড এবং ডাইনামিক অডিও (action === 'play')
        // ==========================================
        if (action === 'play') {
            let finalVideoUrl = null;
            let finalAudioUrl = null;
            let streamType = 'combined';

            const combinedFormat = output.formats.slice().reverse().find(f =>
                f.height <= requestedQuality && f.vcodec !== 'none' && f.acodec !== 'none' && (f.ext === 'mp4' || f.ext === '3gp')
            );

            // যদি ৩৬০p বা ৭২০p হয়, তবে অডিও-ভিডিও একসাথে থাকা লিংক ব্যবহার করা ভালো
            if (combinedFormat && requestedQuality <= 720 && requestedQuality >= 360) {
                finalVideoUrl = combinedFormat.url;
            } else {
                // ভিডিও অনলি লিংক খোঁজা
                const vOnly = output.formats.slice().reverse().find(f => 
                    f.height <= requestedQuality && f.vcodec !== 'none' && f.acodec === 'none' && (f.ext === 'mp4' || f.ext === 'webm')
                );
                
                // 🚨 ভিডিও কোয়ালিটির সাথে অডিও কোয়ালিটি অ্যাডজাস্ট করার স্মার্ট লজিক 🚨
                const audioFormats = output.formats.filter(f => f.acodec !== 'none' && f.vcodec === 'none');
                audioFormats.sort((a, b) => (b.abr || 0) - (a.abr || 0)); // Best to Worst সাজানো

                let aOnly = null;
                if (audioFormats.length > 0) {
                    if (requestedQuality >= 720) {
                        // 1080p, 720p: সবচেয়ে হাই কোয়ালিটি অডিও (লিস্টের প্রথমটা)
                        aOnly = audioFormats[0]; 
                    } else if (requestedQuality >= 360) {
                        // 480p, 360p: মিডিয়াম কোয়ালিটি অডিও (লিস্টের মাঝখানেরটা)
                        const midIndex = Math.floor(audioFormats.length / 2);
                        aOnly = audioFormats[midIndex] || audioFormats[0];
                    } else {
                        // 240p, 144p: সবচেয়ে লো কোয়ালিটি অডিও (ডেটা বাঁচানোর জন্য লিস্টের শেষেরটা)
                        aOnly = audioFormats[audioFormats.length - 1] || audioFormats[0];
                    }
                }

                if (vOnly && aOnly) {
                    finalVideoUrl = vOnly.url;
                    finalAudioUrl = aOnly.url;
                    streamType = 'separate';
                }
            }

            // কোনো লিংক না পেলে ফলব্যাক
            if (!finalVideoUrl) {
                const anyF = output.formats.find(f => f.vcodec !== 'none' && f.acodec !== 'none') || (output.formats.length > 0 ? output.formats[0] : null);
                finalVideoUrl = output.url || (anyF ? anyF.url : null);
            }

            return {
                mode: 'play',
                streamType,
                url: finalVideoUrl,
                audioUrl: finalAudioUrl,
                title: output.title,
                thumbnail: output.thumbnail
            };
        }

    } catch (error) {
        console.error("Data Processing Error:", error);
        return null;
    }
};