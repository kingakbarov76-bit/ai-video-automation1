# Sozlash — boshidan oxirigacha (kartasiz, 100% bepul)

## 1. GitHub repo yaratish
1. github.com/new → nom bering (masalan `yt-shorts-bot`) → **Public** tanlang (bepul/cheksiz minut uchun shart!) → Create repository.
2. Shu papkadagi 4 ta faylni ("Add file" → "Upload files" orqali, yoki GitHub Desktop bilan) repo'ga yuklang — papka tuzilishini saqlang: `.github/workflows/publish.yml`, `scripts/publish.js`, `package.json`, `SETUP.md`.

## 2. Google Sheet (loglash uchun)
1. Yangi Google Sheet oching. Birinchi qatorga: `Date | Topic | Title | VideoURL`.
2. Varaq nomini **Log** deb qo'ying (pastdagi tab nomi).
3. URL'dan Sheet ID'ni oling: `docs.google.com/spreadsheets/d/`**`BU_YERDAGI_QISM`**`/edit`

## 3. Google Cloud loyihasi (bitta loyihada hammasi)
1. console.cloud.google.com → yangi loyiha yarating.
2. **APIs & Services → Library** dan yoqing: *Cloud Text-to-Speech API*, *YouTube Data API v3*, *Google Sheets API*.
3. **Gemini kaliti**: aistudio.google.com/apikey → "Create API key" → shu loyihani tanlang → `GEMINI_API_KEY`.
4. **TTS kaliti**: Google Cloud Console → **APIs & Services → Credentials → Create Credentials → API key** → `GOOGLE_TTS_API_KEY`.
5. **Service Account (Sheets uchun)**: Credentials → Create Credentials → Service Account → nom bering → Create → Done. Keyin shu hisobni oching → **Keys** → Add Key → JSON → yuklab oling. Faylni ochib, **butun matnini** `GOOGLE_SERVICE_ACCOUNT_JSON` sifatida saqlaysiz. JSON ichidan `client_email` maydonini toping va Google Sheet'ni o'sha email'ga **Editor** huquqi bilan ulashing (Sheet'dagi "Share" tugmasi).

## 4. YouTube OAuth (eng murakkab qadam — sekin bajaring)
1. Google Cloud Console → **APIs & Services → OAuth consent screen** → External → to'ldiring → Save.
2. **Credentials → Create Credentials → OAuth client ID** → turi: **Desktop app** → yarating. `Client ID` va `Client Secret`ni saqlab qo'ying — bular `YT_CLIENT_ID` va `YT_CLIENT_SECRET`.
3. **Refresh token olish** (bir martalik amal):
   - developers.google.com/oauthplayground ga kiring.
   - O'ng yuqoridagi ⚙️ (Settings) → "Use your own OAuth credentials" belgilang → shu yerga 2-qadamdagi Client ID va Secret'ni kiriting.
   - Chapdagi ro'yxatdan **YouTube Data API v3** → `https://www.googleapis.com/auth/youtube.upload` scope'ni tanlang → **Authorize APIs** → o'z Google (YouTube kanali ulangan) hisobingiz bilan kiring, ruxsat bering.
   - **Exchange authorization code for tokens** tugmasini bosing.
   - Chiqqan **Refresh token**ni nusxalang — bu `YT_REFRESH_TOKEN`.

## 5. Pexels (bepul stock video)
pexels.com/api → ro'yxatdan o'ting (karta so'ramaydi) → API key → `PEXELS_API_KEY`.

## 6. Telegram bot
- @BotFather'ga `/newbot` yozing → tokenni oling → `TELEGRAM_BOT_TOKEN`.
- @userinfobot'ga istalgan xabar yozing → u sizga `Chat ID`ni beradi → `TELEGRAM_CHAT_ID`.

## 7. Barcha kalitlarni GitHub'ga qo'shish
Repo → **Settings → Secrets and variables → Actions → New repository secret**. Quyidagi 10 ta nomni **aynan shunday** yozib, har biriga mos qiymatni kiriting:

```
GEMINI_API_KEY
GOOGLE_TTS_API_KEY
PEXELS_API_KEY
GOOGLE_SHEET_ID
GOOGLE_SERVICE_ACCOUNT_JSON
YT_CLIENT_ID
YT_CLIENT_SECRET
YT_REFRESH_TOKEN
TELEGRAM_BOT_TOKEN
TELEGRAM_CHAT_ID
```

## 8. Sinab ko'ring
Repo → **Actions** tab → "AI YouTube Shorts Publisher" → **Run workflow** tugmasi → biroz kuting → yashil ✅ chiqsa, YouTube kanalingizni va Telegram'ni tekshiring.

Shundan keyin hech narsa qilish shart emas — GitHub o'zi har kuni soat 00:00 va 12:00 (Toshkent vaqti) da avtomatik ishga tushiradi.

## Xatolik chiqsa
Actions tab → muvaffaqiyatsiz run'ni oching → qizil qadamni bosing — u aniq qaysi qadam va nima sababdan xato berganini ko'rsatadi (masalan noto'g'ri kalit, ulanmagan Sheet va h.k.). Shu xabarni menga yuboring, birga tuzatamiz.
