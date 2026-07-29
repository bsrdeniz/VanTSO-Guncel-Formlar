const express = require('express');
const session = require('express-session');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const db = require('./database');
const { requireAuth, requireRole } = require('./middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Gerekli klasörleri oluştur (Özellikle hassas klasörler public dışında)
const uploadDir = path.join(__dirname, '../secure_uploads');
const submissionDir = path.join(__dirname, '../secure_uploads/submissions');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
if (!fs.existsSync(submissionDir)) {
  fs.mkdirSync(submissionDir, { recursive: true });
}

// Middleware setup
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Oturum Yönetimi (Session)
app.use(session({
  secret: 'ik_portal_gizli_anahtar_2026',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Localhost olduğu için false, production'da true olmalı
    httpOnly: true,
    maxAge: 1000 * 60 * 60 * 2 // 2 saat geçerli
  }
}));

// Statik Dosyaları Sunma (Sadece public klasörü dışarı açık)
app.use(express.static(path.join(__dirname, '../public')));

// === MULTER CONFIGURATION (Dosya Yükleme Ayarları) ===

// İK Dosya Yükleme Deposu
const storageHr = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    // Benzersiz bir dosya adı oluştur
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'hr-' + uniqueSuffix + ext);
  }
});

const uploadHr = multer({ 
  storage: storageHr,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB limit
});

// Personel Form Gönderim Deposu
const storageEmployee = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, submissionDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'emp-' + uniqueSuffix + ext);
  }
});

const uploadEmployee = multer({
  storage: storageEmployee,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});


// ==========================================
// 1. AUTHENTICATION ENDPOINTS (Giriş/Çıkış)
// ==========================================

// Giriş Yap
app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'E-posta ve şifre gereklidir.' });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email], (err, user) => {
    if (err) {
      return res.status(500).json({ error: 'Sunucu hatası oluştu.' });
    }
    if (!user) {
      return res.status(401).json({ error: 'Geçersiz e-posta adresi veya şifre.' });
    }

    // Şifreyi doğrula
    const passwordMatch = bcrypt.compareSync(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Geçersiz e-posta adresi veya şifre.' });
    }

    // Oturumu kaydet
    req.session.userId = user.id;
    req.session.name = user.name;
    req.session.role = user.role;
    req.session.department = user.department;
    req.session.employeeId = user.employee_id;

    res.json({
      message: 'Giriş başarılı.',
      user: {
        id: user.id,
        employee_id: user.employee_id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department
      }
    });
  });
});

// Oturum Durumunu Al
app.get('/api/auth/me', (req, res) => {
  if (req.session && req.session.userId) {
    return res.json({
      user: {
        id: req.session.userId,
        employee_id: req.session.employeeId,
        name: req.session.name,
        role: req.session.role,
        department: req.session.department
      }
    });
  }
  res.status(401).json({ error: 'Oturum bulunamadı.' });
});

// Çıkış Yap
app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Çıkış yapılırken hata oluştu.' });
    }
    res.clearCookie('connect.sid');
    res.json({ message: 'Çıkış başarılı.' });
  });
});


// ==========================================
// 2. EMPLOYEE ENDPOINTS (Sadece İK Yetkilisi)
// ==========================================

// Tüm Çalışanları Listele
app.get('/api/employees', requireAuth, requireRole('hr'), (req, res) => {
  db.all('SELECT id, employee_id, name, email, role, department FROM users ORDER BY name ASC', (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Çalışanlar listelenemedi.' });
    }
    res.json({ employees: rows });
  });
});

