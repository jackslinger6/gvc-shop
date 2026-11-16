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
        if (i == null || !(i.hasExtra(Feed.EXTRA_TAB) || i.hasExtra(ShopWidgetProvider.EXTRA_LINK))) return;
        JSObject o = new JSObject();
        o.put("tab", i.getStringExtra(Feed.EXTRA_TAB));
        o.put("job", i.getStringExtra(Feed.EXTRA_JOB));
        if (i.hasExtra("gvc_act")) o.put("act", i.getStringExtra("gvc_act"));
        // widget redesign (Nov 15): the exact thing the card / button points at (see www/widget.js gvcWidgetLink)
        if (i.hasExtra(ShopWidgetProvider.EXTRA_LINK)) o.put("link", i.getStringExtra(ShopWidgetProvider.EXTRA_LINK));
        i.removeExtra("gvc_act");
        i.removeExtra(Feed.EXTRA_TAB);
        i.removeExtra(Feed.EXTRA_JOB);
        i.removeExtra(ShopWidgetProvider.EXTRA_LINK);
        notifyListeners("launch", o, true);
    }

    /** The app's snapshot for the widget: who's signed in on this phone and their own list (www/widget.js).
     *  Kept on the phone only. Redraws the widget (no server call). */
    @PluginMethod
    public void setState(PluginCall call) {
        String json = call.getString("json", "");
        SharedPreferences p = getContext().getSharedPreferences(Feed.PREFS, 0);
        p.edit().putString(ShopWidgetProvider.P_SNAP, json).apply();
        ShopWidgetProvider.refreshAll(getContext(), false);
        call.resolve();
    }

    /** Saves the read-only feed key the widget uses, then refreshes the widget. */
    @PluginMethod
    public void setKey(PluginCall call) {
        String key = call.getString("key", "");
        SharedPreferences p = getContext().getSharedPreferences(Feed.PREFS, 0);
        p.edit().putString(Feed.PREF_KEY, key).putLong(Feed.PREF_FETCHED, 0).apply();
        // (the snapshot is replaced by the app as soon as it knows who signed in - widget.js; signOut clears it)
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
        // signed out: forget everything the widget had - it shows "Sign in" until someone signs in again
        p.edit().remove(Feed.PREF_KEY).remove(Feed.PREF_CACHE).remove(ShopWidgetProvider.P_SNAP).remove(ShopWidgetProvider.P_ERR).remove(ShopWidgetProvider.P_OK_AT).apply();
        ShopWidgetProvider.refreshAll(getContext(), true);
        call.resolve();
    }
}
