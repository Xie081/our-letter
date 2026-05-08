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
// 自定义心情输入（自由打字）
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
// 图片上传
// ======================
const imageInput = document.getElementById("imageInput");
if (imageInput) {
  imageInput.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      document.getElementById("imagePreview").innerHTML = `<img src="${ev.target.result}" style="max-width:180px;border-radius:12px;">`;
    };
    reader.readAsDataURL(file);
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
    document.getElementById("imagePreview").innerHTML = "";
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
// 信件列表：我收到的 / 我写的
// ======================
async function loadLettersFilter(type) {
  filterType = type;
  loadLetters();
}

async function loadLetters() {
  const keyword = document.getElementById("search")?.value.toLowerCase() || "";
  const { data: { user } } = await client.auth.getUser();

  let query = client.from("letters")
    .select("*")
    .eq("is_deleted", false)
    .order("created_at", { ascending: false });

  if (filterType === "me") {
    query = query.eq("sender", user.email);
  } else if (filterType === "other") {
    query = query.neq("sender", user.email);
  }

  const { data, error } = await query;
  if (error) return;

  const list = document.getElementById("letters-list");
  list.innerHTML = "";

  data.forEach(letter => {
    const text = letter.content.toLowerCase();
    if (keyword && !text.includes(keyword)) return;

    const div = document.createElement("div");
    const isMe = letter.sender === user.email;
    div.className = `letter ${isMe ? "me" : "you"}`;

    let showContent = letter.content.replace(/!\[img\]\((.*?)\)/g, '<img src="$1">');

    div.innerHTML = `
      <div class="bubble ${letter.paper_style || "paper-white"}">
        <div class="name">${letter.sender}</div>
        <div class="msg" onclick="showDetail(${letter.id})">${showContent}</div>
        <div class="info">
          <span>${new Date(letter.created_at).toLocaleString()}</span>
          <button onclick="del(${letter.id})">删除</button>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

// ======================
// 假删除
// ======================
async function del(id) {
  if (!confirm("确定移到回收站？")) return;
  await client.from("letters").update({ is_deleted: true }).eq("id", id);
  loadLetters();
}

// ======================
// 回收站（仅恢复）
// ======================
async function loadRecycle() {
  const { data, error } = await client.from("letters")
    .select("*")
    .eq("is_deleted", true)
    .order("created_at", { ascending: false });

  if (error) return;
  const { data: { user } } = await client.auth.getUser();
  const list = document.getElementById("recycle-list");
  list.innerHTML = "";

  data.forEach(letter => {
    const div = document.createElement("div");
    const isMe = letter.sender === user.email;
    div.className = `letter ${isMe ? "me" : "you"}`;

    let showContent = letter.content.replace(/!\[img\]\((.*?)\)/g, '<img src="$1">');

    div.innerHTML = `
      <div class="bubble ${letter.paper_style || "paper-white"}">
        <div class="name">${letter.sender}</div>
        <div class="msg" onclick="showDetail(${letter.id})">${showContent}</div>
        <div class="info">
          <span>${new Date(letter.created_at).toLocaleString()}</span>
          <button onclick="recoverLetter(${letter.id})" style="background:#28a745;color:white;padding:4px 8px;border-radius:6px;">恢复</button>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

async function recoverLetter(id) {
  await client.from("letters").update({ is_deleted: false }).eq("id", id);
  alert("已恢复到信件列表");
  loadRecycle();
}

// ======================
// 查看详情
// ======================
async function showDetail(id) {
  const { data } = await client.from("letters")
    .select("content")
    .eq("id", id)
    .single();
  if (data) alert(data.content);
}
