package com.imtiaz.biodigitaltruth

import android.app.Application
import com.facebook.react.bridge.*
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.ffmpeg.FFmpeg // 👈 FFmpeg ইমপোর্ট করা হলো
import com.yausername.youtubedl_android.YoutubeDLRequest
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "YtDlpModule"
    }

    // 🚨 ১. ভিডিও ডেটা বের করার ফাংশন
    @ReactMethod
    fun extractVideoInfo(videoUrl: String, promise: Promise) {
        // ব্যাকগ্রাউন্ড থ্রেডে কাজ হবে যেন UI না আটকায়
        GlobalScope.launch(Dispatchers.IO) {
            try {
                // 🚨 জাস্ট-ইন-টাইম ইনিশিয়ালাইজেশন
                try {
                    val app = reactApplicationContext.applicationContext as Application
                    YoutubeDL.getInstance().init(app)
                    FFmpeg.getInstance().init(app) // 👈 FFmpeg ও একসাথে চালু হবে
                } catch (e: Exception) {
                    promise.reject("INIT_ERROR", "ইঞ্জিন চালু হতে ব্যর্থ হয়েছে: " + e.localizedMessage)
                    return@launch
                }

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

    // 🚨 ২. ইঞ্জিন আপডেট করার জাদুকরী ফাংশন
    // ইউটিউব তাদের কোড পরিবর্তন করলে এই ফাংশনটি কল করলেই ইঞ্জিন নিজে নিজে ঠিক হয়ে যাবে!
    @ReactMethod
    fun updateEngine(promise: Promise) {
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val app = reactApplicationContext.applicationContext as Application
                YoutubeDL.getInstance().init(app)
                val status = YoutubeDL.getInstance().updateYoutubeDL(app, YoutubeDL.UpdateChannel.STABLE)
                promise.resolve(status?.name ?: "UPDATED")
            } catch (e: Exception) {
                promise.reject("UPDATE_ERROR", e.message)
            }
        }
    }
}