const express = require('express');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const DB_FILE = './database.json';

// 🔐 ENV
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin';
const GEMINI_KEY = process.env.GEMINI_KEY || '';

// SERVER KEY
const MASTER_SERVER_KEY = 'LVT-SERVER-PRO'; 

// ===== DB =====
function loadDB() {
    if (!fs.existsSync(DB_FILE)) return {};
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

// ===== LOGIN =====
app.get('/login', (req, res) => {
    res.send(`
    <h2>LOGIN ADMIN</h2>
    <form method="POST">
        <input type="password" name="password" placeholder="Nhập mật khẩu">
        <button>Login</button>
    </form>
    `);
});

app.post('/login', (req, res) => {
    if (req.body.password === ADMIN_PASSWORD) {
        res.setHeader('Set-Cookie', 'admin_auth=true; Max-Age=86400; Path=/');
        res.redirect('/');
    } else {
        res.send('Sai mật khẩu');
    }
});

// ===== AUTH =====
app.use((req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    if (req.path === '/login') return next();

    const cookies = req.headers.cookie || '';
    if (cookies.includes('admin_auth=true')) return next();

    res.redirect('/login');
});

// ===== API CHECK =====
app.post('/api/check', (req, res) => {
    const { key, deviceId } = req.body;

    if (key === MASTER_SERVER_KEY) {
        return res.json({ status: 'success', key, exp: 'permanent' });
    }

    let db = loadDB();

    if (!db[key]) return res.json({ status: 'error', message: 'Key không tồn tại' });

    let k = db[key];

    if (k.status === 'banned') return res.json({ status: 'error', message: 'Key bị khóa' });

    if (k.exp === 'pending') {
        k.exp = Date.now() + k.durationMs;
        saveDB(db);
    }

    if (k.exp !== 'permanent' && Date.now() > k.exp) {
        return res.json({ status: 'error', message: 'Hết hạn' });
    }

    if (!k.devices.includes(deviceId)) {
        if (k.devices.length >= k.maxDevices) {
            return res.json({ status: 'error', message: 'Full thiết bị' });
        }
        k.devices.push(deviceId);
        saveDB(db);
    }

    res.json({ status: 'success', devices: `${k.devices.length}/${k.maxDevices}` });
});

// ===== API AI =====
app.post('/api/ai', async (req, res) => {
    try {
        const { prompt } = req.body;

        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${GEMINI_KEY}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }]
                })
            }
        );

        const data = await response.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "AI lỗi";

        res.json({ status: 'success', text });

    } catch {
        res.json({ status: 'error', message: 'AI lỗi' });
    }
});

// ===== CREATE KEY =====
app.post('/admin/create', (req, res) => {
    let { duration, type, maxDevices } = req.body;
    let db = loadDB();

    const key = 'LVT-' + Math.random().toString(36).substring(2, 8).toUpperCase();

    const map = {
        sec: 1000,
        min: 60000,
        hour: 3600000,
        day: 86400000
    };

    let durationMs = map[type] ? duration * map[type] : 0;

    db[key] = {
        exp: type === 'permanent' ? 'permanent' : 'pending',
        durationMs,
        maxDevices: parseInt(maxDevices),
        devices: [],
        status: 'active'
    };

    saveDB(db);
    res.redirect('/');
});

// ===== HOME =====
app.get('/', (req, res) => {
    let db = loadDB();
    let html = '<h2>KEY LIST</h2>';

    for (let k in db) {
        html += `<p>${k} | ${db[k].devices.length}/${db[k].maxDevices}</p>`;
    }

    html += `
    <h3>Create Key</h3>
    <form method="POST" action="/admin/create">
        <input name="duration" placeholder="time">
        <select name="type">
            <option value="min">phút</option>
            <option value="hour">giờ</option>
            <option value="day">ngày</option>
            <option value="permanent">vĩnh viễn</option>
        </select>
        <input name="maxDevices" value="1">
        <button>Tạo</button>
    </form>
    `;

    res.send(html);
});

// ===== START =====
app.listen(port, () => {
    console.log("Server chạy cổng " + port);
});
