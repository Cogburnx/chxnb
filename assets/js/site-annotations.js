const POLL_INTERVAL_MS = 15000;
const MAX_ANNOTATION_LENGTH = 500;
const MAX_COMMENT_LENGTH = 300;
const ASSET_VERSION = "20260707-fix5";
const CONNECT_TIMEOUT_MS = 8000;
const LOCAL_DB_KEY = "site_annotations_local_v1";
const LOCAL_USER_KEY = "site_annotations_local_user_v1";

const state = {
  supabase: null,
  mode: "remote",
  session: null,
  user: null,
  annotations: [],
  docWidth: 1,
  docHeight: 1,
  addMode: false,
  activeId: null,
  likesById: new Map(),
  myLikedIds: new Set(),
  commentCountById: new Map(),
  commentsById: new Map(),
  pollTimer: null,
};

function generateId(prefix = "id") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getOrCreateLocalUser() {
  const existing = localStorage.getItem(LOCAL_USER_KEY);
  if (existing) {
    try {
      return JSON.parse(existing);
    } catch {}
  }
  const localUser = {
    id: generateId("local_user"),
    email: "local@offline.user",
    user_metadata: { display_name: "本地用户" },
  };
  localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(localUser));
  return localUser;
}

function readLocalDb() {
  const raw = localStorage.getItem(LOCAL_DB_KEY);
  if (!raw) return { annotations: [], likes: [], comments: [] };
  try {
    const db = JSON.parse(raw);
    return {
      annotations: Array.isArray(db.annotations) ? db.annotations : [],
      likes: Array.isArray(db.likes) ? db.likes : [],
      comments: Array.isArray(db.comments) ? db.comments : [],
    };
  } catch {
    return { annotations: [], likes: [], comments: [] };
  }
}

function writeLocalDb(db) {
  localStorage.setItem(LOCAL_DB_KEY, JSON.stringify(db));
}

const ui = {
  layer: null,
  toolbar: null,
  panel: null,
  addButton: null,
  debug: null,
};

function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("zh-CN", { hour12: false });
}

function getAuthorName(user) {
  const meta = user?.user_metadata || {};
  return meta.display_name || user?.email || user?.phone || "匿名用户";
}

function getAuthorAvatar(user) {
  const meta = user?.user_metadata || {};
  return meta.avatar_url || "";
}

function clampPercent(value) {
  return Math.max(0, Math.min(1, value));
}

function reportRuntimeError(message, error = null) {
  if (!ui.debug) return;
  ui.debug.hidden = false;
  ui.debug.textContent = `批注异常: ${message}`;
  if (error) console.error("[site-annotations]", message, error);
}

function explainFetchError(error) {
  const message = String(error?.message || error || "");
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return "网络请求失败（常见原因：浏览器扩展拦截、网络策略拦截、Supabase 不可达）";
  }
  return message || "请求失败";
}

async function probeSupabaseConnectivity() {
  try {
    const { SUPABASE_URL } = await import(`/assets/js/supabase-config.js?v=${ASSET_VERSION}`);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CONNECT_TIMEOUT_MS);
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
        method: "GET",
        cache: "no-store",
        signal: controller.signal,
      });
      if (!response.ok) {
        reportRuntimeError(`Supabase 探测失败: HTTP ${response.status}`);
      }
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    reportRuntimeError(`Supabase 连通性失败: ${explainFetchError(error)}`, error);
  }
}

function refreshDocMetrics() {
  const body = document.body;
  const doc = document.documentElement;
  state.docWidth = Math.max(doc.scrollWidth, body?.scrollWidth || 0, window.innerWidth, 1);
  state.docHeight = Math.max(doc.scrollHeight, body?.scrollHeight || 0, window.innerHeight, 1);
  if (ui.layer) ui.layer.style.height = `${state.docHeight}px`;
}

