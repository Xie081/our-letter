// ==============================================
// 你的配置
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let selectedImage = null;
let filterType = "other";
// 全局存当前所有信件完整数据，用于保存整封
let allLetterData = [];

// ======================
// 草稿自动保存 + 输入框自动长高
// ======================
const contentTxt = document.getElementById("content");
if (contentTxt) {
  let draft = localStorage.getItem("letterDraft");
  if (draft) contentTxt.value = draft;

  contentTxt.addEventListener("input", () => {
    localStorage.setItem("letterDraft", contentTxt.value);
    contentTxt.style.height = "auto";
    contentTxt.style.height = contentTxt.scrollHeight + "px";
  });

  contentTxt.style.height = "auto";
  contentTxt.style.height = contentTxt.scrollHeight + "px";
}

// ======================
// 心情输入（保留）
// ======================
function updateMood() {
  const val = document.getElementById("moodInput").value.trim();
  window.selectedMood = val;
  document.getElementById("moodShow").innerText = val ? `今日心情：${val}` : "";
}

const moodInput = document.getElementById("moodInput");
if (moodInput) {
  moodInput.addEventListener("input", updateMood);
}

// ======================
// 图片上传 —— 只显示文件名，不显示大图
// ======================
const imageInput = document.getElementById("imageInput");
if (imageInput) {
  imageInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    document.getElementById("imagePreview").innerText = "已选择：" + file.name;
    selectedImage = file;
  });
}

async function uploadImage(file) {
  const fileName = `${Date.now()}-${file.name}`;
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
function previewPaper(cls) {
  if (!contentTxt) return;
  contentTxt.className = "";
  contentTxt.classList.add(cls);
}

// ======================
// 登录 / 注册
// ======================
window.onload = checkAuth;

async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("letter-section").style.display = "block";

    if (location.pathname.includes("letters.html")) {
      loadLettersFilter("other");
    }
    if (location.pathname.includes("recycle.html")) {
      loadRecycle();
    }
  }
}

async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await client.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert("注册成功！请登录");
}

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  else location.reload();
}

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
    finalContent = content ? `${content}\n![img](${imageUrl})` : `![img](${imageUrl})`;
    selectedImage = null;
    document.getElementById("imagePreview").innerText = "";
    document.getElementById("imageInput").value = "";
  }

  const mood = window.selectedMood || "";
  const finalContentWithMood = mood
    ? `【今日心情：${mood}】\n${finalContent}`
    : finalContent;

  const paper = document.getElementById("paperSelect")?.value || "paper-white";

  const { data: { user } } = await client.auth.getUser();
  await client.from("letters").insert([{
    sender: user.email,
    content: finalContentWithMood,
    paper_style: paper,
    is_deleted: false
  }]);

  localStorage.removeItem("letterDraft");
  window.selectedMood = "";
  document.getElementById("moodInput").value = "";
  document.getElementById("moodShow").innerText = "";
  document.getElementById("content").value = "";
  contentTxt.style.height = "120px";
  alert("发送成功！");
}

// ======================
// 信件列表 卡片底部放保存按钮 + 删除缩小
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
    let preview = letter.content.replace(/!\[img].*?]/g, "[图片]").slice(0, 30) + "...";
    const paper = letter.paper_style || "paper-white";

    const card = document.createElement("div");
    card.className = `letter-card ${paper}`;
    // 卡片结构：预览文字 + 时间 + 底部保存按钮 + 右上角小删除
    card.innerHTML = `
      <div class="letter-preview">${preview}</div>
      <div class="letter-time">${new Date(letter.created_at).toLocaleDateString()}</div>
      <button class="card-del-btn-sm" onclick="del(${letter.id})">删除</button>
      <div class="card-save-row">
        <button class="save-img-btn-sm" onclick="saveFullLetterAsImg(${letter.id})">存长图</button>
        <button class="save-pdf-btn-sm" onclick="saveFullLetterAsPdf(${letter.id})">存PDF</button>
      </div>
    `;

    card.querySelector(".letter-preview").onclick = () => openFullLetter(letter);
    list.appendChild(card);
  });
}

// 打开信件弹窗 无保存按钮
function openFullLetter(letter) {
  const modal = document.createElement("div");
  modal.className = "letter-modal";
  modal.innerHTML = `
    <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    <div class="modal-content ${letter.paper_style || 'paper-white'}">
      ${letter.content.replace(/!\[img]\((.*?)\)/g, '<img src="$1" style="max-width:100%;border-radius:10px;">')}
    </div>
  `;
  document.body.appendChild(modal);
}

// 根据id取完整信件 保存整封
function getFullLetterById(id) {
  return allLetterData.find(item => item.id === id);
}

