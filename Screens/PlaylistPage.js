import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { View, StyleSheet, Text, ActivityIndicator, TouchableOpacity, FlatList, Image, Dimensions, StatusBar } from 'react-native';
import { Video } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { WebView } from 'react-native-webview';
import { DeviceEventEmitter } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage'; // 🚨 স্টোরেজ প্যাকেজ ইমপোর্ট 🚨

const REMOTE_ENGINE_URL = "https://gist.githubusercontent.com/hafazumarfaruk-svg/2d3deb4c65af209a4d4a0ee0c09765f9/raw/yt_engine.js";

export default function PlaylistPage({ route, navigation }) {
  const { videoId, videoData = {} } = route?.params || {};
  const [videoUrl, setVideoUrl] = useState(null);
  const [loadingUrl, setLoadingUrl] = useState(true);
  const [injectedJS, setInjectedJS] = useState(""); 
  const [savedPlaylist, setSavedPlaylist] = useState([]); // 🚨 সেভ করা প্লেলিস্টের স্টেট 🚨
  const webViewRef = useRef(null);

  useLayoutEffect(() => {
    navigation.setOptions({ headerShown: false });
  }, [navigation]);

  useEffect(() => {
    const fetchRemoteEngine = async () => {
      try {
        const response = await fetch(REMOTE_ENGINE_URL);
        const script = await response.text();
        if (script.length > 50) setInjectedJS(script);
      } catch (error) {
        setInjectedJS(`true;`);
      }
    };
    fetchRemoteEngine();
  }, []);

  useEffect(() => {
    setVideoUrl(null);
    if (!videoId) setLoadingUrl(false);
    else setLoadingUrl(true);
  }, [videoId]);

  // 🚨 প্লেলিস্ট লোড করার এবং রিয়েল-টাইম আপডেটের লজিক 🚨
  useEffect(() => {
    loadPlaylist();
    const sub = DeviceEventEmitter.addListener('playlistUpdated', loadPlaylist);
    return () => sub.remove();
  }, []);

  const loadPlaylist = async () => {
    try {
      const data = await AsyncStorage.getItem('my_saved_playlist');
      if (data) setSavedPlaylist(JSON.parse(data));
    } catch (e) {}
  };

  // 🚨 প্লেলিস্ট থেকে ভিডিও রিমুভ করার ফাংশন 🚨
  const removeVideo = async (id) => {
    try {
      const filtered = savedPlaylist.filter(v => v.id !== id);
      setSavedPlaylist(filtered);
      await AsyncStorage.setItem('my_saved_playlist', JSON.stringify(filtered));
    } catch(e) {}
  };

  const handleMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'VIDEO_LINK' && data.url && !videoUrl) {
        setVideoUrl(data.url);
        setLoadingUrl(false);
        if(webViewRef.current) webViewRef.current.stopLoading();
      }
    } catch (e) {
      if (event.nativeEvent.data.includes('/videoplayback') && !videoUrl) {
        setVideoUrl(event.nativeEvent.data);
        setLoadingUrl(false);
      }
    }
  };

  return (
    <View style={styles.singleContainer}>
      <StatusBar backgroundColor="#000" barStyle="light-content" />

      <View style={styles.videoPlayerWrapper}>
        <TouchableOpacity style={styles.floatingBackBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-down" size={30} color="#FFF" />
        </TouchableOpacity>

        {loadingUrl ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FF0000" />
            <Text style={{color: '#888', marginTop: 15, fontSize: 12}}>Loading Playlist Engine...</Text>
          </View>
        ) : videoUrl ? (
          <Video 
            source={{ uri: videoUrl, headers: { 'User-Agent': 'Mozilla/5.0' } }} 
            style={styles.singleVideo} 
            useNativeControls 
            resizeMode="contain" 
            shouldPlay 
          />
        ) : !videoId ? (
          // 🚨 সরাসরি প্লেলিস্টে আসলে এই সুন্দর মেসেজটি দেখাবে 🚨
          <View style={styles.loadingContainer}>
            <Ionicons name="folder-open-outline" size={50} color="#FF0000" />
            <Text style={{color: '#FFF', marginTop: 10, fontSize: 14, fontWeight: 'bold'}}>আপনার সংরক্ষিত প্লেলিস্ট</Text>
            <Text style={{color: '#AAA', marginTop: 4, fontSize: 12}}>নিচে আপনার সেভ করা সব ভিডিও রয়েছে</Text>
          </View>
        ) : null}

        {videoId && !videoUrl && injectedJS !== "" && (
          <View style={{ width: 0, height: 0, opacity: 0, position: 'absolute' }}>
            <WebView 
              ref={webViewRef}
              source={{ uri: `https://m.youtube.com/watch?v=${videoId}` }}
              userAgent="Mozilla/5.0"
              injectedJavaScript={injectedJS}
              onMessage={handleMessage}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              mediaPlaybackRequiresUserAction={false}
            />
          </View>
        )}
      </View>

      {/* 🚨 সেভ করা প্লেলিস্ট দেখানোর জন্য FlatList 🚨 */}
      <FlatList 
        data={savedPlaylist} 
        keyExtractor={(item, index) => item.id + index} 
        renderItem={({item}) => (
          <TouchableOpacity 
            style={styles.recVideoCard} 
            // 🚨 ক্লিক করলেই গ্লোবাল প্লেয়ারে প্লে হবে 🚨
            onPress={() => DeviceEventEmitter.emit('playVideo', { videoId: item.id, videoData: item })}
          >
            <Image source={{ uri: item.thumbnail }} style={styles.recThumbnailImage} />
            <View style={styles.recVideoInfo}>
              <Text style={styles.recVideoTitle} numberOfLines={2}>{item.title}</Text>
              <Text style={styles.recVideoMeta}>{item.channel} {item.views ? `• ${item.views}` : ''}</Text>
            </View>
            <TouchableOpacity style={{padding: 10}} onPress={() => removeVideo(item.id)}>
                <Ionicons name="trash-outline" size={24} color="#FF0000" />
            </TouchableOpacity>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
            <View style={{padding: 30, alignItems: 'center'}}>
                <Text style={{color: '#AAA'}}>কোনো ভিডিও সেভ করা নেই!</Text>
            </View>
        )}
        ListHeaderComponent={() => (
          <View style={styles.detailsContainer}>
            <Text style={styles.videoMainTitle}>{videoData.title || "My Saved Playlist"}</Text>
            <Text style={styles.videoMainMeta}>{savedPlaylist.length} Videos Saved</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  singleContainer: { flex: 1, backgroundColor: '#0F0F0F' },
  videoPlayerWrapper: { width: '100%', height: 230, backgroundColor: '#000', justifyContent: 'center' },
  singleVideo: { width: '100%', height: '100%' },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  floatingBackBtn: { position: 'absolute', top: 10, left: 10, zIndex: 20, padding: 5, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },
  detailsContainer: { padding: 15, borderBottomWidth: 1, borderBottomColor: '#222' },
  videoMainTitle: { color: '#FFF', fontSize: 17, fontWeight: 'bold' },
  videoMainMeta: { color: '#AAA', fontSize: 12, marginTop: 5 },
  recVideoCard: { flexDirection: 'row', padding: 10, alignItems: 'center' },
  recThumbnailImage: { width: 140, height: 80, borderRadius: 8, backgroundColor: '#222' },
  recVideoInfo: { flex: 1, marginLeft: 12 },
  recVideoTitle: { color: '#FFF', fontSize: 14, lineHeight: 18 },
  recVideoMeta: { color: '#AAA', fontSize: 11, marginTop: 4 },
});