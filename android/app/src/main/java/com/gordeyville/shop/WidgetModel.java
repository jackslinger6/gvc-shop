package com.gordeyville.shop;

import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Calendar;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

/**
 * What the home-screen widget shows (widget redesign, Nov 15 2026 - preview). Plain Java so it can be unit-tested.
 *
 * Source of truth: the app's own snapshot for the person signed in on THIS phone (www/widget.js, handed over by
 * WidgetBridge.setState and kept in SharedPreferences): role, their top item ("hero"), the rest, the crew timer,
 * the role's destinations and the app's appearance. Nothing role-specific is guessed from the shared shop feed:
 * without a snapshot that says who's signed in the widget shows a neutral "open the app" card, so a crew phone can
 * never show Kyle's list. For Kyle only, the shared To do list the app publishes to the server (gvc_widget_state
 * 'todo', read through the existing read-only feed) is used when it's newer than this phone's snapshot, so a change
 * made on his computer shows up after a refresh.
 */
public final class WidgetModel {
    public enum State { NO_USER, SETUP, READY }
    public enum Sync { OK, UPDATING, OFFLINE, AUTH, FAILED }

    public static final class Card {
        public String tag = "", title = "", sub = "", act = "", act2 = "", link = "", link2 = "";
        public int color = 0xFF8E96A3;
    }
    public static final class Nav { public String label = "", link = ""; }

    public State state = State.NO_USER;
    public String role = "", name = "", theme = "dark";
    public Card hero;                    // null when nothing needs them
    public Card timer;                   // crew on the clock: title = task, sub = job, link = open the task (Stop timer there)
    public long timerSince = 0;
    public String timerDraw = "";        // drawings link for the job on the clock
    public final List<Card> items = new ArrayList<>();
    public int total = 0;
    public String emptyTitle = "All caught up", emptySub = "";
    public final List<Nav> nav = new ArrayList<>();
    public long dataAt = 0;              // when the information shown was produced
    public Sync sync = Sync.OK;
    public long lastOkAt = 0;            // last successful check with the server
    public boolean recording = false;

    /* ------------------------------------------------------------ inputs */
    public static final class Input {
        public String snapshot;          // JSON from the app (may be null)
        public boolean hasKey;           // signed in (read-only feed key saved)
        public String serverTodo;        // Kyle's shared list from the feed (app_todo), JSON, may be null
        public long serverTodoAt;        // its time
        public boolean refreshing; public String errKind = ""; public long lastOkAt;
        public boolean recording;
    }

    public static WidgetModel from(Input in) {
        WidgetModel m = new WidgetModel();
        m.recording = in.recording;
        m.lastOkAt = in.lastOkAt;
        m.sync = in.refreshing ? Sync.UPDATING : "offline".equals(in.errKind) ? Sync.OFFLINE : "auth".equals(in.errKind) ? Sync.AUTH
                : "failed".equals(in.errKind) ? Sync.FAILED : Sync.OK;
        JSONObject s = null;
        try { if (in.snapshot != null && !in.snapshot.isEmpty()) s = new JSONObject(in.snapshot); } catch (Exception ignored) {}
        if (!in.hasKey) { m.state = State.NO_USER; return m; }          // signed out: show nothing from before
        String role = s == null ? "" : s.optString("role");
        if (s == null || s.optInt("v") < 2 || !(role.equals("admin") || role.equals("crew") || role.equals("parts"))) { m.state = State.SETUP; return m; }
        m.state = State.READY;
        m.role = role; m.name = s.optString("name"); m.theme = s.optString("theme", "dark");
        m.dataAt = s.optLong("at");
        m.hero = card(s.optJSONObject("hero"));
        JSONArray it = s.optJSONArray("items");
        if (it != null) for (int i = 0; i < it.length(); i++) { Card c = card(it.optJSONObject(i)); if (c != null) m.items.add(c); }
        m.total = s.optInt("total", (m.hero == null ? 0 : 1) + m.items.size());
        JSONObject e = s.optJSONObject("empty");
        if (e != null) { m.emptyTitle = e.optString("title", m.emptyTitle); m.emptySub = e.optString("sub"); }
        JSONObject t = s.optJSONObject("timer");
        if (t != null && t.optLong("since") > 0) {
            Card c = new Card(); c.tag = "On the clock"; c.title = t.optString("task"); c.sub = t.optString("job");
            c.color = color(t.optString("c"), 0xFF3AD06B); c.link = linkStr(t.opt("link")); c.act = "Stop timer";
            m.timer = c; m.timerSince = t.optLong("since"); m.timerDraw = linkStr(t.opt("draw"));
        }
        JSONArray nv = s.optJSONArray("nav");
        if (nv != null) for (int i = 0; i < nv.length(); i++) { JSONObject o = nv.optJSONObject(i); if (o == null) continue; Nav n = new Nav(); n.label = o.optString("label"); n.link = linkStr(o.opt("link")); m.nav.add(n); }
        // Kyle: his shared list from the server, if it's newer than this phone's copy
        if (role.equals("admin") && in.serverTodo != null && in.serverTodoAt > m.dataAt) {
            try { fromServerTodo(m, new JSONObject(in.serverTodo)); m.dataAt = in.serverTodoAt; } catch (Exception ignored) {}
        }
        return m;
    }

