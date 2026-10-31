package com.gordeyville.shop;

import android.content.Intent;
import android.content.SharedPreferences;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/** Small bridge between the web board and the home-screen widget. */
@CapacitorPlugin(name = "WidgetBridge")
public class WidgetBridge extends Plugin {

    @Override
    public void load() {
        Intent i = getActivity() != null ? getActivity().getIntent() : null;
        sendLaunch(i);
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        sendLaunch(intent);
    }

    private void sendLaunch(Intent i) {
        if (i == null || !i.hasExtra(Feed.EXTRA_TAB)) return;
        JSObject o = new JSObject();
        o.put("tab", i.getStringExtra(Feed.EXTRA_TAB));
        o.put("job", i.getStringExtra(Feed.EXTRA_JOB));
        i.removeExtra(Feed.EXTRA_TAB);
        i.removeExtra(Feed.EXTRA_JOB);
        notifyListeners("launch", o, true);
    }

    /** Saves the read-only feed key the widget uses, then refreshes the widget. */
    @PluginMethod
    public void setKey(PluginCall call) {
        String key = call.getString("key", "");
        SharedPreferences p = getContext().getSharedPreferences(Feed.PREFS, 0);
        p.edit().putString(Feed.PREF_KEY, key).putLong(Feed.PREF_FETCHED, 0).apply();
        ShopWidgetProvider.refreshAll(getContext(), true);
        call.resolve();
    }

    /** Called after any change in the app so the widget shows it right away. */
    @PluginMethod
    public void refresh(PluginCall call) {
        ShopWidgetProvider.refreshAll(getContext(), true);
        call.resolve();
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(Feed.PREFS, 0);
        p.edit().remove(Feed.PREF_KEY).remove(Feed.PREF_CACHE).apply();
        ShopWidgetProvider.refreshAll(getContext(), true);
        call.resolve();
    }
}
