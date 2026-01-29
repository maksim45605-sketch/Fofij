// app.js (Fofij) — realtime + phone auth + optional email link + bots + admin panel + stickers + webview
// Требует Firebase: Firestore + Auth (Phone + Email/Password) + (по желанию Storage для файлов)
//
// ВСТАВЬ firebaseConfig внизу.

// ======================= Firebase imports =======================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getFirestore, doc, setDoc, getDoc, collection, addDoc, onSnapshot,
  query, where, orderBy, serverTimestamp, updateDoc, runTransaction, getDocs,
  limit
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPhoneNumber,
  RecaptchaVerifier,
  EmailAuthProvider,
  linkWithCredential,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

// ======================= App identity =======================
const APP_NAME = "Fofij";

// ======================= Gifts / Premium emoji (editable in JS) =======================
const GIFTS = [
  { id: "rose", title: "Роза", emoji: "🌹", cost: 5 },
  { id: "cake", title: "Торт", emoji: "🎂", cost: 10 },
  { id: "teddy", title: "Мишка", emoji: "🧸", cost: 15 },
  { id: "diamond", title: "Алмаз", emoji: "💎", cost: 50 },
];

// ======================= Built-in bots =======================
// Chat IDs for bots: b_spambot, b_sticers
const SYSTEM_BOTS = [
  {
    botId: "spambot",
    chatId: "b_spambot",
    username: "@SpamBot",
    name: "Спам-бот",
    description: "Через этот бот ты сможешь разблокировать себе чаты",
    verified: true,
    webApps: [], // можно добавить сайт ботам
  },
  {
    botId: "sticers",
    chatId: "b_sticers",
    username: "@sticers",
    name: "Sticers",
    description: "Создавай свои стикеры и делись с друзьями!",
    verified: true,
    webApps: [], // например: [{title:"Открыть редактор", url:"https://..."}]
  }
];

// ======================= Chat ID helpers =======================
// direct: u_<uidA>_<uidB>
// group : g_<random>
// channel: c_<random>
// bot   : b_<botname>
function chatIdDirect(uid1, uid2) {
  const [a, b] = [uid1, uid2].sort();
  return `u_${a}_${b}`;
}
function randomId(prefix) {
  // простой генератор
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}

// ======================= DOM helpers =======================
const $ = (id) => document.getElementById(id);

function ensureEl(tag, attrs = {}, parent = document.body) {
  const el = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === "html") el.innerHTML = v;
    else if (k === "text") el.textContent = v;
    else el.setAttribute(k, v);
  });
  parent.appendChild(el);
  return el;
}

function showToast(message, type = "info") {
  // использует #notification если есть, иначе alert
  const n = $("notification");
  if (!n) return alert(message);

  const title = $("notificationTitle");
  const msg = $("notificationMessage");
  if (title) title.textContent = type === "error" ? "Ошибка" : type === "success" ? "Успешно" : "Уведомление";
  if (msg) msg.textContent = message;

  const bg =
    type === "error" ? "var(--tg-red)" :
    type === "success" ? "var(--tg-green)" :
    "var(--tg-bg-secondary)";

  n.style.background = bg;
  n.classList.add("show");
  setTimeout(() => n.classList.remove("show"), 2500);
}

function openModal(id) { const el = $(id); if (el) el.classList.add("active"); }
function closeModal(id) { const el = $(id); if (el) el.classList.remove("active"); }

function normalizeUsername(u) {
  const t = (u || "").trim();
  if (!t) return "";
  return t.startsWith("@") ? t : "@" + t;
}
function isValidUsername(username) {
  const raw = username.startsWith("@") ? username.slice(1) : username;
  return /^[A-Za-z0-9_]{3,32}$/.test(raw);
}