    /** Kyle's shared list (the app's Home "Next up", published to gvc_widget_state 'todo') -> cards. */
    static void fromServerTodo(WidgetModel m, JSONObject d) {
        JSONArray next = d.optJSONArray("next");
        if (next == null) return;
        List<Card> all = new ArrayList<>();
        int rev = d.optInt("review", 0);
        if (rev > 0) { Card c = new Card(); c.tag = "Review"; c.title = rev + " suggestion" + (rev > 1 ? "s" : "") + " from texts & recordings"; c.sub = "Check them before they go on the list"; c.color = 0xFFFFD28A; c.act = "Review"; c.link = "{\"v\":\"todo\"}"; all.add(c); }
        for (int i = 0; i < next.length(); i++) {
            JSONObject o = next.optJSONObject(i); if (o == null) continue;
            Card c = new Card(); c.tag = sentence(o.optString("tag", "Next")); c.title = o.optString("text"); c.sub = o.optString("sub");
            c.color = color(o.optString("c"), 0xFFFFD28A); c.act = "Open";
            String job = o.optString("job"), tab = o.optString("tab");
            try { c.link = !job.isEmpty() ? new JSONObject().put("job", job).toString() : new JSONObject().put("v", tab.isEmpty() ? "todo" : tab).toString(); } catch (Exception ex) { c.link = "{\"v\":\"todo\"}"; }
            all.add(c);
        }
        m.hero = all.isEmpty() ? null : all.get(0);
        m.items.clear(); if (all.size() > 1) m.items.addAll(all.subList(1, Math.min(all.size(), 13)));
        m.total = all.size();
    }

    static Card card(JSONObject o) {
        if (o == null || o.optString("title").isEmpty()) return null;
        Card c = new Card();
        c.tag = o.optString("tag"); c.title = o.optString("title"); c.sub = o.optString("sub");
        c.act = o.optString("act", "Open"); if (c.act.isEmpty()) c.act = "Open";
        c.act2 = o.optString("act2"); c.color = color(o.optString("c"), 0xFF8E96A3);
        c.link = linkStr(o.opt("link")); c.link2 = linkStr(o.opt("link2"));
        if (c.link2.isEmpty()) c.act2 = "";
        return c;
    }
    static String linkStr(Object o) { return o instanceof JSONObject ? o.toString() : ""; }
    static String sentence(String t) { t = t == null ? "" : t.trim().toLowerCase(Locale.CANADA); return t.isEmpty() ? t : Character.toUpperCase(t.charAt(0)) + t.substring(1); }
    static int color(String h, int dflt) {
        try { if (h != null && h.startsWith("#")) { String x = h.substring(1); if (x.length() == 3) x = "" + x.charAt(0) + x.charAt(0) + x.charAt(1) + x.charAt(1) + x.charAt(2) + x.charAt(2); return 0xFF000000 | Integer.parseInt(x.substring(0, 6), 16); } } catch (Exception ignored) {}
        return dflt;
    }

