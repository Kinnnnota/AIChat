// 存储当前选择的模型
let currentModel = '';
// 存储所有聊天组
let chatGroups = [];
// 当前聊天组ID
let currentChatId = null;
// 当前的 AbortController
let currentController = null;
// 配置信息
let config = null;
// 认证令牌
let authToken = localStorage.getItem('authToken');

// 在文件开头添加 marked 库的引用
if (!document.querySelector('script[src*="marked"]')) {
    const markedScript = document.createElement('script');
    markedScript.src = 'https://cdn.jsdelivr.net/npm/marked/marked.min.js';
    document.head.appendChild(markedScript);
}

// 加载配置文件
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            console.warn('加载配置文件失败，使用默认配置');
            useDefaultConfig();
            return;
        }
        config = await response.json();
        
        // 处理环境变量
        config = processConfig(config);
    } catch (error) {
        console.warn('加载配置文件失败:', error);
        useDefaultConfig();
    }
}

// 处理配置中的环境变量
function processConfig(config) {
    // 创建深拷贝
    const processedConfig = JSON.parse(JSON.stringify(config));
    
    // 处理服务器 baseUrl
    if (processedConfig.server && processedConfig.server.baseUrl) {
        if (processedConfig.server.baseUrl === '${SERVER_BASE_URL}') {
            processedConfig.server.baseUrl = 'http://localhost:3001'; // 客户端默认值
        }
    }
    
    // 处理 API baseUrl
    if (processedConfig.api && processedConfig.api.baseUrl) {
        if (processedConfig.api.baseUrl === '${API_BASE_URL}') {
            processedConfig.api.baseUrl = 'http://localhost:8080'; // 客户端默认值
        }
    }
    
    return processedConfig;
}

// 使用默认配置
function useDefaultConfig() {
    config = {
        server: {
            port: 3001,
            jwtSecret: "your-secret-key",
            jwtExpiresIn: "24h",
            baseUrl: "http://localhost:3001",
            routes: {
                login: "/login",
                register: "/register",
                saveChat: "/save-chat",
                loadChats: "/load-chats",
                deleteChat: "/delete-chat"
            }
        },
        api: {
            baseUrl: "http://127.0.0.1:8080",
            chatEndpoint: "/v1/chat/completions"
        },
        chat: {
            maxTokens: 2000,
            temperature: 0.7,
            presencePenalty: 0,
            frequencyPenalty: 0
        },
        messagePreprocessing: {
            enabled: true,
            prefix: "",
            systemMessage: "You are a helpful AI assistant that provides clear and professional answers."
        }
    };
}

// 检查是否已登录
function isAuthenticated() {
    return !!authToken;
}

