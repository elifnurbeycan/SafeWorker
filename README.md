# 🛡️ SafeWorker
> **İş Sağlığı ve Güvenliği İçin Mobil Risk Algılama ve Takip Platformu**

SafeWorker; saha çalışanlarının mobil cihazlarını birer IoT uç noktası olarak kullanarak anlık ivmeölçer, jiroskop, konum, pil ve bağlantı verilerini analiz eden, olası riskleri (düşme, sert darbe, hareketsizlik, tehlikeli alana giriş) tespit edip yöneticilere gerçek zamanlı bildiren yerli bir İSG (İş Sağlığı ve Güvenliği) platformu MVP'sidir.

---

## 🔒 Yerel Ağ (LAN) Mimarisi ve Veri Güvenliği

SafeWorker, endüstriyel iş güvenliği ve veri gizliliği politikaları doğrultusunda **Yerel Ağ (LAN)** mimarisinde çalışacak şekilde tasarlanmıştır:
* **Veri Güvenliği:** Çalışanların anlık konum ve sensör verileri gibi hassas telemetry verilerinin şirket dışı genel bulut sunucularına çıkışı engellenerek yerel ağ sınırları içerisinde kalması sağlanmıştır.
* **Cihazlar Arası Erişim:** Web Dashboard, Backend sunucu ve Flutter Mobil uygulamasının birbiriyle haberleşebilmesi için **aynı yerel ağa (Wi-Fi)** bağlı olması gerekmektedir.
* **Mobil IP Yapılandırması:** Mobil uygulamanın backend API'sine erişebilmesi için `mobile/lib/config/api_config.dart` dosyasındaki `backendHost` değeri, backend sunucusunun yerel IPv4 adresi (örneğin `10.73.174.27`) ile güncellenmelidir.
* **Erişim Adresleri:** Bu yerel güvenlik mimarisinden ötürü `localhost` üzerinden verilen bağlantılar (örn. `http://localhost:3000`) sadece sunucu makinede çalışacaktır. Diğer yerel cihazlardan erişmek için `localhost` yerine sunucunun yerel IP adresi (örn. `http://10.73.174.27:3000`) kullanılmalıdır.

---

## 📌 Proje Mimarisi ve Tasarım Şemaları

Sistemin modüler yapısı, istemci ve sunucu arasındaki veri akışını yerel ağ üzerinde optimize edecek şekilde tasarlanmıştır.

### 🏛️ Genel Sistem Mimarisi
```
┌─────────────────────────┐        ┌───────────────────────────────┐
│   Flutter Mobile App    │◄──────►│    React Admin Dashboard      │
│  (Sensör & Konum Ucu)   │        │     (Gerçek Zamanlı İzleme)   │
└────────────┬────────────┘        └───────────────┬───────────────┘
             │                                     │
             │ REST API / WebSocket (Socket.io)    │ REST / WebSockets
             ▼                                     ▼
┌──────────────────────────────────────────────────────────────────┐
│                   Node.js Express API Gateway                    │
└────────────────────────────────┬─────────────────────────────────┘
                                 │ Mongoose ODM
                                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                         MongoDB Database                         │
└──────────────────────────────────────────────────────────────────┘
```

### 📊 Süreç ve Veri Akış Şemaları
Projenin analiz, tasarım ve akış diyagramlarına aşağıdaki bağlantılardan veya proje dizininden ulaşabilirsiniz:
* 🗺️ **[SafeWorker Sistem Mimarisi](<Proje ekran görüntüleri/Proje ekran görüntüleri/SafeWorker Sistem Mimarisi.png>)**
* 🔄 **[Sequence (Ardışıllık) Diyagramı](<Proje ekran görüntüleri/Proje ekran görüntüleri/Sequence Diyagramı.png>)**
* 🗃️ **[Veri Tabanı (ER) Diyagramı](<Proje ekran görüntüleri/Proje ekran görüntüleri/ER _ Veri Tabanı Diyagramı.png>)**
* 🌊 **[DFD Seviye 0 Veri Akış Diyagramı](<Proje ekran görüntüleri/Proje ekran görüntüleri/SafeWorker DFD Seviye 0 Genel Veri Akış Diyagramı.png>)**
* ⚡ **[Risk Analiz Algoritması Akış Diyagramı](<Proje ekran görüntüleri/Proje ekran görüntüleri/Risk Analiz Akış Diyagramı.png>)**

---

## 🚀 Temel Özellikler

### 📱 Mobil Uygulama (Flutter - Çalışan Ekranı)
* **Canlı Harita Görünümü:** Çalışanın kendi konumunu ve sahadaki aktif durumunu harita üzerinden takip edebilmesi.
* **Canlı Sensör Akışı:** İvmeölçer ve jiroskop verilerinin arka planda işlenmesi.
* **Akıllı Risk Analizi:** Sert darbe (`HARD_IMPACT`) ve düşme şüphesi (`FALL_RISK`) tespiti.
* **Geofencing & QR Kod:** Sahadaki riskli bölgelere (`DANGER_ZONE`) QR okutarak giriş ve otomatik takip sistemi.
* **Manuel SOS Tetikleme:** Çalışanın tek dokunuşla acil durum alarmı oluşturması.
* **Güç & Bağlantı Takibi:** Düşük pil seviyesi ve internet bağlantı kaybı durumlarının takibi.

