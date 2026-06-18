import { Alert } from 'react-native';

const MY_API_SERVER = "http://127.0.0.1:10000"; // আপনার সার্ভারের ঠিকানা

export const triggerGlobalDownload = async ({ 
    videoId, 
    title, 
    thumbnail, 
    quality = '720p', // ডিফল্ট কোয়ালিটি 
    type = 'video'    // 'video' অথবা 'audio'
}) => {
    try {
        const downloadId = Date.now().toString(); // ইউনিক আইডি
        
        // টাইটেল থেকে স্পেশাল ক্যারেক্টার মুছে ফেলা (যাতে সেভ করতে সমস্যা না হয়)
        const safeTitle = (title || 'video').replace(/[<>:"\/\\|?*]+/g, '').trim();
        
        const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
        const thumbUrl = thumbnail || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

        // API URL তৈরি করা
        const dlApiUrl = `${MY_API_SERVER}/api/aria-download?id=${downloadId}&videoId=${videoId}&url=${encodeURIComponent(targetUrl)}&quality=${encodeURIComponent(quality)}&type=${type}&title=${encodeURIComponent(safeTitle)}&thumbnail=${encodeURIComponent(thumbUrl)}`;

        // সার্ভারে ডাউনলোডের রিকোয়েস্ট পাঠানো
        const response = await fetch(dlApiUrl);
        
        // রিকোয়েস্ট সফল হলে ইউজারকে জানানো (ঐচ্ছিক)
        if (response.ok) {
            console.log("Download started successfully!");
            // আপনি চাইলে এখানে টোস্ট (Toast) দেখাতে পারেন
        } else {
            Alert.alert("Error", "Failed to start download.");
        }

    } catch (error) {
        console.error("Download Request Error:", error);
        Alert.alert("Error", "Could not connect to download server.");
    }
};