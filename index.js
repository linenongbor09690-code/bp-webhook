const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

const LINE_TOKEN  = process.env.LINE_TOKEN  || '';
const LINE_SECRET = process.env.LINE_SECRET || '';
const SHEET_URL   = process.env.SHEET_URL   || '';
const LIFF_ID     = process.env.LIFF_ID     || '';

function verifySignature(body, sig) {
  if (!sig || !LINE_SECRET) return true;
  const hash = crypto.createHmac('SHA256', LINE_SECRET).update(body).digest('base64');
  return `sha256=${hash}` === sig;
}

function classifyBP(sys, dia) {
  if (sys >= 180 || dia >= 110) return { level:'crisis', th:'🆘 วิกฤต! ความดันอันตราย', en:'Hypertensive Crisis', message:'⚠️ ค่าความดันวิกฤต!\n\n🚨 โทร 1669 ทันที!\n\n• ปวดหัวรุนแรง\n• เจ็บอก\n• ตาพร่า\n• แขน-ขาอ่อนแรง', alert:true };
  if (sys >= 140 || dia >= 90)  return { level:'stage2', th:'🟠 สงสัยป่วย ความดันสูง', en:'High BP Stage 2', message:'⚠️ ความดันสูงเกินเกณฑ์\n\n• นัดพบแพทย์ใน 1 สัปดาห์\n• วัดซ้ำหลังพัก 15 นาที\n• ลดอาหารเค็ม\n\n📱 แจ้ง อสม. แล้ว', alert:true };
  if (sys >= 130 || dia >= 80)  return { level:'stage1', th:'🟡 กลุ่มเสี่ยง', en:'Elevated BP', message:'⚠️ ความดันสูงกว่าปกติเล็กน้อย\n\n• วัดซ้ำหลังพัก 5 นาที\n• ลดเค็ม ลดไขมัน\n• ออกกำลังกาย', alert:false };
  return { level:'normal', th:'🟢 ความดันปกติ ดีมาก!', en:'Normal BP', message:'✅ ยอดเยี่ยม! ความดันอยู่ในเกณฑ์ปกติ\n\n💪 รักษาสุขภาพต่อไป:\n• ออกกำลังกายสม่ำเสมอ\n• ทานอาหารมีประโยชน์\n• ลดเกลือและไขมัน', alert:false };
}