// Yeni Çalışan Ekle
app.post('/api/employees', requireAuth, requireRole('hr'), (req, res) => {
  const { employee_id, name, email, password, role, department } = req.body;

  if (!employee_id || !name || !email || !password || !role || !department) {
    return res.status(400).json({ error: 'Tüm alanların doldurulması zorunludur.' });
  }

  const hash = bcrypt.hashSync(password, 10);

  db.run(`
    INSERT INTO users (employee_id, name, email, password_hash, role, department)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [employee_id, name, email, hash, role, department], function(err) {
    if (err) {
      if (err.message.includes('UNIQUE')) {
        return res.status(400).json({ error: 'Sicil No veya E-posta adresi zaten kullanımda.' });
      }
      return res.status(500).json({ error: 'Çalışan eklenirken veritabanı hatası oluştu.' });
    }
    res.status(201).json({ message: 'Çalışan başarıyla eklendi.', userId: this.lastID });
  });
});


// ==========================================
// 3. DOCUMENT ENDPOINTS (Belge Yönetimi)
// ==========================================

// Belge Yükle (Sadece İK)
app.post('/api/documents/upload', requireAuth, requireRole('hr'), uploadHr.single('file'), (req, res) => {
  const { title, category, type, visibility, target_id, document_code, first_publish_date, revision_no, last_revision_date, related_department } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Lütfen bir dosya yükleyin.' });
  }
  if (!title || !category || !type || !visibility) {
    // Yüklenen dosyayı temizle
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Lütfen zorunlu alanları doldurun.' });
  }

  // target_id eğer genel ise boş kalabilir, user veya department ise dolu olmalı
  let finalTargetId = null;
  if (visibility === 'department') {
    finalTargetId = target_id; // Departman adı
  } else if (visibility === 'user') {
    finalTargetId = target_id; // Seçilen user.id
  }

  db.run(`
    INSERT INTO documents (title, original_filename, filename, category, type, visibility, target_id, uploaded_by, document_code, first_publish_date, revision_no, last_revision_date, related_department)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    title,
    file.originalname,
    file.filename,
    category,
    type,
    visibility,
    finalTargetId,
    req.session.userId,
    document_code || null,
    first_publish_date || null,
    revision_no || null,
    last_revision_date || null,
    related_department || null
  ], function(err) {
    if (err) {
      fs.unlinkSync(file.path); // Hata durumunda dosyayı sil
      console.error(err);
      return res.status(500).json({ error: 'Belge veritabanına kaydedilemedi.' });
    }
    res.status(201).json({ message: 'Belge başarıyla yüklendi.', documentId: this.lastID });
  });
});

// Belge Güncelle / Dosya Değiştir (Sadece İK)
app.post('/api/documents/update-file/:id', requireAuth, requireRole('hr'), uploadHr.single('file'), (req, res) => {
  const docId = req.params.id;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Lütfen bir dosya yükleyin.' });
  }

  // Veritabanından belgeyi çek
  db.get('SELECT * FROM documents WHERE id = ?', [docId], (err, doc) => {
    if (err || !doc) {
      if (fs.existsSync(file.path)) fs.unlinkSync(file.path); // Yüklenen dosyayı sil
      return res.status(404).json({ error: 'Belge bulunamadı.' });
    }

    // Revizyon numarasını otomatik artır (Örn: "03" -> "04")
    let currentRev = doc.revision_no || '00';
    let revLen = currentRev.length || 2;
    let revNum = parseInt(currentRev, 10);
    if (isNaN(revNum)) revNum = 0;
    revNum += 1;
    let newRev = revNum.toString().padStart(revLen, '0');

    // Son güncelleme tarihini bugünün tarihi yap (DD.MM.YYYY)
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yyyy = today.getFullYear();
    const lastRevDate = `${dd}.${mm}.${yyyy}`;

    // Veritabanını güncelle
    db.run(`
      UPDATE documents
      SET original_filename = ?,
          filename = ?,
          revision_no = ?,
          last_revision_date = ?
      WHERE id = ?
    `, [
      file.originalname,
      file.filename,
      newRev,
      lastRevDate,
      docId
    ], (updateErr) => {
      if (updateErr) {
        if (fs.existsSync(file.path)) fs.unlinkSync(file.path); // Hata durumunda dosyayı sil
        console.error(updateErr);
        return res.status(500).json({ error: 'Belge güncellenirken hata oluştu.' });
      }

      // Eski dosyayı diskten sil (Eğer sunucudaysa ve adı farklıysa veya üzerine yazmadıysa)
      if (doc.filename && doc.filename !== file.filename) {
        const oldFilePath = path.join(uploadDir, doc.filename);
        if (fs.existsSync(oldFilePath)) {
          try {
            fs.unlinkSync(oldFilePath);
          } catch (unlinkErr) {
            console.error('Eski dosya silinemedi:', unlinkErr);
          }
        }
      }

      res.json({ message: 'Belge başarıyla güncellendi.', revision: newRev, lastDate: lastRevDate });
    });
  });
});

// Belge Sil (Sadece İK)
app.delete('/api/documents/:id', requireAuth, requireRole('hr'), (req, res) => {
  const docId = req.params.id;

  db.get('SELECT * FROM documents WHERE id = ?', [docId], (err, doc) => {
    if (err || !doc) {
      return res.status(404).json({ error: 'Belge bulunamadı.' });
    }

    // Veritabanından sil
    db.run('DELETE FROM documents WHERE id = ?', [docId], (deleteErr) => {
      if (deleteErr) {
        console.error(deleteErr);
        return res.status(500).json({ error: 'Belge silinirken veritabanı hatası oluştu.' });
      }

      // Dosyayı diskten sil
      if (doc.filename) {
        const filePath = path.join(uploadDir, doc.filename);
        if (fs.existsSync(filePath)) {
          try {
            fs.unlinkSync(filePath);
          } catch (unlinkErr) {
            console.error('Dosya silinirken hata oluştu:', unlinkErr);
          }
        }
      }

      res.json({ message: 'Belge başarıyla silindi.' });
    });
  });
});


