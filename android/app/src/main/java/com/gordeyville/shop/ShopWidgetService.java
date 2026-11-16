package com.gordeyville.shop;

import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import android.widget.RemoteViewsService;
import java.util.ArrayList;
import java.util.List;

/** The widget's list on Android 11 and older (Android 12+ gets its rows straight from ShopWidgetProvider). */
public class ShopWidgetService extends RemoteViewsService {
    @Override
    public RemoteViewsFactory onGetViewFactory(Intent intent) { return new Factory(getApplicationContext()); }

    static class Factory implements RemoteViewsFactory {
        private final Context ctx;
        private List<WidgetModel.Card> rows = new ArrayList<>();
        private ShopWidgetProvider.Pal pal = ShopWidgetProvider.pal("dark");
        Factory(Context ctx) { this.ctx = ctx; }
        @Override public void onCreate() {}
        @Override public void onDataSetChanged() {
            WidgetModel m = ShopWidgetProvider.model(ctx);
            rows = new ArrayList<>(m.items);
            pal = ShopWidgetProvider.pal(m.theme);
        }
        @Override public void onDestroy() { rows.clear(); }
        @Override public int getCount() { return rows.size(); }
        @Override public RemoteViews getViewAt(int pos) { return pos < 0 || pos >= rows.size() ? null : ShopWidgetProvider.row(ctx, rows.get(pos), pal); }
        @Override public RemoteViews getLoadingView() { return null; }
        @Override public int getViewTypeCount() { return 1; }
        @Override public long getItemId(int pos) { return pos; }
        @Override public boolean hasStableIds() { return false; }
    }
}
