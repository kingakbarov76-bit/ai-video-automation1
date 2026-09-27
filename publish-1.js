// ============================================================================
// AI YouTube Shorts Publisher — runs top to bottom once per GitHub Actions job
// Gemini plans the script -> Google TTS voices each line -> Pexels supplies a
// real matching video clip per scene -> ffmpeg renders the final vertical
// video -> uploads to YouTube -> logs to Google Sheets -> notifies Telegram.
// 100% free stack. Nothing here is AI-*generated* video pixels — every scene
// is real, freely-licensed stock footage, so there is no copyright risk.
// ============================================================================

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { google } from 'googleapis';

const WORKDIR = './tmp_pipeline';
fs.mkdirSync(WORKDIR, { recursive: true });

const {
  GEMINI_API_KEY,
  GOOGLE_TTS_API_KEY,
  PEXELS_API_KEY,
  GOOGLE_SHEET_ID,
  GOOGLE_SERVICE_ACCOUNT_JSON,
  YT_CLIENT_ID,
  YT_CLIENT_SECRET,
  YT_REFRESH_TOKEN,
  TELEGRAM_BOT_TOKEN,
  TELEGRAM_CHAT_ID,
} = process.env;

function required(name, value) {
  if (!value) throw new Error(`Missing required secret: ${name}. Add it under Settings > Secrets and variables > Actions.`);
  return value;
}
[
  ['GEMINI_API_KEY', GEMINI_API_KEY],
  ['GOOGLE_TTS_API_KEY', GOOGLE_TTS_API_KEY],
  ['PEXELS_API_KEY', PEXELS_API_KEY],
  ['GOOGLE_SHEET_ID', GOOGLE_SHEET_ID],
  ['GOOGLE_SERVICE_ACCOUNT_JSON', GOOGLE_SERVICE_ACCOUNT_JSON],
  ['YT_CLIENT_ID', YT_CLIENT_ID],
  ['YT_CLIENT_SECRET', YT_CLIENT_SECRET],
  ['YT_REFRESH_TOKEN', YT_REFRESH_TOKEN],
].forEach(([name, value]) => required(name, value));

// ---------------------------------------------------------------------------
// Google auth: a Service Account for Sheets, OAuth2 + refresh token for YouTube
// ---------------------------------------------------------------------------
const serviceAccount = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON);
const sheetsAuth = new google.auth.JWT(
  serviceAccount.client_email,
  null,
  serviceAccount.private_key,
  ['https://www.googleapis.com/auth/spreadsheets']
);
const sheets = google.sheets({ version: 'v4', auth: sheetsAuth });

const oauth2Client = new google.auth.OAuth2(YT_CLIENT_ID, YT_CLIENT_SECRET);
oauth2Client.setCredentials({ refresh_token: YT_REFRESH_TOKEN });
const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

// ---------------------------------------------------------------------------
// 1. Read every topic already published, so Gemini never repeats one
// ---------------------------------------------------------------------------
async function getPreviousTopics() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Log!B2:B', // column B = Topic (A=Date, B=Topic, C=Title, D=VideoURL)
  });
  return (res.data.values || []).map((r) => r[0]).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 2. Ask Gemini to plan a brand-new video
// ---------------------------------------------------------------------------
async function planVideo(previousTopics) {
  const prompt = `You are the creative director for a fast-growing YouTube Shorts channel that fascinates a broad, general audience.

Generate ONE brand-new short video concept. It must be completely different from every one of these previously used topics:
${previousTopics.length ? previousTopics.map((t) => `- ${t}`).join('\n') : '(no topics used yet)'}

Requirements:
- Pick a genuinely fascinating topic (science, space, history, psychology, nature, "how things work", strange-but-true facts) that makes people want to watch to the end, then watch again.
- Break it into 4 to 6 short scenes. All narration together should read aloud in 45-60 seconds.
- For each scene give: a 2-4 word "visual_keyword" (used to find matching real stock footage), a 1-2 sentence "narration" line, and a "gender" ("male" or "female") for whichever voice fits that line. Vary the gender across scenes/videos over time.
- Write a catchy "title" (under 90 characters), a 2-3 sentence YouTube "description" that ends with a call to follow, and 5 relevant "hashtags" (each starting with #).

Respond with ONLY valid JSON, no markdown fences, no commentary, in exactly this shape:
{"topic": "", "title": "", "description": "", "hashtags": [], "scenes": [{"visual_keyword": "", "narration": "", "gender": ""}]}`;

  const res = await fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  let raw = data.candidates[0].content.parts[0].text;
  raw = raw.replace(/```json/g, '').replace(/```/g, '').trim();
  return JSON.parse(raw);
}

// ---------------------------------------------------------------------------
// 3. Build one scene: gender-matched voice (Google TTS) + real footage (Pexels)
// ---------------------------------------------------------------------------
const voiceMap = { female: 'en-US-Neural2-F', male: 'en-US-Neural2-D' };

