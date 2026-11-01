package com.gordeyville.shop;

import android.content.Context;
import android.content.SharedPreferences;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Reads the shop jobs for the widget and turns them into rows for each tab. */
public final class Feed {
    public static final String SUPABASE_URL = "https://bfbhosvkzdxjcmvofotk.supabase.co";
    public static final String SUPABASE_KEY = "sb_publishable_2aeUuYaGA1iLXKNfTeiMhQ_-KelUydR";

    public static final String PREFS = "gvc_widget";
    public static final String PREF_KEY = "feed_key";
    public static final String PREF_TAB = "tab";
    public static final String PREF_CACHE = "cache";
    public static final String PREF_FETCHED = "fetched_at";
    public static final String EXTRA_TAB = "gvc_tab";
    public static final String EXTRA_JOB = "gvc_job";

    public static final String[] TABS = {"pipeline", "orders", "shop"};

    static final String[][] PIPE = {{"released", "Released to me"}, {"drawings", "Check drawings"}, {"dxfs", "Make DXFs"}};
    static final String[][] ORDER = {{"prep", "Preparing order"}, {"quote", "Quote requested"}, {"prod", "In production"},
            {"pickup", "Ready to pick up"}, {"arrived", "Arrived - to count"}, {"recv", "Received"}};
    static final String[][] BUILD = {{"bending", "Bending"}, {"fab", "Fabrication"}, {"paint", "Paint"},
            {"assembly", "Assembly / install"}, {"done", "Done"}};
    static final List<String> CREW = Arrays.asList("Kyle", "Colton", "Aaron", "Cooper");

    // colours (ARGB)
    public static final int C_TEXT = 0xFFE9E6E1, C_MUTED = 0xFF9AA0A8, C_ORANGE = 0xFFFF8A2A, C_RED = 0xFFFF9B91,
            C_CYAN = 0xFF8FE3F5, C_AMBER = 0xFFFFD28A, C_PINK = 0xFFFF9FD2, C_GREEN = 0xFF7BE29B, C_BLUE = 0xFF8EC2FF,
            C_PURPLE = 0xFFC6A6FF, C_GRAY = 0xFF8E96A3;

    public static final class Row {
        public boolean header, dim;
        public String title = "", sub = "", badge = "", job = "", tab = "";
        public int dot = C_GRAY, badgeColor = C_MUTED;
    }

    public static final class Result {
        public final List<Row> rows = new ArrayList<>();
        public int[] counts = new int[3];
        public String error = null;
    }

    private Feed() {}

