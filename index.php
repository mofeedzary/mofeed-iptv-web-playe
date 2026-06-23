<?php
/**
 * ارينا لايف - مشغل قنوات المباشر IPTV
 * Netflix Style Web Player
 */

$channels = [];
$m3uFile = 'mofeed.m3u8';

if (file_exists($m3uFile)) {
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

            // Extract tvg-name
            if (preg_match('/tvg-name="([^"]+)"/i', $line, $matches)) {
                $current['tvg_name'] = $matches[1];
            }

            // Extract tvg-logo
            if (preg_match('/tvg-logo="([^"]+)"/i', $line, $matches)) {
                $current['logo'] = $matches[1];
            } else {
                $current['logo'] = '';
            }

            // Extract group-title (Category)
            if (preg_match('/group-title="([^"]+)"/i', $line, $matches)) {
                $current['category'] = $matches[1];
            } else {
                $current['category'] = 'قنوات عامة';
            }

            // Extract display title (from last comma)
            $commaPos = strrpos($line, ',');
            if ($commaPos !== false) {
                $current['name'] = trim(substr($line, $commaPos + 1));
            } else {
                $current['name'] = isset($current['tvg_name']) ? $current['tvg_name'] : 'قناة غير معروفة';
            }

        } elseif ($current !== null && (strpos($line, 'http') === 0 || filter_var($line, FILTER_VALIDATE_URL))) {
            $current['url'] = $line;
            $channels[] = $current;
            $current = null;
        }
    }
}

