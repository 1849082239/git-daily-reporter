// app/page.tsx
"use client";

import { useState, useEffect } from "react";
// 引入后端 Server Actions
import {
  fetchCommits,
  fetchLocalCommits,
  getGitCurrentUser,
  generateWeeklyReport,
  CommitData,
} from "./actions";

// 定义支持的 AI 模型列表 (阿里云 + Groq)
const AI_MODELS = [
  // --- 阿里云系列 (国内直连) ---
  { id: "qwen-flash", name: "🇨🇳 通义千问 Turbo (极速)" },
  { id: "qwen-long-latest", name: "🇨🇳 通义千问 Plus (均衡推荐)" },
  { id: "qwen-long-2025-01-25", name: "🇨🇳 通义千问 Max (最强逻辑)" },

  // --- Groq 系列 (需代理) ---
  { id: "llama-3.3-70b-versatile", name: "🇺🇸 Llama 3.3 70B (Meta最新)" },
  { id: "llama-3.1-70b-versatile", name: "🇺🇸 Llama 3.1 70B (稳定)" },
  { id: "llama-3.1-8b-instant", name: "🇺🇸 Llama 3.1 8B (极速)" },
];

export default function Home() {
  // --- 状态管理 ---

  // 1. 基础设置
  const [mode, setMode] = useState<"github" | "local">("local"); // 模式：本地/网络
  const [inputValue, setInputValue] = useState("D:/code/supplychain-frontend"); // 仓库路径或名

  // 2. 报告设置
  const [reportType, setReportType] = useState<"daily" | "weekly">("daily"); // 日报/周报
  const [currentUser, setCurrentUser] = useState(""); // 当前用户 (用于日报过滤)
  const [filterMerge, setFilterMerge] = useState(true); // 是否过滤 Merge 记录
  const [selectedModel, setSelectedModel] = useState(AI_MODELS[0].id); // 选中的 AI 模型

  // 3. 数据与加载状态
  const [loading, setLoading] = useState(false); // 获取 Commit loading
  const [commits, setCommits] = useState<CommitData[]>([]); // Commit 列表
  const [report, setReport] = useState(""); // AI 生成的报告
  const [generating, setGenerating] = useState(false); // AI 生成 loading

  // 👇 2. 新增：页面初始化自动执行 (相当于 Vue mounted)
  useEffect(() => {
    // 只有当路径不为空时才自动读取
    if (inputValue) {
      handleFetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 空数组 [] 代表只在组件挂载时执行一次

  // 获取提交记录
  const handleFetch = async () => {
    setLoading(true);
    setReport("");
    setCommits([]);

    try {
      let data;
      if (mode === "github") {
        data = await fetchCommits(inputValue);
        setCurrentUser(""); // GitHub 模式暂不自动推断用户
      } else {
        // 本地模式：获取记录 + 获取用户名
        data = await fetchLocalCommits(inputValue);
        const user = await getGitCurrentUser(inputValue);
        setCurrentUser(user);
      }
      setCommits(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : "获取数据出错");
    } finally {
      setLoading(false);
    }
  };
  // handleFetch();

  // 核心：过滤并调用 AI 生成报告
  const handleGenerateReport = async () => {
    if (commits.length === 0) return;

    // 1. 执行过滤逻辑
    const targetCommits = commits.filter((c) => {
      // 规则 A: 过滤 Merge 记录
      if (filterMerge && c.message.startsWith("Merge")) return false;

      // 规则 B: 日报模式 (只看今天 + 只看我)
      if (reportType === "daily") {
        const today = new Date()
          .toLocaleDateString("zh-CN", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
          .replace(/\//g, "-");
        const isToday = c.date === today;
        const isMe = c.author.toLowerCase().includes(currentUser.toLowerCase());
        return isToday && isMe;
      }

      // 规则 C: 周报模式 (默认全要)
      return true;
    });

    if (targetCommits.length === 0) {
      alert(
        `⚠️ 过滤后没有符合条件的记录。\n请检查：\n1. 今天是否有提交？\n2. 用户名 "${currentUser}" 是否匹配？\n3. 是否全是 Merge 记录？`
      );
      return;
    }

    // 2. 调用后端 AI
    setGenerating(true);
    try {
      const aiResult = await generateWeeklyReport(targetCommits, selectedModel);
      setReport(aiResult);
    } catch (err) {
      alert("AI 生成失败: " + err);
    } finally {
      setGenerating(false);
    }
  };

  // --- 界面渲染 ---
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4 font-sans">
      <h1 className="text-4xl font-bold text-gray-900 mb-8 tracking-tight">
        Git {reportType === "daily" ? "📅 日报" : "📊 周报"}生成器
      </h1>

      <div className="w-full max-w-3xl bg-white p-6 rounded-2xl shadow-xl space-y-6 transition-all">
        {/* 1. 顶部控制栏 (第一行) */}
        <div className="flex flex-wrap gap-4 justify-between items-center bg-gray-50 p-2 rounded-xl border border-gray-100">
          {/* 左侧：模式切换 */}
          <div className="flex bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
            <button
              onClick={() => setMode("github")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "github"
                  ? "bg-black text-white shadow"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              GitHub
            </button>
            <button
              onClick={() => setMode("local")}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                mode === "local"
                  ? "bg-black text-white shadow"
                  : "text-gray-500 hover:text-black"
              }`}
            >
              本地硬盘
            </button>
          </div>

          {/* 右侧：报表类型 & 过滤开关 */}
          <div className="flex items-center gap-4">
            {/* Merge 过滤器 */}
            <label className="flex items-center gap-2 cursor-pointer select-none text-sm font-medium text-gray-600 hover:text-gray-900">
              <input
                type="checkbox"
                checked={filterMerge}
                onChange={(e) => setFilterMerge(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 border-gray-300"
              />
              🚫 过滤 Merge
            </label>

            {/* 日报/周报切换 */}
            <div className="flex bg-blue-50 p-1 rounded-lg border border-blue-100">
              <button
                onClick={() => setReportType("daily")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  reportType === "daily"
                    ? "bg-blue-600 text-white shadow"
                    : "text-blue-600 hover:bg-blue-100"
                }`}
              >
                只看今日
              </button>
              <button
                onClick={() => setReportType("weekly")}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-all ${
                  reportType === "weekly"
                    ? "bg-blue-600 text-white shadow"
                    : "text-blue-600 hover:bg-blue-100"
                }`}
              >
                全部记录
              </button>
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
                mode === "github"
                  ? "username/repo (例如 facebook/react)"
                  : "D:/path/to/project"
              }
            />
            {/* 小提示 */}
            <div className="absolute -bottom-6 left-1 text-[10px] text-gray-400">
              {mode === "github"
                ? "提示: 需公开仓库"
                : "提示: 请确保该目录下有 .git 文件夹"}
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

        {/* 3. 日报专属：作者过滤器 (仅在有数据且是日报模式时显示) */}
        {reportType === "daily" && commits.length > 0 && (
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
              (系统自动获取，不对请手动修改以匹配列表)
            </span>
          </div>
        )}

        {/* 4. 列表与生成结果区域 */}
        {commits.length > 0 && (
          <div className="border-t border-gray-100 pt-6 mt-4">
            {/* 标题栏 + 模型选择 + 生成按钮 */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
              <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                <span>📝 提交记录</span>
                <span className="text-xs font-normal bg-gray-100 px-2 py-0.5 rounded-full text-gray-500">
                  {commits.length} 条
                </span>
              </h2>

              <div className="flex gap-2 w-full sm:w-auto">
                {/* 模型选择 */}
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

                {/* 生成按钮 */}
                <button
                  onClick={handleGenerateReport}
                  disabled={generating}
                  className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-lg font-medium hover:shadow-lg hover:opacity-95 disabled:opacity-50 disabled:shadow-none transition-all flex items-center gap-2 whitespace-nowrap active:scale-95"
                >
                  {generating ? "🤖 写作中..." : "✨ 生成报告"}
                </button>
              </div>
            </div>

            {/* Commits 列表可视化 */}
            <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 max-h-64 overflow-y-auto text-sm space-y-2 mb-8 custom-scrollbar">
              {commits.map((c) => {
                const today = new Date()
                  .toLocaleDateString("zh-CN", {
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit",
                  })
                  .replace(/\//g, "-");

                // 判断逻辑：是否是 Merge？
                const isMerge = c.message.startsWith("Merge");

                // 判断逻辑：是否符合日报条件？
                const isDailyTarget =
                  reportType === "daily"
                    ? c.date === today &&
                      c.author.toLowerCase().includes(currentUser.toLowerCase())
                    : true;

                // 最终状态：被选中 = 符合模式条件 且 不是被过滤的Merge
                const isSelected = isDailyTarget && !(filterMerge && isMerge);

                return (
                  <div
                    key={c.hash}
                    className={`flex gap-3 items-center p-2 rounded-lg transition-all ${
                      isSelected
                        ? "bg-white shadow-sm opacity-100"
                        : "opacity-40 grayscale hover:opacity-60"
                    }`}
                  >
                    {/* 状态指示点 */}
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
                        c.author
                          .toLowerCase()
                          .includes(currentUser.toLowerCase()) && currentUser
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-200 text-gray-500"
                      }`}
                    >
                      {c.author}
                    </span>

                    <span
                      className={`truncate text-gray-700 flex-1 ${
                        isMerge ? "italic" : ""
                      }`}
                      title={c.message}
                    >
                      {isMerge && "🔀 "}
                      {c.message}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* AI 结果展示区 */}
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