function injectStyle() {
  if (document.querySelector("#site-annotations-style")) return;
  const style = document.createElement("style");
  style.id = "site-annotations-style";
  style.textContent = `
    .anno-layer {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      z-index: 9200;
      pointer-events: none;
    }
    .anno-dot {
      position: absolute;
      width: 15px;
      height: 15px;
      border: 2px solid rgba(255, 255, 255, 0.95);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.12), 0 6px 14px rgba(0, 0, 0, 0.26);
      cursor: pointer;
      pointer-events: auto;
      transition: transform .14s ease, box-shadow .14s ease;
    }
    .anno-dot:hover {
      transform: translate(-50%, -50%) scale(1.15);
      box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.16), 0 9px 18px rgba(0, 0, 0, 0.3);
    }
    .anno-dot-public { background: radial-gradient(circle at 30% 30%, #ffea7f, #f4bd24); }
    .anno-dot-own { background: radial-gradient(circle at 30% 30%, #66c2ff, #2f86f5); }
    .anno-toolbar {
      position: fixed;
      right: 16px;
      bottom: 18px;
      z-index: 9300;
      display: flex;
      gap: 8px;
      align-items: center;
      font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    .anno-btn {
      border: 0;
      border-radius: 999px;
      min-height: 38px;
      padding: 8px 14px;
      background: linear-gradient(145deg, rgba(255, 248, 187, 0.96), rgba(255, 228, 122, 0.96));
      color: #7a5700;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 10px 20px rgba(0, 0, 0, 0.16);
    }
    .anno-btn.is-active {
      background: linear-gradient(145deg, rgba(88, 168, 255, 0.98), rgba(56, 130, 246, 0.98));
      color: #fff;
    }
    .anno-debug {
      border: 0;
      border-radius: 999px;
      min-height: 34px;
      padding: 7px 12px;
      background: #f26e6e;
      color: #fff;
      font-size: 12px;
      font-weight: 700;
      box-shadow: 0 8px 16px rgba(0, 0, 0, 0.16);
    }
    .anno-panel {
      position: fixed;
      right: 16px;
      bottom: 66px;
      width: min(370px, calc(100vw - 24px));
      max-height: min(72vh, 620px);
      overflow: auto;
      z-index: 9400;
      border: 1px solid rgba(125, 172, 231, 0.48);
      border-radius: 14px;
      background: rgba(247, 252, 255, 0.98);
      color: #12395f;
      font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      box-shadow: 0 16px 40px rgba(21, 74, 132, 0.26);
      padding: 14px;
    }
    .anno-panel[hidden] { display: none; }
    .anno-title { font-size: 14px; font-weight: 700; margin: 0 0 8px; }
    .anno-text {
      width: 100%;
      min-height: 86px;
      resize: vertical;
      border: 1px solid rgba(102, 160, 227, 0.5);
      border-radius: 10px;
      padding: 9px 10px;
      font-size: 14px;
      outline: none;
      background: #fff;
      color: #1a3552;
      box-sizing: border-box;
    }
    .anno-text:focus { border-color: #2f86f5; box-shadow: 0 0 0 3px rgba(47, 134, 245, 0.18); }
    .anno-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; flex-wrap: wrap; }
    .anno-small-btn {
      border: 0;
      border-radius: 999px;
      padding: 7px 11px;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(145deg, #5aa8ff, #3682f6);
      color: #fff;
    }
    .anno-small-btn.is-secondary { background: #d7e8fb; color: #245188; }
    .anno-small-btn.is-danger { background: #e34d4d; color: #fff; }
    .anno-meta { margin: 8px 0; font-size: 12px; color: #57789d; }
    .anno-content {
      margin: 8px 0;
      padding: 10px;
      border-radius: 10px;
      background: #fff;
      border: 1px solid rgba(148, 183, 221, 0.45);
      white-space: pre-wrap;
      word-break: break-word;
      line-height: 1.55;
      font-size: 14px;
      color: #173d67;
    }
    .anno-comment-list { margin-top: 10px; display: grid; gap: 8px; }
    .anno-comment-item {
      border: 1px solid rgba(153, 185, 220, 0.4);
      background: rgba(255, 255, 255, 0.9);
      border-radius: 8px;
      padding: 8px;
      font-size: 13px;
      color: #1f4772;
    }
    .anno-status { font-size: 12px; color: #4f6f92; }
    .anno-status.is-error { color: #b94141; }
    .anno-login-tip { font-size: 12px; color: #4e6e92; }
    @media (max-width: 700px) {
      .anno-toolbar { right: 10px; bottom: 12px; }
      .anno-panel { right: 10px; bottom: 58px; width: calc(100vw - 20px); }
    }
  `;
  document.head.append(style);
}