function safeHtml(text) {
  return (text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");
}

// ======================= Firebase core =======================
let app, db, auth;

// ======================= State =======================
let me = null;                // profile {uid, phone, email?, username, firstName, lastName, stars, premium, mutedChats?}
let authUser = null;          // firebase user
let currentChat = null;       // {id, type, title, peerUid?, ownerUid? ...}
let unsubChats = null;
let unsubMessages = null;

let isAdmin = false;          // only admins see admin tools
let phoneConfirmation = null; // Phone Auth confirmation result
let recaptchaVerifier = null;

// ======================= Inject missing UI parts (so JS works even if HTML не полный) =======================
function injectBaseUI() {
  document.title = APP_NAME;

  // кнопка скрытия уведомления
  const hideBtn = $("hideNotificationBtn");
  if (hideBtn) hideBtn.onclick = () => $("notification")?.classList.remove("show");

  // global modal close by overlay click
  document.addEventListener("click", (e) => {
    if (e.target.classList?.contains("modal-overlay")) e.target.classList.remove("active");
    const close = e.target?.dataset?.close;
    if (close) closeModal(close);
  });

  // Добавим WebView modal (встроенный сайт)
  if (!$("webviewModal")) {
    ensureEl("div", {
      id: "webviewModal",
      class: "modal-overlay",
      html: `
        <div class="modal" style="max-width: 900px; height: 90vh;">
          <div class="modal-header">
            <div class="modal-title" id="webviewTitle">Открыть</div>
            <button class="modal-close" data-close="webviewModal">&times;</button>
          </div>
          <div class="modal-body" style="height: calc(90vh - 64px); padding: 0;">
            <iframe id="webviewFrame" style="width:100%; height:100%; border:0; background:#000;"></iframe>
          </div>
        </div>
      `
    });
  }

  // Admin panel modal
  if (!$("adminModal")) {
    ensureEl("div", {
      id: "adminModal",
      class: "modal-overlay",
      html: `
        <div class="modal" style="max-width: 760px;">
          <div class="modal-header">
            <div class="modal-title">🛡️ Админ-панель (боты)</div>
            <button class="modal-close" data-close="adminModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="hint">Только админы могут создавать/настраивать ботов.</div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 14px;">
              <div style="background: var(--tg-bg-tertiary); border:1px solid var(--tg-border); border-radius:12px; padding:12px;">
                <div style="font-weight:800; margin-bottom:8px;">Создать бота</div>
                <div class="form-group">
                  <label class="form-label">Название</label>
                  <input class="form-input" id="adminBotName" placeholder="Мой бот">
                </div>
                <div class="form-group">
                  <label class="form-label">Username</label>
                  <input class="form-input" id="adminBotUsername" placeholder="@mybot">
                </div>
                <div class="form-group">
                  <label class="form-label">Описание</label>
                  <input class="form-input" id="adminBotDesc" placeholder="Описание бота">
                </div>
                <div class="form-group">
                  <label class="form-label">Кнопка сайта (опц.)</label>
                  <input class="form-input" id="adminBotWebTitle" placeholder="Открыть open">
                  <input class="form-input" id="adminBotWebUrl" placeholder="https://example.com" style="margin-top:8px;">
                </div>
                <button class="btn" id="adminCreateBotBtn">Создать бота</button>
              </div>

              <div style="background: var(--tg-bg-tertiary); border:1px solid var(--tg-border); border-radius:12px; padding:12px;">
                <div style="font-weight:800; margin-bottom:8px;">Команды / кнопки бота</div>
                <div class="form-group">
                  <label class="form-label">Bot username</label>
                  <input class="form-input" id="adminTargetBot" placeholder="@mybot">
                </div>
                <div class="form-group">
                  <label class="form-label">Команда (например /start)</label>
                  <input class="form-input" id="adminCmd" placeholder="/start">
                </div>
                <div class="form-group">
                  <label class="form-label">Текст ответа</label>
                  <textarea class="form-input" id="adminCmdText" rows="3" placeholder="Что бот напишет"></textarea>
                </div>
                <div class="form-group">
                  <label class="form-label">Кнопка (опц.)</label>
                  <input class="form-input" id="adminBtnTitle" placeholder="Название кнопки">
                  <select class="form-input" id="adminBtnType" style="margin-top:8px;">
                    <option value="text">Прислать текст</option>
                    <option value="photo">Показать фото (URL)</option>
                    <option value="file">Показать файл (URL)</option>
                    <option value="web">Открыть сайт</option>
                  </select>
                  <input class="form-input" id="adminBtnPayload" placeholder="Текст или URL" style="margin-top:8px;">
                </div>

                <button class="btn btn-secondary" id="adminSaveCmdBtn">Сохранить команду</button>
              </div>
            </div>
          </div>
        </div>
      `
    });
  }

  // Sticker editor modal
  if (!$("stickerEditorModal")) {
    ensureEl("div", {
      id: "stickerEditorModal",
      class: "modal-overlay",
      html: `
        <div class="modal" style="max-width: 560px;">
          <div class="modal-header">
            <div class="modal-title">🎨 Создать стикер</div>
            <button class="modal-close" data-close="stickerEditorModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Название стикера</label>
              <input class="form-input" id="stickerNameInput" placeholder="Например: Мой кот">
            </div>

            <div class="form-group">
              <label class="form-label">Картинка (локально, будет сохранено как base64)</label>
              <input class="form-input" id="stickerFileInput" type="file" accept="image/*">
              <div class="hint">Для простоты: сохраняем картинку как base64 в Firestore. Потом можно заменить на Firebase Storage.</div>
            </div>

            <div id="stickerPreviewBox" style="display:none; background: var(--tg-bg-tertiary); border:1px solid var(--tg-border); border-radius:12px; padding:12px; margin-bottom:12px;">
              <img id="stickerPreviewImg" style="max-width: 180px; border-radius: 12px;">
            </div>

            <button class="btn" id="saveStickerBtn" disabled>Сохранить стикер</button>
          </div>
        </div>
      `
    });
  }

  // Sticker picker modal
  if (!$("stickerPickerModal")) {
    ensureEl("div", {
      id: "stickerPickerModal",
      class: "modal-overlay",
      html: `
        <div class="modal" style="max-width: 560px;">
          <div class="modal-header">
            <div class="modal-title">🧩 Стикеры</div>
            <button class="modal-close" data-close="stickerPickerModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="hint" style="margin-bottom:10px;">Нажми на стикер, чтобы отправить.</div>
            <div id="stickerGrid" style="display:grid; grid-template-columns: repeat(3, 1fr); gap: 10px;"></div>

            <div style="margin-top:12px; display:flex; gap:10px;">
              <button class="btn btn-secondary" id="openStickerEditorBtn">Создать</button>
              <button class="btn" id="closeStickerPickerBtn">Закрыть</button>
            </div>
          </div>
        </div>
      `
    });
  }

  // Premium emoji modal
  if (!$("premiumEmojiModal")) {
    ensureEl("div", {
      id: "premiumEmojiModal",
      class: "modal-overlay",
      html: `
        <div class="modal" style="max-width: 560px;">
          <div class="modal-header">
            <div class="modal-title">✨ Премиум: Аним-эмоджи</div>
            <button class="modal-close" data-close="premiumEmojiModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="hint">Мини-реализация: ты добавляешь название + ссылку на GIF/WebP (или base64). Потом можно сделать Storage.</div>

            <div class="form-group" style="margin-top:10px;">
              <label class="form-label">Название</label>
              <input class="form-input" id="animEmojiName" placeholder="Пламя">
            </div>
            <div class="form-group">
              <label class="form-label">URL (GIF/WebP) или base64</label>
              <input class="form-input" id="animEmojiUrl" placeholder="https://...">
            </div>
            <button class="btn" id="saveAnimEmojiBtn">Сохранить</button>
          </div>
        </div>
      `
    });
  }
}

// ======================= Auth UI (Phone + Email link) =======================
function ensureAuthUI() {
  // Если у тебя уже есть registerModal — используем его. Если нет — создадим.
  if (!$("registerModal")) {
    ensureEl("div", {
      id: "registerModal",
      class: "modal-overlay",
      html: `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">${APP_NAME}: вход по телефону</div>
            <button class="modal-close" data-close="registerModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label">Телефон</label>
              <input class="form-input" id="phoneInput" placeholder="+7 999 123 45 67">
            </div>

            <div id="recaptcha-container" style="margin: 10px 0;"></div>

            <button class="btn" id="sendSmsBtn">Отправить SMS</button>

            <div class="form-group" style="margin-top:12px;">
              <label class="form-label">Код из SMS</label>
              <input class="form-input" id="smsCodeInput" placeholder="123456">
            </div>
            <button class="btn btn-secondary" id="confirmSmsBtn">Подтвердить</button>

            <hr style="border:none; border-top:1px solid var(--tg-border); margin: 14px 0;">

            <div class="form-group">
              <label class="form-label">Имя</label>
              <input class="form-input" id="firstNameInput" placeholder="Иван">
            </div>
            <div class="form-group">
              <label class="form-label">Фамилия</label>
              <input class="form-input" id="lastNameInput" placeholder="Иванов">
            </div>
            <div class="form-group">
              <label class="form-label">Username</label>
              <input class="form-input" id="usernameInput" placeholder="ivanov">
              <div class="hint">Будет @ivanov</div>
            </div>

            <button class="btn" id="saveProfileBtn">Сохранить профиль</button>

            <div style="margin-top:12px;">
              <button class="btn btn-secondary" id="openEmailLinkBtn">Привязать Email (опционально)</button>
            </div>
          </div>
        </div>
      `
    });
  }

  // Email link modal
  if (!$("emailLinkModal")) {
    ensureEl("div", {
      id: "emailLinkModal",
      class: "modal-overlay",
      html: `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">Привязать Email (опционально)</div>
            <button class="modal-close" data-close="emailLinkModal">&times;</button>
          </div>
          <div class="modal-body">
            <div class="hint">Если хочешь — привяжи email для восстановления аккаунта.</div>
            <div class="form-group" style="margin-top:10px;">
              <label class="form-label">Email</label>
              <input class="form-input" id="linkEmailInput" placeholder="name@mail.com">
            </div>
            <div class="form-group">
              <label class="form-label">Пароль</label>
              <input class="form-input" id="linkPassInput" type="password" placeholder="******">
            </div>
            <button class="btn" id="linkEmailBtn">Привязать</button>
          </div>
        </div>
      `
    });
  }
}

// ======================= Profile & permissions =======================
async function loadMyProfile(uid) {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { uid, ...snap.data() };
}

async function saveMyProfile(profile) {
  await setDoc(doc(db, "users", profile.uid), {
    phone: profile.phone || "",
    email: profile.email || "",
    username: profile.username,
    firstName: profile.firstName,
    lastName: profile.lastName,
    stars: profile.stars ?? 100,
    premium: !!profile.premium,
    // mutes: { chatMuted: true/false, reason: "spam" }
    mutes: profile.mutes || {},
    createdAt: serverTimestamp(),
  }, { merge: true });
}

async function usernameTaken(username, myUid) {
  const qy = query(collection(db, "users"), where("username", "==", username));
  const s = await getDocs(qy);
  if (s.empty) return false;
  return s.docs.some(d => d.id !== myUid);
}

function setStarsUI(stars) {
  const pill = $("starsPill");
  if (pill) pill.textContent = `⭐ ${stars ?? 0}`;
}

async function checkAdmin(uid) {
  // Админов храни в коллекции /admins/{uid} = {true}
  const snap = await getDoc(doc(db, "admins", uid));
  return snap.exists();
}

// ======================= Seed system bots in Firestore =======================
async function seedSystemBots() {
  // /bots/{botId} and /chats/{chatId} type="bot"
  for (const b of SYSTEM_BOTS) {
    await setDoc(doc(db, "bots", b.botId), {
      botId: b.botId,
      username: b.username,
      name: b.name,
      description: b.description,
      verified: !!b.verified,
      system: true,
      webApps: b.webApps || [],
      createdAt: serverTimestamp(),
    }, { merge: true });

    await setDoc(doc(db, "chats", b.chatId), {
      chatId: b.chatId,
      type: "bot",
      botId: b.botId,
      title: b.name,
      username: b.username,
      description: b.description,
      verified: !!b.verified,
      members: [],              // у бота “нет участников”, он общий
      createdAt: serverTimestamp(),
      lastMessage: b.description,
      lastMessageAt: serverTimestamp(),
    }, { merge: true });
  }
}

// ======================= Chats (list + open) =======================
function listenChats() {
  if (!me) return;
  if (unsubChats) unsubChats();

  // Для пользователя: чаты, где members содержит uid + все системные боты (видны всем)
  const qMember = query(collection(db, "chats"), where("members", "array-contains", me.uid));
  const qBots = query(collection(db, "chats"), where("type", "==", "bot"), limit(50));

  // слушаем 2 стрима и объединяем
  let memberChats = [];
  let botChats = [];

  const renderCombined = () => {
    const list = [...botChats, ...memberChats];

    // уникальность по id
    const map = new Map();
    list.forEach(c => map.set(c.id, c));
    const uniq = [...map.values()];

    // сорт
    uniq.sort((a, b) => {
      const ta = a.lastMessageAt?.toMillis?.() ?? 0;
      const tb = b.lastMessageAt?.toMillis?.() ?? 0;
      return tb - ta;
    });

    renderChatList(uniq);
  };

  const unsub1 = onSnapshot(qMember, async (snap) => {
    memberChats = await Promise.all(snap.docs.map(async d => await hydrateChatDoc(d)));
    renderCombined();
  });

  const unsub2 = onSnapshot(qBots, async (snap) => {
    botChats = await Promise.all(snap.docs.map(async d => await hydrateChatDoc(d)));
    renderCombined();
  });

  unsubChats = () => { unsub1(); unsub2(); };
}

async function hydrateChatDoc(d) {
  const chat = d.data();
  const id = d.id;

  // Для direct — подцепим peer profile
  if (chat.type === "direct") {
    const peerUid = (chat.members || []).find(x => x !== me.uid);
    let title = chat.title || "Диалог";
    if (peerUid) {
      const peerSnap = await getDoc(doc(db, "users", peerUid));
      if (peerSnap.exists()) {
        const p = peerSnap.data();
        title = `${p.firstName || ""} ${p.lastName || ""}`.trim() || p.username || "Диалог";
      }
    }
    return { id, ...chat, title, peerUid };
  }

  return { id, ...chat, title: chat.title || chat.name || "Чат" };
}

function renderChatList(list) {
  const chatList = $("chatList");
  if (!chatList) return;

  const term = ($("searchInput")?.value || "").toLowerCase().trim();
  chatList.innerHTML = "";

  list
    .filter(c => !term || (c.title || "").toLowerCase().includes(term) || (c.lastMessage || "").toLowerCase().includes(term))
    .forEach(c => {
      const div = document.createElement("div");
      div.className = `chat-item ${currentChat?.id === c.id ? "active" : ""}`;

      const badge = c.verified ? `<i class="fas fa-check-circle verified-badge" style="color: var(--tg-primary);"></i>` : "";
      const typeTag =
        c.type === "bot" ? `<span style="color:var(--tg-text-secondary); font-size:12px;">бот</span>` :
        c.type === "channel" ? `<span style="color:var(--tg-text-secondary); font-size:12px;">канал</span>` :
        c.type === "group" ? `<span style="color:var(--tg-text-secondary); font-size:12px;">группа</span>` : "";

      div.innerHTML = `
        <div class="avatar"><span>${(c.title || "?").charAt(0).toUpperCase()}</span></div>
        <div class="chat-info">
          <div class="chat-name">${c.title || "Чат"} ${badge} ${typeTag}</div>
          <div class="chat-preview">${c.lastMessage || "Нет сообщений"}</div>
        </div>
      `;

      div.onclick = () => openChat(c);
      chatList.appendChild(div);
    });
}

async function openChat(chat) {
  currentChat = chat;

  $("currentChatName") && ($("currentChatName").textContent = chat.title || APP_NAME);
  $("currentChatStatus") && ($("currentChatStatus").textContent =
    chat.type === "bot" ? (chat.username || "бот") :
    chat.type === "channel" ? "канал" :
    chat.type === "group" ? "группа" :
    "онлайн"
  );

  const av = $("currentChatAvatar");
  if (av) av.innerHTML = `<span>${(chat.title || "?").charAt(0).toUpperCase()}</span>`;

  // show input
  const inputContainer = $("inputContainer");
  if (inputContainer) inputContainer.style.display = "flex";

  // clear messages view and listen
  const container = $("messagesContainer");
  if (container) container.innerHTML = "";

  listenMessages(chat.id);

  // Bot special: show webapp button (bottom-left)
  updateBotWebAppButton(chat);

  // mobile hide sidebar
  if (window.innerWidth <= 768) $("sidebar")?.classList.remove("active");
}

// ======================= Messages =======================
function listenMessages(chatId) {
  if (unsubMessages) unsubMessages();

  const qMsgs = query(collection(db, "chats", chatId, "messages"), orderBy("createdAt", "asc"));
  unsubMessages = onSnapshot(qMsgs, (snap) => {
    const box = $("messagesContainer");
    if (!box) return;
    box.innerHTML = "";

    snap.docs.forEach(d => {
      const msg = d.data();
      box.appendChild(renderMessage(msg));
    });

    box.scrollTop = box.scrollHeight;
  });
}

function formatTime(ts) {
  if (!ts) return "";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function renderMessage(msg) {
  const outgoing = msg.senderUid && me && msg.senderUid === me.uid;

  const wrap = document.createElement("div");
  wrap.className = `message ${outgoing ? "outgoing" : "incoming"}`;

  const bubble = document.createElement("div");
  bubble.className = "message-bubble bubble";

  // message types
  if (msg.type === "text") {
    bubble.innerHTML = `
      <div>${safeHtml(msg.text || "")}</div>
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;
  } else if (msg.type === "photo") {
    bubble.innerHTML = `
      <div>${safeHtml(msg.caption || "")}</div>
      <img src="${msg.url}" style="max-width:260px; border-radius:12px; margin-top:8px; cursor:pointer;">
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;
    const img = bubble.querySelector("img");
    img.onclick = () => openWebView("Фото", msg.url);
  } else if (msg.type === "file") {
    bubble.innerHTML = `
      <div style="font-weight:800;">📎 Файл</div>
      <div style="opacity:.9; margin-top:4px;">${safeHtml(msg.name || "file")}</div>
      <div style="margin-top:8px;">
        <a href="${msg.url}" target="_blank" style="color:white; text-decoration: underline;">Открыть</a>
      </div>
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;
  } else if (msg.type === "gift") {
    bubble.innerHTML = `
      <div>${outgoing ? "Вы отправили подарок" : "Вам отправили подарок"}</div>
      <div class="gift-card">
        <div class="gift-emoji">${msg.giftEmoji}</div>
        <div style="flex:1;">
          <div class="gift-title">${safeHtml(msg.giftTitle)}</div>
          <div class="gift-cost">⭐ ${msg.giftCost}</div>
        </div>
      </div>
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;
  } else if (msg.type === "sticker") {
    bubble.innerHTML = `
      <div style="font-weight:800; margin-bottom:6px;">🧩 ${safeHtml(msg.stickerName || "Стикер")}</div>
      <img src="${msg.stickerImage}" style="max-width:220px; border-radius:16px; background:rgba(255,255,255,.08);">
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;
  } else if (msg.type === "bot_buttons") {
    // inline buttons from bot
    const buttons = (msg.buttons || []).map((b, i) => `
      <button class="bot-button" data-btn-idx="${i}" style="background: var(--tg-primary); border:none; border-radius:10px; padding:10px 12px; color:white; width:100%; text-align:left; margin-top:8px; cursor:pointer;">
        ${safeHtml(b.title)}
      </button>
    `).join("");

    bubble.innerHTML = `
      <div>${safeHtml(msg.text || "")}</div>
      <div class="bot-buttons">${buttons}</div>
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;

    bubble.querySelectorAll("button[data-btn-idx]").forEach(btn => {
      btn.onclick = async () => {
        const idx = Number(btn.dataset.btnIdx);
        const b = msg.buttons[idx];
        await handleInlineButton(b);
      };
    });
  } else {
    bubble.innerHTML = `
      <div>${safeHtml(msg.text || "Сообщение")}</div>
      <div class="meta">${formatTime(msg.createdAt)}</div>
    `;
  }

  wrap.appendChild(bubble);
  return wrap;
}

// ======================= Send message (permissions) =======================
function canSendToChat(chat) {
  if (!me || !chat) return false;

  // channel: only owner can send (и текст, и стикеры, и т.д.)
  if (chat.type === "channel") {
    return chat.ownerUid === me.uid;
  }
  // direct/group/bot: allow
  return true;
}

async function sendText(text) {
  if (!me || !currentChat) return;
  if (!canSendToChat(currentChat)) return showToast("Только владелец канала может писать/отправлять стикеры.", "error");

  const trimmed = (text || "").trim();
  if (!trimmed) return;

  // Bot messages routing (if sending to bot chat)
  if (currentChat.type === "bot") {
    await handleBotUserMessage(trimmed);
    return;
  }

  const chatRef = doc(db, "chats", currentChat.id);
  await addDoc(collection(db, "chats", currentChat.id, "messages"), {
    type: "text",
    text: trimmed,
    senderUid: me.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(chatRef, {
    lastMessage: trimmed,
    lastMessageAt: serverTimestamp()
  });
}

async function sendSticker(sticker) {
  if (!me || !currentChat) return;
  if (!canSendToChat(currentChat)) return showToast("Только владелец канала может отправлять стикеры.", "error");

  // in bot chat — не отправляем стикеры (по желанию можно)
  if (currentChat.type === "bot") return showToast("Стикеры нельзя отправлять в бота.", "error");

  const chatRef = doc(db, "chats", currentChat.id);
  await addDoc(collection(db, "chats", currentChat.id, "messages"), {
    type: "sticker",
    stickerName: sticker.name,
    stickerImage: sticker.image,
    senderUid: me.uid,
    createdAt: serverTimestamp()
  });

  await updateDoc(chatRef, {
    lastMessage: `🧩 ${sticker.name}`,
    lastMessageAt: serverTimestamp()
  });

  closeModal("stickerPickerModal");
}

// ======================= Bot webapp button (bottom-left) =======================
function updateBotWebAppButton(chat) {
  // кнопка внизу слева у inputContainer
  const input = $("inputContainer");
  if (!input) return;

  // remove existing
  let btn = $("botWebAppBtn");
  if (btn) btn.remove();

  if (!chat || chat.type !== "bot") return;

  // load bot config
  (async () => {
    const botSnap = await getDoc(doc(db, "bots", chat.botId));
    if (!botSnap.exists()) return;

    const bot = botSnap.data();
    const webApps = bot.webApps || [];
    if (!webApps.length) return;

    const w = webApps[0]; // минимум 1 кнопка
    btn = ensureEl("button", {
      id: "botWebAppBtn",
      style: `
        position:absolute;
        left: 14px;
        bottom: 70px;
        background: rgba(255,255,255,.08);
        border: 1px solid var(--tg-border);
        color: var(--tg-text-primary);
        padding: 10px 14px;
        border-radius: 999px;
        cursor:pointer;
        display:flex;
        align-items:center;
        gap:10px;
        backdrop-filter: blur(6px);
      `,
      html: `<i class="fas fa-globe"></i> ${safeHtml(w.title || "Открыть")}`
    }, input);

    btn.onclick = () => openWebView(w.title || "Открыть", w.url);
  })();
}

function openWebView(title, url) {
  const t = $("webviewTitle");
  const f = $("webviewFrame");
  if (t) t.textContent = title || "Открыть";
  if (f) f.src = url;
  openModal("webviewModal");
}

// ======================= Inline button handler (bot buttons) =======================
async function handleInlineButton(button) {
  if (!button || !currentChat) return;

  // действия кнопки: text/photo/file/web/support_request/open_stickers
  const type = button.type;

  if (type === "text") {
    await addBotMessage(currentChat.id, button.payload || "...");
  } else if (type === "photo") {
    await addBotMessage(currentChat.id, button.caption || "Фото:", [
      { title: "Открыть фото", type: "web", payload: button.payload }
    ]);
    await addDoc(collection(db, "chats", currentChat.id, "messages"), {
      type: "photo",
      url: button.payload,
      caption: button.caption || "",
      senderUid: "bot",
      createdAt: serverTimestamp()
    });
  } else if (type === "file") {
    await addDoc(collection(db, "chats", currentChat.id, "messages"), {
      type: "file",
      url: button.payload,
      name: button.name || "file",
      senderUid: "bot",
      createdAt: serverTimestamp()
    });
  } else if (type === "web") {
    openWebView(button.title || "Открыть", button.payload);
  } else if (type === "support_request") {
    await createSupportRequest();
  } else if (type === "open_stickers") {
    openStickers();
  }
}

// ======================= Bot logic =======================
async function handleBotUserMessage(text) {
  // в бот-чате пользователь пишет — бот отвечает.
  // Если /start — запускаем сценарий, иначе смотрим админ-команды (custom bot)
  const cmd = text.trim();

  if (currentChat.botId === "spambot") {
    await spamBotFlow(cmd);
    return;
  }

  if (currentChat.botId === "sticers") {
    await sticersBotFlow(cmd);
    return;
  }

  // custom bot flow from firestore: /bot_commands/{botId}/{command}
  await customBotFlow(currentChat.botId, cmd);
}

async function addBotMessage(chatId, text, buttons = null) {
  const msg = {
    type: buttons?.length ? "bot_buttons" : "text",
    text,
    senderUid: "bot",
    createdAt: serverTimestamp()
  };
  if (buttons?.length) msg.buttons = buttons;

  await addDoc(collection(db, "chats", chatId, "messages"), msg);
  await updateDoc(doc(db, "chats", chatId), {
    lastMessage: (text || "").slice(0, 80),
    lastMessageAt: serverTimestamp()
  });
}

// ---- SpamBot сценарий ----
async function spamBotFlow(cmd) {
  if (cmd.toLowerCase() !== "/start") {
    await addBotMessage(currentChat.id, `Напиши /start чтобы начать.`);
    return;
  }

  const muted = !!(me?.mutes?.chatMuted && me?.mutes?.reason === "spam");
  if (!muted) {
    await addBotMessage(currentChat.id, `✅ У вас нет блокировки чата.`);
    return;
  }

  await addBotMessage(
    currentChat.id,
    `⚠️ У вас мут за спам.\nЕсли вы думаете, что это незаслуженно — нажмите кнопку ниже и напишите админам.`,
    [
      { title: "✉️ Написать админам", type: "support_request", payload: "unmute_request" }
    ]
  );
}

async function createSupportRequest() {
  if (!me) return;

  // создадим запрос в /support_requests
  await addDoc(collection(db, "support_requests"), {
    fromUid: me.uid,
    fromUsername: me.username || "",
    phone: me.phone || "",
    createdAt: serverTimestamp(),
    reason: "unmute_request",
    status: "open"
  });

  await addBotMessage(currentChat.id, "✅ Запрос отправлен админам. Ожидайте ответа.");
}

// ---- Sticers сценарий ----
async function sticersBotFlow(cmd) {
  if (cmd.toLowerCase() !== "/start") {
    await addBotMessage(currentChat.id, `Напиши /start чтобы открыть меню.`);
    return;
  }

  await addBotMessage(
    currentChat.id,
    `🧩 Привет! Я Sticers.\n\nНажми кнопку ниже, чтобы открыть стикеры или создать новый.`,
    [
      { title: "🧩 Открыть стикеры", type: "open_stickers" },
      { title: "🎨 Создать стикер", type: "web", payload: "local://open_sticker_editor" }
    ]
  );

  // local action: open editor
  // Если нажмут "Создать стикер" — перехватим в openWebView обработке? проще: заменим кнопку тип="web" на спец.
}

// Custom bots from admin panel
async function customBotFlow(botId, cmd) {
  const command = cmd.startsWith("/") ? cmd : "/text";
  const ref = doc(db, "bot_commands", botId, "commands", command);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await addBotMessage(currentChat.id, `Не знаю команду.\nПопробуй /start`);
    return;
  }

  const data = snap.data();
  await addBotMessage(currentChat.id, data.text || "...", data.buttons || []);
}

// ======================= Stickers (create + picker) =======================
let stickerDraftBase64 = null;

function bindStickerUI() {
  const fileInput = $("stickerFileInput");
  const previewBox = $("stickerPreviewBox");
  const previewImg = $("stickerPreviewImg");
  const saveBtn = $("saveStickerBtn");

  if (fileInput) {
    fileInput.onchange = (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        stickerDraftBase64 = reader.result;
        if (previewImg) previewImg.src = stickerDraftBase64;
        if (previewBox) previewBox.style.display = "block";
        if (saveBtn) saveBtn.disabled = false;
      };
      reader.readAsDataURL(file);
    };
  }

  if (saveBtn) {
    saveBtn.onclick = async () => {
      if (!me) return showToast("Сначала войдите.", "error");
      const name = ($("stickerNameInput")?.value || "").trim();
      if (!name || !stickerDraftBase64) return showToast("Укажи название и картинку.", "error");

      // save sticker to /stickers/{uid}/items
      await addDoc(collection(db, "stickers", me.uid, "items"), {
        name,
        image: stickerDraftBase64,
        createdAt: serverTimestamp()
      });

      showToast("Стикер сохранён!", "success");
      closeModal("stickerEditorModal");
      stickerDraftBase64 = null;

      // если мы в чате — можно открыть picker
      openStickers();
    };
  }

  $("openStickerEditorBtn") && ($("openStickerEditorBtn").onclick = () => {
    closeModal("stickerPickerModal");
    openModal("stickerEditorModal");
  });

  $("closeStickerPickerBtn") && ($("closeStickerPickerBtn").onclick = () => closeModal("stickerPickerModal"));
}

async function openStickers() {
  if (!me) return openModal("registerModal");

  // если в канале и не владелец — всё равно можно смотреть, но отправка заблокируется при клике
  const grid = $("stickerGrid");
  if (!grid) return;

  grid.innerHTML = `<div class="hint">Загрузка...</div>`;
  openModal("stickerPickerModal");

  const qy = query(collection(db, "stickers", me.uid, "items"), orderBy("createdAt", "desc"), limit(60));
  const snap = await getDocs(qy);

  grid.innerHTML = "";
  if (snap.empty) {
    grid.innerHTML = `<div class="hint">У вас пока нет стикеров. Нажмите “Создать”.</div>`;
    return;
  }

  snap.docs.forEach(d => {
    const s = d.data();
    const btn = document.createElement("button");
    btn.className = "gift-btn";
    btn.style.padding = "10px";
    btn.style.justifyContent = "center";
    btn.innerHTML = `<img src="${s.image}" style="width:100%; aspect-ratio:1/1; object-fit:cover; border-radius: 14px;">`;
    btn.onclick = () => sendSticker({ name: s.name, image: s.image });
    grid.appendChild(btn);
  });
}

// ======================= Premium animated emoji =======================
async function saveAnimEmoji(name, url) {
  if (!me) return;
  if (!me.premium) return showToast("Нужно Premium.", "error");

  await addDoc(collection(db, "premium_emojis", me.uid, "items"), {
    name,
    url,
    createdAt: serverTimestamp()
  });

  showToast("Аним-эмоджи сохранено!", "success");
}

async function openPremiumEmojiModal() {
  if (!me) return openModal("registerModal");
  if (!me.premium) return showToast("Premium недоступен. (Можно выдать в профиле админом)", "error");
  openModal("premiumEmojiModal");
}

function bindPremiumEmojiUI() {
  const btn = $("saveAnimEmojiBtn");
  if (!btn) return;
  btn.onclick = async () => {
    const name = ($("animEmojiName")?.value || "").trim();
    const url = ($("animEmojiUrl")?.value || "").trim();
    if (!name || !url) return showToast("Заполни название и URL/base64", "error");
    await saveAnimEmoji(name, url);
    closeModal("premiumEmojiModal");
  };
}

// ======================= Gifts (stars) =======================
async function sendGift(giftId) {
  if (!me || !currentChat) return showToast("Открой чат.", "error");
  if (!canSendToChat(currentChat)) return showToast("Только владелец канала может отправлять.", "error");
  if (currentChat.type === "bot") return showToast("Подарки в бота нельзя.", "error");

  const gift = GIFTS.find(g => g.id === giftId);
  if (!gift) return;

  const myRef = doc(db, "users", me.uid);
  const chatRef = doc(db, "chats", currentChat.id);

  try {
    await runTransaction(db, async (tx) => {
      const mySnap = await tx.get(myRef);
      const stars = mySnap.data()?.stars ?? 0;
      if (stars < gift.cost) throw new Error("NOT_ENOUGH_STARS");

      tx.update(myRef, { stars: stars - gift.cost });

      const msgRef = doc(collection(db, "chats", currentChat.id, "messages"));
      tx.set(msgRef, {
        type: "gift",
        giftId: gift.id,
        giftTitle: gift.title,
        giftEmoji: gift.emoji,
        giftCost: gift.cost,
        senderUid: me.uid,
        createdAt: serverTimestamp()
      });

      tx.update(chatRef, {
        lastMessage: `${gift.emoji} ${gift.title} (⭐ ${gift.cost})`,
        lastMessageAt: serverTimestamp()
      });
    });

    me = await loadMyProfile(me.uid);
    setStarsUI(me.stars);
    showToast(`Подарок отправлен: ${gift.emoji} ${gift.title}`, "success");
  } catch (e) {
    if (e.message === "NOT_ENOUGH_STARS") return showToast("Недостаточно звёзд.", "error");
    console.error(e);
    showToast("Ошибка подарка.", "error");
  }
}

// ======================= Admin: create bots + commands =======================
async function adminCreateBot() {
  if (!isAdmin) return showToast("Доступ запрещён.", "error");

  const name = ($("adminBotName")?.value || "").trim();
  const username = normalizeUsername($("adminBotUsername")?.value || "");
  const desc = ($("adminBotDesc")?.value || "").trim();
  const webTitle = ($("adminBotWebTitle")?.value || "").trim();
  const webUrl = ($("adminBotWebUrl")?.value || "").trim();

  if (!name || !username || !desc) return showToast("Заполни имя/username/описание", "error");
  if (!isValidUsername(username)) return showToast("Некорректный username", "error");

  // botId from username
  const botId = username.slice(1).toLowerCase();
  const chatId = `b_${botId}`;

  // save bot config
  const webApps = (webTitle && webUrl) ? [{ title: webTitle, url: webUrl }] : [];

  await setDoc(doc(db, "bots", botId), {
    botId,
    username,
    name,
    description: desc,
    verified: true,      // синия галочка
    ownerUid: me.uid,
    system: false,
    webApps,
    createdAt: serverTimestamp()
  }, { merge: true });

  // create chat doc for bot
  await setDoc(doc(db, "chats", chatId), {
    chatId,
    type: "bot",
    botId,
    title: name,
    username,
    description: desc,
    verified: true,
    createdAt: serverTimestamp(),
    lastMessage: desc,
    lastMessageAt: serverTimestamp()
  }, { merge: true });

  showToast("Бот создан!", "success");
  listenChats();
}

async function adminSaveCommand() {
  if (!isAdmin) return showToast("Доступ запрещён.", "error");

  const target = normalizeUsername($("adminTargetBot")?.value || "");
  const cmd = ($("adminCmd")?.value || "").trim();
  const text = ($("adminCmdText")?.value || "").trim();

  const btnTitle = ($("adminBtnTitle")?.value || "").trim();
  const btnType = ($("adminBtnType")?.value || "text").trim();
  const payload = ($("adminBtnPayload")?.value || "").trim();

  if (!target || !cmd || !text) return showToast("Заполни bot/команду/текст", "error");

  // find botId
  const botId = target.slice(1).toLowerCase();
  const buttons = [];

  if (btnTitle) {
    // payload required for non-text? — да
    buttons.push({
      title: btnTitle,
      type: btnType,
      payload
    });
  }

  await setDoc(doc(db, "bot_commands", botId, "commands", cmd), {
    text,
    buttons
  }, { merge: true });

  showToast("Команда сохранена!", "success");
}

// ======================= Create chats (direct/group/channel) =======================
async function createOrOpenDirectByUsername(peerUsernameRaw) {
  if (!me) return openModal("registerModal");

  const peerUsername = normalizeUsername(peerUsernameRaw);
  if (!isValidUsername(peerUsername)) return showToast("Некорректный username.", "error");

  const qUser = query(collection(db, "users"), where("username", "==", peerUsername), limit(1));
  const res = await getDocs(qUser);
  if (res.empty) return showToast("Пользователь не найден.", "error");

  const peerDoc = res.docs[0];
  const peerUid = peerDoc.id;
  if (peerUid === me.uid) return showToast("Нельзя чат с собой 🙂", "error");

  const id = chatIdDirect(me.uid, peerUid);

  const ref = doc(db, "chats", id);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      chatId: id,
      type: "direct",
      members: [me.uid, peerUid],
      createdAt: serverTimestamp(),
      lastMessage: "",
      lastMessageAt: serverTimestamp()
    });
  }

  // open chat
  const peer = peerDoc.data();
  const title = `${peer.firstName || ""} ${peer.lastName || ""}`.trim() || peer.username || "Диалог";
  await openChat({ id, type: "direct", members: [me.uid, peerUid], peerUid, title });
}

