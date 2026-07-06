const FALLBACK_NAME = "山火用户";

function fallbackAvatar(name) {
  const initial = (name || "火").trim().slice(0, 1) || "火";
  const safeInitial = initial.replace(/[&<>\"']/g, (char) => `&#${char.charCodeAt(0)};`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#7dc8ff"/><stop offset="100%" stop-color="#4c98ff"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><text x="48" y="58" text-anchor="middle" font-size="42" font-family="Arial, sans-serif" font-weight="700" fill="#fff">${safeInitial}</text></svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function injectStyle() {
  if (document.querySelector("#site-account-style")) return;
  const style = document.createElement("style");
  style.id = "site-account-style";
  style.textContent = `
    .site-account-wrap {
      position: fixed;
      top: 14px;
      right: 14px;
      z-index: 10000;
      font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .site-account-chip {
      display: inline-flex;
      align-items: center;
      gap: 9px;
      max-width: min(238px, calc(100vw - 28px));
      min-height: 42px;
      padding: 7px 14px 7px 8px;
      border: 1px solid rgba(140, 198, 255, 0.96);
      border-radius: 999px;
      background: linear-gradient(145deg, rgba(232, 246, 255, 0.98), rgba(208, 233, 255, 0.97));
      color: #0f4a86;
      box-shadow: 0 12px 30px rgba(41, 108, 188, 0.25);
      text-decoration: none;
      font-size: 14px;
      font-weight: 700;
      line-height: 1;
      transition: transform .18s ease, box-shadow .18s ease, filter .18s ease;
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
    }
    .site-account-chip:hover {
      transform: translateY(-2px);
      filter: brightness(1.03);
      box-shadow: 0 16px 38px rgba(41, 108, 188, 0.34);
      text-decoration: none;
    }
    .site-account-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      object-fit: cover;
      flex: 0 0 auto;
      background: #d9eeff;
      border: 1px solid rgba(255, 255, 255, 0.98);
    }
    .site-account-name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      max-width: 170px;
    }
    @media (max-width: 700px) {
      .site-account-wrap { top: 10px; right: 10px; }
      .site-account-chip { min-height: 38px; padding: 6px 10px 6px 6px; max-width: 160px; }
      .site-account-avatar { width: 26px; height: 26px; }
      .site-account-name { max-width: 96px; }
    }
  `;
  document.head.append(style);
}

function ensureAccountLink() {
  const wrap = document.createElement("div");
  wrap.className = "site-account-wrap";
  const link = document.querySelector("#account-link") || document.createElement("a");
  link.id = "account-link";
  link.className = "site-account-chip";
  if (!link.parentElement || !link.parentElement.classList.contains("site-account-wrap")) {
    wrap.append(link);
    document.body.append(wrap);
  }
  return link;
}

function renderAccount(link, session) {
  const user = session?.user;
  const meta = user?.user_metadata || {};
  const name = meta.display_name || user?.email || user?.phone || "登录";
  const avatar = user ? (meta.avatar_url || fallbackAvatar(name)) : fallbackAvatar("登录");

  link.href = user ? "/account.html" : "/login.html";
  link.title = user ? "进入个人设置" : "登录";
  link.replaceChildren();

  const image = document.createElement("img");
  image.className = "site-account-avatar";
  image.src = avatar;
  image.alt = "";
  image.addEventListener("error", () => {
    image.src = fallbackAvatar(name);
  }, { once: true });

  const label = document.createElement("span");
  label.id = "account-label";
  label.className = "site-account-name";
  label.textContent = name || FALLBACK_NAME;

  link.append(image, label);
}

async function initAccountEntry() {
  injectStyle();
  const link = ensureAccountLink();
  renderAccount(link, null);

  try {
    const { getSession } = await import("/assets/js/auth.js");
    renderAccount(link, await getSession());
  } catch {
    renderAccount(link, null);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initAccountEntry);
} else {
  initAccountEntry();
}
