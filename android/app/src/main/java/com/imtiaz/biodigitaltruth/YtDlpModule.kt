package com.imtiaz.biodigitaltruth

import android.app.Application
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
                // 🚨 জাস্ট-ইন-টাইম ইনিশিয়ালাইজেশন (সবচেয়ে সেফ পদ্ধতি)
                try {
                    val app = reactApplicationContext.applicationContext as Application
                    YoutubeDL.getInstance().init(app)
                } catch (e: Exception) {
                    // ইঞ্জিন কোনো কারণে চালু হতে ব্যর্থ হলে, এখন আর সে চুপ করে ক্র্যাশ করবে না
                    // সে সরাসরি আপনাকে আসল কারণটি দেখাবে!
                    promise.reject("INIT_ERROR", "ইঞ্জিন চালু হতে ব্যর্থ হয়েছে: " + e.localizedMessage)
                    return@launch
                }

                val request = YoutubeDLRequest(videoUrl)
                request.addOption("-j") // JSON আউটপুট
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

                // ডেটা সফলভাবে পেলে পাঠাবে
                promise.resolve(response.out)

            } catch (e: Exception) {
                promise.reject("YT_DLP_ERROR", e.message)
            }
        }
    }
}