package app.practice.beta;

import android.app.PictureInPictureParams;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.Rational;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        CrashLog.install(this); // причина падения — в «Отчёт о проблеме»
        // Свои плагины регистрируются до запуска моста
        registerPlugin(VolumePlugin.class);
        registerPlugin(PulsePlugin.class);
        registerPlugin(ClockPlugin.class);
        registerPlugin(ReportPlugin.class);
        registerPlugin(KeepAlivePlugin.class);
        registerPlugin(GuardPlugin.class);
        registerPlugin(SharePlugin.class);
        registerPlugin(FolderPlugin.class);
        registerPlugin(VoicePlugin.class);
        registerPlugin(IconPlugin.class);
        registerPlugin(MidiPlugin.class);
        registerPlugin(PlayerPlugin.class);
        super.onCreate(savedInstanceState);
        // Масштаб интерфейса (Оформление → Размер): ширина области просмотра из meta viewport
        // и подгонка по ширине экрана (иначе раскладка шире экрана вылезает за край)
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setUseWideViewPort(true);
            getBridge().getWebView().getSettings().setLoadWithOverviewMode(true);
            // долгое касание без вибрации: на инструментах держат клавиши и пэды. Выделение и меню «копировать»
            // не отключаются целиком: в полях ввода (текст и аккорды песни, заметки) их дают выделить, вырезать,
            // вставить; в остальных местах их убирают стили (user-select: none) и guard.js (contextmenu)
            getBridge().getWebView().setHapticFeedbackEnabled(false);
        }
    }

    // Видно ли приложение (в том числе всплывающим окном): плавающая кнопка нужна, только когда оно скрыто
    static volatile boolean visible = false;

    @Override
    public void onStart() { super.onStart(); visible = true; }

    @Override
    public void onStop() { super.onStop(); visible = false; }

    // Всплывающее окно («картинка в картинке»): ушли на рабочий стол, пока открыт инструмент и что-то звучит
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (Build.VERSION.SDK_INT < 26 || !PlayerPlugin.pipAllowed) return;
        try {
            double a = Math.max(0.45, Math.min(2.3, PlayerPlugin.aspect));
            enterPictureInPictureMode(new PictureInPictureParams.Builder().setAspectRatio(new Rational((int) Math.round(a * 1000), 1000)).build());
        } catch (Exception ignored) { }
    }

    @Override
    public void onPictureInPictureModeChanged(boolean in, Configuration cfg) {
        super.onPictureInPictureModeChanged(in, cfg);
        PlayerPlugin.pipChanged(in);
    }
}
