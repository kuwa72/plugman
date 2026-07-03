const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { execFile } = require('child_process');
const { GoogleGenerativeAI } = require('@google/generative-ai');

let mainWindow;
const settingsPath = path.join(app.getPath('userData'), 'settings.json');
const cachePath = path.join(app.getPath('userData'), 'plugins_cache.json');
let pluginsCache = {};

// 各社プラグインマネージャー・ポータルアプリの定義
const MANAGER_APPS = [
  {
    name: 'Native Access (Native Instruments)',
    developer: 'Native Instruments',
    paths: [
      'C:\\Program Files\\Native Instruments\\Native Access\\Native Access.exe',
      'C:\\Program Files\\Native Instruments\\Native Access 2\\Native Access.exe'
    ]
  },
  {
    name: 'Waves Central (Waves)',
    developer: 'Waves',
    paths: [
      'C:\\Program Files\\Waves Central\\Waves Central.exe'
    ]
  },
  {
    name: 'Arturia Software Center (Arturia)',
    developer: 'Arturia',
    paths: [
      'C:\\Program Files\\Arturia\\Arturia Software Center\\Arturia Software Center.exe'
    ]
  },
  {
    name: 'iZotope Product Portal (iZotope)',
    developer: 'iZotope',
    paths: [
      'C:\\Program Files\\iZotope\\Product Portal\\iZotope Product Portal.exe'
    ]
  },
  {
    name: 'Spitfire Audio App (Spitfire Audio)',
    developer: 'Spitfire Audio',
    paths: [
      'C:\\Program Files\\Spitfire Audio\\Spitfire Audio\\Spitfire Audio.exe'
    ]
  },
  {
    name: 'Portal (Plugin Alliance)',
    developer: 'Plugin Alliance',
    paths: [
      'C:\\Program Files\\Plugin Alliance\\Portal\\Portal.exe'
    ]
  }
];

// プラグインフォルダ付近からアンインストーラーを探索
function findLocalUninstallers(pluginPath) {
  const uninstallers = [];
  try {
    if (!fs.existsSync(pluginPath)) return uninstallers;
    const stats = fs.statSync(pluginPath);
    const dir = stats.isDirectory() ? pluginPath : path.dirname(pluginPath);
    
    // 同一、1つ上、2つ上の階層をスキャン
    const searchDirs = [dir];
    const parent = path.dirname(dir);
    if (parent && parent !== path.dirname(parent)) {
      searchDirs.push(parent);
      const grandParent = path.dirname(parent);
      if (grandParent && grandParent !== path.dirname(grandParent)) {
        searchDirs.push(grandParent);
      }
    }

    for (const d of searchDirs) {
      if (!fs.existsSync(d)) continue;
      const files = fs.readdirSync(d);
      for (const file of files) {
        const lowerFile = file.toLowerCase();
        if ((lowerFile.includes('uninstall') || lowerFile.includes('uninst') || lowerFile.startsWith('unins')) && lowerFile.endsWith('.exe')) {
          uninstallers.push({
            name: file,
            path: path.join(d, file)
          });
        }
      }
    }
  } catch (e) {
    console.error('Error finding uninstallers:', e);
  }
  return uninstallers;
}

// デフォルト設定
const defaultSettings = {
  apiKey: '',
  scanPaths: [
    'C:\\Program Files\\Common Files\\VST3',
    'C:\\Program Files\\VSTPlugins',
    'C:\\Program Files\\Steinberg\\VSTPlugins',
    'C:\\Program Files\\Common Files\\Steinberg\\VST2',
    'C:\\Program Files (x86)\\VSTPlugins',
    'C:\\Program Files (x86)\\Steinberg\\VSTPlugins',
    'C:\\Program Files (x86)\\Common Files\\VST3'
  ]
};

// 設定の読み込み
function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return defaultSettings;
}

// 設定の保存
function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}

