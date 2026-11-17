// ==============================================
// 配置
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let selectedImages = [];
let imageObjectUrls = [];
let selectedPaper = "paper-white";
let filterType = "other";
let allLetterData = [];
const PAGE_SIZE = 5;
let lettersPage = 1;
let lettersTotal = 0;
let recyclePage = 1;
let recycleTotal = 0;

// 当前聊天室（房间暗号），保存在本机
const ROOM_KEY = "letterRoom";
let currentRoom = (localStorage.getItem(ROOM_KEY) || "").trim();

// ======================
// 工具函数
// ======================
function getCurrentPage() {
  const path = location.pathname;
  if (path.endsWith("letters.html")) return "letters";
  if (path.endsWith("recycle.html")) return "recycle";
  return "index";
}

// ======================
// 通用 UI：轻提示 / 确认框 / 转义 / 空状态
// ======================
function showToast(message, type) {
  let container = document.querySelector(".toast-container");
  if (!container) {
    container = document.createElement("div");
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = "toast" + (type ? " toast-" + type : "");
  toast.textContent = message;
  container.appendChild(toast);

  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

function showConfirm(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "confirm-overlay";

    const box = document.createElement("div");
    box.className = "confirm-box";

    const text = document.createElement("p");
    text.textContent = message;

    const actions = document.createElement("div");
    actions.className = "confirm-actions";

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "confirm-cancel";
    cancelBtn.textContent = "取消";

    const okBtn = document.createElement("button");
    okBtn.className = "confirm-ok";
    okBtn.textContent = "确定";

    const close = (result) => {
      overlay.remove();
      resolve(result);
    };
    cancelBtn.addEventListener("click", () => close(false));
    okBtn.addEventListener("click", () => close(true));
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close(false);
    });

    actions.append(cancelBtn, okBtn);
    box.append(text, actions);
    overlay.appendChild(box);
    document.body.appendChild(overlay);
  });
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

function renderEmptyState(container, icon, text) {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const iconEl = document.createElement("div");
  iconEl.className = "empty-icon";
  iconEl.textContent = icon;

  const textEl = document.createElement("p");
  textEl.textContent = text;

  empty.append(iconEl, textEl);
  container.appendChild(empty);
}

// 发送成功时的信纸飞走 + 火漆印章动画
function playSendAnimation() {
  const wrap = document.createElement("div");
  wrap.className = "send-anim";
  wrap.innerHTML = '<div class="send-paper"></div><div class="send-seal">♥</div><div class="send-done">已寄出</div>';
  document.body.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1700);
}

function updateBottomNav() {
  const page = getCurrentPage();
  document.querySelectorAll(".bottom-nav-item").forEach(item => {
    item.classList.toggle("active", item.dataset.page === page);
  });
}

// ======================
// 草稿自动保存 + 自动长高
// ======================
// 草稿按房间分开存，换房间不会串内容
function draftKey() {
  return "letterDraft:" + (currentRoom || "none");
}

function loadDraft() {
  if (!contentTxt) return;
  contentTxt.value = localStorage.getItem(draftKey()) || "";
}

const contentTxt = document.getElementById("content");
if (contentTxt) {
  loadDraft();

  contentTxt.addEventListener("input", () => {
    localStorage.setItem(draftKey(), contentTxt.value);
  });
}

// ======================
// 图片上传
// ======================
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");

function renderImagePreview() {
  if (!imagePreview) return;

  imageObjectUrls.forEach(url => URL.revokeObjectURL(url));
  imageObjectUrls = [];
  imagePreview.innerHTML = "";

  selectedImages.forEach((file, index) => {
    const url = URL.createObjectURL(file);
    imageObjectUrls.push(url);

    const item = document.createElement("div");
    item.className = "thumb";

    const img = document.createElement("img");
    img.src = url;
    img.alt = file.name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.className = "thumb-remove";
    removeBtn.textContent = "×";
    removeBtn.addEventListener("click", () => {
      selectedImages.splice(index, 1);
      renderImagePreview();
    });

    item.append(img, removeBtn);
    imagePreview.appendChild(item);
  });
}

function clearSelectedImages() {
  selectedImages = [];
  renderImagePreview();
  if (imageInput) imageInput.value = "";
}

