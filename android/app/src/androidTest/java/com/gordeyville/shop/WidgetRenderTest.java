package com.gordeyville.shop;

import static org.junit.Assert.assertTrue;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Rect;
import android.os.Bundle;
import android.text.Layout;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ListView;
import android.widget.RemoteViews;
import android.widget.TextView;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleCallback;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

/**
 * Widget redesign (Nov 15): renders the real widget views (the same RemoteViews the launcher gets) for each role,
 * state, size and text size on the emulator, saves a PNG of each, and checks the layout:
 *   - no visible view sticks out of the widget (nothing clipped at the edges)
 *   - text is at least 12sp (the tag/status size); the main button's label is never cut off
 *   - every tappable part is at least 48 x 48 dp and no two tappable parts overlap
 * Then taps the buttons and checks the app opens with the right link. Never touches the network
 * (ShopWidgetProvider.NO_NETWORK) and never signs in, so nothing live is read or written.
 * Output (PNGs + results.tsv) goes to the test's additional output folder, which Gradle copies off the device.
 */
@RunWith(AndroidJUnit4.class)
public class WidgetRenderTest {
    Context ctx;
    File out;
    final StringBuilder tsv = new StringBuilder("scenario\tsize\tfont\tmode\tresult\tnotes\n");
    int fails = 0;

    @Before public void setUp() {
        ctx = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ShopWidgetProvider.NO_NETWORK = true;
        String dir = InstrumentationRegistry.getArguments().getString("additionalTestOutputDir");
        out = new File(ctx.getExternalMediaDirs()[0], "w2");      // /sdcard/Android/media/<app>/w2 - readable by adb on every Android version
        out.mkdirs();
    }

    /* ------------------------------------------------------------ fixtures (made-up content, no live data) */
    static JSONObject card(String tag, String title, String sub, String c, String act, String link) throws Exception {
        JSONObject o = new JSONObject().put("tag", tag).put("title", title).put("sub", sub).put("c", c).put("act", act);
        if (link != null) o.put("link", new JSONObject(link));
        return o;
    }
    static JSONArray nav(String role) throws Exception {
        String[][] n = role.equals("crew") ? new String[][]{{"Today", "today"}, {"Jobs", "build"}, {"Drawings", "drawings"}, {"Time", "time"}}
                : role.equals("parts") ? new String[][]{{"Today", "home"}, {"Purchasing", "purchasing"}, {"Inventory", "inv"}, {"Jobs", "build"}}
                : new String[][]{{"Home", "home"}, {"Jobs", "overview"}, {"Purchasing", "purchasing"}, {"Crew", "crew"}};
        JSONArray a = new JSONArray();
        for (String[] x : n) a.put(new JSONObject().put("label", x[0]).put("link", new JSONObject().put("v", x[1])));
        return a;
    }
    static String snap(String role, String theme, JSONObject hero, JSONObject timer, JSONArray items, int total) throws Exception {
        JSONObject s = new JSONObject().put("v", 2).put("at", System.currentTimeMillis() - 60_000).put("role", role).put("name", "Test").put("theme", theme)
                .put("items", items == null ? new JSONArray() : items).put("total", total).put("nav", nav(role))
                .put("empty", new JSONObject().put("title", "All caught up").put("sub", "Nothing needs you right now."));
        if (hero != null) s.put("hero", hero);
        if (timer != null) s.put("timer", timer);
        return s.toString();
    }
    static JSONArray adminItems(int n) throws Exception {
        String[][] r = {{"Quote", "Review the quote for the deck steel", "Job 1234 · Truck deck", "#ff8a2a", "{\"job\":\"j1\"}"},
                {"Count", "Count in the hardware order", "INV · Inventory", "#f5b041", "{\"count\":[\"inv\",\"s2\"]}"},
                {"Crew", "Give work to Sam", "From the board", "#ff8a2a", "{\"v\":\"crew\"}"},
                {"Ncr", "Decide the fix for NCR-004", "Job 1234 · Truck deck", "#e5483b", "{\"job\":\"j1\",\"sec\":\"ncr\"}"},
                {"To do", "Call the paint shop about Friday", "Your to-do", "#ffd28a", "{\"v\":\"todo\"}"},
                {"Follow up", "Follow up with the steel supplier", "Job 5678 · Tote box", "#e5483b", "{\"job\":\"j2\"}"}};
        JSONArray a = new JSONArray();
        for (int i = 0; i < n; i++) { String[] x = r[i % r.length]; a.put(card(x[0], x[1], x[2], x[3], "Open", x[4])); }
        return a;
    }

