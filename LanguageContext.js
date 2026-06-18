import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const LanguageContext = createContext();

const defaultTranslations = {
  en: {
    LIVE: 'LIVE',
    MyTube: 'MyTube',
    'সার্চ লাইভ...': 'Search live...',
    'সার্চ...': 'Search...',
    'You have no watch history yet.': 'You have no watch history yet.',
    "You haven't subscribed to any channel yet.": "You haven't subscribed to any channel yet.",
    'কোনো ডাউনলোড পাওয়া যায়নি': 'No downloads found',
    'My Saved Playlist': 'My Saved Playlist',
    'প্লেলিস্ট একদম ফাঁকা!': 'Playlist is empty!',
    'সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়': 'Settings are saved automatically',

    // Common UI labels
    'Default': 'Default',
    'Share': 'Share',
    'Apply Settings...': 'Applying Settings...',
    'Search...': 'Search...',
    'search': 'Search',
    'subscriptions': 'My Subscriptions',
    'thumbnailQualityControl': 'Thumbnail Quality Control',
    'current': 'Current',
    'unsubscribe': 'Unsubscribe',
    'unsubscribeConfirm': 'Unsubscribe from %s?',
    'defaultTag': 'Cancel',
    'success': 'Success',

    // Player / content
    'Description': 'Description',
    'Comments': 'Comments',
    'Audio': 'Audio',
    'Download': 'Download',
    'Fetching video details via MyTube Server...': 'Fetching video details via MyTube Server...',
    'Fetching links...': 'Fetching links...',
    'Loading Video...': 'Loading Video...',
    'Loading Description...': 'Loading Description...',
    'Loading Comments...': 'Loading Comments...',
    'No comments found': 'No comments found',
    'Video': 'Video',

    // Home / navigation
    'menu': 'Menu',
    'home': 'Home',
    'shorts': 'Shorts',
    'live': 'Live',
    'me': 'Me',

    // Settings / me menu
    'history': 'History',
    'historyDesc': 'View your watch history',
    'download': 'Downloads',
    'downloadDesc': 'Manage downloads',
    'subscribe': 'Subscriptions',
    'subscribeDesc': 'Manage your subscriptions',
    'playlist': 'Playlist',
    'playlistDesc': 'Your saved playlists',
    'settings': 'Settings',
    'settingsDesc': 'App settings',
    'darkMode': 'Dark Mode',
    'darkModeDesc': 'Toggle dark theme',
    'language': 'Language',
    'languageDesc': 'Change app language',

    // Misc
    'Share': 'Share',
    'search': 'Search'
  },
  bn: {
    LIVE: 'লাইভ',
    MyTube: 'মাইটিউব',
    'সার্চ লাইভ...': 'সার্চ লাইভ...',
    'সার্চ...': 'সার্চ...',
    'You have no watch history yet.': 'আপনার কোনো দেখার ইতিহাস নেই।',
    "You haven't subscribed to any channel yet.": 'আপনি কোনো চ্যানেলে সাবস্ক্রাইব করেননি।',
    'কোনো ডাউনলোড পাওয়া যায়নি': 'কোনো ডাউনলোড পাওয়া যায়নি',
    'My Saved Playlist': 'আমার সেভ করা প্লেলিস্ট',
    'প্লেলিস্ট একদম ফাঁকা!': 'প্লেলিস্ট একদম ফাঁকা!',
    'সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়': 'সেটিংস স্বয়ংক্রিয়ভাবে সংরক্ষিত হয়',

    // Common UI labels
    'Default': 'ডিফল্ট',
    'Share': 'শেয়ার',
    'Apply Settings...': 'সেটিংস প্রয়োগ করা হচ্ছে...',
    'Search...': 'সার্চ...',
    'search': 'সার্চ',
    'subscriptions': 'আমার সাবস্ক্রিপশন',
    'thumbnailQualityControl': 'থাম্বনেইল কোয়ালিটি কন্ট্রোল',
    'current': 'বর্তমান',
    'unsubscribe': 'সাবস্ক্রাইব ছেড়ে দিন',
    'unsubscribeConfirm': '%s থেকে সাবস্ক্রাইব ছেড়ে দিতে চান?',
    'defaultTag': 'বাতিল',
    'success': 'সফল',

    // Player / content
    'Description': 'বর্ণনা',
    'Comments': 'মন্তব্য',
    'Audio': 'অডিও',
    'Download': 'ডাউনলোড',
    'Fetching video details via MyTube Server...': 'MyTube সার্ভার থেকে ভিডিও বিবরণ আনছে...',
    'Fetching links...': 'লিঙ্ক সংগ্রহ করা হচ্ছে...',
    'Loading Video...': 'ভিডিও লোড হচ্ছে...',
    'Loading Description...': 'বর্ণনা লোড হচ্ছে...',
    'Loading Comments...': 'মন্তব্য লোড হচ্ছে...',
    'No comments found': 'কোনো মন্তব্য পাওয়া যায়নি',
    'Video': 'ভিডিও',

    // Home / navigation
    'menu': 'মেনু',
    'home': 'হোম',
    'shorts': 'শর্টস',
    'live': 'লাইভ',
    'me': 'প্রোফাইল',

    // Settings / me menu
    'history': 'ইতিহাস',
    'historyDesc': 'আপনার দেখার ইতিহাস দেখুন',
    'download': 'ডাউনলোড',
    'downloadDesc': 'ডাউনলোড ব্যবস্থাপনা',
    'subscribe': 'সাবস্ক্রিপশন',
    'subscribeDesc': 'আপনার সাবস্ক্রিপশন পরিচালনা করুন',
    'playlist': 'প্লেলিস্ট',
    'playlistDesc': 'আপনি সেভ করা প্লেলিস্ট',
    'settings': 'সেটিংস',
    'settingsDesc': 'অ্যাপ সেটিংস',
    'darkMode': 'ডার্ক মোড',
    'darkModeDesc': 'অন্ধকার থিম চালু/বন্ধ',
    'language': 'ভাষা',
    'languageDesc': 'অ্যাপের ভাষা পরিবর্তন করুন',

    // Misc
    'Share': 'শেয়ার',
    'search': 'সার্চ',

    // Specific Bangla strings used as keys (keep them identical)
    'অ্যাড ফিল্টার হচ্ছে...': 'অ্যাড ফিল্টার হচ্ছে...',
    'প্লেলিস্ট একদম ফাঁকা!': 'প্লেলিস্ট একদম ফাঁকা!',
    'ভিডিও চলাকালীন সেটিংস থেকে "Save to Playlist" এ ক্লিক করে ভিডিও সেভ করুন।': 'ভিডিও চলাকালীন সেটিংস থেকে "Save to Playlist" এ ক্লিক করে ভিডিও সেভ করুন।'
  }
};

export const LanguageProvider = ({ children }) => {
  const [locale, setLocale] = useState('bn');

  useEffect(() => {
    const loadLang = async () => {
      try {
        const saved = await AsyncStorage.getItem('app_language');
        if (saved) setLocale(saved);
      } catch (e) {}
    };
    loadLang();
  }, []);

  const changeLanguage = async (lang) => {
    try {
      setLocale(lang);
      await AsyncStorage.setItem('app_language', lang);
    } catch (e) {}
  };

  const t = (key) => {
    try {
      const map = defaultTranslations[locale] || defaultTranslations.en;
      return map[key] || defaultTranslations.en[key] || key;
    } catch (e) {
      return key;
    }
  };

  // expose legacy global function used across the codebase
  useEffect(() => {
    try { global.__translate = t; } catch (e) {}
  }, [locale]);

  return (
    <LanguageContext.Provider value={{ locale, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
