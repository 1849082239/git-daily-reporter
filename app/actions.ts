// app/actions.ts
"use server"; // <--- ⚠️ 这一行非常重要！标记这是一个服务端运行的文件
// 👇 1. 引入 Groq
import Groq from "groq-sdk";
import OpenAI from "openai";
import { HttpsProxyAgent } from "https-proxy-agent"; // <--- ⚠️ 必须补上这一行！
// 👇 1. 引入 Node.js 原生模块
import { exec } from "child_process";
import { promisify } from "util";

// 定义我们想要的数据结构
export interface CommitData {
  message: string;
  author: string;
  date: string;
  hash: string;
}
// 把 exec 变成 Promise 风格，方便用 await
const execAsync = promisify(exec);

// ... (之前的 fetchCommits 代码保留) ...

// 👇 2. 新增：读取本地 Git 记录的函数
export async function fetchLocalCommits(
  folderPath: string,
  limit: number = 25,
  startDate?: string,
  endDate?: string
): Promise<CommitData[]> {
  try {
    // 这里的命令解释：
    // -C "路径" : 告诉 git 去哪个文件夹下执行
    // log : 查看日志
    // -n 20 : 最近 20 条
    // --pretty=format : 格式化输出 (哈希|作者|时间|信息)
    // --date=short : 日期格式 YYYY-MM-DD
    let command = `git -C "${folderPath}" log -n ${limit} --pretty=format:"%h|%an|%ad|%s" --date=short`;

    if (startDate) {
      command += ` --since="${startDate}"`;
    }
    if (endDate) {
      // git log --until includes the date, but checks against commit time.
      // If we want to include the end date fully, we might want to ensure it covers the whole day.
      // But YYYY-MM-DD in git log usually treats it as 00:00:00 of that day?
      // Actually git log --until="2023-01-01" means until 2023-01-01 00:00:00.
      // So if we want to include 2023-01-01, we should probably use "2023-01-01 23:59:59" or "2023-01-02".
      // Let's append 23:59:59 to be safe and inclusive for the end date.
      command += ` --until="${endDate} 23:59:59"`;
    }

    console.log("正在执行本地命令:", command);

    const { stdout } = await execAsync(command);

    // 解析输出的字符串
    const lines = stdout.split("\n").filter((line) => line.trim() !== "");

    const commits = lines.map((line) => {
      const [hash, author, date, message] = line.split("|");
      return {
        hash,
        author,
        date,
        message,
      };
    });

    return commits;
  } catch (error) {
    console.error("读取本地 Git 失败:", error);
    // 判断一下是不是路径不对
    throw new Error(
      `无法读取该路径下的 Git 记录。请确认：\n1. 路径是否正确？\n2. 该文件夹里有 .git 文件夹吗？\n错误信息: ${error}`
    );
  }
}

export async function getGitCurrentUser(folderPath: string): Promise<string> {
  try {
    // 执行 git config user.name
    const { stdout } = await execAsync(
      `git -C "${folderPath}" config user.name`
    );
    return stdout.trim();
  } catch (error) {
    console.warn("无法读取 git user.name，将返回空字符串:", error);
    return ""; // 读不到就返回空，让前端自己填
  }
}

interface GitHubCommit {
    sha: string;
    commit: {
        message: string;
        author: {
            name: string;
            date: string;
        }
    }
}

