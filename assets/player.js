/**
 * IPTV Stream Player Controller (HLS.js / MPEGTS.js)
 */
document.addEventListener("DOMContentLoaded", function () {
    const video = document.getElementById("iptv-stream-video");
    const loader = document.getElementById("video-stream-loader");
    const errorOverlay = document.getElementById("stream-error-overlay");

    if (!video) return;

    const streamUrl = video.getAttribute("data-stream-url");
    if (!streamUrl) {
        showStreamError();
        return;
    }

    // Determine type by parsing string matches
    const isM3u8 = streamUrl.toLowerCase().includes(".m3u8") || streamUrl.includes("m3u8");
    const isTs = streamUrl.toLowerCase().includes(".ts") || streamUrl.includes("/live/");

    let hlsInstance = null;
    let mpegtsPlayer = null;
    let timeoutGuard = setTimeout(function() {
        if (loader && loader.style.display !== "none" && video.paused) {
            // Check if error actually happened or if video can be played but is just waiting/paused
            if (video.readyState >= 2) {
                hideLoader();
            } else {
                showStreamError();
            }
        }
    }, 12000);

    function hideLoader() {
        clearTimeout(timeoutGuard);
        if (loader) loader.style.display = "none";
    }

    function showStreamError() {
        clearTimeout(timeoutGuard);
        if (loader) loader.style.display = "none";
        if (errorOverlay) {
            errorOverlay.style.display = "flex";
            
            // Mixed content check
            const streamIsHttp = streamUrl.toLowerCase().startsWith("http://");
            const pageIsHttps = window.location.protocol === "https:";
            
            if (streamIsHttp && pageIsHttps) {
                const titleEl = errorOverlay.querySelector(".error-title");
                const descEl = errorOverlay.querySelector(".error-desc");
                
                if (titleEl) {
                    titleEl.innerHTML = "تنبيه الأمان: تقييد البث المباشر (HTTP ⚠️)";
                }
                if (descEl) {
                    descEl.innerHTML = `
                        يستخدم خادم IPTV الخاص بك بروتوكول <strong style="color:#ff3b45">http://</strong> غير المشفر، بينما تعمل هذه اللوحة الحالية عبر اتصال آمن <strong style="color:#10b981">https://</strong>. يقوم المتصفح افتراضياً بحجب هذا البث لحمايتك (Mixed Content).
                        <div style="background-color: #1a1a1a; padding: 15px; border-radius: 12px; margin-top: 15px; text-align: right; border: 1px solid #333; font-size: 11px; line-height: 1.6;">
                            <span style="color:#e50914; font-weight:bold; display:block; margin-bottom: 6px;">💡 كيف تجعل القناة تعمل فوراً؟</span>
                            1. انقر فوق <strong>أيقونة الإعدادات ⚙️ أو القفل 🔒</strong> بجوار شريط عنوان موقعنا أعلاه.<br>
                            2. اضغط على <strong>"إعدادات الموقع" (Site Settings)</strong>.<br>
                            3. ابحث عن خيار <strong>"المحتوى غير الآمن" (Insecure Content)</strong> في الأسفل للكروم وضعه على <strong>"السماح" (Allow)</strong>.<br>
                            4. قم بتحديث الصفحة وسوف تنطلق القناة مباشرة وبسرعة فائقة!<br>
                            <span style="display:block; margin-top:10px; color:#aaa;">أو يمكنك تجربة تشغيل الرابط بشكل مستقل أو تحويل الرابط يدوياً إلى https:// إذا كان خادمك يدعمه.</span>
                        </div>
                    `;
                }
            }
        }
    }

    function handlePlayPromise(playPromise) {
        if (playPromise !== undefined) {
            playPromise.then(function() {
                hideLoader();
            }).catch(function(error) {
                console.warn("Autoplay block or playback interruption exception:", error);
                
                // If the error is a user-interaction autoplay block, do NOT trigger the red error wall.
                // Instead, just hide the loader and let the user tap the video controls themselves.
                if (error.name === "NotAllowedError" || error.message.includes("play() failed")) {
                    hideLoader();
                    // Fallback attempt: try to play muted (many browsers allow muted autoplay)
                    video.muted = true;
                    video.play().catch(function() {
                        // If it fails even when muted, we keep the loader hidden so the user sees the media controls and can tap Play manually.
                        hideLoader();
                    });
                } else {
                    showStreamError();
                }
            });
        } else {
            // Older browsers with no promise return
            hideLoader();
        }
    }

    // Route all external content via local proxy only if it's a Mixed Content issue (HTTP stream on HTTPS webpage)
    let finalUrl = streamUrl;
    const streamIsHttp = streamUrl.toLowerCase().startsWith("http://");
    const pageIsHttps = window.location.protocol === "https:";

    if (streamIsHttp && pageIsHttps && !streamUrl.startsWith(window.location.origin)) {
        const isPhpContext = window.location.pathname.endsWith('/player.php') || window.location.pathname.includes('.php');
        if (isPhpContext) {
            finalUrl = "proxy.php?url=" + encodeURIComponent(streamUrl);
        } else {
            finalUrl = "/api/stream-proxy?url=" + encodeURIComponent(streamUrl);
        }
        console.log("PHP Player secure proxy bypass (Mixed Content):", finalUrl);
    } else {
        console.log("PHP Player direct stream load (No proxy needed):", finalUrl);
    }

    try {
        if (isTs) {
            // Apply MPEGTS Player
            if (typeof mpegts !== "undefined" && mpegts.getFeatureList().mseLivePlayback) {
                mpegtsPlayer = mpegts.createPlayer({
                    type: "mpegts",
                    isLive: true,
                    url: finalUrl
                });
                mpegtsPlayer.attachMediaElement(video);
                mpegtsPlayer.load();
                
                mpegtsPlayer.on(mpegts.Events.ERROR, function (eType, eDetail) {
                    console.error("MPEGTS engine threw error:", eType, eDetail);
                    showStreamError();
                });

                handlePlayPromise(mpegtsPlayer.play());
            } else {
                // Fallback direct source binding
                video.src = finalUrl;
                video.load();
                handlePlayPromise(video.play());
            }
        } else if (isM3u8) {
            // Apply HLS.js Player
            if (typeof Hls !== "undefined" && Hls.isSupported()) {
                class ProxyHlsLoader extends Hls.DefaultConfig.loader {
                    constructor(config) {
                        super(config);
                        const superLoad = this.load.bind(this);
                        this.load = function (context, config, callbacks) {
                            if (context.url) {
                                let targetUrl = context.url;
                                
                                // If the HLS resolver appended relative chunks to our proxy URL, un-wrap them
                                if (targetUrl.includes('/api/stream-proxy') || targetUrl.includes('proxy.php')) {
                                    try {
                                        const urlObj = new URL(targetUrl, window.location.origin);
                                        const original = urlObj.searchParams.get('url');
                                        if (original) {
                                            targetUrl = original;
                                        }
                                    } catch (e) {
                                        console.warn('Error parsing proxied URL in loader:', e);
                                    }
                                }
                                
                                const segmentIsHttp = targetUrl.toLowerCase().startsWith("http://");
                                if (segmentIsHttp && pageIsHttps && !targetUrl.startsWith(window.location.origin)) {
                                    const isPhpContext = window.location.pathname.endsWith('/player.php') || window.location.pathname.includes('.php');
                                    if (isPhpContext) {
                                        context.url = "proxy.php?url=" + encodeURIComponent(targetUrl);
                                    } else {
                                        context.url = "/api/stream-proxy?url=" + encodeURIComponent(targetUrl);
                                    }
                                } else {
                                    context.url = targetUrl;
                                }
                            }
                            superLoad(context, config, callbacks);
                        };
                    }
                }

                hlsInstance = new Hls({
                    maxMaxBufferLength: 45,
                    lowLatencyMode: false,
                    enableWorker: true,
                    loader: ProxyHlsLoader
                });
                hlsInstance.loadSource(finalUrl);
                hlsInstance.attachMedia(video);

                hlsInstance.on(Hls.Events.MANIFEST_PARSED, function () {
                    handlePlayPromise(video.play());
                });

                hlsInstance.on(Hls.Events.ERROR, function (event, data) {
                    if (data.fatal) {
                        console.warn("HLS fatal error encountered:", data);
                        hlsInstance.recoverMediaError();
                        
                        // Fail permanently only after second fallback trial
                        setTimeout(function() {
                            if (video.paused && video.readyState < 2) {
                                showStreamError();
                            }
                        }, 4000);
                    }
                });
            } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
                // Safari or native phone browser HLS playback
                video.src = finalUrl;
                video.addEventListener("loadedmetadata", function () {
                    handlePlayPromise(video.play());
                });
                video.addEventListener("error", showStreamError);
            } else {
                showStreamError();
            }
        } else {
            // Native format (.mp4 or other plain stream browser codecs)
            video.src = finalUrl;
            video.load();
            handlePlayPromise(video.play());
            video.addEventListener("error", showStreamError);
        }
    } catch (error) {
        console.error("Critical core playback initiator error:", error);
        showStreamError();
    }

    // --- Custom Overlay Controller Bindings ---
    const playPauseBtn = document.getElementById("php-play-pause-btn");
    const playIcon = document.getElementById("php-play-icon");
    const pauseIcon = document.getElementById("php-pause-icon");
    const skipForwardBtn = document.getElementById("php-skip-forward-15");
    const skipBackwardBtn = document.getElementById("php-skip-backward-5");
    const rotateBtn = document.getElementById("php-rotate-btn");
    const muteBtn = document.getElementById("php-mute-btn");
    const pipBtn = document.getElementById("php-pip-btn");
    const fullscreenBtn = document.getElementById("php-fullscreen-btn");
    const seekTrack = document.getElementById("php-seek-track");
    const seekFill = document.getElementById("php-seek-fill");

    if (playPauseBtn) {
        playPauseBtn.addEventListener("click", function() {
            if (video.paused) {
                video.play().catch(console.warn);
            } else {
                video.pause();
            }
        });
    }

    video.addEventListener("play", function() {
        if (playIcon) playIcon.style.display = "none";
        if (pauseIcon) pauseIcon.style.display = "flex";
    });

    video.addEventListener("pause", function() {
        if (playIcon) playIcon.style.display = "block";
        if (pauseIcon) pauseIcon.style.display = "none";
    });

    if (skipForwardBtn) {
        skipForwardBtn.addEventListener("click", function() {
            video.currentTime += 15;
        });
    }

    if (skipBackwardBtn) {
        skipBackwardBtn.addEventListener("click", function() {
            video.currentTime -= 5;
        });
    }

    if (rotateBtn) {
        rotateBtn.addEventListener("click", function() {
            video.classList.toggle("rotated-90-v");
            rotateBtn.classList.toggle("active-state");
        });
    }

    if (muteBtn) {
        muteBtn.addEventListener("click", function() {
            video.muted = !video.muted;
            if (video.muted) {
                muteBtn.classList.add("sound-muted");
            } else {
                muteBtn.classList.remove("sound-muted");
            }
        });
    }

    if (pipBtn) {
        pipBtn.addEventListener("click", function() {
            if (document.pictureInPictureElement) {
                document.exitPictureInPicture().catch(console.warn);
            } else {
                video.requestPictureInPicture().catch(console.warn);
            }
        });
    }

    if (fullscreenBtn) {
        fullscreenBtn.addEventListener("click", function() {
            const container = document.getElementById("cinema-theater-container");
            if (container) {
                if (!document.fullscreenElement) {
                    container.requestFullscreen().catch(console.warn);
                } else {
                    document.exitFullscreen().catch(console.warn);
                }
            }
        });
    }

    video.addEventListener("timeupdate", function() {
        if (video.duration && seekFill) {
            const pct = (video.currentTime / video.duration) * 100;
            seekFill.style.width = pct + "%";
        }
    });

    if (seekTrack) {
        seekTrack.addEventListener("click", function(e) {
            if (video.duration) {
                const rect = seekTrack.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                const pct = clickX / rect.width;
                video.currentTime = pct * video.duration;
            }
        });
    }

    // --- Custom Controls Timeout Auto-Hide (2 seconds) ---
    const container = document.getElementById("cinema-theater-container");
    const overlay = document.querySelector(".custom-video-overlay");
    let controlsTimeout = null;

    function resetControlsTimeout() {
        if (container) {
            container.classList.add("show-controls");
        }
        if (controlsTimeout) {
            clearTimeout(controlsTimeout);
        }
        controlsTimeout = setTimeout(function() {
            if (container) {
                container.classList.remove("show-controls");
            }
        }, 2000);
    }

    // Initialize/Show controls on load
    resetControlsTimeout();

    // Trigger on pointer interactions
    if (container) {
        container.addEventListener("click", function(e) {
            // If controls are currently hidden, click container to show them
            if (!container.classList.contains("show-controls")) {
                resetControlsTimeout();
                return;
            }

            // If controls are shown, clicking empty backdrop area hides them
            if (e.target === overlay || e.target === container) {
                container.classList.remove("show-controls");
                if (controlsTimeout) clearTimeout(controlsTimeout);
            } else {
                // Clicking custom inner buttons resets the timer
                resetControlsTimeout();
            }
        });

        container.addEventListener("mousemove", resetControlsTimeout);
        container.addEventListener("touchstart", resetControlsTimeout);
    }

    // Safely clear assets when window or page is closed
    window.addEventListener("beforeunload", function () {
        if (hlsInstance) {
            hlsInstance.destroy();
        }
        if (mpegtsPlayer) {
            mpegtsPlayer.unload();
            mpegtsPlayer.detachMediaElement();
            mpegtsPlayer.destroy();
        }
    });
});
