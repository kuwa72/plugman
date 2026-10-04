let allPlugins = []; // スキャンされたすべてのプラグイン
let currentFilterCategory = 'all';
let currentFilterType = 'all'; // all, vst3, vst2
let currentSearchQuery = '';
let settings = {};
let isAnalyzingAll = false;
let activeUninstallPlugin = null; // 現在アンインストールモーダルで対象としているプラグイン
let detectedUninstallInfo = null; // 検出されたアンインストール情報

// 一括解析のバッチ設定
const ANALYZE_BATCH_SIZE = 10;
const ANALYZE_BATCH_CONCURRENCY = 2;

// ----------------------------------------------------
// i18n
// ----------------------------------------------------
let currentLang = 'en';

function detectSystemLang() {
  const nav = (navigator.language || 'en').toLowerCase();
  for (const lang of PLUGMAN_SUPPORTED_LANGS) {
    if (nav === lang || nav.startsWith(lang + '-')) return lang;
  }
  // zh-TW/zh-HK などは簡体字辞書へフォールバック
  if (nav.startsWith('zh')) return 'zh';
  return 'en';
}

function resolveLang() {
  const pref = settings.language || 'auto';
  return pref === 'auto' ? detectSystemLang() : pref;
}

function t(key, params) {
  let str = PLUGMAN_LOCALES[currentLang] && PLUGMAN_LOCALES[currentLang][key];
  if (str === undefined) str = PLUGMAN_LOCALES.en[key];
  if (str === undefined) return key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.split(`{${k}}`).join(String(v));
    }
  }
  return str;
}

