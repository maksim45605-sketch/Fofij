// app.js (ESM)

// ===== Firebase =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, getDocs, query, where,
  onSnapshot, orderBy, serverTimestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth, signInAnonymously, onAuthStateChanged, signOut
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ===== CONFIG: админы (по uid) =====
// Самый простой способ: зайди один раз, посмотри uid в console.log, добавь сюда.
const ADMIN_UIDS = new Set([
  // "PUT_ADMIN_UID_HERE"
]);

// ===== Gifts (редактируй как хочешь) =====
const GIFTS = [
  { id:"rose", title:"Роза", emoji:"🌹", cost:5 },
  { id:"cake", title:"Торт", emoji:"🎂", cost:10 },
  { id:"teddy", title:"Мишка", emoji:"🧸", cost:15 },
  { id:"diamond", title:"Алмаз", emoji:"💎", cost:50 },
];

// ===== DOM =====
const el = (id) => document.getElementById(id);

const sidebar = el("sidebar");
const chatList = el("chatList");
const searchInput = el("searchInput");
const mobileMenuBtn = el("mobileMenuBtn");

const openLoginBtn = el("openLoginBtn");
const loginModal = el("loginModal");
const loginBtn = el("loginBtn");

const phoneInput = el("phoneInput");
const emailInput = el("emailInput");
const firstNameInput = el("firstNameInput");
const lastNameInput = el("lastNameInput");
const usernameInput = el("usernameInput");

const profileBtn = el("profileBtn");
const profileModal = el("profileModal");
const saveEmailBtn = el("saveEmailBtn");
const logoutBtn = el("logoutBtn");
const profileAvatar = el("profileAvatar");
const profileName = el("profileName");
const profileUser = el("profileUser");
const profilePhone = el("profilePhone");
const profileEmail = el("profileEmail");
const profileStars = el("profileStars");
const profilePremium = el("profilePremium");
const profileEmailEdit = el("profileEmailEdit");

const newChatBtn = el("newChatBtn");
const createGroupBtn = el("createGroupBtn");
const createChannelBtn = el("createChannelBtn");

const directModal = el("directModal");
const peerUsernameInput = el("peerUsernameInput");
const createDirectBtn = el("createDirectBtn");

const createRoomModal = el("createRoomModal");
const roomModalTitle = el("roomModalTitle");
const roomNameInput = el("roomNameInput");
const roomDescInput = el("roomDescInput");
const createRoomBtn = el("createRoomBtn");

const giftsBtn = el("giftsBtn");
const starsPill = el("starsPill");
const giftsModal = el("giftsModal");
const giftsGrid = el("giftsGrid");

const messages = el("messages");
const welcome = el("welcome");
const composer = el("composer");
const msgInput = el("msgInput");
const sendBtn = el("sendBtn");

const chatTitle = el("chatTitle");
const chatSubtitle = el("chatSubtitle");
const chatPic = el("chatPic");
const topActions = el("topActions");
const openWebAppBtn = el("openWebAppBtn");

const stickerModal = el("stickerModal");
const openStickerPickerBtn = el("openStickerPickerBtn");
const stickerGrid = el("stickerGrid");
const openStickerCreateBtn = el("openStickerCreateBtn");
const stickerCreateModal = el("stickerCreateModal");
const stickerNameInput = el("stickerNameInput");
const stickerFileInput = el("stickerFileInput");
const saveStickerBtn = el("saveStickerBtn");

const emojiModal = el("emojiModal");
const openEmojiPickerBtn = el("openEmojiPickerBtn");
const emojiGrid = el("emojiGrid");
const openEmojiCreateBtn = el("openEmojiCreateBtn");
const emojiCreateModal = el("emojiCreateModal");
const emojiNameInput = el("emojiNameInput");
const emojiFileInput = el("emojiFileInput");
const saveEmojiBtn = el("saveEmojiBtn");
const premiumPill = el("premiumPill");

const adminBtn = el("adminBtn");
const adminModal = el("adminModal");
const botList = el("botList");
const openBotCreateBtn = el("openBotCreateBtn");
const botEditorModal = el("botEditorModal");
const botNameInput = el("botNameInput");
const botUserInput = el("botUserInput");
const botDescInput = el("botDescInput");
const botWebTitleInput = el("botWebTitleInput");
const botWebUrlInput = el("botWebUrlInput");
const cmdNameInput = el("cmdNameInput");
const cmdReplyInput = el("cmdReplyInput");
const cmdButtonsInput = el("cmdButtonsInput");
const addCmdBtn = el("addCmdBtn");
const saveBotBtn = el("saveBotBtn");

const webAppModal = el("webAppModal");
const webAppTitle = el("webAppTitle");
const webAppFrame = el("webAppFrame");

const toast = el("toast");
const toastTitle = el("toastTitle");
const toastMsg = el("toastMsg");

