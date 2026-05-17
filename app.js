// ==============================================
// 配置
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let selectedImage = null;
let filterType = "other";
let allLetterData = [];
let selectedMood = "";

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
// 草稿自动保存 + 自动长高
// ======================
const contentTxt = document.getElementById("content");
if (contentTxt) {
  let draft = localStorage.getItem("letterDraft");
  if (draft) contentTxt.value = draft;

  contentTxt.addEventListener("input", () => {
    localStorage.setItem("letterDraft", contentTxt.value);
  });
}

// ======================
// 心情输入
// ======================
const moodInput = document.getElementById("moodInput");
const moodShow = document.getElementById("moodShow");

function updateMood() {
  const val = moodInput.value.trim();
  selectedMood = val;
  moodShow.innerText = val ? "今日心情：" + val : "";
}

if (moodInput) {
  moodInput.addEventListener("input", updateMood);
}

// ======================
// 图片上传
// ======================
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
if (imageInput && imagePreview) {
  document.querySelector(".upload-area button")?.addEventListener("click", () => {
    imageInput.click();
  });

  imageInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;
    imagePreview.innerText = "已选择：" + file.name;
    selectedImage = file;
  });
}

async function uploadImage(file) {
  const fileName = Date.now() + "-" + file.name;
  const { data, error } = await client.storage
    .from("letter-images")
    .upload(fileName, file, { cacheControl: "3600" });

  if (error) {
    alert("上传失败：" + error.message);
    return null;
  }
  const { data: { publicUrl } } = client.storage.from("letter-images").getPublicUrl(fileName);
  return publicUrl;
}

// ======================
// 信纸预览切换
// ======================
const paperSelect = document.getElementById("paperSelect");
if (paperSelect) {
  paperSelect.addEventListener("change", (e) => previewPaper(e.target.value));
}

function previewPaper(cls) {
  if (!contentTxt) return;
  contentTxt.className = "";
  contentTxt.classList.add(cls);
}

// ======================
// 登录 / 注册 / 登出
// ======================
window.addEventListener("load", checkAuth);

async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    const authSection = document.getElementById("auth-section");
    const letterSection = document.getElementById("letter-section");
    if (authSection) authSection.style.display = "none";
    if (letterSection) letterSection.style.display = "block";

    const page = getCurrentPage();
    if (page === "letters") loadLettersFilter("other");
    if (page === "recycle") loadRecycle();
  }
}

async function register() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email) return alert("请输入邮箱");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("邮箱格式不正确");
  if (password.length < 6) return alert("密码至少 6 位");

  const { error } = await client.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert("注册成功！请登录");
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  if (!email || !password) return alert("请输入邮箱和密码");

  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  else location.reload();
}

async function logout() {
  await client.auth.signOut();
  location.reload();
}

// ======================
// 按钮事件绑定
// ======================
document.getElementById("btn-login")?.addEventListener("click", login);
document.getElementById("btn-register")?.addEventListener("click", register);
document.getElementById("btn-logout")?.addEventListener("click", logout);
document.getElementById("btn-send")?.addEventListener("click", sendLetter);
document.getElementById("btn-filter-me")?.addEventListener("click", () => loadLettersFilter("me"));
document.getElementById("btn-filter-other")?.addEventListener("click", () => loadLettersFilter("other"));

// ======================
// 发送信件
// ======================
async function sendLetter() {
  const content = document.getElementById("content").value;
  if (!content && !selectedImage) return alert("请输入内容或选择图片");

  let finalContent = content;
  if (selectedImage) {
    const imageUrl = await uploadImage(selectedImage);
    if (!imageUrl) return;
    finalContent = content ? content + "\n![img](" + imageUrl + ")" : "![img](" + imageUrl + ")";
    selectedImage = null;
    imagePreview.innerText = "";
    imageInput.value = "";
  }

  finalContent = selectedMood
    ? "【今日心情：" + selectedMood + "】\n" + finalContent
    : finalContent;

  const paper = document.getElementById("paperSelect")?.value || "paper-white";

  const { data: { user } } = await client.auth.getUser();
  if (!user) return alert("请先登录");

  const { error } = await client.from("letters").insert([{
    sender: user.email,
    content: finalContent,
    paper_style: paper,
    is_deleted: false
  }]);

  if (error) return alert("发送失败：" + error.message);

  localStorage.removeItem("letterDraft");
  selectedMood = "";
  moodInput.value = "";
  moodShow.innerText = "";
  document.getElementById("content").value = "";
  alert("发送成功！");
}

// ======================
// 信件列表
// ======================
async function loadLettersFilter(type) {
  filterType = type;
  loadLetters();
}