if (imageInput && imagePreview) {
  document.querySelector(".upload-area button")?.addEventListener("click", () => {
    imageInput.click();
  });

  imageInput.addEventListener("change", (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    selectedImages = files;
    renderImagePreview();
  });
}

async function uploadImage(file) {
  const fileName = Date.now() + "-" + file.name;
  const { data, error } = await client.storage
    .from("letter-images")
    .upload(fileName, file, { cacheControl: "3600" });

  if (error) {
    showToast("上传失败：" + error.message, "error");
    return null;
  }
  const { data: { publicUrl } } = client.storage.from("letter-images").getPublicUrl(fileName);
  return publicUrl;
}

// ======================
// 信纸预览切换
// ======================
const paperPicker = document.getElementById("paperPicker");

function selectPaper(cls) {
  selectedPaper = cls;
  if (paperPicker) {
    paperPicker.querySelectorAll(".paper-swatch").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.paper === cls);
    });
  }
  previewPaper(cls);
}

function previewPaper(cls) {
  if (!contentTxt) return;
  contentTxt.className = "";
  contentTxt.classList.add(cls);
}

if (paperPicker) {
  paperPicker.querySelectorAll(".paper-swatch").forEach(btn => {
    btn.addEventListener("click", () => selectPaper(btn.dataset.paper));
  });
  selectPaper(selectedPaper);
}

// ======================
// 暗黑模式
// ======================
(function initDarkMode() {
  const toggle = document.getElementById("darkToggle");
  if (!toggle) return;

  function syncThemeColor(isDark) {
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", isDark ? "#1a1a2e" : "#f0eadd");
  }

  const isDark = localStorage.getItem("darkMode") === "true";
  if (isDark) {
    document.body.classList.add("dark-mode");
    toggle.textContent = "☀️";
  }
  syncThemeColor(isDark);

  toggle.addEventListener("click", () => {
    const nowDark = document.body.classList.toggle("dark-mode");
    toggle.textContent = nowDark ? "☀️" : "🌙";
    localStorage.setItem("darkMode", nowDark);
    syncThemeColor(nowDark);
  });
})();

// ======================
// 图片大图查看
// ======================
function openImageViewer(src) {
  const viewer = document.createElement("div");
  viewer.className = "image-viewer";
  viewer.innerHTML = '<img src="' + src + '" alt="大图">';
  viewer.addEventListener("click", () => viewer.remove());
  document.body.appendChild(viewer);
}

// ======================
// 登录 / 注册 / 登出
// ======================
window.addEventListener("load", () => {
  checkAuth();
  checkRecoveryFlow();
});

async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return;
  applyRoom();
}

// ======================
// 聊天室（暗号）
// ======================
// 根据是否已选房间，决定显示暗号输入区还是写信/信件区
function applyRoom() {
  const authSection = document.getElementById("auth-section");
  const roomSection = document.getElementById("room-section");
  const letterSection = document.getElementById("letter-section");
  const bottomNav = document.getElementById("bottom-nav");
  if (authSection) authSection.style.display = "none";
  if (bottomNav) bottomNav.classList.toggle("is-visible", !!currentRoom);
  if (!roomSection || !letterSection) return;

  if (!currentRoom) {
    roomSection.style.display = "block";
    letterSection.style.display = "none";
    return;
  }

  roomSection.style.display = "none";
  letterSection.style.display = "block";
  loadDraft();

  const roomLabel = document.getElementById("room-label");
  if (roomLabel) {
    roomLabel.textContent = "";
    const codeEl = document.createElement("span");
    codeEl.className = "room-code";
    codeEl.textContent = currentRoom;
    roomLabel.append("聊天室 ", codeEl);
  }

  const page = getCurrentPage();
  if (page === "letters") { lettersPage = 1; loadLettersFilter("other"); }
  if (page === "recycle") { recyclePage = 1; loadRecycle(); }
}

function enterRoom() {
  const input = document.getElementById("roomCode");
  const code = (input ? input.value : "").trim();
  if (!/^\d{4,20}$/.test(code)) return showToast("请输入 4~20 位数字暗号", "error");

  currentRoom = code;
  localStorage.setItem(ROOM_KEY, code);
  if (input) input.value = "";
  applyRoom();
}

