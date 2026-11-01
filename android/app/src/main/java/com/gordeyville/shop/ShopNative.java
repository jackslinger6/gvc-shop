package com.gordeyville.shop;

import android.Manifest;
import android.content.ContentResolver;
import android.content.Context;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.provider.ContactsContract;
import android.provider.Telephony;
import android.util.Base64;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Reads texts from picked contacts and records audio for the GVC Shop app. */
@CapacitorPlugin(
    name = "ShopNative",
    permissions = {
        @Permission(alias = "sms", strings = { Manifest.permission.READ_SMS, Manifest.permission.READ_CONTACTS }),
        @Permission(alias = "mic", strings = { Manifest.permission.RECORD_AUDIO }),
        @Permission(alias = "notify", strings = { "android.permission.POST_NOTIFICATIONS" })
    }
)
public class ShopNative extends Plugin {

    /** Last 10 digits of a phone number, or the raw address for short codes / emails. */
    static String key(String address) {
        if (address == null) return "";
        String d = address.replaceAll("[^0-9]", "");
        if (d.length() >= 10) return d.substring(d.length() - 10);
        return address.trim().toLowerCase();
    }

    private final Map<String, String> nameCache = new HashMap<>();

    private String contactName(String address) {
        if (address == null) return null;
        if (nameCache.containsKey(address)) return nameCache.get(address);
        String name = null;
        try {
            Uri uri = Uri.withAppendedPath(ContactsContract.PhoneLookup.CONTENT_FILTER_URI, Uri.encode(address));
            try (Cursor c = getContext().getContentResolver().query(uri, new String[] { ContactsContract.PhoneLookup.DISPLAY_NAME }, null, null, null)) {
                if (c != null && c.moveToFirst()) name = c.getString(0);
            }
        } catch (Exception ignored) {}
        nameCache.put(address, name);
        return name;
    }

    private boolean smsGranted() {
        return getPermissionState("sms") == PermissionState.GRANTED;
    }

    // ---------- texts ----------

    @PluginMethod
    public void smsSenders(PluginCall call) {
        if (!smsGranted()) { requestPermissionForAlias("sms", call, "smsSendersCb"); return; }
        doSenders(call);
    }

    @PermissionCallback
    private void smsSendersCb(PluginCall call) {
        if (smsGranted()) doSenders(call); else call.reject("SMS permission not granted");
    }

    private void doSenders(PluginCall call) {
        long since = System.currentTimeMillis() - 60L * 86400000L;
        LinkedHashMap<String, JSObject> out = new LinkedHashMap<>();
        ContentResolver cr = getContext().getContentResolver();
        try (Cursor c = cr.query(Telephony.Sms.CONTENT_URI, new String[] { "address", "date" }, "date > ?", new String[] { String.valueOf(since) }, "date DESC")) {
            while (c != null && c.moveToNext() && out.size() < 60) {
                String addr = c.getString(0);
                String k = key(addr);
                if (k.isEmpty() || out.containsKey(k)) continue;
                JSObject o = new JSObject();
                o.put("key", k);
                o.put("address", addr);
                String n = contactName(addr);
                if (n != null) o.put("name", n);
                o.put("last", c.getLong(1));
                out.put(k, o);
            }
        } catch (Exception e) { call.reject("Couldn't read texts: " + e.getMessage()); return; }
        JSArray arr = new JSArray();
        for (JSObject o : out.values()) arr.put(o);
        JSObject r = new JSObject();
        r.put("senders", arr);
        call.resolve(r);
    }

    @PluginMethod
    public void smsSince(PluginCall call) {
        if (!smsGranted()) { requestPermissionForAlias("sms", call, "smsSinceCb"); return; }
        doSince(call);
    }

    @PermissionCallback
    private void smsSinceCb(PluginCall call) {
        if (smsGranted()) doSince(call); else call.reject("SMS permission not granted");
    }

