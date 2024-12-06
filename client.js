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

// 加载配置文件
async function loadConfig() {
    try {
        const response = await fetch('config.json');
        if (!response.ok) {
            throw new Error('加载配置文件失败');
        }
        config = await response.json();
    } catch (error) {
        console.error('加载配置文件失败:', error);
        // 使用默认配置
        config = {
            messagePreprocessing: {
                enabled: true,
                prefix: "请用简洁专业的语言回答，避免过多的客套话。",
                systemMessage: "You are a helpful AI assistant that provides clear and professional answers."
            }
        };
    }
}

// 初始化页面
async function init() {
    await loadConfig(); // 首先加载配置
    await loadModels();
    await loadChatGroups();
    setupEventListeners();
    if (chatGroups.length === 0) {
        createNewChat();
    } else {
        switchChat(chatGroups[0].id);
    }
}

// 保存聊天记录到文件
async function saveChatGroup(chatGroup) {
    try {
        const response = await fetch('http://localhost:3001/save-chat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(chatGroup)
        });
        
        if (!response.ok) {
            throw new Error('保存聊天记录失败');
        }
    } catch (error) {
        console.error('保存聊天记录失败:', error);
    }
}

// 加载所有聊天记录
async function loadChatGroups() {
    try {
        const response = await fetch('http://localhost:3001/load-chats');
        if (!response.ok) {
            throw new Error('加载聊天记录失败');
        }
        const data = await response.json();
        chatGroups = data.chats || [];
        updateChatList();
    } catch (error) {
        console.error('加载聊天记录失败:', error);
        chatGroups = [];
    }
}

// 删除聊天记录
async function deleteChatGroup(chatId) {
    try {
        const response = await fetch(`http://localhost:3001/delete-chat/${chatId}`, {
            method: 'DELETE'
        });
        
        if (!response.ok) {
            throw new Error('删除聊天记录失败');
        }
        
        // 从内存中移除
        chatGroups = chatGroups.filter(chat => chat.id !== chatId);
        if (chatId === currentChatId) {
            if (chatGroups.length > 0) {
                switchChat(chatGroups[0].id);
            } else {
                createNewChat();
            }
        } else {
            updateChatList();
        }
    } catch (error) {
        console.error('删除聊天记录失败:', error);
    }
}

// 修改创建新聊天的函数
function createNewChat() {
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

        // 创建新的 AbortController
        currentController = new AbortController();

        // 获取完整的消息历史
        const messages = getCurrentChatMessages();
        
        // 发送请求到服务器
        const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
                model: currentModel,
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 2000,
                presence_penalty: 0,
                frequency_penalty: 0
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
            // 移除未完成的助手消息
            const currentChat = chatGroups.find(c => c.id === currentChatId);
            if (currentChat && currentChat.messages.length > 0) {
                const lastMessage = currentChat.messages[currentChat.messages.length - 1];
                if (lastMessage.role === 'assistant' && !lastMessage.content) {
                    currentChat.messages.pop();
                }
            }
        } else {
            console.error('发送消息失败:', error);
            alert('发送消息失败，请检查服务器连接');
        }
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
        
        // 创建标题和删除按钮的容器
        const itemContent = document.createElement('div');
        itemContent.className = 'history-item-content';
        
        // 添加标题
        const title = document.createElement('span');
        title.textContent = chat.title;
        // 将点击事件绑定到整个itemContent上
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

// 加载可用模型列表
async function loadModels() {
    try {
        const response = await fetch('http://127.0.0.1:8080/v1/models');
        const data = await response.json();
        
        const modelSelect = document.getElementById('modelSelect');
        modelSelect.innerHTML = ''; // 清空现有选项
        
        data.data.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.name;
            modelSelect.appendChild(option);
        });

        // 设置默认模型
        if (data.data.length > 0) {
            currentModel = data.data[0].id;
            modelSelect.value = currentModel;
        }
    } catch (error) {
        console.error('加载模型列表失败:', error);
        alert('加载模型列表失败，请检查服务器连接');
    }
}