async function switchRoom() {
  const ok = await showConfirm("切换聊天室？本房间的草稿会保留，下次输入同一暗号还能继续写。");
  if (!ok) return;

  currentRoom = "";
  localStorage.removeItem(ROOM_KEY);

  // 清掉写信念头的临时状态，避免带进另一个房间
  clearSelectedImages();
  applyRoom();
}

// 检测是否从重置密码邮件链接跳转回来
async function checkRecoveryFlow() {
  const hash = window.location.hash;
  if (!hash.includes("type=recovery")) return;

  // Supabase SDK 会自动从 hash 中解析 token 并设置 session
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    document.getElementById("reset-pwd-section").style.display = "block";
  }
}

async function register() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email) return showToast("请输入邮箱");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast("邮箱格式不正确", "error");
  if (password.length < 6) return showToast("密码至少 6 位", "error");

  const { error } = await client.auth.signUp({ email, password });
  if (error) showToast(error.message, "error");
  else showToast("注册成功！请登录", "success");
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) return showToast("请输入邮箱和密码", "error");

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) showToast(error.message, "error");
  else location.reload();
}

async function forgotPassword() {
  const email = document.getElementById("email").value.trim();
  if (!email) return showToast("请先输入邮箱地址", "error");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showToast("邮箱格式不正确", "error");

  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: location.origin + location.pathname,
  });
  if (error) showToast(error.message, "error");
  else showToast("重置密码邮件已发送，请查收邮箱", "success");
}

async function resetPassword() {
  const newPassword = document.getElementById("new-password").value;
  if (newPassword.length < 6) return showToast("新密码至少 6 位", "error");

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) showToast(error.message, "error");
  else {
    showToast("密码重置成功！请用新密码登录", "success");
    setTimeout(() => location.reload(), 800);
  }
}

// ======================
// 按钮事件绑定
// ======================
document.getElementById("btn-login")?.addEventListener("click", login);
document.getElementById("btn-register")?.addEventListener("click", register);
document.getElementById("btn-forgot")?.addEventListener("click", forgotPassword);
document.getElementById("btn-reset-pwd")?.addEventListener("click", resetPassword);
document.getElementById("btn-enter-room")?.addEventListener("click", enterRoom);
document.getElementById("btn-switch-room")?.addEventListener("click", switchRoom);
document.getElementById("roomCode")?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") enterRoom();
});
document.getElementById("btn-send")?.addEventListener("click", sendLetter);
document.getElementById("btn-filter-me")?.addEventListener("click", () => loadLettersFilter("me"));
document.getElementById("btn-filter-other")?.addEventListener("click", () => loadLettersFilter("other"));
updateBottomNav();

// ======================
// 发送信件
// ======================
async function sendLetter() {
  const btnSend = document.getElementById("btn-send");
  const content = document.getElementById("content").value;
  if (!content && selectedImages.length === 0) return showToast("请输入内容或选择图片");

  btnSend.disabled = true;
  btnSend.textContent = "发送中…";

  try {
    let finalContent = content;
    if (selectedImages.length > 0) {
      const uploadTasks = selectedImages.map(file => uploadImage(file));
      const imageUrls = await Promise.all(uploadTasks);
      const validUrls = imageUrls.filter(url => url !== null);
      if (validUrls.length === 0) return;
      const imageMarkdown = validUrls.map(url => "![img](" + url + ")").join("\n");
      finalContent = content
        ? content + "\n" + imageMarkdown
        : imageMarkdown;
      clearSelectedImages();
    }

    const { data: { user } } = await client.auth.getUser();
    if (!user) return showToast("请先登录", "error");
    if (!currentRoom) return showToast("请先输入聊天室暗号", "error");

    const { error } = await client.from("letters").insert([{
      sender: user.email,
      content: finalContent,
      paper_style: selectedPaper,
      room_code: currentRoom,
      is_deleted: false
    }]);

    if (error) return showToast("发送失败：" + error.message, "error");

    localStorage.removeItem(draftKey());
    document.getElementById("content").value = "";
    playSendAnimation();
    showToast("信件已寄出", "success");
  } finally {
    btnSend.disabled = false;
    btnSend.textContent = "发送信件";
  }
}

