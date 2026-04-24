import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, ActivityIndicator, Image, LogBox } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; // expo-av থেকে expo-video তে পরিবর্তন
import { Audio } from 'expo-av'; // সিঙ্ক অডিওর জন্য আপাতত রাখা হলো
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';

LogBox.ignoreLogs(['[expo-av] Expo AV has been deprecated']);

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16;
const MINI_WIDTH = width * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;
const MY_API_SERVER = "http://127.0.0.1:10000"; 

const getNumericQuality = (q) => {
    if (!q || String(q).toLowerCase() === 'auto') return '720';
    const match = String(q).match(/\d+/);
    return match ? match[0] : '720';
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const syncAudioRef = useRef(new Audio.Sound()); 

  const seekPosRef = useRef(0);
  const currentVideoIdRef = useRef(null);
  const isLocalRef = useRef(false);
  const isAudioModeRef = useRef(false); 

  const [currentQuality, setCurrentQuality] = useState(global.appSettings?.normalVideo || '720p');
  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [streamMode, setStreamMode] = useState('combined'); 

  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false); 

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  // expo-video Player instance
  const player = useVideoPlayer(streamUrl, (p) => {
    p.loop = false;
    p.staysActiveInBackground = isAudioModeRef.current;
    if (isPlaying) p.play();
  });

  const checkIsMuxed = () => {
      if (isLocalRef.current) return true; 
      global.appSettings = global.appSettings || {};
      const currentQNum = parseInt(getNumericQuality(global.appSettings.normalVideo || '720'));
      return [360, 480, 720].includes(currentQNum) || streamMode === 'combined';
  };

  const fetchStreamUrl = async (vidId, targetQuality) => {
    try {
      const numQ = getNumericQuality(targetQuality);
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${numQ}&merge=true&t=${Date.now()}`;

      const res = await fetch(apiUrl);
      const json = await res.json();

      if (json.success && json.url) {
          setStreamMode(json.streamType || 'combined');
          setStreamUrl(json.url);
          
          // প্লেয়ারে নতুন URL সেট করা
          player.replace(json.url);

          if (json.streamType === 'manifest' || (json.streamType === 'separate' && json.audioUrl)) {
              // আলাদা অডিও সিঙ্কিং লজিক (যদি প্রয়োজন হয়)
              try { await syncAudioRef.current.unloadAsync(); } catch(e) {}
          }

          setIsPlaying(true);
          player.play();
          setErrorMsg(null);
      } else {
          setErrorMsg("This quality video is not available");
      }
    } catch(e) { 
      setErrorMsg("সার্ভার কানেকশন এরর!");
    }
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      if (videoData?.id === data.videoId) {
        setPlayerState('full');
        return; 
      }
      
      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setErrorMsg(null);
      setIsPlaying(true);

      if (isLocalRef.current) {
          setStreamMode('combined');
          setStreamUrl(data.videoData.localUri);
          player.replace(data.videoData.localUri);
          return;
      }

      const targetQuality = global.appSettings?.normalVideo || '720p';
      await fetchStreamUrl(data.videoId, targetQuality);
    });

    const stopSub = DeviceEventEmitter.addListener('stopVideo', () => {
      player.pause();
      setPlayerState('hidden');
    });

    return () => { playSub.remove(); stopSub.remove(); };
  }, [videoData, player]);

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 3 || Math.abs(g.dy) > 3,
    onPanResponderGrant: () => { pan.setOffset({ x: pan.x._value, y: pan.y._value }); pan.setValue({ x: 0, y: 0 }); },
    onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
    onPanResponderRelease: () => {
      pan.flattenOffset();
      let x = pan.x._value, y = pan.y._value;
      if (x > 10) x = 10; if (x < -(width - MINI_WIDTH - 20)) x = -(width - MINI_WIDTH - 20);
      if (y > 20) y = 20; if (y < -(height - MINI_HEIGHT - 120)) y = -(height - MINI_HEIGHT - 120);
      Animated.spring(pan, { toValue: { x, y }, friction: 6, useNativeDriver: false }).start();
    }
  })).current;

  if (playerState === 'hidden') return null;
  const isFull = playerState === 'full';
  const showCustomPoster = isAudioMode && !isLocalRef.current;

  return (
     <Animated.View 
        style={[isFull ? styles.fullContainer : [styles.miniContainer, { transform: [{ translateX: pan.x }, { translateY: pan.y }] }]]} 
        {...(isFull ? {} : panResponder.panHandlers)}
     >
        <TouchableOpacity activeOpacity={0.9} style={styles.touchable} onPress={() => { if (!isFull && videoData) navigation.navigate('Player', { videoId: videoData.id, videoData }); }}>
           <View style={isFull ? styles.fullVideoWrapper : styles.miniVideoWrapper}>

               {errorMsg ? (
                  <View style={styles.loadingBox}>
                      <Ionicons name="warning-outline" size={isFull ? 40 : 24} color="#FF4444" />
                      <Text style={{color: '#FF4444', marginTop: 10, fontSize: isFull ? 16 : 12, textAlign: 'center'}}>{errorMsg}</Text>
                  </View>
               ) : streamUrl ? (
                  <VideoView
                    player={player}
                    style={styles.video}
                    allowsFullscreen
                    allowsPictureInPicture
                    contentFit={isFull ? "contain" : "cover"}
                  />
               ) : (
                  <View style={styles.loadingBox}><ActivityIndicator size={isFull ? "large" : "small"} color="#FF0000" /></View>
               )}

               {showCustomPoster && (
                  <View style={styles.audioPosterContainer}>
                    <Image source={{ uri: videoData?.thumbnail }} style={styles.audioPosterBg} blurRadius={15} />
                    <View style={styles.audioPosterOverlay}>
                        <Ionicons name="musical-notes" size={isFull ? 50 : 20} color="#FFF" />
                    </View>
                  </View>
               )}

               {!isFull && (
                  <View style={styles.overlay}>
                     <TouchableOpacity style={styles.miniPlayBtn} onPress={() => {
                         if (player.playing) { player.pause(); setIsPlaying(false); }
                         else { player.play(); setIsPlaying(true); }
                     }}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.miniCloseBtn} onPress={() => {
                         player.pause(); setPlayerState('hidden');
                     }}>
                        <Ionicons name="close" size={24} color="#FFF" />
                     </TouchableOpacity>
                  </View>
               )}
           </View>
        </TouchableOpacity>
     </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullContainer: { position: 'absolute', top: 55, left: 0, width: width, height: PLAYER_HEIGHT, zIndex: 9999, backgroundColor: '#000' },
  miniContainer: { position: 'absolute', bottom: 80, right: 15, width: MINI_WIDTH, height: MINI_HEIGHT, backgroundColor: '#000', zIndex: 9999, elevation: 15, borderRadius: 12, overflow: 'hidden' },
  touchable: { flex: 1 },
  fullVideoWrapper: { flex: 1, backgroundColor: '#000' },
  miniVideoWrapper: { flex: 1, backgroundColor: '#111', borderRadius: 12, overflow: 'hidden' },
  video: { width: '100%', height: '100%' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioPosterContainer: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  audioPosterBg: { width: '100%', height: '100%' },
  audioPosterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  miniPlayBtn: { width: 45, height: 45, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }
});