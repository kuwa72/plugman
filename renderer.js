let allPlugins = []; // スキャンされたすべてのプラグイン
let currentFilterCategory = 'all';
let currentFilterType = 'all'; // all, vst3, vst2
let currentSearchQuery = '';
let settings = {};
let isAnalyzingAll = false;
let activeUninstallPlugin = null; // 現在アンインストールモーダルで対象としているプラグイン
let detectedUninstallInfo = null; // 検出されたアンインストール情報

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

// 統計表示
const statTotal = document.getElementById('stat-total');
const statAnalyzed = document.getElementById('stat-analyzed');
const statUnresolved = document.getElementById('stat-unresolved');
const statNotPlugin = document.getElementById('stat-not-plugin');
const statNotPluginCard = document.getElementById('stat-not-plugin-card');

// 設定関連のDOM
const inputApiKey = document.getElementById('input-api-key');
const btnToggleKeyVisibility = document.getElementById('btn-toggle-key-visibility');
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

// カテゴリ定義と表示名
const CATEGORY_MAP = {
  'all': 'すべて',
  'Synthesizer': 'シンセサイザー',
  'Sampler': 'サンプラー',
  'Equalizer': 'イコライザー',
  'Compressor': 'コンプレッサー',
  'Reverb': 'リバーブ',
  'Delay': 'ディレイ',
  'Distortion': 'ディストーション',
  'Modulation': 'モジュレーション',
  'Utility': 'ユーティリティ',
  'Other': 'その他',
  'unresolved': '未解析',
  'Not Plugin': '非プラグインの疑い'
};

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
    btnToggleKeyVisibility.textContent = '非表示';
  } else {
    inputApiKey.type = 'password';
    btnToggleKeyVisibility.textContent = '表示';
  }
});

// 設定保存
btnSaveSettings.addEventListener('click', async () => {
  settings.apiKey = inputApiKey.value.trim();
  const success = await window.api.saveSettings(settings);
  if (success) {
    alert('設定を保存しました。再スキャンを開始します。');
    switchTab('all');
    await scanAndRenderPlugins();
  } else {
    alert('設定の保存に失敗しました。');
  }
});

// キャッシュのリセットとバイナリ再スキャン
btnResetCache.addEventListener('click', async () => {
  if (confirm('現在の解析データ（説明文や手動の編集結果含む）がすべてリセットされ、すべてのプラグインのバイナリから正確な名前とデベロッパー情報を再スキャンします。\nよろしいですか？')) {
    switchTab('all');
    await scanAndRenderPlugins(true);
  }
});

// ----------------------------------------------------
// プラグインスキャン・レンダリング処理
// ----------------------------------------------------
async function scanAndRenderPlugins(forceNativeScan = false) {
  showLoading(forceNativeScan ? 'キャッシュをリセットしてバイナリから再スキャン中...' : 'プラグインをスキャン中...');
  try {
    allPlugins = await window.api.scanPlugins(forceNativeScan);
    updateStatistics();
    renderCategorySidebar();
    filterAndRenderPlugins();
  } catch (err) {
    console.error('Scan failed:', err);
    alert('スキャン中にエラーが発生しました。');
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
    statCost.setAttribute('title', `USD: $${totalCostUSD.toFixed(5)} (1ドル=155円換算)`);
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
      const displayName = CATEGORY_MAP[catKey] || catKey;
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
    pluginList.innerHTML = `<div class="empty-state">該当するプラグインが見つかりません。</div>`;
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
      const developer = p.developer || 'Unknown';
      const description = p.description || '説明はありません。';
      const categoryLabel = CATEGORY_MAP[p.category] || p.category || 'Other';
      const categoryClass = (p.category || 'Other').toLowerCase().replace(/\s+/g, '');

      bodyContent = `
        <div class="plugin-title-area">
          <div class="plugin-name">${p.name || name}</div>
          <div class="plugin-developer">${developer}</div>
        </div>
        <div class="plugin-desc">${description}</div>
      `;

      footerContent = `
        <span class="plugin-category-badge ${categoryClass}">${categoryLabel}</span>
        <button class="action-btn re-analyze-btn" data-path="${p.path}" data-name="${name}" title="このプラグインをバイナリから再取得して再解析">
          <i data-lucide="refresh-cw"></i>
          <span>再解析</span>
        </button>
      `;
    } else {
      // 未解析の場合（C++スキャン済みで、AI説明文のみ未生成の状態も含む）
      const developer = p.developer || '未解析のプラグイン';
      const description = p.description || 'Gemini AIでプラグイン情報を解析できます。';
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
          <span>AI解析</span>
        </button>
      `;
    }

    // サイズと日付の整形
    const sizeMB = (p.size / (1024 * 1024)).toFixed(2);
    const dateStr = p.modified ? new Date(p.modified).toLocaleDateString('ja-JP') : '不明';

    card.innerHTML = `
      <div class="plugin-card-header">
        <span class="plugin-type-badge ${typeClass}">${typeLabel}</span>
        <div class="card-actions">
          <button class="action-btn open-folder" data-path="${p.path}" title="フォルダを開く">
            <i data-lucide="folder"></i>
          </button>
          <button class="action-btn delete" data-path="${p.path}" title="アンインストール / 削除">
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
        e.currentTarget.innerHTML = `<i data-lucide="loader" class="spinner"></i> 解析中...`;
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
        e.currentTarget.innerHTML = `<i data-lucide="loader" class="spinner"></i> 再解析中...`;
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
  const developer = plugin.developer || 'Unknown';
  
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
      btnRunLocalUninst.textContent = `「${mainUninst.name}」を起動`;
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
            alert(`${manager.name} を起動しました。管理アプリからアンインストールを行ってください。`);
            closeUninstallModal();
          } else {
            alert(`起動に失敗しました: ${res.message}`);
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
    if (confirm('ローカルの公式アンインストーラーを起動します。よろしいですか？')) {
      const res = await window.api.runExecutable(exePath);
      if (res.success) {
        alert('アンインストーラーを起動しました。ウィザードの指示に従って完了させてください。\n完了後、「再スキャン」を実行して一覧を更新してください。');
        closeUninstallModal();
      } else {
        alert(`アンインストーラーの起動に失敗しました: ${res.message}`);
      }
    }
  }
});

