<?php
/**
 * لوحة التحكم - ارينا لايف (إدارة واستيراد قنوات IPTV)
 * لوحة تحكم مخفية للمدير لإدخال واستيراد ملفات القنوات m3u8
 */

// إعداد كلمة السر لحماية الصفحة (اختياري - اتركه فارغاً لتعطيل الحماية)
$admin_password = ""; // يمكنك كتابة كلمة مرور هنا مثل "123456" لحمايتها

$session_auth = true;
if (!empty($admin_password)) {
    session_start();
    if (isset($_POST['logout'])) {
        unset($_SESSION['admin_auth']);
    }
    if (isset($_POST['password']) && $_POST['password'] === $admin_password) {
        $_SESSION['admin_auth'] = true;
    }
    if (!isset($_SESSION['admin_auth'])) {
        $session_auth = false;
    }
}

$m3uFile = 'mofeed.m3u8';
$success_msg = "";
$error_msg = "";
$imported_count = 0;

if ($session_auth && $_SERVER['REQUEST_METHOD'] === 'POST' && !isset($_POST['logout'])) {
    $import_method = isset($_POST['import_method']) ? $_POST['import_method'] : 'text';
    $target_category = isset($_POST['target_category']) ? trim($_POST['target_category']) : '';
    $save_mode = isset($_POST['save_mode']) ? $_POST['save_mode'] : 'append'; // append or overwrite
    
    $raw_m3u_content = "";

    // 1. Get Content based on method
    if ($import_method === 'url') {
        $m3u_url = isset($_POST['m3u_url']) ? trim($_POST['m3u_url']) : '';
        if (!empty($m3u_url)) {
            if (filter_var($m3u_url, FILTER_VALIDATE_URL)) {
                $opts = [
                    "http" => [
                        "method" => "GET",
                        "header" => "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36\r\nAccept: */*\r\n"
                    ]
                ];
                $context = stream_context_create($opts);
                $fetched_content = @file_get_contents($m3u_url, false, $context);
                if ($fetched_content !== false) {
                    $raw_m3u_content = $fetched_content;
                } else {
                    $error_msg = "فشل تحميل قائمة التشغيل من الرابط المباشر. يرجى التأكد من صحة الرابط أو جرب لصق المحتوى يدوياً.";
                }
            } else {
                $error_msg = "الرابط المدخل غير صالح. يرجى إدخال رابط يبدأ بـ http أو https";
            }
        } else {
            $error_msg = "يرجى كتابة رابط قائمة الـ m3u8 أولاً.";
        }
    } elseif ($import_method === 'file') {
        if (isset($_FILES['m3u_file']) && $_FILES['m3u_file']['error'] === UPLOAD_ERR_OK) {
            $tmp_name = $_FILES['m3u_file']['tmp_name'];
            $file_content = @file_get_contents($tmp_name);
            if ($file_content !== false) {
                $raw_m3u_content = $file_content;
            } else {
                $error_msg = "فشل قراءة الملف المرفوع.";
            }
        } else {
            $error_msg = "لم يتم اختيار ملف m3u8 صالح أو فشل الرفع.";
        }
    } else {
        // text paste
        $raw_m3u_content = isset($_POST['m3u_text']) ? $_POST['m3u_text'] : '';
        if (empty(trim($raw_m3u_content))) {
            $error_msg = "يرجى لصق محتوى الـ m3u8 في الصندوق المخصص.";
        }
    }

    // 2. Parse and Modify raw content if we have success so far
    if (empty($error_msg) && !empty($raw_m3u_content)) {
        // Normalize line breaks
        $raw_m3u_content = str_replace(["\r\n", "\r"], "\n", $raw_m3u_content);
        $lines = explode("\n", $raw_m3u_content);
        $cleaned_lines = [];
        $current_extinf = "";

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            if (strpos($line, '#EXTM3U') === 0) {
                // Header gets ignored during line accumulation, handled at saving
                continue;
            }

            if (strpos($line, '#EXTINF:') === 0) {
                // If target category is specified by the user, replace or add group-title
                if (!empty($target_category)) {
                    if (preg_match('/group-title="[^"]*"/i', $line)) {
                        $line = preg_replace('/group-title="[^"]*"/i', 'group-title="' . htmlspecialchars($target_category, ENT_QUOTES, 'UTF-8') . '"', $line);
                    } else {
                        // Insert category before the last comma
                        $commaPos = strrpos($line, ',');
                        if ($commaPos !== false) {
                            $line = substr($line, 0, $commaPos) . ' group-title="' . htmlspecialchars($target_category, ENT_QUOTES, 'UTF-8') . '"' . substr($line, $commaPos);
                        } else {
                            $line = $line . ' group-title="' . htmlspecialchars($target_category, ENT_QUOTES, 'UTF-8') . '"';
                        }
                    }
                }
                $current_extinf = $line;
            } elseif (strpos($line, '#') === 0) {
                // Other parameters like #EXTGRP
                $cleaned_lines[] = $line;
            } else {
                // Stream URL
                if (!empty($current_extinf)) {
                    $cleaned_lines[] = $current_extinf;
                    $imported_count++;
                    $current_extinf = ""; // reset
                }
                $cleaned_lines[] = $line;
            }
        }

        if ($imported_count > 0) {
            $final_new_content = implode("\n", $cleaned_lines) . "\n";
            
            if ($save_mode === 'overwrite') {
                $status = @file_put_contents($m3uFile, "#EXTM3U\n" . $final_new_content);
                if ($status !== false) {
                    $success_msg = "تم مسح القائمة القديمة بنجاح، واستيراد عدد <strong>$imported_count</strong> قنوات جديدة بالكامل.";
                } else {
                    $error_msg = "فشل الكتابة إلى ملف القنوات mofeed.m3u8. تأكد من صلاحية المجلد.";
                }
            } else {
                // Append mode
                $existing_content = "";
                if (file_exists($m3uFile)) {
                    $existing_content = @file_get_contents($m3uFile);
                }
                
                if (empty(trim($existing_content)) || strpos(trim($existing_content), '#EXTM3U') !== 0) {
                    $existing_content = "#EXTM3U\n";
                } else {
                    $existing_content = rtrim($existing_content) . "\n";
                }

                $status = @file_put_contents($m3uFile, $existing_content . $final_new_content);
                if ($status !== false) {
                    $success_msg = "تم بنجاح إضافة عدد <strong>$imported_count</strong> قنوات مضافة إلى القائمة الحالية.";
                } else {
                    $error_msg = "فشل الكتابة إلى ملف القنوات mofeed.m3u8. تأكد من صلاحيات الخادم.";
                }
            }
        } else {
            $error_msg = "المحتوى المدخل لا يبدو كملف IPTV m3u8 صالح أو أنه فارغ.";
        }
    }
}
?>
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>لوحة المدير واستيراد القنوات | ارينا لايف</title>
    <link rel="stylesheet" href="assets/style.css">
    <style>
        .admin-box {
            background-color: var(--card-bg);
            border: 1px solid #2a2a2a;
            border-radius: 20px;
            padding: 30px;
            max-width: 750px;
            margin: 40px auto;
            box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        .admin-header {
            border-bottom: 1px solid #2a2a2a;
            padding-bottom: 20px;
            margin-bottom: 25px;
            text-align: center;
        }
        .admin-header h2 {
            font-size: 24px;
            font-weight: 800;
            color: #ffffff;
        }
        .admin-header p {
            color: var(--text-muted);
            font-size: 13px;
            margin-top: 5px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        .form-label {
            display: block;
            color: #ffffff;
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .form-input, .form-textarea, .form-select {
            width: 100%;
            background-color: #111;
            border: 1px solid #333;
            border-radius: 10px;
            padding: 12px 15px;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: all 0.3s ease;
        }
        .form-textarea {
            height: 160px;
            resize: vertical;
            font-family: monospace;
            font-size: 12px;
        }
        .form-input:focus, .form-textarea:focus, .form-select:focus {
            border-color: var(--netflix-red);
            box-shadow: 0 0 10px rgba(229, 9, 20, 0.2);
        }
        .method-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 15px;
        }
        .method-tab {
            flex: 1;
            background-color: #222;
            border: 1px solid #333;
            color: var(--text-muted);
            padding: 10px;
            text-align: center;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            font-size: 13px;
            transition: all 0.2s ease;
        }
        .method-tab.active {
            background-color: var(--netflix-red);
            color: #fff;
            border-color: var(--netflix-red);
        }
        .tab-content {
            display: none;
        }
        .tab-content.active {
            display: block;
        }
        .btn-submit {
            display: block;
            width: 100%;
            background-color: var(--netflix-red);
            color: #fff;
            border: none;
            border-radius: 12px;
            padding: 15px;
            font-size: 16px;
            font-weight: 800;
            cursor: pointer;
            transition: all 0.2s ease;
            box-shadow: 0 5px 15px rgba(229,9,20,0.3);
            text-align: center;
        }
        .btn-submit:hover {
            background-color: #b80710;
            transform: translateY(-2px);
        }
        .alert {
            padding: 15px 20px;
            border-radius: 10px;
            margin-bottom: 25px;
            font-size: 13px;
            line-height: 1.6;
        }
        .alert-success {
            background-color: rgba(46, 204, 113, 0.15);
            border: 1px solid #2ecc71;
            color: #2ecc71;
        }
        .alert-error {
            background-color: rgba(231, 76, 60, 0.15);
            border: 1px solid #e74c3c;
            color: #e74c3c;
        }
        .btn-home {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            color: var(--text-muted);
            text-decoration: none;
            font-size: 13px;
            margin-bottom: 20px;
            transition: color 0.2s;
        }
        .btn-home:hover {
            color: #fff;
        }
        .radio-group {
            display: flex;
            gap: 20px;
            margin-top: 5px;
        }
        .radio-option {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 13px;
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
                    <p>المشغل الذكي للقنوات والمحطات المباشرة</p>
                </div>
            </div>
        </div>
    </header>

    <main class="container">
        
        <a href="index.php" class="btn-home">
            <svg style="width:16px;height:16px;fill:currentColor" viewBox="0 0 24 24">
                <path d="M21,11H6.83L10.41,7.41L9,6L3,12L9,18L10.41,16.58L6.83,13H21V11Z" />
            </svg>
            <span>العودة للرئيسية</span>
        </a>

        <?php if (!$session_auth): ?>
            <!-- Password Protection Screen -->
            <div class="admin-box" style="max-width: 450px;">
                <div class="admin-header">
                    <h2>لوحة التحكم المحمية</h2>
                    <p>الرجاء إدخال كلمة سر المدير للمتابعة</p>
                </div>
                <form method="POST">
                    <div class="form-group">
                        <input type="password" name="password" class="form-input" style="text-align: center; letter-spacing: 2px;" placeholder="••••••••" required autofocus>
                    </div>
                    <button type="submit" class="btn-submit">دخول</button>
                </form>
            </div>
        <?php else: ?>

            <div class="admin-box">
                <div class="admin-header">
                    <h2>استيراد قنوات IPTV (.m3u8 / .ts)</h2>
                    <p>قم بتحديث وتخصيص البث الحي مباشرة في المجلد الرئيسي بنظام ذكي وعالي التلقائية</p>
                </div>

                <?php if (!empty($success_msg)): ?>
                    <div class="alert alert-success">
                        <?php echo $success_msg; ?>
                    </div>
                <?php endif; ?>

                <?php if (!empty($error_msg)): ?>
                    <div class="alert alert-error">
                        <?php echo $error_msg; ?>
                    </div>
                <?php endif; ?>

                <form method="POST" enctype="multipart/form-data">
                    <input type="hidden" name="import_method" id="import_method" value="text">

                    <div class="form-group">
                        <label class="form-label">طريقة استيراد قائمة القنوات:</label>
                        <div class="method-tabs">
                            <div class="method-tab active" data-type="text">لصق نصي مباشر</div>
                            <div class="method-tab" data-type="url">رابط خارجي (URL)</div>
                            <div class="method-tab" data-type="file">رفع ملف .m3u8</div>
                        </div>
                    </div>

                    <!-- Panel 1: Paste Text -->
                    <div class="form-group tab-content active" id="panel-text">
                        <label class="form-label" for="m3u_text">ألصق كود قائمة التشغيل (M3U):</label>
                        <textarea class="form-textarea" name="m3u_text" id="m3u_text" placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id='ar-news' tvg-logo='...' group-title='News',قناة الأخبار المباشرة&#10;http://example.com/stream.m3u8"></textarea>
                    </div>

                    <!-- Panel 2: Link URL -->
                    <div class="form-group tab-content" id="panel-url">
                        <label class="form-label" for="m3u_url">رابط خارجي لملف M3U8:</label>
                        <input type="url" class="form-input" name="m3u_url" id="m3u_url" placeholder="https://domain.com/channels.m3u8">
                    </div>

                    <!-- Panel 3: Upload File -->
                    <div class="form-group tab-content" id="panel-file">
                        <label class="form-label" for="m3u_file">اختر ملف m3u8 من جهازك:</label>
                        <input type="file" class="form-input" name="m3u_file" id="m3u_file" accept=".m3u8,.m3u,.txt">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="target_category">القسم المستهدف للاستيراد إليه (اختياري/تخصيص):</label>
                        <input type="text" class="form-input" name="target_category" id="target_category" placeholder="مثال: قنوات رياضية، باقة الجزيرة، أفلام...">
                        <p style="font-size: 11px; color: var(--text-muted); margin-top: 5px;">اترك هذا الحقل فارغاً إذا كنت ترغب في الاحتفاظ بالتصنيفات والأقسام التلقائية المدمجة بداخل ملف الـ IPTV الأصلي.</p>
                    </div>

                    <div class="form-group" style="background-color: rgba(255,255,255,0.02); padding: 15px; border-radius: 10px; border: 1px solid #222;">
                        <label class="form-label">خيار حفظ واستيراد القنوات:</label>
                        <div class="radio-group">
                            <label class="radio-option">
                                <input type="radio" name="save_mode" value="append" checked>
                                <span>إضافة إلى قنواتك الحالية مسبقاً (دون مسح)</span>
                            </label>
                            <label class="radio-option">
                                <input type="radio" name="save_mode" value="overwrite">
                                <span style="color: var(--netflix-red); font-weight: bold;">مسح القائمة الحالية بالكامل والاستبدال</span>
                            </label>
                        </div>
                    </div>

                    <button type="submit" class="btn-submit" style="margin-top: 25px;">ابدأ استيراد القنوات الآن</button>
                </form>

                <?php if (!empty($admin_password)): ?>
                    <form method="POST" style="margin-top: 15px; text-align: center;">
                        <input type="hidden" name="logout" value="1">
                        <button type="submit" style="background: none; border: none; color: #e74c3c; cursor: pointer; font-size: 12px; font-weight: bold;">تسجيل خروج من لوحة المدير</button>
                    </form>
                <?php endif; ?>
            </div>

        <?php endif; ?>

    </main>

    <script>
        // Tab switching mechanics
        const tabs = document.querySelectorAll('.method-tab');
        const contents = document.querySelectorAll('.tab-content');
        const methodInput = document.getElementById('import_method');

        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                contents.forEach(c => c.classList.remove('active'));

                tab.classList.add('active');
                const type = tab.getAttribute('data-type');
                methodInput.value = type;

                const targetPanel = document.getElementById('panel-' + type);
                if (targetPanel) {
                    targetPanel.classList.add('active');
                }
            });
        });
    </script>
</body>
</html>