function applyI18n() {
  currentLang = resolveLang();
  document.documentElement.lang = currentLang;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach(el => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    el.placeholder = t(el.getAttribute('data-i18n-ph'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });

  // キー表示/非表示ボタンは入力状態に依存するため個別更新
  btnToggleKeyVisibility.textContent = inputApiKey.type === 'password'
    ? t('settings.apikey.show') : t('settings.apikey.hide');

  // 動的コンテンツの再描画
  updateStatistics();
  renderCategorySidebar();
  filterAndRenderPlugins();
}

function localeTag() {
  return PLUGMAN_LOCALE_TAGS[currentLang] || 'en-US';
}

// カテゴリキー → i18nキーの対応
function categoryLabel(catKey) {
  const map = {
    'all': 'cat.all',
    'Synthesizer': 'cat.synthesizer',
    'Sampler': 'cat.sampler',
    'Equalizer': 'cat.equalizer',
    'Compressor': 'cat.compressor',
    'Reverb': 'cat.reverb',
    'Delay': 'cat.delay',
    'Distortion': 'cat.distortion',
    'Modulation': 'cat.modulation',
    'Utility': 'cat.utility',
    'Other': 'cat.other',
    'unresolved': 'cat.unresolved',
    'Not Plugin': 'cat.not_plugin'
  };
  return map[catKey] ? t(map[catKey]) : catKey;
}

// DOMの取得
const tabPlugins = document.getElementById('tab-plugins');
const tabSettings = document.getElementById('tab-settings');
const btnNavAll = document.getElementById('btn-nav-all');
const btnNavSettings = document.getElementById('btn-nav-settings');
const pluginList = document.getElementById('plugin-list');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');
const searchInput = document.getElementById('search-input');
const filterBtns = document.querySelectorAll('.filter-btn');
const btnScan = document.getElementById('btn-scan');
const btnAnalyzeAll = document.getElementById('btn-analyze-all');
const btnReanalyzeAll = document.getElementById('btn-reanalyze-all');

// 統計表示
const statTotal = document.getElementById('stat-total');
const statAnalyzed = document.getElementById('stat-analyzed');
const statUnresolved = document.getElementById('stat-unresolved');
const statNotPlugin = document.getElementById('stat-not-plugin');
const statNotPluginCard = document.getElementById('stat-not-plugin-card');

// 設定関連のDOM
const inputApiKey = document.getElementById('input-api-key');
const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
const selectLanguage = document.getElementById('select-language');
const scanPathsList = document.getElementById('scan-paths-list');
const inputNewPath = document.getElementById('input-new-path');
const btnAddPath = document.getElementById('btn-add-path');
const btnSaveSettings = document.getElementById('btn-save-settings');
const btnResetCache = document.getElementById('btn-reset-cache');

// 一括解析モーダル関連のDOM
const modalProgress = document.getElementById('modal-progress');
const progressBarFill = document.getElementById('progress-bar-fill');
const progressCurrent = document.getElementById('progress-current');
const progressTotal = document.getElementById('progress-total');
const progressLog = document.getElementById('progress-log');
const btnCancelAnalyze = document.getElementById('btn-cancel-analyze');

// アンインストール支援モーダル関連のDOM
const modalUninstall = document.getElementById('modal-uninstall');
const uninstallPluginInfo = document.getElementById('uninstall-plugin-info');
const optLocalUninstaller = document.getElementById('opt-local-uninstaller');
const optPluginManager = document.getElementById('opt-plugin-manager');
const managerButtonsContainer = document.getElementById('manager-buttons-container');
const btnRunLocalUninst = document.getElementById('btn-run-local-uninst');
const btnOpenWinApps = document.getElementById('btn-open-win-apps');
const btnForceDelete = document.getElementById('btn-force-delete');
const btnCloseUninstallModal = document.getElementById('btn-close-uninstall-modal');

// チャット関連のDOM取得
const chatPanel = document.getElementById('chat-panel');
const btnToggleChat = document.getElementById('btn-toggle-chat');
const btnCloseChat = document.getElementById('btn-close-chat');
const chatMessages = document.getElementById('chat-messages');
const chatInput = document.getElementById('chat-input');
const btnSendChat = document.getElementById('btn-send-chat');

// 初期ロード
window.addEventListener('DOMContentLoaded', async () => {
  // Lucideアイコンの初期化
  lucide.createIcons();
  
  // チャットパネルをデフォルトで閉じる
  chatPanel.classList.add('closed');
  
  // 設定の読み込みと表示
  await loadAndDisplaySettings();
  
  // プラグインのスキャン
  await scanAndRenderPlugins();
  
  // チャットイベントの初期化
  btnToggleChat.addEventListener('click', () => {
    chatPanel.classList.toggle('closed');
  });
  
  btnCloseChat.addEventListener('click', () => {
    chatPanel.classList.add('closed');
  });
  
  btnSendChat.addEventListener('click', sendChatMessage);
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      sendChatMessage();
    }
  });
});

// タブ切り替え
btnNavAll.addEventListener('click', () => switchTab('all'));
btnNavSettings.addEventListener('click', () => switchTab('settings'));

function switchTab(tabName) {
  if (tabName === 'all') {
    btnNavAll.classList.add('active');
    btnNavSettings.classList.remove('active');
    tabPlugins.classList.add('active');
    tabSettings.classList.remove('active');
  } else {
    btnNavAll.classList.remove('active');
    btnNavSettings.classList.add('active');
    tabPlugins.classList.remove('active');
    tabSettings.classList.add('active');
  }
}

// ----------------------------------------------------
// 設定関連の処理
// ----------------------------------------------------
async function loadAndDisplaySettings() {
  settings = await window.api.getSettings();
  inputApiKey.value = settings.apiKey;
  selectLanguage.value = settings.language || 'auto';
  applyI18n();
  renderScanPaths();
}

function renderScanPaths() {
  scanPathsList.innerHTML = '';
  settings.scanPaths.forEach((p, idx) => {
    const item = document.createElement('div');
    item.className = 'scan-path-item';
    item.innerHTML = `
      <span>${p}</span>
      <button class="action-btn delete" data-index="${idx}">
        <i data-lucide="x"></i>
      </button>
    `;
    scanPathsList.appendChild(item);
  });
  
  // 削除イベントのバインド
  scanPathsList.querySelectorAll('.delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      settings.scanPaths.splice(idx, 1);
      renderScanPaths();
    });
  });
  
  lucide.createIcons();
}

