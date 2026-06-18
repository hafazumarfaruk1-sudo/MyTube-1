import 'react-native-gesture-handler';
import React from 'react';
import { View, SafeAreaView } from 'react-native'; 
import { NavigationContainer } from '@react-navigation/native'; 
import { createStackNavigator } from '@react-navigation/stack';

import { ThemeProvider, useTheme } from './ThemeContext'; 
import { LanguageProvider } from './LanguageContext';

// Screens
import HomeScreen from './Screens/HomeScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlayerScreen from './Screens/PlayerScreen';
import PlaylistPage from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import SubscriptionsScreen from './Screens/SubscriptionsScreen';
import LiveScreen from './Screens/livescreen';

// Settings
import SettingsScreen from './Settings/SettingsScreen';
import HistoryPage from './Settings/HistoryPage';
import GlobalDownloadManager from './Settings/GlobalDownloadManager';
import GlobalDownloadOverlay from './Settings/GlobalDownloadOverlay';
import SearchSetting from './Settings/searchsetting';
import GlobalPlayer from './Settings/GlobalPlayer';

const Stack = createStackNavigator();

// 🚨 সাব-কম্পোনেন্ট যাতে useTheme হুক ব্যবহার করা যায়
function AppContent() {
  const { isDarkMode } = useTheme();

  return (
    // SafeAreaView নিশ্চিত করবে যে অ্যাপটি ফোনের ন্যাভিগেশন বার বা নচ (Notch) এর সাথে ওভারল্যাপ করবে না
    <SafeAreaView style={{ flex: 1, backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' }}>
      
      {/* 🚀 মূল অ্যাপ্লিকেশন অংশ */}
      <View style={{ flex: 1, backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' }}>
        <Stack.Navigator
          initialRouteName="Home"
          screenOptions={{
            cardStyle: { backgroundColor: isDarkMode ? '#000000' : '#FFFFFF' } // 👈 থিম অনুযায়ী স্ট্যাক ব্যাকগ্রাউন্ড
          }}
        >
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Channel" component={ChannelScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Player" component={PlayerScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Playlist" component={PlaylistPage} options={{ headerShown: false }} />
          <Stack.Screen name="Shorts" component={ShortsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="History" component={HistoryPage} options={{ headerShown: false }} />
          <Stack.Screen name="Subscriptions" component={SubscriptionsScreen} options={{ headerShown: false }} />
          <Stack.Screen name="searchsettings" component={SearchSetting} options={{ headerShown: false }} />
          <Stack.Screen name="Live" component={LiveScreen} options={{ headerShown: false }} />
        </Stack.Navigator>

        {/* ভাসমান গ্লোবাল কম্পোনেন্টগুলো */}
        <GlobalPlayer />
        <GlobalDownloadManager />
        <GlobalDownloadOverlay />
      </View>

    </SafeAreaView>
  );
}

// 🚀 মেইন App ফাংশন
export default function App() {
  return (
    <LanguageProvider>
      <ThemeProvider>
        <NavigationContainer>
          <AppContent />
        </NavigationContainer>
      </ThemeProvider>
    </LanguageProvider>
  );
}
