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
    'Default': 'Default',
    'Share': 'Share',
    'LIVE': 'LIVE',
    'Apply Settings...': 'Applying Settings...'
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
    'Default': 'ডিফল্ট',
    'Share': 'শেয়ার',
    'LIVE': 'লাইভ',
    'Apply Settings...': 'সেটিংস প্রয়োগ করা হচ্ছে...'
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
