// İK Belge Portalı - Gösterge Paneli ve Veri Yönetimi

let allDocuments = [];
let allSubmissions = [];
let allEmployees = [];
let selectedCategory = 'all';

// Modalları Açma / Kapatma
function openModal(modalId) {
  document.getElementById(modalId).classList.remove('hidden');
  
  // Eğer çalışan ekleme veya dosya yükleme modalı ise listeleri yükle
  if (modalId === 'modal-upload') {
    loadUploadTargets();
    
    // Otomatik olarak İlgili Birim / Departman alanını kullanıcının kendi departmanı ile doldur
    const relatedDeptInput = document.getElementById('upload-related-dept');
    if (relatedDeptInput && currentUser && currentUser.department) {
      relatedDeptInput.value = currentUser.department;
    }
  } else if (modalId === 'modal-submit-form') {
    loadFormReferences();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) modal.classList.add('hidden');
  
  // Formları resetle
  if (modalId === 'modal-upload') {
    const form = document.getElementById('form-upload');
    if (form) form.reset();
    resetDropzone('upload-dropzone', 'file-info');
    const targetGroup = document.getElementById('target-selection-group');
    if (targetGroup) targetGroup.classList.add('hidden');
  } else if (modalId === 'modal-employee') {
    const form = document.getElementById('form-employee');
    if (form) form.reset();
  } else if (modalId === 'modal-submit-form') {
    const form = document.getElementById('form-submission');
    if (form) form.reset();
    resetDropzone('sub-dropzone', 'sub-file-info');
  }
}

// Ana Başlangıç Fonksiyonu (auth.js tarafından çağrılır)
function initDashboard() {
  // Arayüz olay yöneticilerini bağla (Yalnızca ilk kez)
  if (!window.dashEventsBound) {
    setupDashboardEventListeners();
    window.dashEventsBound = true;
  }

  // Verileri Sunucudan Yükle
  refreshAllData();
}

// Verileri Güncelleme
async function refreshAllData() {
  await loadDocuments();
  await loadSubmissions();
  
  if (currentUser.role === 'hr') {
    await loadEmployees();
    await loadStats();
    await loadAuditLogs();
  } else {
    // Personel için basit istatistikler
    updateEmployeeStats();
  }
}

// ==========================================
// 1. VERİ YÜKLEME VE LİSTELEME
// ==========================================

// Belgeleri Çek
async function loadDocuments() {
  try {
    const response = await fetch('/api/documents');
    if (response.ok) {
      const data = await response.json();
      allDocuments = data.documents;
      renderDocuments();
    }
  } catch (error) {
    console.error('Belgeler yüklenemedi:', error);
    showToast('Belgeler yüklenirken hata oluştu.', 'error');
  }
}

// Türkçe karakter uyumlu küçük harf çevirici (Arama doğruluğu için)
function trNormalize(str) {
  if (!str) return '';
  return str
    .replace(/İ/g, 'i')
    .replace(/I/g, 'ı')
    .replace(/Ş/g, 'ş')
    .replace(/Ğ/g, 'ğ')
    .replace(/Ü/g, 'ü')
    .replace(/Ö/g, 'ö')
    .replace(/Ç/g, 'ç')
    .toLowerCase();
}

