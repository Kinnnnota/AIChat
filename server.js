const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const port = 3001;

// 创建存储聊天记录的目录
const CHATS_DIR = path.join(__dirname, 'chats');

// 确保聊天记录目录存在
async function ensureChatsDir() {
    try {
        await fs.access(CHATS_DIR);
    } catch {
        await fs.mkdir(CHATS_DIR);
    }
}

// 启用 CORS
app.use(cors());

// 解析 JSON 请求体
app.use(express.json());

// 提供静态文件
app.use(express.static('.'));

// 保存聊天记录
app.post('/save-chat', async (req, res) => {
    try {
        await ensureChatsDir();
        const chat = req.body;
        const filePath = path.join(CHATS_DIR, `${chat.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(chat, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error('保存聊天记录失败:', error);
        res.status(500).json({ error: '保存聊天记录失败' });
    }
});

// 加载所有聊天记录
app.get('/load-chats', async (req, res) => {
    try {
        await ensureChatsDir();
        const files = await fs.readdir(CHATS_DIR);
        const chats = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(CHATS_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                chats.push(JSON.parse(content));
            }
        }
        
        // 按创建时间降序排序
        chats.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json({ chats });
    } catch (error) {
        console.error('加载聊天记录失败:', error);
        res.status(500).json({ error: '加载聊天记录失败' });
    }
});

// 删除聊天记录
app.delete('/delete-chat/:id', async (req, res) => {
    try {
        const filePath = path.join(CHATS_DIR, `${req.params.id}.json`);
        await fs.unlink(filePath);
        res.json({ success: true });
    } catch (error) {
        console.error('删除聊天记录失败:', error);
        res.status(500).json({ error: '删除聊天记录失败' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
    // 确保聊天记录目录存在
    ensureChatsDir().catch(console.error);
}); 