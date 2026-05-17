(function (global) {
  "use strict";

  function joinUrl(baseUrl, path) {
    return `${String(baseUrl).replace(/\/$/, "")}${path}`;
  }

  function storageKeyForUrl(url) {
    try {
      const ref = new URL(url).hostname.split(".")[0];
      return `sb-${ref}-auth-token`;
    } catch (error) {
      return "sb-auth-token";
    }
  }

  function safeJsonParse(value) {
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch (error) {
      return null;
    }
  }

  function encodeFilterValue(value) {
    return String(value);
  }

  async function parseResponse(response) {
    const text = await response.text();
    const data = text ? safeJsonParse(text) : null;

    if (!response.ok) {
      return {
        data: null,
        error: data || { message: response.statusText, status: response.status },
      };
    }

    return { data, error: null };
  }

  class PostgrestQueryBuilder {
    constructor(client, table) {
      this.client = client;
      this.table = table;
      this.method = "GET";
      this.body = null;
      this.selectColumns = "*";
      this.filters = [];
      this.orderClause = null;
      this.expectSingle = false;
      this.expectMaybeSingle = false;
      this.returnRepresentation = false;
    }

    select(columns) {
      this.selectColumns = columns || "*";
      if (this.method !== "GET") this.returnRepresentation = true;
      return this;
    }

    insert(values) {
      this.method = "POST";
      this.body = values;
      return this;
    }

    update(values) {
      this.method = "PATCH";
      this.body = values;
      return this;
    }

    delete() {
      this.method = "DELETE";
      return this;
    }

    eq(column, value) {
      this.filters.push([column, `eq.${encodeFilterValue(value)}`]);
      return this;
    }

    order(column, options = {}) {
      this.orderClause = `${column}.${options.ascending === false ? "desc" : "asc"}`;
      return this;
    }

    single() {
      this.expectSingle = true;
      return this;
    }

    maybeSingle() {
      this.expectMaybeSingle = true;
      return this;
    }

    async execute() {
      const url = new URL(joinUrl(this.client.supabaseUrl, `/rest/v1/${this.table}`));
      url.searchParams.set("select", this.selectColumns);
      this.filters.forEach(([column, value]) => url.searchParams.append(column, value));
      if (this.orderClause) url.searchParams.set("order", this.orderClause);

      const headers = this.client.headers();
      if (this.method !== "GET") {
        headers["Content-Type"] = "application/json";
        if (this.returnRepresentation) headers.Prefer = "return=representation";
      }
      if (this.expectSingle || this.expectMaybeSingle) headers.Accept = "application/vnd.pgrst.object+json";

      const response = await fetch(url.toString(), {
        method: this.method,
        headers,
        body: this.body == null ? undefined : JSON.stringify(this.body),
      });
      const result = await parseResponse(response);

      if (this.expectMaybeSingle && result.error && [406, "PGRST116"].includes(result.error.status || result.error.code)) {
        return { data: null, error: null };
      }
      return result;
    }

    then(resolve, reject) {
      return this.execute().then(resolve, reject);
    }

    catch(reject) {
      return this.execute().catch(reject);
    }

    finally(callback) {
      return this.execute().finally(callback);
    }
  }

  class StorageBucket {
    constructor(client, bucket) {
      this.client = client;
      this.bucket = bucket;
    }

    getPublicUrl(path) {
      return {
        data: {
          publicUrl: joinUrl(this.client.supabaseUrl, `/storage/v1/object/public/${this.bucket}/${path}`),
        },
      };
    }

    async upload(path, file, options = {}) {
      const response = await fetch(joinUrl(this.client.supabaseUrl, `/storage/v1/object/${this.bucket}/${path}`), {
        method: "POST",
        headers: {
          ...this.client.headers(),
          "x-upsert": String(Boolean(options.upsert)),
        },
        body: file,
      });
      return parseResponse(response);
    }

    async remove(paths) {
      const response = await fetch(joinUrl(this.client.supabaseUrl, `/storage/v1/object/${this.bucket}`), {
        method: "DELETE",
        headers: {
          ...this.client.headers(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: paths }),
      });
      return parseResponse(response);
    }
  }

  class SupabaseClient {
    constructor(supabaseUrl, supabaseKey) {
      this.supabaseUrl = supabaseUrl;
      this.supabaseKey = supabaseKey;
      this.storageKey = storageKeyForUrl(supabaseUrl);
      this.auth = {
        getSession: () => Promise.resolve({ data: { session: this.getSession() }, error: null }),
        signInWithPassword: (credentials) => this.signInWithPassword(credentials),
        signUp: (credentials) => this.signUp(credentials),
        signOut: () => this.signOut(),
      };
      this.storage = {
        from: (bucket) => new StorageBucket(this, bucket),
      };
    }

    getSession() {
      const stored = safeJsonParse(global.localStorage?.getItem(this.storageKey));
      return stored?.currentSession || stored?.session || stored || null;
    }

    setSession(session) {
      if (!global.localStorage || !session) return;
      global.localStorage.setItem(this.storageKey, JSON.stringify({ currentSession: session, expiresAt: session.expires_at }));
    }

    accessToken() {
      return this.getSession()?.access_token || this.supabaseKey;
    }

    headers() {
      return {
        apikey: this.supabaseKey,
        Authorization: `Bearer ${this.accessToken()}`,
      };
    }

    from(table) {
      return new PostgrestQueryBuilder(this, table);
    }

    async signInWithPassword(credentials) {
      const response = await fetch(joinUrl(this.supabaseUrl, "/auth/v1/token?grant_type=password"), {
        method: "POST",
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });
      const result = await parseResponse(response);
      if (!result.error && result.data) this.setSession(result.data);
      return result.error ? result : { data: { ...result.data, session: result.data, user: result.data.user }, error: null };
    }

    async signUp(credentials) {
      const response = await fetch(joinUrl(this.supabaseUrl, "/auth/v1/signup"), {
        method: "POST",
        headers: {
          apikey: this.supabaseKey,
          Authorization: `Bearer ${this.supabaseKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(credentials),
      });
      return parseResponse(response);
    }

    async signOut() {
      const token = this.getSession()?.access_token;
      if (global.localStorage) global.localStorage.removeItem(this.storageKey);
      if (!token) return { error: null };

      const response = await fetch(joinUrl(this.supabaseUrl, "/auth/v1/logout"), {
        method: "POST",
        headers: this.headers(),
      });
      const result = await parseResponse(response);
      return { error: result.error };
    }
  }

  function createClient(supabaseUrl, supabaseKey) {
    return new SupabaseClient(supabaseUrl, supabaseKey);
  }

  global.supabase = { createClient };
}(self));
