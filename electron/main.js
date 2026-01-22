const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const OpenAI = require('openai'); 
const Groq = require('groq-sdk');
const url = require('url');

const execAsync = promisify(exec);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // 生产环境加载逻辑
  const startUrl = process.env.ELECTRON_START_URL || url.format({
    pathname: path.join(__dirname, '../out/index.html'),
    protocol: 'file:',
    slashes: true,
  });

  mainWindow.loadURL(startUrl);
  // mainWindow.webContents.openDevTools(); // 调试完可以注释掉
}

app.on('ready', () => {
  createWindow();

  // 👇 1. 监听：获取 Git 记录 (只保留这一个正确的版本！)
  ipcMain.handle('get-git-log', async (event, params) => {
    try {
      // 解构参数
      const { path: folderPath, limit, after, before } = params;

      console.log('正在读取目录:', folderPath);
      
      // 构造 Git 命令
      let command = `git -C "${folderPath}" log --pretty=format:"%h|%an|%ad|%s" --date=short`;
      
      // 动态拼接参数
      if (limit) command += ` -n ${limit}`;
      if (after) command += ` --since="${after}"`;
      if (before) command += ` --until="${before} 23:59:59"`;

      console.log('执行命令:', command);

      const { stdout } = await execAsync(command);
      
      const commits = stdout.split('\n')
        .filter(line => line.trim() !== '')
        .map(line => {
          const [hash, author, date, message] = line.split('|');
          return { hash, author, date, message };
        });
        
      // 获取用户名
      let currentUser = '';
      try {
        const { stdout: userOut } = await execAsync(`git -C "${folderPath}" config user.name`);
        currentUser = userOut.trim();
      } catch (e) {}

      return { commits, currentUser };
    } catch (error) {
      console.error('Git Error:', error);
      throw new Error(`Git 读取失败: ${error.message}`);
    }
  });

  // 👇 2. 监听：生成 AI 报告 (之前你的代码里漏了这个，必须补上！)
  ipcMain.handle('generate-report', async (event, { commits, modelId, apiKeys }) => {
    const commitsString = commits.map(c => `- ${c.date}: ${c.message} (by ${c.author})`).join('\n');
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
    3.参考孝感易达云平台编写新的“采购、销售云平台台账”`;

    try {
      let content = "";
      
      if (modelId.startsWith('qwen')) {
        // 阿里云
        const openai = new OpenAI({ 
            apiKey: apiKeys.aliyun,
            baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1" 
        });
        const completion = await openai.chat.completions.create({
          model: modelId,
          messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
        });
        content = completion.choices[0]?.message?.content;
      } else {
        // Groq
        const groq = new Groq({ apiKey: apiKeys.groq });
        const completion = await groq.chat.completions.create({
            messages: [{ role: "system", content: systemPrompt }, { role: "user", content: userPrompt }],
            model: modelId,
        });
        content = completion.choices[0]?.message?.content;
      }
      return content;
    } catch (error) {
      throw new Error(`AI 生成失败: ${error.message}`);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});