function buildCard(sys, dia, pulse, bp) {
  const colors = { normal:'#27ae60', stage1:'#e6b800', stage2:'#e67e22', crisis:'#c0392b' };
  const bgs    = { normal:'#e8f8ef', stage1:'#fffae0', stage2:'#fff3e0', crisis:'#fdecea' };
  const c = colors[bp.level], bg = bgs[bp.level];
  const now = new Date().toLocaleString('th-TH',{ timeZone:'Asia/Bangkok', day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  return {
    type:'flex', altText:`ความดัน ${sys}/${dia} — ${bp.th}`,
    contents:{ type:'bubble',
      header:{ type:'box', layout:'vertical', backgroundColor:c, paddingAll:'20px', contents:[
        { type:'text', text:bp.th, weight:'bold', size:'lg', color:'#fff', wrap:true },
        { type:'text', text:bp.en, size:'sm', color:'rgba(255,255,255,0.85)', margin:'sm' }
      ]},
      body:{ type:'box', layout:'vertical', spacing:'md', contents:[
        { type:'box', layout:'horizontal', spacing:'sm', contents:[
          { type:'box', layout:'vertical', flex:1, backgroundColor:bg, cornerRadius:'12px', paddingAll:'12px', contents:[
            { type:'text', text:`${sys}`, weight:'bold', size:'xxl', color:c, align:'center' },
            { type:'text', text:'SYS ตัวบน', size:'xs', color:'#888', align:'center' }
          ]},
          { type:'box', layout:'vertical', flex:1, backgroundColor:bg, cornerRadius:'12px', paddingAll:'12px', contents:[
            { type:'text', text:`${dia}`, weight:'bold', size:'xxl', color:c, align:'center' },
            { type:'text', text:'DIA ตัวล่าง', size:'xs', color:'#888', align:'center' }
          ]},
          { type:'box', layout:'vertical', flex:1, backgroundColor:'#f0f4f8', cornerRadius:'12px', paddingAll:'12px', contents:[
            { type:'text', text: pulse ? `${pulse}` : '-', weight:'bold', size:'xxl', color:'#3498db', align:'center' },
            { type:'text', text:'ชีพจร', size:'xs', color:'#888', align:'center' }
          ]}
        ]},
        { type:'separator' },
        { type:'text', text:bp.message, wrap:true, size:'sm', color:'#444' },
        { type:'separator' },
        { type:'text', text:`🕐 ${now}`, size:'xs', color:'#aaa' }
      ]},
      footer:{ type:'box', layout:'vertical', spacing:'sm', contents:[
        { type:'button', style:'primary', color:c, height:'sm', action:{ type:'uri', label:'📊 ดูกราฟย้อนหลัง', uri:`https://liff.line.me/${LIFF_ID}` }},
        ...(bp.level==='crisis' ? [{ type:'button', style:'primary', color:'#c0392b', height:'sm', action:{ type:'uri', label:'🚑 โทร 1669', uri:'tel:1669' }}] : [])
      ]}
    }
  };
}

async function reply(token, messages) {
  await axios.post('https://api.line.me/v2/bot/message/reply', { replyToken:token, messages }, { headers:{ Authorization:`Bearer ${LINE_TOKEN}` }});
}

async function getProfile(userId) {
  try { const r = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, { headers:{ Authorization:`Bearer ${LINE_TOKEN}` }}); return r.data; }
  catch { return { displayName:'ผู้ใช้' }; }
}

async function saveSheet(data) {
  if (!SHEET_URL) return;
  try { await axios.post(SHEET_URL, data); } catch(e) { console.error('Sheet:',e.message); }
}

app.post('/webhook', async (req, res) => {
  if (!verifySignature(req.rawBody, req.headers['x-line-signature'])) return res.status(400).send('Bad sig');
  res.sendStatus(200);
  for (const event of (req.body.events || [])) {
    try {
      if (event.type !== 'message') continue;
      const uid = event.source.userId, rt = event.replyToken;
      if (event.message.type === 'image') { await reply(rt, [{ type:'text', text:'📷 ได้รับรูปแล้วครับ\nพิมพ์ค่าความดัน เช่น 120/80' }]); continue; }
      if (event.message.type !== 'text') continue;
      const text = event.message.text.trim();
      const m = text.match(/(\d{2,3})[\/\s](\d{2,3})(?:[\/\s](\d{2,3}))?/);
      if (m) {
        const sys=parseInt(m[1]), dia=parseInt(m[2]), pulse=m[3]?parseInt(m[3]):null;
        if (sys<60||sys>300||dia<40||dia>200) { await reply(rt,[{type:'text',text:'❌ ค่าไม่ถูกต้อง เช่น 120/80'}]); continue; }
        const bp = classifyBP(sys, dia);
        const profile = await getProfile(uid);
        await reply(rt, [buildCard(sys, dia, pulse, bp)]);
        await saveSheet({ userId:uid, userName:profile.displayName, sys, dia, pulse, level:bp.level, timestamp:new Date().toISOString() });
      } else if (/สวัสดี|hello|hi/i.test(text)) {
        await reply(rt, [{ type:'text', text:'สวัสดีครับ! 👋\nพิมพ์ค่าความดัน เช่น 120/80\nหรือกดเมนูด้านล่าง' }]);
      } else {
        await reply(rt, [{ type:'text', text:'🩺 พิมพ์ค่าความดันได้เลยครับ\nเช่น 120/80\n\nหรือกดเมนูด้านล่าง 👇' }]);
      }
    } catch(e) { console.error('Err:',e.message); }
  }
});

app.get('/', (req, res) => res.send('BP Webhook ✅'));
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