// Windowsアプリの設定画面を開く
btnOpenWinApps.addEventListener('click', async () => {
  const res = await window.api.openWindowsApps();
  if (res.success) {
    alert('Windowsのアプリ設定画面を開きました。「インストールされているアプリ」一覧から該当プラグインを探してアンインストールしてください。');
    closeUninstallModal();
  } else {
    alert(`設定画面の起動に失敗しました: ${res.message}`);
  }
});

// 手動ファイル削除（ゴミ箱へ移動）
btnForceDelete.addEventListener('click', async () => {
  if (!activeUninstallPlugin) return;
  const path = activeUninstallPlugin.path;
  
  if (confirm(`最終手段として、プラグインファイルを直接ゴミ箱へ移動します。よろしいですか？\n※アンインストーラーを使用しないため、レジストリや設定がPCに残る場合があります。\n\n対象パス:\n${path}`)) {
    const res = await window.api.deletePlugin(path);
    if (res.success) {
      allPlugins = allPlugins.filter(pl => pl.path !== path);
      updateStatistics();
      renderCategorySidebar();
      filterAndRenderPlugins();
      closeUninstallModal();
    } else {
      alert(`ファイルの削除に失敗しました: ${res.message}`);
    }
  }
});

// 個別プラグイン解析
async function analyzeSinglePlugin(path, name) {
  if (!settings.apiKey) {
    alert('Gemini APIキーを設定画面で登録してください。');
    filterAndRenderPlugins();
    return;
  }
  
  const res = await window.api.analyzePlugin(path, name);
  if (res.success) {
    // スキャンリストの該当プラグイン情報を更新
    const idx = allPlugins.findIndex(pl => pl.path === path);
    if (idx !== -1) {
      allPlugins[idx] = {
        ...allPlugins[idx],
        ...res.data,
        analyzed: true
      };
    }
    updateStatistics();
    renderCategorySidebar();
    filterAndRenderPlugins();
  } else {
    alert('解析に失敗しました: ' + res.message);
    filterAndRenderPlugins();
  }
}

// 個別プラグインの再スキャン・再解析
async function reAnalyzeSinglePlugin(path, name) {
  if (!settings.apiKey) {
    alert('Gemini APIキーを設定画面で登録してください。');
    filterAndRenderPlugins();
    return;
  }
  
  const res = await window.api.analyzePlugin(path, name, true);
  if (res.success) {
    const idx = allPlugins.findIndex(pl => pl.path === path);
    if (idx !== -1) {
      allPlugins[idx] = {
        ...allPlugins[idx],
        ...res.data,
        analyzed: true
      };
    }
    updateStatistics();
    renderCategorySidebar();
    filterAndRenderPlugins();
  } else {
    alert('再解析に失敗しました: ' + res.message);
    filterAndRenderPlugins();
  }
}

