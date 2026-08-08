import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import nodemailer from 'nodemailer';
import crypto from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import { OAuth2Client } from 'google-auth-library';

const required = ['JWT_ACCESS_SECRET','JWT_REFRESH_SECRET','OTP_PEPPER'];
for (const key of required) if (!process.env[key]) throw new Error(`Missing ${key}`);
const env = process.env, app = express();
const origin = env.APP_ORIGIN || 'http://localhost:4173';
const db = new Database(env.DB_FILE || './notin-auth.sqlite');
db.pragma('journal_mode = WAL');
db.exec(`CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,google_sub TEXT UNIQUE NOT NULL,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS otp_challenges(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,code_hash TEXT NOT NULL,expires_at INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,used_at INTEGER,created_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS refresh_tokens(hash TEXT PRIMARY KEY,user_id TEXT NOT NULL,expires_at INTEGER NOT NULL,revoked_at INTEGER,created_at INTEGER NOT NULL);`);
const google = new OAuth2Client(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI);
const mailer = env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASSWORD ? nodemailer.createTransport({host:env.SMTP_HOST,port:Number(env.SMTP_PORT||465),secure:env.SMTP_SECURE !== 'false',auth:{user:env.SMTP_USER,pass:env.SMTP_PASSWORD}}) : null;
const accessKey = new TextEncoder().encode(env.JWT_ACCESS_SECRET), refreshKey = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const sha = (v) => crypto.createHash('sha256').update(v).digest('hex');
const otpHash = (id, code) => sha(`${id}:${code}:${env.OTP_PEPPER}`);
const random = (n=32) => crypto.randomBytes(n).toString('base64url');
const cookieOpts = {httpOnly:true,secure:env.NODE_ENV==='production',sameSite:'lax',path:'/auth'};
async function token(user, key, minutes, type) { return new SignJWT({sub:user.id,email:user.email,type}).setProtectedHeader({alg:'HS256'}).setIssuer(env.JWT_ISSUER||'notin-auth').setAudience('notin-api').setIssuedAt().setExpirationTime(`${minutes}m`).sign(key); }
async function verify(token,key,type) { const r=await jwtVerify(token,key,{issuer:env.JWT_ISSUER||'notin-auth',audience:'notin-api'}); if(r.payload.type!==type) throw Error('Invalid token'); return r.payload; }
function publicUser(u) { return {id:u.id,email:u.email}; }
app.use(helmet()); app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Access-Control-Allow-Credentials','true');res.setHeader('Access-Control-Allow-Headers','Content-Type');if(req.method==='OPTIONS')return res.sendStatus(204);next();}); app.use(express.json({limit:'20kb'})); app.use(cookieParser());
const strict = rateLimit({windowMs:15*60*1000,limit:30,standardHeaders:true,legacyHeaders:false}); app.use('/auth',strict);
const pending = new Map();
app.get('/auth/google', (req,res) => { const state=random(24); pending.set(state,Date.now()+300000); const url=google.generateAuthUrl({access_type:'offline',scope:['openid','email','profile'],state,prompt:'select_account'}); res.redirect(url); });
app.get('/auth/google/callback', async (req,res) => { try { const {code,state}=req.query; if(!code||!state||!pending.has(state)||pending.get(state)<Date.now()) return res.status(400).send('Invalid or expired OAuth state'); pending.delete(state); const {tokens}=await google.getToken(code); const ticket=await google.verifyIdToken({idToken:tokens.id_token,audience:env.GOOGLE_CLIENT_ID}); const p=ticket.getPayload(); if(!p?.sub||!p.email||!p.email_verified) return res.status(403).send('A verified Google email is required'); let user=db.prepare('SELECT * FROM users WHERE google_sub=?').get(p.sub); if(!user) { const id=random(18); db.prepare('INSERT INTO users VALUES(?,?,?,?)').run(id,p.email.toLowerCase(),p.sub,Date.now()); user=db.prepare('SELECT * FROM users WHERE id=?').get(id); } const challenge=await issueOtp(user); res.redirect(`${origin}/?auth=otp&challenge=${encodeURIComponent(challenge)}&email=${encodeURIComponent(user.email)}`); } catch(e) { console.error(e); res.status(401).send('Google authentication failed'); } });
async function issueOtp(user) { if(!mailer) throw Error('SMTP is not configured'); const id=random(18), code=String(crypto.randomInt(0,1000000)).padStart(6,'0'); const now=Date.now(); db.prepare('DELETE FROM otp_challenges WHERE user_id=? OR expires_at<?').run(user.id,now); db.prepare('INSERT INTO otp_challenges VALUES(?,?,?,?,?,?,?)').run(id,user.id,otpHash(id,code),now+5*60*1000,0,null,now); await mailer.sendMail({from:env.MAIL_FROM,to:user.email,subject:'Your Notin sign-in code',text:`Your Notin verification code is ${code}. It expires in 5 minutes and can only be used once.`}); return id; }
app.post('/auth/otp/resend', async (req,res)=>{ const user=db.prepare('SELECT * FROM users WHERE email=?').get(String(req.body.email||'').trim().toLowerCase()); if(user) await issueOtp(user); res.json({ok:true,message:'If the account exists, a new code was sent.'}); });
app.post('/auth/otp/verify', async (req,res)=>{ const {challenge,code}=req.body||{}; if(typeof challenge!=='string'||!/^[0-9]{6}$/.test(String(code))) return res.status(400).json({error:'Invalid code'}); const c=db.prepare('SELECT * FROM otp_challenges WHERE id=?').get(challenge); if(!c||c.used_at||c.expires_at<Date.now()||c.attempts>=5) return res.status(401).json({error:'Invalid or expired code'}); const ok=crypto.timingSafeEqual(Buffer.from(otpHash(challenge,String(code))),Buffer.from(c.code_hash)); db.prepare('UPDATE otp_challenges SET attempts=attempts+1,used_at=? WHERE id=?').run(ok?Date.now():null,challenge); if(!ok) return res.status(401).json({error:'Invalid or expired code'}); const user=db.prepare('SELECT * FROM users WHERE id=?').get(c.user_id); const access=await token(user,accessKey,15,'access'), refresh=random(48); db.prepare('INSERT INTO refresh_tokens VALUES(?,?,?,?,?)').run(sha(refresh),user.id,Date.now()+30*86400000,null,Date.now()); res.cookie('notin_refresh',refresh,{...cookieOpts,maxAge:30*86400000}); res.json({accessToken:access,user:publicUser(user)}); });
app.post('/auth/refresh',async(req,res)=>{try{const raw=req.cookies.notin_refresh;if(!raw)throw Error();const row=db.prepare('SELECT * FROM refresh_tokens WHERE hash=? AND revoked_at IS NULL AND expires_at>?').get(sha(raw),Date.now());if(!row)throw Error();db.prepare('UPDATE refresh_tokens SET revoked_at=? WHERE hash=?').run(Date.now(),sha(raw));const user=db.prepare('SELECT * FROM users WHERE id=?').get(row.user_id), next=random(48);db.prepare('INSERT INTO refresh_tokens VALUES(?,?,?,?,?)').run(sha(next),user.id,Date.now()+30*86400000,null,Date.now());res.cookie('notin_refresh',next,{...cookieOpts,maxAge:30*86400000});res.json({accessToken:await token(user,accessKey,15,'access'),user:publicUser(user)});}catch{res.status(401).json({error:'Invalid session'});}});
app.post('/auth/logout',(req,res)=>{const raw=req.cookies.notin_refresh;if(raw)db.prepare('UPDATE refresh_tokens SET revoked_at=? WHERE hash=?').run(Date.now(),sha(raw));res.clearCookie('notin_refresh',cookieOpts);res.status(204).end();});
app.get('/health',(_,res)=>res.json({ok:true})); app.listen(Number(env.PORT||8787),'0.0.0.0',()=>console.log(`Auth API listening on ${env.PORT||8787}`));