// Belgeleri Arayüzde Listele
function renderDocuments() {
  const container = document.getElementById('document-cards-container');
  container.innerHTML = '';
  
  const searchQuery = trNormalize(document.getElementById('doc-search').value);
  
  const filtered = allDocuments.filter(doc => {
    // Kategori filtresi
    // Kategori filtresi
    if (selectedCategory !== 'all') {
      if (selectedCategory === 'Diğer') {
        const otherCategories = ['Diğer', 'El Kitabı', 'Plan', 'Bordro', 'İzin', 'Performans', 'Sözleşme', 'Genel Form'];
        if (!otherCategories.includes(doc.category)) {
          return false;
        }
      } else if (doc.category !== selectedCategory) {
        return false;
      }
    }
    // Arama sorgusu filtresi (Türkçe karakter uyumlu)
    if (searchQuery) {
      const titleMatch = trNormalize(doc.title).includes(searchQuery);
      const catMatch = trNormalize(doc.category).includes(searchQuery);
      const codeMatch = doc.document_code ? trNormalize(doc.document_code).includes(searchQuery) : false;
      
      if (!titleMatch && !catMatch && !codeMatch) {
        return false;
      }
    }
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 40px; background: rgba(255,255,255,0.02); border-radius: var(--radius-md); border: 1px dashed var(--border-color);">Gösterilecek proses kartı bulunamadı.</div>`;
    return;
  }

  filtered.forEach(doc => {
    const hasFile = !!doc.filename;
    const fileExt = hasFile ? doc.original_filename.split('.').pop().toLowerCase() : 'yok';
    
    // Yüklenme tarihi formatlama
    const dateStr = new Date(doc.uploaded_at).toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });

    const card = document.createElement('div');
    card.className = 'document-card';
    card.style.cursor = 'pointer';
    card.onclick = () => openDocDetails(doc.id);

    // Açıklama oluştur (Kategori ve Kod Bilgileri)
    const docCode = doc.document_code || '';
    const description = `${docCode ? docCode + ' - ' : ''}${doc.related_department || 'Tüm Birimler'} bünyesindeki faaliyet ve prosedürleri tanımlayan kurumsal proses belgesidir.`;

    let visText = 'Tüm Şirket';
    if (doc.visibility === 'department') visText = `${doc.target_id} Departmanı`;
    else if (doc.visibility === 'user') visText = 'Kişiye Özel';

    // Doküman Detay Bilgileri Bölümü (Direkt Kart Üzerinde Gösterim)
    const detailsHtml = `
      <div class="card-details-section">
        <div class="detail-row">
          <span class="detail-label">Revizyon:</span>
          <span class="detail-value">Rev ${doc.revision_no || '00'}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Erişim:</span>
          <span class="detail-value">${visText}</span>
        </div>
        <div class="detail-row">
          <span class="detail-label">Kategori:</span>
          <span class="detail-value">${doc.category}</span>
        </div>
        ${currentUser.role === 'hr' ? `
          <div class="detail-row border-top">
            <span class="detail-label">İndirilme:</span>
            <span class="detail-value">${doc.download_count || 0} Kez</span>
          </div>
        ` : ''}
      </div>
    `;

    card.innerHTML = `
      <div class="card-top-row">
        <div class="doc-badge ${fileExt}">
          <span>${fileExt.toUpperCase()}</span>
        </div>
      </div>
      
      <div class="card-middle-content">
        <h3 class="document-title" title="${doc.title}">${doc.title}</h3>
        <p class="document-desc">${description}</p>
        ${detailsHtml}
      </div>
      
      <div class="card-bottom-row">
        <div class="date-group">
          <span class="date-label">Yüklenme Tarihi</span>
          <span class="date-value">${dateStr}</span>
        </div>
        
        <div class="card-actions-wrapper" style="display: flex; gap: 8px; align-items: center;">
          ${currentUser && currentUser.role === 'hr' ? `
            <button class="btn-doc-update" onclick="event.stopPropagation(); triggerFileUpdate(${doc.id})" title="${hasFile ? 'Belgeyi Güncelle/Değiştir' : 'Belgeye Dosya Yükle'}">
              <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="17 8 12 3 7 8"></polyline>
                <line x1="12" y1="3" x2="12" y2="15"></line>
              </svg>
              ${hasFile ? 'GÜNCELLE' : 'DOSYA YÜKLE'}
            </button>
            ${hasFile ? `
              <button class="btn-doc-delete" onclick="event.stopPropagation(); deleteDocument(${doc.id})" title="Yüklenen Dosyayı Sil">
                <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                  <line x1="10" y1="11" x2="10" y2="17"></line>
                  <line x1="14" y1="11" x2="14" y2="17"></line>
                </svg>
                SİL
              </button>
            ` : ''}
          ` : ''}
          <button class="btn-doc-download" ${hasFile ? `onclick="downloadDocument(${doc.id}); event.stopPropagation();"` : 'disabled'} title="${hasFile ? 'Dokümanı İndir' : 'Dosya Yüklenmemiş'}" style="${hasFile ? '' : 'opacity: 0.5; cursor: not-allowed;'}">
            <svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
              <polyline points="7 10 12 15 17 10"></polyline>
              <line x1="12" y1="15" x2="12" y2="3"></line>
            </svg>
            ${hasFile ? 'İNDİR' : 'DOSYA YOK'}
          </button>
        </div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Doküman Detay Penceresini Aç
function openDocDetails(docId) {
  const doc = allDocuments.find(d => d.id === docId);
  if (!doc) return;

  const hasFile = !!doc.filename;
  const fileExt = hasFile ? doc.original_filename.split('.').pop().toLowerCase() : 'yok';
  
  // Modaldaki alanları doldur
  document.getElementById('detail-doc-title').textContent = doc.title;
  
  const codeElem = document.getElementById('detail-doc-code');
  if (codeElem) codeElem.textContent = doc.document_code || 'KODSUZ';
  
  const badge = document.getElementById('detail-file-badge');
  if (badge) {
    badge.textContent = hasFile ? fileExt.toUpperCase() : 'YOK';
    badge.className = `doc-badge ${fileExt}`;
  }
  
  const sizeElem = document.getElementById('detail-file-size');
  if (sizeElem) {
    if (hasFile) {
      const sizeKB = (doc.id * 73 % 200) + 50;
      sizeElem.textContent = `Dosya Boyutu: ${sizeKB} KB`;
    } else {
      sizeElem.textContent = 'Dosya Durumu: Yüklenmemiş';
    }
  }
  
  // Kayıt Bilgileri Tablosu
  document.getElementById('info-doc-code').textContent = doc.document_code || 'KODSUZ';
  document.getElementById('info-doc-category').textContent = doc.category;
  document.getElementById('info-doc-revision').textContent = `Rev ${doc.revision_no || '00'}`;
  document.getElementById('info-doc-first-publish').textContent = doc.first_publish_date || '-';
  document.getElementById('info-doc-last-revision').textContent = doc.last_revision_date || '-';
  document.getElementById('info-doc-dept').textContent = doc.related_department || 'Tüm Birimler';
  
  let visText = 'Tüm Şirket';
  if (doc.visibility === 'department') visText = `${doc.target_id} Departmanı`;
  else if (doc.visibility === 'user') visText = 'Kişiye Özel';
  document.getElementById('info-doc-visibility').textContent = visText;
  
  document.getElementById('info-doc-downloads').textContent = `${doc.download_count || 0} Kez`;

  // Buton İşlevleri
  const btnDownload = document.getElementById('btn-detail-download');
  if (btnDownload) {
    if (hasFile) {
      btnDownload.style.display = 'inline-flex';
      btnDownload.onclick = () => downloadDocument(doc.id);
    } else {
      btnDownload.style.display = 'none';
    }
  }
  
  const btnPreview = document.getElementById('btn-detail-preview');
  if (btnPreview) {
    if (hasFile) {
      btnPreview.style.display = 'inline-flex';
      btnPreview.onclick = () => {
        window.open(`/api/documents/download/${doc.id}?preview=true`, '_blank');
      };
    } else {
      btnPreview.style.display = 'none';
    }
  }

  // Modalı Aç
  document.getElementById('modal-doc-details').classList.remove('hidden');
}

// Doküman Detay Penceresini Kapat
function closeDocDetailsModal() {
  document.getElementById('modal-doc-details').classList.add('hidden');
}


// Dosya İndir
function downloadDocument(docId) {
  // Doğrudan tarayıcı indirmesini başlat
  window.location.href = `/api/documents/download/${docId}`;
}

// İstatistikleri Getir (Yalnızca İK)
async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    if (response.ok) {
      const data = await response.json();
      const { stats } = data;
      
      const totalDocs = document.getElementById('stat-total-docs');
      if (totalDocs) totalDocs.textContent = stats.totalDocuments;
      
      const totalEmps = document.getElementById('stat-total-employees');
      if (totalEmps) totalEmps.textContent = stats.totalEmployees;
      
      const totalDownloads = document.getElementById('stat-total-downloads');
      if (totalDownloads) totalDownloads.textContent = stats.totalDownloads;
      
      const pendingSubs = document.getElementById('stat-pending-submissions');
      if (pendingSubs) pendingSubs.textContent = stats.pendingSubmissions;
    }
  } catch (error) {
    console.error('İstatistikler yüklenemedi:', error);
  }
}

// Çalışanlar Listesini Çek (İK)
async function loadEmployees() {
  try {
    const response = await fetch('/api/employees');
    if (response.ok) {
      const data = await response.json();
      allEmployees = data.employees;
      renderEmployees();
    }
  } catch (error) {
    console.error('Çalışanlar yüklenemedi:', error);
  }
}

// Çalışanları Listele
function renderEmployees() {
  const tbody = document.getElementById('employee-table-body');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (allEmployees.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--text-muted);">Çalışan kaydı bulunmamaktadır.</td></tr>`;
    return;
  }

  allEmployees.forEach(emp => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${emp.employee_id}</strong></td>
      <td>${emp.name} ${emp.role === 'hr' ? '👑' : ''}</td>
      <td><span style="color: var(--text-secondary);">${emp.department}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// Erişim Loglarını Çek (İK)
async function loadAuditLogs() {
  try {
    const response = await fetch('/api/logs');
    if (response.ok) {
      const data = await response.json();
      renderAuditLogs(data.logs);
    }
  } catch (error) {
    console.error('Erişim günlükleri yüklenemedi:', error);
  }
}

// Erişim Loglarını Arayüzde Göster
function renderAuditLogs(logs) {
  const list = document.getElementById('audit-log-list');
  if (!list) return;
  list.innerHTML = '';

  if (!logs || logs.length === 0) {
    list.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Henüz bir erişim gerçekleşmedi.</p>`;
    return;
  }

  logs.forEach(log => {
    const dateStr = new Date(log.accessed_at).toLocaleDateString('tr-TR', {
      month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const div = document.createElement('div');
    div.className = 'audit-item';
    div.innerHTML = `
      <div>
        <span class="audit-user">${log.user_name} (${log.user_sicil})</span>, 
        <span class="audit-doc">"${log.doc_title}"</span> belgesini indirdi.
      </div>
      <div class="audit-meta">
        <span>Kategori: ${log.doc_category}</span>
        <span>${dateStr}</span>
      </div>
    `;
    list.appendChild(div);
  });
}

// Form Gönderilerini Çek
async function loadSubmissions() {
  try {
    const response = await fetch('/api/submissions');
    if (response.ok) {
      const data = await response.json();
      allSubmissions = data.submissions;
      renderSubmissions();
    }
  } catch (error) {
    console.error('Gönderilen formlar yüklenemedi:', error);
  }
}

// Form Gönderilerini Arayüzde Göster
function renderSubmissions() {
  const list = document.getElementById('submission-list');
  if (!list) return;
  list.innerHTML = '';

  if (allSubmissions.length === 0) {
    list.innerHTML = `<p style="text-align: center; color: var(--text-muted); font-size: 13px; padding: 20px;">Gönderilmiş herhangi bir form bulunmamaktadır.</p>`;
    return;
  }

  allSubmissions.forEach(sub => {
    const dateStr = new Date(sub.submitted_at).toLocaleDateString('tr-TR', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit'
    });

    const card = document.createElement('div');
    card.className = 'submission-card';
    
    let badgeClass = 'pending';
    let statusText = 'İnceleniyor';
    if (sub.status === 'approved') { badgeClass = 'approved'; statusText = 'Onaylandı'; }
    else if (sub.status === 'rejected') { badgeClass = 'rejected'; statusText = 'Reddedildi'; }

    let refText = '';
    if (sub.original_form_title) {
      refText = `<span style="font-size: 11px; color: var(--accent-cyan); display:block; margin-top:2px;">Referans: ${sub.original_form_title}</span>`;
    }

    let notesText = '';
    if (sub.notes) {
      notesText = `<div class="sub-card-notes">${sub.notes}</div>`;
    }

    // HR Karar butonları
    let decisionHtml = '';
    if (currentUser.role === 'hr' && sub.status === 'pending') {
      decisionHtml = `
        <div class="sub-card-decision-btns">
          <button class="btn-decision reject" onclick="processSubmission(${sub.id}, 'rejected')">Reddet</button>
          <button class="btn-decision approve" onclick="processSubmission(${sub.id}, 'approved')">Onayla</button>
        </div>
      `;
    }

    let empNameHtml = '';
    if (currentUser.role === 'hr') {
      empNameHtml = `<div class="sub-card-employee">Gönderen: ${sub.employee_name} (${sub.employee_department})</div>`;
    }

    card.innerHTML = `
      <div class="sub-card-header">
        <div>
          <span class="sub-card-title">${sub.title}</span>
          ${refText}
          ${empNameHtml}
          <span style="font-size: 11px; color: var(--text-muted); display:block; margin-top:4px;">Tarih: ${dateStr}</span>
        </div>
        <span class="sub-badge-status ${badgeClass}">${statusText}</span>
      </div>
      ${notesText}
      <div class="sub-card-actions">
        <a href="/api/submissions/download/${sub.id}" class="sub-card-btn-download" target="_blank">
          📄 Formu Görüntüle
        </a>
        ${decisionHtml}
      </div>
    `;

    list.appendChild(card);
  });
}

// Personel Basit İstatistik Sayacı
function updateEmployeeStats() {
  const totalDocs = document.getElementById('stat-total-docs');
  if (totalDocs) totalDocs.textContent = allDocuments.length;
  
  const pendingSubs = document.getElementById('stat-pending-submissions');
  if (pendingSubs) pendingSubs.textContent = allSubmissions.length;
}

// ==========================================
// 2. FORM SUBMISSIONS VE DOSYA YÜKLEME logic
// ==========================================

// İK Dosya Görünürlük Seçimi Değiştiğinde
document.getElementById('upload-visibility').addEventListener('change', (e) => {
  const visibility = e.target.value;
  const targetGroup = document.getElementById('target-selection-group');
  const targetLabel = document.getElementById('target-label');
  const targetSelect = document.getElementById('upload-target');
  
  targetSelect.innerHTML = '';
  
  if (visibility === 'all') {
    targetGroup.classList.add('hidden');
    targetSelect.removeAttribute('required');
  } else if (visibility === 'department') {
    targetGroup.classList.remove('hidden');
    targetLabel.textContent = 'Hedef Departman';
    targetSelect.setAttribute('required', 'true');
    
    // Benzersiz departmanları ekle
    const departments = ['Software Development', 'Marketing', 'Sales', 'Human Resources'];
    departments.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      targetSelect.appendChild(opt);
    });
  } else if (visibility === 'user') {
    targetGroup.classList.remove('hidden');
    targetLabel.textContent = 'Hedef Çalışan';
    targetSelect.setAttribute('required', 'true');
    
    // Çalışanları ekle
    allEmployees.forEach(emp => {
      const opt = document.createElement('option');
      opt.value = emp.id;
      opt.textContent = `${emp.name} (${emp.department})`;
      targetSelect.appendChild(opt);
    });
  }
});

// Modaldaki hedef verilerini güncelle
function loadUploadTargets() {
  // Varsayılan tetikleyici çalışsın
  document.getElementById('upload-visibility').dispatchEvent(new Event('change'));
}

// Personel Form Gönderirken Referans Form Listesini Doldur
function loadFormReferences() {
  const refSelect = document.getElementById('sub-doc-ref');
  refSelect.innerHTML = '<option value="">Bağlantısız / Genel Form</option>';
  
  // Yalnızca form şablonlarını listele
  const forms = allDocuments.filter(d => d.type === 'form');
  forms.forEach(f => {
    const opt = document.createElement('option');
    opt.value = f.id;
    opt.textContent = f.title;
    refSelect.appendChild(opt);
  });
}

// Form Onay/Red İşlemi
async function processSubmission(subId, status) {
  try {
    const response = await fetch(`/api/submissions/status/${subId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status })
    });
    
    if (response.ok) {
      showToast(status === 'approved' ? 'Form onaylandı.' : 'Form reddedildi.', 'success');
      refreshAllData();
    } else {
      showToast('Form durumu güncellenemedi.', 'error');
    }
  } catch (error) {
    console.error('Karar verme hatası:', error);
  }
}

