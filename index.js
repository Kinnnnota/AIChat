import fetch from 'node-fetch';
import fs from 'fs/promises';
import dotenv from 'dotenv';

// 加载环境变量
dotenv.config();

// 获取环境变量或使用默认值
const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:8080';

async function getAvailableModels() {
    try {
        console.log('获取可用模型列表...');
        const response = await fetch(`${API_BASE_URL}/v1/models`);
        
        if (!response.ok) {
            throw new Error(`获取模型列表失败: ${response.status} ${response.statusText}`);
        }

        const models = await response.json();
        console.log('可用模型列表：', models);
        return models.data;
    } catch (error) {
        console.error('获取模型列表失败：', error);
        throw error;
    }
}

async function sendMessage(model, message) {
    try {
        console.log(`正在使用模型 ${model} 发送消息...`);
        const response = await fetch(`${API_BASE_URL}/v1/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    {
                        role: "user",
                        content: message
                    }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`请求失败: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // 将完整信息保存到文件
        try {
            const fullResponse = {
                status: response.status,
                headers: Object.fromEntries(response.headers.entries()),
                data: data
            };

            await fs.writeFile('response.json', JSON.stringify(fullResponse, null, 2), 'utf8');
            console.log('响应已保存到 response.json');
        } catch (fileError) {
            console.error('保存响应文件失败，但继续执行：', fileError);
        }
        
        return data;
    } catch (error) {
        console.error('发送消息失败：', error);
        throw error;
    }
}

async function main() {
    try {
        // 首先获取可用模型列表
        const models = await getAvailableModels();
        
        // 将模型列表保存到文件
        try {
            await fs.writeFile('available_models.json', JSON.stringify(models, null, 2), 'utf8');
            console.log('模型列表已保存到 available_models.json');
        } catch (fileError) {
            console.error('保存模型列表失败，但继续执行：', fileError);
        }

        // 如果有可用模型，使用第一个模型发送测试消息
        if (models && models.length > 0) {
            const firstModel = models[0].id;
            console.log(`使用模型 ${firstModel} 发送测试消息...`);
            const response = await sendMessage(firstModel, "Hello, this is a test message.");
            console.log('测试消息响应：', response);
        } else {
            console.log('没有可用的模型');
        }
    } catch (error) {
        console.error('程序执行失败：', error);
    }
}

// 执行主程序
main();