export async function fetchCommits(
  repoUrl: string,
  limit: number = 25,
  startDate?: string,
  endDate?: string
): Promise<CommitData[]> {
  //   await getGroqModels();
  // 1. 简单的输入清洗，把 "https://github.com/facebook/react" 变成 "facebook/react"
  const cleanRepo = repoUrl.replace("https://github.com/", "").trim();

  if (!cleanRepo.includes("/")) {
    throw new Error('仓库格式错误，请输入 "owner/repo" 例如 "facebook/react"');
  }

  const params = new URLSearchParams();
  params.append("per_page", limit.toString());
  // Ensure we use local time start/end by appending time string
  if (startDate) params.append("since", new Date(`${startDate}T00:00:00`).toISOString());
  if (endDate) params.append("until", new Date(`${endDate}T23:59:59.999`).toISOString());

  const url = `https://api.github.com/repos/${cleanRepo}/commits?${params.toString()}`;
  console.log("api is:----------->", url);

  // 2. 调用 GitHub API
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, // 从 .env.local 读取
      Accept: "application/vnd.github.v3+json",
    },
    next: { revalidate: 60 }, // 缓存 60 秒，避免频繁请求
  });

  if (!response.ok) {
    throw new Error(`GitHub API 请求失败: ${response.statusText}`);
  }

  const data = await response.json();

  // 3. 这里的 data 是 GitHub 返回的原始巨大对象，我们只取我们需要的部分
  return (data as GitHubCommit[]).map((item) => ({
    hash: item.sha.substring(0, 7),
    message: item.commit.message,
    author: item.commit.author.name,
    date: new Date(item.commit.author.date).toLocaleDateString("zh-CN"),
  }));
}

// 👇 2. 新增：生成日报的函数
export async function generateWeeklyReport(
  commits: CommitData[],
  modelId: string
) {
  // 定义 Prompt (公用的)
  const commitsString = commits
    .map((c) => `- ${c.date}: ${c.message} (by ${c.author})`)
    .join("\n");
  const systemPrompt = "你是一个高效的日报生成助手。";
  const userPrompt = `
    你是一个资深的技术项目经理。请根据以下 GitHub 提交记录，写一份专业的日报/周报。
    提交记录：
    ${commitsString}
    
    要求：
    1. 使用中文。
    2. 语言精炼，言简意赅。
    3. 语气专业、简洁。
    4. 分几点列出具体内容。
    5. 简洁的直接列出工作内容，不需要使用 Markdown，不要写多余的内容
    6. 只用写具体工作内容，不用写目标或者目的
    例如： 
    1.新增/修改上游企业时将地址、省、市、区、县修改为必填项。在供应商为自然人时，新增身份证号字段，且为必填项
    2.修复原车牌号和入场车牌号字段显示问题
    3.参考孝感易达云平台编写新的“采购、销售云平台台账”
  `;

  try {
    let content = "";

    // 👇 3. 判断是哪个厂商的模型
    // 如果模型 ID 是以 "qwen" 开头，就走阿里云
    if (modelId.startsWith("qwen")) {
      console.log(`🚀 正在调用阿里云 (Model: ${modelId})...`);

      const openai = new OpenAI({
        apiKey: process.env.ALIYUN_API_KEY,
        baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1", // 阿里云的 OpenAI 兼容地址
        // ⚠️ 阿里云在国内，通常不需要代理。如果你开了全局 VPN 导致连不上，可以在这里传 proxy
      });

      const completion = await openai.chat.completions.create({
        model: modelId,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
      });

      content = completion.choices[0]?.message?.content || "";
    } else {
      // 👇 否则走 Groq (默认)
      console.log(`🚀 正在调用 Groq (Model: ${modelId})...`);

      const proxyUrl = "http://127.0.0.1:7890"; // 你的代理
      const groq = new Groq({
        apiKey: process.env.GROQ_API_KEY,
        httpAgent: new HttpsProxyAgent(proxyUrl), // Groq 必须走代理
      });

      const completion = await groq.chat.completions.create({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        model: modelId,
        temperature: 0.5,
      });

      content = completion.choices[0]?.message?.content || "";
    }

    if (!content) throw new Error("AI 返回内容为空");
    return content;
  } catch (error) {
    console.error("AI API Error:", error);
    // 错误处理优化：如果是 401 说明 Key 错了
    throw new Error(
      `生成失败: ${error instanceof Error ? error.message : "未知错误"}`
    );
  }
}
export async function getGroqModels() {
  const proxyUrl = "http://127.0.0.1:7890"; // 别忘了你的代理！

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
