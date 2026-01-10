// app/actions.ts
'use server'; // <--- ⚠️ 这一行非常重要！标记这是一个服务端运行的文件

// 定义我们想要的数据结构
export interface CommitData {
  message: string;
  author: string;
  date: string;
  hash: string;
}

export async function fetchCommits(repoUrl: string): Promise<CommitData[]> {
  // 1. 简单的输入清洗，把 "https://github.com/facebook/react" 变成 "facebook/react"
  const cleanRepo = repoUrl.replace('https://github.com/', '').trim();
  
  if (!cleanRepo.includes('/')) {
    throw new Error('仓库格式错误，请输入 "owner/repo" 例如 "facebook/react"');
  }

  // 2. 调用 GitHub API
  const response = await fetch(`https://api.github.com/repos/${cleanRepo}/commits?per_page=10`, {
    headers: {
      'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, // 从 .env.local 读取
      'Accept': 'application/vnd.github.v3+json',
    },
    next: { revalidate: 60 } // 缓存 60 秒，避免频繁请求
  });

  if (!response.ok) {
    throw new Error(`GitHub API 请求失败: ${response.statusText}`);
  }

  const data = await response.json();

  // 3. 这里的 data 是 GitHub 返回的原始巨大对象，我们只取我们需要的部分
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return data.map((item: any) => ({
    hash: item.sha.substring(0, 7),
    message: item.commit.message,
    author: item.commit.author.name,
    date: new Date(item.commit.author.date).toLocaleDateString('zh-CN'),
  }));
}