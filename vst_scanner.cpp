#include <windows.h>
#include <iostream>
#include <string>
#include <vector>
#include <cstdint> // int32_t 用

// VST2 関連定義
struct AEffect;
typedef intptr_t (*audioMasterCallback)(AEffect* effect, int opcode, int index, intptr_t value, void* ptr, float opt);
typedef intptr_t (*vstDispatcherProc)(AEffect* effect, int opcode, int index, intptr_t value, void* ptr, float opt);

struct AEffect {
	int magic;
	vstDispatcherProc dispatcher;
};

#define VST2_MAGIC 0x56737450 // 'VstP'

enum VST2Opcodes {
	effOpen = 0,
	effClose = 1,
	effGetEffectName = 45,
	effGetVendorString = 47,
	effGetProductString = 48,
	effGetPlugCategory = 35
};

enum VST2Category {
	kPlugCategUnknown = 0,
	kPlugCategEffect,
	kPlugCategSynth
};

// ダミーコールバック
intptr_t audioMaster(AEffect* effect, int opcode, int index, intptr_t value, void* ptr, float opt) {
	return 0;
}

// VST3 関連定義
struct PFactoryInfo {
	char vendor[64];
	char url[256];
	char email[128];
	int32_t flags;
};

struct PClassInfo {
	unsigned char cid[16];
	int32_t cardinality;
	char category[32];
	char name[64];
};

// 名前衝突を防ぐために Vst3 のプレフィックスを付ける
class Vst3IUnknown {
public:
	virtual int32_t queryInterface(const void* iid, void** obj) = 0;
	virtual uint32_t addRef() = 0;
	virtual uint32_t release() = 0;
};

class Vst3IPluginFactory : public Vst3IUnknown {
public:
	virtual int32_t getFactoryInfo(PFactoryInfo* info) = 0;
	virtual int32_t countClasses() = 0;
	virtual int32_t getClassInfo(int32_t index, PClassInfo* info) = 0;
	virtual int32_t createInstance(const char* cid, const char* _iid, void** obj) = 0;
};

typedef Vst3IPluginFactory* (__cdecl* GetPluginFactoryProc)();

// JSONエスケープ用簡易関数
std::string jsonEscape(const std::string& input) {
	std::string output;
	for (char c : input) {
		if (c == '\\') output += "\\\\";
		else if (c == '"') output += "\\\"";
		else if (c == '\n') output += "\\n";
		else if (c == '\r') output += "\\r";
		else if (c == '\t') output += "\\t";
		else if (c >= 0 && c < 32) {
			// 制御文字の無視
		}
		else output += c;
	}
	return output;
}

// VST3パッケージフォルダから実体DLLのパスを解決する
std::wstring resolveVst3DllPath(const std::wstring& folderPath) {
	DWORD attrs = GetFileAttributesW(folderPath.c_str());
	if (attrs == INVALID_FILE_ATTRIBUTES || !(attrs & FILE_ATTRIBUTE_DIRECTORY)) {
		return folderPath; // フォルダでなければそのまま返す
	}

	// フォルダ名（例: "Amigo.vst3"）を取得
	size_t lastSlash = folderPath.find_last_of(L"\\/");
	std::wstring folderName = (lastSlash == std::wstring::npos) ? folderPath : folderPath.substr(lastSlash + 1);

	// VST3規格の標準的な配置パターン
	// 1. Contents/x86_64-win/xxx.vst3
	std::wstring path64 = folderPath + L"\\Contents\\x86_64-win\\" + folderName;
	if (GetFileAttributesW(path64.c_str()) != INVALID_FILE_ATTRIBUTES) {
		return path64;
	}

	// 2. Contents/x86-win/xxx.vst3
	std::wstring path32 = folderPath + L"\\Contents\\x86-win\\" + folderName;
	if (GetFileAttributesW(path32.c_str()) != INVALID_FILE_ATTRIBUTES) {
		return path32;
	}

	// 3. フォルダ直下の同名ファイル（古いVST3や非標準）
	std::wstring pathDirect = folderPath + L"\\" + folderName;
	if (GetFileAttributesW(pathDirect.c_str()) != INVALID_FILE_ATTRIBUTES) {
		return pathDirect;
	}

	// 4. Contents/x86_64-win/ 内の最初のファイルを探す
	std::wstring searchDir = folderPath + L"\\Contents\\x86_64-win\\*";
	WIN32_FIND_DATAW findData;
	HANDLE hFind = FindFirstFileW(searchDir.c_str(), &findData);
	if (hFind != INVALID_HANDLE_VALUE) {
		do {
			if (!(findData.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY)) {
				std::wstring foundFile = folderPath + L"\\Contents\\x86_64-win\\" + findData.cFileName;
				FindClose(hFind);
				return foundFile;
			}
		} while (FindNextFileW(hFind, &findData));
		FindClose(hFind);
	}

	return folderPath; // 見つからなければ元のパスを返す
}

