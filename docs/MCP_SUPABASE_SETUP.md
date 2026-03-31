# Supabase MCP Authentication

Your project ref is `vuxeemwxdldfjybzgtxc`. The MCP config in `~/.cursor/mcp.json` is set to use this project.

## Auth flow (browser-based)

1. **Open Cursor Settings** → **Tools & MCP** (or **Cursor Settings** → **MCP**)
2. Find **Supabase** in the list. If it shows "Needs authentication" or a similar status:
3. Click **Authenticate** / **Sign in** (or the equivalent action)
4. A browser window should open → log in to your Supabase account
5. Choose the organization that contains your Pūrākau project
6. Grant access when prompted
7. **Restart Cursor** so it picks up the new tools

## Verify

After restarting, ask: *"What tables are there in the database? Use MCP tools."*

If it works, you should see tools like `execute_sql`, `apply_migration`, `list_tables`, etc.

## Alternative: Personal access token

If the browser flow fails:

1. Go to [Supabase Access Tokens](https://supabase.com/dashboard/account/tokens)
2. Create a token (e.g. "Cursor MCP")
3. Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "http",
      "url": "https://mcp.supabase.com/mcp?project_ref=vuxeemwxdldfjybzgtxc",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN_HERE"
      }
    }
  }
}
```

Replace `YOUR_TOKEN_HERE` with your token. Restart Cursor.