// ======================= Phone auth + profile + optional email link =======================
function initRecaptcha() {
  // needed by Phone Auth
  const containerId = "recaptcha-container";
  if (!$(containerId)) return;

  try {
    if (recaptchaVerifier) return;

    recaptchaVerifier = new RecaptchaVerifier(auth, containerId, {
      size: "normal",
      callback: () => {},
    });

    recaptchaVerifier.render();
  } catch (e) {
    console.warn("reCAPTCHA init failed", e);
  }
}

async function sendSmsCode() {
  const phone = ($("phoneInput")?.value || "").trim();
  if (!phone) return showToast("Введите телефон", "error");

  initRecaptcha();
  if (!recaptchaVerifier) return showToast("reCAPTCHA не готов", "error");

  try {
    phoneConfirmation = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
    showToast("SMS отправлено!", "success");
  } catch (e) {
    console.error(e);
    showToast("Ошибка отправки SMS (проверь Firebase Auth настройки).", "error");
  }
}

async function confirmSmsCode() {
  const code = ($("smsCodeInput")?.value || "").trim();
  if (!phoneConfirmation) return showToast("Сначала отправь SMS", "error");
  if (!code) return showToast("Введите код", "error");

  try {
    const result = await phoneConfirmation.confirm(code);
    authUser = result.user;
    showToast("Телефон подтверждён!", "success");

    // загрузим профиль (если есть)
    me = await loadMyProfile(authUser.uid);
    if (!me) {
      me = { uid: authUser.uid, phone: authUser.phoneNumber || "", stars: 100, premium: false, mutes: {} };
      setStarsUI(me.stars);
      showToast("Теперь заполни профиль (имя/username).", "info");
    } else {
      setStarsUI(me.stars);
      closeModal("registerModal");
      listenChats();
    }

    // админ?
    isAdmin = await checkAdmin(authUser.uid);
  } catch (e) {
    console.error(e);
    showToast("Неверный код", "error");
  }
}

