package com.gordeyville.shop;

import android.os.Bundle;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(WidgetBridge.class);
        registerPlugin(ShopNative.class);
        super.onCreate(savedInstanceState);
        // Phone Back button: step back one screen in the app (drawing -> parts list -> job -> closed -> Home).
        // Only when there's nothing left to go back to does the app go to the background (it isn't closed).
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                if (getBridge() == null || getBridge().getWebView() == null) { moveTaskToBack(true); return; }
                getBridge().getWebView().evaluateJavascript(
                    "(function(){try{return window.gvcBack&&window.gvcBack()?'1':'0'}catch(e){return '0'}})()",
                    v -> { if (!"\"1\"".equals(v)) moveTaskToBack(true); });
            }
        });
    }
}
