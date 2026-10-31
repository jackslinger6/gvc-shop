package com.gordeyville.shop;

import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.view.View;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;
import org.json.JSONArray;

/** Supplies the scrolling rows for the widget list. */
public class ShopWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) {
        return new Factory(getApplicationContext());
    }

    static class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private List<Feed.Row> rows = new ArrayList<>();

        Factory(Context ctx) { this.ctx = ctx; }

        @Override public void onCreate() {}

        @Override
        public void onDataSetChanged() {
            SharedPreferences p = ctx.getSharedPreferences(Feed.PREFS, 0);
            String tab = p.getString(Feed.PREF_TAB, "orders");
            String[] err = {""};
            String before = p.getString("counts", "0,0,0") + "|" + p.getLong(Feed.PREF_FETCHED, 0) + "|" + p.getString("last_error", "");
            JSONArray jobs = Feed.load(ctx, 60_000, err);
            Feed.Result r = Feed.build(jobs, tab);
            rows = r.rows;
            if (rows.isEmpty()) {
                Feed.Row e = new Feed.Row();
                e.header = true;
                e.title = err[0].isEmpty() ? "Nothing here right now" : err[0];
                rows.add(e);
            }
            String counts = r.counts[0] + "," + r.counts[1] + "," + r.counts[2];
            p.edit().putString("counts", counts).putString("last_error", err[0] == null ? "" : err[0]).apply();
            String after = counts + "|" + p.getLong(Feed.PREF_FETCHED, 0) + "|" + (err[0] == null ? "" : err[0]);
            // redraw the header (tab counts, updated time) only if something changed
            if (!after.equals(before)) {
                android.appwidget.AppWidgetManager mgr = android.appwidget.AppWidgetManager.getInstance(ctx);
                int[] ids = mgr.getAppWidgetIds(new android.content.ComponentName(ctx, ShopWidgetProvider.class));
                for (int id : ids) mgr.partiallyUpdateAppWidget(id, ShopWidgetProvider.buildViews(ctx, id));
            }
        }

        @Override public void onDestroy() { rows.clear(); }
        @Override public int getCount() { return rows.size(); }

        @Override
        public RemoteViews getViewAt(int pos) {
            if (pos < 0 || pos >= rows.size()) return null;
            Feed.Row r = rows.get(pos);
            if (r.header) {
                RemoteViews h = new RemoteViews(ctx.getPackageName(), R.layout.widget_header);
                h.setTextViewText(R.id.h_title, r.title);
                return h;
            }
            RemoteViews v = new RemoteViews(ctx.getPackageName(), R.layout.widget_row);
            v.setTextViewText(R.id.r_title, r.title);
            v.setTextColor(R.id.r_dot, r.dot);
            if (r.sub == null || r.sub.isEmpty()) v.setViewVisibility(R.id.r_sub, View.GONE);
            else { v.setViewVisibility(R.id.r_sub, View.VISIBLE); v.setTextViewText(R.id.r_sub, r.sub); }
            if (r.badge == null || r.badge.isEmpty()) v.setViewVisibility(R.id.r_badge, View.GONE);
            else { v.setViewVisibility(R.id.r_badge, View.VISIBLE); v.setTextViewText(R.id.r_badge, r.badge); v.setTextColor(R.id.r_badge, r.badgeColor); }
            Intent fill = new Intent();
            fill.putExtra(Feed.EXTRA_TAB, r.tab);
            fill.putExtra(Feed.EXTRA_JOB, r.job);
            v.setOnClickFillInIntent(R.id.r_root, fill);
            return v;
        }

        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 2; }
        @Override public long getItemId(int pos) { return pos; }
        @Override public boolean hasStableIds() { return false; }
    }
}