    /* ------------------------------------------------------------ the header's status line */
    /** [text, kind] kind: "muted" | "amber" | "red" */
    public String[] statusLine(long now) {
        String when = dataAt > 0 ? clock(dataAt, now) : "";
        switch (sync) {
            case UPDATING: return new String[]{"Updating…", "muted"};
            case OFFLINE: return new String[]{when.isEmpty() ? "Offline" : "Offline · showing " + when, "amber"};
            case AUTH: return new String[]{"Sign in again to update", "red"};
            case FAILED: return new String[]{when.isEmpty() ? "Couldn't update" : "Couldn't update · showing " + when, "red"};
            default:
                if (dataAt <= 0) return new String[]{"", "muted"};
                if (now - dataAt > 3 * 3600_000L) return new String[]{"Not updated since " + when, "amber"};
                return new String[]{now - dataAt < 90_000L ? "Updated just now" : "Updated " + when, "muted"};
        }
    }
    /** "2:15 pm" today, "Mon 2:15 pm" this week, "Nov 3" older */
    public static String clock(long t, long now) {
        Calendar a = Calendar.getInstance(), b = Calendar.getInstance(); a.setTimeInMillis(t); b.setTimeInMillis(now);
        String hm = new SimpleDateFormat("h:mm a", Locale.CANADA).format(new Date(t)).replace("a.m.", "am").replace("p.m.", "pm").replace("AM", "am").replace("PM", "pm");
        boolean sameDay = a.get(Calendar.YEAR) == b.get(Calendar.YEAR) && a.get(Calendar.DAY_OF_YEAR) == b.get(Calendar.DAY_OF_YEAR);
        if (sameDay) return hm;
        if (now - t < 6 * 86400_000L) return new SimpleDateFormat("EEE", Locale.CANADA).format(new Date(t)).replace(".", "") + " " + hm;
        return new SimpleDateFormat("MMM d", Locale.CANADA).format(new Date(t)).replace(".", "");
    }
    public boolean needsRetry() { return sync == Sync.OFFLINE || sync == Sync.FAILED; }

    /* ------------------------------------------------------------ size modes */
    public enum Mode { COMPACT, COMPACT_WIDE, MEDIUM, LARGE }
    public static final class Bucket {
        public final Mode mode; public final int navCount; public final boolean headerActions; public final float w, h;
        Bucket(Mode m, int nav, boolean ha, float w, float h) { mode = m; navCount = nav; headerActions = ha; this.w = w; this.h = h; }
        @Override public String toString() { return mode + " nav" + navCount + (headerActions ? " +hdr" : "") + " " + (int) w + "x" + (int) h; }
    }
    /** the layout for a widget of w x h dp (what Android reports for its real size) */
    public static Bucket bucket(float w, float h) {
        if (h < 230) return w >= 300 ? new Bucket(Mode.COMPACT_WIDE, 0, w >= 340, w, h) : new Bucket(Mode.COMPACT, 0, false, w, h);
        if (h < 330) return new Bucket(Mode.MEDIUM, 0, true, w, h);
        return new Bucket(Mode.LARGE, h >= 400 ? (w >= 320 ? 4 : w >= 250 ? 3 : 2) : (w >= 250 ? 2 : 0), true, w, h);
    }
    /** the sizes we give Android 12+ (it picks the biggest one that fits the widget's real size) */
    public static final float[][] SIZES = {{100, 100}, {300, 100}, {340, 100}, {150, 230}, {250, 230}, {150, 330}, {250, 330}, {250, 400}, {320, 400}};

    /** Navigation for the room there is: the role's destinations, most important first */
    public List<Nav> navFor(int n) {
        if (n >= nav.size()) return new ArrayList<>(nav);
        // short of room: drop Home/Today first (the brand opens it), then the least-used; keep the app's order
        String[] pri = role.equals("crew") ? new String[]{"Drawings", "Jobs", "Time", "Today"}
                : role.equals("parts") ? new String[]{"Purchasing", "Inventory", "Jobs", "Today"}
                : new String[]{"Jobs", "Purchasing", "Crew", "Home"};
        List<String> keep = new ArrayList<>();
        for (String p : pri) if (keep.size() < n) keep.add(p);
        List<Nav> out = new ArrayList<>();
        for (Nav x : nav) if (keep.contains(x.label)) out.add(x);
        for (Nav x : nav) if (out.size() < n && !out.contains(x)) out.add(x);
        return out;
    }
}
