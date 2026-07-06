# 山火登录系统配置

代码已经包含邮箱注册、邮箱确认、登录、退出、找回密码和修改密码。启用前需要创建一个免费的 Supabase 项目。

1. 登录 https://supabase.com/dashboard 并新建项目。
2. 在项目的 Connect 或 API Keys 页面复制 `Project URL` 和 `Publishable key`。
3. 打开 `assets/js/supabase-config.js`，替换两个占位值。不要使用 `service_role` 或 secret key。
4. 在 Authentication -> URL Configuration 中设置：
   - Site URL: `https://chxnb.com`
   - Redirect URLs: `https://chxnb.com/account.html`
5. 将整个目录上传到主机，保持文件夹结构不变。

## 重要说明

- 浏览器中的 Project URL 和 Publishable key 本来就是公开配置，不是密码。
- 任何保存用户个人数据的表都必须开启 Row Level Security (RLS)。
- 当前登录不会隐藏原有静态资料页。静态 HTML 网址可以被直接访问；真正的付费或私密内容需要服务端鉴权。
- Supabase 默认邮件服务适合试用，正式运营前应配置自有 SMTP。

## 批注功能初始化（新增）

1. 打开 Supabase SQL Editor。
2. 执行 `supabase/annotations_schema.sql` 的全部 SQL。
3. 重新部署站点文件。

完成后：
- 登录用户可在任意页面新增批注、编辑/删除自己的批注。
- 批注可选公开/私有。
- 未登录用户可查看公开批注。
- 登录用户可对批注点赞和评论。

## 同域反向代理（推荐，降低被拦截概率）
为减少浏览器插件拦截 Supabase 请求，前端默认改为走同域地址 `/sb`。

服务器要求（IIS）：
1. 安装并启用 URL Rewrite + ARR（Application Request Routing）。
2. 保证 `web.config` 中的 `Supabase Reverse Proxy` 规则生效。
3. 部署后访问：`https://你的域名/sb/rest/v1/` 应返回 JSON（未带 key 时提示 `No API key found` 属于正常）。

说明：
- 同域代理可以明显降低广告/隐私插件误拦截概率，但用户强拦截仍可能导致失败。
- 若服务器不支持 ARR，可将 `assets/js/supabase-config.js` 的 `SUPABASE_URL` 暂时改回 Supabase 原域名。

## 不会配置 IIS 也可以用
已内置自动回退：
- 先尝试同域 `/sb`（反向代理）。
- 如果代理不可用，会自动回退到 Supabase 原域名。

所以你暂时不会配 ARR 也没关系，先直接部署前端文件即可。
