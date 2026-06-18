import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Platform, Dimensions, RefreshControl, ScrollView, Switch, BackHandler, DeviceEventEmitter } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// [NEW] Global Theme & Language Context Imports
import { useTheme } from '../ThemeContext'; 
import { useLanguage } from '../LanguageContext'; 

import SettingsScreen from '../Settings/SettingsScreen';
import ShortsScreen from './ShortsScreen'; 
import LiveScreen from './livescreen';

// 🚨 [AI PACKAGES]
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';
import * as jpeg from 'jpeg-js';
import { Asset } from 'expo-asset';
import FaceDetection from '@react-native-ml-kit/face-detection';
import { loadTensorflowModel } from 'react-native-fast-tflite';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEED_TOPICS = [ "trending bangladesh", "bangla natok 2026", "bangla new song", "somoy tv live", "cricket highlights", "bangla waz short", "bengali vlog", "bangla news today" ];
global.aiMemory = global.aiMemory || {};
global.seenVideoIds = global.seenVideoIds || new Set(); 

export default function HomeScreen({ route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();

  const { isDarkMode, toggleDarkMode } = useTheme();
  const { locale, changeLanguage, t } = useLanguage(); 

  const [activeTab, setActiveTab] = useState('Home');
  const [meView, setMeView] = useState('main'); 

  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShortId, setSelectedShortId] = useState(null);
  const [thumbQuality, setThumbQuality] = useState(global.appSettings?.thumbnailQuality || 'High');
  const [activeQuery, setActiveQuery] = useState('');

  // 🤖 [AI STATES & REFS]
  const genderModelRef = useRef(null);
  const scanQueueRef = useRef([]); 
  const isQueueProcessingRef = useRef(false);
  
  const [thumbStates, setThumbStates] = useState({}); 
  const [videoScanSettings, setVideoScanSettings] = useState({}); 

  // 🚨 [NEW] Master Controls
  const [masterVideoScan, setMasterVideoScan] = useState(global.appSettings?.aiVideoScan !== 'false');
  const [masterThumbScan, setMasterThumbScan] = useState(global.appSettings?.aiThumbScan !== 'false');

  const getAlgorithmicTopic = async () => {
    try {
      const suffixes = ["", "today", "new", "2026", "latest"];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
      return `${FEED_TOPICS[Math.floor(Math.random() * FEED_TOPICS.length)]} ${suffix}`.trim();
    } catch (e) { return FEED_TOPICS[0]; }
  };

  useEffect(() => {
    const loadGlobalData = async () => {
      try {
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);
        
        // 🚨 Sync Master Settings
        setMasterVideoScan(global.appSettings?.aiVideoScan !== 'false');
        setMasterThumbScan(global.appSettings?.aiThumbScan !== 'false');

        if (!activeQuery) setActiveQuery(await getAlgorithmicTopic());
      } catch (e) {}
    };
    if (isFocused) loadGlobalData();

    // 🚨 Listen to Quality Changes from Settings Screen
    const qualitySub = DeviceEventEmitter.addListener('thumbQualityChanged', (newQuality) => {
        setThumbQuality(newQuality);
    });

    return () => { qualitySub.remove(); }
  }, [isFocused]);

  useEffect(() => {
    if (route?.params?.executeSearch) {
        setActiveTab('Home'); setSearchQuery(route.params.executeSearch); setActiveQuery(route.params.executeSearch);
    }
    if (route?.params?.targetTab) setActiveTab(route.params.targetTab);
  }, [route?.params]);

  useEffect(() => {
    if (activeQuery) fetchRealVideos(activeQuery, true);
  }, [activeQuery]);

  useEffect(() => {
    const backAction = () => {
      if (activeTab === 'ME' && meView !== 'main') {
        setMeView('main');
        return true;
      }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [activeTab, meView]);

  // 🤖 [AI MODEL LOADER]
  const loadGenderModelAsync = async () => {
    if (!genderModelRef.current) {
        try {
            const asset = Asset.fromModule(require('../assets/gender_classification.tflite'));
            await asset.downloadAsync();
            genderModelRef.current = await loadTensorflowModel({ url: asset.localUri || asset.uri }, []);
        } catch (e) { }
    }
  };

  // 🤖 [AI IMAGE PROCESSOR]
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

  // 🤖 [BACKGROUND QUEUE PROCESSOR]
  useEffect(() => {
    let isActive = true;
    const processQueue = async () => {
        if (isQueueProcessingRef.current || scanQueueRef.current.length === 0) return;
        
        // 🚨 মাস্টার থাম্বনেইল স্ক্যান অফ থাকলে স্কিপ করবে
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
                const tempPath = `${FileSystem.cacheDirectory}thumb_home_${item.id}.jpg`;
                await FileSystem.downloadAsync(item.url, tempPath);
                
                const result = await processImageForGender(tempPath);
                await FileSystem.deleteAsync(tempPath, { idempotent: true });

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

  const handleRefresh = async () => {
    setRefreshing(true);
    scanQueueRef.current = []; 
    setThumbStates({});
    setActiveQuery(await getAlgorithmicTopic());
  };

  const loadMoreVideos = async () => {
    if (isFetchingMore || loading) return; 
    setIsFetchingMore(true);
    await fetchRealVideos(await getAlgorithmicTopic(), false);
    setIsFetchingMore(false);
  };

  const getHighQualityThumbnail = (thumbnailObj, videoId) => {
    if (thumbQuality === 'Data Saver' && videoId) return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
    if (!thumbnailObj || !thumbnailObj.thumbnails || thumbnailObj.thumbnails.length === 0) return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    let bestImgUrl = thumbnailObj.thumbnails[thumbnailObj.thumbnails.length - 1].url;
    return bestImgUrl.startsWith('//') ? 'https:' + bestImgUrl : bestImgUrl;
  };

  const fetchRealVideos = async (query, isNewSearch = false, retryCount = 0) => {
    if (isNewSearch && retryCount === 0) {
        setLoading(true);
        scanQueueRef.current = []; 
        setThumbStates({});
    }
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);

      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = [];
        const thumbQueue = []; 

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                const channelName = node.videoRenderer.ownerText?.runs?.[0]?.text || '';
                const titleText = node.videoRenderer.title?.runs?.[0]?.text?.toLowerCase() || '';
                // 🚨 Filter out shorts from main feed
                if (!(channelName.trim().startsWith('@') || titleText.includes('short') || titleText.includes('শর্ট'))) {
                    extractedVideos.push(node.videoRenderer);
                }
            }
            else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);

        const freshVideos = extractedVideos.filter(vid => {
            if (global.seenVideoIds.has(vid.videoId)) return false;
            global.seenVideoIds.add(vid.videoId); return true;
        });

        const formattedVideos = freshVideos.map(vid => {
            const thumbUrl = getHighQualityThumbnail(vid.thumbnail, vid.videoId);
            thumbQueue.push({ id: vid.videoId, url: thumbUrl });
            
            return {
                id: vid.videoId, title: vid.title?.runs?.[0]?.text || 'No Title', channel: vid.ownerText?.runs?.[0]?.text || 'Channel',
                views: vid.shortViewCountText?.simpleText || 'N/A', duration: vid.lengthText?.simpleText || '', publishedTime: vid.publishedTimeText?.simpleText || '',
                thumbnail: thumbUrl, 
                avatar: getHighQualityThumbnail(vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null), type: 'video'
            };
        });

        // 🤖 Queue Setup
        const initialStates = {};
        thumbQueue.forEach(item => {
            initialStates[item.id] = masterThumbScan ? 'pending' : 'clean';
            if (masterThumbScan) scanQueueRef.current.push(item);
        });
        setThumbStates(prev => ({...prev, ...initialStates}));

        setVideos(isNewSearch ? formattedVideos : [...videos, ...formattedVideos]);
      }
    } catch (e) {} finally { setLoading(false); setRefreshing(false); }
  };

  const toggleVideoScan = (id) => {
      setVideoScanSettings(prev => ({...prev, [id]: !prev[id]}));
  };

  const navigateToPlayer = (item) => {
    const doScan = masterVideoScan ? (videoScanSettings[item.id] !== false) : false;
    navigation.navigate('Player', { videoId: item.id, videoData: item, aiScanEnabled: doScan });
  };

  const styles = getDynamicStyles(isDarkMode);

  // 🤖 [THUMBNAIL RENDERER]
  const renderAiThumbnail = (itemUrl, itemId) => {
      const state = thumbStates[itemId] || 'pending';

      if (state === 'pending' || state === 'scanning') {
          return (
              <View style={[styles.thumbnail, { backgroundColor: '#111', justifyContent: 'center', alignItems: 'center' }]}>
                  {state === 'scanning' ? <ActivityIndicator size="small" color="#00FF00" /> : <Ionicons name="scan-outline" size={30} color="#444" />}
              </View>
          );
      }

      if (state === 'blur') {
          return (
              <View style={[styles.thumbnail, { position: 'relative', overflow: 'hidden' }]}>
                  <Image source={{ uri: itemUrl }} style={[StyleSheet.absoluteFillObject]} blurRadius={Platform.OS === 'ios' ? 20 : 40} />
                  <View style={[StyleSheet.absoluteFillObject, { backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center' }]}>
                      <Ionicons name="eye-off" size={40} color="rgba(255,255,255,0.9)" />
                      <Text style={{color: '#FFF', fontSize: 10, marginTop: 4, fontWeight: 'bold'}}>AI CENSORD</Text>
                  </View>
              </View>
          );
      }

      return <Image source={{ uri: itemUrl }} style={styles.thumbnail} />;
  };

  const renderVideoItem = ({ item }) => {
    const isScanOn = videoScanSettings[item.id] !== false; 
    
    return (
      <View style={styles.videoCard}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => navigateToPlayer(item)}>
          {renderAiThumbnail(item.thumbnail, item.id)}
          {item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{item.duration}</Text></View> : null}
        </TouchableOpacity>

        <View style={styles.videoInfo}>
          <TouchableOpacity activeOpacity={0.8} onPress={() => navigation.navigate('Channel', { channelName: item.channel, channelAvatar: item.avatar })}>
            <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
          </TouchableOpacity>
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.meta}>{item.channel} • {item.views}</Text>
          </View>

          {/* 🚨 [NEW] Master Video Scan ON থাকলে বাটনটি দেখাবে */}
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
  };

  const MeMenuCard = ({ icon, iconBg, iconColor, title, subtitle, onPress, isSwitch, switchValue, onSwitchChange }) => (
    <TouchableOpacity style={styles.meMenuCard} activeOpacity={isSwitch ? 1 : 0.8} onPress={isSwitch ? null : onPress}>
      <View style={[styles.meMenuIconBox, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={22} color={iconColor} />
      </View>
      <View style={styles.meMenuTextContent}>
        <Text style={styles.meMenuTitle}>{title}</Text>
        <Text style={styles.meMenuSubtitle}>{subtitle}</Text>
      </View>
      {isSwitch ? (
        <Switch 
          value={switchValue} onValueChange={onSwitchChange} 
          trackColor={{ false: '#d1d1d1', true: 'rgba(255, 0, 0, 0.5)' }} thumbColor={switchValue ? '#FF0000' : '#f4f3f4'} 
        />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={isDarkMode ? "#555" : "#AAA"} style={{ marginLeft: 8 }} />
      )}
    </TouchableOpacity>
  );

  const languagesList = [
    { id: 'bn', name: 'বাংলা' }, { id: 'en', name: 'English' }, { id: 'hi', name: 'हिन्दी' },
    { id: 'ur', name: 'اردو' }, { id: 'fa', name: 'فارسی' }, { id: 'ar', name: 'العربية' }
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor={isDarkMode ? "#0F0F0F" : "#FFFFFF"} barStyle={isDarkMode ? "light-content" : "dark-content"} translucent={true} />

      {activeTab === 'Home' && (
        <View style={styles.header}>
          <View style={styles.logoContainer}>
             <Ionicons name="logo-youtube" size={28} color="#FF0000" />
             <Text style={styles.logoText}>{t('MyTube')}</Text>
          </View>
          <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
            <Text style={{ flex: 1, color: isDarkMode ? '#888' : '#666', fontSize: 14 }}>{searchQuery || t('search')}</Text>
            <Ionicons name="search" size={18} color={isDarkMode ? "#AAA" : "#888"} />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainContent}>
       {activeTab === 'Home' ? (
          loading && videos.length === 0 ? ( 
            <View style={{ paddingTop: 10 }}>
              {[1, 2, 3].map((key) => (
                <View key={key} style={styles.skeletonCard}>
                  <View style={styles.skeletonThumbnail} /><View style={styles.skeletonInfo}><View style={styles.skeletonAvatar} /><View style={styles.skeletonTextContainer}><View style={styles.skeletonTitle} /><View style={styles.skeletonMeta} /></View></View>
                </View>
              ))}
            </View>
          ) : (
            <FlatList 
              data={videos} renderItem={renderVideoItem} keyExtractor={(item, index) => item.id + index.toString()} 
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} 
              onEndReached={loadMoreVideos} onEndReachedThreshold={0.5} 
              ListFooterComponent={isFetchingMore ? <ActivityIndicator size="small" color="#FF0000" style={{ marginVertical: 20 }} /> : null}
            />
          )
        ) : activeTab === 'Live' ? (
          <LiveScreen /> 
        ) : activeTab === 'Shorts' ? (
          <ShortsScreen initialVideoId={selectedShortId} />
        ) : activeTab === 'Settings' ? (
          <SettingsScreen />
        ) : activeTab === 'ME' ? (
          <View style={styles.meContainer}>

            {meView === 'main' ? (
              <>
                <Text style={styles.meSectionTitle}>{t('menu')}</Text>
                <ScrollView contentContainerStyle={styles.meMenuWrapper} showsVerticalScrollIndicator={false}>
                   <MeMenuCard icon="time" iconBg="rgba(255, 152, 0, 0.12)" iconColor="#FF9800" title={t('history')} subtitle={t('historyDesc')} onPress={() => navigation.navigate('History')} />
                   <MeMenuCard icon="download" iconBg="rgba(76, 175, 80, 0.12)" iconColor="#4CAF50" title={t('download')} subtitle={t('downloadDesc')} onPress={() => DeviceEventEmitter.emit('openDownloadScreen')} />
                   <MeMenuCard icon="logo-youtube" iconBg="rgba(244, 67, 54, 0.12)" iconColor="#F44336" title={t('subscribe')} subtitle={t('subscribeDesc')} onPress={() => navigation.navigate('Subscriptions')} />
                   <MeMenuCard icon="list" iconBg="rgba(103, 58, 183, 0.12)" iconColor="#8E24AA" title={t('playlist')} subtitle={t('playlistDesc')} onPress={() => navigation.navigate('Playlist')} />
                   <MeMenuCard icon="settings-sharp" iconBg="rgba(158, 158, 158, 0.12)" iconColor="#9E9E9E" title={t('settings')} subtitle={t('settingsDesc')} onPress={() => setActiveTab('Settings')} />
                   <MeMenuCard icon="moon" iconBg="rgba(33, 150, 243, 0.12)" iconColor="#2196F3" title={t('darkMode')} subtitle={t('darkModeDesc')} isSwitch={true} switchValue={isDarkMode} onSwitchChange={toggleDarkMode} />
                   <MeMenuCard icon="language" iconBg="rgba(233, 30, 99, 0.12)" iconColor="#E91E63" title={t('language')} subtitle={t('languageDesc')} onPress={() => setMeView('language')} />
                </ScrollView>
              </>
            ) : (
              <View style={{ flex: 1 }}>
                 <View style={styles.subScreenHeader}>
                    <TouchableOpacity style={{ padding: 10 }} onPress={() => setMeView('main')}><Ionicons name="arrow-back" size={24} color={isDarkMode ? "#FFF" : "#000"} /></TouchableOpacity>
                    <Text style={styles.subScreenTitle}>{t('language')}</Text>
                    <View style={{ width: 44 }} />
                 </View>
                 <ScrollView contentContainerStyle={styles.meMenuWrapper}>
                    {languagesList.map((lang, index) => (
                      <TouchableOpacity key={index} activeOpacity={0.8} style={[styles.languageItem, locale === lang.id && styles.languageItemSelected]} onPress={() => { changeLanguage(lang.id); setMeView('main'); }}>
                        <Text style={[styles.languageItemText, locale === lang.id && styles.languageItemTextSelected]}>{lang.name}</Text>
                        {locale === lang.id && <Ionicons name="checkmark-circle" size={24} color="#FF0000" />}
                      </TouchableOpacity>
                    ))}
                 </ScrollView>
              </View>
            )}
          </View>
        ) : null}
      </View>

      <View style={styles.tabBar}>
        <TouchableOpacity onPress={async () => { setActiveTab('Home'); setActiveQuery(await getAlgorithmicTopic()); }} style={styles.tab}>
           {activeTab === 'Home' && <View style={styles.activeTabLine} />}
           <Ionicons name={activeTab==='Home'?'home':'home-outline'} size={22} color={activeTab==='Home'?'#FF0000': (isDarkMode ? '#666' : '#999')} />
           <Text style={[styles.tabText, activeTab==='Home' && {color:'#FF0000'}]}>{t('home')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('Shorts')} style={styles.tab}>
           {activeTab === 'Shorts' && <View style={styles.activeTabLine} />}
           <Ionicons name={activeTab==='Shorts'?'play':'play-outline'} size={24} color={activeTab==='Shorts'?'#FF0000': (isDarkMode ? '#666' : '#999')} />
           <Text style={[styles.tabText, activeTab==='Shorts' && {color:'#FF0000'}]}>{t('shorts')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('Live')} style={styles.tab}>
           {activeTab === 'Live' && <View style={styles.activeTabLine} />}
           <Ionicons name={activeTab==='Live'?'radio':'radio-outline'} size={24} color={activeTab==='Live'?'#FF0000': (isDarkMode ? '#666' : '#999')} />
           <Text style={[styles.tabText, activeTab==='Live' && {color:'#FF0000'}]}>{t('live')}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => setActiveTab('ME')} style={styles.tab}>
           {(activeTab === 'ME' || activeTab === 'Settings') && <View style={styles.activeTabLine} />}
           <Ionicons name={(activeTab==='ME' || activeTab==='Settings') ? 'person' : 'person-outline'} size={22} color={(activeTab==='ME' || activeTab==='Settings') ? '#FF0000' : (isDarkMode ? '#666' : '#999')} />
           <Text style={[styles.tabText, (activeTab==='ME' || activeTab==='Settings') && {color:'#FF0000'}]}>{t('me')}</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const getDynamicStyles = (isDark) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? '#000' : '#F5F5F5', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? '#222' : '#E0E0E0', width: '100%', backgroundColor: isDark ? '#0F0F0F' : '#FFFFFF' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: isDark ? '#FFF' : '#000', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: isDark ? '#222' : '#F0F0F0', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
  mainContent: { flex: 1, backgroundColor: isDark ? '#0F0F0F' : '#F9F9F9' },
  videoCard: { marginBottom: 15 },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: isDark ? '#111' : '#EAEAEA' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.7)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: isDark ? '#333' : '#CCC' },
  textContainer: { flex: 1, paddingRight: 10 },
  title: { color: isDark ? '#FFF' : '#000', fontSize: 14, fontWeight: '500' },
  meta: { color: isDark ? '#AAA' : '#666', fontSize: 12, marginTop: 4 },
  videoAiScanToggle: { padding: 6, borderRadius: 8, borderWidth: 1, alignItems: 'center', justifyContent: 'center', width: 60, marginLeft: 10 },
  skeletonCard: { backgroundColor: isDark ? '#18181b' : '#FFFFFF', borderRadius: 12, overflow: 'hidden', marginHorizontal: 10, marginBottom: 20, borderWidth: isDark ? 0 : 1, borderColor: '#EEE' },
  skeletonThumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: isDark ? '#27272a' : '#E0E0E0' },
  skeletonInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: isDark ? '#27272a' : '#E0E0E0' },
  skeletonTextContainer: { flex: 1, justifyContent: 'center' },
  skeletonTitle: { height: 14, backgroundColor: isDark ? '#27272a' : '#E0E0E0', borderRadius: 4, marginBottom: 10, width: '90%' },
  skeletonMeta: { height: 12, backgroundColor: isDark ? '#27272a' : '#E0E0E0', borderRadius: 4, width: '60%' },
  tabBar: { flexDirection: 'row', height: 55, borderTopWidth: 1, borderTopColor: isDark ? '#1a1a1a' : '#E0E0E0', backgroundColor: isDark ? '#0a0a0a' : '#FFFFFF', paddingBottom: 5 },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  activeTabLine: { position: 'absolute', top: -1, width: '40%', height: 2, backgroundColor: '#FF0000', borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  tabText: { fontSize: 10, color: isDark ? '#666' : '#999', marginTop: 4, fontWeight: '500' },
  meContainer: { flex: 1, backgroundColor: isDark ? '#0F0F0F' : '#F2F2F7', paddingTop: 20 },
  meSectionTitle: { color: isDark ? '#666' : '#888', fontSize: 12, fontWeight: 'bold', letterSpacing: 1.5, marginLeft: 20, marginBottom: 15 },
  meMenuWrapper: { paddingHorizontal: 16, paddingBottom: 20 },
  meMenuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#15171a' : '#FFFFFF', borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: isDark ? '#1f2229' : '#EAEAEA' },
  meMenuIconBox: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 16 },
  meMenuTextContent: { flex: 1 },
  meMenuTitle: { color: isDark ? '#FFF' : '#000', fontSize: 16, fontWeight: '600', marginBottom: 4 },
  meMenuSubtitle: { color: isDark ? '#888' : '#666', fontSize: 12 },
  subScreenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: isDark ? '#1a1a1a' : '#EAEAEA', marginBottom: 20 },
  subScreenTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#FFF' : '#000' },
  languageItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 18, paddingHorizontal: 20, backgroundColor: isDark ? '#15171a' : '#FFFFFF', borderRadius: 12, marginBottom: 10, borderWidth: 1, borderColor: isDark ? '#1f2229' : '#EAEAEA' },
  languageItemSelected: { borderColor: '#FF0000', backgroundColor: isDark ? 'rgba(255, 0, 0, 0.05)' : 'rgba(255, 0, 0, 0.03)' },
  languageItemText: { fontSize: 16, color: isDark ? '#FFF' : '#000' },
  languageItemTextSelected: { color: '#FF0000', fontWeight: 'bold' }
});