// 显示登录/注册表单
function showAuthForm() {
    // 隐藏主界面元素
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    if (sidebar) sidebar.style.display = 'none';
    if (mainContent) mainContent.style.display = 'none';

    // 创建认证容器
    const authContainer = document.createElement('div');
    authContainer.className = 'auth-container';
    document.body.appendChild(authContainer);

    authContainer.innerHTML = `
        <div class="auth-box">
            <h2 class="auth-title">欢迎使用AI聊天助手</h2>
            <p class="auth-subtitle">请登录或注册以开始使用</p>
            
            <div class="auth-tabs">
                <button class="auth-tab active" data-form="login" onclick="switchAuthTab(this, 'login')">
                    <i class="fas fa-sign-in-alt"></i>
                    登录账号
                </button>
                <button class="auth-tab" data-form="register" onclick="switchAuthTab(this, 'register')">
                    <i class="fas fa-user-plus"></i>
                    注册新账号
                </button>
            </div>

            <div id="loginForm" class="auth-panel active">
                <div class="form-group">
                    <label>用户名</label>
                    <input type="text" id="loginUsername" placeholder="请输入用户名" />
                </div>
                <div class="form-group">
                    <label>密码</label>
                    <input type="password" id="loginPassword" placeholder="请输入密码" />
                </div>
                <button class="auth-button" onclick="login()">
                    <i class="fas fa-sign-in-alt"></i>
                    登录
                </button>
                <p class="form-tip">还没有账号？ <a href="#" onclick="switchAuthTab(document.querySelector('[data-form=register]'), 'register'); return false;">立即注册</a></p>
            </div>

            <div id="registerForm" class="auth-panel">
                <div class="form-group">
                    <label>用户名</label>
                    <input type="text" id="registerUsername" placeholder="请设置用户名" />
                </div>
                <div class="form-group">
                    <label>密码</label>
                    <input type="password" id="registerPassword" placeholder="请设置密码" oninput="validatePassword()" />
                    <small class="password-hint">密码长度至少为8位</small>
                </div>
                <div class="form-group">
                    <label>确认密码</label>
                    <input type="password" id="registerPasswordConfirm" placeholder="请再次输入密码" oninput="validatePassword()" />
                    <small class="password-match-hint"></small>
                </div>
                <button class="auth-button" id="registerButton" onclick="register()" disabled>
                    <i class="fas fa-user-plus"></i>
                    注册
                </button>
                <p class="form-tip">已有账号？ <a href="#" onclick="switchAuthTab(document.querySelector('[data-form=login]'), 'login'); return false;">立即登录</a></p>
            </div>
        </div>
    `;

    // 添加新的样式
    const style = document.createElement('style');
    style.textContent = `
        .auth-container {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #f5f5f5;
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 1000;
        }
        
        html, body {
            margin: 0;
            padding: 0;
            height: 100%;
        }

        #chatContainer {
            height: 100vh;
            margin: 0;
            padding: 0;
        }

        .auth-box {
            background: white;
            padding: 30px;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            width: 100%;
            max-width: 400px;
            margin: auto;
        }

        .auth-title {
            text-align: center;
            color: #333;
            margin: 0 0 10px 0;
            font-size: 24px;
        }

        .auth-subtitle {
            text-align: center;
            color: #666;
            margin: 0 0 30px 0;
            font-size: 14px;
        }

        .auth-tabs {
            display: flex;
            gap: 10px;
            margin-bottom: 20px;
        }

        .auth-tab {
            flex: 1;
            padding: 12px;
            border: none;
            background: #f5f5f5;
            color: #666;
            border-radius: 6px;
            cursor: pointer;
            transition: all 0.3s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
        }

        .auth-tab i {
            font-size: 16px;
        }

        .auth-tab.active {
            background: #1a73e8;
            color: white;
        }

        .auth-panel {
            display: none;
            animation: fadeIn 0.3s ease;
        }

        .auth-panel.active {
            display: block;
        }

        .form-group {
            margin-bottom: 20px;
        }

        .form-group label {
            display: block;
            margin-bottom: 8px;
            color: #333;
            font-size: 14px;
        }

        .auth-panel input {
            width: 100%;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            box-sizing: border-box;
            transition: border-color 0.3s ease;
            font-size: 14px;
        }

        .auth-panel input:focus {
            border-color: #1a73e8;
            outline: none;
        }

        .auth-button {
            width: 100%;
            padding: 12px;
            background: #1a73e8;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 16px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: background 0.3s ease;
        }

        .auth-button:hover {
            background: #1557b0;
        }

        .form-tip {
            text-align: center;
            margin-top: 20px;
            color: #666;
            font-size: 14px;
        }

        .form-tip a {
            color: #1a73e8;
            text-decoration: none;
        }

        .form-tip a:hover {
            text-decoration: underline;
        }

        @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .form-group small {
            display: block;
            margin-top: 5px;
            font-size: 12px;
            color: #666;
        }

        .form-group small.error {
            color: #dc3545;
        }

        .form-group small.success {
            color: #28a745;
        }

        .auth-button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }

        .auth-button:disabled:hover {
            background: #ccc;
        }

        .password-strength {
            margin-top: 5px;
            height: 3px;
            background: #eee;
            border-radius: 2px;
        }

        .password-strength-bar {
            height: 100%;
            width: 0;
            border-radius: 2px;
            transition: all 0.3s ease;
        }

        .strength-weak { background: #dc3545; width: 33.33%; }
        .strength-medium { background: #ffc107; width: 66.66%; }
        .strength-strong { background: #28a745; width: 100%; }
    `;
    document.head.appendChild(style);

    // 添加输入事件监听
    ['loginUsername', 'loginPassword', 'registerUsername', 'registerPassword'].forEach(id => {
        const input = document.getElementById(id);
        if (input) {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    const isLogin = id.startsWith('login');
                    isLogin ? login() : register();
                }
            });
        }
    });
}

// 切换登录/注册表单
function switchAuthTab(tab, form) {
    // 更新标签状态
    document.querySelectorAll('.auth-tab').forEach(t => {
        t.classList.remove('active');
        // 更新data-form属性以保持状态同步
        if (t.getAttribute('data-form') === form) {
            t.classList.add('active');
        }
    });

    // 更新表单显示
    document.querySelectorAll('.auth-panel').forEach(p => p.classList.remove('active'));
    document.getElementById(`${form}Form`).classList.add('active');

    // 聚焦第一个输入框
    const firstInput = document.getElementById(`${form}Username`);
    if (firstInput) {
        firstInput.focus();
    }
}

// 用户登录
async function login() {
    const username = document.getElementById('loginUsername').value.trim();
    const password = document.getElementById('loginPassword').value;

    if (!username || !password) {
        alert('请输入用户名和密码');
        return;
    }

    const button = document.querySelector('#loginForm .auth-button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 登录中...';
    button.disabled = true;

    try {
        const response = await fetch(`${config.server.baseUrl}${config.server.routes.login}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            await handleLoginSuccess(data.token);
        } else {
            alert(data.error || '登录失败');
        }
    } catch (error) {
        console.error('登录失败:', error);
        alert('登录失败，请检查服务器连接');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// 验证密码
function validatePassword() {
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;
    const registerButton = document.getElementById('registerButton');
    const passwordHint = document.querySelector('.password-hint');
    const passwordMatchHint = document.querySelector('.password-match-hint');
    
    let isValid = true;

    // 验证密码长度
    if (password.length < 8) {
        passwordHint.textContent = '密码长度至少为8位';
        passwordHint.className = 'password-hint error';
        isValid = false;
    } else {
        passwordHint.textContent = '密码长度符合要求';
        passwordHint.className = 'password-hint success';
    }

    // 验证密码匹配
    if (confirmPassword) {
        if (password !== confirmPassword) {
            passwordMatchHint.textContent = '两次输入的密码不一致';
            passwordMatchHint.className = 'password-match-hint error';
            isValid = false;
        } else {
            passwordMatchHint.textContent = '密码匹配';
            passwordMatchHint.className = 'password-match-hint success';
        }
    } else {
        passwordMatchHint.textContent = '';
    }

    // 启用/禁用注册按钮
    registerButton.disabled = !isValid || !password || !confirmPassword;
}

// 用户注册
async function register() {
    const username = document.getElementById('registerUsername').value.trim();
    const password = document.getElementById('registerPassword').value;
    const confirmPassword = document.getElementById('registerPasswordConfirm').value;

    if (!username || !password || !confirmPassword) {
        alert('请填写所有必填项');
        return;
    }

    if (password.length < 8) {
        alert('密码长度至少需要8位');
        return;
    }

    if (password !== confirmPassword) {
        alert('两次输入的密码不一致');
        return;
    }

    const button = document.querySelector('#registerForm .auth-button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 注册中...';
    button.disabled = true;

    try {
        const response = await fetch(`${config.server.baseUrl}${config.server.routes.register}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ username, password })
        });

        const data = await response.json();
        if (response.ok) {
            await handleLoginSuccess(data.token);
        } else {
            alert(data.error || '注册失败');
        }
    } catch (error) {
        console.error('注册失败:', error);
        alert('注册失败，请检查服务器连接');
    } finally {
        button.innerHTML = originalText;
        button.disabled = false;
    }
}