// パスの追加
btnAddPath.addEventListener('click', () => {
  const newPath = inputNewPath.value.trim();
  if (newPath) {
    if (!settings.scanPaths.includes(newPath)) {
      settings.scanPaths.push(newPath);
      renderScanPaths();
      inputNewPath.value = '';
    }
  }
});

// APIキー表示のトグル
btnToggleKeyVisibility.addEventListener('click', () => {
  if (inputApiKey.type === 'password') {
    inputApiKey.type = 'text';
    btnToggleKeyVisibility.textContent = t('settings.apikey.hide');
  } else {
    inputApiKey.type = 'password';
    btnToggleKeyVisibility.textContent = t('settings.apikey.show');
  }
});

// 設定保存
btnSaveSettings.addEventListener('click', async () => {
  settings.apiKey = inputApiKey.value.trim();
  settings.language = selectLanguage.value;
  const success = await window.api.saveSettings(settings);
  if (success) {
    applyI18n();
    alert(t('alert.settings_saved'));
    switchTab('all');
    await scanAndRenderPlugins();
  } else {
    alert(t('alert.settings_save_failed'));
  }
});

// キャッシュのリセットとバイナリ再スキャン
btnResetCache.addEventListener('click', async () => {
  if (confirm(t('confirm.reset_cache'))) {
    switchTab('all');
    await scanAndRenderPlugins(true);
  }
});

// ----------------------------------------------------
// プラグインスキャン・レンダリング処理
// ----------------------------------------------------
async function scanAndRenderPlugins(forceNativeScan = false) {
  showLoading(t(forceNativeScan ? 'scan.loading_reset' : 'scan.loading'));
  try {
    allPlugins = await window.api.scanPlugins(forceNativeScan);
    updateStatistics();
    renderCategorySidebar();
    filterAndRenderPlugins();
  } catch (err) {
    console.error('Scan failed:', err);
    alert(t('alert.scan_error'));
  } finally {
    hideLoading();
  }
}

function showLoading(text) {
  loadingText.textContent = text;
  loadingOverlay.style.display = 'flex';
}

function hideLoading() {
  loadingOverlay.style.display = 'none';
}

// 統計の更新
function updateStatistics() {
  const total = allPlugins.length;
  const analyzed = allPlugins.filter(p => p.analyzed).length;
  const unresolved = total - analyzed;
  const notPlugin = allPlugins.filter(p => p.analyzed && p.is_plugin === false).length;

  // 料金計算 (1ドル = 155円換算)
  // Input: $0.30 / 1M tokens ($0.0000003 / token)
  // Output: $2.50 / 1M tokens ($0.0000025 / token)
  const USD_TO_JPY = 155;
  let totalCostUSD = 0;

  allPlugins.forEach(p => {
    if (p.analyzed) {
      let promptTokens = 400; // 未記録時のデフォルト予測インプットトークン数
      let completionTokens = 150; // 未記録時のデフォルト予測アウトプットトークン数
      
      if (p.usage) {
        promptTokens = p.usage.promptTokens || 0;
        completionTokens = p.usage.completionTokens || 0;
      }
      
      const cost = (promptTokens * 0.0000003) + (completionTokens * 0.0000025);
      totalCostUSD += cost;
    }
  });

  const totalCostJPY = totalCostUSD * USD_TO_JPY;

  statTotal.textContent = total;
  statAnalyzed.textContent = analyzed;
  statUnresolved.textContent = unresolved;
  statNotPlugin.textContent = notPlugin;

  const statCost = document.getElementById('stat-cost');
  if (statCost) {
    statCost.textContent = `¥${totalCostJPY.toFixed(2)}`;
    statCost.setAttribute('title', t('stat.cost_title', { usd: totalCostUSD.toFixed(5) }));
  }

  // 非プラグインの警告カード表示制御
  if (notPlugin > 0) {
    statNotPluginCard.style.display = 'flex';
  } else {
    statNotPluginCard.style.display = 'none';
  }
}

