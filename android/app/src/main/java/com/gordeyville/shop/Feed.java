package com.gordeyville.shop;

import android.content.Context;
import android.content.SharedPreferences;
import android.text.SpannableStringBuilder;
import android.text.Spanned;
import android.text.style.ForegroundColorSpan;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Calendar;
import java.util.Date;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TimeZone;
import org.json.JSONArray;
import org.json.JSONObject;

/** Reads the shop feed (jobs, to-dos, week plan) for the widget and turns it into rows for each tab. */
public final class Feed {
    public static final String SUPABASE_URL = "https://bfbhosvkzdxjcmvofotk.supabase.co";
    public static final String SUPABASE_KEY = "sb_publishable_2aeUuYaGA1iLXKNfTeiMhQ_-KelUydR";

    public static final String PREFS = "gvc_widget";
    public static final String PREF_KEY = "feed_key";
    public static final String PREF_TAB = "tab";
    public static final String PREF_CACHE = "cache2";
    public static final String PREF_FETCHED = "fetched_at";
    public static final String EXTRA_TAB = "gvc_tab";
    public static final String EXTRA_JOB = "gvc_job";

    public static final String[] TABS = {"todo", "pipeline", "orders", "shop"};
    /** Which app view each widget tab opens. */
    public static final String[] APP_TABS = {"todo", "pipeline", "ordering", "build"};

    static final String[][] PIPE = {{"released", "Released to me"}, {"drawings", "Check drawings"}, {"dxfs", "Make DXFs"}};
    static final String[][] ORDER = {{"prep", "Preparing order"}, {"quote", "Quote requested"}, {"prod", "In production"},
            {"pickup", "Ready to pick up"}, {"arrived", "Arrived - to count"}, {"recv", "Received"}};
    static final String[][] BUILD = {{"bending", "Bending"}, {"fab", "Fabrication"}, {"paint", "Paint"},
            {"assembly", "Assembly / install"}, {"done", "Done"}};
    static final List<String> CREW = Arrays.asList("Kyle", "Colton", "Aaron", "Cooper");

    // colours (ARGB) - same palette as the app
    public static final int C_TEXT = 0xFFE9E6E1, C_MUTED = 0xFF9AA0A8, C_DIM = 0xFF6C727A, C_ORANGE = 0xFFFF8A2A, C_RED = 0xFFFF9B91,
            C_CYAN = 0xFF8FE3F5, C_AMBER = 0xFFFFD28A, C_PINK = 0xFFFF9FD2, C_GREEN = 0xFF7BE29B, C_BLUE = 0xFF8EC2FF,
            C_PURPLE = 0xFFC6A6FF, C_GRAY = 0xFF8E96A3, C_PIPE = 0xFFA374FF;
    // stage colours for section bars (match the board column colours)
    static final Map<String, Integer> STAGE_C = new LinkedHashMap<>();
    static {
        STAGE_C.put("released", 0xFFA374FF); STAGE_C.put("drawings", 0xFF2F8FF0); STAGE_C.put("dxfs", 0xFF22C3E6);
        STAGE_C.put("prep", 0xFFE5483B); STAGE_C.put("quote", 0xFFFF8A2A); STAGE_C.put("prod", 0xFF9B4DFF);
        STAGE_C.put("pickup", 0xFF22C3E6); STAGE_C.put("arrived", 0xFFF5B041); STAGE_C.put("recv", 0xFF3AD06B);
        STAGE_C.put("bending", 0xFFE04FA0); STAGE_C.put("fab", 0xFFFF8A2A); STAGE_C.put("paint", 0xFF2F8FF0);
        STAGE_C.put("assembly", 0xFF9B4DFF); STAGE_C.put("done", 0xFF3AD06B);
    }

    public static final class Row {
        public boolean header, dim;
        public String title = "", badge = "", job = "", tab = "";
        public CharSequence sub = "";
        public int dot = C_GRAY, badgeColor = C_MUTED, bar = 0, progress = -1;
        /** drawable for the badge pill, 0 = plain text */
        public int pill = 0;
    }

    public static final class Result {
        public final List<Row> rows = new ArrayList<>();
        /** attention count per tab: to do items, pipeline, orders, shop */
        public int[] counts = new int[4];
        public int review = 0;
    }

    private Feed() {}

