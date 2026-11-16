package com.gordeyville.shop;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.SizeF;
import android.view.View;
import android.widget.RemoteViews;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/**
 * Home-screen widget (redesign Nov 15 2026 - preview): a quick companion to the app for the person signed in on this
 * phone. Small = the one thing to do now + one button; medium = that + a line with the next item; large = that +
 * the list + the role's destinations. The layout follows the widget's real size (Android 12+: a size map, so the
 * launcher picks it as you resize; older: the size Android reports in onAppWidgetOptionsChanged).
 * What's shown comes from WidgetModel (the app's own snapshot for this phone). Taps open the app at the exact item;
 * nothing on the widget starts or stops a timer, finishes a task or starts recording by itself.
 */
public class ShopWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_REFRESH = "com.gordeyville.shop.WIDGET_REFRESH";
    static final String P_SNAP = "w2_snap", P_REFRESH_AT = "w2_refresh_at", P_ERR = "w2_err", P_OK_AT = "w2_ok_at";
    static final String EXTRA_LINK = "gvc_link";
    /** set by the instrumented tests: never touch the network */
    public static volatile boolean NO_NETWORK = false;
    /** set by the instrumented tests to draw the "recording" state without the microphone */
    public static volatile Boolean FORCE_RECORDING = null;
    private static final ExecutorService IO = Executors.newSingleThreadExecutor();

    /* ------------------------------------------------------------ lifecycle */
    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, buildViews(ctx, id));
        // the scheduled update also checks the server, unless that happened in the last 15 minutes
        SharedPreferences p = prefs(ctx);
        if (!p.getString(Feed.PREF_KEY, "").isEmpty() && System.currentTimeMillis() - p.getLong(P_OK_AT, 0) > 15 * 60_000L)
            startRefresh(ctx, goAsync());
    }

    @Override
    public void onAppWidgetOptionsChanged(Context ctx, AppWidgetManager mgr, int id, Bundle opts) {
        mgr.updateAppWidget(id, buildViews(ctx, id));    // resized: redraw for the new size (only the drawing - no taps, no actions)
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_REFRESH.equals(a)) startRefresh(ctx, goAsync());
        else if (Intent.ACTION_MY_PACKAGE_REPLACED.equals(a)) refreshAll(ctx, false);
    }

    static SharedPreferences prefs(Context ctx) { return ctx.getSharedPreferences(Feed.PREFS, 0); }

    /** Redraws every widget; force = also check the server now. */
    public static void refreshAll(Context ctx, boolean force) {
        if (force) { startRefresh(ctx, null); return; }
        redraw(ctx);
    }
    static void redraw(Context ctx) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ShopWidgetProvider.class));
        if (ids == null) return;
        for (int id : ids) mgr.updateAppWidget(id, buildViews(ctx, id));
        if (Build.VERSION.SDK_INT < 31) mgr.notifyAppWidgetViewDataChanged(ids, R.id.w_list);
    }

    /** "Updating…" straight away (what's shown stays), then the server check in the background. */
    static void startRefresh(Context ctx, PendingResult pr) {
        Context app = ctx.getApplicationContext();
        SharedPreferences p = prefs(app);
        if (p.getString(Feed.PREF_KEY, "").isEmpty() || NO_NETWORK) { redraw(app); if (pr != null) pr.finish(); return; }
        p.edit().putLong(P_REFRESH_AT, System.currentTimeMillis()).apply();
        redraw(app);
        IO.execute(() -> {
            try { WidgetSync.fetch(app); }
            finally {
                prefs(app).edit().putLong(P_REFRESH_AT, 0).apply();
                redraw(app);
                if (pr != null) pr.finish();
            }
        });
    }

    /* ------------------------------------------------------------ the model */
    static WidgetModel model(Context ctx) {
        SharedPreferences p = prefs(ctx);
        WidgetModel.Input in = new WidgetModel.Input();
        in.snapshot = p.getString(P_SNAP, null);
        in.hasKey = !p.getString(Feed.PREF_KEY, "").isEmpty();
        long r = p.getLong(P_REFRESH_AT, 0);
        in.refreshing = r > 0 && System.currentTimeMillis() - r < 30_000L;    // a stuck "Updating…" clears itself
        in.errKind = p.getString(P_ERR, "");
        in.lastOkAt = p.getLong(P_OK_AT, 0);
        in.recording = FORCE_RECORDING != null ? FORCE_RECORDING : RecorderService.isRecording();
        try {   // Kyle's shared list from the server feed (only used for the admin role, see WidgetModel)
            String cache = p.getString(Feed.PREF_CACHE, null);
            if (cache != null) { JSONObject f = new JSONObject(cache); JSONObject t = f.optJSONObject("app_todo");
                if (t != null && t.optJSONObject("data") != null) { in.serverTodo = t.optJSONObject("data").toString(); in.serverTodoAt = Feed.ts(t.optString("at")); } }
        } catch (Exception ignored) {}
        return WidgetModel.from(in);
    }

    /* ------------------------------------------------------------ colours for the app's appearance */
    static final class Pal {
        int bg, card, btn1, btn2, tagBg, text, muted, onAccent, amber, red, green, recIcon, icon; boolean light;
    }
    static Pal pal(String theme) {
        Pal p = new Pal();
        if ("light".equals(theme)) {
            p.bg = R.drawable.w2_bg_light; p.card = R.drawable.w2_card_light; p.btn1 = R.drawable.w2_btn1_light; p.btn2 = R.drawable.w2_btn2_light; p.tagBg = R.drawable.w2_tag_light;
            p.text = 0xFF1D232A; p.muted = 0xFF56616C; p.onAccent = 0xFF1B0F05; p.amber = 0xFF8A5300; p.red = 0xFFB3261E; p.green = 0xFF1E7A3E; p.recIcon = 0xFFC62A1F; p.icon = 0xFF3F4A54; p.light = true;
        } else if ("girly".equals(theme)) {
            p.bg = R.drawable.w2_bg_girly; p.card = R.drawable.w2_card_girly; p.btn1 = R.drawable.w2_btn1_girly; p.btn2 = R.drawable.w2_btn2_girly; p.tagBg = R.drawable.w2_tag_girly;
            p.text = 0xFF3B2342; p.muted = 0xFF6E5375; p.onAccent = 0xFF3B2342; p.amber = 0xFF7A5C08; p.red = 0xFFA8362D; p.green = 0xFF23805A; p.recIcon = 0xFFB8443A; p.icon = 0xFF6E5375; p.light = true;
        } else {
            p.bg = R.drawable.w2_bg_dark; p.card = R.drawable.w2_card_dark; p.btn1 = R.drawable.w2_btn1_dark; p.btn2 = R.drawable.w2_btn2_dark; p.tagBg = R.drawable.w2_tag_dark;
            p.text = 0xFFECEBE8; p.muted = 0xFFA9AFB7; p.onAccent = 0xFF1B0F05; p.amber = 0xFFF5B041; p.red = 0xFFFF8A80; p.green = 0xFF7FE3A1; p.recIcon = 0xFFFF6B5E; p.icon = 0xFFC9CED4;
        }
        return p;
    }
    /** status colours from the app are bright for a dark page; on light pages use a darker shade of the same colour */
    static int tagColor(Pal p, int c) {
        if (!p.light) return c;
        int r = (c >> 16) & 255, g = (c >> 8) & 255, b = c & 255;
        return 0xFF000000 | ((int) (r * 0.55) << 16) | ((int) (g * 0.55) << 8) | (int) (b * 0.55);
    }

    /* ------------------------------------------------------------ taps */
    static PendingIntent open(Context ctx, int widgetId, int slot, String link) {
        Intent i = new Intent(ctx, MainActivity.class);
        i.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        i.setData(Uri.parse("gvcw://w/" + widgetId + "/" + slot));      // keeps each button's intent separate
        i.putExtra(Feed.EXTRA_TAB, "");
        if (link != null && !link.isEmpty()) i.putExtra(EXTRA_LINK, link);
        return PendingIntent.getActivity(ctx, widgetId * 100 + slot, i, flags(false));
    }
    static PendingIntent refresh(Context ctx, int widgetId) {
        Intent i = new Intent(ctx, ShopWidgetProvider.class).setAction(ACTION_REFRESH);
        i.setData(Uri.parse("gvcw://refresh/" + widgetId));
        return PendingIntent.getBroadcast(ctx, widgetId * 100 + 99, i, flags(false));
    }
    static int flags(boolean mutable) {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) f |= mutable ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE;
        else if (Build.VERSION.SDK_INT >= 23 && !mutable) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }
    static final String LINK_REC = "{\"rec\":1}";

    /* ------------------------------------------------------------ building the views */
    public static RemoteViews buildViews(Context ctx, int widgetId) {
        WidgetModel m = model(ctx);
        float fs = ctx.getResources().getConfiguration().fontScale;
        if (Build.VERSION.SDK_INT >= 31) {
            Map<SizeF, RemoteViews> map = new HashMap<>();
            for (float[] s : WidgetModel.SIZES) map.put(new SizeF(s[0], s[1]), build(ctx, widgetId, m, WidgetModel.bucket(s[0], s[1]), fs));
            return new RemoteViews(map);
        }
        Bundle o = AppWidgetManager.getInstance(ctx).getAppWidgetOptions(widgetId);
        // portrait: min width x max height is what's on screen
        float w = o == null ? 250 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        float h = o == null ? 230 : o.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 230);
        if (w <= 0) w = 250; if (h <= 0) h = 230;
        return build(ctx, widgetId, m, WidgetModel.bucket(w, h), fs);
    }

    /** what fits at this size and text size (estimated from the text sizes; tests check the real layout) */
    static final class Fit { boolean tag = true, sub = true, more = true, list = true, nav = true; int titleLines = 2; }
    static float line(float sp, float fs) { return sp * fs * 1.2f; }
    static Fit fit(WidgetModel.Bucket b, float fs) {
        Fit f = new Fit();
        float btn = Math.max(48, line(15, fs) + 10);
        if (b.mode == WidgetModel.Mode.COMPACT || b.mode == WidgetModel.Mode.COMPACT_WIDE) {
            f.list = false; f.nav = false; f.more = false;
            float avail = b.h - 18 - (b.mode == WidgetModel.Mode.COMPACT ? btn + 6 : 0);
            float need = line(12, fs) + 6 + 2 * line(15, fs) + 4 + line(12, fs);
            if (need > avail) { f.sub = false; need -= line(12, fs); }
            if (need > avail) { f.titleLines = 1; need -= line(15, fs); }
            if (need > avail) { f.tag = false; }
            return f;
        }
        float header = Math.max(48, line(15, fs) + line(12, fs) + 4);
        float hero = 22 + line(12, fs) + 8 + 6 + 2 * line(17, fs) + 2 + line(13, fs) + 10 + btn;
        float more = 6 + Math.max(48, line(14, fs) + 12);
        float listMin = 14 + line(13, fs) + Math.max(52, line(12, fs) + 2 * line(14, fs) + line(12, fs) + 16);
        float nav = 8 + Math.max(48, line(13, fs) + 10);
        float avail = b.h - 20 - header - 8;
        if (b.mode == WidgetModel.Mode.LARGE) {
            f.more = false;
            if (hero + listMin + (b.navCount > 0 ? nav : 0) > avail) f.nav = false;
            if (hero + listMin > avail) { f.list = false; f.more = true; }
        } else { f.list = false; f.nav = false; }
        if (f.nav && b.navCount == 0) f.nav = false;
        float need = hero + (f.more ? more : 0) + (f.list ? listMin : 0) + (f.nav ? nav : 0);
        if (need > avail && f.more) { f.more = false; need -= more; }
        if (need > avail) { f.titleLines = 1; need -= line(17, fs); }
        if (need > avail) { f.sub = false; need -= line(13, fs) + 2; }
        if (need > avail) { f.tag = false; }
        return f;
    }

    static RemoteViews build(Context ctx, int wid, WidgetModel m, WidgetModel.Bucket b, float fs) {
        Pal p = pal(m.state == WidgetModel.State.READY ? m.theme : "dark");
        Fit f = fit(b, fs);
        boolean main = b.mode == WidgetModel.Mode.MEDIUM || b.mode == WidgetModel.Mode.LARGE;
        int layout = b.mode == WidgetModel.Mode.COMPACT ? R.layout.w2_compact : b.mode == WidgetModel.Mode.COMPACT_WIDE ? R.layout.w2_compact_wide : R.layout.w2_main;
        RemoteViews v = new RemoteViews(ctx.getPackageName(), layout);
        v.setInt(R.id.w_root, "setBackgroundResource", p.bg);
        long now = System.currentTimeMillis();

        // ---- header: brand + sync status, Retry, Record, Refresh
        String[] st = m.state == WidgetModel.State.READY ? m.statusLine(now) : new String[]{"", "muted"};
        int stc = "red".equals(st[1]) ? p.red : "amber".equals(st[1]) ? p.amber : p.muted;
        v.setTextViewText(R.id.w_status, st[0]);
        v.setTextColor(R.id.w_status, stc);
        v.setViewVisibility(R.id.w_status, st[0].isEmpty() ? View.GONE : View.VISIBLE);
        if (main) {
            v.setTextColor(R.id.w_brand_t, p.text);
            v.setOnClickPendingIntent(R.id.w_brand, open(ctx, wid, 1, home(m)));
            v.setContentDescription(R.id.w_brand, "Open GVC Vault" + (st[0].isEmpty() ? "" : ". " + st[0]));
            boolean retry = m.state == WidgetModel.State.READY && m.needsRetry() && b.w >= 250;
            v.setViewVisibility(R.id.w_retry, retry ? View.VISIBLE : View.GONE);
            if (retry) { v.setInt(R.id.w_retry, "setBackgroundResource", p.btn2); v.setTextColor(R.id.w_retry, p.text); v.setOnClickPendingIntent(R.id.w_retry, refresh(ctx, wid)); v.setContentDescription(R.id.w_retry, "Retry updating the widget"); }
        }   // small widget: no Retry button (no room for a full-size one) - it retries on its next update or when the app opens
        boolean hdrActs = main || b.headerActions;
        if (b.mode == WidgetModel.Mode.COMPACT_WIDE) v.setViewVisibility(R.id.w_hdr_acts, hdrActs ? View.VISIBLE : View.GONE);
        if (hdrActs) {
            boolean ready = m.state == WidgetModel.State.READY;
            v.setViewVisibility(R.id.w_rec, ready ? View.VISIBLE : View.GONE);
            if (ready) {
                v.setOnClickPendingIntent(R.id.w_rec, open(ctx, wid, 2, LINK_REC));
                if (m.recording) {
                    v.setInt(R.id.w_rec, "setBackgroundResource", R.drawable.w2_rec_on);
                    v.setImageViewResource(R.id.w_rec_i, R.drawable.ic_w2_stop); v.setInt(R.id.w_rec_i, "setColorFilter", 0xFFFFFFFF);
                    v.setViewVisibility(R.id.w_rec_t, View.VISIBLE); v.setTextViewText(R.id.w_rec_t, "Stop recording"); v.setTextColor(R.id.w_rec_t, 0xFFFFFFFF);
                    v.setContentDescription(R.id.w_rec, "Stop recording. Opens the app to stop and save it.");
                } else {
                    v.setInt(R.id.w_rec, "setBackgroundResource", p.btn2);
                    v.setImageViewResource(R.id.w_rec_i, R.drawable.ic_w2_mic); v.setInt(R.id.w_rec_i, "setColorFilter", p.recIcon);
                    boolean label = main && b.w >= 300;
                    v.setViewVisibility(R.id.w_rec_t, label ? View.VISIBLE : View.GONE);
                    v.setTextViewText(R.id.w_rec_t, "Record"); v.setTextColor(R.id.w_rec_t, p.text);
                    v.setContentDescription(R.id.w_rec, "Record a voice note. Opens the app to start recording.");
                }
            }
            v.setInt(R.id.w_refresh, "setBackgroundResource", p.btn2);
            v.setInt(R.id.w_refresh_i, "setColorFilter", p.icon);
            v.setOnClickPendingIntent(R.id.w_refresh, refresh(ctx, wid));
            v.setContentDescription(R.id.w_refresh, m.sync == WidgetModel.Sync.UPDATING ? "Updating" : "Refresh the widget");
            v.setViewVisibility(R.id.w_refresh, m.state == WidgetModel.State.NO_USER ? View.GONE : View.VISIBLE);
        }

        // ---- the one thing to do now
        String tag, title, sub, count = "", act1, link1, act2 = "", link2 = ""; int col;
        if (m.state == WidgetModel.State.NO_USER) {
            tag = "Not signed in"; title = "Sign in to GVC Vault"; sub = "Your next job shows here after you sign in."; act1 = "Open GVC Vault"; link1 = ""; col = p.muted;
        } else if (m.state == WidgetModel.State.SETUP) {
            tag = "Set up"; title = "Open GVC Vault once to finish setting up"; sub = "Then this shows your own next job."; act1 = "Open GVC Vault"; link1 = ""; col = 0xFFFF8A2A;
        } else if (m.timer != null) {
            tag = "On the clock"; title = m.timer.title; sub = m.timer.sub; col = 0xFF3AD06B;
            count = "Since " + WidgetModel.clock(m.timerSince, now);
            act1 = "Stop timer"; link1 = m.timer.link;
            if (!m.timerDraw.isEmpty()) { act2 = "Drawings"; link2 = m.timerDraw; }
        } else if (m.hero != null) {
            tag = m.hero.tag; title = m.hero.title; sub = m.hero.sub; col = m.hero.color;
            int more = Math.max(0, m.total - 1);
            count = more > 0 && !(main && f.list) ? "+" + more + " more" : "";
            act1 = m.hero.act; link1 = m.hero.link; act2 = m.hero.act2; link2 = m.hero.link2;
        } else {
            tag = "All clear"; title = m.emptyTitle; sub = m.emptySub; col = 0xFF3AD06B; act1 = "Open GVC Vault"; link1 = home(m);
        }
        if (m.recording && !hdrActs) { act1 = "Stop recording"; link1 = LINK_REC; }
        if (m.state == WidgetModel.State.READY && m.sync == WidgetModel.Sync.AUTH && (m.hero == null && m.timer == null)) { act1 = "Open GVC Vault to sign in"; link1 = ""; }
        int tc = tagColor(p, col);
        v.setTextViewText(R.id.w_hero_tag, tag); v.setTextColor(R.id.w_hero_tag, tc); v.setInt(R.id.w_hero_tag, "setBackgroundResource", p.tagBg);
        v.setViewVisibility(R.id.w_hero_tag, f.tag ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_hero_title, title); v.setTextColor(R.id.w_hero_title, p.text); v.setInt(R.id.w_hero_title, "setMaxLines", f.titleLines);
        v.setTextViewText(R.id.w_hero_sub, sub == null ? "" : sub); v.setTextColor(R.id.w_hero_sub, p.muted);
        v.setViewVisibility(R.id.w_hero_sub, f.sub && sub != null && !sub.isEmpty() ? View.VISIBLE : View.GONE);
        v.setTextViewText(R.id.w_act1, act1);
        boolean recBtn = LINK_REC.equals(link1);
        v.setInt(R.id.w_act1, "setBackgroundResource", recBtn ? R.drawable.w2_rec_on : p.btn1);
        v.setTextColor(R.id.w_act1, recBtn ? 0xFFFFFFFF : p.onAccent);
        v.setOnClickPendingIntent(R.id.w_act1, open(ctx, wid, 3, link1));
        v.setContentDescription(R.id.w_act1, act1 + (title.isEmpty() ? "" : ": " + title));
        v.setOnClickPendingIntent(R.id.w_hero, open(ctx, wid, 4, m.timer != null ? m.timer.link : link1));
        v.setContentDescription(R.id.w_hero, (tag.isEmpty() ? "" : tag + ". ") + title + (sub == null || sub.isEmpty() ? "" : ". " + sub));
        if (main) {
            v.setInt(R.id.w_hero, "setBackgroundResource", p.card);
            v.setInt(R.id.w_hero_bar, "setBackgroundColor", col);
            v.setTextViewText(R.id.w_hero_count, count); v.setTextColor(R.id.w_hero_count, p.muted);
            boolean two = act2 != null && !act2.isEmpty() && !recBtn;
            v.setViewVisibility(R.id.w_act2, two ? View.VISIBLE : View.GONE);
            if (two) { v.setTextViewText(R.id.w_act2, act2); v.setTextColor(R.id.w_act2, p.text); v.setInt(R.id.w_act2, "setBackgroundResource", p.btn2);
                v.setOnClickPendingIntent(R.id.w_act2, open(ctx, wid, 5, link2)); v.setContentDescription(R.id.w_act2, act2 + ": " + title); }
        } else if (b.mode == WidgetModel.Mode.COMPACT && f.tag) {
            // small widget: the time-on-the-clock or "+N more" goes on the status line if there's no sync message
            if (st[0].isEmpty() && !count.isEmpty()) { v.setTextViewText(R.id.w_status, count); v.setViewVisibility(R.id.w_status, View.VISIBLE); }
        }
        if (!main) return v;

        // ---- the rest
        boolean ready = m.state == WidgetModel.State.READY;
        List<WidgetModel.Card> items = m.items;
        v.setTextColor(R.id.w_list_h, p.muted); v.setTextColor(R.id.w_none, p.muted);
        boolean showMore = ready && f.more && !items.isEmpty();
        v.setViewVisibility(R.id.w_more, showMore ? View.VISIBLE : View.GONE);
        if (showMore) {
            WidgetModel.Card n = items.get(0);
            v.setTextViewText(R.id.w_more, "Then: " + n.title);
            v.setTextColor(R.id.w_more, p.text); v.setInt(R.id.w_more, "setBackgroundResource", p.card);
            v.setOnClickPendingIntent(R.id.w_more, open(ctx, wid, 6, n.link));
            v.setContentDescription(R.id.w_more, "Then: " + n.title + (items.size() > 1 ? ". " + (items.size() - 1) + " more in the app" : ""));
        }
        boolean list = ready && f.list && !items.isEmpty();
        v.setViewVisibility(R.id.w_list_h, list ? View.VISIBLE : View.GONE);
        v.setViewVisibility(R.id.w_list, list ? View.VISIBLE : View.GONE);
        boolean none = f.list && !list;
        v.setViewVisibility(R.id.w_none, none ? View.VISIBLE : View.GONE);
        if (none) v.setTextViewText(R.id.w_none, ready && (m.hero != null || m.timer != null) ? "Nothing else waiting." : "");
        if (list) {
            v.setTextViewText(R.id.w_list_h, (m.timer != null ? "Next up" : "Then") + " · " + items.size());
            Intent tmpl = new Intent(ctx, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP).putExtra(Feed.EXTRA_TAB, "");
            tmpl.setData(Uri.parse("gvcw://w/" + wid + "/list"));
            v.setPendingIntentTemplate(R.id.w_list, PendingIntent.getActivity(ctx, wid * 100 + 50, tmpl, flags(true)));
            if (Build.VERSION.SDK_INT >= 31) {
                RemoteViews.RemoteCollectionItems.Builder cb = new RemoteViews.RemoteCollectionItems.Builder().setHasStableIds(true).setViewTypeCount(1);
                for (int i = 0; i < items.size(); i++) cb.addItem(i + 1, row(ctx, items.get(i), p));
                v.setRemoteAdapter(R.id.w_list, cb.build());
            } else {
                Intent svc = new Intent(ctx, ShopWidgetService.class);
                svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, wid);
                svc.setData(Uri.parse("gvcw://svc/" + wid));
                v.setRemoteAdapter(R.id.w_list, svc);
            }
        }
        // ---- destinations
        List<WidgetModel.Nav> nav = ready && f.nav ? m.navFor(b.navCount) : new java.util.ArrayList<>();
        v.setViewVisibility(R.id.w_nav, nav.isEmpty() ? View.GONE : View.VISIBLE);
        int[] ids = {R.id.w_nav0, R.id.w_nav1, R.id.w_nav2, R.id.w_nav3};
        for (int i = 0; i < ids.length; i++) {
            if (i >= nav.size()) { v.setViewVisibility(ids[i], View.GONE); continue; }
            v.setViewVisibility(ids[i], View.VISIBLE);
            v.setTextViewText(ids[i], nav.get(i).label); v.setTextColor(ids[i], p.text); v.setInt(ids[i], "setBackgroundResource", p.btn2);
            v.setOnClickPendingIntent(ids[i], open(ctx, wid, 10 + i, nav.get(i).link));
            v.setContentDescription(ids[i], "Open " + nav.get(i).label);
        }
        return v;
    }

    static String home(WidgetModel m) { return m.nav.isEmpty() ? "" : m.nav.get(0).link; }

    /** one row of the list (also used by ShopWidgetService on Android 11 and older) */
    static RemoteViews row(Context ctx, WidgetModel.Card c, Pal p) {
        RemoteViews r = new RemoteViews(ctx.getPackageName(), R.layout.w2_row);
        r.setInt(R.id.r2_root, "setBackgroundResource", p.card);
        r.setInt(R.id.r2_bar, "setBackgroundColor", c.color);
        r.setTextViewText(R.id.r2_tag, c.tag); r.setTextColor(R.id.r2_tag, tagColor(p, c.color));
        r.setViewVisibility(R.id.r2_tag, c.tag.isEmpty() ? View.GONE : View.VISIBLE);
        r.setTextViewText(R.id.r2_title, c.title); r.setTextColor(R.id.r2_title, p.text);
        r.setTextViewText(R.id.r2_sub, c.sub); r.setTextColor(R.id.r2_sub, p.muted);
        r.setViewVisibility(R.id.r2_sub, c.sub.isEmpty() ? View.GONE : View.VISIBLE);
        Intent fill = new Intent(); fill.putExtra(EXTRA_LINK, c.link);
        r.setOnClickFillInIntent(R.id.r2_root, fill);
        r.setContentDescription(R.id.r2_root, (c.tag.isEmpty() ? "" : c.tag + ". ") + c.title + (c.sub.isEmpty() ? "" : ". " + c.sub));
        return r;
    }
}
