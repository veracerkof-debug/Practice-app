package app.practice.beta;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Свои плагины регистрируются до запуска моста
        registerPlugin(VolumePlugin.class);
        registerPlugin(PulsePlugin.class);
        registerPlugin(ClockPlugin.class);
        registerPlugin(ReportPlugin.class);
        registerPlugin(KeepAlivePlugin.class);
        registerPlugin(GuardPlugin.class);
        super.onCreate(savedInstanceState);
        // Масштаб интерфейса (Оформление → Размер): ширина области просмотра из meta viewport
        // и подгонка по ширине экрана (иначе раскладка шире экрана вылезает за край)
        if (getBridge() != null && getBridge().getWebView() != null) {
            getBridge().getWebView().getSettings().setUseWideViewPort(true);
            getBridge().getWebView().getSettings().setLoadWithOverviewMode(true);
            // долгое касание — не меню выделения и не вибрация: на инструментах держат клавиши и пэды
            getBridge().getWebView().setLongClickable(false);
            getBridge().getWebView().setOnLongClickListener(v -> true);
            getBridge().getWebView().setHapticFeedbackEnabled(false);
        }
    }
}
