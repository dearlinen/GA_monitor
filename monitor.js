const axios = require('axios');
const nodemailer = require('nodemailer');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// 环境变量
const URL = process.env.BILI_API_URL;
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;
const RECEIVER_EMAIL = process.env.RECEIVER_EMAIL || EMAIL_USER;

const STATE_FILE = path.join(__dirname, 'last_state.json');

// 获取上海时区时间的辅助函数
function getShanghaiTime() {
    return new Date().toLocaleString('zh-CN', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
}

// 通用的邮件发送函数
async function sendMail(subject, htmlContent) {
    let transporter = nodemailer.createTransport({
        host: 'smtp.qq.com',
        port: 465,
        secure: true,
        auth: {
            user: EMAIL_USER,
            pass: EMAIL_PASS
        }
    });

    await transporter.sendMail({
        from: `"Bili Monitor" <${EMAIL_USER}>`,
        to: RECEIVER_EMAIL,
        subject: subject,
        html: htmlContent
    });
}

async function run() {
    try {
        console.log(`[${getShanghaiTime()}] --- 正在发起 API 请求 ---`);
        const response = await axios.get(URL);

        if (response.status !== 200 || !response.data) {
            throw new Error(`API 响应异常，状态码: ${response.status}`);
        }

        // 数据结构适配
        let dataList = null;
        const rawData = response.data.data;
        if (Array.isArray(rawData)) { dataList = rawData; }
        else if (rawData && Array.isArray(rawData.list)) { dataList = rawData.list; }
        else if (rawData && Array.isArray(rawData.archives)) { dataList = rawData.archives; }
        else if (rawData && Array.isArray(rawData.item)) { dataList = rawData.item; }

        if (!dataList) {
            throw new Error('无法在响应中找到有效的数组结构，请检查日志中的完整 JSON');
        }

        console.log(`✅ 成功获取 ${dataList.length} 条数据。`);

        if (dataList.length === 0) return;

        // ... 请求 API 部分 ...

        const latestItem = dataList[0];
        const newTitle = latestItem.title;

        // 2. 生成新标题的哈希值 (SHA-256)
        const newHash = crypto.createHash('sha256').update(newTitle).digest('hex');

        // 读取旧状态
        let oldHash = '';
        if (fs.existsSync(STATE_FILE)) {
            try {
                const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
                // 注意这里读的是上次存的哈希值
                oldHash = state.lastHash || '';
            } catch (e) {
                console.warn('读取旧状态失败');
            }
        }

        // 3. 使用哈希值进行比对
        if (newHash !== oldHash) {
            const currentTime = getShanghaiTime();
            console.log(`🚀 检测到更新！(哈希值已变动)`);
            // 日志中不要打印真实标题，或者只打印前几个字符
            console.log(`New Hash: ${newHash.substring(0, 10)}...`);
            // 1. 生成所有卡片的 HTML
            const allCardsHTML = dataList.map(item => {
                const durationMin = Math.floor(item.duration / 60);
                const durationSec = String(item.duration % 60).padStart(2, '0');
                const videoLink = item.short_link_v2 || `https://www.bilibili.com/video/${item.bvid || item.aid}`;

                // 使用你提供的 itemHTML 常量作为模版
                return `
                <div style="width: 280px; margin: 10px; background-color: #ffffff; border: 1px solid #e3e5e7; border-radius: 8px; overflow: hidden; display: inline-block; vertical-align: top; text-align: left; font-family: sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
                    <a href="${videoLink}" style="text-decoration: none; display: block; position: relative;">
                        <img src="${item.pic}" style="width: 100%; height: 160px; object-fit: cover; display: block;">
                        <div style="position: absolute; bottom: 5px; right: 5px; background: rgba(0,0,0,0.7); color: #fff; padding: 2px 5px; border-radius: 4px; font-size: 10px;">
                            ${durationMin}:${durationSec}
                        </div>
                    </a>
                    <div style="padding: 12px;">
                        <div style="font-size: 11px; margin-bottom: 8px; color: #9499a0; display: flex; align-items: center; justify-content: space-between;">
                            <span style="background: #f1f2f3; padding: 2px 6px; border-radius: 4px;">${item.tname || '未知分区'}</span>
                            <span style="margin-left: 8px;">📍 ${item.pub_location || '未知'}</span>
                        </div>
                        <div style="margin-bottom: 12px; word-wrap: break-word;">
                            <a href="${videoLink}" style="text-decoration: none; color: #18191c; font-size: 14px; font-weight: bold; line-height: 1.5; display: block;">
                                ${item.title}
                            </a>
                        </div>
                        <div style="font-size: 12px; color: #61666d; margin-bottom: 12px; line-height: 1.8;">
                            <div style="display: flex; gap: 10px; margin-bottom: 2px;">
                                <span>▶ ${item.stat.view}</span>
                                <span>👍 ${item.stat.like}</span>
                            </div>
                            <div style="display: flex; gap: 10px;">
                                <span>💰 ${item.stat.coin}</span>
                                <span>⭐ ${item.stat.favorite}</span>
                            </div>
                        </div>
                        <div style="padding-top: 12px; border-top: 1px solid #f1f2f3; display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center;">
                                <img src="${item.owner.face}" style="width: 24px; height: 24px; border-radius: 50%; margin-right: 8px; vertical-align: middle;">
                                <span style="font-size: 12px; color: #61666d; max-width: 140px; display: inline-block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                                    ${item.owner.name}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>`;
            }).join('');

            // 2. 嵌入 parentHTML
            const finalHTML = `
            <div style="background-color: #f6f7f8; padding: 30px 10px; text-align: center; min-height: 500px;">
                <div style="margin-bottom: 25px;">
                    <span style="font-size: 20px; font-weight: bold; color: #18191c;">🎬 订阅内容更新推送</span>
                </div>
                <div style="max-width: 950px; margin: 0 auto; text-align: center;">
                    ${allCardsHTML}
                </div>
                <div style="margin-top: 40px; font-size: 12px; color: #9499a0; border-top: 1px solid #e3e5e7; padding-top: 20px;">
                    本邮件由 GitHub Actions 自动生成 | 检查时间：${currentTime} (上海时间)
                </div>
            </div>`;
            // 4. 发送邮件（邮件内容依然使用真实标题，因为邮件是私密的）
            await sendMail(`🎬 B站更新提醒 - ${currentTime}`, finalHTML);

            // 5. 更新状态（存入哈希值而非明文标题）
            fs.writeFileSync(STATE_FILE, JSON.stringify({ lastHash: newHash }));
            console.log('✅ 状态已混淆并保存。');
        } else {
            console.log('数据一致，无需更新。');
        }
    } catch (error) {
        const errorTime = getShanghaiTime();
        console.error(`❌ [${errorTime}] 运行出错:`, error.message);

        // 如果出错，向 Gmail 发送报警邮件
        try {
            const errorHtml = `
                <div style="color: #721c24; background-color: #f8d7da; border: 1px solid #f5c6cb; padding: 20px; border-radius: 5px;">
                    <h2>监控脚本运行出错</h2>
                    <p><b>错误时间：</b>${errorTime}</p>
                    <p><b>错误详情：</b>${error.message}</p>
                    <pre style="background: #eee; padding: 10px;">${error.stack}</pre>
                </div>
            `;
            await sendMail(`⚠️ 监控脚本异常报警 - ${errorTime}`, errorHtml);
            console.log('报警邮件已发送。');
        } catch (mailErr) {
            console.error('发送报警邮件也失败了:', mailErr.message);
        }
        process.exit(1);
    }
}

run();