    Map<String, String[]> scenarios() throws Exception {
        Map<String, String[]> m = new LinkedHashMap<>();   // name -> {snapshot, errKind, flags}
        JSONObject kyleHero = card("Pick up", "Pick up the steel order", "Job 1234 · Truck deck", "#22c3e6", "Picked up – count it", "{\"count\":[\"j1\",\"s1\"]}");
        m.put("kyle", new String[]{snap("admin", "dark", kyleHero, null, adminItems(6), 7), "", ""});
        m.put("kyle_light", new String[]{snap("admin", "light", kyleHero, null, adminItems(6), 7), "", ""});
        JSONObject robHero = card("Count it in", "Count in the light kit order", "PO-1009 · Resource Supply", "#2f8ff0", "Count it in", "{\"po\":\"o1\",\"count\":1}");
        JSONArray robItems = new JSONArray().put(card("Pick a vendor", "Compare quotes: hinges", "RFQ-1011 · 3 quotes in · lowest $412.50", "#22c3e6", "Compare quotes", "{\"po\":\"o2\"}"))
                .put(card("Low stock", "4 hardware items running low", "Hardware · bolts, lights, electrical", "#e5483b", "See them", "{\"inv\":\"hw\"}"))
                .put(card("To do", "Ask Russel for the mill certs", "Kyle", "#ffd28a", "Open", "{\"v\":\"home\"}"));
        m.put("robin_girly", new String[]{snap("parts", "girly", robHero, null, robItems, 4), "", ""});
        m.put("robin_dark", new String[]{snap("parts", "dark", robHero, null, robItems, 4), "", ""});
        JSONObject crewHero = card("Next up", "Weld the headache rack frame", "1234 · Truck deck", "#e5483b", "Start work", "{\"task\":[\"j1\",\"a1\"],\"why\":\"start\"}")
                .put("act2", "Drawings").put("link2", new JSONObject("{\"draw\":\"j1\"}"));
        JSONArray crewItems = new JSONArray().put(card("Next up", "Fit the toolbox lids", "1234 · Truck deck", "#e5483b", "Open", "{\"task\":[\"j1\",\"a2\"]}"))
                .put(card("Blocked", "Install the winch", "1234 · Truck deck · Waiting on bending", "#e5483b", "Open", "{\"task\":[\"j1\",\"a3\"]}"));
        m.put("crew_next", new String[]{snap("crew", "dark", crewHero, null, crewItems, 3), "", ""});
        JSONObject timer = new JSONObject().put("since", System.currentTimeMillis() - 5400_000L).put("task", "Weld the headache rack frame").put("job", "1234 · Truck deck")
                .put("c", "#e5483b").put("link", new JSONObject("{\"task\":[\"j1\",\"a1\"],\"why\":\"stop\"}")).put("draw", new JSONObject("{\"draw\":\"j1\"}"));
        m.put("crew_timer", new String[]{snap("crew", "dark", null, timer, crewItems, 3), "", ""});
        m.put("empty", new String[]{snap("admin", "dark", null, null, null, 0), "", ""});
        JSONObject longHero = card("Follow up", "Follow up with Russel Metals about the second half of the 1086WT Avalanche winch tractor order and the missing FENDER.5 parts that never shipped", "1086WT · Avalanche Winch Tractor with the extra long name for testing · Russel Metals", "#e5483b", "Picked up – count it", "{\"job\":\"j1\"}");
        m.put("long_text", new String[]{snap("admin", "dark", longHero, null, adminItems(6), 128), "", ""});
        m.put("offline", new String[]{snap("admin", "dark", kyleHero, null, adminItems(6), 7), "offline", ""});
        m.put("error", new String[]{snap("admin", "dark", kyleHero, null, adminItems(6), 7), "failed", ""});
        m.put("auth", new String[]{snap("admin", "dark", kyleHero, null, adminItems(6), 7), "auth", ""});
        m.put("updating", new String[]{snap("admin", "dark", kyleHero, null, adminItems(6), 7), "", "updating"});
        m.put("recording", new String[]{snap("admin", "dark", kyleHero, null, adminItems(6), 7), "", "rec"});
        m.put("signed_out", new String[]{null, "", "nokey"});
        m.put("setup", new String[]{null, "", ""});
        return m;
    }
    static final float[][] SIZES = {{180, 120}, {250, 130}, {320, 120}, {360, 130}, {180, 260}, {300, 260}, {330, 340}, {330, 450}, {330, 540}, {560, 640}, {640, 240}};
    static final float[] FONTS = {1.0f, 1.3f, 1.6f, 2.0f};