// 用户登出
function logout() {
    // 清理认证状态
    authToken = null;
    localStorage.removeItem('authToken');
    
    // 清理聊天相关数据
    chatGroups = [];
    currentChatId = null;
    currentModel = '';
    
    // 清理UI
    const chatContainer = document.getElementById('chatContainer');
    const historyList = document.getElementById('historyList');
    if (chatContainer) chatContainer.innerHTML = '';
    if (historyList) historyList.innerHTML = '';
    
    // 重置模型选择
    const modelSelect = document.getElementById('modelSelect');
    if (modelSelect) modelSelect.innerHTML = '';
    
    // 显示登录表单
    showAuthForm();
}

// 初始化页面
async function init() {
    // 确保首先加载配置
    await loadConfig();
    
    if (!isAuthenticated()) {
        // 清理所有现有数据
        chatGroups = [];
        currentChatId = null;
        currentModel = '';
        
        // 显示登录表单
        showAuthForm();
        return;
    }

    try {
        // 显示主界面元素
        const sidebar = document.querySelector('.sidebar');
        const mainContent = document.querySelector('.main-content');
        if (sidebar) sidebar.style.display = 'flex';
        if (mainContent) mainContent.style.display = 'flex';
        
        // 加载其他必要的数据
        await loadModels();
        await loadChatGroups();
        
        // 设置事件监听器
        setupEventListeners();
        
        // 处理初始聊天显示
        if (chatGroups.length === 0) {
            createNewChat();
        } else {
            switchChat(chatGroups[0].id);
        }
    } catch (error) {
        console.warn('初始化失败:', error);
        showToast('初始化遇到问题，部分功能可能不可用。');
    }
}

// 登录成功后的处理
async function handleLoginSuccess(token) {
    authToken = token;
    localStorage.setItem('authToken', token);
    
    // 移除认证容器
    const authContainer = document.querySelector('.auth-container');
    if (authContainer) {
        authContainer.remove();
    }
    
    // 显示主界面元素
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    if (sidebar) sidebar.style.display = 'flex';
    if (mainContent) mainContent.style.display = 'flex';
    
    // 重新初始化页面
    await init();
}

// 保存聊天记录文件
async function saveChatGroup(chatGroup) {
    try {
        const response = await fetch(`${config.server.baseUrl}${config.server.routes.saveChat}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`
            },
            body: JSON.stringify(chatGroup)
        });
        
        if (!response.ok) {
            throw new Error('保存聊天记录失败');
        }
    } catch (error) {
        console.warn('保存聊天记录失败:', error);
        // 如果是认证错误，登出用户
        if (error.message.includes('401') || error.message.includes('403')) {
            logout();
        }
        // 其他错误只显示提示，不中断操作
        showToast('保存聊天记录失败');
    }
}