### 💻 Yönetici Paneli (React & Vite - Dashboard)
* **Canlı Çalışan Takip Listesi:** Yöneticilerin, sahada vardiyası açık olan çalışanları anlık durumlarıyla izleyebilmesi.
* **Gerçek Zamanlı Alarm Paneli:** Socket.io ile sayfa yenilenmeden düşen SOS ve İSG alarmları.
* **Sesli Alarm Desteği:** Kritik ve SOS alarmlarında yöneticileri uyaran sesli alarm sistemi.
* **Gelişmiş Filtreleme:** Aktif, çözülen, kritik seviye ve SOS alarmlarına göre anlık süzme.
* **Raporlama:** Tüm alarm geçmişinin Excel uyumlu `CSV` formatında dışa aktarılması.

### ⚙️ Backend Servisleri (Node.js & Express)
* **Eşik Tabanlı Risk Puanlama:** Sensör anomalisine göre dinamik risk puanı (0-100) hesaplama.
* **Swagger/OpenAPI:** Tamamen dokümante edilmiş standart REST API yapısı.
* **Veri Kalıcılığı:** MongoDB NoSQL veritabanı ile yüksek hızlı yazma/okuma performansı.

---

## 📸 Proje Ekran Görüntüleri

### 💻 Yönetim Paneli (Admin Dashboard)

| Dashboard Genel Görünüm | Çalışan Takibi & Son Durum |
| :---: | :---: |
| ![Genel Görünüm](<Proje ekran görüntüleri/Proje ekran görüntüleri/Admin Dashboard Genel Görünüm Ekranı.jpg>) | ![Çalışan Takibi](<Proje ekran görüntüleri/Proje ekran görüntüleri/Çalışan Takibi Ekranı.jpg>) |
| *Grafikler, İstatistikler ve Aktif Çalışanlar* | *Aktif Çalışan Listesi ve Detaylar* |

| Alarm Listesi ve Filtreleme |
| :---: |
| ![Alarm Filtreleme](<Proje ekran görüntüleri/Proje ekran görüntüleri/Alarm Listesi ve Filtreleme Ekranı.jpg>) |
| *Sesli Alarm Bildirimleri ve CSV Dışa Aktarma* |

### 📱 Mobil Uygulama (Worker Mobile App)

| Mobil Giriş Ekranı | Vardiya Başlatma | Harita Konum Görünümü |
| :---: | :---: | :---: |
| ![Giriş](<Proje ekran görüntüleri/Proje ekran görüntüleri/Worker Mobil Giriş Ekranı.jpg>) | ![Vardiya](<Proje ekran görüntüleri/Proje ekran görüntüleri/Worker Vardiya Başlatma Ekranı.jpg>) | ![Harita Görünümü](<Proje ekran görüntüleri/Proje ekran görüntüleri/Harita.jpg>) |
| *Güvenli Çalışan Girişi* | *Konum Destekli Vardiya Başlatma* | *Çalışan Harita Konum Takibi* |

| Tehlikeli Bölge Girişi | Acil SOS Gönderimi |
| :---: | :---: |
| ![QR Giriş](<Proje ekran görüntüleri/Proje ekran görüntüleri/QR Tehlikeli Bölge Girişi Ekranı.jpg>) | ![SOS Bildirimi](<Proje ekran görüntüleri/Proje ekran görüntüleri/SOS Bildirimi Ekranı.jpg>) |
| *Bölge Risk Durumu Sorgulama* | *Tek Tuşla Acil SOS Bildirimi* |

---

## 🛠️ Hızlı Kurulum ve Başlatma

Proje Docker Compose desteği sayesinde tek bir komutla ayağa kaldırılabilir veya bileşenler yerel olarak kurulabilir.

### 🐳 A. Docker ile Çalıştırma (Önerilen)
Sistemde Docker Desktop yüklü olduğundan emin olduktan sonra ana dizinde çalıştırın:

```bash
# Servisleri derle ve arka planda başlat
docker compose up --build -d

# Veritabanı başlangıç verilerini (seed) yükle
docker compose exec backend npm run seed
```
* **Dashboard:** http://localhost:5173 (Sunucuda) veya http://<sunucu-ip>:5173
* **Backend API / Swagger:** http://localhost:3000/api-docs veya http://<sunucu-ip>:3000/api-docs

---

### 💻 B. Yerel Kurulum (Geliştirici Ortamı)

#### 1. Veritabanı ve Sunucu (Backend)
```bash
cd backend
npm install
cp .env.example .env
npm run seed  # Örnek kullanıcı ve cihazları yükler
npm run dev   # Geliştirici modunda başlatır
```

#### 2. Yönetici Paneli (Dashboard)
```bash
cd dashboard
npm install
npm run dev
```

#### 3. Mobil Uygulama (Mobile)
```bash
cd mobile
flutter pub get
flutter run
```

---

## 📝 Test Kullanıcıları
Sistemi test etmek için veritabanı seed işlemi sonrasında aşağıdaki hesapları kullanabilirsiniz:

* **Yönetici (Admin):**
  * E-posta: `admin@safeworker.com`
  * Şifre: `123456`
* **Çalışan (Worker):**
  * E-posta: `worker@safeworker.com`
  * Şifre: `123456`

---

## 📄 Proje Raporu
Projenin akademik detaylarına, yazılım gereksinim analizi ve mimari kararlarına aşağıdaki dosyadan ulaşabilirsiniz:
* 📘 **[Grup 5 - SafeWorker Proje Raporu.pdf](<Grup5_SafeWorker_NodeJSileWebTabanlıProgramlama.pdf>)**

---

## 👥 Geliştirici Ekibi (Grup 5)

* **Elif Nur Beycan**
* **Kübra Kaya**
* **Fatma Nur Yazıcı**
* **Nermin Baycan**

---
*Bu proje, Node.js ile Web Tabanlı Programlama dersi kapsamında bir MVP (Minimum Viable Product) prototipi olarak geliştirilmiştir.*

