const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN || '';
const SHEET_URL  = process.env.SHEET_URL  || '';
const LIFF_ID    = process.env.LIFF_ID    || '';

function classifyBP(sys, dia) {
  if (sys >= 180 || dia >= 110) return { level:'crisis',  th:'🔴 วิกฤต! ความดันอันตราย', message:'🚨 โทร 1669 ทันที!\n• ปวดหัวรุนแรง\n• เจ็บอก\n• ตาพร่า', color:'#c0392b', bg:'#fdecea' };
  if (sys >= 140 || dia >= 90)  return { level:'stage2', th:'🟠 สงสัยป่วย ความดันสูง',   message:'⚠️ นัดพบแพทย์ใน 1 สัปดาห์\n• วัดซ้ำหลังพัก 15 นาที\n• ลดอาหารเค็ม', color:'#e67e22', bg:'#fff3e0' };
  if (sys >= 130 || dia >= 80)  return { level:'stage1', th:'🟡 กลุ่มเสี่ยง',             message:'⚠️ วัดซ้ำหลังพัก 5 นาที\n• ลดเค็ม ลดไขมัน\n• ออกกำลังกาย',    color:'#d4ac0d', bg:'#fffae0' };
  return                               { level:'normal', th:'🟢 ความดันปกติ ดีมาก!',      message:'✅ ยอดเยี่ยม! ความดันปกติ\n💪 รักษาสุขภาพต่อไป:\n• ออกกำลังกายสม่ำเสมอ\n• ทานอาหารมีประโยชน์', color:'#27ae60', bg:'#e8f8ef' };
}

async function reply(token, messages) {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    { replyToken: token, messages: messages },
    { headers: { Authorization: 'Bearer ' + LINE_TOKEN } }
  );
}

async function getProfile(userId) {
  try {
    var r = await axios.get('https://api.line.me/v2/bot/profile/' + userId, { headers: { Authorization: 'Bearer ' + LINE_TOKEN } });
    return r.data;
  } catch(e) { return { displayName: 'ผู้ใช้' }; }
}

async function saveSheet(data) {
  if (!SHEET_URL) return;
  try { await axios.post(SHEET_URL, data); } catch(e) { console.error('Sheet:', e.message); }
}

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  var events = req.body.events || [];
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    try {
      if (event.type !== 'message') continue;
      var userId = event.source.userId;
      var rt = event.replyToken;
      if (event.message.type === 'image') {
        await reply(rt, [{ type:'text', text:'📷 ได้รับรูปแล้วครับ\nพิมพ์ค่าความดัน เช่น 120/80' }]);
        continue;
      }
      if (event.message.type !== 'text') continue;
      var text = event.message.text.trim();
      var m = text.match(/(\d{2,3})[\/\s](\d{2,3})(?:[\/\s](\d{2,3}))?/);
      if (m) {
        var sys = parseInt(m[1]);
        var dia = parseInt(m[2]);
        var pulse = m[3] ? parseInt(m[3]) : null;
        if (sys < 60 || sys > 300 || dia < 40 || dia > 200) {
          await reply(rt, [{ type:'text', text:'❌ ค่าไม่ถูกต้อง เช่น 120/80' }]);
          continue;
        }
        var bp = classifyBP(sys, dia);
        var profile = await getProfile(userId);
        var now = new Date().toLocaleString('th-TH', { timeZone:'Asia/Bangkok' });
        var card = {
          type: 'flex',
          altText: 'ผลความดัน ' + sys + '/' + dia + ' — ' + bp.th,
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical',
              backgroundColor: bp.color, paddingAll: '20px',
              contents: [
                { type: 'text', text: bp.th, weight: 'bold', size: 'lg', color: '#ffffff', wrap: true },
                { type: 'text', text: 'mmHg', size: 'sm', color: 'rgba(255,255,255,0.8)', margin: 'sm' }
              ]
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md',
              contents: [
                {
                  type: 'box', layout: 'horizontal', spacing: 'sm',
                  contents: [
                    { type: 'box', layout: 'vertical', flex: 1, backgroundColor: bp.bg, cornerRadius: '12px', paddingAll: '12px',
                      contents: [
                        { type: 'text', text: String(sys), weight: 'bold', size: 'xxl', color: bp.color, align: 'center' },
                        { type: 'text', text: 'SYS ตัวบน', size: 'xs', color: '#888888', align: 'center' }
                      ]
                    },
                    { type: 'box', layout: 'vertical', flex: 1, backgroundColor: bp.bg, cornerRadius: '12px', paddingAll: '12px',
                      contents: [
                        { type: 'text', text: String(dia), weight: 'bold', size: 'xxl', color: bp.color, align: 'center' },
                        { type: 'text', text: 'DIA ตัวล่าง', size: 'xs', color: '#888888', align: 'center' }
                      ]
                    },
                    { type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#f0f4f8', cornerRadius: '12px', paddingAll: '12px',
                      contents: [
                        { type: 'text', text: pulse ? String(pulse) : '-', weight: 'bold', size: 'xxl', color: '#3498db', align: 'center' },
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
              type: 'box', layout: 'vertical',
              contents: [
                { type: 'button', style: 'primary', color: bp.color, height: 'sm',
                  action: { type: 'uri', label: '📊 ดูกราฟย้อนหลัง', uri: 'https://liff.line.me/' + LIFF_ID } }
              ]
            }
          }
        };
        await reply(rt, [card]);
        await saveSheet({ userId: userId, userName: profile.displayName, sys: sys, dia: dia, pulse: pulse, level: bp.level, timestamp: new Date().toISOString() });
      } else if (/สวัสดี|hello|hi/i.test(text)) {
        await reply(rt, [{ type: 'text', text: 'สวัสดีครับ! 👋\nพิมพ์ค่าความดัน เช่น 120/80\nหรือกดเมนูด้านล่าง' }]);
      } else {
        await reply(rt, [{ type: 'text', text: '🩺 พิมพ์ค่าความดันได้เลยครับ\nเช่น 120/80\n\nหรือกดเมนูด้านล่าง 👇' }]);
      }
    } catch(e) { console.error('Err:', e.message); }
  }
});

app.get('/', function(req, res) { res.send('BP Webhook OK'); });
var PORT = process.env.PORT || 10000;
app.listen(PORT, function() { console.log('Server on port ' + PORT); });
