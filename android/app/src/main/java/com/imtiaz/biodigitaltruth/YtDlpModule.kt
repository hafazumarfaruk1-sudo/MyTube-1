package com.imtiaz.biodigitaltruth

import com.facebook.react.bridge.*
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "YtDlpModule"
    }

    @ReactMethod
    fun extractVideoInfo(videoUrl: String, promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val request = YoutubeDLRequest(videoUrl)
                request.addOption("-j") 
                request.addOption("--no-warnings")
                request.addOption("--no-playlist")
                request.addOption("--no-check-certificate")
                
                request.addOption("--write-comments")
                request.addOption("--extractor-args")
                request.addOption("youtube:max_comments=100")

                val response = YoutubeDL.getInstance().execute(request, null, null)

                if (response.out.isNullOrEmpty()) {
                    promise.reject("EXTRACTION_ERROR", "No data received from yt-dlp")
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
                // 🚨 নতুন ভার্সন (0.18.1)-এর জন্য সঠিক আপডেট কমান্ড
                YoutubeDL.getInstance().updateYoutubeDL(app, YoutubeDL.UpdateChannel.STABLE)
                promise.resolve("UPDATED_SUCCESSFULLY")
            } catch (e: Exception) {
                promise.reject("UPDATE_ERROR", e.message)
            }
        }
    }
}