// 加载所有聊天记录
async function loadChatGroups() {
    try {
        const response = await fetch(`${config.server.baseUrl}${config.server.routes.loadChats}`, {
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        if (!response.ok) {
            throw new Error('加载聊天记录失败');
        }
        const data = await response.json();
        chatGroups = data.chats || [];
        updateChatList();
    } catch (error) {
        console.warn('加载聊天记录失败:', error);
        if (error.message.includes('401') || error.message.includes('403')) {
            logout();
            return;
        }
        // 其他错误使用空数组继续
        chatGroups = [];
        showToast('加载聊天记录失败。');
        updateChatList();
    }
}

// 删除聊天记录
async function deleteChatGroup(chatId) {
    try {
        const response = await fetch(`${config.server.baseUrl}${config.server.routes.deleteChat}/${chatId}`, {
            method: 'DELETE',
            headers: {
                'Authorization': `Bearer ${authToken}`
            }
        });
        
        if (!response.ok) {
            throw new Error('删除聊天记录失败');
        }
        
        // 从内存中移除
        chatGroups = chatGroups.filter(chat => chat.id !== chatId);

        // 修改这部分逻辑
        if (chatId === currentChatId) {
            if (chatGroups.length > 0) {
                // 如果还有其他聊天，切换到第一个
                switchChat(chatGroups[0].id);
            } else {
                // 如果没有任何聊天了，直接创建新聊天
                createNewChat();
            }
        } else {
            updateChatList();
        }
    } catch (error) {
        console.warn('删除聊天记录失败:', error);
        if (error.message.includes('401') || error.message.includes('403')) {
            logout();
            return;
        }
        showToast('删除聊天记录可能未完全成功，请稍后重试。');
        chatGroups = chatGroups.filter(chat => chat.id !== chatId);
        
        // 这里也需要添加同样的逻辑
        if (chatId === currentChatId) {
            if (chatGroups.length > 0) {
                switchChat(chatGroups[0].id);
            } else {
                createNewChat();
            }
        } else {
            updateChatList();
        }
    }
}

// 修改创建新聊天的函数
function createNewChat() {
    // 清理所有临时聊天
    chatGroups = chatGroups.filter(chat => !chat.isTemp || chat.messages.length > 0);
    
    // 检查是否已存在临时聊天
    const existingTempChat = chatGroups.find(chat => chat.isTemp && chat.messages.length === 0);
    if (existingTempChat) {
        // 如果已存在临时聊天，直接切换到该聊天
        switchChat(existingTempChat.id);
        return;
    }
    
    const chatId = Date.now().toString();
    const newChat = {
        id: chatId,
        title: '新对话',
        messages: [],
        model: currentModel,
        createdAt: new Date().toISOString(),
        isTemp: true  // 标记为临时聊天，直到有实际消息
    };
    
    chatGroups.unshift(newChat);
    currentChatId = chatId;
    
    // 更新UI
    updateChatList();
    clearChatContainer();
}

// 获取当前聊天组的所有消息
function getCurrentChatMessages() {
    const currentChat = chatGroups.find(c => c.id === currentChatId);
    if (!currentChat) return [];
    
    // 始终包含系统消息
    const systemMessage = {
        role: "system",
        content: config.messagePreprocessing.systemMessage
    };
    
    // 确保每条消息有正确的格式，并且保持完整的对话历史
    const messages = currentChat.messages.map(msg => ({
        role: msg.role,
        content: msg.content || ''
    }));

    return [systemMessage, ...messages];
}

// 预处理消息
function preprocessMessage(message) {
    if (config.messagePreprocessing.enabled) {
        return `${config.messagePreprocessing.prefix}\n\n${message}`;
    }
    return message;
}

// 从预处理消息中提取原始消息
function extractOriginalMessage(processedMessage) {
    if (config.messagePreprocessing.enabled && processedMessage.startsWith(config.messagePreprocessing.prefix)) {
        return processedMessage.slice(config.messagePreprocessing.prefix.length).trim();
    }
    return processedMessage;
}

// 发送消息
async function sendMessage() {
    const messageInput = document.getElementById('messageInput');
    const message = messageInput.value.trim();
    
    if (!message) return;
    
    // 禁用输入和发送按钮，显示停止按钮
    const sendButton = document.getElementById('sendButton');
    const stopButton = document.getElementById('stopButton');
    messageInput.disabled = true;
    sendButton.disabled = true;
    stopButton.style.display = 'inline-block';

    try {
        // 获取当前对话的所有消息
        const currentChat = chatGroups.find(c => c.id === currentChatId);
        if (!currentChat) {
            throw new Error('找不到当前聊天组');
        }

        // 预处理消息
        const processedMessage = preprocessMessage(message);

        // 添加原始消息到UI（不显示预处理部分）
        addMessageToChat('user', message, false);
        
        // 添加预处理后的消息到数据结构
        currentChat.messages.push({
            role: 'user',
            content: processedMessage
        });

        // 如果是临时聊天，移除临时标记
        if (currentChat.isTemp) {
            delete currentChat.isTemp;
        }

        // 清空输入框
        messageInput.value = '';

        // 创建助手消息的占位div
        const assistantContentDiv = addMessageToChat('assistant', '', false);

        try {
            // 创建新的 AbortController
            currentController = new AbortController();

            // 获取完整的消息历史
            const messages = getCurrentChatMessages();
            
            // 发送请求到服务器
            const response = await fetch(`${config.api.baseUrl}${config.api.chatEndpoint}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'text/event-stream',
                },
                body: JSON.stringify({
                    model: currentModel,
                    messages: messages,
                    stream: true,
                    temperature: config.chat.temperature,
                    max_tokens: config.chat.maxTokens,
                    presence_penalty: config.chat.presencePenalty,
                    frequency_penalty: config.chat.frequencyPenalty
                }),
                signal: currentController.signal
            });

            if (!response.ok) {
                throw new Error(`请求失败: ${response.status} ${response.statusText}`);
            }

            // 处理流式响应
            const fullContent = await handleStreamResponse(response, assistantContentDiv);

            // 保存助手回复到当前聊天组
            currentChat.messages.push({
                role: 'assistant',
                content: fullContent
            });

            // 更新聊天组标题（如果是第一条消息）
            if (currentChat.messages.length === 2) {
                currentChat.title = message.substring(0, 30) + (message.length > 30 ? '...' : '');
                updateChatList();
            }

            // 只有在不是临时聊天时才保存
            if (!currentChat.isTemp) {
                await saveChatGroup(currentChat);
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('生成已停止');
                assistantContentDiv.textContent = '[已停止生成]';
            } else {
                console.warn('发送消息失败:', error);
                assistantContentDiv.textContent = '[生成失败，请重试]';
                showToast('生成回复失败，请重试或检查网络连接。');
            }
        }
    } catch (error) {
        console.warn('处理消息失败:', error);
        showToast('发送消息失败，请重试。');
    } finally {
        // 重新启用输入和发送按钮，隐藏停止按钮
        messageInput.disabled = false;
        sendButton.disabled = false;
        stopButton.style.display = 'none';
        currentController = null;
        messageInput.focus();
    }
}

// 更新聊天列表UI，添加删除按钮
function updateChatList() {
    const historyList = document.getElementById('historyList');
    historyList.innerHTML = ''; // 清空现有列表
    
    chatGroups.forEach(chat => {
        const historyItem = document.createElement('div');
        historyItem.className = 'history-item' + (chat.id === currentChatId ? ' active' : '');
        
        // 创建标题删除按钮的容器
        const itemContent = document.createElement('div');
        itemContent.className = 'history-item-content';
        
        // 添加标题
        const title = document.createElement('span');
        title.textContent = chat.title;
        // 将点击事件绑定到整itemContent上
        itemContent.onclick = (e) => {
            // 如果点击的不是删除按钮，则切换聊天
            if (!e.target.classList.contains('delete-button')) {
                switchChat(chat.id);
            }
        };
        itemContent.appendChild(title);
        
        // 添加删除按钮
        const deleteButton = document.createElement('button');
        deleteButton.className = 'delete-button';
        deleteButton.textContent = '×';
        deleteButton.onclick = (e) => {
            e.stopPropagation(); // 阻止事件冒泡
            if (confirm('确定要删除这个对话吗？')) {
                deleteChatGroup(chat.id);
            }
        };
        itemContent.appendChild(deleteButton);
        
        historyItem.appendChild(itemContent);
        historyList.appendChild(historyItem);
    });
}

// 在 loadModels 函数之前添加这个新函数
function formatModelName(modelId) {
    // 移除下划线，将首字母大写
    let name = modelId
        .split('_')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    
    // 特殊处理一些常见的模型名称
    name = name
        .replace(/Gpt/g, 'GPT')
        .replace(/Claude/g, 'Claude')
        .replace(/Llama/g, 'LLaMA')
        .replace(/Qwen/g, 'Qwen');
    
    // 保持版本号的格式
    name = name.replace(/(\d+) (\d+)/g, '$1.$2');
    
    return name;
}

// 修改 loadModels 函数中创建选项的部分
async function loadModels() {
    try {
        const response = await fetch(`${config.api.baseUrl}/v1/models`);
        const data = await response.json();
        
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = ''; // 清空现有选项
        
        if (!data.data || data.data.length === 0) {
            throw new Error('没有可用的模型');
        }

        data.data.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            // 使用格式化函数处理显示名称
            option.textContent = formatModelName(model.name);
            modelSelect.appendChild(option);
        });

        // 设置默认模型
        currentModel = data.data[0].id;
        modelSelect.value = currentModel;
    } catch (error) {
        console.warn('加载模型列表失败:', error);
        // 使用默认模型配置
        const defaultModel = { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' };
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = '';
        const option = document.createElement('option');
        option.value = defaultModel.id;
        option.textContent = defaultModel.name;
        modelSelect.appendChild(option);
        currentModel = defaultModel.id;
        showToast('加载模型列表失败，使用默认模型继续');
    }
}

// 显示聊天消息
function displayChatMessages(chat) {
    clearChatContainer();
    if (chat && chat.messages) {
        chat.messages.forEach(msg => {
            // 如果是用户消息，需要提取原始内容
            const content = msg.role === 'user' ? extractOriginalMessage(msg.content) : msg.content;
            const contentDiv = addMessageToChat(msg.role, '', false);
            
            // 使用与流式响应相同的渲染逻辑
            if (window.marked) {
                if (content.includes('```')) {
                    const parts = content.split(/(```[a-z]*\n[\s\S]*?(?:```|$))/g);
                    parts.forEach(part => {
                        if (part.startsWith('```')) {
                            const match = part.match(/```([a-z]*)\n([\s\S]*?)(?:```|$)/);
                            if (match) {
                                const [, language, code] = match;
                                const preElement = document.createElement('pre');
                                const codeElement = document.createElement('code');
                                if (language) {
                                    codeElement.className = `language-${language}`;
                                }
                                codeElement.textContent = code.trim();
                                preElement.appendChild(codeElement);
                                contentDiv.appendChild(preElement);
                                
                                if (window.hljs) {
                                    window.hljs.highlightElement(codeElement);
                                }
                            }
                        } else if (part.trim()) {
                            const parsedHtml = marked.parse(part);
                            const tempDiv = document.createElement('div');
                            tempDiv.innerHTML = parsedHtml;
                            contentDiv.appendChild(tempDiv);
                        }
                    });
                } else {
                    contentDiv.innerHTML = marked.parse(content);
                }
            } else {
                contentDiv.textContent = content;
            }
        });
    }
}

