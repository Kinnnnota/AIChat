# AIChat

一个基于多模型的聊天界面，支持多种AI模型的对话。

## 功能特点

- 支持多种AI模型（GPT-4, Claude等）
- 实时流式输出
- 聊天记录持久化存储
- 支持重新生成回答
- 支持停止生成
- 聊天记录管理
- 消息预处理功能

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

## 配置

可以通过修改 `config.json` 来配置消息预处理：

```json
{
    "messagePreprocessing": {
        "enabled": true,
        "prefix": "自定义的预处理消息",
        "systemMessage": "系统消息设置"
    }
}
```

## 使用说明

1. 选择想要使用的AI模型
2. 在输入框中输入消息
3. 点击发送或按Enter键发送消息
4. 可以随时点击停止按钮终止生成
5. 对于不满意的回答可以点击重新生成按钮

## 注意事项

- 需要确保反向代理服务器运行在 `http://127.0.0.1:8080`
- 聊天记录保存�� `chats` 目录下
- 建议使用现代浏览器以获得最佳体验

## 许可证

MIT License 