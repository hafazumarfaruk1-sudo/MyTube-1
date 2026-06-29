package com.imtiaz.biodigitaltruth

import android.util.Log
import com.facebook.react.bridge.*
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "YtDlpModule"
    }

    private fun sendLogToTerminal(message: String) {
        Log.d("YtDlpModule", message) 
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit("EngineLiveLog", message)
        } catch (e: Exception) { }
    }

    // 🚨 অপশনগুলো এখন আর হার্ডকোড করা নেই, JS থেকে আসবে 🚨
    @ReactMethod
    fun extractFastVideoInfo(videoUrl: String, options: ReadableMap, promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            sendLogToTerminal("\n============ 🟢 [DYNAMIC ENGINE] Fast Extraction Started ============")
            try {
                val request = YoutubeDLRequest(videoUrl)
                
                // JS থেকে আসা ডাইনামিক কমান্ডগুলো পড়া হচ্ছে
                val iterator = options.keySetIterator()
                while (iterator.hasNextKey()) {
                    val key = iterator.nextKey()
                    val value = options.getString(key)
                    if (value.isNullOrEmpty() || value == "null") {
                        request.addOption(key)
                    } else {
                        request.addOption(key, value)
                    }
                }

                val response = YoutubeDL.getInstance().execute(request, null, null)
                
                if (response.out.isNullOrEmpty()) {
                    promise.reject("EXTRACTION_ERROR", "No data received")
                    return@launch
                }
                promise.resolve(response.out)
            } catch (e: Exception) {
                promise.reject("YT_DLP_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun updateEngine(promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val app = reactApplicationContext.applicationContext as android.app.Application
                YoutubeDL.getInstance().updateYoutubeDL(app, YoutubeDL.UpdateChannel.STABLE)
                promise.resolve("UPDATED_SUCCESSFULLY")
            } catch (e: Exception) {
                promise.reject("UPDATE_ERROR", e.message)
            }
        }
    }
}