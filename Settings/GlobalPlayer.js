import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, ActivityIndicator, Image, LogBox } from 'react-native';
import { Video, Audio } from 'expo-av';
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
  const videoRef = useRef(null);

  const currentVideoIdRef = useRef(null);
  const isLocalRef = useRef(false);
  const seekPosRef = useRef(0);

  const [playerState, setPlayerState] = useState('hidden'); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [videoKey, setVideoKey] = useState(Date.now().toString());

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;

  const setBackgroundAudio = async (enable) => {
    try {
        await Audio.setAudioModeAsync({
            staysActiveInBackground: enable,
            playsInSilentModeIOS: true,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: false,
        });
    } catch (e) {}
  };

  const fetchStreamUrl = async (vidId, targetQuality) => {
    try {
      const numQ = getNumericQuality(targetQuality);
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${numQ}&merge=true&t=${Date.now()}`;

      const res = await fetch(apiUrl);
      const json = await res.json();

      if (json.success && json.url) {
          setStreamUrl(json.url);
          setIsPlaying(true);
          setErrorMsg(null);
      } else {
          setErrorMsg("ভিডিওটি লোড করা যাচ্ছে না।");
      }
    } catch(e) { 
      setErrorMsg("সার্ভার কানেকশন এরর!");
    }
  };

  useEffect(() => {
    // ১. ভিডিও প্লে করার লিসেনার
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      const isAudio = data.videoData?.type === 'audio';
      if (videoData?.id === data.videoId) {
        setPlayerState('full');
        return; 
      }
      setIsAudioMode(isAudio);
      await setBackgroundAudio(isAudio); 
      currentVideoIdRef.current = data.videoId;
      isLocalRef.current = !!(data.videoData && data.videoData.localUri);
      setVideoData(data.videoData);
      setPlayerState('full');
      setStreamUrl(null);
      setErrorMsg(null);
      setIsPlaying(true);
      pan.setValue({ x: 0, y: 0 });
      setVideoKey(Date.now().toString());

      if (isLocalRef.current) {
          setStreamUrl(data.videoData.localUri);
          return;
      }
      const targetQuality = global.appSettings?.normalVideo || '720p';
      await fetchStreamUrl(data.videoId, targetQuality);
    });

    // ২. কোয়ালিটি পরিবর্তন লিসেনার (সেটিংস থেকে কাজ করবে)
    const qualitySub = DeviceEventEmitter.addListener('qualityChanged', async (newQuality) => {
       if (currentVideoIdRef.current && !isLocalRef.current) {
          let currentPos = 0;
          if (videoRef.current) {
              const status = await videoRef.current.getStatusAsync();
              currentPos = status.positionMillis || 0;
          }
          seekPosRef.current = currentPos;
          setStreamUrl(null);
          setVideoKey(Date.now().toString());
          await fetchStreamUrl(currentVideoIdRef.current, newQuality);
       }
    });

    const minSub = DeviceEventEmitter.addListener('minimizeVideo', () => setPlayerState('mini'));
    const maxSub = DeviceEventEmitter.addListener('maximizeVideo', () => { if (videoData) setPlayerState('full'); });

    const stopSub = DeviceEventEmitter.addListener('stopVideo', async () => {
      await setBackgroundAudio(false); 
      setPlayerState('hidden');
      setStreamUrl(null);
    });

    return () => { 
        playSub.remove(); 
        qualitySub.remove(); 
        minSub.remove(); 
        maxSub.remove(); 
        stopSub.remove(); 
    };
  }, [videoData]);

  // প্যান রেসপন্ডার (মিনি প্লেয়ার ড্র্যাগ করার জন্য)
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
        <TouchableOpacity 
            activeOpacity={0.9} 
            style={styles.touchable} 
            onPress={() => { if (!isFull && videoData) navigation.navigate('Player', { videoId: videoData.id, videoData }); }}
        >
           <View style={isFull ? styles.fullVideoWrapper : styles.miniVideoWrapper}>

               {errorMsg ? (
                  <View style={styles.loadingBox}>
                      <Ionicons name="warning-outline" size={isFull ? 40 : 24} color="#FF4444" />
                      <Text style={{color: '#FF4444', marginTop: 10, fontSize: isFull ? 16 : 12, textAlign: 'center'}}>{errorMsg}</Text>
                  </View>
               ) : streamUrl ? (
                  <Video 
                    key={videoKey} 
                    ref={videoRef} 
                    source={{ uri: streamUrl }} 
                    style={styles.video} 
                    shouldPlay={isPlaying} 
                    positionMillis={seekPosRef.current}
                    onLoad={() => { seekPosRef.current = 0; }}
                    useNativeControls={isFull} 
                    resizeMode={isFull ? "contain" : "cover"} 
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

               {/* মিনি প্লেয়ারের বাটন (Pause/Close) */}
               {!isFull && (
                  <View style={styles.overlay}>
                     <TouchableOpacity style={styles.miniPlayBtn} onPress={async () => {
                         if (videoRef.current) {
                             const status = await videoRef.current.getStatusAsync();
                             if (status?.isPlaying) { await videoRef.current.pauseAsync(); setIsPlaying(false); } 
                             else { await videoRef.current.playAsync(); setIsPlaying(true); }
                         }
                     }}>
                        <Ionicons name={isPlaying ? "pause" : "play"} size={26} color="#FFF" />
                     </TouchableOpacity>
                     <TouchableOpacity style={styles.miniCloseBtn} onPress={async () => {
                         await setBackgroundAudio(false); 
                         if (videoRef.current) await videoRef.current.pauseAsync();
                         setPlayerState('hidden'); setStreamUrl(null); pan.setValue({ x:0, y:0 });
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
  miniContainer: { 
    position: 'absolute', bottom: 80, right: 15, width: MINI_WIDTH, height: MINI_HEIGHT, 
    backgroundColor: '#000', zIndex: 9999, borderRadius: 12, overflow: 'hidden',
    elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.3, shadowRadius: 5
  },
  touchable: { flex: 1 },
  fullVideoWrapper: { flex: 1, backgroundColor: '#000' },
  miniVideoWrapper: { flex: 1, backgroundColor: '#111', position: 'relative' },
  video: { width: '100%', height: '100%' },
  loadingBox: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  audioPosterContainer: { ...StyleSheet.absoluteFillObject, zIndex: 10 },
  audioPosterBg: { width: '100%', height: '100%', resizeMode: 'cover' },
  audioPosterOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  miniPlayBtn: { width: 45, height: 45, borderRadius: 25, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  miniCloseBtn: { position: 'absolute', top: 5, right: 5, width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }
});