// Group channels by category
$groupedChannels = [];
foreach ($channels as $chan) {
    $cat = $chan['category'];
    $groupedChannels[$cat][] = $chan;
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ارينا لايف IPTV - مشغل قنوات Netflix Style</title>
    <link rel="stylesheet" href="assets/style.css">
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
                    <p>المشغل الذكي للقنوات والمحطات المباشرة</p>
                </div>
            </div>

            <!-- search block -->
            <div class="search-container">
                <input type="text" id="iptv-search-box" class="search-input" placeholder="ابحث عن اسم القناة أو التصنيف المفضل...">
            </div>
        </div>
    </header>

    <!-- Main Grid and Rows -->
    <main class="container">

        <!-- Welcome Banner Segment -->
        <div style="background: linear-gradient(135deg, #0f0f0f, #220305); border: 1px solid #441113; padding: 30px; border-radius: 24px; margin-bottom: 40px; position: relative; overflow: hidden;">
            <div style="max-width: 600px; position: relative; z-index: 2;">
                <span style="background-color: var(--netflix-red); color: white; padding: 3px 10px; border-radius: 6px; font-size: 10px; font-weight: bold; margin-bottom: 12px; display: inline-block;">أقوى تجربة IPTV</span>
                <h2 style="font-size: 28px; font-weight: 800; margin-bottom: 10px;">بث تلفزيوني فائق الجودة والسرعة</h2>
                <p style="font-size: 13px; color: var(--text-muted); line-height: 1.6;">مرحبًا بك في لوحة ارينا لايف الرقمية. تدعم هذه الواجهة تشغيل كافة أنواع ملفات .m3u8 و .ts تلقائياً دون إعلانات مزعجة أو ملفات معقدة.</p>
            </div>
            <div style="position: absolute; left: 5%; bottom: -30px; opacity: 0.15; pointer-events: none;">
                <svg style="width: 250px; height: 250px; fill: red;" viewBox="0 0 24 24">
                    <path d="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z" />
                </svg>
            </div>
        </div>

        <?php if (empty($channels)): ?>
            <div style="background-color: #222; border: 1px dashed #444; border-radius: 20px; padding: 60px; text-align: center; color: var(--text-muted);">
                <svg style="width:64px;height:64px;fill:#e50914;margin-bottom:20px;" viewBox="0 0 24 24">
                    <path d="M12,2L1,21H23M12,6L19.8,19H4.2M11,10V14H13V10M11,16V18H13V16" />
                </svg>
                <h3 style="color:white;font-weight:bold;font-size:18px;">لم نجد ملف القنوات mofeed.m3u8</h3>
                <p style="margin-top:10px;font-size:13px;">يرجى رفع ملف قنوات IPTV باسم <code style="background-color:black;padding:3px 8px;border-radius:4px;color:#ff3b45">mofeed.m3u8</code> في نفس المسار الرئيسي للخادم.</p>
            </div>
        <?php else: ?>
            
            <!-- Loop categories dynamic -->
            <div id="categories-container-list">
                <?php foreach ($groupedChannels as $category => $chanList): ?>
                    <div class="category-row" data-category-name="<?php echo htmlspecialchars($category); ?>">
                        <div class="category-title-bar" style="display: none;">
                            <div class="category-indicator"></div>
                            <h2 class="category-title"><?php echo htmlspecialchars($category); ?></h2>
                        </div>

                        <div class="channels-grid">
                            <?php foreach ($chanList as $chan): ?>
                                <div class="channel-card" data-channel-name="<?php echo htmlspecialchars(strtolower($chan['name'])); ?>">
                                    <div class="card-thumbnail">
                                        <?php if (!empty($chan['logo'])): ?>
                                            <img src="<?php echo htmlspecialchars($chan['logo']); ?>" alt="<?php echo htmlspecialchars($chan['name']); ?>" loading="lazy" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                                        <?php endif; ?>
                                        <div class="fallback-thumbnail" style="display: <?php echo empty($chan['logo']) ? 'flex' : 'none'; ?>;">
                                            <svg viewBox="0 0 24 24" fill="currentColor">
                                                <path d="M21,17H3V5H21M21,3H3A2,2 0 0,0 1,5V17A2,2 0 0,0 3,19H8V21H16V19H21A2,2 0 0,0 23,17V5A2,2 0 0,0 21,3Z" />
                                            </svg>
                                        </div>
                                        <span class="card-badge">
                                            <?php echo (strpos(strtolower($chan['url']), '.m3u8') !== false) ? 'HLS' : 'MPEG-TS'; ?>
                                        </span>
                                    </div>
                                    <div class="card-content">
                                        <h3 class="card-title"><?php echo htmlspecialchars($chan['name']); ?></h3>
                                        <p class="card-id">ID: <?php echo htmlspecialchars($chan['id']); ?></p>
                                    </div>
                                    <div class="card-footer">
                                        <a href="player.php?id=<?php echo urlencode($chan['id']); ?>" class="btn-play-card">
                                            <svg style="width:14px;height:14px;fill:currentColor" viewBox="0 0 24 24">
                                                <path d="M8,5.14V19.14L19,12.14L8,5.14Z" />
                                            </svg>
                                            <span>تفاصيل القناة وتشغيل</span>
                                        </a>
                                    </div>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>

        <?php endif; ?>

    </main>



    <!-- Search filtration script -->
    <script>
        document.getElementById('iptv-search-box').addEventListener('input', function (e) {
            const query = e.target.value.toLowerCase().trim();
            const cards = document.querySelectorAll('.channel-card');
            const categories = document.querySelectorAll('.category-row');

            cards.forEach(function (card) {
                const name = card.getAttribute('data-channel-name') || '';
                if (name.includes(query) || query === '') {
                    card.style.display = 'flex';
                } else {
                    card.style.display = 'none';
                }
            });

            // Hide categories if they contain no visible channel
            categories.forEach(function (cat) {
                const visibleCards = cat.querySelectorAll('.channel-card[style="display: flex;"]');
                const hasVisible = visibleCards.length > 0;
                
                // If query is empty, show everything
                if (query === '') {
                    cat.style.display = 'block';
                    // Force display block for all inside
                    cat.querySelectorAll('.channel-card').forEach(function(c) {
                        c.style.display = 'flex';
                    });
                } else if (hasVisible) {
                    cat.style.display = 'block';
                } else {
                    cat.style.display = 'none';
                }
            });
        });
    </script>
</body>
</html>
