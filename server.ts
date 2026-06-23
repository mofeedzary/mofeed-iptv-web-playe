import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isProd = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 3000;

async function createServer() {
  const app = express();
  app.use(express.json());

  let ai: GoogleGenAI | null = null;
  function getGemini(): GoogleGenAI {
    if (!ai) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error('GEMINI_API_KEY environment variable is not defined.');
      }
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });
    }
    return ai;
  }

  // --- API Routes ---

  // Route 1: Automatically break down a goal or task into actionable milestones
  app.post('/api/gemini/breakdown', async (req, res) => {
    try {
      const { taskTitle, duration } = req.body;
      if (!taskTitle) {
        return res.status(400).json({ error: 'taskTitle is required' });
      }

      const client = getGemini();
      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `قم بتفكيك المهمة أو الهدف التالي إلى 3 إلى 6 خطوات فرعية/مراحل عملية ومصممة بشكل جميل مع تقدير مدتها الزمنية باللغة العربية. اجعل الأسلوب تحفيزياً وعملياً للغاية.
المهمة/الهدف: "${taskTitle}"
مدة الجلسة المفضلة: ${duration ? `${duration} دقيقة` : 'جلسة تركيز عامة'}

ملاحظة هامة جداً: يجب أن تكون جميع النصوص وحقول "title" و "coachingQuote" باللغة العربية الفصحى الأنيقة والجذابة. استعمل صيغة JSON نظيفة ليتم معالجتها مباشرة في واجهة المستخدم.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: ['steps', 'coachingQuote'],
            properties: {
              coachingQuote: {
                type: Type.STRING,
                description: 'A brief, highly elegant and motivational 1-sentence thought in Slate aesthetic tone written in pure Arabic.',
              },
              steps: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  required: ['title', 'durationEstimation'],
                  properties: {
                    title: {
                      type: Type.STRING,
                      description: 'Actionable specific step, under 10 words, in pure Arabic.',
                    },
                    durationEstimation: {
                      type: Type.STRING,
                      description: 'Estimated minutes/hours (e.g. "١٠ د", "١٥ د" or "10m", "15m").',
                    },
                  },
                },
              },
            },
          },
        },
      });

      const rawText = response.text || '{}';
      const data = JSON.parse(rawText);
      res.json(data);
    } catch (error: any) {
      console.error('Error in task breakdown:', error);
      res.status(500).json({ error: error.message || 'Failed to break down task' });
    }
  });

  // Route 2: Generate atmospheric quotes and reflection prompts
  app.post('/api/gemini/quote', async (req, res) => {
    try {
      const { category } = req.body; // 'zen', 'creative', 'focus'
      const client = getGemini();
      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `أنتج مقولة ملهمة واحدة وسؤالاً تأملياً صغيراً (أقل من 15 كلمة) يعكس حالة الذهن من نوع "${category || 'zen'}" (تأملي/إبداعي/تركيز).
يجب أن تكون المقولة بليغة وفي غاية العمق الفكري، وعبر عنها باللغة العربية الفصحى الراقية والخالية من العبارات المكررة. نسق المخرج على هيئة JSON.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            required: ['quote', 'author', 'reflectionQuestion'],
            properties: {
              quote: { type: Type.STRING, description: 'Elegant inspiring quote in pure Arabic.' },
              author: { type: Type.STRING, description: 'Author name in pure Arabic.' },
              reflectionQuestion: { type: Type.STRING, description: 'A short reflective question in Arabic.' },
            },
          },
        },
      });

      const rawText = response.text || '{}';
      const data = JSON.parse(rawText);
      res.json(data);
    } catch (error: any) {
      console.error('Error in generating reflection:', error);
      res.status(500).json({ error: error.message || 'Failed to generate slate reflection' });
    }
  });

  // Route 3: Assistant dynamic co-pilot advice/insights
  app.post('/api/gemini/assistant', async (req, res) => {
    try {
      const { prompt, currentTasks } = req.body;
      const client = getGemini();
      const response = await client.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `أنت المساعد الذكي ورفيق التركيز (Slate Co-Pilot). يتواجد المستخدم حالياً في مساحة عمله البسيطة والأنيقة لزيادة التركيز وتصفية الذهن.
المهام الحالية في قائمته: ${JSON.stringify(currentTasks || [])}
رسالة المستخدم/السؤال: "${prompt}"

يرجى تقديم رد موجز، ودود للغاية، وعميق بأسلوب الزن لمساعدة المستخدم وحثه على التركيز ومواصلة الإنجاز. تواصل معه باللغة العربية الفصحى الراقية والمشجعة. اجعل الرد أقل من 100 كلمة، واستخدم تنسيق ماركداون (مثل النقاط أو الخط العريض) عند الحاجة. اطرح عليه سؤالاً قصيراً وودياً للتركيز في نهاية الرد.`,
      });

      res.json({ text: response.text || '' });
    } catch (error: any) {
      console.error('Assistant error:', error);
      res.status(500).json({ error: error.message || 'Slate Co-Pilot is temporarily sleeping.' });
    }
  });

  // Route 4: IPTV Channels Parser from mofeed.m3u8
  app.get('/api/iptv/channels', async (req, res) => {
    try {
      const m3uPath = path.resolve(process.cwd(), 'mofeed.m3u8');
      if (!fs.existsSync(m3uPath)) {
        return res.status(404).json({ error: 'M3U8 file not found. Please create mofeed.m3u8.' });
      }

      const rawContent = fs.readFileSync(m3uPath, 'utf-8');
      const lines = rawContent.split('\n');
      const channels: any[] = [];
      let currentItem: any = null;

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#EXTINF:')) {
          currentItem = {};
          
          // Regex selectors to grab attributes
          const idMatch = line.match(/tvg-id="([^"]+)"/i);
          const nameMatch = line.match(/tvg-name="([^"]+)"/i);
          const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
          const groupMatch = line.match(/group-title="([^"]+)"/i);

          // Get channel display title (after last comma)
          const commaIdx = line.lastIndexOf(',');
          let displayName = '';
          if (commaIdx !== -1) {
            displayName = line.substring(commaIdx + 1).trim();
          }

          currentItem.id = idMatch ? idMatch[1] : (nameMatch ? nameMatch[1] : 'chan-' + i);
          currentItem.name = displayName || (nameMatch ? nameMatch[1] : 'قناة غير مسمى ' + i);
          currentItem.logo = logoMatch ? logoMatch[1] : '';
          currentItem.category = groupMatch ? groupMatch[1] : 'عام';
        } else if (line && !line.startsWith('#') && (line.startsWith('http') || line.endsWith('.ts') || line.endsWith('.m3u8') || line.includes('/live/') || line.includes('.mp4'))) {
          if (currentItem) {
            currentItem.url = line;
            channels.push(currentItem);
            currentItem = null;
          }
        }
      }

      res.json({ channels });
    } catch (e: any) {
      console.error('IPTV Parser Error:', e);
      res.status(500).json({ error: 'Failed to read channel playlist' });
    }
  });

  // Route 4.5: admin import API
  app.post('/api/iptv/import', async (req, res) => {
    try {
      const { import_method, target_category, save_mode, m3u_text, m3u_url } = req.body;
      let raw_m3u_content = "";

      if (import_method === 'url') {
        if (!m3u_url) {
          return res.status(400).json({ error: 'مطلوب رابط خارجي للـ M3U8' });
        }
        const fetchRes = await fetch(m3u_url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          }
        });
        if (!fetchRes.ok) {
          return res.status(400).json({ error: 'فشل تحميل الملف من الرابط المباشر' });
        }
        raw_m3u_content = await fetchRes.text();
      } else {
        raw_m3u_content = m3u_text || "";
      }

      if (!raw_m3u_content.trim()) {
        return res.status(400).json({ error: 'محتوى الـ M3U8 فارغ' });
      }

      // Convert line breaks and parse
      const lines = raw_m3u_content.split(/\r?\n/);
      const cleaned_lines: string[] = [];
      let current_extinf = "";
      let imported_count = 0;

      for (const lineRaw of lines) {
        const line = lineRaw.trim();
        if (!line) continue;

        if (line.startsWith('#EXTM3U')) {
          continue;
        }

        if (line.startsWith('#EXTINF:')) {
          let modifiedLine = line;
          if (target_category && target_category.trim()) {
            const catEscaped = target_category.trim().replace(/"/g, '&quot;');
            if (/group-title="[^"]*"/i.test(modifiedLine)) {
              modifiedLine = modifiedLine.replace(/group-title="[^"]*"/i, `group-title="${catEscaped}"`);
            } else {
              const commaPos = modifiedLine.lastIndexOf(',');
              if (commaPos !== -1) {
                modifiedLine = modifiedLine.substring(0, commaPos) + ` group-title="${catEscaped}"` + modifiedLine.substring(commaPos);
              } else {
                modifiedLine = modifiedLine + ` group-title="${catEscaped}"`;
              }
            }
          }
          current_extinf = modifiedLine;
        } else if (line.startsWith('#')) {
          cleaned_lines.push(line);
        } else {
          // Stream URL
          if (current_extinf) {
            cleaned_lines.push(current_extinf);
            imported_count++;
            current_extinf = "";
          }
          cleaned_lines.push(line);
        }
      }

      if (imported_count > 0) {
        const final_new_content = cleaned_lines.join('\n') + '\n';
        const m3uPath = path.resolve(process.cwd(), 'mofeed.m3u8');

        if (save_mode === 'overwrite') {
          fs.writeFileSync(m3uPath, '#EXTM3U\n' + final_new_content, 'utf-8');
        } else {
          let existing_content = "";
          if (fs.existsSync(m3uPath)) {
            existing_content = fs.readFileSync(m3uPath, 'utf-8');
          }

          if (!existing_content.trim() || !existing_content.trim().startsWith('#EXTM3U')) {
            existing_content = '#EXTM3U\n';
          } else {
            existing_content = existing_content.trimEnd() + '\n';
          }

          fs.writeFileSync(m3uPath, existing_content + final_new_content, 'utf-8');
        }

        res.json({ success: true, count: imported_count });
      } else {
        res.status(400).json({ error: 'المحتوى غير صالح لتنسيق M3U8' });
      }
    } catch (e: any) {
      console.error('Import Error:', e);
      res.status(500).json({ error: e.message || 'حدث خطأ غير متوقع أثناء استيراد القنوات' });
    }
  });

  // Route 5: Secure Stream Proxy to bypass Mixed Content (Insecure HTTP stream on HTTPS panel)
  app.get('/api/stream-proxy', async (req, res) => {
    let targetUrl = req.query.url as string;
    if (!targetUrl) {
      return res.status(400).send('URL query parameter matches are required');
    }

    try {
      targetUrl = decodeURIComponent(targetUrl).trim();
    } catch (e) {
      // Keep fallback
    }

    const httpEngine = await import('http');
    const httpsEngine = await import('https');

    const maxLoops = 5;
    let redirectCount = 0;

    const streamRequest = (currentUrl: string) => {
      const client = currentUrl.startsWith('https') ? httpsEngine : httpEngine;
      const options = {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': '*/*'
        }
      };

      const proxyReq = client.get(currentUrl, options, (proxyRes) => {
        const { statusCode, headers } = proxyRes;

        // Auto follow redirect redirects
        if (statusCode && [301, 302, 303, 307, 308].includes(statusCode) && headers.location) {
          redirectCount++;
          if (redirectCount > maxLoops) {
            return res.status(502).send('Proxy loop recursion limits breached.');
          }
          let nextUrl = headers.location;
          if (!nextUrl.startsWith('http')) {
            nextUrl = new URL(nextUrl, currentUrl).toString();
          }
          return streamRequest(nextUrl);
        }

        const isM3U8Request = currentUrl.toLowerCase().includes('m3u8') || 
                              currentUrl.toLowerCase().includes('playlist') || 
                              currentUrl.toLowerCase().includes('manifest') || 
                              (statusCode === 200 && headers['content-type'] && (
                                headers['content-type'].toLowerCase().includes('mpegurl') || 
                                headers['content-type'].toLowerCase().includes('m3u8')
                              ));

        if (isM3U8Request) {
          // If M3U8, buffer the response, convert relative URIs to absolute URIs
          const bodyChunks: Buffer[] = [];
          proxyRes.on('data', (chunk) => {
            bodyChunks.push(chunk);
          });
          proxyRes.on('end', () => {
            const rawBody = Buffer.concat(bodyChunks).toString('utf8');
            
            const resolveRelative = (uri: string, baseUrl: string) => {
              if (uri.startsWith('http://') || uri.startsWith('https://')) {
                return uri;
              }
              try {
                return new URL(uri, baseUrl).toString();
              } catch (e) {
                return uri;
              }
            };

            const lines = rawBody.split('\n');
            const rewrittenLines = lines.map(line => {
              const trimmed = line.trim();
              if (trimmed === '') return line;
              
              if (trimmed.startsWith('#')) {
                // Rewrite attributes e.g. URI="something"
                return trimmed.replace(/URI="([^"]+)"/g, (match, p1) => {
                  return `URI="${resolveRelative(p1, currentUrl)}"`;
                });
              }
              
              // Rewrite stream URL lines
              return resolveRelative(trimmed, currentUrl);
            });

            const rewrittenBody = rewrittenLines.join('\n');
            
            res.status(statusCode || 200);
            res.setHeader('Content-Type', headers['content-type'] || 'application/vnd.apple.mpegurl');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.send(rewrittenBody);
          });
        } else {
          // Non-manifest files (.ts files, chunks): stream directly and set CORS compatibility Headers
          res.status(statusCode || 200);
          const headersToKeep = ['content-type', 'content-length', 'accept-ranges', 'content-range'];
          headersToKeep.forEach(headerKey => {
            if (headers[headerKey]) {
              res.setHeader(headerKey, headers[headerKey]!);
            }
          });
          res.setHeader('Access-Control-Allow-Origin', '*');

          proxyRes.pipe(res);
        }

        // Clean up connection on user abort (switched channels, closed player etc)
        req.on('close', () => {
          proxyReq.destroy();
          proxyRes.destroy();
        });
      });

      proxyReq.on('error', (err) => {
        console.error('Express Stream Proxy Error:', err.message);
        if (!res.headersSent) {
          res.status(502).send('Express failed to connect to live IPTV hub: ' + err.message);
        }
      });
    };

    streamRequest(targetUrl);
  });

  // --- Vite Dev Middleware Integrations ---
  let vite: any;
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
  }

  // --- Fallback View routing (Serves the actual SPA App) ---
  app.get('*', async (req, res, next) => {
    const url = req.originalUrl;
    try {
      let template: string;
      if (!isProd) {
        template = fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8');
        template = await vite.transformIndexHtml(url, template);
      } else {
        template = fs.readFileSync(path.resolve(__dirname, 'dist/index.html'), 'utf-8');
      }
      res.status(200).set({ 'Content-Type': 'text/html' }).end(template);
    } catch (e) {
      if (!isProd && vite) {
        vite.ssrFixStacktrace(e as Error);
      }
      next(e);
    }
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Slate Server] Running on http://localhost:${PORT}`);
  });
}

createServer().catch((err) => {
  console.error('[Slate Server] Failed to initiate:', err);
});
