@echo off
cd /d %~dp0backend
node -e "
require('dotenv').config();
const axios = require('axios');
const user = process.env.OPENSKY_USERNAME;
const pass = process.env.OPENSKY_PASSWORD;
console.log('Testing OpenSky with user:', user);
const now = Math.floor(Date.now()/1000);
axios.get('https://opensky-network.org/api/flights/departure', {
  params: { airport: 'VOBL', begin: now - 6*3600, end: now },
  auth: { username: user, password: pass },
  timeout: 12000
}).then(r => {
  const flights = r.data || [];
  console.log('SUCCESS! Real BLR departures found:', flights.length);
  flights.slice(0,5).forEach(f => {
    const t = new Date(f.firstSeen*1000).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'});
    console.log(' ', (f.callsign||'?').trim(), '->', (f.estArrivalAirport||'?'), 'at', t);
  });
}).catch(e => {
  console.log('FAILED:', e.response ? e.response.status + ' ' + JSON.stringify(e.response.data) : e.message);
  if (e.response && e.response.status === 401) console.log('=> Wrong username or password');
  if (e.response && e.response.status === 403) console.log('=> Account may need email verification - check your inbox');
});
"
pause