function createUI() {
  if (ui.layer) return;
  const layer = document.createElement("div");
  layer.className = "anno-layer";

  const toolbar = document.createElement("div");
  toolbar.className = "anno-toolbar";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "anno-btn";
  addButton.textContent = "批注模式";

  const panel = document.createElement("aside");
  panel.className = "anno-panel";
  panel.hidden = true;

  const debug = document.createElement("div");
  debug.className = "anno-debug";
  debug.hidden = true;

  toolbar.append(addButton, debug);
  document.body.append(layer, toolbar, panel);

  ui.layer = layer;
  ui.toolbar = toolbar;
  ui.panel = panel;
  ui.addButton = addButton;
  ui.debug = debug;

  addButton.addEventListener("click", () => {
    if (!state.user) {
      showLoginHint("登录后可以发布批注。未登录可查看公开批注。");
      return;
    }
    setAddMode(!state.addMode);
  });

  document.addEventListener("click", handleGlobalClick, true);
  window.addEventListener("resize", () => {
    refreshDocMetrics();
    renderDots();
  });

  const resizeObserver = new ResizeObserver(() => {
    refreshDocMetrics();
    renderDots();
  });
  resizeObserver.observe(document.documentElement);
}

function setAddMode(enabled) {
  state.addMode = Boolean(enabled);
  ui.addButton.classList.toggle("is-active", state.addMode);
  ui.addButton.textContent = state.addMode ? "点击页面添加" : "批注模式";
  if (!state.addMode && ui.panel.dataset.mode === "create") {
    hidePanel();
  }
}

function hidePanel() {
  ui.panel.hidden = true;
  ui.panel.innerHTML = "";
  ui.panel.dataset.mode = "";
}

function showLoginHint(message) {
  ui.panel.dataset.mode = "hint";
  ui.panel.hidden = false;
  ui.panel.innerHTML = `
    <p class="anno-title">批注功能</p>
    <p class="anno-login-tip">${escapeHtml(message)}</p>
    <div class="anno-row">
      <button type="button" class="anno-small-btn" data-anno-action="go-login">去登录</button>
      <button type="button" class="anno-small-btn is-secondary" data-anno-action="close-panel">关闭</button>
    </div>
  `;
  bindCommonPanelActions();
}

function bindCommonPanelActions() {
  ui.panel.querySelectorAll("[data-anno-action='close-panel']").forEach((button) => {
    button.addEventListener("click", hidePanel);
  });
  ui.panel.querySelectorAll("[data-anno-action='go-login']").forEach((button) => {
    button.addEventListener("click", () => {
      window.location.href = "/login.html";
    });
  });
}

function handleGlobalClick(event) {
  if (!state.addMode) return;
  if (event.target.closest(".anno-toolbar") || event.target.closest(".anno-panel") || event.target.closest(".anno-dot")) {
    return;
  }
  const x = clampPercent(event.pageX / state.docWidth);
  const y = clampPercent(event.pageY / state.docHeight);
  setAddMode(false);
  openEditor({ xPercent: x, yPercent: y });
}