// 显示聊天息
function displayChatMessages(chat) {
    clearChatContainer();
    if (chat && chat.messages) {
        chat.messages.forEach(msg => {
            addMessageToChat(msg.role, msg.content, false);
        });
    }
}
// 清空聊天��器
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

    // 添加新建聊天按钮
    const historyList = document.getElementById('historyList');
    const newChatButton = document.createElement('div');
    newChatButton.className = 'history-item new-chat';
    newChatButton.textContent = '+ 新建聊天';
    newChatButton.onclick = createNewChat;
    historyList.parentElement.insertBefore(newChatButton, historyList);
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
    contentDiv.textContent = content;
    
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
    
    // 滚动到底部
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // 如果需要保存，则更新聊天组数据
    if (shouldSave) {
        const currentChat = chatGroups.find(c => c.id === currentChatId);
        if (currentChat) {
            currentChat.messages.push({ role, content });
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
            if (done) break;

            // 解码新的数据块
            buffer += decoder.decode(value, { stream: true });

            // 处理缓冲区中的所有完整事件
            while (true) {
                const newlineIndex = buffer.indexOf('\n');
                if (newlineIndex === -1) break;

                const line = buffer.slice(0, newlineIndex).trim();
                buffer = buffer.slice(newlineIndex + 1);

                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;

                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                            const content = parsed.choices[0].delta.content;
                            fullContent += content;
                            contentDiv.textContent = fullContent;
                            // 滚动到底部
                            contentDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
                        }
                    } catch (e) {
                        console.error('解析响应数据失败:', e);
                    }
                }
            }
        }

        // 处理剩余的缓冲区
        if (buffer.trim() && !buffer.includes('[DONE]')) {
            try {
                const parsed = JSON.parse(buffer);
                if (parsed.choices && parsed.choices[0] && parsed.choices[0].delta && parsed.choices[0].delta.content) {
                    fullContent += parsed.choices[0].delta.content;
                    contentDiv.textContent = fullContent;
                }
            } catch (e) {
                console.error('解析最终响应数据失败:', e);
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

// 重新生��回答
async function regenerateResponse(messageDiv) {
    // 获取当前聊天组
    const currentChat = chatGroups.find(c => c.id === currentChatId);
    if (!currentChat || currentChat.messages.length < 2) return;

    // 找到当前消息在消息列表中的位置
    const messageIndex = Array.from(messageDiv.parentElement.children).indexOf(messageDiv);
    
    // 移除UI中的当前消息及其后的所有消息
    const chatContainer = document.getElementById('chatContainer');
    while (chatContainer.children.length > messageIndex) {
        chatContainer.lastChild.remove();
    }

    // 找到对应的消息在数据中的位置
    let dataMessageIndex = -1;
    for (let i = 0; i < currentChat.messages.length; i++) {
        if (currentChat.messages[i].role === 'assistant' && 
            i > 0 && currentChat.messages[i-1].role === 'user') {
            dataMessageIndex++;
            if (dataMessageIndex === Math.floor(messageIndex / 2)) { // 因为UI中每对消息占两个位置
                // 移除这条消息及其后的所有消息
                currentChat.messages = currentChat.messages.slice(0, i);
                break;
            }
        }
    }

    // 获取最后一条用户消息（已经包含了预处理的内容）
    const lastUserMessage = currentChat.messages[currentChat.messages.length - 1];
    if (!lastUserMessage || lastUserMessage.role !== 'user') return;

    // 禁用所有重新生成按钮
    const regenerateButtons = document.querySelectorAll('.regenerate-button');
    regenerateButtons.forEach(button => button.disabled = true);

    try {
        // 创建新的助手消息占位
        const assistantContentDiv = addMessageToChat('assistant', '', false);

        // 创建新的 AbortController
        currentController = new AbortController();

        // 获取完整的消息历史
        const messages = getCurrentChatMessages();

        // 发送请求到服务器
        const response = await fetch('http://127.0.0.1:8080/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'text/event-stream',
            },
            body: JSON.stringify({
                model: currentModel,
                messages: messages,
                stream: true,
                temperature: 0.7,
                max_tokens: 2000,
                presence_penalty: 0,
                frequency_penalty: 0
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
        // 重新启用所有重新生成按钮
        regenerateButtons.forEach(button => button.disabled = false);
        currentController = null;
    }
}

// 初始化页面
init();

