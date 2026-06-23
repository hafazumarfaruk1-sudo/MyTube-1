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

// YoutubeDL এবং FFmpeg ইমপোর্ট
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.ffmpeg.FFmpeg

// 🚨 ব্যাকগ্রাউন্ড থ্রেড (Coroutine) এর জন্য ইমপোর্ট 🚨
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              add(YtDlpPackage()) // আপনার নেটিভ মডিউল
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

    // 🚨 অ্যাপ ওপেন হওয়ার সাথে সাথে ইঞ্জিনের বুট সিকোয়েন্স (পাওয়ার অন) এবং ডিটেইলড লগিং 🚨
    GlobalScope.launch(Dispatchers.IO) {
        println("============ 🔌 [ENGINE BOOT] Initiating Power-On Sequence... ============")
        try {
            println("============ 📂 [ENGINE BOOT] Unzipping Python Environment... ============")
            YoutubeDL.getInstance().init(this@MainApplication)
            
            println("============ 📂 [ENGINE BOOT] Unzipping FFmpeg Binary... ============")
            FFmpeg.getInstance().init(this@MainApplication)
            
            println("============ 🧠 [ENGINE BOOT SUCCESS] Engine is fully AWAKE and READY! ============")
        } catch (e: Exception) {
            println("============ 💀 [ENGINE BOOT FATAL ERROR] Failed to initialize: ${e.message} ============")
            e.printStackTrace()
        }
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