    /** Fetches from Supabase if the cache is older than maxAgeMs; returns the jobs JSON or null. */
    public static JSONArray load(Context ctx, long maxAgeMs, String[] errorOut) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, 0);
        String key = p.getString(PREF_KEY, "");
        long fetched = p.getLong(PREF_FETCHED, 0);
        String cache = p.getString(PREF_CACHE, null);
        if (key.isEmpty()) { errorOut[0] = "Open the app and sign in to load the board."; return null; }
        if (cache != null && System.currentTimeMillis() - fetched < maxAgeMs) {
            try { return new JSONArray(cache); } catch (Exception ignored) {}
        }
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/rpc/gvc_widget_feed");
            HttpURLConnection c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(10000);
            c.setReadTimeout(15000);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("apikey", SUPABASE_KEY);
            c.setRequestProperty("Content-Type", "application/json");
            byte[] body = new JSONObject().put("p_key", key).toString().getBytes(StandardCharsets.UTF_8);
            try (OutputStream os = c.getOutputStream()) { os.write(body); }
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            StringBuilder sb = new StringBuilder();
            try (BufferedReader r = new BufferedReader(new InputStreamReader(c.getInputStream(), StandardCharsets.UTF_8))) {
                String line; while ((line = r.readLine()) != null) sb.append(line);
            }
            JSONArray arr = new JSONArray(sb.toString());
            p.edit().putString(PREF_CACHE, arr.toString()).putLong(PREF_FETCHED, System.currentTimeMillis()).apply();
            return arr;
        } catch (Exception e) {
            if (cache != null) {
                errorOut[0] = "Offline - showing last copy";
                try { return new JSONArray(cache); } catch (Exception ignored) {}
            }
            errorOut[0] = "Couldn't load the board (" + e.getMessage() + ")";
            return null;
        }
    }

    static int stageIndex(String[][] list, String k) {
        for (int i = 0; i < list.length; i++) if (list[i][0].equals(k)) return i;
        return -1;
    }

    static long days(String iso) {
        if (iso == null || iso.length() < 19) return -1;
        try {
            SimpleDateFormat f = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US);
            f.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date d = f.parse(iso.substring(0, 19));
            return (System.currentTimeMillis() - d.getTime()) / 86400000L;
        } catch (Exception e) { return -1; }
    }

    static String first(String n) { return n == null ? "" : n.split(" ")[0]; }

    static boolean active(JSONObject s) {
        String st = s.optString("status");
        return !st.equals("hold") && !st.equals("declined");
    }

    static String statusText(String st) {
        switch (st) {
            case "sent": return "Sent";
            case "replied": return "Replied";
            case "quote": return "Quote in";
            case "approved": return "Approved";
            case "production": return "In production";
            case "ready": return "Ready for pickup";
            case "arrived": return "Arrived";
            case "received": return "Received";
            case "hold": return "On hold";
            case "declined": return "Declined";
            default: return st;
        }
    }

    static String asmText(String st) {
        switch (st) {
            case "bend": return "Waiting on bending";
            case "ready": return "Ready for fab";
            case "prog": return "In progress";
            case "qc": return "Inspection";
            case "done": return "Done";
            default: return st;
        }
    }

    static int asmColor(String st) {
        switch (st) {
            case "bend": return C_PINK;
            case "ready": return C_BLUE;
            case "prog": return C_ORANGE;
            case "qc": return C_PURPLE;
            case "done": return C_GREEN;
            default: return C_GRAY;
        }
    }

    /** First attention flag for a job (empty if none) and its colour. */
    static String[] flag(JSONObject j) {
        String stage = j.optString("stage");
        JSONArray sups = j.optJSONArray("suppliers");
        if (sups == null) sups = new JSONArray();
        if (stage.equals("quote")) {
            for (int i = 0; i < sups.length(); i++) {
                JSONObject s = sups.optJSONObject(i);
                if (s != null && active(s) && s.optString("status").equals("quote"))
                    return new String[]{first(s.optString("name")) + " quote waiting on you", "orange"};
            }
            for (int i = 0; i < sups.length(); i++) {
                JSONObject s = sups.optJSONObject(i);
                if (s != null && active(s) && s.optString("status").equals("sent") && days(s.optString("sent")) >= 2)
                    return new String[]{first(s.optString("name")) + ": no reply " + days(s.optString("sent")) + "d", "red"};
            }
        }
        if (stage.equals("pickup")) {
            String who = "";
            for (int i = 0; i < sups.length(); i++) { JSONObject s = sups.optJSONObject(i); if (s != null && active(s)) { who = " at " + first(s.optString("name")); break; } }
            return new String[]{"Pick up" + who, "cyan"};
        }
        if (stage.equals("arrived")) return new String[]{"Count & check", "amber"};
        if (stage.equals("bending")) return new String[]{"Needs bending", "pink"};
        return new String[]{"", ""};
    }

    static int color(String n) {
        switch (n) {
            case "orange": return C_ORANGE;
            case "red": return C_RED;
            case "cyan": return C_CYAN;
            case "amber": return C_AMBER;
            case "pink": return C_PINK;
            default: return C_MUTED;
        }
    }

    static Row header(String t) { Row r = new Row(); r.header = true; r.title = t; return r; }
    static Row emptyHeader(String t) { Row r = header(t + "  ·  none"); r.dim = true; return r; }

    static List<JSONObject> inStage(JSONArray jobs, String stage) {
        List<JSONObject> out = new ArrayList<>();
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j != null && stage.equals(j.optString("stage"))) out.add(j);
        }
        out.sort((a, b) -> Double.compare(a.optDouble("order", 0), b.optDouble("order", 0)));
        return out;
    }

    static Row jobRow(JSONObject j, String tab) {
        Row r = new Row();
        r.title = j.optString("name") + (j.optBoolean("sample") ? "  (sample)" : "");
        r.job = j.optString("id");
        r.tab = tab;
        String[] f = flag(j);
        if (!j.optBoolean("sample") && !f[0].isEmpty()) { r.badge = f[0]; r.badgeColor = color(f[1]); r.dot = color(f[1]); }
        return r;
    }

    public static Result build(JSONArray jobs, String tab) {
        Result res = new Result();
        if (jobs == null) return res;
        // attention counts per tab
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j == null || j.optBoolean("sample")) continue;
            String st = j.optString("stage");
            boolean att = !flag(j)[0].isEmpty();
            if (stageIndex(ORDER, st) >= 0 && att) res.counts[1]++;
            if (stageIndex(BUILD, st) >= 0 && att) res.counts[2]++;
        }
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j == null || stageIndex(BUILD, j.optString("stage")) < 0 || j.optString("stage").equals("done")) continue;
            JSONArray asm = j.optJSONArray("assemblies");
            if (asm == null) continue;
            for (int k = 0; k < asm.length(); k++) {
                JSONObject a = asm.optJSONObject(k);
                if (a != null && a.optString("who").isEmpty() && !a.optString("status").equals("done") && !a.optBoolean("final")) res.counts[2]++;
            }
        }

        if (tab.equals("pipeline")) {
            for (String[] s : PIPE) {
                List<JSONObject> list = inStage(jobs, s[0]);
                if (list.isEmpty()) { res.rows.add(emptyHeader(s[1])); continue; }
                res.rows.add(header(s[1] + "  " + list.size()));
                for (JSONObject j : list) {
                    Row r = jobRow(j, "pipeline");
                    r.sub = j.optString("summary");
                    r.dot = 0xFFA374FF;
                    res.rows.add(r);
                }
            }
        } else if (tab.equals("orders")) {
            for (String[] s : ORDER) {
                List<JSONObject> list = inStage(jobs, s[0]);
                if (list.isEmpty()) { res.rows.add(emptyHeader(s[1])); continue; }
                res.rows.add(header(s[1] + "  " + list.size()));
                for (JSONObject j : list) {
                    Row r = jobRow(j, "ordering");
                    JSONArray sups = j.optJSONArray("suppliers");
                    StringBuilder sb = new StringBuilder();
                    if (sups != null) for (int i = 0; i < sups.length(); i++) {
                        JSONObject x = sups.optJSONObject(i);
                        if (x == null) continue;
                        if (sb.length() > 0) sb.append("  ·  ");
                        sb.append(first(x.optString("name"))).append(": ").append(statusText(x.optString("status")));
                        if (x.optString("status").equals("sent")) {
                            long d = days(x.optString("sent"));
                            if (d >= 0) sb.append(d < 1 ? " today" : " " + d + "d");
                        }
                    }
                    r.sub = sb.length() > 0 ? sb.toString() : j.optString("summary");
                    res.rows.add(r);
                }
            }
        } else {
            for (String[] s : BUILD) {
                List<JSONObject> list = inStage(jobs, s[0]);
                if (s[0].equals("done")) continue;
                if (list.isEmpty()) { res.rows.add(emptyHeader(s[1])); continue; }
                res.rows.add(header(s[1] + "  " + list.size()));
                for (JSONObject j : list) {
                    Row r = jobRow(j, "build");
                    JSONArray asm = j.optJSONArray("assemblies");
                    if (asm != null && asm.length() > 0) {
                        int done = 0;
                        for (int k = 0; k < asm.length(); k++) { JSONObject a = asm.optJSONObject(k); if (a != null && a.optString("status").equals("done")) done++; }
                        r.sub = done + " of " + asm.length() + " assemblies done";
                    } else r.sub = j.optString("summary");
                    if (r.badge.isEmpty()) r.dot = C_GREEN;
                    res.rows.add(r);
                }
            }
            // crew lanes
            List<Row> crew = new ArrayList<>();
            List<String> people = new ArrayList<>(CREW);
            people.add("");
            for (String who : people) {
                List<Row> mine = new ArrayList<>();
                for (int i = 0; i < jobs.length(); i++) {
                    JSONObject j = jobs.optJSONObject(i);
                    if (j == null) continue;
                    String st = j.optString("stage");
                    if (stageIndex(BUILD, st) < 0 || st.equals("done")) continue;
                    JSONArray asm = j.optJSONArray("assemblies");
                    if (asm == null) continue;
                    boolean othersOpen = false;
                    for (int k = 0; k < asm.length(); k++) { JSONObject a = asm.optJSONObject(k); if (a != null && !a.optBoolean("final") && !a.optString("status").equals("done")) othersOpen = true; }
                    for (int k = 0; k < asm.length(); k++) {
                        JSONObject a = asm.optJSONObject(k);
                        if (a == null || a.optString("status").equals("done")) continue;
                        if (!a.optString("who").equals(who)) continue;
                        if (who.isEmpty() && a.optBoolean("final") && othersOpen) continue;
                        Row r = new Row();
                        r.title = a.optString("name");
                        r.sub = j.optString("name");
                        r.badge = asmText(a.optString("status"));
                        r.badgeColor = asmColor(a.optString("status"));
                        r.dot = r.badgeColor;
                        r.job = j.optString("id");
                        r.tab = "crew";
                        mine.add(r);
                    }
                }
                if (mine.isEmpty()) continue;
                crew.add(header((who.isEmpty() ? "Unassigned" : who) + "  " + mine.size()));
                crew.addAll(mine);
            }
            if (!crew.isEmpty()) {
                res.rows.add(header("CREW"));
                res.rows.addAll(crew);
            }
        }
        return res;
    }
}
