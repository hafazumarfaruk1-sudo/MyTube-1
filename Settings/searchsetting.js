import React, { useState, useEffect, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, SafeAreaView, Platform, StatusBar, Keyboard, ActivityIndicator, Image, Dimensions, InteractionManager, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

// 🚨 [AI PACKAGES]
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as jpeg from 'jpeg-js';
import { Asset } from 'expo-asset';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { loadTensorflowModel } from 'react-native-fast-tflite';

const { width, height } = Dimensions.get('window');
const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export default function SearchSettingScreen({ route }) {
  const navigation = useNavigation();
  const inputRef = useRef(null);
  const { isDarkMode } = useTheme();
  const { t } = useLanguage();
  const __translate = t; 
  const styles = getDynamicStyles(isDarkMode);

  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [suggestions, setSuggestions] = useState([]);

  const [showResults, setShowResults] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [searchResults, setSearchResults] = useState([]);

  const [continuationToken, setContinuationToken] = useState(null);
  const [apiKey, setApiKey] = useState(null);

  // 🤖 [AI STATES & REFS]
  const genderModelRef = useRef(null);
  const scanQueueRef = useRef([]); 
  const isQueueProcessingRef = useRef(false);
  
  const [thumbStates, setThumbStates] = useState({}); 
  const [videoScanSettings, setVideoScanSettings] = useState({}); 

  // 🚨 [NEW] Master Controls
  const [masterVideoScan, setMasterVideoScan] = useState(global.appSettings?.aiVideoScan !== 'false');
  const [masterThumbScan, setMasterThumbScan] = useState(global.appSettings?.aiThumbScan !== 'false');
  const [masterThumbQuality, setMasterThumbQuality] = useState(global.appSettings?.thumbnailQuality || 'High');

  useEffect(() => {
    const loadData = async () => {
      try {
        const savedHistory = await AsyncStorage.getItem('myTubeSearchHistory');
        if (savedHistory) setHistory(JSON.parse(savedHistory));
      } catch (e) {}
    };
    loadData();

    if (!query && !route?.params?.initialSearch) {
      InteractionManager.runAfterInteractions(() => {
        const timeout = setTimeout(() => { inputRef.current?.focus(); }, 100);
        return () => clearTimeout(timeout);
      });
    }

    // Listen to Quality Changes from Settings Screen
    const qSub = DeviceEventEmitter.addListener('thumbQualityChanged', (val) => {
        setMasterThumbQuality(val);
    });
    return () => { qSub.remove(); }
  }, []);

  useEffect(() => {
    if (route?.params?.initialSearch) {
        const searchUrl = route.params.initialSearch;
        setQuery(searchUrl);
        handleSearchSubmit(searchUrl);
    }
  }, [route?.params?.initialSearch]);

  const loadGenderModelAsync = async () => {
    if (!genderModelRef.current) {
        try {
            const asset = Asset.fromModule(require('../assets/gender_classification.tflite'));
            await asset.downloadAsync();
            genderModelRef.current = await loadTensorflowModel({ url: asset.localUri || asset.uri }, []);
        } catch (e) { }
    }
  };

  const processImageForGender = async (uri) => {
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
                let cWidth = Math.floor(Math.max(10, faceWidth + padding * 2));
                let cHeight = Math.floor(Math.max(10, faceHeight + padding * 2)); 
                
                const croppedFace = await ImageManipulator.manipulateAsync(
                    uri, 
                    [{ crop: { originX, originY, width: cWidth, height: cHeight } }, { resize: { width: 224, height: 224 } }], 
                    { compress: 1, format: ImageManipulator.SaveFormat.JPEG }
                );
                
                await loadGenderModelAsync();
                const base64Data = await FileSystem.readAsStringAsync(croppedFace.uri, { encoding: FileSystem.EncodingType.Base64 });
                const rawBuffer = new Uint8Array(decode(base64Data));
                const rawImageData = jpeg.decode(rawBuffer, { useTArray: true });

                const pureInputBuffer = new ArrayBuffer(224 * 224 * 3 * 4);
                const inputData = new Float32Array(pureInputBuffer);

                let rgbIndex = 0;
                for (let j = 0; j < rawImageData.data.length; j += 4) {
                    inputData[rgbIndex++] = rawImageData.data[j] / 255.0;     
                    inputData[rgbIndex++] = rawImageData.data[j + 1] / 255.0; 
                    inputData[rgbIndex++] = rawImageData.data[j + 2] / 255.0; 
                }

                const output = await genderModelRef.current.run([pureInputBuffer]);
                let probability = output && output.length > 0 ? new Float32Array(output[0])[0] : 0;
                
                if (probability >= 0.50) { hasFemale = true; } 
                else { hasMale = true; }
            }
            if (hasFemale && hasMale) return 'b'; 
            if (hasFemale) return 'w';
            if (hasMale) return 'm';
        }
        return 'none';
    } catch (error) { return 'none'; }
  };

  useEffect(() => {
    let isActive = true;
    const processQueue = async () => {
        if (isQueueProcessingRef.current || scanQueueRef.current.length === 0) return;
        
        // 🚨 [NEW] মাস্টার থাম্বনেইল স্ক্যান অফ থাকলে স্কিপ করবে
        if (!masterThumbScan) {
            while(scanQueueRef.current.length > 0) {
                const item = scanQueueRef.current.shift();
                setThumbStates(prev => ({...prev, [item.id]: 'clean'}));
            }
            return;
        }

        isQueueProcessingRef.current = true;

        while(scanQueueRef.current.length > 0 && isActive) {
            const item = scanQueueRef.current.shift(); 
            setThumbStates(prev => ({...prev, [item.id]: 'scanning'}));

            try {
                const tempPath = `${FileSystem.cacheDirectory}thumb_search_${item.id}.jpg`;
                await FileSystem.downloadAsync(item.url, tempPath);
                
                const result = await processImageForGender(tempPath);
                await FileSystem.deleteAsync(tempPath, { idempotent: true });

                // 🚨 [NEW] ইউজার সেটিংস থেকে টার্গেট আনা হচ্ছে
                const target = global.appSettings?.aiBlurTarget || 'w';
                const needBlur = (result === target || result === 'b');
                
                setThumbStates(prev => ({...prev, [item.id]: needBlur ? 'blur' : 'clean'}));

            } catch (error) {
                setThumbStates(prev => ({...prev, [item.id]: 'clean'})); 
            }
            await new Promise(resolve => setTimeout(resolve, 200)); 
        }
        isQueueProcessingRef.current = false;
    };

    const intervalId = setInterval(processQueue, 1000);
    return () => { isActive = false; clearInterval(intervalId); };
  }, [masterThumbScan]);

  const handleTextChange = async (text) => {
    setQuery(text);
    if (showResults) setShowResults(false);
    if (text.trim().length > 0) {
      try {
        const res = await fetch(`http://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(text)}`);
        const data = await res.json();
        setSuggestions(data[1] || []);
      } catch (e) { setSuggestions([]); }
    } else { setSuggestions([]); }
  };

  const saveHistory = async (text) => {
    const updatedHistory = [text, ...history.filter(item => item !== text)].slice(0, 15);
    setHistory(updatedHistory);
    try { await AsyncStorage.setItem('myTubeSearchHistory', JSON.stringify(updatedHistory)); } catch (e) {}
  };

  const removeHistoryItem = async (itemToRemove) => {
    const updatedHistory = history.filter(item => item !== itemToRemove);
    setHistory(updatedHistory);
    try { await AsyncStorage.setItem('myTubeSearchHistory', JSON.stringify(updatedHistory)); } catch (e) {}
  };

  const handleSearchSubmit = async (searchTerm) => {
    const text = typeof searchTerm === 'string' ? searchTerm : query;
    if (text.trim().length === 0) return;

    inputRef.current?.blur();
    Keyboard.dismiss();

    saveHistory(text.trim());
    setQuery(text.trim());
    setSuggestions([]);
    setShowResults(true);

    const cleanUrl = text.replace(/\s/g, ''); 
    const ytLinkMatch = cleanUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:.*v=|.*\/|.*embed\/))([^&?]{11})/);

    InteractionManager.runAfterInteractions(() => {
      if (ytLinkMatch && ytLinkMatch[1]) {
        fetchSpecificVideoAndNavigate(ytLinkMatch[1]); 
      } else {
        fetchSearchResults(text.trim());
      }
    });
  };

  // 🚨 [NEW] Thumbnail Quality Getter (Synced with Global & Home Screen)
  const getDynamicThumbnail = (thumbnailObj, videoId) => {
      if (masterThumbQuality === 'Data Saver' && videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
      if (!thumbnailObj || !thumbnailObj.thumbnails || thumbnailObj.thumbnails.length === 0) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      let bestImgUrl = thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url;
      return bestImgUrl.startsWith('//') ? 'https:' + bestImgUrl : bestImgUrl;
  };

  const fetchSpecificVideoAndNavigate = async (targetId) => {
    setIsSearching(true);
    setSearchResults([]);
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${targetId}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        let foundVideo = null;
        const extractNodes = (node) => {
          if (foundVideo) return;
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer && node.videoRenderer.videoId === targetId) {
              foundVideo = node.videoRenderer;
            } else { Object.values(node).forEach(extractNodes); }
          }
        };
        extractNodes(jsonData);

        if (foundVideo) {
          const avatarUrl = getDynamicThumbnail(foundVideo.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null);
          const channelUrl = foundVideo.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || '';

          const fullVideoData = {
            type: 'video', id: foundVideo.videoId, title: foundVideo.title?.runs?.[0]?.text,
            channel: foundVideo.ownerText?.runs?.[0]?.text, views: foundVideo.shortViewCountText?.simpleText || 'N/A',
            duration: foundVideo.lengthText?.simpleText || '', publishedTime: foundVideo.publishedTimeText?.simpleText || '',
            thumbnail: getDynamicThumbnail(foundVideo.thumbnail, foundVideo.videoId),
            avatar: avatarUrl ? avatarUrl : 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg',
            channelUrl: channelUrl
          };
          setIsSearching(false);
          
          const doScan = masterVideoScan ? (videoScanSettings[targetId] !== false) : false; 
          navigation.replace('Player', { videoId: targetId, videoData: fullVideoData, aiScanEnabled: doScan });
          return;
        }
      }
    } catch (e) {}
    fetchSearchResults(targetId);
  };

  const fetchSearchResults = async (searchQuery) => {
    setIsSearching(true);
    setSearchResults([]);
    scanQueueRef.current = []; 
    setThumbStates({});

    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();

      const apiMatch = htmlText.match(/"INNERTUBE_API_KEY":"(.*?)"/);
      if (apiMatch && apiMatch[1]) setApiKey(apiMatch[1]);

      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const { finalFeed, nextToken, thumbQueue } = processYouTubeData(jsonData);
        
        const initialStates = {};
        thumbQueue.forEach(item => {
            initialStates[item.id] = masterThumbScan ? 'pending' : 'clean';
            if (masterThumbScan) scanQueueRef.current.push(item);
        });
        setThumbStates(prev => ({...prev, ...initialStates}));

        setSearchResults(finalFeed);
        setContinuationToken(nextToken);
      }
    } catch (e) {} finally { setIsSearching(false); }
  };

  const handleLoadMore = async () => {
    if (isLoadingMore || !continuationToken || !apiKey) return;
    setIsLoadingMore(true);
    try {
      const response = await fetch(`https://www.youtube.com/youtubei/v1/search?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'User-Agent': DESKTOP_AGENT },
        body: JSON.stringify({
          context: { client: { clientName: 'WEB', clientVersion: '2.20231214.00.00' } },
          continuation: continuationToken
        })
      });
      const data = await response.json();
      const { finalFeed, nextToken, thumbQueue } = processYouTubeData(data);

      const initialStates = {};
      thumbQueue.forEach(item => {
          if (!thumbStates[item.id]) {
              initialStates[item.id] = masterThumbScan ? 'pending' : 'clean';
              if (masterThumbScan) scanQueueRef.current.push(item);
          }
      });
      setThumbStates(prev => ({...prev, ...initialStates}));

      setSearchResults(prev => [...prev, ...finalFeed]);
      setContinuationToken(nextToken);
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  const processYouTubeData = (jsonData) => {
    const extractedVideos = [];
    const extractedShorts = [];
    const extractedChannels = [];
    let nextToken = null;

    const extractNodes = (node) => {
      if (Array.isArray(node)) node.forEach(extractNodes);
      else if (node && typeof node === 'object') {
        if (node.reelItemRenderer) extractedShorts.push(node.reelItemRenderer);
        else if (node.reelShelfRenderer) node.reelShelfRenderer.items?.forEach(item => { if (item.reelItemRenderer) extractedShorts.push(item.reelItemRenderer); });
        else if (node.videoRenderer) {
          const channelName = node.videoRenderer.ownerText?.runs?.[0]?.text || '';
          const titleText = node.videoRenderer.title?.runs?.[0]?.text?.toLowerCase() || '';
          const isShortBadge = node.videoRenderer.thumbnailOverlays?.some(overlay => overlay.thumbnailOverlayTimeStatusRenderer?.style === 'SHORTS');
          if (isShortBadge || !node.videoRenderer.lengthText || channelName.trim().startsWith('@') || titleText.includes('short') || titleText.includes('শর্ট')) {
             extractedShorts.push({
                videoId: node.videoRenderer.videoId, headline: { simpleText: node.videoRenderer.title?.runs?.[0]?.text },
                viewCountText: { simpleText: node.videoRenderer.shortViewCountText?.simpleText || node.videoRenderer.viewCountText?.simpleText || 'N/A' },
                thumbnail: node.videoRenderer.thumbnail 
             });
          } else { extractedVideos.push(node.videoRenderer); }
        } else if (node.channelRenderer) extractedChannels.push(node.channelRenderer);
        else if (node.continuationItemRenderer) nextToken = node.continuationItemRenderer.continuationEndpoint?.continuationCommand?.token;
        else Object.values(node).forEach(extractNodes);
      }
    };
    extractNodes(jsonData);

    const finalFeed = [];
    const thumbQueue = []; 

    extractedChannels.forEach(ch => {
      const avatarUrl = getDynamicThumbnail(ch.thumbnail, null) || 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg';
      finalFeed.push({
        type: 'channel', id: ch.channelId, title: ch.title?.simpleText,
        avatar: avatarUrl.startsWith('//') ? 'https:' + avatarUrl : avatarUrl, 
        subscribers: ch.subscriberCountText?.simpleText,
        channelUrl: ch.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || ''
      });
    });

    const uniqueShortsMap = new Map();
    extractedShorts.forEach(s => {
      const vidId = s.videoId;
      const title = s.headline?.simpleText || s.title?.simpleText || 'Shorts';
      if (vidId && title && !uniqueShortsMap.has(vidId)) {
        let thumbUrl = getDynamicThumbnail(s.thumbnail, vidId);
        uniqueShortsMap.set(vidId, { id: vidId, title: title, views: s.viewCountText?.simpleText || 'N/A', thumbnail: thumbUrl, type: 'short' });
        thumbQueue.push({ id: vidId, url: thumbUrl });
      }
    });

    const formattedShorts = Array.from(uniqueShortsMap.values()).slice(0, 15);
    if (formattedShorts.length > 0) finalFeed.push({ type: 'shorts_shelf', id: 'shorts_' + Date.now(), shorts: formattedShorts });

    const uniqueVideosMap = new Map();
    extractedVideos.forEach(v => {
      if (v.videoId && !uniqueVideosMap.has(v.videoId)) {
        const thumbUrl = getDynamicThumbnail(v.thumbnail, v.videoId);
        const avatarUrl = getDynamicThumbnail(v.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null);
        
        uniqueVideosMap.set(v.videoId, {
          type: 'video', id: v.videoId, title: v.title?.runs?.[0]?.text,
          channel: v.ownerText?.runs?.[0]?.text, views: v.shortViewCountText?.simpleText,
          duration: v.lengthText?.simpleText, publishedTime: v.publishedTimeText?.simpleText,
          thumbnail: thumbUrl,
          avatar: avatarUrl ? (avatarUrl.startsWith('//') ? 'https:' + avatarUrl : avatarUrl) : 'https://upload.wikimedia.org/wikipedia/commons/7/7e/Circle-icons-profile.svg',
          channelUrl: v.ownerText?.runs?.[0]?.navigationEndpoint?.commandMetadata?.webCommandMetadata?.url || ''
        });
        thumbQueue.push({ id: v.videoId, url: thumbUrl });
      }
    });

    finalFeed.push(...Array.from(uniqueVideosMap.values()));
    return { finalFeed, nextToken, thumbQueue };
  };

  const toggleVideoScan = (id) => {
      setVideoScanSettings(prev => ({...prev, [id]: !prev[id]}));
  };

  const navigateToPlayer = (item) => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setTimeout(() => {
        const doScan = masterVideoScan ? (videoScanSettings[item.id] !== false) : false;
        navigation.navigate('Player', { videoId: item.id, videoData: item, aiScanEnabled: doScan });
    }, 0);
  };

  const navigateToShorts = (short) => {
    Keyboard.dismiss();
    inputRef.current?.blur();
    setTimeout(() => {
        navigation.navigate('Shorts', { initialVideoId: short.id, videoId: short.id, videoData: short });
    }, 0);
  };

  // 🤖 [FIXED] THUMBNAIL RENDERER - Always forces a dark overlay if blur fails
  const renderAiThumbnail = (itemUrl, itemId, isShort = false) => {
      const state = thumbStates[itemId] || 'pending';

      if (state === 'pending' || state === 'scanning') {
          return (
              <View style={[isShort ? styles.shortThumb : styles.thumbnail, { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }]}>
                  {state === 'scanning' ? <ActivityIndicator size="small" color="#00FF00" /> : <Ionicons name="scan-outline" size={30} color="#444" />}
              </View>
          );
      }

      // 🚨 [FIXED] Force Black Overlay with "AI CENSORD" text just in case blurRadius misbehaves
      if (state === 'blur') {
          return (
              <View style={[isShort ? styles.shortThumb : styles.thumbnail, { position: 'relative', overflow: 'hidden' }]}>
                  <Image source={{ uri: itemUrl }} style={[StyleSheet.absoluteFillObject]} blurRadius={Platform.OS === 'ios' ? 20 : 40} />
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="eye-off" size={isShort ? 30 : 40} color="rgba(255,255,255,0.9)" />
                      <Text style={{color: '#FFF', fontSize: 10, marginTop: 4, fontWeight: 'bold'}}>AI CENSORD</Text>
                  </View>
              </View>
          );
      }

      return <Image source={{ uri: itemUrl }} style={isShort ? styles.shortThumb : styles.thumbnail} />;
  };

  const renderItem = ({ item }) => {
    if (item.type === 'shorts_shelf') {
      return (
        <View style={styles.shortsShelf}>
          <View style={styles.shelfHeader}>
            <Ionicons name="play-circle" size={22} color="#FF0000" />
            <Text style={styles.shelfTitle}>{__translate('Shorts')}</Text>
          </View>
          <FlatList 
            horizontal showsHorizontalScrollIndicator={false} data={item.shorts} 
            keyExtractor={(short, index) => short.id + '_' + index.toString()} 
            renderItem={({item: short}) => (
              <View style={styles.shortCardWrapper}>
                  <TouchableOpacity style={styles.shortCard} activeOpacity={0.9} onPress={() => navigateToShorts(short)}>
                    {renderAiThumbnail(short.thumbnail, short.id, true)}
                    <View style={styles.shortOverlay}>
                      <Text style={styles.shortTitle} numberOfLines={2}>{short.title}</Text>
                      <Text style={styles.shortViews}>{short.views}</Text>
                    </View>
                  </TouchableOpacity>
                  {/* 🚨 [REMOVED] Shorts-এর নিচে থাকা AI Scan বাটন মুছে দেওয়া হয়েছে */}
              </View>
          )} />
        </View>
      );
    }

    if (item.type === 'video') {
      const isScanOn = videoScanSettings[item.id] !== false; // Default true if master is ON
      return (
        <View style={styles.videoCard}>
          <TouchableOpacity activeOpacity={0.9} onPress={() => navigateToPlayer(item)}>
            {renderAiThumbnail(item.thumbnail, item.id, false)}
            {item.duration && <View style={styles.duration}><Text style={styles.durationText}>{item.duration}</Text></View>}
          </TouchableOpacity>
          <View style={styles.videoInfo}>
            <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
            <View style={styles.textContainer}>
              <Text style={styles.videoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.videoMeta}>{item.channel} • {item.views} • {item.publishedTime}</Text>
            </View>
            
            {/* 🚨 [NEW] Master Video Scan অন থাকলেই কেবল এই বাটনটি দেখাবে */}
            {masterVideoScan && (
                <TouchableOpacity 
                    style={[styles.videoAiScanToggle, { borderColor: isScanOn ? '#00BFA5' : '#555' }]} 
                    onPress={() => toggleVideoScan(item.id)}
                >
                    <Ionicons name="hardware-chip-outline" size={16} color={isScanOn ? '#00BFA5' : '#888'} />
                    <Text style={{ fontSize: 10, color: isScanOn ? '#00BFA5' : '#888', marginTop: 2, fontWeight: 'bold' }}>
                        {isScanOn ? 'SCAN ON' : 'SCAN OFF'}
                    </Text>
                </TouchableOpacity>
            )}
          </View>
        </View>
      );
    }

    if (item.type === 'channel') {
      return (
        <View style={styles.channelRow}>
          <Image source={{ uri: item.avatar }} style={styles.channelBigAvatar} />
          <View style={{ flex: 1, marginLeft: 15 }}>
            <Text style={styles.channelTitleMain}>{item.title}</Text>
            <Text style={styles.channelMetaMain}>{item.subscribers} • Channel</Text>
          </View>
        </View>
      );
    }
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: isDarkMode ? '#0F0F0F' : '#FFFFFF' }]}>
      <StatusBar backgroundColor={isDarkMode ? '#0F0F0F' : '#FFFFFF'} barStyle={isDarkMode ? 'light-content' : 'dark-content'} translucent={true} />

      <View style={styles.searchHeader}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.iconBtn}>
          <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#FFF' : '#000'} />
        </TouchableOpacity>

        <View style={styles.logoBox}>
          <Ionicons name="logo-youtube" size={22} color="#FF0000" />
          <Text style={styles.logoText}>{__translate('MyTube')}</Text>
        </View>

        <View style={styles.searchBar}>
          <TextInput 
            ref={inputRef} style={styles.input} placeholder={__translate('Search...')} 
            placeholderTextColor={isDarkMode ? '#888' : '#666'} value={query} 
            onChangeText={handleTextChange} onSubmitEditing={() => handleSearchSubmit(query)} 
            onTouchStart={() => { if (showResults) setShowResults(false); }}
            autoCorrect={false} autoCapitalize="none"
          />
          {query.length > 0 && (
            <TouchableOpacity onPress={() => { setQuery(''); setShowResults(false); inputRef.current?.focus(); }}>
              <Ionicons name="close-circle" size={18} color={isDarkMode ? '#AAA' : '#555'} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {!showResults ? (
          <FlatList 
            data={query ? suggestions : history} keyExtractor={(item, index) => index.toString()} 
            renderItem={({item}) => (
              <View style={styles.historyRowContainer}>
                <TouchableOpacity style={styles.historyClickableArea} onPress={() => handleSearchSubmit(item)}>
                  <Ionicons name={query ? "search-outline" : "time-outline"} size={22} color={isDarkMode ? '#AAA' : '#555'} />
                  <Text style={styles.historyText}>{item}</Text>
                </TouchableOpacity>
                {!query && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => removeHistoryItem(item)}>
                    <Ionicons name="close" size={22} color={isDarkMode ? '#FFF' : '#000'} />
                  </TouchableOpacity>
                )}
              </View>
          )} keyboardShouldPersistTaps="handled" />
        ) : (
          <>
            {isSearching ? (
              <View style={styles.center}><ActivityIndicator size="large" color="#FF0000" /></View>
            ) : (
              <FlatList 
                data={searchResults} keyExtractor={(item, index) => item.id + '_' + index.toString()} 
                renderItem={renderItem} onEndReached={handleLoadMore} onEndReachedThreshold={0.5} 
                ListFooterComponent={isLoadingMore && <ActivityIndicator color="#FF0000" style={{ margin: 20 }} />} 
                contentContainerStyle={{ paddingBottom: 20 }} removeClippedSubviews={true} 
                initialNumToRender={10} maxToRenderPerBatch={10} windowSize={5} 
              />
            )}
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

function getDynamicStyles(isDark) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: isDark ? '#0F0F0F' : '#FFFFFF', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
    searchHeader: { flexDirection: 'row', alignItems: 'center', height: 60, backgroundColor: isDark ? '#0F0F0F' : '#F8F8F8', paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#e6e6e6' },
    iconBtn: { padding: 4, marginRight: 8 },
    logoBox: { flexDirection: 'row', alignItems: 'center', marginRight: 12 },
    logoText: { color: isDark ? '#FFF' : '#000', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
    searchBar: { flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#222' : '#eee', borderRadius: 20, height: 38, paddingHorizontal: 15 },
    input: { flex: 1, color: isDark ? '#FFF' : '#000', fontSize: 14, paddingVertical: 0 },
    historyRowContainer: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 15 },
    historyClickableArea: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    historyText: { color: isDark ? '#FFF' : '#000', fontSize: 16, marginLeft: 15 },
    deleteBtn: { padding: 5, paddingLeft: 15 },
    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    videoCard: { marginBottom: 15 },
    thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#000' },
    duration: { position: 'absolute', bottom: 8, right: 8, backgroundColor: isDark ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.08)', padding: 4, borderRadius: 4 },
    durationText: { color: isDark ? '#FFF' : '#000', fontSize: 12 },
    videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
    channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: isDark ? '#333' : '#ccc' },
    textContainer: { flex: 1 },
    videoTitle: { color: isDark ? '#FFF' : '#000', fontSize: 14, fontWeight: '500' },
    videoMeta: { color: isDark ? '#AAA' : '#666', fontSize: 12, marginTop: 4 },
    videoAiScanToggle: { padding: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', width: 60, marginLeft: 10 },
    shortsShelf: { paddingVertical: 15, borderBottomWidth: 4, borderBottomColor: isDark ? '#222' : '#e6e6e6' },
    shelfHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 15, marginBottom: 12 },
    shelfTitle: { color: isDark ? '#FFF' : '#000', fontSize: 18, fontWeight: 'bold', marginLeft: 8 },
    shortCardWrapper: { marginLeft: 12, marginRight: 4, alignItems: 'center' },
    shortCard: { width: Dimensions.get('window').width * 0.4, height: Dimensions.get('window').width * 0.72, borderRadius: 12, overflow: 'hidden', backgroundColor: '#000' },
    shortThumb: { width: '100%', height: '100%' },
    shortOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 8, backgroundColor: isDark ? 'rgba(0,0,0,0.6)' : 'rgba(0,0,0,0.08)' },
    shortTitle: { color: isDark ? '#FFF' : '#000', fontSize: 13, fontWeight: 'bold', marginBottom: 2 },
    shortViews: { color: isDark ? '#CCC' : '#666', fontSize: 11 },
    channelRow: { flexDirection: 'row', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#e6e6e6' },
    channelBigAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: isDark ? '#333' : '#ccc' },
    channelTitleMain: { color: isDark ? '#FFF' : '#000', fontSize: 16, fontWeight: 'bold' },
    channelMetaMain: { color: isDark ? '#AAA' : '#666', fontSize: 12 }
  });
}