// カテゴリ別サイドバーの描画
function renderCategorySidebar() {
  const sidebarList = document.getElementById('category-filters-list');
  sidebarList.innerHTML = '';

  // 各カテゴリのカウントを計算
  const counts = {
    'all': allPlugins.length,
    'unresolved': allPlugins.filter(p => !p.analyzed).length
  };

  allPlugins.forEach(p => {
    if (p.analyzed) {
      const cat = p.category || 'Other';
      counts[cat] = (counts[cat] || 0) + 1;
    }
  });

  // カテゴリ表示用の順序定義
  const displayOrder = [
    'all',
    'Synthesizer', 'Sampler', 'Equalizer', 'Compressor', 'Reverb', 'Delay', 'Distortion', 'Modulation', 'Utility', 'Other',
    'Not Plugin',
    'unresolved'
  ];

  displayOrder.forEach(catKey => {
    const count = counts[catKey] || 0;
    // 件数があるもの、または基本キー（all, unresolved）のみ表示
    if (count > 0 || catKey === 'all' || catKey === 'unresolved') {
      const displayName = categoryLabel(catKey);
      const btn = document.createElement('button');
      btn.className = `category-btn ${currentFilterCategory === catKey ? 'active' : ''}`;
      btn.setAttribute('data-category', catKey);
      btn.innerHTML = `
        <span>${displayName}</span>
        <span class="count">${count}</span>
      `;
      btn.addEventListener('click', () => {
        currentFilterCategory = catKey;
        // サイドバーのactive切り替え
        sidebarList.querySelectorAll('.category-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        filterAndRenderPlugins();
      });
      sidebarList.appendChild(btn);
    }
  });
}

// フィルタリングと描画
function filterAndRenderPlugins() {
  let filtered = [...allPlugins];

  // 1. カテゴリフィルター
  if (currentFilterCategory !== 'all') {
    if (currentFilterCategory === 'unresolved') {
      filtered = filtered.filter(p => !p.analyzed);
    } else if (currentFilterCategory === 'Not Plugin') {
      filtered = filtered.filter(p => p.analyzed && p.is_plugin === false);
    } else {
      filtered = filtered.filter(p => p.analyzed && p.is_plugin !== false && p.category === currentFilterCategory);
    }
  }

  // 2. VSTタイプフィルター
  if (currentFilterType !== 'all') {
    filtered = filtered.filter(p => p.type.toLowerCase() === currentFilterType);
  }

  // 3. 検索クエリ
  if (currentSearchQuery) {
    const query = currentSearchQuery.toLowerCase();
    filtered = filtered.filter(p => {
      const nameMatch = p.name && p.name.toLowerCase().includes(query);
      const formalNameMatch = p.formalName && p.formalName.toLowerCase().includes(query);
      const devMatch = p.developer && p.developer.toLowerCase().includes(query);
      const pathMatch = p.path && p.path.toLowerCase().includes(query);
      const descMatch = p.description && p.description.toLowerCase().includes(query);
      return nameMatch || formalNameMatch || devMatch || pathMatch || descMatch;
    });
  }

  // レンダリング
  pluginList.innerHTML = '';
  if (filtered.length === 0) {
    pluginList.innerHTML = `<div class="empty-state">${t('empty.plugins')}</div>`;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    const isNotPlugin = p.analyzed && p.is_plugin === false;
    card.className = `plugin-card ${isNotPlugin ? 'not-plugin-type' : ''}`;
    
    // カードヘッダー
    const name = p.name || p.filename;
    const typeLabel = p.type;
    const typeClass = p.type.toLowerCase();
    
    let bodyContent = '';
    let footerContent = '';
    
    if (p.analyzed) {
      const developer = p.developer || t('misc.unknown');
      const description = p.description || t('misc.no_desc');
      const catLabel = categoryLabel(p.category || 'Other');
      const categoryClass = (p.category || 'Other').toLowerCase().replace(/\s+/g, '');
      const confidenceBadge = p.confidence === 'low'
        ? `<span class="confidence-badge" title="${t('badge.low_confidence')}">?</span>`
        : '';

      bodyContent = `
        <div class="plugin-title-area">
          <div class="plugin-name">${p.name || name}${confidenceBadge}</div>
          <div class="plugin-developer">${developer}</div>
        </div>
        <div class="plugin-desc">${description}</div>
      `;

      footerContent = `
        <span class="plugin-category-badge ${categoryClass}">${catLabel}</span>
        <button class="action-btn re-analyze-btn" data-path="${p.path}" data-name="${name}" title="${t('plugin.re_analyze_t')}">
          <i data-lucide="refresh-cw"></i>
          <span>${t('plugin.re_analyze')}</span>
        </button>
      `;
    } else {
      // 未解析の場合（C++スキャン済みで、AI説明文のみ未生成の状態も含む）
      const developer = p.developer || t('misc.unanalyzed');
      const description = p.description || t('misc.ai_hint');
      const displayName = p.name || name;

      bodyContent = `
        <div class="plugin-title-area">
          <div class="plugin-name">${displayName}</div>
          <div class="plugin-developer">${developer}</div>
        </div>
        <div class="plugin-desc placeholder">${description}</div>
      `;
      
      footerContent = `
        <button class="action-btn ai-btn" data-path="${p.path}" data-name="${displayName}">
          <i data-lucide="sparkles"></i>
          <span>${t('plugin.ai_analyze')}</span>
        </button>
      `;
    }

    // サイズと日付の整形
    const sizeMB = (p.size / (1024 * 1024)).toFixed(2);
    const dateStr = p.modified ? new Date(p.modified).toLocaleDateString(localeTag()) : t('misc.unknown_date');

    card.innerHTML = `
      <div class="plugin-card-header">
        <span class="plugin-type-badge ${typeClass}">${typeLabel}</span>
        <div class="card-actions">
          <button class="action-btn open-folder" data-path="${p.path}" title="${t('plugin.open_folder_t')}">
            <i data-lucide="folder"></i>
          </button>
          <button class="action-btn delete" data-path="${p.path}" title="${t('plugin.delete_t')}">
            <i data-lucide="trash-2"></i>
          </button>
        </div>
      </div>
      <div class="plugin-card-body">
        ${bodyContent}
        <div class="plugin-meta-info">
          <div class="plugin-path" title="${p.path}">Path: ${p.path}</div>
          <div>Size: ${sizeMB} MB | Modified: ${dateStr}</div>
        </div>
      </div>
      <div class="plugin-card-footer">
        ${footerContent}
      </div>
    `;

    // 個別AI解析ボタンのイベント
    const aiBtn = card.querySelector('.ai-btn');
    if (aiBtn) {
      aiBtn.addEventListener('click', async (e) => {
        const path = e.currentTarget.getAttribute('data-path');
        const name = e.currentTarget.getAttribute('data-name');
        e.currentTarget.classList.add('analyzing');
        e.currentTarget.innerHTML = `<i data-lucide="loader" class="spinner"></i> ${t('plugin.analyzing')}`;
        lucide.createIcons();
        await analyzeSinglePlugin(path, name);
      });
    }

    // 個別再解析ボタンのイベント
    const reAnalyzeBtn = card.querySelector('.re-analyze-btn');
    if (reAnalyzeBtn) {
      reAnalyzeBtn.addEventListener('click', async (e) => {
        const path = e.currentTarget.getAttribute('data-path');
        const name = e.currentTarget.getAttribute('data-name');
        e.currentTarget.classList.add('analyzing');
        e.currentTarget.innerHTML = `<i data-lucide="loader" class="spinner"></i> ${t('plugin.re_analyzing')}`;
        lucide.createIcons();
        await reAnalyzeSinglePlugin(path, name);
      });
    }

    // フォルダを開くボタン
    card.querySelector('.open-folder').addEventListener('click', async (e) => {
      const path = e.currentTarget.getAttribute('data-path');
      await window.api.openFolder(path);
    });

    // アンインストール支援 / 削除ボタンクリックイベント
    card.querySelector('.delete').addEventListener('click', async () => {
      await showUninstallModal(p);
    });

    pluginList.appendChild(card);
  });

  lucide.createIcons();
}

