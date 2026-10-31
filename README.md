# GVC Shop

Gordeyville Customs shop app: the order board (Pipeline, Orders, Shop floor, Crew) as an Android app, plus a full-page home-screen widget.

**Install on your phone:** https://github.com/jackslinger6/gvc-shop/releases/latest/download/gvc-shop.apk

- Data lives in Supabase (`gvc_` tables in the time-invoice project), locked to signed-in shop members.
- The widget reads a read-only feed (`gvc_widget_feed`) with a key the app saves after you sign in.
- Every push to `main` builds a new APK with GitHub Actions and publishes it as the latest release.
- The APK is signed with `android/app/gvc-debug.keystore` so each build installs over the last one.

## Layout
- `www/index.html` - the board (web app inside the Android shell)
- `android/app/src/main/java/com/gordeyville/shop/` - `ShopWidgetProvider`, `ShopWidgetService`, `Feed` (widget) and `WidgetBridge` (app <-> widget)
- `supabase/setup.sql` - tables, policies and functions