// Belgeleri Listele
app.get('/api/documents', requireAuth, (req, res) => {
  const { userId, role, department } = req.session;

  if (role === 'hr') {
    // İK her şeyi görebilir + indirme sayısını ve yükleyen kişinin adını da join edelim
    const query = `
      SELECT d.*, u.name as uploader_name,
             (SELECT COUNT(*) FROM access_logs WHERE document_id = d.id AND action = 'download') as download_count
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      ORDER BY d.uploaded_at DESC
    `;
    db.all(query, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Belgeler listelenemedi.' });
      }
      res.json({ documents: rows || [] });
    });
  } else {
    // Çalışan yalnızca yetkisi olanları görebilir:
    // 1. Genel belgeler (visibility = 'all')
    // 2. Departmanına özel belgeler (visibility = 'department' ve target_id = department)
    // 3. Kendisine özel belgeler (visibility = 'user' ve target_id = userId)
    const query = `
      SELECT d.*, u.name as uploader_name
      FROM documents d
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.visibility = 'all'
         OR (d.visibility = 'department' AND d.target_id = ?)
         OR (d.visibility = 'user' AND d.target_id = ?)
      ORDER BY d.uploaded_at DESC
    `;
    db.all(query, [department, userId.toString()], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Belgeleriniz listelenemedi.' });
      }
      res.json({ documents: rows || [] });
    });
  }
});