async function saveProfileFromUI() {
  if (!authUser) return showToast("Сначала войди по телефону.", "error");

  const firstName = ($("firstNameInput")?.value || "").trim();
  const lastName = ($("lastNameInput")?.value || "").trim();
  const username = normalizeUsername($("usernameInput")?.value || "");

  if (!firstName || !lastName || !username) return showToast("Заполни имя/фамилию/username", "error");
  if (!isValidUsername(username)) return showToast("Некорректный username", "error");

  if (await usernameTaken(username, authUser.uid)) return showToast("Username занят", "error");

  const phone = authUser.phoneNumber || ($("phoneInput")?.value || "").trim();

  const profile = {
    uid: authUser.uid,
    phone,
    email: authUser.email || "",
    username,
    firstName,
    lastName,
    stars: me?.stars ?? 100,
    premium: !!me?.premium,
    mutes: me?.mutes || {}
  };

  await saveMyProfile(profile);
  me = await loadMyProfile(authUser.uid);

  closeModal("registerModal");
  showToast(`Добро пожаловать, ${me.firstName}!`, "success");

  isAdmin = await checkAdmin(authUser.uid);

  // seed bots, then listen chats
  await seedSystemBots();
  listenChats();
}

async function linkEmailOptional() {
  if (!auth.currentUser) return showToast("Нужно войти по телефону.", "error");

  const email = ($("linkEmailInput")?.value || "").trim();
  const pass = ($("linkPassInput")?.value || "").trim();

  if (!email || !pass) return showToast("Заполни email и пароль", "error");

  try {
    const cred = EmailAuthProvider.credential(email, pass);
    const res = await linkWithCredential(auth.currentUser, cred);
    showToast("Email привязан!", "success");

    // update profile email
    if (me) {
      me.email = res.user.email || email;
      await saveMyProfile(me);
    }

    closeModal("emailLinkModal");
  } catch (e) {
    console.error(e);
    showToast("Ошибка привязки email (возможно уже занят).", "error");
  }
}

