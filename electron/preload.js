// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  // 前端调用这个，去读取 Git 记录
  getGitLog: (path) => ipcRenderer.invoke('get-git-log', path),
  
  // 前端调用这个，去生成 AI 报告
  generateReport: (data) => ipcRenderer.invoke('generate-report', data),
});