import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Tv,
  Search,
  Play,
  Info,
  Maximize2,
  Volume2,
  VolumeX,
  RotateCw,
  X,
  ArrowRight,
  Download,
  ExternalLink,
  AlertTriangle,
  Grid,
  Layers,
  Sparkles,
  CheckCircle,
  Clock,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  logo: string;
  category: string;
  url: string;
}

export default function App() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('الكل');

  // Channel details modal / view
  const [detailsChannel, setDetailsChannel] = useState<Channel | null>(null);

  // Active channel playing state
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [streamError, setStreamError] = useState<boolean>(false);
  const [videoLoading, setVideoLoading] = useState<boolean>(false);

  // Custom Player States matching UI Reference
  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [selectedQuality, setSelectedQuality] = useState<string>('SD');
  const [isRotated, setIsRotated] = useState<boolean>(false);
  const [volume, setVolume] = useState<number>(1);
  const [showControls, setShowControls] = useState<boolean>(true);

  // HTML5 Video element reference
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsInstanceRef = useRef<any>(null);
  const mpegtsPlayerRef = useRef<any>(null);
  const controlsTimeoutRef = useRef<any>(null);

  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    controlsTimeoutRef.current = setTimeout(() => {
      setShowControls(false);
    }, 2000);
  };

  // Active tab in our workspace information panel (for PHP guidelines & downloads)
  const [infoTab, setInfoTab] = useState<'preview' | 'php-guide' | 'download-center'>('preview');

  // Admin Portal states for manager
  const [showAdminPortal, setShowAdminPortal] = useState<boolean>(false);
  const [adminImportMethod, setAdminImportMethod] = useState<'text' | 'url'>('text');
  const [adminM3uText, setAdminM3uText] = useState<string>('');
  const [adminM3uUrl, setAdminM3uUrl] = useState<string>('');
  const [adminTargetCategory, setAdminTargetCategory] = useState<string>('');
  const [adminSaveMode, setAdminSaveMode] = useState<'append' | 'overwrite'>('append');
  const [adminStatus, setAdminStatus] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [adminLoading, setAdminLoading] = useState<boolean>(false);

  useEffect(() => {
    const handleHashAndParams = () => {
      if (
        window.location.hash === '#admin' || 
        window.location.search.includes('admin=true') || 
        window.location.pathname.includes('/admin')
      ) {
        setShowAdminPortal(true);
      }
    };
    handleHashAndParams();
    window.addEventListener('hashchange', handleHashAndParams);
    return () => window.removeEventListener('hashchange', handleHashAndParams);
  }, []);

  const handleAdminImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminLoading(true);
    setAdminStatus(null);

    try {
      const response = await fetch('/api/iptv/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          import_method: adminImportMethod,
          target_category: adminTargetCategory,
          save_mode: adminSaveMode,
          m3u_text: adminM3uText,
          m3u_url: adminM3uUrl
        })
      });

      const resData = await response.json();
      if (!response.ok) {
        throw new Error(resData.error || 'فشل استيراد قائمة القنوات المخصصة.');
      }

      setAdminStatus({
        type: 'success',
        msg: `تم بنجاح استيراد وتحديث عدد ${resData.count} من القنوات وقنوات البث المباشر!`
      });
      setAdminM3uText('');
      setAdminM3uUrl('');
      
      // Reload channels collection to feed the frontend interface live
      loadChannels();
    } catch (err: any) {
      setAdminStatus({
        type: 'error',
        msg: err.message || 'حدث خطأ غير متوقع أثناء المعالجة والاستيراد.'
      });
    } finally {
      setAdminLoading(false);
    }
  };

  // --- Fetch and Parse Channels ---
  const loadChannels = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch('/api/iptv/channels');
      if (!response.ok) {
        throw new Error('فشل جلب القنوات من ملف mofeed.m3u8');
      }
      const data = await response.json();
      setChannels(data.channels || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('تعذر تحميل القنوات تلقائياً. تأكد من توفر الملف mofeed.m3u8 في المسار الرئيسي.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  // --- Stream Player Initializer ---
  useEffect(() => {
    if (!activeChannel) {
      destroyPlayer();
      return;
    }

    setStreamError(false);
    setVideoLoading(true);
    setShowControls(true);
    resetControlsTimeout();

    // Give state a brief moment to render the video tag
    const timer = setTimeout(() => {
      initializeStream(activeChannel.url);
    }, 100);

    return () => {
      clearTimeout(timer);
      destroyPlayer();
      if (controlsTimeoutRef.current) {
        clearTimeout(controlsTimeoutRef.current);
      }
    };
  }, [activeChannel]);

  const destroyPlayer = () => {
    try {
      if (hlsInstanceRef.current) {
        hlsInstanceRef.current.destroy();
        hlsInstanceRef.current = null;
      }
      if (mpegtsPlayerRef.current) {
        mpegtsPlayerRef.current.unload();
        mpegtsPlayerRef.current.detachMediaElement();
        mpegtsPlayerRef.current.destroy();
        mpegtsPlayerRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.src = '';
        videoRef.current.load();
      }
    } catch (e) {
      console.warn('Error raw destroying video assets:', e);
    }
  };

  const initializeStream = (url: string) => {
    const video = videoRef.current;
    if (!video) return;

    const isM3u8 = url.toLowerCase().includes('.m3u8') || url.includes('/manifest') || url.includes('m3u8');
    const isTs = url.toLowerCase().includes('.ts') || url.includes('/live/');

    // Route all external content via local proxy to completely bypass CORS blockages and Mixed Content restrictions
    let finalUrl = url;
    if (url.startsWith('http') && !url.startsWith(window.location.origin)) {
      finalUrl = `/api/stream-proxy?url=${encodeURIComponent(url)}`;
      console.log('Stream routed via Node.js secure proxy (CORS & Mixed content bypass):', finalUrl);
    }

    const handlePlayPromise = (promise: any) => {
      if (promise && typeof promise.then === 'function') {
        promise
          .then(() => {
            setVideoLoading(false);
          })
          .catch((e: any) => {
            console.warn('Play promise rejected:', e);
            if (e.name === 'NotAllowedError' || e.message?.toLowerCase().includes('play') || e.message?.toLowerCase().includes('gesture')) {
              // Browser autoplay block - handle gracefully
              setVideoLoading(false);
              // Try to play muted as a backup
              video.muted = true;
              video.play().catch(() => {
                setVideoLoading(false);
              });
            } else {
              setStreamError(true);
              setVideoLoading(false);
            }
          });
      } else {
        setVideoLoading(false);
      }
    };

    // Fallback: Check if TS stream or stream lacks direct extension
    try {
      if (isTs) {
        const mpegts = (window as any).mpegts;
        if (mpegts && mpegts.getFeatureList().mseLivePlayback) {
          const player = mpegts.createPlayer({
            type: 'mpegts', // or mse
            isLive: true,
            url: finalUrl
          });
          player.attachMediaElement(video);
          player.load();
          mpegtsPlayerRef.current = player;

          player.on((window as any).mpegts.Events.ERROR, (errType: any, errDetail: any) => {
            console.error('MPEGTS error:', errType, errDetail);
            setStreamError(true);
            setVideoLoading(false);
          });

          handlePlayPromise(player.play());
        } else {
          // Fallback to source
          video.src = finalUrl;
          video.load();
          handlePlayPromise(video.play());
        }
      } else if (isM3u8) {
        const Hls = (window as any).Hls;
        if (Hls && Hls.isSupported()) {
          // Inner Custom Loader class to secure sub-playlists and ts chunks proxying
          class ProxyHlsLoader extends Hls.DefaultConfig.loader {
            constructor(config: any) {
              super(config);
              const superLoad = this.load.bind(this);
              this.load = function (context: any, config: any, callbacks: any) {
                if (context.url) {
                  let targetUrl = context.url;
                  
                  // If the HLS resolver appended relative chunks to our proxy URL, un-wrap them
                  if (targetUrl.includes('/api/stream-proxy')) {
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
                  
                  if (targetUrl.startsWith('http://') || (targetUrl.startsWith('http') && !targetUrl.startsWith(window.location.origin))) {
                    context.url = `/api/stream-proxy?url=${encodeURIComponent(targetUrl)}`;
                  } else {
                    context.url = targetUrl;
                  }
                }
                superLoad(context, config, callbacks);
              };
            }
          }

          const hlsObj = new Hls({
            maxMaxBufferLength: 45,
            enableWorker: true,
            lowLatencyMode: false,
            loader: ProxyHlsLoader
          });
          hlsObj.loadSource(finalUrl);
          hlsObj.attachMedia(video);
          hlsInstanceRef.current = hlsObj;

          hlsObj.on(Hls.Events.MANIFEST_PARSED, () => {
            handlePlayPromise(video.play());
          });

          hlsObj.on(Hls.Events.ERROR, (event: any, data: any) => {
            if (data.fatal) {
              console.warn('HLS Fatal Error:', data);
              hlsObj.recoverMediaError();
              // If it fails again, set screen error
              setTimeout(() => {
                if (video.paused && !video.ended) {
                  setStreamError(true);
                  setVideoLoading(false);
                }
              }, 4000);
            }
          });
        } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = finalUrl;
          video.addEventListener('loadedmetadata', () => {
            handlePlayPromise(video.play());
          });
        } else {
          setStreamError(true);
          setVideoLoading(false);
        }
      } else {
        // Standard video source (.mp4 and general web streams)
        video.src = finalUrl;
        video.load();
        handlePlayPromise(video.play());
      }
    } catch (err) {
      console.error('Stream initialization broke:', err);
      setStreamError(true);
      setVideoLoading(false);
    }
  };

  // --- Filter and Search logic ---
  const filteredChannels = useMemo(() => {
    return channels.filter(channel => {
      const matchSearch = channel.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          channel.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          channel.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchCategory = selectedCategory === 'الكل' || channel.category === selectedCategory;
      return matchSearch && matchCategory;
    });
  }, [channels, searchQuery, selectedCategory]);

  // Extract all categories dynamically from channels
  const categories = useMemo(() => {
    const list = new Set<string>();
    channels.forEach(c => {
      if (c.category) list.add(c.category);
    });
    return ['الكل', ...Array.from(list)];
  }, [channels]);

  // Group channels by category for a real Netflix-style experience
  const groupedChannels = useMemo(() => {
    const groups: { [key: string]: Channel[] } = {};
    filteredChannels.forEach(c => {
      if (!groups[c.category]) {
        groups[c.category] = [];
      }
      groups[c.category].push(c);
    });
    return groups;
  }, [filteredChannels]);

  // Select random channel to highlight as Hero banner
  const heroChannel = useMemo(() => {
    if (channels.length > 0) {
      // Pick first channel or channel with sports/news
      return channels[0];
    }
    return null;
  }, [channels]);

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col font-sans selection:bg-red-600/40 selection:text-red-200" dir="rtl">
      
      {/* Top Banner Navigation */}
      <header className="sticky top-0 z-40 bg-[#141414]/95 backdrop-blur-md border-b border-zinc-800 transition-all">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-4 flex flex-col sm:flex-row justify-between items-center gap-4">
          
          {/* Logo / Title */}
          <div className="flex items-center gap-3">
            <div className="relative p-2.5 bg-red-600 rounded-xl text-white shadow-[0_0_15px_rgba(220,38,38,0.5)]">
              <Tv className="w-6 h-6 animate-pulse" />
              <div className="absolute -top-1 -left-1 w-3 h-3 bg-white rounded-full animate-ping" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold tracking-wider text-red-600 flex items-center gap-1.5 font-display">
                ارينا لايف
              </h1>
              <p className="text-[11px] text-zinc-400 hidden">مشغل البث التلفزيوني الرقمي المتكامل (M3U8 / MPEG-TS)</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Body */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-8 flex flex-col gap-8">
        
        {/* TAB 1: Preview Live IPTV interface */}
        {infoTab === 'preview' && (
          <div className="flex flex-col gap-8">
            
            {/* Direct Channel Video Player Screen if active */}
            {activeChannel && (
              <section className="bg-black rounded-3xl border border-zinc-800 overflow-hidden shadow-2xl relative group" id="iptv-live-theater">
                {/* Cinema Screen Frame */}
                <div 
                  className="relative aspect-video min-h-[285px] sm:min-h-0 max-h-[580px] w-full bg-black flex flex-col justify-between overflow-hidden cursor-pointer"
                  onClick={() => {
                    if (!showControls) {
                      setShowControls(true);
                      resetControlsTimeout();
                    }
                  }}
                  onMouseMove={resetControlsTimeout}
                  onTouchStart={resetControlsTimeout}
                >
                  
                  {/* Streaming canvas and player */}
                  <div className="absolute inset-0 z-0 flex items-center justify-center">
                    {streamError ? (
                      (() => {
                        const isMixedContent = activeChannel.url.toLowerCase().startsWith('http://') && window.location.protocol === 'https:';
                        return (
                          <div className="p-6 text-center max-w-lg bg-zinc-900/95 rounded-2xl border border-red-900/40 shadow-2xl animate-fade-in flex flex-col items-center gap-4 z-20 mx-4">
                            <div className="p-3 bg-red-950 rounded-full text-red-500 border border-red-800/40">
                              <AlertTriangle className="w-8 h-8" />
                            </div>
                            <div>
                              <h3 className="text-base font-bold text-slate-100">
                                {isMixedContent ? 'تنبيه الأمان: تقييد البث المباشر (HTTP ⚠️)' : 'القناة غير متاحة حالياً'}
                              </h3>
                              
                              {isMixedContent ? (
                                <div className="text-xs text-zinc-300 mt-2 leading-relaxed text-right">
                                  <p>
                                    يستخدم خادم IPTV الخاص بك بروتوكول <strong className="text-red-400">http://</strong> غير المشفر، بينما تعمل هذه اللوحة الحالية عبر اتصال آمن <strong className="text-emerald-400">https://</strong>. يقوم المتصفح افتراضياً بحجب هذا البث لحمايتك (Mixed Content).
                                  </p>
                                  <div className="bg-zinc-950 p-3 rounded-xl border border-zinc-800 mt-3 text-zinc-400 text-[11px] leading-relaxed">
                                    <span className="text-red-500 font-bold block mb-1">💡 كيف تجعل القناة تعمل فوراً في المتصفح؟</span>
                                    1️⃣ انقر فوق <strong>أيقونة المحاذاة أو القفل 🔒</strong> بجوار شريط عنوان موقعنا بالمتصفح أعلاه.<br />
                                    2️⃣ اضغط على <strong>"إعدادات الموقع" (Site Settings)</strong>.<br />
                                    3️⃣ ابحث عن خيار <strong>"المحتوى غير الآمن" (Insecure Content)</strong> وغيّر حالته إلى <strong>"السماح" (Allow)</strong>.<br />
                                    4️⃣ أعد تحديث الصفحة وسوف تنطلق القناة مباشرة وحالاً!
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-400 mt-2 leading-relaxed">
                                  تعذر تشغيل مجرى البث المباشر المذكور في ملف <code className="text-red-400 bg-black/60 px-1 rounded">mofeed.m3u8</code>. قد يكون الرابط منتهياً أو لست مسجلاً الدخول أو يحتاج مشغل خارجي.
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2 w-full mt-2">
                              <button
                                onClick={() => initializeStream(activeChannel.url)}
                                className="flex-1 py-1.5 bg-red-650 hover:bg-red-700 text-white text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 cursor-pointer"
                              >
                                <RotateCw className="w-3.5 h-3.5" />
                                <span>إعادة محاولة الاتصال</span>
                              </button>
                              <a
                                href={activeChannel.url}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold rounded-lg transition-all text-center flex items-center justify-center gap-1.5"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                <span>فتح البث المباشر</span>
                              </a>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <video
                        ref={videoRef}
                        playsInline
                        className={`w-full h-full object-contain transition-transform duration-300 z-0 ${
                          isRotated ? 'rotate-90 scale-[0.67] aspect-video' : ''
                        }`}
                        poster={activeChannel.logo || "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=800&auto=format"}
                        onTimeUpdate={() => {
                          if (videoRef.current) {
                            setCurrentTime(videoRef.current.currentTime);
                          }
                        }}
                        onDurationChange={() => {
                          if (videoRef.current) {
                            setDuration(videoRef.current.duration);
                          }
                        }}
                        onPlay={() => setIsPlaying(true)}
                        onPause={() => setIsPlaying(false)}
                      />
                    )}

                    {/* Loader Overlay */}
                    {videoLoading && !streamError && (
                      <div className="absolute inset-0 bg-black/95 flex flex-col justify-center items-center gap-4 z-10">
                        <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white animate-spin" />
                        <div className="text-center">
                          <p className="text-sm font-semibold text-zinc-200">BSR Player loading...</p>
                          <p className="text-zinc-500 text-xs mt-1">جاري تشغيل القناة المباشرة وفحص التمكين</p>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* PREMIUM CONTROLLER CUSTOM OVERLAY (Auto-hides after 2s, shows on click/hover) */}
                  <div 
                    className={`absolute inset-0 bg-black/60 flex flex-col justify-between transition-opacity duration-300 z-10 p-2.5 sm:p-6 ${
                      showControls ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
                    }`}
                    onClick={(e) => {
                      if (e.target === e.currentTarget) {
                        setShowControls(false);
                      } else {
                        resetControlsTimeout();
                      }
                    }}
                  >
                    
                    {/* Top Row Controls */}
                    <div className="flex justify-between items-center w-full">
                      {/* Quality selection buttons */}
                      <div className="flex gap-2">
                        {['SD', 'HD', 'FHD'].map((qName, qIdx) => {
                          return (
                            <button
                              key={qIdx}
                              onClick={() => {
                                setSelectedQuality(qName);
                                // Simulation: notify quality adjusted
                                console.log('IPTV Video resolution shifted to:', qName);
                                if (hlsInstanceRef.current && hlsInstanceRef.current.levels) {
                                  const lvls = hlsInstanceRef.current.levels;
                                  if (lvls.length > 0) {
                                    if (qName === 'SD') hlsInstanceRef.current.currentLevel = 0;
                                    else if (qName === 'FHD') hlsInstanceRef.current.currentLevel = lvls.length - 1;
                                    else hlsInstanceRef.current.currentLevel = Math.floor(lvls.length / 2);
                                  }
                                }
                              }}
                              className={`px-3 md:px-4 py-1 md:py-1.5 rounded-full text-xs font-black tracking-widest transition-all duration-200 cursor-pointer ${
                                selectedQuality === qName
                                  ? 'bg-white text-black shadow-lg shadow-white/10 scale-105'
                                  : 'border border-zinc-700 bg-black/40 text-zinc-300 hover:bg-zinc-800'
                              }`}
                            >
                              {qName}
                            </button>
                          );
                        })}
                      </div>

                      {/* Title banner & back button */}
                      <div className="flex items-center gap-4">
                        <button
                          onClick={() => setActiveChannel(null)}
                          className="w-10 h-10 rounded-full border border-zinc-700 bg-[#0c0c0c]/90 hover:bg-red-600 text-white flex items-center justify-center cursor-pointer transition-all hover:scale-105 shadow-md"
                          title="العودة للخلف"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Center Core Buttons */}
                    <div className="flex items-center justify-center gap-12 w-full my-auto select-none">
                      {/* Main Play Circle (with rotating layout indicator) */}
                      <button
                        onClick={() => {
                          if (videoRef.current) {
                            if (isPlaying) {
                              videoRef.current.pause();
                            } else {
                              videoRef.current.play().catch(e => console.warn(e));
                            }
                          }
                        }}
                        className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-black/85 border border-zinc-700 flex items-center justify-center text-white cursor-pointer transition-all hover:scale-105 shadow-xl"
                      >
                        {isPlaying ? (
                          <div className="flex gap-1.5">
                            <div className="w-2.5 h-7 bg-white rounded-full" />
                            <div className="w-2.5 h-7 bg-white rounded-full" />
                          </div>
                        ) : (
                          <svg className="w-8 h-8 text-white ml-1 fill-white" viewBox="0 0 24 24">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        )}
                      </button>
                    </div>

                    {/* Progress Bar & Bottom Actions */}
                    <div className="w-full flex flex-col gap-2.5 sm:gap-4 mb-1 sm:mb-0">
                      {/* Full-width continuous flat white Line/Progress indicator */}
                      <div 
                        className="w-full h-[3px] bg-zinc-800 relative cursor-pointer group hidden"
                        onClick={(e) => {
                          if (videoRef.current && duration) {
                            const rect = e.currentTarget.getBoundingClientRect();
                            const clickX = e.clientX - rect.left;
                            const pct = clickX / rect.width;
                            videoRef.current.currentTime = pct * duration;
                          }
                        }}
                      >
                        <div 
                           className="absolute left-0 top-0 h-full bg-white transition-all duration-100" 
                          style={{ width: `${duration ? (currentTime / duration) * 100 : 100}%` }}
                        />
                      </div>

                      {/* Bottom row actions */}
                      <div className="flex justify-between items-center w-full gap-2">
                        {/* Left: Live indicator red breathing dot */}
                        <div className="flex items-center gap-2 hidden">
                          <span className="w-2.5 h-2.5 bg-red-600 rounded-full animate-pulse" />
                          <span className="text-white text-xs font-black tracking-widest font-mono">LIVE</span>
                        </div>

                        {/* Right: Outlined dark square layout buttons */}
                        <div className="flex gap-1 sm:gap-2 items-center justify-end max-w-full">
                          {/* Button 1: Screen Rotate orientation */}
                          <button
                            onClick={() => setIsRotated(!isRotated)}
                            className={`w-8 h-8 sm:w-10 sm:h-10 border rounded-lg sm:rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                              isRotated 
                                ? 'border-white bg-white text-black' 
                                : 'border-zinc-700 bg-zinc-900/40 text-zinc-300 hover:bg-zinc-850'
                            }`}
                            title="تدوير الشاشة"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-current" viewBox="0 0 24 24">
                              <path d="M16 4h4v4h-2V6h-2V4zm-8 0h2v2H8V4zM4 8V4h4v2H6v2H4zm14 8h2v-4h-2v4zm-2 4h4v-4h-2v2h-2v2zm-8 0h2v-2H8v2zm-4-4V12H4v4h2zm2 4H6v-2H4v2h4z" />
                            </svg>
                          </button>

                          {/* Button 2: Volume/Mute */}
                          <button
                            onClick={() => {
                              if (videoRef.current) {
                                videoRef.current.muted = !isMuted;
                                setIsMuted(!isMuted);
                              }
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 border border-zinc-700 bg-zinc-900/40 rounded-lg sm:rounded-xl text-zinc-300 hover:bg-zinc-850 flex items-center justify-center transition-all cursor-pointer"
                            title={isMuted ? "صامت" : "مسموع"}
                          >
                            {isMuted ? <VolumeX className="w-4 h-4 sm:w-5 sm:h-5" /> : <Volume2 className="w-4 h-4 sm:w-5 sm:h-5" />}
                          </button>

                          {/* Button 3: CC / Dialogue Bubble */}
                          <button
                            onClick={() => {
                              alert('تم تفعيل فحص وتوليد الترجمة التلفزيونية المصاحبة!');
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 border border-zinc-700 bg-zinc-900/40 rounded-lg sm:rounded-xl text-zinc-300 hover:bg-zinc-850 flex items-center justify-center transition-all cursor-pointer"
                            title="الترجمة المصاحبة"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                            </svg>
                          </button>

                          {/* Button 4: Settings Gear */}
                          <button
                            onClick={() => {
                              setInfoTab('php-guide');
                              const guideSec = document.getElementById('configuration-guide-section');
                              if (guideSec) {
                                guideSec.scrollIntoView({ behavior: 'smooth' });
                              }
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 border border-zinc-700 bg-zinc-900/40 rounded-lg sm:rounded-xl text-zinc-300 hover:bg-zinc-850 flex items-center justify-center transition-all cursor-pointer"
                            title="إعدادات البث"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>

                          {/* Button 5: Chromecast */}
                          <button
                            onClick={() => {
                              alert('البحث عن أجهزة استقبال Chromecast ...');
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 border border-zinc-700 bg-zinc-900/40 rounded-lg sm:rounded-xl text-zinc-300 hover:bg-zinc-850 flex items-center justify-center transition-all cursor-pointer"
                            title="بث الشاشة (Chromecast)"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                              <path strokeLinecap="round" d="M8 20H4a1 1 0 01-1-1v-4a8 8 0 018 8z" />
                              <path strokeLinecap="round" d="M12 20h4a6 6 0 00-6-6v6z" />
                              <path strokeLinecap="round" d="M16 20h3a1 1 0 001-1v-12a1 1 0 00-1-1H5a1 1 0 00-1 1v2" />
                            </svg>
                          </button>

                          {/* Button 6: Picture in Picture */}
                          <button
                            onClick={() => {
                              if (document.pictureInPictureElement) {
                                document.exitPictureInPicture();
                              } else if (videoRef.current) {
                                videoRef.current.requestPictureInPicture().catch(e => console.warn(e));
                              }
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 border border-zinc-700 bg-zinc-900/40 rounded-lg sm:rounded-xl text-zinc-300 hover:bg-zinc-850 flex items-center justify-center transition-all cursor-pointer"
                            title="فيديو عائم (PiP)"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.2">
                              <rect x="3" y="5" width="18" height="14" rx="2" strokeLinecap="round" strokeLinejoin="round" />
                              <rect x="13" y="11" width="7" height="5" rx="1" fill="currentColor" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>

                          {/* Button 7: Fullscreen */}
                          <button
                            onClick={() => {
                              const elem = document.getElementById('iptv-live-theater');
                              if (elem) {
                                if (!document.fullscreenElement) {
                                  elem.requestFullscreen().catch(err => console.warn(err));
                                } else {
                                  document.exitFullscreen().catch(err => console.warn(err));
                                }
                              }
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 border border-zinc-700 bg-zinc-900/40 rounded-lg sm:rounded-xl text-zinc-300 hover:bg-zinc-850 flex items-center justify-center transition-all cursor-pointer"
                            title="شاشة كاملة"
                          >
                            <svg className="w-4 h-4 sm:w-5 sm:h-5 fill-none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4h4m12 4V4h-4M4 16v4h4m12-4v4h-4" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>

                </div>
              </section>
            )}

            {/* Netflix-style HERO BANNER - Hidden per User Request */}

            {/* Smart Channels Dashboard Block */}
            <section className="bg-zinc-950 p-6 md:p-8 rounded-3xl border border-zinc-900 shadow-xl">
              
              {/* Dynamic Header Filter Controls */}
              <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4 pb-6 border-b border-zinc-800">
                {/* Search Inputs */}
                <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full">
                  {/* Search text box */}
                  <div className="relative flex-1">
                    <Search className="absolute right-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-zinc-500" />
                    <input
                      type="text"
                      placeholder="ابحث باسم القناة، التصنيف، المعرف..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-xl py-2.5 pr-10 pl-4 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600/30 transition-all font-light text-right"
                    />
                  </div>

                  {/* Reload and trigger button */}
                  <button
                    onClick={loadChannels}
                    disabled={loading}
                    className="px-4 py-2.5 bg-zinc-900 text-zinc-300 hover:text-white rounded-xl border border-zinc-800 hover:bg-zinc-850 flex items-center justify-center gap-1.5 transition-all text-xs cursor-pointer"
                    title="تحديث دليل القنوات مباشرة من الملف"
                  >
                    <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                    <span>تحديث القائمة</span>
                  </button>
                </div>
              </div>

              {/* Horizontal Category Pill Filter Slider */}
              <div className="py-4 flex gap-2 overflow-x-auto no-scrollbar scroll-smooth">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`px-4 py-2 text-xs font-semibold rounded-xl border whitespace-nowrap transition-all cursor-pointer ${
                      selectedCategory === cat
                        ? 'bg-red-600 border-red-600 text-white shadow-[0_4px_12px_rgba(220,38,38,0.3)]'
                        : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Loader container */}
              {loading ? (
                <div className="py-24 text-center">
                  <div className="w-10 h-10 rounded-full border-4 border-red-600/20 border-t-red-600 animate-spin mx-auto mb-4" />
                  <p className="text-sm text-zinc-400">جاري قراءة واستخلاص مجاري البث المباشر من ملف mofeed.m3u8 تلقائياً...</p>
                </div>
              ) : channels.length === 0 ? (
                <div className="py-20 text-center rounded-2xl border border-dashed border-zinc-850 bg-zinc-900/40">
                  <AlertTriangle className="w-12 h-12 text-red-605 mx-auto mb-3" />
                  <p className="text-zinc-300 font-bold">ملف القنوات فارغ أو غير موجود</p>
                  <p className="text-xs text-zinc-500 mt-2 max-w-md mx-auto leading-relaxed">
                    تأكد من إنشاء ملف باسم <strong className="text-red-400">mofeed.m3u8</strong> في المجلد الرئيسي وحشو القنوات بالتنسيق الموضح في شريط التوجيه بالأعلى.
                  </p>
                </div>
              ) : filteredChannels.length === 0 ? (
                <div className="py-16 text-center text-zinc-500">
                  <Search className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                  <p className="text-xs">لم يتم العثور على أي قناة توافق استعلام البحث: "{searchQuery}"</p>
                </div>
              ) : (
                /* Netflix Categorized Multi-Rows layout or grid representation */
                <div className="flex flex-col gap-8 mt-4">
                  {Object.keys(groupedChannels).map((catName) => (
                    <div key={catName} className="flex flex-col gap-3">
                      
                      {/* Row Category Title */}
                      <div className="flex items-center gap-2 hidden">
                        <span className="w-1.5 h-4 bg-red-600 rounded" />
                        <h4 className="font-bold text-zinc-100 text-base">{catName}</h4>
                        <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-0.5 rounded-full font-mono">
                          {groupedChannels[catName].length} قناة
                        </span>
                      </div>

                      {/* Infinite Scroller Slider Cards */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                        {groupedChannels[catName].map((chan) => (
                          <div
                            key={chan.id}
                            className="bg-zinc-900/60 border border-zinc-850 hover:border-red-600/60 rounded-2xl overflow-hidden hover:shadow-[0_8px_24px_rgba(220,38,38,0.15)] group transition-all duration-300 flex flex-col justify-between"
                          >
                            {/* Card Media Preview */}
                            <div className="relative aspect-video bg-black flex items-center justify-center overflow-hidden">
                              {chan.logo ? (
                                <img
                                  src={chan.logo}
                                  alt={chan.name}
                                  className="w-full h-full object-cover scale-100 group-hover:scale-110 transition-transform duration-300"
                                  referrerPolicy="no-referrer"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=400';
                                  }}
                                />
                              ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-zinc-800 to-zinc-950 flex flex-col justify-center items-center text-center p-3">
                                  <Tv className="w-8 h-8 text-red-500/80 mb-2 group-hover:scale-110 transition-transform" />
                                  <span className="text-[10px] text-zinc-550 truncate max-w-full font-mono">ID: {chan.id}</span>
                                </div>
                              )}

                              {/* Play overlay hover element */}
                              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setActiveChannel(chan)}
                                  className="p-3 bg-red-600 text-white rounded-full hover:bg-red-700 transition)all cursor-pointer shadow-lg hover:scale-110 shadow-red-600/30"
                                  title="تشغيل القناة فورا"
                                >
                                  <Play className="w-4 h-4 fill-white" />
                                </button>
                                <button
                                  onClick={() => setDetailsChannel(chan)}
                                  className="p-2.5 bg-zinc-800 text-zinc-200 hover:text-white rounded-full hover:bg-zinc-700 transition-all cursor-pointer"
                                  title="تفاصيل القناة"
                                >
                                  <Info className="w-4 h-4" />
                                </button>
                              </div>

                              <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/80 backdrop-blur text-[9px] text-red-400 font-semibold rounded font-mono border border-zinc-800">
                                {chan.url.toLowerCase().includes('.m3u8') ? 'HLS' : 'MPEG-TS'}
                              </span>
                            </div>

                            {/* Card meta labels */}
                            <div className="p-3 bg-[#0a0a0a]/90 text-right flex-1 flex flex-col justify-between">
                              <h5 className="text-xs font-bold text-zinc-150 line-clamp-1 group-hover:text-red-500 transition-colors">
                                {chan.name}
                              </h5>
                              <p className="text-[10px] text-zinc-500 mt-1 font-mono truncate hidden">
                                ID: {chan.id}
                              </p>
                            </div>

                            {/* Card play button direct trigger */}
                            <div className="p-2 bg-zinc-950 border-t border-zinc-900/60 flex gap-1.5">
                              <button
                                onClick={() => setActiveChannel(chan)}
                                className="flex-1 py-1.5 bg-red-600/10 hover:bg-red-600 text-red-450 hover:text-white text-[10px] font-bold rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>شاهد القناة</span>
                              </button>
                              <button
                                onClick={() => setDetailsChannel(chan)}
                                className="px-2 py-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 rounded-lg text-[10px] cursor-pointer"
                                title="تفاصيل البث"
                              >
                                <Info className="w-3.5 h-3.5" />
                              </button>
                            </div>

                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* TAB 2: PHP Deployment Guide & Code Package */}
        {infoTab === 'php-guide' && (
          <section className="bg-zinc-950 p-6 md:p-8 rounded-3xl border border-zinc-900 shadow-xl text-right flex flex-col gap-6 animate-fade-in">
            <div className="flex items-center gap-3 pb-4 border-b border-zinc-805">
              <div className="p-2 bg-red-950 text-red-500 rounded-xl border border-red-900/40">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-white text-base md:text-lg">دليل التثبيت والرفع على استضافة InfinityFree والـ PHP</h3>
                <p className="text-xs text-zinc-450">لقد تم إنشاء جميع ملفات PHP والـ JS والـ CSS المناسبة تلقائياً بالكامل في بيئة العمل الخاصة بك</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
              
              {/* Requirements & Info */}
              <div className="flex flex-col gap-4">
                <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                  <h4 className="font-bold text-white text-sm mb-3 text-red-500 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span>مواصفات الملفات الجاهزة للرفع</span>
                  </h4>
                  <ul className="text-xs text-zinc-350 flex flex-col gap-2.5 leading-relaxed">
                    <li>💡 <strong>كاملة وجاهزة للتشغيل المباشر:</strong> لست بحاجة لقاعدة بيانات SQL.</li>
                    <li>🔥 <strong>هيكل متوافق تماماً:</strong> تصميم احترافي شبيه بـ Netflix مدعوم بالـ Tailwind CSS.</li>
                    <li>📡 <strong>تلقائي بنسبة 100%:</strong> يقرأ الملف <code className="text-red-400 bg-black px-1 py-0.5 rounded">mofeed.m3u8</code> تلقائياً عند تغيير أي قناة أو تحديث القائمة.</li>
                    <li>⚡ <strong>دعم بروتوكولات الفيديو الثنائية:</strong> يستخدم HLS.js ديناميكياً لـ M3U8 و MPEGTS.js لملفات TS.</li>
                    <li>🎯 <strong>دعم RTL واللغة العربية:</strong> اتجاهات النصوص والنوافذ مهيأة تماماً وبشكل منمق.</li>
                  </ul>
                </div>

                <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-xs text-zinc-450 leading-relaxed">
                  <span className="font-bold text-white block mb-2 text-yellow-505">⚠️ ملاحظة تشغيلية هامة</span>
                  عند رفع الملفات على استضافتك المجانية (مثل InfinityFree)، يرجى رفع ملف <code className="text-red-400 bg-black px-1.5 rounded">mofeed.m3u8</code> في نفس المجلد الذي يحتوي على ملف <code className="text-red-400 bg-black px-1.5 rounded">index.php</code>، ليتمكن خادم PHP من قراءته ومعالجته فوراً وبدون أي مسارات خاطئة.
                </div>
              </div>

              {/* Explaining directory content */}
              <div className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800">
                <h4 className="font-bold text-white text-sm mb-3">📂 خريطة ملفات PHP البرمجية المجهزة للإستضافة</h4>
                <div className="flex flex-col gap-2.5 text-xs">
                  <div className="flex items-center justify-between p-2 bg-black/40 rounded-xl border border-zinc-850">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400">index.php</span>
                    </div>
                    <span className="text-zinc-500">لوحة العرض الرئيسية (Netflix-Style)</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-black/40 rounded-xl border border-zinc-850">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400">player.php</span>
                    </div>
                    <span className="text-zinc-500">صفحة البث للمشغل الذكي والتفاصيل</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-black/40 rounded-xl border border-zinc-850">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400">assets/style.css</span>
                    </div>
                    <span className="text-zinc-500">التصميم وتأثيرات الانيميشن الداكنة</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-black/40 rounded-xl border border-zinc-850">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-emerald-400">assets/player.js</span>
                    </div>
                    <span className="text-zinc-500">المشغل التلقائي HLS.js / MPEGTS.js</span>
                  </div>
                  <div className="flex items-center justify-between p-2 bg-black/40 rounded-xl border border-zinc-850">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-amber-500">mofeed.m3u8</span>
                    </div>
                    <span className="text-zinc-500">ملف قنوات البث التلفزيوني كقاعدة بيانات</span>
                  </div>
                </div>

                <div className="mt-4 p-3.5 bg-red-950/20 rounded-xl border border-red-900/10 text-[11px] text-zinc-400">
                  يمكنك استعراض هذه الملفات مباشرة من شريط مستكشف الملفات الجانبي في لوحة العمل وتحميلها إلى جهازك لرفعها فوراً.
                </div>
              </div>

            </div>
          </section>
        )}

      </main>



      {/* OPTIONAL DETAILS VIEW MODAL (Requirement 17) */}
      {detailsChannel && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative text-right flex flex-col gap-5">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <Info className="w-5 h-5 text-red-500" />
                <h4 className="font-bold text-white text-base">بطاقة تفاصيل القناة والبث المباشر</h4>
              </div>
              <button
                onClick={() => setDetailsChannel(null)}
                className="p-1 px-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-405 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                إغلاق
              </button>
            </div>

            {/* Thumbnail and Title */}
            <div className="flex items-start gap-4">
              {detailsChannel.logo ? (
                <img
                  src={detailsChannel.logo}
                  alt={detailsChannel.name}
                  className="w-24 h-24 rounded-2xl object-cover bg-black p-1 border border-zinc-700 shadow-md flex-shrink-0"
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1598488035139-bdbb2231ce04?w=200';
                  }}
                />
              ) : (
                <div className="w-24 h-24 rounded-2xl bg-zinc-950 border border-zinc-750 flex items-center justify-center">
                  <Tv className="w-10 h-10 text-red-500" />
                </div>
              )}

              <div className="flex-1 flex flex-col gap-1.5">
                <span className="text-[10px] bg-red-950/60 text-red-400 border border-red-900/40 px-2 py-0.5 rounded-full font-bold self-start">
                  {detailsChannel.category}
                </span>
                <h3 className="text-lg font-black text-white">{detailsChannel.name}</h3>
                <p className="text-xs text-zinc-400 font-mono">ID القناة الذكي: {detailsChannel.id}</p>
              </div>
            </div>

            {/* Stream Specification Details Table */}
            <div className="bg-zinc-950 p-4 rounded-2xl border border-zinc-850 flex flex-col gap-2.5 text-xs text-zinc-300">
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-500">اسم القناة داخل m3u8</span>
                <span className="font-bold text-white">{detailsChannel.name}</span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-500">رابط البث المستهدف</span>
                <span className="font-mono text-zinc-400 select-all truncate max-w-[240px]" title={detailsChannel.url}>
                  {detailsChannel.url}
                </span>
              </div>
              <div className="flex justify-between border-b border-zinc-900 pb-2">
                <span className="text-zinc-500">نوع المشغل</span>
                <span className="font-bold text-red-500">
                  {detailsChannel.url.toLowerCase().includes('.m3u8') ? 'HLS.js (بث متكيف)' : 'MPEGTS.js (تسلسلي)'}
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setActiveChannel(detailsChannel);
                  setDetailsChannel(null);
                  // Scroll to video component smoothly
                  setTimeout(() => {
                    document.getElementById('iptv-live-theater')?.scrollIntoView({ behavior: 'smooth' });
                  }, 150);
                }}
                className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-600/20"
              >
                <Play className="w-4.5 h-4.5 fill-white" />
                <span>تشغيل القناة الآن</span>
              </button>
              <button
                onClick={() => setDetailsChannel(null)}
                className="px-4 py-3 bg-zinc-805 hover:bg-zinc-700 text-zinc-300 rounded-xl text-xs transition-all cursor-pointer"
              >
                العودة
              </button>
            </div>

          </div>
        </div>
      )}

      {/* HIDDEN MANAGER PORTAL MODAL (Requirements & User Request) */}
      {showAdminPortal && (
        <div className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in" dir="rtl">
          <div className="bg-zinc-950 border border-zinc-850 rounded-3xl p-6 max-w-lg w-full shadow-2xl relative text-right flex flex-col gap-4 max-h-[90vh] overflow-y-auto">
            
            {/* Header */}
            <div className="flex justify-between items-center pb-3 border-b border-zinc-850">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-red-650 rounded-xl text-white">
                  <Tv className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-extrabold text-white text-base">بوابة المشرف: استيراد قنوات IPTV</h4>
                  <p className="text-[10px] text-zinc-400">إدارة وتحديث كود بث القنوات الذكي لـ ارينا لايف</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowAdminPortal(false);
                  // Remove hash from address bar gracefully
                  window.location.hash = '';
                }}
                className="p-1 px-2.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-lg transition-colors cursor-pointer text-xs"
              >
                إغلاق Portal
              </button>
            </div>

            {/* Status Reports */}
            {adminStatus && (
              <div className={`p-4 rounded-xl text-xs flex items-start gap-2.5 line-height-relaxed ${
                adminStatus.type === 'success' 
                  ? 'bg-emerald-950/40 text-emerald-400 border border-emerald-900/40' 
                  : 'bg-red-950/40 text-red-400 border border-red-900/40'
              }`}>
                {adminStatus.type === 'success' ? (
                  <CheckCircle className="w-5 h-5 flex-shrink-0" />
                ) : (
                  <AlertTriangle className="w-5 h-5 flex-shrink-0" />
                )}
                <span>{adminStatus.msg}</span>
              </div>
            )}

            <form onSubmit={handleAdminImport} className="flex flex-col gap-4">
              
              {/* Import Choice Tab bar */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 text-xs font-semibold">طريقة استيراد قائمة القنوات:</label>
                <div className="grid grid-cols-2 gap-2 bg-zinc-900 p-1.5 rounded-xl border border-zinc-850 text-xs text-center font-bold">
                  <button
                    type="button"
                    onClick={() => setAdminImportMethod('text')}
                    className={`py-2 rounded-lg cursor-pointer transition-all ${
                      adminImportMethod === 'text' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    لصق نصي مباشر
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminImportMethod('url')}
                    className={`py-2 rounded-lg cursor-pointer transition-all ${
                      adminImportMethod === 'url' ? 'bg-red-600 text-white shadow-md' : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    رابط خارجي مخصص URL
                  </button>
                </div>
              </div>

              {/* Paste Text Panel */}
              {adminImportMethod === 'text' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-300 text-xs font-semibold" htmlFor="admin-m3u-text-area">ألصق كود باقة القنوات (تنسيق M3U):</label>
                  <textarea
                    id="admin-m3u-text-area"
                    value={adminM3uText}
                    onChange={(e) => setAdminM3uText(e.target.value)}
                    placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id='chan1' group-title='News',قناة الأخبار العالمية&#10;http://example.com/stream.m3u8"
                    className="w-full h-32 bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-650 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600 font-mono"
                  />
                </div>
              )}

              {/* URL Input Panel */}
              {adminImportMethod === 'url' && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-zinc-300 text-xs font-semibold" htmlFor="admin-m3u-url-input">أدخل رابط ملف الـ m3u8 المباشر:</label>
                  <input
                    id="admin-m3u-url-input"
                    type="url"
                    value={adminM3uUrl}
                    onChange={(e) => setAdminM3uUrl(e.target.value)}
                    placeholder="https://server.com/playlist.m3u8"
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                  />
                </div>
              )}

              {/* Specify category section */}
              <div className="flex flex-col gap-1.5">
                <label className="text-zinc-300 text-xs font-semibold" htmlFor="admin-category-input">القسم المستهدف للاستيراد إليه (اختياري):</label>
                <input
                  id="admin-category-input"
                  type="text"
                  value={adminTargetCategory}
                  onChange={(e) => setAdminTargetCategory(e.target.value)}
                  placeholder="مثال: قنوات رياضية، باقة أفلام نتفلیکس، الأخبار ..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-red-600 focus:ring-1 focus:ring-red-600"
                />
                <span className="text-[10px] text-zinc-500">اترك الحقل فارغاً للاحتفاظ بكامل الأقسام الأصلية لكل قناة في الملف المستورد تلقائياً.</span>
              </div>

              {/* Save mechanics Append or Overwrite */}
              <div className="bg-zinc-900/60 p-3.5 rounded-xl border border-zinc-850 flex flex-col gap-2">
                <span className="text-zinc-305 text-xs font-semibold">خيار خزن واستيراد القنوات:</span>
                <div className="flex flex-col gap-1.5">
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-300">
                    <input
                      type="radio"
                      name="react-save-mode"
                      value="append"
                      checked={adminSaveMode === 'append'}
                      onChange={() => setAdminSaveMode('append')}
                      className="accent-red-600"
                    />
                    <span>إضافة إلى قنواتك الحالية مسبقاً (دون مسح القنوات السابقة)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer text-xs text-zinc-400">
                    <input
                      type="radio"
                      name="react-save-mode"
                      value="overwrite"
                      checked={adminSaveMode === 'overwrite'}
                      onChange={() => setAdminSaveMode('overwrite')}
                      className="accent-red-600"
                    />
                    <span className="text-red-500 font-bold">مسح القائمة الحالية بالكامل واستبدال القنوات</span>
                  </label>
                </div>
              </div>

              {/* Actions submit button */}
              <button
                type="submit"
                disabled={adminLoading}
                className="w-full py-3 bg-red-600 hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-red-600/20 disabled:opacity-50"
              >
                {adminLoading ? (
                  <span>جاري معالجة واستيراد القنوات...</span>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>ابدأ استيراد القنوات الآن</span>
                  </>
                )}
              </button>

            </form>

          </div>
        </div>
      )}

    </div>
  );
}
