# ✦ İLHAM Studio — AI Prodüksiya Ofisi

**İLHAM** real Claude AI agentlərindən ibarət virtual yaradıcı prodüksiya studiyasıdır. Adı "ilham" sözündən gəlir: hər layihə bir ilham qığılcımı ilə başlayır.

Studiya üzən beton maket kimi qurulmuş izometrik 3D ofisdir. Ofisdə axan formalı taxta masalar, ağ LED xətlər, işıqlanan İLHAM loqosu, beton dibçəklərdə palmalar və hologram proyeksiya divarı var. Hər işçinin öz masası, kompüteri və rolu var. Ekranda gördüyünüz hər hərəkət agentin **həqiqi** vəziyyətini əks etdirir. Hologram divarın hərəkəti və rəngləri belə hazırda real işləyən agentlərin sayına bağlıdır.

**Bütün proseslər Azərbaycan dilindədir:** interfeys, statuslar, işçilərin adları və vəzifələri, agentlərin sistem promptları. Agentlərin bütün nəticələri, mesajları, qeydləri və hesabatları da Azərbaycan dilində yazılır.

### Komanda

| İşçi | Vəzifə |
|---|---|
| Leyla Məmmədova | İcraçı Direktor (orkestrator) |
| Orxan Əliyev | Kreativ Direktor |
| Nigar Həsənova | Ssenarist |
| Rauf Quliyev | Baş Operator |
| Aysel Babayeva | Video Montajçı |
| Tural İsmayılov | Kolorist |
| Elvin Rzayev | Səs Dizayneri |
| Günay Hüseynova | Tədqiqatçı |
| Kamran Səfərov | Marketinq Meneceri |
| Səbinə Abbasova | Keyfiyyətə Nəzarət Meneceri |

- Backend: Python, FastAPI, SQLite (PostgreSQL ilə də işləyir), WebSocket, Anthropic Claude API
- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS, Three.js, React Three Fiber

---

## 1. Tələblər (macOS)

| Proqram | Versiya | Quraşdırma |
|---|---|---|
| Python | 3.10 və ya daha yeni | `brew install python@3.12` |
| Node.js | 20 və ya daha yeni | `brew install node` |
| ffmpeg (istəyə bağlı) | istənilən | `brew install ffmpeg` (Montajçı və Koloristin real video emalı üçün) |
| Anthropic API açarı | — | https://console.anthropic.com → **API Keys** |

Homebrew yoxdursa, əvvəlcə onu quraşdırın: https://brew.sh

---

## 2. Quraşdırma

### Sürətli yol (bir əmr)

```bash
cd ai-production-office
./start.sh
```

