import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, Dimensions, Animated, PanResponder, TouchableOpacity, Text, LogBox, Modal, BackHandler, Share, TouchableWithoutFeedback, Linking, AppState, Image, Platform, ScrollView } from 'react-native';
import { useVideoPlayer, VideoView } from 'expo-video'; 
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio'; 
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Slider from '@react-native-community/slider';
import * as ScreenOrientation from 'expo-screen-orientation'; 
import * as WebBrowser from 'expo-web-browser'; 
import AsyncStorage from '@react-native-async-storage/async-storage'; 

import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy'; 
import { decode } from 'base64-arraybuffer'; 
import * as jpeg from 'jpeg-js';
import { Asset } from 'expo-asset'; 
import FaceDetection from '@react-native-ml-kit/face-detection';
import { loadTensorflowModel } from 'react-native-fast-tflite';

LogBox.ignoreLogs(['Video component', 'expo-audio', 'expo-video']);

const windowDim = Dimensions.get('window');
const PORTRAIT_WIDTH = Math.min(windowDim.width, windowDim.height);
const PORTRAIT_HEIGHT = Math.max(windowDim.width, windowDim.height);

const PLAYER_HEIGHT = (PORTRAIT_WIDTH * 9) / 16;
const MINI_WIDTH = PORTRAIT_WIDTH * 0.45;
const MINI_HEIGHT = (MINI_WIDTH * 9) / 16;

const MY_API_SERVER = "http://127.0.0.1:10000"; 

const safeSeek = (p, targetSec) => {
    if (!p) return;
    try {
        if (typeof p.seekTo === 'function') p.seekTo(targetSec);
        else if (typeof p.seekBy === 'function') p.seekBy(targetSec - p.currentTime);
        else p.currentTime = targetSec; 
    } catch (e) {}
};

const safeSetRate = (p, rate) => {
    if (!p) return;
    try {
        if (typeof p.setPlaybackRate === 'function') p.setPlaybackRate(rate);
        else if (typeof p.setRate === 'function') p.setRate(rate);
        else p.playbackRate = rate;
    } catch (e) {}
};

const safeSetVolume = (p, vol) => {
    if (!p) return;
    try {
        if (typeof p.setVolume === 'function') p.setVolume(vol);
        else p.volume = vol;
    } catch(e) {}
};

const safeSetMuted = (p, isMuted) => {
    if (!p) return;
    try {
        if (typeof p.setMuted === 'function') p.setMuted(isMuted);
        else p.muted = isMuted;
    } catch(e) {}
};