async function loadLetters() {
  const { data: { user } } = await client.auth.getUser();
  let query = client.from("letters")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (filterType === "me") {
    query = query.eq("sender", user.email);
  } else {
    query = query.neq("sender", user.email);
  }

  const { data } = await query;
  allLetterData = data;
  const list = document.getElementById("letters-list");
  list.innerHTML = "";

  data.forEach(letter => {
    let preview = letter.content.replace(/!\[img]\(.*?\)/g, "[图片]").slice(0, 30) + "...";
    const paper = letter.paper_style || "paper-white";

    const card = document.createElement("div");
    card.className = "letter-card " + paper;

    card.innerHTML = `
      <div class="letter-preview">${preview}</div>
      <div class="letter-time">${new Date(letter.created_at).toLocaleDateString()}</div>
      <div class="card-btn-row">
        <button class="save-img-btn-sm" data-id="${letter.id}">存长图</button>
        <button class="save-pdf-btn-sm" data-id="${letter.id}">存PDF</button>
        <button class="card-del-btn-sm" data-id="${letter.id}">删除</button>
      </div>
    `;

    card.querySelector(".letter-preview").addEventListener("click", () => openFullLetter(letter));
    card.querySelector(".save-img-btn-sm").addEventListener("click", () => saveFullLetterAsImg(letter.id));
    card.querySelector(".save-pdf-btn-sm").addEventListener("click", () => saveFullLetterAsPdf(letter.id));
    card.querySelector(".card-del-btn-sm").addEventListener("click", () => del(letter.id));

    list.appendChild(card);
  });
}

// ======================
// 打开信件弹窗
// ======================
function openFullLetter(letter) {
  const modal = document.createElement("div");
  modal.className = "letter-modal";
  modal.innerHTML = `
    <button class="close-btn">×</button>
    <div class="modal-content ${letter.paper_style || 'paper-white'}">
      ${letter.content.replace(/!\[img]\((.*?)\)/g, '<img src="$1" style="max-width:100%;border-radius:10px;">')}
    </div>
  `;
  modal.querySelector(".close-btn").addEventListener("click", () => modal.remove());
  modal.addEventListener("click", (e) => {
    if (e.target === modal) modal.remove();
  });
  document.body.appendChild(modal);
}

function getFullLetterById(id) {
  return allLetterData.find(item => item.id === id);
}

// ======================
// 保存完整长图
// ======================
async function saveFullLetterAsImg(id) {
    if (!window.html2canvas) {
        alert("请先引入 html2canvas 库！");
        return;
    }

    const letter = getFullLetterById(id);
    if (!letter) {
        alert("未找到信件数据");
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

        const now = new Date();
        const timestamp = now.getFullYear()
          + String(now.getMonth() + 1).padStart(2, '0')
          + String(now.getDate()).padStart(2, '0') + "_"
          + String(now.getHours()).padStart(2, '0')
          + String(now.getMinutes()).padStart(2, '0');

        const link = document.createElement("a");
        link.download = "信件_" + timestamp + ".png";
        link.href = canvas.toDataURL("image/png");
        link.click();

        alert("已保存成功！");
        document.body.removeChild(tempDiv);

    } catch (error) {
        console.error('保存失败:', error);
        alert("保存失败：" + error.message);
    } finally {
        if (loadingMsg.parentNode) loadingMsg.parentNode.removeChild(loadingMsg);
    }
}

// ======================
// 保存完整PDF
// ======================
async function saveFullLetterAsPdf(id) {
    if (!window.jspdf || !window.html2canvas) {
        alert("请先引入依赖库！");
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

        const now = new Date();
        const timestamp = now.getFullYear()
          + String(now.getMonth() + 1).padStart(2, '0')
          + String(now.getDate()).padStart(2, '0') + "_"
          + String(now.getHours()).padStart(2, '0')
          + String(now.getMinutes()).padStart(2, '0');

        pdf.save("信件_" + timestamp + ".pdf");
        alert("PDF保存成功！");

        document.body.removeChild(tempDiv);
    } catch (error) {
        console.error('PDF生成失败:', error);
        alert("生成失败：" + error.message);
    } finally {
        if (loadingMsg.parentNode) loadingMsg.parentNode.removeChild(loadingMsg);
    }
}

// ======================
// 删除到回收站
// ======================
async function del(id) {
  if (!confirm("确定删除？可在回收站找回")) return;
  await client.from("letters").update({ is_deleted: true }).eq("id", id);
  loadLetters();
}

// ======================
// 回收站
// ======================
async function loadRecycle() {
  const { data: { user } } = await client.auth.getUser();
  const { data } = await client.from("letters")
    .select("*")
    .eq("is_deleted", true)
    .order("created_at", { ascending: false });

  const list = document.getElementById("recycle-list");
  list.innerHTML = "";

  data.forEach(letter => {
    let preview = letter.content.replace(/!\[img]\(.*?\)/g, "[图片]").slice(0, 30) + "...";
    const paper = letter.paper_style || "paper-white";

    const card = document.createElement("div");
    card.className = "letter-card " + paper;
    card.innerHTML = `
      <div class="letter-preview">${preview}</div>
      <div class="letter-time">${new Date(letter.created_at).toLocaleDateString()}</div>
      <div class="card-btn-group">
        <button class="btn-restore" data-id="${letter.id}">恢复</button>
        <button class="btn-delete-full" data-id="${letter.id}">彻底删除</button>
      </div>
    `;

    card.querySelector(".letter-preview").addEventListener("click", () => openFullLetter(letter));
    card.querySelector(".btn-restore").addEventListener("click", () => recoverLetter(letter.id));
    card.querySelector(".btn-delete-full").addEventListener("click", () => hardDelete(letter.id));
    list.appendChild(card);
  });
}

async function recoverLetter(id) {
  await client.from("letters").update({ is_deleted: false }).eq("id", id);
  alert("已恢复！");
  loadRecycle();
}

async function hardDelete(id) {
  if (!confirm("确定永久删除？不可恢复！")) return;
  await client.from("letters").delete().eq("id", id);
  loadRecycle();
}
