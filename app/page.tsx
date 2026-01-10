// app/page.tsx
'use client';

import { useState } from 'react';
// 👇 引入新写的函数
import { fetchCommits, generateWeeklyReport, CommitData } from './actions'; 

export default function Home() {
  // const [repo, setRepo] = useState('1849082239/git-daily-reporter');
  const [repo, setRepo] = useState('VirginiaTseng/supplychain-frontend');
  const [loading, setLoading] = useState(false);
  const [commits, setCommits] = useState<CommitData[]>([]);
  
  // 👇 新增状态：存日报内容
  const [report, setReport] = useState('');
  const [generating, setGenerating] = useState(false); // AI 生成中的 loading 状态

  const handleFetch = async () => {
    setLoading(true);
    setReport(''); // 清空旧日报
    try {
      const data = await fetchCommits(repo);
      setCommits(data);
    } catch (err) {
      alert(err instanceof Error ? err.message : '错误');
    } finally {
      setLoading(false);
    }
  };

  // 👇 新增：点击生成日报
  const handleGenerateReport = async () => {
    if (commits.length === 0) return;
    
    setGenerating(true);
    try {
      // 把现有的 commits 传给后端 AI
      const aiResult = await generateWeeklyReport(commits);
      setReport(aiResult);
    } catch (err) {
      alert('AI 罢工了：' + err);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center py-10 px-4">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">Git 日报生成器 🤖</h1>
      
      <div className="w-full max-w-2xl bg-white p-6 rounded-xl shadow-lg space-y-6">
        
        {/* 输入区域 */}
        <div className="flex gap-2">
          <input
            type="text"
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            className="flex-1 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-black"
            placeholder="username/repo"
          />
          <button
            onClick={handleFetch}
            disabled={loading}
            className="bg-black text-white px-6 py-3 rounded-lg hover:bg-gray-800 disabled:bg-gray-400 whitespace-nowrap"
          >
            {loading ? '读取中...' : '1. 获取 Commits'}
          </button>
        </div>

        {/* Commits 列表区域 (有数据才显示) */}
        {commits.length > 0 && (
          <div className="border-t pt-6 animation-fade-in">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-gray-800">
                最近 10 条提交记录
              </h2>
              {/* 👇 生成日报按钮 */}
              <button
                onClick={handleGenerateReport}
                disabled={generating}
                className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-4 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
              >
                {generating ? 'AI 思考中...' : '✨ 2. 生成周报'}
              </button>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 max-h-48 overflow-y-auto text-sm space-y-2 mb-6">
              {commits.map((c) => (
                <div key={c.hash} className="flex gap-2 text-gray-600">
                  <span className="font-mono text-xs bg-gray-200 px-1 rounded">{c.hash}</span>
                  <span className="truncate">{c.message}</span>
                </div>
              ))}
            </div>

            {/* 👇 日报展示区域 */}
            {report && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-6">
                <h3 className="text-blue-800 font-bold mb-4 flex items-center gap-2">
                   📑 生成结果
                </h3>
                {/* 这里的 whitespace-pre-wrap 是为了保留换行符 */}
                <div className="prose prose-blue max-w-none text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
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