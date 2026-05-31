import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Image, TouchableOpacity, SafeAreaView, StatusBar, ActivityIndicator, Platform, Dimensions, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import * as NavigationBar from 'expo-navigation-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';

import SettingsScreen from '../Settings/SettingsScreen';
import ShortsScreen from './ShortsScreen'; 
import LiveScreen from './livescreen';

const DESKTOP_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const FEED_TOPICS = [ "trending bangladesh", "bangla natok 2026", "bangla new song", "somoy tv live", "cricket highlights", "bangla waz short", "bengali vlog", "bangla news today" ];
global.aiMemory = global.aiMemory || {};
global.seenVideoIds = global.seenVideoIds || new Set(); 

const { width } = Dimensions.get('window');

export default function HomeScreen({ route }) {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const [activeTab, setActiveTab] = useState('Home');
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [isFetchingMore, setIsFetchingMore] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedShortId, setSelectedShortId] = useState(null);
  const [subscribedChannels, setSubscribedChannels] = useState([]);
  const [thumbQuality, setThumbQuality] = useState('High');
  const [activeQuery, setActiveQuery] = useState('');

  const getAlgorithmicTopic = async () => {
    try {
      const subs = await AsyncStorage.getItem('subscribedChannels');
      const parsedSubs = subs ? JSON.parse(subs) : [];
      const suffixes = ["", "today", "new", "2026", "latest"];
      const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];

      if (parsedSubs.length > 0 && Math.random() < 0.10) {
          const randomSub = parsedSubs[Math.floor(Math.random() * parsedSubs.length)].name;
          const subQueries = [`${randomSub} latest`, `${randomSub} related`, randomSub];
          return `${subQueries[Math.floor(Math.random() * subQueries.length)]} ${suffix}`.trim();
      }
      return `${FEED_TOPICS[Math.floor(Math.random() * FEED_TOPICS.length)]} ${suffix}`.trim();
    } catch (e) { return FEED_TOPICS[0]; }
  };

  useEffect(() => {
    const loadGlobalData = async () => {
      try {
        const subs = await AsyncStorage.getItem('subscribedChannels');
        if (subs) setSubscribedChannels(JSON.parse(subs));
        const quality = await AsyncStorage.getItem('thumbnailQuality');
        if (quality) setThumbQuality(quality);
        if (!activeQuery) setActiveQuery(await getAlgorithmicTopic());
      } catch (e) {}
    };
    if (isFocused) loadGlobalData();
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

  const handleRefresh = async () => {
    setRefreshing(true);
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
    if (isNewSearch && retryCount === 0) setLoading(true);
    try {
      const response = await fetch(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`, { headers: { 'User-Agent': DESKTOP_AGENT } });
      const htmlText = await response.text();
      let match = htmlText.match(/ytInitialData\s*=\s*({.+?});/) || htmlText.match(/var ytInitialData = (.*?);<\/script>/);
      
      if (match && match[1]) {
        const jsonData = JSON.parse(match[1]);
        const extractedVideos = [];
        const extractedShorts = [];

        const extractNodes = (node) => {
          if (Array.isArray(node)) node.forEach(extractNodes);
          else if (node && typeof node === 'object') {
            if (node.videoRenderer) {
                const channelName = node.videoRenderer.ownerText?.runs?.[0]?.text || '';
                const titleText = node.videoRenderer.title?.runs?.[0]?.text?.toLowerCase() || '';
                if (channelName.trim().startsWith('@') || titleText.includes('short') || titleText.includes('শর্ট')) {
                    extractedShorts.push({ videoId: node.videoRenderer.videoId, headline: { simpleText: node.videoRenderer.title?.runs?.[0]?.text }, viewCountText: { simpleText: node.videoRenderer.shortViewCountText?.simpleText } });
                } else {
                    extractedVideos.push(node.videoRenderer);
                }
            }
            else if (node.reelItemRenderer) extractedShorts.push(node.reelItemRenderer);
            else Object.values(node).forEach(extractNodes);
          }
        };
        extractNodes(jsonData);
        
        const freshVideos = extractedVideos.filter(vid => {
            if (global.seenVideoIds.has(vid.videoId)) return false;
            global.seenVideoIds.add(vid.videoId); return true;
        });
        
        const formattedVideos = freshVideos.map(vid => ({
            id: vid.videoId, title: vid.title?.runs?.[0]?.text || 'No Title', channel: vid.ownerText?.runs?.[0]?.text || 'Channel',
            views: vid.shortViewCountText?.simpleText || 'N/A', duration: vid.lengthText?.simpleText || '', publishedTime: vid.publishedTimeText?.simpleText || '',
            thumbnail: getHighQualityThumbnail(vid.thumbnail, vid.videoId), 
            avatar: getHighQualityThumbnail(vid.channelThumbnailSupportedRenderers?.channelThumbnailWithLinkRenderer?.thumbnail, null), type: 'video'
        }));
        setVideos(isNewSearch ? formattedVideos : [...videos, ...formattedVideos]);
      }
    } catch (e) {} finally { setLoading(false); setRefreshing(false); }
  };

  const renderVideoItem = ({ item }) => {
    return (
      <View style={styles.videoCard}>
        <TouchableOpacity activeOpacity={0.9} onPress={() => navigation.navigate('Player', { videoId: item.id, videoData: item })}>
          <Image source={{ uri: item.thumbnail }} style={styles.thumbnail} />
          {item.duration ? <View style={styles.durationBadge}><Text style={styles.durationText}>{item.duration}</Text></View> : null}
        </TouchableOpacity>

        <View style={styles.videoInfo}>
          <Image source={{ uri: item.avatar }} style={styles.channelAvatar} />
          <View style={styles.textContainer}>
            <Text style={styles.title} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.meta}>{item.channel} • {item.views}</Text>
          </View>
        </View>
      </View>
    );
  };

  const MeMenuItem = ({ icon, text, onPress }) => (
    <TouchableOpacity style={styles.meMenuItem} onPress={onPress}>
      <Ionicons name={icon} size={24} color="#00BFA5" style={styles.meMenuIcon} />
      <Text style={styles.meMenuText}>{text}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar backgroundColor="#0F0F0F" barStyle="light-content" translucent={true} />

      {activeTab === 'Home' && (
        <View style={styles.header}>
          <View style={styles.logoContainer}>
             <Ionicons name="logo-youtube" size={28} color="#FF0000" />
             <Text style={styles.logoText}>MyTube</Text>
          </View>
     
          <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={() => navigation.navigate('searchsettings')}>
            <Text style={{ flex: 1, color: '#888', fontSize: 14 }}>{searchQuery || "সার্চ..."}</Text>
            <Ionicons name="search" size={18} color="#AAA" />
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.mainContent}>
  
       {activeTab === 'Home' ? (
          loading && videos.length === 0 ? ( 
            // [NEW] Skeleton Loading UI
            <View style={{ paddingTop: 10 }}>
              {[1, 2, 3].map((key) => (
                <View key={key} style={styles.skeletonCard}>
                  <View style={styles.skeletonThumbnail} />
                  <View style={styles.skeletonInfo}>
                    <View style={styles.skeletonAvatar} />
                    <View style={styles.skeletonTextContainer}>
                      <View style={styles.skeletonTitle} />
                      <View style={styles.skeletonMeta} />
                    </View>
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <FlatList 
              data={videos} 
              renderItem={renderVideoItem} 
              keyExtractor={(item, index) => item.id + index.toString()} 
              refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#FF0000" />} 
              onEndReached={loadMoreVideos}
              onEndReachedThreshold={0.5} 
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
             <View style={styles.meHeaderProfile}>
                 <Ionicons name="person-circle" size={80} color="#555" />
                 <Text style={styles.meName}>MyTube User</Text>
                 <Text style={styles.meEmail}>Manage your account</Text>
             </View>
  
            <View style={styles.meMenuWrapper}>
                 <MeMenuItem icon="time-outline" text="HISTORY" onPress={() => navigation.navigate('History')} />
                 <MeMenuItem icon="download-outline" text="DOWNLOAD" onPress={() => navigation.navigate('Downloads')} />
                 <MeMenuItem icon="notifications-outline" text="MY SUBSCRIBE" onPress={() => navigation.navigate('Subscriptions')} />
                 <MeMenuItem icon="list-outline" text="MY PLAYLIST" onPress={() => navigation.navigate('Playlist')} />
                 <MeMenuItem icon="settings-outline" text="SETTINGS" onPress={() => setActiveTab('Settings')} />
                 <MeMenuItem icon="mail-outline" text="SUPPORT TO GMAIL" onPress={() => {}} />
             </View>
          </View>
        ) : null}
      </View>

      {/* [NEW] Updated Bottom Tab Bar matching the screenshot UI */}
      <View style={styles.tabBar}>
        <TouchableOpacity onPress={async () => { setActiveTab('Home'); setActiveQuery(await getAlgorithmicTopic()); }} style={styles.tab}>
           {activeTab === 'Home' && <View style={styles.activeTabLine} />}
           <Ionicons name={activeTab==='Home'?'home':'home-outline'} size={22} color={activeTab==='Home'?'#FF0000':'#666'} />
           <Text style={[styles.tabText, activeTab==='Home' && {color:'#FF0000'}]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setActiveTab('Shorts')} style={styles.tab}>
           {activeTab === 'Shorts' && <View style={styles.activeTabLine} />}
           <Ionicons name={activeTab==='Shorts'?'play':'play-outline'} size={24} color={activeTab==='Shorts'?'#FF0000':'#666'} />
           <Text style={[styles.tabText, activeTab==='Shorts' && {color:'#FF0000'}]}>Shorts</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setActiveTab('Live')} style={styles.tab}>
           {activeTab === 'Live' && <View style={styles.activeTabLine} />}
           <Ionicons name={activeTab==='Live'?'radio':'radio-outline'} size={24} color={activeTab==='Live'?'#FF0000':'#666'} />
           <Text style={[styles.tabText, activeTab==='Live' && {color:'#FF0000'}]}>Live</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => setActiveTab('ME')} style={styles.tab}>
           {(activeTab === 'ME' || activeTab === 'Settings') && <View style={styles.activeTabLine} />}
           <Ionicons name={(activeTab==='ME' || activeTab==='Settings') ? 'person' : 'person-outline'} size={22} color={(activeTab==='ME' || activeTab==='Settings') ? '#FF0000' : '#666'} />
           <Text style={[styles.tabText, (activeTab==='ME' || activeTab==='Settings') && {color:'#FF0000'}]}>ME</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#222', width: '100%', backgroundColor: '#0F0F0F' },
  logoContainer: { flexDirection: 'row', alignItems: 'center', width: 105 },
  logoText: { color: '#FFF', fontSize: 16, fontWeight: 'bold', marginLeft: 4 },
  searchBar: { flex: 1, flexDirection: 'row', backgroundColor: '#222', borderRadius: 20, marginHorizontal: 8, paddingHorizontal: 12, alignItems: 'center', height: 38 },
  mainContent: { flex: 1, backgroundColor: '#0F0F0F' },
  
  // Video Card Styles
  videoCard: { marginBottom: 15 },
  thumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#111' },
  durationBadge: { position: 'absolute', bottom: 8, right: 8, backgroundColor: 'rgba(0, 0, 0, 0.8)', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 4 },
  durationText: { color: '#FFF', fontSize: 12, fontWeight: 'bold' },
  videoInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  channelAvatar: { width: 36, height: 36, borderRadius: 18, marginRight: 12, backgroundColor: '#333' },
  textContainer: { flex: 1, paddingRight: 10 },
  title: { color: '#FFF', fontSize: 14, fontWeight: '500' },
  meta: { color: '#AAA', fontSize: 12, marginTop: 4 },

  // Skeleton Loading Styles
  skeletonCard: { backgroundColor: '#18181b', borderRadius: 12, overflow: 'hidden', marginHorizontal: 10, marginBottom: 20 },
  skeletonThumbnail: { width: '100%', aspectRatio: 16 / 9, backgroundColor: '#27272a' },
  skeletonInfo: { flexDirection: 'row', padding: 12, alignItems: 'center' },
  skeletonAvatar: { width: 40, height: 40, borderRadius: 20, marginRight: 12, backgroundColor: '#27272a' },
  skeletonTextContainer: { flex: 1, justifyContent: 'center' },
  skeletonTitle: { height: 14, backgroundColor: '#27272a', borderRadius: 4, marginBottom: 10, width: '90%' },
  skeletonMeta: { height: 12, backgroundColor: '#27272a', borderRadius: 4, width: '60%' },

  // Bottom Tab Bar Styles
  tabBar: { flexDirection: 'row', height: 55, borderTopWidth: 1, borderTopColor: '#1a1a1a', backgroundColor: '#0a0a0a', paddingBottom: 5 },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  activeTabLine: { position: 'absolute', top: -1, width: '40%', height: 2, backgroundColor: '#FF0000', borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  tabText: { fontSize: 10, color: '#666', marginTop: 4, fontWeight: '500' },

  // ME Screen Styles
  meContainer: { flex: 1, backgroundColor: '#0F0F0F' },
  meHeaderProfile: { alignItems: 'center', marginTop: 40, marginBottom: 30 },
  meName: { color: '#FFF', fontSize: 20, fontWeight: 'bold', marginTop: 10 },
  meEmail: { color: '#AAA', fontSize: 14, marginTop: 4 },
  meMenuWrapper: { paddingHorizontal: 20 },
  meMenuItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 18, borderBottomWidth: 1, borderBottomColor: '#222' },
  meMenuIcon: { marginRight: 20 },
  meMenuText: { color: '#FFF', fontSize: 16, fontWeight: '500' }
});