// ======================= Bind UI =======================
function bindUI() {
  // Sidebar mobile
  $("mobileMenuBtn") && ($("mobileMenuBtn").onclick = () => $("sidebar")?.classList.toggle("active"));

  // Search
  $("searchInput") && ($("searchInput").addEventListener("input", () => {
    // list rerender will happen on snapshots; quick rerender:
    // easiest: re-listen (cheap)
    listenChats();
  }));

  // Open register
  $("openRegisterBtn") && ($("openRegisterBtn").onclick = () => openModal("registerModal"));
  $("profileBtn") && ($("profileBtn").onclick = () => {
    if (!me) openModal("registerModal");
    else showToast(`${me.username} • ⭐ ${me.stars}${me.premium ? " • Premium" : ""}`, "info");
  });

  // Send message
  const input = $("messageInput");
  const sendBtn = $("sendBtn");
  if (input && sendBtn) {
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 160) + "px";
      sendBtn.disabled = input.value.trim().length === 0;
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const t = input.value;
        input.value = "";
        input.style.height = "auto";
        sendBtn.disabled = true;
        sendText(t);
      }
    });
    sendBtn.onclick = () => {
      const t = input.value;
      input.value = "";
      input.style.height = "auto";
      sendBtn.disabled = true;
      sendText(t);
    };
  }

  // New chat button (если есть в HTML)
  $("newChatBtn") && ($("newChatBtn").onclick = () => {
    if (!me) return openModal("registerModal");
    if ($("newChatModal")) openModal("newChatModal");
    else {
      const u = prompt("Username собеседника (@name):");
      if (u) createOrOpenDirectByUsername(u);
    }
  });
  $("createChatBtn") && ($("createChatBtn").onclick = () => createOrOpenDirectByUsername($("peerUsernameInput")?.value || ""));

  // Gifts button
  $("giftsBtn") && ($("giftsBtn").onclick = () => {
    if (!me) return openModal("registerModal");
    openGiftsModal();
  });
  $("openGiftPickerBtn") && ($("openGiftPickerBtn").onclick = () => {
    if (!me) return openModal("registerModal");
    if (!currentChat) return showToast("Сначала выбери чат.", "error");
    openGiftsModal();
  });

  // Admin open (мы добавим кнопку в меню профиля при isAdmin, но также можно хоткеем)
  document.addEventListener("keydown", (e) => {
    if (e.key === "F2" && isAdmin) openModal("adminModal");
  });

  // Admin actions
  $("adminCreateBotBtn") && ($("adminCreateBotBtn").onclick = adminCreateBot);
  $("adminSaveCmdBtn") && ($("adminSaveCmdBtn").onclick = adminSaveCommand);

  // Auth actions
  $("sendSmsBtn") && ($("sendSmsBtn").onclick = sendSmsCode);
  $("confirmSmsBtn") && ($("confirmSmsBtn").onclick = confirmSmsCode);
  $("saveProfileBtn") && ($("saveProfileBtn").onclick = saveProfileFromUI);

  // Optional email link
  const openEmailLink = $("openEmailLinkBtn");
  if (openEmailLink) {
    openEmailLink.onclick = () => openModal("emailLinkModal");
  }
  $("linkEmailBtn") && ($("linkEmailBtn").onclick = linkEmailOptional);

  // Stickers
  bindStickerUI();

  // Premium emoji
  bindPremiumEmojiUI();

  // Extra: открыть стикеры из UI если есть кнопка
  // Можно навесить на какую-то кнопку внизу: например кнопка с иконкой 😀 => openStickers
}

