
let currentUser = null;
let syncInterval = null;
let userFavorites = [];
let isOffline = !navigator.onLine;

// ==============================================
// 🌟 הגדרות מנהל המערכת (MASTER) 🌟
let MASTER_EMAILS = []; 
try {
  const cachedAdmins = localStorage.getItem('cached_admins');
  if (cachedAdmins) MASTER_EMAILS = JSON.parse(cachedAdmins);
} catch (e) {}
// ==============================================

function isMaster() {
  return currentUser && MASTER_EMAILS.includes(currentUser.email);
}

const defaultRecipes = [];
let allRecipes = defaultRecipes;
let activeRecipeId = null;
let currentCategory = 'all';
let currentScale = 1.0;

function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function updateNetworkUI() {
  isOffline = !navigator.onLine;
  const banner = document.getElementById('offline-banner');
  if (banner) {
    if (isOffline) {
      banner.classList.add('visible');
    } else {
      banner.classList.remove('visible');
    }
  }
  const addBtn = document.getElementById('btn-add-recipe');
  if (addBtn) {
    addBtn.style.display = isOffline ? 'none' : 'inline-flex';
  }
  renderUserDisplay();
  renderActiveRecipe();
}

window.addEventListener('online', () => {
  isOffline = false;
  updateNetworkUI();
  if (currentUser && supabaseClient) {
    fetchCloudAndMerge();
  }
});

window.addEventListener('offline', () => {
  isOffline = true;
  updateNetworkUI();
});

async function checkSession() {
  isOffline = !navigator.onLine;

  // 1. If offline, try to restore from localStorage immediately
  if (isOffline) {
    const cachedProfile = localStorage.getItem('cached_user_profile');
    if (cachedProfile) {
      try {
        loginSuccess(JSON.parse(cachedProfile));
        return;
      } catch (e) {}
    }
    const savedRecipes = localStorage.getItem(getLocalKey());
    if (savedRecipes) {
      loginSuccess({ email: 'משתמש לא מקוון', id: 'offline_user' });
      return;
    }
    document.getElementById('auth-msg').innerText = "אין חיבור לאינטרנט. נדרש חיבור ראשוני להתחברות.";
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
    return;
  }

  // 2. If online but supabaseClient failed to load
  if (!supabaseClient) {
    const cachedProfile = localStorage.getItem('cached_user_profile');
    if (cachedProfile) {
      try {
        loginSuccess(JSON.parse(cachedProfile));
        return;
      } catch (e) {}
    }
    document.getElementById('auth-msg').innerText = "שגיאת התחברות לשרת. בדוק את החיבור לאינטרנט.";
    return;
  }

  // 3. Online with Supabase
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session) {
      loginSuccess(session.user);
    } else {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app-container').style.display = 'none';
    }
  } catch (err) {
    const cachedProfile = localStorage.getItem('cached_user_profile');
    if (cachedProfile) {
      try {
        loginSuccess(JSON.parse(cachedProfile));
        return;
      } catch (e) {}
    }
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app-container').style.display = 'none';
  }
}

async function handleLogin() {
  const email = document.getElementById('auth-email').value; const password = document.getElementById('auth-password').value;
  const msgEl = document.getElementById('auth-msg');
  if(!email || password.length < 6) { msgEl.innerText = "נא להזין אימייל וסיסמה (לפחות 6 תווים)."; return; }
  msgEl.innerText = "מתחבר...";
  const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) { msgEl.innerText = "שגיאה: " + error.message; } else { msgEl.innerText = ""; loginSuccess(data.user); }
}

async function handleSignup() {
  const email = document.getElementById('auth-email').value; const password = document.getElementById('auth-password').value;
  const msgEl = document.getElementById('auth-msg');
  if(!email || password.length < 6) { msgEl.innerText = "נא להזין אימייל וסיסמה."; return; }
  msgEl.innerText = "נרשם...";
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) { msgEl.innerText = "שגיאה: " + error.message; } else { msgEl.innerText = "נרשמת בהצלחה! מתחבר..."; loginSuccess(data.user); }
}

async function handleLogout() {
  if (supabaseClient) {
    await supabaseClient.auth.signOut();
  }
  currentUser = null; userFavorites = [];
  if(syncInterval) clearInterval(syncInterval);
  try { localStorage.removeItem('cached_user_profile'); } catch(e) {}
  document.getElementById('auth-screen').style.display = 'flex'; document.getElementById('app-container').style.display = 'none';
  document.getElementById('auth-email').value = ''; document.getElementById('auth-password').value = '';
}

