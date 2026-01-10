// app/actions.ts
'use server'; // <--- ⚠️ 这一行非常重要！标记这是一个服务端运行的文件
// 👇 1. 引入 Groq
import Groq from "groq-sdk";
import { HttpsProxyAgent } from 'https-proxy-agent'; // <--- ⚠️ 必须补上这一行！

// 定义我们想要的数据结构
export interface CommitData {
  message: string;
  author: string;
  date: string;
  hash: string;
}
      console.log('process.env.GITHUB_TOKEN',process.env.GITHUB_TOKEN);

export async function fetchCommits(repoUrl: string): Promise<CommitData[]> {
//   await getGroqModels(); 
  // 1. 简单的输入清洗，把 "https://github.com/facebook/react" 变成 "facebook/react"
  const cleanRepo = repoUrl.replace('https://github.com/', '').trim();
  
  if (!cleanRepo.includes('/')) {
    throw new Error('仓库格式错误，请输入 "owner/repo" 例如 "facebook/react"');
  }
  console.log('api is:----------->',`https://api.github.com/repos/${cleanRepo}/commits?per_page=10`);
  
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
// 👇 2. 新增：生成日报的函数
export async function generateWeeklyReport(commits: CommitData[]) {
  // 实例化 Groq 客户端
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
  });

  // 3. 构造 Prompt (提示词工程)
  // 这里的技巧是：给 AI 设定角色，并把数据转成字符串喂给它
  const commitsString = commits.map(c => `- ${c.date}: ${c.message} (by ${c.author})`).join('\n');

  const prompt = `
    你是一个资深的技术项目经理。请根据以下 GitHub 提交记录，写一份专业的日报/周报。
    
    提交记录：
    ${commitsString}

    要求：
    1. 使用中文。
    2. 分类总结（例如：✨ 新功能、🐛 修复、🔨 优化）。
    3. 语气专业、简洁。
    4. 不要罗列所有细节，要提炼核心价值。
    5. 使用 Markdown 格式输出。
  `;

  try {
    const chatCompletion = await groq.chat.completions.create({
      messages: [
        { role: "system", content: "你是一个高效的日报生成助手。" },
        { role: "user", content: prompt },
      ],
      // 推荐使用 Llama3 70B 模型，速度快且逻辑好
      model: "llama-3.3-70b-versatile",
      temperature: 0.5, // 0.5 比较稳重，不会乱编
    });

    return chatCompletion.choices[0]?.message?.content || "生成失败，AI 没有返回内容。";
  } catch (error) {
    console.error(process.env.GROQ_API_KEY,"Groq API Error:", error);
    throw new Error("AI 生成周报失败，请检查 API Key 或网络。");
  }
}

export async function getGroqModels() {
  const proxyUrl = 'http://127.0.0.1:7890'; // 别忘了你的代理！
  
  const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
    httpAgent: new HttpsProxyAgent(proxyUrl),
  });

  try {
    const list = await groq.models.list();
    // 只打印模型的 ID
    console.log("====== Groq 可用模型列表 ======");
    list.data.forEach((model) => {
      console.log(`ID: ${model.id}  (拥有者: ${model.owned_by})`);
    });
    console.log("=============================");
    return list.data;
  } catch (error) {
    console.error("获取模型列表失败:", error);
  }
}