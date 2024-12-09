# AIChat

一个基于多模型的聊天界面，支持多种AI模型的对话。
需要搭配反向代理：
https://github.com/YIWANG-sketch/YOUChat_Proxy
或者
https://gitgud.io/ahsk/clewd


## 安装

1. 克隆仓库：
```bash
git clone https://github.com/Kinnnnota/AIChat.git
```

2. 安装依赖：
```bash
npm install
```

3. 启动服务器：
```bash
npm start
```

4. 打开浏览器访问：`http://localhost:3001`


## 使用说明

1. 选择想要使用的AI模型
2. 在输入框中输入消息
3. 点击发送或按Enter键发送消息
4. 可以随时点击停止按钮终止生成
5. 对于不满意的回答可以点击重新生成按钮

## 注意事项

- 需要确保反向代理服务器运行在 `http://127.0.0.1:8080`
- 聊天记录保存在 `chats` 目录下
- 建议使用chrome浏览器以获得最佳体验
