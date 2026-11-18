# 🕹️ TikTok Arena · Çöp Adam Savaşı

TikTok LIVE yayınını **gerçek zamanlı bir oyuna** çeviren, Node.js + Socket.IO ile
çalışan 16 kişilik çöp adam arena oyunu.

İzleyiciler sohbetten mesaj yazarak veya hediye göndererek arenaya girer. Hediye
miktarı arttıkça daha güçlü yetenekler tetiklenir. Turu kazanan çöp adam bir
sonraki tura **×1.10 güç** ile başlar.

> **Bu proje [Revetaxn](https://github.com/Revetaxn) kanalı için hazırlandı.**
> Varsayılan yayıncı adı `@revetaxn` olarak ayarlıdır; panelden tek tıkla
> değiştirebilirsin. API anahtarı, ek servis veya ücretli abonelik **gerekmez**.

---

## ✨ Özellikler

- 🎮 16 savaşçılı canlı arena, 30 TPS sunucu simülasyonu + 60 FPS canvas
- 💬 Sohbetten otomatik arenaya giriş, konuşma balonları
- 🎁 Hediye → yetenek sistemi (5 / 10 / 50 / 1000 jeton eşikleri)
- 🌹 Gül ile diriliş (ölüyse %55 canla döner)
- 🏆 Tur kazananına kalıcı **×1.10 güç** (×8'e kadar)
- 📺 OBS için temiz overlay modu: `http://localhost:3000/?overlay=1`
- 🔄 Yeni yayına bağlanınca arena otomatik sıfırlanır (eski izleyiciler taşınmaz)
- 🧪 TikTok bağlantısı olmadan demo akışıyla test
- 🇹🇷 Türkçe arayüz ve panel
- 🔑 **API anahtarı / Euler Stream gerekmez** — sadece `@kullanıcıadı` yaz, yayın açıksa bağlanır

---

## 🚀 Kurulum (Windows · tek tıkla)

Tek ihtiyacın **Node.js**. Başka hiçbir şey kurmana gerek yok.

1. **Node.js 20 veya üzerini kur:** <https://nodejs.org>
   (Kurulumda "Add to PATH" seçeneğini işaretle, sonra bilgisayarı yeniden başlat.)
2. Bu repoyu indir: yeşil **Code** düğmesi → **Download ZIP** → ZIP'i bir klasöre çıkar.
   (Git kullanıyorsan: `git clone https://github.com/Revetaxn/Tiktok-Oyun.git`)
3. Klasördeki **`setup.bat`** dosyasına **çift tıkla**.
   Gerekli paketler kurulur, `.env` dosyası otomatik oluşturulur.
4. **`start.bat`** dosyasına **çift tıkla**.
   Sunucu başlar ve tarayıcıda <http://localhost:3000> otomatik açılır.

> **Notlar**
> - `start.bat` zaten çalışan bir sunucu görürse yenisini başlatmaz, doğrudan
>   tarayıcıyı açar.
> - Oyunu kapatmak için açılan siyah pencereyi kapatman yeterli.
> - Windows "bilinmeyen yayıncı" uyarısı verirse **Daha fazla bilgi → Yine de çalıştır**
>   seçebilirsin; dosyalar açık kaynak ve metin tabanlıdır.

### Manuel kurulum (Windows / macOS / Linux)

```powershell
npm install
copy .env.example .env      # macOS/Linux: cp .env.example .env
npm start
```

Gereksinim: **Node.js 20+**

---

## 🔗 TikTok'a Bağlanma (API anahtarı gerekmez)

1. TikTok hesabınla **canlı yayın aç**.
2. Tarayıcıda <http://localhost:3000> adresini aç.
3. Sağ üstteki **⚙️** → **Bağlantı** sekmesi.
4. Kullanıcı adını yaz (`@revetaxn` veya `revetaxn`) ve **Bağlan**'a bas.
5. Yayın açıksa birkaç saniye içinde izleyiciler, sohbetler, beğeniler ve hediyeler
   oyuna akmaya başlar. Demo akışı otomatik olarak durur.

Alternatif olarak `.env` dosyasında otomatik bağlantı:

```env
AUTO_CONNECT=1
TIKTOK_USERNAME=revetaxn
```

veya doğrudan bağlantı linkiyle aç:

```
http://localhost:3000/?connect=revetaxn
```

> **Önemli:** Bağlantı için tek gereken hesabın **canlı yayında** olması.
> Yayın kapalıysa panel "yayıncı canlı yayında değil" uyarısı verir; demo akışıyla
> test etmeye devam edebilirsin. `EULER_API_KEY` **normalde gerekmez**, yalnızca TikTok
> ek imza isterse isteğe bağlı doldurulur.

---

## 🎮 Nasıl Oynanır?

| Olay | Sonuç |
| --- | --- |
| Sohbete mesaj yazmak | Oyuncu arenaya girer |
| Hediye göndermek | Oyuncu arenaya girer + yetenek tetiklenir |
| 🌹 Gül göndermek | Elendiyse %55 canla dirilir, yaşıyorsa can yeniler |
| Turu kazanmak | Kalıcı **×1.10 güç** (ayarlardan değiştirilebilir) |

- Her savaşçı 180 canla başlar, yakın dövüş 6–9 hasar verir.
- Tur 90 saniye veya tek savaşçı kalana kadar sürer; son 48 saniyede hasarlar artar.
- Arena dolarsa yeni oyuncular bir sonraki tura sıraya alınır.
- Sohbet mesajları çöp adamın üstünde 6 saniye balon olarak görünür.

---

## 🎁 Hediye → Yetenek Tablosu

Eşikler jeton (coin) üzerinden çalışır; jeton yoksa elmas sayısı kullanılır.
Tüm eşikler panelden değiştirilebilir.

| Hediye (jeton) | Yetenek | Etki |
| --- | --- | --- |
| 1–4 | 👊 Düz Vuruş | Tek hedefe 22 hasar |
| 5–9 | 💎 Elmas Vuruş | Tek hedefe 38 hasar |
| 10–49 | ⚡ Yıldırım | Ana hedefe 52, yakındaki 2 hedefe 22 hasar |
| 50–999 | ☄️ Meteor | Alan hasarı 68, ekran sarsıntısı |
| 1000+ | 🦁 Titan Modu | Kalıcı ×1.40 güç + 85 alan hasarı |
| 🌹 Gül / diriliş hediyesi | 🌹 Diriliş | Ölüyse %55 canla döner, yaşıyorsa %22 can yeniler |

Varsayılan diriliş hediyeleri: `rose, gül, gul, tiktok, tik tok`.

---

## 📺 OBS Kurulumu

1. OBS'de yeni bir **Tarayıcı (Browser)** kaynağı ekle.
2. URL: `http://localhost:3000/?overlay=1`
3. Genişlik **1920**, yükseklik **1080**.
4. "Yayın açıldığında sayfayı yenile" seçeneğini işaretle.
5. Ses için tarayıcı kaynağında **"OBS ile sesi kontrol et"** seçeneğini aç.

Overlay modunda bağlan/ayar düğmeleri gizlenir; arena, canlı akış, sıralamalar ve
yetenek paneli görünür kalır.

---

## ⚙️ Yayın Kontrol Paneli

Sağ üstteki **⚙️** düğmesi dört sekme açar:

1. **Bağlantı** — TikTok kullanıcı adı, bağlan/kes, durum yenile, demo aç/kapat.
2. **Oyun Ayarları** — tur süresi, ara süresi, savaşçı sayısı, kazanan güç çarpanı,
   hediye eşikleri, diriliş hediyeleri. Değişiklikler `data/settings.json` dosyasına
   kaydedilir.
3. **Test** — sohbet/hediye simüle ederek yetenekleri anında dene, oyunu sıfırla.
4. **Nasıl Oynanır** — kısa kurallar.

---

## 🌐 HTTP API (isteğe bağlı)

| Metot | Yol | Açıklama |
| --- | --- | --- |
| `GET` | `/api/status` | Bağlantı, ayarlar ve anlık oyun özeti |
| `POST` | `/api/connect` | `{ "username": "revetaxn" }` ile bağlan |
| `POST` | `/api/disconnect` | TikTok bağlantısını kes |
| `POST` | `/api/demo` | `{ "enabled": true/false }` demo akışı |
| `POST` | `/api/settings` | Ayar güncelle (kısmi gönderim destekler) |
| `POST` | `/api/test/chat` | `{ "nickname": "Ali", "text": "selam" }` |
| `POST` | `/api/test/gift` | `{ "nickname": "Ali", "gift": "Meteor", "coins": 50 }` |
| `POST` | `/api/reset` | İstatistikleri ve turu sıfırla |

```powershell
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/test/gift `
  -ContentType "application/json" `
  -Body '{"nickname":"Test","gift":"Meteor","coins":50}'
```

---

## 📁 Proje Yapısı

```
server.js                 Express + Socket.IO sunucusu, API ve oyun döngüsü
src/config.js             Ayar okuma/yazma (data/settings.json)
src/tiktok.js             TikTok LIVE bağlantı yöneticisi (API anahtarı gerekmez)
src/demo.js               Sahte sohbet/hediye akışı
src/game/engine.js        Arena simülasyonu, turlar, hediyeler, yetenekler
src/game/abilities.js     Hediye → yetenek tablosu ve eşikler
src/game/bots.js          Bot isimleri ve sohbet replikleri
src/game/util.js          Yardımcı fonksiyonlar
public/index.html         HUD ve yayın kontrol paneli
public/styles.css         Arayüz stilleri (overlay/responsive dahil)
public/js/render.js       Canvas arena, çöp adamlar ve efektler
public/js/ui.js           DOM bağlantıları, akış, sıralamalar, panel
public/js/main.js         Socket.IO bağlantısı ve başlatma
public/js/sound.js        WebAudio ses efektleri
setup.bat / start.bat     Windows için tek tıkla kurulum ve başlatma
```

---

## 🛠️ Sorun Giderme

- **`setup.bat` / `start.bat` hemen kapanıyor** — Node.js kurulu değil. Node.js 20+
  kurup bilgisayarı yeniden başlat, sonra tekrar dene.
- **"Sunucuya bağlanılamadı"** — 3000 portu dolu olabilir:
  `Get-NetTCPConnection -LocalPort 3000`
- **TikTok bağlantısı kurulmuyor** — hesap gerçekten canlı yayında mı? Kullanıcı adını
  `@` ile veya `@` olmadan yazabilirsin. Bağlantı denemesi ~25 saniye sürebilir.
- **"Yayıncı canlı yayında değil"** — yayını açtıktan sonra **Durumu Yenile** veya
  **Bağlan** ile tekrar dene.
- **Hediye yeteneği tetiklenmiyor** — hediye jeton değeri TikTok tarafından
  gönderilmiyor olabilir; eşikleri panelden düşür veya Test sekmesinden dene.
- **OBS'de ses yok** — tarayıcı kaynağında "OBS ile sesi kontrol et" açık olmalı,
  ayrıca panele bir kez tıklayarak ses iznini tetikle.
- **Ayarlar eski kaldı** — `data/settings.json` dosyasını silip sunucuyu yeniden başlat.

---

## 📄 Lisans

[MIT](LICENSE) © Revetaxn

> Bu proje TikTok'un resmî bir ürünü değildir, ByteDance Ltd. ile bağlantılı değildir.
> `tiktok-live-connector` tersine mühendislikle geliştirilmiş resmî olmayan bir
> kütüphanedir; TikTok tarafındaki değişikliklerden etkilenebilir.