// Güvenli Dosya İndirme (Yetki Kontrollü)
app.get('/api/documents/download/:id', requireAuth, (req, res) => {
  const docId = req.params.id;
  const { userId, role, department } = req.session;

  db.get('SELECT * FROM documents WHERE id = ?', [docId], (err, doc) => {
    if (err) {
      return res.status(500).json({ error: 'Dosya bilgisi alınamadı.' });
    }
    if (!doc) {
      return res.status(404).json({ error: 'Dosya bulunamadı.' });
    }

    // Yetki Kontrolü:
    // Eğer İK ise direkt indirebilir
    // Eğer personel ise, visibility şartlarını karşılamalıdır
    let isAuthorized = false;
    if (role === 'hr') {
      isAuthorized = true;
    } else {
      if (doc.visibility === 'all') {
        isAuthorized = true;
      } else if (doc.visibility === 'department' && doc.target_id === department) {
        isAuthorized = true;
      } else if (doc.visibility === 'user' && doc.target_id === userId.toString()) {
        isAuthorized = true;
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({ error: 'Bu dosyayı indirmek için yetkiniz yok.' });
    }

    const filePath = path.join(uploadDir, doc.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya fiziksel olarak sunucuda bulunamadı.' });
    }

    // İndirme işlemini logla
    db.run('INSERT INTO access_logs (user_id, document_id, action) VALUES (?, ?, ?)', [userId, docId, 'download'], (logErr) => {
      if (logErr) {
        console.error('Erişim günlüğü kaydedilemedi:', logErr.message);
      }
    });

    // Dosyayı güvenli bir şekilde indir veya önizle
    if (req.query.preview === 'true') {
      res.sendFile(filePath);
    } else {
      res.download(filePath, doc.original_filename);
    }
  });
});


// ==========================================
// 4. SUBMISSION ENDPOINTS (Çalışan Form Gönderimi)
// ==========================================

// Personel Form Doldurup İK'ya Gönderir
app.post('/api/submissions/upload', requireAuth, uploadEmployee.single('file'), (req, res) => {
  const { document_id, title, notes } = req.body;
  const file = req.file;

  if (!file) {
    return res.status(400).json({ error: 'Lütfen doldurulmuş formu yükleyin.' });
  }
  if (!title) {
    fs.unlinkSync(file.path);
    return res.status(400).json({ error: 'Lütfen bir başlık girin.' });
  }

  const finalDocId = document_id ? parseInt(document_id) : null;

  db.run(`
    INSERT INTO submissions (document_id, title, original_filename, filename, user_id, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [finalDocId, title, file.originalname, file.filename, req.session.userId, notes], function(err) {
    if (err) {
      fs.unlinkSync(file.path);
      console.error(err);
      return res.status(500).json({ error: 'Gönderi veritabanına kaydedilemedi.' });
    }
    res.status(201).json({ message: 'Formunuz İK\'ya başarıyla gönderildi.', submissionId: this.lastID });
  });
});

// Gönderilen Formları Listele
app.get('/api/submissions', requireAuth, (req, res) => {
  const { userId, role } = req.session;

  if (role === 'hr') {
    // İK tüm gönderilen formları ve kimin gönderdiğini görebilir
    const query = `
      SELECT s.*, u.name as employee_name, u.department as employee_department, d.title as original_form_title
      FROM submissions s
      JOIN users u ON s.user_id = u.id
      LEFT JOIN documents d ON s.document_id = d.id
      ORDER BY s.submitted_at DESC
    `;
    db.all(query, (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Gönderilen formlar listelenemedi.' });
      }
      res.json({ submissions: rows });
    });
  } else {
    // Personel yalnızca kendi gönderdiklerini görebilir
    const query = `
      SELECT s.*, d.title as original_form_title
      FROM submissions s
      LEFT JOIN documents d ON s.document_id = d.id
      WHERE s.user_id = ?
      ORDER BY s.submitted_at DESC
    `;
    db.all(query, [userId], (err, rows) => {
      if (err) {
        return res.status(500).json({ error: 'Gönderileriniz listelenemedi.' });
      }
      res.json({ submissions: rows });
    });
  }
});

// İK Tarafından Gönderim Durumunu Değiştir (Onayla/Reddet)
app.post('/api/submissions/status/:id', requireAuth, requireRole('hr'), (req, res) => {
  const submissionId = req.params.id;
  const { status } = req.body; // 'approved' veya 'rejected'

  if (!status || !['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ error: 'Geçersiz durum bilgisi.' });
  }

  db.run('UPDATE submissions SET status = ? WHERE id = ?', [status, submissionId], function(err) {
    if (err) {
      return res.status(500).json({ error: 'Gönderi durumu güncellenemedi.' });
    }
    res.json({ message: 'Gönderi durumu başarıyla güncellendi.' });
  });
});

// Gönderilen Belgeyi İndir
app.get('/api/submissions/download/:id', requireAuth, (req, res) => {
  const subId = req.params.id;
  const { userId, role } = req.session;

  db.get('SELECT * FROM submissions WHERE id = ?', [subId], (err, sub) => {
    if (err) {
      return res.status(500).json({ error: 'Dosya bilgisi alınamadı.' });
    }
    if (!sub) {
      return res.status(404).json({ error: 'Form gönderisi bulunamadı.' });
    }

    // Yetki Kontrolü: İK veya dosyayı gönderen personel indirebilir
    if (role !== 'hr' && sub.user_id !== userId) {
      return res.status(403).json({ error: 'Bu dosyayı indirmek için yetkiniz yok.' });
    }

    const filePath = path.join(submissionDir, sub.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Dosya fiziksel olarak sunucuda bulunamadı.' });
    }

    res.download(filePath, sub.original_filename);
  });
});


// ==========================================
// 5. AUDIT LOGS & STATS ENDPOINTS (Sadece İK)
// ==========================================

// Erişim Günlüklerini Getir
app.get('/api/logs', requireAuth, requireRole('hr'), (req, res) => {
  const query = `
    SELECT l.id, l.action, l.accessed_at, u.name as user_name, u.employee_id as user_sicil, d.title as doc_title, d.category as doc_category
    FROM access_logs l
    JOIN users u ON l.user_id = u.id
    JOIN documents d ON l.document_id = d.id
    ORDER BY l.accessed_at DESC
    LIMIT 100
  `;
  db.all(query, (err, rows) => {
    if (err) {
      return res.status(500).json({ error: 'Erişim günlükleri listelenemedi.' });
    }
    res.json({ logs: rows });
  });
});

// İK Genel İstatistiklerini Getir
app.get('/api/stats', requireAuth, requireRole('hr'), (req, res) => {
  const stats = {};
  
  db.get('SELECT COUNT(*) as count FROM users WHERE role = "employee"', (err, rUser) => {
    stats.totalEmployees = rUser ? rUser.count : 0;
    
    db.get("SELECT COUNT(*) as count FROM documents", (err, rDoc) => {
      stats.totalDocuments = rDoc ? rDoc.count : 0;
      
      db.get('SELECT COUNT(*) as count FROM access_logs WHERE action = "download"', (err, rLogs) => {
        stats.totalDownloads = rLogs ? rLogs.count : 0;
        
        db.get('SELECT COUNT(*) as count FROM submissions WHERE status = "pending"', (err, rSubs) => {
          stats.pendingSubmissions = rSubs ? rSubs.count : 0;
          
          db.all("SELECT category, COUNT(*) as count FROM documents GROUP BY category", (err, rows) => {
            stats.categories = rows || [];
            res.json({ stats });
          });
        });
      });
    });
  });
});


// Sunucuyu Başlat
app.listen(PORT, () => {
  console.log(`Sunucu http://localhost:${PORT} portunda çalışıyor.`);
});