// ======================= Gifts modal (inject if missing) =======================
function openGiftsModal() {
  // если модалки нет — создадим
  if (!$("giftsModal")) {
    ensureEl("div", {
      id: "giftsModal",
      class: "modal-overlay",
      html: `
        <div class="modal">
          <div class="modal-header">
            <div class="modal-title">⭐ Подарки</div>
            <button class="modal-close" data-close="giftsModal">&times;</button>
          </div>
          <div class="modal-body">
            <div id="giftsGrid" class="gifts-grid"></div>
          </div>
        </div>
      `
    });
  }

  const grid = $("giftsGrid");
  grid.innerHTML = "";
  GIFTS.forEach(g => {
    const btn = document.createElement("button");
    btn.className = "gift-btn";
    btn.innerHTML = `
      <div style="font-size:22px">${g.emoji}</div>
      <div style="flex:1;">
        <div style="font-weight:800">${g.title}</div>
        <div class="hint">Стоимость: ⭐ ${g.cost}</div>
      </div>
    `;
    btn.onclick = () => {
      if (!currentChat) return showToast("Сначала выбери чат.", "error");
      sendGift(g.id);
      closeModal("giftsModal");
    };
    grid.appendChild(btn);
  });

  openModal("giftsModal");
}

// ======================= Handle "local://" web actions for bots =======================
function patchWebViewForLocalActions() {
  // Перехват кнопок, которые мы сделали как web с local://...
  const origOpenWebView = openWebView;
  window.__openWebViewOrig = origOpenWebView;

  // override
  window.openWebView = (title, url) => {
    if (url === "local://open_sticker_editor") {
      openModal("stickerEditorModal");
      return;
    }
    origOpenWebView(title, url);
  };
}