// ----------------------------------------------------
// アンインストール支援モーダル処理
// ----------------------------------------------------
async function showUninstallModal(plugin) {
  activeUninstallPlugin = plugin;
  const name = plugin.name || plugin.filename;
  const developer = plugin.developer || t('misc.unknown');
  
  uninstallPluginInfo.textContent = `${name} (${developer})`;
  
  // 初期状態は非表示
  optLocalUninstaller.style.display = 'none';
  optPluginManager.style.display = 'none';
  managerButtonsContainer.innerHTML = '';
  
  // モーダル表示
  modalUninstall.classList.add('show');
  
  // アンインストール情報の検出
  try {
    detectedUninstallInfo = await window.api.getUninstallInfo(plugin.path, developer);
    
    // 1. ローカルアンインストーラーの表示制御
    if (detectedUninstallInfo.localUninstallers && detectedUninstallInfo.localUninstallers.length > 0) {
      optLocalUninstaller.style.display = 'flex';
      const mainUninst = detectedUninstallInfo.localUninstallers[0];
      btnRunLocalUninst.setAttribute('data-path', mainUninst.path);
      btnRunLocalUninst.textContent = t('uninstall.launch', { name: mainUninst.name });
    }
    
    // 2. プラグインマネージャーの表示制御
    if (detectedUninstallInfo.detectedManagers && detectedUninstallInfo.detectedManagers.length > 0) {
      optPluginManager.style.display = 'flex';
      
      detectedUninstallInfo.detectedManagers.sort((a, b) => (b.isMatch - a.isMatch));
      
      detectedUninstallInfo.detectedManagers.forEach(manager => {
        const btn = document.createElement('button');
        btn.className = `btn ${manager.isMatch ? 'btn-primary' : 'btn-secondary'} btn-sm`;
        btn.innerHTML = `<i data-lucide="external-link"></i> ${manager.name}`;
        btn.addEventListener('click', async () => {
          const res = await window.api.runExecutable(manager.path);
          if (res.success) {
            alert(t('alert.manager_started', { name: manager.name }));
            closeUninstallModal();
          } else {
            alert(`${t('alert.launch_failed')}${res.message}`);
          }
        });
        managerButtonsContainer.appendChild(btn);
      });
      lucide.createIcons();
    }
  } catch (err) {
    console.error('Failed to get uninstall info:', err);
  }
}