// キャッシュの読み込み
function loadCache() {
  try {
    if (fs.existsSync(cachePath)) {
      const data = fs.readFileSync(cachePath, 'utf-8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Failed to load cache:', err);
  }
  return {};
}

// キャッシュの保存
function saveCache(cache) {
  try {
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Failed to save cache:', err);
    return false;
  }
}

// VSTスキャン（再帰的、ただしVST3パッケージの中は再帰しない）
function scanDirectory(dir, results = []) {
  try {
    if (!fs.existsSync(dir)) return results;
    const stats = fs.statSync(dir);
    if (!stats.isDirectory()) return results;

    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        if (!fs.existsSync(fullPath)) continue;
        const fileStats = fs.statSync(fullPath);
        if (fileStats.isDirectory()) {
          // VST3パッケージフォルダ（フォルダ自体がプラグイン）
          if (file.toLowerCase().endsWith('.vst3')) {
            results.push({
              name: file,
              path: fullPath,
              type: 'VST3',
              size: getDirectorySize(fullPath),
              modified: fileStats.mtime.toISOString()
            });
          } else {
            // 通常のディレクトリは再帰
            scanDirectory(fullPath, results);
          }
        } else {
          const lowerFile = file.toLowerCase();
          if (lowerFile.endsWith('.dll')) {
            results.push({
              name: file,
              path: fullPath,
              type: 'VST2',
              size: fileStats.size,
              modified: fileStats.mtime.toISOString()
            });
          } else if (lowerFile.endsWith('.vst3') && !dir.toLowerCase().endsWith('.vst3')) {
            // 単体ファイルのVST3
            results.push({
              name: file,
              path: fullPath,
              type: 'VST3',
              size: fileStats.size,
              modified: fileStats.mtime.toISOString()
            });
          }
        }
      } catch (err) {
        if (err.code !== 'ENOENT' && err.code !== 'EACCES') {
          console.error('Error scanning file:', fullPath, err);
        }
      }
    }
  } catch (err) {
    console.error('Error scanning directory:', dir, err);
  }
  return results;
}

function getDirectorySize(dirPath) {
  let size = 0;
  try {
    const files = fs.readdirSync(dirPath);
    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const stats = fs.statSync(filePath);
      if (stats.isDirectory()) {
        size += getDirectorySize(filePath);
      } else {
        size += stats.size;
      }
    }
  } catch (e) {}
  return size;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1b26',
      symbolColor: '#a9b1d6',
      height: 40
    },
    backgroundColor: '#1a1b26'
  });

  mainWindow.loadFile('index.html');
}

// VST2/VST3のメタデータをC++スキャナーで抽出する
function getPluginMetadataNative(pluginPath) {
  return new Promise((resolve) => {
    const scannerPath = path.join(__dirname, 'bin', 'vst_scanner.exe');
    if (!fs.existsSync(scannerPath)) {
      resolve({ success: false, error: 'Scanner binary not found' });
      return;
    }
    
    execFile(scannerPath, [pluginPath], { timeout: 8000 }, (err, stdout) => {
      if (err) {
        resolve({ success: false, error: err.message });
        return;
      }
      try {
        const data = JSON.parse(stdout.trim());
        resolve(data);
      } catch (e) {
        resolve({ success: false, error: 'Failed to parse JSON output' });
      }
    });
  });
}