    /** Fetches from Supabase if the cache is older than maxAgeMs; returns the feed object or null. */
    public static JSONObject load(Context ctx, long maxAgeMs, String[] errorOut) {
        SharedPreferences p = ctx.getSharedPreferences(PREFS, 0);
        String key = p.getString(PREF_KEY, "");
        long fetched = p.getLong(PREF_FETCHED, 0);
        String cache = p.getString(PREF_CACHE, null);
        if (key.isEmpty()) { errorOut[0] = "Open the app and sign in to load the board."; return null; }
        if (cache != null && System.currentTimeMillis() - fetched < maxAgeMs) {
            try { return new JSONObject(cache); } catch (Exception ignored) {}
        }
        try {
            URL url = new URL(SUPABASE_URL + "/rest/v1/rpc/gvc_widget_feed2");
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
            String s = sb.toString().trim();
            if (s.equals("null") || s.isEmpty()) throw new Exception("key not accepted - open the app and sign in again");
            JSONObject obj = new JSONObject(s);
            p.edit().putString(PREF_CACHE, obj.toString()).putLong(PREF_FETCHED, System.currentTimeMillis()).apply();
            return obj;
        } catch (Exception e) {
            if (cache != null) {
                errorOut[0] = "Offline - showing last copy";
                try { return new JSONObject(cache); } catch (Exception ignored) {}
            }
            errorOut[0] = "Couldn't load the board (" + e.getMessage() + ")";
            return null;
        }
    }