// ======================
// 保存完整长图 - 最稳定版本
// ======================
async function saveFullLetterAsImg(id) {
    if (!window.html2canvas) {
        alert("请先引入 html2canvas 库！\n在HTML中添加：<script src='https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js'></script>");
        return;
    }
    
    const letter = getFullLetterById(id);
    if (!letter) {
        alert("未找到信件数据");
        return;
    }

    // 显示加载提示
    const loadingMsg = document.createElement('div');
    loadingMsg.textContent = '正在生成图片，请稍候...';
    loadingMsg.style.cssText = 'position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); background:rgba(0,0,0,0.8); color:white; padding:12px 24px; border-radius:40px; z-index:10000; font-size:14px;';
    document.body.appendChild(loadingMsg);

    try {
        // 创建临时容器 - 关键：设置高度自动，让内容完全展开
        const tempDiv = document.createElement("div");
        tempDiv.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 500px;
            max-width: 90vw;
            z-index: -9999;
            opacity: 0;
            pointer-events: none;
        `;
        
        // 内容容器
        const contentDiv = document.createElement("div");
        contentDiv.className = `modal-content ${letter.paper_style || 'paper-white'}`;
        contentDiv.style.cssText = `
            padding: 40px 35px;
            font-size: 16px;
            line-height: 1.8;
            white-space: pre-wrap;
            word-break: break-word;
            height: auto;
            overflow: visible;
            max-height: none;
        `;
        
        // 处理内容：转换图片和换行
        let htmlContent = letter.content;
        htmlContent = htmlContent.replace(/!\[img]\((.*?)\)/g, (match, url) => {
            return `<img src="${url}" style="max-width:100%; border-radius:12px; margin:16px 0; display:block;" crossorigin="anonymous">`;
        });
        htmlContent = htmlContent.replace(/\n/g, '<br>');
        contentDiv.innerHTML = htmlContent;
        
        tempDiv.appendChild(contentDiv);
        document.body.appendChild(tempDiv);
        
        // 等待所有图片加载完成
        const images = contentDiv.querySelectorAll('img');
        await Promise.all(Array.from(images).map(img => {
            if (img.complete) return Promise.resolve();
            return new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = () => {
                    console.warn('图片加载失败:', img.src);
                    resolve();
                };
            });
        }));
        
        // 等待DOM完全渲染（关键步骤）
        await new Promise(resolve => setTimeout(resolve, 300));
        
        // 获取完整尺寸并截图
        const canvas = await html2canvas(contentDiv, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false,
            allowTaint: false
        });
        
        // 获取当前时间戳
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        
        // 下载 - 文件名格式：信件_20240101_120000.png
        const link = document.createElement("a");
        link.download = `信件_${timestamp}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
        
        alert("已保存到相册");
        
        // 清理临时元素
        document.body.removeChild(tempDiv);
        
    } catch (error) {
        console.error('保存失败:', error);
        alert("保存失败：" + error.message + "\n\n如果问题持续，请尝试：\n1. 检查网络连接\n2. 减少图片数量\n3. 刷新页面重试");
    } finally {
        if (loadingMsg.parentNode) loadingMsg.parentNode.removeChild(loadingMsg);
    }
}

// ======================
// 保存完整PDF - 最稳定版本
// ======================
async function saveFullLetterAsPdf(id) {
    if (!window.jspdf || !window.html2canvas) {
        alert("请先引入 jspdf 和 html2canvas 库！");
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
        contentDiv.className = `modal-content ${letter.paper_style || 'paper-white'}`;
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
            return new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; });
        }));
        
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const canvas = await html2canvas(contentDiv, {
            scale: 2.5,
            useCORS: true,
            backgroundColor: null,
            logging: false
        });
        
        const imgData = canvas.toDataURL("image/jpeg", 1.0);
        const imgWidth = canvas.width;
        const imgHeight = canvas.height;
        
        const pdf = new jsPDF({
            orientation: imgHeight > imgWidth ? "portrait" : "landscape",
            unit: "px",
            format: [imgWidth, imgHeight]
        });
        
        pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
        
        // 获取当前时间戳
        const now = new Date();
        const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
        
        // 下载 - 文件名格式：信件_20240101_120000.pdf
        pdf.save(`信件_${timestamp}.pdf`);
        
        alert("PDF保存成功，可下载到本地");
        
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
// 回收站 卡片无保存按钮
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
    let preview = letter.content.replace(/!\[img].*?]/g, "[图片]").slice(0, 30) + "...";
    const paper = letter.paper_style || "paper-white";

    const card = document.createElement("div");
    card.className = `letter-card ${paper}`;
    // 回收站只保留预览、时间、恢复/彻底删除，**无保存按钮**
    card.innerHTML = `
      <div class="letter-preview">${preview}</div>
      <div class="letter-time">${new Date(letter.created_at).toLocaleDateString()}</div>
      <div class="card-btn-group">
        <button class="btn-restore" onclick="recoverLetter(${letter.id})">恢复</button>
        <button class="btn-delete-full" onclick="hardDelete(${letter.id})">彻底删除</button>
      </div>
    `;

    card.querySelector(".letter-preview").onclick = () => openFullLetter(letter);
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