// ======================
// 信件列表
// ======================
async function loadLettersFilter(type) {
  filterType = type;
  lettersPage = 1;
  updateFilterButtons();
  loadLetters();
}

function updateFilterButtons() {
  document.getElementById("btn-filter-me")?.classList.toggle("active", filterType === "me");
  document.getElementById("btn-filter-other")?.classList.toggle("active", filterType === "other");
}

async function loadLetters() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return showToast("登录已过期，请重新登录", "error");

  let query = client.from("letters")
    .select("*", { count: "exact" })
    .eq("is_deleted", false)
    .eq("room_code", currentRoom)
    .order("created_at", { ascending: false });

  if (filterType === "me") {
    query = query.eq("sender", user.email);
  } else {
    query = query.neq("sender", user.email);
  }

  const start = (lettersPage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;
  const { data, count } = await query.range(start, end);
  lettersTotal = count || 0;
  allLetterData = data;

  // 如果当前页没数据了，回退到上一页
  if (data.length === 0 && lettersTotal > 0 && lettersPage > 1) {
    lettersPage--;
    loadLetters();
    return;
  }

  const list = document.getElementById("letters-list");
  list.innerHTML = "";

  if (lettersTotal === 0) {
    renderEmptyState(list, "✉️", filterType === "me" ? "你还没有寄出过信" : "还没有收到信");
  } else {
    data.forEach(letter => {
      list.appendChild(buildLetterCard(letter, user.email, "normal"));
    });
  }

  // 分页控件
  renderLettersPagination();
}

// 生成信件卡片（信箱和回收站共用）
function buildLetterCard(letter, myEmail, mode) {
  const isMine = letter.sender === myEmail;
  const paper = letter.paper_style || "paper-white";
  const previewText = letter.content.replace(/!\[img]\(.*?\)/g, "[图片]");
  const firstImgMatch = letter.content.match(/!\[img]\((.*?)\)/);
  const firstImg = firstImgMatch ? firstImgMatch[1] : "";

  const card = document.createElement("div");
  card.className = "letter-card " + paper;

  const meta = document.createElement("div");
  meta.className = "card-meta";

  const badge = document.createElement("span");
  badge.className = "letter-badge " + (isMine ? "badge-out" : "badge-in");
  badge.textContent = isMine ? "我寄出" : "对方寄来";

  const time = document.createElement("span");
  time.className = "letter-time";
  time.textContent = formatLetterDateTime(letter);

  meta.append(badge, time);

  const previewEl = document.createElement("div");
  previewEl.className = "letter-preview";
  previewEl.innerHTML = escapeHtml(previewText);
  previewEl.addEventListener("click", () => openFullLetter(letter));

  card.append(meta, previewEl);

  if (firstImg) {
    const thumb = document.createElement("img");
    thumb.className = "card-thumb";
    thumb.src = firstImg;
    thumb.alt = "";
    thumb.loading = "lazy";
    thumb.addEventListener("click", () => openFullLetter(letter));
    card.appendChild(thumb);
  }

  const btnRow = document.createElement("div");
  btnRow.className = "card-btn-row";

  if (mode === "recycle") {
    const restoreBtn = document.createElement("button");
    restoreBtn.className = "btn-restore";
    restoreBtn.textContent = "恢复";
    restoreBtn.addEventListener("click", () => recoverLetter(letter.id));

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "btn-delete-full";
    deleteBtn.textContent = "彻底删除";
    deleteBtn.addEventListener("click", () => hardDelete(letter.id));

    btnRow.append(restoreBtn, deleteBtn);
  } else {
    const imgBtn = document.createElement("button");
    imgBtn.className = "save-img-btn-sm";
    imgBtn.textContent = "存长图";
    imgBtn.addEventListener("click", () => saveFullLetterAsImg(letter.id));

    const pdfBtn = document.createElement("button");
    pdfBtn.className = "save-pdf-btn-sm";
    pdfBtn.textContent = "存PDF";
    pdfBtn.addEventListener("click", () => saveFullLetterAsPdf(letter.id));

    const delBtn = document.createElement("button");
    delBtn.className = "card-del-btn-sm";
    delBtn.textContent = "删除";
    delBtn.addEventListener("click", () => del(letter.id));

    btnRow.append(imgBtn, pdfBtn, delBtn);
  }

  card.appendChild(btnRow);
  return card;
}