function closeUninstallModal() {
  modalUninstall.classList.remove('show');
  activeUninstallPlugin = null;
  detectedUninstallInfo = null;
}

// モーダルクローズイベント
btnCloseUninstallModal.addEventListener('click', closeUninstallModal);

// ローカルアンインストーラーの起動
btnRunLocalUninst.addEventListener('click', async (e) => {
  const exePath = e.currentTarget.getAttribute('data-path');
  if (exePath) {
    if (confirm(t('confirm.local_uninst'))) {
      const res = await window.api.runExecutable(exePath);
      if (res.success) {
        alert(t('alert.uninst_started'));
        closeUninstallModal();
      } else {
        alert(`${t('alert.uninst_failed')}${res.message}`);
      }
    }
  }
});

// Windowsアプリの設定画面を開く
btnOpenWinApps.addEventListener('click', async () => {
  const res = await window.api.openWindowsApps();
  if (res.success) {
    alert(t('alert.winapps_opened'));
    closeUninstallModal();
  } else {
    alert(`${t('alert.winapps_failed')}${res.message}`);
  }
});

// 手動ファイル削除（ゴミ箱へ移動）
btnForceDelete.addEventListener('click', async () => {
  if (!activeUninstallPlugin) return;
  const path = activeUninstallPlugin.path;
  
  if (confirm(t('confirm.force_delete', { path }))) {
    const res = await window.api.deletePlugin(path);
    if (res.success) {
      allPlugins = allPlugins.filter(pl => pl.path !== path);
      updateStatistics();
      renderCategorySidebar();
      filterAndRenderPlugins();
      closeUninstallModal();
    } else {
      alert(`${t('alert.delete_failed')}${res.message}`);
    }
  }
});

