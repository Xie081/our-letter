// ==============================================
// 你的配置
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentMood = "";

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
// 发送信件（带心情）
// ======================
async function sendLetter() {
  const content = document.getElementById("content").value;
  if (!content) return alert("请输入内容");

  const mood = window.selectedMood || "";
  const finalContent = mood 
    ? `【今日心情】${mood}\n${content}` 
    : content;

  const { data: { user } } = await client.auth.getUser();
  await client.from("letters").insert([{
    sender: user.email,
    content: finalContent
  }]);

  window.selectedMood = "";
  document.getElementById("moodShow").innerText = "";
  document.getElementById("content").value = "";
  loadLetters();
}
// ======================
// 搜索 + 加载信件
// ======================
async function loadLetters() {
  const keyword = document.getElementById("search")?.value.toLowerCase() || "";

  const { data, error } = await client
    .from("letters")
    .select("*")
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

    div.innerHTML = `
      <div class="bubble">
        <div class="name">${letter.sender}</div>
        <div class="msg">${letter.content}</div>
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
// 删除信件
// ======================
async function del(id) {
  if (!confirm("确定删除？删除后不可恢复")) return;
  await client.from("letters").delete().eq("id", id);
  loadLetters();
}