// 清空聊天器
function clearChatContainer() {
    const chatContainer = document.getElementById('chatContainer');
    chatContainer.innerHTML = '';
}

// 设置事件监听器
function setupEventListeners() {
    const sendButton = document.getElementById('sendButton');
    const stopButton = document.getElementById('stopButton');
    const messageInput = document.getElementById('messageInput');
    const modelSelect = document.getElementById('modelSelect');
    const sidebar = document.querySelector('.sidebar');

    // 创建一个容器来包装历史记录列表和登出按钮
    const sidebarContent = document.createElement('div');
    sidebarContent.className = 'sidebar-content';
    
    // 添加新建聊天按钮
    const newChatButton = document.createElement('div');
    newChatButton.className = 'history-item new-chat';
    newChatButton.textContent = '+ 新建聊天';
    newChatButton.onclick = createNewChat;

    // 创建历史记录列表
    const historyList = document.createElement('div');
    historyList.id = 'historyList';
    
    // 创建登出按钮容器
    const logoutContainer = document.createElement('div');
    logoutContainer.className = 'logout-container';
    
    // 创建登出按钮
    const logoutButton = document.createElement('button');
    logoutButton.textContent = '退出登录';
    logoutButton.className = 'logout-button';
    logoutButton.onclick = logout;
    
    // 组装侧边栏结构
    logoutContainer.appendChild(logoutButton);
    sidebarContent.appendChild(newChatButton);
    sidebarContent.appendChild(historyList);
    sidebarContent.appendChild(logoutContainer);
    
    // 清空并新填充侧边栏
    sidebar.innerHTML = '';
    sidebar.appendChild(sidebarContent);

    // 添加样式
    const style = document.createElement('style');
    style.textContent = `
        .sidebar {
            display: flex;
            flex-direction: column;
            height: 100%;
        }
        
        .sidebar-content {
            display: flex;
            flex-direction: column;
            height: 100%;
            position: relative;
        }
        
        #historyList {
            flex-grow: 1;
            overflow-y: auto;
            margin-bottom: 60px; /* 为登出按钮留出空间 */
        }
        
        .logout-container {
            position: absolute;
            bottom: 0;
            left: 0;
            right: 0;
            padding: 10px;
            background: inherit;
            border-top: 1px solid #e0e0e0;
        }
        
        .logout-button {
            width: 100%;
            padding: 8px;
            background: #dc3545;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
            transition: background-color 0.3s ease;
        }
        
        .logout-button:hover {
            background: #c82333;
        }
    `;
    document.head.appendChild(style);

    // 发送按钮点击事件
    sendButton.addEventListener('click', sendMessage);

    // 停止按钮点击事件
    stopButton.addEventListener('click', stopGeneration);

    // 输入框回车事件
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // 模型选择改变
    modelSelect.addEventListener('change', (e) => {
        currentModel = e.target.value;
        // 更新当前聊天组的模型
        const currentChat = chatGroups.find(c => c.id === currentChatId);
        if (currentChat) {
            currentChat.model = currentModel;
        }
    });
}

