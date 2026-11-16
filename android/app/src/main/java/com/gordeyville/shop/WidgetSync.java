package com.gordeyville.shop;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

/** The widget's server check (read-only feed, same key as before). Records how it went for the header:
 *  ok / offline (no connection) / auth (key no longer accepted - sign in again) / failed (server error).
 *  What was shown before stays on screen whatever happens. */
final class WidgetSync {
    private WidgetSync() {}

    static void fetch(Context ctx) {
        SharedPreferences p = ctx.getSharedPreferences(Feed.PREFS, 0);
        String key = p.getString(Feed.PREF_KEY, "");
        if (key.isEmpty()) return;
        String kind;
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(Feed.SUPABASE_URL + "/rest/v1/rpc/gvc_widget_feed2").openConnection();
            c.setConnectTimeout(10000); c.setReadTimeout(15000);
            c.setRequestMethod("POST"); c.setDoOutput(true);
            c.setRequestProperty("apikey", Feed.SUPABASE_KEY);
            c.setRequestProperty("Content-Type", "application/json");
            try (OutputStream os = c.getOutputStream()) { os.write(new JSONObject().put("p_key", key).toString().getBytes(StandardCharsets.UTF_8)); }
            int code = c.getResponseCode();
            if (code == 401 || code == 403) kind = "auth";
            else if (code != 200) kind = "failed";
            else {
                StringBuilder sb = new StringBuilder();
                try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) { String line; while ((line = r.readLine()) != null) sb.append(line); }
                String s = sb.toString().trim();
                if (s.isEmpty() || s.equals("null")) kind = "auth";            // key not accepted any more
                else { JSONObject obj = new JSONObject(s); p.edit().putString(Feed.PREF_CACHE, obj.toString()).apply(); kind = ""; }
            }
        } catch (IOException e) { kind = "offline"; }
        catch (Exception e) { kind = "failed"; }
        SharedPreferences.Editor ed = p.edit().putString(ShopWidgetProvider.P_ERR, kind);
        if (kind.isEmpty()) ed.putLong(ShopWidgetProvider.P_OK_AT, System.currentTimeMillis());
        ed.apply();
    }
}
