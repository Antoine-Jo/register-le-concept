import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));

function redirectDirectoryRoutes() {
  const routes = new Set(["/login", "/dashboard", "/auth/callback"]);
  const middleware = (request, response, next) => {
    const url = new URL(request.url, "http://localhost");
    if (!routes.has(url.pathname)) {
      next();
      return;
    }

    response.statusCode = 308;
    response.setHeader("Location", `${url.pathname}/${url.search}`);
    response.end();
  };

  return {
    name: "redirect-directory-routes",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH || "/",
  plugins: [redirectDirectoryRoutes()],
  build: {
    rollupOptions: {
      input: {
        main: `${root}index.html`,
        login: `${root}login/index.html`,
        dashboard: `${root}dashboard/index.html`,
        callback: `${root}auth/callback/index.html`,
      },
    },
    target: "es2022",
  },
});
