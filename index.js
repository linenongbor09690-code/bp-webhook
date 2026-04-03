const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

function verifySignature(body, signature) {
  if (!signature || !LINE_SECRET) return true;
  const hash = crypto.createHmac('SHA256', LINE_SECRET).update(body).digest('base64');
  return `sha256=${hash}` === signature;
}

// ===== CONFIG — เปลี่ยนค่าเหล่านี้ =====
const LINE_TOKEN = process.env.LINE_TOKEN || 'YOUR_CHANNEL_ACCESS_TOKEN';
const SHEET_URL  = process.env.SHEET_URL  || 'YOUR_GOOGLE_APPS_SCRIPT_URL';

// อสม. และเจ้าหน้าที่ รพ.สต. (LINE User ID)
const ALERT_USERS = (process.env.ALERT_USERS || '').split(',').filter(Boolean);

// ===== BP CLASSIFICATION =====
function classifyBP(sys, dia) {
  if (sys >= 180 || dia >= 110) return {
    level: 'crisis', color: '#c0392b',
    th: '🆘 วิกฤต! ความดันอันตราย',
    en: 'Hypertensive Crisis',
    emoji: '🆘',
    message: [
      '⚠️ ค่าความดันของคุณอยู่ในระดับ *วิกฤต* อันตรายมาก!',
      '',
      '🚨 *ต้องรับการรักษาทันที*',
      '📞 โทร 1669 ฉุกเฉิน',
      '',
      'หากมีอาการต่อไปนี้ → โทร 1669 ทันที:',
      '• ปวดหัวรุนแรงมาก',
      '• เจ็บแน่นหน้าอก',
      '• ตาพร่า มองไม่ชัด',
      '• แขน-ขาอ่อนแรง/ชา',
      '• พูดไม่ชัด'
    ].join('\n'),
    alert: true,
    alertMsg: '🚨 แจ้งเตือนด่วน! ผู้ป่วยมีค่าความดันวิกฤต'
  };

  if (sys >= 140 || dia >= 90) return {
    level: 'stage2', color: '#e67e22',
    th: '🟠 สงสัยป่วย ความดันสูง',
    en: 'High Blood Pressure Stage 2',
    emoji: '🟠',
    message: [
      '⚠️ ค่าความดันของคุณสูงเกินเกณฑ์ปกติ',
      '',
      '📋 *แนะนำ:*',
      '• นัดพบแพทย์หรือเจ้าหน้าที่ภายใน 1 สัปดาห์',
      '• วัดซ้ำหลังพัก 15 นาที',
      '• ลดอาหารเค็ม ลดความเครียด',
      '',
      '📱 ได้แจ้ง อสม. ในพื้นที่แล้ว'
    ].join('\n'),
    alert: true,
    alertMsg: '🟠 แจ้งเตือน: ผู้ป่วยมีค่าความดันสูง สงสัยป่วย'
  };

  if (sys >= 130 || dia >= 80) return {
    level: 'stage1', color: '#f1c40f',
    th: '🟡 กลุ่มเสี่ยง ความดันสูงกว่าปกติ',
    en: 'High Blood Pressure Stage 1',
    emoji: '🟡',
    message: [
      '⚠️ ค่าความดันของคุณสูงกว่าปกติเล็กน้อย',
      '',
      '📋 *แนะนำ:*',
      '• วัดซ้ำอีก 2-3 ครั้ง หลังพัก 5 นาที',
      '• ลดอาหารเค็มและไขมัน',
      '• เพิ่มการออกกำลังกาย',
      '• ติดตามค่าความดันต่อเนื่อง'
    ].join('\n'),
    alert: false
  };

  return {
    level: 'normal', color: '#27ae60',
    th: '🟢 ความดันปกติ ดีมาก!',
    en: 'Normal Blood Pressure',
    emoji: '🟢',
    message: [
      '✅ *ยอดเยี่ยม!* ค่าความดันของคุณอยู่ในเกณฑ์ปกติ',
      '',
      '💪 รักษาสุขภาพให้ดีต่อไปด้วยการ:',
      '• ออกกำลังกายสม่ำเสมอ',
      '• ทานอาหารที่มีประโยชน์',
      '• ลดเกลือและไขมัน',
      '• นอนหลับพักผ่อนให้เพียงพอ'
    ].join('\n'),
    alert: false
  };
}

// ===== SEND LINE MESSAGE =====
async function replyMessage(replyToken, messages) {
  await axios.post('https://api.line.me/v2/bot/message/reply', {
    replyToken,
    messages
  }, {
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
  });
}

async function pushMessage(userId, messages) {
  await axios.post('https://api.line.me/v2/bot/message/push', {
    to: userId, messages
  }, {
    headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
  });
}

