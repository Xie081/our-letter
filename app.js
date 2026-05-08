// ==============================================
// 你的配置
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let selectedImage = null;
let filterType = "other";

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
// 信件列表 —— 一行两列卡片 + 点击弹窗看完整信纸 + 删除按钮
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
  const list = document.getElementById("letters-list");
  list.innerHTML = "";

  data.forEach(letter => {
    let preview = letter.content.replace(/!\[img].*?]/g, "[图片]").slice(0, 30) + "...";
    const paper = letter.paper_style || "paper-white";

    const card = document.createElement("div");
    card.className = `letter-card ${paper}`;
    card.innerHTML = `
      <div class="letter-preview">${preview}</div>
      <div class="letter-time">${new Date(letter.created_at).toLocaleDateString()}</div>
      <button class="del-btn" onclick="del(${letter.id})">删除</button>
    `;

    card.querySelector(".letter-preview").onclick = () => openFullLetter(letter);
    list.appendChild(card);
  });
}

// 打开完整信件（弹窗 + 信纸背景 + 可滚动 + 保存长图/PDF）
function openFullLetter(letter) {
  const modal = document.createElement("div");
  modal.className = "letter-modal";
  modal.innerHTML = `
    <button class="close-btn" onclick="this.parentElement.remove()">×</button>
    <div class="modal-content ${letter.paper_style || 'paper-white'}" id="saveTarget">
      ${letter.content.replace(/!\[img]\((.*?)\)/g, '<img src="$1" style="max-width:100%;border-radius:10px;">')}
    </div>
    <div class="save-btn-group">
      <button class="save-img-btn" onclick="saveAsImage()">保存长图</button>
      <button class="save-pdf-btn" onclick="saveAsPdf()">保存PDF</button>
    </div>
  `;
  document.body.appendChild(modal);
}

// 保存为长图片（带背景）
async function saveAsImage() {
  if (!window.html2canvas) {
    alert("请刷新页面或检查网络");
    return;
  }
  const target = document.getElementById("saveTarget");
  const canvas = await html2canvas(target, {
    useCORS: true,
    scale: 2,
    backgroundColor: null
  });
  const link = document.createElement("a");
  link.download = "信件_" + new Date().getTime() + ".png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// 保存为PDF（带背景）
async function saveAsPdf() {
  if (!window.jspdf) {
    alert("请刷新页面或检查网络");
    return;
  }
  const { jsPDF } = window.jspdf;
  const target = document.getElementById("saveTarget");
  const canvas = await html2canvas(target, {
    useCORS: true,
    scale: 2,
    backgroundColor: null
  });
  const imgData = canvas.toDataURL("image/jpeg", 1.0);
  const pdf = new jsPDF({
    orientation: "portrait",
    unit: "px",
    format: [canvas.width, canvas.height]
  });
  pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
  pdf.save("信件_" + new Date().getTime() + ".pdf");
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
// 回收站 —— 一行两列 + 恢复 + 彻底删除
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