// 再スキャンボタン
btnScan.addEventListener('click', async () => {
  await scanAndRenderPlugins();
});

// ----------------------------------------------------
// 一括解析処理（並列化）
// ----------------------------------------------------
btnAnalyzeAll.addEventListener('click', async () => {
  if (!settings.apiKey) {
    alert('Gemini APIキーを設定画面で登録してください。');
    switchTab('settings');
    return;
  }

  const unanalyzed = allPlugins.filter(p => !p.analyzed);
  if (unanalyzed.length === 0) {
    alert('未解析のプラグインはありません。');
    return;
  }

  // 並行数
  const concurrency = 5;

  if (!confirm(`未解析のプラグイン ${unanalyzed.length} 件を一括で解析します。\n※ 有料枠向けに並行数 ${concurrency} で並列実行します。よろしいですか？`)) {
    return;
  }

  // モーダル表示
  isAnalyzingAll = true;
  modalProgress.classList.add('show');
  progressTotal.textContent = unanalyzed.length;
  progressCurrent.textContent = '0';
  progressBarFill.style.width = '0%';
  progressLog.innerHTML = '';
  addLog(`一括解析を開始します（並行数: ${concurrency}）...`, 'success');

  let processedCount = 0;
  const queue = [...unanalyzed];

  // 並行ワーカーの定義
  const worker = async () => {
    while (queue.length > 0 && isAnalyzingAll) {
      const plugin = queue.shift();
      if (!plugin) break;

      addLog(`解析中: ${plugin.name}`);
      const res = await window.api.analyzePlugin(plugin.path, plugin.name);
      
      if (res.success) {
        // 内部データ更新
        const idx = allPlugins.findIndex(pl => pl.path === plugin.path);
        if (idx !== -1) {
          allPlugins[idx] = {
            ...allPlugins[idx],
            ...res.data,
            analyzed: true
          };
        }
        processedCount++;
        progressCurrent.textContent = processedCount;
        const pct = (processedCount / unanalyzed.length) * 100;
        progressBarFill.style.width = `${pct}%`;
        addLog(`成功: ${res.data.name} (${res.data.developer})`, 'success');
      } else {
        addLog(`失敗: ${plugin.name} - ${res.message}`, 'error');
      }

      // UIの統計とサイドバーを途中でも徐々に更新（UX向上）
      updateStatistics();
      renderCategorySidebar();
    }
  };

  // ワーカーを並行数分起動
  const workers = [];
  const workerCount = Math.min(concurrency, queue.length);
  for (let i = 0; i < workerCount; i++) {
    workers.push(worker());
  }

  // すべてのワーカーが完了するのを待つ
  await Promise.all(workers);

  if (isAnalyzingAll) {
    addLog('一括解析が終了しました。', 'success');
  } else {
    addLog('一括解析が中断されました。', 'error');
  }
  
  filterAndRenderPlugins();
  
  // キャンセルボタンを「閉じる」に変更
  btnCancelAnalyze.textContent = '閉じる';
});

// キャンセル・閉じるボタン
btnCancelAnalyze.textContent = 'キャンセル';
btnCancelAnalyze.addEventListener('click', () => {
  isAnalyzingAll = false;
  modalProgress.classList.remove('show');
  btnCancelAnalyze.textContent = 'キャンセル';
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
  const loadingMsg = addChatMessage('<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;margin-right:8px;vertical-align:middle;"></div>AIが応答を考え中...', 'loading');
  
  try {
    const res = await window.api.sendChatMessage(text, allPlugins);
    loadingMsg.remove();
    
    if (res.success) {
      addChatMessage(res.reply, 'ai');
      
      // データ自動修正アクションが走った場合は画面を再読込
      if (res.actionExecuted) {
        addChatMessage('[システム通知] プラグイン情報を自動修正しました。画面を再読込します。', 'system');
        
        // 再スキャンでメモリデータを最新化
        allPlugins = await window.api.scanPlugins();
        updateStatistics();
        renderCategorySidebar();
        filterAndRenderPlugins();
      }
    } else {
      addChatMessage(`エラー: ${res.reply}`, 'system');
    }
  } catch (err) {
    loadingMsg.remove();
    addChatMessage(`通信エラーが発生しました: ${err.message}`, 'system');
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