function renderUserDisplay() {
  const userDisplayEl = document.getElementById('user-display');
  if (!currentUser || !userDisplayEl) return;
  const username = (currentUser.email && currentUser.email.includes('@')) ? currentUser.email.split('@')[0] : (currentUser.email || 'אורח');
  const masterBadge = isMaster() ? `<span style="font-size:0.75em; background:#e2e8f0; color:#4a5568; padding:2px 8px; border-radius:12px; margin-right:6px; font-weight:700;">מנהל</span>` : '';
  const offlineBadge = isOffline ? `<span class="badge-offline"><i class="fa-solid fa-cloud-slash"></i> אופליין (קריאה בלבד)</span>` : '';
  userDisplayEl.innerHTML = `<i class="fa-regular fa-user" style="margin-left:5px;"></i> מחובר כ: <strong>${escapeHTML(username)}</strong> ${masterBadge} ${offlineBadge}`;

  const expBtn = document.getElementById('btn-export');
  const impBtn = document.getElementById('btn-import');
  if (expBtn) expBtn.style.display = isMaster() ? 'inline-flex' : 'none';
  if (impBtn) impBtn.style.display = (isMaster() && !isOffline) ? 'inline-flex' : 'none';
}

function loginSuccess(user) {
  currentUser = user;
  try {
    if (user && user.email) {
      localStorage.setItem('cached_user_profile', JSON.stringify({ email: user.email, id: user.id }));
    }
  } catch (e) {}

  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-container').style.display = 'block';
  renderUserDisplay();
  initApp();
}

function getLocalKey() { return 'my_recipes_db_shared'; }
function getFavKey() { return 'my_favs_' + (currentUser ? currentUser.id : 'guest'); }

function initApp() {
  try {
    const saved = localStorage.getItem(getLocalKey());
    if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed) && parsed.length > 0) { allRecipes = parsed; } } 
    const savedFavs = localStorage.getItem(getFavKey());
    if (savedFavs) { userFavorites = JSON.parse(savedFavs); }
  } catch (e) {}

  if (!activeRecipeId || !allRecipes.some(r => r.id === activeRecipeId)) { activeRecipeId = allRecipes[0]?.id || null; }
  renderNavList(); renderActiveRecipe();
  updateNetworkUI();

  if (supabaseClient && navigator.onLine) {
    // Immediate fetch when online to prevent stale data!
    fetchCloudAndMerge();
    if (syncInterval) clearInterval(syncInterval);
    syncInterval = setInterval(() => {
      if (navigator.onLine) {
        fetchCloudAndMerge();
      }
    }, 10000);
  }
}

async function fetchCloudAndMerge() {
  if (!navigator.onLine) return;
  if (!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient.from('recipes').select('*').in('id', ['master_db', 'fav_' + currentUser.id, 'admins']);
    if (error || !data) return;
    
    const adminRow = data.find(r => r.id === 'admins');
    if (adminRow && adminRow.data && Array.isArray(adminRow.data)) {
      if (JSON.stringify(adminRow.data) !== JSON.stringify(MASTER_EMAILS)) {
        MASTER_EMAILS = adminRow.data;
        localStorage.setItem('cached_admins', JSON.stringify(MASTER_EMAILS));
        renderUserDisplay();
        renderNavList();
        renderActiveRecipe();
      }
    }

    const masterRow = data.find(r => r.id === 'master_db');
    if (masterRow && masterRow.data && Array.isArray(masterRow.data)) {
      const cloudJson = JSON.stringify(masterRow.data);
      if (cloudJson !== JSON.stringify(allRecipes)) {
        allRecipes = masterRow.data; localStorage.setItem(getLocalKey(), JSON.stringify(allRecipes));
        if (!allRecipes.some(r => r.id === activeRecipeId)) { activeRecipeId = allRecipes[0]?.id || null; }
        renderNavList(); renderActiveRecipe();
      }
    }
    const favRow = data.find(r => r.id === 'fav_' + currentUser.id);
    if (favRow && favRow.data && Array.isArray(favRow.data)) {
      if (JSON.stringify(favRow.data) !== JSON.stringify(userFavorites)) {
        userFavorites = favRow.data; localStorage.setItem(getFavKey(), JSON.stringify(userFavorites));
        renderNavList(); renderActiveRecipe();
      }
    }
  } catch (err) {}
}

async function persistToCloud() {
  if (isOffline || !navigator.onLine) {
    alert("לא ניתן לשמור שינויים במצב לא מקוון (קריאה בלבד).");
    return;
  }
  if (!supabaseClient || !currentUser) return;
  try { localStorage.setItem(getLocalKey(), JSON.stringify(allRecipes)); await supabaseClient.from('recipes').upsert({ id: 'master_db', data: allRecipes }); } catch (err) {}
}

async function toggleFavorite(id) {
  if (isOffline || !navigator.onLine) {
    alert("שינוי מועדפים אינו זמין במצב לא מקוון (קריאה בלבד).");
    return;
  }
  if (userFavorites.includes(id)) { userFavorites = userFavorites.filter(f => f !== id); } else { userFavorites.push(id); }
  localStorage.setItem(getFavKey(), JSON.stringify(userFavorites));
  renderNavList(); renderActiveRecipe();
  if (supabaseClient) { await supabaseClient.from('recipes').upsert({ id: 'fav_' + currentUser.id, data: userFavorites }); }
}