    /* ---------- helpers ---------- */
    static int stageIndex(String[][] list, String k) {
        for (int i = 0; i < list.length; i++) if (list[i][0].equals(k)) return i;
        return -1;
    }
    static int stageColor(String k) { Integer c = STAGE_C.get(k); return c == null ? C_GRAY : c; }

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
    static String todayIso() { return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date()); }

    /** "Kyle, Colton" -> [Kyle, Colton] */
    static List<String> who(JSONObject a) {
        List<String> out = new ArrayList<>();
        for (String s : a.optString("who").split(",")) { s = s.trim(); if (!s.isEmpty()) out.add(s); }
        return out;
    }

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
    static int statusColor(String st) {
        switch (st) {
            case "replied": return 0xFF2F8FF0;
            case "quote": return C_ORANGE;
            case "approved": case "production": return 0xFF9B4DFF;
            case "ready": return 0xFF22C3E6;
            case "arrived": return 0xFFF5B041;
            case "received": return 0xFF3AD06B;
            case "hold": return C_DIM;
            case "declined": return 0xFF4A4F56;
            default: return C_GRAY;
        }
    }

    static String asmText(String st) {
        switch (st) {
            case "bend": return "Waiting on bending";
            case "ready": return "Ready to start";
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

    /** First attention flag for a job (empty if none) and its colour name. */
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
            case "green": return C_GREEN;
            case "blue": return C_BLUE;
            case "purple": return C_PURPLE;
            default: return C_MUTED;
        }
    }
    /** Pill background matching a text colour. */
    static int pillFor(int c) {
        if (c == C_ORANGE) return R.drawable.pill_orange;
        if (c == C_RED) return R.drawable.pill_red;
        if (c == C_CYAN) return R.drawable.pill_cyan;
        if (c == C_AMBER) return R.drawable.pill_amber;
        if (c == C_PINK) return R.drawable.pill_pink;
        if (c == C_GREEN) return R.drawable.pill_green;
        if (c == C_BLUE) return R.drawable.pill_blue;
        if (c == C_PURPLE) return R.drawable.pill_purple;
        return R.drawable.pill_gray;
    }

    static Row header(String t, int bar) { Row r = new Row(); r.header = true; r.title = t; r.bar = bar; return r; }
    static Row emptyHeader(String t, int bar) { Row r = header(t + "  ·  none", bar); r.dim = true; return r; }

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
        r.dot = stageColor(j.optString("stage"));
        String[] f = flag(j);
        if (!j.optBoolean("sample") && !f[0].isEmpty()) { r.badge = f[0]; r.badgeColor = color(f[1]); r.pill = pillFor(r.badgeColor); r.dot = r.badgeColor; }
        return r;
    }

    static int[] taskProgress(JSONObject j) {
        JSONArray asm = j.optJSONArray("assemblies");
        if (asm == null || asm.length() == 0) return null;
        int done = 0;
        for (int k = 0; k < asm.length(); k++) { JSONObject a = asm.optJSONObject(k); if (a != null && a.optString("status").equals("done")) done++; }
        return new int[]{done, asm.length()};
    }

    static boolean finalLocked(JSONObject j, JSONObject a) {
        if (!a.optBoolean("final")) return false;
        JSONArray asm = j.optJSONArray("assemblies");
        if (asm == null) return false;
        for (int k = 0; k < asm.length(); k++) { JSONObject x = asm.optJSONObject(k); if (x != null && !x.optBoolean("final") && !x.optString("status").equals("done")) return true; }
        return false;
    }

    static Row todo(String text, int c, String job, String tab) {
        Row r = new Row(); r.title = text; r.dot = c; r.job = job == null ? "" : job; r.tab = tab; return r;
    }

    static String fh(double h) { String s = String.format(Locale.US, "%.1f", h); if (s.endsWith(".0")) s = s.substring(0, s.length() - 2); return s + "h"; }

    static CharSequence colored(String text, int color) {
        SpannableStringBuilder b = new SpannableStringBuilder(text);
        b.setSpan(new ForegroundColorSpan(color), 0, text.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
        return b;
    }

    /* ---------- build the rows for a tab ---------- */
    public static Result build(JSONObject feed, String tab) {
        Result res = new Result();
        if (feed == null) return res;
        JSONArray jobs = feed.optJSONArray("jobs"); if (jobs == null) jobs = new JSONArray();
        JSONArray todos = feed.optJSONArray("todos"); if (todos == null) todos = new JSONArray();
        JSONArray hiddenArr = feed.optJSONArray("hidden");
        Set<String> hidden = new HashSet<>();
        if (hiddenArr != null) for (int i = 0; i < hiddenArr.length(); i++) hidden.add(hiddenArr.optString(i));
        JSONObject plan = feed.optJSONObject("plan"); if (plan == null) plan = new JSONObject();
        res.review = feed.optInt("review", 0);
        Map<String, String> jobName = new LinkedHashMap<>();
        for (int i = 0; i < jobs.length(); i++) { JSONObject j = jobs.optJSONObject(i); if (j != null) jobName.put(j.optString("id"), j.optString("name")); }

        // ---- board reminders (same rules as the app's To do tab) ----
        List<Row> reminders = new ArrayList<>();
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j == null || j.optBoolean("sample")) continue;
            String st = j.optString("stage"), n = j.optString("name"), id = j.optString("id");
            JSONArray sups = j.optJSONArray("suppliers"); if (sups == null) sups = new JSONArray();
            switch (st) {
                case "released": reminders.add(todo("Look over new job: " + n, C_PIPE, id, "pipeline")); break;
                case "drawings": reminders.add(todo("Check drawings: " + n, 0xFF2F8FF0, id, "pipeline")); break;
                case "dxfs": reminders.add(todo("Make DXFs: " + n, 0xFF22C3E6, id, "pipeline")); break;
                case "prep": reminders.add(todo("Send the order: " + n, 0xFFE5483B, id, "ordering")); break;
                case "quote":
                    for (int k = 0; k < sups.length(); k++) { JSONObject s = sups.optJSONObject(k); if (s == null || !active(s)) continue;
                        if (s.optString("status").equals("quote")) reminders.add(todo("Review " + first(s.optString("name")) + "'s quote" + (s.optString("quoteNo").isEmpty() ? "" : " #" + s.optString("quoteNo")) + " - " + n, C_ORANGE, id, "ordering"));
                        if (s.optString("status").equals("sent") && days(s.optString("sent")) >= 2) reminders.add(todo("Follow up with " + first(s.optString("name")) + " - " + n + " (no reply " + days(s.optString("sent")) + "d)", C_RED, id, "ordering")); }
                    break;
                case "pickup": {
                    String at = "";
                    for (int k = 0; k < sups.length(); k++) { JSONObject s = sups.optJSONObject(k); if (s != null && active(s)) { at = " at " + first(s.optString("name")); break; } }
                    reminders.add(todo("Pick up " + n + at, C_CYAN, id, "ordering")); break; }
                case "arrived": reminders.add(todo("Count & check: " + n, C_AMBER, id, "ordering")); break;
                case "bending": reminders.add(todo("Bend parts: " + n, C_PINK, id, "build")); break;
                default: break;
            }
            // NCRs still being decided
            JSONArray ncrs = j.optJSONArray("ncrs");
            if (ncrs != null) for (int k = 0; k < ncrs.length(); k++) { JSONObject x = ncrs.optJSONObject(k);
                if (x != null && !x.optBoolean("closed") && "Deciding".equals(x.optString("fix")))
                    reminders.add(todo("Decide the fix for NCR-" + String.format(Locale.US, "%03d", x.optInt("n")) + " (" + n + "): " + x.optString("what"), 0xFFE5483B, id, "build")); }
        }
        // crew with nothing, unassigned tasks
        List<String> idle = new ArrayList<>(CREW); idle.remove("Kyle");
        int unassigned = 0; Set<String> unJobs = new HashSet<>();
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j == null) continue;
            String st = j.optString("stage");
            if (stageIndex(BUILD, st) < 0 || st.equals("done")) continue;
            JSONArray asm = j.optJSONArray("assemblies"); if (asm == null) continue;
            for (int k = 0; k < asm.length(); k++) { JSONObject a = asm.optJSONObject(k); if (a == null || a.optString("status").equals("done")) continue;
                List<String> w = who(a); idle.removeAll(w);
                if (w.isEmpty() && !finalLocked(j, a)) { unassigned++; unJobs.add(j.optString("name")); } }
        }
        if (!idle.isEmpty()) reminders.add(todo("Give work to " + String.join(", ", idle), C_ORANGE, null, "crew"));
        if (unassigned > 0) reminders.add(todo("Assign " + unassigned + " task" + (unassigned > 1 ? "s" : "") + " (" + String.join(", ", unJobs) + ")", C_ORANGE, null, "crew"));
        List<String> noNum = new ArrayList<>(); List<String> doneJobs = new ArrayList<>(); String firstNoNum = null, firstDone = null;
        for (int i = 0; i < jobs.length(); i++) { JSONObject j = jobs.optJSONObject(i); if (j == null || j.optBoolean("sample")) continue;
            if (!j.optString("name").matches("(?is)^\\s*(\\d{4}[A-Za-z0-9_]{0,4}|INV)\\b.*")) { noNum.add(j.optString("name")); if (firstNoNum == null) firstNoNum = j.optString("id"); }
            if (j.optString("stage").equals("done")) { doneJobs.add(j.optString("name")); if (firstDone == null) firstDone = j.optString("id"); } }
        if (!noNum.isEmpty()) reminders.add(todo("Add job numbers: " + String.join(", ", noNum), 0xFFF5B041, firstNoNum, "build"));
        if (!doneJobs.isEmpty()) reminders.add(todo("Archive finished job" + (doneJobs.size() > 1 ? "s" : "") + ": " + String.join(", ", doneJobs), 0xFF3AD06B, firstDone, "build"));
        Iterator<Row> it = reminders.iterator();
        while (it.hasNext()) if (hidden.contains(it.next().title)) it.remove();

        // ---- attention counts per tab ----
        res.counts[0] = reminders.size() + todos.length();
        for (int i = 0; i < jobs.length(); i++) {
            JSONObject j = jobs.optJSONObject(i);
            if (j == null || j.optBoolean("sample")) continue;
            String st = j.optString("stage");
            boolean att = !flag(j)[0].isEmpty();
            if (stageIndex(ORDER, st) >= 0 && att) res.counts[2]++;
            if (stageIndex(BUILD, st) >= 0 && att) res.counts[3]++;
        }
        res.counts[3] += unassigned;

        if (tab.equals("todo")) {
            if (res.review > 0) { Row r = todo(res.review + " suggestion" + (res.review > 1 ? "s" : "") + " from texts & recordings to review", C_AMBER, null, "todo"); r.badge = "Review"; r.badgeColor = C_AMBER; r.pill = pillFor(C_AMBER); res.rows.add(r); }
            res.rows.add(todos.length() > 0 ? header("To do  " + todos.length(), C_AMBER) : emptyHeader("To do", C_AMBER));
            for (int i = 0; i < todos.length(); i++) {
                JSONObject t = todos.optJSONObject(i); if (t == null) continue;
                Row r = todo(t.optString("text"), C_AMBER, t.optString("job_id", ""), "todo");
                String jn = jobName.get(t.optString("job_id"));
                List<String> meta = new ArrayList<>();
                if (!t.optString("from_name").isEmpty()) meta.add(t.optString("from_name"));
                if (jn != null) meta.add(jn);
                r.sub = String.join("  ·  ", meta);
                res.rows.add(r);
            }
            res.rows.add(reminders.isEmpty() ? emptyHeader("From the board", C_GRAY) : header("From the board  " + reminders.size(), C_GRAY));
            for (Row r : reminders) { String jn = jobName.get(r.job); if (jn != null && !r.title.contains(jn)) r.sub = jn; res.rows.add(r); }
        } else if (tab.equals("pipeline")) {
            for (String[] s : PIPE) {
                List<JSONObject> list = inStage(jobs, s[0]);
                if (list.isEmpty()) { res.rows.add(emptyHeader(s[1], stageColor(s[0]))); continue; }
                res.rows.add(header(s[1] + "  " + list.size(), stageColor(s[0])));
                for (JSONObject j : list) { Row r = jobRow(j, "pipeline"); r.sub = j.optString("summary"); res.rows.add(r); }
            }
        } else if (tab.equals("orders")) {
            for (String[] s : ORDER) {
                List<JSONObject> list = inStage(jobs, s[0]);
                if (list.isEmpty()) { res.rows.add(emptyHeader(s[1], stageColor(s[0]))); continue; }
                res.rows.add(header(s[1] + "  " + list.size(), stageColor(s[0])));
                for (JSONObject j : list) {
                    Row r = jobRow(j, "ordering");
                    JSONArray sups = j.optJSONArray("suppliers");
                    SpannableStringBuilder sb = new SpannableStringBuilder();
                    if (sups != null) for (int i = 0; i < sups.length(); i++) {
                        JSONObject x = sups.optJSONObject(i);
                        if (x == null) continue;
                        if (sb.length() > 0) sb.append("\n");
                        int st0 = sb.length(); sb.append("● ");
                        sb.setSpan(new ForegroundColorSpan(statusColor(x.optString("status"))), st0, st0 + 1, Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                        int n0 = sb.length(); sb.append(x.optString("name"));
                        sb.setSpan(new ForegroundColorSpan(0xFFCFD3D8), n0, sb.length(), Spanned.SPAN_EXCLUSIVE_EXCLUSIVE);
                        sb.append("  ").append(statusText(x.optString("status")));
                        if (x.optString("status").equals("sent")) { long d = days(x.optString("sent")); if (d >= 0) sb.append(d < 1 ? " · today" : " · " + d + "d"); }
                        if (x.optString("status").equals("quote") && !x.optString("quoteNo").isEmpty()) sb.append(" · #").append(x.optString("quoteNo"));
                    }
                    r.sub = sb.length() > 0 ? sb : j.optString("summary");
                    res.rows.add(r);
                }
            }
        } else {
            for (String[] s : BUILD) {
                if (s[0].equals("done")) continue;
                List<JSONObject> list = inStage(jobs, s[0]);
                if (list.isEmpty()) { res.rows.add(emptyHeader(s[1], stageColor(s[0]))); continue; }
                res.rows.add(header(s[1] + "  " + list.size(), stageColor(s[0])));
                for (JSONObject j : list) {
                    Row r = jobRow(j, "build");
                    int[] pr = taskProgress(j);
                    if (pr != null) { r.sub = pr[0] + " of " + pr[1] + " tasks done"; r.progress = pr[1] > 0 ? (int) Math.round(pr[0] * 100.0 / pr[1]) : 0; }
                    else r.sub = j.optString("summary");
                    res.rows.add(r);
                }
            }
            // ---- crew: today's plan per person (from the week planner) ----
            String today = todayIso();
            int dow = Calendar.getInstance().get(Calendar.DAY_OF_WEEK);
            boolean weekend = dow == Calendar.SATURDAY || dow == Calendar.SUNDAY;
            JSONObject sched = plan.optJSONObject("sched"); if (sched == null) sched = new JSONObject();
            JSONObject off = plan.optJSONObject("off"); if (off == null) off = new JSONObject();
            JSONObject hours = plan.optJSONObject("hours"); if (hours == null) hours = new JSONObject();
            JSONObject extra = plan.optJSONObject("extra"); if (extra == null) extra = new JSONObject();
            // task lookup: "j:<job>:<task>" -> [job, task]
            Map<String, JSONObject[]> tasks = new LinkedHashMap<>();
            for (int i = 0; i < jobs.length(); i++) { JSONObject j = jobs.optJSONObject(i); if (j == null || j.optString("stage").equals("done")) continue;
                JSONArray asm = j.optJSONArray("assemblies"); if (asm == null) continue;
                for (int k = 0; k < asm.length(); k++) { JSONObject a = asm.optJSONObject(k); if (a != null && !a.optString("id").isEmpty()) tasks.put("j:" + j.optString("id") + ":" + a.optString("id"), new JSONObject[]{j, a}); } }
            Set<String> placedToday = new HashSet<>();
            List<Row> crew = new ArrayList<>();
            crew.add(header(weekend ? "CREW  ·  next shift" : "CREW  ·  today", C_TEXT));
            for (String p : CREW) {
                JSONArray offDays = off.optJSONArray(p);
                boolean isOff = false;
                if (offDays != null) for (int i = 0; i < offDays.length(); i++) if (today.equals(offDays.optString(i))) isOff = true;
                JSONObject days = sched.optJSONObject(p);
                JSONArray list = days == null ? null : days.optJSONArray(today);
                List<Row> mine = new ArrayList<>();
                double tot = 0;
                if (list != null) for (int i = 0; i < list.length(); i++) {
                    String key = list.optString(i);
                    Row r = new Row(); r.tab = "crew";
                    if (key.startsWith("j:")) {
                        JSONObject[] ja = tasks.get(key); if (ja == null) continue;
                        JSONObject j = ja[0], a = ja[1];
                        if (a.optString("status").equals("done") || !who(a).contains(p)) continue;
                        placedToday.add(key);
                        double h = hours.has(key) ? hours.optDouble(key, 2) : 2;
                        List<String> others = who(a); others.remove(p);
                        r.title = a.optString("name");
                        r.sub = j.optString("name") + (others.isEmpty() ? "" : "  ·  with " + String.join(", ", others));
                        r.badge = fh(h) + (hours.has(key) ? "" : "?") + "  " + asmText(a.optString("status"));
                        r.badgeColor = asmColor(a.optString("status")); r.pill = pillFor(r.badgeColor); r.dot = r.badgeColor;
                        r.job = j.optString("id");
                        tot += h;
                    } else if (key.startsWith("x:")) {
                        JSONObject x = extra.optJSONObject(key.substring(2)); if (x == null || x.optBoolean("done")) continue;
                        JSONArray w = x.optJSONArray("who"); boolean mineToo = false;
                        if (w != null) for (int k = 0; k < w.length(); k++) if (p.equals(w.optString(k))) mineToo = true;
                        if (!mineToo) continue;
                        double h = x.has("h") && !x.isNull("h") ? x.optDouble("h", 2) : 2;
                        r.title = x.optString("name"); r.sub = x.optBoolean("errand") ? "Errand" : x.optString("job", "Other");
                        r.badge = fh(h); r.badgeColor = x.optBoolean("errand") ? C_AMBER : C_GRAY; r.pill = pillFor(r.badgeColor); r.dot = r.badgeColor;
                        tot += h;
                    } else continue;
                    mine.add(r);
                }
                if (isOff) { crew.add(header(p + "  ·  day off", C_DIM)); continue; }
                if (mine.isEmpty()) { Row r = header(p + "  ·  nothing scheduled" + (weekend ? "" : " today"), C_DIM); r.dim = true; crew.add(r); continue; }
                crew.add(header(p + "  ·  " + fh(tot) + " / 8h", C_ORANGE));
                crew.addAll(mine);
            }
            // tasks with people on them that aren't on today's plan, and the unscheduled pool
            int pool = 0, assignedNotToday = 0;
            for (Map.Entry<String, JSONObject[]> e : tasks.entrySet()) {
                JSONObject a = e.getValue()[1];
                if (a.optString("status").equals("done") || placedToday.contains(e.getKey())) continue;
                if (who(a).isEmpty()) pool++; else assignedNotToday++;
            }
            if (pool > 0 || assignedNotToday > 0) {
                Row r = header((pool > 0 ? pool + " not scheduled" : "") + (pool > 0 && assignedNotToday > 0 ? "  ·  " : "") + (assignedNotToday > 0 ? assignedNotToday + " assigned for other days" : ""), C_DIM);
                r.dim = true; crew.add(r);
            }
            res.rows.addAll(crew);
        }
        return res;
    }
}
