const express = require('express');
const { MongoClient } = require('mongodb');
const app = express();
app.use(express.json());

// 用你的MongoDB连接字符串替换下面这行
const DB_URL = 'mongodb+srv://admin:你的密码@cluster0.xxx.mongodb.net/';

let dbClient;

async function connectDB() {
    const client = new MongoClient(DB_URL);
    await client.connect();
    dbClient = client;
    return client.db('keyDB');
}

// 生成设备指纹
function generateFingerprint(req) {
    return req.headers['user-agent'] + req.ip;
}

app.post('/api/verify', async (req, res) => {
    try {
        const db = await connectDB();
        const keys = db.collection('keys');
        
        const { key } = req.body;
        const fingerprint = generateFingerprint(req);
        
        if (!key) {
            return res.status(400).json({ error: '请提供卡密' });
        }
        
        // 查找卡密
        let keyDoc = await keys.findOne({ key: key });
        
        // 如果卡密不存在，自动创建（测试用，正式环境应该预先导入卡密）
        if (!keyDoc) {
            await keys.insertOne({
                key: key,
                used: false,
                fingerprint: null,
                createdAt: new Date()
            });
            keyDoc = await keys.findOne({ key: key });
        }
        
        // 检查是否已被使用
        if (keyDoc.used) {
            // 如果是同一设备
            if (keyDoc.fingerprint === fingerprint) {
                return res.json({ 
                    valid: true, 
                    message: '验证成功（已绑定设备）'
                });
            }
            return res.json({ 
                valid: false, 
                message: '卡密已被其他设备绑定' 
            });
        }
        
        // 首次使用，绑定设备
        await keys.updateOne(
            { _id: keyDoc._id },
            { $set: { 
                used: true,
                fingerprint: fingerprint,
                usedAt: new Date()
            }}
        );
        
        res.json({
            valid: true,
            message: '卡密绑定成功！'
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: '服务器错误' });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`服务运行在端口 ${PORT}`);
});

// 关闭数据库连接
process.on('SIGINT', async () => {
    if (dbClient) await dbClient.close();
    process.exit();
});