// ==============================================
// 你的配置（已经帮你填好）
// ==============================================
const SUPABASE_URL = "https://jihygwuxpgvukruiqvqg.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_IRdpgnmzz2W6AeEj9R-1ug_ZvAlJQLE";

// 修复：这里不能叫 supabase，会冲突！
const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 页面加载时检查是否已登录
window.onload = checkAuth;

// 检查登录状态
async function checkAuth() {
  const { data: { user } } = await client.auth.getUser();
  if (user) {
    document.getElementById("auth-section").style.display = "none";
    document.getElementById("letter-section").style.display = "block";
    loadLetters();
  }
}

// 注册
async function register() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await client.auth.signUp({ email, password });
  if (error) alert(error.message);
  else alert("注册成功！请登录");
}

// 登录
async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message);
  else location.reload();
}

// 发送信件
async function sendLetter() {
  const content = document.getElementById("content").value;
  if (!content) return alert("请输入内容");

  const { data: { user } } = await client.auth.getUser();
  const { error } = await client
    .from("letters")
    .insert([{
      sender: user.email,
      content: content
    }]);

  if (error) alert(error.message);
  else {
    alert("发送成功！");
    document.getElementById("content").value = "";
    loadLetters();
  }
}

// 加载历史信件
async function loadLetters() {
  const { data, error } = await client
    .from("letters")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error(error);
    return;
  }

  const list = document.getElementById("letters-list");
  list.innerHTML = "";

  data.forEach(letter => {
    const div = document.createElement("div");
    div.className = "letter";
    div.innerHTML = `
      <strong>${letter.sender}</strong>
      <p>${letter.content}</p>
      <div class="time">${new Date(letter.created_at).toLocaleString()}</div>
    `;
    list.appendChild(div);
  });
}