function renderLettersPagination() {
  const list = document.getElementById("letters-list");
  // 移除旧的分页控件
  document.querySelectorAll(".pagination").forEach(el => el.remove());

  const totalPages = Math.ceil(lettersTotal / PAGE_SIZE);
  if (totalPages <= 1) return;

  const nav = document.createElement("div");
  nav.className = "pagination";
  nav.innerHTML = `
    <button class="page-prev" ${lettersPage <= 1 ? "disabled" : ""}>上一页</button>
    <span class="page-info">${lettersPage} / ${totalPages}</span>
    <button class="page-next" ${lettersPage >= totalPages ? "disabled" : ""}>下一页</button>
  `;

  nav.querySelector(".page-prev").addEventListener("click", () => {
    if (lettersPage > 1) { lettersPage--; loadLetters(); }
  });
  nav.querySelector(".page-next").addEventListener("click", () => {
    if (lettersPage < totalPages) { lettersPage++; loadLetters(); }
  });

  list.after(nav);
}

// ======================
// 打开信件弹窗
// ======================
function openFullLetter(letter) {
  const modal = document.createElement("div");
  modal.className = "letter-modal";
  const close = () => modal.remove();

  const closeBtn = document.createElement("button");
  closeBtn.className = "close-btn";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", close);

  const shell = document.createElement("div");
  shell.className = "modal-shell";

  const contentDiv = document.createElement("div");
  contentDiv.className = "modal-content " + (letter.paper_style || "paper-white");

  let htmlContent = letter.content.replace(/!\[img]\((.*?)\)/g, '<img src="$1" style="max-width:100%;border-radius:10px;">');
  // 正文每段独立成块、各自首行缩进 2em
  htmlContent = htmlContent.split('\n').map(line =>
    line === ''
      ? '<br>'
      : '<div style="text-indent:2em;white-space:pre-wrap;">' + line + '</div>'
  ).join('\n');
  contentDiv.innerHTML = htmlContent;

  // 底部：发送时间 + 操作按钮
  const footer = document.createElement("div");
  footer.className = "modal-footer";

  const timeEl = document.createElement("div");
  timeEl.className = "modal-time";
  timeEl.textContent = "写于 " + formatLetterDateTime(letter);
  footer.appendChild(timeEl);

  const actions = document.createElement("div");
  actions.className = "modal-actions";

  const addAction = (label, className, handler) => {
    const btn = document.createElement("button");
    btn.className = className;
    btn.textContent = label;
    btn.addEventListener("click", handler);
    actions.appendChild(btn);
  };

  if (letter.is_deleted) {
    addAction("恢复", "btn-success", async () => {
      await recoverLetter(letter.id);
      close();
    });
    addAction("彻底删除", "btn-danger", async () => {
      if (await hardDelete(letter.id)) close();
    });
  } else {
    if (getCurrentPage() === "letters") {
      addAction("存长图", "", () => saveFullLetterAsImg(letter.id));
      addAction("存PDF", "", () => saveFullLetterAsPdf(letter.id));
    }
    addAction("删除", "btn-danger", async () => {
      if (await del(letter.id)) close();
    });
  }

  footer.appendChild(actions);
  shell.append(contentDiv, footer);
  modal.append(closeBtn, shell);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.body.appendChild(modal);

  // 图片点击放大
  modal.querySelectorAll(".modal-content img").forEach(img => {
    img.style.cursor = "zoom-in";
    img.addEventListener("click", (e) => {
      e.stopPropagation();
      openImageViewer(img.src);
    });
  });
}

function getFullLetterById(id) {
  return allLetterData.find(item => item.id === id);
}

// 把信件的发送时间转成本机时区的 Date（缺失或非法时退回当前时间）
function getLetterDate(letter) {
  const date = letter && letter.created_at ? new Date(letter.created_at) : new Date();
  return isNaN(date.getTime()) ? new Date() : date;
}

