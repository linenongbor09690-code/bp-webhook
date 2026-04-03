const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const app = express();

app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

// ประกาศ variables ก่อน
const LINE_TOKEN  = process.env.LINE_TOKEN  || '';
const LINE_SECRET = process.env.LINE_SECRET || '';
const SHEET_URL   = process.env.SHEET_URL   || '';
const LIFF_ID     = process.env.LIFF_ID     || '';
const ALERT_USERS = (process.env.ALERT_USERS || '').split(',').filter(Boolean);

// verify signature หลังประกาศ LINE_SECRET แล้ว
function verifySignature(body, sig) {
  if (!sig || !LINE_SECRET) return true;
  const hash = crypto.createHmac('SHA256', LINE_SECRET).update(body).digest('base64');
  return `sha256=${hash}` === sig;
}