    void apply(String[] sc) {
        SharedPreferences.Editor e = ctx.getSharedPreferences(Feed.PREFS, 0).edit().clear();
        if (!"nokey".equals(sc[2])) e.putString(Feed.PREF_KEY, "test-key");
        if (sc[0] != null) e.putString(ShopWidgetProvider.P_SNAP, sc[0]);
        e.putString(ShopWidgetProvider.P_ERR, sc[1]);
        if ("updating".equals(sc[2])) e.putLong(ShopWidgetProvider.P_REFRESH_AT, System.currentTimeMillis());
        e.commit();
        ShopWidgetProvider.FORCE_RECORDING = "rec".equals(sc[2]);
    }

    /* ------------------------------------------------------------ a real widget host (like a launcher) */
    // The emulator run grants this app the right to bind widgets (adb shell appwidget grantbind) so the test can be
    // its own launcher: a real widget id bound to ShopWidgetProvider, updated through AppWidgetManager and shown in an
    // AppWidgetHostView - the same path the home screen uses, lists (and the Android 11 list service) included.
    static android.appwidget.AppWidgetHost host;
    static int hostId = -1;
    static boolean realHost = false;
    static int renders = 0;
    void ensureHost() {
        if (hostId >= 0) return;
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            host = new android.appwidget.AppWidgetHost(ctx, 4242);
            host.startListening();
            hostId = host.allocateAppWidgetId();
            realHost = android.appwidget.AppWidgetManager.getInstance(ctx).bindAppWidgetIdIfAllowed(hostId, new android.content.ComponentName(ctx, ShopWidgetProvider.class));
        });
    }
    android.appwidget.AppWidgetHostView hostView(Context c) {
        final android.appwidget.AppWidgetHostView[] hv = {null};
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            android.appwidget.AppWidgetProviderInfo info = android.appwidget.AppWidgetManager.getInstance(ctx).getAppWidgetInfo(hostId);
            hv[0] = host.createView(c, hostId, info);
            hv[0].setPadding(0, 0, 0, 0);
        });
        return hv[0];
    }

    /* ------------------------------------------------------------ render + check */
    static final class Shot { View root; FrameLayout host; Bitmap bmp; }
    /** a real window to draw in (lists only fill in when attached): the app's own screen, with the widget laid over it */
    static Activity window() throws InterruptedException {
        final Activity[] a = {null};
        for (int tries = 0; tries < 60 && a[0] == null; tries++) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                for (Activity x : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)) a[0] = x; });
            if (a[0] == null) {
                if (tries == 0) { Context t = InstrumentationRegistry.getInstrumentation().getTargetContext();
                    t.startActivity(new Intent(t, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)); }
                Thread.sleep(500);
            }
        }
        return a[0];
    }
    Shot render(Context c, RemoteViews rv, int wpx, int hpx) throws InterruptedException {
        final Shot s = new Shot();
        final Activity act = window();
        ensureHost();
        final android.appwidget.AppWidgetHostView hv = realHost ? hostView(c) : null;
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            s.host = new FrameLayout(c);
            if (hv != null) s.host.addView(hv, new FrameLayout.LayoutParams(wpx, hpx));
            else {   // no bind permission: apply the views directly (lists stay empty this way)
                android.os.Parcel pa = android.os.Parcel.obtain();
                rv.writeToParcel(pa, 0); pa.setDataPosition(0);
                RemoteViews got = RemoteViews.CREATOR.createFromParcel(pa); pa.recycle();
                s.root = got.apply(c, s.host);
                s.host.addView(s.root, new FrameLayout.LayoutParams(wpx, hpx));
            }
            if (act != null) act.addContentView(s.host, new ViewGroup.LayoutParams(wpx, hpx));
        });
        final String marker = "render-" + (++renders);
        if (hv != null) {
            rv.setContentDescription(R.id.w_root, marker);       // to tell this update from the host's earlier one
            android.appwidget.AppWidgetManager.getInstance(ctx).updateAppWidget(hostId, rv);     // through the system, like a real update
            for (int i = 0; i < 40; i++) {
                InstrumentationRegistry.getInstrumentation().waitForIdleSync();
                final boolean[] ready = {false}; final boolean late = i > 25;
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                    hv.measure(View.MeasureSpec.makeMeasureSpec(wpx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hpx, View.MeasureSpec.EXACTLY));
                    hv.layout(0, 0, wpx, hpx);
                    View r = hv.getChildCount() > 0 ? hv.getChildAt(0) : null;
                    ListView lv = r == null ? null : r.findViewById(R.id.w_list);
                    boolean listWanted = lv != null && lv.getVisibility() == View.VISIBLE;
                    ready[0] = r != null && marker.contentEquals(String.valueOf(r.getContentDescription())) && (!listWanted || lv.getChildCount() > 0 || late);
                    if (ready[0]) s.root = r;
                });
                if (ready[0]) break;
                Thread.sleep(100);
            }
        }
        InstrumentationRegistry.getInstrumentation().waitForIdleSync();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (int pass = 0; pass < 3; pass++) {      // lists fill in on layout - lay out a few times
                s.host.measure(View.MeasureSpec.makeMeasureSpec(wpx, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(hpx, View.MeasureSpec.EXACTLY));
                s.host.layout(0, 0, wpx, hpx);
            }
            int pad = (int) (12 * c.getResources().getDisplayMetrics().density);
            s.bmp = Bitmap.createBitmap(wpx + 2 * pad, hpx + 2 * pad, Bitmap.Config.ARGB_8888);
            Canvas cv = new Canvas(s.bmp);
            cv.drawColor(0xFF5B6B7A);                 // a plain mid-tone "wallpaper" around it
            cv.translate(pad, pad);
            s.host.draw(cv);
            if (s.host.getParent() instanceof ViewGroup) ((ViewGroup) s.host.getParent()).removeView(s.host);   // off the window again (taps still work)
        });
        return s;
    }
    static Rect rectIn(View v, View root) {
        int x = 0, y = 0; View cur = v;
        while (cur != null && cur != root) { x += cur.getLeft() - cur.getScrollX(); y += cur.getTop() - cur.getScrollY(); if (!(cur.getParent() instanceof View)) break; cur = (View) cur.getParent(); }
        return new Rect(x, y, x + v.getWidth(), y + v.getHeight());
    }
    static void collect(View v, List<View> all) {
        if (v.getVisibility() != View.VISIBLE) return;
        all.add(v);
        if (v instanceof ViewGroup) { ViewGroup g = (ViewGroup) v; for (int i = 0; i < g.getChildCount(); i++) collect(g.getChildAt(i), all); }
    }
    static boolean inList(View v) { for (Object p = v.getParent(); p instanceof View; p = ((View) p).getParent()) if (p instanceof ListView) return true; return false; }
    static String name(Context c, View v) { try { return v.getId() == View.NO_ID ? v.getClass().getSimpleName() : c.getResources().getResourceEntryName(v.getId()); } catch (Exception e) { return "?"; } }

    List<String> check(Context c, Shot s, int wpx, int hpx, float fs) {
        List<String> bad = new ArrayList<>();
        float d = c.getResources().getDisplayMetrics().density;
        List<View> all = new ArrayList<>(); collect(s.root, all);
        List<View> taps = new ArrayList<>();
        for (View v : all) {
            if (v.getWidth() == 0 || v.getHeight() == 0) continue;
            Rect r = rectIn(v, s.root);
            if (!inList(v) && (r.right > wpx + 1 || r.bottom > hpx + 1 || r.left < -1 || r.top < -1)) bad.add("clipped " + name(c, v) + " " + r.toShortString());
            if (v instanceof TextView) {
                TextView t = (TextView) v;
                float sp = t.getTextSize() / (d * fs);
                if (t.getText().length() > 0 && sp < 11.9f) bad.add("small text " + name(c, v) + " " + sp + "sp");
                if (name(c, v).equals("w_act1") || name(c, v).startsWith("w_nav") || name(c, v).equals("w_act2") || name(c, v).equals("w_retry")) {
                    Layout l = t.getLayout();
                    if (l != null) for (int i = 0; i < l.getLineCount(); i++) if (l.getEllipsisCount(i) > 0) bad.add("cut label " + name(c, v) + " '" + t.getText() + "'");
                }
                if (name(c, v).equals("w_hero_title") && t.getLayout() != null && t.getLayout().getLineCount() > 0 && t.getHeight() - t.getTotalPaddingTop() - t.getTotalPaddingBottom() + d < t.getLayout().getLineBottom(Math.min(t.getLayout().getLineCount(), t.getMaxLines()) - 1))
                    bad.add("title cut mid-line");
            }
            if (v.hasOnClickListeners()) taps.add(v);
            if (v instanceof ListView) { ListView lv = (ListView) v; if (lv.getAdapter() == null || lv.getChildCount() == 0)
                bad.add("list empty (adapter " + (lv.getAdapter() == null ? "none" : lv.getAdapter().getClass().getSimpleName() + " " + lv.getAdapter().getCount()) + ", " + Math.round(lv.getHeight() / d) + "dp tall)"); }
        }
        for (View v : taps) {
            if (v.getHeight() < 48 * d - 1 || v.getWidth() < 48 * d - 1) bad.add("small tap target " + name(c, v) + " " + Math.round(v.getWidth() / d) + "x" + Math.round(v.getHeight() / d) + "dp");
        }
        for (int i = 0; i < taps.size(); i++) for (int j = i + 1; j < taps.size(); j++) {
            View a = taps.get(i), b = taps.get(j);
            if (isAncestor(a, b) || isAncestor(b, a)) continue;
            if (Rect.intersects(rectIn(a, s.root), rectIn(b, s.root))) bad.add("overlap " + name(c, a) + "/" + name(c, b));
        }
        return bad;
    }
    static boolean isAncestor(View a, View b) { for (Object p = b.getParent(); p instanceof View; p = ((View) p).getParent()) if (p == a) return true; return false; }

    Context fontCtx(float fs) {
        Configuration conf = new Configuration(ctx.getResources().getConfiguration());
        conf.fontScale = fs;
        return ctx.createConfigurationContext(conf);
    }

    @Test public void renderEverything() throws Exception {
        float d = ctx.getResources().getDisplayMetrics().density;
        for (Map.Entry<String, String[]> e : scenarios().entrySet()) {
            apply(e.getValue());
            WidgetModel m = ShopWidgetProvider.model(ctx);
            for (float fs : FONTS) {
                Context c = fontCtx(fs);
                for (float[] sz : SIZES) {
                    if (fs >= 2.0f && !(e.getKey().equals("kyle") || e.getKey().equals("crew_timer") || e.getKey().equals("long_text"))) continue;
                    WidgetModel.Bucket b = WidgetModel.bucket(sz[0], sz[1]);
                    RemoteViews rv = ShopWidgetProvider.build(c, 7, m, b, fs);
                    int wpx = Math.round(sz[0] * d), hpx = Math.round(sz[1] * d);
                    Shot s = render(c, rv, wpx, hpx);
                    List<String> bad = check(c, s, wpx, hpx, fs);
                    String file = e.getKey() + "_" + (int) sz[0] + "x" + (int) sz[1] + "_f" + Math.round(fs * 10) + ".png";
                    try (FileOutputStream o = new FileOutputStream(new File(out, file))) { s.bmp.compress(Bitmap.CompressFormat.PNG, 100, o); }
                    tsv.append(e.getKey()).append('\t').append((int) sz[0]).append('x').append((int) sz[1]).append('\t').append(fs).append('\t').append(b).append('\t')
                            .append(bad.isEmpty() ? "PASS" : "FAIL").append('\t').append(String.join("; ", bad)).append('\n');
                    if (!bad.isEmpty()) fails++;
                }
            }
        }
        ShopWidgetProvider.FORCE_RECORDING = null;
        tsv.append("# rendered through ").append(realHost ? "a real AppWidgetHost (bound widget id, updates via AppWidgetManager)" : "RemoteViews.apply (no bind permission)").append('\n');
        try (FileOutputStream o = new FileOutputStream(new File(out, "results.tsv"))) { o.write(tsv.toString().getBytes("UTF-8")); }
        assertTrue(fails + " layouts with problems - see results.tsv", fails == 0);
    }

    /* ------------------------------------------------------------ taps open the app with the right link */
    @Test public void tapsOpenTheRightThing() throws Exception {
        apply(scenarios().get("crew_next"));
        StringBuilder log = new StringBuilder("button\texpected\tgot\tresult\n");
        final List<Intent> seen = new ArrayList<>();
        ActivityLifecycleCallback cb = (activity, stage) -> { if (stage == Stage.PRE_ON_CREATE && activity instanceof MainActivity) synchronized (seen) { seen.add(new Intent(activity.getIntent())); } };
        ActivityLifecycleMonitorRegistry.getInstance().addLifecycleCallback(cb);
        int bad = 0;
        try {
            for (String[] t : new String[][]{
                    {"crew_next", "w_act1", "{\"task\":[\"j1\",\"a1\"],\"why\":\"start\"}"},
                    {"crew_next", "w_act2", "{\"draw\":\"j1\"}"},
                    {"crew_next", "w_nav0", "{\"v\":\"today\"}"},
                    {"crew_next", "w_nav3", "{\"v\":\"time\"}"},
                    {"crew_timer", "w_act1", "{\"task\":[\"j1\",\"a1\"],\"why\":\"stop\"}"},
                    {"kyle", "w_act1", "{\"count\":[\"j1\",\"s1\"]}"},
                    {"kyle", "w_brand", "{\"v\":\"home\"}"},
                    {"kyle", "w_rec", "{\"rec\":1}"},
                    {"kyle", "row0", "{\"job\":\"j1\"}"},
                    {"robin_dark", "w_act1", "{\"po\":\"o1\",\"count\":1}"},
                    {"robin_dark", "row1", "{\"inv\":\"hw\"}"},
                    {"setup", "w_act1", ""}}) {
                apply(scenarios().get(t[0]));
                WidgetModel m = ShopWidgetProvider.model(ctx);
                float d = ctx.getResources().getDisplayMetrics().density;
                RemoteViews rv = ShopWidgetProvider.build(ctx, 7, m, WidgetModel.bucket(330, 540), 1f);
                Shot s = render(ctx, rv, Math.round(330 * d), Math.round(540 * d));
                final View[] target = {null};
                InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                    if (t[1].startsWith("row")) { ListView lv = s.root.findViewById(R.id.w_list); int i = Integer.parseInt(t[1].substring(3)); if (lv != null && lv.getChildCount() > i) target[0] = lv.getChildAt(i); }
                    else target[0] = s.root.findViewById(ctx.getResources().getIdentifier(t[1], "id", ctx.getPackageName()));
                });
                String got = "(no view)";
                finishAll();
                if (target[0] != null) {
                    synchronized (seen) { seen.clear(); }
                    InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                        // a finger on a list row reaches the list's item click (that's where the row's fill-in link is read)
                        if (target[0].getParent() instanceof ListView) { ListView lv = (ListView) target[0].getParent(); int pos = lv.getPositionForView(target[0]);
                            lv.performItemClick(target[0], pos, lv.getItemIdAtPosition(pos)); }
                        else target[0].performClick(); });
                    long until = System.currentTimeMillis() + 15000;
                    Intent in = null;
                    while (System.currentTimeMillis() < until) { synchronized (seen) { if (!seen.isEmpty()) { in = seen.get(0); break; } } Thread.sleep(200); }
                    got = in == null ? "(app didn't open)" : String.valueOf(in.getStringExtra(ShopWidgetProvider.EXTRA_LINK));
                    finishAll();
                }
                boolean ok = t[2].isEmpty() ? "null".equals(got) : t[2].equals(got);
                if (!ok) bad++;
                log.append(t[0]).append(':').append(t[1]).append('\t').append(t[2]).append('\t').append(got).append('\t').append(ok ? "PASS" : "FAIL").append('\n');
            }
        } finally {
            ActivityLifecycleMonitorRegistry.getInstance().removeLifecycleCallback(cb);
            try (FileOutputStream o = new FileOutputStream(new File(out, "taps.tsv"))) { o.write(log.toString().getBytes("UTF-8")); }
        }
        assertTrue(bad + " taps opened the wrong thing - see taps.tsv", bad == 0);
    }
    void finishAll() throws InterruptedException {
        InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
            for (Stage st : new Stage[]{Stage.RESUMED, Stage.STARTED, Stage.PAUSED, Stage.CREATED, Stage.STOPPED})
                for (Activity a : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(st)) a.finish();
        });
        Thread.sleep(1500);
    }
}
