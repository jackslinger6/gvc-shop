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
import android.widget.RemoteViews;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/** Full-page home-screen widget: header, three tabs and a scrolling list. */
public class ShopWidgetProvider extends AppWidgetProvider {
    public static final String ACTION_TAB = "com.gordeyville.shop.WIDGET_TAB";
    public static final String ACTION_REFRESH = "com.gordeyville.shop.WIDGET_REFRESH";
    static final int[] TAB_IDS = {R.id.tab_pipeline, R.id.tab_orders, R.id.tab_shop};
    static final String[] TAB_LABELS = {"Pipeline", "Orders", "Shop floor"};

    @Override
    public void onUpdate(Context ctx, AppWidgetManager mgr, int[] ids) {
        for (int id : ids) mgr.updateAppWidget(id, buildViews(ctx, id));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.list);
    }

    @Override
    public void onReceive(Context ctx, Intent intent) {
        super.onReceive(ctx, intent);
        String a = intent.getAction();
        if (ACTION_TAB.equals(a)) {
            String tab = intent.getStringExtra(Feed.EXTRA_TAB);
            if (tab != null) ctx.getSharedPreferences(Feed.PREFS, 0).edit().putString(Feed.PREF_TAB, tab).apply();
            refreshAll(ctx, false);
        } else if (ACTION_REFRESH.equals(a)) {
            refreshAll(ctx, true);
        }
    }

    /** Redraws every widget; force=true fetches fresh data instead of using the cache. */
    public static void refreshAll(Context ctx, boolean force) {
        if (force) ctx.getSharedPreferences(Feed.PREFS, 0).edit().putLong(Feed.PREF_FETCHED, 0).apply();
        AppWidgetManager mgr = AppWidgetManager.getInstance(ctx);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(ctx, ShopWidgetProvider.class));
        if (ids == null || ids.length == 0) return;
        for (int id : ids) mgr.updateAppWidget(id, buildViews(ctx, id));
        mgr.notifyAppWidgetViewDataChanged(ids, R.id.list);
    }

    static int flags(boolean mutable) {
        int f = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= 31) f |= mutable ? PendingIntent.FLAG_MUTABLE : PendingIntent.FLAG_IMMUTABLE;
        else if (Build.VERSION.SDK_INT >= 23 && !mutable) f |= PendingIntent.FLAG_IMMUTABLE;
        return f;
    }

    static RemoteViews buildViews(Context ctx, int widgetId) {
        SharedPreferences p = ctx.getSharedPreferences(Feed.PREFS, 0);
        String tab = p.getString(Feed.PREF_TAB, "orders");
        RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_shop);

        // list adapter (the data uri makes each widget get its own factory)
        Intent svc = new Intent(ctx, ShopWidgetService.class);
        svc.putExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, widgetId);
        svc.setData(Uri.parse("gvc://widget/" + widgetId));
        v.setRemoteAdapter(R.id.list, svc);
        v.setEmptyView(R.id.list, R.id.empty);

        // tapping a row opens the app at that job
        Intent open = new Intent(ctx, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        v.setPendingIntentTemplate(R.id.list, PendingIntent.getActivity(ctx, 100 + widgetId, open, flags(true)));

        // header buttons
        Intent openApp = new Intent(ctx, MainActivity.class);
        openApp.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        openApp.putExtra(Feed.EXTRA_TAB, tab.equals("shop") ? "build" : tab.equals("orders") ? "ordering" : "pipeline");
        v.setOnClickPendingIntent(R.id.open, PendingIntent.getActivity(ctx, 200 + widgetId, openApp, flags(false)));
        v.setOnClickPendingIntent(R.id.title, PendingIntent.getActivity(ctx, 300 + widgetId, openApp, flags(false)));
        Intent ref = new Intent(ctx, ShopWidgetProvider.class).setAction(ACTION_REFRESH);
        v.setOnClickPendingIntent(R.id.refresh, PendingIntent.getBroadcast(ctx, 400 + widgetId, ref, flags(false)));

        // tabs
        long fetched = p.getLong("shown_counts_at", 0);
        String counts = p.getString("counts", "0,0,0");
        String[] c = counts.split(",");
        for (int i = 0; i < 3; i++) {
            Intent t = new Intent(ctx, ShopWidgetProvider.class).setAction(ACTION_TAB).putExtra(Feed.EXTRA_TAB, Feed.TABS[i]);
            v.setOnClickPendingIntent(TAB_IDS[i], PendingIntent.getBroadcast(ctx, 500 + i * 50 + widgetId, t, flags(false)));
            int n = 0;
            try { n = Integer.parseInt(c[i].trim()); } catch (Exception ignored) {}
            v.setTextViewText(TAB_IDS[i], TAB_LABELS[i] + (n > 0 ? "  " + n : ""));
            boolean on = Feed.TABS[i].equals(tab);
            v.setInt(TAB_IDS[i], "setBackgroundResource", on ? R.drawable.widget_tab_on : R.drawable.widget_tab_off);
            v.setTextColor(TAB_IDS[i], on ? 0xFFFFFFFF : (n > 0 ? Feed.C_RED : Feed.C_MUTED));
        }
        long at = p.getLong(Feed.PREF_FETCHED, 0);
        String err = p.getString("last_error", "");
        String upd = at > 0 ? "Updated " + new SimpleDateFormat("h:mm a", Locale.CANADA).format(new Date(at)) : "";
        v.setTextViewText(R.id.updated, err.isEmpty() ? upd : err);
        return v;
    }
}