async function buildScene(scene, index) {
  // --- Voice ---
  const ttsRes = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { text: scene.narration },
        voice: { languageCode: 'en-US', name: voiceMap[scene.gender] || voiceMap.female },
        audioConfig: { audioEncoding: 'MP3' },
      }),
    }
  );
  if (!ttsRes.ok) throw new Error(`Google TTS error ${ttsRes.status}: ${await ttsRes.text()}`);
  const ttsData = await ttsRes.json();
  const audioPath = path.join(WORKDIR, `scene_${index}_audio.mp3`);
  fs.writeFileSync(audioPath, Buffer.from(ttsData.audioContent, 'base64'));

  // --- Real stock video clip (never a static slide) ---
  const clipPath = path.join(WORKDIR, `scene_${index}_raw.mp4`);
  try {
    const pexelsRes = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(scene.visual_keyword)}&orientation=portrait&per_page=1`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    const pexelsData = await pexelsRes.json();
    const files = pexelsData?.videos?.[0]?.video_files || [];
    const pick = files.find((f) => f.quality === 'hd') || files[0];
    if (!pick) throw new Error('no matching clip found on Pexels');
    const videoRes = await fetch(pick.link);
    const buf = Buffer.from(await videoRes.arrayBuffer());
    fs.writeFileSync(clipPath, buf);
  } catch (err) {
    console.warn(`Scene ${index}: falling back to a color card (${err.message})`);
    execSync(`ffmpeg -y -f lavfi -i color=c=0x1a1a2e:s=1080x1920:d=8 -vf "fps=30" "${clipPath}"`);
  }

  // --- Match the clip's length to its voice line, force vertical 1080x1920 ---
  const durationStr = execSync(
    `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`
  ).toString().trim();
  const duration = (parseFloat(durationStr) || 3) + 0.4;
  const finalScenePath = path.join(WORKDIR, `scene_${index}_final.mp4`);
  execSync(
    `ffmpeg -y -stream_loop -1 -i "${clipPath}" -i "${audioPath}" -t ${duration} ` +
    `-vf "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=30" ` +
    `-map 0:v:0 -map 1:a:0 -c:v libx264 -preset veryfast -c:a aac -shortest "${finalScenePath}"`
  );
  return finalScenePath;
}

// ---------------------------------------------------------------------------
// 4. Stitch every scene into the final video
// ---------------------------------------------------------------------------
function renderFinalVideo(sceneClips) {
  const listPath = path.join(WORKDIR, 'concat_list.txt');
  fs.writeFileSync(listPath, sceneClips.map((f) => `file '${path.resolve(f)}'`).join('\n'));
  const finalPath = path.join(WORKDIR, `final_${Date.now()}.mp4`);
  execSync(`ffmpeg -y -f concat -safe 0 -i "${listPath}" -c copy "${finalPath}"`);
  return finalPath;
}

// ---------------------------------------------------------------------------
// 5. Upload to YouTube
// ---------------------------------------------------------------------------
async function uploadToYouTube(filePath, title, description, hashtags) {
  const res = await youtube.videos.insert({
    part: ['snippet', 'status'],
    requestBody: {
      snippet: {
        title,
        description: `${description}\n\n${hashtags.join(' ')} #Shorts`,
        tags: hashtags.map((h) => h.replace('#', '')),
        categoryId: '28', // Science & Technology
      },
      status: { privacyStatus: 'public', selfDeclaredMadeForKids: false },
    },
    media: { body: fs.createReadStream(filePath) },
  });
  return res.data;
}

// ---------------------------------------------------------------------------
// 6. Log the run + notify Telegram
// ---------------------------------------------------------------------------
async function logToSheet(topic, title, videoUrl) {
  await sheets.spreadsheets.values.append({
    spreadsheetId: GOOGLE_SHEET_ID,
    range: 'Log!A:D',
    valueInputOption: 'RAW',
    requestBody: { values: [[new Date().toISOString(), topic, title, videoUrl]] },
  });
}

async function notifyTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text }),
  });
}

// ---------------------------------------------------------------------------
// MAIN
// ---------------------------------------------------------------------------
async function main() {
  console.log('1/6 Reading previous topics…');
  const previousTopics = await getPreviousTopics();
  console.log(`   found ${previousTopics.length} previous topic(s)`);

  console.log('2/6 Planning video with Gemini…');
  const plan = await planVideo(previousTopics);
  console.log('   topic:', plan.topic);

  console.log(`3/6 Building ${plan.scenes.length} scene(s) (voice + footage)…`);
  const sceneClips = [];
  for (let i = 0; i < plan.scenes.length; i++) {
    sceneClips.push(await buildScene(plan.scenes[i], i));
  }

  console.log('4/6 Rendering final video…');
  const finalPath = renderFinalVideo(sceneClips);

  console.log('5/6 Uploading to YouTube…');
  const uploaded = await uploadToYouTube(finalPath, plan.title, plan.description, plan.hashtags);
  const videoUrl = `https://youtube.com/watch?v=${uploaded.id}`;
  console.log('   published:', videoUrl);

  console.log('6/6 Logging + notifying…');
  await logToSheet(plan.topic, plan.title, videoUrl);
  await notifyTelegram(`✅ Yangi video joylandi!\n\n${plan.title}\n\n${videoUrl}`);

  fs.rmSync(WORKDIR, { recursive: true, force: true });
  console.log('Done.');
}

main().catch(async (err) => {
  console.error('Pipeline failed:', err);
  await notifyTelegram(`❌ Video joylash muvaffaqiyatsiz tugadi:\n${err.message}`).catch(() => {});
  process.exit(1);
});