// ===== Firebase init =====
const firebaseConfig = {
  apiKey: "AIzaSyA7D-OLg2X0mkQq0U-atb9ynEhfyUZ6Wac",
  authDomain: "fofijs.firebaseapp.com",
  projectId: "fofijs",
  storageBucket: "fofijs.firebasestorage.app",
  messagingSenderId: "295288998457",
  appId: "1:295288998457:web:2f8c644520803a2ee11be8",
  measurementId: "G-TCY9EKGEJW"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// ===== State =====
let me = null;             // user profile
let currentChat = null;    // chat object
let unsubChats = null;
let unsubMsgs = null;

let botDraftCommands = []; // editor temp
let editingBotId = null;

// ===== Utils =====
function showToast(message, type="info"){
  toastTitle.textContent = type === "error" ? "Ошибка" : type === "success" ? "Успешно" : "Уведомление";
  toastMsg.textContent = message;
  toast.classList.add("show");
  setTimeout(()=>toast.classList.remove("show"), 2200);
}

function openModal(id){ el(id).classList.add("active"); }
function closeModal(id){ el(id).classList.remove("active"); }

document.addEventListener("click", (e)=>{
  const close = e.target?.dataset?.close;
  if (close) closeModal(close);
  if (e.target.classList.contains("modal-overlay")) e.target.classList.remove("active");
});

mobileMenuBtn.onclick = () => sidebar.classList.toggle("active");

function normUser(u){
  const t = (u||"").trim();
  if(!t) return "";
  return t.startsWith("@") ? t : "@"+t;
}
function isValidUsername(u){
  const raw = u.startsWith("@") ? u.slice(1) : u;
  return /^[A-Za-z0-9_]{3,32}$/.test(raw);
}

function setStarsUI(n){ starsPill.textContent = `⭐ ${n ?? 0}`; }

// ===== Chat IDs =====
// bot:  b_<usernameLowerNoAt>
// direct: d_<uidA>_<uidB> (sorted)
// group: g_<firestoreId> (id already random) but we set prefix on create by storing type
// channel: c_<firestoreId>
function directChatId(uid1, uid2){
  return "d_" + [uid1, uid2].sort().join("_");
}
function botChatId(username){
  const raw = normUser(username).slice(1).toLowerCase();
  return "b_" + raw;
}

// ===== Load profile =====
async function loadMy(uid){
  const ref = doc(db,"users",uid);
  const snap = await getDoc(ref);
  if(!snap.exists()) return null;
  return { uid, ...snap.data() };
}
async function saveMy(profile){
  await setDoc(doc(db,"users",profile.uid), {
    username: profile.username,
    phone: profile.phone || "",
    email: profile.email || "",
    firstName: profile.firstName,
    lastName: profile.lastName,
    stars: profile.stars ?? 100,
    premium: !!profile.premium,
    muted: profile.muted || { active:false, reason:"" }, // для SpamBot
    isAdmin: !!profile.isAdmin,
    updatedAt: serverTimestamp(),
    createdAt: profile.createdAt || serverTimestamp()
  }, { merge:true });
}

async function usernameTaken(username, myUid){
  const qy = query(collection(db,"users"), where("username","==",username));
  const res = await getDocs(qy);
  if(res.empty) return false;
  return res.docs.some(d=>d.id !== myUid);
}

// ===== System bots seed =====
async function ensureSystemBots(){
  // SpamBot
  await upsertBotSystem({
    botId: "spam_bot",
    name: "Спам-бот",
    username: "@SpamBot",
    description: "Через этот бот ты сможешь разблокировать себе чаты",
    verified: true,
    commands: [
      {
        cmd: "/start",
        reply:
`👋 Привет! Я Спам-бот.

Если у тебя мут за спам — ты можешь отправить запрос админам.`,
        buttons: [
          { label:"🟢 Начать", payload:"/start" },
          { label:"📨 Запросить разблокировку", payload:"spambot_unmute_request" }
        ]
      }
    ],
    webApp: null
  });

  // Sticers
  await upsertBotSystem({
    botId: "sticers_bot",
    name: "Sticers",
    username: "@sticers",
    description: "Создавай свои стикеры и делись с друзьями!",
    verified: true,
    commands: [
      {
        cmd: "/start",
        reply:
`👋 Привет! Я Sticers.

Нажми кнопку, чтобы создать стикер.
После сохранения он появится во вкладке “Стикеры”.`,
        buttons: [
          { label:"🟢 Начать", payload:"/start" },
          { label:"➕ Создать стикер", payload:"sticers_create_sticker" }
        ]
      }
    ],
    webApp: { title:"Открыть", url:"https://example.com" } // можешь заменить
  });

  // Чаты ботов (доступны всем)
  await ensureBotChat("@SpamBot", "spam_bot");
  await ensureBotChat("@sticers", "sticers_bot");
}

async function upsertBotSystem(data){
  const ref = doc(db,"bots",data.botId);
  const snap = await getDoc(ref);
  const payload = {
    ownerUid: "system",
    name: data.name,
    username: normUser(data.username),
    description: data.description,
    verified: !!data.verified,
    webApp: data.webApp || null,
    // commands as map for fast access
    commands: (data.commands||[]).reduce((acc,c)=>{
      acc[c.cmd] = {
        reply: c.reply,
        buttons: c.buttons || []
      };
      return acc;
    }, {}),
    updatedAt: serverTimestamp(),
    createdAt: snap.exists() ? snap.data().createdAt || serverTimestamp() : serverTimestamp()
  };
  await setDoc(ref, payload, { merge:true });
}

async function ensureBotChat(botUsername, botId){
  const chatId = botChatId(botUsername);
  const ref = doc(db,"chats",chatId);
  const snap = await getDoc(ref);
  if(snap.exists()) return;

  await setDoc(ref,{
    type: "bot",
    title: normUser(botUsername),
    botId,
    members: [],     // для бота не нужен список
    ownerUid: "system",
    createdAt: serverTimestamp(),
    lastMessage: "Нажмите /start",
    lastMessageAt: serverTimestamp()
  });
}

// ===== UI render chats =====
function renderChatItem(chat){
  const div = document.createElement("div");
  div.className = "chat" + (currentChat?.id === chat.id ? " active":"");

  const typeBadge =
    chat.type === "bot" ? "BOT" :
    chat.type === "channel" ? "KANAL" :
    chat.type === "group" ? "GRUPPA" : "CHAT";

  const icon =
    chat.type === "bot" ? "🤖" :
    chat.type === "channel" ? "📢" :
    chat.type === "group" ? "👥" : (chat.title||"?").charAt(0).toUpperCase();

  let verify = "";
  if(chat.type==="bot" && chat.botVerified){
    verify = `<span class="verify"><i class="fa fa-check-circle"></i> подтверждён</span>`;
  }

  div.innerHTML = `
    <div class="chatpic">${icon}</div>
    <div class="chatmeta">
      <div class="chatname">${chat.displayTitle || chat.title || "Чат"} ${verify}</div>
      <div class="chatsub">${chat.lastMessage || "Нет сообщений"}</div>
    </div>
    <div class="badge">${typeBadge}</div>
  `;

  div.onclick = () => openChat(chat.id);
  return div;
}

function setChatHeader(chat){
  chatTitle.textContent = chat.displayTitle || chat.title || "Чат";
  chatSubtitle.textContent =
    chat.type === "bot" ? "бот" :
    chat.type === "channel" ? "канал" :
    chat.type === "group" ? "группа" : "онлайн";

  chatPic.textContent =
    chat.type === "bot" ? "🤖" :
    chat.type === "channel" ? "📢" :
    chat.type === "group" ? "👥" :
    (chat.displayTitle || chat.title || "?").charAt(0).toUpperCase();

  // webapp button visible only if bot has webApp
  openWebAppBtn.style.display = chat.botWebApp ? "flex" : "none";
  topActions.style.display = "flex";
}

// ===== Listen chats =====
function listenChats(){
  if(unsubChats) unsubChats();

  // показываем:
  // - direct/group/channel где я участник (members contains my uid)
  // - ботов: просто подписка на коллекцию chats где type==bot (public)
  const qMy = query(collection(db,"chats"), where("members","array-contains", me.uid));
  const qBots = query(collection(db,"chats"), where("type","==","bot"));

  let myChats = [];
  let botChats = [];

  const rerender = async ()=>{
    const term = (searchInput.value||"").trim().toLowerCase();
    const merged = [...botChats, ...myChats];

    // сортировка по времени
    merged.sort((a,b)=>{
      const ta = a.lastMessageAt?.toMillis?.() ?? 0;
      const tb = b.lastMessageAt?.toMillis?.() ?? 0;
      return tb - ta;
    });

    chatList.innerHTML = "";
    for(const c of merged){
      const title = (c.displayTitle || c.title || "").toLowerCase();
      const preview = (c.lastMessage || "").toLowerCase();
      if(term && !title.includes(term) && !preview.includes(term)) continue;
      chatList.appendChild(renderChatItem(c));
    }
  };

  const unsub1 = onSnapshot(qMy, async (snap)=>{
    myChats = await hydrateChats(snap);
    rerender();
  });

  const unsub2 = onSnapshot(qBots, async (snap)=>{
    botChats = await hydrateChats(snap);
    rerender();
  });

  unsubChats = ()=>{ unsub1(); unsub2(); };

  searchInput.oninput = rerender;
}

async function hydrateChats(snap){
  const res = [];
  for(const d of snap.docs){
    const c = { id:d.id, ...d.data() };

    // direct: покажем имя собеседника
    if(c.type === "direct"){
      const peerUid = c.members.find(x=>x!==me.uid);
      if(peerUid){
        const ps = await getDoc(doc(db,"users",peerUid));
        if(ps.exists()){
          const p = ps.data();
          c.displayTitle = `${p.firstName} ${p.lastName}`.trim() || p.username;
        }
      }
    }

    // bot: подтянуть верификацию/вебапп
    if(c.type === "bot" && c.botId){
      const bs = await getDoc(doc(db,"bots",c.botId));
      if(bs.exists()){
        const b = bs.data();
        c.displayTitle = `${b.name}`;
        c.botVerified = !!b.verified;
        c.botWebApp = b.webApp || null;
      }
    }

    res.push(c);
  }
  return res;
}

// ===== Messages =====
function formatTime(ts){
  if(!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], {hour:"2-digit", minute:"2-digit"});
}

