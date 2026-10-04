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
  language: 'auto',
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
    icon: path.join(__dirname, 'assets', 'icon.ico'),
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
    let scannerPath = path.join(__dirname, 'bin', 'vst_scanner.exe');
    if (app.isPackaged) {
      scannerPath = scannerPath.replace('app.asar', 'app.asar.unpacked');
    }
    if (!fs.existsSync(scannerPath)) {
      // フォールバック: app.asar 内のパスも試す
      scannerPath = path.join(__dirname, 'bin', 'vst_scanner.exe');
      if (!fs.existsSync(scannerPath)) {
        resolve({ success: false, error: 'Scanner binary not found' });
        return;
      }
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

// VST3パッケージ内の公式メタデータ (moduleinfo.json) を読み取る
function readVst3ModuleInfo(pluginPath) {
  try {
    const stats = fs.statSync(pluginPath);
    if (!stats.isDirectory()) return null;
    const infoPath = path.join(pluginPath, 'Contents', 'Resources', 'moduleinfo.json');
    if (!fs.existsSync(infoPath)) return null;
    const data = JSON.parse(fs.readFileSync(infoPath, 'utf-8'));
    const cls = (data.Classes || [])[0] || {};
    return {
      name: data.Name || cls.Name || '',
      vendor: data.Vendor || cls.Vendor || '',
      version: data.Version || '',
      subCategories: cls['Sub Categories'] || []
    };
  } catch (e) {
    return null;
  }
}

// 同一ディレクトリ内の他のプラグインらしきファイル名（ベンダー推定の手がかり）
function listSiblingPluginFiles(pluginPath, limit = 20) {
  try {
    const dir = path.dirname(pluginPath);
    const self = path.basename(pluginPath);
    return fs.readdirSync(dir)
      .filter(f => f !== self && /\.(dll|vst3)$/i.test(f))
      .slice(0, limit);
  } catch (e) {
    return [];
  }
}

// 主要VSTベンダーの正規名リスト（AIによるメーカー名の表記揺れ正規化用）
const KNOWN_VENDORS = [
  'FabFilter', 'Native Instruments', 'Xfer Records', 'Spectrasonics', 'u-he',
  'iZotope', 'Waves', 'Arturia', 'Valhalla DSP', 'Universal Audio', 'Softube',
  'Soundtoys', 'Eventide', 'Plugin Alliance', 'Brainworx', 'McDSP', 'Slate Digital',
  'Oeksound', 'Voxengo', 'MeldaProduction', 'Kilohearts', 'TAL Software', 'D16 Group',
  'Steinberg', 'IK Multimedia', 'KORG', 'Roland', 'Cherry Audio', 'Synapse Audio',
  'reFX', 'LennarDigital', 'Sonic Charge', 'Audio Damage', 'Cableguys', 'Baby Audio',
  'Tokyo Dawn Records', 'Output', 'Heavyocity', 'Spitfire Audio', 'EastWest',
  'Celemony', 'Antares', 'Image-Line', 'Ableton', 'Cockos', 'KV331 Audio',
  'Minimal Audio', 'W.A. Production', 'Sonnox', 'Nugen Audio'
];

const DESCRIPTION_LANG_NAMES = {
  en: 'English', ja: 'Japanese', de: 'German', fr: 'French',
  es: 'Spanish', zh: 'Simplified Chinese', ko: 'Korean'
};

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
            const errorMsg = nativeInfo && nativeInfo.error ? nativeInfo.error : 'Possibly not a VST plugin.';
            const isNotPlugin = errorMsg.includes('Not a valid VST2 or VST3 plugin');
            
            const cachedEntry = {
              name: plugin.name.replace(/\.(dll|vst3)$/i, ''),
              developer: 'Unknown',
              category: isNotPlugin ? 'Not Plugin' : 'unresolved',
              description: `Load error: ${errorMsg}`,
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

  // Geminiによるプラグイン一括解析（複数件を1リクエストで解析し、表記揺れを抑止）
  ipcMain.handle('analyze-plugins', async (event, pluginList, language) => {
    const settings = loadSettings();

    if (!settings.apiKey) {
      return {
        success: false,
        error: 'API_KEY_MISSING',
        message: 'Gemini API key is not configured. Please enter it in Settings.'
      };
    }

    if (!Array.isArray(pluginList) || pluginList.length === 0) {
      return { success: false, error: 'EMPTY_LIST', message: 'No plugins to analyze.' };
    }

    try {
      // バイナリ未スキャンのものは先にネイティブスキャンで基本情報を取得
      for (const p of pluginList) {
        if (!pluginsCache[p.path] || !pluginsCache[p.path].nativeScanned) {
          const nativeInfo = await getPluginMetadataNative(p.path);
          if (nativeInfo && nativeInfo.success) {
            pluginsCache[p.path] = {
              name: nativeInfo.name,
              developer: nativeInfo.developer || 'Unknown',
              category: nativeInfo.category || 'Other',
              is_plugin: true,
              nativeScanned: true
            };
          }
        }
      }

      // ヒント情報を集約してAIに渡す入力を構築
      const inputPlugins = pluginList.map((p, idx) => {
        const existing = pluginsCache[p.path] || {};
        const moduleInfo = readVst3ModuleInfo(p.path);
        return {
          id: idx,
          filename: p.name,
          path: p.path,
          type: p.type || '',
          binaryName: existing.name || '',
          binaryVendor: existing.developer || '',
          binaryCategory: existing.category || '',
          moduleinfo: moduleInfo,
          siblingFiles: listSiblingPluginFiles(p.path)
        };
      });

      const descLang = DESCRIPTION_LANG_NAMES[language] || 'English';
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0 // 同一入力には同一結果を返し、再解析ごとのブレを抑える
        }
      });

      const prompt = `You are an expert on music production and VST plugins (instruments and effects).
Identify each plugin in the "plugins" array below and output a JSON array of results.

For each plugin you are given: the filename, full path, plugin type (VST2/VST3),
metadata extracted from the plugin binary itself (binaryName/binaryVendor/binaryCategory),
the official VST3 moduleinfo.json contents when available, and names of other
plugin files found in the same directory (siblingFiles, a hint for the vendor).

Rules:
- Prefer moduleinfo.json fields when present; otherwise treat binaryName/binaryVendor
  as the primary source and clean up their notation for the final name/developer.
- Normalize "developer" to the canonical vendor name (e.g. "Native Instruments GmbH" -> "Native Instruments").
  Known vendors for reference (not exhaustive): ${KNOWN_VENDORS.join(', ')}.
- "category": exactly one of 'Synthesizer', 'Sampler', 'Equalizer', 'Compressor',
  'Reverb', 'Delay', 'Distortion', 'Modulation', 'Utility', 'Other'. If the file is
  clearly not a music-production plugin (e.g. a system DLL or unrelated file), use 'Not Plugin'.
- "description": 1-2 concise, accurate sentences in ${descLang} describing what the plugin does.
- "is_plugin": true for a music-production VST instrument/effect, false otherwise.
- "confidence": "high" when identification is certain (official metadata or well-known product),
  "medium" when reasonably inferred, "low" when guessing.
- Be consistent: identical inputs must produce identical outputs, and plugins from the
  same vendor in one batch must share the same developer name.
- Output a pure JSON array. Each element: {"id": <same id>, "name", "developer",
  "category", "description", "is_plugin", "confidence"}. No markdown fences.

plugins:
${JSON.stringify(inputPlugins)}`;

      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const parsedArray = JSON.parse(text.trim());

      const usage = result.response.usageMetadata || {};
      const perItemPromptTokens = Math.round((usage.promptTokenCount || 0) / pluginList.length);
      const perItemCompletionTokens = Math.round((usage.candidatesTokenCount || 0) / pluginList.length);

      const ALLOWED_CATEGORIES = new Set([
        'Synthesizer', 'Sampler', 'Equalizer', 'Compressor', 'Reverb', 'Delay',
        'Distortion', 'Modulation', 'Utility', 'Other', 'Not Plugin'
      ]);

      const results = {};
      const seenIds = new Set();
      for (const item of Array.isArray(parsedArray) ? parsedArray : []) {
        const idx = Number(item.id);
        if (!Number.isInteger(idx) || idx < 0 || idx >= pluginList.length || seenIds.has(idx)) continue;
        seenIds.add(idx);
        const target = pluginList[idx];

        const category = ALLOWED_CATEGORIES.has(item.category) ? item.category : 'Other';
        const isPlugin = category === 'Not Plugin' ? false : item.is_plugin !== false;
        const confidence = ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'medium';

        const prev = pluginsCache[target.path] || {};
        const responseData = {
          ...prev,
          name: item.name || target.name,
          developer: item.developer || 'Unknown',
          category,
          description: item.description || prev.description || '',
          is_plugin: isPlugin,
          confidence,
          aiAnalyzed: true,
          nativeScanned: true,
          usage: {
            promptTokens: perItemPromptTokens,
            completionTokens: perItemCompletionTokens
          }
        };

        pluginsCache[target.path] = responseData;
        results[target.path] = responseData;
      }
      saveCache(pluginsCache);

      return { success: true, results };
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
  ipcMain.handle('send-chat-message', async (event, message, pluginsList, language) => {
    const settings = loadSettings();
    if (!settings.apiKey) {
      return {
        success: false,
        reply: 'Gemini API key is not configured. Please register it in the Settings tab.'
      };
    }

    try {
      const replyLang = DESCRIPTION_LANG_NAMES[language] || 'English';
      const genAI = new GoogleGenerativeAI(settings.apiKey);
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0
        }
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

      const prompt = `You are the dedicated AI assistant of the plugin manager app "Plugman".
The user asks questions about plugins (e.g. suggestions) or instructs you to fix plugin data (formal name, vendor, category, description).

Scanned plugin list:
${JSON.stringify(simplifiedPlugins)}

Rules:
1. If the user asks for plugin suggestions, pick the most suitable ones from the list above and explain their characteristics.
2. If the user instructs a data fix (e.g. "change ANINA's category to Equalizer"), create an "action" object in the JSON that applies the requested change to the matching plugin.
3. When changing "category", choose exactly one of: 'Synthesizer', 'Sampler', 'Equalizer', 'Compressor', 'Reverb', 'Delay', 'Distortion', 'Modulation', 'Utility', 'Other', 'Not Plugin'.
4. Write "reply" in ${replyLang}. If you write a "description" inside an action, also write it in ${replyLang}.

Output JSON format:
{
  "reply": "reply message to the user",
  "action": null or {
    "type": "update_plugin",
    "path": "full path of the plugin to fix (path)",
    "data": {
      "name": "fixed product name (keep original if not instructed)",
      "developer": "fixed vendor name (keep original if not instructed)",
      "category": "fixed category (keep original if not instructed)",
      "description": "fixed description (keep original if not instructed; if the user gives detailed info, write a concise 1-2 sentence description in ${replyLang})"
    }
  }
}

User message: "${message}"

Output a pure JSON object only. No markdown fences such as \`\`\`json.`;

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
