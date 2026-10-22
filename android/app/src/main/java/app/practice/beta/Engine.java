package app.practice.beta;

import java.io.File;

// Движок разделения для плагина Stems: Demucs (4/6 дорожек — теперь только компьютер) и Mdx (вокал и инструментал на
// телефоне). Вход — два файла float32 LE (левый, правый), выход — по файлу <часть>.f32 с чередованием L R.
public interface Engine {
    interface Progress { void at(double frac); }
    void separate(File inL, File inR, long total, File outDir, Progress progress, boolean hq) throws Exception;
    String[] parts();
    void cancel();
    void close();
}