// ===== BUILD FLEX MESSAGE (BP RESULT CARD) =====
function buildBPCard(sys, dia, pulse, bp, userName) {
  const colors = {
    normal: { header: '#27ae60', light: '#e8f8ef' },
    stage1: { header: '#e6b800', light: '#fffae0' },
    stage2: { header: '#e67e22', light: '#fff3e0' },
    crisis: { header: '#c0392b', light: '#fdecea' }
  };
  const c = colors[bp.level] || colors.normal;
  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

  return {
    type: 'flex',
    altText: `ผลการวัดความดัน: ${sys}/${dia} mmHg — ${bp.th}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: c.header, paddingAll: '20px',
        contents: [
          { type: 'text', text: bp.emoji + ' ' + bp.th, weight: 'bold', size: 'lg', color: '#ffffff', wrap: true },
          { type: 'text', text: bp.en, size: 'sm', color: 'rgba(255,255,255,0.8)', margin: 'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              {
                type: 'box', layout: 'vertical', flex: 1,
                backgroundColor: c.light, cornerRadius: '12px', paddingAll: '12px',
                contents: [
                  { type: 'text', text: sys.toString(), weight: 'bold', size: 'xxl', color: c.header, align: 'center' },
                  { type: 'text', text: 'ตัวบน (SYS)', size: 'xs', color: '#888888', align: 'center' }
                ]
              },
              {
                type: 'box', layout: 'vertical', flex: 1,
                backgroundColor: c.light, cornerRadius: '12px', paddingAll: '12px',
                contents: [
                  { type: 'text', text: dia.toString(), weight: 'bold', size: 'xxl', color: c.header, align: 'center' },
                  { type: 'text', text: 'ตัวล่าง (DIA)', size: 'xs', color: '#888888', align: 'center' }
                ]
              },
              {
                type: 'box', layout: 'vertical', flex: 1,
                backgroundColor: '#f0f4f8', cornerRadius: '12px', paddingAll: '12px',
                contents: [
                  { type: 'text', text: pulse ? pulse.toString() : '-', weight: 'bold', size: 'xxl', color: '#3498db', align: 'center' },
                  { type: 'text', text: 'ชีพจร', size: 'xs', color: '#888888', align: 'center' }
                ]
              }
            ]
          },
          { type: 'separator' },
          { type: 'text', text: bp.message, wrap: true, size: 'sm', color: '#444444' },
          { type: 'separator' },
          { type: 'text', text: '🕐 ' + now, size: 'xs', color: '#aaaaaa' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          {
            type: 'button', style: 'primary',
            color: c.header, height: 'sm',
            action: { type: 'uri', label: '📊 ดูกราฟย้อนหลัง', uri: `https://liff.line.me/${process.env.LIFF_ID || ''}` }
          },
          ...(bp.level === 'crisis' ? [{
            type: 'button', style: 'primary',
            color: '#c0392b', height: 'sm',
            action: { type: 'uri', label: '🚑 โทร 1669 ฉุกเฉิน', uri: 'tel:1669' }
          }] : [])
        ]
      }
    }
  };
}

// ===== BUILD ALERT MESSAGE FOR อสม. =====
function buildAlertCard(sys, dia, userName, userId, bp) {
  const now = new Date().toLocaleString('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
  return {
    type: 'flex',
    altText: `⚠️ แจ้งเตือน: ${userName} ความดัน ${sys}/${dia}`,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical',
        backgroundColor: bp.level === 'crisis' ? '#c0392b' : '#e67e22',
        paddingAll: '16px',
        contents: [
          { type: 'text', text: bp.level === 'crisis' ? '🚨 แจ้งเตือนด่วน!' : '⚠️ แจ้งเตือน', weight: 'bold', size: 'xl', color: '#ffffff' },
          { type: 'text', text: bp.level === 'crisis' ? 'ผู้ป่วยความดันวิกฤต' : 'ผู้ป่วยความดันสูง', size: 'sm', color: 'rgba(255,255,255,0.85)' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '👤 ' + (userName || 'ไม่ระบุชื่อ'), weight: 'bold', size: 'lg' },
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type: 'text', text: `${sys}/${dia} mmHg`, weight: 'bold', size: 'xxl', color: bp.level === 'crisis' ? '#c0392b' : '#e67e22', flex: 2 },
              { type: 'text', text: bp.th, size: 'sm', color: '#666', flex: 3, wrap: true, gravity: 'center' }
            ]
          },
          { type: 'separator' },
          { type: 'text', text: '🕐 ' + now, size: 'xs', color: '#aaa' }
        ]
      },
      footer: {
        type: 'box', layout: 'vertical',
        contents: [
          {
            type: 'button', style: 'primary',
            color: bp.level === 'crisis' ? '#c0392b' : '#e67e22',
            action: { type: 'uri', label: '📋 ดูข้อมูลผู้ป่วย', uri: `https://liff.line.me/${process.env.LIFF_ID || ''}` }
          }
        ]
      }
    }
  };
}