app.whenReady().then(() => {
  // 起動時にキャッシュをメモリにロード
  pluginsCache = loadCache();

  // 設定の取得
  ipcMain.handle('get-settings', () => {
    return loadSettings();
  });

  // 設定の保存
  ipcMain.handle('save-settings', (event, settings) => {
    return saveSettings(settings);
  });

  // プラグインスキャン
  ipcMain.handle('scan-plugins', async (event, forceNativeScan) => {
    if (forceNativeScan) {
      pluginsCache = {};
      saveCache(pluginsCache);
    }
    const settings = loadSettings();
    let allPlugins = [];

    for (const scanPath of settings.scanPaths) {
      if (fs.existsSync(scanPath)) {
        const plugins = scanDirectory(scanPath);
        allPlugins = allPlugins.concat(plugins);
      }
    }

    // パスの一意性を確保
    const uniquePlugins = [];
    const seenPaths = new Set();
    const newPlugins = [];

    for (const p of allPlugins) {
      if (!seenPaths.has(p.path)) {
        seenPaths.add(p.path);
        
        const cachedData = pluginsCache[p.path];
        if (cachedData) {
          uniquePlugins.push({ ...p, ...cachedData, analyzed: !!cachedData.aiAnalyzed });
        } else {
          newPlugins.push(p);
          uniquePlugins.push({ ...p, analyzed: false });
        }
      }
    }

    // 新規検出されたプラグインに対してC++ネイティブスキャナーを並行実行
    if (newPlugins.length > 0) {
      const concurrency = 4;
      const queue = [...newPlugins];
      
      const worker = async () => {
        while (queue.length > 0) {
          const plugin = queue.shift();
          if (!plugin) break;
          
          const nativeInfo = await getPluginMetadataNative(plugin.path);
          if (nativeInfo && nativeInfo.success) {
            const cachedEntry = {
              name: nativeInfo.name,
              developer: nativeInfo.developer || 'Unknown',
              category: nativeInfo.category || 'Other',
              description: 'DLLから基本情報を読み込みました。AIで説明文を生成できます。',
              is_plugin: true,
              nativeScanned: true
            };
            
            pluginsCache[plugin.path] = cachedEntry;
            
            // 返却用のリストも更新（AI説明文は未生成のため analyzed は false）
            const target = uniquePlugins.find(u => u.path === plugin.path);
            if (target) {
              Object.assign(target, cachedEntry, { analyzed: false });
            }
          } else {
            // 非プラグインファイル（ロードエラーや非VSTファイル）
            const errorMsg = nativeInfo && nativeInfo.error ? nativeInfo.error : 'VSTプラグインではない可能性があります。';
            const isNotPlugin = errorMsg.includes('Not a valid VST2 or VST3 plugin');
            
            const cachedEntry = {
              name: plugin.name.replace(/\.(dll|vst3)$/i, ''),
              developer: 'Unknown',
              category: isNotPlugin ? 'Not Plugin' : 'unresolved',
              description: isNotPlugin ? 'VSTプラグインではありません。' : `ロードエラー: ${errorMsg}`,
              is_plugin: !isNotPlugin,
              nativeScanned: true
            };
            
            pluginsCache[plugin.path] = cachedEntry;
            
            const target = uniquePlugins.find(u => u.path === plugin.path);
            if (target) {
              Object.assign(target, cachedEntry, { analyzed: isNotPlugin });
            }
          }
        }
      };

      const workers = [];
      const workerCount = Math.min(concurrency, queue.length);
      for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);
      
      saveCache(pluginsCache);
    }

    return uniquePlugins;
  });

  // Geminiによるプラグイン解析
  ipcMain.handle('analyze-plugin', async (event, pluginPath, pluginName, forceNativeScan = false) => {
    const settings = loadSettings();

    if (!settings.apiKey) {
      return {
        success: false,
        error: 'API_KEY_MISSING',
        message: 'Gemini APIキーが設定されていません。「設定」からAPIキーを入力してください。'
      };
    }

    try {
      // 個別リロード指示がある場合、または基本情報が未取得の場合はバイナリスキャンを行う
      if (forceNativeScan || !pluginsCache[pluginPath] || !pluginsCache[pluginPath].nativeScanned) {
        const nativeInfo = await getPluginMetadataNative(pluginPath);
        if (nativeInfo && nativeInfo.success) {
          pluginsCache[pluginPath] = {
            name: nativeInfo.name,
            developer: nativeInfo.developer || 'Unknown',
            category: nativeInfo.category || 'Other',
            description: 'DLLから基本情報を読み込みました。AIで説明文を生成できます。',
            is_plugin: true,
            nativeScanned: true
          };
          saveCache(pluginsCache);
        }
      }

      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });

      // DLLから抽出された情報があればヒントとして使う
      const existingData = pluginsCache[pluginPath] || {};
      const hintName = existingData.name || pluginName;
      const hintDev = existingData.developer || 'Unknown';
      const hintCategory = existingData.category || 'Other';

      const prompt = `あなたはDTM・音楽制作技術と各種VSTプラグイン（インストゥルメント、エフェクト）に非常に詳しいアシスタントです。
以下のVSTプラグインと思われるファイル名、フルパス、およびDLLバイナリから抽出した基本情報を元に、プラグインの情報を特定し、指定のJSON形式で出力してください。

ファイル名: "${pluginName}"
パス: "${pluginPath}"
DLLから抽出した製品名: "${hintName}"
DLLから抽出したデベロッパー名: "${hintDev}"
DLLからの暫定カテゴリ: "${hintCategory}"

【出力するJSONフォーマット】
{
  "name": "プラグインの正式名称（例: 'Pro-Q 3', 'Serum'。基本はDLLから抽出した製品名をベースにし、必要に応じて表記揺れを綺麗にした名前）",
  "developer": "デベロッパー名・メーカー名（例: 'FabFilter', 'Xfer Records'。基本はDLLから抽出したデベロッパー名をベースにし、必要に応じて正しいメーカー名にしてください）",
  "category": "分類（以下のいずれかから最も適切なものを1つ選択: 'Synthesizer', 'Sampler', 'Equalizer', 'Compressor', 'Reverb', 'Delay', 'Distortion', 'Modulation', 'Utility', 'Other'。VSTプラグインではない（システムDLLや無関係なファイル）と判断した場合は'Not Plugin'）",
  "description": "日本語による1〜2文程度の簡潔で的確な説明。どのような機能を持つプラグインか。",
  "is_plugin": true または false (これが音楽制作向けのVSTエフェクトまたはインストゥルメントプラグインである場合はtrue、単なるシステムDLLや無関係なファイルの場合はfalse)
}

出力は純粋なJSONオブジェクトのみにしてください。マークダウンの\`\`\`jsonのような装飾は一切含めないでください。`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsedData = JSON.parse(text.trim());

      // トークン使用量の取得
      const usage = result.response.usageMetadata || {};
      const responseData = {
        ...parsedData,
        aiAnalyzed: true, // AI解析完了フラグ
        nativeScanned: true,
        usage: {
          promptTokens: usage.promptTokenCount || 0,
          completionTokens: usage.candidatesTokenCount || 0
        }
      };

      // キャッシュに保存
      pluginsCache[pluginPath] = responseData;
      saveCache(pluginsCache);

      return {
        success: true,
        data: responseData
      };
    } catch (err) {
      console.error('Gemini API request failed:', err);
      return {
        success: false,
        error: 'API_ERROR',
        message: err.message
      };
    }
  });

  // プラグイン削除（ゴミ箱へ）
  ipcMain.handle('delete-plugin', async (event, pluginPath) => {
    try {
      if (!fs.existsSync(pluginPath)) {
        return { success: false, message: 'ファイルが存在しません。' };
      }
      await shell.trashItem(pluginPath);
      
      // キャッシュから削除
      if (pluginsCache[pluginPath]) {
        delete pluginsCache[pluginPath];
        saveCache(pluginsCache);
      }

      return { success: true };
    } catch (err) {
      console.error('Failed to trash item:', err);
      return { success: false, message: err.message };
    }
  });

  // フォルダを開く
  ipcMain.handle('open-folder', async (event, pluginPath) => {
    try {
      if (fs.existsSync(pluginPath)) {
        shell.showItemInFolder(pluginPath);
        return { success: true };
      }
      return { success: false, message: 'ファイルが存在しません。' };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // アンインストール情報の取得
  ipcMain.handle('get-uninstall-info', async (event, pluginPath, developer) => {
    const localUninstallers = findLocalUninstallers(pluginPath);
    const detectedManagers = [];

    for (const manager of MANAGER_APPS) {
      for (const p of manager.paths) {
        if (fs.existsSync(p)) {
          const isMatch = developer && developer.toLowerCase() !== 'unknown' && 
                          (manager.developer.toLowerCase().includes(developer.toLowerCase()) || 
                           developer.toLowerCase().includes(manager.developer.toLowerCase()));
          
          detectedManagers.push({
            name: manager.name,
            path: p,
            isMatch: !!isMatch
          });
          break;
        }
      }
    }

    return {
      localUninstallers,
      detectedManagers
    };
  });

  // 外部実行ファイルの起動
  ipcMain.handle('run-executable', async (event, exePath) => {
    return new Promise((resolve) => {
      if (!fs.existsSync(exePath)) {
        resolve({ success: false, message: '実行ファイルが見つかりません。' });
        return;
      }
      execFile(exePath, (err) => {
        if (err) {
          console.error('Failed to run executable:', err);
          resolve({ success: false, message: err.message });
        } else {
          resolve({ success: true });
        }
      });
    });
  });

  // Windowsの設定の「アプリと機能」を開く
  ipcMain.handle('open-windows-apps', async () => {
    try {
      await shell.openExternal('ms-settings:appsfeatures');
      return { success: true };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });

  // AIアシスタントへのチャットメッセージ送信とアクション実行
  ipcMain.handle('send-chat-message', async (event, message, pluginsList) => {
    const settings = loadSettings();
    if (!settings.apiKey) {
      return {
        success: false,
        reply: 'Gemini APIキーが設定されていません。「設定」タブから登録してください。'
      };
    }

    try {
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: { responseMimeType: 'application/json' }
      });

      // トークン節約のためにプラグインデータを簡略化
      const simplifiedPlugins = pluginsList.map(p => ({
        name: p.name,
        developer: p.developer || 'Unknown',
        category: p.category || 'Unknown',
        description: p.description || '',
        path: p.path,
        type: p.type
      }));

      const prompt = `あなたはプラグイン管理アプリ「Plugman」の専属AIアシスタントです。
ユーザーはプラグインについての質問（提案など）や、データの修正（正式名、メーカー、分類、説明の変更）を指示します。

スキャンされているプラグインのリスト：
${JSON.stringify(simplifiedPlugins)}

【回答のルール】
1. ユーザーがプラグインの提案を求めた場合は、上記のリストを元に最も適したものをいくつか選んで、その特徴と共に提案してください。
2. ユーザーがデータの修正（例: 「〇〇のカテゴリをEQに変えて」など）を指示した場合は、指示された内容に基づいて該当するプラグインの情報を修正する「action」をJSON内に作成してください。
3. カテゴリ（category）を修正する場合、以下のいずれかから選択してください：'Synthesizer', 'Sampler', 'Equalizer', 'Compressor', 'Reverb', 'Delay', 'Distortion', 'Modulation', 'Utility', 'Other', 'Not Plugin'。

【出力するJSONフォーマット】
{
  "reply": "ユーザーへの日本語での返答メッセージ。提案や説明など。",
  "action": null または {
    "type": "update_plugin",
    "path": "修正対象プラグインのフルパス (path)",
    "data": {
      "name": "修正後の製品名（指示がなければ元のままでよい）",
      "developer": "修正後のデベロッパー名（指示がなければ元のままでよい）",
      "category": "修正後の分類（指示がなければ元のままでよい）",
      "description": "修正後の説明文（指示がなければ元のままでよい。もし『このプラグインは〜〜をするもの』という詳細な修正指示があれば、それを元に1〜2文の的確な日本語説明文を作ってください）"
    }
  }
}

ユーザーのメッセージ: "${message}"

出力は純粋なJSONオブジェクトのみにしてください。マークダウンの\`\`\`jsonのような装飾は一切含めないでください。`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const responseData = JSON.parse(text.trim());

      // データ更新アクションがある場合は、メモリ内のキャッシュに反映して保存
      if (responseData.action && responseData.action.type === 'update_plugin') {
        const { path: pluginPath, data } = responseData.action;
        
        // トークン情報などがあれば保持する
        const existingData = pluginsCache[pluginPath] || {};
        pluginsCache[pluginPath] = {
          ...existingData,
          ...data,
          analyzed: true
        };
        saveCache(pluginsCache);
      }

      return {
        success: true,
        reply: responseData.reply,
        actionExecuted: !!(responseData.action && responseData.action.type === 'update_plugin'),
        actionData: responseData.action
      };

    } catch (err) {
      console.error('Chat API Error:', err);
      return {
        success: false,
        reply: `エラーが発生しました: ${err.message}`
      };
    }
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
