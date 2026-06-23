<?php
/**
 * صفحة تشغيل القناة وعرض بطاقة التفاصيل البارزة - ارينا لايف
 */

$channelId = isset($_GET['id']) ? trim($_GET['id']) : '';
$channel = null;
$m3uFile = 'mofeed.m3u8';

if (!empty($channelId) && file_exists($m3uFile)) {
    $lines = file($m3uFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
    $current = null;

    foreach ($lines as $line) {
        $line = trim($line);
        if (strpos($line, '#EXTINF:') === 0) {
            $current = [];
            
            // Extract tvg-id
            if (preg_match('/tvg-id="([^"]+)"/i', $line, $matches)) {
                $current['id'] = $matches[1];
            } else {
                $current['id'] = 'chan_' . md5($line);
            }

            // Extract tvg-logo
            if (preg_match('/tvg-logo="([^"]+)"/i', $line, $matches)) {
                $current['logo'] = $matches[1];
            } else {
                $current['logo'] = '';
            }

            // Extract group-title
            if (preg_match('/group-title="([^"]+)"/i', $line, $matches)) {
                $current['category'] = $matches[1];
            } else {
                $current['category'] = 'قنوات عامة';
            }

            // Extract Name (after last comma)
            $commaPos = strrpos($line, ',');
            if ($commaPos !== false) {
                $current['name'] = trim(substr($line, $commaPos + 1));
            } else {
                $current['name'] = 'قناة بدون اسم';
            }

        } elseif ($current !== null && (strpos($line, 'http') === 0 || filter_var($line, FILTER_VALIDATE_URL))) {
            $current['url'] = $line;
            
            // Check if this matches our requested channel ID
            if ($current['id'] === $channelId) {
                $channel = $current;
                break;
            }
            $current = null;
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $channel ? htmlspecialchars($channel['name']) . " - بث مباشر" : "القناة غير موجودة"; ?> | ارينا لايف IPTV</title>
    <link rel="stylesheet" href="assets/style.css">
    
    <!-- Player Engines CDNs -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script src="https://cdn.jsdelivr.net/npm/mpegts.js@latest/dist/mpegts.min.js"></script>
    
    <style>
        .player-header {
            margin-bottom: 25px;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .detail-grid {
            display: grid;
            grid-template-columns: 1fr;
            gap: 20px;
        }
        @media (min-index-width: 768px) {
            .detail-grid {
                grid-template-columns: 2fr 1fr;
            }
        }
    </style>
</head>
<body>

    <!-- Header bar -->
    <header>
        <div class="header-container">
            <div class="logo-section">
                <div class="logo-icon">
                    <svg style="width:24px;height:24px;fill:white" viewBox="0 0 24 24">
                        <path d="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z" />
                    </svg>
                </div>
                <div class="logo-text">
                    <h1>ارينا <span>لايف</span></h1>
                    <p>مشغل البث التلفزيوني الاحترافي</p>
                </div>
            </div>
            <div>
                <a href="index.php" class="btn-back">
                    <svg style="width:14px;height:14px;fill:currentColor;transform:scaleX(-1);" viewBox="0 0 24 24">
                        <path d="M20,11V13H8L13.5,18.5L12.08,19.92L4.16,12L12.08,4.08L13.5,5.5L8,11H20Z" />
                    </svg>
                    <span>العودة إلى القائمة</span>
                </a>
            </div>
        </div>
    </header>

    <main class="player-container">

        <?php if (!$channel): ?>
            <div style="background-color: #222; border: 1px dashed #e50914; border-radius: 24px; padding: 60px; text-align: center; color: var(--text-muted);">
                <svg style="width:64px;height:64px;fill:#e50914;margin-bottom:20px;" viewBox="0 0 24 24">
                    <path d="M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z" />
                </svg>
                <h3 style="color:white;font-weight:bold;font-size:20px;">عذراً، القناة المطلوبة غير صالحة أو غير ممسوحة في mofeed.m3u8</h3>
                <p style="margin-top:10px;font-size:13px;">تأكد من مطابقة المعرّف (ID) الموجه مع السطور المدرجة في ملف القنوات.</p>
                <a href="index.php" class="btn-back" style="margin-top:20px;">العودة للدليل الرئيسي</a>
            </div>
        <?php else: ?>

            <div class="player-header">
                <div>
                    <h2 style="font-size: 24px; font-weight: 800; color: white;">بث مباشر: <?php echo htmlspecialchars($channel['name']); ?></h2>
                    <p style="color: var(--text-muted); font-size: 13px; margin-top: 4px;">تصنيف البث الحالي: <strong style="color:red"><?php echo htmlspecialchars($channel['category']); ?></strong></p>
                </div>
            </div>

            <!-- Cinema Theater Frame with video element -->
            <div class="cinema-screen animate-fade-in" id="cinema-theater-container">
                
                <!-- If video fails to load/play in 5 seconds, player.js will reveal the error Overlay -->
                <div id="stream-error-overlay" class="stream-error-overlay" style="display: none;">
                    <div class="stream-error-card">
                        <div class="error-title">القناة غير متاحة حالياً</div>
                        <div class="error-desc">عذرًا، فشل مهندس الاتصال لدينا في تمثيل دفق البث المباشر. يرجى التحقق من صحة وصلاحية رابط البث أو المحاولة مرة أخرى لاحقًا.</div>
                        <button onclick="window.location.reload();" class="btn-play-stream" style="font-size: 11px; padding: 8px 16px; width: 100%; border-radius: 8px; justify-content: center;">
                            <span>إعادة محاولة الربط وإطلاق البث</span>
                        </button>
                    </div>
                </div>

                <!-- Live buffering loader spinner -->
                <div id="video-stream-loader" class="video-loader">
                    <div class="spinner"></div>
                    <p style="font-size: 13px; color: #ccc;">جاري فحص بروتوكول البث وربط مشغّل المجرى التلفزيوني...</p>
                </div>

                <video id="iptv-stream-video" data-stream-url="<?php echo htmlspecialchars($channel['url']); ?>" playsinline poster="<?php echo htmlspecialchars($channel['logo']); ?>"></video>

                <!-- Custom Overlay matching mockup perfectly -->
                <div class="custom-video-overlay">
                    
                    <!-- Top Controls Row -->
                    <div class="overlay-top-row">
                        <div class="quality-badges-group">
                            <span class="q-badge">FHD</span>
                            <span class="q-badge">HD</span>
                            <span class="q-badge active-q">SD</span>
                        </div>
                        <div class="player-branding">
                            <span class="branded-title"><?php echo htmlspecialchars($channel['name']); ?></span>
                            <a href="index.php" class="circular-exit-btn" title="العودة للقائمة">
                                <svg style="width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2.5" viewBox="0 0 24 24">
                                    <path stroke-linecap="round" stroke-linejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                </svg>
                            </a>
                        </div>
                    </div>

                    <!-- Center Controls Row -->
                    <div class="overlay-center-row">
                        <!-- Concentric Play/Pause rings -->
                        <button class="concentric-play-wrapper" id="php-play-pause-btn" title="تشغيل / إيقاف">
                            <div class="outer-concentric-dial"></div>
                            <div class="concentric-spinner"></div>
                            <div class="inner-solid-circle">
                                <div id="php-play-icon" style="display: none;">
                                    <svg style="width:28px;height:28px;fill:currentColor" viewBox="0 0 24 24">
                                        <path d="M8 5v14l11-7z" />
                                    </svg>
                                </div>
                                <div id="php-pause-icon" class="pause-bars-group">
                                    <div class="p-bar"></div>
                                    <div class="p-bar"></div>
                                </div>
                            </div>
                        </button>
                    </div>

                    <!-- Bottom Controls Row -->
                    <div class="overlay-bottom-row">
                        <!-- Custom Seek / Tracking Bar -->
                        <div class="custom-seek-track" id="php-seek-track" style="display: none;">
                            <div class="seek-fill" id="php-seek-fill" style="width: 100%;"></div>
                        </div>

                        <!-- Info and action panel -->
                        <div class="bottom-actions-container">
                            <div class="live-pulse-badge" style="display: none;">
                                <span class="pulse-red-dot"></span>
                                <span class="pulse-text">LIVE</span>
                            </div>

                            <div class="action-buttons-group">
                                <!-- Rotate button ("مع زر تدوير الشاشه") -->
                                <button class="square-control-btn" id="php-rotate-btn" title="تدوير الشاشة">
                                    <svg style="width:18px;height:18px;fill:currentColor" viewBox="0 0 24 24">
                                        <path d="M16 4h4v4h-2V6h-2V4zm-8 0h2v2H8V4zM4 8V4h4v2H6v2H4zm14 8h2v-4h-2v4zm-2 4h4v-4h-2v2h-2v2zm-8 0h2v-2H8v2zm-4-4V12H4v4h2zm2 4H6v-2H4v2h4z" />
                                    </svg>
                                </button>
                                <button class="square-control-btn" id="php-mute-btn" title="كتم الصوت">
                                    <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24" id="php-volume-svg">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
                                    </svg>
                                </button>
                                <button class="square-control-btn" onclick="alert('تم تفعيل فحص وتوليد الترجمة التلفزيونية!');" title="الترجمة المصاحبة">
                                    <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                                    </svg>
                                </button>
                                <button class="square-control-btn" onclick="alert('جاري توليد إحصائيات معدل الإطارات وتحسين جودة البث المباشر...');" title="إعدادات البث">
                                    <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                </button>
                                <button class="square-control-btn" onclick="alert('جاري الاتصال بجهاز الاستقبال Chromecast القريب...');" title="بث (Chromecast)">
                                    <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" d="M8 20H4a1 1 0 01-1-1v-4a8 8 0 018 8z" />
                                        <path stroke-linecap="round" d="M12 20h4a6 6 0 00-6-6v6z" />
                                        <path stroke-linecap="round" d="M16 20h3a1 1 0 001-1v-12a1 1 0 00-1-1H5a1 1 0 00-1 1v2" />
                                    </svg>
                                </button>
                                <button class="square-control-btn" id="php-pip-btn" title="شاشة عائمة PiP">
                                    <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2" viewBox="0 0 24 24">
                                        <rect x="3" y="5" width="18" height="14" rx="2" />
                                        <rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" />
                                    </svg>
                                </button>
                                <button class="square-control-btn" id="php-fullscreen-btn" title="ملء الشاشة">
                                    <svg style="width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2.5" viewBox="0 0 24 24">
                                        <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4h4m12 4V4h-4M4 16v4h4m12-4v4h-4" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    </div>

                </div>

            </div>

            <!-- Custom channel details card beneath the video player (Requirement 17) -->
            <div class="channel-info-card">
                <div class="channel-info-detail">
                    <?php if (!empty($channel['logo'])): ?>
                        <img class="channel-info-logo" src="<?php echo htmlspecialchars($channel['logo']); ?>" alt="<?php echo htmlspecialchars($channel['name']); ?>" onerror="this.src='https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=100';">
                    <?php else: ?>
                        <div class="channel-info-logo" style="display: flex; align-items:center; justify-content:center; background-color:black;">
                            <svg style="width:36px;height:36px;fill:#e50914" viewBox="0 0 24 24">
                                <path d="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z" />
                            </svg>
                        </div>
                    <?php endif; ?>
                    <div class="channel-info-text">
                        <span class="category-tag"><?php echo htmlspecialchars($channel['category']); ?></span>
                        <h2 style="margin-top: 8px;"><?php echo htmlspecialchars($channel['name']); ?></h2>
                        <p>معرف القناة (ID): <span style="font-family:monospace; color: #fff; background-color: #2a2a2a; padding: 2px 6px; border-radius: 4px;"><?php echo htmlspecialchars($channel['id']); ?></span></p>
                    </div>
                </div>

                <div style="text-align: left;">
                    <button onclick="window.location.reload();" class="btn-play-stream">
                        <svg style="width:16px;height:16px;fill:white" viewBox="0 0 24 24">
                            <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                        </svg>
                        <span>اختبار تشغيل يدوي</span>
                    </button>
                </div>
            </div>

            <!-- Script injection block -->
            <script src="assets/player.js"></script>

        <?php endif; ?>

    </main>



</body>
</html>
