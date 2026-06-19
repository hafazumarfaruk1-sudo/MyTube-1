package com.imtiaz.biodigitaltruth

import com.facebook.react.bridge.*
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import org.json.JSONObject
// 🚨 ব্যাকগ্রাউন্ড থ্রেডে চালানোর জন্য Coroutines ইমপোর্ট (খুবই জরুরি)
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.launch

class YtDlpModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "YtDlpModule"
    }

    @ReactMethod
    fun extractVideoInfo(videoUrl: String, requestedQuality: Int, promise: Promise) {
        // 🚨 নেটওয়ার্ক রিকোয়েস্ট তাই ব্যাকগ্রাউন্ড থ্রেডে (IO) চালানো হচ্ছে যেন অ্যাপ ক্র্যাশ না করে
        GlobalScope.launch(Dispatchers.IO) {
            try {
                val request = YoutubeDLRequest(videoUrl)
                request.addOption("-j") // JSON ফরম্যাট আউটপুট
                request.addOption("--no-warnings")
                request.addOption("--no-playlist")
                request.addOption("--no-check-certificate")

                val response = YoutubeDL.getInstance().execute(request, null, null)
                
                if (response.out.isNullOrEmpty()) {
                    promise.reject("EXTRACTION_ERROR", "No data received from yt-dlp")
                    return@launch
                }

                val output = JSONObject(response.out)
                val resultObj = JSONObject()
                
                resultObj.put("success", true)
                resultObj.put("title", output.optString("title"))
                resultObj.put("thumbnail", output.optString("thumbnail"))

                val formats = output.optJSONArray("formats")
                var finalVideoUrl: String? = null
                var finalAudioUrl: String? = null
                var streamType = "combined"

                if (formats != null) {
                    // ১. Combined ফরম্যাট (অডিও + ভিডিও একসাথে) খোঁজা
                    for (i in formats.length() - 1 downTo 0) {
                        val f = formats.getJSONObject(i)
                        val height = f.optInt("height", 0)
                        val vcodec = f.optString("vcodec", "none")
                        val acodec = f.optString("acodec", "none")
                        val ext = f.optString("ext", "")

                        if (height <= requestedQuality && vcodec != "none" && acodec != "none" && (ext == "mp4" || ext == "3gp")) {
                            finalVideoUrl = f.optString("url")
                            break
                        }
                    }

                    // ২. Combined না পেলে আলাদা ভিডিও এবং অডিও খোঁজা (server.js লজিক)
                    if (finalVideoUrl == null) {
                        var vOnlyUrl: String? = null
                        var aOnlyUrl: String? = null

                        for (i in formats.length() - 1 downTo 0) {
                            val f = formats.getJSONObject(i)
                            val height = f.optInt("height", 0)
                            val vcodec = f.optString("vcodec", "none")
                            val acodec = f.optString("acodec", "none")
                            val ext = f.optString("ext", "")

                            if (vOnlyUrl == null && height <= requestedQuality && vcodec != "none" && acodec == "none" && (ext == "mp4" || ext == "webm")) {
                                vOnlyUrl = f.optString("url")
                            }
                            if (aOnlyUrl == null && acodec != "none" && vcodec == "none") {
                                aOnlyUrl = f.optString("url")
                            }
                        }

                        if (vOnlyUrl != null && aOnlyUrl != null) {
                            finalVideoUrl = vOnlyUrl
                            finalAudioUrl = aOnlyUrl
                            streamType = "separate"
                        } else if (vOnlyUrl != null) {
                            finalVideoUrl = vOnlyUrl
                        }
                    }
                }

                // ৩. Fallback (কিছুই না পেলে ডিফল্ট)
                if (finalVideoUrl == null) {
                    finalVideoUrl = output.optString("url", null)
                }

                resultObj.put("url", finalVideoUrl ?: "")
                resultObj.put("audioUrl", finalAudioUrl ?: "")
                resultObj.put("streamType", streamType)

                // 🚨 রেজাল্ট React Native এ পাঠানো হলো
                promise.resolve(resultObj.toString())

            } catch (e: Exception) {
                promise.reject("YT_DLP_ERROR", e.message)
            }
        }
    }
}