// ======================= Init =======================
async function main() {
  injectBaseUI();
  ensureAuthUI();

  // ====== ВСТАВЬ СЮДА СВОЙ firebaseConfig ======
  const firebaseConfig = {
  apiKey: "AIzaSyA7D-OLg2X0mkQq0U-atb9ynEhfyUZ6Wac",
  authDomain: "fofijs.firebaseapp.com",
  projectId: "fofijs",
  storageBucket: "fofijs.firebasestorage.app",
  messagingSenderId: "295288998457",
  appId: "1:295288998457:web:2f8c644520803a2ee11be8",
  measurementId: "G-TCY9EKGEJW"
};

  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);

  // If user opens without phone login yet, keep anonymous session optional.
  // Можно убрать, если хочешь строго phone-only:
  try { await signInAnonymously(auth); } catch {}

  bindUI();
  patchWebViewForLocalActions();

  onAuthStateChanged(auth, async (user) => {
    authUser = user || null;
    if (!authUser) return;

    // Phone user or anonymous: if no phone — ask to login with phone
    me = await loadMyProfile(authUser.uid);

    // admin?
    isAdmin = await checkAdmin(authUser.uid);

    // seed bots always (so all see them)
    await seedSystemBots();

    if (me) {
      setStarsUI(me.stars);
      showToast(`${APP_NAME}: вы вошли как ${me.username || "гость"}`, "success");
      closeModal("registerModal");
      listenChats();
    } else {
      // no profile => show modal to fill it (phone recommended)
      setStarsUI(0);
    }
  });

  // Bind special buttons if you want:
  // - Open stickers quickly by long press on star button etc.
  // Here: if you press Alt+S => stickers, Alt+P => premium emoji
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "s") openStickers();
    if (e.altKey && e.key.toLowerCase() === "p") openPremiumEmojiModal();
    if (e.altKey && e.key.toLowerCase() === "a" && isAdmin) openModal("adminModal");
  });

  // Add small “admin button” into profile menu area if exists
  // (Если у тебя профиль-меню уже другое — можно пропустить)
  if (isAdmin && $("profileBtn")) {
    $("profileBtn").title = "Админ: F2 или Alt+A";
  }

  // If your UI has a button for stickers, you can link it:
  // Example: if you create a button with id="stickersBtn"
  if ($("stickersBtn")) $("stickersBtn").onclick = openStickers;
}

main().catch(console.error);