// 停止生成
function stopGeneration() {
    if (currentController) {
        currentController.abort();
        currentController = null;
        document.getElementById('stopButton').style.display = 'none';
        document.getElementById('sendButton').disabled = false;
        document.getElementById('messageInput').disabled = false;
    }
}

// 添加消息到聊天界面
function addMessageToChat(role, content = '', shouldSave = true) {
    const chatContainer = document.getElementById('chatContainer');
    
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    avatar.textContent = role === 'user' ? 'U' : 'A';
    
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'content-wrapper';
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'content';
    contentDiv.setAttribute('translate', 'no');  // 不要翻译聊天记录

    // 处理代码块
    if (content.includes('```')) {
        // 确保highlight.js已加载
        if (!document.querySelector('link[href*="highlight.js"]')) {
            // 添加highlight.js的CSS
            const highlightCSS = document.createElement('link');
            highlightCSS.rel = 'stylesheet';
            highlightCSS.href = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/default.min.css';
            document.head.appendChild(highlightCSS);

            // 添加highlight.js的JS
            const highlightJS = document.createElement('script');
            highlightJS.src = 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js';
            document.head.appendChild(highlightJS);
        }

        // 分割内容，处理代码块
        const parts = content.split(/(```[a-z]*\n[\s\S]*?\n```)/g);
        parts.forEach(part => {
            if (part.startsWith('```')) {
                // 提取语言和代码
                const match = part.match(/```([a-z]*)\n([\s\S]*?)\n```/);
                if (match) {
                    const [, language, code] = match;
                    
                    // 创建代码块容器
                    const preElement = document.createElement('pre');
                    const codeElement = document.createElement('code');
                    if (language) {
                        codeElement.className = `language-${language}`;
                    }
                    codeElement.textContent = code.trim();
                    preElement.appendChild(codeElement);
                    contentDiv.appendChild(preElement);

                    // 尝试高亮代码
                    if (window.hljs) {
                        window.hljs.highlightElement(codeElement);
                    } else {
                        // 如果highlight.js还没加载完，等待加载
                        const checkHighlight = setInterval(() => {
                            if (window.hljs) {
                                window.hljs.highlightElement(codeElement);
                                clearInterval(checkHighlight);
                            }
                        }, 100);
                    }
                }
            } else if (part.trim()) {
                // 普通文本
                const textDiv = document.createElement('div');
                textDiv.textContent = part.trim();
                contentDiv.appendChild(textDiv);
            }
        });
    } else {
        // 普通消息
        contentDiv.textContent = content;
    }
    
    contentWrapper.appendChild(contentDiv);
    
    // 为助手消息添加重新生成按钮
    if (role === 'assistant') {
        const buttonContainer = document.createElement('div');
        buttonContainer.className = 'message-buttons';
        
        const regenerateButton = document.createElement('button');
        regenerateButton.className = 'regenerate-button';
        regenerateButton.innerHTML = '&#x21bb;'; // 循环箭头符号
        regenerateButton.title = '重新生成';
        regenerateButton.onclick = () => regenerateResponse(messageDiv);
        
        buttonContainer.appendChild(regenerateButton);
        contentWrapper.appendChild(buttonContainer);
    }
    
    messageDiv.appendChild(avatar);
    messageDiv.appendChild(contentWrapper);
    chatContainer.appendChild(messageDiv);
    
    // 添加代码块相关的样式
    const style = document.createElement('style');
    style.textContent = `
        .content pre {
            background-color: #f5f5f5;
            border-radius: 4px;
            padding: 12px;
            margin: 8px 0;
            overflow-x: auto;
        }
        
        .content code {
            font-family: 'Consolas', 'Monaco', 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.4;
        }
        
        .content pre code {
            display: block;
            white-space: pre;
        }
        
        .content p {
            margin: 8px 0;
        }
    `;
    if (!document.querySelector('style[data-code-style]')) {
        style.setAttribute('data-code-style', 'true');
        document.head.appendChild(style);
    }
    
    // 滚动到底部
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // 如果需要保存，则更新聊天组数据
    if (shouldSave) {
        const currentChat = chatGroups.find(c => c.id === currentChatId);
        if (currentChat) {
            // 如果是用户消息，添加预处理内容
            const messageContent = role === 'user' ? preprocessMessage(content) : content;
            currentChat.messages.push({ role, content: messageContent });
            // 更新聊天组标题为第一条用户消息的前30个字符
            if (role === 'user' && currentChat.messages.length === 1) {
                currentChat.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
                updateChatList();
            }
        }
    }

    return contentDiv;
}