// 用信件发送时间生成文件名时间戳（YYYYMMDD_HHmm，按本机时区显示）
function formatLetterTimestamp(letter) {
  const date = getLetterDate(letter);
  return date.getFullYear()
    + String(date.getMonth() + 1).padStart(2, '0')
    + String(date.getDate()).padStart(2, '0') + "_"
    + String(date.getHours()).padStart(2, '0')
    + String(date.getMinutes()).padStart(2, '0');
}

// 信箱/回收站里显示的具体发送时间（YYYY/MM/DD HH:mm）
function formatLetterDateTime(letter) {
  const date = getLetterDate(letter);
  return date.getFullYear() + "/"
    + String(date.getMonth() + 1).padStart(2, '0') + "/"
    + String(date.getDate()).padStart(2, '0') + " "
    + String(date.getHours()).padStart(2, '0') + ":"
    + String(date.getMinutes()).padStart(2, '0');
}

// ======================
// 保存完整长图
// ======================
async function saveFullLetterAsImg(id) {
    if (!window.html2canvas) {
        showToast("请先引入 html2canvas 库！", "error");
        return;
    }

    const letter = getFullLetterById(id);
    if (!letter) {
        showToast("未找到信件数据", "error");
        return;
    }

    const loadingMsg = document.createElement('div');
    loadingMsg.textContent = '正在生成图片，请稍候...';
    loadingMsg.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); color:white; padding:12px 24px; border-radius:40px; z-index:10000; font-size:14px;';
    document.body.appendChild(loadingMsg);

    try {
        const tempDiv = document.createElement("div");
        tempDiv.style.cssText = 'position: fixed; top: 0; left: 0; width: 500px; max-width: 90vw; z-index: -9999; opacity: 0; pointer-events: none;';

        const contentDiv = document.createElement("div");
        contentDiv.className = "modal-content " + (letter.paper_style || "paper-white");
        contentDiv.style.cssText = 'padding: 40px 35px; font-size: 16px; line-height: 1.8; white-space: pre-wrap; word-break: break-word; height: auto; overflow: visible; max-height: none;';

        let htmlContent = letter.content;
        htmlContent = htmlContent.replace(/!\[img]\((.*?)\)/g, '<img src="$1" style="max-width:100%; border-radius:12px; margin:16px 0; display:block;" crossorigin="anonymous">');
        htmlContent = htmlContent.replace(/\n/g, '<br>');
        contentDiv.innerHTML = htmlContent;

        tempDiv.appendChild(contentDiv);
        document.body.appendChild(tempDiv);

        const images = contentDiv.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = () => resolve();
            });
        }));

        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(contentDiv, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false,
            allowTaint: false
        });

        const timestamp = formatLetterTimestamp(letter);

        const link = document.createElement("a");
        link.download = "信件_" + timestamp + ".png";
        link.href = canvas.toDataURL("image/png");
        link.click();

        showToast("已保存成功", "success");
        document.body.removeChild(tempDiv);

    } catch (error) {
        console.error('保存失败:', error);
        showToast("保存失败：" + error.message, "error");
    } finally {
        if (loadingMsg.parentNode) loadingMsg.parentNode.removeChild(loadingMsg);
    }
}

