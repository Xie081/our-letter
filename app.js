// ==============================================
// 你的配置
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentMood = "";
let selectedImage = null; // 图片变量

// ======================
// 图片上传监听
// ======================
document.getElementById('imageInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (ev) => {
    document.getElementById('imagePreview').innerHTML = `<img src="${ev.target.result}" style="max-width:180px;border-radius:12px;">`;
  };
  reader.readAsDataURL(file);
  selectedImage = file;
});

// 上传图片到 Supabase Storage
async function uploadImage(file) {
  const fileName = `${Date.now()}-${file.name}`;
  const { data, error } = await client.storage
    .from('letter-images')
    .upload(fileName, file, { cacheControl: '3600' });

  if (error) {
    alert('上传失败：' + error.message);
    return null;
  }

  const { data: { publicUrl } } = client.storage.from('letter-images').getPublicUrl(fileName);
  return publicUrl;
}

// ======================
// 心情贴纸
// ======================
function setMood(mood) {
  window.selectedMood = mood;
  document.getElementById("moodShow").innerText = "今日心情：" + mood;
}

window.onload = checkAuth;

// ======================
// 登录/注册
// ======================
async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("letter-section").style.display = "block";
    loadLetters();
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
// 发送信件（带心情 + 图片）
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
    document.getElementById('imagePreview').innerHTML = '';
    document.getElementById('imageInput').value = '';
  }

  const mood = window.selectedMood || "";
  const finalContentWithMood = mood
    ? `【今日心情：${mood}】\n${finalContent}`
    : finalContent;

  const { data: { user } } = await client.auth.getUser();
  await client.from("letters").insert([{
    sender: user.email,
    content: finalContentWithMood,
    is_deleted: false
  }]);

  window.selectedMood = "";
  document.getElementById("moodShow").innerText = "";
  document.getElementById("content").value = "";
  loadLetters();
}

// ======================
// 搜索 + 加载信件（只加载未假删除的）
// ======================
async function loadLetters() {
  const keyword = document.getElementById("search")?.value.toLowerCase() || "";

  const { data, error } = await client
    .from("letters")
    .select("*")
    .eq("is_deleted", false)   // 只显示没被假删除的
    .order("created_at", { ascending: false });

  if (error) return;

  const { data: { user } } = await client.auth.getUser();
  const list = document.getElementById("letters-list");
  list.innerHTML = "";

  data.forEach(letter => {
    const text = letter.content.toLowerCase();
    if (keyword && !text.includes(keyword)) return;

    const div = document.createElement("div");
    const isMe = letter.sender === user.email;
    div.className = `letter ${isMe ? "me" : "you"}`;

    // 把图片语法转成 img 标签
    let showContent = letter.content.replace(/!\[img\]\((.*?)\)/g, '<img src="$1">');

    div.innerHTML = `
      <div class="bubble">
        <div class="name">${letter.sender}</div>
        <div class="msg" onclick="showDetail(${letter.id})">${showContent}</div>
        <div class="info">
          <span>${new Date(letter.created_at).toLocaleString()}</span>
          <button onclick="del(${letter.id})">删</button>
        </div>
      </div>
    `;
    list.appendChild(div);
  });
}

// ======================
// 假删除：只标记隐藏，数据库保留
// ======================
async function del(id) {
  if (!confirm("确定删除？")) return;
  
  await client
    .from("letters")
    .update({ is_deleted: true })
    .eq("id", id);

  loadLetters();
}

// 查看完整内容
async function showDetail(id) {
  const { data } = await client
    .from("letters")
    .select("content")
    .eq("id", id)
    .single();

  if (data) alert(data.content);
}
