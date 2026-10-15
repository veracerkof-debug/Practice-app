package app.practice.beta;

import android.app.Service;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.PixelFormat;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.Switch;
import android.widget.TextView;
import org.json.JSONArray;
import org.json.JSONObject;

// Плавающая кнопка поверх других приложений (по разрешению «Поверх других приложений»): пока приложение свёрнуто
// и что-то звучит. Кнопку можно перетаскивать; касание раскрывает панель — пауза, каждый звучащий источник
// (громкость и вкл/выкл) и «Открыть». Состояние приходит со страницы (PlayerPlugin.state), нажатия уходят ей же.
public class FloatService extends Service {
    private static FloatService inst;
    private final Handler main = new Handler(Looper.getMainLooper());
    private WindowManager wm;
    private LinearLayout root, panel;
    private TextView bubble;
    private WindowManager.LayoutParams lp;
    private boolean open = false;

    @Override
    public IBinder onBind(Intent intent) { return null; }

    private int dp(float v) { return (int) TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v, getResources().getDisplayMetrics()); }

    static void refresh() {
        FloatService s = inst;
        if (s != null) s.main.post(s::build);
    }

    @Override
    public void onCreate() {
        super.onCreate();
        inst = this;
        wm = (WindowManager) getSystemService(WINDOW_SERVICE);
        root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        bubble = new TextView(this);
        bubble.setText("♪");
        bubble.setTextSize(TypedValue.COMPLEX_UNIT_SP, 24);
        bubble.setTextColor(Color.WHITE);
        bubble.setGravity(Gravity.CENTER);
        GradientDrawable bg = new GradientDrawable();
        bg.setShape(GradientDrawable.OVAL);
        bg.setColor(0xFF9C7242);
        bubble.setBackground(bg);
        bubble.setElevation(dp(6));
        root.addView(bubble, new LinearLayout.LayoutParams(dp(56), dp(56)));
        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        GradientDrawable pb = new GradientDrawable();
        pb.setCornerRadius(dp(18));
        pb.setColor(0xF7FBF9F5);
        panel.setBackground(pb);
        panel.setElevation(dp(8));
        panel.setPadding(dp(14), dp(10), dp(14), dp(12));
        panel.setVisibility(View.GONE);
        LinearLayout.LayoutParams plp = new LinearLayout.LayoutParams(dp(280), LinearLayout.LayoutParams.WRAP_CONTENT);
        plp.topMargin = dp(8);
        root.addView(panel, plp);

        int type = Build.VERSION.SDK_INT >= 26 ? WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY : WindowManager.LayoutParams.TYPE_PHONE;
        lp = new WindowManager.LayoutParams(WindowManager.LayoutParams.WRAP_CONTENT, WindowManager.LayoutParams.WRAP_CONTENT, type,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE | WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL, PixelFormat.TRANSLUCENT);
        lp.gravity = Gravity.TOP | Gravity.START;
        lp.x = dp(12);
        lp.y = dp(160);
        bubble.setOnTouchListener(new View.OnTouchListener() {
            float sx, sy; int ox, oy; boolean moved;
            @Override
            public boolean onTouch(View v, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN: sx = e.getRawX(); sy = e.getRawY(); ox = lp.x; oy = lp.y; moved = false; return true;
                    case MotionEvent.ACTION_MOVE:
                        float dx = e.getRawX() - sx, dy = e.getRawY() - sy;
                        if (Math.abs(dx) + Math.abs(dy) > dp(6)) moved = true;
                        lp.x = ox + (int) dx; lp.y = oy + (int) dy;
                        try { wm.updateViewLayout(root, lp); } catch (Exception ignored) { }
                        return true;
                    case MotionEvent.ACTION_UP:
                        if (!moved) { open = !open; build(); }
                        return true;
                }
                return false;
            }
        });
        try { wm.addView(root, lp); } catch (Exception e) { stopSelf(); return; }
        build();
    }

    private TextView text(String s, float sp, int color) {
        TextView t = new TextView(this);
        t.setText(s);
        t.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        t.setTextColor(color);
        return t;
    }

    private Button button(String s, Runnable fn) {
        Button b = new Button(this);
        b.setText(s);
        b.setAllCaps(false);
        b.setOnClickListener(v -> fn.run());
        return b;
    }

    // Панель — заново по состоянию со страницы
    private void build() {
        if (panel == null) return;
        panel.setVisibility(open ? View.VISIBLE : View.GONE);
        try { wm.updateViewLayout(root, lp); } catch (Exception ignored) { }
        if (!open) return;
        panel.removeAllViews();
        JSONObject st = PlayerPlugin.state;
        boolean playing = PlayerPlugin.playing();
        panel.addView(text(PlayerPlugin.label("title", "Melete"), 15, 0xFF1C1B1A));
        LinearLayout top = new LinearLayout(this);
        top.setOrientation(LinearLayout.HORIZONTAL);
        top.addView(button(playing ? PlayerPlugin.label("pause", "Pause") : PlayerPlugin.label("play", "Play"), () -> PlayerPlugin.emit("toggle", null, 0)),
            new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        top.addView(button(PlayerPlugin.label("open", "Open"), () -> {
            Intent i = getPackageManager().getLaunchIntentForPackage(getPackageName());
            if (i != null) { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); startActivity(i); }
        }), new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
        panel.addView(top);
        JSONArray src = st.optJSONArray("sources");
        if (src == null || src.length() == 0) { panel.addView(text(PlayerPlugin.label("none", ""), 13, 0xFF77736D)); return; }
        for (int i = 0; i < src.length(); i++) {
            JSONObject s = src.optJSONObject(i);
            if (s == null) continue;
            final String id = s.optString("id");
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            TextView name = text(s.optString("name", id), 14, 0xFF1C1B1A);
            row.addView(name, new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1));
            Switch sw = new Switch(this);
            sw.setChecked(s.optBoolean("on", true));
            sw.setOnCheckedChangeListener((b, on) -> PlayerPlugin.emit("on", id, on ? 1 : 0));
            row.addView(sw);
            panel.addView(row);
            SeekBar sb = new SeekBar(this);
            sb.setMax(150);
            sb.setProgress((int) Math.round(s.optDouble("vol", 1) * 100));
            sb.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
                @Override public void onProgressChanged(SeekBar b, int p, boolean user) { if (user) PlayerPlugin.emit("vol", id, p / 100.0); }
                @Override public void onStartTrackingTouch(SeekBar b) { }
                @Override public void onStopTrackingTouch(SeekBar b) { }
            });
            panel.addView(sb);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) { return START_NOT_STICKY; }

    @Override
    public void onDestroy() {
        inst = null;
        try { if (root != null) wm.removeView(root); } catch (Exception ignored) { }
        root = null; panel = null;
        super.onDestroy();
    }
}
