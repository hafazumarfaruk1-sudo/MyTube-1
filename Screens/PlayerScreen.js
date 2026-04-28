import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar, SafeAreaView, ScrollView, Modal, Alert, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeviceEventEmitter } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';

const { width, height } = Dimensions.get('window');
const PLAYER_HEIGHT = (width * 9) / 16; 
const MY_API_SERVER = "http://127.0.0.1:10000"; 

export default function PlayerScreen({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};

  const [relatedVideos, setRelatedVideos] = useState([]);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isExpandedDesc, setIsExpandedDesc] = useState(false);

  // [NEW]: ৩ সেকেন্ডের ইনিশিয়াল লোডিং স্টেট
  const [isInitialLoading, setIsInitialLoading] = useState(true);

  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStep, setDownloadStep] = useState('selection'); 
  const [downloadLinks, setDownloadLinks] = useState([]);
  const [downloadType, setDownloadType] = useState('');

  const [isDownloading, setIsDownloading] = useState(false);
  const [isAudioMode, setIsAudioMode] = useState(videoData?.type === 'audio');

  useFocusEffect(
    useCallback(() => {
      DeviceEventEmitter.emit('maximizeVideo');
      if (Platform.OS === 'android') {
          NavigationBar.setVisibilityAsync("hidden");
      }
      return () => {
          DeviceEventEmitter.emit('minimizeVideo');
      };
    }, [])
  );

  useEffect(() => {
    checkSubscriptionStatus();
    fetchRelatedVideos(false);

    if (videoId && videoData) {
        // [MODIFIED]: রিকোয়েস্ট সাথে সাথেই সার্ভারে পাঠানো হচ্ছে
        DeviceEventEmitter.emit('playVideo', { videoId: videoId, videoData: videoData });
        setIsAudioMode(videoData?.type === 'audio');

        // [MODIFIED]: স্ক্রিনে ৩ সেকেন্ডের লোডিং ইফেক্ট রাখা হয়েছে
        setIsInitialLoading(true);
        const timer = setTimeout(() => {
            setIsInitialLoading(false);
        }, 3000);

        return () => clearTimeout(timer);
    }
  }, [videoId]);

  const checkSubscriptionStatus = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];
      setIsSubscribed(parsedSubs.some(s => s.name === videoData.channel));
    } catch (e) {}
  };

  const toggleSubscription = async () => {
    try {
      let subs = await AsyncStorage.getItem('subscribedChannels');
      subs = subs ? JSON.parse(subs) : [];
      const exists = subs.some(s => s.name === videoData.channel);
      if (exists) subs = subs.filter(s => s.name !== videoData.channel);
      else subs.push({ id: Date.now().toString(), name: videoData.channel, avatar: videoData.avatar });

      await AsyncStorage.setItem('subscribedChannels', JSON.stringify(subs));
      setIsSubscribed(!exists);
    } catch (e) {}
  };

  const handleBackgroundPlay = () => {
    const newMode = !isAudioMode;
    setIsAudioMode(newMode);
    DeviceEventEmitter.emit('toggleAudioMode', newMode);
  };

  const handleDownloadExecute = async (item) => {
    try {
      setShowDownloadModal(false);
      setIsDownloading(true);
      setTimeout(() => setIsDownloading(false), 2000);

      const downloadId = Date.now().toString(); 
      const safeTitle = (videoData.title || 'video').replace(/[<>:"\/\\|?*]+/g, '').trim();
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;

      const dlApiUrl = `${MY_API_SERVER}/api/aria-download?id=${downloadId}&url=${encodeURIComponent(targetUrl)}&quality=${encodeURIComponent(item.quality)}&type=${downloadType}&title=${encodeURIComponent(safeTitle)}`;

      const response = await fetch(dlApiUrl);
      const resJson = await response.json();

      if (resJson.success) {
          // সাইলেন্ট ডাউনলোড লজিক
      }
    } catch (error) {
      Alert.alert("সার্ভার এরর", "সার্ভারের সাথে কানেক্ট করা যায়নি।");
    }
  };

  const handleDownloadInit = (type) => {
    setDownloadType(type);
    setDownloadStep('fetching');
    fetchDownloadLinks(type);
  };

  const fetchDownloadLinks = async (type) => {
    try {
      const targetUrl = `https://www.youtube.com/watch?v=${videoId}`;
      const apiUrl = `${MY_API_SERVER}/api/extract?url=${encodeURIComponent(targetUrl)}&action=download&type=${type}`;
      const response = await fetch(apiUrl);
      const data = await response.json();
      if (data.success && data.availableLinks) {
        setDownloadLinks(data.availableLinks);
        setDownloadStep('list');
      } else {
        Alert.alert("ত্রুটি", "কোনো লিংক পাওয়া যায়নি।");
        setShowDownloadModal(false);
      }
    } catch (error) {
      setShowDownloadModal(false);
    }
  };

  const fetchRelatedVideos = async (isLoadMore = false) => {
    if (isLoadMore) setIsLoadingMore(true);
    try {
      if (videoData.localUri || videoData.channel === 'Downloaded File') {
        const stored = await AsyncStorage.getItem('recorded_downloads');
        if (stored) {
          const parsed = JSON.parse(stored);
          const offlineVids = parsed
            .filter(item => item.videoId !== videoId && item.isCompleted)
            .map(item => ({
              id: item.videoId, title: item.title, channel: 'Downloaded File',
              views: `অফলাইন • ${item.quality}`, thumbnail: item.thumbnail, localUri: item.localUri, type: item.type
            }));
          setRelatedVideos(offlineVids);
        }
        setIsLoadingMore(false);
        return;
      }
      
      let searchQuery = "trending bangla";
      if (videoData?.title) {
          searchQuery = videoData.title.split(' ').slice(0, 4).join(' ');
      }

      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(searchQuery)}`);
      const text = await response.text();
      const match = text.match(/var ytInitialData = (.*?);<\/script>/);
      if (!match) return;
      
      const jsonData = JSON.parse(match[1]);
      const extractedVids = [];
      const extractNodes = (node) => {
        if (Array.isArray(node)) node.forEach(extractNodes);
        else if (node && typeof node === 'object') {
          if (node.videoRenderer && node.videoRenderer.videoId !== videoId) {
            extractedVids.push({ 
              id: node.videoRenderer.videoId, 
              title: node.videoRenderer.title?.runs?.[0]?.text, 
              channel: node.videoRenderer.ownerText?.runs?.[0]?.text, 
              views: node.videoRenderer.viewCountText?.simpleText || node.videoRenderer.shortViewCountText?.simpleText || '', 
              publishedTime: node.videoRenderer.publishedTimeText?.simpleText || '',
              duration: node.videoRenderer.lengthText?.simpleText || '',
              thumbnail: `https://i.ytimg.com/vi/${node.videoRenderer.videoId}/hqdefault.jpg`,
              avatar: node.videoRenderer.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail?.thumbnails?.[0]?.url
            });
          } else Object.values(node).forEach(extractNodes);
        }
      };
      
      extractNodes(jsonData);
      setRelatedVideos(isLoadMore ? [...relatedVideos, ...extractedVids] : extractedVids.slice(0, 15));
    } catch (e) {} finally { setIsLoadingMore(false); }
  };

  const renderHeader = () => (
    <View style={styles.detailsContainer}>
      <View style={styles.titleRow}>
         <TouchableOpacity activeOpacity={0.8} onPress={() => setIsExpandedDesc(!isExpandedDesc)} style={styles.titleTextContainer}>
            <Text style={styles.mainTitle} numberOfLines={isExpandedDesc ? null : 2}>{videoData?.title}</Text>
         </TouchableOpacity>
      </View>
      <View style={styles.metaRow}>
         <Text style={styles.mainViews}>{videoData?.views} {videoData?.publishedTime ? `• ${videoData.publishedTime}` : ''}</Text>
         <Text style={styles.moreText}>...more</Text>
      </View>
      
      <View style={styles.smartActionRow}>
         <TouchableOpacity 
            style={[styles.smartBtn, isAudioMode ? styles.smartBtnActive : null]} 
            onPress={handleBackgroundPlay}
            activeOpacity={0.8}
         >
            <Ionicons name="headset" size={20} color={isAudioMode ? "#FFF" : "#DDD"} />
            <Text style={[styles.smartBtnText, isAudioMode ? {color: '#FFF'} : null]}>অডিও মোড</Text>
         </TouchableOpacity>

         {!videoData.localUri && (
           <TouchableOpacity 
              style={[styles.smartBtn, {marginLeft: 12}]} 
              onPress={() => { setShowDownloadModal(true); setDownloadStep('selection'); }}
              activeOpacity={0.8}
           >
              <Ionicons name="download" size={20} color="#DDD" />
              <Text style={styles.smartBtnText}>ডাউনলোড</Text>
           </TouchableOpacity>
         )}
      </View>

      <View style={styles.channelRow}>
        <TouchableOpacity style={styles.channelLeft} onPress={() => navigation.navigate('Channel', { channelName: videoData.channel, channelAvatar: videoData.avatar })}>
          <Image source={{ uri: videoData.avatar || 'https://via.placeholder.com/40' }} style={styles.channelAvatar} />
          <View style={styles.channelTextCol}>
            <Text style={styles.channelName} numberOfLines={1}>{videoData.channel}</Text>
            <Text style={styles.subCount}>{videoData.localUri ? 'Offline Storage' : 'Subscriber Info'}</Text>
          </View>
        </TouchableOpacity>
        {!videoData.localUri && (
          <TouchableOpacity style={[styles.subscribeBtn, isSubscribed && styles.subscribedBtn]} onPress={toggleSubscription}>
            <Text style={[styles.subscribeText, isSubscribed && styles.subscribedText]}>{isSubscribed ? 'Subscribed' : 'Subscribe'}</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.divider} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar hidden={true} /> 
      
      {/* গ্লোবাল সার্চ হেডার */}
      <View style={styles.header}>
        <View style={styles.logoContainer}>
           <TouchableOpacity onPress={() => navigation.goBack()} style={{marginRight: 10}}>
              <Ionicons name="arrow-back" size={24} color="#FFF" />
           </TouchableOpacity>
           <Ionicons name="logo-youtube" size={28} color="#FF0000" />
           <Text style={styles.logoText}>MyTube</Text>
        </View>
        <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
          <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>সার্চ...</Text>
          <Ionicons name="search" size={18} color="#AAA" />
        </TouchableOpacity>
      </View>

      <View style={styles.playerWrapper}>
          {/* [NEW]: ৩ সেকেন্ডের ইনিশিয়াল লোডার ওভারলে */}
          {isInitialLoading && (
              <View style={styles.initialPlayerLoader}>
                  <ActivityIndicator size="large" color="#00BFA5" />
                  <Text style={styles.initialLoaderText}>ভিডিওটি লোড হচ্ছে...</Text>
              </View>
          )}
      </View>
      
      {/* [NEW]: লোডিং শেষ না হওয়া পর্যন্ত কন্টেন্ট হাইড রাখা */}
      {isInitialLoading ? (
          <View style={styles.fullScreenLoader}>
              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonMeta} />
              <View style={styles.skeletonChannel} />
          </View>
      ) : (
          <FlatList 
            ListHeaderComponent={renderHeader}
            data={relatedVideos} 
            keyExtractor={(item, index) => item.id + index.toString()} 
            renderItem={({item}) => (
              <TouchableOpacity style={styles.recCard} onPress={() => navigation.push('Player', { videoId: item.id, videoData: item })}>
                <View style={styles.thumbWrapper}>
                   <Image source={{ uri: item.thumbnail }} style={styles.recThumb} />
                   {item.duration ? (
                     <View style={styles.durationBadge}>
                       <Text style={styles.durationText}>{item.duration}</Text>
                     </View>
                   ) : null}
                </View>
                <View style={styles.recInfo}>
                  <Text style={styles.recTitle} numberOfLines={2}>{item.title}</Text>
                  <Text style={styles.recMeta}>{item.channel}</Text>
                  <Text style={styles.recViewsInfo}>
                     {item.views} {item.publishedTime ? `• ${item.publishedTime}` : ''}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            onEndReached={() => { if(!videoData.localUri) fetchRelatedVideos(true); }}
            onEndReachedThreshold={0.5}
            showsVerticalScrollIndicator={false}
          />
      )}

      {/* ডাউনলোড মডাল */}
      <Modal visible={showDownloadModal} transparent animationType="slide" onRequestClose={() => setShowDownloadModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalDragIndicator} />
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>ডাউনলোড অপশন</Text>
                <Text style={styles.modalSubtitle}>পছন্দের ফরম্যাট বেছে নিন</Text>
              </View>
              <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setShowDownloadModal(false)}>
                <Ionicons name="close" size={24} color="#AAA" />
              </TouchableOpacity>
            </View>
            
            {downloadStep === 'selection' && (
              <View style={styles.selectionRow}>
                <TouchableOpacity style={styles.selectCard} activeOpacity={0.8} onPress={() => handleDownloadInit('video')}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(255, 68, 68, 0.15)' }]}>
                    <Ionicons name="videocam" size={32} color="#FF4444" />
                  </View>
                  <Text style={styles.selectCardTitle}>ভিডিও</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.selectCard} activeOpacity={0.8} onPress={() => handleDownloadInit('audio')}>
                  <View style={[styles.iconContainer, { backgroundColor: 'rgba(0, 191, 165, 0.15)' }]}>
                    <Ionicons name="musical-notes" size={32} color="#00BFA5" />
                  </View>
                  <Text style={styles.selectCardTitle}>অডিও</Text>
                </TouchableOpacity>
              </View>
            )}
            
            {downloadStep === 'fetching' && (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#00BFA5" />
                <Text style={styles.loadingText}>লিঙ্ক তৈরি হচ্ছে...</Text>
              </View>
            )}
            
            {downloadStep === 'list' && (
              <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.qualityListContainer}>
                {downloadLinks.map((item, index) => (
                  <TouchableOpacity key={index} style={styles.qualityCard} activeOpacity={0.7} onPress={() => handleDownloadExecute(item)}>
                    <View style={styles.qualityInfoLeft}>
                      <Ionicons name={downloadType === 'audio' ? "headset" : "videocam"} size={22} color="#00BFA5" />
                      <View style={{ marginLeft: 15 }}>
                        <Text style={styles.qualityText}>{item.quality}</Text>
                        <Text style={styles.qualitySubText}>Ready to download</Text>
                      </View>
                    </View>
                    <Ionicons name="download" size={20} color="#FFF" />
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#000' },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', backgroundColor: '#0F0F0F' },
    logoContainer: { flexDirection: 'row', alignItems: 'center', width: 130 },
    logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
    searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, paddingHorizontal: 12, alignItems: 'center', height: 38 },
    
    playerWrapper: { width: '100%', height: PLAYER_HEIGHT, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' },
    initialPlayerLoader: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
    initialLoaderText: { color: '#00BFA5', marginTop: 10, fontSize: 14, fontWeight: '500' },

    fullScreenLoader: { padding: 15 },
    skeletonTitle: { height: 20, backgroundColor: '#1A1A1A', width: '90%', borderRadius: 4, marginBottom: 10 },
    skeletonMeta: { height: 12, backgroundColor: '#1A1A1A', width: '60%', borderRadius: 4, marginBottom: 20 },
    skeletonChannel: { height: 40, backgroundColor: '#1A1A1A', width: '100%', borderRadius: 8 },

    detailsContainer: { padding: 12, backgroundColor: '#0F0F0F' },
    titleRow: { flexDirection: 'row', alignItems: 'flex-start' },
    titleTextContainer: { flex: 1 },
    mainTitle: { color: '#FFF', fontSize: 18, fontWeight: 'bold' },
    metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, marginBottom: 12 },
    mainViews: { color: '#AAA', fontSize: 12 },
    moreText: { color: '#FFF', fontSize: 12, fontWeight: 'bold', marginLeft: 8 },
    
    smartActionRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
    smartBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#272727', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
    smartBtnActive: { backgroundColor: '#00BFA5', borderColor: '#00BFA5' },
    smartBtnText: { color: '#DDD', fontSize: 14, fontWeight: 'bold', marginLeft: 6 },
    
    divider: { height: 1, backgroundColor: '#222', marginVertical: 10 },
    channelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    channelLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    channelAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#333' },
    channelTextCol: { flex: 1 },
    channelName: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    subCount: { color: '#AAA', fontSize: 12 },
    subscribeBtn: { backgroundColor: '#FFF', paddingHorizontal: 15, paddingVertical: 8, borderRadius: 20 },
    subscribeText: { color: '#000', fontSize: 14, fontWeight: 'bold' },
    subscribedBtn: { backgroundColor: '#222' },
    subscribedText: { color: '#FFF' },
    
    recCard: { flexDirection: 'row', padding: 10, backgroundColor: '#0F0F0F' },
    thumbWrapper: { position: 'relative' },
    recThumb: { width: 150, height: 85, borderRadius: 10, backgroundColor: '#222' },
    durationBadge: { position: 'absolute', bottom: 6, right: 6, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 5, paddingVertical: 2, borderRadius: 4 },
    durationText: { color: '#FFF', fontSize: 11, fontWeight: 'bold' },
    recInfo: { flex: 1, marginLeft: 12, justifyContent: 'flex-start', paddingTop: 2 },
    recTitle: { color: '#FFF', fontSize: 14, fontWeight: '500', lineHeight: 20 },
    recMeta: { color: '#AAA', fontSize: 12, marginTop: 4 },
    recViewsInfo: { color: '#888', fontSize: 11, marginTop: 2 },
    
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalContent: { backgroundColor: '#1E1E1E', borderTopLeftRadius: 25, borderTopRightRadius: 25, paddingHorizontal: 20, paddingTop: 10, paddingBottom: 25, maxHeight: height * 0.65 },
    modalDragIndicator: { width: 45, height: 5, backgroundColor: '#444', borderRadius: 3, alignSelf: 'center', marginBottom: 20 },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 25 },
    modalTitle: { color: '#FFF', fontSize: 20, fontWeight: 'bold' },
    modalSubtitle: { color: '#888', fontSize: 13, marginTop: 4 },
    modalCloseBtn: { padding: 6, backgroundColor: '#2A2A2A', borderRadius: 20 },
    selectionRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 15 },
    selectCard: { backgroundColor: '#282828', borderRadius: 20, width: '47%', alignItems: 'center', paddingVertical: 25, borderWidth: 1, borderColor: '#333' },
    iconContainer: { width: 64, height: 64, borderRadius: 32, justifyContent: 'center', alignItems: 'center', marginBottom: 15 },
    selectCardTitle: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    loadingContainer: { paddingVertical: 60, alignItems: 'center' },
    loadingText: { color: '#AAA', marginTop: 20 },
    qualityListContainer: { paddingBottom: 10 },
    qualityCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#282828', padding: 15, borderRadius: 16, marginBottom: 12, borderWidth: 1, borderColor: '#383838' },
    qualityInfoLeft: { flexDirection: 'row', alignItems: 'center' },
    qualityText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
    qualitySubText: { color: '#888', fontSize: 12, marginTop: 3 },
});