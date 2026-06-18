import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, SafeAreaView, ActivityIndicator, BackHandler } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { DeviceEventEmitter } from 'react-native'; 
import AsyncStorage from '@react-native-async-storage/async-storage';

// Global theme & language
import { useTheme } from '../ThemeContext';
import { useLanguage } from '../LanguageContext';

global.appSettings = global.appSettings || {};
global.appSettings.normalVideo = global.appSettings.normalVideo || 'Auto'; 
global.shortVideoQuality = global.shortVideoQuality || 'Normal Video Quality';
global.appSettings.downloadLocation = global.appSettings.downloadLocation || '/storage/emulated/0/MyTube';
global.appSettings.shortsCacheLimit = global.appSettings.shortsCacheLimit || 3600000;

// 🚨 [NEW] AI & Thumbnail Global Defaults
global.appSettings.aiVideoScan = global.appSettings.aiVideoScan ?? 'true';
global.appSettings.aiThumbScan = global.appSettings.aiThumbScan ?? 'true';
global.appSettings.aiBlurTarget = global.appSettings.aiBlurTarget || 'w';
global.appSettings.thumbnailQuality = global.appSettings.thumbnailQuality || 'High';

const MY_API_SERVER = "http://127.0.0.1:10000";

export default function SettingsScreen() {
  const [currentView, setCurrentView] = useState('main'); 

  const [selectedMainQuality, setSelectedMainQuality] = useState(global.appSettings.normalVideo);
  const [selectedShortQuality, setSelectedShortQuality] = useState(global.shortVideoQuality);
  const [downloadLocations, setDownloadLocations] = useState([{ label: 'Phone Memory', path: '/storage/emulated/0/MyTube' }]);
  const [selectedLocation, setSelectedLocation] = useState(global.appSettings.downloadLocation);
  const [selectedCacheLimit, setSelectedCacheLimit] = useState(global.appSettings.shortsCacheLimit);
  
  // 🚨 [NEW] States for AI & Thumbnail Settings
  const [aiVideoScan, setAiVideoScan] = useState(global.appSettings.aiVideoScan);
  const [aiThumbSettings, setAiThumbSettings] = useState(`${global.appSettings.aiThumbScan}_${global.appSettings.aiBlurTarget}`);
  const [thumbQuality, setThumbQuality] = useState(global.appSettings.thumbnailQuality);

  const [isLoading, setIsLoading] = useState(false);

  const { isDarkMode } = useTheme();
  const { t } = useLanguage();
  const __translate = t; 
  const styles = getDynamicStyles(isDarkMode);

  useEffect(() => {
    const loadSavedSettings = async () => {
      try {
        const [savedShort, savedAiVid, savedAiThumb, savedAiTarget, savedThumbQ] = await Promise.all([
            AsyncStorage.getItem('shortVideoQuality'),
            AsyncStorage.getItem('ai_video_scan_master'),
            AsyncStorage.getItem('ai_thumb_scan_master'),
            AsyncStorage.getItem('ai_blur_target'),
            AsyncStorage.getItem('thumbnailQuality')
        ]);

        if (savedShort) { global.shortVideoQuality = savedShort; setSelectedShortQuality(savedShort); }
        if (savedAiVid) { global.appSettings.aiVideoScan = savedAiVid; setAiVideoScan(savedAiVid); }
        
        let thumbScan = savedAiThumb || 'true';
        let blurTarget = savedAiTarget || 'w';
        global.appSettings.aiThumbScan = thumbScan;
        global.appSettings.aiBlurTarget = blurTarget;
        setAiThumbSettings(`${thumbScan}_${blurTarget}`);

        if (savedThumbQ) { global.appSettings.thumbnailQuality = savedThumbQ; setThumbQuality(savedThumbQ); }

      } catch (e) { console.log(e); }
    };

    loadSavedSettings();

    fetch(`${MY_API_SERVER}/api/storage-info`)
      .then(res => res.json())
      .then(data => {
        if (data.success) { setDownloadLocations(data.storages); setSelectedLocation(data.current); }
      }).catch(e => console.log(e));
  }, []);

  useEffect(() => {
    const backAction = () => {
      if (currentView !== 'main') { setCurrentView('main'); return true; }
      return false;
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [currentView]);

  const longVideoOptions = ['Auto', '75p', '144p', '240p', '360p', '480p', '720p', '1080p', '1440p (2K)', '2160p (4K)', '4320p (8K)'];
  const shortVideoOptions = ['Anti Data Saver Mode', 'Low Video Quality', 'Normal Video Quality', 'High Video Quality 4k-8k'];
  const cacheLimitOptions = [
      { label: '30 Minutes', value: 1800000, chip: '30m' }, { label: '1 Hour (Default)', value: 3600000, chip: '1h' },
      { label: '2 Hours', value: 7200000, chip: '2h' }, { label: '3 Hours', value: 10800000, chip: '3h' },
      { label: '6 Hours', value: 21600000, chip: '6h' }, { label: '12 Hours', value: 43200000, chip: '12h' },
      { label: '24 Hours', value: 86400000, chip: '24h' }
  ];
  
  // 🚨 [NEW] Setting Options
  const aiVideoOptions = [
      { label: 'Enable AI Video Scan', value: 'true', desc: 'প্লেয়ারে ভিডিও স্ক্যানিং চালু থাকবে' },
      { label: 'Disable AI Video Scan', value: 'false', desc: 'সম্পূর্ণ অ্যাপে ভিডিও স্ক্যানিং বন্ধ থাকবে' }
  ];
  const aiThumbOptions = [
      { label: 'Scan & Blur Woman', value: 'true_w', desc: 'থাম্বনেইলে মহিলা ব্লার করবে' },
      { label: 'Scan & Blur Man', value: 'true_m', desc: 'থাম্বনেইলে পুরুষ ব্লার করবে' },
      { label: 'Disable Thumbnail Scan', value: 'false_w', desc: 'থাম্বনেইল স্ক্যানিং পুরোপুরি বন্ধ থাকবে' }
  ];
  const thumbQualityOptions = [
      { label: 'High Quality', value: 'High', desc: 'সর্বোচ্চ রেজোলিউশন (ডাটা বেশি কাটবে)' },
      { label: 'Data Saver', value: 'Data Saver', desc: 'নিম্ন রেজোলিউশন (ডাটা সাশ্রয়ী)' }
  ];

  const handleSelect = async (setter, globalKey, storageKey, value, isEmit = false, emitName = '') => {
    setIsLoading(true);
    try {
        if (globalKey) global.appSettings[globalKey] = value;
        setter(value);
        if (storageKey) await AsyncStorage.setItem(storageKey, value);
        if (isEmit && emitName) DeviceEventEmitter.emit(emitName, value);
    } catch (e) {}
    setTimeout(() => { setIsLoading(false); setCurrentView('main'); }, 600);
  };

  const handleAiThumbSelect = async (comboValue) => {
      setIsLoading(true);
      const [scan, target] = comboValue.split('_');
      try {
          global.appSettings.aiThumbScan = scan;
          global.appSettings.aiBlurTarget = target;
          setAiThumbSettings(comboValue);
          await AsyncStorage.setItem('ai_thumb_scan_master', scan);
          await AsyncStorage.setItem('ai_blur_target', target);
      } catch (e) {}
      setTimeout(() => { setIsLoading(false); setCurrentView('main'); }, 600);
  };

  const getBadgeStyle = (type) => {
    switch(type) {
      case 'auto': return { color: '#00e5a0', backgroundColor: 'rgba(0,229,160,0.12)', borderColor: 'rgba(0,229,160,0.2)' };
      case 'low': return { color: '#ff8080', backgroundColor: 'rgba(255,100,100,0.1)', borderColor: 'rgba(255,100,100,0.15)' };
      case 'mid': return { color: '#ffc850', backgroundColor: 'rgba(255,180,50,0.1)', borderColor: 'rgba(255,180,50,0.15)' };
      case 'high': return { color: '#6aabff', backgroundColor: 'rgba(61,139,255,0.12)', borderColor: 'rgba(61,139,255,0.2)' };
      case 'hd': return { color: '#a080ff', backgroundColor: 'rgba(124,92,252,0.12)', borderColor: 'rgba(124,92,252,0.2)' };
      case 'uhd': return { color: '#c0a0ff', backgroundColor: 'rgba(124,92,252,0.15)', borderColor: 'rgba(124,92,252,0.25)' };
      case '8k': return { color: '#ffcc00', backgroundColor: 'rgba(255,200,50,0.12)', borderColor: 'rgba(255,200,50,0.25)' };
      case 'ai': return { color: '#FF00FF', backgroundColor: 'rgba(255,0,255,0.12)', borderColor: 'rgba(255,0,255,0.2)' };
      default: return { color: '#e8edf8', backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.2)' };
    }
  };

  const MainMenuCard = ({ icon, iconBg, title, subtitle, onPress }) => (
    <TouchableOpacity activeOpacity={0.8} style={styles.mainMenuCard} onPress={onPress}>
      <View style={[styles.sectionIcon, { backgroundColor: iconBg }]}>
        <Ionicons name={icon} size={20} color={isDarkMode ? '#FFF' : '#111'} />
      </View>
      <View style={{ flex: 1, marginLeft: 12 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        <Text style={styles.sectionSubtitle}>{subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={20} color={isDarkMode ? '#7b8db0' : '#556'} />
    </TouchableOpacity>
  );

  const OptionItem = ({ label, desc, badge, badgeType, customBadge, selected, onPress }) => {
    const bStyle = getBadgeStyle(badgeType);
    return (
      <TouchableOpacity activeOpacity={0.7} style={[styles.optionItem, selected && styles.optionItemSelected]} onPress={onPress}>
        {selected && <View style={styles.activeIndicatorLine} />}
        <View style={styles.optionLeft}>
          {customBadge ? customBadge : (
            <View style={[styles.qualityBadge, { backgroundColor: bStyle.backgroundColor, borderColor: bStyle.borderColor }]}>
              <Text style={[styles.qualityBadgeText, { color: bStyle.color }]}>{badge}</Text>
            </View>
          )}
          <View style={{ marginLeft: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[styles.optionLabel, selected && styles.optionLabelSelected]}>{label}</Text>
              {label.includes('Default') && <Text style={styles.tagDefault}>{__translate('Default')}</Text>}
            </View>
            {!!desc && <Text style={styles.optionDesc}>{desc}</Text>}
          </View>
        </View>
        <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
          {selected && <View style={styles.radioInner} />}
        </View>
      </TouchableOpacity>
    );
  };

  const SubScreenHeader = ({ title }) => (
    <View style={styles.subScreenHeader}>
      <TouchableOpacity style={styles.backButton} onPress={() => setCurrentView('main')}>
        <Ionicons name="arrow-back" size={24} color={isDarkMode ? '#e8edf8' : '#111'} />
      </TouchableOpacity>
      <Text style={styles.subScreenTitle}>{title}</Text>
      <View style={{ width: 40 }} />
    </View>
  );

  return (
    <SafeAreaView style={styles.container}>
      {currentView === 'main' && (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>{t('videoSettings') || '⚙️ General Settings'}</Text>
            <Text style={styles.headerSubtitle}>{t('videoSettingsDesc') || 'আপনার পছন্দমতো কাস্টমাইজ করুন'}</Text>
          </View>

          <View style={styles.settingsContainer}>
            {/* 🚨 [NEW] AI Settings Cards */}
            <MainMenuCard icon="hardware-chip" iconBg="#5c1a4b" title={__translate('AI Video Scanning')} subtitle={aiVideoScan === 'true' ? 'Enabled' : 'Disabled (Master)'} onPress={() => setCurrentView('aiVideo')} />
            <MainMenuCard icon="scan-circle" iconBg="#5c381a" title={__translate('AI Thumbnail Scanning')} subtitle={aiThumbSettings.startsWith('false') ? 'Disabled' : (aiThumbSettings.endsWith('w') ? 'Scan & Blur Woman' : 'Scan & Blur Man')} onPress={() => setCurrentView('aiThumb')} />
            <MainMenuCard icon="image" iconBg="#1a5c54" title={__translate('Thumbnail Quality')} subtitle={thumbQuality} onPress={() => setCurrentView('thumbQuality')} />
            
            <View style={styles.optionDivider} />

            <MainMenuCard icon="tv-outline" iconBg="#1a3a6e" title={__translate('Long Video Quality')} subtitle={selectedMainQuality} onPress={() => setCurrentView('longVideo')} />
            <MainMenuCard icon="phone-portrait-outline" iconBg="#2d1a5c" title={__translate('Shorts Video Quality')} subtitle={selectedShortQuality} onPress={() => setCurrentView('shortVideo')} />
            <MainMenuCard icon="folder-open-outline" iconBg="#0d3d28" title={__translate('Download Location')} subtitle={selectedLocation.split('/').pop() || 'MyTube'} onPress={() => setCurrentView('location')} />
            <MainMenuCard icon="time-outline" iconBg="#3d2200" title={__translate('Shorts Cache Limit')} subtitle={__translate('ক্যাশ সময়সীমা নির্ধারণ করুন')} onPress={() => setCurrentView('cacheLimit')} />
          </View>
          <Text style={styles.bottomNote}>{__translate('সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়')}</Text>
        </ScrollView>
      )}

      {/* 🚨 [NEW] AI Video Scanning Sub-Screen */}
      {currentView === 'aiVideo' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('AI Video Scanning')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {aiVideoOptions.map((opt, index) => (
                <View key={index}>
                  <OptionItem label={opt.label} desc={opt.desc} badge={opt.value==='true'?'ON':'OFF'} badgeType="ai" selected={aiVideoScan === opt.value} onPress={() => handleSelect(setAiVideoScan, 'aiVideoScan', 'ai_video_scan_master', opt.value)} />
                  {index < aiVideoOptions.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 🚨 [NEW] AI Thumbnail Scanning Sub-Screen */}
      {currentView === 'aiThumb' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('AI Thumbnail Scanning')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {aiThumbOptions.map((opt, index) => (
                <View key={index}>
                  <OptionItem label={opt.label} desc={opt.desc} badge="AI" badgeType="ai" selected={aiThumbSettings === opt.value} onPress={() => handleAiThumbSelect(opt.value)} />
                  {index < aiThumbOptions.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* 🚨 [NEW] Thumbnail Quality Sub-Screen */}
      {currentView === 'thumbQuality' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Thumbnail Quality')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {thumbQualityOptions.map((opt, index) => (
                <View key={index}>
                  <OptionItem label={opt.label} desc={opt.desc} badge={opt.value==='High'?'HQ':'Low'} badgeType={opt.value==='High'?'high':'low'} selected={thumbQuality === opt.value} onPress={() => handleSelect(setThumbQuality, 'thumbnailQuality', 'thumbnailQuality', opt.value, true, 'thumbQualityChanged')} />
                  {index < thumbQualityOptions.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Other Existing Views Below... */}
      {currentView === 'longVideo' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Long Video Quality')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {longVideoOptions.map((opt, index) => (
                <View key={index}>
                  <OptionItem label={opt} desc="" badge="HD" badgeType="hd" selected={selectedMainQuality === opt} onPress={() => handleSelect(setSelectedMainQuality, 'normalVideo', null, opt, true, 'qualityChanged')} />
                  {index < longVideoOptions.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {currentView === 'shortVideo' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Shorts Video Quality')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {shortVideoOptions.map((opt, index) => (
                <View key={index}>
                  <OptionItem label={opt} desc="" badge="Vid" badgeType="high" selected={selectedShortQuality === opt} onPress={() => handleSelect(setSelectedShortQuality, null, 'shortVideoQuality', opt)} />
                  {index < shortVideoOptions.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {currentView === 'cacheLimit' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Cache Limit Time')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {cacheLimitOptions.map((opt, index) => (
                <View key={index}>
                  <OptionItem label={opt.label} desc="" badge="Time" badgeType="mid" selected={selectedCacheLimit === opt.value} onPress={() => handleSelect(setSelectedCacheLimit, 'shortsCacheLimit', null, opt.value)} />
                  {index < cacheLimitOptions.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {currentView === 'location' && (
        <View style={{ flex: 1 }}>
          <SubScreenHeader title={__translate('Download Location')} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.subListContent}>
            <View style={styles.optionsWrapper}>
              {downloadLocations.map((loc, index) => (
                <View key={index}>
                  <OptionItem label={loc.label} desc={loc.path} badge="Dir" badgeType="low" selected={selectedLocation === loc.path} onPress={() => { setSelectedLocation(loc.path); setCurrentView('main'); }} />
                  {index < downloadLocations.length - 1 && <View style={styles.optionDivider} />}
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {isLoading && (
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#3d8bff" />
            <Text style={styles.loadingText}>{__translate('Applying Settings...')}</Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const getDynamicStyles = (isDark) => StyleSheet.create({
  container: { flex: 1, backgroundColor: isDark ? '#0a0d14' : '#F7F7F8' },
  scrollContent: { paddingBottom: 40, paddingTop: 10 },
  headerTitleContainer: { alignItems: 'center', marginBottom: 25, marginTop: 10 },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: isDark ? '#e8edf8' : '#111', letterSpacing: 0.5 },
  headerSubtitle: { fontSize: 12, color: isDark ? '#4a5568' : '#666', marginTop: 4 },
  settingsContainer: { paddingHorizontal: 16, gap: 12 },
  mainMenuCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: isDark ? '#161c2d' : '#fff', borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6', borderRadius: 16, paddingVertical: 16, paddingHorizontal: 16 },
  sectionIcon: { width: 38, height: 38, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '600', color: isDark ? '#e8edf8' : '#111' },
  sectionSubtitle: { fontSize: 12, color: isDark ? '#7b8db0' : '#666', marginTop: 4 },
  subScreenHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 15, backgroundColor: isDark ? '#161c2d' : '#fff', borderBottomWidth: 1, borderBottomColor: isDark ? '#1e2a42' : '#e6e6e6' },
  backButton: { padding: 10 },
  subScreenTitle: { fontSize: 16, fontWeight: 'bold', color: isDark ? '#e8edf8' : '#111' },
  subListContent: { padding: 16, paddingBottom: 40 },
  optionsWrapper: { backgroundColor: isDark ? '#161c2d' : '#fff', borderRadius: 16, borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6', overflow: 'hidden' },
  optionItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 16, position: 'relative' },
  optionItemSelected: { backgroundColor: isDark ? 'rgba(61,139,255,0.06)' : 'rgba(61,139,255,0.04)' },
  activeIndicatorLine: { position: 'absolute', left: 0, top: '20%', bottom: '20%', width: 3, backgroundColor: '#3d8bff', borderTopRightRadius: 3, borderBottomRightRadius: 3 },
  optionLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  qualityBadge: { minWidth: 46, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 5, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  qualityBadgeText: { fontSize: 11, fontWeight: 'bold' },
  optionLabel: { fontSize: 14, color: isDark ? '#e8edf8' : '#111' },
  optionLabelSelected: { color: isDark ? '#c8d8ff' : '#234', fontWeight: 'bold' },
  optionDesc: { fontSize: 11, color: isDark ? '#7b8db0' : '#666', marginTop: 3 },
  radioOuter: { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: isDark ? '#1e2a42' : '#e6e6e6', justifyContent: 'center', alignItems: 'center' },
  radioOuterSelected: { borderColor: '#3d8bff' },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#3d8bff' },
  optionDivider: { height: 1, backgroundColor: isDark ? '#1e2a42' : '#e6e6e6', opacity: 0.5, marginHorizontal: 16 },
  tagDefault: { fontSize: 10, paddingVertical: 1, paddingHorizontal: 6, borderRadius: 4, backgroundColor: 'rgba(255,200,50,0.1)', color: '#ffcc50', borderColor: 'rgba(255,200,50,0.2)', borderWidth: 1, marginLeft: 8, overflow: 'hidden' },
  bottomNote: { textAlign: 'center', fontSize: 11, color: isDark ? '#4a5568' : '#666', marginTop: 15, opacity: 0.8 },
  loadingOverlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', zIndex: 999 },
  loadingBox: { backgroundColor: isDark ? '#161c2d' : '#fff', padding: 25, borderRadius: 15, alignItems: 'center', borderWidth: 1, borderColor: isDark ? '#1e2a42' : '#e6e6e6' },
  loadingText: { color: isDark ? '#e8edf8' : '#111', marginTop: 15, fontSize: 15, fontWeight: 'bold' }
});