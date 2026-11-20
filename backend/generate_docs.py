import sys
from docx import Document
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml import OxmlElement, parse_xml
from docx.oxml.ns import nsdecls, qn

def set_cell_background(cell, fill_hex):
    tcPr = cell._tc.get_or_add_tcPr()
    shd = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{fill_hex}"/>')
    tcPr.append(shd)

def set_cell_margins(cell, top=100, bottom=100, left=150, right=150):
    tcPr = cell._tc.get_or_add_tcPr()
    tcMar = parse_xml(f'<w:tcMar {nsdecls("w")}><w:top w:w="{top}" w:type="dxa"/><w:bottom w:w="{bottom}" w:type="dxa"/><w:left w:w="{left}" w:type="dxa"/><w:right w:w="{right}" w:type="dxa"/></w:tcMar>')
    tcPr.append(tcMar)

def create_doc():
    doc = Document()

    # Set Margins (Normal 1 inch)
    for section in doc.sections:
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)

    # Styles
    normal_style = doc.styles['Normal']
    normal_style.font.name = 'Calibri'
    normal_style.font.size = Pt(11)
    normal_style.font.color.rgb = RGBColor(0x33, 0x33, 0x33)

    # Colors
    PRIMARY_COLOR = RGBColor(0x1E, 0x3A, 0x8A) # Deep Blue
    SECONDARY_COLOR = RGBColor(0x25, 0x63, 0xEB) # Bright Blue
    MUTED_COLOR = RGBColor(0x64, 0x74, 0x8B) # Slate Gray
    DARK_TEXT = RGBColor(0x0F, 0x17, 0x2A)

    # Title
    p_title = doc.add_paragraph()
    p_title.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_title.paragraph_format.space_before = Pt(0)
    p_title.paragraph_format.space_after = Pt(4)
    run_title = p_title.add_run("PANDUAN & DOKUMENTASI MENU APLIKASI")
    run_title.font.size = Pt(20)
    run_title.font.bold = True
    run_title.font.color.rgb = PRIMARY_COLOR

    # Subtitle
    p_sub = doc.add_paragraph()
    p_sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_sub.paragraph_format.space_after = Pt(2)
    run_sub = p_sub.add_run("Sistem Prediksi Arah Pergerakan Saham Sektor Perbankan BEI Berbasis Machine Learning")
    run_sub.font.size = Pt(13)
    run_sub.font.bold = True
    run_sub.font.color.rgb = SECONDARY_COLOR

    # Meta
    p_meta = doc.add_paragraph()
    p_meta.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p_meta.paragraph_format.space_after = Pt(24)
    run_meta = p_meta.add_run("Aplikasi: StockPredict (Web & Android APK) | Keperluan: Laporan & Sidang Tugas Akhir")
    run_meta.font.size = Pt(10)
    run_meta.font.italic = True
    run_meta.font.color.rgb = MUTED_COLOR

    # Divider Box / Summary Card
    table_box = doc.add_table(rows=1, cols=1)
    table_box.alignment = WD_TABLE_ALIGNMENT.CENTER
    cell_box = table_box.cell(0, 0)
    cell_box.width = Inches(6.5)
    set_cell_background(cell_box, "F1F5F9")
    set_cell_margins(cell_box, top=140, bottom=140, left=180, right=180)

    p_box = cell_box.paragraphs[0]
    p_box.paragraph_format.space_after = Pt(4)
    r_bh = p_box.add_run("📌 RINGKASAN SPESIFIKASI SISTEM\n")
    r_bh.bold = True
    r_bh.font.size = Pt(11)
    r_bh.font.color.rgb = PRIMARY_COLOR

    r_bc = p_box.add_run(
        "• Saham Sasaran: 5 Bank Terbesar Bursa Efek Indonesia (BBCA, BBRI, BMRI, BBNI, BRIS).\n"
        "• Algoritma Machine Learning: Random Forest (Model Utama), Decision Tree, dan Logistic Regression.\n"
        "• Target Prediksi: Klasifikasi Biner Arah Pergerakan Harga (1 = NAIK, 0 = STAGNAN/TURUN untuk Hari T+1).\n"
        "• Sumber Data: Yahoo Finance API (Data Historis 10 Tahun + Real-Time Sync otomatis setiap hari pukul 16:30 WIB).\n"
        "• Platform: Web Single Page Application (SPA) & Mobile Android (APK)."
    )
    r_bc.font.size = Pt(10)
    r_bc.font.color.rgb = DARK_TEXT

    doc.add_paragraph().paragraph_format.space_after = Pt(12)

    # Section 1 Heading
    def add_section_header(title):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(16)
        p.paragraph_format.space_after = Pt(6)
        r = p.add_run(title)
        r.font.size = Pt(14)
        r.font.bold = True
        r.font.color.rgb = PRIMARY_COLOR

    # Menu Heading
    def add_menu_header(menu_name, badge_text=None):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(10)
        p.paragraph_format.space_after = Pt(4)
        r = p.add_run(menu_name)
        r.font.size = Pt(12)
        r.font.bold = True
        r.font.color.rgb = SECONDARY_COLOR
        if badge_text:
            rb = p.add_run(f"  [{badge_text}]")
            rb.font.size = Pt(9)
            rb.font.bold = True
            rb.font.color.rgb = RGBColor(0x05, 0x96, 0x69)

    def add_bullets(items):
        for bold_prefix, text in items:
            p = doc.add_paragraph(style='List Bullet')
            p.paragraph_format.space_before = Pt(0)
            p.paragraph_format.space_after = Pt(3)
            r_bold = p.add_run(bold_prefix + ": ")
            r_bold.bold = True
            r_bold.font.color.rgb = DARK_TEXT
            r_text = p.add_run(text)
            r_text.font.color.rgb = DARK_TEXT

    # ========================================================
    # KELOMPOK 1
    # ========================================================
    add_section_header("KELOMPOK I: MENU UTAMA (OPERASIONAL & INVESTASI)")

    # 1. Dashboard
    add_menu_header("1. Menu: Dashboard", "Ikhtisar Pasar")
    p1 = doc.add_paragraph()
    p1.paragraph_format.space_after = Pt(4)
    p1.add_run("Berfungsi sebagai halaman ikhtisar ringkas (executive summary) yang menampilkan status pasar dan rangkuman sinyal terkini dari seluruh saham perbankan secara terpadu.")
    add_bullets([
        ("Market Snapshot Cards", "Menampilkan status 5 emiten perbankan meliputi harga penutupan terakhir, persentase naik/turun harian, dan sinyal kesepakatan model."),
        ("Top Performer", "Menyorot saham dengan tingkat keyakinan probabilitas kenaikan tertinggi pada hari perdagangan aktif."),
        ("Grafik Tren Pasar", "Visualisasi grafik garis mini yang menunjukkan tren agregat harga kelima saham perbankan."),
        ("Indikator Jam Bursa", "Status operasional bursa BEI secara otomatis (Buka: Senin-Jumat 09:00-16:00 WIB, Tutup: di luar jam tersebut atau akhir pekan).")
    ])

    # 2. Prediksi Saham
    add_menu_header("2. Menu: Prediksi Saham", "Fitur Utama / Live")
    p2 = doc.add_paragraph()
    p2.paragraph_format.space_after = Pt(4)
    p2.add_run("Pusat fungsi utama aplikasi yang bertugas memprediksi arah pergerakan harga saham untuk satu hari bursa ke depan (T+1) dengan membandingkan tiga algoritma machine learning.")
    add_bullets([
        ("Tombol '⚡ Prediksi Sekarang'", "Menarik data penutupan terkini dari Yahoo Finance secara real-time dan langsung melakukan komputasi prediksi saat itu juga tanpa jeda."),
        ("Komparasi 3 Algoritma", "Menampilkan kartu sinyal NAIK (hijau) atau STAGNAN/TURUN (merah) beserta confidence probability dari Random Forest, Decision Tree, dan Logistic Regression."),
        ("Riwayat Prediksi & Filter Tanggal", "Daftar rekam jejak hasil prediksi masa lalu yang dilengkapi filter tanggal (Datepicker) serta verifikasi label aktual (✓ Benar / ✕ Salah) setelah harga riil terbentuk di bursa."),
        ("Running Accuracy Chart", "Grafik akurasi kumulatif yang menunjukkan konsistensi ketepatan model seiring bertambahnya data harian.")
    ])

    # 3. Data Saham
    add_menu_header("3. Menu: Data Saham (Stocks)", "Data Historis")
    p3 = doc.add_paragraph()
    p3.paragraph_format.space_after = Pt(4)
    p3.add_run("Menyajikan data historis harga saham lengkap (OHLCV: Open, High, Low, Close, Volume) selama rentang 10 tahun terakhir untuk keperluan visualisasi dan audit data.")
    add_bullets([
        ("Interactive Candlestick / Line Chart", "Grafik interaktif yang dapat diatur rentang waktunya (1 Bulan, 3 Bulan, 6 Bulan, 1 Tahun, hingga Keseluruhan Data)."),
        ("Statistik Finansial Emiten", "Informasi acuan investasi seperti 52-Week High, 52-Week Low, dan volume perdagangan rata-rata."),
        ("Tabel OHLCV", "Tabel rincian angka harian yang tersimpan di basis data SQLite lokal.")
    ])

    # 4. Backtesting
    add_menu_header("4. Menu: Backtesting", "Validasi Finansial")
    p4 = doc.add_paragraph()
    p4.paragraph_format.space_after = Pt(4)
    p4.add_run("Fasilitas pembuktian kehandalan model dengan mensimulasikan hasil strategi transaksi jika sinyal model machine learning diterapkan pada data riwayat masa lalu.")
    add_bullets([
        ("Simulasi Hasil Trading", "Perbandingan return strategi model terhadap strategi pasif Buy & Hold."),
        ("Win Rate (%)", "Persentase frekuensi sinyal prediksi yang sukses menghasilkan profit."),
        ("Maximum Drawdown & Profit Factor", "Analisis manajemen risiko untuk mengukur penurunan modal terdalam selama periode pengujian."),
        ("Confusion Matrix Backtest", "Rincian matriks evaluasi True Positive, False Positive, True Negative, dan False Negative.")
    ])

    # ========================================================
    # KELOMPOK 2
    # ========================================================
    add_section_header("KELOMPOK II: ANALISIS & RISET MACHINE LEARNING")

    # 5. Indikator Teknikal
    add_menu_header("5. Menu: Indikator Teknikal", "Feature Engineering")
    p5 = doc.add_paragraph()
    p5.paragraph_format.space_after = Pt(4)
    p5.add_run("Membedah dan memvisualisasikan 13 variabel indikator teknikal matematis yang digunakan sebagai input feature engineering sebelum dimasukkan ke dalam model ML.")
    add_bullets([
        ("Indikator Momentum", "RSI (Relative Strength Index 14) untuk area jenuh beli/jual serta Stochastic Oscillator (%K, %D)."),
        ("Indikator Tren", "MACD (Moving Average Convergence Divergence) line, signal, histogram, serta SMA 20, SMA 50, dan EMA 20."),
        ("Indikator Volatilitas", "Bollinger Bands (Upper, Middle, Lower Band) dan Average True Range (ATR 14)."),
        ("Indikator Volume", "On-Balance Volume (OBV) untuk mengukur kekuatan aliran dana beli dan jual.")
    ])

    # 6. Eksperimen ML
    add_menu_header("6. Menu: Eksperimen ML", "Evaluasi Model")
    p6 = doc.add_paragraph()
    p6.paragraph_format.space_after = Pt(4)
    p6.add_run("Halaman riset data science untuk mengevaluasi metrik keilmuan model machine learning serta melakukan pelatihan ulang (re-training).")
    add_bullets([
        ("Leaderboard Metrik Ilmiah", "Tabel perbandingan performa model berdasarkan standar baku: Akurasi, Presisi, Recall, F1-Score, dan ROC-AUC."),
        ("Feature Importance Ranking", "Grafik batang yang menunjukkan kontribusi bobot terbesar masing-masing indikator dalam menghasilkan keputusan prediksi."),
        ("Manajemen Model Aktif", "Fitur untuk mengaktifkan model terbaik dari hasil eksperimen ke lingkungan produksi."),
        ("Pelatihan Ulang (Re-training)", "Form pemicu pelatihan model baru dengan parameter kustom atau Hyperparameter Grid Search.")
    ])

    # ========================================================
    # KELOMPOK 3
    # ========================================================
    add_section_header("KELOMPOK III: SISTEM & PENGATURAN")

    # 7. Admin Panel
    add_menu_header("7. Menu: Admin Panel", "Administrasi & Konfigurasi")
    p7 = doc.add_paragraph()
    p7.paragraph_format.space_after = Pt(4)
    p7.add_run("Pusat kendali operasional sistem dan konfigurasi koneksi jaringan. Dilindungi dengan otentikasi login JWT (Username: admin | Password: stockpredict2024).")
    add_bullets([
        ("Pengaturan IP Server (Khusus HP / APK)", "Kolom konfigurasi alamat IP Host Laptop (contoh: 192.168.1.16). Memungkinkan aplikasi APK Android tetap dapat berkomunikasi dengan backend saat berpindah jaringan WiFi tanpa perlu re-compile APK."),
        ("Health Check API Endpoints", "Fitur uji responsivitas koneksi dan pemantauan latensi waktu respon (ms) dari seluruh endpoint backend."),
        ("Background Scheduler Monitoring", "Pemantauan background scheduler otomatis (APScheduler) yang berjalan setiap hari bursa pukul 16:30 WIB.")
    ])

    # ========================================================
    # TABEL RINGKASAN
    # ========================================================
    add_section_header("TABEL MATRIKS RINGKASAN MENU")

    table = doc.add_table(rows=8, cols=3)
    table.alignment = WD_TABLE_ALIGNMENT.CENTER
    headers = ["Nama Menu", "Pilar Kategori", "Fungsi Utama bagi Pengguna"]
    col_widths = [Inches(1.8), Inches(1.5), Inches(3.2)]

    # Header Row
    hdr_cells = table.rows[0].cells
    for i, title in enumerate(headers):
        hdr_cells[i].text = title
        hdr_cells[i].width = col_widths[i]
        set_cell_background(hdr_cells[i], "1E3A8A")
        p = hdr_cells[i].paragraphs[0]
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        for r in p.runs:
            r.font.bold = True
            r.font.color.rgb = RGBColor(0xFF, 0xFF, 0xFF)
            r.font.size = Pt(10)

    # Data Rows
    rows_data = [
        ("Dashboard", "Operasional", "Rangkuman tren pasar, status sinyal 5 bank, dan jam operasional BEI."),
        ("Prediksi Saham (Live)", "Operasional", "Prediksi arah harga esok hari (T+1), perbandingan 3 model ML, & riwayat akurasi."),
        ("Data Saham", "Operasional", "Grafik historis OHLCV interaktif dan statistik harga 10 tahun terakhir."),
        ("Backtesting", "Operasional", "Simulasi profitabilitas transaksi masa lampau dan kalkulasi Win Rate (%)."),
        ("Indikator Teknikal", "Riset Analisis", "Visualisasi 13 fitur teknikal matematis (RSI, MACD, Bollinger Bands, dll)."),
        ("Eksperimen ML", "Riset Analisis", "Evaluasi metrik ilmiah (Akurasi, F1, ROC-AUC) dan feature importance."),
        ("Admin Panel", "Sistem", "Pengaturan IP server mobile, health check backend, & login keamanan JWT.")
    ]

    for row_idx, data in enumerate(rows_data):
        row_cells = table.rows[row_idx + 1].cells
        bg_color = "F8FAFC" if row_idx % 2 == 1 else "FFFFFF"
        for col_idx in range(3):
            row_cells[col_idx].text = data[col_idx]
            row_cells[col_idx].width = col_widths[col_idx]
            set_cell_background(row_cells[col_idx], bg_color)
            p = row_cells[col_idx].paragraphs[0]
            if col_idx == 0:
                p.runs[0].font.bold = True
            p.runs[0].font.size = Pt(9.5)
            p.runs[0].font.color.rgb = DARK_TEXT

    # Naskah Penutup Sidang
    add_section_header("CONTOH NASKAH PRESENTASI UNTUK SIDANG")
    p_speech = doc.add_paragraph()
    p_speech.paragraph_format.space_before = Pt(4)
    r_speech = p_speech.add_run(
        "\"Bapak/Ibu Dosen Penguji yang saya hormati, sistem StockPredict ini dirancang secara terintegrasi melalui 7 modul utama yang dikelompokkan ke dalam 3 pilar fungsional:\n\n"
        "Pertama, Pilar Operasional yang ditujukan bagi investor atau pengguna umum melalui menu Dashboard untuk melihat rangkuman pasar harian, menu Prediksi Saham yang menjadi inovasi inti dengan membandingkan performa Random Forest, Decision Tree, dan Logistic Regression secara real-time, menu Data Saham untuk inspeksi data historis, serta menu Backtesting guna memvalidasi ketepatan sinyal transaksi pada periode masa lalu.\n\n"
        "Kedua, Pilar Riset Ilmiah yang ditujukan untuk keterbukaan data akademis, meliputi menu Indikator Teknikal yang membedah 13 indikator turunan OHLCV sebagai feature engineering, dan menu Eksperimen ML yang menyajikan evaluasi metrik keilmuan data seperti Akurasi, F1-Score, hingga Feature Importance.\n\n"
        "Dan ketiga, Pilar Sistem melalui Admin Panel yang mengamankan otentikasi serta memberikan fleksibilitas pengaturan IP backend ketika aplikasi dijalankan pada perangkat smartphone Android (APK). Dengan demikian, sistem ini tidak hanya handal secara algoritma, tetapi juga aplikatif dan mudah digunakan oleh pengguna akhir.\""
    )
    r_speech.font.italic = True
    r_speech.font.size = Pt(10)
    r_speech.font.color.rgb = RGBColor(0x33, 0x41, 0x55)

    output_path = r"D:\TUGAS AKHIR\bluprint\Dokumentasi_Menu_Aplikasi_StockPredict.docx"
    doc.save(output_path)
    print(f"File DOCX berhasil dibuat di: {output_path}")

if __name__ == "__main__":
    create_doc()

