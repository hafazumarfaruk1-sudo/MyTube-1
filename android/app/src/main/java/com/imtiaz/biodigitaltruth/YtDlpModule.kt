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

    @ReactMethod
    fun extractVideoInfo(videoUrl: String, promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            sendLogToTerminal("\n============ 🟢 [ENGINE START] Awakening for Extraction ============")
            sendLogToTerminal("Target URL: $videoUrl")
            
            try {
                val request = YoutubeDLRequest(videoUrl)
                request.addOption("-j") 
                request.addOption("--no-warnings")
                request.addOption("--no-playlist")
                request.addOption("--no-check-certificate")
                
                // 🚨 [FIX] ভিডিওর স্পিড ১ মিনিটে থেকে ১ সেকেন্ডে নামিয়ে আনার জন্য কমেন্ট লোডিং মুছে ফেলা হলো 🚨
                // শুধুমাত্র জাভাস্ক্রিপ্ট চ্যালেঞ্জ বাইপাসের কমান্ডটি রাখা হলো
                request.addOption("--extractor-args", "youtube:player_client=android,web_embedded;formats=missing_pot")

                sendLogToTerminal("============ ⏳ [ENGINE PROCESSING] Fast Extraction Started... ============")

                val response = YoutubeDL.getInstance().execute(request, null, null)

                sendLogToTerminal("============ ✅ [ENGINE SUCCESS] Data Extracted in Rocket Speed! ============")

                if (response.out.isNullOrEmpty()) {
                    promise.reject("EXTRACTION_ERROR", "No data received from yt-dlp")
                    return@launch
                }

                promise.resolve(response.out)

            } catch (e: Exception) {
                sendLogToTerminal("============ 💥 [ENGINE CRASH] Error: ${e.message} ============\n")
                promise.reject("YT_DLP_ERROR", e.message)
            }
        }
    }

    @ReactMethod
    fun updateEngine(promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            sendLogToTerminal("\n============ 🔄 [ENGINE UPDATE] Starting Background Update... ============")
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