// 個別プラグイン解析
async function analyzeSinglePlugin(path, name) {
  if (!settings.apiKey) {
    alert(t('alert.no_apikey'));
    filterAndRenderPlugins();
    return;
  }
  
  const res = await window.api.analyzePlugins([{ path, name }], currentLang);
  if (res.success && res.results[path]) {
    // スキャンリストの該当プラグイン情報を更新
    const idx = allPlugins.findIndex(pl => pl.path === path);
    if (idx !== -1) {
      allPlugins[idx] = {
        ...allPlugins[idx],
        ...res.results[path],
        analyzed: true
      };
    }
    updateStatistics();
    renderCategorySidebar();
    filterAndRenderPlugins();
  } else {
    alert(t('alert.analyze_failed') + (res.message || ''));
    filterAndRenderPlugins();
  }
}

// 個別プラグインの再スキャン・再解析
async function reAnalyzeSinglePlugin(path, name) {
  if (!settings.apiKey) {
    alert(t('alert.no_apikey'));
    filterAndRenderPlugins();
    return;
  }
  
  const res = await window.api.analyzePlugins([{ path, name }], currentLang);
  if (res.success && res.results[path]) {
    const idx = allPlugins.findIndex(pl => pl.path === path);
    if (idx !== -1) {
      allPlugins[idx] = {
        ...allPlugins[idx],
        ...res.results[path],
        analyzed: true
      };
    }
    updateStatistics();
    renderCategorySidebar();
    filterAndRenderPlugins();
  } else {
    alert(t('alert.reanalyze_failed') + (res.message || ''));
    filterAndRenderPlugins();
  }
}

// 再スキャンボタン
btnScan.addEventListener('click', async () => {
  await scanAndRenderPlugins();
});

// ----------------------------------------------------
// 一括解析処理（バッチAPI + 並列化）
// ----------------------------------------------------
function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function runBatchAnalyze(targets) {
  if (!settings.apiKey) {
    alert(t('alert.no_apikey'));
    switchTab('settings');
    return;
  }
  if (targets.length === 0) return;

  const batches = chunkArray(targets, ANALYZE_BATCH_SIZE);

  // モーダル表示
  isAnalyzingAll = true;
  modalProgress.classList.add('show');
  progressTotal.textContent = targets.length;
  progressCurrent.textContent = '0';
  progressBarFill.style.width = '0%';
  progressLog.innerHTML = '';
  addLog(t('log.batch_start', {
    count: targets.length,
    batches: batches.length,
    concurrency: ANALYZE_BATCH_CONCURRENCY
  }), 'success');

  let processedCount = 0;
  let failedCount = 0;
  let batchIndex = 0;
  const totalBatches = batches.length;

  // バッチ単位のワーカー（1リクエストで複数プラグインを解析）
  const worker = async () => {
    while (batchIndex < totalBatches && isAnalyzingAll) {
      const myBatch = batches[batchIndex++];
      addLog(t('log.analyzing', { batch: batchIndex, total: totalBatches, count: myBatch.length }));

      const res = await window.api.analyzePlugins(
        myBatch.map(p => ({ path: p.path, name: p.name, type: p.type })),
        currentLang
      );

      if (res.success) {
        for (const plugin of myBatch) {
          const data = res.results[plugin.path];
          const idx = allPlugins.findIndex(pl => pl.path === plugin.path);
          if (data && idx !== -1) {
            allPlugins[idx] = { ...allPlugins[idx], ...data, analyzed: true };
            processedCount++;
            addLog(t('log.success', { name: data.name, developer: data.developer }), 'success');
          } else {
            failedCount++;
            addLog(t('log.failed', { name: plugin.name, message: 'no result' }), 'error');
          }
        }
      } else {
        failedCount += myBatch.length;
        for (const plugin of myBatch) {
          addLog(t('log.failed', { name: plugin.name, message: res.message }), 'error');
        }
      }

      progressCurrent.textContent = processedCount;
      progressBarFill.style.width = `${(processedCount / targets.length) * 100}%`;

      // UIの統計とサイドバーを途中でも徐々に更新（UX向上）
      updateStatistics();
      renderCategorySidebar();
    }
  };

  // ワーカーを並行数分起動
  const workers = [];
  const workerCount = Math.min(ANALYZE_BATCH_CONCURRENCY, totalBatches);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  if (isAnalyzingAll) {
    addLog(t('log.batch_done', { done: processedCount, failed: failedCount }), 'success');
  } else {
    addLog(t('log.batch_cancelled'), 'error');
  }
  
  filterAndRenderPlugins();
  
  // キャンセルボタンを「閉じる」に変更
  btnCancelAnalyze.textContent = t('action.close');
}