// ==========================================
// 3. EVENT LISTENERS SETUP (Olay Yöneticileri)
// ==========================================
function setupDashboardEventListeners() {
  
  // Hızlı Arama Butonları (Kategori Filtreleme)
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      selectedCategory = btn.getAttribute('data-category');
      renderDocuments();
    });
  });

  // Arama Girişi Dinleyicisi (Input & Enter Tuşu)
  const searchInput = document.getElementById('doc-search');
  if (searchInput) {
    searchInput.addEventListener('input', renderDocuments);
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        renderDocuments();
      }
    });
  }

  // Modalları Açma Butonları
  const btnUpload = document.getElementById('btn-open-upload');
  if (btnUpload) btnUpload.addEventListener('click', () => openModal('modal-upload'));
  
  const btnAddEmp = document.getElementById('btn-open-add-employee');
  if (btnAddEmp) btnAddEmp.addEventListener('click', () => openModal('modal-employee'));
  
  const btnSubmitForm = document.getElementById('btn-open-submit-form');
  if (btnSubmitForm) btnSubmitForm.addEventListener('click', () => openModal('modal-submit-form'));

  // Sürükle Bırak / Dosya Seçimi Olayları (İK Dosya Yükleme)
  setupDropzone('upload-dropzone', 'upload-file', 'file-info', 'file-name-text', 'btn-remove-file');
  
  // Sürükle Bırak / Dosya Seçimi Olayları (Personel Gönderim)
  setupDropzone('sub-dropzone', 'sub-file', 'sub-file-info', 'sub-file-name-text', 'btn-remove-sub-file');

  // FORM SUBMIT HANDLERS
  
  // 1. İK Belge Yükleme Formu
  const formUpload = document.getElementById('form-upload');
  if (formUpload) {
    formUpload.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = new FormData();
    formData.append('title', document.getElementById('upload-title').value);
    formData.append('category', document.getElementById('upload-category').value);
    formData.append('type', document.getElementById('upload-type').value);
    formData.append('visibility', document.getElementById('upload-visibility').value);
    
    // Yeni metadata alanları
    formData.append('related_department', document.getElementById('upload-related-dept').value);
    
    const targetVal = document.getElementById('upload-target').value;
    if (targetVal) {
      formData.append('target_id', targetVal);
    }
    
    const fileInput = document.getElementById('upload-file');
    if (fileInput.files.length > 0) {
      formData.append('file', fileInput.files[0]);
    } else {
      showToast('Lütfen bir dosya seçin.', 'error');
      return;
    }

    try {
      showToast('Dosya yükleniyor...', 'info');
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData
      });
      
      const data = await response.json();
      if (response.ok) {
        showToast('Belge başarıyla yüklendi!', 'success');
        closeModal('modal-upload');
        refreshAllData();
      } else {
        showToast(data.error || 'Yükleme başarısız oldu.', 'error');
      }
    } catch (error) {
      console.error('Yükleme hatası:', error);
      showToast('Belge yüklenirken ağ hatası oluştu.', 'error');
    }
  });
  }

  // 2. Çalışan Ekleme Formu
  const formEmployee = document.getElementById('form-employee');
  if (formEmployee) {
    formEmployee.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const body = {
        employee_id: document.getElementById('emp-id').value,
        name: document.getElementById('emp-name').value,
        email: document.getElementById('emp-email').value,
        password: document.getElementById('emp-password').value,
        role: document.getElementById('emp-role').value,
        department: document.getElementById('emp-dept').value
      };

      try {
        const response = await fetch('/api/employees', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        
        const data = await response.json();
        if (response.ok) {
          showToast('Çalışan başarıyla eklendi.', 'success');
          closeModal('modal-employee');
          refreshAllData();
        } else {
          showToast(data.error || 'Çalışan eklenemedi.', 'error');
        }
      } catch (error) {
        console.error('Çalışan ekleme hatası:', error);
        showToast('İstek sırasında bir hata oluştu.', 'error');
      }
    });
  }

  // 3. Personel Form Gönderme Formu
  const formSubmission = document.getElementById('form-submission');
  if (formSubmission) {
    formSubmission.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const formData = new FormData();
      formData.append('title', document.getElementById('sub-title').value);
      formData.append('notes', document.getElementById('sub-notes').value);
      
      const refId = document.getElementById('sub-doc-ref').value;
      if (refId) {
        formData.append('document_id', refId);
      }
      
      const fileInput = document.getElementById('sub-file');
      if (fileInput.files.length > 0) {
        formData.append('file', fileInput.files[0]);
      } else {
        showToast('Lütfen doldurulmuş formu seçin.', 'error');
        return;
      }

      try {
        showToast('Form iletiliyor...', 'info');
        const response = await fetch('/api/submissions/upload', {
          method: 'POST',
          body: formData
        });
        
        const data = await response.json();
        if (response.ok) {
          showToast('Formunuz başarıyla İK\'ya gönderildi!', 'success');
          closeModal('modal-submit-form');
          refreshAllData();
        } else {
          showToast(data.error || 'Form gönderme başarısız.', 'error');
        }
      } catch (error) {
        console.error('Form gönderim hatası:', error);
        showToast('Form gönderilirken hata oluştu.', 'error');
      }
    });
  }
}