function renderDots() {
  if (!ui.layer) return;
  ui.layer.replaceChildren();
  for (const annotation of state.annotations) {
    const dot = document.createElement("button");
    dot.type = "button";
    dot.className = `anno-dot ${annotation.user_id === state.user?.id ? "anno-dot-own" : "anno-dot-public"}`;
    dot.style.left = `${Number(annotation.x_percent) * 100}%`;
    dot.style.top = `${Number(annotation.y_percent) * 100}%`;
    dot.title = annotation.content?.slice(0, 48) || "批注";
    dot.addEventListener("click", (event) => {
      event.stopPropagation();
      openDetail(annotation.id);
    });
    ui.layer.append(dot);
  }
}

async function loadLikeData(annotationIds) {
  state.likesById.clear();
  state.myLikedIds.clear();
  if (!annotationIds.length) return;

  if (state.mode === "local") {
    const db = readLocalDb();
    for (const row of db.likes.filter((item) => annotationIds.includes(item.annotation_id))) {
      state.likesById.set(row.annotation_id, (state.likesById.get(row.annotation_id) || 0) + 1);
      if (state.user && row.user_id === state.user.id) {
        state.myLikedIds.add(row.annotation_id);
      }
    }
    return;
  }

  const { data, error } = await state.supabase
    .from("annotation_likes")
    .select("annotation_id,user_id")
    .in("annotation_id", annotationIds);

  if (error || !data) return;
  for (const row of data) {
    state.likesById.set(row.annotation_id, (state.likesById.get(row.annotation_id) || 0) + 1);
    if (state.user && row.user_id === state.user.id) {
      state.myLikedIds.add(row.annotation_id);
    }
  }
}

async function loadCommentCounts(annotationIds) {
  state.commentCountById.clear();
  if (!annotationIds.length) return;

  if (state.mode === "local") {
    const db = readLocalDb();
    for (const row of db.comments.filter((item) => annotationIds.includes(item.annotation_id))) {
      state.commentCountById.set(row.annotation_id, (state.commentCountById.get(row.annotation_id) || 0) + 1);
    }
    return;
  }

  const { data, error } = await state.supabase
    .from("annotation_comments")
    .select("annotation_id")
    .in("annotation_id", annotationIds);

  if (error || !data) return;
  for (const row of data) {
    state.commentCountById.set(row.annotation_id, (state.commentCountById.get(row.annotation_id) || 0) + 1);
  }
}

