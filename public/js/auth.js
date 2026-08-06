// İK Belge Portalı - Oturum Yönetimi ve Kimlik Doğrulama

let currentUser = null;

// Toast Bildirimi Göster
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  
  toast.innerHTML = `
    <span>${icon}</span>
    <div>${message}</div>
  `;
  
  container.appendChild(toast);
  
  // 4 saniye sonra kaldır
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-10px)';
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 4000);
}

// Oturum durumunu kontrol et
async function checkSession() {
  try {
    const response = await fetch('/api/auth/me');
    if (response.ok) {
      const data = await response.json();
      currentUser = data.user;
      showAppScreen();
    } else {
      showLoginScreen();
    }
  } catch (error) {
    console.error('Oturum kontrol edilirken hata oluştu:', error);
    showLoginScreen();
  }
}

// Giriş Ekranını Göster
function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app-screen').classList.add('hidden');
  currentUser = null;
}

// Uygulama Ekranını Göster
function showAppScreen() {
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app-screen').classList.remove('hidden');
  
  // Kullanıcı bilgilerini header'a yazdır
  const nameElem = document.getElementById('user-display-name');
  if (nameElem) nameElem.textContent = currentUser.name;

  const roleElem = document.getElementById('user-display-role');
  if (roleElem) roleElem.textContent = currentUser.role === 'hr' ? 'İK Yetkilisi' : 'Çalışan';

  const welcomeTitle = document.getElementById('welcome-title');
  if (welcomeTitle) welcomeTitle.textContent = `Hoş Geldiniz, ${currentUser.name}`;
  
  // İsim baş harflerini alıp avatara yazdır
  const avatarElem = document.getElementById('user-avatar-initials');
  if (avatarElem) {
    const initials = currentUser.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    avatarElem.textContent = initials;
  }

  // Rol bazlı arayüz düzenlemelerini yap
  configureRoleViews();
  
  // Dashboard verilerini çek
  initDashboard();
}

// Rol bazlı arayüz düzenlemesi
function configureRoleViews() {
  const hrActions = document.getElementById('hr-actions-top');
  const thVisibility = document.getElementById('th-visibility');
  const thDownloads = document.getElementById('th-downloads');
  const hrLogs = document.getElementById('hr-panel-logs');
  const hrEmployees = document.getElementById('hr-panel-employees');
  const employeeSubmissions = document.getElementById('employee-panel-submissions');
  const statLabelSubmissions = document.getElementById('stat-label-submissions');
  const statCardEmployees = document.getElementById('stat-card-employees');
  const statCardDownloads = document.getElementById('stat-card-downloads');

  if (currentUser.role === 'hr') {
    // İK Yetkilisi Görünümü
    if (hrActions) hrActions.classList.remove('hidden');
    if (thVisibility) thVisibility.classList.remove('hidden');
    if (thDownloads) thDownloads.classList.remove('hidden');
    if (hrLogs) hrLogs.classList.remove('hidden');
    if (hrEmployees) hrEmployees.classList.remove('hidden');
    if (employeeSubmissions) employeeSubmissions.classList.remove('hidden');
    if (statLabelSubmissions) statLabelSubmissions.textContent = 'Bekleyen Formlar';
    if (statCardEmployees) statCardEmployees.classList.remove('hidden');
    if (statCardDownloads) statCardDownloads.classList.remove('hidden');
  } else {
    // Standart Personel Görünümü
    if (hrActions) hrActions.classList.add('hidden');
    if (thVisibility) thVisibility.classList.add('hidden');
    if (thDownloads) thDownloads.classList.add('hidden');
    if (hrLogs) hrLogs.classList.add('hidden');
    if (hrEmployees) hrEmployees.classList.add('hidden');
    if (employeeSubmissions) employeeSubmissions.classList.add('hidden');
    if (statLabelSubmissions) statLabelSubmissions.textContent = 'Gönderdiğim Formlar';
    if (statCardEmployees) statCardEmployees.classList.add('hidden');
    if (statCardDownloads) statCardDownloads.classList.add('hidden');
  }
}

// Çıkış Yapma İşlemi
async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', { method: 'POST' });
    if (response.ok) {
      showToast('Oturum kapatıldı.', 'success');
      showLoginScreen();
    } else {
      showToast('Çıkış yapılırken hata oluştu.', 'error');
    }
  } catch (error) {
    console.error('Çıkış hatası:', error);
    showToast('Ağ hatası oluştu.', 'error');
  }
}

// Giriş Formu Submit Handler
const loginForm = document.getElementById('login-form');
if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      
      const data = await response.json();
      
      if (response.ok) {
        currentUser = data.user;
        showToast('Giriş başarılı!', 'success');
        showAppScreen();
      } else {
        showToast(data.error || 'Giriş yapılamadı.', 'error');
      }
    } catch (error) {
      console.error('Giriş isteği hatası:', error);
      showToast('Sunucu ile iletişim kurulamadı.', 'error');
    }
  });
}

// Çıkış Butonu
const logoutBtn = document.getElementById('btn-logout');
if (logoutBtn) {
  logoutBtn.addEventListener('click', handleLogout);
}

// Profil Menüsü Açma/Kapatma (Dropdown)
document.addEventListener('click', (e) => {
  const trigger = document.getElementById('profile-trigger');
  const dropdown = document.getElementById('profile-dropdown');
  if (!trigger || !dropdown) return;
  
  if (trigger.contains(e.target)) {
    dropdown.classList.toggle('hidden');
  } else {
    dropdown.classList.add('hidden');
  }
});

// Uygulama yüklendiğinde oturumu kontrol et
document.addEventListener('DOMContentLoaded', checkSession);

window.switchAuthTab = function(mode) {
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const formLogin = document.getElementById('login-form');
  const formRegister = document.getElementById('register-form');
  
  if (!tabLogin || !tabRegister || !formLogin || !formRegister) return;
  
  if (mode === 'login') {
    tabLogin.classList.add('active');
    tabRegister.classList.remove('active');
    formLogin.classList.remove('hidden');
    formRegister.classList.add('hidden');
  } else {
    tabRegister.classList.add('active');
    tabLogin.classList.remove('active');
    formRegister.classList.remove('hidden');
    formLogin.classList.add('hidden');
  }
}

// Kayıt Formu Submit Handler
document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const name = document.getElementById('register-name').value;
      const email = document.getElementById('register-email').value;
      const role = document.getElementById('register-role').value;
      const password = document.getElementById('register-password').value;
      
      try {
        const response = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, email, role, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
          showToast(data.message || 'Kayıt başarılı! Şimdi giriş yapabilirsiniz.', 'success');
          // Giriş formuna geri dön
          switchAuthTab('login');
          // E-posta alanını doldur
          document.getElementById('login-email').value = email;
          document.getElementById('login-password').value = '';
        } else {
          showToast(data.error || 'Kayıt olunamadı.', 'error');
        }
      } catch (error) {
        console.error('Kayıt isteği hatası:', error);
        showToast('Sunucu ile iletişim kurulamadı.', 'error');
      }
    });
  }
});