// 处理流式响应
async function handleStreamResponse(response, contentDiv) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let fullContent = '';

    try {
        while (true) {
            const { done, value } = await reader.read();
            
            // 如果数据流结束，跳出循环
            if (done) {
                // 处理剩余的缓冲区
                if (buffer.trim()) {
                    const lines = buffer.split('\n');
                    for (const line of lines) {
                        if (line.trim() && line.startsWith('data: ')) {
                            const data = line.slice(6);
                            if (data === '[DONE]') continue;
                            try {
                                const parsed = JSON.parse(data);
                                if (parsed.choices?.[0]?.delta?.content) {
                                    const content = parsed.choices[0].delta.content;
                                    fullContent += content;
                                    contentDiv.textContent = fullContent;
                                }
                            } catch (e) {
                                console.error('解析最终数据失败:', e);
                            }
                        }
                    }
                }
                break;
            }

            // 解码新的数据块并添加到缓冲区
            buffer += decoder.decode(value, { stream: true });

            // 处理缓冲区中的完整行
            const lines = buffer.split('\n');
            buffer = lines.pop() || ''; // 保留最后一个不完整的行

            for (const line of lines) {
                if (line.trim() && line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices?.[0]?.delta?.content) {
                            const content = parsed.choices[0].delta.content;
                            fullContent += content;
                            
                            // 清空现有内容
                            contentDiv.innerHTML = '';
                            
                            // 使用 marked 处理 Markdown
                            if (window.marked) {
                                // 保持代码块的特殊处理
                                if (fullContent.includes('```')) {
                                    const parts = fullContent.split(/(```[a-z]*\n[\s\S]*?(?:```|$))/g);
                                    parts.forEach(part => {
                                        if (part.startsWith('```')) {
                                            // 处理代码块的逻辑保持不变
                                            const match = part.match(/```([a-z]*)\n([\s\S]*?)(?:```|$)/);
                                            if (match) {
                                                const [, language, code] = match;
                                                const preElement = document.createElement('pre');
                                                const codeElement = document.createElement('code');
                                                if (language) {
                                                    codeElement.className = `language-${language}`;
                                                }
                                                codeElement.textContent = code;
                                                preElement.appendChild(codeElement);
                                                contentDiv.appendChild(preElement);
                                                
                                                if (part.endsWith('```') && window.hljs) {
                                                    window.hljs.highlightElement(codeElement);
                                                }
                                            }
                                        } else if (part.trim()) {
                                            // 使用 marked 处理非代码块部分
                                            const parsedHtml = marked.parse(part);
                                            const tempDiv = document.createElement('div');
                                            tempDiv.innerHTML = parsedHtml;
                                            contentDiv.appendChild(tempDiv);
                                        }
                                    });
                                } else {
                                    // 如果没有代码块，直接用 marked 处理全部内容
                                    contentDiv.innerHTML = marked.parse(fullContent);
                                }
                            } else {
                                // 如果 marked 还没加载完，使用简单的文本显示
                                contentDiv.textContent = fullContent;
                            }
                            
                            // 滚动到底部
                            contentDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    } catch (e) {
                        console.error('解析数据失败:', e);
                    }
                }
            }
        }

        return fullContent;
    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('生成已停止');
            return fullContent;
        }
        console.error('处理流式响应失败:', error);
        throw error;
    } finally {
        // 确保读取器被关闭
        try {
            await reader.cancel();
        } catch (e) {
            console.error('关闭读取器失败:', e);
        }
        // 隐藏停止按钮
        document.getElementById('stopButton').style.display = 'none';
    }
}

// 切换聊天组
function switchChat(chatId) {
    // 如果当前是临时聊天且没有消息，则删除它
    const currentChat = chatGroups.find(c => c.id === currentChatId);
    if (currentChat && currentChat.isTemp && currentChat.messages.length === 0) {
        chatGroups = chatGroups.filter(c => c.id !== currentChatId);
    }

    currentChatId = chatId;
    const chat = chatGroups.find(c => c.id === chatId);
    if (chat) {
        // 更新UI
        updateChatList();
        displayChatMessages(chat);
        // 更新模型选择
        currentModel = chat.model;
        document.getElementById('modelSelect').value = currentModel;
    }
}