async function loadAnnotations() {
  let rows = [];
  if (state.mode === "local") {
    const db = readLocalDb();
    if (state.user) {
      const visible = db.annotations.filter((item) => (
        item.page_path === window.location.pathname
          && (item.is_public || item.user_id === state.user.id)
      ));
      rows = visible.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else {
      const visible = db.annotations.filter((item) => (
        item.page_path === window.location.pathname && item.is_public
      ));
      rows = visible.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }
    if (ui.debug) ui.debug.hidden = true;
    state.annotations = rows;
    const ids = state.annotations.map((item) => item.id);
    await Promise.all([loadLikeData(ids), loadCommentCounts(ids)]);
    renderDots();
    return;
  }

  if (state.user) {
    const [publicRes, ownRes] = await Promise.all([
      state.supabase
        .from("annotations")
        .select("*")
        .eq("page_path", window.location.pathname)
        .eq("is_public", true)
        .order("created_at", { ascending: true }),
      state.supabase
        .from("annotations")
        .select("*")
        .eq("page_path", window.location.pathname)
        .eq("user_id", state.user.id)
        .order("created_at", { ascending: true }),
    ]);

    if (publicRes.error || ownRes.error) {
      const reason = publicRes.error?.message || ownRes.error?.message || "数据库查询失败";
      if (reason.includes("does not exist")) {
        showLoginHint("批注数据表还没初始化，请先在 Supabase 执行批注 SQL 脚本。");
      } else {
        reportRuntimeError(explainFetchError(publicRes.error || ownRes.error), publicRes.error || ownRes.error);
      }
      return;
    }

    const map = new Map();
    [...(publicRes.data || []), ...(ownRes.data || [])].forEach((item) => map.set(item.id, item));
    rows = [...map.values()].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  } else {
    const { data, error } = await state.supabase
      .from("annotations")
      .select("*")
      .eq("page_path", window.location.pathname)
      .eq("is_public", true)
      .order("created_at", { ascending: true });

    if (error) {
      if (error.message?.includes("does not exist")) {
        showLoginHint("批注数据表还没初始化，请先在 Supabase 执行批注 SQL 脚本。");
      } else {
        reportRuntimeError(explainFetchError(error), error);
      }
      return;
    }
    rows = data || [];
  }

  if (ui.debug) ui.debug.hidden = true;
  state.annotations = rows;
  const ids = state.annotations.map((item) => item.id);
  await Promise.all([loadLikeData(ids), loadCommentCounts(ids)]);
  renderDots();
}

function findAnnotation(id) {
  return state.annotations.find((item) => item.id === id) || null;
}

function openEditor({ id = null, xPercent = null, yPercent = null, content = "", isPublic = true } = {}) {
  const mode = id ? "edit" : "create";
  ui.panel.dataset.mode = mode;
  ui.panel.hidden = false;
  ui.panel.innerHTML = `
    <p class="anno-title">${mode === "create" ? "新增批注" : "编辑批注"}</p>
    <textarea class="anno-text" id="anno-editor-text" maxlength="${MAX_ANNOTATION_LENGTH}" placeholder="写点想法，其他人也可以看到公开批注。">${escapeHtml(content)}</textarea>
    <div class="anno-row">
      <label><input id="anno-editor-public" type="checkbox" ${isPublic ? "checked" : ""}> 公开显示</label>
      <span class="anno-status" id="anno-editor-status"></span>
    </div>
    <div class="anno-row">
      <button type="button" class="anno-small-btn" data-anno-action="save-editor">保存</button>
      <button type="button" class="anno-small-btn is-secondary" data-anno-action="close-panel">取消</button>
    </div>
  `;

  bindCommonPanelActions();
  ui.panel.querySelector("#anno-editor-text")?.focus();

  ui.panel.querySelector("[data-anno-action='save-editor']")?.addEventListener("click", async () => {
    const textEl = ui.panel.querySelector("#anno-editor-text");
    const publicEl = ui.panel.querySelector("#anno-editor-public");
    const statusEl = ui.panel.querySelector("#anno-editor-status");
    const value = textEl.value.trim();

    if (!value) {
      statusEl.textContent = "内容不能为空";
      statusEl.classList.add("is-error");
      return;
    }

    statusEl.textContent = "保存中...";
    statusEl.classList.remove("is-error");

    const payload = {
      content: value,
      is_public: publicEl.checked,
      author_name: getAuthorName(state.user),
      author_avatar_url: getAuthorAvatar(state.user),
    };

    if (mode === "create") {
      payload.page_path = window.location.pathname;
      payload.x_percent = xPercent;
      payload.y_percent = yPercent;
      payload.user_id = state.user.id;
      if (state.mode === "local") {
        const db = readLocalDb();
        db.annotations.push({
          id: generateId("anno"),
          created_at: new Date().toISOString(),
          ...payload,
        });
        writeLocalDb(db);
      } else {
        const { error } = await state.supabase.from("annotations").insert(payload);
        if (error) {
          statusEl.textContent = error.message || "保存失败";
          statusEl.classList.add("is-error");
          return;
        }
      }
    } else {
      if (state.mode === "local") {
        const db = readLocalDb();
        db.annotations = db.annotations.map((item) => (
          item.id === id && item.user_id === state.user.id ? { ...item, ...payload } : item
        ));
        writeLocalDb(db);
      } else {
        const { error } = await state.supabase
          .from("annotations")
          .update(payload)
          .eq("id", id)
          .eq("user_id", state.user.id);
        if (error) {
          statusEl.textContent = error.message || "保存失败";
          statusEl.classList.add("is-error");
          return;
        }
      }
    }

    hidePanel();
    await loadAnnotations();
  });
}

async function loadComments(annotationId) {
  if (state.mode === "local") {
    const db = readLocalDb();
    const rows = db.comments
      .filter((item) => item.annotation_id === annotationId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    state.commentsById.set(annotationId, rows);
    return rows;
  }

  const { data, error } = await state.supabase
    .from("annotation_comments")
    .select("*")
    .eq("annotation_id", annotationId)
    .order("created_at", { ascending: true });
  if (error) return [];
  state.commentsById.set(annotationId, data || []);
  return data || [];
}

async function toggleLike(annotationId) {
  if (!state.user) {
    showLoginHint("登录后可以点赞和评论。未登录可查看公开批注。");
    return;
  }

  if (state.mode === "local") {
    const db = readLocalDb();
    if (state.myLikedIds.has(annotationId)) {
      db.likes = db.likes.filter((item) => !(item.annotation_id === annotationId && item.user_id === state.user.id));
    } else {
      db.likes.push({ annotation_id: annotationId, user_id: state.user.id });
    }
    writeLocalDb(db);
  } else {
    if (state.myLikedIds.has(annotationId)) {
      await state.supabase
        .from("annotation_likes")
        .delete()
        .eq("annotation_id", annotationId)
        .eq("user_id", state.user.id);
    } else {
      await state.supabase
        .from("annotation_likes")
        .insert({ annotation_id: annotationId, user_id: state.user.id });
    }
  }

  await loadLikeData(state.annotations.map((item) => item.id));
  await openDetail(annotationId);
}

async function submitComment(annotationId) {
  if (!state.user) {
    showLoginHint("登录后可以点赞和评论。未登录可查看公开批注。");
    return;
  }

  const input = ui.panel.querySelector("#anno-comment-input");
  const status = ui.panel.querySelector("#anno-comment-status");
  const content = input.value.trim();

  if (!content) {
    status.textContent = "评论不能为空";
    status.classList.add("is-error");
    return;
  }

  status.textContent = "发送中...";
  status.classList.remove("is-error");

  if (state.mode === "local") {
    const db = readLocalDb();
    db.comments.push({
      id: generateId("comment"),
      annotation_id: annotationId,
      user_id: state.user.id,
      content,
      author_name: getAuthorName(state.user),
      author_avatar_url: getAuthorAvatar(state.user),
      created_at: new Date().toISOString(),
    });
    writeLocalDb(db);
  } else {
    const { error } = await state.supabase.from("annotation_comments").insert({
      annotation_id: annotationId,
      user_id: state.user.id,
      content,
      author_name: getAuthorName(state.user),
      author_avatar_url: getAuthorAvatar(state.user),
    });

    if (error) {
      status.textContent = error.message || "发送失败";
      status.classList.add("is-error");
      return;
    }
  }

  input.value = "";
  await loadComments(annotationId);
  await loadCommentCounts(state.annotations.map((item) => item.id));
  await openDetail(annotationId);
}

async function deleteAnnotation(annotationId) {
  const ok = window.confirm("确认删除这条批注吗？删除后不能恢复。");
  if (!ok) return;

  if (state.mode === "local") {
    const db = readLocalDb();
    db.annotations = db.annotations.filter((item) => !(item.id === annotationId && item.user_id === state.user?.id));
    db.likes = db.likes.filter((item) => item.annotation_id !== annotationId);
    db.comments = db.comments.filter((item) => item.annotation_id !== annotationId);
    writeLocalDb(db);
  } else {
    await state.supabase
      .from("annotations")
      .delete()
      .eq("id", annotationId)
      .eq("user_id", state.user?.id || "");
  }

  hidePanel();
  await loadAnnotations();
}

async function openDetail(annotationId) {
  const annotation = findAnnotation(annotationId);
  if (!annotation) return;

  state.activeId = annotationId;
  const isOwn = annotation.user_id === state.user?.id;
  const likes = state.likesById.get(annotationId) || 0;
  const liked = state.myLikedIds.has(annotationId);
  const comments = await loadComments(annotationId);

  ui.panel.dataset.mode = "detail";
  ui.panel.hidden = false;
  ui.panel.innerHTML = `
    <p class="anno-title">批注详情</p>
    <div class="anno-meta">
      ${escapeHtml(annotation.author_name || "匿名用户")} · ${annotation.is_public ? "公开" : "仅自己可见"} · ${formatTime(annotation.created_at)}
    </div>
    <div class="anno-content">${escapeHtml(annotation.content)}</div>
    <div class="anno-row">
      <button type="button" class="anno-small-btn ${liked ? "is-secondary" : ""}" data-anno-action="toggle-like">${liked ? "已赞" : "点赞"} (${likes})</button>
      <span class="anno-status">评论 ${state.commentCountById.get(annotationId) || 0}</span>
      <button type="button" class="anno-small-btn is-secondary" data-anno-action="close-panel">关闭</button>
    </div>
    ${isOwn ? `
      <div class="anno-row">
        <button type="button" class="anno-small-btn is-secondary" data-anno-action="edit-self">编辑</button>
        <button type="button" class="anno-small-btn is-danger" data-anno-action="delete-self">删除</button>
      </div>
    ` : ""}
    <div class="anno-comment-list">
      ${comments.length ? comments.map((item) => `
        <div class="anno-comment-item">
          <div><strong>${escapeHtml(item.author_name || "匿名用户")}</strong> · ${formatTime(item.created_at)}</div>
          <div>${escapeHtml(item.content)}</div>
        </div>
      `).join("") : `<div class="anno-comment-item">暂无评论</div>`}
    </div>
    ${state.user ? `
      <div class="anno-row">
        <textarea id="anno-comment-input" class="anno-text" maxlength="${MAX_COMMENT_LENGTH}" placeholder="写评论..."></textarea>
      </div>
      <div class="anno-row">
        <button type="button" class="anno-small-btn" data-anno-action="send-comment">发送评论</button>
        <span id="anno-comment-status" class="anno-status"></span>
      </div>
    ` : `<p class="anno-login-tip">登录后可以点赞和评论。</p>`}
  `;

  bindCommonPanelActions();

  ui.panel.querySelector("[data-anno-action='toggle-like']")?.addEventListener("click", () => toggleLike(annotationId));
  ui.panel.querySelector("[data-anno-action='send-comment']")?.addEventListener("click", () => submitComment(annotationId));
  ui.panel.querySelector("[data-anno-action='edit-self']")?.addEventListener("click", () => openEditor({
    id: annotation.id,
    content: annotation.content,
    isPublic: annotation.is_public,
  }));
  ui.panel.querySelector("[data-anno-action='delete-self']")?.addEventListener("click", () => deleteAnnotation(annotationId));
}

function bindAuthState() {
  if (state.mode !== "remote" || !state.supabase) return;
  state.supabase.auth.onAuthStateChange(async (_event, session) => {
    state.session = session;
    state.user = session?.user || null;
    setAddMode(false);
    await loadAnnotations();
  });
}

async function init() {
  injectStyle();
  createUI();
  refreshDocMetrics();
  await probeSupabaseConnectivity();

  try {
    const { supabase, getSession } = await import(`/assets/js/auth.js?v=${ASSET_VERSION}`);
    if (!supabase) throw new Error("Supabase client is null");

    state.supabase = supabase;
    state.mode = "remote";
    state.session = await getSession();
    state.user = state.session?.user || null;

    await loadAnnotations();
    bindAuthState();

    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = setInterval(() => {
      loadAnnotations().catch((error) => {
        reportRuntimeError(explainFetchError(error), error);
      });
    }, POLL_INTERVAL_MS);
  } catch (error) {
    state.mode = "local";
    state.user = getOrCreateLocalUser();
    reportRuntimeError("已切换到本地批注模式（当前浏览器可用，跨设备不同步）", error);
    await loadAnnotations();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}