    private void doSince(PluginCall call) {
        long since = call.getLong("since", System.currentTimeMillis() - 2L * 86400000L);
        Set<String> keys = new HashSet<>();
        try {
            JSArray a = call.getArray("addresses", new JSArray());
            for (int i = 0; i < a.length(); i++) keys.add(key(a.getString(i)));
        } catch (Exception ignored) {}
        JSArray arr = new JSArray();
        try (Cursor c = getContext().getContentResolver().query(Telephony.Sms.CONTENT_URI,
                new String[] { "_id", "address", "body", "date", "type" }, "date > ?", new String[] { String.valueOf(since) }, "date ASC")) {
            int n = 0;
            while (c != null && c.moveToNext() && n < 300) {
                String addr = c.getString(1);
                String k = key(addr);
                if (!keys.contains(k)) continue;
                int type = c.getInt(4);
                if (type != Telephony.Sms.MESSAGE_TYPE_INBOX && type != Telephony.Sms.MESSAGE_TYPE_SENT) continue;
                JSObject o = new JSObject();
                o.put("id", c.getLong(0));
                o.put("key", k);
                o.put("address", addr);
                String nm = contactName(addr);
                if (nm != null) o.put("name", nm);
                o.put("body", c.getString(2));
                o.put("date", c.getLong(3));
                o.put("sent", type == Telephony.Sms.MESSAGE_TYPE_SENT);
                arr.put(o);
                n++;
            }
        } catch (Exception e) { call.reject("Couldn't read texts: " + e.getMessage()); return; }
        JSObject r = new JSObject();
        r.put("messages", arr);
        call.resolve(r);
    }

    // ---------- recording ----------

    @PluginMethod
    public void recStart(PluginCall call) {
        if (getPermissionState("mic") != PermissionState.GRANTED) { requestPermissionForAlias("mic", call, "recStartCb"); return; }
        doStart(call);
    }

    @PermissionCallback
    private void recStartCb(PluginCall call) {
        if (getPermissionState("mic") == PermissionState.GRANTED) doStart(call); else call.reject("Microphone permission not granted");
    }

    private void doStart(PluginCall call) {
        if (Build.VERSION.SDK_INT >= 33 && getPermissionState("notify") != PermissionState.GRANTED) {
            // Ask once so the "Recording" notification is visible; recording works either way.
            requestPermissionForAlias("notify", call, "notifyCb");
            return;
        }
        startService(call);
    }

    @PermissionCallback
    private void notifyCb(PluginCall call) { startService(call); }

    private void startService(PluginCall call) {
        try {
            Context ctx = getContext();
            Intent i = new Intent(ctx, RecorderService.class);
            if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(i); else ctx.startService(i);
            call.resolve();
        } catch (Exception e) { call.reject("Couldn't start recording: " + e.getMessage()); }
    }

    @PluginMethod
    public void recStop(PluginCall call) {
        getBridge().execute(() -> {
            try {
                String path = RecorderService.stopRecording(getContext());
                if (path == null) { call.reject("Not recording"); return; }
                File f = new File(path);
                byte[] buf = new byte[(int) f.length()];
                try (FileInputStream in = new FileInputStream(f)) {
                    int off = 0, r;
                    while (off < buf.length && (r = in.read(buf, off, buf.length - off)) > 0) off += r;
                }
                JSObject o = new JSObject();
                o.put("base64", Base64.encodeToString(buf, Base64.NO_WRAP));
                o.put("ms", RecorderService.lastDurationMs);
                o.put("bytes", buf.length);
                f.delete();
                call.resolve(o);
            } catch (Exception e) { call.reject("Couldn't stop recording: " + e.getMessage()); }
        });
    }

    @PluginMethod
    public void recStatus(PluginCall call) {
        JSObject o = new JSObject();
        o.put("on", RecorderService.isRecording());
        o.put("startedAt", RecorderService.startedAt);
        call.resolve(o);
    }
}