function escapeHtml(s){
  return (s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;");
}

function msgNode(m){
  const wrap = document.createElement("div");
  const out = (m.senderUid && m.senderUid === me.uid);
  wrap.className = "msg " + (out ? "out":"in");

  // bot-style
  if(m.kind === "botcard"){
    wrap.innerHTML = `
      <div class="bubble botcard" style="max-width:100%;">
        <div>${m.html}</div>
        <div class="meta">${formatTime(m.createdAt)}</div>
      </div>
    `;
    // кнопки отдельным блоком
    if(m.buttons && m.buttons.length){
      const btns = document.createElement("div");
      btns.className = "botbtns";
      m.buttons.forEach(b=>{
        const bt = document.createElement("button");
        bt.className = "botbtn" + (b.green ? " green":"");
        bt.textContent = b.label;
        bt.onclick = ()=> onBotButton(b.payload);
        btns.appendChild(bt);
      });
      wrap.querySelector(".bubble").appendChild(btns);
    }
    return wrap;
  }

  // sticker
  if(m.kind === "sticker"){
    wrap.innerHTML = `
      <div class="bubble">
        <img src="${m.dataUrl}" alt="sticker" style="max-width:220px; max-height:220px; display:block;">
        <div class="meta">${formatTime(m.createdAt)}</div>
      </div>
    `;
    return wrap;
  }

  // emoji (animated)
  if(m.kind === "emoji"){
    wrap.innerHTML = `
      <div class="bubble">
        <img src="${m.dataUrl}" alt="emoji" style="width:72px; height:72px; object-fit:contain; display:block;">
        <div class="meta">${formatTime(m.createdAt)}</div>
      </div>
    `;
    return wrap;
  }

  // gift
  if(m.kind === "gift"){
    wrap.innerHTML = `
      <div class="bubble">
        <div style="font-weight:950">${m.giftEmoji} ${escapeHtml(m.giftTitle)}</div>
        <div class="hint">Стоимость: ⭐ ${m.giftCost}</div>
        <div class="meta">${formatTime(m.createdAt)}</div>
      </div>
    `;
    return wrap;
  }

  // text
  const text = escapeHtml(m.text||"").replaceAll("\n","<br>");
  wrap.innerHTML = `
    <div class="bubble">
      <div>${text}</div>
      <div class="meta">${formatTime(m.createdAt)}</div>
    </div>
  `;
  return wrap;
}

function listenMessages(chatId){
  if(unsubMsgs) unsubMsgs();
  const qy = query(collection(db,"chats",chatId,"messages"), orderBy("createdAt","asc"));
  unsubMsgs = onSnapshot(qy, (snap)=>{
    messages.innerHTML = "";
    snap.docs.forEach(d=>{
      messages.appendChild(msgNode(d.data()));
    });
    messages.scrollTop = messages.scrollHeight;
  });
}

async function openChat(chatId){
  const cs = await getDoc(doc(db,"chats",chatId));
  if(!cs.exists()) return;
  const c = { id: chatId, ...cs.data() };

  // hydrate bot data for header
  if(c.type === "bot" && c.botId){
    const bs = await getDoc(doc(db,"bots",c.botId));
    if(bs.exists()){
      const b = bs.data();
      c.displayTitle = b.name;
      c.botVerified = !!b.verified;
      c.botWebApp = b.webApp || null;
    }
  }

  currentChat = c;
  setChatHeader(c);

  welcome.style.display = "none";
  composer.style.display = "flex";
  msgInput.value = "";
  sendBtn.disabled = true;

  // webapp handler
  openWebAppBtn.onclick = ()=>{
    if(!currentChat?.botWebApp) return;
    webAppTitle.textContent = currentChat.botWebApp.title || "Открыть";
    webAppFrame.src = currentChat.botWebApp.url || "about:blank";
    openModal("webAppModal");
  };

  // mobile hide
  if(window.innerWidth < 900) sidebar.classList.remove("active");

  listenMessages(chatId);

  // автосообщение в бот-чате если пусто
  if(c.type === "bot"){
    const msgs = await getDocs(query(collection(db,"chats",chatId,"messages")));
    if(msgs.empty){
      await sendBotCardToChat(chatId, c.botId, "/start", true);
    }
  }
}

// ===== Send text =====
msgInput.addEventListener("input", ()=>{
  msgInput.style.height = "auto";
  msgInput.style.height = Math.min(msgInput.scrollHeight, 160) + "px";
  sendBtn.disabled = msgInput.value.trim().length === 0;
});

msgInput.addEventListener("keydown", (e)=>{
  if(e.key==="Enter" && !e.shiftKey){
    e.preventDefault();
    sendText();
  }
});

sendBtn.onclick = sendText;

async function sendText(){
  if(!me) return showToast("Сначала войдите.", "error");
  if(!currentChat) return;

  const text = msgInput.value.trim();
  if(!text) return;

  // в канале писать может только владелец
  if(currentChat.type === "channel" && currentChat.ownerUid !== me.uid){
    showToast("В канал может писать только владелец.", "error");
    return;
  }

  msgInput.value = "";
  sendBtn.disabled = true;

  // если пишем боту — обработка команд
  if(currentChat.type === "bot"){
    await addDoc(collection(db,"chats",currentChat.id,"messages"), {
      kind:"text",
      text,
      senderUid: me.uid,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db,"chats",currentChat.id), {
      lastMessage: text,
      lastMessageAt: serverTimestamp()
    });

    // bot logic
    await handleBotText(text);
    return;
  }

  // обычный чат/группа/канал
  await addDoc(collection(db,"chats",currentChat.id,"messages"), {
    kind:"text",
    text,
    senderUid: me.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db,"chats",currentChat.id), {
    lastMessage: text,
    lastMessageAt: serverTimestamp()
  });
}

// ===== Bot engine =====
async function handleBotText(text){
  const cmd = text.trim().split(/\s+/)[0];
  if(!cmd.startsWith("/")) return;

  await sendBotCardToChat(currentChat.id, currentChat.botId, cmd, false);
}

async function sendBotCardToChat(chatId, botId, cmd, silent){
  const bs = await getDoc(doc(db,"bots",botId));
  if(!bs.exists()) return;

  const b = bs.data();
  const entry = b.commands?.[cmd];

  // если команда неизвестна
  if(!entry){
    if(!silent){
      await addDoc(collection(db,"chats",chatId,"messages"), {
        kind:"botcard",
        html: `Команда <b>${escapeHtml(cmd)}</b> не найдена.`,
        buttons: [],
        createdAt: serverTimestamp()
      });
      await updateDoc(doc(db,"chats",chatId), {
        lastMessage: `бот: неизвестная команда ${cmd}`,
        lastMessageAt: serverTimestamp()
      });
    }
    return;
  }

  // Спец-логика SpamBot
  if(b.username?.toLowerCase() === "@spambot" && cmd === "/start"){
    // если мут
    const muted = !!me?.muted?.active;
    const reason = me?.muted?.reason || "спам";
    const html = muted
      ? `⚠️ У тебя активен мут за <b>${escapeHtml(reason)}</b>.<br>Нажми кнопку ниже, чтобы отправить запрос админам на разблокировку.`
      : `✅ У тебя нет блокировки чата.`;

    const buttons = muted ? [
      { label:"📨 Запросить разблокировку", payload:"spambot_unmute_request", green:true }
    ] : [];

    await addDoc(collection(db,"chats",chatId,"messages"), {
      kind:"botcard",
      html,
      buttons,
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db,"chats",chatId), {
      lastMessage: muted ? "бот: мут обнаружен" : "бот: блокировки нет",
      lastMessageAt: serverTimestamp()
    });
    return;
  }

  // Спец-логика Sticers: /start
  if(b.username?.toLowerCase() === "@sticers" && cmd === "/start"){
    await addDoc(collection(db,"chats",chatId,"messages"), {
      kind:"botcard",
      html: escapeHtml(entry.reply).replaceAll("\n","<br>"),
      buttons: [
        { label:"➕ Создать стикер", payload:"sticers_create_sticker", green:true }
      ],
      createdAt: serverTimestamp()
    });

    await updateDoc(doc(db,"chats",chatId), {
      lastMessage: "бот: создание стикеров",
      lastMessageAt: serverTimestamp()
    });
    return;
  }

  // обычный бот
  await addDoc(collection(db,"chats",chatId,"messages"), {
    kind:"botcard",
    html: escapeHtml(entry.reply).replaceAll("\n","<br>"),
    buttons: entry.buttons || [],
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db,"chats",chatId), {
    lastMessage: `бот: ${cmd}`,
    lastMessageAt: serverTimestamp()
  });
}

async function onBotButton(payload){
  if(!payload) return;

  // webapp
  if(payload === "webapp"){
    if(currentChat?.botWebApp){
      webAppTitle.textContent = currentChat.botWebApp.title || "Открыть";
      webAppFrame.src = currentChat.botWebApp.url || "about:blank";
      openModal("webAppModal");
    } else {
      showToast("У бота нет привязанного сайта.", "error");
    }
    return;
  }

  // Spambot request
  if(payload === "spambot_unmute_request"){
    if(!me?.muted?.active){
      await addDoc(collection(db,"chats",currentChat.id,"messages"), {
        kind:"botcard",
        html: "✅ У тебя нет блокировки чата.",
        buttons: [],
        createdAt: serverTimestamp()
      });
      return;
    }

    await addDoc(collection(db,"admin_requests"), {
      kind: "unmute_request",
      fromUid: me.uid,
      fromUsername: me.username,
      phone: me.phone || "",
      email: me.email || "",
      reason: me.muted.reason || "спам",
      createdAt: serverTimestamp(),
      status: "new"
    });

    await addDoc(collection(db,"chats",currentChat.id,"messages"), {
      kind:"botcard",
      html: "📨 Запрос админам отправлен. Ожидай ответа.",
      buttons: [],
      createdAt: serverTimestamp()
    });

    showToast("Заявка отправлена админам.", "success");
    return;
  }

  // Sticers create sticker
  if(payload === "sticers_create_sticker"){
    openModal("stickerCreateModal");
    return;
  }

  // если payload — команда (/start и т.п.)
  if(payload.startsWith("/")){
    // имитируем ввод команды
    await addDoc(collection(db,"chats",currentChat.id,"messages"), {
      kind:"text",
      text: payload,
      senderUid: me.uid,
      createdAt: serverTimestamp()
    });
    await updateDoc(doc(db,"chats",currentChat.id), {
      lastMessage: payload,
      lastMessageAt: serverTimestamp()
    });
    await handleBotText(payload);
  }
}

// ===== Sticker system =====
openStickerPickerBtn.onclick = async ()=>{
  if(!me) return openModal("loginModal");
  if(!currentChat) return showToast("Выберите чат.", "error");
  await renderStickers();
  openModal("stickerModal");
};

openStickerCreateBtn.onclick = ()=> openModal("stickerCreateModal");

async function renderStickers(){
  stickerGrid.innerHTML = "";
  const qy = query(collection(db,"stickers"), where("ownerUid","==", me.uid));
  const res = await getDocs(qy);

  if(res.empty){
    stickerGrid.innerHTML = `<div class="hint">У тебя пока нет стикеров. Нажми “Создать”.</div>`;
    return;
  }

  res.docs.forEach(d=>{
    const s = d.data();
    const div = document.createElement("div");
    div.className = "stk";
    div.innerHTML = `
      <img src="${s.dataUrl}" alt="sticker">
      <div class="name">${escapeHtml(s.name)}</div>
    `;
    div.onclick = ()=> sendSticker(s);
    stickerGrid.appendChild(div);
  });
}

saveStickerBtn.onclick = async ()=>{
  if(!me) return;
  const name = stickerNameInput.value.trim();
  const file = stickerFileInput.files?.[0];
  if(!name || !file) return showToast("Название и файл обязательны.", "error");

  const dataUrl = await fileToDataUrl(file);

  await addDoc(collection(db,"stickers"), {
    ownerUid: me.uid,
    ownerUsername: me.username,
    name,
    dataUrl,
    createdAt: serverTimestamp()
  });

  stickerNameInput.value = "";
  stickerFileInput.value = "";
  closeModal("stickerCreateModal");

  showToast("Стикер сохранён!", "success");
  await renderStickers();
};

async function sendSticker(sticker){
  if(!currentChat) return;

  // в канал отправлять может только владелец
  if(currentChat.type === "channel" && currentChat.ownerUid !== me.uid){
    showToast("Стикеры в канал может отправлять только владелец.", "error");
    return;
  }

  // в боте — не отправляем как в “реальный чат” (можно разрешить, но это не нужно)
  if(currentChat.type === "bot"){
    showToast("Стикер отправляй в обычные чаты/группы/каналы.", "error");
    return;
  }

  await addDoc(collection(db,"chats",currentChat.id,"messages"), {
    kind:"sticker",
    dataUrl: sticker.dataUrl,
    stickerName: sticker.name,
    senderUid: me.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db,"chats",currentChat.id), {
    lastMessage: "🙂 Стикер",
    lastMessageAt: serverTimestamp()
  });

  closeModal("stickerModal");
}

// ===== Emoji / Premium =====
openEmojiPickerBtn.onclick = async ()=>{
  if(!me) return openModal("loginModal");
  if(!currentChat) return showToast("Выберите чат.", "error");
  await renderEmojis();
  premiumPill.textContent = me.premium ? "да" : "нет";
  openModal("emojiModal");
};

openEmojiCreateBtn.onclick = ()=>{
  if(!me?.premium){
    showToast("Создание аним. эмодзи доступно только Premium.", "error");
    return;
  }
  openModal("emojiCreateModal");
};

async function renderEmojis(){
  emojiGrid.innerHTML = "";

  const qy = query(collection(db,"emojis"), where("ownerUid","==", me.uid));
  const res = await getDocs(qy);

  if(res.empty){
    emojiGrid.innerHTML = `<div class="hint">Нет эмодзи. Premium может создать свои.</div>`;
    return;
  }

  res.docs.forEach(d=>{
    const s = d.data();
    const div = document.createElement("div");
    div.className = "emoitem";
    div.innerHTML = `
      <img src="${s.dataUrl}" alt="emoji">
      <div class="name">${escapeHtml(s.name)}</div>
    `;
    div.onclick = ()=> sendEmoji(s);
    emojiGrid.appendChild(div);
  });
}

saveEmojiBtn.onclick = async ()=>{
  if(!me?.premium) return;

  const name = emojiNameInput.value.trim();
  const file = emojiFileInput.files?.[0];
  if(!name || !file) return showToast("Название и файл обязательны.", "error");

  const dataUrl = await fileToDataUrl(file);

  await addDoc(collection(db,"emojis"), {
    ownerUid: me.uid,
    ownerUsername: me.username,
    name,
    dataUrl,
    createdAt: serverTimestamp()
  });

  emojiNameInput.value = "";
  emojiFileInput.value = "";
  closeModal("emojiCreateModal");

  showToast("Эмодзи сохранён!", "success");
  await renderEmojis();
};

async function sendEmoji(emoji){
  if(!currentChat) return;

  // в канал — только владелец
  if(currentChat.type === "channel" && currentChat.ownerUid !== me.uid){
    showToast("В канал может писать только владелец.", "error");
    return;
  }

  if(currentChat.type === "bot"){
    showToast("Эмодзи отправляй в обычные чаты/группы/каналы.", "error");
    return;
  }

  await addDoc(collection(db,"chats",currentChat.id,"messages"), {
    kind:"emoji",
    dataUrl: emoji.dataUrl,
    emojiName: emoji.name,
    senderUid: me.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(doc(db,"chats",currentChat.id), {
    lastMessage: "⭐ Эмодзи",
    lastMessageAt: serverTimestamp()
  });

  closeModal("emojiModal");
}

// ===== Gifts =====
giftsBtn.onclick = ()=>{
  if(!me) return openModal("loginModal");
  renderGifts();
  openModal("giftsModal");
};

function renderGifts(){
  giftsGrid.innerHTML = "";
  GIFTS.forEach(g=>{
    const div = document.createElement("div");
    div.className = "gift";
    div.innerHTML = `
      <div class="emo">${g.emoji}</div>
      <div>
        <div class="gtitle">${g.title}</div>
        <div class="gcost">Стоимость: ⭐ ${g.cost}</div>
      </div>
      <button class="btn ghost" style="padding:10px 12px" data-id="${g.id}">Отправить</button>
    `;
    div.querySelector("button").onclick = ()=> sendGift(g);
    giftsGrid.appendChild(div);
  });
}

async function sendGift(gift){
  if(!currentChat) return showToast("Выберите чат.", "error");
  if(currentChat.type === "bot") return showToast("Подарки отправляй в обычные чаты.", "error");

  // канал: только владелец может “писать”
  if(currentChat.type === "channel" && currentChat.ownerUid !== me.uid){
    showToast("В канал может писать только владелец.", "error");
    return;
  }

  try{
    await runTransaction(db, async (tx)=>{
      const meRef = doc(db,"users",me.uid);
      const meSnap = await tx.get(meRef);
      const stars = meSnap.data()?.stars ?? 0;
      if(stars < gift.cost) throw new Error("NOT_ENOUGH");

      tx.update(meRef, { stars: stars - gift.cost });

      const msgRef = doc(collection(db,"chats",currentChat.id,"messages"));
      tx.set(msgRef, {
        kind:"gift",
        giftId: gift.id,
        giftTitle: gift.title,
        giftEmoji: gift.emoji,
        giftCost: gift.cost,
        senderUid: me.uid,
        createdAt: serverTimestamp()
      });

      tx.update(doc(db,"chats",currentChat.id), {
        lastMessage: `${gift.emoji} ${gift.title} (⭐ ${gift.cost})`,
        lastMessageAt: serverTimestamp()
      });
    });

    me = await loadMy(me.uid);
    setStarsUI(me.stars);
    showToast("Подарок отправлен!", "success");
    closeModal("giftsModal");
  }catch(e){
    if(e.message==="NOT_ENOUGH") showToast("Недостаточно звёзд.", "error");
    else { console.error(e); showToast("Ошибка отправки.", "error"); }
  }
}

// ===== Rooms create =====
newChatBtn.onclick = ()=>{ if(!me) return openModal("loginModal"); openModal("directModal"); };
createDirectBtn.onclick = ()=> createOrOpenDirect(peerUsernameInput.value);

let roomType = "group";
createGroupBtn.onclick = ()=>{
  if(!me) return openModal("loginModal");
  roomType = "group";
  roomModalTitle.textContent = "Создать группу";
  roomNameInput.value = ""; roomDescInput.value = "";
  openModal("createRoomModal");
};
createChannelBtn.onclick = ()=>{
  if(!me) return openModal("loginModal");
  roomType = "channel";
  roomModalTitle.textContent = "Создать канал";
  roomNameInput.value = ""; roomDescInput.value = "";
  openModal("createRoomModal");
};
createRoomBtn.onclick = ()=> createRoom(roomType);

async function createOrOpenDirect(peerUsernameRaw){
  const peerUsername = normUser(peerUsernameRaw);
  if(!isValidUsername(peerUsername)) return showToast("Некорректный username.", "error");

  const qy = query(collection(db,"users"), where("username","==", peerUsername));
  const res = await getDocs(qy);
  if(res.empty) return showToast("Пользователь не найден.", "error");

  const peerDoc = res.docs[0];
  const peerUid = peerDoc.id;
  if(peerUid === me.uid) return showToast("Нельзя чат с собой.", "error");

  const chatId = directChatId(me.uid, peerUid);
  const ref = doc(db,"chats",chatId);
  const snap = await getDoc(ref);

  if(!snap.exists()){
    await setDoc(ref,{
      type:"direct",
      members:[me.uid, peerUid],
      ownerUid: me.uid,
      title:"direct",
      createdAt: serverTimestamp(),
      lastMessage:"Чат создан",
      lastMessageAt: serverTimestamp()
    });
  }

  closeModal("directModal");
  await openChat(chatId);
}

async function createRoom(type){
  const title = roomNameInput.value.trim();
  const desc = roomDescInput.value.trim();
  if(!title) return showToast("Введите название.", "error");

  // создаём doc с auto-id, но type хранится внутри
  const newRef = doc(collection(db,"chats"));
  const id = newRef.id;

  await setDoc(newRef,{
    type,
    members:[me.uid],
    ownerUid: me.uid,
    title,
    description: desc,
    createdAt: serverTimestamp(),
    lastMessage: type==="channel" ? "Канал создан" : "Группа создана",
    lastMessageAt: serverTimestamp()
  });

  closeModal("createRoomModal");
  await openChat(id);
}

// ===== Profile =====
profileBtn.onclick = ()=>{
  if(!me) return openModal("loginModal");
  profileAvatar.textContent = (me.firstName || "F").charAt(0).toUpperCase();
  profileName.textContent = `${me.firstName} ${me.lastName}`.trim();
  profileUser.textContent = me.username || "";
  profilePhone.textContent = `📞 ${me.phone || "—"}`;
  profileEmail.textContent = `✉️ ${me.email || "—"}`;
  profileStars.textContent = `⭐ ${me.stars ?? 0}`;
  profilePremium.textContent = `Premium: ${me.premium ? "да" : "нет"}`;

  profileEmailEdit.value = me.email || "";
  openModal("profileModal");
};

saveEmailBtn.onclick = async ()=>{
  if(!me) return;
  const email = profileEmailEdit.value.trim();
  await updateDoc(doc(db,"users",me.uid), { email, updatedAt: serverTimestamp() });
  me = await loadMy(me.uid);
  showToast("Email сохранён.", "success");
};

logoutBtn.onclick = async ()=>{
  await signOut(auth);
  location.reload();
};

// ===== Login / phone =====
openLoginBtn.onclick = ()=> openModal("loginModal");

loginBtn.onclick = async ()=>{
  if(!me) return;

  const phone = phoneInput.value.trim();
  const email = emailInput.value.trim();
  const first = firstNameInput.value.trim();
  const last = lastNameInput.value.trim();
  const username = normUser(usernameInput.value.trim());

  if(!phone || !first || !last || !usernameInput.value.trim()){
    return showToast("Телефон, имя, фамилия и username обязательны.", "error");
  }
  if(!isValidUsername(username)){
    return showToast("Username: 3-32, A-Z/0-9/_", "error");
  }
  if(await usernameTaken(username, me.uid)){
    return showToast("Этот username уже занят.", "error");
  }

  const isAdmin = ADMIN_UIDS.has(me.uid);
  const profile = {
    uid: me.uid,
    phone,
    email,
    firstName: first,
    lastName: last,
    username,
    stars: me.stars ?? 100,
    premium: me.premium ?? false,
    isAdmin
  };

  await saveMy(profile);
  me = await loadMy(me.uid);

  setStarsUI(me.stars);
  adminBtn.style.display = me.isAdmin ? "flex" : "none";

  closeModal("loginModal");
  showToast(`Добро пожаловать, ${me.firstName}!`, "success");

  welcome.style.display = "none";
  listenChats();
};

// ===== Admin bot builder =====
adminBtn.onclick = async ()=>{
  if(!me?.isAdmin) return showToast("Доступ запрещён.", "error");
  await renderBotList();
  openModal("adminModal");
};

openBotCreateBtn.onclick = ()=>{
  editingBotId = null;
  botDraftCommands = [];
  botNameInput.value = "";
  botUserInput.value = "@";
  botDescInput.value = "";
  botWebTitleInput.value = "Открыть";
  botWebUrlInput.value = "https://example.com";
  cmdNameInput.value = "/start";
  cmdReplyInput.value = "Привет!";
  cmdButtonsInput.value = "Открыть|webapp";
  openModal("botEditorModal");
};

addCmdBtn.onclick = ()=>{
  const cmd = cmdNameInput.value.trim();
  const reply = cmdReplyInput.value.trim();
  const buttonsRaw = cmdButtonsInput.value.trim();

  if(!cmd.startsWith("/")) return showToast("Команда должна начинаться с /", "error");
  if(!reply) return showToast("Ответ обязателен.", "error");

  const buttons = [];
  if(buttonsRaw){
    buttonsRaw.split("\n").forEach(line=>{
      const t = line.trim();
      if(!t) return;
      const [label, payload] = t.split("|").map(x=>x?.trim());
      if(label && payload) buttons.push({ label, payload });
    });
  }
  botDraftCommands.push({ cmd, reply, buttons });
  showToast("Команда добавлена (в черновик).", "success");
};

saveBotBtn.onclick = async ()=>{
  if(!me?.isAdmin) return;

  const name = botNameInput.value.trim();
  const username = normUser(botUserInput.value.trim());
  const desc = botDescInput.value.trim();
  const webTitle = botWebTitleInput.value.trim();
  const webUrl = botWebUrlInput.value.trim();

  if(!name || !isValidUsername(username) || !desc){
    return showToast("Заполните имя/username/описание корректно.", "error");
  }

  const botId = editingBotId || ("bot_" + username.slice(1).toLowerCase());
  const commandsMap = botDraftCommands.reduce((acc,c)=>{
    acc[c.cmd] = { reply: c.reply, buttons: c.buttons || [] };
    return acc;
  }, {});

  await setDoc(doc(db,"bots",botId), {
    ownerUid: me.uid,
    name,
    username,
    description: desc,
    verified: true, // админ создаёт — сразу “галочка”
    webApp: webUrl ? { title: webTitle || "Открыть", url: webUrl } : null,
    commands: commandsMap,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  }, { merge:true });

  // создать чат-бот (public)
  const chatId = botChatId(username);
  const cref = doc(db,"chats",chatId);
  const cs = await getDoc(cref);
  if(!cs.exists()){
    await setDoc(cref,{
      type:"bot",
      title: username,
      botId,
      members: [],
      ownerUid: me.uid,
      createdAt: serverTimestamp(),
      lastMessage: "Нажмите /start",
      lastMessageAt: serverTimestamp()
    });
  }else{
    await updateDoc(cref, { botId, lastMessageAt: serverTimestamp() });
  }

  closeModal("botEditorModal");
  showToast("Бот сохранён!", "success");
  await renderBotList();
};

async function renderBotList(){
  botList.innerHTML = "";
  const res = await getDocs(collection(db,"bots"));

  res.docs.forEach(d=>{
    const b = d.data();
    const mine = b.ownerUid === me.uid || b.ownerUid === "system";
    if(!mine) return;

    const row = document.createElement("div");
    row.className = "chat";
    row.innerHTML = `
      <div class="chatpic">🤖</div>
      <div class="chatmeta">
        <div class="chatname">${escapeHtml(b.name)} <span class="verify"><i class="fa fa-check-circle"></i> галочка</span></div>
        <div class="chatsub">${escapeHtml(b.username)} • ${escapeHtml(b.description || "")}</div>
      </div>
      <div class="badge">BOT</div>
    `;
    row.onclick = ()=>{
      // открыть редактор (упрощённо: только базовые поля, команды не вытаскиваем обратно полностью)
      editingBotId = d.id;
      botDraftCommands = [];
      botNameInput.value = b.name || "";
      botUserInput.value = b.username || "@";
      botDescInput.value = b.description || "";
      botWebTitleInput.value = b.webApp?.title || "Открыть";
      botWebUrlInput.value = b.webApp?.url || "";
      cmdNameInput.value = "/start";
      cmdReplyInput.value = "Привет!";
      cmdButtonsInput.value = "Открыть|webapp";
      openModal("botEditorModal");
    };
    botList.appendChild(row);
  });

  if(!botList.children.length){
    botList.innerHTML = `<div class="hint">Пока нет ботов.</div>`;
  }
}

// ===== Auth bootstrap =====
async function boot(){
  await signInAnonymously(auth);

  onAuthStateChanged(auth, async (user)=>{
    if(!user) return;
    me = await loadMy(user.uid);

    if(!me){
      // черновик до логина
      me = { uid: user.uid, stars: 100, premium:false, muted:{active:false,reason:""} };
      console.log("UID (для ADMIN_UIDS):", user.uid);
      setStarsUI(me.stars);
    }else{
      setStarsUI(me.stars);
      adminBtn.style.display = me.isAdmin ? "flex" : "none";
      welcome.style.display = "none";
      listenChats();
    }

    // создать системных ботов/чаты
    await ensureSystemBots
