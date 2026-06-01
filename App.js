import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as NavigationBar from 'expo-navigation-bar'; // সিস্টেম বার কন্ট্রোল করার জন্য

import { ThemeProvider, useTheme } from './ThemeContext'; 
import { LanguageProvider } from './LanguageContext'; 

// ==========================================
// ১. Screens ফোল্ডার থেকে ফাইল ইমপোর্ট
// ==========================================
import HomeScreen from './Screens/HomeScreen';
import ChannelScreen from './Screens/ChannelScreen';
import PlayerScreen from './Screens/PlayerScreen';
import PlaylistPage from './Screens/PlaylistPage';
import ShortsScreen from './Screens/ShortsScreen';
import SubscriptionsScreen from './Screens/SubscriptionsScreen';
import livescreen from './Screens/livescreen'; 

// ==========================================
// ২. Settings ফোল্ডার থেকে ফাইল ইমপোর্ট
// ==========================================
import SettingsScreen from './Settings/SettingsScreen';
import HistoryPage from './Settings/HistoryPage';
import downloadscreen from './Settings/downloadscreen'; 
import SearchSetting from './Settings/searchsetting';
import GlobalPlayer from './Settings/GlobalPlayer'; 

const Stack = createStackNavigator();

// [NEW] MainApp নামে একটি চাইল্ড কম্পোনেন্ট তৈরি করা হলো, যাতে useTheme() কাজ করে
function MainApp() {
  const { isDarkMode } = useTheme();

  useEffect(() => {
    // থিম চেঞ্জ হওয়ার সাথে সাথে সিস্টেম নেভিগেশন বার আপডেট করার ফাংশন
    const updateSystemNavigationBar = async () => {
      try {
        // সিস্টেম বারের ব্যাকগ্রাউন্ড কালার
        await NavigationBar.setBackgroundColorAsync(isDarkMode ? '#000000' : '#FFFFFF');
        // সিস্টেম বারের বাটন কালার (ডার্ক মোডে সাদা বাটন, লাইট মোডে কালো বাটন)
        await NavigationBar.setButtonStyleAsync(isDarkMode ? 'light' : 'dark');
      } catch (error) {
        console.log("Navigation Bar Update Error:", error);
      }
    };

    updateSystemNavigationBar();
  }, [isDarkMode]);

  return (
    <NavigationContainer>
      <Stack.Navigator 
        initialRouteName="Home"
        screenOptions={{
          // পুরো অ্যাপের ব্যাকগ্রাউন্ডও থিম অনুযায়ী চেঞ্জ হবে
          cardStyle: { backgroundColor: isDarkMode ? '#000000' : '#F5F5F5' } 
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
        <Stack.Screen name="Downloads" component={downloadscreen} options={{ headerShown: false }} />
        <Stack.Screen name="Live" component={livescreen} options={{ headerShown: false }} />
      </Stack.Navigator>

      {/* গ্লোবাল প্লেয়ার */}
      <GlobalPlayer />
    </NavigationContainer>
  );
}

// মূল App কম্পোনেন্ট
export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <MainApp />
      </LanguageProvider>
    </ThemeProvider>
  );
}