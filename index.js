const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

const LINE_TOKEN = process.env.LINE_TOKEN || '';
const LIFF_ID = process.env.LIFF_ID || '';
const SHEET_URL = process.env.SHEET_URL || '';

function classifyBP(sys, dia) {
  if (sys >= 180 || dia >= 110) return { level:'crisis', th:'วิกฤต! ความดันอันตราย', message:'โทร 1669 ทันที!\n- ปวดหัวรุนแรง\n- เจ็บอก\n- ตาพร่า', color:'#E74C3C' };
  if (sys >= 140 || dia >= 90)  return { level:'stage2', th:'สงสัยป่วย ความดันสูง', message:'นัดพบแพทย์ใน 1 สัปดาห์\n- วัดซ้ำหลังพัก 15 นาที\n- ลดอาหารเค็ม', color:'#E67E22' };
  if (sys >= 130 || dia >= 80)  return { level:'stage1', th:'กลุ่มเสี่ยง ความดันสูงกว่าปกติ', message:'วัดซ้ำหลังพัก 5 นาที\n- ลดเค็ม ลดไขมัน\n- ออกกำลังกาย', color:'#F39C12' };
  return { level:'normal', th:'ความดันปกติ ดีมาก!', message:'ยอดเยี่ยม! ความดันปกติ\n- ออกกำลังกายสม่ำเสมอ\n- ทานอาหารมีประโยชน์', color:'#27AE60' };
}

function buildCard(sys, dia, pulse, bp) {
  var now = new Date().toLocaleString('th-TH', { timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  return {
    type: 'flex',
    altText: 'ผลความดัน ' + sys + '/' + dia + ' - ' + bp.th,
    contents: {
      type: 'bubble',
      header: {
        type: 'box', layout: 'vertical', backgroundColor: bp.color, paddingAll: '20px',
        contents: [
          { type:'text', text: bp.th, weight:'bold', size:'lg', color:'#FFFFFF', wrap:true },
          { type:'text', text: sys + '/' + dia + ' mmHg', size:'sm', color:'#FFFFFF', margin:'sm' }
        ]
      },
      body: {
        type: 'box', layout: 'vertical', spacing: 'md', paddingAll: '16px',
        contents: [
          {
            type: 'box', layout: 'horizontal', spacing: 'sm',
            contents: [
              { type:'box', layout:'vertical', flex:1, paddingAll:'10px', borderWidth:'1px', borderColor:'#CCCCCC', cornerRadius:'8px',
                contents: [ { type:'text', text:String(sys), weight:'bold', size:'xxl', align:'center', color:bp.color }, { type:'text', text:'SYS', size:'xs', align:'center' } ] },
              { type:'box', layout:'vertical', flex:1, paddingAll:'10px', borderWidth:'1px', borderColor:'#CCCCCC', cornerRadius:'8px',
                contents: [ { type:'text', text:String(dia), weight:'bold', size:'xxl', align:'center', color:bp.color }, { type:'text', text:'DIA', size:'xs', align:'center' } ] },
              { type:'box', layout:'vertical', flex:1, paddingAll:'10px', borderWidth:'1px', borderColor:'#CCCCCC', cornerRadius:'8px',
                contents: [ { type:'text', text: pulse ? String(pulse) : '-', weight:'bold', size:'xxl', align:'center', color:'#2980B9' }, { type:'text', text:'ชีพจร', size:'xs', align:'center' } ] }
            ]
          },
          { type:'separator' },
          { type:'text', text: bp.message, wrap:true, size:'sm' },
          { type:'separator' },
          { type:'text', text: now, size:'xs' }
        ]
      },
      footer: {
        type:'box', layout:'vertical', paddingAll:'12px',
        contents: [ { type:'button', style:'primary', color:bp.color, height:'sm', action:{ type:'uri', label:'ดูกราฟย้อนหลัง', uri:'https://liff.line.me/' + LIFF_ID } } ]
      }
    }
  };
}

async function pushMsg(to, messages) {
  try {
    var r = await axios.post('https://api.line.me/v2/bot/message/push', { to:to, messages:messages }, { headers:{ Authorization:'Bearer ' + LINE_TOKEN } });
    console.log('Push OK:', r.status);
  } catch(e) {
    console.error('Push Err:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  }
}

app.post('/webhook', async function(req, res) {
  res.sendStatus(200);
  for (var i = 0; i < (req.body.events || []).length; i++) {
    var event = req.body.events[i];
    try {
      if (event.type !== 'message') continue;
      var uid = event.source.userId;
      console.log('MSG:', uid, event.message.type, event.message.text || '');
      if (event.message.type === 'image') { await pushMsg(uid, [{ type:'text', text:'ได้รับรูปแล้วครับ\nพิมพ์ค่าความดัน เช่น 120/80' }]); continue; }
      if (event.message.type !== 'text') continue;
      var text = event.message.text.trim();
      var m = text.match(/(\d{2,3})[\/\s](\d{2,3})(?:[\/\s](\d{2,3}))?/);
      if (m) {
        var sys = parseInt(m[1]), dia = parseInt(m[2]), pulse = m[3] ? parseInt(m[3]) : null;
        if (sys < 60 || sys > 300 || dia < 40 || dia > 200) { await pushMsg(uid, [{ type:'text', text:'ค่าไม่ถูกต้อง เช่น 120/80' }]); continue; }
        var bp = classifyBP(sys, dia);
        console.log('BP Result:', sys, '/', dia, '=', bp.level);
        await pushMsg(uid, [buildCard(sys, dia, pulse, bp)]);
        if (SHEET_URL) { try { await axios.post(SHEET_URL, { userId:uid, sys:sys, dia:dia, pulse:pulse, level:bp.level, timestamp:new Date().toISOString() }); } catch(e) {} }
      } else if (/สวัสดี|hello|hi/i.test(text)) {
        await pushMsg(uid, [{ type:'text', text:'สวัสดีครับ!\nพิมพ์ค่าความดัน เช่น 120/80\nหรือกดเมนูด้านล่าง' }]);
      } else {
        await pushMsg(uid, [{ type:'text', text:'พิมพ์ค่าความดันได้เลยครับ เช่น 120/80\n\nกดเมนูด้านล่าง' }]);
      }
    } catch(e) { console.error('Err:', e.message); }
  }
});

app.get('/', function(req, res) { res.send('BP Webhook OK'); });
app.listen(process.env.PORT || 10000, function() { console.log('Server on port ' + (process.env.PORT || 10000)); });
