package com.imtiaz.biodigitaltruth

import android.app.Application
import android.content.res.Configuration
import android.util.Log

import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.ReactNativeHost
import com.facebook.react.ReactPackage
import com.facebook.react.ReactHost
import com.facebook.react.common.ReleaseLevel
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint
import com.facebook.react.defaults.DefaultReactNativeHost

import expo.modules.ApplicationLifecycleDispatcher
import expo.modules.ReactNativeHostWrapper

// 🚨 YoutubeDL এবং FFmpeg ইমপোর্ট
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.ffmpeg.FFmpeg // 👈 FFmpeg ইমপোর্ট যুক্ত করা হয়েছে

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // 🚨 আমাদের কাস্টম মডিউল প্যাকেজ এখানে যুক্ত করা হলো
              add(YtDlpPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"
          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  override fun onCreate() {
    super.onCreate()
    
    // 🚨 yt-dlp এবং FFmpeg initialization (অ্যাপ চালুর সাথে সাথে ইঞ্জিন স্টার্ট)
    try {
        YoutubeDL.getInstance().init(this)
        FFmpeg.getInstance().init(this) // 👈 FFmpeg এখানে চালু করা হলো
        Log.d("YoutubeDL", "Initialized successfully")
    } catch (e: Exception) {
        Log.e("YoutubeDL", "Failed to initialize", e)
    }

    DefaultNewArchitectureEntryPoint.releaseLevel = try {
      ReleaseLevel.valueOf(BuildConfig.REACT_NATIVE_RELEASE_LEVEL.uppercase())
    } catch (e: IllegalArgumentException) {
      ReleaseLevel.STABLE
    }
    loadReactNative(this)
    ApplicationLifecycleDispatcher.onApplicationCreate(this)
  }

  override fun onConfigurationChanged(newConfig: Configuration) {
    super.onConfigurationChanged(newConfig)
    ApplicationLifecycleDispatcher.onConfigurationChanged(this, newConfig)
  }
}
