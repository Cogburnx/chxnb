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
