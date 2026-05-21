# Master Edit PDF - All-in-One Full-Stack PDF Workspacegit 

NexusPDF adalah aplikasi web modern, berkinerja tinggi, dan serba guna untuk melakukan manipulasi dokumen PDF secara lengkap. Aplikasi ini mencakup fitur penggabungan (merge), kompresi (compress), pemisahan (split), penghapusan halaman, rotasi, penyuntingan visual penuh (full-featured canvas editor), hingga ekstraksi teks otomatis berbasis kecerdasan buatan (OCR - Optical Character Recognition) secara dinamis.

Fitur
1. PDF Editor Visual (Rich Canvas Editor):
   - Menambahkan kotak teks, coretan kuas beralur mulus (pencil tool), aneka bentuk geometris (persegi, lingkaran, segitiga, garis), hingga gambar eksternal di atas halaman PDF.
   - Dilengkapi fungsi penyesuaian warna (eyedropper/color picker) dan tebal garis.
   - Undo & Redo State History yang diisolasi per halaman untuk kebebasan berkreasi tanpa batas.
   
2. AI-Powered OCR (Optical Character Recognition):
   - Terintegrasi dengan mesin Tesseract.js untuk memindai dokumen hasil scan secara dinamis langsung dari browser.
   - Invisible Text Layer Selection: Menghasilkan lapisan teks transparan yang presisi di atas rendering halaman asli, memungkinkan teks dari PDF gambar/hasil scan untuk bisa diblok, dipilih (selected), dan disalin (copied) secara langsung tanpa merusak tampilan visual dokumen asli.

3. Responsive Side-Panel Tools Drawer:
   - Panel menu instruksi dan alat penyuntingan yang fleksibel serta adaptif.
   - Collapsible/Expandable Sidebar: Sidebar perkakas dapat diciutkan atau ditutup penuh dengan transisi animasi halus untuk memperluas area visualisasi pratinjau (preview PDF) yang sangat berguna bagi perangkat berlayar kecil ataupun pengerjaan dokumen berkepadatan tinggi.

4. Operasi Dokumen Handal (All-in-One Tools):
   - Rotate: Memutar balik orientasi halaman tertentu.
   - Merge: Menggabungkan rentetan file PDF terpisah menjadi satu dokumen padu.
   - Compress: Menyusutkan ukuran dokumen dengan optimalisasi dpi (tersedia tingkat Extreme, Recommended, dan High Quality).
   - Delete: Memotong atau melompati halaman-halaman usang dalam sekejap.
   - Split: Membaca dokumen tebal dan memecahkannya menjadi bagian yang terpisah.

Panduan Instalasi & Menjalankan Aplikasi Secara Lokal

Ikuti petunjuk langkah demi langkah berikut untuk memasang dan menjalankan NexusPDF di komputer lokal Anda:

1. Prasyarat Sistem (Prerequisites)
Pastikan sistem operasi Anda sudah terpasang perkakas pengembangan esensial:
- Node.js (Sangat disarankan Versi 18.x atau 20.x LTS ke atas).
- npm (Manajer paket Node, secara bawaan terinstal bersama Node.js).
- Perangkat penjelajah modern (Google Chrome, Mozilla Firefox, Safari, atau Microsoft Edge versi terbaru).

2. Dapatkan Kode Sumber (Clone/Download)
Klona repositori git ini dengan mengetikkan perintah berikut pada terminal atau Command Prompt Anda:
```bash
git clone <url-repository-github-anda>
cd react-example
```
Atau, jika Anda mengunduh file kompresi `.zip`, silakan mengekstrak file tersebut ke dalam folder lokal, lalu buka direktori hasil ekstrak tersebut lewat terminal Anda.

3. Menginstal Seluruh Dependensi Lengkap
Di dalam direktori utama proyek, jalankan perintah ini untuk memasang semua modul pustaka frontend & backend yang dideklarasikan pada file `package.json`:
```bash
npm install
```
Proses ini akan membuat folder `node_modules` baru berisi konfigurasi React, Vite, Tailwind CSS, pdf-lib, tesseract.js, dan komponen dependensi lainnya.

4. Menjalankan Server Pengembangan (Development Mode)
Untuk memulai server pengembangan lokal dengan fitur autoreload instan:
```bash
npm run dev
```
Setelah server aktif, terminal Anda akan menunjukkan tautan lokal. Buka browser kesayangan Anda dan akses ke:
👉 [http://localhost:3000](http://localhost:3000)

Kini Anda dapat mengujicoba seluruh fitur penyuntingan PDF, OCR, rotasi, penggabungan, dan kompresi secara langsung.

5. Membangun untuk Lingkungan Produksi (Production Build & Start)
Untuk menguji performa maksimal aplikasi dan menghasilkan bundel kode yang paling optimal (terkompresi dan diperkecil ukurannya):

Pertama, bangun dan kompilasi modul frontend serta backend ke folder `/dist`:
```bash
npm run build
```

Kedua, jalankan server produksi mandiri (standalone server) dengan perintah:
```bash
npm run start
```
Aplikasi versi produksi siap melayani Anda di port `3000` dengan efisiensi tinggi dan waktu muat yang jauh lebih cepat.

---

## 📂 Struktur Folder Proyek Utama

Struktur modul dikemas modular demi menjaga kemudahan pemeliharaan kode (maintainability):

```text
├── src/
│   ├── components/
│   │   ├── PdfWorkspace.tsx     # Workspace Editor Canvas & Logika Utama Canvas Fabric.js
│   │   └── ErrorBoundary.tsx    # Komponen pengaman crash UI
│   ├── App.tsx                  # Landing page & penentu pilihan mode operasi (Rotate, Merge, dsb.)
│   ├── index.css                # Konfigurasi Tailwind CSS v4 & custom font styling
│   ├── main.tsx                 # Entry point inisialisasi React Frontend
│   └── types.ts                 # Deklarasi antarmuka/tipe data TypeScript global
├── server.ts                    # Backend Server Express.js dengan Integrasi middleware Vite
├── package.json                 # Konfigurasi skrip eksekusi dan dependensi modul
└── README.md                    # Dokumentasi lengkap sistem
```
# Master-Edit-PDF
Edit PDF Tools
