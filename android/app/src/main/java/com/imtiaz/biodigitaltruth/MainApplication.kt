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

// Coroutine-এর জন্য স্ট্রাকচার্ড কনকারেন্সি ইমপোর্ট
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

class MainApplication : Application(), ReactApplication {

  override val reactNativeHost: ReactNativeHost = ReactNativeHostWrapper(
      this,
      object : DefaultReactNativeHost(this) {
        override fun getPackages(): List<ReactPackage> =
            PackageList(this).packages.apply {
              // আপনার কাস্টম নেটিভ মডিউল যুক্ত করা হলো
              add(YtDlpPackage())
            }

          override fun getJSMainModuleName(): String = ".expo/.virtual-metro-entry"
          override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG
          override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
      }
  )

  override val reactHost: ReactHost
    get() = ReactNativeHostWrapper.createReactHost(applicationContext, reactNativeHost)

  // অ্যাপ্লিকেশন লাইফসাইকেলের সাথে আবদ্ধ করার জন্য ডেডিকেটেড স্কোপ তৈরি
  private val applicationScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

  override fun onCreate() {
    super.onCreate()

    // মেইন থ্রেড (UI Thread) অবরুদ্ধ না করে ব্যাকগ্রাউন্ড থ্রেডে ইঞ্জিন ইনিশিয়ালাইজেশন
    applicationScope.launch {
        try {
            YoutubeDL.getInstance().init(this@MainApplication)
            FFmpeg.getInstance().init(this@MainApplication)
            Log.d("YoutubeDL", "============ 🧠 ENGINE AWAKENED OFF-MAIN THREAD ============")
        } catch (e: Exception) {
            Log.e("YoutubeDL", "Failed to initialize engine", e)
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