// 重新生成回答
async function regenerateResponse(messageDiv) {
    // 获取当前聊天组
    const currentChat = chatGroups.find(c => c.id === currentChatId);
    if (!currentChat || currentChat.messages.length < 2) return;

    // 找到当前消息在消息列表中的位置
    const messageIndex = Array.from(messageDiv.parentElement.children).indexOf(messageDiv);
    
    // 移除UI中的前消息及其后的所有消息
    const chatContainer = document.getElementById('chatContainer');
    while (chatContainer.children.length > messageIndex) {
        chatContainer.lastChild.remove();
    }

    // 找到对应的消息在数据中的置
    let dataMessageIndex = -1;
    for (let i = 0; i < currentChat.messages.length; i++) {
        if (currentChat.messages[i].role === 'assistant' && 
            i > 0 && currentChat.messages[i-1].role === 'user') {
            dataMessageIndex++;
            if (dataMessageIndex === Math.floor(messageIndex / 2)) { // 因为UI中每对消息占2个位置
                // 移除这条消息及后的所有消息
                currentChat.messages = currentChat.messages.slice(0, i);
                break;
            }
        }
    }

    // 获取最后一条用户消息（已包含了预处理的内容）
    const lastUserMessage = currentChat.messages[currentChat.messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') return;

    // 禁用所有重新生成按钮
    const regenerateButtons = document.querySelectorAll('.regenerate-button');
    regenerateButtons.forEach(button => button.disabled = true);

    // 获取按钮元素
    const sendButton = document.getElementById('sendButton');
    const stopButton = document.getElementById('stopButton');
    const messageInput = document.getElementById('messageInput');

    // 禁用输入和发送按钮，显示停止按钮
    messageInput.disabled = true;
    sendButton.disabled = true;
    stopButton.style.display = 'inline-block';

    try {
        // 创建新的助手消息占位
        const assistantContentDiv = addMessageToChat('assistant', '', false);

        // 创建新的 AbortController
        currentController = new AbortController();

        // 获取完整的消息历史
        const messages = getCurrentChatMessages();

        // 发送请求到服务器
        const response = await fetch(`${config.api.baseUrl}${config.api.chatEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
                model: currentModel,
                messages: messages,
                stream: true,
                temperature: config.chat.temperature,
                max_tokens: config.chat.maxTokens,
                presence_penalty: config.chat.presencePenalty,
                frequency_penalty: config.chat.frequencyPenalty
            }),
            signal: currentController.signal
        });

        if (!response.ok) {
            throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }

        // 处理流式响应
        const fullContent = await handleStreamResponse(response, assistantContentDiv);

        // 保存新的助手回复
        currentChat.messages.push({
            role: 'assistant',
            content: fullContent
        });

        // 保存更新后的聊天记录
        await saveChatGroup(currentChat);

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log('生成已停止');
        } else {
            console.error('重新生成失败:', error);
            alert('重新生成失败，请检查服务器连接');
        }
    } finally {
        // 重新启用输入和发送按钮，隐藏停止按钮
        messageInput.disabled = false;
        sendButton.disabled = false;
        stopButton.style.display = 'none';
        currentController = null;
        // 重新启用所有重新生成按钮
        regenerateButtons.forEach(button => button.disabled = false);
    }
}

// 显示提示消息
function showToast(message, type = 'warning') {
    // 创建或获取toast容器
    let toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
        
        // 添加toast样式
        const style = document.createElement('style');
        style.textContent = `
            .toast-container {
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 1000;
            }
            
            .toast {
                background: white;
                border-radius: 4px;
                padding: 12px 24px;
                margin-bottom: 10px;
                box-shadow: 0 2px 5px rgba(0,0,0,0.2);
                display: flex;
                align-items: center;
                animation: slideIn 0.3s ease, fadeOut 0.3s ease 2.7s;
                max-width: 300px;
            }
            
            .toast.warning {
                border-left: 4px solid #ffc107;
            }
            
            .toast.error {
                border-left: 4px solid #dc3545;
            }
            
            .toast.success {
                border-left: 4px solid #28a745;
            }
            
            @keyframes slideIn {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }
    
    // 创建toast元素
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    
    // 添加到容器
    toastContainer.appendChild(toast);
    
    // 3秒后移除
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// 添加 Markdown 样式
const markdownStyle = document.createElement('style');
markdownStyle.textContent = `
    .content h1, .content h2, .content h3, .content h4, .content h5, .content h6 {
        margin-top: 16px;
        margin-bottom: 8px;
        font-weight: 600;
    }
    
    .content h1 { font-size: 2em; }
    .content h2 { font-size: 1.5em; }
    .content h3 { font-size: 1.17em; }
    
    .content ul, .content ol {
        padding-left: 20px;
        margin: 8px 0;
    }
    
    .content li {
        margin: 4px 0;
    }
    
    .content p {
        margin: 8px 0;
        line-height: 1.5;
    }
    
    .content blockquote {
        border-left: 4px solid #ddd;
        margin: 8px 0;
        padding-left: 16px;
        color: #666;
    }
    
    .content hr {
        border: none;
        border-top: 1px solid #ddd;
        margin: 16px 0;
    }
    
    .content table {
        border-collapse: collapse;
        margin: 8px 0;
        width: 100%;
    }
    
    .content th, .content td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
    }
    
    .content th {
        background-color: #f5f5f5;
    }
`;
document.head.appendChild(markdownStyle);

// 初始化页面
init();

