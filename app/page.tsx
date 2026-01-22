// app/page.tsx
"use client";

import { useState, useEffect, useMemo } from "react";

// --- 1. 基础数据类型定义 ---
type Mode = "github" | "local";
type ReportType = "daily" | "yesterday" | "weekly";

interface CommitData {
  hash: string;
  author: string;
  date: string;
  message: string;
}

interface AIModel {
  id: string;
  name: string;
}

// --- 2. Electron 通信参数类型定义 (解决 window.electron: any) ---
interface GetGitLogParams {
  path: string;
  limit: number;
  after: string;
  before: string;
}

interface GetGitLogResult {
  commits: CommitData[];
  currentUser: string;
}

interface GenerateReportParams {
  commits: CommitData[];
  modelId: string;
  apiKeys: {
    aliyun: string;
    groq: string;
  };
}

// --- 3. 全局 Window 类型扩展 ---
declare global {
  interface Window {
    electron: {
      getGitLog: (params: GetGitLogParams) => Promise<GetGitLogResult>;
      generateReport: (params: GenerateReportParams) => Promise<string>;
    };
  }
}

// 定义支持的 AI 模型列表
const AI_MODELS: AIModel[] = [
  { id: "qwen-plus", name: "🇨🇳 通义千问 Plus (均衡推荐)" },
  { id: "qwen-max", name: "🇨🇳 通义千问 Max (最强逻辑)" },
  { id: "qwen-turbo", name: "🇨🇳 通义千问 Turbo (极速)" },
  { id: "llama-3.3-70b-versatile", name: "🇺🇸 Llama 3.3 70B (Meta最新)" },
  { id: "llama-3.1-70b-versatile", name: "🇺🇸 Llama 3.1 70B (稳定)" },
];

// --- 辅助函数 ---
const getDateString = (daysOffset: number = 0): string => {
  const date = new Date();
  date.setDate(date.getDate() + daysOffset);
  return date
    .toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "-");
};

