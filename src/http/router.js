// Lightweight HTTP router supporting HTTP methods and :named route parameters.

export class Router {
  #routes = [];

  add(method, pattern, handler) {
    const paramNames = [];
    // Convert path patterns like /events/:id to a regex and record parameter names
    const regexSource = pattern
      .replace(/:([a-zA-Z0-9_]+)/g, (_, name) => {
        paramNames.push(name);
        return '([^/]+)';
      })
      .replace(/\/$/, ''); // Normalize trailing slash

    const regex = new RegExp(`^${regexSource || '/'}(?:/)?$`);

    this.#routes.push({
      method: method.toUpperCase(),
      pattern,
      regex,
      paramNames,
      handler,
    });
  }

  get(pattern, handler) {
    this.add('GET', pattern, handler);
  }

  post(pattern, handler) {
    this.add('POST', pattern, handler);
  }

  put(pattern, handler) {
    this.add('PUT', pattern, handler);
  }

  patch(pattern, handler) {
    this.add('PATCH', pattern, handler);
  }

  delete(pattern, handler) {
    this.add('DELETE', pattern, handler);
  }

  resolve(method, pathname) {
    const upperMethod = method.toUpperCase();
    for (const route of this.#routes) {
      if (route.method !== upperMethod) continue;

      const match = route.regex.exec(pathname);
      if (match) {
        const params = {};
        route.paramNames.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1]);
        });
        return { handler: route.handler, params, pattern: route.pattern };
      }
    }
    return null;
  }
}