// ===== SAVE TO GOOGLE SHEETS =====
async function saveToSheet(data) {
  if (!SHEET_URL || SHEET_URL === 'YOUR_GOOGLE_APPS_SCRIPT_URL') return;
  try {
    await axios.post(SHEET_URL, data);
  } catch (e) {
    console.error('Sheet error:', e.message);
  }
}

// ===== GET USER PROFILE =====
async function getUserProfile(userId) {
  try {
    const res = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
      headers: { 'Authorization': `Bearer ${LINE_TOKEN}` }
    });
    return res.data;
  } catch { return { displayName: 'ผู้ใช้', userId }; }
}

// ===== WEBHOOK HANDLER =====
app.post('/webhook', async (req, res) => {
  const sig = req.headers['x-line-signature'];
  if (!verifySignature(req.rawBody, sig)) {
    return res.status(400).send('Bad signature');
  }
  res.sendStatus(200);
  const events = req.body.events || [];

  for (const event of events) {
    try {
      if (event.type !== 'message') continue;
      const userId = event.source.userId;
      const replyToken = event.replyToken;

      // Image message — OCR hint
      if (event.message.type === 'image') {
        await replyMessage(replyToken, [{
          type: 'text',
          text: '📷 ได้รับรูปภาพแล้วครับ\n\nกรุณาพิมพ์ค่าความดันด้วยตัวเลขด้วยนะครับ\nเช่น 120/80 หรือ 120/80/72 (ถ้ามีชีพจร)\n\nระบบจะวิเคราะห์ให้ทันที 🩺'
        }]);
        continue;
      }

      if (event.message.type !== 'text') continue;
      const text = event.message.text.trim();

      // Detect BP pattern: 120/80 or 120/80/72
      const bpMatch = text.match(/^(\d{2,3})[\/\s](\d{2,3})(?:[\/\s](\d{2,3}))?/);

      if (bpMatch) {
        const sys = parseInt(bpMatch[1]);
        const dia = parseInt(bpMatch[2]);
        const pulse = bpMatch[3] ? parseInt(bpMatch[3]) : null;

        // Validate range
        if (sys < 60 || sys > 300 || dia < 40 || dia > 200) {
          await replyMessage(replyToken, [{
            type: 'text', text: '❌ ค่าความดันไม่ถูกต้อง กรุณาตรวจสอบและกรอกใหม่ครับ\nเช่น 120/80'
          }]);
          continue;
        }

        const bp = classifyBP(sys, dia);
        const profile = await getUserProfile(userId);
        const userName = profile.displayName;

        // Reply BP card
        const card = buildBPCard(sys, dia, pulse, bp, userName);
        await replyMessage(replyToken, [card]);

        // Save to Google Sheets
        await saveToSheet({
          userId, userName, sys, dia, pulse,
          level: bp.level, timestamp: new Date().toISOString()
        });

        // Alert อสม. ถ้าความดันสูง
        if (bp.alert && ALERT_USERS.length > 0) {
          const alertCard = buildAlertCard(sys, dia, userName, userId, bp);
          for (const alertUserId of ALERT_USERS) {
            await pushMessage(alertUserId.trim(), [alertCard]);
          }
        }

      } else if (/สวัสดี|หวัดดี|hello|hi/i.test(text)) {
        await replyMessage(replyToken, [{
          type: 'text',
          text: `สวัสดีครับ! 👋\n\nระบบติดตามความดันโลหิต รพ.สต.หนองบอ\n\n📲 วิธีใช้งาน:\n• พิมพ์ค่าความดัน เช่น 120/80\n• หรือส่งรูปภาพผลวัด\n• หรือกดเมนูด้านล่าง`
        }]);

      } else if (/วิธี|ใช้งาน|help|ช่วย/i.test(text)) {
        await replyMessage(replyToken, [{
          type: 'text',
          text: '📖 วิธีใช้งานระบบ:\n\n1️⃣ พิมพ์ค่าความดัน\n   เช่น: 120/80\n   หรือ: 120/80/72 (มีชีพจร)\n\n2️⃣ ส่งรูปภาพผลวัดความดัน\n\n3️⃣ กดเมนูด้านล่าง\n   • ลงทะเบียน\n   • ประเมินสุขภาพ\n   • Dashboard\n   • ติดต่อเจ้าหน้าที่'
        }]);

      } else {
        await replyMessage(replyToken, [{
          type: 'text',
          text: '🩺 พิมพ์ค่าความดันได้เลยครับ\nเช่น 120/80\n\nหรือกดเมนูด้านล่างเพื่อใช้งานระบบ 👇'
        }]);
      }
    } catch (err) {
      console.error('Event error:', err.message);
    }
  }
});

app.get('/', (req, res) => res.send('BP Monitor Webhook — Running ✅'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