// ======================
// 保存完整PDF
// ======================
async function saveFullLetterAsPdf(id) {
    if (!window.jspdf || !window.html2canvas) {
        showToast("请先引入依赖库！", "error");
        return;
    }

    const { jsPDF } = window.jspdf;
    const letter = getFullLetterById(id);
    if (!letter) return;

    const loadingMsg = document.createElement('div');
    loadingMsg.textContent = '正在生成PDF，请稍候...';
    loadingMsg.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); color:white; padding:12px 24px; border-radius:40px; z-index:10000;';
    document.body.appendChild(loadingMsg);

    try {
        const tempDiv = document.createElement("div");
        tempDiv.style.cssText = 'position:fixed; top:0; left:0; width:500px; max-width:90vw; z-index:-9999; opacity:0; pointer-events:none;';

        const contentDiv = document.createElement("div");
        contentDiv.className = "modal-content " + (letter.paper_style || "paper-white");
        contentDiv.style.cssText = 'padding:40px 35px; font-size:16px; line-height:1.8; white-space:pre-wrap; word-break:break-word; height:auto; overflow:visible; max-height:none;';

        let htmlContent = letter.content;
        htmlContent = htmlContent.replace(/!\[img]\((.*?)\)/g, '<img src="$1" style="max-width:100%; border-radius:12px; margin:16px 0; display:block;" crossorigin="anonymous">');
        htmlContent = htmlContent.replace(/\n/g, '<br>');
        contentDiv.innerHTML = htmlContent;

        tempDiv.appendChild(contentDiv);
        document.body.appendChild(tempDiv);

        const images = contentDiv.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise(resolve => { img.onload = resolve; img.onerror = resolve; });
        }));

        await new Promise(resolve => setTimeout(resolve, 300));

        const canvas = await html2canvas(contentDiv, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false
        });

        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const pdf = new jsPDF({
            orientation: canvas.height > canvas.width ? "portrait" : "landscape",
            unit: "px",
            format: [canvas.width, canvas.height]
        });

        pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);

        const timestamp = formatLetterTimestamp(letter);

        pdf.save("信件_" + timestamp + ".pdf");
        showToast("PDF保存成功", "success");

        document.body.removeChild(tempDiv);
    } catch (error) {
        console.error('PDF生成失败:', error);
        showToast("生成失败：" + error.message, "error");
    } finally {
        if (loadingMsg.parentNode) loadingMsg.parentNode.removeChild(loadingMsg);
    }
}

// ======================
// 删除到回收站
// ======================
async function del(id) {
  const ok = await showConfirm("确定删除？可在回收站找回");
  if (!ok) return false;

  await client.from("letters").update({ is_deleted: true }).eq("id", id).eq("room_code", currentRoom);
  showToast("已移入回收站");
  loadLetters();
  return true;
}

// ======================
// 回收站
// ======================
async function loadRecycle() {
  const { data: { user } } = await client.auth.getUser();
  if (!user) return showToast("登录已过期，请重新登录", "error");

  const start = (recyclePage - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;
  const { data, count } = await client.from("letters")
    .select("*", { count: "exact" })
    .eq("is_deleted", true)
    .eq("room_code", currentRoom)
    .order("created_at", { ascending: false })
    .range(start, end);

  recycleTotal = count || 0;

  // 如果当前页没数据了，回退到上一页
  if (data.length === 0 && recycleTotal > 0 && recyclePage > 1) {
    recyclePage--;
    loadRecycle();
    return;
  }

  const list = document.getElementById("recycle-list");
  list.innerHTML = "";

  if (recycleTotal === 0) {
    renderEmptyState(list, "🗑️", "回收站是空的");
  } else {
    data.forEach(letter => {
      list.appendChild(buildLetterCard(letter, user.email, "recycle"));
    });
  }

  renderRecyclePagination();
}

function renderRecyclePagination() {
  const list = document.getElementById("recycle-list");
  document.querySelectorAll(".pagination").forEach(el => el.remove());
  const totalPages = Math.ceil(recycleTotal / PAGE_SIZE);
  if (totalPages <= 1) return;

  const nav = document.createElement("div");
  nav.className = "pagination";
  nav.innerHTML = `
    <button class="page-prev" ${recyclePage <= 1 ? "disabled" : ""}>上一页</button>
    <span class="page-info">${recyclePage} / ${totalPages}</span>
    <button class="page-next" ${recyclePage >= totalPages ? "disabled" : ""}>下一页</button>
  `;

  nav.querySelector(".page-prev").addEventListener("click", () => {
    if (recyclePage > 1) { recyclePage--; loadRecycle(); }
  });
  nav.querySelector(".page-next").addEventListener("click", () => {
    if (recyclePage < totalPages) { recyclePage++; loadRecycle(); }
  });

  list.after(nav);
}

async function recoverLetter(id) {
  await client.from("letters").update({ is_deleted: false }).eq("id", id).eq("room_code", currentRoom);
  showToast("已恢复", "success");
  loadRecycle();
}

async function hardDelete(id) {
  const ok = await showConfirm("确定永久删除？不可恢复！");
  if (!ok) return false;

  await client.from("letters").delete().eq("id", id).eq("room_code", currentRoom);
  showToast("已彻底删除", "success");
  loadRecycle();
  return true;
}
