import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, Modal, BackHandler, Share, TouchableWithoutFeedback } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; // [NEW PLAYER]
import { Audio } from 'expo-av'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;
const MINI_WIDTH = width * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const syncAudioRef = useRef(new Audio.Sound()); 
  const currentVideoIdRef = useRef(null);
  const fetchIdRef = useRef(0);

  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  const [playbackSpeed, setPlaybackSpeed] = useState(1.0);
  const [showSpeedModal, setShowSpeedModal] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // --- [NEW PLAYER SETUP] ---
  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.play();
  });

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3000);
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      fetchIdRef.current = Date.now();
      currentVideoIdRef.current = data.videoId;
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setFallbackData(null);
      setIsAudioMode(false);
      triggerControls();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    return () => playSub.remove();
  }, []);

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      const isAuto = targetQuality === 'Auto';
      let reqQ = 720;
      
      // 🚨 বাগ ফিক্স: 8K, 4K, 2K কোয়ালিটি এখন সঠিকভাবে সংখ্যায় রূপান্তর হবে
      if (!isAuto) {
          const qStr = targetQuality.toString().toUpperCase();
          if (qStr.includes('8K') || qStr.includes('4320')) reqQ = 4320;
          else if (qStr.includes('4K') || qStr.includes('2160')) reqQ = 2160;
          else if (qStr.includes('2K') || qStr.includes('1440')) reqQ = 1440;
          else reqQ = parseInt(qStr.replace(/\D/g, '')) || 720;
      }
      
      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${reqQ}&action=play`);
      const json = await res.json();

      if (fetchId !== fetchIdRef.current) return;

      if (json.success && json.url) {
          const resQ = parseInt(json.quality) || 720;
          
          // যদি রিকোয়েস্ট করা কোয়ালিটি না মিলে, তবে ইউজারের পারমিশন চাইবে
          if (!isAuto && reqQ > resQ) {
              setFallbackData({ reqQ, resQ, data: json, message: `Requested ${reqQ}p (or 8K) is not available. Play highest quality ${resQ}p instead?` });
              return;
          }
          startPlayback(json);
      }
    } catch(e) { console.log("Fetch Error"); }
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined');
    setStreamUrl(json.url);
    
    if (json.audioUrl) {
        await syncAudioRef.current.unloadAsync().catch(()=>{});
        await syncAudioRef.current.loadAsync({ uri: json.audioUrl }, { shouldPlay: true }).catch(()=>{});
    }
  };

  // অডিও-ভিডিও সিঙ্কিং লজিক
  useEffect(() => {
    const interval = setInterval(async () => {
        if (streamMode === 'separate' && player.playing) {
            const audioStatus = await syncAudioRef.current.getStatusAsync();
            if (audioStatus.isLoaded) {
                const diff = Math.abs((player.currentTime * 1000) - audioStatus.positionMillis);
                if (diff > 500) await syncAudioRef.current.setPositionAsync(player.currentTime * 1000);
                if (!audioStatus.isPlaying) await syncAudioRef.current.playAsync();
            }
        } else if (!player.playing) {
            await syncAudioRef.current.pauseAsync().catch(()=>{});
        }
    }, 1000);
    return () => clearInterval(interval);
  }, [player.playing, streamMode]);

  if (playerState === 'hidden') return null;
  const isFull = playerState === 'full';

  return (
    <Animated.View style={[isFull ? styles.fullContainer : styles.miniContainer, !isFull && { transform: pan.getTranslateTransform() }]}>
      <View style={styles.videoWrapper}>
        
        {/* [NEW VIDEO VIEW] */}
        {streamUrl && !fallbackData && !isAudioMode && (
          <VideoView 
            player={player} 
            style={styles.video} 
            allowsFullscreen 
            allowsPictureInPicture
          />
        )}

        {/* অডিও মোড */}
        {isAudioMode && (
          <View style={styles.audioOverlay}><Ionicons name="headset" size={80} color="#FF0000" /></View>
        )}

        {/* ফলব্যাক অ্যালার্ট */}
        {fallbackData && (
          <View style={styles.fallbackOverlay}>
            <Text style={styles.fallbackText}>{fallbackData.message}</Text>
            <TouchableOpacity style={styles.btn} onPress={() => { startPlayback(fallbackData.data); setFallbackData(null); }}>
              <Text style={styles.btnText}>OK, Play {fallbackData.resQ}p</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* কাস্টম কন্ট্রোলস */}
        {isFull && showControls && (
          <View style={styles.controls}>
             <TouchableOpacity style={styles.backBtn} onPress={() => setPlayerState('mini')}>
                <Ionicons name="chevron-down" size={35} color="#FFF" />
             </TouchableOpacity>
             
             <View style={styles.centerRow}>
                <TouchableOpacity onPress={() => player.playing ? player.pause() : player.play()}>
                   <Ionicons name={player.playing ? "pause-circle" : "play-circle"} size={70} color="#FFF" />
                </TouchableOpacity>
             </View>

             <View style={styles.bottomBar}>
                <Slider 
                  style={{flex: 1}}
                  minimumValue={0}
                  maximumValue={player.duration}
                  value={player.currentTime}
                  onSlidingComplete={(v) => player.currentTime = v}
                  minimumTrackTintColor="#FF0000"
                  thumbTintColor="#FF0000"
                />
             </View>
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 0, left: 0, width: width, height: PLAYER_HEIGHT + 50, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { position: 'absolute', bottom: 100, right: 20, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', borderRadius: 15, overflow: 'hidden', elevation: 10, borderWidth: 1, borderColor: '#00FF00' },
  videoWrapper: { flex: 1, justifyContent: 'center' },
  video: { width: '100%', height: '100%' },
  controls: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  backBtn: { position: 'absolute', top: 10, left: 10 },
  centerRow: { flexDirection: 'row', alignItems: 'center' },
  bottomBar: { position: 'absolute', bottom: 10, width: '90%', flexDirection: 'row' },
  audioOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' },
  fallbackOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  fallbackText: { color: '#FFF', textAlign: 'center', marginBottom: 20, fontSize: 16 },
  btn: { backgroundColor: '#FF0000', padding: 12, borderRadius: 8 },
  btnText: { color: '#FFF', fontWeight: 'bold' }
});