export default function Home() {
  // --- 状态管理 ---
  const [mode, setMode] = useState<Mode>("local");
  const [inputValue, setInputValue] = useState<string>("D:/code/supplychain-frontend");

  // API Keys
  const [aliyunKey, setAliyunKey] = useState("");
  const [groqKey, setGroqKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  // 时间范围与条数
  const [startDate, setStartDate] = useState<string>(getDateString(-30));
  const [endDate, setEndDate] = useState<string>(getDateString(0));
  const [limit, setLimit] = useState<number>(25);

  // 报告设置
  const [reportType, setReportType] = useState<ReportType>("daily");
  const [currentUser, setCurrentUser] = useState<string>("");
  const [filterMerge, setFilterMerge] = useState<boolean>(true);
  const [selectedModel, setSelectedModel] = useState<string>(AI_MODELS[0].id);

  // 数据与加载状态
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [report, setReport] = useState("");
  const [generating, setGenerating] = useState(false);

  // 初始化：读取本地缓存
  useEffect(() => {
    const savedAliyun = localStorage.getItem("MY_ALIYUN_KEY");
    const savedGroq = localStorage.getItem("MY_GROQ_KEY");
    const savedPath = localStorage.getItem("MY_LAST_PATH");

    if (savedAliyun) setAliyunKey(savedAliyun);
    if (savedGroq) setGroqKey(savedGroq);
    if (savedPath) setInputValue(savedPath);
  }, []);

  // 保存 Key
  const saveKeys = () => {
    localStorage.setItem("MY_ALIYUN_KEY", aliyunKey);
    localStorage.setItem("MY_GROQ_KEY", groqKey);
    alert("✅ Key 已保存到本地！");
    setShowSettings(false);
  };

  // 自动刷新逻辑
  useEffect(() => {
    if (inputValue && mode === 'local') {
      localStorage.setItem("MY_LAST_PATH", inputValue);
      const timer = setTimeout(() => {
        handleFetch();
      }, 500);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate, limit, mode]); 

  // 获取提交记录
  const handleFetch = async () => {
    if (startDate > endDate) {
      alert("⚠️ 开始日期不能晚于结束日期");
      return;
    }

    setLoading(true);
    setReport("");
    setCommits([]);

    try {
      if (mode === "github") {
        alert("桌面版暂只支持本地模式，请切换到【本地硬盘】");
        setLoading(false);
        return;
      } 
      
      const result = await window.electron.getGitLog({
        path: inputValue,
        limit,
        after: startDate,
        before: endDate
      });

      setCommits(result.commits);
      setCurrentUser(result.currentUser);
      
    } catch (err: unknown) { // 👈 修复：使用 unknown 替代 any
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert("获取数据出错: " + errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // 计算显示的 Commits
  const filteredCommits = useMemo(() => {
    return commits.filter((c) => {
      if (filterMerge && c.message.startsWith("Merge")) return false;

      if (reportType === "daily") {
        const today = getDateString(0);
        const isToday = c.date === today;
        const isMe = c.author.toLowerCase().includes(currentUser.toLowerCase());
        return isToday && isMe;
      } else if (reportType === "yesterday") {
        const yesterday = getDateString(-1);
        const isYesterday = c.date === yesterday;
        const isMe = c.author.toLowerCase().includes(currentUser.toLowerCase());
        return isYesterday && isMe;
      }

      return true;
    });
  }, [commits, filterMerge, reportType, currentUser]);

  // 生成报告
  const handleGenerateReport = async () => {
    const targetCommits = filteredCommits;
    
    if (targetCommits.length === 0) {
      alert("⚠️ 过滤后没有符合条件的记录，无法生成报告。");
      return;
    }

    if (selectedModel.startsWith("qwen") && !aliyunKey) {
      alert("⚠️ 请先点击右上角设置，填入阿里云 API Key");
      setShowSettings(true);
      return;
    }
    if (selectedModel.startsWith("llama") && !groqKey) {
      alert("⚠️ 请先点击右上角设置，填入 Groq API Key");
      setShowSettings(true);
      return;
    }

    setGenerating(true);
    try {
      const aiResult = await window.electron.generateReport({
        commits: targetCommits,
        modelId: selectedModel,
        apiKeys: {
          aliyun: aliyunKey,
          groq: groqKey
        }
      });
      setReport(aiResult);
    } catch (err: unknown) { // 👈 修复：使用 unknown 替代 any
      const errorMessage = err instanceof Error ? err.message : String(err);
      alert("AI 生成失败: " + errorMessage);
    } finally {
      setGenerating(false);
    }
  };

  // --- 界面渲染 ---
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 font-sans">
      <div className="w-full max-w-3xl flex justify-between items-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 tracking-tight">
          Git {reportType === "daily" ? "📅 日报" : "📊 周报"}生成器
        </h1>
        <button 
          onClick={() => setShowSettings(!showSettings)}
          className="text-gray-500 hover:text-gray-900 transition-colors"
        >
          ⚙️ 设置 Key
        </button>
      </div>

      {/* 设置面板 */}
      {showSettings && (
        <div className="w-full max-w-3xl bg-white p-6 rounded-2xl shadow-xl mb-6 border border-blue-100 animate-in fade-in slide-in-from-top-2">
          <h3 className="font-bold text-gray-800 mb-4">🔑 API Key 配置 (保存在本地)</h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">阿里云 Key (用于通义千问)</label>
              <input 
                type="password" 
                value={aliyunKey}
                onChange={(e) => setAliyunKey(e.target.value)}
                placeholder="sk-xxxxxxxx"
                className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Groq Key (用于 Llama)</label>
              <input 
                type="password" 
                value={groqKey}
                onChange={(e) => setGroqKey(e.target.value)}
                placeholder="gsk-xxxxxxxx"
                className="w-full border p-2 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button 
              onClick={saveKeys}
              className="bg-black text-white px-4 py-2 rounded-lg hover:bg-gray-800 text-sm"
            >
              保存配置
            </button>
          </div>
        </div>
      )}

      <div className="w-full max-w-3xl bg-white p-6 rounded-2xl shadow-xl space-y-6 transition-all">
        {/* 1. 顶部控制栏 */}
        <div className="flex flex-wrap gap-4 justify-between items-center bg-gray-50 p-2 rounded-xl border border-gray-100">
          <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
            <button
              onClick={() => setMode("github")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "github" ? "bg-black text-white shadow" : "text-gray-500 hover:text-black"
              }`}
            >
              GitHub
            </button>
            <button
              onClick={() => setMode("local")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "local" ? "bg-black text-white shadow" : "text-gray-500 hover:text-black"
              }`}
            >
              本地硬盘
            </button>
          </div>

          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={filterMerge}
                onChange={(e) => setFilterMerge(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              🚫 过滤 Merge
            </label>

            <div className="flex bg-blue-50 p-1 rounded-lg border border-blue-100">
              <button
                onClick={() => setReportType("daily")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  reportType === "daily" ? "bg-blue-600 text-white shadow" : "text-blue-600 hover:bg-blue-100"
                }`}
              >
                只看今日
              </button>
              <button
                onClick={() => setReportType("yesterday")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  reportType === "yesterday" ? "bg-blue-600 text-white shadow" : "text-blue-600 hover:bg-blue-100"
                }`}
              >
                只看昨日
              </button>
              <button
                onClick={() => setReportType("weekly")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  reportType === "weekly" ? "bg-blue-600 text-white shadow" : "text-blue-600 hover:bg-blue-100"
                }`}
              >
                全部记录
              </button>
            </div>
          </div>
        </div>

        {/* 1.1 时间范围与条数选择 */}
        <div className="flex flex-wrap gap-4 items-center bg-gray-50 p-3 rounded-xl border border-gray-100 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-600 font-medium">📅 时间:</span>
            <input
              type="date"
              value={startDate}
              max={endDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            />
            <span className="text-gray-400">-</span>
            <input
              type="date"
              value={endDate}
              min={startDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-gray-700"
            />
          </div>

          <div className="w-px h-6 bg-gray-300 mx-2 hidden sm:block"></div>

          <div className="flex items-center gap-2">
             <span className="text-gray-600 font-medium">🔢 条数:</span>
             <div className="relative">
                <input 
                    type="number"
                    min="1"
                    max="500"
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm outline-none focus:ring-2 focus:ring-blue-500 text-center font-mono text-gray-700"
                />
             </div>
             <div className="flex gap-1">
                {[10, 25, 50, 100].map(n => (
                    <button 
                        key={n}
                        onClick={() => setLimit(n)}
                        className={`px-2 py-1 rounded text-xs border transition-all ${limit === n ? 'bg-gray-800 text-white border-gray-800 shadow-sm' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-100'}`}
                    >
                        {n}
                    </button>
                ))}
             </div>
          </div>
        </div>

        {/* 2. 路径输入区域 */}
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              className="w-full p-3 pl-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-black font-mono text-sm shadow-sm transition-all"
              placeholder={
                mode === "github" ? "username/repo" : "D:/path/to/project"
              }
            />
            <div className="absolute -bottom-6 left-1 text-[10px] text-gray-400">
              {mode === "github" ? "提示: 需公开仓库" : "提示: 请确保该目录下有 .git 文件夹"}
            </div>
          </div>

          <button
            onClick={handleFetch}
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-xl hover:bg-gray-800 disabled:bg-gray-400 whitespace-nowrap font-medium shadow-md transition-all active:scale-95"
          >
            {loading ? "⏳ 读取中..." : "1. 获取记录"}
          </button>
        </div>

        {/* 3. 作者过滤器 */}
        {(reportType === "daily" || reportType === "yesterday") && commits.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <span className="text-sm text-yellow-800 font-bold">
              🕵️‍♂️ 你的 Git 名字:
            </span>
            <input
              type="text"
              value={currentUser}
              onChange={(e) => setCurrentUser(e.target.value)}
              className="border border-yellow-300 rounded px-2 py-1 text-sm outline-none focus:border-yellow-600 text-gray-800 bg-white"
              placeholder="例如: Jack Ma"
            />
            <span className="text-xs text-yellow-600 hidden sm:inline">
              (系统自动获取，不对请手动修改)
            </span>
          </div>
        )}

        {/* 4. 列表与生成结果区域 */}
        {commits.length > 0 && (
          <div className="border-t border-gray-100 pt-6 mt-4">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>📝 提交记录</span>
                <span className="text-xs font-normal bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">
                  {commits.length} 条
                </span>
              </h2>

              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={selectedModel}
                  onChange={(e) => setSelectedModel(e.target.value)}
                  disabled={generating}
                  className="flex-1 sm:flex-none bg-white border border-gray-300 text-gray-700 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2.5 outline-none shadow-sm cursor-pointer"
                >
                  {AI_MODELS.map((model) => (
                    <option key={model.id} value={model.id}>
                      {model.name}
                    </option>
                  ))}
                </select>

                <button
                  onClick={handleGenerateReport}
                  disabled={generating}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:shadow-lg hover:opacity-95 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
                >
                  {generating ? "🤖 写作中..." : "✨ 生成报告"}
                </button>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 max-h-64 overflow-y-auto text-sm space-y-2 mb-8 custom-scrollbar">
              {commits.map((c) => {
                const isMerge = c.message.startsWith("Merge");
                const isSelected = filteredCommits.includes(c);

                return (
                  <div
                    key={c.hash}
                    className={`flex gap-3 items-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-white shadow-sm opacity-100"
                        : "opacity-40 grayscale hover:opacity-60"
                    }`}
                  >
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        isSelected ? "bg-green-500" : "bg-gray-300"
                      }`}
                    />
                    <span className="font-mono text-[10px] text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200 flex-shrink-0">
                      {c.date}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
                        c.author.toLowerCase().includes(currentUser.toLowerCase()) && currentUser
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {c.author}
                    </span>
                    <span
                      className={`truncate text-gray-700 flex-1 ${isMerge ? "italic" : ""}`}
                      title={c.message}
                    >
                      {isMerge && "🔀 "}
                      {c.message}
                    </span>
                  </div>
                );
              })}
            </div>

            {report && (
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 rounded-2xl p-6 shadow-inner animate-in fade-in slide-in-from-bottom-4">
                <h3 className="text-blue-900 font-bold mb-4 flex items-center gap-2 border-b border-blue-200 pb-2">
                  📑 生成结果
                </h3>
                <div className="prose prose-blue prose-sm max-w-none text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                  {report}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}