İlk dəfə işə saldıqda skript bunları edir:
1. `backend/.venv` virtual mühitini yaradır və Python paketlərini quraşdırır.
2. `backend/.env.example` faylını `backend/.env` adı ilə kopyalayır.
3. Frontend paketlərini (`npm install`) quraşdırır.
4. Backendi (http://localhost:8000) və ofisi (http://localhost:3000) işə salır, sonra brauzeri açır.

> İlk işə salmadan sonra `backend/.env` faylına API açarınızı yazın (aşağıya baxın) və `./start.sh` əmrini yenidən icra edin.

Dayandırmaq üçün terminalda `Ctrl + C` basın.

### Əl ilə quraşdırma

```bash
# Backend
cd ai-production-office/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # sonra .env faylını redaktə edin
uvicorn app.main:app --port 8000

# Frontend (yeni terminal pəncərəsində)
cd ai-production-office/frontend
npm install
npm run dev                   # http://localhost:3000
```

---

## 3. Konfiqurasiya (`backend/.env`)

API açarı **yalnız** bu faylda saxlanılır. Fayl `.gitignore` siyahısındadır və heç vaxt git-ə düşmür.

```ini
ANTHROPIC_API_KEY=sk-ant-...        # mütləqdir
AGENT_MODEL=claude-opus-5-5         # agentlərin modeli
AGENT_EFFORT=medium                 # low | medium | high | xhigh | max
DIRECTOR_EFFORT=high                # planlaşdırma və yekun paket üçün
MAX_CONCURRENT_AGENTS=4             # eyni anda işləyən agent sayı
MAX_AGENT_STEPS=12                  # bir tapşırıqda maksimum Claude sorğusu
MAX_REVISIONS=2                     # QC-nin bir tapşırığı neçə dəfə geri qaytara biləcəyi
ENABLE_WEB_SEARCH=true              # Tədqiqatçı üçün veb axtarışı
ENABLE_FALLBACK=true                # model imtina etdikdə ehtiyat modelə keçid
DATABASE_URL=sqlite:///./data/office.db
WORKSPACE_DIR=./workspace           # LUT, media və çıxış faylları
FRONTEND_ORIGIN=http://localhost:3000
```

**Xərcə nəzarət:** `AGENT_EFFORT=low` və `MAX_CONCURRENT_AGENTS=2` dəyərləri xərci azaldır. Bütün xərclər real vaxtda yuxarı paneldəki **API usage** düyməsində görünür.

**PostgreSQL:** `pip install "psycopg[binary]"` əmrini icra edin, sonra bunu yazın:
`DATABASE_URL=postgresql+psycopg://istifadəçi:şifrə@localhost:5432/office`

Frontend başqa ünvanda olan backendə qoşulmalıdırsa, `frontend/.env.local` faylına `NEXT_PUBLIC_API_URL=http://...` yazın.

**Zəif Mac:** ofisi `http://localhost:3000/?quality=low` ünvanında açın. Bu rejim kölgələri və lampa işıqlarını söndürür.

---

## 4. İstifadə

1. **+ Yeni layihə** düyməsini basın və tapşırığı yazın (məsələn, "30 saniyəlik kino üslublu kofe reklamı").
2. **İcraçı Direktor** iclas otağına gedir (status `İCLASDA`) və Claude ilə iş axını qurur: kim nə edəcək, hansı tapşırıq hansından asılıdır.
3. Tapşırıqlar asılılıqlara görə növbəyə düşür. Asılılığı gözləyən işçi masasında `GÖZLƏYİR` statusunda oturur. İşə başlayan agent `DÜŞÜNÜR` / `İŞLƏYİR` statusuna keçir, monitorunda iş görüntüsü axır, başının üstündə canlı çıxış görünür.
4. Bitmiş iş növbəti işçiyə uçan sənəd kimi ötürülür (`handoff`) və **Ünsiyyət** lentində görünür.
5. **Keyfiyyət Nəzarəti** bütün işləri yoxlayır, lazım olsa `request_revision` ilə geri qaytarır. Agent işi yenidən görür, sonra QC təkrar yoxlayır.
6. Direktor yekun paketi tərtib edir. Sol paneldə **Review final package** düyməsi ilə onu təsdiqləyin və ya rəy yazıb rədd edin.

### Sahibin idarə paneli

| Əməliyyat | Harada |
|---|---|
| Layihə yaratmaq və ya ləğv etmək | Yuxarı panel → **+ Yeni layihə**; sol panel → **Layihəni ləğv et** |
| İşçiyə birbaşa tapşırıq vermək | İşçiyə klikləyin → **tapşırıq ver** tabı |
| Agenti dayandırmaq və ya davam etdirmək | İşçi paneli → **Agenti dayandır / Agenti davam etdir** |
| Tapşırığı dayandırmaq, təkrarlamaq, başqasına vermək | Tapşırığa klikləyin → **Tapşırığı dayandır / Yenidən cəhd et / Təyin et** |
| Nəticəni təsdiqləmək və ya rədd etmək | Tapşırıq pəncərəsi → **Təsdiqlə / Rədd et** |
| Yeni işçi qəbul etmək | Yuxarı panel → **+ İşə götür** |
| Rolu, sistem promptunu, alətləri dəyişmək | İşçi paneli → **profil** tabı |
| API istifadəsi və xərclər | Yuxarı panel → **API istifadəsi** (işçi, layihə və model üzrə) |
| İşçiyə mesaj göndərmək | İşçi paneli → **mesajlar** tabı |

### Statusların mənası (hamısı real vəziyyətdən gəlir)

| Status | Nə vaxt | Ofisdə |
|---|---|---|
| BOŞ (IDLE) | Aktiv tapşırığı yoxdur | İstirahət zonasında (divan, kofe barı) |
| GÖZLƏYİR | Tapşırığı var, amma asılılığı və ya boş yer gözləyir | Masada, qolları çarpaz |
| DÜŞÜNÜR | Claude sorğusu gedir, model düşünür | Masada, əli çənəsində |
| İŞLƏYİR | Model cavab yazır və ya alət işlədir | Masada yazır, monitorda iş görüntüsü axır |
| YOXLAYIR | QC yoxlaması və ya Direktorun yekun paketi | Sənəd oxuyur |
| İCLASDA | Planlaşdırma iclası və ya `consult_colleague` ilə canlı görüş | İclas otağında |
| TAMAMLADI | Tapşırığı bitirib, layihə hələ açıqdır | Masada, ekranda yaşıl işarə |
| XƏTA | API və ya tapşırıq xətası | Masada, ekranda qırmızı "!" işarəsi |
| DAYANDIRILIB | Sahib dayandırıb | Yerində donub qalır |

Masa ilə iclas otağı və istirahət zonası arasında yeriş yalnız status dəyişəndə baş verir.

---

## 5. Arxitektura

```
backend/app/
  main.py                 REST API + /ws WebSocket
  config.py, pricing.py   parametrlər, qiymət cədvəli
  db.py                   SQLAlchemy modelləri (Employee, Project, Task, Message, ActivityLog, UsageRecord, MemoryNote)
  events.py               WebSocket yayımı
  seed.py                 10 işçi: hər birinin öz sistem promptu və alətləri
  agents/
    llm.py                Anthropic Messages API (streaming, adaptive thinking, fallback)
    runtime.py            agent dövrü: Claude → alətlər → Claude ... → submit_deliverable
    orchestrator.py       Direktorun planlaşdırması, davamlı tapşırıq növbəsi, QC dövrü, sahib əmrləri
    presence.py           statusun real vəziyyətdən hesablanması
    prompts.py            tapşırıq konteksti (brief, asılılıqların nəticələri, gələn qutu, yaddaş)
  tools/
    registry.py           genişlənən alət sistemi (@tool dekoratoru)
    collaboration.py      read_deliverable, send_message, consult_colleague, save_note, save_artifact, approve_task, request_revision ...
    production.py         web_search, generate_lut (.cube fayl), media_list/probe/process (ffmpeg)
frontend/
  components/office/      3D ofis: layout, mebel, animasiyalı işçilər, sənəd ötürmələri
  components/ui/          tapşırıq lövhəsi, canlı lent, işçi paneli, modallar
  lib/                    zustand store, WebSocket hook, tiplər
```

**Növbə:** tapşırıqlar verilənlər bazasında saxlanılır (`pending → queued → running → completed/failed/cancelled`). Server yenidən başlasa, yarımçıq tapşırıqlar avtomatik olaraq yenidən növbəyə qoyulur. Hər Claude çağırışı token sayı və qiyməti ilə `usage_records` cədvəlinə yazılır.

### Yeni alət əlavə etmək

```python
# backend/app/tools/my_tools.py
from .registry import tool, ToolContext

@tool("render_preview", "Render a preview image...", {"scene": {"type": "string"}}, ["scene"])
async def render_preview(ctx: ToolContext, data: dict):
    ...  # real xidmətə müraciət edin
    return {"ok": True}
```

Bundan sonra `agents/runtime.py` faylında `from ..tools import my_tools` sətrini əlavə edin. Aləti işçiyə vermək üçün UI-da **profile → Tools** bölməsindən seçin.

---

## 6. Testlər

```bash
cd backend
.venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
```

Testlər tam iş axınını yoxlayır: planlaşdırma, asılılıqlar, ötürmələr, QC revizyası, yekun paket, sahib təsdiqi, xəta statusu və pauza. Testlər şəbəkəyə çıxmamaq üçün test faylının içində skriptlənmiş LLM istifadə edir. Tətbiqin özü həmişə real Claude API-ni çağırır.

---

## 7. Məhdudiyyətlər

- Agentlər video **çəkmir** və **yaratmır**. Montajçı və Kolorist yalnız `backend/workspace/media/` qovluğuna qoyduğunuz faylları ffmpeg ilə emal edir (kəsmə, birləşdirmə, LUT tətbiqi, rəng, səs normallaşdırma). Kolorist `.cube` LUT faylı yaradır və onu tapşırıq pəncərəsindən yükləmək olar.
- Veb axtarışı Anthropic server alətidir (1000 axtarış üçün təxminən $10).
- Sahib nəticəni rədd etdikdə yalnız həmin tapşırıq yenidən işlənir. Ondan asılı tapşırıqlar avtomatik təkrarlanmır; lazım olsa onlara **Yenidən cəhd et** basın.

## 8. Problemlərin həlli

| Problem | Həll |
|---|---|
| "ANTHROPIC_API_KEY is not set" | `backend/.env` faylına açarı yazın və backendi yenidən başladın |
| İşçilər `XƏTA` statusundadır | İşçiyə klikləyin → **jurnal** tabında səbəbi oxuyun. Sonra tapşırıqda **Yenidən cəhd et** basın |
| "Rate limited" | `MAX_CONCURRENT_AGENTS` dəyərini azaldın |
| Ofis yüklənmir | Backendin işlədiyini yoxlayın: `curl localhost:8000/api/health` |
| 3D yavaş işləyir | `?quality=low` rejimindən istifadə edin |
| Bazanı sıfırlamaq | Serveri dayandırın və `backend/data/office.db` faylını silin |
