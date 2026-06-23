<?php
/**
 * بريدج بث قنوات IPTV - ارينا لايف (PHP Stream Proxy)
 * لتجاوز قيود CORS ومشاكل حظر المتصفحات للمحتوى غير المشفر (Mixed Content HTTP/HTTPS)
 */

// تعطيل الحد الأقصى لوقت التشغيل للبث اللانهائي
set_time_limit(0);

$targetUrl = isset($_GET['url']) ? trim($_GET['url']) : '';

if (empty($targetUrl)) {
    header("HTTP/1.1 400 Bad Request");
    echo "خطأ: رابط البث مفقود.";
    exit;
}

// التحقق من صحة الرابط
if (!filter_var($targetUrl, FILTER_VALIDATE_URL) || strpos($targetUrl, 'http') !== 0) {
    header("HTTP/1.1 400 Bad Request");
    echo "خطأ: رابط البث المدخل غير صالح.";
    exit;
}

// حظر المحاولات المحلية لمنع ثغرات SSRF
$host = parse_url($targetUrl, PHP_URL_HOST);
if (in_array(strtolower($host), ['127.0.0.1', 'localhost', '::1'])) {
    header("HTTP/1.1 403 Forbidden");
    echo "خطأ: غير مسموح بالوصول إلى العناوين المحلية.";
    exit;
}

// إرسال ترويسات CORS للسماح للمشغل بالاتصال بدون قيود
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, OPTIONS, HEAD");
header("Access-Control-Allow-Headers: *");
header("Access-Control-Expose-Headers: *");

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// إعداد خيارات الاتصال وسياق جلب البيانات
$userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// استخدام cURL إذا كان متاحاً في السيرفر حيث يمتلك كفاءة أعلى في دفق المقاطع
if (function_exists('curl_init')) {
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $targetUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, false); // دفق الإخراج فوراً
    curl_setopt($ch, CURLOPT_WRITEFUNCTION, function($ch, $data) {
        echo $data;
        flush();
        return strlen($data);
    });
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
    curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    
    // رأس الترويسات التي نحتاجها من خادم البث الأصلي
    curl_setopt($ch, CURLOPT_HEADERFUNCTION, function($ch, $headerLine) {
        $headerLower = strtolower($headerLine);
        if (stripos($headerLine, 'content-type:') === 0 || 
            stripos($headerLine, 'content-length:') === 0 || 
            stripos($headerLine, 'accept-ranges:') === 0 ||
            stripos($headerLine, 'content-range:') === 0) {
            header($headerLine);
        }
        return strlen($headerLine);
    });

    curl_exec($ch);
    curl_close($ch);
} else {
    // البديل البدائي في حال تعطل cURL عبر السيرفر المستضيف
    $opts = [
        "http" => [
            "method" => "GET",
            "header" => "User-Agent: " . $userAgent . "\r\nAccept: */*\r\n",
            "follow_location" => 1,
            "timeout" => 30
        ],
        "ssl" => [
            "verify_peer" => false,
            "verify_peer_name" => false
        ]
    ];
    
    $context = stream_context_create($opts);
    $stream = @fopen($targetUrl, 'rb', false, $context);
    
    if ($stream !== false) {
        $metadata = stream_get_meta_data($stream);
        if (isset($metadata['wrapper_data']) && is_array($metadata['wrapper_data'])) {
            foreach ($metadata['wrapper_data'] as $header) {
                if (stripos($header, 'Content-Type:') === 0 || 
                    stripos($header, 'Content-Length:') === 0 || 
                    stripos($header, 'Accept-Ranges:') === 0 ||
                    stripos($header, 'Content-Range:') === 0) {
                    header($header);
                }
            }
        }
        fpassthru($stream);
        fclose($stream);
    } else {
        header("HTTP/1.1 502 Bad Gateway");
        echo "خطأ: فشل الخادم المستضيف في جلب دفق البث الحي.";
    }
}
