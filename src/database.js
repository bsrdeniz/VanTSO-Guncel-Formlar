const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, '../');
const dbPath = path.join(dataDir, 'database.sqlite');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Veritabanı bağlantı hatası:', err.message);
  } else {
    console.log('SQLite veritabanı bağlantısı başarılı.');
  }
});

db.serialize(() => {
  // Geliştirme sürecinde pragma kontrolü yapıp eğer 'document_code' kolonu yoksa tablo yapısını sıfırlıyoruz.
  db.all("PRAGMA table_info(documents)", (err, columns) => {
    const hasCode = columns && columns.some(c => c.name === 'document_code');
    if (!hasCode) {
      console.log("Eski veritabanı tablosu tespit edildi, sıfırlanıyor...");
      resetDatabaseSchema();
    } else {
      createTablesAndSeed(false);
    }
  });
});

function resetDatabaseSchema() {
  db.serialize(() => {
    db.run("DROP TABLE IF EXISTS access_logs");
    db.run("DROP TABLE IF EXISTS submissions");
    db.run("DROP TABLE IF EXISTS documents");
    db.run("DROP TABLE IF EXISTS users");
    createTablesAndSeed(true);
  });
}

function createTablesAndSeed(forceSeed) {
  db.serialize(() => {
    // 1. Users Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        employee_id TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT CHECK(role IN ('hr', 'employee')) NOT NULL,
        department TEXT NOT NULL
      )
    `);

    // 2. Documents Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        filename TEXT UNIQUE NOT NULL,
        category TEXT CHECK(category IN ('Bordro', 'İzin', 'Performans', 'Sözleşme', 'Genel Form', 'El Kitabı', 'Proses Kartı', 'Prosedür', 'Talimat', 'Plan', 'Görev Tanımı', 'Form', 'Diğer')) NOT NULL,
        type TEXT CHECK(type IN ('form', 'report')) NOT NULL,
        visibility TEXT CHECK(visibility IN ('all', 'department', 'user')) NOT NULL,
        target_id TEXT,
        uploaded_by INTEGER NOT NULL,
        uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        document_code TEXT,
        first_publish_date TEXT,
        revision_no TEXT,
        last_revision_date TEXT,
        related_department TEXT,
        FOREIGN KEY (uploaded_by) REFERENCES users(id)
      )
    `);

    // 3. Submissions Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        document_id INTEGER,
        title TEXT NOT NULL,
        original_filename TEXT NOT NULL,
        filename TEXT UNIQUE NOT NULL,
        user_id INTEGER NOT NULL,
        status TEXT CHECK(status IN ('pending', 'approved', 'rejected')) DEFAULT 'pending',
        submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `);

    // 4. Access Logs Tablosu
    db.run(`
      CREATE TABLE IF NOT EXISTS access_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        document_id INTEGER NOT NULL,
        action TEXT CHECK(action IN ('view', 'download')) NOT NULL,
        accessed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (document_id) REFERENCES documents(id)
      )
    `);

    // Seed Users
    db.get("SELECT COUNT(*) as count FROM users", (err, row) => {
      if (row && row.count === 0) {
        console.log('Mock kullanıcılar veritabanına ekleniyor...');
        
        const hrHash = bcrypt.hashSync('sifre123', 10);
        const devHash = bcrypt.hashSync('ahmet123', 10);
        const mktHash = bcrypt.hashSync('caner123', 10);
        const salesHash = bcrypt.hashSync('elif123', 10);

        const users = [
          ['EMP-00001', 'Büşra Deniz', 'busra.deniz@vantso.org.tr', bcrypt.hashSync('sifre123', 10), 'hr', 'İnsan Kaynakları'],
          ['EMP-00002', 'Ahmet Yılmaz', 'ahmet.yilmaz@vantso.org.tr', bcrypt.hashSync('sifre123', 10), 'employee', 'Genel Personel']
        ];

        const stmt = db.prepare(`
          INSERT INTO users (employee_id, name, email, password_hash, role, department)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const user of users) {
          stmt.run(user);
        }
        stmt.finalize(() => {
          console.log('Veritabanı sıfırlandı, varsayılan kullanıcılar eklendi.');
          seedDocuments();
        });
      } else {
        if (forceSeed) {
          seedDocuments();
        }
      }
    });
  });
}