// 未解析プラグインの一括解析
btnAnalyzeAll.addEventListener('click', async () => {
  const unanalyzed = allPlugins.filter(p => !p.analyzed);
  if (unanalyzed.length === 0) {
    alert(t('alert.no_unanalyzed'));
    return;
  }

  if (!confirm(t('confirm.analyze_all', {
    count: unanalyzed.length,
    batch: ANALYZE_BATCH_SIZE,
    concurrency: ANALYZE_BATCH_CONCURRENCY
  }))) {
    return;
  }

  await runBatchAnalyze(unanalyzed);
});

// 全プラグインの再解析（既存結果を上書き）
btnReanalyzeAll.addEventListener('click', async () => {
  if (allPlugins.length === 0) {
    alert(t('alert.no_plugins'));
    return;
  }

  if (!confirm(t('confirm.reanalyze_all', { count: allPlugins.length }))) {
    return;
  }

  await runBatchAnalyze([...allPlugins]);
});

// キャンセル・閉じるボタン
btnCancelAnalyze.textContent = 'Cancel';
btnCancelAnalyze.addEventListener('click', () => {
  isAnalyzingAll = false;
  modalProgress.classList.remove('show');
  btnCancelAnalyze.textContent = t('action.cancel');
});

function addLog(text, type = '') {
  const entry = document.createElement('div');
  entry.className = `log-entry ${type}`;
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
  progressLog.appendChild(entry);
  progressLog.scrollTop = progressLog.scrollHeight;
}

// ----------------------------------------------------
// AI チャットアシスタント処理
// ----------------------------------------------------
async function sendChatMessage() {
  const text = chatInput.value.trim();
  if (!text) return;
  
  // ユーザーメッセージを追加
  addChatMessage(text, 'user');
  chatInput.value = '';
  
  // ローディングを追加
  const loadingMsg = addChatMessage(`<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></div>${t('chat.thinking')}`, 'loading');
  
  try {
    const res = await window.api.sendChatMessage(text, allPlugins, currentLang);
    loadingMsg.remove();
    
    if (res.success) {
      addChatMessage(res.reply, 'ai');
      
      // データ自動修正アクションが走った場合は画面を再読込
      if (res.actionExecuted) {
        addChatMessage(t('chat.fixed_notice'), 'system');
        
        // 再スキャンでメモリデータを最新化
        allPlugins = await window.api.scanPlugins();
        updateStatistics();
        renderCategorySidebar();
        filterAndRenderPlugins();
      }
    } else {
      addChatMessage(`${t('chat.error_prefix')}${res.reply}`, 'system');
    }
  } catch (err) {
    loadingMsg.remove();
    addChatMessage(`${t('chat.comm_error')}${err.message}`, 'system');
  }
}

function addChatMessage(content, type) {
  const msg = document.createElement('div');
  msg.className = `message ${type}`;
  msg.innerHTML = content;
  chatMessages.appendChild(msg);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return msg;
}

// ----------------------------------------------------
// 検索・フィルタリング UIイベント
// ----------------------------------------------------
searchInput.addEventListener('input', (e) => {
  currentSearchQuery = e.target.value;
  filterAndRenderPlugins();
});

filterBtns.forEach(btn => {
  btn.addEventListener('click', (e) => {
    filterBtns.forEach(b => b.classList.remove('active'));
    e.target.classList.add('active');
    currentFilterType = e.target.getAttribute('data-type');
    filterAndRenderPlugins();
  });
});
