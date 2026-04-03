const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN || '';
const LIFF_ID = process.env.LIFF_ID || '';

function classifyBP(sys, dia) {
  if (sys >= 180 || dia >= 110) return { level:'crisis', th:'🔴 วิกฤต! ความดันอันตราย', message:'🚨 โทร 1669 ทันที!\n• ปวดหัวรุนแรง\n• เจ็บอก\n• ตาพร่า', color:'#c0392b', bg:'#fdecea' };
  if (sys >= 140 || dia >= 90)  return { level:'stage2', th:'🟠 สงสัยป่วย ความดันสูง', message:'⚠️ นัดพบแพทย์ใน 1 สัปดาห์\n• วัดซ้ำหลังพัก 15 นาที\n• ลดอาหารเค็ม', color:'#e67e22', bg:'#fff3e0' };
  if (sys >= 130 || dia >= 80)  return { level:'stage1', th:'🟡 กลุ่มเสี่ยง', message:'⚠️ วัดซ้ำหลังพัก 5 นาที\n• ลดเค็ม ลดไขมัน\n• ออกกำลังกาย', color:'#B7950B', bg:'#fffae0' };
  return { level:'normal', th:'🟢 ความดันปกติ ดีมาก!', message:'✅ ยอดเยี่ยม! ความดันปกติ\n💪 รักษาสุขภาพต่อไป:\n• ออกกำลังกายสม่ำเสมอ\n• ทานอาหารมีประโยชน์', color:'#27ae60', bg:'#e8f8ef' };
}

async function push(to, messages) {
  try {
    var res = await axios.post(
      'https://api.line.me/v2/bot/message/push',
      { to: to, messages: messages },
      { headers: { Authorization: 'Bearer ' + LINE_TOKEN, 'Content-Type': 'application/json' } }
    );
    console.log('Push OK:', res.status);
  } catch(e) {
    console.error('Push Err:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  var events = req.body.events || [];
  for (var i = 0; i < events.length; i++) {
    var event = events[i];
    try {
      if (event.type !== 'message') continue;
      var userId = event.source.userId;
      console.log('MSG from:', userId, ':', event.message.text || event.message.type);

      if (event.message.type === 'image') {
        await push(userId, [{ type:'text', text:'📷 ได้รับรูปแล้วครับ\nพิมพ์ค่าความดัน เช่น 120/80' }]);
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
          await push(userId, [{ type:'text', text:'❌ ค่าไม่ถูกต้อง เช่น 120/80' }]);
          continue;
        }
        var bp = classifyBP(sys, dia);
        var now = new Date().toLocaleString('th-TH', { timeZone:'Asia/Bangkok' });

        var card = {
          type: 'flex',
          altText: 'ความดัน ' + sys + '/' + dia + ' ' + bp.th,
          contents: {
            type: 'bubble',
            header: {
              type: 'box', layout: 'vertical',
              backgroundColor: bp.color, paddingAll: '20px',
              contents: [
                { type: 'text', text: bp.th, weight: 'bold', size: 'lg', color: '#ffffff', wrap: true }
              ]
            },
            body: {
              type: 'box', layout: 'vertical', spacing: 'md',
              contents: [
                {
                  type: 'box', layout: 'horizontal', spacing: 'sm',
                  contents: [
                    { type: 'box', layout: 'vertical', flex: 1, backgroundColor: bp.bg, cornerRadius: '12px', paddingAll: '10px',
                      contents: [
                        { type: 'text', text: String(sys), weight: 'bold', size: 'xxl', color: bp.color, align: 'center' },
                        { type: 'text', text: 'SYS', size: 'xs', color: '#888', align: 'center' }
                      ]
                    },
                    { type: 'box', layout: 'vertical', flex: 1, backgroundColor: bp.bg, cornerRadius: '12px', paddingAll: '10px',
                      contents: [
                        { type: 'text', text: String(dia), weight: 'bold', size: 'xxl', color: bp.color, align: 'center' },
                        { type: 'text', text: 'DIA', size: 'xs', color: '#888', align: 'center' }
                      ]
                    },
                    { type: 'box', layout: 'vertical', flex: 1, backgroundColor: '#f0f4f8', cornerRadius: '12px', paddingAll: '10px',
                      contents: [
                        { type: 'text', text: pulse ? String(pulse) : '-', weight: 'bold', size: 'xxl', color: '#3498db', align: 'center' },
                        { type: 'text', text: 'ชีพจร', size: 'xs', color: '#888', align: 'center' }
                      ]
                    }
                  ]
                },
                { type: 'separator' },
                { type: 'text', text: bp.message, wrap: true, size: 'sm', color: '#444' },
                { type: 'separator' },
                { type: 'text', text: '🕐 ' + now, size: 'xs', color: '#aaa' }
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
        await push(userId, [card]);

      } else if (/สวัสดี|hello|hi/i.test(text)) {
        await push(userId, [{ type:'text', text:'สวัสดีครับ! 👋\nพิมพ์ค่าความดัน เช่น 120/80\nหรือกดเมนูด้านล่าง' }]);
      } else {
        await push(userId, [{ type:'text', text:'🩺 พิมพ์ค่าความดันได้เลยครับ เช่น 120/80\n\nหรือกดเมนูด้านล่าง 👇' }]);
      }
    } catch(e) { console.error('Event Err:', e.message); }
  }
});

app.get('/', function(req, res) { res.send('BP Webhook OK'); });
var PORT = process.env.PORT || 10000;
app.listen(PORT, function() { console.log('Server on port ' + PORT); });