function seedDocuments() {
  db.get("SELECT COUNT(*) as count FROM documents", (err, row) => {
    if (row && row.count === 0) {
      console.log('Proses kartları ve prosedürler tohumlanıyor...');
      
      const uploadDir = path.join(dataDir, 'secure_uploads');
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }

      // 180 VAN TSO Active Documents Data
      const docs = [
  {
    "code": "YEK",
    "title": "YÖNETİM SİSTEMLERİ EL KİTABI",
    "firstDate": "07.02.2023",
    "rev": "00",
    "lastDate": "00",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "El Kitabı"
  },
  {
    "code": "PK-TS-01",
    "title": "TİCARET SİCİLİ PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-PK-01",
    "title": "PLANLAMA KOORDİNASYON PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-İK-01",
    "title": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-İB-01",
    "title": "İDARİ İŞLER VE BİLGİ İŞLEM PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-Mİ-01",
    "title": "MALİ İŞLER PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-BY-01",
    "title": "BASIN YAYIN VE HALKLA İLİŞKİLER PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-DT-01",
    "title": "DIŞ TİCARET PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PK-EM-01",
    "title": "EĞİTİM VE PROJE PROSES KARTI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Proses Kartı"
  },
  {
    "code": "PRS-01",
    "title": "DOKÜMANTE EDİLMİŞ BİLGİNİN KONTROLÜ PROSEDÜRÜ",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-02",
    "title": "DÜZELTİCİ ÖNLEYİCİ FAALİYET PROSEDÜRÜ",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-03",
    "title": "İÇ TETKİK PROSEDÜRÜ",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-04",
    "title": "DOKÜMAN VE KAYITLARIN KONTROLÜ PROSEDÜRÜ",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-05",
    "title": "UYGUN OLMAYAN HİZMETİN KONTROLÜ PROSEDÜRÜ",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-06",
    "title": "ORYANTASYON VE EĞİTİM PROSEDÜRÜ",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "EĞİTİM VE MESLEKİ SERTİFİKASYON BİRİMİ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-07",
    "title": "İŞE ALMA PROSEDÜRÜ",
    "firstDate": "28.10.2013",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-08",
    "title": "PERFORMANS PROSEDÜRÜ",
    "firstDate": "06.02.2014",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-09",
    "title": "RİSK VE FIRSAT ANALİZİ PROSEDÜRÜ",
    "firstDate": "14.07.2014",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "TÜM BİRİMLER",
    "category": "Prosedür"
  },
  {
    "code": "PRS-10",
    "title": "SATINALMA PROSEDÜRÜ",
    "firstDate": "14.07.2014",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-11",
    "title": "STAJYER ÖĞRENCİ PROSEDÜRÜ",
    "firstDate": "14.07.2014",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-12",
    "title": "YASAL VE DİĞER ŞARTLARI İZLEME PROSEDÜRÜ",
    "firstDate": "13.11.2017",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TÜM BİRİMLER",
    "category": "Prosedür"
  },
  {
    "code": "PRS-13",
    "title": "STRATEJİK PLAN DEĞERLENDİRME VE TAKİPM PROSEDÜRÜ",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TÜM BİRİMLER",
    "category": "Prosedür"
  },
  {
    "code": "PRS-14",
    "title": "PERSONEL TOPLANTI ÖNERİ ŞİKAYET VE MEMNUNİYET PROSEDÜRÜ",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "PRS-15",
    "title": "ÜYE TEMSİLCİLİĞİ PROSEDÜRÜ",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TÜM BİRİMLER",
    "category": "Prosedür"
  },
  {
    "code": "PRS-16",
    "title": "ŞİKAYET YÖNETİMİ PROSEDÜRÜ",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TÜM BİRİMLER",
    "category": "Prosedür"
  },
  {
    "code": "PRS-17",
    "title": "POLİTİKA OLUŞTURMA PROSEDÜRÜ",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "GENEL SEKRETERLİK",
    "category": "Prosedür"
  },
  {
    "code": "PRS-18",
    "title": "BİLGİ GÜVENLİĞİ PROSEDÜRÜ",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Prosedür"
  },
  {
    "code": "TLM-01",
    "title": "GÜVENLİK TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-02",
    "title": "BÜTÇE TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-03",
    "title": "HARCIRAH TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-04",
    "title": "KASA TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-05",
    "title": "ACİL DURUM TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "TÜM PERSONEL",
    "category": "Talimat"
  },
  {
    "code": "TLM-06",
    "title": "YEMEKHANE TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-07",
    "title": "ARAÇ BAKIM VE KULLANIM TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-08",
    "title": "TEMİZLİK TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-09",
    "title": "İŞE ALMA TALİMATI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-10",
    "title": "BİLİŞİM SİSTEMLERİ KULLANIM TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-11",
    "title": "İHLAL TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-12",
    "title": "İMHA TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-13",
    "title": "DONANIMI DIŞARI ÇIKARMA TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-14",
    "title": "ENVANTER SAKLAMA TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-15",
    "title": "İNTERNET KULLANIM TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Talimat"
  },
  {
    "code": "TLM-16",
    "title": "KULLANICI DOĞRULAMA VE E-POSTA KULLANIM TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TÜM PERSONEL",
    "category": "Talimat"
  },
  {
    "code": "TLM-17",
    "title": "TEMİZ MASA TEMİZ EKRAN TALİMATI",
    "firstDate": "03.12.2018",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TÜM PERSONEL",
    "category": "Talimat"
  },
  {
    "code": "PLN-01",
    "title": "RİSK VE FIRSAT DEĞERLENDİRME PLANI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Plan"
  },
  {
    "code": "PLN-02",
    "title": "ACİL DURUM PLANI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Plan"
  },
  {
    "code": "PLN-03",
    "title": "COVID-19 ACİL EYLEM PLANI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Plan"
  },
  {
    "code": "GRT-01",
    "title": "MECLİS BAŞKANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-02",
    "title": "MECLİS BAŞKAN YARDIMCISI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-03",
    "title": "MECLİS KATİP ÜYE GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-04",
    "title": "MECLİS ÜYELERİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-05",
    "title": "YÖNETİM KURULU BAŞKANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-06",
    "title": "YÖNETİM KURULU BAŞKAN YARDIMCISI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-07",
    "title": "YÖNETİM KURULU SAYMAN ÜYE GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-08",
    "title": "YÖNETİM KURULU BAŞKAN DANIŞMANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-09",
    "title": "HESAP İNCELEME KOMİSYONU BAŞKANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-10",
    "title": "DİSİPLİN KURULU BAŞKANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-11",
    "title": "YÜKSEK İSTİŞARE KURULU BAŞKANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-12",
    "title": "YÜKSEK İSTİŞARE KURULU ÜYELERİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-13",
    "title": "AKREDİTASYON İZLEME KOMİTESİ ÜYELERİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-14",
    "title": "STRATEJİK PLAN HAZIRLAMA VE YÜRÜTME KURULU ÜYELERİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "01.02.2023",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-15",
    "title": "GENEL SEKRETER GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "GENEL SEKRETERLİK",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-16",
    "title": "GENEL SEKRETER YARDIMCISI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "GENEL SEKRETERLİK",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-17",
    "title": "TİCARET SİCİLİ MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-18",
    "title": "PLANLAMA KOORDİNASYON VE KOMİTELER MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "PLANLAMA KOOR. KOM. MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-19",
    "title": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-20",
    "title": "MALİ İŞLER MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-21",
    "title": "ÖZEL KALEM MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "ÖZEL KALEM MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-22",
    "title": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-23",
    "title": "BELGELENDİRME MÜDÜRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-24",
    "title": "DIŞ TİCARET UZMANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-25",
    "title": "BASIN YAYIN VE HALKLA İLİŞKİLER KOORDİNATÖRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-26",
    "title": "MAKİNE MÜHENDİSİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-27",
    "title": "EĞİTİM VE MESLEKİ SERTİFİKASYON UZMANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-28",
    "title": "AB BİLGİ MERKEZİ KOORDİNATÖRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-29",
    "title": "COSME PROJE KOORDİNATÖRÜ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-30",
    "title": "COSME PROJE KOORDİNATÖR YARDIMCISI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-31",
    "title": "TİCARET SİCİLİ MÜDÜR YARDIMCISI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-32",
    "title": "MUHASEBE UZMANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-33",
    "title": "SATINALMA UZMANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-34",
    "title": "VEZNEDAR GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-35",
    "title": "DOKÜMANTASYON UZMANI GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-36",
    "title": "TEKNİKER GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-37",
    "title": "GÜVENLİK GÖREVLİSİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-38",
    "title": "ŞOFÖR GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-39",
    "title": "YARDIMCI HİZMETLER GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-40",
    "title": "KALİTE YÖNETİM TEMSİLCİSİ GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-41",
    "title": "AKREDİTASYON SORUMLUSU GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "GRT-42",
    "title": "İHRACAT DESTEK OFİSİ SORUMLUSU GÖREV TANIMI",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Görev Tanımı"
  },
  {
    "code": "FRM-01",
    "title": "ÇALIŞAN MEMNUNİYETİ ANKET FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-02",
    "title": "DOKÜMAN DEĞİŞİKLİK TALEP FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-03",
    "title": "DÖFİ TAKİP FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-04",
    "title": "DOKÜMAN DAĞITIM TOPLAMA FORMU",
    "firstDate": "01.02.2007",
    "rev": "04",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-05",
    "title": "EĞİTİM DEĞERLENDİRME FORMU",
    "firstDate": "01.02.2007",
    "rev": "04",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-06",
    "title": "ÜYE MEMNUNİYETİ ANKET FORMU",
    "firstDate": "01.02.2007",
    "rev": "04",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-07",
    "title": "İÇ TETKİK RAPOR FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-08",
    "title": "KALİTE KAYITLARI FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-09",
    "title": "PERSONEL EĞİTİM TAKİP FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-10",
    "title": "EĞİTİM TALEP BİLFİRİM FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-11",
    "title": "TOPLANTI KATILIM FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-12",
    "title": "PERFORMANS DEĞERLENDİRME FORMU",
    "firstDate": "01.02.2007",
    "rev": "05",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-13",
    "title": "YILLIK EĞİTİM PLAN FORMU",
    "firstDate": "01.02.2007",
    "rev": "05",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-14",
    "title": "YÜRÜRLÜKTE OLAN DOKÜMANLAR FORMU",
    "firstDate": "01.02.2007",
    "rev": "05",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-15",
    "title": "DIŞ KAYNAKLI DOKÜMANLAR FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-16",
    "title": "DANIŞMANLIK HİZMETİ TALEP FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-17",
    "title": "MAKİNA CİHAZ TAKİP FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-18",
    "title": "İRAN TÜCCAR OFİSİ MEMNUNİYET FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-19",
    "title": "İÇ TETKİK PLAN FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-20",
    "title": "YILLIK BAKIM PLAN FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-21",
    "title": "TOPLANTI TUTANAK FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-22",
    "title": "ÜRÜN DOĞRULAMA KONTROL FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-23",
    "title": "PROSES HEDEF PLANLAMA FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-24",
    "title": "TALEP ŞİKAYET FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-25",
    "title": "İÇ TETKİK SORULARI",
    "firstDate": "01.02.2007",
    "rev": "04",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-26",
    "title": "MEVCUT KAYITLARI SAKLAMA FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-27",
    "title": "DÖF FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-28",
    "title": "PROSES ETKİNLİK PLANLAMA FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-29",
    "title": "KALİTE HEDEF PLANLAMA FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-30",
    "title": "PERSONEL EĞİTİM KATILIM FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-31",
    "title": "BİLGİ DANIŞMANLIK FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-32",
    "title": "TEKNİK BAKIM PLAN FORMU",
    "firstDate": "18.03.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-33",
    "title": "ÜYE EĞİTİM TALEP FORMU",
    "firstDate": "18.03.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-34",
    "title": "KONFERANS, TOPLANTI TALEP VE İZİN FORMU",
    "firstDate": "18.03.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-35",
    "title": "TOPLANTI SALONU KİRA SÖZLEŞMESİ FORMU",
    "firstDate": "18.03.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-36",
    "title": "EĞİTİM İHTİYAÇ ANALİZ FORMU",
    "firstDate": "18.03.2013",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-37",
    "title": "ETKİNLİK DEĞERLENDİRME FORMU",
    "firstDate": "18.03.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "PLANLAMA KOORDİNASYON VE KOMİTELER MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-38",
    "title": "FAALLİYET PLANI",
    "firstDate": "18.03.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "PLANLAMA KOORDİNASYON VE KOMİTELER MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-39",
    "title": "İŞ KABUL FORMU",
    "firstDate": "18.03.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-40",
    "title": "MESAJ KAYIT FORMU",
    "firstDate": "18.03.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-41",
    "title": "ÜYE MEMNUNİYETİ ANKET FORMU",
    "firstDate": "11.04.2014",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-42",
    "title": "STAJYER ÖĞRENCİ DEĞERLENDİRME FORMU",
    "firstDate": "14.07.2014",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-43",
    "title": "STAJYER ÖĞRENCİ FORMU",
    "firstDate": "16.09.2014",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-44",
    "title": "YÖNETİCİ PERFORMANS DEĞERLENDİRME FORMU",
    "firstDate": "28.11.2014",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-45",
    "title": "ODA BORSA KIYASLAMA FORMU",
    "firstDate": "28.11.2014",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-46",
    "title": "KAN GRUBU BİLGİ BANKASI FORMU",
    "firstDate": "13.05.2015",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-47",
    "title": "NAKİL GELEN FİRMA FORMU",
    "firstDate": "19.04.2016",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-48",
    "title": "İÇ PAYDAŞ SWOT ANALİZİ FORMU",
    "firstDate": "26.10.2016",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-49",
    "title": "DIŞ PAYDAŞ SWOT ANALİZİ FORMU",
    "firstDate": "25.07.2016",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-50",
    "title": "ÜYE EĞİTİM PLAN FORMU",
    "firstDate": "16.11.2016",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-51",
    "title": "SMS İLE BİLGİLENDİRME TALEP FORMU",
    "firstDate": "16.11.2016",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-52",
    "title": "VEKALET FORMU",
    "firstDate": "24.07.2018",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-Yİ-01",
    "title": "KAPASİTE EKSPERTİZ REPORU MÜRACAAT VE RANDEVU FORMU",
    "firstDate": "01.02.2007",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "AR-GE SANAYİ BİRİMİ",
    "category": "Form"
  },
  {
    "code": "FRM-Yİ-02",
    "title": "KAPASİTE BAŞVURU FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "AR-GE SANAYİ BİRİMİ",
    "category": "Form"
  },
  {
    "code": "FRM-Yİ-04",
    "title": "BİLGİ EDİNME FORMU",
    "firstDate": "26.02.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "AR-GE SANAYİ BİRİMİ",
    "category": "Form"
  },
  {
    "code": "FRM-Yİ-05",
    "title": "EKSPERTİZ BAŞVURU FORMU",
    "firstDate": "26.02.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "AR-GE SANAYİ BİRİMİ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-01",
    "title": "ARAÇ GÖREV TALEP FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-02",
    "title": "PERSONEL İZİN FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-03",
    "title": "TAŞIT GÖREV EMRİ",
    "firstDate": "19.02.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-04",
    "title": "İŞ BAŞVURU FORMU",
    "firstDate": "25.02.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-05",
    "title": "MESAİ DEVAM ÇİZELGESİ",
    "firstDate": "26.02.2013",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-06",
    "title": "ÖZLÜK DOSYASI EVRSK FORMU",
    "firstDate": "17.04.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-07",
    "title": "MÜLAKAT DEĞERLENDİRME FORMU",
    "firstDate": "17.04.2013",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-08",
    "title": "YILLIK İZİN TAKİP ÇİZELGESİ",
    "firstDate": "17.04.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-09",
    "title": "ORYANTASYON EĞİTİMİ FORMU",
    "firstDate": "17.04.2013",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-10",
    "title": "WC GÜNLÜK BAKIM ÇİZELGESİ",
    "firstDate": "17.04.2013",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-11",
    "title": "YILLIK İZİN TALEP FORMU",
    "firstDate": "04.07.2013",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-İK-12",
    "title": "ORYANTASYON DEĞERLENDİRME FORMU",
    "firstDate": "31.07.2015",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İNSAN KAYNAKLARI KALİTE VE AKREDİTASYON MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-TS-01",
    "title": "İŞ KABUL DİLEKÇE FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-TS-02",
    "title": "İŞ KABUL FORMU",
    "firstDate": "17.04.2009",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-TS-03",
    "title": "ZAYİİ DURUMLAR İÇİN EVRAK TALEP FORMU",
    "firstDate": "14.03.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-TS-04",
    "title": "İŞ KABUL FORMU",
    "firstDate": "17.04.2009",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-TS-05",
    "title": "GAZETE ONAY FORMU",
    "firstDate": "26.01.2017",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "TİCARET SİCİLİ MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-BY-01",
    "title": "BASIN BİLDİRİSİ FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "BASIN YAYIN KOORDİNATÖRÜ",
    "category": "Form"
  },
  {
    "code": "FRM-BY-02",
    "title": "GÜNLÜK GAZETE TAKİP FORMU",
    "firstDate": "01.08.2007",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "BASIN YAYIN KOORDİNATÖRÜ",
    "category": "Form"
  },
  {
    "code": "FRM-BY-03",
    "title": "BASIN BÜLTENİ TAKİP FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "BASIN YAYIN KOORDİNATÖRÜ",
    "category": "Form"
  },
  {
    "code": "FRM-SA-01",
    "title": "MALZEME İSTEK VE TESLİM FORMU",
    "firstDate": "01.02.2007",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "SATINALMA UZMANI",
    "category": "Form"
  },
  {
    "code": "FRM-SA-02",
    "title": "TEDARİKÇİ FİRMA DEĞERLENDİRME FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "SATINALMA UZMANI",
    "category": "Form"
  },
  {
    "code": "FRM-SA-03",
    "title": "ONAYLI TEDARİKÇİ LİSTESİ FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "SATINALMA UZMANI",
    "category": "Form"
  },
  {
    "code": "FRM-SA-04",
    "title": "TEKLİF FORMU",
    "firstDate": "01.02.2007",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "SATINALMA UZMANI",
    "category": "Form"
  },
  {
    "code": "FRM-Mİ-01",
    "title": "TESLİM TESELLÜM FORMU",
    "firstDate": "26.02.2013",
    "rev": "02",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-Mİ-02",
    "title": "SATICI BİLGİ FORMU",
    "firstDate": "25.02.2013",
    "rev": "03",
    "lastDate": "10.01.2022",
    "dept": "MALİ İŞLER MÜDÜRLÜĞÜ",
    "category": "Form"
  },
  {
    "code": "FRM-AB-01",
    "title": "AB BİLGİ MERKEZİ FAALİYET RAPORU FORMU",
    "firstDate": "01.02.2007",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "AB BİLGİ MERKEZİ PROJE KOORDİNATÖRÜ",
    "category": "Form"
  },
  {
    "code": "FRM-GS-01",
    "title": "ÜYE ZİYARET VE TAKİP FORMU",
    "firstDate": "04.12.2024",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "GENEL SEKRETERLİK",
    "category": "Form"
  },
  {
    "code": "FRM-MG-01",
    "title": "MESLEK GRUBU DEĞİŞİKLİĞİ TALEP FORMU",
    "firstDate": "06.02.2025",
    "rev": "00",
    "lastDate": "10.01.2022",
    "dept": "GENEL SEKRETERLİK",
    "category": "Form"
  },
  {
    "code": "FRM-İB",
    "title": "İDARİ İŞLER FORMU",
    "firstDate": "01.02.2007",
    "rev": "01",
    "lastDate": "10.01.2022",
    "dept": "İDARİ İŞLER VE BİLGİ İŞLEM MÜDÜRLÜĞÜ",
    "category": "Form"
  }
];

      const stmt = db.prepare(`
        INSERT INTO documents (title, original_filename, filename, category, type, visibility, target_id, uploaded_by, document_code, first_publish_date, revision_no, last_revision_date, related_department)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      docs.forEach((doc) => {
        const docFile = `hr-seed-${doc.code.toLowerCase()}.pdf`;
        const filePath = path.join(uploadDir, docFile);
        
        // Mock PDF dosyasını diske yaz
        if (!fs.existsSync(filePath)) {
          fs.writeFileSync(filePath, `%PDF-1.4\n% MOCK FILE FOR VANTSO PROCESS CARD: ${doc.title} (${doc.code})\n%%EOF`);
        }

        stmt.run([
          doc.title,
          `${doc.title}.pdf`,
          docFile,
          doc.category,
          'form',
          'all',
          null,
          1, // Büşra Deniz tarafından yüklendi
          doc.code,
          doc.firstDate,
          doc.rev,
          doc.lastDate,
          doc.dept
        ]);
      });

      stmt.finalize(() => {
        console.log(`${docs.length} adet proses kartı başarıyla tohumlandı.`);
      });
    }
  });
}

module.exports = db;
