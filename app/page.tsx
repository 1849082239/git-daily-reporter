// app/page.tsx
'use client'; // <--- ⚠️ 注意：一定要加这行！因为我们用了 useState

import { useState } from 'react';
import { fetchCommits, CommitData } from './actions'; 

export default function Home() {
  const [repo, setRepo] = useState('facebook/react');
  const [loading, setLoading] = useState(false);
  
  interface Commit {
    hash: string;
    message: string;
    author: string;
    date: string;
  }

  // 👇 2. 使用引入的接口类型
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [error, setError] = useState(''); // 加个报错状态

  const handleGenerate = async () => { // ⚠️ 变成 async
    setLoading(true);
    setError(''); // 清空旧错误
    setCommits([]); // 清空旧数据

    try {
      // 👇 3. 像调用普通 JS 函数一样调用后端逻辑！
      const data = await fetchCommits(repo);
      setCommits(data);
    } catch (err) {
      // 捕获错误
      setError(err instanceof Error ? err.message : '发生未知错误');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <h1 className="text-4xl font-bold text-gray-900 mb-8">
        Git 日报生成器 🤖
      </h1>
      
      <div className="w-full max-w-md bg-white p-6 rounded-xl shadow-lg">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          输入 GitHub 仓库 (例如: owner/repo)
        </label>
        
        <input
          type="text"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          className="w-full p-3 border border-gray-300 rounded-lg mb-4 focus:ring-2 focus:ring-blue-500 outline-none text-black"
          placeholder="username/repo"
        />

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition disabled:bg-gray-400"
        >
          {loading ? '生成中...' : '生成日报'}
        </button>
        {
          commits.length > 0 ? commits.map((commit) => (
            <div key={commit.hash}>
              <h3>{commit.message}</h3>
              <p>{commit.author} - {commit.date}</p>
            </div>
          )) : null
        }
      </div>
    </div>
  );
}