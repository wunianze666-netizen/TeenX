import { defineConfig, type ProxyOptions } from "vite";
import react from "@vitejs/plugin-react";

const ADVX_SERVER_ORIGIN = process.env.ADVX_SERVER_ORIGIN?.trim() || "http://127.0.0.1:3100";

const STUDIO_ROUTE_PREFIXES = [
  "/studio",
  "/members",
  "/test-run",
  "/versions",
  "/activity",
  "/landing",
  "/forum",
  "/me",
  "/arena",
  "/contests",
  "/board",
  "/leaderboard",
  "/messages",
  "/user",
  "/captains",
  "/demo",
];

function isStudioRequest(pathname: string) {
  if (pathname === "/" || pathname === "/index.html") return true;
  if (["/@", "/assets", "/src", "/node_modules"].some((prefix) => pathname.startsWith(prefix))) return true;
  if (["/favicon.ico", "/favicon.svg", "/site.webmanifest", "/teenx-logo.webp"].includes(pathname)) return true;
  return STUDIO_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

const configureDiscourseProxy: NonNullable<ProxyOptions["configure"]> = (proxy) => {
  proxy.on("proxyRes", (proxyResponse, request) => {
    const location = proxyResponse.headers.location;
    const requestHost = request.headers.host;
    if (!location || !requestHost) return;

    // Relative redirects already stay on the current Studio origin.
    if (!URL.canParse(location)) return;
    const redirect = new URL(location);
    const fixedDevHosts = new Set(["localhost:5174", "localhost:3000", "127.0.0.1:3000"]);
    if (!fixedDevHosts.has(redirect.host)) return;
    redirect.host = requestHost;
    proxyResponse.headers.location = redirect.toString();
  });
};

const configureSsoProxy: NonNullable<ProxyOptions["configure"]> = (proxy, options) => {
  configureDiscourseProxy(proxy, options);
  proxy.on("proxyReq", (proxyRequest, request) => {
    if (request.headers.host) {
      proxyRequest.setHeader("x-teenx-studio-host", request.headers.host);
    }
  });
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5174,
    proxy: {
      "/api": ADVX_SERVER_ORIGIN,
      "/sso-connect": {
        target: ADVX_SERVER_ORIGIN,
        // Paperclip's hostname guard should see its own allowed target host;
        // the original Studio host is carried separately for the SSO redirect.
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/sso-connect/, "/api/advx/sso/discourse-connect"),
        configure: configureSsoProxy,
      },
      "/discourse": {
        target: "http://127.0.0.1:3000",
        // 不用 changeOrigin：让 Discourse 看到 Host: localhost:5174，
        // 这样它生成的重定向 URL 会用 localhost:5174 而非 127.0.0.1:3000
        changeOrigin: false,
        rewrite: (p) => p.replace(/^\/discourse/, ""),
        configure: configureDiscourseProxy,
      },
      // Discourse iframe 内部引用的 stylesheet / theme-javascripts / uploads 等绝对路径资源
      "/stylesheets": "http://127.0.0.1:3000",
      "/theme-javascripts": "http://127.0.0.1:3000",
      "/uploads": "http://127.0.0.1:3000",
      "/images": "http://127.0.0.1:3000",
      "/user_avatar": "http://127.0.0.1:3000",
      "/letter_avatar_proxy": {
        target: "http://127.0.0.1:3000",
        rewrite: (path) => {
          const match = path.match(/^\/letter_avatar_proxy\/([^/]+)\/letter\/([^/]+)\/[^/]+\/(\d+)\.png$/);
          return match ? `/letter_avatar/${match[2]}/${match[3]}/${match[1]}.png` : path;
        },
      },
      "/letter_avatar": "http://127.0.0.1:3000",
      "/stylesheets-baked": "http://127.0.0.1:3000",
      "/svg-sprite": "http://127.0.0.1:3000",
      "/extra": "http://127.0.0.1:3000",
      // Discourse 在根路径生成 Ember bundles、JSON API 和 message-bus URL。
      // Studio 自有路由留给 Vite，其余根路径请求统一交给 Discourse。
      "/": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
        ws: true,
        configure: configureDiscourseProxy,
        bypass: (req) => {
          const pathname = new URL(req.url ?? "/", "http://localhost").pathname;
          return isStudioRequest(pathname) ? req.url : undefined;
        },
      },
    },
  },
});
