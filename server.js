require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// 读取配置文件
const configFile = require('./config.json');

// 处理配置中的环境变量
function processConfig(config) {
    const processedConfig = JSON.parse(JSON.stringify(config)); // 创建深拷贝
    
    // 替换服务器 baseUrl
    if (processedConfig.server && processedConfig.server.baseUrl) {
        if (processedConfig.server.baseUrl === '${SERVER_BASE_URL}') {
            processedConfig.server.baseUrl = process.env.SERVER_BASE_URL || 'http://localhost:3001';
        }
    }
    
    // 替换 API baseUrl
    if (processedConfig.api && processedConfig.api.baseUrl) {
        if (processedConfig.api.baseUrl === '${API_BASE_URL}') {
            processedConfig.api.baseUrl = process.env.API_BASE_URL || 'http://localhost:8080';
        }
    }
    
    return processedConfig;
}

// 处理配置
const config = processConfig(configFile);

const app = express();
const port = config.server.port || 3001;
const JWT_SECRET = config.server.jwtSecret;

// 创建存储目录
const CHATS_DIR = path.join(__dirname, 'chats');
const USERS_DIR = path.join(__dirname, 'users');

// 确保必要的目录存在
async function ensureDirectories() {
    try {
        await fs.access(CHATS_DIR);
    } catch {
        await fs.mkdir(CHATS_DIR);
    }
    try {
        await fs.access(USERS_DIR);
    } catch {
        await fs.mkdir(USERS_DIR);
    }
}

// 认证中间件
const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: '未提供认证令牌' });
    }

    try {
        const user = jwt.verify(token, JWT_SECRET);
        req.user = user;
        next();
    } catch (error) {
        return res.status(403).json({ error: '无效的认证令牌' });
    }
};

// 启用 CORS
app.use(cors());

// 解析 JSON 请求体
app.use(express.json());

// 提供静态文件
app.use(express.static('.'));

// 用户注册
app.post(config.server.routes.register, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码都是必需的' });
        }

        const userPath = path.join(USERS_DIR, `${username}.json`);
        
        try {
            await fs.access(userPath);
            return res.status(400).json({ error: '用户名已存在' });
        } catch {
            // 用户不存在，可以继续注册
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = {
            username,
            password: hashedPassword,
            createdAt: new Date().toISOString()
        };

        await fs.writeFile(userPath, JSON.stringify(user), 'utf8');
        
        const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: config.server.jwtExpiresIn });
        res.json({ token });
    } catch (error) {
        console.error('注册失败:', error);
        res.status(500).json({ error: '注册失败' });
    }
});

// 用户登录
app.post(config.server.routes.login, async (req, res) => {
    try {
        const { username, password } = req.body;
        
        if (!username || !password) {
            return res.status(400).json({ error: '用户名和密码都是必需的' });
        }

        const userPath = path.join(USERS_DIR, `${username}.json`);
        
        try {
            const userData = await fs.readFile(userPath, 'utf8');
            const user = JSON.parse(userData);

            const validPassword = await bcrypt.compare(password, user.password);
            if (!validPassword) {
                return res.status(400).json({ error: '密码错误' });
            }

            const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: config.server.jwtExpiresIn });
            res.json({ token });
        } catch {
            res.status(400).json({ error: '用户不存在' });
        }
    } catch (error) {
        console.error('登录失败:', error);
        res.status(500).json({ error: '登录失败' });
    }
});

// 保存聊天记录（需要认证）
app.post(config.server.routes.saveChat, authenticateToken, async (req, res) => {
    try {
        const chat = req.body;
        chat.username = req.user.username; // 添加用户标识
        const filePath = path.join(CHATS_DIR, `${chat.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(chat, null, 2), 'utf8');
        res.json({ success: true });
    } catch (error) {
        console.error('保存聊天记录失败:', error);
        res.status(500).json({ error: '保存聊天记录失败' });
    }
});

// 加载所有聊天记录（需要认证，只返回用户自己的记录）
app.get(config.server.routes.loadChats, authenticateToken, async (req, res) => {
    try {
        const files = await fs.readdir(CHATS_DIR);
        const chats = [];
        
        for (const file of files) {
            if (file.endsWith('.json')) {
                const filePath = path.join(CHATS_DIR, file);
                const content = await fs.readFile(filePath, 'utf8');
                const chat = JSON.parse(content);
                // 只返回属于当前用户的聊天记录
                if (chat.username === req.user.username) {
                    chats.push(chat);
                }
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

// 删除聊天记录（需要认证，只能删除自己的记录）
app.delete(`${config.server.routes.deleteChat}/:id`, authenticateToken, async (req, res) => {
    try {
        const filePath = path.join(CHATS_DIR, `${req.params.id}.json`);
        
        // 验证聊天记录的所有权
        try {
            const chatData = await fs.readFile(filePath, 'utf8');
            const chat = JSON.parse(chatData);
            
            if (chat.username !== req.user.username) {
                return res.status(403).json({ error: '无权删除此聊天记录' });
            }
            
            await fs.unlink(filePath);
            res.json({ success: true });
        } catch (error) {
            res.status(404).json({ error: '聊天记录不存在' });
        }
    } catch (error) {
        console.error('删除聊天记录失败:', error);
        res.status(500).json({ error: '删除聊天记录失败' });
    }
});

// 启动服务器
app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
    // 确保必要的目录存在
    ensureDirectories().catch(console.error);
}); 