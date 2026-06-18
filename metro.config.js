const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// 🚨 মেট্রো বান্ডলারকে .tflite ফাইল চেনার পারমিশন দেওয়া হলো
config.resolver.assetExts.push('tflite');

module.exports = config;