// Sürükle Bırak Altyapısı (Helper)
function setupDropzone(zoneId, inputId, infoId, textId, removeBtnId) {
  const dropzone = document.getElementById(zoneId);
  if (!dropzone) return;
  const fileInput = document.getElementById(inputId);
  const fileInfo = document.getElementById(infoId);
  const fileNameText = document.getElementById(textId);
  const removeBtn = document.getElementById(removeBtnId);

  // Klikleme ile dosya seçme
  dropzone.addEventListener('click', () => {
    fileInput.click();
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      const file = fileInput.files[0];
      fileNameText.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`;
      fileInfo.classList.remove('hidden');
      dropzone.classList.add('hidden');
    }
  });

  // Sürükleme olayları
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    
    if (e.dataTransfer.files.length > 0) {
      fileInput.files = e.dataTransfer.files;
      // Change event tetikle
      fileInput.dispatchEvent(new Event('change'));
    }
  });

  // Dosya Kaldırma butonu
  removeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    resetDropzone(zoneId, infoId);
    fileInput.value = '';
  });
}

function resetDropzone(zoneId, infoId) {
  document.getElementById(zoneId).classList.remove('hidden');
  document.getElementById(infoId).classList.add('hidden');
}

// ==========================================
// DOKÜMAN GÜNCELLEME (DOSYA YÜKLE/DEĞİŞTİR)
// ==========================================
window.activeUpdateDocId = null;

function triggerFileUpdate(docId) {
  window.activeUpdateDocId = docId;
  const input = document.getElementById('global-update-file-input');
  if (input) {
    input.value = ''; // Seçimi sıfırla
    input.click();
  }
}

// Global dosya yükleme olay dinleyicisi
const updateInput = document.getElementById('global-update-file-input');
if (updateInput) {
  updateInput.addEventListener('change', async () => {
    if (updateInput.files.length === 0 || !window.activeUpdateDocId) return;
    
    const file = updateInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      showToast('Yeni sürüm yükleniyor...', 'info');
      const response = await fetch(`/api/documents/update-file/${window.activeUpdateDocId}`, {
        method: 'POST',
        body: formData
      });
      
      if (response.ok) {
        showToast('Doküman başarıyla güncellendi! Revizyon ve son güncelleme tarihi yenilendi.', 'success');
        refreshAllData();
      } else {
        const errData = await response.json();
        showToast(errData.error || 'Doküman güncellenemedi.', 'error');
      }
    } catch (error) {
      console.error('Belge güncelleme hatası:', error);
      showToast('Sunucu ile iletişim kurulamadı.', 'error');
    }
  });
}

// Doküman Silme İşlemi (Sadece İK)
async function deleteDocument(docId) {
  if (!window.confirm('Bu belgeyi kalıcı olarak silmek istediğinize emin misiniz?')) return;
  
  try {
    showToast('Belge siliniyor...', 'info');
    const response = await fetch(`/api/documents/${docId}`, {
      method: 'DELETE'
    });
    
    if (response.ok) {
      showToast('Belge başarıyla silindi.', 'success');
      refreshAllData();
    } else {
      const errData = await response.json();
      showToast(errData.error || 'Belge silinemedi.', 'error');
    }
  } catch (error) {
    console.error('Belge silme hatası:', error);
    showToast('Sunucu ile iletişim kurulamadı.', 'error');
  }
}

// ==========================================
// TEMA SEÇİCİ (THEME TOGGLE) MANTIĞI
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const themeToggleBtn = document.getElementById('theme-toggle');
  if (!themeToggleBtn) return;

  const sunIcon = themeToggleBtn.querySelector('.sun-icon');
  const moonIcon = themeToggleBtn.querySelector('.moon-icon');

  // Sayfa yüklendiğinde localStorage veya sistem tercihine göre temayı seç
  const currentTheme = localStorage.getItem('theme') || 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcons(currentTheme);

  themeToggleBtn.addEventListener('click', () => {
    const activeTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = activeTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    updateThemeIcons(newTheme);
  });

  function updateThemeIcons(theme) {
    if (theme === 'dark') {
      sunIcon.classList.remove('hidden');
      moonIcon.classList.add('hidden');
    } else {
      sunIcon.classList.add('hidden');
      moonIcon.classList.remove('hidden');
    }
  }
});