export default function GlobalPlayer() {
  const navigation = useNavigation();
  const videoViewRef = useRef(null); 
  const syncAudioRef = useRef(null); 
  
  const currentVideoIdRef = useRef(null);
  const fetchIdRef = useRef(0);
  
  const scale = useRef(new Animated.Value(1)).current;
  const baseScaleRef = useRef(1);
  const initialDistanceRef = useRef(null);
  const isZoomingRef = useRef(false);
  
  const lastTapRef = useRef({ time: 0, side: '' });
  const tapTimeoutRef = useRef(null);
  const isSlidingRef = useRef(false); 

  const [playerState, setPlayerState] = useState('hidden'); 
  const [isFullscreen, setIsFullscreen] = useState(false); 
  const [videoData, setVideoData] = useState(null);
  const [streamUrl, setStreamUrl] = useState(null);
  const [lowStreamUrl, setLowStreamUrl] = useState(null);
  
  const [videoSource, setVideoSource] = useState(null); 
  const resumeTimeRef = useRef(0); 

  const [streamMode, setStreamMode] = useState('combined');
  const [isAudioMode, setIsAudioMode] = useState(false);
  const [fallbackData, setFallbackData] = useState(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(1);
  const [buffered, setBuffered] = useState(0); 
  const [isPlayingUI, setIsPlayingUI] = useState(false); 

  const [showControls, setShowControls] = useState(true);
  const controlsTimeoutRef = useRef(null);
  
  const [showSettingsMenu, setShowSettingsMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  
  const [showAiMenu, setShowAiMenu] = useState(false);
  const [showAiTimeMenu, setShowAiTimeMenu] = useState(false);

  const [currentSpeed, setCurrentSpeed] = useState(1.0);
  const [scanInterval, setScanInterval] = useState(3.0);
  
  const [blurTarget, setBlurTarget] = useState('w'); 
  const [aiScanEnabled, setAiScanEnabled] = useState(false);

  const scanIntervalRef = useRef(3.0);
  const blurTargetRef = useRef('w');
  const aiScanEnabledRef = useRef(false);
  const lowStreamUrlRef = useRef(null); 

  const pan = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const isAudioModeRef = useRef(false);
  const streamModeRef = useRef('combined');
  const cachedAudioUrlRef = useRef(null); 
  
  const isSyncingRef = useRef(false);
  const pendingSeekRef = useRef(null); 

  const [frameList, setFrameList] = useState([]);
  const aiDataMapRef = useRef({}); 
  const targetScanSecRef = useRef(0); 
  const isAiProcessingRef = useRef(false); 
  const genderModelRef = useRef(null);

  const [isBlurredUI, setIsBlurredUI] = useState(false);
  const isBlurredRef = useRef(false);

  useEffect(() => {
      const loadAiSettings = async () => {
          try {
              const savedInterval = await AsyncStorage.getItem('ai_interval');
              if (savedInterval) {
                  const val = parseFloat(savedInterval);
                  setScanInterval(val);
                  scanIntervalRef.current = val;
              }
              const savedTarget = await AsyncStorage.getItem('ai_blur_target');
              if (savedTarget) {
                  setBlurTarget(savedTarget);
                  blurTargetRef.current = savedTarget;
              }
          } catch(e){}
      };
      loadAiSettings();

      const targetSub = DeviceEventEmitter.addListener('aiBlurTargetChanged', (newTarget) => {
          setBlurTarget(newTarget);
          blurTargetRef.current = newTarget;
      });

      const scanSub = DeviceEventEmitter.addListener('aiVideoScanChanged', (newScan) => {
          const isEnabled = newScan === 'true';
          setAiScanEnabled(isEnabled);
          aiScanEnabledRef.current = isEnabled;
          if (!isEnabled) {
              setIsBlurredUI(false);
              isBlurredRef.current = false;
          } else {
              startAiPipe(parseFloat(targetScanSecRef.current.toFixed(1)));
          }
      });

      return () => { targetSub.remove(); scanSub.remove(); };
  }, []);

  useEffect(() => {
    const setupAudio = async () => {
      try {
        await setAudioModeAsync({
          staysActiveInBackground: true, playsInSilentModeIOS: true, shouldDuckAndroid: true, playThroughEarpieceAndroid: false,
        });
      } catch (e) {}
    };
    setupAudio();
  }, []);

  const safeReleaseAudio = () => {
      if (syncAudioRef.current) {
          try { syncAudioRef.current.release(); } catch(e) {}
          syncAudioRef.current = null;
      }
  };

  const player = useVideoPlayer(videoSource, (p) => {
    if (!videoSource) return; 
    try { p.loop = false; } catch(e) {}
    safeSetRate(p, currentSpeed); 
    if (streamModeRef.current === 'separate') safeSetMuted(p, true); 
  });

  const triggerControls = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 4000);
  };

  useEffect(() => {
    const appStateSub = AppState.addEventListener('change', async (nextAppState) => {
        if (nextAppState.match(/inactive|background/)) {
            if (!isAudioModeRef.current) {
                if (player && player.playing) player.pause();
                if (syncAudioRef.current && syncAudioRef.current.playing) syncAudioRef.current.pause();
            }
        }
    });
    return () => appStateSub.remove();
  }, [player]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('state', (e) => {
      if (!e.data.state) return;
      const routes = e.data.state.routes;
      const currentRoute = routes[routes.length - 1].name;
      
      if (currentRoute !== 'Player' && currentRoute !== 'PlayerScreen') {
          setPlayerState((prev) => {
              if (prev === 'full' || prev === 'center' || prev === 'fullscreen') {
                  if (isFullscreen) { ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP); setIsFullscreen(false); }
                  return 'mini';
              }
              return prev;
          });
      }
    });
    return unsubscribe;
  }, [navigation, isFullscreen]);

  const handleSmartBack = () => {
      if (playerState === 'fullscreen') {
          toggleFullscreen(); 
          return true;
      } else if (playerState === 'center' || playerState === 'full') {
          setPlayerState('mini');
          const state = navigation.getState();
          if (state && state.routes) {
              const routes = state.routes;
              for (let i = routes.length - 1; i >= 0; i--) {
                  if (routes[i].name !== 'Player' && routes[i].name !== 'PlayerScreen') {
                      navigation.navigate(routes[i].name);
                      return true;
                  }
              }
          }
          navigation.navigate('Home'); 
          return true;
      }
      return false;
  };

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', handleSmartBack);
    return () => backHandler.remove();
  }, [playerState, navigation, isFullscreen]);

  useEffect(() => {
      Animated.spring(scale, { toValue: 1, useNativeDriver: false }).start();
      baseScaleRef.current = 1;
  }, [playerState]);

  const toggleFullscreen = async () => {
    try {
        if (isFullscreen) {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
            setIsFullscreen(false); setPlayerState('full'); scale.setValue(1); baseScaleRef.current = 1;
        } else {
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            setIsFullscreen(true); setPlayerState('fullscreen'); scale.setValue(1); baseScaleRef.current = 1;
        }
    } catch (error) {}
  };

  const startAiPipe = async (time) => {
      if (!lowStreamUrlRef.current || !aiScanEnabledRef.current) return;
      try {
          await fetch(`${MY_API_SERVER}/api/start-ai-pipe?url=${encodeURIComponent(lowStreamUrlRef.current)}&time=${time}&interval=${scanIntervalRef.current}`);
      } catch (e) {}
  };

  const seekTo = async (newTime) => {
      setCurrentTime(newTime); 
      targetScanSecRef.current = parseFloat(newTime.toFixed(1));
      
      if (aiScanEnabledRef.current) startAiPipe(targetScanSecRef.current);

      try {
          if (isAudioModeRef.current) {
              safeSeek(syncAudioRef.current, newTime); 
          } else {
              safeSeek(player, newTime); 
              if (streamModeRef.current === 'separate' && syncAudioRef.current) safeSeek(syncAudioRef.current, newTime); 
          }
      } catch (error) { }
  };

  useEffect(() => {
    const playSub = DeviceEventEmitter.addListener('playVideo', async (data) => {
      const scanStatus = data.aiScanEnabled || false;
      setAiScanEnabled(scanStatus);
      aiScanEnabledRef.current = scanStatus;

      // 🚨 [NEW] History Saving Logic - আপনার existing HistoryPage-এর সাথে লিঙ্ক করা হয়েছে
      try {
          const historyStr = await AsyncStorage.getItem('userHistory');
          let history = historyStr ? JSON.parse(historyStr) : [];
          
          // ডুপ্লিকেট রিমুভ করে সবার উপরে আনা
          history = history.filter(item => item.id !== data.videoId);
          
          const historyItem = {
              id: data.videoId,
              title: data.videoData?.title || 'Unknown Title',
              channel: data.videoData?.channel || 'Unknown Channel',
              date: new Date().toLocaleDateString() + ' • ' + new Date().toLocaleTimeString(),
              thumbnail: data.videoData?.thumbnail || `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg`,
          };

          history.unshift(historyItem);
          if (history.length > 200) history = history.slice(0, 200); // মেমোরি লিমিট
          
          await AsyncStorage.setItem('userHistory', JSON.stringify(history));
      } catch (error) {
          console.log("History Save Error:", error);
      }

      if (currentVideoIdRef.current === data.videoId) {
          setPlayerState('full');
          if (isFullscreen) toggleFullscreen();
          return;
      }

      fetchIdRef.current = Date.now();
      currentVideoIdRef.current = data.videoId;
      setVideoData(data.videoData);
      setPlayerState('full');
      
      setStreamUrl(null); setVideoSource(null); setLowStreamUrl(null); lowStreamUrlRef.current = null; resumeTimeRef.current = 0; 
      setFallbackData(null); setIsAudioMode(false); isAudioModeRef.current = false; cachedAudioUrlRef.current = null; pendingSeekRef.current = null;
      
      aiDataMapRef.current = {}; targetScanSecRef.current = 0; isAiProcessingRef.current = false; setFrameList([]); 
      setIsBlurredUI(false); isBlurredRef.current = false; setCurrentTime(0); setBuffered(0);
      scale.setValue(1); baseScaleRef.current = 1; triggerControls(); safeReleaseAudio();

      const targetQuality = global.appSettings?.normalVideo || '720p';
      fetchStreamUrl(data.videoId, targetQuality, fetchIdRef.current);
    });

    const audioModeSub = DeviceEventEmitter.addListener('toggleAudioMode', async (mode) => {
      setIsAudioMode(mode);
      isAudioModeRef.current = mode;

      if (mode) {
          resumeTimeRef.current = player ? player.currentTime : currentTime;
          if (player) player.pause();
          setVideoSource(null); setIsPlayingUI(true); 

          if (streamModeRef.current === 'separate' && syncAudioRef.current) {
              if (!syncAudioRef.current.playing) syncAudioRef.current.play();
          } else {
              let audioUrlToPlay = cachedAudioUrlRef.current;
              if (!audioUrlToPlay) {
                  try {
                      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${currentVideoIdRef.current}`)}&action=play&type=audio`);
                      const json = await res.json();
                      if (json.success && (json.audioUrl || json.url)) {
                          audioUrlToPlay = json.audioUrl || json.url;
                          cachedAudioUrlRef.current = audioUrlToPlay; 
                      }
                  } catch (e) {}
              }
              if (audioUrlToPlay) {
                  safeReleaseAudio();
                  syncAudioRef.current = createAudioPlayer(audioUrlToPlay);
                  pendingSeekRef.current = resumeTimeRef.current; 
                  safeSetRate(syncAudioRef.current, currentSpeed); 
                  syncAudioRef.current.play();
              }
          }
      } else {
          let resumeVideoTime = resumeTimeRef.current;
          if (syncAudioRef.current) {
              resumeVideoTime = syncAudioRef.current.currentTime;
              if (streamModeRef.current !== 'separate') safeReleaseAudio();
              else syncAudioRef.current.pause();
          }
          resumeTimeRef.current = resumeVideoTime;
          setVideoSource(streamUrl); 
      }
    });

    return () => { playSub.remove(); audioModeSub.remove(); };
  }, [isFullscreen, streamUrl]);

  useEffect(() => {
      let timeoutId;
      if (!isAudioMode && videoSource && player) {
          timeoutId = setTimeout(async () => {
              try {
                  if (resumeTimeRef.current > 0) safeSeek(player, resumeTimeRef.current); 
                  player.play();
                  if (streamModeRef.current === 'separate' && syncAudioRef.current) {
                      safeSeek(syncAudioRef.current, resumeTimeRef.current); syncAudioRef.current.play();
                  }
              } catch (e) {}
          }, 800); 
      }
      return () => clearTimeout(timeoutId);
  }, [videoSource, isAudioMode]);

  const fetchStreamUrl = async (vidId, targetQuality, fetchId) => {
    try {
      const qStr = targetQuality.toString().toUpperCase();
      let reqQ = 720;
      if (qStr.includes('8K') || qStr.includes('4320')) reqQ = 4320;
      else if (qStr.includes('4K') || qStr.includes('2160')) reqQ = 2160;
      else if (qStr.includes('2K') || qStr.includes('1440')) reqQ = 1440;
      else reqQ = parseInt(qStr.replace(/\D/g, '')) || 720;
      
      const res = await fetch(`${MY_API_SERVER}/api/extract?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${vidId}`)}&quality=${reqQ}&action=play`);
      const json = await res.json();

      if (fetchId !== fetchIdRef.current) return;

      if (json.success && json.url) {
          if (json.lowQualityUrl) {
              setLowStreamUrl(json.lowQualityUrl); 
              lowStreamUrlRef.current = json.lowQualityUrl;
              if (aiScanEnabledRef.current) startAiPipe(0);
          }
          
          const resQ = parseInt(json.quality) || 720;
          if (reqQ > resQ) {
              setFallbackData({ reqQ, resQ, data: json, message: `Requested ${reqQ}p is not available. Play ${resQ}p instead?` });
              return;
          }
          startPlayback(json);
      }
    } catch(e) {}
  };

  const startPlayback = async (json) => {
    setStreamMode(json.streamType || 'combined');
    streamModeRef.current = json.streamType || 'combined';
    cachedAudioUrlRef.current = json.audioUrl || null; 
    
    setStreamUrl(json.url);
    setVideoSource(json.url); 
    
    if (json.audioUrl && streamModeRef.current === 'separate') {
        safeReleaseAudio();
        syncAudioRef.current = createAudioPlayer(json.audioUrl);
        safeSetVolume(syncAudioRef.current, 1.0); 
        safeSetRate(syncAudioRef.current, currentSpeed); 
        syncAudioRef.current.play();
    }
  };

  const loadGenderModelAsync = async () => {
      if (!genderModelRef.current) {
          try {
              const asset = Asset.fromModule(require('../assets/gender_classification.tflite'));
              await asset.downloadAsync();
              genderModelRef.current = await loadTensorflowModel({ url: asset.localUri || asset.uri }, []);
          } catch (e) { }
      }
  };

  const processFrameForGender = async (uri) => {
      try {
          const faces = await FaceDetection.detect(uri);
          if (faces && faces.length > 0) {
              let hasFemale = false; let hasMale = false;

              for (let i = 0; i < faces.length; i++) {
                  const face = faces[i];
                  const box = face.frame || face.bounds || {}; 
                  
                  let padding = 20; 
                  let faceWidth = box.width ?? 0;
                  let faceHeight = box.height ?? 0;

                  let originX = Math.floor(Math.max(0, (box.left ?? box.x ?? box.originX ?? 0) - padding));
                  let originY = Math.floor(Math.max(0, (box.top ?? box.y ?? box.originY ?? 0) - padding));
                  
                  let width = Math.floor(Math.max(10, faceWidth + padding * 2));
                  let height = Math.floor(Math.max(10, faceHeight + padding * 2)); 
                  
                  const croppedFace = await ImageManipulator.manipulateAsync(
                      uri, 
                      [{ crop: { originX, originY, width, height } }, { resize: { width: 224, height: 224 } }], 
                      { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
                  );
                  
                  await loadGenderModelAsync();
                  const base64Data = await FileSystem.readAsStringAsync(croppedFace.uri, { encoding: FileSystem.EncodingType.Base64 });
                  const rawBuffer = new Uint8A