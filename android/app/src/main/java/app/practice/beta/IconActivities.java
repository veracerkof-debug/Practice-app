package app.practice.beta;

import android.app.Activity;
import android.content.Intent;
import android.os.Bundle;

// Ярлыки иконки на выбор (AndroidManifest.xml): включён ровно один; открывает приложение и сразу закрывается.
// Каждый ярлык — свой класс, потому что одна activity не может быть объявлена в манифесте дважды.
public final class IconActivities {
    private IconActivities() {}

    public static class Base extends Activity {
        @Override
        protected void onCreate(Bundle b) {
            super.onCreate(b);
            Intent i = new Intent(this, MainActivity.class);
            i.setAction(Intent.ACTION_MAIN);
            i.addCategory(Intent.CATEGORY_LAUNCHER);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_RESET_TASK_IF_NEEDED);
            startActivity(i);
            finish();
            overridePendingTransition(0, 0);
        }
    }
}