int wmain(int argc, wchar_t* argv[]) {
	// 日本語出力対応
	std::cout.sync_with_stdio(false);
	std::cout.imbue(std::locale(""));
	
	if (argc < 2) {
		std::cout << "{\"success\":false,\"error\":\"Missing plugin path argument\"}\n";
		return 1;
	}

	std::wstring pluginPath = argv[1];
	std::wstring resolvedPath = resolveVst3DllPath(pluginPath);
	
	// DLLをロード
	HMODULE hModule = LoadLibraryW(resolvedPath.c_str());
	if (!hModule) {
		DWORD err = GetLastError();
		std::cout << "{\"success\":false,\"error\":\"Failed to load library (Code " << err << ")\"}\n";
		return 1;
	}

	// 1. VST3のGetPluginFactoryをチェック
	GetPluginFactoryProc getPluginFactory = (GetPluginFactoryProc)GetProcAddress(hModule, "GetPluginFactory");
	if (getPluginFactory) {
		Vst3IPluginFactory* factory = getPluginFactory();
		if (factory) {
			PFactoryInfo factoryInfo = {};
			factory->getFactoryInfo(&factoryInfo);

			std::string vendor = factoryInfo.vendor;
			int classCount = factory->countClasses();

			std::string pluginName = "";
			std::string category = "Other";

			// クラス情報をスキャン
			for (int i = 0; i < classCount; i++) {
				PClassInfo classInfo = {};
				if (factory->getClassInfo(i, &classInfo) == 0) {
					std::string cat = classInfo.category;
					if (cat == "Audio Effect" || cat == "Audio Effect Component" || cat == "Effect" ||
						cat == "Instrument" || cat == "Synth" || cat == "Generator") {
						pluginName = classInfo.name;
						if (cat == "Instrument" || cat == "Synth") {
							category = "Synthesizer";
						} else {
							category = "Effect";
						}
						break;
					}
				}
			}

			if (pluginName.empty()) {
				PClassInfo classInfo = {};
				if (classCount > 0 && factory->getClassInfo(0, &classInfo) == 0) {
					pluginName = classInfo.name;
				}
			}

			std::cout << "{\n"
				<< "  \"success\": true,\n"
				<< "  \"type\": \"VST3\",\n"
				<< "  \"name\": \"" << jsonEscape(pluginName) << "\",\n"
				<< "  \"developer\": \"" << jsonEscape(vendor) << "\",\n"
				<< "  \"category\": \"" << category << "\"\n"
				<< "}\n";

			FreeLibrary(hModule);
			return 0;
		}
	}

	// 2. VST2のVSTPluginMain / mainをチェック
	typedef AEffect* (__cdecl* VstEntryProc)(audioMasterCallback master);
	VstEntryProc vstEntry = (VstEntryProc)GetProcAddress(hModule, "VSTPluginMain");
	if (!vstEntry) {
		vstEntry = (VstEntryProc)GetProcAddress(hModule, "main");
	}

	if (vstEntry) {
		try {
			AEffect* effect = vstEntry(audioMaster);
			if (effect && effect->magic == VST2_MAGIC && effect->dispatcher) {
				char nameBuf[256] = {};
				char vendorBuf[256] = {};
				char productBuf[256] = {};

				effect->dispatcher(effect, effOpen, 0, 0, nullptr, 0.0f);
				effect->dispatcher(effect, effGetEffectName, 0, 0, nameBuf, 0.0f);
				effect->dispatcher(effect, effGetVendorString, 0, 0, vendorBuf, 0.0f);
				effect->dispatcher(effect, effGetProductString, 0, 0, productBuf, 0.0f);
				
				intptr_t catId = effect->dispatcher(effect, effGetPlugCategory, 0, 0, nullptr, 0.0f);
				effect->dispatcher(effect, effClose, 0, 0, nullptr, 0.0f);

				std::string name = nameBuf;
				if (name.empty()) name = productBuf;
				std::string vendor = vendorBuf;
				std::string category = "Effect";

				if (catId == kPlugCategSynth) {
					category = "Synthesizer";
				}

				std::cout << "{\n"
					<< "  \"success\": true,\n"
					<< "  \"type\": \"VST2\",\n"
					<< "  \"name\": \"" << jsonEscape(name) << "\",\n"
					<< "  \"developer\": \"" << jsonEscape(vendor) << "\",\n"
					<< "  \"category\": \"" << category << "\"\n"
					<< "}\n";

				FreeLibrary(hModule);
				return 0;
			}
		} catch (...) {
			std::cout << "{\"success\":false,\"error\":\"Exception occurred inside VSTPluginMain dispatcher\"}\n";
			FreeLibrary(hModule);
			return 1;
		}
	}

	FreeLibrary(hModule);
	std::cout << "{\"success\":false,\"error\":\"Not a valid VST2 or VST3 plugin (missing entry points)\"}\n";
	return 1;
}