// פונקציית שיתוף לווטסאפ
function shareToWhatsApp() {
  const r = allRecipes.find(item => item.id === activeRecipeId);
  if (!r) return;
  
  const scaledPortions = (r.basePortions * currentScale);
  const formattedPortions = (scaledPortions % 1 === 0) ? scaledPortions : scaledPortions.toFixed(1);
  
  let msg = `*${r.title}* 🍳\n`;
  msg += `מאת: ${r.author} | מנות: ${formattedPortions}\n\n`;
  msg += `*מצרכים:*\n`;
  (r.ingredients || []).forEach(ing => {
    const scaled = (typeof ing.amount === 'number') ? (ing.amount * currentScale) : ing.amount;
    const displayQty = (typeof scaled === 'number') ? (scaled % 1 === 0 ? scaled : scaled.toFixed(1)) : (String(scaled) || '');
    msg += `- ${ing.name}: ${displayQty} ${ing.unit || ''}\n`;
  });
  
  msg += `\n*הוראות הכנה:*\n`;
  (r.instructions || []).forEach((inst, idx) => { msg += `${idx + 1}. ${inst}\n`; });
  
  const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function renderNavList() {
  const navEl = document.getElementById('recipe-list-nav');
  const term = document.getElementById('search-box').value.trim().toLowerCase();
  
  const filtered = allRecipes.filter(r => {
    if (r.isPrivate && r.ownerId !== currentUser?.id && !isMaster()) return false;
    let matchCat = (currentCategory === 'all') ? true : (currentCategory === 'favorites' ? userFavorites.includes(r.id) : r.category === currentCategory);
    return matchCat && (!term || r.title.toLowerCase().includes(term) || r.author.toLowerCase().includes(term));
  });
  
  navEl.innerHTML = filtered.map(r => {
    const isFav = userFavorites.includes(r.id);
    const privateIcon = r.isPrivate ? `<i class="fa-solid fa-lock" style="font-size:8pt; color:#a0aec0; margin-left:4px;" title="מתכון פרטי"></i>` : '';
    const favIcon = isFav ? `<i class="fa-solid fa-heart" style="color:#e53e3e; font-size:8pt; margin-left:4px;"></i>` : '';
    return `<div class="nav-item ${r.id === activeRecipeId ? 'active' : ''}" onclick="selectRecipe('${escapeHTML(r.id)}')">
      <span class="nav-item-title">${privateIcon}${favIcon}${escapeHTML(r.title)}</span>
      <span class="nav-item-sub"><i class="fa-solid fa-pen-nib" style="margin-left:4px; opacity:0.6;"></i>${escapeHTML(r.author)} &bull; ${r.basePortions} מנות</span>
    </div>`;
  }).join('');
}

function selectRecipe(id) {
  activeRecipeId = id; currentScale = 1.0;
  renderNavList(); renderActiveRecipe();
  if (window.innerWidth <= 850) { document.getElementById('recipe-view').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
}

function renderActiveRecipe() {
  const r = allRecipes.find(item => item.id === activeRecipeId);
  const viewEl = document.getElementById('recipe-view');
  if (!r) { viewEl.innerHTML = '<p style="text-align:center; color:#7a7571; padding:40px; font-weight:600;"><i class="fa-solid fa-utensils" style="font-size:2rem; display:block; margin-bottom:10px; color:#dcdad4;"></i>בחר מתכון מהרשימה כדי להתחיל</p>'; return; }

  const scaledPortions = (r.basePortions * currentScale);
  const formattedPortions = (scaledPortions % 1 === 0) ? scaledPortions : scaledPortions.toFixed(1);
  const isFav = userFavorites.includes(r.id);
  const isMine = (!r.ownerId || r.ownerId === currentUser?.id || isMaster());
  const imageHTML = (r.imageUrl && r.imageUrl.trim() !== '') ? `<img src="${escapeHTML(r.imageUrl)}" alt="${escapeHTML(r.title)}" class="recipe-cover-img" loading="lazy">` : '';

  let primaryControl = '';
  if (r.primaryName && r.primaryAmount) {
    const scaledPrimary = Math.round(r.primaryAmount * currentScale);
    primaryControl = `<div class="scaler-item"><label>${escapeHTML(r.primaryName)}:</label><div class="scaler-input-wrap"><input type="number" id="scaler-primary-input" value="${scaledPrimary}" step="50" oninput="scaleByPrimary(this.value)"><span class="scaler-unit">${escapeHTML(r.primaryUnit || 'גרם')}</span></div></div>`;
  }



  viewEl.innerHTML = `
    ${imageHTML}
    <div class="recipe-meta-header">
      <div>
        <h2>${r.isPrivate ? '<i class="fa-solid fa-lock" style="font-size:1.2rem; color:#a0aec0; margin-left:8px;" title="מתכון פרטי"></i>' : ''}${escapeHTML(r.title)}</h2>
        <span class="author-tag"><i class="fa-solid fa-star"></i> מאת: ${escapeHTML(r.author)}</span>
      </div>
      <div style="display:flex; gap:4px; flex-wrap:nowrap; margin-top: 8px;">
        <button class="btn btn-light" style="padding: 8px 10px;" onclick="toggleWakeLock(this)" title="מצב בישול (השאר מסך דולק)">
          <i class="fa-regular fa-lightbulb" style="font-size:1.2rem;"></i>
        </button>
        <button class="btn btn-light" style="padding: 8px 10px;" onclick="window.print()" title="הדפסת מתכון">
          <i class="fa-solid fa-print" style="font-size:1.2rem;"></i>
        </button>
        <button class="btn btn-light" style="padding: 8px 10px;" onclick="shareToWhatsApp()" style="border-color:#25D366; color:#25D366;" title="שתף לווטסאפ">
          <i class="fa-brands fa-whatsapp" style="font-size:1.2rem;"></i>
        </button>
        <button class="btn btn-light" style="padding: 8px 10px;" onclick="toggleFavorite('${escapeHTML(r.id)}')" style="border-color:${isFav ? '#e53e3e' : 'var(--border)'}; opacity:${isOffline ? '0.6' : '1'};" title="${isOffline ? 'סימון מועדפים אינו זמין במצב לא מקוון' : 'מועדפים'}">
          <i class="${isFav ? 'fa-solid' : 'fa-regular'} fa-heart" style="color:${isFav ? '#e53e3e' : 'var(--text-light)'}; font-size:1.1rem;"></i>
        </button>
        ${(isMine && !isOffline) ? `<button class="btn btn-red" style="padding: 8px 10px;" onclick="deleteRecipe('${escapeHTML(r.id)}')" title="מחיקת מתכון"><i class="fa-solid fa-trash-can"></i></button><button class="btn btn-light" style="padding: 8px 10px;" onclick="openEditModal('${escapeHTML(r.id)}')" title="עריכת מתכון"><i class="fa-solid fa-pen"></i></button>` : ''}
      </div>
    </div>
    <div class="scaler-box">
      <div class="scaler-title">
        <i class="fa-solid fa-scale-balanced"></i> חישוב כמויות דינמי:
        <i class="fa-solid fa-circle-info" style="cursor:pointer; opacity:0.6; font-size:11pt; margin-right:6px;" onclick="showInfoModal('איך זה עובד?', 'כאן אפשר לשנות את מספר המנות שרוצים להכין (למשל להכפיל מ-4 ל-8 מנות). ברגע שתשנו, כל הכמויות ברשימת המצרכים וכן הערכים התזונתיים יתעדכנו אוטומטית!\\\\n\\\\nבנוסף, אם הוגדר מרכיב ראשי (כמו קמח בבצק), אפשר פשוט להזין כמה קמח יש לכם כרגע בבית, וכל שאר המתכון יתאים את עצמו.')" title="איך עובד חישוב הכמויות?"></i>
      </div>
      <div class="scaler-grid">
        ${primaryControl}
        <div class="scaler-item"><label>מספר מנות:</label><div class="scaler-input-wrap"><input type="number" id="scaler-portions-input" value="${formattedPortions}" step="0.5" oninput="scaleByPortions(this.value)"><span class="scaler-unit">מנות</span></div></div>
      </div>
    </div>
    <div id="recipe-dynamic-content">
      ${getDynamicHTML(r, currentScale)}
    </div>
    
    <div class="comments-section">
      <div class="comments-title"><i class="fa-regular fa-comments"></i> תגובות וחוויות</div>
      ${(r.comments || []).length === 0 ? '<p style="color: var(--text-light); font-size: 9.5pt;">אין עדיין תגובות. ספרו לנו איך יצא!</p>' : (r.comments || []).map(c => `
        <div class="comment-bubble">
          <div class="comment-meta">
            <span class="comment-author">${escapeHTML(c.author)}</span>
            <span>${new Date(c.timestamp).toLocaleString('he-IL', {day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit'})}</span>
          </div>
          <div class="comment-text">${escapeHTML(c.text)}</div>
        </div>
      `).join('')}
      ${!isOffline ? `
      <div class="comment-input-wrap">
        <textarea id="new-comment-text-${r.id}" placeholder="הוסף תגובה..."></textarea>
        <button class="btn btn-green" style="background:#4338ca; border:none;" onclick="addComment('${escapeHTML(r.id)}')"><i class="fa-solid fa-paper-plane"></i></button>
      </div>` : `<p style="font-size: 9pt; color: var(--text-light); margin-top: 10px;">לא ניתן להגיב במצב לא מקוון.</p>`}
    </div>
    </div>
  `;
}

function getDynamicHTML(r, currentScale) {
  const scaledPortions = (r.basePortions * currentScale);
  const nut = r.nutrition || { cals: 0, protein: 0, carbs: 0, fat: 0 };
  let cals = Math.round(nut.cals * currentScale), protein = Math.round(nut.protein * currentScale), carbs = Math.round(nut.carbs * currentScale), fat = Math.round(nut.fat * currentScale);
  const perCals = scaledPortions > 0 ? Math.round(cals / scaledPortions) : 0, perProtein = scaledPortions > 0 ? (protein / scaledPortions).toFixed(1) : 0, perCarbs = scaledPortions > 0 ? (carbs / scaledPortions).toFixed(1) : 0, perFat = scaledPortions > 0 ? (fat / scaledPortions).toFixed(1) : 0;

  return `
    <table class="nutrition-table">
      <thead><tr><th>ערך תזונתי</th><th>סך הכל</th><th>למנה בודדת</th></tr></thead>
      <tbody>
        <tr><td><strong>קלוריות</strong></td><td class="val-num">${cals.toLocaleString()} קק"ל</td><td>${perCals} קק"ל</td></tr>
        <tr><td><strong>חלבון</strong></td><td class="val-num">${protein} גרם</td><td>${perProtein} גרם</td></tr>
        <tr><td><strong>פחמימות</strong></td><td class="val-num">${carbs} גרם</td><td>${perCarbs} גרם</td></tr>
        <tr><td><strong>שומן</strong></td><td class="val-num">${fat} גרם</td><td>${perFat} גרם</td></tr>
      </tbody>
    </table>
    <div class="recipe-columns">
      <div><div class="col-title"><i class="fa-solid fa-basket-shopping"></i> מצרכים מעודכנים</div><ul class="ing-list">
        ${(r.ingredients || []).map(ing => {
          const scaled = (typeof ing.amount === 'number') ? (ing.amount * currentScale) : ing.amount;
          const displayQty = (typeof scaled === 'number') ? (scaled % 1 === 0 ? scaled : scaled.toFixed(1)) : (escapeHTML(String(scaled)) || '');
          return `<li class="ing-row" onclick="this.classList.toggle('step-checked')" title="סמן כבוצע"><span class="ing-name">${escapeHTML(ing.name)}</span><span class="ing-qty">${displayQty} ${escapeHTML(ing.unit || '')}</span></li>`;
        }).join('')}
      </ul>
      <div class="ai-chef-box">
        <div class="ai-chef-title"><i class="fa-solid fa-wand-magic-sparkles"></i> חסר מרכיב? שאל את ה-AI</div>
        <div class="ai-chef-input-wrap">
          <input type="text" id="ai-chef-q-${r.id}" placeholder="לדוגמה: במה להחליף את הביצה?" onkeydown="if(event.key === 'Enter') askAiAssistant('${escapeHTML(r.id)}')">
          <button class="btn btn-light" onclick="askAiAssistant('${escapeHTML(r.id)}')"><i class="fa-solid fa-paper-plane"></i></button>
        </div>
        <div id="ai-chef-res-${r.id}" class="ai-chef-response" style="display:none;"></div>
      </div>
      </div>
      <div><div class="col-title"><i class="fa-solid fa-fire-burner"></i> הוראות הכנה</div><ol class="inst-list">${(r.instructions || []).map(item => `<li onclick="this.classList.toggle('step-checked')" title="סמן כבוצע">${escapeHTML(item)}</li>`).join('')}</ol></div>
    </div>
  `;
}

function updateDynamicUI(r) {
  const dynamicDiv = document.getElementById('recipe-dynamic-content');
  if (dynamicDiv) dynamicDiv.innerHTML = getDynamicHTML(r, currentScale);
  
  const portionsInput = document.getElementById('scaler-portions-input');
  if (portionsInput && document.activeElement !== portionsInput) {
    const scaledPortions = (r.basePortions * currentScale);
    portionsInput.value = (scaledPortions % 1 === 0) ? scaledPortions : scaledPortions.toFixed(1);
  }
  
  const primaryInput = document.getElementById('scaler-primary-input');
  if (primaryInput && document.activeElement !== primaryInput) {
    primaryInput.value = Math.round(r.primaryAmount * currentScale);
  }
}

function scaleByPortions(val) { const num = parseFloat(val); const r = allRecipes.find(i => i.id === activeRecipeId); if (num > 0 && r) { currentScale = num / r.basePortions; updateDynamicUI(r); } }
function scaleByPrimary(val) { const num = parseFloat(val); const r = allRecipes.find(i => i.id === activeRecipeId); if (num > 0 && r && r.primaryAmount) { currentScale = num / r.primaryAmount; updateDynamicUI(r); } }
function setCategory(cat, el) { currentCategory = cat; document.querySelectorAll('.chip').forEach(c => c.classList.remove('active')); el.classList.add('active'); renderNavList(); }
function filterRecipes() { renderNavList(); }

async function addComment(recipeId) {
  if (isOffline) { showInfoModal('שגיאה', 'לא ניתן להגיב ללא אינטרנט.'); return; }
  const textInput = document.getElementById(`new-comment-text-${recipeId}`);
  if (!textInput) return;
  const text = textInput.value.trim();
  if (!text) return;
  
  const recipeIndex = allRecipes.findIndex(r => r.id === recipeId);
  if (recipeIndex === -1) return;
  
  const author = (currentUser && currentUser.email) ? currentUser.email.split('@')[0] : 'אורח';
  const newComment = {
    id: 'c_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    author: author,
    text: text,
    timestamp: new Date().toISOString()
  };
  
  if (!allRecipes[recipeIndex].comments) {
    allRecipes[recipeIndex].comments = [];
  }
  allRecipes[recipeIndex].comments.push(newComment);
  allRecipes[recipeIndex].updatedAt = new Date().toISOString();
  
  textInput.value = '';
  renderActiveRecipe();
  await persistToCloud();
}

async function askAiAssistant(recipeId) {
  if (isOffline || !navigator.onLine) { showInfoModal('שגיאה', 'העוזר החכם דורש חיבור לאינטרנט.'); return; }
  const inputEl = document.getElementById(`ai-chef-q-${recipeId}`);
  const resEl = document.getElementById(`ai-chef-res-${recipeId}`);
  const question = inputEl.value.trim();
  if (!question) return;

  const recipe = allRecipes.find(r => r.id === recipeId);
  if (!recipe) return;

  resEl.style.display = 'block';
  resEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> העוזר חושב על תשובה...';
  
  try {
    const { data, error } = await supabaseClient.functions.invoke('ask-recipe-ai', {
      body: { recipe, question }
    });
    
    if (error || (data && data.error)) {
      resEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#e53e3e;"></i> שגיאה בתקשורת עם ה-AI. נסה שוב.';
      console.error(error || data?.error);
    } else {
      const ans = data?.answer || "לא התקבלה תשובה.";
      resEl.innerHTML = `<strong>תשובה:</strong><br>${escapeHTML(ans).replace(/\n/g, '<br>')}`;
      inputEl.value = '';
    }
  } catch (err) {
    resEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color:#e53e3e;"></i> אירעה שגיאה. נסה שוב.';
    console.error(err);
  }
}

let wakeLock = null;
async function toggleWakeLock(btnEl) {
  if (!('wakeLock' in navigator)) { alert('הדפדפן שלך לא תומך במצב בישול.'); return; }
  try {
    if (wakeLock !== null) {
      await wakeLock.release();
      wakeLock = null;
      btnEl.style.borderColor = 'var(--border)';
      btnEl.style.color = 'var(--text-light)';
    } else {
      wakeLock = await navigator.wakeLock.request('screen');
      btnEl.style.borderColor = '#d69e2e';
      btnEl.style.color = '#d69e2e';
      wakeLock.addEventListener('release', () => {
        wakeLock = null;
        btnEl.style.borderColor = 'var(--border)';
        btnEl.style.color = 'var(--text-light)';
      });
    }
  } catch (err) {
    console.error(err);
    alert('שגיאה בהפעלת מצב בישול: ' + err.message);
  }
}

let aiImageData = null;
let aiImageMime = null;

function showInfoModal(title, text) {
  document.getElementById('info-modal-title').innerText = title;
  document.getElementById('info-modal-text').innerText = text;
  document.getElementById('info-modal').classList.add('open');
}

function closeInfoModal() {
  document.getElementById('info-modal').classList.remove('open');
}

function toggleAiBox() {
  const box = document.getElementById('ai-box');
  box.style.display = box.style.display === 'none' ? 'block' : 'none';
}

function previewAiImage(e) {
  const file = e.target.files[0];
  if (!file) return;
  openCropModal(file, 'ai');
  e.target.value = '';
}

async function processAiBlob(blob) {
  const reader = new FileReader();
  reader.onload = (event) => {
    aiImageData = event.target.result.split(',')[1];
    aiImageMime = 'image/jpeg';
    document.getElementById('ai-image-preview').src = event.target.result;
    document.getElementById('ai-image-preview-container').style.display = 'flex';
  };
  reader.readAsDataURL(blob);
}

function clearAiImage() {
  aiImageData = null;
  aiImageMime = null;
  document.getElementById('ai-image-upload-camera').value = '';
  document.getElementById('ai-image-upload-gallery').value = '';
  document.getElementById('ai-image-preview-container').style.display = 'none';
}

async function processAiImport(btn) {
  if (isOffline || !navigator.onLine) { alert("ייבוא חכם דורש חיבור לאינטרנט."); return; }
  const text = document.getElementById('ai-input-text').value.trim();
  
  if (!text && !aiImageData) { 
    alert("אנא הדבק טקסט או בחר תמונה לפני הלחיצה."); 
    return; 
  }
  
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> מנתח עם AI...';
  btn.disabled = true;

  try {
    const payload = { text: text };
    if (aiImageData) {
      payload.image_base64 = aiImageData;
      payload.image_mime_type = aiImageMime;
    }

    const { data, error } = await supabaseClient.functions.invoke('parse-recipe', {
      body: payload
    });

    if (error) throw error;
    if (data && data.error) throw new Error(data.error);
    if (!data || !data.recipe) throw new Error("תשובה לא תקינה מהשרת.");

    const r = data.recipe;
    if (r.title) document.getElementById('m-title').value = r.title;
    if (r.author && r.author !== 'מקור לא ידוע') document.getElementById('m-author').value = r.author;
    if (r.category) document.getElementById('m-category').value = r.category;
    if (r.basePortions) document.getElementById('m-portions').value = r.basePortions;
    
    if (r.primaryName) document.getElementById('m-prim-name').value = r.primaryName;
    if (r.primaryAmount !== undefined && r.primaryAmount !== null) document.getElementById('m-prim-qty').value = r.primaryAmount;

    if (r.nutrition) {
      if (r.nutrition.cals) document.getElementById('m-cals').value = r.nutrition.cals;
      if (r.nutrition.protein) document.getElementById('m-protein').value = r.nutrition.protein;
      if (r.nutrition.carbs) document.getElementById('m-carbs').value = r.nutrition.carbs;
      if (r.nutrition.fat) document.getElementById('m-fat').value = r.nutrition.fat;
    }

    if (r.ingredients && Array.isArray(r.ingredients)) {
      document.getElementById('m-ingredients').value = r.ingredients.map(ing => 
        `${ing.name || ''} | ${ing.amount !== undefined && ing.amount !== null ? ing.amount : ''} | ${ing.unit || ''}`.trim()
      ).join('\n');
    }

    if (r.instructions && Array.isArray(r.instructions)) {
      document.getElementById('m-instructions').value = r.instructions.join('\n');
    }

    alert("הניתוח הושלם בהצלחה! אנא עבור על הנתונים וודא שהכל תקין לפני השמירה.");
    toggleAiBox(); // close box
  } catch (err) {
    alert("שגיאה בניתוח: " + err.message);
  } finally {
    btn.innerHTML = originalHtml;
    btn.disabled = false;
  }
}

function openAddModal() {
  if (isOffline || !navigator.onLine) { alert("הוספת מתכון אינה אפשרית במצב לא מקוון (קריאה בלבד)."); return; }
  document.getElementById('modal-heading').innerHTML = '<i class="fa-solid fa-plus"></i> הוספת מתכון לספר'; document.getElementById('m-id').value = '';
  document.getElementById('new-recipe-form').reset(); document.getElementById('m-private').checked = false;
  if(currentUser && currentUser.email) { document.getElementById('m-author').value = currentUser.email.split('@')[0]; }
  clearAiImage(); document.getElementById('ai-input-text').value = ''; document.getElementById('ai-box').style.display = 'none';
  document.getElementById('upload-status').style.display = 'none'; document.getElementById('add-modal').classList.add('open');
}

function openEditModal(id) {
  if (isOffline || !navigator.onLine) { alert("עריכת מתכון אינה אפשרית במצב לא מקוון (קריאה בלבד)."); return; }
  const r = allRecipes.find(item => item.id === id);
  if (!r || (r.ownerId && r.ownerId !== currentUser?.id && !isMaster())) return; 
  document.getElementById('modal-heading').innerHTML = `<i class="fa-solid fa-pen"></i> עריכת מתכון: ${escapeHTML(r.title)}`;
  document.getElementById('m-id').value = r.id; document.getElementById('m-title').value = r.title || ''; document.getElementById('m-author').value = r.author || '';
  document.getElementById('m-category').value = r.category || 'עיקריות'; document.getElementById('m-image-url').value = r.imageUrl || ''; document.getElementById('m-private').checked = r.isPrivate || false;
  document.getElementById('m-portions').value = r.basePortions || ''; document.getElementById('m-prim-name').value = r.primaryName || ''; document.getElementById('m-prim-qty').value = r.primaryAmount || '';
  document.getElementById('m-cals').value = r.nutrition?.cals ?? ''; document.getElementById('m-protein').value = r.nutrition?.protein ?? ''; document.getElementById('m-carbs').value = r.nutrition?.carbs ?? ''; document.getElementById('m-fat').value = r.nutrition?.fat ?? '';
  document.getElementById('m-ingredients').value = Array.isArray(r.ingredients) ? r.ingredients.map(ing => `${ing.name} | ${ing.amount !== undefined && ing.amount !== null ? ing.amount : ''} | ${ing.unit || ''}`.trim()).join('\n') : '';
  document.getElementById('m-instructions').value = Array.isArray(r.instructions) ? r.instructions.join('\n') : '';
  document.getElementById('add-modal').classList.add('open');
}

function closeAddModal() { document.getElementById('add-modal').classList.remove('open'); }

let currentCropper = null;
let currentCropTarget = null;

function openCropModal(file, target) {
  currentCropTarget = target;
  const url = URL.createObjectURL(file);
  const imgEl = document.getElementById('crop-image');
  imgEl.src = url;
  document.getElementById('crop-modal').classList.add('open');
  if (currentCropper) currentCropper.destroy();
  setTimeout(() => {
    currentCropper = new Cropper(imgEl, {
      aspectRatio: target === 'cover' ? 16 / 9 : NaN,
      viewMode: 1,
      autoCropArea: 1,
    });
  }, 100);
}

function closeCropModal() {
  document.getElementById('crop-modal').classList.remove('open');
  if (currentCropper) currentCropper.destroy();
  currentCropper = null;
}

function confirmCrop() {
  if (!currentCropper) return;
  const canvas = currentCropper.getCroppedCanvas({ maxWidth: 1920, maxHeight: 1920, fillColor: '#fff' });
  canvas.toBlob(async (blob) => {
    closeCropModal();
    if (currentCropTarget === 'cover') {
       await uploadCoverBlob(blob);
    } else {
       await processAiBlob(blob);
    }
  }, 'image/jpeg', 0.85);
}

function handleImageUpload(event) {
  if (isOffline || !navigator.onLine) { alert("העלאת תמונות אינה אפשרית במצב לא מקוון."); return; }
  const file = event.target.files[0]; if (!file) return;
  openCropModal(file, 'cover');
  event.target.value = '';
}

async function uploadCoverBlob(blob) {
  const statusEl = document.getElementById('upload-status'); statusEl.style.display = 'block'; statusEl.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> מעלה...'; statusEl.style.color = 'var(--secondary)';
  const fileName = `img_${Date.now()}_${Math.random().toString(36).substring(2,7)}.jpg`;
  try {
    const { error } = await supabaseClient.storage.from('recipe-images').upload(fileName, blob, { contentType: 'image/jpeg' }); 
    if (error) throw error;
    const { data: publicUrlData } = supabaseClient.storage.from('recipe-images').getPublicUrl(fileName);
    document.getElementById('m-image-url').value = publicUrlData.publicUrl;
    statusEl.innerHTML = '<i class="fa-solid fa-check"></i> הועלה בהצלחה!'; statusEl.style.color = '#38a169'; setTimeout(() => statusEl.style.display = 'none', 3000);
  } catch (err) { statusEl.innerHTML = '<i class="fa-solid fa-triangle-exclamation"></i> שגיאה'; statusEl.style.color = '#e53e3e'; }
}

async function deleteRecipe(id) {
  if (isOffline || !navigator.onLine) { alert("מחיקת מתכון אינה אפשרית במצב לא מקוון (קריאה בלבד)."); return; }
  if (confirm("למחוק את המתכון הזה לצמיתות?")) {
    allRecipes = allRecipes.filter(r => r.id !== id);
    if (activeRecipeId === id) { activeRecipeId = allRecipes.length > 0 ? allRecipes[0].id : null; }
    await persistToCloud(); renderNavList(); renderActiveRecipe();
  }
}

async function saveNewRecipe(e) {
  e.preventDefault();
  if (isOffline || !navigator.onLine) { alert("לא ניתן לשמור שינויים במצב לא מקוון (קריאה בלבד)."); return; }
  const editId = document.getElementById('m-id').value, title = document.getElementById('m-title').value.trim() || 'מתכון ללא שם', author = document.getElementById('m-author').value.trim() || 'משפחת מוטאי סניבר', category = document.getElementById('m-category').value || 'עיקריות', imageUrl = document.getElementById('m-image-url').value.trim(), isPrivate = document.getElementById('m-private').checked, portions = parseFloat(document.getElementById('m-portions').value) || 1, primName = document.getElementById('m-prim-name').value.trim(), primQty = parseFloat(document.getElementById('m-prim-qty').value) || null;
  const nutrition = { cals: parseFloat(document.getElementById('m-cals').value) || 0, protein: parseFloat(document.getElementById('m-protein').value) || 0, carbs: parseFloat(document.getElementById('m-carbs').value) || 0, fat: parseFloat(document.getElementById('m-fat').value) || 0 };
  const ingredients = document.getElementById('m-ingredients').value.split('\n').filter(l => l.trim()).map(l => { const parts = l.split('|'); return { name: parts[0]?.trim() || '', amount: parseFloat(parts[1]?.trim()) || parts[1]?.trim() || '', unit: parts[2]?.trim() || '' }; });
  const instructions = document.getElementById('m-instructions').value.split('\n').filter(l => l.trim());

  if (editId) {
    const index = allRecipes.findIndex(item => item.id === editId);
    if (index !== -1) {
      const ownerId = allRecipes[index].ownerId || currentUser.id;
      allRecipes[index] = { ...allRecipes[index], ownerId, title, author, category, imageUrl, isPrivate, basePortions: portions, primaryName: primName || null, primaryAmount: primQty, nutrition, ingredients, instructions };
      activeRecipeId = editId;
    }
  } else {
    const newRecipe = { id: 'rec_' + (window.crypto ? window.crypto.randomUUID() : Date.now()), ownerId: currentUser.id, isPrivate, title, author, category, imageUrl, basePortions: portions, primaryName: primName || null, primaryAmount: primQty, primaryUnit: 'גרם', isMeat: false, nutrition, ingredients, instructions };
    allRecipes.unshift(newRecipe); activeRecipeId = newRecipe.id;
  }
  await persistToCloud(); closeAddModal(); document.getElementById('new-recipe-form').reset(); currentScale = 1.0; renderNavList(); renderActiveRecipe();
}

function exportData() {
  const blob = new Blob([JSON.stringify(allRecipes, null, 2)], { type: 'application/json' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'motai_sniver_recipes_backup.json'; a.click();
}

async function importData(event) {
  if (isOffline || !navigator.onLine) { alert("שחזור נתונים אינו זמין במצב לא מקוון."); event.target.value = ''; return; }
  const file = event.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (Array.isArray(data) && data.length > 0) {
        allRecipes = data; activeRecipeId = allRecipes[0]?.id; currentScale = 1.0;
        await persistToCloud(); renderNavList(); renderActiveRecipe(); alert('ספר המתכונים יובא בהצלחה!');
      }
    } catch(err) { alert('שגיאה בקריאת הקובץ.'); }
  };
  reader.readAsText(file);
}

checkSession();
